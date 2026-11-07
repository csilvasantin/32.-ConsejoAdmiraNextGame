'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const C = require('./capture-client');

test('cada captura tiene su nonce y un índice inválido no cae en la principal', () => {
  const cmd = C.macosCaptureCommand(2);
  assert.match(cmd, /capture-queue/);
  assert.match(cmd, /display=2/);
  assert.doesNotMatch(cmd, /capture\.req/);
  assert.equal(C.macosCaptureCommand(0).includes('display=0'), true);
  assert.throws(() => C.macosCaptureCommand('foo'), /no numérica/);
  assert.throws(() => C.macosCaptureCommand('2abc'), /no numérica/);
  assert.throws(() => C.macosCaptureCommand(99), /rango/);
});

test('frescura, pantalla inexistente y fallo transitorio no se leen como permiso ni como jpeg', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(220)]).toString('base64');
  const fresh = C.parseCaptureStdout('OK\n' + jpeg + '\ncaptured_at=1000\ndisplay=1\n', 1004);
  assert.equal(fresh.ok, true);
  assert.ok(C.jpegFromB64(fresh.b64));
  const stale = C.parseCaptureStdout('OK\n' + jpeg + '\ncaptured_at=1000\n', 1030);
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'ERR_STALE_FRAME');
  assert.equal(C.liveFrameStatus(stale).body.error, 'capture_stale');
  const bad = C.parseCaptureStdout('ERR_NO_SUCH_DISPLAY\ncaptured_at=1000\ndetail=índice\n', 1001);
  assert.equal(C.liveFrameStatus(bad).status, 404);
  const transient = C.parseCaptureStdout('ERR_CAPTURE_TRANSIENT\ncaptured_at=1000\ndetail=SCREEN_CAPTURE_FAILED rc=1 could not create image from display\n', 1001);
  assert.equal(C.liveFrameStatus(transient).body.error, 'capture_transient');
  const paused = C.parseCaptureStdout('ERR_CAPTURE_PAUSED\ndetail=RuntimeError\n', 1001);
  assert.equal(C.liveFrameStatus(paused).body.error, 'capture_transient');
  assert.equal(C.jpegFromB64('aGVsbG8='), null);
});

test('el info no mete un awk con barras invertidas y sobrevive al bash -lc doble', () => {
  const cmd = C.sysinfoCommand('macos');
  assert.doesNotMatch(cmd, /\\\$/);
  assert.match(cmd, /awk 'NR==2/);
  const wrapped = 'bash -lc ' + C.shellQuote(cmd);
  const out = execFileSync('bash', ['-lc', wrapped], { encoding: 'utf8' });
  assert.match(out, /libre de/);
  assert.match(out, /CPU/);
  assert.doesNotMatch(out, /awk:/);
});

test('la reparación lleva el python junto al instalador y no el buzón viejo', () => {
  const files = C.repairFiles(__dirname).map((f) => path.basename(f));
  assert.deepEqual(files, ['deploy-capture-agent.sh', 'fleet-capture.py', 'display_geometry.py']);
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(server, /repairFiles\(DIR\)/);
  assert.doesNotMatch(server, /bash', \['-s', '--', 'local'\]/);
});

test('el instalador es idempotente, no pisa una versión más nueva y no arranca sin sesión gráfica', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-bin-'));
  fs.writeFileSync(path.join(bin, 'launchctl'), [
    '#!/bin/bash',
    'if [ "$1" = "print" ]; then [ "${FAKE_GUI:-}" = "1" ]; exit $?; fi',
    'printf "%s\\n" "$*" >> "$HOME/launchctl.log"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  const env = Object.assign({}, process.env, { HOME: home, PATH: bin + path.delimiter + process.env.PATH, FAKE_GUI: '1' });
  delete env.FLEET_CAPTURE_FORCE;
  const script = path.join(__dirname, 'deploy-capture-agent.sh');
  const run = (extra) => execFileSync('bash', [script, 'local'], { env: Object.assign({}, env, extra || {}), encoding: 'utf8' });
  const first = run();
  assert.match(first, /instalado \(v3\)/);
  const log1 = fs.readFileSync(path.join(home, 'launchctl.log'), 'utf8');
  assert.equal(log1.split('\n').filter((l) => l.startsWith('bootstrap ')).length, 1);
  const second = run();
  assert.match(second, /ya instalado \(v3\)/);
  const log2 = fs.readFileSync(path.join(home, 'launchctl.log'), 'utf8');
  assert.equal(log2, log1);
  fs.writeFileSync(path.join(home, '.fleet', 'fleet-capture.version'), '9\n');
  fs.writeFileSync(path.join(home, '.fleet', 'fleet-capture.py'), 'NEWER\n');
  const kept = run();
  assert.match(kept, /no se pisa/);
  assert.equal(fs.readFileSync(path.join(home, '.fleet', 'fleet-capture.py'), 'utf8'), 'NEWER\n');
  const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  fs.mkdirSync(path.join(solo, '.fleet'), { recursive: true });
  fs.writeFileSync(path.join(solo, '.fleet', 'fleet-capture.py'), 'CAPTURE_VERSION = 9\n# arreglo posterior\n');
  const respeta = execFileSync('bash', [script, 'local'], { env: Object.assign({}, env, { HOME: solo }), encoding: 'utf8' });
  assert.match(respeta, /no se pisa/);
  assert.match(fs.readFileSync(path.join(solo, '.fleet', 'fleet-capture.py'), 'utf8'), /arreglo posterior/);
  const forced = run({ FLEET_CAPTURE_FORCE: '1' });
  assert.match(forced, /instalado \(v3\)/);
  assert.match(fs.readFileSync(path.join(home, '.fleet', 'fleet-capture.py'), 'utf8'), /CAPTURE_VERSION = 3/);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  let code = 0;
  try {
    execFileSync('bash', [script, 'local'], { env: Object.assign({}, env, { HOME: bare, FAKE_GUI: '0' }), encoding: 'utf8' });
  } catch (e) { code = e.status; }
  assert.equal(code, 2);
  assert.equal(fs.existsSync(path.join(bare, '.fleet', 'fleet-capture.py')), false);
});
