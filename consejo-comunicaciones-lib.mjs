/**
 * Comunicaciones Leyendas ↔ Coetáneos.
 * Agrupa solo hilos reales (encargos del inbox público y sesiones autónomas).
 * No inventa mensajes ni incluye claves.
 */
import { generacionDe, personaCanonica, SILLA_CLAVE } from './consejo-sillas-lib.mjs';

export function horaMadrid(ts) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(ts));
}

export const INBOX_PUBLICO = 'https://bot.yokup.com/api/public/inbox';

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
    url: etiqueta ? `https://www.admira.live/conversacion` : null,
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
  // Una sesión autónoma es, por definición, el canal Leyendas ↔ Coetáneos.
  const inicio = asMs(sesion.creado);
  if (!inicio) return null;
  const enCurso = String(sesion.estado || '') === 'en_curso';
  const fin = enCurso ? asMs(ahora) : (asMs(sesion.actualizado) || inicio);
  const de = ley[0] || 'Leyendas';
  const para = coe[0] || 'Coetáneos';
  const id = String(sesion.id || '').trim();
  return {
    id: id ? `sesion-${id}` : `sesion-${inicio}`,
    fuente: 'sesion',
    de,
    para,
    de_generacion: ley[0] ? 'leyendas' : 'leyendas',
    para_generacion: 'coetaneos',
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

function recortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

export function buildComunicaciones({ inbox = [], sesiones = [] } = {}, ahora = Date.now()) {
  const rows = [];
  for (const item of inbox || []) {
    const row = fromInboxItem(item, ahora);
    if (row) rows.push(row);
  }
  for (const sesion of sesiones || []) {
    const row = fromSesion(sesion, ahora);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
  return {
    ok: true,
    total: rows.length,
    actualizado: ahora,
    actualizado_madrid: horaMadrid(ahora),
    comunicaciones: rows,
  };
}

export function etiquetaContador(total) {
  const n = Number(total) || 0;
  if (n === 1) return '1 comunicación';
  return `${n} comunicaciones`;
}
