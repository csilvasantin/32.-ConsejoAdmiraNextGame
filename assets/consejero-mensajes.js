/* Mensajes privados entre consejeros, visibles sin login. Los escribe el MCP. */
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
  function pintar(msgs, pendientes) {
    lista.replaceChildren();
    var estado = document.createElement("p");
    estado.id = "entre-estado";
    estado.className = "meta";
    estado.textContent = pendientes ? (pendientes + " pendiente" + (pendientes === 1 ? "" : "s")) : "Nada pendiente";
    lista.appendChild(estado);
    if (!msgs.length) {
      var v = document.createElement("p");
      v.id = "entre-vacio";
      v.textContent = "Aún no hay mensajes entre consejeros.";
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
      meta.textContent = nombre(m.de) + " → " + nombre(m.para) + " · " + (m.maquina || "") + " · " + hora + acuse;
      art.append(b, meta);
      lista.appendChild(art);
    });
  }
  function cargar() {
    fetch("https://mcp.admira.live/consejero/mensajes?con=" + encodeURIComponent(silla), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { pintar((d && d.mensajes) || [], Number(d && d.pendientes) || 0); })
      .catch(function () { lista.textContent = "No se ha podido leer la bandeja."; });
  }
  cargar();
  setInterval(cargar, 15000);
})();
