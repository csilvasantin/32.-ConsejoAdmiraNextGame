import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agente, esCanonica, normalizarLectura, anadir, resumirSerie, resumirTodo, recomendar, semaforo, cupoDiario, bloques12h, proyectar, repartir, resumirCuentas, recomendarCuentas, CUENTAS } from "./consumos-lecturas-lib.mjs";
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
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/consumos/lecturas?dias=14"), env, fetchImpl: async () => new Response(JSON.stringify({ notificaciones: [{ kind: "consumo", last_at_ms: Date.now() - 3600e3, datos: { persona: "Jobs", total: 3000 } }, { kind: "consumo", last_at_ms: Date.now() - 3600e3, datos: { persona: "Disney", total: 1000 } }, { kind: "bloqueo", datos: {} }] })) })).json();
  assert.equal(g.ok, true);
  assert.equal(g.series.length, 2);
  assert.equal(g.lecturas[0].pct, 1);
  assert.match(g.recomendacion.texto, /Jobs/);
  const ley = g.cuentas.find((c) => c.id === "leyendas");
  assert.equal(ley.pct, 3);
  assert.equal(ley.reparto.estado, "ok");
  assert.deepEqual(ley.reparto.filas.map((f) => [f.consejero, f.pct]), [["Jobs", 2.25], ["Wozniak", 0], ["Lucas", 0], ["Walt", 0.75]]);
  assert.equal(g.cuentas.find((c) => c.id === "coetaneos").semaforo, "sin");
  assert.match(g.recomendacionCuentas, /Mover encargos pesados a leyendas: les sobra 97 %/);
});

test("la página /consumos pinta las lecturas desde la API", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./consumos-lecturas.js", import.meta.url), "utf8");
  assert.match(html, /id="lecturas-cuerpo"/);
  assert.match(html, /consumos-lecturas\.js/);
  assert.match(js, /\/api\/consumos\/lecturas/);
  assert.match(js, /X-Council-Token/);
});

test("semáforo: verde <60, ámbar 60-85, rojo >85 o si se agota antes del reset", () => {
  assert.equal(semaforo(59), "verde");
  assert.equal(semaforo(60), "ambar");
  assert.equal(semaforo(85), "ambar");
  assert.equal(semaforo(85.5), "rojo");
  assert.equal(semaforo(10, true), "rojo");
  assert.equal(semaforo(null), "sin");
});

test("cupo diario = (100 − pct) / días al reset, sin pasar del margen", () => {
  const ahora = Date.parse("2026-10-09T04:00:00Z");
  assert.equal(cupoDiario(30, "2026-10-16T04:00:00Z", ahora), 10);
  assert.equal(cupoDiario(73, "2026-10-09T16:00:00Z", ahora), 27); // medio día: el cupo es el margen
  assert.equal(cupoDiario(30, "2026-10-08T00:00:00Z", ahora), null);
  assert.equal(cupoDiario(30, null, ahora), null);
});

test("bloques de 12 h entre canónicas, con reset", () => {
  const b = bloques12h([L("2026-10-08T22:00:00Z", 10), L("2026-10-09T03:44:00Z", 12), L("2026-10-09T10:00:00Z", 25), L("2026-10-09T22:00:00Z", 4)]);
  assert.deepEqual(b.map((x) => [x.gasto, x.reinicio, x.horas]), [[15, false, 12], [4, true, 12]]);
});

test("proyección: con una lectura y reset semanal usa la media de la semana; avisa si se agota antes", () => {
  const ahora = Date.parse("2026-10-09T04:00:00Z");
  const s = resumirSerie([L("2026-10-09T03:58:00Z", 27, { reset: "2026-10-09T18:31:00.000Z" })], { ahora });
  const p = proyectar(s, ahora);
  assert.equal(p.base, "semana");
  assert.equal(p.agotaAntes, false);
  const s2 = resumirSerie([L("2026-10-08T10:00:00Z", 40, { reset: "2026-10-12T10:00:00.000Z" }), L("2026-10-08T22:00:00Z", 70, { reset: "2026-10-12T10:00:00.000Z" })], { ahora });
  const p2 = proyectar(s2, ahora);
  assert.equal(p2.llega100, "2026-10-09T10:00:00.000Z");
  assert.equal(p2.agotaAntes, true);
  assert.equal(p2.texto, 'se agota vie 9 oct 12:00');
});

