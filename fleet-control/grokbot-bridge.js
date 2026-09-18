'use strict';

// Grok Bot's existing webhook/MCP inbox, not the native desktop transcript.
// Credentials and upstream inbox ids never leave this authenticated relay.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROVIDER = 'https://bot.yokup.com/api/bot-inbox';
const PERSONAS = Object.freeze({ Jobs:'Steve Jobs', Wozniak:'Steve Wozniak', Disney:'Walt Disney', Lucas:'George Lucas' });
const MAX_RECORDS = 20000;
const MAX_PROMPT = 16000;
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const PUBLIC_ID = /^gb_[a-f0-9]{48}$/;
const STATUS = new Set(['pending', 'in_progress', 'done', 'blocked', 'failed', 'unknown']);

class BridgeError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
function canonicalPersona(value) {
  const name = String(value || '').trim().toLowerCase();
  return Object.keys(PERSONAS).find(key => key.toLowerCase() === name || PERSONAS[key].toLowerCase() === name) || null;
}
function verifiedOwner(session) {
  // The caller supplies only claims from fleet-control's successful Google gate.
  const email = String(session && session.email || '').trim().toLowerCase();
  if (!email || !session.jti) throw new BridgeError(401, 'authenticated_session_required');
  return email;
}
function loadProviderToken(environment = process.env) {
  let token = '';
  if (Object.hasOwn(environment, 'ADMIRA_TELEGRAM_PANEL_KEY')) token = String(environment.ADMIRA_TELEGRAM_PANEL_KEY || '');
  else if (Object.hasOwn(environment, 'ADMIRA_TELEGRAM_PANEL_KEY_FILE')) {
    const file = String(environment.ADMIRA_TELEGRAM_PANEL_KEY_FILE || '').trim();
    if (!path.isAbsolute(file)) throw new BridgeError(503, 'provider_not_configured');
    let descriptor;
    try {
      descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid()) || stat.size > 4096) throw new Error('unsafe_provider_file');
      token = fs.readFileSync(descriptor, 'utf8');
    }
    catch (_) { throw new BridgeError(503, 'provider_not_configured'); }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  // This is an opaque credential issued by the existing provider, not our HMAC
  // signing secret. Do not impose the unrelated session-secret entropy policy.
  if (!token.trim() || Buffer.byteLength(token,'utf8') > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(token)) throw new BridgeError(503, 'provider_not_configured');
  return token.trim();
}

function createPrivateStore(file) {
  if (!path.isAbsolute(file)) throw new Error('GROKBOT_BRIDGE_STATE_FILE must be absolute');
  const folder = path.dirname(file);
  function check(stat) {
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid())) throw new Error('unsafe_state');
  }
  function read() {
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(fd); check(stat);
      if (stat.size > 64 * 1024 * 1024) throw new Error('state_too_large');
      const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.messages)) throw new Error('invalid_state');
      const records = new Map();
      for (const record of data.messages) {
        if (!record || !PUBLIC_ID.test(record.id) || !record.owner || !STATUS.has(record.status) || !PERSONAS[record.persona]) throw new Error('invalid_record');
        records.set(record.id, record);
      }
      return records;
    } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function transact(update) {
    let lockFd, temporary;
    try {
      fs.mkdirSync(folder, {recursive:true, mode:0o700});
      const parent = fs.lstatSync(folder);
      if (!parent.isDirectory() || (parent.mode & 0o022) || (process.getuid && parent.uid !== process.getuid())) throw new Error('unsafe_directory');
      // Short synchronous lock covers read+reserve+commit across local processes.
      // A stale lock fails closed; it never causes a second upstream submission.
      lockFd = fs.openSync(file + '.lock', fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      const records = read();
      const result = update(records);
      const serialized = JSON.stringify({version:1, messages:[...records.values()]});
      if (Buffer.byteLength(serialized,'utf8') > 64 * 1024 * 1024) throw new BridgeError(503, 'bridge_capacity_reached');
      temporary = file + '.' + crypto.randomBytes(12).toString('hex') + '.tmp';
      const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file); temporary = null;
      // Persist the reservation before network I/O, including after a crash.
      const directoryFd = fs.openSync(folder, fs.constants.O_RDONLY);
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
      return result;
    } catch (error) { if (error instanceof BridgeError) throw error; throw new BridgeError(503, 'bridge_state_unavailable'); }
    finally {
      if (temporary) { try { fs.unlinkSync(temporary); } catch (_) {} }
      if (lockFd !== undefined) { fs.closeSync(lockFd); try { fs.unlinkSync(file + '.lock'); } catch (_) {} }
    }
  }
  return { transact, read:() => { try { return read(); } catch (_) { throw new BridgeError(503, 'bridge_state_unavailable'); } } };
}

