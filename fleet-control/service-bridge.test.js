'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServiceBridge, BRIDGE_FAIL_STATUS } = require('./service-bridge');

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test('reenvía la orden de agente a bot.yokup con la PANEL_KEY, no con la sesión del navegador', async () => {
  const f = fakeFetch(200, { ok: true, id: 'q1' });
  const bridge = createServiceBridge({ env: { BOT_PANEL_KEY: 'pk' }, fetchFn: f });
  const out = await bridge.forward('/api/bridge/agent/control', JSON.stringify({ action: 'start', machine: 'macmini' }));
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, id: 'q1' });
  assert.equal(f.calls[0].url, 'https://bot.yokup.com/api/fleet/agent/control');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer pk');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { action: 'start', machine: 'macmini' });
});

test('el canal DS va a navegadores con su propio token', async () => {
  const f = fakeFetch(200, { ok: true, id: 'c1' });
  const bridge = createServiceBridge({ env: { NAV_TOKEN: 'nt' }, fetchFn: f });
  await bridge.forward('/api/bridge/nav/cmd', '{"deviceId":"local-macmini","action":"open-channel"}');
  assert.equal(f.calls[0].url, 'https://navegadores.yokup.com/api/cmd');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer nt');
});

test('la clave se lee del fichero junto al servidor si no está en env', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  fs.writeFileSync(path.join(dir, '.bot-panel-key'), 'desde-fichero\n');
  const f = fakeFetch(200, { ok: true });
  await createServiceBridge({ dir, env: {}, fetchFn: f }).forward('/api/bridge/send', '{"text":"hola"}');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer desde-fichero');
});

test('solo reenvía la lista cerrada de rutas', async () => {
  const f = fakeFetch(200, {});
  const bridge = createServiceBridge({ env: { BOT_PANEL_KEY: 'pk' }, fetchFn: f });
  assert.equal(bridge.handles('/api/bridge/send'), true);
  assert.equal(bridge.handles('/api/bridge/../status'), false);
  assert.equal(bridge.handles('/api/bridge/toString'), false);
  const out = await bridge.forward('/api/bridge/assign', '{}');
  assert.equal(out.status, 404);
  assert.equal(f.calls.length, 0);
});

test('sin clave no se llama a nadie y se dice qué servicio falta', async () => {
  const f = fakeFetch(200, {});
  const out = await createServiceBridge({ dir: '/nonexistent', env: {}, fetchFn: f }).forward('/api/bridge/nav/cmd', '{}');
  assert.equal(out.status, BRIDGE_FAIL_STATUS);
  assert.equal(out.body.error, 'bridge_secret_missing');
  assert.equal(out.body.service, 'nav');
  assert.equal(f.calls.length, 0);
});

test('un 401 del servicio es la clave del relay, no la sesión del operador', async () => {
  const out = await createServiceBridge({ env: { BOT_PANEL_KEY: 'mala' }, fetchFn: fakeFetch(401, { ok: false, error: 'unauthorized' }) })
    .forward('/api/bridge/send', '{"text":"x"}');
  assert.equal(out.status, BRIDGE_FAIL_STATUS);
  assert.equal(out.body.error, 'bridge_secret_rejected');
});

test('los fallos de arriba no salen como 5xx: el mesh reintentaría y duplicaría la orden', async () => {
  const caido = await createServiceBridge({ env: { BOT_PANEL_KEY: 'pk' }, fetchFn: fakeFetch(502, {}) })
    .forward('/api/bridge/agent/control', '{}');
  assert.ok(caido.status < 500);
  const sinRed = await createServiceBridge({ env: { BOT_PANEL_KEY: 'pk' }, fetchFn: async () => { throw new Error('ECONNRESET'); } })
    .forward('/api/bridge/agent/control', '{}');
  assert.ok(sinRed.status < 500);
  assert.equal(sinRed.body.error, 'upstream_unreachable');
});

test('cuerpo que no es un objeto JSON se rechaza antes de salir', async () => {
  const f = fakeFetch(200, {});
  const bridge = createServiceBridge({ env: { BOT_PANEL_KEY: 'pk' }, fetchFn: f });
  assert.equal((await bridge.forward('/api/bridge/send', 'no json')).status, 400);
  assert.equal((await bridge.forward('/api/bridge/send', '[1,2]')).status, 400);
  assert.equal(f.calls.length, 0);
});
