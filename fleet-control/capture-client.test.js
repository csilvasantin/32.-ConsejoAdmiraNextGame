'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const C = require('./capture-client');

function assertPlist(file, home) {
  const py = `
import plistlib, sys
p = plistlib.load(open(sys.argv[1], "rb"))
args = p["ProgramArguments"]
expect = ["/usr/bin/python3", sys.argv[2] + "/.fleet/fleet-capture.py"]
assert isinstance(args, list) and args == expect, args
assert p["Label"] == "com.admiranext.fleet-capture"
assert p["RunAtLoad"] is True and p["KeepAlive"] is True
raw = open(sys.argv[1], "rb").read()
assert b"</array>" in raw and b"<array>" in raw
assert b"</key>\\n  <key>RunAtLoad" not in raw
`;
  const r = spawnSync('python3', ['-c', py, file, home], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
}

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

test('live opts reach the origin queue; legacy screenshots stay native and v3 is still accepted', () => {
  const cmd = C.macosCaptureCommand(1, { scale: 0.5, quality: 60, maxWidth: 1600 });
  assert.match(cmd, /display=1\\nscale=0\.5\\nq=60\\nmax_width=1600/);
  assert.match(cmd, /FRAME_CLI_VERSION = 1/);
  const encoded = cmd.match(/--frame '([^']+)'/)[1];
  assert.equal(Buffer.from(encoded, 'base64').toString(), 'display=1\nscale=0.5\nq=60\nmax_width=1600\n');
  assert.doesNotMatch(C.macosCaptureCommand(1), /scale=|q=|--frame/);
  assert.throws(() => C.macosCaptureCommand(0, { scale: '$(bad)', quality: 60 }), /numérico/);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(220)]).toString('base64');
  assert.equal(C.parseCaptureStdout('OK\n' + jpeg + '\ncaptured_at=1000\noptimized=1\n', 1001).optimized, true);
  assert.equal(C.parseCaptureStdout('OK\n' + jpeg + '\ncaptured_at=1000\n', 1001).optimized, false);
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
  assert.match(first, /instalado \(v4\)/);
  assertPlist(path.join(home, 'Library/LaunchAgents/com.admiranext.fleet-capture.plist'), home);
  assert.equal(fs.readFileSync(path.join(home, '.fleet/fleet-capture.version'), 'utf8'), '4\n');
  const log1 = fs.readFileSync(path.join(home, 'launchctl.log'), 'utf8');
  assert.equal(log1.split('\n').filter((l) => l.startsWith('bootstrap ')).length, 1);
  const second = run();
  assert.match(second, /ya instalado \(v4\)/);
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
  assert.match(forced, /instalado \(v4\)/);
  assert.match(fs.readFileSync(path.join(home, '.fleet', 'fleet-capture.py'), 'utf8'), /CAPTURE_VERSION = 4/);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  let code = 0;
  try {
    execFileSync('bash', [script, 'local'], { env: Object.assign({}, env, { HOME: bare, FAKE_GUI: '0' }), encoding: 'utf8' });
  } catch (e) { code = e.status; }
  assert.equal(code, 2);
  assert.equal(fs.existsSync(path.join(bare, '.fleet', 'fleet-capture.py')), false);
});

