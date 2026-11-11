import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('./' + p, import.meta.url), 'utf8');

test('Coetáneos: el Mac 1984 no se pinta en la mesa', () => {
  const html = rd('index.html');
  assert.match(html, /\[data-generation="coetaneos"\] #mac-hoy-prop[^{]*\{ display: none !important; \}/);
  const app = rd("app.flt-100529.js");
  assert.match(app, /gen === "coetaneos" && window\.MacHoy[\s\S]{0,80}setVisible\(false\)/);
  const mac = rd('assets/mac-hoy.js');
  assert.match(mac, /prop\.classList\.toggle\('on', visible && enMesa\)/);
});

test('Coetáneos: Murati con figura nueva, máscara y recorte coherentes', () => {
  const meta = JSON.parse(rd('assets/consejo-vacio/meta.json'));
  const c = meta.coetaneos.cutouts['Mira Murati'];
  assert.deepEqual(c, { src: 'coetaneos-mira-murati.webp', x: 347, y: 258, w: 180, h: 227 });
  assert.ok(existsSync(new URL('./assets/consejo-vacio/coetaneos-mira-murati.webp', import.meta.url)));
  const sil = JSON.parse(rd('assets/council-silhouettes.js').match(/= (\{.*\});/s)[1]);
  const pts = sil.coetaneos.paths['Mira Murati'].replace(/Z/g, '').split('L').map((s) => s.replace('M', '').trim().split(/\s+/).map(Number));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.ok(Math.min(...xs) >= c.x && Math.max(...xs) <= c.x + c.w, 'máscara dentro del recorte (x)');
  assert.ok(Math.min(...ys) >= c.y && Math.max(...ys) <= c.y + c.h, 'máscara dentro del recorte (y)');
  // Los recortes manuales de KV anteriores a esta foto no pisan la máscara nueva.
  assert.match(rd('assets/council-recorte.js'), /coetaneos: '2026-11-11T21:40:00Z'/);
});
