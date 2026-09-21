'use strict';

// A read/write adapter for the visible, signed Grok Bot application. This module
// never reads its credentials, internal databases, or development RPC endpoints.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {createAttachments,AttachmentError}=require('./grokbot-attachments');
const {PERSONAS, canonicalPersona} = require('./grokbot-bridge');

const PUBLIC_ID = /^gb_[a-f0-9]{48}$/;
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const STATUSES = new Set(['unknown', 'pending', 'in_progress', 'done', 'blocked', 'failed']);
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_RECORDS = 10000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,48);
const normalized = text => text.replace(/\r\n?/g, '\n').trim().normalize('NFC');

class DesktopBridgeError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function createDesktopStore(file) {
  if (!path.isAbsolute(file)) throw new DesktopBridgeError(503, 'desktop_state_unavailable');
  const folder = path.dirname(file);
  function read() {
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid()) || stat.size > MAX_BYTES) throw new Error('unsafe_state');
      const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.messages) || data.messages.length > MAX_RECORDS) throw new Error('invalid_state');
      const records = new Map();
      for (const entry of data.messages) {
        if (!entry || !PUBLIC_ID.test(entry.id) || !PERSONAS[entry.persona] || !STATUSES.has(entry.status) || typeof entry.prompt !== 'string' || typeof entry.text !== 'string' || entry.source !== 'desktop' || entry.native !== true || !Array.isArray(entry.nativeKeys) || !Array.isArray(entry.parts)) throw new Error('invalid_record');
        records.set(entry.id, entry);
      }
      return records;
    } catch (error) {
      if (error.code === 'ENOENT') return new Map();
      throw new DesktopBridgeError(503, 'desktop_state_unavailable');
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function transact(update) {
    let lock, temporary;
    try {
      fs.mkdirSync(folder, {recursive:true, mode:0o700});
      const parent = fs.lstatSync(folder);
      if (!parent.isDirectory() || (parent.mode & 0o022) || (process.getuid && parent.uid !== process.getuid())) throw new Error('unsafe_directory');
      lock = fs.openSync(file + '.lock', fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      const records = read();
      const result = update(records);
      const body = JSON.stringify({version:1, messages:[...records.values()]});
      if (records.size > MAX_RECORDS || Buffer.byteLength(body) > MAX_BYTES) throw new DesktopBridgeError(503, 'desktop_capacity_reached');
      temporary = file + '.' + crypto.randomBytes(12).toString('hex') + '.tmp';
      const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { fs.writeFileSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file); temporary = undefined;
      const directory = fs.openSync(folder, fs.constants.O_RDONLY);
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      return result;
    } catch (error) {
      if (error instanceof DesktopBridgeError) throw error;
      throw new DesktopBridgeError(503, 'desktop_state_unavailable');
    } finally {
      if (temporary) { try { fs.unlinkSync(temporary); } catch (_) {} }
      if (lock !== undefined) { fs.closeSync(lock); try { fs.unlinkSync(file + '.lock'); } catch (_) {} }
    }
  }
  return {read, transact};
}

function createNativeRunner({environment = process.env, execFileImpl = execFile, timeoutMs = 15000} = {}) {
  return request => new Promise((resolve, reject) => {
    const binary = String(environment.GROKBOT_AX_BINARY || '');
    try {
      if (!path.isAbsolute(binary) || binary.includes('\0')) throw new Error('unconfigured');
      const stat = fs.lstatSync(binary);
      if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o100) || (stat.mode & 0o022) || (process.getuid && stat.uid !== process.getuid())) throw new Error('unsafe_binary');
    } catch (_) { reject(new DesktopBridgeError(503, 'desktop_not_configured')); return; }
    // No shell, no command arguments from the browser, and no inherited provider
    // secrets. The helper receives only a bounded JSON command on standard input.
    const child = execFileImpl(binary, [], {
      shell:false, encoding:'utf8', timeout:request.attachmentPaths?.length?Math.max(timeoutMs,45000):timeoutMs, maxBuffer:8 * 1024 * 1024,
      env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin', HOME:os.homedir(), LANG:'en_US.UTF-8'},
      windowsHide:true,
    }, (error, stdout) => {
      // The signed helper emits a structured refusal and exits 1. Keep that
      // diagnosis; never accept a success payload from a failed/killed process.
      if (error) {
        if (error.code === 1 && !error.killed && !error.signal) {
          try { const refusal=JSON.parse(stdout); if(refusal?.ok===false){resolve(refusal);return;} } catch (_) {}
        }
        reject(new DesktopBridgeError(503, error.killed ? 'desktop_timeout' : 'desktop_unavailable')); return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch (_) { reject(new DesktopBridgeError(503, 'desktop_invalid_snapshot')); }
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify(request) + '\n');
  });
}

function publicMessage(entry) {
  return {id:entry.id, persona:entry.persona, prompt:entry.prompt, text:entry.text,
    status:entry.status, createdAt:entry.createdAt, updatedAt:entry.updatedAt,
    source:'desktop', native:true,...(entry.attachments?.length?{attachments:entry.attachments}: {})};
}
function parseSnapshot(value, now) {
  if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean' || typeof value.composerHasDraft !== 'boolean' || typeof value.busy !== 'boolean' || !Array.isArray(value.messages) || value.messages.length > 2000) throw new DesktopBridgeError(503, 'desktop_invalid_snapshot');
  const selected = canonicalPersona(value.selectedPersona);
  const messages = value.messages.map(message => {
    if (!message || !['user','assistant','event'].includes(message.sender) || typeof message.text !== 'string' || message.text.length > 200000 || typeof message.key !== 'string' || !message.key || message.key.length > 2048) throw new DesktopBridgeError(503, 'desktop_invalid_snapshot');
    return {sender:message.sender, text:message.text, key:message.key,
      legacyKey:typeof message.legacyKey==='string'&&/^ax_[a-f0-9]{64}$/.test(message.legacyKey)?message.legacyKey:null,
      label:typeof message.label === 'string' ? message.label.slice(0,500) : '',
      time:typeof message.time === 'string' ? message.time.slice(0,200) : ''};
  });
  if (JSON.stringify(messages).length > 8 * 1024 * 1024) throw new DesktopBridgeError(503, 'desktop_invalid_snapshot');
  const date = new Date(value.observedAt);
  const timestamp = Number.isFinite(date.getTime()) && date.getTime() <= now + 300000 ? date.toISOString() : new Date(now).toISOString();
  // Do not forward native error text: it can contain private UI or process data.
  const error = ({
    accessibility_required:'desktop_accessibility_required',
    accessibility_read_failed:'desktop_read_failed', accessibility_unavailable:'desktop_read_failed',
    snapshot_too_large:'desktop_snapshot_too_large',
    conversation_window_unavailable:'desktop_window_unavailable',
    conversation_structure_unavailable:'desktop_structure_changed', conversation_structure_ambiguous:'desktop_structure_changed',
    selection_changed_during_snapshot:'desktop_selection_mismatch',
    bot_list_unavailable:'desktop_bot_list_unavailable', bot_button_unavailable:'desktop_bot_button_unavailable',
    draft:'desktop_draft_present', draft_present:'desktop_draft_present', composer_has_draft:'desktop_draft_present', draft_exists:'desktop_draft_present',
    busy:'desktop_busy', conversation_busy:'desktop_busy', bridge_busy:'desktop_busy',
    persona_not_selected:'desktop_selection_mismatch', selection_or_draft_changed:'desktop_selection_mismatch', selection_unconfirmed:'desktop_selection_mismatch', unsupported_or_ambiguous_conversation:'desktop_selection_mismatch',
    interaction_focus_unavailable:'desktop_focus_unavailable',
    send_not_ready:'desktop_send_not_ready',
    composer_not_writable:'desktop_composer_unavailable', application_not_running:'desktop_application_not_running',
    attachment_prepare_failed:'desktop_attachment_prepare_failed', attachment_focus_unavailable:'desktop_attachment_focus_unavailable', attachment_button_unavailable:'desktop_attachment_button_unavailable', attachment_menu_unavailable:'desktop_attachment_menu_unavailable', attachment_picker_unavailable:'desktop_attachment_picker_unavailable', attachment_path_unavailable:'desktop_attachment_path_unavailable', attachment_open_unavailable:'desktop_attachment_open_unavailable',
    routine_controls_unavailable:'desktop_routines_unavailable', routine_not_found:'routine_not_found', routine_changed:'routine_changed', routine_state_unconfirmed:'routine_state_unconfirmed',
    run_changed:'desktop_run_changed', control_unavailable:'desktop_control_unavailable', attachment_control_unavailable:'desktop_attachment_control_unavailable', attachment_unconfirmed:'desktop_attachment_unconfirmed', invalid_attachment_path:'invalid_attachment',
    unknown:'desktop_delivery_unknown',
  })[value.error] || 'desktop_unavailable';
  const routines = Array.isArray(value.routines) ? value.routines.filter(r=>r&&/^[a-f0-9]{64}$/.test(r.id)&&typeof r.name==='string'&&typeof r.schedule==='string').map(r=>({id:r.id,name:r.name.slice(0,300),schedule:r.schedule.slice(0,1000)})) : null;
  const r=value.routine;
  const routine=r&&/^[a-f0-9]{64}$/.test(r.id)&&/^[a-f0-9]{64}$/.test(r.revision)&&typeof r.name==='string'&&typeof r.instruction==='string'&&typeof r.paused==='boolean'?{id:r.id,name:r.name.slice(0,300),instruction:r.instruction.slice(0,20000),paused:r.paused,revision:r.revision}:null;
  return {ok:value.ok, selected, draft:value.composerHasDraft, busy:value.busy, messages, timestamp, error,
    protocolVersion:[2,3].includes(value.protocolVersion)?value.protocolVersion:1,routines,routine,runKey:typeof value.runKey==='string'?value.runKey.slice(0,2048):null};
}

function createGrokBotDesktop({environment = process.env, runNative, now = Date.now, store,
  pollIntervalMs = 2500, nativeTimeoutMs = 15000,
  setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const owners = new Set(String(environment.GROKBOT_DESKTOP_OWNER_EMAILS || '').split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(email => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)));
  const binary = String(environment.GROKBOT_AX_BINARY || '');
  const configured = owners.size > 0 && path.isAbsolute(binary) && !binary.includes('\0');
  const native = runNative || createNativeRunner({environment, timeoutMs:nativeTimeoutMs});
  const state = store || createDesktopStore(environment.GROKBOT_DESKTOP_STATE_FILE || path.join(os.homedir(), '.fleet', 'grokbot-desktop-state.json'));
  const uploads=createAttachments(path.join(path.dirname(environment.GROKBOT_DESKTOP_STATE_FILE||path.join(os.homedir(),'.fleet','grokbot-desktop-state.json')),'grokbot-uploads'));
  let queue = Promise.resolve(), last = null, reason = configured ? 'desktop_not_observed' : 'desktop_not_configured';
  let reportedReason = '';
  function diagnose(code) { if(code && code!==reportedReason)console.warn('[grokbot-desktop]',code); reportedReason=code; }
  let axAvailable = false, running = false, timer = null, generation = 0;
  const observedSignatures = new Map();
  const interval = Math.max(2000, Math.min(5000, Number(pollIntervalMs) || 2500));
  const serial = operation => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  };
  function owner(session) {
    const email = String(session && session.email || '').trim().toLowerCase();
    if (!email || !session.jti) throw new DesktopBridgeError(401, 'authenticated_session_required');
    if (!owners.has(email)) throw new DesktopBridgeError(403, 'desktop_owner_required');
    return email;
  }
  function requireConfigured() {
    if (!configured) throw new DesktopBridgeError(503, 'desktop_not_configured');
  }
  function persona(value) {
    const result = canonicalPersona(value);
    if (!result) throw new DesktopBridgeError(400, 'unsupported_persona');
    return result;
  }
  function currentStatus() {
    return !axAvailable ? 'disconnected' : last?.draft ? 'draft' : last?.busy ? 'busy' : 'ready';
  }
  function info() {
    return {selectedPersona:last?.selected || null, status:currentStatus(), reason,
      lastObservedAt:last?.timestamp || null, partialVisibleHistory:true, pollingIntervalMs:interval,runKey:last?.runKey||null};
  }
  function ingest(snapshot) {
    if (!snapshot.selected) return;
    const signature = digest(JSON.stringify([snapshot.messages, snapshot.busy]));
    if (observedSignatures.get(snapshot.selected) === signature) return;
    const groups = [];
    let group;
    for (const item of snapshot.messages) {
      if (item.sender === 'event' || !item.text.trim()) continue; // Activity is not a bot answer.
      if (item.sender === 'user') {
        group = {user:item, assistants:[]}; groups.push(group);
      } else {
        if (!group) { group = {user:null, assistants:[]}; groups.push(group); }
        group.assistants.push(item);
      }
    }
    if (!groups.length) return;
    const visibleUsers = groups.filter(group=>group.user).map(group=>group.user);
    const visibleUserKeys = visibleUsers.map(item=>item.key);
    state.transact(records => {
      const rows = () => [...records.values()].filter(row => row.persona === snapshot.selected);
      for (let index = 0; index < groups.length; index++) {
        const current = groups[index], userKey = current.user?.key;
        const keys = [userKey, ...current.assistants.map(item => item.key)].filter(Boolean);
        let entry = rows().find(row => userKey && (row.nativeUserKey === userKey || row.nativeUserAliases?.includes(userKey)));
        if (!entry && current.user) {
          // Electron replaces an optimistic user-card ID when it persists the
          // message. Only reconcile an acknowledged web receipt when the whole
          // visible user sequence is unchanged except for this one ID, including
          // exact text, native timestamp and position. Never merge by text alone.
          const promotions = rows().filter(row=>{
            const seen=row.nativeUserObservation;
            return row.reservation && row.nativeUserKey && seen &&
              !visibleUserKeys.includes(row.nativeUserKey) &&
              normalized(row.prompt)===normalized(current.user.text) &&
              seen.time===current.user.time && seen.label===current.user.label &&
              seen.keys.length===visibleUserKeys.length &&
              seen.keys.every((key,i)=>i===seen.index ? visibleUserKeys[i]===userKey : visibleUserKeys[i]===key);
          });
          if(promotions.length===1)entry=promotions[0];
        }
        if(!entry&&current.user?.legacyKey){
          const old=rows().filter(row=>row.nativeUserKey===current.user.legacyKey&&normalized(row.prompt)===normalized(current.user.text));
          if(old.length===1)entry=old[0];
        }
        if (!entry) entry = rows().find(row => row.nativeKeys.some(key => keys.includes(key)) && (!userKey || !row.nativeUserKey || row.nativeUserKey === userKey));
        if(!entry&&!current.user){
          const migrated=rows().filter(row=>row.parts.some(part=>current.assistants.some(item=>
            item.legacyKey===part.key && item.label===part.label && item.time===part.time &&
            (item.text.startsWith(part.text)||part.text.startsWith(item.text)))));
          if(migrated.length===1)entry=migrated[0];
        }
        if (!entry && !current.user) {
          // A viewport can begin at a growing assistant card. Older helpers use
          // content hashes as keys, so identify an unambiguous continuing card
          // before allocating a new spontaneous turn.
          const continuing = rows().filter(row => row.parts.some(part => current.assistants.some(item =>
            item.label && item.time && part.label === item.label && part.time === item.time &&
            item.text.startsWith(part.text) && part.text.length > 0)));
          if (continuing.length === 1) entry = continuing[0];
        }
        if (!entry && current.user) {
          // An uncertain send is acknowledged only by a newly observed user card.
          // A matching card already visible before sending never counts as delivery.
          entry = rows().filter(row => row.reservation && !row.nativeUserKey && row.status === 'unknown' && normalized(row.prompt) === normalized(current.user.text) && !row.baselineUserKeys.includes(userKey))
            .sort((a,b) => a.createdAt.localeCompare(b.createdAt))[0];
        }
        if (!entry) {
          const anchor = userKey || keys[0];
          const id = 'gb_' + digest('desktop-native\0' + snapshot.selected + '\0' + anchor);
          const occupied = new Set(rows().map(row => Date.parse(row.createdAt) || 0));
          const nativeTime = current.user?.time || current.assistants[0]?.time || '';
          const parsedTime = /^\d{4}-\d{2}-\d{2}T/.test(nativeTime) ? Date.parse(nativeTime) : NaN;
          let created = Number.isFinite(parsedTime) && parsedTime <= now() + 300000
            ? parsedTime : Math.max(Date.parse(snapshot.timestamp), Math.max(0, ...occupied) + 1);
          while (occupied.has(created)) created++;
          const createdAt = new Date(created).toISOString();
          entry = {id, persona:snapshot.selected, prompt:current.user?.text || '', text:'', status:'pending',
            createdAt, updatedAt:snapshot.timestamp, source:'desktop', native:true,
            nativeUserKey:userKey || null, nativeKeys:[], parts:[], reservation:false};
          records.set(id, entry);
        }
        const previous = JSON.stringify([entry.prompt, entry.text, entry.status]);
        if (current.user) {
          if(entry.nativeUserKey && entry.nativeUserKey!==userKey)entry.nativeUserAliases=[...new Set([...(entry.nativeUserAliases||[]),entry.nativeUserKey])];
          entry.nativeUserKey = userKey; entry.prompt = current.user.text;
          if(entry.reservation)entry.nativeUserObservation={keys:visibleUserKeys,index:visibleUserKeys.indexOf(userKey),time:current.user.time,label:current.user.label};
        }
        // Never delete absent parts: even a visible user anchor does not prove
        // the entire turn fits in this viewport. Stable helper keys replace
        // streaming cards; the unique metadata fallback supports older helpers.
        const visibleAssistantKeys = new Set(current.assistants.map(item => item.key));
        for (const item of current.assistants) {
          let part = entry.parts.find(part => part.key === item.key);
          if (!part) {
            const candidates = entry.parts.filter(part => !visibleAssistantKeys.has(part.key) &&
              item.label && item.time && part.label === item.label && part.time === item.time);
            const growing = candidates.filter(part => item.text.startsWith(part.text) && part.text.length > 0);
            if (growing.length === 1) part = growing[0];
            else if (current.user && candidates.length === 1) part = candidates[0];
          }
          if (part) Object.assign(part, item);
          else entry.parts.push({...item});
        }
        entry.nativeKeys = [...new Set([...entry.nativeKeys, ...keys])];
        entry.text = entry.parts.map(part => part.text).join('\n\n');
        const isLast = index === groups.length - 1;
        entry.status = entry.text ? (isLast && snapshot.busy ? 'in_progress' : 'done') : 'pending';
        if (JSON.stringify([entry.prompt, entry.text, entry.status]) !== previous) entry.updatedAt = snapshot.timestamp;
      }
    });
    observedSignatures.set(snapshot.selected, signature);
  }
  async function observe(request) {
    requireConfigured();
    let snapshot;
    try { snapshot = parseSnapshot(await native(request), now()); }
    catch (error) {
      axAvailable = false;
      reason = error instanceof DesktopBridgeError ? error.code : 'desktop_unavailable';
      diagnose(reason);
      throw new DesktopBridgeError(503, reason);
    }
    // A failure can still contain a useful post-send snapshot. Capture it, but
    // never promote ok:true alone to delivered or fabricate a bot answer.
    last = snapshot;
    axAvailable = snapshot.ok;
    reason = snapshot.ok ? (snapshot.draft ? 'desktop_draft_present' : '') : snapshot.error;
    diagnose(snapshot.ok ? '' : snapshot.error);
    ingest(snapshot);
    return snapshot;
  }
  async function snapshot() {
    const value = await observe({action:'snapshot'});
    if (!value.ok) throw new DesktopBridgeError(value.error === 'desktop_draft_present' || value.error === 'desktop_busy' ? 409 : 503, value.error);
    return value;
  }
  async function choose(target, existing) {
    const before = existing || await snapshot();
    if (before.selected === target) return before;
    if (before.draft) throw new DesktopBridgeError(409, 'desktop_draft_present');
    const selected = await observe({action:'select', persona:PERSONAS[target]});
    if (!selected.ok) throw new DesktopBridgeError(['desktop_draft_present','desktop_busy','desktop_selection_mismatch'].includes(selected.error) ? 409 : 503, selected.error);
    if (selected.selected !== target) throw new DesktopBridgeError(409, 'desktop_selection_mismatch');
    return selected;
  }
  async function capabilities(session) {
    owner(session);
    return serial(async () => {
      try { requireConfigured(); state.read(); await snapshot(); }
      catch (error) { reason = error.code || 'desktop_unavailable'; axAvailable = false; }
      const available = configured && axAvailable;
      return {provider:'desktop', mode:'desktop', available, messages:available, bidirectional:available,
        historyFromDesktop:available, desktop:false, attachments:available&&last?.protocolVersion>=3, maxAttachmentBytes:4*1024*1024, maxAttachments:1, routines:available&&last?.protocolVersion>=2, interrupt:available&&last?.protocolVersion>=2, approvals:false,
        personas:Object.entries(PERSONAS).map(([persona,name]) => ({persona,name})), ...info()};
    });
  }
  async function list(session, value) {
    owner(session); const target = persona(value);
    return serial(async () => {
      await snapshot(); // Passive: capture the actual selected bot; never change it.
      return [...state.read().values()].filter(row => row.persona === target)
        .sort((a,b) => a.createdAt.localeCompare(b.createdAt)).slice(-100).map(publicMessage);
    });
  }
  async function select(session, value) {
    owner(session); const target = persona(value);
    return serial(async () => { await choose(target); return info(); });
  }
  async function send(session, body) {
    const email = owner(session);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['persona','prompt','message_id','attachments'].includes(key))) throw new DesktopBridgeError(400, 'invalid_message');
    const target = persona(body.persona);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 16000 || prompt.includes('\0')) throw new DesktopBridgeError(400, 'invalid_prompt');
    if (typeof body.message_id !== 'string' || !MESSAGE_ID.test(body.message_id)) throw new DesktopBridgeError(400, 'invalid_message_id');
    const attachmentIds=body.attachments||[];
    if(!Array.isArray(attachmentIds)||attachmentIds.length>1||attachmentIds.some(id=>typeof id!=='string'))throw new DesktopBridgeError(400,'invalid_attachment');
    const id = 'gb_' + digest('desktop-web\0' + email + '\0' + body.message_id);
    return serial(async () => {
      requireConfigured();
      const previous = state.read().get(id);
      if (previous) {
        if (previous.owner !== email || previous.persona !== target || normalized(previous.prompt) !== normalized(prompt) || JSON.stringify(previous.attachmentIds||[])!==JSON.stringify(attachmentIds)) throw new DesktopBridgeError(409, 'message_id_conflict');
        return publicMessage(previous); // Includes unknown after timeout/restart: never retry.
      }
      if ([...state.read().values()].some(row => row.reservation && !row.nativeUserKey && row.status === 'unknown' && row.persona === target && normalized(row.prompt) === normalized(prompt))) {
        throw new DesktopBridgeError(409, 'desktop_previous_send_unconfirmed');
      }
      let files;try{files=attachmentIds.map(id=>uploads.get(email,id));}catch(error){throw new DesktopBridgeError(400,error instanceof AttachmentError?error.code:'invalid_attachment');}
      const before = await choose(target);
      if(files.length&&before.protocolVersion<3)throw new DesktopBridgeError(503,'desktop_attachments_unavailable');
      if (before.draft) throw new DesktopBridgeError(409, 'desktop_draft_present');
      if (before.busy) throw new DesktopBridgeError(409, 'desktop_busy');
      state.transact(records => {
        if (records.has(id)) throw new DesktopBridgeError(409, 'message_id_conflict');
        const lastCreated = Math.max(0, ...[...records.values()].filter(row => row.persona === target).map(row => Date.parse(row.createdAt) || 0));
        const timestamp = new Date(Math.max(now(), lastCreated + 1)).toISOString();
        records.set(id, {id, owner:email, persona:target, prompt, attachmentIds, attachments:files.map(f=>({id:f.id,name:f.name,type:f.type,size:f.size})), text:'', status:'unknown',
          createdAt:timestamp, updatedAt:timestamp, source:'desktop', native:true, reservation:true,
          nativeUserKey:null, nativeKeys:[], parts:[], baselineUserKeys:[...new Set([
            ...[...records.values()].filter(row => row.persona === target).map(row => row.nativeUserKey).filter(Boolean),
            ...before.messages.filter(item => item.sender === 'user').map(item => item.key),
          ])]});
      });
      let response;
      try { response = await observe({action:'send', persona:PERSONAS[target], prompt,...(files.length?{attachmentPaths:files.map(f=>f.path)}:{})}); }
      catch (_) { /* Ambiguous process timeout: retain the durable reservation. */ }
      if(response&&!response.ok&&(response.error.startsWith('desktop_attachment_')||response.error==='invalid_attachment'||response.error==='desktop_focus_unavailable'||response.error==='desktop_send_not_ready'||(files.length&&response.error==='desktop_control_unavailable'))){
        // Attachment preparation throws before composing/pressing Send. This
        // is proven non-delivery, unlike a timeout after pressing Send.
        state.transact(records=>{const entry=records.get(id);if(!entry.nativeUserKey){entry.status='failed';entry.error=response.error;entry.updatedAt=new Date(now()).toISOString();}});
        throw new DesktopBridgeError(409,response.error);
      }
      if (response && !response.ok && ['desktop_draft_present','desktop_busy'].includes(response.error)) {
        state.transact(records => { const entry = records.get(id); if (!entry.nativeUserKey) { entry.status = 'blocked'; entry.updatedAt = new Date(now()).toISOString(); } });
        throw new DesktopBridgeError(409, response.error);
      }
      try { await snapshot(); } catch (_) { /* Polling can confirm later; no second send. */ }
      return publicMessage(state.read().get(id));
    });
  }
  async function get(session, id) {
    owner(session);
    if (!PUBLIC_ID.test(String(id))) throw new DesktopBridgeError(404, 'message_not_found');
    return serial(async () => {
      if (!state.read().has(id)) throw new DesktopBridgeError(404, 'message_not_found');
      await snapshot();
      return publicMessage(state.read().get(id));
    });
  }
  async function upload(session,body){
    const email=owner(session);requireConfigured();
    try{return uploads.put(email,body);}catch(error){throw new DesktopBridgeError(400,error instanceof AttachmentError?error.code:'attachment_storage_unavailable');}
  }
  async function controls(session, body) {
    owner(session);
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['persona','action','routine_id','revision','paused','run_key'].includes(k)))throw new DesktopBridgeError(400,'invalid_control');
    const target=persona(body.persona), action=body.action;
    if(!['routines','routine','routine_set','interrupt'].includes(action))throw new DesktopBridgeError(400,'invalid_control');
    if(['routine','routine_set'].includes(action)&&!/^[a-f0-9]{64}$/.test(body.routine_id||''))throw new DesktopBridgeError(400,'invalid_routine');
    if(action==='routine_set'&&(typeof body.paused!=='boolean'||!/^[a-f0-9]{64}$/.test(body.revision||'')))throw new DesktopBridgeError(400,'invalid_routine');
    if(action==='interrupt'&&(typeof body.run_key!=='string'||!body.run_key||body.run_key.length>2048))throw new DesktopBridgeError(400,'invalid_run');
    return serial(async()=>{
      const before=await snapshot();
      if(before.protocolVersion<2)throw new DesktopBridgeError(503,'desktop_controls_unavailable');
      // Commands act only on the explicitly opened seat, never a stale tab's
      // cached selection. A user switching the native chat wins.
      if(before.selected!==target)throw new DesktopBridgeError(409,'desktop_selection_mismatch');
      const result=await observe({action,persona:PERSONAS[target],routineID:body.routine_id,revision:body.revision,paused:body.paused,runKey:body.run_key});
      if(!result.ok)throw new DesktopBridgeError(409,result.error);
      return {routines:result.routines,routine:result.routine,...info()};
    });
  }
  function start() {
    if (running || !configured) return;
    running = true; const run = ++generation;
    const tick = async () => {
      if (!running || run !== generation) return;
      await serial(async () => {
        if (!running || run !== generation) return;
        try { await snapshot(); } catch (_) { /* Expose disconnected through capabilities. */ }
      });
      if (running && run === generation) { timer = setTimer(tick, interval); timer?.unref?.(); }
    };
    timer = setTimer(tick, 0); timer?.unref?.();
  }
  function stop() {
    running = false; generation++;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  return {capabilities, list, select, send, get, controls, upload, start, stop};
}

module.exports = {DesktopBridgeError, createGrokBotDesktop, createDesktopStore, createNativeRunner};
