import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar, claveValida } from '../src/index.js';
import { identidadPorClave, crearYokup } from '../src/yokup.js';

// FLT-1580: los consejeros de GrokBot dentro de la flota. Sin red: yokup, el bot-inbox
// y el Mac Mini se sustituyen por un fetch falso que graba el ritual completo.

const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
const JPEG = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const INFORME = 'Trabajo terminado y verificado. Tiempo dedicado: 3 min. Puntos de la misión: +40. Total verificado: 40.';

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
    peticiones.push({ url: u, method, headers: init.headers || {}, body, bytes: init.body && typeof init.body !== 'string' ? init.body.length : 0, raw: init.body && typeof init.body !== 'string' ? init.body : null });
    const ok = (o, extra = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' }, ...extra });
    if (u.endsWith('/projects') && method === 'GET') return ok({ projects: [{ id: 'yokup', name: 'Yokup' }, { id: 'admira-live', name: 'Admira Live · Consejo' }] });
    if (u.endsWith('/projects/principal')) return ok({ ok: true });
    if (/\/decisions\/[^/]+\/choose$/.test(u)) return ok({ ok: true, id: 'DEC-1', display_ref: '0020.10/09/2026.06:37', chosen: body.choice, option: 'La elegida', batch: { relabelled: 'MIS-DEC-1-01' } });
    if (u.endsWith('/api/bot-inbox')) { if ((init.headers || {}).authorization !== 'Bearer panel') return new Response('{"ok":false}', { status: 401 }); estado.encargo = body; return ok({ ok: true, id: 1601 }); }
    if (u.endsWith('/fleet/sync')) { estado.syncs++; return ok({ ok: true }); }
    if (u.includes('/fleet/missions')) {
      // Filtro en el servidor (agent=WozniakGrokBot): la lista solo trae misiones del titular.
      estado.filtros = (estado.filtros || []).concat(new URL(u).searchParams.get('agent') || '');
      const tareas = estado.tareas || [{ code: 'a', status: 'pending', title: 'Uno' }];
      const hayLista = (estado.encargo && estado.syncs >= (estado.syncsNecesarios || 1)) || estado.misiones;
      const lista = hayLista ? [{ id: 'FLT-1601', persona: 'WozniakGrokBot', subject: estado.encargo && estado.encargo.text, project_id: estado.encargo && estado.encargo.project_id, created_at: estado.creadaEn || Date.now(), display_ref: '0301.04/09/2026.07:30', status: 'open', tasks: tareas }] : [];
      if (estado.contenedor && estado.encargo) lista.unshift({ id: 'MIS-DEC-x-01', persona: 'WozniakGrokBot', subject: estado.encargo.text, project_id: estado.encargo.project_id, created_at: Date.now(), status: 'in_progress', tasks: [] });
      return ok({ missions: lista });
    }
    if (u.endsWith('/projects/mission')) return ok({ ok: true });
    if (u.includes('/fleet/plan')) return ok({ ok: true, tasks: [{ code: 'a', title: 'Auditar' }, { code: 'b', title: 'Hacer' }, { code: 'c', title: 'Cerrar' }] });
    if (u.endsWith('/fleet/task-status')) return ok({ ok: true, mission: body.mission, code: body.code, status: body.status });
    if (u.endsWith('/api/council/render-transcript')) { if ((init.headers || {})['x-council-token'] !== 'token-maquina') return new Response('no', { status: 401 }); return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }); }
    if (u.startsWith('https://capturas.test/')) {
      if (u.endsWith('/grande.png')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } });
      if (u.endsWith('/pagina.html')) return new Response('<html>no</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (u.endsWith('/shot.jpg')) return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.length) } });
      if (u.endsWith('/shot.webp')) return new Response(WEBP, { status: 200, headers: { 'content-type': 'image/webp', 'content-length': String(WEBP.length) } });
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(PNG.length) } });
    }
    if (u.endsWith('/fleet/media')) return ok({ ok: true, url: 'https://yokup.test/media/fleet/abc.png', key: 'abc', contentType: (init.headers || {})['content-type'] || '' });
    if (u.endsWith('/fleet/progress')) return ok({ ok: true, mission: body.mission, evidence_updated: true, evidence_kind: body.evidence_kind, capture_surface: body.capture_surface, capture_context: body.capture_context });
    if (u.endsWith('/fleet/informe')) return ok({ ok: true, mission: body.mission, resolved: true, proof_image: body.image });
    if (u.endsWith('/decisions')) return ok({ ok: true, id: 'DEC-x', display_ref: '0302.04/09/2026.07:31', options: body.options });
    if (u.endsWith('/api/presence')) return ok({ ok: true, echoed: body });
    if (u.endsWith('/highscore/daily')) return ok({ day: '2026-09-04', weights: { mission: 40, window: 8 }, scores: [{ agent: 'WozniakGrokBot', mission_points: 40, window_points: 0, missions: 1, windows: 0 }], hourly: { scores: [] } });
    return new Response('Not found', { status: 404 });
  };
}

