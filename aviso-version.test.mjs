import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./assets/aviso-version.js', import.meta.url), 'utf8');
test('la home carga el aviso de versión (norma 25)', () => {
  assert.match(html, /<script defer src="assets\/aviso-version\.js\?v=[^"]+"><\/script>/);
});
test('el aviso sondea /version.json sin caché y empieza por el sello', () => {
  assert.match(js, /\/version\.json\?home=/);
  assert.match(js, /cache: "no-store"/);
  assert.match(js, /"⟳ " \+ sello \+ " · recargar"/);
});
test('no hay service worker que pueda congelar la home', () => {
  assert.doesNotMatch(html, /serviceWorker\.register/);
});
