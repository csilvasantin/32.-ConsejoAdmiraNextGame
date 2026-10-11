// Interruptor Agentes / Consejeros del Highscore (encargo #5630).
// La clasificación sale de la lista de sillas de mcp/server/src/sillas.js: si
// allí entra una silla y aquí no, este test lo dice antes que el marcador.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { SILLAS } from "./mcp/server/src/sillas.js";

const lee = (f) => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const ventana = {};
vm.runInNewContext(lee("highscore-bando.js"), { window: ventana });
const B = ventana.HsBando;
const html = lee("highscore.html");

test("la copia del navegador coincide con sillas.js: mismas sillas, alias y deepagents", () => {
  assert.deepEqual([...B.CONSEJEROS], Object.keys(SILLAS));
  for (const [nombre, s] of Object.entries(SILLAS)) {
    assert.deepEqual([...B.SILLAS[nombre].alias], s.alias || [], nombre + ": alias");
    assert.equal(B.SILLAS[nombre].deepagent, s.deepagent || "", nombre + ": deepagent");
    if (s.deepagent) assert.ok(B.DEEPAGENTS.includes(s.deepagent), s.deepagent + " es DeepAgent");
  }
});

test("los nombres que trae el marcador caen en su bando", () => {
  for (const n of ["WozniakGrokBot", "JobsGrokBot", "LucasGrokBot", "DisneyGrokBot", "MuskGrokBot", "Musk",
    "ElonMusk", "Elon", "HuangGrokBot", "Jensen Huang", "Woz", "Walt"]) assert.equal(B.bando(n), "consejeros", n);
  for (const n of ["NeoMBP16", "NeoMBAAzul", "Neo", "TrinityMBP14", "TrinityGrokBotBox", "SmithMini", "OraculoMini",
    "Oráculo", "Morfeo", "MerovingioGrokBotBox", "CypherGrokBotBox", "NiobeMacMini", "Link", "Switch",
    "ArquitectoCursorCloud", "Trinity @ MacBook Pro 16"]) assert.equal(B.bando(n), "agentes", n);
});

test("el deepagent de una silla no es la silla: Merovingio y Cypher son agentes", () => {
  assert.equal(B.silla("MerovingioGrokBotBox"), null);
  assert.equal(B.deepagent("MerovingioGrokBotBox"), "Merovingio");
  assert.equal(B.deepagent("CypherGrokBotBox"), "Cypher");
  assert.equal(B.deepagent("WozniakGrokBot"), null);
});

test("un nombre desconocido cuenta como agente y nunca como consejero", () => {
  assert.equal(B.bando("TankMacMini"), "agentes");
  assert.equal(B.admite("consejeros", "TankMacMini"), false);
  assert.equal(B.admite("agentes", ""), true);
});

test("la página monta el interruptor frente al selector, en la misma barra, y nace en Agentes", () => {
  const barra = html.slice(html.indexOf('<h1 class="score-divider"'), html.indexOf("</h1>"));
  assert.ok(barra.indexOf('id="hsBando"') < barra.indexOf('id="podiumToggle"'), "el interruptor va antes del título");
  assert.ok(barra.indexOf('id="podiumToggle"') < barra.indexOf('id="highscorePeriod"'), "el periodo va después");
  assert.match(barra, /data-bando="agentes" aria-pressed="true"[^>]*data-en="Agents">Agentes</);
  assert.match(barra, /data-bando="consejeros" aria-pressed="false"[^>]*data-en="Advisors">Consejeros</);
  assert.match(html, /\.hs-bando\{position:absolute;left:4px/);
  assert.match(html, /<script src="\/highscore-bando\.js\?v=[^"]+"><\/script>/);
});

test("el filtro vive en el punto central y alcanza carriles, tiempos por encargo y el modal de días", () => {
  assert.match(html, /function aplicaAgentScope\(lista, requestedScope\) \{\s+if \(HS_BANDO === "consejeros"\)/);
  for (const trozo of ["if(!hsBandoAdmite(work.agente||work.agent||work.key))return;",
    "(datos.tiempos || []).filter(function (it) { return hsBandoAdmite(it && it.persona); })",
    "if (hsBandoAdmite(t.agent)) fila.por[t.agent]",
    "!x.agent || hsBandoAdmite(x.agent)"]) assert.ok(html.includes(trozo), trozo);
});

test("el Experto atiende /demo, /agentes y /consejeros sin tocar yk-frame, y deja pasar lo demás", () => {
  const cuerpo = html.slice(html.indexOf("function hsOrdenExperto("), html.indexOf("window.HsBandoVista"));
  const vistas = [];
  const orden = new Function("hsDemoBando", "hsCambiaBando", "hsT",
    cuerpo.slice(0, cuerpo.indexOf("document.addEventListener")) + "; return hsOrdenExperto;")(
    () => vistas.push("demo"), (v) => vistas.push(v), (es) => es);
  const dicho = [];
  for (const o of ["/demo", "demo", "/consejeros", "/advisors", "/agentes", "/agents"]) assert.equal(orden(o, (m) => dicho.push(m)), true, o);
  assert.deepEqual(vistas, ["demo", "demo", "consejeros", "consejeros", "agentes", "agentes"]);
  for (const o of ["/ayuda", "/idioma ENG", "/marca 84", "/demo mapa", "/foo", ""]) assert.equal(orden(o, () => {}), false, o);
  assert.ok(html.includes('classList.contains("yk-expert-cmd-form")'));
});

test("inglés: el resumen de Consejeros y los periodos que faltaban tienen traducción", () => {
  assert.ok(html.includes('"HORA": "HOUR", "SEMANA": "WEEK", "MES": "MONTH"'));
  assert.ok(html.includes('"Advisors: All · $1/$2$3"'));
});
