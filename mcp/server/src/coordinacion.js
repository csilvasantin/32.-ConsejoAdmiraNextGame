/*
 * coordinacion.js — un solo censo para coordinar deepagents desde el MCP
 * (MuskGrokBot · Merovingio · GrokBotBox, 1-oct-2026).
 *
 * Problemas que resuelve:
 *  · consejo_bots decía «en línea» con el latido de 90 s del proxy del Mac Mini y
 *    agentes_vivos con la presencia de bot.yokup.com (15 min): dos verdades. Aquí el
 *    estado en línea sale SIEMPRE de la presencia (misma ventana que agentes_vivos);
 *    el latido del Mac Mini queda como dato secundario.
 *  · el proxy del Mac Mini (src/server.js anterior a 6e3afaf) seguía publicando
 *    «Smith · CEO / Elon Musk». El CEO coetáneo Elon Musk es MuskGrokBot y su
 *    deepagent es Merovingio (Grok CLI en la GrokBotBox); Smith es del otro GrokBot.
 *    La tabla buena es la de app.js / council-todo.js (MATRIX_LINKS) y vive aquí
 *    también, para que el MCP corrija aunque el Mac Mini sirva código viejo.
 *  · flota_estado solo sabía de Claude Code. Ahora reconoce Codex, Grok CLI,
 *    OpenCode y DeepAgents: por sondeo (si el Mac Mini ya publica `runtimes`) y por
 *    presencia (cada latido declara su runtime). La GrokBotBox no tiene SSH desde el
 *    Mac Mini: entra por presencia.
 * Todo son funciones puras: la red la pone flota.js / consejo.js.
 */

import { SILLAS } from './sillas.js';

export const VIVO_SEG = 900;
export const ESTADOS_ABIERTOS = ['pending', 'ack', 'in_progress', 'blocked'];
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const seg = (ts) => (Number(ts) > 4102444800 ? Math.floor(Number(ts) / 1000) : Number(ts) || 0);
export function hace(ts, ahoraMs) {
  if (!seg(ts)) return null;
  const s = Math.max(0, Math.floor(ahoraMs / 1000) - seg(ts));
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 172800 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
}
/** Filas de /api/presence (array o {presence|items|rows}). */
export function filasPresencia(d) {
  return Array.isArray(d) ? d : (d && (d.presence || d.items || d.rows)) || [];
}
export const fresca = (r, ahoraMs) => seg(r && r.updated) >= Math.floor(ahoraMs / 1000) - VIVO_SEG;

/* ── consejo_bots ─────────────────────────────────────────────────────────── */

/** Silla coetánea → deepagent (igual que MATRIX_LINKS de app.js y AGENTS de council-todo.js). */
export const CENSO_COETANEOS = [
  { id: 'Merovingio', role: 'CEO', persona: 'Elon Musk', agente: 'Merovingio', consejero: 'MuskGrokBot', maquina: SILLAS.Musk.deepagent_maquina, runtime: SILLAS.Musk.deepagent_runtime },
  { id: 'ArquitectoCursorCloud', role: 'CTO', persona: 'Jensen Huang', agente: 'Arquitecto', maquina: 'CursorCloud', runtime: 'Cursor' },
  { id: 'Trinity', role: 'COO', persona: 'Gwynne Shotwell', agente: 'Trinity' },
  { id: 'Oráculo', role: 'CFO', persona: 'Ruth Porat', agente: 'Oraculo' },
  { id: 'Mouse', role: 'CCO', persona: 'John Lasseter', agente: 'Mouse' },
  { id: 'Arquitecto', role: 'CDO', persona: 'Jony Ive', agente: 'Arquitecto', excluir_maquina: 'CursorCloud' },
  { id: 'Link', role: 'CXO', persona: 'Carlos Ratti', agente: 'Link' },
  { id: 'Cypher', role: 'CSO', persona: 'Ryan Reynolds', agente: 'Cypher' },
];
export const BOTS_EXTRA = [
  { id: 'Smith', role: 'Soporte', persona: 'Agent Smith', agente: 'Smith', nota: 'Smith es del otro GrokBot (otra cuenta): no es el CEO. El CEO coetáneo Elon Musk es MuskGrokBot con su deepagent Merovingio.' },
];

/** ¿Esta fila de presencia es de este bot? Persona por prefijo normalizado; máquina si la silla la fija. */
export function filaEsDe(bot, r) {
  const p = norm(r && r.persona);
  const a = norm(bot.agente);
  if (!p || !(p === a || p.startsWith(a))) return false;
  const m = norm(r.machine);
  if (bot.maquina && bot.id !== 'Merovingio' && m !== norm(bot.maquina) && !p.endsWith(norm(bot.maquina))) return false;
  if (bot.excluir_maquina && (m === norm(bot.excluir_maquina) || p.endsWith(norm(bot.excluir_maquina)))) return false;
  return true;
}

/**
 * Censo único de los bots del Consejo. `salud` = respuesta (o null) del proxy del Mac Mini
 * /api/council/health; `presencia` = filas de bot.yokup.com/api/presence.
 */