function writeFakeLs(bin) {
  fs.writeFileSync(path.join(bin, 'ls'), [
    '#!/bin/bash',
    'if [ "$1" = "-lO" ]; then',
    '  target="${@: -1}"',
    '  if [ -f "$HOME/uchg.list" ] && grep -Fxq "$target" "$HOME/uchg.list"; then echo "uchg $target"; exit 0; fi',
    '  echo "plain $target"; exit 0',
    'fi',
    'exec /bin/ls "$@"',
    ''
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'chflags'), [
    '#!/bin/bash',
    'echo "$*" >> "$HOME/chflags.log"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
}

test('un plist roto no se da por instalado y el generado anida array', () => {
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
  fs.mkdirSync(path.join(home, '.fleet'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Library/LaunchAgents'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fleet-capture.py'), path.join(home, '.fleet/fleet-capture.py'));
  fs.writeFileSync(path.join(home, '.fleet/fleet-capture.version'), '4\n');
  const plist = path.join(home, 'Library/LaunchAgents/com.admiranext.fleet-capture.plist');
  fs.writeFileSync(plist, '<plist><dict><key>ProgramArguments</key><array><string>/usr/bin/python3</string></key></dict></plist>\n');
  const out = execFileSync('bash', [path.join(__dirname, 'deploy-capture-agent.sh'), 'local'], { env, encoding: 'utf8' });
  assert.match(out, /instalado \(v4\)/);
  assert.doesNotMatch(out, /ya instalado/);
  assertPlist(plist, home);
});

test('si bootstrap falla se restaura el plist anterior y no se fija la versión', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-bin-'));
  fs.writeFileSync(path.join(bin, 'launchctl'), [
    '#!/bin/bash',
    'if [ "$1" = "print" ]; then [ "${FAKE_GUI:-}" = "1" ]; exit $?; fi',
    'printf "%s\\n" "$*" >> "$HOME/launchctl.log"',
    'if [ "$1" = bootstrap ] && [ "${FAKE_BOOT_FAIL:-}" = 1 ]; then',
    '  c=$(grep -c "^bootstrap " "$HOME/launchctl.log" || true)',
    '  if [ "$c" = 1 ]; then exit 1; fi',
    'fi',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  const env = Object.assign({}, process.env, {
    HOME: home, PATH: bin + path.delimiter + process.env.PATH, FAKE_GUI: '1', FAKE_BOOT_FAIL: '1'
  });
  fs.mkdirSync(path.join(home, '.fleet'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Library/LaunchAgents'), { recursive: true });
  const plist = path.join(home, 'Library/LaunchAgents/com.admiranext.fleet-capture.plist');
  fs.writeFileSync(plist, 'OLD-PLIST\n');
  fs.writeFileSync(path.join(home, '.fleet/fleet-capture.py'), 'OLD-PY\n');
  fs.writeFileSync(path.join(home, '.fleet/fleet-capture.version'), '1\n');
  let code = 0;
  let err = '';
  try {
    execFileSync('bash', [path.join(__dirname, 'deploy-capture-agent.sh'), 'local'], { env, encoding: 'utf8' });
  } catch (e) { code = e.status; err = e.stderr || ''; }
  assert.equal(code, 1);
  assert.match(err, /se restaura/);
  assert.equal(fs.readFileSync(plist, 'utf8'), 'OLD-PLIST\n');
  assert.equal(fs.readFileSync(path.join(home, '.fleet/fleet-capture.py'), 'utf8'), 'OLD-PY\n');
  assert.equal(fs.readFileSync(path.join(home, '.fleet/fleet-capture.version'), 'utf8'), '1\n');
  const log = fs.readFileSync(path.join(home, 'launchctl.log'), 'utf8');
  const boots = log.split('\n').filter((l) => l.startsWith('bootstrap '));
  assert.equal(boots.length, 2, log);
  assert.match(boots[0], /com\.admiranext\.fleet-capture\.plist$/);
  assert.match(boots[1], /com\.admiranext\.fleet-capture\.plist$/);
});

test('preflight ve uchg y no llama a chflags', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cap-'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-bin-'));
  fs.writeFileSync(path.join(bin, 'launchctl'), [
    '#!/bin/bash',
    'if [ "$1" = "print" ]; then [ "${FAKE_GUI:-}" = "1" ]; exit $?; fi',
    'printf "%s\\n" "$*" >> "$HOME/launchctl.log"',
    'exit 0',
    ''
  ].join('\n'), { mode: 0o755 });
  writeFakeLs(bin);
  const env = Object.assign({}, process.env, { HOME: home, PATH: bin + path.delimiter + process.env.PATH, FAKE_GUI: '1' });
  fs.mkdirSync(path.join(home, '.fleet'), { recursive: true });
  const sh = path.join(home, '.fleet/fleet-capture.sh');
  fs.writeFileSync(sh, 'OLD-BASH\n');
  fs.writeFileSync(path.join(home, 'uchg.list'), sh + '\n');
  const out = execFileSync('bash', [path.join(__dirname, 'deploy-capture-agent.sh'), 'local'], { env, encoding: 'utf8' });
  const err = execFileSync('bash', [path.join(__dirname, 'deploy-capture-agent.sh'), 'local'], { env, encoding: 'utf8' });
  assert.match(out, /instalado \(v4\)/);
  assert.match(err, /ya instalado/);
  assert.equal(fs.readFileSync(sh, 'utf8'), 'OLD-BASH\n');
  assert.equal(fs.existsSync(path.join(home, 'chflags.log')), false);
  const plist = path.join(home, 'Library/LaunchAgents/com.admiranext.fleet-capture.plist');
  fs.writeFileSync(path.join(home, 'uchg.list'), plist + '\n');
  fs.writeFileSync(path.join(home, '.fleet/fleet-capture.py'), 'OLD\n');
  fs.writeFileSync(path.join(home, '.fleet/fleet-capture.version'), '1\n');
  let code = 0;
  let stderr = '';
  try {
    execFileSync('bash', [path.join(__dirname, 'deploy-capture-agent.sh'), 'local'], { env, encoding: 'utf8' });
  } catch (e) { code = e.status; stderr = e.stderr || ''; }
  assert.equal(code, 3, stderr);
  assert.match(stderr, /uchg/);
  assert.equal(fs.readFileSync(path.join(home, '.fleet/fleet-capture.version'), 'utf8'), '1\n');
  const log = fs.readFileSync(path.join(home, 'launchctl.log'), 'utf8');
  assert.equal(log.split('\n').filter((l) => l.startsWith('bootstrap ')).length, 1);
  assert.equal(fs.existsSync(path.join(home, 'chflags.log')), false);
});
