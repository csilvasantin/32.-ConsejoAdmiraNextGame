// r52 (Carlos, 22-10-2026): consejero trabajando de verdad → VERDE gana a «con Carlos»; los agentes no cambian.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoTrabajo, aplicarLatidosConsejero } from "./flota-trabajando-lib.mjs";
const T = 1_800_000_000;

test("r52: estadoTrabajo con verdeGana: tokens + con Carlos → verde (con la nota de Carlos)", () => {
  const st = estadoTrabajo({ tokHora: 5, conCarlos: "con Carlos (MBP16)", ahoraS: T, verdeGana: true });
  assert.equal(st.estado, "verde");
  assert.equal(st.conCarlos, "con Carlos (MBP16)");
});

test("r52: verdeGana sin señal verde → sigue amarillo", () => {
  assert.equal(estadoTrabajo({ tokHora: 0, conCarlos: true, ahoraS: T, verdeGana: true }).estado, "amarillo");
});

test("r52: agentes (sin verdeGana) mantienen amarillo por delante", () => {
  assert.equal(estadoTrabajo({ tokHora: 5, conCarlos: true, ahoraS: T }).estado, "amarillo");
});

test("r52: latido «trabajando» del consejero gana a amarillo", () => {
  const ts = [{ agente: "Wozniak", consejero: true, estado: "amarillo", motivo: "con Carlos" }];
  aplicarLatidosConsejero(ts, { Wozniak: { modo: "trabajando", hasta: T + 300, at: T - 10, mision: "m" } }, T);
  assert.equal(ts[0].estado, "verde");
  assert.equal(ts[0].conCarlosAntes, "con Carlos");
});
