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

test("deepagents primero (Trinity, Neo, Oráculo, Morfeo); r246: abierto ya NO cambia el estado (es conectado)", () => {
  const ctx = carga();
  const out = JSON.parse(JSON.stringify(ctx.ConsumosTrabajando.conDeepAgents(TS)));
  assert.deepEqual(out.map((t) => t.agente), ["Trinity", "Neo", "Oráculo", "Morfeo", "Merovingio", "Niobe", "Jobs"]);
  assert.deepEqual(out.slice(0, 4).map((t) => t.estado), ["amarillo", "verde", "gris", "rojo"]);
  assert.equal(out[3].abiertoDA, undefined);
  const g = JSON.parse(JSON.stringify(ctx.ConsumosTrabajando.grupos(out)));
  // sin campos r246: conectado = superficie fresca; punto = estado (amarillo → sin dato)
  assert.deepEqual({ ...g[0].n }, { conectados: 4, trabajando: 1, parados: 4, sinDato: 1, conCarlos: 1, total: 6 });
});

test("chips r246: borde = conectado («conectado · 250k/h»), punto = actividad; deepagents primero", () => {
  const ctx = carga();
  const html = ctx.ConsumosTrabajando.chipsDe(ctx.ConsumosTrabajando.conDeepAgents(TS).filter((t) => t.grupo === "agentes"));
  const orden = [...html.matchAll(/<\/i>([^<]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(orden, ["Trinity", "Neo", "Oráculo", "Morfeo", "Merovingio", "Niobe"]);
  const morfeo = html.slice(html.lastIndexOf("<span class=\"tr-chipa", html.indexOf("</i>Morfeo")), html.indexOf("</i>Merovingio"));
  assert.match(morfeo, /tr-chipa tr-con tr-luz-rojo/);
  assert.match(morfeo, /conectado · 250k\/h · parado/);
  assert.doesNotMatch(morfeo, /hace|en espera|abierto/);
});

test("/deepagents r246: abierto = borde; sin actividad demostrada el punto es amarillo (no se sabe) o rojo (cerrado)", () => {
  const D = carga().DeepAgentsEstado;
  const r = JSON.parse(JSON.stringify(D.resumen(TS)));
  assert.deepEqual(r.map((a) => [a.visible, a.abierto.estado, a.actividad.luz]), [["Trinity", "verde", "amarillo"], ["Neo", "verde", "verde"], ["Oráculo", "verde", "amarillo"], ["Morfeo", "verde", "amarillo"]]);
  assert.equal(r[3].actividad.porAbierto, undefined);
  // con la API nueva manda actividadLuz
  const ts2 = TS.map((t) => t.agente === "Neo" ? { ...t, actividadLuz: "rojo", actividadPorque: "conectado sin tokens recientes ni CPU" } : t);
  const neo = JSON.parse(JSON.stringify(D.resumen(ts2)))[1];
  assert.deepEqual([neo.abierto.estado, neo.actividad.luz, neo.actividad.porque], ["verde", "rojo", "conectado sin tokens recientes ni CPU"]);
});
