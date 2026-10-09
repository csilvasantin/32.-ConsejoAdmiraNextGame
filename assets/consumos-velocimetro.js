/* Velocímetro de tokens/hora en /consumos (GrokBotBox, 09-10-2026).
 * Lee /api/consumos/velocidad cada 10 s (datos REALES: pulso en tiempo real de cada Mac — logs locales de Claude Code
 * y Codex, POST /api/consumos/pulso cada 60 s — y, para los agentes sin pulso, partes de consumo de Yokup).
 * r18: aguja animada con requestAnimationFrame (sin saltos), «tiempo real · hace N s» que corre cada segundo y
 * minigráfica de los últimos 60 min (tokens por minuto).
 * Dial semicircular tipo test de velocidad: aguja, cifra grande «12,4 M tok/h», escala 0 → max(50 M, 1,5 × pico 24 h).
 * Si no hay pulso ni partes: dial en gris y «sin datos» — nunca números inventados. */
(function (root) {
  'use strict';
  var API = '/api/consumos/velocidad';
  var R = 120, CX = 150, CY = 150, POLL = 10000;
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
  var estado = { max: 0, valor: 0, frac: 0, anim: 0, datos: null, recibido: 0 };
  /* Aguja + arco + cifra interpolados juntos (ease-out cúbico, 1,6 s): si llega un dato a mitad de animación, sigue desde donde está. */
  function animar(fracDestino, valorDestino, sin) {
    var ag = document.getElementById('vel-aguja'), val = document.getElementById('vel-valor'), cifra = document.getElementById('vel-cifra');
    var f0 = estado.frac, v0 = estado.valor, t0 = performance.now(), dur = 1600, id = ++estado.anim;
    function paso(t) {
      if (id !== estado.anim) return;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      estado.frac = f0 + (fracDestino - f0) * e;
      estado.valor = v0 + (valorDestino - v0) * e;
      if (ag) ag.style.transform = 'rotate(' + (-90 + 180 * estado.frac).toFixed(2) + 'deg)';
      if (val) val.style.strokeDashoffset = String(1 - estado.frac);
      if (cifra && !sin) cifra.textContent = fmt(estado.valor);
      if (k < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }
  function hace(s) {
    if (s == null || !isFinite(s)) return '';
    if (s < 90) return T('hace ', '') + Math.round(s) + ' s' + T('', ' ago');
    return T('hace ', '') + Math.round(s / 60) + ' min' + T('', ' ago');
  }
  function textoMetodo() {
    var d = estado.datos;
    if (!d || d.metodo !== 'tiempo real') return null;
    var s = (d.haceS || 0) + (Date.now() - estado.recibido) / 1000;
    return '<b class="vel-rt"><i class="vel-punto"></i>' + T('tiempo real', 'real time') + '</b> · ' + hace(s) + ' · ' + T('últimos 15 min × 4', 'last 15 min × 4') +
      (d.etiqueta && d.etiqueta !== 'tiempo real' ? ' · <span>' + esc(T('+ partes de Yokup para el resto', '+ Yokup reports for the rest')) + '</span>' : '');
  }
  /* Minigráfica: tokens por minuto de los últimos 60 min (solo pulso en tiempo real). */
  function sparkline(serie) {
    if (!serie || serie.length < 2) return '';
    var W = 300, Hh = 46, max = 0, i;
    for (i = 0; i < serie.length; i++) max = Math.max(max, serie[i].tok || 0);
    var pts = serie.map(function (p, j) { return [(j / (serie.length - 1)) * W, Hh - 4 - (max > 0 ? (p.tok / max) * (Hh - 10) : 0)]; });
    var linea = pts.map(function (p, j) { return (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = linea + ' L' + W + ' ' + Hh + ' L0 ' + Hh + ' Z';
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="vel-spark" preserveAspectRatio="none" role="img" aria-label="' + T('Tokens por minuto, últimos 60 min', 'Tokens per minute, last 60 min') + '">' +
      '<path d="' + area + '" class="vel-spark-area"/><path d="' + linea + '" class="vel-spark-linea"/></svg>' +
      '<p class="vel-spark-pie"><span>−60 min</span><span>' + T('pico ', 'peak ') + fmt(max) + ' tok/min</span><span>' + T('ahora', 'now') + '</span></p>';
  }
  function pinta(d) {
    var box = document.getElementById('velocimetro');
    if (!box) return;
    var sin = !d || d.ok === false || d.tokHora == null;
    estado.datos = sin ? null : d;
    estado.recibido = Date.now();
    box.classList.toggle('sin-datos', sin);
    box.classList.toggle('rt', !sin && d.metodo === 'tiempo real');
    var max = sin ? (estado.max || 50e6) : (d.escalaMax || 50e6);
    if (max !== estado.max || !box.querySelector('.vel-svg')) { box.querySelector('.vel-dial').innerHTML = svg(max); estado.max = max; estado.frac = 0; }
    var v = sin ? 0 : d.tokHora;
    var frac = Math.max(0, Math.min(1, v / max));
    var cifra = document.getElementById('vel-cifra');
    if (sin) cifra.textContent = T('sin datos', 'no data');
    animar(frac, v, sin);
    document.getElementById('vel-unidad').textContent = sin ? '' : 'tok/h';
    var met = document.getElementById('vel-metodo');
    if (sin) met.textContent = T('Sin pulso en tiempo real y sin partes de Yokup. No se enseña ninguna cifra.', 'No real-time pulse and no Yokup reports. No number is shown.');
    else if (d.metodo === 'tiempo real') met.innerHTML = textoMetodo();
    else if (d.metodo === 'ultima-hora') met.innerHTML = '<b>' + T('Última hora', 'Last hour') + '</b> · ' + T('medido en ', 'measured over ') + esc(d.ventanaMin) + ' min';
    else met.innerHTML = '<b>' + T('Media de hoy', 'Today\'s average') + '</b> · ' + T('estimado: total de hoy / horas desde las 00:00 (Madrid)', 'estimated: today\'s total / hours since 00:00 (Madrid)');
    var extra = document.getElementById('vel-extra');
    extra.innerHTML = sin ? '' :
      T('Hoy', 'Today') + ': <b>' + fmt(d.tokHoy) + '</b> tok' +
      (d.tokUltimos5min != null ? ' · ' + T('últimos 5 min', 'last 5 min') + ': <b>' + fmt(d.tokUltimos5min) + '</b> · ' + T('última hora', 'last hour') + ': <b>' + fmt(d.tokUltimaHora) + '</b>' : '') +
      ' · ' + T('Pico 24 h', '24 h peak') + ': <b>' + (d.pico24h == null ? '—' : fmt(d.pico24h) + ' tok/h') + '</b> · ' + T('Escala', 'Scale') + ' 0 → ' + fmt(max);
    var sp = document.getElementById('vel-spark');
    if (sp) sp.innerHTML = sin ? '' : sparkline(d.serie60);
    var lista = document.getElementById('vel-agentes');
    var top = sin ? [] : (d.porAgente || []).slice(0, 8);
    lista.innerHTML = top.map(function (a) {
      var parado = a.tokHora == null;
      var w = d.tokHora > 0 && !parado ? Math.round(100 * a.tokHora / d.tokHora) : 0;
      var origen = a.metodo === 'tiempo real' ? (a.stale ? T('sin pulso ', 'no pulse ') + hace(a.haceS) : T('tiempo real', 'real time') + (a.maquina ? ' · ' + esc(a.maquina) : '')) : esc(a.metodo || T('partes Yokup', 'Yokup reports'));
      return '<li' + (parado ? ' class="parado"' : '') + '><span class="vel-ag">' + esc(a.agente) + (a.motor ? ' · ' + esc(a.motor) : '') + '</span><span class="vel-bar"><i style="width:' + w + '%"></i></span><b>' + (parado ? T('parado', 'stopped') : fmt(a.tokHora) + ' tok/h') + '</b><small>' + T('hoy ', 'today ') + fmt(a.tokHoy) + (a.tokUltimos5min != null ? ' · 5 min ' + fmt(a.tokUltimos5min) : '') + ' · ' + origen + '</small></li>';
    }).join('');
    var pie = document.getElementById('vel-pie');
    pie.innerHTML = (d && d.generado ? T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (Madrid) · ' : '') +
      T('Fuente: pulso de cada Mac (logs de Claude Code y Codex, cada 60 s, ', 'Source: each Mac\'s pulse (Claude Code and Codex logs, every 60 s, ') + '<a href="/api/consumos/pulso">/api/consumos/pulso</a>) + ' +
      T('partes de Yokup para el resto (', 'Yokup reports for the rest (') + '<a href="https://api.yokup.com/fleet/consumo?dias=1">fleet/consumo</a>) · ' + T('se refresca cada 10 s', 'refreshes every 10 s');
  }
  function leer() {
    return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) { pinta(d); return d; });
  }
  root.ConsumosVelocimetro = { leer: leer, fmt: fmt };
  function arranca() {
    if (!document.getElementById('velocimetro')) return;
    leer();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
    setInterval(function () { var t = textoMetodo(), m = document.getElementById('vel-metodo'); if (t && m) m.innerHTML = t; }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
