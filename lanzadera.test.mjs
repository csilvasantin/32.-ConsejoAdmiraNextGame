import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEMOS,
  MAQUINA_CREMA,
  MAQUINA_PLATA,
  MAQUINA_ROSA,
  URL_LANZADERA,
  URL_PUBLICA_LANZADERA,
  URL_SALA_NEGRO,
  demoPorId,
  localizarDisplay,
  parseComandoDemo,
  planDeLanzamiento,
  puedeMarcarEnMarcha,
  urlLanzaderaDemo,
  urlLanzaderaApagar,
  validarPlanContraInventario,
  APAGADOS,
  ENCENDIDOS,
  MAQUINAS_PROTEGIDAS,
  destinosApagadoReuniones,
  destinosApagadoInteractivos,
  esMaquinaProtegida,
  parseComandoApagar,
  planDeApagado,
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
  assert.match(html, /id="demo-negro"/);
  assert.match(html, /Sala en negro/);
  assert.match(html, /86BDL3650Q/);
  assert.match(html, /PC Monitor/);
  assert.match(html, /id="zona-apagado"/);
  assert.match(html, /id="apagar-reuniones"/);
  assert.match(html, /id="apagar-interactivos"/);
  assert.match(html, /id="apagar-todo"/);
  assert.match(html, /id="confirm-apagado"/);
  assert.match(html, /id="encender-reuniones"/);
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

