/* HOLA ADMIRA · intérprete de órdenes de voz (Lasseter · CCO, 11-11-2026).
 * Lógica pura, sin DOM: la usan /hola y node:test.
 *   despertar(texto)   → { ok, resto }  «Hola Admira» (ola admira, hola almira, hola admiral…)
 *   consejero(texto)   → persona o null  («quiero hablar con Jobs», «pásame a Elon»…)
 *   cambio(texto)      → persona o null  («cambia a Woz», «ahora con Disney»)
 *   despedida(texto)   → true si «gracias», «adiós», «hasta luego», «nada más»…
 *   interpretar(estado, texto) → { accion, persona?, texto? }  máquina de estados
 */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Alias por consejero (ya normalizados). El reconocimiento de voz en español
  // escribe los nombres ingleses como suenan: «yobs», «ilon», «wozniac»…
  var ALIAS = {
    "Steve Jobs":      ["steve jobs", "jobs", "yobs", "jops", "chops", "yops", "steve yobs", "stiv jobs", "estiv jobs", "estif jobs", "steve"],
    "Steve Wozniak":   ["steve wozniak", "wozniak", "wozniac", "woz", "woss", "vozniak", "bosniak", "wosniak"],
    "Tim Cook":        ["tim cook", "cook", "tim cuk", "tim kuk", "cuk"],
    "Warren Buffett":  ["warren buffett", "warren buffet", "buffett", "buffet", "bufet", "warren"],
    "Walt Disney":     ["walt disney", "disney", "disnei", "walt", "gualt disney", "walter disney"],
    "Dieter Rams":     ["dieter rams", "rams", "dieter", "diter rams", "ramps"],
    "Howard Schultz":  ["howard schultz", "schultz", "shultz", "howard", "jauard", "chultz"],
    "George Lucas":    ["george lucas", "lucas", "yorch lucas", "jorge lucas", "george"],
    "Elon Musk":       ["elon musk", "elon", "ilon", "elon mask", "musk", "mask", "ilon mask", "elon mus", "helon", "eelon", "elo musk"],
    "Jensen Huang":    ["jensen huang", "jensen", "huang", "yensen", "jenson", "juang", "wang", "jensen juan"],
    "Gwynne Shotwell": ["gwynne shotwell", "shotwell", "gwynne", "gwen", "guin", "guyn", "shotgüel", "shotuel", "gwen shotwell"],
    "Ruth Porat":      ["ruth porat", "porat", "ruth", "rut porat", "rut"],
    "John Lasseter":   ["john lasseter", "lasseter", "laseter", "lasetter", "yon lasseter", "jon lasseter", "john"],
    "Jony Ive":        ["jony ive", "jony", "johnny ive", "yoni ive", "jony aiv", "ive", "aiv", "yony"],
    "Carlos Ratti":    ["carlos ratti", "carlo ratti", "ratti", "rati", "ratty"],
    "Ryan Reynolds":   ["ryan reynolds", "reynolds", "ryan", "rayan", "raian", "reinolds", "renolds"]
  };
  // índice: alias → persona, de más largo a más corto (para que «steve jobs» gane a «steve»)
  var INDICE = [];
  Object.keys(ALIAS).forEach(function (p) { ALIAS[p].forEach(function (a) { INDICE.push([norm(a), p]); }); });
  INDICE.sort(function (a, b) { return b[0].length - a[0].length; });

  function contiene(frase, alias) {
    return (" " + frase + " ").indexOf(" " + alias + " ") >= 0;
  }

  // Distancia de edición pequeña para «admira» (admira, almira, adnira, admiral, admire…)
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  var SALUDOS = ["hola", "ola", "hello", "hey", "oye", "eh", "buenas", "holi", "hoya", "hora"];
  function esAdmira(w) {
    if (!w) return false;
    if (/^(admira|almira|adnira|admiral|admire|admir|almirar|admirar|ad mira)$/.test(w)) return true;
    return w.length >= 5 && w.length <= 8 && lev(w, "admira") <= 2 && /^a/.test(w);
  }
  function despertar(texto) {
    var t = norm(texto).replace(/\bad mira\b/g, "admira").replace(/\bal mira\b/g, "almira");
    var w = t.split(" ");
    for (var i = 0; i < w.length; i++) {
      // «hola admira…» (saludo delante) o «admira…» al principio de la frase
      var saludo = i > 0 && SALUDOS.indexOf(w[i - 1]) >= 0;
      var exacta = /^(admira|almira|admiral)$/.test(w[i]);
      if ((saludo && esAdmira(w[i])) || (i === 0 && exacta)) return { ok: true, resto: w.slice(i + 1).join(" ") };
    }
    return { ok: false, resto: "" };
  }

  function buscar(frase) {
    for (var i = 0; i < INDICE.length; i++) if (contiene(frase, INDICE[i][0])) return INDICE[i][1];
    return null;
  }
  // «quiero hablar con X», «pásame con X», «ponme a X», o solo el nombre.
  function consejero(texto) {
    var t = norm(texto);
    if (!t) return null;
    var m = t.match(/\b(?:hablar|habla|hablo|charlar|pasame|pasa|ponme|pon|conecta|conectame|llama|llamame|quiero|con|a)\b(?: (?:con|a|al|la|el))? (.+)$/);
    var p = m ? buscar(m[1]) : null;
    return p || buscar(t);
  }
  // Solo con verbo de cambio explícito y el nombre en las 4 palabras siguientes:
  // «cambia a Woz», «pásame con Elon», «ahora con Disney», «quiero hablar con Jobs».
  function cambio(texto) {
    var t = norm(texto);
    var m = t.match(/\b(?:cambia|cambiar|cambiame|cambio|pasame|ponme|quiero hablar|hablar|ahora con|ahora a|mejor con)\b(?: (?:a|con|al|la|el|ahora|mejor))* (.+)$/);
    return m ? buscar(m[1].split(" ").slice(0, 4).join(" ")) : null;
  }
  var ADIOS = /\b(gracias|muchas gracias|adios|hasta luego|hasta pronto|nada mas|eso es todo|terminar|termina|para ya|duermete|a dormir|chao|ciao|bye)\b/;
  function despedida(texto) { return ADIOS.test(norm(texto)); }

  // Máquina de estados. estado: { fase: "dormido"|"eligiendo"|"conversando", persona }
  function interpretar(estado, texto) {
    var fase = (estado && estado.fase) || "dormido", t = norm(texto);
    if (!t) return { accion: "nada" };
    if (fase === "dormido") {
      var d = despertar(t);
      if (!d.ok) return { accion: "nada" };
      var p = d.resto ? consejero(d.resto) : null;
      return p ? { accion: "conectar", persona: p } : { accion: "despierta" };
    }
    if (fase === "eligiendo") {
      if (despedida(t)) return { accion: "dormir" };
      var w = despertar(t); if (w.ok) t = norm(w.resto) || t;
      var q = consejero(t);
      return q ? { accion: "conectar", persona: q } : { accion: "no-entiendo", texto: t };
    }
    // conversando
    var c = cambio(t);
    if (c && c !== (estado && estado.persona)) return { accion: "conectar", persona: c };
    if (despedida(t) && t.split(" ").length <= 6) return { accion: "dormir" };
    var h = despertar(t);
    if (h.ok) { var r = h.resto ? consejero(h.resto) : null; if (r) return { accion: "conectar", persona: r }; if (!h.resto) return { accion: "despierta" }; }
    return { accion: "preguntar", persona: estado.persona, texto: String(texto || "").trim() };
  }

  var api = { norm: norm, ALIAS: ALIAS, despertar: despertar, consejero: consejero, cambio: cambio, despedida: despedida, interpretar: interpretar, lev: lev };
  root.HolaIntent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
