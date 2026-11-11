/**
 * /api/consejo/objetivos-abc — proyectos activos de Carlos con 3 objetivos a/b/c.
 * GET  → { ok, proyectos, fuente, actualizado } (público; si KV está vacío, plantilla
 *        con nombres y objetivos en blanco, nunca textos inventados).
 * POST { proyectos: [...] }  o  { id, nombre, activo, orden, objetivos:{a,b,c} }
 *      o { borrar: id }  con X-Council-Token (mismo que /api/consejo/foco).
 * KV: CONSUMOS_KV || RECORTE_KV, clave consejo:objetivos-abc:v1.
 *
 * Fuente nueva (t1214u): no había a/b/c en /objetivos (ideas Yokup) ni en el censo
 * /projects. El editor vive en la pestaña Objetivos; el hover de la mesa lee este GET.
 */
import { autorizado } from "../consumos/lecturas.js";
import { KEY_OBJETIVOS_ABC, normalizarDocumento, aplicarCambio, proyectosActivos } from "../../../consejo-objetivos-abc-lib.mjs";

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
export const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export async function leerDocumento(store) {
  if (!store) return normalizarDocumento(null);
  try {
    const raw = await store.get(KEY_OBJETIVOS_ABC);
    return normalizarDocumento(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return normalizarDocumento(null);
  }
}

function publico(doc) {
  const activos = proyectosActivos(doc);
  return {
    ok: true,
    proyectos: activos,
    todos: doc.proyectos,
    fuente: doc.fuente,
    actualizado: doc.actualizado || null,
    vacio: !activos.length,
  };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const d = await leerDocumento(kv(env));
  return json(publico(d), 200, request.headers.get("Origin") || "");
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
  const actual = await leerDocumento(store);
  const siguiente = aplicarCambio(actual, body);
  siguiente.actualizado = Date.now();
  siguiente.fuente = "kv";
  await store.put(KEY_OBJETIVOS_ABC, JSON.stringify(siguiente));
  return json(publico(siguiente), 200, origin);
}
