/* «todo» / «all» con el verbo Preguntar (Carlos, 27-09-2026).
 * Un bocadillo sobre CADA consejero de la mesa con lo que está haciendo ahora mismo,
 * leído del estado real de la flota (nunca texto inventado):
 *   1) api.yokup.com/highscore/active-work → misión abierta (running / assigned_stale)
 *   2) bot.yokup.com/api/presence/trabajando → encargo con latido «trabajando» (≤ 90 s)
 *   3) bot.yokup.com/api/presence → foco/tarea en modo «trabajando» o foco declarado
 *      hace ≤ 15 min.
 * Sin nada en curso: «ahora mismo nada». Fuente caída o consejero sin agente enlazado:
 * «sin datos ahora mismo». Ningún consejero se queda sin bocadillo.
 * Script clásico; también se importa desde node:test (council-todo.test.mjs). */
(function (root) {
  'use strict';

  const TG = 'https://bot.yokup.com';
  const YK = 'https://api.yokup.com';
  const MAX_CHARS = 60;
  const AUTO_CLOSE_MS = 20000;
  const FETCH_TIMEOUT_MS = 12000; // active-work tarda ~5,5 s
  const REUSE_MS = 30000;
  const FRESH_S = 15 * 60;
  const TEXT = Object.freeze({
    nada: 'ahora mismo nada',
    sinDatos: 'sin datos ahora mismo',
    cargando: 'mirando…',
    sinAgente: 'sin agente enlazado'
  });

  /* Consejero de la mesa → agente de la flota. Leyendas: los cuatro consejeros de
     GrokBot (council-grokbot.js). Coetáneos: MATRIX_LINKS de app.js (FLT-100878:
     Elon = Smith, Jensen = ArquitectoCursorCloud). Cook, Buffett, Rams y Schultz no
     tienen agente: su bocadillo lo dice en vez de inventarse nada. */
  const AGENTS = Object.freeze({
    leyendas: Object.freeze({
      'Steve Jobs': 'Jobs', 'Steve Wozniak': 'Wozniak', 'Tim Cook': null, 'Warren Buffett': null,
      'Walt Disney': 'Disney', 'Dieter Rams': null, 'Howard Schultz': null, 'George Lucas': 'Lucas'
    }),
    coetaneos: Object.freeze({
      'Elon Musk': 'Smith', 'Jensen Huang': 'ArquitectoCursorCloud', 'Gwynne Shotwell': 'Trinity',
      'Ruth Porat': 'Oraculo', 'John Lasseter': 'Mouse', 'Jony Ive': 'Arquitecto',
      'Carlos Ratti': 'Link', 'Ryan Reynolds': 'Cypher'
    })
  });

  const key = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

  function isTodoCommand(text) {
    const t = String(text == null ? '' : text).trim().toLowerCase();
    return t === 'todo' || t === 'all';
  }

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
  function truncate(text, max = MAX_CHARS) {
    const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const parts = segmenter ? Array.from(segmenter.segment(clean), p => p.segment) : Array.from(clean);
    if (parts.length <= max) return clean;
    return parts.slice(0, max - 1).join('').replace(/[\s·,;:.\-–—]+$/u, '') + '…';
  }

  /* ¿Este registro (persona + máquina) es del agente enlazado? El Arquitecto se parte
     en dos: ArquitectoCursorCloud (Jensen) y el Arquitecto de las demás cajas (Jony). */
  function belongs(agent, persona, machine) {
    const a = key(agent), p = key(persona), m = key(machine);
    if (!a || !p) return false;
    if (a === 'arquitectocursorcloud') return p === 'arquitectocursorcloud' || (p === 'arquitecto' && m === 'cursorcloud');
    if (a === 'arquitecto') return p === 'arquitecto' && m !== 'cursorcloud';
    return p === a;
  }
  function familyParts(item) {
    const fk = String(item && item.family_key || '');
    const at = fk.indexOf('@');
    if (at > 0) return { persona: fk.slice(0, at), machine: fk.slice(at + 1) };
    return { persona: item && (item.persona || item.agent) || '', machine: item && item.machine || '' };
  }

  /* Estado de un agente a partir de las tres fuentes. Cada fuente es `null` si falló. */
  function resolveAgent(agent, sources, nowS) {
    if (!agent) return { text: TEXT.sinDatos, kind: 'sin-agente', note: TEXT.sinAgente };
    const { activeWork, trabajando, presence } = sources || {};
    const now = Number(nowS) || Math.floor(Date.now() / 1000);
    // 1) Misión abierta en yokup.
    if (activeWork && Array.isArray(activeWork.participants)) {
      const open = activeWork.participants.filter(it => {
        const f = familyParts(it);
        return it && it.state !== 'last_work' && !it.ended_at && belongs(agent, f.persona, f.machine);
      }).sort((x, y) => (x.state === 'running' ? 0 : 1) - (y.state === 'running' ? 0 : 1)
        || (Number(y.work_progress_at) || 0) - (Number(x.work_progress_at) || 0));
      const m = open[0];
      if (m && (m.title || m.reference)) {
        const title = String(m.title || '').trim();
        const ref = String(m.reference || '').trim();
        return { text: truncate(ref && title && !title.includes(ref) ? ref + ' · ' + title : (title || ref)),
          kind: m.state === 'running' ? 'mision' : 'mision-sin-latido', source: 'active-work' };
      }
    }
    // 2) Presencia en modo trabajando, con foco o tarea.
    const rows = presence && Array.isArray(presence.presence)
      ? presence.presence.filter(r => r && belongs(agent, r.persona, r.machine)) : [];
    const working = rows.filter(r => r.mode === 'trabajando' && now - (Number(r.updated) || 0) <= FRESH_S
      && String(r.task || r.focus || '').trim())
      .sort((x, y) => (Number(y.updated) || 0) - (Number(x.updated) || 0))[0];
    if (working) return { text: truncate(String(working.task || working.focus).trim()), kind: 'trabajando', source: 'presence' };
    // 3) Encargo con latido «trabajando» (≤ 90 s).
    if (trabajando && Array.isArray(trabajando.items)) {
      const it = trabajando.items.filter(i => i && belongs(agent, i.persona, i.machine))
        .sort((x, y) => (Number(y.working_at) || 0) - (Number(x.working_at) || 0))[0];
      if (it) return { text: truncate(it.encargo ? 'Encargo #' + it.encargo + ' en curso' : 'trabajando (sin foco declarado)'),
        kind: 'trabajando', source: 'trabajando' };
    }
    // 4) Foco declarado hace ≤ 15 min (declaración reciente, aunque esté en pasivo).
    const declared = rows.filter(r => String(r.focus || r.task || '').trim()
      && now - (Number(r.declared_updated) || Number(r.updated) || 0) <= FRESH_S)
      .sort((x, y) => (Number(y.declared_updated) || Number(y.updated) || 0) - (Number(x.declared_updated) || Number(x.updated) || 0))[0];
    if (declared) return { text: truncate(String(declared.focus || declared.task).trim()), kind: 'foco', source: 'presence' };
    // Nada en curso. Si alguna fuente falló, no podemos afirmar «nada».
    if (!activeWork || !presence || !trabajando) return { text: TEXT.sinDatos, kind: 'sin-datos' };
    return { text: TEXT.nada, kind: 'nada' };
  }

  function statusesFor(gen, personas, sources, nowS) {
    const map = AGENTS[gen] || {};
    return personas.map(persona => {
      const agent = Object.prototype.hasOwnProperty.call(map, persona) ? map[persona] : null;
      const r = resolveAgent(agent, sources, nowS);
      return Object.assign({ persona, agent }, r, { text: r.text || TEXT.sinDatos });
    });
  }

  function getJSON(url, fetchImpl) {
    const f = fetchImpl || (root.fetch && root.fetch.bind(root));
    if (!f) return Promise.resolve(null);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const deadline = new Promise(res => { timer = setTimeout(() => { if (ctl) ctl.abort(); res(null); }, FETCH_TIMEOUT_MS); });
    let req;
    try { req = Promise.resolve(f(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })); }
    catch (_) { req = Promise.resolve(null); }
    return Promise.race([
      req.then(r => r && r.ok ? r.json() : null)
        .then(d => d && d.ok !== false ? d : null)
        .catch(() => null),
      deadline
    ]).finally(() => clearTimeout(timer));
  }
  /* Lectura compartida: si se acaba de leer (≤ 30 s) o está en vuelo, se reutiliza.
     prefetch() la arranca mientras se teclea «to…» / «al…» para que el bocadillo no espere. */
  let inflight = null, inflightAt = 0;
  function loadSources(fetchImpl) {
    if (inflight && Date.now() - inflightAt <= REUSE_MS) return inflight;
    inflightAt = Date.now();
    const p = fetchSources(fetchImpl).then(s => {
      if (!s.activeWork && !s.trabajando && !s.presence && inflight === p) inflight = null; // no cachear un fallo total
      return s;
    });
    inflight = p;
    return p;
  }
  function prefetch(text) {
    const t = String(text == null ? '' : text).trim().toLowerCase();
    if (t.length >= 2 && ('todo'.startsWith(t) || 'all'.startsWith(t))) loadSources();
  }
  function fetchSources(fetchImpl) {
    return Promise.all([
      getJSON(YK + '/highscore/active-work', fetchImpl),
      getJSON(TG + '/api/presence/trabajando', fetchImpl),
      getJSON(TG + '/api/presence', fetchImpl)
    ]).then(([activeWork, trabajando, presence]) => ({ activeWork, trabajando, presence }));
  }

  /* ── Vista: una capa de bocadillos sobre la imagen del Consejo ── */
  let layer = null, timer = null, lastSources = null, lastAt = 0, seq = 0, outside = null, keyH = null;
  let current = null; // { gen, plates }

  function close() {
    seq += 1;
    if (timer) { clearTimeout(timer); timer = null; }
    if (outside) { root.document.removeEventListener('click', outside, true); outside = null; }
    if (keyH) { root.document.removeEventListener('keydown', keyH); keyH = null; }
    if (layer) { layer.remove(); layer = null; }
    current = null;
  }
  const isOpen = () => !!layer;

  function render(gen, plates, statuses) {
    const doc = root.document;
    const scene = doc.querySelector('.council-image');
    if (!scene) return;
    if (!layer) {
      layer = doc.createElement('div');
      layer.className = 'todo-bocadillos';
      layer.setAttribute('role', 'status');
      layer.setAttribute('aria-live', 'polite');
      layer.setAttribute('aria-label', 'Qué hace cada consejero ahora mismo');
      scene.appendChild(layer);
    }
    layer.dataset.generation = gen;
    layer.replaceChildren();
    plates.forEach((p, i) => {
      const st = statuses[i] || { text: TEXT.sinDatos, kind: 'sin-datos' };
      const b = doc.createElement('div');
      b.className = 'todo-bocadillo todo-' + (st.kind || 'sin-datos') + (i % 2 ? ' todo-alto' : '');
      b.dataset.persona = p.persona;
      b.style.left = Math.min(94, Math.max(6, Number(p.x) || 50)) + '%';
      b.style.top = Math.max(3, (Number(p.y) || 30) - 1.5) + '%';
      const who = doc.createElement('span');
      who.className = 'todo-quien';
      const surname = p.persona.split(' ').slice(-1)[0];
      who.textContent = surname + (st.agent && key(st.agent) !== key(surname) ? ' · ' + st.agent : '');
      const txt = doc.createElement('span');
      txt.className = 'todo-texto';
      txt.textContent = st.text || TEXT.sinDatos;
      b.title = p.persona + (st.agent ? ' (' + st.agent + ')' : '') + ': ' + (st.text || TEXT.sinDatos)
        + (st.note ? ' · ' + st.note : '');
      b.append(who, txt);
      if (st.note) { const n = doc.createElement('span'); n.className = 'todo-nota'; n.textContent = st.note; b.append(n); }
      layer.appendChild(b);
    });
  }

  function show({ gen, plates, fetchImpl } = {}) {
    const doc = root.document;
    if (!doc || !Array.isArray(plates) || !plates.length) return Promise.resolve([]);
    close();
    const my = ++seq;
    current = { gen, plates };
    render(gen, plates, plates.map(() => ({ text: TEXT.cargando, kind: 'cargando' })));
    // Se cierran con un clic (en cualquier sitio) o solos a los 20 s.
    setTimeout(() => {
      if (my !== seq) return;
      // El toggle Leyendas/Coetáneos no cierra: repinta los bocadillos de los nuevos personajes.
      outside = e => {
        const t = e && e.target;
        if (t && t.closest && t.closest('[data-council-generation], #btn-gen')) return;
        close();
      };
      doc.addEventListener('click', outside, true);
      keyH = e => { if (e.key === 'Escape') close(); };
      doc.addEventListener('keydown', keyH);
    }, 250);
    // Los 20 s cuentan desde que se ven los datos, no desde el «mirando…».
    const armClose = () => { if (my !== seq) return; if (timer) clearTimeout(timer); timer = setTimeout(close, AUTO_CLOSE_MS); };
    timer = setTimeout(close, AUTO_CLOSE_MS + FETCH_TIMEOUT_MS + 1000);
    return (fetchImpl ? fetchSources(fetchImpl) : loadSources()).then(sources => {
      lastSources = sources; lastAt = Date.now();
      if (my !== seq || !current) return [];
      const statuses = statusesFor(current.gen, current.plates.map(p => p.persona), sources);
      render(current.gen, current.plates, statuses);
      armClose();
      return statuses;
    }).catch(() => {
      if (my !== seq || !current) return [];
      const statuses = current.plates.map(() => ({ text: TEXT.sinDatos, kind: 'sin-datos' }));
      render(current.gen, current.plates, statuses);
      armClose();
      return statuses;
    });
  }

  /* Leyendas ↔ Coetáneos con los bocadillos abiertos: cambian los personajes, así que
     se repinta con los datos recién leídos (o se vuelve a leer si tienen > 60 s). */
  function setGeneration(gen, plates) {
    if (!layer || !current) return;
    if (!lastSources || Date.now() - lastAt > 60000) { show({ gen, plates }); return; }
    current = { gen, plates };
    if (timer) clearTimeout(timer);
    timer = setTimeout(close, AUTO_CLOSE_MS);
    render(gen, plates, statusesFor(gen, plates.map(p => p.persona), lastSources));
  }

  // Precarga mientras se escribe «to…» / «al…» con Preguntar activo.
  if (root.document && root.document.addEventListener) {
    const wire = () => {
      const input = root.document.getElementById('action-input');
      if (!input) return;
      input.addEventListener('input', () => {
        if (root.document.querySelector('.verb-btn.active[data-verb="preguntar"]')) prefetch(input.value);
      });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', wire); else wire();
  }

  root.CouncilTodo = Object.freeze({
    isTodoCommand, truncate, resolveAgent, statusesFor, fetchSources, prefetch, show, close, isOpen,
    setGeneration, AGENTS, TEXT, MAX_CHARS, AUTO_CLOSE_MS
  });
})(typeof window !== 'undefined' ? window : globalThis);
