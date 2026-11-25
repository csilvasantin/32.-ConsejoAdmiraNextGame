import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './functions/api/win95/visitas.js';
const kvF = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
test('#7729: sin sesión 401; POST suma una vez por sesión (cookie) y GET no suma', async () => {
  const env = { RECORTE_KV: kvF(), PUERTA_FIRMA: '' };
  const r0 = await api.onRequestPost({ request: new Request('https://www.admira.live/api/win95/visitas', { method: 'POST' }), env, fetchImpl: async () => new Response('{}', { status: 400 }) });
  assert.equal(r0.status, 401);
  const google = async () => new Response(JSON.stringify({ aud: '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com', email: 'csilva@admira.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600), iss: 'accounts.google.com' }), { status: 200 });
  const mk = (m, cookie) => new Request('https://www.admira.live/api/win95/visitas', { method: m, headers: { authorization: 'Bearer a.b.c', ...(cookie ? { cookie } : {}) } });
  const a = await (await api.onRequestPost({ request: mk('POST'), env, fetchImpl: google })).json();
  const r2 = await api.onRequestPost({ request: mk('POST'), env, fetchImpl: google });
  assert.match(r2.headers.get('set-cookie'), /__Host-w95_visita=1/);
  const b = await r2.json();
  const c = await (await api.onRequestPost({ request: mk('POST', '__Host-w95_visita=1'), env, fetchImpl: google })).json();
  const g = await (await api.onRequestGet({ request: mk('GET'), env, fetchImpl: google })).json();
  assert.equal(b.total, a.total + 1); assert.equal(c.total, b.total); assert.equal(c.sumada, false); assert.equal(g.total, b.total);
});
