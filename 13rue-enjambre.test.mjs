import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./13rue/enjambre.js", import.meta.url), "utf8");
const context = { module:{ exports:{} }, exports:{}, globalThis:{} };
vm.runInNewContext(source, context);
const E = context.module.exports;

test("el enjambre reparte exactamente los ocho cargos sin duplicarlos", () => {
  assert.equal(E.ROLES.length, 8);
  assert.deepEqual([...E.ROLES.map((role) => role.id)].sort(),
    ["CEO","CTO","COO","CFO","CCO","CDO","CXO","CSO"].sort());
  const grouped = E.GROUPS.flatMap((group) => group.roles);
  assert.equal(grouped.length, 8);
  assert.equal(new Set(grouped).size, 8);
});

test("Yokup recibe tres misiones de un máximo de tres tareas", () => {
  const problem = "Reducir el tiempo de idea a pantalla";
  const parts = Object.fromEntries(E.ROLES.map((role) => [role.id, E.fallback(role, problem)]));
  const payloads = E.payloads(problem, parts,
    { agent:"TrinityMBP16", machine:"MacBook Pro 16" }, "swm-test");
  assert.equal(payloads.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(payloads.map((payload) => payload.tasks.length))), [3,3,2]);
  for (const payload of payloads) {
    assert.equal(payload.project_id, "admira-live");
    assert.equal(payload.agent, "TrinityMBP16");
    assert.ok(payload.tasks.every((task) => task.status === "in_progress"));
    assert.deepEqual(JSON.parse(JSON.stringify(payload.tasks.map((task) => task.code))), ["a","b","c"].slice(0,payload.tasks.length));
    assert.ok(payload.tasks.every((task) => task.report.includes("parte cogida")));
  }
  assert.equal(new Set(payloads.map((payload) => payload.idempotency_key)).size, 3);
});

test("la respuesta del deepagent conserva acción, prueba y entrega", () => {
  const part = E.parse("A) Construyo el flujo. B) Se ve la prueba. C) Queda en producción. VOZ: Hecho.");
  assert.deepEqual(JSON.parse(JSON.stringify(part)), {
    a:"Construyo el flujo.", b:"Se ve la prueba.", c:"Queda en producción.", voice:"Hecho.", source:"deepagent"
  });
  assert.equal(E.parse("una respuesta sin contrato"), null);
});

test("la puerta pública expone la entrada, ocho habitantes y Yokup", () => {
  const html = fs.readFileSync(new URL("./13rue/enjambre.html", import.meta.url), "utf8");
  assert.match(html, /id="problem"/);
  assert.match(html, /LANZAR ENJAMBRE \+ YOKUP/);
  assert.match(html, /Promise\.all\(E\.ROLES\.map/);
  assert.match(html, /YOKUP\+"\/declare"/);
  assert.match(html, /INFORME CANÓNICO/);
});