test("reparto: sin partes en la semana queda pendiente, sin inventar cifras", () => {
  const ley = CUENTAS[0];
  assert.equal(repartir(ley, null, 27, { desde: 0 }).estado, "pendiente de partes de tokens");
  const viejo = [{ kind: "consumo", last_at_ms: 1, datos: { persona: "Jobs", total: 5000 } }];
  const r = repartir(ley, viejo, 27, { desde: 1000, hasta: 2000 });
  assert.equal(r.estado, "pendiente de partes de tokens");
  assert.ok(r.filas.every((f) => f.pct === null));
});

test("tarjetas: manda el límite más alto; coetáneos sin lectura; recomendación y ranking", () => {
  const ahora = Date.parse("2026-10-09T04:00:00Z");
  const ls = [L("2026-10-09T03:44:00Z", 1), L("2026-10-09T03:58:00Z", 27, { agente: "SuperGrok Heavy semanal", reset: "2026-10-09T18:31:00.000Z" }), L("2026-10-09T03:58:00Z", 0, { agente: "Grok Bot semanal", reset: "2026-10-15T20:58:00.000Z" })];
  const c = resumirCuentas(ls, [], { ahora });
  assert.equal(c[0].pct, 27);
  assert.equal(c[0].manda, "SuperGrok Heavy semanal");
  assert.equal(c[0].semaforo, "verde");
  assert.equal(c[0].reset, "2026-10-09T18:31:00.000Z");
  assert.equal(c[1].pct, null);
  assert.match(c[1].pista, /1 % el 4 de octubre/);
  const r = recomendarCuentas(c);
  assert.match(r.texto, /les sobra 73 %/);
  assert.match(r.texto, /Sin lectura: Coetáneos, Neo · Claude Code, Trinity · Codex, Morfeo · Claude, Oráculo · Codex, Cursor Pro/);
  assert.deepEqual(r.ranking.map((x) => x.id), ["leyendas", "coetaneos", "neo-claude", "trinity-codex", "morfeo-claude", "oraculo-codex", "cursor"]);
});

test("Neo · Claude Code: tarjeta propia, manda el semanal, la sesión de 5 h va de secundario y entra en el ranking", () => {
  const ahora = Date.parse("2026-10-09T07:46:00Z");
  const N = (ts, pct, agente, reset) => L(ts, pct, { cuenta: "Neo · Claude Max", grupo: "neo-claude", agente, reset });
  const ls = [L("2026-10-09T03:58:00Z", 27, { agente: "SuperGrok Heavy semanal", reset: "2026-10-15T18:31:00.000Z" }),
    N("2026-10-09T07:46:00Z", 9, "Claude Code semanal", "2026-10-11T13:00:00.000Z"),
    N("2026-10-09T07:46:00Z", 0, "Claude Code sesión 5 h", "2026-10-09T12:10:00.000Z")];
  const cs = resumirCuentas(ls, [], { ahora });
  assert.deepEqual(cs.map((c) => c.id), ["leyendas", "coetaneos", "neo-claude", "trinity-codex", "morfeo-claude", "oraculo-codex", "cursor"]);
  const neo = cs.find((c) => c.id === "neo-claude");
  assert.equal(neo.nombre, "Neo · Claude Code");
  assert.equal(neo.plan, "Claude Max 20x (csilva@admira.com)");
  assert.equal(neo.email, "csilva@admira.com");
  assert.equal(neo.proveedor, "Claude");
  assert.equal(neo.pct, 9);
  assert.equal(neo.margen, 91);
  assert.equal(neo.manda, "Claude Code semanal");
  assert.equal(neo.reset, "2026-10-11T13:00:00.000Z"); // domingo 15:00 de Madrid
  assert.equal(neo.cupoDia, Math.round((91 / ((Date.parse("2026-10-11T13:00:00Z") - ahora) / 864e5)) * 100) / 100);
  assert.equal(neo.proyeccion.base, "semana");
  assert.equal(neo.semaforo, "verde");
  assert.deepEqual(neo.secundario, { agente: "Claude Code sesión 5 h", pct: 0, reset: "2026-10-09T12:10:00.000Z", ts: "2026-10-09T07:46:00.000Z" });
  // la sesión de 5 h no manda aunque suba por encima del semanal
  const alta = resumirCuentas([...ls, N("2026-10-09T07:50:00Z", 80, "Claude Code sesión 5 h", "2026-10-09T12:10:00.000Z")], [], { ahora: ahora + 5 * 60e3 }).find((c) => c.id === "neo-claude");
  assert.equal(alta.manda, "Claude Code semanal");
  assert.equal(alta.pct, 9);
  assert.equal(alta.secundario.pct, 80);
  // los demás no cambian
  assert.equal(cs[0].manda, "SuperGrok Heavy semanal");
  assert.equal(cs[0].proveedor, undefined);
  const r = recomendarCuentas(cs);
  assert.equal(r.ranking[0].id, "neo-claude");
  assert.equal(r.ranking[0].proveedor, "Claude");
  assert.match(r.ranking[0].nombre, /Claude Max de Neo, csilva@admira.com, no Grok/);
  assert.match(r.texto, /Mover encargos pesados a Neo · Claude Code \(Claude Max de Neo, csilva@admira\.com, no Grok\): les sobra 91 %/);
  assert.equal(r.ranking[1].nombre, "Leyendas");
});

