/**
 * Pulso de tokens en tiempo real (GrokBotBox, 09-10-2026) — funciones puras, sin red ni KV.
 *
 * Cada Mac de la flota (LaunchAgent com.admiranext.pulso-tokens, ~/.fleet/pulso-tokens.py) envía cada 60 s
 * POST /api/consumos/pulso { maquina, agentes:[{agente, motor, cuenta, tokHoy, cacheHoy, ultimoEvento}], ts }.
 * tokHoy = tokens acumulados HOY (día de Madrid): input + output + cache_creation; cacheHoy = cache_read aparte.
 * KV: una clave por máquina (consumos:pulso:v1:<maquina>) con, por agente, el último pulso y una serie compacta
 * [[tsSeg, tokHoy, cacheHoy], …] (~1 punto/min, 26 h) + un índice de máquinas que solo se reescribe al aparecer
 * una nueva. Como mucho 1 escritura/min por máquina.
 * Velocidad: tokHora = tokens de los últimos 15 min × 4. Un agente sin pulso hace >3 min está «parado» (stale):
 * no aporta velocidad (nunca se inventa). Una bajada del acumulado = día nuevo (cuenta el valor nuevo).
 * r19 (por proyecto): cada agente puede mandar porProyecto:{proyecto: tokHoy} (cwd → git remote → uno de los 13
 * proyectos de la Galaxia, tools/hackeo-corpus.py; sin casar → «otros»). El punto de la serie lleva un 4.º campo
 * {proyecto: tokHoy} y de ahí sale tokHora por proyecto con el mismo método (15 min × 4).
 * r20 (con Carlos): cada agente puede mandar conCarlos (bool), conCarlosMotivo (señales, sin contenido) y
 * conCarlosDesde (ISO). Regla de Carlos: si está trabajando directamente con un agente, nadie le inyecta encargos.
 * Un agente sin pulso fresco (>3 min) nunca cuenta como «con Carlos» (no se inventa).
 * r27 (Cursor / Grok Bot, 09-10-2026 — Carlos: «¿por qué no sales en la flota, Jobs?»): motores nuevos
 *  - «cursor»: uso de la cuenta Cursor Pro (export CSV de cursor.com/dashboard/usage, fleet/cursor-uso.py en GrokBotBox).
 *    El CSV llega con HORAS de retraso, así que el agente manda su propia SERIE EN HORA DEL EVENTO (`serie`, puntos
 *    acumulados de hoy cada 5 min) que sustituye a la anterior: re-mandar el mismo CSV no crea picos falsos. tok/h =
 *    tokens de la ÚLTIMA HORA CON DATOS (no «ahora») y `retrasoS` = cuánto van atrás los datos; fresco si el último
 *    envío tiene < 2,5 h (el job es horario). `cubre`: personas cuyo consumo ya va dentro de este total (consejeros Grok
 *    Bot): sus partes de Yokup (p. ej. la ESTIMACIÓN de Woz por consumo_reportar) se quitan de la suma → sin doble conteo.
 *  - «grok»: Grok CLI local (Smith en el Mac mini, ~/.grok/sessions/<cwd>/<id>/usage.json), mismo pulso de 60 s que Claude/Codex.
 */
import { incremento } from "./consumos-velocidad-lib.mjs";

export const KEY_PREFIX = "consumos:pulso:v1:";
export const KEY_INDICE = "consumos:pulso:v1:_maquinas";
export const RETENCION_MS = 26 * 3600 * 1000;
export const MIN_ESCRITURA_MS = 50 * 1000;
export const STALE_MS = 3 * 60 * 1000;
export const VENTANA_MS = 15 * 60 * 1000;
const M = 60000;
const MOTORES = new Set(["claude", "codex", "cursor", "grok"]);
export const STALE_CURSOR_MS = 150 * 60 * 1000;
export const VENTANA_CURSOR_MS = 60 * 60 * 1000;
/** ¿Este agente manda su serie en hora del evento (datos con retraso)? */
export const conRetraso = (a) => !!a && (a.motor === "cursor" || a.serieEventos === true);

