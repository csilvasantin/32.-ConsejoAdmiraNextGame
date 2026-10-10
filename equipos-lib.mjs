/**
 * Equipos (GrokBotBox, 10-10-2026 · regla de Carlos: dos equipos, uno por cuenta). Funciones PURAS: sin red ni KV
 * (los datos los trae functions/api/equipos.js). Config en equipos-config.mjs.
 *
 * - quién lo lleva hoy: lo que se fijó por POST para la fecha de hoy (Madrid); si no, la semilla HOY_INICIAL si es hoy;
 *   si no, «sin fijar» (cada equipo con su orquestador). El orquestador cede al respaldo mientras no tenga latido.
 * - presupuesto del día por cuenta = margen al empezar el día (lectura de las 00:00) ÷ días hasta el reset.
 *   Gasto de hoy = % de la última lectura − % de la de las 00:00 (si bajó, hubo reset: cuenta lo leído desde 0).
 *   Sin lectura desde las 00:00 no hay gasto medido: se dice, y como mucho se da la previsión al ritmo medio.
 *   Sin fecha de reset no hay presupuesto: se dice, no se inventa.
 */
import { EQUIPOS, NOMBRE, ALIAS_EQUIPO, HOY_INICIAL } from "./equipos-config.mjs";
import { PERSONAS } from "./orquestar-config.mjs";
import { inicioDiaMadrid, tokPorLinea } from "./consumos-lineas-lib.mjs";
import { ultimoLatido, LATIDO_VIVO_S, VENTANA_ENCARGO_S } from "./orquestar-lib.mjs";

const DIA = 24 * 3600 * 1000;
const VENTANA_00 = 30 * 60 * 1000; // la lectura «de las 00:00» puede caer hasta las 00:30
export const ESTADOS_ACTIVOS = new Set(["pending", "ack", "in_progress"]);
const plano = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const nombre = (p) => NOMBRE[p] || p;
export const miembros = (eq) => [...eq.consejeros, ...eq.agentes];

/** «admira.live», «AdmiraNeXT», «live»… → id de equipo, o null. */
export function idEquipo(x) {
  const k = plano(x).replace(/^equipo\s+/, "");
  return ALIAS_EQUIPO[k] || ALIAS_EQUIPO["equipo " + k] || (EQUIPOS.find((e) => e.id === k) ? k : null);
}
export const equipo = (id, equipos = EQUIPOS) => equipos.find((e) => e.id === idEquipo(id)) || null;

/** Persona (o cualquiera de sus alias: «NeoMBP16», «Elon», «Oraculo») → nombre canónico de PERSONAS, o null. */
export function canonica(x, personas = PERSONAS) {
  const k = plano(x);
  if (!k) return null;
  for (const p of personas) if (plano(p.persona) === k || (p.alias || []).some((a) => plano(a) === k)) return p.persona;
  for (const [p, n] of Object.entries(NOMBRE)) if (plano(n) === k) return p;
  return null;
}

/** Equipo de una persona (por alias). null si no está en ninguno (p. ej. Smith). */
export function equipoDePersona(x, equipos = EQUIPOS) {
  const p = canonica(x);
  return (p && equipos.find((e) => miembros(e).includes(p))) || null;
}

/** Personas de PERSONAS que puede elegir el orquestador para un equipo: miembro Y con una cuenta del equipo. */
export function personasDeEquipo(eq, personas = PERSONAS) {
  if (!eq) return personas;
  const m = new Set(miembros(eq));
  return personas.filter((p) => m.has(p.persona) && p.cuenta && eq.cuentas.includes(p.cuenta));
}

/** Fecha de Madrid «AAAA-MM-DD». */
export function fechaMadrid(ahora = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ahora));
}

/** Valida el POST de /api/equipos/hoy: { carlos: equipo, fecha?: AAAA-MM-DD (hoy por defecto, ±7 días), autor, nota? }. */
export function normalizarHoy(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const carlos = idEquipo(body.carlos || body.equipo || body.lleva);
  if (!carlos) return { error: "carlos debe ser el equipo que lleva Carlos hoy: admiranext | admiralive" };
  const fecha = String(body.fecha || fechaMadrid(ahora)).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha + "T12:00:00Z"))) return { error: "fecha inválida (AAAA-MM-DD)" };
  if (Math.abs(Date.parse(fecha + "T12:00:00Z") - Date.parse(fechaMadrid(ahora) + "T12:00:00Z")) > 7 * DIA) return { error: "fecha fuera de ±7 días" };
  const autor = String(body.autor || "").trim().slice(0, 60);
  if (!autor) return { error: "falta autor (quién lo fija)" };
  const nota = String(body.nota || "").trim().slice(0, 300);
  if (/[<>]/.test(autor + nota)) return { error: "caracteres no permitidos" };
  return { dia: { fecha, carlos, autor, nota, ts: new Date(ahora).toISOString() } };
}

