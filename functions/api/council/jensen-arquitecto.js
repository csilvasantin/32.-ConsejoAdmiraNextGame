/**
 * /api/council/jensen-arquitecto — mismo origen para Preguntar a Jensen.
 * El Chrome del tailnet no llega a macmini.tail48b61c.ts.net (red privada).
 * El navegador solo habla con admira.live; este edge reenvía al Mini.
 */
const UPSTREAM = "https://macmini.tail48b61c.ts.net/api/council/jensen-arquitecto";
const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);

function corsHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, X-Council-Token",
    "access-control-max-age": "600",
    vary: "Origin",
  };
  if (!origin || ALLOW.has(origin)) headers["access-control-allow-origin"] = origin || "*";
  return headers;
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, corsHeaders(origin)),
  });
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin") || "") });
}

async function relay(request, upstream) {
  const origin = request.headers.get("Origin") || "";
  const headers = { accept: "application/json" };
  const token = request.headers.get("X-Council-Token");
  if (token) headers["x-council-token"] = token;
  let body;
  if (request.method === "POST") {
    body = await request.text();
    if (body.length > 8000) return json({ ok: false, error: "pregunta demasiado larga" }, 413, origin);
    headers["content-type"] = "application/json";
  }
  try {
    const r = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "POST" ? (body || "{}") : undefined,
      signal: AbortSignal.timeout(25000),
    });
    let texto = await r.text();
    // FLT-100878: Jensen = ArquitectoCursorCloud (Cursor), no Arquitecto Silicio/Ive.
    try {
      const j = JSON.parse(texto);
      if (j && j.ok) {
        const a = String(j.agent || "");
        if (!a || /^arquitecto$/i.test(a) || /^morfeo$/i.test(a)) j.agent = "ArquitectoCursorCloud";
        texto = JSON.stringify(j);
      }
    } catch (_) {}
    return new Response(texto, {
      status: r.status,
      headers: Object.assign({ "content-type": r.headers.get("content-type") || "application/json; charset=utf-8" }, corsHeaders(origin)),
    });
  } catch (e) {
    return json({ ok: false, error: "el Mini no contestó" }, 502, origin);
  }
}

export function onRequestPost({ request }) {
  return relay(request, UPSTREAM);
}

export function onRequestGet() {
  return json({ ok: false, error: "la lectura es /api/council/jensen-arquitecto/<agente>" }, 405, "");
}
