/* Histórico de LÍNEAS DE CÓDIGO · Galaxia AdmiraNeXT (GrokBotBox, 09-10-2026).
 * Clic en «13 proyectos» (HACKEO de /control) → ventana estilo terminal verde con la evolución
 * diaria (fotos de las 00:00 y 12:00 de Madrid) del Σ sin duplicar y de cada proyecto, y una
 * tabla hoy · ayer · Δ día · Δ semana. Datos: GET /api/control/lineas (público, sin secretos).
 * CLI: /lineas (castellano) · /lines (inglés) en la consola experta de /control y en el ⌘ CLI de la
 * home; /demo lineas · /demo lines abre la vista. Nunca se inventa un día: si solo hay una foto,
 * se enseña esa y «el histórico empieza hoy». */
(function (root) {
  'use strict';
  if (root.__controlLineas) return;
  root.__controlLineas = true;
  var API = '/api/control/lineas';
  var RE = /^\/(lineas|líneas|lines)\s*$/i;
  var RE_DEMO = /^\/?demo\s+(lineas|líneas|lines|loc)\s*$/i;
  var COLORES = ['#00ff41', '#ffd400', '#00d4ff', '#ff66aa', '#bd93f9', '#ff9900', '#66ff66', '#2aa198', '#ff5555', '#9fe6b0', '#6fefff', '#ffcc00', '#cb4b16', '#f8f8f2'];

  function fmt(n, en) { return n == null ? '—' : Number(n).toLocaleString(en ? 'en-US' : 'es-ES'); }
  function delta(n, en) { return n == null ? '—' : (n > 0 ? '+' : n < 0 ? '' : '±') + fmt(n, en); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Puntos «x,y» de una serie en un lienzo w×h (huecos null → cortes). Puro: se prueba en Node. */
  function rutaSerie(serie, w, h, min, max) {
    var n = serie.length, partes = [], tramo = [];
    var rango = (max - min) || 1;
    for (var i = 0; i < n; i++) {
      var v = serie[i];
      if (v == null) { if (tramo.length) partes.push(tramo); tramo = []; continue; }
      var x = n === 1 ? w / 2 : (i / (n - 1)) * w;
      var y = h - ((v - min) / rango) * h;
      tramo.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    if (tramo.length) partes.push(tramo);
    return partes;
  }
  /** Mínimo/máximo con margen del 5 % (si todo es igual, ±1 %). */
  function escala(series) {
    var vs = [];
    series.forEach(function (s) { s.forEach(function (v) { if (v != null) vs.push(v); }); });
    if (!vs.length) return { min: 0, max: 1 };
    var mi = Math.min.apply(null, vs), ma = Math.max.apply(null, vs), m = (ma - mi) * 0.05 || Math.max(1, ma * 0.01);
    return { min: Math.max(0, mi - m), max: ma + m };
  }

  function grafico(titulo, etiquetas, series, w, h) {
    var e = escala(series.map(function (s) { return s.serie; }));
    var svg = '<svg viewBox="-60 -10 ' + (w + 80) + ' ' + (h + 34) + '" class="ln-svg" preserveAspectRatio="none" role="img" aria-label="' + esc(titulo) + '">';
    for (var g = 0; g <= 4; g++) {
      var y = (g / 4) * h, val = e.max - (g / 4) * (e.max - e.min);
      svg += '<line x1="0" x2="' + w + '" y1="' + y + '" y2="' + y + '" stroke="#0f3a1c" stroke-dasharray="3 4"/>' +
        '<text x="-6" y="' + (y + 4) + '" text-anchor="end" fill="#3fbf6a" font-size="11">' + fmt(Math.round(val)) + '</text>';
    }
    var n = etiquetas.length, paso = Math.max(1, Math.ceil(n / 8));
    for (var i = 0; i < n; i += paso) {
      var x = n === 1 ? w / 2 : (i / (n - 1)) * w;
      svg += '<text x="' + x + '" y="' + (h + 18) + '" text-anchor="middle" fill="#3fbf6a" font-size="10">' + esc(etiquetas[i].slice(5)) + '</text>';
    }
    series.forEach(function (s) {
      rutaSerie(s.serie, w, h, e.min, e.max).forEach(function (pts) {
        if (s.area && pts.length > 1) svg += '<polygon points="' + pts[0].split(',')[0] + ',' + h + ' ' + pts.join(' ') + ' ' + pts[pts.length - 1].split(',')[0] + ',' + h + '" fill="' + s.color + '" opacity=".12"/>';
        if (pts.length > 1) svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.grueso ? 2.5 : 1.4) + '"/>';
        pts.forEach(function (p) { var c = p.split(','); svg += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (s.grueso ? 4 : 2.5) + '" fill="' + s.color + '"><title>' + esc(s.nombre) + '</title></circle>'; });
      });
    });
    return svg + '</svg>';
  }

  function css() {
    if (document.getElementById('ln-css')) return;
    var st = document.createElement('style'); st.id = 'ln-css';
    st.textContent =
      '#lnHist{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);font-family:"Courier New",monospace}' +
      '#lnHist.on{display:flex}' +
      '#lnHist .ln-box{width:min(1100px,96vw);max-height:92vh;overflow:auto;background:#030a05;color:#00ff41;border:1px solid #00ff41;border-radius:8px;box-shadow:0 0 30px rgba(0,255,65,.25),inset 0 0 40px rgba(0,255,65,.05);padding:14px 16px;text-shadow:0 0 3px rgba(0,255,65,.5)}' +
      '#lnHist .ln-h{display:flex;align-items:center;gap:10px;border-bottom:1px dashed #1f6f4a;padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap}' +
      '#lnHist .ln-h b{font-size:15px;letter-spacing:2px}#lnHist .ln-h .sp{flex:1}' +
      '#lnHist button{font-family:inherit;background:#0a0a0a;color:#00ff41;border:1px solid #00ff41;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer}#lnHist button:hover,#lnHist button.on{background:#00ff41;color:#000}' +
      '#lnHist .ln-kpi{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 10px}#lnHist .ln-kpi span{border:1px solid #1f6f4a;border-radius:6px;padding:4px 9px;font-size:12px}#lnHist .ln-kpi span b{color:#bfffd0}' +
      '#lnHist .ln-nota{color:#ffd400;font-size:12px;margin:2px 0 8px}' +
      '#lnHist .ln-svg{width:100%;height:240px;background:#010603;border:1px solid #0f3a1c;border-radius:6px}' +
      '#lnHist table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;font-variant-numeric:tabular-nums}' +
      '#lnHist th,#lnHist td{padding:3px 6px;border-bottom:1px solid #0f3a1c;text-align:right;white-space:nowrap}#lnHist th:first-child,#lnHist td:first-child,#lnHist td.l{text-align:left}' +
      '#lnHist th{color:#9fe6b0;font-weight:700}#lnHist tr.tot td{color:#000;background:#00ff41;font-weight:700}' +
      '#lnHist .up{color:#66ff66}#lnHist .dn{color:#ff6666}#lnHist .sw{display:inline-block;width:9px;height:9px;margin-right:6px;border-radius:2px}' +
      '#lnHist .ln-pie{color:#3fbf6a;font-size:11px;margin-top:8px}' +
      '#hkProjCount{cursor:pointer}#hkProjCount:hover{outline:1px solid #00ff41}';
    document.head.appendChild(st);
  }

  var estado = { datos: null, vista: 'total' };
  function caja() {
    var el = document.getElementById('lnHist');
    if (el) return el;
    css();
    el = document.createElement('div'); el.id = 'lnHist';
    el.innerHTML = '<div class="ln-box" role="dialog" aria-label="Histórico de líneas de código"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) cerrar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('on')) { e.stopPropagation(); cerrar(); } }, true);
    document.body.appendChild(el);
    return el;
  }
  function cerrar() { var el = document.getElementById('lnHist'); if (el) el.classList.remove('on'); }

  function cls(n) { return n == null || n === 0 ? '' : n > 0 ? 'up' : 'dn'; }
  function pintar() {
    var el = caja(), box = el.querySelector('.ln-box'), d = estado.datos, en = (document.documentElement.lang || 'es').slice(0, 2) === 'en';
    var cab = '<div class="ln-h"><b>▌ ' + (en ? 'LINES OF CODE · AdmiraNeXT GALAXY' : 'LÍNEAS DE CÓDIGO · GALAXIA AdmiraNeXT') + '</b><span class="sp"></span>' +
      '<button data-v="total" class="' + (estado.vista === 'total' ? 'on' : '') + '">Σ total</button>' +
      '<button data-v="proyectos" class="' + (estado.vista === 'proyectos' ? 'on' : '') + '">' + (en ? 'per project' : 'por proyecto') + '</button>' +
      '<button data-x="1">✕</button></div>';
    if (!d) { box.innerHTML = cab + '<p>' + (en ? 'Loading…' : 'Cargando…') + '</p>'; return enganchar(box); }
    var r = d.resumen;
    if (!d.ok || !r || !r.fotos) { box.innerHTML = cab + '<p class="ln-nota">' + (en ? 'No snapshot yet: the first one is taken at 00:00 or 12:00 (Madrid).' : 'Aún no hay ninguna foto: la primera se toma a las 00:00 o a las 12:00 (Madrid).') + '</p>'; return enganchar(box); }
    var t = r.total, h = '';
    h += '<div class="ln-kpi"><span>Σ <b>' + fmt(t.hoy, en) + '</b> ' + (en ? 'lines (no duplicates)' : 'líneas (sin duplicar)') + '</span>' +
      '<span>' + (en ? 'gross ' : 'bruto ') + '<b>' + fmt(t.bruto, en) + '</b></span>' +
      '<span>Δ ' + (en ? 'day' : 'día') + ' <b class="' + cls(t.deltaDia) + '">' + delta(t.deltaDia, en) + '</b></span>' +
      '<span>Δ ' + (en ? 'week' : 'semana') + ' <b class="' + cls(t.deltaSemana) + '">' + delta(t.deltaSemana, en) + '</b></span>' +
      '<span>' + r.proyectos.length + (en ? ' projects' : ' proyectos') + ' · ' + r.fotos + (en ? ' snapshots' : ' fotos') + ' · ' + esc(r.ultima.fecha + ' ' + r.ultima.slot + ':00') + '</span></div>';
    if (r.nota) h += '<div class="ln-nota">⚑ ' + (en ? 'history starts today — one snapshot so far; the next ones arrive at 00:00 and 12:00 (Madrid).' : 'el histórico empieza hoy — de momento hay una sola foto; las siguientes llegan a las 00:00 y a las 12:00 (Madrid).') + '</div>';
    var series = estado.vista === 'total'
      ? [{ nombre: 'Σ AdmiraNeXT', serie: t.serie, color: '#00ff41', grueso: true, area: true }]
      : r.proyectos.map(function (p, i) { return { nombre: p.proyecto, serie: p.serie, color: COLORES[i % COLORES.length] }; });
    h += grafico(en ? 'Lines of code over time' : 'Evolución de las líneas de código', r.etiquetas, series, 900, 200);
    h += '<table><thead><tr><th>' + (en ? 'project' : 'proyecto') + '</th><th>repo @commit</th><th>' + (en ? 'files' : 'ficheros') + '</th><th>' + (en ? 'today' : 'hoy') + '</th><th>' + (en ? 'yesterday' : 'ayer') + '</th><th>Δ ' + (en ? 'day' : 'día') + '</th><th>Δ ' + (en ? 'week' : 'semana') + '</th><th>' + (en ? 'adds to Σ' : 'aporta Σ') + '</th></tr></thead><tbody>';
    r.proyectos.forEach(function (p, i) {
      h += '<tr><td><span class="sw" style="background:' + COLORES[i % COLORES.length] + '"></span>' + esc(p.proyecto) + '</td><td class="l">' + esc(p.repo) + ' @' + esc(p.commit) + '</td><td>' + fmt(p.ficheros, en) + '</td><td>' + fmt(p.hoy, en) + '</td><td>' + fmt(p.ayer, en) +
        '</td><td class="' + cls(p.deltaDia) + '">' + delta(p.deltaDia, en) + '</td><td class="' + cls(p.deltaSemana) + '">' + delta(p.deltaSemana, en) + '</td><td>' + fmt(p.unicas, en) + '</td></tr>';
    });
    h += '<tr class="tot"><td>Σ AdmiraNeXT</td><td class="l">' + (en ? 'no duplicates' : 'sin duplicar') + '</td><td></td><td>' + fmt(t.hoy, en) + '</td><td>' + fmt(t.ayer, en) + '</td><td>' + delta(t.deltaDia, en) + '</td><td>' + delta(t.deltaSemana, en) + '</td><td>' + fmt(t.hoy, en) + '</td></tr></tbody></table>';
    h += '<div class="ln-pie">' + (en ? 'Method: non-empty lines of source files (same as the HACKEO Σ, tools/hackeo-corpus.py); snapshots at 00:00 and 12:00 Madrid · ' : 'Método: líneas no vacías de ficheros fuente (el mismo Σ del HACKEO, tools/hackeo-corpus.py); fotos a las 00:00 y 12:00 de Madrid · ') + '<a href="' + API + '" target="_blank" style="color:#9fe6b0">' + API + '</a> · /lineas · /lines</div>';
    box.innerHTML = cab + h;
    enganchar(box);
  }
  function enganchar(box) {
    box.querySelectorAll('button[data-v]').forEach(function (b) { b.onclick = function () { estado.vista = b.getAttribute('data-v'); pintar(); }; });
    var x = box.querySelector('button[data-x]'); if (x) x.onclick = cerrar;
  }
  function cargar() {
    return fetch(API, { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; })
      .then(function (d) { estado.datos = d; return d; });
  }
  function abrir(vista) {
    if (vista) estado.vista = vista;
    caja().classList.add('on'); estado.datos = null; pintar();
    return cargar().then(function () { pintar(); return estado.datos; });
  }

  /** Texto para el CLI (puro). */
  function texto(d, en) {
    var r = d && d.resumen;
    if (!r || !r.fotos) return en ? '📈 Lines of code: no snapshot yet.' : '📈 Líneas de código: aún no hay ninguna foto.';
    var t = r.total;
    var cab = '📈 Σ AdmiraNeXT ' + fmt(t.hoy, en) + (en ? ' lines (no duplicates) · ' : ' líneas (sin duplicar) · ') + r.proyectos.length + (en ? ' projects · ' : ' proyectos · ') + r.ultima.fecha + ' ' + r.ultima.slot + ':00 · Δ ' + (en ? 'day ' : 'día ') + delta(t.deltaDia, en) + ' · Δ ' + (en ? 'week ' : 'semana ') + delta(t.deltaSemana, en);
    var filas = r.proyectos.map(function (p) { return '  ' + (p.proyecto + '                  ').slice(0, 18) + ' ' + ('         ' + fmt(p.hoy, en)).slice(-9) + '  Δ ' + delta(p.deltaDia, en); });
    return [cab].concat(filas).join('\n') + (r.nota ? '\n' + (en ? '(history starts today)' : '(el histórico empieza hoy)') : '') + '\n' + (en ? 'History: click «13 projects» in the HACKEO of ' : 'Histórico: clic en «13 proyectos» del HACKEO de ') + 'https://www.admira.live/control/';
  }
  function ponerIdioma(lang) {
    var B = root.AdmiraCliBilingue;
    if (B && typeof B.ponerIdioma === 'function') { try { B.ponerIdioma(lang); } catch (e) {} }
    else if (root.document) document.documentElement.lang = lang;
  }
  /** Consola experta de /control: devuelve true si el comando era suyo. escribir(titulo, texto). */
  function cli(cmd, escribir) {
    var t = String(cmd || '').trim(), m = RE.exec(t), md = RE_DEMO.exec(t);
    if (!m && !md) return false;
    var en = m ? m[1].toLowerCase() === 'lines' : /^(lines|loc)$/i.test(md[1]);
    if (m) ponerIdioma(en ? 'en' : 'es');
    if (md) {
      escribir(t, en ? 'Lines-of-code demo: opening the history (Σ and per project, 00:00/12:00 Madrid snapshots). Click «13 projects» in the HACKEO to open it any time.'
        : 'Demo líneas: abro el histórico (Σ y por proyecto, fotos de las 00:00/12:00 de Madrid). Clic en «13 proyectos» del HACKEO para abrirlo cuando quieras.');
      if (document.getElementById('hkProjCount')) abrir('total');
      else setTimeout(function () { root.open('/control/#lineas', '_blank'); }, 300);
      try { document.dispatchEvent(new CustomEvent('admira:demo', { detail: { id: 'lineas', live: true } })); } catch (e) {}
      return true;
    }
    cargar().then(function (d) { escribir(t, texto(d, en)); });
    return true;
  }
  function wire() {
    // «13 proyectos» del HACKEO → histórico
    document.addEventListener('click', function (e) {
      var pc = e.target && e.target.closest && e.target.closest('#hkProjCount');
      if (pc) { e.preventDefault(); abrir(); }
    });
    var pc = document.getElementById('hkProjCount');
    if (pc) pc.setAttribute('title', 'Proyectos AdmiraNeXT · clic: histórico diario de líneas de código');
    if (/^#(lineas|lines)$/.test(root.location.hash || '')) abrir();
    // ⌘ CLI de la home (suite experto): /lineas · /lines · /demo lineas
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      var input = form.querySelector('input, textarea'), t = String((input && input.value) || '').trim();
      if (!RE.test(t) && !RE_DEMO.test(t)) return;
      e.preventDefault(); e.stopPropagation();
      var out = document.querySelector('.ax-cli-out');
      function escribe(tt, txt) { if (!out) return; var p = document.createElement('div'); p.style.whiteSpace = 'pre-wrap'; p.textContent = txt; out.appendChild(p); }
      escribe(null, '> ' + t);
      cli(t, escribe);
      if (input) input.value = '';
    }, true);
  }
  var api = { texto: texto, rutaSerie: rutaSerie, escala: escala, fmt: fmt, delta: delta, RE: RE, RE_DEMO: RE_DEMO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ControlLineas = Object.assign(api, { abrir: abrir, cerrar: cerrar, cli: cli, cargar: cargar });
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
})(typeof window !== 'undefined' ? window : globalThis);
