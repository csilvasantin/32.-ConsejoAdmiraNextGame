/**
 * Lecturas de consumo (% del plan usado) — matemática compartida por /api/consumos/lecturas
 * y por /consumos. GrokBotBox · 09-10-2026.
 *
 * Una lectura: { id, ts (ISO UTC), cuenta, grupo, agente, pct 0-100, tokens|null,
 *                fuente "manual"|"auto", autor, nota, canonica }
 * Canónicas: las de las 00:00 y las 12:00 hora de Madrid (±30 min).
 * r27 (Cursor Pro): una lectura puede ser SOLO DE TOKENS (pct null + tokens): Cursor Pro no publica un % del plan, así
 * que fleet/cursor-uso.py anota a las 00:00 y 12:00 los tokens del bloque de 12 h que acaba (re-escribe la misma lectura
 * — mismo id — cuando el CSV trae más datos). No entran en las series de % (ni margen, ni ritmo, ni recomendación):
 * van aparte en cuenta.tokens.
 */
export const ZONA = "Europe/Madrid";
export const VENTANA_CANONICA_MIN = 30;
const H = 3600 * 1000;

/** «vie 9 oct 12:00» en Madrid. */
export function diaHoraMadrid(ts) {
  const p = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts));
  const v = (t) => ((p.find((x) => x.type === t) || {}).value || "").replace(".", "");
  return v("weekday") + " " + v("day") + " " + v("month") + " " + v("hour") + ":" + v("minute");
}

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

/* ───────── r25 (10-10-2026) · lecturas «web-uso»: la pantalla de uso del plan (claude.ai/settings/usage,
   chatgpt.com/codex/settings/usage) o Ajustes → Uso de la app, leída por un navegador (rutina horaria o 00/12)
   o a mano de una captura. Una sola POST lleva todo:
   uso: { plan, url,
          sesion:  { pct, reset },                 límite de 5 h
          semana:  { pct, reset },                 límite semanal (= pct de la serie principal)
          extras:  [{ nombre, pct, reset }],       p. ej. «Fable esta semana»
          reiniciosGratis: [{ vence, alcance }],   «Restablecer gratis» / «Free full resets» (vence ISO o AAAA-MM-DD)
          creditos: { restante, total, unidad, vence } }
   ───────── */
export const FUENTES = ["manual", "auto", "web-uso"];
export const VIEJA_H = 6; // r25 (Carlos): más de 6 h → «dato de hace X h», nunca en silencio

function fechaUso(v, campo) {
  if (v === undefined || v === null || v === "") return { v: null };
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { v: s }; // solo día (la pantalla no da hora)
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return { error: campo + " inválido (ISO 8601 con zona o AAAA-MM-DD)" };
  return { v: new Date(t).toISOString() };
}