/** Añade/sustituye el día en el documento KV { dias: { fecha: dia } } y se queda con los 60 más recientes. */
export function guardarDia(doc, dia) {
  const dias = { ...((doc && doc.dias) || {}), [dia.fecha]: dia };
  const claves = Object.keys(dias).sort().slice(-60);
  return { dias: Object.fromEntries(claves.map((k) => [k, dias[k]])), actualizado: dia.ts };
}

/** ¿Tiene latido (<10 min) el orquestador? (presencia de bot.yokup.com, por alias). */
export function conLatido(persona, presencia, ahora, personas = PERSONAS) {
  const cfg = personas.find((p) => p.persona === persona);
  if (!cfg) return { vivo: false, latido: null };
  const l = ultimoLatido(cfg, presencia || []);
  return { vivo: l !== null && Math.floor(ahora / 1000) - l <= LATIDO_VIVO_S, latido: l === null ? null : new Date(l * 1000).toISOString() };
}

/**
 * Quién lleva hoy cada equipo. → { fecha, fijado:'post'|'inicial'|null, carlos: id|null, autor, nota,
 *   equipos: { id: { lleva, llevaNombre, esCarlos, orquestador, orquestadorVivo, respaldoActivo, motivo } } }
 */
export function quienLlevaHoy({ doc = null, presencia = [], ahora = Date.now(), equipos = EQUIPOS, inicial = HOY_INICIAL } = {}) {
  const fecha = fechaMadrid(ahora);
  const delPost = doc && doc.dias && doc.dias[fecha];
  const dia = delPost || (inicial && inicial.fecha === fecha ? inicial : null);
  const out = {};
  for (const eq of equipos) {
    const vivo = conLatido(eq.orquestador, presencia, ahora);
    const respaldoActivo = !!(eq.respaldo && !vivo.vivo);
    const orq = respaldoActivo ? eq.respaldo : eq.orquestador;
    const orqTxt = respaldoActivo ? nombre(eq.respaldo) + " (respaldo: " + nombre(eq.orquestador) + " sin latido)" : nombre(eq.orquestador);
    const esCarlos = !!(dia && dia.carlos === eq.id);
    out[eq.id] = {
      lleva: esCarlos ? "Carlos" : orq, llevaNombre: esCarlos ? "Carlos" : nombre(orq), esCarlos,
      orquestador: eq.orquestador, orquestadorNombre: nombre(eq.orquestador), orquestadorVivo: vivo.vivo, orquestadorLatido: vivo.latido,
      respaldo: eq.respaldo, respaldoActivo, orquestaHoy: orq,
      motivo: esCarlos ? "Hoy lo lleva Carlos" + (dia.autor && dia.autor !== "Carlos" ? " (fijado por " + dia.autor + ")" : "")
        : dia ? "Carlos lleva el otro equipo: va con su orquestador, " + orqTxt + (eq.id === "admiranext" ? " (Carlos supervisa)" : "")
          : "Sin fijar para hoy: va con su orquestador, " + orqTxt,
    };
  }
  return { fecha, fijado: delPost ? "post" : dia ? "inicial" : null, carlos: dia ? dia.carlos : null, autor: dia ? dia.autor || null : null, nota: dia ? dia.nota || null : null, equipos: out };
}

