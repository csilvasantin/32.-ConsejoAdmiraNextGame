/* ============================================================
   ADcelerate · theme-loader.js  ·  CONTRATO DE TEMAS
   ============================================================
   Principio de compañía AdmiraNeXT: «3 vistas por solución».
   Una misma web (mismo backoffice/markup/datos) se pinta con 3
   capas de tema conmutables SIN recargar. ADcelerate es el piloto.

   Las 3 vistas canónicas (contrato):
     · neon   — retro-pop 80s/90s (show).            theme-neon.css  (+ retro.js)
     · studio — limpia, clara, corporate (enterprise). theme-studio.css
     · ops    — oscura, densa, data-first (operador).  theme-ops.css

   Contrato de fichero:  assets/theme-<nombre>.css  (+ theme-<nombre>.js opcional).
   Resolución del tema activo:  ?theme=neon|studio|ops  →  localStorage('adc-theme')
     →  default 'neon'.  Un ?theme= válido se persiste.

   API:  window.AdmiraTheme = {
           THEMES, current(), set(name, {persist, transition}),
           next(), on(fn)   // fn(name) al cambiar
         }

   Debe cargarse en <head> (bloqueante, antes del primer paint) para
   evitar el flash de tema incorrecto. Es self-contained: sin CDNs.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'adc-theme';
  var DEFAULT = 'neon';
  var LINK_ID = 'adc-theme-css';   // <link> de la capa de tema activa
  var JS_ID   = 'adc-theme-js';    // <script> opcional por tema

  // Registro de las 3 vistas canónicas. `label`+`hue` alimentan el
  // conmutador (micro-preview). `js` = capa de comportamiento opcional.
  var THEMES = {
    neon:   { css: 'assets/theme-neon.css',   js: null, label: 'NEON',   sub: 'retro-pop',  hue: '#50c8ff' },
    studio: { css: 'assets/theme-studio.css', js: null, label: 'STUDIO', sub: 'corporate',  hue: '#2563eb' },
    ops:    { css: 'assets/theme-ops.css',    js: null, label: 'OPS',     sub: 'data-first', hue: '#00e58f' }
  };

  var listeners = [];

  function reads(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
  function writes(store, key, val) { try { store.setItem(key, val); } catch (e) {} }

  function fromQuery() {
    try {
      var m = location.search.match(/[?&]theme=([a-z]+)/i);
      return m ? m[1].toLowerCase() : null;
    } catch (e) { return null; }
  }

  function normalize(name) {
    return (name && THEMES[name]) ? name : null;
  }

  // Tema inicial: query (y persiste) → localStorage → default.
  function resolveInitial() {
    var q = normalize(fromQuery());
    if (q) { writes(localStorage, LS_KEY, q); return q; }
    var ls = normalize(reads(localStorage, LS_KEY));
    if (ls) return ls;
    return DEFAULT;
  }

  // Garantiza el <link> del tema en <head> y lo apunta al css correcto.
  function ensureLink() {
    var link = document.getElementById(LINK_ID);
    if (!link) {
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      (document.head || document.documentElement).appendChild(link);
    }
    return link;
  }

  function applyCss(name) {
    var t = THEMES[name];
    var link = ensureLink();
    // Sólo cambia el href si difiere (evita re-fetch/parpadeo).
    var want = t.css;
    if (link.getAttribute('href') !== want) link.setAttribute('href', want);
  }

  // Capa JS opcional del tema (carga una vez; no se descarga al salir).
  function applyJs(name) {
    var t = THEMES[name];
    var old = document.getElementById(JS_ID);
    if (!t.js) return;                       // este tema no trae JS
    if (old && old.getAttribute('data-theme') === name) return;  // ya cargado
    var s = document.createElement('script');
    s.id = JS_ID; s.src = t.js; s.async = false; s.setAttribute('data-theme', name);
    (document.body || document.documentElement).appendChild(s);
  }

  var currentName = null;

  function setAttr(name) {
    var root = document.documentElement;
    root.setAttribute('data-theme', name);
    // clase espejo en <body> por si algún selector la prefiere
    if (document.body) {
      document.body.classList.remove('theme-neon', 'theme-studio', 'theme-ops');
      document.body.classList.add('theme-' + name);
    }
  }

  function doSet(name, opts) {
    name = normalize(name) || DEFAULT;
    opts = opts || {};
    var changed = name !== currentName;
    currentName = name;
    setAttr(name);
    applyCss(name);
    applyJs(name);
    if (opts.persist !== false) writes(localStorage, LS_KEY, name);
    if (changed) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](name); } catch (e) {}
      }
    }
    return name;
  }

  // Cambio con View Transition si está disponible y no hay reduce-motion.
  function set(name, opts) {
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (opts.transition !== false && document.startViewTransition && !reduce) {
      document.startViewTransition(function () { doSet(name, opts); });
      return normalize(name) || DEFAULT;
    }
    return doSet(name, opts);
  }

  // ── Aplicación inicial (síncrona, antes del paint) ──────────
  var initial = resolveInitial();
  // Fija <html data-theme> y el <link> cuanto antes (evita FOUC de tema).
  document.documentElement.setAttribute('data-theme', initial);
  applyCss(initial);
  currentName = initial;

  // Al estar listo el body, completa clases + capa JS del tema.
  function onReady() { setAttr(currentName); applyJs(currentName); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  window.AdmiraTheme = {
    THEMES: THEMES,
    current: function () { return currentName; },
    set: set,
    next: function () {
      var order = ['neon', 'studio', 'ops'];
      var idx = order.indexOf(currentName);
      return set(order[(idx + 1) % order.length]);
    },
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };
})();
