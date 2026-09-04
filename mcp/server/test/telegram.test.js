import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { identidadPorClave } from '../src/yokup.js';

// FLT-1603: un consejero de GrokBot lee su bandeja de Telegram y contesta en hilo.

const ENV = { MCP_KEY: 'clave-de-wozniak-xxxxxxxxxxxxxxx', MCP_KEY_PERSONA: 'Wozniak', ADMIRA_TELEGRAM_PANEL_KEY: 'panel',
  ADMIRA_TELEGRAM_URL: 'https://telegram.test', COUNCIL_MACHINE_TOKEN: 't', YOKUP_API: 'https://yokup.test', VERSION: 'v.04.09.2026.r7' };

function fetchFalso(peticiones) {
  return async (url, init = {}) => {
    const u = String(url); peticiones.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if ((init.headers || {}).authorization !== 'Bearer panel') return new Response('{"ok":false,"error":"no autorizado"}', { status: 401 });
    if (u.startsWith('https://telegram.test/api/bot-inbox?')) return ok({ ok: true, items: [
      { id: 1701, ts: 1788500000, from_name: 'Carlos', target_persona: 'Wozniak', target_machine: 'grokbot', text: '/wozniak cuántas máquinas hay en línea', status: 'pending' },
      { id: 1690, ts: 1788490000000, from_name: 'Carlos', target_persona: 'Wozniak', target_machine: 'grokbot', text: 'hecho antes', status: 'done', done_at: 1788490100 },
      { id: 1695, ts: 1788495000, from_name: 'Neo', target_persona: 'Wozniak', target_machine: 'grokbot', text: 'revisa esto', status: 'in_progress' },
    ] });
    if (/\/api\/bot-inbox\/1701\/status$/.test(u)) return ok({ ok: true, item: { id: 1701, status: init.body && JSON.parse(init.body).status } });
    return new Response('Not found', { status: 404 });
  };
}
async function cliente(env = ENV) {
  const peticiones = [];
  const server = crearServidor(env, { fetch: fetchFalso(peticiones) }, identidadPorClave(env.MCP_KEY, env));
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: 'grokbot-de-prueba', version: '0.39.0' }); await client.connect(a);
  return { client, peticiones };
}
const res = (r) => JSON.parse(r.content[0].text);

test('telegram_bandeja pide la bandeja de Wozniak@grokbot con la clave del panel y deja fuera lo hecho', async () => {
  const { client, peticiones } = await cliente();
  const b = res(await client.callTool({ name: 'telegram_bandeja', arguments: {} }));
  assert.equal(b.yo, 'WozniakGrokBot'); assert.equal(b.pendientes, 1);
  assert.deepEqual(b.encargos.map((e) => [e.encargo, e.estado]), [[1701, 'pending'], [1695, 'in_progress']]);
  assert.match(b.encargos[0].cuando, /2026-09-04 \d\d:\d\d UTC/, 'ts en segundos se lee bien');
  assert.match(b.encargos[1].cuando, /2026-09-0\d/, 'y un ts en milisegundos también');
  const p = peticiones[0]; assert.equal(p.url, 'https://telegram.test/api/bot-inbox?persona=Wozniak&machine=GrokBot'); assert.equal(p.headers.authorization, 'Bearer panel');
});

test('telegram_responder cambia el estado con la respuesta y la identidad; un done vacío se rechaza', async () => {
  const { client, peticiones } = await cliente();
  const r = res(await client.callTool({ name: 'telegram_responder', arguments: { encargo: 1701, estado: 'done', respuesta: '6 máquinas en línea de 15.' } }));
  assert.equal(r.ok, true); assert.equal(r.publicado_en_telegram, true);
  const p = peticiones.find((x) => x.url.endsWith('/api/bot-inbox/1701/status'));
  assert.deepEqual(p.body, { status: 'done', persona: 'WozniakGrokBot', machine: 'GrokBot', respuesta: '6 máquinas en línea de 15.' });
  const vacio = await client.callTool({ name: 'telegram_responder', arguments: { encargo: 1701, estado: 'done' } });
  assert.equal(vacio.isError, true); assert.match(vacio.content[0].text, /un done sin nada no contesta a nadie/);
  const ack = res(await client.callTool({ name: 'telegram_responder', arguments: { encargo: 1701, estado: 'ack' } }));
  assert.equal(ack.estado, 'ack');
});

test('sin identidad las herramientas de Telegram fallan legibles', async () => {
  const peticiones = [];
  const server = crearServidor(ENV, { fetch: fetchFalso(peticiones) }, null);
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: 'x', version: '1' }); await client.connect(a);
  const r = await client.callTool({ name: 'telegram_bandeja', arguments: {} });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /sin identidad/);
});

test('`como` manda sobre la clave (conector de cuenta) y la bandeja solo enseña lo mío', async () => {
  const peticiones = [];
  const fetch = async (url, init = {}) => {
    const u = String(url); peticiones.push({ url: u, body: init.body ? JSON.parse(init.body) : null });
    const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.startsWith('https://telegram.test/api/bot-inbox?')) return ok({ ok: true, items: [
      { id: 1, ts: 1788500000, from_name: 'Carlos', target_persona: 'Wozniak', target_machine: 'grokbot', text: 'para Woz', status: 'pending' },
      { id: 2, ts: 1788500001, from_name: 'Carlos', target_persona: 'Lucas', target_machine: 'grokbot', text: 'para Lucas', status: 'pending' },
    ] });
    if (/\/status$/.test(u)) return ok({ ok: true, item: { status: 'ack' } });
    return new Response('nf', { status: 404 });
  };
  const server = crearServidor(ENV, { fetch }, identidadPorClave(ENV.MCP_KEY, ENV)); // la clave dice Wozniak
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b);
  const client = new Client({ name: 'x', version: '1' }); await client.connect(a);
  const lucas = res(await client.callTool({ name: 'telegram_bandeja', arguments: { como: 'Lucas' } }));
  assert.equal(lucas.yo, 'LucasGrokBot'); assert.deepEqual(lucas.encargos.map((e) => e.encargo), [2], 'Lucas no ve el encargo de Wozniak');
  assert.match(peticiones[0].url, /persona=Lucas&machine=GrokBot/);
  const woz = res(await client.callTool({ name: 'telegram_bandeja', arguments: {} }));
  assert.equal(woz.yo, 'WozniakGrokBot'); assert.deepEqual(woz.encargos.map((e) => e.encargo), [1]);
  await client.callTool({ name: 'telegram_responder', arguments: { como: 'Lucas', encargo: 2, estado: 'ack' } });
  assert.equal(peticiones.at(-1).body.persona, 'LucasGrokBot');
  const q = res(await client.callTool({ name: 'yokup_quien_soy', arguments: { como: 'Disney' } })).identidad;
  assert.equal(q.agent, 'DisneyGrokBot');
});