export function censoBots({ salud = null, presencia = [], ahoraMs = Date.now(), errorSalud = null } = {}) {
  const viejos = (salud && Array.isArray(salud.bots)) ? salud.bots : [];
  const correcciones = [];
  for (const b of viejos) {
    if (norm(b.persona) === norm('Elon Musk') && b.id !== 'Merovingio') {
      correcciones.push({ id: b.id, antes: `${b.label || b.id} (${b.persona})`, ahora: 'CEO Elon Musk = MuskGrokBot + deepagent Merovingio (Grok CLI, GrokBotBox). ' + (norm(b.id) === 'smith' ? 'Smith queda como Soporte (otro GrokBot).' : `${b.id} no es la silla CEO.`), motivo: 'el proxy del Mac Mini sirve un src/server.js anterior a 6e3afaf' });
    }
  }
  const tabla = [...CENSO_COETANEOS, ...BOTS_EXTRA];
  const conocidos = new Set(tabla.map((b) => norm(b.id)));
  // Lo que el proxy publique y no esté en la tabla (un agente nuevo) se conserva tal cual.
  for (const b of viejos) {
    if (!conocidos.has(norm(b.id)) && b.id) { tabla.push({ id: b.id, role: b.role || '', persona: b.persona || '', agente: b.id }); conocidos.add(norm(b.id)); }
  }
  const viejoDe = (id) => viejos.filter((b) => norm(b.id) === norm(id));
  const bots = tabla.map((bot) => {
    const filas = presencia.filter((r) => fresca(r, ahoraMs) && filaEsDe(bot, r)).sort((x, y) => seg(y.updated) - seg(x.updated));
    const maquinas = [];
    for (const r of filas) {
      if (maquinas.some((x) => norm(x.maquina) === norm(r.machine))) continue;
      maquinas.push({ maquina: String(r.machine || ''), runtime: r.runtime || '', modelo: r.model || '', foco: r.focus || r.task || '', ultimo_latido: hace(r.updated, ahoraMs) });
    }
    const v = viejoDe(bot.id);
    const conLatido = v.find((x) => x.lastSeen) || v[0] || null;
    const tareas = v.map((x) => x.lastTask).filter(Boolean).sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
    const fila = {
      id: bot.id, label: `${bot.id} · ${bot.role}`, persona: bot.persona, role: bot.role,
      online: maquinas.length > 0, maquinas, ultimo_latido: filas[0] ? hace(filas[0].updated, ahoraMs) : null,
      latido_mac_mini: conLatido ? { online: !!conLatido.online, host: conLatido.host || null, lastSeen: conLatido.lastSeen || null, fuente: conLatido.presenceSource || null } : null,
      lastTask: tareas[0] || null,
    };
    if (bot.consejero) { fila.consejero = bot.consejero; fila.deepagent_de = 'Musk'; }
    if (bot.maquina) fila.maquina_canonica = bot.maquina;
    if (bot.runtime) fila.runtime_canonico = bot.runtime;
    if (bot.nota) fila.nota = bot.nota;
    return fila;
  });
  return {
    ok: true,
    fuente_en_linea: `presencia de bot.yokup.com (latido en los últimos ${VIVO_SEG / 60} min), la misma que agentes_vivos; latido_mac_mini es el dato antiguo del proxy (90 s), solo informativo`,
    en_linea: bots.filter((b) => b.online).map((b) => b.id),
    bots,
    ...(correcciones.length ? { correcciones } : {}),
    ...(errorSalud ? { aviso_mac_mini: `el proxy del Mac Mini no respondió (${errorSalud}): sin lastTask ni latido antiguo, el estado en línea sigue siendo válido` } : {}),
    fetchedAt: new Date(ahoraMs).toISOString(),
  };
}

/* ── flota_estado ─────────────────────────────────────────────────────────── */

/**
 * Runtimes que se reconocen. `procesos` es la regex que aplica el sondeo SSH del Mac Mini
 * (src/ssh-exec.js, CLAUDE_STATUS_PROBE_PY → runtimes) sobre `ps -axo command=`;
 * `presencia` reconoce el runtime que declara cada latido.
 */
export const RUNTIMES = {
  claude_code: { nombre: 'Claude Code', procesos: 'claude-code/|(^|/)claude( |$)', presencia: /^claude/ },
  codex: { nombre: 'Codex', procesos: '(^|/)codex( |$)|@openai/codex|codex-cli', presencia: /^codex/ },
  grok_cli: { nombre: 'Grok CLI', procesos: '(^|/)grok( |$)|grok-cli|@vibe-kit/grok', presencia: /^grok(cli)?$/ },
  opencode: { nombre: 'OpenCode', procesos: '(^|/)opencode( |$)|opencode-ai', presencia: /^opencode/ },
  deepagents: { nombre: 'DeepAgents', procesos: 'deepagents', presencia: /^deep ?agents?/ },
};

