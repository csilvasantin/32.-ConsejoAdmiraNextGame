import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const speechSource = readFileSync(new URL('./council-speech.js', import.meta.url), 'utf8');
const integrationSource = readFileSync(new URL('./council-integration.js', import.meta.url), 'utf8');

// The actual speech controller runs with a deterministic frame clock. Only the
// browser shell and network bridge are doubled: no connection or bot is used.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.dataset = {};
    this.style = {
      setProperty(name, value) { this[name] = String(value); },
      getPropertyValue(name) { return this[name] || ''; }
    };
    this.children = []; this.lookup = new Map(); this.attributes = new Map();
    this.hidden = false; this.textContent = ''; this.scrollTop = 0; this.scrollHeight = 120;
    this.value = ''; this.listeners = new Map();
    this.parentElement = null; this.className = ''; this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value),
      remove: value => this.classes.delete(value),
      contains: value => this.classes.has(value),
      toggle: (value, on) => {
        const present = on === undefined ? !this.classes.has(value) : on;
        if (present) this.classes.add(value); else this.classes.delete(value);
        return present;
      }
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove(); this.children.push(node); node.parentElement = this;
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this.append(...nodes); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
  insertAdjacentElement(position, node) {
    assert.equal(position, 'afterend');
    assert.ok(this.parentElement, 'insertion requires a real parent');
    node.remove(); const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node); node.parentElement = parent;
  }
  querySelector(selector) { return this.lookup.get(selector) || null; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  focus() {}
  getContext() { return null; } // Canvas rendering has its own tests; do not fake image data.
}

function harness({withComposer=false,send=()=>true}={}) {
  let now = 0, sequence = 0, imageWidth = 1360;
  const frames = new Map(), observers = [], listeners = new Map();
  const body = new Element('body'), stage = new Element(), scene = new Element(), image = new Element('img');
  const overlay = new Element(), bubble = new Element(), legacyMouths = new Element();
  const speaker = new Element(), text = new Element(), ficha = new Element('a');
  bubble.lookup.set('.speaker', speaker); bubble.lookup.set('.speech-text', text); bubble.lookup.set('.speech-ficha', ficha);
  bubble.append(speaker, text, ficha); overlay.append(bubble); scene.append(image, overlay, legacyMouths); stage.append(scene); body.append(stage);
  image.getBoundingClientRect = () => ({ left: 0, top: 0, width: imageWidth, height: imageWidth * 768 / 1360 });
  const doc = {
    visibilityState: 'visible',
    querySelector: selector => ({ '.council-image': scene, '.stage-row': stage })[selector] || null,
    getElementById: id => ({ 'council-img': image, 'speech-bubble': bubble, 'mouth-overlays': legacyMouths })[id] || null,
    createElement: tag => new Element(tag),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event)
  };
  const tables = [], begins = [], updates = [];
  const input=new Element('input'), chat=new Element();
  let composerOptions, composerState;
  const originalGet=doc.getElementById;
  if(withComposer)doc.getElementById=id=>id==='action-input'?input:originalGet(id);
  let bridgeOptions, selected = null;
  const personas = new Set(['Steve Jobs', 'Steve Wozniak', 'Walt Disney', 'George Lucas']);
  const bridge = {
    has: name => personas.has(name),
    select(name) { selected = personas.has(name) ? name : null; bridgeOptions.onSelect(selected); return true; },
    send, hasAttachments(){return false;}, openHistory() {}, get selected() { return selected; }
  };
  class ResizeObserver {
    constructor(fn) { observers.push(fn); }
    observe() {} disconnect() {}
  }
  const context = vm.createContext({
    console, document: doc, ResizeObserver, Intl, location: { origin: 'https://www.admira.live' },
    performance: { now: () => now },
    requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
    CouncilGrokBot: {
      LABELS: { done: 'Respuesta recibida', failed: 'No se pudo completar', blocked: 'El bot necesita atención' },
      terminal: status => ['done', 'blocked', 'failed', 'unknown'].includes(status),
      mount(options) { bridgeOptions = options; return bridge; }
    },
    CouncilTable: {
      mount() { const table = { closes: 0, close() { this.closes++; }, show() {} }; tables.push(table); return table; }
    }
  });
  if(withComposer){
    context.CouncilPreview={mount(){return {chatHost:{querySelector:()=>chat},select(){},open(){}};}};
    context.CouncilComposer={mount(options){composerOptions=options;return {update(state){composerState=state;},focus(){}};}};
  }
  context.window = context;
  vm.runInContext(speechSource, context);
  const original = context.CouncilSpeech;
  context.CouncilSpeech = {
    ...original,
    create(options) {
      const real = original.create(options);
      return {
        ...real,
        begin(value) { const token = real.begin(value); begins.push({ ...value, token }); return token; },
        update(token, value, options) { updates.push({ token, value, ...options }); return real.update(token, value, options); }
      };
    }
  };
  vm.runInContext(integrationSource, context);
  const api = context.CouncilInterface;
  assert.ok(api, 'integration did not mount');
  return {
    api, frames, begins, updates, tables, bubble, overlay, speaker, text, body, doc, input,
    get composer(){return composerOptions;}, get composerState(){return composerState;},
    get events() { return bridgeOptions; },
    get state() { return api.speech.snapshot(); },
    step(ms = 40) { now += ms; const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(now); },
    drain() { let limit = 1000; while (frames.size && limit-- > 0) this.step(); assert.equal(frames.size, 0, 'speech never settled'); },
    resize(width) { imageWidth = width; for (const observer of observers) observer(); }
  };
}

