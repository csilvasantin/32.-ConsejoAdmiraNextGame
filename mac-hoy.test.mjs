import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todayMadrid, isHoy, linesFor, seatOf } from './assets/mac-hoy.js';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('Mac 1984 está en la mesa y MOSTRAR bajo Analizar', () => {
  assert.match(html, /id="mac-hoy-prop"/);
  assert.match(html, /assets\/mac-1984-mesa\.png/);
  assert.match(html, /id="btn-mostrar"/);
  const analizar = html.indexOf('data-verb="analizar"');
  const mostrar = html.indexOf('id="btn-mostrar"');
  assert.ok(analizar > 0 && mostrar > analizar, 'MOSTRAR debe ir después de Analizar');
  assert.ok(fs.existsSync(new URL('./assets/mac-1984-mesa.png', import.meta.url)));
});

test('CRT: HOY fecha + 3 últimas completadas (#FLT + persona)', () => {
  const day = '2026-09-19';
  const blob = linesFor([
    { id: 'FLT-100670', display_day: day, status: 'resolved', persona: 'SmithMacMini', updated_at: 3 },
    { id: 'FLT-100669', display_day: day, status: 'resolved', persona: 'DisneyGrokBot', updated_at: 2 },
    { id: 'FLT-100667', display_day: day, status: 'resolved', persona: 'SmithMacMini', updated_at: 1 },
    { id: 'FLT-100666', display_day: day, status: 'resolved', persona: 'WozniakGrokBot', updated_at: 0 },
    { id: 'FLT-9', display_day: '2020-01-01', status: 'resolved', persona: 'Neo' },
    { id: 'FLT-100655', display_day: day, status: 'in_progress', persona: 'Wozniak' },
  ], day);
  assert.equal(blob[0], 'HOY 19-09');
  assert.equal(blob.length, 4);
  assert.match(blob[1], /#100670 Smith/);
  assert.match(blob[2], /#100669 Disney/);
  assert.match(blob[3], /#100667 Smith/);
  assert.ok(!blob.some((l) => l.includes('100666') || l.includes('100655')));
  assert.equal(isHoy({ display_day: day, status: 'resolved' }, day), true);
  assert.equal(seatOf({ persona: 'SmithMacMini' }).includes('Smith'), true);
  assert.equal(todayMadrid(Date.parse('2026-09-19T15:00:00+02:00')), '2026-09-19');
});

test('on-demand: oculto por defecto, chip MOSTRAR, /mac en CLI', () => {
  assert.match(html, /mac-hoy-prop\.on/);
  const css = html.slice(html.indexOf('.mac-hoy-prop {'), html.indexOf('.mac-hoy-prop.on'));
  assert.match(css, /display:\s*none/);
  const app = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
  assert.match(app, /\/mac/);
  assert.match(app, /MacHoy/);
});
