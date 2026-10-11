import test from 'node:test';
import assert from 'node:assert/strict';
import { costeDePresencia } from '../src/coste.js';
import { flotaCombinada } from '../src/coordinacion.js';
import { crearFlota } from '../src/flota.js';
const casos = [
  [{ proveedor: 'OpenRouter', runtime: 'Codex', model: 'gpt-6:free' }, 'gratis', 'OpenRouter'],
  [{ proveedor: 'OpenRouter', runtime: 'DeepAgents', model: 'nvidia/nemotron' }, 'pago', 'OpenRouter'],
  [{ proveedor: 'OpenRouter' }, 'desconocido', 'OpenRouter'],
  [{ provider: 'NVIDIA NIM', model: 'nemotron' }, 'gratis', 'NVIDIA NIM'],
  [{ runtime: 'DeepAgents', model: 'openai:nvidia/nemotron:free' }, 'gratis', 'OpenRouter'],
  [{ runtime: 'DeepAgents', model: 'openai:nvidia/nemotron' }, 'pago', 'OpenRouter'],
  [{ runtime: 'DeepAgents', model: 'nvidia:nemotron' }, 'gratis', 'NVIDIA NIM'],
  [{ runtime: 'DeepAgents', model: 'nvidia/nemotron:free' }, 'gratis', 'OpenRouter'],
  [{ runtime: 'OpenCode', model: 'nvidia/nemotron' }, 'gratis', 'NVIDIA NIM'],
  [{ runtime: 'OpenCode', model: 'opencode/minimax-m2.5-free' }, 'gratis', 'OpenCode'],
  [{ runtime: 'OpenCode', model: 'minimax-free' }, 'gratis', 'OpenCode'],
  [{ runtime: 'OpenCode', model: 'anthropic/claude-opus' }, 'pago', 'Anthropic'],
  [{ runtime: 'Codex', model: '6.1 Sol' }, 'pago', 'OpenAI'],
  [{ runtime: 'Claude Code', model: 'Fable 5' }, 'pago', 'Anthropic'],
  [{ runtime: 'Grok CLI', model: 'nemotron:free' }, 'pago', 'xAI'],
  [{ proveedor: 'xAI', model: 'nemotron:free' }, 'pago', 'xAI'],
  [{ proveedor: 'desconocido', runtime: 'Codex', model: 'nvidia/nemotron:free' }, 'desconocido', 'desconocido'],
  [{ runtime: 'DeepAgents', model: 'nemotron' }, 'desconocido', 'desconocido'],
  [{ runtime: 'OpenCode', model: 'llama' }, 'desconocido', 'desconocido'],
  [{ model: 'modelo:free' }, 'desconocido', 'desconocido'],
  [{}, 'desconocido', 'desconocido'],
];
for (const [fila, coste, proveedor] of casos) test(`coste real ${JSON.stringify(fila)}`, () => {
  const r = costeDePresencia(fila);
  assert.equal(r.coste, coste); assert.equal(r.proveedor, proveedor); assert.equal(r.distintivo, coste.toUpperCase());
});

test('MCP: misma persona en MacBooks y GrokBotBox conserva costes y cambia las sillas desde la presencia', async () => {
  const now = Date.now(), updated = Math.floor(now / 1000);
  const presencia = [
    ...['MacBookProNegro14', 'MacBook Pro 16'].map((machine) => ({ persona: 'Trinity', machine, runtime: 'Codex', model: '6.1 Sol', updated })),
    ...['Trinity', 'Merovingio', 'Cypher', 'Niobe'].map((persona) => ({ persona, machine: 'GrokBotBox', runtime: 'DeepAgents dcode', proveedor: 'OpenRouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', updated })),
    { persona: 'Smith', machine: 'MacMini', runtime: 'Grok', updated },
    { persona: 'Link', machine: 'MacMini', runtime: 'Otro', model: 'nemotron', updated },
  ];
  presencia.push({ persona: 'Jobs', machine: 'GrokBot', runtime: 'Grok', updated });
  const f = flotaCombinada({ presencia, ahoraMs: now });
  for (const m of f.machines) for (const a of m.agentes) {
    assert.equal(a.coste, a.persona === 'Link' ? 'desconocido' : m.name === 'GrokBotBox' ? 'gratis' : 'pago');
  }
  const flota = crearFlota({}, null, { now: () => now, fetch: async (url) => new Response(JSON.stringify(String(url).endsWith('/api/presence') ? { presence: presencia } : { items: [] })) });
  const v = await flota.vivos();
  assert.equal(v.consejeros.find((c) => c.persona === 'Jobs').coste, 'pago');
  assert.equal(v.consejeros.find((c) => c.persona === 'Lucas').coste, 'desconocido');
  assert.deepEqual(v.agentes.find((a) => a.persona === 'Trinity').maquinas.map((a) => a.distintivo), ['PAGO', 'PAGO', 'GRATIS']);
  for (const nombre of ['Musk', 'Huang']) {
    const c = v.consejeros.find((x) => x.persona === nombre);
    assert.equal(c.deepagent_runtime, 'DeepAgents dcode'); assert.equal(c.deepagent_coste, 'gratis');
    assert.equal(c.deepagent_proveedor, 'OpenRouter'); assert.equal(c.deepagent_fuente, 'presencia');
  }
});
