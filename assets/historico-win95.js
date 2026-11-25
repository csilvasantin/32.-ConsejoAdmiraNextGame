/* Histórico → Win95 · Xperiencia a pantalla completa (25-11-2026).
 * Se carga solo en /chat/<consejero>/. El clic del usuario pide Fullscreen
 * sobre el recuadro (API de pantalla completa). Esc o «Salir (Esc)» cierran.
 * /win95 sigue detrás del login (auth-gate). Sin secretos ni tracking. */
(function () {
  "use strict";
  if (document.getElementById("win95-xperiencia")) return;

  var EN = false;
  try {
    var q = new URL(location.href).searchParams.get("lang");
    if (q) EN = /^en/i.test(q);
    else {
      var s = localStorage.getItem("admiranext_expert_lang") || localStorage.getItem("xtanco_lang");
      EN = !!s && /^en/i.test(s);
    }
  } catch (e) { EN = false; }
  function T(es, en) { return EN ? en : es; }

  if (!document.querySelector('link[href*="Press+Start+2P"]')) {
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
    document.head.appendChild(font);
  }

  var css = document.createElement("style");
  css.textContent =
    "#win95-xperiencia{display:inline-block;margin:8px 0 0;padding:8px 10px;" +
    "font:8px/1.5 'Press Start 2P',monospace;color:#ffdf73;background:#211405;" +
    "border:1px solid #9c7326;box-shadow:2px 2px #090603;cursor:pointer;" +
    "letter-spacing:0;text-decoration:none}" +
    "#win95-xperiencia:hover{color:#fff0b0;background:#79532d}" +
    "#win95-xperiencia:focus-visible{outline:2px solid #ffff00;outline-offset:2px}" +
    "#win95-fs-wrap{position:fixed;inset:0;z-index:2147483000;background:#000;" +
    "display:flex;flex-direction:column}" +
    "#win95-fs-wrap[hidden]{display:none!important}" +
    "#win95-fs-wrap .win95-fs-chrome{flex:none;display:flex;align-items:center;" +
    "gap:10px;padding:6px 10px;background:#211405;border-bottom:1px solid #9c7326;" +
    "font:8px/1.4 'Press Start 2P',monospace;color:#ffdf73}" +
    "#win95-fs-salir{font:inherit;color:#1a1004;background:#e6c788;border:1px solid #ffe08a;" +
    "padding:6px 10px;cursor:pointer}" +
    "#win95-fs-salir:hover{background:#fff0b0}" +
    "#win95-fs-frame{flex:1;width:100%;border:0;background:#000}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "win95-xperiencia";
  btn.textContent = T("Win95 · Xperiencia", "Win95 · Xperience");
  btn.setAttribute("aria-label", T(
    "Abrir Win95 · Xperiencia a pantalla completa. Esc para salir.",
    "Open Win95 · Xperience in fullscreen. Press Esc to exit."
  ));

  var header = document.querySelector("header");
  if (header) header.appendChild(btn);
  else document.body.insertBefore(btn, document.body.firstChild);

  var wrap = document.createElement("div");
  wrap.id = "win95-fs-wrap";
  wrap.hidden = true;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", T("Win95 · Xperiencia a pantalla completa", "Win95 · Xperience fullscreen"));
  wrap.innerHTML =
    '<div class="win95-fs-chrome">' +
    '<button type="button" id="win95-fs-salir">' + T("Salir (Esc)", "Exit (Esc)") + "</button>" +
    "<span>" + T("Pantalla completa · Esc para salir", "Fullscreen · Esc to exit") + "</span>" +
    "</div>" +
    '<iframe id="win95-fs-frame" src="about:blank" title="Win95 · Xperiencia" allow="fullscreen; autoplay"></iframe>';
  document.body.appendChild(wrap);

  var frame = document.getElementById("win95-fs-frame");
  var salir = document.getElementById("win95-fs-salir");
  var SRC = "/windows95/";

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function pideFS() {
    var fn = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    if (fn) {
      try {
        var r = fn.call(wrap);
        if (r && typeof r.catch === "function") r.catch(function () {});
      } catch (e) {}
    }
  }
  function sueltaFS() {
    if (!fsEl()) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) {
      try {
        var r = fn.call(document);
        if (r && typeof r.catch === "function") r.catch(function () {});
      } catch (e) {}
    }
  }
  function abrir() {
    wrap.hidden = false;
    if (frame.getAttribute("src") !== SRC) frame.src = SRC;
    pideFS();
    try { salir.focus(); } catch (e) {}
  }
  function cerrar() {
    sueltaFS();
    wrap.hidden = true;
    frame.src = "about:blank";
    try { btn.focus(); } catch (e) {}
  }

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    abrir();
  });
  salir.addEventListener("click", function (e) {
    e.preventDefault();
    cerrar();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !wrap.hidden) {
      e.preventDefault();
      cerrar();
    }
  });
  function onFs() {
    if (!wrap.hidden && fsEl() && fsEl() !== wrap) return;
    if (!wrap.hidden && !fsEl()) cerrar();
  }
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", onFs);
})();
