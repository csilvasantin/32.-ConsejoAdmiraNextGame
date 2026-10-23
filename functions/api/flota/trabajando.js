/**
 * /api/flota/trabajando — ¿quién trabaja AHORA? (GrokBotBox, 09-10-2026 · r28; Carlos: «¿cómo puedo saber en tiempo
 * real quién trabaja?»). Une bot.yokup.com/api/presence (latidos y process_snapshot) con /api/consumos/velocidad
 * (tok/h de los últimos 15 min y «con Carlos»). Criterio en flota-trabajando-lib.mjs.
 * GET → { ok, tarjetas:[{agente, estado:'verde'|'amarillo'|'rojo'|'gris', motivo, maquina, motor, modelo, foco, tarea, proyecto,
 *         encargo, abiertos, limite:{pct, reinicio, ventana, ventanas}|null (r41), tokHora, tokUltimaHora, sinMedicion, tokHoy, haceS, retrato}], presencia:'ok'|'cache'|'sin respuesta',
 *         presenciaEdadS, generado }. Caché de borde 8 s.
 */
import { tarjetas, retratoDe, activosDeFlota, aplicarLatidosConsejero, aplicarRojo, aplicarActividadConsejero, porqueColor, ultimaAccionEncargos, soloVerdeReal, autoreportesDeHoy, aplicarAutoreportes } from "../../../flota-trabajando-lib.mjs";
import { calcular } from "../consumos/velocidad.js";
import { leerFocos, kv as kvFoco } from "../consejo/foco.js";
import { focoDe } from "../../../consejo-foco-lib.mjs";
import { persona as personaPulso } from "../../../consumos-pulso-lib.mjs";
import { matriz, cargaDe, persona as personaCenso, AGENTES_FLOTA, CONSEJEROS, llave } from "../../../flota-matriz-lib.mjs";

/** r4 (Jensen, 10-10-2026): carga de encargos por persona, la MISMA fuente que agentes_vivos (bandeja pública de Yokup,
 *  los 80 más recientes por persona). Con ella: trabajando = latido < 15 min + encargo in_progress. */
export const BANDEJA = "https://bot.yokup.com/api/public/inbox";
export async function leerCarga(fetchImpl, personas) {
  const unicas = [...new Set(personas.filter(Boolean))];
  const filas = await Promise.all(unicas.map(async (p) => {
    try {
      const r = await fetchImpl(BANDEJA + "?persona=" + encodeURIComponent(p), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return [p, null];
      const d = await r.json();
      return [p, { ...cargaDe((d && d.items) || [], p), ultAccion: ultimaAccionEncargos((d && d.items) || [], p, personaCenso) }];
    } catch (e) { return [p, null]; }
  }));
  return new Map(filas.filter(([, c]) => c));
}

/** r50: latido propio de los consejeros (tool consejero_latido del MCP admira-live). Público, sin secretos. */
export const LATIDO_CONSEJEROS = "https://mcp.admira.live/consejeros/latido";
export async function leerLatidosConsejero(fetchImpl) {
  try {
    const r = await fetchImpl(LATIDO_CONSEJEROS, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.consejeros && typeof d.consejeros === "object" ? d.consejeros : null;
  } catch (e) { return null; }
}

/** r57: partes de consumo (consumo_reportar) de Yokup: tokens autodeclarados por persona. Público, sin secretos. */
export const CONSUMO_YOKUP = "https://api.yokup.com/fleet/consumo?dias=1";
export async function leerAutoreportes(fetchImpl) {
  try {
    const r = await fetchImpl(CONSUMO_YOKUP, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.partes) ? d.partes : null;
  } catch (e) { return null; }
}

export const PRESENCIA = "https://bot.yokup.com/api/presence";
/** r40: Yokup tarda 6-7 s en responder; con 5 s la franja perdía la presencia 3 de cada 4 veces (y con ella a
 *  Merovingio, Cypher, Niobe…). Ahora 10 s y, si aun así falla, la última presencia buena de hace ≤ 2 min. */
export const TIMEOUT_PRESENCIA_MS = 10000;
export const MAX_EDAD_PRESENCIA_S = 120;
const cab = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const CLAVE_ULTIMA = "https://admira.live/api/flota/trabajando?_presencia_ultima=1";
let ultimaBuena = null; // { d, ts } en memoria del isolate (además de la caché de borde)

/** Solo para tests. */
export function _olvidarPresencia() { ultimaBuena = null; }

async function leerJson(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_PRESENCIA_MS) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.presence) ? d : null;
  } catch (e) { return null; }
}

