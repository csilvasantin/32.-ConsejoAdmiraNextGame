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
 * Fuente caída: online:null (desconocido) — la ventana lo pone en gris, nunca en verde.
 * Solo booleanos, horas y códigos: ningún texto de mensaje ni de misión.
 */
import { salud } from "./chat-hilo-lib.mjs";

export const VIVO_SEG = 900;
export const RESPUESTA_SEG = 24 * 3600;
export const CONSEJEROS = [
  { persona: "jobs", latido: "Jobs", nombre: "Steve Jobs" },
  { persona: "wozniak", latido: "Wozniak", nombre: "Steve Wozniak" },
  { persona: "disney", latido: "Disney", nombre: "Walt Disney" },
  { persona: "lucas", latido: "Lucas", nombre: "George Lucas" },
  { persona: "musk", latido: "Musk", nombre: "Elon Musk" },
  { persona: "huang", latido: "Huang", nombre: "Jensen Huang" },
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
  const consejeros = CONSEJEROS.map((c) => {
    const turnos = h[c.persona], items = b[c.persona];
    const conHilo = Array.isArray(turnos), conBandeja = Array.isArray(items);
    const base = { persona: c.persona, nombre: c.nombre, chat: `/chat/${c.persona}/` };
    if (!lat && !conHilo && !conBandeja) return { ...base, online: null, ultima_senal: null, ultima_respuesta: null, evidencia: null, despertar: null, motivo: "sin datos" };
    const sl = lat ? senalLatido(lat[c.latido], ahoraS) : 0;
    const sh = conHilo ? senalHilo(turnos, c.persona) : 0;
    const sb = conBandeja ? senalBandeja(items) : 0;
    const resp = Math.max(sh, sb);
    const evidencia = resp ? (sh >= sb ? "respuesta en su hilo" : "encargo cerrado en su bandeja") : null;
    const latidoVivo = sl > 0 && ahoraS - sl <= vivoSeg;
    const respReciente = resp > 0 && ahoraS - resp <= respuestaSeg;
    const sinContestar = conHilo && salud(turnos, c.persona, ahoraMs).estado === "aviso";
    const d = conHilo ? despertar(turnos) : { estado: null, cuando: 0, codigo: null };
    const roto = d.estado === "roto" && d.cuando >= sh; // si respondió después, el canal funciona
    let online, motivo;
    if (sinContestar) { online = false; motivo = "mensaje de Carlos sin contestar > 10 min"; }
    else if (roto) { online = false; motivo = "webhook de despertar con fallo" + (d.codigo ? " (" + d.codigo + ")" : ""); }
    else if (latidoVivo) { online = true; motivo = "latido reciente"; }
    else if (respReciente) { online = true; motivo = evidencia + " en 24 h"; }
    else { online = false; motivo = resp ? "sin respuestas en 24 h" : "nunca ha respondido"; }
    return { ...base, online, ultima_senal: Math.max(sl, resp) || null, ultima_respuesta: resp || null, evidencia, despertar: roto ? "roto" : d.estado, motivo };
  });
  return {
    ok: true, generado: ahoraS, vivo_s: vivoSeg, respuesta_s: respuestaSeg,
    fuentes: {
      latido: !!lat,
      hilos: CONSEJEROS.filter((c) => Array.isArray(h[c.persona])).length + "/" + CONSEJEROS.length,
      bandejas: CONSEJEROS.filter((c) => Array.isArray(b[c.persona])).length + "/" + CONSEJEROS.length,
    },
    en_linea: consejeros.filter((c) => c.online === true).length,
    consejeros,
  };
}
