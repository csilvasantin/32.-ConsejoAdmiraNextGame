/**
 * Lecturas de consumo (% del plan usado) — matemática compartida por /api/consumos/lecturas
 * y por /consumos. GrokBotBox · 09-10-2026.
 *
 * Una lectura: { id, ts (ISO UTC), cuenta, grupo, agente, pct 0-100, tokens|null,
 *                fuente "manual"|"auto", autor, nota, canonica }
 * Canónicas: las de las 00:00 y las 12:00 hora de Madrid (±30 min).
 */
export const ZONA = "Europe/Madrid";
export const VENTANA_CANONICA_MIN = 30;
const H = 3600 * 1000;

/** Hora y minuto en Madrid de un instante. */
export function horaMadrid(ts) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ts));
  const v = (t) => Number((p.find((x) => x.type === t) || {}).value || 0);
  return { h: v("hour"), m: v("minute") };
}

/** ¿Cae a ±30 min de las 00:00 o las 12:00 de Madrid? */
export function esCanonica(ts) {
  const { h, m } = horaMadrid(ts);
  const min = h * 60 + m;
  return [0, 720, 1440].some((c) => Math.abs(min - c) <= VENTANA_CANONICA_MIN);
}

/** Texto corto en Madrid: «09/10 05:44». */
export function fechaMadrid(ts) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(ts)).replace(",", "");
}

export function claveSerie(l) {
  return String(l.cuenta || "") + "·" + String(l.agente || "");
}

const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));

/** Valida y normaliza el cuerpo de un POST. Devuelve { lectura } o { error }. */
export function normalizarLectura(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const txt = (v, max) => String(v ?? "").trim().slice(0, max);
  const cuenta = txt(body.cuenta, 120);
  if (!cuenta) return { error: "falta cuenta (p. ej. csilva@admira.com)" };
  const pct = num(body.pct);
  if (pct === null || !Number.isFinite(pct) || pct < 0 || pct > 100) return { error: "pct debe ser un número entre 0 y 100" };
  let ts = ahora;
  if (body.ts !== undefined && body.ts !== null && body.ts !== "") {
    ts = Date.parse(body.ts);
    if (!Number.isFinite(ts)) return { error: "ts inválido (ISO 8601 con zona, p. ej. 2026-10-09T12:00:00+02:00)" };
    if (ts > ahora + 10 * 60 * 1000) return { error: "ts en el futuro" };
  }
  const fuente = txt(body.fuente || "manual", 10);
  if (!["manual", "auto"].includes(fuente)) return { error: "fuente debe ser manual o auto" };
  const autor = txt(body.autor, 60);
  if (!autor) return { error: "falta autor (quién la registra)" };
  let tokens = null;
  if (body.tokens !== undefined && body.tokens !== null && body.tokens !== "") {
    if (typeof body.tokens === "number" || typeof body.tokens === "string") {
      const t = num(body.tokens);
      if (!Number.isFinite(t) || t < 0) return { error: "tokens inválido" };
      tokens = { total: Math.round(t) };
    } else if (typeof body.tokens === "object") {
      tokens = {};
      for (const k of ["total", "entrada", "salida", "cache"]) {
        if (body.tokens[k] === undefined || body.tokens[k] === null) continue;
        const t = num(body.tokens[k]);
        if (!Number.isFinite(t) || t < 0) return { error: "tokens." + k + " inválido" };
        tokens[k] = Math.round(t);
      }
      if (!Object.keys(tokens).length) tokens = null;
    } else return { error: "tokens inválido" };
  }
  const iso = new Date(ts).toISOString();
  const lectura = {
    id: iso + "·" + cuenta + "·" + txt(body.agente, 40),
    ts: iso,
    cuenta,
    grupo: txt(body.grupo, 40),
    agente: txt(body.agente, 40),
    pct: Math.round(pct * 100) / 100,
    tokens,
    fuente,
    autor,
    nota: txt(body.nota, 200),
    canonica: esCanonica(ts),
  };
  if (/[<>]/.test(lectura.cuenta + lectura.agente + lectura.grupo + lectura.autor)) return { error: "caracteres no permitidos" };
  return { lectura };
}

/** Añade (o sustituye, mismo id) y poda a `diasMax` días y `max` entradas. */
export function anadir(lista, lectura, { diasMax = 120, max = 3000, ahora = Date.now() } = {}) {
  const corte = ahora - diasMax * 24 * H;
  const out = (Array.isArray(lista) ? lista : []).filter((l) => l.id !== lectura.id && Date.parse(l.ts) >= corte);
  out.push(lectura);
  out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return out.slice(-max);
}

