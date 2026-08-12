import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthStore, createWorker } from '../src/index.js';

class MemoryStorage {
  constructor(rows = new Map()) { this.rows = rows; this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.rows.get(key)); }
  async put(key, value) { this.rows.set(key, structuredClone(value)); }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.rows.delete(key); }
  async list() { return new Map(this.rows); }
  async setAlarm(value) { this.alarm = value; }
  async transaction(callback) {
    const run = this.queue.then(() => callback(this));
    this.queue = run.catch(() => {});
    return run;
  }
}

function environment(storage = new MemoryStorage()) {
  let instance = new AuthStore({storage});
  return {
    storage,
    restart() { instance = new AuthStore({storage}); },
    env: {
      AUTH_STORE: {idFromName:name => name, get:() => ({fetch:(url, init) => instance.fetch(new Request(url, init))})},
      GOOGLE_CLIENT_ID:'client-id', WHITELIST_URL:'https://allow.invalid/list'
    }
  };
}

function trustedFetch(url, init) {
  if (String(url).includes('tokeninfo')) {
    assert.match(String(init.body), /id_token=credential/);
    return Promise.resolve(Response.json({iss:'https://accounts.google.com', aud:'client-id', exp:2000, iat:1000, email_verified:true, nonce:trustedFetch.nonce, email:'carlos@example.com', name:'Carlos'}));
  }
  return Promise.resolve(Response.json({superusers:['carlos@example.com']}));
}

async function challenge(worker, env, returnTo = '/control/') {
  const response = await worker.fetch(new Request('https://www.admira.live/auth/challenge', {
    method:'POST', headers:{Origin:'https://www.admira.live', 'Content-Type':'application/json'}, body:JSON.stringify({return_to:returnTo})
  }), env);
  assert.equal(response.status, 200);
  return {body:await response.json(), cookie:response.headers.get('Set-Cookie')};
}

test('challenge durable sobrevive reinicio y callback navega sin JS ni formulario', async () => {
  const box = environment();
  const worker = createWorker({fetchImpl:trustedFetch, now:() => 1_000_000});
  const issued = await challenge(worker, box.env, '/control/?machine=mini');
  trustedFetch.nonce = issued.body.nonce;
  box.restart();
  const csrf = 'csrf-value';
  const form = new URLSearchParams({credential:'credential', state:issued.body.state, g_csrf_token:csrf}).toString();
  const response = await worker.fetch(new Request('https://www.admira.live/auth/callback', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded', Cookie:`g_csrf_token=${csrf}; ${issued.cookie.split(';')[0]}`}, body:form
  }), box.env);
  assert.equal(response.status, 303);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.origin + location.pathname, 'https://fleet.admira.live/api/auth/handoff');
  assert.deepEqual([...location.searchParams.keys()], ['code']);
  const code = location.searchParams.get('code');
  assert.match(code, /^[A-Za-z0-9_-]{40,80}$/);
  const consume = request => worker.fetch(new Request('https://www.admira.live/auth/handoff/consume', {
    method:'POST', headers:{Origin:'https://fleet.admira.live', 'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({code}).toString()
  }), box.env);
  const first = await consume();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {email:'carlos@example.com', name:'Carlos', returnPath:'/control/?machine=mini', expiresAt:1060000});
  assert.equal((await consume()).status, 409, 'replay falla después de restart/failover');
});

test('dos consumos concurrentes del mismo handoff sólo dan un éxito', async () => {
  const box = environment();
  const store = box.env.AUTH_STORE.get('admira-auth');
  const issued = await (await store.fetch('https://auth-store/issue', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({returnPath:'/', now:1000})})).json();
  const exchange = await store.fetch('https://auth-store/exchange', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({state:issued.state, nonce:issued.nonce, email:'carlos@example.com', now:1000})});
  const {code} = await exchange.json();
  const consume = () => store.fetch('https://auth-store/consume', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code, now:1001})});
  const statuses = (await Promise.all([consume(), consume()])).map(response => response.status).sort();
  assert.deepEqual(statuses, [200, 409]);
});

test('edge exige Origin exacto y double-CSRF antes de consultar Google', async () => {
  let fetchCalls = 0;
  const box = environment();
  const worker = createWorker({fetchImpl:async () => { fetchCalls += 1; throw new Error('no debe llamarse'); }, now:() => 1000});
  for (const origin of [null, 'https://evil.example']) {
    const headers = {'Content-Type':'application/json'};
    if (origin) headers.Origin = origin;
    const response = await worker.fetch(new Request('https://www.admira.live/auth/challenge', {method:'POST', headers, body:'{}'}), box.env);
    assert.equal(response.status, 403);
  }
  const issued = await challenge(createWorker({now:() => 1000}), box.env);
  const response = await worker.fetch(new Request('https://www.admira.live/auth/callback', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded', Cookie:`g_csrf_token=one; ${issued.cookie.split(';')[0]}`},
    body:new URLSearchParams({credential:'credential', state:issued.body.state, g_csrf_token:'two'}).toString()
  }), box.env);
  assert.equal(response.status, 403);
  assert.equal(fetchCalls, 0);
});

test('consume handoff rechaza browser o servidor con Origin ausente/malicioso', async () => {
  const box = environment();
  const worker = createWorker({now:() => 1000});
  for (const origin of [null, 'https://evil.example']) {
    const headers = {'Content-Type':'application/x-www-form-urlencoded'};
    if (origin) headers.Origin = origin;
    const response = await worker.fetch(new Request('https://www.admira.live/auth/handoff/consume', {method:'POST', headers, body:'code=' + 'a'.repeat(43)}), box.env);
    assert.equal(response.status, 403);
  }
});
