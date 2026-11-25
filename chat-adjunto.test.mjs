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

// t1389u (25-11-2026): imagen pegada en ICQGram → turno.imagen y URL en el encargo y en el despertar
import * as enviar from './functions/api/chat/enviar.js';
test('enviar con imagen: valida la URL del adjunto y la lleva al encargo, al mensaje y al despertar', async () => {
  const e = { ...env(), ADMIRA_TELEGRAM_PANEL_KEY: 'llave-test' };
  const post = await api.onRequestPost({
    request: new Request('https://www.admira.live/api/chat/adjunto', { method: 'POST', headers: { 'content-type': 'image/jpeg', authorization: 'Bearer tok-test' }, body: new Uint8Array([255, 216, 255, 1]) }),
    env: e,
  });
  const { url } = await post.json();
  const llamadas = [];
  const fetchImpl = async (u, o) => { llamadas.push({ u: String(u), b: JSON.parse(o.body) }); return new Response(JSON.stringify(String(u).includes('despertar') ? { despertado: true } : { ok: true, id: 77 }), { status: 200 }); };
  const mk = (body) => new Request('https://www.admira.live/api/chat/enviar', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok-test' }, body: JSON.stringify(body) });
  const malo = await enviar.onRequestPost({ request: mk({ persona: 'wozniak', texto: 'hola', msg_id: 'live-x1-aaaa', canal: 'win95', imagen: 'https://evil.example/api/chat/adjunto?id=' + 'a'.repeat(32) }), env: e, fetchImpl });
  assert.equal(malo.status, 400);
  const r = await enviar.onRequestPost({ request: mk({ persona: 'wozniak', texto: '', msg_id: 'live-x2-bbbb', canal: 'win95', imagen: url }), env: e, fetchImpl });
  assert.equal(r.status, 201);
  const inbox = llamadas.find((l) => l.u.includes('bot.yokup.com') || l.b.text);
  assert.match(inbox.b.text, /Imagen adjunta .*\/api\/chat\/adjunto\?id=[a-f0-9]+/);
  assert.deepEqual(inbox.b.mensaje.imagenes, [url]);
  assert.equal(inbox.b.mensaje.texto, '🖼 Imagen adjunta');
  const desp = llamadas.find((l) => l.u.includes('despertar'));
  assert.equal(desp.b.imagen, url);
  const hilo = JSON.parse(await e.RECORTE_KV.get('chat:hilo:v1:wozniak'));
  assert.equal(hilo.turnos[0].imagen, url);
});
