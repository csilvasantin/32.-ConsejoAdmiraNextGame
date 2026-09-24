import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(identitySource, sandbox);
const identity = sandbox.ykAgentIdentity;

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = html.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < html.length; index++) {
    const char = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

function api() {
  const names = [
    "hsAgentKey", "hsIsDeepAgentKey", "hsLaneDeepEligible", "hsDeepAgentKeys",
    "hsActiveAgentKeys", "claveAgenteCarrera", "trabajosDesdePresencia"
  ];
  const functions = names.map(functionSource).join("\n");
  return new Function("identity", `
    var window = { ykAgentIdentity: identity };
    var datos = { presencia: [], presenceNow: 0 };
    var DEEPAGENTS_NAME_RE = /^(neo|trinity|morfeo|oraculo|oracle|smith|arquitecto|architect)\\b/i;
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    ${functions}
    return {
      setPresence: function (rows, now) { datos.presencia = rows; datos.presenceNow = now; },
      fromPresence: trabajosDesdePresencia,
      active: hsActiveAgentKeys,
      laneOk: hsLaneDeepEligible,
      deep: hsIsDeepAgentKey
    };
  `)(identity);
}

test("DeepAgents y Niobe entran al carril; consejeros no", () => {
  const A = api();
  assert.equal(A.deep("SmithMacMini"), true);
  assert.equal(A.laneOk("NiobeMacMini"), true);
  assert.equal(A.deep("NiobeMacMini"), false, "Niobe no altera el ranking DeepAgents");
  assert.equal(A.laneOk("JobsGrokBot"), false);
  assert.equal(A.laneOk("WozniakGrokBot"), false);
  assert.equal(A.laneOk("DisneyGrokBot"), false);
  assert.equal(A.laneOk("LucasGrokBot"), false);
});

test("presencia verificada + focus genera una calle por agente (CLI incluido)", () => {
  const A = api();
  const now = 1_000_000;
  A.setPresence([
    { persona: "Smith", machine: "MacMini", host: "cli", runtime: "Grok", focus: "Player taza", task: "FLT-1",
      verified: 1, source: "process_snapshot", pid: 10, updated: now - 2, online: 1, declaration_state: "exact_surface", since: now - 100 },
    { persona: "Neo", machine: "MacMini", host: "app", runtime: "Claude", focus: "portal admira.tv", task: "",
      verified: 1, source: "process_snapshot", pid: 11, updated: now - 1, online: 1, declaration_state: "exact_surface", since: now - 50 },
    { persona: "Trinity", machine: "MacMini", host: "cli", runtime: "Claude", focus: "", task: "",
      verified: 1, source: "process_snapshot", pid: 12, updated: now - 1, online: 1, declaration_state: "unverified" },
    { persona: "Jobs", machine: "GrokBot", host: "app", runtime: "Grok", focus: "misión FLT", task: "x",
      verified: 1, source: "process_snapshot", pid: 13, updated: now - 1, online: 1, declaration_state: "exact_surface" },
    { persona: "Morfeo", machine: "MacMini", host: "cli", runtime: "Claude", focus: "", task: "",
      verified: 1, source: "process_snapshot", pid: 14, updated: now - 1, online: 1, declaration_state: "exact_surface" },
  ], now);
  const lanes = A.fromPresence();
  const keys = lanes.map((l) => l.key).sort();
  assert.deepEqual(keys, ["morfeomacmini", "neomacmini", "smithmacmini", "trinitymacmini"]);
  const smith = lanes.find((l) => l.key === "smithmacmini");
  assert.equal(smith.title, "Player taza");
  assert.equal(smith.sessionSurface, "cli");
  assert.equal(smith.activityReason, "presence_focus");
  assert.equal(smith.state, "running");
  const morfeo = lanes.find((l) => l.key === "morfeomacmini");
  assert.match(morfeo.title, /Claude|MacMini|latido/i);
  const trinity = lanes.find((l) => l.key === "trinitymacmini");
  assert.equal(trinity.activityReason, "presence_live");
  assert.equal(trinity.title, "Latido · Claude · MacMini");
});

test("active-work CLI running también entra en Activos (ya no solo APP)", () => {
  const works = [
    { key: "smithmacmini", agente: "SmithMacMini", state: "running", sessionSurface: "cli", cliPaused: false },
    { key: "neomacmini", agente: "NeoMacMini", state: "running", sessionSurface: "app", cliPaused: false },
  ];
  assert.deepEqual([...api().active([], identity, 0, works)].sort(), ["neomacmini", "smithmacmini"]);
});

test("el HTML declara el puente presencia→carriles", () => {
  assert.match(html, /function trabajosDesdePresencia\(/);
  assert.match(html, /presence_focus/);
  assert.match(html, /presence_live/);
  assert.match(html, /Latido · /);
  assert.match(html, /Carriles desde presencia verificada \+ focus/);
});