function publicMessage(record) {
  return {id:record.id, persona:record.persona, status:record.status, prompt:record.prompt, text:record.text || '', createdAt:record.createdAt, updatedAt:record.updatedAt};
}
function iso(value, fallback) {
  const number = Number(value);
  const date = new Date(Number.isFinite(number) && number > 0 ? (number < 1e11 ? number * 1000 : number) : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function createGrokBotBridge({environment = process.env, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15000, store, tokenProvider} = {}) {
  const state = store || createPrivateStore(environment.GROKBOT_BRIDGE_STATE_FILE || path.join(os.homedir(), '.fleet', 'grokbot-bridge-state.json'));
  const getToken = tokenProvider || (() => loadProviderToken(environment));
  const incoming = new Map();
  const reads = new Map();

  function capabilities() {
    let available = true, reason = '';
    try { getToken(); state.read(); } catch (error) { available = false; reason = error.code || 'bridge_unavailable'; }
    return {provider:'webhook', available, reason, messages:available, personas:Object.entries(PERSONAS).map(([persona,name]) => ({persona,name})), historyFromDesktop:false, desktop:false, attachments:false, routines:false, interrupt:false};
  }
  async function upstream(suffix, init = {}) {
    const token = getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(PROVIDER + suffix, {...init, redirect:'error', signal:controller.signal, headers:{accept:'application/json', authorization:'Bearer ' + token, ...(init.body ? {'content-type':'application/json'} : {})}});
      const text = await response.text();
      if (text.length > 512000) throw new Error('upstream_response_too_large');
      let data; try { data = JSON.parse(text); } catch (_) { throw new Error('upstream_invalid_response'); }
      if (!response.ok || !data || data.ok === false) throw new Error('upstream_rejected');
      return data;
    } finally { clearTimeout(timer); }
  }

  async function send(session, body) {
    const owner = verifiedOwner(session);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BridgeError(400, 'invalid_message');
    const persona = canonicalPersona(body.persona);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!persona) throw new BridgeError(400, 'unsupported_persona');
    if (!MESSAGE_ID.test(String(body.message_id || ''))) throw new BridgeError(400, 'invalid_message_id');
    if (prompt.length < 5 || prompt.length > MAX_PROMPT) throw new BridgeError(400, 'invalid_prompt');
    if (Object.keys(body).some(key => !['persona', 'prompt', 'message_id'].includes(key))) throw new BridgeError(400, 'unsupported_message_field');
    const id = 'gb_' + crypto.createHash('sha256').update(owner + '\0' + body.message_id).digest('hex').slice(0,48);
    let isNew = false;
    const record = state.transact(records => {
      const prior = records.get(id);
      if (prior) {
        if (prior.owner !== owner || prior.persona !== persona || prior.prompt !== prompt) throw new BridgeError(409, 'message_id_conflict');
        return prior;
      }
      getToken(); // Fail before reservation when the provider is not configured.
      if (records.size >= MAX_RECORDS) throw new BridgeError(503, 'bridge_capacity_reached');
      const timestamp = new Date(now()).toISOString();
      // unknown until acceptance is acknowledged; a crash can never imply success.
      const entry = {id, owner, persona, prompt, text:'', status:'unknown', createdAt:timestamp, updatedAt:timestamp, upstreamId:null};
      records.set(id, entry); isNew = true; return entry;
    });
    if (!isNew) return incoming.has(id) ? incoming.get(id) : publicMessage(record);
    const operation = (async () => {
      let accepted;
      try {
        accepted = await upstream('', {method:'POST', body:JSON.stringify({text:prompt, target_persona:persona, target_machine:'grokbot', from:'Admira.live · ' + owner, materialize_mission:false})});
        if (accepted.ok !== true || !Number.isSafeInteger(Number(accepted.id)) || Number(accepted.id) <= 0) throw new Error('missing_receipt');
      } catch (_) {
        // Ambiguous timeout/network/rejection: preserve the durable id and do not
        // retry. The provider may have accepted before the connection was lost.
        return publicMessage(record);
      }
      return state.transact(records => {
        const entry = records.get(id);
        entry.upstreamId = Number(accepted.id); entry.status = 'pending'; entry.updatedAt = new Date(now()).toISOString();
        return publicMessage(entry);
      });
    })();
    incoming.set(id, operation);
    try { return await operation; } finally { incoming.delete(id); }
  }

  async function get(session, id) {
    const owner = verifiedOwner(session);
    if (!PUBLIC_ID.test(String(id))) throw new BridgeError(404, 'message_not_found');
    const record = state.read().get(id);
    if (!record || record.owner !== owner) throw new BridgeError(404, 'message_not_found');
    if (!record.upstreamId || ['done', 'failed'].includes(record.status)) return publicMessage(record);
    if (reads.has(id)) return reads.get(id);
    const operation = (async () => {
      let data;
      try { data = await upstream('/' + record.upstreamId); }
      catch (_) { throw new BridgeError(502, 'provider_unavailable'); }
      const item = data.item;
      if (!item || Number(item.id) !== record.upstreamId || canonicalPersona(item.target_persona) !== record.persona || String(item.target_machine || '').toLowerCase() !== 'grokbot') throw new BridgeError(502, 'provider_receipt_mismatch');
      const mapped = {pending:'pending', ack:'in_progress', in_progress:'in_progress', done:'done', blocked:'blocked', failed:'failed'}[item.status];
      if (!mapped) throw new BridgeError(502, 'provider_status_unknown');
      return state.transact(records => {
        const entry = records.get(id);
        if (!entry || entry.owner !== owner) throw new BridgeError(404, 'message_not_found');
        const text = typeof item.note === 'string' ? item.note.slice(0,200000) : '';
        if (entry.status !== mapped || entry.text !== text) entry.updatedAt = iso(item.done_at || item.updated_at || item.ack_at, new Date(now()).toISOString());
        entry.status = mapped; entry.text = text;
        return publicMessage(entry);
      });
    })();
    reads.set(id, operation);
    try { return await operation; } finally { reads.delete(id); }
  }
  function list(session, persona) {
    const owner = verifiedOwner(session), canonical = canonicalPersona(persona);
    if (!canonical) throw new BridgeError(400, 'unsupported_persona');
    return [...state.read().values()].filter(record => record.owner === owner && record.persona === canonical)
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt)).slice(-100).map(publicMessage);
  }
  return {capabilities, send, get, list};
}

module.exports = { BridgeError, PERSONAS, canonicalPersona, createGrokBotBridge, createPrivateStore, loadProviderToken };
