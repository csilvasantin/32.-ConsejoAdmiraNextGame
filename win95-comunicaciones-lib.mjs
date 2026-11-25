/**
 * win95-comunicaciones-lib.mjs — «todas las comunicaciones entre los consejeros» como ficheros .txt
 * en la carpeta Miscelánea de admira.live/windows95 (Carlos, 25-11-2026 21:00).
 *
 * Solo lectura y texto plano. Fuentes reales ya existentes (las mismas que /api/consejo/comunicaciones):
 *   · mensajes privados consejero_mensaje (Worker mcp.admira.live /consejero/mensajes, con el token
 *     del servidor; el token nunca sale de aquí);
 *   · encargos públicos de bot.yokup.com/api/public/inbox entre dos consejeros;
 *   · sesiones autónomas del Consejo (KV consejo:sesion:*) con al menos dos consejeros.
 * Se agrupa en un fichero por conversación de dos consejeros («Jobs-Huang.txt»), uno por sesión y
 * un resumen del día («Consejo 25-11-2026.txt»). Hora de Madrid. Todo texto pasa por redactar():
 * fuera tokens, claves, contraseñas, IPs y MACs.
 */
import { personaEnRemitente, asMs } from './consejo-comunicaciones-lib.mjs';
import { SILLA_CLAVE, generacionDe } from './consejo-sillas-lib.mjs';

export const MAX_TEXTO = 4000;
export const MAX_POR_FICHERO = 200;
export const MAX_SESIONES = 8;
export const VENTANA_DIAS = 30;

const REGLAS = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, 'Bearer [oculto]'],
  // claves con nombre: token=…, password: …, contraseña …, secret, api_key, authorization
  [/\b(pass(?:word|wd)?|contrase(?:ñ|n)a|clave|secret[o]?|token|api[_-]?key|apikey|authorization|bearer|cookie|pin)\b(\s*[:=]\s*)(?!\[oculto\])("[^"]{3,}"|'[^']{3,}'|[^\s,;]{4,})/gi, (m, k, sep) => `${k}${sep}[oculto]`],
  // tokens con prefijo conocido
  [/\b(?:sk|pk|rk|xai|ghp|gho|ghs|ghu|github_pat|xox[abpr]|glpat|AKIA|AIza|ya29)[-_][A-Za-z0-9_\-.]{8,}/g, '[token oculto]'],
  [/\bAKIA[0-9A-Z]{12,}\b/g, '[token oculto]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, '[token oculto]'],
  // parámetros sensibles en URLs
  [/([?&](?:token|key|sig|signature|secret|auth|code|password|access_token)=)[^&\s]+/gi, '$1[oculto]'],
  // cadenas largas tipo hash / base64 (≥ 32 caracteres sin espacios)
  [/\b[A-Fa-f0-9]{32,}\b/g, '[clave oculta]'],
  [/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}/g, '[clave oculta]'],
  // MAC
  [/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[MAC oculta]'],
  // IPv4
  [/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '[IP oculta]'],
  // IPv6 (al menos tres grupos con ::, o 8 grupos)
  [/\b(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}\b/g, '[IP oculta]'],
  [/\b(?:[0-9A-Fa-f]{1,4}:){2,6}:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5})?\b/g, '[IP oculta]'],
  // claves privadas
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[clave privada oculta]'],
];

/** Quita secretos, tokens, IPs, MACs y contraseñas. Idempotente. */
export function redactar(texto) {
  let t = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n');
  for (const [re, rep] of REGLAS) t = t.replace(re, rep);
  return t;
}

