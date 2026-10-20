// historyMode (bandeja ?chat=1): hilo PERSISTENTE — al seleccionar se lee leerHilo(persona,{limite:60}) y se
// pintan todos los turnos; sin sesión de Google aparece «Entrar con Google»; sin la opción nada cambia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./council-grokbot.js', import.meta.url), 'utf8');
const clienteSrc = readFileSync(new URL('./assets/chat-hilo-client.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
class El {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.text = ''; this.hidden = false; this.lookup = new Map(); this.scrollTop = 0; this.parentNode = null; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
  get innerHTML() { return this.html; }
  set innerHTML(v) {
    this.html = String(v); this.children = []; this.lookup.clear();
    for (const sel of ['.council-chat__toolbar', '.council-chat__attachments', '.council-chat__operations', '[data-chat-attach]', '[data-chat-file]', '[data-chat-routines]', '[data-chat-stop]', '[data-chat-refresh]', '[data-chat-screen]', '.council-chat__connection', '.council-chat__person', '.council-chat__status', '.council-chat__messages', '.council-chat__scope', '.council-chat__limits', '.council-chat__native']) {
      const n = this.doc.createElement('div'); n.parentNode = this; this.lookup.set(sel, n); this.children.push(n);
    }
  }
  querySelector(sel) { return this.lookup.get(sel) || null; }
  append(...n) { n.forEach(x => { if (x) x.parentNode = this; }); this.children.push(...n); }
  insertBefore(n, ref) { n.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); }
  replaceChildren(...n) { this.text = ''; this.children = n; }
  addEventListener(t, f) { (this.l ||= {})[t] = f; }
  insertAdjacentElement() {}
  getClientRects() { return [1]; }
  remove() { this.removed = true; }
  get lastElementChild() { return this.children.at(-1) || null; }
  get childElementCount() { return this.children.filter(n => n.tagName !== '#TEXT').length; }
  get scrollHeight() { return this.textContent.length; }
}
function harness({ jwt = 'tok', historyMode = true } = {}) {
  const doc = { hidden: false, details: null, createElement(t) { const n = new El(t, this); if (t === 'section') this.details = n; return n; }, createTextNode(t) { const n = new El('#text', this); n.textContent = t; return n; }, addEventListener() {} };
  const net = [], hiloCalls = [], authReady = [];
  const fetch = async (url, init) => { net.push(url); return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'desktop', bidirectional: true, available: true, messages: [] }) }; };
  const w = {}; new Function('window', clienteSrc)(w);
  const C = w.ChatHiloClient;
  const state = { jwt };
  // Histórico previo del hilo: NO debe aparecer en la home.
  const turnos = [{ id: 'a', rol: 'carlos', origen: 'app', texto: 'Hola desde la app', ts: '2026-10-09T05:00:00Z' }, { id: 'b', rol: 'persona', origen: 'rutina', texto: 'Hola, Carlos', ts: '2026-10-09T05:00:05Z' }];
  const hilo = { ...C,
    credencial: () => state.jwt,
    leerHilo: async (p, o) => { hiloCalls.push(['leer', p, o && o.limite]); return state.jwt ? { status: 200, ok: true, turnos: turnos.slice() } : { status: 401, ok: false, turnos: [] }; },
    enviarTurno: async (p, texto, id) => { hiloCalls.push(['enviar', p, texto]); const ts = new Date().toISOString(); turnos.push({ id, rol: 'carlos', origen: 'live', texto, ts, entrega: 'entregado', encargo: 7 }); return { status: 201, turno: { id, ts, entrega: 'entregado', encargo: 7 } }; },
    cargarGoogle: (b, ok) => { hiloCalls.push(['google']); state.jwt = 'tok'; ok(); }
  };
  const timers = [];
  const ctx = vm.createContext({ console, URL, AbortController, Date, Intl, crypto: { randomUUID: () => 'u' }, setTimeout: (f, d) => { timers.push(d); return timers.length; }, clearTimeout() {}, setInterval: () => 99, clearInterval() {} });
  vm.runInContext(source, ctx);
  const statuses = [], answers = [], threads = [];
  const api = ctx.CouncilGrokBot.mount({ document: doc, container: doc.createElement('div'), fetch, mountInside: true, hilo, historyMode, onThread: e => threads.push(e), onStatus: s => statuses.push(s), onAuthReady: p => authReady.push(p), onAnswer: a => answers.push(a) });
  return { api, threads, doc, net, hiloCalls, timers, statuses, answers, authReady, turnos, state, log: () => doc.details.querySelector('.council-chat__messages') };
}

