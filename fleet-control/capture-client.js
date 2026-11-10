'use strict';
/* Cliente del agente de captura y el «info» sin awk anidado.
 *
 * La captura ya no escribe el buzón único ~/.fleet/capture.req. Cada petición
 * tiene su nonce en capture-queue/, así un cambio de pantalla no borra la
 * petición que todavía se está sirviendo. El texto de error sale con rc ≠ 0:
 * un rc 0 ya no puede ser un ERR_ disfrazado de éxito.
 */
const path = require('path');

const MAX_DISPLAY = 15;
const FRESH_SECONDS = 15;

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function parseDisplayIndex(arg) {
  if (arg == null || arg === '') return 0;
  if (typeof arg === 'boolean') throw new Error('pantalla no numérica');
  if (typeof arg === 'number') {
    if (!Number.isInteger(arg) || arg < 0 || arg > MAX_DISPLAY) throw new Error('pantalla fuera de rango');
    return arg;
  }
  const s = String(arg).trim();
  if (!/^\d+$/.test(s)) throw new Error('pantalla no numérica');
  const n = Number(s);
  if (n > MAX_DISPLAY) throw new Error('pantalla fuera de rango');
  return n;
}

function macosCaptureCommand(arg, frameOptions) {
  const dsp = parseDisplayIndex(arg);
  // v3 ignores unknown lines and returns the full JPEG; the hub then resizes
  // it. v4 reduces before base64/SSH and adds optimized=1 to avoid doing it twice.
  let settings = '';
  if (frameOptions) {
    if (frameOptions.scale != null && !Number.isFinite(frameOptions.scale)) throw new Error('scale no numérico');
    if (!Number.isFinite(frameOptions.quality)) throw new Error('q no numérico');
    if (frameOptions.maxWidth != null && !Number.isFinite(frameOptions.maxWidth)) throw new Error('maxWidth no numérico');
    settings = (frameOptions.scale == null ? '' : 'scale=' + Math.min(1, Math.max(0.1, frameOptions.scale)) + '\\n') +
      'q=' + Math.round(Math.min(95, Math.max(20, frameOptions.quality))) + '\\n' + (frameOptions.maxWidth == null ? '' : 'max_width=' + Math.round(Math.min(5120, Math.max(320, frameOptions.maxWidth))) + '\\n');
  }
  const liveRequest = frameOptions ? Buffer.from(('display=' + dsp + '\\n' + settings).replace(/\\n/g, '\n')).toString('base64') : '';
  // El nonce viaja en el nombre del fichero. Nadie más escribe ese par .req/.out.
  return [
    'D="$HOME/.fleet"',
    ...(frameOptions ? [
      // v4 optional CLI avoids the launchd capture context and its IPC/polling.
      // SSH can have a different Screen Recording context than launchd. Keep
      // CLI output private until it succeeds; otherwise let the graphical
      // agent answer through the queue without a second response on stdout.
      'if grep -q "^FRAME_CLI_VERSION = 1$" "$D/fleet-capture.py" 2>/dev/null; then ' +
        'if F=$(/usr/bin/python3 "$D/fleet-capture.py" --frame ' + shellQuote(liveRequest) + ' 2>/dev/null) && [ "$(printf \'%s\\n\' "$F" | head -1)" = OK ]; then printf \'%s\\n\' "$F"; exit 0; fi; unset F; fi'
    ] : []),
    'Q="$D/capture-queue"',
    'mkdir -p "$Q"',
    'N="fc-$(date +%s)-$$-$RANDOM"',
    'case "$N" in *[!A-Za-z0-9._-]*) echo ERR_NO_CAPTURE; exit 42;; esac',
    // Publish only complete requests: launchd may notice a newly opened file
    // before printf has finished writing its last settings line.
    'printf "display=' + dsp + '\\n' + settings + '" > "$Q/$N.tmp"',
    'mv "$Q/$N.tmp" "$Q/$N.req"',
    'for i in $(seq 1 240); do [ -s "$Q/$N.out" ] && break; sleep 0.05; done',
    'if [ ! -s "$Q/$N.out" ]; then echo ERR_NO_CAPTURE; echo "detail=el agente no contestó"; exit 42; fi',
    'cat "$Q/$N.out"',
    'st=$(head -1 "$Q/$N.out")',
    'rm -f "$Q/$N.req" "$Q/$N.out"',
    '[ "$st" = OK ] && exit 0',
    'exit 42'
  ].join('; ');
}

function parseCaptureStdout(stdout, nowSec, maxAgeSec) {
  const text = String(stdout || '').trim();
  const lines = text.split(/\r?\n/);
  const status = (lines[0] || '').trim();
  const detailLine = lines.find((l) => l.startsWith('detail='));
  const detail = detailLine ? detailLine.slice('detail='.length) : '';
  const capMatch = text.match(/captured_at=(\d+)/);
  const capturedAt = capMatch ? Number(capMatch[1]) : null;
  const maxAge = maxAgeSec == null ? FRESH_SECONDS : maxAgeSec;
  if (status !== 'OK') {
    const error = status || 'ERR_NO_CAPTURE';
    return { ok: false, error: error, detail: detail, capturedAt: capturedAt };
  }
  const b64 = (lines[1] || '').trim();
  if (capturedAt == null || !Number.isFinite(nowSec) || nowSec - capturedAt > maxAge || capturedAt - nowSec > 30) {
    return { ok: false, error: 'ERR_STALE_FRAME', detail: 'captured_at=' + capturedAt, capturedAt: capturedAt, b64: b64 };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 32) {
    return { ok: false, error: 'ERR_NO_CAPTURE', detail: detail || 'sin jpeg', capturedAt: capturedAt };
  }
  return { ok: true, b64: b64, capturedAt: capturedAt, detail: detail, optimized: lines.includes('optimized=1') };
}

