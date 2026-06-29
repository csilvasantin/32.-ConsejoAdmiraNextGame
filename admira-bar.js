/*
 * admira-bar.js — barra superior de navegación consistente en admira.live
 *
 * Se inyecta en todas las páginas EXCEPTO la home (la home tiene su propia barra).
 *   - Barra superior: enlaces de navegación (+ «Usuarios» solo para superusers).
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
    "html.admira-bar-on body{padding-top:46px !important}";

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

    // Enlace "Usuarios" SOLO para superusers (los que acceden a los equipos).
    // Se añade async tras consultar la lista del worker de whitelist.
    maybeAddUsuarios(top);

    document.body.appendChild(top);
  }

  // Inserta el enlace "👥 Usuarios" en la barra superior si el usuario logueado
  // es superuser (según el worker de whitelist). Silencioso si no lo es / falla.
  function maybeAddUsuarios(top) {
    var email = "";
    try {
      var g = JSON.parse(localStorage.getItem("admira_gate") || "null");
      email = g && g.email ? String(g.email).toLowerCase() : "";
    } catch (e) {}
    if (!email) return;
    fetch("https://admira-whitelist.csilvasantin.workers.dev/list", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || (d.superusers || []).indexOf(email) < 0) return;
        if (document.getElementById("admira-link-usuarios")) return;
        var a = document.createElement("a");
        a.id = "admira-link-usuarios";
        a.href = "https://www.admira.live/usuarios.html";
        a.innerHTML = "👥 Usuarios";
        top.appendChild(a);
      })
      .catch(function () {});
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
