/**
 * Modo autónomo de las Leyendas (Carlos, 24-nov-2026, voz):
 *   https://www.admira.live/?autonomo=leyendas&tema=pan
 *   https://www.admira.live/escena0/?autonomo=leyendas&tema=pan
 *
 * Un clic de arranque desbloquea el audio. La mesa de Leyendas muestra el mapa
 * de PortAventura en el centro y Jobs, Disney, Woz y Lucas dialogan por turnos
 * sobre «El parque que se cuenta solo», con voz y bocadillos, hasta un resumen.
 * El guion local es la base; el backend (ask-one /conversacion) es opcional.
 * Puro (sin DOM): lo usan la home, Escena 0 y los tests.
 */
import { parseMesa, MESAS, IDEAS_PRESET } from './escena0-lib.mjs';

export const LEYENDAS = Object.freeze(MESAS.leyendas.slice());

export const TEMA_PAN = Object.freeze({
  id: 'pan',
  titulo: 'PortAventuraNeXT · «El parque que se cuenta solo»',
  tema: 'Presentación de PortAventuraNeXT, «El parque que se cuenta solo»: un parque donde cada historia que se compra, se come, se monta o se duerme ya existía antes en una pantalla. Una sala, cinco ordenadores, una cocina: un solo relato con un solo reloj.',
});


export const TEMA_ADMIRANEXT = Object.freeze({
  id: 'admiranext',
  titulo: 'AdmiraNeXT.com · el sistema operativo del retail',
  tema: 'Presentación de AdmiraNeXT.com: empresa agéntica de Robots-as-a-Service e IoT con IA, cuyo producto es el sistema operativo del retail: las 4 patas admira.studio (pixeria.com), admira.store (xpaceos.com), admira.biz (DooH y Retail Media, antes clearchannel.tv) y admira.app (instalaciones y mantenimiento, maestro del ITIL).',
  ideaId: 'cuatro-patas',
});

export const MAPA_ADMIRANEXT = '/assets/escena0/idea-admiranext.svg?v=20261126-lanzadera';

export const MAPA_PORTAVENTURA = (IDEAS_PRESET[0] && IDEAS_PRESET[0].src)
  || '/assets/escena0/idea-ip-portaventura.webp?v=20261119';

export const URL_HOME = '/?autonomo=leyendas&tema=pan';
export const URL_ESCENA0 = '/escena0/?autonomo=leyendas&tema=pan';
export const URL_PUBLICA_HOME = 'https://www.admira.live/?autonomo=leyendas&tema=pan';
export const URL_PUBLICA_ESCENA0 = 'https://www.admira.live/escena0/?autonomo=leyendas&tema=pan';
export const URL_HOME_ADMIRANEXT = '/?autonomo=leyendas&tema=admiranext';
export const URL_ESCENA0_ADMIRANEXT = '/escena0/?autonomo=leyendas&tema=admiranext';
export const URL_PUBLICA_HOME_ADMIRANEXT = 'https://www.admira.live/?autonomo=leyendas&tema=admiranext';

export const TIMEOUT_BACKEND_MS = 8000;

