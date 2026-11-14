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

/** Lunes 16-nov 13:00: Carlos Silva (centro de las Leyendas) presenta y Carlo Bonomi (cabecera de los
 *  Coetáneos) pregunta. Personas reales: sin IA (soloGuion) y sin voz sintética (sinVoz), el globo se lee.
 *  Fuentes: GUION.md del show y la conversación Jobs–Elon del 14-nov (identidad, piloto en el Studio). */
export const GUION_CARLOS_BONOMI = Object.freeze({
  id: 'carlos-bonomi',
  titulo: 'PortAventuraNeXT · Carlos Silva y Carlo Bonomi',
  tema: 'Presentación de PortAventuraNeXT: el parque que se cuenta solo, con la identidad del visitante y un piloto medido en la entrada del Studio.',
  cierre: 'portaventuranext.com',
  cabecera: 'carlo-bonomi',
  soloGuion: true,
  sinVoz: true,
  bilingue: true,
  tituloEn: 'PortAventuraNeXT · Carlos Silva and Carlo Bonomi',
  turnos: Object.freeze([
    { persona: 'Carlo Bonomi', texto: 'Carlos, la mesa es tuya. ¿Qué es PortAventuraNeXT en una frase?', en: 'Carlos, the floor is yours. What is PortAventuraNeXT in one sentence?' },
    { persona: 'Carlos Silva', texto: 'El parque que se cuenta solo. No va de más atracciones: va de que cada visitante sienta que el parque le reconoce.', en: 'The park that tells its own story. It\'s not about more rides — it\'s about every visitor feeling the park knows them.' },
    { persona: 'Carlo Bonomi', texto: '¿Qué problema concreto resuelve?', en: 'What concrete problem does it solve?' },
    { persona: 'Carlos Silva', texto: 'Hoy el visitante vive cinco minutos de magia y cincuenta de colas, mapas y menús. La historia se corta en cada puerta.', en: 'Today a visitor gets five minutes of magic and fifty of queues, maps and menus. The story breaks at every door.' },
    { persona: 'Carlo Bonomi', texto: '¿Y eso se arregla poniendo más pantallas?', en: 'And you fix that with more screens?' },
    { persona: 'Carlos Silva', texto: 'Con menos. Una sola experiencia, sin colas y sin pantallas de sobra: cada una enseña solo lo que el visitante necesita.', en: 'With fewer. One experience, no queues, no extra screens: each one shows only what the visitor needs.' },
    { persona: 'Carlo Bonomi', texto: '¿Por dónde se empieza?', en: 'Where do you start?' },
    { persona: 'Carlos Silva', texto: 'Por la identidad. Una pulsera o la app, ligada a una sola cuenta, que le reconoce en cada punto de contacto.', en: 'With identity. A wristband or the app, tied to a single account, that recognises them at every touchpoint.' },
    { persona: 'Carlo Bonomi', texto: '¿Y qué ve el visitante en ese momento?', en: 'And what does the visitor see at that moment?' },
    { persona: 'Carlos Silva', texto: 'Un solo gesto: la pulsera le reconoce y la pantalla le enseña su siguiente paso y su espera real. En la tienda, el restaurante, la atracción y el hotel sigue la misma historia.', en: 'One gesture: the wristband recognises them, and the screen shows their next step and their real wait. In the shop, the restaurant, the ride and the hotel, the same story carries on.' },
    { persona: 'Carlo Bonomi', texto: '¿Dónde lo probáis, y cómo sabremos si funciona?', en: 'Where do you pilot it, and how will we know it works?' },
    { persona: 'Carlos Silva', texto: 'Con un piloto en la entrada del Studio y un solo flujo de datos. Medimos minutos de espera y si el contenido era de verdad suyo. Si no emociona, no se escala.', en: 'A pilot at the Studio entrance, with a single data flow. We measure minutes of waiting and whether the content was truly theirs. If it doesn\'t move people, we don\'t scale it.' },
  ]),
});

