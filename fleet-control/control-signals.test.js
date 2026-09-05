'use strict';
// FLT-1827 (5-sep-2026): la sonda de control no puede colar marcadores raros en la tarjeta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const trozo = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const mod = new Function(trozo('function parseControlSignals(stdout, online) {', 'function statusProbe(m) {') + '\nreturn { parseControlSignals, stripControlMarkers };')();

test('un marcador con basura («=~», el glob de echo ? en el MBP14) se lee como desconocido y no como bloqueado', () => {
  const r = mod.parseControlSignals('ONLINE\n__FLEET_CAPTURE__=1\n__FLEET_INPUT__=1\n__FLEET_LOCKED__=~\n', true);
  assert.equal(r.locked, null);
  assert.equal(r.ready, false);
  assert.equal(r.why, 'sonda incompleta');
});

test('los marcadores se quitan del texto de la tarjeta sea cual sea su valor', () => {
  const limpio = mod.stripControlMarkers('MacBookProNegro14\n__FLEET_SIGNAGE__=0\n__FLEET_CAPTURE__=1\n__FLEET_INPUT__=1\n__FLEET_LOCKED__=~\n');
  assert.equal(limpio, 'MacBookProNegro14');
});

test('con la sonda entera y la pantalla libre, listo para ver + tocar', () => {
  const r = mod.parseControlSignals('__FLEET_CAPTURE__=1\n__FLEET_INPUT__=1\n__FLEET_LOCKED__=0\n', true);
  assert.equal(r.ready, true); assert.equal(r.why, 'ver + tocar');
  assert.equal(mod.parseControlSignals('__FLEET_CAPTURE__=1\n__FLEET_INPUT__=1\n__FLEET_LOCKED__=1\n', true).why, 'pantalla bloqueada');
});

test('la sonda macOS cita la interrogación: nada de globs', () => {
  assert.doesNotMatch(src, /\|\| echo \?\)/, 'echo ? sin comillas es un glob');
  assert.match(src, /echo "\?"/);
});