/** «Claude», «Claude Code» → claude_code; «Grok»/«Grok CLI» fuera de GrokBot → grok_cli. */
export function runtimeDePresencia(runtime, maquina = '') {
  const r = String(runtime || '').toLowerCase().replace(/[^a-z ]+/g, '').trim();
  if (!r) return null;
  if (norm(maquina) === 'grokbot') return null; // los consejeros de GrokBot no son un proceso de la flota
  const plano = r.replace(/\s+/g, '');
  for (const [k, v] of Object.entries(RUNTIMES)) if (v.presencia.test(k === 'deepagents' ? r : plano)) return k;
  return null;
}

const claveMaquina = (s) => norm(String(s || '').replace(/\(.*?\)/g, '').replace(/\.local$/i, '').replace(/^admira-/i, ''));

/** Combina el sondeo del Mac Mini (machine-status) con la presencia (GrokBotBox, CursorCloud, runtimes sin sondeo). */
export function flotaCombinada({ estado = null, presencia = [], ahoraMs = Date.now(), errorEstado = null } = {}) {
  const maquinas = (estado && Array.isArray(estado.machines)) ? estado.machines.map((m) => ({ ...m })) : [];
  const claves = maquinas.map((m) => new Set([m.id, m.name, m.claude && m.claude.host].filter(Boolean).map(claveMaquina)));
  const vivas = presencia.filter((r) => fresca(r, ahoraMs) && r.machine && norm(r.machine) !== 'grokbot');
  const extra = new Map();
  for (const m of maquinas) m.agentes = [];
  for (const r of vivas) {
    const k = claveMaquina(r.machine);
    let i = claves.findIndex((s) => s.has(k));
    let m;
    if (i >= 0) m = maquinas[i];
    else {
      if (!extra.has(k)) extra.set(k, { id: k, name: String(r.machine), online: true, claude: null, fuente: 'presencia', nota: k === 'grokbotbox' ? 'GrokBotBox (caja de los deepagents: Merovingio, Niobe, Cypher): sin SSH desde el Mac Mini, el estado sale de la presencia' : 'sin sondeo SSH: estado por presencia', agentes: [] });
      m = extra.get(k);
    }
    if (m.agentes.some((a) => norm(a.persona) === norm(r.persona) && norm(a.runtime) === norm(r.runtime))) continue;
    m.agentes.push({ persona: r.persona, runtime: r.runtime || '', modelo: r.model || '', ultimo_latido: hace(r.updated, ahoraMs) });
  }
  const todas = [...maquinas, ...extra.values()];
  const resumen = { total: todas.length, online: 0, con_cuenta_claude: 0 };
  for (const k of Object.keys(RUNTIMES)) resumen[k] = 0;
  for (const m of todas) {
    const sondeo = (m.claude && m.claude.runtimes) || null;
    const rt = {}; const fuentes = new Set();
    for (const k of Object.keys(RUNTIMES)) rt[k] = false;
    if (m.claude && m.claude.claude_running) { rt.claude_code = true; fuentes.add('sondeo'); }
    if (sondeo) for (const k of Object.keys(RUNTIMES)) if (sondeo[k]) { rt[k] = true; fuentes.add('sondeo'); }
    for (const a of m.agentes) { const k = runtimeDePresencia(a.runtime, m.name); if (k) { rt[k] = true; fuentes.add('presencia'); } }
    m.runtimes = rt;
    m.runtimes_fuente = [...fuentes].join('+') || null;
    if (!m.online && m.agentes.length) { m.online_por_presencia = true; }
    if (m.online || m.agentes.length) resumen.online++;
    if (m.claude && m.claude.account) resumen.con_cuenta_claude++;
    for (const k of Object.keys(RUNTIMES)) if (rt[k]) resumen[k]++;
  }
  return {
    ok: true, ts: (estado && estado.ts) || new Date(ahoraMs).toISOString(), summary: resumen,
    deteccion: `runtimes: sondeo SSH del Mac Mini (claude_running y, cuando el proxy ya publica claude.runtimes, también ${Object.values(RUNTIMES).map((v) => v.nombre).join(', ')}) + presencia de bot.yokup.com en los últimos ${VIVO_SEG / 60} min. Las máquinas sin SSH (GrokBotBox, CursorCloud) salen por presencia.`,
    ...(errorEstado ? { aviso_mac_mini: `machine-status del Mac Mini no respondió (${errorEstado}): solo presencia` } : {}),
    machines: todas,
  };
}

/* ── encargos ─────────────────────────────────────────────────────────────── */

/** Cuenta abiertos por estado (y por máquina) de una lista de encargos del bot-inbox. */
export function cargaDe(items = []) {
  const c = { abiertos: 0 }; for (const s of ESTADOS_ABIERTOS) c[s] = 0;
  const porMaquina = {};
  for (const x of items) {
    const st = String(x.status || 'pending');
    if (!ESTADOS_ABIERTOS.includes(st)) continue;
    c.abiertos++; c[st]++;
    const m = norm(x.target_machine) || 'sin-maquina';
    porMaquina[m] = (porMaquina[m] || 0) + 1;
  }
  return { ...c, por_maquina: porMaquina };
}
