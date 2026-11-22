/* r249 (Carlos, 22-11 18:11): los 3 testigos LED del velocímetro de Agentes (en vivo · sin dato · zona roja, los
 * «puntos de las marchas») se sustituyen por 4 puntos, bajados entre el reloj y el odómetro «Ayer · media tokens/hora».
 * Cada punto es un DeepAgent y su Desktop App en su Mac de pilar:
 *   1 Neo = Claude en MacStudio · 2 Morfeo = Claude en MacMini · 3 Trinity = Codex en MacStudio · 4 Oráculo = Codex en MacMini.
 * Verde = esa Desktop App está abierta en ese Mac (el mismo dato «conectado» de r246, /api/flota/trabajando →
 * superficies tipo app, fuente pulso o latido vivo), pero SOLO esa app en ese Mac: ni la CLI ni el MBP16 cuentan.
 * Negro = no está abierta (o no hay dato fresco). Ratón encima (o toque en el móvil) = quién es. */
(function (root) {
  'use strict';
  var PUNTOS = [
    { agente: 'Neo', app: 'Claude', maquina: 'MacStudio' },
    { agente: 'Morfeo', app: 'Claude', maquina: 'MacMini' },
    { agente: 'Trinity', app: 'Codex', maquina: 'MacStudio' },
    { agente: 'Oráculo', app: 'Codex', maquina: 'MacMini' }
  ];
  function en() { try { return (root.document && document.documentElement.lang || '').indexOf('en') === 0; } catch (e) { return false; } }
  function T(es, ing) { return en() ? ing : es; }
  function llano(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function maqCanon(m) { var k = llano(m); return k.indexOf('studio') >= 0 ? 'MacStudio' : k.indexOf('mini') >= 0 ? 'MacMini' : k.indexOf('mbp') >= 0 || k.indexOf('macbook') >= 0 ? 'MBP16' : (m || ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /** d = respuesta de /api/flota/trabajando → [{ agente, app, maquina, verde, fuente, otros, titulo }] (siempre 4, en orden). */
  function puntos(d) {
    var ts = (d && d.ok !== false && Array.isArray(d.tarjetas)) ? d.tarjetas : [];
    return PUNTOS.map(function (p) {
      var sup = null, otros = [];
      ts.forEach(function (t) {
        (t && Array.isArray(t.superficies) ? t.superficies : []).forEach(function (s) {
          if (!s || s.tipo !== 'app' || llano(s.app) !== llano(p.app) || maqCanon(s.maquina) !== p.maquina) return;
          if (llano(t.agente) === llano(p.agente)) { if (!sup || s.fuente === 'pulso') sup = s; }
          else otros.push(t.agente); // la presencia atribuye esa app a otro DeepAgent: se avisa, no se pinta
        });
      });
      var verde = !!sup;
      var est = verde ? T('conectado', 'connected') : T('no conectado', 'not connected');
      var por = verde ? (sup.fuente === 'pulso' ? T(' (pulso del Mac)', ' (Mac pulse)') : T(' (latido de presencia; sin pulso fresco del Mac)', ' (presence heartbeat; no fresh Mac pulse)')) : '';
      var aviso = otros.length ? T(' · ⚠ la presencia la atribuye a ', ' · ⚠ presence credits it to ') + otros.join(', ') : '';
      return { agente: p.agente, app: p.app, maquina: p.maquina, verde: verde, fuente: verde ? sup.fuente : null, otros: otros,
        titulo: p.agente + ' · ' + p.app + ' · ' + p.maquina + ' · ' + est + por + aviso };
    });
  }
  function html(ps) {
    return ps.map(function (p, i) {
      return '<button type="button" class="vel-da-p' + (p.verde ? ' on' : '') + '" data-i="' + i + '" title="' + esc(p.titulo) + '" aria-label="' + esc(p.titulo) + '"></button>';
    }).join('') + '<span class="vel-da-txt" role="status" aria-live="polite"></span>';
  }
  var ultimo = null;
  function caja() { return root.document && document.getElementById('vel-da'); }
  function pinta(d) {
    var el = caja(); if (!el) return;
    var ps = puntos(d); ultimo = ps;
    var abierto = el.getAttribute('data-abierto');
    el.innerHTML = html(ps);
    el.setAttribute('aria-label', T('DeepAgents con su Desktop App abierta', 'DeepAgents with their desktop app open') + ': ' + ps.filter(function (p) { return p.verde; }).length + '/4');
    if (abierto != null && ps[+abierto]) muestra(el, +abierto);
  }
  function muestra(el, i) {
    var t = el.querySelector('.vel-da-txt'); if (!t || !ultimo || !ultimo[i]) return;
    t.textContent = ultimo[i].titulo; el.setAttribute('data-abierto', String(i)); el.classList.add('ver');
    var b = el.querySelectorAll('.vel-da-p')[i]; if (b) t.style.setProperty('--x', (b.offsetLeft + b.offsetWidth / 2) + 'px');
  }
  function oculta(el) { el.removeAttribute('data-abierto'); el.classList.remove('ver'); }
  function arranca() {
    var el = caja(); if (!el) return;
    pinta(root.ConsumosTrabajando && root.ConsumosTrabajando.ultimo ? root.ConsumosTrabajando.ultimo() : null);
    root.addEventListener('flota:trabajando', function (e) { pinta(e && e.detail); });
    // Escritorio: ratón encima; móvil: toque (abre / cierra). Toque fuera = se cierra.
    el.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('mouseleave', function () { if (!el.classList.contains('fijo')) oculta(el); });
    el.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('focusout', function () { if (!el.classList.contains('fijo')) oculta(el); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vel-da-p'); if (!b) return;
      var i = b.getAttribute('data-i');
      if (e.pointerType !== 'mouse' && el.getAttribute('data-abierto') === i && el.classList.contains('fijo')) { el.classList.remove('fijo'); oculta(el); return; }
      el.classList.add('fijo'); muestra(el, +i);
    });
    document.addEventListener('click', function (e) { if (e.target && e.target.isConnected !== false && !el.contains(e.target)) { el.classList.remove('fijo'); oculta(el); } });
  }
  root.MarchasDeepAgents = { PUNTOS: PUNTOS, puntos: puntos, html: html, maqCanon: maqCanon, pinta: pinta };
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca(); }
})(typeof window !== 'undefined' ? window : globalThis);
