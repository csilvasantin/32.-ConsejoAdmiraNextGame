import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBandeja, CLAVE_KV, MAX_POR_REMITENTE, MAX_POR_PAR_CON_AGENTE, recortar } from '../src/mensajes.js';
import { BandejaConsejo } from '../src/bandeja-do.js';
import { manejar } from '../src/index.js';

const yo = (p) => ({ persona: p, machine: 'GrokBot', agent: `${p}GrokBot`, tipo: 'consejero' });
const ag = (p, m = 'MacMini') => ({ persona: p, machine: m, agent: `${p}${m}`, tipo: 'agente' });
const espera = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));

/* KV que imita al de Cloudflare: escrituras que tardan y lecturas que pueden ser viejas. */
function kvEventual() {
  const m = new Map();
  return {
    m, escrituras: 0,
    async get(k, t) { await espera(); const v = m.get(k); if (v == null) return null; const tipo = typeof t === 'string' ? t : t && t.type; return tipo === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { this.escrituras++; await espera(); m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}
/* Namespace de Durable Objects en memoria: una instancia por nombre, almacenamiento con latencia. */
function doNamespace(env) {
  const instancias = new Map();
  const ns = {
    instancias,
    idFromName: (n) => n,
    get(id) {
      if (!instancias.has(id)) {
        const datos = new Map();
        const storage = {
          datos,
          async get(k) { await espera(); return datos.has(k) ? structuredClone(datos.get(k)) : undefined; },
          async put(k, v) { await espera(); if (typeof k === 'object') for (const [a, b] of Object.entries(k)) datos.set(a, structuredClone(b)); else datos.set(k, structuredClone(v)); },
          async deleteAll() { datos.clear(); },
        };
        instancias.set(id, new BandejaConsejo({ storage }, env));
      }
      const obj = instancias.get(id);
      return { fetch: (u, i) => obj.fetch(new Request(u, i)) };
    },
  };
  return ns;
}
function entorno() {
  const env = { ADMIRA_LIVE_DESDE: kvEventual() };
  env.BANDEJA = doNamespace(env);
  return env;
}

test('Durable Object: 60 envíos en paralelo de varias parejas, todos guardados y sin ids repetidos', async () => {
  const env = entorno();
  const de = ['Jobs', 'Wozniak', 'Lucas', 'Disney'];
  const para = ['Musk', 'Huang'];
  const tareas = [];
  for (let i = 0; i < 60; i++) tareas.push(crearBandeja(env).enviar({ para: para[i % 2], texto: `m${i}` }, yo(de[i % 4])));
  const rs = await Promise.all(tareas);
  assert.equal(rs.every((r) => r.ok), true);
  const todo = await crearBandeja(env).listar('', 500);
  assert.equal(todo.mensajes.length, 60);
  assert.equal(new Set(todo.mensajes.map((m) => m.id)).size, 60);
  assert.deepEqual(new Set(todo.mensajes.map((m) => m.texto)), new Set(rs.map((r) => r.mensaje.texto)));
  // el KV antiguo no se toca
  assert.equal(env.ADMIRA_LIVE_DESDE.escrituras, 0);
});

test('Durable Object: el anti-bucle salta en ráfaga paralela (20 por remitente, 8 por pareja con agente)', async () => {
  const env = entorno();
  const rs = await Promise.allSettled(Array.from({ length: MAX_POR_REMITENTE + 7 }, (_, i) => crearBandeja(env).enviar({ para: i % 2 ? 'Lucas' : 'Jobs', texto: `r${i}` }, yo('Musk'))));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, MAX_POR_REMITENTE);
  assert.equal(rs.filter((r) => r.status === 'rejected' && /límite/.test(r.reason.message)).length, 7);
  const env2 = entorno();
  const par = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => (i % 2
    ? crearBandeja(env2).enviar({ para: 'Musk', texto: `pong${i}` }, ag('Morfeo'))
    : crearBandeja(env2).enviar({ para: 'Morfeo', texto: `ping${i}` }, yo('Musk')))));
  assert.equal(par.filter((r) => r.status === 'fulfilled').length, MAX_POR_PAR_CON_AGENTE);
  assert.ok(par.filter((r) => r.status === 'rejected').every((r) => /anti-bucle/.test(r.reason.message)));
});

test('Durable Object: bandejas y envíos a la vez: cada mensaje se entrega una sola vez, ninguno se pierde', async () => {
  const env = entorno();
  const N = 30;
  const envios = Array.from({ length: N }, (_, i) => crearBandeja(env).enviar({ para: 'Musk', texto: `b${i}` }, yo(['Jobs', 'Wozniak', 'Lucas'][i % 3])));
  const lecturas = Array.from({ length: 10 }, () => crearBandeja(env).bandeja({}, yo('Musk')));
  const [, ls] = await Promise.all([Promise.all(envios), Promise.all(lecturas)]);
  const vistos = ls.flatMap((b) => b.pendientes.map((m) => m.id));
  const resto = (await crearBandeja(env).bandeja({}, yo('Musk'))).pendientes.map((m) => m.id);
  const total = [...vistos, ...resto];
  assert.equal(total.length, N);
  assert.equal(new Set(total).size, N);
});

