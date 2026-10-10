/**
 * Equipos (regla de Carlos, 10-10-2026): dos equipos, uno por cuenta. Un solo sitio para editarlos.
 * Lo usan equipos-lib.mjs, /api/equipos, /api/orquestar (?equipo=) y la zona «Equipos» de /consumos.
 *
 * - cuenta: la cuenta de Carlos que paga ese equipo. Un equipo NUNCA recibe trabajo de la otra cuenta.
 * - cuentas: ids de CUENTAS (consumos-lecturas-lib.mjs) de las que sale su margen/presupuesto.
 * - orquestador / respaldo: quién lleva el equipo el día que no lo lleva Carlos. El respaldo manda mientras
 *   el orquestador no tenga latido en la presencia (<10 min).
 * - personas: nombres de PERSONAS (orquestar-config.mjs). NOMBRE = cómo se enseñan.
 * Cada día Carlos lleva un equipo (POST /api/equipos/hoy); el otro va con su orquestador.
 */
export const EQUIPOS = [
  {
    id: "admiranext", nombre: "Equipo AdmiraNeXT", cuenta: "csilva@admira.com", maquina: "MacBook Pro Negro 14",
    orquestador: "Jobs", respaldo: null,
    consejeros: ["Jobs", "Wozniak", "Lucas", "Disney"], planConsejeros: "Leyendas Grok",
    agentes: ["Neo", "Trinity"], planAgentes: { Neo: "Claude Max", Trinity: "Codex · ChatGPT Pro" },
    cuentas: ["leyendas", "neo-claude", "trinity-codex"],
  },
  {
    id: "admiralive", nombre: "Equipo admira.live", cuenta: "csilvasantin@gmail.com", maquina: "Mac mini",
    orquestador: "Musk", respaldo: "Jobs",
    consejeros: ["Musk", "Huang"], planConsejeros: "Coetáneos Grok",
    agentes: ["Morfeo", "Oráculo"], planAgentes: { Morfeo: "Claude", "Oráculo": "Codex" },
    cuentas: ["coetaneos", "morfeo-claude", "oraculo-codex"],
  },
];

/** Cómo se llama a cada uno en pantalla (Carlos: «Woz», «Walt», «Elon», «Jensen»). */
export const NOMBRE = { Wozniak: "Woz", Disney: "Walt", Musk: "Elon", Huang: "Jensen", Carlos: "Carlos" };

/** Alias de equipo aceptados en ?equipo= y en el POST. */
export const ALIAS_EQUIPO = {
  admiranext: "admiranext", "admira-next": "admiranext", next: "admiranext", "equipo admiranext": "admiranext",
  admiralive: "admiralive", "admira.live": "admiralive", "admira-live": "admiralive", live: "admiralive", "equipo admira.live": "admiralive",
};

/** Quién lleva hoy cada equipo si nadie lo ha fijado por POST (semilla del primer día de la regla). */
export const HOY_INICIAL = { fecha: "2026-10-10", carlos: "admiralive", autor: "Carlos", nota: "Primer día de la regla: Carlos lleva admira.live; Jobs lleva AdmiraNeXT (Carlos supervisa)." };
