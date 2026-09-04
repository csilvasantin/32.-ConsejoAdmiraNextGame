import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar, claveValida } from '../src/index.js';
import { identidadPorClave, crearYokup } from '../src/yokup.js';

// FLT-1580: los consejeros de GrokBot dentro de la flota. Sin red: yokup, el bot-inbox
// y el Mac Mini se sustituyen por un fetch falso que graba el ritual completo.

const KEYS = { 'clave-de-jobs-xxxxxxxxxxxxxxxxxx': { persona: 'Jobs' }, 'clave-de-disney-xxxxxxxxxxxxxxxx': { persona: 'Walt Disney' } };
const ENV = { MCP_KEY: 'clave-de-wozniak-xxxxxxxxxxxxxxx', MCP_KEY_PERSONA: 'Wozniak', MCP_KEYS: JSON.stringify(KEYS),
  COUNCIL_MACHINE_TOKEN: 'token-maquina', ADMIRA_TELEGRAM_PANEL_KEY: 'panel', AGORA_SYNC_KEY: 'agora',
  COUNCIL_BASE: 'https://consejo.test/council', FLEET_BASE: 'https://consejo.test/api', AGORA_WORKER: 'https://agora.test',
  YOKUP_API: 'https://yokup.test', ADMIRA_TELEGRAM_URL: 'https://telegram.test', VERSION: 'v.04.09.2026.r4.07:30' };

function fetchFalso(peticiones, estado = {}) {
  estado.syncs = 0;
  return async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    let body = null; if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    peticiones.push({ url: u, method, headers: init.headers || {}, body, bytes: init.body && typeof init.body !== 'string' ? init.body.length : 0 });
    const ok = (o, extra = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' }, ...extra });
    if (u.endsWith('/projects') && method === 'GET') return ok({ projects: [{ id: 'yokup', name: 'Yokup' }, { id: 'admira-live', name: 'Admira Live · Consejo' }] });
    if (u.endsWith('/projects/principal')) return ok({ ok: true });
    if (u.endsWith('/api/bot-inbox')) { if ((init.headers || {}).authorization !== 'Bearer panel') return new Response('{"ok":false}', { status: 401 }); estado.encargo = body; return ok({ ok: true, id: 1601 }); }
    if (u.endsWith('/fleet/sync')) { estado.syncs++; return ok({ ok: true }); }
    if (u.includes('/fleet/missions')) {
      const lista = estado.encargo && estado.syncs >= 1 ? [{ id: 'FLT-1601', persona: 'WozniakGrokBot', subject: estado.encargo.text, created_at: Date.now(), display_ref: '0301.04/09/2026.07:30', status: 'open', tasks: [{ code: 'a', status: 'pending', title: 'Uno' }] }] : [];
      return ok({ missions: lista });
    }
    if (u.endsWith('/projects/mission')) return ok({ ok: true });
    if (u.includes('/fleet/plan')) return ok({ ok: true, tasks: [{ code: 'a', title: 'Auditar' }, { code: 'b', title: 'Hacer' }, { code: 'c', title: 'Cerrar' }] });
    if (u.endsWith('/fleet/task-status')) return ok({ ok: true, mission: body.mission, code: body.code, status: body.status });
    if (u.endsWith('/api/council/render-transcript')) { if ((init.headers || {})['x-council-token'] !== 'token-maquina') return new Response('no', { status: 401 }); return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }); }
    if (u.endsWith('/fleet/media')) return ok({ url: 'https://yokup.test/media/fleet/abc.png' });
    if (u.endsWith('/fleet/progress')) return ok({ ok: true, mission: body.mission, evidence_updated: true, evidence_kind: body.evidence_kind, capture_surface: body.capture_surface, capture_context: body.capture_context });
    if (u.endsWith('/fleet/informe')) return ok({ ok: true, mission: body.mission, resolved: true, proof_image: body.image });
    if (u.endsWith('/decisions')) return ok({ ok: true, id: 'DEC-x', display_ref: '0302.04/09/2026.07:31', options: body.options });
    if (u.endsWith('/api/presence')) return ok({ ok: true, echoed: body });
    if (u.endsWith('/highscore/daily')) return ok({ day: '2026-09-04', weights: { mission: 40, window: 8 }, scores: [{ agent: 'WozniakGrokBot', mission_points: 40, window_points: 0, missions: 1, windows: 0 }], hourly: { scores: [] } });
    return new Response('Not found', { status: 404 });
  };
}

async function cliente(clave = ENV.MCP_KEY, env = ENV) {
  const peticiones = [], estado = {};
  const server = crearServidor(env, { fetch: fetchFalso(peticiones, estado), now: () => Date.now() }, identidadPorClave(clave, env));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'grokbot-de-prueba', version: '0.39.0' });
  await client.connect(a);
  return { client, peticiones, estado };
}
const res = (r) => JSON.parse(r.content[0].text);

