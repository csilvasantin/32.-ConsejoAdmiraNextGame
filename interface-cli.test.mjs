// /interface (r29 · Jensen Huang): parser del modo experto y órdenes del móvil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('./assets/interface-cli.js');
const I = globalThis.AdmiraInterface;
const { normalizarOrden } = await import('./functions/api/interface.js');

test('parse: terminal 4/2 con y sin dispositivo', () => {
  assert.deepEqual(I.parse('/interface terminal 4'), { ok: true, accion: 'terminal', grid: 4, dispositivo: null });
  assert.deepEqual(I.parse('/interface terminal 2 Fold'), { ok: true, accion: 'terminal', grid: 2, dispositivo: 'fold' });
  assert.equal(I.parse('/interface terminal 2 Iphone').dispositivo, 'iphone');
  assert.equal(I.parse('/interface terminal 4 MBP16').dispositivo, 'mbp16');
  assert.equal(I.parse('/interface terminal 4 mbp14').dispositivo, 'mbp14');
  assert.equal(I.parse('/interfaz terminal 2 Air').dispositivo, 'air');
});
test('parse: off, help y errores', () => {
  assert.deepEqual(I.parse('/interface off'), { ok: true, accion: 'off', grid: 0, dispositivo: null });
  assert.deepEqual(I.parse('/interface off fold'), { ok: true, accion: 'off', grid: 0, dispositivo: 'fold' });
  assert.deepEqual(I.parse('/interface off 2 air'), { ok: true, accion: 'off', grid: 2, dispositivo: 'air' });
  assert.equal(I.parse('/interface').accion, 'help');
  assert.equal(I.parse('/interface help').accion, 'help');
  assert.equal(I.parse('/interface terminal 3').error, 'grid');
  assert.equal(I.parse('/interface terminal 2 tostadora').error, 'dispositivo');
  assert.equal(I.parse('/interfaces terminal 2'), null);
  assert.equal(I.parse('/help'), null);
});
test('Mac: la orden es el script local, sin claves ni URLs', () => {
  assert.equal(I.ordenMac({ accion: 'terminal', grid: 2 }), '$HOME/Claude/vista/admira-interface.sh terminal 2');
  assert.equal(I.ordenMac({ accion: 'off', grid: 0 }), '$HOME/Claude/vista/admira-interface.sh off');
});
test('móvil: solo fold/iphone, terminal 2|4 u off', () => {
  assert.equal(normalizarOrden({ dispositivo: 'Fold', accion: 'terminal', grid: 2 }).orden.grid, 2);
  assert.equal(normalizarOrden({ dispositivo: 'air', accion: 'terminal', grid: 2 }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 3 }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'off' }).orden.accion, 'off');
  assert.equal(normalizarOrden({ dispositivo: 'iphone', accion: 'rm -rf' }).ok, false);
});
test('seguridad: la web pública no lleva claves ni IPs privadas del ttyd', () => {
  for (const f of ['assets/interface-cli.js', 'interface/index.html', 'functions/api/interface.js']) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /192\.168\.|100\.\d+\.\d+\.\d+|:7681|carlos:/, f);
  }
});
test('home: /interface registrado, en /help y despachado antes que /help', () => {
  const APP = readFileSync('app.flt-100529.js', 'utf8');
  assert.match(APP, /'\/interface', '\/interfaz'/);
  assert.match(APP, /<strong>\/interface terminal 4 \| 2/);
  assert.ok(APP.indexOf('AdmiraInterface.run') < APP.indexOf('const helpMatch'));
  assert.match(readFileSync('index.html', 'utf8'), /assets\/interface-cli\.js/);
});

