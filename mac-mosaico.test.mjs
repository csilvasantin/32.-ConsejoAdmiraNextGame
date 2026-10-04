// #5109 — hover sin ficha + mosaico del Consejo en el Mac 1984 de la mesa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mac from './assets/mac-hoy.js';

test('hover de consejero ya no abre la ficha (solo contorno)', () => {
  const src = readFileSync(new URL('./council-estado.js', import.meta.url), 'utf8');
  const hover = src.slice(src.indexOf('function wireHover'), src.indexOf('function wireHover') + 900);
  assert.match(hover, /pintarContornos\(doc\)/);
  assert.doesNotMatch(hover, /mostrarFicha\(/);
});

test('mosaico: 6 sillas, refresco 10-15 s, placard no SIN SEÑAL, no toca showRemote', () => {
  assert.deepEqual(mac.MOSAIC_SEATS, ['Jobs', 'Wozniak', 'Lucas', 'Disney', 'Musk', 'Huang']);
  assert.ok(mac.MOSAIC_POLL_MS >= 10000 && mac.MOSAIC_POLL_MS <= 15000);
  const src = readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(src, /function mosaicPlacard/);
  assert.match(src, /credentials:\s*'include'/);
  assert.equal(mac.mosaicHasWork({ ok: true, image: 'x' }), true);
  const show = src.slice(src.indexOf('export function showRemote'), src.indexOf('export function clearRemote'));
  assert.doesNotMatch(show, /Mosaic/);
});

test('#5113 mosaico: evidencia con imagen no es SIN SEÑAL aunque live=false', () => {
  assert.equal(mac.mosaicHasWork({ ok: true, live: false, image: 'https://cdn/x.png' }), true);
  assert.equal(mac.mosaicHasWork({ ok: true, live: false }), false);
});

test('refreshMosaic no hace nada con el Mac apagado', async () => {
  assert.equal(await mac.refreshMosaic(null, () => { throw new Error('no'); }), false);
});
