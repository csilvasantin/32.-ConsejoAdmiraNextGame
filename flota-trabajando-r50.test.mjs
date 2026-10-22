import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas, aplicarLatidosConsejero, activosDeFlota } from "./flota-trabajando-lib.mjs";

const ahoraS = 1792650000;

test("r50: consejero_latido vigente pone a Wozniak en verde y activo", () => {
  const ts = tarjetas({ presencia: [], velocidad: null, ahoraS });
  assert.equal(ts.find((t) => t.agente === "Wozniak").estado, "gris");
  aplicarLatidosConsejero(ts, { Wozniak: { modo: "trabajando", mision: "afinar consumos en tiempo real", proyecto: "admira.live", at: ahoraS - 5, hasta: ahoraS + 595 } }, ahoraS);
  const w = ts.find((t) => t.agente === "Wozniak");
  assert.equal(w.estado, "verde");
  assert.match(w.motivo, /afinar consumos/);
  assert.equal(w.fuente, "consejero_latido");
  assert.equal(ts[0].agente, "Wozniak");
  assert.ok(activosDeFlota(ts, null).agentes.some((a) => a.agente === "Wozniak" && a.proyecto === "admira.live"));
});

test("r50: caducado o reposo no enciende; agentes no se tocan", () => {
  const ts = tarjetas({ presencia: [], velocidad: null, ahoraS });
  aplicarLatidosConsejero(ts, { Wozniak: { modo: "trabajando", hasta: ahoraS - 1 }, Jobs: { modo: "reposo", hasta: ahoraS + 600 }, Merovingio: { modo: "trabajando", hasta: ahoraS + 600 } }, ahoraS);
  for (const n of ["Wozniak", "Jobs", "Merovingio"]) assert.equal(ts.find((t) => t.agente === n).estado, "gris", n);
});

test("r50: Musk «parado vía Merovingio» se enciende con su latido propio", () => {
  const ts = tarjetas({ presencia: [], velocidad: null, ahoraS });
  aplicarLatidosConsejero(ts, { Musk: { modo: "trabajando", mision: "x", at: ahoraS, hasta: ahoraS + 60 } }, ahoraS);
  const m = ts.find((t) => t.agente === "Musk");
  assert.equal(m.estado, "verde"); assert.equal(m.via, null);
  assert.ok(activosDeFlota(ts, null).agentes.some((a) => a.agente === "Musk"));
});
