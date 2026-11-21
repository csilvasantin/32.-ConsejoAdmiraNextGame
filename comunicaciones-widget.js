(function () {
  var API = "/api/consejo/comunicaciones?limite=40";
  var REFRESH_MS = 30000;
  function etiqueta(total) {
    var n = Number(total) || 0;
    return n === 1 ? "1 comunicación" : n + " comunicaciones";
  }
  // Carlos, 21-11-2026: la sección se llama DeepAgents y es una pestaña más de la barra única,
  // justo antes de Consumo. El contador va como insignia junto al nombre, en la home, en las
  // subpáginas (admira-bar.js) y en la plataforma (yk-frame.js): todas usan #badge-comunicaciones.
  function actualizar(el, data) {
    var total = data && Number.isFinite(data.total) ? data.total : 0;
    var label = etiqueta(total);
    var n = el.querySelector(".admira-da-n");
    if (!n) {
      // Conserva el rótulo (🤖 DeepAgents) y añade la insignia; los contadores del marco quedan.
      if (!el.querySelector(".admira-da-t")) {
        var t = document.createElement("span");
        t.className = "admira-da-t";
        t.textContent = "🤖 DeepAgents";
        while (el.firstChild && el.firstChild.nodeType === 3) el.removeChild(el.firstChild);
        el.insertBefore(t, el.firstChild);
      }
      n = document.createElement("span");
      n.className = "admira-da-n";
      el.querySelector(".admira-da-t").after(n);
    }
    n.textContent = String(total);
    el.removeAttribute("data-en");
    el.title = "DeepAgents · " + label + " entre consejeros · se actualiza sola";
    el.setAttribute("aria-label", "DeepAgents · " + label);
  }
  function cargar() {
    var el = document.getElementById("badge-comunicaciones");
    if (!el) return;
    fetch(API, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (d) { if (d && d.ok !== false) actualizar(el, d); })
      .catch(function () {});
  }
  var montado = false;
  function montar() {
    if (montado) { cargar(); return; }
    montado = true;
    cargar();
    // La barra de subpáginas y el marco montan su pestaña después: segundo intento corto.
    setTimeout(cargar, 1500);
    setInterval(cargar, REFRESH_MS);
  }
  window.AdmiraDeepAgentsContador = montar;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
