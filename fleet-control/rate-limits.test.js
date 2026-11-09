'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFleetRateLimits, createWindowLimiter, isInteractiveEndpoint } = require('./rate-limits');
const { sessionMutationError } = require('./session-csrf');
const { ACTIVE, REVOKED, UNAVAILABLE } = require('./session-registry');

const ORIGIN = 'https://www.admira.live';
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const gateSource = serverSource.slice(serverSource.indexOf('async function gate(req, res, ip, allowToken) {'), serverSource.indexOf('function readBody(req) {'));

function harness() {
  let clock = 0;
  const limits = createFleetRateLimits({ now: () => clock });
  const sessions = {
    human: { state: ACTIVE, session: { jti: 'human-jti', csrf: 'human-csrf' } },
    human2: { state: ACTIVE, session: { jti: 'other-jti', csrf: 'other-csrf' } },
    revoked: { state: REVOKED, session: null },
    outage: { state: UNAVAILABLE, session: null },
  };
  // Execute the server's actual gate with a fake session registry and clock.
  // The rate limiter and CSRF checker are the production implementations.
  const gate = new Function('deps', `
    const {sessionState,sessionFromReq,ACTIVE,UNAVAILABLE,sessionMutationError,ALLOW_ORIGINS,
      rateLimited,_rateLimits,audit,json,agentFromReq,agentDenied,authed}=deps;
    const _recentFails=[]; const tarpitMs=()=>0;
    ${gateSource}
    return gate;
  `)({
    sessionState: async (token) => sessions[token] || { state: REVOKED, session: null },
    sessionFromReq: (req) => req.token, ACTIVE, UNAVAILABLE, sessionMutationError,
    ALLOW_ORIGINS: [ORIGIN], rateLimited: limits.publicLimited, _rateLimits: limits,
    audit: () => {}, json: (res, status, body) => { res.status = status; res.body = body; },
    agentFromReq: (req) => req.token === 'agent' ? { name: 'ReadOnlyAgent' } : null,
    agentDenied: () => true, authed: () => false,
  });
  return {
    at: (ms) => { clock = ms; }, limits,
    request: async (url, token = 'human', headers = {}) => {
      const method = url === '/api/input' ? 'POST' : 'GET';
      const req = { url, method, token, headers: { origin: ORIGIN, 'x-fleet-csrf': sessions[token] && sessions[token].session && sessions[token].session.csrf, ...headers } };
      req.fleetInteractive = isInteractiveEndpoint(url, method);
      if (!req.fleetInteractive && limits.publicLimited('same-proxy-ip')) return 429;
      const res = {};
      const allowed = await gate(req, res, 'same-proxy-ip');
      return allowed ? 200 : res.status;
    },
  };
}

test('6fps and 22 input events/s remain usable for 120 seconds without starving auth/status', async () => {
  const h = harness();
  for (let second = 0; second < 120; second++) {
    for (let event = 0; event < 28; event++) {
      h.at(second * 1000 + event * (1000 / 28));
      assert.equal(await h.request(event < 6 ? '/api/live/frame' : '/api/input'), 200, `second=${second} event=${event}`);
    }
    assert.equal(await h.request('/api/auth/session'), 200, `auth second=${second}`);
    assert.equal(await h.request('/api/status'), 200, `status second=${second}`);
  }
});

test('30fps plus 22 input events/s fit the bounded human budget for over a minute', async () => {
  const h = harness();
  for (let event = 0; event < 52 * 75; event++) {
    h.at(event * (1000 / 52));
    assert.equal(await h.request(event % 52 < 30 ? '/api/live/frame' : '/api/input'), 200);
  }
});

test('interactive excess is limited by session jti and cannot consume public or another session budgets', async () => {
  const h = harness();
  for (let i = 0; i < 3600; i++) assert.equal(await h.request('/api/live/frame'), 200);
  assert.equal(await h.request('/api/input'), 429);
  assert.equal(await h.request('/api/live/frame', 'human2'), 200);
  assert.equal(await h.request('/api/auth/session'), 200);
  assert.equal(await h.request('/api/status'), 200);
  h.at(60000);
  assert.equal(await h.request('/api/live/frame'), 200);
});

test('anonymous, revoked, read-only and unavailable interactive attempts retain public300/min enforcement', async () => {
  for (const [token, expected] of [['anonymous', 401], ['revoked', 401], ['agent', 403], ['outage', 503]]) {
    const h = harness();
    for (let i = 0; i < 300; i++) assert.equal(await h.request('/api/live/frame', token), expected);
    assert.equal(await h.request('/api/live/frame', token), 429);
    assert.equal(await h.request('/api/status'), 429);
    // Public abuse doesn't disable an already authenticated control session.
    assert.equal(await h.request('/api/live/frame'), 200);
    h.at(60000);
    assert.equal(await h.request('/api/status'), 200);
  }
});

test('active human requests with bad Origin or CSRF use public budget rather than interactive quota', async () => {
  for (const headers of [{ 'x-fleet-csrf': '' }, { 'x-fleet-csrf': 'wrong' }, { origin: 'https://evil.example' }]) {
    const h = harness();
    for (let i = 0; i < 300; i++) assert.equal(await h.request('/api/input', 'human', headers), 403);
    assert.equal(await h.request('/api/input', 'human', headers), 429);
    assert.equal(await h.request('/api/input'), 200);
  }
});

test('only actual GET frame and POST input routes defer the original public limiter', () => {
  assert.equal(isInteractiveEndpoint('/api/live/frame', 'GET'), true);
  assert.equal(isInteractiveEndpoint('/api/input', 'POST'), true);
  for (const [url, method] of [['/api/status', 'GET'], ['/api/auth/session', 'GET'], ['/api/live/frame/extra', 'GET'], ['/api/input', 'GET'], ['/api/live/frame', 'POST'], ['/api/run', 'POST']]) assert.equal(isInteractiveEndpoint(url, method), false);
  assert.match(serverSource, /req\.fleetInteractive = isInteractiveEndpoint\(url, req\.method\);\s*if \(!req\.fleetInteractive && rateLimited\(ip\)\)/);
});

test('bounded sliding limiter preserves public decisions and refuses fresh keys instead of evicting live budgets', () => {
  let clock = 0;
  const limiter = createWindowLimiter({ limit: 3, windowMs: 60000, maxKeys: 2, now: () => clock });
  let naive = [];
  for (let i = 0; i < 10000; i++) {
    clock = i * 30;
    naive = naive.filter((time) => clock - time < 60000); naive.push(clock);
    assert.equal(limiter.limited('existing'), naive.length > 3);
  }
  assert.equal(limiter.limited('second'), false);
  assert.equal(limiter.limited('third'), true);
  assert.equal(limiter.limited('existing'), true);
  clock += 60000;
  assert.equal(limiter.limited('third'), false);
  assert.equal(limiter.limited(''), true);
});
