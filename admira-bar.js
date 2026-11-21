/*
 * admira-bar.js — barra superior de navegación consistente en admira.live
 *
 * Se inyecta en todas las páginas EXCEPTO la home (la home tiene su propia barra).
 *   - Barra superior: enlaces de navegación (+ «Usuarios» solo para superusers).
 * Uso: <script src="/admira-bar.js"></script> en el <head> de cada página.
 */
(function () {
  // Sello del despliegue (?v=) de esta barra: deploy.sh lo estampa en cada página.
  var BAR_SRC = (document.currentScript && document.currentScript.src) || "";
  // No ejecutar en la home (raíz). Cubre "/", "/index.html".
  var path = location.pathname.replace(/index\.html$/, "");
  if (path === "/" || path === "") return;

  // IDIOMA (MorfeoMacMini, 05-10-2026): /idioma ESP | ENG, mismo contrato que admira.store.
  // El núcleo vive en /admira-idioma.js (la home lo carga en su <head>); aquí se pide con
  // el MISMO ?v= de la barra, así cada release lo estrena a la vez en las ~60 páginas.
  // Los rótulos llevan el inglés en data-en*; si el módulo no carga, todo sigue en castellano.
  function idioma() { return window.AdmiraIdioma && window.AdmiraIdioma.translate ? window.AdmiraIdioma : null; }
  function T(es, en) { var I = idioma(); return I ? I.t(es, en) : es; }
  (function cargaIdioma() {
    if (idioma() || document.querySelector('script[src*="admira-idioma.js"]')) return;
    var v = ""; try { v = new URL(BAR_SRC, location.href).searchParams.get("v") || ""; } catch (e) {}
    var s = document.createElement("script");
    s.src = "/admira-idioma.js" + (v ? "?v=" + encodeURIComponent(v) : "");
    s.onload = function () { var I = idioma(); if (I) I.translate(document); };
    (document.head || document.documentElement).appendChild(s);
  })();

  // Nombre del proyecto + versión (v.año.mes.día.release) — a la izquierda del todo.
  // La MARCA enlaza a la home (regla: el nombre del site siempre vuelve a la home).
  var PROJECT = "Consejo AdmiraNeXT";
  // Versión interna (solo console, ya no se pinta en el menú superior — Carlos 2026-07-13).
  var VERSION = "v.2026.09.27.r39";

  // BARRA ÚNICA (Carlos, 21-11-2026: «la barra superior igual en TODAS las páginas»):
  // [opciones] [admira] Dashboard · Objetivos · Decisiones · Misiones · Tareas · Highscore ·
  // Asignaciones · DeepAgents · Consumo … [avanzado] [experto]. Mismo orden y mismos rótulos
  // que la home (index.html .top-bar) y que el marco de plataforma (yk-frame.js APP_NAV);
  // barra-unica.test.mjs vigila que las tres sigan iguales. DeepAgents (antes la pastilla
  // «N comunicaciones») va justo ANTES de Consumo, sin número (Carlos, 21-11-2026).
  var TOP = [
    { t: "📊 Dashboard",    en: "📊 Dashboard",   h: "https://www.admira.live/dashboard" },
    { t: "🎯 Objetivos",    en: "🎯 Goals",       h: "https://www.admira.live/objetivos" },
    { t: "⚖️ Decisiones",   en: "⚖️ Decisions",   h: "https://www.admira.live/decisiones" },
    { t: "🚀 Misiones",     en: "🚀 Missions",    h: "https://www.admira.live/misiones" },
    { t: "✅ Tareas",       en: "✅ Tasks",       h: "https://www.admira.live/tareas" },
    { t: "🏆 Highscore",    en: "🏆 Highscore",   h: "https://www.admira.live/highscore" },
    { t: "🧩 Asignaciones", en: "🧩 Assignments", h: "https://www.admira.live/asignaciones/" },
    { t: "🤖 DeepAgents",   en: "🤖 DeepAgents",  h: "https://www.admira.live/deepagents" },
    { t: "💸 Consumo",      en: "💸 Usage",       h: "https://www.admira.live/consumos" }
  ];
  // OPCIONES (icono a la izquierda del todo): lo que no cabe en la fila — mismas secciones
  // que el raíl de la home y del marco, a un clic desde cualquier página.
  var OPCIONES = [
    { t: "🎙️ Hola Admira",    en: "🎙️ Hey Admira",      h: "https://www.admira.live/hola/" },
    { t: "💬 Comunicaciones", en: "💬 Communications",  h: "https://www.admira.live/comunicaciones" },
    { t: "🚨 Incidencias",    en: "🚨 Incidents",       h: "https://www.admira.live/incidencias" },
    { t: "🛰️ Supervisor",     en: "🛰️ Supervisor",      h: "https://www.admira.live/supervisor" },
    { t: "📑 Informes",       en: "📑 Reports",         h: "https://www.admira.live/informes-flota" },
    { t: "🔔 Notificaciones", en: "🔔 Notifications",   h: "https://www.admira.live/notificaciones" }
  ];
  // AVANZADO (Carlos, 18-09-2026): Control, Players y Diario son gestión/infra, no el
  // flujo de trabajo → se recogen tras el botón «Avanzado» para no saturar la barra.
  // Siguen a un clic desde cualquier página; sus páginas no se tocan.
  var ADV = [
    { t: "🖥️ Control",  en: "🖥️ Control", h: "https://www.admira.live/control/" },
    { t: "🕶️ Hackeo",   en: "🕶️ Hack",    h: "https://www.admira.live/hackeo" },
    { t: "📺 Players",  en: "📺 Players", h: "https://www.admira.live/players/" },
    { t: "📓 Diario",   en: "📓 Journal", h: "https://www.admira.live/diario.html" }
  ];

  var css =
    /* Barra superior con el look SCUMM de la home (madera Monkey Island + badges
     * ámbar cuadrados + sombra pixel + Press Start 2P) → integración consistente.
     * RESPONSIVE: en ancho suficiente todo va en una fila; al estrecharse, los enlaces
     * de navegación se colapsan tras un botón ☰ (hamburguesa) y se abren en un panel
     * desplegable, mientras la marca y los iconos de panel siguen
     * visibles. Nunca hay scroll horizontal de página ni elementos cortados. */
    "#admira-topbar{position:fixed;top:0;left:0;right:0;z-index:99990;display:flex;gap:5px;align-items:center;min-height:46px;" +
    "padding:4px 10px;background:#5a3a1e;border-bottom:3px solid #8b5a14;border-top:2px solid #a07828;box-shadow:0 3px 0 #000;" +
    "font-family:'Press Start 2P',monospace;box-sizing:border-box;max-width:100vw;flex-wrap:nowrap}" +
    "#admira-topbar *{box-sizing:border-box}" +
    "#admira-topbar a{display:flex;align-items:center;color:#ffdd66;text-decoration:none;" +
    "font-family:'Press Start 2P',monospace;font-size:7px;line-height:1.5;letter-spacing:0;" +
    "border:2px solid #8b5a14;border-radius:0;padding:0 6px;height:30px;gap:4px;white-space:nowrap;background:#2a1a08;box-shadow:2px 2px 0 #000}" +
    "#admira-topbar a:hover{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    "#admira-topbar a.active{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    /* Grupo AVANZADO: botón + desplegable (Control/Players/Diario) */
    ".admira-adv{position:relative;display:flex;align-items:stretch;flex:0 0 auto}" +
    ".admira-adv-btn{display:flex;align-items:center;color:#ffdd66;cursor:pointer;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;line-height:1.5;letter-spacing:.5px;" +
    "border:2px solid #8b5a14;border-radius:0;padding:6px 9px;white-space:nowrap;background:#2a1a08;box-shadow:2px 2px 0 #000}" +
    ".admira-adv-btn:hover,.admira-adv-btn.active,.admira-adv-btn[aria-expanded=\"true\"]{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    ".admira-adv-menu{position:absolute;top:100%;right:0;margin-top:4px;z-index:99991;" +
    "display:flex;flex-direction:column;gap:5px;padding:6px;min-width:150px;" +
    "background:#5a3a1e;border:3px solid #8b5a14;box-shadow:3px 3px 0 #000}" +
    ".admira-adv-menu[hidden]{display:none}" +
    ".admira-adv-menu a{box-shadow:none;margin:0}" +
    /* Contenedor de los enlaces de navegación (para poder colapsarlos en móvil) */
    "#admira-nav{order:0;display:flex;gap:4px;align-items:center;flex:1 1 auto;min-width:0;overflow-x:auto;padding:0 3px 3px 0;" +
    "scrollbar-width:none}" +
    "#admira-nav::-webkit-scrollbar{display:none}" +
    /* Botón hamburguesa (oculto por defecto; solo aparece en móvil vía media query) */
    "#admira-burger{order:-1;display:none;align-items:center;justify-content:center;cursor:pointer;" +
    "min-width:44px;min-height:38px;align-self:center;font-size:16px;color:#ffdd66;" +
    "border:2px solid #8b5a14;border-radius:0;background:#2a1a08;box-shadow:2px 2px 0 #000;padding:0 10px}" +
    "#admira-burger:hover{background:#8b5a14;border-color:#f0c040;color:#fff}" +
    /* Iconos de panel (portería, estilo Codex/VS Code): avanzado (der) + experto (abajo).
     * Se colocan a la derecha de «Usuarios» y sólo aparecen si la página tiene ese panel. */
    /* Marca del proyecto (izquierda del todo) */
    "#pf-brand{order:-2;display:flex;align-items:center;gap:0;white-space:nowrap;text-decoration:none;flex:0 0 auto;height:30px;" +
    "font-family:'Press Start 2P',monospace;font-size:8px;letter-spacing:.5px;color:#ffdd66;" +
    "border:2px solid #a07828;border-radius:0;background:#3a2410;box-shadow:2px 2px 0 #000;padding:0 8px !important;margin-right:0}" +
    "#pf-brand:hover{border-color:#f0c040;color:#fff}" +
    "#pf-brand .pf-ver{color:#c9a86a;font-size:0.4rem;margin-top:3px;letter-spacing:0}" +
    "#pf-brand .pf-logo{height:22px;width:auto;vertical-align:middle;margin-right:0;image-rendering:pixelated;image-rendering:-moz-crisp-edges}" +
    /* Sello de versión (#pf-ver-foot) retirado del menú superior — Carlos 2026-07-13 */
    /* icono de contraer OPCIONES: a la izquierda (tras la marca) */
    "#pf-opciones{order:-3;position:relative;display:flex;align-items:center;align-self:center;flex:0 0 auto}" +
    ".pf-opciones-menu{left:0;right:auto;min-width:210px}" +
    ".pf-opciones-menu .pf-op-panel{font-family:'Press Start 2P',monospace;font-size:8px;line-height:1.5;color:#ffdd66;text-align:left;cursor:pointer;" +
    "border:2px solid #a07828;background:#3a2410;padding:6px 9px}" +
    ".pf-opciones-menu .pf-op-panel:hover{background:#8b5a14;color:#fff}" +
    ".pf-op-sep{height:2px;background:#8b5a14;margin:2px 0}" +
    /* iconos AVANZADO + EXPERTO: a la derecha del todo, tras el usuario */
    "#pf-toggles{order:100;display:flex;gap:5px;align-items:center;align-self:center;flex:0 0 auto}" +
    "#admira-ro{order:90;display:flex;align-items:center;align-self:center;flex:0 0 auto;max-width:42vw;overflow:hidden;text-overflow:ellipsis;" +
    "font-family:'Press Start 2P',monospace;font-size:7px;line-height:1.4;letter-spacing:.4px;color:#1b130a;background:#ffb454;" +
    "border:2px solid #8b5a14;box-shadow:2px 2px 0 #000;padding:6px 8px;white-space:nowrap}" +
    ".pf-ico{width:30px;height:29px;display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "border:2px solid #8b5a14;border-radius:0;background:#2a1a08;box-shadow:2px 2px 0 #000;padding:0}" +
    ".pf-ico svg{width:16px;height:15px;display:block}" +
    ".pf-ico .frame{fill:none;stroke:#a07828;stroke-width:1.4}" +
    ".pf-ico .panel{fill:#5a4020}" +
    ".pf-ico.on .frame{stroke:#ffdd66}" +
    ".pf-ico.on .panel{fill:#ffdd66}" +
    ".pf-ico:hover{border-color:#f0c040}" +
    /* ── RESPONSIVE ─────────────────────────────────────────────────────────────
     * ≤820px: los enlaces de navegación se esconden tras el botón ☰. Al abrirlo,
     * caen como panel desplegable bajo la barra (look SCUMM). La marca y los
     * iconos de panel siguen SIEMPRE visibles. Sin overflow horizontal de página. */
    /* ≤820px (barra única, 21-11-2026): la misma fila que la home y la plataforma — las
       pestañas se deslizan en horizontal; opciones, marca e iconos quedan siempre a la vista. */
    "@media (max-width:820px){" +
      "#admira-burger{display:none !important}" +
      "#pf-brand .pf-logo{height:16px}" +
      "#pf-brand{padding:0 5px !important}" +
    "}" +
    "@media (max-width:400px){" +
      /* móvil muy estrecho: compacta la marca */
      "#pf-brand{font-size:7px}" +
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
    "html.admira-bar-on body{padding-top:46px !important}" +
    /* Barra única (21-11-2026): se retira el cruce de la cuadratura #4494. Opciones vuelve a
       la izquierda (icono y panel) y Avanzado a la derecha, igual que en la home. */
    "body.pf-left-off .rail.rail-left{transform:translateX(-103%) !important}" +
    "body.pf-right-off .rail.rail-right{transform:translateX(103%) !important}" +
    ".cuadratura-hbar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}" +
    ".cuadratura-hbar a{font-family:'Press Start 2P',monospace;font-size:7px;color:#ffdd66;" +
      "text-decoration:none;border:2px solid #8b5a14;background:#2a1a08;padding:6px 8px;box-shadow:2px 2px 0 #000}" +
    ".cuadratura-hbar a:hover{background:#8b5a14;border-color:#f0c040;color:#fff}";

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
    nav.setAttribute("data-en-aria-label", "AdmiraNeXT navigation");
    // Resalta el badge de la página actual (orientación) comparando el path.
    var here = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    // Se marca la SECCIÓN, no sólo la portada de la sección. Con la coincidencia
    // exacta, estar en /13rue/implementacion o en /control/loquesea no encendía
    // nada: la barra dejaba de decirte dónde estás justo al entrar en una página
    // interior, que es cuando más falta hace saberlo.
    function isHere(h) {
      var ph = h.replace(/^https?:\/\/[^/]+/, "").replace(/index\.html$/, "").replace(/\/$/, "");
      return ph !== "" && (here === ph || here.indexOf(ph + "/") === 0);
    }
    function linkHTML(i) {
      var cur = isHere(i.h);
      return '<a href="' + i.h + '"' + (cur ? ' class="active" aria-current="page"' : "") +
        (i.en ? ' data-en="' + i.en + '"' : "") + ">" + i.t + "</a>";
    }
    // Fila plana, idéntica a la home: cada sección es una pestaña.
    nav.innerHTML = TOP.map(function (i) {
      var cur = isHere(i.h);
      return '<a href="' + i.h + '"' + (i.id ? ' id="' + i.id + '"' : "") +
        (cur ? ' class="active" aria-current="page"' : "") +
        (i.en ? ' data-en="' + i.en + '"' : "") + ">" + i.t + "</a>";
    }).join("");
    top.appendChild(nav);
    ensureBottomMenu(linkHTML);
    buildOpciones(top, linkHTML, isHere);

    // Botón hamburguesa (☰): oculto en desktop vía CSS; en móvil abre/cierra el nav.
    // Empieza cerrado (hidden) para que en móvil el panel no tape el contenido.
    var burger = document.createElement("button");
    burger.id = "admira-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", T("Abrir menú de navegación", "Open navigation menu"));
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-controls", "admira-nav");
    burger.innerHTML = "☰"; // ☰
    burger.onclick = function () {
      var open = nav.hasAttribute("hidden");
      if (open) { nav.removeAttribute("hidden"); }
      else { nav.setAttribute("hidden", ""); }
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? T("Cerrar menú de navegación", "Close navigation menu") : T("Abrir menú de navegación", "Open navigation menu"));
    };
    top.appendChild(burger);

    // El nav arranca colapsado sólo en móvil. En desktop CSS lo muestra siempre
    // (el atributo hidden no afecta porque #admira-nav en desktop no está en media query
    // — usamos [hidden] únicamente dentro del @media ≤820px). Para que en desktop se vea
    // aunque tenga hidden, lo quitamos si el viewport es ancho; y lo re-evaluamos al resize.
    function syncNav() {
      // Barra única: la fila de pestañas nunca se esconde; en móvil se desliza.
      var narrow = false;
      if (!narrow) {
        nav.removeAttribute("hidden");
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", T("Abrir menú de navegación", "Open navigation menu"));
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
    // La versión YA NO va en la marca (Carlos): la marca es solo el nombre → home.
    // El logo es el de Admira pixelado estilo retro (Carlos, 17-09-2026): /admira-logo-retro.svg.
    brand.innerHTML = '<img class="pf-logo" src="/admira-logo-retro.svg" alt="admira" width="119" height="25">';
    brand.title = PROJECT;
    brand.setAttribute("aria-label", PROJECT);
    top.appendChild(brand);

    document.body.appendChild(top);

    // Iconos de panel de la portería (a la derecha). Se colocan antes de que
    // maybeAddUsuarios inserte «Usuarios» delante de ellos → quedan a su derecha.
    buildToggles(top);

    // Idioma activo: la barra recién montada se traduce ya (si el módulo aún no ha
    // llegado, su onload traduce todo el documento) y sigue los cambios de /idioma.
    var I = idioma();
    if (I) I.translate(top);
    window.addEventListener("admira:languagechange", function () {
      burger.setAttribute("aria-label", burger.getAttribute("aria-expanded") === "true"
        ? T("Cerrar menú de navegación", "Close navigation menu") : T("Abrir menú de navegación", "Open navigation menu"));
    });

    // Enlace "Usuarios" SOLO para superusers (los que acceden a los equipos).
    // Se añade async tras consultar la lista del worker de whitelist.
    maybeAddUsuarios(top);

    // Sello de versión RETIRADO del menú superior por orden de Carlos (2026-07-13):
    // la versión ya no se muestra en la barra. Se conserva en código (console) para
    // trazabilidad interna, sin ocupar el DOM visible.
    try { console.log("[admira-bar] " + PROJECT + " " + VERSION); } catch (e) {}
    pintarSoloLectura(top);
  }

  // Sesión de agente (auth-gate): nombre + «solo lectura» en la barra. Sin csrf.
  function pintarSoloLectura(top) {
    top = top || document.getElementById("admira-topbar");
    if (!top) return;
    var g = null;
    try { g = window.admiraGateUser && window.admiraGateUser(); } catch (e) {}
    if (!g || g.agent !== true || g.readOnly !== true) return;
    var nombre = String(g.name || "agente");
    var badge = document.getElementById("admira-ro");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "admira-ro";
      badge.setAttribute("role", "status");
      var toggles = document.getElementById("pf-toggles");
      if (toggles && toggles.parentNode === top) top.insertBefore(badge, toggles);
      else top.appendChild(badge);
    }
    badge.textContent = nombre + " · solo lectura";
  }
  window.addEventListener("admira:sesion", function () { pintarSoloLectura(); });

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
    if (p.en) b.setAttribute("data-en-title", p.en);
    b.innerHTML = '<svg viewBox="0 0 16 14">' + p.svg + "</svg>";
    b.onclick = function () {
      var off = document.body.classList.toggle(p.cls);
      localStorage.setItem(p.ls, off ? "0" : "1");
      b.classList.toggle("on", !off);
    };
    return b;
  }

  // Iconos de panel a la DERECHA, como en la home: AVANZADO (.rail-right, panel derecho)
  // y EXPERTO (.rail-bottom). Solo si la página tiene ese panel. OPCIONES va a la
  // izquierda del todo (buildOpciones), en TODAS las páginas — Carlos, 21-11-2026.
  function buildToggles(top) {
    var box = document.createElement("div");
    box.id = "pf-toggles";
    var any = false;
    [
      { sel: ".rail-right", cls: "pf-right-off", ls: "pf_right", title: "Avanzado · panel derecho", en: "Advanced · right panel",
        svg: '<rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="10" y="1.6" width="4.4" height="10.8" rx="1"/>' },
      { sel: ".rail-bottom", cls: "pf-bottom-off", ls: "pf_bottom", title: "Menú avanzado y consola · abajo", en: "Advanced menu and console · bottom",
        svg: '<rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="1.6" y="8.4" width="12.8" height="4" rx="1"/>' }
    ].forEach(function (p) {
      var b = makeToggle(p);
      if (b) { any = true; box.appendChild(b); }
    });
    if (any) top.appendChild(box);
  }

  // OPCIONES: icono a la izquierda del todo (mismo dibujo que la home: panel izquierdo).
  // Abre un desplegable con lo que no cabe en la fila (Hola Admira, Comunicaciones,
  // Incidencias, Supervisor, Informes, Notificaciones) y lo de AVANZADO (Control, Hackeo,
  // Players, Diario). Si la página tiene su propio panel de opciones (.rail-left), el
  // primer elemento lo abre o lo cierra.
  function buildOpciones(top, linkHTML, isHere) {
    var wrap = document.createElement("div");
    wrap.id = "pf-opciones";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "pf-ic-opcion";
    btn.className = "pf-ico";
    btn.title = "Opciones";
    btn.setAttribute("aria-label", "Opciones");
    btn.setAttribute("data-en-title", "Options");
    btn.setAttribute("data-en-aria-label", "Options");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<svg viewBox="0 0 16 14"><rect class="frame" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="panel" x="1.6" y="1.6" width="4.4" height="10.8" rx="1"/></svg>';
    var menu = document.createElement("div");
    menu.className = "admira-adv-menu pf-opciones-menu";
    menu.setAttribute("hidden", "");
    var html = "";
    if (document.querySelector(".rail-left")) {
      if (localStorage.getItem("pf_left") !== "1") document.body.classList.add("pf-left-off");
      html += '<button type="button" class="pf-op-panel" data-en="▤ Options panel">▤ Panel de opciones</button>';
    }
    html += OPCIONES.map(linkHTML).join("") + '<span class="pf-op-sep" aria-hidden="true"></span>' + ADV.map(linkHTML).join("");
    menu.innerHTML = html;
    var on = OPCIONES.concat(ADV).some(function (i) { return isHere(i.h); });
    if (on) btn.classList.add("on");
    function setOpen(open) {
      if (open) menu.removeAttribute("hidden"); else menu.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(menu.hasAttribute("hidden")); });
    var panel = menu.querySelector(".pf-op-panel");
    if (panel) panel.addEventListener("click", function () {
      var off = document.body.classList.toggle("pf-left-off");
      localStorage.setItem("pf_left", off ? "0" : "1");
      setOpen(false);
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    top.insertBefore(wrap, top.firstChild);
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
    fetch("https://whitelist.admira.store/list", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || (d.superusers || []).indexOf(email) < 0) return;
        if (document.getElementById("admira-link-usuarios")) return;
        var a = document.createElement("a");
        a.id = "admira-link-usuarios";
        a.href = "https://www.admira.live/usuarios.html";
        a.innerHTML = "👥 Usuarios";
        a.setAttribute("data-en", "👥 Users");
        if (idioma()) idioma().translate(a);
        // «Usuarios» va DENTRO del nav → se colapsa con los demás enlaces en móvil (☰).
        var nav = document.getElementById("admira-nav");
        if (nav) nav.appendChild(a);
        else top.insertBefore(a, document.getElementById("pf-toggles"));
      })
      .catch(function () {});
  }

  // Abajo: menú horizontal de avanzado. La línea de comandos la pone la página
  // si ya tiene input; si no, se añade una consola local que no llama a la flota.
  function ensureBottomMenu(linkHTML) {
    var rail = document.querySelector(".rail-bottom");
    if (!rail || rail.querySelector(".cuadratura-hbar")) return;
    var nav = document.createElement("nav");
    nav.className = "cuadratura-hbar";
    nav.setAttribute("aria-label", "Menú avanzado");
    nav.setAttribute("data-en-aria-label", "Advanced menu");
    nav.innerHTML = ADV.map(linkHTML).join("");
    rail.insertBefore(nav, rail.firstChild);
    // /idioma en la consola PROPIA de la página (Control y Fleet: «comando shell…», Vista previa,
    // Players…). Antes la orden seguía su camino —en Control se mandaba como comando de shell a la
    // máquina— y el idioma no cambiaba. Se intercepta antes que la página (captura) y es local.
    rail.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing) return;
      var t = e.target;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) || (t.closest && t.closest(".cuadratura-cli"))) return;
      var I = idioma(), orden = String(t.value || "");
      var res = I ? I.command(orden, I.lang()) : null;
      if (!res) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      t.value = "";
      avisoIdioma(rail, (I.run(orden) || res).message);
    }, true);
    if (rail.querySelector("input,textarea")) return;
    var form = document.createElement("form");
    form.className = "cuadratura-cli";
    form.innerHTML = '<input type="text" aria-label="Línea de comandos de prueba" placeholder="prueba un comando (local) · /help" autocomplete="off"' +
      ' data-en-aria-label="Test command line" data-en-placeholder="try a command (local) · /help">' +
      '<output aria-live="polite" style="white-space:pre-wrap;display:block;max-height:40vh;overflow:auto"></output>';
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = form.querySelector("input");
      var out = form.querySelector("output");
      var orden = inp.value;
      inp.value = "";
      // /demo interruptores (#5862): ⏻ apps y ⏻ CLIs de cada Mac, en su página pública con recorrido automático.
      if (/^\/?demo\s+(interruptores?|apps|clis)\s*$/i.test(String(orden).trim())) { out.textContent = T("Abriendo /demo/interruptores/ …", "Opening /demo/interruptores/ …"); location.href = "/demo/interruptores/?auto=1"; return; }
      // /interface y /demo interface: la MISMA implementación que la home (assets/interface-cli.js), cargada al vuelo.
      if (/^\/(interface|interfaz)(\s|$)|^\/?demo\s+(interface|interfaz|terminal|terminales)\s*$/i.test(String(orden).trim())) {
        out.textContent = "…";
        interfaceCli(function (I) {
          var decir = function (t) { out.textContent = t; };
          if (/demo/i.test(orden)) I.demo(decir); else I.run(String(orden).trim(), decir);
        }, function () { out.textContent = T("/interface no ha cargado; recarga la página.", "/interface did not load; reload the page."); });
        return;
      }
      var res = consolaLocal(orden);
      // Mal escrita o desconocida → «¿Quisiste decir …?» + la ayuda que toca; /demo help → catálogo con fechas.
      // Misma pieza que la portada: assets/cli-ayuda.js, cargada al vuelo.
      if (res && res.indexOf("local · ") === 0 || /^\/?demo(\s|$)/i.test(String(orden).trim())) {
        out.textContent = res;
        cliAyuda(function (A) { out.textContent = ayudaLocal(A, String(orden).trim()); }, function () {});
        return;
      }
      out.textContent = res;
    });
    rail.insertBefore(form, nav.nextSibling);
    var I = idioma();
    if (I) I.translate(rail);
  }

  // Respuesta de /idioma cuando la consola es de la página: un aviso breve encima del raíl.
  function avisoIdioma(rail, texto) {
    var a = document.getElementById("admira-idioma-aviso");
    if (!a) {
      a = document.createElement("output");
      a.id = "admira-idioma-aviso";
      a.setAttribute("aria-live", "polite");
      a.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--bottom-h,180px) + 12px);" +
        "z-index:2147483000;background:#1b130a;color:#ffdd66;border:2px solid #8b5a14;padding:6px 12px;" +
        "font:12px/1.4 monospace;box-shadow:0 3px 0 #000;pointer-events:none";
      document.body.appendChild(a);
    }
    a.textContent = "🌐 " + texto;
    a.hidden = false;
    clearTimeout(avisoIdioma.t);
    avisoIdioma.t = setTimeout(function () { a.hidden = true; }, 3500);
  }

  function cliAyuda(ok, ko) {
    if (window.AdmiraCliAyuda) return ok(window.AdmiraCliAyuda);
    var sc = document.createElement("script");
    sc.src = "/assets/cli-ayuda.js?v=20261011-5707-selector";
    sc.onload = function () { window.AdmiraCliAyuda ? ok(window.AdmiraCliAyuda) : ko(); };
    sc.onerror = ko;
    document.head.appendChild(sc);
  }
  function ayudaLocal(A, line) {
    var md = /^\/?demo(?:\s+(.*))?$/i.exec(line);
    if (md) {
      var arg = String(md[1] || "").trim(), h = /^(help|ayuda|\?)(\s|$)/i.exec(arg);
      if (!arg || h) return A.demoHelp(h ? arg.slice(h[0].length) : "");
      var sd = A.sugerir(arg, A.CATALOGO.map(function (d) { return d[0].replace(/^\/demo /, ""); }));
      return T("Demo desconocida en esta página: ", "Unknown demo on this page: ") + arg + (sd ? T(" · ¿Quisiste decir /demo ", " · Did you mean /demo ") + sd + "?" : "") +
        T(" (aquí /demo interface y /demo interruptores; las demás, en la home ⌘)\n", " (here /demo interface and /demo interruptores; the rest on the home page ⌘)\n") + A.demoHelp("");
    }
    var v = (/^\/?(\S+)/.exec(line) || [])[1] || "";
    var s = A.sugerir(v, CONSOLA_LOCAL.map(function (c) { return c.slice(1); }).concat(["demo"]));
    return T("Orden desconocida: ", "Unknown command: ") + line + (s ? T(" · ¿Quisiste decir /", " · Did you mean /") + s + "?" : "") + "\n" + consolaLocal("/help");
  }

  function interfaceCli(ok, ko) {
    if (window.AdmiraInterface) return ok(window.AdmiraInterface);
    var sc = document.createElement("script");
    sc.src = "/assets/interface-cli.js?v=20261011-5707-selector2";
    sc.onload = function () { window.AdmiraInterface ? ok(window.AdmiraInterface) : ko(); };
    sc.onerror = ko;
    document.head.appendChild(sc);
  }

  // Consola local de la barra (páginas sin CLI propia). Entiende los comandos de
  // interfaz —/help y /idioma— y no envía nada a la flota. /help lista TODOS los que
  // entiende (lo vigila idioma-experto.test.mjs).
  var CONSOLA_LOCAL = ["/help", "/ayuda", "/idioma", "/language", "/interface", "/interfaz"];
  function consolaLocal(raw) {
    var line = String(raw || "").trim();
    if (!line) return "";
    var I = idioma();
    var res = I ? I.run(line) : null;
    if (res) return res.message;
    if (/^\/(idioma|language)(\s|$)/i.test(line)) return "El selector de idioma no ha cargado; recarga la página.";
    if (/^\/(help|ayuda)$/i.test(line)) {
      return T("Consola local · /help (/ayuda) esta ayuda · ", "Local console · /help (/ayuda) this help · ") +
        (I ? I.helpLine(I.lang()) : "/idioma ESP | ENG — castellano o inglés, sin recargar la página") +
        T(" (alias /language) · /interface (/interfaz) [terminal] 4|2 [dispositivo] · off · help — terminales de los deepagents (/demo interface). La CLI completa está en la home (⌘).",
          " (alias /language) · /interface (/interfaz) [terminal] 4|2 [device] · off · help — deepagent terminals (/demo interface). The full CLI lives on the home page (⌘).");
    }
    return T("local · " + line + " (no se ejecuta en la flota) · /help", "local · " + line + " (not run on the fleet) · /help");
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
