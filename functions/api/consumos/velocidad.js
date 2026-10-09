/**
 * /api/consumos/velocidad — velocímetro de tokens/hora de la flota (GrokBotBox, 09-10-2026).
 *
 * GET → { ok, tokHora, ventanaMin, metodo:'ultima-hora'|'media-hoy', etiqueta, porAgente:[{agente,tokHora,tokHoy}],
 *         pico24h, escalaMax, tokHoy, fuente, instantaneas, generado }
 * Fuente REAL: api.yokup.com/fleet/consumo?dias=1 (partes de consumo que cada agente declara, con su serie
 * de muestras ~5 min). En cada GET se guarda, como mucho cada 5 min, una instantánea de los totales del día en
 * KV (RECORTE_KV, clave consumos:vel:snaps:v1, ~26 h). La velocidad sale de las instantáneas de Yokup + las propias.
 * Si Yokup no responde: { ok:false, sinDatos:true } — nunca números inventados.
 */
import { calcularVelocidad, partesDeHoy, serieAInstantaneas, unir, podar, tocaGuardar } from "../../../consumos-velocidad-lib.mjs";

export const FUENTE = "https://api.yokup.com/fleet/consumo?dias=1";
export const KEY = "consumos:vel:snaps:v1";
const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);

function json(obj, status, origin) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin" };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(obj), { status, headers: h });
}
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leerYokup(fetchImpl) {
  try {
    const r = await fetchImpl(FUENTE, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.ok !== false && Array.isArray(d.partes) ? d : null;
  } catch (e) { return null; }
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const ahora = Date.now();
  const d = await leerYokup(fetchImpl || fetch);
  if (!d) return json({ ok: false, sinDatos: true, tokHora: null, metodo: null, porAgente: [], pico24h: null, fuente: FUENTE, error: "la fuente de partes de Yokup no responde", generado: new Date(ahora).toISOString() }, 200, origin);
  const { hoy, nombres } = partesDeHoy(d, ahora);
  const deYokup = serieAInstantaneas(d.serie, (k) => nombres[k] || k.split("|")[0]);
  let propias = [];
  const store = kv(env);
  if (store) {
    try { const raw = await store.get(KEY); const p = raw ? JSON.parse(raw) : null; if (Array.isArray(p)) propias = p; } catch (e) {}
    if (Object.keys(hoy).length && tocaGuardar(propias, ahora)) {
      propias = podar([...propias, { ts: ahora, totales: hoy }], ahora);
      try { await store.put(KEY, JSON.stringify(propias)); } catch (e) {}
    }
  }
  const r = calcularVelocidad({ snaps: unir(deYokup, propias, ahora), hoy, ahora });
  return json({ ok: true, ...r, fuente: FUENTE, instantaneasKV: propias.length, instantaneasYokup: deYokup.length, almacen: store ? "kv" : "ninguno" }, 200, origin);
}
