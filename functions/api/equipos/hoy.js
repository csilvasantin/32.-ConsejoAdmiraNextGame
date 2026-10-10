/**
 * /api/equipos/hoy — quién lleva hoy cada equipo (GrokBotBox, 10-10-2026 · regla de Carlos).
 * GET → { ok, fecha, fijado, carlos, equipos:{…} }  (público)
 * POST { carlos: "admiranext"|"admiralive", fecha?: "AAAA-MM-DD" (hoy, Madrid, por defecto; ±7 días), autor, nota? }
 *      con X-Council-Token (o Authorization: Bearer) = CONSUMOS_LECTURAS_TOKEN, igual que las demás escrituras de /consumos.
 *      El otro equipo va ese día con su orquestador.
 */
import { normalizarHoy, guardarDia, quienLlevaHoy } from "../../../equipos-lib.mjs";
import { autorizado } from "../consumos/lecturas.js";
import { PRESENCIA } from "../orquestar.js";
import { KEY_HOY, kv } from "./index.js";

const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cab });
const leeDoc = async (store) => { try { const r = store ? await store.get(KEY_HOY) : null; return r ? JSON.parse(r) : null; } catch (e) { return null; } };

async function presencia(f) {
  try { const r = await f(PRESENCIA, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) }); const d = r.ok ? await r.json() : null; return d && Array.isArray(d.presence) ? d.presence : []; } catch (e) { return []; }
}

export async function onRequestGet({ env, fetchImpl }) {
  const doc = await leeDoc(kv(env));
  return json({ ok: true, ...quienLlevaHoy({ doc, presencia: await presencia(fetchImpl || fetch) }) });
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const ok = autorizado(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta CONSUMOS_LECTURAS_TOKEN" }, 503);
  if (!ok) return json({ ok: false, error: "no autorizado: manda X-Council-Token" }, 401);
  const store = kv(env);
  if (!store) return json({ ok: false, error: "sin almacenamiento" }, 503);
  let body; try { body = JSON.parse((await request.text()) || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400); }
  const { dia, error } = normalizarHoy(body);
  if (error) return json({ ok: false, error }, 400);
  const doc = guardarDia(await leeDoc(store), dia);
  await store.put(KEY_HOY, JSON.stringify(doc));
  return json({ ok: true, guardado: dia, ...quienLlevaHoy({ doc, presencia: await presencia(fetchImpl || fetch) }) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization" } });
}
