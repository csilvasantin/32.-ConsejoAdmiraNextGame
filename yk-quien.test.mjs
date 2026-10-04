import test from "node:test";
import assert from "node:assert/strict";
import "./yk-quien.js";

const Q = globalThis.YkQuien;
const NOW = Date.parse("2026-10-04T12:20:00Z");

test("el censo copia MATRIX_LINKS: consejero → deepagent, Reynolds sin agente", () => {
  assert.deepEqual(Q.COETANEOS.map(c => [c.quien, c.deepagent]), [
    ["Musk", "merovingio"],
    ["Huang", "cypher"],
    ["Shotwell", "trinity"],
    ["Porat", "oraculo"],
    ["Lasseter", "mouse"],
    ["Ive", "arquitecto"],
    ["Ratti", "link"],
    ["Reynolds", null]
  ]);
  assert.deepEqual(Q.LEYENDAS.map(c => c.quien), ["Wozniak", "Jobs", "Lucas", "Disney"]);
  assert.equal(Q.deepagentOf("Musk").label, "Merovingio");
  assert.equal(Q.deepagentOf("Huang").label, "Cypher");
  assert.equal(Q.deepagentOf("Porat").label, "Oráculo");
  assert.equal(Q.deepagentOf("Reynolds"), null);
  assert.equal(Q.deepagentOf("Jobs"), null);
  assert.deepEqual(Q.DEEPAGENTS.map(d => d.quien), [
    "Neo", "Trinity", "Morfeo", "Oráculo", "Smith", "Cypher", "Merovingio", "Niobe", "Link", "Mouse", "Arquitecto", "Switch"
  ]);
});

test("normaliza acentos, mayúsculas, apellidos de máquina y sufijos GrokBot", () => {
  assert.equal(Q.canon("Oráculo"), Q.canon("Oraculo"));
  assert.equal(Q.canon("ORÁCULO"), "oraculo");
  assert.equal(Q.canon("MorfeoMacMini"), "morfeo");
  assert.equal(Q.canon("NeoMBP14"), "neo");
  assert.equal(Q.canon("NEOMBP14"), "neo");
  assert.equal(Q.canon("MuskGrokBot"), "musk");
  assert.equal(Q.canon("status-web · JobsGrokBot"), "jobs");
  assert.equal(Q.canon("Elon Musk"), "musk");
  assert.equal(Q.canon("Jensen Huang"), "huang");
  assert.equal(Q.canon("MerovingioGrokBotBox"), "merovingio");
  assert.equal(Q.canon("el Merovingio"), "merovingio");
});

test("ArquitectoCursorCloud no es el Arquitecto de Jony", () => {
  assert.equal(Q.canon("Arquitecto"), "arquitecto");
  assert.equal(Q.canon("ArquitectoCursorCloud"), "arquitectocursorcloud");
  assert.equal(Q.canon("elarquitectocursorcloud"), "arquitectocursorcloud");
  const ive = { tipo: "consejeros", quien: "Ive" };
  assert.equal(Q.itemMatches({ assignee: "Arquitecto" }, ive), true);
  assert.equal(Q.itemMatches({ assignee: "ArquitectoCursorCloud" }, ive), false);
  assert.equal(Q.itemMatches({ executor: "ArquitectoCursorCloud" }, { tipo: "deepagents", quien: "Arquitecto" }), false);
});

test("un consejero enseña su trabajo y el de su deepagent, con la insignia vía", () => {
  const musk = { tipo: "consejeros", quien: "Musk" };
  assert.equal(Q.itemMatches({ target_persona: "MuskGrokBot" }, musk), true);
  assert.equal(Q.itemMatches({ assignee: "Merovingio" }, musk), true);
  assert.equal(Q.itemMatches({ _agents: ["NeoMBP14"] }, musk), false);
  assert.equal(Q.viaLabel({ assignee: "Merovingio" }, musk), "vía Merovingio");
  assert.equal(Q.viaLabel({ target_persona: "Elon Musk" }, musk), "");
  assert.equal(Q.viaLabel({ from_name: "status-web · JobsGrokBot" }, { tipo: "consejeros", quien: "Jobs" }), "");
  assert.equal(Q.itemMatches({ from_name: "status-web · JobsGrokBot", assignee: "" }, { tipo: "consejeros", quien: "Jobs" }), true);
  assert.equal(Q.itemMatches({ executor: "Oraculo", agent_identity: "Oráculo" }, { tipo: "consejeros", quien: "Porat" }), true);
  assert.equal(Q.viaLabel({ executor: "Oráculo" }, { tipo: "consejeros", quien: "Porat" }), "vía Oráculo");
});

