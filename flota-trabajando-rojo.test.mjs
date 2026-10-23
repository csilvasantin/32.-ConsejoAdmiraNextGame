// Rojo (Carlos, 22-10-2026 · r55 23-10-2026): cualquiera con actividad REAL hoy (Madrid) → al menos rojo; gris = nada hoy.
// Los latidos automáticos (haceS) no cuentan.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarRojo, diaMadrid, ORDEN_ESTADO } from "./flota-trabajando-lib.mjs";

const ahoraS = Math.floor(Date.parse("2026-10-22T17:00:00Z") / 1000); // 19:00 Madrid
const iso = (s) => new Date(s * 1000).toISOString();

test("r55: token hoy hace 3 h → rojo; acción hace 20 min → rojo; ayer → gris; solo latido (haceS) → gris", () => {
  const ts = [
    { agente: "A", estado: "gris", ultimoToken: iso(ahoraS - 3 * 3600) },
    { agente: "B", estado: "gris", actividad: { ts: ahoraS - 1200, fuente: "encargo aceptado" } },
    { agente: "C", estado: "gris", ultimoToken: iso(ahoraS - 20 * 3600) }, // 23:00 de ayer en Madrid
    { agente: "D", estado: "gris", haceS: 5 },
  ];
  aplicarRojo(ts, ahoraS);
  const e = Object.fromEntries(ts.map((t) => [t.agente, t.estado]));
  assert.deepEqual(e, { A: "rojo", B: "rojo", C: "gris", D: "gris" });
  assert.equal(ts.find((t) => t.agente === "A").haceS, 3 * 3600);
});

test("rojo: tokens hoy o ultimaActividad de tokens de hoy cuentan; verde/amarillo no cambian", () => {
  const ts = [
    { agente: "T", estado: "gris", haceS: null, tokHoy: 5000 },
    { agente: "U", estado: "gris", haceS: 30, tokHoy: 10, ultimaActividad: "2026-10-22T06:00:00Z" },
    { agente: "V", estado: "verde", haceS: 5 * 3600 },
    { agente: "Y", estado: "amarillo", haceS: 5 * 3600 },
  ];
  aplicarRojo(ts, ahoraS);
  const e = Object.fromEntries(ts.map((t) => [t.agente, t.estado]));
  assert.deepEqual(e, { T: "rojo", U: "rojo", V: "verde", Y: "amarillo" });
  assert.equal(ts.find((t) => t.agente === "U").haceS, 11 * 3600, "haceS = última actividad real, no el latido");
});

test("rojo: día de Madrid (medianoche local, no UTC)", () => {
  assert.equal(diaMadrid(Date.parse("2026-10-21T22:30:00Z")), "2026-10-22");
  const ts = [{ agente: "M", estado: "gris", ultimoToken: "2026-10-21T22:30:00Z" }];
  aplicarRojo(ts, ahoraS);
  assert.equal(ts[0].estado, "rojo");
  assert.ok(ORDEN_ESTADO.rojo > ORDEN_ESTADO.amarillo && ORDEN_ESTADO.rojo < ORDEN_ESTADO.gris);
});

test("rojo: el panel lo pinta en rojo y la leyenda lo explica", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /t\.estado === 'rojo'/);
  assert.match(js, /rojo = sin actividad desde hace más de 1 h, pero activo hoy/);
  assert.match(js, /red = no activity for over 1 h, but active today/);
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /\.tr-chipa\.tr-rojo\{/);
  assert.match(html, /\.tr-fuera6\{/);
});
