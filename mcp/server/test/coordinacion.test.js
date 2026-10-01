import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { identidadPorClave, identidadAgente } from '../src/yokup.js';
import { censoBots, flotaCombinada, runtimeDePresencia, cargaDe, RUNTIMES } from '../src/coordinacion.js';

// Coordinar deepagents (MuskGrokBot · Merovingio, 1-oct-2026): censo único, bandeja y acuse
// genéricos, carga por agente, runtimes de la flota y encargos con fecha límite y criterio.

const AHORA = 1_800_000_000_000;
const S = AHORA / 1000;
const PRESENCIA = [
  { persona: 'Merovingio', machine: 'GrokBotBox', runtime: 'Grok CLI', focus: 'FLT-1', updated: S - 120 },
  { persona: 'Cypher', machine: 'GrokBotBox', runtime: 'DeepAgents', model: 'kimi', updated: S - 30 },
  { persona: 'Smith', machine: 'MacBook Pro 16', runtime: 'Grok', updated: S - 20 },
  { persona: 'Trinity', machine: 'MacBookProNegro14', runtime: 'Codex', updated: S - 10 },
  { persona: 'Morfeo', machine: 'MacMini', runtime: 'OpenCode', updated: S - 10 },
  { persona: 'Morfeo', machine: 'MacMini', runtime: 'Claude', updated: S - 10 },
  { persona: 'Arquitecto', machine: 'CursorCloud', runtime: 'Cursor', updated: S - 60 },
  { persona: 'Oraculo', machine: 'MacBookAirPlata', runtime: 'Codex', updated: S - 5000 },     // viejo
  { persona: 'Lucas', machine: 'GrokBot', runtime: 'Grok', updated: S - 5 },                  // consejero
];
const SALUD_VIEJA = { ok: true, bots: [
  { id: 'Smith', label: 'Smith · CEO', persona: 'Elon Musk', role: 'CEO', online: true, host: 'MacBook-Pro-16.local', lastSeen: AHORA - 1000, presenceSource: 'heartbeat', lastTask: { id: 'task-086', title: 'SmithMacMini · hub', status: 'done', at: '2026-09-20T07:54:14.601Z' } },
  { id: 'Trinity', label: 'Trinity · COO', persona: 'Gwynne Shotwell', role: 'COO', online: false, lastSeen: null, lastTask: null },
  { id: 'Smith', label: 'Smith · Soporte', persona: 'Agent Smith', role: 'Soporte', online: true, host: 'MacBook-Pro-16.local', lastSeen: AHORA - 1000, presenceSource: 'heartbeat', lastTask: null },
] };

test('censo único: Smith deja de ser el CEO; el CEO es Merovingio (MuskGrokBot) y «en línea» sale de la presencia', () => {
  const c = censoBots({ salud: SALUD_VIEJA, presencia: PRESENCIA, ahoraMs: AHORA });
  const ceo = c.bots.find((b) => b.role === 'CEO');
  assert.equal(ceo.id, 'Merovingio'); assert.equal(ceo.persona, 'Elon Musk'); assert.equal(ceo.consejero, 'MuskGrokBot');
  assert.equal(ceo.online, true); assert.equal(ceo.maquinas[0].maquina, 'GrokBotBox'); assert.equal(ceo.maquinas[0].runtime, 'Grok CLI');
  const smith = c.bots.filter((b) => b.id === 'Smith');
  assert.equal(smith.length, 1, 'Smith sale una sola vez');
  assert.equal(smith[0].role, 'Soporte'); assert.match(smith[0].nota, /otro GrokBot/);
  assert.equal(smith[0].lastTask.id, 'task-086');
  assert.ok(!c.bots.some((b) => b.id === 'Smith' && b.persona === 'Elon Musk'));
  assert.equal(c.correcciones[0].id, 'Smith');
  // Trinity: el Mac Mini dice offline (latido de 90 s), la presencia dice viva → manda la presencia.
  assert.equal(c.bots.find((b) => b.id === 'Trinity').online, true);
  assert.equal(c.bots.find((b) => b.id === 'Trinity').latido_mac_mini.online, false);
  // Oráculo: solo latido viejo (> 15 min) → fuera.
  assert.equal(c.bots.find((b) => b.id === 'Oráculo').online, false);
  // Arquitecto en CursorCloud es Jensen (CTO), no Jony Ive (CDO).
  assert.equal(c.bots.find((b) => b.id === 'ArquitectoCursorCloud').online, true);
  assert.equal(c.bots.find((b) => b.id === 'Arquitecto').online, false);
  assert.match(c.fuente_en_linea, /misma que agentes_vivos/);
});

