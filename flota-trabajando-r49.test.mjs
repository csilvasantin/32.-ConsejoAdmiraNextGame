import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas } from "./flota-trabajando-lib.mjs";
import { normalizarPulso, aplicarPulso } from "./consumos-pulso-lib.mjs";

const T = 1792000000;
test("r49: Trinity con tokens en el MacStudio no sale en el MBP16 por un process_snapshot de la app abierta allí", () => {
  const presencia = [{ persona: "Trinity", machine: "MacBook Pro 16", source: "process_snapshot", host: "app", runtime: "Codex", session_id: "desktop:codex", updated: T - 10, verified: true }];
  const velocidad = { porAgente: [{ agente: "Trinity", motor: "codex", tokHora: 0, tokHoy: 4e6, maquina: "MacStudio", ultimoEvento: new Date((T - 3600) * 1000).toISOString() }] };
  assert.equal(tarjetas({ presencia, velocidad, ahoraS: T }).find((x) => x.agente === "Trinity").maquina, "MacStudio");
});

test("r49: agentesCompletos borra del documento de la máquina los agentes que ya no declara", () => {
  const ahora = T * 1000;
  const p1 = normalizarPulso({ maquina: "MacBookPro16", agentes: [{ agente: "Neo", motor: "claude", tokHoy: 0 }, { agente: "Trinity", motor: "codex", tokHoy: 0 }] }).pulso;
  let { doc } = aplicarPulso(null, p1, ahora - 120e3);
  const sinFlag = normalizarPulso({ maquina: "MacBookPro16", agentes: [{ agente: "Trinity", motor: "codex", tokHoy: 0 }] }).pulso;
  ({ doc } = aplicarPulso(doc, sinFlag, ahora - 60e3));
  assert.deepEqual(Object.keys(doc.agentes).sort(), ["Neo", "Trinity"]);
  const conFlag = normalizarPulso({ maquina: "MacBookPro16", agentesCompletos: true, agentes: [], superficies: [{ tipo: "app", app: "Codex", maquina: "MacBookPro16" }] });
  assert.equal(conFlag.ok, true, JSON.stringify(conFlag));
  ({ doc } = aplicarPulso(doc, conFlag.pulso, ahora));
  assert.deepEqual(Object.keys(doc.agentes), []);
});
