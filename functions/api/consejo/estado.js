/**
 * GET /api/consejo/estado — público, solo #, título corto y hora.
 * Junta el latido de los consejeros (mcp.admira.live/consejeros/latido) con
 * los done de la bandeja pública, las misiones Yokup resueltas (por ?agent=)
 * y los PRs fusionados de hoy (00:00 Europe/Madrid). Ranking por mesa de 6,
 * sin «/6». Sin textos privados. Caché corta. No escribe el latido.
 *
 * GitHub: User-Agent admira-live-consejo + Accept application/vnd.github+json;
 * GITHUB_TOKEN opcional; resultado en KV 8 min. Si el Worker sigue recibiendo
 * 403/404, se usa el snapshot de tools/consejo-prs-hoy.mjs.
 */
import { armarMesa, CACHE_SEG, botDe, MESA } from "../../../consejo-globo-lib.mjs";
import { obtenerPrs, REPOS_PR } from "../../../consejo-prs-lib.mjs";
import { leerYokup, YOKUP_RES_GLOBAL } from "../../../consejo-yokup-lib.mjs";

const LATIDO = "https://mcp.admira.live/consejeros/latido";
const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const cab = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=" + CACHE_SEG,
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

async function leerJson(fetchImpl, url, ms = 8000) {
  const r = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "admira-live-consejo" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(r.status + " en " + url);
  return r.json();
}

export async function construir({ fetchImpl, ahoraMs, env, waitUntil, kv } = {}) {
  const f = fetchImpl || fetch;
  const ahora = ahoraMs || Date.now();
  const personas = [...new Set(Object.values(MESA).flat().map((d) => botDe(d.persona)).filter(Boolean))];
  const errores = {};
  const [latido, prsInfo, yokupInfo, ...listas] = await Promise.all([
    leerJson(f, LATIDO).catch((e) => { errores.latido = String(e.message || e); return null; }),
    obtenerPrs({ fetchImpl: f, env, ahoraMs: ahora, waitUntil, kv }),
    leerYokup(f, errores),
    ...personas.map((p) => leerJson(f, BANDEJA + "?persona=" + encodeURIComponent(p))
      .then((d) => (d && d.items) || [])
      .catch((e) => { errores["bandeja_" + p] = String(e.message || e); return null; })),
  ]);
  const bandejas = Object.fromEntries(personas.map((p, i) => [p, listas[i]]));
  const latidos = (latido && latido.consejeros) || {};
  if (prsInfo && prsInfo.errores) Object.assign(errores, prsInfo.errores);
  const prs = prsInfo ? prsInfo.prs : null;
  const yokup = yokupInfo ? yokupInfo.misiones : null;
  const cuerpo = armarMesa({ latidos, bandejas, prs, yokup, ahoraMs: ahora });
  cuerpo.fuentes = {
    latido: LATIDO,
    bandeja: BANDEJA,
    yokup: yokupInfo && yokupInfo.modo === "por-agente"
      ? (yokupInfo.host || "https://api.yokup.com") + "/fleet/missions?status=resolved&agent="
      : YOKUP_RES_GLOBAL,
    yokup_modo: yokupInfo && yokupInfo.modo || null,
    yokup_agentes_ok: yokupInfo && yokupInfo.agentes_ok || [],
    prs: REPOS_PR.map((r) => "https://github.com/" + r),
    prs_fuente: prsInfo && prsInfo.fuente || null,
    prs_cache: !!(prsInfo && prsInfo.cache),
    prs_actualizado: prsInfo && prsInfo.actualizado || null,
    latido_ok: !!latido,
    yokup_ok: yokup != null,
    prs_ok: prs != null,
  };
  if (Object.keys(errores).length) cuerpo.errores = errores;
  return cuerpo;
}

export async function onRequestGet(ctx) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const ck = new Request(new URL(ctx.request.url).origin + "/api/consejo/estado?_c=1");
  if (cache) {
    try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {}
  }
  const cuerpo = JSON.stringify(await construir({
    fetchImpl: ctx.env && ctx.env.fetch ? ctx.env.fetch.bind(ctx.env) : fetch,
    env: ctx.env,
    waitUntil: ctx.waitUntil && ctx.waitUntil.bind(ctx),
  }));
  if (cache) {
    try { const pr = cache.put(ck, new Response(cuerpo, { headers: cab })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {}
  }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cab });
}
