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
  assert.equal(typeof publico.pendientes, 'number');
  const ajeno = await client.callTool({ name: 'consejero_mensaje', arguments: { de: 'Lucas', para: 'Huang', texto: 'no soy Lucas' } });
  assert.equal(ajeno.isError, true);
});

test('#6975: Lucas→Musk llega DIRECTO (sin encargo-aviso) y queda registrado', async () => {
  const posts = [];
  const fetchAviso = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return { ok: true, status: 200, json: async () => ({ ok: true, despertado: true, resultado: 'ok' }) };
  };
  const lucas = { persona: 'Lucas', machine: 'GrokBot', agent: 'LucasGrokBot', tipo: 'consejero' };
  const env = { ADMIRA_LIVE_DESDE: kvMemoria(), ADMIRA_TELEGRAM_PANEL_KEY: 'panel-de-prueba', ADMIRA_TELEGRAM_URL: 'https://bot.test', TELEGRAM: { fetch: fetchAviso } };
  const r = await crearBandeja(env).enviar({ de: 'Lucas', para: 'Elon', texto: 'Elon, prueba directa.' }, lucas);
  assert.equal(r.aviso.ok, true);
  assert.equal(r.aviso.directo, true);
  assert.equal(r.aviso.encargo, undefined);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://bot.test/api/consejero-mensaje/despertar');
  assert.equal(posts[0].body.persona, 'Musk');
  assert.equal(posts[0].body.mensaje.id, r.mensaje.id);
  assert.match(posts[0].body.mensaje.url, /consejero\.html\?con=Musk#/);
  assert.equal(posts.some((p) => p.url.endsWith('/api/bot-inbox')), false);
  const publico = await crearBandeja(env).listar('Musk');
  assert.equal(publico.mensajes[0].id, r.mensaje.id);
  assert.ok(publico.mensajes[0].hora);
});

test('Elon avisa a Lucas en su buzón y el mensaje sigue guardado si el aviso falla', async () => {
  const posts = [];
  const fetchAviso = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    if (url.endsWith('/despertar')) return { ok: false, status: 404, json: async () => ({ ok: false }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, id: 6315 }) };
  };
  const musk = { persona: 'Musk', machine: 'GrokBot', runtime: 'Grok', agent: 'MuskGrokBot', tipo: 'consejero' };
  const env = {
    ADMIRA_LIVE_DESDE: kvMemoria(),
    ADMIRA_TELEGRAM_PANEL_KEY: 'panel-de-prueba',
    ADMIRA_TELEGRAM_URL: 'https://bot.test',
    TELEGRAM: { fetch: fetchAviso },
  };
  const r = await crearBandeja(env).enviar({
    de: 'Elon', para: 'Lucas', maquina: 'MacMini',
    texto: 'Lucas, te mando el orden del día por este canal.',
  }, musk);
  assert.equal(r.mensaje.de, 'Musk');
  assert.equal(r.aviso.ok, true);
  assert.equal(r.aviso.encargo, 6315);
  assert.equal(r.aviso.respaldo, true);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].url, 'https://bot.test/api/consejero-mensaje/despertar');
  posts.shift();
  assert.equal(posts[0].url, 'https://bot.test/api/bot-inbox');
  assert.equal(posts[0].body.target_persona, 'Lucas');
  assert.equal(posts[0].body.target_machine, 'grokbot');
  assert.equal(posts[0].body.materialize_mission, false);
  assert.match(posts[0].body.text, /^\[chat-coetaneos\] Elon Musk → George Lucas/);
  assert.match(posts[0].body.text, /orden del día/);
  assert.equal(posts[0].auth, 'Bearer panel-de-prueba');
  assert.equal(r.mensaje.texto.includes('panel-de-prueba'), false);

  const roto = {
    ADMIRA_LIVE_DESDE: kvMemoria(),
    ADMIRA_TELEGRAM_PANEL_KEY: 'panel-de-prueba',
    TELEGRAM: { fetch: async () => { throw new Error('red'); } },
  };
  const r2 = await crearBandeja(roto).enviar({ de: 'Musk', para: 'Lucas', texto: 'sigue guardado' }, musk);
  assert.equal(r2.mensaje.para, 'Lucas');
  assert.equal(r2.aviso.ok, false);
  const publico = await crearBandeja(roto).listar('Lucas');
  assert.equal(publico.pendientes, 1);
  assert.equal(publico.mensajes[0].leido, false);
});
