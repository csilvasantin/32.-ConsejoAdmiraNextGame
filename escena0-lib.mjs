/**
 * Escena 0 — comunicación entre consejeros (sala de reuniones, 12-nov-2026).
 * Canal compartido: cada pantalla es una mesa (Leyendas o Coetáneos).
 * Si las dos están vivas, el turno alterna de mesa (se responden).
 * Si solo hay una, conversan entre ellos en esa mesa.
 */
export const KEY_CANAL = 'escena0:canal:v1';
export const TEMA_DEFECTO = 'La colaboración entre las Leyendas y los Coetáneos del Consejo AdmiraNeXT: qué debemos hacer ahora.';
export const PRESENTE_MS = 45_000;
export const RESERVA_MS = 40_000;
export const MAX_TURNOS = 40;
export const TEXTO_MAX = 600;

export const MESAS = Object.freeze({
  leyendas: Object.freeze(['Steve Jobs', 'Steve Wozniak', 'Walt Disney', 'George Lucas']),
  // Carlos 19-11: «saltar a coetáneos para ver a los otros consejeros» — los seis de la foto de los Coetáneos.
  coetaneos: Object.freeze(['Elon Musk', 'Jensen Huang', 'Mira Murati', 'Jony Ive', 'John Lasseter', 'Ryan Reynolds']),
});

export const ROLES = Object.freeze({
  'Steve Jobs': 'CEO',
  'Steve Wozniak': 'CTO',
  'Walt Disney': 'CCO',
  'George Lucas': 'CSO',
  'Elon Musk': 'CEO',
  'Jensen Huang': 'CTO',
  'Mira Murati': 'COO',
  'Jony Ive': 'CDO',
  'John Lasseter': 'CCO',
  'Ryan Reynolds': 'CSO',
});

export const IMG = Object.freeze({
  leyendas: '/assets/council-leyendas.jpg?v=20261114-mesa',
  coetaneos: '/assets/council-coetaneos.jpg?v=20261114-mesa4',
});

/** Carlos 15-11 19:34: en Escena 0 Carlos Silva (figura Y-3 del centro de las Leyendas) y Carlo Bonomi (cabecera de
 *  los Coetáneos) NO están por defecto: solo salen si se les llama en modo experto (/consejero carlos silva,
 *  /consejero carlo bonomi) o si la URL los pide (?cabecera=bonomi, guion con ellos). Arte de las Leyendas con su
 *  silla vacía: council-leyendas.jpg con la placa de consejo-vacio/leyendas.jpg en su caja (598,185,197×234). */
export const IMG_SIN_CARLOS = Object.freeze({ leyendas: '/assets/council-leyendas-sin-carlos.jpg?v=20261115-expertos' });

/** Comando de modo experto tecleado en Escena 0: «/consejero <nombre> [aparecer|desaparecer]».
 *  Sin verbo, invierte. Devuelve {quien: 'carlos'|'bonomi', on: true|false|null} o {error} o null si no es suyo. */
export function comandoExperto(texto) {
  const s = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const m = s.match(/^\/?consejero\s+(.+)$/);
  if (!m) return null;
  let resto = m[1], on = null;
  const v = resto.match(/\s+(aparecer|aparece|aparezca|entra|si|on|desaparecer|desaparece|desaparezca|fuera|sale|no|off)$/);
  if (v) { on = !/^(desaparec|fuera|sale|no|off)/.test(v[1]); resto = resto.slice(0, v.index).trim(); }
  if (['carlos', 'carlos silva', 'silva', 'ceo', 'yo'].includes(resto)) return { quien: 'carlos', on };
  if (['carlo bonomi', 'carlo bononi', 'bonomi', 'bononi', 'carlo', 'carlo-bonomi'].includes(resto)) return { quien: 'bonomi', on };
  return { error: 'En Escena 0 solo se llama a Carlos Silva o a Carlo Bonomi: /consejero carlos silva · /consejero carlo bonomi' };
}

/** Punta de la flecha (cabeza) en % del arte, de PAPEL_POS. */
export const ANCLA = Object.freeze({
  leyendas: Object.freeze({
    'Steve Jobs': { x: 10.368, y: 39.583 },
    'Steve Wozniak': { x: 21.471, y: 31.51 },
    'Walt Disney': { x: 80, y: 32.292 },
    'George Lucas': { x: 90.735, y: 39.583 },
  }),
  coetaneos: Object.freeze({
    'Elon Musk': { x: 12.5, y: 44.722 },
    'Jensen Huang': { x: 24.375, y: 43.333 },
    // Puntas de flecha de PAPEL_POS (consejo-globo-lib.mjs) sobre council-coetaneos.jpg.
    'Mira Murati': { x: 37.3, y: 36.8 },
    'Jony Ive': { x: 68.594, y: 39.444 },
    'John Lasseter': { x: 77.188, y: 44.166 },
    'Ryan Reynolds': { x: 89.531, y: 43.333 },
  }),
});