test("la página /consumos pinta la tarjeta de Neo (Claude) con su medidor secundario", () => {
  const js = readFileSync(new URL("./consumos-lecturas.js", import.meta.url), "utf8");
  assert.match(js, /c\.secundario/);
  assert.match(js, /c\.proveedor/);
  assert.ok(CUENTAS.some((c) => c.id === "neo-claude" && c.cuenta === "Neo · Claude Max" && c.principal === "Claude Code semanal"));
});

test("Trinity · Codex: cuarta tarjeta, manda «Codex semanal», entra en el ranking como ChatGPT", () => {
  const ahora = Date.parse("2026-10-09T07:50:00Z");
  const ls = [L("2026-10-09T07:46:00Z", 9, { cuenta: "Neo · Claude Max", grupo: "neo-claude", agente: "Claude Code semanal", reset: "2026-10-11T13:00:00.000Z" }),
    L("2026-10-09T07:48:00Z", 23, { cuenta: "Trinity · ChatGPT Pro", grupo: "trinity-codex", agente: "Codex semanal", reset: "2026-10-14T06:51:00.000Z" })];
  const cs = resumirCuentas(ls, [], { ahora });
  const tri = cs.find((c) => c.id === "trinity-codex");
  assert.equal(tri.nombre, "Trinity · Codex");
  assert.equal(tri.plan, "ChatGPT Pro 200");
  assert.equal(tri.proveedor, "ChatGPT");
  assert.equal(tri.pct, 23);
  assert.equal(tri.manda, "Codex semanal");
  assert.equal(tri.reset, "2026-10-14T06:51:00.000Z");
  assert.equal(tri.cupoDia, Math.round((77 / ((Date.parse("2026-10-14T06:51:00Z") - ahora) / 864e5)) * 100) / 100);
  assert.equal(tri.secundario, null);
  assert.equal(tri.semaforo, "verde");
  const r = recomendarCuentas(cs);
  assert.deepEqual(r.ranking.slice(0, 2).map((x) => [x.id, x.proveedor]), [["neo-claude", "Claude"], ["trinity-codex", "ChatGPT"]]);
  assert.equal(r.ranking[1].nombre, "Trinity · Codex (ChatGPT Pro de Trinity, no Grok)");
});

test("añadir una cuenta es una línea: agente() rellena etiqueta y medidores", () => {
  const c = agente("x", "Morfeo · Gemini", "Morfeo · Google AI Ultra", "Google AI Ultra", "Gemini", "Gemini semanal");
  assert.deepEqual([c.etiqueta, c.principal, c.secundario, c.consejeros], ["Morfeo · Gemini (Google AI Ultra de Morfeo, no Grok)", "Gemini semanal", null, []]);
});

