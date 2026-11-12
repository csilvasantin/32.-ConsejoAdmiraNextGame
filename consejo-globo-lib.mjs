import {
  RANKING_GRUPOS, grupoDe, enRankingGrupo, unirMisionesHoy, etiquetaHoy, desgloseHoy,
  PERSONA_A_BOT,
} from './consejo-misiones-hoy.mjs';

export { RANKING_GRUPOS, grupoDe, enRankingGrupo, unirMisionesHoy, etiquetaHoy, desgloseHoy };

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

/**
 * Ranking por mesa: 6 consejeros en leyendas y 6 en coetáneos/actuales.
 * Carlos (Y-3), Cook y Schultz no entran (Cook y Schultz ya no están en la foto).
 * El puesto se pinta dentro de la flecha; la etiqueta es solo el recuento (sin «/6»).
 */
export const CONSEJO_RANKING = Object.freeze([
  ...RANKING_GRUPOS.leyendas,
  ...RANKING_GRUPOS.coetaneos,
]);
export const CONSEJO_RANKING_TOTAL = 6;
export const enRanking = (persona) => !!grupoDe(persona);

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
 * activo: si es false no se pinta flecha ni halo ni el rectángulo de cifra.
 * Buffett y Rams no están activados (Carlos, 21:50): coordenadas se conservan.
 * Cook y Schultz no están en la foto. Carlos (Y-3) tiene nuncaFlecha.
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
    'Elon Musk': { activo: true, sobre: 'placa', puntos: [[18.984, 81.25], [30.703, 81.25], [30.703, 87.639], [18.984, 87.639]], flecha: { x: 12.5, y: 44.722 }, x: 24.843, y: 84.445, w: 11.719, h: 6.389 },
    'Jensen Huang': { activo: true, sobre: 'placa', puntos: [[26.25, 69.722], [36.562, 69.722], [36.562, 75.278], [26.25, 75.278]], flecha: { x: 24.375, y: 43.333 }, x: 31.406, y: 72.5, w: 10.312, h: 5.556 },
    'Mira Murati': { activo: true, sobre: 'placa', puntos: [[36.094, 63.75], [45.469, 63.75], [45.469, 68.75], [36.094, 68.75]], flecha: { x: 37.3, y: 36.8 }, x: 40.782, y: 66.25, w: 9.375, h: 5.0 },
    'Jony Ive': { activo: true, sobre: 'placa', puntos: [[58.047, 62.5], [66.172, 62.5], [66.172, 67.222], [58.047, 67.222]], flecha: { x: 68.594, y: 39.444 }, x: 62.109, y: 64.861, w: 8.125, h: 4.722 },
    'John Lasseter': { activo: true, sobre: 'placa', puntos: [[69.531, 74.861], [80.156, 74.861], [80.156, 80.694], [69.531, 80.694]], flecha: { x: 77.188, y: 44.166 }, x: 74.844, y: 77.778, w: 10.625, h: 5.833 },
    'Ryan Reynolds': { activo: true, sobre: 'placa', puntos: [[75.781, 84.028], [87.656, 84.028], [87.656, 90.417], [75.781, 90.417]], flecha: { x: 89.531, y: 43.333 }, x: 81.719, y: 87.222, w: 11.875, h: 6.389 }
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

/** t1219u (Carlos): sin brillo ni halo en los papeles; basta la flecha de color.
 *  Las coordenadas del polígono se conservan por si se reactiva. */
export const PINTAR_HALOS = false;

/** ¿Pintamos flecha? Para reactivar a Buffett o Rams, pon `activo: true`. */
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
  if (!PINTAR_HALOS) return false;
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

/** Nombre de proyecto del latido (máx. 60). Vacío o ausente → null; no se inventa. */
export function nombreProyectoLatido(valor) {
  const t = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > 60 ? t.slice(0, 59).replace(/[\s·,;:.\-–—]+$/u, '') + '…' : t;
}

/**
 * Proyecto en el que está ahora el consejero, según su latido.
 * Si el latido está vigente, vigente=true. Si ya caducó, se devuelve el
 * último proyecto conocido (vigente=false) para pintarlo atenuado. Sin dato: nombre=null.
 */
export function proyectoDeLatido(entrada, ahoraS) {
  const nombre = nombreProyectoLatido(entrada && entrada.proyecto);
  if (!nombre) return { nombre: null, vigente: false };
  return { nombre, vigente: latidoVigente(entrada, ahoraS) };
}

