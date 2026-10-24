/**
 * /api/council/frameable?url=https://… — ¿se deja meter en un iframe? (Examinar → Mac 1984, 24-10-2026)
 * Sigue redirecciones y mira X-Frame-Options y CSP frame-ancestors. Solo dominios de la casa.
 * → { ok, url, frameable, motivo }
 */
const HOSTS = /(^|\.)(admira\.(live|tv|studio|store|app|biz)|admiranext\.com|yokup\.com|pixeria\.es)$/i;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" } });

export function veredicto(headers, selfOrigin) {
  const xfo = String(headers.get("x-frame-options") || "").toLowerCase();
  if (xfo.includes("deny")) return { frameable: false, motivo: "X-Frame-Options: DENY" };
  if (xfo.includes("sameorigin")) return { frameable: false, motivo: "X-Frame-Options: SAMEORIGIN" };
  const csp = String(headers.get("content-security-policy") || "");
  const m = csp.match(/frame-ancestors([^;]*)/i);
  if (m) {
    const v = m[1].trim();
    if (/'none'/.test(v)) return { frameable: false, motivo: "frame-ancestors 'none'" };
    if (!/\*|admira\.live/.test(v) && !(selfOrigin && v.includes(selfOrigin))) return { frameable: false, motivo: "frame-ancestors " + v.slice(0, 80) };
  }
  return { frameable: true, motivo: null };
}

export async function onRequestGet({ request }) {
  const u = new URL(request.url).searchParams.get("url") || "";
  let target;
  try { target = new URL(u); } catch (e) { return json({ ok: false, error: "url inválida" }, 400); }
  if (target.protocol !== "https:" || !HOSTS.test(target.hostname)) return json({ ok: false, error: "dominio no permitido" }, 400);
  try {
    const r = await fetch(target.toString(), { redirect: "follow", headers: { "user-agent": "admira.live-frameable/1" } });
    if (r.status >= 400) return json({ ok: true, url: target.toString(), frameable: false, motivo: "HTTP " + r.status });
    return json({ ok: true, url: target.toString(), ...veredicto(r.headers, new URL(request.url).origin) });
  } catch (e) {
    return json({ ok: true, url: target.toString(), frameable: false, motivo: "sin red" });
  }
}
