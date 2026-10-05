/*
 * admira-idioma.js — idioma de la interfaz de www.admira.live (castellano / inglés).
 *
 * Mismo contrato que admira.store / XpaceOS (assets/xpace-shell.js · languageCommand,
 * documentado allí en admira-xp/docs/options-language.md), para que los dos sitios
 * respondan igual en ⌘ Experto:
 *   · /idioma ESP | ENG  — alias /language; acepta esp|eng|es|en sin distinguir mayúsculas.
 *     «español» o «english» NO valen (tampoco en admira.store).
 *   · La preferencia vive en localStorage «xtanco_lang» (por origen: admira.live y
 *     admira.store no se la comparten, pero se llama igual), la URL pasa a ?lang=es|en
 *     con replaceState (sin recargar ni perder estado) y <html lang> toma el idioma.
 *   · Una ?lang=es|en explícita en la URL manda en una visita nueva.
 *   · Avisa con el evento window «admira:languagechange» {detail:{lang}} (el mismo
 *     nombre que la portada de admira.store).
 *   · La orden es local: no viaja al Consejo, a la flota ni a Telegram.
 * Diferencia consciente: /idioma sin argumento dice el idioma actual además del uso
 * (en admira.store sólo devuelve el uso).
 *
 * Traducción declarativa: el castellano sigue siendo el texto del HTML; el inglés va en
 *   data-en (texto del elemento — ponlo en el nodo hoja, se sustituye su textContent),
 *   data-en-title, data-en-placeholder, data-en-aria-label.
 * La primera vez se guarda el original en data-es / data-es-*, así volver a ESP es exacto.
 * Lo que una página pinte por JS usa AdmiraIdioma.t(es, en) y escucha el evento.
 * Páginas sin data-en siguen en castellano: el mecanismo está listo, la traducción no.
 */
(function (root) {
  "use strict";
  var KEY = "xtanco_lang";
  var EVENT = "admira:languagechange";
  var VERBS = ["idioma", "language"];
  var ATTRS = ["title", "placeholder", "aria-label"];

  // ── Núcleo puro (sin DOM): lo prueban los tests ──
  function normalize(value) {
    var k = String(value == null ? "" : value).trim().toLowerCase();
    return ({ esp: "es", eng: "en", es: "es", en: "en" })[k] || null;
  }
  function langOf(value) { return String(value || "").toLowerCase().indexOf("en") === 0 ? "en" : "es"; }
  function parse(text) {
    var m = String(text == null ? "" : text).trim().match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
    return m ? { verb: m[1].toLowerCase(), args: (m[2] || "").trim() } : null;
  }
  function usage(lang) {
    return lang === "en" ? "Use /idioma ESP (Spanish) or /idioma ENG (English)."
                         : "Usa /idioma ESP (castellano) o /idioma ENG (inglés).";
  }
  // Decide qué hace una línea de CLI; null si no es /idioma ni /language.
  function command(text, current) {
    var p = parse(text);
    if (!p || VERBS.indexOf(p.verb) < 0) return null;
    var cur = langOf(current);
    if (!p.args) {
      return { ok: true, query: true, language: cur,
        message: (cur === "en" ? "Current language: English. " : "Idioma actual: castellano. ") + usage(cur) };
    }
    var next = normalize(p.args);
    if (!next) {
      var shown = p.args.length > 24 ? p.args.slice(0, 24) + "…" : p.args;
      return { ok: false, language: cur,
        message: (cur === "en" ? "“" + shown + "” is not a language. " : "«" + shown + "» no es un idioma. ") + usage(cur) };
    }
    return { ok: true, change: true, language: next,
      message: next === "en" ? "Interface language: English." : "Idioma de la interfaz: castellano." };
  }
  function helpLine(lang) {
    return lang === "en" ? "/idioma ESP | ENG — Spanish or English without reloading the page"
                         : "/idioma ESP | ENG — castellano o inglés, sin recargar la página";
  }

  var api = { KEY: KEY, EVENT: EVENT, VERBS: VERBS, normalize: normalize, langOf: langOf, parse: parse,
    usage: usage, command: command, helpLine: helpLine };
  root.AdmiraIdioma = api;
  if (!root.document) return;

  // ── Navegador ──
  var doc = root.document, html = doc.documentElement;
  var storage = (function () { try { return root.localStorage; } catch (_) { return null; } })();
  function urlLang() {
    try { return normalize(new URL(root.location.href).searchParams.get("lang")); } catch (_) { return null; }
  }
  function stored() { try { return normalize(storage && storage.getItem(KEY)); } catch (_) { return null; } }
  function remember(lang) { try { if (storage) storage.setItem(KEY, lang); } catch (_) {} }

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

  // <html lang> cuanto antes (el script va en el <head>); el texto, al tener el DOM.
  html.lang = current;
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { translate(doc); });
  else translate(doc);
})(typeof globalThis !== "undefined" ? globalThis : this);
