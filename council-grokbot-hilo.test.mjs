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
  const net = [], hiloCalls = [], authReady = [];
  const fetch = async (url, init) => { net.push(url); return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'desktop', bidirectional: true, available: true, messages: [] }) }; };
  const w = {}; new Function('window', clienteSrc)(w);
  const C = w.ChatHiloClient;
  const state = { jwt };
  // Histórico previo del hilo: NO debe aparecer en la home.
  const turnos = [{ id: 'a', rol: 'carlos', origen: 'app', texto: 'Hola desde la app', ts: '2026-10-09T05:00:00Z' }, { id: 'b', rol: 'persona', origen: 'rutina', texto: 'Hola, Carlos', ts: '2026-10-09T05:00:05Z' }];
  const hilo = { ...C,
    credencial: () => state.jwt,
    leerHilo: async (p) => { hiloCalls.push(['leer', p]); return state.jwt ? { status: 200, ok: true, turnos: turnos.slice() } : { status: 401, ok: false, turnos: [] }; },
    enviarTurno: async (p, texto, id) => { hiloCalls.push(['enviar', p, texto]); const ts = new Date().toISOString(); turnos.push({ id, rol: 'carlos', origen: 'live', texto, ts, entrega: 'entregado', encargo: 7 }); return { status: 201, turno: { id, ts, entrega: 'entregado', encargo: 7 } }; },
    cargarGoogle: (b, ok) => { hiloCalls.push(['google']); state.jwt = 'tok'; ok(); }
  };
  const timers = [];
  const ctx = vm.createContext({ console, URL, AbortController, Date, Intl, crypto: { randomUUID: () => 'u' }, setTimeout: (f, d) => { timers.push(d); return timers.length; }, clearTimeout() {}, setInterval: () => 99, clearInterval() {} });
  vm.runInContext(source, ctx);
  const statuses = [], answers = [];
  const api = ctx.CouncilGrokBot.mount({ document: doc, container: doc.createElement('div'), fetch, mountInside: true, hilo, onStatus: s => statuses.push(s), onAuthReady: p => authReady.push(p), onAnswer: a => answers.push(a) });
  return { api, doc, net, hiloCalls, timers, statuses, answers, authReady, turnos, state, log: () => doc.details.querySelector('.council-chat__messages') };
}

test('home · Jobs: visita en blanco — no carga el histórico, envía por /api/chat/enviar y solo muestra esta visita', async () => {
  const h = harness();
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  assert.deepEqual(h.net, [], 'no toca el puente de GrokBot');
  assert.deepEqual(h.hiloCalls, [], 'al seleccionar no se lee el hilo (sin histórico en la home)');
  let txt = h.log().textContent;
  assert.match(txt, /Chat limpio/); assert.match(txt, /le llega a Jobs y se guarda en la misma conversación que en Grok Bot/);
  assert.doesNotMatch(txt, /Hola desde la app|Hola, Carlos/);
  const toolbar = h.doc.details.querySelector('.council-chat__toolbar');
  const link = toolbar.children.find(n => n.className === 'council-chat__historico');
  assert.ok(link && !link.hidden, 'enlace «Ver histórico»');
  assert.equal(link.href, '/chat/jobs/'); assert.equal(link.textContent, 'Ver histórico');
  assert.equal(await h.api.send('Steve Jobs', '  ¿Qué opinas?  '), true);
  await flush();
  assert.deepEqual(h.hiloCalls[0], ['enviar', 'jobs', '¿Qué opinas?']);
  assert.deepEqual(h.hiloCalls[1], ['leer', 'jobs'], 'tras enviar se sondea el hilo para ver la respuesta');
  txt = h.log().textContent;
  assert.match(txt, /¿Qué opinas\?/); assert.match(txt, /entregado · encargo #7/);
  assert.doesNotMatch(txt, /Hola desde la app|Hola, Carlos/, 'el histórico sigue fuera');
  assert.match(txt, /Jobs está escribiendo… · \d+ s/);
  assert.equal(h.timers.at(-1), 2000, 'esperando respuesta: 2 s');
  // Llega la respuesta de Jobs (posterior al primer envío) y un turno de la App que no es de esta visita.
  h.turnos.push({ id: 'app2', rol: 'carlos', origen: 'app', texto: 'Escrito en la App', ts: new Date(Date.now() + 500).toISOString() });
  h.turnos.push({ id: 'r1', rol: 'persona', origen: 'rutina', texto: 'Piensa diferente.', ts: new Date(Date.now() + 1000).toISOString() });
  await h.api.refresh(); await flush();
  txt = h.log().textContent;
  assert.match(txt, /Piensa diferente\./);
  assert.doesNotMatch(txt, /Escrito en la App/);
  assert.doesNotMatch(txt, /está escribiendo/);
  assert.deepEqual(h.answers.map(a => a.text), ['Piensa diferente.']);
  assert.deepEqual(h.net, []);
});

test('home · Jobs sin sesión: se puede escribir; al enviar pide Entrar con Google, conserva el texto y avisa al entrar', async () => {
  const h = harness({ jwt: '' });
  await h.api.select('Steve Jobs'); await flush();
  assert.equal(h.hiloCalls.length, 0);
  assert.ok(!h.doc.details.children.some(n => n.className === 'council-chat__signin' && !n.hidden), 'sin aviso hasta que envía');
  assert.equal(await h.api.send('Steve Jobs', 'hola'), false, 'no aceptado: el compositor conserva el texto');
  const box = h.doc.details.children.find(n => n.className === 'council-chat__signin');
  assert.ok(box && !box.hidden);
  assert.match(box.textContent, /Entrar con Google/); assert.match(box.textContent, /se conserva/);
  assert.deepEqual(h.net, []); assert.equal(h.hiloCalls.length, 0);
  box.children.find(n => n.tagName === 'BUTTON').l.click();
  assert.deepEqual(h.authReady, ['Steve Jobs'], 'tras entrar, la integración reenvía el texto conservado');
  assert.ok(box.hidden);
  assert.equal(await h.api.send('Steve Jobs', 'hola'), true);
});

test('los demás consejeros siguen por el puente de GrokBot', async () => {
  const h = harness();
  await h.api.select('Steve Wozniak'); await flush();
  assert.ok(h.net.some(u => /\/capabilities/.test(u)));
  assert.equal(h.hiloCalls.length, 0);
  const link = h.doc.details.querySelector('.council-chat__toolbar').children.find(n => n.className === 'council-chat__historico');
  assert.ok(link.hidden, '«Ver histórico» solo con el hilo compartido');
});

test('home · el compositor queda fijo abajo: el panel no crece con los mensajes (CSS)', () => {
  const css = readFileSync(new URL('./council-grokbot.css', import.meta.url), 'utf8');
  assert.match(css, /\.scumm-module-content>\.council-preview:not\(\.is-expanded\)\{align-self:stretch;max-height:100%;min-height:0/);
  assert.match(css, /\.council-preview \.council-chat__messages\{min-height:0;overflow-y:auto\}/);
  assert.match(css, /\.council-preview \.council-composer\{flex:none\}/);
});

test('home · la barra «Preguntar a … Enviar» va por el mismo camino y conserva el texto si no se acepta', () => {
  const src = readFileSync(new URL('./council-integration.js', import.meta.url), 'utf8');
  assert.match(src, /if\(bridge\.selected!==persona&&bridge\.has\(persona\)\)await bridge\.select\(persona\)/);
  assert.match(src, /finally\{if\(!ok&&.*restoreDraft\(persona,text\);\}/);
  assert.match(src, /onAuthReady\(persona\)\{[^}]*sendPreview\(text\)/);
});
