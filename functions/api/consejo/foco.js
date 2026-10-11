/**
 * /api/consejo/foco — proyecto principal y deepagent de cada consejero (r26 · Carlos, 11-10-2026 11:31).
 * GET  → { ok, focos:{ Nombre: { proyecto, deepagent, nota, actualizado } }, defecto:{…} } (público, sin secretos).
 * POST { consejero:"Musk", proyecto:"admira.live", deepagent:"Morfeo", nota? }  (o { consejero, borrar:true })
 *      con X-Council-Token (o Authorization: Bearer), el mismo token que /api/consumos/pulso y lecturas.
 * KV: CONSUMOS_KV || RECORTE_KV, clave consejo:foco:v1 (un solo documento pequeño).
 */
import { autorizado } from "../consumos/lecturas.js";
import { KEY_FOCO, FOCO_DEFECTO, normalizarFoco, aplicarFoco } from "../../../consejo-foco-lib.mjs";

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
function headers(origin) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization", vary: "Origin" };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });
export const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export async function leerFocos(store) {
  if (!store) return { focos: {} };
  try { const raw = await store.get(KEY_FOCO); const d = raw ? JSON.parse(raw) : null; return d && d.focos ? d : { focos: {} }; } catch (e) { return { focos: {} }; }
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const d = await leerFocos(kv(env));
  return json({ ok: true, focos: d.focos, defecto: FOCO_DEFECTO, uso: "POST {consejero, proyecto, deepagent} con X-Council-Token" }, 200, request.headers.get("Origin") || "");
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const auth = autorizado(request, env);
  if (auth === null) return json({ ok: false, error: "escrituras cerradas: falta CONSUMOS_LECTURAS_TOKEN" }, 503, origin);
  if (!auth) return json({ ok: false, error: "no autorizado" }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const n = normalizarFoco(body);
  if (!n.ok) return json(n, 400, origin);
  const d = aplicarFoco(await leerFocos(store), n);
  await store.put(KEY_FOCO, JSON.stringify(d));
  return json({ ok: true, consejero: n.consejero, foco: n.borrar ? null : n.foco, focos: d.focos }, 200, origin);
}
