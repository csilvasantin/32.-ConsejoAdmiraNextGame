/**
 * Orquestador (GrokBotBox, 09-10-2026): «¿a quién le doy esta tarea?» cuando Carlos no lo decide.
 * Regla de Carlos: (1) aptitud para el tipo, (2) quién está libre ahora, (3) quién tiene más margen de
 * uso; nunca gastar de quien tiene menos margen si hay alguien apto con más.
 * Funciones puras: sin red ni KV (los datos los trae functions/api/orquestar.js).
 */
import { PERSONAS, APTITUD, PALABRAS, TIPO_POR_DEFECTO } from "./orquestar-config.mjs";

export const UMBRAL_APTO = 0.4;
export const LATIDO_VIVO_S = 600; // 10 min
export const VENTANA_ENCARGO_S = 48 * 3600; // un encargo «ack/in_progress» más viejo se da por abandonado
export const ESTADOS_EN_CURSO = new Set(["ack", "in_progress"]);

const plano = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Tipo pedido o inferido del texto por palabras clave. */
export function inferirTipo(tipo, texto) {
  const t = plano(tipo);
  if (t) return { tipo: t, inferido: false };
  const x = String(texto || "");
  for (const [k, re] of PALABRAS) if (re.test(x)) return { tipo: k, inferido: true };
  return { tipo: TIPO_POR_DEFECTO, inferido: true, porDefecto: true };
}

export function aptitud(perfil, tipo) {
  const p = APTITUD[perfil] || {};
  const v = p[tipo];
  return typeof v === "number" ? v : 0.5; // tipo desconocido: neutro
}

/** Último latido (s) de una persona en las filas de presencia, por alias. */
export function ultimoLatido(cfg, presencia) {
  const alias = new Set(cfg.alias.map(plano));
  let max = null;
  for (const r of presencia || []) {
    if (!r || !alias.has(plano(r.persona || r.agent))) continue;
    const u = Number(r.updated) || 0;
    const s = u > 4102444800 ? Math.floor(u / 1000) : u;
    if (s && (max === null || s > max)) max = s;
  }
  return max;
}

/** Encargos ack/in_progress recientes dirigidos a la persona (bandeja pública). */
export function encargosEnCurso(cfg, bandeja, ahoraS) {
  const alias = new Set(cfg.alias.map(plano));
  return (bandeja || []).filter((e) => e && alias.has(plano(e.target_persona)) && ESTADOS_EN_CURSO.has(String(e.status)) && (!e.ts || ahoraS - Number(e.ts) <= VENTANA_ENCARGO_S)).map((e) => e.id);
}

export const POR_WEBHOOK = "se despierta al recibir encargo";

export function libre(latido, enCurso, ahoraS, { despierta = null } = {}) {
  // Consejeros GrokBot (09-10-2026): se despiertan por webhook al recibir el encargo; el latido no cuenta.
  if (despierta === "webhook") {
    if (enCurso.length) return { libre: false, why: "con encargo en curso #" + enCurso.join(", #") };
    return { libre: true, why: POR_WEBHOOK };
  }
  if (latido === null) return { libre: false, why: "sin latido en la presencia" };
  const edad = Math.max(0, ahoraS - latido);
  const min = Math.round(edad / 60);
  if (edad > LATIDO_VIVO_S) return { libre: false, why: "último latido hace " + min + " min (>10)" };
  if (enCurso.length) return { libre: false, why: "vivo, pero con encargo en curso #" + enCurso.join(", #") };
  return { libre: true, why: "latido hace " + (min ? min + " min" : "<1 min") + " y sin encargo en curso" };
}

/**
 * Puntuación: la aptitud manda (×100), luego libre (+20), luego margen (0-15; desconocido = 3). Libre pesa más que todo el margen.
 * Así, entre dos aptos parecidos gana el libre, y entre libres el de más margen.
 */
export function puntuacion({ apto, esLibre, margenPct }) {
  const m = margenPct === null || margenPct === undefined ? 3 : (Math.max(0, Math.min(100, margenPct)) * 15) / 100;
  return Math.round((apto * 100 + (esLibre ? 20 : 0) + m) * 10) / 10;
}

const fmt = (x) => String(Math.round(x)).replace(".", ",") + " %";

/**
 * @param {object} p
 * @param {string} p.tipo
 * @param {Array} p.cuentas   resumirCuentas() de consumos-lecturas-lib (id, margen, semaforo…)
 * @param {Array} p.presencia filas de bot.yokup.com/api/presence
 * @param {Array} p.bandeja   items de bot.yokup.com/api/public/inbox
 * @param {number} p.ahora    ms
 * @param {Array} [p.personas]
 */
export const OCUPADO_CON_CARLOS = "ocupado con Carlos";

