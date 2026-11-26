// r230 (Carlos, 21-11 21:07): «cambiar el segundo reloj para que ponga los tokens consumidos por un proyecto en concreto o
// por todos por defecto … en el reloj digital siempre estaran lo de todos los proyectos … elimina la frase de debajo de agentes».
// r254 (Carlos, 26-11): misma cifra en todos los equipos (sin techo local) y el día arranca siempre en 1 millón.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");

function cargar(lsInicial = {}) {
  const store = { ...lsInicial };
  const w = {
    document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" }, addEventListener() {} },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    Date, Math, Intl,
  };
  w.window = w;
  vm.runInNewContext(js, w);
  return { w, store };
}

test("reloj 2 = tokens hoy: aguja y cifra leen el acumulado en vivo (r231: acumulado propio, el odómetro es de ayer)", () => {
  assert.match(js, /Dial\.prototype\.pintaHoy = function \(o\)/);
  assert.match(js, /estado\.acT\.pon\(odoN, odoRitmo, 'vg2:todos', tsRef, BASE_DIA_TOKENS\)/);
  assert.match(js, /valor: function \(\) \{ return estado\.acT\.valor\(\); \}/);
  assert.match(js, /if \(this\.vivoFn\) \{ var vv = this\.vivoFn\(\);/);
  assert.match(js, /T\('tokens hoy', 'tokens today'\)/);
  assert.match(js, /this\.rotuloEscala = 'TOKENS HOY';/);
});

test("con un proyecto elegido la aguja lleva su propio acumulado; los odómetros los pinta pintaOdosAyer tras cada repintado", () => {
  assert.match(js, /estado\.acP\.pon\(hoyP, ritmoP, 'vg2v:p:' \+ nombre, tsRef, 0\)/);
  assert.match(js, /function pintaProyecto\(d, sin\) \{ pintaProyecto0\(d, sin\); pintaOdosAyer\(d, sin\); \}/);
  assert.match(js, /function pintaIzquierdo\(d, sin\) \{ var m = pintaIzquierdo0\(d, sin\); pintaOdosAyer\(d, sin\); return m; \}/);
});

test("acumulado del proyecto: escala de millones; tokensHoyVivo es determinista", () => {
  const { w } = cargar();
  const f = w.ConsumosVelocimetroAguja.tokensHoyVivo;
  const ahora = Date.parse("2026-11-26T11:00:00+01:00");
  assert.equal(f(4e6, 0, ahora, ahora, 0), 4e6);
  assert.match(js, /function escalaHoy\(v\) \{ return escala\(\(Number\(v\) \|\| 0\) \* 1\.25 \/ 1\.5, 1e6\); \}/);
});

test("sin la línea «DeepAgents trabajando / abiertos» bajo Agentes", () => {
  assert.doesNotMatch(html, /vel-ag-nota|DeepAgents trabajando \/ abiertos/);
});

test("r254: dos navegadores con distinto localStorage y distinta apertura ven la misma cifra tokens hoy", () => {
  const AHORA = Date.parse("2026-11-26T11:00:00+01:00");
  const generado = AHORA - 15_000; // la API se generó hace 15 s
  const real = 4_720_000;
  const ritmo = 2_500_000;
  const techoViejo = JSON.stringify({ dia: "2026-11-26", k: { "vg2:todos": 6_730_000 } });

  const a = cargar({ "consumos.odo.v1": techoViejo }); // MBACrema: llevaba un techo de 6,73 M
  const b = cargar({}); // MBP16: pestaña recién abierta, sin historial
  assert.equal(a.store["consumos.odo.v1"], undefined, "al cargar se borra el techo local antiguo");
  assert.equal(b.store["consumos.odo.v1"], undefined);

  const baseA = a.w.ConsumosVelocimetroAguja.BASE_DIA_TOKENS;
  const baseB = b.w.ConsumosVelocimetroAguja.BASE_DIA_TOKENS;
  assert.equal(baseA, 1_000_000);
  assert.equal(baseB, 1_000_000);

  const esperado = 1_000_000 + 4_720_000 + 2_500_000 / 3600 * 15;
  const va = a.w.ConsumosVelocimetroAguja.tokensHoyVivo(real, ritmo, generado, AHORA, baseA);
  const vb = b.w.ConsumosVelocimetroAguja.tokensHoyVivo(real, ritmo, generado, AHORA, baseB);
  assert.equal(va, vb);
  assert.equal(va, esperado);

  const ac1 = new a.w.ConsumosOdometro.Acumulado();
  const ac2 = new b.w.ConsumosOdometro.Acumulado();
  ac1.pon(real, ritmo, "vg2:todos", generado, baseA);
  ac2.pon(real, ritmo, "vg2:todos", generado, baseB);
  assert.equal(ac1.valor(AHORA), ac2.valor(AHORA));
  assert.equal(ac1.valor(AHORA), ac1.valor(AHORA), "llamar a valor dos veces no acumula de más");
  assert.equal(ac1.valor(AHORA), esperado);

  // Tras «guardar» en A, B sigue clavando la misma cifra (ya no hay techo local).
  if (a.w.localStorage) a.w.localStorage.setItem("consumos.odo.v1", techoViejo);
  assert.equal(ac1.valor(AHORA), ac2.valor(AHORA));
});

test("r254: con 0 tokens medidos al inicio del día, tokens hoy arranca en 1 M y sube desde ahí", () => {
  const { w } = cargar();
  const f = w.ConsumosVelocimetroAguja.tokensHoyVivo;
  const base = w.ConsumosVelocimetroAguja.BASE_DIA_TOKENS;
  const cap = w.ConsumosVelocimetroAguja.MAX_ESTIMADO_S;
  const medianoche = Date.parse("2026-11-26T00:00:00+01:00");
  assert.equal(base, 1_000_000);
  assert.equal(f(0, 0, medianoche, medianoche, base), 1_000_000);
  assert.equal(f(0, 1.2e6, medianoche, medianoche + 10_000, base), 1_000_000 + 1.2e6 / 3600 * 10);

  const ac = new w.ConsumosOdometro.Acumulado();
  ac.pon(0, 1.2e6, "vg2:todos", medianoche, base);
  assert.equal(ac.valor(medianoche), 1_000_000);
  assert.ok(ac.valor(medianoche + 10_000) > 1_000_000);

  // Un proyecto concreto no suma la base de 1 M.
  assert.equal(f(0, 0, medianoche, medianoche, 0), 0);
  assert.equal(f(12_000, 0, medianoche, medianoche, 0), 12_000);

  // El estimado se acota si la API se retrasa (ritmo 3600 tok/h = 1 tok/s).
  assert.equal(cap, 60);
  assert.equal(f(100, 3600, medianoche, medianoche + (cap + 600) * 1000, 0), 100 + cap);

  // A medianoche, datos de ayer no arrastran el medido: vuelve a la base.
  const ayer = Date.parse("2026-11-25T23:59:00+01:00");
  assert.equal(f(4_720_000, 2.5e6, ayer, medianoche, base), 1_000_000);
});

test("r254: el pie del reloj declara la base de 1 M y lo medido; el JS lleva cache bust nuevo", () => {
  assert.match(js, /arranca el día en /);
  assert.match(js, /BASE_DIA_TOKENS/);
  assert.match(js, /misma cifra en todos los equipos/);
  assert.match(js, /localStorage\.removeItem\(LS_ODO\)/);
  assert.doesNotMatch(js, /odoGuarda\(/);
  assert.match(html, /consumos-velocimetro\.js\?v=20261126-r254-hoy-sync/);
});
