/**
 * /api/control/actividad — HACKEO en vivo (Woz · MBP14, 13-10-2026, orden de Carlos).
 *
 * GET → { ok, activos:{ [key]:{motivos:[…]} }, lineas:{ neto, anadidas, quitadas, porRepo, completos },
 *         fuentes:{ presencia, github:{ leidos, fallos } }, corpus:{ generado }, generado }
 *
 *  · activos: proyectos con un agente interviniendo AHORA (latidos / terminales reales de
 *    bot.yokup.com/api/presence) o con un commit de < 15 min en su rama por defecto (feed Atom de GitHub).
 *  · lineas: líneas NO vacías de código añadidas/quitadas desde el commit del corpus del despliegue
 *    (/control/hackeo-corpus/index.json) hasta el HEAD actual, por repo, con el criterio de tools/hackeo-corpus.py.
 * Criterio en control-lineas-lib.mjs. Sin claves: GitHub se lee por sus URL públicas (Atom y .diff), sin API.
 * Caché de borde 20 s; cada diff (base…head) se guarda en KV (inmutable) para no volver a pedirlo.
 */
import { actividadProyectos, contarDiff, leerAtom, sumarLineasVivas } from "../../../control-lineas-lib.mjs";
import { leerPresencia } from "../flota/trabajando.js";

const GH = "https://github.com/";
const RE_REPO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;
const RE_SHA = /^[0-9a-f]{7,40}$/i;
const MAX_DIFF = 8 * 1024 * 1024;
const CACHE_S = 20;
const cab = (cache) => ({ "content-type": "application/json; charset=utf-8", "cache-control": cache || "no-store", "access-control-allow-origin": "*" });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
function cacheBorde() { try { return typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) { return null; } }

async function leerCorpus(env, origin, fetchImpl) {
  const url = new URL("/control/hackeo-corpus/index.json", origin);
  try {
    const r = env && env.ASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetchImpl(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.projects) ? d : null;
  } catch (e) { return null; }
}

export async function leerCommits(fetchImpl, repo) {
  try {
    const r = await fetchImpl(GH + repo + "/commits.atom", { headers: { accept: "application/atom+xml" }, signal: AbortSignal.timeout(8000) });
    return r.ok ? leerAtom(await r.text()) : null;
  } catch (e) { return null; }
}

/** Δ de líneas base…head de un repo, de KV o del .diff público. null si no se pudo (no se inventa). */
export async function deltaRepo({ fetchImpl, env, repo, base, head }) {
  if (!base || !head || !RE_SHA.test(base) || !RE_SHA.test(head)) return null;
  if (head.startsWith(base) || base.startsWith(head)) return { anadidas: 0, quitadas: 0, ficheros: 0, base, head };
  const clave = `control:lineas:vivo:${repo}:${base}:${head}`, store = kv(env);
  if (store) { try { const raw = await store.get(clave); if (raw) return JSON.parse(raw); } catch (e) {} }
  try {
    const r = await fetchImpl(`${GH}${repo}/compare/${base}...${head}.diff`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const txt = await r.text();
    if (txt.length > MAX_DIFF) return null;
    const d = { ...contarDiff(txt), base, head };
    if (store) { try { await store.put(clave, JSON.stringify(d), { expirationTtl: 7 * 24 * 3600 }); } catch (e) {} }
    return d;
  } catch (e) { return null; }
}

export async function construir({ env, fetchImpl = fetch, origin, ahoraMs = Date.now(), cache = cacheBorde() }) {
  const [corpus, pr] = await Promise.all([leerCorpus(env, origin, fetchImpl), leerPresencia(fetchImpl, ahoraMs, cache)]);
  const projects = ((corpus && corpus.projects) || []).filter((p) => p && p.key && RE_REPO.test(String(p.repo || "")));
  const repos = [...new Set(projects.map((p) => p.repo))];
  const atom = await Promise.all(repos.map((r) => leerCommits(fetchImpl, r)));
  const commits = {}, fallos = [];
  repos.forEach((r, i) => { if (atom[i]) commits[r] = atom[i]; else fallos.push(r); });
  // Base = commit del corpus de este despliegue (el primero de cada repo: un repo compartido trae el mismo).
  const deltas = {};
  await Promise.all(repos.map(async (r) => {
    const p = projects.find((x) => x.repo === r), base = String(p.commit_full || p.commit || "");
    const head = commits[r] && commits[r][0] ? commits[r][0].sha : null;
    deltas[r] = head ? await deltaRepo({ fetchImpl, env, repo: r, base, head }) : null;
  }));
  return {
    ok: !!corpus,
    activos: actividadProyectos({ projects, presencia: pr.d ? pr.d.presence : [], commits, ahoraMs }),
    lineas: corpus ? sumarLineasVivas(deltas) : null,
    fuentes: { presencia: pr.estado, presenciaEdadS: pr.edadS, github: { leidos: repos.length - fallos.length, fallos } },
    corpus: corpus ? { generado: corpus.generated || null, total: corpus.lines_total_all ?? null } : null,
    generado: new Date(ahoraMs).toISOString(),
  };
}

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin, cache = cacheBorde();
  const ck = new Request(origin + "/api/control/actividad?_c=1");
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab("no-store") }); } catch (e) {} }
  let d;
  try { d = await construir({ env, origin }); } catch (e) { d = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
  const txt = JSON.stringify(d);
  if (cache && d.ok) { try { await cache.put(ck, new Response(txt, { headers: cab("public, max-age=" + CACHE_S) })); } catch (e) {} }
  return new Response(txt, { status: 200, headers: cab("no-store") });
}
