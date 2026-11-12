/* Parser de comandos de voz para playlists (12-11-2026).
 * Misma idea que /dmz/control/demos/pedido.js: voz, texto y CLI producen el mismo comando.
 * No actúa sobre la locución de los consejeros (TTS): parseComando lo rechaza.
 * Lógica pura, sin DOM, para node:test y para /players.
 */
(function (root) {
  "use strict";

  var CMDS = {
    next:  { cmd: "next",  resumen: "siguiente pista",  etiqueta: "Siguiente" },
    prev:  { cmd: "prev",  resumen: "pista anterior",   etiqueta: "Anterior" },
    first: { cmd: "first", resumen: "primera pista",    etiqueta: "Primero" },
    last:  { cmd: "last",  resumen: "última pista",     etiqueta: "Último" }
  };

  // Alias ya pensados en forma normalizada (minúsculas, sin acentos).
  // De más largo a más corto se ordenan al cargar.
  var ALIAS = {
    "siguiente cancion de la playlist": "next",
    "siguiente cancion": "next",
    "siguiente pista": "next",
    "siguiente tema": "next",
    "cancion siguiente": "next",
    "pista siguiente": "next",
    "tema siguiente": "next",
    "pasa a la siguiente cancion": "next",
    "pasa a la siguiente pista": "next",
    "pasa a la siguiente": "next",
    "siguiente": "next",
    "next song": "next",
    "next track": "next",
    "next": "next",

    "anterior cancion": "prev",
    "anterior pista": "prev",
    "anterior tema": "prev",
    "cancion anterior": "prev",
    "pista anterior": "prev",
    "tema anterior": "prev",
    "vuelve a la anterior": "prev",
    "anterior": "prev",
    "previous song": "prev",
    "previous track": "prev",
    "previous": "prev",
    "prev track": "prev",
    "prev": "prev",

    "vuelve al principio": "first",
    "volver al principio": "first",
    "ve al principio": "first",
    "desde el principio": "first",
    "al principio": "first",
    "primera cancion": "first",
    "primera pista": "first",
    "primer tema": "first",
    "primera": "first",
    "primero": "first",
    "first song": "first",
    "first track": "first",
    "first": "first",

    "ultima cancion": "last",
    "ultima pista": "last",
    "ultimo tema": "last",
    "ve a la ultima": "last",
    "ultima": "last",
    "ultimo": "last",
    "last song": "last",
    "last track": "last",
    "last": "last"
  };

  var ALIAS_KEYS = Object.keys(ALIAS).sort(function (a, b) { return b.length - a.length; });

  function normalizar(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!,.;:]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function ttsActiva(opts) {
    opts = opts || {};
    if (opts.ttsSpeaking === true) return true;
    if (opts.ttsSpeaking === false) return false;
    try {
      if (root.AdmiraVoces && typeof root.AdmiraVoces.speaking === "function" && root.AdmiraVoces.speaking()) return true;
    } catch (e) {}
    try {
      if (root.speechSynthesis && root.speechSynthesis.speaking) return true;
    } catch (e2) {}
    return false;
  }

  function pareceLocucionConsejero(texto) {
    var t = normalizar(texto);
    if (!t) return false;
    if (/^hola\s+carlos\b/.test(t)) return true;
    if (/\bsoy\s+(elon|jobs|steve|jensen|woz|wozniak|disney|walt|lucas|george|lasseter|murati|mira|jony|cook|buffett|huang)\b/.test(t)) return true;
    if (t.split(" ").filter(Boolean).length > 10) return true;
    return false;
  }

  function quitarPrefijoCli(t) {
    if (/^\/(?:playlist|pista|cancion)\s+/.test(t)) return t.replace(/^\/(?:playlist|pista|cancion)\s+/, "");
    if (/^\/(siguiente|anterior|primero|primera|ultimo|ultima|next|prev|first|last)$/.test(t)) return t.slice(1);
    return t;
  }

  function esOtroComandoBarra(t) {
    return /^\/(?!playlist\b|pista\b|cancion\b|siguiente$|anterior$|primero$|primera$|ultimo$|ultima$|next$|prev$|first$|last$)/.test(t);
  }

  function igualAlias(t) {
    for (var i = 0; i < ALIAS_KEYS.length; i++) {
      if (t === ALIAS_KEYS[i]) return ALIAS[ALIAS_KEYS[i]];
    }
    return null;
  }

  function parseComando(texto, opts) {
    if (ttsActiva(opts)) {
      return { ok: false, error: "tts", mensaje: "Ignorado: ahora mismo habla un consejero." };
    }
    if (pareceLocucionConsejero(texto)) {
      return { ok: false, error: "consejero", mensaje: "Ignorado: eso lo ha dicho un consejero, no es un comando de playlist." };
    }
    var raw = String(texto || "").trim();
    var t = normalizar(raw);
    if (esOtroComandoBarra(t)) {
      return { ok: false, error: "otro", mensaje: "Ese comando no es de playlist." };
    }
    t = quitarPrefijoCli(t);
    t = t.replace(/^(por favor)\s+/, "").replace(/\s+por favor$/, "").trim();
    if (!t) return { ok: false, error: "vacio", mensaje: "No he entendido nada. Di o escribe «siguiente», «anterior», «primero» o «último»." };

    var key = igualAlias(t);
    if (!key) {
      var stripped = t.replace(/^(poneme|ponme|pone|pon|pasame|pasa a|pasa|ve a|ve|quiero)\s+/, "");
      stripped = stripped.replace(/^(la|el|una|un)\s+/, "").trim();
      key = igualAlias(stripped);
    }
    if (!key) {
      return { ok: false, error: "comando", mensaje: "Indica siguiente, anterior, primero o último (vale «siguiente canción», «vuelve al principio», «última pista»…)." };
    }
    var info = CMDS[key];
    return { ok: true, cmd: info.cmd, resumen: info.resumen, etiqueta: info.etiqueta };
  }

  function textoComando(parsed) {
    if (!parsed || !parsed.ok) return (parsed && parsed.mensaje) || "No he entendido el comando.";
    return "He entendido: " + parsed.resumen + ".";
  }

  var api = {
    CMDS: CMDS,
    normalizar: normalizar,
    ttsActiva: ttsActiva,
    pareceLocucionConsejero: pareceLocucionConsejero,
    parseComando: parseComando,
    textoComando: textoComando
  };
  root.AdmiraPlaylistVoz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
