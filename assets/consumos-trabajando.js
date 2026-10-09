/* «Trabajando ahora» — franja en lo alto de /consumos (GrokBotBox, 09-10-2026 · r28).
 * Lee /api/flota/trabajando cada 10 s: una tarjeta por consejero/agente con retrato, nombre, máquina · motor/modelo,
 * foco/tarea, proyecto y encargo. Color: VERDE trabajando · AMARILLO con Carlos · GRIS parado («parado · hace X min ·
 * último: …») o «sin latido». Orden: verde, amarillo, gris. Sin datos: lo dice, nunca inventa. */
(function (root) {
  'use strict';
  var API = '/api/flota/trabajando', POLL = 10000;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    function f(x, d) { return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e6) return f(n / 1e6, 1) + ' M'; if (n >= 1e3) return f(n / 1e3, 0) + ' k'; return f(n, 0);
  }
  function hace(s) {
    if (s == null) return '';
    if (s < 90) return 'hace ' + Math.round(s) + ' s';
    if (s < 5400) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 172800) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' d';
  }
  function retrato(t) {
    var r = t.retrato, ini = esc(String(t.agente || '?').slice(0, 2));
    if (r && (r.cara || r.crop)) {
      // Recorte de la cara en la ilustración del Consejo («cara» del servidor; «crop» antiguo = cuerpo → 42 % de arriba).
      var c = r.cara || r.crop, h = r.cara ? c.h : c.h * 0.42, w = c.w;
      var sx = (10000 / w).toFixed(1), sy = (10000 / h).toFixed(1), px = (c.l / (100 - w) * 100).toFixed(2), py = (c.t / (100 - h) * 100).toFixed(2);
      return '<span class="tr-foto" role="img" aria-label="' + esc(t.agente) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:' + sx + '% ' + sy + '%;background-position:' + px + '% ' + py + '%"></span>';
    }
    if (r && r.img) return '<span class="tr-foto" role="img" aria-label="' + esc(t.agente) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:cover;background-position:center 25%"></span>';
    return '<span class="tr-foto tr-ini" aria-hidden="true">' + ini + '</span>';
  }
  function tarjeta(t) {
    var motor = [t.motor, t.modelo && t.modelo !== t.motor ? t.modelo : ''].filter(Boolean).join(' · ');
    var que = t.tarea || t.foco || '';
    var linea;
    if (t.estado === 'gris') linea = t.motivo === 'sin latido' ? '<span class="tr-est">sin latido</span>' : '<span class="tr-est">parado · ' + esc(hace(t.haceS)) + '</span>' + (que ? ' · último: ' + esc(que) : '');
    else linea = '<span class="tr-est">' + (t.estado === 'amarillo' ? 'con Carlos' : 'trabajando') + (t.tokHora > 0 ? ' · ' + fmt(t.tokHora) + ' tok/h' : '') + '</span>' + (que ? ' · ' + esc(que) : '');
    var chips = (t.proyecto ? '<span class="tr-chip">' + esc(t.proyecto) + '</span>' : '') + (t.encargo ? '<span class="tr-chip tr-enc">' + esc(t.encargo) + '</span>' : '');
    return '<li class="tr-card tr-' + esc(t.estado) + '" title="' + esc(t.motivo + (t.foco ? ' — ' + t.foco : '')) + '">' + retrato(t) +
      '<span class="tr-txt"><b class="tr-nom"><i class="tr-punto" aria-hidden="true"></i>' + esc(t.agente) + '</b>' +
      '<small class="tr-maq">' + esc([t.maquina, motor].filter(Boolean).join(' · ') || '—') + '</small>' +
      '<small class="tr-que">' + linea + '</small>' + (chips ? '<span class="tr-chips">' + chips + '</span>' : '') + '</span></li>';
  }
  function pinta(d) {
    var ul = document.getElementById('trabajando-lista'), pie = document.getElementById('trabajando-pie'), res = document.getElementById('trabajando-resumen');
    if (!ul) return;
    var ts = d && d.ok ? d.tarjetas || [] : null;
    if (!ts) { ul.innerHTML = '<li class="tr-vacio">Sin datos de presencia ni de pulso ahora: no se enseña nadie.</li>'; return; }
    ul.innerHTML = ts.map(tarjeta).join('');
    // r31: fila compacta (zona plegada): fichas con nombre para verde/amarillo, caras apiladas para los parados.
    var ch = document.getElementById('trabajando-chips');
    if (ch) {
      var vivos = ts.filter(function (t) { return t.estado !== 'gris'; }), grises = ts.filter(function (t) { return t.estado === 'gris'; });
      ch.innerHTML = vivos.map(function (t) { return '<span class="tr-chipa tr-' + esc(t.estado) + '" title="' + esc(t.agente + ' · ' + (t.estado === 'amarillo' ? 'con Carlos' : 'trabajando')) + '">' + retrato(t) + '<i></i>' + esc(t.agente) + '</span>'; }).join('') +
        (grises.length ? '<span class="tr-grises" title="' + esc(grises.map(function (t) { return t.agente; }).join(', ')) + '">' + grises.map(retrato).join('') + '<small>' + grises.length + ' parados</small></span>' : '');
    }
    var v = ts.filter(function (t) { return t.estado === 'verde'; }).length, a = ts.filter(function (t) { return t.estado === 'amarillo'; }).length;
    if (res) res.innerHTML = '<b>' + v + '</b> trabajando · <b>' + a + '</b> con Carlos · <b>' + (ts.length - v - a) + '</b> parados';
    if (pie) pie.innerHTML = 'Actualizado ' + new Date(d.generado).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }) + ' (Madrid) · verde = tokens en los últimos 15 min, latido «trabajando» de &lt; 2 min o proceso con CPU · amarillo = con Carlos · gris = parado · fuentes: <a href="https://bot.yokup.com/api/presence">presencia de Yokup</a> + <a href="/api/consumos/velocidad">pulso de tokens</a>' + (d.presencia !== 'ok' ? ' · ⚠ presencia sin respuesta' : '') + ' · cada 10 s';
  }
  function leer() { return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(pinta); }
  function arranca() {
    if (!document.getElementById('trabajando')) return;
    leer();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
  }
  root.ConsumosTrabajando = { leer: leer };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
