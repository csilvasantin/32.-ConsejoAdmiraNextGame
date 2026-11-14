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

/** Gartner, tres tendencias para PortAventuraNeXT (Carlos, 14-nov 21:06): World Models primero, luego
 *  modelos de lenguaje de dominio (DSLM) y sistemas multiagente (MAS). Contado por Carlos Silva (centro de
 *  las Leyendas) a Carlo Bonomi (cabecera de los Coetáneos). Honesto con las fuentes:
 *  - World Models es la tendencia 3 de Gartner Top 10 Strategic Technology Trends for 2027 (GTS_542668), págs. 3, 9 y 10.
 *  - DSLM y MAS NO están en la lista de 2027: son las tendencias 5 y 4 de la de 2026 (págs. 3, 12 y 14 de ese PDF).
 *    En el de 2027, «multiagent system» sale como técnica de World Models (pág. 9).
 *  Lo de PortAventuraNeXT sale del guion del show (16-nov, Planeta 7, «Terminator»); lo que aún no existe va como propuesta. */
export const GUION_GARTNER = Object.freeze({
  id: 'gartner',
  titulo: 'Gartner · 3 tendencias para PortAventuraNeXT · Carlos Silva y Carlo Bonomi',
  tituloEn: 'Gartner · 3 trends for PortAventuraNeXT · Carlos Silva and Carlo Bonomi',
  tema: 'Tres tendencias de Gartner aplicadas a PortAventuraNeXT: World Models (2027), modelos de lenguaje de dominio y sistemas multiagente (2026).',
  cierreTitulo: 'PortAventuraNeXT',
  cierre: 'Gartner · World Models · DSLMs · Multiagent systems',
  cabecera: 'carlo-bonomi',
  soloGuion: true,
  sinVoz: true,
  bilingue: true,
  turnos: Object.freeze([
    { persona: 'Carlo Bonomi', texto: 'Carlos, de todo lo que anuncia Gartner, ¿con qué tres tendencias te quedas para PortAventuraNeXT?', en: 'Carlos, of everything Gartner is calling out, which three trends do you pick for PortAventuraNeXT?' },
    { persona: 'Carlos Silva', texto: 'World Models, modelos de lenguaje de dominio y sistemas multiagente, en ese orden. Para ser exactos: los World Models están en la lista de 2027; las otras dos son de la lista de 2026.', en: 'World models, domain-specific language models and multiagent systems, in that order. To be precise: world models are on the 2027 list; the other two come from the 2026 list.' },
    { persona: 'Carlo Bonomi', texto: 'Empieza por la que más te gusta. ¿Qué es un World Model?', en: 'Start with your favourite. What is a world model?' },
    { persona: 'Carlos Silva', texto: 'Gartner lo define como un sistema entrenado con datos multimodales que aprende representaciones de entornos físicos y virtuales. Permite a los agentes simular estados futuros, predecir resultados y entender las consecuencias de sus actos antes de ejecutarlos.', en: 'Gartner defines them as computational systems trained on multimodal datasets to learn abstract representations of physical and virtual environments. They let autonomous agents simulate future states, predict outcomes and understand the consequences of their actions before execution.' },
    { persona: 'Carlo Bonomi', texto: '¿Y qué pinta eso en un parque?', en: 'And what does that have to do with a park?' },
    { persona: 'Carlos Silva', texto: 'Un parque es un mundo físico con una historia dentro, y cada pantalla de PortAventuraNeXT ya sabe cuánta gente tiene. Con un World Model ensayaríamos antes de mover: qué pasa con las colas si la grieta sale en las cinco pantallas. Primero en la maqueta y el plano 3D; luego, en el parque.', en: 'A park is a physical world with a story inside, and every PortAventuraNeXT screen already knows how many people it holds. With a world model we\'d rehearse before moving: what happens to queues if the rift plays on all five screens. First on the model and the 3D plan; then in the park.' },
    { persona: 'Carlo Bonomi', texto: 'Suena caro. ¿No es pronto?', en: 'Sounds expensive. Isn\'t it too early?' },
    { persona: 'Carlos Silva', texto: 'Gartner admite que hoy el coste de cómputo frena el despliegue, pero dice que el de entrenar caerá diez veces en tres años. Y prevé que en 2030 el 40% de las aplicaciones de robótica usen World Models, frente a menos del 1% en 2025. Por eso: piloto medido en la entrada del Studio.', en: 'Gartner admits high computational costs restrict deployment today, but says model training costs will fall tenfold within three years. And by 2030, 40% of robotics applications will incorporate world models, compared with less than 1% in 2025. So: a measured pilot at the Studio entrance.' },
    { persona: 'Carlo Bonomi', texto: 'Segunda: modelos de lenguaje de dominio, entrenados con datos de un sector. ¿Por qué no uno general?', en: 'Second: domain-specific language models, trained on one industry\'s data. Why not a general one?' },
    { persona: 'Carlos Silva', texto: 'Porque uno general no conoce el parque. El nuestro hablaría PortAventuraNeXT: sus mundos, los diez capítulos, la carta de Benny\'s Burgers. Gartner prevé que en 2028 el 30% de las cargas de IA generativa ejecuten DSLM en local o en el dispositivo: aquí, los cinco ordenadores AdmiraNeXT.', en: 'Because a general one doesn\'t know the park. Ours would speak PortAventuraNeXT: its worlds, its ten chapters, the Benny\'s Burgers menu. Gartner expects 30% of GenAI workloads to run DSLMs on-premises or on-device by 2028: here, the five AdmiraNeXT PCs.' },
    { persona: 'Carlo Bonomi', texto: 'Tercera: sistemas multiagente. ¿Quién manda cuando hay muchos agentes?', en: 'Third: multiagent systems. Who is in charge when there are many agents?' },
    { persona: 'Carlos Silva', texto: 'Este show lo montó un consejo de agentes: Wozniak el show, Walt el reloj, Lucas el guion. Gartner prevé que en 2027 el 70% de los sistemas multiagente usen agentes muy especializados: más precisión, pero más complejidad de coordinación. Por eso, un solo reloj, un solo GO y una persona que aprueba.', en: 'A council of agents built this show: Wozniak the show, Walt the clock, Lucas the script. Gartner expects 70% of MAS to use narrowly specialized agents by 2027, improving accuracy but increasing coordination complexity. Hence one clock, one GO, and a person who approves.' },
    { persona: 'Carlo Bonomi', texto: 'Si me llevo una sola frase al comité, ¿cuál es?', en: 'If I take one sentence back to the board, what is it?' },
    { persona: 'Carlos Silva', texto: 'El World Model ensaya el parque, el modelo de dominio lo cuenta y los agentes lo mueven. Las personas deciden. Si no emociona, no se escala.', en: 'The world model rehearses the park, the domain model tells its story and the agents run it. People decide. If it doesn\'t move people, it doesn\'t scale.' },
  ]),
});

