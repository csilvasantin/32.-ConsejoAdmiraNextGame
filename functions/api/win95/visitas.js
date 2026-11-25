/**
 * /api/win95/visitas — contador real de «Eres el visitante nº» del Netscape de Vuelta al 95
 * (Carlos #7729, 25-11-2026). Antes era decorativo (427 + 1 por carga).
 *   GET  → { ok, total }                       · no suma.
 *   POST → suma 1 si la sesión del navegador aún no contó (cookie de sesión __Host-w95_visita,
 *          sin caducidad: se borra al cerrar el navegador) → { ok, total, sumada }.
 * Solo con la cookie de la puerta (persona, agente o kiosco) o sesión de Google: lo cuentan
 * quienes de verdad entran en admira.live/windows95. Guarda un número en el KV ya existente.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { kv } from "../../../chat-hilo-http.mjs";

export const CLAVE = "win95:visitas:v1";
export const COOKIE = "__Host-w95_visita";
const CAB = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { ...CAB, ...extra } });

async function autorizado(request, env, fetchImpl) {
  if (await verificar(env && env.PUERTA_FIRMA, leerCookie(request))) return true;
  return !!(await emailGoogle(request, env, fetchImpl || fetch));
}
async function total(almacen) { const n = Number(await almacen.get(CLAVE)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
function yaContada(request) { return (request.headers.get("Cookie") || "").split(";").some((p) => p.trim().startsWith(COOKIE + "=")); }

export async function onRequestGet({ request, env, fetchImpl }) {
  if (!(await autorizado(request, env, fetchImpl))) return json({ ok: false, error: "sesion" }, 401);
  const almacen = kv(env); if (!almacen) return json({ ok: false, error: "sin almacenamiento" }, 503);
  return json({ ok: true, total: await total(almacen) });
}

export async function onRequestPost({ request, env, fetchImpl }) {
  if (!(await autorizado(request, env, fetchImpl))) return json({ ok: false, error: "sesion" }, 401);
  const o = request.headers.get("Origin"); if (o && o !== new URL(request.url).origin) return json({ ok: false, error: "origen" }, 403);
  const almacen = kv(env); if (!almacen) return json({ ok: false, error: "sin almacenamiento" }, 503);
  if (yaContada(request)) return json({ ok: true, total: await total(almacen), sumada: false });
  const n = (await total(almacen)) + 1;
  await almacen.put(CLAVE, String(n));
  return json({ ok: true, total: n, sumada: true }, 200, { "set-cookie": `${COOKIE}=1; Path=/; Secure; HttpOnly; SameSite=Lax` });
}
