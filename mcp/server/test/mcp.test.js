import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar, claveValida } from '../src/index.js';
import { consejeros, resumirRespuesta, CONSEJEROS } from '../src/consejo.js';

// admira-live-mcp (FLT-1578): lo que un cliente MCP —GrokBot— va a ver y hacer, sin red.
// El Consejo se sustituye por un fetch falso que graba qué se le pidió.

const ENV = { MCP_KEY: 'clave-de-prueba-larga', COUNCIL_MACHINE_TOKEN: 'token-maquina', AGORA_SYNC_KEY: 'agora',
  COUNCIL_BASE: 'https://consejo.test/council', FLEET_BASE: 'https://consejo.test/api', AGORA_WORKER: 'https://agora.test', VERSION: 'v.04.09.2026.r1.06:20' };

function fetchFalso(peticiones) {
  return async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    peticiones.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body });
    const u = String(url);
    const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/api/council/models')) return ok({ models: [{ key: 'claude-sonnet', free: false }, { key: 'llama-70b', free: true }] });
    if (u.endsWith('/api/council/health')) return ok({ status: 'ok', agents: 16 });
    if (u.endsWith('/api/council/ask-one')) {
      if ((init.headers || {})['x-council-token'] !== 'token-maquina') return new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 });
      return ok({ name: body.agent_name, role: 'Chief Technology Officer', persona: 'Steve Wozniak', side: 'racional', icon: '⚙️', content: `Respuesta a: ${body.message}` });
    }
    if (u.endsWith('/api/council/ask')) return ok({ racional: [{ name: 'CEO', persona: 'Steve Jobs', side: 'racional', icon: '🏛️', content: 'Simplifica.' }], creativo: [{ name: 'CCO', persona: 'Walt Disney', side: 'creativo', icon: '💡', content: 'Cuenta una historia.' }] });
    if (u.endsWith('/council/machine-status')) return ok({ machines: [{ id: 'macmini', online: true }] });
    if (u.endsWith('/council/tasks')) return ok({ tasks: [{ id: 'task-1', title: 'Probar el MCP', status: 'doing' }] });
    if (u.endsWith('/agora/feed')) return ok({ ok: true, id: 'msg-1', echoed: body });
    return new Response('Not found', { status: 404 });
  };
}

async function cliente(env = ENV, peticiones = []) {
  const server = crearServidor(env, { fetch: fetchFalso(peticiones) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'grokbot-de-prueba', version: '0.0.1' });
  await client.connect(a);
  return { client, server, peticiones };
}

test('los 16 consejeros se listan sin red, con persona y ficha', () => {
  assert.equal(CONSEJEROS.length, 8);
  const todos = consejeros();
  assert.equal(todos.length, 16);
  const woz = todos.find((c) => c.persona === 'Steve Wozniak');
  assert.deepEqual({ rol: woz.rol, lado: woz.lado, generacion: woz.generacion }, { rol: 'CTO', lado: 'racional', generacion: 'leyendas' });
  assert.equal(woz.ficha, 'https://www.admira.live/consejero.html?p=steve-wozniak');
  assert.equal(consejeros('coetaneos').length, 8);
  assert.ok(consejeros('coetaneos').every((c) => c.generacion === 'coetaneos'));
});

test('el servidor publica las herramientas del Consejo, la flota y AgoraMatrix', async () => {
  const { client } = await cliente();
  const { tools } = await client.listTools();
  const nombres = tools.map((t) => t.name).filter((n) => !n.startsWith('yokup_') && !n.startsWith('telegram_')).sort();
  assert.deepEqual(nombres, ['agora_decir', 'consejero_preguntar', 'consejo_bots', 'consejo_consejeros', 'consejo_modelos', 'consejo_preguntar', 'consejo_salud', 'consejo_tareas', 'flota_estado']);
  const preguntar = tools.find((t) => t.name === 'consejero_preguntar');
  assert.deepEqual(preguntar.inputSchema.properties.rol.enum, ['CEO', 'CTO', 'COO', 'CFO', 'CCO', 'CDO', 'CXO', 'CSO']);
  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === 'admira://consejo/consejeros'));
  const { prompts } = await client.listPrompts();
  assert.ok(prompts.some((p) => p.name === 'consejo_brief'));
});

