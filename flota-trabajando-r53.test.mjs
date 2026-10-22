// r53 (Carlos, 22-10-2026): AGENTES sin margen: verde solo con tokens reales (tokHora / tokUltimaHora > 0) o app en uso.
import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas, aplicarRojo } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-10-22T20:00:00Z") / 1000);
const carga = { get: () => ({ in_progress: 3, abiertos: 3, blocked: 0 }) };
const lat = (persona) => ({ persona, machine: "MacMini", source: "process_snapshot", host: "cli", runtime: "Codex", model: "gpt-6.1-sol", updated: T, verified: true });
const ag = (agente, extra = {}) => ({ agente, motor: "codex", tokHora: 0, tokHoy: 0, tokUltimaHora: 0, maquina: "MacMini", ...extra });
const card = (ts, n) => ts.find((x) => x.agente === n);

test("r53: Oráculo con latido de 0 s y encargos pero 0 tokens → NO verde", () => {
  const ts = tarjetas({ presencia: [lat("Oráculo")], velocidad: { porAgente: [ag("Oráculo", { tokHoy: 5e5, ultimoEvento: new Date((T - 3 * 3600) * 1000).toISOString() })] }, ahoraS: T, carga });
  aplicarRojo(ts, T);
  const o = card(ts, "Oráculo");
  assert.notEqual(o.estado, "verde");
  assert.match(o.motivo, /sin tokens|sin actividad/);
});

test("r53: sin medición y sin app en uso → no verde", () => {
  const ts = tarjetas({ presencia: [lat("Oráculo")], velocidad: null, ahoraS: T, carga });
  assert.notEqual(card(ts, "Oráculo").estado, "verde");
});

test("r53: con tokUltimaHora > 0 o tokHora > 0 → verde", () => {
  const ts = tarjetas({ presencia: [lat("Oráculo"), lat("Trinity")], velocidad: { porAgente: [ag("Oráculo", { tokUltimaHora: 1200, tokHoy: 1200 }), ag("Trinity", { tokHora: 800, tokHoy: 800 })] }, ahoraS: T, carga });
  assert.equal(card(ts, "Oráculo").estado, "verde");
  assert.equal(card(ts, "Trinity").estado, "verde");
});

test("r53: app de escritorio en uso → verde aunque 0 tokens", () => {
  const velocidad = { porAgente: [ag("Oráculo")], superficies: [{ tipo: "app", app: "Codex", maquina: "MacMini", agente: "Oráculo", enUso: true }] };
  const ts = tarjetas({ presencia: [lat("Oráculo")], velocidad, ahoraS: T, carga });
  assert.notEqual(card(ts, "Oráculo").estado, "gris");
});
