// Comunes de /api/consejo/* (mesa de debate, 11-10-2026): DMZ, CORS y acceso.
import { tokenMaquina, emailGoogle } from "./chat-hilo-lib.mjs";
import { esHostProduccion } from "./debatir-lib.mjs";

const ORIGENES = /^https:\/\/([a-z0-9-]+\.)?admira-live\.pages\.dev$|^https:\/\/(www\.)?admira\.live$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export function cabeceras(origin, extra = {}) {
  const h = {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", vary: "Origin",
    "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, Authorization, X-Council-Token",
    ...extra,
  };
  if (origin && ORIGENES.test(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
export const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: cabeceras(origin) });

/** DMZ: fuera de la zona pública mientras Carlos no diga lo contrario (DEBATIR_PUBLICO=1). */
export function enDmz(request, env) {
  const host = new URL(request.url).hostname;
  return esHostProduccion(host) && String((env && env.DEBATIR_PUBLICO) || "") !== "1";
}

function iguales(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/** Acceso: token de máquina de la caja · DEBATIR_TOKEN (preview) · ID token de Google de la allowlist. */
export async function quien(request, env, fetchImpl = fetch) {
  if (tokenMaquina(request, env)) return "caja";
  const auth = String(request.headers.get("Authorization") || "");
  const cand = (auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("X-Council-Token") || "").trim();
  const propio = String((env && env.DEBATIR_TOKEN) || "").trim();
  if (propio && iguales(cand, propio)) return "preview";
  return await emailGoogle(request, env, fetchImpl);
}
