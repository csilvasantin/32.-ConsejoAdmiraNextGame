/**
 * /api/consumos/lineas — líneas de código de los agentes y tokens en el mismo eje (GrokBotBox, 09-10-2026 · r30).
 * GET ?rango=1h|24h|7d → { ok, rango, fuente:'commits'|'fotos'|'ninguna', lineas:{serie,total,porAgente,porProyecto},
 *       tokens:[{ts,tok|null}], hoy:{lineas, porAgente}, actualizado } (público, sin contenido de código).
 * POST (X-Council-Token = CONSUMOS_LECTURAS_TOKEN) ← tools/lineas-commits.py cada 15 min: { ts, commits:[{s,t,a,d,g,m,r}] }.
 * Criterio en consumos-lineas-lib.mjs.
 */
import { rangoValido, RANGOS, lineasPorCubo, commitsDeFotos, tokensPorCubo, lineasHoy, normalizarDoc } from "../../../consumos-lineas-lib.mjs";
import { agentesDePulso } from "../../../consumos-pulso-lib.mjs";
import { leerPulsos } from "./pulso.js";
import { autorizado } from "./lecturas.js";
import { KEY_INDICE as KEY_FOTOS } from "../../../control-lineas-lib.mjs";

export const KEY_COMMITS = "consumos:lineas:commits:v1";
const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cab });
const leeJson = async (store, k) => { try { const r = store ? await store.get(k) : null; return r ? JSON.parse(r) : null; } catch (e) { return null; } };

export async function construir({ env, rango, ahora = Date.now() }) {
  const r = rangoValido(rango), store = kv(env);
  const [doc, docs] = await Promise.all([leeJson(store, KEY_COMMITS), leerPulsos(store).catch(() => [])]);
  let commits = doc && Array.isArray(doc.commits) ? doc.commits : null, fuente = "commits";
  if (!commits || !commits.length) {
    commits = commitsDeFotos(await leeJson(store, KEY_FOTOS));
    fuente = commits.length ? "fotos" : "ninguna";
  }
  const conSerie = agentesDePulso(docs, ahora).filter((a) => !a.stale).map((a) => ({ serie: a._serie }));
  return {
    ok: true, rango: r, pasoMin: RANGOS[r].pasoMin, fuente,
    lineas: lineasPorCubo(commits, r, ahora), tokens: tokensPorCubo(conSerie, r, ahora), hoy: lineasHoy(fuente === "commits" ? commits : [], ahora),
    actualizado: doc && doc.ts ? new Date(doc.ts * 1000).toISOString() : null, repos: doc ? doc.repos || [] : [],
    metodo: fuente === "commits" ? "líneas añadidas por commit en la rama principal (mismos ficheros que el HACKEO), atribuidas por autor/Co-authored-by"
      : fuente === "fotos" ? "Δ entre fotos de /api/control/lineas (00:00 y 12:00), escalonado" : "sin datos",
    generado: new Date(ahora).toISOString(),
  };
}

export async function onRequestGet(ctx) {
  const rango = rangoValido(new URL(ctx.request.url).searchParams.get("rango"));
  let cache = null;
  const ck = new Request(new URL(ctx.request.url).origin + "/api/consumos/lineas?_c=" + rango);
  try { cache = typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) {}
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {} }
  const cuerpo = JSON.stringify(await construir({ env: ctx.env, rango }));
  if (cache) { try { const pr = cache.put(ck, new Response(cuerpo, { headers: { "content-type": "application/json", "cache-control": "public, max-age=20" } })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {} }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export async function onRequestPost({ request, env }) {
  const ok = autorizado(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta CONSUMOS_LECTURAS_TOKEN" }, 503);
  if (!ok) return json({ ok: false, error: "no autorizado: manda X-Council-Token" }, 401);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503);
  const texto = await request.text();
  if (texto.length > 2_000_000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413);
  let body; try { body = JSON.parse(texto || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400); }
  const { doc, error } = normalizarDoc(body, Date.now());
  if (error) return json({ ok: false, error }, 400);
  await kv(env).put(KEY_COMMITS, JSON.stringify(doc));
  return json({ ok: true, commits: doc.commits.length, lineas: doc.commits.reduce((s, c) => s + c.a, 0) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization" } });
}
