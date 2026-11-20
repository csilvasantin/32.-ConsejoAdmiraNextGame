import test from 'node:test';
import assert from 'node:assert/strict';
import { esPublico, emitir, verificar, COOKIE, rutaSegura, sha256hex } from './functions/_puerta.js';
import { onRequest } from './functions/_middleware.js';

const S = 'x'.repeat(48);
const ok = () => new Response('CONTENIDO', { status: 200, headers: { 'Cache-Control': 'public, max-age=300' } });
const ctx = (path, { cookie, accept, env = { PUERTA_FIRMA: S }, method = 'GET', headers = {}, body } = {}) => ({
  request: new Request('https://www.admira.live' + path, { method, body, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(accept ? { Accept: accept } : {}), ...headers } }),
  env, next: async () => ok(),
});

test('lista pública acotada', () => {
  for (const p of ['/auth-gate.js', '/version.json', '/api/consejo/tts', '/auth/callback', '/ubicacion/invitado', '/assets/mouth-v2/boca-v2-ciclo.mp4', '/assets/x/y.png'])
    assert.equal(esPublico(p), true, p);
  for (const p of ['/', '/interactive', '/escena0/', '/failover.js', '/app.flt-100529.js', '/assets/interface-cli.js', '/assets/x.svg', '/assets/../app.js', '/assets/%2e%2e/a.mp4', '/control/', '/mcp/llms.txt', '/fleet-control/server.js', '/backups/x/machines.json.bak'])
    assert.equal(esPublico(p), false, p);
});

test('firma, caducidad y tope', async () => {
  const now = 1_000_000;
  const c = await emitir(S, 'persona', 'a@b.c', undefined, now);
  assert.equal((await verificar(S, c.valor, now + 10)).s, 'a@b.c');
  assert.equal(await verificar(S, c.valor, now + 25 * 3600), null);
  assert.equal(await verificar('y'.repeat(48), c.valor, now + 10), null);
  assert.equal(await verificar(S, c.valor.slice(0, -2) + 'AA', now + 10), null);
  const viejo = await emitir(S, 'persona', 'a@b.c', now - 7 * 24 * 3600 + 5, now);
  assert.ok(viejo.maxAge <= 5);
});

test('sin cookie: verja HTML 401 para páginas y 401 seco para JS', async () => {
  const r = await onRequest(ctx('/escena0/', { accept: 'text/html' }));
  assert.equal(r.status, 401);
  const t = await r.text();
  assert.match(t, /ADMIRA_PUERTA/); assert.doesNotMatch(t, /CONTENIDO/);
  assert.match(r.headers.get('cache-control'), /no-store/);
  const j = await onRequest(ctx('/failover.js'));
  assert.equal(j.status, 401); assert.equal(await j.text(), 'Acceso restringido\n');
  assert.equal((await onRequest(ctx('/interactive'))).status, 401);
});

test('con cookie válida: contenido privado', async () => {
  const c = await emitir(S, 'persona', 'a@b.c');
  const r = await onRequest(ctx('/failover.js', { cookie: `otra=1; ${COOKIE}=${c.valor}` }));
  assert.equal(r.status, 200); assert.equal(await r.text(), 'CONTENIDO');
  assert.equal(r.headers.get('cache-control'), 'private, max-age=300');
});

test('falla cerrada sin secreto', async () => {
  assert.equal((await onRequest(ctx('/', { env: {} }))).status, 503);
  assert.equal((await onRequest(ctx('/version.json', { env: {} }))).status, 200);
});

test('kiosco: llave correcta abre, incorrecta no', async () => {
  const k = 'k'.repeat(40);
  const env = { PUERTA_FIRMA: S, PUERTA_KIOSCO_SHA256: await sha256hex(k) };
  const bien = await onRequest(ctx(`/puerta/kiosco?k=${k}&a=/escena0/`, { env }));
  assert.equal(bien.status, 303); assert.equal(bien.headers.get('location'), '/escena0/');
  assert.match(bien.headers.get('set-cookie'), /__Host-admira_puerta=.*HttpOnly; Secure/);
  assert.equal((await onRequest(ctx(`/puerta/kiosco?k=${'z'.repeat(40)}`, { env }))).status, 401);
  assert.equal(rutaSegura('//evil.com'), '/'); assert.equal(rutaSegura('https://evil.com'), '/');
});

test('entrar exige mismo origen', async () => {
  const r = await onRequest(ctx('/puerta/entrar', { method: 'POST', headers: { Origin: 'https://evil.com', 'Content-Type': 'application/json' }, body: '{"ticket":"' + 'a'.repeat(40) + '"}' }));
  assert.equal(r.status, 403);
});

test('la verja trae auth-gate fresco', async () => {
  const r = await onRequest(ctx('/auth-gate.js?v=puerta-abc'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
});
