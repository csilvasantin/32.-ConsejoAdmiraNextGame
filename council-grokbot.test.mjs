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
    updatedAt: '2026-09-18T08:00:00.000Z', ...overrides
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
  let now = 0, nextTimer = 0, uuid = 0;
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
  const histories = new Map(), calls = [], answers = [], restores = [], statuses = [], errors = [], pending = [];
  const h = { clock, doc, histories, calls, answers, restores, statuses, errors, pending, getHandler: null, postHandler: null };
  const fetch = async (url, init) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname.replace('/api/grokbot', ''), query: parsed.searchParams, method: init.method, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    if (call.path === '/capabilities') return response({ ok: true, available: true });
    if (call.path === '/messages' && call.method === 'GET') return response({ ok: true, messages: histories.get(call.query.get('persona')) || [] });
    if (call.path === '/messages' && call.method === 'POST') return h.postHandler ? h.postHandler(call) : response({ ok: true, message: message() });
    if (call.path.startsWith('/messages/')) return h.getHandler ? h.getHandler(call) : response({ ok: true, message: message({ status: 'done', text: 'Respuesta actual', updatedAt: '2026-09-18T08:00:05.000Z' }) });
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
    onPending: value => pending.push(plain(value))
  });
  Object.defineProperty(h, 'log', { get: () => doc.details.querySelector('.council-chat__messages') });
  Object.defineProperty(h, 'posts', { get: () => calls.filter(call => call.method === 'POST') });
  Object.defineProperty(h, 'gets', { get: () => calls.filter(call => call.path.startsWith('/messages/')) });
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

test('Jobs → Lucas → Jobs retains the new poll when an already dispatched old GET completes', async () => {
  const h = harness(), oldGet = deferred();
  h.histories.set('Steve Jobs', [message()]);
  h.getHandler = () => h.gets.length === 1 ? oldGet.promise : response({ ok: true, message: message({ status: 'done', text: 'La respuesta de Jobs', updatedAt: '2026-09-18T08:00:05.000Z' }) });
  await h.api.select('Steve Jobs'); await h.clock.advance(1500);
  assert.equal(h.gets.length, 1);
  await h.api.select('George Lucas'); await h.api.select('Steve Jobs');
  oldGet.resolve(response({ ok: true, message: message({ status: 'in_progress', text: 'Progreso antiguo', updatedAt: '2026-09-18T08:00:02.000Z' }) }));
  await flush();
  assert.equal(h.answers.length, 0, 'old selection cannot speak over the current selection');
  assert.equal(h.clock.polls, 1);
  await h.api.refresh({ restore: false });
  assert.equal(h.clock.polls, 1, 'old completion must not remove ownership of the new poll');
  await h.clock.advance(1500);
  assert.equal(h.gets.length, 2); assert.equal(h.clock.polls, 0);
  assert.deepEqual(h.answers.map(item => [item.persona, item.text]), [['Steve Jobs', 'La respuesta de Jobs']]);
  assert.match(h.log.textContent, /La respuesta de Jobs/);
  h.api.destroy();
});

test('a delayed POST receipt follows the current selection after leaving and returning to its adviser', async () => {
  const h = harness(), post = deferred();
  h.postHandler = () => post.promise;
  await h.api.select('Steve Jobs');
  const sending = h.api.send('Steve Jobs', 'Pregunta enviada una vez'); await flush();
  assert.equal(h.posts.length, 1);
  await h.api.select('George Lucas'); await h.api.select('Steve Jobs');
  post.resolve(response({ ok: true, message: message() })); await sending;
  assert.equal(h.clock.polls, 1);
  await h.clock.advance(1500);
  assert.equal(h.answers.length, 1); assert.equal(h.answers[0].persona, 'Steve Jobs');
  assert.equal(h.posts.length, 1); h.api.destroy();
});

test('a delayed POST for Jobs cannot display his result or start a poll while Lucas is selected', async () => {
  const h = harness(), post = deferred(); h.postHandler = () => post.promise;
  await h.api.select('Steve Jobs');
  const sending = h.api.send('Steve Jobs', 'Pregunta en segundo plano'); await flush();
  await h.api.select('George Lucas');
  post.resolve(response({ ok: true, message: message({ status: 'done', text: 'Solo para Jobs' }) })); await sending;
  assert.equal(h.api.selected, 'George Lucas'); assert.equal(h.answers.length, 0); assert.equal(h.clock.polls, 0);
  assert.doesNotMatch(h.log.textContent, /Solo para Jobs/);
  await h.api.select('Steve Jobs');
  assert.match(h.log.textContent, /Solo para Jobs/); assert.equal(h.answers.length, 0, 'history restores without a new spoken answer');
  h.api.destroy();
});