/**
 * r41 (Merovingio en el Air): Yokup guarda el latido por persona|máquina, pero el GET normal TIRA los latidos de una
 * máquina con vigilante de procesos fresco y solo enseña las ranuras de su snapshot. El bucle de Merovingio no es una
 * ranura del vigilante del Air → su latido (que sí se guarda: sale en ?all=1) nunca se veía. Se recuperan del histórico
 * (?all=1) SOLO los latidos frescos (< 2 min) de una persona que el vigilante de esa máquina no declara: donde el
 * vigilante tiene opinión, manda él.
 */
export function latidosOcultos(d, todo, ahoraS) {
  if (!d || !todo || !Array.isArray(todo.presence)) return [];
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const visto = new Set((d.presence || []).map((e) => norm(e.persona) + "|" + norm(e.machine)));
  const ranuras = new Set();
  for (const m of d.control_machines || []) for (const sl of m.slots || []) ranuras.add(norm(sl.persona) + "|" + norm(m.machine));
  return todo.presence.filter((e) => e && e.persona && e.machine && ahoraS - (Number(e.updated) || 0) < 120)
    .filter((e) => { const k = norm(e.persona) + "|" + norm(e.machine); return !visto.has(k) && !ranuras.has(k); })
    .map((e) => ({ ...e, source: e.source || "heartbeat", oculto: true }));
}

async function leerPresenciaViva(fetchImpl) {
  const [d, todo] = await Promise.all([leerJson(fetchImpl, PRESENCIA), leerJson(fetchImpl, PRESENCIA + "?all=1")]);
  if (!d) return null;
  const extra = latidosOcultos(d, todo, Number(d.now) || Math.floor(Date.now() / 1000));
  return extra.length ? { ...d, presence: [...d.presence, ...extra] } : d;
}

function cacheBorde() { try { return typeof caches !== "undefined" && caches.default ? caches.default : null; } catch (e) { return null; } }

/** Presencia viva, o la última buena (≤ 2 min) marcada como caché. → { d, estado:'ok'|'cache'|'sin respuesta', edadS } */
export async function leerPresencia(fetchImpl, ahoraMs = Date.now(), cache = cacheBorde()) {
  const d = await leerPresenciaViva(fetchImpl);
  if (d) {
    ultimaBuena = { d, ts: ahoraMs };
    if (cache) { try { await cache.put(new Request(CLAVE_ULTIMA), new Response(JSON.stringify(ultimaBuena), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + MAX_EDAD_PRESENCIA_S } })); } catch (e) {} }
    return { d, estado: "ok", edadS: 0 };
  }
  let u = ultimaBuena;
  if (cache) { try { const hit = await cache.match(new Request(CLAVE_ULTIMA)); if (hit) { const c = await hit.json(); if (c && c.d && (!u || c.ts > u.ts)) u = c; } } catch (e) {} }
  if (u && ahoraMs - u.ts <= MAX_EDAD_PRESENCIA_S * 1000) return { d: u.d, estado: "cache", edadS: Math.round((ahoraMs - u.ts) / 1000) };
  return { d: null, estado: "sin respuesta", edadS: null };
}

/** r16: cada fila de la matriz lleva su retrato (mismo mapa que las fichas). */
export function conRetratos(m) {
  if (!m || !Array.isArray(m.filas)) return m;
  return { ...m, filas: m.filas.map((f) => { const r = retratoDe(f.persona || f.agente); return r ? { ...f, retrato: r } : f; }) };
}

/** r28-sup: columna «Superficie» de la matriz = las superficies de la ficha de esa persona (Terminal (CLI) / app / asistente). */
export function conSuperficies(m, ts) {
  if (!m || !Array.isArray(m.filas)) return m;
  const por = new Map((ts || []).map((t) => [llave(t.agente), t.superficies || []]));
  return { ...m, filas: m.filas.map((f) => ({ ...f, superficies: por.get(llave(f.persona || f.agente)) || [] })) };
}

