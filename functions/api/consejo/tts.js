/**
 * /api/consejo/tts — voces Grok (xAI TTS) de los consejeros.
 * POST { persona, text, lang? } o GET ?persona=&text=
 * Devuelve audio/mpeg. Cacha por voz+texto. La clave XAI_API_KEY es un secreto
 * de Pages; nunca se envía al cliente. Si falta o falla, 503 y el cliente
 * cae a la síntesis del navegador sin bloquear la escena.
 */
import { resolver, limpiarTexto, TTS_URL, TTS_LANG } from "../../../consejeros-voces-grok.mjs";

const METODOS = "GET, POST, OPTIONS";

function cors(origin) {
  const o = origin || "*";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": METODOS,
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(origin) },
  });
}

async function hashKey(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function leerPedido(request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return {
      persona: url.searchParams.get("persona") || url.searchParams.get("quien") || "",
      text: url.searchParams.get("text") || url.searchParams.get("texto") || "",
      lang: url.searchParams.get("lang") || TTS_LANG,
    };
  }
  const body = await request.json();
  return {
    persona: (body && (body.persona || body.quien)) || "",
    text: (body && (body.text || body.texto)) || "",
    lang: (body && body.lang) || TTS_LANG,
  };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request.headers.get("Origin") || "*") });
}

export async function onRequestGet(ctx) {
  return sintetizar(ctx);
}

export async function onRequestPost(ctx) {
  return sintetizar(ctx);
}

export async function sintetizar({ request, env, waitUntil }) {
  const origin = request.headers.get("Origin") || "*";
  let pedido;
  try {
    pedido = await leerPedido(request);
  } catch (e) {
    return json({ ok: false, error: "JSON inválido" }, 400, origin);
  }
  const voz = resolver(pedido.persona);
  const texto = limpiarTexto(pedido.text);
  if (!voz) return json({ ok: false, error: "persona desconocida" }, 400, origin);
  if (!texto) return json({ ok: false, error: "texto vacío" }, 400, origin);
  const key = env && env.XAI_API_KEY;
  if (!key) return json({ ok: false, error: "tts no configurado" }, 503, origin);

  // xAI TTS acepta «en» (no «en-US»): normalizamos para que la voz salga en inglés de verdad (Carlos 19-11, t112u).
  let lang = String(pedido.lang || TTS_LANG).trim() || TTS_LANG;
  if (/^en([-_]|$)/i.test(lang)) lang = "en";
  const firma = await hashKey([voz.voice_id, voz.speed, lang, texto].join("|"));
  const cacheUrl = new Request("https://tts.admira.live/grok/v1/" + firma);
  try {
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache) {
      const hit = await cache.match(cacheUrl);
      if (hit) return withCors(hit, origin, true);
    }
  } catch (e) {}

  const r = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: texto,
      voice_id: voz.voice_id,
      language: lang,
      speed: voz.speed,
      text_normalization: true,
    }),
    signal: AbortSignal.timeout(20000),
  }).catch((e) => e);

  if (!r || r instanceof Error || !r.ok) {
    const status = r && !(r instanceof Error) ? r.status : 502;
    return json({ ok: false, error: "tts no disponible" }, status >= 400 && status < 600 ? status : 502, origin);
  }

  const buf = await r.arrayBuffer();
  if (!buf || buf.byteLength < 200) {
    return json({ ok: false, error: "audio vacío" }, 502, origin);
  }
  const ctype = (r.headers.get("content-type") || "").includes("audio")
    ? r.headers.get("content-type")
    : "audio/mpeg";
  const resp = new Response(buf, {
    status: 200,
    headers: {
      "content-type": ctype,
      "cache-control": "public, max-age=86400",
      "x-admira-voice": voz.voice_id,
      "x-admira-persona": voz.slug,
      ...cors(origin),
    },
  });
  try {
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache && waitUntil) waitUntil(cache.put(cacheUrl, resp.clone()));
    else if (cache) await cache.put(cacheUrl, resp.clone());
  } catch (e) {}
  return resp;
}

function withCors(resp, origin, cached) {
  const h = new Headers(resp.headers);
  Object.entries(cors(origin)).forEach(([k, v]) => h.set(k, v));
  if (cached) h.set("x-admira-tts-cache", "hit");
  return new Response(resp.body, { status: resp.status, headers: h });
}
