import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { identidadPorClave } from '../src/yokup.js';
import { personaCanonica, esConsejero } from '../src/flota.js';

// FLT-2038: hablar con la flota desde el MCP. Sin red: el worker admira-telegram se
// sustituye por un fetch falso que guarda el encargo y devuelve su estado.

const AHORA = 1_800_000_000_000;
const KEYS = {
  'clave-de-morfeo-macmini-xxxxxxxxxx': { persona: 'Morfeo', machine: 'MacMini', runtime: 'Claude Code', model: 'Fable 5.1' },
  'clave-de-jobs-xxxxxxxxxxxxxxxxxxxx': { persona: 'Jobs' },
};
const ENV = { MCP_KEYS: JSON.stringify(KEYS), ADMIRA_TELEGRAM_PANEL_KEY: 'panel', ADMIRA_TELEGRAM_URL: 'https://telegram.test', VERSION: 'v.05.09.2026.r1.00:00' };

function fetchFalso(peticiones, estado) {
  estado.encargos = {}; estado.siguiente = 2100;
  return async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    let body = null; if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    peticiones.push({ url: u, method, headers: init.headers || {}, body });
    const ok = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/api/presence') && method === 'GET') {
      return ok([
        { persona: 'Morfeo', machine: 'MacMini', runtime: 'Claude Code', focus: 'FLT-2038', updated: AHORA / 1000 - 30 },
        { persona: 'Smith', machine: 'MacMini', runtime: 'Claude Code', updated: AHORA / 1000 - 60 },
        { persona: 'Smith', machine: 'MacBookPro16', runtime: 'Claude Code', updated: AHORA / 1000 - 20 },
        { persona: 'NeoMBP16', machine: 'MacBook Pro 16', runtime: 'Claude Code', updated: AHORA / 1000 - 4000 },   // viejo: no sale
        { persona: 'Oráculo', machine: 'MacMini', runtime: 'Codex', updated: AHORA / 1000 - 5 },
        { persona: 'Lucas', machine: 'GrokBot', runtime: 'Grok', updated: AHORA / 1000 - 5 },                      // consejero: en su bloque
      ]);
    }
    if (u.endsWith('/api/bot-inbox') && method === 'POST') {
      if ((init.headers || {}).authorization !== 'Bearer panel') return ok({ ok: false, error: 'unauthorized' }, 401);
      const id = estado.siguiente++;
      estado.encargos[id] = { id, ts: AHORA / 1000, from_name: `status-web · ${body.from}`, target_persona: body.target_persona, target_machine: body.target_machine, task_id: `task-web-${id}`, text: body.text, status: 'pending', project_id: body.project_id || null };
      return ok({ ok: true, id, task_id: `task-web-${id}`, owner_verified: true, project_id: body.project_id || null });
    }
    const m = u.match(/\/api\/bot-inbox\/(\d+)$/);
    if (m && method === 'GET') {
      if ((init.headers || {}).authorization !== 'Bearer panel') return ok({ ok: false, error: 'unauthorized' }, 401);
      const x = estado.encargos[Number(m[1])]; return x ? ok({ ok: true, item: x }) : ok({ ok: false, error: 'encargo no encontrado' }, 404);
    }
    return new Response('{"ok":false,"error":"ruta de prueba desconocida"}', { status: 404 });
  };
}

async function cliente(clave) {
  const peticiones = [], estado = {};
  const server = crearServidor(ENV, { fetch: fetchFalso(peticiones, estado), now: () => AHORA }, identidadPorClave(clave, ENV));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'claude-code-de-prueba', version: '2.0' });
  await client.connect(a);
  return { client, peticiones, estado };
}
const res = (r) => JSON.parse(r.content[0].text);

test('la persona se reconoce con o sin apellido y con acento', () => {
  assert.equal(personaCanonica('Oráculo'), 'Oraculo');
  assert.equal(personaCanonica('OraculoMacMini'), 'Oraculo');
  assert.equal(personaCanonica('neo'), 'Neo');
  assert.equal(personaCanonica('Steve Jobs'), null);   // el diccionario usa el apellido
  assert.equal(personaCanonica('jobs'), 'Jobs');
  assert.ok(esConsejero('Wozniak') && !esConsejero('Morfeo'));
});

