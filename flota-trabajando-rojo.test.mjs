// Rojo (Carlos, 22-10-2026): parado > 1 h pero con actividad hoy (Madrid); gris = nada hoy.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarRojo, diaMadrid, ORDEN_ESTADO } from "./flota-trabajando-lib.mjs";

const ahoraS = Math.floor(Date.parse("2026-10-22T17:00:00Z") / 1000); // 19:00 Madrid

test("rojo: parado hace 3 h hoy → rojo; hace 20 min → sigue gris; ayer → gris", () => {
  const ts = [
    { agente: "A", estado: "gris", haceS: 3 * 3600 },
    { agente: "B", estado: "gris", haceS: 20 * 60 },
    { agente: "C", estado: "gris", haceS: 20 * 3600 }, // 23:00 de ayer en Madrid
    { agente: "D", estado: "gris", haceS: null },
  ];
  aplicarRojo(ts, ahoraS);
  const e = Object.fromEntries(ts.map((t) => [t.agente, t.estado]));
  assert.deepEqual(e, { A: "rojo", B: "gris", C: "gris", D: "gris" });
  assert.equal(ts[0].agente, "A");
});

test("rojo: tokens hoy o ultimaActividad de hoy cuentan; verde/amarillo no cambian", () => {
  const ts = [
    { agente: "T", estado: "gris", haceS: null, tokHoy: 5000 },
    { agente: "U", estado: "gris", haceS: 30 * 3600, ultimaActividad: "2026-10-22T06:00:00Z" },
    { agente: "V", estado: "verde", haceS: 5 * 3600 },
    { agente: "Y", estado: "amarillo", haceS: 5 * 3600 },
  ];
  aplicarRojo(ts, ahoraS);
  const e = Object.fromEntries(ts.map((t) => [t.agente, t.estado]));
  assert.deepEqual(e, { T: "rojo", U: "rojo", V: "verde", Y: "amarillo" });
  assert.equal(ts.find((t) => t.agente === "U").haceS, 11 * 3600);
});

test("rojo: día de Madrid (medianoche local, no UTC)", () => {
  assert.equal(diaMadrid(Date.parse("2026-10-21T22:30:00Z")), "2026-10-22");
  const ts = [{ agente: "M", estado: "gris", haceS: ahoraS - Math.floor(Date.parse("2026-10-21T22:30:00Z") / 1000) }];
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