/** Frase de estado del latido (campo mision). Vacía o ausente → null; no se inventa. */
export function fraseMisionLatido(entrada) {
  const t = String((entrada && entrada.mision) || '').replace(/\s+/g, ' ').trim();
  return t || null;
}

/**
 * Aplica un payload vivo de /consejeros/latido sobre una mesa ya armada:
 * actualiza estado, proyecto, en_curso, frase y el texto del globo.
 * No toca el recuento de hoy (eso sigue viniendo de /api/consejo/estado).
 */
export function aplicarLatidoEnMesa(mesa, consejeros, ahoraS) {
  if (!mesa || typeof mesa !== 'object') return mesa;
  const mapa = consejeros && typeof consejeros === 'object' ? consejeros : {};
  const ahora = Number.isFinite(Number(ahoraS)) ? Number(ahoraS) : Math.floor(Date.now() / 1000);
  for (const gen of Object.keys(mesa)) {
    const filas = mesa[gen];
    if (!Array.isArray(filas)) continue;
    for (const s of filas) {
      if (!s || !s.bot) continue;
      const entrada = mapa[s.bot] || null;
      s.proyecto = proyectoDeLatido(entrada, ahora);
      const vivo = latidoVigente(entrada, ahora);
      s.estado = vivo ? 'trabajando' : 'libre';
      s.frase = vivo ? fraseMisionLatido(entrada) : null;
      if (vivo) {
        const titulo = fraseMisionLatido(entrada);
        const numero = entrada && entrada.encargo ? Number(entrada.encargo) : null;
        const inicio = (entrada && (Number(entrada.desde) || Number(entrada.at))) || 0;
        s.en_curso = (titulo || numero) ? { numero: numero || null, titulo: titulo || (numero ? 'encargo' : null), inicio, fin: 0 } : null;
      } else {
        s.en_curso = null;
      }
      s.globo = lineasGlobo(s, ahora * 1000);
      s.texto = textoGlobo(s, ahora * 1000);
    }
  }
  return mesa;
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

/** Hora HH:MM (o fecha si es otro día). Si falta el dato, «—»; no se inventa. */
export function etiquetaHora(unixS, ahoraMs) {
  return horaMadrid(unixS, ahoraMs) || '—';
}

/**
 * Encargos que el consejero recibió hoy, de cualquier estado, según la
 * bandeja real (ts / created_at). pending, in_progress, done, blocked,
 * cancelled, etc. cuentan si llegaron hoy. No incluye PRs ni Yokup (esas
 * fuentes no exponen el censo de «recibidos hoy» en todos los estados).
 * items === null → no se puede atribuir (la bandeja no respondió).
 */
export function encargadosHoy(items, { desdeS, hastaS } = {}) {
  if (items == null) return { n: null };
  let n = 0;
  for (const x of (Array.isArray(items) ? items : [])) {
    const t = seg(x && (x.ts || x.created_at || x.created));
    if (!t || (desdeS && t < desdeS) || (hastaS && t > hastaS)) continue;
    n += 1;
  }
  return { n };
}

/**
 * Empezadas hoy = encargos recibidos hoy en la bandeja + misiones acabadas que
 * no salen de esa bandeja (Yokup, PRs, encargos de días anteriores cerrados hoy).
 * Toda misión acabada fue empezada: acabadas nunca supera empezadas (t518u).
 */
export function empezadasHoy(u, recibidas) {
  const n = (u && u.n != null && Number.isFinite(Number(u.n))) ? Number(u.n) : null;
  if (recibidas == null && n == null) return null;
  const fuera = (u && Array.isArray(u.misiones) ? u.misiones : [])
    .filter((m) => m && m.fuente && m.fuente !== 'inbox' && m.fuente !== 'latido').length;
  const base = (recibidas == null ? 0 : Number(recibidas)) + fuera;
  return Math.max(base, n == null ? 0 : n);
}

export function etiquetaMisiones(conseguidas, encargados) {
  const a = (conseguidas == null) ? '—' : String(conseguidas);
  const b = (encargados == null) ? '—' : String(encargados);
  return a + '/' + b;
}

function horasDeItem(x) {
  if (!x) return { inicio: 0, fin: 0 };
  const inicio = seg(x.ts) || seg(x.created_at) || seg(x.created) || seg(x.started_at) || 0;
  const fin = seg(x.done_at) || seg(x.closed_at) || 0;
  return { inicio, fin };
}

function lineaHoras({ inicio, fin, enCurso }, ahoraMs) {
  const ini = inicio ? etiquetaHora(inicio, ahoraMs) : '—';
  if (enCurso) return 'Inicio ' + ini + ' · Fin: en curso';
  const f = fin ? etiquetaHora(fin, ahoraMs) : '—';
  return 'Inicio ' + ini + ' · Fin ' + f;
}

function tituloMision(prefijo, obj) {
  if (!obj) return prefijo + '—';
  const t = obj.titulo || (obj.numero ? 'encargo' : '');
  if (!t && !obj.numero) return prefijo + '—';
  const ref = refEncargo(obj.numero, obj.etiqueta, t);
  return prefijo + (t || 'encargo') + (ref ? ' (' + ref + ')' : '');
}

/**
 * Líneas del globo de estado (sin «Libre»/«Ocupado»: eso lo dice la flecha).
 * { mision, horas, misiones }. Si no hay misión, mision y horas van vacíos.
 */
export function lineasGlobo(s, ahoraMs) {
  const misiones = 'Misiones: ' + etiquetaMisiones(s && s.hoy && s.hoy.n, s && s.hoy && s.hoy.encargados);
  if (!s || s.estado === 'desconocido') {
    return { mision: 'desconocido', horas: '', misiones };
  }
  if (s.estado === 'trabajando') {
    const e = s.en_curso || {};
    return {
      mision: tituloMision('Misión actual: ', e),
      horas: lineaHoras({ inicio: e.inicio, fin: 0, enCurso: true }, ahoraMs),
      misiones,
    };
  }
  const u = s.ultimo;
  if (u && (u.titulo || u.numero || u.inicio || u.fin || u.cuando)) {
    return {
      mision: tituloMision('Última misión: ', u),
      horas: lineaHoras({ inicio: u.inicio, fin: u.fin || 0, enCurso: false }, ahoraMs),
      misiones,
    };
  }
  return { mision: '', horas: '', misiones };
}

export function textoGlobo(s, ahoraMs) {
  const L = lineasGlobo(s, ahoraMs);
  if (!s || s.estado === 'desconocido') return 'desconocido';
  return [L.mision, L.horas].filter(Boolean).join('\n');
}

/** Último encargo done (nunca pending, ack, in_progress ni cancelled). */
export function ultimoHecho(items, ahoraS) {
  const list = Array.isArray(items) ? items : [];
  const dones = list
    .filter((x) => String(x && x.status) === 'done')
    .map((x) => {
      const h = horasDeItem(x);
      const cuando = h.fin || h.inicio || 0;
      return {
        numero: Number(x.id) || null,
        etiqueta: x.etiqueta || null,
        titulo: tituloCorto(x.text),
        cuando,
        inicio: h.inicio,
        fin: h.fin,
      };
    })
    .filter((x) => x.cuando && x.cuando <= ahoraS)
    .sort((a, b) => b.cuando - a.cuando);
  return dones[0] || null;
}

function cursoDesdeLatido(entrada) {
  if (!entrada) return null;
  const numero = entrada.encargo ? Number(entrada.encargo) : null;
  const titulo = tituloCorto(entrada.mision);
  if (!numero && !titulo) return null;
  const inicio = seg(entrada.desde) || seg(entrada.at) || 0;
  return { numero: numero || null, titulo: titulo || (numero ? 'encargo' : null), inicio, fin: 0 };
}

/**
 * Si el latido ya no está vigente, su misión cuenta como «último» si es más
 * reciente que el último done de la bandeja pública.
 */
export function ultimoDe(entrada, items, ahoraS) {
  const done = ultimoHecho(items, ahoraS);
  const at = entrada ? (seg(entrada.at) || seg(entrada.desde)) : 0;
  const desde = entrada ? (seg(entrada.desde) || 0) : 0;
  const deLatido = (!latidoVigente(entrada, ahoraS) && (at || desde) && (entrada.mision || entrada.encargo))
    ? {
        numero: entrada.encargo ? Number(entrada.encargo) : null,
        titulo: tituloCorto(entrada.mision) || (entrada.encargo ? 'encargo' : null),
        cuando: at || desde,
        inicio: desde || 0,
        // `at` solo es fin si es posterior a `desde`; si son iguales no se duplica.
        // `hasta` es caducidad del latido, no la hora real de cierre: no se usa.
        fin: (at && desde && at > desde) ? at : 0,
      }
    : null;
  if (deLatido && (!done || deLatido.cuando >= done.cuando)) {
    if ((!deLatido.inicio || !deLatido.fin) && deLatido.numero && Array.isArray(items)) {
      const item = items.find((x) => Number(x && x.id) === deLatido.numero);
      if (item) {
        const h = horasDeItem(item);
        if (!deLatido.inicio && h.inicio) deLatido.inicio = h.inicio;
        if (!deLatido.fin && h.fin) deLatido.fin = h.fin;
      }
    }
    return deLatido;
  }
  return done;
}

const FMT_DIA_MAD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_HMS_MAD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Día civil en Europe/Madrid, YYYY-MM-DD. */
export function diaMadrid(ahoraMs = Date.now()) {
  return FMT_DIA_MAD.format(new Date(ahoraMs));
}

/** Unix (s) de las 00:00 Europe/Madrid del día civil de `ahoraMs`. */
export function inicioDiaMadridS(ahoraMs = Date.now()) {
  const day = diaMadrid(ahoraMs);
  const [y, m, d] = day.split('-').map(Number);
  for (const offMin of [60, 120, 0]) {
    const t = Date.UTC(y, m - 1, d) - offMin * 60 * 1000;
    const p = Object.fromEntries(FMT_HMS_MAD.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === day && p.hour === '00' && p.minute === '00' && p.second === '00') {
      return Math.floor(t / 1000);
    }
  }
  let lo = Date.UTC(y, m - 1, d) - 36 * 3600 * 1000;
  let hi = Date.UTC(y, m - 1, d) + 36 * 3600 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (diaMadrid(mid) < day) lo = mid + 1;
    else hi = mid;
  }
  return Math.floor(lo / 1000);
}

