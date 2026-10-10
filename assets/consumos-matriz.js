/* «Matriz de agentes» — al final de /consumos (JensenGrokBot, 10-10-2026 · r4).
 * Viva: sale de /api/flota/trabajando (campo «matriz»), los mismos datos que agentes_vivos (presencia de Yokup con latido
 * < 15 min + bandeja por persona). Escucha «flota:trabajando» de consumos-trabajando.js (sin segunda petición).
 * Un agente nuevo aparece solo («sin clasificar» de equipo hasta mapearlo). Sin señal: en gris. ES/EN. */
(function (root) {
  'use strict';
  var ult = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function en() {
    // r5: /consumos no carga admira-idioma.js al entrar: se mira también ?lang= y la preferencia guardada de la suite.
    var h = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (root.AdmiraIdioma) return h.indexOf('en') === 0;
    try { var q = new URL(location.href).searchParams.get('lang'); if (q) return /^en/i.test(q); } catch (e) {}
    try { var s = localStorage.getItem('admiranext_expert_lang') || localStorage.getItem('xtanco_lang'); if (s) return /^en/i.test(s); } catch (e) {}
    return h.indexOf('en') === 0;
  }
  function T(es, en_) { return en() ? en_ : es; }
  var COSTE = { pago: ['Pago', 'Paid'], gratis: ['Gratis', 'Free'], mixto: ['Pago + plan C gratis', 'Paid + free plan C'], incluido: ['Incluido', 'Included'] };
  var PROV = { grok: 'Grok', codex: 'Codex', claude: 'Claude' };
  function coste(f) {
    if (!f.coste) return T('sin datos', 'no data');
    if (f.porDefecto) return T('Gratis · Nemotron Ultra (por defecto)', 'Free · Nemotron Ultra (default)');
    if (f.coste === 'incluido') return T('Incluido en la suscripción ', 'Included in ') + (f.incluidoEn ? (en() ? f.incluidoEn + "'s " : '') + (PROV[f.sub] || f.sub) + (en() ? ' subscription' : ' de ' + f.incluidoEn) : '');
    var b = T(COSTE[f.coste][0], COSTE[f.coste][1]);
    return f.titular ? b + ' · ' + (PROV[f.sub] || f.sub) : b;
  }
  function fila(f) {
    var eq = f.equipo ? (en() ? f.equipo.en : f.equipo.es) : '<i class="mz-sc">' + T('sin clasificar', 'unclassified') + '</i>';
    var ab = f.abierto == null ? '—' : f.abierto ? T('Abierto', 'Open') : T('Cerrado', 'Closed');
    var co = coste(f);
    var inf = f.fuera ? '<small class="mz-inf">⚠ ' + T('modelo de pago fuera de las 6 suscripciones: ', 'paid model outside the 6 subscriptions: ') + esc(f.infracciones.join(' · ')) + '</small>' : '';
    var inc = f.incluye && f.incluye.length ? '<small class="mz-donde">' + T('incluye el consumo de ', 'includes the usage of ') + esc(f.incluye.join(', ')) + T(' (un solo pool de Grok Bot)', ' (one Grok Bot pool)') + '</small>' : '';
    var donde = f.donde && f.donde.length ? '<small class="mz-donde">' + esc(f.donde.join(' · ').replace(/, gratis\)/g, en() ? ', free)' : ', gratis)')) + '</small>' : '';
    var c = f.carga, carga = c && c.in_progress ? ' <small class="mz-enc">' + c.in_progress + ' ' + T('en curso', 'in progress') + '</small>' : '';
    var est = f.vivo ? T('con señal (latido < 15 min)', 'live (heartbeat < 15 min)') : T('sin señal', 'no signal');
    return '<tr class="' + (f.vivo ? 'mz-vivo' : 'mz-off') + (f.fuera ? ' mz-fuera' : '') + '" title="' + esc(est) + '">' +
      '<td><i class="mz-p" aria-hidden="true"></i>' + esc(en() ? f.agenteEn : f.agente) + carga + '</td>' +
      '<td>' + esc(f.depende || '—') + '</td><td>' + (f.equipo ? esc(eq) : eq) + '</td>' +
      '<td>' + esc(f.modelo) + donde + inc + inf + '</td><td>' + esc(ab) + '</td>' +
      '<td><span class="mz-co mz-' + esc(f.fuera ? 'fuera' : (f.coste || 'nd')) + '">' + esc(co) + '</span></td></tr>';
  }
  function pinta(d) {
    var tb = document.getElementById('matriz-filas'), res = document.getElementById('matriz-resumen');
    if (!tb) return;
    var m = d && d.ok && d.matriz;
    if (!m) { tb.innerHTML = '<tr><td colspan="6" class="mz-vacio">' + T('Sin datos del censo ahora: no se enseña nadie.', 'No census data right now: nobody is shown.') + '</td></tr>'; return; }
    tb.innerHTML = m.filas.map(fila).join('');
    var r = m.resumen;
    var sb = r.subs || {};
    if (res) res.innerHTML = '<b>' + r.suscripciones + '</b> ' + T('suscripciones de pago', 'paid subscriptions') + ' (' + (sb.grok || 0) + ' Grok · ' + (sb.codex || 0) + ' Codex · ' + (sb.claude || 0) + ' Claude) · <b>' + r.gratis + '</b> ' + T('gratis', 'free') +
      (r.consejerosGratis ? ' (' + r.consejerosGratis + ' ' + T('consejeros en Nemotron Ultra por defecto', 'councillors on Nemotron Ultra by default') + ')' : '') +
      ' · ' + r.incluidos + ' ' + T('incluidos en una suscripción Grok', 'included in a Grok subscription') + (r.conPlanC ? ' · ' + r.conPlanC + ' ' + T('con plan C gratis', 'with free plan C') : '') +
      ' · ' + r.vivos + ' ' + T('con señal', 'live') + (r.sinDatos ? ' · ' + r.sinDatos + ' ' + T('sin clasificar', 'unclassified') : '') +
      (r.fuera ? ' · <b class="mz-rojo">⚠ ' + r.fuera + ' ' + T('fuera de las 6 (regla rota)', 'outside the 6 (rule broken)') + '</b>' : ' · <span class="mz-ok">' + T('ninguna instancia de pago fuera de las 6', 'no paid instance outside the 6') + '</span>');
  }
  /** Rótulos fijos de la sección (data-en) en el idioma activo, guardando el castellano en data-es. */
  function rotulos() {
    var sec = document.getElementById('matriz'); if (!sec) return;
    var l = en(), els = sec.querySelectorAll('[data-en]');
    for (var i = 0; i < els.length; i++) { var e = els[i]; if (!e.hasAttribute('data-es')) e.setAttribute('data-es', e.textContent); e.textContent = l ? e.getAttribute('data-en') : e.getAttribute('data-es'); }
    var t = document.querySelector('#trabajando .plg-tit[data-en]');
    if (t) { if (!t.hasAttribute('data-es')) t.setAttribute('data-es', t.textContent); t.textContent = l ? t.getAttribute('data-en') : t.getAttribute('data-es'); }
  }
  function recibe(d) { ult = d; pinta(d); }
  root.addEventListener('flota:trabajando', function (e) { recibe(e.detail); });
  root.addEventListener('admira:languagechange', function () { rotulos(); if (ult) pinta(ult); });
  function arranca() { rotulos(); var u = root.ConsumosTrabajando && root.ConsumosTrabajando.ultimo && root.ConsumosTrabajando.ultimo(); if (u) recibe(u); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(window);
