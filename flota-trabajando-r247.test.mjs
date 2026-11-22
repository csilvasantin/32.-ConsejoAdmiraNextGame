// r247 (Carlos, 22-11-2026 10:26): «los numeros también tienen que mostrar colores … gris … 0 … amarillo si esta
// trabajando en la misión o en verde si ya se ha acabado con exito sino será rojo» · «los numeros a la derecha del nombre».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { misionesDe, misionesLuzDe, hechasHoyDe, MISION_MAL } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-22T09:30:00Z") / 1000); // 10:30 Madrid
const it = (id, status, o = {}) => ({ id, status, target_persona: "Neo", text: "Haz la misión " + id + ".", ts: T - 3600, ...o });
const luz = (items) => misionesLuzDe(misionesDe(items, "Neo"), T);

test("r247: gris sin nada hoy; verde si la última de hoy está hecha", () => {
  assert.equal(luz([]).luz, "gris");
  assert.equal(luz([it(1, "done", { done_at: T - 86400 * 2 })]).luz, "gris", "hecha otro día");
  const v = luz([it(1, "done", { done_at: T - 600 }), it(2, "done", { done_at: T - 300 })]);
  assert.equal(v.luz, "verde"); assert.equal(v.texto, "2 hechas");
});

test("r247: amarillo si hay una misión en curso (ack / in_progress) de las últimas 24 h; gana a todo", () => {
  const r = luz([it(1, "done", { done_at: T - 600 }), it(2, "in_progress", { ack_at: T - 120 }), it(3, "failed", { done_at: T - 60 })]);
  assert.equal(r.luz, "amarillo"); assert.equal(r.texto, "1 hecha · 1 en curso · 1 fallida");
  assert.equal(luz([it(4, "ack", { ack_at: T - 30 })]).luz, "amarillo");
});

test("r247: abiertas de hace > 24 h no dan amarillo (nadie las cerró): «sin cerrar desde dd-mm»", () => {
  const r = luz([it(7621, "in_progress", { ts: T - 3 * 86400, ack_at: T - 3 * 86400 }), it(2, "done", { done_at: T - 600 })]);
  assert.equal(r.luz, "verde"); assert.match(r.texto, /^1 hecha · 1 sin cerrar desde 19-11$/); assert.deepEqual(r.sinCerrarIds, ["#7621"]);
});

test("r247: rojo si la última cerrada hoy no acabó bien (failed / blocked); cancelled no cuenta; chats fuera", () => {
  assert.equal(luz([it(1, "done", { done_at: T - 600 }), it(2, "blocked", { ack_at: T - 300 })]).luz, "rojo");
  assert.equal(luz([it(1, "failed", { done_at: T - 600 }), it(2, "done", { done_at: T - 300 })]).luz, "verde", "manda la última");
  const c = luz([it(1, "done", { done_at: T - 600 }), it(2, "cancelled", { done_at: T - 60 }), it(3, "in_progress", { text: "[chat-coetaneos] Steve Jobs → Neo: hola", ack_at: T - 10 })]);
  assert.equal(c.luz, "verde"); assert.equal(c.texto, "1 hecha · 1 cancelada");
  assert.ok(MISION_MAL.test("failed") && MISION_MAL.test("blocked") && !MISION_MAL.test("cancelled"));
  // N sigue contando las hechas de hoy
  assert.equal(hechasHoyDe(misionesDe([it(1, "done", { done_at: T - 600 }), it(2, "failed", { done_at: T - 60 })], "Neo"), T).length, 1);
});

function cargaFront() {
  const ctx = { document: { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null, addEventListener() {} }, location: { search: "", href: "https://www.admira.live/consumos" }, navigator: { language: "es" }, localStorage: { getItem: () => null }, setInterval() {}, fetch: async () => ({ ok: false }), CustomEvent: class {}, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {}; ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8"), ctx);
  return ctx.ConsumosTrabajando;
}

test("r247: cliente — «(N)» a la derecha del nombre con color y desglose; API vieja: verde si N > 0, gris si 0", () => {
  const ct = cargaFront();
  const h = ct.nHoy({ hechasHoy: [{ id: "#1", ts: T - 600 }], misionesLuz: "amarillo", misionesDesglose: { texto: "1 hecha · 1 en curso", enCursoIds: ["#2"] } });
  assert.match(h, /class="tr-nhoy tr-nhoy-amarillo" title="1 hecha · 1 en curso\n/); assert.match(h, /En curso: #2/); assert.match(h, />\(1\)<\/span>$/);
  assert.match(ct.nHoy({ hechasHoy: [] }), /tr-nhoy tr-nhoy-gris tr-nhoy0/);
  assert.match(ct.nHoy({ hechasHoy: [{ id: "#1", ts: T }] }), /tr-nhoy-verde/);
  assert.match(ct.nHoy({ hechasHoy: [], misionesLuz: "rojo" }), /tr-nhoy-rojo/);
  const chip = ct.chipsDe([{ agente: "Neo", hechasHoy: [], misionesLuz: "amarillo", superficies: [] }]);
  assert.ok(chip.indexOf("</i>Neo") < chip.indexOf("tr-nhoy-amarillo"), "a la derecha del nombre");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /\.tr-nhoy\.tr-nhoy-rojo\{color:#ff6b6b\}/);
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /amarillo = misión en curso ahora/); assert.match(js, /red = today\\'s last one did not end well/);
  assert.match(readFileSync(new URL("./assets/barra-agentes.js", import.meta.url), "utf8"), /ar-nh ' \+ ml/);
  assert.match(readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8"), /"ag-nhoy ag-nhoy-" \+ ml/);
  const api = readFileSync(new URL("./flota-trabajando-lib.mjs", import.meta.url), "utf8");
  assert.match(api, /t\.misionesLuz = ml \? ml\.luz : null; t\.misionesDesglose = ml;/);
});