const texto = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const entero = (x) => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n < 1e13 ? Math.round(n) : null; };

/** Clave «persona» para casar nombres: «Oráculo» = «Oraculo · Codex» = «oraculo». */
export function persona(nombre) {
  return String(nombre || "").split("·")[0].trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\(.*\)$/, "");
}

/** Valida el cuerpo del POST. Devuelve { ok, pulso } o { ok:false, error }. */
export function normalizarPulso(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "cuerpo JSON requerido" };
  const maquina = texto(body.maquina, 60).replace(/[^\w.\-]/g, "");
  if (!maquina) return { ok: false, error: "maquina requerida" };
  if (!Array.isArray(body.agentes) || !body.agentes.length || body.agentes.length > 8) return { ok: false, error: "agentes: lista de 1 a 8" };
  const agentes = [];
  for (const a of body.agentes) {
    const agente = texto(a && a.agente, 40);
    const motor = texto(a && a.motor, 12).toLowerCase();
    const tokHoy = entero(a && a.tokHoy);
    if (!agente || !MOTORES.has(motor) || tokHoy === null) return { ok: false, error: "cada agente necesita agente, motor (claude|codex|cursor|grok) y tokHoy ≥ 0" };
    const ev = a.ultimoEvento ? Date.parse(a.ultimoEvento) : NaN;
    let porProyecto = null;
    if (a.porProyecto && typeof a.porProyecto === "object") {
      porProyecto = {};
      for (const [k, v] of Object.entries(a.porProyecto).slice(0, 30)) { const n = texto(k, 60), t = entero(v); if (n && t !== null) porProyecto[n] = t; }
    }
    const desde = a.conCarlosDesde ? Date.parse(a.conCarlosDesde) : NaN;
    const conCarlos = a.conCarlos === true;
    const extra = {};
    if (a.modelo) extra.modelo = texto(a.modelo, 80);
    if (a.fuente) extra.fuente = texto(a.fuente, 30);
    if (Array.isArray(a.cubre)) extra.cubre = a.cubre.slice(0, 12).map((x) => texto(x, 40)).filter(Boolean);
    if (a.nota) extra.nota = texto(a.nota, 240);
    if (motor === "cursor" && Array.isArray(a.serie)) {
      const sr = normalizarSerie(a.serie);
      if (!sr) return { ok: false, error: "serie: lista de [tsSeg, tokHoy, cacheHoy, {proyecto: tok}?] creciente en el tiempo (≤ 400 puntos)" };
      extra.serie = sr;
    }
    agentes.push({ agente, motor, cuenta: texto(a.cuenta, 80), tokHoy, cacheHoy: entero(a.cacheHoy) || 0, ultimoEvento: Number.isFinite(ev) ? new Date(ev).toISOString() : null, porProyecto,
      conCarlos, conCarlosMotivo: texto(a.conCarlosMotivo, 240) || null, conCarlosDesde: conCarlos && Number.isFinite(desde) ? new Date(desde).toISOString() : null, ...extra });
  }
  return { ok: true, pulso: { maquina, agentes } };
}

/** r27: serie en hora del evento (Cursor) → puntos validados, ordenados, ts únicos; null si no vale. */
export function normalizarSerie(serie) {
  if (!Array.isArray(serie) || serie.length > 400) return null;
  const out = [];
  for (const p of serie) {
    if (!Array.isArray(p)) return null;
    const t = entero(p[0]), tok = entero(p[1]), cache = entero(p[2]) || 0;
    if (t === null || tok === null || t < 1e9 || t > 1e10) return null;
    let pp = null;
    if (p[3] && typeof p[3] === "object") { pp = {}; for (const [k, v] of Object.entries(p[3]).slice(0, 30)) { const n = texto(k, 60), x = entero(v); if (n && x !== null) pp[n] = x; } }
    if (out.length && t <= out[out.length - 1][0]) return null;
    out.push(pp ? [t, tok, cache, pp] : [t, tok, cache]);
  }
  return out;
}

