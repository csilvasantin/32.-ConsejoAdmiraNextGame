/* Zonas plegables de /consumos (GrokBotBox, 09-10-2026 · r31). Carlos: la página compacta por defecto y se abre al clic.
 * Marcado: <section data-plegable="clave"> … <button class="plg-boton" aria-expanded aria-controls="ID"> … <div class="plg-cuerpo" id="ID">
 * <div class="plg-dentro">…</div></div>. Botón nativo (Enter/Espacio), aria-expanded, cuerpo «inert» cerrado,
 * animación suave (grid-template-rows 0fr → 1fr; sin animación con prefers-reduced-motion), estado de cada zona en
 * localStorage («consumos.plegable.<clave>»), y ?abierto=todo (o ?abierto=trabajando,velocidad,lecturas) lo abre. */
(function (root) {
  'use strict';
  var PRE = 'consumos.plegable.';
  var lsGet = function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} };
  function porUrl(clave) {
    var q = null;
    try { q = new URLSearchParams(root.location.search).get('abierto'); } catch (e) {}
    if (!q) return false;
    var l = q.toLowerCase().split(/[,\s]+/);
    return l.indexOf('todo') >= 0 || l.indexOf('todos') >= 0 || l.indexOf('all') >= 0 || l.indexOf(clave) >= 0;
  }
  var zonas = {};
  function monta(sec) {
    var clave = sec.getAttribute('data-plegable');
    var btn = sec.querySelector('.plg-boton');
    var cuerpo = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!btn || !cuerpo) return;
    var abierto = false;
    function pon(a, anim) {
      abierto = !!a;
      if (!anim) sec.classList.add('plg-quieto');
      btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      sec.classList.toggle('plg-abierto', abierto);
      if (!abierto) sec.classList.remove('plg-listo');
      if ('inert' in cuerpo) cuerpo.inert = !abierto; else cuerpo.setAttribute('aria-hidden', abierto ? 'false' : 'true');
      if (!anim) { sec.classList.toggle('plg-listo', abierto); root.requestAnimationFrame(function () { root.requestAnimationFrame(function () { sec.classList.remove('plg-quieto'); }); }); }
    }
    cuerpo.addEventListener('transitionend', function (ev) { if (ev.target === cuerpo && abierto) sec.classList.add('plg-listo'); });
    btn.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('a')) return; // un enlace dentro del rótulo navega, no pliega
      pon(!abierto, true);
      lsSet(PRE + clave, abierto ? '1' : '0');
    });
    pon(porUrl(clave) || lsGet(PRE + clave) === '1', false);
    zonas[clave] = { abre: function () { pon(true, true); }, cierra: function () { pon(false, true); }, abierto: function () { return abierto; } };
  }
  function arranca() { var s = document.querySelectorAll('[data-plegable]'); for (var i = 0; i < s.length; i++) monta(s[i]); }
  root.ConsumosPlegable = { zonas: zonas, porUrl: porUrl };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
