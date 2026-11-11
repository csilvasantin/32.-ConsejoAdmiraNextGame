/**
 * GET /api/consejo/estado — público, solo #, título corto y hora.
 * Junta el latido de los consejeros (mcp.admira.live/consejeros/latido) con
 * los done de la bandeja pública, las misiones Yokup resueltas y los PRs
 * fusionados de hoy (00:00 Europe/Madrid). Ranking por mesa de 6, sin «/6».
 * Sin textos privados.
 * Caché corta. No escribe: el POST/tool sigue siendo consejero_latido.
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

const REPOS_PR = ["csilvasantin/32.-ConsejoAdmiraNextGame", "csilvasantin/admira-next-web"];
const YOKUP_RES = "https://api.yokup.com/fleet/missions?status=resolved&limit=120";
const YOKUP_ALL = "https://api.yokup.com/fleet/missions?limit=80";
const GH = "https://api.github.com";

async function leerJson(fetchImpl, url, ms = 8000) {
  const r = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "admira-live-globo" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(r.status + " en " + url);
  return r.json();
}

function prsDe(lista, repo) {
  return (Array.isArray(lista) ? lista : []).map((pr) => ({
    repo,
    number: pr.number,
    title: pr.title,
    merged_at: pr.merged_at,
    rama: pr.head && pr.head.ref,
  }));
}

async function leerPrs(f, errores) {
  const partes = await Promise.all(REPOS_PR.map((repo) =>
    leerJson(f, GH + "/repos/" + repo + "/pulls?state=closed&sort=updated&direction=desc&per_page=50")
      .then((d) => prsDe(d, repo))
      .catch((e) => { errores["pr_" + repo] = String(e.message || e); return null; })
  ));
  if (partes.every((p) => p == null)) return null;
  return partes.filter(Boolean).flat();
}

async function leerYokup(f, errores) {
  try {
    const d = await leerJson(f, YOKUP_RES);
    return (d && d.missions) || [];
  } catch (e) {
    try {
      const d = await leerJson(f, YOKUP_ALL);
      return (d && d.missions) || [];
    } catch (e2) {
      errores.yokup = String(e2.message || e2);
      return null;
    }
  }
}

export async function construir({ fetchImpl, ahoraMs } = {}) {
  const f = fetchImpl || fetch;
  const ahora = ahoraMs || Date.now();
  const personas = [...new Set(Object.values(MESA).flat().map((d) => botDe(d.persona)).filter(Boolean))];
  const errores = {};
  const [latido, prs, yokup, ...listas] = await Promise.all([
    leerJson(f, LATIDO).catch((e) => { errores.latido = String(e.message || e); return null; }),
    leerPrs(f, errores),
    leerYokup(f, errores),
    ...personas.map((p) => leerJson(f, BANDEJA + "?persona=" + encodeURIComponent(p))
      .then((d) => (d && d.items) || [])
      .catch((e) => { errores["bandeja_" + p] = String(e.message || e); return null; })),
  ]);
  const bandejas = Object.fromEntries(personas.map((p, i) => [p, listas[i]]));
  const latidos = (latido && latido.consejeros) || {};
  const cuerpo = armarMesa({ latidos, bandejas, prs, yokup, ahoraMs: ahora });
  cuerpo.fuentes = {
    latido: LATIDO,
    bandeja: BANDEJA,
    yokup: YOKUP_RES,
    prs: REPOS_PR.map((r) => "https://github.com/" + r),
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
  const cuerpo = JSON.stringify(await construir({ fetchImpl: ctx.env && ctx.env.fetch ? ctx.env.fetch.bind(ctx.env) : fetch }));
  if (cache) {
    try { const pr = cache.put(ck, new Response(cuerpo, { headers: cab })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {}
  }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cab });
}