test('la identidad sale de la clave: MCP_KEY es Wozniak, MCP_KEYS mapea a los demás, y el nombre largo firma corto', () => {
  assert.deepEqual(identidadPorClave(ENV.MCP_KEY, ENV), { persona: 'Wozniak', machine: 'GrokBot', runtime: 'Grok', model: 'Grok Heavy', agent: 'WozniakGrokBot' });
  assert.equal(identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxx', ENV).agent, 'JobsGrokBot');
  assert.equal(identidadPorClave('clave-de-disney-xxxxxxxxxxxxxxxx', ENV).agent, 'DisneyGrokBot', 'el nombre largo firma con el apellido del diccionario');
  assert.equal(identidadPorClave('otra', ENV), null);
  assert.equal(identidadPorClave('', ENV), null);
});

test('las claves por consejero abren /mcp y las instrucciones dicen quién eres', async () => {
  const req = (k) => new Request('https://mcp.test/mcp', { headers: { authorization: `Bearer ${k}` } });
  assert.equal(claveValida(req('clave-de-jobs-xxxxxxxxxxxxxxxxxx'), ENV), true);
  assert.equal(claveValida(req(ENV.MCP_KEY), ENV), true);
  assert.equal(claveValida(req('clave-de-jobs-xxxxxxxxxxxxxxxxxY'), ENV), false);
  const { client } = await cliente('clave-de-jobs-xxxxxxxxxxxxxxxxxx');
  assert.match(client.getInstructions(), /en yokup eres JobsGrokBot \(persona Jobs, equipo GrokBot, runtime Grok\)/);
  assert.match(client.getInstructions(), /yokup_alta[\s\S]*yokup_paso[\s\S]*yokup_evidencia[\s\S]*yokup_informe[\s\S]*yokup_ventana/);
  const sin = await cliente('clave-que-no-existe-xxxxxxxxxxxxx');
  assert.match(sin.client.getInstructions(), /no está asignada a ningún consejero/);
  const r = await sin.client.callTool({ name: 'yokup_mis_misiones', arguments: {} });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /sin identidad/);
});

test('el servidor publica las herramientas yokup', async () => {
  const { client } = await cliente();
  const nombres = (await client.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('yokup_')).sort();
  assert.deepEqual(nombres, ['yokup_alta', 'yokup_evidencia', 'yokup_informe', 'yokup_mis_misiones', 'yokup_paso', 'yokup_presencia', 'yokup_quien_soy', 'yokup_ventana']);
});