test('preguntar a un consejero llama a ask-one con el token de máquina y devuelve su firma', async () => {
  const { client, peticiones } = await cliente();
  const r = await client.callTool({ name: 'consejero_preguntar', arguments: { rol: 'CTO', mensaje: '¿Cómo conectamos GrokBot al Consejo?', llm: 'llama-70b' } });
  assert.equal(r.isError, undefined);
  assert.match(r.content[0].text, /^⚙️ CTO · Steve Wozniak \(racional\):\nRespuesta a: ¿Cómo conectamos GrokBot al Consejo\?/);
  const p = peticiones.find((x) => x.url.endsWith('/api/council/ask-one'));
  assert.equal(p.method, 'POST');
  assert.equal(p.headers['x-council-token'], 'token-maquina');
  assert.deepEqual(p.body, { message: '¿Cómo conectamos GrokBot al Consejo?', agent_name: 'CTO', generation: 'leyendas', llm: 'llama-70b', context: null });
});

test('preguntar al Consejo resume racional y creativo en un solo texto, y por defecto va por grok-4.6', async () => {
  const { client, peticiones } = await cliente();
  const r = await client.callTool({ name: 'consejo_preguntar', arguments: { mensaje: '¿Qué mejoramos primero en yokup.com?' } });
  assert.match(r.content[0].text, /CEO · Steve Jobs \(racional\):\nSimplifica\./);
  assert.match(r.content[0].text, /CCO · Walt Disney \(creativo\):\nCuenta una historia\./);
  const p = peticiones.find((x) => x.url.endsWith('/api/council/ask'));
  assert.equal(p.body.llm, 'grok-4.6', 'FLT-1579: el Consejo piensa sobre Grok salvo que se pida otro modelo');
});

test('las instrucciones dicen a un bot consejero de GrokBot que responda él mismo', async () => {
  const { client } = await cliente();
  const instrucciones = client.getInstructions();
  assert.match(instrucciones, /SI TÚ ERES UN CONSEJERO/);
  assert.match(instrucciones, /NO uses consejero_preguntar ni consejo_preguntar para pedirle tu propia opinión/);
  assert.match(instrucciones, /grok-4\.6/);
});

test('sin token de máquina el error es legible y no tumba el servidor', async () => {
  const { client } = await cliente({ ...ENV, COUNCIL_MACHINE_TOKEN: '' });
  const r = await client.callTool({ name: 'consejero_preguntar', arguments: { rol: 'CEO', mensaje: 'hola mundo' } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /falta COUNCIL_MACHINE_TOKEN/);
  const ok = await client.callTool({ name: 'consejo_consejeros', arguments: { generacion: 'leyendas' } });
  assert.equal(JSON.parse(ok.content[0].text).length, 8);
});

test('flota, tareas, modelos y AgoraMatrix van a sus bases correctas', async () => {
  const { client, peticiones } = await cliente();
  await client.callTool({ name: 'flota_estado', arguments: {} });
  await client.callTool({ name: 'consejo_tareas', arguments: {} });
  await client.callTool({ name: 'consejo_modelos', arguments: {} });
  const agora = await client.callTool({ name: 'agora_decir', arguments: { texto: 'Prueba del MCP', de: 'Morfeo' } });
  assert.deepEqual(peticiones.map((p) => p.url), [
    'https://consejo.test/api/council/machine-status', 'https://consejo.test/api/council/tasks',
    'https://consejo.test/council/api/council/models', 'https://agora.test/agora/feed',
  ]);
  assert.equal(JSON.parse(agora.content[0].text).echoed.from, 'Morfeo');
  assert.equal(peticiones[3].body.key, 'agora');
});

test('agora_decir va por el service binding cuando existe (Cloudflare 1042 entre workers de la misma cuenta)', async () => {
  const porBinding = [], porRed = [];
  const env = { ...ENV, AGORA: { fetch: async (url, init) => { porBinding.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, via: 'binding' }), { status: 200 }); } } };
  const { client } = await cliente(env, porRed);
  const r = await client.callTool({ name: 'agora_decir', arguments: { texto: 'PRUEBA MCP GrokBot 0621 · Wozniak', de: 'Wozniak' } });
  assert.equal(r.isError, undefined);
  assert.equal(JSON.parse(r.content[0].text).via, 'binding');
  assert.equal(porBinding.length, 1);
  assert.equal(porBinding[0].url, 'https://agora.test/agora/feed');
  assert.equal(porBinding[0].body.text, 'PRUEBA MCP GrokBot 0621 · Wozniak');
  assert.equal(porBinding[0].body.key, 'agora');
  assert.equal(porRed.filter((p) => p.url.includes('/agora/feed')).length, 0, 'sin binding no se llama a la URL pública');
});

