/*
 * admira-bar.js — barra superior + botones inferiores consistentes en admira.live
 *
 * Se inyecta en todas las páginas EXCEPTO la home (la home tiene su propia barra
 * funcional con HACKEO/Agentes/Tareas/Yarig).
 *   - Barra superior: enlaces de navegación.
 *   - Botones inferiores agrupados: CONTROL · DEMO · DIARIO.
 * Uso: <script src="/admira-bar.js"></script> en el <head> de cada página.
 */
(function () {
  // No ejecutar en la home (raíz). Cubre "/", "/index.html".
  var path = location.pathname.replace(/index\.html$/, "");
  if (path === "/" || path === "") return;

  var TOP = [
    { t: "🏛️ Consejo",   h: "https://www.admira.live/" },
    { t: "📊 Dashboard",  h: "https://www.admira.live/dashboard.html" },
    { t: "🏠 AdmiraNeXT", h: "https://www.admira.live/equipos" },
    { t: "💬 Telegram",   h: "https://www.admira.live/telegram" },
  ];
  var BOT = [
    { t: "🎛️ CONTROL", h: "https://www.admira.live/control/" },
    { t: "🎬 DEMO",    h: "https://www.admira.studio/" },
    { t: "📓 DIARIO",  h: "https://csilvasantin.github.io/diario/" },
  ];

  var css =
    "#admira-topbar{position:fixed;top:0;left:0;right:0;z-index:99990;display:flex;gap:6px;align-items:center;" +
    "padding:6px 12px;background:rgba(8,8,18,.94);backdrop-filter:blur(6px);border-bottom:1px solid #2a2a40;" +
    "font-family:'Andale Mono',Monaco,Menlo,monospace;overflow-x:auto;scrollbar-width:none}" +
    "#admira-topbar::-webkit-scrollbar{display:none}" +
    "#admira-topbar a{color:#daa520;text-decoration:none;font-size:11px;border:1px solid #3a3550;border-radius:999px;" +
    "padding:4px 10px;white-space:nowrap;background:#12101e}" +
    "#admira-topbar a:hover{border-color:#daa520;color:#ffdd66}" +
    "#admira-botbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99990;display:flex;gap:6px}" +
    "#admira-botbar a{font-family:'Andale Mono',Monaco,Menlo,monospace;color:#9effb0;text-decoration:none;font-size:11px;" +
    "border:1px solid #2a4a35;border-radius:999px;padding:6px 12px;white-space:nowrap;font-weight:bold;" +
    "background:rgba(10,20,14,.94);backdrop-filter:blur(6px)}" +
    "#admira-botbar a:hover{border-color:#9effb0;color:#fff}" +
    "html.admira-bar-on body{padding-top:40px !important;padding-bottom:54px !important}";

  function mount() {
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    document.documentElement.classList.add("admira-bar-on");

    var top = document.createElement("div");
    top.id = "admira-topbar";
    top.innerHTML = TOP.map(function (i) { return '<a href="' + i.h + '">' + i.t + "</a>"; }).join("");

    var bot = document.createElement("div");
    bot.id = "admira-botbar";
    bot.innerHTML = BOT.map(function (i) { return '<a href="' + i.h + '" target="_blank" rel="noopener">' + i.t + "</a>"; }).join("");

    document.body.appendChild(top);
    document.body.appendChild(bot);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
