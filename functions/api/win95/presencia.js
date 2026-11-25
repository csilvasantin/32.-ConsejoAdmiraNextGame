/**
 * GET /api/win95/presencia — quién del Consejo está en línea para el ICQGram de admira.live/win95.
 * Solo lectura y sin secretos. Junta fuentes ya públicas: el latido de los consejeros
 * (mcp.admira.live/consejeros/latido), su bandeja pública de bot.yokup.com (solo estado y
 * horas de cada encargo) y su hilo compartido (hora de su última respuesta y código del
 * último despertar de webhook). El % de cupo Grok Bot de cada cuenta sale de las
 * lecturas ya publicadas en /api/consumos/lecturas (KV); si no hay dato vigente,
 * pct queda null. Devuelve solo booleanos, horas, códigos y ese %; ningún texto.
 * Regla en win95-presencia-lib.mjs.
 */
import { presencia, CONSEJEROS, cupoDesdeLecturas } from "../../../win95-presencia-lib.mjs";
import { kv, cargarHilo } from "../../../chat-hilo-http.mjs";
import { KEY as LECTURAS_KEY } from "../consumos/lecturas.js";

const LATIDO = "https://mcp.admira.live/consejeros/latido";
const BANDEJA = "https://bot.yokup.com/api/public/inbox";
const CAB = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=15",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const leer = (f, url) => f(url, { headers: { accept: "application/json", "user-agent": "admira.live-win95" }, signal: AbortSignal.timeout(8000) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);
const sinTexto = (it) => ({ id: it && it.id, status: it && it.status, ts: it && it.ts, done_at: it && it.done_at });

async function lecturasDe(env) {
  const store = env && (env.CONSUMOS_KV || env.RECORTE_KV);
  if (!store || typeof store.get !== "function") return [];
  try {
    const raw = await store.get(LECTURAS_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && Array.isArray(d.lecturas) ? d.lecturas : [];
  } catch (e) { return []; }
}

export async function construir({ env, fetchImpl, ahoraMs, lecturas } = {}) {
  const f = fetchImpl || fetch;
  const hilos = {}, bandejas = {};
  const ahora = ahoraMs || Date.now();
  const [latido, docs] = await Promise.all([
    leer(f, LATIDO),
    lecturas ? Promise.resolve(lecturas) : lecturasDe(env),
    ...CONSEJEROS.map((c) => leer(f, BANDEJA + "?persona=" + encodeURIComponent(c.latido))
      .then((d) => { bandejas[c.persona] = d && Array.isArray(d.items) ? d.items.map(sinTexto) : null; })),
    ...(kv(env) ? CONSEJEROS.filter((c) => c.chat).map((c) => cargarHilo(env, c.persona)
      .then((d) => { hilos[c.persona] = d.turnos; }).catch(() => { hilos[c.persona] = null; })) : []),
  ]);
  return presencia({ latido: latido && latido.ok ? latido : null, hilos, bandejas, ahoraMs: ahora, cupo: cupoDesdeLecturas(docs, ahora) });
}

export async function onRequestGet({ env }) {
  const cuerpo = await construir({ env });
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: CAB });
}
