/**
 * GET /api/consumos/historico?tipo=agente|proyecto&nombre=X → histórico (historico-lib.mjs): hoy, ayer, semana pasada, mes pasado.
 * GET /api/consumos/historico → { agentes, proyectos } elegibles.
 * Mejora 6 (23-10-2026): primera carga < 3 s. Se sirve SIEMPRE de lo guardado en KV (historico:dia:v1, historico:encargos:v1 y
 * el agregado historico:fuentes:v2 = partes de Yokup 60 días + misiones + ventana de cada bandeja). Si el agregado tiene
 * más de 10 min (o no existe), se refresca EN SEGUNDO PLANO (stale-while-revalidate; las misiones de Yokup tardan 25-40 s).
 */
import { historico, KEY_HIST, KEY_ENCARGOS, claveProyecto, claveAgente } from "../../../historico-lib.mjs";
import { AGENTES_FLOTA, CONSEJEROS } from "../../../flota-matriz-lib.mjs";

const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
export const KEY_FUENTES = "historico:fuentes:v2";
export const FRESCO_MS = 10 * 60 * 1000;
export const PARTES = "https://api.yokup.com/fleet/consumo?dias=60";
export const MISIONES = ["https://api.yokup.com/fleet/missions?status=resolved&limit=500", "https://api.yokup.com/fleet/missions?limit=500"];
export const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
let refrescando = false;

async function leer(fetchImpl, url, ms) {
  try { const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(ms) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function leerKV(store, k) { if (!store) return null; try { const s = await store.get(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const slimMision = (m) => ({ id: m.id, subject: String(m.subject || "").slice(0, 160), status: m.status, project_id: m.project_id || m.project || null, assignee: m.assignee || null, persona: m.persona || null, created_at: m.created_at, updated_at: m.updated_at });
const slimParte = (p) => ({ owner: p.owner, machine: p.machine, dia: p.dia, datos: { persona: p.datos && p.datos.persona, total: p.datos && p.datos.total, cache: p.datos && p.datos.cache, causa: p.datos && p.datos.causa, origen: p.datos && p.datos.origen } });

/** Refresca el agregado lento (partes + misiones + ventanas de bandeja) y lo guarda. Conserva lo anterior si una fuente falla. */
export async function refrescarFuentes({ env, fetchImpl = fetch, ahoraMs = Date.now(), previo = null }) {
  const store = kv(env);
  const personas = [...AGENTES_FLOTA, ...CONSEJEROS];
  const [dPartes, bandejas, ...mis] = await Promise.all([leer(fetchImpl, PARTES, 20000),
    Promise.all(personas.map((p) => leer(fetchImpl, BANDEJA + "?persona=" + encodeURIComponent(p), 15000).then((d) => [p, d]))),
    ...MISIONES.map((u) => leer(fetchImpl, u, 60000))]);
  const vistos = new Set(), misiones = [];
  for (const d of mis) for (const m of (d && d.missions) || []) if (m && m.id && !vistos.has(m.id)) { vistos.add(m.id); misiones.push(slimMision(m)); }
  const ventanas = { ...((previo && previo.ventanas) || {}) }, items = [];
  for (const [p, d] of bandejas) {
    const its = (d && d.items) || [];
    if (its.length) { ventanas[claveAgente(p)] = its.reduce((m, x) => (x.ts && (!m || x.ts < m) ? x.ts : m), null); items.push(...its); }
  }
  const nuevo = {
    ts: ahoraMs,
    partes: dPartes && Array.isArray(dPartes.partes) ? dPartes.partes.map(slimParte) : (previo && previo.partes) || null,
    misiones: misiones.length ? misiones : (previo && previo.misiones) || null,
    misionesTs: misiones.length ? ahoraMs : (previo && previo.misionesTs) || null,
    ventanas,
  };
  if (store) {
    try { await store.put(KEY_FUENTES, JSON.stringify(nuevo)); } catch (e) {}
    if (items.length) {
      try {
        const { anotarEncargos } = await import("../../../historico-lib.mjs");
        const enc = await leerKV(store, KEY_ENCARGOS);
        await store.put(KEY_ENCARGOS, JSON.stringify(anotarEncargos(enc || [], items, ahoraMs)));
      } catch (e) {}
    }
  }
  return nuevo;
}

export async function construir({ env, fetchImpl = fetch, tipo, nombre, ahoraMs = Date.now(), enFondo = null }) {
  const store = kv(env);
  const [libro, encKV, fuentes] = await Promise.all([leerKV(store, KEY_HIST), leerKV(store, KEY_ENCARGOS), leerKV(store, KEY_FUENTES)]);
  const viejo = !fuentes || !fuentes.ts || ahoraMs - fuentes.ts > FRESCO_MS;
  if (viejo && !refrescando) {
    refrescando = true;
    const p = refrescarFuentes({ env, fetchImpl, ahoraMs, previo: fuentes }).catch(() => null).finally(() => { refrescando = false; });
    if (enFondo) enFondo(p);
  }
  const misiones = (fuentes && fuentes.misiones) || null;
  if (!tipo || !nombre) {
    const nombresProy = new Map();
    for (const m of misiones || []) if (m.project_id) nombresProy.set(claveProyecto(m.project_id), m.project_id);
    for (const e of Object.values(libro || {})) for (const k of Object.keys((e && e.proyectos) || {})) if (!nombresProy.has(k)) nombresProy.set(k, k);
    return { ok: true, agentes: [...AGENTES_FLOTA, ...CONSEJEROS], proyectos: [...nombresProy.values()].sort(), actualizando: viejo };
  }
  const ventanaEncargos = tipo === "agente" && fuentes && fuentes.ventanas ? fuentes.ventanas[claveAgente(nombre)] || null : null;
  return { ok: true, ...historico({ tipo, nombre, ahoraMs, libro, partes: fuentes && fuentes.partes, encargos: Array.isArray(encKV) ? encKV : [], misiones, ventanaEncargos }),
    fuentes: { libro: libro ? Object.keys(libro).sort()[0] : null, partes: fuentes && fuentes.partes ? fuentes.partes.length : 0, misiones: misiones ? misiones.length : 0,
      encargosLibro: Array.isArray(encKV) ? encKV.length : 0, agregado: fuentes && fuentes.ts ? new Date(fuentes.ts).toISOString() : null, actualizando: viejo },
    generado: new Date(ahoraMs).toISOString() };
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const tipo = u.searchParams.get("tipo") === "proyecto" ? "proyecto" : u.searchParams.get("tipo") === "agente" ? "agente" : null;
  const nombre = (u.searchParams.get("nombre") || "").slice(0, 60);
  let cache = null; try { cache = typeof caches !== "undefined" ? caches.default : null; } catch (e) {}
  const ck = new Request(u.origin + "/api/consumos/historico?_c=2&tipo=" + (tipo || "") + "&nombre=" + encodeURIComponent(nombre));
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {} }
  const r = await construir({ env: ctx.env, tipo, nombre, enFondo: (p) => ctx.waitUntil && ctx.waitUntil(p) });
  const cuerpo = JSON.stringify(r);
  // Solo se cachea en el borde (60 s) la respuesta con el agregado al día.
  if (cache && !(r.fuentes && r.fuentes.actualizando) && !r.actualizando) { try { const p = cache.put(ck, new Response(cuerpo, { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } })); if (ctx.waitUntil) ctx.waitUntil(p); } catch (e) {} }
  return new Response(cuerpo, { status: 200, headers: cab });
}
