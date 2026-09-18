import test from 'node:test';
import assert from 'node:assert/strict';
import './council-speech.js';

const { create, createMouthRenderer, anchors, image } = globalThis.CouncilSpeech;
function harness(options = {}) {
    let at = 0, id = 0;
    const frames = new Map(), cancelled = [], updates = [], draws = [];
    let hides = 0, destroyed = false;
    const mouthRenderer = {
        draw: (persona, level) => draws.push({ persona, level }),
        hide: () => hides++, destroy: () => { destroyed = true; }
    };
    const clock = {
        now: () => at,
        requestFrame: fn => { frames.set(++id, fn); return id; },
        cancelFrame: key => { cancelled.push(frames.get(key)); frames.delete(key); }
    };
    const controller = create({ document: null, clock, mouthRenderer, onUpdate: value => updates.push(value), ...options });
    return {
        controller, frames, cancelled, updates, draws,
        get hides() { return hides; }, get destroyed() { return destroyed; },
        step(ms = 40) {
            at += ms; const pending = Array.from(frames.values()); frames.clear(); pending.forEach(fn => fn(at));
        },
        drain(limit = 300) { while (frames.size && limit-- > 0) this.step(); assert.equal(frames.size, 0, 'frame loop failed to settle'); }
    };
}

test('all eight legends have anatomically bounded anchors on the active 1360×768 scene', () => {
    assert.deepEqual(image, { width: 1360, height: 768 });
    assert.equal(Object.keys(anchors).length, 8);
    for (const anchor of Object.values(anchors)) {
        assert.ok(anchor.x > 0 && anchor.x < image.width);
        assert.ok(anchor.y > 250 && anchor.y < 425);
        assert.ok(anchor.width >= 20 && anchor.width <= 34);
        assert.ok(anchor.height <= 14 && anchor.opening <= 2);
    }
});

test('thinking has no mouth or animation timer, reveal and final text share one turn', () => {
    const h = harness(), c = h.controller;
    c.select('Steve Wozniak'); const token = c.begin({ persona: 'Steve Wozniak', turnId: 'chat-7' });
    assert.equal(c.snapshot().state, 'thinking'); assert.equal(h.frames.size, 0); assert.equal(h.draws.length, 0);
    c.finish(token, 'Hola Pedro.'); h.step();
    assert.equal(c.snapshot().text, 'H'); assert.equal(c.snapshot().speaking, true);
    assert.equal(h.draws.at(-1).persona, 'Steve Wozniak');
    h.drain();
    assert.equal(c.snapshot().text, 'Hola Pedro.'); assert.equal(c.snapshot().state, 'idle');
    assert.equal(c.snapshot().complete, true); assert.equal(c.snapshot().speaking, false);
});

test('selection and cancellation invalidate both old messages and already-dispatched frames', () => {
    const h = harness(), c = h.controller;
    c.select('Steve Jobs'); const old = c.begin({ turnId: 'first' }); c.finish(old, 'Primera respuesta larga');
    const dispatched = Array.from(h.frames.values())[0];
    c.select('George Lucas'); const fresh = c.begin({ turnId: 'second' });
    assert.equal(c.update(old, 'Mensaje tardío'), false);
    dispatched(1000);
    assert.equal(c.snapshot().token, fresh); assert.equal(c.snapshot().state, 'thinking');
    assert.equal(c.snapshot().text, ''); assert.equal(h.draws.length, 0);
    assert.equal(c.begin({ persona: 'Steve Jobs' }), null, 'background agent cannot steal selection');
});

test('closing stops the mouth, rejects late updates, and leaves no future frame', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Walt Disney' }); c.update(token, 'Historia en curso'); h.step();
    assert.equal(c.snapshot().speaking, true); c.close();
    assert.equal(c.snapshot().text, ''); assert.equal(c.snapshot().speaking, false); assert.equal(h.frames.size, 0);
    assert.equal(c.finish(token, 'Final antiguo'), false);
});

test('hidden document pauses text and lips without catching up on return', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Tim Cook' }); c.finish(token, 'Operación sin sorpresas'); h.step();
    const before = c.snapshot().text; c.setVisible(false); h.step(60000);
    assert.equal(c.snapshot().text, before); assert.equal(c.snapshot().state, 'paused'); assert.equal(h.frames.size, 0);
    c.setVisible(true); h.step();
    assert.equal(c.snapshot().text.length, before.length + 1); h.drain();
    assert.equal(c.snapshot().text, 'Operación sin sorpresas');
});

