/**
 * /api/consumos/lecturas — lecturas del % del plan gastado por cuenta/agente (GrokBotBox, 09-10-2026).
 *
 * GET  ?dias=14[&cuenta=…]  → { ok, lecturas, series, recomendacion, generado }   (público, solo lectura)
 * POST { cuenta, grupo?, agente?, pct, tokens?, fuente: "manual"|"auto", autor, ts?, nota? }
 *      con X-Council-Token: <token>  (o Authorization: Bearer <token>), igual que las escrituras
 *      máquina-a-máquina del Consejo. El token es el secreto CONSUMOS_LECTURAS_TOKEN del proyecto
 *      Pages (o COUNCIL_MACHINE_TOKEN si algún día se pone aquí).
 *
 * Canónicas: 00:00 y 12:00 de Madrid. Una sola clave KV (barata: una lectura por visita).
 * KV: binding CONSUMOS_KV si existe; si no, el RECORTE_KV ya enlazado al proyecto (prefijo propio).
 */
import { normalizarLectura, anadir, resumirTodo, recomendar, resumirCuentas, recomendarCuentas } from "../../../consumos-lecturas-lib.mjs";
import { agentesDePulso } from "../../../consumos-pulso-lib.mjs";
import { leerPulsos } from "./pulso.js";

/** r27: tokens de hoy del pulso para la tarjeta Cursor Pro (agentes con motor «cursor»). */
export function tokensPulsoCursor(docs, ahora) {
  const ags = agentesDePulso(docs, ahora).filter((a) => a.motor === "cursor");
  if (!ags.length) return null;
  return { tokHoy: ags.reduce((s, a) => s + (Number(a.tokHoy) || 0), 0), cacheHoy: ags.reduce((s, a) => s + (Number(a.cacheHoy) || 0), 0),
    agentes: ags.map((a) => ({ agente: a.agente, tokHoy: a.tokHoy, retrasoS: a.retrasoS ?? null, datosHasta: a.datosHasta || null, cubre: a.cubre || [] })) };
}

/* Partes de tokens (mandamiento 15): la lista pública de Notificaciones de Yokup, sin secretos.
   Solo trae las abiertas (una por agente y día); si no responde, el reparto queda «pendiente». */
export const YOKUP_PARTES = "https://api.yokup.com/fleet/notificaciones?kind=consumo";
export async function leerPartes(fetchImpl = fetch) {
  try {
    const r = await fetchImpl(YOKUP_PARTES, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d && d.notificaciones) ? d.notificaciones.filter((n) => n && n.kind === "consumo").map((n) => ({ kind: n.kind, last_at_ms: n.last_at_ms || n.last_at, owner: n.owner, datos: typeof n.datos === "object" && n.datos ? { persona: n.datos.persona, total: n.datos.total, runtime: n.datos.runtime } : {} })) : null;
  } catch (e) { return null; }
}

export const KEY = "consumos:lecturas:v1";
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
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function cargar(env) {
  const raw = await kv(env).get(KEY);
  try { const d = raw ? JSON.parse(raw) : null; if (d && Array.isArray(d.lecturas)) return d; } catch (e) {}
  return { lecturas: [], actualizado: null };
}

function iguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function autorizado(request, env) {
  const secretos = [env && env.CONSUMOS_LECTURAS_TOKEN, env && env.COUNCIL_MACHINE_TOKEN].map((s) => String(s || "").trim()).filter(Boolean);
  if (!secretos.length) return null; // sin secreto configurado: escrituras cerradas
  const auth = String(request.headers.get("Authorization") || "");
  const cand = (auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("X-Council-Token") || "").trim();
  return secretos.some((s) => iguales(cand, s));
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const url = new URL(request.url);
  const dias = Math.min(120, Math.max(1, Number(url.searchParams.get("dias")) || 14));
  const cuenta = (url.searchParams.get("cuenta") || "").trim();
  if (!kv(env)) return json({ ok: true, lecturas: [], series: [], cuentas: [], recomendacion: null, almacen: "ninguno" }, 200, origin);
  const doc = await cargar(env);
  const ahora = Date.now();
  const corte = ahora - dias * 24 * 3600 * 1000;
  const lecturas = doc.lecturas.filter((l) => Date.parse(l.ts) >= corte && (!cuenta || l.cuenta === cuenta));
  const series = resumirTodo(lecturas, { ahora });
  const partes = await leerPartes(fetchImpl || fetch);
  const cuentas = resumirCuentas(lecturas, partes, { ahora });
  try {
    const tp = tokensPulsoCursor(await leerPulsos(kv(env)), ahora);
    const c = cuentas.find((x) => x.id === "cursor");
    if (c && tp) c.pulso = tp;
  } catch (e) {}
  const reparto = recomendarCuentas(cuentas);
  return json({ ok: true, cuentas, recomendacionCuentas: reparto.texto, ranking: reparto.ranking, partesYokup: partes ? partes.length : null, dias, zona: "Europe/Madrid", canonicas: ["00:00", "12:00"], lecturas, series: series.map(({ deltas, ...s }) => ({ ...s, deltas })), recomendacion: recomendar(series), actualizado: doc.actualizado, generado: new Date(ahora).toISOString() }, 200, origin);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ok = autorizado(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta el secreto CONSUMOS_LECTURAS_TOKEN en el proyecto" }, 503, origin);
  if (!ok) return json({ ok: false, error: "no autorizado: manda X-Council-Token" }, 401, origin);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin);
  const texto = await request.text();
  if (texto.length > 4000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin);
  let body;
  try { body = JSON.parse(texto || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin); }
  const { lectura, error } = normalizarLectura(body);
  if (error) return json({ ok: false, error }, 400, origin);
  const doc = await cargar(env);
  doc.lecturas = anadir(doc.lecturas, lectura);
  doc.actualizado = new Date().toISOString();
  await kv(env).put(KEY, JSON.stringify(doc));
  return json({ ok: true, lectura, total: doc.lecturas.length }, 200, origin);
}
