/**
 * win95-presencia-lib.mjs — ¿qué consejeros están en línea en el ICQGram de admira.live/win95?
 *
 * v2 (Carlos, 25-11-2026 20:46: «estáis al lado los 4 y aparecéis fuera de línea, no puede ser»).
 * Los consejeros son Grok Bots que su webhook despierta al escribirles: un latido viejo NO
 * significa que estén apagados. En línea = su canal de despertar funciona, con evidencia:
 *   · respondió en su hilo de admira.live/chat/<persona>, o cerró (done) un encargo de su
 *     bandeja pública de bot.yokup.com, en las últimas 24 h (RESPUESTA_SEG); o
 *   · su latido (mcp.admira.live/consejeros/latido) tiene < 15 min (VIVO_SEG).
 * Fuera de línea, aunque haya evidencia:
 *   · Carlos le escribió desde admira.live y lleva > 10 min sin respuesta (salud «aviso»);
 *   · el último despertar de webhook registrado en su hilo falló (p. ej. «despertar 401») o el
 *     encargo no se entregó, y no ha respondido después.
 * v3 (Carlos, 25-11-2026 21:05: «ES IMPOSIBLE que esté en línea Jensen y no lo esté Elon»). Los
 * consejeros viven en dos cuentas de Grok Bot: LEYENDAS (Jobs, Wozniak, Disney, Lucas) y ACTUALES
 * (Musk, Huang, Murati, Lasseter). La presencia es de la CUENTA y es uniforme dentro de ella:
 *   · en línea si CUALQUIERA de sus consejeros tiene evidencia (respuesta en hilo / encargo cerrado
 *     en 24 h, o latido < 15 min) y la cuenta no está atascada ni con el despertar roto;
 *   · atascada = hay un mensaje de Carlos sin contestar > 10 min a uno de sus consejeros y NINGÚN
 *     consejero de la cuenta ha respondido después de ese mensaje (si otro respondió luego, la cuenta
 *     funciona: el mensaje pendiente se señala en ese consejero, pero no lo saca de línea);
 *   · despertar roto = el último despertar de webhook registrado falló y la cuenta no ha respondido
 *     después.
 * Fuente caída: online:null (desconocido) — la ventana lo pone en gris, nunca en verde.
 * Solo booleanos, horas y códigos: ningún texto de mensaje ni de misión.
 */
import { salud } from "./chat-hilo-lib.mjs";

export const VIVO_SEG = 900;
export const RESPUESTA_SEG = 24 * 3600;
export const CUENTAS = { leyendas: "Leyendas", actuales: "Actuales" };
/** chat:false = sin hilo propio en admira.live/chat/ (no existe la ruta): no se inventa. */
export const CONSEJEROS = [
  { persona: "jobs", latido: "Jobs", nombre: "Steve Jobs", cuenta: "leyendas", chat: true },
  { persona: "wozniak", latido: "Wozniak", nombre: "Steve Wozniak", cuenta: "leyendas", chat: true },
  { persona: "disney", latido: "Disney", nombre: "Walt Disney", cuenta: "leyendas", chat: true },
  { persona: "lucas", latido: "Lucas", nombre: "George Lucas", cuenta: "leyendas", chat: true },
  { persona: "musk", latido: "Musk", nombre: "Elon Musk", cuenta: "actuales", chat: true },
  { persona: "huang", latido: "Huang", nombre: "Jensen Huang", cuenta: "actuales", chat: true },
  { persona: "murati", latido: "Murati", nombre: "Mira Murati", cuenta: "actuales", chat: false },
  { persona: "lasseter", latido: "Lasseter", nombre: "John Lasseter", cuenta: "actuales", chat: false },
];

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const segIso = (ts) => { const ms = Date.parse(ts); return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0; };

/** Señal del latido (s): última escritura (at/desde); «trabajando» vigente cuenta como ahora. */
export function senalLatido(l, ahoraS) {
  if (!l || typeof l !== "object") return 0;
  if (l.modo === "trabajando" && !l.caducado && num(l.hasta) > ahoraS) return ahoraS;
  return Math.max(num(l.at), num(l.desde));
}