test('resumirRespuesta no rompe con formas desconocidas', () => {
  assert.equal(resumirRespuesta({ otra: 1 }), JSON.stringify({ otra: 1 }, null, 2));
});

test('el endpoint /mcp exige la clave, la acepta por Bearer o ?key= y responde a initialize', async () => {
  const deps = { fetch: fetchFalso([]) };
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'grokbot', version: '0.39.0' } } };
  const post = (headers, url = 'https://mcp.test/mcp') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(init) });
  const sin = await manejar(post({}), ENV, deps);
  assert.equal(sin.status, 401);
  assert.match(sin.headers.get('www-authenticate'), /Bearer/);
  const mala = await manejar(post({ authorization: 'Bearer otra-clave-distinta-x' }), ENV, deps);
  assert.equal(mala.status, 401);
  const conBearer = await manejar(post({ authorization: `Bearer ${ENV.MCP_KEY}` }), ENV, deps);
  assert.equal(conBearer.status, 200);
  const cuerpo = await conBearer.json();
  assert.equal(cuerpo.result.serverInfo.name, 'admira-live-mcp');
  assert.equal(cuerpo.result.serverInfo.version, ENV.VERSION);
  assert.match(cuerpo.result.instructions, /Consejo de Silicio/);
  const conQuery = await manejar(post({}, `https://mcp.test/mcp?key=${ENV.MCP_KEY}`), ENV, deps);
  assert.equal(conQuery.status, 200);
  assert.equal(claveValida(post({}), { MCP_KEY: '' }), false, 'sin MCP_KEY configurada nada entra');
});

test('/ y /salud describen el servicio y dicen qué secretos faltan', async () => {
  const deps = { fetch: fetchFalso([]) };
  const raiz = await (await manejar(new Request('https://mcp.test/'), ENV, deps)).json();
  assert.equal(raiz.endpoint_mcp, 'https://mcp.test/mcp');
  assert.ok(raiz.herramientas.includes('consejero_preguntar'));
  const salud = await (await manejar(new Request('https://mcp.test/salud'), { ...ENV, AGORA_SYNC_KEY: '' }, deps)).json();
  assert.deepEqual(salud.secretos, { MCP_KEY: true, MCP_KEYS: false, COUNCIL_MACHINE_TOKEN: true, AGORA_SYNC_KEY: false, ADMIRA_TELEGRAM_PANEL_KEY: false });
  assert.equal(salud.consejo.ok, true);
  assert.equal(salud.consejo.agents, 16);
  const nada = await manejar(new Request('https://mcp.test/otra'), ENV, deps);
  assert.equal(nada.status, 404);
});
