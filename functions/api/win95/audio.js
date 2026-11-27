/**
 * GET/HEAD /api/win95/audio?u= — proxy same-origin, cerrado, de audio
 * de hosts Admira para el Winamp virtual. Sirve para que Web Audio
 * (createMediaElementSource) procese el EQ sin silenciar el audio
 * cuando el origen no envía CORS. No es un proxy abierto: exige sesión
 * (cookie de la puerta o Google), solo https de hosts Admira, y reenvía
 * Range para el seek. Sin secretos.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { urlPublicaAudio } from "../../../win95-admiramp-lib.mjs";

const CABECERAS_BASE = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { ...CABECERAS_BASE, "content-type": "application/json; charset=utf-8" },
  });
}

async function autorizado(request, env) {
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d) return true;
  return !!(await emailGoogle(request, env));
}

function urlDe(request) {
  try {
    return urlPublicaAudio(new URL(request.url).searchParams.get("u") || "");
  } catch {
    return "";
  }
}

const PASO = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
];

function cabecerasSalida(up) {
  const h = { ...CABECERAS_BASE };
  for (const k of PASO) {
    const v = up.get(k);
    if (v) h[k] = v;
  }
  if (!h["accept-ranges"]) h["accept-ranges"] = "bytes";
  return h;
}

function cabecerasUpstream(request) {
  const h = { "user-agent": "admira.live-win95-audio", accept: "audio/*,*/*;q=0.8" };
  const range = request.headers.get("Range") || request.headers.get("range");
  if (range && /^bytes=/i.test(range) && range.length < 80) h.Range = range;
  const ir = request.headers.get("If-Range");
  if (ir && ir.length < 200) h["If-Range"] = ir;
  return h;
}

async function seguir(fetchImpl, url, init) {
  let destino = url;
  let res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetchImpl(destino, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("Location") || res.headers.get("location");
    const next = loc ? urlPublicaAudio(new URL(loc, destino).toString()) : "";
    if (!next) return json({ ok: false, error: "redirect" }, 502);
    destino = next;
  }
  return json({ ok: false, error: "redirect" }, 502);
}

async function proxy({ request, env, fetch: fetchImpl }, method) {
  if (!(await autorizado(request, env))) return json({ ok: false, error: "sesion" }, 401);
  const u = urlDe(request);
  if (!u) return json({ ok: false, error: "url" }, 400);
  const f = fetchImpl || fetch;
  try {
    const up = await seguir(f, u, { method, headers: cabecerasUpstream(request) });
    if (up.status >= 400 && up.headers.get("content-type") && /json/i.test(up.headers.get("content-type") || "")) {
      return json({ ok: false, error: "upstream " + up.status }, up.status === 404 ? 404 : 502);
    }
    if (up.headers.get("content-type") && /text\/html/i.test(up.headers.get("content-type") || "") && up.status >= 400) {
      return json({ ok: false, error: "upstream " + up.status }, 502);
    }
    const headers = cabecerasSalida(up.headers);
    const body = method === "HEAD" ? null : up.body;
    return new Response(body, { status: up.status, headers });
  } catch (e) {
    const name = e && e.name ? e.name : "error";
    return json({ ok: false, error: "audio no disponible (" + name + ")" }, 502);
  }
}

export async function onRequestGet(ctx) {
  return proxy(ctx, "GET");
}

export async function onRequestHead(ctx) {
  return proxy(ctx, "HEAD");
}