/**
 * Encargos done cerrados hoy (00:00 Europe/Madrid … ahora).
 * items === null → no se puede atribuir (la bandeja no respondió).
 * Cancelled, pending e in_progress no cuentan.
 */
export function hechosHoy(items, { desdeS, hastaS }) {
  if (items == null) return { n: null, ultimo: 0 };
  const list = Array.isArray(items) ? items : [];
  let n = 0, ultimo = 0;
  for (const x of list) {
    if (String(x && x.status) !== 'done') continue;
    const t = seg(x.done_at) || seg(x.closed_at) || 0;
    if (!t || t < desdeS || t > hastaS) continue;
    n += 1;
    if (t > ultimo) ultimo = t;
  }
  return { n, ultimo };
}

export function etiquetaRanking(n, puesto, total = CONSEJO_RANKING_TOTAL) {
  return etiquetaHoy(n);
}

/**
 * Puesto 1 = quien más misiones done tiene hoy.
 * Empate en recuento: gana el que cerró el último done más tarde.
 * Si recuento y hora coinciden, comparten puesto (1, 2, 2, 4).
 * n === null (sin atribuir) no entra en el ranking.
 */
export function puestosHoy(filas) {
  const rankable = (filas || []).filter((f) => f && f.n != null);
  rankable.sort((a, b) => (b.n - a.n) || (b.ultimo - a.ultimo));
  const puestoDe = new Map();
  let i = 0;
  while (i < rankable.length) {
    let j = i + 1;
    while (j < rankable.length && rankable[j].n === rankable[i].n && rankable[j].ultimo === rankable[i].ultimo) j += 1;
    const puesto = i + 1;
    for (let k = i; k < j; k++) puestoDe.set(rankable[k].persona, puesto);
    i = j;
  }
  return puestoDe;
}

