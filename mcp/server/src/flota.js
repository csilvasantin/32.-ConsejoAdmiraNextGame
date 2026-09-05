/*
 * flota.js — hablar con los agentes de la flota y con los consejeros DESDE el MCP
 * (FLT-2038, Carlos, 5-sep-2026: «el MCP de admira.live para que se puedan conectar
 * con los consejeros y los agentes de forma automática»).
 *
 * Hasta hoy el MCP servía para que un consejero de GrokBot leyera SU bandeja. Lo que
 * faltaba era el otro sentido: que cualquier cliente MCP (Claude Code, Codex, OpenCode,
 * GrokBot, un humano con Claude Desktop) pueda ver quién está vivo, encargar trabajo a
 * una persona concreta y recoger la respuesta sin mirar Telegram. El encargo entra por
 * el mismo bot-inbox que usa el grupo AgoraMatrix (worker admira-telegram):
 *   · a un agente de la flota lo recoge su vigilante (agent-inbox-watcher.sh) en la
 *     máquina donde late y se lo inyecta en su sesión tmux;
 *   · a un consejero de GrokBot (Wozniak, Jobs, Lucas, Disney) el worker lo despierta
 *     por el webhook de su rutina (despertarConsejero) y contesta en 1-3 minutos.
 * La respuesta queda en la nota del encargo y en hilo en Telegram; aquí se lee con
 * encargo_estado.
 */

export const AGENTES_FLOTA = ['Neo', 'Morfeo', 'Trinity', 'Oraculo', 'Smith', 'Cypher', 'Switch', 'Niobe', 'Link', 'Persefone', 'Seraph'];
export const CONSEJEROS = ['Wozniak', 'Jobs', 'Lucas', 'Disney'];
export const PERSONAS = [...AGENTES_FLOTA, ...CONSEJEROS];
const MAQUINA_CONSEJEROS = 'grokbot';
const VIVO_SEG = 900;

const limpiar = (s) => String(s || '').replace(/\/+$/, '');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** «Oráculo», «oraculo», «OraculoMacMini» → «Oraculo» (la persona del diccionario). */
export function personaCanonica(nombre) {
  const n = norm(nombre);
  if (!n) return null;
  return PERSONAS.find((p) => n === norm(p)) || PERSONAS.find((p) => n.startsWith(norm(p))) || null;
}
export const esConsejero = (persona) => CONSEJEROS.includes(personaCanonica(persona));

