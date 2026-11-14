/**
 * Escena 0 · guiones y cabecera de mesa (Lucas, 14-nov-2026, pedido de Carlos).
 * - GUION_PAN: la presentación de PortAventuraNeXT contada consejero vs consejero
 *   (Leyendas ↔ Coetáneos), sacada del guion del show del lunes 16-nov (Planeta 7, «Terminator»).
 * - CABECERAS: invitados que se sientan en la cabecera de la mesa de los Coetáneos.
 *   Sin cargo inventado: solo nombre y retrato.
 * Puro (sin DOM): lo usan escena0.js, la home (assets/consejo-cabecera.js lo replica) y los tests.
 */
import { MESAS } from './escena0-lib.mjs';

export const GUION_PAN = Object.freeze({
  id: 'pan',
  titulo: 'PortAventuraNeXT · «El parque que se cuenta solo»',
  tema: 'Presentación de PortAventuraNeXT, «El parque que se cuenta solo»: un parque donde cada historia que se compra, se come, se monta o se duerme ya existía antes en una pantalla. Una sala, cinco ordenadores, una cocina: un solo relato con un solo reloj.',
  cierre: 'portaventuranext.com',
  turnos: Object.freeze([
    { persona: 'George Lucas', texto: 'Os presento PortAventuraNeXT: el parque que se cuenta solo. Cada historia que se compra, se come, se monta o se duerme ya existía antes en una pantalla.' },
    { persona: 'Elon Musk', texto: 'Bonito mito, George. El problema real son cinco minutos de magia y cincuenta de colas, mapas y menús. La historia se corta en cada puerta. ¿Qué lo arregla?' },
    { persona: 'Steve Jobs', texto: 'La continuidad. Una sala, cinco ordenadores y una cocina: un solo relato con un solo reloj. Cada pantalla es un mundo y sabe cuánta gente tiene dentro, ahora mismo.' },
    { persona: 'Jensen Huang', texto: 'Y cuando el parque quiere, las cinco pantallas cuentan lo mismo en el mismo fotograma. Sin un técnico y sin un USB: eso es cómputo bien orquestado.' },
    { persona: 'Steve Wozniak', texto: 'Siete monitores, una sola pared de veintitrés mil píxeles. Los visitantes LEGO de la Casa Creel salen de un ventilador y entran en otro.' },
    { persona: 'Elon Musk', texto: 'Entonces que jueguen ellos. Cualquier ratón dispara y el marcador vive en el 03. Interactivo, no un vídeo.' },
    { persona: 'Walt Disney', texto: 'Luego, las cuatro Xperiencias. En la tienda el visitante no compra una camiseta: se lleva el capítulo que acaba de ver.' },
    { persona: 'Jensen Huang', texto: 'En el restaurante, la carta, la campaña y el merchandising salen de la misma historia y se lanzan desde el mismo sitio.' },
    { persona: 'George Lucas', texto: 'En la atracción se cruza la grieta y se vuelve contándolo. La cola ya es parte de la atracción, y sigue en el móvil al salir.' },
    { persona: 'Steve Jobs', texto: 'Y al final del día, dormir dentro de la historia en el hotel LEGO. La casa que gira de noche es la misma que cruzó la pared.' },
    { persona: 'Elon Musk', texto: '{cabecera}, la cabecera es tuya: créditos y portaventuranext.com en las cinco pantallas. ¿Lo lanzamos?' },
    { persona: 'Walt Disney', texto: 'Una sala, una sola historia. Eso es PortAventuraNeXT.' },
  ]),
});

export const GUIONES = Object.freeze({ pan: GUION_PAN });

export function parseGuion(v) {
  const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['pan', 'portaventura', 'portaventuranext', 'portaventuranextcom'].includes(s)) return GUION_PAN;
  return null;
}

/** Invitados de cabecera. Posición en % del arte de Coetáneos (1280×720): la silla del fondo, al centro. */
export const CABECERAS = Object.freeze({
  'carlo-bonomi': Object.freeze({
    id: 'carlo-bonomi',
    nombre: 'Carlo Bonomi',
    corto: 'Carlo',
    foto: '/assets/cabecera/carlo-bonomi.webp?v=20261114-cabecera',
    alias: Object.freeze(['bonomi', 'carlo', 'carlo bonomi', 'carlo-bonomi', 'carlobonomi']),
  }),
});

export const CABECERA_POS = Object.freeze({ mesa: 'coetaneos', x: 44.6, y: 31, w: 11.6, h: 27.5 });

export function plano(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
}

/** «bonomi», «Carlo Bonomi»… → ficha; «off»/«no»/vacío → null. */
export function parseCabecera(v) {
  const n = plano(v);
  if (!n || ['off', 'no', 'ninguno', 'nadie', 'vacia', 'vacio', '0', 'false'].includes(n)) return null;
  for (const c of Object.values(CABECERAS)) {
    if (plano(c.nombre) === n || c.id === n || c.alias.includes(n)) return c;
  }
  return null;
}

/** Texto del turno con el invitado de cabecera (o Carlos, si no hay invitado). */
export function textoTurno(turno, cabecera) {
  const quien = (cabecera && cabecera.corto) || 'Carlos';
  return String((turno && turno.texto) || '').replace(/\{cabecera\}/g, quien);
}

export function mesaDeGuion(persona) {
  if (MESAS.leyendas.includes(persona)) return 'leyendas';
  if (MESAS.coetaneos.includes(persona)) return 'coetaneos';
  return null;
}

/** Bolsa por consejero (orden del guion), para el modo de dos pantallas con el canal compartido. */
export function bolsasGuion(guion, cabecera) {
  const out = {};
  for (const t of (guion && guion.turnos) || []) {
    (out[t.persona] = out[t.persona] || []).push(textoTurno(t, cabecera));
  }
  return out;
}

/** Prompt de IA para un turno del guion: la idea es fija, las palabras son del consejero. */
export function promptGuion(guion, i, cabecera, dichos = []) {
  const t = guion.turnos[i];
  const mesa = mesaDeGuion(t.persona) === 'leyendas' ? 'las Leyendas' : 'los Coetáneos';
  const otra = mesa === 'las Leyendas' ? 'los Coetáneos' : 'las Leyendas';
  const quien = (cabecera && cabecera.nombre) || 'Carlos';
  const previo = dichos.slice(-3).map((d) => `${d.persona}: ${d.texto}`).join('\n');
  return `Escena 0 del Consejo AdmiraNeXT: presentación de ${guion.titulo}, consejero contra consejero, entre ${mesa} (tu mesa) y ${otra}. En la cabecera escucha ${quien}. `
    + (previo ? `Lo último dicho:\n${previo}\n\n` : '')
    + `Te toca a ti. Di esta idea en 1-2 frases, en tu estilo y en primera persona, sin acotaciones ni saludos: «${textoTurno(t, cabecera)}»`;
}

/** Duración de lectura de un turno sin voz (ms): ~15 caracteres/s, entre 4 y 11 s. */
export function msLectura(texto) {
  return Math.max(4000, Math.min(11000, Math.round(String(texto || '').length / 15 * 1000)));
}
