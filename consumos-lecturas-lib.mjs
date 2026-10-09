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
    pct: Math.round(pct * 100) / 100,
    tokens,
    fuente,
    autor,
    nota: txt(body.nota, 300),
    reset,
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

/* ───────── Entrega 2 (09-10-2026): una tarjeta por cuenta, reset semanal, bloques de 12 h, reparto ───────── */

/** Las cuentas del Consejo. `personas`: cómo firman los consejeros sus partes de tokens en Yokup. */
export const CUENTAS = [
  { id: "leyendas", nombre: "Leyendas", cuenta: "csilva@admira.com", plan: "SuperGrok Heavy",
    consejeros: [["Jobs", ["Jobs", "Steve Jobs"]], ["Wozniak", ["Wozniak", "Woz", "Steve Wozniak"]], ["Lucas", ["Lucas", "George Lucas"]], ["Walt", ["Disney", "Walt", "Walt Disney"]]] },
  { id: "coetaneos", nombre: "Coetáneos", cuenta: "csilvasantin@gmail.com", plan: "SuperGrok",
    consejeros: [["Elon / Merovingio", ["Musk", "Elon", "Elon Musk", "Merovingio"]], ["Jensen / Cypher", ["Huang", "Jensen", "Jensen Huang", "Cypher"]]],
    pista: "Última conocida por Carlos: 1 % el 4 de octubre (no está guardada como lectura)." },
  { id: "cursor", nombre: "Cursor Pro", cuenta: "cursor-pro", plan: "Cursor Pro", consejeros: [] },
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
    const propias = (lecturas || []).filter((l) => l.cuenta === c.cuenta);
    const series = resumirTodo(propias, { ahora }).map((s) => ({ ...s, proy: proyectar(s, ahora), bloques: bloques12h(s.deltas) }));
    const manda = series.length ? [...series].sort((a, b) => b.pct - a.pct || Date.parse(b.ultima.ts) - Date.parse(a.ultima.ts))[0] : null;
    const pct = manda ? manda.pct : null;
    const agota = series.some((s) => s.proy.agotaAntes);
    const desde = manda && manda.proy.reset ? Date.parse(manda.proy.reset) - 7 * DIA : ahora - 7 * DIA;
    return {
      id: c.id, nombre: c.nombre, cuenta: c.cuenta, plan: c.plan, consejeros: c.consejeros.map(([n]) => n), pista: c.pista || null,
      pct, margen: pct === null ? null : Math.round((100 - pct) * 100) / 100, manda: manda ? manda.agente || manda.cuenta : null,
      semaforo: semaforo(pct, agota), reset: manda ? manda.proy.reset : null, cupoDia: manda ? manda.proy.cupoDia : null,
      proyeccion: manda ? manda.proy : null, agotaAntes: agota,
      series: series.map(({ deltas, ...s }) => ({ ...s, lecturas: deltas })),
      reparto: repartir(c, partes, pct, { desde, hasta: ahora }),
    };
  });
}

/** Ranking por margen y la línea de recomendación de arriba. */
export function recomendarCuentas(cuentas) {
  const con = cuentas.filter((c) => c.pct !== null).sort((a, b) => (a.semaforo === "rojo") - (b.semaforo === "rojo") || b.margen - a.margen);
  const sin = cuentas.filter((c) => c.pct === null);
  const ranking = [...con, ...sin].map((c, i) => ({ puesto: i + 1, id: c.id, nombre: c.nombre, margen: c.margen, semaforo: c.semaforo }));
  let texto;
  const cupo = (c) => (c.cupoDia !== null ? " (" + fmtPct(c.cupoDia) + " al día hasta el reset)" : "");
  if (!con.length) texto = "Sin lecturas: anota una por cuenta para poder repartir el trabajo.";
  else {
    const top = con[0];
    texto = (top.semaforo === "rojo" ? "Todas las cuentas con lectura van justas. " : "Mover encargos pesados a " + top.nombre.toLowerCase() + ": les sobra " + fmtPct(top.margen) + cupo(top) + ".");
    const rojas = con.filter((c) => c.semaforo === "rojo").map((c) => c.nombre + (c.proyeccion && c.proyeccion.texto ? " (" + c.proyeccion.texto + ")" : ""));
    if (rojas.length) texto += " Frenar " + rojas.join(", ") + ".";
    if (sin.length) texto += " Sin lectura: " + sin.map((c) => c.nombre).join(", ") + ".";
  }
  return { texto, ranking };
}
