// Utilidades compartidas de /api/chat/* (GrokBotBox, 09-10-2026).
import { claveHilo } from "./chat-hilo-lib.mjs";

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
export function cabeceras(origin, metodos = "GET, POST, OPTIONS") {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": metodos,
    "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization",
    "x-robots-tag": "noindex",
    vary: "Origin",
  };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
export const json = (obj, status, origin, metodos) => new Response(JSON.stringify(obj), { status, headers: cabeceras(origin, metodos) });
export const kv = (env) => (env && (env.CHAT_KV || env.RECORTE_KV)) || null;
export async function cargarHilo(env, persona) {
  const raw = await kv(env).get(claveHilo(persona));
  try { const d = raw ? JSON.parse(raw) : null; if (d && Array.isArray(d.turnos)) return d; } catch (e) {}
  return { persona, turnos: [], actualizado: null };
}
