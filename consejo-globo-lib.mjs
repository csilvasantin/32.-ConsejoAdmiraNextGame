/**
 * Estado público de la mesa del Consejo (globo + halo de papeles).
 * Fuente de verdad para consejeros con bot de Grok Bot: su propio
 * consejero_latido (GET público /consejeros/latido). No son deepagents:
 * su estado se sabe (trabajando o libre). Amarillo solo en asientos sin bot.
 * Un in_progress/pending en cola no cuenta. Caducidad: si dijeron
 * «trabajando» hace más de 30 min sin nuevo latido, pasan a libre con «último».
 */
export const CADUCIDAD_SEG = 30 * 60;
export const CACHE_SEG = 20;
export const COLORES = Object.freeze({
  trabajando: '#e23d3d',
  libre: '#3ddc84',
  desconocido: '#ffd60a',
});

export const BOT_POR_PERSONA = Object.freeze({
  'Steve Jobs': 'Jobs',
  'Steve Wozniak': 'Wozniak',
  'Walt Disney': 'Disney',
  'George Lucas': 'Lucas',
  'Elon Musk': 'Musk',
  'Jensen Huang': 'Huang',
  'John Lasseter': 'Lasseter',
  'Jony Ive': 'Ive',
});

export const MESA = Object.freeze({
  leyendas: [
    { persona: 'Steve Jobs', rol: 'CEO' },
    { persona: 'Steve Wozniak', rol: 'CTO' },
    { persona: 'Tim Cook', rol: 'COO' },
    { persona: 'Warren Buffett', rol: 'CFO' },
    { persona: 'Walt Disney', rol: 'CCO' },
    { persona: 'Dieter Rams', rol: 'CDO' },
    { persona: 'Howard Schultz', rol: 'CXO' },
    { persona: 'George Lucas', rol: 'CSO' },
  ],
  coetaneos: [
    { persona: 'Elon Musk', rol: 'CEO' },
    { persona: 'Jensen Huang', rol: 'CTO' },
    { persona: 'Gwynne Shotwell', rol: 'COO' },
    { persona: 'Ruth Porat', rol: 'CFO' },
    { persona: 'John Lasseter', rol: 'CCO' },
    { persona: 'Jony Ive', rol: 'CDO' },
    { persona: 'Carlos Ratti', rol: 'CXO' },
    { persona: 'Ryan Reynolds', rol: 'CSO' },
  ],
});

/** Posiciones del portapapeles/folios, en % del arte, medidas sobre las imágenes de origin/main. */
export const PAPEL_POS = Object.freeze({
  leyendas: {
    'Steve Jobs': { x: 20.5, y: 72.5, w: 9, h: 8 },
    'Steve Wozniak': { x: 26.0, y: 69.0, w: 8, h: 7 },
    'Tim Cook': { x: 34.0, y: 60.0, w: 8, h: 6 },
    'Warren Buffett': { x: 40.0, y: 57.0, w: 7, h: 6 },
    'Walt Disney': { x: 54.0, y: 58.0, w: 7, h: 6 },
    'Dieter Rams': { x: 68.5, y: 59.0, w: 8, h: 6 },
    'Howard Schultz': { x: 75.0, y: 62.0, w: 8, h: 6 },
    'George Lucas': { x: 81.0, y: 68.0, w: 8, h: 7 },
  },
  coetaneos: {
    'Elon Musk': { x: 22.0, y: 78.0, w: 8, h: 6 },
    'Jensen Huang': { x: 27.5, y: 64.0, w: 7, h: 6 },
    'Gwynne Shotwell': { x: 36.0, y: 54.0, w: 7, h: 6 },
    'Ruth Porat': { x: 48.5, y: 47.0, w: 6, h: 8 },
    'John Lasseter': { x: 54.0, y: 58.0, w: 7, h: 6 },
    'Jony Ive': { x: 64.0, y: 58.0, w: 7, h: 6 },
    'Carlos Ratti': { x: 71.5, y: 66.0, w: 7, h: 6 },
    'Ryan Reynolds': { x: 80.0, y: 74.0, w: 7, h: 6 },
  },
});

export const tieneBot = (persona) => Object.prototype.hasOwnProperty.call(BOT_POR_PERSONA, persona);
export const botDe = (persona) => BOT_POR_PERSONA[persona] || null;

const seg = (ts) => (Number(ts) > 4102444800 ? Math.floor(Number(ts) / 1000) : Number(ts) || 0);

