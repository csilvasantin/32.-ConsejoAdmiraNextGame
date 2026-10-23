/**
 * /api/consumos/velocidad — velocímetro de tokens/hora de la flota (GrokBotBox, 09-10-2026).
 *
 * GET → { ok, tokHora, ventanaMin, metodo:'ultima-hora'|'media-hoy', etiqueta, porAgente:[{agente,tokHora,tokHoy}],
 *         pico24h, escalaMax, tokHoy, fuente, instantaneas, generado }
 * Fuente REAL: api.yokup.com/fleet/consumo?dias=1 (partes de consumo que cada agente declara, con su serie
 * de muestras ~5 min). En cada GET se guarda, como mucho cada 5 min, una instantánea de los totales del día en
 * KV (RECORTE_KV, clave consumos:vel:snaps:v1, ~26 h). La velocidad sale de las instantáneas de Yokup + las propias.
 * Si Yokup no responde: { ok:false, sinDatos:true } — nunca números inventados.
 *
 * r18 (tiempo real): se une el PULSO de cada Mac (POST /api/consumos/pulso, cada 60 s, logs locales de Claude Code y
 * Codex) — preferente, metodo «tiempo real»: tokHora = tokens de los últimos 15 min × 4, + tokUltimos5min,
 * tokUltimaHora, serie60 (tokens por minuto, 60 min), haceS. Yokup solo para los agentes sin pulso. Un agente sin
 * pulso hace >3 min queda «parado» (sin velocidad). La respuesta se cachea 8 s en el borde (menos lecturas de KV).
 * r19: porProyecto:[{proyecto, tokHoy, tokHora, tokUltimos15min, maquinas}] (orden tokHoy) + proyectoTop, del desglose del pulso.
 * r23: conocidos:[{agente, maquina, modelo, cuentaId, plan, email}] (consumos-perfiles.mjs) para los desplegables.
 * r20: proyectoAhora = el que más quema AHORA (max tokHora; si todos a 0, max tokHoy) — el dial de proyecto lo sigue en auto.
 */
import { calcularVelocidad, partesDeHoy, serieAInstantaneas, unir, podar, tocaGuardar, escala, proyectoAhora, madrid, KEY_DIAS, anotarDia, yokupPorDia, periodosTokens, diasPeriodo } from "../../../consumos-velocidad-lib.mjs";
import { mezclar, appsGrokBot, superficiesDePulso, limitesDePulso } from "../../../consumos-pulso-lib.mjs";
import { leerPulsos } from "./pulso.js";
import { KEY_HIST, anotarHistorico } from "../../../historico-lib.mjs";
import { perfilesFlota } from "../../../consumos-perfiles.mjs";

export const FUENTE = "https://api.yokup.com/fleet/consumo?dias=1";
export const KEY = "consumos:vel:snaps:v1";
// Periodos del cuentakilómetros (HOY/AYER/SEMANA/MES): partes diarios de Yokup del último mes (cacheados 10 min).
export const FUENTE_MES = "https://api.yokup.com/fleet/consumo?dias=31";
const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);

function json(obj, status, origin) {
  const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin" };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(obj), { status, headers: h });
}
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leerYokup(fetchImpl, url = FUENTE, ttl = 60) {
  try {
    const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000), cf: { cacheTtl: ttl, cacheEverything: true } });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.ok !== false && Array.isArray(d.partes) ? d : null;
  } catch (e) { return null; }
}

export async function onRequestGet(ctx) {
  const { request } = ctx;
  const origin = request.headers.get("Origin") || "";
  let cache = null;
  const ck = new Request(new URL(request.url).origin + "/api/consumos/velocidad?_c=1");
  try { cache = typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) {}
  if (cache && !ctx.fetchImpl) {
    try {
      const hit = await cache.match(ck);
      if (hit) return json(await hit.json(), 200, origin);
    } catch (e) {}
  }
  const cuerpo = await calcular(ctx);
  if (cache && !ctx.fetchImpl) {
    try {
      const p = cache.put(ck, new Response(JSON.stringify(cuerpo), { headers: { "content-type": "application/json", "cache-control": "public, max-age=8" } }));
      if (ctx.waitUntil) ctx.waitUntil(p); else await p;
    } catch (e) {}
  }
  return json(cuerpo, 200, origin);
}

