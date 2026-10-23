// r54 (Carlos, 23-10-2026): el color sale del último token real (fuente más fresca), sin aflojar r53.
import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas, aplicarRojo, ultimoTokenS } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-10-23T05:30:00Z") / 1000);
const iso = (s) => new Date(s * 1000).toISOString();
const latMero = { persona: "Merovingio", machine: "MacBookAir", source: "heartbeat", runtime: "DeepAgents", model: "grok", status: "working", updated: T - 30 };
const app = (usoS, extra = {}) => ({ maquina: "MacMini", cuenta: "csilvasantin@gmail.com", alFrente: false, reposoS: 900, haceS: 20, usoS, fuente: "app", ...extra });
const card = (ts, n) => ts.find((x) => x.agente === n);
const carga = { get: () => ({ in_progress: 2, abiertos: 2, blocked: 0 }) };

test("r54: Merovingio sin lectura guardada fresca pero con su cuenta GrokBot gastando hace 27 s → verde", () => {
  const ts = tarjetas({ presencia: [latMero], velocidad: { porAgente: [], grokbotApps: [app(27)] }, ahoraS: T, carga });
  aplicarRojo(ts, T);
  assert.equal(card(ts, "Merovingio").estado, "verde");
});

test("r54: lectura retrasada (Cursor, tokUltimaHora 0) pero evento de tokens reciente → verde", () => {
  const p = { agente: "Grok Bot (Consejo)", motor: "cursor", conRetraso: true, tokHora: null, tokHoy: 9e5, tokUltimaHora: 0, ultimoEvento: iso(T - 600) };
  const ts = tarjetas({ presencia: [latMero], velocidad: { porAgente: [p] }, ahoraS: T, carga });
  assert.equal(card(ts, "Merovingio").estado, "verde");
});

test("r54: sin tokens recientes (último uso hace 2 h) → no verde aunque latido trabajando y encargos", () => {
  const ts = tarjetas({ presencia: [latMero], velocidad: { porAgente: [], grokbotApps: [app(7200)] }, ahoraS: T, carga });
  aplicarRojo(ts, T);
  assert.notEqual(card(ts, "Merovingio").estado, "verde");
});

test("r54: la cuenta de OTRO pool (csilva@admira.com) no enciende a Merovingio", () => {
  const ts = tarjetas({ presencia: [latMero], velocidad: { porAgente: [], grokbotApps: [app(10, { cuenta: "csilva@admira.com" })] }, ahoraS: T, carga });
  assert.notEqual(card(ts, "Merovingio").estado, "verde");
});

test("r54: Neo con último evento de hace 7 h → no verde (rojo si activo hoy)", () => {
  const p = { agente: "Neo", motor: "claude", tokHora: 0, tokHoy: 31860, tokUltimaHora: 0, maquina: "MacStudio", ultimoEvento: iso(T - 7 * 3600), ultimoPulso: iso(T) };
  const ts = tarjetas({ presencia: [], velocidad: { porAgente: [p] }, ahoraS: T, carga });
  aplicarRojo(ts, T);
  assert.notEqual(card(ts, "Neo").estado, "verde");
});

test("r54: ultimoTokenS toma la fuente más fresca", () => {
  const p = { tokHoy: 5, ultimoEvento: iso(T - 900) };
  assert.equal(ultimoTokenS("Merovingio", p, [app(100)], T), T - 120);
  assert.equal(ultimoTokenS("Neo", p, [app(100)], T), T - 900);
  assert.equal(ultimoTokenS("Neo", null, [], T), null);
});
