import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todayMadrid, isHoy, linesFor, seatOf, mesaLines, frontLines, MESA_COPY, IDLE_COPY, ERROR_COPY } from './assets/mac-hoy.js';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('inventario: Apple II es hotspot DOM; el Mac 1984 es prop con asset', () => {
  assert.match(html, /id="apple-ii-hotspot"/);
  assert.match(html, /id="mac-hoy-prop"/);
  assert.match(html, /assets\/mac-1984-mesa\.png/);
  assert.match(html, /id="mac-hoy-crt"/);
  assert.match(html, /objeto de prop/);
  assert.ok(fs.existsSync(new URL('./assets/mac-1984-mesa.png', import.meta.url)));
});

test('isHoy usa display_day y no cuela histórico', () => {
  const day = '2026-09-19';
  assert.equal(isHoy({ display_day: '2026-09-19', status: 'open' }, day), true);
  assert.equal(isHoy({ display_day: '2026-09-18', status: 'open' }, day), false);
  assert.equal(isHoy({ created_at: Date.parse('2026-09-19T10:00:00+02:00') }, day), true);
});

test('copy 8-bit Lucas+Disney: mesa teaser, frontal FLT+[OPEN|DONE], idle y error', () => {
  assert.equal(MESA_COPY, 'HOY · CONSEJO\nPULSO DEL DIA\nCLICK PARA LEER');
  assert.match(IDLE_COPY, /ESPERANDO LATIDO/);
  assert.match(ERROR_COPY, /SIN SENAL/);
  assert.deepEqual(mesaLines(), ['HOY · CONSEJO', 'PULSO DEL DIA', 'CLICK PARA LEER']);
  const day = todayMadrid(Date.parse('2026-09-19T15:00:00+02:00'));
  const blob = frontLines([
    { id: 'FLT-100657', display_day: day, status: 'in_progress', subject: 'Mac CRT 1984 en mesa Consejo' },
    { id: 'FLT-100655', display_day: day, status: 'resolved', subject: 'Macintosh 1984 beige CRT' },
    { id: 'FLT-9', display_day: '2020-01-01', status: 'open', subject: 'histórico' },
  ], day).join('\n');
  assert.match(blob, />>> MISIONES HOY/);
  assert.match(blob, /FLT-100657 \[OPEN\]/);
  assert.match(blob, /FLT-100655 \[DONE\]/);
  assert.match(blob, /DREAM\.PLAN\.DO\.REVIEW/);
  assert.doesNotMatch(blob, /histórico/);
  blob.split('\n').forEach((line) => assert.ok(line.length <= 20, `CRT overflow: ${line}`));
  assert.equal(seatOf({ persona: 'DisneyGrokBot', role: 'CCO' }).includes('Disney'), true);
  assert.equal(linesFor([], day).join('\n'), frontLines([], day).join('\n'));
});

test('P0 on-demand: mesa limpia por defecto, MOSTRAR en col3 fila4, /mac en CLI', () => {
  assert.match(html, /id="btn-mostrar"/);
  assert.match(html, /mac-hoy-chip/);
  assert.match(html, /Mostrar<br>Ocultar/);
  assert.match(html, /mac-hoy-prop\.on/);
  const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(app, /\/mac/);
  const css = html.slice(html.indexOf('.mac-hoy-prop {'), html.indexOf('.mac-hoy-prop.on'));
  assert.match(css, /display:\s*none/);
  assert.match(css, /width:\s*20%/);
});

test('P1: CRT en perspectiva y vista frontal del mismo Mac', () => {
  assert.match(html, /rotateY\(-22deg\)/);
  assert.match(html, /id="mac-hoy-front"/);
  assert.match(html, /id="mac-hoy-crt-front"/);
  assert.match(html, /assets\/mac-1984-front\.png/);
  assert.ok(fs.existsSync(new URL('./assets/mac-1984-front.png', import.meta.url)));
  const js = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(js, /openFront/);
  assert.match(js, /closeFront/);
});