const fmt = (opts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hourCycle: 'h23', ...opts });
const F_FECHA = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });
const F_HORA = fmt({ hour: '2-digit', minute: '2-digit' });
export const fechaMadrid = (ms) => F_FECHA.format(new Date(ms)).replace(/\//g, '-');
export const horaMadrid = (ms) => F_HORA.format(new Date(ms));
const diaClave = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** «Steve Jobs» → «Jobs». */
export const corto = (persona) => SILLA_CLAVE[persona] || String(persona || '').split(' ').slice(-1)[0] || '?';

function limpio(texto) {
  let t = redactar(String(texto || '')).replace(/\u0000/g, '').trim();
  if (t.length > MAX_TEXTO) t = t.slice(0, MAX_TEXTO - 1).trimEnd() + '…';
  return t;
}

/** Mensaje privado consejero_mensaje → entrada (o null si no es consejero↔consejero). */
export function desdeMensaje(m) {
  if (!m || typeof m !== 'object' || m.id == null) return null;
  if (m.de_tipo === 'agente' || m.para_tipo === 'agente') return null;
  const de = personaEnRemitente(m.de), para = personaEnRemitente(m.para);
  if (!de || !para || de === para) return null;
  const ts = asMs(m.hora);
  if (!ts) return null;
  const texto = limpio(m.texto);
  if (!texto) return null;
  return { id: 'm:' + m.id, fuente: 'mensaje', ts, de, para, ref: '', texto, estado: m.leido ? 'leído' : 'sin leer' };
}

/** Encargo público de bot.yokup.com entre dos consejeros → entrada. */
export function desdeEncargo(it) {
  if (!it || typeof it !== 'object') return null;
  const de = personaEnRemitente(it.from_name), para = personaEnRemitente(it.target_persona);
  if (!de || !para || de === para) return null;
  const ts = asMs(it.ts);
  if (!ts) return null;
  const ref = it.id != null ? '#' + String(it.id).replace(/[^\w.-]/g, '') : '';
  const texto = limpio(String(it.text || '').replace(/^\[[^\]\n]{0,80}\]\s*/, ''));
  if (!texto) return null;
  const est = { pending: 'pendiente', ack: 'acusado', in_progress: 'en curso', blocked: 'bloqueado', done: 'hecho', failed: 'fallido', cancelled: 'cancelado' }[String(it.status || '')] || '';
  return { id: 'e:' + (it.id != null ? it.id : ts), fuente: 'encargo', ts, de, para, ref, texto, estado: est };
}

/** Sesión autónoma con ≥ 2 consejeros → { id, tema, ts, entradas }. */
export function desdeSesion(s) {
  if (!s || typeof s !== 'object') return null;
  const turnos = Array.isArray(s.turnos) ? s.turnos : [];
  const entradas = [];
  const quien = new Set();
  const base = asMs(s.creado) || 0;
  turnos.forEach((t, i) => {
    const p = personaEnRemitente(t && (t.persona || t.nombre));
    const texto = limpio(t && t.texto);
    if (!p || !texto) return;
    quien.add(p);
    const ts = asMs(t.ts || t.hora || t.at) || (base ? base + i * 1000 : 0);
    if (!ts) return;
    entradas.push({ id: 's:' + (s.id || base) + ':' + i, fuente: 'sesion', ts, de: p, para: 'la mesa', ref: s.id ? '#sesion-' + String(s.id).replace(/[^\w.-]/g, '') : '', texto, estado: '' });
  });
  if (quien.size < 2 || !entradas.length) return null;
  return { id: String(s.id || base), tema: limpio(s.tema || '').replace(/\s+/g, ' ').slice(0, 120), ts: base || entradas[0].ts, entradas };
}

/** Orden del par: leyenda primero; si son de la misma generación, alfabético. */
export function ordenPar(a, b) {
  const ga = generacionDe(a), gb = generacionDe(b);
  if (ga !== gb) return ga === 'leyendas' ? [a, b] : (gb === 'leyendas' ? [b, a] : [a, b].sort());
  return [a, b].sort((x, y) => corto(x).localeCompare(corto(y)));
}

function linea(e) {
  const cab = `${fechaMadrid(e.ts)} ${horaMadrid(e.ts)} · ${corto(e.de)} → ${e.para === 'la mesa' ? 'la mesa' : corto(e.para)}`
    + (e.ref ? ` · encargo ${e.ref}` : '') + (e.fuente === 'mensaje' ? ' · mensaje' : '') + (e.estado ? ` · ${e.estado}` : '');
  const cuerpo = e.texto.split('\n').map((l) => '    ' + l).join('\n');
  return cab + '\n' + cuerpo + '\n';
}

