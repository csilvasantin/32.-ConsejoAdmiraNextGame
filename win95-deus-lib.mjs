/**
 * Píldoras Matrix y AI flow de Deus Ex Machina en admira.live/windows95.
 *
 * Datos: la misma fuente que ICQGram / CLI DeepAgents
 * (/api/win95/deepagents, /api/win95/deepagents-comunicaciones, presencia).
 * Nada se inventa. Si falta sesión o la API no responde: amarillo
 * «sin datos verificados». Un encargo en cola no pinta de rojo.
 *
 * Colores de Carlos: rojo = trabajando, verde = libre,
 * amarillo = desconocido, solo con evidencia real de sesión.
 */
export const FLOW_AGENTS = [
  { persona: 'Neo', nombre: 'Neo', id: 'neo' },
  { persona: 'Trinity', nombre: 'Trinity', id: 'trinity' },
  { persona: 'Oraculo', nombre: 'Oráculo', id: 'oraculo' },
  { persona: 'Morfeo', nombre: 'Morfeo', id: 'morfeo' },
  { persona: 'Smith', nombre: 'Smith', id: 'smith' },
  { persona: 'Merovingio', nombre: 'Merovingio', id: 'merovingio' },
];

export const COLOR_ESTADO = {
  trabajando: 'rojo',
  libre: 'verde',
  desconocido: 'amarillo',
};

export const AVISO_SIN_DATOS = 'sin datos verificados';
export const ETIQUETA_EJEMPLO = 'ejemplo';

export const DEUS_URLS = {
  deepagents: '/api/win95/deepagents',
  comunicaciones: '/api/win95/deepagents-comunicaciones',
  presencia: '/api/win95/presencia',
};

/** Paleta de la Ciudad de las Máquinas tras la píldora roja: ámbar/dorado y negro (no verde Matrix). */
export const DEUS_PALETTE = {
  bg: '#070403',
  bgDeep: '#030201',
  amber: '#e09020',
  amberDim: '#a86018',
  gold: '#ffd078',
  goldHot: '#fff3d0',
  copper: '#8a4a14',
  spark: '#ffe9a0',
};

const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function recorta(s, max = 160) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[.,;:]+$/, '') + '…';
}

export function sanearFlujo(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/\b(?:sk-|ghp_|github_pat_|xai-|AKIA)[A-Za-z0-9._-]{8,}/g, '[clave oculta]');
  t = t.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [oculto]');
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[correo oculto]');
  t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip oculta]');
  t = t.replace(/(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/g, '[mac oculta]');
  return t;
}

export function agenteCanon(s) {
  const k = plain(s);
  if (!k) return null;
  for (const a of FLOW_AGENTS) {
    const p = plain(a.persona);
    if (k === p || k.startsWith(p) || p.startsWith(k)) return a;
  }
  return null;
}

/**
 * Evidencia de sesión real: latido vivo (p. ej. 15 min) o app de
 * escritorio abierta en el censo. Un encargo pending/in_progress
 * por sí solo no cuenta.
 */
export function sesionVerificada({ latido, censoAgente } = {}) {
  if (latido && (latido.vivo === true || latido.sesion === true)) return true;
  if (censoAgente && Array.isArray(censoAgente.maquinas) && censoAgente.maquinas.length) return true;
  return false;
}

/**
 * «Trabajando» solo con señal de sesión: modo trabajando vigente,
 * o latido vivo con tarea/terminal declarada. No usa la cola.
 */
export function sesionTrabajando({ latido } = {}, ahoraMs = Date.now()) {
  if (!latido) return false;
  const modo = String(latido.modo || latido.mode || '').toLowerCase();
  const hasta = Number(latido.hasta) || 0;
  const hastaMs = hasta > 0 && hasta < 1e12 ? hasta * 1000 : hasta;
  if (modo === 'trabajando' && (!hastaMs || hastaMs > ahoraMs) && latido.caducado !== true) return true;
  if (latido.vivo === true && (latido.tarea || latido.task || latido.terminalVisible === true)) return true;
  return false;
}

