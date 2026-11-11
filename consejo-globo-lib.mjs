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
    { persona: 'John Lasseter', rol: 'CCO' },
    { persona: 'Jony Ive', rol: 'CDO' },
    { persona: 'Ryan Reynolds', rol: 'CSO' },
  ],
});

/**
 * Caja del halo, en % del arte (centro x,y + ancho/alto), medida sobre
 * council-leyendas.jpg (carlos10) y council-coetaneos.jpg de origin/main (#7520: Lasseter en la silla de Ratti, sin Porat ni Ratti).
 * sobre=papel: el folio o portapapeles real más cercano al asiento.
 * sobre=placa: no hay folio; el halo rodea la placa dorada.
 * sobre=cuerpo: no hay folio ni placa; el halo rodea el torso del consejero.
 * sobre=ninguno: en la foto no hay folio, placa ni cuerpo en ese asiento; no se pinta (evita un halo en madera o cielo vacíos).
 */
export const PAPEL_POS = Object.freeze({
  leyendas: {
    'Steve Jobs': { x: 11.5, y: 57.0, w: 11.0, h: 20.0, sobre: 'cuerpo' },
    'Steve Wozniak': { x: 24.5, y: 72.0, w: 12.0, h: 9.0, sobre: 'papel' },
    'Tim Cook': { x: 34.5, y: 56.25, w: 14.0, h: 11.5, sobre: 'papel' },
    'Warren Buffett': { x: 50.5, y: 41.0, w: 12.0, h: 16.0, sobre: 'cuerpo' },
    'Walt Disney': { x: 0, y: 0, w: 0, h: 0, sobre: 'ninguno' },  // en carlos10 no hay folio, placa ni cuerpo en ese asiento
    'Dieter Rams': { x: 70.0, y: 59.75, w: 7.0, h: 5.5, sobre: 'papel' },
    'Howard Schultz': { x: 76.75, y: 63.85, w: 7.0, h: 4.5, sobre: 'papel' },
    'George Lucas': { x: 76.25, y: 71.15, w: 10.5, h: 5.3, sobre: 'papel' },
  },
  coetaneos: {
    'Elon Musk': { x: 22.4, y: 89.6, w: 12.2, h: 6.0, sobre: 'placa' },
    'Jensen Huang': { x: 28.65, y: 80.35, w: 11.3, h: 6.1, sobre: 'placa' },
    'Gwynne Shotwell': { x: 35.4, y: 71.2, w: 11.2, h: 5.2, sobre: 'placa' },
    'Jony Ive': { x: 62.65, y: 65.0, w: 8.7, h: 4.4, sobre: 'placa' },
    'John Lasseter': { x: 72.4, y: 78.0, w: 10.8, h: 5.6, sobre: 'placa' },
    'Ryan Reynolds': { x: 79.35, y: 89.6, w: 12.3, h: 6.0, sobre: 'placa' },
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
