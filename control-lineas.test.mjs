// Histórico de líneas de código (GrokBotBox, 09-10-2026): control-lineas-lib.mjs + /api/control/lineas + assets/control-lineas.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fechaSlot, normalizarSnapshot, entradaIndice, anadirIndice, resumir, restarDias, claveSnap, KEY_INDICE } from "./control-lineas-lib.mjs";
import { onRequestGet, onRequestPost } from "./functions/api/control/lineas.js";

const P = (id, lineas, unicas, extra = {}) => ({ id, repo: "csilvasantin/" + id, commit: "abc1234", ficheros: 10, lineas, lineas_unicas: unicas, ...extra });
const foto = (ts, ps) => normalizarSnapshot({ ts, proyectos: ps }, Date.parse("2026-12-31T00:00:00Z")).snap;

test("fechaSlot: antes de las 12:00 de Madrid → 00; después → 12; cambio de día en Madrid, no en UTC", () => {
  assert.deepEqual(fechaSlot(Date.parse("2026-10-09T11:05:00+02:00")), { fecha: "2026-10-09", slot: "00" });
  assert.deepEqual(fechaSlot(Date.parse("2026-10-09T12:01:00+02:00")), { fecha: "2026-10-09", slot: "12" });
  assert.deepEqual(fechaSlot(Date.parse("2026-10-09T22:30:00Z")), { fecha: "2026-10-10", slot: "00" });
  assert.deepEqual(fechaSlot(Date.parse("2026-12-01T23:30:00Z")), { fecha: "2026-12-02", slot: "00" }); // invierno UTC+1
});

test("normalizarSnapshot: total = Σ sin duplicar si todos traen lineas_unicas; si no, suma bruta", () => {
  const { snap } = normalizarSnapshot({ ts: "2026-10-09T11:00:00+02:00", proyectos: [P("a", 100, 100), P("b", 50, 0)] });
  assert.equal(snap.total, 100); assert.equal(snap.total_bruto, 150); assert.equal(snap.sin_duplicar, true);
  assert.equal(snap.fecha, "2026-10-09"); assert.equal(snap.slot, "00");
  const { snap: s2 } = normalizarSnapshot({ ts: "2026-10-09T13:00:00+02:00", proyectos: [P("a", 100), P("b", 50)] }, Date.parse("2026-10-10T00:00:00Z"));
  assert.equal(s2.total, 150); assert.equal(s2.sin_duplicar, false); assert.equal(s2.slot, "12");
});

test("normalizarSnapshot: rechaza basura, futuro, ids repetidos y fechas que no casan con ts", () => {
  const ok = { ts: "2026-10-09T11:00:00+02:00", proyectos: [P("a", 1, 1)] };
  assert.ok(normalizarSnapshot({ ...ok, ts: "ayer" }).error);
  assert.ok(normalizarSnapshot({ ...ok, ts: "2099-01-01T00:00:00Z" }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [] }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [P("a", 1), P("a", 2)] }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [P("a", -1)] }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [P("a", 5, 9)] }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [{ ...P("a", 1), repo: "no-es-repo" }] }).error);
  assert.ok(normalizarSnapshot({ ...ok, proyectos: [{ ...P("a", 1), commit: "zz<script>" }] }).error);
  assert.ok(normalizarSnapshot({ ...ok, fecha: "2026-10-01" }).error);
  assert.ok(normalizarSnapshot({ ...ok, slot: "06" }).error);
  assert.equal(normalizarSnapshot({ ...ok, slot: "12" }, Date.parse("2026-10-10T00:00:00Z")).snap.slot, "12");
});

test("anadirIndice: misma fecha+ranura sustituye; orden cronológico; tope", () => {
  let idx = [];
  idx = anadirIndice(idx, entradaIndice(foto("2026-10-09T12:05:00+02:00", [P("a", 10, 10)])));
  idx = anadirIndice(idx, entradaIndice(foto("2026-10-09T00:05:00+02:00", [P("a", 5, 5)])));
  idx = anadirIndice(idx, entradaIndice(foto("2026-10-09T12:30:00+02:00", [P("a", 12, 12)])));
  assert.deepEqual(idx.map((e) => e.slot + ":" + e.total), ["00:5", "12:12"]);
  assert.equal(anadirIndice(idx, entradaIndice(foto("2026-10-10T00:05:00+02:00", [P("a", 1, 1)])), 2).length, 2);
});

test("resumir: una sola foto → sin ayer ni Δ, nota «el histórico empieza hoy» (no se inventan días)", () => {
  const r = resumir([entradaIndice(foto("2026-10-09T11:00:00+02:00", [P("a", 100, 100), P("b", 300, 250)]))]);
  assert.equal(r.fotos, 1); assert.equal(r.nota, "el histórico empieza hoy");
  assert.equal(r.total.hoy, 350); assert.equal(r.total.ayer, null); assert.equal(r.total.deltaDia, null);
  assert.deepEqual(r.proyectos.map((p) => p.id), ["b", "a"]);
  assert.equal(r.proyectos[0].ayer, null); assert.deepEqual(r.proyectos[0].serie, [300]);
});

