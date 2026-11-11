/**
 * /api/consejo/objetivos-abc — carrusel de Carlos (a/b/c por proyecto).
 * GET  → público, cache: no-store. El hover de la mesa lo lee en vivo.
 * POST autenticado (X-Council-Token o Authorization: Bearer), el mismo token
 *      que /api/consejo/foco: CONSUMOS_LECTURAS_TOKEN o COUNCIL_MACHINE_TOKEN.
 *
 * Titulares (reparto de Carlos, t1219u): PortAventuraNeXT → Walt,
 * AdmiraNeXT → Lucas, Alsea → Woz, Día a día → Jobs. Cada uno escribe
 * las 3 mejoras de SU proyecto (autor en el
 * cuerpo). Carlos edita desde /objetivos (autor: "carlos"); esa edición no se
 * pisa si el titular vuelve a escribir, salvo forzar:true.
 *
 * KV: CONSUMOS_KV || RECORTE_KV, clave consejo:objetivos-abc:v1.
 */
import { autorizado } from "../consumos/lecturas.js";
import { KEY_OBJETIVOS_ABC, normalizarDocumento, aplicarPeticion, proyectosActivos } from "../../../consejo-objetivos-abc-lib.mjs";

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

function publico(doc, extra) {
  const activos = proyectosActivos(doc);
  return {
    ok: true,
    proyectos: activos,
    todos: doc.proyectos,
    fuente: doc.fuente,
    actualizado: doc.actualizado || null,
    vacio: !activos.length,
    ...(extra || {}),
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
  const r = aplicarPeticion(actual, body, Date.now());
  const siguiente = r.doc;
  siguiente.actualizado = Date.now();
  siguiente.fuente = "kv";
  await store.put(KEY_OBJETIVOS_ABC, JSON.stringify(siguiente));
  return json(publico(siguiente, {
    escritos: r.escritos || [],
    conservados: r.conservados || [],
    conflictos: r.conflictos || [],
    rechazados: r.rechazados || [],
  }), 200, origin);
}
