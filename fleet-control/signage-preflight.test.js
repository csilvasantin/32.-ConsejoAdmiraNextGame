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
  const ok = assessPreflight(machine, run, cap, { screen: 'demo', online: true, age_seconds: 3, showing_id: 'asset-1' }, { current: { id: 'asset-1', title: 'Canario', type: 'video' }, commandAck: { id: 'cmd-1', latencyMs: 120 } });
  assert.equal(ok.eligible, true);
  assert.equal(ok.screen.id, 'demo');
  assert.equal(ok.circuit, 'tech');
  assert.equal(ok.deployment.state, 'live');
  assert.equal(ok.deployment.currentContent.title, 'Canario');
  assert.equal(ok.deployment.commandAck.latencyMs, 120);

  const bad = assessPreflight(machine, { rc: 255, stderr: 'timeout' }, null, null);
  assert.equal(bad.eligible, false);
  assert.match(bad.blockers.join(' '), /Sin acceso remoto real/);
});

test('un screen configurado distinto al id canónico se avisa, ya no bloquea (FLT-1827)', () => {
  // El nombre del screen es cómo se llama esa pantalla en su circuito (el MBP14 emite como
  // «neo-lab» en «gracia»); no es una avería que impida arrancar.
  const r = assessPreflight(
    { id: 'machine-a', name: 'A', platform: 'macos' },
    { rc: 0, stdout: 'PF_READY=1\nPF_PLAYER=native\nPF_EXECUTOR=navegadores\nPF_SCREEN=legacy-screen\n' },
    { rc: 0, stdout: 'x'.repeat(400) },
    null
  );
  assert.equal(r.eligible, true);
  assert.equal(r.screen.matches, false);
  assert.match(r.warnings.join(' '), /legacy-screen/);
});

test('no confunde la pieza loc del heartbeat con el circuito', () => {
  const r = assessPreflight(
    { id: 'screen-a', name: 'A', platform: 'linux' },
    { rc: 0, stdout: 'PF_READY=1\nPF_PLAYER=web-browser\nPF_EXECUTOR=systemd-user\nPF_SCREEN=screen-a\n' },
    { rc: 0, stdout: 'x'.repeat(400) },
    { screen: 'screen-a', online: true, age_seconds: 2, loc: '#tech' }
  );
  assert.equal(r.circuit, '');
  assert.match(r.warnings.join(' '), /Sin circuito asignado/);
});

test('heartbeat viejo produce estado stale y no un falso live', () => {
  const r = assessPreflight(
    { id: 'screen-stale', name: 'Stale', platform: 'macos' },
    { rc: 0, stdout: 'PF_READY=1\nPF_PLAYER=native\nPF_EXECUTOR=navegadores\nPF_SCREEN=screen-stale\n' },
    { rc: 0, stdout: 'x'.repeat(400) },
    { screen: 'screen-stale', online: true, age_seconds: 180, showing_id: 'old-asset' },
    { current: { id: 'old-asset', title: 'Antiguo', type: 'image' } }
  );
  assert.equal(r.eligible, true);
  assert.equal(r.deployment.state, 'stale');
  assert.equal(r.deployment.heartbeatFresh, false);
  assert.match(r.warnings.join(' '), /stale/);
});

// FLT-1827 (5-sep-2026): un equipo humano (~/.fleet/no-ds) no es una pantalla bloqueada.
test('un equipo humano sale como «human», sin bloqueos de DS, y el screen distinto es aviso', () => {
  const P = require('./signage-preflight');
  const run = { rc: 0, stdout: 'PF_READY=1\nPF_HUMAN=1\nPF_OS=15.6\nPF_PLAYER=AdmiraSignageMac\nPF_VERSION=1.2\nPF_EXECUTOR=none\nPF_SCREEN=neo-lab\nPF_CIRCUIT=gracia\n' };
  const r = P.assessPreflight({ id: 'macbookpronegro14', name: 'MacBook Pro Negro 14' }, run, { rc: 1, stdout: '' }, null, {});
  assert.equal(r.human, true);
  assert.equal(r.deployment.state, 'human');
  assert.deepEqual(r.blockers, []);
  assert.ok(r.warnings.some((w) => /neo-lab/.test(w)), 'el screen distinto se avisa');
  assert.ok(!r.warnings.some((w) => /unifícalo/.test(w)), 'ya no se exige unificar');
});

test('la sonda declara PF_HUMAN según ~/.fleet/no-ds en macOS y Linux', () => {
  const P = require('./signage-preflight');
  const src = require('node:fs').readFileSync(__dirname + '/signage-preflight.js', 'utf8');
  assert.equal((src.match(/PF_HUMAN=%s/g) || []).length, 2);
  assert.match(src, /\.fleet\/no-ds/);
});