/** rojo = trabajando, verde = libre, amarillo = desconocido. */
export function colorEstado(input = {}, ahoraMs = Date.now()) {
  if (!sesionVerificada(input)) return COLOR_ESTADO.desconocido;
  if (sesionTrabajando(input, ahoraMs)) return COLOR_ESTADO.trabajando;
  return COLOR_ESTADO.libre;
}

export function etiquetaColor(color) {
  if (color === 'rojo') return 'trabajando';
  if (color === 'verde') return 'libre';
  return 'desconocido';
}

export function mentionsCarlos(s) {
  return /\bcarlos\b/i.test(String(s || ''));
}

function listaComunicaciones(fuentes) {
  const d = fuentes && fuentes.comunicaciones;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.comunicaciones)) return d.comunicaciones;
  return [];
}

function censoAgentes(fuentes) {
  const c = fuentes && fuentes.censo;
  if (!c || c.sinFuente || c.ok === false) return [];
  return Array.isArray(c.agentes) ? c.agentes : [];
}

function censoDe(fuentes, persona) {
  const want = plain(persona);
  for (const a of censoAgentes(fuentes)) {
    if (plain(a.persona) === want || plain(a.nombre) === want) return a;
  }
  return null;
}

function latidoDe(fuentes, persona) {
  const want = plain(persona);
  const latidos = (fuentes && fuentes.latidos) || {};
  if (latidos[persona]) return latidos[persona];
  for (const [k, v] of Object.entries(latidos)) {
    if (plain(k) === want) return v;
  }
  const com = fuentes && fuentes.comunicaciones;
  const ags = com && Array.isArray(com.agentes) ? com.agentes : [];
  for (const a of ags) {
    if (plain(a.persona) === want || plain(a.nombre) === want) return a.latido || a.ultimoLatido || null;
  }
  return null;
}

function tituloDe(c) {
  return recorta(sanearFlujo(c.titulo || c.asunto || String(c.texto || '').split('\n')[0] || ''), 140);
}

export function ultimaOrdenCarlos(fuentes) {
  const list = listaComunicaciones(fuentes).filter((c) => c && (c.tipo ? c.tipo === 'encargo' : (c.encargo || c.etiqueta)));
  if (!list.length) return null;
  const scored = list.slice().sort((a, b) => (b.cuandoMs || 0) - (a.cuandoMs || 0) || (b.encargo || 0) - (a.encargo || 0));
  const deCarlos = scored.find((c) => mentionsCarlos(c.de) || mentionsCarlos(c.texto) || mentionsCarlos(c.titulo));
  const c = deCarlos || scored[0];
  return {
    encargo: c.encargo || 0,
    etiqueta: c.etiqueta || (c.encargo ? '#' + c.encargo : ''),
    titulo: tituloDe(c),
    de: recorta(sanearFlujo(c.de || c.consejero || ''), 80),
    para: recorta(sanearFlujo(c.para || c.persona || ''), 80),
    estado: c.estadoEs || c.estado || '',
    cuandoMs: c.cuandoMs || 0,
    deCarlos: !!(deCarlos),
    fuente: 'comunicaciones',
  };
}

export function resultadosRecientes(fuentes, limit = 6) {
  const list = listaComunicaciones(fuentes)
    .filter((c) => c && String(c.estado || '') === 'done')
    .sort((a, b) => (b.cierreMs || b.cuandoMs || 0) - (a.cierreMs || a.cuandoMs || 0));
  return list.slice(0, limit).map((c) => ({
    encargo: c.encargo || 0,
    etiqueta: c.etiqueta || (c.encargo ? '#' + c.encargo : ''),
    titulo: tituloDe(c),
    de: recorta(sanearFlujo(c.de || ''), 60),
    para: recorta(sanearFlujo(c.para || c.persona || ''), 60),
    cuandoMs: c.cierreMs || c.cuandoMs || 0,
  }));
}

