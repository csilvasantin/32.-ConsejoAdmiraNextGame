import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor, manejar } from '../src/index.js';
import { crearBandeja, pareceSecreto, exigirConsejero } from '../src/mensajes.js';

const huang = { persona: 'Huang', machine: 'GrokBot', runtime: 'Grok', agent: 'HuangGrokBot', tipo: 'consejero' };
const lucas = { persona: 'Lucas', machine: 'GrokBot', runtime: 'Grok', agent: 'LucasGrokBot', tipo: 'consejero' };
const agente = { persona: 'Merovingio', machine: 'MacMini', runtime: 'Grok CLI', agent: 'MerovingioMacMini', tipo: 'agente' };

function kvMemoria() {
  const m = new Map();
  return {
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); },
  };
}

async function cliente(identidad, kv) {
  const server = crearServidor({ ADMIRA_LIVE_DESDE: kv }, {}, identidad);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'prueba-bandeja', version: '0.0.1' });
  await client.connect(a);
  return client;
}

const texto = (r) => JSON.parse(r.content[0].text);

test('Jensen es Huang y un agente no puede escribir como consejero', () => {
  assert.equal(exigirConsejero(huang, 'Jensen').persona, 'Huang');
  assert.throws(() => exigirConsejero(agente, 'Huang'), /agente de la flota/);
  assert.throws(() => exigirConsejero(lucas, 'Huang'), /clave es la de Lucas/);
  assert.equal(pareceSecreto('Bearer abcdefghijklmnop'), true);
  assert.equal(pareceSecreto('la presentación de Starbucks de mañana'), false);
});

test('Huang escribe a Lucas, Lucas lee y responde, y el chat público lo enseña', async () => {
  const kv = kvMemoria();
  const env = { ADMIRA_LIVE_DESDE: kv };
  const jensen = crearBandeja(env);
  const enviado = await jensen.enviar({
    de: 'Jensen', para: 'Lucas', maquina: 'MacMini',
    texto: 'Lucas, ¿cómo llevamos la presentación de Starbucks de mañana?',
  }, huang);
  assert.equal(enviado.mensaje.de, 'Huang');
  assert.equal(enviado.mensaje.para, 'Lucas');
  assert.equal(enviado.mensaje.maquina, 'MacMini');
  assert.equal(enviado.mensaje.leido, false);

  const bandeja = await crearBandeja(env).bandeja({ yo: 'Lucas' }, lucas);
  assert.equal(bandeja.pendientes.length, 1);
  assert.equal(bandeja.marcados, 1);
  const otra = await crearBandeja(env).bandeja({ yo: 'Lucas' }, lucas);
  assert.equal(otra.pendientes.length, 0);

  const respuesta = await crearBandeja(env).responder({
    id: enviado.mensaje.id, texto: 'La presentación de Starbucks está en el guion: studio, store y app.', maquina: 'MacStudio',
  }, lucas);
  assert.equal(respuesta.mensaje.de, 'Lucas');
  assert.equal(respuesta.mensaje.para, 'Huang');
  assert.equal(respuesta.mensaje.maquina, 'MacStudio');
  assert.equal(respuesta.responde_a, enviado.mensaje.id);

  const publico = await crearBandeja(env).listar('Lucas');
  assert.equal(publico.mensajes.length, 2);
  assert.match(publico.mensajes.map((m) => m.texto).join(' '), /Starbucks/);
  await assert.rejects(() => crearBandeja(env).enviar({ de: 'Huang', para: 'Lucas', texto: 'token: abcdefghijklmnop' }, huang), /secreto/);
});

test('las tres herramientas hablan por el MCP y el GET público no pide clave', async () => {
  const kv = kvMemoria();
  const client = await cliente(huang, kv);
  const r = await client.callTool({ name: 'consejero_mensaje', arguments: { de: 'Huang', para: 'Lucas', texto: '¿Listo el guion de Starbucks?', maquina: 'MacMini' } });
  assert.equal(r.isError, undefined);
  const id = texto(r).mensaje.id;
  const lucasClient = await cliente(lucas, kv);
  const leido = await lucasClient.callTool({ name: 'consejero_bandeja', arguments: { yo: 'Lucas' } });
  assert.equal(texto(leido).pendientes[0].id, id);
  const resp = await lucasClient.callTool({ name: 'consejero_responder', arguments: { id, texto: 'Sí. Mañana lo vemos.', maquina: 'MacStudio' } });
  assert.equal(texto(resp).mensaje.para, 'Huang');
  const publico = await (await manejar(new Request('https://mcp.test/consejero/mensajes?con=Lucas'), { ADMIRA_LIVE_DESDE: kv }, {})).json();
  assert.equal(publico.ok, true);
  assert.equal(publico.mensajes.length, 2);
  const ajeno = await client.callTool({ name: 'consejero_mensaje', arguments: { de: 'Lucas', para: 'Huang', texto: 'no soy Lucas' } });
  assert.equal(ajeno.isError, true);
});
