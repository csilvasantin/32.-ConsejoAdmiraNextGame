import { tokenMaquinaOk } from '../../../consejo-ask-lib.mjs';
import { verificar, leerCookie, secretoValido } from '../../_puerta.js';

const ALLOW = new Set([
  'https://www.admira.live',
  'https://admira.live',
  'https://admira-live.pages.dev',
]);

export function corsHeaders(origin, methods = 'GET, POST, OPTIONS') {
  const h = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': methods,
    'access-control-allow-headers': 'Content-Type, X-Mensajes-Token, X-Council-Token',
    vary: 'Origin',
  };
  let host = '';
  try { host = origin ? new URL(origin).host : ''; } catch { host = ''; }
  if (origin && (ALLOW.has(origin) || /\.admira-live\.pages\.dev$/.test(host))) {
    h['access-control-allow-origin'] = origin;
  } else if (!origin) {
    h['access-control-allow-origin'] = 'https://www.admira.live';
  }
  return h;
}

export const json = (obj, status, origin, methods) =>
  new Response(JSON.stringify(obj), { status, headers: corsHeaders(origin, methods) });

export function options(request, methods) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '', methods) });
}

export async function autorizado(request, env) {
  if (tokenMaquinaOk(request, env)) return { ok: true, via: 'maquina' };
  const secreto = env && env.PUERTA_FIRMA;
  if (secretoValido(secreto)) {
    const d = await verificar(secreto, leerCookie(request));
    if (d) return { ok: true, via: d.t, sujeto: d.s };
  }
  // Misma política que escena0: origen admira.live (kiosco / misma pestaña con cookie o sin token de máquina).
  const origin = request.headers.get('Origin') || '';
  let host = '';
  try { host = origin ? new URL(origin).host : ''; } catch { host = ''; }
  if (origin && (ALLOW.has(origin) || /\.admira-live\.pages\.dev$/.test(host))) {
    return { ok: true, via: 'origen' };
  }
  return { ok: false };
}
