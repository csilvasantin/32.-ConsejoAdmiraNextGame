// Panel «Conversación» de la home: con Steve Jobs usa el hilo compartido (/api/chat/hilo +
// /api/chat/enviar vía ChatHiloClient) y los demás consejeros siguen por el puente de GrokBot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./council-grokbot.js', import.meta.url), 'utf8');
const clienteSrc = readFileSync(new URL('./assets/chat-hilo-client.js', import.meta.url), 'utf8');
const entreSrc = readFileSync(new URL('./assets/consejero-mensajes.js', import.meta.url), 'utf8');
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
function harness({ jwt = 'tok', entre = [] } = {}) {
  const doc = { hidden: false, details: null, createElement(t) { const n = new El(t, this); if (t === 'section') this.details = n; return n; }, createTextNode(t) { const n = new El('#text', this); n.textContent = t; return n; }, addEventListener() {} };
  const net = [], hiloCalls = [], authReady = [];
  const fetch = async (url, init) => {
    const u = String(url);
    net.push(u);
    if (/entre-consejeros/.test(u)) {
      return { ok: true, status: jwt ? 200 : 401, json: async () => ({ ok: true, con: (u.match(/con=([^&]+)/) || [])[1], mensajes: entre.slice(), pendientes: 0 }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'desktop', bidirectional: true, available: true, messages: [] }) };
  };
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
  const store = {};
  const ctx = vm.createContext({
    console, URL, AbortController, Date, Intl, crypto: { randomUUID: () => 'u' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout: (f, d) => { timers.push(d); return timers.length; }, clearTimeout() {}, setInterval: () => 99, clearInterval() {},
  });
  vm.runInContext(entreSrc, ctx);
  vm.runInContext(source, ctx);
  const statuses = [], answers = [];
  const api = ctx.CouncilGrokBot.mount({ document: doc, container: doc.createElement('div'), fetch, mountInside: true, hilo, onStatus: s => statuses.push(s), onAuthReady: p => authReady.push(p), onAnswer: a => answers.push(a) });
  return { api, doc, net, hiloCalls, timers, statuses, answers, authReady, turnos, state, log: () => doc.details.querySelector('.council-chat__messages') };
}

test('home · Jobs: visita en blanco — no carga el histórico, envía por /api/chat/enviar y solo muestra esta visita', async () => {
  const h = harness();
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  assert.ok(h.net.every(u => /entre-consejeros\?con=jobs/.test(u)), 'al seleccionar pide la transcripción, no el puente de GrokBot');
  assert.deepEqual(h.hiloCalls, [], 'al seleccionar no se lee el hilo Carlos↔Jobs (sin histórico de visita en la home)');
  let txt = h.log().textContent;
  assert.match(txt, /Escribe a Steve Jobs y pulsa Enviar/);
  assert.match(txt, /transcripción entre consejeros aparecerá aquí/i);
  assert.doesNotMatch(txt, /Hola desde la app|Hola, Carlos/);
  const toolbar = h.doc.details.querySelector('.council-chat__toolbar');
  const link = toolbar.children.find(n => n.className === 'council-chat__historico');
  assert.ok(link && !link.hidden, 'enlace «Ver histórico»');
  assert.equal(link.href, '/chat/jobs/'); assert.equal(link.textContent, 'Histórico');
  assert.equal(await h.api.send('Steve Jobs', '  ¿Qué opinas?  '), true);
  await flush();
  assert.deepEqual(h.hiloCalls[0], ['enviar', 'jobs', '¿Qué opinas?']);
  assert.deepEqual(h.hiloCalls[1], ['leer', 'jobs'], 'tras enviar se sondea el hilo para ver la respuesta');
  txt = h.log().textContent;
  assert.match(txt, /¿Qué opinas\?/); assert.match(txt, /entregado · encargo #7/);
  assert.doesNotMatch(txt, /Hola desde la app|Hola, Carlos/, 'el histórico sigue fuera');
  assert.match(txt, /Jobs está escribiendo… · \d+ s/);
  assert.equal(h.timers.at(-1), 1000, 'esperando respuesta: 1 s');
  // Llega la respuesta de Jobs (posterior al primer envío) y un turno de la App que no es de esta visita.
  h.turnos.push({ id: 'app2', rol: 'carlos', origen: 'app', texto: 'Escrito en la App', ts: new Date(Date.now() + 500).toISOString() });
  h.turnos.push({ id: 'r1', rol: 'persona', origen: 'rutina', texto: 'Piensa diferente.', ts: new Date(Date.now() + 1000).toISOString() });
  await h.api.refresh(); await flush();
  txt = h.log().textContent;
  assert.match(txt, /Piensa diferente\./);
  assert.doesNotMatch(txt, /Escrito en la App/);
  assert.doesNotMatch(txt, /está escribiendo/);
  assert.deepEqual(h.answers.map(a => a.text), ['Piensa diferente.']);
  assert.ok(h.net.every(u => /entre-consejeros/.test(u)), 'sigue sin tocar el puente de GrokBot');
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

test('los consejeros sin hilo compartido siguen por el puente de GrokBot', async () => {
  const h = harness();
  await h.api.select('Mira Murati'); await flush();
  assert.ok(h.net.some(u => /\/capabilities/.test(u)));
  assert.ok(!h.net.some(u => /entre-consejeros/.test(u)), 'sin transcripción entre consejeros fuera del hilo compartido');
  assert.equal(h.hiloCalls.length, 0);
  const link = h.doc.details.querySelector('.council-chat__toolbar').children.find(n => n.className === 'council-chat__historico');
  assert.ok(link.hidden, '«Histórico» solo con el hilo compartido');
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

const PAR_JOBS_ELON = [
  { id: 'cmmwdd8mdbfyqplc', de: 'Jobs', para: 'Musk', texto: 'Hola Elon, ¿me oyes?', hora: '2026-11-12T09:49:00Z' },
  { id: 'cmmelonreply1', de: 'Musk', para: 'Jobs', texto: 'Te oigo, Jobs. Sigamos por admira.live.', hora: '2026-11-12T09:49:40Z' },
];

test('home · Conversación muestra la transcripción Jobs ↔ Elon y no la borra el chat limpio', async () => {
  const h = harness({ entre: PAR_JOBS_ELON });
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  assert.ok(h.net.some(u => /entre-consejeros\?con=jobs/.test(u)));
  let txt = h.log().textContent;
  assert.match(txt, /Jobs ↔ Elon|Jobs → Elon/);
  assert.match(txt, /Elon → Jobs|Jobs ↔ Elon/);
  assert.match(txt, /Hola Elon, ¿me oyes\?/);
  assert.match(txt, /10:49:00/);
  assert.match(txt, /10:49:40/);
  assert.match(txt, /Te oigo, Jobs/);
  assert.match(txt, /queda registrada; no la borra el chat limpio/i);
  assert.doesNotMatch(txt, /Hola desde la app|Hola, Carlos/, 'el histórico Carlos↔Jobs sigue fuera');
  const voz = h.doc.details.querySelector('.council-chat__toolbar').children.find(n => n.className === 'council-chat__voz');
  assert.ok(voz, 'botón Activar voz en la barra');
  // Re-seleccionar (nueva visita en blanco) no pierde la transcripción.
  assert.equal(await h.api.select('Steve Jobs'), true);
  await flush();
  txt = h.log().textContent;
  assert.match(txt, /Jobs ↔ Elon|Jobs → Elon/);
  assert.match(txt, /Te oigo, Jobs/);
});

test('home · al seleccionar Elon se ve el mismo par con con=musk, intercalado por hora con esta visita', async () => {
  const h = harness({ entre: PAR_JOBS_ELON });
  assert.equal(await h.api.select('Elon Musk'), true);
  await flush();
  assert.ok(h.net.some(u => /entre-consejeros\?con=musk/.test(u)));
  let txt = h.log().textContent;
  assert.match(txt, /Jobs ↔ Elon|Jobs → Elon/);
  assert.match(txt, /Elon → Jobs|Jobs ↔ Elon/);
  const posJobs = txt.indexOf('Hola Elon');
  const posElon = txt.indexOf('Te oigo, Jobs');
  assert.ok(posJobs >= 0 && posJobs < posElon, 'orden cronológico');
  assert.equal(await h.api.send('Elon Musk', 'Sigo aquí'), true);
  await flush();
  txt = h.log().textContent;
  assert.match(txt, /Sigo aquí/);
  assert.match(txt, /Te oigo, Jobs/, 'la transcripción permanece tras escribir en esta visita');
});

test('index.html de la portada carga consejero-mensajes.js y el council-grokbot nuevo', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /consejero-mensajes.js\?v=20261112-sin-acople/);
  assert.match(html, /council-grokbot.js\?v=20261112-sin-acople/);
  assert.match(html, /consejeros-voces\.js/);
});
