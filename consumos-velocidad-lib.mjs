/**
 * Velocímetro de tokens/hora (GrokBotBox, 09-10-2026) — funciones puras, sin red ni KV.
 *
 * Fuente REAL: los partes de consumo que la flota declara en Yokup (GET api.yokup.com/fleet/consumo?dias=1):
 *  - partes[]: uno por agente y día, datos.total = tokens acumulados del día (se reinicia a medianoche de Madrid).
 *  - serie{ "owner|machine": [{ts, dia, total}] }: las muestras que Yokup guarda (~cada 5 min).
 * Instantánea = { ts, totales: { agente: total_acumulado_del_día } }.
 * Velocidad = tokens sumados entre la instantánea de hace ~60 min y la última / horas entre ambas.
 * Reinicio: si el total de un agente BAJA, es que empezó un día nuevo → el incremento es el total nuevo.
 * Sin dos instantáneas separadas al menos MIN_VENTANA_MIN: «media de hoy» = total de hoy / horas desde las 00:00 Madrid.
 */
export const VENTANA_MIN = 60;
export const MIN_VENTANA_MIN = 15;
export const RETENCION_MS = 26 * 3600 * 1000;
export const INTERVALO_SNAP_MS = 5 * 60 * 1000;
export const ESCALA_MIN = 50e6;
const H = 3600 * 1000;

/** Fecha (AAAA-MM-DD) y hora decimal en Europe/Madrid de un instante. */
export function madrid(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { dia: p.year + "-" + p.month + "-" + p.day, horas: Number(p.hour) + Number(p.minute) / 60 + Number(p.second) / 3600 };
}

/** Incremento entre dos totales acumulados; una bajada es un reinicio (día nuevo) → cuenta el total nuevo. */
export function incremento(prev, cur) {
  if (!Number.isFinite(cur) || cur < 0) return 0;
  if (!Number.isFinite(prev)) return 0; // agente nuevo: sin base, no se inventa nada
  return cur >= prev ? cur - prev : cur;
}

/** Ordena, quita duplicados de ts y poda lo anterior a la retención. */
export function podar(snaps, ahora, retencion = RETENCION_MS) {
  const vistos = new Map();
  for (const s of snaps || []) if (s && Number.isFinite(s.ts) && s.totales && s.ts >= ahora - retencion && s.ts <= ahora + 60000) vistos.set(s.ts, s);
  return [...vistos.values()].sort((a, b) => a.ts - b.ts);
}

/** ¿Toca guardar una instantánea nueva? (como mucho una cada 5 min) */
export function tocaGuardar(snaps, ahora, intervalo = INTERVALO_SNAP_MS) {
  const ult = (snaps || []).reduce((m, s) => Math.max(m, s.ts || 0), 0);
  return ahora - ult >= intervalo;
}

/** La serie de Yokup → instantáneas por cubos de 5 min (arrastrando el último total conocido de cada agente). */
export function serieAInstantaneas(serie, nombreDe = (k) => k) {
  const cubos = new Map();
  for (const [clave, puntos] of Object.entries(serie || {})) {
    const ag = nombreDe(clave);
    for (const p of puntos || []) {
      if (!p || !Number.isFinite(p.ts) || !Number.isFinite(p.total)) continue;
      const c = Math.floor(p.ts / INTERVALO_SNAP_MS) * INTERVALO_SNAP_MS;
      if (!cubos.has(c)) cubos.set(c, { ts: 0, t: {} });
      const cubo = cubos.get(c);
      cubo.t[ag] = p.total;
      cubo.ts = Math.max(cubo.ts, p.ts);
    }
  }
  const out = [];
  const ultimo = {};
  for (const c of [...cubos.keys()].sort((a, b) => a - b)) {
    Object.assign(ultimo, cubos.get(c).t);
    out.push({ ts: cubos.get(c).ts, totales: { ...ultimo } });
  }
  return out;
}

/** Une dos listas de instantáneas por ts (las de Yokup y las propias en KV). */
export function unir(a, b, ahora) {
  const s = podar([...(a || []), ...(b || [])], ahora);
  // Arrastra el último total conocido de cada agente a las instantáneas que no lo traen.
  const ultimo = {};
  return s.map((x) => { Object.assign(ultimo, x.totales); return { ts: x.ts, totales: { ...ultimo } }; });
}

/* Incremento por agente entre la instantánea i-1 y la i. */
function pasos(snaps) {
  const out = [];
  for (let i = 1; i < snaps.length; i++) {
    const d = {};
    for (const [ag, cur] of Object.entries(snaps[i].totales)) d[ag] = incremento(snaps[i - 1].totales[ag], cur);
    out.push(d);
  }
  return out;
}

/** Índice de la instantánea base: la última con ts <= fin - ventana (o la primera si no la hay). */
function base(snaps, fin, ventanaMs) {
  let j = 0;
  for (let k = 0; k < snaps.length; k++) if (snaps[k].ts <= fin - ventanaMs) j = k;
  return j;
}

