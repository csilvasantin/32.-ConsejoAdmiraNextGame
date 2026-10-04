/* ¿En qué está cada consejero AHORA? (Carlos, 4-oct-2026)
 *  · Hover sobre un consejero (Leyendas y Coetáneos): ficha con el encargo en curso
 *    descrito en palabras (el número, como mucho, entre paréntesis), estado
 *    (working/ack/blocked/idle), desde cuándo, deepagent y máquina, y último latido.
 *  · DEBATIR: tablero vivo con todos los consejeros de la mesa.
 * Datos reales de https://mcp.admira.live/consejo/estado (el worker admira-live-mcp junta
 * la presencia y las bandejas públicas de bot.yokup.com, las mismas que agentes_vivos y
 * encargos_listar). Si no hay dato: «sin datos». Nunca se inventa nada.
 * Script clásico; también se importa desde node:test (council-estado.test.mjs). */
(function (root) {
  'use strict';

  const ENDPOINT = (root && root.ADMIRA_ESTADO_URL) || 'https://mcp.admira.live/consejo/estado';
  const REUSE_MS = 25000;          // el hover no vuelve a pedir si el dato tiene < 25 s
  const BOARD_REFRESH_MS = 30000;  // tablero abierto y pestaña visible: refresco cada 30 s
  const TIMEOUT_MS = 12000;
  const SIN = 'sin datos';
  const ESTADOS = Object.freeze({
    working: { txt: 'trabajando', cls: 'working' },
    ack: { txt: 'aceptado, por empezar', cls: 'ack' },
    blocked: { txt: 'bloqueado', cls: 'blocked' },
    idle: { txt: 'libre', cls: 'idle' }
  });

  const key = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  /* ── Formato (Europe/Madrid) ─────────────────────────────────────────────── */
  function hora(s, ahoraMs) {
    if (!Number.isFinite(Number(s)) || !Number(s)) return '';
    const d = new Date(Number(s) * 1000);
    const opts = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' };
    const hoy = new Date(ahoraMs || Date.now()).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    const dia = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    if (dia !== hoy) opts.day = 'numeric', opts.month = 'short';
    return d.toLocaleString('es-ES', opts);
  }
  function hace(s, ahoraMs) {
    if (!Number.isFinite(Number(s)) || !Number(s)) return SIN;
    const seg = Math.max(0, Math.floor((ahoraMs || Date.now()) / 1000) - Number(s));
    const rel = seg < 60 ? `hace ${seg} s` : seg < 3600 ? `hace ${Math.round(seg / 60)} min`
      : seg < 172800 ? `hace ${Math.round(seg / 3600)} h` : `hace ${Math.round(seg / 86400)} d`;
    return `${rel} (${hora(s, ahoraMs)})`;
  }
  /* El encargo en palabras; el número solo entre paréntesis. */
  function encargoEnPalabras(e) {
    if (!e) return null;
    const ref = e.etiqueta || (e.numero ? '#' + e.numero : '');
    const t = e.titulo || 'encargo sin descripción legible';
    return ref ? `${t} (${ref})` : t;
  }
  function estadoTxt(st) {
    const e = st && ESTADOS[st];
    return e ? `${e.txt} (${st})` : SIN;
  }
  function agentesTxt(s) {
    if (!s || !s.enlazado) return 'sin agente enlazado';
    const a = (s.agentes || []).map(x => {
      const quien = x.tipo === 'silla' ? 'silla ' + (x.etiqueta || x.persona) : (x.etiqueta || x.persona);
      const extra = [x.maquina, x.runtime].filter(Boolean).join(' · ');
      return quien + (extra ? ' · ' + extra : '') + (x.vivo === true ? ' · en línea' : x.vivo === false ? ' · sin señal' : '');
    });
    if (s.maquina_silla) a.push('Mac de la silla: ' + s.maquina_silla);
    return a.join(' | ') || SIN;
  }

  /* Ficha de una silla, en líneas [etiqueta, valor]. Pura: se prueba en node. */
  function ficha(s, ahoraMs) {
    if (!s) return { estado: null, filas: [['Ahora', SIN], ['Estado', SIN], ['Desde', SIN], ['Deepagent · máquina', SIN], ['Último latido', SIN]] };
    if (!s.enlazado) return { estado: null, filas: [['Ahora', 'sin agente enlazado: sin datos de trabajo'], ['Estado', SIN], ['Desde', SIN], ['Deepagent · máquina', 'sin agente enlazado'], ['Último latido', SIN]] };
    let ahora;
    if (s.encargo) ahora = encargoEnPalabras(s.encargo);
    else if (s.estado === 'working') ahora = 'trabajando según su latido, sin encargo en curso en la bandeja';
    else if (s.estado) ahora = 'nada en curso';
    else ahora = SIN;
    const filas = [['Ahora', ahora], ['Estado', estadoTxt(s.estado)],
      ['Desde', s.encargo ? hace(s.encargo.desde, ahoraMs) : SIN]];
    if (s.encargo && s.encargo.de) filas.push(['Encargado por', s.encargo.de]);
    const foco = (s.agentes || []).map(a => a.foco).find(Boolean);
    if (foco) filas.push(['Foco del latido', foco]);
    if (s.cola) {
      const c = s.cola, partes = [];
      if (c.pending) partes.push(c.pending + ' pendientes');
      if (c.ack) partes.push(c.ack + ' aceptados');
      if (c.in_progress) partes.push(c.in_progress + ' en curso');
      if (c.blocked) partes.push(c.blocked + ' bloqueados');
      filas.push(['Bandeja', partes.join(' · ') || 'vacía']);
      if (!s.encargo && s.ultimo_pendiente) filas.push(['Siguiente en cola', encargoEnPalabras(s.ultimo_pendiente)]);
    }
    filas.push(['Deepagent · máquina', agentesTxt(s)]);
    filas.push(['Último latido', hace(s.ultimo_latido, ahoraMs)]);
    return { estado: s.estado, filas };
  }

  /* ── Datos ───────────────────────────────────────────────────────────────── */
  let datos = null, datosAt = 0, enVuelo = null, ultimoError = null;
  function cargar(force, fetchImpl) {
    const f = fetchImpl || (root.fetch && root.fetch.bind(root));
    if (!force && datos && Date.now() - datosAt < REUSE_MS) return Promise.resolve(datos);
    if (enVuelo) return enVuelo;
    if (!f) return Promise.reject(new Error('sin fetch'));
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    enVuelo = f(ENDPOINT, { cache: 'no-store', signal: ctl ? ctl.signal : undefined, headers: { accept: 'application/json' } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { if (!d || !d.ok || !d.mesa) throw new Error('respuesta sin mesa'); datos = d; datosAt = Date.now(); ultimoError = null; return d; })
      .catch(e => { ultimoError = String(e && e.message || e); throw e; })
      .finally(() => { if (t) clearTimeout(t); enVuelo = null; });
    return enVuelo;
  }
  function silla(d, persona) {
    if (!d || !d.mesa) return null;
    const k = key(persona);
    for (const gen of Object.keys(d.mesa)) {
      const s = (d.mesa[gen] || []).find(x => key(x.persona) === k);
      if (s) return s;
    }
    return null;
  }

  /* ── Estilos (una sola vez) ──────────────────────────────────────────────── */
  const CSS = `
.estado-card{position:fixed;z-index:9000;max-width:360px;min-width:250px;background:#140e06;color:#f3e6c4;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;padding:8px 10px;font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none}
.estado-card h4{margin:0 0 4px;font:bold 12px/1.2 "Press Start 2P",monospace;color:#ffd75e;letter-spacing:.5px}
.estado-card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 8px}
.estado-card dt{color:#c9a227;white-space:nowrap}.estado-card dd{margin:0;word-break:break-word}
.estado-pill{display:inline-block;padding:0 5px;border:1px solid currentColor;border-radius:2px;font-weight:600}
.estado-pill.working{color:#7ee787}.estado-pill.ack{color:#79c0ff}.estado-pill.blocked{color:#ff7b72}.estado-pill.idle{color:#c9c2b0}.estado-pill.nodata{color:#8b8170}
.estado-board{position:absolute;inset:3%;z-index:60;background:rgba(20,14,6,.96);color:#f3e6c4;border:3px solid #c9a227;box-shadow:6px 6px 0 #000;display:flex;flex-direction:column;font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif}
.estado-board header{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:2px solid #5a4316;background:#2a1d0b}
.estado-board header b{font:bold 12px/1.2 "Press Start 2P",monospace;color:#ffd75e;flex:1}
.estado-board header button{background:#3b2a10;color:#f3e6c4;border:2px solid #c9a227;font:11px system-ui,sans-serif;padding:2px 8px;cursor:pointer}
.estado-board .estado-body{overflow:auto;padding:6px 10px;flex:1}
.estado-board h5{margin:8px 0 4px}
.estado-board .estado-grupo{all:unset;cursor:pointer;color:#c9a227;font:bold 11px/1.2 "Press Start 2P",monospace;padding:4px 2px;display:block;width:100%}
.estado-board .estado-grupo:hover,.estado-board .estado-grupo:focus-visible{color:#ffd75e;outline:1px dashed #5a4316}
.estado-board table{width:100%;border-collapse:collapse}
.estado-board th{text-align:left;color:#c9a227;font-weight:600;border-bottom:1px solid #5a4316;padding:3px 4px;white-space:nowrap}
.estado-board td{border-bottom:1px solid #2f2410;padding:4px;vertical-align:top}
.estado-board td.quien{white-space:nowrap;font-weight:600}.estado-board td small{color:#b9ab8a;font-weight:400}
.estado-board footer{padding:4px 10px;border-top:1px solid #5a4316;color:#b9ab8a;font-size:11px}`;
  function estilos(doc) {
    if (doc.getElementById('estado-css')) return;
    const st = doc.createElement('style'); st.id = 'estado-css'; st.textContent = CSS; doc.head.appendChild(st);
  }
  function pill(doc, st) {
    const p = doc.createElement('span');
    p.className = 'estado-pill ' + (ESTADOS[st] ? ESTADOS[st].cls : 'nodata');
    p.textContent = estadoTxt(st);
    return p;
  }

  /* ── Ficha al pasar el ratón ─────────────────────────────────────────────── */
  let card = null, cardPersona = null, cardAnchor = null, hideT = null;
  function pintarCard(doc, persona) {
    if (!card || cardPersona !== persona) return;
    const s = silla(datos, persona);
    const f = datos ? ficha(s, Date.now()) : null;
    card.replaceChildren();
    const h = doc.createElement('h4');
    const ag = s && s.agentes && s.agentes[0] ? s.agentes[0].persona : '';
    h.textContent = persona + (ag && key(ag) !== key(persona.split(' ').slice(-1)[0]) ? ' · ' + ag : '');
    card.appendChild(h);
    const dl = doc.createElement('dl');
    const filas = f ? f.filas : [['Ahora', enVuelo ? 'mirando…' : SIN + (ultimoError ? ' (no responde el MCP)' : '')]];
    for (const [k, v] of filas) {
      const dt = doc.createElement('dt'); dt.textContent = k;
      const dd = doc.createElement('dd');
      if (k === 'Estado' && f) dd.appendChild(pill(doc, f.estado)); else dd.textContent = v;
      dl.append(dt, dd);
    }
    card.appendChild(dl);
    colocar(doc);
  }
  function colocar(doc) {
    if (!card || !cardAnchor) return;
    const r = cardAnchor.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(6, Math.min(vw - w - 6, left));
    let top = r.top - h - 8;
    if (top < 6) top = Math.min(vh - h - 6, r.bottom + 8);
    card.style.left = left + 'px'; card.style.top = Math.max(6, top) + 'px';
  }
  function mostrarFicha(el) {
    const doc = root.document; if (!doc || !el) return;
    const persona = el.getAttribute('data-persona'); if (!persona) return;
    estilos(doc);
    clearTimeout(hideT);
    if (el.title) { el.dataset.estadoTitle = el.title; el.removeAttribute('title'); }
    if (!card) { card = doc.createElement('div'); card.className = 'estado-card'; card.setAttribute('role', 'tooltip'); doc.body.appendChild(card); }
    card.hidden = false; cardPersona = persona; cardAnchor = el;
    pintarCard(doc, persona);
    cargar(false).then(() => pintarCard(doc, persona), () => pintarCard(doc, persona));
  }
  function ocultarFicha(el) {
    if (el && el.dataset && el.dataset.estadoTitle) { el.title = el.dataset.estadoTitle; delete el.dataset.estadoTitle; }
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (card) card.hidden = true; cardPersona = null; cardAnchor = null; }, 120);
  }
  function wireHover() {
    const doc = root.document; if (!doc) return;
    ['nameplates', 'body-hotspots'].forEach(id => {
      const c = doc.getElementById(id);
      if (!c || c._estadoWired) return;
      c._estadoWired = true;
      c.addEventListener('mouseover', e => {
        const el = e.target.closest('[data-persona]');
        if (el && el !== cardAnchor) mostrarFicha(el); else if (el) clearTimeout(hideT);
      });
      c.addEventListener('mouseout', e => {
        const el = e.target.closest('[data-persona]');
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        ocultarFicha(el);
      });
    });
  }

  /* ── Tablero de DEBATIR ──────────────────────────────────────────────────── */
  /* Ocupado = working, ack o blocked; libre y «sin datos» no cuentan (Carlos, 4-oct-2026). */
  const OCUPADO = ['working', 'ack', 'blocked'];
  function ocupados(sillas) {
    const l = Array.isArray(sillas) ? sillas : [];
    return { n: l.filter(s => s && OCUPADO.includes(s.estado)).length, total: l.length };
  }
  /* Grupos plegados por defecto; lo abierto se recuerda en localStorage. */
  const LS_ABIERTOS = 'admira:debatir-grupos-abiertos';
  function abiertos() {
    try { const o = JSON.parse(root.localStorage.getItem(LS_ABIERTOS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  function alternarGrupo(gen) {
    const o = abiertos(); o[gen] = !o[gen];
    try { root.localStorage.setItem(LS_ABIERTOS, JSON.stringify(o)); } catch (e) {}
    return o[gen];
  }
  let board = null, boardTimer = null, keyH = null;
  const GEN_NOMBRE = { leyendas: 'Leyendas', coetaneos: 'Coetáneos' };
  function pintarBoard() {
    const doc = root.document; if (!board || !doc) return;
    const body = board.querySelector('.estado-body');
    const foot = board.querySelector('footer');
    body.replaceChildren();
    if (!datos) {
      const p = doc.createElement('p');
      p.textContent = enVuelo ? 'Mirando qué hace cada consejero…' : SIN + (ultimoError ? ' — el MCP de admira.live no responde (' + ultimoError + ')' : '');
      body.appendChild(p); foot.textContent = 'Fuente: ' + ENDPOINT; return;
    }
    const ahoraMs = Date.now();
    const actual = String(root.currentGenPublic || 'leyendas');
    const gens = Object.keys(datos.mesa).sort((a, b) => (b === actual) - (a === actual));
    for (const gen of gens) {
      const abierto = !!abiertos()[gen];
      const c = ocupados(datos.mesa[gen]);
      const h = doc.createElement('h5');
      const bt = doc.createElement('button'); bt.type = 'button'; bt.className = 'estado-grupo'; bt.dataset.gen = gen;
      bt.setAttribute('aria-expanded', String(abierto));
      bt.title = (abierto ? 'Plegar' : 'Desplegar') + ' · ocupados = trabajando, aceptado o bloqueado';
      bt.textContent = (abierto ? '▾ ' : '▸ ') + (GEN_NOMBRE[gen] || gen) + ' (' + c.n + ' de ' + c.total + ')';
      bt.onclick = () => { alternarGrupo(gen); pintarBoard(); };
      h.appendChild(bt); body.appendChild(h);
      if (!abierto) continue;
      const tb = doc.createElement('table');
      tb.innerHTML = '<thead><tr><th>Consejero</th><th>Estado</th><th>En qué está ahora</th><th>Desde</th><th>Deepagent · máquina</th><th>Último latido</th></tr></thead>';
      const tbody = doc.createElement('tbody');
      for (const s of datos.mesa[gen] || []) {
        const f = ficha(s, ahoraMs);
        const get = k => (f.filas.find(x => x[0] === k) || [k, SIN])[1];
        const tr = doc.createElement('tr'); tr.dataset.persona = s.persona;
        const q = doc.createElement('td'); q.className = 'quien'; q.textContent = s.persona + ' ';
        const sm = doc.createElement('small'); sm.textContent = s.rol || ''; q.appendChild(sm);
        const e = doc.createElement('td'); e.appendChild(pill(doc, s.estado));
        const a = doc.createElement('td'); a.textContent = get('Ahora');
        const cola = get('Bandeja'); if (cola && cola !== SIN) { const c = doc.createElement('small'); c.textContent = ' · bandeja: ' + cola; a.appendChild(c); }
        const d = doc.createElement('td'); d.textContent = get('Desde');
        const m = doc.createElement('td'); m.textContent = get('Deepagent · máquina');
        const l = doc.createElement('td'); l.textContent = get('Último latido');
        tr.append(q, e, a, d, m, l); tbody.appendChild(tr);
      }
      tb.appendChild(tbody); body.appendChild(tb);
    }
    foot.textContent = 'Datos reales del MCP de admira.live (' + ENDPOINT.replace(/^https?:\/\//, '') + ': presencia y bandejas de bot.yokup.com) · leído ' +
      hora(datos.generado, ahoraMs) + ' · se refresca cada 30 s · «sin datos» = la fuente no lo tiene.';
  }
  function refrescarBoard(force) {
    pintarBoard();
    return cargar(force).then(pintarBoard, pintarBoard);
  }
  function openBoard(opts = {}) {
    const doc = root.document; if (!doc) return null;
    estilos(doc);
    const scene = doc.querySelector('.council-image') || doc.body;
    if (!board) {
      board = doc.createElement('section');
      board.className = 'estado-board'; board.setAttribute('aria-label', 'Qué está haciendo cada consejero');
      const hd = doc.createElement('header');
      const t = doc.createElement('b'); t.textContent = '🗣 Debatir · en qué está cada consejero ahora';
      const up = doc.createElement('button'); up.type = 'button'; up.textContent = '↻ Actualizar'; up.onclick = () => refrescarBoard(true);
      const deb = doc.createElement('button'); deb.type = 'button'; deb.textContent = 'Debatir un tema…';
      deb.title = 'Proponer un tema al Consejo (lo de antes: cada consejero responde en su chat de GrokBot)';
      deb.onclick = () => { if (typeof opts.onDebate === 'function') opts.onDebate(); else if (typeof root.lanzarDebateTema === 'function') root.lanzarDebateTema(); };
      const x = doc.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Cerrar (Esc)'; x.onclick = closeBoard;
      hd.append(t, up, deb, x);
      const body = doc.createElement('div'); body.className = 'estado-body';
      const ft = doc.createElement('footer');
      board.append(hd, body, ft);
      keyH = e => { if (e.key === 'Escape') closeBoard(); };
      doc.addEventListener('keydown', keyH);
    }
    if (!board.isConnected) scene.appendChild(board);
    clearInterval(boardTimer);
    boardTimer = setInterval(() => { if (!doc.hidden) refrescarBoard(true); }, BOARD_REFRESH_MS);
    refrescarBoard(true);
    return board;
  }
  function closeBoard() {
    clearInterval(boardTimer); boardTimer = null;
    if (keyH && root.document) root.document.removeEventListener('keydown', keyH);
    keyH = null;
    if (board) board.remove();
    board = null;
  }
  const isBoardOpen = () => !!(board && board.isConnected);

  if (root.document && root.document.addEventListener) {
    const doc = root.document;
    const go = () => {
      wireHover();
      // Las placas y los cuerpos se repintan al cambiar de generación: el contenedor es el mismo,
      // así que con cablear una vez basta; por si llega tarde, se reintenta al primer movimiento.
      doc.addEventListener('mousemove', function once() { wireHover(); doc.removeEventListener('mousemove', once); });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go); else go();
  }

  root.CouncilEstado = Object.freeze({ ENDPOINT, ocupados, abiertos, alternarGrupo, cargar, silla, ficha, encargoEnPalabras, estadoTxt, hace, openBoard, closeBoard, isBoardOpen, mostrarFicha, ocultarFicha });
})(typeof window !== 'undefined' ? window : globalThis);