test('el plan apunta a la Philips del Rosa y al PC Monitor del Crema, no al Plata', () => {
  const plan = planDeLanzamiento('admiranext', new Date('2026-11-26T10:17:00.000Z'));
  assert.equal(plan.rosa.machineId, MAQUINA_ROSA.machineId);
  assert.equal(plan.rosa.display.nombre, '86BDL3650Q');
  assert.equal(plan.rosa.display.index, undefined);
  assert.equal(plan.rosa.url, 'https://www.admira.live/?autonomo=leyendas&tema=admiranext');
  assert.equal(plan.crema.machineId, MAQUINA_CREMA.machineId);
  assert.equal(plan.crema.display.nombre, 'PC Monitor');
  assert.equal(plan.crema.url, 'https://www.admira.live/consumos');
  assert.equal(plan.plata, undefined);
  assert.equal(MAQUINA_PLATA.excluida, true);
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

test('sala en negro no intercepta el catálogo /demo y pone una página negra', () => {
  assert.equal(parseComandoDemo('sala en negro').demo.id, 'negro');
  assert.equal(parseComandoDemo('/sala negro').demo.id, 'negro');
  assert.equal(parseComandoDemo('/demo negro').demo.id, 'negro');
  assert.equal(parseComandoDemo('/demo').tipo, 'lanzadera');
  assert.equal(parseComandoDemo('/demo').demo, null);
  const plan = planDeLanzamiento('negro', new Date('2026-11-26T12:00:00.000Z'));
  assert.equal(plan.reset, true);
  assert.equal(plan.rosa.url, URL_SALA_NEGRO);
  assert.equal(plan.crema.url, URL_SALA_NEGRO);
  const negro = readFileSync(new URL('./lanzadera/negro.html', import.meta.url), 'utf8');
  assert.match(negro, /cursor:\s*auto/);
  assert.doesNotMatch(negro, /cursor\s*:\s*none/);
});

test('si falta el monitor nombrado, hay error y no se cae a otra pantalla', () => {
  const plan = planDeLanzamiento('admiranext', new Date('2026-11-26T10:17:00.000Z'));
  const inventario = [
    { machineId: MAQUINA_ROSA.machineId, displays: [{ nombre: 'Color LCD' }] },
    { machineId: MAQUINA_CREMA.machineId, displays: [{ nombre: 'PC Monitor', edid: 'PC Monitor' }] },
  ];
  const mal = validarPlanContraInventario(plan, inventario);
  assert.equal(mal.ok, false);
  assert.match(mal.errores.join(' '), /86BDL3650Q/);
  assert.doesNotMatch(mal.errores.join(' '), /Color LCD/);
  const okInv = [
    { machineId: MAQUINA_ROSA.machineId, displays: [{ nombre: 'PHILIPS 86BDL3650Q', edid: '86BDL3650Q' }] },
    { machineId: MAQUINA_CREMA.machineId, displays: [{ nombre: 'PC Monitor' }] },
  ];
  const bien = validarPlanContraInventario(plan, okInv);
  assert.equal(bien.ok, true);
  assert.equal(localizarDisplay(okInv, plan.rosa).display.nombre, 'PHILIPS 86BDL3650Q');
  assert.equal(puedeMarcarEnMarcha(plan, { pantallas: [{ destino: 'rosa', ok: true }] }), false);
  assert.equal(puedeMarcarEnMarcha(plan, { pantallas: [{ destino: 'rosa', ok: true }, { destino: 'crema', ok: true }] }), true);
});

test('el apagado por zona pide confirmación, reutiliza Sala en negro y no toca Studio ni Mini', () => {
  assert.equal(parseComandoApagar('/apagar reuniones').apagado.id, 'reuniones');
  assert.equal(parseComandoDemo('apagar sala de reuniones').apagado.id, 'reuniones');
  assert.equal(parseComandoDemo('/apagar interactivos').apagado.id, 'interactivos');
  assert.equal(parseComandoDemo('/apagar todo').apagado.id, 'todo');
  assert.equal(parseComandoDemo('/apagar').tipo, 'lanzadera');
  assert.equal(parseComandoDemo('/encender reuniones').encendido.demo, 'admiranext');
  assert.equal(parseComandoDemo('/restaurar interactivos').encendido.demo, 'interactivo');
  assert.equal(parseComandoDemo('/demo').tipo, 'lanzadera');
  assert.equal(urlLanzaderaApagar('reuniones'), '/lanzadera/?apagar=reuniones');

  const plan = planDeApagado('reuniones', new Date('2026-11-26T13:32:00.000Z'));
  assert.equal(plan.requiereConfirmacion, true);
  assert.equal(plan.confirmado, false);
  assert.equal(plan.dormirPantalla, false);
  assert.equal(plan.urlNegro, URL_SALA_NEGRO);
  assert.equal(plan.marca, 'AdmiraNeXT');
  assert.deepEqual(plan.destinos.map((d) => d.id), ['rosa-philips', 'crema-arriba', 'crema-portatil', 'plata']);
  assert.equal(plan.destinos[0].display.nombre, '86BDL3650Q');
  assert.equal(plan.destinos[1].display.nombre, 'PC Monitor');
  assert.equal(plan.destinos[2].id, 'crema-portatil');
  assert.equal(plan.destinos[3].siConectado, true);
  assert.ok(plan.destinos.every((d) => !d.machineId || !esMaquinaProtegida(d.machineId)));
  assert.ok(MAQUINAS_PROTEGIDAS.some((m) => m.etiqueta === 'MacMini'));
  assert.ok(MAQUINAS_PROTEGIDAS.some((m) => m.etiqueta === 'MacStudio'));
  assert.match(plan.etiqueta, /14:32/);
  assert.match(js, /pedirConfirmacion/);
  assert.match(js, /admira:lanzadera-apagar/);
  assert.doesNotMatch(css, /cursor\s*:\s*none/);

  const inter = planDeApagado('interactivos', new Date('2026-11-26T13:32:00.000Z'));
  const ids = inter.destinos.map((d) => d.id);
  assert.ok(ids.includes('player-01'));
  assert.ok(ids.includes('player-05'));
  assert.ok(ids.includes('player-01V'));
  assert.ok(ids.includes('player-05V'));
  assert.ok(ids.includes('admiradesk'));
  assert.equal(inter.destinos.find((d) => d.id === 'admiradesk').tipo, 'control');
  assert.ok(inter.destinos.filter((d) => d.tipo === 'player').every((d) => d.url === URL_SALA_NEGRO));

  const todo = planDeApagado('todo', new Date('2026-11-26T13:32:00.000Z'));
  assert.ok(todo.destinos.some((d) => d.id === 'rosa-philips'));
  assert.ok(todo.destinos.some((d) => d.id === 'admiradesk'));
  assert.equal(ENCENDIDOS.reuniones.demo, 'admiranext');
  assert.equal(ENCENDIDOS.interactivos.demo, 'interactivo');
  assert.equal(APAGADOS.todo.restaurar, 'todo');
  assert.match(ayuda, /\/apagar reuniones/);
  assert.match(frame, /\/apagar reuniones/);
  assert.match(home, /\/apagar reuniones/);
});
