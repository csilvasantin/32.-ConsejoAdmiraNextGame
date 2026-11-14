import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
globalThis.window = globalThis;
await import('./hablar-cmd.js');
const H = globalThis.AdmiraHablarCmd;
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('./assets/consejero-mesa.js', import.meta.url), 'utf8'), ctx);
const M = ctx.CouncilConsejeroMesaLib;
const ctxP = {}; ctxP.globalThis = ctxP;
vm.runInNewContext(readFileSync(new URL('./assets/council-presencia.js', import.meta.url), 'utf8'), ctxP);
const P = ctxP.CouncilPresenciaLib;
const ctxC = {}; ctxC.globalThis = ctxC;
vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctxC);
const C = ctxC.CouncilCabeceraLib;
function mem() { const m = {}; return { m, getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const integ = readFileSync(new URL('./council-integration.js', import.meta.url), 'utf8');

test('t1347u: Carlos Silva y Carlo Bonomi con sus alias, desaparecer y aparecer', () => {
  for (const a of ['carlos', 'silva', 'carlossilva', 'Carlos Silva'])
    assert.deepEqual({ ...H.parseLinea('/consejero ' + a + ' desaparecer') }, { accion: 'consejero', persona: 'Carlos Silva', mesa: 'leyendas', visible: false });
  for (const a of ['bonomi', 'bononi', 'carlo', 'Carlo Bonomi'])
    assert.deepEqual({ ...H.parseLinea('/consejero ' + a + ' aparecer') }, { accion: 'consejero', persona: 'Carlo Bonomi', mesa: 'coetaneos', visible: true });
  for (const v of ['desaparecer', 'desaparece', 'ocultar']) assert.equal(H.parseLinea('/consejero jobs ' + v).visible, false);
  for (const v of ['aparecer', 'aparece', 'mostrar']) assert.equal(H.parseLinea('/consejero elon ' + v).visible, true);
  assert.equal(H.parseLinea('/consejero carlos ratti desaparece').persona, 'Carlos Ratti');
  assert.equal(H.parseLinea('/Consejero MURATI ocultar').persona, 'Mira Murati');
});

test('t1347u: uso incorrecto es error (no se envía al consejero)', () => {
  for (const t of ['/consejero', '/consejero carlos', '/consejero desaparecer', '/consejero carlos bailar'])
    assert.equal(H.parseLinea(t).mensaje, 'consejero-uso', t);
  assert.equal(H.parseLinea('/consejero pepe ocultar').mensaje, 'consejero-nombre');
  assert.equal(H.parseLinea('/consejero shotwell ocultar').mensaje, 'consejero-fuera');
  assert.match(M.mensajeError(H.parseLinea('/consejero shotwell ocultar')), /no está en la mesa/);
  assert.match(M.mensajeError(H.parseLinea('/consejero')), /No se ha enviado nada/);
  // La integración trata estas líneas antes de mandar nada y sin voz.
  assert.match(integ, /linea\.accion==='consejero'\|\|\(linea\.accion==='error'&&\/\^consejero\//);
});

test('t1347u: estado propio en localStorage y aplicado a presencia y cabecera', () => {
  const s = mem();
  const e = M.crearEstado(s);
  assert.equal(M.KEY, 'admira:consejero-mesa');
  assert.notEqual(M.KEY, P.KEY); assert.notEqual(M.KEY, C.KEY);
  const pres = { estado: P.crearEstado(mem()) }, cab = { estado: C.crearEstado(mem()) };
  cab.estado.set('carlo-bonomi');
  assert.equal(M.aplicarPersona('Carlos Silva', 'leyendas', false, { presencia: pres, cabecera: cab }), true);
  assert.equal(pres.estado.carlosVisible(), false);
  assert.equal(M.aplicarPersona('Carlo Bonomi', 'coetaneos', false, { presencia: pres, cabecera: cab }), true);
  assert.equal(cab.estado.get(), null);
  M.aplicarPersona('Steve Jobs', 'leyendas', false, { presencia: pres, cabecera: cab });
  assert.equal(pres.estado.visible('leyendas', 'Steve Jobs'), false);
  M.aplicarPersona('Carlo Bonomi', 'coetaneos', true, { presencia: pres, cabecera: cab });
  M.aplicarPersona('Carlos Silva', 'leyendas', true, { presencia: pres, cabecera: cab });
  assert.equal(cab.estado.get(), 'carlo-bonomi'); assert.equal(pres.estado.carlosVisible(), true);
  e.set('Carlos Silva', false); e.set('Carlo Bonomi', false);
  assert.deepEqual(JSON.parse(s.m['admira:consejero-mesa']), { 'Carlos Silva': false, 'Carlo Bonomi': false });
  assert.equal(M.crearEstado(s).get('Carlos Silva'), false);
  assert.match(M.mensaje({ persona: 'Carlos Silva', mesa: 'leyendas', visible: false }, true), /desaparece de la mesa de Leyendas/);
});

test('t1347u: la home carga el módulo tras presencia y cabecera, con versión nueva', () => {
  const iP = html.indexOf('assets/council-presencia.js?v=20261114-consejero-mesa');
  const iC = html.indexOf('assets/consejo-cabecera.js');
  const iM = html.indexOf('assets/consejero-mesa.js?v=20261114-consejero-mesa');
  assert.ok(iP > 0 && iC > iP && iM > iC);
  assert.match(html, /hablar-cmd\.js\?v=20261114-consejero-mesa/);
  assert.match(html, /council-integration\.js\?v=20261114-consejero-mesa/);
  assert.match(html, /app\.flt-100529\.js\?v=20261114-consejero-mesa/);
});
