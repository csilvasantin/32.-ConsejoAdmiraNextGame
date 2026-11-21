// r244 (Carlos, 21-11-2026 23:31): «al lado del nombre … entre parentesis (x) … las misiones que ha cumplido hoy» · «y los agentes igual».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { misionesDe, hechasHoyDe } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-21T22:31:00Z") / 1000); // 23:31 Madrid
const ayer2330 = Math.floor(Date.parse("2026-11-20T22:30:00Z") / 1000); // 23:30 Madrid del 20 → no es hoy
const hoy0005 = Math.floor(Date.parse("2026-11-20T23:05:00Z") / 1000); // 00:05 Madrid del 21 → hoy
const items = [
  { id: 7647, status: "done", target_persona: "Neo", target_machine: "macbookpro16", done_at: T - 3000, text: "Actualiza FleetControl en este MacBook Pro 16." },
  { id: 7645, status: "done", target_persona: "Neo", target_machine: "macstudio", done_at: T - 5000, text: "Actualiza FleetControl en este MacStudio." },
  { id: 7645, status: "done", target_persona: "Neo", target_machine: "macstudio", done_at: T - 5000, text: "Actualiza FleetControl en este MacStudio." },
  { id: 7644, status: "done", target_persona: "Neo", done_at: hoy0005, text: "Primera de hoy." },
  { id: 7601, status: "done", target_persona: "Neo", done_at: ayer2330, text: "De ayer." },
  { id: 7650, status: "cancelled", target_persona: "Neo", done_at: T - 100, text: "Cancelada." },
  { id: 7649, status: "done", target_persona: "Neo", done_at: T - 60, text: "[chat-coetaneos] Steve Jobs → Neo\nx" },
  { id: 7000, status: "done", target_persona: "Trinity", done_at: T - 10, text: "De otra persona." },
];

test("r244: solo done cerradas hoy (Madrid), en todas sus máquinas; sin cancelled, chats, duplicados ni ayer", () => {
  const h = hechasHoyDe(misionesDe(items, "Neo"), T);
  assert.deepEqual(h.map((m) => m.id), ["#7644", "#7645", "#7647"]);
  assert.deepEqual(hechasHoyDe(misionesDe([], "Neo"), T), []);
  assert.deepEqual(hechasHoyDe(null, T), []);
});

test("r244: cliente — «(N)» junto al nombre con tooltip; «(0)» atenuado; sin dato, nada", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const win = { addEventListener() {}, dispatchEvent() {} };
  const doc = { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null };
  new Function("window", "document", "location", "localStorage", "URL", js.replace(/\(typeof window !== 'undefined' \? window : globalThis\)\s*;?\s*$/, "(window);"))(win, doc, { href: "https://x/consumos" }, { getItem: () => null }, URL);
  const { nHoy, chipsDe } = win.ConsumosTrabajando;
  const h = nHoy({ hechasHoy: [{ id: "#7645", ts: T - 5000, maquina: "macstudio", titulo: "Actualiza FleetControl" }, { id: "#7647", ts: T - 3000, maquina: "MBP16", titulo: "X" }] });
  assert.match(h, /class="tr-nhoy" title="Misiones cumplidas hoy \(2\):\n#7645 · \d\d:\d\d · MacStudio · Actualiza FleetControl\n#7647/);
  assert.match(h, />\(2\)<\/span>$/);
  assert.match(nHoy({ hechasHoy: [] }), /tr-nhoy tr-nhoy0".*>\(0\)</);
  assert.equal(nHoy({ hechasHoy: null }), "");
  assert.equal(nHoy({}), "");
  assert.equal((js.match(/esc\(vis\(t\.agente\)\) \+ nHoy\(t\)/g) || []).length, 5);
  assert.match(readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8"), /ag-nhoy/);
});
