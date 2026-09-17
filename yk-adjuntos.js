/* ============================================================================
 * yk-adjuntos.js — Adjuntar IMÁGENES a las misiones (Carlos, 2026-07-16).
 *
 * Para que los LLMs tengan la máxima información: pegar (Ctrl+V, también desde
 * Telegram), arrastrar o elegir imágenes. Cada una se sube a R2 vía el worker
 * (POST <worker>/media, con el Bearer de la sesión que acceso.js ya parchea) y
 * queda como URL pública (GET <worker>/media/<key>) que se incrusta en el texto
 * del encargo — el agente la descarga y la ve.
 *
 * Uso:
 *   YkAdjuntos.init("https://yokup-rtc…workers.dev");
 *   const adj = YkAdjuntos.attach({ zone: formEl, thumbs: divEl, onChange: fn });
 *   adj.urls()            // ["https://…/media/m/ab.png", …] (solo las ya subidas)
 *   adj.bloque()          // "\n\n🖼 Imágenes adjuntas:\n- url1\n- url2"  (o "")
 *   adj.pending()         // nº de subidas en curso
 *   adj.clear()           // vacía tras dar de alta
 * ==========================================================================*/
(function () {
  "use strict";
  var WORKER = "";
  function init(w) { if (w) WORKER = w; }

  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }

  // Sube un File/Blob de imagen a R2 y devuelve {url,key}. window.fetch está
  // parcheado por acceso.js → añade el Bearer de sesión a las llamadas al worker.
  function subir(file) {
    return window.fetch(WORKER + "/media", {
      method: "POST",
      headers: { "content-type": file.type || "image/png" },
      body: file
    }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (o) {
        if (o.s === 200 && o.d.url) return o.d;
        throw new Error(o.s === 401 ? "necesita sesión (entra por el perímetro)" : (o.d.error || ("HTTP " + o.s)));
      });
  }

  // attach: cablea paste/drop/picker sobre `zone`, pinta miniaturas en `thumbs`.
  function attach(opts) {
    opts = opts || {};
    var zone = opts.zone, thumbs = opts.thumbs, onChange = opts.onChange || function () {};
    var items = [];   // { id, url, name, status:'up'|'ok'|'err', err }
    var seq = 0, pend = 0;

    function render() {
      if (!thumbs) return;
      thumbs.innerHTML = items.map(function (it) {
        if (it.status === "ok") return '<div class="yk-adj" data-id="' + it.id + '"><img src="' + esc(it.url) + '" alt=""><button type="button" class="yk-adj-x" title="quitar">×</button></div>';
        if (it.status === "up") return '<div class="yk-adj up" data-id="' + it.id + '"><span class="yk-adj-sp">⏳</span></div>';
        return '<div class="yk-adj err" data-id="' + it.id + '" title="' + esc(it.err || "error") + '"><span>⚠️</span><button type="button" class="yk-adj-x" title="quitar">×</button></div>';
      }).join("");
      thumbs.style.display = items.length ? "flex" : "none";
      Array.prototype.forEach.call(thumbs.querySelectorAll(".yk-adj-x"), function (b) {
        b.onclick = function (e) {
          e.preventDefault(); e.stopPropagation();
          var id = +b.closest(".yk-adj").dataset.id;
          items = items.filter(function (x) { return x.id !== id; });
          render(); onChange();
        };
      });
    }

    function add(file) {
      if (!file || !/^image\//i.test(file.type)) return;
      var it = { id: ++seq, url: "", name: file.name || "imagen", status: "up" };
      items.push(it); pend++; render(); onChange();
      subir(file).then(function (r) {
        it.url = r.url; it.status = "ok"; pend--; render(); onChange();
      }).catch(function (err) {
        it.status = "err"; it.err = err && err.message || String(err); pend--; render(); onChange();
      });
    }

    function fromClipboard(e) {
      // El paste de la zona burbujea hasta document. Sin esta marca, el mismo
      // ClipboardEvent se procesaba dos veces (dos subidas y dos miniaturas).
      if (e.__ykAdjuntosHandled) return;
      var dt = e.clipboardData; if (!dt) return;
      var got = false;
      Array.prototype.forEach.call(dt.items || [], function (i) {
        if (i.kind === "file" && /^image\//i.test(i.type)) { var f = i.getAsFile(); if (f) { add(f); got = true; } }
      });
      if (got) {
        e.__ykAdjuntosHandled = true;
        e.preventDefault();          // no pegar la ruta/binario como texto
      }
    }
    function fromDrop(e) {
      e.preventDefault(); zone.classList.remove("yk-drag");
      Array.prototype.forEach.call((e.dataTransfer && e.dataTransfer.files) || [], add);
    }

    // paste: en la zona Y global (así vale aunque el foco no esté en el input)
    if (zone) {
      zone.addEventListener("paste", fromClipboard);
      zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("yk-drag"); });
      zone.addEventListener("dragleave", function () { zone.classList.remove("yk-drag"); });
      zone.addEventListener("drop", fromDrop);
    }
    // Paste GLOBAL (para el alta, que se pinta una vez). En vistas que re-renderan
    // el compositor (ticket.html), pásalo globalPaste:false y usa el paste de la
    // zona/textarea — así no se acumulan listeners en document.
    if (opts.globalPaste !== false) {
      document.addEventListener("paste", function (e) {
        if (!zone || zone.offsetParent === null) return;   // solo si esta zona está visible
        fromClipboard(e);
      });
    }

    var api = {
      add: add,
      urls: function () { return items.filter(function (x) { return x.status === "ok"; }).map(function (x) { return x.url; }); },
      bloque: function () { var u = api.urls(); return u.length ? "\n\n🖼 Imágenes adjuntas (míralas para el máximo contexto):\n" + u.map(function (x) { return "- " + x; }).join("\n") : ""; },
      pending: function () { return pend; },
      clear: function () { items = []; pend = 0; render(); onChange(); }
    };
    render();
    return api;
  }

  window.YkAdjuntos = { init: init, attach: attach, subir: subir };
})();
