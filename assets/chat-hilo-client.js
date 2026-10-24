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
  // Los seis que el servidor ya acepta. El resto de sillas no tiene hilo.
  var PERSONAS = {
    "Steve Jobs": "jobs",
    "Steve Wozniak": "wozniak",
    "Walt Disney": "disney",
    "George Lucas": "lucas",
    "Elon Musk": "musk",
    "Jensen Huang": "huang"
  };

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
  // Origen visible (24-10-2026): el servidor lo manda en «origen_etiqueta»; si falta, se deriva aquí igual.
  var ETIQ = { live: "admira.live", app: "Grok Bot", rutina: "Grok Bot" };
  function origenTurno(t) {
    if (!t) return "Grok Bot";
    if (t.origen_etiqueta === "admira.live" || t.origen_etiqueta === "Grok Bot") return t.origen_etiqueta;
    if (ETIQ[t.origen]) return ETIQ[t.origen];
    var id = String(t.id || "");
    if (t.via === "bot-inbox" || /^enc-\d+-resp$/.test(id)) return "Grok Bot";
    if (t.autor || t.entrega || /^live-/.test(id)) return "admira.live";
    return t.rol === "carlos" ? "admira.live" : "Grok Bot";
  }
  var HORA = null;
  function horaMadrid(ts) {
    var n = typeof ts === "number" ? ts : Date.parse(ts);
    if (!isFinite(n)) return "";
    try { HORA = HORA || new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }); return HORA.format(new Date(n)); } catch (e) { return ""; }
  }
  /** «admira.live · 09:13» — el mismo formato en todos los mensajes. */
  function metaTurno(origen, ts) { var h = horaMadrid(ts); return h ? origen + " · " + h : origen; }
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
  // r96 (24-10-2026): sesión larga. Tras el primer login de Google el servidor fija una cookie HttpOnly
  // (__Host-admira_chat, 180 días) compartida por todas las pestañas y páginas de www.admira.live.
  // Aquí solo queda un aviso NO secreto en localStorage ({email, exp}) para saber que existe; el valor
  // de la cookie nunca es visible para JavaScript. credencial() devuelve entonces SESION.
  var SESION = "sesion", CLAVE_SESION = "chat-hilo-sesion";
  function local() { try { return root.localStorage || null; } catch (e) { return null; } }
  function avisoSesion() {
    var l = local(); if (!l) return null;
    try { var d = JSON.parse(l.getItem(CLAVE_SESION) || "null"); if (d && d.exp > Date.now() + 60000) return d; } catch (e) {}
    try { l.removeItem(CLAVE_SESION); } catch (e) {}
    return null;
  }
  function marcarSesion(d) {
    var l = local(); if (!l || !d || !d.ok) return false;
    try { l.setItem(CLAVE_SESION, JSON.stringify({ email: String(d.email || ""), exp: Number(d.exp) || Date.now() + 30 * 864e5 })); } catch (e) { return false; }
    try { root.dispatchEvent(new root.CustomEvent("chat-hilo-sesion", { detail: { email: d.email } })); } catch (e) {}
    return true;
  }
  function credencial() {
    var s = almacen();
    if (s) {
      try {
        var d = JSON.parse(s.getItem(CLAVE) || "null");
        if (d && d.jwt && d.exp * 1000 > Date.now() + 60000) return d.jwt;
      } catch (e) {}
      s.removeItem(CLAVE);
    }
    return avisoSesion() ? SESION : "";
  }
  // Convierte el ID token (1 h) en la sesión larga del servidor. El servidor verifica el token en Google.
  function abrirSesion(jwt) {
    if (!root.fetch) return Promise.resolve(false);
    return root.fetch("/api/chat/sesion", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer " + jwt } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(marcarSesion).catch(function () { return false; });
  }
  // Pestaña/página nueva sin aviso: pregunta al servidor si la cookie sigue viva (no pide login).
  function restaurarSesion() {
    if (avisoSesion() || !root.fetch) return Promise.resolve(!!avisoSesion());
    return root.fetch("/api/chat/sesion", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) { d.exp = d.exp || Date.now() + 7 * 864e5; return marcarSesion(d); } return false; })
      .catch(function () { return false; });
  }
  function guardar(jwt) {
    var s = almacen();
    try {
      var p = JSON.parse(root.atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (s) s.setItem(CLAVE, JSON.stringify({ jwt: jwt, exp: p.exp }));
    } catch (e) {}
    return abrirSesion(jwt);
  }
  function olvidar() {
    var s = almacen(); if (s) s.removeItem(CLAVE);
    var l = local(); if (l) try { l.removeItem(CLAVE_SESION); } catch (e) {}
  }

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
  function salirGoogle() {
    olvidar();
    try { root.fetch("/api/chat/sesion", { method: "DELETE", credentials: "same-origin", cache: "no-store" }).catch(function () {}); } catch (e) {}
    try { root.google.accounts.id.disableAutoSelect(); } catch (e) {} }

  root.ChatHiloClient = {
    RAPIDO_MS: RAPIDO_MS, REPOSO_MS: REPOSO_MS, VENTANA_RAPIDA_MS: VENTANA_RAPIDA_MS, VENTANA_ESCRIBIENDO_MS: VENTANA_ESCRIBIENDO_MS,
    CLIENT_ID: CLIENT_ID, CLAVE: CLAVE, ORIGEN: ORIGEN, ESTADO: ESTADO, PERSONAS: PERSONAS,
    esperaDesde: esperaDesde, intervaloSondeo: intervaloSondeo, textoEscribiendo: textoEscribiendo, textoEstado: textoEstado, origenTurno: origenTurno, horaMadrid: horaMadrid, metaTurno: metaTurno,
    fundir: fundir, turnosDeVisita: turnosDeVisita, personaDe: personaDe, nuevoId: nuevoId,
    credencial: credencial, guardar: guardar, olvidar: olvidar, SESION: SESION, abrirSesion: abrirSesion, restaurarSesion: restaurarSesion,
    leerHilo: leerHilo, enviarTurno: enviarTurno, cargarGoogle: cargarGoogle, salirGoogle: salirGoogle
  };
  if (root.document && root.fetch && root.location && /admira\.live$|pages\.dev$|localhost$/.test(root.location.hostname || "")) restaurarSesion();
})(typeof window !== "undefined" ? window : globalThis);
