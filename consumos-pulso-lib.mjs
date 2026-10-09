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
 */
import { incremento } from "./consumos-velocidad-lib.mjs";

export const KEY_PREFIX = "consumos:pulso:v1:";
export const KEY_INDICE = "consumos:pulso:v1:_maquinas";
export const RETENCION_MS = 26 * 3600 * 1000;
export const MIN_ESCRITURA_MS = 50 * 1000;
export const STALE_MS = 3 * 60 * 1000;
export const VENTANA_MS = 15 * 60 * 1000;
const M = 60000;
const MOTORES = new Set(["claude", "codex"]);

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
    if (!agente || !MOTORES.has(motor) || tokHoy === null) return { ok: false, error: "cada agente necesita agente, motor (claude|codex) y tokHoy ≥ 0" };
    const ev = a.ultimoEvento ? Date.parse(a.ultimoEvento) : NaN;
    let porProyecto = null;
    if (a.porProyecto && typeof a.porProyecto === "object") {
      porProyecto = {};
      for (const [k, v] of Object.entries(a.porProyecto).slice(0, 30)) { const n = texto(k, 60), t = entero(v); if (n && t !== null) porProyecto[n] = t; }
    }
    const desde = a.conCarlosDesde ? Date.parse(a.conCarlosDesde) : NaN;
    const conCarlos = a.conCarlos === true;
    agentes.push({ agente, motor, cuenta: texto(a.cuenta, 80), tokHoy, cacheHoy: entero(a.cacheHoy) || 0, ultimoEvento: Number.isFinite(ev) ? new Date(ev).toISOString() : null, porProyecto,
      conCarlos, conCarlosMotivo: texto(a.conCarlosMotivo, 240) || null, conCarlosDesde: conCarlos && Number.isFinite(desde) ? new Date(desde).toISOString() : null });
  }
  return { ok: true, pulso: { maquina, agentes } };
}

/** Aplica un pulso al documento de la máquina. Devuelve { doc, guardar } (guardar=false si llegó antes de 50 s). */
export function aplicarPulso(doc, pulso, ahora) {
  const d = doc && typeof doc === "object" && doc.agentes ? doc : { maquina: pulso.maquina, agentes: {} };
  if (d.ultimoPulso && ahora - d.ultimoPulso < MIN_ESCRITURA_MS) return { doc: d, guardar: false };
  const t = Math.floor(ahora / 1000);
  const corte = Math.floor((ahora - RETENCION_MS) / 1000);
  for (const a of pulso.agentes) {
    const prev = d.agentes[a.agente] || { serie: [] };
    const serie = (prev.serie || []).filter((p) => Array.isArray(p) && p[0] >= corte);
    serie.push(a.porProyecto ? [t, a.tokHoy, a.cacheHoy, a.porProyecto] : [t, a.tokHoy, a.cacheHoy]);
    d.agentes[a.agente] = { motor: a.motor, cuenta: a.cuenta, tokHoy: a.tokHoy, cacheHoy: a.cacheHoy, ultimoEvento: a.ultimoEvento, ultimoPulso: ahora, serie, porProyecto: a.porProyecto || null,
      conCarlos: !!a.conCarlos, conCarlosMotivo: a.conCarlosMotivo || null, conCarlosDesde: a.conCarlosDesde || null };
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
 * Proyectos de todos los agentes con pulso: tokHoy = suma del último desglose de cada agente (también de los parados:
 * es un hecho); tokHora = (tokens de los últimos 15 min × 4) solo de los agentes NO parados. Ordenado por tokHoy.
 */
export function proyectosDePulso(docs, ahora) {
  const acc = {};
  for (const doc of docs || []) for (const a of Object.values((doc && doc.agentes) || {})) {
    if (!a.porProyecto) continue;
    const serie = (a.serie || []).slice().sort((x, y) => x[0] - y[0]);
    const m = medirAgente(a, ahora);
    const cubierto = Math.min(VENTANA_MS, ahora - (serie.length ? serie[0][0] * 1000 : ahora));
    for (const [proy, tok] of Object.entries(a.porProyecto)) {
      const p = acc[proy] || (acc[proy] = { proyecto: proy, tokHoy: 0, tokHora: null, tokUltimos15min: 0, agentes: [] });
      p.tokHoy += Number(tok) || 0;
      if (doc.maquina && !p.agentes.includes(doc.maquina)) p.agentes.push(doc.maquina);
      if (!m.stale && serie.length >= 2 && cubierto >= 2 * M) {
        const t15 = tokensEnVentana(serie, ahora - VENTANA_MS, ahora, valorProyecto(proy));
        p.tokUltimos15min += t15;
        p.tokHora = (p.tokHora || 0) + Math.round(t15 * (3600000 / cubierto));
      }
    }
  }
  return Object.values(acc).map(({ agentes, ...p }) => ({ ...p, maquinas: agentes.filter(Boolean) }))
    .sort((a, b) => b.tokHoy - a.tokHoy || (b.tokHora || 0) - (a.tokHora || 0));
}

/** Medidas de un agente: tokUltimos5min, tokUltimos15min, tokUltimaHora, tokHora (15 min × 4), stale. */
export function medirAgente(a, ahora) {
  const serie = (a.serie || []).slice().sort((x, y) => x[0] - y[0]);
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

/** Documentos de máquina → lista plana de agentes con sus medidas. */
export function agentesDePulso(docs, ahora) {
  const out = [];
  for (const doc of docs || []) {
    if (!doc || !doc.agentes) continue;
    for (const [agente, a] of Object.entries(doc.agentes)) {
      out.push({ agente, maquina: doc.maquina, motor: a.motor, cuenta: a.cuenta, tokHoy: a.tokHoy, cacheHoy: a.cacheHoy || 0,
        porProyecto: a.porProyecto || null, ultimoEvento: a.ultimoEvento || null, ultimoPulso: a.ultimoPulso ? new Date(a.ultimoPulso).toISOString() : null,
        metodo: "tiempo real", ...medirAgente(a, ahora), ...estadoConCarlos(a, ahora), _serie: a.serie || [] });
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
  const deYokup = ((yk && yk.porAgente) || []).filter((a) => {
    const p = persona(a.agente);
    if (personas.has(p)) return false;
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
  const picoRT = picoPulso(conSerie, ahora);
  const proys = proyectosDePulso(docs, ahora);
  return {
    sinDatos: false,
    tokHora: Math.round(tokHora),
    metodo: frescos.length ? "tiempo real" : yk.metodo,
    etiqueta: frescos.length ? (deYokup.length ? "tiempo real + partes Yokup" : "tiempo real") : yk.etiqueta,
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
  };
}
