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
    /* Barra superior con el look SCUMM de la home (madera Monkey Island + badges
     * ámbar cuadrados + sombra pixel + Press Start 2P) → integración consistente. */
    "#admira-topbar{position:fixed;top:0;left:0;right:0;z-index:99990;display:flex;gap:6px;align-items:stretch;" +
    "padding:5px 10px;background:#5a3a1e;border-bottom:3px solid #8b5a14;border-top:2px solid #a07828;box-shadow:0 3px 0 #000;" +
    "font-family:'Press Start 2P',monospace;overflow-x:auto;scrollbar-width:thin;scrollbar-color:#a07828 #3a2410}" +
    "#admira-topbar::-webkit-scrollbar{height:7px}" +
    "#admira-topbar::-webkit-scrollbar-track{background:#3a2410}" +
    "#admira-topbar::-webkit-scrollbar-thumb{background:#a07828;border:1px solid #5a3a1e}" +
    "#admira-topbar a{display:flex;align-items:center;color:#ffdd66;text-decoration:none;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;line-height:1.5;letter-spacing:.5px;" +
    "border:2px solid #8b5a14;border-radius:0;padding:6px 9px;white-space:nowrap;background:#2a1a08;box-shadow:2px 2px 0 #000}" +
    "#admira-topbar a:hover{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    "#admira-botbar{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:99990;display:flex;gap:8px}" +
    /* estilo SCUMM (madera/ámbar/sombra pixel 3D), como la barra de la home */
    "#admira-botbar a{font-family:'Andale Mono',Monaco,Menlo,monospace;color:#ffdd66;text-decoration:none;font-size:11px;" +
    "font-weight:bold;letter-spacing:1px;text-transform:uppercase;border:2px solid #6b5524;border-radius:4px;" +
    "padding:7px 13px;white-space:nowrap;background:#15110a;box-shadow:3px 3px 0 #000}" +
    "#admira-botbar a:hover{background:#2a2110;border-color:#ffdd66;color:#fff;transform:translate(1px,1px);box-shadow:2px 2px 0 #000}" +
    "html.admira-bar-on body{padding-top:46px !important;padding-bottom:54px !important}";

  function mount() {
    // fuente pixel de la home (Press Start 2P) para que la barra case con el SCUMM
    var f = document.createElement("link");
    f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
    document.head.appendChild(f);
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