export function misionDeAgente(fuentes, persona) {
  const want = plain(persona);
  const com = fuentes && fuentes.comunicaciones;
  const activos = com && Array.isArray(com.activos) ? com.activos : [];
  for (const a of activos) {
    if (plain(a.persona) === want) {
      return {
        titulo: recorta(sanearFlujo(a.titulo || ''), 140),
        etiqueta: a.etiqueta || '',
        estado: a.estadoEs || a.estado || 'en curso',
        consejero: recorta(sanearFlujo(a.consejero || a.de || ''), 60),
        fuente: 'sesion',
      };
    }
  }
  const list = listaComunicaciones(fuentes)
    .filter((c) => c && (plain(c.persona) === want || plain(c.para) === want || (agenteCanon(c.para) && plain(agenteCanon(c.para).persona) === want)))
    .sort((a, b) => (b.cuandoMs || 0) - (a.cuandoMs || 0));
  const abierta = list.find((c) => c.tipo !== 'mensaje' && c.estado && c.estado !== 'done' && c.estado !== 'cancelled' && c.estado !== 'failed');
  if (abierta) {
    return {
      titulo: tituloDe(abierta),
      etiqueta: abierta.etiqueta || '',
      estado: abierta.estadoEs || abierta.estado || '',
      consejero: recorta(sanearFlujo(abierta.de || ''), 60),
      fuente: 'encargo',
    };
  }
  return null;
}

/**
 * Construye el AI flow. Si no hay fuentes verificadas, todos los
 * agentes salen en amarillo y aviso «sin datos verificados».
 * `usarEjemplo: true` rellena nodos solo para animar y marca `ejemplo`.
 */
export function buildAiFlow(fuentes = {}, ahoraMs = Date.now()) {
  const com = fuentes.comunicaciones;
  const censo = fuentes.censo;
  const hayCom = !!(com && (Array.isArray(com) ? com.length : (com.ok === true && Array.isArray(com.comunicaciones))));
  const hayCenso = !!(censo && censo.ok === true && !censo.sinFuente);
  const verificado = hayCom || hayCenso || !!(fuentes.latidos && Object.keys(fuentes.latidos).length);
  const aviso = verificado ? (com && com.aviso ? String(com.aviso) : '') : AVISO_SIN_DATOS;
  const ejemplo = fuentes.usarEjemplo === true && !verificado;

  const orden = verificado ? ultimaOrdenCarlos(fuentes) : (ejemplo ? {
    encargo: 0, etiqueta: '', titulo: 'Una orden de ejemplo para la animación', de: 'Consejo',
    para: '', estado: '', cuandoMs: 0, deCarlos: true, fuente: 'ejemplo', ejemplo: true,
  } : null);

  const consejo = orden && orden.de ? orden.de : (verificado ? '' : '');

  const agentes = FLOW_AGENTS.map((a) => {
    const latido = latidoDe(fuentes, a.persona);
    const censoAgente = censoDe(fuentes, a.persona);
    let color = verificado ? colorEstado({ latido, censoAgente }, ahoraMs) : COLOR_ESTADO.desconocido;
    let mision = verificado ? misionDeAgente(fuentes, a.persona) : null;
    if (ejemplo) {
      color = COLOR_ESTADO.desconocido;
      mision = { titulo: 'Misión de ejemplo', etiqueta: '', estado: '', consejero: '', fuente: 'ejemplo', ejemplo: true };
    }
    return {
      persona: a.persona,
      nombre: a.nombre,
      id: a.id,
      color,
      estado: etiquetaColor(color),
      mision,
      sesion: sesionVerificada({ latido, censoAgente }),
      latido: latido || null,
    };
  });

  const resultados = verificado ? resultadosRecientes(fuentes) : [];

  return {
    ok: verificado,
    ejemplo,
    aviso: ejemplo ? 'Datos de ejemplo para la animación (no son reales)' : (aviso || ''),
    orden,
    consejo,
    agentes,
    resultados,
    generado: ahoraMs,
  };
}