/** Gasto de hoy y presupuesto del día de UNA cuenta (tarjeta de resumirCuentas + lecturas crudas). */
export function presupuestoCuenta(c, lecturas, ahora = Date.now()) {
  const base = { id: c.id, nombre: c.nombre, cuenta: c.cuenta, serie: c.manda || null, pctAhora: c.pct ?? null };
  if (c.pct === null || c.pct === undefined) return { ...base, estado: "sin-lectura", reset: null, diasReset: null, margen00: null, base00: null, ultima: null,
    cupoDia: null, usadoHoy: null, pctCupo: null, prevision: null, ritmoDia: null, semaforo: "sin", texto: "sin lectura del plan: no se puede calcular" };
  const ini = inicioDiaMadrid(ahora);
  const serie = (lecturas || []).filter((l) => l && l.cuenta === c.cuenta && (l.agente || l.cuenta) === c.manda && l.pct !== null && l.pct !== undefined)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const b0 = [...serie].reverse().find((l) => Date.parse(l.ts) <= ini + VENTANA_00) || null;
  const ult = serie[serie.length - 1] || null;
  const resetIso = (ult && ult.reset) || (b0 && b0.reset) || c.reset || null;
  const reset = resetIso && Date.parse(resetIso) > ini ? resetIso : null;
  const margen0 = b0 ? Math.round((100 - b0.pct) * 100) / 100 : null;
  let cupo = null;
  if (reset && margen0 !== null) cupo = Math.round((margen0 / Math.max(1, (Date.parse(reset) - ini) / DIA)) * 100) / 100;
  const diasReset = reset ? Math.round(((Date.parse(reset) - ahora) / DIA) * 10) / 10 : null;
  let usado = null, medido = false;
  if (b0 && ult && Date.parse(ult.ts) > ini + VENTANA_00) { usado = Math.round((ult.pct >= b0.pct ? ult.pct - b0.pct : ult.pct) * 100) / 100; medido = true; }
  const ritmoDia = c.proyeccion && c.proyeccion.ritmoDia !== null && c.proyeccion.ritmoDia !== undefined ? c.proyeccion.ritmoDia : null;
  const pct = cupo && usado !== null ? Math.round((usado / cupo) * 1000) / 10 : null;
  const prevision = cupo && !medido && ritmoDia !== null ? Math.round((ritmoDia / cupo) * 1000) / 10 : null;
  let texto;
  if (!reset) texto = "fecha de reset desconocida: no hay presupuesto diario";
  else if (margen0 === null) texto = "sin lectura de las 00:00: no se sabe con qué margen empezó el día";
  else if (!medido) texto = "sin lectura desde las 00:00 (última " + horaCorta(ult.ts) + ")" + (prevision !== null ? ": a su ritmo medio gastaría ~" + fmt(prevision) + " % del cupo" : "");
  else texto = fmt(usado) + " de " + fmt(cupo) + " puntos del cupo de hoy";
  return { ...base, estado: medido ? "medido" : !reset ? "sin-reset" : margen0 === null ? "sin-base" : "sin-lectura-hoy",
    reset, diasReset, margen00: margen0, base00: b0 ? b0.ts : null, ultima: ult ? ult.ts : null,
    cupoDia: cupo, usadoHoy: usado, pctCupo: pct, prevision, ritmoDia, semaforo: semaforoCupo(pct), semaforoPrevision: semaforoCupo(prevision), texto };
}

/** Verde < 75 % del cupo del día, amarillo 75-100 %, rojo > 100 %. */
export function semaforoCupo(p) {
  if (p === null || p === undefined) return "sin";
  return p > 100 ? "rojo" : p >= 75 ? "amarillo" : "verde";
}

const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString("es-ES");
const horaCorta = (ts) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts)).replace(".", "");

/**
 * Tokens de hoy de los miembros del equipo, desde el pulso (agentesDePulso). Un pulso de AYER no cuenta para hoy
 * (su tokHoy es el total de ayer). El «Grok Bot (Consejo)» (Cursor Pro, con retraso) va al equipo cuyos consejeros cubre.
 */
export function tokensEquipo(eq, agentes, ahora = Date.now()) {
  const ini = inicioDiaMadrid(ahora), m = new Set(miembros(eq));
  const filas = [], medidos = new Set();
  for (const a of agentes || []) {
    const cubre = Array.isArray(a.cubre) && a.cubre.length ? a.cubre.map((x) => canonica(x) || x) : null;
    const quien = cubre ? (cubre.every((x) => m.has(x)) ? a.agente : null) : (m.has(canonica(a.agente)) ? canonica(a.agente) : null);
    if (!quien) continue;
    (cubre || [quien]).forEach((x) => medidos.add(x));
    const hoy = a.ultimoPulso && Date.parse(a.ultimoPulso) >= ini;
    filas.push({ quien, nombre: cubre ? "Consejo Grok Bot (" + cubre.map(nombre).join(", ") + ")" : nombre(quien), tokHoy: hoy ? Number(a.tokHoy) || 0 : 0,
      nota: !hoy ? "sin pulso hoy" : a.conRetraso ? "Cursor Pro, con retraso" : null, ultimoPulso: a.ultimoPulso || null });
  }
  const sinMedida = miembros(eq).filter((p) => !medidos.has(p)).map(nombre);
  return { total: filas.reduce((s, f) => s + f.tokHoy, 0), filas: filas.sort((a, b) => b.tokHoy - a.tokHoy), sinMedida };
}

