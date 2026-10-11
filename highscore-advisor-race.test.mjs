import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const window = {};
for (const file of ["highscore-bando.js", "highscore-race.js", "yk-agent-identity.js"])
  vm.runInNewContext(read(file), { window });
const B = window.HsBando, R = window.YkHighscoreRace, identity = window.ykAgentIdentity;
const DAY = "2026-10-11", NOW = Date.parse(DAY + "T13:30:00Z");
const dayOf = value => new Intl.DateTimeFormat("en-CA", {
  timeZone:"Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit"
}).format(new Date(value));
const options = { day:DAY, dayOf, advisor:B.silla, dailyTitle:"Trabajo verificado de hoy", orderTitle:"Encargo" };
const daily = { day:DAY, scores:[
  { agent:"Wozniak", machine:"GrokBot", missions:7, tasks:3, points:325 },
  { agent:"Disney", machine:"GrokBot", missions:1, tasks:3, points:85 },
  { agent:"Musk", machine:"GrokBot", missions:1, tasks:0, points:40 },
  { agent:"NeoMBP16", missions:1, points:40 }
] };
const list = rows => Array.from(rows, row => row.agente).sort();

test("Wozniak 7/3/325, Disney y Musk corren por el trabajo de hoy sin latido de terminal", () => {
  const source = { daily }, before = JSON.stringify(source);
  const rows = R.advisorRows(source, options);
  assert.deepEqual(list(rows), ["Disney", "Musk", "Wozniak"]);
  for (const row of rows) {
    assert.equal(row.state, "running");
    assert.equal(row.raceBasis, "advisor_daily");
    assert.equal(row.reference, "", "el resumen diario no puede pedir un bonus de misión");
    assert.equal(row.startedAt, 0, "los totales diarios no inventan una hora de inicio");
    assert.equal(row.elapsedMs, null);
  }
  assert.equal(JSON.stringify(source), before, "la carrera no altera los puntos de Yokup");
});

test("misión, tarea y encargo in_progress admiten consejeros sin puntos ni presencia", () => {
  const rows = R.advisorRows({
    missions:[{ persona:"WozniakGrokBot", status:"in_progress", id:"FLT-1", subject:"Trabajo Woz", live_at:NOW - 60000 }],
    tasks:[{ assignee:"DisneyGrokBot", status:"in_progress", mission_id:"FLT-2", code:"a", title:"Trabajo Disney", updated_at:NOW - 86400000 }],
    inbox:[{ persona:"Elon Musk", estado:"in_progress", id:5700, inicio:NOW / 1000 - 120, fin:null, en_curso:120 }]
  }, options);
  assert.deepEqual(list(rows), ["Disney", "Musk", "Wozniak"]);
  assert.equal(rows.find(row => row.agente === "Wozniak").reference, "FLT-1");
  assert.equal(rows.find(row => row.agente === "Disney").reference, "FLT-2:a");
  assert.equal(rows.find(row => row.agente === "Musk").startedAt, NOW - 120000);
  assert.ok(rows.every(row => row.raceBasis === "advisor_in_progress"));
});

test("Wozniak y WozniakGrokBot son una silla y la misión actual prevalece al resumen diario", () => {
  const rows = R.advisorRows({ daily, missions:[
    { agent:"WozniakGrokBot", status:"in_progress", id:"FLT-current", subject:"Misión actual", updated_at:NOW }
  ], inbox:[{ persona:"Woz", estado:"in_progress", id:1, inicio:NOW / 1000 }] }, options);
  assert.equal(rows.length, 3);
  const woz = rows.find(row => row.agente === "Wozniak");
  assert.equal(woz.reference, "FLT-current");
  assert.equal(woz.title, "Misión actual");
});

test("la tarea pertenece al owner que trabajó, con sub/infra dentro de la familia del assignee", () => {
  const rows = R.advisorRows({ tasks:[
    { assignee:"NeoMBP16", owner:"WozniakGrokBot", status:"in_progress", mission_id:"FLT-1", code:"a" },
    { assignee:"MuskGrokBot", owner:"NeoMBP16", status:"in_progress", mission_id:"FLT-2", code:"a" },
    { assignee:"DisneyGrokBot", owner:"subagente", status:"in_progress", mission_id:"FLT-3", code:"a" },
    { assignee:"HuangGrokBot", owner:"infra", status:"in_progress", mission_id:"FLT-4", code:"a" }
  ] }, options);
  assert.deepEqual(list(rows), ["Disney", "Huang", "Wozniak"]);
  assert.equal(rows.find(row => row.agente === "Wozniak").reference, "FLT-1:a");
});

