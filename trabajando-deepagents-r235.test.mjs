// r235 (Carlos, 21-11 22:15): «Trabajando Ahora tiene que empezar por los DeepAgents y si estan abiertos como en deepagents
// que aparezcan en verde ahora mismo Oraculo y Morfeo estan abiertos y aparecen en gris».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function carga() {
  const ctx = { document: { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null, addEventListener() {} }, location: { search: "", href: "https://www.admira.live/consumos" }, navigator: { language: "es" }, localStorage: { getItem: () => null }, setInterval() {}, fetch: async () => ({ ok: false }), CustomEvent: class {}, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {}; ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(readFileSync(new URL("./assets/deepagents-estado.js", import.meta.url), "utf8"), ctx);
  return ctx;
}
const app = (maq, a) => ({ tipo: "app", maquina: maq, app: a, enUso: false, fuente: "pulso" });
const TS = [
  { agente: "Merovingio", estado: "rojo", grupo: "agentes", superficies: [] },
  { agente: "Neo", estado: "verde", grupo: "agentes", maquina: "MacStudio", superficies: [app("MacStudio", "Claude")] },
  { agente: "Trinity", estado: "amarillo", grupo: "agentes", maquina: "MacStudio", conCarlosEn: "MacStudio", superficies: [app("MacStudio", "Codex")] },
  { agente: "Morfeo", estado: "rojo", grupo: "agentes", maquina: "MacMini", haceS: 43000, superficies: [app("MacMini", "Claude")] },
  { agente: "Niobe", estado: "gris", grupo: "agentes", superficies: [] },
  { agente: "Oráculo", estado: "gris", grupo: "agentes", maquina: "MacMini", superficies: [{ tipo: "cli", maquina: "MacMini", sesion: "oraculo", fuente: "pulso" }, app("MacMini", "Codex")] },
  { agente: "Jobs", estado: "gris", grupo: "consejeros", superficies: [] },
];

test("deepagents primero (Trinity, Neo, Oráculo, Morfeo) y abiertos en verde; «con Carlos» sigue amarillo", () => {
  const ctx = carga();
  const out = JSON.parse(JSON.stringify(ctx.ConsumosTrabajando.conDeepAgents(TS)));
  assert.deepEqual(out.map((t) => t.agente), ["Trinity", "Neo", "Oráculo", "Morfeo", "Merovingio", "Niobe", "Jobs"]);
  assert.deepEqual(out.slice(0, 4).map((t) => t.estado), ["amarillo", "verde", "verde", "verde"]);
  assert.match(out[3].abiertoDA, /abierto en MacMini/);
  assert.equal(out[4].estado, "rojo");
  assert.equal(TS[3].estado, "rojo", "no muta los datos originales (relojes)");
  const g = JSON.parse(JSON.stringify(ctx.ConsumosTrabajando.grupos(out)));
  assert.deepEqual({ ...g[0].n }, { trabajando: 3, abiertos: 2, conCarlos: 1, parados: 2, total: 6 });
});

test("chips: deepagents abiertos dicen «abierto · 250k/h» (sin «hace» ni «en espera») y van primero", () => {
  const ctx = carga();
  const html = ctx.ConsumosTrabajando.chipsDe(ctx.ConsumosTrabajando.conDeepAgents(TS).filter((t) => t.grupo === "agentes"));
  const orden = [...html.matchAll(/<\/i>([^<]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(orden, ["Trinity", "Neo", "Oráculo", "Morfeo", "Merovingio", "Niobe"]);
  const morfeo = html.slice(html.indexOf("</i>Morfeo"), html.indexOf("</i>Merovingio"));
  assert.match(morfeo, /abierto · 250k\/h/);
  assert.doesNotMatch(morfeo, /hace|en espera/);
});

test("/deepagents: abierto = punto verde; rojo solo cerrado", () => {
  const D = carga().DeepAgentsEstado;
  const r = JSON.parse(JSON.stringify(D.resumen(TS)));
  assert.deepEqual(r.map((a) => [a.visible, a.abierto.estado, a.actividad.luz]), [["Trinity", "verde", "verde"], ["Neo", "verde", "verde"], ["Oráculo", "verde", "verde"], ["Morfeo", "verde", "verde"]]);
  assert.equal(r[3].actividad.porAbierto, true);
});
