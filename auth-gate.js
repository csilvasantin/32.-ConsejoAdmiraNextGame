/*
 * auth-gate.js — verja de acceso (soft gate) para admira.live
 *
 * Prehome / login pixel-art (estética Indiana Jones / Fate of Atlantis, VGA).
 * Login con Google (Google Identity Services). Solo entran los emails de WHITELIST.
 * ⚠️ Es un bloqueo BLANDO: oculta la UI hasta validar, pero el contenido sigue en el
 *    código fuente (sitio estático público). Disuade, no es seguridad fuerte.
 *
 * La LÓGICA de login (Client ID, whitelist, decodificado del JWT, recordar sesión,
 * unlock) es IDÉNTICA a la versión anterior — sólo cambia la interfaz gráfica.
 * Se conserva el ID token (resp.credential) en localStorage.admira_gate.cred para
 * las páginas que lo intercambian por sesión de backend (p.ej. FleetControl).
 *
 * Instalación: en el <head> de cada página a proteger, lo más arriba posible:
 *   <script src="/auth-gate.js"></script>
 * Whitelist: edita el array WHITELIST (emails en minúscula).
 */
(function () {
  // ===== CONFIG (sin cambios) =====
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WHITELIST = [
    "csilva@admira.com",
    "csilvasantin@gmail.com",
    "mzavaleta@admira.com",
    "agonzalez@admira.com"
  ];
  var REMEMBER_HOURS = 12;       // recordar una sesión validada
  var CONNECT_SECONDS = 1.6;     // duración de la "conexión" antes de mostrar el login
  var SCANLINES = true;          // overlay CRT

  WHITELIST = WHITELIST.map(function (e) { return String(e).toLowerCase().trim(); });

  // Si ya hay una validación reciente y vigente, no molestar.
  try {
    var saved = JSON.parse(localStorage.getItem("admira_gate") || "null");
    if (saved && saved.email && WHITELIST.indexOf(saved.email) >= 0 && Date.now() < saved.exp) return;
  } catch (e) {}

  // ===== estado =====
  var phase = "connecting"; // connecting | ready | auth | welcome | error
  var spin = 1;             // multiplicador de giro del emblema (×2.2 en auth)
  var gisReady = false;
  var startTime = 0;
  var rafId = 0;

  // Ocultar la página de inmediato (antes de que se pinte el contenido).
  document.documentElement.classList.add("gate-locked");
  injectStyle();
  loadFonts();

  function ready(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  // ===== estilos (todo scoped bajo #admira-gate) =====
  function injectStyle() {
    var css = [
      "html.gate-locked body{visibility:hidden!important}",
      "#admira-gate{position:fixed;inset:0;z-index:2147483647;visibility:visible;",
      "background:radial-gradient(circle at 50% 50%,#160f06,#070401);",
      "font-family:'Press Start 2P',monospace;display:flex;align-items:center;justify-content:center;padding:24px}",
      "#admira-gate *{box-sizing:border-box}",
      "@keyframes ag-blink{0%,55%{opacity:1}56%,100%{opacity:.28}}",
      "@keyframes ag-flick{0%,100%{opacity:.16}45%{opacity:.10}70%{opacity:.20}}",
      "@keyframes ag-rise{0%{transform:translateY(9px) scale(.97)}100%{transform:translateY(0) scale(1)}}",
      "#admira-gate .frame{position:relative;width:min(92vw,980px);aspect-ratio:8/5;background:#1c1308;overflow:hidden;",
      "box-shadow:0 0 0 4px #3a2a14,0 0 0 9px #b5651d,0 0 0 13px #2a1d0e,0 0 0 17px #0c0702,0 26px 70px rgba(0,0,0,.75)}",
      "#admira-gate .ov{position:absolute;inset:0;pointer-events:none}",
      "#admira-gate .ov-wash{background:radial-gradient(circle at 50% 56%,rgba(216,154,58,.18),transparent 46%)}",
      "#admira-gate .ov-scan{background:repeating-linear-gradient(0deg,rgba(0,0,0,.30) 0 2px,transparent 2px 4px)}",
      "#admira-gate .ov-flick{background:#1c1308;mix-blend-mode:overlay;animation:ag-flick .14s steps(2) infinite}",
      "#admira-gate .ov-vig{background:radial-gradient(circle at 50% 44%,transparent 38%,rgba(7,4,1,.6))}",
      "#admira-gate .corner{position:absolute;color:#b5651d;font-size:13px}",
      "#admira-gate .corner.tl{top:10px;left:14px}#admira-gate .corner.tr{top:10px;right:14px}",
      "#admira-gate .corner.bl{bottom:10px;left:14px}#admira-gate .corner.br{bottom:10px;right:14px}",
      "#admira-gate .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;",
      "justify-content:space-between;padding:6.5% 8% 6%;text-align:center}",
      "#admira-gate .head{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%}",
      "#admira-gate .kicker{font-family:'VT323',monospace;font-size:clamp(15px,2vw,23px);letter-spacing:7px;",
      "white-space:nowrap;color:#d89a3a;text-shadow:1px 1px 0 #2a1d0e}",
      "#admira-gate h1.title{font-family:'Press Start 2P',monospace;font-size:clamp(20px,4.6vw,46px);line-height:1;",
      "color:#e8c25a;text-shadow:3px 3px 0 #7a3f12,6px 6px 0 #2a1d0e;letter-spacing:2px;margin:0}",
      "#admira-gate h1.title .dot{color:#b5651d}",
      "#admira-gate .rule{display:flex;align-items:center;gap:14px;width:min(70%,420px)}",
      "#admira-gate .rule .ln{flex:1;height:3px}",
      "#admira-gate .rule .ln.l{background:linear-gradient(90deg,transparent,#8f4f17)}",
      "#admira-gate .rule .ln.r{background:linear-gradient(90deg,#8f4f17,transparent)}",
      "#admira-gate .rule .dia{color:#d89a3a;font-size:12px}",
      "#admira-gate .emblem{position:relative;display:flex;align-items:center;justify-content:center;",
      "filter:drop-shadow(0 0 18px rgba(232,194,90,.25))}",
      "#admira-gate canvas.emb{width:clamp(150px,24vmin,260px);height:clamp(150px,24vmin,260px);image-rendering:pixelated}",
      "#admira-gate .foot{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;min-height:122px;justify-content:flex-end}",
      "#admira-gate .status{font-family:'VT323',monospace;font-size:clamp(18px,2.4vw,28px);letter-spacing:5px;",
      "color:#e8c25a;text-shadow:1px 1px 0 #2a1d0e;animation:ag-blink 1.15s steps(1) infinite;min-height:28px}",
      "#admira-gate .track{position:relative;width:min(74%,560px);height:30px;background:#0d0902;",
      "box-shadow:inset 0 0 0 2px #3a2a14,0 0 0 3px #b5651d,0 0 0 5px #0c0702}",
      "#admira-gate .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(#f0cf6a,#d89a3a 52%,#a85c1a);transition:width .12s linear}",
      "#admira-gate .cells{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 14px,#0d0902 14px 18px);pointer-events:none}",
      "#admira-gate .shine{position:absolute;left:0;right:0;top:0;height:3px;background:rgba(255,240,200,.18);pointer-events:none}",
      "#admira-gate .pct{font-family:'Press Start 2P',monospace;font-size:clamp(11px,1.5vw,16px);color:#d89a3a;letter-spacing:2px}",
      "#admira-gate .ready{display:flex;flex-direction:column;align-items:center;gap:16px;animation:ag-rise .35s ease both}",
      "#admira-gate .gwrap{position:relative;display:inline-flex}",
      "#admira-gate .gbtn{display:flex;align-items:center;gap:16px;cursor:pointer;font-family:'Press Start 2P',monospace;",
      "font-size:clamp(11px,1.7vw,16px);letter-spacing:2px;color:#f4e2b0;padding:18px 28px;background:linear-gradient(#281a06,#160d03);",
      "border:none;box-shadow:inset 0 0 0 2px #3a2a14,0 0 0 3px #b5651d,0 6px 0 #0c0702,0 0 20px rgba(232,194,90,.28);",
      "transition:transform .08s,box-shadow .08s}",
      "#admira-gate .gbtn:hover{box-shadow:inset 0 0 0 2px #5a3d18,0 0 0 3px #e8c25a,0 6px 0 #0c0702,0 0 26px rgba(232,194,90,.45);transform:translateY(-1px)}",
      "#admira-gate .gbtn:active{transform:translateY(4px);box-shadow:inset 0 0 0 2px #3a2a14,0 0 0 3px #b5651d,0 2px 0 #0c0702}",
      "#admira-gate .gg{font-family:'Press Start 2P',monospace;font-size:1.5em;",
      "background:linear-gradient(135deg,#4285F4 0%,#EA4335 38%,#FBBC05 66%,#34A853 100%);",
      "-webkit-background-clip:text;background-clip:text;color:transparent}",
      // Botón oficial de Google superpuesto e invisible: captura el click real → credential JWT.
      "#admira-gate .greal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
      "opacity:.001;z-index:2;overflow:hidden}",
      "#admira-gate .greal>div{transform:scale(3);transform-origin:center}",
      "#admira-gate .prompt{font-family:'VT323',monospace;font-size:clamp(16px,2.1vw,24px);letter-spacing:4px;color:#d89a3a;animation:ag-blink 1.2s steps(1) infinite}",
      "#admira-gate .sub{font-family:'Press Start 2P',monospace;font-size:clamp(9px,1.2vw,12px);color:#8f6a2a;letter-spacing:2px}",
      "#admira-gate .err{font-family:'VT323',monospace;font-size:clamp(16px,2.1vw,24px);letter-spacing:3px;color:#e0563a;text-shadow:1px 1px 0 #2a1d0e;min-height:24px}",
      "#admira-gate .granted{font-family:'Press Start 2P',monospace;font-size:clamp(13px,1.9vw,20px);color:#e8c25a;letter-spacing:2px;text-shadow:2px 2px 0 #2a1d0e}",
      "#admira-gate .welcome-sub{font-family:'VT323',monospace;font-size:clamp(18px,2.3vw,26px);letter-spacing:4px;color:#d89a3a}",
      "@media(max-width:560px){#admira-gate .frame{width:100vw;aspect-ratio:auto;min-height:100vh}}"
    ].join("");
    var style = document.createElement("style");
    style.id = "admira-gate-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function loadFonts() {
    try {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap";
      (document.head || document.documentElement).appendChild(l);
    } catch (e) {}
  }

  // ===== montaje del prehome =====
  function mount() {
    var g = document.createElement("div");
    g.id = "admira-gate";
    g.innerHTML =
      '<div class="frame">' +
        '<div class="ov ov-wash"></div>' +
        '<span class="corner tl">◆</span><span class="corner tr">◆</span>' +
        '<span class="corner bl">◆</span><span class="corner br">◆</span>' +
        '<div class="content">' +
          '<div class="head">' +
            '<div class="kicker">◆&nbsp;&nbsp;A LIVE ADVENTURE&nbsp;&nbsp;◆</div>' +
            '<h1 class="title">ADMIRA<span class="dot">.</span>LIVE</h1>' +
            '<div class="rule"><div class="ln l"></div><span class="dia">◆</span><div class="ln r"></div></div>' +
          '</div>' +
          '<div class="emblem"><canvas class="emb" width="96" height="96" aria-hidden="true"></canvas></div>' +
          '<div class="foot" id="admira-foot"></div>' +
        '</div>' +
        (SCANLINES ? '<div class="ov ov-scan"></div><div class="ov ov-flick"></div>' : '') +
        '<div class="ov ov-vig"></div>' +
      '</div>';
    document.body.appendChild(g);

    startEmblem(g.querySelector("canvas.emb"));
    startTime = Date.now();
    renderFoot();
    tickProgress();
  }

  // ===== emblema canvas (portado de Admira Prehome.dc.html: draw()/cloud()) =====
  function startEmblem(cv) {
    if (!cv) return;
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    function cloud(fill, s) {
      ctx.save(); ctx.translate(48, 47); ctx.scale(s, s); ctx.fillStyle = fill;
      function arc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      arc(0, -5, 7); arc(-8, -1, 6); arc(8, -1, 6); arc(-3, -3, 5.5); arc(4, -3, 5.5);
      ctx.fillRect(-9, -1, 18, 7); ctx.restore();
    }
    function draw(time) {
      var S = 96, c = 48;
      ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = "#120c04"; ctx.beginPath(); ctx.arc(c, c, 46, 0, 7); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#3a2a14"; ctx.beginPath(); ctx.arc(c, c, 45, 0, 7); ctx.stroke();
      var steps = 24, q = 2 * Math.PI / steps;
      function snap(a) { return Math.round(a / q) * q; }
      var a1 = snap(time * 0.55 * spin), a2 = snap(-time * 0.85 * spin);
      ctx.save(); ctx.translate(c, c); ctx.rotate(a1);
      for (var i = 0; i < 16; i++) { ctx.rotate(2 * Math.PI / 16); ctx.fillStyle = i % 2 ? "#b5651d" : "#8f4f17"; ctx.fillRect(-3, -44, 6, 9); }
      ctx.restore();
      ctx.lineWidth = 4; ctx.strokeStyle = "#3a2a14"; ctx.beginPath(); ctx.arc(c, c, 37, 0, 7); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#d89a3a"; ctx.beginPath(); ctx.arc(c, c, 33, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(c, c); ctx.rotate(a2);
      for (var j = 0; j < 8; j++) { ctx.rotate(2 * Math.PI / 8); ctx.fillStyle = "#e8c25a"; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(5, -14); ctx.lineTo(-5, -14); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = "#8f4f17"; ctx.beginPath(); ctx.arc(c, c, 16, 0, 7); ctx.stroke();
      var pulse = 1 + 0.08 * Math.sin(time * 3);
      cloud("#2a1d0e", 1.04 * pulse); cloud("#e8c25a", 0.86 * pulse);
      ctx.save(); ctx.translate(c, c); ctx.scale(0.86 * pulse, 0.86 * pulse); ctx.fillStyle = "#f6e6b6";
      ctx.beginPath(); ctx.arc(-2, -6, 2.4, 0, 7); ctx.fill(); ctx.restore();
    }
    function loop() { draw(Date.now() / 1000); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
  }

  // ===== fases =====
  function foot() { return document.getElementById("admira-foot"); }

  function tickProgress() {
    if (phase !== "connecting") return;
    var t = Date.now() - startTime;
    var p = Math.min(100, (t / (CONNECT_SECONDS * 1000)) * 100);
    var dots = new Array((Math.floor(t / 350) % 4) + 1).join(".");
    var st = foot();
    if (st) {
      var s = st.querySelector(".status"); var f = st.querySelector(".fill"); var pc = st.querySelector(".pct");
      if (s) s.textContent = "CONECTANDO" + dots;
      if (f) f.style.width = p + "%";
      if (pc) pc.textContent = ("00" + Math.floor(p)).slice(-3) + "%";
    }
    // Pasamos a "ready" cuando la barra llega al 100% Y Google está listo.
    if (p >= 100 && gisReady) { phase = "ready"; renderFoot(); return; }
    requestAnimationFrame(tickProgress);
  }

  function renderFoot() {
    var f = foot(); if (!f) return;
    if (phase === "connecting") {
      f.innerHTML =
        '<div class="status">CONECTANDO</div>' +
        '<div class="track"><div class="fill"></div><div class="cells"></div><div class="shine"></div></div>' +
        '<div class="pct">000%</div>';
    } else if (phase === "ready") {
      f.innerHTML =
        '<div class="ready">' +
          '<div class="gwrap">' +
            '<button class="gbtn" type="button" id="admira-gold"><span class="gg">G</span><span>ENTRAR CON GOOGLE</span></button>' +
            '<div class="greal" id="admira-gbtn"></div>' +
          '</div>' +
          '<div class="prompt">▸ INICIA SESIÓN PARA CONTINUAR</div>' +
          '<div class="err" id="admira-err"></div>' +
        '</div>';
      renderGoogleButton();
      // Fallback: si el click cae fuera del iframe invisible, dispara One Tap.
      var gold = document.getElementById("admira-gold");
      if (gold) gold.addEventListener("click", function () {
        try { google.accounts.id.prompt(); } catch (e) {}
      });
    } else if (phase === "auth") {
      f.innerHTML = '<div class="status" id="admira-status">AUTENTICANDO</div><div class="sub">VERIFICANDO CREDENCIALES</div>';
    } else if (phase === "welcome") {
      f.innerHTML = '<div class="ready"><div class="granted">◆ ACCESO CONCEDIDO ◆</div><div class="welcome-sub">BIENVENIDO A LA EXPEDICIÓN</div></div>';
    }
  }

  function renderGoogleButton() {
    var el = document.getElementById("admira-gbtn");
    if (!el || !window.google || !google.accounts || !google.accounts.id) return;
    try {
      google.accounts.id.renderButton(el, { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240 });
    } catch (e) {}
  }

  // ===== validación (idéntica a la versión anterior) =====
  function onCredential(resp) {
    phase = "auth"; spin = 2.2; renderFoot();
    var anim = animateDots();
    var email = "";
    try {
      var payload = JSON.parse(
        decodeURIComponent(
          atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
            .split("").map(function (c) { return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2); }).join("")
        )
      );
      if (!payload.email_verified) throw new Error("email no verificado");
      email = String(payload.email || "").toLowerCase();
    } catch (e) {
      clearInterval(anim); failBack("No se pudo validar la cuenta.".toUpperCase()); return;
    }
    if (WHITELIST.indexOf(email) >= 0) {
      try { localStorage.setItem("admira_gate", JSON.stringify({ email: email, exp: Date.now() + REMEMBER_HOURS * 3600 * 1000, cred: resp.credential, credAt: Date.now() })); } catch (e) {}
      clearInterval(anim);
      phase = "welcome"; renderFoot();
      setTimeout(unlock, 900);
    } else {
      clearInterval(anim);
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
      failBack("CUENTA NO AUTORIZADA: " + email);
    }
  }

  function animateDots() {
    var n = 0;
    return setInterval(function () {
      n = (n + 1) % 4;
      var s = document.getElementById("admira-status");
      if (s) s.textContent = "AUTENTICANDO" + new Array(n + 1).join(".");
    }, 350);
  }

  // Vuelve a "ready" mostrando el error (fase 'error' del README).
  function failBack(msg) {
    spin = 1; phase = "ready"; renderFoot();
    var el = document.getElementById("admira-err");
    if (el) el.textContent = "✖ " + msg;
  }

  function unlock() {
    if (rafId) cancelAnimationFrame(rafId);
    document.documentElement.classList.remove("gate-locked");
    var g = document.getElementById("admira-gate");
    if (g) g.remove();
    var st = document.getElementById("admira-gate-style");
    if (st) st.remove();
  }

  // ===== arranque: GIS + montaje =====
  function initGis() {
    if (!window.google || !google.accounts || !google.accounts.id) return;
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: onCredential,
      auto_select: false,
      cancel_on_tap_outside: false
    });
    gisReady = true;
    // Si ya estábamos en ready (barra terminó antes que GIS), pinta el botón ahora.
    if (phase === "ready") renderGoogleButton();
  }

  ready(mount);

  var s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true; s.defer = true;
  s.onload = function () { ready(initGis); };
  s.onerror = function () {
    ready(function () {
      // Sin Google: deja pasar la barra y muestra error en 'ready'.
      gisReady = true;
      if (phase === "connecting") { phase = "ready"; renderFoot(); }
      var el = document.getElementById("admira-err");
      if (el) el.textContent = "✖ NO SE PUDO CARGAR GOOGLE. RECARGA LA PÁGINA.";
    });
  };
  (document.head || document.documentElement).appendChild(s);
})();
