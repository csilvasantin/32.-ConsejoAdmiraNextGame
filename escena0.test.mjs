import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMesa, mesaDe, canalVacio, marcarPresente, mesasVivas, siguienteSpeaker,
  reservar, decir, promptDe, publicState, TEMA_DEFECTO, PRESENTE_MS, MESAS,
} from './escena0-lib.mjs';

const T0 = 1_000_000;

test('parseMesa acepta leyendas/coetáneos y alias, y rechaza basura', () => {
  assert.equal(parseMesa('Leyendas'), 'leyendas');
  assert.equal(parseMesa('leyenda'), 'leyendas');
  assert.equal(parseMesa('legends'), 'leyendas');
  assert.equal(parseMesa('coetáneos'), 'coetaneos');
  assert.equal(parseMesa('Coetaneos'), 'coetaneos');
  assert.equal(parseMesa('peers'), 'coetaneos');
  assert.equal(parseMesa(''), null);
  assert.equal(parseMesa('jobs'), null);
  assert.equal(mesaDe('Steve Jobs'), 'leyendas');
  assert.equal(mesaDe('Elon Musk'), 'coetaneos');
  assert.equal(mesaDe('Mira Murati'), null);
});

test('una sola mesa viva: rotan entre ellos (nunca cruza a la otra)', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  assert.deepEqual(mesasVivas(d, T0), ['leyendas']);
  let s = siguienteSpeaker(d, T0);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Jobs' });
  d = decir(d, { mesa: 'leyendas', persona: 'Steve Jobs', texto: 'Empezamos.' }, T0 + 1).doc;
  s = siguienteSpeaker(d, T0 + 2);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Wozniak' });
  d = decir(d, { mesa: 'leyendas', persona: 'Steve Wozniak', texto: 'De acuerdo.' }, T0 + 3).doc;
  assert.equal(siguienteSpeaker(d, T0 + 4).persona, 'Walt Disney');
  // Coetáneos no está viva: no sale Elon
  assert.equal(siguienteSpeaker(d, T0 + 4).mesa, 'leyendas');
});

test('las dos mesas vivas: el turno alterna (Leyendas responde a Coetáneos y viceversa)', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  d = marcarPresente(d, 'coetaneos', T0);
  assert.deepEqual(mesasVivas(d, T0), ['leyendas', 'coetaneos']);
  assert.equal(publicState(d, T0).cruce, true);
  let s = siguienteSpeaker(d, T0);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Jobs' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Propongo foco en producto.' }, T0 + 1).doc;
  s = siguienteSpeaker(d, T0 + 2);
  assert.deepEqual(s, { mesa: 'coetaneos', persona: 'Elon Musk' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Y en inferencia barata.' }, T0 + 3).doc;
  s = siguienteSpeaker(d, T0 + 4);
  assert.deepEqual(s, { mesa: 'leyendas', persona: 'Steve Wozniak' });
  d = decir(d, { mesa: s.mesa, persona: s.persona, texto: 'Lo medimos en el Mac.' }, T0 + 5).doc;
  s = siguienteSpeaker(d, T0 + 6);
  assert.deepEqual(s, { mesa: 'coetaneos', persona: 'Jensen Huang' });
});

test('reservar bloquea a otro hablante hasta que dice o caduca', () => {
  let d = marcarPresente(canalVacio(), 'coetaneos', T0);
  const a = reservar(d, 'coetaneos', 'Elon Musk', T0);
  assert.equal(a.ok, true);
  const b = reservar(a.doc, 'coetaneos', 'Jensen Huang', T0 + 10);
  assert.equal(b.ok, false);
  assert.equal(b.error, 'ocupado');
  const mal = decir(a.doc, { mesa: 'coetaneos', persona: 'Jensen Huang', texto: 'colado' }, T0 + 11);
  assert.equal(mal.ok, false);
  const ok = decir(a.doc, { mesa: 'coetaneos', persona: 'Elon Musk', texto: 'Listos.' }, T0 + 12);
  assert.equal(ok.ok, true);
  assert.equal(ok.turno.texto, 'Listos.');
  assert.equal(ok.siguiente.persona, 'Jensen Huang');
});

test('un latido caducado deja de contar como mesa viva', () => {
  let d = marcarPresente(canalVacio(), 'leyendas', T0);
  d = marcarPresente(d, 'coetaneos', T0);
  assert.equal(mesasVivas(d, T0 + PRESENTE_MS + 1).length, 0);
  d = marcarPresente(d, 'leyendas', T0 + PRESENTE_MS + 2);
  assert.deepEqual(mesasVivas(d, T0 + PRESENTE_MS + 2), ['leyendas']);
});

test('prompt nombra el tema, a los de su mesa y a la otra pantalla', () => {
  const d = canalVacio('¿Qué pintamos en la sala?');
  const p0 = promptDe('Steve Jobs', d);
  assert.match(p0, /Leyendas/);
  assert.match(p0, /Steve Wozniak/);
  assert.match(p0, /Elon Musk/);
  assert.match(p0, /¿Qué pintamos en la sala\?/);
  const d2 = decir(d, { mesa: 'leyendas', persona: 'Steve Jobs', texto: 'Abrimos la sala.' }, T0).doc;
  const p1 = promptDe('Elon Musk', d2);
  assert.match(p1, /Steve Jobs: Abrimos la sala\./);
  assert.match(p1, /primera persona/);
  assert.equal(TEMA_DEFECTO.includes('AdmiraNeXT'), true);
  assert.ok(MESAS.leyendas.length === 4 && MESAS.coetaneos.length === 2);
});
