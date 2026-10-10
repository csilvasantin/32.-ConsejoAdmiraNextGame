/* «Matriz de agentes» — al final de /consumos (JensenGrokBot, 10-10-2026 · r4).
 * Viva: sale de /api/flota/trabajando (campo «matriz»), los mismos datos que agentes_vivos (presencia de Yokup con latido
 * < 15 min + bandeja por persona). Escucha «flota:trabajando» de consumos-trabajando.js (sin segunda petición).
 * Un agente nuevo aparece solo («sin clasificar» de equipo hasta mapearlo). Sin señal: en gris. ES/EN. */
(function (root) {
  'use strict';
  var ult = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function en() { return (document.documentElement.getAttribute('lang') || '').toLowerCase().indexOf('en') === 0; }
  function T(es, en_) { return en() ? en_ : es; }
  var COSTE = { pago: ['Pago', 'Paid'], gratis: ['Gratis', 'Free'], mixto: ['Pago + plan C gratis', 'Paid + free plan C'] };
  function fila(f) {
    var eq = f.equipo ? (en() ? f.equipo.en : f.equipo.es) : '<i class="mz-sc">' + T('sin clasificar', 'unclassified') + '</i>';
    var ab = f.abierto == null ? '—' : f.abierto ? T('Abierto', 'Open') : T('Cerrado', 'Closed');
    var co = f.coste ? T(COSTE[f.coste][0], COSTE[f.coste][1]) : T('sin datos', 'no data');
    var donde = f.donde && f.donde.length ? '<small class="mz-donde">' + esc(f.donde.join(' · ')) + '</small>' : '';
    var c = f.carga, carga = c && c.in_progress ? ' <small class="mz-enc">' + c.in_progress + ' ' + T('en curso', 'in progress') + '</small>' : '';
    var est = f.vivo ? T('con señal (latido < 15 min)', 'live (heartbeat < 15 min)') : T('sin señal', 'no signal');
    return '<tr class="' + (f.vivo ? 'mz-vivo' : 'mz-off') + '" title="' + esc(est) + '">' +
      '<td><i class="mz-p" aria-hidden="true"></i>' + esc(en() ? f.agenteEn : f.agente) + carga + '</td>' +
      '<td>' + esc(f.depende || '—') + '</td><td>' + (f.equipo ? esc(eq) : eq) + '</td>' +
      '<td>' + esc(f.modelo) + donde + '</td><td>' + esc(ab) + '</td>' +
      '<td><span class="mz-co mz-' + esc(f.coste || 'nd') + '">' + esc(co) + '</span></td></tr>';
  }
  function pinta(d) {
    var tb = document.getElementById('matriz-filas'), res = document.getElementById('matriz-resumen');
    if (!tb) return;
    var m = d && d.ok && d.matriz;
    if (!m) { tb.innerHTML = '<tr><td colspan="6" class="mz-vacio">' + T('Sin datos del censo ahora: no se enseña nadie.', 'No census data right now: nobody is shown.') + '</td></tr>'; return; }
    tb.innerHTML = m.filas.map(fila).join('');
    var r = m.resumen;
    if (res) res.innerHTML = '<b>' + r.dePago + '</b> ' + T('de', 'of') + ' <b>' + r.clasificados + '</b> ' + T('de pago', 'paid') + ' · <b>' + r.gratis + '</b> ' + T('gratis', 'free') +
      (r.mixto ? ' · ' + r.mixto + ' ' + T('con plan C gratis', 'with free plan C') : '') + ' · ' + r.vivos + ' ' + T('con señal', 'live') + (r.sinDatos ? ' · ' + r.sinDatos + ' ' + T('sin clasificar', 'unclassified') : '');
  }
  function recibe(d) { ult = d; pinta(d); }
  root.addEventListener('flota:trabajando', function (e) { recibe(e.detail); });
  root.addEventListener('admira:languagechange', function () { if (ult) pinta(ult); });
  function arranca() { var u = root.ConsumosTrabajando && root.ConsumosTrabajando.ultimo && root.ConsumosTrabajando.ultimo(); if (u) recibe(u); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(window);
