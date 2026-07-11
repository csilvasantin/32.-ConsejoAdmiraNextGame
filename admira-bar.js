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
  // La MARCA enlaza a la home (regla: el nombre del site siempre vuelve a la home).
  var PROJECT = "Consejo AdmiraNeXT";
  var VERSION = "v.2026.07.02.r12";

  // Nav idéntico al top-bar de la home (mismos badges, mismos destinos) → coherencia.
  var TOP = [
    { t: "📊 Dashboard", h: "https://www.admira.live/dashboard.html" },
    { t: "🖥️ Control",   h: "https://www.admira.live/control/" },
    { t: "📺 Players",   h: "https://www.admira.live/players/" },
    { t: "🌐 Navegadores", h: "https://www.admira.live/navegadores/" },
    { t: "💬 Telegram",  h: "https://www.admira.live/telegram" },
    { t: "🎯 Misiones",  h: "https://www.admira.live/vista-previa" },
    { t: "📓 Diario",    h: "https://www.admira.live/diario.html" },
  ];

  var css =
    /* Barra superior con el look SCUMM de la home (madera Monkey Island + badges
     * ámbar cuadrados + sombra pixel + Press Start 2P) → integración consistente.
     * RESPONSIVE: en ancho suficiente todo va en una fila; al estrecharse, los enlaces
     * de navegación se colapsan tras un botón ☰ (hamburguesa) y se abren en un panel
     * desplegable, mientras la marca, los 3 contadores y los iconos de panel siguen
     * visibles. Nunca hay scroll horizontal de página ni elementos cortados. */
    "#admira-topbar{position:fixed;top:0;left:0;right:0;z-index:99990;display:flex;gap:6px;align-items:stretch;" +
    "padding:5px 10px;background:#5a3a1e;border-bottom:3px solid #8b5a14;border-top:2px solid #a07828;box-shadow:0 3px 0 #000;" +
    "font-family:'Press Start 2P',monospace;box-sizing:border-box;max-width:100vw;flex-wrap:nowrap}" +
    "#admira-topbar *{box-sizing:border-box}" +
    "#admira-topbar a{display:flex;align-items:center;color:#ffdd66;text-decoration:none;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;line-height:1.5;letter-spacing:.5px;" +
    "border:2px solid #8b5a14;border-radius:0;padding:6px 9px;white-space:nowrap;background:#2a1a08;box-shadow:2px 2px 0 #000}" +
    "#admira-topbar a:hover{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    "#admira-topbar a.active{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    /* Contenedor de los enlaces de navegación (para poder colapsarlos en móvil) */
    "#admira-nav{order:0;display:flex;gap:6px;align-items:stretch;flex:1 1 auto;min-width:0;overflow-x:auto;" +
    "scrollbar-width:thin;scrollbar-color:#a07828 #3a2410}" +
    "#admira-nav::-webkit-scrollbar{height:7px}" +
    "#admira-nav::-webkit-scrollbar-track{background:#3a2410}" +
    "#admira-nav::-webkit-scrollbar-thumb{background:#a07828;border:1px solid #5a3a1e}" +
    /* Botón hamburguesa (oculto por defecto; solo aparece en móvil vía media query) */
    "#admira-burger{order:-1;display:none;align-items:center;justify-content:center;cursor:pointer;" +
    "min-width:44px;min-height:38px;align-self:center;font-size:16px;color:#ffdd66;" +
    "border:2px solid #8b5a14;border-radius:0;background:#2a1a08;box-shadow:2px 2px 0 #000;padding:0 10px}" +
    "#admira-burger:hover{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    /* Iconos de panel (portería, estilo Codex/VS Code): avanzado (der) + experto (abajo).
     * Se colocan a la derecha de «Usuarios» y sólo aparecen si la página tiene ese panel. */
    /* Marca del proyecto (izquierda del todo) */
    "#pf-brand{order:-2;display:flex;flex-direction:column;align-items:center;gap:0;white-space:nowrap;text-decoration:none;flex:0 0 auto;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;letter-spacing:.5px;color:#ffdd66;" +
    "border:2px solid #a07828;border-radius:0;background:#3a2410;box-shadow:2px 2px 0 #000;padding:6px 10px;margin-right:6px}" +
    "#pf-brand:hover{border-color:#f0c040;color:#fff}" +
    "#pf-brand .pf-ver{color:#c9a86a;font-size:0.4rem;margin-top:3px;letter-spacing:0}" +
    /* icono de contraer OPCIONES: a la izquierda (tras la marca) */
    "#pf-toggle-left{order:-3;display:flex;align-items:center;align-self:center;margin-right:6px;flex:0 0 auto}" +
    /* iconos AVANZADO + EXPERTO: a la derecha del todo, tras el usuario */
    "#pf-toggles{order:100;display:flex;gap:5px;align-items:center;align-self:center;flex:0 0 auto}" +
    ".pf-ico{width:27px;height:25px;display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "border:2px solid #8b5a14;border-radius:0;background:#2a1a08;box-shadow:2px 2px 0 #000;padding:0}" +
    ".pf-ico svg{width:15px;height:14px;display:block}" +
    ".pf-ico .frame{fill:none;stroke:#a07828;stroke-width:1.4}" +
    ".pf-ico .panel{fill:#5a4020}" +
    ".pf-ico.on .frame{stroke:#ffdd66}" +
    ".pf-ico.on .panel{fill:#ffdd66}" +
    ".pf-ico:hover{border-color:#f0c040}" +
    /* Stats de flota en la barra (barra unificada: mismos que la home en TODAS las páginas) */
    ".admira-summary{order:50;display:flex;gap:9px;align-items:center;margin-left:auto;flex:0 0 auto;align-self:center}" +
    ".admira-summary .as-item{display:flex;flex-direction:column;align-items:center;line-height:1;font-family:'Press Start 2P',monospace}" +
    ".admira-summary .as-num{font-size:12px;color:#ffdd66}" +
    ".admira-summary .as-num.as-green{color:#44bb44}.admira-summary .as-num.as-red{color:#e74c3c}.admira-summary .as-num.as-blue{color:#3498db}" +
    ".admira-summary small{font-size:6px;color:#b89060;margin-top:3px;white-space:nowrap;letter-spacing:.3px}" +
    /* ── RESPONSIVE ─────────────────────────────────────────────────────────────
     * ≤820px: los enlaces de navegación se esconden tras el botón ☰. Al abrirlo,
     * caen como panel desplegable bajo la barra (look SCUMM). La marca, los 3
     * contadores (compactados a número + etiqueta corta) y los iconos de panel
     * siguen SIEMPRE visibles. Sin overflow horizontal de página. */
    "@media (max-width:820px){" +
      "#admira-burger{display:flex}" +
      "#admira-nav{order:99;position:absolute;top:100%;left:0;right:0;flex-direction:column;flex:1 1 100%;" +
        "gap:0;overflow-x:visible;background:#5a3a1e;border-bottom:3px solid #8b5a14;box-shadow:0 4px 0 #000;" +
        "padding:6px;max-height:calc(100vh - 46px);overflow-y:auto}" +
      "#admira-nav[hidden]{display:none}" +
      "#admira-nav a{min-height:44px;font-size:9px;padding:10px 12px;box-shadow:none;margin:0 0 5px}" +
      "#admira-nav a:last-child{margin-bottom:0}" +
      /* contadores compactos: solo número + inicial, para que quepan siempre */
      ".admira-summary{gap:6px}" +
      ".admira-summary small{font-size:5px;max-width:52px;text-align:center;white-space:normal;line-height:1.1}" +
    "}" +
    "@media (max-width:400px){" +
      /* móvil muy estrecho: los contadores muestran solo el número (etiqueta oculta) */
      ".admira-summary small{display:none}" +
      ".admira-summary{gap:8px}" +
      "#pf-brand{font-size:7px;padding:6px 7px}" +
    "}" +
    /* Respeta prefers-reduced-motion: sin transición en el desplegable */
    "@media (prefers-reduced-motion:reduce){#admira-nav,#admira-burger{transition:none !important}}" +
    /* ── MARCO CONSISTENTE de los raíles (opciones/avanzado/experto) en TODAS las páginas ──
     * Solo el CHROME (frame + cabecera), mismo look que la barra y la home (SCUMM madera).
     * El CONTENIDO de cada raíl es propio de cada página. Fuente única = aquí. */
    ".rail-left,.rail-right,.rail-bottom{background:#5a3a1e !important;border:3px solid #8b5a14 !important}" +
    ".rail-left{border-top:3px solid #a07828 !important;border-right-width:2px !important}" +
    ".rail-right{border-top:3px solid #a07828 !important;border-left-width:2px !important}" +
    ".rail-bottom{border-top:3px solid #a07828 !important}" +
    ".rail-left .rail-hd,.rail-right .rail-hd,.rail-bottom .rail-hd,.rail-left .rail-group,.rail-right .rail-group,.rail-bottom .rail-group{" +
      "font-family:'Press Start 2P',monospace !important;font-size:8px !important;color:#c9a86a !important;letter-spacing:1px !important;" +
      "text-transform:uppercase !important;padding:8px 8px 5px !important;border:0 !important;background:none !important}" +
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

    // Contenedor de los enlaces de navegación → se puede colapsar tras ☰ en móvil.
    var nav = document.createElement("nav");
    nav.id = "admira-nav";
    nav.setAttribute("aria-label", "Navegación AdmiraNeXT");
    // Resalta el badge de la página actual (orientación) comparando el path.
    var here = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    nav.innerHTML = TOP.map(function (i) {
      var ph = i.h.replace(/^https?:\/\/[^/]+/, "").replace(/index\.html$/, "").replace(/\/$/, "");
      var cur = ph !== "" && here === ph;
      return '<a href="' + i.h + '"' + (cur ? ' class="active" aria-current="page"' : "") + ">" + i.t + "</a>";
    }).join("");
    top.appendChild(nav);

    // Botón hamburguesa (☰): oculto en desktop vía CSS; en móvil abre/cierra el nav.
    // Empieza cerrado (hidden) para que en móvil el panel no tape el contenido.
    var burger = document.createElement("button");
    burger.id = "admira-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Abrir menú de navegación");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-controls", "admira-nav");
    burger.innerHTML = "☰"; // ☰
    burger.onclick = function () {
      var open = nav.hasAttribute("hidden");
      if (open) { nav.removeAttribute("hidden"); }
      else { nav.setAttribute("hidden", ""); }
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Cerrar menú de navegación" : "Abrir menú de navegación");
    };
    top.appendChild(burger);

    // El nav arranca colapsado sólo en móvil. En desktop CSS lo muestra siempre
    // (el atributo hidden no afecta porque #admira-nav en desktop no está en media query
    // — usamos [hidden] únicamente dentro del @media ≤820px). Para que en desktop se vea
    // aunque tenga hidden, lo quitamos si el viewport es ancho; y lo re-evaluamos al resize.
    function syncNav() {
      var narrow = window.matchMedia("(max-width:820px)").matches;
      if (!narrow) {
        nav.removeAttribute("hidden");
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", "Abrir menú de navegación");
      } else if (!nav.dataset.userToggled) {
        nav.setAttribute("hidden", "");
      }
    }
    burger.addEventListener("click", function () { nav.dataset.userToggled = "1"; });
    syncNav();
    window.addEventListener("resize", syncNav);

    // Marca del proyecto + versión, a la izquierda del todo (CSS order:-2).
    var brand = document.createElement("a");
    brand.id = "pf-brand";
    brand.href = "https://www.admira.live/";
    brand.innerHTML = "🏛️ " + PROJECT + ' <span class="pf-ver">' + VERSION + "</span>";
    top.appendChild(brand);

    // Stats de flota (consejeros activos · sin conexión · máquinas) — la barra unificada
    // lleva los mismos stats que la home en TODAS las páginas.
    var summary = document.createElement("div");
    summary.id = "admira-summary";
    summary.className = "admira-summary";
    top.appendChild(summary);
    fetchSummary(summary);

    document.body.appendChild(top);

    // Iconos de panel de la portería (a la derecha). Se colocan antes de que
    // maybeAddUsuarios inserte «Usuarios» delante de ellos → quedan a su derecha.
    buildToggles(top);

    // Enlace "Usuarios" SOLO para superusers (los que acceden a los equipos).
    // Se añade async tras consultar la lista del worker de whitelist.
    maybeAddUsuarios(top);
  }

  // Stats de flota para la barra: consejeros activos (personas online) · sin conexión
  // (máquinas de la flota sin latido) · máquinas online (total de la flota registrada).
  // Fuentes públicas: worker admira-fleet (máquinas) + presencia (agentes/beats). Best-effort.
  function fetchSummary(el) {
    var FLEET = "https://admira-fleet.csilvasantin.workers.dev/machines";
    var PRES = "https://admira-telegram.csilvasantin.workers.dev/api/presence";
    Promise.all([
      fetch(FLEET, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(PRES, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var fleet = res[0], pres = res[1];
      var machines = (fleet && fleet.machines) ? fleet.machines : [];
      var total = machines.length;
      var now = (pres && pres.now) ? pres.now : Math.floor(Date.now() / 1000);
      var onlineMachines = {}, personas = {};
      ((pres && pres.presence) || []).forEach(function (p) {
        if ((now - (p.updated || 0)) < 8 * 60) {
          if (p.machine) onlineMachines[p.machine] = 1;
          if (p.persona) personas[p.persona] = 1;
        }
      });
      var activos = Object.keys(personas).length;
      var sinConn = Math.max(0, total - Object.keys(onlineMachines).length);
      el.innerHTML =
        '<span class="as-item"><b class="as-num as-green">' + activos + '</b><small>Consejeros activos</small></span>' +
        '<span class="as-item"><b class="as-num as-red">' + sinConn + '</b><small>Sin conexión</small></span>' +
        '<span class="as-item"><b class="as-num as-blue">' + total + '</b><small>Máquinas online</small></span>';
    }).catch(function () { });
  }

  // Crea un icono toggle SCUMM para un panel; null si el panel no existe en la página.
  function makeToggle(p) {
    if (!document.querySelector(p.sel)) return null;
    // Cuadratura como la home: los raíles (opciones/avanzado/experto) están OCULTOS por
    // defecto y se revelan al pulsar su icono. Solo se muestran si el usuario los abrió antes
    // (localStorage === "1"). Cualquier otro estado (nuevo o "0") → colapsado.
    if (localStorage.getItem(p.ls) !== "1") document.body.classList.add(p.cls);
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
        // «Usuarios» va DENTRO del nav → se colapsa con los demás enlaces en móvil (☰).
        var nav = document.getElementById("admira-nav");
        if (nav) nav.appendChild(a);
        else top.insertBefore(a, document.getElementById("pf-toggles"));
      })
      .catch(function () {});
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
