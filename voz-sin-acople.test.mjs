import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'council-grokbot.js',
  'assets/consejero-mensajes.js',
  'sala-voz/sala-voz.js',
  'escena0/escena0.js',
  'hola/index.html',
];

function src(rel) {
  return readFileSync(new URL('./' + rel, import.meta.url), 'utf8');
}

test('ningún desbloqueo de voz locuta un espacio o silencio a volumen 0', () => {
  const vacia = /new\s+(?:root\.)?SpeechSynthesisUtterance\(\s*['"`]\s*['"`]\s*\)/;
  for (const f of files) {
    const t = src(f);
    assert.doesNotMatch(t, vacia, f + ' no debe crear una locución vacía');
    assert.doesNotMatch(t, /volume\s*=\s*0\s*;\s*(?:root\.)?speechSynthesis\.speak/, f);
    assert.doesNotMatch(t, /\.volume\s*=\s*0\s*;\s*(?:root\.)?speechSynthesis\.speak/, f);
  }
});

test('el desbloqueo no cancela en caliente una locución muda (clic de Chrome)', () => {
  const escena = src('escena0/escena0.js');
  assert.doesNotMatch(escena, /speechSynthesis\.speak\(u\);\s*speechSynthesis\.cancel\(\)/);
  assert.match(escena, /function desbloquearVoz/);
  assert.match(src('council-grokbot.js'), /despertarMotorVoz/);
  assert.match(src('assets/consejero-mensajes.js'), /despertarMotorVoz/);
  assert.match(src('sala-voz/sala-voz.js'), /desbloquearAudio/);
});

test('AdmiraVoces no cancela si no hay locución en curso al empezar la siguiente', () => {
  const t = src('consejeros-voces.js');
  assert.match(t, /function hayLocucion/);
  assert.match(t, /if \(current \|\| hayLocucion\(\)\) stop\(\)/);
  assert.match(t, /synth\.cancel\(\)/);
});
