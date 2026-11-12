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
  coetaneos: Object.freeze(['Elon Musk', 'Jensen Huang']),
});

export const ROLES = Object.freeze({
  'Steve Jobs': 'CEO',
  'Steve Wozniak': 'CTO',
  'Walt Disney': 'CCO',
  'George Lucas': 'CSO',
  'Elon Musk': 'CEO',
  'Jensen Huang': 'CTO',
});

export const IMG = Object.freeze({
  leyendas: '/assets/council-leyendas.jpg?v=20261112-holgado',
  coetaneos: '/assets/council-coetaneos.jpg?v=20261112-holgado',
});

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
  }),
});

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
  const companeros = MESAS[mesa].filter((p) => p !== speaker).join(', ');
  const cruz = MESAS[mesa === 'leyendas' ? 'coetaneos' : 'leyendas'].join(', ');
  if (!history.length) {
    return `Estás en la Escena 0 del Consejo AdmiraNeXT, la mesa de ${nombreMesa} (${companeros} y tú). En la otra pantalla de la sala está la mesa de ${otra} (${cruz}). Tema: "${tema}". Arranca TÚ el debate en 1-2 frases, en tu estilo característico, con tu punto de vista. No te presentes ni saludes con formalidad: ve al grano.`;
  }
  const recent = history.slice(-5).map((h) => `${h.persona}: ${h.texto}`).join('\n');
  const last = history[history.length - 1];
  return `Sigues en la Escena 0 del Consejo AdmiraNeXT (mesa de ${nombreMesa}; al otro lado de la sala, ${cruz}) sobre "${tema}". Lo último dicho:\n${recent}\n\nResponde TÚ ahora en 1-2 frases, en tu estilo, aportando tu visión: puedes coincidir, matizar o rebatir, y dirigirte a quien quieras (sobre todo a ${last.persona}). Habla en primera persona, sin acotaciones.`;
}

export function limpiarTema(v) {
  const t = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  return t || TEMA_DEFECTO;
}
