/** GET /api/council/jensen-arquitecto/:id — estado del Cloud Agent, mismo origen. */
const UPSTREAM = "https://macmini.tail48b61c.ts.net/api/council/jensen-arquitecto";

function corsHeaders(origin) {
  return {
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "*",
    vary: "Origin",
  };
}

export async function onRequestGet({ request, params }) {
  const id = String(params.id || "");
  const origin = request.headers.get("Origin") || "";
  if (!/^bc-[0-9a-f-]{8,80}$/i.test(id)) {
    return new Response(JSON.stringify({ ok: false, error: "agente inválido" }), {
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
