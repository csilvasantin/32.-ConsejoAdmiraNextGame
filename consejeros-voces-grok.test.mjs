import test from 'node:test';
import assert from 'node:assert/strict';
import { resolver, limpiarTexto, VOCES_GROK, vocesUsadas, TTS_MAX_CHARS } from './consejeros-voces-grok.mjs';

test('los 16 consejeros y los dos invitados tienen voz Grok distinta', () => {
  const personas = [
    'Steve Jobs', 'Steve Wozniak', 'Tim Cook', 'Warren Buffett', 'Walt Disney',
    'Dieter Rams', 'Howard Schultz', 'George Lucas', 'Elon Musk', 'Jensen Huang',
    'Mira Murati', 'Ruth Porat', 'John Lasseter', 'Jony Ive', 'Carlos Ratti',
    'Ryan Reynolds', 'Carlos Silva', 'Carlo Bonomi',
  ];
  assert.equal(personas.length, Object.keys(VOCES_GROK).length);
  const ids = new Set();
  for (const p of personas) {
    const v = resolver(p);
    assert.ok(v, p);
    assert.ok(v.voice_id, p);
    assert.ok(v.speed >= 0.7 && v.speed <= 1.5, p);
    ids.add(v.voice_id);
  }
  assert.equal(ids.size, personas.length, 'voces repetidas: ' + [...ids].join(','));
});

test('alias habituales resuelven al mismo consejero', () => {
  assert.equal(resolver('Jobs').slug, 'steve-jobs');
  assert.equal(resolver('Woz').voice_id, resolver('Steve Wozniak').voice_id);
  assert.equal(resolver('Disney').slug, 'walt-disney');
  assert.equal(resolver('Elon').slug, 'elon-musk');
  assert.equal(resolver('Jensen').slug, 'jensen-huang');
  assert.equal(resolver('Lasseter').slug, 'john-lasseter');
  assert.equal(resolver('Carlo Bononi').slug, 'carlo-bonomi');
  assert.equal(resolver('Bonomi').voice_id, 'perseus');
  assert.equal(resolver('Carlos Silva').voice_id, 'rex');
  assert.equal(resolver('Nadie'), null);
  assert.equal(resolver(''), null);
});

test('Jobs y Elon no comparten voz; Murati y Porat tampoco', () => {
  assert.notEqual(resolver('Steve Jobs').voice_id, resolver('Elon Musk').voice_id);
  assert.notEqual(resolver('Mira Murati').voice_id, resolver('Ruth Porat').voice_id);
});

test('limpia y recorta el texto', () => {
  assert.equal(limpiarTexto('  **Hola**   mundo  '), 'Hola mundo');
  assert.equal(limpiarTexto(''), '');
  const largo = 'a'.repeat(TTS_MAX_CHARS + 50);
  assert.equal(limpiarTexto(largo).length, TTS_MAX_CHARS);
  assert.ok(vocesUsadas().includes('atlas'));
});