export function crearFlota(env = {}, identidad, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = limpiar(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com');
  const via = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? (u, i) => env.TELEGRAM.fetch(u, i) : doFetch;
  const ahora = deps.now || (() => Date.now());

  async function llamar(url, init = {}, { auth = true } = {}) {
    if (auth && !env.ADMIRA_TELEGRAM_PANEL_KEY) throw new Error('falta ADMIRA_TELEGRAM_PANEL_KEY en el worker');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30_000);
    let r;
    try {
      r = await via(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/1.0', ...(auth ? { authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}` } : {}), ...(init.headers || {}) } });
    } catch (e) { throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`); }
    finally { clearTimeout(t); }
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!r.ok) { const d = body && (body.error || body.raw) || r.statusText; throw new Error(`${r.status} en ${url}: ${typeof d === 'string' ? d : JSON.stringify(d)}`); }
    return body;
  }

  const seg = (ts) => (Number(ts) > 4102444800 ? Math.floor(Number(ts) / 1000) : Number(ts) || 0);
  const cuando = (ts) => (seg(ts) ? new Date(seg(ts) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');
  const hace = (ts) => { const s = Math.max(0, Math.floor(ahora() / 1000) - seg(ts)); return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`; };

  /** Filas de presencia con latido en los últimos 15 min (la lista es pública). */
  async function presenciaViva() {
    const d = await llamar(`${base}/api/presence`, {}, { auth: false });
    const filas = Array.isArray(d) ? d : (d && (d.items || d.presence || d.rows)) || [];
    const corte = Math.floor(ahora() / 1000) - VIVO_SEG;
    return filas.filter((r) => seg(r.updated) >= corte && personaCanonica(r.persona) && !esConsejero(r.persona));
  }

  /** Quién está vivo ahora: agentes por persona y máquina; los consejeros, siempre. */
  async function vivos() {
    const filas = await presenciaViva();
    const porPersona = new Map();
    for (const r of filas) {
      const p = personaCanonica(r.persona);
      if (!porPersona.has(p)) porPersona.set(p, []);
      const lista = porPersona.get(p);
      if (lista.some((x) => norm(x.maquina) === norm(r.machine))) continue;
      lista.push({ maquina: String(r.machine || ''), runtime: r.runtime || '', foco: r.focus || r.task || '', ultimo_latido: hace(r.updated) });
    }
    const agentes = [...porPersona.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([persona, maquinas]) => ({ persona, maquinas }));
    return {
      consejeros: CONSEJEROS.map((persona) => ({ persona, equipo: 'GrokBot', disponibilidad: 'siempre: se le despierta por webhook, contesta en 1-3 min' })),
      agentes,
      sin_senal: AGENTES_FLOTA.filter((p) => !porPersona.has(p)),
      como_encargar: 'agente_encargar con persona (y máquina si hay varias); luego encargo_estado con el número devuelto. Un agente sin señal recibe el encargo en cola y lo coge al despertar; a los 30 min sin acuse se reasigna al agente vivo con menos carga.',
    };
  }

  /** Máquina donde late la persona (una sola, o la de latido más reciente). */
  async function maquinaDe(persona) {
    const filas = (await presenciaViva()).filter((r) => personaCanonica(r.persona) === persona).sort((a, b) => seg(b.updated) - seg(a.updated));
    return filas[0] ? norm(filas[0].machine) : '';
  }

  /** Crear un encargo para una persona (agente de la flota o consejero). */
  async function encargar({ persona, maquina = '', texto, proyecto_id = '', de = '' }) {
    const p = personaCanonica(persona);
    if (!p) throw new Error(`persona desconocida «${persona}»: vale ${PERSONAS.join(', ')}`);
    const cuerpo = String(texto || '').trim();
    if (cuerpo.length < 5) throw new Error('el encargo necesita texto (qué hay que hacer y para qué)');
    let destino = maquina ? norm(maquina) : '';
    let nota = '';
    if (esConsejero(p)) { destino = MAQUINA_CONSEJEROS; nota = 'consejero de GrokBot: el worker lo despierta por su webhook; suele contestar en 1-3 min'; }
    else if (!destino) {
      destino = await maquinaDe(p);
      nota = destino ? `en cola para ${p} en ${destino} (la máquina donde late ahora); su vigilante lo inyecta en su sesión en ≤15 s` : `${p} no late en ningún equipo desde hace 15 min: el encargo queda en cola y lo cogerá al despertar; a los 30 min sin acuse se reasigna`;
    } else nota = `en cola para ${p} en ${destino}; si allí no late, a los 30 min se reasigna`;
    const firma = de || (identidad ? identidad.agent : 'MCP admira.live');
    // Contrato del bot-inbox: con proyecto el encargo nace como misión FLT en yokup; sin proyecto
    // es conversación (materialize_mission:false) y no ensucia el tablero de misiones.
    const body = { text: cuerpo, target_persona: p, target_machine: destino, from: firma };
    if (proyecto_id) { body.project_id = proyecto_id; body.materialize_mission = true; } else body.materialize_mission = false;
    const r = await llamar(`${base}/api/bot-inbox`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r || !r.ok) throw new Error(`el bot-inbox no aceptó el encargo: ${JSON.stringify(r)}`);
    return { ok: true, encargo: Number(r.id), task_id: r.task_id || null, persona: p, maquina: destino || null, de: firma, proyecto_id: r.project_id || proyecto_id || null, mision_en_yokup: !!proyecto_id,
      nota, siguiente: `encargo_estado con encargo=${r.id} para leer el acuse y la respuesta (se publica también en hilo en Telegram y en admira.live/telegram)` };
  }

  /** Estado y respuesta de un encargo por su número. */
  async function estado({ encargo }) {
    const d = await llamar(`${base}/api/bot-inbox/${Number(encargo)}`);
    const x = d && d.item; if (!x) throw new Error(`encargo #${encargo} no encontrado`);
    const st = String(x.status || 'pending');
    const lectura = { pending: 'pendiente: nadie lo ha cogido aún', ack: 'acusado: lo ha cogido y está en ello', in_progress: 'en curso', blocked: 'bloqueado: mira la nota', done: 'hecho: la respuesta está en «respuesta»' }[st] || st;
    return { encargo: Number(x.id), estado: st, lectura, persona: x.target_persona || null, maquina: x.target_machine || null, de: x.from_name || '', cuando: cuando(x.ts),
      acuse: x.ack_at ? cuando(x.ack_at) : null, cierre: x.done_at ? cuando(x.done_at) : null, texto: String(x.text || ''), respuesta: x.note || '', proyecto_id: x.project_id || null, task_id: x.task_id || null };
  }

  return { vivos, encargar, estado, maquinaDe };
}
