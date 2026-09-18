import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./council-grokbot.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function message(overrides = {}) {
  return {
    id: 'gb_message_jobs', persona: 'Jobs', prompt: 'Una pregunta de prueba',
    status: 'pending', text: '', createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-18T08:00:00.000Z', source:'desktop', native:true, ...overrides
  };
}

// This DOM double deliberately implements text nodes separately from innerHTML.
// It checks the rendering boundary without opening any browser or using a UI.
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.doc = doc; this.children = [];
    this.className = ''; this.hidden = false; this.text = ''; this.listeners = new Map();
    this.lookup = new Map(); this.scrollTop = 0;
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  set innerHTML(value) {
    this.doc.markup.push(String(value)); this.children = []; this.lookup.clear();
    // Only the static shell uses HTML. Dynamic conversation content must pass
    // through createTextNode/textContent; no HTML parser is needed for the test.
    for (const selector of ['.council-chat__connection', '.council-chat__person', '.council-chat__status', '.council-chat__messages', '[data-chat-refresh]', '[data-chat-screen]']) {
      const node = this.doc.createElement(selector.startsWith('[') ? 'button' : 'div');
      this.lookup.set(selector, node); this.children.push(node);
    }
  }
  querySelector(selector) { return this.lookup.get(selector) || null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  insertAdjacentElement(position, node) { this.doc.details = node; }
  scrollIntoView() {}
  remove() { this.removed = true; }
  get childElementCount() { return this.children.filter(node => node.tagName !== '#TEXT').length; }
  get scrollHeight() { return this.textContent.length; }
}

function harness() {
  let now = Date.parse('2026-09-18T08:00:00.000Z'), nextTimer = 0, uuid = 0;
  const timers = new Map(), failures = [];
  const clock = {
    setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(ms) {
      now += ms;
      let count = 0;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        assert.ok(++count < 100, 'timer loop did not settle');
        timers.delete(entry[0]);
        const result = entry[1].fn();
        if (result?.catch) result.catch(error => failures.push(error));
        await flush();
      }
      assert.deepEqual(failures, []);
    },
    get polls() { return [...timers.values()].filter(timer => timer.delay !== 25000).length; }
  };
  class ClockDate extends Date { static now() { return now; } }
  const doc = {
    markup: [], nodes: [], details: null,
    createElement(tag) { const node = new Element(tag, this); this.nodes.push(node); return node; },
    createTextNode(text) { const node = new Element('#text', this); node.textContent = text; this.nodes.push(node); return node; }
  };
  const histories = new Map(), calls = [], answers = [], restores = [], statuses = [], errors = [], pending = [], settled = [];
  const h = { clock, doc, histories, calls, answers, restores, statuses, errors, pending, settled, listHandler: null, postHandler: null, selectionHandler:null, capabilitiesHandler:null };
  const fetch = async (url, init) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname.replace('/api/grokbot', ''), query: parsed.searchParams, method: init.method, headers:init.headers, credentials:init.credentials, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    if (call.path === '/capabilities') return h.capabilitiesHandler ? h.capabilitiesHandler(call) : response({ok:true,mode:'desktop',bidirectional:true,available:true,partialVisibleHistory:true,lastObservedAt:'2026-09-18T08:00:00.000Z'});
    if (call.path === '/selection') return h.selectionHandler ? h.selectionHandler(call) : response({ok:true,selectedPersona:call.body.persona});
    if (call.path === '/messages' && call.method === 'GET') return h.listHandler ? h.listHandler(call) : response({ ok: true, messages: histories.get(call.query.get('persona')) || [] });
    if (call.path === '/messages' && call.method === 'POST') return h.postHandler ? h.postHandler(call) : response({ ok: true, message: message() });
    throw new Error('Unexpected API path ' + url);
  };
  const context = vm.createContext({
    console, URL, AbortController, Date: ClockDate,
    crypto: { randomUUID: () => 'client-id-' + (++uuid) },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  });
  vm.runInContext(source, context);
  h.module = context.CouncilGrokBot;
  h.api = h.module.mount({
    document: doc, container: doc.createElement('div'), fetch,
    onAnswer: value => answers.push(plain(value)), onRestore: value => restores.push(plain(value)),
    onStatus: value => statuses.push(value), onError: value => errors.push(plain(value)),
    onPending: value => pending.push(plain(value)), onSettled:value=>settled.push(plain(value)),csrf:()=> 'csrf-test'
  });
  Object.defineProperty(h, 'log', { get: () => doc.details.querySelector('.council-chat__messages') });
  Object.defineProperty(h, 'posts', { get: () => calls.filter(call => call.method === 'POST' && call.path === '/messages') });
  Object.defineProperty(h, 'gets', { get: () => calls.filter(call => call.path === '/messages' && call.method === 'GET') });
  return h;
}

