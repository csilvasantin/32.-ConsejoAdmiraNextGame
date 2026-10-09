/**
 * /api/orquestar — «¿a quién va esta tarea?» (GrokBotBox, 09-10-2026). Público, solo lectura, sin secretos.
 *
 * GET ?tipo=codigo|web|investigacion|consejo|creativo|demo|estrategia…&texto=<libre>
 *   → { ok, tipo, tipoInferido, candidatos:[…], excluidos, elegido:{persona, motivo}, fuentes, generado }
 *
 * Datos (los mismos que ya usa la web, nada tecleado):
 *  - margen: consumos-lecturas-lib (resumirCuentas, la base de GET /api/consumos/lecturas) sobre la KV
 *    CONSUMOS_KV | RECORTE_KV, clave consumos:lecturas:v1.
 *  - presencia/latido: bot.yokup.com/api/presence (la de agentes_vivos y mcp.admira.live/consejo/estado).
 *  - encargos en curso: bot.yokup.com/api/public/inbox (la bandeja pública de encargos_listar).
 */
import { resumirCuentas } from "../../consumos-lecturas-lib.mjs";
import { KEY as KEY_LECTURAS } from "./consumos/lecturas.js";
import { inferirTipo, orquestar, LATIDO_VIVO_S } from "../../orquestar-lib.mjs";

export const PRESENCIA = "https://bot.yokup.com/api/presence";
export const BANDEJA = "https://bot.yokup.com/api/public/inbox";

const cabeceras = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leerJson(url, fetchImpl) {
  try {
    const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function leerLecturas(env) {
  if (!kv(env)) return null;
  try { const d = JSON.parse((await kv(env).get(KEY_LECTURAS)) || "null"); return d && Array.isArray(d.lecturas) ? d.lecturas : []; } catch (e) { return []; }
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  const url = new URL(request.url);
  const texto = (url.searchParams.get("texto") || url.searchParams.get("text") || "").slice(0, 500);
  const { tipo, inferido } = inferirTipo((url.searchParams.get("tipo") || url.searchParams.get("type") || "").slice(0, 40), texto);
  const ahora = Date.now();
  const [lecturas, pres, band] = await Promise.all([leerLecturas(env), leerJson(PRESENCIA, f), leerJson(BANDEJA, f)]);
  const cuentas = lecturas ? resumirCuentas(lecturas, null, { ahora }).map(({ id, nombre, cuenta, margen, semaforo }) => ({ id, nombre, cuenta, margen, semaforo })) : [];
  const presencia = pres && Array.isArray(pres.presence) ? pres.presence : [];
  const bandeja = band && Array.isArray(band.items) ? band.items : [];
  const r = orquestar({ tipo, cuentas, presencia, bandeja, ahora });
  return new Response(JSON.stringify({
    ok: true, tipo: r.tipo, tipoInferido: inferido, texto: texto || null,
    elegido: r.elegido, candidatos: r.candidatos, excluidos: r.excluidos,
    regla: "aptitud (≥0,4) → libre (flota: latido <" + LATIDO_VIVO_S / 60 + " min y sin encargo ack/in_progress; consejeros GrokBot: se despiertan al recibir encargo, solo cuenta el encargo en curso) → más margen de uso; sin lectura de margen penaliza",
    fuentes: {
      margen: lecturas ? "consumos-lecturas (" + lecturas.length + " lecturas)" : "sin KV",
      presencia: pres ? "bot.yokup.com/api/presence (" + presencia.length + " filas)" : "no responde",
      encargos: band ? "bot.yokup.com/api/public/inbox (" + bandeja.length + " últimos)" : "no responde",
    },
    generado: new Date(ahora).toISOString(),
  }, null, 1), { status: 200, headers: cabeceras });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cabeceras, "access-control-allow-methods": "GET, OPTIONS" } });
}