test("active-work normalizado conserva tiempos reales y una misión pública confirma assigned_stale sin puntos del día", () => {
  const rows = R.advisorRows({ activeWork:[
    { agente:"DisneyGrokBot", kind:"task", state:"running", reference:"FLT-2:a", startedAt:NOW - 60000, at:NOW - 1000 },
    { agente:"WozniakGrokBot", kind:"mission", state:"assigned_stale", reference:"FLT-1", startedAt:NOW - 120000, at:NOW - 5000 },
    { agente:"MuskGrokBot", kind:"mission", state:"running", reference:"FLT-ended", endedAt:NOW }
  ], missions:[{ assignee:"WozniakGrokBot", id:"FLT-1", status:"in_progress", subject:"Misión pública" }] }, options);
  assert.deepEqual(list(rows), ["Disney", "Wozniak"]);
  assert.equal(rows.find(row => row.agente === "Disney").startedAt, NOW - 60000);
  assert.equal(rows.find(row => row.agente === "Wozniak").startedAt, NOW - 120000);
  assert.equal(rows.find(row => row.agente === "Wozniak").at, NOW - 5000);
});

test("fuente caída o trabajo antiguo, abierto sin empezar, resuelto o solo bonus no crean una carrera", () => {
  assert.equal(R.advisorRows(null, options).length, 0);
  const rows = R.advisorRows({
    daily:{ day:"2026-10-10", scores:daily.scores },
    missions:[{ persona:"Wozniak", status:"open" }, { persona:"Disney", status:"resolved" }],
    tasks:[{ assignee:"Musk", status:"done", updated_at:NOW - 86400000 }],
    inbox:[{ persona:"Wozniak", estado:"pending", id:1 }, { persona:"Disney", estado:"done", id:2 },
      { persona:"Musk", estado:"in_progress", id:3, fin:NOW / 1000 }],
    activeWork:[{ agent:"Wozniak", kind:"mission", state:"last_work" }, { agent:"Musk", kind:"mission", state:"assigned_stale" }]
  }, options);
  assert.equal(rows.length, 0);
  assert.equal(R.advisorRows({ daily:{ day:DAY, scores:[{ agent:"Wozniak", points:1, race_bonus_points:1 }] } }, options).length, 0);
});

test("el día de Madrid, no el selector de semana/mes, limita la participación diaria", () => {
  const rows = R.advisorRows({ tasks:[
    { assignee:"Disney", status:"done", updated_at:Date.parse("2026-10-10T22:30:00Z") },
    { assignee:"Musk", status:"done", updated_at:Date.parse("2026-10-10T21:30:00Z") }
  ] }, options);
  assert.deepEqual(list(rows), ["Disney"]);
});

