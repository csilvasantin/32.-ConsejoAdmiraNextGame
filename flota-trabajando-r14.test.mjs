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
  assert.deepEqual(n.pulso.grokbotApp, { abierta: true, firmada: true, cuenta: "csilva@admira.com", cuentas: [], forzada: false, alFrente: true, reposoS: 12, version: "0.68.1" });
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

test("r16: la app abierta en varios Macs → una ficha con todos, «con Carlos» en el de delante, sin tokens propios", async () => {
  const { tarjetas } = await import("./flota-trabajando-lib.mjs");
  const varias = [
    { maquina: "MacBookAir16plata", cuenta: "csilva@admira.com", alFrente: false, reposoS: 900, haceS: 20 },
    { maquina: "MacBookProNegro14", cuenta: "csilva@admira.com", alFrente: true, reposoS: 15, haceS: 30 },
    { maquina: "MacBookProNegro14", cuenta: "csilva@admira.com", alFrente: true, reposoS: 15, haceS: 31 },
  ];
  const out = colocarPorAppGrokBot(fichas(), varias);
  const j = out.find((t) => t.agente === "Jobs");
  assert.deepEqual(j.maquinas, ["MacBookProNegro14", "MacBookAir16plata"]);
  assert.equal(j.conCarlosEn, "MBP14");
  assert.equal(j.estado, "amarillo");
  assert.match(j.motivo, /al frente en MBP14 · abierta también en MBA16/);
  assert.equal(out.filter((t) => t.agente === "Jobs").length, 1);
  // sin nadie delante: todas en el motivo, sin «con Carlos»
  const out2 = colocarPorAppGrokBot(fichas(), varias.map((a) => ({ ...a, alFrente: false })));
  const j2 = out2.find((t) => t.agente === "Jobs");
  assert.equal(j2.conCarlosEn, null);
  assert.match(j2.motivo, /abierta en MBP14 \+ MBA16/);
  // de punta a punta: maqCorta con todas y los tokens solo en Smith
  const ahoraS = 1_800_000_000;
  const t = tarjetas({ presencia: [{ persona: "Smith", machine: "MacMini", updated: ahoraS - 30, status: "trabajando", state: "working" }], velocidad: { ok: true, porAgente: [{ agente: "Smith", maquina: "MacMini", motor: "grok", tokHora: 5000, tokHoy: 9000, ultimoEvento: new Date((ahoraS - 20) * 1000).toISOString() }], grokbotApps: varias }, ahoraS, carga: new Map() });
  const jt = t.find((x) => x.agente === "Jobs");
  assert.equal(jt.maqCorta, "MBP14 + MBA16");
  assert.equal(jt.tokHora, null);
  assert.equal(t.find((x) => x.agente === "Smith").tokHora, 5000);
  assert.equal(t.filter((x) => x.agente === "Jobs").length, 1);
});

test("r16: caras de Matrix para los agentes; los consejeros conservan la suya", async () => {
  const { retratoDe, AVATARES_MATRIX } = await import("./flota-trabajando-lib.mjs");
  const { conRetratos } = await import("./functions/api/flota/trabajando.js");
  const { existsSync } = await import("node:fs");
  for (const n of AVATARES_MATRIX) assert.ok(existsSync(new URL("./avatars/" + n + ".jpg", import.meta.url)), n);
  assert.equal(retratoDe("Oráculo").img, "/avatars/oraculo.jpg");
  assert.equal(retratoDe("Niobe").img, "/avatars/niobe.jpg");
  assert.equal(retratoDe("WhiteRabbit").img, "/avatars/whiterabbit.jpg");
  assert.equal(retratoDe("Persephone").img, "/avatars/persefone.jpg");
  assert.equal(retratoDe("Jobs").img, "/assets/council-leyendas.jpg");
  assert.equal(retratoDe("Merovingio").img, "/avatars/merovingio.jpg");
  const m = conRetratos({ filas: [{ persona: "Cypher" }, { persona: "Ratti" }], resumen: {} });
  assert.equal(m.filas[0].retrato.img, "/avatars/cypher.jpg");
  assert.equal(m.filas[1].retrato, undefined);
});
