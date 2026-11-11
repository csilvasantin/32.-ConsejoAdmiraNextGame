/**
 * GET /api/consejo/estado — público, solo #, título corto y hora.
 * Junta el latido de los consejeros (mcp.admira.live/consejeros/latido, el de
 * consejero_latido) con el último done de la bandeja pública. Sin textos
 * privados. Caché corta. No escribe: el POST/tool sigue siendo consejero_latido.
 */
import { armarMesa, CACHE_SEG, botDe, MESA } from "../../../consejo-globo-lib.mjs";

const LATIDO = "https://mcp.admira.live/consejeros/latido";
const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const cab = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=" + CACHE_SEG,
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

async function leerJson(fetchImpl, url, ms = 8000) {
  const r = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "admira-live-globo" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(r.status + " en " + url);
  return r.json();
}

export async function construir({ fetchImpl, ahoraMs } = {}) {
  const f = fetchImpl || fetch;
  const ahora = ahoraMs || Date.now();
  const personas = [...new Set(Object.values(MESA).flat().map((d) => botDe(d.persona)).filter(Boolean))];
  const errores = {};
  const [latido, ...listas] = await Promise.all([
    leerJson(f, LATIDO).catch((e) => { errores.latido = String(e.message || e); return null; }),
    ...personas.map((p) => leerJson(f, BANDEJA + "?persona=" + encodeURIComponent(p))
      .then((d) => (d && d.items) || [])
      .catch((e) => { errores["bandeja_" + p] = String(e.message || e); return null; })),
  ]);
  const bandejas = Object.fromEntries(personas.map((p, i) => [p, listas[i]]));
  const latidos = (latido && latido.consejeros) || {};
  const cuerpo = armarMesa({ latidos, bandejas, ahoraMs: ahora });
  cuerpo.fuentes = { latido: LATIDO, bandeja: BANDEJA, latido_ok: !!latido };
  if (Object.keys(errores).length) cuerpo.errores = errores;
  return cuerpo;
}

export async function onRequestGet(ctx) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const ck = new Request(new URL(ctx.request.url).origin + "/api/consejo/estado?_c=1");
  if (cache) {
    try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {}
  }
  const cuerpo = JSON.stringify(await construir({ fetchImpl: ctx.env && ctx.env.fetch ? ctx.env.fetch.bind(ctx.env) : fetch }));
  if (cache) {
    try { const pr = cache.put(ck, new Response(cuerpo, { headers: cab })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {}
  }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cab });
}
