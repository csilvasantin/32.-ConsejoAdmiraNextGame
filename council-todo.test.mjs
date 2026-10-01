import test from 'node:test';
import assert from 'node:assert/strict';
import './council-todo.js';

const T = globalThis.CouncilTodo;
const NOW = 1790513800;
const leyendas = ['Steve Jobs', 'Steve Wozniak', 'Tim Cook', 'Warren Buffett', 'Walt Disney', 'Dieter Rams', 'Howard Schultz', 'George Lucas'];
const coetaneos = ['Elon Musk', 'Jensen Huang', 'Gwynne Shotwell', 'Ruth Porat', 'John Lasseter', 'Jony Ive', 'Carlos Ratti', 'Ryan Reynolds'];
const sources = {
  activeWork: { ok: true, participants: [
    { family_key: 'jobs@grokbot', state: 'assigned_stale', reference: 'FLT-101116', title: 'Sincro matinal 27-sep · ArquitectoCursorCloud (Cursor Cloud) pide priorización del día.', ended_at: null },
    { family_key: 'smith@macmini', state: 'last_work', reference: 'FLT-101114', title: 'Prioridad 27-sep', ended_at: 1 }
  ] },
  trabajando: { ok: true, items: [{ persona: 'Arquitecto', machine: 'GrokBotBox', encargo: 4490, working_at: NOW - 20 }] },
  presence: { ok: true, presence: [
    { persona: 'Trinity', machine: 'MacBookProNegro14', mode: 'pasivo', focus: 'Evaluar tres mejoras', updated: NOW - 5, declared_updated: NOW - 10 },
    { persona: 'Lucas', machine: 'GrokBot', mode: 'pasivo', focus: 'Parte 13:00', updated: NOW - 7200 },
    { persona: 'Smith', machine: 'MacMini', mode: 'trabajando', task: 'SmithMacMini · Pixeria', updated: NOW - 30 },
    { persona: 'Merovingio', machine: 'GrokBotBox', mode: 'trabajando', task: 'Merovingio · Grok CLI', updated: NOW - 15 },
    { persona: 'Cypher', machine: 'GrokBotBox', mode: 'trabajando', task: 'Cypher · DeepAgents', updated: NOW - 12 },
    { persona: 'Arquitecto', machine: 'CursorCloud', mode: 'trabajando', focus: 'Plan día sellado', updated: NOW - 60 }
  ] }
};

test('solo «todo» y «all», sin mayúsculas ni espacios', () => {
  for (const t of ['todo', 'TODO', '  All ', 'Todo', 'ALL']) assert.equal(T.isTodoCommand(t), true, t);
  for (const t of ['todos', 'todo bien?', 'allá', '', '¿qué haces?', '/todo']) assert.equal(T.isTodoCommand(t), false, t);
});

test('trunca a 60 caracteres con elipsis', () => {
  const r = T.truncate('x'.repeat(100));
  assert.equal([...r].length, 60); assert.ok(r.endsWith('…'));
  assert.equal(T.truncate('corto'), 'corto');
});

test('cada consejero de Leyendas y Coetáneos tiene texto', () => {
  for (const [gen, list] of [['leyendas', leyendas], ['coetaneos', coetaneos]]) {
    const st = T.statusesFor(gen, list, sources, NOW);
    assert.equal(st.length, 8);
    for (const s of st) { assert.ok(s.text && s.text.trim(), gen + ' ' + s.persona); assert.ok([...s.text].length <= 60); }
  }
});

test('mapa real: misión, presencia, encargo, nada y sin agente', () => {
  const ley = Object.fromEntries(T.statusesFor('leyendas', leyendas, sources, NOW).map(s => [s.persona, s]));
  assert.match(ley['Steve Jobs'].text, /^FLT-101116 · Sincro matinal/);
  assert.equal(ley['George Lucas'].text, 'ahora mismo nada'); // foco de hace 2 h: no es «ahora»
  assert.equal(ley['Tim Cook'].text, 'sin datos ahora mismo');
  assert.equal(ley['Tim Cook'].kind, 'sin-agente');
  const co = Object.fromEntries(T.statusesFor('coetaneos', coetaneos, sources, NOW).map(s => [s.persona, s]));
  assert.equal(co['Elon Musk'].text, 'Merovingio · Grok CLI');            // deepagent de Musk, no Smith
  assert.equal(co['Jensen Huang'].text, 'Cypher · DeepAgents');          // deepagent de Huang, no ArquitectoCursorCloud
  assert.equal(co['Ryan Reynolds'].text, 'sin datos ahora mismo');       // sin agente: Cypher ya no es del CSO
  assert.equal(co['Ryan Reynolds'].kind, 'sin-agente');
  assert.equal(co['Jony Ive'].text, 'Encargo #4490 en curso');           // Arquitecto en otras cajas, no CursorCloud
  assert.equal(co['Gwynne Shotwell'].text, 'Evaluar tres mejoras');
  assert.equal(co['John Lasseter'].text, 'ahora mismo nada');
});

test('fuente caída → «sin datos ahora mismo», nunca vacío', () => {
  const st = T.statusesFor('leyendas', leyendas, { activeWork: null, trabajando: null, presence: null }, NOW);
  assert.ok(st.every(s => s.text === 'sin datos ahora mismo'));
  const part = T.statusesFor('leyendas', leyendas, { ...sources, presence: null }, NOW);
  assert.match(part[0].text, /^FLT-101116/);
  assert.equal(part[7].text, 'sin datos ahora mismo');
});

test('fetchSources tolera errores de red', async () => {
  const s = await T.fetchSources(() => Promise.reject(new Error('offline')));
  assert.deepEqual(s, { activeWork: null, trabajando: null, presence: null });
});
