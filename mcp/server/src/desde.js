/*
 * desde.js — «¿desde cuándo está así?» (Carlos, 4-oct-2026, 19:15: la ficha de Walt decía
 * «Desde: sin datos» estando libre, cuando sabíamos que acabó a las 19:01).
 *
 * La presencia vive en el D1 de admira-telegram (bot.yokup.com): tabla `presence` (último
 * latido, se pisa en cada latido) y `presence_work` (working_since de la racha trabajando,
 * pero se reinicia tras 90 s sin latido y no guarda cuándo se paró). Aquí, en el KV
 * ADMIRA_LIVE_DESDE de este worker, se apunta SOLO el cambio de estado:
 *   · yokup_presencia con trabajando:true/false → marca del agente si el flag cambia
 *     (nunca se reescribe en cada latido; como mucho se refresca `at` cada 5 min).
 *   · /consejo/estado → marca de la silla cuando su estado (working/idle) cambia.
 * Todo en una clave (`desde:v1`): una lectura por cálculo de la mesa (caché 20 s).
 */
import { norm } from './coordinacion.js';

export const CLAVE_KV = 'desde:v1';
export const REFRESCO_MARCA_SEG = 300;   // trabajando:true repetido: refresca `at` como mucho cada 5 min
export const RACHA_ROTA_SEG = 600;       // sin trabajando:true en 10 min = racha nueva (igual que TRABAJANDO_SEG)
export const claveAgente = (persona, machine) => `${norm(persona)}|${norm(machine)}`;

const vacio = () => ({ agentes: {}, sillas: {} });
export async function leerMarcas(kv) {
  if (!kv || typeof kv.get !== 'function') return null;
  try {
    const d = await kv.get(CLAVE_KV, 'json');
    return d && typeof d === 'object' ? { agentes: d.agentes || {}, sillas: d.sillas || {} } : vacio();
  } catch (_) { return null; }
}
async function guardar(kv, d) { await kv.put(CLAVE_KV, JSON.stringify(d)); }

/** Nueva marca de agente tras un latido con trabajando boolean, o null si no hay que escribir (pura). */
export function siguienteMarcaAgente(previa, trabajando, ahoraS) {
  if (trabajando) {
    if (!previa || !previa.working || ahoraS - Number(previa.at || previa.desde || 0) > RACHA_ROTA_SEG) return { working: true, desde: ahoraS, at: ahoraS };
    if (ahoraS - Number(previa.at || 0) >= REFRESCO_MARCA_SEG) return { ...previa, at: ahoraS };
    return null;
  }
  if (!previa || previa.working) return { working: false, desde: ahoraS, at: ahoraS };
  return null;
}

/** yokup_presencia: apunta el cambio del flag trabajando (no rompe el latido si el KV falla). */
export async function marcarTrabajo(kv, { persona, machine }, trabajando, ahoraS) {
  if (!kv || typeof trabajando !== 'boolean') return null;
  try {
    const d = (await leerMarcas(kv)) || vacio();
    const k = claveAgente(persona, machine);
    const nueva = siguienteMarcaAgente(d.agentes[k], trabajando, ahoraS);
    if (!nueva) return d.agentes[k];
    d.agentes[k] = nueva;
    await guardar(kv, d);
    return nueva;
  } catch (_) { return null; }
}

/** /consejo/estado: guarda las sillas cuyo estado cambió (y paradas de agentes por caducidad). */
export async function guardarCambios(kv, cambios) {
  if (!kv || !cambios || (!Object.keys(cambios.sillas || {}).length && !Object.keys(cambios.agentes || {}).length)) return false;
  try {
    const d = (await leerMarcas(kv)) || vacio();
    Object.assign(d.sillas, cambios.sillas || {});
    for (const [k, m] of Object.entries(cambios.agentes || {})) {
      // No pisar una marca más nueva escrita por yokup_presencia mientras tanto.
      if (!d.agentes[k] || Number(d.agentes[k].desde || 0) <= Number(m.desde || 0))  d.agentes[k] = m;
    }
    await guardar(kv, d);
    return true;
  } catch (_) { return false; }
}
