/**
 * /api/chat/turno-voz — lock compartido de locución en toda la sala.
 * GET  → estado público (quién tiene el turno, si /sala-voz está abierta). Sin clienteId ajenos.
 * POST { accion:"pedir"|"liberar"|"latido"|"presencia", mensajeId, clienteId, fuente, duracionMs, consejo? }
 * Privado: misma sesión Google / token de máquina que /api/chat/entre-consejeros. Nunca público.
 * KV: CHAT_KV || CONSUMOS_KV || RECORTE_KV, clave voz:turno:v1.
 */
import { emailGoogle, tokenMaquina } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json } from "../../../chat-hilo-http.mjs";
import * as T from "../../../voz-turno-lib.mjs";

export const kv = (env) => (env && (env.CHAT_KV || env.CONSUMOS_KV || env.RECORTE_KV)) || null;

const TTL = 60 * 60 * 6;

export async function leerDoc(store) {
  if (!store) return T.vacio();
  try {
    const raw = await store.get(T.KEY_TURNO);
    const d = raw ? JSON.parse(raw) : null;
    return T.normalizar(d);
  } catch (e) {
    return T.vacio();
  }
}

async function guardar(store, doc) {
  if (!store) return;
  await store.put(T.KEY_TURNO, JSON.stringify(doc), { expirationTtl: TTL });
}

async function quienDe({ request, env, fetchImpl, quien }) {
  if (quien) return quien;
  const f = fetchImpl || fetch;
  if (tokenMaquina(request, env)) return "maquina";
  return emailGoogle(request, env, f);
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", T.METODOS) });
}

export async function onRequestGet(ctx) {
  const origin = ctx.request.headers.get("Origin") || "";
  const quien = await quienDe(ctx);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin, T.METODOS);
  const store = kv(ctx.env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503, origin, T.METODOS);
  const url = new URL(ctx.request.url);
  const yo = { clienteId: String(url.searchParams.get("cliente") || "") };
  const doc = T.expirar(await leerDoc(store), Date.now());
  return json(T.publicState(doc, Date.now(), yo), 200, origin, T.METODOS);
}

export async function onRequestPost(ctx) {
  const origin = ctx.request.headers.get("Origin") || "";
  const quien = await quienDe(ctx);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin, T.METODOS);
  const store = kv(ctx.env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503, origin, T.METODOS);
  let body;
  try { body = await ctx.request.json(); } catch (e) {
    return json({ ok: false, error: "JSON inválido" }, 400, origin, T.METODOS);
  }
  const ahora = Date.now();
  const accion = String((body && body.accion) || "").trim();
  let doc = await leerDoc(store);
  let r;
  if (accion === "pedir") r = T.pedir(doc, ahora, body);
  else if (accion === "liberar") r = T.liberar(doc, ahora, body);
  else if (accion === "latido") r = T.latido(doc, ahora, body);
  else if (accion === "presencia") r = T.presencia(doc, ahora, body);
  else return json({ ok: false, error: "accion inválida (pedir|liberar|latido|presencia)" }, 400, origin, T.METODOS);
  if (r.error && accion === "presencia") return json({ ok: false, error: r.error }, 400, origin, T.METODOS);
  if (r.error && accion === "pedir") return json({ ok: false, error: r.error }, 400, origin, T.METODOS);
  await guardar(store, r.doc);
  const pub = T.publicState(r.doc, ahora, { clienteId: body && body.clienteId });
  return json({
    ok: true,
    concedido: !!r.concedido,
    yaDicho: !!r.yaDicho,
    interrumpido: !!r.interrumpido,
    perdido: !!r.perdido,
    esperaMs: Number(r.esperaMs) || 0,
    salaAbierta: pub.salaAbierta,
    turno: pub.turno,
    cola: pub.cola,
  }, 200, origin, T.METODOS);
}
