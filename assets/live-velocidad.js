/* /velocidad · /speed y /demo velocidad (GrokBotBox, 09-10-2026).
 * En el ⌘ EXPERTO · CLI: /velocidad (castellano → web en castellano) o /speed (inglés → web en inglés)
 * imprime los tokens/hora que consume la flota ahora mismo + el top 3 de agentes, leídos de
 * /api/consumos/velocidad (partes reales de Yokup). /demo velocidad | speed | velocimetro abre el
 * velocímetro de /consumos y lo explica. Mismo enganche que assets/live-demo-portada.js. */
(function (root) {
  'use strict';
  if (root.__liveVelocidad) return;
  root.__liveVelocidad = true;
  var RE = /^\/(velocidad|speed)\s*$/i;
  var RE_DEMO = /^\/?demo\s+(velocidad|speed|velocimetro|velocímetro|speedometer)\s*$/i;

  function fmt(n, en) {
    if (n == null || !isFinite(n)) return '—';
    var loc = en ? 'en-US' : 'es-ES';
    function f(x, d) { return x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e9) return f(n / 1e9, 2) + ' G';
    if (n >= 1e6) return f(n / 1e6, 1) + ' M';
    if (n >= 1e3) return f(n / 1e3, 0) + ' k';
    return f(n, 0);
  }
  /** Texto de la respuesta (puro: se prueba en Node). */
  function texto(d, en) {
    if (!d || d.ok === false || d.tokHora == null) return en ? '⏱ Tokens/hour: no data (the Yokup usage-report source is not answering).' : '⏱ Tokens/hora: sin datos (la fuente de partes de Yokup no responde).';
    var met = d.metodo === 'ultima-hora' ? (en ? 'last hour, measured over ' + d.ventanaMin + ' min' : 'última hora, medido en ' + d.ventanaMin + ' min')
      : (en ? "today's average (estimated)" : 'media de hoy (estimado)');
    var top = (d.porAgente || []).slice(0, 3).map(function (a, i) { return (i + 1) + '. ' + a.agente + ' — ' + fmt(a.tokHora, en) + ' tok/h'; });
    return '⏱ ' + fmt(d.tokHora, en) + ' tok/h · ' + met + (d.pico24h != null ? ' · ' + (en ? '24 h peak ' : 'pico 24 h ') + fmt(d.pico24h, en) + ' tok/h' : '') +
      (top.length ? '\n' + top.join('\n') : '') + '\n' + (en ? 'Speedometer: ' : 'Velocímetro: ') + 'https://www.admira.live/consumos';
  }
  function ponerIdioma(lang) {
    var B = root.AdmiraCliBilingue;
    if (B && typeof B.ponerIdioma === 'function') { try { B.ponerIdioma(lang); } catch (e) {} }
    else if (root.document) document.documentElement.lang = lang;
  }
  function escribe(out, t) {
    if (!out || typeof out.appendChild !== 'function') return;
    var pre = document.createElement('div');
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = t;
    out.appendChild(pre);
  }
  function velocidad(out, en) {
    escribe(out, en ? '⏱ Measuring…' : '⏱ Midiendo…');
    return fetch('/api/consumos/velocidad', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; })
      .then(function (d) { var t = texto(d, en); escribe(out, t); return t; });
  }
  function demo(out, en) {
    escribe(out, en
      ? 'Speedometer demo: /consumos shows a semicircular dial with the fleet tokens per hour right now (real Yokup reports; last hour measured or today\'s average, labelled), the top agents and the 24 h peak. /velocidad · /speed prints it here.'
      : 'Demo velocímetro: /consumos enseña un dial semicircular con los tokens por hora de la flota ahora mismo (partes reales de Yokup; última hora medida o media de hoy, etiquetado), los agentes que más gastan y el pico de 24 h. /velocidad · /speed lo imprime aquí.');
    var v = velocidad(out, en);
    if (root.location && !/\/consumos/.test(root.location.pathname)) setTimeout(function () { root.open('/consumos#velocimetro', '_blank'); }, 400);
    else { var el = document.getElementById('velocimetro'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth' }); }
    try { document.dispatchEvent(new CustomEvent('admira:demo', { detail: { id: 'velocidad', live: true } })); } catch (e) {}
    return v;
  }
  function wire() {
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      var input = form.querySelector('input, textarea');
      var t = String((input && input.value) || '').trim();
      var m = RE.exec(t), md = RE_DEMO.exec(t);
      if (!m && !md) return;
      e.preventDefault(); e.stopPropagation();
      var en = m ? m[1].toLowerCase() === 'speed' : /^(speed|speedometer)$/i.test(md[1]);
      if (m) ponerIdioma(en ? 'en' : 'es');
      var out = document.querySelector('.ax-cli-out');
      escribe(out, '> ' + t);
      if (m) velocidad(out, en); else demo(out, en);
      if (input) input.value = '';
    }, true);
  }
  var api = { texto: texto, fmt: fmt, RE: RE, RE_DEMO: RE_DEMO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LiveVelocidad = Object.assign(api, { velocidad: velocidad, demo: demo });
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
})(typeof window !== 'undefined' ? window : globalThis);
