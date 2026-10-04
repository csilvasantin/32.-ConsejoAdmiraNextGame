/*
 * estado.js — «¿en qué está cada consejero AHORA?» para la mesa de admira.live
 * (Carlos, 4-oct-2026: al pasar el ratón por un consejero y con DEBATIR, ver el encargo
 * en curso descrito en palabras, su estado, desde cuándo, su deepagent y máquina y el
 * último latido).
 *
 * Honestidad de ficha (#5085 / FLT-101528): «trabajando» solo si latido mode=trabajando
 * en ≤10 min; misión/cola solo encargos abiertos de las últimas 48 h (nunca working por
 * un in_progress antiguo).
 * GET /consejo/estado — pública y de solo lectura. Junta lo mismo que leen agentes_vivos
 * y encargos_listar, pero SOLO de las fuentes que ya son públicas en bot.yokup.com:
 *   · /api/presence                 latidos (persona, máquina, runtime, foco, updated)
 *   · /api/public/inbox?persona=    los 80 encargos más recientes, texto recortado a 140
 * No usa la vista privada de la bandeja (ADMIRA_TELEGRAM_PANEL_KEY): así este endpoint no
 * publica nada que no fuera ya público. Nunca se inventa un dato: si una fuente no
 * responde, el campo sale null y la web dice «sin datos».
 */

import { SILLAS } from './sillas.js';
import { filasPresencia, norm, seg, ESTADOS_ABIERTOS } from './coordinacion.js';
import { leerMarcas, guardarCambios, claveAgente } from './desde.js';

export const VIVO_SEG = 900;          // «en línea» = latido en los últimos 15 min (igual que agentes_vivos)
export const TRABAJANDO_SEG = 600;    // «trabajando» solo con latido mode=trabajando en los últimos 10 min (#5085)
export const ENCARGO_VIVO_SEG = 48 * 3600; // misión/cola: solo encargos abiertos de las últimas 48 h (#5085)
export const CACHE_SEG = 20;          // la mesa lo pide al hover: 20 s de caché en el borde
const limpiar = (s) => String(s || '').replace(/\/+$/, '');

const silla = (p) => ({ persona: p, tipo: 'silla', maquina: 'GrokBot', runtime: null, etiqueta: `${p}GrokBot` });
const deep = (p, s) => ({ persona: s.deepagent, tipo: 'deepagent', maquina: s.deepagent_maquina, runtime: s.deepagent_runtime, modelo: s.deepagent_model || null, etiqueta: `${s.deepagent}@${s.deepagent_maquina}`, solo_maquina: true });
const agente = (p, extra = {}) => ({ persona: p, tipo: 'deepagent', etiqueta: p, ...extra });

/** Silla de la mesa (nombre tal como sale en la web) → de quién se lee el trabajo. Mismo mapa que council-todo.js. */
export const MESA = {
  leyendas: [
    { persona: 'Steve Jobs', rol: 'CEO', fuentes: [silla('Jobs')], maquina_silla: SILLAS.Jobs.maquina },
    { persona: 'Steve Wozniak', rol: 'CTO', fuentes: [silla('Wozniak')], maquina_silla: SILLAS.Wozniak.maquina },
    { persona: 'Tim Cook', rol: 'COO', fuentes: [] },
    { persona: 'Warren Buffett', rol: 'CFO', fuentes: [] },
    { persona: 'Walt Disney', rol: 'CCO', fuentes: [silla('Disney')], maquina_silla: SILLAS.Disney.maquina },
    { persona: 'Dieter Rams', rol: 'CDO', fuentes: [] },
    { persona: 'Howard Schultz', rol: 'CXO', fuentes: [] },
    { persona: 'George Lucas', rol: 'CSO', fuentes: [silla('Lucas')], maquina_silla: SILLAS.Lucas.maquina },
  ],
  coetaneos: [
    { persona: 'Elon Musk', rol: 'CEO', fuentes: [deep('Musk', SILLAS.Musk), silla('Musk')] },
    { persona: 'Jensen Huang', rol: 'CTO', fuentes: [deep('Huang', SILLAS.Huang), silla('Huang')] },
    { persona: 'Gwynne Shotwell', rol: 'COO', fuentes: [agente('Trinity')] },
    { persona: 'Ruth Porat', rol: 'CFO', fuentes: [agente('Oraculo')] },
    { persona: 'John Lasseter', rol: 'CCO', fuentes: [agente('Mouse')] },
    { persona: 'Jony Ive', rol: 'CDO', fuentes: [agente('Arquitecto', { excluir_maquina: 'CursorCloud' })] },
    { persona: 'Carlos Ratti', rol: 'CXO', fuentes: [agente('Link')] },
    { persona: 'Ryan Reynolds', rol: 'CSO', fuentes: [] },
  ],
};

