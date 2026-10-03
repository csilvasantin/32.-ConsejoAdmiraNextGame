'use strict';

// Chat de coetáneos → encargo MCP de admira.live (Elon Musk → su deepagent, el Merovingio;
// Jensen Huang → el suyo, Cypher).
//
// Marca común de los encargos de chat (acordada con Jensen, 01-10-2026):
//   [chat-coetaneos] <remitente> → <consejero>
//   Contexto:
//   <historial reciente «Nombre: texto»> | (sin historial)
//   Mensaje de <nombre <email>>:
//   <mensaje nuevo>
// El vigilante genérico de la GrokBotBox (modo chat) la reconoce y contesta corto, sin
// herramientas ni entregable; el worker admira-telegram no la publica en el Ágora/Telegram.
//
// Elon no vive en el Grok Bot de escritorio del Mac Mini (esa app es la otra cuenta:
// Jobs, Wozniak, Disney, Lucas), así que el adaptador AX no puede llegar a él. Su silla
// es Musk en la GrokBotBox y quien trabaja allí es su deepagent, el Merovingio, que ya
// atiende su bandeja de encargos del MCP con un vigilante (acuse → trabajo visible en
// su terminal → encargo_responder). Este proveedor convierte cada mensaje del chat en
// un encargo MCP para él y pinta su respuesta (la nota del encargo) en el chat.
// Norma de Carlos: todo trabajo entre agentes pasa por el MCP y queda registrado.
//
// - Cualquier sesión Google verificada por FleetControl (allowlist/superusers) puede
//   escribir; cada persona solo ve sus propios mensajes.
// - La clave MCP (la de la silla Musk) es server-only: fichero 0600 del usuario del
//   servicio, nunca viaja al navegador ni a los logs.
// - Idempotente por message_id; un fallo ambiguo no reenvía (queda «unknown»).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BridgeError, PERSONAS, canonicalPersona, createPrivateStore } = require('./grokbot-bridge');

const MCP_URL = 'https://mcp.admira.live/mcp';
const TARGETS = Object.freeze({
  Musk: Object.freeze({ persona: 'Merovingio', maquina: 'GrokBotBox', etiqueta: 'Merovingio · GrokBotBox' }),
  Huang: Object.freeze({ persona: 'Cypher', maquina: 'GrokBotBox', etiqueta: 'Cypher · GrokBotBox' }),
});
const MARCA = '[chat-coetaneos]';
const MAX_TEXTO = 3900;            // el bot-inbox acepta 4000
const MAX_CONTEXTO = 1600;
const TURNOS_CONTEXTO = 6;          // últimos intercambios que viajan como «Contexto»
// Nombre visible de quien escribe (la sesión de FleetControl solo trae el email).
const NOMBRES = Object.freeze({ 'csilva@admira.com': 'Carlos Silva', 'csilvasantin@gmail.com': 'Carlos Silva', 'jsedano@admira.com': 'Joshua' });
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const PUBLIC_ID = /^gb_[a-f0-9]{48}$/;
const MAX_PROMPT = 3000;
const MAX_RECORDS = 20000;
const REFRESH_MS = 2500;
const PRESENCE_URL = 'https://bot.yokup.com/api/presence';
const HEARTBEAT_MS = 120000, ACK_MS = 90000, DEDUP_MS = 120000;
const internalNote = text => /sin\s+ESTADO\s*:\s*done|(?:^|\n)\s*(?:ESTADO|Estado real)\s*:|encargo_sin_mision|Traceback|mcp_tool_error/i.test(String(text || ''));
const STATUS_MAP = Object.freeze({ pending: 'pending', ack: 'in_progress', in_progress: 'in_progress', blocked: 'blocked', done: 'done' });

function verifiedOwner(session) {
  const email = String(session && session.email || '').trim().toLowerCase();
  if (!email || !session.jti) throw new BridgeError(401, 'authenticated_session_required');
  return email;
}

function loadMcpKey(environment = process.env) {
  let key = '';
  if (Object.hasOwn(environment, 'GROKBOT_ENCARGO_MCP_KEY')) key = String(environment.GROKBOT_ENCARGO_MCP_KEY || '');
  else {
    const file = String(environment.GROKBOT_ENCARGO_MCP_KEY_FILE || path.join(os.homedir(), '.fleet', 'grokbot-encargo-mcp.key')).trim();
    if (!path.isAbsolute(file)) throw new BridgeError(503, 'encargo_not_configured');
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid()) || stat.size > 4096) throw new Error('unsafe_key_file');
      key = fs.readFileSync(fd, 'utf8');
    } catch (_) { throw new BridgeError(503, 'encargo_not_configured'); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  key = key.trim();
  if (!key || key.length > 4096 || /[\x00-\x20\x7f-\x9f]/.test(key)) throw new BridgeError(503, 'encargo_not_configured');
  return key;
}

