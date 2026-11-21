/**
 * Sesión formal de conversación autónoma entre Leyendas y Coetáneos.
 * Moderador de servidor: alterna equipos, rota silla, tope de turnos y de coste, transcript persistente.
 */
import { fichaDe, generacionDe, listarConsejeros, personaCanonica, personasDe, rolDe } from './consejo-sillas-lib.mjs';

export const SESION_TURNOS_DEFECTO = 12;
export const SESION_TURNOS_MAX = 20;
export const SESION_MAX_TOKENS = 250;
export const SESION_TOPE_EUR = 0.50;
export const SESION_KEY_PREF = 'consejo:sesion:';
export const SESION_INDICE = 'consejo:sesion:indice';

export function nuevaSesion({ tema, turnos, llm, tope_eur, max_tokens, a, b, modo, roster } = {}) {
  const objetivo = clampInt(turnos, SESION_TURNOS_DEFECTO, 2, SESION_TURNOS_MAX);
  const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const duo = (personaCanonica(a) && personaCanonica(b) && personaCanonica(a) !== personaCanonica(b))
    ? [personaCanonica(a), personaCanonica(b)]
    : null;
  return {
    id,
    tema: limpiarTema(tema),
    modo: duo ? 'duelo' : (modo || 'plenario'),
    roster: duo || (Array.isArray(roster) && roster.length >= 2 ? roster.map(personaCanonica).filter(Boolean) : null),
    turnos_objetivo: objetivo,
    turnos_max: SESION_TURNOS_MAX,
    max_tokens: clampInt(max_tokens, SESION_MAX_TOKENS, 100, 300),
    tope_eur: clampNum(tope_eur, SESION_TOPE_EUR, 0.01, 5),
    llm: llm || 'auto',
    estado: 'en_curso',
    motivo_parada: null,
    turnos: [],
    resumen: '',
    coste_eur: 0,
    vacios_seguidos: 0,
    creado: Date.now(),
    actualizado: Date.now(),
  };
}

