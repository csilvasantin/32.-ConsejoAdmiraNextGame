'use strict';
/* Acción «deepagentapp» del relay (r233 · Carlos, 21-11-2026 20:34): cerrar o arrancar la app de escritorio de un
 * deepagent en su Mac para liberar la máquina y que trabaje por CLI. LISTA CERRADA: solo estas apps y solo
 * `open -a` / `quit app`. Nada genérico: el argumento NO entra en el comando, solo elige una entrada de la tabla.
 *   arg = "<abrir|cerrar>:<claude|codex>"   (Neo y Morfeo → claude · Trinity y Oráculo → codex)
 * La app de Codex puede ser Codex.app o ChatGPT.app (el pulso las trata igual): abrir prueba Codex y luego ChatGPT;
 * cerrar cierra las dos si están abiertas. */
const COMANDOS = {
  'abrir:claude': "open -a Claude && echo 'abierta: Claude'",
  'cerrar:claude': "if pgrep -xq Claude; then osascript -e 'quit app \"Claude\"' && echo 'cerrada: Claude'; else echo 'no estaba abierta: Claude'; fi",
  'abrir:codex': "(open -a Codex 2>/dev/null && echo 'abierta: Codex') || (open -a ChatGPT && echo 'abierta: ChatGPT')",
  'cerrar:codex': "c=0; for a in Codex ChatGPT; do if pgrep -xq \"$a\"; then osascript -e \"quit app \\\"$a\\\"\" && echo \"cerrada: $a\"; c=1; fi; done; [ $c = 1 ] || echo 'no estaba abierta: Codex/ChatGPT'",
};
const APP_DE_AGENTE = { neo: 'claude', morfeo: 'claude', trinity: 'codex', oraculo: 'codex' };

function deepagentAppCommand(arg) {
  const k = String(arg == null ? '' : arg).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(COMANDOS, k)) throw new Error('deepagentapp: solo abrir|cerrar de claude|codex');
  return COMANDOS[k];
}

module.exports = { COMANDOS, APP_DE_AGENTE, deepagentAppCommand };
