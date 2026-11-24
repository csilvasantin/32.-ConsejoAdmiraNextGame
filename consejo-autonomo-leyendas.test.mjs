import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GUION_AUTONOMO_LEYENDAS_PAN,
  LEYENDAS,
  MAPA_PORTAVENTURA,
  TIMEOUT_BACKEND_MS,
  URL_HOME,
  URL_ESCENA0,
  formatHoraInicio,
  etiquetaMision,
  parseAutonomoUrl,
  personasDelGuion,
  resolverTema,
  resolverTurno,
  siguienteTurno,
  textoTurno,
} from './consejo-autonomo-leyendas.mjs';

test('parseAutonomoUrl reconoce ?autonomo=leyendas&tema=pan', () => {
  const a = parseAutonomoUrl(new URLSearchParams('autonomo=leyendas&tema=pan'));
  assert.equal(a.activo, true);
  assert.equal(a.mesa, 'leyendas');
  assert.equal(a.soportado, true);
  assert.equal(a.temaId, 'pan');
  assert.match(a.titulo, /El parque que se cuenta solo/);
  assert.equal(a.guion, GUION_AUTONOMO_LEYENDAS_PAN);
  assert.equal(parseAutonomoUrl('?autonomo=legends').mesa, 'leyendas');
  assert.equal(parseAutonomoUrl({ autonomo: '1', mesa: 'leyendas', tema: 'portaventura' }).temaId, 'pan');
  assert.equal(parseAutonomoUrl({ autonomo: 'off' }), null);
  assert.equal(parseAutonomoUrl({}), null);
  assert.equal(parseAutonomoUrl({ autonomo: 'coetaneos' }).soportado, false);
});

test('el guion solo tiene a las cuatro leyendas y cierra con un resumen', () => {
  const personas = personasDelGuion(GUION_AUTONOMO_LEYENDAS_PAN);
  assert.deepEqual(new Set(personas), new Set(LEYENDAS));
  for (const p of personas) assert.ok(LEYENDAS.includes(p), p);
  assert.equal(personas.length, 4);
  const n = GUION_AUTONOMO_LEYENDAS_PAN.turnos.length;
  assert.ok(n >= 8);
  const last = siguienteTurno(GUION_AUTONOMO_LEYENDAS_PAN, n - 1);
  assert.equal(last.esResumen, true);
  assert.equal(last.ultimo, true);
  assert.match(last.texto, /PortAventuraNeXT/);
  assert.equal(siguienteTurno(GUION_AUTONOMO_LEYENDAS_PAN, n).fin, true);
  assert.equal(siguienteTurno(GUION_AUTONOMO_LEYENDAS_PAN, 0).persona, 'George Lucas');
  assert.equal(textoTurno(last, 'en').length > 10, true);
});

test('resolverTurno usa el backend si responde y cae al guion si falla, vacía o se pasa de tiempo', async () => {
  const t = siguienteTurno(GUION_AUTONOMO_LEYENDAS_PAN, 0);
  const ok = await resolverTurno(t, { ask: async () => '  Línea viva de Lucas.  ' });
  assert.equal(ok.fuente, 'backend');
  assert.equal(ok.texto, 'Línea viva de Lucas.');
  const vacio = await resolverTurno(t, { ask: async () => '   ' });
  assert.equal(vacio.fuente, 'guion');
  assert.equal(vacio.texto, t.texto);
  const fallo = await resolverTurno(t, { ask: async () => { throw new Error('sin red'); } });
  assert.equal(fallo.fuente, 'guion');
  const lento = await resolverTurno(t, { timeoutMs: 20, ask: () => new Promise((r) => setTimeout(() => r('tarde'), 200)) });
  assert.equal(lento.fuente, 'guion');
  const solo = await resolverTurno(t, {});
  assert.equal(solo.fuente, 'guion');
});

test('formatHoraInicio rotula la misión en Europe/Madrid', () => {
  const s = formatHoraInicio(new Date('2026-11-24T11:41:00.000Z'));
  assert.match(s, /24/);
  assert.match(s, /nov/i);
  assert.match(s, /2026/);
  assert.match(s, /12:41/);
  assert.match(s, /Europe\/Madrid/);
  assert.match(etiquetaMision(s, 'es'), /^Misión iniciada: /);
  assert.equal(resolverTema('').id, 'pan');
  assert.equal(resolverTema('PortAventuraNeXT').id, 'pan');
  assert.ok(MAPA_PORTAVENTURA.includes('idea-ip-portaventura.webp'));
  assert.ok(TIMEOUT_BACKEND_MS <= 8000);
  assert.equal(URL_HOME, '/?autonomo=leyendas&tema=pan');
  assert.equal(URL_ESCENA0, '/escena0/?autonomo=leyendas&tema=pan');
});

test('la home y Escena 0 están cableados al modo autónomo', () => {
  const home = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const escenaJs = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  const escenaHtml = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  const demo = readFileSync(new URL('./assets/consejo-demo.js', import.meta.url), 'utf8');
  const auto = readFileSync(new URL('./assets/consejo-autonomo.js', import.meta.url), 'utf8');
  assert.match(home, /assets\/consejo-autonomo\.js\?v=20261124-autonomo/);
  assert.match(auto, /parseAutonomoUrl/);
  assert.match(auto, /speechSynthesis/);
  assert.match(auto, /IdeaMesa/);
  assert.match(escenaJs, /parseAutonomoUrl/);
  assert.match(escenaJs, /montarAutonomoLeyendas/);
  assert.match(escenaHtml, /autonomo=leyendas&amp;tema=pan/);
  assert.match(demo, /autonomo=leyendas/);
});

test('el audio se desbloquea y se locuta la primera línea dentro del clic, sin esperar al TTS ni al backend', () => {
  const auto = readFileSync(new URL('./assets/consejo-autonomo.js', import.meta.url), 'utf8');
  const escena = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  for (const [n, js] of [['home', auto], ['escena0', escena]]) {
    assert.match(js, /AudioContext|webkitAudioContext/, n + ' resume AudioContext');
    assert.match(js, /speechSynthesis/, n);
    assert.match(js, /es-ES/, n);
    assert.match(js, /desbloquearAudioEnClic/, n);
  }
  // En la home, arrancar no es async: speak del primer turno va antes de cualquier await.
  const fn = auto.slice(auto.indexOf('function arrancar'));
  const hastaSeguir = fn.slice(0, fn.indexOf('seguirResto'));
  assert.match(hastaSeguir, /desbloquearAudioEnClic\(\)/);
  assert.match(hastaSeguir, /hablarNativo\(/);
  assert.match(hastaSeguir, /mostrarBocadillo\(/);
  assert.doesNotMatch(hastaSeguir, /\bawait\s/, 'ni un await antes de la primera locución');
  assert.doesNotMatch(hastaSeguir, /AdmiraVoces\.speak/, 'el clic no espera al TTS de AdmiraVoces');
  assert.doesNotMatch(hastaSeguir, /await\s+askBackend|resolverTurno\(/, 'el clic no espera al backend para la primera línea');
  assert.match(escena, /hablarNativoAutonomo\(t0/);
  assert.match(escena, /desbloquearAudioEnClic\(\)/);
});
