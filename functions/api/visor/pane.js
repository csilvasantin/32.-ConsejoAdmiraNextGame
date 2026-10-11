/**
 * /api/visor/pane — pantallas en vivo de los deepagents de pago para /visor/ (r27 · Carlos 11-10-2026 12:16).
 * POST (X-Council-Token / Bearer = token de máquina, como /api/consumos/pulso): lo manda ~/.fleet/visor-publicar.py
 *      cada 3 s y solo si algo cambió (con latido cada 60 s). Ver visor-lib.mjs para el formato.
 * GET  (X-Visor-Key: llave del visor; NO es público: el contenido de una terminal es sensible) → { ok, fichas:[…] }.
 * Almacén: Cache API del colo (al instante, gratis) + RECORTE_KV como respaldo (≤ 1 escritura / 20 s / máquina).
 */
import { autorizado } from "../consumos/lecturas.js";
import { normalizarPane, fundir, vista, sha256, iguales, personaDe, CONF_DEFECTO, CONF_GROK, KEY_MAQ, KEY_INDICE, KEY_LLAVES, KV_CADA_MS } from "../../../visor-lib.mjs";

/* r42: ¿dónde trabaja cada agente? Presencia y bandeja públicas de Yokup (las de agentes_vivos). El visor pide cada 3 s:
 * se lee como mucho cada 20 s por isolate, con tope de 4 s; si Yokup no contesta, vale lo último bueno (≤ 2 min) y, sin
 * eso, la vista cae al modo de antes (solo paneles). */
