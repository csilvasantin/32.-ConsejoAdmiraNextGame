/**
 * GET /api/chat/ultimo — consejero con el que el usuario logueado habló por última vez.
 * Auth: sesión Google o token de máquina. No devuelve textos ni datos de terceros.
 */
import { emailGoogle, tokenMaquina, PERSONAS, NOMBRES, ultimoConsejero } from "../../../chat-hilo-lib.mjs";
import { json, kv, cargarHilo } from "../../../chat-hilo-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: { "access-control-allow-methods": "GET, OPTIONS" } });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const maquina = tokenMaquina(request, env);
  const quien = maquina ? "caja" : await emailGoogle(request, env, fetchImpl || fetch);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin);
  if (!kv(env)) return json({ ok: true, persona: null, motivo: "sin almacenamiento" }, 200, origin);
  const hilos = [];
  for (const persona of PERSONAS) {
    const doc = await cargarHilo(env, persona);
    hilos.push({ persona, turnos: doc.turnos || [] });
  }
  const u = ultimoConsejero(hilos, quien);
  if (!u) return json({ ok: true, persona: null }, 200, origin);
  return json({
    ok: true,
    persona: u.persona,
    nombre: NOMBRES[u.persona] || u.persona,
    ts: new Date(u.ts).toISOString(),
  }, 200, origin);
}
