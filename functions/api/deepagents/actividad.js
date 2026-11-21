/**
 * /api/deepagents/actividad — última actividad de cada deepagent en GitHub (r231). Público, sin secretos.
 * GET → { ok, agentes:{ Trinity:{ ts, hora, accion, repo, rama, pr } }, generado, fuente }.
 * Caché de borde 120 s (GitHub sin token: 60 consultas/h por IP; así no se agota).
 */
import { actividadDeEventos } from "../../../deepagents-actividad-lib.mjs";

const FUENTE = "https://api.github.com/users/csilvasantin/events/public?per_page=100";
const CACHE_S = 120;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });

export async function onRequestGet({ request, env }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const clave = new Request(new URL("/api/deepagents/actividad?c=1", request.url).toString());
  if (cache) { const hit = await cache.match(clave); if (hit) return hit; }
  let eventos = null, error = null;
  try {
    const h = { "user-agent": "admira.live-deepagents", accept: "application/vnd.github+json" };
    if (env && env.GITHUB_TOKEN) h.authorization = "Bearer " + env.GITHUB_TOKEN;
    const r = await fetch(FUENTE, { headers: h, signal: AbortSignal.timeout(8000) });
    if (r.ok) eventos = await r.json(); else error = "GitHub respondió " + r.status;
  } catch (e) { error = "GitHub no responde"; }
  if (!eventos) {
    // El fallo también se guarda 120 s: no se insiste contra GitHub en cada visita (el navegador tira de su propia IP).
    const fallo = json({ ok: false, agentes: {}, error, fuente: "github events" }, 200);
    if (cache) { try { const g = new Response(fallo.clone().body, fallo); g.headers.set("cache-control", "public, max-age=" + CACHE_S); await cache.put(clave, g); } catch (_) {} }
    return fallo;
  }
  const res = json({ ok: true, agentes: actividadDeEventos(eventos), generado: new Date().toISOString(), fuente: "github events (ramas trinity/, neo/, oraculo/, morfeo/)" });
  const guardar = new Response(res.clone().body, res);
  guardar.headers.set("cache-control", "public, max-age=" + CACHE_S);
  if (cache) { try { await cache.put(clave, guardar); } catch (_) {} }
  return res;
}