test('ISO timestamps promote pending to done, reject old snapshots, and sort by creation rather than id', () => {
  const h = harness(), initial = message();
  const final = message({ status: 'done', text: 'Respuesta final', updatedAt: '2026-09-18T08:00:05.000Z' });
  const rows = h.module.reconcile([initial], [final, initial]);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'done'); assert.equal(rows[0].text, 'Respuesta final');
  const later = message({ id: 'gb_aaa', createdAt: '2026-09-18T09:00:00.000Z' });
  const earlier = message({ id: 'gb_zzz', createdAt: '2026-09-18T07:00:00.000Z' });
  assert.deepEqual(plain(h.module.reconcile([], [later, earlier])).map(row => row.id), ['gb_zzz', 'gb_aaa']);
  h.api.destroy();
});


test('native human turn then bot answer arrives from list polling without POST or replay after done', async () => {
  const h=harness();await h.api.select('Steve Jobs');
  h.histories.set('Steve Jobs',[message({prompt:'Escrito directamente en GrokBot'})]);
  await h.clock.advance(3000);
  assert.match(h.log.textContent,/Escrito directamente en GrokBot/);assert.equal(h.answers.length,0);
  h.histories.set('Steve Jobs',[message({prompt:'Escrito directamente en GrokBot',text:'Respuesta nativa',status:'done',updatedAt:'2026-09-18T08:00:04.000Z'})]);
  await h.clock.advance(3000);
  assert.deepEqual(h.answers.map(x=>[x.messageId,x.text]),[['gb_message_jobs','Respuesta nativa']]);
  assert.equal(h.settled.length,1);assert.equal(h.posts.length,0);assert.equal(h.clock.polls,1);
  await h.clock.advance(3000);await h.clock.advance(3000);
  assert.equal(h.answers.length,1);assert.equal(h.settled.length,1);assert.equal(h.posts.length,0);
  assert.equal(h.calls.filter(x=>x.path==='/selection').length,1,'passive polling must never change the native selection');
  h.api.destroy();
});

test('same message streams canonically and terminal status with identical text settles exactly once', async()=>{
  const h=harness();await h.api.select('Steve Jobs');
  h.histories.set('Steve Jobs',[message({text:'Parcial',status:'in_progress',updatedAt:'2026-09-18T08:00:01.000Z'})]);
  await h.clock.advance(3000);
  h.histories.set('Steve Jobs',[message({text:'Parcial completo',status:'in_progress',updatedAt:'2026-09-18T08:00:02.000Z'})]);
  await h.clock.advance(3000);
  h.histories.set('Steve Jobs',[message({text:'Parcial completo',status:'done',updatedAt:'2026-09-18T08:00:03.000Z'})]);
  await h.clock.advance(3000);await h.clock.advance(3000);
  assert.deepEqual(h.answers.map(x=>x.text),['Parcial','Parcial completo']);
  assert.equal(new Set(h.answers.map(x=>x.messageId)).size,1);assert.equal(h.settled.length,1);
  h.api.destroy();
});

test('spontaneous native bot responses omit Tú and legacy rows are separate, never spoken',async()=>{
  const h=harness();await h.api.select('Steve Jobs');
  h.histories.set('Steve Jobs',[
    message({id:'gb_legacy',source:'webhook',native:false,text:'Encargo viejo',status:'done'}),
    message({id:'gb_native',prompt:'',text:'Aviso espontáneo',status:'done'})
  ]);
  await h.clock.advance(3000);
  assert.match(h.log.textContent,/Encargos anteriores/);
  assert.deepEqual(h.answers.map(x=>x.text),['Aviso espontáneo']);
  const nativeItem=h.log.children.find(x=>x.className==='council-chat__turn');
  assert.doesNotMatch(nativeItem.textContent,/Tú/);
  assert.ok(nativeItem.children.every(x=>x.className!=='council-chat__user'));
  h.api.destroy();
});

