/**
 * /api/chat/sesion — sesión larga del chat con los consejeros (r96, 24-10-2026).
 *  POST  Authorization: Bearer <ID token de Google>  → verifica en Google (aud, email verificado, allowlist)
 *        y fija la cookie HttpOnly __Host-admira_chat (180 días). Nunca devuelve el valor de la cookie.
 *  GET   → { ok, email, exp } si la cookie es válida (para restaurar la sesión en otra pestaña/página).
 *  DELETE → borra la cookie (botón «salir»).
 */
import { emailIdToken, emailSesion, emitirSesion, cookieSesion } from "../../../chat-hilo-lib.mjs";

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const r = (cuerpo, status, extra) => { const h = new Headers(H); if (extra) h.append("Set-Cookie", extra); return new Response(JSON.stringify(cuerpo), { status, headers: h }); };
function mismoOrigen(request) { try { return request.headers.get("Origin") === new URL(request.url).origin; } catch (e) { return false; } }

export async function onRequestGet({ request, env }) {
  const email = await emailSesion(request, env);
  return email ? r({ ok: true, email }, 200) : r({ ok: false }, 401);
}

export async function onRequestPost({ request, env }) {
  if (!mismoOrigen(request)) return r({ ok: false, error: "origen" }, 403);
  const auth = String(request.headers.get("Authorization") || "");
  const email = await emailIdToken(auth.startsWith("Bearer ") ? auth.slice(7).trim() : "", env);
  if (!email) return r({ ok: false, error: "no autorizado" }, 401);
  const s = await emitirSesion(env, email);
  if (!s) return r({ ok: false, error: "sesión larga no configurada" }, 503);
  return r({ ok: true, email, exp: s.exp }, 200, cookieSesion(s.valor, Math.floor((s.exp - Date.now()) / 1000)));
}

export async function onRequestDelete({ request }) {
  if (!mismoOrigen(request)) return r({ ok: false, error: "origen" }, 403);
  return r({ ok: true }, 200, cookieSesion("", 0));
}
