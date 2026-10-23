// r56 (Carlos, 23-10-2026 08:06): verde solo tokens reales o app atribuible; latido de consejero → solo rojo.
import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas, aplicarLatidosConsejero, soloVerdeReal, aplicarRojo, porqueColor } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-10-23T06:10:00Z") / 1000);
const iso = (s) => new Date(s * 1000).toISOString();

test("r56: latido del consejero «trabajando» sin tokens ni app → ROJO, nunca verde", () => {
  const ts = [{ agente: "Wozniak", estado: "gris", consejero: true }];
  aplicarLatidosConsejero(ts, { Wozniak: { modo: "trabajando", mision: "m", at: T - 30, desde: T - 30, hasta: T + 600 } }, T);
  assert.equal(ts[0].estado, "verde");
  soloVerdeReal(ts, T); aplicarRojo(ts, T);
  assert.equal(ts[0].estado, "rojo");
  assert.match(porqueColor(ts[0], T), /latido del consejero «trabajando» a las 08:09/);
});

test("r56/r57: verde solo con tokens reales; la app GrokBot compartida ya no (Musk)", () => {
  const ts = [
    { agente: "Neo", estado: "verde", ultimoToken: iso(T - 120) },
    { agente: "Musk", estado: "verde", fuente: "app_grokbot", consejero: true },
    { agente: "Jobs", estado: "verde", fuente: "consejero_latido", consejero: true },
  ];
  soloVerdeReal(ts, T);
  assert.deepEqual(ts.map((t) => t.estado), ["verde", "gris", "gris"]);
});

test("r56: Merovingio gris no dice «app abierta en uso»; la nota «no atribuible» solo en Merovingio", () => {
  const app = { maquina: "MacMini", cuenta: "csilvasantin@gmail.com", alFrente: true, reposoS: 10, haceS: 5, usoS: 3, fuente: "app" };
  const ts = tarjetas({ presencia: [], velocidad: { porAgente: [], grokbotApps: [app] }, ahoraS: T });
  const m = ts.find((t) => t.agente === "Merovingio");
  m.estado = "gris";
  const txt = porqueColor(m, T);
  assert.doesNotMatch(txt, /app abierta en uso/);
  assert.match(txt, /no atribuible/);
  for (const n of ["Musk", "Huang"]) { const t = ts.find((x) => x.agente === n); if (t) assert.doesNotMatch(porqueColor(t, T), /no atribuible/, n); }
});

test("r56: inglés de /consumos — restos de la tarjeta Accounts y del velocímetro", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const ctx = { globalThis: {} }; ctx.globalThis.AdmiraIdiomaExtra = [];
  vm.runInNewContext(readFileSync(new URL("./admira-idioma-consumos.js", import.meta.url), "utf8"), ctx);
  const [dicc, reglas] = ctx.globalThis.AdmiraIdiomaExtra[0];
  const tr = (s) => { if (dicc[s]) return dicc[s]; for (const [re, r] of reglas) { const m = s.match(re); if (m) return typeof r === "function" ? r(m, () => null) : s.replace(re, r); } return null; };
  assert.equal(tr("Codex sesión 5 h: 0 % · reset 11/10 01:29"), "Codex 5 h session: 0 % · reset 11/10 01:29");
  assert.equal(tr("12/10 12:00: 447 k tokens · export CSV de Cursor · 4 eventos · datos hasta 12/10 11:42 (Madrid) · bloque aún incompleto (retraso de Cursor)"), "12/10 12:00: 447 k tokens · Cursor CSV export · 4 events · data until 12/10 11:42 (Madrid) · block still incomplete (Cursor delay)");
  assert.equal(tr("Claude es de pago y WhiteRabbit no tiene suscripción de pago"), "Claude is paid and WhiteRabbit has no paid subscription");
  assert.equal(tr("Cuadrante de carga"), "Load grid");
  assert.equal(tr("partes Yokup (última hora)"), "Yokup reports (last hour)");
});
