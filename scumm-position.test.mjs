import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('SCUMM bar DOM order: mesa/stage arriba, Verbos+Accesos debajo (clásico)', () => {
  const stage = html.indexOf('<div class="stage-row">');
  const council = html.indexOf('class="council-image"');
  const scumm = html.indexOf('<div class="scumm-bar">');
  assert.ok(stage > 0 && council > 0 && scumm > 0);
  assert.ok(stage < scumm, 'stage-row must precede scumm-bar');
  assert.ok(council < scumm, 'council-image/mesa must precede scumm-bar');
  // Exactly one scumm-bar
  assert.equal((html.match(/<div class="scumm-bar">/g) || []).length, 1);
});

test('SCUMM CSS: sin order:-1 (ya no fuerza arriba); radio inferior clásico', () => {
  assert.ok(!/order:\s*-1;\s*\/\*\s*SCUMM arriba/.test(html));
  assert.match(html, /border-radius:\s*0 0 12px 12px/);
  assert.match(html, /SCUMM abajo/);
});

test('v7 integration still wired (Accesos en Verbos assets)', () => {
  assert.match(html, /assets\/scumm-layout\.js\?v=20261005-menu-abajo/);
  assert.match(html, /assets\/scumm-layout\.css\?v=20261005-menu-abajo/);
  const js = fs.readFileSync(new URL('./assets/scumm-layout.js', import.meta.url), 'utf8');
  assert.match(js, /layout\.v7/);
  assert.match(js, /grid, pager, inventory/);
  assert.match(js, /DEFAULT_HIDDEN = \['accesos', 'previos'\]/);
});