test('Jobs → Lucas → Jobs discards an in-flight old list and keeps the current poll',async()=>{
  const h=harness(),old=deferred();await h.api.select('Steve Jobs');
  let held=true;h.listHandler=call=>held&&call.query.get('persona')==='Steve Jobs'?old.promise:response({ok:true,messages:h.histories.get(call.query.get('persona'))||[]});
  await h.clock.advance(3000);held=false;
  await h.api.select('George Lucas');await h.api.select('Steve Jobs');
  old.resolve(response({ok:true,messages:[message({text:'Resultado de selección invalidada',status:'done'})]}));await flush();
  assert.equal(h.answers.length,0);assert.doesNotMatch(h.log.textContent,/invalidada/);assert.equal(h.clock.polls,1);
  h.histories.set('Steve Jobs',[message({text:'Resultado vigente',status:'done'})]);await h.clock.advance(3000);
  assert.deepEqual(h.answers.map(x=>x.text),['Resultado vigente']);h.api.destroy();
});

test('late POST after leaving and returning uses the current adviser without re-sending',async()=>{
  const h=harness(),post=deferred();h.postHandler=()=>post.promise;
  await h.api.select('Steve Jobs');const sending=h.api.send('Steve Jobs','Una vez');await flush();
  await h.api.select('George Lucas');await h.api.select('Steve Jobs');
  post.resolve(response({ok:true,message:message()}));await sending;
  assert.equal(h.posts.length,1);assert.equal(h.clock.polls,1);
  h.histories.set('Steve Jobs',[message({text:'Respuesta tras volver',status:'done',updatedAt:'2026-09-18T08:00:03.000Z'})]);
  await h.clock.advance(3000);assert.deepEqual(h.answers.map(x=>x.text),['Respuesta tras volver']);h.api.destroy();
});

test('a POST for Jobs completing while Lucas is selected cannot speak or replace his log',async()=>{
  const h=harness(),post=deferred();h.postHandler=()=>post.promise;
  await h.api.select('Steve Jobs');const sending=h.api.send('Steve Jobs','Solo Jobs');await flush();
  await h.api.select('George Lucas');
  post.resolve(response({ok:true,message:message({text:'Para Jobs',status:'done'})}));await sending;
  assert.equal(h.answers.length,0);assert.doesNotMatch(h.log.textContent,/Para Jobs/);assert.equal(h.clock.polls,1);
  await h.api.select('Steve Jobs');assert.equal(h.answers.length,0);assert.equal(h.restores.at(-1).text,'Para Jobs');h.api.destroy();
});

test('polling recovers from a network interruption, refresh is single-flight and never resends',async()=>{
  const h=harness();await h.api.select('Steve Jobs');await h.api.send('Steve Jobs','Aceptado');
  h.listHandler=async()=>{throw new Error('red interrumpida');};await h.clock.advance(3000);
  assert.match(h.statuses.at(-1),/red interrumpida/);assert.equal(h.clock.polls,1);
  const slow=deferred();h.listHandler=()=>slow.promise;
  await h.clock.advance(3000);const before=h.gets.length;const first=h.api.refresh(),second=h.api.refresh();await flush();
  assert.equal(first,second);assert.equal(h.gets.length,before);
  slow.resolve(response({ok:true,messages:[message({text:'Recuperada',status:'done',updatedAt:'2026-09-18T08:00:08.000Z'})]}));await first;
  assert.equal(h.posts.length,1);assert.deepEqual(h.answers.map(x=>x.text),['Recuperada']);assert.equal(h.clock.polls,1);h.api.destroy();
});

test('refresh rejects an older canonical snapshot and restores history without repeating a mouth event',async()=>{
  const h=harness();h.histories.set('Steve Jobs',[message({text:'Definitiva',status:'done',updatedAt:'2026-09-18T08:00:08.000Z'})]);
  await h.api.select('Steve Jobs');assert.equal(h.restores.length,1);
  h.histories.set('Steve Jobs',[message({text:'Obsoleta',status:'in_progress',updatedAt:'2026-09-18T08:00:01.000Z'})]);
  await h.api.refresh();await h.clock.advance(3000);
  assert.match(h.log.textContent,/Definitiva/);assert.doesNotMatch(h.log.textContent,/Obsoleta/);assert.equal(h.answers.length,0);h.api.destroy();
});

test('draft rejection prevents sends and periodic refresh never retries native selection',async()=>{
  const h=harness();h.selectionHandler=()=>response({ok:false,error:'desktop_draft_present'},409);
  assert.equal(await h.api.select('Steve Jobs'),false);assert.match(h.statuses.at(-1),/borrador/);
  await h.api.send('Steve Jobs','No debe enviarse');assert.equal(h.posts.length,0);
  await h.clock.advance(3000);await h.clock.advance(3000);await h.api.refresh();
  assert.equal(h.calls.filter(x=>x.path==='/selection').length,1);
  h.selectionHandler=null;assert.equal(await h.api.select('Steve Jobs'),true);
  await h.api.send('Steve Jobs','Selección confirmada');assert.equal(h.posts.length,1);h.api.destroy();
});

