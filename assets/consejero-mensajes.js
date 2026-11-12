/* Mensajes privados entre consejeros. Los escribe el MCP. PRIVADO (19-10-2026): solo con la
   sesión Google autorizada de admira.live, vía /api/chat/entre-consejeros (nunca en abierto).
   12-11-2026: locuta cada mensaje NUEVO entre consejeros con la voz del remitente
   (AdmiraVoces). En la primera carga marca los ya existentes como oídos y no los relée.
   12-11-2026 (Carlos): la voz va activa por defecto (si estás en la página, quieres oír).
   Queda un control pequeño para silenciar, recordado en localStorage. En Chrome se
   desbloquea el audio en el primer gesto (pointerdown/keydown/touchstart). También
   locuta las respuestas NUEVAS del consejero en el hilo #hilo (nunca el histórico).
   12-11-2026: un solo turno de voz en toda la sala (lock /api/chat/turno-voz).
   Si /sala-voz está abierta, esta página se calla en los mensajes entre consejeros
   (los dicen las pantallas) y respeta el mismo turno para el hilo. */
(function (root) {
  "use strict";
  var NOMBRE = { Huang: "Jensen Huang", Musk: "Elon Musk", Lucas: "George Lucas", Jobs: "Steve Jobs", Wozniak: "Steve Wozniak", Disney: "Walt Disney", Y: "Y" };
  var LS_OIDOS = "admira_entre_oidos_v1";
  var LS_HILO = "admira_hilo_oidos_v1";
  var LS_VOZ = "admira_entre_voz_v1";
  var MAX_OIDOS = 200;

  function nombre(s) { return NOMBRE[s] || s; }
  function textoDe(m) {
    if (!m) return "";
    var t = m.texto != null && String(m.texto).trim() !== "" ? m.texto : m.resumen;
    return String(t == null ? "" : t).trim();
  }
  function idDe(m) {
    if (!m) return "";
    if (m.id != null && String(m.id) !== "") return String(m.id);
    return [m.de || "", m.para || "", m.hora || "", textoDe(m)].join("\0");
  }
  function esAgente(m) { return !!(m && (m.de_tipo === "agente" || m.para_tipo === "agente")); }
  function esEntrante(m, silla) { return !!(m && silla && m.de !== silla); }

  function leerOidos(silla, store) {
    var ls = store || (root.localStorage || null);
    if (!ls || !silla) return [];
    try {
      var d = JSON.parse(ls.getItem(LS_OIDOS) || "{}") || {};
      return Array.isArray(d[silla]) ? d[silla].map(String) : [];
    } catch (e) { return []; }
  }
  function escribirOidos(silla, ids, store) {
    var ls = store || (root.localStorage || null);
    if (!ls || !silla) return [];
    var uniq = [], seen = {};
    (ids || []).forEach(function (id) {
      id = String(id || "");
      if (!id || seen[id]) return;
      seen[id] = 1; uniq.push(id);
    });
    if (uniq.length > MAX_OIDOS) uniq = uniq.slice(-MAX_OIDOS);
    try {
      var d = {};
      try { d = JSON.parse(ls.getItem(LS_OIDOS) || "{}") || {}; } catch (e) { d = {}; }
      d[silla] = uniq;
      ls.setItem(LS_OIDOS, JSON.stringify(d));
    } catch (e) {}
    return uniq;
  }
  function marcarOidos(silla, msgs, store) {
    var ids = leerOidos(silla, store);
    var seen = {};
    ids.forEach(function (id) { seen[id] = 1; });
    (msgs || []).forEach(function (m) {
      var id = idDe(m);
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return escribirOidos(silla, ids, store);
  }
  function noOidos(silla, msgs, store) {
    var seen = {};
    leerOidos(silla, store).forEach(function (id) { seen[id] = 1; });
    return (msgs || []).filter(function (m) {
      var id = idDe(m);
      return id && !seen[id];
    });
  }
  function leerVozOn(store) {
    var ls = store || (root.localStorage || null);
    if (!ls) return true;
    try {
      var v = ls.getItem(LS_VOZ);
      if (v === "off") return false;
    } catch (e) {}
    return true;
  }
  function escribirVozOn(on, store) {
    var ls = store || (root.localStorage || null);
    if (!ls) return !!on;
    try { ls.setItem(LS_VOZ, on ? "on" : "off"); } catch (e) {}
    return !!on;
  }
  function leerOidosEn(clave, silla, store) {
    var ls = store || (root.localStorage || null);
    if (!ls || !silla) return [];
    try {
      var d = JSON.parse(ls.getItem(clave) || "{}") || {};
      return Array.isArray(d[silla]) ? d[silla].map(String) : [];
    } catch (e) { return []; }
  }
  function escribirOidosEn(clave, silla, ids, store) {
    var ls = store || (root.localStorage || null);
    if (!ls || !silla) return [];
    var uniq = [], seen = {};
    (ids || []).forEach(function (id) {
      id = String(id || "");
      if (!id || seen[id]) return;
      seen[id] = 1; uniq.push(id);
    });
    if (uniq.length > MAX_OIDOS) uniq = uniq.slice(-MAX_OIDOS);
    try {
      var d = {};
      try { d = JSON.parse(ls.getItem(clave) || "{}") || {}; } catch (e) { d = {}; }
      d[silla] = uniq;
      ls.setItem(clave, JSON.stringify(d));
    } catch (e) {}
    return uniq;
  }
  function marcarOidosEn(clave, silla, msgs, store, idFn) {
    idFn = idFn || idDe;
    var ids = leerOidosEn(clave, silla, store);
    var seen = {};
    ids.forEach(function (id) { seen[id] = 1; });
    (msgs || []).forEach(function (m) {
      var id = idFn(m);
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return escribirOidosEn(clave, silla, ids, store);
  }
  function noOidosEn(clave, silla, msgs, store, idFn) {
    idFn = idFn || idDe;
    var seen = {};
    leerOidosEn(clave, silla, store).forEach(function (id) { seen[id] = 1; });
    return (msgs || []).filter(function (m) {
      var id = idFn(m);
      return id && !seen[id];
    });
  }
  function textoHilo(t) { return String((t && t.texto) || "").trim(); }
  function idHilo(t) {
    if (!t) return "";
    if (t.id != null && String(t.id) !== "") return String(t.id);
    return ["hilo", t.rol || "", t.ts || "", textoHilo(t)].join("\0");
  }
  function esTurnoConsejero(t) {
    return !!(t && t.rol && String(t.rol).toLowerCase() !== "carlos" && textoHilo(t));
  }
  function iniciarOidosHilo(silla, turnos, store) {
    marcarOidosEn(LS_HILO, silla, turnos, store, idHilo);
    return [];
  }
  function pendientesHiloDeLocutar(silla, turnos, store) {
    var vistos = noOidosEn(LS_HILO, silla, turnos, store, idHilo);
    marcarOidosEn(LS_HILO, silla, vistos, store, idHilo);
    return vistos.filter(esTurnoConsejero).map(function (t) {
      return { id: idHilo(t), de: t.rol, persona: nombre(silla), texto: textoHilo(t), fuente: "chat-hilo" };
    });
  }
  // Primera carga de una visita: todos los que ya están en la bandeja se marcan oídos y no se locutan.
  function iniciarOidos(silla, msgs, store) {
    marcarOidos(silla, msgs, store);
    return [];
  }
  // Mensajes entre consejeros, entrantes y aún no oídos. Los reclama (quedan oídos) para no repetirlos en el siguiente sondeo.
  function pendientesDeLocutar(silla, msgs, store) {
    var vistos = noOidos(silla, msgs, store);
    marcarOidos(silla, vistos, store);
    return vistos.filter(function (m) {
      return !esAgente(m) && esEntrante(m, silla) && textoDe(m);
    }).map(function (m) {
      return { id: idDe(m), de: m.de, persona: nombre(m.de), texto: textoDe(m), fuente: "chat-entre" };
    });
  }
  // Etiqueta corta pedida por Carlos: «Jobs → Elon», no «Musk».
  var CORTO = { Jobs: "Jobs", Musk: "Elon", Huang: "Jensen", Wozniak: "Woz", Disney: "Disney", Lucas: "Lucas", Y: "Y" };
  function cortoDe(s) { return CORTO[s] || String(s || ""); }
  function etiqueta(m) {
    if (!m) return "";
    return cortoDe(m.de) + " → " + cortoDe(m.para);
  }
  function tsDe(m) { return Date.parse((m && (m.hora || m.ts)) || 0) || 0; }
  // Portada: Carlos oye ambos sentidos (Jobs→Elon y Elon→Jobs), no solo los entrantes.
  function pendientesTranscripcion(silla, msgs, store) {
    var vistos = noOidos(silla, msgs, store);
    marcarOidos(silla, vistos, store);
    return vistos.filter(function (m) {
      return !esAgente(m) && textoDe(m) && (m.de === silla || m.para === silla);
    }).map(function (m) {
      return { id: idDe(m), de: m.de, persona: nombre(m.de), texto: textoDe(m), etiqueta: etiqueta(m) };
    });
  }
  // Intercala turnos del hilo de esta visita con la transcripción entre consejeros, por hora.
  function mergePorHora(hilos, entres) {
    var items = [];
    (hilos || []).forEach(function (t) { items.push({ tipo: "hilo", ts: Date.parse((t && t.ts) || 0) || 0, t: t }); });
    (entres || []).forEach(function (m) { items.push({ tipo: "entre", ts: tsDe(m), m: m }); });
    items.sort(function (a, b) { return a.ts - b.ts || (a.tipo === b.tipo ? 0 : a.tipo === "entre" ? -1 : 1); });
    return items;
  }

  var api = {
    NOMBRE: NOMBRE, LS_OIDOS: LS_OIDOS, LS_HILO: LS_HILO, LS_VOZ: LS_VOZ, CORTO: CORTO,
    textoDe: textoDe, idDe: idDe, esAgente: esAgente, esEntrante: esEntrante,
    leerOidos: leerOidos, escribirOidos: escribirOidos, marcarOidos: marcarOidos,
    noOidos: noOidos, iniciarOidos: iniciarOidos, pendientesDeLocutar: pendientesDeLocutar,
    pendientesTranscripcion: pendientesTranscripcion, etiqueta: etiqueta,
    tsDe: tsDe, mergePorHora: mergePorHora, nombre: nombre, cortoDe: cortoDe,
    leerVozOn: leerVozOn, escribirVozOn: escribirVozOn, idHilo: idHilo,
    textoHilo: textoHilo, esTurnoConsejero: esTurnoConsejero,
    iniciarOidosHilo: iniciarOidosHilo, pendientesHiloDeLocutar: pendientesHiloDeLocutar
  };
  root.AdmiraEntreVoces = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  var doc = root.document;
  if (!doc) return;
  var sec = doc.getElementById("entre-consejeros");
  if (!sec) return;
  var silla = sec.getAttribute("data-silla") || "";
  var lista = doc.getElementById("entre-lista");
  var estilo = doc.createElement("style");
  estilo.textContent = "#entre-consejeros .turno.otro{margin-right:auto;align-items:flex-start}#entre-consejeros .turno.otro .burbuja{background:#3a2a22;border-bottom-left-radius:5px}#entre-consejeros .turno.persona{margin-left:auto;align-items:flex-end}#entre-activar-voz,#entre-voz-aviso{font-size:12px;margin-left:8px}#entre-voz-aviso{color:var(--suave,#8b96a5)}";
  doc.head.appendChild(estilo);
  // 19-10-2026: también mensajes con agentes de la flota; filtro Todos / Consejeros / Agentes.
  var filtro = "todos", ultimos = [], ultPend = 0, oidosListos = false, hiloListos = false, vozOn = leerVozOn(), vozDesbloqueada = false, hablando = false, pendiente = null;
  var barra = doc.createElement("div");
  barra.id = "entre-filtro";
  barra.className = "meta";
  [["todos", "Todos"], ["consejeros", "Entre consejeros"], ["agentes", "Con agentes"]].forEach(function (f) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "enlace"; b.textContent = f[1]; b.setAttribute("data-filtro", f[0]);
    b.setAttribute("aria-pressed", f[0] === filtro ? "true" : "false");
    b.addEventListener("click", function () {
      filtro = f[0];
      Array.prototype.forEach.call(barra.querySelectorAll("[data-filtro]"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-filtro") === filtro ? "true" : "false"); });
      pintar(ultimos, ultPend);
    });
    barra.appendChild(b); barra.appendChild(doc.createTextNode(" "));
  });
  function vozDisponible() {
    return !!(root.AdmiraVoces && typeof root.AdmiraVoces.speak === "function" && root.AdmiraVoces.supported && root.AdmiraVoces.supported());
  }
  var btnVoz = doc.createElement("button");
  btnVoz.type = "button";
  btnVoz.id = "entre-activar-voz";
  btnVoz.className = "enlace";
  btnVoz.textContent = vozOn ? "Silenciar voz" : "Activar voz";
  btnVoz.title = "La voz empieza activa. Puedes silenciarla; los mensajes siguen visibles.";
  btnVoz.hidden = true;
  var avisoVoz = doc.createElement("span");
  avisoVoz.id = "entre-voz-aviso";
  avisoVoz.setAttribute("role", "status");
  barra.appendChild(btnVoz);
  barra.appendChild(avisoVoz);
  function pintarVoz() {
    if (!vozDisponible()) {
      btnVoz.hidden = true;
      avisoVoz.textContent = root.AdmiraVoces ? " Este navegador no tiene síntesis de voz." : "";
      return;
    }
    btnVoz.hidden = false;
    btnVoz.textContent = vozOn ? "Silenciar voz" : "Activar voz";
    avisoVoz.textContent = vozOn ? " Voz activa: los mensajes nuevos se oyen con la voz del remitente." : " Voz silenciada.";
  }
  function callarVoz() {
    try { if (root.AdmiraVoces && typeof root.AdmiraVoces.stop === "function") root.AdmiraVoces.stop(); } catch (e) {}
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {}
  }
  function credencialTurno() {
    try { return jwt(); } catch (e) { return ""; }
  }
  function locutarUno(x) {
    if (hablando || !vozOn || !x) return;
    if (!root.AdmiraVoces || typeof root.AdmiraVoces.speak !== "function") return;
    hablando = true;
    pendiente = null;
    var T = root.AdmiraVozTurno;
    var ticket = null;
    var terminar = function () {
      if (ticket && ticket.liberar) try { ticket.liberar(); } catch (e) {}
      hablando = false;
      // No encadenar otra lectura: el siguiente mensaje espera a un sondeo nuevo.
    };
    var decir = function () {
      var ok = root.AdmiraVoces.speak(x.persona, x.texto, {
        onend: terminar,
        onerror: terminar
      });
      if (!ok) terminar();
    };
    if (T && typeof T.aguardarTurno === "function") {
      T.aguardarTurno({
        mensajeId: x.id,
        texto: x.texto,
        fuente: x.fuente || "chat-entre",
        prioridad: "consejero",
        silencioSiSala: (x.fuente || "chat-entre") === "chat-entre",
        credencial: credencialTurno(),
        onPerdido: callarVoz
      }).then(function (t) {
        ticket = t;
        if (!t || !t.concedido) { hablando = false; return; }
        decir();
      }).catch(function () { hablando = false; });
      return;
    }
    decir();
  }
  function encolarUno(item) {
    if (!item) return;
    pendiente = item;
    if (!hablando && vozOn) {
      var x = pendiente;
      pendiente = null;
      locutarUno(x);
    }
  }
  function pararPagina() {
    pendiente = null;
    hablando = false;
    callarVoz();
  }
  function desbloquearAudio() {
    if (!vozOn) return;
    try {
      if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
        var u = new root.SpeechSynthesisUtterance(" ");
        u.volume = 0;
        root.speechSynthesis.speak(u);
      }
      vozDesbloqueada = true;
    } catch (e) {}
    if (pendiente) encolarUno(pendiente);
  }
  function activarVoz() {
    vozOn = escribirVozOn(true);
    pintarVoz();
    desbloquearAudio();
  }
  function silenciarVoz() {
    vozOn = escribirVozOn(false);
    hablando = false;
    pendiente = null;
    callarVoz();
    pintarVoz();
  }
  function alternarVoz() { if (vozOn) silenciarVoz(); else activarVoz(); }
  function gestoDesbloqueo() {
    if (!vozOn) return;
    desbloquearAudio();
    root.removeEventListener("pointerdown", gestoDesbloqueo, true);
    root.removeEventListener("keydown", gestoDesbloqueo, true);
    root.removeEventListener("touchstart", gestoDesbloqueo, true);
  }
  btnVoz.addEventListener("click", alternarVoz);
  root.addEventListener("pointerdown", gestoDesbloqueo, true);
  root.addEventListener("keydown", gestoDesbloqueo, true);
  root.addEventListener("touchstart", gestoDesbloqueo, true);
  root.addEventListener("pagehide", pararPagina, true);
  root.addEventListener("beforeunload", pararPagina, true);
  if (doc.addEventListener) {
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden || doc.visibilityState === "hidden") pararPagina();
    }, true);
  }
  pintarVoz();
  if (vozOn) desbloquearAudio();
  lista.parentNode.insertBefore(barra, lista);
  function conAgente(m) { return esAgente(m); }
  function pintar(msgs, pendientes) {
    ultimos = msgs; ultPend = pendientes;
    msgs = msgs.filter(function (m) { return filtro === "todos" || (filtro === "agentes" ? conAgente(m) : !conAgente(m)); });
    lista.replaceChildren();
    var estado = doc.createElement("p");
    estado.id = "entre-estado";
    estado.className = "meta";
    estado.textContent = pendientes ? (pendientes + " pendiente" + (pendientes === 1 ? "" : "s")) : "Nada pendiente";
    lista.appendChild(estado);
    if (!msgs.length) {
      var v = doc.createElement("p");
      v.id = "entre-vacio";
      v.textContent = "Aún no hay mensajes privados aquí.";
      lista.appendChild(v);
      return;
    }
    msgs.forEach(function (m) {
      var art = doc.createElement("article");
      art.className = "turno " + (m.de === silla ? "persona" : "otro");
      var b = doc.createElement("div");
      b.className = "burbuja";
      b.textContent = textoDe(m) || m.texto || "";
      var meta = doc.createElement("div");
      meta.className = "meta";
      var hora = m.hora ? m.hora.replace("T", " ").slice(0, 16) : "";
      var acuse = m.leido ? (" · leído" + (m.leido_en ? " " + m.leido_en.replace("T", " ").slice(0, 16) : "")) : " · pendiente";
      meta.textContent = nombre(m.de) + (m.de_tipo === "agente" ? " (agente)" : "") + " → " + nombre(m.para) + (m.para_tipo === "agente" ? " (agente)" : "") + " · " + (m.maquina || "") + " · " + hora + acuse;
      art.append(b, meta);
      lista.appendChild(art);
    });
  }
  function locutarSiToca(msgs) {
    if (!silla) return;
    if (!oidosListos) { iniciarOidos(silla, msgs); oidosListos = true; pintarVoz(); return; }
    var nuevos = pendientesDeLocutar(silla, msgs);
    if (!nuevos.length) return;
    encolarUno(nuevos[nuevos.length - 1]);
    if (!vozOn) pintarVoz();
  }
  function locutarHiloSiToca(turnos) {
    if (!silla || !doc.getElementById("hilo")) return;
    if (!hiloListos) { iniciarOidosHilo(silla, turnos); hiloListos = true; return; }
    var nuevos = pendientesHiloDeLocutar(silla, turnos);
    if (!nuevos.length) return;
    encolarUno(nuevos[nuevos.length - 1]);
  }
  api.locutarHiloSiToca = locutarHiloSiToca;
  if (doc.getElementById("hilo") && root.fetch) {
    var fetchOrig = root.fetch.bind(root);
    root.fetch = function (url, opts) {
      var p = fetchOrig(url, opts);
      try {
        var u = typeof url === "string" ? url : (url && url.url) || "";
        if (/\/api\/chat\/hilo\b/.test(String(u))) {
          p.then(function (r) {
            if (!r || !r.ok) return;
            return r.clone().json().then(function (d) {
              if (d && d.ok && Array.isArray(d.turnos)) locutarHiloSiToca(d.turnos);
            }).catch(function () {});
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  }
  function jwt() {
    var C = root.ChatHiloClient;
    try { return C && C.credencial ? C.credencial() : ""; } catch (e) { return ""; }
  }
  function cargar() {
    var t = jwt();
    if (!t) { lista.textContent = "Privado: entra con tu cuenta de Google de admira.live para ver los mensajes entre consejeros."; return; }
    root.fetch("/api/chat/entre-consejeros?con=" + encodeURIComponent(silla), { cache: "no-store", headers: { Authorization: "Bearer " + t } })
      .then(function (r) {
        if (r.status === 401) { lista.textContent = "Tu sesión no está autorizada o ha caducado. Vuelve a entrar."; return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        var msgs = (d && d.mensajes) || [];
        pintar(msgs, Number(d && d.pendientes) || 0);
        locutarSiToca(msgs);
      })
      .catch(function () { lista.textContent = "No se ha podido leer la bandeja."; });
  }
  // r96: este script se carga antes que chat-hilo-client.js; la primera lectura espera a que exista.
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", cargar); else cargar();
  setInterval(cargar, 15000);
  root.addEventListener("chat-hilo-sesion", cargar); // r96: sesión larga restaurada en pestaña nueva

})(typeof window !== "undefined" ? window : globalThis);
