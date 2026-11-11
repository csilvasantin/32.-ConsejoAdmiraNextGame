/* Globo de estado sobre cada consejero, flecha de color sobre la cabeza y halo con el perfil real del folio o placa.
 * Datos: GET /api/consejo/estado (latido de consejero_latido + último done público).
 * Papeles/placas y flecha de un mismo consejero leen un único mapa de estado por pintado.
 * Flag `activo` (y `nuncaFlecha` en el asiento de Carlos Silva / Y-3): fácil de reactivar.
 * Hover / foco teclado en escritorio; toque en móvil (se cierra tocando fuera).
 * prefers-reduced-motion: halo y flecha sin animación. */
(function (root) {
  'use strict';

  const ENDPOINT = (root && root.ADMIRA_GLOBO_URL) || '/api/consejo/estado';
  const REUSE_MS = 20000;
  const COLORES = { trabajando: '#e23d3d', libre: '#3ddc84', desconocido: '#ffd60a' };
  const PAPEL = {
    leyendas: {
      'Steve Jobs': { activo: true, sobre: 'papel', puntos: [[18.162, 75.391], [21.397, 76.432], [25.588, 76.302], [27.5, 72.396], [29.559, 72.005], [30.147, 69.141], [25.662, 68.49], [25.588, 67.708], [24.338, 67.708], [23.971, 68.49], [21.324, 72.005], [20.074, 71.615]], flecha: { x: 10.368, y: 39.583 }, x: 24.154, y: 72.07, w: 11.985, h: 8.724 },
      'Steve Wozniak': { activo: true, sobre: 'papel', puntos: [[26.912, 61.458], [28.309, 62.5], [31.25, 62.5], [32.941, 60.156], [33.824, 59.115], [32.868, 58.594], [31.176, 58.724], [29.412, 58.464], [28.309, 58.333]], flecha: { x: 21.471, y: 31.51 }, x: 30.368, y: 60.416, w: 6.912, h: 4.167 },
      'Tim Cook': { activo: false, sobre: 'ninguno', puntos: [], flecha: null, x: 0, y: 0, w: 0, h: 0 },
      'Warren Buffett': { activo: false, sobre: 'papel', puntos: [[30, 51.823], [30.294, 52.734], [31.618, 52.344], [33.676, 52.344], [35.147, 53.125], [39.118, 54.427], [40.441, 53.125], [41.176, 51.823], [40.882, 50.651], [40.294, 50.391], [38.088, 50.391], [36.765, 51.042], [33.824, 50], [31.471, 50.521]], flecha: { x: 33.088, y: 24.479 }, x: 35.588, y: 52.213, w: 11.176, h: 4.427 },
      'Walt Disney': { activo: true, nuncaFlecha: true, figura: 'Carlos Silva', sobre: 'ninguno', puntos: [], flecha: { x: 50, y: 23.958 }, x: 0, y: 0, w: 0, h: 0 },
      'Dieter Rams': { activo: false, sobre: 'papel', puntos: [[66.618, 59.375], [66.912, 58.854], [68.971, 58.594], [69.706, 58.464], [71.176, 58.203], [72.5, 58.203], [72.721, 61.849], [68.382, 62.37], [68.088, 61.458], [66.765, 60.547]], flecha: { x: 70.074, y: 23.958 }, x: 69.669, y: 60.287, w: 6.103, h: 4.167 },
      'Howard Schultz': { activo: false, sobre: 'papel', puntos: [[73.382, 63.932], [73.382, 64.714], [75.882, 64.714], [75.882, 65.234], [78.529, 65.234], [78.529, 64.062], [78.088, 63.021], [77.059, 62.24], [73.676, 63.411]], flecha: { x: 80, y: 32.292 }, x: 75.956, y: 63.737, w: 5.147, h: 2.994 },
      'George Lucas': { activo: true, sobre: 'papel', puntos: [[72.279, 70.443], [75.588, 69.922], [77.059, 69.661], [78.235, 69.661], [79.265, 71.094], [81.25, 71.224], [82.5, 72.526], [79.118, 73.698], [73.529, 73.568], [72.279, 72.656]], flecha: { x: 90.735, y: 39.583 }, x: 77.389, y: 71.679, w: 10.221, h: 4.037 }
    },
    coetaneos: {
      'Elon Musk': { activo: true, sobre: 'placa', puntos: [[16.25, 85.833], [27.734, 85.833], [28.047, 86.25], [28.203, 87.222], [28.203, 91.111], [27.891, 92.361], [16.406, 92.361], [16.094, 91.806], [16.094, 86.389]], flecha: { x: 13.125, y: 42.778 }, x: 22.148, y: 89.097, w: 12.109, h: 6.528 },
      'Jensen Huang': { activo: true, sobre: 'placa', puntos: [[22.891, 77.222], [33.516, 77.222], [33.828, 77.639], [33.984, 78.75], [33.984, 82.361], [33.672, 83.194], [22.891, 83.333], [22.656, 82.778], [22.656, 77.778]], flecha: { x: 24.375, y: 41.389 }, x: 28.32, y: 80.278, w: 11.328, h: 6.111 },
      'Mira Murati': { activo: false, sobre: 'placa', puntos: [[29.844, 68.611], [39.453, 68.472], [39.688, 68.889], [39.766, 70.139], [39.766, 73.056], [39.453, 73.889], [29.844, 73.889], [29.609, 73.333], [29.609, 69.167]], flecha: { x: 35, y: 36.667 }, x: 34.688, y: 71.18, w: 10.157, h: 5.417 },
      'Jony Ive': { activo: true, sobre: 'placa', puntos: [[58.281, 62.778], [65.703, 62.639], [65.938, 63.056], [66.016, 64.167], [66.016, 66.389], [65.781, 67.083], [58.359, 67.083], [58.125, 66.667], [58.125, 63.194]], flecha: { x: 68.594, y: 39.444 }, x: 62.071, y: 64.861, w: 7.891, h: 4.444 },
      'John Lasseter': { activo: true, sobre: 'placa', puntos: [[66.953, 74.861], [77.188, 74.861], [77.5, 75.278], [77.578, 76.389], [77.578, 80.139], [77.266, 80.972], [67.031, 80.972], [66.797, 80.417], [66.797, 75.417]], flecha: { x: 76.563, y: 42.222 }, x: 72.188, y: 77.916, w: 10.781, h: 6.111 },
      'Ryan Reynolds': { activo: false, sobre: 'placa', puntos: [[73.359, 85.972], [84.844, 85.972], [85.078, 86.389], [85.078, 91.806], [84.844, 92.5], [73.359, 92.5], [73.047, 91.944], [72.812, 90.972], [72.812, 88.056], [73.047, 86.389]], flecha: { x: 88.75, y: 41.389 }, x: 78.945, y: 89.236, w: 12.266, h: 6.528 }
    }
  };
  const CSS = `
#papel-halos{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:visible}
#papel-halos svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;display:block}
@keyframes papel-pulso{0%,100%{opacity:1}50%{opacity:.62}}
.papel-halo[data-estado=trabajando]{animation:papel-pulso 1.8s ease-in-out infinite}
#papel-halos .consejero-flecha{position:absolute;z-index:3;width:clamp(24px,5.8%,44px);aspect-ratio:64/80;transform:translate(-50%,-100%);pointer-events:none;line-height:0;filter:drop-shadow(0 1px 1px rgba(0,0,0,.9)) drop-shadow(0 0 3px currentColor)}
#papel-halos .consejero-flecha svg{display:block;width:100%;height:100%;overflow:visible}
@keyframes flecha-rebote{0%,100%{transform:translate(-50%,-100%)}50%{transform:translate(-50%,-126%)}}
.consejero-flecha{animation:flecha-rebote 1.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.papel-halo,.consejero-flecha{animation:none!important}}

.consejo-globo{position:absolute;z-index:20;max-width:220px;min-width:120px;padding:7px 10px 8px;background:#140e06;color:#f3e6c4;border:2px solid #c9a227;box-shadow:3px 3px 0 #000;font:11px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none;transform:translate(-50%,-100%)}
.consejo-globo b{display:block;margin:0 0 3px;font:bold 9px/1.2 "Press Start 2P",monospace;color:#ffd75e;letter-spacing:.3px}
.consejo-globo p{margin:0;word-break:break-word}
.consejo-globo[data-estado=trabajando]{border-color:${COLORES.trabajando}}
.consejo-globo[data-estado=libre]{border-color:${COLORES.libre}}
.consejo-globo[data-estado=desconocido]{border-color:${COLORES.desconocido}}
.consejo-globo::after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-7px;border:7px solid transparent;border-top-color:#c9a227}
.consejo-globo::before{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:#140e06;z-index:1}
#body-hotspots .body-hotspot:focus-visible{outline:2px dashed #ffd75e;outline-offset:3px;stroke:#ffd75e}
`;

  let datos = null, datosAt = 0, enVuelo = null, globo = null, abierto = null, hideT = null, wired = false;

  function doc() { return root.document; }
  function escena() { return doc() && doc().querySelector('.council-image'); }
  function genActual() {
    const el = escena();
    return (el && el.getAttribute('data-generation')) || 'leyendas';
  }
  function estilos() {
    const d = doc(); if (!d || d.getElementById('consejo-globo-css')) return;
    const st = d.createElement('style'); st.id = 'consejo-globo-css'; st.textContent = CSS; d.head.appendChild(st);
  }
  function key(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function sillaDe(persona) {
    if (!datos || !datos.mesa || !persona) return null;
    const k = key(persona);
    for (const gen of Object.keys(datos.mesa)) {
      const s = (datos.mesa[gen] || []).find((x) => key(x.persona) === k);
      if (s) return s;
    }
    return null;
  }

  /* Un solo mapa por pintado: flecha y papel/placa del mismo consejero no pueden divergir. */
  function mapaEstados() {
    const m = Object.create(null);
    if (!datos || !datos.mesa) return m;
    for (const gen of Object.keys(datos.mesa)) {
      for (const s of (datos.mesa[gen] || [])) {
        if (s && s.persona) m[key(s.persona)] = s.estado || 'desconocido';
      }
    }
    return m;
  }
  function estadoDe(persona, mapa) {
    return (mapa && mapa[key(persona)]) || 'desconocido';
  }

  function esActivo(p) { return !!(p && p.activo !== false); }
  function llevaFlecha(p) {
    if (!p || p.activo === false || p.nuncaFlecha) return false;
    const fl = p.flecha;
    return !!(fl && Number.isFinite(Number(fl.x)) && Number.isFinite(Number(fl.y)));
  }
  function llevaHalo(p) {
    if (!p || p.activo === false) return false;
    if (!p || p.sobre === 'ninguno' || p.sobre === 'cuerpo') return false;
    return puntosDe(p).length >= 3;
  }
  const FLECHA_SVG = '<svg viewBox="0 0 64 80" focusable="false" aria-hidden="true"><path d="M32 76 L6 38 L22 38 L22 4 L42 4 L42 38 L58 38 Z" fill="currentColor" stroke="#140e06" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  function cargar(force) {
    if (!force && datos && Date.now() - datosAt < REUSE_MS) return Promise.resolve(datos);
    if (enVuelo) return enVuelo;
    const f = root.fetch && root.fetch.bind(root);
    if (!f) return Promise.reject(new Error('sin fetch'));
    enVuelo = f(ENDPOINT, { cache: 'no-store', headers: { accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { if (!d || !d.ok || !d.mesa) throw new Error('sin mesa'); datos = d; datosAt = Date.now(); pintarHalos(); if (abierto) pintarGlobo(abierto.persona, abierto.anchor); return d; })
      .finally(() => { enVuelo = null; });
    return enVuelo;
  }

  function capaHalos() {
    const stage = escena(); if (!stage) return null;
    let c = doc().getElementById('papel-halos');
    if (!c) { c = doc().createElement('div'); c.id = 'papel-halos'; c.setAttribute('aria-hidden', 'true'); stage.appendChild(c); }
    return c;
  }
  /* Caja pintada del JPG, relativa a .council-image, teniendo en cuenta object-fit. */
  function cajaArte(stage) {
    if (!stage) return null;
    const img = stage.querySelector('#council-img, img');
    const sw = stage.clientWidth || 0, sh = stage.clientHeight || 0;
    if (!img) return { x: 0, y: 0, w: sw, h: sh };
    const sr = stage.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    let x = ir.left - sr.left, y = ir.top - sr.top, w = ir.width, h = ir.height;
    const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
    const cs = root.getComputedStyle ? root.getComputedStyle(img) : null;
    const fit = ((cs && cs.objectFit) || 'fill').toLowerCase();
    if (nw && nh && w && h && fit && fit !== 'fill' && fit !== 'none') {
      let sx, sy;
      if (fit === 'cover') { const s = Math.max(w / nw, h / nh); sx = s; sy = s; }
      else if (fit === 'scale-down') { const s = Math.min(1, w / nw, h / nh); sx = s; sy = s; }
      else { const s = Math.min(w / nw, h / nh); sx = s; sy = s; } /* contain */
      const cw = nw * sx, ch = nh * sy;
      x = ir.left - sr.left + (w - cw) / 2;
      y = ir.top - sr.top + (h - ch) / 2;
      w = cw; h = ch;
    }
    return { x, y, w, h };
  }
  function ajustarCapa(c) {
    const stage = escena(); if (!c || !stage) return;
    const box = cajaArte(stage);
    if (!box || !box.w || !box.h) {
      c.style.inset = '0';
      c.style.left = c.style.top = c.style.width = c.style.height = '';
      return;
    }
    c.style.inset = 'auto';
    c.style.left = box.x + 'px';
    c.style.top = box.y + 'px';
    c.style.width = box.w + 'px';
    c.style.height = box.h + 'px';
  }
  function puntosDe(p) {
    return (p && Array.isArray(p.puntos) && p.puntos.length >= 3) ? p.puntos : [];
  }
  function pintarHalos() {
    const d = doc(); if (!d) return;
    estilos();
    const c = capaHalos(); if (!c) return;
    ajustarCapa(c);
    const gen = genActual();
    const pos = PAPEL[gen] || {};
    c.replaceChildren();
    const NS = 'http://www.w3.org/2000/svg';
    const svg = d.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const defs = d.createElementNS(NS, 'defs');
    Object.keys(COLORES).forEach((estado) => {
      const filter = d.createElementNS(NS, 'filter');
      filter.setAttribute('id', 'halo-brillo-' + estado);
      filter.setAttribute('x', '-80%');
      filter.setAttribute('y', '-80%');
      filter.setAttribute('width', '260%');
      filter.setAttribute('height', '260%');
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const morph = d.createElementNS(NS, 'feMorphology');
      morph.setAttribute('in', 'SourceAlpha');
      morph.setAttribute('operator', 'dilate');
      morph.setAttribute('radius', '0.35');
      morph.setAttribute('result', 'wide');
      const blur = d.createElementNS(NS, 'feGaussianBlur');
      blur.setAttribute('in', 'wide');
      blur.setAttribute('stdDeviation', '0.55');
      blur.setAttribute('result', 'blur');
      const flood = d.createElementNS(NS, 'feFlood');
      flood.setAttribute('flood-color', COLORES[estado]);
      flood.setAttribute('result', 'col');
      const comp = d.createElementNS(NS, 'feComposite');
      comp.setAttribute('in', 'col');
      comp.setAttribute('in2', 'blur');
      comp.setAttribute('operator', 'in');
      comp.setAttribute('result', 'glow');
      const merge = d.createElementNS(NS, 'feMerge');
      const n1 = d.createElementNS(NS, 'feMergeNode'); n1.setAttribute('in', 'glow');
      const n2 = d.createElementNS(NS, 'feMergeNode'); n2.setAttribute('in', 'SourceGraphic');
      merge.append(n1, n2);
      filter.append(morph, blur, flood, comp, merge);
      defs.appendChild(filter);
    });
    svg.appendChild(defs);
    const estados = mapaEstados();
    Object.keys(pos).forEach((persona) => {
      const p = pos[persona];
      if (!llevaHalo(p)) return;
      const pts = puntosDe(p);
      const estado = estadoDe(persona, estados);
      const sobre = p.sobre || 'papel';
      const g = d.createElementNS(NS, 'g');
      g.setAttribute('class', 'papel-halo');
      g.setAttribute('data-persona', persona);
      g.setAttribute('data-estado', estado);
      g.setAttribute('data-sobre', sobre);
      g.setAttribute('filter', 'url(#halo-brillo-' + estado + ')');
      const poly = d.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pts.map((xy) => xy[0] + ',' + xy[1]).join(' '));
      poly.setAttribute('fill', COLORES[estado] || COLORES.desconocido);
      poly.setAttribute('fill-opacity', '0.14');
      poly.setAttribute('stroke', COLORES[estado] || COLORES.desconocido);
      poly.setAttribute('stroke-width', sobre === 'placa' ? '0.28' : '0.22');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('stroke-linecap', 'round');
      g.appendChild(poly);
      svg.appendChild(g);
    });
    c.appendChild(svg);
    Object.keys(pos).forEach((persona) => {
      const p = pos[persona];
      if (!llevaFlecha(p)) return;
      const fl = p.flecha;
      const estado = estadoDe(persona, estados);
      const el = d.createElement('span');
      el.className = 'consejero-flecha';
      el.setAttribute('data-persona', persona);
      el.setAttribute('data-estado', estado);
      el.setAttribute('aria-hidden', 'true');
      el.style.left = fl.x + '%';
      el.style.top = fl.y + '%';
      el.style.color = COLORES[estado] || COLORES.desconocido;
      el.innerHTML = FLECHA_SVG;
      c.appendChild(el);
    });
  }

  function colocarGlobo(anchor) {
    if (!globo || !anchor) return;
    const stage = escena(); if (!stage) return;
    const sr = stage.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const w = globo.offsetWidth || 160;
    const h = globo.offsetHeight || 48;
    let left = r.left + r.width / 2 - sr.left;
    let top = r.top - sr.top - 10;
    left = Math.max(w / 2 + 6, Math.min(sr.width - w / 2 - 6, left));
    if (top - h < 4) top = (r.bottom - sr.top) + h + 14;
    globo.style.left = left + 'px';
    globo.style.top = top + 'px';
  }
  function pintarGlobo(persona, anchor) {
    const d = doc(); if (!d || !persona) return;
    estilos();
    if (!globo) {
      globo = d.createElement('div');
      globo.className = 'consejo-globo';
      globo.id = 'consejo-globo';
      globo.setAttribute('role', 'tooltip');
      escena() && escena().appendChild(globo);
    }
    const s = sillaDe(persona);
    let estado, texto;
    if (s) {
      estado = s.estado || 'desconocido';
      texto = s.texto;
    } else if (key(persona) === 'carlossilva') {
      /* La figura Y-3 no tiene silla en /api/consejo/estado; siempre está disponible. */
      estado = 'libre';
      texto = 'Siempre disponible';
    } else {
      estado = 'desconocido';
      texto = enVuelo ? 'mirando…' : 'desconocido';
    }
    globo.hidden = false;
    globo.dataset.estado = estado;
    globo.dataset.persona = persona;
    globo.innerHTML = '';
    const b = d.createElement('b'); b.textContent = persona;
    const p = d.createElement('p'); p.textContent = texto;
    globo.append(b, p);
    globo.setAttribute('aria-label', persona + ': ' + texto);
    colocarGlobo(anchor);
    abierto = { persona, anchor };
    const hot = d.getElementById('body-hotspots');
    if (hot) {
      hot.querySelectorAll('[data-persona]').forEach((el) => {
        if (el.getAttribute('data-persona') === persona) el.setAttribute('aria-describedby', 'consejo-globo');
        else el.removeAttribute('aria-describedby');
      });
    }
  }
  function mostrar(el) {
    if (!el) return;
    const persona = el.getAttribute('data-persona'); if (!persona) return;
    clearTimeout(hideT);
    pintarGlobo(persona, el);
    cargar(false).then(() => pintarGlobo(persona, el), () => pintarGlobo(persona, el));
  }
  function ocultar() {
    clearTimeout(hideT);
    hideT = setTimeout(() => {
      if (globo) globo.hidden = true;
      abierto = null;
      const d = doc();
      if (d) d.querySelectorAll('#body-hotspots [aria-describedby="consejo-globo"]').forEach((el) => el.removeAttribute('aria-describedby'));
    }, 80);
  }
  function esTactil() {
    return !!(root.matchMedia && root.matchMedia('(hover: none), (pointer: coarse)').matches);
  }
  function prepararHotspots() {
    const d = doc(); if (!d) return;
    const c = d.getElementById('body-hotspots'); if (!c) return;
    c.querySelectorAll('[data-persona]').forEach((el) => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
      const p = el.getAttribute('data-persona');
      if (p && !el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Estado de ' + p);
    });
  }
  function wire() {
    const d = doc(); if (!d || wired) return;
    wired = true;
    estilos();
    const c = d.getElementById('body-hotspots');
    if (c) {
      c.addEventListener('mouseover', (e) => {
        if (esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (el) mostrar(el);
      });
      c.addEventListener('mouseout', (e) => {
        if (esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        ocultar();
      });
      c.addEventListener('click', (e) => {
        if (!esTactil()) return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        if (abierto && abierto.persona === el.getAttribute('data-persona') && globo && !globo.hidden) { ocultar(); return; }
        mostrar(el);
      });
      c.addEventListener('focusin', (e) => {
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (el) mostrar(el);
      });
      c.addEventListener('focusout', (e) => {
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        ocultar();
      });
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { ocultar(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest('[data-persona]');
        if (!el) return;
        e.preventDefault();
        if (abierto && abierto.persona === el.getAttribute('data-persona') && globo && !globo.hidden) ocultar();
        else mostrar(el);
      });
    }
    d.addEventListener('click', (e) => {
      if (!esTactil()) return;
      if (e.target.closest && e.target.closest('#body-hotspots [data-persona]')) return;
      if (abierto) ocultar();
    }, true);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto) ocultar(); });
    const stage = escena();
    if (stage && root.MutationObserver) {
      new root.MutationObserver(() => { prepararHotspots(); pintarHalos(); if (abierto) colocarGlobo(abierto.anchor); })
        .observe(stage, { attributes: true, attributeFilter: ['data-generation'] });
    }
    const hot = d.getElementById('body-hotspots');
    if (hot && root.MutationObserver) {
      new root.MutationObserver(() => { prepararHotspots(); pintarHalos(); })
        .observe(hot, { childList: true, subtree: true });
    }
    if (root.addEventListener) {
      root.addEventListener('resize', () => {
        const c = doc().getElementById('papel-halos');
        if (c) ajustarCapa(c);
        if (abierto) colocarGlobo(abierto.anchor);
      });
    }
    const img = escena() && escena().querySelector('#council-img, img');
    if (img && img.addEventListener) img.addEventListener('load', pintarHalos);
    if (root.ResizeObserver && escena()) {
      new root.ResizeObserver(() => {
        const c = doc().getElementById('papel-halos');
        if (c) ajustarCapa(c);
        if (abierto) colocarGlobo(abierto.anchor);
      }).observe(escena());
    }
  }

  function arrancar() {
    estilos();
    wire();
    prepararHotspots();
    cargar(true).then(pintarHalos, pintarHalos);
  }
  if (doc() && doc().readyState === 'loading') doc().addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  root.CouncilGlobo = { cargar, pintarHalos, mostrar, ocultar, sillaDe, mapaEstados, estadoDe };
})(typeof window !== 'undefined' ? window : globalThis);
