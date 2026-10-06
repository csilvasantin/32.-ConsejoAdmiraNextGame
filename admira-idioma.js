/*
 * admira-idioma.js — idioma de la interfaz de www.admira.live (castellano / inglés).
 *
 * Mismo contrato que el ⌘ EXPERTO · CLI de la suite (admiranext.com/suite/experto.js,
 * Carlos 5-oct-2026), que admira.live monta igual que las plataformas:
 *   · /idioma — sin argumento ALTERNA ESP↔ENG; /idioma ESP | ENG lo fija.
 *     Alias /language y el typo /languague. Acepta esp|eng|es|en|spa|spanish|español|
 *     castellano|english|inglés sin distinguir mayúsculas, separados o pegados
 *     (/idiomaESP, /languageENG, /language_eng).
 *   · La preferencia vive en localStorage «admiranext_expert_lang» (la clave de la suite,
 *     compartida con pixeria / admira.studio) y también en «xtanco_lang» (compatibilidad);
 *     la URL pasa a ?lang=es|en con replaceState (sin recargar) y <html lang> toma el idioma.
 *   · Una ?lang=es|en explícita en la URL manda en una visita nueva.
 *   · Avisa con el evento window «admira:languagechange» {detail:{lang}}; y escucha el
 *     «admiranext:lang» que emite experto.js, así /idioma en el dock de la suite traduce
 *     también la página.
 *   · La orden es local: no viaja al Consejo, a la flota ni a Telegram.
 *
 * Traducción declarativa: el castellano sigue siendo el texto del HTML; el inglés va en
 *   data-en (texto del elemento — ponlo en el nodo hoja, se sustituye su textContent),
 *   data-en-title, data-en-placeholder, data-en-aria-label.
 * La primera vez se guarda el original en data-es / data-es-*, así volver a ESP es exacto.
 * Lo que una página pinte por JS usa AdmiraIdioma.t(es, en) y escucha el evento.
 */
