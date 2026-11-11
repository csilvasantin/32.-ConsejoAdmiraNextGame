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
  // El reconocimiento suele partir «hola» en «o la» u «ola»: se recompone.
  function limpiaSaludo(t) { return String(t || "").replace(/^(?:o la|oh la|o ya|hora)\b/, "hola").replace(/^ola\b/, "hola"); }

  function despertar(texto) {
    var t = limpiaSaludo(norm(texto)).replace(/\bad mira\b/g, "admira").replace(/\bal mira\b/g, "almira");
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
    var m = buscarCon(frase);
    return m ? m.persona : null;
  }
  // Primer consejero nombrado (alias más largo en la posición más temprana) y lo que va detrás.
  function buscarCon(frase) {
    var f = " " + frase + " ", mejor = null;
    for (var i = 0; i < INDICE.length; i++) {
      var pos = f.indexOf(" " + INDICE[i][0] + " ");
      if (pos < 0) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && INDICE[i][0].length > mejor.alias.length))
        mejor = { pos: pos, alias: INDICE[i][0], persona: INDICE[i][1] };
    }
    if (!mejor) return null;
    var resto = f.slice(mejor.pos + mejor.alias.length + 2).trim();
    // apellido pegado al nombre ya contado («steve jobs» si casó «steve»)
    var ap = mejor.persona.toLowerCase().split(" ").pop();
    if (resto.split(" ")[0] === ap) resto = resto.split(" ").slice(1).join(" ");
    return { persona: mejor.persona, resto: limpiaResto(resto) };
  }
  // Lo que sigue al nombre es la primera pregunta si tiene contenido (≥ 2 palabras útiles).
  function limpiaResto(r) {
    r = String(r || "").replace(/^(?:(?:por favor|porfa|oye|vale|bueno|pues|y|eh|mira)\b\s*)+/, "").replace(/\b(?:por favor|porfa)$/, "").trim();
    return r.split(" ").filter(Boolean).length >= 2 ? r : "";
  }
  // «hola Steve…», «oye Elon…»: saludo + nombre despierta y elige a la vez.
  function saludoNombre(texto) {
    var t = limpiaSaludo(norm(texto)), w = t.split(" ");
    if (SALUDOS.indexOf(w[0]) < 0 || w.length < 2) return null;
    var m = buscarCon(w.slice(1).join(" "));
    if (!m) return null;
    // el nombre tiene que ir justo detrás del saludo (no «hola, quiero saber de Elon…»)
    var tras = w.slice(1).join(" ");
    return (" " + tras + " ").indexOf(" " + ALIAS[m.persona].map(norm).filter(function (a) { return (" " + tras + " ").indexOf(" " + a + " ") === 0; })[0] + " ") === 0 ? m : null;
  }
  // «quiero hablar con X <pregunta>» / «con X» / «X» → { persona, resto }
  function consejeroCon(texto) {
    var t = norm(texto);
    if (!t) return null;
    var m = t.match(/\b(?:hablar|habla|hablo|charlar|pasame|pasa|ponme|pon|conecta|conectame|llama|llamame|quiero|con|a)\b(?: (?:con|a|al|la|el))? (.+)$/);
    return (m && buscarCon(m[1])) || buscarCon(t);
  }
  // «quiero hablar con X», «pásame con X», «ponme a X», o solo el nombre.
  function consejero(texto) { var m = consejeroCon(texto); return m ? m.persona : null; }
  // Solo con verbo de cambio explícito y el nombre en las 4 palabras siguientes:
  // «cambia a Woz», «pásame con Elon», «ahora con Disney», «quiero hablar con Jobs».
  function cambio(texto) {
    var t = norm(texto);
    var m = t.match(/\b(?:cambia|cambiar|cambiame|cambio|pasame|ponme|quiero hablar|hablar|ahora con|ahora a|mejor con)\b(?: (?:a|con|al|la|el|ahora|mejor))* (.+)$/);
    if (!m) return null;
    return buscar(m[1].split(" ").slice(0, 4).join(" "));
  }
  function cambioCon(texto) {
    var p = cambio(texto); if (!p) return null;
    var c = buscarCon(norm(texto));
    return { persona: p, resto: c && c.persona === p ? c.resto : "" };
  }
  var ADIOS = /\b(gracias|muchas gracias|adios|hasta luego|hasta pronto|nada mas|eso es todo|terminar|termina|para ya|duermete|a dormir|chao|ciao|bye)\b/;
  function despedida(texto) { return ADIOS.test(norm(texto)); }

  // Máquina de estados. estado: { fase: "dormido"|"eligiendo"|"conversando", persona }
  // «conectar» puede traer «pregunta»: lo que se dijo detrás del nombre, para enviarlo ya.
  function conectar(m) { var r = { accion: "conectar", persona: m.persona }; if (m.resto) r.pregunta = m.resto; return r; }
  // Recupera del texto original (con tildes y mayúsculas) las últimas palabras que ocupan «resto».
  function original(texto, resto) {
    var n = String(resto || "").split(" ").filter(Boolean).length, w = String(texto || "").trim().split(/\s+/);
    return n && w.length >= n ? w.slice(w.length - n).join(" ") : resto;
  }
  function interpretar(estado, texto) {
    var r = interpretar0(estado, texto);
    if (r.pregunta) r.pregunta = original(texto, r.pregunta);
    if (r.accion === "preguntar") r.texto = original(texto, r.texto);
    return r;
  }
  function interpretar0(estado, texto) {
    var fase = (estado && estado.fase) || "dormido", t = norm(texto);
    if (!t) return { accion: "nada" };
    var actual = estado && estado.persona;
    if (fase === "dormido") {
      var d = despertar(t);
      if (d.ok) { var p = d.resto ? consejeroCon(d.resto) : null; return p ? conectar(p) : { accion: "despierta" }; }
      var sn = saludoNombre(t);
      return sn ? conectar(sn) : { accion: "nada" };
    }
    if (fase === "eligiendo") {
      if (despedida(t) && t.split(" ").length <= 6) return { accion: "dormir" };
      var w = despertar(t); if (w.ok) t = norm(w.resto) || t;
      var q = saludoNombre(t) || consejeroCon(t);
      return q ? conectar(q) : { accion: "no-entiendo", texto: t };
    }
    // conversando
    var c = cambioCon(t);
    if (c && c.persona !== actual) return conectar(c);
    var h = despertar(t);
    if (h.ok) {
      var r = h.resto ? consejeroCon(h.resto) : null;
      if (r && r.persona !== actual) return conectar(r);
      if (r && r.resto) return { accion: "preguntar", persona: actual, texto: r.resto };
      if (!h.resto) return { accion: "despierta" };
    }
    var s2 = saludoNombre(t);
    if (s2 && s2.persona !== actual) return conectar(s2);
    if (s2 && s2.resto) return { accion: "preguntar", persona: actual, texto: s2.resto };
    if (despedida(t) && t.split(" ").length <= 6) return { accion: "dormir" };
    return { accion: "preguntar", persona: actual, texto: String(texto || "").trim() };
  }

  // Imágenes en una respuesta del hilo (solo texto): enlaces a imagen, ![](url) y <svg>…</svg>.
  // Devuelve el texto para leer en voz alta (sin ellas) y la lista de imágenes a mostrar.
  function extraerMedios(texto) {
    var t = String(texto || ""), imgs = [], vistos = {};
    function add(src, tipo) { if (!vistos[src]) { vistos[src] = 1; imgs.push({ src: src, tipo: tipo }); } }
    t = t.replace(/<svg[\s\S]*?<\/svg>/gi, function (svg) { add(svg, "svg"); return " "; });
    t = t.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, function (_, u) { add(u, "url"); return " "; });
    t = t.replace(/https?:\/\/[^\s<>"')\]]+/g, function (u) {
      var limpio = u.replace(/[.,;:!?]+$/, "");
      if (/\.(?:png|jpe?g|gif|webp|svg|avif)(?:[?#][^\s]*)?$/i.test(limpio) || /\/media\/fleet\/|imagedelivery\.net|\/images?\//i.test(limpio)) { add(limpio, "url"); return " "; }
      return u;
    });
    var hablar = t.replace(/https?:\/\/\S+/g, "enlace").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
    return { texto: hablar, imagenes: imgs };
  }

  var api = { norm: norm, ALIAS: ALIAS, despertar: despertar, consejero: consejero, consejeroCon: consejeroCon, saludoNombre: saludoNombre, extraerMedios: extraerMedios, cambio: cambio, despedida: despedida, interpretar: interpretar, lev: lev };
  root.HolaIntent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
