/**
 * POST /api/chat/enviar — Carlos escribe al consejero desde admira.live (GrokBotBox, 09-10-2026).
 * { persona?: "jobs", texto, msg_id }  · auth: ID token de Google de Carlos o token de máquina de la caja.
 * 1) guarda el turno (rol carlos, origen live, msg_id) en el hilo; 2) lo entrega como encargo
 * [chat-coetaneos] al bot-inbox (bot.yokup.com), que despierta la rutina del consejero por su webhook.
 * Idempotente por msg_id: un msg_id ya entregado no se reenvía nunca.
 */
import { normalizarPersona, normalizarTurno, anadirTurno, tokenMaquina, emailGoogle, claveHilo, textoEncargo, BOT_INBOX, PERSONA_INBOX } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json, kv, cargarHilo } from "../../../chat-hilo-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", "POST, OPTIONS") });
}

async function guardar(env, persona, cambiar) {
  const doc = await cargarHilo(env, persona);
  const r = cambiar(doc);
  doc.actualizado = new Date().toISOString();
  await kv(env).put(claveHilo(persona), JSON.stringify(doc));
  return r;
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const M = "POST, OPTIONS";
  const doFetch = fetchImpl || fetch;
  const maquina = tokenMaquina(request, env);
  const quien = maquina ? "caja" : await emailGoogle(request, env, doFetch);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin, M);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin, M);
  const llave = String(env.ADMIRA_TELEGRAM_PANEL_KEY || "").trim();
  if (!llave) return json({ ok: false, error: "entrega cerrada: falta ADMIRA_TELEGRAM_PANEL_KEY en el proyecto" }, 503, origin, M);
  const crudo = await request.text();
  if (crudo.length > 20000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin, M);
  let body;
  try { body = JSON.parse(crudo || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin, M); }
  const persona = normalizarPersona(body.persona || "jobs");
  if (!persona) return json({ ok: false, error: "persona inválida" }, 400, origin, M);
  if (!body.msg_id) return json({ ok: false, error: "falta msg_id" }, 400, origin, M);
  const { turno, error } = await normalizarTurno({ persona, rol: "carlos", origen: "live", texto: body.texto, msg_id: body.msg_id });
  if (error) return json({ ok: false, error }, 400, origin, M);
  if (turno.texto.length > 3000) return json({ ok: false, error: "texto demasiado largo para el encargo (máx. 3000)" }, 400, origin, M);
  turno.entrega = "enviando"; turno.autor = quien === "caja" ? "caja" : quien;

  // Reserva idempotente antes de la única llamada al bot-inbox.
  const reserva = await guardar(env, persona, (doc) => {
    const r = anadirTurno(doc.turnos, turno);
    doc.turnos = r.turnos;
    return r;
  });
  const previo = reserva.turno;
  if (reserva.duplicado) {
    if (previo.texto !== turno.texto) return json({ ok: false, error: "msg_id ya usado con otro texto" }, 409, origin, M);
    return json({ ok: true, duplicado: true, turno: { id: previo.id, ts: previo.ts, entrega: previo.entrega, encargo: previo.encargo || null } }, 200, origin, M);
  }
  const doc = await cargarHilo(env, persona);
  let encargo = null, entrega = "error", detalle = "";
  try {
    const r = await doFetch(BOT_INBOX, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + llave },
      body: JSON.stringify({ text: textoEncargo(persona, doc.turnos, turno), target_persona: PERSONA_INBOX[persona], target_machine: "grokbot", from: "Admira.live · chat/" + persona, materialize_mission: false }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.ok && Number(d.id) > 0) { encargo = Number(d.id); entrega = "entregado"; }
    else detalle = `bot-inbox ${r.status}`;
  } catch (e) {
    // Ambiguo: el bot-inbox pudo aceptarlo. No se reintenta: queda «sin confirmar».
    entrega = "sin_confirmar"; detalle = "sin respuesta del bot-inbox";
  }
  await guardar(env, persona, (d2) => {
    const t = d2.turnos.find((x) => x.id === turno.id);
    if (t) { t.entrega = entrega; if (encargo) t.encargo = encargo; if (detalle) t.detalle = detalle; }
  });
  const ok = entrega === "entregado";
  return json({ ok, turno: { id: turno.id, ts: turno.ts, entrega, encargo }, error: ok ? undefined : detalle }, ok ? 201 : 502, origin, M);
}
