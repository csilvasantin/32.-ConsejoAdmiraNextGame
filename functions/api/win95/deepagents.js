/**
 * GET /api/win95/deepagents — cuántos DeepAgents están abiertos en app de escritorio,
 * y en qué máquinas, para el ICQGram de admira.live/win95.
 * Solo lectura y sin secretos (ni IPs, correos, tokens ni foco). Junta dos fuentes ya
 * usadas en /consumos: el pulso de cada Mac (superficies tipo app) y los process_snapshot
 * verificados de bot.yokup.com/api/presence con host «app». Regla en win95-deepagents-lib.mjs.
 */
import { leerPulsos } from "../consumos/pulso.js";
import { superficiesDePulso, STALE_MS } from "../../../consumos-pulso-lib.mjs";
import { censoDesktop } from "../../../win95-deepagents-lib.mjs";

const PRESENCIA = "https://bot.yokup.com/api/presence";
const CAB = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=15",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leerPresencia(fetchImpl) {
  try {
    const r = await fetchImpl(PRESENCIA, {
      headers: { accept: "application/json", "user-agent": "admira.live-win95" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { ok: false, presence: [] };
    const d = await r.json();
    return { ok: !!(d && Array.isArray(d.presence)), presence: d && Array.isArray(d.presence) ? d.presence : [] };
  } catch (e) {
    return { ok: false, presence: [] };
  }
}

function aMs(t) {
  if (t == null || t === "") return 0;
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(t);
  return Number.isFinite(p) ? p : 0;
}
function pulsoHace(docs, ahora) {
  const ts = (docs || []).map((d) => aMs(d && ((d.superficies && d.superficies.ts) || d.ts || d.ultimoPulso))).filter(Boolean);
  if (!ts.length) return null;
  const last = Math.max(...ts);
  const hace = Math.max(0, Math.round((ahora - last) / 1000));
  return last && ahora - last < STALE_MS ? hace : null;
}

export async function construir({ env, fetchImpl, ahoraMs, pulsos, presencia } = {}) {
  const ahora = ahoraMs || Date.now();
  const f = fetchImpl || fetch;
  const docs = pulsos !== undefined ? pulsos : await leerPulsos(kv(env));
  const pres = presencia !== undefined
    ? { ok: Array.isArray(presencia), presence: Array.isArray(presencia) ? presencia : [] }
    : await leerPresencia(f);
  const superficies = superficiesDePulso(docs || [], ahora);
  const pulsoHaceS = pulsoHace(docs || [], ahora);
  const pulsoOk = Array.isArray(docs) && docs.length > 0;
  return censoDesktop({
    superficies,
    presence: pres.presence,
    ahoraMs: ahora,
    pulsoOk,
    presenciaOk: pres.ok,
    pulsoHaceS,
  });
}

export async function onRequestGet({ env }) {
  const cuerpo = await construir({ env });
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: CAB });
}
