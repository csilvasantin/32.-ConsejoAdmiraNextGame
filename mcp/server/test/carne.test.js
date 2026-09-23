import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar, autorizarAlta } from '../src/index.js';
import { identidadPorClave, claveFlota, darseDeAlta, identidadPorClaveAsync } from '../src/yokup.js';

// FLT-100854: alta de carné sin abrir /mcp a anónimos ni bajar MCP_FIRMA_ESTRICTA.

const KEYS = { 'clave-de-jobs-xxxxxxxxxxxxxxxxxx': { persona: 'Jobs' } };
const ENV = {
  MCP_KEY: 'clave-de-wozniak-xxxxxxxxxxxxxxx', MCP_KEY_PERSONA: 'Wozniak',
  MCP_KEYS: JSON.stringify(KEYS), MCP_FLOTA_SEED: 'semilla-de-prueba-flt-100854',
  MCP_FIRMA_ESTRICTA: '1', MCP_ALTA_TOKEN: 'token-alta-de-prueba-xxxxxxxx',
  COUNCIL_MACHINE_TOKEN: 'token-maquina', VERSION: 'v.23.09.2026.r1.20:30',
};

test('darseDeAlta emite clave HMAC de Arquitecto|CursorCloud y la identidad abre /mcp', async () => {
  const r = await darseDeAlta(ENV, { persona: 'Arquitecto', equipo: 'CursorCloud', runtime: 'Cursor' });
  assert.equal(r.ok, true);
  assert.equal(r.agent, 'ArquitectoCursorCloud');
  assert.equal(r.runtime, 'Cursor');
  assert.equal(r.clave.length, 40);
  assert.equal(r.clave, await claveFlota(ENV, 'Arquitecto', 'CursorCloud'));
  assert.match(r.pickup.vault_slot, /MCP_KEY_ARQUITECTO_CURSORCLOUD/);
  assert.match(r.pickup.mcp_conectar, /mcp-conectar\.sh Arquitecto CursorCloud/);
  const id = await identidadPorClaveAsync(r.clave, ENV);
  assert.deepEqual(id, { persona: 'Arquitecto', machine: 'CursorCloud', runtime: 'Cursor', model: '', agent: 'ArquitectoCursorCloud', tipo: 'agente' });
  const mcp = await manejar(new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${r.clave}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cursor', version: '1' } } }),
  }), ENV, { fetch: async () => new Response('{}') });
  assert.equal(mcp.status, 200);
  const cuerpo = await mcp.json();
  assert.match(cuerpo.result.instructions, /ArquitectoCursorCloud/);
});

test('POST /carne sin auth → 401; con Bearer patrocinador → 200; anónimo no abre /mcp', async () => {
  const sin = await manejar(new Request('https://mcp.test/carne', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona: 'Arquitecto', equipo: 'CursorCloud' }) }), ENV);
  assert.equal(sin.status, 401);
  const con = await manejar(new Request('https://mcp.test/carne', {
    method: 'POST',
    headers: { authorization: `Bearer ${ENV.MCP_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ persona: 'Arquitecto', equipo: 'CursorCloud' }),
  }), ENV);
  assert.equal(con.status, 200);
  const body = await con.json();
  assert.equal(body.agent, 'ArquitectoCursorCloud');
  assert.equal(body.via, 'patrocinador');
  assert.equal(body.patrocinado_por, 'WozniakGrokBot');
  assert.ok(body.clave && body.clave.length === 40);

  const token = await manejar(new Request('https://mcp.test/carne', {
    method: 'POST',
    headers: { 'x-mcp-alta': ENV.MCP_ALTA_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ persona: 'Arquitecto', equipo: 'CursorCloud' }),
  }), ENV);
  assert.equal(token.status, 200);
  assert.equal((await token.json()).via, 'alta-token');

  // /mcp sigue cerrado sin Bearer
  const mcp = await manejar(new Request('https://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), ENV);
  assert.equal(mcp.status, 401);
});

test('mcp_darse_de_alta está publicada y un consejero patrocina el carné de Arquitecto', async () => {
  const server = crearServidor(ENV, { fetch: async () => new Response('{}') }, identidadPorClave(ENV.MCP_KEY, ENV));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'woz', version: '1' });
  await client.connect(a);
  const nombres = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(nombres.includes('mcp_darse_de_alta'));
  const r = JSON.parse((await client.callTool({ name: 'mcp_darse_de_alta', arguments: { persona: 'Arquitecto', equipo: 'CursorCloud' } })).content[0].text);
  assert.equal(r.agent, 'ArquitectoCursorCloud');
  assert.equal(r.patrocinado_por, 'WozniakGrokBot');
  assert.equal(r.via, 'mcp_darse_de_alta');
});

test('Arquitecto no se enrola en un Mac físico; persona inventada falla', async () => {
  await assert.rejects(() => darseDeAlta(ENV, { persona: 'Arquitecto', equipo: 'MacMini' }), /CursorCloud/);
  await assert.rejects(() => darseDeAlta(ENV, { persona: 'Hackerman', equipo: 'CursorCloud' }), /no enrolable/);
  assert.equal(await autorizarAlta(new Request('https://mcp.test/carne', { method: 'POST' }), ENV), null);
});

test('MCP_FIRMA_ESTRICTA sigue en pie tras el alta', async () => {
  const salud = await (await manejar(new Request('https://mcp.test/salud'), ENV, { fetch: async () => new Response(JSON.stringify({ status: 'ok', agents: 16 }), { status: 200, headers: { 'content-type': 'application/json' } }) })).json();
  assert.equal(salud.secretos.MCP_FIRMA_ESTRICTA, true);
  assert.equal(salud.secretos.MCP_FLOTA_SEED, true);
  assert.equal(salud.secretos.MCP_ALTA_TOKEN, true);
});
