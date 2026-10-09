/* Velocímetro de tokens/hora en /consumos (GrokBotBox, 09-10-2026).
 * Lee /api/consumos/velocidad cada 60 s (datos REALES: partes de consumo de la flota en Yokup).
 * Dial semicircular tipo test de velocidad: aguja, cifra grande «12,4 M tok/h», escala 0 → max(50 M, 1,5 × pico 24 h).
 * Si la fuente no responde: dial en gris y «sin datos» — nunca números inventados. */
(function (root) {
  'use strict';
  var API = '/api/consumos/velocidad';
  var R = 120, CX = 150, CY = 150;
  function en() { return (document.documentElement.lang || 'es').slice(0, 2) === 'en'; }
  function T(es, ing) { return en() ? ing : es; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    var loc = en() ? 'en-US' : 'es-ES';
    function f(x, d) { return x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e9) return f(n / 1e9, 2) + ' G';
    if (n >= 1e6) return f(n / 1e6, 1) + ' M';
    if (n >= 1e3) return f(n / 1e3, 0) + ' k';
    return f(n, 0);
  }
  function pt(frac, r) { var a = Math.PI * (1 - frac); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; }
  function arco(f0, f1, r) {
    var a = pt(f0, r), b = pt(f1, r);
    return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
  }
  function svg(max) {
    var ticks = '', i;
    for (i = 0; i <= 20; i++) {
      var f = i / 20, a = pt(f, R + 8), b = pt(f, R + (i % 5 ? 14 : 20));
      ticks += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" class="vel-tick' + (i % 5 ? '' : ' mayor') + '"/>';
      if (i % 5 === 0) { var l = pt(f, R - 22); ticks += '<text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" class="vel-num">' + fmt(max * f).replace(/\s/g, '') + '</text>'; }
    }
    return '<svg viewBox="0 0 300 175" class="vel-svg" role="img" aria-label="' + T('Velocímetro de tokens por hora', 'Tokens per hour speedometer') + '">' +
      '<defs><linearGradient id="vel-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#88ffaa"/><stop offset=".55" stop-color="#78f3ff"/><stop offset=".8" stop-color="#ffd866"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs>' +
      '<path d="' + arco(0, 1, R) + '" class="vel-pista"/>' +
      '<path d="' + arco(0, 1, R) + '" class="vel-valor" pathLength="1" id="vel-valor"/>' +
      ticks +
      '<g class="vel-aguja" id="vel-aguja"><polygon points="' + CX + ',' + (CY - R + 18) + ' ' + (CX - 5) + ',' + CY + ' ' + (CX + 5) + ',' + CY + '"/></g>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="10" class="vel-eje"/>' +
      '</svg>';
  }
  var estado = { max: 0, valor: 0 };
  function contar(el, desde, hasta) {
    var t0 = performance.now(), dur = 1200;
    function paso(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(desde + (hasta - desde) * e);
      if (k < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }
  function pinta(d) {
    var box = document.getElementById('velocimetro');
    if (!box) return;
    var sin = !d || d.ok === false || d.tokHora == null;
    box.classList.toggle('sin-datos', sin);
    var max = sin ? (estado.max || 50e6) : (d.escalaMax || 50e6);
    if (max !== estado.max || !box.querySelector('.vel-svg')) { box.querySelector('.vel-dial').innerHTML = svg(max); estado.max = max; }
    var v = sin ? 0 : d.tokHora;
    var frac = Math.max(0, Math.min(1, v / max));
    var ag = document.getElementById('vel-aguja');
    var val = document.getElementById('vel-valor');
    requestAnimationFrame(function () {
      ag.style.transform = 'rotate(' + (-90 + 180 * frac).toFixed(2) + 'deg)';
      val.style.strokeDashoffset = String(1 - frac);
    });
    var cifra = document.getElementById('vel-cifra');
    if (sin) cifra.textContent = T('sin datos', 'no data');
    else contar(cifra, estado.valor, v);
    estado.valor = v;
    document.getElementById('vel-unidad').textContent = sin ? '' : 'tok/h';
    var met = document.getElementById('vel-metodo');
    if (sin) met.textContent = T('La fuente de partes (Yokup) no responde. No se enseña ninguna cifra.', 'The usage-report source (Yokup) is not answering. No number is shown.');
    else if (d.metodo === 'ultima-hora') met.innerHTML = '<b>' + T('Última hora', 'Last hour') + '</b> · ' + T('medido en ', 'measured over ') + esc(d.ventanaMin) + ' min';
    else met.innerHTML = '<b>' + T('Media de hoy', 'Today\'s average') + '</b> · ' + T('estimado: total de hoy / horas desde las 00:00 (Madrid)', 'estimated: today\'s total / hours since 00:00 (Madrid)');
    var extra = document.getElementById('vel-extra');
    extra.innerHTML = sin ? '' :
      T('Hoy', 'Today') + ': <b>' + fmt(d.tokHoy) + '</b> tok · ' + T('Pico 24 h', '24 h peak') + ': <b>' + (d.pico24h == null ? '—' : fmt(d.pico24h) + ' tok/h') + '</b> · ' + T('Escala', 'Scale') + ' 0 → ' + fmt(max);
    var lista = document.getElementById('vel-agentes');
    var top = sin ? [] : (d.porAgente || []).slice(0, 6);
    lista.innerHTML = top.map(function (a) {
      var w = d.tokHora > 0 ? Math.round(100 * a.tokHora / d.tokHora) : 0;
      return '<li><span class="vel-ag">' + esc(a.agente) + '</span><span class="vel-bar"><i style="width:' + w + '%"></i></span><b>' + fmt(a.tokHora) + ' tok/h</b><small>' + T('hoy ', 'today ') + fmt(a.tokHoy) + '</small></li>';
    }).join('');
    var pie = document.getElementById('vel-pie');
    pie.innerHTML = (d && d.generado ? T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) + ' (Madrid) · ' : '') +
      T('Fuente: partes de consumo de la flota en Yokup (', 'Source: fleet usage reports in Yokup (') + '<a href="https://api.yokup.com/fleet/consumo?dias=1">fleet/consumo</a>) · ' + T('se refresca cada 60 s', 'refreshes every 60 s');
  }
  function leer() {
    return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) { pinta(d); return d; });
  }
  root.ConsumosVelocimetro = { leer: leer, fmt: fmt };
  function arranca() {
    if (!document.getElementById('velocimetro')) return;
    leer();
    setInterval(leer, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