/** Última respuesta del consejero en su hilo (s). */
export function senalHilo(turnos, persona) {
  const lista = Array.isArray(turnos) ? turnos : [];
  for (let i = lista.length - 1; i >= 0; i--) { const t = lista[i]; if (t && t.rol === persona) return segIso(t.ts); }
  return 0;
}

/** Último encargo cerrado (done) de su bandeja pública (s). */
export function senalBandeja(items) {
  return (Array.isArray(items) ? items : []).reduce((m, it) => (it && it.status === "done" ? Math.max(m, num(it.done_at)) : m), 0);
}

/**
 * Estado del canal de despertar según el último mensaje de Carlos con rastro de entrega.
 * 'roto' si el webhook devolvió error (despertar 4xx/5xx, «despertar: fallo…») o el encargo no se entregó;
 * 'ok' si «despertar webhook 2xx»; null si no hay rastro. Devuelve también cuándo (s) y el código.
 */
export function despertar(turnos) {
  const lista = Array.isArray(turnos) ? turnos : [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const t = lista[i];
    if (!t || t.rol !== "carlos" || (!t.detalle && !t.entrega)) continue;
    const det = String(t.detalle || ""), cuando = segIso(t.ts);
    if (t.entrega === "error") return { estado: "roto", cuando, codigo: (det.match(/\b(\d{3})\b/) || [])[1] || null };
    const m = det.match(/despertar(?: webhook)? (\d{3})/);
    if (m) return { estado: /^2/.test(m[1]) ? "ok" : "roto", cuando, codigo: m[1] };
    if (/despertar: /.test(det)) return { estado: /fall|error|sin webhook|no registrad|caduc|rechaz|denegad/i.test(det) ? "roto" : "ok", cuando, codigo: null };
    if (t.entrega === "entregado") continue; // entregado sin rastro del despertar: miramos el anterior
  }
  return { estado: null, cuando: 0, codigo: null };
}

/**
 * latido: cuerpo de /consejeros/latido (o null). hilos: { persona: turnos[] | null }.
 * bandejas: { persona: items[] | null } (bandeja pública de bot.yokup.com, sin texto).
 */
