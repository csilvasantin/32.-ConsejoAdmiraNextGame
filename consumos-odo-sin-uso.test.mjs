// r57 (Carlos, 21-10-2026): el cuentakilómetros HOY no pronostica si nadie ha usado tokens en los últimos 3 min.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function cargar() {
  const w = { document: { readyState: "complete", getElementById: () => null, documentElement: { lang: "es" } }, Intl, Date, Math };
  w.window = w;
  vm.runInNewContext(readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8"), w);
  return w;
}
const AHORA = Date.parse("2026-10-21T20:40:00Z");
const hace = (min) => new Date(AHORA - min * 60000).toISOString();

test("usoFresco: evento real ≤ 3 min → sí; Morfeo parado desde 22:21 (19 min) → no; Cursor con retraso y stale no cuentan", () => {
  const f = cargar().ConsumosUsoFresco;
  assert.equal(f([{ agente: "Morfeo", ultimoEvento: hace(1) }], AHORA), true);
  assert.equal(f([{ agente: "Morfeo", ultimoEvento: hace(2.9) }], AHORA), true);
  assert.equal(f([{ agente: "Morfeo", ultimoEvento: "2026-10-21T20:21:37.000Z", tokHora: 870000 }], AHORA), false);
  assert.equal(f([{ agente: "Merovingio", conRetraso: true, ultimoEvento: hace(0) }], AHORA), false);
  assert.equal(f([{ agente: "X", stale: true, ultimoEvento: hace(0) }], AHORA), false);
  assert.equal(f([], AHORA), false);
});

test("Odometro: sin ritmo ni actividad no avanza: se queda en el real", () => {
  const O = cargar().ConsumosOdometro;
  assert.equal(O.ritmoPronostico(0, 1397427, false, 80000), 0);
  assert.equal(O.velocidadOdometro({ mostrado: 1397427, real: 1397427, objetivo: 1397427, segundosRestantes: 1200, ritmo: 0, activo: false }), 0);
});

// r228 (Carlos, 21-11: «el contador no está sumando?»): el odómetro suma al ritmo de la cifra grande y nunca retrocede.
test("odómetro: monótono si es de hoy; r231: los de /consumos enseñan ayer cerrado (quietos, sin suma por segundo)", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /odometro\(el, n, 0, dial\.pfx \+ ':ayer', 'ayer'\);/);
  assert.ok(!/o\.mostrado = n;\s*\n/.test(js.slice(js.indexOf("function odometro(el"), js.indexOf("function odometro(el") + 600)), "ya no recorta hacia atrás");
  assert.match(js, /incluye estimado en curso/);
});