export const PRESENCIA = "https://bot.yokup.com/api/presence";
export const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const UBIC_CADA_MS = 20000, UBIC_MAX_MS = 120000, UBIC_TOPE_MS = 4000;
let ubic = null; // { presencia, encargos, ts }
export function _olvidarUbicacion() { ubic = null; }
async function jsonDe(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(UBIC_TOPE_MS) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
export async function leerUbicacion(fetchImpl, lista, ahora = Date.now()) {
  if (ubic && ahora - ubic.ts < UBIC_CADA_MS) return ubic;
  const personas = [...new Set(lista.map((c) => personaDe(c.titulo)).filter(Boolean))];
  const [p, ...bandejas] = await Promise.all([jsonDe(fetchImpl, PRESENCIA), ...personas.map((x) => jsonDe(fetchImpl, BANDEJA + "?persona=" + encodeURIComponent(x.charAt(0).toUpperCase() + x.slice(1))))]);
  if (p && Array.isArray(p.presence)) {
    const encargos = {};
    personas.forEach((x, i) => { const b = bandejas[i]; if (b && Array.isArray(b.items)) encargos[x] = b.items.filter((it) => it && it.status === "in_progress"); });
    ubic = { presencia: p.presence, encargos: Object.keys(encargos).length ? encargos : null, ts: ahora, ahoraYokup: Number(p.now) || null };
    return ubic;
  }
  return ubic && ahora - ubic.ts < UBIC_MAX_MS ? ubic : null;
}

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
function headers(origin) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization, X-Visor-Key", vary: "Origin" };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
let CACHE_BASE = "https://www.admira.live/__visor-cache/v1/";
function fijarBase(request) { try { CACHE_BASE = new URL("/__visor-cache/v1/", request.url).toString(); } catch (e) {} }
function cache() { try { return (typeof caches !== "undefined" && caches.default) || null; } catch (e) { return null; } }
async function cacheGet(clave) {
  const c = cache(); if (!c) return null;
  try { const r = await c.match(CACHE_BASE + encodeURIComponent(clave)); return r ? await r.json() : null; } catch (e) { return null; }
}
async function cachePut(clave, obj) {
  const c = cache(); if (!c) return;
  try { await c.put(CACHE_BASE + encodeURIComponent(clave), new Response(JSON.stringify(obj), { headers: { "content-type": "application/json", "cache-control": "public, max-age=900" } })); } catch (e) {}
}
async function kvGet(store, clave) { if (!store) return null; try { const r = await store.get(clave); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

/** ¿La llave del visor es buena? Hashes en KV (revocables al momento) o el secreto VISOR_VIEW_TOKEN. */
export async function llaveValida(request, env) {
  const cand = String(request.headers.get("X-Visor-Key") || "").trim(); // solo cabecera: la llave no viaja en URLs ni logs
  if (cand.length < 20) return false;
  const fija = String((env && env.VISOR_VIEW_TOKEN) || "").trim();
  if (fija && iguales(cand, fija)) return true;
  const doc = await kvGet(kv(env), KEY_LLAVES);
  if (!doc || !Array.isArray(doc.llaves)) return false;
  const h = await sha256(cand);
  return doc.llaves.some((l) => l && iguales(l.hash, h));
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestPost({ request, env }) {
  fijarBase(request);
  const origin = request.headers.get("Origin") || "";
  const auth = autorizado(request, env);
  if (auth === null) return json({ ok: false, error: "escrituras cerradas: falta token de máquina" }, 503, origin);
  if (!auth) return json({ ok: false, error: "no autorizado" }, 401, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const ahora = Date.now();
  const n = normalizarPane(body, ahora);
  if (!n.ok) return json(n, 400, origin);
  const store = kv(env);
  const clave = KEY_MAQ + n.pane.maquina;
  let prev = await cacheGet(clave);
  let base = !!prev;
  if (!prev && !n.pane.completo) { prev = await kvGet(store, clave); base = !!prev; }
  const doc = fundir(prev, n.pane);
  const tareas = [];
  let kvGuardado = false;
  if (store && ahora - (doc.kvTs || 0) >= KV_CADA_MS) {
    doc.kvTs = ahora; kvGuardado = true;
    tareas.push(store.put(clave, JSON.stringify(doc), { expirationTtl: 86400 }).catch(() => {}));
    tareas.push((async () => {
      const idx = (await kvGet(store, KEY_INDICE)) || [];
      if (Array.isArray(idx) && !idx.includes(doc.maquina)) await store.put(KEY_INDICE, JSON.stringify([...idx, doc.maquina].slice(-10)));
    })().catch(() => {}));
  }
  tareas.push(cachePut(clave, doc));
  const idxC = (await cacheGet(KEY_INDICE)) || [];
  if (!idxC.includes(doc.maquina)) tareas.push(cachePut(KEY_INDICE, [...idxC, doc.maquina].slice(-10)));
  await Promise.all(tareas);
  // completo:false sin base → el publicador manda todo en el siguiente envío
  return json({ ok: true, maquina: doc.maquina, agentes: Object.keys(doc.agentes), necesitaCompleto: !n.pane.completo && !base, kv: kvGuardado }, 200, origin);
}

export async function onRequestGet({ request, env, fetchImpl }) {
  fijarBase(request);
  const origin = request.headers.get("Origin") || "";
  if (!(await llaveValida(request, env))) return json({ ok: false, error: "llave del visor ausente o revocada" }, 401, origin);
  const store = kv(env);
  const ahora = Date.now();
  let idx = await cacheGet(KEY_INDICE);
  const idxKv = await kvGet(store, KEY_INDICE);
  idx = [...new Set([...(Array.isArray(idx) ? idx : []), ...(Array.isArray(idxKv) ? idxKv : [])])].slice(0, 10);
  const docs = await Promise.all(idx.map(async (m) => {
    const c = await cacheGet(KEY_MAQ + m);
    if (c && ahora - c.ts < 15000) return c;
    const k = await kvGet(store, KEY_MAQ + m);
    if (c && k) return c.ts >= k.ts ? c : k;
    return c || k;
  }));
  const grupo = Number(new URL(request.url).searchParams.get("g")) === 6 ? 6 : 4; // r33: /visor/?g=6 → + Smith y Merovingio
  const conf = docs.filter((d) => d && d.conf).sort((a, b) => b.ts - a.ts)[0];
  const u = await leerUbicacion(fetchImpl || fetch, [...((conf && conf.conf) || CONF_DEFECTO), ...CONF_GROK], ahora).catch(() => null);
  return json({ ok: true, ...vista(docs, ahora, { grupo, presencia: u && u.presencia, encargos: u && u.encargos }), grupo, generado: new Date(ahora).toISOString(), ahora }, 200, origin);
}