const html = read("highscore.html");
function source(name) {
  const start = html.indexOf(`function ${name}(`), brace = html.indexOf("{", start);
  assert.ok(start >= 0, name);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < html.length; i++) {
    const char = html[i];
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if ('"\'`'.includes(char)) { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(name);
}

test("la animación diaria nunca llama al mecanismo de bonus, incluso si el servidor aceptase una referencia vacía", () => {
  let calls = 0;
  const confirm = new Function("bonusCarrera", source("confirmaBonusCarrera") + "; return confirmaBonusCarrera;")({
    finish() { calls++; throw new Error("un resumen diario no debe pedir bonus"); }
  });
  confirm({
    getAttribute(name) { return ({ "data-work-state":"running", "data-race-basis":"advisor_daily", "data-race-mission":"" })[name] || ""; },
    querySelector() { throw new Error("debe salir antes de consultar un bonus"); }
  });
  assert.equal(calls, 0);
});

test("el listado público in_progress pagina solo si total lo pide y se limpia si falla", async () => {
  const datos = { misionesConsejeros:[] }, requested = [];
  let fail = false;
  const first = Array.from({length:498}, (_, i) => ({ id:"AGENT-" + i, assignee:"NeoMBP16", status:"in_progress" }));
  first.push({ id:"FLT-WOZ", assignee:"WozniakGrokBot", status:"in_progress" });
  first.push({ id:"FLT-CLOSED", assignee:"MuskGrokBot", status:"resolved" });
  const api = new Function("window", "datos", "pedirDesde", `
    var YK = "https://api.yokup.com", advisorMissionsRequest, listaCompletaCache = null;
    ${source("hsRefreshAdvisorMissions")}
    return hsRefreshAdvisorMissions;
  `)(window, datos, (_base, path) => {
    requested.push(path);
    if (fail) return Promise.reject(new Error("offline"));
    return Promise.resolve({ total:501, missions:path.endsWith("offset=0") ? first : [
      { id:"FLT-DISNEY", assignee:"DisneyGrokBot", status:"in_progress" }
    ] });
  });
  const pending = api();
  assert.equal(api(), pending, "dos refrescos concurrentes reutilizan la petición");
  await pending;
  assert.equal(requested.length, 2);
  assert.match(requested[0], /status=in_progress&limit=500&offset=0$/);
  assert.match(requested[1], /offset=500$/);
  assert.deepEqual(datos.misionesConsejeros.map(row => row.id), ["FLT-WOZ", "FLT-DISNEY"]);
  fail = true;
  await api();
  assert.deepEqual(datos.misionesConsejeros, [], "una lectura fallida no conserva la misión como ejecución verificada");
});

test("cambiar de bando libera inmediatamente la parrilla congelada antes de repintar", () => {
  const seen = [];
  const api = new Function("window", `
    var HS_BANDO = "agentes", listaCompletaCache = [], released = false;
    function liberaParrilla() { released = true; }
    function hsPintaBando() {}
    function pintaVistaFiltrada() { window.record(HS_BANDO, released); }
    var document = {dispatchEvent:function(){}}, CustomEvent = function(){};
    ${source("hsCambiaBando")}
    return hsCambiaBando;
  `)({ record:(...args) => seen.push(args) });
  api("consejeros");
  api("agentes");
  assert.deepEqual(seen, [["consejeros", true], ["agentes", true]]);
});

test("el filtro real de carriles conserva a consejeros con trabajo diario y mantiene la política de agentes", () => {
  const datos = { actividadMeta:daily, tareas:[], misiones:[], trabajos:[], tiempos:[], trabajando:[] };
  const api = new Function("window", "YkHighscoreRace", "datos", "claveDia", `
    function normaliza(value) { return String(value == null ? "" : value).trim(); }
    function hsText() { return "Trabajo verificado de hoy"; }
    function hsT(es) { return es; }
    function trabajosEnCurso() { return [{ key:"neombp16", agente:"NeoMBP16", state:"running", kind:"mission" }]; }
    ${["claveAgenteCarrera", "hsWorkIdentity", "personaCarrera", "latidoTrabajando", "trabajandoDe", "correDeVerdad", "faenaReal", "puntuaFaena", "unaFilaPorPersona", "trabajosConsejeros", "trabajosCarrera", "pistaEnVivo"].map(source).join("\n")}
    return { rows:trabajosCarrera, live:pistaEnVivo, runs:correDeVerdad };
  `)(window, R, datos, () => DAY);
  const rows = api.rows();
  assert.deepEqual(list(rows), ["DisneyGrokBot", "MuskGrokBot", "WozniakGrokBot"]);
  assert.ok(rows.every(api.live), "la puerta DeepAgents no elimina estas sillas");
  assert.equal(api.runs({ key:"neombp16", agente:"NeoMBP16", state:"running", kind:"mission" }), false);
  assert.equal(api.runs({ ...rows[0], cliPaused:true }), false);
  assert.deepEqual(list(rows.filter(row => B.admite("agentes", row.agente))), []);
  assert.equal(rows.filter(row => B.admite("consejeros", row.agente)).length, 3);
  datos.actividadMeta = { day:"2026-10-10", scores:daily.scores };
  assert.equal(api.rows().length, 0, "al cambiar el día no queda una carrera antigua viva");
});
