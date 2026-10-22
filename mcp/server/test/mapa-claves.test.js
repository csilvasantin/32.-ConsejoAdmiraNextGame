import test from 'node:test';
import assert from 'node:assert/strict';
import { mapaClaves, identidadPorClave, sillasConClave } from '../src/yokup.js';
import { claveValida, manejar } from '../src/index.js';

const H = 'h'.repeat(32);
test('MCP_KEY_<SILLA> se suma a MCP_KEYS', async () => {
  const env = { MCP_KEYS: JSON.stringify({ ['j'.repeat(30)]: { persona: 'Jobs' } }), MCP_KEY_HUANG: H, MCP_KEY_MUSK: 'corta' };
  const m = mapaClaves(env);
  assert.equal(m[H].persona, 'Huang');
  assert.equal(m['corta'], undefined);
  assert.equal(identidadPorClave(H, env).persona, 'Huang');
  assert.equal(identidadPorClave('j'.repeat(30), env).persona, 'Jobs');
  assert.deepEqual(sillasConClave(env), ['Huang']);
  assert.equal(await claveValida(new Request('https://x/mcp', { headers: { authorization: `Bearer ${H}` } }), env), true);
});
test('MCP_KEYS manda en un choque', () => {
  const env = { MCP_KEYS: JSON.stringify({ [H]: { persona: 'Lucas' } }), MCP_KEY_HUANG: H };
  assert.equal(mapaClaves(env)[H].persona, 'Lucas');
});
test('Lasseter e Ive: silla propia con MCP_KEY_LASSETER / MCP_KEY_IVE', async () => {
  const { sillaCanonica } = await import('../src/sillas.js');
  const L = 'l'.repeat(40), I = 'i'.repeat(40);
  const env = { MCP_KEY_LASSETER: L, MCP_KEY_IVE: I };
  assert.equal(identidadPorClave(L, env).persona, 'Lasseter');
  assert.equal(identidadPorClave(L, env).agent, 'LasseterGrokBot');
  assert.equal(identidadPorClave(I, env).persona, 'Ive');
  assert.equal(identidadPorClave(I, env).agent, 'IveGrokBot');
  assert.deepEqual(sillasConClave(env), ['Lasseter', 'Ive']);
  assert.equal(sillaCanonica('Jony Ive'), 'Ive');
  assert.equal(sillaCanonica('John Lasseter'), 'Lasseter');
  assert.equal(sillaCanonica('Olivetti'), null);
  assert.equal(sillaCanonica('admira.live'), null);
});
