import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const copia = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('app.js es idéntico a la copia activa app.flt-100529.js', () => {
  assert.equal(app, copia);
});

test('DeepAgents Team (#agm-panel) solo se muestra en modo avanzado', () => {
  assert.match(html, /body:not\(\.modo-avanzado\) #agm-panel\{display:none!important\}/);
  const fn = app.slice(app.indexOf('window.pfSyncIcons = function()'), app.indexOf('window.closeRails'));
  assert.match(fn, /document\.body\.classList\.toggle\('modo-avanzado', !railCollapsed\('rail-avanzado'\)\)/);
  assert.match(fn, /Carlos, 01-10-2026/);
});
