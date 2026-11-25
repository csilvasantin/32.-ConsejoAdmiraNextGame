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
    "#win95-fs-wrap{position:fixed;inset:0;z-index:2147483000;background:#0a0b0d}" +
    "#win95-fs-wrap[hidden]{display:none!important}" +
    "#win95-fs-tools{position:absolute;top:10px;right:12px;z-index:3;display:flex;gap:8px;align-items:center}" +
    "#win95-fs-tools button{font:8px/1.4 'Press Start 2P',monospace;color:#1a1004;background:#e6c788;" +
    "border:1px solid #ffe08a;padding:6px 10px;cursor:pointer;box-shadow:2px 2px #090603}" +
    "#win95-fs-tools button:hover{background:#fff0b0}" +
    "#win95-fs-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0a0b0d}";
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
    '<div id="win95-fs-tools">' +
    '<button type="button" id="win95-fs-monitor">Monitor: ON</button>' +
    '<button type="button" id="win95-fs-salir">' + T("Salir (Esc)", "Exit (Esc)") + "</button></div>" +
    '<iframe id="win95-fs-frame" src="about:blank" title="Win95 · Xperiencia" allow="fullscreen; autoplay"></iframe>';
  document.body.appendChild(wrap);

  var frame = document.getElementById("win95-fs-frame");
  var salir = document.getElementById("win95-fs-salir");
  var monitorBtn = document.getElementById("win95-fs-monitor");
  var SRC = "/windows95/";
  function crtOn() {
    try { return localStorage.getItem("admira-win95-crt") !== "0"; } catch (e) { return true; }
  }
  function pintaMonitor(on) {
    if (!monitorBtn) return;
    monitorBtn.textContent = on ? "Monitor: ON" : "Monitor: OFF";
    monitorBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function srcCrt() { return SRC + (crtOn() ? "?crt=1" : "?crt=0"); }
  function setCrt(on) {
    try { localStorage.setItem("admira-win95-crt", on ? "1" : "0"); } catch (e) {}
    pintaMonitor(on);
    try {
      if (frame.contentWindow) frame.contentWindow.postMessage({ source: "win95-crt", action: "set-crt", on: on }, location.origin);
    } catch (e) {}
  }
  pintaMonitor(crtOn());

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
    var dest = srcCrt();
    if (frame.getAttribute("src") !== dest) frame.src = dest;
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
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.source !== "win95-crt") return;
    if (e.data.action === "exit" && !wrap.hidden) cerrar();
    if (e.data.action === "crt-state") pintaMonitor(!!e.data.on);
  });
  if (monitorBtn) monitorBtn.addEventListener("click", function (e) {
    e.preventDefault();
    setCrt(!crtOn());
  });
  document.addEventListener("keydown", function (e) {
    if (wrap.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      setCrt(!crtOn());
    }
  });
  function onFs() {
    if (!wrap.hidden && fsEl() && fsEl() !== wrap) return;
    if (!wrap.hidden && !fsEl()) cerrar();
  }
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", onFs);
})();
