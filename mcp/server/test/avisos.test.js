import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAvisos, validarUrl, exigirDueno, resumen, PREFIJO, PREFIJO_ESTADO } from '../src/avisos.js';
import { crearBandeja } from '../src/mensajes.js';
import { sandboxDe, manejar } from '../src/index.js';

const yo = (p) => ({ persona: p, machine: 'GrokBot', agent: `${p}GrokBot`, tipo: 'consejero' });
function kvMemoria() {
  const m = new Map();
  return { m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}

test('anti-SSRF: solo https con dominio', () => {
  assert.equal(validarUrl('https://hooks.example.com/x'), 'https://hooks.example.com/x');
  for (const u of ['http://a.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://10.0.0.1/', 'https://[::1]/', 'https://192.168.1.1', 'https://foo.local/', 'https://u:p@a.com/', 'https://a.com:22/', 'https://2130706433/', 'ftp://a.com', 'https://metadata.internal/'])
    assert.throws(() => validarUrl(u), undefined, u);
});

test('solo el propio consejero (o admin) gestiona su webhook', () => {
  assert.equal(exigirDueno(yo('Musk'), undefined), 'Musk');
  assert.equal(exigirDueno(yo('Musk'), 'Elon'), 'Musk');
  assert.throws(() => exigirDueno(yo('Jobs'), 'Musk'), /no gestiona/);
  assert.equal(exigirDueno(yo('Jobs'), 'Musk', { AVISOS_ADMIN: 'Jobs' }), 'Musk');
  assert.throws(() => exigirDueno({ tipo: 'consejo-compartido' }, 'Musk'), /compartida/);
  assert.throws(() => exigirDueno({ persona: 'Morfeo', tipo: 'agente' }), /agente/);
  assert.throws(() => exigirDueno(null), /identidad/);
});

test('registrar / ver (sin secreto) / borrar', async () => {
  const kv = kvMemoria();
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv });
  const r = await av.registrar({ url: 'https://hooks.example.com/jobs', secreto: 'supersecreto123' }, yo('Jobs'));
  assert.equal(r.webhook.secreto, 'definido (no se muestra)');
  assert.ok(kv.m.has(PREFIJO + 'Jobs'));
  const v = await av.ver({}, yo('Jobs'));
  assert.ok(!JSON.stringify(v).includes('supersecreto123'));
  await assert.rejects(av.ver({ silla: 'Jobs' }, yo('Musk')));
  const b = await av.borrar({}, yo('Jobs'));
  assert.equal(b.borrado, true);
  assert.equal(kv.m.has(PREFIJO + 'Jobs'), false);
});

test('mensaje nuevo → POST al webhook del destinatario con resumen, sin cuerpo completo', async () => {
  const kv = kvMemoria();
  const llamadas = [];
  const pend = [];
  const deps = { waitUntil: (p) => pend.push(p), fetchWebhook: async (u, i) => { llamadas.push({ u, i }); return { status: 200 }; } };
  const env = { ADMIRA_LIVE_DESDE: kv };
  await crearAvisos(env, deps).registrar({ url: 'https://hooks.example.com/jobs', secreto: 's3cr3t-valor', cabecera: 'x-mia' }, yo('Jobs'));
  const largo = 'Hola Steve. ' + 'x'.repeat(500);
  const r = await crearBandeja(env, deps).enviar({ para: 'Jobs', texto: largo }, yo('Musk'));
  assert.equal(r.ok, true);
  await Promise.all(pend);
  assert.equal(llamadas.length, 1);
  const c = JSON.parse(llamadas[0].i.body);
  assert.equal(c.tipo, 'consejero_mensaje'); assert.equal(c.de, 'Musk'); assert.equal(c.para, 'Jobs'); assert.equal(c.id, r.mensaje.id);
  assert.ok(c.resumen.length <= 140); assert.ok(!llamadas[0].i.body.includes('x'.repeat(200)));
  assert.equal(llamadas[0].i.headers['x-mia'], 's3cr3t-valor');
  assert.equal(llamadas[0].i.redirect, 'manual');
  const est = JSON.parse(kv.m.get(PREFIJO_ESTADO + 'Jobs'));
  assert.equal(est.ok, true); assert.equal(est.codigo, 200); assert.equal(est.intentos, 1);
  // El remitente sin webhook no recibe nada y la respuesta avisa a Musk solo si tiene webhook.
  await crearBandeja(env, deps).responder({ id: r.mensaje.id, texto: 'Recibido' }, yo('Jobs'));
  await Promise.all(pend);
  assert.equal(llamadas.length, 1);
});

