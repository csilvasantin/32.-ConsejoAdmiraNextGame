/**
 * /api/yokup-bot/* — proxy de solo lectura hacia bot.yokup.com.
 *
 * La vista previa de Pages (*.pages.dev) no está en el CORS del bot, que solo
 * admite https://www.admira.live. El highscore pide presencia y tiempos por
 * este mismo origen. No es un proxy abierto: GET/HEAD y tres prefijos.
 */
const ORIGEN = "https://bot.yokup.com";

export function rutaPermitida(resto) {
  const p = String(resto || "").replace(/^\/+/, "").split("?")[0];
  if (!p || p.includes("..") || p.includes("\\") || p.includes("//")) return false;
  if (p === "api/presence" || p.startsWith("api/presence/")) return true;
  if (p === "api/bot-inbox/tiempos") return true;
  if (p.startsWith("api/public/")) return true;
  return false;
}

function restoDe(context) {
  const partes = context.params && context.params.path;
  if (Array.isArray(partes)) return partes.map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } }).join("/");
  if (typeof partes === "string" && partes) {
    try { return decodeURIComponent(partes); } catch (e) { return partes; }
  }
  const url = new URL(context.request.url);
  return url.pathname.replace(/^\/api\/yokup-bot\/?/, "");
}

const cabecera = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "Accept, Content-Type",
        "cache-control": "no-store",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers: cabecera });
  }
  const resto = restoDe(context);
  if (!rutaPermitida(resto)) {
    return new Response(JSON.stringify({ ok: false, error: "ruta no permitida" }), { status: 404, headers: cabecera });
  }
  const url = new URL(request.url);
  const destino = ORIGEN + "/" + resto.replace(/^\/+/, "") + url.search;
  const r = await fetch(destino, {
    method: request.method,
    headers: { accept: request.headers.get("accept") || "application/json", "user-agent": "admira-live-highscore-proxy" },
    redirect: "manual",
  });
  const headers = new Headers();
  const tipo = r.headers.get("content-type");
  if (tipo) headers.set("content-type", tipo);
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers });
}
