// Comandos de voz de playlist: mismo parser que /players (12-11-2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
await import('./playlist-voz-cmd.js');
const P = globalThis.AdmiraPlaylistVoz;
const players = readFileSync(join(dir, 'players/index.html'), 'utf8');
const asset = readFileSync(join(dir, 'assets/playlist-voz.js'), 'utf8');

test('reconoce siguiente, anterior, primero y último, con variantes naturales', () => {
  const casos = {
    next: [
      'siguiente', 'Siguiente', 'siguiente canción', 'siguiente cancion',
      'siguiente pista', 'siguiente tema', 'canción siguiente', 'pista siguiente',
      'pasa a la siguiente', 'pon la siguiente canción', 'next', 'next song',
      'next track', '/playlist siguiente', '/siguiente', 'siguiente, por favor'
    ],
    prev: [
      'anterior', 'anterior canción', 'canción anterior', 'pista anterior',
      'vuelve a la anterior', 'previous', 'prev', 'previous song',
      '/playlist anterior', '/anterior'
    ],
    first: [
      'primero', 'primera', 'primera canción', 'primera pista',
      'vuelve al principio', 'volver al principio', 'al principio',
      've al principio', 'first', 'first track', '/playlist primero'
    ],
    last: [
      'último', 'ultima', 'última canción', 'última pista',
      've a la última', 'last', 'last song', '/playlist último', '/ultimo'
    ]
  };
  for (const [cmd, frases] of Object.entries(casos)) {
    for (const frase of frases) {
      const r = P.parseComando(frase);
      assert.equal(r.ok, true, frase);
      assert.equal(r.cmd, cmd, frase + ' → ' + JSON.stringify(r));
    }
  }
});

test('no rompe otros comandos de la barra ni frases que no son de playlist', () => {
  for (const t of ['/help', '/demo 1', '/demo 0', '/hablar Jobs', '/hablar', '/leyendas', 'hola', 'pausa', 'play']) {
    const r = P.parseComando(t);
    assert.equal(r.ok, false, t);
    assert.ok(r.error === 'otro' || r.error === 'comando' || r.error === 'vacio', t + ' → ' + r.error);
  }
});

test('ignora la locución de los consejeros y el TTS en curso', () => {
  const frases = [
    'Hola, Carlos, soy Elon',
    'Hola Carlos soy Steve Jobs',
    'Hola, Carlos, soy Jensen. El siguiente paso es mirar la pista.',
    'Soy Elon y te digo que pases a la siguiente canción'
  ];
  for (const frase of frases) {
    const r = P.parseComando(frase);
    assert.equal(r.ok, false, frase);
    assert.equal(r.error, 'consejero', frase);
  }
  assert.equal(P.parseComando('siguiente', { ttsSpeaking: true }).ok, false);
  assert.equal(P.parseComando('siguiente', { ttsSpeaking: true }).error, 'tts');
  assert.equal(P.parseComando('siguiente', { ttsSpeaking: false }).ok, true);
  assert.equal(P.pareceLocucionConsejero('Hola, Carlos, soy Elon'), true);
  assert.equal(P.pareceLocucionConsejero('siguiente canción'), false);
});

test('textoComando confirma lo entendido, como en demos 0-3', () => {
  const r = P.parseComando('vuelve al principio');
  assert.match(P.textoComando(r), /primera pista/);
  assert.match(P.textoComando(r), /He entendido/);
});

test('/players carga el parser y el micrófono, sin tocar el mando existente', () => {
  assert.match(players, /playlist-voz-cmd\.js\?v=20261112-playlist-voz/);
  assert.match(players, /assets\/playlist-voz\.js\?v=20261112-playlist-voz/);
  assert.match(players, /id="playlist-voz"/);
  assert.match(players, /AdmiraPlayersPlaylist/);
  assert.match(players, /El mando y el doble tick NO se tocan/);
  assert.match(asset, /SpeechRecognition/);
  assert.match(asset, /ttsActiva|AdmiraVoces/);
  assert.doesNotMatch(asset, /player\.html/);
});