export const TEMA_AUTONOMO = 'la presentación de PortAventuraNeXT de hoy ante Carlo Bononi y Arturo Mas Sardà';

/** Contexto fijo de la conversación autónoma: la presentación de hoy, no un debate genérico. */
export const CONTEXTO_PRESENTACION = `Estáis en la sala, durante la presentación de PortAventuraNeXT de Carlos Silva a Carlo Bononi y Arturo Mas Sardà. El tema NO es genérico: es ESTA presentación. Hablad de lo que está sobre la mesa.

Tesis: un parque, todas las historias. PortAventura se vuelve apetecible para cualquier major sin construir otro recinto: se tokeniza el que ya existe (átomos y bits; el mismo staff y los mismos datos) y se le pone la piel de cada universo. Eso es XperiencIA PortAventuraNeXT. Tokenizar NO es criptomoneda ni blockchain: es la identidad compartida entre lo físico y su gemelo digital.

Tres focos:
1) World models / gemelo digital: un modelo del parque y una maqueta de 4 universos (Netflix, Universal, Sony y Skydance como CONCEPTO, no como acuerdos firmados). Simular y decidir antes de tocar el recinto real.
2) Multi-agent systems que emulan a los visitantes y operan el recinto, más Retail Media+ como vía de ingreso por marca.
3) Domain-specific language models para la experiencia del parque: el visitante habla con el universo de la marca con rigor de operación, no con un chatbot genérico.

También están: el parque tokenizado / XperiencIA; PortAventura University, al estilo de los Imagineers, con Physical AI, ligada a Admira University / Bits and Atoms (no es la PAW Academy de la URV); la calculadora Publi Data (hipótesis de ejemplo: 5,3 millones de impresiones al año y aproximadamente 2,5 millones de euros de inventario vendido; no inventéis otras cifras); y el cierre «Legado»: «Damos continuidad al legado. Y lo multiplicamos.» (1963, Walt Disney y el Enchanted Tiki Room; ahora, Physical AI).

Normas: 1-2 frases, en tu estilo, desde TU rol y oficio. No te presentes. No inventes cifras, acuerdos de marca ni títulos como «el primer parque tokenizado» como si ya fueran un hecho. Si falta un dato, no lo fabriques.`;

export function esTemaPresentacion(tema) {
  return /portaventuranext|carlo bononi|publi data|xperienc/i.test(String(tema || ''));
}

export const LS_SILENCIO = 'admira_escena0_silencio';

