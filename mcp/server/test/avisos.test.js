import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAvisos, validarUrl, exigirDueno, resumen, PREFIJO, PREFIJO_ESTADO, CABECERA_FIRMA, firmarCuerpo, generarSecretoFirma } from '../src/avisos.js';
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
  assert.equal(exigirDueno({ persona: 'Morfeo', tipo: 'agente' }), 'Morfeo');
  assert.throws(() => exigirDueno({ persona: 'Morfeo', tipo: 'agente' }, 'Oraculo'), /propio webhook/);
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
  assert.match((await av.avisar({ id: 'b', de: 'Musk', para: 'Morfeo', para_tipo: 'agente', texto: 't' })).omitido, /sin webhook/);
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

test('encargo o chat: el mismo webhook recibe tipo, canal y número de encargo', async () => {
  const kv = kvMemoria();
  const llamadas = [];
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv, SITIO: 'https://www.admira.live' }, { fetchWebhook: async (u, i) => { llamadas.push({ u, i }); return { status: 204 }; } });
  await av.registrar({ url: 'https://hooks.example.com/huang' }, yo('Huang'));
  const r = await av.avisar({ tipo: 'chat', id: 'live-w-test', de: 'Carlos', para: 'Huang', texto: 'Hola desde ICQGram', encargo: 7712, canal: 'win95', hora: '2026-11-25T18:03:00.000Z' });
  assert.equal(r.ok, true);
  assert.equal(r.codigo, 204);
  assert.equal(llamadas.length, 1);
  const c = JSON.parse(llamadas[0].i.body);
  assert.equal(c.tipo, 'chat');
  assert.equal(c.encargo, 7712);
  assert.equal(c.canal, 'win95');
  assert.equal(c.de, 'Carlos');
  assert.equal(c.para, 'Huang');
  assert.ok(!JSON.stringify(c).includes('supersecreto'));
  assert.equal(llamadas[0].i.headers['x-admira-aviso'], 'chat');
});

test('POST /consejero/despertar usa el webhook registrado y exige la PANEL_KEY', async () => {
  const kv = kvMemoria();
  const llamadas = [];
  const env = { ADMIRA_LIVE_DESDE: kv, ADMIRA_TELEGRAM_PANEL_KEY: 'panel-key-despertar', SITIO: 'https://www.admira.live' };
  const deps = { fetchWebhook: async (u, i) => { llamadas.push({ u, i }); return { status: 200 }; } };
  await crearAvisos(env, deps).registrar({ url: 'https://hooks.example.com/huang', secreto: 'Bearer secreto-de-prueba', cabecera: 'authorization' }, yo('Huang'));
  const post = (headers, body) => new Request('https://mcp.admira.live/consejero/despertar', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await manejar(post({}, { persona: 'Huang', encargo: 7713 }), env, deps)).status, 401);
  assert.equal((await manejar(post({ authorization: 'Bearer no' }, { persona: 'Huang', encargo: 7713 }), env, deps)).status, 401);
  const r = await manejar(post({ authorization: 'Bearer panel-key-despertar' }, { persona: 'Jensen', encargo: 7713, de: 'Carlos', resumen: 'mensaje de prueba ICQGram', canal: 'win95', tipo: 'chat' }), env, deps);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.despertado, true);
  assert.equal(d.via, 'webhook-propio');
  assert.equal(d.para, 'Huang');
  assert.equal(d.codigo, 200);
  assert.equal(llamadas.length, 1);
  const c = JSON.parse(llamadas[0].i.body);
  assert.equal(c.tipo, 'chat');
  assert.equal(c.encargo, 7713);
  assert.equal(c.canal, 'win95');
  assert.equal(llamadas[0].i.headers.authorization, 'Bearer secreto-de-prueba');
  const sin = await manejar(post({ authorization: 'Bearer panel-key-despertar' }, { persona: 'Jobs', encargo: 1, resumen: 'sin registro' }), env, deps);
  const sd = await sin.json();
  assert.equal(sin.status, 200);
  assert.equal(sd.despertado, false);
  assert.match(String(sd.resultado), /sin webhook/);
});

test('Authorization: se antepone Bearer si el secreto no lo trae', async () => {
  const kv = kvMemoria();
  const llamadas = [];
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv }, { fetchWebhook: async (u, i) => { llamadas.push(i); return { status: 200 }; } });
  await av.registrar({ url: 'https://hooks.example.com/huang', secreto: 'clave-cruda', cabecera: 'Authorization' }, yo('Huang'));
  const r = await av.avisar({ tipo: 'chat', id: 't1', de: 'Carlos', para: 'Huang', texto: 'x', encargo: 1 });
  assert.equal(r.ok, true);
  assert.equal(llamadas[0].headers.authorization, 'Bearer clave-cruda');
  await av.registrar({ url: 'https://hooks.example.com/huang', secreto: 'Bearer ya-completo', cabecera: 'Authorization' }, yo('Huang'));
  await av.avisar({ tipo: 'chat', id: 't2', de: 'Carlos', para: 'Huang', texto: 'y', encargo: 2 });
  assert.equal(llamadas[1].headers.authorization, 'Bearer ya-completo');
});

