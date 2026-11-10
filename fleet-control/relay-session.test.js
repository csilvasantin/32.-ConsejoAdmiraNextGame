'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRelaySessionBridge, clearRelaySessionCookie } = require('./relay-session');
const { isPrivateServeRequest } = require('./private-network');
const { ACTIVE, REVOKED, UNAVAILABLE } = require('./session-registry');
const { createSessionCodec } = require('./session-token');

const PUBLIC = 'https://www.admira.live', OTHER_ALLOWED = 'https://admira.live';
function fixture(opts = {}) {
  let clock = 1000000;
  const codec = createSessionCodec({ secret: Buffer.alloc(32, 4), ttlMs: 3600000, now: () => clock });
  const token = codec.mint('human@example.test');
  const session = codec.verify(token);
  let state = ACTIVE;
  const checked = [];
  const bridge = createRelaySessionBridge({
    allowOrigins: [PUBLIC, OTHER_ALLOWED], now: () => clock,
    isPrivateRequest: isPrivateServeRequest,
    sessionState: async (value) => {
      checked.push(value);
      if (opts.check) await opts.check();
      return { state, session: codec.verify(value) };
    },
    ...opts,
  });
  const req = (overrides = {}) => ({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: {
    origin: PUBLIC, 'x-fleet-csrf': session.csrf, 'tailscale-user-login': 'tailnet@example.test', ...overrides,
  } });
  return {
    bridge, req, token, session, checked,
    issue: (request = req(), auth = { state: ACTIVE, session }) => bridge.issue(request, token, auth),
    tick: (ms) => { clock += ms; }, setState: (next) => { state = next; },
  };
}