export const GUIONES = Object.freeze({ pan: GUION_PAN, 'carlos-bonomi': GUION_CARLOS_BONOMI, gartner: GUION_GARTNER });

export function parseGuion(v) {
  const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['pan', 'portaventura', 'portaventuranext', 'portaventuranextcom'].includes(s)) return GUION_PAN;
  if (['carlosbonomi', 'carlossilvabonomi', 'carlossilvacarlobonomi', 'bonomi'].includes(s)) return GUION_CARLOS_BONOMI;
  if (['gartner', 'gartner2027', 'gartner3', 'tendencias', 'trends', 'toptrends2027'].includes(s)) return GUION_GARTNER;
  return null;
}

/** Invitados de cabecera: sentados como un consejero más (dibujo recortado, silla azul), al fondo y al centro.
 *  Posición en % del arte de Coetáneos (1280×720); las manos se apoyan en la mesa del arte. */
export const CABECERAS = Object.freeze({
  'carlo-bonomi': Object.freeze({
    id: 'carlo-bonomi',
    nombre: 'Carlo Bonomi',
    corto: 'Carlo',
    foto: '/assets/cabecera/carlo-bonomi-sentado.webp?v=20261114-mesa4',
    alias: Object.freeze(['bonomi', 'carlo', 'carlo bonomi', 'carlo-bonomi', 'carlobonomi']),
    // Carlos 23:39: sin placas por defecto; en el sitio de su placa, una maqueta de Ferrari Land (% del arte 1280×720).
    objeto: Object.freeze({ foto: '/assets/cabecera/carlo-bonomi-ferrariland.webp?v=20261114-mesa4', alt: 'Maqueta de Ferrari Land', cx: 53.125, y: 51.61, h: 10.4167 }),
  }),
});

/** Demo (Carlos, 14-11 18:22): en las escenas de presentación el neón de la mesa de los Coetáneos dice
 *  «PortAventuraNeXT» en vez de «AdmiraNext». Parche del arte (% del arte 1280×720), hecho con
 *  tools/logo-mesa-portaventuranext.py; la home normal sigue con AdmiraNext. */
export const LOGO_DEMO = Object.freeze({ mesa: 'coetaneos', foto: '/assets/demo/logo-portaventuranext.webp?v=20261114-mesa4', x: 36.5625, y: 74.1667, w: 26.4062, h: 13.3333 });

export const CABECERA_POS = Object.freeze({ mesa: 'coetaneos', x: 44.37, y: 33.24, w: 13.86, h: 28.294, corte: 14 });

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
