import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todayMadrid, isHoy, linesFor, seatOf, envolver, ultimaMision, detalleLineas, MODOS } from './assets/mac-hoy.js';

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

// --- Mandos del Mac: teclado -> logo, ratón -> última misión con detalle -----
const HOY = '2026-09-19';
const MISIONES = [
  { id: 'FLT-100673', status: 'resolved', display_day: HOY, updated_at: 1758280000, persona: 'Jobs', subject: 'Cablear el generador de presentaciones' },
  { id: 'FLT-100678', status: 'resolved', display_day: HOY, updated_at: 1758290000, persona: 'Smith', subject: 'Macintosh 1984 en la mesa del Consejo' },
  { id: 'FLT-100690', status: 'in_progress', display_day: HOY, updated_at: 1758299999, persona: 'Neo', subject: 'Sin terminar' },
];

test('ratón: la ÚLTIMA misión cerrada hoy, con detalle', () => {
  assert.equal(ultimaMision(MISIONES, HOY).id, 'FLT-100678');   // la más reciente RESUELTA
  const l = detalleLineas(MISIONES, HOY);
  assert.equal(l[0], 'ULTIMA MISION');
  assert.match(l[1], /^#100678/);
  assert.equal(l[2], 'Smith');
  assert.ok(l.slice(4).join(' ').includes('Macintosh'), 'debe contar DE QUÉ iba');
  assert.ok(l.every((x) => x.length <= 16), 'ninguna línea desborda el tubo');
});

test('ratón sin nada cerrado: lo dice, no inventa', () => {
  const l = detalleLineas([{ id: 'FLT-1', status: 'in_progress', display_day: HOY }], HOY);
  assert.deepEqual(l, ['ULTIMA MISION', '', 'sin FLT done']);
});

test('envolver parte por palabras y respeta el máximo', () => {
  assert.deepEqual(envolver('uno dos tres cuatro', 8, 3), ['uno dos', 'tres', 'cuatro']);
  assert.equal(envolver('a b c d e f g h i j', 3, 2).length, 2);
  assert.deepEqual(envolver('', 10, 3), []);
  assert.equal(envolver('supercalifragilistico', 8, 2)[0].length, 8, 'una palabra larga se recorta');
});

test('teclado y ratón son mandos, y existe el logo retro en pantalla', () => {
  assert.deepEqual(MODOS, ['hoy', 'detalle', 'logo']);
  assert.match(html, /<button[^>]+class="mac-hoy-keys"/);
  assert.match(html, /<button[^>]+class="mac-hoy-mouse"/);
  assert.ok(!/class="mac-hoy-(keys|mouse)"[^>]*href=/.test(html), 'ya no son enlaces a yokup');
  assert.match(html, /class="mac-hoy-logo"/);
  assert.match(html, /admira-logo-retro\.svg/);
  assert.ok(fs.existsSync(new URL('./admira-logo-retro.svg', import.meta.url)));
});
