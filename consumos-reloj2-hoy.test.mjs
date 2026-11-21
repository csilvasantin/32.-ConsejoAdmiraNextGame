// r230 (Carlos, 21-11 21:07): «cambiar el segundo reloj para que ponga los tokens consumidos por un proyecto en concreto o
// por todos por defecto … en el reloj digital siempre estaran lo de todos los proyectos … elimina la frase de debajo de agentes».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");

test("reloj 2 = tokens hoy: aguja y cifra leen el acumulado en vivo; con «Todos» el mismo que el odómetro", () => {
  assert.match(js, /Dial\.prototype\.pintaHoy = function \(o\)/);
  assert.match(js, /valor: function \(\) \{ var o = dial\.box\.querySelector\('\.odo'\)\._odo; return o && o\.mostrado != null \? o\.mostrado : odoN; \}/);
  assert.match(js, /if \(this\.vivoFn\) \{ var vv = this\.vivoFn\(\);/);
  assert.match(js, /T\('tokens hoy', 'tokens today'\)/);
  assert.match(js, /this\.rotuloEscala = 'TOKENS HOY';/);
});

test("el odómetro del reloj 2 es SIEMPRE el de todos los proyectos (clave todos), también con un proyecto elegido", () => {
  const i = js.indexOf("  function pintaProyecto(d, sin) {"), seg = js.slice(i, i + 6000);
  assert.equal((seg.match(/odoN: odoN, odoRitmo: odoRitmo, odoClave: 'todos'/g) || []).length, 2);
  assert.match(seg, /estado\.acP\.pon\(hoyP, ritmoP, 'vg2v:p:' \+ nombre\);/);
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
