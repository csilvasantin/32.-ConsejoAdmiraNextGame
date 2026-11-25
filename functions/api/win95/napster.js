/**
 * GET /api/win95/napster — catálogo y búsqueda de canciones de admira.studio
 * para el Napster de la Win95 Xperience. Lee el índice público de Stock
 * (stock.admira.store/stock/index.json), nunca tokens en el navegador.
 * Devuelve { total, results:[{ titulo, artista, hashtags, duracion, url, thumb }] }.
 * Orden: hashtag, luego título, luego artista. «#80» y «80» buscan primero el hashtag.
 * /api/* no pasa por la verja HTML, así que aquí se exige cookie de la puerta
 * o sesión de Google. 401 si no hay sesión. 502 si Stock no contesta (sin inventar canciones).
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { leerCatalogo, responder } from "../../../win95-napster-lib.mjs";

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: CABECERAS });
}

async function autorizado(request, env) {
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d) return true;
  return !!(await emailGoogle(request, env));
}

export async function onRequestGet({ request, env, fetch: fetchImpl }) {
  if (!(await autorizado(request, env))) return json({ ok: false, error: "sesion" }, 401);
  const url = new URL(request.url);
  const consulta = {
    q: url.searchParams.get("q") || "",
    artista: url.searchParams.get("artista") || "",
    titulo: url.searchParams.get("titulo") || "",
  };
  try {
    const cat = await leerCatalogo(fetchImpl || fetch);
    return json(responder(cat, consulta));
  } catch (e) {
    const msg = e && e.code === "upstream" && e.message
      ? e.message
      : "admira.studio no contesta (" + ((e && e.name) || "error") + ")";
    return json({ ok: false, error: msg }, 502);
  }
}
