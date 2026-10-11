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
