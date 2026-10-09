// Velocímetro de tokens/hora (GrokBotBox, 09-10-2026): consumos-velocidad-lib.mjs + /api/consumos/velocidad.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { incremento, calcularVelocidad, velocidadEn, pico24h, podar, tocaGuardar, serieAInstantaneas, unir, escala, formatoTok, partesDeHoy, madrid } from "./consumos-velocidad-lib.mjs";
import { onRequestGet, KEY } from "./functions/api/consumos/velocidad.js";

const M = 60000, H = 60 * M;
const AHORA = Date.parse("2026-10-09T10:00:00+02:00");
const snap = (minAtras, totales) => ({ ts: AHORA - minAtras * M, totales });

test("incremento: sube → diferencia; baja → reinicio (cuenta el total nuevo); sin base → 0", () => {
  assert.equal(incremento(100, 250), 150);
  assert.equal(incremento(900, 40), 40);
  assert.equal(incremento(undefined, 500), 0);
  assert.equal(incremento(10, NaN), 0);
});

test("última hora medida: (total ahora − total hace 60 min) / horas, por agente y total", () => {
  const snaps = [snap(65, { A: 0, B: 0 }), snap(60, { A: 1e6, B: 0 }), snap(30, { A: 6e6, B: 2e6 }), snap(0, { A: 11e6, B: 4e6 })];
  const r = calcularVelocidad({ snaps, hoy: { A: 11e6, B: 4e6 }, ahora: AHORA });
  assert.equal(r.metodo, "ultima-hora");
  assert.equal(r.ventanaMin, 60);
  assert.equal(r.tokHora, 14e6);
  assert.deepEqual(r.porAgente.map((a) => [a.agente, a.tokHora, a.tokHoy]), [["A", 10e6, 11e6], ["B", 4e6, 4e6]]);
});

test("reinicio a medianoche: una bajada no da negativo, cuenta lo nuevo", () => {
  const t0 = Date.parse("2026-10-09T00:30:00+02:00");
  const snaps = [{ ts: t0 - 60 * M, totales: { A: 500e6 } }, { ts: t0 - 30 * M, totales: { A: 510e6 } }, { ts: t0, totales: { A: 3e6 } }];
  const v = velocidadEn(podar(snaps, t0), 2);
  assert.equal(v.ventanaMin, 60);
  assert.equal(v.tokHora, 13e6); // 10 M antes de las 00:00 + 3 M después
});

test("fallback: menos de 2 instantáneas → media de hoy (total / horas desde 00:00 Madrid), etiquetada como estimada", () => {
  const r = calcularVelocidad({ snaps: [snap(0, { A: 20e6 })], hoy: { A: 20e6 }, ahora: AHORA });
  assert.equal(r.metodo, "media-hoy");
  assert.match(r.etiqueta, /media de hoy/);
  assert.equal(r.tokHora, 2e6); // 20 M en 10 h
  assert.equal(r.ventanaMin, 600);
  assert.equal(r.pico24h, null);
});

test("fallback también si la ventana es demasiado corta o la última muestra está vieja", () => {
  const corta = calcularVelocidad({ snaps: [snap(5, { A: 0 }), snap(0, { A: 1e6 })], hoy: { A: 10e6 }, ahora: AHORA });
  assert.equal(corta.metodo, "media-hoy");
  const vieja = calcularVelocidad({ snaps: [snap(180, { A: 0 }), snap(120, { A: 5e6 })], hoy: { A: 10e6 }, ahora: AHORA });
  assert.equal(vieja.metodo, "media-hoy");
});

test("sin datos de hoy: 0 tok/h, nunca inventado", () => {
  const r = calcularVelocidad({ snaps: [], hoy: {}, ahora: AHORA });
  assert.equal(r.tokHora, 0);
  assert.deepEqual(r.porAgente, []);
});

test("pico 24 h y escala del dial: max(50 M, 1,5 × pico)", () => {
  const snaps = [snap(180, { A: 0 }), snap(120, { A: 30e6 }), snap(60, { A: 40e6 }), snap(0, { A: 45e6 })];
  assert.equal(pico24h(podar(snaps, AHORA), AHORA), 30e6);
  assert.equal(escala(10e6), 50e6);
  assert.equal(escala(40e6), 100e6);
  assert.equal(escala(222e6), 500e6);
  assert.equal(formatoTok(12.4e6), "12,4 M");
  assert.equal(formatoTok(12.4e6, true), "12.4 M");
});

test("podar (26 h), tocaGuardar (5 min) y unir arrastrando totales", () => {
  const s = podar([snap(27 * 60, { A: 1 }), snap(10, { A: 2 }), snap(10, { A: 2 })], AHORA);
  assert.equal(s.length, 1);
  assert.equal(tocaGuardar([snap(3, {})], AHORA), false);
  assert.equal(tocaGuardar([snap(6, {})], AHORA), true);
  const u = unir([snap(20, { A: 1, B: 5 })], [snap(10, { A: 3 })], AHORA);
  assert.deepEqual(u[1].totales, { A: 3, B: 5 });
});

