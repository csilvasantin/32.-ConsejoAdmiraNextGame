import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./council-globo.js', import.meta.url), 'utf8');
const prev = readFileSync(new URL('./council-preview.js', import.meta.url), 'utf8');

test('t1293u: las flechas de la caja pasan de misión, no de proyecto', () => {
  assert.match(src, /function pasoMision\(/);
  assert.match(src, /addEventListener\('click', \(e\) => pasoMision\(persona, -1, e\)\)/);
  assert.match(src, /addEventListener\('click', \(e\) => pasoMision\(persona, 1, e\)\)/);
  assert.match(src, /'Misión anterior'/);
  assert.match(src, /'Misión siguiente'/);
  assert.match(src, /if \(nMis < 1\) \{/);
  const paso = src.match(/function pasoMision\([\s\S]*?\n  \}/);
  assert.doesNotMatch(paso[0], /mostrarListaMac/);
});

test('t1293u: el mismo proyecto con o sin guion cuenta una vez', () => {
  assert.match(src, /seen\['n:' \+ sk\]/);
});

test('t1293u: botón Misiones a la izquierda de Conversación, encendido por defecto y recordado', () => {
  const i = prev.indexOf('data-misiones-toggle');
  const j = prev.indexOf('data-view="conversation"');
  assert.ok(i > 0 && j > i, 'Misiones va antes que Conversación');
  assert.match(prev, /data-misiones-toggle aria-pressed="true"/);
  assert.match(src, /html\.misiones-off #papel-halos \.consejero-marker/);
  assert.match(src, /localStorage\.getItem\(MISIONES_KEY\) === '0'/);
});

test('t1293u: la capa de cajas queda por encima de las siluetas clicables (las flechas reciben el clic)', () => {
  const m = src.match(/#papel-halos\{[^}]*z-index:(\d+)/);
  assert.ok(m && Number(m[1]) > 3, 'z-index de #papel-halos > 3 (body-hotspots)');
  assert.match(src, /#papel-halos\{[^}]*pointer-events:none/);
});