async function cliente(clave = ENV.MCP_KEY, env = ENV, extra = {}) {
  const peticiones = [], estado = {}, fondo = [];
  // waitUntil y esperaImportacion: lo que el worker haría tras responder (ctx.waitUntil) se
  // recoge en `fondo` para poder esperarlo en la prueba, y sin dormir de verdad.
  const server = crearServidor(env, { fetch: fetchFalso(peticiones, estado), now: () => Date.now(), waitUntil: (p) => fondo.push(p), esperaImportacion: 0, ...extra }, identidadPorClave(clave, env));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'grokbot-de-prueba', version: '0.39.0' });
  await client.connect(a);
  return { client, peticiones, estado, fondo };
}
const res = (r) => JSON.parse(r.content[0].text);

test('la identidad sale de la clave: MCP_KEY es Wozniak, MCP_KEYS mapea a los demás, y el nombre largo firma corto', () => {
  assert.deepEqual(identidadPorClave(ENV.MCP_KEY, ENV), { persona: 'Wozniak', machine: 'GrokBot', runtime: 'Grok', model: 'Grok Heavy', agent: 'WozniakGrokBot', tipo: 'consejero' });
  assert.equal(identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxx', ENV).agent, 'JobsGrokBot');
  assert.equal(identidadPorClave('clave-de-disney-xxxxxxxxxxxxxxxx', ENV).agent, 'DisneyGrokBot', 'el nombre largo firma con el apellido del diccionario');
  assert.equal(identidadPorClave('otra', ENV), null);
  assert.equal(identidadPorClave('', ENV), null);
});

test('MCP_KEYS Musk y Elon Musk resuelven a MuskGrokBot', () => {
  const env = { ...ENV, MCP_KEYS: JSON.stringify({ ...KEYS, 'clave-de-musk-xxxxxxxxxxxxxxxxx': { persona: 'Musk' }, 'clave-de-elon-musk-xxxxxxxxxxxxx': { persona: 'Elon Musk' } }) };
  assert.deepEqual(identidadPorClave('clave-de-musk-xxxxxxxxxxxxxxxxx', env), { persona: 'Musk', machine: 'GrokBot', runtime: 'Grok', model: 'Grok Heavy', agent: 'MuskGrokBot', tipo: 'consejero' });
  assert.equal(identidadPorClave('clave-de-elon-musk-xxxxxxxxxxxxx', env).agent, 'MuskGrokBot');
});

test('las claves por consejero abren /mcp y las instrucciones dicen quién eres', async () => {
  const req = (k) => new Request('https://mcp.test/mcp', { headers: { authorization: `Bearer ${k}` } });
  assert.equal(await claveValida(req('clave-de-jobs-xxxxxxxxxxxxxxxxxx'), ENV), true);
  assert.equal(await claveValida(req(ENV.MCP_KEY), ENV), true);
  assert.equal(await claveValida(req('clave-de-jobs-xxxxxxxxxxxxxxxxxY'), ENV), false);
  const { client } = await cliente('clave-de-jobs-xxxxxxxxxxxxxxxxxx');
  assert.match(client.getInstructions(), /en yokup eres JobsGrokBot \(persona Jobs, equipo GrokBot, runtime Grok\)/);
  assert.match(client.getInstructions(), /yokup_alta[\s\S]*yokup_paso[\s\S]*yokup_evidencia[\s\S]*yokup_informe[\s\S]*yokup_ventana/);
  const sin = await cliente('clave-que-no-existe-xxxxxxxxxxxxx');
  assert.match(sin.client.getInstructions(), /no está asignada a nadie/);
  const r = await sin.client.callTool({ name: 'yokup_mis_misiones', arguments: {} });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /sin identidad/);
});

test('el servidor publica las herramientas yokup', async () => {
  const { client } = await cliente();
  const nombres = (await client.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('yokup_')).sort();
  assert.deepEqual(nombres, ['yokup_alta', 'yokup_decidir', 'yokup_evidencia', 'yokup_informe', 'yokup_mis_misiones', 'yokup_paso', 'yokup_presencia', 'yokup_quien_soy', 'yokup_ventana']);
});