test('historyMode · Jobs: al seleccionar carga leerHilo(limite 60) y pinta TODO el histórico (sin puente de GrokBot)', async () => {
  const h = harness();
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  assert.deepEqual(h.net, [], 'no toca el puente de GrokBot');
  assert.deepEqual(h.hiloCalls, [['leer', 'jobs', 60]]);
  const txt = h.log().textContent;
  assert.match(txt, /Hola desde la app/); assert.match(txt, /Hola, Carlos/);
  assert.doesNotMatch(txt, /Chat limpio/);
  assert.equal(h.threads.length, 1); assert.equal(h.threads[0].turnos.length, 2);
  assert.deepEqual(h.answers, [], 'el histórico no se «habla» en la escena');
  const link = h.doc.details.querySelector('.council-chat__toolbar').children.find(n => n.className === 'council-chat__historico');
  assert.equal(link.href, '/chat/jobs/');
});

test('historyMode · enviar añade el turno al hilo persistente y relee el hilo', async () => {
  const h = harness();
  await h.api.select('Steve Jobs'); await flush();
  assert.equal(await h.api.send('Steve Jobs', ' ¿Qué opinas? '), true);
  await flush();
  assert.deepEqual(h.hiloCalls.filter(c => c[0] === 'enviar'), [['enviar', 'jobs', '¿Qué opinas?']]);
  const txt = h.log().textContent;
  assert.match(txt, /Hola desde la app/); assert.match(txt, /¿Qué opinas\?/);
  assert.equal(h.log().children.filter(n => /council-chat__hilo /.test(n.className || '') ).length >= 3, true);
});

test('historyMode · sin sesión de Google: aviso «Entrar con Google» (no falla en silencio) y no se pide el hilo', async () => {
  const h = harness({ jwt: '' });
  await h.api.select('Steve Jobs'); await flush();
  assert.deepEqual(h.hiloCalls, [], 'sin token no se llama a /api/chat/hilo');
  const box = h.doc.details.children.find(n => n.className === 'council-chat__signin');
  assert.ok(box && !box.hidden, 'aviso visible nada más seleccionar');
  assert.match(box.textContent, /Entrar con Google/);
  assert.match(h.statuses.at(-1), /Entra con Google para ver tu conversación con Steve Jobs/);
  assert.match(h.log().textContent, /Entra con Google para ver tu conversación/);
  assert.equal(await h.api.send('Steve Jobs', 'hola'), false, 'no se envía sin sesión; el compositor conserva el texto');
  // Tras entrar se carga el hilo y se oculta el aviso.
  box.children.find(n => n.tagName === 'BUTTON').l.click();
  await flush();
  assert.deepEqual(h.authReady, ['Steve Jobs']);
  assert.ok(box.hidden);
  assert.ok(h.hiloCalls.some(c => c[0] === 'leer' && c[1] === 'jobs' && c[2] === 60), 'tras entrar se lee el hilo');
  assert.match(h.log().textContent, /Hola desde la app/);
});

test('historyMode · cambiar de consejero con una lectura en vuelo no pierde la carga del nuevo', async () => {
  const h = harness();
  const p1 = h.api.select('Steve Jobs');
  const p2 = h.api.select('Steve Wozniak');
  await Promise.all([p1, p2]); await flush();
  assert.ok(h.hiloCalls.some(c => c[1] === 'wozniak'), 'se pide el hilo del nuevo');
  assert.equal(h.api.selected, 'Steve Wozniak');
});

test('sin historyMode el comportamiento es el de siempre (visita en blanco, sin leer el hilo al seleccionar)', async () => {
  const h = harness({ historyMode: false });
  await h.api.select('Steve Jobs'); await flush();
  assert.deepEqual(h.hiloCalls, []);
  assert.match(h.log().textContent, /Chat limpio/);
  assert.doesNotMatch(h.log().textContent, /Hola desde la app/);
});
