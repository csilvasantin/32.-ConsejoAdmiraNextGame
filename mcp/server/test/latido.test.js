import test from 'node:test';
import assert from 'node:assert/strict';
import { latir, leerLatidos, vigentes, entradaLatido, latidoPorEncargo, CLAVE_LATIDO } from '../src/latido.js';
import { manejar } from '../src/index.js';

const kvFalso = () => { const m = new Map(); return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };

test('trabajando caduca a los 10 min sin renovar', async () => {
  const kv = kvFalso();
  const r = await latir(kv, 'Wozniak', { modo: 'trabajando', mision: 'afinar consumos', proyecto: 'admira.live' }, 1000);
  assert.equal(r.hasta, 1600);
  const d = await leerLatidos(kv);
  assert.equal(vigentes(d, 1599).Wozniak.modo, 'trabajando');
  assert.equal(vigentes(d, 1600).Wozniak.modo, 'reposo');
  assert.equal(vigentes(d, 1600).Wozniak.caducado, true);
});

test('renovar conserva desde y misión; reposo apaga', () => {
  const a = entradaLatido({ mision: 'm1' }, null, 100);
  const b = entradaLatido({}, a, 400);
  assert.equal(b.desde, 100); assert.equal(b.mision, 'm1'); assert.equal(b.hasta, 1000);
  const c = entradaLatido({ modo: 'reposo' }, b, 500);
  assert.equal(c.modo, 'reposo'); assert.equal(c.hasta, 500);
});

test('acusar un encargo marca trabajando; done pone reposo; agentes no', async () => {
  const kv = kvFalso();
  await latidoPorEncargo(kv, { tipo: 'consejero', persona: 'Jobs' }, 'ack', 7001);
  let v = vigentes(await leerLatidos(kv));
  assert.equal(v.Jobs.modo, 'trabajando'); assert.equal(v.Jobs.encargo, 7001);
  await latidoPorEncargo(kv, { tipo: 'consejero', persona: 'Jobs' }, 'done', 7001);
  v = vigentes(await leerLatidos(kv));
  assert.equal(v.Jobs.modo, 'reposo');
  await latidoPorEncargo(kv, { tipo: 'agente', persona: 'Neo' }, 'ack', 1);
  assert.equal((await leerLatidos(kv)).Neo, undefined);
});

test('GET /consejeros/latido es público y da el modo efectivo', async () => {
  const kv = kvFalso();
  await latir(kv, 'Wozniak', { mision: 'x' });
  const r = await manejar(new Request('https://mcp.admira.live/consejeros/latido'), { ADMIRA_LIVE_DESDE: kv });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.consejeros.Wozniak.modo, 'trabajando');
  assert.ok(kv.m.has(CLAVE_LATIDO));
});
