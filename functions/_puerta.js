/*
 * PUERTA DE SERVIDOR de www.admira.live (Jony, 20-11-2026 · aprobado por Carlos:
 * «Sí, protege admira.live en el servidor y saca las direcciones internas del código público»).
 *
 * Hasta hoy la verja era solo de navegador (auth-gate.js): ocultaba la página, pero el HTML y el
 * JS se podían descargar sin sesión. Ahora el borde no entrega nada sin una cookie propia de www,
 * __Host-admira_puerta, firmada con PUERTA_FIRMA (secreto de Pages; nunca sale del servidor).
 *
 * Cómo se consigue la cookie, sin tocar FleetControl ni sus secretos:
 *   · persona  → la verja de siempre (Google + allowlist en FleetControl). Con sesión humana,
 *                auth-gate.js pide un ticket de un minuto a fleet.admira.live
 *                (/api/auth/yokup-ticket, el mismo puente que ya usa Misiones) y lo canjea aquí
 *                en POST /puerta/entrar. Este servidor lo valida contra FleetControl
 *                (/api/auth/yokup-ticket/consume) y solo entonces firma la cookie.
 *   · agente   → POST /puerta/agente con su clave de agente (Bearer); se valida contra
 *                FleetControl (/api/auth/agente). Solo lectura, 12 h.
 *   · kiosco   → GET /puerta/kiosco?k=<llave>&a=<ruta>. La llave vive solo en los secretos
 *                privados de la flota; aquí solo está su SHA-256 (PUERTA_KIOSCO_SHA256).
 */
export const COOKIE = '__Host-admira_puerta';
export const FLEET = 'https://fleet.admira.live';
const enc = new TextEncoder();

export const VIDA = {
  persona: { renovar: 24 * 3600, tope: 7 * 24 * 3600 },
  agente: { renovar: 12 * 3600, tope: 12 * 3600 },
  kiosco: { renovar: 30 * 24 * 3600, tope: 365 * 24 * 3600 },
};

// Lo único que se sirve sin sesión, y por qué (ver README de la PR):
//  · /api/*  → endpoints de máquina y de otras webs (CORS *, tokens propios). No cambian hoy.
//  · /auth/* → el login de Google (worker admira-auth-edge).  /puerta/* → canje de la cookie.
//  · la verja y sus diccionarios (auth-gate.js, admira-idioma*.js): sin ellos no hay login.
//  · /version.json → lo lee admiranext.com/webmaster desde otro sitio; solo sello y commit.
//  · el badge del invitado (ubicacion/invitado): página pública por diseño (QR del badge).
//  · vídeo, audio e imagen bajo /assets/ y /presentaciones/: los incrustan admiranext.com y
//    las presentaciones del MCP. Son binarios: ni código, ni direcciones.
const PUBLICO_EXACTO = new Set([
  '/auth-gate.js', '/admira-idioma.js', '/admira-idioma-paginas.js', '/admira-idioma-sitio.js',
  '/version.json', '/robots.txt', '/favicon.ico', '/council-icon.ico', '/council-icon.png',
  '/ubicacion/invitado', '/ubicacion/invitado.html', '/ubicacion/manifest.webmanifest',
  '/admira-logo-retro.svg', '/app/apple-touch-icon.png',
]);
const PUBLICO_PREFIJO = ['/api/', '/auth/', '/puerta/'];
const MEDIA = /^\/(?:assets|presentaciones)\/[^?#]+\.(?:mp4|webm|m4v|mov|mp3|m4a|wav|ogg|png|jpe?g|gif|webp|avif)$/i;

export function esPublico(pathname) {
  let p = String(pathname || '/');
  try { p = decodeURIComponent(p); } catch (_) { return false; }
  if (p.includes('..') || p.includes('\\') || p.includes('\0')) return false;
  if (PUBLICO_EXACTO.has(p)) return true;
  if (PUBLICO_PREFIJO.some((x) => p.startsWith(x))) return true;
  return MEDIA.test(p);
}

function b64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function desB64u(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function clave(secreto) {
  return crypto.subtle.importKey('raw', enc.encode('admira-puerta-v1\0' + secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export function secretoValido(secreto) { return typeof secreto === 'string' && secreto.length >= 32; }

export async function firmar(secreto, datos) {
  const cuerpo = b64u(enc.encode(JSON.stringify(datos)));
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), enc.encode(cuerpo));
  return cuerpo + '.' + b64u(firma);
}

export async function verificar(secreto, valor, ahora = Math.floor(Date.now() / 1000)) {
  if (!secretoValido(secreto)) return null;
  const v = String(valor || '');
  if (v.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v)) return null;
  const [cuerpo, firma] = v.split('.');
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await clave(secreto), desB64u(firma), enc.encode(cuerpo)); } catch (_) { return null; }
  if (!ok) return null;
  let d;
  try { d = JSON.parse(new TextDecoder().decode(desB64u(cuerpo))); } catch (_) { return null; }
  const vida = d && VIDA[d.t];
  if (!vida || typeof d.s !== 'string' || !Number.isFinite(d.i) || !Number.isFinite(d.x)) return null;
  if (d.x <= ahora || d.i > ahora + 300 || ahora - d.i > vida.tope) return null;
  return d;
}

export async function emitir(secreto, tipo, sujeto, inicio, ahora = Math.floor(Date.now() / 1000)) {
  const vida = VIDA[tipo];
  const i = Number.isFinite(inicio) ? inicio : ahora;
  const x = Math.min(ahora + vida.renovar, i + vida.tope);
  const valor = await firmar(secreto, { t: tipo, s: String(sujeto).slice(0, 80), i, x });
  return { valor, maxAge: Math.max(0, x - ahora), datos: { t: tipo, s: sujeto, i, x } };
}

export function cookieDe(valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
export function cookieFuera() { return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }

export function leerCookie(request) {
  const h = request.headers.get('Cookie') || '';
  for (const parte of h.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === COOKIE) return parte.slice(i + 1).trim();
  }
  return '';
}

export async function sha256hex(texto) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(String(texto)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function igual(a, b) {
  const x = String(a), y = String(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}
export function rutaSegura(a) {
  const r = String(a || '/');
  return /^\/(?![/\\])[^\s]*$/.test(r) && !r.startsWith('/puerta/') ? r : '/';
}