/** Líneas de hoy (lineasHoy().porAgente) de los miembros del equipo. */
export function lineasEquipo(eq, porAgente) {
  const m = new Set(miembros(eq));
  const filas = (porAgente || []).filter((x) => m.has(canonica(x.agente))).map((x) => ({ quien: canonica(x.agente), nombre: nombre(canonica(x.agente)), lineas: x.lineas }));
  return { total: filas.reduce((s, f) => s + f.lineas, 0), filas };
}

/** Encargos activos (pending/ack/in_progress de las últimas 48 h) dirigidos a miembros del equipo. */
export function encargosEquipo(eq, bandeja, ahora = Date.now()) {
  const m = new Set(miembros(eq)), ahoraS = Math.floor(ahora / 1000);
  const act = (bandeja || []).filter((e) => e && ESTADOS_ACTIVOS.has(String(e.status)) && m.has(canonica(e.target_persona)) && (!e.ts || ahoraS - Number(e.ts) <= VENTANA_ENCARGO_S));
  const porPersona = {};
  for (const e of act) { const p = nombre(canonica(e.target_persona)); porPersona[p] = (porPersona[p] || 0) + 1; }
  return { total: act.length, enCurso: act.filter((e) => e.status !== "pending").length, pendientes: act.filter((e) => e.status === "pending").length, porPersona, ids: act.map((e) => e.id) };
}

/** Tarjeta completa de un equipo. */
export function tarjetaEquipo(eq, { hoy, cuentas = [], lecturas = [], agentes = [], lineasHoyPorAgente = [], bandeja = null, ahora = Date.now() }) {
  const pres = eq.cuentas.map((id) => cuentas.find((c) => c.id === id)).filter(Boolean).map((c) => presupuestoCuenta(c, lecturas, ahora));
  const conPct = pres.filter((p) => p.pctCupo !== null && p.pctCupo !== undefined);
  const conPrev = pres.filter((p) => p.prevision !== null && p.prevision !== undefined);
  const peor = (l, k) => l.length ? [...l].sort((a, b) => b[k] - a[k])[0] : null;
  const pm = peor(conPct, "pctCupo"), pp = peor(conPrev, "prevision");
  const tok = tokensEquipo(eq, agentes, ahora), lin = lineasEquipo(eq, lineasHoyPorAgente);
  return {
    id: eq.id, nombre: eq.nombre, cuenta: eq.cuenta, maquina: eq.maquina,
    hoy: hoy.equipos[eq.id],
    consejeros: eq.consejeros.map((p) => ({ persona: p, nombre: nombre(p) })), planConsejeros: eq.planConsejeros,
    agentes: eq.agentes.map((p) => ({ persona: p, nombre: nombre(p), plan: (eq.planAgentes || {})[p] || null })),
    tokens: tok, lineas: lin, tokPorLinea: tokPorLinea(tok.total, lin.total),
    presupuesto: {
      cuentas: pres,
      // Cabecera = la cuenta más apretada (los % de planes distintos no se suman). El semáforo solo con gasto MEDIDO;
      // la previsión al ritmo medio va aparte, con su propio color, y nunca se presenta como gasto.
      pctCupo: pm ? pm.pctCupo : null, cuentaPct: pm ? pm.nombre : null, medidas: conPct.length,
      prevision: pp ? pp.prevision : null, cuentaPrevision: pp ? pp.nombre : null, semaforoPrevision: semaforoCupo(pp ? pp.prevision : null),
      semaforo: semaforoCupo(pm ? pm.pctCupo : null),
    },
    encargos: bandeja ? encargosEquipo(eq, bandeja, ahora) : null,
  };
}