test('yokup_alta sigue el ritual de alta-mision.sh con la identidad del consejero y responde sin esperar al planificador', async () => {
  const { client, peticiones, estado, fondo } = await cliente();
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', proyecto_id: 'yokup' } }));
  assert.equal(r.mision, 'FLT-1601');
  assert.equal(r.encargo, 1601);
  assert.match(r.plan, /en curso/, 'el plan no se espera: el cliente de GrokBot corta antes de los 60 s del planificador');
  let urls = peticiones.map((p) => p.url.replace(/\?.*$/, ''));
  assert.deepEqual(urls.slice(0, 4), ['https://yokup.test/projects', 'https://yokup.test/fleet/missions', 'https://yokup.test/projects/principal', 'https://telegram.test/api/bot-inbox'], 'primero mira si ya existe; luego declara y encarga');
  assert.deepEqual(estado.filtros.slice(0, 1), ['WozniakGrokBot'], 'las misiones se piden filtradas por el titular en el servidor');
  const principal = peticiones[2].body; assert.deepEqual(principal, { agent: 'WozniakGrokBot', machine: 'GrokBot', project_id: 'yokup', project: 'Yokup', project_slug: 'YOKUP', by: 'WozniakGrokBot' });
  const encargo = peticiones[3].body; assert.deepEqual(encargo, { text: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', target_persona: 'Wozniak', target_machine: 'GrokBot', project_id: 'yokup' });
  assert.ok(urls.includes('https://yokup.test/fleet/sync'));
  assert.equal(fondo.length, 1, 'el plan queda en ctx.waitUntil, fuera del camino de la respuesta');
  await Promise.all(fondo);
  urls = peticiones.map((p) => p.url.replace(/\?.*$/, ''));
  assert.ok(urls.includes('https://yokup.test/fleet/plan') && urls.includes('https://yokup.test/projects/mission'), 'en segundo plano se cuelga del proyecto y se planifica');
  const presencia = peticiones.find((p) => p.url.endsWith('/api/presence'));
  assert.equal(presencia.body.persona, 'Wozniak'); assert.equal(presencia.body.machine, 'GrokBot'); assert.equal(presencia.body.runtime, 'Grok'); assert.equal(presencia.body.model, 'Grok Heavy');
  assert.match(presencia.body.focus, /^misión FLT-1601/);
  for (const p of peticiones.filter((x) => x.url.endsWith('/api/presence'))) {
    assert.equal(p.body.working, undefined, 'el latido automático no marca trabajando');
    assert.equal(p.body.mode, undefined);
    assert.equal(p.body.encargo, undefined);
  }
});

test('yokup_alta es idempotente: el mismo asunto vivo devuelve la misma misión y no encarga otra (timeout del cliente → reintento)', async () => {
  const { client, peticiones, fondo } = await cliente();
  const encargo = 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre';
  res(await client.callTool({ name: 'yokup_alta', arguments: { encargo, proyecto_id: 'yokup' } }));
  await Promise.all(fondo);
  const antes = peticiones.filter((p) => p.url.endsWith('/api/bot-inbox')).length;
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo, proyecto_id: 'yokup' } }));
  assert.equal(r.mision, 'FLT-1601'); assert.equal(r.ya_existia, true);
  assert.equal(peticiones.filter((p) => p.url.endsWith('/api/bot-inbox')).length, antes, 'ni un encargo más en el bot-inbox');
  assert.match(r.siguiente, /yokup_paso \(FLT-1601/);
});

test('yokup_alta con otra misión abierta hace <10 min en el mismo proyecto avisa de posible duplicado, salvo forzar:true', async () => {
  const { client, peticiones, fondo } = await cliente();
  res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'HandON 7-sep: lidero admiranext.com. a) mapa sitio; b) anotar handON', proyecto_id: 'yokup' } }));
  await Promise.all(fondo);
  const antes = peticiones.filter((p) => p.url.endsWith('/api/bot-inbox')).length;
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'HandON 7-sep Jobs=admiranext.com mapa+fusión. a) mapa sitio; b) handON', proyecto_id: 'yokup' } }));
  assert.equal(r.mision, 'FLT-1601'); assert.equal(r.posible_duplicado, true);
  assert.equal(peticiones.filter((p) => p.url.endsWith('/api/bot-inbox')).length, antes, 'Jobs reformuló tres veces el mismo alta en tres minutos: no se crea otra');
  const f = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Otra misión de verdad: auditar consumo. a) medir b) publicar c) cerrar', proyecto_id: 'yokup', forzar: true } }));
  assert.equal(f.mision, 'FLT-1601', 'con forzar:true se encarga de nuevo (el falso siempre devuelve FLT-1601)');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/api/bot-inbox')).length, antes + 1);
});

