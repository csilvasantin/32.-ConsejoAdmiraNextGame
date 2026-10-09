/**
 * /api/chat/salud?persona=jobs — salud del hilo compartido (público, SIN texto de mensajes).
 * estado «aviso» si un mensaje de Carlos desde admira.live lleva > 10 min sin respuesta.
 */
import { normalizarPersona, salud, PERSONAS } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json, kv, cargarHilo } from "../../../chat-hilo-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", "GET, OPTIONS") });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const persona = normalizarPersona(new URL(request.url).searchParams.get("persona") || "jobs");
  if (!persona) return json({ ok: false, error: `persona inválida (${PERSONAS.join(", ")})` }, 400, origin, "GET, OPTIONS");
  if (!kv(env)) return json({ ...salud([], persona), almacen: "ninguno" }, 200, origin, "GET, OPTIONS");
  const doc = await cargarHilo(env, persona);
  return json(salud(doc.turnos, persona), 200, origin, "GET, OPTIONS");
}
