/**
 * GET /api/consumos/historico?tipo=agente|proyecto&nombre=X → histórico (historico-lib.mjs) por periodos hoy/ayer/semana/mes.
 * GET /api/consumos/historico → { agentes, proyectos } elegibles. Solo lectura de fuentes públicas + KV propio.
 */
import { historico, KEY_HIST, KEY_ENCARGOS, claveProyecto } from "../../../historico-lib.mjs";
import { AGENTES_FLOTA, CONSEJEROS } from "../../../flota-matriz-lib.mjs";

const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
export const PARTES = "https://api.yokup.com/fleet/consumo?dias=31";
export const MISIONES = ["https://api.yokup.com/fleet/missions?status=resolved&limit=500", "https://api.yokup.com/fleet/missions?limit=500"];
export const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leer(fetchImpl, url, ms = 30000, cacheS = 0) {
  try {
    const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(ms), ...(cacheS ? { cf: { cacheTtl: cacheS, cacheEverything: true } } : {}) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
async function leerKV(store, k) { if (!store) return null; try { const s = await store.get(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

export async function construir({ env, fetchImpl = fetch, tipo, nombre, ahoraMs = Date.now() }) {
  const store = kv(env);
  const [libro, encKV, dPartes, ...mis] = await Promise.all([leerKV(store, KEY_HIST), leerKV(store, KEY_ENCARGOS), leer(fetchImpl, PARTES, 15000, 600),
    ...MISIONES.map((u) => leer(fetchImpl, u, 40000, 600))]);
  const misiones = []; const vistos = new Set();
  for (const d of mis) for (const m of (d && d.missions) || []) if (m && m.id && !vistos.has(m.id)) { vistos.add(m.id); misiones.push(m); }
  let encargos = Array.isArray(encKV) ? encKV : [];
  if (tipo && nombre) {
    const d = await leer(fetchImpl, BANDEJA + (tipo === "agente" ? "?persona=" + encodeURIComponent(nombre) : ""), 8000);
    const ids = new Set(encargos.map((x) => x.id));
    for (const x of (d && d.items) || []) if (!ids.has(x.id)) encargos.push({ id: x.id, etiqueta: x.etiqueta || null, persona: x.target_persona, proyecto: x.project_id, texto: String(x.text || "").slice(0, 160), status: x.status, ts: x.ts, ack_at: x.ack_at, done_at: x.done_at });
  }
  if (!tipo || !nombre) {
    const proys = new Set();
    for (const e of Object.values(libro || {})) for (const k of Object.keys((e && e.proyectos) || {})) proys.add(k);
    const nombresProy = new Map();
    for (const m of misiones) if (m.project_id) nombresProy.set(claveProyecto(m.project_id), m.project_id);
    for (const k of proys) if (!nombresProy.has(k)) nombresProy.set(k, k);
    return { ok: true, agentes: [...AGENTES_FLOTA, ...CONSEJEROS], proyectos: [...nombresProy.values()].sort(), libro: libro ? "ok" : "vacío", misiones: misiones.length };
  }
  return { ok: true, ...historico({ tipo, nombre, ahoraMs, libro, partes: dPartes && dPartes.partes, encargos, misiones: misiones.length ? misiones : null }),
    fuentes: { libro: libro ? Object.keys(libro).sort()[0] : null, partes: dPartes ? "ok" : "sin respuesta", misiones: misiones.length, encargosLibro: Array.isArray(encKV) ? encKV.length : 0 }, generado: new Date(ahoraMs).toISOString() };
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const tipo = u.searchParams.get("tipo") === "proyecto" ? "proyecto" : u.searchParams.get("tipo") === "agente" ? "agente" : null;
  const nombre = (u.searchParams.get("nombre") || "").slice(0, 60);
  let cache = null; try { cache = typeof caches !== "undefined" ? caches.default : null; } catch (e) {}
  const ck = new Request(u.origin + "/api/consumos/historico?_c=1&tipo=" + (tipo || "") + "&nombre=" + encodeURIComponent(nombre));
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {} }
  const cuerpo = JSON.stringify(await construir({ env: ctx.env, tipo, nombre }));
  if (cache) { try { const p = cache.put(ck, new Response(cuerpo, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } })); if (ctx.waitUntil) ctx.waitUntil(p); else await p; } catch (e) {} }
  return new Response(cuerpo, { status: 200, headers: cab });
}
