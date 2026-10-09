// r20 (GrokBotBox, 09-10-2026): elección por defecto del dial de proyecto y del agente en /consumos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { proyectoAhora } from "./consumos-velocidad-lib.mjs";
import { calcular } from "./functions/api/consumos/velocidad.js";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("./assets/consumos-velocimetro-elegir.js", import.meta.url), "utf8"), { globalThis: ctx, window: ctx });
const E = ctx.ConsumosElegir;

// Datos reales de producción, 09-10-2026 ~11:50 Madrid.
const VIVO = [
  { proyecto: "admira.store", tokHoy: 4592231, tokHora: 0 },
  { proyecto: "admira.biz", tokHoy: 4283244, tokHora: 0 },
  { proyecto: "xpaceos.com", tokHoy: 1452560, tokHora: 563256 },
  { proyecto: "otros", tokHoy: 1248367, tokHora: 3102768 },
  { proyecto: "yokup.com", tokHoy: 637233, tokHora: 578799 },
];

test("por defecto: el que más quema AHORA (max tok/h), no el que más lleva hoy — «otros» vale si es el primero", () => {
  assert.equal(E.proyectoPorDefecto(VIVO), "otros");
  assert.equal(proyectoAhora(VIVO), "otros");
  const sinOtros = VIVO.filter((p) => p.proyecto !== "otros");
  assert.equal(E.proyectoPorDefecto(sinOtros), "yokup.com");
  assert.equal(proyectoAhora(sinOtros), "yokup.com");
});

test("todos a 0 tok/h (o sin medir) → el que más lleva hoy", () => {
  const quietos = VIVO.map((p) => ({ ...p, tokHora: 0 }));
  assert.equal(E.proyectoPorDefecto(quietos), "admira.store");
  assert.equal(proyectoAhora(quietos), "admira.store");
  const nulos = VIVO.map((p) => ({ ...p, tokHora: null }));
  assert.equal(E.proyectoPorDefecto(nulos), "admira.store");
  assert.equal(proyectoAhora(nulos), "admira.store");
});

test("empate: un proyecto real antes que «otros»", () => {
  const l = [{ proyecto: "otros", tokHora: 100, tokHoy: 50 }, { proyecto: "admira.live", tokHora: 100, tokHoy: 50 }];
  assert.equal(E.proyectoPorDefecto(l), "admira.live");
  assert.equal(proyectoAhora(l), "admira.live");
  assert.equal(E.proyectoPorDefecto([]), null);
  assert.equal(proyectoAhora(undefined), null);
});

test("orden del selector: tok/h desc → tokens de hoy desc", () => {
  assert.deepEqual(Array.from(E.ordenarProyectos(VIVO), (p) => p.proyecto), ["otros", "yokup.com", "xpaceos.com", "admira.store", "admira.biz"]);
});

test("auto vs manual: la elección manual manda; sin ella sigue al que más quema (se reevalúa con datos nuevos)", () => {
  assert.deepEqual({ ...E.elegirProyecto(VIVO, null) }, { proyecto: "otros", auto: true });
  assert.deepEqual({ ...E.elegirProyecto(VIVO, "admira.biz") }, { proyecto: "admira.biz", auto: false });
  const despues = VIVO.map((p) => (p.proyecto === "xpaceos.com" ? { ...p, tokHora: 9e6 } : p));
  assert.equal(E.elegirProyecto(despues, "").proyecto, "xpaceos.com");
  assert.equal(E.nombreProyecto("otros"), "otros (sin proyecto)");
});

test("agente: '' = toda la flota; un nombre → su fila (tokHora, tokHoy)", () => {
  const ags = [{ agente: "Neo", tokHora: 3666024, tokHoy: 2700927 }, { agente: "Morfeo", tokHora: 0, tokHoy: 4283244 }];
  assert.equal(E.elegirAgente(ags, "").agente, null);
  const r = E.elegirAgente(ags, "Neo");
  assert.equal(r.fila.tokHora, 3666024);
  assert.equal(r.fila.tokHoy, 2700927);
  assert.equal(E.elegirAgente(ags, "Smith").fila, null);
});

test("/api/consumos/velocidad expone proyectoAhora", async () => {
  const r = await calcular({ env: {}, fetchImpl: async () => new Response("{}", { status: 503 }) });
  assert.ok("proyectoAhora" in r || r.sinDatos === true);
});

test("aguja analógica: vibración 0 a 0 tok/h o sin datos; 0,5° → 1,5° según la escala", () => {
  const w = { document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" } } };
  w.window = w;
  vm.runInNewContext(readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8"), w);
  const amp = w.ConsumosVelocimetroAguja.amplitud;
  assert.equal(amp(0, false), 0);
  assert.equal(amp(0.5, true), 0);
  assert.ok(amp(0.01, false) >= 0.5 && amp(0.01, false) < 0.6);
  assert.equal(amp(1, false), 1.5);
});
