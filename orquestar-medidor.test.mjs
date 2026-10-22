// #7058: margen por medidor (Smith = Grok CLI de csilva@admira.com, Merovingio = Grok Bot de csilvasantin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { orquestar, medidorDe } from "./orquestar-lib.mjs";

const cuentas = [
  { id: "leyendas", nombre: "Leyendas", cuenta: "csilva@admira.com", margen: 19, semaforo: "ambar",
    medidores: [{ agente: "SuperGrok Heavy semanal", pct: 0 }, { agente: "Grok Bot semanal", pct: 81 }] },
  { id: "coetaneos", nombre: "Coetáneos", cuenta: "csilvasantin@gmail.com", margen: 96, semaforo: "verde",
    medidores: [{ agente: "SuperGrok Heavy semanal", pct: 0 }, { agente: "Grok Bot semanal", pct: 4 }] },
];

test("Smith lee el medidor del Grok CLI (Heavy), no la bolsa de Cursor", () => {
  const r = orquestar({ tipo: "codigo", cuentas, ahora: Date.parse("2026-10-22T16:00:00Z") });
  const smith = [...r.candidatos, ...r.excluidos].find((x) => x.persona === "Smith");
  assert.equal(smith.margenPct, 100);
  assert.equal(smith.semaforo, "verde");
  const jobs = [...r.candidatos, ...r.excluidos].find((x) => x.persona === "Jobs");
  assert.equal(jobs.margenPct, 19, "los consejeros siguen con el margen de su cuenta");
});

test("Merovingio sale en margenes con el medidor Grok Bot de csilvasantin", () => {
  const r = orquestar({ tipo: "codigo", cuentas, ahora: Date.parse("2026-10-22T16:00:00Z") });
  const m = r.margenes.find((x) => x.persona === "Merovingio");
  assert.equal(m.margenPct, 96);
  assert.equal(m.semaforo, "verde");
  assert.ok(![...r.candidatos, ...r.excluidos].some((x) => x.persona === "Merovingio"), "no entra en el reparto");
});

test("medidor sin lectura → margen null (se ve «margen sin lectura»)", () => {
  const c = medidorDe({ id: "x", margen: 50, medidores: [] }, "Grok Bot semanal");
  assert.equal(c.margen, null);
  assert.equal(c.semaforo, "sin");
  assert.equal(medidorDe({ id: "y", margen: 50 }, "Grok Bot semanal").margen, 50, "sin medidores, la cuenta tal cual");
});
