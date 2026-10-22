/*
 * equipos.js — handON / handOFF de un equipo (Carlos, 22-oct-2026, 07:45 Madrid).
 *
 *  handON <equipo>  : enciende los monitores del Mac (el agora-cmd-poller del Mac ve
 *                     «handON <Equipo>» en AgoraMatrix y hace caffeinate -u -t 2), despierta
 *                     a cada agente con un encargo «handON: empieza la jornada» y manda
 *                     consejero_mensaje a cada consejero que los dirige.
 *  handOFF <equipo> : pide a agentes y consejeros que cierren y resuman su día, junta el
 *                     resumen del equipo (encargos de hoy hechos y pendientes + consumo),
 *                     lo devuelve y DESPUÉS publica «handOFF <Equipo>» para que el poller
 *                     apague los monitores (pmset displaysleepnow).
 *  prueba:true      : no escribe nada (ni encargos, ni mensajes, ni Agora): devuelve el plan.
 *
 * Tabla por defecto: CASA_AGENTE (flota.js) dice qué agentes viven en cada Mac; los
 * consejeros que los dirigen salen de la norma del 11-10-2026 «cada consejero dirige a un
 * agente» (Walt–Oráculo, Lucas–Morfeo, Jobs–Neo, Woz–Trinity). El canal privado de
 * supervisión del código (supervisores.js: Musk a Oráculo y Morfeo) no se toca.
 */

import { CASA_AGENTE, norm } from './flota.js';

/** Quién dirige a cada agente (norma 11-10-2026). Silla de sillas.js. */
export const DIRECTOR_AGENTE = { Oraculo: 'Disney', Morfeo: 'Lucas', Neo: 'Jobs', Trinity: 'Wozniak' };
const NOMBRE = { Disney: 'Walt', Lucas: 'Lucas', Jobs: 'Jobs', Wozniak: 'Woz', Oraculo: 'Oráculo', Morfeo: 'Morfeo', Neo: 'Neo', Trinity: 'Trinity' };
const RUNTIME = { Oraculo: 'Codex', Morfeo: 'Claude Code', Neo: 'Claude Code', Trinity: 'Codex' };

/** Equipos: clave → máquina (como la escribe la flota) y alias. */
const MAQUINAS = {
  macmini: { maquina: 'MacMini', alias: ['mini', 'mac mini', 'macmini.local'] },
  macstudio: { maquina: 'MacStudio', alias: ['studio', 'mac studio', 'macstudio.local'] },
};

/** Tabla por defecto: { macmini: { maquina, agentes:[{persona, runtime, consejero}], consejeros:[…] } }. */
export function tablaEquipos(casa = CASA_AGENTE) {
  const t = {};
  for (const [clave, m] of Object.entries(MAQUINAS)) {
    const agentes = Object.entries(casa).filter(([, c]) => norm(c) === clave).map(([p]) => p).sort((a, b) => (a === 'Oraculo' ? -1 : b === 'Oraculo' ? 1 : a.localeCompare(b)));
    t[clave] = {
      maquina: m.maquina,
      agentes: agentes.map((p) => ({ persona: p, nombre: NOMBRE[p] || p, runtime: RUNTIME[p] || null, consejero: DIRECTOR_AGENTE[p] || null })),
      consejeros: [...new Set(agentes.map((p) => DIRECTOR_AGENTE[p]).filter(Boolean))],
    };
  }
  return t;
}

/** «MacMini», «mac mini», «mini» → 'macmini'; null si no es un equipo conocido. */
export function equipoCanonico(nombre) {
  const n = norm(nombre);
  if (!n) return null;
  for (const [clave, m] of Object.entries(MAQUINAS)) if (n === clave || m.alias.some((a) => norm(a) === n)) return clave;
  return null;
}

/** Fecha MM.DD de hoy en Madrid (la de las etiquetas #número.MM.DD). */
export function hoyMadrid(ahora = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora);
  const v = (t) => (p.find((x) => x.type === t) || {}).value;
  return { mmdd: `${v('month')}.${v('day')}`, iso: `${v('year')}-${v('month')}-${v('day')}` };
}

const deHoy = (e, mmdd) => !!(e && e.etiqueta && String(e.etiqueta).endsWith('.' + mmdd));

/**
 * deps: { flota, bandeja, api, identidad, ahora }
 *   flota.encargar / flota.listarEncargos, bandeja.enviar(a, identidad), api.agoraDecir.
 */