export async function calcular({ env, fetchImpl }) {
  const ahora = Date.now();
  const store = kv(env);
  const [d, docs, dMes, libroRaw, histRaw] = await Promise.all([leerYokup(fetchImpl || fetch), leerPulsos(store).catch(() => []), leerYokup(fetchImpl || fetch, FUENTE_MES, 600),
    store ? store.get(KEY_DIAS).catch(() => null) : null, store ? store.get(KEY_HIST).catch(() => null) : null]);
  let yk = null, propias = [], deYokup = [];
  if (d) {
    const { hoy, nombres } = partesDeHoy(d, ahora);
    deYokup = serieAInstantaneas(d.serie, (k) => nombres[k] || k.split("|")[0]);
    if (store) {
      try { const raw = await store.get(KEY); const p = raw ? JSON.parse(raw) : null; if (Array.isArray(p)) propias = p; } catch (e) {}
      if (Object.keys(hoy).length && tocaGuardar(propias, ahora)) {
        propias = podar([...propias, { ts: ahora, totales: hoy }], ahora);
        try { await store.put(KEY, JSON.stringify(propias)); } catch (e) {}
      }
    }
    yk = calcularVelocidad({ snaps: unir(deYokup, propias, ahora), hoy, ahora });
  }
  const m = mezclar(yk, docs, ahora);
  // Libro diario: el tokHoy de la flota (máximo del día), como mucho una escritura cada 5 min.
  let libro = null;
  try { libro = libroRaw ? JSON.parse(libroRaw) : null; } catch (e) {}
  const tokHoyFlota = m.sinDatos ? null : Number(m.tokHoy);
  if (store && Number.isFinite(tokHoyFlota)) {
    const dia = madrid(ahora).dia, prev = libro && libro[dia];
    if (!prev || (tokHoyFlota > prev.tok && ahora - (prev.ts || 0) >= 5 * 60 * 1000)) {
      libro = anotarDia(libro, dia, tokHoyFlota, ahora);
      try { await store.put(KEY_DIAS, JSON.stringify(libro)); } catch (e) {}
    }
  }
  // Mejora 5 (23-10-2026): libro histórico por agente y proyecto (máximo tokHoy del día), una escritura cada ≥ 5 min.
  if (store && !m.sinDatos) {
    let h = null; try { h = histRaw ? JSON.parse(histRaw) : null; } catch (e) {}
    const dia = madrid(ahora).dia, prev = h && h[dia];
    if (!prev || ahora - (prev.ts || 0) >= 5 * 60 * 1000) {
      try { await store.put(KEY_HIST, JSON.stringify(anotarHistorico(h, dia, m.porAgente, m.porProyecto, ahora))); } catch (e) {}
    }
  }
  const periodos = { ...periodosTokens({ tokHoy: Number.isFinite(tokHoyFlota) ? tokHoyFlota : null, libro, yokup: dMes ? yokupPorDia(dMes) : null,
    yokupDesde: dMes ? (() => { const x = new Date(diasPeriodo(ahora).hoy + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - 30); return x.toISOString().slice(0, 10); })() : null, ahora }),
    fuentes: { hoy: "tokHoy en vivo (pulso + Cursor + Yokup)", pasado: "libro diario KV " + KEY_DIAS + " (máximo tokHoy de cada día); si falta, " + FUENTE_MES + " sin caché" }, yokupMes: dMes ? "ok" : "sin respuesta" };
  const base = { grokbotApps: appsGrokBot(docs, ahora), superficies: superficiesDePulso(docs, ahora), limites: limitesDePulso(docs, ahora), fuente: FUENTE, fuentePulso: "/api/consumos/pulso", yokup: d ? "ok" : "sin respuesta", instantaneasKV: propias.length, instantaneasYokup: deYokup.length, almacen: store ? "kv" : "ninguno", generado: new Date(ahora).toISOString() };
  if (m.sinDatos) return { ok: false, sinDatos: true, conocidos: perfilesFlota(), tokHora: null, metodo: null, porAgente: [], pico24h: null, error: "ni pulso en tiempo real ni partes de Yokup", periodos, ...base };
  return { ok: true, ...m, conocidos: perfilesFlota(), proyectoAhora: proyectoAhora(m.porProyecto), escalaMax: escala(Math.max(m.pico24h || 0, m.tokHora || 0)), periodos, ...base };
}
