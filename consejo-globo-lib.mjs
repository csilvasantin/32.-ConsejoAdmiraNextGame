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
    { persona: 'Mira Murati', rol: 'COO' },
    { persona: 'John Lasseter', rol: 'CCO' },
    { persona: 'Jony Ive', rol: 'CDO' },
    { persona: 'Ryan Reynolds', rol: 'CSO' },
  ],
});

/**
 * Perfil del halo y de la flecha, en % del arte. `puntos` es el polígono
 * (4 o más vértices) del contorno real del folio o de la placa, medido en
 * píxeles sobre council-leyendas.jpg (1360×768) y council-coetaneos.jpg (1280×720).
 * x,y,w,h es la caja envolvente (centro + tamaño), por compatibilidad.
 * flecha={x,y}: punta de la flecha (hacia abajo) justo encima de la coronilla;
 * ausente o null si ese consejero no aparece en la foto (p. ej. Tim Cook).
 * Las coordenadas se conservan aunque `activo` sea false, para reactivar con un flag.
 * activo: si es false no se pinta flecha ni halo de papel/placa (Buffett, Rams,
 * Schultz, Cook, Murati, Reynolds, hasta que se activen).
 * nuncaFlecha: esa figura no lleva flecha nunca. En leyendas, Carlos Silva
 * (Y-3, centro) siempre está disponible y no lleva flecha. Disney sí: tiene
 * bot y está en la silla que era de Schultz (derecha).
 * sobre=papel: el folio o portapapeles real más cercano al asiento.
 * sobre=placa: no hay folio; el halo sigue la placa dorada.
 * sobre=ninguno: no se pinta halo de folio/placa.
 * El estado (verde/rojo/amarillo) no vive aquí: flecha y papel leen el mismo
 * mapa construido desde /api/consejo/estado (ver mapaEstados).
 * #7520: Lasseter en la silla de Ratti, sin Porat ni Ratti.
 */
export const PAPEL_POS = Object.freeze({
  leyendas: {
    'Steve Jobs': { activo: true, sobre: 'papel', puntos: [[18.162, 75.391], [21.397, 76.432], [25.588, 76.302], [27.5, 72.396], [29.559, 72.005], [30.147, 69.141], [25.662, 68.49], [25.588, 67.708], [24.338, 67.708], [23.971, 68.49], [21.324, 72.005], [20.074, 71.615]], flecha: { x: 10.368, y: 39.583 }, x: 24.154, y: 72.07, w: 11.985, h: 8.724 },
    'Steve Wozniak': { activo: true, sobre: 'papel', puntos: [[26.912, 61.458], [28.309, 62.5], [31.25, 62.5], [32.941, 60.156], [33.824, 59.115], [32.868, 58.594], [31.176, 58.724], [29.412, 58.464], [28.309, 58.333]], flecha: { x: 21.471, y: 31.51 }, x: 30.368, y: 60.416, w: 6.912, h: 4.167 },
    'Tim Cook': { activo: false, sobre: 'ninguno', puntos: [], flecha: null, x: 0, y: 0, w: 0, h: 0 },
    'Warren Buffett': { activo: false, sobre: 'papel', puntos: [[30, 51.823], [30.294, 52.734], [31.618, 52.344], [33.676, 52.344], [35.147, 53.125], [39.118, 54.427], [40.441, 53.125], [41.176, 51.823], [40.882, 50.651], [40.294, 50.391], [38.088, 50.391], [36.765, 51.042], [33.824, 50], [31.471, 50.521]], flecha: { x: 33.088, y: 24.479 }, x: 35.588, y: 52.213, w: 11.176, h: 4.427 },
    'Carlos Silva': { activo: true, nuncaFlecha: true, sobre: 'ninguno', puntos: [], flecha: { x: 50, y: 23.958 }, x: 0, y: 0, w: 0, h: 0 },
    'Walt Disney': { activo: true, sobre: 'papel', puntos: [[73.382, 63.932], [73.382, 64.714], [75.882, 64.714], [75.882, 65.234], [78.529, 65.234], [78.529, 64.062], [78.088, 63.021], [77.059, 62.24], [73.676, 63.411]], flecha: { x: 80, y: 32.292 }, x: 75.956, y: 63.737, w: 5.147, h: 2.994 },
    'Dieter Rams': { activo: false, sobre: 'papel', puntos: [[66.618, 59.375], [66.912, 58.854], [68.971, 58.594], [69.706, 58.464], [71.176, 58.203], [72.5, 58.203], [72.721, 61.849], [68.382, 62.37], [68.088, 61.458], [66.765, 60.547]], flecha: { x: 70.074, y: 23.958 }, x: 69.669, y: 60.287, w: 6.103, h: 4.167 },
    'Howard Schultz': { activo: false, sobre: 'ninguno', puntos: [], flecha: null, x: 0, y: 0, w: 0, h: 0 },
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
});


export function clavePersona(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Un único mapa persona→estado a partir de una instantánea de mesa. */
export function mapaEstados(mesa) {
  const m = Object.create(null);
  for (const gen of Object.keys(mesa || {})) {
    for (const s of (mesa[gen] || [])) {
      if (s && s.persona) m[clavePersona(s.persona)] = s.estado || 'desconocido';
    }
  }
  return m;
}

export function estadoDe(persona, mapa) {
  return (mapa && mapa[clavePersona(persona)]) || 'desconocido';
}

export function posDe(persona) {
  for (const gen of Object.keys(PAPEL_POS)) {
    if (PAPEL_POS[gen] && PAPEL_POS[gen][persona]) return PAPEL_POS[gen][persona];
  }
  return null;
}

/** ¿Pintamos flecha y halo? Para reactivar a Buffett o Rams, pon `activo: true`. */
export function esActivo(persona) {
  const p = typeof persona === 'string' ? posDe(persona) : persona;
  return !!(p && p.activo !== false);
}

/** La figura de Carlos Silva (Y-3) no lleva flecha nunca. */
export function nuncaFlecha(persona) {
  const p = typeof persona === 'string' ? posDe(persona) : persona;
  return !!(p && p.nuncaFlecha);
}

export function llevaFlecha(persona) {
  const p = typeof persona === 'string' ? posDe(persona) : persona;
  if (!p || p.activo === false || p.nuncaFlecha) return false;
  const fl = p.flecha;
  return !!(fl && Number.isFinite(Number(fl.x)) && Number.isFinite(Number(fl.y)));
}

export function llevaHalo(persona) {
  const p = typeof persona === 'string' ? posDe(persona) : persona;
  if (!p || p.activo === false) return false;
  if (p.sobre === 'ninguno' || p.sobre === 'cuerpo') return false;
  return Array.isArray(p.puntos) && p.puntos.length >= 3;
}

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
