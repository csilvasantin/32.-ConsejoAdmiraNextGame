/*
 * highscore-bando.js — ¿quién hizo esto: un consejero o un DeepAgent?
 *
 * El Highscore no recibe ningún campo que lo diga: /highscore/daily, el
 * histórico y los tiempos por encargo solo traen el nombre (y a veces la
 * máquina). Aquí se clasifica con la lista de sillas y deepagents de
 * mcp/server/src/sillas.js, que es un módulo del servidor MCP y el navegador
 * no puede importar: esta tabla es su copia y highscore-bando.test.mjs falla
 * si deja de coincidir. Una silla nueva se añade ALLÍ y se copia aquí.
 */
(function (root) {
  "use strict";
  // Copia de SILLAS (nombre → alias y deepagent). El orden es el de sillas.js.
  var SILLAS = {
    Wozniak: { alias: ["MBAPlata", "MBA Plata"], deepagent: "", maquina: "MacBookAirPlata" },
    Jobs:    { alias: ["MBAAzul", "MBA Azul", "Luna", "admira-macbookairluna"], deepagent: "", maquina: "MacBookAirAzul" },
    Lucas:   { alias: ["MBARosa", "MBA Rosa"], deepagent: "", maquina: "MacBookAirRosa" },
    Disney:  { alias: ["MBACrema", "MBA Crema", "Carla", "admira-macbook-carla"], deepagent: "", maquina: "MacBookAirCrema" },
    Musk:    { alias: ["Elon", "Elon Musk"], deepagent: "Merovingio", maquina: "GrokBot" },
    Huang:   { alias: ["Jensen", "Jensen Huang"], deepagent: "Cypher", maquina: "GrokBot" },
    Y:       { alias: [], deepagent: "", maquina: "GrokBot" }
  };
  // Nombres de pila con los que el marcador ya nombraba a dos sillas (Woz, Walt).
  var APODOS = { woz: "Wozniak", walt: "Disney" };
  // DeepAgents de la flota. Los de sillas.js (Merovingio, Cypher) más el resto
  // del elenco que cita yk-quien.js.
  var DEEPAGENTS = ["Neo", "Trinity", "Morfeo", "Oraculo", "Smith", "Cypher", "Merovingio",
    "Niobe", "Link", "Mouse", "Arquitecto", "Switch"];
  var ALIAS_DEEP = { oracle: "Oraculo", architect: "Arquitecto" };
  // Apellido de máquina pegado al nombre (WozniakGrokBot, NeoMBP16, SmithMini…).
  var MAQUINA_RE = /SINMAQ|CursorCloud|GrokBotBox|GrokBot|MacBook\s*(?:Pro|Air)\s*\w*|MacMini|Mini|MBA(?:Azul|Plata|Rosa|Crema|16)|MBP(?:Negro14|14|16)?|Negro14|Air16/gi;

  function plano(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  // «WozniakGrokBot», «Wozniak @ GrokBot», «Elon Musk» → nombre sin máquina, en plano.
  function persona(nombre) {
    var crudo = String(nombre || "").split("@")[0].split("·")[0];
    return plano(crudo.replace(MAQUINA_RE, " "));
  }
  function silla(nombre) {
    var p = persona(nombre);
    if (!p) return null;
    var nombres = Object.keys(SILLAS), i, j;
    for (i = 0; i < nombres.length; i++) {
      var clave = plano(nombres[i]);
      if (p === clave || (clave.length >= 3 && p.indexOf(clave) >= 0)) return nombres[i];
    }
    for (i = 0; i < nombres.length; i++) {
      var alias = SILLAS[nombres[i]].alias || [];
      for (j = 0; j < alias.length; j++) if (plano(alias[j]) === p) return nombres[i];
    }
    return APODOS[p] || null;
  }
  function deepagent(nombre) {
    var p = persona(nombre);
    if (!p || silla(nombre)) return null;
    for (var i = 0; i < DEEPAGENTS.length; i++) if (p.indexOf(plano(DEEPAGENTS[i])) === 0) return DEEPAGENTS[i];
    for (var a in ALIAS_DEEP) if (p.indexOf(a) === 0) return ALIAS_DEEP[a];
    return null;
  }
  // Todo lo que no es una silla cuenta como agente: un DeepAgent recién llegado
  // no desaparece del marcador por no estar aún en la lista.
  function bando(nombre) { return silla(nombre) ? "consejeros" : "agentes"; }
  function admite(vista, nombre) { return bando(nombre) === (vista === "consejeros" ? "consejeros" : "agentes"); }

  var api = { SILLAS: SILLAS, CONSEJEROS: Object.keys(SILLAS), DEEPAGENTS: DEEPAGENTS.slice(),
    VISTAS: ["agentes", "consejeros"], silla: silla, deepagent: deepagent, bando: bando, admite: admite, persona: persona };
  root.HsBando = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
