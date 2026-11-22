// r253 (Carlos, 22-11 23:05): «vamos a darle más utilidad a los relojes y los hacemos interactivos dividiendolos por la
// mitad: el lado izquierdo nos muestra el día anterior, la semana anterior y el mes anterior y vuelve al de hoy; y a la
// derecha al revés».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { diasPeriodo, periodosTokens } from "./consumos-velocidad-lib.mjs";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
const api = readFileSync(new URL("./functions/api/consumos/velocidad.js", import.meta.url), "utf8");
const ctx = () => { const w = { document: { readyState: "loading", addEventListener() {}, getElementById: () => null, documentElement: { lang: "es" } } }; w.window = w; vm.runInNewContext(js, w); return w; };
const plano = (x) => JSON.parse(JSON.stringify(x));

test("servidor: semana anterior = lunes–domingo previos; mes anterior = mes natural previo (Madrid)", () => {
  const p = diasPeriodo(Date.parse("2026-11-22T23:05:00+01:00")); // domingo
  assert.equal(p.lunesAnt, "2026-11-09"); assert.equal(p.domingoAnt, "2026-11-15");
  assert.equal(p.dia1Ant, "2026-10-01"); assert.equal(p.finMesAnt, "2026-10-31");
  const q = diasPeriodo(Date.parse("2026-03-02T10:00:00+01:00")); // lunes, febrero corto
  assert.equal(q.lunesAnt, "2026-02-23"); assert.equal(q.domingoAnt, "2026-03-01"); assert.equal(q.dia1Ant, "2026-02-01"); assert.equal(q.finMesAnt, "2026-02-28");
  const r = periodosTokens({ tokHoy: 5, libro: { "2026-11-10": { tok: 100 } }, yokup: { "2026-11-09": 7, "2026-10-15": 40 }, yokupDesde: "2026-09-22", ahora: Date.parse("2026-11-22T12:00:00+01:00") });
  assert.equal(r.semanaAnterior.desde, "2026-11-09"); assert.equal(r.semanaAnterior.hasta, "2026-11-15"); assert.equal(r.semanaAnterior.dias.length, 7);
  assert.equal(r.semanaAnterior.tok, 107);
  assert.equal(r.mesAnterior.desde, "2026-10-01"); assert.equal(r.mesAnterior.hasta, "2026-10-31"); assert.equal(r.mesAnterior.dias.length, 31); assert.equal(r.mesAnterior.tok, 40);
  // Sin libro ni Yokup: null (sin dato), nunca 0 inventado
  const s = periodosTokens({ tokHoy: 5, libro: null, yokup: null, ahora: Date.parse("2026-11-22T12:00:00+01:00") });
  assert.equal(s.mesAnterior.tok, null);
  assert.match(api, /fleet\/consumo\?dias=62/);
  assert.match(api, /getUTCDate\(\) - 61\)/);
});

test("cliente: ciclo izquierda Hoy→Ayer→Semana→Mes→Hoy; derecha al revés", () => {
  const P = ctx().ConsumosPeriodo;
  assert.deepEqual([...P.CICLO], ["hoy", "ayer", "semanaAnterior", "mesAnterior"]);
  let p = "hoy"; const izq = []; for (let i = 0; i < 4; i++) { p = P.paso(p, -1); izq.push(p); }
  assert.deepEqual(izq, ["ayer", "semanaAnterior", "mesAnterior", "hoy"]);
  p = "hoy"; const der = []; for (let i = 0; i < 4; i++) { p = P.paso(p, 1); der.push(p); }
  assert.deepEqual(der, ["mesAnterior", "semanaAnterior", "ayer", "hoy"]);
});

test("cliente: periodoDe suma solo días con dato y la media usa sus horas reales (cambio de hora incluido)", () => {
  const W = ctx().ConsumosPeriodos;
  const d = { periodos: { mesAnterior: { desde: "2026-10-01", hasta: "2026-10-31", dias: [
    { dia: "2026-10-24", tok: 240, fuente: "libro diario" }, { dia: "2026-10-25", tok: 250, fuente: "partes Yokup (sin caché)" },
    { dia: "2026-10-26", tok: 0, fuente: "partes Yokup (ninguno ese día)" }, { dia: "2026-10-27", tok: null, fuente: "sin datos" }] } } };
  const r = plano(W.periodoDe(d, "mesAnterior"));
  assert.equal(r.tok, 490); assert.equal(r.horas, 49); assert.equal(r.media, 10); assert.equal(r.conDatos, 2); assert.equal(r.total, 4);
  assert.deepEqual(r.fuentes, ["libro diario", "partes Yokup (sin caché)"]);
  assert.equal(W.periodoDe({ periodos: { ayer: { dias: [{ dia: "2026-11-21", tok: null, fuente: "sin datos" }] } } }, "ayer").tok, null);
  assert.equal(W.periodoDe(null, "ayer").media, null);
});

test("UI: dos mitades por reloj sobre la esfera (no sobre bolas ni odómetro), cursor de mano y ‹ ›", () => {
  assert.match(js, /b\.className = 'vel-mitad ' \+ lado;/);
  assert.match(js, /dial\.appendChild\(b\)/);
  assert.match(js, /e\.stopPropagation\(\); cambiaReloj\(x\[1\], lado === 'izq' \? -1 : 1\)/);
  assert.match(html, /\.vel-mitad\{position:absolute;top:0;width:50%;aspect-ratio:158\/190;z-index:1;[^}]*cursor:pointer/);
  assert.match(html, /\.vel-da\{position:relative;[^}]*z-index:2\}/); // bolas por encima de las mitades
  assert.match(js, /pintaCerrado\(\{ valor: P\.media/); // Agentes: media tokens/hora del periodo
  assert.match(js, /pintaCerrado\(\{ valor: todosP \? PP\.tok : null/); // Proyectos: total del periodo
  assert.match(html, /consumos-velocimetro\.js\?v=20261122-r253-periodos/);
});
