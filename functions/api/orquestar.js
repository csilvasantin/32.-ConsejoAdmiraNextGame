/**
 * /api/orquestar — «¿a quién va esta tarea?» (GrokBotBox, 09-10-2026). Público, solo lectura, sin secretos.
 *
 * GET ?tipo=codigo|web|investigacion|consejo|creativo|demo|estrategia…&texto=<libre>[&equipo=admiranext|admiralive][&de=<persona>]
 *   → { ok, tipo, tipoInferido, equipo, candidatos:[…], excluidos, elegido:{persona, motivo}, fuentes, generado }
 *
 * Equipos (regla de Carlos, 10-10-2026): con ?equipo= (o inferido de quien pide: ?de= / ?persona= / ?solicitante=)
 * SOLO entran los miembros de ese equipo con una cuenta de ese equipo: nunca se cruzan cuentas. Sin equipo ni
 * solicitante con equipo, el reparto es global (como antes) y la respuesta lo avisa.
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
import { conCarlosDePulso } from "../../consumos-pulso-lib.mjs";
import { leerPulsos } from "./consumos/pulso.js";
import { equipo as buscaEquipo, equipoDePersona, personasDeEquipo, nombre } from "../../equipos-lib.mjs";
import { PERSONAS } from "../../orquestar-config.mjs";

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
  const pideEq = (url.searchParams.get("equipo") || "").slice(0, 40).trim();
  const quienPide = (url.searchParams.get("de") || url.searchParams.get("persona") || url.searchParams.get("solicitante") || "").slice(0, 40).trim();
  let eq = null, como = null;
  if (pideEq) {
    eq = buscaEquipo(pideEq);
    if (!eq) return new Response(JSON.stringify({ ok: false, error: "equipo desconocido: usa admiranext o admiralive" }), { status: 400, headers: cabeceras });
    como = "pedido (?equipo=" + pideEq + ")";
    const suyo = quienPide ? equipoDePersona(quienPide) : null;
    if (suyo && suyo.id !== eq.id) return new Response(JSON.stringify({ ok: false, error: quienPide + " es del " + suyo.nombre + " (" + suyo.cuenta + "): no puede repartir en el " + eq.nombre + " — nunca se cruzan cuentas" }), { status: 400, headers: cabeceras });
  } else if (quienPide) {
    eq = equipoDePersona(quienPide);
    como = eq ? "inferido de quien pide (" + quienPide + ")" : null;
  }
  const personas = eq ? personasDeEquipo(eq) : PERSONAS;
  const ahora = Date.now();
  const [lecturas, pres, band, docs] = await Promise.all([leerLecturas(env), leerJson(PRESENCIA, f), leerJson(BANDEJA, f), leerPulsos(kv(env)).catch(() => [])]);
  const conCarlos = conCarlosDePulso(docs, ahora);
  const cuentas = lecturas ? resumirCuentas(lecturas, null, { ahora }).map(({ id, nombre, cuenta, margen, semaforo, agotaAntes, proyeccion }) => ({ id, nombre, cuenta, margen, semaforo, agotaAntes, proyeccion: proyeccion && proyeccion.texto ? { texto: proyeccion.texto } : null })) : [];
  const presencia = pres && Array.isArray(pres.presence) ? pres.presence : [];
  const bandeja = band && Array.isArray(band.items) ? band.items : [];
  const r = orquestar({ tipo, cuentas, presencia, bandeja, ahora, personas, conCarlos: conCarlos.map((x) => x.agente) });
  const equipo = eq ? {
    id: eq.id, nombre: eq.nombre, cuenta: eq.cuenta, como, miembros: personas.map((p) => nombre(p.persona)),
    fuera: PERSONAS.filter((p) => !personas.includes(p)).map((p) => nombre(p.persona)),
    motivo: "Solo " + eq.nombre + " (" + eq.cuenta + "): " + personas.map((p) => nombre(p.persona)).join(", ") + ". Nunca se cruzan cuentas.",
  } : { id: null, motivo: "Sin equipo: reparto global entre todas las cuentas. Pasa ?equipo=admiranext|admiralive (o ?de=<persona>) para no cruzar cuentas." };
  if (r.elegido && eq) r.elegido.motivo += " · " + eq.nombre + " (" + eq.cuenta + ")";
  return new Response(JSON.stringify({
    ok: true, tipo: r.tipo, tipoInferido: inferido, texto: texto || null, equipo,
    elegido: r.elegido, candidatos: r.candidatos, excluidos: r.excluidos, conCarlos,
    regla: "aptitud (≥0,4) → libre (flota: latido <" + LATIDO_VIVO_S / 60 + " min y sin encargo ack/in_progress; consejeros GrokBot: se despiertan al recibir encargo, solo cuenta el encargo en curso) → más margen de uso; sin lectura de margen penaliza; quien está con Carlos queda excluido («ocupado con Carlos») salvo que no haya nadie más apto",
    fuentes: {
      margen: lecturas ? "consumos-lecturas (" + lecturas.length + " lecturas)" : "sin KV",
      presencia: pres ? "bot.yokup.com/api/presence (" + presencia.length + " filas)" : "no responde",
      conCarlos: "pulso de cada Mac (/api/flota/con-carlos, " + conCarlos.length + " ahora)",
      encargos: band ? "bot.yokup.com/api/public/inbox (" + bandeja.length + " últimos)" : "no responde",
    },
    generado: new Date(ahora).toISOString(),
  }, null, 1), { status: 200, headers: cabeceras });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cabeceras, "access-control-allow-methods": "GET, OPTIONS" } });
}
