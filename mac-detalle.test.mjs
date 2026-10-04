import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pintarPantallaCrt, MOSAIC_SEATS } from './assets/mac-hoy.js';

function nodo(tag) {
  const node = {
    tag,
    className: '',
    textContent: '',
    children: [],
    attrs: {},
    classSet: new Set(['sin-senal']),
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] || null; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(kid) { this.children.push(kid); return kid; },
    addEventListener() {},
    querySelector(sel) {
      if (sel === 'img') return this.children.find((c) => c.tag === 'img') || null;
      if (sel === '.mac-hoy-tile-ns') return this.children.find((c) => String(c.className).includes('tile-ns')) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel !== '.mac-hoy-tile') return [];
      return this.children.filter((c) => String(c.className).includes('mac-hoy-tile'));
    },
  };
  node.classList = {
    add: (c) => node.classSet.add(c),
    remove: (c) => node.classSet.delete(c),
    contains: (c) => node.classSet.has(c),
  };
  return node;
}

test('la vista de cerca reutiliza mosaicTile y no toca showRemote', () => {
  const src = readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(src, /export function pintarPantallaCrt/);
  assert.match(src, /mosaicTile\(t, seat, request\)/);
  const show = src.slice(src.indexOf('export function showRemote'), src.indexOf('export function clearRemote'));
  assert.doesNotMatch(show, /Mosaic/);
  assert.match(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), /id="mac-hoy-pantalla"/);
});

test('sin consejero: seis celdas; con Jobs: una; sin JPEG no hay foto', async () => {
  const doc = { createElement: nodo };
  const host = nodo('div');
  host.ownerDocument = doc;
  host.classSet = new Set();
  const pedido = [];
  const fetchImpl = async (url) => { pedido.push(url); return { ok: false, json: async () => null }; };
  assert.equal(pintarPantallaCrt(host, { persona: null, fetchImpl }), true);
  assert.equal(host.getAttribute('data-tipo'), 'mosaico');
  assert.deepEqual(host.querySelectorAll('.mac-hoy-tile').map((t) => t.getAttribute('data-seat')), MOSAIC_SEATS);
  const uno = nodo('div');
  uno.ownerDocument = doc;
  uno.classSet = new Set();
  pintarPantallaCrt(uno, { persona: 'Steve Jobs', fetchImpl });
  assert.equal(uno.getAttribute('data-tipo'), 'una');
  assert.deepEqual(uno.querySelectorAll('.mac-hoy-tile').map((t) => t.getAttribute('data-seat')), ['Jobs']);
  await new Promise((r) => setTimeout(r, 30));
  const imgs = uno.querySelectorAll('.mac-hoy-tile').map((t) => t.querySelector('img'));
  assert.ok(imgs.every((img) => !img.attrs.src));
  assert.ok(!pedido.some((u) => String(u).startsWith('data:')));
});