/** ¿La persona está ahora con Carlos? conCarlos = lista de nombres (agente del pulso) o Set. */
export function estaConCarlos(cfg, conCarlos) {
  const nombres = new Set([...(conCarlos || [])].map(plano));
  return [cfg.persona, ...(cfg.alias || [])].some((n) => nombres.has(plano(n)));
}

/**
 * @param {Array|Set} [p.conCarlos] agentes con los que Carlos trabaja ahora (pulso r20): se excluyen
 *   («ocupado con Carlos») salvo que no quede ningún otro apto.
 */
export function orquestar({ tipo, cuentas = [], presencia = [], bandeja = [], ahora = Date.now(), personas = PERSONAS, conCarlos = [] }) {
  const ahoraS = Math.floor(ahora / 1000);
  const porId = new Map((cuentas || []).map((c) => [c.id, c]));
  const todos = personas.map((cfg) => {
    const c = cfg.cuenta ? porId.get(cfg.cuenta) : null;
    const margenPct = c && c.margen !== null && c.margen !== undefined ? c.margen : null;
    const apto = aptitud(cfg.perfil, tipo);
    const lat = ultimoLatido(cfg, presencia);
    const enCurso = encargosEnCurso(cfg, bandeja, ahoraS);
    const cc = estaConCarlos(cfg, conCarlos);
    const lib = cc ? { libre: false, why: OCUPADO_CON_CARLOS } : libre(lat, enCurso, ahoraS, { despierta: cfg.despierta || null });
    const punt = puntuacion({ apto, esLibre: lib.libre, margenPct });
    const partes = [tipo + " " + apto.toFixed(2), lib.libre ? "libre" : "ocupado/ausente", margenPct === null ? (c ? "sin lectura de margen" : "margen desconocido") : fmt(margenPct) + " de margen"];
    return {
      persona: cfg.persona, maquina: cfg.maquina, modelo: cfg.modelo,
      cuenta: cfg.cuenta ? (c ? c.nombre + (c.cuenta ? " (" + c.cuenta + ")" : "") : cfg.cuenta) : "desconocida",
      grupo: cfg.cuenta || null,
      apto, libre: { libre: lib.libre, why: lib.why }, conCarlos: cc, despierta: cfg.despierta || null, margenPct, semaforo: c ? c.semaforo : "sin",
      // r24: por qué el semáforo de la cuenta no es solo el margen (p. ej. al ritmo actual se agota antes del reset).
      agotaAntes: !!(c && c.agotaAntes), proyeccionTexto: c && c.proyeccion && c.proyeccion.texto ? c.proyeccion.texto : null,
      ultimoLatido: lat === null ? null : new Date(lat * 1000).toISOString(),
      encargosEnCurso: enCurso.length, encargosIds: enCurso, puntuacion: punt, motivo: partes.join(" · "),
    };
  });
  const aptos = todos.filter((x) => x.apto >= UMBRAL_APTO);
  const base = aptos.length ? aptos : todos;
  // Regla de Carlos (r20): quien está con Carlos no recibe encargos, salvo que no haya nadie más apto.
  const sinCarlos = base.filter((x) => !x.conCarlos);
  const pool = sinCarlos.length ? sinCarlos : base;
  const orden = (a, b) => b.puntuacion - a.puntuacion || (b.margenPct ?? -1) - (a.margenPct ?? -1) || (Date.parse(b.ultimoLatido || 0) || 0) - (Date.parse(a.ultimoLatido || 0) || 0) || a.persona.localeCompare(b.persona);
  const candidatos = [...pool].sort(orden);
  const excluidos = todos.filter((x) => !pool.includes(x)).map((x) => ({ persona: x.persona, apto: x.apto, conCarlos: x.conCarlos,
    // r24: también el margen de su cuenta (lo enseña /consumos aunque el agente esté fuera del reparto).
    margenPct: x.margenPct, semaforo: x.semaforo, agotaAntes: x.agotaAntes, proyeccionTexto: x.proyeccionTexto,
    motivo: x.conCarlos && base.includes(x) ? OCUPADO_CON_CARLOS : "no apto para " + tipo + " (<" + UMBRAL_APTO + ")" }));
  const top = candidatos[0] || null;
  const etiquetaTipo = { codigo: "código", investigacion: "investigación", creativo: "creativo", consejo: "consejo", web: "web", demo: "demo", estrategia: "estrategia" }[tipo] || tipo;
  const elegido = top ? {
    persona: top.persona,
    motivo: top.persona + ": " + etiquetaTipo + ", " + (top.conCarlos ? "ocupado con Carlos pero no queda nadie más apto, " : "") + (top.libre.libre ? "libre" : "no libre (" + top.libre.why + ")") + ", " + (top.margenPct === null ? (top.grupo ? "sin lectura de margen" : "margen desconocido") : fmt(top.margenPct) + " de margen"),
  } : null;
  return { tipo, candidatos, excluidos, elegido, conCarlos: todos.filter((x) => x.conCarlos).map((x) => x.persona) };
}
