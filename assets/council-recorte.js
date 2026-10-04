/* /recorte — editor manual de las siluetas del Consejo (modo Experto).
   Los polígonos se guardan normalizados (0..1) sobre el arte de la sala en
   /api/recorte (KV) y sustituyen a la silueta automática para todo visitante.
   Sin datos guardados, la sala usa assets/council-silhouettes.js. */
(function () {
  'use strict';
  var API = '/api/recorte';
  var IMG = { leyendas: 'assets/council-leyendas.jpg', coetaneos: 'assets/council-coetaneos.jpg' };
  var data = { polys: {} };
  var ready = false;

  function sil(gen) { return (window.COUNCIL_SILHOUETTES || {})[gen] || null; }
  function dims(gen) { var s = sil(gen); return s ? [s.width, s.height] : (gen === 'coetaneos' ? [1280, 720] : [1360, 768]); }
  function poly(gen, persona) { var g = data.polys && data.polys[gen]; return g && g[persona] && g[persona].length >= 3 ? g[persona] : null; }
  function toPath(pts, W, H) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + Math.round(p[0] * W * 10) / 10 + ' ' + Math.round(p[1] * H * 10) / 10; }).join(' ') + ' Z';
  }
  // Lo que usa la sala: path en píxeles del arte, o null para la silueta automática.
  function pathFor(gen, persona, W, H) { var p = poly(gen, persona); return p ? toPath(p, W, H) : null; }

  // Aplica los recortes a las máscaras ya pintadas (sin esperar al siguiente render).
  function applyToRoom() {
    var gen = currentGen();
    var svg = document.querySelector('#body-hotspots svg.silhouette-svg');
    if (!svg) return;
    var vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    var W = vb[2] || dims(gen)[0], H = vb[3] || dims(gen)[1];
    var auto = (sil(gen) || {}).paths || {};
    svg.querySelectorAll('path.body-hotspot').forEach(function (el) {
      var who = el.getAttribute('data-persona');
      var d = pathFor(gen, who, W, H) || auto[who];
      if (d && el.getAttribute('d') !== d) el.setAttribute('d', d);
    });
  }
  function currentGen() {
    var img = document.getElementById('council-img');
    return img && /coetaneos/.test(img.getAttribute('src') || '') ? 'coetaneos' : 'leyendas';
  }
  function load() {
    return fetch(API, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.polys) data = d; ready = true; applyToRoom(); return data; })
      .catch(function () { ready = true; return data; });
  }

  // ───────── editor ─────────
  var css = [
    '#recorte-ed{position:fixed;inset:0;z-index:2147483000;background:rgba(0,8,0,.94);color:#33ff66;font-family:"VT323","Courier New",monospace;display:flex;flex-direction:column;font-size:18px}',
    '#recorte-ed .rc-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #1f7a35;background:#020a03;text-shadow:0 0 4px rgba(51,255,102,.5)}',
    '#recorte-ed .rc-bar b{color:#9dffb5;letter-spacing:2px;margin-right:8px}',
    '#recorte-ed select,#recorte-ed button{font:inherit;font-size:16px;background:#031a08;color:#33ff66;border:1px solid #1f7a35;padding:3px 10px;cursor:pointer}',
    '#recorte-ed button:hover,#recorte-ed select:hover{background:#0a3a16;border-color:#33ff66}',
    '#recorte-ed button.rc-save{background:#0b4a1c;color:#c8ffd6;border-color:#33ff66}',
    '#recorte-ed .rc-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px}',
    '#recorte-ed svg{max-width:100%;max-height:100%;box-shadow:0 0 0 1px #1f7a35,0 0 24px rgba(51,255,102,.15);cursor:crosshair;user-select:none;touch-action:none}',
    '#recorte-ed .rc-auto{fill:none;stroke:#ff5a3a;stroke-width:2;stroke-dasharray:6 5;opacity:.8;pointer-events:none}',
    '#recorte-ed .rc-other{fill:rgba(51,255,102,.06);stroke:#1f7a35;stroke-width:1.5;pointer-events:none}',
    '#recorte-ed .rc-poly{fill:rgba(60,140,255,.30);stroke:#5fb0ff;stroke-width:2.5;pointer-events:none}',
    '#recorte-ed .rc-pt{fill:#33ff66;stroke:#021;stroke-width:2;cursor:move}',
    '#recorte-ed .rc-pt.first{fill:#ffdd44}',
    '#recorte-ed .rc-msg{padding:6px 12px;border-top:1px solid #1f7a35;background:#020a03;min-height:30px}',
    '#recorte-ed .rc-sp{flex:1}'
  ].join('');

  var ed = null, st = null;
  function el(tag, attrs, parent) {
    var ns = /^(svg|path|polygon|polyline|circle|image|g)$/.test(tag) ? 'http://www.w3.org/2000/svg' : null;
    var n = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function msg(t) { if (ed) ed.querySelector('.rc-msg').textContent = t; }

  function open(gen) {
    if (!document.getElementById('recorte-ed-style')) { var s = el('style', { id: 'recorte-ed-style' }); s.textContent = css; document.head.appendChild(s); }
    close();
    st = { gen: gen === 'coetaneos' ? 'coetaneos' : (gen || currentGen()), persona: null, pts: [], closed: false, drag: -1, lastAdd: 0 };
    ed = el('div', { id: 'recorte-ed', role: 'dialog', 'aria-label': 'Editor de recorte del Consejo' }, document.body);
    ed.innerHTML =
      '<div class="rc-bar"><b>▚ /RECORTE</b>' +
      '<select class="rc-gen" title="Sala"><option value="leyendas">Leyendas</option><option value="coetaneos">Coetáneos</option></select>' +
      '<select class="rc-who" title="Consejero"></select>' +
      '<button type="button" data-a="close" title="Cerrar el polígono (o doble clic)">⬠ Cerrar</button>' +
      '<button type="button" data-a="undo" title="Quitar el último punto (Ctrl+Z)">↶ Deshacer</button>' +
      '<button type="button" data-a="clear" title="Empezar de cero">✕ Limpiar</button>' +
      '<button type="button" data-a="auto" title="Borrar el recorte manual y volver a la silueta automática">↺ Automática</button>' +
      '<span class="rc-sp"></span>' +
      '<button type="button" class="rc-save" data-a="save">💾 Guardar</button>' +
      '<button type="button" data-a="exit" title="Salir (Esc)">Salir</button></div>' +
      '<div class="rc-stage"></div><div class="rc-msg"></div>';
    ed.querySelector('.rc-gen').value = st.gen;
    ed.querySelector('.rc-gen').addEventListener('change', function (e) { st.gen = e.target.value; fillWho(); build(); });
    ed.querySelector('.rc-who').addEventListener('change', function (e) { pick(e.target.value); });
    ed.querySelector('.rc-bar').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'close') closePoly(); else if (a === 'undo') undo(); else if (a === 'clear') { st.pts = []; st.closed = false; draw(); msg('Limpio. Haz clic sobre la imagen para colocar puntos.'); }
      else if (a === 'auto') save(null); else if (a === 'save') save(st.pts); else if (a === 'exit') close();
    });
    document.addEventListener('keydown', onKey, true);
    fillWho(); build();
    (ready ? Promise.resolve() : load()).then(function () { pick(st.persona); });
  }
  function close() {
    if (ed) ed.remove(); ed = null;
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (!ed) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo(); }
  }
  function people(gen) {
    var s = sil(gen), out = s && s.paths ? Object.keys(s.paths) : [];
    Object.keys((data.polys || {})[gen] || {}).forEach(function (p) { if (out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  function fillWho() {
    var sel = ed.querySelector('.rc-who');
    var list = people(st.gen);
    sel.innerHTML = list.map(function (p) { return '<option>' + p.replace(/[<&]/g, '') + '</option>'; }).join('');
    st.persona = list[0] || null;
  }
  function pick(persona) {
    st.persona = persona;
    var p = poly(st.gen, persona);
    st.pts = p ? p.map(function (q) { return [q[0], q[1]]; }) : [];
    st.closed = !!p;
    var sel = ed.querySelector('.rc-who'); if (sel.value !== persona) sel.value = persona;
    draw();
    msg(p ? 'Recorte manual de ' + persona + ' cargado. Arrastra los puntos para ajustarlo.'
          : 'Sin recorte manual para ' + persona + ' (en rojo, la silueta automática). Haz clic para colocar puntos.');
  }
  function build() {
    var stage = ed.querySelector('.rc-stage'); stage.innerHTML = '';
    var d = dims(st.gen), W = d[0], H = d[1];
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, preserveAspectRatio: 'xMidYMid meet' }, stage);
    el('image', { href: IMG[st.gen], x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }, svg);
    st.svg = svg; st.W = W; st.H = H;
    st.gOther = el('g', {}, svg); st.gAuto = el('g', {}, svg);
    st.shape = el('polygon', { 'class': 'rc-poly' }, svg);
    st.gPts = el('g', {}, svg);
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('dblclick', function (e) {
      e.preventDefault();
      // los dos clics del doble clic han añadido puntos: el segundo sobra
      if (!st.closed && Date.now() - st.lastAdd < 500 && st.pts.length > 3) st.pts.pop();
      closePoly();
    });
  }
  function svgPoint(e) {
    var pt = st.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var p = pt.matrixTransform(st.svg.getScreenCTM().inverse());
    return [Math.min(1, Math.max(0, p.x / st.W)), Math.min(1, Math.max(0, p.y / st.H))];
  }
  function onDown(e) {
    if (e.button !== 0) return;
    var t = e.target;
    if (t.classList && t.classList.contains('rc-pt')) {
      st.drag = +t.getAttribute('data-i'); st.svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (st.closed) { msg('El polígono está cerrado: arrastra puntos, o Limpiar para empezar otro.'); return; }
    st.pts.push(svgPoint(e)); st.lastAdd = Date.now(); draw();
    msg(st.pts.length + ' puntos · doble clic o «Cerrar» para terminar.');
  }
  function onMove(e) { if (st.drag < 0) return; st.pts[st.drag] = svgPoint(e); draw(); }
  function onUp() { st.drag = -1; }
  function undo() { if (st.pts.length) { st.pts.pop(); st.closed = false; draw(); msg(st.pts.length + ' puntos.'); } }
  function closePoly() {
    if (st.pts.length < 3) { msg('Hacen falta al menos 3 puntos.'); return; }
    st.closed = true; draw(); msg('Polígono cerrado (' + st.pts.length + ' puntos). Pulsa Guardar para publicarlo.');
  }
  function draw() {
    var W = st.W, H = st.H;
    st.gOther.innerHTML = ''; st.gAuto.innerHTML = ''; st.gPts.innerHTML = '';
    var auto = (sil(st.gen) || {}).paths || {};
    people(st.gen).forEach(function (p) {
      if (p === st.persona) return;
      var d = pathFor(st.gen, p, W, H) || auto[p]; if (d) el('path', { 'class': 'rc-other', d: d }, st.gOther);
    });
    if (auto[st.persona]) el('path', { 'class': 'rc-auto', d: auto[st.persona] }, st.gAuto);
    var pts = st.pts.map(function (p) { return (p[0] * W).toFixed(1) + ',' + (p[1] * H).toFixed(1); }).join(' ');
    st.shape.setAttribute('points', pts);
    st.shape.style.fill = st.closed ? '' : 'rgba(60,140,255,.12)';
    var r = Math.max(4, W / 220);
    st.pts.forEach(function (p, i) {
      el('circle', { 'class': 'rc-pt' + (i === 0 ? ' first' : ''), 'data-i': i, cx: p[0] * W, cy: p[1] * H, r: r }, st.gPts);
    });
  }
  function save(pts) {
    if (!st.persona) return;
    if (pts && (!st.closed || pts.length < 3)) { msg('Cierra el polígono (mín. 3 puntos) antes de guardar.'); return; }
    msg('Guardando…');
    fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gen: st.gen, persona: st.persona, points: pts }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        data = j; applyToRoom();
        if (!pts) { pick(st.persona); msg('Recorte manual borrado: ' + st.persona + ' vuelve a la silueta automática.'); }
        else { draw(); msg('✔ Guardado. La sala usa ya este recorte para ' + st.persona + ' (para todos los visitantes).'); }
      })
      .catch(function (e) { msg('✖ No se pudo guardar: ' + (e.message || e)); });
  }

  window.CouncilRecorte = { open: open, close: close, pathFor: pathFor, reload: load, data: function () { return data; } };
  load();
})();
