/** r233 · lista cerrada de «Cerrar / Arrancar desktop app» de los deepagents (la misma que fleet-control/deepagent-app.js). */
export const CLAVE_ACCIONES = "deepagents:acciones:v1";
export const MAX_ACCIONES = 300;
export const APP_DE_AGENTE = { Neo: "claude", Morfeo: "claude", Trinity: "codex", "Oráculo": "codex", Oraculo: "codex" };
export const NOMBRE_APP = { claude: "Claude", codex: "ChatGPT/Codex" };
const MAQUINAS = /^[A-Za-z0-9 ._-]{2,40}$/;

export function validarAccion(b) {
  const agente = String((b && b.agente) || "").trim();
  const app = APP_DE_AGENTE[agente];
  if (!app) return { ok: false, error: "agente fuera de la lista (Trinity, Neo, Oráculo, Morfeo)" };
  const accion = String((b && b.accion) || "");
  if (accion !== "abrir" && accion !== "cerrar") return { ok: false, error: "accion: abrir|cerrar" };
  const maquina = String((b && b.maquina) || "").trim();
  if (!MAQUINAS.test(maquina)) return { ok: false, error: "maquina no válida" };
  const fase = b && b.fase === "resultado" ? "resultado" : "pedida";
  const out = { agente: agente === "Oraculo" ? "Oráculo" : agente, maquina, accion, app, arg: accion + ":" + app, fase };
  if (fase === "resultado") { out.ok = b.ok === true; out.salida = String(b.salida || "").replace(/[\u0000-\u001f]+/g, " ").slice(0, 300); }
  return { ok: true, accion: out };
}

export function anotar(lista, entrada) {
  return [entrada].concat(Array.isArray(lista) ? lista : []).slice(0, MAX_ACCIONES);
}