test('censo único: sin el Mac Mini sigue saliendo la tabla buena con presencia', () => {
  const c = censoBots({ salud: null, errorSalud: '502', presencia: PRESENCIA, ahoraMs: AHORA });
  assert.equal(c.bots.length, 9);
  assert.deepEqual(c.en_linea.sort(), ['ArquitectoCursorCloud', 'Cypher', 'Merovingio', 'Smith', 'Trinity']);
  assert.match(c.aviso_mac_mini, /502/);
});

test('runtimes: presencia → clave canónica; GrokBot (consejeros) no cuenta como proceso', () => {
  assert.equal(runtimeDePresencia('Claude'), 'claude_code');
  assert.equal(runtimeDePresencia('Claude Code'), 'claude_code');
  assert.equal(runtimeDePresencia('Codex'), 'codex');
  assert.equal(runtimeDePresencia('Grok CLI'), 'grok_cli');
  assert.equal(runtimeDePresencia('Grok', 'MacMini'), 'grok_cli');
  assert.equal(runtimeDePresencia('Grok', 'GrokBot'), null);
  assert.equal(runtimeDePresencia('OpenCode'), 'opencode');
  assert.equal(runtimeDePresencia('DeepAgents'), 'deepagents');
  assert.equal(runtimeDePresencia('Cursor'), null);
});

test('flota_estado combina sondeo y presencia, y añade la GrokBotBox', () => {
  const estado = { ts: 'x', machines: [
    { id: 'admira-macmini', name: 'Mac Mini (Carlos)', online: true, claude: { host: 'MacMini.local', account: 'a@b', claude_running: true } },
    { id: 'admira-macbookpronegro14', name: 'MacBook Pro Negro 14', online: true, claude: { host: 'MacBookProNegro14', claude_running: false, runtimes: { grok_cli: true } } },
    { id: 'admira-macbookpro16', name: 'MacBook Pro 16', online: false, claude: null },
  ] };
  const f = flotaCombinada({ estado, presencia: PRESENCIA, ahoraMs: AHORA });
  const mini = f.machines.find((m) => m.id === 'admira-macmini');
  assert.deepEqual(mini.runtimes, { claude_code: true, codex: false, grok_cli: false, opencode: true, deepagents: false });
  const negro = f.machines.find((m) => m.id === 'admira-macbookpronegro14');
  assert.equal(negro.runtimes.grok_cli, true); assert.equal(negro.runtimes.codex, true); assert.equal(negro.runtimes_fuente, 'sondeo+presencia');
  const mbp16 = f.machines.find((m) => m.id === 'admira-macbookpro16');
  assert.equal(mbp16.online_por_presencia, true); assert.equal(mbp16.runtimes.grok_cli, true);
  const box = f.machines.find((m) => m.id === 'grokbotbox');
  assert.equal(box.fuente, 'presencia'); assert.equal(box.runtimes.deepagents, true); assert.equal(box.runtimes.grok_cli, true);
  assert.ok(box.agentes.some((a) => a.persona === 'Merovingio'));
  assert.ok(f.machines.some((m) => m.id === 'cursorcloud'));
  assert.ok(!f.machines.some((m) => m.id === 'grokbot'), 'los consejeros de GrokBot no son una máquina de la flota');
  assert.equal(f.summary.deepagents, 1); assert.equal(f.summary.total, 5);
});

