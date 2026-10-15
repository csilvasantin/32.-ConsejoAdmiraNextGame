/* Rótulo vivo de los 16 consejeros en la home de admira.live.
   Cada placa alterna cada 15 s entre el título del cargo y el proyecto.
   Debajo: estado en vivo, encargos abiertos, consumo y si la máquina está encendida.
   Sin dato no se inventa un número: se dice sin proyecto, sin latido o sin medición.
   Fuente: GET /api/flota/trabajando (la misma que la barra de agentes). */
(function () {
  "use strict";
  var CADA = 15000;
  var API = "/api/flota/trabajando";
  var TITULO = {
    "Steve Jobs": "Chief Executive Officer",
    "Steve Wozniak": "Chief Technology Officer",
    "Tim Cook": "Chief Operations Officer",
    "Warren Buffett": "Chief Financial Officer",
    "Walt Disney": "Chief Creative Officer",
    "Dieter Rams": "Chief Design Officer",
    "Howard Schultz": "Chief Experience Officer",
    "George Lucas": "Chief Storytelling Officer",
    "Elon Musk": "Chief Executive Officer",
    "Jensen Huang": "Chief Technology Officer",
    "Gwynne Shotwell": "Chief Operations Officer",
    "Ruth Porat": "Chief Financial Officer",
    "John Lasseter": "Chief Creative Officer",
    "Jony Ive": "Chief Design Officer",
    "Carlos Ratti": "Chief Experience Officer",
    "Ryan Reynolds": "Chief Storytelling Officer"
  };
  var datos = null;

  function fase() { return Math.floor(Date.now() / CADA) % 2; }

  function tarjeta(persona) {
    var apellido = String(persona || "").trim().split(/\s+/).pop().toLowerCase();
    var ts = (datos && datos.tarjetas) || [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (!(t.consejero || t.grupo === "consejeros")) continue;
      if (String(t.agente || "").toLowerCase() === apellido) return t;
    }
    return null;
  }

  function proyecto(t) {
    if (!t) return "sin proyecto";
    var f = t.foco;
    if (f && f.proyecto && f.fuente !== "training") {
      return f.proyecto + (f.defecto ? " · por defecto" : "");
    }
    if (t.proyecto) return t.proyecto;
    return "sin proyecto";
  }

  function consumo(t) {
    if (!t) return "consumo s/d";
    if (t.gratis) return "gratis";
    if (t.limite && typeof t.limite.pct === "number") return Math.round(t.limite.pct) + "% cuota";
    return "sin medición";
  }

  function estado(t, np) {
    var maquina = np && np.classList.contains("gold") ? "máquina encendida" : "máquina apagada";
    if (!t) return "sin latido · " + maquina;
    var vivo = t.estado === "verde" ? "trabajando" : t.estado === "amarillo" ? "con Carlos" : "parado";
    return vivo + " · " + maquina;
  }

  function encargos(t) {
    if (!t || t.abiertos == null) return "encargos s/d";
    return t.abiertos + (t.abiertos === 1 ? " encargo" : " encargos");
  }

  function asegurar(np) {
    var rota = np.querySelector(":scope > .np-rota");
    if (!rota) {
      rota = document.createElement("span");
      rota.className = "np-rota";
      np.appendChild(rota);
    }
    var meta = np.querySelector(":scope > .np-meta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "np-meta";
      np.appendChild(meta);
    }
    return { rota: rota, meta: meta };
  }

  function pintar() {
    var f = fase();
    var placas = document.querySelectorAll("#nameplates .np[data-persona]");
    for (var i = 0; i < placas.length; i++) {
      var np = placas[i];
      var persona = np.getAttribute("data-persona");
      var t = tarjeta(persona);
      var nodes = asegurar(np);
      var titulo = TITULO[persona] || "";
      var proy = proyecto(t);
      nodes.rota.textContent = f === 0 ? titulo : proy;
      nodes.rota.setAttribute("title", "Cada 15 s: título ↔ proyecto. Ahora: " + (f === 0 ? "título" : "proyecto"));
      var meta = estado(t, np) + " · " + encargos(t) + " · " + consumo(t);
      nodes.meta.textContent = meta;
      np.setAttribute("data-rotulo", persona + " · " + titulo + " · " + proy + " · " + meta);
      np.classList.toggle("np-estado-verde", !!(t && t.estado === "verde"));
      np.classList.toggle("np-estado-amarillo", !!(t && t.estado === "amarillo"));
    }
  }

  function estilo() {
    if (document.getElementById("consejo-rotulo-css")) return;
    var s = document.createElement("style");
    s.id = "consejo-rotulo-css";
    s.textContent = [
      "#nameplates .np{white-space:normal;max-width:150px;overflow:visible}",
      "#nameplates .np .np-rota,#nameplates .np .np-meta{display:block;text-transform:none;letter-spacing:0;font-weight:700;line-height:1.2;white-space:normal}",
      "#nameplates .np .np-rota{font-size:.42rem;color:#fff8d0;margin-top:2px}",
      "#nameplates .np.gray .np-rota,#nameplates .np.gray .np-meta{color:#ddd}",
      "#nameplates .np .np-meta{font-size:.34rem;opacity:.95}",
      "#nameplates .np.np-estado-verde{box-shadow:0 0 8px rgba(61,220,74,.75)}",
      "#nameplates .np.np-estado-amarillo{box-shadow:0 0 8px rgba(255,204,51,.8)}"
    ].join("");
    document.head.appendChild(s);
  }

  function leer() {
    return fetch(API, { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) datos = d; pintar(); })
      .catch(function () { pintar(); });
  }

  function arranca() {
    estilo();
    leer();
    setInterval(pintar, 1000);
    setInterval(function () { if (!document.hidden) leer(); }, 30000);
    var caja = document.getElementById("nameplates");
    if (caja && window.MutationObserver) {
      new MutationObserver(function () { pintar(); }).observe(caja, { childList: true });
    }
  }

  window.ConsejoRotulo = { tarjeta: tarjeta, proyecto: proyecto, consumo: consumo, estado: estado, encargos: encargos, fase: fase, TITULO: TITULO };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arranca);
  else arranca();
})();
