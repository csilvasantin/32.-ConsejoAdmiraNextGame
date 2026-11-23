// r254 (Carlos, 22-11-2026 19:20): «he cambiado de leyendas a actuales y sigues diciendome leyendas».
// La cuenta ACTIVA de la app Grok Bot (ranura account-slot) manda sobre las horas de las ranuras por cuenta.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { appsGrokBot, normalizarGrokbotApp } from "./consumos-pulso-lib.mjs";

const AHORA = Date.parse("2026-11-22T18:25:00Z");
const ADMIRA = "csilva@admira.com", GMAIL = "csilvasantin@gmail.com";
const doc = (g) => ({ maquina: "MacStudio", grokbotApp: { abierta: true, ts: AHORA - 30000, ...g } });

test("la cuenta activa manda aunque la otra tenga una ranura más reciente (escritura en segundo plano)", () => {
  const g = normalizarGrokbotApp({ abierta: true, activa: GMAIL, cuenta: GMAIL, cuentas: [{ cuenta: ADMIRA, haceS: 5 }, { cuenta: GMAIL, haceS: 60 }] });
  assert.equal(g.activa, GMAIL);
  const out = appsGrokBot([doc(g)], AHORA);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].cuenta, out[0].fuente, out[0].usoS], [GMAIL, "activa", 60]);
});

test("sin cuenta activa (Mac con el pulso viejo) se sigue como antes", () => {
  const g = normalizarGrokbotApp({ abierta: true, cuentas: [{ cuenta: ADMIRA, haceS: 5 }, { cuenta: GMAIL, haceS: 60 }] });
  assert.equal(g.activa, null);
  assert.equal(appsGrokBot([doc(g)], AHORA).length, 2);
});

test("activa que no es un correo se descarta", () => {
  assert.equal(normalizarGrokbotApp({ abierta: true, activa: "grok|user_x" }).activa, null);
});

test("el reloj de Proyectos pinta «MacStudio · Actuales» con Musk, Jensen y csilvasantin@gmail.com", () => {
  const ctx = { console, document: undefined };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/consumos-marchas-grokbot.js", import.meta.url), "utf8"), ctx);
  const M = ctx.MarchasGrokBot;
  const ps = M.pilares({ ok: true, appsGrokBot: [{ maquina: "MacStudio", cuenta: GMAIL, fuente: "activa" }], tarjetas: [], grokbotPulso: [{ maquina: "MacStudio", fresco: true, haceS: 9 }] });
  assert.equal(M.etiqueta(ps[0]), "MacStudio · Actuales");
  const t = M.titulo(ps[0]);
  assert.match(t, /Actuales · Musk, Jensen · csilvasantin@gmail\.com/);
  assert.match(t, /cuenta activa/);
  assert.doesNotMatch(t, /Leyendas/);
});