export function presencia({ latido, hilos, bandejas, ahoraMs = Date.now(), vivoSeg = VIVO_SEG, respuestaSeg = RESPUESTA_SEG, cupo } = {}) {
  const ahoraS = Math.floor(ahoraMs / 1000);
  const cupoDe = (k) => (cupo && cupo[k]) || { pct: null, motivo: "sin datos" };
  const lat = latido && latido.consejeros && typeof latido.consejeros === "object" ? latido.consejeros : null;
  const h = hilos || {}, b = bandejas || {};
  // 1) Evidencia individual de cada consejero.
  const ind = CONSEJEROS.map((c) => {
    const turnos = h[c.persona], items = b[c.persona];
    const conHilo = Array.isArray(turnos), conBandeja = Array.isArray(items);
    const sl = lat ? senalLatido(lat[c.latido], ahoraS) : 0;
    const sh = conHilo ? senalHilo(turnos, c.persona) : 0;
    const sb = conBandeja ? senalBandeja(items) : 0;
    const resp = Math.max(sh, sb);
    const sa = conHilo ? salud(turnos, c.persona, ahoraMs) : null;
    const pend = sa && sa.estado === "aviso" && sa.pendiente ? segIso(sa.pendiente.desde) : 0;
    const d = conHilo ? despertar(turnos) : { estado: null, cuando: 0, codigo: null };
    const mh = misionesDe(latido, c.latido);
    const inter = intervencionesHoy({ turnos: conHilo ? turnos : [], items: conBandeja ? items : [], misiones: mh, persona: c.persona, ahoraMs });
    return { c, datos: !!lat || conHilo || conBandeja, sl, resp, evidencia: resp ? (sh >= sb ? "respuesta en su hilo" : "encargo cerrado en su bandeja") : null,
      vivo: (sl > 0 && ahoraS - sl <= vivoSeg) || (resp > 0 && ahoraS - resp <= respuestaSeg), pend, d, inter };
  });
  // 2) Estado uniforme por cuenta.
  const cuentas = {};
  for (const k of Object.keys(CUENTAS)) {
    const de = ind.filter((x) => x.c.cuenta === k);
    if (!de.some((x) => x.datos)) { cuentas[k] = { cuenta: k, nombre: CUENTAS[k], online: null, motivo: "sin datos", ultima_respuesta: null, quien: null, cupo: cupoDe(k) }; continue; }
    const senal = (x) => Math.max(x.resp, x.sl > 0 && ahoraS - x.sl <= vivoSeg ? x.sl : 0);
    const ultima = de.reduce((m, x) => Math.max(m, senal(x)), 0);
    const quien = ultima ? (de.find((x) => senal(x) === ultima) || {}).c : null;
    const atascos = de.filter((x) => x.pend && x.pend >= ultima);
    const rotos = de.filter((x) => x.d.estado === "roto" && x.d.cuando >= ultima);
    const viva = de.filter((x) => x.vivo);
    let online, motivo;
    if (atascos.length) { online = false; motivo = "mensaje de Carlos a " + atascos.map((x) => x.c.nombre).join(", ") + " sin contestar > 10 min y nadie de la cuenta ha respondido después"; }
    else if (rotos.length) { online = false; motivo = "despertar de webhook con fallo (" + rotos.map((x) => x.c.nombre + (x.d.codigo ? " " + x.d.codigo : "")).join(", ") + ") sin respuesta posterior"; }
    else if (viva.length) { online = true; motivo = "la cuenta responde: " + viva.map((x) => x.c.nombre).join(", ") + " con señal en 24 h"; }
    else { online = false; motivo = ultima ? "ningún consejero de la cuenta ha respondido en 24 h" : "la cuenta nunca ha respondido"; }
    cuentas[k] = { cuenta: k, nombre: CUENTAS[k], online, motivo, ultima_respuesta: ultima || null, quien: quien ? quien.persona : null,
      cupo: cupoDe(k) };
  }
  const consejeros = ind.map((x) => {
    const cu = cuentas[x.c.cuenta];
    return { persona: x.c.persona, nombre: x.c.nombre, cuenta: x.c.cuenta, chat: x.c.chat ? `/chat/${x.c.persona}/` : null,
      online: cu.online, motivo: cu.motivo, ultima_senal: Math.max(x.sl, x.resp) || null, ultima_respuesta: x.resp || null,
      evidencia: x.evidencia, pendiente_propio: !!x.pend, despertar: x.d.estado,
      hoy: x.inter.hoy, hoy_detalle: { encargos: x.inter.encargos, respuestas: x.inter.respuestas, misiones: x.inter.misiones } };
  });
  return {
    ok: true, generado: ahoraS, vivo_s: vivoSeg, respuesta_s: respuestaSeg,
    regla: "presencia por cuenta de Grok Bot, uniforme: en línea si algún consejero de la cuenta respondió o cerró un encargo en 24 h (o latido < 15 min) y la cuenta no tiene un mensaje de Carlos > 10 min ni un despertar fallido sin respuesta posterior",
    fuentes: {
      latido: !!lat,
      hilos: CONSEJEROS.filter((c) => Array.isArray(h[c.persona])).length + "/" + CONSEJEROS.filter((c) => c.chat).length,
      bandejas: CONSEJEROS.filter((c) => Array.isArray(b[c.persona])).length + "/" + CONSEJEROS.length,
    },
    cuentas,
    en_linea: consejeros.filter((c) => c.online === true).length,
    consejeros,
  };
}

/**
 * % USADO del cupo Grok Bot semanal de cada cuenta, a partir de las lecturas
 * ya publicadas en /api/consumos/lecturas (el mismo dato que admira.live/consumos).
 * pct es el % del plan ya gastado (0–100), el mismo sentido que «15 % usado»
 * en la app de Grok Bot. Nunca inventa un número: si no hay lectura, o el
 * reset de esa lectura ya pasó y no hay otra posterior, o la lectura tiene
 * más de CUPO_FRESCO_H horas, pct es null y la UI enseña «sin dato» / «sin
 * dato fresco» en vez de un número viejo o un «— %».
 */