/**
 * Resumen de una serie (lecturas de una cuenta·agente, cualquier orden).
 * - deltas: diferencia con la anterior y su ritmo normalizado a 12 h (quema por 12 h).
 *   Si el % baja, el plan se ha renovado: delta marcado como reinicio, no cuenta para el ritmo.
 * - ritmo: %/h desde la primera lectura posterior al último reinicio dentro de las últimas
 *   `ventanaH` horas hasta la última lectura. Con una sola lectura no hay ritmo.
 * - proyección: cuándo llegaría al 100 % a ese ritmo.
 */
export function resumirSerie(lecturas, { ventanaH = 48, ahora = Date.now() } = {}) {
  const ls = [...lecturas].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const deltas = ls.map((l, i) => {
    if (i === 0) return { ...l, delta: null, horas: null, quema12h: null, reinicio: false };
    const prev = ls[i - 1];
    const horas = (Date.parse(l.ts) - Date.parse(prev.ts)) / H;
    const delta = Math.round((l.pct - prev.pct) * 100) / 100;
    const reinicio = delta < 0;
    const quema12h = !reinicio && horas > 0 ? Math.round((delta / horas) * 12 * 100) / 100 : null;
    return { ...l, delta, horas: Math.round(horas * 100) / 100, quema12h, reinicio };
  });
  const ultima = ls[ls.length - 1] || null;
  let ritmoH = null;
  if (ultima && ls.length > 1) {
    const tFin = Date.parse(ultima.ts);
    let ini = ls.length - 1;
    while (ini > 0 && !deltas[ini].reinicio && tFin - Date.parse(ls[ini - 1].ts) <= ventanaH * H) ini--;
    const horas = (tFin - Date.parse(ls[ini].ts)) / H;
    if (horas > 0) ritmoH = (ultima.pct - ls[ini].pct) / horas;
  }
  let horasA100 = null, llega100 = null;
  if (ultima && ritmoH !== null && ritmoH > 0) {
    horasA100 = (100 - ultima.pct) / ritmoH;
    llega100 = new Date(Date.parse(ultima.ts) + horasA100 * H).toISOString();
  }
  const antiguedadH = ultima ? (ahora - Date.parse(ultima.ts)) / H : null;
  return {
    clave: ultima ? claveSerie(ultima) : "",
    cuenta: ultima ? ultima.cuenta : "",
    grupo: ultima ? ultima.grupo : "",
    agente: ultima ? ultima.agente : "",
    ultima,
    pct: ultima ? ultima.pct : null,
    margen: ultima ? Math.round((100 - ultima.pct) * 100) / 100 : null,
    ritmoH: ritmoH === null ? null : Math.round(ritmoH * 10000) / 10000,
    quema12h: ritmoH === null ? null : Math.round(ritmoH * 12 * 100) / 100,
    horasA100: horasA100 === null ? null : Math.round(horasA100 * 10) / 10,
    llega100,
    antiguedadH: antiguedadH === null ? null : Math.round(antiguedadH * 10) / 10,
    vieja: antiguedadH !== null && antiguedadH > 36,
    deltas,
  };
}

/** Agrupa por cuenta·agente y resume cada serie. */
export function resumirTodo(lecturas, opts = {}) {
  const grupos = new Map();
  for (const l of lecturas || []) {
    const k = claveSerie(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  return [...grupos.values()].map((g) => resumirSerie(g, opts)).sort((a, b) => a.clave.localeCompare(b.clave));
}

/**
 * Quién tiene más margen para coger trabajo: mayor margen ajustado; las lecturas viejas (>36 h)
 * van detrás de las frescas. Devuelve { serie, texto } o null.
 */
export function recomendar(series) {
  const validas = (series || []).filter((s) => s.ultima && s.pct < 100);
  if (!validas.length) return null;
  const orden = [...validas].sort((a, b) => (a.vieja - b.vieja) || (b.margen - a.margen) || ((a.ritmoH ?? 0) - (b.ritmoH ?? 0)));
  const s = orden[0];
  const nombre = (s.agente ? s.agente + " · " : "") + s.cuenta;
  const ritmo = s.quema12h === null ? "sin ritmo todavía (falta una segunda lectura)" : "quema " + fmtPct(s.quema12h) + " cada 12 h";
  const fin = s.llega100 ? ", llegaría al 100 % el " + fechaMadrid(s.llega100) + " (Madrid)" : "";
  const aviso = s.vieja ? " Ojo: su última lectura tiene más de 36 h." : "";
  return { serie: s.clave, texto: "Más margen: " + nombre + " — " + fmtPct(s.pct) + " usado, " + ritmo + fin + ". Que coja la siguiente carga." + aviso };
}

export function fmtPct(x) {
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return "—";
  return String(Math.round(Number(x) * 100) / 100).replace(".", ",") + " %";
}