function answer(overrides = {}) {
  return { persona: 'Steve Jobs', messageId: 'gb_current_message', text: 'Una respuesta que sigue creciendo', status: 'in_progress', ...overrides };
}

test('updates of one remote message reuse the speech token and never replay its visible prefix', () => {
  const h = harness(); h.api.select('Steve Jobs');
  h.events.onAnswer(answer()); h.step(); h.step();
  const token = h.state.token, prefix = h.state.text, count = h.begins.length;
  assert.ok(prefix.length > 0); assert.equal(h.state.complete, false);
  h.events.onAnswer(answer({ text: 'Una respuesta que sigue creciendo con otro fragmento' }));
  assert.equal(h.state.token, token, 'a new chunk must not open a new speech turn');
  assert.equal(h.begins.length, count); assert.equal(h.state.text, prefix, 'do not erase already revealed text');
  assert.equal(h.updates.at(-1).token, token); assert.equal(h.updates.at(-1).final, false);
  h.drain(); assert.equal(h.state.state, 'waiting'); assert.equal(h.state.speaking, false);
});

test('a terminal status completes the existing turn even when the provider text is unchanged', () => {
  const h = harness(); h.api.select('Steve Jobs');
  const row = answer({ text: 'La respuesta final' });
  h.events.onAnswer(row); h.drain();
  const token = h.state.token, count = h.begins.length;
  assert.equal(h.state.complete, false);
  // A connector may suppress onAnswer for duplicate text but still emits the
  // transition in onSettled. This is the exact terminal-with-identical-text case.
  h.events.onSettled({ ...row, status: 'done' }); h.drain();
  assert.equal(h.state.token, token); assert.equal(h.begins.length, count);
  assert.equal(h.state.text, row.text); assert.equal(h.state.complete, true);
  assert.equal(h.state.state, 'idle'); assert.equal(h.state.speaking, false);
});

test('changing counsellor cancels a dispatched frame and ignores the old counsellor callbacks', () => {
  const h = harness(); h.api.select('Steve Jobs');
  h.events.onAnswer(answer()); const staleFrame = [...h.frames.values()][0]; h.step();
  h.api.select('George Lucas');
  assert.equal(h.state.persona, 'George Lucas'); assert.equal(h.frames.size, 0); assert.equal(h.bubble.hidden, true);
  staleFrame(90000);
  h.events.onAnswer(answer({ status: 'done', text: 'Respuesta tardía de Jobs' }));
  h.events.onSettled(answer({ status: 'done', text: 'Respuesta tardía de Jobs' }));
  assert.equal(h.state.persona, 'George Lucas'); assert.equal(h.state.speaking, false);
  assert.equal(h.bubble.hidden, true); assert.equal(h.text.textContent, '');
});

test('closing a visible response cancels every animation callback and hides its dock', () => {
  const h = harness(); h.api.select('Steve Jobs'); h.resize(700);
  h.events.onAnswer(answer()); h.step();
  const pending = [...h.frames.values()][0];
  assert.equal(h.bubble.hidden, false); assert.equal(h.state.speaking, true);
  h.api.close(); pending(90000);
  h.events.onAnswer(answer({ status: 'done', text: 'Actualización tras cerrar el bocadillo' }));
  h.events.onSettled(answer({ status: 'done', text: 'Actualización tras cerrar el bocadillo' }));
  assert.equal(h.frames.size, 0); assert.equal(h.state.speaking, false); assert.equal(h.state.text, '');
  assert.equal(h.bubble.hidden, true); assert.equal(h.bubble.parentElement.hidden, true);
});

test('history restores complete text without a speaking turn or a scheduled frame', () => {
  const h = harness(); h.api.select('Steve Jobs');
  h.text.scrollTop = 120;
  h.events.onRestore(answer({ text: 'Respuesta ya guardada', status: 'done' }));
  assert.equal(h.text.textContent, 'Respuesta ya guardada'); assert.equal(h.begins.length, 0);
  assert.equal(h.state.state, 'idle'); assert.equal(h.state.speaking, false); assert.equal(h.frames.size, 0);
  assert.equal(h.text.scrollTop, 0, 'restored history starts at the beginning');
  assert.equal(h.bubble.style.getPropertyValue('--speech-tail'), '8%');
});