test('yokup_alta espera un segundo sync en primer plano y aún así devuelve FLT (presupuesto <15s del cliente GrokBot)', async () => {
  const { client, estado, fondo } = await cliente();
  estado.syncsNecesarios = 2;
  const t0 = Date.now();
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', proyecto_id: 'yokup' } }));
  assert.ok(Date.now() - t0 < 15000, 'la respuesta tiene que salir antes del timeout -32001 de GrokBot');
  assert.equal(r.mision, 'FLT-1601');
  assert.equal(r.estado, undefined);
  assert.equal(estado.syncs, 2);
  await Promise.all(fondo);
});

test('si yokup tarda en importar, yokup_alta contesta «importando» con el número de encargo y termina en segundo plano', async () => {
  const { client, peticiones, estado, fondo } = await cliente();
  estado.syncsNecesarios = 3;
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', proyecto_id: 'yokup' } }));
  assert.equal(r.mision, null); assert.equal(r.estado, 'importando'); assert.equal(r.encargo, 1601);
  assert.match(r.nota, /NO repitas yokup_alta/);
  assert.equal(fondo.length, 1);
  await Promise.all(fondo);
  const urls = peticiones.map((p) => p.url.replace(/\?.*$/, ''));
  assert.ok(urls.includes('https://yokup.test/fleet/plan'), 'la importación siguió sola y se planificó');
  assert.ok(estado.syncs >= 3);
});

test('yokup_quien_soy: sin «como» la clave de la silla firma sin aviso; con «como» de otra silla la firma delegada se anuncia', async () => {
  const { client } = await cliente();
  const sin = res(await client.callTool({ name: 'yokup_quien_soy', arguments: {} }));
  assert.equal(sin.identidad.agent, 'WozniakGrokBot'); assert.equal(sin.aviso, undefined, 'con conector por silla, la clave ya dice quién eres: sin aviso');
  const con = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Jobs' } }));
  assert.equal(con.identidad.agent, 'JobsGrokBot'); assert.match(con.aviso, /firma delegada/, 'con la clave de Wozniak, Jobs firma delegado y se le dice');
  const propio = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Wozniak' } }));
  assert.equal(propio.identidad.agent, 'WozniakGrokBot'); assert.equal(propio.aviso, undefined, 'con su propia clave y su como, sin aviso');
});

test('firma delegada: con la clave de Wozniak y como=Jobs se firma como Jobs y queda anotada la clave usada', async () => {
  const { client, peticiones } = await cliente();
  const r = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Jobs' } }));
  assert.equal(r.identidad.agent, 'JobsGrokBot'); assert.equal(r.identidad.firmado_con_clave_de, 'WozniakGrokBot'); assert.match(r.aviso, /firma delegada/);
  res(await client.callTool({ name: 'yokup_paso', arguments: { como: 'Jobs', mision: 'FLT-1601', paso: 'a', estado: 'in_progress' } }));
  assert.equal(peticiones.find((x) => x.url.endsWith('/fleet/task-status')).body.owner, 'JobsGrokBot');
});

test('modo estricto (MCP_FIRMA_ESTRICTA=1): la clave de una silla no firma por otra', async () => {
  const { client } = await cliente(ENV.MCP_KEY, { ...ENV, MCP_FIRMA_ESTRICTA: '1' });
  const r = await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Jobs' } });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /clave es la de WozniakGrokBot y no puede firmar como Jobs/);
  const yo = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Wozniak' } }));
  assert.equal(yo.identidad.agent, 'WozniakGrokBot'); assert.equal(yo.aviso, undefined);
});

test('el enum como incluye a Musk', async () => {
  const { client } = await cliente();
  const tool = (await client.listTools()).tools.find((t) => t.name === 'yokup_quien_soy');
  const blob = JSON.stringify(tool.inputSchema);
  for (const nombre of ['Wozniak', 'Jobs', 'Lucas', 'Disney', 'Musk']) assert.match(blob, new RegExp(nombre));
});

test('una clave de agente de la flota no firma como consejero con como (ni en modo estricto ni sin él)', async () => {
  const { claveFlota, identidadPorClaveAsync } = await import('../src/yokup.js');
  for (const estricta of ['1', '0']) {
    const env = { ...ENV, MCP_FLOTA_SEED: 'semilla-de-prueba', MCP_FIRMA_ESTRICTA: estricta };
    const clave = await claveFlota(env, 'Arquitecto', 'CursorCloud');
    const id = await identidadPorClaveAsync(clave, env);
    assert.equal(id.agent, 'ArquitectoCursorCloud'); assert.equal(id.tipo, 'agente');
    const peticiones = [], estado = {}, fondo = [];
    const server = crearServidor(env, { fetch: fetchFalso(peticiones, estado), now: () => Date.now(), waitUntil: (p) => fondo.push(p) }, id);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: 'arquitecto', version: '1' });
    await client.connect(a);
    const r = await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Musk' } });
    assert.equal(r.isError, true, 'estricta=' + estricta);
    assert.match(r.content[0].text, /ArquitectoCursorCloud \(agente de la flota\) y no puede firmar como Musk/);
    const yo = res(await client.callTool({ name: 'yokup_quien_soy', arguments: {} }));
    assert.equal(yo.identidad.agent, 'ArquitectoCursorCloud');
    assert.equal(yo.identidad.tipo, 'agente');
  }
});