/** Valida el bloque `uso` de una lectura web-uso. Devuelve { uso } o { error }. */
export function normalizarUso(u) {
  if (!u || typeof u !== "object" || Array.isArray(u)) return { error: "uso debe ser un objeto" };
  const txt = (v, max) => String(v ?? "").trim().slice(0, max);
  const out = {};
  if (u.plan) out.plan = txt(u.plan, 60);
  if (u.url) { const url = txt(u.url, 160); if (!/^(https:\/\/(claude\.ai|chatgpt\.com)\/|app:)/.test(url)) return { error: "uso.url: solo https://claude.ai/…, https://chatgpt.com/… o app:<pantalla>" }; out.url = url; }
  const limite = (x, campo) => {
    if (x === undefined || x === null) return { v: null };
    if (typeof x !== "object") return { error: campo + " debe ser { pct, reset }" };
    const p = num(x.pct);
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100)) return { error: campo + ".pct entre 0 y 100" };
    const r = fechaUso(x.reset, campo + ".reset");
    if (r.error) return r;
    const o = { pct: p === null ? null : Math.round(p * 100) / 100, reset: r.v };
    if (x.nombre) o.nombre = txt(x.nombre, 50);
    return { v: o };
  };
  for (const k of ["sesion", "semana"]) { const r = limite(u[k], "uso." + k); if (r.error) return { error: r.error }; if (r.v) out[k] = r.v; }
  if (u.extras !== undefined && u.extras !== null) {
    if (!Array.isArray(u.extras)) return { error: "uso.extras debe ser una lista" };
    out.extras = [];
    for (const [i, x] of u.extras.slice(0, 4).entries()) { const r = limite(x, "uso.extras[" + i + "]"); if (r.error) return { error: r.error }; if (r.v) out.extras.push(r.v); }
  }
  if (u.reiniciosGratis !== undefined && u.reiniciosGratis !== null) {
    if (!Array.isArray(u.reiniciosGratis)) return { error: "uso.reiniciosGratis debe ser una lista de { vence, alcance }" };
    out.reiniciosGratis = [];
    for (const [i, x] of u.reiniciosGratis.slice(0, 8).entries()) {
      const r = fechaUso(x && x.vence, "uso.reiniciosGratis[" + i + "].vence");
      if (r.error) return { error: r.error };
      out.reiniciosGratis.push({ vence: r.v, ...(x && x.alcance ? { alcance: txt(x.alcance, 40) } : {}) });
    }
    out.reiniciosGratis.sort((a, b) => String(a.vence || "9").localeCompare(String(b.vence || "9")));
  }
  if (u.creditos !== undefined && u.creditos !== null) {
    const c = u.creditos;
    if (typeof c !== "object") return { error: "uso.creditos debe ser { restante, total, unidad, vence }" };
    const rest = num(c.restante), tot = num(c.total);
    if ((rest !== null && !Number.isFinite(rest)) || (tot !== null && !Number.isFinite(tot))) return { error: "uso.creditos inválido" };
    const v = fechaUso(c.vence, "uso.creditos.vence");
    if (v.error) return { error: v.error };
    out.creditos = { restante: rest, total: tot, unidad: txt(c.unidad || "", 20), vence: v.v };
  }
  if (/[<>]/.test(JSON.stringify(out))) return { error: "caracteres no permitidos en uso" };
  return { uso: out };
}

/**
 * Una POST web-uso → las lecturas que guarda: la principal (semanal, con `uso`) y, si la tarjeta tiene medidor
 * secundario y la pantalla da la sesión de 5 h, otra lectura de esa serie con el mismo instante (para la gráfica).
 */
export function expandirLectura(l) {
  const out = [l];
  const c = CUENTAS.find((x) => x.cuenta === l.cuenta);
  if (c && c.secundario && l.uso && l.uso.sesion && l.uso.sesion.pct !== null && l.agente !== c.secundario) {
    out.push({ ...l, id: l.ts + "·" + l.cuenta + "·" + c.secundario, agente: c.secundario, pct: l.uso.sesion.pct, reset: /T/.test(l.uso.sesion.reset || "") ? l.uso.sesion.reset : null, uso: undefined });
    delete out[1].uso;
  }
  return out;
}