// Cliente MCP mínimo (Streamable HTTP): initialize → initialized → tools/call.
function createMcpClient({ url = MCP_URL, keyProvider, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  async function post(body, sessionId, signal) {
    const headers = { authorization: 'Bearer ' + keyProvider(), 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal });
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('mcp_response_too_large');
    return { response, text };
  }
  function parse(text) {
    const line = text.split(/\r?\n/).map(l => l.startsWith('data: ') ? l.slice(6) : l).find(l => l.trim().startsWith('{'));
    if (!line) throw new Error('mcp_invalid_response');
    return JSON.parse(line);
  }
  async function call(name, args, { budgetMs = timeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fleet-control-chat-coetaneos', version: '1' } } }, null, controller.signal);
      if (!init.response.ok) throw new Error('mcp_initialize_failed');
      const sessionId = init.response.headers && init.response.headers.get ? init.response.headers.get('mcp-session-id') : null;
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId, controller.signal);
      const result = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, sessionId, controller.signal);
      if (!result.response.ok) throw new Error('mcp_call_failed');
      const data = parse(result.text);
      if (data.error) { const e = new Error('mcp_error'); e.rejected = true; throw e; }
      const res = data.result || {};
      const raw = (res.content || []).map(c => c && c.type === 'text' ? c.text : '').join('');
      if (res.isError) { const e = new Error('mcp_tool_error'); e.rejected = true; e.detail = raw.slice(0, 300); throw e; }
      if (res.structuredContent && typeof res.structuredContent === 'object') return res.structuredContent;
      try { return JSON.parse(raw); } catch (_) { return { texto: raw }; }
    } finally { clearTimeout(timer); }
  }
  return { call };
}