export const CUPO_MEDIDOR = "Grok Bot semanal";
export const CUPO_ORIGEN = "/api/consumos/lecturas";
// Las lecturas automáticas llegan cada ~12 h (00:15 y 12:15 Madrid): vale hasta 13 h o hasta el reset.
export const CUPO_FRESCO_H = 13;
// A partir de esta edad el porcentaje se enseña con «hace X h», no como cifra actual.
export const CUPO_AVISO_H = 2;
const CUPO_MAPA = { leyendas: "leyendas", actuales: "coetaneos" };

/** «hace 12 min», «hace 2,3 h», «hace 3 días». */
export function textoEdadCupo(edadH) {
  if (edadH == null || !Number.isFinite(Number(edadH)) || Number(edadH) < 0) return null;
  const h = Number(edadH);
  if (h < 1) return "hace " + Math.max(1, Math.round(h * 60)) + " min";
  if (h >= 48) return "hace " + Math.floor(h / 24) + " días";
  const r = Math.round(h * 10) / 10;
  return "hace " + String(r).replace(".", ",") + " h";
}

function edadCupo(ts, ahoraMs) {
  if (!ts) return { edadH: null, edadTexto: null };
  const edadH = Math.round(((ahoraMs - Date.parse(ts)) / 3600e3) * 10) / 10;
  if (!Number.isFinite(edadH)) return { edadH: null, edadTexto: null };
  return { edadH, edadTexto: textoEdadCupo(edadH) };
}

/**
 * Etiqueta visible y tooltip del grupo ICQGram (Leyendas / Actuales).
 * Enseña el % usado, nunca lo que queda. Si no hay cifra vigente: «sin dato»
 * o «sin dato fresco» (con el último % conocido solo en el tooltip).
 */
export function cupoEtiqueta(c) {
  if (!c) return { txt: "(sin dato)", title: "Grok Bot semanal · sin dato" };
  const med = c.medidor || CUPO_MEDIDOR;
  const u = c.pct != null && Number.isFinite(Number(c.pct)) ? Number(c.pct) : null;
  const ant = c.anterior != null && Number.isFinite(Number(c.anterior)) ? Number(c.anterior) : null;
  const usado = u !== null ? u : ant;
  const q = usado === null
    ? null
    : (c.restante != null && Number.isFinite(Number(c.restante))
      ? Number(c.restante)
      : Math.max(0, Math.round((100 - usado) * 100) / 100));
  const fmt = (n) => String(Math.round(Number(n) * 10) / 10).replace(".", ",");
  let title = med;
  if (usado !== null) title += " · usado " + fmt(usado) + " % · queda " + fmt(q) + " %";
  else title += " · sin dato";
  if (c.edadTexto) title += " · " + c.edadTexto;
  if (c.fuente) title += " · " + c.fuente;
  if (u === null) {
    return { txt: (c.ts || ant !== null) ? "(sin dato fresco)" : "(sin dato)", title };
  }
  let txt = "(" + Math.round(u) + " % usado)";
  if (c.edadH != null && Number.isFinite(Number(c.edadH)) && Number(c.edadH) >= CUPO_AVISO_H) {
    txt = "(" + Math.round(u) + " % usado · " + (c.edadTexto || textoEdadCupo(c.edadH)) + ")";
  }
  return { txt, title };
}

/** Última lectura del medidor Grok Bot semanal de una cuenta de lecturas. */
export function ultimaLecturaCupo(lecturas, grupoLecturas) {
  const de = (lecturas || []).filter((l) => l && (l.grupo === grupoLecturas) && l.agente === CUPO_MEDIDOR && l.pct !== null && l.pct !== undefined && Number.isFinite(Number(l.pct)));
  de.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return de.length ? de[de.length - 1] : null;
}

