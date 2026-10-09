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

// r23: desplegables con estado (verde / amarillo / rojo) y agentes conocidos sin datos.
import { perfilesFlota } from "./consumos-perfiles.mjs";
test("estado de fila: verde = tok/h > 0 · amarillo = tokens hoy y 0 tok/h · rojo = sin datos hoy", () => {
  assert.equal(E.estadoFila(1200, 5), "verde");
  assert.equal(E.estadoFila(0, 4592231), "amarillo");
  assert.equal(E.estadoFila(null, 300), "amarillo");
  assert.equal(E.estadoFila(null, null), "rojo");
  assert.equal(E.estadoFila(0, 0), "rojo");
});
test("desplegable de agentes: todos los conocidos aunque no tengan datos hoy (al final), sin duplicar", () => {
  const l = E.agentesConConocidos([{ agente: "Trinity", tokHora: 5, tokHoy: 9 }, { agente: "Neo", tokHora: 0, tokHoy: 3 }], perfilesFlota());
  assert.deepEqual(Array.from(l, (a) => a.agente), ["Trinity", "Neo", "Morfeo", "Oráculo", "Smith", "Grok Bot (Consejo)"]);
  assert.equal(l[4].sinDatos, true);
  const pf = perfilesFlota();
  assert.ok(!pf.some((p) => p.maquina === "GrokBot"), "los consejeros GrokBot no van uno a uno (no se pueden separar)");
  const gb = pf.find((p) => p.agente === "Grok Bot (Consejo)");
  assert.equal(gb.modelo, "Grok Bot / Cursor Pro");
  assert.deepEqual(gb.cubre, ["Jobs", "Wozniak", "Lucas", "Disney"]);
  assert.equal(pf.find((p) => p.agente === "Neo").email, "csilva@admira.com");
  assert.equal(pf.find((p) => p.agente === "Oráculo").email, "csilvasantin@gmail.com");
});

test("r24 · píldora de margen por el margen (verde ≥ 50 · amarillo 20–49 · rojo < 20); el semáforo del orquestador va aparte", () => {
  assert.equal(E.colorMargen(71), "verde");
  assert.equal(E.colorMargen(50), "verde");
  assert.equal(E.colorMargen(49), "amarillo");
  assert.equal(E.colorMargen(20), "amarillo");
  assert.equal(E.colorMargen(19), "rojo");
  assert.equal(E.colorMargen(null), "sin");
  // Trinity 71 % en rojo por el ritmo: píldora verde + nota aparte.
  const n = E.notaOrquestador({ pct: 71, semaforo: "rojo", agotaAntes: true, proyeccionTexto: "se agota el domingo" });
  assert.match(n.texto, /se agota antes del reset \(se agota el domingo\)/);
  assert.match(E.notaOrquestador({ pct: 71, semaforo: "rojo" }).texto, /rojo/);
  assert.equal(E.notaOrquestador({ pct: 90, semaforo: "verde" }), null);
  assert.equal(E.notaOrquestador({ pct: 30, semaforo: "ambar" }), null, "ámbar con 30 % ya lo dice la píldora amarilla");
});

test("r36 cuentakilómetros rodante: ruedas continuas y ritmo medio del día", () => {
  const w = { document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" } }, Intl, Date, Math };
  w.window = w;
  vm.runInNewContext(readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8"), w);
  const O = w.ConsumosOdometro;
  // 1234,5 → última rueda 4,5 (gira); las demás quietas en su cifra.
  assert.deepEqual(Array.from(O.posicionesRuedas(1234.5, 4)), [1, 2, 3, 4.5]);
  // 1299,5 → la de las decenas va a medio camino de 9 a 0 (arrastrada); las centenas igual (99,5 > 99).
  const p = Array.from(O.posicionesRuedas(1299.5, 4));
  assert.equal(p[3], 9.5); assert.equal(p[2], 9.5); assert.equal(p[1], 2.5); assert.equal(p[0], 1);
  // Ritmo medio: tokens de hoy / segundos desde la medianoche de Madrid (10 M a 10 h → ~278 tokens/s).
  const s = O.relojMadrid(Date.now()).s;
  assert.ok(Math.abs(O.ritmoMedio(10e6) - 10e6 / Math.max(600, s)) < 1);
  assert.equal(O.ritmoMedio(null), 0);
  const h10 = 10 * 3600; assert.ok(Math.abs(10e6 / h10 - 277.78) < 0.01);
});

test("r38 · cuentakilómetros con pronóstico a fin de hora: nunca 0 con actividad, nunca hacia atrás", () => {
  const w = { document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" } }, Intl, Date, Math };
  w.window = w;
  vm.runInNewContext(readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8"), w);
  const O = w.ConsumosOdometro;
  // Ritmo: tokens/hora de ahora; si 0, media del día solo si hay alguien trabajando; si no, 0.
  assert.equal(O.ritmoPronostico(3600e3, 10e6, false, 36000), 1000);
  assert.ok(Math.abs(O.ritmoPronostico(0, 10e6, true, 36000) - 277.78) < 0.01);
  assert.equal(O.ritmoPronostico(0, 10e6, false, 36000), 0);
  const v = O.velocidadOdometro;
  // 60 por hora, 3600 s por delante → 1 cada minuto (1/60 por s; el mínimo absoluto es 1 tok/s con actividad).
  assert.ok(Math.abs(v({ mostrado: 0, real: 0, objetivo: 360000, segundosRestantes: 3600, ritmo: 100 }) - 100) < 1e-9);
  // Real por delante → alcanzarlo en ~30 s.
  assert.ok(v({ mostrado: 0, real: 3000, objetivo: 3000, segundosRestantes: 3600, ritmo: 1 }) >= 100);
  // Pronóstico pasado (mostrado > objetivo y > real): frena pero NUNCA a 0 mientras haya actividad.
  assert.ok(v({ mostrado: 5000, real: 1000, objetivo: 2000, segundosRestantes: 600, ritmo: 100 }) >= 5);
  assert.ok(v({ mostrado: 5000, real: 1000, objetivo: 2000, segundosRestantes: 600, ritmo: 0, activo: true }) >= 1);
  // Todo a 0 y nadie trabajando, ya alcanzado → quieto.
  assert.equal(v({ mostrado: 5000, real: 5000, objetivo: 5000, segundosRestantes: 600, ritmo: 0, activo: false }), 0);
  // Simulación: servidor con el total CONGELADO 20 min (colectores a saltos) y 300 k tokens/hora → sube cada segundo.
  let m = 1e6, prev = m; const real = 1e6, ritmo = 300e3 / 3600;
  for (let t = 0; t < 1200; t++) {
    const seg = Math.max(30, 3600 - ((t + 600) % 3600));
    const obj = real + ritmo * (3600 - ((Math.floor(t / 10) * 10 + 600) % 3600)); // re-pronóstico cada 10 s
    m += v({ mostrado: m, real, objetivo: obj, segundosRestantes: seg, ritmo });
    assert.ok(m > prev, "sube en el segundo " + t); prev = m;
  }
});