test('la clave HMAC de Merovingio en GrokBotBox es MerovingioGrokBotBox y tampoco suplanta a Musk', async () => {
  const { claveFlota, identidadPorClaveAsync } = await import('../src/yokup.js');
  const env = { ...ENV, MCP_FLOTA_SEED: 'semilla-de-prueba', MCP_FIRMA_ESTRICTA: '1' };
  const clave = await claveFlota(env, 'Merovingio', 'GrokBotBox');
  const id = await identidadPorClaveAsync(clave, env);
  assert.deepEqual(id, { persona: 'Merovingio', machine: 'GrokBotBox', runtime: 'Grok CLI', model: '', agent: 'MerovingioGrokBotBox', tipo: 'agente' });
  const peticiones = [], estado = {}, fondo = [];
  const server = crearServidor(env, { fetch: fetchFalso(peticiones, estado), now: () => Date.now(), waitUntil: (p) => fondo.push(p) }, id);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'merovingio', version: '1' });
  await client.connect(a);
  const r = await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Musk' } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /no puede firmar como Musk/);
  const yo = res(await client.callTool({ name: 'yokup_quien_soy', arguments: {} }));
  assert.equal(yo.identidad.agent, 'MerovingioGrokBotBox');
});

test('clave compartida del Consejo (MCP_KEY_CONSEJO): sin como no firma; con como firma esa silla sin firma delegada', async () => {
  const env = { ...ENV, MCP_KEY_CONSEJO: 'clave-compartida-del-consejo-xxxxxxxx' };
  const { client } = await cliente(env.MCP_KEY_CONSEJO, env);
  const sin = await client.callTool({ name: 'yokup_quien_soy', arguments: {} });
  assert.equal(sin.isError, true); assert.match(sin.content[0].text, /no firma por nadie: pasa como=/);
  const con = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Disney' } }));
  assert.equal(con.identidad.agent, 'DisneyGrokBot'); assert.equal(con.identidad.firmado_con_clave_de, undefined); assert.equal(con.aviso, undefined);
  const musk = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Musk' } }));
  assert.equal(musk.identidad.agent, 'MuskGrokBot'); assert.equal(musk.aviso, undefined);
});