/** Personas que hablan en un guion sin ser consejeros de la mesa: su mesa y la punta del globo (% del arte). */
export const PERSONAS_GUION = Object.freeze({
  'Carlos Silva': Object.freeze({ mesa: 'leyendas', ancla: Object.freeze({ x: 51.2, y: 24.5 }) }),
  'Carlo Bonomi': Object.freeze({ mesa: 'coetaneos', ancla: Object.freeze({ x: 50, y: 38.5 }) }),
});

export function anclaGuion(mesa, persona) {
  const p = PERSONAS_GUION[persona];
  return p && p.mesa === mesa ? p.ancla : null;
}

/** Gartner Top 10 Strategic Technology Trends for 2027 (PDF GTS_542668, 28 págs.), contado por Carlos Silva
 *  (centro de las Leyendas) a Carlo Bonomi (cabecera de los Coetáneos). Solo cifras y frases del documento:
 *  págs. 2-4 (idea y frentes), 7 (voz), 12 (contexto), 16 (identidad de agente) y 23 (aplicaciones desechables).
 *  Lo de AdmiraNeXT: digital signage, retail media, phygital, el Consejo de agentes y PortAventuraNeXT. */
export const GUION_GARTNER = Object.freeze({
  id: 'gartner',
  titulo: 'Gartner 2027 · Carlos Silva y Carlo Bonomi',
  tituloEn: 'Gartner 2027 · Carlos Silva and Carlo Bonomi',
  tema: 'Las diez tendencias tecnológicas estratégicas de Gartner para 2027 y qué hace AdmiraNeXT con ellas.',
  cierreTitulo: 'AdmiraNeXT',
  cierre: 'Gartner · Top 10 Strategic Technology Trends for 2027',
  cabecera: 'carlo-bonomi',
  soloGuion: true,
  sinVoz: true,
  bilingue: true,
  turnos: Object.freeze([
    { persona: 'Carlo Bonomi', texto: 'Carlos, Gartner ya ha publicado sus diez tendencias tecnológicas estratégicas para 2027. ¿Cuál es la idea de fondo?', en: 'Carlos, Gartner has published its top ten strategic technology trends for 2027. What\'s the big idea?' },
    { persona: 'Carlos Silva', texto: 'Dominar los nuevos límites del comportamiento de las máquinas. Pasamos de la escasez de software a la abundancia, y de ejecutar código a orquestar trabajadores autónomos.', en: 'Mastering the new boundaries of machine behavior. We\'re moving from software scarcity to abundance, and from running static code to orchestrating autonomous machine workers.' },
    { persona: 'Carlo Bonomi', texto: 'Son tres frentes. Empecemos por el primero: ¿qué es la IA no textual y por qué te importa?', en: 'There are three fronts. Start with the first: what is nontextual AI, and why should you care?' },
    { persona: 'Carlos Silva', texto: 'Modelos que calculan, oyen y simulan. Gartner prevé que en 2030 más del 70% de las interacciones de voz de las empresas las lleven modelos de voz de forma autónoma, frente a menos del 10% en 2026.', en: 'Models that calculate, hear and simulate. Gartner expects that by 2030, over 70% of enterprise voice interactions will be handled autonomously by speech models, up from less than 10% in 2026.' },
    { persona: 'Carlo Bonomi', texto: 'Pero la voz razona menos a fondo que el texto. ¿No es un riesgo?', en: 'But voice reasons less deeply than text. Isn\'t that a risk?' },
    { persona: 'Carlos Silva', texto: 'Lo es, y Gartner lo dice: modelos rápidos para lo rutinario y razonamiento profundo para lo complejo. En PortAventuraNeXT la voz solo da órdenes cortas, como «hola Admira, siguiente».', en: 'It is, and Gartner says so: fast models for routine tasks, deep reasoning for complex decisions. In PortAventuraNeXT, voice only gives short commands, like “hola Admira, siguiente”.' },
    { persona: 'Carlo Bonomi', texto: 'Segundo frente: gobernar a los agentes. ¿Cómo evitas que se equivoquen?', en: 'Second front: governing the agents. How do you stop them from getting it wrong?' },
    { persona: 'Carlos Silva', texto: 'Con contexto. Según Gartner, en 2027 quien priorice la semántica en sus datos preparados para IA aumentará la precisión de la IA agéntica hasta un 80% y reducirá costes hasta un 60%. Nuestro Consejo de agentes trabaja así: cada uno con su rol y el contexto del proyecto.', en: 'With context. According to Gartner, by 2027 organizations that prioritize semantics in AI-ready data will increase agentic AI accuracy by up to 80% and reduce costs by up to 60%. Our council of AI agents works that way: each with its own role and the project\'s context.' },
    { persona: 'Carlo Bonomi', texto: '¿Y quién responde de lo que hace un agente?', en: 'And who is accountable for what an agent does?' },
    { persona: 'Carlos Silva', texto: 'Gartner avisa: en 2028, el 25% de las brechas de seguridad empresariales tendrán su origen en el abuso de agentes de IA. Por eso cada consejero firma lo que hace, y lo que sale fuera lo aprueba una persona.', en: 'Gartner warns that by 2028, 25% of enterprise security breaches will trace back to AI agent abuse. That\'s why every councillor signs its work, and anything that goes out is approved by a person.' },
    { persona: 'Carlo Bonomi', texto: 'Tercer frente: agilidad duradera. ¿Qué cambia en una tienda o en un parque?', en: 'Third front: durable agility. What changes in a store or a park?' },
    { persona: 'Carlos Silva', texto: 'Gartner prevé que en 2030 las organizaciones líderes hagan que el 80% de sus aplicaciones nuevas sean desechables y fáciles de sustituir. Así trabajamos el digital signage y el retail media: cada campaña o experiencia phygital se lanza, cumple su función y se retira.', en: 'By 2030, Gartner expects leading organizations to make 80% of their new applications disposable and easy to replace. That\'s how we run digital signage and retail media: each campaign or phygital experience launches, does its job and is retired.' },
    { persona: 'Carlo Bonomi', texto: 'Si me llevo una sola frase al comité, ¿cuál es?', en: 'If I take one sentence back to the board, what is it?' },
    { persona: 'Carlos Silva', texto: 'Gartner habla de máquinas que hay que gobernar. AdmiraNeXT las pone donde está la gente: en la pantalla, en la tienda y en el parque, con límites claros y con emoción. Si no emociona, no se escala.', en: 'Gartner talks about machines that need governing. AdmiraNeXT puts them where people are: on the screen, in the store and in the park, with clear limits and with emotion. If it doesn\'t move people, it doesn\'t scale.' },
  ]),
});