test('firma Stripe-like: HMAC de "<t>.<cuerpo>" con los 32 bytes del secreto', () => {
  const secreto = 'ab'.repeat(32);
  const cuerpo = '{"tipo":"chat","encargo":1}';
  const f = firmarCuerpo(secreto, cuerpo, 1700000000);
  assert.equal(f.t, '1700000000');
  assert.equal(f.header, `t=1700000000,v1=${f.v1}`);
  assert.equal(f.v1.length, 64);
  assert.match(f.v1, /^[0-9a-f]{64}$/);
  const otra = firmarCuerpo(secreto, cuerpo, 1700000000);
  assert.equal(otra.v1, f.v1);
  const distinta = firmarCuerpo(secreto, cuerpo, 1700000001);
  assert.notEqual(distinta.v1, f.v1);
  assert.equal(generarSecretoFirma().length, 64);
  assert.throws(() => firmarCuerpo('aa', cuerpo, 1), /inválido/);
});

test('activarFirma guarda el modo firma y avisar firma el cuerpo sin Authorization', async () => {
  const kv = kvMemoria();
  const llamadas = [];
  const secreto = 'cd'.repeat(32);
  const av = crearAvisos({ ADMIRA_LIVE_DESDE: kv, SITIO: 'https://www.admira.live' }, {
    now: () => new Date(1_700_000_000_000),
    generarSecreto: () => secreto,
    fetchWebhook: async (u, i) => { llamadas.push({ u, i }); return { status: 204 }; },
  });
  const r = await av.activarFirma({ silla: 'Huang', url: 'https://api2.cursor.sh/automations/webhook/20d34b3b-72ad-5549-84e6-4ffee0c6ffa4' });
  assert.equal(r.ok, true);
  assert.equal(r.silla, 'Huang');
  assert.equal(r.modo, 'firma');
  assert.equal(r.cabecera, CABECERA_FIRMA);
  assert.equal(r.secreto, secreto);
  const v = await av.ver({ silla: 'Huang' }, yo('Huang'));
  assert.equal(v.webhook.modo, 'firma');
  assert.equal(v.webhook.cabecera, CABECERA_FIRMA);
  assert.equal(v.webhook.secreto, 'definido (no se muestra)');
  assert.ok(!JSON.stringify(v).includes(secreto));
  const aviso = await av.avisar({ tipo: 'chat', id: 'live-firma', de: 'Carlos', para: 'Huang', texto: 'hola', encargo: 7714, canal: 'win95' });
  assert.equal(aviso.ok, true);
  assert.equal(llamadas.length, 1);
  const h = llamadas[0].i.headers;
  assert.equal(h[CABECERA_FIRMA], firmarCuerpo(secreto, llamadas[0].i.body, 1700000000).header);
  assert.equal(h.authorization, undefined);
  assert.match(h[CABECERA_FIRMA], /^t=1700000000,v1=[0-9a-f]{64}$/);
});

test('POST /consejero/webhook-firmar exige la PANEL_KEY y devuelve el secreto una vez', async () => {
  const kv = kvMemoria();
  const secreto = 'ef'.repeat(32);
  const env = { ADMIRA_LIVE_DESDE: kv, ADMIRA_TELEGRAM_PANEL_KEY: 'panel-key-despertar' };
  const deps = { generarSecreto: () => secreto };
  const post = (headers, body) => new Request('https://mcp.admira.live/consejero/webhook-firmar', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await manejar(post({}, { silla: 'Huang' }), env, deps)).status, 401);
  const r = await manejar(post({ authorization: 'Bearer panel-key-despertar' }, { silla: 'Jensen', url: 'https://api2.cursor.sh/automations/webhook/20d34b3b-72ad-5549-84e6-4ffee0c6ffa4' }), env, deps);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.silla, 'Huang');
  assert.equal(d.modo, 'firma');
  assert.equal(d.cabecera, CABECERA_FIRMA);
  assert.equal(d.secreto, secreto);
  const mal = await manejar(post({ authorization: 'Bearer panel-key-despertar' }, { silla: 'Nadie' }), env, deps);
  assert.equal(mal.status, 400);
});
