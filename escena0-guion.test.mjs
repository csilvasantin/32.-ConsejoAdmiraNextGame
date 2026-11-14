import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  GUION_PAN, parseGuion, parseCabecera, CABECERAS, CABECERA_POS, textoTurno, bolsasGuion, promptGuion, mesaDeGuion, msLectura,
} from './escena0-guion.mjs';
import { ANCLA } from './escena0-lib.mjs';

test('el guion de PortAventuraNeXT es consejero vs consejero: alterna Leyendas y Coetáneos', () => {
  assert.equal(parseGuion('pan'), GUION_PAN);
  assert.equal(parseGuion('PortAventuraNeXT'), GUION_PAN);
  assert.equal(parseGuion('otro'), null);
  const mesas = GUION_PAN.turnos.map((t) => mesaDeGuion(t.persona));
  assert.ok(mesas.every(Boolean), 'todos los que hablan tienen mesa');
  assert.ok(mesas.includes('leyendas') && mesas.includes('coetaneos'));
  // Todos tienen ancla para el globo en su mesa
  for (const t of GUION_PAN.turnos) assert.ok(ANCLA[mesaDeGuion(t.persona)][t.persona], t.persona);
  assert.match(GUION_PAN.turnos[0].texto, /el parque que se cuenta solo/);
  assert.equal(GUION_PAN.cierre, 'portaventuranext.com');
});

test('cabecera: Carlo Bonomi por nombre o alias, sin cargo; off la vacía', () => {
  for (const v of ['bonomi', 'Carlo Bonomi', 'carlo-bonomi', 'CARLO']) assert.equal(parseCabecera(v).nombre, 'Carlo Bonomi');
  for (const v of ['', 'off', 'no', null]) assert.equal(parseCabecera(v), null);
  assert.equal(parseCabecera('pepe'), null);
  assert.equal(Object.keys(CABECERAS['carlo-bonomi']).includes('cargo'), false, 'no se inventa cargo');
  assert.equal(CABECERA_POS.mesa, 'coetaneos');
});

test('el turno nombra al invitado de cabecera (o a Carlos si no hay)', () => {
  const t = GUION_PAN.turnos.find((x) => x.texto.includes('{cabecera}'));
  assert.match(textoTurno(t, parseCabecera('bonomi')), /^Carlo, la cabecera es tuya/);
  assert.match(textoTurno(t, null), /^Carlos, la cabecera es tuya/);
  const b = bolsasGuion(GUION_PAN, parseCabecera('bonomi'));
  assert.equal(b['Elon Musk'].length, 3);
  assert.ok(!JSON.stringify(b).includes('{cabecera}'));
});

test('prompt de IA: la idea fija del guion y quién escucha en la cabecera', () => {
  const p = promptGuion(GUION_PAN, 1, parseCabecera('bonomi'), [{ persona: 'George Lucas', texto: 'Hola' }]);
  assert.match(p, /Carlo Bonomi/);
  assert.match(p, /George Lucas: Hola/);
  assert.match(p, /cincuenta de colas/);
  assert.equal(msLectura(''), 4000);
  assert.equal(msLectura('x'.repeat(1000)), 11000);
});

test('la home y escena0 comparten ficha y posición de la cabecera', () => {
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
  const lib = ctx.CouncilCabeceraLib;
  assert.deepEqual({ ...lib.POS }, { ...CABECERA_POS });
  assert.equal(lib.CABECERAS['carlo-bonomi'].foto, CABECERAS['carlo-bonomi'].foto);
  assert.equal(lib.CABECERAS['carlo-bonomi'].nombre, 'Carlo Bonomi');
});

test('/cabecera en la home: pone, alterna, quita y rechaza desconocidos', () => {
  const ctx = {}; ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
  const lib = ctx.CouncilCabeceraLib;
  const m = {}; const e = lib.crearEstado({ getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } });
  let r = lib.comando('/cabecera Carlo Bonomi', e);
  assert.equal(r.ok, true); assert.equal(r.gen, 'coetaneos'); assert.equal(e.get(), 'carlo-bonomi');
  assert.equal(m[lib.KEY], 'carlo-bonomi');
  r = lib.comando('/cabecera off', e); assert.equal(e.get(), null); assert.equal(m[lib.KEY], undefined);
  r = lib.comando('/cabecera', e); assert.equal(e.get(), 'carlo-bonomi');
  r = lib.comando('/cabecera', e); assert.equal(e.get(), null);
  r = lib.comando('/cabecera pepe', e); assert.equal(r.ok, false);
  assert.equal(lib.comando('/consejero todos', e), null);
});

test('la home carga el módulo y app.js / app.flt atienden /cabecera', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<script defer src="assets\/consejo-cabecera\.js\?v=[^"]+"><\/script>\s*<script defer src="app\.flt-100529\.js/);
  for (const f of ['./app.js', './app.flt-100529.js']) {
    const js = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(js, /window\.CouncilCabecera\.comando\(text\)/, f);
    assert.match(js, /window\.CouncilCabecera\.sync\(currentGen\)/, f);
    assert.match(js, /'\/cabecera'/, f);
  }
});

test('escena0: el flujo de demo y la cabecera están cableados en la página', () => {
  const html = readFileSync(new URL('./escena0/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="cabecera"/); assert.match(html, /id="rotulo"/);
  assert.match(html, /\?flujo=pan&amp;cabecera=bonomi/);
  const js = readFileSync(new URL('./escena0/escena0.js', import.meta.url), 'utf8');
  assert.match(js, /from '\/escena0-guion\.mjs'/);
  assert.match(js, /parseGuion\(q\.get\('flujo'\)\)/);
  assert.match(js, /parseCabecera\(q\.get\('cabecera'\)\)/);
  assert.match(js, /1 · Consejo de Leyendas/);
  assert.match(js, /2 · Consejo de Coetáneos/);
});