/** El encargo en palabras: fuera el «Soy X.» de cortesía y los emojis de cabecera; la primera línea con contenido. */
export function tituloEncargo(texto, max = 120) {
  const lineas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^soy [^.\n]{1,60}\.?$/i.test(l));
  // «Repo: …» / «Proyecto: …» son metadatos: si hay otra línea, esa describe mejor el encargo.
  if (lineas.length > 1 && /^(repo|repositorio|proyecto|project|rama|branch)\s*:/i.test(lineas[0])) lineas.push(lineas.shift());
  let t = (lineas[0] || '').replace(/^[^\p{L}\p{N}«"(¿¡#[]+/u, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // La bandeja pública recorta el texto a 140: si la línea elegida es la última, va cortada.
  if (String(texto).length >= 139 && lineas.length && lineas[lineas.length - 1] === lineas[0] && t.length < max) t = t.replace(/[\s·,;:.\-–—]+$/u, '') + '…';
  if (t.length > max) t = t.slice(0, max - 1).replace(/[\s·,;:.\-–—]+$/u, '') + '…';
  return t;
}

function filaEsDe(r, f) {
  if (norm(r.persona) !== norm(f.persona)) return false;
  if (f.solo_maquina && f.maquina && norm(r.machine) !== norm(f.maquina)) return false;
  if (f.excluir_maquina && norm(r.machine) === norm(f.excluir_maquina)) return false;
  return true;
}
function encargoEsDe(x, f) {
  if (norm(x.target_persona) !== norm(f.persona)) return false;
  if (f.solo_maquina && f.maquina && x.target_machine && norm(x.target_machine) !== norm(f.maquina)) return false;
  if (f.excluir_maquina && norm(x.target_machine) === norm(f.excluir_maquina)) return false;
  return true;
}

/** Estado de una silla con las fuentes ya leídas (puro: se prueba sin red). */
export function estadoSilla(def, { presencia, bandejas, trabajando = null, marcas = null }, ahoraMs) {
  const ahoraS = Math.floor(ahoraMs / 1000);
  const base = { persona: def.persona, rol: def.rol, enlazado: def.fuentes.length > 0 };
  if (!def.fuentes.length) return { ...base, estado: null, motivo: 'sin agente enlazado' };
  const agentes = def.fuentes.map((f) => {
    const filas = presencia ? presencia.filter((r) => filaEsDe(r, f)).sort((a, b) => seg(b.updated) - seg(a.updated)) : null;
    const r = filas && filas[0];
    const b = bandejas[f.persona];
    const abiertos = b ? b.items.filter((x) => {
      if (!encargoEsDe(x, f) || !ESTADOS_ABIERTOS.includes(String(x.status || 'pending'))) return false;
      const t = seg(x.ts) || seg(x.ack_at);
      // Sin ts/ack_at: excluir (no inventar frescura). Solo vivos < 48 h (#5085).
      return t && t >= ahoraS - ENCARGO_VIVO_SEG;
    }) : null;
    // Cerrados: el más reciente con hora de cierre (para «Desde» de una silla libre).
    const cerrados = b ? b.items.filter((x) => encargoEsDe(x, f) && !ESTADOS_ABIERTOS.includes(String(x.status || 'pending')))
      .map((x) => ({ x, t: seg(x.done_at) || seg(x.closed_at) || seg(x.updated_at) || 0 })).filter((c) => c.t) : [];
    const ultimoCerrado = cerrados.sort((p, q) => q.t - p.t)[0] || null;
    // presence_work (bot.yokup.com/api/presence/trabajando): inicio de la racha trabajando.
    const ws = trabajando ? trabajando.filter((w) => filaEsDe(w, f)).map((w) => seg(w.working_since)).filter(Boolean) : [];
    const maquina = (r && r.machine) || f.maquina || null;
    return {
      _cerrado: ultimoCerrado, _working_since: ws.length ? Math.min(...ws) : null,
      _marca: marcas && marcas.agentes ? (marcas.agentes[claveAgente(f.persona, maquina)] || null) : null,
      _clave: claveAgente(f.persona, maquina),
      persona: f.persona, tipo: f.tipo, etiqueta: f.etiqueta, runtime: (r && r.runtime) || f.runtime || null, modelo: f.modelo || (r && r.model) || null,
      maquina: (r && r.machine) || f.maquina || null,
      latido: presencia ? (r ? seg(r.updated) : null) : undefined,
      vivo: presencia ? !!(r && seg(r.updated) >= ahoraS - VIVO_SEG) : null,
      modo: (r && r.mode) || null,
      foco: r ? (String(r.focus || r.task || '').trim() || null) : null,
      // Ficha de la mesa (Carlos, 4-oct-2026): proyecto bajo el nombre y Misión = tarea del latido.
      proyecto: r ? (String(r.project || '').trim() || null) : null,
      tarea: r ? (String(r.task || '').trim() || null) : null,
      _abiertos: abiertos,
    };
  });
  const todos = agentes.flatMap((a) => (a._abiertos || []).map((x) => ({ x, a })));
  // Misión = el abierto más reciente (id desc, luego ts); nunca el más viejo in_progress (#5085).
  const tsDe = (x) => seg(x.ts) || seg(x.ack_at) || 0;
  todos.sort((p, q) => (Number(q.x.id) - Number(p.x.id)) || (tsDe(q.x) - tsDe(p.x)));
  const actual = todos[0] || null;
  const ultimoPendiente = todos.find((t) => (t.x.status || 'pending') === 'pending') || null;
  const cola = { pending: 0, ack: 0, in_progress: 0, blocked: 0 };
  for (const t of todos) cola[t.x.status || 'pending']++;
  const sinBandeja = agentes.every((a) => a._abiertos === null);
  const sinPresencia = presencia === null;
  // «trabajando» SOLO con latido fresco mode=trabajando (10 min). Nunca por in_progress viejo (#5085).
  const trabajandoPorLatido = agentes.some((a) => Number.isFinite(a.latido) && a.latido >= ahoraS - TRABAJANDO_SEG && norm(a.modo) === 'trabajando');
  const estado = trabajandoPorLatido ? 'working' : (sinBandeja && sinPresencia ? null : 'idle');
  const enc = (t) => (t ? {
    numero: Number(t.x.id), etiqueta: t.x.etiqueta || null, estado: String(t.x.status || 'pending'),
    titulo: tituloEncargo(t.x.text), de: t.x.from_name || null, para: t.a.persona,
    creado: seg(t.x.ts) || null, acuse: seg(t.x.ack_at) || null, desde: seg(t.x.ack_at) || seg(t.x.ts) || null,
  } : null);
  const latidos = agentes.map((a) => a.latido).filter((n) => Number.isFinite(n));
  const marcaSilla = marcas && marcas.sillas ? (marcas.sillas[def.persona] || null) : null;
  const { desde, desde_fuente, cambios } = calcularDesde({ estado, agentes, actual, marcaSilla, persona: def.persona }, ahoraS);
  // Proyecto de la silla: el del latido más reciente que lo declare (yokup_presencia · proyecto).
  const conProyecto = agentes.filter((a) => a.proyecto).sort((a, b) => (Number(b.latido) || 0) - (Number(a.latido) || 0));
  return {
    ...base, estado,
    // «Desde» (Carlos, 4-oct-2026 19:15): cuándo entró en el estado actual. null solo sin historial.
    desde, desde_fuente,
    proyecto: conProyecto.length ? conProyecto[0].proyecto : null,
    encargo: enc(actual),
    ultimo_pendiente: actual ? null : enc(ultimoPendiente),
    cola: sinBandeja ? null : cola,
    ultimo_latido: latidos.length ? Math.max(...latidos) : null,
    maquina_silla: def.maquina_silla || null,
    _cambios: cambios,
    agentes: agentes.map(({ _abiertos, _cerrado, _working_since, _marca, _clave, ...a }) => ({ ...a, latido: a.latido === undefined ? null : a.latido })),
    sin_datos: { presencia: sinPresencia, bandeja: sinBandeja },
  };
}

const validos = (xs) => xs.filter((c) => c && Number.isFinite(c.t) && c.t > 0);
/**
 * Desde cuándo está la silla en su estado (puro). Devuelve también los cambios a apuntar en el KV.
 *  · working: el inicio más antiguo de la racha actual (presence_work.working_since, marca del
 *    agente con trabajando:true, marca observada de la silla, encargo in_progress, latido).
 *  · idle: lo más reciente entre el último encargo cerrado, el trabajando:false del agente, el
 *    último latido trabajando ya caducado y la marca observada de la silla.
 *  · ack: acuse del encargo.
 */
export function calcularDesde({ estado, agentes, actual, marcaSilla, persona }, ahoraS) {
  const cambios = { sillas: {}, agentes: {} };
  let elegido = null;
  if (estado === 'working') {
    const activos = agentes.filter((a) => Number.isFinite(a.latido) && a.latido >= ahoraS - TRABAJANDO_SEG && norm(a.modo) === 'trabajando');
    const cands = validos([
      ...activos.map((a) => ({ t: a._working_since, f: 'presencia_trabajando' })),
      ...activos.map((a) => (a._marca && a._marca.working ? { t: Number(a._marca.desde), f: 'cambio_trabajando' } : null)),
      marcaSilla && marcaSilla.estado === 'working' ? { t: Number(marcaSilla.desde), f: 'cambio_observado' } : null,
      actual && actual.x.status === 'in_progress' ? { t: seg(actual.x.ack_at) || seg(actual.x.ts), f: 'encargo_en_curso' } : null,
    ]).filter((c) => c.t <= ahoraS);
    elegido = cands.sort((p, q) => p.t - q.t)[0] || null;
    if (!elegido) { const l = activos.map((a) => a.latido).sort((p, q) => p - q)[0]; if (l) elegido = { t: l, f: 'latido' }; }
  } else if (estado === 'ack') {
    if (actual && seg(actual.x.ack_at)) elegido = { t: seg(actual.x.ack_at), f: 'encargo_acuse' };
  } else if (estado === 'idle') {
    const cands = validos([
      ...agentes.map((a) => (a._cerrado ? { t: a._cerrado.t, f: 'encargo_cerrado' } : null)),
      ...agentes.map((a) => (a._marca && !a._marca.working ? { t: Number(a._marca.desde), f: 'cambio_trabajando' } : null)),
      // Latido trabajando que dejó de llegar: paró en su último latido.
      ...agentes.map((a) => (norm(a.modo) === 'trabajando' && Number.isFinite(a.latido) && a.latido < ahoraS - TRABAJANDO_SEG ? { t: a.latido, f: 'latido_caducado' } : null)),
      marcaSilla && marcaSilla.estado === 'idle' ? { t: Number(marcaSilla.desde), f: 'cambio_observado' } : null,
    ]).filter((c) => c.t <= ahoraS);
    elegido = cands.sort((p, q) => q.t - p.t)[0] || null;
    // El agente tenía marca trabajando y ya no trabaja: se apunta la parada (su último latido).
    for (const a of agentes) {
      if (a._marca && a._marca.working && Number.isFinite(a.latido) && a.latido < ahoraS - TRABAJANDO_SEG) cambios.agentes[a._clave] = { working: false, desde: a.latido, at: ahoraS, por: 'caducado' };
    }
  }
  const desde = elegido ? elegido.t : null;
  if (estado && desde && (!marcaSilla || marcaSilla.estado !== estado)) cambios.sillas[persona] = { estado, desde, at: ahoraS };
  return { desde, desde_fuente: elegido ? elegido.f : null, cambios };
}

export function crearEstado(env = {}, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = limpiar(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com');
  const via = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? (u, i) => env.TELEGRAM.fetch(u, i) : doFetch;
  const ahora = deps.now || (() => Date.now());
  async function leer(url) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12_000);
    try {
      const r = await via(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/estado' } });
      if (!r.ok) throw new Error(`${r.status} en ${url}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function mesa() {
    const personas = [...new Set(Object.values(MESA).flat().flatMap((d) => d.fuentes.map((f) => f.persona)))];
    const errores = {};
    const kv = env.ADMIRA_LIVE_DESDE || null;
    const [presencia, trabajando, marcas, ...listas] = await Promise.all([
      leer(`${base}/api/presence`).then(filasPresencia).catch((e) => { errores.presencia = String(e.message || e); return null; }),
      leer(`${base}/api/presence/trabajando`).then((d) => (d && d.items) || []).catch((e) => { errores.trabajando = String(e.message || e); return null; }),
      leerMarcas(kv),
      ...personas.map((p) => leer(`${base}/api/public/inbox?${new URLSearchParams({ persona: p })}`)
        .then((d) => ({ items: (d && d.items) || [] }))
        .catch((e) => { errores[`bandeja_${p}`] = String(e.message || e); return null; })),
    ]);
    const bandejas = Object.fromEntries(personas.map((p, i) => [p, listas[i]]));
    const ms = ahora();
    const cambios = { sillas: {}, agentes: {} };
    const mesaOut = Object.fromEntries(Object.entries(MESA).map(([gen, defs]) => [gen, defs.map((d) => {
      const { _cambios, ...s } = estadoSilla(d, { presencia, bandejas, trabajando, marcas }, ms);
      if (_cambios) { Object.assign(cambios.sillas, _cambios.sillas); Object.assign(cambios.agentes, _cambios.agentes); }
      return s;
    })]));
    if (kv && marcas) {
      const g = guardarCambios(kv, cambios);
      if (deps.waitUntil) deps.waitUntil(g); else await g;
    }
    return {
      ok: true, generado: Math.floor(ms / 1000), ventana_vivo_s: VIVO_SEG,
      ventana_trabajando_s: TRABAJANDO_SEG, ventana_encargo_vivo_s: ENCARGO_VIVO_SEG,
      version: env.VERSION || '',
      fuentes: { presencia: presencia ? `ok (${presencia.length})` : 'sin datos', bandejas: `${listas.filter(Boolean).length}/${personas.length} ok`, origen: 'bot.yokup.com (presencia y bandeja públicas, las mismas de agentes_vivos y encargos_listar)' },
      ...(Object.keys(errores).length ? { errores } : {}),
      desde_marcas: kv ? (marcas ? 'ok' : 'KV sin leer') : 'sin KV',
      mesa: mesaOut,
    };
  }
  return { mesa };
}
