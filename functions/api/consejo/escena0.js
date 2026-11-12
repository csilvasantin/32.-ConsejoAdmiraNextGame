/**
 * /api/consejo/escena0 — canal compartido de la Escena 0 (comunicación entre mesas).
 * GET  → estado público (tema, turnos, siguiente, si hay cruce).
 * POST { accion:"latido"|"reservar"|"decir"|"tema", mesa, persona?, texto?, tema? }
 * Sin secretos en el cliente (kiosco). KV: CONSUMOS_KV || RECORTE_KV, clave escena0:canal:v1.
 * Escritura limitada a orígenes de admira.live y a consejeros con línea de /hablar.
 */
import {
  KEY_CANAL, canalVacio, marcarPresente, publicState, reservar, decir, parseMesa,
  mesaDe, limpiarTema, TEMA_DEFECTO,
} from "../../../escena0-lib.mjs";

const ALLOW = new Set([
  "https://www.admira.live",
  "https://admira.live",
  "https://admira-live.pages.dev",
]);
function headers(origin) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    vary: "Origin",
  };
  let host = "";
  try { host = origin ? new URL(origin).host : ""; } catch (e) { host = ""; }
  if (origin && (ALLOW.has(origin) || /\.admira-live\.pages\.dev$/.test(host))) {
    h["access-control-allow-origin"] = origin;
  } else if (!origin) {
    h["access-control-allow-origin"] = "https://www.admira.live";
  }
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });
export const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export async function leerCanal(store) {
  if (!store) return canalVacio();
  try {
    const raw = await store.get(KEY_CANAL);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === "object" ? { ...canalVacio(), ...d } : canalVacio();
  } catch (e) {
    return canalVacio();
  }
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacén KV", local: true }, 503, origin);
  const doc = await leerCanal(store);
  return json(publicState(doc, Date.now()), 200, origin);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (origin && !ALLOW.has(origin) && !/\.admira-live\.pages\.dev$/.test((() => { try { return new URL(origin).host; } catch (e) { return ""; } })())) {
    return json({ ok: false, error: "origen no permitido" }, 403, origin);
  }
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacén KV", local: true }, 503, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const ahora = Date.now();
  let doc = await leerCanal(store);
  const accion = String((body && body.accion) || "").trim();
  const mesa = parseMesa(body && body.mesa);

  if (accion === "latido") {
    if (!mesa) return json({ ok: false, error: "mesa inválida (leyendas|coetaneos)" }, 400, origin);
    doc = marcarPresente(doc, mesa, ahora);
    await store.put(KEY_CANAL, JSON.stringify(doc), { expirationTtl: 60 * 60 * 6 });
    return json(publicState(doc, ahora), 200, origin);
  }
  if (accion === "tema") {
    doc = { ...doc, tema: limpiarTema(body && body.tema), actualizado: ahora };
    await store.put(KEY_CANAL, JSON.stringify(doc), { expirationTtl: 60 * 60 * 6 });
    return json(publicState(doc, ahora), 200, origin);
  }
  if (accion === "reservar") {
    if (!mesa) return json({ ok: false, error: "mesa inválida" }, 400, origin);
    const persona = String((body && body.persona) || "").trim();
    if (mesaDe(persona) !== mesa) return json({ ok: false, error: "persona/mesa" }, 400, origin);
    doc = marcarPresente(doc, mesa, ahora);
    const r = reservar(doc, mesa, persona, ahora);
    if (!r.ok) return json({ ok: false, error: r.error, ...publicState(r.doc, ahora) }, 409, origin);
    await store.put(KEY_CANAL, JSON.stringify(r.doc), { expirationTtl: 60 * 60 * 6 });
    return json(publicState(r.doc, ahora), 200, origin);
  }
  if (accion === "decir") {
    if (!mesa) return json({ ok: false, error: "mesa inválida" }, 400, origin);
    const persona = String((body && body.persona) || "").trim();
    const r = decir(doc, { mesa, persona, texto: body && body.texto, id: body && body.id }, ahora);
    if (!r.ok) return json({ ok: false, error: r.error, ...publicState(r.doc, ahora) }, 409, origin);
    r.doc = marcarPresente(r.doc, mesa, ahora);
    await store.put(KEY_CANAL, JSON.stringify(r.doc), { expirationTtl: 60 * 60 * 6 });
    return json({ ...publicState(r.doc, ahora), turno: r.turno }, 200, origin);
  }
  return json({ ok: false, error: "acción inválida (latido|reservar|decir|tema)" }, 400, origin);
}