function nombreDe(owner, nombres = NOMBRES) {
  const n = nombres[String(owner || '').toLowerCase()];
  return n ? `${n} <${owner}>` : String(owner || 'alguien');
}
const corto = (texto, max) => { const t = String(texto || '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };

// historial: [{ prompt, text }] (de más antiguo a más reciente). Solo turnos ya contestados.
function encargoText(owner, persona, prompt, { history = [], nombres = NOMBRES } = {}) {
  const consejero = PERSONAS[persona] || persona;
  const remitente = nombreDe(owner, nombres);
  const pila = (nombres[String(owner || '').toLowerCase()] || String(owner || 'Usuario')).split(/\s+/)[0];
  const cabecera = `${MARCA} ${remitente.replace(/\s*<.*$/, '')} → ${consejero}`;
  const mensaje = String(prompt || '').trim();
  const pie = `Mensaje de ${remitente}:\n${mensaje}`;
  let presupuesto = Math.min(MAX_CONTEXTO, MAX_TEXTO - cabecera.length - pie.length - 20);
  const lineas = [];
  for (const turno of history.slice(-TURNOS_CONTEXTO).reverse()) {
    const par = [`${pila}: ${corto(turno.prompt, 300)}`, `${consejero}: ${corto(turno.text, 400)}`];
    const coste = par.join('\n').length + 1;
    if (coste > presupuesto) break;
    presupuesto -= coste; lineas.unshift(...par);
  }
  return [cabecera, 'Contexto:', lineas.length ? lineas.join('\n') : '(sin historial)', pie].join('\n');
}

// GROKBOT_ENCARGO_SILLAS=Musk,Huang limita qué sillas van por encargo (por defecto, todas las de TARGETS).
function sillasActivas(environment, targets) {
  const raw = String(environment.GROKBOT_ENCARGO_SILLAS || '').trim();
  if (!raw) return targets;
  const pedidas = new Set(raw.split(/[\s,]+/).map(canonicalPersona).filter(Boolean));
  return Object.freeze(Object.fromEntries(Object.entries(targets).filter(([k]) => pedidas.has(k))));
}

function createGrokBotEncargo({ environment = process.env, fetchImpl = globalThis.fetch, now = Date.now, store, keyProvider, mcp, targets: allTargets = TARGETS, presenceProvider } = {}) {
  const targets = sillasActivas(environment, allTargets);
  const state = store || createPrivateStore(environment.GROKBOT_ENCARGO_STATE_FILE || path.join(os.homedir(), '.fleet', 'grokbot-encargo-state.json'));
  const getKey = keyProvider || (() => loadMcpKey(environment));
  const client = mcp || createMcpClient({ keyProvider: getKey, fetchImpl });
  const inflight = new Map();
  const lastRefresh = new Map();
  const incoming = new Map();
  const fallbackRuns = new Map();
  async function presence(p) {
    try {
      const data = presenceProvider ? await presenceProvider() : await (await fetchImpl(PRESENCE_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' })).json();
      const t = targets[p];
      const row = (data.presence || []).find(r => r.persona === t.persona && r.machine === t.maquina && r.runtime === 'DeepAgents' &&
        Number(r.updated) * 1000 <= now() + 30000 && now() - Number(r.updated) * 1000 <= HEARTBEAT_MS);
      return { signal: !!row, heartbeatAt: row ? new Date(Number(row.updated) * 1000).toISOString() : null };
    } catch (_) { return { signal: false, heartbeatAt: null }; }
  }
  function fallbackEligible(r) {
    return !r.replyProvider && (r.responseUnavailable || (['pending', 'unknown'].includes(r.status) && !r.acknowledgedAt && now() - Date.parse(r.createdAt) >= ACK_MS));
  }
  function runFallback(id) {
    if (fallbackRuns.has(id)) return fallbackRuns.get(id);
    const op = (async () => {
      const rec = state.transact(records => {
        const e = records.get(id); e.replyProvider = 'council-api'; e.notice = e.notice || 'Respuesta por Grok 4.6 · API del Consejo'; e.status = 'in_progress'; e.text = ''; e.updatedAt = new Date(now()).toISOString(); return e;
      });
      const history = [...state.read().values()].filter(r => r.owner === rec.owner && r.persona === rec.persona && r.id !== id && r.status === 'done' && r.text)
        .sort((a,b) => a.createdAt.localeCompare(b.createdAt)).slice(-TURNOS_CONTEXTO)
        .flatMap(r => [{ role: 'user', content: corto(r.prompt, 300) }, { role: 'assistant', content: corto(r.text, 400) }]);
      if(rec.prompt.length>1000)history.push({role:'user',content:rec.prompt});
      try {
        const result = await client.call('consejero_preguntar', { rol: rec.persona === 'Musk' ? 'CEO' : 'CTO', mensaje: rec.prompt.length>1000?'Responde al último mensaje del usuario incluido en el contexto.':rec.prompt, generacion: 'coetaneos', llm: 'grok-4.6', max_tokens: 1000, contexto: history }, { budgetMs: 45000 });
        const text = String(typeof result.content === 'string' ? result.content : result.texto || '').replace(/^[^\n]* · [^\n]*\([^\n]*\):\n/, '').trim();
        if (!text || internalNote(text)) throw new Error('empty_council_answer');
        state.transact(records => { const e = records.get(id); e.status = 'done'; e.text = text.slice(0,20000); e.updatedAt = new Date(now()).toISOString(); return e; });
      } catch (_) {
        state.transact(records => { const e = records.get(id); e.status = 'failed'; e.text = ''; e.notice = 'El Consejo no ha podido responder. Inténtalo más tarde.'; e.updatedAt = new Date(now()).toISOString(); return e; });
      }
    })();
    fallbackRuns.set(id,op);
    op.finally(() => fallbackRuns.delete(id));
    return op;
  }
  function fallback(session, id) {
    const owner = verifiedOwner(session), r = state.read().get(id);
    if (!r || r.owner !== owner) throw new BridgeError(404, 'message_not_found');
    if (r.replyProvider) return publicMessage(r);
    if (!fallbackEligible(r)) throw new BridgeError(409, 'fallback_not_ready');
    runFallback(id);
    return publicMessage(state.read().get(id));
  }

  const handles = value => { const p = canonicalPersona(value); return Boolean(p && targets[p]); };
  function target(value) {
    const p = canonicalPersona(value);
    if (!p || !targets[p]) throw new BridgeError(400, 'unsupported_persona');
    return p;
  }
  function publicMessage(r) {
    return { id: r.id, persona: r.persona, status: r.status, prompt: r.prompt, text: internalNote(r.text) ? '' : r.text || '', createdAt: r.createdAt, updatedAt: r.updatedAt,
      source: 'encargo', native: true, replyProvider: r.replyProvider || 'deepagent', notice: r.notice || '', fallbackAvailable: fallbackEligible(r), encargo: r.encargo || null, etiqueta: r.etiqueta || null, attachments: [] };
  }
  function iso(value) { const d = new Date(String(value || '').replace(' UTC', 'Z').replace(' ', 'T')); return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(now()).toISOString(); }

  async function capabilities(session, persona) {
    verifiedOwner(session);
    const p = canonicalPersona(persona);
    let available = true, reason = '';
    try { getKey(); state.read(); } catch (error) { available = false; reason = error.code || 'encargo_unavailable'; }
    const t = p && targets[p];
    const live = t ? await presence(p) : { signal: false, heartbeatAt: null };
    return { ...live, fallbackModel: 'Grok 4.6', provider: 'encargo', mode: 'encargo', available, bidirectional: available, reason, selectedPersona: p || null, status: 'idle',
      lastObservedAt: new Date(now()).toISOString(), destino: t ? t.etiqueta : null, agente: t ? t.persona : null, historyFromDesktop: false, partialVisibleHistory: false,
      desktop: false, attachments: false, routines: false, interrupt: false, pollingIntervalMs: 3000,
      personas: Object.keys(targets).map(k => ({ persona: k, name: PERSONAS[k] })) };
  }
  function select(session, persona) { verifiedOwner(session); return { selectedPersona: target(persona), status: 'idle' }; }

  async function refreshOne(id) {
    if (inflight.has(id)) return inflight.get(id);
    const op = (async () => {
      lastRefresh.set(id, now());
      const rec = state.read().get(id);
      if (!rec || !rec.encargo || rec.replyProvider || ['done', 'failed'].includes(rec.status)) return rec;
      let data;
      try { data = await client.call('encargo_estado', { encargo: rec.encargo }); } catch (_) { return rec; }
      const mapped = STATUS_MAP[String(data && data.estado || '')];
      if (!mapped) return rec;
      const candidate = mapped === 'done' ? String(data.respuesta || data.nota || '').slice(0,20000) : '';
      const text = internalNote(candidate) ? '' : candidate;
      return state.transact(records => {
        const entry = records.get(id);
        if (!entry || entry.replyProvider) return entry;
        if (data.acuse || mapped === 'in_progress') entry.acknowledgedAt = data.acuse || new Date(now()).toISOString();
        if (mapped === 'done' && !text) entry.responseUnavailable = true;
        if (entry.status !== mapped || entry.text !== text) { entry.status = mapped; entry.text = text; entry.updatedAt = iso(data.cierre || data.acuse); }
        return entry;
      });
    })();
    inflight.set(id, op);
    try { return await op; } finally { inflight.delete(id); }
  }
  function refreshStale(records) {
    for (const r of records) {
      if (!r.encargo || ['done', 'failed'].includes(r.status)) continue;
      if (now() - (lastRefresh.get(r.id) || 0) < REFRESH_MS) continue;
      refreshOne(r.id).catch(() => {});
    }
  }

  function list(session, persona) {
    const owner = verifiedOwner(session), p = target(persona);
    const rows = [...state.read().values()].filter(r => r.owner === owner && r.persona === p).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-100);
    refreshStale(rows);
    return rows.map(publicMessage);
  }

  async function get(session, id) {
    const owner = verifiedOwner(session);
    if (!PUBLIC_ID.test(String(id))) return null;
    const rec = state.read().get(id);
    if (!rec) return null;
    if (rec.owner !== owner) throw new BridgeError(404, 'message_not_found');
    if (now() - (lastRefresh.get(id) || 0) >= REFRESH_MS) return publicMessage(await refreshOne(id) || rec);
    return publicMessage(rec);
  }

  async function send(session, body) {
    const owner = verifiedOwner(session);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BridgeError(400, 'invalid_message');
    if (Array.isArray(body.attachments) && body.attachments.length) throw new BridgeError(400, 'desktop_attachments_unavailable');
    if (Object.keys(body).some(k => !['persona', 'prompt', 'message_id', 'attachments'].includes(k))) throw new BridgeError(400, 'unsupported_message_field');
    const p = target(body.persona);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!MESSAGE_ID.test(String(body.message_id || ''))) throw new BridgeError(400, 'invalid_message_id');
    if (prompt.length < 2 || prompt.length > MAX_PROMPT) throw new BridgeError(400, 'invalid_prompt');
    const id = 'gb_' + crypto.createHash('sha256').update(owner + '\0encargo\0' + body.message_id).digest('hex').slice(0, 48);
    let isNew = false, history = [];
    const record = state.transact(records => {
      const prior = records.get(id);
      if (prior) {
        if (prior.owner !== owner || prior.persona !== p || prior.prompt !== prompt) throw new BridgeError(409, 'message_id_conflict');
        return prior;
      }
      const duplicate = [...records.values()].find(r => r.owner === owner && r.persona === p && r.prompt === prompt &&
        now() - Date.parse(r.createdAt) < DEDUP_MS && !r.acknowledgedAt && ['pending', 'unknown', 'in_progress'].includes(r.status));
      if (duplicate) return duplicate;
      getKey();
      if (records.size >= MAX_RECORDS) throw new BridgeError(503, 'bridge_capacity_reached');
      history = [...records.values()].filter(r => r.owner === owner && r.persona === p && r.status === 'done' && r.text)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-TURNOS_CONTEXTO).map(r => ({ prompt: r.prompt, text: r.text }));
      const ts = new Date(now()).toISOString();
      const entry = { id, owner, persona: p, prompt, text: '', status: 'unknown', createdAt: ts, updatedAt: ts, encargo: null, etiqueta: null };
      records.set(id, entry); isNew = true; return entry;
    });
    if (!isNew) return incoming.has(record.id) ? incoming.get(record.id) : publicMessage(record);
    const t = targets[p];
    const op = (async () => {
      const live = await presence(p);
      if (!live.signal) {
        state.transact(records => { const e = records.get(id); e.notice = targets[p].persona + ' sin señal · respuesta por Grok 4.6'; return e; });
        runFallback(id);
        return publicMessage(state.read().get(id));
      }
      let r;
      try {
        r = await client.call('agente_encargar', { persona: t.persona, maquina: t.maquina, de: ('Chat coetáneos admira.live · ' + owner).slice(0, 80), texto: encargoText(owner, p, prompt, { history }) });
        if (!r || !Number.isSafeInteger(Number(r.encargo)) || Number(r.encargo) <= 0) throw new Error('missing_receipt');
      } catch (error) {
        // Rechazo explícito del MCP: no se creó nada → failed. Ambiguo (red/timeout): unknown, sin reintentar.
        if (error && error.rejected) {
          return publicMessage(state.transact(records => { const e = records.get(id); e.status = 'failed'; e.text = 'No se pudo crear el encargo en el MCP de admira.live.'; e.updatedAt = new Date(now()).toISOString(); return e; }));
        }
        return publicMessage(record);
      }
      return publicMessage(state.transact(records => {
        const e = records.get(id);
        e.encargo = Number(r.encargo); e.etiqueta = r.etiqueta ? String(r.etiqueta).slice(0, 40) : null; e.status = 'pending'; e.updatedAt = new Date(now()).toISOString();
        lastRefresh.set(id, now());
        return e;
      }));
    })();
    incoming.set(id, op);
    try { return await op; } finally { incoming.delete(id); }
  }

  return { handles, capabilities, select, list, get, send, fallback };
}

// Enruta por persona: las sillas con destino MCP (Elon) van al encargo; el resto, al
// proveedor de siempre (escritorio AX del Mac Mini o webhook).
function createGrokBotRouter({ base, encargo }) {
  const routed = persona => encargo.handles(persona);
  const router = {
    capabilities: (session, persona) => routed(persona) ? encargo.capabilities(session, persona) : base.capabilities(session),
    list: (session, persona) => routed(persona) ? encargo.list(session, persona) : base.list(session, persona),
    select: (session, persona) => routed(persona) ? encargo.select(session, persona) : (base.select ? base.select(session, persona) : (() => { throw new BridgeError(503, 'desktop_chat_not_configured'); })()),
    send: (session, body) => routed(body && body.persona) ? encargo.send(session, body) : base.send(session, body),
    fallback: (session,id) => encargo.fallback(session,id),
    async get(session, id) {
      let mine = null;
      try { mine = await encargo.get(session, id); } catch (error) { if (error.code !== 'bridge_state_unavailable') throw error; }
      return mine || base.get(session, id);
    },
    start: () => base.start && base.start(),
    stop: () => base.stop && base.stop(),
  };
  if (base.upload) router.upload = (...args) => base.upload(...args);
  if (base.remote) router.remote = (...args) => base.remote(...args);
  if (base.controls) router.controls = (session, body) => { if (routed(body && body.persona)) throw new BridgeError(503, 'desktop_controls_unavailable'); return base.controls(session, body); };
  return router;
}

module.exports = { TARGETS, MARCA, createGrokBotEncargo, createGrokBotRouter, createMcpClient, loadMcpKey, encargoText, nombreDe };
