// 19-11-2026 (Carlos: PROYECTOS · admiranext.com «sin datos · Sin pulso fresco que lo mida»): el único agente de
// admiranext.com es Cursor (Grok Bot (Consejo) / Merovingio), con retraso → tokHora null → el reloj de proyecto
// quedaba sin cifra aunque la flota sí lo contaba como estimado. Ahora el proyecto hereda el estimado.
import test from "node:test";
import assert from "node:assert/strict";
import { proyectosDePulso, mezclar } from "./consumos-pulso-lib.mjs";

const AHORA = Date.parse("2026-11-19T11:45:00Z");
const S = (minAntes) => Math.round((AHORA - minAntes * 60000) / 1000);
const cursorDoc = (ultimoPulsoMin, serie) => ({ maquina: "GrokBotBox", agentes: { "Grok Bot (Consejo)": {
  motor: "cursor", fuente: "cursor", tokHoy: 90000, ultimoPulso: AHORA - ultimoPulsoMin * 60000,
  ultimoEvento: new Date(S(30) * 1000).toISOString(), porProyecto: { "admiranext.com": 90000 }, serie } } });

test("proyecto solo con Cursor (con retraso, export fresco): tokHora estimado, no null", () => {
  const docs = [cursorDoc(30, [[S(95), 0, 0], [S(60), 30000, 0], [S(30), 90000, 0]])];
  const p = proyectosDePulso(docs, AHORA).find((x) => x.proyecto === "admiranext.com");
  assert.ok(p, "existe admiranext.com");
  assert.notEqual(p.tokHora, null, "ya no queda «sin datos»");
  assert.ok(p.tokHora > 0);
  assert.equal(p.estimado, true);
  const m = mezclar(null, docs, AHORA);
  const sumaProy = m.porProyecto.reduce((s, x) => s + (x.tokHora || 0), 0);
  assert.ok(Math.abs(sumaProy - m.tokHora) <= 1, "Σ proyectos == flota (estimado incluido)");
});

test("Cursor sin export fresco (stale): el proyecto sigue «sin datos» (null), nunca inventado", () => {
  const docs = [cursorDoc(6 * 60, [[S(400), 0, 0], [S(370), 90000, 0]])];
  const p = proyectosDePulso(docs, AHORA).find((x) => x.proyecto === "admiranext.com");
  assert.equal(p.tokHora, null);
  assert.equal(p.estimado, undefined);
});
