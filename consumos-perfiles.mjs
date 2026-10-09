/**
 * r23 (GrokBotBox, 09-10-2026): perfiles de los agentes de la FLOTA que miden tokens (Claude Code, Codex, cursor-agent)
 * para los desplegables de /consumos: máquina, modelo, cuenta y email. Sale de orquestar-config.mjs (PERSONAS) +
 * consumos-lecturas-lib.mjs (CUENTAS). Los consejeros GrokBot (maquina «GrokBot») no van: no tienen pulso de tokens.
 */
import { PERSONAS } from "./orquestar-config.mjs";
import { CUENTAS } from "./consumos-lecturas-lib.mjs";

export function perfilesFlota(personas = PERSONAS, cuentas = CUENTAS) {
  const porId = Object.fromEntries((cuentas || []).map((c) => [c.id, c]));
  return (personas || []).filter((p) => p && p.maquina !== "GrokBot").map((p) => {
    const c = porId[p.cuenta] || {};
    const email = c.email || ((String(c.plan || "") + " " + String(c.cuenta || "")).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [null])[0];
    return { agente: p.persona, maquina: p.maquina, modelo: p.modelo, cuentaId: p.cuenta || null, plan: c.plan || null, email: email || null };
  });
}