export function limpiarTema(v) {
  const t = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  return t || 'afinar la comunicación entre Leyendas y Coetáneos del Consejo de Silicio';
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function rosterDe(sesion) {
  if (sesion && Array.isArray(sesion.roster) && sesion.roster.length >= 2) return sesion.roster;
  return [...personasDe('leyendas'), ...personasDe('coetaneos')];
}

/** Cruce lógico: alterna generaciones aunque solo haya una pantalla. */
export function siguienteSpeaker(sesion) {
  const roster = rosterDe(sesion);
  const last = (sesion.turnos || []).slice(-1)[0];
  if (sesion.modo === 'duelo' && roster.length === 2) {
    const persona = !last ? roster[0] : (last.persona === roster[0] ? roster[1] : roster[0]);
    return { persona, mesa: generacionDe(persona), rol: rolDe(persona) };
  }
  const ley = roster.filter((p) => generacionDe(p) === 'leyendas');
  const coe = roster.filter((p) => generacionDe(p) === 'coetaneos');
  const mesa = !last ? 'leyendas' : (last.mesa === 'leyendas' ? 'coetaneos' : 'leyendas');
  const lista = mesa === 'leyendas' ? (ley.length ? ley : roster) : (coe.length ? coe : roster);
  const lastOf = [...(sesion.turnos || [])].reverse().find((t) => t.mesa === mesa);
  let idx = 0;
  if (lastOf) {
    const i = lista.indexOf(lastOf.persona);
    idx = i >= 0 ? (i + 1) % lista.length : 0;
  }
  const persona = lista[idx];
  return { persona, mesa: generacionDe(persona) || mesa, rol: rolDe(persona) };
}

/** Contexto largo: resumen de lo anterior + últimos 8 turnos (no solo 5). */
export function promptDe(speaker, sesion) {
  const ficha = fichaDe(speaker) || { persona: speaker, rol: '', generacion: generacionDe(speaker) };
  const tema = (sesion && sesion.tema) || limpiarTema();
  const history = (sesion && sesion.turnos) || [];
  const mesaNom = ficha.generacion === 'leyendas' ? 'las Leyendas' : 'los Coetáneos';
  const otra = ficha.generacion === 'leyendas' ? 'los Coetáneos' : 'las Leyendas';
  const rol = ficha.rol ? ` Eres ${ficha.persona}, ${ficha.rol} del Consejo.` : ` Eres ${ficha.persona}.`;
  const resumen = (sesion && sesion.resumen) ? `\nResumen de lo ya acordado o dicho:\n${sesion.resumen}\n` : '';
  if (!history.length) {
    return `Estás en una conversación autónoma del Consejo AdmiraNeXT, en el equipo de ${mesaNom}, dialogando con ${otra}. Tema: "${tema}".${rol}${resumen} Arranca TÚ el debate en 1-2 frases, en tu estilo, con tu punto de vista. No te presentes ni saludes: ve al grano.`;
  }
  const recent = history.slice(-8).map((h) => `${h.persona}: ${h.texto}`).join('\n');
  const last = history[history.length - 1];
  return `Sigues en la conversación autónoma del Consejo (tú en ${mesaNom}; al otro lado, ${otra}) sobre "${tema}".${rol}${resumen}\nLo último dicho:\n${recent}\n\nResponde TÚ ahora en 1-2 frases, en tu estilo: puedes coincidir, matizar o rebatir, y dirigirte sobre todo a ${last.persona}. Primera persona, sin acotaciones.`;
}

export function contextoDe(sesion) {
  const history = (sesion && sesion.turnos) || [];
  const ctx = [];
  if (sesion && sesion.resumen) ctx.push({ role: 'user', content: 'Resumen previo de la sesión: ' + sesion.resumen });
  for (const t of history.slice(-8)) {
    ctx.push({ role: 'user', content: t.persona + ': ' + t.texto });
  }
  return ctx;
}

export function actualizarResumen(sesion) {
  const ts = sesion.turnos || [];
  if (ts.length <= 8) return { ...sesion, resumen: sesion.resumen || '' };
  const viejos = ts.slice(0, -8);
  const resumen = viejos.map((t) => `${t.persona} (${t.mesa}): ${t.texto}`).join(' · ').slice(0, 1200);
  return { ...sesion, resumen };
}

export function registrarTurno(sesion, { persona, texto, llm, input_tokens, output_tokens, coste_eur, ms, vacio, error }) {
  const ahora = Date.now();
  const ficha = fichaDe(persona) || { persona, rol: rolDe(persona), generacion: generacionDe(persona) };
  const text = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  const fallo = !text || vacio || error;
  const turno = {
    id: 't' + ahora,
    persona: ficha.persona || persona,
    mesa: ficha.generacion,
    rol: ficha.rol,
    texto: text,
    llm: llm || sesion.llm,
    tokens_in: Number(input_tokens) || 0,
    tokens_out: Number(output_tokens) || 0,
    ms: Number(ms) || 0,
    ts: ahora,
    coste_eur: Number(coste_eur) || 0,
    vacio: !!fallo,
    error: error ? String(error).slice(0, 200) : null,
  };
  const turnos = [...(sesion.turnos || []), turno];
  const coste = Math.round(((sesion.coste_eur || 0) + (turno.coste_eur || 0)) * 1e6) / 1e6;
  const vacios = fallo ? (sesion.vacios_seguidos || 0) + 1 : 0;
  let doc = actualizarResumen({
    ...sesion,
    turnos,
    coste_eur: coste,
    vacios_seguidos: vacios,
    actualizado: ahora,
  });
  return aplicarParada(doc);
}

export function pareceAcuerdo(sesion) {
  const last = (sesion.turnos || []).slice(-2);
  if (last.length < 2) return false;
  if (last[0].mesa === last[1].mesa) return false;
  const rx = /\b(de acuerdo|estamos de acuerdo|coincido|cerramos|así se hace|trato hecho|veredicto)\b/i;
  return last.every((t) => rx.test(t.texto || ''));
}

export function aplicarParada(sesion, { stop } = {}) {
  if (sesion.estado === 'parada') return sesion;
  let motivo = null;
  if (stop) motivo = 'stop';
  else if ((sesion.vacios_seguidos || 0) >= 2) motivo = 'vacios';
  else if ((sesion.coste_eur || 0) >= sesion.tope_eur) motivo = 'tope_eur';
  else if ((sesion.turnos || []).length >= sesion.turnos_max) motivo = 'max_turnos';
  else if ((sesion.turnos || []).length >= sesion.turnos_objetivo) motivo = 'objetivo';
  else if (pareceAcuerdo(sesion)) motivo = 'acuerdo';
  if (!motivo) return sesion;
  return { ...sesion, estado: 'parada', motivo_parada: motivo, actualizado: Date.now() };
}

const ES_RX = /[áéíóúñ¿¡]|(\b(que|qué|como|cómo|una|unos|esto|está|están|también|además|porque|pero|para|sobre|desde|cuando|hoy|ya|no|sí|si|el|la|los|las|de|en|y|o)\b)/i;
const EN_ONLY = /\b(the|this|that|with|from|what|when|just|ship|build|if)\b/i;

export function pareceEspanol(texto) {
  const t = String(texto || '');
  if (!t.trim()) return false;
  if (ES_RX.test(t)) return true;
  return !EN_ONLY.test(t);
}

function nombresDe(persona) {
  const n = String(persona || '').trim();
  if (!n) return [];
  const parts = n.split(/\s+/);
  const out = [n, parts[0], parts[parts.length - 1]].filter(Boolean);
  const ficha = fichaDe(n);
  if (ficha && ficha.silla) out.push(ficha.silla);
  return [...new Set(out.map((x) => x.toLowerCase()).filter((x) => x.length >= 3))];
}

export function referenciaCruzada(turno, anterior) {
  if (!turno || !turno.texto) return false;
  const t = turno.texto.toLowerCase();
  const menciona = (persona) => nombresDe(persona).some((n) => t.includes(n));
  if (anterior && anterior.persona && menciona(anterior.persona)) return true;
  const otras = (turno.mesa === 'leyendas') ? personasDe('coetaneos') : personasDe('leyendas');
  return otras.some((p) => menciona(p));
}

export function identidadCorrecta(turno) {
  if (!turno || !turno.persona) return false;
  const ficha = fichaDe(turno.persona);
  if (!ficha) return false;
  if (turno.rol && turno.rol !== ficha.rol) return false;
  if (turno.mesa && turno.mesa !== ficha.generacion) return false;
  const t = String(turno.texto || '').toLowerCase();
  const ajenos = listarConsejeros().filter((c) => c.persona !== ficha.persona);
  // no se hace pasar por otro: «soy Elon» siendo Jobs, etc.
  return !ajenos.some((c) => new RegExp(`\\b(soy|me llamo)\\s+${c.persona.split(' ')[0]}\\b`, 'i').test(t));
}

export function continuidad(turno, anterior) {
  if (!turno || !anterior || !turno.texto || !anterior.texto) return false;
  if (referenciaCruzada(turno, anterior)) return true;
  const palabras = String(anterior.texto).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5);
  const t = turno.texto.toLowerCase();
  let hits = 0;
  const vistos = new Set();
  for (const w of palabras) {
    if (vistos.has(w)) continue;
    vistos.add(w);
    if (t.includes(w)) hits += 1;
  }
  return hits >= 1;
}

