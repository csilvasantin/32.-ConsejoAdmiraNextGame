/**
 * POST /api/wallpaper/mode — proxy de mismo origen al demo-server del Mini.
 *
 * El overlay Consejeros llamaba a macmini.tail48b61c.ts.net desde el Chrome
 * de Control: en el navegador esa URL falla (Funnel/ts.net no es fiable
 * para el cliente) y las 4 sillas salían «retrato BN · silla no alcanzada»
 * aunque el Mini sí las aplicaba. El navegador solo habla con admira.live;
 * el edge de Cloudflare (Funnel ON) llega al demo-server.
 */
const UPSTREAM = "https://macmini.tail48b61c.ts.net/demo/wallpaper/mode";
const ALLOW = new Set(["https://www.admira.live", "https://admira.live"]);

function corsHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept",
    "access-control-max-age": "600",
    vary: "Origin",
  };
  if (origin && ALLOW.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
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

export async function onRequestPost({ request }) {
  const origin = request.headers.get("Origin") || "";
  let body = "{}";
  try {
    body = await request.text();
  } catch {
    return json({ ok: false, error: "no se pudo leer la petición" }, 400, origin);
  }
  if (body.length > 16 * 1024) {
    return json({ ok: false, error: "petición demasiado grande" }, 413, origin);
  }
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body || '{"mode":"consejeros","only_ids":[]}',
      signal: AbortSignal.timeout(55000),
    });
    const texto = await r.text();
    return new Response(texto, {
      status: r.status,
      headers: Object.assign(
        {
          "content-type": r.headers.get("content-type") || "application/json; charset=utf-8",
        },
        corsHeaders(origin),
      ),
    });
  } catch (e) {
    const name = e && e.name ? e.name : "error";
    return json({ ok: false, error: "demo-server no contesta (" + name + ")", machines: [] }, 502, origin);
  }
}

export function onRequestGet() {
  return json({ ok: false, error: "usa POST", que_es: "proxy wallpaper/mode → demo-server Mini" }, 405, "");
}
