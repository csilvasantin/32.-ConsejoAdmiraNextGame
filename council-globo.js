/* Globo de estado sobre cada consejero y halo de los papeles de la mesa.
 * Datos: GET /api/consejo/estado (latido de consejero_latido + último done público).
 * Hover / foco teclado en escritorio; toque en móvil (se cierra tocando fuera).
 * prefers-reduced-motion: halo sin pulso. */
(function (root) {
  'use strict';

  const ENDPOINT = (root && root.ADMIRA_GLOBO_URL) || '/api/consejo/estado';
  const REUSE_MS = 20000;
  const COLORES = { trabajando: '#e23d3d', libre: '#3ddc84', desconocido: '#ffd60a' };
  const PAPEL = {
    leyendas: {
      'Steve Jobs': { x: 11.5, y: 57.0, w: 11.0, h: 20.0, sobre: 'cuerpo' },
      'Steve Wozniak': { x: 24.5, y: 72.0, w: 12.0, h: 9.0, sobre: 'papel' },
      'Tim Cook': { x: 34.5, y: 56.25, w: 14.0, h: 11.5, sobre: 'papel' },
      'Warren Buffett': { x: 50.5, y: 41.0, w: 12.0, h: 16.0, sobre: 'cuerpo' },
      'Walt Disney': { x: 0, y: 0, w: 0, h: 0, sobre: 'ninguno' },
      'Dieter Rams': { x: 70.0, y: 59.75, w: 7.0, h: 5.5, sobre: 'papel' },
      'Howard Schultz': { x: 76.75, y: 63.85, w: 7.0, h: 4.5, sobre: 'papel' },
      'George Lucas': { x: 76.25, y: 71.15, w: 10.5, h: 5.3, sobre: 'papel' }
    },
    coetaneos: {
      'Elon Musk': { x: 22.4, y: 89.6, w: 12.2, h: 6.0, sobre: 'placa' },
      'Jensen Huang': { x: 28.65, y: 80.35, w: 11.3, h: 6.1, sobre: 'placa' },
      'Gwynne Shotwell': { x: 35.4, y: 71.2, w: 11.2, h: 5.2, sobre: 'placa' },
      'Jony Ive': { x: 62.65, y: 65.0, w: 8.7, h: 4.4, sobre: 'placa' },
      'John Lasseter': { x: 72.4, y: 78.0, w: 10.8, h: 5.6, sobre: 'placa' },
      'Ryan Reynolds': { x: 79.35, y: 89.6, w: 12.3, h: 6.0, sobre: 'placa' }
    }
  };
  const CSS = `
#papel-halos{position:absolute;inset:0;pointer-events:none;z-index:2}
.papel-halo{position:absolute;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 5px 2px var(--halo),0 0 14px 7px color-mix(in srgb,var(--halo) 65%,transparent);outline:1px solid color-mix(in srgb,var(--halo) 80%,transparent)}
.papel-halo[data-sobre=papel]{border-radius:46% 46% 36% 36%}
.papel-halo[data-sobre=placa]{border-radius:10px;outline-width:2px}
.papel-halo[data-sobre=cuerpo]{border-radius:42%}
.papel-halo[data-estado=trabajando]{--halo:${COLORES.trabajando}}
.papel-halo[data-estado=libre]{--halo:${COLORES.libre}}
.papel-halo[data-estado=desconocido]{--halo:${COLORES.desconocido}}
@keyframes papel-pulso{0%,100%{opacity:1}50%{opacity:.62}}
.papel-halo[data-estado=trabajando]{animation:papel-pulso 1.8s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.papel-halo{animation:none!important}}
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
  function pintarHalos() {
    const d = doc(); if (!d) return;
    estilos();
    const c = capaHalos(); if (!c) return;
    ajustarCapa(c);
    const gen = genActual();
    const pos = PAPEL[gen] || {};
    c.replaceChildren();
    Object.keys(pos).forEach((persona) => {
      const p = pos[persona];
      if (!p || p.sobre === 'ninguno' || p.w <= 0 || p.h <= 0) return;
      const s = sillaDe(persona);
      const estado = (s && s.estado) || 'desconocido';
      const sobre = p.sobre || 'papel';
      const el = d.createElement('div');
      el.className = 'papel-halo';
      el.dataset.persona = persona;
      el.dataset.estado = estado;
      el.dataset.sobre = sobre;
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
      el.style.width = p.w + '%';
      el.style.height = p.h + '%';
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
    const estado = (s && s.estado) || (datos ? 'desconocido' : 'desconocido');
    const texto = s ? s.texto : (enVuelo ? 'mirando…' : 'desconocido');
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

  root.CouncilGlobo = { cargar, pintarHalos, mostrar, ocultar, sillaDe };
})(typeof window !== 'undefined' ? window : globalThis);
