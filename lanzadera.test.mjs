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
import {
  MAQUINAS_HORIZONTALES,
  MAQUINAS_MUPIS,
  destinosApagadoMupis,
  urlPlayerPan,
} from './lanzadera-lib.mjs';
import {
  validarPeticion,
  planDeEjecucion,
  resolverDespacho,
  anotarDespacho,
  anotarAcuse,
  construirEstado,
  censoDesdePresencia,
  ordenesDeMaquina,
  respuestaEjecucion,
  contieneSecreto,
  ESTADOS,
} from './lanzadera-ejecucion-lib.mjs';

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
  // Cada pantalla con su propio player (convención real de admiranext.com/demo/player.js: ?screen=admiranext0N-a).
  assert.equal(plan.players.length, 5);
  for (const p of plan.players) assert.equal(p.url, 'https://www.admiranext.com/demo/player?screen=' + p.pantalla);
  assert.equal(plan.players[0].url, 'https://www.admiranext.com/demo/player?screen=admiranext01-a');
  assert.ok(plan.players.every((p) => p.grupo === 'PC'));
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
  // Desde el 27-nov los mupis son zona propia: apagar interactivos no los toca.
  assert.ok(!ids.includes('player-01V'));
  assert.ok(!ids.includes('player-05V'));
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


// ---------------------------------------------------------------------------------------------
// 27-nov-2026 (t1452u): tres zonas, ejecución real detrás del login y estado vivo honesto.

test('zona 3: los mupis verticales son independientes de los interactivos', () => {
  assert.deepEqual(MAQUINAS_HORIZONTALES.map((m) => m.e), ['01', '02', '03', '04', '05']);
  assert.deepEqual(MAQUINAS_MUPIS.map((m) => m.e), ['01V', '03V', '05V']);
  assert.deepEqual(MAQUINAS_MUPIS.map((m) => m.maquina), ['AdmiraNeXT01', 'AdmiraNeXT03', 'AdmiraNeXT05']);
  const mup = planDeLanzamiento('mupis', new Date('2026-11-27T09:40:00.000Z'));
  assert.equal(mup.zona, 'mupis');
  assert.deepEqual(mup.players.map((p) => p.e), ['01V', '03V', '05V']);
  assert.equal(mup.players[0].url, 'https://admira.tv/canal.html?screen=admiranext01-b');
  const inter = planDeLanzamiento('interactivo', new Date('2026-11-27T09:40:00.000Z'));
  assert.ok(inter.players.every((p) => !/V$/.test(p.e)));
  const ap = planDeApagado('mupis', new Date('2026-11-27T09:40:00.000Z'));
  assert.deepEqual(ap.destinos.map((d) => d.id), ['player-01V', 'player-03V', 'player-05V']);
  assert.ok(ap.destinos.every((d) => d.url === URL_SALA_NEGRO));
  assert.deepEqual(destinosApagadoMupis().map((d) => d.id), ['player-01V', 'player-03V', 'player-05V']);
  const todo = planDeApagado('todo', new Date('2026-11-27T09:40:00.000Z')).destinos.map((d) => d.id);
  for (const id of ['rosa-philips', 'player-01', 'player-05', 'player-01V', 'player-05V', 'admiradesk']) assert.ok(todo.includes(id), id);
  assert.equal(ENCENDIDOS.mupis.demo, 'mupis');
  assert.equal(APAGADOS.mupis.restaurar, 'mupis');
  // Ejecución: mupis no arrastra horizontales, ni interactivos arrastra mupis.
  for (const accion of ['admiranext', 'portaventura', 'negro', 'apagar', 'encender']) {
    assert.deepEqual(planDeEjecucion('mupis', accion).pantallas.map((p) => p.id), ['player-01V', 'player-03V', 'player-05V'], accion);
    assert.deepEqual(planDeEjecucion('interactivos', accion).pantallas.map((p) => p.id), ['player-01', 'player-02', 'player-03', 'player-04', 'player-05'], accion);
  }
});