/** Velocidad en la ventana que acaba en la instantánea `i`. null si la ventana es demasiado corta. */
export function velocidadEn(snaps, i, ventanaMin = VENTANA_MIN, inc = pasos(snaps)) {
  if (i < 1) return null;
  const j = base(snaps.slice(0, i + 1), snaps[i].ts, ventanaMin * 60000);
  const horas = (snaps[i].ts - snaps[j].ts) / H;
  if (j >= i || horas * 60 < MIN_VENTANA_MIN) return null;
  const porAgente = {};
  for (let k = j; k < i; k++) for (const [ag, d] of Object.entries(inc[k])) porAgente[ag] = (porAgente[ag] || 0) + d;
  const total = Object.values(porAgente).reduce((s, x) => s + x, 0);
  return { tokHora: total / horas, ventanaMin: Math.round(horas * 60), porAgente: Object.fromEntries(Object.entries(porAgente).map(([a, t]) => [a, t / horas])) };
}

/** Pico de tok/h (ventanas de 60 min) en las últimas 24 h. */
export function pico24h(snaps, ahora, ventanaMin = VENTANA_MIN) {
  const inc = pasos(snaps);
  let pico = null;
  for (let i = 1; i < snaps.length; i++) {
    if (snaps[i].ts < ahora - 24 * H) continue;
    const v = velocidadEn(snaps, i, ventanaMin, inc);
    if (v && (pico === null || v.tokHora > pico)) pico = v.tokHora;
  }
  return pico;
}

/**
 * Respuesta del velocímetro.
 * hoy: { agente: tokens_acumulados_hoy } (de los partes del día de Madrid). snaps: instantáneas (cualquier orden).
 * Devuelve { tokHora, ventanaMin, metodo, porAgente:[{agente,tokHora,tokHoy}], pico24h, escalaMax, generado }.
 */
export function calcularVelocidad({ snaps, hoy, ahora }) {
  const s = podar(snaps, ahora);
  const hoyT = hoy || {};
  const tokHoyTotal = Object.values(hoyT).reduce((a, x) => a + (Number(x) || 0), 0);
  const v = s.length >= 2 ? velocidadEn(s, s.length - 1) : null;
  // Última muestra demasiado vieja (>30 min): la «última hora» ya no es de ahora.
  const fresca = v && ahora - s[s.length - 1].ts <= 30 * 60000;
  let metodo, tokHora, ventanaMin, rates;
  if (fresca) {
    metodo = "ultima-hora"; tokHora = v.tokHora; ventanaMin = v.ventanaMin; rates = v.porAgente;
  } else {
    const h = Math.max(madrid(ahora).horas, 0.25); // a las 00:05 no dividimos por casi cero
    metodo = "media-hoy"; tokHora = tokHoyTotal / h; ventanaMin = Math.round(madrid(ahora).horas * 60);
    rates = Object.fromEntries(Object.entries(hoyT).map(([a, t]) => [a, (Number(t) || 0) / h]));
  }
  const agentes = new Set([...Object.keys(rates), ...Object.keys(hoyT)]);
  const porAgente = [...agentes].map((agente) => ({ agente, tokHora: Math.round(rates[agente] || 0), tokHoy: Number(hoyT[agente]) || 0 }))
    .sort((a, b) => b.tokHora - a.tokHora || b.tokHoy - a.tokHoy);
  const pico = pico24h(s, ahora);
  const picoR = pico === null ? null : Math.round(Math.max(pico, metodo === "ultima-hora" ? tokHora : 0));
  return {
    tokHora: Math.round(tokHora), ventanaMin, metodo,
    etiqueta: metodo === "ultima-hora" ? "última hora (medido)" : "media de hoy (estimado)",
    porAgente, tokHoy: tokHoyTotal, pico24h: picoR,
    escalaMax: escala(Math.max(picoR || 0, tokHora)),
    instantaneas: s.length, generado: new Date(ahora).toISOString(),
  };
}

/** Escala del dial: 0 → max(50 M, 1,5 × pico), redondeada hacia arriba a un número «bonito». */
export function escala(pico) {
  const bruto = Math.max(ESCALA_MIN, 1.5 * (Number(pico) || 0));
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= bruto) return m * mag;
  return 10 * mag;
}

/** «12,4 M tok/h» */
export function formatoTok(n, en = false) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const f = (x, d) => x.toLocaleString(en ? "en-US" : "es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (n >= 1e9) return f(n / 1e9, 2) + " G";
  if (n >= 1e6) return f(n / 1e6, 1) + " M";
  if (n >= 1e3) return f(n / 1e3, 0) + " k";
  return f(n, 0);
}

/** Partes de Yokup (fleet/consumo) → { hoy:{agente:total}, nombres:{ "owner|machine": agente } } del día de Madrid. */
export function partesDeHoy(d, ahora) {
  const dia = madrid(ahora).dia;
  const hoy = {};
  const nombres = {};
  for (const p of (d && d.partes) || []) {
    const datos = p && p.datos || {};
    const ag = nombreAgente(p.owner, datos);
    nombres[p.owner + "|" + p.machine] = ag;
    if (p.dia === dia && Number.isFinite(datos.total)) hoy[ag] = Math.max(hoy[ag] || 0, datos.total);
  }
  return { hoy, nombres };
}

export function nombreAgente(owner, datos = {}) {
  const persona = datos.persona && datos.persona !== "?" ? datos.persona : (String(owner || "?").startsWith("?") ? "Anónimo" : owner);
  const equipo = datos.equipo || "";
  return persona + (datos.runtime ? " · " + datos.runtime : "") + (equipo && persona === "Anónimo" ? " (" + equipo + ")" : "");
}
