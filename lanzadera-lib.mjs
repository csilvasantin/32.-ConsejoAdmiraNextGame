/**
 * Lanzadera de presentaciones (Carlos, 26-nov-2026, t430u):
 *   https://www.admira.live/lanzadera/
 *
 * Dos líneas: Demo AdmiraNeXT.com y Demo PortAventuraNeXT.com.
 * Al decir o seleccionar una, las Leyendas presentan ese contenido en la
 * pantalla externa del MacBook Air Rosa (TCL a la derecha) y el consumo
 * sale en el MacBook Air Plata, enfrente.
 * Puro (sin DOM): lo usan la página, la CLI y los tests.
 */
import { formatHoraInicio, etiquetaMision } from './consejo-autonomo-leyendas.mjs';

export { formatHoraInicio, etiquetaMision };

export const URL_LANZADERA = '/lanzadera/';
export const URL_PUBLICA_LANZADERA = 'https://www.admira.live/lanzadera/';
export const URL_CONSUMOS = 'https://www.admira.live/consumos';

/** Destinos de flota. Los machineId salen de ListMachines (26-nov-2026). */
export const MAQUINA_ROSA = Object.freeze({
  etiqueta: 'MacBookAirRosa',
  machineId: 'bc1275fb-b0a7-427b-a644-b0c11a2176f8',
  papel: 'Consejo de las Leyendas en la pantalla externa (TCL a la derecha del portátil, 1920×1080, display 3 en x=1713).',
  display: Object.freeze({ index: 3, x: 1713, y: 0, w: 1920, h: 1080 }),
});

export const MAQUINA_PLATA = Object.freeze({
  etiqueta: 'MacBookAirPlata',
  machineId: 'f52231d0-b9c0-44d2-8cde-c8646cfb27f6',
  alterno: 'acc7080f-9993-4d21-a285-bd549c2db0f2',
  papel: 'Página de consumo, enfrente del Rosa.',
});

export const DEMOS = Object.freeze({
  admiranext: Object.freeze({
    id: 'admiranext',
    titulo: 'Demo AdmiraNeXT.com',
    tituloEn: 'AdmiraNeXT.com Demo',
    tema: 'admiranext',
    urlLeyendas: 'https://www.admira.live/?autonomo=leyendas&tema=admiranext',
    urlConsumos: URL_CONSUMOS,
    fuentes: Object.freeze([
      'https://www.admiranext.com/',
      'https://www.admiranext.com/filosofia',
      'https://www.admiranext.com/mcp/',
      'https://www.admiranext.com/impacto/',
      'https://www.admiranext.com/marcablanca/',
    ]),
  }),
  pan: Object.freeze({
    id: 'pan',
    titulo: 'Demo PortAventuraNeXT.com',
    tituloEn: 'PortAventuraNeXT.com Demo',
    tema: 'pan',
    urlLeyendas: 'https://www.admira.live/?autonomo=leyendas&tema=pan',
    urlConsumos: URL_CONSUMOS,
    fuentes: Object.freeze(['https://www.portaventuranext.com/']),
  }),
});

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,;:"'“”‘’]+/g, ' ')
    .replace(/[^a-z0-9./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function idDeTema(tok) {
  const s = String(tok || '').replace(/\s+/g, '');
  if (!s) return null;
  if (/^(admiranext(?:\.com)?|ad\s*mira\s*next(?:\.com)?)$/.test(s) || s === 'admiranextcom') return 'admiranext';
  if (/^(pan|portaventura|portaventuranext(?:\.com)?)$/.test(s) || s === 'portaventuranextcom') return 'pan';
  return null;
}

/**
 * Reconoce la selección o la orden de voz/CLI.
 * Acepta «Demo AdmiraNeXT.com», «/demo admiranext», «lanzar demo portaventura»,
 * «/lanzadera», «/demo» (solo abre la lanzadera) y ?demo=.
 * No dispara si la frase es una pregunta larga que solo menciona la demo.
 */
export function parseComandoDemo(texto) {
  const raw = String(texto == null ? '' : texto).trim();
  if (!raw) return null;
  const s = norm(raw).replace(/^\//, '');

  if (/^(lanzadera|launcher|lanzadera de presentaciones|presentaciones)$/.test(s)) {
    return { tipo: 'lanzadera', demo: null };
  }

  const pref = '(?:(?:lanza|lanzar|abre|abrir|elige|elegir|selecciona|selecciono|seleccionar|pon|poner|quiero|muestra|mostrar|arranca|arrancar|inicia|iniciar)\\s+)?(?:la\\s+)?';
  const m = s.match(new RegExp('^' + pref + 'demo\\s*(?:de\\s+)?(.+)?$'));
  if (!m) return null;

  const resto = String(m[1] || '').trim();
  if (!resto || /^(help|ayuda|\?|lista|list)$/.test(resto)) {
    return { tipo: 'lanzadera', demo: null };
  }
  const id = idDeTema(resto.replace(/\s+/g, ''));
  if (!id) return { tipo: 'lanzadera', demo: null, desconocido: resto };
  return { tipo: 'demo', demo: DEMOS[id] };
}

export function demoPorId(id) {
  const s = String(id || '').trim().toLowerCase();
  if (DEMOS[s]) return DEMOS[s];
  return (idDeTema(s.replace(/\s+/g, '')) && DEMOS[idDeTema(s.replace(/\s+/g, ''))]) || null;
}

export function urlLanzaderaDemo(id) {
  const d = demoPorId(id);
  if (!d) return URL_LANZADERA;
  return URL_LANZADERA + '?demo=' + encodeURIComponent(d.id);
}

export function planDeLanzamiento(demo, inicio) {
  const d = typeof demo === 'string' ? demoPorId(demo) : demo;
  if (!d) return null;
  const hora = typeof inicio === 'string' ? inicio : formatHoraInicio(inicio || new Date());
  return {
    demo: d,
    inicio: hora,
    etiqueta: etiquetaMision(hora, 'es'),
    etiquetaEn: etiquetaMision(hora, 'en'),
    rosa: {
      ...MAQUINA_ROSA,
      url: d.urlLeyendas,
    },
    plata: {
      ...MAQUINA_PLATA,
      url: d.urlConsumos,
    },
    cursor: 'El cursor no se oculta nunca: si se mueve el ratón, tiene que reaparecer.',
  };
}