test('an older poll snapshot cannot overwrite a newer final reply restored by refresh', async () => {
  const h = harness(), oldGet = deferred(); h.getHandler = () => oldGet.promise;
  h.histories.set('Steve Jobs', [message()]);
  await h.api.select('Steve Jobs'); await h.clock.advance(1500);
  h.histories.set('Steve Jobs', [message({ status: 'done', text: 'Texto definitivo', updatedAt: '2026-09-18T08:00:09.000Z' })]);
  await h.api.refresh();
  oldGet.resolve(response({ ok: true, message: message({ status: 'in_progress', text: 'Texto obsoleto', updatedAt: '2026-09-18T08:00:02.000Z' }) }));
  await flush();
  assert.match(h.log.textContent, /Texto definitivo/); assert.doesNotMatch(h.log.textContent, /Texto obsoleto/);
  assert.ok(h.answers.every(answer => answer.text === 'Texto definitivo'));
  assert.equal(h.clock.polls, 0); h.api.destroy();
});

test('bot and user markup stays literal text in history and answer callbacks', async () => {
  const h = harness(), attack = '<img src=x onerror="globalThis.pwned=true"><script>alert(1)</script>';
  h.histories.set('Steve Jobs', [message({ prompt: attack })]);
  h.getHandler = () => response({ ok: true, message: message({ prompt: attack, status: 'done', text: attack, updatedAt: '2026-09-18T08:00:05.000Z' }) });
  await h.api.select('Steve Jobs'); await h.clock.advance(1500);
  assert.ok(h.log.textContent.includes(attack)); assert.equal(h.answers[0].text, attack);
  assert.ok(h.doc.markup.every(html => !html.includes(attack)), 'untrusted data must not reach innerHTML');
  assert.ok(h.doc.nodes.every(node => !['IMG', 'SCRIPT'].includes(node.tagName)));
  h.api.destroy();
});

test('ambiguous POST failure never retries automatically, including a manual history refresh', async () => {
  const h = harness(); h.postHandler = async () => { throw new Error('network interrupted'); };
  await h.api.select('Steve Jobs'); await h.api.send('Steve Jobs', 'Mensaje que puede haberse aceptado');
  assert.equal(h.errors.length, 1); assert.equal(h.posts.length, 1);
  await h.clock.advance(600000); await h.api.refresh();
  assert.equal(h.posts.length, 1); assert.equal(h.clock.polls, 0); h.api.destroy();
});

test('a failed result GET can recover via refresh without resending the accepted message', async () => {
  const h = harness();
  h.getHandler = async () => { throw new Error('poll connection lost'); };
  await h.api.select('Steve Jobs'); await h.api.send('Steve Jobs', 'Mensaje ya aceptado');
  await h.clock.advance(1500);
  assert.equal(h.posts.length, 1); assert.equal(h.clock.polls, 0);
  assert.match(h.statuses.at(-1), /no se reenviará/);
  await h.clock.advance(30000);
  assert.equal(h.posts.length, 1); assert.equal(h.gets.length, 1);
  h.getHandler = () => response({ ok: true, message: message({ status: 'done', text: 'Respuesta recuperada', updatedAt: '2026-09-18T08:00:05.000Z' }) });
  await h.api.refresh(); await h.clock.advance(1500);
  assert.equal(h.posts.length, 1); assert.equal(h.answers[0].text, 'Respuesta recuperada'); h.api.destroy();
});

test('a response completing after destroy cannot speak, render a result or leave a new poll', async () => {
  const h = harness(), get = deferred(); h.getHandler = () => get.promise;
  h.histories.set('Steve Jobs', [message()]);
  await h.api.select('Steve Jobs'); await h.clock.advance(1500); h.api.destroy();
  get.resolve(response({ ok: true, message: message({ status: 'done', text: 'Respuesta tardía' }) })); await flush();
  assert.equal(h.answers.length, 0); assert.equal(h.clock.polls, 0); assert.equal(h.doc.details.removed, true);
});