test('Durable Object: respuestas en paralelo llegan todas a quien escribió', async () => {
  const env = entorno();
  const de = ['Jobs', 'Wozniak', 'Lucas', 'Disney'];
  await Promise.all(de.map((d) => crearBandeja(env).enviar({ para: 'Huang', texto: `hola de ${d}` }, yo(d))));
  const b = await crearBandeja(env).bandeja({}, yo('Huang'));
  assert.equal(b.pendientes.length, 4);
  await Promise.all(b.pendientes.map((m) => crearBandeja(env).responder({ id: m.id, texto: `re ${m.de}` }, yo('Huang'))));
  for (const d of de) {
    const r = await crearBandeja(env).bandeja({}, yo(d));
    assert.equal(r.pendientes.length, 1);
    assert.equal(r.pendientes[0].de, 'Huang');
    assert.equal(r.pendientes[0].texto, `re ${d}`);
    assert.ok(r.pendientes[0].responde_a);
  }
});

test('migración: la instancia «consejo» copia la clave antigua del KV sin borrarla y une lo que llega tarde', async () => {
  const env = entorno();
  const viejo = [
    { id: 'cmA', de: 'Musk', para: 'Lucas', texto: 'uno', hora: '2026-10-19T10:00:00.000Z', leido: false, de_tipo: 'consejero', para_tipo: 'consejero', maquina: 'GrokBot' },
    { id: 'cmB', de: 'Lucas', para: 'Musk', texto: 'dos', hora: '2026-10-19T10:01:00.000Z', leido: true, de_tipo: 'consejero', para_tipo: 'consejero', maquina: 'GrokBot' },
  ];
  env.ADMIRA_LIVE_DESDE.m.set(CLAVE_KV, JSON.stringify(viejo));
  const l = await crearBandeja(env).listar('', 500);
  assert.deepEqual(l.mensajes.map((m) => m.id), ['cmA', 'cmB']);
  // llega tarde un mensaje escrito por la versión vieja: se une por id, sin duplicar
  env.ADMIRA_LIVE_DESDE.m.set(CLAVE_KV, JSON.stringify([...viejo, { ...viejo[0], id: 'cmC', texto: 'tres', hora: '2026-10-19T10:02:00.000Z' }]));
  await crearBandeja(env).enviar({ para: 'Lucas', texto: 'nuevo' }, yo('Jobs'));
  const l2 = await crearBandeja(env).listar('', 500);
  assert.deepEqual(l2.mensajes.map((m) => m.texto), ['uno', 'dos', 'tres', 'nuevo']);
  assert.equal((await crearBandeja(env).bandeja({}, yo('Lucas'))).pendientes.length, 3);
  // el KV antiguo sigue igual (copia), nunca se escribe
  assert.equal(JSON.parse(env.ADMIRA_LIVE_DESDE.m.get(CLAVE_KV)).length, 3);
  assert.equal(env.ADMIRA_LIVE_DESDE.escrituras, 0);
  // la sandbox no importa nada real
  const sb = await crearBandeja({ ...env, BANDEJA_NOMBRE: 'sandbox' }).listar('', 500);
  assert.equal(sb.mensajes.length, 0);
});

test('modo KV (sin Durable Object): el cerrojo local tampoco pierde mensajes en paralelo', async () => {
  const env = { ADMIRA_LIVE_DESDE: kvEventual() };
  await Promise.all(Array.from({ length: 15 }, (_, i) => crearBandeja(env).enviar({ para: 'Morfeo', texto: `k${i}` }, yo('Musk')).catch(() => null)));
  // 8 por pareja con agente: el resto lo para el anti-bucle, pero ninguno aceptado se pierde
  assert.equal((await crearBandeja(env).listar('Morfeo', 500)).mensajes.length, MAX_POR_PAR_CON_AGENTE);
});

test('recortar: nunca tira un mensaje sin leer mientras haya leídos', () => {
  const l = [{ id: 1, leido: false }, { id: 2, leido: true }, { id: 3, leido: false }, { id: 4, leido: true }];
  assert.deepEqual(recortar(l, 2).map((m) => m.id), [1, 3]);
});

test('sandbox HTTP: instancia propia, límite subido solo con cabecera, listado y vaciado', async () => {
  const env = entorno();
  env.AVISOS_SANDBOX_KEY = 'k'.repeat(32);
  const mcp = (persona, nombre, args, extra = {}) => manejar(new Request('https://x/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.AVISOS_SANDBOX_KEY}`, 'x-sandbox-persona': persona, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nombre, arguments: args } }),
  }), env, {}).then((r) => r.json());
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => mcp('Musk', 'consejero_mensaje', { para: 'Jobs', texto: `s${i}` }, { 'x-sandbox-limite-remitente': '100' })));
  assert.equal(rs.filter((r) => !r.result.isError).length, 25);
  const sinCab = await mcp('Musk', 'consejero_mensaje', { para: 'Jobs', texto: 'otro' });
  assert.equal(sinCab.result.isError, true);
  assert.match(sinCab.result.content[0].text, /límite/);
  const lista = await (await manejar(new Request('https://x/consejero/mensajes?con=Jobs', { headers: { authorization: `Bearer ${env.AVISOS_SANDBOX_KEY}` } }), env, {})).json();
  assert.equal(lista.mensajes.length, 25);
  assert.equal(env.BANDEJA.instancias.has('consejo'), false);
  const del = await (await manejar(new Request('https://x/consejero/mensajes/sandbox', { method: 'DELETE', headers: { authorization: `Bearer ${env.AVISOS_SANDBOX_KEY}` } }), env, {})).json();
  assert.equal(del.ok, true);
  const vacia = await (await manejar(new Request('https://x/consejero/mensajes?con=Jobs', { headers: { authorization: `Bearer ${env.AVISOS_SANDBOX_KEY}` } }), env, {})).json();
  assert.equal(vacia.mensajes.length, 0);
  const sinClave = await manejar(new Request('https://x/consejero/mensajes/sandbox', { method: 'DELETE' }), env, {});
  assert.equal(sinClave.status, 401);
});