/** Aplica un pulso al documento de la máquina. Devuelve { doc, guardar } (guardar=false si llegó antes de 50 s). */
export function aplicarPulso(doc, pulso, ahora) {
  const d = doc && typeof doc === "object" && doc.agentes ? doc : { maquina: pulso.maquina, agentes: {} };
  if (d.ultimoPulso && ahora - d.ultimoPulso < MIN_ESCRITURA_MS) return { doc: d, guardar: false };
  const t = Math.floor(ahora / 1000);
  const corte = Math.floor((ahora - RETENCION_MS) / 1000);
  for (const a of pulso.agentes) {
    const prev = d.agentes[a.agente] || { serie: [] };
    let serie = (prev.serie || []).filter((p) => Array.isArray(p) && p[0] >= corte);
    if (a.serie) {
      // r27: serie en hora del evento — la nueva SUSTITUYE a la vieja desde su primer punto (idempotente).
      const ini = a.serie.length ? a.serie[0][0] : Infinity;
      serie = [...serie.filter((p) => p[0] < ini), ...a.serie.filter((p) => p[0] >= corte)];
    } else serie.push(a.porProyecto ? [t, a.tokHoy, a.cacheHoy, a.porProyecto] : [t, a.tokHoy, a.cacheHoy]);
    d.agentes[a.agente] = { motor: a.motor, cuenta: a.cuenta, tokHoy: a.tokHoy, cacheHoy: a.cacheHoy, ultimoEvento: a.ultimoEvento, ultimoPulso: ahora, serie, porProyecto: a.porProyecto || null,
      conCarlos: !!a.conCarlos, conCarlosMotivo: a.conCarlosMotivo || null, conCarlosDesde: a.conCarlosDesde || null,
      ...(a.modelo ? { modelo: a.modelo } : {}), ...(a.fuente ? { fuente: a.fuente } : {}), ...(a.cubre ? { cubre: a.cubre } : {}), ...(a.nota ? { nota: a.nota } : {}), ...(a.serie ? { serieEventos: true } : {}) };
  }
  for (const [n, a] of Object.entries(d.agentes)) if (!a.ultimoPulso || ahora - a.ultimoPulso > RETENCION_MS) delete d.agentes[n];
  d.maquina = pulso.maquina;
  d.ultimoPulso = ahora;
  return { doc: d, guardar: true };
}

/** Tokens entre (desde, hasta] de una serie [[tsSeg, tok], …] sumando incrementos (reinicio = día nuevo). */
export function tokensEnVentana(serie, desdeMs, hastaMs, valor = (p) => p[1]) {
  let total = 0;
  for (let i = 1; i < serie.length; i++) {
    const ts = serie[i][0] * 1000;
    if (ts > desdeMs && ts <= hastaMs) total += incremento(valor(serie[i - 1]), valor(serie[i]));
  }
  return total;
}

/** Acumulado de un proyecto en un punto: sin desglose en ese punto → desconocido (no cuenta); con desglose → 0 si no sale. */
export const valorProyecto = (proy) => (p) => (p[3] && typeof p[3] === "object" ? Number(p[3][proy]) || 0 : undefined);

/**
 * r22 (Carlos: «un proyecto no puede superar a la flota»): reparto de los tokens de UN agente en (desde, hasta] por
 * proyecto, con la MISMA cuenta que su total (incremento del acumulado del agente). Por cada paso: Δagente =
 * incremento(total); Δproyecto = subida de su acumulado (bajadas = tokens re-atribuidos por el colector → 0; día nuevo
 * → el valor nuevo). Si Σ Δproyecto > Δagente se escala hacia abajo; si es menor, el resto va a «otros». Así
 * Σ proyectos == agente siempre, y Σ agentes == flota.
 */
