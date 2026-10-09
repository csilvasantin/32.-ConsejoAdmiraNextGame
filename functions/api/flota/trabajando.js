/**
 * /api/flota/trabajando — ¿quién trabaja AHORA? (GrokBotBox, 09-10-2026 · r28; Carlos: «¿cómo puedo saber en tiempo
 * real quién trabaja?»). Une bot.yokup.com/api/presence (latidos y process_snapshot) con /api/consumos/velocidad
 * (tok/h de los últimos 15 min y «con Carlos»). Criterio en flota-trabajando-lib.mjs.
 * GET → { ok, tarjetas:[{agente, estado:'verde'|'amarillo'|'gris', motivo, maquina, motor, modelo, foco, tarea, proyecto,
 *         encargo, tokHora, tokHoy, haceS, retrato}], presencia:'ok'|'sin respuesta', generado }. Caché de borde 8 s.
 */
import { tarjetas } from "../../../flota-trabajando-lib.mjs";
import { calcular } from "../consumos/velocidad.js";

export const PRESENCIA = "https://bot.yokup.com/api/presence";
const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };

async function leerPresencia(fetchImpl) {
  try {
    const r = await fetchImpl(PRESENCIA, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.presence) ? d : null;
  } catch (e) { return null; }
}

export async function construir({ env, fetchImpl }) {
  const ahoraMs = Date.now();
  const [p, v] = await Promise.all([leerPresencia(fetchImpl || fetch), calcular({ env, fetchImpl }).catch(() => null)]);
  const ahoraS = Math.floor(ahoraMs / 1000);
  return {
    ok: true, tarjetas: tarjetas({ presencia: p ? p.presence : [], velocidad: v, ahoraS }),
    presencia: p ? "ok" : "sin respuesta", pulso: v && v.ok ? "ok" : "sin datos",
    fuentes: [PRESENCIA, "/api/consumos/velocidad"], generado: new Date(ahoraMs).toISOString(),
  };
}

export async function onRequestGet(ctx) {
  let cache = null;
  const ck = new Request(new URL(ctx.request.url).origin + "/api/flota/trabajando?_c=1");
  try { cache = typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) {}
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {} }
  const cuerpo = JSON.stringify(await construir(ctx));
  if (cache) {
    try { const pr = cache.put(ck, new Response(cuerpo, { headers: { "content-type": "application/json", "cache-control": "public, max-age=8" } })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {}
  }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, OPTIONS" } });
}