export const GUIONES = Object.freeze({ pan: GUION_PAN, 'carlos-bonomi': GUION_CARLOS_BONOMI, gartner: GUION_GARTNER });

export function parseGuion(v) {
  const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['pan', 'portaventura', 'portaventuranext', 'portaventuranextcom'].includes(s)) return GUION_PAN;
  if (['carlosbonomi', 'carlossilvabonomi', 'carlossilvacarlobonomi', 'bonomi'].includes(s)) return GUION_CARLOS_BONOMI;
  if (['gartner', 'gartner2027', 'tendencias', 'trends', 'toptrends2027'].includes(s)) return GUION_GARTNER;
  return null;
}

/** Invitados de cabecera: sentados como un consejero más (dibujo recortado, silla azul), al fondo y al centro.
 *  Posición en % del arte de Coetáneos (1280×720); las manos se apoyan en la mesa del arte. */
export const CABECERAS = Object.freeze({
  'carlo-bonomi': Object.freeze({
    id: 'carlo-bonomi',
    nombre: 'Carlo Bonomi',
    corto: 'Carlo',
    foto: '/assets/cabecera/carlo-bonomi-sentado.webp?v=20261114-cartoon',
    alias: Object.freeze(['bonomi', 'carlo', 'carlo bonomi', 'carlo-bonomi', 'carlobonomi']),
  }),
});