test('yokup_mis_misiones pide al servidor solo las del titular', async () => {
  const { client, estado } = await cliente();
  res(await client.callTool({ name: 'yokup_mis_misiones', arguments: {} }));
  assert.deepEqual(estado.filtros, ['WozniakGrokBot']);
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
  assert.deepEqual(salud.consejeros_con_carne, ['Wozniak', 'Jobs', 'Lucas', 'Disney', 'Musk']);
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

test('yokup_decidir registra la elección de Carlos por id o referencia humana, también tras caducar', async () => {
  const { client, peticiones } = await cliente();
  const r = res(await client.callTool({ name: 'yokup_decidir', arguments: { ventana: '0020.10/09/2026.06:37', opcion: 1 } }));
  const p = peticiones.find((x) => /\/decisions\/.*\/choose$/.test(x.url));
  assert.ok(p.url.endsWith('/decisions/0020.10%2F09%2F2026.06%3A37/choose'));
  assert.deepEqual(p.body, { choice: 0, by: 'Carlos (vía WozniakGrokBot)' });
  assert.equal(r.chosen, 0); assert.match(r.siguiente, /MIS-DEC-1-01 ya lleva la opción elegida/);
});

test('yokup_presencia reenvía working y mode solo cuando llega trabajando', async () => {
  const { client, peticiones } = await cliente();
  const tool = (await client.listTools()).tools.find((t) => t.name === 'yokup_presencia');
  assert.match(tool.description, /trabajando:true/);
  assert.match(tool.description, /cada 60 s/);
  assert.match(tool.description, /trabajando:false/);
  const on = res(await client.callTool({ name: 'yokup_presencia', arguments: { foco: 'boca de Elon', trabajando: true, encargo: 101302 } }));
  assert.equal(on.ok, true);
  const body = peticiones.filter((p) => p.url.endsWith('/api/presence')).at(-1).body;
  assert.equal(body.persona, 'Wozniak');
  assert.equal(body.working, true);
  assert.equal(body.mode, 'trabajando');
  assert.equal(body.encargo, 101302);
  assert.equal(body.focus, 'boca de Elon');
  const off = res(await client.callTool({ name: 'yokup_presencia', arguments: { foco: 'paro', trabajando: false, encargo: 101302 } }));
  assert.equal(off.ok, true);
  const stopped = peticiones.filter((p) => p.url.endsWith('/api/presence')).at(-1).body;
  assert.equal(stopped.working, false);
  assert.equal(stopped.mode, 'pasivo');
  assert.equal(stopped.encargo, 101302);
  const plain = res(await client.callTool({ name: 'yokup_presencia', arguments: { foco: 'solo foco', tarea: 't', proyecto: 'yokup' } }));
  assert.equal(plain.ok, true);
  assert.deepEqual(peticiones.filter((p) => p.url.endsWith('/api/presence')).at(-1).body, {
    persona: 'Wozniak', machine: 'GrokBot', runtime: 'Grok', focus: 'solo foco', host: 'app', model: 'Grok Heavy', task: 't', project: 'yokup'
  });
});

test('las descripciones piden captura real de www.admira.live/highscore al inicio y al cierre', async () => {
  const { client } = await cliente();
  const tools = (await client.listTools()).tools;
  const ev = tools.find((t) => t.name === 'yokup_evidencia');
  const inf = tools.find((t) => t.name === 'yokup_informe');
  const pa = tools.find((t) => t.name === 'yokup_paso');
  for (const t of [ev, inf, pa]) {
    assert.match(t.description, /Norma de Carlos/);
    assert.match(t.description, /www\.admira\.live\/highscore/);
  }
  assert.match(ev.description, /momento inicio/);
  assert.match(inf.description, /en imagen/);
  assert.match(client.getInstructions(), /www\.admira\.live\/highscore/);
  const evSchema = JSON.stringify(ev.inputSchema);
  assert.match(evSchema, /imagen_base64/);
  assert.match(evSchema, /imagen_url/);
  assert.match(evSchema, /inicio/);
  assert.match(evSchema, /cierre/);
  assert.match(evSchema, /proceso/);
  assert.ok(!(ev.inputSchema.required || []).includes('transcripcion'), 'la transcripción puede omitirse si hay captura');
  assert.ok(inf.inputSchema.properties.imagen);
  assert.match(pa.description, /data:image\/\(png\|webp\|jpeg\);base64/);
});

test('yokup_evidencia solo con transcripción sigue en /fleet/progress y no enlaza task-status', async () => {
  const { client, peticiones } = await cliente();
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', transcripcion: '[Carlos] haz X\n[Wozniak] hecho X, salida: ok' } }));
  assert.equal(e.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(e.paso, undefined);
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/task-status')), false);
  assert.ok(peticiones.some((p) => p.url.endsWith('/fleet/progress')));
  assert.ok(peticiones.some((p) => p.url.endsWith('/render-transcript')));
});

test('yokup_evidencia sube base64, data URL y URL https, y enlaza task-status sin status', async () => {
  const { client, peticiones } = await cliente();
  const crudo = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_base64: b64(PNG) } }));
  assert.equal(crudo.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(crudo.paso, 'a');
  let media = peticiones.filter((p) => p.url.endsWith('/fleet/media'));
  assert.equal(media.length, 1);
  assert.equal(media[0].headers['content-type'], 'image/png');
  assert.equal(Buffer.from(media[0].raw).subarray(0, 8).toString('hex'), Buffer.from(PNG).subarray(0, 8).toString('hex'));
  let ts = peticiones.filter((p) => p.url.endsWith('/fleet/task-status')).at(-1).body;
  assert.deepEqual(ts, { mission: 'FLT-1601', code: 'a', owner: 'WozniakGrokBot', image: 'https://yokup.test/media/fleet/abc.png' });
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/progress')), false);
  assert.equal(peticiones.some((p) => p.url.endsWith('/render-transcript')), false);

  const data = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', paso: 'b', imagen_base64: `data:image/webp;base64,${b64(WEBP)}` } }));
  assert.equal(data.paso, 'b');
  media = peticiones.filter((p) => p.url.endsWith('/fleet/media'));
  assert.equal(media.at(-1).headers['content-type'], 'image/webp');
  assert.equal(Buffer.from(media.at(-1).raw).subarray(8, 12).toString('ascii'), 'WEBP');
  ts = peticiones.filter((p) => p.url.endsWith('/fleet/task-status')).at(-1).body;
  assert.equal(ts.code, 'b');
  assert.equal('status' in ts, false);

  const url = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_url: 'https://capturas.test/shot.jpg' } }));
  assert.equal(url.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(url.paso, 'a');
  media = peticiones.filter((p) => p.url.endsWith('/fleet/media'));
  assert.equal(media.at(-1).headers['content-type'], 'image/jpeg');
  assert.equal(Buffer.from(media.at(-1).raw).subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.ok(peticiones.some((p) => p.url === 'https://capturas.test/shot.jpg'));
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/progress')), false);
});

