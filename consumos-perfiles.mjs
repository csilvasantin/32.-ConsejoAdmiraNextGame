/**
 * r23 (GrokBotBox, 09-10-2026): perfiles de los agentes de la FLOTA que miden tokens (Claude Code, Codex, cursor-agent)
 * para los desplegables de /consumos: máquina, modelo, cuenta y email. Sale de orquestar-config.mjs (PERSONAS) +
 * consumos-lecturas-lib.mjs (CUENTAS). Los consejeros GrokBot (maquina «GrokBot») no van uno a uno: no hay forma de
 * separar su consumo. r27: van juntos como «Grok Bot (Consejo)» — la cuenta Cursor Pro de Carlos, medida con el export
 * CSV de cursor.com (fleet/cursor-uso.py en GrokBotBox, datos con horas de retraso). Smith (Mac mini) se mide con los
 * logs locales del Grok CLI (pulso-tokens.py, motor «grok»): NO va en el CSV de Cursor (otro cliente, otra cuenta).
 */
import { PERSONAS } from "./orquestar-config.mjs";
import { CUENTAS } from "./consumos-lecturas-lib.mjs";

export const GROKBOT_CONSEJO = "Grok Bot (Consejo)";
/**
 * r42 (Carlos, 10-10-2026 12:51): todos los asistentes Grok Bot de la cuenta csilvasantin (Merovingio, Mouse y los
 * consejeros) comparten UNA bolsa de uso de Grok Bot. En /consumos ese consumo va SIEMPRE con el nombre de Merovingio,
 * para que se vea de un vistazo cuánto queda. El pulso se sigue guardando con el nombre que mande el emisor
 * (fleet/cursor-uso.py: «Grok Bot (Consejo)»); el cambio de nombre se hace al LEER (agenteVisible).
 */
export const POOL_GROKBOT = "Merovingio";
const ALIAS_POOL = /^\s*(tokens\s+)?grok\s*bot(\s*\((consejo|pool|cursor[^)]*)\))?\s*$/i;
/** Nombre con el que se enseña un agente del pulso: «Grok Bot (Consejo)» → «Merovingio»; el resto, tal cual. */
export function agenteVisible(nombre) {
  return ALIAS_POOL.test(String(nombre || "")) ? POOL_GROKBOT : nombre;
}
/** Consejeros cuyo consumo va dentro del total de la cuenta Cursor Pro (no se suman aparte: sin doble conteo). */
export const CUBRE_CURSOR = ["Jobs", "Wozniak", "Lucas", "Disney"];
export const EXTRA = [
  { agente: POOL_GROKBOT, maquina: "GrokBotBox", modelo: "Grok Bot / Cursor Pro", cuentaId: "cursor", plan: "Cursor Pro (Carlos Silva Santin)", email: null,
    nota: "Bolsa de Grok Bot de la cuenta csilvasantin: Merovingio, Mouse y los consejeros (Jobs, Wozniak, Lucas, Disney…) · Cursor · datos del export CSV, con horas de retraso", cubre: CUBRE_CURSOR },
];

export function perfilesFlota(personas = PERSONAS, cuentas = CUENTAS, extra = EXTRA) {
  const porId = Object.fromEntries((cuentas || []).map((c) => [c.id, c]));
  return (personas || []).filter((p) => p && p.maquina !== "GrokBot").map((p) => {
    const c = porId[p.cuenta] || {};
    const email = c.email || ((String(c.plan || "") + " " + String(c.cuenta || "")).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [null])[0];
    return { agente: p.persona, maquina: p.maquina, modelo: p.modelo, cuentaId: p.cuenta || null, plan: c.plan || null, email: email || null };
  }).concat((extra || []).map((x) => ({ ...x })));
}
