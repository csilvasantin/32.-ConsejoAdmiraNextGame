// Panel «Conversación» de la home: con Steve Jobs usa el hilo compartido (/api/chat/hilo +
// /api/chat/enviar vía ChatHiloClient) y los demás consejeros siguen por el puente de GrokBot.
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
function harness({ jwt = 'tok' } = {}) {
  const doc = { hidden: false, details: null, createElement(t) { const n = new El(t, this); if (t === 'section') this.details = n; return n; }, createTextNode(t) { const n = new El('#text', this); n.textContent = t; return n; }, addEventListener() {} };
  const net = [], hiloCalls = [];
  const fetch = async (url, init) => { net.push(url); return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'desktop', bidirectional: true, available: true, messages: [] }) }; };
  const w = {}; new Function('window', clienteSrc)(w);
  const C = w.ChatHiloClient;
  const turnos = [{ id: 'a', rol: 'carlos', origen: 'app', texto: 'Hola desde la app', ts: '2026-10-09T05:00:00Z' }, { id: 'b', rol: 'persona', origen: 'rutina', texto: 'Hola, Carlos', ts: '2026-10-09T05:00:05Z' }];
  const hilo = { ...C,
    credencial: () => jwt,
    leerHilo: async (p) => { hiloCalls.push(['leer', p]); return jwt ? { status: 200, ok: true, turnos } : { status: 401, ok: false, turnos: [] }; },
    enviarTurno: async (p, texto, id) => { hiloCalls.push(['enviar', p, texto]); return { status: 200, turno: { id, entrega: 'entregado', encargo: 7 } }; },
    cargarGoogle: () => hiloCalls.push(['google'])
  };
  const timers = [];
  const ctx = vm.createContext({ console, URL, AbortController, Date, Intl, crypto: { randomUUID: () => 'u' }, setTimeout: (f, d) => { timers.push(d); return timers.length; }, clearTimeout() {}, setInterval: () => 99, clearInterval() {} });
  vm.runInContext(source, ctx);
  const statuses = [];
  const api = ctx.CouncilGrokBot.mount({ document: doc, container: doc.createElement('div'), fetch, mountInside: true, hilo, onStatus: s => statuses.push(s) });
  return { api, doc, net, hiloCalls, timers, statuses, log: () => doc.details.querySelector('.council-chat__messages') };
}

test('Jobs usa el hilo compartido: lee /api/chat/hilo, pinta turnos con origen y envía por /api/chat/enviar', async () => {
  const h = harness();
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  assert.deepEqual(h.net, [], 'no toca el puente de GrokBot');
  assert.deepEqual(h.hiloCalls[0], ['leer', 'jobs']);
  const txt = h.log().textContent;
  assert.match(txt, /Hola desde la app/); assert.match(txt, /Hola, Carlos/); assert.match(txt, /App/); assert.match(txt, /rutina/);
  assert.match(h.doc.details.querySelector('.council-chat__scope').textContent, /misma conversación que en Grok Bot/);
  assert.ok(h.statuses.some(s => /misma que en Grok Bot/.test(s)));
  assert.equal(h.timers.at(-1), 10000, 'reposo: 10 s');
  assert.equal(await h.api.send('Steve Jobs', '  ¿Qué opinas?  '), true);
  await flush();
  assert.deepEqual(h.hiloCalls.find(c => c[0] === 'enviar'), ['enviar', 'jobs', '¿Qué opinas?']);
  assert.match(h.log().textContent, /entregado · encargo #7/);
  assert.match(h.log().textContent, /Jobs está escribiendo… · \d+ s/);
  assert.equal(h.timers.at(-1), 2000, 'esperando respuesta: 2 s');
  assert.deepEqual(h.net, []);
});

test('Jobs sin sesión de Google: aviso de acceso en línea, sin llamadas de red, y el borrador se conserva', async () => {
  const h = harness({ jwt: '' });
  await h.api.select('Steve Jobs'); await flush();
  assert.equal(h.hiloCalls.length, 0);
  const box = h.doc.details.children.find(n => n.className === 'council-chat__signin');
  assert.ok(box && !box.hidden);
  assert.match(box.textContent, /Entrar con Google/);
  assert.equal(await h.api.send('Steve Jobs', 'hola'), false);
  assert.deepEqual(h.net, []);
});

test('los demás consejeros siguen por el puente de GrokBot', async () => {
  const h = harness();
  await h.api.select('Steve Wozniak'); await flush();
  assert.ok(h.net.some(u => /\/capabilities/.test(u)));
  assert.equal(h.hiloCalls.length, 0);
});