test('ticket is opaque; redemption copies the original signed session only to a partitioned HttpOnly cookie', async () => {
  const f = fixture();
  const issued = f.issue();
  assert.equal(issued.status, 200);
  assert.deepEqual(Object.keys(issued.body).sort(), ['ok', 'ticket']);
  assert.match(issued.body.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(issued.body).includes(f.token), false);
  assert.equal(issued.cookie, undefined);
  f.tick(1000);
  const result = await f.bridge.consume(f.req(), issued.body.ticket);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(JSON.stringify(result.body).includes(f.token), false);
  assert.match(result.cookie, new RegExp('^__Host-fleet_session=' + encodeURIComponent(f.token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ';'));
  assert.match(result.cookie, /Path=\/; Max-Age=3599; HttpOnly; Secure; SameSite=None; Partitioned$/);
  assert.deepEqual(f.checked, [f.token]);
});

test('issue rejects agents, readOnly, revoked/unavailable sessions, missing Origin and CSRF', () => {
  const f = fixture();
  for (const auth of [null, { state: REVOKED, session: f.session }, { state: ACTIVE, session: f.session, agent: true }, { state: ACTIVE, session: f.session, readOnly: true }]) {
    assert.equal(f.issue(f.req(), auth).status, 403);
  }
  assert.equal(f.issue(f.req(), { state: UNAVAILABLE, session: f.session }).status, 503);
  for (const headers of [{ origin: '' }, { origin: 'https://evil.example' }, { 'x-fleet-csrf': '' }, { 'x-fleet-csrf': 'wrong' }]) assert.equal(f.issue(f.req(headers)).status, 403);
  const get = f.req(); get.method = 'GET';
  assert.equal(f.issue(get).status, 405);
});

test('tickets expire after 30 seconds and cannot outlive the signed session', async () => {
  const f = fixture();
  const ticket = f.issue().body.ticket;
  f.tick(30000);
  assert.equal((await f.bridge.consume(f.req(), ticket)).status, 401);
  const g = fixture();
  g.tick(3599000);
  const last = g.issue().body.ticket;
  g.tick(1000);
  assert.equal((await g.bridge.consume(g.req(), last)).status, 401);
  assert.equal(g.issue().status, 401);
});

test('replay and parallel consumption only permit one redemption', async () => {
  let unblock;
  const blocked = new Promise((resolve) => { unblock = resolve; });
  const f = fixture({ check: () => blocked });
  const ticket = f.issue().body.ticket;
  const first = f.bridge.consume(f.req(), ticket);
  assert.equal((await f.bridge.consume(f.req(), ticket)).status, 401);
  unblock();
  assert.equal((await first).status, 200);
  assert.equal((await f.bridge.consume(f.req(), ticket)).status, 401);
});

test('redemption requires exact issue Origin and trusted local Serve, never public/raw LAN or XFF', async () => {
  const f = fixture();
  let ticket = f.issue().body.ticket;
  assert.equal((await f.bridge.consume(f.req({ origin: OTHER_ALLOWED }), ticket)).status, 403);
  assert.equal(f.checked.length, 0);
  ticket = f.issue().body.ticket;
  for (const headers of [{ origin: 'https://evil.example' }, { origin: '' }, { 'tailscale-user-login': '' }]) {
    assert.equal((await f.bridge.consume(f.req(headers), ticket)).status, 403);
  }
  const rawLan = f.req({ 'x-forwarded-for': '127.0.0.1' }); rawLan.socket.remoteAddress = '192.168.1.5';
  assert.equal((await f.bridge.consume(rawLan, ticket)).status, 403);
  assert.equal(f.checked.length, 0);
  assert.equal((await f.bridge.consume(f.req(), ticket)).status, 200);
});

test('revocation, registry outage and expiry during a slow check fail closed and consume the ticket', async () => {
  for (const [state, status] of [[REVOKED, 401], [UNAVAILABLE, 503]]) {
    const f = fixture();
    const ticket = f.issue().body.ticket;
    f.setState(state);
    const result = await f.bridge.consume(f.req(), ticket);
    assert.equal(result.status, status);
    assert.equal(result.cookie, undefined);
    f.setState(ACTIVE);
    assert.equal((await f.bridge.consume(f.req(), ticket)).status, 401);
  }
  let f;
  f = fixture({ check: () => f.tick(30000) });
  const ticket = f.issue().body.ticket;
  const result = await f.bridge.consume(f.req(), ticket);
  assert.equal(result.status, 401);
  assert.equal(result.cookie, undefined);
});

test('the store is bounded, expired entries are reclaimed and malformed tickets never reach registry', async () => {
  const f = fixture({ maxTickets: 2 });
  assert.equal(f.issue().status, 200);
  assert.equal(f.issue().status, 200);
  assert.equal(f.issue().status, 503);
  f.tick(30000);
  assert.equal(f.issue().status, 200);
  for (const ticket of ['', null, {}, 'bad', 'x'.repeat(44)]) assert.equal((await f.bridge.consume(f.req(), ticket)).status, 401);
  assert.equal(f.checked.length, 0);
});

test('server routes retain the human gate/CSRF and keep the normal public cookie Lax', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const issuer = src.slice(src.indexOf("if (url === '/api/auth/relay-ticket' &&"), src.indexOf("if (url === '/api/auth/relay-ticket/consume' &&"));
  assert.match(issuer, /await gate\(req, res, ip\)/);
  assert.match(issuer, /!req\.fleetSession \|\| req\.fleetAgent/);
  assert.match(issuer, /\.issue\(req, sessionFromReq\(req\)/);
  assert.doesNotMatch(issuer, /mintSession|mintClaims|mint\(/);
  const consume = src.slice(src.indexOf("if (url === '/api/auth/relay-ticket/consume' &&"), src.indexOf("if (url === '/api/auth/relay-ticket' ||"));
  assert.match(consume, /isPrivateServeRequest\(req\)/);
  assert.match(consume, /readRawBody\(req, 2048\)/);
  assert.match(consume, /json\(res, result\.status, result\.body\)/);
  assert.match(src, /function setSessionCookie\([^\n]+SameSite=Lax/);
  assert.doesNotMatch(src.match(/function setSessionCookie\([^\n]+/)[0], /Partitioned|None/);
});

test('logout expires both ordinary and partitioned session cookies without changing ordinary issuance', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = src.indexOf('function clearSessionCookie(res) {');
  const end = src.indexOf('function setChallengeCookie', start);
  const cookies = [];
  const clear = new Function('appendSetCookie', 'SESSION_COOKIE', 'clearRelaySessionCookie', src.slice(start, end) + '\nreturn clearSessionCookie;')(
    (_res, value) => cookies.push(value), '__Host-fleet_session', clearRelaySessionCookie
  );
  clear({});
  assert.deepEqual(cookies, [
    '__Host-fleet_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    '__Host-fleet_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned',
  ]);
});