test('el sondeo SSH del Mac Mini busca los mismos runtimes que el MCP', () => {
  const ssh = readFileSync(new URL('../../../src/ssh-exec.js', import.meta.url), 'utf8');
  for (const [k, v] of Object.entries(RUNTIMES)) {
    assert.ok(ssh.includes(`"${k}": r"${v.procesos}"`), `falta ${k} en CLAUDE_STATUS_PROBE_PY`);
    const rx = new RegExp(v.procesos);
    assert.ok(!rx.test('/usr/bin/python3 -'), `${k} no debe casar con el propio sondeo`);
  }
  assert.ok(new RegExp(RUNTIMES.codex.procesos).test('node /opt/homebrew/bin/codex --yolo'));
  assert.ok(new RegExp(RUNTIMES.grok_cli.procesos).test('/Users/x/.bun/bin/grok'));
  assert.ok(new RegExp(RUNTIMES.opencode.procesos).test('/opt/homebrew/bin/opencode run'));
  assert.ok(new RegExp(RUNTIMES.deepagents.procesos).test('python -m deepagents_cli --agent niobe'));
});

test('cargaDe cuenta solo abiertos, por estado y por máquina', () => {
  const c = cargaDe([{ status: 'pending', target_machine: 'macmini' }, { status: 'ack', target_machine: 'MacMini' }, { status: 'blocked', target_machine: 'grokbotbox' }, { status: 'done', target_machine: 'macmini' }]);
  assert.deepEqual(c, { abiertos: 3, pending: 1, ack: 1, in_progress: 0, blocked: 1, por_maquina: { macmini: 2, grokbotbox: 1 } });
});

/* ── por MCP, con un bot.yokup.com falso ── */

const KEYS = { 'clave-sin-dueno-xxxxxxxxxxxxxxxxxxx': { persona: 'Nadie' }, 'clave-de-jobs-xxxxxxxxxxxxxxxxxxxx': { persona: 'Jobs' } };
const ENV = { MCP_KEYS: JSON.stringify(KEYS), MCP_KEY_CONSEJO: 'clave-compartida-del-consejo-xxxxxx', ADMIRA_TELEGRAM_PANEL_KEY: 'panel', ADMIRA_TELEGRAM_URL: 'https://telegram.test', FLEET_BASE: 'https://consejo.test/api', VERSION: 'v.01.10.2026.r2.test' };
const INBOX = [
  { id: 4804, ts: S - 600, from_name: 'MuskGrokBot', target_persona: 'Merovingio', target_machine: 'grokbotbox', status: 'pending', text: 'Texto entero del encargo 4804 para Merovingio, que en la vista pública sale recortado a ciento cuarenta caracteres y aquí no.', note: '' },
  { id: 4805, ts: S - 500, from_name: 'Carlos', target_persona: 'Merovingio', target_machine: 'grokbotbox', status: 'in_progress', text: 'otro', note: 'en ello' },
  { id: 4806, ts: S - 400, from_name: 'Carlos', target_persona: 'Merovingio', target_machine: 'grokbotbox', status: 'done', text: 'hecho', note: 'ok' },
  { id: 4807, ts: S - 300, from_name: 'Carlos', target_persona: 'Neo', target_machine: 'macmini', status: 'pending', text: 'para Neo', note: '' },
  { id: 1043, ts: S - 90000, from_name: 'x', target_persona: '', target_machine: 'macbookair16plata', status: 'pending', text: 'huérfano', note: '' },
  { id: 4808, ts: S - 200, from_name: 'Carlos', target_persona: 'Musk', target_machine: 'grokbot', status: 'ack', text: 'para Elon', note: '' },
];

