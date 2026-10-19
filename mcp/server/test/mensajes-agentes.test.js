import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBandeja, agenteDestino, comprobarFrecuencia, MAX_POR_PAR_CON_AGENTE } from '../src/mensajes.js';
import { crearAvisos } from '../src/avisos.js';

const yo = (p) => ({ persona: p, machine: 'GrokBot', agent: `${p}GrokBot`, tipo: 'consejero' });
const ag = (p, m = 'MacMini') => ({ persona: p, machine: m, agent: `${p}${m}`, tipo: 'agente' });
function kvMemoria() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}

test('consejero → cualquier agente: queda en la bandeja del agente, con su máquina de casa', async () => {
  const env = { ADMIRA_LIVE_DESDE: kvMemoria() };
  const r = await crearBandeja(env).enviar({ para: 'Oráculo', texto: 'Hola Oráculo, soy Steve' }, yo('Jobs'));
  assert.equal(r.mensaje.para, 'Oraculo'); assert.equal(r.mensaje.para_tipo, 'agente'); assert.equal(r.mensaje.maquina_para, 'macmini');
  const b = await crearBandeja(env).bandeja({}, ag('Oraculo'));
  assert.equal(b.pendientes.length, 1); assert.equal(b.pendientes[0].de, 'Jobs');
  // el agente contesta a Jobs (que no es su supervisor) y Jobs lo lee
  const resp = await crearBandeja(env).responder({ id: r.mensaje.id, texto: 'Recibido, Steve' }, ag('Oraculo'));
  assert.equal(resp.mensaje.para, 'Jobs');
  const bj = await crearBandeja(env).bandeja({}, yo('Jobs'));
  assert.equal(bj.pendientes[0].de, 'Oraculo');
  // Jobs le contesta de vuelta al agente
  const r2 = await crearBandeja(env).responder({ id: bj.pendientes[0].id, texto: 'Perfecto' }, yo('Jobs'));
  assert.equal(r2.mensaje.para, 'Oraculo'); assert.equal(r2.mensaje.para_tipo, 'agente');
  // otro agente no lee ni responde lo de Oráculo
  assert.equal((await crearBandeja(env).bandeja({}, ag('Neo'))).pendientes.length, 0);
  await assert.rejects(() => crearBandeja(env).responder({ id: r2.mensaje.id, texto: 'me cuelo' }, ag('Neo')), /no es para Neo/);
  // listar por agente para la web
  assert.ok((await crearBandeja(env).listar('Oraculo')).mensajes.length >= 3);
});

test('destinos: agentes reconocidos y desconocidos', async () => {
  assert.equal(agenteDestino('Merovingio'), 'Merovingio');
  assert.equal(agenteDestino('nadie'), null);
  await assert.rejects(() => crearBandeja({ ADMIRA_LIVE_DESDE: kvMemoria() }).enviar({ para: 'Pepito', texto: 'x' }, yo('Jobs')), /agente de la flota/);
});

test('anti-bucle: pareja con agente limitada a 8 en 10 min; remitente a 20', async () => {
  const env = { ADMIRA_LIVE_DESDE: kvMemoria() };
  const b = crearBandeja(env);
  let ultimo;
  for (let i = 0; i < MAX_POR_PAR_CON_AGENTE; i++) {
    ultimo = i % 2 === 0 ? await b.enviar({ para: 'Morfeo', texto: `ping ${i}` }, yo('Musk')) : await b.enviar({ para: 'Musk', texto: `pong ${i}` }, ag('Morfeo'));
  }
  await assert.rejects(() => b.enviar({ para: 'Musk', texto: 'uno más' }, ag('Morfeo')), /anti-bucle/);
  // con otro consejero sí puede
  assert.equal((await b.enviar({ para: 'Jobs', texto: 'hola' }, ag('Morfeo'))).ok, true);
  const lista = Array.from({ length: 20 }, (_, i) => ({ de: 'Jobs', para: `X${i}`, hora: new Date().toISOString() }));
  assert.throws(() => comprobarFrecuencia(lista, { de: 'Jobs', para: 'Lucas' }, Date.now()), /límite/);
  const viejos = lista.map((x) => ({ ...x, hora: new Date(Date.now() - 11 * 60 * 1000).toISOString() }));
  assert.doesNotThrow(() => comprobarFrecuencia(viejos, { de: 'Jobs', para: 'Lucas' }, Date.now()));
});

test('webhook de agente: lo registra el agente y se le avisa al momento', async () => {
  const kv = kvMemoria(); const pend = []; const llamadas = [];
  const deps = { waitUntil: (p) => pend.push(p), fetchWebhook: async (u, i) => { llamadas.push({ u, i }); return { status: 204 }; } };
  const env = { ADMIRA_LIVE_DESDE: kv };
  await crearAvisos(env, deps).registrar({ url: 'https://hooks.example.com/morfeo' }, ag('Morfeo'));
  await assert.rejects(crearAvisos(env, deps).registrar({ url: 'https://hooks.example.com/x', silla: 'Neo' }, ag('Morfeo')), /propio webhook/);
  await crearBandeja(env, deps).enviar({ para: 'Morfeo', texto: 'Despierta' }, yo('Musk'));
  await Promise.all(pend);
  assert.equal(llamadas.length, 1);
  const c = JSON.parse(llamadas[0].i.body);
  assert.equal(c.para, 'Morfeo'); assert.equal(c.para_tipo, 'agente'); assert.equal(c.de, 'Musk');
});