test('restored partial text continues in its existing turn without replaying the visible prefix', () => {
  const h = harness(); h.api.select('Steve Jobs');
  const row = answer({ text: 'Respuesta parcialmente visible', status: 'in_progress' });
  h.events.onRestore(row);
  const token = h.state.token;
  assert.ok(token); assert.equal(h.state.text, row.text); assert.equal(h.state.state, 'waiting');
  assert.equal(h.frames.size, 0); assert.equal(h.state.complete, false); assert.equal(h.begins.length, 0);
  h.events.onAnswer(row);
  assert.equal(h.state.token, token); assert.equal(h.frames.size, 0, 'an unchanged snapshot must not replay');
  const continued = { ...row, text: row.text + ' con más información' };
  h.events.onAnswer(continued);
  assert.equal(h.state.token, token); assert.equal(h.state.text, row.text); assert.equal(h.begins.length, 0);
  h.step(); assert.equal(h.state.text, row.text + ' '); h.drain();
  assert.equal(h.state.text, continued.text); assert.equal(h.state.state, 'waiting');
  h.events.onSettled({ ...continued, status: 'done' });
  assert.equal(h.state.complete, true); assert.equal(h.state.state, 'idle'); assert.equal(h.frames.size, 0);
});

test('sending state remains closed-mouthed and generation change invalidates the response owner', () => {
  const h = harness(); h.api.select('Steve Jobs');
  h.events.onPending({ persona: 'Steve Jobs', prompt: 'Pregunta nueva' });
  assert.equal(h.state.speaking, false); assert.equal(h.frames.size, 0);
  h.events.onAnswer(answer()); h.step();
  h.api.setGeneration('coetaneos');
  h.events.onAnswer(answer({ status: 'done' }));
  assert.equal(h.frames.size, 0); assert.equal(h.state.speaking, false); assert.equal(h.bubble.hidden, true);
  assert.equal(h.state.generation, 'coetaneos');
});

test('resizing moves the existing bubble without replacing its text or speech turn', () => {
  const h = harness(); h.api.select('Steve Jobs'); h.events.onAnswer(answer()); h.step();
  const token = h.state.token, prefix = h.text.textContent;
  h.resize(700);
  assert.equal(h.bubble.classList.contains('grokbot-docked'), true); assert.notEqual(h.bubble.parentElement, h.overlay);
  assert.equal(h.bubble.parentElement.hidden, false);
  h.resize(1920);
  assert.equal(h.bubble.parentElement, h.overlay); assert.equal(h.state.token, token); assert.equal(h.text.textContent, prefix);
});


test('preview preserves multiline drafts across counsellors and mirrors CLI edits',()=>{
 const h=harness({withComposer:true});h.api.select('Steve Jobs');
 h.composer.onInput('línea uno\nlínea dos');assert.equal(h.input.value,'línea uno\nlínea dos');
 h.api.select('Walt Disney');h.composer.onInput('Disney');h.api.select('Steve Jobs');
 assert.equal(h.composerState.value,'línea uno\nlínea dos');
 h.input.value='Cambio desde CLI';h.input.listeners.get('input')();
 assert.equal(h.composerState.value,'Cambio desde CLI');
});
test('failed preview send restores only its recipient and preserves text typed meanwhile',async()=>{
 let resolve;const sends=[];
 const h=harness({withComposer:true,send:(persona,text)=>{sends.push({persona,text});return new Promise(r=>resolve=r);}});
 h.api.select('Steve Jobs');h.composer.onInput('Primero');const pending=h.composer.onSend('Primero');
 assert.equal(h.composerState.pending,true);await h.composer.onSend('Duplicado');assert.equal(sends.length,1);
 h.composer.onInput('Segundo');h.api.select('Walt Disney');h.composer.onInput('Otro consejero');
 resolve(false);await pending;assert.equal(h.composerState.value,'Otro consejero');
 h.api.select('Steve Jobs');assert.equal(h.composerState.value,'Primero\nSegundo');assert.equal(h.composerState.pending,false);
});
test('accepted preview send clears submitted draft but keeps next draft',async()=>{
 let resolve;const h=harness({withComposer:true,send:()=>new Promise(r=>resolve=r)});
 h.api.select('Steve Jobs');h.composer.onInput('Enviar');const pending=h.composer.onSend('Enviar');
 h.composer.onInput('Siguiente');resolve(true);await pending;
 assert.equal(h.composerState.value,'Siguiente');assert.equal(h.composerState.pending,false);
});
