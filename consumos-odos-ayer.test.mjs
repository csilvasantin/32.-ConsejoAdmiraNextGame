// r231 (Carlos, 21-11 21:25): «en los relojes digitales pondremos el total de tokens del dia de ayer en el de la
// izquierda la media por hora de tokens consumidos y en el de la derecha el total del día».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
const ctx = () => { const w = { document: { readyState: "loading", addEventListener() {}, getElementById: () => null, documentElement: { lang: "es" } } }; w.window = w; vm.runInNewContext(js, w); return w.ConsumosAyer; };

test("ayer = periodos.ayer de la API (libro diario medido); media = total / horas del día de Madrid", () => {
  const A = ctx();
  const r = A.ayerDe({ periodos: { ayer: { tok: 2531878, desde: "2026-11-20", hasta: "2026-11-20", dias: [{ dia: "2026-11-20", tok: 2531878, fuente: "libro diario" }], cobertura: { conDatos: 1, total: 1 } } } }, false);
  assert.equal(r.tok, 2531878); assert.equal(r.horas, 24); assert.equal(Math.round(r.media), 105495); assert.equal(r.fuente, "libro diario");
  assert.equal(A.horasDeDia("2026-10-25"), 25); assert.equal(A.horasDeDia("2026-03-29"), 23);
});

test("sin histórico de ayer: null (nunca un 0 falso), también si Yokup dice «ninguno ese día»", () => {
  const A = ctx();
  assert.equal(A.ayerDe({ periodos: { ayer: { tok: null, desde: "2026-11-20", dias: [{ tok: null, fuente: "sin datos" }] } } }, false).tok, null);
  assert.equal(A.ayerDe({ periodos: { ayer: { tok: 0, desde: "2026-11-20", dias: [{ tok: 0, fuente: "partes Yokup (ninguno ese día)" }] } } }, false).media, null);
  assert.equal(A.ayerDe(null, true).tok, null);
});

test("odómetros quietos (periodo ayer, ritmo 0) con rótulos «Ayer · media tokens/hora» y «Ayer · total tokens»", () => {
  assert.match(js, /odometro\(el, n, 0, dial\.pfx \+ ':ayer', 'ayer'\);/);
  assert.match(html, /id="vel-ag-rotulo"[^>]*>Ayer · media tokens\/hora<\/p>/);
  assert.match(html, /id="vel-proy-rotulo"[^>]*>Ayer · total tokens<\/p>/);
  assert.doesNotMatch(js, /odometro\(b\.querySelector\('\.odo'\), (tokHoy|o\.odoN)/);
});
