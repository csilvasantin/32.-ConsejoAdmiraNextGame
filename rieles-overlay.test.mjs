import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// #5115 Abrir «☰ Opciones» o «Avanzado» no debe redimensionar el escenario del Consejo.
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('<style id="side-rails-css">'), html.indexOf('</style>', html.indexOf('<style id="side-rails-css">')));

test('en escritorio los rieles flotan sobre .stage-row (fuera del flujo flex)', () => {
  const m = css.match(/@media \(min-width:761px\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'falta el bloque de escritorio de los rieles');
  const b = m[1];
  assert.match(b, /\.stage-row\{position:relative\}/);
  assert.match(b, /\.side-rail\{position:absolute;top:0;bottom:0;z-index:1000/);
  assert.match(b, /\.side-rail\.left\{left:0\}/);
  assert.match(b, /\.side-rail\.right\{right:0\}/);
});

test('el bloque de escritorio va después de la regla base en flujo (la pisa) y no toca el móvil', () => {
  const base = css.indexOf('.side-rail{position:relative;');
  const desk = css.indexOf('@media (min-width:761px)');
  const mob = css.indexOf('@media (max-width:760px)');
  assert.ok(base >= 0 && desk > base, 'el overlay debe ir tras la regla base');
  assert.ok(mob > desk, 'el cajón móvil (fixed) sigue definido aparte');
  assert.match(css.slice(mob), /\.side-rail\{position:fixed;top:0;bottom:0/);
});

test('los rieles siguen dentro de .stage-row (el absolute se ancla al escenario)', () => {
  const row = html.indexOf('<div class="stage-row">');
  const op = html.indexOf('id="rail-opcion"');
  const av = html.indexOf('id="rail-avanzado"');
  const bar = html.indexOf('<div class="scumm-bar">');
  assert.ok(row > 0 && row < op && op < av && av < bar);
});
