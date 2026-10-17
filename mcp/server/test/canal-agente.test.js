import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { crearBandeja } from '../src/mensajes.js';
import { supervisorDe } from '../src/supervisores.js';

const musk = { persona: 'Musk', machine: 'GrokBot', runtime: 'Grok', agent: 'MuskGrokBot', tipo: 'consejero' };
const lucas = { persona: 'Lucas', machine: 'GrokBot', runtime: 'Grok', agent: 'LucasGrokBot', tipo: 'consejero' };
const morfeo = { persona: 'Morfeo', machine: 'MacMini', runtime: 'Claude Code', agent: 'MorfeoMacMini', tipo: 'agente' };
const oraculo = { persona: 'Oraculo', machine: 'MacMini', runtime: 'Codex', agent: 'OraculoMacMini', tipo: 'agente' };
const neo = { persona: 'Neo', machine: 'MacMini', runtime: 'Claude Code', agent: 'NeoMacMini', tipo: 'agente' };

function kvMemoria() {
  const m = new Map();
  return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); } };
}
const texto = (r) => JSON.parse(r.content[0].text);

test('mapa de supervisión: Elon supervisa a Oráculo y Morfeo; deepagents salen de sillas.js', () => {
  assert.equal(supervisorDe('Morfeo'), 'Musk');
  assert.equal(supervisorDe('Oráculo'), 'Musk');
  assert.equal(supervisorDe('Merovingio'), 'Musk');
  assert.equal(supervisorDe('Cypher'), 'Huang');
  assert.equal(supervisorDe('Neo'), 'Jobs');
  assert.equal(supervisorDe('Trinity'), 'Jobs');
  assert.equal(supervisorDe('Smith'), null);
});

test('Morfeo escribe a Elon, Elon lee y responde, Morfeo lo lee y contesta', async () => {
  const env = { ADMIRA_LIVE_DESDE: kvMemoria() };
  const r = await crearBandeja(env).enviar({ para: 'Elon', texto: 'Elon, el recordatorio de la idea 3 está listo.' }, morfeo);
  assert.equal(r.mensaje.de, 'Morfeo');
  assert.equal(r.mensaje.de_tipo, 'agente');
  assert.equal(r.mensaje.para, 'Musk');
  const b = await crearBandeja(env).bandeja({}, musk);
  assert.equal(b.pendientes.length, 1);
  const resp = await crearBandeja(env).responder({ id: r.mensaje.id, texto: 'Recibido, lo sello.' }, musk);
  assert.equal(resp.mensaje.para, 'Morfeo');
  assert.equal(resp.mensaje.para_tipo, 'agente');
  const bm = await crearBandeja(env).bandeja({}, morfeo);
  assert.equal(bm.pendientes.length, 1);
  assert.equal(bm.supervisor, 'Musk');
  const again = await crearBandeja(env).responder({ id: resp.mensaje.id, texto: 'Gracias.' }, morfeo);
  assert.equal(again.mensaje.para, 'Musk');
  // las respuestas al agente no se cuelan en la bandeja de otro consejero ni en la de Musk
  assert.equal((await crearBandeja(env).bandeja({}, musk)).pendientes.length, 1);
  assert.equal((await crearBandeja(env).listar('Morfeo')).mensajes.length, 3);
});

test('un agente no puede escribir a otro consejero ni sin supervisor, ni llevar secretos', async () => {
  const env = { ADMIRA_LIVE_DESDE: kvMemoria() };
  await assert.rejects(() => crearBandeja(env).enviar({ para: 'Lucas', texto: 'hola' }, oraculo), /supervisor, Musk/);
  await assert.rejects(() => crearBandeja(env).enviar({ para: 'Musk', texto: 'hola' }, { ...neo, persona: 'Smith', agent: 'SmithMacMini' }), /no tiene consejero supervisor/);
  await assert.rejects(() => crearBandeja(env).enviar({ para: 'Musk', texto: 'token: abcdefghijklmnop' }, oraculo), /secreto/);
  const l = await crearBandeja(env).enviar({ de: 'Lucas', para: 'Musk', texto: 'Hola Elon' }, lucas);
  await assert.rejects(() => crearBandeja(env).responder({ id: l.mensaje.id, texto: 'me cuelo' }, oraculo), /no es para Oraculo/);
});

test('por el MCP: el agente usa consejero_mensaje sin de', async () => {
  const kv = kvMemoria();
  const server = crearServidor({ ADMIRA_LIVE_DESDE: kv }, {}, morfeo);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'prueba-canal', version: '0.0.1' });
  await client.connect(a);
  const ok = await client.callTool({ name: 'consejero_mensaje', arguments: { para: 'Musk', texto: 'Hola Elon' } });
  assert.equal(ok.isError, undefined);
  assert.equal(texto(ok).mensaje.para, 'Musk');
  const no = await client.callTool({ name: 'consejero_mensaje', arguments: { para: 'Huang', texto: 'Hola Jensen' } });
  assert.equal(no.isError, true);
});