function fetchFalso(peticiones, { publicaRota = false, saludRota = false } = {}) {
  return async (url, init = {}) => {
    const u = new URL(String(url)); const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    peticiones.push({ url: String(url), method, headers: init.headers || {}, body });
    const ok = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const auth = (init.headers || {}).authorization === 'Bearer panel';
    if (u.pathname === '/api/presence') return ok({ ok: true, presence: PRESENCIA });
    if (u.pathname === '/api/council/health') return saludRota ? ok({ ok: false, error: 'caído' }, 502) : ok(SALUD_VIEJA);
    if (u.pathname === '/api/council/machine-status') return ok({ ok: true, machines: [{ id: 'admira-macmini', name: 'Mac Mini (Carlos)', online: true, claude: { claude_running: true } }] });
    const persona = u.searchParams.get('persona') || '';
    const deLaPersona = (x) => x.target_persona.toLowerCase().startsWith(persona.toLowerCase()) || (persona === 'Merovingio' && x.target_persona === '');
    if (u.pathname === '/api/public/inbox') {
      if (publicaRota) return ok({ ok: false }, 500);
      return ok({ ok: true, view: 'public', count: 3, items: INBOX.filter(deLaPersona).map((x) => ({ ...x, note: undefined, text: x.text.slice(0, 140) })) });
    }
    if (u.pathname === '/api/bot-inbox' && method === 'GET') {
      if (!auth) return ok({ ok: false, error: 'unauthorized' }, 401);
      return ok({ ok: true, items: INBOX.filter(deLaPersona).filter((x) => x.status !== 'done') });
    }
    const m = u.pathname.match(/^\/api\/bot-inbox\/(\d+)(\/status)?$/);
    if (m && !m[2] && method === 'GET') { const x = INBOX.find((i) => i.id === Number(m[1])); return x ? ok({ ok: true, item: x }) : ok({ ok: false, error: 'no' }, 404); }
    if (m && m[2] && method === 'POST') { if (!auth) return ok({ ok: false }, 401); return ok({ ok: true, item: { id: Number(m[1]), status: body.status } }); }
    if (u.pathname === '/api/bot-inbox' && method === 'POST') return ok({ ok: true, id: 4900, ts: S });
    return ok({ ok: false, error: 'ruta de prueba desconocida ' + u.pathname }, 404);
  };
}

async function cliente({ identidad = null, opciones = {} } = {}) {
  const peticiones = [];
  const server = crearServidor(ENV, { fetch: fetchFalso(peticiones, opciones), now: () => AHORA }, identidad);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'deepagent-de-prueba', version: '1' });
  await client.connect(a);
  return { client, peticiones };
}
const res = (r) => { if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text); };
const MEROVINGIO = identidadAgente('Merovingio', 'GrokBotBox');

test('encargos_listar: sin persona lista la bandeja de quien llama, abiertos, con el texto entero de la vista privada', async () => {
  const { client, peticiones } = await cliente({ identidad: MEROVINGIO });
  const r = res(await client.callTool({ name: 'encargos_listar', arguments: {} }));
  assert.equal(r.persona, 'Merovingio');
  assert.deepEqual(r.encargos.map((x) => [x.encargo, x.estado]), [[4805, 'in_progress'], [4804, 'pending']]);
  assert.match(r.encargos[1].texto, /aquí no\.$/);
  assert.equal(r.encargos[1].etiqueta, '#4804.01.15');
  assert.equal(r.carga.abiertos, 2);
  assert.match(r.fuentes.privada, /^ok/); assert.match(r.fuentes.publica, /^ok/);
  // El huérfano 1043 (sin persona) que la vista pública cuela no es de Merovingio.
  assert.ok(!r.encargos.some((x) => x.encargo === 1043));
  assert.ok(peticiones.some((p) => p.url === 'https://telegram.test/api/bot-inbox?persona=Merovingio' && p.headers.authorization === 'Bearer panel'));
  assert.ok(peticiones.some((p) => p.url === 'https://telegram.test/api/public/inbox?persona=Merovingio' && !p.headers.authorization));
  assert.ok(peticiones.every((p) => p.method === 'GET'), 'listar no escribe nada');
});