test('voz y CLI de los mupis: /demo mupis, portaventura, negro, /apagar y /encender mupis', () => {
  assert.equal(parseComandoDemo('/demo mupis').demo.id, 'mupis');
  assert.equal(parseComandoDemo('/demo mupis portaventura').demo.id, 'pan-mupis');
  assert.equal(parseComandoDemo('/demo mupis negro').demo.id, 'negro-mupis');
  assert.equal(parseComandoDemo('/apagar mupis').apagado.id, 'mupis');
  assert.equal(parseComandoDemo('apagar mupis verticales').apagado.id, 'mupis');
  assert.equal(parseComandoDemo('/encender mupis').encendido.id, 'mupis');
  assert.equal(parseComandoDemo('/encender todo').encendido.id, 'todo');
  assert.equal(parseComandoDemo('/apagar interactivos').apagado.id, 'interactivos');
  // La CLI de la home, el experto y el catálogo enrutan los mupis a la lanzadera.
  assert.match(home, /\?demo=pan-mupis/);
  assert.match(home, /\?apagar=mupis/);
  assert.match(home, /\?encender=mupis/);
  assert.match(frame, /\?apagar=mupis/);
  assert.match(ayuda, /'\/demo mupis', '2026-11-27'/);
  assert.match(ayuda, /'\/apagar mupis', '2026-11-27'/);
  const re = home.split('\n').find((l) => l.includes('t430u') === false && /if \(\/\^\\\/\?\(\?:lanzadera\|launcher/.test(l));
  assert.ok(re, 'regex de la home');
  for (const id of ['demo-mupis', 'demo-pan-mupis', 'demo-negro-mupis', 'apagar-mupis', 'encender-mupis', 'encender-todo', 'zona-mupis']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /Zona 3 · Mupis verticales/);
});

test('PortAventuraNeXT: URL del player por pantalla, horizontales y mupis', () => {
  assert.equal(urlPlayerPan('admiranext03-a'), 'https://www.admiranext.com/demo/player?screen=admiranext03-a');
  const p = planDeEjecucion('todo', 'portaventura');
  const url = (id) => p.pantallas.find((x) => x.id === id).url;
  assert.equal(url('player-01'), 'https://www.admiranext.com/demo/player?screen=admiranext01-a');
  assert.equal(url('player-04'), 'https://www.admiranext.com/demo/player?screen=admiranext04-a');
  assert.equal(url('player-05V'), 'https://www.admiranext.com/demo/player?screen=admiranext05-b');
  assert.equal(url('rosa-philips'), 'https://www.admira.live/?autonomo=leyendas&tema=pan');
  assert.equal(new Set(p.pantallas.filter((x) => x.id.startsWith('player-')).map((x) => x.url)).size, 8);
  assert.equal(planDeLanzamiento('pan-mupis').players[1].url, 'https://www.admiranext.com/demo/player?screen=admiranext03-b');
});

test('estado honesto: 03/04/03V pendiente ID, offline sin conexión, nunca «en marcha» sin acuse', () => {
  const ahora = Date.parse('2026-11-27T09:45:00.000Z');
  const s = Math.floor(ahora / 1000);
  const censo = censoDesdePresencia({ presence: [
    { machine: 'AdmiraNeXT01', persona: 'Oraculo', updated: s - 60 },
    { machine: 'MacBookAirRosa', persona: 'Trinity', updated: s - 30 },
    { machine: 'MacBookAirCrema', persona: 'Neo', updated: s - 3600 }, // latido viejo → sin conexión
    { machine: 'MacMini', persona: 'Smith', updated: s - 10 },
  ] }, s);
  assert.ok(censo.has('admiranext01') && censo.has('macbookairrosa') && !censo.has('macbookaircrema'));
  const plan = planDeEjecucion('todo', 'admiranext', ahora);
  const r = resolverDespacho(plan, censo, true);
  const res = (id) => r.find((x) => x.id === id).resultado;
  assert.equal(res('player-03'), 'pendiente_id');
  assert.equal(res('player-04'), 'pendiente_id');
  assert.equal(res('player-03V'), 'pendiente_id');
  assert.equal(res('player-01'), 'despachado');
  assert.equal(res('player-01V'), 'despachado');
  assert.equal(res('rosa-philips'), 'despachado');
  assert.equal(res('crema-arriba'), 'sin_conexion');
  assert.equal(res('player-02'), 'sin_conexion');
  assert.equal(res('player-05V'), 'sin_conexion');
  // Censo caído: nada se da por despachado.
  assert.ok(resolverDespacho(plan, censo, false).every((x) => x.resultado !== 'despachado'));
  const resp = respuestaEjecucion(plan, r);
  assert.equal(resp.enMarcha, false);
  assert.doesNotMatch(JSON.stringify(resp), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  // Estado: despachado sin acuse NO es «en marcha».
  let estado = anotarDespacho(null, plan, r, ahora);
  let vivo = construirEstado(estado, censo, true, ahora);
  const est = (id) => vivo.pantallas.find((x) => x.id === id).estado;
  assert.equal(est('player-01'), 'despachado');
  assert.equal(est('player-03'), 'pendiente_id');
  assert.equal(est('player-03V'), 'pendiente_id');
  assert.equal(est('crema-arriba'), 'sin_conexion');
  assert.ok(vivo.pantallas.every((p) => p.estado !== 'en_marcha'));
  assert.ok(vivo.zonas.every((z) => z.estado !== 'en_marcha'));
  assert.equal(vivo.pantallas.length, 4 + 5 + 3);
  assert.deepEqual(vivo.zonas.map((z) => z.zona), ['reuniones', 'interactivos', 'mupis']);
  // Cola del equipo y acuse: solo con ok:true pasa a «en marcha».
  const cola = ordenesDeMaquina(estado, 'AdmiraNeXT01', ahora);
  assert.deepEqual(cola.map((o) => o.pantalla).sort(), ['player-01', 'player-01V']);
  assert.ok(cola.every((o) => o.noRobarFoco === true && /sin robar el foco/.test(o.instruccion)));
  assert.equal(ordenesDeMaquina(estado, 'MacMini', ahora).length, 0);
  const malo = anotarAcuse(estado, { pantalla: 'player-01', orden: cola[0].pantalla === 'player-01' ? cola[0].orden : cola[1].orden, ok: false, nota: 'Chrome no abrió' }, ahora + 1000);
  assert.equal(construirEstado(malo.estado, censo, true, ahora).pantallas.find((p) => p.id === 'player-01').estado, 'error');
  const o1 = cola.find((o) => o.pantalla === 'player-01');
  estado = anotarAcuse(estado, { pantalla: 'player-01', orden: o1.orden, ok: true }, ahora + 2000).estado;
  vivo = construirEstado(estado, censo, true, ahora);
  assert.equal(vivo.pantallas.find((p) => p.id === 'player-01').estado, 'en_marcha');
  assert.notEqual(vivo.zonas.find((z) => z.zona === 'interactivos').estado, 'en_marcha');
  assert.equal(ESTADOS.en_marcha.es, 'En marcha');
  assert.equal(ESTADOS.pendiente_id.es, 'Pendiente ID');
  // puedeMarcarEnMarcha ampliada: con 03/04 sin machineId la zona interactiva nunca está «en marcha».
  const inter = planDeLanzamiento('interactivo');
  assert.equal(puedeMarcarEnMarcha(inter, { pantallas: inter.players.map((p) => ({ destino: p.id, ok: true })) }), false);
  const mupPlan = planDeLanzamiento('mupis');
  assert.equal(puedeMarcarEnMarcha(mupPlan, { pantallas: [{ destino: 'player-01V', ok: true }, { destino: 'player-05V', ok: true }] }), false);
  const val = validarPlanContraInventario(inter, [{ machineId: MAQUINA_ROSA.machineId }]);
  assert.equal(val.ok, false);
  assert.match(val.errores.join(' '), /Pendiente ID: AdmiraNeXT03/);
  assert.match(val.errores.join(' '), /Sin conexión/);
});

test('el Mac Studio y el Mac Mini son intocables', () => {
  for (const z of ['reuniones', 'interactivos', 'mupis', 'todo']) {
    for (const a of ['admiranext', 'portaventura', 'negro', 'apagar', 'encender']) {
      assert.ok(planDeEjecucion(z, a).pantallas.every((p) => !esMaquinaProtegida(p.machineId)), z + '/' + a);
    }
  }
  for (const m of MAQUINAS_PROTEGIDAS) {
    assert.equal(validarPeticion({ zona: 'todo', accion: 'apagar', machineId: m.machineId }).ok, false);
  }
  assert.equal(validarPeticion({ zona: 'sala', accion: 'apagar' }).ok, false);
  assert.equal(validarPeticion({ zona: 'mupis', accion: 'reiniciar' }).ok, false);
  assert.equal(validarPeticion({ zona: 'mupis', accion: 'apagar' }).ok, true);
});

test('la API de la lanzadera va detrás del login y la página la usa de verdad', async () => {
  const ej = readFileSync(new URL('./functions/api/lanzadera/ejecutar.js', import.meta.url), 'utf8');
  const es = readFileSync(new URL('./functions/api/lanzadera/estado.js', import.meta.url), 'utf8');
  const comun = readFileSync(new URL('./functions/_lanzadera.js', import.meta.url), 'utf8');
  const puerta = readFileSync(new URL('./functions/_puerta.js', import.meta.url), 'utf8');
  assert.doesNotMatch(puerta, /lanzadera/);
  assert.match(ej, /sesion\(request, env, f, \{ escritura: true \}\)/);
  assert.match(es, /sesion\(request, env, f\)/);
  assert.match(comun, /d\.t !== 'persona'/);
  // Sin cookie ni Google → 401 (con un fetch falso que no autoriza nada).
  const mod = await import('./functions/api/lanzadera/estado.js');
  const noAuth = async () => new Response('{}', { status: 401 });
  const r = await mod.onRequestGet({ request: new Request('https://www.admira.live/api/lanzadera/estado'), env: { PUERTA_FIRMA: 'x'.repeat(40) }, fetchImpl: noAuth });
  assert.equal(r.status, 401);
  const ejm = await import('./functions/api/lanzadera/ejecutar.js');
  const r2 = await ejm.onRequestPost({ request: new Request('https://www.admira.live/api/lanzadera/ejecutar', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{"zona":"todo","accion":"apagar"}' }), env: {}, fetchImpl: noAuth });
  assert.equal(r2.status, 403);
  const r3 = await ejm.onRequestPost({ request: new Request('https://www.admira.live/api/lanzadera/ejecutar', { method: 'POST', headers: { Origin: 'https://www.admira.live' }, body: '{"zona":"todo","accion":"apagar"}' }), env: { PUERTA_FIRMA: 'x'.repeat(40) }, fetchImpl: noAuth });
  assert.equal(r3.status, 401);
  // La página: lanzar y confirmar apagado llaman a la API; refresco de 30 s y botón.
  assert.match(js, /\/api\/lanzadera\/ejecutar/);
  assert.match(js, /\/api\/lanzadera\/estado/);
  assert.match(js, /ejecutar\(plan\.apagado\.id, 'apagar', plan\)/);
  assert.match(js, /REFRESCO_MS = 30000/);
  assert.match(js, /validarPlanContraInventario/);
  assert.match(js, /puedeMarcarEnMarcha/);
  assert.match(html, /id="estado-vivo"/);
  assert.match(html, /id="ev-actualizar"/);
  assert.doesNotMatch(js, /visto\.size >= 3/);
  assert.equal(contieneSecreto('https://www.admira.live/lanzadera/negro.html'), false);
  assert.equal(contieneSecreto('10.0.0.1'), true);
});
