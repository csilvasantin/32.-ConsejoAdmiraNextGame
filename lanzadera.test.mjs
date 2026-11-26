import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEMOS,
  MAQUINA_PLATA,
  MAQUINA_ROSA,
  URL_LANZADERA,
  URL_PUBLICA_LANZADERA,
  demoPorId,
  parseComandoDemo,
  planDeLanzamiento,
  urlLanzaderaDemo,
} from './lanzadera-lib.mjs';
import { parseAutonomoUrl } from './consejo-autonomo-leyendas.mjs';

const html = readFileSync(new URL('./lanzadera/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./lanzadera/lanzadera.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('./lanzadera/lanzadera.js', import.meta.url), 'utf8');
const frame = readFileSync(new URL('./yk-frame.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const ayuda = readFileSync(new URL('./assets/cli-ayuda.js', import.meta.url), 'utf8');

test('la lanzadera usa la retícula cuadrática y el mismo menú superior', () => {
  assert.match(html, /yk-frame\.css/);
  assert.match(html, /yk-frame\.js/);
  assert.match(html, /data-yk-zone="app"/);
  assert.match(html, /data-yk-expert-min/);
  assert.match(html, /data-yk-slot="left"/);
  assert.match(html, /data-yk-slot="right"/);
  assert.match(html, /data-yk-title="LANZADERA"/);
  assert.equal(URL_LANZADERA, '/lanzadera/');
  assert.equal(URL_PUBLICA_LANZADERA, 'https://www.admira.live/lanzadera/');
});

test('tiene las dos zonas, voz y hora de misión', () => {
  assert.match(html, /Sala de reuniones de Terminator/);
  assert.match(html, /Zona interactiva de Terminator/);
  assert.match(html, /id="zona-sala"/);
  assert.match(html, /id="zona-interactiva"/);
  assert.match(html, /Demo AdmiraNeXT\.com/);
  assert.match(html, /Demo PortAventuraNeXT\.com/);
  assert.match(html, />Demo AdmiraNeXT</);
  assert.match(html, /Modo demo PortAventuraNeXT/);
  assert.match(html, /id="demo-admiranext"/);
  assert.match(html, /id="demo-pan"/);
  assert.match(html, /id="demo-interactivo"/);
  assert.match(html, /id="demo-pan-interactivo"/);
  assert.match(html, /id="btn-voz"/);
  assert.match(html, /id="mision"/);
  assert.match(js, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(js, /etiquetaMision/);
  assert.match(js, /planDeLanzamiento/);
});

test('el cursor no se oculta en la lanzadera', () => {
  assert.doesNotMatch(css, /cursor\s*:\s*none/);
  assert.match(css, /cursor no se oculta nunca/);
});

test('parseComandoDemo reconoce voz, selección y CLI', () => {
  assert.equal(parseComandoDemo('Demo AdmiraNeXT.com').demo.id, 'admiranext');
  assert.equal(parseComandoDemo('/demo admiranext').demo.id, 'admiranext');
  assert.equal(parseComandoDemo('lanzar demo admiranext.com').demo.id, 'admiranext');
  assert.equal(parseComandoDemo('selecciono demo AdmiraNeXT.com').demo.id, 'admiranext');
  assert.equal(parseComandoDemo('Demo PortAventuraNeXT.com').demo.id, 'pan');
  assert.equal(parseComandoDemo('/demo portaventura').demo.id, 'pan');
  assert.equal(parseComandoDemo('/demo pan').demo.id, 'pan');
  assert.equal(parseComandoDemo('/lanzadera').tipo, 'lanzadera');
  assert.equal(parseComandoDemo('/demo').tipo, 'lanzadera');
  assert.equal(parseComandoDemo('qué opinas de la demo de otro cliente'), null);
  assert.equal(demoPorId('admiranext'), DEMOS.admiranext);
  assert.equal(parseComandoDemo('/demo interactivo').demo.id, 'interactivo');
  assert.equal(parseComandoDemo('player interactivo').demo.id, 'interactivo');
  assert.equal(parseComandoDemo('AdmiraDesk').demo.id, 'interactivo');
  assert.equal(parseComandoDemo('/demo admiradesk').demo.id, 'interactivo');
  assert.equal(parseComandoDemo('modo demo PortAventuraNeXT').demo.id, 'pan-interactivo');
  assert.equal(parseComandoDemo('/demo modo portaventura').demo.id, 'pan-interactivo');
  assert.equal(parseComandoDemo('/demo portaventura interactivo').demo.id, 'pan-interactivo');
  assert.equal(demoPorId('interactivo'), DEMOS.interactivo);
  assert.equal(demoPorId('pan-interactivo'), DEMOS['pan-interactivo']);
});

test('el plan apunta al Rosa (TCL derecha) y al Plata (consumos)', () => {
  const plan = planDeLanzamiento('admiranext', new Date('2026-11-26T10:17:00.000Z'));
  assert.equal(plan.rosa.machineId, MAQUINA_ROSA.machineId);
  assert.equal(plan.rosa.display.index, 3);
  assert.equal(plan.rosa.display.x, 1713);
  assert.equal(plan.rosa.url, 'https://www.admira.live/?autonomo=leyendas&tema=admiranext');
  assert.equal(plan.plata.machineId, MAQUINA_PLATA.machineId);
  assert.equal(plan.plata.url, 'https://www.admira.live/consumos');
  assert.match(plan.etiqueta, /Misión iniciada:/);
  assert.match(plan.etiqueta, /11:17/);
  assert.match(plan.cursor, /cursor no se oculta nunca/i);
  assert.equal(urlLanzaderaDemo('admiranext'), '/lanzadera/?demo=admiranext');
  assert.equal(parseAutonomoUrl('?autonomo=leyendas&tema=admiranext').temaId, 'admiranext');
});

test('la CLI de la home, el experto y el catálogo /demo cablean la lanzadera', () => {
  assert.match(home, /\/lanzadera\//);
  assert.match(home, /demo admiranext/);
  assert.match(frame, /\/lanzadera\//);
  assert.match(frame, /\/demo admiranext/);
  assert.match(ayuda, /\/demo admiranext', '2026-11-26'/);
  assert.match(ayuda, /dest = '\/lanzadera\/'/);
  assert.match(ayuda, /\?demo=admiranext/);
  assert.match(ayuda, /\?demo=interactivo/);
  assert.match(ayuda, /\?demo=pan-interactivo/);
  assert.match(frame, /\/demo interactivo/);
  assert.match(home, /\/demo interactivo/);
});

test('la zona interactiva apunta al player de admira.tv y a AdmiraDesk, sin adivinar el 03 ni el 04', () => {
  const plan = planDeLanzamiento('interactivo', new Date('2026-11-26T11:02:00.000Z'));
  assert.equal(plan.zona, 'interactiva');
  assert.equal(plan.control.url, 'https://www.admira.store/control/admiradesk/');
  assert.equal(plan.players[0].pantalla, 'admiranext01-a');
  assert.equal(plan.players[0].url, 'https://admira.tv/canal.html?screen=admiranext01-a');
  assert.equal(plan.players[0].machineId, '7d817289-d0a8-45ea-965a-0a8271b0c0d5');
  const tres = plan.players.find((p) => p.e === '03');
  const cuatro = plan.players.find((p) => p.e === '04');
  assert.equal(tres.machineId, null);
  assert.equal(cuatro.machineId, null);
  assert.match(tres.pendiente, /AdmiraNeXT03/);
  assert.match(plan.etiqueta, /12:02/);
  assert.match(plan.noRobarFoco, /foco/);
  assert.equal(urlLanzaderaDemo('interactivo'), '/lanzadera/?demo=interactivo');
});

test('el modo demo PortAventuraNeXT usa la presentación oficial y el player de 01–05', () => {
  const plan = planDeLanzamiento('pan-interactivo', new Date('2026-11-26T11:02:00.000Z'));
  assert.equal(plan.zona, 'interactiva');
  assert.equal(plan.control.url, 'https://www.admiranext.com/demo/PortAventuraNeXT/');
  assert.ok(plan.players.every((p) => p.url === 'https://www.admiranext.com/demo/player'));
  assert.equal(urlLanzaderaDemo('pan-interactivo'), '/lanzadera/?demo=pan-interactivo');
});