test("la pestaña DeepAgents suma el censo estático y las personas vistas", () => {
  const chips = Q.deepagentChips(["WhiteRabbit", "NeoMBP14", "MuskGrokBot", "PersefoneMacMini", "Switch"]);
  const ids = chips.map(c => c.id);
  assert.equal(ids.indexOf("neo"), 0);
  assert.ok(ids.includes("switch"));
  assert.ok(ids.includes("whiterabbit"));
  assert.ok(ids.includes("persefone"));
  assert.equal(ids.filter(id => id === "neo").length, 1);
  assert.equal(ids.includes("musk"), false);
});

test("la selección vive en la URL y gana a localStorage", () => {
  const stored = JSON.stringify({ tipo: "deepagents", quien: "Neo" });
  assert.deepEqual(Q.readSelection("?quien=Musk&tipo=consejeros", stored), { tipo: "consejeros", quien: "Musk" });
  assert.deepEqual(Q.readSelection("?quien=oraculo&tipo=deepagents", stored), { tipo: "deepagents", quien: "Oráculo" });
  assert.deepEqual(Q.readSelection("", stored), { tipo: "deepagents", quien: "Neo" });
  assert.deepEqual(Q.readSelection("?tipo=todos", stored), { tipo: "todos", quien: "" });
  assert.equal(Q.applyQuery("?day=2026-10-04&quien=Neo&tipo=deepagents", { tipo: "consejeros", quien: "Musk" }), "?quien=Musk&tipo=consejeros&day=2026-10-04");
  assert.equal(Q.applyQuery("?day=2026-10-04&quien=Musk&tipo=consejeros", { tipo: "todos", quien: "" }), "?day=2026-10-04");
});

test("la ficha de la persona cuenta estados, ordena lo reciente y dice la última cerrada", () => {
  const selection = { tipo: "consejeros", quien: "Huang" };
  const view = Q.personView({
    selection,
    now: NOW,
    encargos: [
      { id: 1, target_persona: "HuangGrokBot", status: "pending", text: "mirar el sello", ts: NOW / 1000 - 120 },
      { id: 2, target_persona: "Cypher", status: "in_progress", text: "publicar", ts: NOW / 1000 - 30 },
      { id: 3, target_persona: "Cypher", status: "done", text: "cerrar el parte", done_at: NOW / 1000 - 7200 },
      { id: 4, target_persona: "Neo", status: "ack", text: "no es de Huang", ts: NOW / 1000 }
    ],
    misiones: [
      { id: "FLT-9", inbox_id: 2, assignee: "Cypher", status: "in_progress", subject: "duplicada del encargo", updated_at: NOW },
      { id: "FLT-8", assignee: "Huang", status: "blocked", subject: "esperando credencial", updated_at: NOW - 60000 }
    ],
    informes: [
      { id: "a", executor: "Cypher", report: "parte viejo", updated_at: NOW - 5000 },
      { id: "b", _executor: "HuangGrokBot", report: "parte nuevo", updated_at: NOW - 1000 }
    ]
  });
  assert.equal(view.title, "Huang");
  assert.equal(view.full, "Jensen Huang");
  assert.equal(view.deepagent.label, "Cypher");
  assert.deepEqual(view.counts, { pendiente: 1, ack: 0, en_curso: 1, bloqueada: 1, hecha: 1 });
  assert.equal(view.ultima, "última misión cerrada hace 2 h");
  assert.equal(view.misiones[0].titulo, "publicar");
  assert.equal(view.misiones[0].via, "vía Cypher");
  assert.equal(view.misiones.some(item => item.id === "FLT-9"), false);
  assert.deepEqual(view.informes.map(item => item.id), ["b", "a"]);
  assert.equal(view.misiones[0].statusLabel, "en curso");
});