/** Guion local: solo las cuatro leyendas, sin saltar a Coetáneos. El último turno es el resumen. */
export const GUION_AUTONOMO_LEYENDAS_PAN = Object.freeze({
  id: 'autonomo-leyendas-pan',
  titulo: TEMA_PAN.titulo,
  tema: TEMA_PAN.tema,
  mesa: 'leyendas',
  turnos: Object.freeze([
    { persona: 'George Lucas', texto: 'Os presento PortAventuraNeXT: el parque que se cuenta solo. Cada historia que se compra, se come, se monta o se duerme ya existía antes en una pantalla.', textoEn: 'This is PortAventuraNeXT: the park that tells itself. Every story you buy, eat, ride or sleep in already lived on a screen.' },
    { persona: 'Walt Disney', texto: 'La magia tiene que sentirse desde la cola, no solo en cinco minutos de atracción. Si el visitante no se emociona primero, el resto es decorado.', textoEn: 'The magic has to be felt in the queue, not only in five minutes of ride. If the visitor is not moved first, the rest is decoration.' },
    { persona: 'Steve Jobs', texto: 'Eso es continuidad. Una sala, cinco ordenadores y una cocina: un solo relato con un solo reloj. Si no se entiende de un vistazo, no es un producto.', textoEn: 'That is continuity. One room, five computers and a kitchen: one story with one clock. If it is not obvious at a glance, it is not a product.' },
    { persona: 'Steve Wozniak', texto: 'Y que se pueda medir. Siete monitores, una sola pared de veintitrés mil píxeles: cada pantalla sabe cuánta gente tiene dentro, ahora mismo.', textoEn: 'And we have to measure it. Seven monitors, one wall of twenty-three thousand pixels: each screen knows how many people are inside, right now.' },
    { persona: 'George Lucas', texto: 'En la atracción se cruza la grieta y se vuelve contándolo. La cola ya es parte del relato, y sigue en el móvil al salir.', textoEn: 'On the ride you cross the rift and come back telling it. The queue is already part of the story, and it follows on the phone when you leave.' },
    { persona: 'Walt Disney', texto: 'Luego, las cuatro Xperiencias. En la tienda el visitante no compra una camiseta: se lleva el capítulo que acaba de vivir.', textoEn: 'Then the four Xperiences. In the shop the visitor does not buy a T-shirt: they take home the chapter they just lived.' },
    { persona: 'Steve Jobs', texto: 'En el restaurante, la carta y la campaña salen de la misma historia. Cortad todo lo que no haga sonreír al que está en la mesa.', textoEn: 'In the restaurant, the menu and the campaign come from the same story. Cut everything that does not make the person at the table smile.' },
    { persona: 'Steve Wozniak', texto: 'Y que jueguen ellos. Cualquier ratón dispara y el marcador vive en el 03. Interactivo, no un vídeo que se proyecta y se olvida.', textoEn: 'And let them play. Any mouse fires and the score lives on the 03. Interactive, not a video that plays and is forgotten.' },
    { persona: 'Walt Disney', texto: 'Al final del día, dormir dentro de la historia en el hotel LEGO. La casa que gira de noche es la misma que cruzó la pared.', textoEn: 'At the end of the day, sleep inside the story in the LEGO hotel. The house that turns at night is the same one that crossed the wall.' },
    { persona: 'Steve Jobs', texto: 'Una sala, una sola historia, un solo reloj. Eso es PortAventuraNeXT: el parque que se cuenta solo.', textoEn: 'One room, one story, one clock. That is PortAventuraNeXT: the park that tells itself.', resumen: true },
  ]),
});


