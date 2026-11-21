// r230 (Carlos, 21-11 21:07): «cambiar el segundo reloj para que ponga los tokens consumidos por un proyecto en concreto o
// por todos por defecto … en el reloj digital siempre estaran lo de todos los proyectos … elimina la frase de debajo de agentes».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");

test("reloj 2 = tokens hoy: aguja y cifra leen el acumulado en vivo (r231: acumulado propio, el odómetro es de ayer)", () => {
  assert.match(js, /Dial\.prototype\.pintaHoy = function \(o\)/);
  assert.match(js, /estado\.acT\.pon\(odoN, odoRitmo, 'vg2:todos'\);/);
  assert.match(js, /valor: function \(\) \{ return estado\.acT\.valor\(\); \}/);
  assert.match(js, /if \(this\.vivoFn\) \{ var vv = this\.vivoFn\(\);/);
  assert.match(js, /T\('tokens hoy', 'tokens today'\)/);
  assert.match(js, /this\.rotuloEscala = 'TOKENS HOY';/);
});

test("con un proyecto elegido la aguja lleva su propio acumulado; los odómetros los pinta pintaOdosAyer tras cada repintado", () => {
  assert.match(js, /estado\.acP\.pon\(hoyP, ritmoP, 'vg2v:p:' \+ nombre\);/);
  assert.match(js, /function pintaProyecto\(d, sin\) \{ pintaProyecto0\(d, sin\); pintaOdosAyer\(d, sin\); \}/);
  assert.match(js, /function pintaIzquierdo\(d, sin\) \{ var m = pintaIzquierdo0\(d, sin\); pintaOdosAyer\(d, sin\); return m; \}/);
});

test("acumulado del proyecto: monótono y escala de millones", () => {
  const w = { document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" } } }; w.window = w;
  vm.runInNewContext(js, w);
  const f = w.ConsumosVelocimetroAguja.odoSiguiente;
  assert.equal(f(4e6, 3.9e6, 0, 5), 4e6);
  assert.match(js, /function escalaHoy\(v\) \{ return escala\(\(Number\(v\) \|\| 0\) \* 1\.25 \/ 1\.5, 1e6\); \}/);
});

test("sin la línea «DeepAgents trabajando / abiertos» bajo Agentes", () => {
  assert.doesNotMatch(html, /vel-ag-nota|DeepAgents trabajando \/ abiertos/);
});
