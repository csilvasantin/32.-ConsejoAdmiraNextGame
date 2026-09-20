import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acceptImageFile, fileFromClipboard, MESA_PASTE } from './assets/mesa-paste.js';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');

test('composer de mesa tiene zona de preview y paste', () => {
  assert.match(html, /id="action-input"/);
  assert.match(html, /id="mesa-img-preview"/);
  assert.match(html, /mesa-paste\.js/);
  assert.match(app, /bootMesaPaste/);
  assert.match(app, /_mesaPendingImage/);
});

test('acceptImageFile: PNG/JPG ok, PDF y 7MB no', () => {
  assert.equal(acceptImageFile({ type: 'image/png', size: 100 }).ok, true);
  assert.equal(acceptImageFile({ type: 'image/jpeg', size: 100 }).ok, true);
  assert.equal(acceptImageFile({ type: 'image/webp', size: 100 }).ok, true);
  assert.equal(acceptImageFile({ type: 'application/pdf', size: 100 }).ok, false);
  assert.equal(acceptImageFile({ type: 'image/png', size: MESA_PASTE.maxBytes + 1 }).ok, false);
  assert.equal(acceptImageFile(null).ok, false);
});

test('fileFromClipboard coge el primer image/*', () => {
  const f = { type: 'image/png', size: 10 };
  const cd = { items: [{ type: 'text/plain' }, { type: 'image/png', getAsFile: () => f }] };
  assert.equal(fileFromClipboard(cd), f);
  assert.equal(fileFromClipboard({ items: [] }), null);
});