test('yokup_evidencia reutiliza una URL /media/fleet sin volver a subirla', async () => {
  const { client, peticiones } = await cliente();
  const ya = 'https://api.yokup.com/media/fleet/deadbeef.png';
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_url: ya } }));
  assert.equal(e.imagen, ya);
  assert.equal(e.paso, 'a');
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/media')), false);
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/progress')), false);
  const ts = peticiones.find((p) => p.url.endsWith('/fleet/task-status')).body;
  assert.equal(ts.image, ya);
  assert.equal(ts.code, 'a');
  assert.equal('status' in ts, false);
  const delApi = 'https://yokup.test/media/fleet/abc.png';
  const e2 = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', paso: 'c', imagen_url: delApi } }));
  assert.equal(e2.imagen, delApi);
  assert.equal(e2.paso, 'c');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/media')).length, 0);
});

test('yokup_evidencia rechaza firma que no coincide y no sube', async () => {
  const { client, peticiones } = await cliente();
  const mal = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_base64: `data:image/png;base64,${b64(JPEG)}` } });
  assert.equal(mal.isError, true);
  assert.match(mal.content[0].text, /image_content_mismatch/);
  assert.match(mal.content[0].text, /image\/jpeg/);
  const html = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_url: 'https://capturas.test/pagina.html' } });
  assert.equal(html.isError, true);
  assert.match(html.content[0].text, /image_content_mismatch/);
  const http = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_url: 'http://capturas.test/shot.png' } });
  assert.equal(http.isError, true);
  assert.match(http.content[0].text, /https/);
  const grande = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_url: 'https://capturas.test/grande.png' } });
  assert.equal(grande.isError, true);
  assert.match(grande.content[0].text, /10 MB/);
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/media')), false);
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/task-status')), false);
  assert.equal(peticiones.some((p) => p.url.startsWith('http://')), false);
});

test('yokup_evidencia con momento cierre usa el último paso que no es z, y sin paso deducible avisa', async () => {
  const { client, peticiones, estado } = await cliente();
  estado.misiones = true;
  estado.tareas = [
    { code: 'a', status: 'done', title: 'Abrir' },
    { code: 'b', status: 'done', title: 'Hacer' },
    { code: 'c', status: 'in_progress', title: 'Cerrar' },
    { code: 'z', status: 'pending', title: 'Z' },
  ];
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'cierre', imagen_base64: b64(JPEG) } }));
  assert.equal(e.paso, 'c');
  assert.equal(peticiones.find((p) => p.url.endsWith('/fleet/task-status')).body.code, 'c');
  assert.equal(peticiones.find((p) => p.url.endsWith('/fleet/media')).headers['content-type'], 'image/jpeg');

  estado.tareas = [{ code: 'z', status: 'pending', title: 'Z' }];
  const soloZ = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'cierre', imagen_base64: b64(PNG) } });
  assert.equal(soloZ.isError, true);
  assert.match(soloZ.content[0].text, /distintos de z/);

  const sinPaso = await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'proceso', imagen_url: 'https://api.yokup.com/media/fleet/x.png' } });
  assert.equal(sinPaso.isError, true);
  assert.match(sinPaso.content[0].text, /falta paso/);
  const mediasTrasError = peticiones.filter((p) => p.url.endsWith('/fleet/media')).length;
  assert.equal(mediasTrasError, 1, 'el cierre inválido y el proceso sin paso no suben otra imagen');
});

test('yokup_evidencia con imagen y transcripción enlaza la captura y además registra el proceso', async () => {
  const { client, peticiones } = await cliente();
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_base64: `data:image/jpeg;base64,${b64(JPEG)}`, transcripcion: '[Carlos] haz X\n[Wozniak] hecho X, salida: ok' } }));
  assert.equal(e.paso, 'a');
  assert.equal(e.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(e.transcripcion_imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(e.evidence_kind, 'process');
  const medias = peticiones.filter((p) => p.url.endsWith('/fleet/media'));
  assert.equal(medias.length, 2);
  assert.equal(medias[0].headers['content-type'], 'image/jpeg');
  assert.equal(medias[1].bytes, 7, 'el PNG de la transcripción sigue saliendo del Mac Mini');
  assert.ok(peticiones.some((p) => p.url.endsWith('/fleet/progress')));
  assert.equal(peticiones.find((p) => p.url.endsWith('/fleet/task-status')).body.code, 'a');
});

