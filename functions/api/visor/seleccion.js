/**
 * /api/visor/seleccion — qué 2 agentes abre «/interface 2 <selector>» (#5707 + #5729 · Morfeo · 11-10-2026).
 *   GET ?modelo=claude|codex|grok   → los 2 vivos de ese modelo con el latido más reciente
 *   GET ?a=Neo,Trinity              → esos dos, si están vivos
 * Lee la presencia real (bot.yokup.com/api/presence) desde el servidor: así funciona también en las previews
 * (*.pages.dev), que el CORS de la presencia no deja leer desde el navegador. Solo devuelve nombres y modelo, que
 * ya son públicos en la presencia; nada de terminales ni claves (eso sigue tras la llave del visor).
 * La regla del modelo vive en interface-seleccion.mjs.
 */
import { elegir, modeloCanonico, PRESENCIA_URL } from "../../../interface-seleccion.mjs";

const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const modelo = modeloCanonico(q.get("modelo"));
  const agentes = String(q.get("a") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (!modelo && !agentes.length) return json({ ok: false, error: "selector", mensaje: "?modelo=claude|codex|grok o ?a=Neo,Trinity" }, 400);
  let presencia = [], ahoraS = Date.now() / 1000;
  try {
    const r = await fetch(PRESENCIA_URL, { headers: { "user-agent": "admira.live/interface" }, cf: { cacheTtl: 0 } });
    const d = await r.json();
    presencia = Array.isArray(d && d.presence) ? d.presence : [];
    if (d && Number(d.now)) ahoraS = Number(d.now) > 4102444800 ? Number(d.now) / 1000 : Number(d.now);
  } catch (e) {
    return json({ ok: false, error: "presencia", mensaje: "La presencia (bot.yokup.com/api/presence) no responde" }, 502);
  }
  return json({ ...elegir(modelo ? { modelo } : { agentes }, presencia, ahoraS), fuente: "bot.yokup.com/api/presence (" + presencia.length + " filas)" });
}