function normCmd(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function verboOnOff(resto) {
  const s = String(resto || '').trim();
  if (!s) return null;
  if (/^(on|si|activar|activa|aparece|start|play|unmute|hablar)$/.test(s)) return true;
  if (/^(off|no|desactivar|desactiva|fuera|stop|pausa|pause|mute|callar|silencio)$/.test(s)) return false;
  return undefined;
}

/** /silencio · /silenciar · /mute [on|off]. Sin verbo, alterna. /voz o /sonido reactivan. */
export function comandoSilencio(texto) {
  const s = normCmd(texto);
  const m = s.match(/^\/?(silencio|silenciar|mute|mutear|callar|voz|sonido)(?:\s+(.+))?$/);
  if (!m) return null;
  const cmd = m[1];
  const on = verboOnOff(m[2]);
  if (on === undefined) return { error: 'Usa /silencio, /silencio on u /silencio off' };
  if (on === null && (cmd === 'voz' || cmd === 'sonido')) return { tipo: 'silencio', on: false };
  return { tipo: 'silencio', on };
}

/** /autonomo · /consejo autonomo [on|off]. Sin verbo, alterna. */
export function comandoAutonomo(texto) {
  const s = normCmd(texto);
  const m = s.match(/^\/?((?:consejo|hablar|conversacion)\s+)?(autonomo|autonoma)(?:\s+(.+))?$/);
  if (!m) return null;
  const on = verboOnOff(m[3]);
  if (on === undefined) return { error: 'Usa /autonomo, /autonomo on u /autonomo off' };
  return { tipo: 'autonomo', on };
}

/** /cerrar · /cerrar todo · /close · /salir: la ventana se cierra (si el lanzador la abrió) o pasa a negro. */
export function comandoCerrar(texto) {
  const s = normCmd(texto);
  if (/^\/?(cerrar(?:se|ventana|todo)?|close(?:window|all)?|salir)$/.test(s)) return { tipo: 'cerrar' };
  if (/^\/?(cerrar|close)\s+(todo|all|ventana|window)$/.test(s)) return { tipo: 'cerrar' };
  return null;
}

export function parseMesa(v) {
  const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    .replace(/[^a-z]/g, '');
  if (['coetaneos', 'coetaneo', 'peers', 'contemporaries', 'contemporaneos'].includes(s)) return 'coetaneos';
  if (['leyendas', 'leyenda', 'legends', 'legend'].includes(s)) return 'leyendas';
  return null;
}

export function mesaDe(persona) {
  const n = String(persona || '').trim();
  if (MESAS.leyendas.includes(n)) return 'leyendas';
  if (MESAS.coetaneos.includes(n)) return 'coetaneos';
  return null;
}

export function canalVacio(tema, ahora = 0) {
  return {
    tema: (tema && String(tema).trim().slice(0, 240)) || TEMA_DEFECTO,
    turnos: [],
    siguiente: null,
    reservado: null,
    presentes: {},
    actualizado: ahora,
  };
}

export function marcarPresente(doc, mesa, ahora) {
  if (mesa !== 'leyendas' && mesa !== 'coetaneos') return doc;
  const presentes = { ...(doc.presentes || {}) };
  presentes[mesa] = ahora;
  return { ...doc, presentes, actualizado: ahora };
}

/** Carlos 19-11: al saltar de mesa en la misma pantalla, la mesa que se deja deja de contar como presente
 *  (si no, el turno alternaría 45 s hacia una mesa que ya nadie pinta). */
export function quitarPresente(doc, mesa, ahora) {
  if (mesa !== 'leyendas' && mesa !== 'coetaneos') return doc;
  const presentes = { ...(doc.presentes || {}) };
  delete presentes[mesa];
  const reservado = doc.reservado && doc.reservado.mesa === mesa ? null : (doc.reservado || null);
  return { ...doc, presentes, reservado, actualizado: ahora };
}

/** Temas para el selector de Escena 0 (Carlos 19-11: «escoger el tema; el que está ahora, por defecto»). */
export const TEMAS_PRESET = Object.freeze([
  Object.freeze({ id: 'presentacion', es: 'Presentación PortAventuraNeXT (por defecto)', en: 'PortAventuraNeXT presentation (default)', tema: null }),
  Object.freeze({ id: 'colaboracion', es: 'Leyendas y Coetáneos: qué hacer ahora', en: 'Legends and Peers: what to do now', tema: 'La colaboración entre las Leyendas y los Coetáneos del Consejo AdmiraNeXT: qué debemos hacer ahora.' }),
  Object.freeze({ id: 'physical-ai', es: 'Physical AI y el legado de los Imagineers', en: 'Physical AI and the Imagineers legacy', tema: 'Physical AI en los parques: cómo continuar el legado de los Imagineers (del Enchanted Tiki Room de 1963 a hoy).' }),
  Object.freeze({ id: 'retail-media', es: 'Retail Media+ y publicidad en el parque', en: 'Retail Media+ and advertising in the park', tema: 'Retail Media+ en un parque temático: publicidad útil para el visitante y nueva vía de ingreso por marca.' }),
  Object.freeze({ id: 'admira-live', es: 'admira.live: equipo de silicio y de carbono', en: 'admira.live: silicon and carbon team', tema: 'Cómo hacer de admira.live la herramienta de comunicación entre el equipo de silicio (consejeros y agentes) y el de carbono.' }),
]);

/** Idioma de las voces y del texto de Escena 0: 'es' (por defecto) o 'en'. */
export const LS_IDIOMA = 'admira_escena0_idioma';
export const LS_TEMA = 'admira_escena0_tema';
export function parseIdioma(v) {
  const s = String(v || '').toLowerCase().trim();
  if (/^(en|eng|english|ingles|inglés|en-us|en-gb)$/.test(s)) return 'en';
  if (/^(es|esp|spanish|espanol|español|castellano|es-es)$/.test(s)) return 'es';
  return null;
}
/** Instrucción de idioma que se añade al prompt cuando la mesa habla en inglés. */
export function sufijoIdioma(idioma) {
  return idioma === 'en'
    ? '\n\nIMPORTANT: answer ONLY in natural spoken English (1-2 sentences), even if the topic or the previous lines are in Spanish. Keep names as they are.'
    : '';
}

export function mesasVivas(doc, ahora, ventana = PRESENTE_MS) {
  const p = doc.presentes || {};
  return ['leyendas', 'coetaneos'].filter((m) => Number(p[m] || 0) > ahora - ventana);
}

export function siguienteSpeaker(doc, ahora) {
  const vivas = mesasVivas(doc, ahora);
  if (!vivas.length) return null;
  const last = (doc.turnos || []).slice(-1)[0];
  let mesa;
  if (vivas.length === 2) {
    mesa = last && last.mesa === 'leyendas' ? 'coetaneos' : 'leyendas';
    if (!vivas.includes(mesa)) mesa = vivas[0];
  } else {
    mesa = vivas[0];
  }
  const lista = MESAS[mesa];
  const lastOfMesa = [...(doc.turnos || [])].reverse().find((t) => t.mesa === mesa);
  let idx = 0;
  if (lastOfMesa) {
    const i = lista.indexOf(lastOfMesa.persona);
    idx = i >= 0 ? (i + 1) % lista.length : 0;
  }
  return { mesa, persona: lista[idx] };
}

export function publicState(doc, ahora) {
  const siguiente = (doc.reservado && doc.reservado.hasta > ahora)
    ? { mesa: doc.reservado.mesa, persona: doc.reservado.persona }
    : siguienteSpeaker(doc, ahora);
  return {
    ok: true,
    tema: doc.tema || TEMA_DEFECTO,
    turnos: Array.isArray(doc.turnos) ? doc.turnos : [],
    siguiente,
    reservado: doc.reservado && doc.reservado.hasta > ahora ? doc.reservado : null,
    presentes: mesasVivas(doc, ahora),
    cruce: mesasVivas(doc, ahora).length === 2,
    actualizado: doc.actualizado || 0,
  };
}

export function reservar(doc, mesa, persona, ahora, ttl = RESERVA_MS) {
  const res = doc.reservado;
  if (res && res.hasta > ahora && !(res.mesa === mesa && res.persona === persona)) {
    return { ok: false, error: 'ocupado', doc, siguiente: { mesa: res.mesa, persona: res.persona } };
  }
  const sig = siguienteSpeaker(doc, ahora);
  if (!sig || sig.mesa !== mesa || sig.persona !== persona) {
    return { ok: false, error: 'no te toca', doc, siguiente: sig };
  }
  const d = { ...doc, reservado: { mesa, persona, hasta: ahora + ttl }, actualizado: ahora };
  return { ok: true, doc: d, siguiente: sig };
}

export function decir(doc, { mesa, persona, texto, id }, ahora) {
  const text = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, TEXTO_MAX);
  if (!text) return { ok: false, error: 'sin texto', doc };
  if (mesaDe(persona) !== mesa) return { ok: false, error: 'persona/mesa', doc };
  const res = doc.reservado;
  if (res && res.hasta > ahora && (res.persona !== persona || res.mesa !== mesa)) {
    return { ok: false, error: 'ocupado', doc };
  }
  const turno = { id: id || ('t' + ahora), mesa, persona, texto: text, ts: ahora };
  const turnos = [...(doc.turnos || []), turno].slice(-MAX_TURNOS);
  const d = {
    ...doc,
    turnos,
    reservado: null,
    actualizado: ahora,
    tema: doc.tema || TEMA_DEFECTO,
  };
  return { ok: true, doc: d, turno, siguiente: siguienteSpeaker(d, ahora) };
}