test('webhook capability never becomes fallback transport and later reconnect only polls',async()=>{
  const h=harness();h.capabilitiesHandler=()=>response({ok:true,provider:'webhook',available:true});
  assert.equal(await h.api.select('Steve Jobs'),false);await h.api.send('Steve Jobs','Sin fallback');await h.clock.advance(3000);
  assert.equal(h.posts.length,0);assert.equal(h.gets.length,0);assert.equal(h.calls.filter(x=>x.path==='/selection').length,0);
  h.capabilitiesHandler=null;await h.clock.advance(3000);assert.equal(h.gets.length,1);
  await h.api.send('Steve Jobs','Necesita selección explícita');assert.equal(h.posts.length,0);h.api.destroy();
});

test('ambiguous POST failure never retries despite automatic polling and manual refresh',async()=>{
  const h=harness();h.postHandler=async()=>{throw new Error('network interrupted');};
  await h.api.select('Steve Jobs');await h.api.send('Steve Jobs','Quizá aceptado');
  assert.equal(h.errors.length,1);assert.equal(h.posts.length,1);
  await h.clock.advance(3000);await h.api.refresh();await h.clock.advance(3000);
  assert.equal(h.posts.length,1);h.api.destroy();
});

test('bot and user markup remains literal text',async()=>{
  const h=harness(),attack='<img src=x onerror="alert(1)"><script>alert(1)</script>';await h.api.select('Steve Jobs');
  h.histories.set('Steve Jobs',[message({prompt:attack,text:attack,status:'done'})]);await h.clock.advance(3000);
  assert.ok(h.log.textContent.includes(attack));assert.equal(h.answers[0].text,attack);
  assert.ok(h.doc.markup.every(html=>!html.includes(attack)));assert.ok(h.doc.nodes.every(node=>!['IMG','SCRIPT'].includes(node.tagName)));h.api.destroy();
});

test('destroy invalidates in-flight list and capabilities requests and clears every poll',async()=>{
  const h=harness(),slow=deferred();await h.api.select('Steve Jobs');h.listHandler=()=>slow.promise;
  await h.clock.advance(3000);const before=h.log.textContent;h.api.destroy();
  slow.resolve(response({ok:true,messages:[message({text:'Tarde',status:'done'})]}));await flush();await h.clock.advance(60000);
  assert.equal(h.answers.length,0);assert.equal(h.log.textContent,before);assert.equal(h.clock.polls,0);assert.equal(h.doc.details.removed,true);
  assert.equal(await h.api.select('Steve Jobs'),false);assert.equal(await h.api.send('Steve Jobs','No'),false);
  const second=harness(),caps=deferred();second.capabilitiesHandler=()=>caps.promise;
  const selecting=second.api.select('Steve Jobs');await flush();second.api.destroy();
  caps.resolve(response({ok:true,mode:'desktop',bidirectional:true,available:true}));await selecting;
  assert.equal(second.calls.filter(x=>x.path==='/selection').length,0);assert.equal(second.clock.polls,0);
});


test('a delayed POST receipt uses the newer canonical native snapshot and cannot replay old text',async()=>{
  const h=harness(),post=deferred();h.postHandler=()=>post.promise;
  await h.api.select('Steve Jobs');const sending=h.api.send('Steve Jobs','Solo una vez');await flush();
  h.histories.set('Steve Jobs',[message({text:'Respuesta completa',status:'done',updatedAt:'2026-09-18T08:00:08.000Z'})]);
  await h.clock.advance(3000);
  post.resolve(response({ok:true,message:message({text:'Respuesta',status:'in_progress',updatedAt:'2026-09-18T08:00:01.000Z'})}));await sending;
  assert.deepEqual(h.answers.map(x=>x.text),['Respuesta completa']);assert.equal(h.settled.length,1);
  assert.match(h.log.textContent,/Respuesta completa/);assert.equal(h.posts.length,1);h.api.destroy();
});

test('explicit selection carries session CSRF and the connection identifies a different native chat',async()=>{
  const h=harness();await h.api.select('Steve Jobs');
  const selection=h.calls.find(x=>x.path==='/selection');
  assert.deepEqual(selection.body,{persona:'Steve Jobs'});assert.equal(selection.headers['X-Fleet-CSRF'],'csrf-test');assert.equal(selection.credentials,'include');
  h.capabilitiesHandler=()=>response({ok:true,mode:'desktop',bidirectional:true,available:true,partialVisibleHistory:true,selectedPersona:'Lucas',status:'ready',lastObservedAt:'2026-09-18T08:10:00.000Z'});
  await h.clock.advance(3000);
  const connection=h.doc.details.querySelector('.council-chat__connection');
  assert.match(connection.textContent,/otro consejero/);assert.match(connection.title,/George Lucas/);assert.match(connection.title,/08:10:00/);
  assert.equal(h.calls.filter(x=>x.path==='/selection').length,1);h.api.destroy();
});


