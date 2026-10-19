/**
 * /api/control/equipos — equipos ELIMINADOS (borrado lógico) del tablero /control.
 *
 * GET  → { ok, ocultos:{<id normalizado>:{id,nombre,at,vivo,por,restaurado?}}, alias:{}, updatedAt }
 *        Público y de solo lectura: no hay secretos, sólo qué fichas no pintar.
 * POST { accion:"ocultar"|"restaurar", id, nombre?, vivo?, por? }
 *        Desde la propia web (Origin admira.live / www / previews *.admira-live.pages.dev,
 *        con la cabecera X-Admira-Control que obliga al preflight CORS) o con el token
 *        de máquina (X-Council-Token, igual que /api/control/lineas).
 *
 * NO toca admira-fleet: ocultar es reversible y no borra ninguna ficha viva. Cada
 * cambio deja la versión anterior 30 días (control:equipos:hist:<fecha>) para deshacer.
 * KV: RECORTE_KV (mismo binding que /api/recorte), clave propia control:equipos:v1.
 */
import { autorizado } from "../consumos/lecturas.js";

export const KEY = "control:equipos:v1";
const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
const PREVIEW = /^https:\/\/[a-z0-9-]+\.admira-live\.pages\.dev$/;
export const origenPermitido = (o) => !!o && (ALLOW.has(o) || PREVIEW.test(o));

function headers(origin) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Admira-Control, X-Council-Token, Authorization",
    vary: "Origin",
  };
  if (origenPermitido(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });
const kv = (env) => (env && env.RECORTE_KV) || null;
export const norm = (s) => String(s || "").toLowerCase().replace(/^admira-?/, "").replace(/[^a-z0-9]/g, "");
const limpio = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n);

export async function cargar(env) {
  const raw = kv(env) ? await kv(env).get(KEY) : null;
  try { const d = raw ? JSON.parse(raw) : null; if (d && typeof d.ocultos === "object") return { ocultos: d.ocultos || {}, alias: d.alias || {}, updatedAt: d.updatedAt || null }; } catch (e) {}
  return { ocultos: {}, alias: {}, updatedAt: null };
}

/** Valida y aplica una acción sobre el estado. Devuelve { estado } o { error }. */
export function aplicarAccion(estado, body, ahoraMs = Date.now()) {
  const accion = String(body && body.accion || "");
  if (accion !== "ocultar" && accion !== "restaurar") return { error: "accion: ocultar | restaurar" };
  const id = limpio(body.id, 80);
  const k = norm(id);
  if (!id || !k || k.length > 64 || !/^[A-Za-z0-9 ._()\-\u00a0]+$/.test(id)) return { error: "id inválido" };
  const at = Math.floor(ahoraMs / 1000);
  const ocultos = Object.assign({}, estado.ocultos);
  if (accion === "ocultar") ocultos[k] = { id, nombre: limpio(body.nombre || id, 80), at, vivo: body.vivo === true, por: limpio(body.por, 80) };
  else ocultos[k] = { id, nombre: limpio(body.nombre || (ocultos[k] && ocultos[k].nombre) || id, 80), at, restaurado: true };
  if (Object.keys(ocultos).length > 200) return { error: "demasiados equipos" };
  return { estado: { ocultos, alias: estado.alias || {}, updatedAt: new Date(ahoraMs).toISOString() } };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!kv(env)) return json({ ok: true, ocultos: {}, alias: {}, updatedAt: null, almacen: "ninguno" }, 200, origin);
  return json(Object.assign({ ok: true }, await cargar(env)), 200, origin);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const desdeLaWeb = origenPermitido(origin) && request.headers.get("X-Admira-Control") === "1";
  if (!desdeLaWeb && autorizado(request, env) !== true) return json({ ok: false, error: "no autorizado" }, origin ? 403 : 401, origin);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento (falta RECORTE_KV)" }, 503, origin);
  const texto = await request.text();
  if (texto.length > 2000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin);
  let body;
  try { body = JSON.parse(texto || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin); }
  const antes = await cargar(env);
  const r = aplicarAccion(antes, body);
  if (r.error) return json({ ok: false, error: r.error }, 400, origin);
  await kv(env).put("control:equipos:hist:" + r.estado.updatedAt, JSON.stringify(antes), { expirationTtl: 60 * 60 * 24 * 30 });
  await kv(env).put(KEY, JSON.stringify(r.estado));
  return json(Object.assign({ ok: true }, r.estado), 200, origin);
}
