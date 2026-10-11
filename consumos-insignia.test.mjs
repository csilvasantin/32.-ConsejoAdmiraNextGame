// #5670 reemplaza la insignia contable #5645: proveedor real por superficie.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { matriz, insignia } from './flota-matriz-lib.mjs';
import { tarjetas } from './flota-trabajando-lib.mjs';
import { orquestar } from './orquestar-lib.mjs';
const T = 1791700000;
const late = (persona, machine, runtime, model, proveedor) => ({ persona, machine, runtime, model, proveedor, updated: T - 60 });
const presencia = [
  late('Trinity', 'MacBook Pro 16', 'Codex', '6.1 Sol'),
  late('Trinity', 'MacBookProNegro14', 'Codex', '6.1 Sol'),
  ...['Trinity', 'Cypher', 'Merovingio', 'Niobe'].map((p) => late(p, 'GrokBotBox', 'DeepAgents dcode', 'nvidia/nemotron:free', 'OpenRouter')),
  late('Smith', 'MacMini', 'Grok', 'grok-4.7'),
  late('Agente Nuevo', 'MacMini', 'DeepAgents', 'nemotron'),
];
test('matriz: Trinity conserva PAGO en MacBooks y GRATIS en GrokBotBox; no decide la suscripción', () => {
  const { filas, resumen } = matriz({ presencia, ahoraS: T });
  const tr = filas.find((f) => f.persona === 'Trinity');
  assert.deepEqual(tr.costes.map((i) => i.distintivo), ['PAGO', 'PAGO', 'GRATIS']);
  assert.equal(tr.coste, 'pago');
  for (const p of ['Merovingio', 'Cypher', 'Niobe']) assert.equal(filas.find((f) => f.persona === p).insignia, 'gratis');
  assert.equal(filas.find((f) => f.persona === 'Merovingio').coste_plan, 'pago', 'r6 conserva su mapa contable');
  assert.equal(filas.find((f) => f.persona === 'Smith').insignia, 'pago');
  assert.equal(filas.find((f) => f.persona === 'Agente Nuevo').insignia, 'desconocido');
  assert.equal(resumen.suscripciones, 6);
  assert.equal(resumen.insigniaPago + resumen.insigniaGratis + resumen.insigniaDesconocido, filas.length);
});
test('tarjetas y orquestador ofrecen los mismos costes por superficie; datos ausentes no son gratis', () => {
  const ts = tarjetas({ presencia, ahoraS: T });
  for (const p of ['Merovingio', 'Cypher', 'Niobe']) assert.equal(ts.find((t) => t.agente === p).coste, 'gratis', p);
  const tr = ts.find((t) => t.agente === 'Trinity');
  assert.deepEqual(tr.costes.map((x) => x.distintivo), ['PAGO', 'PAGO', 'GRATIS']);
  const orq = orquestar({ tipo: 'codigo', presencia, ahora: T * 1000 });
  const c = orq.candidatos.find((x) => x.persona === 'Trinity');
  assert.equal(c.coste, 'pago'); assert.equal(c.maquina, 'MacBook Pro 16');
  assert.equal(orq.costes.find((x) => x.persona === 'Merovingio').coste, 'gratis');
  assert.equal(orquestar({ tipo: 'codigo', presencia: [], ahora: T * 1000 }).candidatos.find((x) => x.persona === 'Trinity').coste, 'desconocido');
});
test('sin presencia y proveedor no hay gratis por defecto; sí persiste r6', () => {
  const { filas } = matriz({ ahoraS: T });
  assert.ok(filas.every((x) => x.coste === 'desconocido'));
  assert.equal(insignia(null), 'desconocido');
  assert.equal(insignia({ titular: true, coste: 'gratis' }), 'gratis');
});
test('dato antiguo conserva coste como último dato, no inventa presencia viva', () => {
  const p = [late('Merovingio', 'GrokBotBox', 'DeepAgents', 'openai:nvidia/nemotron:free')].map((x) => ({ ...x, updated: T - 3600 }));
  const f = matriz({ presencia: p, ahoraS: T }).filas.find((x) => x.persona === 'Merovingio');
  assert.equal(f.coste, 'gratis'); assert.equal(f.vivo, false); assert.equal(f.costes[0].vivo, false);
});
test('distintivos ES/EN incluyen estado desconocido y nunca interpretan HTML recibido', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('./assets/coste-distintivo.js', import.meta.url), 'utf8'), ctx);
  assert.match(ctx.CosteDistintivo.html('pago'), />PAGO</);
  assert.match(ctx.CosteDistintivo.html('gratis'), />GRATIS</);
  assert.match(ctx.CosteDistintivo.html('<img onerror=alert(1)>'), />DESCONOCIDO</);
  assert.match(ctx.CosteDistintivo.html('desconocido', true), />UNKNOWN</);
});
