// 19-11-2026 (Carlos: «porque marca sin datos, invéntatelos si quieres pero nunca sin datos»).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/consumos-velocimetro-elegir.js", import.meta.url), "utf8"), ctx);
const E = ctx.ConsumosElegir;

test("alias: «Merovingio» (flota/trabajando) encuentra la fila «Grok Bot (Consejo)» del pulso", () => {
  const pa = [{ agente: "Neo", tokHora: 0 }, { agente: "Grok Bot (Consejo)", conRetraso: true, tokHoraCursor: 2e6, tokHoy: 9e6 }];
  assert.equal(E.elegirAgente(pa, "Merovingio").fila.agente, "Grok Bot (Consejo)");
  assert.equal(E.filaDe(pa, "Neo").agente, "Neo");
  assert.equal(E.filaDe(pa, "Nadie"), null);
  assert.ok(E.actividad(pa[1]) > 0);
  assert.equal(E.actividad(pa[0]), 0);
});

test("respaldo: nunca null; real sin etiqueta, todo lo demás etiquetado «estimado»", () => {
  const real = E.respaldo({ tokHora: 1200, tokHoy: 5000, horasDia: 10 });
  assert.deepEqual([real.tokHora, real.tokHoy, real.estimado], [1200, 5000, false]);
  const cur = E.respaldo({ tokHora: null, cursor: 2e6, tokHoy: 9e6, horasDia: 17 });
  assert.equal(cur.fuente, "cursor"); assert.equal(cur.tokHora, 2e6); assert.equal(cur.estimado, true);
  const media = E.respaldo({ tokHora: null, cursor: null, tokHoy: 1000, horasDia: 10 });
  assert.equal(media.fuente, "media"); assert.equal(media.tokHora, 100);
  const ult = E.respaldo({ tokHora: null, tokHoy: null, horasDia: 10, ultimo: { tokHora: 777, tokHoy: 4000 } });
  assert.equal(ult.fuente, "ultimo"); assert.equal(ult.tokHora, 777); assert.equal(ult.tokHoy, 4000);
  const nada = E.respaldo({});
  assert.equal(nada.fuente, "plausible"); assert.ok(nada.tokHora > 0); assert.ok(nada.tokHoy > 0, "odómetro no en ceros con estimado");
  const parte = E.respaldo({ tokHora: null, tokHoy: 0, horasDia: 4, plausible: 300000 });
  assert.equal(parte.tokHora, 300000); assert.ok(parte.tokHoy > 0);
});

test("líneas de código: con tokens y 0 líneas → estimadas; con líneas reales, reales", () => {
  assert.deepEqual({ ...E.lineasRespaldo(0, 1e6, 2000, null) }, { lineas: 500, estimado: true });
  assert.deepEqual({ ...E.lineasRespaldo(0, 1e6, null, null) }, { lineas: 200, estimado: true });
  assert.deepEqual({ ...E.lineasRespaldo(42, 1e6, 2000, null) }, { lineas: 42, estimado: false });
  assert.deepEqual({ ...E.lineasRespaldo(0, 0, 2000, null) }, { lineas: 0, estimado: false });
});

test("el velocímetro ya no escribe «Este agente no aparece…: sin cifra» ni «no se enseña ninguna cifra»", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.ok(!/sin cifra\.'/.test(js));
  assert.ok(!/no se enseña ninguna cifra/i.test(js));
  assert.ok(/E\.respaldo\(/.test(js) && /resp\('ag:'/.test(js) && /resp\('p:'/.test(js) && /resp\('flota'/.test(js));
});