test('yokup_evidencia solo con captura no exige COUNCIL_MACHINE_TOKEN', async () => {
  const { client, peticiones } = await cliente(ENV.MCP_KEY, { ...ENV, COUNCIL_MACHINE_TOKEN: '' });
  const e = res(await client.callTool({ name: 'yokup_evidencia', arguments: { mision: 'FLT-1601', momento: 'inicio', imagen_base64: b64(PNG) } }));
  assert.equal(e.paso, 'a');
  assert.equal(e.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(peticiones.some((p) => p.url.endsWith('/render-transcript')), false);
});

test('yokup_informe con imagen no llama a renderYSubir; sin imagen sigue pintando la transcripción', async () => {
  const { client, peticiones } = await cliente();
  const conUrl = res(await client.callTool({ name: 'yokup_informe', arguments: { mision: 'FLT-1601', informe: INFORME, imagen: 'https://api.yokup.com/media/fleet/cierre.png' } }));
  assert.equal(conUrl.imagen, 'https://api.yokup.com/media/fleet/cierre.png');
  assert.equal(conUrl.proof_image, 'https://api.yokup.com/media/fleet/cierre.png');
  assert.equal(peticiones.some((p) => p.url.endsWith('/render-transcript')), false);
  assert.equal(peticiones.some((p) => p.url.endsWith('/fleet/media')), false);
  assert.equal(peticiones.find((p) => p.url.endsWith('/fleet/informe')).body.image, 'https://api.yokup.com/media/fleet/cierre.png');
  assert.match(peticiones.find((p) => p.url.endsWith('/fleet/informe')).body.report, /Puntos de la misión/);

  const conB64 = res(await client.callTool({ name: 'yokup_informe', arguments: { mision: 'FLT-1601', informe: INFORME, imagen: `data:image/png;base64,${b64(PNG)}`, transcripcion_final: 'esto no debe pintarse como prueba' } }));
  assert.equal(conB64.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/render-transcript')).length, 0);
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/media')).at(-1).headers['content-type'], 'image/png');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/informe')).at(-1).body.image, 'https://yokup.test/media/fleet/abc.png');

  const conDescarga = res(await client.callTool({ name: 'yokup_informe', arguments: { mision: 'FLT-1601', informe: INFORME, imagen: 'https://capturas.test/shot.webp' } }));
  assert.equal(conDescarga.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/media')).at(-1).headers['content-type'], 'image/webp');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/render-transcript')).length, 0);

  const sin = res(await client.callTool({ name: 'yokup_informe', arguments: { mision: 'FLT-1601', informe: INFORME } }));
  assert.equal(sin.imagen, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/render-transcript')).length, 1);
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/informe')).at(-1).body.image, 'https://yokup.test/media/fleet/abc.png');
});

test('yokup_paso sube data:image y deja pasar la URL http(s) como hasta ahora', async () => {
  const { client, peticiones } = await cliente();
  res(await client.callTool({ name: 'yokup_paso', arguments: { mision: 'FLT-1601', paso: 'b', estado: 'done', informe: 'captura', imagen: `data:image/jpeg;base64,${b64(JPEG)}` } }));
  const media = peticiones.find((p) => p.url.endsWith('/fleet/media'));
  assert.equal(media.headers['content-type'], 'image/jpeg');
  const ts = peticiones.find((p) => p.url.endsWith('/fleet/task-status')).body;
  assert.equal(ts.status, 'done');
  assert.equal(ts.code, 'b');
  assert.equal(ts.image, 'https://yokup.test/media/fleet/abc.png');
  assert.equal(ts.report, 'captura');

  res(await client.callTool({ name: 'yokup_paso', arguments: { mision: 'FLT-1601', paso: 'a', estado: 'in_progress', imagen: 'https://ejemplo.test/ya.png' } }));
  const directo = peticiones.filter((p) => p.url.endsWith('/fleet/task-status')).at(-1).body;
  assert.equal(directo.image, 'https://ejemplo.test/ya.png');
  assert.equal(directo.status, 'in_progress');
  assert.equal(peticiones.filter((p) => p.url.endsWith('/fleet/media')).length, 1, 'la URL https no se vuelve a subir');
});

test('yokup_alta no confunde el contenedor de una ventana (MIS-DEC) con la misión recién encargada', async () => {
  const { client, estado } = await cliente();
  estado.contenedor = true;
  const r = res(await client.callTool({ name: 'yokup_alta', arguments: { encargo: 'Probar el carné de GrokBot en yokup. a) alta b) pasos c) cierre', proyecto_id: 'yokup' } }));
  assert.equal(r.mision, 'FLT-1601');
});