export function tituloCorto(texto, max = 80) {
  const lineas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^soy [^.\n]{1,60}\.?$/i.test(l));
  if (lineas.length > 1 && /^(repo|repositorio|proyecto|project|rama|branch)\s*:/i.test(lineas[0])) lineas.push(lineas.shift());
  let t = (lineas[0] || '').replace(/^[^\p{L}\p{N}«"(¿¡#[]+/u, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > max) t = t.slice(0, max - 1).replace(/[\s·,;:.\-–—]+$/u, '') + '…';
  return t;
}

export function horaMadrid(unixS, ahoraMs) {
  if (!Number.isFinite(Number(unixS)) || !Number(unixS)) return '';
  const d = new Date(Number(unixS) * 1000);
  const opts = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' };
  const hoy = new Date(ahoraMs || Date.now()).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  const dia = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  if (dia !== hoy) { opts.day = 'numeric'; opts.month = 'short'; }
  return d.toLocaleString('es-ES', opts);
}

/**
 * Un consejero está trabajando solo si su último latido dice «trabajando»
 * y no han pasado más de 30 min sin renovarlo (ni se ha cumplido `hasta`).
 * Un modo ya caducado o ausente no cuenta.
 */
export function latidoVigente(entrada, ahoraS) {
  if (!entrada || entrada.modo !== 'trabajando') return false;
  const at = seg(entrada.at || entrada.desde);
  const hasta = seg(entrada.hasta);
  if (hasta && hasta <= ahoraS) return false;
  if (!at || (ahoraS - at) > CADUCIDAD_SEG) return false;
  return true;
}

export function clasificar({ persona, entrada, ahoraS }) {
  if (!tieneBot(persona)) return 'desconocido';
  return latidoVigente(entrada, ahoraS) ? 'trabajando' : 'libre';
}

function refEncargo(numero, etiqueta, titulo) {
  let ref = '';
  if (etiqueta && /^#?\d/.test(String(etiqueta))) ref = String(etiqueta).startsWith('#') ? String(etiqueta) : '#' + etiqueta;
  else if (numero) ref = '#' + numero;
  if (ref && titulo && String(titulo).includes(String(numero || ref).replace(/^#/, ''))) return '';
  return ref;
}

export function textoGlobo(s, ahoraMs) {
  if (!s || s.estado === 'desconocido') return 'desconocido';
  if (s.estado === 'trabajando') {
    const e = s.en_curso;
    if (e && (e.titulo || e.numero)) {
      const t = e.titulo || 'encargo';
      const ref = refEncargo(e.numero, e.etiqueta, e.titulo);
      return ref ? `En curso: ${t} (${ref})` : `En curso: ${t}`;
    }
    return 'En curso';
  }
  const u = s.ultimo;
  if (u && (u.titulo || u.numero) && u.cuando) {
    const t = u.titulo || 'encargo';
    const ref = refEncargo(u.numero, u.etiqueta, u.titulo);
    return `Libre. Último: ${t}${ref ? ' (' + ref + ')' : ''} a las ${horaMadrid(u.cuando, ahoraMs)}`;
  }
  if (u && u.cuando) return `Libre. Último a las ${horaMadrid(u.cuando, ahoraMs)}`;
  return 'Libre';
}

/** Último encargo done (nunca pending, ack, in_progress ni cancelled). */
export function ultimoHecho(items, ahoraS) {
  const list = Array.isArray(items) ? items : [];
  const dones = list
    .filter((x) => String(x && x.status) === 'done')
    .map((x) => ({
      numero: Number(x.id) || null,
      etiqueta: x.etiqueta || null,
      titulo: tituloCorto(x.text),
      cuando: seg(x.done_at) || seg(x.closed_at) || 0,
    }))
    .filter((x) => x.cuando && x.cuando <= ahoraS)
    .sort((a, b) => b.cuando - a.cuando);
  return dones[0] || null;
}

function cursoDesdeLatido(entrada) {
  if (!entrada) return null;
  const numero = entrada.encargo ? Number(entrada.encargo) : null;
  const titulo = tituloCorto(entrada.mision);
  if (!numero && !titulo) return null;
  return { numero: numero || null, titulo: titulo || (numero ? 'encargo' : null) };
}

/**
 * Si el latido ya no está vigente, su misión cuenta como «último» si es más
 * reciente que el último done de la bandeja pública.
 */
export function ultimoDe(entrada, items, ahoraS) {
  const done = ultimoHecho(items, ahoraS);
  const at = entrada ? (seg(entrada.at) || seg(entrada.desde)) : 0;
  const deLatido = (!latidoVigente(entrada, ahoraS) && at && (entrada.mision || entrada.encargo))
    ? { numero: entrada.encargo ? Number(entrada.encargo) : null, titulo: tituloCorto(entrada.mision) || (entrada.encargo ? 'encargo' : null), cuando: at }
    : null;
  if (deLatido && (!done || deLatido.cuando >= done.cuando)) return deLatido;
  return done;
}

export function asientoPublico(def, { latidos, bandejas, ahoraS }) {
  const bot = botDe(def.persona);
  const entrada = bot && latidos && latidos[bot] ? latidos[bot] : null;
  const items = bot && bandejas ? bandejas[bot] : null;
  const estado = clasificar({ persona: def.persona, entrada, ahoraS });
  const en_curso = estado === 'trabajando' ? cursoDesdeLatido(entrada) : null;
  const ultimo = estado === 'libre' ? ultimoDe(entrada, items, ahoraS) : null;
  const s = {
    persona: def.persona,
    rol: def.rol,
    bot: bot || null,
    estado,
    en_curso,
    ultimo,
  };
  s.texto = textoGlobo(s, ahoraS * 1000);
  return s;
}

export function armarMesa({ latidos, bandejas, ahoraMs }) {
  const ahoraS = Math.floor((ahoraMs || Date.now()) / 1000);
  const mesa = {};
  for (const [gen, defs] of Object.entries(MESA)) {
    mesa[gen] = defs.map((d) => asientoPublico(d, { latidos: latidos || {}, bandejas: bandejas || {}, ahoraS }));
  }
  return { ok: true, generado: ahoraS, cache_s: CACHE_SEG, mesa };
}
