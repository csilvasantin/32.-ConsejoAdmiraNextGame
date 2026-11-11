// 👁 Ojos remotos de los pilares en /control (Carlos, 9-nov-2026 · t1154u).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ini = html.indexOf('window.OJOS_PILARES={');
const fin = html.indexOf('function rcMachineId(id, requested){');
assert.ok(ini > 0 && fin > ini, 'ojosDe se define antes del render de las tarjetas');
const ctx = { window: {} };
vm.runInNewContext(html.slice(ini, fin), ctx);
const { ojosDe } = ctx.window;

test('Mac Mini y Mac Studio tienen botón; el resto no', () => {
  assert.equal(ojosDe({ id: 'macmini', name: 'Mac Mini' }).nodo, 'mm');
  assert.equal(ojosDe({ id: 'admira-macmini', name: 'Mac Mini (Carlos)' }).nodo, 'mm');
  assert.equal(ojosDe({ id: 'macmini.local', name: 'MacMini.local' }).nodo, 'mm');
  assert.equal(ojosDe({ id: 'macstudio', name: 'Mac Studio' }).nodo, 'ms');
  assert.equal(ojosDe({ id: 'macbookpro16', name: 'MacBook Pro 16' }), null);
  assert.equal(ojosDe({ id: 'metahuman', name: 'MetaHuman PC' }), null);
  assert.equal(ojosDe(null), null);
});

test('abre el visor existente con el enlace profundo del nodo, no un visor nuevo', () => {
  assert.equal(ojosDe({ id: 'macmini' }).url, 'https://www.admiranext.com/ojosremotos?nodo=mm&cam=link');
  assert.equal(ojosDe({ id: 'macstudio' }).url, 'https://www.admiranext.com/ojosremotos?nodo=ms&cam=studio');
});

test('la tarjeta pinta el botón y el clic abre una pestaña sin opener', () => {
  assert.match(html, /\$\{ojosDe\(m\)\?`<button data-ojos="\$\{ojosDe\(m\)\.nodo\}"/);
  assert.match(html, /👁 ojos remotos<\/button>/);
  assert.match(html, /closest\('\[data-ojos\]'\)/);
  assert.match(html, /window\.open\('https:\/\/www\.admiranext\.com\/ojosremotos\?nodo='\+o\.nodo\+'&cam='\+o\.cam,'_blank','noopener'\)/);
});
