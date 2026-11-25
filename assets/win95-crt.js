/* Envuelve la Xperiencia Win95 en el CRT, mueve la verja al cristal
 * y hace que el botón de encendido salga (igual que Esc). */
(function () {
  "use strict";
  var CRT_W = 784, CRT_H = 716;

  function $(id) { return document.getElementById(id); }

  function placeGate() {
    var screen = $("crt-screen"), gate = $("admira-gate");
    if (screen && gate && gate.parentElement !== screen) screen.appendChild(gate);
  }

  function exitComoEsc() {
    try {
      if (window.parent && window.parent !== window) {
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

  /* Si un navegador viejo no llegó a parchear fit(), escalamos el CRT aquí. */
  window.win95CrtFit = function (stageScaleHolder) {
    var shell = $("crt-shell");
    if (!shell) return 1;
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vw / CRT_W, vh / CRT_H);
    var l = Math.round((vw - CRT_W * scale) / 2);
    var t = Math.round((vh - CRT_H * scale) / 2);
    shell.style.transform = "translate(" + l + "px," + t + "px) scale(" + scale + ")";
    if (stageScaleHolder) stageScaleHolder.SCALE = scale;
    return scale;
  };

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    placeGate();
    bindPower();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { placeGate(); bindPower(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  });
})();