test('fallo del webhook: 1 reintento, no rompe el guardado y queda diagnóstico', async () => {
  const kv = kvMemoria();
  let n = 0; const pend = [];
  const deps = { waitUntil: (p) => pend.push(p), fetchWebhook: async () => { n++; throw new Error('caído'); } };
  const env = { ADMIRA_LIVE_DESDE: kv };
  await crearAvisos(env, deps).registrar({ url: 'https://hooks.example.com/m' }, yo('Musk'));
  const r = await crearBandeja(env, deps).enviar({ para: 'Musk', texto: 'hola' }, yo('Jobs'));
  assert.equal(r.ok, true);
  await Promise.all(pend);
  assert.equal(n, 2);
  const est = JSON.parse(kv.m.get(PREFIJO_ESTADO + 'Musk'));
  assert.equal(est.ok, false); assert.equal(est.intentos, 2);
  assert.equal((await crearBandeja(env).listar('Musk')).mensajes.length, 1);
});

test('4xx no reintenta; timeout aborta', async () => {
  const kv = kvMemoria();
  let n = 0;
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv }, { fetchWebhook: async () => { n++; return { status: 404 }; } });
  await av.registrar({ url: 'https://hooks.example.com/m' }, yo('Musk'));
  const e = await av.avisar({ id: 'cm1', de: 'Jobs', para: 'Musk', texto: 't' });
  assert.equal(n, 1); assert.equal(e.codigo, 404);
  const lento = crearAvisos({ ADMIRA_LIVE_DESDE: kv }, { timeoutMs: 30, fetchWebhook: (u, i) => new Promise((_, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) });
  const t = await lento.avisar({ id: 'cm2', de: 'Jobs', para: 'Musk', texto: 't' });
  assert.equal(t.error, 'timeout'); assert.equal(t.intentos, 2);
});

test('anti-bucle y destinatarios sin webhook', async () => {
  const kv = kvMemoria();
  let n = 0;
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv }, { fetchWebhook: async () => { n++; return { status: 200 }; } });
  await av.registrar({ url: 'https://hooks.example.com/m' }, yo('Musk'));
  assert.match((await av.avisar({ id: 'a', de: 'Musk', para: 'Musk', texto: 't' })).omitido, /bucle/);
  assert.match((await av.avisar({ id: 'b', de: 'Musk', para: 'Morfeo', para_tipo: 'agente', texto: 't' })).omitido, /agente/);
  assert.match((await av.avisar({ id: 'c', de: 'Musk', para: 'Jobs', texto: 't' })).omitido, /sin webhook/);
  assert.equal(n, 0);
  assert.equal(resumen('  a   b  '), 'a b');
});

test('sandbox: solo con AVISOS_SANDBOX_KEY y prefijo propio de KV', async () => {
  const kv = kvMemoria();
  const req = (k, p) => new Request('https://x/mcp', { headers: { authorization: `Bearer ${k}`, 'x-sandbox-persona': p } });
  assert.equal(sandboxDe(req('a'.repeat(30), 'Jobs'), { ADMIRA_LIVE_DESDE: kv }), null);
  const env = { ADMIRA_LIVE_DESDE: kv, AVISOS_SANDBOX_KEY: 'k'.repeat(30), ADMIRA_TELEGRAM_PANEL_KEY: 'x' };
  assert.equal(sandboxDe(req('z'.repeat(30), 'Jobs'), env), null);
  const s = sandboxDe(req('k'.repeat(30), 'Jobs'), env);
  assert.equal(s.identidad.persona, 'Jobs'); assert.equal(s.env.ADMIRA_TELEGRAM_PANEL_KEY, undefined);
  await s.env.ADMIRA_LIVE_DESDE.put('q', '1');
  assert.ok(kv.m.has('avisos-sandbox:q'));
  const r = await manejar(new Request('https://x/mcp', { method: 'POST', headers: { authorization: 'Bearer nada', 'content-type': 'application/json' }, body: '{}' }), { ADMIRA_LIVE_DESDE: kv });
  assert.equal(r.status, 401);
});

import { lecturaMensajesPermitida } from '../src/index.js';
test('/consejero/mensajes: abierto sin secreto, cerrado con CONSEJERO_MENSAJES_TOKEN', async () => {
  const r = (t) => new Request('https://x/consejero/mensajes?con=Jobs', { headers: t ? { 'x-mensajes-token': t } : {} });
  assert.equal(lecturaMensajesPermitida(r(), {}), true);
  const env = { CONSEJERO_MENSAJES_TOKEN: 'm'.repeat(32), ADMIRA_LIVE_DESDE: kvMemoria() };
  assert.equal(lecturaMensajesPermitida(r(), env), false);
  assert.equal(lecturaMensajesPermitida(r('x'.repeat(32)), env), false);
  assert.equal(lecturaMensajesPermitida(r('m'.repeat(32)), env), true);
  assert.equal((await manejar(r(), env)).status, 401);
  assert.equal((await manejar(r('m'.repeat(32)), env)).status, 200);
});