export function guionDeus(flow) {
  const f = flow || buildAiFlow({});
  const lines = [];
  lines.push('Has llegado a la Ciudad de las Máquinas.');
  lines.push('Aquí se ve el flujo real de AdmiraNeXT: la orden, el Consejo, los DeepAgents y el resultado.');
  if (f.ejemplo) {
    lines.push('Los nodos que ves ahora son un ejemplo para la animación, no datos reales.');
  } else if (!f.ok) {
    lines.push('Sin datos verificados de la flota. Si hace falta sesión, los estados quedan en amarillo.');
  }
  if (f.orden && !f.orden.ejemplo) {
    const quien = f.orden.deCarlos ? 'Orden de Carlos' : 'Última orden visible en la flota';
    lines.push(quien + (f.orden.etiqueta ? ' ' + f.orden.etiqueta : '') + ': ' + (f.orden.titulo || 'sin título') + (f.orden.de ? '. La reparte ' + f.orden.de + '.' : '.'));
  } else if (!f.ejemplo) {
    lines.push('Orden de Carlos: ' + AVISO_SIN_DATOS + '.');
  }
  if (f.consejo && f.orden && !f.orden.ejemplo) {
    lines.push('Consejo: ' + f.consejo + '.');
  }
  const vistos = f.agentes || [];
  const rojos = vistos.filter((a) => a.color === 'rojo');
  const verdes = vistos.filter((a) => a.color === 'verde');
  const amarillos = vistos.filter((a) => a.color === 'amarillo');
  if (f.ok) {
    if (rojos.length) {
      lines.push('Trabajando ahora: ' + rojos.map((a) => a.nombre + (a.mision && a.mision.titulo ? ' — ' + a.mision.titulo : '')).join('; ') + '.');
    }
    if (verdes.length) lines.push('Libres: ' + verdes.map((a) => a.nombre).join(', ') + '.');
    if (amarillos.length) lines.push('Sin señal de sesión: ' + amarillos.map((a) => a.nombre).join(', ') + ' (amarillo, ' + AVISO_SIN_DATOS + ').');
  } else if (!f.ejemplo) {
    lines.push('DeepAgents (Neo, Trinity, Oráculo, Morfeo, Smith, Merovingio): ' + AVISO_SIN_DATOS + '.');
  }
  if (f.resultados && f.resultados.length) {
    lines.push('Resultados recientes: ' + f.resultados.slice(0, 4).map((r) => (r.etiqueta || '') + ' ' + r.titulo).join('; ') + '.');
  } else if (f.ok) {
    lines.push('Sin encargos cerrados recientes en la fuente.');
  }
  lines.push('¿Qué quieres? Escribe una orden (modo demo: no se envía) o vuelve con la píldora azul o Escape.');
  return lines.map((l) => recorta(sanearFlujo(l), 320));
}

export function simularOrden(texto) {
  const t = recorta(sanearFlujo(texto), 200);
  if (!t) return { ok: false, envia: false, modo: 'demo', mensaje: 'Escribe una orden para ver qué ocurriría.' };
  return {
    ok: true,
    envia: false,
    modo: 'demo',
    mensaje: 'Modo demo (solo lectura): esta orden no se envía. Si se encargara, el Consejo la repartiría a los DeepAgents (Neo, Trinity, Oráculo, Morfeo, Smith, Merovingio). Orden: «' + t + '».',
    orden: t,
  };
}