test('a cancelled visibility frame cannot overwrite the newly scheduled frame of the same turn', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Steve Jobs' }); c.finish(token, 'Texto pausado');
    const stale = Array.from(h.frames.values())[0];
    c.setVisible(false); c.setVisible(true);
    stale(5000);
    assert.equal(c.snapshot().text, ''); assert.equal(h.frames.size, 1);
    h.step(); assert.equal(c.snapshot().text, 'T'); assert.equal(h.frames.size, 1);
});

test('reduced motion reveals complete text with no mouth animation, including preference changes', () => {
    const h = harness({ reducedMotion: true }), c = h.controller;
    const token = c.begin({ persona: 'Warren Buffett' }); c.finish(token, 'Una decisión tranquila');
    assert.equal(c.snapshot().text, 'Una decisión tranquila'); assert.equal(h.draws.length, 0); assert.equal(h.frames.size, 0);
    c.setReducedMotion(false); const next = c.begin({ persona: 'Warren Buffett' }); c.finish(next, 'Otra respuesta'); h.step();
    c.setReducedMotion(true);
    assert.equal(c.snapshot().text, 'Otra respuesta'); assert.equal(c.snapshot().speaking, false); assert.equal(h.frames.size, 0);
});

test('stream snapshots do not duplicate, wait with closed mouth, and preserve whole graphemes', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Howard Schultz' });
    c.update(token, 'Café ☕️'); h.drain();
    assert.equal(c.snapshot().state, 'waiting'); assert.equal(c.snapshot().speaking, false);
    const count = h.updates.length;
    c.update(token, 'Café ☕️'); assert.equal(h.frames.size, 0);
    c.finish(token, 'Café ☕️ para 👨‍👩‍👧‍👦'); h.drain();
    assert.equal(c.snapshot().text, 'Café ☕️ para 👨‍👩‍👧‍👦');
    assert.ok(h.updates.slice(count).every(s => !s.text.endsWith('\u200d')), 'never display half a grapheme');
});

test('versioned streaming snapshots reject stale revisions within the same message', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Steve Jobs' });
    c.update(token, 'Respuesta nueva', { revision: 2 }); h.drain();
    assert.equal(c.update(token, 'Respuesta vieja', { revision: 1 }), false);
    assert.equal(c.snapshot().text, 'Respuesta nueva'); assert.equal(c.snapshot().revision, 2);
    assert.equal(c.update(token, 'Respuesta final', { revision: 3, final: true }), true); h.drain();
    assert.equal(c.snapshot().text, 'Respuesta final'); assert.equal(c.snapshot().complete, true);
});

test('punctuation closes the mouth and pauses before the next word', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Dieter Rams' }); c.finish(token, 'Sí. Claro');
    h.step(); h.step(); h.step();
    assert.equal(c.snapshot().text, 'Sí.'); assert.equal(c.snapshot().speaking, false);
    h.step(40); assert.equal(c.snapshot().text, 'Sí.'); h.drain();
    assert.equal(c.snapshot().text, 'Sí. Claro');
});

test('history is restored instantly without pretending that an old message is being spoken', () => {
    const h = harness(), c = h.controller;
    c.restore({ persona: 'George Lucas', turnId: 'old-chat', text: 'Mensaje guardado' });
    assert.equal(c.snapshot().state, 'idle'); assert.equal(c.snapshot().text, 'Mensaje guardado');
    assert.equal(c.snapshot().complete, true); assert.equal(h.frames.size, 0); assert.equal(h.draws.length, 0);
});

