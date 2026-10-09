/* Cliente compartido del hilo Carlos ↔ consejero (empieza por Jobs). GrokBotBox, 09-10-2026.
 * Una sola fuente para /chat/jobs/ y el panel «Conversación» de la home (council-grokbot.js):
 * GET /api/chat/hilo (privado: ID token de Google de una cuenta de Carlos), POST /api/chat/enviar
 * (turno de Carlos con origen live + encargo [chat-coetaneos] al bot-inbox), sondeo adaptativo
 * (2 s esperando respuesta hasta 3 min, 10 s en reposo) e indicador «escribiendo…».
 * Sin dependencias; funciona como script clásico (window.ChatHiloClient). */
(function (root) {
  "use strict";
  var RAPIDO_MS = 2000, REPOSO_MS = 10000, VENTANA_RAPIDA_MS = 180000, VENTANA_ESCRIBIENDO_MS = 1800000;
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var CLAVE = "chat-hilo-google";
  var ORIGEN = { app: "App", live: "admira.live", rutina: "rutina" };
  var ESTADO = { enviando: "enviando…", entregado: "entregado", error: "error", sin_confirmar: "sin confirmar" };
  // Consejeros con hilo compartido (nombre visible → persona de la API).
  var PERSONAS = { "Steve Jobs": "jobs" };

  // ── Lógica pura ──────────────────────────────────────────────────────────
  function esperaDesde(turnos) {
    var u = turnos && turnos.length ? turnos[turnos.length - 1] : null;
    if (!u || u.rol !== "carlos" || u.entrega === "error") return null;
    var t = Date.parse(u.ts);
    return isNaN(t) ? null : t;
  }
  function intervaloSondeo(turnos, ahora) {
    var d = esperaDesde(turnos);
    return d !== null && ahora - d < VENTANA_RAPIDA_MS ? RAPIDO_MS : REPOSO_MS;
  }
  function textoEscribiendo(turnos, ahora, corto) {
    var d = esperaDesde(turnos);
    if (d === null || ahora - d >= VENTANA_ESCRIBIENDO_MS) return "";
    var s = Math.max(0, Math.floor((ahora - d) / 1000));
    return (corto || "Jobs") + " está escribiendo… · " + (s < 60 ? s + " s" : Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s");
  }
  // Texto de estado de un turno de Carlos enviado desde admira.live («entregado · encargo #12 · respondido»).
  function textoEstado(t, corto) {
    if (!t || t.rol !== "carlos" || t.origen !== "live" || !t.entrega) return "";
    var txt = ESTADO[t.entrega] || t.entrega;
    if (t.encargo) txt += " · encargo #" + t.encargo;
    if (t.encargo_estado === "done") txt += " · respondido";
    else if (t.encargo_estado === "ack" || t.encargo_estado === "in_progress") txt += " · " + (corto || "Jobs") + " trabajando";
    return txt;
  }
  // Funde los turnos del servidor con los locales aún sin confirmar (por id) y da una firma estable.
  function fundir(turnos, locales) {
    var ids = {}; (turnos || []).forEach(function (t) { ids[t.id] = 1; });
    var pend = (locales || []).filter(function (l) { return !ids[l.id]; });
    var todos = (turnos || []).concat(pend);
    var firma = todos.map(function (t) { return [t.id, t.entrega || "", t.encargo || "", t.encargo_estado || ""].join(":"); }).join("|");
    return { turnos: todos, locales: pend, firma: firma };
  }
  // Home («modo menú inicial»): cada visita empieza en blanco. Solo se ven los turnos enviados en ESTA
  // visita (por id) y las respuestas del consejero posteriores al primer envío (ts >= desde).
  // Sin envío todavía (desde null) no hay nada que mostrar: el histórico vive en /chat/jobs/.
  function turnosDeVisita(turnos, enviados, desde) {
    if (desde === null || desde === undefined || isNaN(desde)) return [];
    return (turnos || []).filter(function (t) {
      if (!t) return false;
      if (enviados && Object.prototype.hasOwnProperty.call(enviados, t.id)) return true;
      if (t.rol === "carlos") return false;
      var ts = Date.parse(t.ts);
      return !isNaN(ts) && ts >= desde;
    });
  }
  function personaDe(nombre) { return Object.prototype.hasOwnProperty.call(PERSONAS, nombre) ? PERSONAS[nombre] : null; }
  function nuevoId() { return "live-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }

  // ── Credencial (ID token de Google, el mismo client_id del login de admira.live) ──
  function almacen() { try { return root.sessionStorage || null; } catch (e) { return null; } }
  function credencial() {
    var s = almacen(); if (!s) return "";
    try {
      var d = JSON.parse(s.getItem(CLAVE) || "null");
      if (d && d.jwt && d.exp * 1000 > Date.now() + 60000) return d.jwt;
    } catch (e) {}
    s.removeItem(CLAVE);
    return "";
  }
  function guardar(jwt) {
    var s = almacen(); if (!s) return;
    try {
      var p = JSON.parse(root.atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      s.setItem(CLAVE, JSON.stringify({ jwt: jwt, exp: p.exp }));
    } catch (e) {}
  }
  function olvidar() { var s = almacen(); if (s) s.removeItem(CLAVE); }

  // ── Red ──────────────────────────────────────────────────────────────────
  function leerHilo(persona, opts) {
    opts = opts || {};
    var jwt = credencial(), f = opts.fetch || root.fetch.bind(root);
    if (!jwt) return Promise.resolve({ status: 401, ok: false, turnos: [] });
    return f((opts.base || "") + "/api/chat/hilo?persona=" + encodeURIComponent(persona) + "&limite=" + (opts.limite || 200), { cache: "no-store", headers: { Authorization: "Bearer " + jwt } })
      .then(function (r) {
        if (r.status === 401) { olvidar(); return { status: 401, ok: false, turnos: [] }; }
        return r.json().then(function (d) { return { status: r.status, ok: !!(d && d.ok), turnos: (d && d.turnos) || [] }; });
      });
  }
  function enviarTurno(persona, texto, msgId, opts) {
    opts = opts || {};
    var jwt = credencial(), f = opts.fetch || root.fetch.bind(root);
    if (!jwt) return Promise.resolve({ status: 401, turno: null });
    return f((opts.base || "") + "/api/chat/enviar", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", Authorization: "Bearer " + jwt }, body: JSON.stringify({ persona: persona, texto: texto, msg_id: msgId }) })
      .then(function (r) {
        if (r.status === 401) olvidar();
        return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, turno: (d && d.turno) || null }; });
      });
  }

  // ── Login de Google (Identity Services) ──────────────────────────────────
  function cargarGoogle(boton, alEntrar, alFallar) {
    var doc = root.document;
    function iniciar() {
      var g = root.google.accounts.id;
      g.initialize({ client_id: CLIENT_ID, auto_select: true, cancel_on_tap_outside: false,
        callback: function (r) { if (r && r.credential) { guardar(r.credential); alEntrar && alEntrar(); } } });
      if (boton) g.renderButton(boton, { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240 });
      g.prompt();
    }
    if (root.google && root.google.accounts && root.google.accounts.id) return iniciar();
    var s = doc.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = iniciar;
    s.onerror = function () { alFallar && alFallar("No se pudo cargar el login de Google."); };
    doc.head.appendChild(s);
  }
  function salirGoogle() { olvidar(); try { root.google.accounts.id.disableAutoSelect(); } catch (e) {} }

  root.ChatHiloClient = {
    RAPIDO_MS: RAPIDO_MS, REPOSO_MS: REPOSO_MS, VENTANA_RAPIDA_MS: VENTANA_RAPIDA_MS, VENTANA_ESCRIBIENDO_MS: VENTANA_ESCRIBIENDO_MS,
    CLIENT_ID: CLIENT_ID, CLAVE: CLAVE, ORIGEN: ORIGEN, ESTADO: ESTADO, PERSONAS: PERSONAS,
    esperaDesde: esperaDesde, intervaloSondeo: intervaloSondeo, textoEscribiendo: textoEscribiendo, textoEstado: textoEstado,
    fundir: fundir, turnosDeVisita: turnosDeVisita, personaDe: personaDe, nuevoId: nuevoId,
    credencial: credencial, guardar: guardar, olvidar: olvidar,
    leerHilo: leerHilo, enviarTurno: enviarTurno, cargarGoogle: cargarGoogle, salirGoogle: salirGoogle
  };
})(typeof window !== "undefined" ? window : globalThis);
