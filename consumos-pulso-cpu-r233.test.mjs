// r233: las apps de escritorio mandan el %cpu de su proceso (y sus hijos) en las superficies del pulso.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizarSuperficies } from "./consumos-pulso-lib.mjs";

test("superficie app: cpu numérico se guarda (redondeado, acotado); sin cpu no aparece", () => {
  const [a, b, c] = normalizarSuperficies([
    { tipo: "app", app: "Codex", agente: "Trinity", enUso: true, cpu: 44.84 },
    { tipo: "app", app: "Claude", agente: "Neo" },
    { tipo: "app", app: "Codex", cpu: "x" },
  ]);
  assert.equal(a.cpu, 44.8);
  assert.equal("cpu" in b, false);
  assert.equal("cpu" in c, false);
});
