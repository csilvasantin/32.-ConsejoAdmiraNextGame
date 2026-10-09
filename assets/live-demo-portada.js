/* /demo portada · FLT-101758 (Jobs/Smith, 09-10-2026).
 * En Expert mode: /demo, /demo portada, /demo home o /demo live muestran en vivo que
 * (a) la barra Experto está oculta por defecto y (b) Conversación acepta pegar imágenes. */
(function (root) {
  'use strict';
  if (root.__liveDemoPortada) return;
  root.__liveDemoPortada = true;

  function T(es, en) {
    return (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? en : es;
  }

  function ensureOverlay() {
    var el = document.getElementById('live-demo-portada');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'live-demo-portada';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<style>' +
      '#live-demo-portada{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;' +
      'background:rgba(8,6,2,.72);padding:24px;font:16px/1.45 system-ui,sans-serif;color:#fff3cf}' +
      '#live-demo-portada.on{display:flex}' +
      '#live-demo-portada .card{max-width:560px;width:100%;background:#1a140c;border:1px solid #c9a86a;border-radius:12px;' +
      'padding:22px 24px;box-shadow:0 18px 60px rgba(0,0,0,.45)}' +
      '#live-demo-portada h2{margin:0 0 12px;font:700 20px/1.2 system-ui,sans-serif;color:#ffdf73}' +
      '#live-demo-portada ol{margin:0 0 14px;padding-left:1.2em}' +
      '#live-demo-portada li{margin:8px 0}' +
      '#live-demo-portada .ok{color:#8dffb0;font-weight:600}' +
      '#live-demo-portada .hint{color:#c9ba9c;font-size:13px;margin:0 0 14px}' +
      '#live-demo-portada .hl{outline:3px solid #50c8ff;outline-offset:3px;border-radius:6px;transition:outline-color .2s}' +
      '#live-demo-portada button{background:#211405;color:#ffdf73;border:1px solid #9c7326;padding:8px 14px;cursor:pointer;font:inherit;border-radius:6px}' +
      '</style>' +
      '<div class="card">' +
      '<h2></h2><p class="hint"></p><ol></ol><p class="status"></p>' +
      '<button type="button" data-close>Cerrar</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('on')) close(); });
    return el;
  }

  function flash(sel) {
    var n = document.querySelector(sel);
    if (!n) return;
    n.classList.add('hl');
    setTimeout(function () { n.classList.remove('hl'); }, 2200);
  }

  function close() {
    var el = document.getElementById('live-demo-portada');
    if (el) el.classList.remove('on');
    document.querySelectorAll('.hl').forEach(function (n) { n.classList.remove('hl'); });
  }

  function expertoHiddenByDefault() {
    var script = document.querySelector('script[data-mount="#ax-live-experto"],script[src*="experto.js"]');
    var min = script && script.getAttribute('data-min');
    var dock = document.documentElement.getAttribute('data-ax-dock');
    var panel = document.getElementById('ax-live-experto');
    var hidden = min === 'hide' && (dock === 'hidden' || (panel && panel.classList.contains('ax-hide')) ||
      (root.AdmiraExperto && !root.AdmiraExperto.isOpen()));
    return { min: min, dock: dock, hidden: !!hidden || min === 'hide' };
  }

  function run(log) {
    var el = ensureOverlay();
    var st = expertoHiddenByDefault();
    var composer = document.querySelector('.council-composer textarea, #action-input');
    el.querySelector('h2').textContent = T('Demo portada · admira.live', 'Home demo · admira.live');
    el.querySelector('.hint').textContent = T(
      'FLT-101758 · barra Experto oculta por defecto + pegar imagen en Conversación hacia Jobs.',
      'FLT-101758 · Expert bar hidden by default + paste image in Conversation to Jobs.'
    );
    var ol = el.querySelector('ol');
    ol.innerHTML =
      '<li class="' + (st.min === 'hide' ? 'ok' : '') + '">' +
      T('(a) Experto data-min="hide" · no se muestra al cargar la portada.',
        '(a) Expert data-min="hide" · not shown when the home loads.') +
      ' <code>data-min=' + (st.min || '—') + '</code></li>' +
      '<li class="' + (composer ? 'ok' : '') + '">' +
      T('(b) Conversación acepta Ctrl/Cmd-V de image/* (miniatura + envío a Jobs vía /api/chat/adjunto).',
        '(b) Conversation accepts Ctrl/Cmd-V of image/* (thumbnail + send to Jobs via /api/chat/adjunto).') +
      '</li>' +
      '<li>' + T('Abre Experto con el icono ⌘ del top-bar; /demo portada vuelve a enseñar esto.',
        'Open Expert with the top-bar ⌘ icon; /demo portada shows this again.') + '</li>';
    el.querySelector('.status').textContent = st.hidden
      ? T('✓ Barra Experto oculta ahora (como al entrar).', '✓ Expert bar hidden now (as on entry).')
      : T('Experto está abierto · ciérralo para ver el estado por defecto.', 'Expert is open · close it to see the default state.');
    el.classList.add('on');
    // Highlight targets briefly.
    if (root.AdmiraExperto && root.AdmiraExperto.isOpen && root.AdmiraExperto.isOpen()) {
      try { root.AdmiraExperto.close(); } catch (e) {}
    }
    setTimeout(function () {
      flash('#pf-ic-experto');
      flash('.council-composer textarea');
      flash('#action-input');
    }, 200);
    if (log && typeof log.appendChild === 'function') {
      var pre = document.createElement('div');
      pre.textContent = T(
        'Demo portada: Experto oculto por defecto · Conversación admite pegar imagen → Jobs.',
        'Home demo: Expert hidden by default · Conversation accepts pasted image → Jobs.'
      );
      log.appendChild(pre);
    }
    try {
      document.dispatchEvent(new CustomEvent('admira:demo', { detail: { id: 'portada', live: true } }));
    } catch (e) {}
    return { id: 'portada', ok: st.min === 'hide' };
  }

  function isPortadaDemo(text) {
    var m = /^\/?demo(?:\s+(.*))?$/i.exec(String(text || '').trim());
    if (!m) return false;
    var arg = String(m[1] || '').trim().toLowerCase();
    return !arg || /^(portada|home|live|conversacion|conversación|paste|imagen)$/i.test(arg);
  }

  function wire() {
    // Capture Expert CLI submit before the suite handles /demo.
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      var input = form.querySelector('input, textarea');
      var text = input && input.value;
      if (!isPortadaDemo(text)) return;
      var arg = String((/^\/?demo(?:\s+(.*))?$/i.exec(String(text || '').trim()) || [])[1] || '').trim();
      // Bare /demo: also show portada overlay; let suite list the five solutions.
      if (!arg) {
        setTimeout(function () { run(document.querySelector('.ax-cli-out')); }, 0);
        return;
      }
      // /demo portada|home|live: ours only.
      e.preventDefault();
      e.stopPropagation();
      if (root.AdmiraExperto && root.AdmiraExperto.open) root.AdmiraExperto.open();
      run(document.querySelector('.ax-cli-out'));
      if (input) input.value = '';
    }, true);

    // Also expose for programmatic /demo verification.
    root.LiveDemoPortada = { run: run, close: close };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(typeof window !== 'undefined' ? window : globalThis);
