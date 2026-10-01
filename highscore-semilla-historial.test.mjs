import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// «Cypher · sin registro» (0 pts) junto a la fila buena: el histórico trae «CypherGrokBotBox»
// sin machine y la semilla de Semana/Mes abría una fila sin equipo (CypherSINMAQ).
const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8"), sandbox);
const id = sandbox.ykAgentIdentity;
const start = html.indexOf("function hsSemillaIdentidad(");
assert.notEqual(start, -1, "falta hsSemillaIdentidad");
const end = html.indexOf("\n  }\n", start) + 4;
const semilla = new Function("function normaliza(v){return String(v==null?\"\":v).trim();}\n" +
  html.slice(start, end) + "\nreturn hsSemillaIdentidad;")();
const clave = (agent, machine) => {           // la misma clave que fila()/datosId()
  const p = id.parse(agent), base = p.persona || agent;
  return id.key(base) + "|" + (id.suffix(machine) || p.suffix || "");
};

test("CypherGrokBotBox del histórico cae en la misma fila que el diario (Cypher@GrokBotBox)", () => {
  const s = semilla("CypherGrokBotBox", undefined, id);
  assert.deepEqual({ ...s }, { agent: "Cypher", machine: "GrokBotBox" });
  assert.equal(clave(s.agent, s.machine), clave("Cypher", "GrokBotBox"));
  assert.notEqual(clave(s.agent, s.machine), "cypher|");
});

test("otros apellidos largos y casos que no se tocan", () => {
  assert.equal(clave(...Object.values(semilla("MerovingioGrokBotBox", "", id))), clave("Merovingio", "GrokBotBox"));
  assert.equal(clave(...Object.values(semilla("TrinityMacBookProNegro14", "", id))), clave("Trinity", "MacBookProNegro14"));
  assert.deepEqual({ ...semilla("NeoMBP14", "", id) }, { agent: "NeoMBP14", machine: "" });       // parse() ya lo separa
  assert.deepEqual({ ...semilla("Arquitecto", "", id) }, { agent: "Arquitecto", machine: "" });   // sin equipo: igual que antes
  assert.deepEqual({ ...semilla("Cypher", "GrokBotBox", id) }, { agent: "Cypher", machine: "GrokBotBox" });
  assert.deepEqual({ ...semilla("JobsGrokBot", "", id) }, { agent: "JobsGrokBot", machine: "" });
  assert.deepEqual({ ...semilla("", "", id) }, { agent: "", machine: "" });
});
