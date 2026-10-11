/**
 * /api/interface — órdenes de `/interface` para los MÓVILES (r29 · Jensen Huang · Carlos 11-10-2026 12:51).
 * El móvil tiene abierta admira.live/interface/?d=<dispositivo> y pregunta cada pocos segundos qué enseñar.
 *   POST { dispositivo, accion: "terminal"|"off", grid: 2|4 }  → { ok, orden }
 *   GET  ?d=<dispositivo>                                       → { ok, orden|null }
 * Auth: la MISMA llave del visor de Elon/Merovingio (cabecera X-Visor-Key; llaveValida de visor/pane.js, revocable).
 * Sin llave no se lee ni se escribe nada. La orden no lleva URLs ni claves: solo qué cuadrícula abrir.
 * Almacén: Cache API del colo (al instante) + KV (CONSUMOS_KV|RECORTE_KV) como respaldo, 1 h de vida.
 */
import { llaveValida } from "./visor/pane.js";

export const DISPOSITIVOS_MOVIL = ["fold", "iphone"];
/** #5707: con «/interface 2 claude|Neo Trinity» la orden lleva los 2 nombres (solo nombres de los 6 del visor, nunca URLs). */
export const AGENTES_VISOR = ["Neo", "Morfeo", "Trinity", "Oraculo", "Smith", "Merovingio"];
const agenteVisor = (s) => AGENTES_VISOR.find((a) => a.toLowerCase() === String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()) || null;
const KEY = "interface:v1:dev:";
const TTL = 3600;
const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex" } });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
let BASE = "https://www.admira.live/__interface-cache/v1/";
function fijarBase(request) { try { BASE = new URL("/__interface-cache/v1/", request.url).toString(); } catch (e) {} }
function cache() { try { return (typeof caches !== "undefined" && caches.default) || null; } catch (e) { return null; } }
async function leer(env, d) {
  let c = null, k = null;
  const ca = cache();
  if (ca) { try { const r = await ca.match(BASE + d); c = r ? await r.json() : null; } catch (e) {} }
  const s = kv(env);
  if (s) { try { const r = await s.get(KEY + d); k = r ? JSON.parse(r) : null; } catch (e) {} }
  if (c && k) return (c.ts || 0) >= (k.ts || 0) ? c : k;
  return c || k;
}

/** Normaliza una orden (puro, lo prueba interface-cli.test.mjs). */
export function normalizarOrden(body, ahora = Date.now()) {
  const d = String((body && body.dispositivo) || "").toLowerCase();
  if (!DISPOSITIVOS_MOVIL.includes(d)) return { ok: false, error: "dispositivo móvil: fold | iphone" };
  const accion = String((body && body.accion) || "");
  if (accion !== "terminal" && accion !== "off") return { ok: false, error: "accion: terminal | off" };
  const grid = Number(body && body.grid) || 0;
  if (accion === "terminal" && grid !== 2 && grid !== 4 && grid !== 6) return { ok: false, error: "grid: 2 | 4 | 6" };
  const orden = { dispositivo: d, accion, grid: accion === "off" ? (grid === 2 || grid === 4 || grid === 6 ? grid : 0) : grid, ts: ahora, id: ahora.toString(36) + Math.random().toString(36).slice(2, 6) };
  if (accion === "terminal" && grid === 2 && body.agentes != null) {
    const a = Array.isArray(body.agentes) ? body.agentes.map(agenteVisor) : [];
    if (a.length !== 2 || !a[0] || !a[1] || a[0] === a[1]) return { ok: false, error: "agentes: 2 distintos de " + AGENTES_VISOR.join(", ") };
    orden.agentes = a;
  }
  return { ok: true, orden };
}

export async function onRequestPost({ request, env }) {
  fijarBase(request);
  if (!(await llaveValida(request, env))) return json({ ok: false, error: "llave del visor ausente o revocada" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400); }
  const n = normalizarOrden(body);
  if (!n.ok) return json(n, 400);
  const tareas = [];
  const ca = cache();
  if (ca) tareas.push(ca.put(BASE + n.orden.dispositivo, new Response(JSON.stringify(n.orden), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + TTL } })).catch(() => {}));
  const s = kv(env);
  if (s) tareas.push(s.put(KEY + n.orden.dispositivo, JSON.stringify(n.orden), { expirationTtl: TTL }).catch(() => {}));
  await Promise.all(tareas);
  return json({ ok: true, orden: n.orden, almacen: s ? "kv+cache" : "cache" });
}

export async function onRequestGet({ request, env }) {
  fijarBase(request);
  if (!(await llaveValida(request, env))) return json({ ok: false, error: "llave del visor ausente o revocada" }, 401);
  const d = String(new URL(request.url).searchParams.get("d") || "").toLowerCase();
  if (!DISPOSITIVOS_MOVIL.includes(d)) return json({ ok: false, error: "d: fold | iphone" }, 400);
  const o = await leer(env, d);
  return json({ ok: true, orden: o && Date.now() - (o.ts || 0) < TTL * 1000 ? o : null });
}
