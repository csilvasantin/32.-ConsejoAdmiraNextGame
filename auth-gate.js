/*
 * auth-gate.js — verja de acceso (soft gate) para admira.live
 *
 * Login con Google (Google Identity Services). Solo entran los emails de WHITELIST.
 * ⚠️ Es un bloqueo BLANDO: oculta la UI hasta validar, pero el contenido sigue en el
 *    código fuente (sitio estático público). Disuade, no es seguridad fuerte.
 *
 * Instalación:
 *   1) Crea un OAuth Client ID (tipo "Web") en Google Cloud Console y pon en
 *      "Orígenes de JavaScript autorizados": https://www.admira.live  y  https://admira.live
 *   2) Pega ese ID en CLIENT_ID aquí abajo.
 *   3) En cada página a proteger, en el <head> y lo más arriba posible:
 *        <script src="/auth-gate.js"></script>
 *
 * Gestión de la whitelist: edita el array WHITELIST (emails en minúscula).
 */
(function () {
  // ===== CONFIG =====
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WHITELIST = [
    "csilva@admira.com",
    "csilvasantin@gmail.com",
    "mzavaleta@admira.com"
  ];
  var REMEMBER_HOURS = 12; // recordar una sesión validada para no pedir login cada vez

  WHITELIST = WHITELIST.map(function (e) { return String(e).toLowerCase().trim(); });

  // Si ya hay una validación reciente y vigente, no molestar.
  try {
    var saved = JSON.parse(localStorage.getItem("admira_gate") || "null");
    if (saved && saved.email && WHITELIST.indexOf(saved.email) >= 0 && Date.now() < saved.exp) return;
  } catch (e) {}

  // Ocultar la página de inmediato (antes de que se pinte el contenido).
  document.documentElement.classList.add("gate-locked");
  var style = document.createElement("style");
  style.textContent =
    "html.gate-locked body{visibility:hidden!important}" +
    "#admira-gate{position:fixed;inset:0;z-index:2147483647;background:#0a0a14;color:#e8e8f0;" +
    "font-family:'Andale Mono',Monaco,Menlo,monospace;display:flex;align-items:center;justify-content:center;visibility:visible}" +
    "#admira-gate .box{max-width:420px;text-align:center;padding:32px}" +
    "#admira-gate h1{color:#daa520;font-size:18px;margin:0 0 10px;letter-spacing:.5px}" +
    "#admira-gate p{color:#8a8a9a;font-size:13px;line-height:1.55;margin:0}" +
    "#admira-gate .gbtn{margin-top:22px;display:flex;justify-content:center}" +
    "#admira-gate .err{color:#e74c3c;margin-top:14px;min-height:18px;font-size:12px}";
  (document.head || document.documentElement).appendChild(style);

  function ready(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  function mount() {
    var g = document.createElement("div");
    g.id = "admira-gate";
    g.innerHTML =
      '<div class="box">' +
      '<h1>🔒 Consejo de Silicio Admira</h1>' +
      '<p>Acceso restringido. Inicia sesión con una cuenta autorizada.</p>' +
      '<div class="gbtn" id="admira-gbtn"></div>' +
      '<div class="err" id="admira-err"></div>' +
      '</div>';
    document.body.appendChild(g);

    if (!window.google || !google.accounts || !google.accounts.id) {
      document.getElementById("admira-err").textContent = "No se pudo cargar Google. Recarga la página.";
      return;
    }
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: onCredential,
      auto_select: false,
      cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton(
      document.getElementById("admira-gbtn"),
      { theme: "filled_black", size: "large", text: "signin_with", shape: "pill" }
    );
  }

  function onCredential(resp) {
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
      setErr("No se pudo validar la cuenta.");
      return;
    }
    if (WHITELIST.indexOf(email) >= 0) {
      // Guardamos también el credential (ID token de Google, fresco) para que las
      // páginas que lo necesiten (p.ej. FleetControl) lo intercambien por una
      // sesión de backend sin volver a pedir login. El JWT caduca en ~1h.
      try { localStorage.setItem("admira_gate", JSON.stringify({ email: email, exp: Date.now() + REMEMBER_HOURS * 3600 * 1000, cred: resp.credential, credAt: Date.now() })); } catch (e) {}
      unlock();
    } else {
      setErr("Cuenta no autorizada: " + email);
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    }
  }

  function setErr(m) { var el = document.getElementById("admira-err"); if (el) el.textContent = m; }

  function unlock() {
    document.documentElement.classList.remove("gate-locked");
    var g = document.getElementById("admira-gate");
    if (g) g.remove();
  }

  // Cargar Google Identity Services.
  var s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true; s.defer = true;
  s.onload = function () { ready(mount); };
  s.onerror = function () { ready(function () { mount(); }); };
  (document.head || document.documentElement).appendChild(s);
})();
