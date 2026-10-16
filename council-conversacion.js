/* CONVERSACIÓN · bocadillos de la mesa (Carlos, 16-oct-2026)
 *  · Por defecto la mesa va limpia: ningún texto sobre las cabezas (las placas #nameplates
 *    quedan ocultas; el hover/selección lo siguen dando los contornos de council-estado.js).
 *  · Al pulsar el verbo CONVERSACIÓN (#verb-conversacion) cada consejero muestra un bocadillo
 *    pixel-art con nombre, cargo, estado, encargos/consumo, proyecto y su botón CHAT, con la cola
 *    apuntando a su cabeza. Se cierra con el mismo botón, con Esc o al elegir otro verbo.
 *  · No inventa datos: lee lo que ya calcula assets/consejo-rotulo.js en cada placa
 *    (data-r-*), que viene de /api/flota/trabajando. Sin dato: «sin datos».
 * Script clásico; también se importa desde node:test (council-conversacion.test.mjs). */
(function (root) {
  'use strict';

  const CARGOS = {
    CEO: 'Chief Executive Officer', CTO: 'Chief Technology Officer', COO: 'Chief Operations Officer',
    CFO: 'Chief Financial Officer', CCO: 'Chief Creative Officer', CDO: 'Chief Design Officer',
    CXO: 'Chief Experience Officer', CSO: 'Chief Storytelling Officer'
  };
  const MARGEN = 6;       // px entre bocadillos y contra los bordes
  const COMPACTO_MAX = 700; // px de ancho de mesa por debajo del cual se usa la versión compacta

  const T = (es, en) => (root.AdmiraIdioma && root.AdmiraIdioma.t ? root.AdmiraIdioma.t(es, en) : es);

  /* ── Datos (puro, testeable) ─────────────────────────────────────────────── */
  function pct(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

  /* Lee las placas ya pintadas por app.js + consejo-rotulo.js. */
  function leerPlacas(doc) {
    const out = [];
    doc.querySelectorAll('#nameplates .np[data-persona]').forEach(np => {
      const x = pct(np.style.left), y = pct(np.style.top);
      if (x == null || y == null) return;
      const rolEl = np.querySelector('.np-role');
      const rol = (rolEl && rolEl.textContent || '').trim();
      const chat = np.querySelector('.np-chat');
      const d = np.dataset;
      out.push({
        persona: np.getAttribute('data-persona'),
        rol, x, y,
        online: np.classList.contains('gold'),
        titulo: d.rTitulo || CARGOS[rol] || '',
        proyecto: d.rProyecto || '',
        estado: d.rEstado || '',
        meta: d.rMeta || '',
        led: d.rLed || 'nodata',
        chat: chat ? chat.getAttribute('href') : ''
      });
    });
    return out.sort((a, b) => a.x - b.x);
  }

  function firma(placas) { return JSON.stringify(placas); }

  /* Reparto vertical: de izquierda a derecha, cada bocadillo sube lo justo para no pisar
   * a ninguno de los ya colocados. Devuelve [{left, top, width, height, tx, tallo}] en px.
   *   ax, ay: punto de anclaje (arriba de la cabeza) en px · w, h: tamaño del bocadillo.
   *   cola: alto visible de la cola por debajo del marco · W, H: tamaño de la mesa. */
  function colocar(items, W, H, opts) {
    const cola = (opts && opts.cola) || 10, topMin = (opts && opts.topMin) || MARGEN;
    const puestos = ((opts && opts.obstaculos) || []).map(o => ({ left: o.left, right: o.right, top: o.top, bottom: o.bottom }));
    return items.map(it => {
      const left = Math.min(Math.max(it.ax - it.w / 2, MARGEN), Math.max(MARGEN, W - it.w - MARGEN));
      const base = it.ay - cola;           // borde inferior del marco sin elevar
      // Penalización de un candidato = área que pisaría de otros bocadillos/obstáculos (0 = libre).
      const pisa = bottom => {
        const top = bottom - it.h;
        return puestos.reduce((acc, p) => {
          const ox = Math.min(left + it.w, p.right + MARGEN) - Math.max(left, p.left - MARGEN);
          const oy = Math.min(bottom, p.bottom + MARGEN) - Math.max(top, p.top - MARGEN);
          return acc + (ox > 0 && oy > 0 ? ox * oy : 0);
        }, 0);
      };
      // Candidatos por orden de preferencia: sin elevar, subiendo de 2 en 2 px, y por último bajando
      // hasta 8 px (la cola sigue tocando la cabeza). Gana el primero sin solape; si ninguno,
      // el que menos pise.
      const cand = [];
      for (let b = base; b - it.h >= topMin; b -= 2) cand.push(b);
      for (let b = base + 2; b <= base + 8; b += 2) cand.push(b);
      if (!cand.length) cand.push(topMin + it.h);
      let bottom = cand[0], mejor = Infinity;
      for (const c of cand) { const pen = pisa(c); if (pen < mejor) { mejor = pen; bottom = c; if (pen === 0) break; } }
      const top = bottom - it.h;
      puestos.push({ left, right: left + it.w, top, bottom });
      return { left, top, tx: it.ax - left, tallo: Math.max(0, base - bottom) };
    });
  }

  /* ── DOM ──────────────────────────────────────────────────────────────────── */
  const st = { on: false, capa: null, firma: '', raf: 0, obs: null, ro: null };

  function el(doc, tag, cls, txt) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function apellido(persona) { return String(persona || '').trim().split(/\s+/).pop(); }

  function crearBocadillo(doc, p, compacto) {
    const b = el(doc, 'div', 'cb');
    b.setAttribute('data-persona', p.persona);
    b.setAttribute('data-led', p.led);
    b.setAttribute('role', 'group');
    b.setAttribute('aria-label', p.persona + (p.titulo ? ' · ' + p.titulo : ''));
    const marco = el(doc, 'div', 'cb-marco');
    if (compacto) {
      /* Móvil: no cabe la ficha entera. Chip con apellido + LED; si tiene chat, todo el chip lo abre. */
      const nombre = el(doc, 'p', 'cb-nombre');
      nombre.appendChild(el(doc, 'i', 'cb-led'));
      nombre.appendChild(doc.createTextNode(apellido(p.persona)));
      marco.appendChild(nombre);
      b.title = [p.persona, p.titulo, p.estado, p.meta, p.proyecto].filter(Boolean).join(' · ');
      if (p.chat) {
        b.setAttribute('data-href', p.chat);
        b.setAttribute('role', 'link');
        b.setAttribute('tabindex', '0');
        b.setAttribute('aria-label', T('Chat con ', 'Chat with ') + p.persona + ' · ' + (p.estado || T('sin datos', 'no data')));
      }
    } else {
      const nombre = el(doc, 'p', 'cb-nombre', p.persona);
      if (p.rol) nombre.appendChild(el(doc, 'span', 'cb-rol', p.rol));
      marco.appendChild(nombre);
      if (p.titulo) marco.appendChild(el(doc, 'p', 'cb-cargo', p.titulo));
      const estado = el(doc, 'p', 'cb-estado');
      estado.appendChild(el(doc, 'i', 'cb-led'));
      estado.appendChild(doc.createTextNode(p.estado || T('sin datos', 'no data')));
      marco.appendChild(estado);
      if (p.meta) marco.appendChild(el(doc, 'p', 'cb-meta', p.meta));
      if (p.proyecto) marco.appendChild(el(doc, 'p', 'cb-proy', '◆ ' + p.proyecto));
      if (p.chat) {
        const a = el(doc, 'a', 'cb-chat', 'chat');
        a.href = p.chat;
        a.title = T('Chat con ', 'Chat with ') + p.persona;
        marco.appendChild(a);
      }
    }
    b.appendChild(marco);
    b.appendChild(el(doc, 'i', 'cb-tallo'));
    b.appendChild(el(doc, 'i', 'cb-cola'));
    return b;
  }

  function asegurarCapa(doc) {
    if (st.capa && st.capa.isConnected) return st.capa;
    const mesa = doc.querySelector('.council-image');
    if (!mesa) return null;
    const capa = el(doc, 'div', 'council-bocadillos');
    capa.id = 'council-bocadillos';
    capa.hidden = true;
    capa.setAttribute('aria-label', T('Conversación del Consejo', 'Council conversation'));
    mesa.appendChild(capa);
    st.capa = capa;
    return capa;
  }

  /* Los botones Leyendas/Coetáneos (si se ven como botón) no se tapan. */
  function obstaculos(doc, capa) {
    const c = capa.getBoundingClientRect(), out = [];
    doc.querySelectorAll('.council-generation button').forEach(b => {
      const cs = root.getComputedStyle(b);
      if (!(parseFloat(cs.borderTopWidth) > 0)) return;      // en Coetáneos son zonas transparentes del arte
      const r = b.getBoundingClientRect();
      out.push({ left: r.left - c.left, right: r.right - c.left, top: r.top - c.top, bottom: r.bottom - c.top });
    });
    return out;
  }

  function pintar(doc, forzar) {
    const capa = asegurarCapa(doc);
    if (!capa || !st.on) return;
    const placas = leerPlacas(doc);
    const f = firma(placas) + '|' + capa.clientWidth + 'x' + capa.clientHeight;
    if (!forzar && f === st.firma) return;
    st.firma = f;
    const W = capa.clientWidth, H = capa.clientHeight;
    const compacto = W < COMPACTO_MAX;
    capa.classList.toggle('cb-compacto', compacto);
    capa.textContent = '';
    const nodos = placas.map(p => crearBocadillo(doc, p, compacto));
    nodos.forEach(n => { n.style.visibility = 'hidden'; capa.appendChild(n); });
    const pxArte = parseFloat(root.getComputedStyle(capa).getPropertyValue('--cb-px')) || 2;
    const items = nodos.map((n, i) => ({
      w: n.offsetWidth, h: n.querySelector('.cb-marco').offsetHeight,
      ax: placas[i].x / 100 * W, ay: placas[i].y / 100 * H
    }));
    const pos = colocar(items, W, H, { cola: 11 * pxArte - (compacto ? 3 : 6 * pxArte), topMin: Math.round(H * 0.04), obstaculos: obstaculos(doc, capa) });
    nodos.forEach((n, i) => {
      const q = pos[i];
      n.style.left = q.left + 'px'; n.style.top = q.top + 'px';
      n.style.setProperty('--cb-tx', q.tx + 'px');
      n.style.setProperty('--cb-tallo', q.tallo + 'px');
      if (q.tallo > 0.5) n.setAttribute('data-alto', ''); else n.removeAttribute('data-alto');
      n.style.visibility = '';
    });
    const todas = el(doc, 'a', 'cb-todas', T('Todas las conversaciones ↗', 'All conversations ↗'));
    todas.href = '/conversacion';
    todas.title = T('Conversaciones del equipo: consejeros, deepagents y Carlos', 'Team conversations: councillors, deepagents and Carlos');
    capa.appendChild(todas);
  }

  function programar(doc) {
    if (st.raf || !st.on) return;
    st.raf = (root.requestAnimationFrame || (f => root.setTimeout(f, 16)))(() => { st.raf = 0; pintar(doc, false); });
  }

  function vigilar(doc) {
    if (st.obs || !root.MutationObserver) return;
    const np = doc.getElementById('nameplates');
    if (np) {
      st.obs = new root.MutationObserver(() => programar(doc));
      st.obs.observe(np, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-r-estado', 'data-r-meta', 'data-r-proyecto', 'data-r-led', 'data-r-titulo', 'class', 'style'] });
    }
    if (root.ResizeObserver && st.capa) {
      st.ro = new root.ResizeObserver(() => programar(doc));
      st.ro.observe(st.capa);
    }
  }

  function boton(doc) { return doc.getElementById('verb-conversacion'); }

  function sincronizarBoton(doc) {
    const b = boton(doc);
    if (!b) return;
    b.classList.toggle('conv-on', st.on);
    b.setAttribute('aria-pressed', st.on ? 'true' : 'false');
  }

  function abrir(doc) {
    doc = doc || root.document;
    const capa = asegurarCapa(doc);
    if (!capa) return false;
    st.on = true; st.firma = '';
    capa.hidden = false;
    vigilar(doc);
    pintar(doc, true);
    // La tipografía pixel llega tarde: con ella cambian los anchos, así que se recoloca.
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { if (st.on) pintar(doc, true); });
    sincronizarBoton(doc);
    return true;
  }
  function cerrar(doc) {
    doc = doc || root.document;
    st.on = false;
    if (st.capa) { st.capa.hidden = true; st.capa.textContent = ''; }
    st.firma = '';
    sincronizarBoton(doc);
  }
  function alternar(doc) { return st.on ? (cerrar(doc), false) : abrir(doc); }

  function iniciar(doc) {
    doc = doc || root.document;
    if (!doc || doc._conversacionOk) return;
    doc._conversacionOk = true;
    doc.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.verb-btn');
      if (!b) return;
      if (b.id === 'verb-conversacion') { e.preventDefault(); alternar(doc); return; }
      if (st.on) cerrar(doc);              // elegir otro verbo cierra los bocadillos
    });
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape' && st.on) cerrar(doc);
      const c = e.key === 'Enter' && e.target.closest && e.target.closest('.cb[data-href]');
      if (c) root.location.href = c.getAttribute('data-href');
    });
    doc.addEventListener('click', e => {
      const c = e.target.closest && e.target.closest('.cb[data-href]');
      if (c && !e.target.closest('a')) root.location.href = c.getAttribute('data-href');
    });
    // Cambiar de Leyendas a Coetáneos repinta las placas: el observador reordena los bocadillos.
  }

  const api = { leerPlacas, colocar, firma, abrir, cerrar, alternar, iniciar, estaAbierto: () => st.on, CARGOS };
  root.CouncilConversacion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => iniciar(root.document));
    else iniciar(root.document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