export function repartoVentana(serie, desdeMs, hastaMs) {
  const por = {};
  let total = 0;
  for (let i = 1; i < serie.length; i++) {
    const ts = serie[i][0] * 1000;
    if (!(ts > desdeMs && ts <= hastaMs)) continue;
    const prev = serie[i - 1], cur = serie[i];
    const dA = incremento(prev[1], cur[1]);
    total += dA;
    if (!dA) continue;
    const reinicio = Number(cur[1]) < Number(prev[1]);
    const pc = cur[3] && typeof cur[3] === "object" ? cur[3] : null;
    const pp = prev[3] && typeof prev[3] === "object" ? prev[3] : {};
    const d = {};
    let suma = 0;
    if (pc) for (const [k, v] of Object.entries(pc)) {
      const x = reinicio ? Math.max(0, Number(v) || 0) : Math.max(0, (Number(v) || 0) - (Number(pp[k]) || 0));
      if (x > 0) { d[k] = x; suma += x; }
    }
    const f = suma > dA ? dA / suma : 1;
    for (const [k, x] of Object.entries(d)) por[k] = (por[k] || 0) + x * f;
    if (suma < dA) por.otros = (por.otros || 0) + (dA - suma);
  }
  return { total, porProyecto: por };
}

/**
 * Proyectos de todos los agentes con pulso: tokHoy = suma del último desglose de cada agente (también de los parados:
 * es un hecho); tokHora = reparto (repartoVentana) de los tokens de los últimos 15 min de cada agente NO parado,
 * escalado con la MISMA ventana que su tok/h → Σ tokHora de proyectos == Σ tokHora de agentes. Ordenado por tokHoy.
 */
export function proyectosDePulso(docs, ahora) {
  const acc = {};
  const de = (proy) => acc[proy] || (acc[proy] = { proyecto: proy, tokHoy: 0, tokHora: null, tokUltimos15min: 0, agentes: [] });
  for (const doc of docs || []) for (const a of Object.values((doc && doc.agentes) || {})) {
    const serie = (a.serie || []).slice().sort((x, y) => x[0] - y[0]);
    const m = medirAgente(a, ahora);
    const hoy = a.porProyecto && typeof a.porProyecto === "object" ? a.porProyecto : { otros: Number(a.tokHoy) || 0 };
    for (const [proy, tok] of Object.entries(hoy)) {
      const p = de(proy);
      p.tokHoy += Number(tok) || 0;
      if (doc.maquina && !p.agentes.includes(doc.maquina)) p.agentes.push(doc.maquina);
    }
    if (m.tokHora === null) continue;
    for (const proy of Object.keys(hoy)) { const p = de(proy); if (p.tokHora === null) p.tokHora = 0; }
    const v = ventanaAgente(a, ahora);
    const r = repartoVentana(serie, v.desde, v.hasta);
    const factor = r.total > 0 ? m.tokHora / r.total : 0;
    for (const [proy, t] of Object.entries(r.porProyecto)) {
      const p = de(proy);
      if (doc.maquina && !p.agentes.includes(doc.maquina)) p.agentes.push(doc.maquina);
      if (!conRetraso(a)) p.tokUltimos15min += t;
      p.tokHora = (p.tokHora || 0) + t * factor;
    }
  }
  return Object.values(acc).map(({ agentes, ...p }) => ({ ...p, tokUltimos15min: Math.round(p.tokUltimos15min), tokHora: p.tokHora === null ? null : Math.round(p.tokHora), maquinas: agentes.filter(Boolean) }))
    .sort((a, b) => b.tokHoy - a.tokHoy || (b.tokHora || 0) - (a.tokHora || 0));
}

/** r27: ventana con la que se mide la velocidad: últimos 15 min (pulso) o la última hora CON DATOS (Cursor). */
export function ventanaAgente(a, ahora) {
  if (!conRetraso(a)) return { desde: ahora - VENTANA_MS, hasta: ahora };
  const s = a.serie || [];
  const fin = s.length ? Math.max(...s.map((p) => p[0])) * 1000 : ahora;
  const ev = a.ultimoEvento ? Date.parse(a.ultimoEvento) : NaN;
  const hasta = Number.isFinite(ev) ? Math.max(fin, Math.min(ev, ahora)) : fin;
  return { desde: hasta - VENTANA_CURSOR_MS, hasta };
}

