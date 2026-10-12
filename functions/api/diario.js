/**
 * /api/diario — histórico de partes horarios (#5796 · modo experto /diario). Solo preview hasta orden de Carlos.
 *
 * POST { agente, texto, hora?: "HH:MM", fecha?: "hoy"|"ayer"|"DD.MM.AA"|"YYYY-MM-DD" }
 *      con X-Council-Token: <token> (o Authorization: Bearer), igual que /api/consumos/lecturas. Lo conecta la rutina de Woz.
 *      Mismo agente + misma hora el mismo día = reemplaza. El texto pasa por tapar() (secretos).
 * GET  ?fecha=hoy|ayer|DD.MM.AA   con X-Visor-Key (la llave del visor del navegador) → { ok, fecha, partes:[…] } cronológico.
 * KV: CONSUMOS_KV o RECORTE_KV, una clave por día (diario:v1:YYYY-MM-DD, 400 días).
 */
import { autorizado } from "./consumos/lecturas.js";
import { llaveValida } from "./visor/pane.js";
import { parseFecha, normalizarParte, anadirParte, KEY_DIARIO } from "../../diario-lib.mjs";

const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
const CORS = { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Visor-Key, X-Council-Token, Authorization", vary: "Origin" };
const json = (obj, status = 200, origin = "") => new Response(JSON.stringify(obj), { status, headers: {
  "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...CORS,
  ...(/^https:\/\/((www\.)?admira\.live|[a-z0-9-]+\.admira-live\.pages\.dev|admira-live\.pages\.dev)$/.test(origin) ? { "access-control-allow-origin": origin } : {}) } });
async function leer(store, fecha) { try { const r = await store.get(KEY_DIARIO + fecha); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

export function onRequestOptions({ request }) { return json({}, 204, request.headers.get("Origin") || ""); }

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ok = autorizado(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta el secreto del Consejo" }, 503, origin);
  if (!ok) return json({ ok: false, error: "token del Consejo ausente o inválido" }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin KV enlazado" }, 503, origin);
  let body; try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const n = normalizarParte(body);
  if (!n.ok) return json(n, 400, origin);
  const doc = anadirParte(await leer(store, n.fecha), n.fecha, n.parte);
  await store.put(KEY_DIARIO + n.fecha, JSON.stringify(doc), { expirationTtl: 400 * 86400 });
  return json({ ok: true, fecha: n.fecha, hora: n.parte.hora, agente: n.parte.agente, partes: doc.partes.length }, 200, origin);
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!(await llaveValida(request, env))) return json({ ok: false, error: "llave del visor ausente o revocada" }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin KV enlazado" }, 503, origin);
  const f = parseFecha(new URL(request.url).searchParams.get("fecha"));
  if (!f.ok) return json(f, 400, origin);
  const doc = await leer(store, f.fecha);
  return json({ ok: true, fecha: f.fecha, partes: (doc && doc.partes) || [], actualizado: (doc && doc.actualizado) || null }, 200, origin);
}
