// Cuentakilómetros HOY → AYER → SEMANA → MES (21-10-2026): periodos en días de Madrid, libro diario + partes Yokup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diasPeriodo, anotarDia, yokupPorDia, periodosTokens, madrid, KEY_DIAS } from "./consumos-velocidad-lib.mjs";
import { onRequestGet } from "./functions/api/consumos/velocidad.js";

const AHORA = Date.parse("2026-10-21T22:30:00+02:00"); // miércoles

test("diasPeriodo: semana = lunes … hoy, mes = día 1 … hoy (Madrid, también cerca de medianoche UTC)", () => {
  assert.deepEqual(diasPeriodo(AHORA), { hoy: "2026-10-21", ayer: "2026-10-20", lunes: "2026-10-19", dia1: "2026-10-01" });
  // 23:30 UTC del domingo 25 = 01:30 del lunes 26 en Madrid (CET tras el cambio de hora)
  assert.deepEqual(diasPeriodo(Date.parse("2026-10-25T23:30:00Z")), { hoy: "2026-10-26", ayer: "2026-10-25", lunes: "2026-10-26", dia1: "2026-10-01" });
  assert.equal(diasPeriodo(Date.parse("2026-11-01T10:00:00+01:00")).ayer, "2026-10-31");
});

test("anotarDia: guarda el máximo del día y poda >40 días", () => {
  let l = anotarDia({ "2026-08-01": { tok: 5, ts: 1 } }, "2026-10-21", 100, 1);
  l = anotarDia(l, "2026-10-21", 50, 2);
  assert.deepEqual(l, { "2026-10-21": { tok: 100, ts: 1 } });
});

test("yokupPorDia: sin caché, máximo por owner y suma de owners", () => {
  const d = { partes: [
    { owner: "A", machine: "M", dia: "2026-10-20", datos: { total: 1000, cache: 900 } },
    { owner: "A", machine: "M", dia: "2026-10-20", datos: { total: 500, cache: 450 } },
    { owner: "B", machine: "M", dia: "2026-10-20", datos: { total: 70 } },
  ] };
  assert.deepEqual(yokupPorDia(d), { "2026-10-20": 170 });
});

test("periodosTokens: hoy en vivo, libro antes que Yokup, días sin parte = 0, sin fuente = desconocido", () => {
  const p = periodosTokens({ tokHoy: 10, libro: { "2026-10-20": { tok: 7 } }, yokup: { "2026-10-20": 999, "2026-10-19": 3, "2026-10-02": 4 }, yokupDesde: "2026-09-21", ahora: AHORA });
  assert.equal(p.hoy.tok, 10);
  assert.equal(p.ayer.tok, 7);
  assert.equal(p.ayer.dias[0].fuente, "libro diario");
  assert.equal(p.semana.tok, 20);
  assert.equal(p.mes.tok, 24);
  assert.deepEqual(p.mes.cobertura, { conDatos: 21, total: 21 });
  const s = periodosTokens({ tokHoy: 10, libro: null, yokup: null, ahora: AHORA });
  assert.equal(s.ayer.tok, null);
  assert.equal(s.semana.tok, 10);
  assert.deepEqual(s.semana.cobertura, { conDatos: 1, total: 3 });
});

test("endpoint: periodos en la respuesta y libro diario en KV", async () => {
  const m = new Map(), kv = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const hoy = madrid(Date.now()).dia;
  const fuente = { ok: true, partes: [{ owner: "OraculoMacMini", machine: "MacMini", dia: hoy, datos: { persona: "Oraculo", runtime: "Codex", total: 26e6, cache: 20e6 } }], serie: {} };
  const d = await (await onRequestGet({ request: new Request("https://www.admira.live/api/consumos/velocidad"), env: { RECORTE_KV: kv }, fetchImpl: async () => new Response(JSON.stringify(fuente)) })).json();
  assert.equal(d.periodos.zona, "Europe/Madrid");
  assert.equal(d.periodos.hoy.tok, d.tokHoy);
  assert.equal(JSON.parse(m.get(KEY_DIAS))[hoy].tok, d.tokHoy);
  for (const k of ["ayer", "semana", "mes"]) assert.ok(k in d.periodos, k);
});

test("UI: el cuentakilómetros de la flota es un botón (role, tabindex, Enter/Espacio) y rota HOY→AYER→SEMANA→MES", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /PERIODOS = \['hoy', 'ayer', 'semana', 'mes'\]/);
  assert.match(js, /setAttribute\('role', 'button'\)/);
  assert.match(js, /e\.key === 'Enter' \|\| e\.key === ' '/);
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /\.odo-periodo\{[^}]*cursor:pointer/);
});