function jpegFromB64(b64) {
  let buf;
  try { buf = Buffer.from(String(b64 || ''), 'base64'); } catch (e) { return null; }
  if (!buf || buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

function liveFrameStatus(parsed) {
  const error = parsed && parsed.error || 'ERR_NO_CAPTURE';
  const detail = String(parsed && parsed.detail || '');
  if (error === 'ERR_NO_SUCH_DISPLAY') {
    return { status: 404, body: { error: 'no_such_display', detail: detail || 'la máquina no tiene esa pantalla' } };
  }
  if (error === 'ERR_STALE_FRAME') {
    return { status: 424, body: { error: 'capture_stale', detail: detail || 'fotograma viejo' } };
  }
  if (error === 'ERR_CAPTURE_TRANSIENT' || error === 'ERR_CAPTURE_PAUSED' || /SCREEN_CAPTURE_FAILED/.test(detail)) {
    return { status: 424, body: { error: 'capture_transient', detail: detail || error } };
  }
  return { status: 424, body: { error: 'capture_failed_or_no_permission', detail: detail || error } };
}

function macosProbeCommand() {
  // La sonda usa la cola, no capture.req: un vigía no puede pisar el fotograma en vivo.
  return 'D="$HOME/.fleet"; Q="$D/capture-queue"; mkdir -p "$Q"; N="fv-$(date +%s)-$$-$RANDOM"; ' +
    'printf "display=0\\n" > "$Q/$N.req"; ' +
    'for i in $(seq 1 30); do [ -s "$Q/$N.out" ] && break; sleep 0.3; done; ' +
    'if [ "$(head -1 "$Q/$N.out" 2>/dev/null)" = OK ] && [ "$(sed -n 2p "$Q/$N.out" | head -c 4)" = "/9j/" ]; then echo __V_CAP__=1; else echo __V_CAP__=0; fi; ' +
    'v=$(tr -cd "0-9" < "$D/fleet-capture.version" 2>/dev/null | head -c 8); echo __V_AGENT__=${v:-none}; ' +
    'rm -f "$Q/$N.req" "$Q/$N.out"; ' +
    'echo __V_INPUT__=$(/usr/bin/python3 "$D/fleet-input.py" --displays 2>/dev/null | grep -c \'"ok": true\'); ' +
    'echo __V_AX__=$(/usr/bin/python3 -c \'import ctypes;print(int(bool(ctypes.cdll.LoadLibrary("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices").AXIsProcessTrusted())))\' 2>/dev/null || echo ?); ' +
    'echo __V_LOCK__=$(/usr/bin/python3 -c \'import Quartz;d=Quartz.CGSessionCopyCurrentDictionary() or {};print(int(bool(d.get("CGSSessionScreenIsLocked",False))))\' 2>/dev/null || echo ?)';
}

function sysinfoCommand(platform) {
  // awk SIEMPRE entre comillas simples. El programa no lleva \$ : eso es lo que
  // en el botón info del Mac acababa como «awk: syntax error».
  const disk = 'df -P / | awk \'NR==2{printf "💾 %s libre de %s\\n", $4, $2}\'';
  const cpu = 'ps -A -o %cpu= | awk \'{s+=$1} END{printf "📊 %.0f%% CPU\\n", s+0}\'';
  if (platform === 'linux') {
    return [
      'echo "🖥️ $(hostname)"',
      'echo "⏱️ $(uptime -p 2>/dev/null | sed \'s/^up //\')"',
      'echo "🔋 $(cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1 || echo n/a)"',
      disk,
      'free -h 2>/dev/null | awk \'NR==2{printf "🧠 %s/%s\\n", $3, $2}\'',
      cpu
    ].join('; ');
  }
  return [
    'echo "🖥️ $(scutil --get ComputerName 2>/dev/null || hostname)"',
    'echo "⏱️ $(uptime | sed \'s/.*up //\' | sed \'s/, *[0-9]* user.*//\')"',
    'echo "🔋 $(pmset -g batt 2>/dev/null | grep -o "[0-9]*%" | head -1 || echo n/a)"',
    disk,
    'echo "🔊 $(osascript -e \'output volume of (get volume settings)\' 2>/dev/null || echo n/a)%"',
    cpu
  ].join('; ');
}

function repairFiles(scriptDir) {
  return [
    path.join(scriptDir, 'deploy-capture-agent.sh'),
    path.join(scriptDir, 'fleet-capture.py'),
    path.join(scriptDir, 'display_geometry.py')
  ];
}

module.exports = {
  FRESH_SECONDS,
  shellQuote,
  parseDisplayIndex,
  macosCaptureCommand,
  parseCaptureStdout,
  jpegFromB64,
  liveFrameStatus,
  macosProbeCommand,
  sysinfoCommand,
  repairFiles
};
