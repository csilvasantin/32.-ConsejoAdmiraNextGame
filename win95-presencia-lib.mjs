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
export function presencia({ latido, hilos, bandejas, ahoraMs = Date.now(), vivoSeg = VIVO_SEG, respuestaSeg = RESPUESTA_SEG } = {}) {
  const ahoraS = Math.floor(ahoraMs / 1000);
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
    return { c, datos: !!lat || conHilo || conBandeja, sl, resp, evidencia: resp ? (sh >= sb ? "respuesta en su hilo" : "encargo cerrado en su bandeja") : null,
      vivo: (sl > 0 && ahoraS - sl <= vivoSeg) || (resp > 0 && ahoraS - resp <= respuestaSeg), pend, d };
  });
  // 2) Estado uniforme por cuenta.
  const cuentas = {};
  for (const k of Object.keys(CUENTAS)) {
    const de = ind.filter((x) => x.c.cuenta === k);
    if (!de.some((x) => x.datos)) { cuentas[k] = { cuenta: k, nombre: CUENTAS[k], online: null, motivo: "sin datos", ultima_respuesta: null, quien: null }; continue; }
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
    cuentas[k] = { cuenta: k, nombre: CUENTAS[k], online, motivo, ultima_respuesta: ultima || null, quien: quien ? quien.persona : null };
  }
  const consejeros = ind.map((x) => {
    const cu = cuentas[x.c.cuenta];
    return { persona: x.c.persona, nombre: x.c.nombre, cuenta: x.c.cuenta, chat: x.c.chat ? `/chat/${x.c.persona}/` : null,
      online: cu.online, motivo: cu.motivo, ultima_senal: Math.max(x.sl, x.resp) || null, ultima_respuesta: x.resp || null,
      evidencia: x.evidencia, pendiente_propio: !!x.pend, despertar: x.d.estado };
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