test('encargos_listar: otra persona, estado, máquina y vista pública como respaldo', async () => {
  const { client } = await cliente({ identidad: MEROVINGIO });
  const hechos = res(await client.callTool({ name: 'encargos_listar', arguments: { persona: 'Merovingio', estado: 'done' } }));
  assert.deepEqual(hechos.encargos.map((x) => x.encargo), [4806]);
  const neo = res(await client.callTool({ name: 'encargos_listar', arguments: { persona: 'Neo', maquina: 'MacMini' } }));
  assert.deepEqual(neo.encargos.map((x) => x.encargo), [4807]);
  const nada = res(await client.callTool({ name: 'encargos_listar', arguments: { persona: 'Neo', maquina: 'GrokBotBox' } }));
  assert.equal(nada.total, 0);
  const elon = res(await client.callTool({ name: 'encargos_listar', arguments: { persona: 'Elon Musk' } }));
  assert.equal(elon.persona, 'Musk'); assert.deepEqual(elon.encargos.map((x) => x.encargo), [4808]);
  const { client: c2 } = await cliente({ identidad: MEROVINGIO, opciones: { publicaRota: true } });
  const solo = res(await c2.callTool({ name: 'encargos_listar', arguments: {} }));
  assert.equal(solo.total, 2); assert.match(solo.fuentes.publica, /500/);
});

test('encargos_listar: una clave sin dueño necesita persona; la compartida del Consejo, como', async () => {
  const { client } = await cliente({ identidad: null });
  const r = await client.callTool({ name: 'encargos_listar', arguments: {} });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /pasa persona/);
  assert.equal(res(await client.callTool({ name: 'encargos_listar', arguments: { persona: 'Merovingio' } })).total, 2);
  const { client: c2 } = await cliente({ identidad: identidadPorClave(ENV.MCP_KEY_CONSEJO, ENV) });
  const sinComo = await c2.callTool({ name: 'encargos_listar', arguments: {} });
  assert.equal(sinComo.isError, true); assert.match(sinComo.content[0].text, /como=/);
  assert.equal(res(await c2.callTool({ name: 'encargos_listar', arguments: { como: 'Musk' } })).persona, 'Musk');
});

test('encargo_responder: el destinatario acusa por el mismo POST que telegram_responder', async () => {
  const { client, peticiones } = await cliente({ identidad: MEROVINGIO });
  const r = res(await client.callTool({ name: 'encargo_responder', arguments: { numero: 4804, estado: 'ack', nota: 'cogido' } }));
  assert.equal(r.ok, true); assert.equal(r.estado, 'ack'); assert.equal(r.firmado_como, 'MerovingioGrokBotBox'); assert.equal(r.antes, 'pending');
  const post = peticiones.find((p) => p.method === 'POST');
  assert.equal(post.url, 'https://telegram.test/api/bot-inbox/4804/status');
  assert.deepEqual(post.body, { status: 'ack', persona: 'MerovingioGrokBotBox', machine: 'GrokBotBox', respuesta: 'cogido' });
});

test('encargo_responder: no toca encargos ajenos y exige nota en blocked y done', async () => {
  const { client, peticiones } = await cliente({ identidad: MEROVINGIO });
  const ajeno = await client.callTool({ name: 'encargo_responder', arguments: { numero: 4807, estado: 'done', nota: 'me lo quedo' } });
  assert.equal(ajeno.isError, true); assert.match(ajeno.content[0].text, /es de Neo, no de Merovingio/);
  const bloq = await client.callTool({ name: 'encargo_responder', arguments: { numero: 4804, estado: 'blocked' } });
  assert.equal(bloq.isError, true); assert.match(bloq.content[0].text, /motivo/);
  const done = await client.callTool({ name: 'encargo_responder', arguments: { numero: 4804, estado: 'done' } });
  assert.equal(done.isError, true);
  assert.ok(!peticiones.some((p) => p.method === 'POST'), 'nada se escribió');
  const { client: sinId } = await cliente({ identidad: null });
  const anon = await sinId.callTool({ name: 'encargo_responder', arguments: { numero: 4804, estado: 'ack' } });
  assert.equal(anon.isError, true); assert.match(anon.content[0].text, /sin identidad/);
});

