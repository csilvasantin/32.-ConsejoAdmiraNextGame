/* Mensajes privados entre consejeros. Los escribe el MCP. PRIVADO (19-10-2026): solo con la
   sesión Google autorizada de admira.live, vía /api/chat/entre-consejeros (nunca en abierto).
   12-11-2026: locuta cada mensaje NUEVO entre consejeros con la voz del remitente
   (AdmiraVoces). En la primera carga marca los ya existentes como oídos y no los relée. */
(function (root) {
  "use strict";
  var NOMBRE = { Huang: "Jensen Huang", Musk: "Elon Musk", Lucas: "George Lucas", Jobs: "Steve Jobs", Wozniak: "Steve Wozniak", Disney: "Walt Disney", Y: "Y" };
  var LS_OIDOS = "admira_entre_oidos_v1";
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
      return { id: idDe(m), de: m.de, persona: nombre(m.de), texto: textoDe(m) };
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
    NOMBRE: NOMBRE, LS_OIDOS: LS_OIDOS, CORTO: CORTO, textoDe: textoDe, idDe: idDe,
    esAgente: esAgente, esEntrante: esEntrante, leerOidos: leerOidos,
    escribirOidos: escribirOidos, marcarOidos: marcarOidos, noOidos: noOidos,
    iniciarOidos: iniciarOidos, pendientesDeLocutar: pendientesDeLocutar,
    pendientesTranscripcion: pendientesTranscripcion, etiqueta: etiqueta,
    tsDe: tsDe, mergePorHora: mergePorHora, nombre: nombre, cortoDe: cortoDe
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
  var filtro = "todos", ultimos = [], ultPend = 0, oidosListos = false, vozOn = false, hablando = false, cola = [];
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
  btnVoz.textContent = "Activar voz";
  btnVoz.title = "Un clic desbloquea el audio (hace falta en Firefox) y oirás los mensajes nuevos con la voz de quien los escribe.";
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
    btnVoz.hidden = vozOn;
    avisoVoz.textContent = vozOn ? " Voz activa: los mensajes nuevos se oyen con la voz del remitente." : "";
  }
  function soltarCola() {
    if (hablando || !vozOn || !vozDisponible()) return;
    var x = cola.shift();
    if (!x) return;
    hablando = true;
    var ok = root.AdmiraVoces.speak(x.persona, x.texto, {
      onend: function () { hablando = false; soltarCola(); },
      onerror: function () { hablando = false; soltarCola(); }
    });
    if (!ok) { hablando = false; soltarCola(); }
  }
  function desbloquearVoz() {
    vozOn = true;
    try {
      if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
        var u = new root.SpeechSynthesisUtterance(" ");
        u.volume = 0;
        root.speechSynthesis.speak(u);
      }
    } catch (e) {}
    pintarVoz();
    soltarCola();
  }
  btnVoz.addEventListener("click", desbloquearVoz);
  pintarVoz();
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
    nuevos.forEach(function (n) { cola.push(n); });
    if (vozOn) soltarCola();
    else pintarVoz();
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