export function crearEquipos({ flota, bandeja, api, identidad = null, ahora = () => new Date(), casa = CASA_AGENTE } = {}) {
  const quien = (identidad && identidad.agent) || 'MCP admira.live';

  function resolver(equipo) {
    const clave = equipoCanonico(equipo);
    const tabla = tablaEquipos(casa);
    if (!clave || !tabla[clave]) throw new Error(`equipo desconocido «${equipo}»: vale ${Object.values(MAQUINAS).map((m) => m.maquina).join(', ')}`);
    const eq = tabla[clave];
    if (!eq.agentes.length) throw new Error(`${eq.maquina} no tiene agentes de casa en CASA_AGENTE`);
    return { clave, ...eq };
  }

  async function intentar(fn) {
    try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  // Mensaje a un consejero: consejero_mensaje con la identidad de quien llama; si su clave no
  // le deja (un agente solo escribe a su supervisor, etc.), encargo al consejero como respaldo.
  async function avisarConsejero(silla, texto, eq) {
    const m = await intentar(async () => {
      const r = await bandeja.enviar({ para: silla, texto, maquina: eq.maquina }, identidad);
      return { via: 'consejero_mensaje', id: r && r.mensaje && r.mensaje.id };
    });
    if (m.ok) return { consejero: silla, ...m };
    const e = await intentar(async () => {
      const r = await flota.encargar({ persona: silla, texto, de: `handON/OFF ${eq.maquina} · ${quien}` });
      return { via: 'agente_encargar (respaldo)', encargo: r && (r.encargo || r.numero), etiqueta: r && r.etiqueta };
    });
    return { consejero: silla, ...e, ...(e.ok ? { nota: `consejero_mensaje falló: ${m.error}` } : { error: `consejero_mensaje: ${m.error}; encargo: ${e.error}` }) };
  }

  async function handon({ equipo, prueba = false, nota = '' }) {
    const eq = resolver(equipo);
    const hora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(ahora());
    const extra = nota ? ` Nota de Carlos: ${nota}` : '';
    const textoAgente = (a) => `handON: empieza la jornada en ${eq.maquina} (${hora} Madrid). ${a.nombre}: abre tu sesión de ${a.runtime || 'trabajo'}, lee tu bandeja (encargos_listar) y retoma lo pendiente por prioridad; tu consejero hoy es ${NOMBRE[a.consejero] || a.consejero || 'tu supervisor'}. Hecho = acuse de este encargo con lo primero que vas a hacer.${extra}`;
    const textoConsejero = (s) => {
      const suyos = eq.agentes.filter((a) => a.consejero === s).map((a) => `${a.nombre} (${a.runtime})`).join(', ');
      return `handON: empieza la jornada en ${eq.maquina} (${hora} Madrid). Diriges a ${suyos}, que acaba de recibir su encargo de arranque. Revisa su bandeja y dale la prioridad del día.${extra}`;
    };
    const plan = {
      monitores: `AgoraMatrix «handON ${eq.maquina}» → agora-cmd-poller en ${eq.maquina}: caffeinate -u -t 2`,
      agentes: eq.agentes.map((a) => ({ persona: a.persona, maquina: eq.maquina, texto: textoAgente(a) })),
      consejeros: eq.consejeros.map((s) => ({ consejero: s, texto: textoConsejero(s) })),
    };
    if (prueba) return { ok: true, prueba: true, accion: 'handON', equipo: eq.maquina, plan, nota: 'modo prueba: no se ha escrito nada' };

    const agentes = [];
    for (const a of eq.agentes) {
      agentes.push({ persona: a.persona, ...(await intentar(async () => {
        const r = await flota.encargar({ persona: a.persona, maquina: eq.maquina, texto: textoAgente(a), de: `handON ${eq.maquina} · ${quien}` });
        return { encargo: r && (r.encargo || r.numero), etiqueta: r && r.etiqueta };
      })) });
    }
    const consejeros = [];
    for (const s of eq.consejeros) consejeros.push(await avisarConsejero(s, textoConsejero(s), eq));
    const monitores = await intentar(async () => {
      await api.agoraDecir({ texto: `handON ${eq.maquina} · [equipo_handon] enciende monitores y empieza la jornada: ${eq.agentes.map((a) => a.nombre).join(', ')} + ${eq.consejeros.map((s) => NOMBRE[s] || s).join(', ')}`, de: `handON · ${quien}`, tipo: 'handon' });
      return { via: `AgoraMatrix → agora-cmd-poller ${eq.maquina} (≤15 s)` };
    });
    const ok = agentes.every((x) => x.ok) && consejeros.every((x) => x.ok) && monitores.ok;
    return { ok, accion: 'handON', equipo: eq.maquina, agentes, consejeros, monitores };
  }

  async function handoff({ equipo, prueba = false, apagar = true }) {
    const eq = resolver(equipo);
    const { mmdd, iso } = hoyMadrid(ahora());
    // 1) Resumen del día por agente: encargos de hoy (etiqueta .MM.DD) hechos y pendientes.
    const porAgente = [];
    for (const a of eq.agentes) {
      const r = await intentar(async () => {
        const l = await flota.listarEncargos({ persona: a.persona, estado: 'todos', limite: 200 });
        const hoy = (l.encargos || []).filter((e) => deHoy(e, mmdd));
        const corto = (e) => ({ encargo: e.encargo, etiqueta: e.etiqueta, estado: e.estado, texto: String(e.texto || '').slice(0, 120) });
        const abiertos = (l.encargos || []).filter((e) => ['pending', 'ack', 'in_progress', 'blocked'].includes(e.estado));
        return {
          hechos: hoy.filter((e) => e.estado === 'done').map(corto),
          pendientes: abiertos.map(corto),
          anulados_hoy: hoy.filter((e) => e.estado === 'cancelled').length,
          encargos_hoy: hoy.length,
        };
      });
      porAgente.push({ persona: a.persona, consejero: a.consejero, ...r });
    }
    const resumen = {
      dia: iso, equipo: eq.maquina,
      agentes: porAgente,
      totales: {
        hechos_hoy: porAgente.reduce((n, x) => n + ((x.hechos || []).length), 0),
        pendientes: porAgente.reduce((n, x) => n + ((x.pendientes || []).length), 0),
      },
      consumo: `Tokens del día: https://www.admira.live/consumos (y Notificaciones de Yokup). A cada agente y consejero se le pide consumo_reportar en su cierre.`,
    };
    const lineas = porAgente.map((x) => `${NOMBRE[x.persona] || x.persona}: ${x.ok ? `${x.hechos.length} hechos hoy, ${x.pendientes.length} pendientes` : 'sin datos'}`).join('; ');
    const textoAgente = (a) => `handOFF: cierra la jornada en ${eq.maquina}. ${a.nombre}: termina o deja a salvo lo que tengas (commit/push o nota), acusa en encargo_responder cada encargo abierto con su estado real, declara tu consumo de hoy con consumo_reportar y contesta este encargo con el resumen de tu día en 3-5 líneas (hecho, pendiente, bloqueos). Después deja de trabajar hasta el próximo handON.`;
    const textoConsejero = (s) => `handOFF: cierra tu día (${eq.maquina}, ${iso}). Resumen del equipo: ${lineas}. Contesta con tu resumen del día (3-5 líneas) y declara tu consumo con consumo_reportar.`;
    if (prueba) {
      return { ok: true, prueba: true, accion: 'handOFF', equipo: eq.maquina, resumen,
        plan: { agentes: eq.agentes.map((a) => ({ persona: a.persona, texto: textoAgente(a) })), consejeros: eq.consejeros.map((s) => ({ consejero: s, texto: textoConsejero(s) })),
          monitores: apagar ? `AgoraMatrix «handOFF ${eq.maquina}» → agora-cmd-poller: pmset displaysleepnow` : 'no se apagan (apagar:false)' },
        nota: 'modo prueba: no se ha escrito nada ni se apagan monitores' };
    }
    const agentes = [];
    for (const a of eq.agentes) {
      agentes.push({ persona: a.persona, ...(await intentar(async () => {
        const r = await flota.encargar({ persona: a.persona, maquina: eq.maquina, texto: textoAgente(a), de: `handOFF ${eq.maquina} · ${quien}` });
        return { encargo: r && (r.encargo || r.numero), etiqueta: r && r.etiqueta };
      })) });
    }
    const consejeros = [];
    for (const s of eq.consejeros) consejeros.push(await avisarConsejero(s, textoConsejero(s), eq));
    // 2) Publicar el resumen y, al final, apagar monitores (el poller lo hace al ver «handOFF <Equipo>»).
    const monitores = await intentar(async () => {
      const cierre = apagar ? ' · [equipo_handoff] apaga monitores' : '';
      await api.agoraDecir({ texto: `handOFF ${eq.maquina}${cierre} · resumen ${iso}: ${lineas}. Hechos hoy ${resumen.totales.hechos_hoy}, pendientes ${resumen.totales.pendientes}.`.slice(0, 1900), de: `handOFF · ${quien}`, tipo: 'handoff' });
      return { via: apagar ? `AgoraMatrix → agora-cmd-poller ${eq.maquina}: pmset displaysleepnow (≤15 s)` : 'resumen publicado; monitores sin tocar' };
    });
    const ok = agentes.every((x) => x.ok) && consejeros.every((x) => x.ok) && monitores.ok;
    return { ok, accion: 'handOFF', equipo: eq.maquina, resumen, agentes, consejeros, monitores };
  }

  return { handon, handoff, resolver };
}
