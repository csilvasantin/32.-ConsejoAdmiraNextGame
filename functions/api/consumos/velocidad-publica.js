/**
 * /api/consumos/velocidad-publica — tokens/hora de la flota en JSON PÚBLICO y SANEADO (2-nov-2026).
 * Para que otros proyectos (PortAventuraNeXT.com…) pinten la velocidad sin sesión ni clave.
 * Solo agregados (esquema admira.consumos.velocidad/v1, ver mcp/server/src/velocidad.js): sin emails,
 * cuentas, planes, límites ni superficies. CORS abierto (solo GET), caché de borde 10 s.
 */
import { calcular } from "./velocidad.js";
import { resumirVelocidad, CACHE_S } from "../../../mcp/server/src/velocidad.js";

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": `public, max-age=${CACHE_S}, s-maxage=${CACHE_S}`,
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "x-content-type-options": "nosniff",
};

export function onRequestOptions() { return new Response(null, { status: 204, headers: { ...CABECERAS, "access-control-max-age": "86400" } }); }

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  let cache = null;
  try { cache = typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) {}
  const ck = new Request(url.origin + "/api/consumos/velocidad-publica?_c=1");
  if (cache && !ctx.fetchImpl) { try { const hit = await cache.match(ck); if (hit) return new Response(hit.body, { headers: CABECERAS }); } catch (e) {} }
  let cuerpo;
  try { cuerpo = resumirVelocidad(await calcular(ctx), Date.now(), url.origin + "/api/consumos/velocidad-publica"); }
  catch (e) { cuerpo = resumirVelocidad(null, Date.now(), url.origin + "/api/consumos/velocidad-publica"); }
  const res = new Response(JSON.stringify(cuerpo), { headers: CABECERAS });
  if (cache && !ctx.fetchImpl) { try { const p = cache.put(ck, res.clone()); if (ctx.waitUntil) ctx.waitUntil(p); else await p; } catch (e) {} }
  return res;
}
