/**
 * assets/diario-cli.js — /diario en el modo experto (#5796). Partes horarios de los 6 agentes de un día.
 *   /diario            hoy · /diario ayer · /diario DD.MM.AA (p. ej. /diario 12.10.26)
 * Lee /api/diario con la llave del visor de este navegador (cabecera X-Visor-Key). Solo lectura.
 */
(function (root) {
  'use strict';
  function llave() { try { return localStorage.getItem('visorLlave') || ''; } catch (e) { return ''; } }
  /** [] | ['ayer'] | ['12.10.26'] → '' | 'ayer' | '12.10.26' (o null si sobra o falta algo raro) */
  function argumento(parts) {
    var p = (parts || []).filter(Boolean);
    if (!p.length) return '';
    if (p.length > 1) return null;
    return /^(hoy|ayer|\d{1,2}[.\/-]\d{1,2}[.\/-](\d{2}|\d{4}))$/i.test(p[0]) ? p[0] : null;
  }
  function run(parts, say) {
    var a = argumento(parts);
    if (a === null) { say('⚠ /diario [hoy|ayer|DD.MM.AA] — p. ej. /diario 12.10.26'); return; }
    var k = llave();
    if (!k) { say('🔑 Este navegador no tiene la llave del visor: ábrelo una vez con el enlace privado (#k=…) y repite.'); return; }
    fetch('/api/diario?fecha=' + encodeURIComponent(a || 'hoy'), { cache: 'no-store', headers: { 'X-Visor-Key': k } })
      .then(function (r) { return r.json().then(function (d) { return { st: r.status, d: d }; }); })
      .then(function (x) {
        if (!x.d || !x.d.ok) { say('⚠ /diario: ' + ((x.d && x.d.error) || ('HTTP ' + x.st))); return; }
        var p = x.d.partes || [], f = x.d.fecha.split('-');
        if (!p.length) { say('📓 Diario ' + f[2] + '.' + f[1] + '.' + f[0].slice(2) + ': sin partes guardados todavía.'); return; }
        say('📓 Diario ' + f[2] + '.' + f[1] + '.' + f[0].slice(2) + ' · ' + p.length + ' partes');
        p.forEach(function (q) { say(q.hora + ' · ' + q.agente + ' — ' + q.texto); });
      })
      .catch(function () { say('⚠ /diario: no se pudo leer el diario'); });
  }
  function li(log, t, cls) {
    if (!log || !root.document) return;
    String(t).split('\n').forEach(function (l) { var e = document.createElement('li'); e.className = cls || ''; e.textContent = l; log.appendChild(e); });
    log.scrollTop = log.scrollHeight;
  }
  function registrar() {
    var E = root.AdmiraExperto;
    if (!E || typeof E.verb !== 'function') return false;
    if (E.has && E.has('diario')) return true;
    E.verb({ name: 'diario', alias: [], args: '[hoy|ayer|DD.MM.AA]',
      desc: ['partes horarios de los 6 agentes de un día, en orden cronológico (sin atributo = hoy; /diario ayer; /diario 12.10.26)',
             'hourly reports of the 6 agents for a day, in chronological order (no argument = today; /diario ayer; /diario 12.10.26)'],
      run: function (parts, log) { run(parts, function (t) { li(log, t, /^⚠/.test(t) ? 'err' : ''); }); } });
    return true;
  }
  if (root.document) { var n = 0; (function esperar() { if (!registrar() && n++ < 120) setTimeout(esperar, 250); })(); }
  var api = { argumento: argumento, run: run, registrar: registrar };
  root.AdmiraDiario = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