const SEP = '========================================================================';
const PIE = 'Generado por admira.live/windows95 · solo lectura · hora de Madrid.\nSin secretos: tokens, claves, contraseñas, IPs y MACs se ocultan.';

function bytes(s) { return new TextEncoder().encode(s).length; }

function fichero(id, nombre, tipo, titulo, fuentes, entradas, ahora) {
  const orden = entradas.slice().sort((a, b) => a.ts - b.ts).slice(-MAX_POR_FICHERO);
  const texto = [SEP, titulo, `Fuente: ${fuentes}`, `Actualizado: ${fechaMadrid(ahora)} ${horaMadrid(ahora)} (Madrid) · ${orden.length} comunicación(es)`, SEP, '',
    orden.length ? orden.map(linea).join('\n') : '(sin comunicaciones)\n', SEP, PIE, ''].join('\n');
  const modificado = orden.length ? orden[orden.length - 1].ts : ahora;
  return { id, nombre, tipo, modificado, mensajes: orden.length, tamano: bytes(texto), texto };
}

const FUENTES = 'mensajes consejero_mensaje (mcp.admira.live), encargos de bot.yokup.com y sesiones del Consejo';

/**
 * Construye los ficheros. entradas: de desdeMensaje/desdeEncargo; sesiones: de desdeSesion.
 * Devuelve [resumen del día, conversaciones por par (más reciente primero), sesiones].
 */
export function construirFicheros({ mensajes = [], encargos = [], sesiones = [] } = {}, ahora = Date.now()) {
  const desde = ahora - VENTANA_DIAS * 86400000;
  const vistos = new Set();
  const entradas = [];
  for (const e of [...mensajes.map(desdeMensaje), ...encargos.map(desdeEncargo)]) {
    if (!e || vistos.has(e.id) || e.ts < desde || e.ts > ahora + 300000) continue;
    vistos.add(e.id); entradas.push(e);
  }
  const pares = new Map();
  for (const e of entradas) {
    const [a, b] = ordenPar(e.de, e.para);
    const k = a + '|' + b;
    if (!pares.has(k)) pares.set(k, { a, b, lista: [] });
    pares.get(k).lista.push(e);
  }
  const ses = sesiones.map(desdeSesion).filter((s) => s && s.ts >= desde)
    .sort((x, y) => y.ts - x.ts).slice(0, MAX_SESIONES);
  const hoy = diaClave(ahora);
  const deHoy = [...entradas, ...ses.flatMap((s) => s.entradas)].filter((e) => diaClave(e.ts) === hoy);
  const out = [fichero('dia-' + hoy, `Consejo ${fechaMadrid(ahora)}.txt`, 'dia', `CONSEJO ADMIRANEXT · comunicaciones del ${fechaMadrid(ahora)}`, FUENTES, deHoy, ahora)];
  const convs = [...pares.values()].map(({ a, b, lista }) => fichero(
    'par-' + corto(a).toLowerCase() + '-' + corto(b).toLowerCase(), `${corto(a)}-${corto(b)}.txt`, 'conversacion',
    `${a.toUpperCase()} ↔ ${b.toUpperCase()} · últimos ${VENTANA_DIAS} días`, 'mensajes consejero_mensaje y encargos de bot.yokup.com', lista, ahora));
  convs.sort((x, y) => y.modificado - x.modificado);
  out.push(...convs);
  for (const s of ses) {
    const nombre = `Sesión ${fechaMadrid(s.ts)} ${horaMadrid(s.ts).replace(':', '.')}.txt`;
    out.push(fichero('ses-' + s.id.replace(/[^\w-]/g, ''), nombre, 'sesion', `SESIÓN DEL CONSEJO${s.tema ? ' · ' + s.tema : ''}`, 'sesiones autónomas del Consejo (admira.live/conversacion)', s.entradas, ahora));
  }
  // nombres únicos
  const usados = new Set();
  for (const f of out) {
    let n = f.nombre, i = 2;
    while (usados.has(n)) n = f.nombre.replace(/\.txt$/, ` (${i++}).txt`);
    f.nombre = n; usados.add(n);
  }
  return out;
}