export async function construir({ env, fetchImpl, ahoraMs: ahoraFijo, cache }) {
  const ahoraMs = ahoraFijo || Date.now();
  const [pr, v, lat, partes] = await Promise.all([leerPresencia(fetchImpl || fetch, ahoraMs, cache === undefined ? cacheBorde() : cache), calcular({ env, fetchImpl }).catch(() => null), leerLatidosConsejero(fetchImpl || fetch), leerAutoreportes(fetchImpl || fetch)]);
  const p = pr.d;
  const ahoraS = Math.floor(ahoraMs / 1000);
  const pres = p ? p.presence : [];
  const nombres = [...AGENTES_FLOTA, ...CONSEJEROS, ...pres.map((e) => e && e.persona && personaCenso(e.persona))];
  const carga = await leerCarga(fetchImpl || fetch, nombres).catch(() => new Map());
  const ts = tarjetas({ presencia: pres, velocidad: v, ahoraS, carga });
  aplicarLatidosConsejero(ts, lat, ahoraS);
  aplicarActividadConsejero(ts, lat); // r55: mensajes / encargos / handON de los consejeros = actividad de hoy
  soloVerdeReal(ts, ahoraS); // r56: verde solo con tokens reales o app atribuible; latidos → solo rojo
  aplicarAutoreportes(ts, autoreportesDeHoy(partes, ahoraS), ahoraS); // r57: tokens propios autodeclarados
  aplicarRojo(ts, ahoraS); // rojo = parado > 1 h pero activo hoy (Madrid); gris = nada hoy
  // r26: foco (proyecto principal · deepagent) de cada ficha; el de los consejeros lo fijan ellos (POST /api/consejo/foco).
  const focos = await leerFocos(kvFoco(env)).catch(() => ({ focos: {} }));
  for (const t of ts) t.foco = focoDe(t, focos, ahoraMs);
  for (const t of ts) t.porqueColor = porqueColor(t, ahoraS); // r55: tooltip de cada pastilla
  // r41 barra de agentes: cuota de su cuenta (% usado + reinicio) del pulso de tokens; sin dato fresco → null.
  const lims = new Map(((v && v.limites) || []).map((l) => [l.persona, l]));
  for (const t of ts) {
    const l = lims.get(personaPulso(t.agente));
    t.limite = l ? { pct: l.pct, reinicio: new Date(l.reinicio * 1000).toISOString(), ventana: l.ventana, motor: l.motor, haceS: l.haceS,
      ventanas: l.ventanas.map((w) => ({ ventana: w.ventana, pct: w.pct, reinicio: new Date(w.reinicio * 1000).toISOString() })) } : null;
  }
  return {
    ok: true, tarjetas: ts, activos: activosDeFlota(ts, v),
    matriz: conSuperficies(conRetratos(matriz({ presencia: pres, carga, ahoraS })), ts), carga: carga.size ? "ok" : "sin datos",
    // r17: qué cuenta(s) tiene en uso la app Grok Bot de cada Mac (cuenta null = app abierta, cuenta desconocida).
    appsGrokBot: (v && Array.isArray(v.grokbotApps) ? v.grokbotApps : []).map((a) => ({ maquina: a.maquina, cuenta: a.cuenta || null,
      alFrente: !!a.alFrente, usoS: a.usoS ?? null, fuente: a.fuente || null })),
    presencia: pr.estado, presenciaEdadS: pr.edadS, pulso: v && v.ok ? "ok" : "sin datos",
    latidoConsejeros: lat ? "ok" : "sin datos", fuentes: [PRESENCIA, "/api/consumos/velocidad", LATIDO_CONSEJEROS], generado: new Date(ahoraMs).toISOString(),
  };
}

export async function onRequestGet(ctx) {
  const cache = cacheBorde();
  const ck = new Request(new URL(ctx.request.url).origin + "/api/flota/trabajando?_c=1");
  if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(await hit.text(), { status: 200, headers: cab }); } catch (e) {} }
  const cuerpo = JSON.stringify(await construir(ctx));
  if (cache) {
    try { const pr = cache.put(ck, new Response(cuerpo, { headers: { "content-type": "application/json", "cache-control": "public, max-age=8" } })); if (ctx.waitUntil) ctx.waitUntil(pr); else await pr; } catch (e) {}
  }
  return new Response(cuerpo, { status: 200, headers: cab });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...cab, "access-control-allow-methods": "GET, OPTIONS" } });
}
