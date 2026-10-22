import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
test("Trabajando ahora: cabecera por grupo y una fila por agente/consejero (columna única)", () => {
  assert.match(html, /\.tr-chipgrupo\{display:flex;flex-direction:column/);
  assert.match(html, /\.tr-chiptit\{display:block/);
  assert.match(html, /\.tr-chipgrupo \.tr-chipa\{display:flex;width:100%/);
});
test("Proyectos (x/y): x = tokens últimos 15 min, y = con consumo hoy", () => {
  assert.match(js, /function rotProy\(\) \{ return T\('Proyectos', 'Projects'\) \+ ' \(' \+ xy\(nProyTrab\(\), nProyHoy\(\)\)/);
  assert.match(html, /Proyectos \(0\/0\)/);
});
