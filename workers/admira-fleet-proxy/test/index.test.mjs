import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { createFleetProxy, headersToHub } from '../src/index.js';

const relay = { id: 'test-relay', base: 'https://relay.invalid/fleet' };

test('forwards exact allowlisted Origin and challenge Cookie to the hub', async () => {
  let forwarded;
  const proxy = createFleetProxy({
    relays: [relay],
    fetchImpl: async (url, init) => {
      forwarded = { url, init };
      const headers = new Headers({
        'Content-Type': 'application/json',
        Vary: 'Accept-Encoding',
      });
      headers.append('Set-Cookie', '__Host-fleet_challenge=one; Secure; HttpOnly; Path=/');
      headers.append('Set-Cookie', '__Host-fleet_session=two; Secure; HttpOnly; Path=/');
      return new Response('{"ok":true}', { status: 200, headers });
    },
  });

  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: 'https://www.admira.live',
      Cookie: '__Host-fleet_challenge=one',
      'Content-Type': 'application/json',
      'X-Fleet-CSRF': 'csrf-value-1234567890',
      'X-Not-Allowlisted': 'must-not-pass',
    },
    body: '{"state":"state"}',
  }));

  assert.equal(forwarded.url, 'https://relay.invalid/fleet/api/auth/login');
  assert.equal(forwarded.init.headers.get('Origin'), 'https://www.admira.live');
  assert.equal(forwarded.init.headers.get('Cookie'), '__Host-fleet_challenge=one');
  assert.equal(forwarded.init.headers.get('Content-Type'), 'application/json');
  assert.equal(forwarded.init.headers.get('X-Fleet-CSRF'), 'csrf-value-1234567890');
  assert.equal(forwarded.init.headers.get('Authorization'), null);
  assert.equal(forwarded.init.headers.get('X-Not-Allowlisted'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://www.admira.live');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.deepEqual(response.headers.get('Vary').split(',').map((value) => value.trim()), ['Accept-Encoding', 'Origin']);
  assert.deepEqual(response.headers.getSetCookie(), [
    '__Host-fleet_challenge=one; Secure; HttpOnly; Path=/',
    '__Host-fleet_session=two; Secure; HttpOnly; Path=/',
  ]);
});

test('does not synthesize or forward untrusted, wildcard, or missing Origin', () => {
  for (const origin of ['https://evil.example', '*', null]) {
    const headers = new Headers({ Cookie: '__Host-fleet_session=value' });
    if (origin !== null) headers.set('Origin', origin);
    const outgoing = headersToHub(new Request('https://fleet.admira.live/api/auth/session', { headers }));
    assert.equal(outgoing.get('Origin'), null);
    assert.equal(outgoing.get('Cookie'), null);
  }
});

test('mutating Cookie auth fails at edge without exact Origin and CSRF', async () => {
  let hubCalls = 0;
  const proxy = createFleetProxy({relays:[relay], fetchImpl:async () => { hubCalls += 1; return new Response('unexpected'); }});
  const cases = [
    {headers:{Cookie:'__Host-fleet_session=value'}},
    {headers:{Origin:'https://evil.example', Cookie:'__Host-fleet_session=value', 'X-Fleet-CSRF':'csrf-value-1234567890'}},
    {headers:{Origin:'https://www.admira.live', Cookie:'__Host-fleet_session=value'}},
    {headers:{Origin:'https://www.admira.live', Cookie:'__Host-fleet_session=value', 'X-Fleet-CSRF':'short'}},
  ];
  for (const item of cases) {
    const response = await proxy.fetch(new Request('https://fleet.admira.live/api/action', {method:'POST', headers:item.headers, body:'{}'}));
    assert.equal(response.status, 403);
  }
  assert.equal(hubCalls, 0);
});

test('exact Origin Cookie and CSRF reaches hub; machine token without Cookie remains separate', async () => {
  const seen = [];
  const proxy = createFleetProxy({relays:[relay], fetchImpl:async (_url, init) => { seen.push(init.headers); return Response.json({ok:true}); }});
  const browser = await proxy.fetch(new Request('https://fleet.admira.live/api/action', {
    method:'POST', headers:{Origin:'https://www.admira.live', Cookie:'__Host-fleet_session=value', 'X-Fleet-CSRF':'csrf-value-1234567890'}, body:'{}'
  }));
  const machine = await proxy.fetch(new Request('https://fleet.admira.live/api/register', {
    method:'POST', headers:{'X-Fleet-Token':'machine-token'}, body:'{}'
  }));
  assert.equal(browser.status, 200);
  assert.equal(machine.status, 200);
  assert.equal(seen[0].get('Cookie'), '__Host-fleet_session=value');
  assert.equal(seen[0].get('X-Fleet-CSRF'), 'csrf-value-1234567890');
  assert.equal(seen[1].get('Cookie'), null);
  assert.equal(seen[1].get('X-Fleet-Token'), 'machine-token');
});

test('opaque GIS handoff preserves literal null but strips every credential header', async () => {
  let forwarded;
  const proxy = createFleetProxy({relays:[relay], fetchImpl:async (_url, init) => { forwarded = init.headers; return Response.json({ok:true}); }});
  const code = 'a'.repeat(43);
  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/handoff', {
    method:'POST',
    headers:{Origin:'null', Cookie:'__Host-fleet_session=stale', 'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code}).toString()
  }));
  assert.equal(response.status, 200);
  assert.equal(forwarded.get('Origin'), 'null');
  assert.equal(forwarded.get('Cookie'), null);
  assert.equal(forwarded.get('Authorization'), null);
  assert.equal(forwarded.get('X-Fleet-Session'), null);
});

