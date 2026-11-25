/**
 * win95-presencia-lib.mjs — ¿qué consejeros están en línea en el ICQGram de admira.live/win95?
 * (Carlos, 25-11-2026 20:30: «si están online aparecen en verde y si están offline debajo,
 * en Fuera de línea»).
 *
 * En línea = el consejero dio señal real en los últimos 15 min (VIVO_SEG, la misma regla que
 * agentes_vivos y /consejo/estado), sea por su latido (mcp.admira.live/consejeros/latido,
 * público) o por una respuesta suya en su hilo de admira.live/chat/<persona>. Si Carlos le
 * escribió desde admira.live y lleva > 10 min sin contestar (salud «aviso»), NO está en línea.
 * Nunca se inventa: si no hay fuente, online:null (estado desconocido) y la ventana lo pone
 * en Fuera de línea. Solo booleanos y horas: sin textos de mensajes ni misiones.
 */
import { salud } from "./chat-hilo-lib.mjs";

export const VIVO_SEG = 900;
export const CONSEJEROS = [
  { persona: "jobs", latido: "Jobs", nombre: "Steve Jobs" },
  { persona: "wozniak", latido: "Wozniak", nombre: "Steve Wozniak" },
  { persona: "disney", latido: "Disney", nombre: "Walt Disney" },
  { persona: "lucas", latido: "Lucas", nombre: "George Lucas" },
  { persona: "musk", latido: "Musk", nombre: "Elon Musk" },
  { persona: "huang", latido: "Huang", nombre: "Jensen Huang" },
];

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Señal del latido (s): última escritura (at/desde); «trabajando» vigente cuenta como ahora. */
export function senalLatido(l, ahoraS) {
  if (!l || typeof l !== "object") return 0;
  if (l.modo === "trabajando" && !l.caducado && num(l.hasta) > ahoraS) return ahoraS;
  return Math.max(num(l.at), num(l.desde));
}

/** Última respuesta del consejero en su hilo (s). */
export function senalHilo(turnos, persona) {
  const lista = Array.isArray(turnos) ? turnos : [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const t = lista[i];
    if (t && t.rol === persona) { const ms = Date.parse(t.ts); return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0; }
  }
  return 0;
}

/**
 * latido: cuerpo de /consejeros/latido (o null si falló).
 * hilos: { persona: turnos[] | null } (null = no se pudo leer ese hilo).
 */
export function presencia({ latido, hilos, ahoraMs = Date.now(), vivoSeg = VIVO_SEG } = {}) {
  const ahoraS = Math.floor(ahoraMs / 1000);
  const lat = latido && latido.consejeros && typeof latido.consejeros === "object" ? latido.consejeros : null;
  const h = hilos || {};
  const consejeros = CONSEJEROS.map((c) => {
    const turnos = h[c.persona];
    const conHilo = Array.isArray(turnos);
    if (!lat && !conHilo) return { persona: c.persona, nombre: c.nombre, chat: `/chat/${c.persona}/`, online: null, ultima_senal: null, fuente: null, motivo: "sin datos" };
    const sl = lat ? senalLatido(lat[c.latido], ahoraS) : 0;
    const sh = conHilo ? senalHilo(turnos, c.persona) : 0;
    const ultima = Math.max(sl, sh);
    const fuente = ultima ? (sh >= sl ? "hilo" : "latido") : null;
    const sinContestar = conHilo && salud(turnos, c.persona, ahoraMs).estado === "aviso";
    const reciente = ultima > 0 && ahoraS - ultima <= vivoSeg;
    const online = reciente && !sinContestar;
    const motivo = online ? "señal reciente" : sinContestar ? "mensaje sin contestar > 10 min" : ultima ? "sin señal en 15 min" : "nunca ha dado señal";
    return { persona: c.persona, nombre: c.nombre, chat: `/chat/${c.persona}/`, online, ultima_senal: ultima || null, fuente, motivo };
  });
  return {
    ok: true, generado: ahoraS, vivo_s: vivoSeg,
    fuentes: { latido: !!lat, hilos: CONSEJEROS.filter((c) => Array.isArray(h[c.persona])).length + "/" + CONSEJEROS.length },
    en_linea: consejeros.filter((c) => c.online === true).length,
    consejeros,
  };
}
