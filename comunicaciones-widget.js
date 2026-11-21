(function () {
  var API = "/api/consejo/comunicaciones?limite=40";
  var REFRESH_MS = 30000;
  function etiqueta(total) {
    var n = Number(total) || 0;
    return n === 1 ? "1 comunicación" : n + " comunicaciones";
  }
  function actualizar(el, data) {
    var total = data && Number.isFinite(data.total) ? data.total : 0;
    var label = etiqueta(total);
    // Carlos, 21-11-2026: la sección se llama DeepAgents; el contador se queda al lado del nombre.
    el.textContent = "🤖 DeepAgents · " + total;
    el.setAttribute("data-en", "🤖 DeepAgents · " + total);
    el.title = "DeepAgents · " + label + " entre consejeros · se actualiza sola";
  }
  function cargar(el) {
    fetch(API, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (d) { if (d && d.ok !== false) actualizar(el, d); })
      .catch(function () {});
  }
  function montar() {
    var el = document.getElementById("badge-comunicaciones");
    if (!el) return;
    cargar(el);
    setInterval(function () { cargar(el); }, REFRESH_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