/** Guion local de AdmiraNeXT.com: solo hechos de admiranext.com (filosofía, MCP, impacto, marca blanca). */
export const GUION_AUTONOMO_LEYENDAS_ADMIRANEXT = Object.freeze({
  id: 'autonomo-leyendas-admiranext',
  titulo: TEMA_ADMIRANEXT.titulo,
  tema: TEMA_ADMIRANEXT.tema,
  mesa: 'leyendas',
  turnos: Object.freeze([
    { persona: 'George Lucas', texto: 'Os presento AdmiraNeXT: donde las cosas se conectan a internet con inteligencia artificial. Es una empresa agéntica de Robots-as-a-Service e IoT, y su producto es el sistema operativo del retail.', textoEn: 'This is AdmiraNeXT: where things connect to the internet with artificial intelligence. It is an agentic Robots-as-a-Service and IoT company, and its product is the retail operating system.' },
    { persona: 'Walt Disney', texto: 'Ese sistema es una mesa de cuatro patas: la comunicación en el punto de venta. La coordinación de las cuatro es el sistema operativo del retail.', textoEn: 'That system is a four-legged table: communication at the point of sale. Coordinating the four is the retail operating system.' },
    { persona: 'Steve Jobs', texto: 'La primera pata crea. admira.studio, que es pixeria.com, Pixeria: importación y creación de contenidos para las pantallas y los altavoces.', textoEn: 'The first leg creates. admira.studio, which is pixeria.com, Pixeria: importing and creating content for screens and speakers.' },
    { persona: 'Steve Wozniak', texto: 'La segunda distribuye. admira.store, que es xpaceos.com, XpaceOS: inventario del punto de venta y distribución de los contenidos a cada pantalla y altavoz.', textoEn: 'The second distributes. admira.store, which is xpaceos.com, XpaceOS: point-of-sale inventory and distribution of the content to each screen and speaker.' },
    { persona: 'George Lucas', texto: 'La tercera comercializa. admira.biz, DooH y Retail Media —antes clearchannel.tv—: vende los Xpacios y ve todos los circuitos de un vistazo.', textoEn: 'The third commercializes. admira.biz, DooH and Retail Media —formerly clearchannel.tv—: it sells the Xpacios and sees every circuit at a glance.' },
    { persona: 'Walt Disney', texto: 'La cuarta mantiene. admira.app, instalaciones y mantenimiento: cuida cada Xpacio cada día y es el maestro del ITIL, el inventario tecnológico que reparte por MCP a las otras tres. El sitio anterior era el de Yokup.', textoEn: 'The fourth maintains. admira.app, installation and maintenance: it looks after each Xpacio every day and is the master of ITIL, the technology inventory it serves over MCP to the other three. Its previous site was Yokup’s.' },
    { persona: 'Steve Jobs', texto: 'Se coordinan en bucle: Studio, Store, Biz y App, y vuelta a empezar. El MCP es el pegamento: cada pata publica el suyo y todas se hablan por él.', textoEn: 'They run in a loop: Studio, Store, Biz and App, and back again. MCP is the glue: each leg publishes its own and they all talk through it.' },
    { persona: 'Steve Wozniak', texto: 'Y la empresa se organiza en una trilogía distinta del producto: la matriz admiranext.com, la tienda de robots admira.shop y el Consejo de Silicio admira.live, la única con API viva.', textoEn: 'And the company is organised in a trilogy that is not the product: the admiranext.com matrix, the robot shop admira.shop and the Silicon Council admira.live, the only one with a live API.' },
    { persona: 'Walt Disney', texto: 'En la narrativa de impacto lo dicen claro: no mostramos pantallas; mostramos lo que una persona puede hacer gracias a ellas. Historias de salud, comercio y movilidad, desde Barcelona.', textoEn: 'The impact narrative says it plainly: we do not show screens; we show what a person can do thanks to them. Stories of health, retail and mobility, from Barcelona.' },
    { persona: 'Steve Jobs', texto: 'Cuatro patas, un solo sistema operativo del retail. AdmiraNeXT: donde las cosas se conectan a internet con inteligencia artificial.', textoEn: 'Four legs, one retail operating system. AdmiraNeXT: where things connect to the internet with artificial intelligence.', resumen: true },
  ]),
});

function getParam(q, key) {
  if (!q) return '';
  if (typeof q.get === 'function') return q.get(key);
  if (typeof q === 'string') {
    try { return new URLSearchParams(q.startsWith('?') ? q : q.replace(/^[^?]*\?/, '')).get(key); }
    catch (e) { return ''; }
  }
  const v = q[key];
  return v == null ? '' : String(v);
}