test("serie de Yokup → instantáneas por cubos de 5 min y partes del día de Madrid", () => {
  const serie = { "MorfeoMacMini|MacMini": [{ ts: AHORA - 10 * M, dia: "2026-10-09", total: 1 }, { ts: AHORA - 4 * M, dia: "2026-10-09", total: 7 }], "?MacMini|MacMini": [{ ts: AHORA - 9 * M, total: 3 }] };
  const ins = serieAInstantaneas(serie, (k) => k.split("|")[0]);
  assert.ok(ins.every((x) => x.ts <= AHORA));
  assert.deepEqual(ins[ins.length - 1].totales, { MorfeoMacMini: 7, "?MacMini": 3 });
  const d = { partes: [
    { owner: "MorfeoMacMini", machine: "MacMini", dia: "2026-10-09", datos: { persona: "Morfeo", runtime: "Claude", total: 409526558 } },
    { owner: "?MacMini", machine: "MacMini", dia: "2026-10-09", datos: { persona: "?", equipo: "MacMini", runtime: "Claude", total: 65178663 } },
    { owner: "MorfeoMacMini", machine: "MacMini", dia: "2026-10-08", datos: { persona: "Morfeo", runtime: "Claude", total: 9 } },
  ] };
  const { hoy, nombres } = partesDeHoy(d, AHORA);
  assert.deepEqual(hoy, { "Morfeo · Claude": 409526558, "Anónimo · Claude (MacMini)": 65178663 });
  assert.equal(nombres["MorfeoMacMini|MacMini"], "Morfeo · Claude");
  assert.equal(madrid(AHORA).dia, "2026-10-09");
});

function kvMem() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const req = () => new Request("https://www.admira.live/api/consumos/velocidad");

test("endpoint: fuente caída → ok:false, sinDatos, sin números", async () => {
  const r = await onRequestGet({ request: req(), env: { RECORTE_KV: kvMem() }, fetchImpl: async () => { throw new Error("caída"); } });
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.equal(d.sinDatos, true);
  assert.equal(d.tokHora, null);
});

test("endpoint: guarda instantánea en KV (como mucho cada 5 min) y responde la forma pedida", async () => {
  const kv = kvMem();
  const hoyDia = madrid(Date.now()).dia;
  const fuente = { ok: true, partes: [{ owner: "OraculoMacMini", machine: "MacMini", dia: hoyDia, datos: { persona: "Oraculo", runtime: "Codex", total: 26.1e6 } }], serie: {} };
  const fetchImpl = async () => new Response(JSON.stringify(fuente), { status: 200 });
  const d1 = await (await onRequestGet({ request: req(), env: { RECORTE_KV: kv }, fetchImpl })).json();
  await onRequestGet({ request: req(), env: { RECORTE_KV: kv }, fetchImpl });
  assert.equal(JSON.parse(kv.m.get(KEY)).length, 1);
  assert.equal(d1.ok, true);
  assert.equal(d1.metodo, "media-hoy");
  for (const k of ["tokHora", "ventanaMin", "metodo", "porAgente", "pico24h", "generado"]) assert.ok(k in d1, k);
  assert.equal(d1.porAgente[0].agente, "Oraculo · Codex");
  assert.equal(d1.porAgente[0].tokHoy, 26.1e6);
});

test("/consumos sirve el velocímetro y sondea cada 10 s (tiempo real)", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /id="velocimetro"/);
  assert.match(html, /\/assets\/consumos-velocimetro\.js/);
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /\/api\/consumos\/velocidad/);
  assert.match(js, /POLL = 10000/);
  assert.match(js, /tiempo real/);
  assert.match(html, /id="vel-spark"/);
  assert.match(js, /sin datos/);
});

test("CLI /velocidad · /speed: texto bilingüe con tok/h y top 3; sin datos sin cifras", async () => {
  const vm = await import("node:vm");
  const sb = { module: { exports: {} } };
  sb.globalThis = sb;
  vm.runInNewContext(readFileSync(new URL("./assets/live-velocidad.js", import.meta.url), "utf8"), sb);
  const L = sb.module.exports;
  assert.ok(L.RE.test("/velocidad") && L.RE.test("/speed") && L.RE_DEMO.test("/demo velocidad") && L.RE_DEMO.test("/demo speed"));
  const d = { ok: true, tokHora: 12.4e6, metodo: "ultima-hora", ventanaMin: 60, pico24h: 30e6, porAgente: [{ agente: "Morfeo · Claude", tokHora: 9e6 }, { agente: "Oraculo · Codex", tokHora: 3e6 }, { agente: "B", tokHora: 1e6 }, { agente: "C", tokHora: 1 }] };
  const es = L.texto(d, false);
  assert.match(es, /12,4 M tok\/h · última hora/);
  assert.match(es, /3\. B/);
  assert.doesNotMatch(es, /4\. C/);
  assert.match(L.texto(d, true), /12\.4 M tok\/h · last hour/);
  assert.match(L.texto({ ok: false, sinDatos: true }, false), /sin datos/);
  assert.match(L.texto({ ...d, metodo: "media-hoy" }, false), /media de hoy \(estimado\)/);
});
