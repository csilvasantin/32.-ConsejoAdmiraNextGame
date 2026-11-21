/*
 * barra-agentes.js — carril de agentes en la barra inferior (SCUMM) de la home de admira.live.
 * r41 (11-10-2026). Criterio de hecho: «la barra inferior muestra, para cada agente, estado + encargos abiertos +
 * % de tokens usados y hora de reinicio».
 *
 * Fuente única: GET /api/flota/trabajando (mismo origen, caché de borde 8 s), cada 30 s y al volver a la pestaña.
 *   estado   → tarjeta.estado (verde trabajando · amarillo con Carlos · gris parado) + motivo en el title
 *   encargos → tarjeta.abiertos (bandeja de Yokup: pending + ack + in_progress + blocked)
 *   cuota    → tarjeta.limite { pct, reinicio, ventana } = la ventana más gastada de su CUENTA, tal y como la da su CLI
 *              (Claude Code: statusline · Codex: rate_limits). Sin dato fresco se dice «sin dato» (nunca un número
 *              aproximado: normativa.html); los motores gratis (Nemotron/DeepAgents) salen «gratis».
 * Se monta en #agentes-rail (dentro de .scumm-bar, debajo de la línea de acción: visible aunque se pliegue el menú).
 */
(function () {
  "use strict";
  var API = "/api/flota/trabajando";
  var CADA_MS = 30000;
  var rail, ultimo = null, timer = 0;

  function T(es, en) { var I = window.AdmiraIdioma; return I && I.t ? I.t(es, en) : es; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var CSS =
    "#agentes-rail{display:flex;flex-wrap:wrap;gap:4px;padding:5px 8px;background:#2a1a08;border-bottom:2px solid #1a1004;" +
    "font-family:'Press Start 2P',monospace;box-sizing:border-box;max-width:100%;min-height:30px;align-items:center}" +
    "#agentes-rail *{box-sizing:border-box}" +
    "#agentes-rail .ar-tit{font-size:7px;color:#daa520;letter-spacing:1px;margin-right:4px;white-space:nowrap}" +
    "#agentes-rail .ar-vacio{font-size:7px;color:#886633}" +
    "#agentes-rail a.ar{display:inline-flex;align-items:center;gap:5px;padding:4px 6px;background:#1a1004;border:1px solid #5a3a1e;" +
    "color:#ffee88;text-decoration:none;font-size:7px;line-height:1.4;white-space:nowrap;box-shadow:1px 1px 0 #000;min-width:0}" +
    "#agentes-rail a.ar:hover{border-color:#daa520;background:#3a2410}" +
    "#agentes-rail .ar-dot{width:7px;height:7px;flex:0 0 7px;border:1px solid #000}" +
    "#agentes-rail .verde .ar-dot{background:#3ddc4a}#agentes-rail .amarillo .ar-dot{background:#ffcc33}#agentes-rail .gris .ar-dot{background:#6b6b6b}" +
    "#agentes-rail .gris{opacity:.78}" +
    "#agentes-rail .ar-n{color:#fff}" +
    "#agentes-rail .ar-enc{color:#ffcc66}#agentes-rail .ar-enc.cero{color:#886633}" +
    "#agentes-rail .ar-q{color:#9fe0ff}#agentes-rail .ar-q.alto{color:#ff9a4a}#agentes-rail .ar-q.lleno{color:#ff5a5a}" +
    "#agentes-rail .ar-q.nd{color:#886633}" +
    "#agentes-rail .ar-bar{display:inline-block;width:22px;height:5px;background:#3a2410;border:1px solid #000;position:relative;vertical-align:middle}" +
    "#agentes-rail .ar-bar i{position:absolute;left:0;top:0;bottom:0;background:currentColor}" +
    "#agentes-rail .ar-sello{font-size:6px;color:#886633;margin-left:auto;white-space:nowrap}" +
    /* Móvil: rejilla de 2 columnas que ocupa el ancho; nada sale de la pantalla (sin scroll horizontal). */
    "@media (max-width:600px){#agentes-rail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;padding:4px 5px}" +
    "#agentes-rail .ar-tit,#agentes-rail .ar-sello{grid-column:1/-1}#agentes-rail .ar-sello{margin-left:0}" +
    "#agentes-rail a.ar{font-size:6px;gap:2px 4px;padding:3px 4px;flex-wrap:wrap;white-space:normal}#agentes-rail .ar-bar{display:none}" +
    "#agentes-rail .ar-q{white-space:nowrap}}";

  function estilo() {
    if (document.getElementById("agentes-rail-css")) return;
    var s = document.createElement("style");
    s.id = "agentes-rail-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function partes(d) {
    var f = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
    var o = {};
    f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  /** Hora de reinicio en hora de Madrid: «19:00» si es hoy, «dom 18 06:04» si cae otro día. */
  function horaReinicio(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "?";
    var r = partes(d), h = partes(new Date());
    var hm = r.hour + ":" + r.minute;
    if (r.year === h.year && r.month === h.month && r.day === h.day) return hm;
    var wd = new Date(Date.UTC(+r.year, +r.month - 1, +r.day)).getUTCDay();
    return T(DIAS[wd], DAYS[wd]) + " " + (+r.day) + " " + hm;
  }
  function ventanaTxt(v) { return v === "7d" ? T("sem", "wk") : v || ""; }

  function chip(t) {
    var est = t.estado === "verde" || t.estado === "amarillo" ? t.estado : "gris";
    var estTxt = est === "verde" ? T("trabajando", "working") : est === "amarillo" ? T("con Carlos", "with Carlos") : T("parado", "idle");
    var ab = t.abiertos;
    var enc = ab == null ? '<span class="ar-enc cero" title="' + esc(T("Sin datos de la bandeja de encargos", "No task inbox data")) + '">📋–</span>'
      : '<span class="ar-enc' + (ab ? "" : " cero") + '">📋' + ab + "</span>";
    var l = t.limite, q, tq;
    if (l && typeof l.pct === "number") {
      var pct = Math.round(l.pct);
      var cls = pct >= 90 ? " lleno" : pct >= 70 ? " alto" : "";
      q = '<span class="ar-q' + cls + '"><span class="ar-bar"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%"></i></span> ' + pct + "%" + (l.ventana === "7d" ? " " + ventanaTxt(l.ventana) : "") + " 🔄" + esc(horaReinicio(l.reinicio)) + "</span>";
      tq = (l.ventanas || [l]).map(function (w) {
        return T("cuota ", "quota ") + ventanaTxt(w.ventana) + ": " + Math.round(w.pct) + "% " + T("usado · reinicia ", "used · resets ") + horaReinicio(w.reinicio);
      }).join(" | ") + (l.haceS != null ? " (" + T("medido hace ", "measured ") + Math.round(l.haceS / 60) + T(" min", " min ago") + ")" : "");
    } else if (t.gratis) {
      q = '<span class="ar-q nd">' + T("gratis", "free") + "</span>";
      tq = T("Motor gratis: sin cuota de tokens", "Free engine: no token quota");
    } else {
      q = '<span class="ar-q nd">' + T("cuota s/d", "quota n/a") + "</span>";
      tq = T("Sin dato fresco de cuota de su cuenta (su CLI no lo informa o no ha trabajado en 6 h)", "No fresh quota data for its account");
    }
    var title = t.agente + " · " + estTxt + (t.motivo ? " — " + t.motivo : "") + "\n" +
      (ab == null ? "" : T("Misiones abiertas: ", "Open missions: ") + ab + (t.bloqueados ? " (" + t.bloqueados + T(" bloqueados", " blocked") + ")" : "") + "\n") + tq;
    return '<a class="ar ' + est + '" href="/asignaciones/" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      '<span class="ar-dot" aria-hidden="true"></span><span class="ar-n">' + esc(t.agente) + "</span>" + enc + q + "</a>";
  }

  var ORDEN = { verde: 0, amarillo: 1, gris: 2 };
  function pintar(d) {
    if (!rail) return;
    var ts = (d && Array.isArray(d.tarjetas) ? d.tarjetas : []).slice();
    ts.sort(function (a, b) {
      return ((ORDEN[a.estado] != null ? ORDEN[a.estado] : 3) - (ORDEN[b.estado] != null ? ORDEN[b.estado] : 3)) ||
        ((b.abiertos || 0) - (a.abiertos || 0)) || String(a.agente).localeCompare(String(b.agente));
    });
    var h = '<span class="ar-tit">' + T("AGENTES", "AGENTS") + "</span>";
    h += ts.length ? ts.map(chip).join("") : '<span class="ar-vacio">' + T("sin datos de la flota", "no fleet data") + "</span>";
    if (d && d.generado) h += '<span class="ar-sello" title="' + esc(T("Fuente: /api/flota/trabajando", "Source: /api/flota/trabajando")) + '">' + esc(horaReinicio(d.generado)) + "</span>";
    rail.innerHTML = h;
    rail.setAttribute("data-agentes", String(ts.length));
  }

  function cargar() {
    clearTimeout(timer);
    fetch(API, { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) { ultimo = d; pintar(d); } else if (!ultimo) pintar(null); })
      .catch(function () { if (!ultimo) pintar(null); })
      .then(function () { timer = setTimeout(cargar, CADA_MS); });
  }

  function montar() {
    rail = document.getElementById("agentes-rail");
    if (!rail) {
      var bar = document.querySelector(".scumm-bar");
      if (!bar) return;
      rail = document.createElement("div");
      rail.id = "agentes-rail";
      var linea = bar.querySelector(".action-line");
      if (linea && linea.nextSibling) bar.insertBefore(rail, linea.nextSibling); else bar.appendChild(rail);
    }
    rail.setAttribute("aria-label", T("Agentes: estado, encargos abiertos y cuota de tokens", "Agents: status, open tasks and token quota"));
    estilo();
    cargar();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) cargar(); });
    window.addEventListener("admira:languagechange", function () { if (ultimo) pintar(ultimo); });
  }

  window.AdmiraBarraAgentes = { _horaReinicio: horaReinicio, _chip: chip, recargar: function () { cargar(); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