function itemsDeBandeja(bandejas, bot) {
  if (!bot) return null;
  if (!bandejas || !Object.prototype.hasOwnProperty.call(bandejas, bot)) return [];
  return bandejas[bot];
}

function hoyVacio() {
  return { n: null, ultimo: 0, puesto: null, total: CONSEJO_RANKING_TOTAL, etiqueta: null, misiones: [], por_fuente: { inbox: 0, yokup: 0, pr: 0, latido: 0 }, desglose: desgloseHoy({ inbox: 0, yokup: 0, pr: 0, latido: 0 }), encargados: null };
}

export function asientoPublico(def, { latidos, latidoPayload, bandejas, inboxOtros, prs, yokup, ahoraS, desdeS, dia, usarSemilla } = {}) {
  const bot = botDe(def.persona);
  const entrada = bot && latidos && latidos[bot] ? latidos[bot] : null;
  const items = itemsDeBandeja(bandejas, bot);
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
    proyecto: proyectoDeLatido(entrada, ahoraS),
    frase: estado === 'trabajando' ? fraseMisionLatido(entrada) : null,
    hoy: hoyVacio(),
  };
  const inicio = Number.isFinite(desdeS) ? desdeS : inicioDiaMadridS(ahoraS * 1000);
  const rec = encargadosHoy(items, { desdeS: inicio, hastaS: ahoraS });
  if (enRanking(def.persona)) {
    const u = unirMisionesHoy({
      persona: def.persona,
      bot,
      inbox: items,
      inboxOtros: inboxOtros,
      yokup: yokup == null ? null : yokup,
      prs: prs == null ? null : prs,
      latidoPayload: latidoPayload || (latidos ? { consejeros: latidos } : null),
      desdeS: inicio,
      hastaS: ahoraS,
      dia,
      usarSemilla,
    });
    s.hoy = {
      n: u.n,
      ultimo: u.ultimo,
      puesto: null,
      total: CONSEJO_RANKING_TOTAL,
      etiqueta: null,
      misiones: u.misiones,
      por_fuente: u.por_fuente,
      desglose: u.desglose,
      encargados: empezadasHoy(u, rec.n),
    };
  } else {
    s.hoy.encargados = rec.n;
  }
  s.globo = lineasGlobo(s, ahoraS * 1000);
  s.texto = textoGlobo(s, ahoraS * 1000);
  return s;
}

