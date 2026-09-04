import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar } from '../src/index.js';
import { resolverActor, CONSEJEROS_GROKBOT } from '../src/identidad.js';
import { validarTranscript, crearYokup } from '../src/yokup.js';
import { pngDeLineas, esPng } from '../src/png.js';

const WOZ = 'clave-wozniak-de-prueba-xx';
const ENV = {
  MCP_KEY: 'clave-de-prueba-larga',
  MCP_KEY_WOZNIAK: WOZ,
  MCP_KEY_JOBS: 'clave-jobs-de-prueba-yyyy',
  MCP_KEY_DISNEY: 'clave-disney-de-prueba-zz',
  MCP_KEY_LUCAS: 'clave-lucas-de-prueba-www',
  COUNCIL_MACHINE_TOKEN: 'token-maquina',
  AGORA_SYNC_KEY: 'agora',
  ADMIRA_TELEGRAM_PANEL_KEY: 'panel-key',
  COUNCIL_BASE: 'https://consejo.test/council',
  FLEET_BASE: 'https://consejo.test/api',
  AGORA_WORKER: 'https://agora.test',
  YOKUP_API: 'https://yokup.test',
  TELEGRAM_API: 'https://telegram.test',
  VERSION: 'v.04.09.2026.r4.07:25',
};

const TRANSCRIPT = `PETICIÓN: dar de alta y cerrar FLT-1580 con evidencia
$ yokup_evidencia --mission FLT-1580
ok: process agent/session_transcript
misión FLT-1580 acreditada
`;

function fetchYokup(peticiones) {
  return async (url, init = {}) => {
    const u = String(url);
    let body = null;
    if (typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    } else if (init.body && init.body.byteLength) {
      body = { bytes: init.body.byteLength, type: (init.headers || {})['content-type'] };
    }
    peticiones.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body });
    const ok = (o, extra = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json', ...extra } });
    if (u.endsWith('/api/presence')) return ok({ ok: true, persona: body && body.persona });
    if (u.endsWith('/api/bot-inbox')) return ok({ ok: true, id: 1601, task_id: 'task-web-1' });
    if (u.endsWith('/fleet/sync')) return ok({ ok: true });
    if (u.includes('/fleet/missions')) {
      return ok({ missions: [{ id: 'FLT-1601', screen: 'Puente yokup MCP  #1601', assignee: 'WozniakGrokBot', created_at: Date.now() }] });
    }
    if (u.endsWith('/fleet/media')) return ok({ ok: true, url: 'https://api.yokup.com/media/fleet/abc.png' });
    if (u.endsWith('/fleet/progress')) return ok({ ok: true, mission: body.mission, evidence_updated: true, capture_surface: 'agent', capture_context: 'session_transcript' });
    if (u.endsWith('/fleet/task-status')) return ok({ ok: true, mission: body.mission, code: body.code, status: body.status });
    if (u.endsWith('/fleet/informe')) return ok({ ok: true, mission: body.mission, resolved: true });
    if (u.endsWith('/decisions')) return ok({ ok: true, id: 'DEC-1', options: body.options });
    if (u.endsWith('/api/council/render-transcript')) {
      const png = await pngDeLineas('PETICIÓN: x\n$ echo hi\nhi\nFLT-1601');
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (u.endsWith('/api/council/health')) return ok({ status: 'ok', agents: 16 });
    return new Response('Not found ' + u, { status: 404 });
  };
}

async function cliente(env, peticiones, actor) {
  const server = crearServidor(env, { fetch: fetchYokup(peticiones), sleep: async () => {}, syncRetries: 1, syncWaitMs: 0 }, actor);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'grokbot-de-prueba', version: '0.0.1' });
  await client.connect(a);
  return { client, server, peticiones };
}

test('el diccionario GrokBot tiene las cuatro identidades de FLT-1580', () => {
  assert.deepEqual(CONSEJEROS_GROKBOT.map((c) => c.identity), ['WozniakGrokBot', 'JobsGrokBot', 'DisneyGrokBot', 'LucasGrokBot']);
});

test('la clave del consejero identifica a WozniakGrokBot; la genérica no firma', () => {
  const req = (key) => new Request('https://mcp.test/mcp', { headers: { authorization: `Bearer ${key}` } });
  const woz = resolverActor(req(WOZ), ENV);
  assert.equal(woz.tipo, 'consejero');
  assert.equal(woz.identity, 'WozniakGrokBot');
  assert.equal(woz.machine, 'GrokBot');
  assert.equal(woz.runtime, 'Grok');
  const gen = resolverActor(req(ENV.MCP_KEY), ENV);
  assert.equal(gen.tipo, 'generica');
  assert.equal(resolverActor(req('otra-clave-distinta-x'), ENV), null);
});

test('el transcript exige PETICIÓN, comando, salida y la misión', () => {
  validarTranscript(TRANSCRIPT, 'FLT-1580');
  assert.throws(() => validarTranscript('solo texto', 'FLT-1580'), /PETICIÓN/);
  assert.throws(() => validarTranscript('PETICIÓN: x\n$ ls\n', 'FLT-1580'), /salida/);
  assert.throws(() => validarTranscript(TRANSCRIPT, 'FLT-9999'), /FLT-9999/);
});

