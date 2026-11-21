/**
 * Comunicaciones Leyendas ↔ Coetáneos.
 * Solo hilos reales: inbox público de encargos, sesiones autónomas y mensajes
 * privados consejero_mensaje (si el backend los trae). No inventa filas ni claves.
 */
import { generacionDe, personaCanonica, SILLA_CLAVE } from './consejo-sillas-lib.mjs';

export function horaMadrid(ts) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(ts));
}

export const INBOX_PUBLICO = 'https://bot.yokup.com/api/public/inbox';
export const MENSAJES_BASE = 'https://mcp.admira.live';
/** Sillas cuya bandeja pública se lee (cada una trae sus 80 encargos más recientes). */
export const SILLAS_INBOX = Object.freeze([...new Set(Object.values(SILLA_CLAVE))]);
const CHAT_CON_PAGINA = new Set(['jobs', 'wozniak', 'lucas', 'disney', 'musk', 'huang']);

const ESTADO = {
  pending: 'pendiente',
  ack: 'pendiente',
  in_progress: 'en curso',
  blocked: 'bloqueado',
  done: 'respondido',
  failed: 'cerrado',
  cancelled: 'cerrado',
  en_curso: 'en curso',
  parada: 'cerrado',
};

export function asMs(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return n > 4102444800 ? n : n * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Extrae un consejero de un remitente o destinatario largo, sin aliases cortos ambiguos (carlo, mira…). */
export function personaEnRemitente(texto) {
  const raw = String(texto || '').trim();
  if (!raw) return null;
  const directo = personaCanonica(raw);
  if (directo) return directo;

  let t = raw
    .replace(/^status-web\s*·\s*/i, '')
    .replace(/^admira\.live\s*·\s*/i, '')
    .trim();

  const gb = t.match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s*GrokBot/i);
  if (gb) {
    const n = personaCanonica(gb[1]);
    if (n) return n;
  }
  t = t.replace(/GrokBot/gi, ' ').replace(/\s+/g, ' ').trim();

  const cabeza = t.split(/\s*\(|\s+por\s+(?:encargo|orden)\b/i)[0].trim();
  const nCabeza = personaCanonica(cabeza);
  if (nCabeza) return nCabeza;

  const nombres = Object.keys(SILLA_CLAVE).sort((a, b) => b.length - a.length);
  for (const nombre of nombres) {
    const re = new RegExp(`\\b${nombre.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(t)) return nombre;
  }
  const sillas = [...new Set(Object.values(SILLA_CLAVE))].sort((a, b) => b.length - a.length);
  for (const silla of sillas) {
    if (new RegExp(`\\b${silla}\\b`, 'i').test(t)) {
      const n = personaCanonica(silla);
      if (n) return n;
    }
  }
  return null;
}

export function esCruce(a, b) {
  const ga = generacionDe(a);
  const gb = generacionDe(b);
  return !!(ga && gb && ga !== gb);
}

/** Bandeja global + una por silla. URLs públicas, sin credenciales. */
export function urlsInboxPublico() {
  return [
    INBOX_PUBLICO,
    ...SILLAS_INBOX.map((p) => `${INBOX_PUBLICO}?${new URLSearchParams({ persona: p })}`),
  ];
}

export function juntarInbox(listas) {
  const visto = new Set();
  const out = [];
  for (const lista of listas || []) {
    for (const item of lista || []) {
      if (!item || typeof item !== 'object') continue;
      const id = item.id == null ? '' : String(item.id);
      if (id) {
        if (visto.has(id)) continue;
        visto.add(id);
      }
      out.push(item);
    }
  }
  return out;
}

/** Solo https, sin usuario ni query: el token de mensajes no sale en la URL. */
export function urlMensajes(base = MENSAJES_BASE) {
  let u;
  try { u = new URL(String(base || MENSAJES_BASE)); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
  const destino = new URL('/consejero/mensajes', u.origin);
  destino.searchParams.set('max', '500');
  return destino.toString();
}

export function duracionMs(inicio, fin) {
  const a = asMs(inicio);
  const b = asMs(fin);
  if (!a || !b || b < a) return 0;
  return b - a;
}

export function formatearDuracion(ms, { enCurso = false } = {}) {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  const sec = Math.floor(n / 1000);
  const s = sec % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600) % 24;
  const d = Math.floor(sec / 86400);
  const partes = [];
  if (d) partes.push(`${d} día${d === 1 ? '' : 's'}`);
  if (h) partes.push(`${h} h`);
  if (m) partes.push(`${m} min`);
  if (!d && !h && (s || !partes.length)) partes.push(`${s} s`);
  const texto = partes.join(' ');
  return enCurso ? `en curso · ${texto}` : texto;
}

function estadoDe(status) {
  const key = String(status || '').toLowerCase();
  return ESTADO[key] || '';
}

function terminal(status) {
  const e = estadoDe(status);
  return e === 'respondido' || e === 'cerrado';
}

export function fromInboxItem(item, ahora = Date.now()) {
  if (!item || typeof item !== 'object') return null;
  const de = personaEnRemitente(item.from_name);
  const para = personaEnRemitente(item.target_persona);
  if (!esCruce(de, para)) return null;
  const inicio = asMs(item.ts);
  if (!inicio) return null;
  const done = asMs(item.done_at);
  const enCurso = !terminal(item.status);
  const fin = done || (enCurso ? asMs(ahora) : inicio);
  const ga = generacionDe(de);
  const etiqueta = item.etiqueta ? String(item.etiqueta) : (item.id != null ? `#${item.id}` : '');
  return {
    id: etiqueta || `encargo-${item.id || inicio}`,
    fuente: 'encargo',
    de,
    para,
    de_generacion: ga,
    para_generacion: generacionDe(para),
    tema: recortar(item.text, 180),
    etiqueta,
    estado: estadoDe(item.status) || (enCurso ? 'pendiente' : ''),
    inicio,
    fin,
    inicio_madrid: horaMadrid(inicio),
    duracion_ms: duracionMs(inicio, fin),
    duracion: formatearDuracion(duracionMs(inicio, fin), { enCurso }),
    en_curso: enCurso,
    url: null,
  };
}

export function fromSesion(sesion, ahora = Date.now()) {
  if (!sesion || typeof sesion !== 'object') return null;
  const turnos = Array.isArray(sesion.turnos) ? sesion.turnos : [];
  const hablantes = [];
  for (const t of turnos) {
    const p = personaEnRemitente(t && (t.persona || t.nombre));
    if (p && !hablantes.includes(p)) hablantes.push(p);
  }
  if (Array.isArray(sesion.roster)) {
    for (const r of sesion.roster) {
      const p = personaEnRemitente(r);
      if (p && !hablantes.includes(p)) hablantes.push(p);
    }
  }
  const ley = hablantes.filter((p) => generacionDe(p) === 'leyendas');
  const coe = hablantes.filter((p) => generacionDe(p) === 'coetaneos');
  // Sin un consejero de cada generación no hay cruce: no se rellena con «Leyendas» / «Coetáneos».
  if (!ley.length || !coe.length) return null;
  const inicio = asMs(sesion.creado);
  if (!inicio) return null;
  const enCurso = String(sesion.estado || '') === 'en_curso';
  const fin = enCurso ? asMs(ahora) : (asMs(sesion.actualizado) || inicio);
  const de = hablantes[0];
  const para = generacionDe(de) === 'leyendas' ? coe[0] : ley[0];
  const id = String(sesion.id || '').trim();
  return {
    id: id ? `sesion-${id}` : `sesion-${inicio}`,
    fuente: 'sesion',
    de,
    para,
    de_generacion: generacionDe(de),
    para_generacion: generacionDe(para),
    participantes: hablantes,
    tema: recortar(sesion.tema, 180),
    etiqueta: id ? `#sesion-${id}` : '',
    estado: estadoDe(sesion.estado) || (enCurso ? 'en curso' : 'cerrado'),
    inicio,
    fin,
    inicio_madrid: horaMadrid(inicio),
    duracion_ms: duracionMs(inicio, fin),
    duracion: formatearDuracion(duracionMs(inicio, fin), { enCurso }),
    en_curso: enCurso,
    url: id ? `https://www.admira.live/conversacion#sesion-${id}` : 'https://www.admira.live/conversacion',
  };
}

function urlChat(persona) {
  const clave = String(SILLA_CLAVE[persona] || '').toLowerCase();
  if (!CHAT_CON_PAGINA.has(clave)) return null;
  return `https://www.admira.live/chat/${clave}/#entre-consejeros`;
}

function esMensajeConsejero(m) {
  if (!m || typeof m !== 'object' || m.id == null || m.id === '') return false;
  if (m.de_tipo === 'agente' || m.para_tipo === 'agente') return false;
  return true;
}

/** Un mensaje privado consejero→consejero. La duración es hasta que se leyó; si sigue pendiente, en curso. */
export function fromMensaje(m, ahora = Date.now()) {
  if (!esMensajeConsejero(m)) return null;
  const de = personaEnRemitente(m.de);
  const para = personaEnRemitente(m.para);
  if (!esCruce(de, para)) return null;
  const inicio = asMs(m.hora);
  if (!inicio) return null;
  const leido = m.leido ? asMs(m.leido_en) : 0;
  const enCurso = !m.leido;
  const fin = leido || (enCurso ? asMs(ahora) : inicio);
  const id = String(m.id);
  return {
    id: `mensaje-${id}`,
    fuente: 'mensaje',
    de,
    para,
    de_generacion: generacionDe(de),
    para_generacion: generacionDe(para),
    tema: recortar(m.texto, 180),
    etiqueta: id,
    estado: enCurso ? 'en curso' : 'leído',
    inicio,
    fin,
    inicio_madrid: horaMadrid(inicio),
    duracion_ms: duracionMs(inicio, fin),
    duracion: formatearDuracion(duracionMs(inicio, fin), { enCurso }),
    en_curso: enCurso,
    url: urlChat(para) || urlChat(de),
  };
}

function recortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

export function buildComunicaciones({ inbox = [], sesiones = [], mensajes = [] } = {}, ahora = Date.now()) {
  const rows = [];
  const vistos = new Set();
  const meter = (row) => {
    if (!row || vistos.has(row.id)) return;
    vistos.add(row.id);
    rows.push(row);
  };
  for (const item of juntarInbox([inbox])) meter(fromInboxItem(item, ahora));
  for (const sesion of sesiones || []) meter(fromSesion(sesion, ahora));
  for (const mensaje of mensajes || []) meter(fromMensaje(mensaje, ahora));
  rows.sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
  const fuentes = { encargos: 0, sesiones: 0, mensajes: 0 };
  for (const row of rows) {
    if (row.fuente === 'sesion') fuentes.sesiones += 1;
    else if (row.fuente === 'mensaje') fuentes.mensajes += 1;
    else fuentes.encargos += 1;
  }
  return {
    ok: true,
    total: rows.length,
    actualizado: ahora,
    actualizado_madrid: horaMadrid(ahora),
    fuentes,
    comunicaciones: rows,
  };
}

export function etiquetaContador(total) {
  const n = Number(total) || 0;
  if (n === 1) return '1 comunicación';
  return `${n} comunicaciones`;
}
