/* /windows95/?fs=1 — entra a pantalla completa en el primer clic (gesto del usuario).
 * Esc o el botón «Salir (Esc)» salen. No pisa el fullscreen del Windows Media Player. */
(function () {
  "use strict";
  var want = false;
  try { want = new URL(location.href).searchParams.get("fs") === "1"; } catch (e) { want = false; }
  if (!want) return;

  var css = document.createElement("style");
  css.textContent =
    "#win95-page-fs-salir{position:fixed;right:10px;top:8px;z-index:2147483646;" +
    "font:8px/1.4 'Press Start 2P',monospace,Tahoma,sans-serif;color:#1a1004;" +
    "background:#e6c788;border:1px solid #ffe08a;padding:6px 10px;cursor:pointer;" +
    "box-shadow:2px 2px #090603}" +
    "#win95-page-fs-hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);" +
    "z-index:2147483646;font:8px/1.5 'Press Start 2P',monospace,Tahoma,sans-serif;" +
    "color:#ffdf73;background:#211405;border:1px solid #9c7326;padding:8px 12px;" +
    "box-shadow:2px 2px #090603;pointer-events:none;max-width:90%;text-align:center}" +
    "#win95-page-fs-salir[hidden],#win95-page-fs-hint[hidden]{display:none!important}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "win95-page-fs-salir";
  btn.textContent = "Salir (Esc)";
  btn.setAttribute("aria-label", "Salir de pantalla completa");
  document.documentElement.appendChild(btn);

  var hint = document.createElement("div");
  hint.id = "win95-page-fs-hint";
  hint.textContent = "Pulsa para pantalla completa · Esc para salir";
  document.documentElement.appendChild(hint);

  function elFS() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function esPagina() {
    var el = elFS();
    return el === document.documentElement || el === document.body;
  }
  function entrar() {
    if (elFS()) return;
    var node = document.documentElement;
    var fn = node.requestFullscreen || node.webkitRequestFullscreen;
    if (!fn) return;
    try {
      var r = fn.call(node);
      if (r && typeof r.catch === "function") r.catch(function () {});
    } catch (e) {}
  }
  function salir() {
    if (!elFS()) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return;
    try {
      var r = fn.call(document);
      if (r && typeof r.catch === "function") r.catch(function () {});
    } catch (e) {}
  }
  function pinta() {
    var on = esPagina();
    hint.hidden = on;
    btn.hidden = false;
  }

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (esPagina()) salir();
    else if (!elFS()) entrar();
    else history.back();
  });
  document.addEventListener("click", function (e) {
    if (e.target === btn) return;
    if (!elFS()) entrar();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!esPagina()) return;
    salir();
  }, true);
  document.addEventListener("win95-crt-power", function () {
    if (esPagina()) salir();
    else if (!elFS()) history.back();
  });
  document.addEventListener("fullscreenchange", pinta);
  document.addEventListener("webkitfullscreenchange", pinta);
  pinta();
})();
