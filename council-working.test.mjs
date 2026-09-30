import test from 'node:test';
import assert from 'node:assert/strict';
import './council-todo.js';
import './council-working.js';

const { create, elonIsWorking, url, intervalMs } = globalThis.CouncilWorking;

const fixture = {
    ok: true, now: 1_700_000_000, window: 90,
    items: [
        { persona: 'Merovingio', machine: 'GrokBotBox', runtime: 'Grok CLI', encargo: 101302, working_since: 1000, working_at: 1100, age: 8 },
        { persona: 'Smith', machine: 'MacMini', runtime: 'Codex', encargo: null, working_since: 900, working_at: 950, age: 89 },
        { persona: 'Neo', machine: 'GrokBotBox', runtime: 'Claude', encargo: 4390, age: 3 }
    ]
};

test('Merovingio@GrokBotBox dentro de la ventana enciende a Elon; el resto no', () => {
    assert.equal(globalThis.CouncilTodo.AGENTS.coetaneos['Elon Musk'], 'Merovingio');
    assert.equal(globalThis.CouncilTodo.belongs('Merovingio', 'Merovingio', 'GrokBotBox'), true);
    assert.equal(globalThis.CouncilTodo.belongs('Merovingio', 'Neo', 'GrokBotBox'), false);
    assert.equal(elonIsWorking(fixture), true);
    assert.equal(elonIsWorking({ window: 90, items: [
        { persona: 'Merovingio', machine: 'MacMini', age: 4 }
    ] }), false);
    assert.equal(elonIsWorking({ window: 90, items: [
        { persona: 'Merovingio', machine: 'GrokBotBox', age: 91 }
    ] }), false);
    assert.equal(elonIsWorking({ window: 90, items: [
        { persona: 'Musk', machine: 'GrokBot', age: 90 }
    ] }), true);
    assert.equal(elonIsWorking({ window: 90, items: [
        { persona: 'Elon Musk', machine: 'GrokBot', age: 91 }
    ] }), false);
    assert.equal(elonIsWorking({ window: 90, items: [
        { persona: 'Neo', machine: 'GrokBotBox', age: 1 }
    ] }), false);
    assert.equal(elonIsWorking({ items: [] }), false);
    assert.equal(elonIsWorking(null), false);
});

test('el sondeo pide trabajando cada 20 s solo en coetáneos visibles y apaga al salir o si falla', async () => {
    assert.equal(intervalMs, 20000);
    assert.match(url, /\/api\/presence\/trabajando$/);
    const calls = [];
    let fail = false;
    let payload = fixture;
    const events = new Map();
    let hidden = false;
    const doc = {
        get visibilityState() { return hidden ? 'hidden' : 'visible'; },
        addEventListener: (name, fn) => events.set(name, fn),
        removeEventListener: name => events.delete(name)
    };
    const mouth = [];
    const speech = { setWorking: (persona, on) => mouth.push([persona, on]) };
    const timers = new Map();
    let seq = 0;
    const poller = create({
        document: doc,
        speech,
        generation: 'leyendas',
        fetch: async (target) => {
            calls.push(String(target));
            if (fail) throw new Error('red');
            return { ok: true, json: async () => payload };
        },
        setTimer: (fn, ms) => {
            const id = ++seq;
            timers.set(id, { fn, ms });
            return id;
        },
        clearTimer: id => timers.delete(id)
    });
    assert.equal(calls.length, 0);
    assert.equal(timers.size, 0);
    poller.setGeneration('coetaneos');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, [url]);
    assert.deepEqual(mouth.at(-1), ['Elon Musk', true]);
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].ms, 20000);

    payload = { ok: true, window: 90, items: [{ persona: 'Smith', machine: 'MacMini', age: 1 }] };
    await poller.poll();
    assert.deepEqual(mouth.at(-1), ['Elon Musk', false]);

    payload = fixture;
    hidden = true;
    const before = calls.length;
    events.get('visibilitychange')();
    assert.equal(timers.size, 0);
    await poller.poll();
    assert.equal(calls.length, before, 'la pestaña oculta no sondea');

    hidden = false;
    events.get('visibilitychange')();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(mouth.at(-1), ['Elon Musk', true]);
    assert.equal(timers.size, 1);

    fail = true;
    await poller.poll();
    assert.deepEqual(mouth.at(-1), ['Elon Musk', false]);

    fail = false;
    poller.setGeneration('leyendas');
    assert.equal(timers.size, 0);
    assert.deepEqual(mouth.at(-1), ['Elon Musk', false]);
    const settled = calls.length;
    await poller.poll();
    assert.equal(calls.length, settled);
    poller.destroy();
    assert.equal(events.size, 0);
});