/** Medidas de un agente: tokUltimos5min, tokUltimos15min, tokUltimaHora, tokHora (15 min × 4), stale. */
export function medirAgente(a, ahora) {
  const serie = (a.serie || []).slice().sort((x, y) => x[0] - y[0]);
  if (conRetraso(a)) {
    // r27 (Cursor): tok/h = tokens de la última hora con datos; retrasoS = lo que van atrás los datos.
    const stale = !a.ultimoPulso || ahora - a.ultimoPulso > STALE_CURSOR_MS;
    const v = ventanaAgente(a, ahora);
    const tok60 = tokensEnVentana(serie, v.desde, v.hasta);
    return {
      tokHora: !stale && serie.length >= 2 ? tok60 : null, tokUltimos5min: null, tokUltimos15min: null, tokUltimaHora: tok60,
      ventanaMin: 60, stale, haceS: a.ultimoPulso ? Math.max(0, Math.round((ahora - a.ultimoPulso) / 1000)) : null,
      conRetraso: true, retrasoS: Math.max(0, Math.round((ahora - v.hasta) / 1000)), datosHasta: new Date(v.hasta).toISOString(),
    };
  }
  const stale = !a.ultimoPulso || ahora - a.ultimoPulso > STALE_MS;
  const primero = serie.length ? serie[0][0] * 1000 : ahora;
  const cubierto = Math.min(VENTANA_MS, ahora - primero); // si el agente acaba de empezar, la ventana real es menor
  const tok5 = tokensEnVentana(serie, ahora - 5 * M, ahora);
  const tok15 = tokensEnVentana(serie, ahora - VENTANA_MS, ahora);
  const tok60 = tokensEnVentana(serie, ahora - 60 * M, ahora);
  let tokHora = null;
  if (!stale && serie.length >= 2 && cubierto >= 2 * M) tokHora = Math.round(tok15 * (3600000 / cubierto));
  return {
    tokHora, tokUltimos5min: tok5, tokUltimos15min: tok15, tokUltimaHora: tok60,
    ventanaMin: Math.round(cubierto / M), stale, haceS: a.ultimoPulso ? Math.max(0, Math.round((ahora - a.ultimoPulso) / 1000)) : null,
  };
}

/** Tokens por minuto (todos los agentes NO parados) en los últimos `min` minutos → [{ ts, tok }]. */
export function seriePorMinuto(agentes, ahora, min = 60) {
  const fin = Math.floor(ahora / M) * M;
  const cubos = new Array(min).fill(0);
  for (const a of agentes) {
    const s = (a.serie || []).slice().sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < s.length; i++) {
      const ts = s[i][0] * 1000;
      const k = min - 1 - Math.floor((fin - Math.floor(ts / M) * M) / M);
      if (k >= 0 && k < min) cubos[k] += incremento(s[i - 1][1], s[i][1]);
    }
  }
  return cubos.map((tok, i) => ({ ts: fin - (min - 1 - i) * M, tok }));
}

/** Pico de tok/h (ventanas de 15 min × 4) en las últimas 24 h, de la suma de agentes con pulso. null si no hay serie. */
export function picoPulso(agentes, ahora) {
  if (!agentes.some((a) => (a.serie || []).length >= 2)) return null;
  const min = seriePorMinuto(agentes, ahora, 24 * 60).map((x) => x.tok);
  let suma = 0, pico = 0;
  for (let i = 0; i < min.length; i++) { suma += min[i]; if (i >= 15) suma -= min[i - 15]; pico = Math.max(pico, suma * 4); }
  return pico;
}

