/**
 * /api/chat/entre-consejeros — mensajes privados ENTRE CONSEJEROS (consejero_mensaje /
 * consejero_bandeja / consejero_responder del Worker admira-live-mcp, KV ADMIRA_LIVE_DESDE).
 * Carlos, 19-10-2026: que se vean en «Conversación» / /chat/<consejero>/, solo con sesión
 * Google autorizada de admira.live (la misma que /api/chat/hilo). Nunca público. Solo lectura.
 *
 * GET ?con=Jobs&limite=50 → { ok, con, mensajes:[{id,de,para,texto,maquina,hora,leido,…}], pendientes }
 * Lee del Worker (MCP_BASE, por defecto https://mcp.admira.live) /consejero/mensajes. Si el
 * proyecto tiene CONSEJERO_MENSAJES_TOKEN, lo manda en X-Mensajes-Token (el Worker con ese
 * mismo secreto deja de servir la ruta en abierto).
 */
import { emailGoogle, tokenMaquina } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json } from "../../../chat-hilo-http.mjs";

export const SILLAS = { jobs: "Jobs", wozniak: "Wozniak", lucas: "Lucas", disney: "Disney", musk: "Musk", elon: "Musk", huang: "Huang", jensen: "Huang", y: "Y" };
export const silla = (s) => SILLAS[String(s || "").trim().toLowerCase()] || null;
const CAMPOS = ["id", "de", "para", "texto", "maquina", "hora", "leido", "leido_en", "responde_a", "de_tipo", "para_tipo"];

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", "GET, OPTIONS") });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const f = fetchImpl || fetch;
  const quien = tokenMaquina(request, env) ? "maquina" : await emailGoogle(request, env, f);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin, "GET, OPTIONS");
  const url = new URL(request.url);
  const con = silla(url.searchParams.get("con"));
  if (!con) return json({ ok: false, error: "con inválido (Jobs, Wozniak, Lucas, Disney, Musk, Huang, Y)" }, 400, origin, "GET, OPTIONS");
  const limite = Math.min(50, Math.max(1, Number(url.searchParams.get("limite")) || 50));
  const base = String((env && env.MCP_BASE) || "https://mcp.admira.live").replace(/\/$/, "");
  const headers = { accept: "application/json" };
  const tok = String((env && env.CONSEJERO_MENSAJES_TOKEN) || "").trim();
  if (tok) headers["x-mensajes-token"] = tok;
  let d;
  try {
    const r = await f(`${base}/consejero/mensajes?con=${encodeURIComponent(con)}`, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return json({ ok: false, error: `bandeja no disponible (${r.status})` }, 502, origin, "GET, OPTIONS");
    d = await r.json();
  } catch (e) {
    return json({ ok: false, error: "no se pudo leer la bandeja" }, 502, origin, "GET, OPTIONS");
  }
  const mensajes = (Array.isArray(d && d.mensajes) ? d.mensajes : []).slice(-limite)
    .map((m) => Object.fromEntries(CAMPOS.map((k) => [k, m && m[k] !== undefined ? m[k] : null])));
  return json({ ok: true, con, mensajes, pendientes: Number(d && d.pendientes) || 0, lector: quien === "maquina" ? "maquina" : "google" }, 200, origin, "GET, OPTIONS");
}
