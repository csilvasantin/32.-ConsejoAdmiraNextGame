/*
 * Común de /api/lanzadera/* (Carlos, 27-nov-2026, t1452u).
 * /api/* es público en la puerta de servidor (_puerta.js), así que CADA endpoint de la lanzadera
 * comprueba la sesión aquí: cookie de la puerta (persona) o sesión de Google. Nada se abre sin login.
 * Los equipos de la flota entran con su token de máquina (X-Council-Token), nunca con la cookie.
 */
import { verificar, leerCookie } from './_puerta.js';
import { emailGoogle } from '../chat-hilo-lib.mjs';
import { autorizado as tokenMaquina } from './api/consumos/lecturas.js';
import { KV_KEY, estadoVacio, censoDesdePresencia, contieneSecreto } from '../lanzadera-ejecucion-lib.mjs';

export const PRESENCIA = 'https://bot.yokup.com/api/presence';
const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
};

export function json(datos, status = 200) {
  const s = JSON.stringify(datos);
  if (status === 200 && contieneSecreto(s)) {
    return new Response(JSON.stringify({ ok: false, error: 'respuesta retenida por precaución (posible secreto)' }), { status: 500, headers: CABECERAS });
  }
  return new Response(s, { status, headers: CABECERAS });
}

/** Sesión de persona. `escritura`: la llave de kiosco y la de agente (solo lectura) no lanzan demos. */
export async function sesion(request, env, f, { escritura = false } = {}) {
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d) {
    if (escritura && d.t !== 'persona') return { ok: false, status: 403, error: 'esta sesión es de solo lectura' };
    return { ok: true, tipo: d.t };
  }
  const email = await emailGoogle(request, env, f);
  if (email) return { ok: true, tipo: 'google' };
  return { ok: false, status: 401, error: 'sesion' };
}

export function mismoOrigen(request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true; // navegadores siempre la mandan en POST; curl con cookie, igual de autenticado
  try { return origin === new URL(request.url).origin; } catch (e) { return false; }
}

export function esMaquina(request, env) {
  return tokenMaquina(request, env);
}

// Sin KV (local o tests) el estado vive en memoria del isolate: se dice en la respuesta.
let memoria = null;
export const kv = (env) => (env && (env.RECORTE_KV || env.CONSUMOS_KV)) || null;

export async function leerEstado(env) {
  const store = kv(env);
  if (!store) return { estado: memoria || estadoVacio(), persistencia: 'memoria' };
  try {
    const raw = await store.get(KV_KEY);
    return { estado: raw ? JSON.parse(raw) : estadoVacio(), persistencia: 'kv' };
  } catch (e) { return { estado: estadoVacio(), persistencia: 'kv' }; }
}

export async function guardarEstado(env, estado) {
  const store = kv(env);
  if (!store) { memoria = estado; return 'memoria'; }
  await store.put(KV_KEY, JSON.stringify(estado));
  return 'kv';
}

export async function leerCenso(f, ahoraMs = Date.now()) {
  try {
    const r = await f(PRESENCIA, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { ok: false, vivos: new Set() };
    const d = await r.json();
    return { ok: !!(d && Array.isArray(d.presence)), vivos: censoDesdePresencia(d, Math.floor(ahoraMs / 1000)) };
  } catch (e) { return { ok: false, vivos: new Set() }; }
}

export function _olvidarMemoria() { memoria = null; }
