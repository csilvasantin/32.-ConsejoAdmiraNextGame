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
 * Cada cambio deja la versión anterior 30 días (control:equipos:hist:<fecha>) para deshacer.
 * KV: RECORTE_KV (mismo binding que /api/recorte), clave propia control:equipos:v1.
 *
 * BORRADO REAL EN LAS FUENTES (19-10-2026, bug de Woz): con { ticket } —firmado por el relay
 * (POST {relay}/machines/:id/ticket, sesión Google + CSRF)— «ocultar» además da de BAJA el
 * equipo en el relay del Mac mini (fleet.json) y en admira-fleet, y «restaurar» lo vuelve a
 * poner con la copia guardada (control:equipos:copia:<id>, privada, 30 días). { dryRun:true }
 * con ticket sólo dice qué se borraría (no escribe nada, ni en KV). Sin ticket: sólo KV.
 * El token de flota (FLEET_TOKEN) vive en Pages y nunca sale hacia el navegador.
 */
import { autorizado } from "../consumos/lecturas.js";
import { propagar, verificarTicket, COPIA } from "../../../control/equipos-propagar.js";

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

export async function onRequestPost({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const desdeLaWeb = origenPermitido(origin) && request.headers.get("X-Admira-Control") === "1";
  if (!desdeLaWeb && autorizado(request, env) !== true) return json({ ok: false, error: "no autorizado" }, origin ? 403 : 401, origin);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento (falta RECORTE_KV)" }, 503, origin);
  const texto = await request.text();
  if (texto.length > 4000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin);
  let body;
  try { body = JSON.parse(texto || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin); }
  const antes = await cargar(env);
  const r = aplicarAccion(antes, body);
  if (r.error) return json({ ok: false, error: r.error }, 400, origin);
  const id = limpio(body.id, 80), k = norm(id), accion = body.accion;
  const dryRun = body.dryRun === true;

  // ¿Propagar a las fuentes (relay + admira-fleet)? Sólo con ticket válido para ESTE id y acción.
  let propagacion = null;
  if (body.ticket) {
    const t = await verificarTicket(String((env && env.FLEET_TOKEN) || "").trim(), body.ticket);
    const quiere = accion === "ocultar" ? "eliminar" : "restaurar";
    if (!t || t.id !== id || t.accion !== quiere) {
      propagacion = { ok: false, error: !env || !env.FLEET_TOKEN ? "falta FLEET_TOKEN en Pages" : "ticket inválido o caducado" };
    } else {
      const copiaRaw = accion === "restaurar" ? await kv(env).get(COPIA + k) : null;
      let copia = null; try { copia = copiaRaw ? JSON.parse(copiaRaw) : null; } catch (e) {}
      const p = await propagar({ env, accion, id, por: t.email || body.por || "", dryRun, copia, fetchImpl: fetchImpl || fetch });
      propagacion = { ok: !!(p.rele && p.rele.ok && p.fleet && p.fleet.ok), dryRun, por: t.email || "", rele: p.rele, fleet: p.fleet };
      if (!dryRun && accion === "ocultar" && p.copia && (p.copia.rele || p.copia.fleet.length))
        await kv(env).put(COPIA + k, JSON.stringify(p.copia), { expirationTtl: 60 * 60 * 24 * 30 });
      if (!dryRun && accion === "restaurar" && p.rele && p.rele.ok && p.fleet && p.fleet.ok) await kv(env).delete(COPIA + k);
    }
  }
  if (dryRun) return json(Object.assign({ ok: true, dryRun: true, propagacion }, antes), 200, origin);

  // Resumen público (sin hosts ni red) de lo que pasó en las fuentes, junto a la ficha oculta.
  if (propagacion && r.estado.ocultos[k]) {
    const res = (x) => x ? { ok: !!x.ok, error: x.error, ids: x.ids, removed: x.removed, restored: x.restored, ausente: x.ausente, status: x.status } : undefined;
    r.estado.ocultos[k].fuentes = { ok: propagacion.ok, error: propagacion.error, rele: res(propagacion.rele), fleet: res(propagacion.fleet), at: Math.floor(Date.now() / 1000) };
  }
  await kv(env).put("control:equipos:hist:" + r.estado.updatedAt, JSON.stringify(antes), { expirationTtl: 60 * 60 * 24 * 30 });
  await kv(env).put(KEY, JSON.stringify(r.estado));
  return json(Object.assign({ ok: true, propagacion }, r.estado), 200, origin);
}