/** Valida y normaliza el cuerpo de un POST. Devuelve { lectura } o { error }. */
export function normalizarLectura(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const txt = (v, max) => String(v ?? "").trim().slice(0, max);
  // r25 (web-uso): la cuenta puede venir por su id de tarjeta («neo-claude», «trinity-codex»…).
  const porId = CUENTAS.find((c) => c.id === txt(body.cuenta, 120));
  const cuenta = porId ? porId.cuenta : txt(body.cuenta, 120);
  if (!cuenta) return { error: "falta cuenta (p. ej. csilva@admira.com)" };
  let uso = null;
  if (body.uso !== undefined && body.uso !== null) {
    const u = normalizarUso(body.uso);
    if (u.error) return { error: u.error };
    uso = u.uso;
  }
  // Una lectura web-uso trae el % semanal dentro de uso.semana: es el pct de la serie principal.
  if ((body.pct === undefined || body.pct === null || body.pct === "") && uso && uso.semana && uso.semana.pct !== null) body = { ...body, pct: uso.semana.pct, reset: body.reset || uso.semana.reset };
  const tarjeta = porId || CUENTAS.find((c) => c.cuenta === cuenta || (c.alias || []).includes(cuenta));
  if (!txt(body.agente, 40) && tarjeta && tarjeta.principal) body = { ...body, agente: tarjeta.principal };
  const pct = num(body.pct);
  const hayTokens = body.tokens !== undefined && body.tokens !== null && body.tokens !== "";
  if (pct === null && !hayTokens) return { error: "pct debe ser un número entre 0 y 100 (o manda tokens para una lectura solo de tokens)" };
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return { error: "pct debe ser un número entre 0 y 100" };
  let ts = ahora;
  if (body.ts !== undefined && body.ts !== null && body.ts !== "") {
    ts = Date.parse(body.ts);
    if (!Number.isFinite(ts)) return { error: "ts inválido (ISO 8601 con zona, p. ej. 2026-10-09T12:00:00+02:00)" };
    if (ts > ahora + 10 * 60 * 1000) return { error: "ts en el futuro" };
  }
  const fuente = txt(body.fuente || "manual", 10);
  if (!FUENTES.includes(fuente)) return { error: "fuente debe ser " + FUENTES.join(", ") };
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
  let reset = null;
  if (body.reset !== undefined && body.reset !== null && body.reset !== "") {
    const r = Date.parse(body.reset);
    if (!Number.isFinite(r)) return { error: "reset inválido (ISO 8601 con zona, p. ej. 2026-10-15T22:58:00+02:00)" };
    reset = new Date(r).toISOString();
  }
  const iso = new Date(ts).toISOString();
  const lectura = {
    id: iso + "·" + cuenta + "·" + txt(body.agente, 40),
    ts: iso,
    cuenta,
    grupo: txt(body.grupo, 40),
    agente: txt(body.agente, 40),
    pct: pct === null ? null : Math.round(pct * 100) / 100,
    tokens,
    fuente,
    autor,
    nota: txt(body.nota, 300),
    reset,
    canonica: esCanonica(ts),
    ...(uso ? { uso } : {}),
  };
  if (/[<>]/.test(lectura.cuenta + lectura.agente + lectura.grupo + lectura.autor)) return { error: "caracteres no permitidos" };
  if (pct === null && !tokens) return { error: "una lectura sin pct necesita tokens" };
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
export const esDeTokens = (l) => !!l && (l.pct === null || l.pct === undefined);
export function resumirTodo(lecturas, opts = {}) {
  const grupos = new Map();
  for (const l of lecturas || []) {
    if (esDeTokens(l)) continue; // r27: las lecturas solo de tokens no son una serie de %
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

/* ───────── Entrega 2 (09-10-2026): una tarjeta por cuenta, reset semanal, bloques de 12 h, reparto ───────── */

/** Cuenta de un agente con su medidor semanal fijo: «Neo · Claude Code» → etiqueta «Neo · Claude Code (Claude Max de Neo, no GrokBot)». */
export function agente(id, nombre, cuenta, plan, proveedor, principal, { secundario = null, resetSemanal = null, consejeros = [], email = null } = {}) {
  const quien = nombre.split(" · ")[0];
  // Correo de la cuenta (09-10-2026): el de la opción o el que va entre paréntesis en el plan / la cuenta.
  const mail = email || ((String(plan) + " " + String(cuenta)).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [null])[0];
  return { id, nombre, cuenta, plan, proveedor, principal, secundario, resetSemanal, consejeros, email: mail,
    etiqueta: nombre + " (" + plan.replace(/\s*\(.*\)$/, "").replace(/\s+\d+x?$/, "") + " de " + quien + (mail ? ", " + mail : "") + ", no GrokBot)" };
}

/** Las cuentas del Consejo. `personas`: cómo firman los consejeros sus partes de tokens en Yokup. */
export const CUENTAS = [
  { id: "leyendas", nombre: "Leyendas", cuenta: "csilva@admira.com", plan: "SuperGrok Heavy",
    consejeros: [["Jobs", ["Jobs", "Steve Jobs"]], ["Wozniak", ["Wozniak", "Woz", "Steve Wozniak"]], ["Lucas", ["Lucas", "George Lucas"]], ["Walt", ["Disney", "Walt", "Walt Disney"]]] },
  { id: "coetaneos", nombre: "Coetáneos", cuenta: "csilvasantin@gmail.com", plan: "SuperGrok",
    consejeros: [["Elon / Merovingio", ["Musk", "Elon", "Elon Musk", "Merovingio"]], ["Jensen / Cypher", ["Huang", "Jensen", "Jensen Huang", "Cypher"]]],
    pista: "Última conocida por Carlos: 1 % el 4 de octubre (no está guardada como lectura)." },
  /* Cuentas de agentes fuera de Grok (09-10-2026, GrokBotBox): una línea por cuenta con agente().
     Manda siempre el medidor `principal` (el semanal); el `secundario` (p. ej. la sesión de 5 h) se
     enseña aparte y no decide semáforo ni proyección. La etiqueta deja claro de quién es y que no es Grok. */
  agente("neo-claude", "Neo · Claude Code", "Neo · Claude Max", "Claude Max 20x (csilva@admira.com)", "Claude", "Claude Code semanal", { secundario: "Claude Code sesión 5 h", resetSemanal: "domingos 15:00 (Madrid)", email: "csilva@admira.com" }),
  // r25 (10-10-2026, lectura web de chatgpt.com/settings/usage): el plan de Trinity es ChatGPT Business del espacio
  // «IoT Incubator» con csilva@admira.com, NO ChatGPT Pro. Las lecturas viejas («Trinity · ChatGPT Pro») siguen por alias.
  { ...agente("trinity-codex", "Trinity · Codex", "Trinity · ChatGPT Business", "ChatGPT Business · IoT Incubator (csilva@admira.com)", "ChatGPT", "Codex semanal", { secundario: "Codex sesión 5 h", email: "csilva@admira.com" }), alias: ["Trinity · ChatGPT Pro"] },
  // Mac mini (confirmado por Carlos en las máquinas, 09-10-2026): Morfeo = Claude y Oráculo = Codex, los dos con csilvasantin@gmail.com.
  agente("morfeo-claude", "Morfeo · Claude", "Morfeo · Claude (csilvasantin@gmail.com)", "Claude (csilvasantin@gmail.com)", "Claude", "Claude Code semanal", { secundario: "Claude Code sesión 5 h" }),
  agente("oraculo-codex", "Oráculo · Codex", "Oráculo · Codex (csilvasantin@gmail.com)", "ChatGPT Pro (csilvasantin@gmail.com)", "ChatGPT", "Codex semanal", { secundario: "Codex sesión 5 h" }),
  // r27: Cursor Pro de Carlos = los consejeros Grok Bot (Jobs, Wozniak, Lucas, Disney) juntos. Sin % del plan: lecturas solo
  // de tokens (fleet/cursor-uso.py, 00:00/12:00) + tokens de hoy del pulso. Smith NO va aquí (Grok CLI, otra cuenta).
  { id: "cursor", nombre: "Grok Bot (Consejo) · Cursor Pro", cuenta: "cursor-pro", plan: "Cursor Pro", consejeros: [], soloTokens: true,
    nota: "Grok Bot (Consejo) · bolsa de GrokBot de csilvasantin (Merovingio, Mouse y los consejeros Jobs, Wozniak, Lucas, Disney…) juntos. Cursor no da un % del plan ni separa por consejero; los tokens salen del export CSV de cursor.com con horas de retraso." },
];

const DIA = 24 * H;

/** Verde <60, ámbar 60-85, rojo >85 o si se agota antes del reset. */
export function semaforo(pct, agotaAntesDelReset = false) {
  if (pct === null || pct === undefined) return "sin";
  if (pct > 85 || agotaAntesDelReset) return "rojo";
  if (pct >= 60) return "ambar";
  return "verde";
}

/** Cupo diario hasta el reset: (100 − pct) / días que faltan. null si no hay reset o ya pasó. */
export function cupoDiario(pct, reset, ahora = Date.now()) {
  if (pct === null || !reset) return null;
  const dias = (Date.parse(reset) - ahora) / DIA;
  if (!(dias > 0)) return null;
  return Math.round(Math.min(100 - pct, (100 - pct) / dias) * 100) / 100;
}

/**
 * Gasto por bloque de 12 h entre lecturas canónicas consecutivas (00:00 / 12:00 de Madrid).
 * Si el % baja hubo reset: el bloque cuenta lo leído desde 0.
 */
export function bloques12h(lecturas) {
  const can = [...lecturas].filter((l) => l.canonica).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const out = [];
  for (let i = 1; i < can.length; i++) {
    const a = can[i - 1], b = can[i];
    const reinicio = b.pct < a.pct;
    out.push({ desde: a.ts, hasta: b.ts, gasto: Math.round((reinicio ? b.pct : b.pct - a.pct) * 100) / 100, reinicio, horas: Math.round(((Date.parse(b.ts) - Date.parse(a.ts)) / H) * 10) / 10 });
  }
  return out;
}

/**
 * Ritmo (%/h) de una serie: con dos o más lecturas desde el último reset, el de resumirSerie;
 * con una sola y un reset semanal conocido, el ritmo medio desde que empezó la semana (reset − 7 días).
 */
export function ritmoSerie(resumen) {
  if (resumen.ritmoH !== null && resumen.ritmoH !== undefined) return { ritmoH: resumen.ritmoH, base: "lecturas" };
  const u = resumen.ultima;
  if (!u || !u.reset) return { ritmoH: null, base: null };
  const inicio = Date.parse(u.reset) - 7 * DIA;
  const horas = (Date.parse(u.ts) - inicio) / H;
  if (!(horas > 0) || horas > 7 * 24) return { ritmoH: null, base: null };
  return { ritmoH: u.pct / horas, base: "semana" };
}

/** Proyección de una serie: cuándo llega al 100 % y si es antes del reset. */
export function proyectar(resumen, ahora = Date.now()) {
  const u = resumen.ultima;
  const { ritmoH, base } = ritmoSerie(resumen);
  const reset = u && u.reset && Date.parse(u.reset) > ahora ? u.reset : null;
  let llega100 = null;
  if (u && ritmoH > 0) llega100 = new Date(Date.parse(u.ts) + ((100 - u.pct) / ritmoH) * H).toISOString();
  const agotaAntes = !!(llega100 && reset && Date.parse(llega100) < Date.parse(reset));
  return { ritmoH: ritmoH === null ? null : Math.round(ritmoH * 10000) / 10000, ritmoDia: ritmoH === null ? null : Math.round(ritmoH * 24 * 100) / 100, base, llega100, reset, agotaAntes,
    cupoDia: u ? cupoDiario(u.pct, reset, ahora) : null, texto: agotaAntes ? "se agota " + diaHoraMadrid(llega100) : null };
}

/** Partes de tokens de Yokup (kind consumo) → tokens por consejero de una cuenta en la ventana. */
export function repartir(cuenta, partes, pct, { desde, hasta = Date.now() } = {}) {
  if (!cuenta.consejeros.length) return { estado: "no aplica", filas: [] };
  if (!Array.isArray(partes)) return { estado: "pendiente de partes de tokens", motivo: "no se pudieron leer los partes de Yokup", filas: [] };
  const norm = (x) => String(x || "").toLowerCase().trim();
  const tokens = new Map(cuenta.consejeros.map(([n]) => [n, 0]));
  let usados = 0;
  for (const p of partes) {
    if (!p || p.kind !== "consumo") continue;
    const d = p.datos && typeof p.datos === "object" ? p.datos : {};
    const t = Number(p.last_at_ms || p.last_at || 0);
    if (!(t >= desde && t <= hasta)) continue;
    const quien = norm(d.persona);
    const c = cuenta.consejeros.find(([, alias]) => alias.some((a) => norm(a) === quien));
    if (!c || !(Number(d.total) > 0)) continue;
    tokens.set(c[0], tokens.get(c[0]) + Number(d.total));
    usados++;
  }
  const suma = [...tokens.values()].reduce((a, b) => a + b, 0);
  if (!suma) return { estado: "pendiente de partes de tokens", motivo: "ningún consejero de la cuenta ha declarado tokens en Yokup en esta semana", filas: cuenta.consejeros.map(([n]) => ({ consejero: n, tokens: 0, cuota: null, pct: null })) };
  return { estado: "ok", partes: usados, filas: cuenta.consejeros.map(([n]) => {
    const tk = tokens.get(n), cuota = tk / suma;
    return { consejero: n, tokens: tk, cuota: Math.round(cuota * 1000) / 10, pct: pct === null ? null : Math.round(cuota * pct * 100) / 100 };
  }) };
}

/** Una tarjeta por cuenta: la serie que manda es la de % más alto (el límite que antes ata). */
export function resumirCuentas(lecturas, partes, { ahora = Date.now() } = {}) {
  return CUENTAS.map((c) => {
    const alias = c.alias || [];
    const propias = (lecturas || []).filter((l) => l.cuenta === c.cuenta || alias.includes(l.cuenta)).map((l) => (l.cuenta === c.cuenta ? l : { ...l, cuenta: c.cuenta }));
    const deTokens = propias.filter(esDeTokens).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const series = resumirTodo(propias, { ahora }).map((s) => ({ ...s, proy: proyectar(s, ahora), bloques: bloques12h(s.deltas) }));
    const fija = c.principal ? series.find((s) => s.agente === c.principal) || null : null;
    const manda = c.principal ? fija : series.length ? [...series].sort((a, b) => b.pct - a.pct || Date.parse(b.ultima.ts) - Date.parse(a.ultima.ts))[0] : null;
    const pct = manda ? manda.pct : null;
    const agota = c.principal ? !!(manda && manda.proy.agotaAntes) : series.some((s) => s.proy.agotaAntes);
    const sec = c.secundario ? series.find((s) => s.agente === c.secundario) || null : null;
    const uso = resumirUso(propias, ahora);
    const tsManda = manda ? Date.parse(manda.ultima.ts) : null;
    const edadH = tsManda === null ? null : Math.round(((ahora - tsManda) / H) * 10) / 10;
    const desde = manda && manda.proy.reset ? Date.parse(manda.proy.reset) - 7 * DIA : ahora - 7 * DIA;
    return {
      id: c.id, nombre: c.nombre, cuenta: c.cuenta, plan: c.plan, consejeros: c.consejeros.map(([n]) => n), pista: c.pista || null,
      pct, margen: pct === null ? null : Math.round((100 - pct) * 100) / 100, manda: manda ? manda.agente || manda.cuenta : null,
      semaforo: semaforo(pct, agota), reset: manda ? manda.proy.reset : null, cupoDia: manda ? manda.proy.cupoDia : null,
      proyeccion: manda ? manda.proy : null, agotaAntes: agota,
      ts: manda ? manda.ultima.ts : null, fuente: manda ? manda.ultima.fuente : null, edadH, vieja: edadH !== null && edadH > VIEJA_H,
      edadTexto: edadH !== null && edadH > VIEJA_H ? textoEdad(edadH) : null,
      ...(uso ? { uso } : {}),
      series: series.map(({ deltas, ...s }) => ({ ...s, lecturas: deltas })),
      reparto: repartir(c, partes, pct, { desde, hasta: ahora }),
      ...(deTokens.length || c.soloTokens ? { tokens: resumirTokens(deTokens), nota: c.nota || null } : {}),
      ...(c.proveedor ? { proveedor: c.proveedor, etiqueta: c.etiqueta, email: c.email || null, resetSemanal: c.resetSemanal || null,
        secundario: c.secundario ? { agente: c.secundario, pct: sec ? sec.pct : null, reset: sec ? sec.ultima.reset || null : null, ts: sec ? sec.ultima.ts : null } : null } : {}),
    };
  });
}

/** «dato de hace 26 h» / «dato de hace 2 días». */
export function textoEdad(h) {
  if (h === null || h === undefined) return null;
  return "dato de hace " + (h >= 48 ? Math.floor(h / 24) + " días" : Math.round(h) + " h");
}

/** r25: la lectura con `uso` más reciente de una cuenta, con su edad y los reinicios gratis que no han vencido. */
export function resumirUso(lecturas, ahora = Date.now()) {
  const u = [...(lecturas || [])].filter((l) => l.uso).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
  if (!u) return null;
  const finDia = (v) => (/T/.test(v) ? Date.parse(v) : Date.parse(v + "T23:59:59+01:00"));
  const reinicios = (u.uso.reiniciosGratis || []).filter((r) => !r.vence || finDia(r.vence) > ahora);
  const edadH = Math.round(((ahora - Date.parse(u.ts)) / H) * 10) / 10;
  // Los límites cuyo reset ya pasó desde la lectura se dan por renovados (0 %), marcados como «renovado».
  const vivo = (x) => (x && x.reset && /T/.test(x.reset) && Date.parse(x.reset) <= ahora ? { ...x, pct: 0, renovado: true } : x);
  return { ...u.uso, sesion: vivo(u.uso.sesion) || null, semana: vivo(u.uso.semana) || null, extras: (u.uso.extras || []).map(vivo),
    reiniciosGratis: reinicios, ts: u.ts, fuente: u.fuente, autor: u.autor, nota: u.nota, edadH, vieja: edadH > VIEJA_H, edadTexto: edadH > VIEJA_H ? textoEdad(edadH) : null };
}

/** Texto de la insignia de reinicios gratis: «Reinicio gratis disponible · vence 22 oct» / «3 reinicios gratis · el primero vence 22 oct». */
export function textoReinicios(lista) {
  const l = lista || [];
  if (!l.length) return null;
  const v = l[0].vence;
  const dia = v ? new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "numeric", month: "short" }).format(new Date(/T/.test(v) ? v : v + "T12:00:00Z")).replace(".", "") : null;
  if (l.length === 1) return "Reinicio gratis disponible" + (dia ? " · vence " + dia : "");
  return l.length + " reinicios gratis" + (dia ? " · el primero vence " + dia : "");
}

/** r27: lecturas solo de tokens de una cuenta → { ultima, bloques:[{ts, total, entrada, salida, cache, canonica, nota}] }. */
export function resumirTokens(lecturas) {
  const tot = (t) => (t ? (t.total ?? (t.entrada || 0) + (t.salida || 0)) : 0);
  const bloques = (lecturas || []).filter((l) => l.tokens).map((l) => ({ ts: l.ts, total: tot(l.tokens), entrada: l.tokens.entrada ?? null, salida: l.tokens.salida ?? null, cache: l.tokens.cache ?? null, canonica: !!l.canonica, agente: l.agente || "", nota: l.nota || "" }));
  return { ultima: bloques.length ? bloques[bloques.length - 1] : null, bloques: bloques.slice(-28) };
}

/** Ranking por margen y la línea de recomendación de arriba. */
export function recomendarCuentas(cuentas) {
  const con = cuentas.filter((c) => c.pct !== null).sort((a, b) => (a.semaforo === "rojo") - (b.semaforo === "rojo") || b.margen - a.margen);
  const sin = cuentas.filter((c) => c.pct === null);
  // r37 (Carlos): el ranking va estrictamente por margen de mayor a menor (las rojas ya no bajan al final: el rojo se ve en
  // su punto); la recomendación de arriba sigue saltándose las rojas (con[0] = la mejor que no va en rojo).
  const porMargen = [...con].sort((a, b) => b.margen - a.margen);
  const ranking = [...porMargen, ...sin].map((c, i) => ({ puesto: i + 1, id: c.id, nombre: c.etiqueta || c.nombre, margen: c.margen, semaforo: c.semaforo, ...(c.proveedor ? { proveedor: c.proveedor } : {}) }));
  const quien = (c) => (c.etiqueta ? c.etiqueta : c.nombre.toLowerCase());
  let texto;
  const cupo = (c) => (c.cupoDia !== null ? " (" + fmtPct(c.cupoDia) + " al día hasta el reset)" : "");
  if (!con.length) texto = "Sin lecturas: anota una por cuenta para poder repartir el trabajo.";
  else {
    const top = con[0];
    texto = (top.semaforo === "rojo" ? "Todas las cuentas con lectura van justas. " : "Mover encargos pesados a " + quien(top) + ": les sobra " + fmtPct(top.margen) + cupo(top) + ".");
    const rojas = con.filter((c) => c.semaforo === "rojo").map((c) => (c.etiqueta || c.nombre) + (c.proyeccion && c.proyeccion.texto ? " (" + c.proyeccion.texto + ")" : ""));
    if (rojas.length) texto += " Frenar " + rojas.join(", ") + ".";
    if (sin.length) texto += " Sin lectura: " + sin.map((c) => c.nombre).join(", ") + ".";
  }
  return { texto, ranking };
}