function normTema(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolverTema(v) {
  const s = normTema(v);
  if (/^(admiranext|admira next|admiranext com)$/.test(s)) {
    return { ...TEMA_ADMIRANEXT, guion: GUION_AUTONOMO_LEYENDAS_ADMIRANEXT, ideaId: TEMA_ADMIRANEXT.ideaId };
  }
  if (!s || /^(pan|portaventura|portaventuranext|el parque que se cuenta solo)$/.test(s)) {
    return { ...TEMA_PAN, guion: GUION_AUTONOMO_LEYENDAS_PAN, ideaId: 'ip-portaventura' };
  }
  return { id: 'custom', titulo: String(v).trim(), tema: String(v).trim(), guion: GUION_AUTONOMO_LEYENDAS_PAN, ideaId: 'ip-portaventura' };
}

export function parseAutonomoUrl(q) {
  const raw = String(getParam(q, 'autonomo') || '').trim().toLowerCase();
  if (!raw || raw === '0' || raw === 'off' || raw === 'no' || raw === 'false') return null;
  let mesa = parseMesa(raw);
  if (!mesa && /^(1|on|si|yes|true|start|play)$/.test(raw)) {
    mesa = parseMesa(getParam(q, 'mesa') || getParam(q, 'gen') || getParam(q, 'generation')) || 'leyendas';
  }
  if (!mesa) return null;
  const tema = resolverTema(getParam(q, 'tema') || 'pan');
  return {
    activo: true,
    mesa,
    soportado: mesa === 'leyendas',
    temaId: tema.id,
    tema: tema.tema,
    titulo: tema.titulo,
    ideaId: tema.ideaId || 'ip-portaventura',
    guion: mesa === 'leyendas' ? (tema.guion || GUION_AUTONOMO_LEYENDAS_PAN) : null,
  };
}

export function siguienteTurno(guion, indice) {
  const turnos = (guion && guion.turnos) || [];
  const i = Number(indice) || 0;
  if (i < 0 || i >= turnos.length) return { fin: true, i, total: turnos.length };
  const t = turnos[i];
  return {
    fin: false,
    i,
    total: turnos.length,
    persona: t.persona,
    texto: t.texto,
    textoEn: t.textoEn || t.texto,
    esResumen: !!t.resumen,
    ultimo: i === turnos.length - 1,
  };
}

export function textoTurno(turno, idioma) {
  if (!turno) return '';
  return idioma === 'en' ? (turno.textoEn || turno.texto || '') : (turno.texto || '');
}

export function conTope(promesa, ms, err) {
  const error = err || new Error('timeout');
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(error), Math.max(0, Number(ms) || 0));
    Promise.resolve(promesa).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function resolverTurno(turno, opts) {
  opts = opts || {};
  const fallback = textoTurno(turno, opts.idioma);
  const ask = opts.ask;
  const ms = opts.timeoutMs == null ? TIMEOUT_BACKEND_MS : opts.timeoutMs;
  if (typeof ask !== 'function') {
    return { texto: fallback, fuente: 'guion', persona: turno && turno.persona, esResumen: !!(turno && turno.esResumen) };
  }
  try {
    const raw = await conTope(ask(turno), ms, new Error('timeout'));
    const texto = String(raw || '').replace(/\s+/g, ' ').trim();
    if (texto) return { texto, fuente: 'backend', persona: turno.persona, esResumen: !!turno.esResumen };
  } catch (e) {}
  return { texto: fallback, fuente: 'guion', persona: turno && turno.persona, esResumen: !!(turno && turno.esResumen) };
}

export function formatHoraInicio(date, zona) {
  const tz = zona || 'Europe/Madrid';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  let s = fmt.format(d).replace(/\./g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\d{4}),?\s*/, '$1, ');
  return s + ' (' + tz + ')';
}

export function etiquetaMision(inicio, idioma) {
  const hora = typeof inicio === 'string' ? inicio : formatHoraInicio(inicio);
  if (idioma === 'en') return hora ? 'Mission started: ' + hora : 'Mission started';
  return hora ? 'Misión iniciada: ' + hora : 'Misión iniciada';
}

export function personasDelGuion(guion) {
  const seen = [];
  for (const t of (guion && guion.turnos) || []) {
    if (t && t.persona && !seen.includes(t.persona)) seen.push(t.persona);
  }
  return seen;
}
