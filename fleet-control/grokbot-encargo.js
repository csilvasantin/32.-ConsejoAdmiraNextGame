'use strict';

// Chat de coetáneos → encargo MCP de admira.live (Elon Musk → su deepagent, el Merovingio).
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
const TARGETS = Object.freeze({ Musk: Object.freeze({ persona: 'Merovingio', maquina: 'GrokBotBox', etiqueta: 'Merovingio · GrokBotBox' }) });
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const PUBLIC_ID = /^gb_[a-f0-9]{48}$/;
const MAX_PROMPT = 3000;
const MAX_RECORDS = 20000;
const REFRESH_MS = 8000;
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
  async function post(body, sessionId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { authorization: 'Bearer ' + keyProvider(), 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
      if (sessionId) headers['mcp-session-id'] = sessionId;
      const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: controller.signal });
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error('mcp_response_too_large');
      return { response, text };
    } finally { clearTimeout(timer); }
  }
  function parse(text) {
    const line = text.split(/\r?\n/).map(l => l.startsWith('data: ') ? l.slice(6) : l).find(l => l.trim().startsWith('{'));
    if (!line) throw new Error('mcp_invalid_response');
    return JSON.parse(line);
  }
  async function call(name, args) {
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fleet-control-chat-coetaneos', version: '1' } } });
    if (!init.response.ok) throw new Error('mcp_initialize_failed');
    const sessionId = init.response.headers && init.response.headers.get ? init.response.headers.get('mcp-session-id') : null;
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    const result = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, sessionId);
    if (!result.response.ok) throw new Error('mcp_call_failed');
    const data = parse(result.text);
    if (data.error) { const e = new Error('mcp_error'); e.rejected = true; throw e; }
    const res = data.result || {};
    const raw = (res.content || []).map(c => c && c.type === 'text' ? c.text : '').join('');
    if (res.isError) { const e = new Error('mcp_tool_error'); e.rejected = true; e.detail = raw.slice(0, 300); throw e; }
    if (res.structuredContent && typeof res.structuredContent === 'object') return res.structuredContent;
    try { return JSON.parse(raw); } catch (_) { return { texto: raw }; }
  }
  return { call };
}

function encargoText(owner, persona, prompt) {
  const nombre = PERSONAS[persona] || persona;
  return [
    `Mensaje del chat de coetáneos de admira.live para ${nombre} (CEO coetáneo), escrito por ${owner}.`,
    `Contesta TÚ como ${nombre}, en primera persona, en castellano, en texto plano y breve (máximo unos 900 caracteres): tu respuesta final sale tal cual en ese chat.`,
    'Tu respuesta final (antes de la línea ESTADO) debe ser SOLO lo que Elon le contesta a esa persona: sin contar qué has hecho, sin rutas ni entregables (aquí no hacen falta).',
    'Es conversación, no una misión: no cambies código, sistemas ni datos salvo que el mensaje lo pida expresamente y sea seguro; si pide algo grande, di qué harías y que lo tramitarás aparte.',
    '',
    'MENSAJE:',
    prompt,
  ].join('\n');
}

function createGrokBotEncargo({ environment = process.env, fetchImpl = globalThis.fetch, now = Date.now, store, keyProvider, mcp, targets = TARGETS } = {}) {
  const state = store || createPrivateStore(environment.GROKBOT_ENCARGO_STATE_FILE || path.join(os.homedir(), '.fleet', 'grokbot-encargo-state.json'));
  const getKey = keyProvider || (() => loadMcpKey(environment));
  const client = mcp || createMcpClient({ keyProvider: getKey, fetchImpl });
  const inflight = new Map();
  const lastRefresh = new Map();
  const incoming = new Map();

  const handles = value => { const p = canonicalPersona(value); return Boolean(p && targets[p]); };
  function target(value) {
    const p = canonicalPersona(value);
    if (!p || !targets[p]) throw new BridgeError(400, 'unsupported_persona');
    return p;
  }
  function publicMessage(r) {
    return { id: r.id, persona: r.persona, status: r.status, prompt: r.prompt, text: r.text || '', createdAt: r.createdAt, updatedAt: r.updatedAt,
      source: 'encargo', native: true, encargo: r.encargo || null, etiqueta: r.etiqueta || null, attachments: [] };
  }
  function iso(value) { const d = new Date(String(value || '').replace(' UTC', 'Z').replace(' ', 'T')); return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(now()).toISOString(); }

  function capabilities(session, persona) {
    verifiedOwner(session);
    const p = canonicalPersona(persona);
    let available = true, reason = '';
    try { getKey(); state.read(); } catch (error) { available = false; reason = error.code || 'encargo_unavailable'; }
    const t = p && targets[p];
    return { provider: 'encargo', mode: 'encargo', available, bidirectional: available, reason, selectedPersona: p || null, status: 'idle',
      lastObservedAt: new Date(now()).toISOString(), destino: t ? t.etiqueta : null, historyFromDesktop: false, partialVisibleHistory: false,
      desktop: false, attachments: false, routines: false, interrupt: false, pollingIntervalMs: 3000,
      personas: Object.keys(targets).map(k => ({ persona: k, name: PERSONAS[k] })) };
  }
  function select(session, persona) { verifiedOwner(session); return { selectedPersona: target(persona), status: 'idle' }; }

  async function refreshOne(id) {
    if (inflight.has(id)) return inflight.get(id);
    const op = (async () => {
      lastRefresh.set(id, now());
      const rec = state.read().get(id);
      if (!rec || !rec.encargo || ['done', 'failed'].includes(rec.status)) return rec;
      let data;
      try { data = await client.call('encargo_estado', { encargo: rec.encargo }); } catch (_) { return rec; }
      const mapped = STATUS_MAP[String(data && data.estado || '')];
      if (!mapped) return rec;
      const text = (mapped === 'done' || mapped === 'blocked') ? String(data.respuesta || data.nota || '').slice(0, 20000) : '';
      return state.transact(records => {
        const entry = records.get(id);
        if (!entry) return entry;
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
    let isNew = false;
    const record = state.transact(records => {
      const prior = records.get(id);
      if (prior) {
        if (prior.owner !== owner || prior.persona !== p || prior.prompt !== prompt) throw new BridgeError(409, 'message_id_conflict');
        return prior;
      }
      getKey();
      if (records.size >= MAX_RECORDS) throw new BridgeError(503, 'bridge_capacity_reached');
      const ts = new Date(now()).toISOString();
      const entry = { id, owner, persona: p, prompt, text: '', status: 'unknown', createdAt: ts, updatedAt: ts, encargo: null, etiqueta: null };
      records.set(id, entry); isNew = true; return entry;
    });
    if (!isNew) return incoming.has(id) ? incoming.get(id) : publicMessage(record);
    const t = targets[p];
    const op = (async () => {
      let r;
      try {
        r = await client.call('agente_encargar', { persona: t.persona, maquina: t.maquina, de: ('Chat coetáneos admira.live · ' + owner).slice(0, 80), texto: encargoText(owner, p, prompt) });
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

  return { handles, capabilities, select, list, get, send };
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

module.exports = { TARGETS, createGrokBotEncargo, createGrokBotRouter, createMcpClient, loadMcpKey, encargoText };
