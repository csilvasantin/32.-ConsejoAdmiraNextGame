'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalScreenId, preflightCommand, parseProbe, assessPreflight } = require('./signage-preflight');

test('machine y screen comparten un id canónico estable', () => {
  assert.equal(canonicalScreenId({ id: 'MacBook Pro Negro 14' }), 'macbook-pro-negro-14');
  assert.equal(canonicalScreenId({ id: 'fallback', screen: 'DGX_Spark' }), 'dgx_spark');
});

test('genera probes específicos para macOS, Linux y Windows', () => {
  assert.match(preflightCommand({ platform: 'macos' }), /AdmiraSignageMac/);
  assert.match(preflightCommand({ platform: 'linux', signage: { start: 'systemctl --user start admira' } }), /configured-launcher/);
  assert.match(preflightCommand({ platform: 'windows' }), /powershell\.exe.*EncodedCommand/);
});

test('parsea valores con espacios sin perderlos', () => {
  const p = parseProbe('PF_READY=1\nPF_VERSION=Google Chrome 150.0\nPF_SCREEN=ds-demo\n');
  assert.equal(p.ready, '1');
  assert.equal(p.version, 'Google Chrome 150.0');
  assert.equal(p.screen, 'ds-demo');
});

test('solo declara elegible con acceso, player y captura reales', () => {
  const machine = { id: 'demo', name: 'Demo', platform: 'linux' };
  const run = { rc: 0, stdout: 'PF_READY=1\nPF_PLAYER=web-browser\nPF_VERSION=Chromium 150\nPF_EXECUTOR=systemd-user\nPF_SCREEN=demo\nPF_CIRCUIT=tech\n' };
  const cap = { rc: 0, stdout: 'x'.repeat(400) };
  const ok = assessPreflight(machine, run, cap, { screen: 'demo', online: true, age_seconds: 3 });
  assert.equal(ok.eligible, true);
  assert.equal(ok.screen.id, 'demo');
  assert.equal(ok.circuit, 'tech');

  const bad = assessPreflight(machine, { rc: 255, stderr: 'timeout' }, null, null);
  assert.equal(bad.eligible, false);
  assert.match(bad.blockers.join(' '), /Sin acceso remoto real/);
});

test('bloquea un screen configurado distinto al id canónico', () => {
  const r = assessPreflight(
    { id: 'machine-a', name: 'A', platform: 'macos' },
    { rc: 0, stdout: 'PF_READY=1\nPF_PLAYER=native\nPF_EXECUTOR=navegadores\nPF_SCREEN=legacy-screen\n' },
    { rc: 0, stdout: 'x'.repeat(400) },
    null
  );
  assert.equal(r.eligible, false);
  assert.match(r.blockers.join(' '), /unifícalo/);
});
