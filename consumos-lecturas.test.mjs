import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esCanonica, normalizarLectura, anadir, resumirSerie, resumirTodo, recomendar } from "./consumos-lecturas-lib.mjs";
import { onRequestGet, onRequestPost, KEY } from "./functions/api/consumos/lecturas.js";

const L = (ts, pct, extra = {}) => ({ id: ts + extra.agente, ts: new Date(ts).toISOString(), cuenta: "csilva@admira.com", agente: "Jobs", grupo: "leyendas", pct, fuente: "manual", autor: "Carlos", canonica: esCanonica(ts), ...extra });

test("canónicas: 00:00 y 12:00 de Madrid (±30 min), en verano e invierno", () => {
  assert.equal(esCanonica("2026-10-09T10:00:00Z"), true);  // 12:00 CEST
  assert.equal(esCanonica("2026-10-08T22:10:00Z"), true);  // 00:10 CEST
  assert.equal(esCanonica("2026-10-09T03:44:00Z"), false); // 05:44 CEST
  assert.equal(esCanonica("2026-12-01T11:00:00Z"), true);  // 12:00 CET
  assert.equal(esCanonica("2026-12-01T10:00:00Z"), false); // 11:00 CET
});

test("normalizar valida pct, autor, fuente y ts", () => {
  const ahora = Date.parse("2026-10-09T04:00:00Z");
  const ok = normalizarLectura({ cuenta: "csilva@admira.com", agente: "Jobs", grupo: "leyendas", pct: 1, autor: "Carlos", ts: "2026-10-09T05:44:00+02:00", tokens: 1200 }, ahora);
  assert.equal(ok.lectura.ts, "2026-10-09T03:44:00.000Z");
  assert.equal(ok.lectura.fuente, "manual");
  assert.deepEqual(ok.lectura.tokens, { total: 1200 });
  assert.equal(ok.lectura.canonica, false);
  assert.match(normalizarLectura({ cuenta: "x", pct: 101, autor: "a" }).error, /pct/);
  assert.match(normalizarLectura({ cuenta: "x", pct: 5 }).error, /autor/);
  assert.match(normalizarLectura({ cuenta: "x", pct: 5, autor: "a", fuente: "otro" }).error, /fuente/);
  assert.match(normalizarLectura({ cuenta: "x", pct: 5, autor: "a", ts: "2030-01-01T00:00:00Z" }, ahora).error, /futuro/);
  assert.match(normalizarLectura({ pct: 5, autor: "a" }).error, /cuenta/);
});

test("deltas, quema por 12 h y proyección al 100 %", () => {
  const s = resumirSerie([L("2026-10-09T10:00:00Z", 30), L("2026-10-08T22:00:00Z", 10), L("2026-10-09T22:00:00Z", 50)], { ahora: Date.parse("2026-10-09T23:00:00Z") });
  assert.deepEqual(s.deltas.map((d) => d.delta), [null, 20, 20]);
  assert.deepEqual(s.deltas.map((d) => d.quema12h), [null, 20, 20]);
  assert.equal(s.quema12h, 20);
  assert.equal(s.horasA100, 30);  // 50 % que faltan a 20 %/12 h
  assert.equal(s.llega100, "2026-10-11T04:00:00.000Z");
  assert.equal(s.vieja, false);
});

test("una sola lectura: sin ritmo ni proyección; una bajada es un reinicio del plan", () => {
  const una = resumirSerie([L("2026-10-09T03:44:00Z", 1)]);
  assert.equal(una.ritmoH, null);
  assert.equal(una.llega100, null);
  const r = resumirSerie([L("2026-10-08T10:00:00Z", 90), L("2026-10-08T22:00:00Z", 5), L("2026-10-09T10:00:00Z", 11)]);
  assert.equal(r.deltas[1].reinicio, true);
  assert.equal(r.deltas[1].quema12h, null);
  assert.equal(r.quema12h, 6); // solo cuenta desde el reinicio
});

test("recomendación: el de más margen fresco coge la carga", () => {
  const ahora = Date.parse("2026-10-09T23:00:00Z");
  const ls = [L("2026-10-09T10:00:00Z", 60), L("2026-10-09T22:00:00Z", 70),
    L("2026-10-09T10:00:00Z", 5, { agente: "Wozniak" }), L("2026-10-09T22:00:00Z", 15, { agente: "Wozniak" }),
    L("2026-10-01T10:00:00Z", 0, { agente: "Lucas" })];
  const series = resumirTodo(ls, { ahora });
  const rec = recomendar(series);
  assert.equal(rec.serie, "csilva@admira.com·Wozniak");
  assert.match(rec.texto, /Más margen: Wozniak/);
  assert.equal(recomendar([]), null);
});

test("anadir sustituye el mismo id y poda lo viejo", () => {
  const ahora = Date.parse("2026-10-09T12:00:00Z");
  const a = { id: "x", ts: "2026-10-09T10:00:00.000Z", pct: 1 };
  const viejo = { id: "v", ts: "2026-01-01T00:00:00.000Z", pct: 1 };
  const out = anadir([viejo, a], { ...a, pct: 2 }, { ahora });
  assert.deepEqual(out.map((l) => [l.id, l.pct]), [["x", 2]]);
});

function kvFalso() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, m }; }
const post = (body, headers = {}) => new Request("https://www.admira.live/api/consumos/lecturas", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("POST exige el token del Consejo y guarda; GET devuelve series", async () => {
  const env = { RECORTE_KV: kvFalso(), CONSUMOS_LECTURAS_TOKEN: "s3creto" };
  const cuerpo = { cuenta: "csilva@admira.com", grupo: "leyendas", agente: "Jobs", pct: 1, fuente: "manual", autor: "Carlos", ts: new Date(Date.now() - 3600e3).toISOString() };
  assert.equal((await onRequestPost({ request: post(cuerpo), env })).status, 401);
  assert.equal((await onRequestPost({ request: post(cuerpo, { "X-Council-Token": "malo" }), env })).status, 401);
  assert.equal((await onRequestPost({ request: post(cuerpo), env: { RECORTE_KV: kvFalso() } })).status, 503);
  assert.equal((await onRequestPost({ request: post({ ...cuerpo, pct: 150 }, { "X-Council-Token": "s3creto" }), env })).status, 400);
  const r = await onRequestPost({ request: post(cuerpo, { "X-Council-Token": "s3creto" }), env });
  assert.equal(r.status, 200);
  const r2 = await onRequestPost({ request: post({ ...cuerpo, agente: "Wozniak", pct: 3 }, { Authorization: "Bearer s3creto" }), env });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(env.RECORTE_KV.m.get(KEY)).lecturas.length, 2);
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/consumos/lecturas?dias=14"), env })).json();
  assert.equal(g.ok, true);
  assert.equal(g.series.length, 2);
  assert.equal(g.lecturas[0].pct, 1);
  assert.match(g.recomendacion.texto, /Jobs/);
});

test("la página /consumos pinta las lecturas desde la API", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./consumos-lecturas.js", import.meta.url), "utf8");
  assert.match(html, /id="lecturas-cuerpo"/);
  assert.match(html, /consumos-lecturas\.js/);
  assert.match(js, /\/api\/consumos\/lecturas/);
  assert.match(js, /X-Council-Token/);
});
