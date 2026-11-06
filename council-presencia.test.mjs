import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('./assets/council-presencia.js', import.meta.url), 'utf8'), ctx);
const lib = ctx.CouncilPresenciaLib;
function mem() { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); } }; }

test('default: todos visibles y Carlos visible', () => {
  const e = lib.crearEstado(mem());
  assert.equal(e.visibles('leyendas').length, 8);
  assert.equal(e.carlosVisible(), true);
});
test('ninguno / todos', () => {
  const e = lib.crearEstado(mem());
  assert.match(lib.comando('/consejero ninguno', 'leyendas', e).msg, /solo sillas/);
  assert.equal(e.visibles('leyendas').length, 0);
  assert.equal(e.visibles('coetaneos').length, 8);
  lib.comando('/consejero todos', 'leyendas', e);
  assert.equal(e.visibles('leyendas').length, 8);
});
test('toggle por nombre y aliases', () => {
  const e = lib.crearEstado(mem());
  let r = lib.comando('/consejero jobs', 'leyendas', e);
  assert.equal(r.persona, 'Steve Jobs'); assert.equal(e.visible('leyendas', 'Steve Jobs'), false);
  assert.match(r.msg, /Jobs oculto/);
  lib.comando('/consejero Jobs', 'leyendas', e);
  assert.equal(e.visible('leyendas', 'Steve Jobs'), true);
  for (const [a, p] of [['woz', 'Steve Wozniak'], ['wozniak', 'Steve Wozniak'], ['walt', 'Walt Disney'], ['lucas', 'George Lucas'], ['buffett', 'Warren Buffett'], ['rams', 'Dieter Rams'], ['schultz', 'Howard Schultz'], ['cook', 'Tim Cook']])
    assert.equal(lib.resolver(a, 'leyendas').persona, p);
  for (const a of ['musk', 'elon', 'jensen', 'huang', 'shotwell', 'gwynne', 'porat', 'lasseter', 'ive', 'jony', 'ratti', 'reynolds'])
    assert.equal(lib.resolver(a, 'leyendas').gen, 'coetaneos');
});
test('otra generación: cambia de mesa', () => {
  const e = lib.crearEstado(mem());
  const r = lib.comando('/consejero musk', 'leyendas', e);
  assert.equal(r.gen, 'coetaneos'); assert.equal(e.visible('coetaneos', 'Elon Musk'), false);
});
test('rol sin ambigüedad en la mesa actual', () => {
  assert.equal(lib.resolver('cto', 'leyendas').persona, 'Steve Wozniak');
  assert.equal(lib.resolver('CEO', 'coetaneos').persona, 'Elon Musk');
});
test('/consejero a secas invierte', () => {
  const e = lib.crearEstado(mem());
  lib.comando('/consejero woz', 'leyendas', e);
  lib.comando('/consejero', 'leyendas', e);
  assert.equal(e.visibles('leyendas').length, 0);
  lib.comando('/consejero', 'leyendas', e);
  assert.equal(e.visibles('leyendas').length, 8);
});
test('nombre desconocido: error y sin cambios', () => {
  const e = lib.crearEstado(mem());
  const r = lib.comando('/consejero pepito', 'leyendas', e);
  assert.equal(r.ok, false); assert.equal(e.visibles('leyendas').length, 8);
});
test('mitad por lado y persistencia', () => {
  const s = mem(); const e = lib.crearEstado(s);
  e.mitad('leyendas', 'racional');
  assert.equal(e.visibles('leyendas').filter(p => lib.lado('leyendas', 'racional').includes(p)).join(','), 'Steve Jobs,Steve Wozniak');
  lib.comando('/ceo', 'coetaneos', e);
  const e2 = lib.crearEstado(s);
  assert.equal(e2.visible('leyendas', 'Tim Cook'), false);
  assert.equal(e2.carlosVisible(), false);
  assert.equal(lib.comando('/ceo', 'leyendas', e2).gen, 'leyendas');
  assert.equal(e2.carlosVisible(), true);
});
test('/ceo y /consejero no capturan otros verbos', () => {
  const e = lib.crearEstado(mem());
  assert.equal(lib.comando('/leyendas', 'leyendas', e), null);
  assert.equal(lib.comando('/ceoo', 'leyendas', e), null);
});