(function (root) {
  "use strict";
  var KEY = "xtanco_lang";
  var EXPERT_KEY = "admiranext_expert_lang";
  var EVENT = "admira:languagechange";
  var VERBS = ["idioma", "language", "languague"];
  var ATTRS = ["title", "placeholder", "aria-label"];

  // ── Núcleo puro (sin DOM): lo prueban los tests ──
  // Mismo normalizador que experto.js: sin tildes ni signos, en minúsculas.
  function normalize(value) {
    var k = String(value == null ? "" : value).toLowerCase();
    try { k = k.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (_) {}
    k = k.replace(/[^a-z]/g, "");
    if (/^(en|eng|english|ingles)$/.test(k)) return "en";
    if (/^(es|esp|spa|spanish|espanol|castellano)$/.test(k)) return "es";
    return null;
  }
  function langOf(value) { return String(value || "").toLowerCase().indexOf("en") === 0 ? "en" : "es"; }
  // «/idioma ENG», «/idiomaENG», «/languague eng», «/language_es»… → {verb, args}
  function parse(text) {
    var t = String(text == null ? "" : text).trim();
    var m = t.match(/^\/(idioma|languague|language)(?:[\s_-]*([\s\S]*))?$/i);
    if (m) return { verb: m[1].toLowerCase(), args: (m[2] || "").trim() };
    m = t.match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
    return m ? { verb: m[1].toLowerCase(), args: (m[2] || "").trim() } : null;
  }
  function usage(lang) {
    return lang === "en" ? "Use /idioma (toggle) or /idioma ESP (Spanish) | ENG (English)."
                         : "Usa /idioma (alterna) o /idioma ESP (castellano) | ENG (inglés).";
  }
  function message(lang) {
    return lang === "en" ? "Interface language: English." : "Idioma de la interfaz: castellano.";
  }
  // Decide qué hace una línea de CLI; null si no es /idioma, /language ni /languague.
  function command(text, current) {
    var p = parse(text);
    if (!p || VERBS.indexOf(p.verb) < 0) return null;
    var cur = langOf(current);
    if (!p.args) {
      var other = cur === "en" ? "es" : "en";
      return { ok: true, change: true, toggled: true, language: other, message: message(other) };
    }
    var next = normalize(p.args);
    if (!next) {
      var shown = p.args.length > 24 ? p.args.slice(0, 24) + "…" : p.args;
      return { ok: false, language: cur,
        message: (cur === "en" ? "“" + shown + "” is not a language. " : "«" + shown + "» no es un idioma. ") + usage(cur) };
    }
    return { ok: true, change: true, language: next, message: message(next) };
  }
  function helpLine(lang) {
    return lang === "en" ? "/idioma [ESP | ENG] — toggle or set Spanish/English without reloading (also /language)"
                         : "/idioma [ESP | ENG] — alterna o fija castellano/inglés sin recargar (también /language)";
  }

  var api = { KEY: KEY, EXPERT_KEY: EXPERT_KEY, EVENT: EVENT, VERBS: VERBS, normalize: normalize, langOf: langOf, parse: parse,
    usage: usage, command: command, helpLine: helpLine };
  root.AdmiraIdioma = api;
  if (!root.document) return;

  // ── Navegador ──
  var doc = root.document, html = doc.documentElement;
  var storage = (function () { try { return root.localStorage; } catch (_) { return null; } })();
  function urlLang() {
    try { return normalize(new URL(root.location.href).searchParams.get("lang")); } catch (_) { return null; }
  }
  function stored() {
    try { return normalize(storage && storage.getItem(EXPERT_KEY)) || normalize(storage && storage.getItem(KEY)); } catch (_) { return null; }
  }
  function remember(lang) {
    try { if (storage) { storage.setItem(EXPERT_KEY, lang); storage.setItem(KEY, lang); } } catch (_) {}
  }

  var current = urlLang() || stored() || "es";
  if (urlLang()) remember(current);   // la URL explícita también queda como preferencia

  function swap(el, attr, lang) {
    var en = el.getAttribute("data-en" + (attr ? "-" + attr : ""));
    if (en == null) return;
    var keep = "data-es" + (attr ? "-" + attr : "");
    if (!el.hasAttribute(keep)) el.setAttribute(keep, attr ? (el.getAttribute(attr) || "") : el.textContent);
    var text = lang === "en" ? en : el.getAttribute(keep);
    if (attr) { if (el.getAttribute(attr) !== text) el.setAttribute(attr, text); }
    else if (el.textContent !== text) el.textContent = text;
  }
  // Traduce el ámbito (por defecto, todo el documento) al idioma activo.
  function translate(scope) {
    var base = scope || doc;
    if (!base || !base.querySelectorAll) return;
    var sel = "[data-en]," + ATTRS.map(function (a) { return "[data-en-" + a + "]"; }).join(",");
    var list = Array.prototype.slice.call(base.querySelectorAll(sel));
    if (base.matches && base.matches(sel)) list.unshift(base);
    list.forEach(function (el) {
      swap(el, "", current);
      ATTRS.forEach(function (a) { swap(el, a, current); });
    });
  }
  function apply(lang) {
    current = langOf(lang);
    html.lang = current;
    translate(doc);
  }
  function set(lang) {
    var next = normalize(lang);
    if (!next) return false;
    remember(next);
    try {
      var url = new URL(root.location.href);
      url.searchParams.set("lang", next);
      url.searchParams.delete("langlock");
      if (root.history && root.history.replaceState) root.history.replaceState(root.history.state, "", url.href);
    } catch (_) {}
    apply(next);
    try { root.dispatchEvent(new root.CustomEvent(EVENT, { detail: { lang: next } })); } catch (_) {}
    return true;
  }
  // Ejecuta una línea de CLI: null si no es suya; si cambia el idioma, lo aplica ya.
  function run(text) {
    var res = command(text, current);
    if (res && res.change) set(res.language);
    return res;
  }

  api.lang = function () { return current; };
  api.t = function (es, en) { return current === "en" ? en : es; };
  api.translate = translate;
  api.set = set;
  api.run = run;

  // El ⌘ EXPERTO · CLI de la suite (experto.js) cambia <html lang>, guarda admiranext_expert_lang
  // y emite «admiranext:lang»: aquí se traduce la página entera con el mismo idioma.
  if (root.addEventListener) {
    root.addEventListener("admiranext:lang", function (e) {
      var l = normalize(e && e.detail && e.detail.lang);
      if (l) set(l);
    });
  }

  // <html lang> cuanto antes (el script va en el <head>); el texto, al tener el DOM.
  html.lang = current;
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { translate(doc); });
  else translate(doc);
})(typeof globalThis !== "undefined" ? globalThis : this);
