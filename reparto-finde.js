/* REPARTO DEL FINDE — tira compartida (Merovingio · Elon Musk, 10-10-2026 · encargos #5495/#5502/#5506).
 * Pinta los 5 pilares con su responsable y su encargo en el tablero (/teamwork) y en /status.
 * Fuente: /reparto/reparto-finde.json (estático, versionado) + estado vivo del bot-inbox público
 * (bot.yokup.com/api/public/inbox, sin auth). Si el inbox no responde, se ve el reparto igual.
 * Se oculta sola cuando pasa la fecha «hasta». Sin secretos, sin escrituras. */
(function () {
  "use strict";
  if (window.__repartoFinde) return; window.__repartoFinde = true;
  var JSON_URL = "/reparto/reparto-finde.json";
  var INBOX = "https://bot.yokup.com/api/public/inbox";
  var ST = { pending: "pendiente", ack: "acusado", in_progress: "en curso", blocked: "bloqueado", done: "hecho", cancelled: "anulado" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function css() {
    if (document.getElementById("reparto-finde-css")) return;
    var s = document.createElement("style"); s.id = "reparto-finde-css";
    s.textContent = "#reparto-finde{position:relative;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:7px 12px;" +
      "background:#0a1620;border-bottom:1px solid rgba(120,243,255,.30);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#75aab9}" +
      "#reparto-finde .rf-t{color:#78f3ff;font-weight:700;margin-right:4px;text-decoration:none}" +
      "#reparto-finde .rf-c{display:inline-flex;gap:5px;align-items:center;border:1px solid rgba(120,243,255,.22);border-radius:999px;padding:2px 9px;color:#dff8ff;text-decoration:none;white-space:nowrap}" +
      "#reparto-finde .rf-c:hover{border-color:#78f3ff}" +
      "#reparto-finde .rf-c b{color:#ffd866;font-weight:600}" +
      "#reparto-finde .rf-s{font-size:10px;color:#75aab9}" +
      "#reparto-finde .rf-s.done{color:#88ffaa}#reparto-finde .rf-s.pending{color:#ff8866}#reparto-finde .rf-s.blocked{color:#ff8866}";
    (document.head || document.documentElement).appendChild(s);
  }
  function vigente(d) {
    var hasta = d && d.hasta ? new Date(d.hasta + "T23:59:59+02:00") : null;
    return !hasta || Date.now() <= hasta.getTime();
  }
  function pinta(d, estados) {
    var el = document.getElementById("reparto-finde");
    if (!el) { el = document.createElement("div"); el.id = "reparto-finde"; el.setAttribute("role", "note");
      var top = document.getElementById("admira-topbar");
      if (top && top.parentNode) top.parentNode.insertBefore(el, top.nextSibling); else document.body.insertBefore(el, document.body.firstChild); }
    var chips = (d.pilares || []).map(function (p) {
      var st = estados[p.encargo] || "";
      return '<a class="rf-c" href="/reparto/#e' + esc(p.encargo) + '" title="' + esc(p.pilar + " · " + p.agente + (p.supervisa ? " (supervisa " + p.supervisa + ")" : "") + " · encargo " + p.etiqueta) + '">' +
        esc(p.pilar) + ' <b>' + esc(p.agente) + '</b> #' + esc(p.encargo) +
        (st ? ' <span class="rf-s ' + esc(st) + '">' + esc(ST[st] || st) + '</span>' : "") + "</a>";
    }).join("");
    el.innerHTML = '<a class="rf-t" href="/reparto/" title="' + esc((d.dias || "") + " · orden de " + (d.orden || "Carlos")) + '">🧩 Reparto finde 10–12 oct</a>' + chips;
  }
  function arranca() {
    fetch(JSON_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !vigente(d)) return;
      css(); pinta(d, {});
      return fetch(INBOX, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (x) {
        var est = {}; (x && x.items || []).forEach(function (t) { est[t.id] = t.status; });
        pinta(d, est);
      }).catch(function () {});
    }).catch(function () {});
  }
  if (document.body) arranca(); else document.addEventListener("DOMContentLoaded", arranca);
})();
