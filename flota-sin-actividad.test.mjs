// #7037: ficha activa con encargo abierto y sin tokens ≥ 2 h → aviso ámbar «Encargo abierto · sin actividad desde …».
import test from "node:test";
import assert from "node:assert/strict";
import { sinActividad, unirPulsos } from "./flota-trabajando-lib.mjs";
import { ultimaActividadDe } from "./consumos-pulso-lib.mjs";

const ahoraS = Date.parse("2026-10-22T07:00:00Z") / 1000;

test("Oráculo: encargo en curso, 0 tokens hoy y última actividad ayer → aviso con fecha", () => {
  const p = { tokHoy: 0, tokHora: 0, tokUltimaHora: 0, ultimaActividad: "2026-10-21T04:56:00.000Z" };
  assert.deepEqual(sinActividad({ estado: "verde", enCurso: 1, p, ahoraS }), { desde: "2026-10-21T04:56:00.000Z", horas: 26 });
});
test("sin fecha guardada y 0 tokens hoy → aviso sin fecha", () => {
  assert.deepEqual(sinActividad({ estado: "verde", enCurso: 1, p: { tokHoy: 0 }, ahoraS }), { desde: null, horas: null });
});
test("actividad reciente, sin encargo, parado o sin pulso → sin aviso", () => {
  const reciente = { tokHoy: 10, ultimaActividad: "2026-10-22T06:00:00.000Z" };
  assert.equal(sinActividad({ estado: "verde", enCurso: 1, p: reciente, ahoraS }), null);
  assert.equal(sinActividad({ estado: "verde", enCurso: 1, p: { tokHoy: 5, tokHora: 100 }, ahoraS }), null);
  assert.equal(sinActividad({ estado: "verde", enCurso: 0, p: { tokHoy: 0 }, ahoraS }), null);
  assert.equal(sinActividad({ estado: "gris", enCurso: 1, p: { tokHoy: 0 }, ahoraS }), null);
  assert.equal(sinActividad({ estado: "verde", enCurso: 1, p: null, ahoraS }), null);
});
test("ultimaActividadDe guarda el máximo y no se pierde con tokHoy a 0", () => {
  const ahora = Date.parse("2026-10-22T07:00:00Z");
  assert.equal(ultimaActividadDe({ tokHoy: 0, ultimaActividad: "2026-10-21T04:56:00.000Z" }, { tokHoy: 0, ultimoEvento: null }, ahora), "2026-10-21T04:56:00.000Z");
  assert.equal(ultimaActividadDe({ tokHoy: 0 }, { tokHoy: 50, ultimoEvento: "2026-10-22T06:59:00Z" }, ahora), new Date(ahora).toISOString());
  assert.equal(ultimaActividadDe({ tokHoy: 50 }, { tokHoy: 50, ultimoEvento: "2026-10-22T06:59:00Z" }, ahora), "2026-10-22T06:59:00.000Z");
  assert.equal(ultimaActividadDe(null, { tokHoy: 0 }, ahora), null);
});
test("unirPulsos conserva la ultimaActividad más reciente", () => {
  const u = unirPulsos([{ maquina: "A", ultimaActividad: "2026-10-21T04:56:00.000Z" }, { maquina: "B", ultimaActividad: "2026-10-21T09:00:00.000Z" }]);
  assert.equal(u.ultimaActividad, "2026-10-21T09:00:00.000Z");
});
