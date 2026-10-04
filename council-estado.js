/* ¿En qué está cada consejero AHORA? (Carlos, 4-oct-2026)
 *  · Hover sobre un consejero (Leyendas y Coetáneos): ficha con el encargo en curso
 *    descrito en palabras (el número, como mucho, entre paréntesis), estado
 *    (working/idle→«sin actividad»; ack/blocked legacy), desde cuándo, deepagent y máquina, y último latido.
 *    Honestidad #5085: working solo si MCP dice working (latido trabajando ≤10 min).
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
  const SONDEO_MS = 30000;         // sondeo de la mesa (pestaña visible) para el parpadeo de cambios
  const SIN = 'sin datos';
  const ESTADOS = Object.freeze({
    working: { txt: 'trabajando', cls: 'working' },
    ack: { txt: 'aceptado, por empezar', cls: 'ack' },
    blocked: { txt: 'bloqueado', cls: 'blocked' },
    idle: { txt: 'sin actividad', cls: 'idle' }
  });
  /* Color del estado en la píldora de la ficha y en el parpadeo al cambiar estado,
   * misión o foco. Paleta del «halo de colores» (encargo #4678): trabajando = verde;
   * esperando = amarillo (aceptado/ack y bloqueado); libre y sin datos = blanco.
   * El brillo al pasar el ratón es el color de la silla (--silla-c), fino y
   * difuminado, sin relleno (encargo #5087). */
  const COLORES = Object.freeze({ working: '#3ddc84', ack: '#ffd60a', blocked: '#ffd60a', idle: '#ffffff', nodata: '#ffffff' });
  /* Clase de color de una silla (o de un estado suelto): 'working' | 'ack' | 'blocked' | 'idle' | 'nodata'. */
  function claseEstado(s) {
    const st = s && typeof s === 'object' ? (s.enlazado ? s.estado : null) : s;
    return ESTADOS[st] ? ESTADOS[st].cls : 'nodata';
  }

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

  /* «Desde» (Carlos, 4-oct-2026 19:15): cuándo entró en su estado actual. El feed trae
   * s.desde (cambio de estado real: fin del último encargo o trabajando:false si está libre,
   * inicio de la racha si trabaja, acuse si aceptado). Si el feed es antiguo, el encargo.
   * «sin datos» solo cuando de verdad no hay historial. */
  function desdeSeg(s) {
    if (!s) return null;
    if (Number(s.desde) > 0) return Number(s.desde);
    return (s.encargo && Number(s.encargo.desde)) || null;
  }
  function desdeTxt(s, ahoraMs) { return hace(desdeSeg(s), ahoraMs); }

  /* Ficha de una silla, en líneas [etiqueta, valor]. Pura: se prueba en node. */
  function ficha(s, ahoraMs) {
    if (!s) return { estado: null, proyecto: null, filas: [['Misión', SIN], ['Estado', SIN], ['Desde', SIN], ['Deepagent · máquina', SIN], ['Último latido', SIN]] };
    if (!s.enlazado) return { estado: null, proyecto: null, filas: [['Misión', 'sin agente enlazado: sin datos de trabajo'], ['Estado', SIN], ['Desde', SIN], ['Deepagent · máquina', 'sin agente enlazado'], ['Último latido', SIN]] };
    /* Misión (Carlos, 4-oct-2026): lo que está haciendo. Encargo en curso si lo hay; si no,
     * la tarea o el foco que declara su latido (yokup_presencia), nunca un texto genérico. */
    const latidoTxt = k => (s.agentes || []).map(a => a && a[k]).find(Boolean) || null;
    const tarea = latidoTxt('tarea'), foco = latidoTxt('foco');
    let mision;
    if (s.encargo) mision = encargoEnPalabras(s.encargo);
    else if (tarea || foco) mision = tarea || foco;
    else if (s.estado === 'working') mision = 'trabajando según su latido, sin misión declarada';
    else if (s.estado) mision = 'nada en curso';
    else mision = SIN;
    const filas = [['Misión', mision], ['Estado', estadoTxt(s.estado)],
      ['Desde', desdeTxt(s, ahoraMs)]];
    if (s.encargo && s.encargo.de) filas.push(['Encargado por', s.encargo.de]);
    if (foco && foco !== mision) filas.push(['Foco del latido', foco]);
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
    return { estado: s.estado, proyecto: s.proyecto || latidoTxt('proyecto'), filas };
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
      .then(d => { if (!d || !d.ok || !d.mesa) throw new Error('respuesta sin mesa'); datos = d; datosAt = Date.now(); ultimoError = null; avisarCambios(d); return d; })
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

  /* ── Parpadeo al actualizarse (Carlos, 4-oct-2026: «cuando haya un cambio tiene que
   *    parpadear el color de la selección del consejero para saber que se ha actualizado»).
   *  Huella de cada silla = estado + misión + foco. En cada lectura se compara con la
   *  anterior; las que cambian parpadean en su color de estado (3 pulsos en ~3 s, aunque no
   *  estén seleccionadas). La primera carga solo guarda la huella: no parpadea nada. */
  function huella(s) {
    if (!s) return 'nodata';
    const lat = k => (s.agentes || []).map(a => a && a[k]).find(Boolean) || '';
    const e = s.encargo ? [s.encargo.numero || '', s.encargo.etiqueta || '', s.encargo.titulo || '', s.encargo.estado || ''].join('~') : '';
    return [claseEstado(s), e, lat('tarea'), lat('foco')].join('|');
  }
  function huellas(d) {
    const m = {};
    if (d && d.mesa) for (const gen of Object.keys(d.mesa)) for (const s of d.mesa[gen] || []) if (s && s.persona) m[key(s.persona)] = huella(s);
    return m;
  }
  /* Pura: personas (clave normalizada) cuya huella cambió. Sin huella previa → ninguna. */
  function cambiados(antes, ahora) {
    if (!antes) return [];
    return Object.keys(ahora || {}).filter(k => k in antes && antes[k] !== ahora[k]);
  }
  let huellaPrev = null;
  const PARPADEO_MS = 3400;
  function parpadear(personas, doc) {
    doc = doc || root.document;
    if (!doc || !personas || !personas.length) return 0;
    const c = doc.getElementById('body-hotspots'); if (!c) return 0;
    pintarContornos(doc);
    const set = new Set(personas.map(key)); let n = 0;
    c.querySelectorAll('[data-persona]').forEach(el => {
      if (!set.has(key(el.getAttribute('data-persona')))) return;
      el.classList.remove('estado-parpadeo');
      void (el.getBoundingClientRect && el.getBoundingClientRect());   // reinicia la animación
      el.classList.add('estado-parpadeo'); n++;
      clearTimeout(el._parpadeoT);
      el._parpadeoT = setTimeout(() => el.classList.remove('estado-parpadeo'), PARPADEO_MS);
    });
    return n;
  }
  function avisarCambios(d) {
    const ahora = huellas(d);
    const ch = cambiados(huellaPrev, ahora);
    huellaPrev = ahora;
    if (ch.length && root.document) parpadear(ch);
    return ch;
  }

  /* ── Estilos (una sola vez) ──────────────────────────────────────────────── */
  const CSS = `
.estado-card{position:fixed;z-index:9000;max-width:360px;min-width:250px;background:#140e06;color:#f3e6c4;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;padding:8px 10px;font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none}
.estado-card h4{margin:0 0 4px;font:bold 12px/1.2 "Press Start 2P",monospace;color:#ffd75e;letter-spacing:.5px}
.estado-card .estado-proyecto{margin:0 0 6px;padding:2px 6px;display:inline-block;background:#2a1d0b;border:1px solid #c9a227;color:#7ee7ff;font:bold 11px/1.3 "Press Start 2P",monospace;letter-spacing:.3px;word-break:break-word}
.estado-card .estado-proyecto.sin{color:#8b8170;font:italic 11px/1.3 system-ui,-apple-system,Segoe UI,sans-serif}
.estado-card .estado-proyecto .etq{color:#c9a227;margin-right:6px;font:bold 11px/1.3 "Press Start 2P",monospace;font-style:normal}
.estado-card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 8px}
.estado-card dt{color:#c9a227;white-space:nowrap}.estado-card dd{margin:0;word-break:break-word}
.estado-pill{display:inline-block;padding:0 5px;border:1px solid currentColor;border-radius:2px;font-weight:600}
.estado-pill.working{color:${COLORES.working}}.estado-pill.ack{color:${COLORES.ack}}.estado-pill.blocked{color:${COLORES.blocked}}.estado-pill.idle{color:${COLORES.idle}}.estado-pill.nodata{color:${COLORES.nodata}}
#body-hotspots .body-hotspot[data-estado-color=working]{--estado-c:${COLORES.working}}#body-hotspots .body-hotspot[data-estado-color=ack]{--estado-c:${COLORES.ack}}#body-hotspots .body-hotspot[data-estado-color=blocked]{--estado-c:${COLORES.blocked}}#body-hotspots .body-hotspot[data-estado-color=idle]{--estado-c:${COLORES.idle}}#body-hotspots .body-hotspot[data-estado-color=nodata]{--estado-c:${COLORES.nodata}}
#body-hotspots .body-hotspot[data-role=CEO],#body-hotspots .body-hotspot[data-role=CTO],#body-hotspots .body-hotspot[data-role=COO],#body-hotspots .body-hotspot[data-role=CFO]{--silla-c:#e74c3c}#body-hotspots .body-hotspot[data-role=CCO],#body-hotspots .body-hotspot[data-role=CDO],#body-hotspots .body-hotspot[data-role=CXO],#body-hotspots .body-hotspot[data-role=CSO]{--silla-c:#3498db}
#body-hotspots path.body-hotspot[data-estado-color]:hover,#body-hotspots path.body-hotspot[data-estado-color].selected,#body-hotspots path.body-hotspot[data-estado-color].selected:hover{fill:transparent;stroke:color-mix(in srgb,var(--silla-c,#c9a27a) 42%,transparent);stroke-width:1.5;filter:drop-shadow(0 0 3px var(--silla-c,#c9a27a)) drop-shadow(0 0 12px color-mix(in srgb,var(--silla-c,#c9a27a) 62%,transparent))}
#body-hotspots div.body-hotspot[data-estado-color]:hover,#body-hotspots div.body-hotspot[data-estado-color].selected{background:transparent;outline:none;box-shadow:0 0 0 1px color-mix(in srgb,var(--silla-c,#c9a27a) 35%,transparent),0 0 14px var(--silla-c,#c9a27a)}
@keyframes estado-parpadeo{0%,100%{fill:transparent;stroke:transparent;filter:none}45%,60%{fill:color-mix(in srgb,var(--estado-c,#fff) 42%,transparent);stroke:var(--estado-c,#fff);filter:drop-shadow(0 0 10px var(--estado-c,#fff))}}
@keyframes estado-parpadeo-caja{0%,100%{background:transparent;outline:2px solid transparent;box-shadow:none}45%,60%{background:color-mix(in srgb,var(--estado-c,#fff) 42%,transparent);outline:2px solid var(--estado-c,#fff);box-shadow:0 0 12px var(--estado-c,#fff)}}
@keyframes estado-destello{0%,100%{fill:transparent;stroke:transparent;filter:none}30%{fill:color-mix(in srgb,var(--estado-c,#fff) 24%,transparent);stroke:var(--estado-c,#fff);filter:drop-shadow(0 0 5px var(--estado-c,#fff))}}
@keyframes estado-destello-caja{0%,100%{background:transparent;outline:2px solid transparent;box-shadow:none}30%{background:color-mix(in srgb,var(--estado-c,#fff) 24%,transparent);outline:2px solid var(--estado-c,#fff);box-shadow:0 0 6px var(--estado-c,#fff)}}
#body-hotspots path.body-hotspot.estado-parpadeo{animation:estado-parpadeo 1s ease-in-out 3}
#body-hotspots div.body-hotspot.estado-parpadeo{animation:estado-parpadeo-caja 1s ease-in-out 3}
@media (prefers-reduced-motion:reduce){#body-hotspots path.body-hotspot.estado-parpadeo{animation:estado-destello 1.6s ease-out 1}#body-hotspots div.body-hotspot.estado-parpadeo{animation:estado-destello-caja 1.6s ease-out 1}}
.estado-board{position:absolute;inset:3%;z-index:60;background:rgba(20,14,6,.96);color:#f3e6c4;border:3px solid #c9a227;box-shadow:6px 6px 0 #000;display:flex;flex-direction:column;font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif}
.estado-board header{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:2px solid #5a4316;background:#2a1d0b}
.estado-board header b{font:bold 12px/1.2 "Press Start 2P",monospace;color:#ffd75e;flex:1}
.estado-board header button{background:#3b2a10;color:#f3e6c4;border:2px solid #c9a227;font:11px system-ui,sans-serif;padding:2px 8px;cursor:pointer}
.estado-board .estado-body{overflow:auto;padding:6px 10px;flex:1}
.estado-board h5{margin:8px 0 4px}
.estado-board .estado-grupo{all:unset;cursor:pointer;color:#c9a227;font:bold 11px/1.2 "Press Start 2P",monospace;padding:4px 2px;display:block;width:100%}
.estado-board .estado-grupo:hover,.estado-board .estado-grupo:focus-visible{color:#ffd75e;outline:1px dashed #5a4316}
.estado-board table.estado-hoja{table-layout:fixed;border-collapse:separate;border-spacing:0;border-top:1px solid #8a6a22;border-left:1px solid #8a6a22;margin-bottom:6px}
.estado-hoja th,.estado-hoja td{border-right:1px solid #5a4316;border-bottom:1px solid #5a4316;padding:0;text-align:left;vertical-align:middle;overflow:hidden}
.estado-hoja th{position:sticky;top:0;z-index:2;background:#3b2a10;color:#ffd75e;font-weight:600;cursor:pointer;user-select:none;border-bottom:2px solid #c9a227;border-right-color:#8a6a22}
.estado-hoja th:hover{background:#4a3614}
.estado-hoja .th-txt,.estado-hoja .celda{display:block;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.estado-hoja .th-txt{padding-right:10px}
.estado-hoja tbody tr:nth-child(even) td{background:rgba(255,215,94,.035)}
.estado-hoja tbody tr:hover td{background:rgba(255,215,94,.09)}
.estado-hoja .col-resizer{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:3}
.estado-hoja .col-resizer:hover{background:rgba(255,215,94,.35)}
.estado-hoja th{position:sticky}.estado-hoja .quien{font-weight:600}.estado-hoja small{color:#b9ab8a;font-weight:400}
.estado-board .estado-body{padding-top:0}
.estado-board footer{padding:4px 10px;border-top:1px solid #5a4316;color:#b9ab8a;font-size:11px}`;
  function estilos(doc) {
    if (doc.getElementById('estado-css')) return;
    const st = doc.createElement('style'); st.id = 'estado-css'; st.textContent = CSS; doc.head.appendChild(st);
  }
  function pill(doc, st) {
    const p = doc.createElement('span');
    p.className = 'estado-pill ' + claseEstado(st);
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
    // Proyecto en el que está, bien visible justo debajo del nombre.
    if (f) {
      // «Proyecto: digitalsignage.ai» (Carlos, 4-oct-2026: la caja lleva su etiqueta).
      const pr = doc.createElement('div');
      pr.className = 'estado-proyecto' + (f.proyecto ? '' : ' sin');
      const etq = doc.createElement('span'); etq.className = 'etq'; etq.textContent = 'Proyecto:';
      pr.append(etq, f.proyecto || (s && s.enlazado ? 'sin proyecto declarado' : 'sin agente enlazado'));
      card.appendChild(pr);
    }
    const dl = doc.createElement('dl');
    const filas = f ? f.filas : [['Misión', enVuelo ? 'mirando…' : SIN + (ultimoError ? ' (no responde el MCP)' : '')]];
    for (const [k, v] of filas) {
      const dt = doc.createElement('dt'); dt.textContent = k;
      const dd = doc.createElement('dd');
      if (k === 'Estado' && f) dd.appendChild(pill(doc, s && s.enlazado ? f.estado : null)); else dd.textContent = v;
      dl.append(dt, dd);
    }
    card.appendChild(dl);
    colocar(doc);
    pintarContornos(doc);
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
  /* Cada silueta (#body-hotspots [data-persona]) lleva data-estado-color para la
   * píldora y el parpadeo. El brillo de hover usa el color de la silla, no este
   * atributo. Sin dato aún no se toca; con dato y sin silla/agente, nodata. Las
   * siluetas se repintan al cambiar de generación, así que se vuelve a marcar. */
  function pintarContornos(doc) {
    doc = doc || root.document;
    if (!doc || !datos) return;
    const c = doc.getElementById('body-hotspots'); if (!c) return;
    estilos(doc);
    c.querySelectorAll('[data-persona]').forEach(el => {
      const cls = claseEstado(silla(datos, el.getAttribute('data-persona')));
      if (el.getAttribute('data-estado-color') !== cls) el.setAttribute('data-estado-color', cls);
    });
  }
  function wireHover() {
    const doc = root.document; if (!doc) return;
    ['nameplates', 'body-hotspots'].forEach(id => {
      const c = doc.getElementById(id);
      if (!c || c._estadoWired) return;
      c._estadoWired = true;
      c.addEventListener('mouseover', e => {
        pintarContornos(doc);
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
  /* ── La hoja: columnas, orden y anchos (Carlos, 4-oct-2026: «que funcione como una hoja») ── */
  const RANGO_ESTADO = { blocked: 0, working: 1, ack: 2, idle: 3 };   // sin datos: vacío, siempre al final
  const COLS = Object.freeze([
    { id: 'consejero', label: 'Consejero', min: 90, def: 130, clave: s => key(s.persona) },
    { id: 'estado', label: 'Estado', min: 80, def: 190, clave: s => (s.estado in RANGO_ESTADO ? RANGO_ESTADO[s.estado] : null) },
    { id: 'ahora', label: 'Misión', min: 140, def: 220, clave: (s, f) => key(f('Misión')) },
    { id: 'desde', label: 'Desde', min: 70, def: 135, clave: s => desdeSeg(s) },
    { id: 'agente', label: 'Deepagent · máquina', min: 110, def: 120, clave: (s, f) => key(f('Deepagent · máquina')) },
    { id: 'latido', label: 'Último latido', min: 70, def: 135, clave: s => Number(s.ultimo_latido) || null }
  ]);
  const LS_HOJA = 'admira:debatir-hoja';
  function hoja() {
    try {
      const o = JSON.parse(root.localStorage.getItem(LS_HOJA) || '{}') || {};
      return { orden: Array.isArray(o.orden) ? o.orden.filter(x => x && COLS.some(c => c.id === x.id)).slice(0, 2) : [], anchos: o.anchos && typeof o.anchos === 'object' ? o.anchos : {} };
    } catch (e) { return { orden: [], anchos: {} }; }
  }
  function guardarHoja(h) { try { root.localStorage.setItem(LS_HOJA, JSON.stringify(h)); } catch (e) {} }
  function restablecerHoja() { try { root.localStorage.removeItem(LS_HOJA); } catch (e) {} }
  function anchoDe(h, c) { const w = Number(h.anchos[c.id]); return Number.isFinite(w) && w >= c.min ? Math.round(w) : c.def; }
  /* Clic: ascendente → descendente en la misma columna; otra columna empieza ascendente.
     Mayús+clic: añade (o alterna) una segunda columna de orden. */
  function siguienteOrden(orden, id, mayus) {
    const o = (orden || []).map(x => ({ ...x }));
    const i = o.findIndex(x => x.id === id);
    if (mayus && o.length) {
      if (i >= 0) o[i].dir = o[i].dir === 'asc' ? 'desc' : 'asc';
      else o.splice(1, 1, { id, dir: 'asc' });
      return o.slice(0, 2);
    }
    if (i === 0) return [{ id, dir: o[0].dir === 'asc' ? 'desc' : 'asc' }];
    return [{ id, dir: 'asc' }];
  }
  /* Ordena las sillas; los vacíos («sin datos») siempre al final, como en una hoja. */
  function ordenar(sillas, orden, ahoraMs) {
    const l = (sillas || []).map((s, i) => {
      const fl = ficha(s, ahoraMs).filas; const f = k => (fl.find(x => x[0] === k) || [k, SIN])[1];
      return { s, i, k: Object.fromEntries(COLS.map(c => [c.id, c.clave(s, f)])) };
    });
    l.sort((a, b) => {
      for (const { id, dir } of orden || []) {
        const x = a.k[id], y = b.k[id];
        if (x === y) continue;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        const r = x < y ? -1 : 1;
        return dir === 'desc' ? -r : r;
      }
      return a.i - b.i;
    });
    return l.map(x => x.s);
  }

  let arrastrando = false, repintarTrasArrastre = false;
  function celda(doc, texto, extra) {
    const td = doc.createElement('td');
    const d = doc.createElement('div'); d.className = 'celda';
    if (extra) d.appendChild(extra); else d.textContent = texto;
    td.title = texto; td.appendChild(d);
    return td;
  }
  function autoajustar(tb, idx, c) {
    let w = c.min;
    tb.querySelectorAll('tr').forEach(tr => {
      const cell = tr.children[idx]; if (!cell) return;
      const inner = cell.querySelector('.celda, .th-txt') || cell;
      // Ancho del contenido, no de la caja: scrollWidth nunca baja del ancho actual.
      const rg = tb.ownerDocument.createRange(); rg.selectNodeContents(inner);
      w = Math.max(w, rg.getBoundingClientRect().width + 24);
    });
    return Math.min(900, Math.ceil(w));
  }
  function cabecera(doc, tb, cols, idx, h) {
    const c = COLS[idx];
    const th = doc.createElement('th'); th.dataset.col = c.id; th.scope = 'col';
    const pos = h.orden.findIndex(x => x.id === c.id);
    th.setAttribute('aria-sort', pos === 0 ? (h.orden[0].dir === 'asc' ? 'ascending' : 'descending') : 'none');
    th.title = 'Ordenar por ' + c.label + ' (clic: ▲/▼ · Mayús+clic: segundo orden)';
    const t = doc.createElement('span'); t.className = 'th-txt';
    t.textContent = c.label + (pos >= 0 ? ' ' + (h.orden[pos].dir === 'asc' ? '▲' : '▼') + (h.orden.length > 1 ? (pos + 1) : '') : '');
    th.appendChild(t);
    th.addEventListener('click', e => {
      if (e.target.closest('.col-resizer')) return;
      const hh = hoja(); hh.orden = siguienteOrden(hh.orden, c.id, e.shiftKey); guardarHoja(hh); pintarBoard();
    });
    const r = doc.createElement('span'); r.className = 'col-resizer'; r.title = 'Arrastra para cambiar el ancho · doble clic: autoajustar';
    r.addEventListener('click', e => e.stopPropagation());
    r.addEventListener('dblclick', e => {
      e.stopPropagation();
      const hh = hoja(); hh.anchos[c.id] = autoajustar(tb, idx, c); guardarHoja(hh); pintarBoard();
    });
    r.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const col = cols[idx], w0s = col.style.width, x0 = e.clientX, w0 = col.getBoundingClientRect().width || anchoDe(hoja(), c);
      arrastrando = true; try { r.setPointerCapture(e.pointerId); } catch (err) {}
      const mover = ev => { const w = Math.max(c.min, Math.round(w0 + ev.clientX - x0)); col.style.width = w + 'px'; tb.style.width = cols.reduce((a, k) => a + (parseFloat(k.style.width) || 0), 0) + 'px'; };
      const soltar = ev => {
        r.removeEventListener('pointermove', mover); r.removeEventListener('pointerup', soltar); r.removeEventListener('pointercancel', soltar);
        arrastrando = false;
        // Un clic sin mover (o el primero de un doble clic) no repinta: así llega el dblclick.
        if (Math.abs(ev.clientX - x0) < 3) { col.style.width = w0s; if (repintarTrasArrastre) { repintarTrasArrastre = false; setTimeout(pintarBoard, 450); } return; }
        const hh = hoja(); hh.anchos[c.id] = Math.max(c.min, Math.round(w0 + ev.clientX - x0)); guardarHoja(hh);
        repintarTrasArrastre = false; pintarBoard();
      };
      r.addEventListener('pointermove', mover); r.addEventListener('pointerup', soltar); r.addEventListener('pointercancel', soltar);
    });
    th.appendChild(r);
    return th;
  }
  function pintarBoard() {
    const doc = root.document; if (!board || !doc) return;
    if (arrastrando) { repintarTrasArrastre = true; return; }   // el refresco de 30 s no corta un arrastre
    const body = board.querySelector('.estado-body');
    const foot = board.querySelector('footer');
    const scroll = body.scrollTop, scrollX = body.scrollLeft;
    body.replaceChildren();
    if (!datos) {
      const p = doc.createElement('p');
      p.textContent = enVuelo ? 'Mirando qué hace cada consejero…' : SIN + (ultimoError ? ' — el MCP de admira.live no responde (' + ultimoError + ')' : '');
      body.appendChild(p); foot.textContent = 'Fuente: ' + ENDPOINT; return;
    }
    const ahoraMs = Date.now();
    const h = hoja();
    const actual = String(root.currentGenPublic || 'leyendas');
    const gens = Object.keys(datos.mesa).sort((a, b) => (b === actual) - (a === actual));
    for (const gen of gens) {
      const abierto = !!abiertos()[gen];
      const c = ocupados(datos.mesa[gen]);
      const h5 = doc.createElement('h5');
      const bt = doc.createElement('button'); bt.type = 'button'; bt.className = 'estado-grupo'; bt.dataset.gen = gen;
      bt.setAttribute('aria-expanded', String(abierto));
      bt.title = (abierto ? 'Plegar' : 'Desplegar') + ' · ocupados = trabajando, aceptado o bloqueado';
      bt.textContent = (abierto ? '▾ ' : '▸ ') + (GEN_NOMBRE[gen] || gen) + ' (' + c.n + ' de ' + c.total + ')';
      bt.onclick = () => { alternarGrupo(gen); pintarBoard(); };
      h5.appendChild(bt); body.appendChild(h5);
      if (!abierto) continue;
      const tb = doc.createElement('table'); tb.className = 'estado-hoja'; tb.dataset.gen = gen;
      const cg = doc.createElement('colgroup');
      const cols = COLS.map(col => { const k = doc.createElement('col'); k.style.width = anchoDe(h, col) + 'px'; cg.appendChild(k); return k; });
      tb.style.width = COLS.reduce((a, col) => a + anchoDe(h, col), 0) + 'px';
      tb.appendChild(cg);
      const thead = doc.createElement('thead'); const trh = doc.createElement('tr');
      COLS.forEach((col, i) => trh.appendChild(cabecera(doc, tb, cols, i, h)));
      thead.appendChild(trh); tb.appendChild(thead);
      const tbody = doc.createElement('tbody');
      for (const s of ordenar(datos.mesa[gen], h.orden, ahoraMs)) {
        const f = ficha(s, ahoraMs);
        const get = k => (f.filas.find(x => x[0] === k) || [k, SIN])[1];
        const tr = doc.createElement('tr'); tr.dataset.persona = s.persona;
        const quien = doc.createElement('span'); quien.className = 'quien'; quien.textContent = s.persona + ' ';
        const sm = doc.createElement('small'); sm.textContent = s.rol || ''; quien.appendChild(sm);
        const cola = get('Bandeja');
        const ahoraTxt = get('Misión') + (cola && cola !== SIN ? ' · bandeja: ' + cola : '');
        tr.append(
          celda(doc, s.persona + (s.rol ? ' · ' + s.rol : ''), quien),
          celda(doc, estadoTxt(s.estado), pill(doc, s.estado)),
          celda(doc, ahoraTxt),
          celda(doc, get('Desde')),
          celda(doc, get('Deepagent · máquina')),
          celda(doc, get('Último latido')));
        tbody.appendChild(tr);
      }
      tb.appendChild(tbody); body.appendChild(tb);
    }
    body.scrollTop = scroll; body.scrollLeft = scrollX;
    foot.textContent = 'Datos reales del MCP de admira.live (' + ENDPOINT.replace(/^https?:\/\//, '') + ': presencia y bandejas de bot.yokup.com) · leído ' +
      hora(datos.generado, ahoraMs) + ' · se refresca cada 30 s · «sin datos» = la fuente no lo tiene.';
  }
  function refrescarBoard(force) {
    pintarBoard();
    return cargar(force).then(() => { pintarBoard(); pintarContornos(); }, pintarBoard);
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
      const rs = doc.createElement('button'); rs.type = 'button'; rs.textContent = 'Restablecer columnas'; rs.title = 'Vuelve al orden y los anchos de fábrica';
      rs.onclick = () => { restablecerHoja(); pintarBoard(); };
      const x = doc.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Cerrar (Esc)'; x.onclick = closeBoard;
      hd.append(t, up, rs, deb, x);
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
      // Colores de contorno listos antes del primer hover (una lectura; luego se reutiliza 25 s).
      cargar(false).then(() => pintarContornos(doc), () => {});
      // Color de estado en el contorno desde la carga (#4678): las siluetas se pintan (y se
      // repintan al cambiar de generación) después de este script; en cuanto aparecen, se marcan.
      const bh = doc.getElementById('body-hotspots');
      if (bh && typeof root.MutationObserver === 'function') new root.MutationObserver(() => pintarContornos(doc)).observe(bh, { childList: true, subtree: true });
      // Sondeo (pestaña visible) para detectar cambios y hacer parpadear al consejero que se actualiza.
      setInterval(() => { if (!doc.hidden) cargar(true).then(() => pintarContornos(doc), () => {}); }, SONDEO_MS);
      // Las placas y los cuerpos se repintan al cambiar de generación: el contenedor es el mismo,
      // así que con cablear una vez basta; por si llega tarde, se reintenta al primer movimiento.
      doc.addEventListener('mousemove', function once() { wireHover(); doc.removeEventListener('mousemove', once); });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go); else go();
  }

  root.CouncilEstado = Object.freeze({ ENDPOINT, ocupados, abiertos, alternarGrupo, COLS, siguienteOrden, ordenar, hoja, restablecerHoja, cargar, silla, ficha, encargoEnPalabras, estadoTxt, COLORES, claseEstado, pintarContornos, huella, huellas, cambiados, parpadear, avisarCambios, hace, openBoard, closeBoard, isBoardOpen, mostrarFicha, ocultarFicha });
})(typeof window !== 'undefined' ? window : globalThis);
