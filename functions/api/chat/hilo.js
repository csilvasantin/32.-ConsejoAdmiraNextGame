/**
 * /api/chat/hilo — el hilo compartido Carlos ↔ consejero (empieza por Jobs). GrokBotBox, 09-10-2026.
 *
 * POST { persona, rol: "carlos"|<persona>, origen: "app"|"live"|"rutina", texto, ts?, msg_id? }
 *      con X-Council-Token (o Authorization: Bearer) = token de máquina (CONSUMOS_LECTURAS_TOKEN).
 *      Idempotente por msg_id (sin msg_id, id derivado del contenido). Texto ≤ 8000; últimos 500 turnos.
 * GET  ?persona=jobs&limite=50 → { ok, persona, turnos } — PRIVADO: token de máquina o
 *      ID token de Google de una cuenta de Carlos (el mismo client_id del login de admira.live).
 * KV: CHAT_KV si existe; si no, RECORTE_KV del proyecto (clave chat:hilo:v1:<persona>).
 */
import { normalizarPersona, normalizarTurno, anadirTurno, tokenMaquina, emailGoogle, claveHilo, PERSONAS, porSincronizar, turnoDeEncargo, BOT_INBOX } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json, kv, cargarHilo } from "../../../chat-hilo-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const maquina = tokenMaquina(request, env);
  const quien = maquina ? "maquina" : await emailGoogle(request, env, fetchImpl || fetch);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin);
  const url = new URL(request.url);
  const persona = normalizarPersona(url.searchParams.get("persona") || "jobs");
  if (!persona) return json({ ok: false, error: `persona inválida (${PERSONAS.join(", ")})` }, 400, origin);
  const limite = Math.min(500, Math.max(1, Number(url.searchParams.get("limite")) || 50));
  if (!kv(env)) return json({ ok: true, persona, turnos: [], almacen: "ninguno" }, 200, origin);
  let doc = await cargarHilo(env, persona);
  doc = await sincronizar(env, persona, doc, fetchImpl || fetch);
  return json({ ok: true, persona, total: doc.turnos.length, turnos: doc.turnos.slice(-limite), actualizado: doc.actualizado, lector: quien === "maquina" ? "maquina" : "google" }, 200, origin);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ok = tokenMaquina(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta el token de máquina en el proyecto" }, 503, origin);
  if (!ok) return json({ ok: false, error: "no autorizado: manda X-Council-Token" }, 401, origin);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin);
  const crudo = await request.text();
  if (crudo.length > 20000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin);
  let body;
  try { body = JSON.parse(crudo || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin); }
  const { turno, error } = await normalizarTurno(body);
  if (error) return json({ ok: false, error }, 400, origin);
  const doc = await cargarHilo(env, turno.persona);
  const r = anadirTurno(doc.turnos, turno);
  if (!r.duplicado) {
    doc.turnos = r.turnos;
    doc.persona = turno.persona;
    doc.actualizado = new Date().toISOString();
    await kv(env).put(claveHilo(turno.persona), JSON.stringify(doc));
  }
  return json({ ok: true, duplicado: r.duplicado, turno: { id: r.turno.id, ts: r.turno.ts, rol: r.turno.rol, origen: r.turno.origen }, total: r.duplicado ? doc.turnos.length : r.turnos.length }, r.duplicado ? 200 : 201, origin);
}

/* Si la rutina cerró el encargo con telegram_responder pero no escribió en el hilo, su respuesta
   (nota del bot-inbox) se trae aquí con msg_id enc-<n>-resp: el mismo id que usaría la rutina. */
export async function sincronizar(env, persona, doc, doFetch) {
  const llave = String(env.ADMIRA_TELEGRAM_PANEL_KEY || "").trim();
  const pendientes = llave ? porSincronizar(doc.turnos, persona) : [];
  if (!pendientes.length) return doc;
  let cambio = false;
  for (const t of pendientes) {
    try {
      const r = await doFetch(`${BOT_INBOX}/${Number(t.encargo)}`, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { accept: "application/json", authorization: "Bearer " + llave } });
      if (!r.ok) continue;
      const item = (await r.json()).item;
      if (!item || Number(item.id) !== Number(t.encargo)) continue;
      if (t.encargo_estado !== item.status) { t.encargo_estado = item.status; cambio = true; }
      const resp = turnoDeEncargo(persona, item);
      if (resp) { const a = anadirTurno(doc.turnos, resp); if (!a.duplicado) { doc.turnos = a.turnos; cambio = true; } }
    } catch (e) { /* sin red: se intenta en la próxima lectura */ }
  }
  if (cambio) {
    // Releer y fundir para no pisar un POST concurrente.
    const fresco = await cargarHilo(env, persona);
    for (const t of doc.turnos) {
      const ya = fresco.turnos.find((x) => x.id === t.id);
      if (ya) { if (t.encargo_estado) ya.encargo_estado = t.encargo_estado; }
      else fresco.turnos = anadirTurno(fresco.turnos, t).turnos;
    }
    fresco.actualizado = new Date().toISOString();
    await kv(env).put(claveHilo(persona), JSON.stringify(fresco));
    return fresco;
  }
  return doc;
}
