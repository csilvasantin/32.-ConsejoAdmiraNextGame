/**
 * /api/consejo/prs-hoy — snapshot de PRs fusionados para el recuento de hoy.
 * GET  → público (lista recortada: repo, #, título, rama, merged_at). El
 *        Worker lo usa como respaldo si api.github.com responde 403/404.
 * POST autenticado (X-Council-Token o Bearer = CONSUMOS_LECTURAS_TOKEN
 *      o COUNCIL_MACHINE_TOKEN). Lo escribe tools/consejo-prs-hoy.mjs.
 *      Idempotente: pisa con la lista real del momento; no acepta un vacío
 *      si algún repo no se ha leído (no se inventa un 0).
 *
 * KV: CONSUMOS_KV || RECORTE_KV, clave consejo:prs-fusionados:v1.
 */
import { autorizado } from "../consumos/lecturas.js";
import { kvDe, snapshotDelJob, escribirSnapshotKv, KEY_PRS, TTL_JOB_S, leerSnapshotKv } from "../../../consejo-prs-lib.mjs";

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
function headers(origin) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization",
    vary: "Origin",
  };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });

function publico(snap) {
  if (!snap) return { ok: true, vacio: true, prs: [], actualizado: null, fuente: null };
  return {
    ok: true,
    vacio: !snap.prs.length,
    actualizado: snap.actualizado || null,
    fuente: snap.fuente || null,
    repos_ok: snap.repos_ok || {},
    n: snap.prs.length,
    prs: snap.prs.map((p) => ({
      repo: p.repo,
      number: p.number,
      title: p.title,
      merged_at: p.merged_at,
      rama: p.rama,
    })),
  };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const snap = await leerSnapshotKv(kvDe(env));
  return json(publico(snap), 200, request.headers.get("Origin") || "");
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const auth = autorizado(request, env);
  if (auth === null) return json({ ok: false, error: "escrituras cerradas: falta CONSUMOS_LECTURAS_TOKEN" }, 503, origin);
  if (!auth) return json({ ok: false, error: "no autorizado" }, 401, origin);
  const store = kvDe(env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const r = snapshotDelJob(body, Date.now());
  if (!r.ok) return json({ ok: false, error: r.error }, 400, origin);
  const escrito = await escribirSnapshotKv(store, r.snap, TTL_JOB_S);
  if (!escrito) return json({ ok: false, error: "no se pudo guardar en KV" }, 500, origin);
  return json({ ok: true, ...publico(r.snap), clave: KEY_PRS }, 200, origin);
}