export function metricas(sesion) {
  const turnos = (sesion.turnos || []).filter((t) => !t.vacio && t.texto);
  const n = turnos.length;
  const lat = turnos.map((t) => t.ms).filter((x) => x > 0).sort((a, b) => a - b);
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(0.95 * (lat.length - 1)))] : 0;
  let cruz = 0, idok = 0, es = 0, cont = 0;
  for (let i = 0; i < n; i++) {
    const t = turnos[i];
    const prev = i ? turnos[i - 1] : null;
    if (referenciaCruzada(t, prev) || (prev && t.mesa !== prev.mesa)) cruz += 1;
    if (identidadCorrecta(t)) idok += 1;
    if (pareceEspanol(t.texto)) es += 1;
    if (i && continuidad(t, prev)) cont += 1;
  }
  const vacios = (sesion.turnos || []).filter((t) => t.vacio).length;
  const total = (sesion.turnos || []).length || 1;
  const pct = (x, d) => (d ? Math.round((1000 * x) / d) / 10 : 0);
  return {
    turnos: n,
    intentos: (sesion.turnos || []).length,
    referencia_cruzada_pct: pct(cruz, n),
    identidad_pct: pct(idok, n),
    espanol_pct: pct(es, n),
    continuidad_pct: pct(cont, Math.max(0, n - 1)),
    latencia_p95_ms: p95,
    vacios_pct: pct(vacios, total),
    relleno_pct: 0,
    coste_eur: sesion.coste_eur || 0,
    motivo_parada: sesion.motivo_parada,
    estado: sesion.estado,
  };
}

export function horaMadrid(ts) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(ts));
}

export function transcriptPublico(sesion) {
  return {
    ok: true,
    id: sesion.id,
    tema: sesion.tema,
    modo: sesion.modo,
    estado: sesion.estado,
    motivo_parada: sesion.motivo_parada,
    llm: sesion.llm,
    tope_eur: sesion.tope_eur,
    coste_eur: sesion.coste_eur,
    turnos_objetivo: sesion.turnos_objetivo,
    turnos: (sesion.turnos || []).map((t) => ({
      ...t,
      ts_madrid: horaMadrid(t.ts),
    })),
    resumen: sesion.resumen || '',
    metricas: metricas(sesion),
    siguiente: sesion.estado === 'en_curso' ? siguienteSpeaker(sesion) : null,
    url: `https://www.admira.live/conversacion#sesion-${sesion.id}`,
  };
}