test("resumir: Δ día con la última foto de ayer; Δ semana solo si hay foto de hace 7 días; huecos = null", () => {
  const idx = [
    ["2026-10-02T12:10:00+02:00", [P("a", 80, 80)]],
    ["2026-10-08T00:10:00+02:00", [P("a", 90, 90)]],
    ["2026-10-08T12:10:00+02:00", [P("a", 95, 95), P("n", 7, 7)]],
    ["2026-10-09T12:10:00+02:00", [P("a", 100, 100), P("n", 10, 10)]],
  ].reduce((acc, [ts, ps]) => anadirIndice(acc, entradaIndice(foto(ts, ps))), []);
  const r = resumir(idx), a = r.proyectos.find((p) => p.id === "a"), n = r.proyectos.find((p) => p.id === "n");
  assert.equal(a.ayer, 95); assert.equal(a.deltaDia, 5); assert.equal(a.deltaSemana, 20);
  assert.equal(n.deltaDia, 3); assert.equal(n.deltaSemana, null); assert.deepEqual(n.serie, [null, null, 7, 10]);
  assert.equal(r.total.deltaDia, 110 - 102); assert.equal(r.nota, null); assert.equal(r.dias, 3);
  assert.equal(restarDias("2026-03-01", 1), "2026-02-28");
});

function kvFake() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
const req = (method, body, headers = {}) => new Request("https://www.admira.live/api/control/lineas", { method, headers: { "content-type": "application/json", ...headers }, body: body == null ? undefined : JSON.stringify(body) });

test("API: POST sin token 401, sin secreto 503; con token guarda foto + índice; GET público lo resume", async () => {
  const kv = kvFake(), env = { RECORTE_KV: kv, CONSUMOS_LECTURAS_TOKEN: "s3creto" };
  const ts = new Date(Date.now() - 60000).toISOString();
  const cuerpo = { ts, proyectos: [P("a", 100, 100), P("b", 40, 30)] };
  assert.equal((await onRequestPost({ request: req("POST", cuerpo), env })).status, 401);
  assert.equal((await onRequestPost({ request: req("POST", cuerpo, { "X-Council-Token": "malo" }), env })).status, 401);
  assert.equal((await onRequestPost({ request: req("POST", cuerpo), env: { RECORTE_KV: kv } })).status, 503);
  const r = await onRequestPost({ request: req("POST", cuerpo, { "X-Council-Token": "s3creto" }), env });
  assert.equal(r.status, 200);
  const d = await r.json(); assert.equal(d.total, 130); assert.equal(d.fotos, 1);
  assert.ok(kv.m.has(claveSnap(d.fecha, d.slot))); assert.ok(kv.m.has(KEY_INDICE));
  const g = await (await onRequestGet({ request: req("GET"), env: { RECORTE_KV: kv } })).json();
  assert.equal(g.resumen.total.hoy, 130); assert.equal(g.resumen.nota, "el histórico empieza hoy");
  assert.ok(!JSON.stringify(g).includes("s3creto"));
  const f = await onRequestGet({ request: new Request(`https://x/api/control/lineas?foto=${d.fecha}:${d.slot}`), env: { RECORTE_KV: kv } });
  assert.equal((await f.json()).foto.proyectos.length, 2);
  assert.equal((await onRequestPost({ request: req("POST", { ts, proyectos: "x" }, { Authorization: "Bearer s3creto" }), env })).status, 400);
});

test("UI: assets/control-lineas.js — texto CLI bilingüe, rutaSerie con huecos, regex de /lineas · /lines · /demo", () => {
  const sb = { module: { exports: {} } }; sb.globalThis = sb;
  vm.runInNewContext(readFileSync(new URL("./assets/control-lineas.js", import.meta.url), "utf8"), sb);
  const L = sb.module.exports;
  assert.ok(L.RE.test("/lineas") && L.RE.test("/lines") && L.RE.test("/líneas") && !L.RE.test("/lineasx"));
  assert.ok(L.RE_DEMO.test("/demo lineas") && L.RE_DEMO.test("demo lines"));
  assert.equal(JSON.stringify(L.rutaSerie([1, null, 3, 5], 100, 10, 0, 5)), JSON.stringify([["0.0,8.0"], ["66.7,4.0", "100.0,0.0"]]));
  assert.equal(JSON.stringify(L.rutaSerie([7], 100, 10, 6, 8)), JSON.stringify([["50.0,5.0"]]));
  const res = { resumen: resumir([entradaIndice(foto("2026-10-09T11:00:00+02:00", [P("a", 12345, 12345)]))]) };
  const es = L.texto(res, false), en = L.texto(res, true);
  assert.match(es, /Σ AdmiraNeXT 12\.345 líneas/); assert.match(es, /el histórico empieza hoy/);
  assert.match(en, /12,345 lines/); assert.match(en, /history starts today/);
  assert.match(L.texto(null, false), /aún no hay/);
});

test("Cableado: /control carga el script, el clic en «N proyectos» lo abre y la consola intercepta /lineas", () => {
  const html = readFileSync(new URL("./control/index.html", import.meta.url), "utf8");
  assert.match(html, /<script defer src="\/assets\/control-lineas\.js\?v=/);
  assert.match(html, /id="hkProjCount" role="button"/);
  assert.match(html, /window\.ControlLineas\.cli\(cmd/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /assets\/control-lineas\.js/);
});
