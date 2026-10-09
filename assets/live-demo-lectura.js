/* /demo lectura · FLT-101759 (SmithMacMini, 09-10-2026).
 * Enseña el estado real de la verja: humano sin sesión, o agente en solo lectura.
 * No da por buena una sesión que la página no esté mostrando. */
(function (root) {
  'use strict';
  if (root.__liveDemoLectura) return;
  root.__liveDemoLectura = true;

  function T(es, en) {
    return (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? en : es;
  }

  function esDemoLectura(text) {
    var m = /^\/?demo(?:\s+(.*))?$/i.exec(String(text || '').trim());
    if (!m) return false;
    var arg = String(m[1] || '').trim().toLowerCase();
    return /^(lectura|verja|agente|solo lectura|solo-lectura|readonly)$/.test(arg);
  }

  function leer() {
    var user = null;
    var csrf = '';
    try { user = root.admiraGateUser && root.admiraGateUser(); } catch (e) {}
    try { csrf = (root.admiraGateCsrf && root.admiraGateCsrf()) || ''; } catch (e2) {}
    var verja = document.getElementById('admira-gate');
    var google = !!(verja && /ENTRAR CON GOOGLE/.test(verja.textContent || ''));
    var ro = document.documentElement.classList.contains('admira-agent-readonly')
      && !!(user && user.agent === true && user.readOnly === true) && !csrf;
    var botones = document.querySelectorAll('#csRun,#batchSend,#carbCliSend,button[data-a],button[data-cmd],button[data-dsa],button[data-st],button[data-take],button.modo-opt');
    var apagados = 0;
    var encendidos = 0;
    for (var i = 0; i < botones.length; i++) {
      if (botones[i].disabled) apagados++;
      else encendidos++;
    }
    var path = location.pathname.replace(/\/index\.html$/, '');
    var datos = null;
    if (/\/control\/?$/.test(path)) datos = !!document.querySelector('#cards .card');
    else if (/\/players\/?$/.test(path)) datos = !!document.querySelector('#screensCards .scard, #dsCards .scard');
    else if (/\/vista-previa\/?$/.test(path)) datos = !!document.querySelector('#tabList .tab-row');
    var badge = document.getElementById('admira-ro');
    var etiqueta = !!(badge && /solo lectura/.test(badge.textContent || ''))
      || !!(document.getElementById('tokenPill') && /solo lectura/.test(document.getElementById('tokenPill').textContent || ''));
    return {
      verja: !!verja,
      google: google,
      ro: ro,
      nombre: (user && user.name) || '',
      csrf: !!csrf,
      apagados: apagados,
      encendidos: encendidos,
      datos: datos,
      etiqueta: etiqueta
    };
  }

  function ensureOverlay() {
    var el = document.getElementById('live-demo-lectura');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'live-demo-lectura';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<style>' +
      '#live-demo-lectura{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;' +
      'background:rgba(8,6,2,.72);padding:24px;font:16px/1.45 system-ui,sans-serif;color:#fff3cf}' +
      '#live-demo-lectura.on{display:flex}' +
      '#live-demo-lectura .card{max-width:560px;width:100%;background:#1a140c;border:1px solid #c9a86a;border-radius:12px;' +
      'padding:22px 24px;box-shadow:0 18px 60px rgba(0,0,0,.45)}' +
      '#live-demo-lectura h2{margin:0 0 12px;font:700 20px/1.2 system-ui,sans-serif;color:#ffdf73}' +
      '#live-demo-lectura ul{margin:0 0 14px;padding-left:1.2em}' +
      '#live-demo-lectura li{margin:8px 0}' +
      '#live-demo-lectura .ok{color:#8dffb0;font-weight:600}' +
      '#live-demo-lectura .hint{color:#c9ba9c;font-size:13px;margin:0 0 14px}' +
      '#live-demo-lectura button{background:#211405;color:#ffdf73;border:1px solid #9c7326;padding:8px 14px;cursor:pointer;font:inherit;border-radius:6px}' +
      '</style>' +
      '<div class="card"><h2></h2><p class="hint"></p><ul></ul><p class="status"></p>' +
      '<button type="button" data-close>Cerrar</button></div>';
    document.body.appendChild(el);
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('on')) close();
    });
    return el;
  }

  function close() {
    var el = document.getElementById('live-demo-lectura');
    if (el) el.classList.remove('on');
  }

  function run() {
    var s = leer();
    var el = ensureOverlay();
    el.querySelector('h2').textContent = T('Demo lectura · admira.live', 'Read-only demo · admira.live');
    el.querySelector('.hint').textContent = T(
      'FLT-101759 · lo que esta página está haciendo ahora. No es un resultado escrito a mano.',
      'FLT-101759 · what this page is doing now. It is not a hand-written result.'
    );
    var lineas = [];
    lineas.push((s.google ? '<li class="ok">' : '<li>') + T(
      s.google ? 'Sin sesión: la verja muestra ENTRAR CON GOOGLE.' : 'La verja de Google no está en pantalla.',
      s.google ? 'No session: the gate shows ENTRAR CON GOOGLE.' : 'The Google gate is not on screen.'
    ) + '</li>');
    lineas.push((s.ro && s.etiqueta && !s.csrf ? '<li class="ok">' : '<li>') + T(
      'Agente en solo lectura' + (s.nombre ? ' · ' + s.nombre : '') + (s.etiqueta ? ' · etiqueta «solo lectura»' : ' · sin etiqueta en la barra') + (s.csrf ? ' · hay csrf' : ' · sin csrf de escritura') + '.',
      'Read-only agent' + (s.nombre ? ' · ' + s.nombre : '') + (s.etiqueta ? ' · “solo lectura” label' : ' · no bar label') + (s.csrf ? ' · csrf present' : ' · no write csrf') + '.'
    ) + '</li>');
    lineas.push((s.encendidos === 0 && s.apagados > 0 ? '<li class="ok">' : '<li>') + T(
      'Botones de acción apagados: ' + s.apagados + '. Encendidos: ' + s.encendidos + '.',
      'Action buttons off: ' + s.apagados + '. On: ' + s.encendidos + '.'
    ) + '</li>');
    if (s.datos === true) lineas.push('<li class="ok">' + T('Esta página ya pinta datos.', 'This page is already showing data.') + '</li>');
    else if (s.datos === false) lineas.push('<li>' + T('Esta página aún no pinta datos.', 'This page is not showing data yet.') + '</li>');
    else lineas.push('<li>' + T('Control, Vista previa y Players son las tres pantallas de esta prueba.', 'Control, Preview and Players are the three screens of this check.') + '</li>');
    el.querySelector('ul').innerHTML = lineas.join('');
    var ok = (s.ro && s.etiqueta && !s.verja && !s.csrf && s.encendidos === 0 && (s.apagados > 0 || s.datos === null))
      || (s.google && !s.ro);
    el.querySelector('.status').textContent = ok
      ? T('✓ El estado de esta visita coincide con la verja.', '✓ This visit matches the gate.')
      : T('Esta visita no cumple el criterio de solo lectura ni el de la verja anónima.', 'This visit matches neither the read-only case nor the anonymous gate.');
    el.classList.add('on');
    try { document.dispatchEvent(new CustomEvent('admira:demo', { detail: { id: 'lectura', ok: ok, state: s } })); } catch (e) {}
    return { id: 'lectura', ok: ok, state: s };
  }

  function tomar(text) {
    if (!esDemoLectura(text)) return false;
    run();
    return true;
  }

  function wire() {
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form) return;
      var input = form.querySelector('input, textarea');
      if (!input || !tomar(input.value)) return;
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      var t = e.target;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (!tomar(t.value)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      t.value = '';
    }, true);
  }

  root.LiveDemoLectura = { run: run, close: close, leer: leer };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(typeof window !== 'undefined' ? window : globalThis);
