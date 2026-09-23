/** GET /api/council/elon-smith/:id — lee acuse y nota, mismo origen. */
const UPSTREAM = "https://macmini.tail48b61c.ts.net/api/council/elon-smith";

function corsHeaders(origin) {
  return {
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "*",
    vary: "Origin",
  };
}

export async function onRequestGet({ request, params }) {
  const id = String(params.id || "").replace(/[^\d]/g, "");
  const origin = request.headers.get("Origin") || "";
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: "encargo inválido" }), {
      status: 400,
      headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, corsHeaders(origin)),
    });
  }
  const headers = { accept: "application/json" };
  const token = request.headers.get("X-Council-Token");
  if (token) headers["x-council-token"] = token;
  try {
    const r = await fetch(`${UPSTREAM}/${id}`, { headers, signal: AbortSignal.timeout(20000) });
    const texto = await r.text();
    return new Response(texto, {
      status: r.status,
      headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, corsHeaders(origin)),
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "el Mini no contestó" }), {
      status: 502,
      headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, corsHeaders(origin)),
    });
  }
}