/**
 * Devuelve { leyendas, actuales }, cada uno: { pct, ts, fuente, medidor, reset, origen, motivo, edadTexto, anterior? }.
 * pct es un número 0-100 o null. No incluye correos, notas ni secretos.
 */
export function cupoDesdeLecturas(lecturas, ahoraMs = Date.now()) {
  const out = {};
  for (const [dest, grupo] of Object.entries(CUPO_MAPA)) {
    const l = ultimaLecturaCupo(lecturas, grupo);
    const base = { pct: null, ts: l ? l.ts : null, fuente: l ? l.fuente || null : null, medidor: CUPO_MEDIDOR, reset: l && l.reset ? l.reset : null, origen: CUPO_ORIGEN, motivo: "sin datos", edadTexto: null };
    if (!l) { out[dest] = base; continue; }
    const { edadH, edadTexto } = edadCupo(l.ts, ahoraMs);
    base.edadTexto = edadTexto;
    base.edadH = edadH;
    const resetMs = l.reset && /T/.test(l.reset) ? Date.parse(l.reset) : NaN;
    if (Number.isFinite(resetMs) && resetMs <= ahoraMs) {
      out[dest] = { ...base, motivo: "sin datos", anterior: Math.round(Number(l.pct) * 100) / 100 };
      continue;
    }
    if (edadH !== null && edadH > CUPO_FRESCO_H) {
      out[dest] = { ...base, motivo: "sin datos", anterior: Math.round(Number(l.pct) * 100) / 100 };
      continue;
    }
    const pct = Math.round(Number(l.pct) * 100) / 100;
    out[dest] = { ...base, pct, restante: Math.max(0, Math.round((100 - pct) * 100) / 100), motivo: null };
  }
  return out;
}

/** Inicio del día civil en Europe/Madrid, en ms UTC. */
export function inicioDiaMadrid(ahoraMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ahoraMs)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0) - (asUTC - ahoraMs);
}

function msDe(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n < 1e12 ? n * 1000 : n;
}

function misionesDe(latido, nombre) {
  const l = latido && latido.misiones_hoy && typeof latido.misiones_hoy === "object" ? latido.misiones_hoy[nombre] : null;
  if (!Array.isArray(l)) return [];
  return l.map((m) => (m && typeof m === "object" ? { encargo: m.encargo ?? null, cuando: m.cuando ?? null } : null)).filter(Boolean);
}

/**
 * Veces que un consejero ha trabajado o intervenido en el día de Madrid:
 * encargos cerrados (done/closed) + respuestas en su hilo + misiones de
 * misiones_hoy (o un in_progress empezado hoy) que no estén ya contadas por id.
 * Solo números; ningún texto de misión ni de mensaje.
 */
export function intervencionesHoy({ turnos, items, misiones, persona, ahoraMs = Date.now() } = {}) {
  const desde = inicioDiaMadrid(ahoraMs), hasta = ahoraMs;
  const enHoy = (ms) => Number.isFinite(ms) && ms >= desde && ms <= hasta;
  const ids = new Set();
  let encargos = 0, respuestas = 0, mision = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    if ((it.status === "done" || it.status === "closed") && enHoy(msDe(it.done_at))) {
      if (it.id != null) ids.add(it.id);
      encargos++;
    }
  }
  for (const m of Array.isArray(misiones) ? misiones : []) {
    if (!m) continue;
    if (m.cuando != null && !enHoy(msDe(m.cuando))) continue;
    const id = m.encargo != null ? m.encargo : null;
    if (id != null && ids.has(id)) continue;
    if (id != null) ids.add(id);
    mision++;
  }
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || it.status !== "in_progress") continue;
    if (!enHoy(msDe(it.ts)) && !enHoy(msDe(it.ack_at))) continue;
    if (it.id != null && ids.has(it.id)) continue;
    if (it.id != null) ids.add(it.id);
    mision++;
  }
  for (const t of Array.isArray(turnos) ? turnos : []) {
    if (!t || t.rol !== persona) continue;
    if (enHoy(Date.parse(t.ts))) respuestas++;
  }
  return { hoy: encargos + respuestas + mision, encargos, respuestas, misiones: mision };
}

