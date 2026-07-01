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

  // Nombre del proyecto + versión (v.año.mes.día.release) — a la izquierda del todo.
  var PROJECT = "Admira Consejo";
  var VERSION = "v.2026.07.01.r1";

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
    /* Iconos de panel (portería, estilo Codex/VS Code): avanzado (der) + experto (abajo).
     * Se colocan a la derecha de «Usuarios» y sólo aparecen si la página tiene ese panel. */
    /* Marca del proyecto (izquierda del todo) */
    "#pf-brand{order:-2;display:flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;letter-spacing:.5px;color:#ffdd66;" +
    "border:2px solid #a07828;border-radius:0;background:#3a2410;box-shadow:2px 2px 0 #000;padding:6px 10px;margin-right:6px}" +
    "#pf-brand:hover{border-color:#f0c040;color:#fff}" +
    "#pf-brand .pf-ver{color:#c9a86a;font-size:7px}" +
    /* icono de contraer OPCIONES: a la izquierda (tras la marca) */
    "#pf-toggle-left{order:-1;display:flex;align-items:center;align-self:center;margin-right:6px}" +
    /* iconos AVANZADO + EXPERTO: a la derecha del todo, tras el usuario */
    "#pf-toggles{order:100;display:flex;gap:5px;align-items:center;align-self:center;margin-left:auto}" +
    ".pf-ico{width:27px;height:25px;display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "border:2px solid #8b5a14;border-radius:0;background:#2a1a08;box-shadow:2px 2px 0 #000;padding:0}" +
    ".pf-ico svg{width:15px;height:14px;display:block}" +
    ".pf-ico .frame{fill:none;stroke:#a07828;stroke-width:1.4}" +
    ".pf-ico .panel{fill:#5a4020}" +
    ".pf-ico.on .frame{stroke:#ffdd66}" +
    ".pf-ico.on .panel{fill:#ffdd66}" +
    ".pf-ico:hover{border-color:#f0c040}" +
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

    // Marca del proyecto + versión, a la izquierda del todo (CSS order:-2).
    var brand = document.createElement("a");
    brand.id = "pf-brand";
    brand.href = "https://www.admira.live/";
    brand.innerHTML = "🏛️ " + PROJECT + ' <span class="pf-ver">' + VERSION + "</span>";
    top.appendChild(brand);

    document.body.appendChild(top);

    // Iconos de panel de la portería (a la derecha). Se colocan antes de que
    // maybeAddUsuarios inserte «Usuarios» delante de ellos → quedan a su derecha.
    buildToggles(top);

    // Enlace "Usuarios" SOLO para superusers (los que acceden a los equipos).
    // Se añade async tras consultar la lista del worker de whitelist.
    maybeAddUsuarios(top);
  }

  // Crea un icono toggle SCUMM para un panel; null si el panel no existe en la página.
  function makeToggle(p) {
    if (!document.querySelector(p.sel)) return null;
    if (localStorage.getItem(p.ls) === "0") document.body.classList.add(p.cls);
    var on = !document.body.classList.contains(p.cls);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pf-ico" + (on ? " on" : "");
    b.title = p.title;
    b.innerHTML = '<svg viewBox="0 0 16 14">' + p.svg + "</svg>";
    b.onclick = function () {
      var off = document.body.classList.toggle(p.cls);
      localStorage.setItem(p.ls, off ? "0" : "1");
      b.classList.toggle("on", !off);
    };
    return b;
  }

  // Iconos toggle (estilo Codex, look SCUMM). Sólo aparece el icono si la página
  // tiene ese panel. Alternan clases body.pf-*-off (cada página define qué ocultan).
  //   · OPCIONES (panel izquierdo) → icono a la IZQUIERDA DEL TODO.
  //   · AVANZADO (panel derecho) + EXPERTO (panel inferior) → a la DERECHA de «Usuarios».
  function buildToggles(top) {
    var left = makeToggle({ sel: ".rail-left", cls: "pf-left-off", ls: "pf_left",
      title: "Contraer opciones · panel izquierdo",
      svg: '<rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="1.6" y="1.6" width="4.4" height="10.8" rx="1"/>' });
    if (left) {
      var lw = document.createElement("div");
      lw.id = "pf-toggle-left";
      lw.appendChild(left);
      top.insertBefore(lw, top.firstChild);
    }
    var box = document.createElement("div");
    box.id = "pf-toggles";
    var any = false;
    [
      { sel: ".rail-right", cls: "pf-right-off", ls: "pf_right", title: "Avanzado · panel derecho",
        svg: '<rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="10" y="1.6" width="4.4" height="10.8" rx="1"/>' },
      { sel: ".rail-bottom", cls: "pf-bottom-off", ls: "pf_bottom", title: "Modo experto · panel inferior",
        svg: '<rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="1.6" y="8.4" width="12.8" height="4" rx="1"/>' }
    ].forEach(function (p) {
      var b = makeToggle(p);
      if (b) { any = true; box.appendChild(b); }
    });
    if (any) top.appendChild(box);
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
        // Insertar «Usuarios» ANTES de los iconos de panel → los iconos quedan a su derecha.
        top.insertBefore(a, document.getElementById("pf-toggles"));
      })
      .catch(function () {});
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
