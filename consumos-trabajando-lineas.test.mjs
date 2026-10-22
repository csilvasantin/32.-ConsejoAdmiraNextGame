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

// Carlos 22-10-2026: «AGENTES (x/y)» y «CONSEJEROS (x/y)» en la franja «Trabajando ahora» + rótulos de reloj enteros en móvil.
import vm from "node:vm";
function cargaTrabajando() {
  const ctx = { document: { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null, addEventListener() {} }, location: { search: "", href: "https://www.admira.live/consumos" }, navigator: { language: "es" }, localStorage: { getItem: () => null }, setInterval() {}, fetch: async () => ({ ok: false }), CustomEvent: class {}, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {}; ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8"), ctx);
  return ctx.ConsumosTrabajando;
}
test("Trabajando ahora: cabeceras «Agentes (x/y)» y «Consejeros (x/y)»: x = verde, y = total del grupo («con Carlos» no suma)", () => {
  const ct = cargaTrabajando();
  const ts = [
    { agente: "Neo", estado: "amarillo", grupo: "agentes" }, { agente: "Trinity", estado: "verde", grupo: "agentes" },
    { agente: "Morfeo", estado: "verde", grupo: "agentes" }, { agente: "Cypher", estado: "gris", grupo: "agentes" },
    { agente: "Smith", estado: "rojo", grupo: "agentes" },
    { agente: "Jobs", estado: "verde", grupo: "consejeros" }, { agente: "Disney", estado: "rojo", grupo: "consejeros" }, { agente: "Musk", estado: "gris", consejero: true },
  ];
  const g = ct.grupos(ts);
  assert.equal(ct.rotGrupo(g[0]), "Agentes (2/5)");
  assert.equal(ct.rotGrupo(g[1]), "Consejeros (1/3)");
  assert.equal(ct.rotGrupo(ct.grupos([])[1]), "Consejeros (0/0)");
  assert.equal(ct.xyGrupo({ trabajando: 4, total: 3 }), "3/3");
  const src = fs.readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(src, /<li class="tr-grupo"[^\n]*esc\(rotGrupo\(g\)\)/);
  assert.match(src, /<b class="tr-chiptit">' \+ esc\(rotGrupo\(g\)\)/);
  assert.match(html, /consumos-trabajando\.js\?v=20261022-nombre-maquina/);
});
test("Rótulos de reloj «(x/y)» enteros en móvil: sin partir el contador y desplegable a otra línea", () => {
  assert.match(html, /#vel-ag-titulo,#vel-proy-titulo\{white-space:nowrap\}/);
  assert.match(html, /@media \(max-width:560px\)\{\.vel-g h3\{display:flex;flex-wrap:wrap/);
  assert.doesNotMatch(html, /#vel-ag-titulo[^{]*\{[^}]*text-overflow:ellipsis/);
});

test("ventana 21:20 · el «·» del rótulo se oculta en móvil y «Agentes (x/y)» lleva su nota corta", () => {
  assert.match(html, /@media \(max-width:560px\)\{\.vel-g h3 \.vel-sep\{display:none\}\}/);
  assert.doesNotMatch(html, /<\/span> · <span class="vel-sel"/);
  assert.match(html, /id="vel-ag-nota"[^>]*>trabajando en los últimos 15 min \/ conectados a la flota<\/p>/);
});