test('encargo_responder: un consejero contesta lo suyo (Jobs no puede con lo de Musk)', async () => {
  const { client } = await cliente({ identidad: identidadPorClave('clave-de-jobs-xxxxxxxxxxxxxxxxxxxx', ENV) });
  const r = await client.callTool({ name: 'encargo_responder', arguments: { numero: 4808, estado: 'done', nota: 'hecho' } });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /es de Musk, no de Jobs/);
});

test('agentes_vivos trae la carga de encargos abiertos por agente, máquina y consejero', async () => {
  const { client } = await cliente({ identidad: MEROVINGIO });
  const r = res(await client.callTool({ name: 'agentes_vivos', arguments: {} }));
  const mero = r.agentes.find((a) => a.persona === 'Merovingio');
  assert.deepEqual(mero.carga, { abiertos: 2, pending: 1, ack: 0, in_progress: 1, blocked: 0 });
  assert.equal(mero.maquinas[0].abiertos, 2);
  const musk = r.consejeros.find((c) => c.persona === 'Musk');
  assert.equal(musk.carga.abiertos, 1); assert.equal(musk.deepagent_vivo, true);
  assert.equal(r.cola_sin_senal.Neo, 1);
  assert.match(r.carga_fuente, /public\/inbox/);
});

test('consejo_bots y flota_estado por MCP: presencia + Mac Mini, y aguantan si el Mac Mini cae', async () => {
  const { client } = await cliente({ identidad: MEROVINGIO });
  const bots = res(await client.callTool({ name: 'consejo_bots', arguments: {} }));
  assert.equal(bots.bots.find((b) => b.role === 'CEO').id, 'Merovingio');
  const f = res(await client.callTool({ name: 'flota_estado', arguments: {} }));
  assert.ok(f.machines.some((m) => m.id === 'grokbotbox' && m.runtimes.deepagents));
  const { client: c2 } = await cliente({ identidad: MEROVINGIO, opciones: { saludRota: true } });
  const b2 = res(await c2.callTool({ name: 'consejo_bots', arguments: {} }));
  assert.equal(b2.bots.find((b) => b.id === 'Merovingio').online, true); assert.match(b2.aviso_mac_mini, /502/);
});

test('agente_encargar añade fecha límite y criterio de hecho al texto y a los metadatos', async () => {
  const { client, peticiones } = await cliente({ identidad: MEROVINGIO });
  const r = res(await client.callTool({ name: 'agente_encargar', arguments: { persona: 'Neo', texto: 'Revisa el PR del MCP', deadline: '2026-10-01 18:00 Madrid', criterio: 'npm test verde y PR aprobado' } }));
  assert.equal(r.deadline, '2026-10-01 18:00 Madrid'); assert.equal(r.criterio, 'npm test verde y PR aprobado');
  const post = peticiones.find((p) => p.method === 'POST' && p.url.endsWith('/api/bot-inbox'));
  assert.equal(post.body.text, 'Revisa el PR del MCP\n⏰ Fecha límite: 2026-10-01 18:00 Madrid\n✅ Criterio de hecho: npm test verde y PR aprobado');
  assert.equal(post.body.deadline, '2026-10-01 18:00 Madrid'); assert.equal(post.body.done_criteria, 'npm test verde y PR aprobado');
});

test('las instrucciones y el listado anuncian las herramientas nuevas', async () => {
  const { client } = await cliente({ identidad: MEROVINGIO });
  const ins = client.getInstructions();
  assert.match(ins, /encargos_listar/); assert.match(ins, /MuskGrokBot/); assert.match(ins, /Merovingio/);
  const { tools } = await client.listTools();
  const t = (n) => tools.find((x) => x.name === n);
  assert.equal(t('encargos_listar').annotations.readOnlyHint, true);
  assert.deepEqual(t('encargo_responder').inputSchema.properties.estado.enum, ['ack', 'in_progress', 'blocked', 'done']);
  assert.ok(t('agente_encargar').inputSchema.properties.deadline && t('agente_encargar').inputSchema.properties.criterio);
});