export function wantsPildoraFromUrl(search) {
  const q = String(search || '');
  const params = new URLSearchParams(q.startsWith('?') || q.length === 0 ? q : '?' + q);
  const raw = String(params.get('pildora') || params.get('pill') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (raw === 'roja' || raw === 'rojo' || raw === 'red') return 'roja';
  if (raw === 'azul' || raw === 'blue') return 'azul';
  return null;
}

export function syncPildoraUrl(pildora, loc) {
  if (!loc || !loc.href || !loc.history || typeof loc.history.replaceState !== 'function') return;
  const u = new URL(loc.href);
  const sp = u.searchParams;
  if (pildora === 'roja' || pildora === 'azul') {
    if (String(sp.get('tema') || '').toLowerCase() !== 'matrix' && String(sp.get('theme') || '').toLowerCase() !== 'matrix') {
      sp.set('tema', 'matrix');
    }
    sp.set('pildora', pildora);
  } else {
    sp.delete('pildora');
    sp.delete('pill');
  }
  const next = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash;
  const cur = (loc.pathname || u.pathname) + (loc.search || '') + (loc.hash || '');
  if (next !== cur) loc.history.replaceState({}, '', next);
}

export function prefersReducedMotion(opts) {
  try {
    const mm = opts && opts.matchMedia
      ? opts.matchMedia
      : (typeof window !== 'undefined' && window.matchMedia);
    return !!(mm && mm('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

export function particleBudget(w, h, dpr = 1, reduced = false) {
  const area = Math.max(1, (w || 640) * (h || 480));
  if (reduced) return Math.max(200, Math.min(700, Math.floor(area / 900)));
  const mobile = (w || 640) < 700 || (h || 480) < 420;
  const cap = mobile ? 1800 : (dpr > 1.5 ? 4000 : 4800);
  return Math.max(700, Math.min(cap, Math.floor(area / 180)));
}

/** Densidad del rostro (coords normalizadas x,y en [-1,1], y hacia arriba). */
export function faceWeight(x, y) {
  const hx = x / 0.64;
  const hy = (y + 0.04) / 0.94;
  const r2 = hx * hx + hy * hy;
  if (r2 > 1) return 0;
  let w = 0.42 + 0.5 * (1 - r2);
  w += 0.45 * Math.exp(-((y - 0.32) * (y - 0.32)) / 0.012) * Math.exp(-((Math.abs(x) - 0.22) * (Math.abs(x) - 0.22)) / 0.045);
  function eye(ex, ey) {
    const d = ((x - ex) * (x - ex)) / 0.032 + ((y - ey) * (y - ey)) / 0.016;
    if (d < 0.72) return -0.7;
    if (d < 1.55) return 1.25;
    return 0;
  }
  w += eye(-0.23, 0.14) + eye(0.23, 0.14);
  w += 0.4 * Math.exp(-(x * x) / 0.012) * Math.exp(-((y - 0.02) * (y - 0.02)) / 0.07);
  const my = y + 0.36;
  const mouth = Math.exp(-(my * my) / 0.01) * Math.exp(-(x * x) / 0.13);
  if (Math.abs(my) < 0.07 && Math.abs(x) < 0.4) w -= 0.75;
  w += 0.95 * mouth;
  const jaw = Math.exp(-((y + 0.62) * (y + 0.62)) / 0.04) * (1 - Math.min(1, Math.abs(x) / 0.5));
  w += 0.25 * jaw;
  return Math.max(0, Math.min(1.2, w));
}

export function buildFaceCloud(n, rnd = Math.random) {
  const pts = [];
  let guard = 0;
  const target = Math.max(40, n || 400);
  while (pts.length < target && guard < target * 40) {
    guard += 1;
    const x = (rnd() * 2 - 1) * 0.9;
    const y = (rnd() * 2 - 1) * 1.05;
    const d = faceWeight(x, y);
    if (d > 0 && rnd() < Math.min(1, d)) pts.push({ x, y, w: d });
  }
  return pts;
}

const api = {
  FLOW_AGENTS, COLOR_ESTADO, AVISO_SIN_DATOS, ETIQUETA_EJEMPLO, DEUS_URLS, DEUS_PALETTE,
  recorta, sanearFlujo, agenteCanon, sesionVerificada, sesionTrabajando,
  colorEstado, etiquetaColor, mentionsCarlos, ultimaOrdenCarlos,
  resultadosRecientes, misionDeAgente, buildAiFlow, guionDeus, simularOrden,
  wantsPildoraFromUrl, syncPildoraUrl, prefersReducedMotion, particleBudget,
  faceWeight, buildFaceCloud,
};
export default api;
if (typeof globalThis !== 'undefined') globalThis.Win95Deus = api;
