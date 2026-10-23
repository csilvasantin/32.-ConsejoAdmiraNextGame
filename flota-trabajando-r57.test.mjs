// r57 (Carlos, 23-10-2026 08:21): tokens por agente. El CSV de Cursor no atribuye; los consejeros autodeclaran.
import test from "node:test";
import assert from "node:assert/strict";
import { autoreportesDeHoy, aplicarAutoreportes, soloVerdeReal, aplicarRojo, porqueColor } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-10-23T06:30:00Z") / 1000); // 08:30 Madrid
const parte = (persona, last, total, extra = {}) => ({ owner: persona + "GrokBot", last_at: last * 1000, dia: "2026-10-23", datos: { persona, origen: "mcp consumo_reportar", total, causa: "", ...extra } });

test("r57: autoreportes de hoy; ESTIMACIÓN, otros orígenes y días anteriores no cuentan", () => {
  const m = autoreportesDeHoy([
    parte("Jobs", T - 300, 120000),
    parte("Musk", T - 200, 90000, { causa: "ESTIMACIÓN (reparto)" }),
    parte("Morfeo", T - 100, 5, { origen: ".claude" }),
    parte("Huang", T - 30 * 3600, 5000),
  ], T);
  assert.deepEqual([...m.keys()], ["Jobs"]);
  assert.equal(m.get("Jobs").total, 120000);
});

test("r57: Jobs con tokens propios autodeclarados hace 5 min → verde; Musk solo con app compartida → no verde", () => {
  const ts = [
    { agente: "Jobs", estado: "rojo", consejero: true },
    { agente: "Musk", estado: "verde", fuente: "app_grokbot", consejero: true, actividad: { ts: T - 600, fuente: "encargo aceptado" } },
  ];
  soloVerdeReal(ts, T);
  aplicarAutoreportes(ts, autoreportesDeHoy([parte("Jobs", T - 300, 120000)], T), T);
  aplicarRojo(ts, T);
  const e = Object.fromEntries(ts.map((t) => [t.agente, t.estado]));
  assert.deepEqual(e, { Jobs: "verde", Musk: "rojo" });
  assert.match(porqueColor(ts.find((t) => t.agente === "Jobs"), T), /^último token hace 5 min/);
});

test("r57: autodeclarado de hace 2 h → rojo (activo hoy), no verde", () => {
  const ts = [{ agente: "Wozniak", estado: "gris", consejero: true }];
  aplicarAutoreportes(ts, autoreportesDeHoy([parte("Wozniak", T - 7200, 1000)], T), T);
  aplicarRojo(ts, T);
  assert.equal(ts[0].estado, "rojo");
});
