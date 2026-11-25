/**
 * GET /api/win95/presencia — quién del Consejo está en línea para el ICQGram de admira.live/win95.
 * Solo lectura y sin secretos: junta el latido PÚBLICO de los consejeros
 * (mcp.admira.live/consejeros/latido) con la hora de su última respuesta en el hilo
 * compartido (la misma que ya da, pública, /api/chat/salud). Devuelve solo booleanos y
 * horas; ningún texto de mensaje ni de misión. Regla en win95-presencia-lib.mjs.
 */
import { presencia, CONSEJEROS } from "../../../win95-presencia-lib.mjs";
import { kv, cargarHilo } from "../../../chat-hilo-http.mjs";

const LATIDO = "https://mcp.admira.live/consejeros/latido";
const CAB = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=15",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

export async function construir({ env, fetchImpl, ahoraMs } = {}) {
  const f = fetchImpl || fetch;
  const latido = await f(LATIDO, { headers: { accept: "application/json", "user-agent": "admira.live-win95" }, signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const hilos = {};
  if (kv(env)) {
    await Promise.all(CONSEJEROS.map((c) => cargarHilo(env, c.persona)
      .then((d) => { hilos[c.persona] = d.turnos; }).catch(() => { hilos[c.persona] = null; })));
  }
  return presencia({ latido: latido && latido.ok ? latido : null, hilos, ahoraMs: ahoraMs || Date.now() });
}

export async function onRequestGet({ env }) {
  const cuerpo = await construir({ env });
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: CAB });
}