test('una clave de agente de la flota identifica persona, equipo y runtime sin declarar nada', () => {
  const id = identidadPorClave('clave-de-morfeo-macmini-xxxxxxxxxx', ENV);
  assert.deepEqual(id, { persona: 'Morfeo', machine: 'MacMini', runtime: 'Claude Code', model: 'Fable 5.1', agent: 'MorfeoMacMini', tipo: 'agente' });
  assert.equal(identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxxxx', ENV).tipo, 'consejero');
  assert.equal(identidadPorClave('clave-que-no-existe', ENV), null);
});

test('agentes_vivos agrupa por persona y equipo, deja fuera los latidos viejos y lista los consejeros aparte', async () => {
  const { client } = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  const v = res(await client.callTool({ name: 'agentes_vivos', arguments: {} }));
  assert.deepEqual(v.agentes.map((a) => a.persona), ['Morfeo', 'Oraculo', 'Smith']);
  assert.deepEqual(v.agentes.find((a) => a.persona === 'Smith').maquinas.map((m) => m.maquina), ['MacMini', 'MacBookPro16']);
  assert.ok(v.sin_senal.includes('Neo') && v.sin_senal.includes('Trinity'));
  assert.equal(v.consejeros.length, 4);
  assert.deepEqual(v.consejeros.map((c) => [c.persona, c.silla, c.maquina]), [['Wozniak', 'CTO', 'MacBookAirPlata'], ['Jobs', 'CEO', 'MacBookAirAzul'], ['Lucas', 'CSO', 'MacBookAirRosa'], ['Disney', 'CCO', 'MacBookAirCrema']], 'silla ↔ MacBook Air (Jobs/Carbono 8-sep-2026, #2882)');
  assert.ok(!v.agentes.some((a) => a.persona === 'Lucas'));
});

test('agente_encargar a un agente elige la máquina donde late y firma con la identidad de la clave', async () => {
  const { client, estado, peticiones } = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Oráculo', texto: 'Revisa el ranking rojo de yokup y di qué prueba falla.', proyecto_id: 'yokup' } }));
  assert.equal(r.ok, true); assert.equal(r.encargo, 2100); assert.equal(r.persona, 'Oraculo'); assert.equal(r.maquina, 'macmini'); assert.equal(r.de, 'MorfeoMacMini');
  const post = peticiones.find((p) => p.method === 'POST');
  assert.equal(post.headers.authorization, 'Bearer panel');
  assert.deepEqual(post.body, { text: 'Revisa el ranking rojo de yokup y di qué prueba falla.', target_persona: 'Oraculo', target_machine: 'macmini', from: 'MorfeoMacMini', project_id: 'yokup', materialize_mission: true });
  assert.equal(estado.encargos[2100].target_machine, 'macmini');
});

test('si la persona late en dos equipos y se indica uno, manda ese; sin señal, queda en cola sin equipo', async () => {
  const { client } = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  const a = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Smith', maquina: 'MacBookPro16', texto: 'Comprueba la parrilla del canal.' } }));
  assert.equal(a.maquina, 'macbookpro16'); assert.equal(a.mision_en_yokup, false, 'sin proyecto es conversación');
  const b = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Trinity', texto: 'Cuando despiertes, revisa el MBP14.' } }));
  assert.equal(b.maquina, null); assert.match(b.nota, /no late/);
});

test('a un consejero va al equipo grokbot y avisa de que se le despierta por webhook', async () => {
  const { client } = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Wozniak', texto: '¿Qué opinas del MCP como bandeja única de la flota?' } }));
  assert.equal(r.maquina, 'grokbot'); assert.match(r.nota, /webhook/);
});

test('encargo_estado devuelve el estado legible y la respuesta cuando está hecho', async () => {
  const { client, estado } = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Smith', texto: 'Dime la versión de control.' } }));
  let e = res(await client.callTool({ name: 'encargo_estado', arguments: { encargo: r.encargo } }));
  assert.equal(e.estado, 'pending'); assert.match(e.lectura, /pendiente/);
  Object.assign(estado.encargos[r.encargo], { status: 'done', ack_at: AHORA / 1000 + 5, done_at: AHORA / 1000 + 40, note: 'v.05.09.2026.r19.16:05 · verificado con curl' });
  e = res(await client.callTool({ name: 'encargo_estado', arguments: { encargo: r.encargo } }));
  assert.equal(e.estado, 'done'); assert.equal(e.respuesta, 'v.05.09.2026.r19.16:05 · verificado con curl'); assert.ok(e.acuse && e.cierre);
  const nada = await client.callTool({ name: 'encargo_estado', arguments: { encargo: 999999 } });
  assert.equal(nada.isError, true);
});

test('sin identidad se puede encargar igual y se firma como MCP admira.live; una persona desconocida se rechaza', async () => {
  const { client } = await cliente('clave-que-no-existe');
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Morfeo', texto: 'Publica el sello de hoy.' } }));
  assert.equal(r.de, 'MCP admira.live');
  const mal = await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Gandalf', texto: 'Nada.' } });
  assert.equal(mal.isError, true); assert.match(mal.content[0].text, /persona desconocida/);
});

test('las instrucciones del servidor distinguen agente de la flota y consejero', async () => {
  const agente = await cliente('clave-de-morfeo-macmini-xxxxxxxxxx');
  assert.match(agente.client.getInstructions(), /ERES UN AGENTE DE LA FLOTA: en yokup eres MorfeoMacMini/);
  const consejero = await cliente('clave-de-jobs-xxxxxxxxxxxxxxxxxxxx');
  assert.match(consejero.client.getInstructions(), /ERES MIEMBRO DE LA FLOTA: en yokup eres JobsGrokBot/);
});

test('la clave derivada de la semilla identifica a la pareja persona+equipo y abre /mcp; otra semilla no', async () => {
  const { claveFlota, identidadPorClaveAsync } = await import('../src/yokup.js');
  const { manejar } = await import('../src/index.js');
  const env = { ...ENV, MCP_FLOTA_SEED: 'semilla-de-prueba' };
  const k = await claveFlota(env, 'Trinity', 'MacBookPro14');
  assert.equal(k.length, 40);
  assert.equal(k, await claveFlota(env, 'Trinity', 'MacBookPro14'), 'determinista');
  assert.notEqual(k, await claveFlota(env, 'Trinity', 'MacBookPro16'));
  const id = await identidadPorClaveAsync(k, env);
  assert.deepEqual(id, { persona: 'Trinity', machine: 'MacBookPro14', runtime: 'Codex', model: '', agent: 'TrinityMacBookPro14', tipo: 'agente' });
  assert.equal(await identidadPorClaveAsync(k, { ...env, MCP_FLOTA_SEED: 'otra' }), null);
  assert.equal(await identidadPorClaveAsync(k, ENV), null, 'sin semilla no hay flota');
  const r = await manejar(new Request('https://mcp.test/mcp', { method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex', version: '1' } } }) }), env, { fetch: async () => new Response('{}') });
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.match(cuerpo.result.instructions, /ERES UN AGENTE DE LA FLOTA: en yokup eres TrinityMacBookPro14/);
});

test('mandamiento 15: consumo_reportar declara el consumo en Notificaciones de Yokup con la identidad de la clave', async () => {
  const peticiones = [], estado = {};
  const fetchBase = fetchFalso(peticiones, estado);
  const fetchConYokup = async (url, init = {}) => {
    if (String(url).endsWith('/fleet/notificacion')) { peticiones.push({ url: String(url), method: init.method, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, id: 'NOTIF-abc', nueva: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    return fetchBase(url, init);
  };
  const server = crearServidor({ ...ENV, YOKUP_API: 'https://yokup.test' }, { fetch: fetchConYokup, now: () => AHORA }, identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxxxx', ENV));
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: 'grokbot', version: '1' }); await client.connect(a);
  const r = res(await client.callTool({ name: 'consumo_reportar', arguments: { como: 'Jobs', tokens_entrada: 120000, tokens_cache: 900000, tokens_salida: 8000, modelo: 'grok-4.6', despertares: 6, duplicados: 2, causa: 'seis webhooks por el mismo encargo' } }));
  assert.equal(r.ok, true); assert.equal(r.notificacion, 'NOTIF-abc');
  const p = peticiones.find((x) => x.url.endsWith('/fleet/notificacion'));
  assert.equal(p.body.kind, 'consumo'); assert.equal(p.body.owner, 'JobsGrokBot'); assert.equal(p.body.machine, 'GrokBot');
  assert.equal(p.body.datos.total, 1028000); assert.match(p.body.titulo, /JobsGrokBot · Grok grok-4.6 · 1.0 M tokens \(88 % caché/);
  assert.match(p.body.titulo, /6 despertares \(2 dup.\) · causa: seis webhooks/);
});

test('#2456: consumo_reportar va a api.yokup.com por fetch directo, nunca por el service binding de Telegram', async () => {
  const peticiones = [], estado = {}; const fetchBase = fetchFalso(peticiones, estado);
  const directas = [];
  const fetchDirecto = async (url, init = {}) => { if (String(url).endsWith('/fleet/notificacion')) { directas.push(String(url)); return new Response('{"ok":true,"id":"NOTIF-x","nueva":true}', { status: 200, headers: { 'content-type': 'application/json' } }); } return fetchBase(url, init); };
  const TELEGRAM = { fetch: async (url) => new Response('{"ok":false,"error":"not found"}', { status: 404 }) };   // el binding solo conoce bot.yokup.com
  const server = crearServidor({ ...ENV, TELEGRAM, YOKUP_API: 'https://yokup.test' }, { fetch: fetchDirecto, now: () => AHORA }, identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxxxx', ENV));
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: 'grokbot', version: '1' }); await client.connect(a);
  const r = res(await client.callTool({ name: 'consumo_reportar', arguments: { como: 'Jobs', tokens_entrada: 1000, tokens_salida: 100 } }));
  assert.equal(r.ok, true); assert.equal(directas.length, 1);
});

test('la silla del Consejo se puede nombrar por su MacBook Air: agente_encargar(MacBookAirAzul) va a Jobs, y la máquina de otra silla se rechaza', async () => {
  const { client, peticiones } = await cliente();
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'MacBookAirAzul', texto: 'Jobs, revisa el mapa del sitio.' } }));
  assert.equal(r.persona, 'Jobs'); assert.equal(r.maquina, 'grokbot'); assert.match(r.nota, /silla CEO · MacBookAirAzul/);
  const enc = peticiones.filter((p) => p.url.endsWith('/api/bot-inbox') && p.method === 'POST').pop();
  assert.equal(enc.body.target_persona, 'Jobs');
  const mal = await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Wozniak', maquina: 'MacBookAirAzul', texto: 'esto no es tuyo' } });
  assert.equal(mal.isError, true); assert.match(mal.content[0].text, /MacBookAirAzul es la silla de Jobs, no de Wozniak/);
});