test('live history keeps its visible prefix and resumes only new text with a fresh valid token', () => {
    const h = harness(), c = h.controller;
    const old = c.begin({ persona: 'George Lucas', turnId: 'interrupted' });
    c.update(old, 'Texto anterior', { revision: 8 });
    const prefix = 'Historia ya visible 👨‍👩‍👧‍👦';
    assert.equal(c.restore({ persona: 'George Lucas', turnId: 'remote-current', text: prefix, live: true }), true);
    const token = c.snapshot().token;
    assert.ok(token); assert.notEqual(token, old); assert.equal(c.snapshot().revision, null);
    assert.equal(c.snapshot().state, 'waiting'); assert.equal(c.snapshot().complete, false);
    assert.equal(c.snapshot().text, prefix); assert.equal(h.frames.size, 0); assert.equal(h.draws.length, 0);
    assert.equal(c.update(old, 'Mensaje antiguo'), false);
    assert.equal(c.update(token, prefix, { revision: 1 }), true);
    assert.equal(h.frames.size, 0, 'an unchanged restored message must not speak');
    assert.equal(c.update(token, prefix + ' continúa', { revision: 2 }), true);
    assert.equal(c.snapshot().text, prefix, 'the visible prefix is retained before the first frame');
    h.step(); assert.equal(c.snapshot().text, prefix + ' ');
    h.drain(); assert.equal(c.snapshot().state, 'waiting');
    const drawCount = h.draws.length;
    assert.equal(c.finish(token, prefix + ' continúa'), true);
    assert.equal(c.snapshot().complete, true); assert.equal(c.snapshot().state, 'idle');
    assert.equal(h.frames.size, 0); assert.equal(h.draws.length, drawCount, 'terminal status alone does not animate old text');
});

test('generation change and upstream error cannot leave a mouth running', () => {
    const h = harness(), c = h.controller;
    const token = c.begin({ persona: 'Steve Jobs' }); c.finish(token, 'Mensaje'); h.step();
    c.setGeneration('coetaneos'); assert.equal(c.snapshot().speaking, false); assert.equal(h.frames.size, 0);
    assert.equal(c.update(token, 'Muy tarde'), false);
    c.setGeneration('leyendas'); const next = c.begin({ persona: 'Steve Jobs' }); c.update(next, 'Respuesta'); h.step();
    assert.equal(c.fail(next), true); assert.equal(c.snapshot().state, 'error'); assert.equal(c.snapshot().speaking, false);
    assert.equal(h.frames.size, 0); assert.equal(c.update(next, 'Error ignorado'), false);
});

test('plain text content cannot inject markup, and destroy removes future work', () => {
    const element = { textContent: '' };
    const h = harness({ textElement: element, reducedMotion: true }), c = h.controller;
    const token = c.begin({ persona: 'Steve Jobs' }); c.finish(token, '<img src=x onerror=alert(1)>');
    assert.equal(element.textContent, '<img src=x onerror=alert(1)>');
    c.destroy(); assert.equal(h.destroyed, true); assert.equal(c.update(token, 'after destroy'), false);
    assert.equal(c.begin({ persona: 'Steve Jobs' }), null);
});

test('canvas patch scales with the image, stays invisible at rest, and refuses other compositions', () => {
    const patches = [], events = new Map();
    const context = new Proxy({}, { get(target, property) {
        if (property === 'drawImage') return (...args) => patches.push(args);
        if (property === 'createRadialGradient') return () => ({ addColorStop() {} });
        return target[property] || (() => {});
    } });
    let removed = false;
    const canvas = { style: {}, dataset: {}, setAttribute() {}, getContext: () => context, remove: () => { removed = true; } };
    const scene = { appendChild() {}, getBoundingClientRect: () => ({ left: 20, top: 10 }) };
    const img = {
        src: 'https://www.admira.live/assets/council-leyendas.jpg?v=1', complete: true,
        naturalWidth: 1360, naturalHeight: 768,
        getBoundingClientRect: () => ({ left: 20, top: 10, width: 680, height: 384 }),
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key)
    };
    const mouth = createMouthRenderer({ scene, image: img, document: { createElement: () => canvas } });
    assert.equal(canvas.style.display, 'none');
    mouth.draw('Steve Jobs', 1);
    assert.equal(canvas.style.display, 'block'); assert.equal(canvas.style.left, '74.75px');
    assert.equal(canvas.style.top, '195.75px'); assert.equal(canvas.style.width, '18.5px');
    assert.equal(canvas.style.height, '10.5px'); assert.ok(patches.length > 0);
    mouth.hide(); assert.equal(canvas.style.display, 'none');
    img.src = 'https://www.admira.live/assets/council-coetaneos.jpg'; mouth.draw('Steve Jobs', 1);
    assert.equal(canvas.style.display, 'none');
    mouth.destroy(); assert.equal(events.size, 0); assert.equal(removed, true);
});
