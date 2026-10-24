/* Mensajes privados entre consejeros. Los escribe el MCP. PRIVADO (19-10-2026): solo con la
   sesión Google autorizada de admira.live, vía /api/chat/entre-consejeros (nunca en abierto). */
(function () {
  "use strict";
  var NOMBRE = { Huang: "Jensen Huang", Musk: "Elon Musk", Lucas: "George Lucas", Jobs: "Steve Jobs", Wozniak: "Steve Wozniak", Disney: "Walt Disney", Y: "Y" };
  var sec = document.getElementById("entre-consejeros");
  if (!sec) return;
  var silla = sec.getAttribute("data-silla") || "";
  var lista = document.getElementById("entre-lista");
  var estilo = document.createElement("style");
  estilo.textContent = "#entre-consejeros .turno.otro{margin-right:auto;align-items:flex-start}#entre-consejeros .turno.otro .burbuja{background:#3a2a22;border-bottom-left-radius:5px}#entre-consejeros .turno.persona{margin-left:auto;align-items:flex-end}";
  document.head.appendChild(estilo);
  function nombre(s) { return NOMBRE[s] || s; }
  // 19-10-2026: también mensajes con agentes de la flota; filtro Todos / Consejeros / Agentes.
  var filtro = "todos", ultimos = [], ultPend = 0;
  var barra = document.createElement("div");
  barra.id = "entre-filtro";
  barra.className = "meta";
  [["todos", "Todos"], ["consejeros", "Entre consejeros"], ["agentes", "Con agentes"]].forEach(function (f) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "enlace"; b.textContent = f[1]; b.setAttribute("data-filtro", f[0]);
    b.setAttribute("aria-pressed", f[0] === filtro ? "true" : "false");
    b.addEventListener("click", function () {
      filtro = f[0];
      Array.prototype.forEach.call(barra.children, function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-filtro") === filtro ? "true" : "false"); });
      pintar(ultimos, ultPend);
    });
    barra.appendChild(b); barra.appendChild(document.createTextNode(" "));
  });
  lista.parentNode.insertBefore(barra, lista);
  function conAgente(m) { return m.de_tipo === "agente" || m.para_tipo === "agente"; }
  function pintar(msgs, pendientes) {
    ultimos = msgs; ultPend = pendientes;
    msgs = msgs.filter(function (m) { return filtro === "todos" || (filtro === "agentes" ? conAgente(m) : !conAgente(m)); });
    lista.replaceChildren();
    var estado = document.createElement("p");
    estado.id = "entre-estado";
    estado.className = "meta";
    estado.textContent = pendientes ? (pendientes + " pendiente" + (pendientes === 1 ? "" : "s")) : "Nada pendiente";
    lista.appendChild(estado);
    if (!msgs.length) {
      var v = document.createElement("p");
      v.id = "entre-vacio";
      v.textContent = "Aún no hay mensajes privados aquí.";
      lista.appendChild(v);
      return;
    }
    msgs.forEach(function (m) {
      var art = document.createElement("article");
      art.className = "turno " + (m.de === silla ? "persona" : "otro");
      var b = document.createElement("div");
      b.className = "burbuja";
      b.textContent = m.texto;
      var meta = document.createElement("div");
      meta.className = "meta";
      var hora = m.hora ? m.hora.replace("T", " ").slice(0, 16) : "";
      var acuse = m.leido ? (" · leído" + (m.leido_en ? " " + m.leido_en.replace("T", " ").slice(0, 16) : "")) : " · pendiente";
      meta.textContent = nombre(m.de) + (m.de_tipo === "agente" ? " (agente)" : "") + " → " + nombre(m.para) + (m.para_tipo === "agente" ? " (agente)" : "") + " · " + (m.maquina || "") + " · " + hora + acuse;
      art.append(b, meta);
      lista.appendChild(art);
    });
  }
  function jwt() {
    var C = window.ChatHiloClient;
    try { return C && C.credencial ? C.credencial() : ""; } catch (e) { return ""; }
  }
  function cargar() {
    var t = jwt();
    if (!t) { lista.textContent = "Privado: entra con tu cuenta de Google de admira.live para ver los mensajes entre consejeros."; return; }
    fetch("/api/chat/entre-consejeros?con=" + encodeURIComponent(silla), { cache: "no-store", headers: { Authorization: "Bearer " + t } })
      .then(function (r) {
        if (r.status === 401) { lista.textContent = "Tu sesión no está autorizada o ha caducado. Vuelve a entrar."; return null; }
        return r.json();
      })
      .then(function (d) { if (d) pintar((d && d.mensajes) || [], Number(d && d.pendientes) || 0); })
      .catch(function () { lista.textContent = "No se ha podido leer la bandeja."; });
  }
  // r96: este script se carga antes que chat-hilo-client.js; la primera lectura espera a que exista.
  setTimeout(cargar, 0);
  setInterval(cargar, 15000);
  window.addEventListener("chat-hilo-sesion", cargar); // r96: sesión larga restaurada en pestaña nueva

})();