/** Demo (Carlos, 14-11 18:22): en las escenas de presentación el neón de la mesa de los Coetáneos dice
 *  «PortAventuraNeXT» en vez de «AdmiraNext». Parche del arte (% del arte 1280×720), hecho con
 *  tools/logo-mesa-portaventuranext.py; la home normal sigue con AdmiraNext. */
export const LOGO_DEMO = Object.freeze({ mesa: 'coetaneos', foto: '/assets/demo/logo-portaventuranext.webp?v=20261114-pan', x: 36.5625, y: 74.1667, w: 26.4062, h: 13.3333 });

export const CABECERA_POS = Object.freeze({ mesa: 'coetaneos', x: 43.125, y: 36.944, w: 13.672, h: 28.056 });

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
  if (PERSONAS_GUION[persona]) return PERSONAS_GUION[persona].mesa;
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


/** Idioma del globo: ?lang=es|en|both. Solo los guiones bilingües muestran inglés; por defecto, los dos. */
export function parseLang(v, guion) {
  if (!guion || !guion.bilingue) return 'es';
  const n = plano(v);
  if (['en', 'english', 'ingles'].includes(n)) return 'en';
  if (['es', 'spanish', 'espanol', 'castellano'].includes(n)) return 'es';
  return 'both';
}

/** Líneas del turno según el idioma: [{ lang, texto }]. */
export function lineasTurno(turno, cabecera, lang = 'es') {
  const es = textoTurno(turno, cabecera);
  const en = String((turno && turno.en) || '').replace(/\{cabecera\}/g, (cabecera && cabecera.corto) || 'Carlos');
  if (lang === 'en' && en) return [{ lang: 'en', texto: en }];
  if (lang === 'both' && en) return [{ lang: 'es', texto: es }, { lang: 'en', texto: en }];
  return [{ lang: 'es', texto: es }];
}

/** Rótulos del flujo, en inglés para los guiones bilingües. */
export const ROTULOS_EN = Object.freeze({
  leyendas: '1 · Council of Legends',
  coetaneos: '2 · Council of Peers',
  conversacion: '3 · Conversation · councillor to councillor',
  cabecera: 'at the head of the table',
});

/* ── Cajas de texto del flujo (14-11-2026, Carlos: «las cajas se pisan») ──────────────────
 * Una sola caja a la vez, en una zona libre de cada arte (% del arte): en las Leyendas, sobre la
 * mesa, debajo de las caras; en los Coetáneos, entre las pancartas, encima de las cabezas.
 * OBSTACULOS: caras, placas y logo del arte (% del arte) que ninguna caja puede pisar. */
export const ZONAS_GLOBO = Object.freeze({
  leyendas: Object.freeze({ x0: 26, x1: 74, y0: 55, y1: 93, crece: 'abajo' }),
  coetaneos: Object.freeze({ x0: 33.5, x1: 66.5, y0: 2.5, y1: 35, crece: 'arriba' }),
});