test('pngDeLineas produce un PNG real', async () => {
  const png = await pngDeLineas(TRANSCRIPT);
  assert.equal(esPng(png), true);
  assert.ok(png.length > 80);
});

test('yokup_alta / paso / evidencia / informe / ventana firman como WozniakGrokBot', async () => {
  const peticiones = [];
  const actor = { tipo: 'consejero', persona: 'Wozniak', identity: 'WozniakGrokBot', machine: 'GrokBot', runtime: 'Grok', host: 'agent' };
  const { client } = await cliente(ENV, peticiones, actor);
  const alta = JSON.parse((await client.callTool({ name: 'yokup_alta', arguments: { texto: 'Puente yokup MCP para GrokBot a b c', proyecto: 'yokup' } })).content[0].text);
  assert.equal(alta.encargo, 1601);
  assert.equal(alta.mission, 'FLT-1601');
  assert.equal(alta.identity, 'WozniakGrokBot');
  const paso = JSON.parse((await client.callTool({ name: 'yokup_paso', arguments: { mission: 'FLT-1601', code: 'b', status: 'in_progress' } })).content[0].text);
  assert.equal(paso.status, 'in_progress');
  const ev = JSON.parse((await client.callTool({ name: 'yokup_evidencia', arguments: { mission: 'FLT-1601', transcript: TRANSCRIPT.replaceAll('FLT-1580', 'FLT-1601') } })).content[0].text);
  assert.equal(ev.capture_surface, 'agent');
  assert.equal(ev.capture_context, 'session_transcript');
  assert.match(ev.image, /^https:\/\/api\.yokup\.com\/media\//);
  const inf = JSON.parse((await client.callTool({ name: 'yokup_informe', arguments: { mission: 'FLT-1601', report: 'Puente listo.', image: ev.image } })).content[0].text);
  assert.equal(inf.resolved, true);
  const ven = JSON.parse((await client.callTool({ name: 'yokup_ventana', arguments: { question: '¿Publicamos el puente?', opciones: ['Sí, ahora', 'Esperar a Carlos', 'Solo documentar'] } })).content[0].text);
  assert.equal(ven.options[3], 'Volver atrás');
  assert.equal(ven.options[4], 'Custom');
  const owners = peticiones.filter((p) => p.body && p.body.owner).map((p) => p.body.owner);
  assert.ok(owners.every((o) => o === 'WozniakGrokBot'));
  const progress = peticiones.find((p) => p.url.endsWith('/fleet/progress'));
  assert.equal(progress.body.capture_surface, 'agent');
  assert.equal(progress.body.capture_context, 'session_transcript');
});

test('la clave genérica no puede dar de alta misiones', async () => {
  const { client } = await cliente(ENV, [], { tipo: 'generica' });
  const r = await client.callTool({ name: 'yokup_alta', arguments: { texto: 'esto no debe entrar en yokup nunca' } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /clave del consejero/);
});

test('/mcp con clave de Wozniak late presencia y /salud lista las claves por consejero', async () => {
  const peticiones = [];
  const waits = [];
  const ctx = { waitUntil: (p) => { waits.push(p); } };
  const deps = { fetch: fetchYokup(peticiones), ctx, sleep: async () => {}, syncRetries: 1, syncWaitMs: 0 };
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'grokbot', version: '0.39.0' } } };
  const post = new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${WOZ}` },
    body: JSON.stringify(init),
  });
  const res = await manejar(post, ENV, deps);
  assert.equal(res.status, 200);
  await Promise.all(waits);
  const pres = peticiones.find((p) => p.url.endsWith('/api/presence'));
  assert.equal(pres.body.persona, 'WozniakGrokBot');
  assert.equal(pres.body.machine, 'GrokBot');
  assert.equal(pres.headers.authorization, 'Bearer panel-key');
  const salud = await (await manejar(new Request('https://mcp.test/salud'), ENV, deps)).json();
  assert.equal(salud.secretos.MCP_KEY_WOZNIAK, true);
  assert.equal(salud.secretos.MCP_KEY_JOBS, true);
  const raiz = await (await manejar(new Request('https://mcp.test/'), ENV, deps)).json();
  assert.ok(raiz.herramientas.includes('yokup_evidencia'));
  assert.ok(raiz.grokbot.includes('LucasGrokBot'));
});

test('crearYokup.evidencia cae al PNG del worker si council-api no pinta', async () => {
  const peticiones = [];
  const fetch = async (url, init = {}) => {
    if (String(url).includes('render-transcript')) return new Response('no', { status: 503 });
    return fetchYokup(peticiones)(url, init);
  };
  const actor = { tipo: 'consejero', persona: 'Jobs', identity: 'JobsGrokBot', machine: 'GrokBot', runtime: 'Grok' };
  const yk = crearYokup({ ...ENV, COUNCIL_MACHINE_TOKEN: 'token-maquina' }, { fetch }, actor);
  const r = await yk.evidencia({ mission: 'FLT-1601', transcript: TRANSCRIPT.replaceAll('FLT-1580', 'FLT-1601') });
  assert.equal(r.capture_context, 'session_transcript');
  assert.match(r.image, /fleet\/abc\.png/);
});
