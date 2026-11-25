/**
 * POST /api/chat/enviar — Carlos escribe al consejero desde admira.live (GrokBotBox, 09-10-2026).
 * { persona?: "jobs", texto, msg_id }  · auth: ID token de Google de Carlos o token de máquina de la caja.
 * 1) guarda el turno (rol carlos, origen live, msg_id) en el hilo; 2) lo entrega como encargo
 * [chat-coetaneos] al bot-inbox (bot.yokup.com); 3) despierta la rutina del consejero por el
 * webhook que registró con consejero_webhook_registrar (POST /consejero/despertar en mcp.admira.live).
 * Idempotente por msg_id: un msg_id ya entregado no se reenvía nunca.
 */
import { normalizarPersona, normalizarTurno, anadirTurno, tokenMaquina, emailGoogle, claveHilo, textoEncargo, BOT_INBOX, PERSONA_INBOX, mensajeLimpio, limpiarTextoVisita, identidadDeEmail, MAX_TEXTO_WIN95, MIN_GAP_WIN95_MS } from "../../../chat-hilo-lib.mjs";
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
  const canal = String(body.canal || "").toLowerCase() === "win95" ? "win95" : "";
  const texto = limpiarTextoVisita(body.texto);
  if (canal === "win95" && texto.length > MAX_TEXTO_WIN95) return json({ ok: false, error: "texto demasiado largo (máx. 300)" }, 400, origin, M);
  const { turno, error } = await normalizarTurno({ persona, rol: "carlos", origen: "live", texto, msg_id: body.msg_id });
  if (error) return json({ ok: false, error }, 400, origin, M);
  if (turno.texto.length > 3000) return json({ ok: false, error: "texto demasiado largo para el encargo (máx. 3000)" }, 400, origin, M);
  const identidad = identidadDeEmail(quien);
  turno.entrega = "enviando";
  turno.autor = quien === "caja" ? "caja" : quien;
  turno.autor_nombre = identidad.corto;
  if (canal) turno.canal = canal;

  const docPrev = await cargarHilo(env, persona);
  const ya = (docPrev.turnos || []).find((x) => x.id === turno.id);
  if (ya) {
    if (ya.texto !== turno.texto) return json({ ok: false, error: "msg_id ya usado con otro texto" }, 409, origin, M);
    return json({ ok: true, duplicado: true, turno: { id: ya.id, ts: ya.ts, entrega: ya.entrega, encargo: ya.encargo || null, autor_nombre: ya.autor_nombre || identidad.corto } }, 200, origin, M);
  }
  if (canal === "win95" && kv(env)) {
    const prev = Number(await kv(env).get("chat:rate:v1:" + quien) || 0);
    const ahora = Date.now();
    if (prev && ahora - prev < MIN_GAP_WIN95_MS) {
      const espera = Math.max(1, Math.ceil((MIN_GAP_WIN95_MS - (ahora - prev)) / 1000));
      return json({ ok: false, error: "espera " + espera + " s antes de enviar otro mensaje", espera_s: espera }, 429, origin, M);
    }
  }

  // Reserva idempotente antes de la única llamada al bot-inbox.
  const reserva = await guardar(env, persona, (doc) => {
    const r = anadirTurno(doc.turnos, turno);
    doc.turnos = r.turnos;
    return r;
  });
  const previo = reserva.turno;
  if (reserva.duplicado) {
    if (previo.texto !== turno.texto) return json({ ok: false, error: "msg_id ya usado con otro texto" }, 409, origin, M);
    return json({ ok: true, duplicado: true, turno: { id: previo.id, ts: previo.ts, entrega: previo.entrega, encargo: previo.encargo || null, autor_nombre: previo.autor_nombre || identidad.corto } }, 200, origin, M);
  }
  if (canal === "win95" && kv(env)) {
    await kv(env).put("chat:rate:v1:" + quien, String(Date.now()), { expirationTtl: 60 });
  }
  const doc = await cargarHilo(env, persona);
  let encargo = null, entrega = "error", detalle = "";
  try {
    const r = await doFetch(BOT_INBOX, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + llave },
      body: JSON.stringify({ text: textoEncargo(persona, doc.turnos, turno, "https://www.admira.live", identidad), target_persona: PERSONA_INBOX[persona], target_machine: "grokbot", from: canal === "win95" ? "Admira.live · ICQGram/" + persona : "Admira.live · chat/" + persona, materialize_mission: false, mensaje: mensajeLimpio(persona, turno, quien) }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.ok && Number(d.id) > 0) { encargo = Number(d.id); entrega = "entregado"; }
    else detalle = `bot-inbox ${r.status}`;
  } catch (e) {
    // Ambiguo: el bot-inbox pudo aceptarlo. No se reintenta: queda «sin confirmar».
    entrega = "sin_confirmar"; detalle = "sin respuesta del bot-inbox";
  }
  if (entrega === "entregado" && encargo) {
    try {
      const base = String((env && env.MCP_BASE) || "https://mcp.admira.live").replace(/\/$/, "");
      const wr = await doFetch(base + "/consejero/despertar", {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + llave },
        body: JSON.stringify({
          persona: PERSONA_INBOX[persona], encargo, de: identidad.corto, resumen: turno.texto,
          canal: canal || "chat", id: turno.id, tipo: "chat",
          url: "https://www.admira.live/api/chat/hilo?persona=" + encodeURIComponent(persona),
        }),
      });
      const wd = await wr.json().catch(() => null);
      if (wd && wd.despertado) detalle = detalle || ("despertar webhook " + (wd.codigo || 200));
      else if (wd && wd.resultado) detalle = (detalle ? detalle + " · " : "") + "despertar: " + wd.resultado;
      else detalle = (detalle ? detalle + " · " : "") + "despertar " + wr.status;
    } catch (e) {
      detalle = (detalle ? detalle + " · " : "") + "despertar sin confirmar";
    }
  }
  await guardar(env, persona, (d2) => {
    const t = d2.turnos.find((x) => x.id === turno.id);
    if (t) { t.entrega = entrega; if (encargo) t.encargo = encargo; if (detalle) t.detalle = detalle; }
  });
  const ok = entrega === "entregado";
  return json({ ok, turno: { id: turno.id, ts: turno.ts, entrega, encargo, autor_nombre: identidad.corto }, error: ok ? undefined : detalle }, ok ? 201 : 502, origin, M);
}
