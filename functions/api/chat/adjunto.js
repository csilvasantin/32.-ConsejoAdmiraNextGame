/**
 * /api/chat/adjunto — imagen pegada en Conversación → Jobs (FLT-101758, GrokBotBox 09-10-2026).
 * POST: sube image/* (auth Google o token de máquina) a KV; GET ?id=… sirve la imagen (pública,
 * id opaco) para que el encargo del hilo lleve una URL que Jobs pueda abrir.
 */
import { tokenMaquina, emailGoogle } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json, kv } from "../../../chat-hilo-http.mjs";

const MAX = 1_500_000; // ~1,5 MB tras el downscale del cliente
const TTL = 60 * 60 * 24 * 7; // 7 días
const ID_RE = /^[a-f0-9]{16,40}$/;
const clave = (id) => `chat:adj:v1:${id}`;

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", "GET, POST, OPTIONS") });
}

function nuevoId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const M = "GET, POST, OPTIONS";
  const doFetch = fetchImpl || fetch;
  const maquina = tokenMaquina(request, env);
  const quien = maquina ? "caja" : await emailGoogle(request, env, doFetch);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401, origin, M);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin, M);
  const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) return json({ ok: false, error: "solo image/*" }, 415, origin, M);
  const buf = await request.arrayBuffer();
  if (!buf || !buf.byteLength) return json({ ok: false, error: "cuerpo vacío" }, 400, origin, M);
  if (buf.byteLength > MAX) return json({ ok: false, error: `imagen demasiado grande (máx. ${MAX} bytes)` }, 413, origin, M);
  const id = nuevoId();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const doc = { type, b64: btoa(bin), autor: quien === "caja" ? "caja" : quien, ts: new Date().toISOString() };
  await kv(env).put(clave(id), JSON.stringify(doc), { expirationTtl: TTL });
  const url = new URL(request.url);
  url.search = "";
  url.pathname = "/api/chat/adjunto";
  url.searchParams.set("id", id);
  return json({ ok: true, id, url: url.toString(), bytes: buf.byteLength, type }, 201, origin, M);
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const M = "GET, POST, OPTIONS";
  const id = String(new URL(request.url).searchParams.get("id") || "").trim().toLowerCase();
  if (!ID_RE.test(id)) return json({ ok: false, error: "id inválido" }, 400, origin, M);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin, M);
  const raw = await kv(env).get(clave(id));
  if (!raw) return json({ ok: false, error: "no encontrado" }, 404, origin, M);
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "corrupto" }, 500, origin, M); }
  if (!doc || !doc.b64) return json({ ok: false, error: "corrupto" }, 500, origin, M);
  const bin = atob(doc.b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  const h = cabeceras(origin, M);
  h["content-type"] = doc.type || "image/jpeg";
  h["cache-control"] = "public, max-age=86400";
  delete h["content-type"]; // set below with binary
  return new Response(out, {
    status: 200,
    headers: {
      "content-type": doc.type || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "x-robots-tag": "noindex",
      ...(origin && h["access-control-allow-origin"] ? { "access-control-allow-origin": h["access-control-allow-origin"] } : {}),
    },
  });
}