test('yokup_alta sigue el ritual de alta-mision.sh con la identidad del consejero', async () => {
  const { client, peticiones } = await cliente();
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', proyecto_id: 'yokup' } }));
  assert.equal(r.mision, 'FLT-1601');
  assert.deepEqual(r.plan, ['a: Auditar', 'b: Hacer', 'c: Cerrar']);
  const urls = peticiones.map((p) => p.url.replace(/\?.*$/, ''));
  assert.deepEqual(urls.slice(0, 3), ['https://yokup.test/projects', 'https://yokup.test/projects/principal', 'https://telegram.test/api/bot-inbox']);
  const principal = peticiones[1].body; assert.deepEqual(principal, { agent: 'WozniakGrokBot', machine: 'GrokBot', project_id: 'yokup', project: 'Yokup', project_slug: 'YOKUP', by: 'WozniakGrokBot' });
  const encargo = peticiones[2].body; assert.deepEqual(encargo, { text: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', target_persona: 'Wozniak', target_machine: 'GrokBot', project_id: 'yokup' });
  assert.ok(urls.includes('https://yokup.test/fleet/sync') && urls.includes('https://yokup.test/fleet/plan') && urls.includes('https://yokup.test/projects/mission'));
  const presencia = peticiones.find((p) => p.url.endsWith('/api/presence'));
  assert.equal(presencia.body.persona, 'Wozniak'); assert.equal(presencia.body.machine, 'GrokBot'); assert.equal(presencia.body.runtime, 'Grok'); assert.equal(presencia.body.model, 'Grok Heavy');
  assert.match(presencia.body.focus, /^misión FLT-1601/);
});

test('paso, evidencia (agent/session_transcript) e informe llevan owner, imagen y procedencia canónica', async () => {
  const { client, peticiones } = await cliente();
  const p = res(await client.callTool({ name: 'yokup_paso', arguments: { mision: 'FLT-1601', paso: 'a', estado: 'done', informe: 'hecho', tokens: 1200 } }));
  assert.equal(p.status, 'done');
  const ts = peticiones.find((x) => x.url.endsWith('/fleet/task-status')).body;
  assert.deepEqual(ts, { mission: 'FLT-1601', code: 'a', status: 'done', owner: 'WozniakGrokBot', report: 'hecho', tokens: 1200 });
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', transcripcion: '[Carlos] haz X\n[Wozniak] hecho X, salida: ok' } }));
  assert.equal(e.imagen, 'https://yokup.test/media/fleet/abc.png');
  const render = peticiones.find((x) => x.url.endsWith('/render-transcript'));
  assert.equal(render.headers['x-council-token'], 'token-maquina'); assert.match(render.body.title, /WozniakGrokBot · FLT-1601/); assert.match(render.body.footer, /WozniakGrokBot · Grok · Grok Heavy/);
  const media = peticiones.find((x) => x.url.endsWith('/fleet/media')); assert.equal(media.headers['content-type'], 'image/png'); assert.equal(media.bytes, 7);
  const prog = peticiones.find((x) => x.url.endsWith('/fleet/progress')).body;
  assert.equal(prog.owner, 'WozniakGrokBot'); assert.equal(prog.evidence_kind, 'process'); assert.equal(prog.capture_surface, 'agent'); assert.equal(prog.capture_context, 'session_transcript'); assert.equal(prog.degraded, false); assert.ok(Math.abs(prog.captured_at - Date.now()) < 5000);
  const i = res(await client.callTool({ name: 'yokup_informe', arguments: { mision: 'FLT-1601', informe: 'Trabajo terminado y verificado. Tiempo dedicado: 3 min. Puntos de la misión: +40. Total verificado: 40.' } }));
  assert.equal(i.resolved, true);
  const inf = peticiones.find((x) => x.url.endsWith('/fleet/informe')).body;
  assert.equal(inf.owner, 'WozniakGrokBot'); assert.equal(inf.host, 'app'); assert.equal(inf.runtime, 'Grok'); assert.equal(inf.image, 'https://yokup.test/media/fleet/abc.png'); assert.match(inf.report, /Puntos de la misión/);
});

test('ventana, misiones, marcador y quién soy', async () => {
  const { client, peticiones } = await cliente();
  const v = res(await client.callTool({ name: 'yokup_ventana', arguments: { pregunta: '¿Qué hago primero en yokup.com?', opciones: ['★ Uno recomendado', 'Dos alternativo', 'Tres alternativo'], proyecto_id: 'yokup' } }));
  assert.deepEqual(v.options, ['★ Uno recomendado', 'Dos alternativo', 'Tres alternativo', 'Volver atras', 'Custom']);
  const dec = peticiones.find((x) => x.url.endsWith('/decisions')).body;
  assert.equal(dec.agent, 'WozniakGrokBot'); assert.equal(dec.machine, 'GrokBot'); assert.equal(dec.recommended, 0); assert.equal(dec.minutes, 5); assert.equal(dec.project_id, 'yokup'); assert.equal(dec.user_override, true);
  const q = res(await client.callTool({ name: 'yokup_quien_soy', arguments: {} }));
  assert.equal(q.identidad.agent, 'WozniakGrokBot'); assert.equal(q.marcador.hoy.mission_points, 40); assert.equal(q.marcador.baremo.mission, 40);
});

test('/salud declara los secretos nuevos y los consejeros con carné', async () => {
  const salud = await (await manejar(new Request('https://mcp.test/salud'), ENV, { fetch: fetchFalso([]) })).json();
  assert.equal(salud.secretos.MCP_KEYS, true); assert.equal(salud.secretos.ADMIRA_TELEGRAM_PANEL_KEY, true);
  assert.deepEqual(salud.consejeros_con_carne, ['Wozniak', 'Jobs', 'Disney', 'Lucas']);
});

test('crearYokup sin identidad falla legible en todo menos en construirse', async () => {
  const y = crearYokup(ENV, null, { fetch: fetchFalso([]) });
  await assert.rejects(() => y.presencia({ foco: 'x' }), /sin identidad/);
});

test('bot-inbox y presencia van por el service binding TELEGRAM cuando existe (Cloudflare 1042)', async () => {
  const porBinding = [];
  const env = { ...ENV, TELEGRAM: { fetch: async (url, init) => { porBinding.push(String(url)); return new Response(JSON.stringify({ ok: true, via: 'binding' }), { status: 200 }); } } };
  const y = crearYokup(env, identidadPorClave(ENV.MCP_KEY, ENV), { fetch: fetchFalso([]) });
  const r = await y.presencia({ foco: 'prueba' });
  assert.equal(r.via, 'binding');
  assert.deepEqual(porBinding, ['https://telegram.test/api/presence']);
});