function aplicarRanking(mesa) {
  for (const [gen, sillas] of Object.entries(mesa)) {
    const filas = [];
    for (const s of sillas) {
      if (s && enRankingGrupo(s.persona, gen)) filas.push({ persona: s.persona, n: s.hoy && s.hoy.n, ultimo: s.hoy && s.hoy.ultimo });
    }
    const puestos = puestosHoy(filas);
    for (const s of sillas) {
      if (!s || !s.hoy || !enRankingGrupo(s.persona, gen)) continue;
      s.hoy.puesto = s.hoy.n == null ? null : (puestos.get(s.persona) || null);
      s.hoy.etiqueta = etiquetaRanking(s.hoy.n, s.hoy.puesto);
    }
  }
}

export function armarMesa({ latidos, latidoPayload, bandejas, inboxOtros, prs, yokup, ahoraMs, usarSemilla } = {}) {
  const ahoraS = Math.floor((ahoraMs || Date.now()) / 1000);
  const desdeS = inicioDiaMadridS(ahoraMs || ahoraS * 1000);
  const mesa = {};
  for (const [gen, defs] of Object.entries(MESA)) {
    mesa[gen] = defs.map((d) => asientoPublico(d, {
      latidos: latidos || (latidoPayload && latidoPayload.consejeros) || {},
      latidoPayload: latidoPayload || (latidos ? { consejeros: latidos } : null),
      bandejas: bandejas || {},
      inboxOtros,
      prs: prs == null ? null : prs,
      yokup: yokup,
      ahoraS,
      desdeS,
      dia: diaMadrid(ahoraMs || ahoraS * 1000),
      usarSemilla,
    }));
  }
  aplicarRanking(mesa);
  return {
    ok: true,
    generado: ahoraS,
    cache_s: CACHE_SEG,
    mesa,
    ranking: {
      dia: diaMadrid(ahoraMs || ahoraS * 1000),
      total: CONSEJO_RANKING_TOTAL,
      por_grupo: {
        leyendas: RANKING_GRUPOS.leyendas.slice(),
        coetaneos: RANKING_GRUPOS.coetaneos.slice(),
      },
      fuente: 'inbox done (propios o firmados) + misiones Yokup resolved + PRs fusionados (rama woz/* = Wozniak; atribución expresa t1212u para anw #396 y #398), desde 00:00 Europe/Madrid, sin duplicar. El latido no cuenta.',
    },
  };
}
