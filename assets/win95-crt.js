/* CRT realista + interruptor del marco (ON/OFF, tecla M, ?crt=0/1, localStorage),
 * modo Extended (OFF por defecto): escritorio a 100vw×100vh, sin formato 4:3,
 * y Entrelazado (ON por defecto): scanlines CRT; OFF las quita para trabajar nítido.
 * Viñeta y reflejo se mantienen; las scanlines solo se ocultan con Entrelazado OFF. */
(function () {
  "use strict";
  var KEY = "admira-win95-crt";
  var KEY_EXT = "admira-win95-extended";
  var KEY_ENT = "admira-win95-entrelazado";
  var CRT_W = 784, CRT_H = 716, BARE_W = 640, BARE_H = 480;

  function $(id) { return document.getElementById(id); }
  function inIframe() {
    try { return window.parent && window.parent !== window; } catch (e) { return true; }
  }

  function leerCrt() {
    try {
      var q = new URL(location.href).searchParams.get("crt");
      if (q === "0") return false;
      if (q === "1") return true;
      return localStorage.getItem(KEY) !== "0";
    } catch (e) { return true; }
  }

  function leerExtended() {
    try {
      return localStorage.getItem(KEY_EXT) === "1";
    } catch (e) { return false; }
  }

  function leerEntrelazado() {
    try {
      return localStorage.getItem(KEY_ENT) !== "0";
    } catch (e) { return true; }
  }

  function escribirUrl(on) {
    try {
      var u = new URL(location.href);
      u.searchParams.set("crt", on ? "1" : "0");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function syncMonitorBtn(on) {
    var btn = $("crt-monitor-toggle");
    if (!btn) return;
    btn.textContent = on ? "Monitor: ON" : "Monitor: OFF";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on
      ? "Ocultar el marco del monitor. Tecla M."
      : "Mostrar el marco del monitor. Tecla M.");
  }

  function syncExtendedBtn(on) {
    var btn = $("crt-extended-toggle");
    if (!btn) return;
    btn.textContent = on ? "Extended: ON" : "Extended: OFF";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on
      ? "Volver al formato 4:3 original del escritorio."
      : "Extender el escritorio a todo el ancho y alto disponibles.");
  }

  function syncEntrelazadoBtn(on) {
    var btn = $("crt-entrelazado-toggle");
    if (!btn) return;
    btn.textContent = on ? "Entrelazado: ON" : "Entrelazado: OFF";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on
      ? "Quitar las líneas de entrelazado CRT para ver el escritorio nítido."
      : "Activar las líneas de entrelazado CRT, el modo retro.");
  }

  function aplicarEntrelazado(on, opts) {
    opts = opts || {};
    on = !!on;
    document.documentElement.classList.toggle("crt-interlace-off", !on);
    if (!opts.skipStore) {
      try { localStorage.setItem(KEY_ENT, on ? "1" : "0"); } catch (e) {}
    }
    syncEntrelazadoBtn(on);
  }

  function aplicarExtended(on, opts) {
    opts = opts || {};
    on = !!on;
    document.documentElement.classList.toggle("crt-extended", on);
    try { localStorage.setItem(KEY_EXT, on ? "1" : "0"); } catch (e) {}
    if (on) {
      document.documentElement.classList.add("crt-frame-off");
      syncMonitorBtn(false);
    } else if (!opts.skipMonitorRestore) {
      aplicar(leerCrt(), { url: false, skipStore: true, skipResize: true, skipExtendedCheck: true });
    }
    syncExtendedBtn(on);
    if (!opts.skipResize) {
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    }
  }

  function aplicar(on, opts) {
    opts = opts || {};
    if (on && opts.fromUser && !opts.skipExtendedCheck &&
        document.documentElement.classList.contains("crt-extended")) {
      aplicarExtended(false, { skipMonitorRestore: true, skipResize: true });
    }
    document.documentElement.classList.toggle("crt-frame-off", !on);
    if (!opts.skipStore) {
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    }
    if (opts.url) escribirUrl(on);
    syncMonitorBtn(on);
    if (!opts.skipResize) {
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    }
    if (inIframe()) {
      try {
        window.parent.postMessage({ source: "win95-crt", action: "crt-state", on: on }, location.origin);
      } catch (e) {}
    }
  }

  function placeGate() {
    var screen = $("crt-screen"), gate = $("admira-gate");
    if (screen && gate && gate.parentElement !== screen) screen.appendChild(gate);
  }

  function exitComoEsc() {
    try {
      if (inIframe()) {
        window.parent.postMessage({ source: "win95-crt", action: "exit" }, location.origin);
      }
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("win95-crt-power"));
    var el = document.fullscreenElement || document.webkitFullscreenElement;
    if (!el) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) {
      try {
        var r = fn.call(document);
        if (r && typeof r.catch === "function") r.catch(function () {});
      } catch (e) {}
    }
  }

  function bindPower() {
    var btn = $("crt-power");
    if (!btn || btn.getAttribute("data-bound") === "1") return;
    btn.setAttribute("data-bound", "1");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      exitComoEsc();
    });
  }

  function esEscribiendo(e) {
    var t = e.target;
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || t.isContentEditable) return true;
    if (t.closest && t.closest("[contenteditable], .notebody, #icqReal, .fin, textarea, input")) return true;
    return false;
  }

  function capas() {
    var mon = $("crt-monitor"), shell = $("crt-shell"), stand = $("crt-stand");
    if (shell && !shell.querySelector(".crt-ambient")) {
      var amb = document.createElement("div");
      amb.className = "crt-ambient";
      amb.setAttribute("aria-hidden", "true");
      shell.insertBefore(amb, shell.firstChild);
    }
    if (mon && !mon.querySelector(".crt-grain")) {
      var g = document.createElement("div");
      g.className = "crt-grain";
      g.setAttribute("aria-hidden", "true");
      mon.insertBefore(g, mon.firstChild);
    }
    if (mon && !mon.querySelector(".crt-lip")) {
      var lip = document.createElement("div");
      lip.className = "crt-lip";
      lip.setAttribute("aria-hidden", "true");
      mon.insertBefore(lip, mon.firstChild.nextSibling);
    }
    if (mon && !mon.querySelector(".crt-well")) {
      var well = document.createElement("div");
      well.className = "crt-well";
      well.setAttribute("aria-hidden", "true");
      var screen = $("crt-screen");
      if (screen) mon.insertBefore(well, screen);
      else mon.appendChild(well);
    }
    if (stand && !stand.querySelector(".floor-shadow")) {
      var sh = document.createElement("div");
      sh.className = "floor-shadow";
      sh.setAttribute("aria-hidden", "true");
      stand.appendChild(sh);
    }
    if (!document.getElementById("crt-svg-defs")) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "crt-svg-defs";
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      svg.innerHTML = '<defs><filter id="crt-grain" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.85 0.9" numOctaves="4" seed="95" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.92  0 0 0 0 0.86  0 0 0 0 0.74  0 0 0 0.22 0"/></filter></defs>';
      document.body.appendChild(svg);
    }
  }

  function irAHome() {
    try { location.href = "/"; } catch (e) { location.assign("/"); }
  }

  function apagarEquipo() {
    var btn = $("crt-computer-toggle");
    if (btn) {
      if (btn.getAttribute("data-off") === "1") return;
      btn.setAttribute("data-off", "1");
      btn.textContent = "Computer: OFF";
      btn.setAttribute("aria-pressed", "false");
    }
    document.documentElement.classList.add("computer-off");
    var cover = $("computer-off-cover");
    if (!cover) {
      cover = document.createElement("div");
      cover.id = "computer-off-cover";
      cover.setAttribute("aria-hidden", "true");
      cover.innerHTML = '<div class="msg">Espere mientras se apaga el equipo...</div>';
      document.body.appendChild(cover);
    }
    cover.style.display = "block";
    setTimeout(irAHome, 700);
  }

  function botonera() {
    if (inIframe()) {
      document.documentElement.classList.add("crt-in-iframe");
      return;
    }
    if ($("crt-ui")) return;
    var ui = document.createElement("div");
    ui.id = "crt-ui";
    var mon = document.createElement("button");
    mon.type = "button";
    mon.id = "crt-monitor-toggle";
    ui.appendChild(mon);
    var comp = document.createElement("button");
    comp.type = "button";
    comp.id = "crt-computer-toggle";
    comp.textContent = "Computer: ON";
    comp.setAttribute("aria-pressed", "true");
    comp.setAttribute("aria-label", "Apagar el equipo y volver al menú de admira.live.");
    ui.appendChild(comp);
    var ext = document.createElement("button");
    ext.type = "button";
    ext.id = "crt-extended-toggle";
    ext.textContent = "Extended: OFF";
    ext.setAttribute("aria-pressed", "false");
    ext.setAttribute("aria-label", "Extender el escritorio a todo el ancho y alto disponibles.");
    ui.appendChild(ext);
    var ent = document.createElement("button");
    ent.type = "button";
    ent.id = "crt-entrelazado-toggle";
    ent.textContent = "Entrelazado: ON";
    ent.setAttribute("aria-pressed", "true");
    ent.setAttribute("aria-label", "Quitar las líneas de entrelazado CRT para ver el escritorio nítido.");
    ui.appendChild(ent);
    var salir = $("win95-page-fs-salir");
    if (salir) ui.appendChild(salir);
    document.body.appendChild(ui);
    mon.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      aplicar(document.documentElement.classList.contains("crt-frame-off"), { url: true, fromUser: true });
    });
    comp.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      apagarEquipo();
    });
    ext.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      aplicarExtended(!document.documentElement.classList.contains("crt-extended"));
    });
    ent.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      aplicarEntrelazado(document.documentElement.classList.contains("crt-interlace-off"));
    });
  }

  window.win95CrtFit = function () {
    var shell = $("crt-shell");
    if (!shell) return 1;
    var ext = document.documentElement.classList.contains("crt-extended");
    if (ext) {
      var evw = window.innerWidth, evh = window.innerHeight;
      shell.style.width = evw + "px";
      shell.style.height = evh + "px";
      shell.style.transform = "none";
      return 1;
    }
    shell.style.width = "";
    shell.style.height = "";
    var off = document.documentElement.classList.contains("crt-frame-off");
    var sw = off ? BARE_W : CRT_W, sh = off ? BARE_H : CRT_H;
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vw / sw, vh / sh);
    var l = Math.round((vw - sw * scale) / 2);
    var t = Math.round((vh - sh * scale) / 2);
    shell.style.transform = "translate(" + l + "px," + t + "px) scale(" + scale + ")";
    return scale;
  };

  window.win95CrtSet = function (on) { aplicar(!!on, { url: true, fromUser: true }); };
  window.win95CrtOn = function () { return !document.documentElement.classList.contains("crt-frame-off"); };
  window.win95ExtendedSet = function (on) { aplicarExtended(!!on); };
  window.win95ExtendedOn = function () { return document.documentElement.classList.contains("crt-extended"); };
  window.win95EntrelazadoSet = function (on) { aplicarEntrelazado(!!on); };
  window.win95EntrelazadoOn = function () { return !document.documentElement.classList.contains("crt-interlace-off"); };

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function aplicarInicio() {
    if (leerExtended()) aplicarExtended(true, { skipResize: true });
    else aplicar(leerCrt(), { url: false, skipResize: true });
    aplicarEntrelazado(leerEntrelazado(), { skipStore: true });
  }

  aplicarInicio();

  ready(function () {
    capas();
    botonera();
    aplicarInicio();
    placeGate();
    bindPower();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { placeGate(); bindPower(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (esEscribiendo(e)) return;
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      aplicar(document.documentElement.classList.contains("crt-frame-off"), { url: true, fromUser: true });
    }
  });

  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.source !== "win95-crt") return;
    if (e.data.action === "set-crt") aplicar(!!e.data.on, { url: true, fromUser: true });
    if (e.data.action === "query-crt") {
      try {
        e.source && e.source.postMessage({ source: "win95-crt", action: "crt-state", on: window.win95CrtOn() }, location.origin);
      } catch (err) {}
    }
  });
})();
