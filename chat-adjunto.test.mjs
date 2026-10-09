import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './functions/api/chat/adjunto.js';

function kvFalso() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    m,
  };
}
const env = () => ({ RECORTE_KV: kvFalso(), CONSUMOS_LECTURAS_TOKEN: 'tok-test' });

test('POST adjunto sin auth → 401', async () => {
  const r = await api.onRequestPost({
    request: new Request('https://www.admira.live/api/chat/adjunto', { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array([1, 2, 3]) }),
    env: env(),
  });
  assert.equal(r.status, 401);
});

test('POST + GET adjunto con token de máquina', async () => {
  const e = env();
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const post = await api.onRequestPost({
    request: new Request('https://www.admira.live/api/chat/adjunto', {
      method: 'POST',
      headers: { 'content-type': 'image/png', authorization: 'Bearer tok-test', Origin: 'https://www.admira.live' },
      body: bytes,
    }),
    env: e,
  });
  assert.equal(post.status, 201);
  const j = await post.json();
  assert.equal(j.ok, true);
  assert.match(j.url, /id=[a-f0-9]+/);
  const id = new URL(j.url).searchParams.get('id');
  const get = await api.onRequestGet({
    request: new Request('https://www.admira.live/api/chat/adjunto?id=' + id, { headers: { Origin: 'https://www.admira.live' } }),
    env: e,
  });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('content-type'), 'image/png');
  const got = new Uint8Array(await get.arrayBuffer());
  assert.deepEqual([...got], [...bytes]);
});
