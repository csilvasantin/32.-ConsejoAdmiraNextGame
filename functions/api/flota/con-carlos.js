/**
 * /api/flota/con-carlos — ¿con qué agentes está trabajando Carlos ahora mismo? (GrokBotBox, 09-10-2026, r20).
 * Regla de Carlos: si trabaja directamente con un agente, nadie (orquestador, otros agentes, formularios) le
 * inyecta encargos. Lo detecta el colector de cada Mac (~/.fleet/pulso-tokens.py, cada 60 s) y llega en el pulso.
 * GET → { ok, conCarlos:[{agente, maquina, desde}], generado } — público: solo nombres y desde, sin contenido.
 */
import { conCarlosDePulso } from "../../../consumos-pulso-lib.mjs";
import { leerPulsos } from "../consumos/pulso.js";

const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export async function onRequestGet({ env }) {
  const ahora = Date.now();
  const docs = await leerPulsos(kv(env)).catch(() => []);
  return new Response(JSON.stringify({ ok: true, conCarlos: conCarlosDePulso(docs, ahora), maquinas: docs.map((d) => d.maquina), generado: new Date(ahora).toISOString() }), { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, OPTIONS" } });
}