test('unavailable capabilities before POST clears presentation through onError without a pending mouth',async()=>{
  const h=harness();await h.api.select('Steve Jobs');
  h.capabilitiesHandler=()=>response({ok:true,mode:'desktop',bidirectional:true,available:false});
  await h.api.send('Steve Jobs','No disponible');
  assert.equal(h.posts.length,0);assert.equal(h.pending.length,0);assert.equal(h.errors.length,1);
  assert.match(h.errors[0].message,/no está disponible/);h.api.destroy();
});

test('capabilities alone and stale observations never claim active native synchronization',async()=>{
  const h=harness(),list=deferred();h.listHandler=()=>list.promise;
  const selecting=h.api.select('Steve Jobs');await flush();
  const connection=h.doc.details.querySelector('.council-chat__connection');
  assert.doesNotMatch(connection.textContent,/Sincronización activa/);
  list.resolve(response({ok:true,messages:[]}));await selecting;
  assert.match(connection.textContent,/Sincronización activa/);
  h.listHandler=null;await h.clock.advance(16000);
  assert.match(connection.textContent,/Observación con retraso/);
  h.capabilitiesHandler=()=>response({ok:true,mode:'desktop',bidirectional:true,available:true});await h.api.refresh();
  assert.match(connection.textContent,/Esperando observación nativa/);h.api.destroy();
});

test('desktop with unavailable bidirectionality reports the Mac Mini connection, never a webhook provider',async()=>{
  const h=harness();h.capabilitiesHandler=()=>response({ok:true,mode:'desktop',available:false,bidirectional:false,status:'disconnected'});
  assert.equal(await h.api.select('Steve Jobs'),false);
  assert.match(h.statuses.at(-1),/Mac Mini no está disponible/);
  assert.doesNotMatch(h.statuses.at(-1),/webhook/);
  assert.equal(h.calls.filter(x=>x.path==='/selection').length,0);assert.equal(h.posts.length,0);h.api.destroy();
});

test('backfilled cards and added text in older turns render without replacing the latest spoken turn',async()=>{
  const h=harness();const latest=message({id:'gb_latest',text:'Última respuesta',status:'done',createdAt:'2026-09-18T08:00:00.000Z'});
  h.histories.set('Steve Jobs',[latest]);await h.api.select('Steve Jobs');
  const older=message({id:'gb_older',text:'Texto antiguo',status:'done',createdAt:'2026-09-17T20:00:00.000Z',updatedAt:'2026-09-18T08:00:03.000Z'});
  h.histories.set('Steve Jobs',[latest,older]);await h.clock.advance(3000);
  assert.match(h.log.textContent,/Texto antiguo/);assert.equal(h.answers.length,0);assert.equal(h.settled.length,0);
  h.histories.set('Steve Jobs',[latest,{...older,text:'Texto antiguo ampliado',updatedAt:'2026-09-18T08:00:06.000Z'}]);await h.clock.advance(3000);
  assert.match(h.log.textContent,/Texto antiguo ampliado/);assert.equal(h.answers.length,0);assert.equal(h.settled.length,0);
  const live=message({id:'gb_live',prompt:'',text:'Aviso nuevo',status:'done',createdAt:'2026-09-18T08:00:09.000Z',updatedAt:'2026-09-18T08:00:09.000Z'});
  h.histories.set('Steve Jobs',[older,latest,live]);await h.clock.advance(3000);
  assert.deepEqual(h.answers.map(x=>x.text),['Aviso nuevo']);assert.equal(h.settled.length,1);h.api.destroy();
});

test('first successful history after an interrupted initial read is restored rather than animated',async()=>{
  const h=harness();h.listHandler=async()=>{throw new Error('Initial connection lost');};
  await h.api.select('Steve Jobs');assert.equal(h.answers.length,0);assert.equal(h.restores.length,0);
  h.listHandler=null;h.histories.set('Steve Jobs',[message({text:'Historia recuperada',status:'done'})]);
  await h.clock.advance(3000);
  assert.equal(h.answers.length,0);assert.equal(h.restores.length,1);assert.equal(h.restores[0].text,'Historia recuperada');h.api.destroy();
});
