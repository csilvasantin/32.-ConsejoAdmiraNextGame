/*
 * supervisores.js — qué consejero supervisa a cada agente de la flota.
 *
 * Un agente solo puede usar la bandeja de consejeros para escribir a SU
 * consejero supervisor (Carlos, 17-10-2026). Para añadir un agente nuevo,
 * pon una línea en SUPERVISION: silla del consejero → lista de agentes.
 * Los deepagents de sillas.js (Merovingio→Musk, Cypher→Huang) se añaden solos.
 */

import { SILLAS } from './sillas.js';
import { personaCanonica, norm } from './flota.js';

export const SUPERVISION = {
  Musk: ['Oraculo', 'Morfeo'],
  Jobs: ['Trinity', 'Neo'],
};

function tabla() {
  const t = {};
  for (const [silla, s] of Object.entries(SILLAS)) if (s.deepagent) t[norm(s.deepagent)] = silla;
  for (const [silla, agentes] of Object.entries(SUPERVISION)) for (const a of agentes) t[norm(a)] = silla;
  return t;
}

/** Nombre canónico del agente («Oráculo» → «Oraculo»). */
export function agenteCanonico(nombre) {
  return personaCanonica(nombre) || String(nombre || '').trim() || null;
}

/** Silla del consejero que supervisa a ese agente, o null si no tiene. */
export function supervisorDe(agente) {
  const a = agenteCanonico(agente);
  return a ? tabla()[norm(a)] || null : null;
}
