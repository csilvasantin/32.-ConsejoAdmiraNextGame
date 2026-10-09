/**
 * /api/consumos/pulso — pulso de tokens en tiempo real de cada Mac (GrokBotBox, 09-10-2026).
 *
 * POST { maquina, agentes:[{agente, motor:'claude'|'codex', cuenta, tokHoy, cacheHoy, ultimoEvento}], ts }
 *      con X-Council-Token: <CONSUMOS_LECTURAS_TOKEN> (o Authorization: Bearer), igual que /api/consumos/lecturas.
 *      Lo envía ~/.fleet/pulso-tokens.py (LaunchAgent com.admiranext.pulso-tokens, cada 60 s).
 * GET  → { ok, maquinas:[…], agentes:[{agente, maquina, motor, tokHoy, tokHora, stale, haceS, …}] } (público, sin series).
 * KV: RECORTE_KV, una clave por máquina (consumos:pulso:v1:<maquina>) + índice consumos:pulso:v1:_maquinas.
 * Como mucho 1 escritura/min por máquina: un pulso que llega <50 s después del anterior no se guarda (202).
 */
import { autorizado } from "./lecturas.js";
import { normalizarPulso, aplicarPulso, agentesDePulso, KEY_PREFIX, KEY_INDICE } from "../../../consumos-pulso-lib.mjs";

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
function headers(origin) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization", vary: "Origin" };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: headers(origin) });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

/** Lee los documentos de todas las máquinas con pulso (índice + una lectura por máquina). */
export async function leerPulsos(store) {
  if (!store) return [];
  let maquinas = [];
  try { const raw = await store.get(KEY_INDICE); const p = raw ? JSON.parse(raw) : null; if (Array.isArray(p)) maquinas = p; } catch (e) {}
  const docs = await Promise.all(maquinas.slice(0, 20).map(async (m) => {
    try { const raw = await store.get(KEY_PREFIX + m); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }));
  return docs.filter(Boolean);
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const auth = autorizado(request, env);
  if (auth === null) return json({ ok: false, error: "escrituras cerradas: falta CONSUMOS_LECTURAS_TOKEN" }, 503, origin);
  if (!auth) return json({ ok: false, error: "no autorizado" }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacén KV" }, 503, origin);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "JSON inválido" }, 400, origin); }
  const n = normalizarPulso(body);
  if (!n.ok) return json(n, 400, origin);
  const ahora = Date.now();
  const clave = KEY_PREFIX + n.pulso.maquina;
  let doc = null;
  try { const raw = await store.get(clave); doc = raw ? JSON.parse(raw) : null; } catch (e) {}
  const nueva = !doc;
  const r = aplicarPulso(doc, n.pulso, ahora);
  if (!r.guardar) return json({ ok: true, guardado: false, motivo: "menos de 50 s desde el pulso anterior de esta máquina" }, 202, origin);
  await store.put(clave, JSON.stringify(r.doc));
  if (nueva) {
    try {
      const raw = await store.get(KEY_INDICE); const idx = raw ? JSON.parse(raw) : [];
      if (Array.isArray(idx) && !idx.includes(n.pulso.maquina)) await store.put(KEY_INDICE, JSON.stringify([...idx, n.pulso.maquina].slice(-20)));
    } catch (e) {}
  }
  const puntos = Object.fromEntries(Object.entries(r.doc.agentes).map(([a, x]) => [a, x.serie.length]));
  return json({ ok: true, guardado: true, maquina: n.pulso.maquina, puntos }, 200, origin);
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ahora = Date.now();
  const docs = await leerPulsos(kv(env));
  const agentes = agentesDePulso(docs, ahora).map(({ _serie, ...a }) => a);
  return json({ ok: true, maquinas: docs.map((d) => d.maquina), agentes, generado: new Date(ahora).toISOString() }, 200, origin);
}