/** r22: proyecto en el que trabaja AHORA un agente: el que más tokens se lleva en los últimos 15 min; si nada, el que más lleva hoy. */
export function proyectoDeAgente(a, ahora) {
  const serie = (a && a.serie || []).slice().sort((x, y) => x[0] - y[0]);
  const top = (o) => Object.entries(o || {}).filter(([, v]) => Number(v) > 0).sort((x, y) => y[1] - x[1] || (x[0] === "otros") - (y[0] === "otros"))[0];
  const v = ventanaAgente(a || {}, ahora);
  const r = top(repartoVentana(serie, v.desde, v.hasta).porProyecto) || top(a && a.porProyecto);
  return r ? r[0] : null;
}

/** Documentos de máquina → lista plana de agentes con sus medidas. */
export function agentesDePulso(docs, ahora) {
  const out = [];
  for (const doc of docs || []) {
    if (!doc || !doc.agentes) continue;
    for (const [agente, a] of Object.entries(doc.agentes)) {
      const ret = conRetraso(a);
      out.push({ agente, maquina: doc.maquina, motor: a.motor, cuenta: a.cuenta, tokHoy: a.tokHoy, cacheHoy: a.cacheHoy || 0,
        porProyecto: a.porProyecto || null, ultimoEvento: a.ultimoEvento || null, ultimoPulso: a.ultimoPulso ? new Date(a.ultimoPulso).toISOString() : null,
        ...(a.modelo ? { modelo: a.modelo } : {}), ...(a.fuente ? { fuente: a.fuente } : {}), ...(a.cubre ? { cubre: a.cubre } : {}), ...(a.nota ? { nota: a.nota } : {}),
        metodo: ret ? "cursor (con retraso)" : "tiempo real", ...medirAgente(a, ahora), ...estadoConCarlos(a, ahora), proyectoAhora: proyectoDeAgente(a, ahora), _serie: a.serie || [] });
    }
  }
  return out;
}

/** «Con Carlos» de un agente: solo con pulso fresco (≤3 min); si no, false con el porqué. */
export function estadoConCarlos(a, ahora) {
  const fresco = a && a.ultimoPulso && ahora - a.ultimoPulso <= STALE_MS;
  if (!fresco) return { conCarlos: false, conCarlosMotivo: a && a.conCarlos ? "sin pulso fresco: no se da por bueno" : (a && a.conCarlosMotivo) || null, conCarlosDesde: null };
  return { conCarlos: !!a.conCarlos, conCarlosMotivo: a.conCarlosMotivo || null, conCarlosDesde: a.conCarlos ? a.conCarlosDesde || null : null };
}

/** Lista pública (sin contenido ni motivo): [{ agente, maquina, desde }] de los agentes con Carlos ahora. */
export function conCarlosDePulso(docs, ahora) {
  return agentesDePulso(docs, ahora).filter((a) => a.conCarlos)
    .map((a) => ({ agente: a.agente, maquina: a.maquina || null, desde: a.conCarlosDesde || null }))
    .sort((x, y) => x.agente.localeCompare(y.agente));
}

/**
 * Une el pulso (preferente, «tiempo real») con el cálculo de Yokup (`yk`, salida de calcularVelocidad o null).
 * Un agente de Yokup se descarta si su persona tiene pulso fresco; el «Anónimo · Claude (MacMini)» se descarta si
 * hay un pulso fresco del mismo motor en esa máquina (son los mismos tokens). tokHora total = suma de los agentes
 * con velocidad medida. Sin pulso ni Yokup → sinDatos.
 */
