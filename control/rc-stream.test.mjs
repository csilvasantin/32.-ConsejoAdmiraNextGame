import test from 'node:test';
import assert from 'node:assert/strict';
await import('./rc-stream.js');
const { settings, observe, reset } = globalThis.AdmiraRcStream;

test('reduce ante fotogramas grandes o lentos y recupera calidad con histéresis', () => {
  const s = { scale: 0.6, q: 0.6 };
  observe(s, 1600, 1800 * 1024);
  assert.deepEqual(settings(s), { scale: 0.6, q: 0.6, maxWidth: 1600 });
  observe(s, 1600, 1800 * 1024);
  assert.ok(settings(s).scale < 0.6);
  assert.equal(settings(s).maxWidth, 1360);
  for (let i = 0; i < 30; i++) observe(s, 1600, 400 * 1024);
  assert.equal(settings(s).scale, 0.3);
  assert.equal(settings(s).q, 0.35);
  for (let i = 0; i < 100; i++) observe(s, 200, 100 * 1024);
  assert.deepEqual(settings(s), { scale: 0.6, q: 0.6, maxWidth: 1600 });
});
test('respeta los ajustes manuales y un pico aislado no cambia la calidad', () => {
  const s = { scale: 0.3, q: 0.2 };
  observe(s, 1700, 500 * 1024);
  observe(s, 100, 100 * 1024);
  assert.deepEqual(settings(s), { scale: 0.3, q: 0.2, maxWidth: 1600 });
  for (let i = 0; i < 20; i++) observe(s, 1800, 500 * 1024);
  assert.deepEqual(settings(s), { scale: 0.3, q: 0.2, maxWidth: 1600 });
  s.scale = 1; s.q = 0.8; reset(s);
  assert.deepEqual(settings(s), { scale: 1, q: 0.8, maxWidth: 1600 });
});
