import test from "node:test";
import assert from "node:assert/strict";
import { colocarPorAppGrokBot, CUENTA_GROKBOT } from "./flota-trabajando-lib.mjs";
import { normalizarPulso, aplicarPulso, appsGrokBot } from "./consumos-pulso-lib.mjs";

const fichas = () => [
  { agente: "Smith", estado: "verde", motivo: "tokens", maquina: "MacMini", conCarlosEn: null },
  { agente: "Jobs", via: "Smith", estado: "verde", motivo: "activo vía Smith (tokens)", maquina: "MacMini", conCarlosEn: null },
  { agente: "Wozniak", via: "Smith", estado: "verde", motivo: "activo vía Smith (tokens)", maquina: "MacMini", conCarlosEn: null },
  { agente: "Musk", via: "Merovingio", estado: "amarillo", motivo: "activo vía Merovingio", maquina: "MacBookPro16", conCarlosEn: "MBP16" },
  { agente: "Huang", via: "Merovingio", estado: "verde", motivo: "activo vía Merovingio", maquina: "MacBookPro16", conCarlosEn: null },
];
const apps = [
  { maquina: "MacBookProNegro14", cuenta: "csilva@admira.com", alFrente: true, reposoS: 20, haceS: 30 },
  { maquina: "MacBookAir16plata", cuenta: "csilvasantin@gmail.com", alFrente: false, reposoS: 900, haceS: 40 },
];

test("r14: Jobs y Wozniak en el Mac de su app Grok Bot (MBP14) y con Carlos si está al frente", () => {
  const out = colocarPorAppGrokBot(fichas(), apps);
  const j = out.find((t) => t.agente === "Jobs"), w = out.find((t) => t.agente === "Wozniak");
  for (const t of [j, w]) { assert.equal(t.maquina, "MacBookProNegro14"); assert.equal(t.conCarlosEn, "MBP14"); assert.match(t.motivo, /app Grok Bot al frente en MBP14/); }
  assert.equal(j.estado, "amarillo"); // r15: «con Carlos» manda sobre verde, como en estadoTrabajo
  assert.equal(out.find((t) => t.agente === "Smith").maquina, "MacMini"); // Smith no se mueve
});

test("r14: Musk y Huang en el MBA16 (app abierta, no al frente → sin «con Carlos» copiado de Merovingio)", () => {
  const out = colocarPorAppGrokBot(fichas(), apps);
  for (const n of ["Musk", "Huang"]) { const t = out.find((x) => x.agente === n); assert.equal(t.maquina, "MacBookAir16plata"); assert.equal(t.conCarlosEn, null); assert.match(t.motivo, /app Grok Bot abierta en MBA16/); }
  assert.equal(out.find((t) => t.agente === "Musk").estado, "verde");
});

test("r14: sin app de su cuenta, se queda como estaba", () => {
  const out = colocarPorAppGrokBot(fichas(), [apps[1]]);
  assert.equal(out.find((t) => t.agente === "Jobs").maquina, "MacMini");
  assert.deepEqual(Object.keys(CUENTA_GROKBOT).sort(), ["Huang", "Jobs", "Musk", "Wozniak"]);
});

test("r14: el pulso acepta grokbotApp (también sin agentes) y lo guarda con ts; appsGrokBot solo frescas", () => {
  const n = normalizarPulso({ maquina: "MacBookProNegro14", agentes: [], grokbotApp: { abierta: true, firmada: true, cuenta: "CSILVA@admira.com", alFrente: true, reposoS: 12, version: "0.68.1", token: "x" } });
  assert.equal(n.ok, true);
  assert.deepEqual(n.pulso.grokbotApp, { abierta: true, firmada: true, cuenta: "csilva@admira.com", alFrente: true, reposoS: 12, version: "0.68.1" });
  assert.equal(normalizarPulso({ maquina: "X", agentes: [] }).ok, false);
  const r = aplicarPulso(null, n.pulso, 1_000_000);
  assert.equal(r.doc.grokbotApp.ts, 1_000_000);
  assert.equal(appsGrokBot([r.doc], 1_000_000 + 60_000)[0].maquina, "MacBookProNegro14");
  assert.equal(appsGrokBot([r.doc], 1_000_000 + 10 * 60_000).length, 0);
  assert.equal(normalizarPulso({ maquina: "X", agentes: [], grokbotApp: { abierta: true, cuenta: "no es un mail" } }).pulso.grokbotApp.cuenta, null);
});

test("r14: latido propio desde «GrokBot» (la nube) → manda la app; desde un Mac real → manda el latido", () => {
  const out = colocarPorAppGrokBot([
    { agente: "Jobs", estado: "verde", motivo: "latido «trabajando»", maquina: "GrokBot", conCarlosEn: null },
    { agente: "Wozniak", estado: "verde", motivo: "latido", maquina: "MacMini", conCarlosEn: null },
  ], apps);
  assert.equal(out[0].maquina, "MacBookProNegro14");
  assert.equal(out[0].conCarlosEn, "MBP14");
  assert.equal(out[1].maquina, "MacMini");
});
