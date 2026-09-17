/* acceso-espejo.js — la puerta de Yokup, pero en admira.live.
 *
 * En yokup.com las páginas de la plataforma van detrás de /acceso.js: login con Google
 * y una cookie de sesión HttpOnly de api.yokup.com. Ese guion no sirve tal cual aquí:
 *
 *  · usa el flujo de REDIRECCIÓN contra https://www.yokup.com/auth/callback, que es una
 *    página de yokup. Aquí se usa el flujo de VENTANA (popup): el navegador se trae la
 *    credencial de Google y la entrega a POST /auth/login sin salir de admira.live, así
 *    que no hace falta callback propio ni una URI nueva dada de alta en Google.
 *  · fija la cookie de estado en el dominio yokup.com.
 *
 * Lo demás es igual y a propósito: la sesión sigue siendo una cookie HttpOnly de
 * api.yokup.com que este JavaScript NO puede leer, la lista de quién entra la decide el
 * worker, y aquí sólo se decide a qué host se le manda la cookie.
 *
 * Instalar lo más arriba del <head>:  <script src="/acceso-espejo.js"></script>
 */
(function () {
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WORKER = "https://api.yokup.com";
  var rawFetch = window.fetch.bind(window);

  // ¿La URL apunta al worker? Sólo ese host recibe la cookie. Prefijo ANCLADO al ORIGEN:
  // tras el host debe venir un límite real (/, ?, # o fin) para que api.yokup.com.evil no
  // cuele como de casa y se lleve la sesión a un dominio ajeno.
  function esDelWorker(u) {
    if (String(u).indexOf(WORKER) !== 0) return false;
    var c = String(u).charAt(WORKER.length);
    return c === "" || c === "/" || c === "?" || c === "#";
  }

  // La página se esconde hasta saber si hay sesión, igual que en yokup: si no, se ve un
  // parpadeo de datos antes de la verja.
  document.documentElement.classList.add("yk-locked");
  var estilo = document.createElement("style");
  estilo.textContent =
    "html.yk-locked body{visibility:hidden!important}" +
    "#yk-gate{position:fixed;inset:0;z-index:2147483647;visibility:visible;display:flex;align-items:center;justify-content:center;padding:24px;" +
      "background:radial-gradient(120% 90% at 50% 12%,#0a1f2e,#02080d);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}" +
    "#yk-gate .card{width:min(92vw,380px);background:#02080d;border:1px solid rgba(120,243,255,.28);border-radius:18px;padding:30px 26px;box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}" +
    "#yk-gate .logo{font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:16px;color:#dff8ff;margin-bottom:6px}" +
    "#yk-gate .logo b{color:#78f3ff}" +
    "#yk-gate .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#78f3ff;box-shadow:0 0 16px #78f3ff;margin-right:9px;animation:ykb 2s infinite}" +
    "@keyframes ykb{0%,100%{opacity:1}50%{opacity:.3}}" +
    "#yk-gate h2{font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#eef7ff;margin:16px 0 6px}" +
    "#yk-gate p{font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#75aab9;margin-bottom:20px}" +
    "#yk-gate .btnwrap{display:flex;justify-content:center;min-height:44px}" +
    "#yk-gate .err{font-family:system-ui,sans-serif;font-size:12.5px;color:#ff8866;margin-top:16px;min-height:18px}" +
    "#yk-gate .foot{margin-top:22px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#3a5f6b}";
  (document.head || document.documentElement).appendChild(estilo);

  // Fontanería: todo lo que va al worker espera a que haya sesión y viaja con la cookie.
  var listo; var sesionLista = new Promise(function (r) { listo = r; });
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    if (!esDelWorker(u)) return rawFetch(input, init);
    return sesionLista.then(function () {
      init = init || {};
      init.credentials = "include";
      return rawFetch(u, init);
    });
  };

  function abrir() {
    document.documentElement.classList.remove("yk-locked");
    var g = document.getElementById("yk-gate");
    if (g) g.remove();
  }

  function fallo(texto) {
    var e = document.querySelector("#yk-gate .err");
    if (e) e.textContent = texto;
  }

  function verja() {
    var pinta = function () {
      if (document.getElementById("yk-gate")) return;
      var g = document.createElement("div"); g.id = "yk-gate";
      g.innerHTML =
        '<div class="card">' +
          '<div class="logo"><span class="dot"></span>Yo<b>kup</b></div>' +
          '<h2>Acceso restringido</h2>' +
          '<p>Zona de operación de la flota Admira. Identifícate para continuar.</p>' +
          '<div class="btnwrap"><div id="yk-gbtn"></div></div>' +
          '<div class="err"></div>' +
          '<div class="foot">admira.live · sesión de Yokup</div>' +
        '</div>';
      document.body.appendChild(g);
      cargarGoogle();
    };
    if (document.body) pinta(); else document.addEventListener("DOMContentLoaded", pinta);
  }

  function entrar(credential, state) {
    return rawFetch(WORKER + "/auth/login", {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: state, credential: credential })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (d && d.ok) { location.reload(); return; }
        // El worker distingue «tú no estás en la lista» de «esta credencial no vale».
        // Decirlo con precisión ahorra media hora de dudas a quien está delante.
        fallo(d && d.error === "not_allowed"
          ? "Tu cuenta no está en la lista de acceso."
          : "No se pudo validar el acceso (" + ((d && d.error) || "sin detalle") + ").");
      })
      .catch(function () { fallo("No se pudo contactar con Yokup."); });
  }

  function cargarGoogle() {
    var arranca = function () {
      rawFetch(WORKER + "/auth/challenge", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow: "popup" })
      })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("challenge")); })
      .then(function (reto) {
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: reto.nonce,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: false,
          state_cookie_domain: "admira.live",
          callback: function (resp) { entrar(resp && resp.credential, reto.state); }
        });
        google.accounts.id.renderButton(document.getElementById("yk-gbtn"),
          { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240 });
      })
      .catch(function () { fallo("No se pudo iniciar el acceso seguro."); });
    };
    if (window.google && google.accounts && google.accounts.id) return arranca();
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = arranca;
    s.onerror = function () { fallo("No se pudo cargar el login de Google."); };
    document.head.appendChild(s);
  }

  rawFetch(WORKER + "/auth/session", { credentials: "include", cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.ok) { if (d.email) try { localStorage.setItem("yk_email", d.email); } catch (e) {} abrir(); listo(); }
      else verja();
    })
    .catch(verja);

  // Gancho de pruebas: expone SÓLO el predicado del host, como hace acceso.js en yokup.
  try { window.__ykEspejoTest = { esDelWorker: esDelWorker, WORKER: WORKER, CLIENT_ID: CLIENT_ID }; } catch (e) {}
})();
