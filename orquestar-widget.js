/* Orquestador · recomendación «¿a quién va esta tarea?» (GrokBotBox, 09-10-2026).
   Pinta en #orquestar-tipos una fila por tipo común con el elegido y el top 3 de /api/orquestar. */
(function () {
  "use strict";
  var TIPOS = [["codigo", "Código"], ["web", "Web"], ["demo", "Demo"], ["investigacion", "Investigación"], ["consejo", "Consejo"], ["creativo", "Creativo"]];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var BADGE = ' <em class="con-carlos" title="Carlos está trabajando con este agente: no se le inyectan encargos">con Carlos</em>';
  function conCarlos(d) {
    var ex = (d.excluidos || []).filter(function (x) { return x.conCarlos; }).map(function (x) { return esc(x.persona) + BADGE; });
    return ex.length ? ' · <small>excluido: </small>' + ex.join(", ") : "";
  }
  function top3(d) {
    return (d.candidatos || []).slice(0, 3).map(function (c, i) {
      return (i + 1) + ". " + esc(c.persona) + (c.conCarlos ? BADGE : "") + " <small>(" + (c.libre && c.libre.libre ? "libre" : "no libre") + ", " + (c.margenPct == null ? "margen ?" : Math.round(c.margenPct) + " %") + ", " + c.puntuacion + ")</small>";
    }).join(" · ");
  }
  function fila(etiqueta, d) {
    return '<li><strong>' + esc(etiqueta) + ':</strong> ' + esc(d.elegido ? d.elegido.motivo : "nadie") + '<br><span class="orq-top">' + top3(d) + conCarlos(d) + '</span></li>';
  }
  function pedir(q) { return fetch("/api/orquestar?" + q, { cache: "no-store" }).then(function (r) { return r.json(); }); }
  var lista = document.getElementById("orquestar-tipos");
  if (lista) {
    Promise.all(TIPOS.map(function (t) { return pedir("tipo=" + t[0]).catch(function () { return {}; }); })).then(function (rs) {
      lista.innerHTML = rs.map(function (d, i) { return fila(TIPOS[i][1], d); }).join("");
      // r37 (/consumos plegado): una línea con el elegido de cada tipo — «Código Neo · Web Neo · …».
      var res = document.getElementById("orquestar-resumen");
      if (res) res.innerHTML = rs.map(function (d, i) { var e = d.elegido; var n = e ? (e.persona || e.agente || String(e.motivo || "").split(":")[0]) : "nadie"; return esc(TIPOS[i][1]) + " <b>" + esc(n) + "</b>"; }).join(" · ");
      var g = document.getElementById("orquestar-generado");
      if (g && rs[0] && rs[0].generado) g.textContent = "Calculado " + new Date(rs[0].generado).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) + " (Madrid) · " + (rs[0].regla || "");
    });
  }
  var form = document.getElementById("orquestar-form");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = document.getElementById("orquestar-salida");
    var texto = form.elements.texto.value.trim();
    out.textContent = "Pensando…";
    pedir("texto=" + encodeURIComponent(texto)).then(function (d) { out.innerHTML = '<ul>' + fila("Tipo " + d.tipo, d) + '</ul>'; }).catch(function () { out.textContent = "No responde /api/orquestar"; });
  });
})();