export const OBSTACULOS = Object.freeze({
  leyendas: Object.freeze([
    { id: 'cara Steve Jobs', x0: 5, y0: 39, x1: 16, y1: 53 },
    { id: 'cara Steve Wozniak', x0: 16, y0: 32, x1: 27, y1: 47 },
    { id: 'cara Warren Buffett', x0: 28, y0: 25, x1: 38, y1: 40 },
    { id: 'cara Carlos Silva', x0: 45, y0: 23.5, x1: 57, y1: 40 },
    { id: 'cara Dieter Rams', x0: 65, y0: 25, x1: 75, y1: 40 },
    { id: 'cara Walt Disney', x0: 74, y0: 30, x1: 85, y1: 45 },
    { id: 'cara George Lucas', x0: 86, y0: 40, x1: 97, y1: 55 },
  ]),
  coetaneos: Object.freeze([
    { id: 'cara Elon Musk', x0: 8, y0: 45, x1: 19, y1: 63 },
    { id: 'cara Jensen Huang', x0: 21, y0: 43, x1: 31, y1: 58 },
    { id: 'cara Mira Murati', x0: 32.5, y0: 36.5, x1: 41, y1: 51 },
    { id: 'cara Carlo Bonomi', x0: 45, y0: 36.9, x1: 55, y1: 51 },
    { id: 'cara Jony Ive', x0: 65, y0: 40, x1: 73, y1: 54 },
    { id: 'cara John Lasseter', x0: 73, y0: 43, x1: 84, y1: 61 },
    { id: 'cara Ryan Reynolds', x0: 85, y0: 46, x1: 95, y1: 63 },
    { id: 'placa Mira Murati', x0: 35.5, y0: 63.5, x1: 45.5, y1: 68.5 },
    { id: 'placa Jensen Huang', x0: 25.5, y0: 69.5, x1: 36.5, y1: 74.5 },
    { id: 'placa Jony Ive', x0: 57.5, y0: 61.5, x1: 66.5, y1: 66.5 },
    { id: 'placa Elon Musk', x0: 18.5, y0: 81.5, x1: 30.5, y1: 86.5 },
    { id: 'placa John Lasseter', x0: 69.5, y0: 74.5, x1: 79.5, y1: 79.5 },
    { id: 'placa Ryan Reynolds', x0: 75.5, y0: 84.5, x1: 87.5, y1: 89.5 },
    { id: 'logo de la mesa', x0: 37.5, y0: 71.5, x1: 61.5, y1: 86.5 },
  ]),
});

/** Ancho de la caja del flujo (px): el de la zona, como mucho 560. */
export function anchoGlobo(mesa, box) {
  const z = ZONAS_GLOBO[mesa];
  return z ? Math.min(560, ((z.x1 - z.x0) / 100) * box.w) : 0;
}

/** Posición (px de la página) de una caja de gw×gh en la zona de su mesa, centrada hacia quien habla.
 *  cabe=false si no entra a lo alto (entonces se reduce la letra). colaX: x de la cola, relativa a la caja. */
export function cajaGlobo(mesa, anclaX, box, gw, gh) {
  const z = ZONAS_GLOBO[mesa];
  if (!z || !box) return null;
  const zx0 = box.x + (z.x0 / 100) * box.w; const zx1 = box.x + (z.x1 / 100) * box.w;
  const zy0 = box.y + (z.y0 / 100) * box.h; const zy1 = box.y + (z.y1 / 100) * box.h;
  const ax = box.x + ((anclaX == null ? (z.x0 + z.x1) / 2 : anclaX) / 100) * box.w;
  const w = Math.min(gw, zx1 - zx0);
  const left = Math.max(zx0, Math.min(zx1 - w, ax - w / 2));
  const top = z.crece === 'abajo' ? zy0 : zy1 - gh;
  const colaX = Math.max(14, Math.min(w - 14, ax - left));
  return { left, top, w, h: gh, cabe: gh <= zy1 - zy0, cola: z.crece === 'abajo' ? 'arriba' : 'abajo', colaX };
}

/** Obstáculos del arte en px de la página. */
export function obstaculosPx(mesa, box) {
  return (OBSTACULOS[mesa] || []).map((o) => ({
    id: o.id, left: box.x + (o.x0 / 100) * box.w, top: box.y + (o.y0 / 100) * box.h,
    right: box.x + (o.x1 / 100) * box.w, bottom: box.y + (o.y1 / 100) * box.h,
  }));
}

export function seSolapan(a, b) {
  const ar = a.right != null ? a.right : a.left + a.w; const ab = a.bottom != null ? a.bottom : a.top + a.h;
  const br = b.right != null ? b.right : b.left + b.w; const bb = b.bottom != null ? b.bottom : b.top + b.h;
  return a.left < br && ar > b.left && a.top < bb && ab > b.top;
}