export function mezclar(yk, docs, ahora) {
  const pulso = agentesDePulso(docs, ahora);
  const frescos = pulso.filter((a) => !a.stale);
  const personas = new Set(frescos.map((a) => persona(a.agente)));
  const maqMotor = new Set(frescos.map((a) => String(a.maquina).toLowerCase() + "|" + a.motor));
  // r27: personas cuyo consumo ya va dentro de un total real (p. ej. los consejeros Grok Bot dentro de Cursor Pro).
  const cubiertas = new Map();
  for (const a of frescos) for (const c of a.cubre || []) cubiertas.set(persona(c), a.agente);
  const excluidosYokup = [];
  const deYokup = ((yk && yk.porAgente) || []).filter((a) => {
    const p = persona(a.agente);
    if (personas.has(p)) return false;
    if (cubiertas.has(p)) { excluidosYokup.push({ agente: a.agente, tokHoy: a.tokHoy || 0, motivo: "va dentro del total real de " + cubiertas.get(p) + " (sin doble conteo)" }); return false; }
    const m = /^an[oó]nimo\s*·\s*(\w+)\s*\(([^)]+)\)/i.exec(a.agente);
    if (m && maqMotor.has(m[2].toLowerCase() + "|" + m[1].toLowerCase())) return false;
    return true;
  }).map((a) => ({ ...a, metodo: yk.metodo === "ultima-hora" ? "partes Yokup (última hora)" : "partes Yokup (media de hoy)" }));
  const conYokup = new Set(deYokup.map((a) => persona(a.agente)));
  const parados = pulso.filter((a) => a.stale && !conYokup.has(persona(a.agente)));
  const limpia = ({ _serie, ...a }) => a;
  const porAgente = [...frescos.map(limpia), ...deYokup, ...parados.map(limpia)]
    .sort((a, b) => (b.tokHora || 0) - (a.tokHora || 0) || (b.tokHoy || 0) - (a.tokHoy || 0));
  const medidos = porAgente.filter((a) => Number.isFinite(a.tokHora));
  if (!frescos.length && !yk) return { sinDatos: true, tokHora: null, porAgente, metodo: null, porProyecto: proyectosDePulso(docs, ahora).map((p) => ({ ...p, tokHora: null })), proyectoTop: null };
  const tokHora = medidos.reduce((s, a) => s + a.tokHora, 0);
  const tokHoy = porAgente.reduce((s, a) => s + (Number(a.tokHoy) || 0), 0);
  const suma = (k) => frescos.reduce((s, a) => s + (a[k] || 0), 0);
  const ultimo = frescos.reduce((m, a) => Math.max(m, Date.parse(a.ultimoPulso) || 0), 0);
  const conSerie = pulso.filter((a) => !a.stale).map((a) => ({ serie: a._serie }));
  const conRet = frescos.filter((a) => a.conRetraso);
  const etqRet = conRet.length ? " + Cursor (datos con ~" + Math.max(1, Math.round(Math.max(...conRet.map((a) => a.retrasoS || 0)) / 3600)) + " h de retraso)" : "";
  const picoRT = picoPulso(conSerie, ahora);
  const proys = proyectosDePulso(docs, ahora);
  return {
    sinDatos: false,
    tokHora: Math.round(tokHora),
    metodo: frescos.length ? "tiempo real" : yk.metodo,
    etiqueta: frescos.length ? (deYokup.length ? "tiempo real + partes Yokup" : "tiempo real") + etqRet : yk.etiqueta,
    ventanaMin: frescos.length ? 15 : yk.ventanaMin,
    tokUltimos5min: frescos.length ? suma("tokUltimos5min") : null,
    tokUltimos15min: frescos.length ? suma("tokUltimos15min") : null,
    tokUltimaHora: frescos.length ? suma("tokUltimaHora") : null,
    ultimoPulso: ultimo ? new Date(ultimo).toISOString() : null,
    haceS: ultimo ? Math.max(0, Math.round((ahora - ultimo) / 1000)) : null,
    serie60: frescos.length ? seriePorMinuto(conSerie, ahora, 60) : [],
    porAgente, tokHoy,
    pico24h: frescos.length ? Math.max(picoRT || 0, Math.round(tokHora)) : (yk ? yk.pico24h : null),
    porProyecto: proys,
    proyectoTop: proys.length ? proys[0].proyecto : null,
    agentesTiempoReal: frescos.length, agentesParados: pulso.filter((a) => a.stale).map((a) => a.agente),
    agentesConRetraso: conRet.map((a) => ({ agente: a.agente, retrasoS: a.retrasoS, datosHasta: a.datosHasta })), excluidosYokup,
  };
}
