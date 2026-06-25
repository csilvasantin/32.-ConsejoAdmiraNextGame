/*
 * admira-bar.js — barra superior + botones inferiores consistentes en admira.live
 *
 * Se inyecta en todas las páginas EXCEPTO la home (la home tiene su propia barra
 * funcional con HACKEO/Agentes/Tareas/Yarig).
 *   - Barra superior: enlaces de navegación.
 *   - Botones inferiores agrupados (4, como la home): HACKEO · CONTROL · DIARIO · DEMO.
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
  // 4 opciones, como la barra inferior de la home: HACKEO · CONTROL · DIARIO · DEMO.
  // El lanzador del HACKEO vive en la home, así que el botón lleva ahí.
  var BOT = [
    { t: "🕵️ HACKEO",  h: "https://www.admira.live/" },
    { t: "🎛️ CONTROL", h: "https://www.admira.live/control/" },
    { t: "📓 DIARIO",  h: "https://www.admira.live/diario.html" },
    { t: "🎬 DEMO",    h: "https://www.admira.studio/" },
  ];

  var css =
    "#admira-topbar{position:fixed;top:0;left:0;right:0;z-index:99990;display:flex;gap:6px;align-items:center;" +
    "padding:6px 12px;background:rgba(8,8,18,.94);backdrop-filter:blur(6px);border-bottom:1px solid #2a2a40;" +
    "font-family:'Andale Mono',Monaco,Menlo,monospace;overflow-x:auto;scrollbar-width:none}" +
    "#admira-topbar::-webkit-scrollbar{display:none}" +
    "#admira-topbar a{color:#daa520;text-decoration:none;font-size:11px;border:1px solid #3a3550;border-radius:999px;" +
    "padding:4px 10px;white-space:nowrap;background:#12101e}" +
    "#admira-topbar a:hover{border-color:#daa520;color:#ffdd66}" +
    "#admira-botbar{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:99990;display:flex;gap:8px}" +
    /* estilo SCUMM (madera/ámbar/sombra pixel 3D), como la barra de la home */
    "#admira-botbar a{font-family:'Andale Mono',Monaco,Menlo,monospace;color:#ffdd66;text-decoration:none;font-size:11px;" +
    "font-weight:bold;letter-spacing:1px;text-transform:uppercase;border:2px solid #6b5524;border-radius:4px;" +
    "padding:7px 13px;white-space:nowrap;background:#15110a;box-shadow:3px 3px 0 #000}" +
    "#admira-botbar a:hover{background:#2a2110;border-color:#ffdd66;color:#fff;transform:translate(1px,1px);box-shadow:2px 2px 0 #000}" +
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
