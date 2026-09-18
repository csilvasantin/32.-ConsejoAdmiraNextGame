import test from 'node:test';
import assert from 'node:assert/strict';
import './council-table.js';

const { computeLayout, mediaUrl } = globalThis.CouncilTable;
// Measured occupied bounds in the actual 1360 × 768 Leyendas artwork. They
// intentionally include spare pixels so the frame cannot graze the objects.
const occupied = {
  jobs: [40, 306, 218, 300], wozniak: [210, 251, 203, 238],
  cook: [365, 198, 183, 215], buffett: [511, 192, 188, 203],
  disney: [701, 181, 174, 216], dieter: [887, 205, 147, 215],
  schultz: [1019, 242, 178, 263], lucas: [1065, 317, 257, 315],
  leftPapers: [243, 523, 172, 81], wozniakPapers: [365, 446, 109, 44],
  coffee: [420, 407, 55, 47], cookPapers: [462, 384, 89, 42],
  buffettPapers: [580, 362, 96, 34], disneyPapers: [728, 359, 94, 40],
  radio: [836, 326, 89, 95], rightPapers: [905, 443, 115, 48],
  greenCup: [981, 397, 59, 80], lightsaber: [906, 538, 281, 73],
  lucasPapers: [978, 518, 143, 65], frontTableEdge: [180, 694, 1031, 74]
};

function overlaps(a, b) {
  return a.x < b[0] + b[2] && a.x + a.width > b[0] && a.y < b[1] + b[3] && a.y + a.height > b[1];
}

test('screen clears every person and tabletop object in the shipped Leyendas artwork', () => {
  const layout = computeLayout({ width: 1360, height: 768 });
  assert.equal(layout.placement, 'table');
  for (const [name, bounds] of Object.entries(occupied)) {
    assert.equal(overlaps(layout.rect, bounds), false, 'screen overlaps ' + name);
  }
  assert.ok(layout.rect.x >= 0 && layout.rect.y >= 0);
  assert.ok(layout.rect.x + layout.rect.width <= 1360);
  assert.ok(layout.rect.y + layout.rect.height <= 768);
});

test('the complete frame tracks the image at desktop widths, independent of viewport height', () => {
  const original = computeLayout({ width: 1360, height: 768 }).rect;
  for (const width of [1200, 1360, 1920, 2552, 3840]) {
    const factor = width / 1360;
    const { placement, rect } = computeLayout({ width, height: 768 * factor });
    assert.equal(placement, 'table');
    for (const property of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(rect[property] - original[property] * factor) < .00001);
    for (const bounds of Object.values(occupied)) assert.equal(overlaps(rect, bounds.map(value => value * factor)), false);
  }
});

test('small images and images narrowed by side rails dock below, preserving the artwork', () => {
  for (const width of [320, 375, 600, 760, 900, 1024]) {
    const result = computeLayout({ width, height: width * 768 / 1360 });
    assert.equal(result.placement, 'dock');
    assert.equal(result.reason, 'screen-too-small');
    assert.equal(result.rect, null);
  }
});

test('Coetáneos has no clear central surface and never covers its logo or name plates', () => {
  assert.equal(computeLayout({ width: 2560, height: 1440, generation: 'coetaneos' }).placement, 'dock');
  assert.equal(computeLayout({ width: 1360, height: 768, generation: 'unknown-artwork' }).placement, 'dock');
});

test('unmeasured or invalid dimensions never invent screen coordinates', () => {
  for (const dimensions of [{}, { width: 0, height: 0 }, { width: Infinity, height: 768 }, { width: 1360, height: -1 }]) {
    assert.equal(computeLayout(dimensions).placement, 'pending');
  }
});

test('remote media accepts only approved HTTP origins and excludes credential URLs', () => {
  const base = 'https://www.admira.live/';
  const origins = ['https://www.admira.live', 'https://remote.example'];
  assert.equal(mediaUrl('/screen/steve-jobs', base, origins), 'https://www.admira.live/screen/steve-jobs');
  assert.equal(mediaUrl('https://remote.example/view', base, origins), 'https://remote.example/view');
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'https://elsewhere.example/view', 'https://user:password@remote.example/view']) {
    assert.equal(mediaUrl(value, base, origins), null);
  }
});