// r33 (Carlos 13:30): /interface 6 = 3x2 con los 4 de pago + Smith y Merovingio
test('parse: /interface 6 y terminal 6, aquí o en el móvil', () => {
  assert.deepEqual(I.parse('/interface 6'), { ok: true, accion: 'terminal', grid: 6, dispositivo: null });
  assert.deepEqual(I.parse('/interface terminal 6 fold'), { ok: true, accion: 'terminal', grid: 6, dispositivo: 'fold' });
  assert.equal(I.parse('/interface 6 iphone').dispositivo, 'iphone');
  assert.equal(I.parse('/interface off 6').grid, 6);
  assert.equal(I.GRID6_URL, '/visor/?g=6');
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 6 }).orden.grid, 6);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 5 }).ok, false);
});

test('forma corta: /interface 4 · /interface 2 fold · /interfaz 4 mbp16', () => {
  const I = globalThis.AdmiraInterface;
  assert.deepEqual(I.parse('/interface 4'), { ok: true, accion: 'terminal', grid: 4, dispositivo: null });
  assert.equal(I.parse('/interface 2 fold').dispositivo, 'fold');
  assert.equal(I.parse('/interfaz 4 MBP16').grid, 4);
  assert.equal(I.parse('/interface 3').ok, false);
});

test('/demo interface: help → 4 aquí → off → 2 aquí → off, todo con parse válido', () => {
  const I = globalThis.AdmiraInterface;
  assert.deepEqual(I.PASOS.map(p => p[0]), ['/interface help', '/interface 4', '/interface off', '/interface 2', '/interface off']);
  I.PASOS.forEach(p => { assert.equal(I.parse(p[0]).ok, true); assert.ok(p[1] && p[2]); });
  assert.ok(I.RE_DEMO.test('/demo interface') && I.RE_DEMO.test('/demo interfaz') && !I.RE_DEMO.test('/demo portada'));
});

test('la barra (páginas sin CLI propia) usa la misma implementación y la home carga el dock redimensionable', async () => {
  const fs = await import('node:fs');
  const bar = fs.readFileSync(new URL('./admira-bar.js', import.meta.url), 'utf8');
  assert.match(bar, /\/assets\/interface-cli\.js\?v=/);
  assert.match(bar, /"\/interface", "\/interfaz"/);
  const home = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(home, /\/assets\/experto-dock\.js\?v=/);
  assert.match(home, /\/assets\/interface-cli\.js\?v=/);
});

test('cli-ayuda: /demo help cuenta, ordena por fecha (terminal arriba) y admite antiguas / alfabético', async () => {
  await import('./assets/cli-ayuda.js');
  const A = globalThis.AdmiraCliAyuda;
  const h = A.demoHelp('', false).split('\n');
  assert.match(h[0], new RegExp('^Hay ' + A.CATALOGO.length + ' demos'));
  assert.match(h[1], /^11-10-2026 {2}\/demo terminal/);
  const old = A.demoHelp('antiguas', false).split('\n');
  assert.match(old[1], /07-10-2026/);
  const az = A.demoHelp('--orden alfabetico', true).split('\n');
  assert.match(az[0], /^There are \d+ demos · by name/);
  assert.match(az[1], /\/demo app/);
  assert.ok(A.RE_DEMO_HELP.test('/demo help antiguas') && A.RE_DEMO_HELP.test('/demo ayuda') && !A.RE_DEMO_HELP.test('/demo lista'));
});

test('cli-ayuda: ¿quisiste decir…? (transposición, prefijo, nada si no se parece)', async () => {
  const A = globalThis.AdmiraCliAyuda;
  assert.equal(A.sugerir('hlep', ['help', 'ayuda']), 'help');
  assert.equal(A.sugerir('interfase', ['interface', 'idioma']), 'interface');
  assert.equal(A.sugerir('interf', ['interface', 'idioma']), 'interface');
  assert.equal(A.sugerir('zzzz', ['help', 'demo']), '');
  assert.equal(globalThis.AdmiraInterface.run('/interface termnal 4', (t) => { assert.match(t, /Did you mean terminal|Quisiste decir terminal/); }), true);
});