test("Mac mini: «Morfeo · Claude» sin lectura y «Oráculo · Codex» al 40 % (gana la lectura más reciente)", () => {
  const ahora = Date.parse("2026-10-09T08:30:00Z");
  const O = (ts, reset) => L(ts, 40, { cuenta: "Oráculo · Codex (csilvasantin@gmail.com)", grupo: "oraculo-codex", agente: "Codex semanal", reset });
  const ls = [L("2026-10-09T07:46:00Z", 9, { cuenta: "Neo · Claude Max", grupo: "neo-claude", agente: "Claude Code semanal", reset: "2026-10-11T13:00:00.000Z" }),
    O("2026-10-09T08:23:53Z", "2026-10-14T03:46:15.000Z"), O("2026-10-09T08:24:00Z", "2026-10-14T04:26:15.000Z")];
  const cs = resumirCuentas(ls, [], { ahora });
  const mor = cs.find((c) => c.id === "morfeo-claude");
  assert.equal(mor.nombre, "Morfeo · Claude");
  assert.equal(mor.cuenta, "Morfeo · Claude (csilvasantin@gmail.com)");
  assert.equal(mor.plan, "Claude (csilvasantin@gmail.com)");
  assert.equal(mor.proveedor, "Claude");
  assert.equal(mor.pct, null); assert.equal(mor.margen, null); assert.equal(mor.semaforo, "sin");
  assert.deepEqual(mor.secundario, { agente: "Claude Code sesión 5 h", pct: null, reset: null, ts: null });
  assert.equal(mor.etiqueta, "Morfeo · Claude (Claude de Morfeo, csilvasantin@gmail.com, no Grok)");
  const ora = cs.find((c) => c.id === "oraculo-codex");
  assert.equal(ora.nombre, "Oráculo · Codex");
  assert.equal(ora.plan, "ChatGPT Pro (csilvasantin@gmail.com)");
  assert.equal(ora.proveedor, "ChatGPT");
  assert.equal(ora.pct, 40); assert.equal(ora.margen, 60); assert.equal(ora.manda, "Codex semanal");
  assert.equal(ora.reset, "2026-10-14T04:26:15.000Z");
  assert.equal(ora.email, "csilvasantin@gmail.com");
  const r = recomendarCuentas(cs);
  assert.deepEqual(r.ranking.slice(0, 2).map((x) => x.id), ["neo-claude", "oraculo-codex"]);
  assert.equal(r.ranking.find((x) => x.id === "morfeo-claude").margen, null);
  assert.match(r.texto, /Sin lectura: .*Morfeo · Claude/);
  const CL = CUENTAS.find((c) => c.id === "morfeo-claude");
  assert.deepEqual([CL.principal, CL.secundario], ["Claude Code semanal", "Claude Code sesión 5 h"]);
});

test("r27: lectura SOLO DE TOKENS (Cursor Pro, sin %) — válida, fuera de las series de %, en cuenta.tokens", async () => {
  const L = await import("./consumos-lecturas-lib.mjs");
  assert.ok(L.normalizarLectura({ cuenta: "x", autor: "y" }).error, "sin pct ni tokens → error");
  const { lectura } = L.normalizarLectura({ cuenta: "cursor-pro", agente: "Tokens Grok Bot (Consejo)", tokens: { total: 7630456, entrada: 7000000, salida: 630456, cache: 1 }, fuente: "auto", autor: "GrokBotBox", ts: "2026-10-09T00:00:00+02:00" }, Date.parse("2026-10-09T15:00:00+02:00"));
  assert.equal(lectura.pct, null);
  assert.equal(lectura.canonica, true);
  const otra = L.normalizarLectura({ cuenta: "csilva@admira.com", agente: "SuperGrok Heavy semanal", pct: 10, fuente: "auto", autor: "Jobs", ts: "2026-10-09T00:00:00+02:00" }, Date.parse("2026-10-09T15:00:00+02:00")).lectura;
  assert.equal(L.resumirTodo([lectura, otra]).length, 1, "las de tokens no hacen serie de %");
  const cs = L.resumirCuentas([lectura, otra], [], { ahora: Date.parse("2026-10-09T15:00:00+02:00") });
  const c = cs.find((x) => x.id === "cursor");
  assert.equal(c.pct, null);
  assert.equal(c.tokens.ultima.total, 7630456);
  assert.ok(c.nota && /Jobs/.test(c.nota));
  assert.equal(cs.find((x) => x.id === "leyendas").pct, 10);
});
