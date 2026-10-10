/**
 * /api/equipos — los dos equipos (uno por cuenta) y quién lleva hoy cada uno (GrokBotBox, 10-10-2026 · regla de Carlos).
 * GET → { ok, fecha, hoy:{fijado, carlos, equipos:{id:{lleva, esCarlos, orquestador, respaldoActivo, motivo}}},
 *         equipos:[{ id, nombre, cuenta, maquina, hoy, consejeros, agentes, tokens, lineas, tokPorLinea, presupuesto, encargos }],
 *         fuentes, generado }   (público, solo lectura, sin secretos)
 * Fijar quién lleva hoy: POST /api/equipos/hoy (X-Council-Token). Criterio en equipos-lib.mjs; equipos en equipos-config.mjs.
 */
import { EQUIPOS } from "../../../equipos-config.mjs";
import { quienLlevaHoy, tarjetaEquipo } from "../../../equipos-lib.mjs";
import { resumirCuentas } from "../../../consumos-lecturas-lib.mjs";
import { agentesDePulso } from "../../../consumos-pulso-lib.mjs";
import { lineasHoy } from "../../../consumos-lineas-lib.mjs";
import { KEY as KEY_LECTURAS } from "../consumos/lecturas.js";
import { leerPulsos } from "../consumos/pulso.js";
import { KEY_COMMITS } from "../consumos/lineas.js";
import { PRESENCIA, BANDEJA } from "../orquestar.js";

export const KEY_HOY = "equipos:hoy:v1";
const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
export const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
const leeJson = async (store, k) => { try { const r = store ? await store.get(k) : null; return r ? JSON.parse(r) : null; } catch (e) { return null; } };
async function leerUrl(url, f) {
  try { const r = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

export async function construir({ env, fetchImpl, ahora = Date.now() }) {
  const f = fetchImpl || fetch, store = kv(env);
  const [docHoy, lect, docs, commits, pres, band] = await Promise.all([leeJson(store, KEY_HOY), leeJson(store, KEY_LECTURAS), leerPulsos(store).catch(() => []),
    leeJson(store, KEY_COMMITS), leerUrl(PRESENCIA, f), leerUrl(BANDEJA, f)]);
  const presencia = pres && Array.isArray(pres.presence) ? pres.presence : [];
  const bandeja = band && Array.isArray(band.items) ? band.items : null;
  const lecturas = lect && Array.isArray(lect.lecturas) ? lect.lecturas : [];
  const cuentas = resumirCuentas(lecturas, null, { ahora });
  const agentes = agentesDePulso(docs, ahora).map(({ _serie, ...a }) => a);
  const lh = lineasHoy(commits && Array.isArray(commits.commits) ? commits.commits : [], ahora);
  const hoy = quienLlevaHoy({ doc: docHoy, presencia, ahora });
  return {
    ok: true, fecha: hoy.fecha, hoy,
    equipos: EQUIPOS.map((eq) => tarjetaEquipo(eq, { hoy, cuentas, lecturas, agentes, lineasHoyPorAgente: lh.porAgente, bandeja, ahora })),
    regla: "Dos equipos, uno por cuenta; nunca se cruzan cuentas. Cada día Carlos lleva uno y el otro va con su orquestador (Elon tiene a Jobs de respaldo mientras no tenga latido).",
    criterio: {
      presupuesto: "cupo del día = margen de la lectura de las 00:00 ÷ días hasta el reset; gasto de hoy = última lectura − la de las 00:00. Sin lectura desde las 00:00 no hay gasto medido (como mucho, previsión al ritmo medio). Sin fecha de reset, no hay cupo.",
      semaforo: "verde < 75 % del cupo, amarillo 75-100 %, rojo > 100 %; la cabecera es la cuenta más apretada (no se suman % de planes distintos).",
      tokens: "pulso de cada Mac (tokens de hoy, Madrid); un pulso de ayer no cuenta. El Consejo Grok Bot sale del export de Cursor, con retraso.",
      encargos: "bandeja pública: pending/ack/in_progress de las últimas 48 h dirigidos a miembros del equipo.",
    },
    fuentes: {
      hoy: docHoy ? "KV " + KEY_HOY : "semilla de equipos-config.mjs", lecturas: lecturas.length + " lecturas", pulso: docs.length + " máquinas",
      lineas: commits ? "commits (" + (commits.commits || []).length + ")" : "sin datos", presencia: pres ? presencia.length + " filas" : "no responde", encargos: band ? (bandeja || []).length + " últimos" : "no responde",
    },
    generado: new Date(ahora).toISOString(),
  };
}

export async function onRequestGet(ctx) {
  return new Response(JSON.stringify(await construir({ env: ctx.env, fetchImpl: ctx.fetchImpl })), { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, OPTIONS" } });
}