test('www GIS handoff with stale Cookie reaches hub without Cookie or CSRF', async () => {
  let forwarded;
  const proxy = createFleetProxy({relays:[relay], fetchImpl:async (_url, init) => { forwarded = init.headers; return Response.json({ok:true}); }});
  const code = 'b'.repeat(43);
  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/handoff', {
    method:'POST',
    headers:{Origin:'https://www.admira.live', Cookie:'__Host-fleet_session=stale', 'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code}).toString()
  }));
  assert.equal(response.status, 200);
  assert.equal(forwarded.get('Origin'), 'https://www.admira.live');
  assert.equal(forwarded.get('Cookie'), null);
  assert.equal(forwarded.get('X-Fleet-CSRF'), null);
});

test('opaque handoff malformed or with auth, and missing/malicious Origin, die before hub', async () => {
  let hubCalls = 0;
  const proxy = createFleetProxy({relays:[relay], fetchImpl:async () => { hubCalls += 1; return Response.json({ok:true}); }});
  const cases = [
    {origin:'null', body:'code=short'},
    {origin:'null', body:'code=' + 'a'.repeat(43), authorization:'Bearer no'},
    {origin:'https://www.admira.live', body:'code=short'},
    {origin:'https://www.admira.live', body:'code=' + 'a'.repeat(43), authorization:'Bearer no'},
    {origin:'', body:'code=' + 'a'.repeat(43)},
    {origin:'https://evil.example', body:'code=' + 'a'.repeat(43)},
  ];
  for (const item of cases) {
    const headers = {'Content-Type':'application/x-www-form-urlencoded'};
    if (item.origin) headers.Origin = item.origin;
    if (item.authorization) headers.Authorization = item.authorization;
    const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/handoff', {method:'POST', headers, body:item.body}));
    assert.equal(response.status, 403);
  }
  assert.equal(hubCalls, 0);
});

test('untrusted Origin receives neither ACAO nor credentials and is not upgraded upstream', async () => {
  let upstreamOrigin = 'not-called';
  const proxy = createFleetProxy({
    relays: [relay],
    fetchImpl: async (_url, init) => {
      upstreamOrigin = init.headers.get('Origin');
      return new Response('{"error":"origin no permitido"}', {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    },
  });

  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/challenge', {
    headers: { Origin: 'https://evil.example' },
  }));

  assert.equal(upstreamOrigin, null);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('no-Origin auth request remains no-Origin and fails closed at the hub', async () => {
  let upstreamOrigin = 'not-called';
  const proxy = createFleetProxy({
    relays: [relay],
    fetchImpl: async (_url, init) => {
      upstreamOrigin = init.headers.get('Origin');
      return new Response('{"error":"origin no permitido"}', { status: 403 });
    },
  });

  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/auth/challenge'));
  assert.equal(upstreamOrigin, null);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('preflight reflects only an exact allowlisted Origin with credentials', async () => {
  const allowed = await worker.fetch(new Request('https://fleet.admira.live/api/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://admira.live' },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://admira.live');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(allowed.headers.get('Vary'), 'Origin');

  const denied = await worker.fetch(new Request('https://fleet.admira.live/api/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }));
  assert.equal(denied.status, 204);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(denied.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(denied.headers.get('Vary'), 'Origin');
});

test('preserves existing Authorization only; it never creates one', () => {
  const withAuthorization = headersToHub(new Request('https://fleet.admira.live/api/health', {
    headers: { Authorization: 'Bearer existing', Origin: 'https://admira.live' },
  }));
  assert.equal(withAuthorization.get('Authorization'), 'Bearer existing');

  const withoutAuthorization = headersToHub(new Request('https://fleet.admira.live/api/health', {
    headers: { Origin: 'https://admira.live' },
  }));
  assert.equal(withoutAuthorization.get('Authorization'), null);
});

test('preserves request path, query, and body bytes across relay failover', async () => {
  const payload = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
  const calls = [];
  const proxy = createFleetProxy({
    relays: [
      { id: 'first', base: 'https://first.invalid/fleet' },
      { id: 'second', base: 'https://second.invalid/fleet' },
    ],
    fetchImpl: async (url, init) => {
      calls.push({ url, bytes: [...new Uint8Array(init.body)] });
      if (calls.length === 1) return new Response('unavailable', { status: 502 });
      return new Response('accepted', { status: 201 });
    },
  });

  const response = await proxy.fetch(new Request('https://fleet.admira.live/fleet/api/auth/login?attempt=1', {
    method: 'POST',
    headers: { Origin: 'https://admira.live', 'Content-Type': 'application/octet-stream' },
    body: payload,
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [
    { url: 'https://first.invalid/fleet/api/auth/login?attempt=1', bytes: [...payload] },
    { url: 'https://second.invalid/fleet/api/auth/login?attempt=1', bytes: [...payload] },
  ]);
  assert.equal(response.headers.get('X-Fleet-Relay'), 'second');
});
