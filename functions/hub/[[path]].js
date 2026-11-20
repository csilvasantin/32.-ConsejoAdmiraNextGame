// /hub/* → Mac Mini (Funnel) con la cabecera de la guardia. Solo llega aquí quien
// ya pasó la puerta (_middleware.js): /hub no está en la lista pública.
import { MINI, conHub } from "../_hub.js";

const MONTAJES = new Set(["api", "demo", "council", "proofs", "pixtube"]);
const PASAN = ["content-type", "accept", "authorization", "x-council-token", "x-council-hack-token",
  "x-council-machine", "x-machine-id", "range", "if-none-match", "if-modified-since", "last-event-id"];

export async function onRequest({ request, env, params }) {
  if (!env.HUB_GUARDIA) return new Response("hub sin configurar", { status: 503, headers: { "cache-control": "no-store" } });
  const partes = [].concat(params.path || []);
  if (!partes.length || !MONTAJES.has(partes[0])) return new Response("not found", { status: 404 });
  const url = new URL(request.url);
  const destino = MINI + "/" + partes.map(encodeURIComponent).join("/") + (url.pathname.endsWith("/") ? "/" : "") + url.search;
  const h = {};
  for (const k of PASAN) { const v = request.headers.get(k); if (v) h[k] = v; }
  const init = { method: request.method, headers: conHub(env, h), redirect: "manual" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
  let r;
  try { r = await fetch(destino, init); }
  catch (e) { return new Response(JSON.stringify({ error: "mac mini sin respuesta" }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
  const out = new Headers(r.headers);
  for (const k of ["set-cookie", "access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-headers", "access-control-allow-methods"]) out.delete(k);
  out.set("cache-control", "private, no-store");
  const loc = out.get("location");
  if (loc && loc.startsWith(MINI + "/")) out.set("location", "/hub" + loc.slice(MINI.length));
  return new Response(r.body, { status: r.status, headers: out });
}