export function promptDe(speaker, doc) {
  const tema = (doc && doc.tema) || TEMA_DEFECTO;
  const history = (doc && doc.turnos) || [];
  const mesa = mesaDe(speaker);
  const nombreMesa = mesa === 'leyendas' ? 'las Leyendas' : 'los Coetáneos';
  const otra = mesa === 'leyendas' ? 'los Coetáneos' : 'las Leyendas';
  const companeros = (MESAS[mesa] || []).filter((p) => p !== speaker).join(', ');
  const cruz = (MESAS[mesa === 'leyendas' ? 'coetaneos' : 'leyendas'] || []).join(', ');
  const rol = ROLES[speaker] ? (' Eres ' + speaker + ', ' + ROLES[speaker] + ' del Consejo: opina desde ese oficio.') : (' Eres ' + speaker + ': opina desde tu carácter.');
  const brief = esTemaPresentacion(tema) ? ('\n\nContexto de la presentación:\n' + CONTEXTO_PRESENTACION) : '';
  if (!history.length) {
    return `Estás en la Escena 0 del Consejo AdmiraNeXT, la mesa de ${nombreMesa} (${companeros} y tú). En la otra pantalla de la sala está la mesa de ${otra} (${cruz}). Tema: "${tema}".${rol}${brief} Arranca TÚ el debate en 1-2 frases, en tu estilo característico, con tu punto de vista. No te presentes ni saludes con formalidad: ve al grano.`;
  }
  const recent = history.slice(-5).map((h) => `${h.persona}: ${h.texto}`).join('\n');
  const last = history[history.length - 1];
  return `Sigues en la Escena 0 del Consejo AdmiraNeXT (mesa de ${nombreMesa}; al otro lado de la sala, ${cruz}) sobre "${tema}".${rol}${brief}\nLo último dicho:\n${recent}\n\nResponde TÚ ahora en 1-2 frases, en tu estilo, aportando tu visión: puedes coincidir, matizar o rebatir, y dirigirte a quien quieras (sobre todo a ${last.persona}). Habla en primera persona, sin acotaciones.`;
}

export function limpiarTema(v) {
  const t = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  return t || TEMA_DEFECTO;
}
