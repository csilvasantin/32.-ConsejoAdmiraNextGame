/**
 * /api/win95/codex — espejo Win95 ↔ Codex (Trinity · MacStudio). Carlos t1419u, 28-11-2026.
 * Regla, saneado y formas en win95-codex-lib.mjs (léelo primero).
 *
 * GET                       Win95: instantánea de los hilos de Codex + bandeja de salida.
 *                           Cookie de la puerta (persona/kiosco/agente) o sesión de Google; 401 si no.
 * GET ?puente=1             Puente del MacStudio (token de máquina): mensajes pendientes de entregar.
 * POST {accion:"snap",…}    Puente (token de máquina): sube la instantánea. Como mucho una escritura
 *                           cada 10 s (si no, 202 sin guardar) salvo que traiga cambios de turnos reales.
 * POST {accion:"acuse",acuses:[{id,estado:"entregado"|"error",nota}]}  Puente (token de máquina).
 * POST {accion:"enviar",hilo,texto,msg_id}  Win95: SOLO sesión humana (puerta «persona» o Google) o
 *                           la caja (token de máquina). El kiosco y la puerta de agente son de solo lectura.
 * KV: CHAT_KV o RECORTE_KV (claves win95:codex:v1:*). Sin secretos en respuestas.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { tokenMaquina, emailGoogle, identidadDeEmail } from "../../../chat-hilo-lib.mjs";
import {
  CLAVE_SNAP, CLAVE_SALIDA, normalizarSnap, normalizarEnvio, anadirSalida, aplicarAcuses, vistaPublica,
} from "../../../win95-codex-lib.mjs";

const CAB = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: CAB });
const kv = (env) => (env && (env.CHAT_KV || env.RECORTE_KV)) || null;
const MIN_ESCRITURA_MS = 10 * 1000;

async function leerJson(store, clave, def) {
  try { const raw = await store.get(clave); if (!raw) return def; return JSON.parse(raw); } catch (e) { return def; }
}

/** Quién llama: {maquina} | {humano, nombre, autor} | {lector:"kiosco"|"agente"} | null */
export async function quien(request, env, fetchImpl) {
  const m = tokenMaquina(request, env);
  if (m === true) return { tipo: "maquina", escribe: true, nombre: "Caja", autor: "caja" };
  const p = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (p && p.t === "persona") return { tipo: "persona", escribe: true, nombre: nombreDe(p.s), autor: String(p.s || "persona") };
  const email = await emailGoogle(request, env, fetchImpl || fetch);
  if (email) return { tipo: "google", escribe: true, nombre: nombreDe(email), autor: email };
  if (p && (p.t === "kiosco" || p.t === "agente")) return { tipo: p.t, escribe: false, nombre: p.t, autor: "" };
  return null;
}
function nombreDe(s) {
  try { const id = identidadDeEmail(String(s || "")); if (id && id.corto) return id.corto; } catch (e) {}
  return "Carlos";
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const store = kv(env);
  const yo = await quien(request, env, fetchImpl);
  if (!yo) return json({ ok: false, error: "privado: entra en admira.live" }, 401);
  if (!store) return json({ ok: false, error: "sin almacenamiento" }, 503);
  const url = new URL(request.url);
  const salida = await leerJson(store, CLAVE_SALIDA, { items: [] });
  if (url.searchParams.get("puente") === "1") {
    if (yo.tipo !== "maquina") return json({ ok: false, error: "solo el puente" }, 403);
    return json({ ok: true, pendientes: (salida.items || []).filter((x) => x.estado === "pendiente") });
  }
  const snap = await leerJson(store, CLAVE_SNAP, null);
  return json(vistaPublica(snap, salida.items, { puedeEscribir: yo.escribe, lector: yo.tipo }));
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const store = kv(env);
  const yo = await quien(request, env, fetchImpl);
  if (!yo) return json({ ok: false, error: "privado: entra en admira.live" }, 401);
  if (!store) return json({ ok: false, error: "sin almacenamiento" }, 503);
  const crudo = await request.text();
  if (crudo.length > 2000000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413);
  let body;
  try { body = JSON.parse(crudo || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400); }
  const accion = String(body.accion || "");
  const ahora = Date.now();

  if (accion === "snap") {
    if (yo.tipo !== "maquina") return json({ ok: false, error: "solo el puente" }, 403);
    const { snap, error } = normalizarSnap(body, ahora);
    if (error) return json({ ok: false, error }, 400);
    const prev = await leerJson(store, CLAVE_SNAP, null);
    if (prev && !body.urgente && ahora - (prev.recibido || 0) < MIN_ESCRITURA_MS) return json({ ok: true, guardado: false, motivo: "demasiado pronto" }, 202);
    await store.put(CLAVE_SNAP, JSON.stringify(snap));
    return json({ ok: true, guardado: true, hilos: snap.hilos.length });
  }

  if (accion === "acuse") {
    if (yo.tipo !== "maquina") return json({ ok: false, error: "solo el puente" }, 403);
    const salida = await leerJson(store, CLAVE_SALIDA, { items: [] });
    const r = aplicarAcuses(salida.items, body.acuses, ahora);
    if (r.aplicados) await store.put(CLAVE_SALIDA, JSON.stringify({ items: r.lista, actualizado: ahora }));
    return json({ ok: true, aplicados: r.aplicados });
  }

  if (accion === "enviar") {
    if (!yo.escribe) return json({ ok: false, error: "solo lectura: entra con tu cuenta de Google para escribir a Codex" }, 403);
    const snap = await leerJson(store, CLAVE_SNAP, null);
    const nombre = yo.tipo === "maquina" && body.autor_nombre ? String(body.autor_nombre).replace(/[^\p{L}\p{N} ·()_-]/gu, "").slice(0, 30) || yo.nombre : yo.nombre;
    const { item, error } = normalizarEnvio(body, { autor: yo.autor, autorNombre: nombre, ahora, hilos: (snap && snap.hilos) || [] });
    if (error) return json({ ok: false, error }, 400);
    const salida = await leerJson(store, CLAVE_SALIDA, { items: [] });
    const r = anadirSalida(salida.items, item);
    if (r.error) return json({ ok: false, error: r.error }, 429);
    if (!r.duplicado) await store.put(CLAVE_SALIDA, JSON.stringify({ items: r.lista, actualizado: ahora }));
    return json({ ok: true, duplicado: r.duplicado, id: r.item.id, estado: r.item.estado });
  }

  return json({ ok: false, error: "acción desconocida" }, 400);
}
