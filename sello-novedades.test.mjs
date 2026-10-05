import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('./assets/sello-novedades.js', import.meta.url), 'utf8');

test('novedades.json has r11 unclipped-popover note', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./novedades.json', import.meta.url), 'utf8'));
  const key = Object.keys(raw).find(k => k.includes('.r11.'));
  assert.ok(key, 'need an r11 entry');
  assert.ok(raw[key].some(l => /[Pp]opover|recorte|sin recorte/i.test(l)));
});

test('deploy.sh embeds novedades into version.json', () => {
  const sh = fs.readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  assert.match(sh, /novedades\.json/);
  assert.match(sh, /novedades:\$n/);
});

test('sello-novedades.js portals tip to body with position:fixed (no rail clip)', () => {
  assert.match(js, /document\.body\.appendChild\(tipEl\)/);
  assert.match(js, /position:fixed/);
  assert.match(js, /#sello-novedades-tip/);
  assert.match(js, /getBoundingClientRect/);
  assert.match(js, /__admiraSelloPlaceTip/);
  assert.match(js, /setAttribute\('title'/);
  assert.ok(!/el\.appendChild\(tip\)/.test(js), 'tip must not be nested inside the seal');
  assert.match(js, /vw - tw - 8|innerWidth/);
  assert.match(js, /innerHeight|vh - th/);
});

test('placeTip clamps within viewport (jsdom-free harness)', () => {
  // No .rail-ver → boot() no-ops; we only need __admiraSelloPlaceTip.
  const seal = {
    getBoundingClientRect() {
      return { left: 720, top: 500, right: 790, bottom: 528, width: 70, height: 28 };
    }
  };
  const fakeDoc = {
    readyState: 'complete',
    documentElement: { clientWidth: 800, clientHeight: 600 },
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById() { return null; },
    querySelector() { return null; }, // no seal → boot returns
    createElement(tag) {
      return {
        tagName: tag, id: '', className: '', style: {}, textContent: '', innerHTML: '',
        isConnected: true, offsetWidth: 300, offsetHeight: 140,
        classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
        setAttribute() {}, appendChild() {}, addEventListener() {}
      };
    },
    createTextNode(t) { return { nodeType: 3, textContent: t }; },
    addEventListener() {}
  };
  const fakeWin = {
    innerWidth: 800, innerHeight: 600,
    __admiraSelloNovedades: false,
    fetch: () => Promise.reject(new Error('offline')),
    setInterval() {}, setTimeout, clearTimeout,
    addEventListener() {}, document: fakeDoc
  };
  const run = new Function('window', 'document', js + '\n;return window.__admiraSelloPlaceTip;');
  const placeTip = run(fakeWin, fakeDoc);
  assert.equal(typeof placeTip, 'function');
  const tip = fakeDoc.createElement('div');
  tip.offsetWidth = 300;
  tip.offsetHeight = 140;
  const pos = placeTip(seal, tip);
  assert.ok(pos, 'placeTip returns metrics');
  assert.ok(pos.left >= 8, 'left clamp');
  assert.ok(pos.left + 300 <= 800 - 8 + 1, 'right clamp: ' + JSON.stringify(pos));
  assert.ok(pos.top >= 8, 'top clamp');
  assert.ok(pos.top + 140 <= 600 - 8 + 1, 'bottom clamp: ' + JSON.stringify(pos));
});
