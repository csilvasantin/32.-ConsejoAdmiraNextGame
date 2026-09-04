#!/usr/bin/env node
/* ============================================================================
 * FleetControl — control de la flota de Macs desde admira.live
 * ----------------------------------------------------------------------------
 * Servidor hub (corre en el MacMini). Ejecuta comandos/acciones en cada Mac:
 *   - MacMini  → local (bash)
 *   - 16 / 14  → por SSH (el MacMini ya tiene acceso sin contraseña)
 *
 * Se expone por el Tailscale funnel en una ruta NUEVA (/fleet → 127.0.0.1:9140),
 * sin tocar el resto del funnel. La web (admira.live/fleet/) lo llama con un
 * TOKEN fuerte; toda ejecución exige token. CORS solo para admira.live.
 *
 * Sin dependencias (solo Node http + child_process). Arrancar:
 *   FLEET_TOKEN=<token> FLEET_SESSION_SECRET=<shared-secret> FLEET_PORT=9140 node fleet-control/server.js
 * El token también se lee de fleet-control/.fleet-token si no hay env. El
 * secreto de sesión admite FLEET_SESSION_SECRET_FILE y, por defecto,
 * ~/.fleet/fleet-session-secret (fichero regular propio y modo 0600).
 * AUTH_EDGE_SHARED_SECRET admite el mismo patrón de fichero seguro.
 * ========================================================================== */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { macOpenCommand, linuxOpenCommand, windowsOpenCommand } = require('./open-action');
const { canonicalScreenId, preflightCommand, assessPreflight } = require('./signage-preflight');
const { CALLBACK_URI:AUTH_CALLBACK_URI, PUBLIC_ORIGIN:AUTH_PUBLIC_ORIGIN, createChallengeStore, handoffOriginAllowed, parseGoogleCallback, safeReturnPath } = require('./auth-redirect');
const { sessionMutationError } = require('./session-csrf');
const { ACTIVE, REVOKED, UNAVAILABLE, createSessionRegistry, logoutEndpointPolicy, sessionEndpointPolicy } = require('./session-registry');
const { createSessionCodec, deriveSessionSecret, loadAuthEdgeSecretMaterial, loadSessionSecretMaterial } = require('./session-token');

const DIR = __dirname;
const PORT = parseInt(process.env.FLEET_PORT || '9140', 10);
const BASE = '/fleet';                       // prefijo de ruta (lo pone el funnel)
const ALLOW_ORIGINS = ['https://www.admira.live', 'https://admira.live', 'https://macmini.tail48b61c.ts.net'];
const RELAY_ID = String(process.env.FLEET_RELAY_ID || os.hostname() || 'fleet-relay').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
const RELAY_LABEL = String(process.env.FLEET_RELAY_LABEL || os.hostname() || RELAY_ID);

// Endurecimiento (S1-B / S2 / S3). El funnel es público y oculta la IP real
// del cliente (todo llega como 127.0.0.1), así que NO hacemos lockout por IP
// —bloquearía al propio operador—: usamos tarpit creciente en fallos de auth,
// un techo anti-flood y log de auditoría en fleet-control/audit.log.
const RL_WINDOW_MS = 60000;
const RL_MAX = 300;                          // techo de peticiones/min (anti-flood, no afecta a uso normal)
const TARPIT_MAX_MS = 2000;                  // retardo máximo por fallo de auth
const AUDIT_FILE = path.join(DIR, 'audit.log');

function loadJSON(f, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return fallback; } }
const FLEET = loadJSON('fleet.json', { machines: [] });

// Token con rotación en caliente: env manda; si no, se relee .fleet-token
// (cache 5s) para poder rotar sin reiniciar el servicio.
let _tokCache = '';
let _tokAt = 0;
function currentToken() {
  if (process.env.FLEET_TOKEN) return process.env.FLEET_TOKEN.trim();
  const now = Date.now();
  if (now - _tokAt > 5000) {
    try { _tokCache = fs.readFileSync(path.join(DIR, '.fleet-token'), 'utf8').trim(); } catch (e) { _tokCache = ''; }
    _tokAt = now;
  }
  return _tokCache;
}
const TOKEN = currentToken();

/* ----- Auth por Google SSO (opción B) -------------------------------------- *
 * El backend confía en la identidad de Google del usuario (misma allowlist que
 * auth-gate.js). Intercambia el ID token de Google (verificado por el propio
 * Google vía tokeninfo) por una SESIÓN propia firmada con HMAC (12h), para no
 * re-verificar con Google en cada llamada ni depender del optoken/X-Fleet-Token. */
const GOOGLE_CLIENT_ID = '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';

// Quién accede a los EQUIPOS (/control) = los "superusers" gestionados en
// admira.live/usuarios.html. La fuente de verdad es el worker admira-whitelist;
// aquí se cachea (60s) con fallback a los owners por si el worker no responde.
const WL_API = 'https://admira-whitelist.csilvasantin.workers.dev';
const FALLBACK_ALLOW = ['csilva@admira.com', 'csilvasantin@gmail.com'];
let SUPERS = new Set(FALLBACK_ALLOW);
let _superTs = 0;
async function refreshSupers() {
  try {
    const r = await fetch(WL_API + '/list', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const d = await r.json();
    if (Array.isArray(d.superusers) && d.superusers.length) {
      SUPERS = new Set(d.superusers.map(e => String(e).toLowerCase()));
      _superTs = Date.now();
    }
  } catch (e) { /* mantiene la última lista conocida / fallback */ }
}
refreshSupers();
setInterval(refreshSupers, 60 * 1000).unref?.();

const SESSION_TTL_MS = 12 * 3600 * 1000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIE = '__Host-fleet_session';
const CHALLENGE_COOKIE = '__Host-fleet_challenge';
const AUTH_HANDOFF_CONSUME = 'https://www.admira.live/auth/handoff/consume';
const AUTH_SESSION_API = 'https://www.admira.live/auth/session/';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const _challengeStore = createChallengeStore({ ttlMs:CHALLENGE_TTL_MS });
// La sesion no vive en memoria ni en un fichero distinto por relay. Ambos hubs
// verifican el mismo token autocontenido con FLEET_SESSION_SECRET. No se deriva
// del token de maquinas: ambas credenciales mantienen dominios de riesgo distintos.
// Así un restart o un cambio de relay no invalida la cookie del navegador.
const SESSION_SECRET_MATERIAL = loadSessionSecretMaterial();
const _sessionCodec = createSessionCodec({secret:deriveSessionSecret(SESSION_SECRET_MATERIAL), ttlMs:SESSION_TTL_MS});
const AUTH_EDGE_SHARED_SECRET = loadAuthEdgeSecretMaterial();
const _sessionRegistry = createSessionRegistry({api:AUTH_SESSION_API, secret:AUTH_EDGE_SHARED_SECRET});

// Verifica un ID token de Google con el endpoint tokeninfo (Google valida la
// firma). Devuelve el email allowlisted o null.
async function verifyGoogleCredential(cred, expectedNonce) {
  if (!cred || typeof cred !== 'string') return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({id_token:cred}).toString(), signal:AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const now = Date.now();
    if (!GOOGLE_ISSUERS.has(String(d.iss || ''))) return null;
    if (d.aud !== GOOGLE_CLIENT_ID) return null;            // token de OTRA app → no
    if (!Number.isFinite(Number(d.exp)) || Number(d.exp) * 1000 <= now) return null;
    const iat = Number(d.iat) * 1000;
    if (!Number.isFinite(iat) || iat > now + 5 * 60 * 1000 || iat < now - 2 * 60 * 60 * 1000) return null;
    if (String(d.email_verified) !== 'true') return null;
    if (!expectedNonce || String(d.nonce || '') !== expectedNonce) return null;
    const email = String(d.email || '').toLowerCase();
    if (Date.now() - _superTs > 60000) await refreshSupers();  // lista fresca al emitir sesión
    if (!SUPERS.has(email)) return null;                    // no superuser → no
    return email;
  } catch (e) { return null; }
}
async function mintSession(email) {
  const token=_sessionCodec.mint(email), session=_sessionCodec.verify(token);
  return await _sessionRegistry.register(session) === ACTIVE ? token : null;
}
function verifySessionLocally(token) {
  return _sessionCodec.verify(token);
}
async function sessionState(token) {
  const session=verifySessionLocally(token);
  if(!session)return {state:REVOKED,session:null};
  if(!SUPERS.has(session.email))return {state:REVOKED,session:null}; // degradar corta /control en ≤60s
  return {state:await _sessionRegistry.check(session),session};
}
function parseCookies(req) {
  const out = {};
  for (const item of String(req.headers.cookie || '').split(';')) { const at=item.indexOf('='); if(at<1)continue; try{out[item.slice(0,at).trim()]=decodeURIComponent(item.slice(at+1).trim());}catch(e){} }
  return out;
}
function sessionFromReq(req) {
  const h = String(req.headers['authorization'] || '');
  return (h.startsWith('Bearer ') ? h.slice(7).trim() : '') || String(req.headers['x-fleet-session'] || '') || parseCookies(req)[SESSION_COOKIE] || '';
}
function appendSetCookie(res,value){const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',old?(Array.isArray(old)?old.concat(value):[old,value]):value);}
function setSessionCookie(res, token, maxAge=Math.floor(SESSION_TTL_MS/1000)) { appendSetCookie(res,`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`); }
function clearSessionCookie(res) { appendSetCookie(res,`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`); }
function setChallengeCookie(res, state, maxAge=Math.floor(CHALLENGE_TTL_MS/1000), sameSite='Lax') { appendSetCookie(res,`${CHALLENGE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`); }
function clearChallengeCookie(res, sameSite='Lax') { appendSetCookie(res,`${CHALLENGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=${sameSite}`); }
function issueChallenge(returnTo='/', flow='popup') {
  return _challengeStore.issue(returnTo,flow);
}
function consumeChallenge(req,state,flow='popup') {
  return _challengeStore.consume(req.headers.cookie,state,flow);
}

/* ----- ejecutar en una máquina (local o ssh) -------------------------------- */
function machineById(id) { return FLEET.machines.find(m => m.id === id); }
function machineKey(v) { return String(v || '').toLowerCase().split('.')[0].replace(/[^a-z0-9]/g, ''); }
function isRelayLocal(machine) {
  const here = new Set([machineKey(RELAY_ID), machineKey(RELAY_LABEL), machineKey(os.hostname())]);
  const there = [machine && machine.id, machine && machine.name, machine && machine.host].map(machineKey);
  return there.some(k => k && here.has(k));
}

// Idempotencia distribuida anclada en el EQUIPO OBJETIVO. Dos relays distintos
// pueden intentar la misma orden después de un timeout; el mkdir atómico y el
// recibo .done viven en la máquina destino, no en el relay, por lo que impiden
// ejecutar dos veces apagar/abrir/cerrar/arrancar aunque cambie la ruta.
function commandIdFromReq(req) {
  const raw = String(req.headers['x-fleet-command-id'] || '').trim();
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(raw) ? raw : '';
}
function idempotentCommand(machine, cmd, commandId) {
  if (!commandId || platOf(machine) === 'windows') return cmd;
  const id = commandId.replace(/[^a-zA-Z0-9._:-]/g, '-');
  return [
    'set +e',
    '_admira_dir="$HOME/.admira-fleet/commands"',
    'mkdir -p "$_admira_dir"',
    '_admira_done="$_admira_dir/' + id + '.done"',
    '_admira_lock="$_admira_dir/' + id + '.lock"',
    'if [ -f "$_admira_done" ]; then _admira_rc=$(cat "$_admira_done" 2>/dev/null || echo 0); echo "__ADMIRA_DUPLICATE_COMPLETED__ ' + id + '"; exit "$_admira_rc"; fi',
    'if ! mkdir "$_admira_lock" 2>/dev/null; then echo "__ADMIRA_DUPLICATE_PENDING__ ' + id + '"; exit 75; fi',
    'trap \'rmdir "$_admira_lock" 2>/dev/null\' EXIT',
    'bash -lc ' + sh(cmd),
    '_admira_rc=$?',
    'printf "%s\\n" "$_admira_rc" > "$_admira_done"',
    'exit "$_admira_rc"'
  ].join('; ');
}

function run(machine, cmd, timeoutMs) {
  return new Promise((resolve) => {
    timeoutMs = timeoutMs || 25000;
    let bin, args;
    if (isRelayLocal(machine)) {
      bin = 'bash'; args = ['-lc', cmd];
    } else {
      const target = (machine.user || 'csilvasantin') + '@' + machine.host;
      bin = 'ssh';
      // ConnectTimeout se ajusta al presupuesto (status usa un timeout corto para
      // que el sondeo total quede rápido); por defecto 8s.
      const ct = Math.max(2, Math.min(8, Math.floor((timeoutMs || 25000) / 1000) - 1));
      args = ['-o', 'ConnectTimeout=' + ct, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', target, cmd];
    }
    const t0 = Date.now();
    let out = '', err = '', done = false;
    const ch = spawn(bin, args, { env: process.env });
    const kill = setTimeout(() => { if (!done) { done = true; try { ch.kill('SIGKILL'); } catch (e) {} resolve({ rc: 124, stdout: out, stderr: (err + '\n[timeout]').trim(), ms: Date.now() - t0 }); } }, timeoutMs);
    ch.stdout.on('data', d => { out += d; if (out.length > 4000000) out = out.slice(-4000000); });
    ch.stderr.on('data', d => { err += d; if (err.length > 40000) err = err.slice(-40000); });
    ch.on('error', e => { if (!done) { done = true; clearTimeout(kill); resolve({ rc: 127, stdout: out, stderr: String(e.message || e), ms: Date.now() - t0 }); } });
    ch.on('close', code => { if (!done) { done = true; clearTimeout(kill); resolve({ rc: code == null ? -1 : code, stdout: out.trim(), stderr: err.trim(), ms: Date.now() - t0 }); } });
  });
}

/* ----- acciones predefinidas (seguras, mapeadas a comandos) ------------------ *
 * Cada acción es {macos, linux}: el despachador elige por platform de la máquina
 * (platOf). Las funciones reciben (arg, m) — las variantes Linux usan m.signage
 * para enchufar el player propio. Digital Signage y control remoto de la flota
 * funcionan en ambos SO (macOS y Linux/Ubuntu de escritorio). */
function sh(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; } // single-quote safe
function psCommand(script) { return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(String(script), 'utf16le').toString('base64'); }
// tag(s) del operador: sin acentos (música→musica), minúsculas, anidable con
// comas/+ ("musica,vertical" = AND en el canal). Solo slug chars (shell-safe).
function cleanTag(v) { return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_,+-]/g, ''); }
function platOf(m) { const p = String((m && m.platform) || 'macos').toLowerCase(); return p.startsWith('win') ? 'windows' : (p.startsWith('lin') ? 'linux' : 'macos'); }
function winPS(script) {
  return 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' +
    Buffer.from("$ProgressPreference='SilentlyContinue'; " + script, 'utf16le').toString('base64');
}

// El estado del player se mide en el equipo, no se deduce del último botón
// pulsado en el navegador. Reconoce tanto la app nativa como el kiosko dedicado.
// ── READINESS DE CONTROL (Neo·MBP14, 3-sep-2026, DEC-mtl6hbywm54t) ──────────
// Carlos: «no podemos irnos sin controlar desde aquí todos los equipos». Hasta hoy
// /status solo decía online/offline; que el hub llegue por SSH no significa que
// pueda VER (fleet-capture.sh) ni TOCAR (fleet-input.py + pantalla desbloqueada).
// El inventario del 3-sep lo demostró: Pro16 online pero bloqueada → 0 pantallas,
// Azul online pero sin fleet-input.py. Tres marcadores más en la MISMA sonda SSH,
// sin ronda extra. `locked` sale de Quartz (CGSSessionScreenIsLocked); si python
// no responde en la caja, queda a «?» y no se inventa.
const CONTROL_PROBE_MACOS =
  '[ -f "$HOME/.fleet/fleet-capture.sh" ] && echo __FLEET_CAPTURE__=1 || echo __FLEET_CAPTURE__=0; ' +
  '[ -f "$HOME/.fleet/fleet-input.py" ] && echo __FLEET_INPUT__=1 || echo __FLEET_INPUT__=0; ' +
  'echo __FLEET_LOCKED__=$(/usr/bin/python3 -c "import Quartz;d=Quartz.CGSessionCopyCurrentDictionary() or {};print(int(bool(d.get(\"CGSSessionScreenIsLocked\",0))))" 2>/dev/null || echo ?); ';
// Linux (4-sep-2026, misión 0052): el inyector es fleet-input-linux.py (xdotool/ydotool) y
// el bloqueo sale de loginctl (LockedHint); sin sesión gráfica queda «?».
const CONTROL_PROBE_LINUX =
  '[ -f "$HOME/.fleet/fleet-capture-linux.sh" ] && echo __FLEET_CAPTURE__=1 || echo __FLEET_CAPTURE__=0; ' +
  '[ -f "$HOME/.fleet/fleet-input-linux.py" ] && echo __FLEET_INPUT__=1 || echo __FLEET_INPUT__=0; ' +
  'L=$(loginctl show-session $(loginctl list-sessions --no-legend 2>/dev/null | awk "NR==1{print \\$1}") -p LockedHint 2>/dev/null | cut -d= -f2); ' +
  'case "$L" in yes) echo __FLEET_LOCKED__=1;; no) echo __FLEET_LOCKED__=0;; *) echo __FLEET_LOCKED__=?;; esac; ';
// Windows (PowerShell como shell SSH): captura = FleetTrigger.exe, entrada = fleet-input.ps1.
const CONTROL_PROBE_WINDOWS =
  'if (Test-Path "$env:USERPROFILE\\.fleet\\FleetTrigger.exe") { "__FLEET_CAPTURE__=1" } else { "__FLEET_CAPTURE__=0" }; ' +
  'if (Test-Path "$env:USERPROFILE\\.fleet\\fleet-input.ps1") { "__FLEET_INPUT__=1" } else { "__FLEET_INPUT__=0" }; ' +
  '"__FLEET_LOCKED__=?"; ';
function parseControlSignals(stdout, online) {
  const pick = (k) => { const mm = String(stdout || '').match(new RegExp('__FLEET_' + k + '__=([01?])')); return mm ? mm[1] : null; };
  const tri = (v) => v === '1' ? true : (v === '0' ? false : null);
  const capture = tri(pick('CAPTURE')), input = tri(pick('INPUT')), locked = tri(pick('LOCKED'));
  const ready = !!online && capture === true && input === true && locked === false;
  const why = !online ? 'sin ssh desde el hub'
    : capture === false ? 'sin agente de captura'
    : input === false ? 'sin inyector de entrada'
    : locked === true ? 'pantalla bloqueada'
    : (capture === null || input === null || locked === null) ? 'sonda incompleta'
    : 'ver + tocar';
  return { capture, input, locked, ready, why };
}
function stripControlMarkers(txt) {
  return String(txt || '').replace(/^__FLEET_(CAPTURE|INPUT|LOCKED)__=[01?]\s*$/gm, '').trim();
}

function statusProbe(m) {
  const plat = platOf(m);
  // cmd.exe nativo y rápido: Get-CimInstance tardaba >4,5s en AsusFold y el
  // timeout lo marcaba offline. El estado DS de Windows se completa por latido.
  if (plat === 'windows') return 'echo ONLINE & hostname & echo __FLEET_SIGNAGE__=0';
  const base = 'echo ONLINE; scutil --get ComputerName 2>/dev/null || hostname; ';
  if (plat === 'macos') return base +
    "if pgrep -x AdmiraSignageMac >/dev/null 2>&1 || pgrep -f '[.]canal-kiosk' >/dev/null 2>&1; then echo __FLEET_SIGNAGE__=1; else echo __FLEET_SIGNAGE__=0; fi; " +
    CONTROL_PROBE_MACOS;
  if (plat === 'linux') return base + CONTROL_PROBE_LINUX + LGUI +
    "if systemctl --user is-active --quiet admira-signage.service 2>/dev/null || pgrep -f '[a]dmira-signage' >/dev/null 2>&1 || pgrep -f '[.]canal-kiosk' >/dev/null 2>&1; then echo __FLEET_SIGNAGE__=1; else echo __FLEET_SIGNAGE__=0; fi";
  if (plat === 'windows') return base + CONTROL_PROBE_WINDOWS;
  return base;
}

// Prefijo para comandos gráficos por SSH en Linux: una sesión SSH no-interactiva
// no hereda DISPLAY / XDG_RUNTIME_DIR, así que los reconstruimos (X11 :0 y el
// runtime del usuario) para que pactl / xset / grim / notify-send encuentren la
// sesión gráfica activa. Best-effort: si la caja no tiene GUI, la acción lo dirá.
const LGUI = 'export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"; export DISPLAY="${DISPLAY:-:0}"; ';

const ACTIONS = {
  sysinfo: {
    macos: () =>
      'echo "🖥️ $(scutil --get ComputerName 2>/dev/null || hostname)"; ' +
      'echo "⏱️ $(uptime | sed "s/.*up //;s/, [0-9]* user.*//")"; ' +
      'echo "🔋 $(pmset -g batt 2>/dev/null | grep -o "[0-9]*%" | head -1 || echo n/a)"; ' +
      'echo "💾 $(df -h / | awk "NR==2{print \\$4\\" libre de \\"\\$2}")"; ' +
      'echo "🔊 $(osascript -e "output volume of (get volume settings)" 2>/dev/null)%"; ' +
      'echo "📊 $(ps -A -o %cpu | awk "{s+=\\$1} END{printf \\"%.0f%% CPU\\", s}")"',
    linux: () =>
      'echo "🖥️ $(hostname)"; ' +
      'echo "⏱️ $(uptime -p 2>/dev/null | sed "s/^up //" || echo n/a)"; ' +
      'echo "🔋 $( (cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1 | sed "s/$/%/") || echo n/a)"; ' +
      'echo "💾 $(df -h / | awk "NR==2{print \\$4\\" libre de \\"\\$2}")"; ' +
      'echo "🧠 $(free -h 2>/dev/null | awk "/Mem:/{print \\$3\\"/\\"\\$2}")"; ' +
      'echo "📊 $(top -bn1 2>/dev/null | awk "/Cpu\\(s\\)/{printf \\"%.0f%% CPU\\",100-\\$8}")"'
  },
  volume: {
    macos: (arg) => 'osascript -e "set volume output volume ' + (parseInt(arg, 10) || 0) + '"; echo "volumen → ' + (parseInt(arg, 10) || 0) + '%"',
    linux: (arg) => { const v = parseInt(arg, 10) || 0; return LGUI + 'pactl set-sink-volume @DEFAULT_SINK@ ' + v + '% 2>/dev/null && echo "volumen → ' + v + '%" || (amixer -q sset Master ' + v + '% 2>/dev/null && echo "volumen → ' + v + '%") || echo "sin control de audio (pactl/amixer)"'; }
  },
  displaysleep: {
    macos: () => 'pmset displaysleepnow; echo "pantalla dormida"',
    linux: () => LGUI + '(xset dpms force off 2>/dev/null && echo "pantalla dormida") || (swaymsg "output * dpms off" 2>/dev/null && echo "pantalla dormida (sway)") || echo "no se pudo (sin X11/sway)"'
  },
  displaywake: {
    macos: () => 'caffeinate -u -t 2; echo "pantalla encendida"',
    linux: () => LGUI + '(xset dpms force on 2>/dev/null; xset s reset 2>/dev/null; echo "pantalla encendida") || (swaymsg "output * dpms on" 2>/dev/null && echo "pantalla encendida (sway)") || echo "no se pudo (sin X11/sway)"'
  },
  lock: {
    macos: () => 'pmset displaysleepnow; echo "bloqueado"',
    linux: () => LGUI + '(loginctl lock-session 2>/dev/null || xdg-screensaver lock 2>/dev/null || xset s activate 2>/dev/null) && echo "bloqueado" || echo "no se pudo bloquear"'
  },
  say: {
    macos: (arg) => 'say ' + sh(arg) + '; echo "dicho"',
    linux: (arg) => LGUI + '(spd-say ' + sh(arg) + ' 2>/dev/null || espeak ' + sh(arg) + ' 2>/dev/null); echo "dicho"'
  },
  notify: {
    macos: (arg) => 'osascript -e ' + sh('display notification "' + String(arg).replace(/"/g, "'") + '" with title "FleetControl"') + '; echo "notificado"',
    linux: (arg) => LGUI + 'notify-send "FleetControl" ' + sh(arg) + ' 2>/dev/null && echo "notificado" || echo "sin notify-send"'
  },
  open: {
    macos: (arg) => macOpenCommand(arg),
    linux: (arg) => linuxOpenCommand(arg, LGUI),
    windows: (arg) => windowsOpenCommand(arg)
  },
  closeapp: {
    macos: (arg) => 'osascript -e ' + sh('quit app "' + String(arg).replace(/"/g, '') + '"') + ' && echo "cerrada: ' + String(arg).replace(/"/g, '') + '"',
    linux: (arg) => 'pkill -f ' + sh(arg) + ' && echo "cerrada: ' + String(arg).replace(/"/g, '') + '" || echo "no estaba abierta: ' + String(arg).replace(/"/g, '') + '"'
  },
  // ── Digital Signage ──────────────────────────────────────────────────────
  // macOS: player nativo AdmiraSignageMac (kiosko WKWebView de admira.tv). Lanzar
  //   = abrir la app; parar = quit limpio (el KeepAlive NO relanza un quit
  //   voluntario, solo un crash). arg = "screen|circuit|tag".
  // Linux: player PROPIO configurable por máquina en fleet.json → m.signage:
  //   { "start": "<cmd de arranque>", "stop": "<cmd de parada>", "url": "<url>" }.
  //   El start/stop reciben las variables de entorno SIGN_SCREEN, SIGN_CIRCUIT,
  //   SIGN_TAG y SIGN_URL, y ANTES del start se hace upsert de ADMIRA_SCREEN/
  //   CIRCUIT/TAG en ~/.config/admira-signage.env (el player systemd no hereda
  //   el entorno del SSH; sin esto screen/circuit/tag no le llegaban). Si no hay
  //   m.signage.start, cae a un kiosko Chromium por defecto apuntando a la url.
  // tag ≠ circuito: el circuito agrupa pantallas; el TAG filtra el contenido
  //   (musica → el canal solo emite lo etiquetado musica). Vacío = sin filtro.
  signage_on: {
    macos: (arg, m) => {
      const parts = String(arg || '').split('|');
      const machine = (m && m.id) || '';
      // El botón «signage» no pregunta configuración. En un Mac nuevo, usar el id
      // estable de flota como screen evita abrir el player sin identidad y dejar
      // su 🎛 mando vacío. Un screen explícito sigue teniendo prioridad.
      const screen = (parts[0] || machine).trim(), circuit = (parts[1] || '').trim();
      const tag = cleanTag(parts[2]);
      const audio = (parts[3] || '').trim() === '1';
      let pre = '';
      if (screen) pre += 'defaults write tv.admira.signage.mac screen ' + sh(screen) + '; ';
      pre += circuit ? ('defaults write tv.admira.signage.mac circuit ' + sh(circuit) + '; ')
                     : 'defaults delete tv.admira.signage.mac circuit 2>/dev/null; ';
      // id del equipo → el player lo reporta a /signage/now para que el 🎛️ mando enganche exacto.
      if (machine) pre += 'defaults write tv.admira.signage.mac machine ' + sh(machine) + '; ';
      // filtro por tag y audio: se escriben siempre — cada lanzamiento fija su config.
      pre += tag ? ('defaults write tv.admira.signage.mac tag ' + sh(tag) + '; ')
                 : 'defaults delete tv.admira.signage.mac tag 2>/dev/null; ';
      pre += 'defaults write tv.admira.signage.mac muted ' + (audio ? '0' : '1') + '; ';
      const q = [screen && ('screen=' + encodeURIComponent(screen)), circuit && ('circuit=' + encodeURIComponent(circuit)), tag && ('tag=' + encodeURIComponent(tag)), machine && ('machine=' + encodeURIComponent(machine)), 'embed=mupi', 'chrome=0', 'ontop=1'].filter(Boolean).join('&');
      const url = 'https://www.admira.tv/canal?' + q;
      return pre +
        'if [ -d "/Applications/AdmiraSignageMac.app" ]; then ' +
        'launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/tv.admira.signage.mac.plist" 2>/dev/null; ' +
        'launchctl kickstart -k gui/$(id -u)/tv.admira.signage.mac 2>/dev/null; ' +
        'open -a AdmiraSignageMac 2>/dev/null || open -b tv.admira.signage.mac 2>/dev/null; sleep 2; ' +
        'pgrep -x AdmiraSignageMac >/dev/null || { echo "AdmiraSignageMac no arrancó" >&2; exit 1; }; ' +
        'elif [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then ' +
        'pkill -f "\.admira-signage-kiosk" 2>/dev/null || true; ' +
        // --start-fullscreen: sin esto el canal arranca EN VENTANA, con barra de
        // menús y tapable por cualquier cosa (cazado por Carlos en el MacBook Pro
        // 16 el 21-07-2026 — «no se arranca a pantalla completa desde /control»).
        // El --kiosk de Chrome/mac se ignora, el fullscreen bueno es éste.
        // --use-mock-keychain: un perfil nuevo pinta si no la infobar «Reinicia el
        // navegador para cargar los datos de tu perfil» ENCIMA del contenido.
        'open -na "Google Chrome" --args --user-data-dir="$HOME/.admira-signage-kiosk" --app=' + sh(url) + ' ' +
        '--start-fullscreen --use-mock-keychain --password-store=basic ' +
        '--no-first-run --no-default-browser-check --disable-first-run-ui ' +
        '--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --autoplay-policy=no-user-gesture-required; sleep 3; ' +
        'pgrep -f "\.admira-signage-kiosk" >/dev/null || { echo "Chrome signage no arrancó" >&2; exit 1; }; ' +
        // El fullscreen nativo abre su propio Space: sin activar, el canal queda
        // en un Space que nadie ve y la pantalla sigue enseñando el escritorio.
        // Y hay que activar EL PROCESO DEL PLAYER, no «Google Chrome» a secas:
        // con dos instancias, activate trae la ventana del Chrome normal y el
        // canal se queda donde estaba (MacBook Pro 16, 21-07-2026). Best-effort:
        // si TCC deniega el AppleScript, el player emite igual, sólo que tapable.
        'DSPID=$(pgrep -f "\.admira-signage-kiosk" | head -1); ' +
        '[ -n "$DSPID" ] && osascript -e "tell application \\"System Events\\" to set frontmost of (first process whose unix id is $DSPID) to true" >/dev/null 2>&1 || true; ' +
        'else echo "sin AdmiraSignageMac ni Google Chrome" >&2; exit 127; fi; ' +
        'echo "📺 signage lanzado · screen ' + screen + (tag ? ' · tag ' + tag : '') + (audio ? ' · 🔊' : '') + '"';
    },
    linux: (arg, m) => {
      const parts = String(arg || '').split('|');
      const screen = (parts[0] || '').trim(), circuit = (parts[1] || '').trim();
      const tag = cleanTag(parts[2]);
      const audio = (parts[3] || '').trim() === '1';
      const sig = (m && m.signage) || {};
      const machine = (m && m.id) || '';
      const baseUrl = sig.url || 'https://www.admira.tv/player';
      const q = [screen && ('screen=' + encodeURIComponent(screen)), circuit && ('circuit=' + encodeURIComponent(circuit)), tag && ('tag=' + encodeURIComponent(tag)), audio && 'muted=0', machine && ('machine=' + encodeURIComponent(machine))].filter(Boolean).join('&');
      const url = q ? (baseUrl + (baseUrl.includes('?') ? '&' : '?') + q) : baseUrl;
      const envp = LGUI + 'export SIGN_SCREEN=' + sh(screen) + '; export SIGN_CIRCUIT=' + sh(circuit) + '; export SIGN_TAG=' + sh(tag) + '; export SIGN_MUTED=' + sh(audio ? '0' : '') + '; export SIGN_MACHINE=' + sh(machine) + '; export SIGN_URL=' + sh(url) + '; ';
      // Upsert en ~/.config/admira-signage.env. Circuito y TAG vacíos borran
      // cualquier filtro anterior: un "canal limpio" no hereda estado viejo.
      // MACHINE = id del equipo en la flota → el canal lo reporta a /signage/now
      // y el 🎛 mando (remotecontrol?machine=) engancha la pantalla exacta.
      const envfile =
        'F="$HOME/.config/admira-signage.env"; mkdir -p "$HOME/.config"; touch "$F"; ' +
        'up(){ grep -v "^$1=" "$F" > "$F.tmp" 2>/dev/null || true; [ -z "$2" ] || echo "$1=$2" >> "$F.tmp"; mv "$F.tmp" "$F"; }; ' +
        '[ -z "$SIGN_SCREEN" ] || up ADMIRA_SCREEN "$SIGN_SCREEN"; ' +
        'up ADMIRA_CIRCUIT "$SIGN_CIRCUIT"; ' +
        'up ADMIRA_TAG "$SIGN_TAG"; ' +
        'up ADMIRA_MUTED "$SIGN_MUTED"; ' +
        'up ADMIRA_MACHINE "$SIGN_MACHINE"; ';
      // Player propio: usa el comando de arranque de la máquina. El exit code se
      // propaga: si falla (p.ej. la unidad systemd no existe), el panel lo dice.
      if (sig.start) return envp + envfile + '( ' + sig.start + ' ) && echo "📺 signage lanzado' + (tag ? ' · tag ' + tag : '') + (audio ? ' · 🔊' : '') + '" || { echo "⚠️ signage NO lanzado — falló m.signage.start en esta máquina" >&2; exit 1; }';
      // Fallback: kiosko Chromium como servicio systemd --user (auto-relanza).
      const bin = 'command -v chromium >/dev/null 2>&1 && CH=chromium || CH=chromium-browser';
      return envp + envfile + bin + '; ' +
        'command -v "$CH" >/dev/null 2>&1 || { echo "no hay chromium; define m.signage.start en fleet.json"; exit 127; }; ' +
        'systemctl --user stop admira-signage 2>/dev/null; ' +
        '"$CH" --kiosk --noerrdialogs --disable-infobars --incognito --no-first-run "$SIGN_URL" >/dev/null 2>&1 & ' +
        'pgrep -f -- "--kiosk" >/dev/null || { echo "chromium kiosk no arrancó" >&2; exit 1; }; echo "📺 signage lanzado (chromium kiosk → $SIGN_URL)"';
    },
    // Windows OpenSSH encierra los hijos en su sesión y los mata al desconectar.
    // El frontend usa el executor local navegadores (open-channel/close-channel).
    windows: () => winPS("Write-Error 'Windows requiere el executor local navegadores'; exit 1")
  },
  signage_off: {
    macos: () =>
      'launchctl bootout gui/$(id -u)/tv.admira.signage.mac 2>/dev/null; ' +
      'osascript -e \'tell application "AdmiraSignageMac" to quit\' 2>/dev/null; ' +
      'pkill -x AdmiraSignageMac 2>/dev/null; pkill -f "\.admira-signage-kiosk" 2>/dev/null; sleep 1.5; ' +
      'if pgrep -x AdmiraSignageMac >/dev/null || pgrep -f "\.admira-signage-kiosk" >/dev/null; then echo "sigue activo (reintenta)" >&2; exit 1; else echo "⏹️ signage parado"; fi',
    linux: (arg, m) => {
      const sig = (m && m.signage) || {};
      if (sig.stop) return LGUI + '( ' + sig.stop + ' ) && echo "⏹️ signage parado" || { echo "⚠️ fallo al parar — revisa m.signage.stop en esta máquina" >&2; exit 1; }';
      return 'systemctl --user stop admira-signage 2>/dev/null; ' +
        "pkill -f '[a]dmira-signage' 2>/dev/null; pkill -f -- '--kiosk.*admira[.]tv' 2>/dev/null; pkill -f '[.]canal-kiosk' 2>/dev/null; sleep 1; " +
        'echo "⏹️ signage parado"';
    },
    windows: () => winPS("Write-Error 'Windows requiere el executor local navegadores'; exit 1")
  },
  reboot: {
    macos: () => 'sudo -n shutdown -r now 2>/dev/null && echo "reiniciando…" || echo "reinicio requiere sudo sin contraseña"',
    linux: () => '(systemctl reboot 2>/dev/null || sudo -n reboot 2>/dev/null) && echo "reiniciando…" || echo "reinicio requiere permisos (systemd/sudo)"'
  },
  // Salvapantallas de la flota: macOS = ScreenSaverEngine · Linux = GNOME ScreenSaver (dbus) con fallback a xset.
  screensaver_on: {
    macos: () => 'open -a ScreenSaverEngine 2>/dev/null && echo "🖼️ salvapantallas activo" || echo "no se pudo activar"',
    linux: () => LGUI + '(dbus-send --session --dest=org.gnome.ScreenSaver --type=method_call /org/gnome/ScreenSaver org.gnome.ScreenSaver.SetActive boolean:true 2>/dev/null || xdg-screensaver activate 2>/dev/null || xset s activate 2>/dev/null) && echo "🖼️ salvapantallas activo" || echo "no se pudo activar"'
  },
  screensaver_off: {
    macos: () => 'killall ScreenSaverEngine 2>/dev/null; echo "🖼️ salvapantallas quitado"',
    linux: () => LGUI + '(dbus-send --session --dest=org.gnome.ScreenSaver --type=method_call /org/gnome/ScreenSaver org.gnome.ScreenSaver.SetActive boolean:false 2>/dev/null || xdg-screensaver reset 2>/dev/null || xset s reset 2>/dev/null); echo "🖼️ salvapantallas quitado"'
  },
  // Captura de pantalla.
  //   macOS: vía el mini-agente AgoraCapture (LaunchAgent con TCC). Handshake por
  //     ficheros: tocamos capture.req → el agente deja base64 en capture.out.
  //   Linux: captura directa por SSH (grim en Wayland, scrot/import/gnome en X11)
  //     a JPEG y devuelve base64 (mismo formato que el UI espera).
  screenshot: {
    // `arg` = índice de pantalla (FLT-1021). Viaja pegado al nonce como «N|2» para
    // no cambiar el handshake: el demonio parte por «|» y los agentes viejos que
    // manden sólo el nonce siguen funcionando igual (pantalla 0).
    macos: (arg) =>
      'D="$HOME/.fleet"; mkdir -p "$D"; O="$D/capture.out"; N="fc-$(date +%s)-$$-$RANDOM"; ' +
      'printf "%s" "$N|' + String(parseInt(arg, 10) || 0) + '" > "$D/capture.req"; ' +
      'for i in $(seq 1 30); do [ "$(head -1 "$O" 2>/dev/null)" = "$N" ] && break; sleep 0.3; done; ' +
      'if [ "$(head -1 "$O" 2>/dev/null)" = "$N" ]; then tail -n +2 "$O"; else echo ERR_NO_CAPTURE; fi',
    // Windows: el demonio FleetCapture.exe (sesión interactiva) captura; el hub
    // dispara el handshake ejecutando FleetTrigger.exe, que imprime el base64 por
    // stdout (mismo formato que macOS/linux). DefaultShell del Zenbook = PowerShell.
    windows: () => '& "$env:USERPROFILE\\.fleet\\FleetTrigger.exe"',
    // Robusto y sin recaídas: elige la herramienta según el tipo de sesión
    // (Wayland → grim; X11 → scrot/import/gnome-screenshot) y PRUEBA cada una
    // hasta que una deje un fichero NO vacío. No basta con que el binario exista
    // (p.ej. grim compilado sin jpeg falla en X11 y dejaba $T vacío → antes daba
    // ERR_NO_CAPTURE aunque scrot estuviera disponible). Ver PARIDAD-FLOTA.md.
    linux: () =>
      LGUI +
      'T="$(mktemp).jpg"; ' +
      'cap(){ [ -s "$T" ] && return 0; command -v "$1" >/dev/null 2>&1 || return 1; shift; "$@" >/dev/null 2>&1; [ -s "$T" ]; }; ' +
      'if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then ' +
      '  cap grim grim -t jpeg -q 80 "$T" || cap scrot scrot -q 80 -o "$T" || cap gnome-screenshot gnome-screenshot -f "$T" || cap import import -window root "$T"; ' +
      'else ' +
      '  cap scrot scrot -q 80 -o "$T" || cap import import -window root "$T" || cap gnome-screenshot gnome-screenshot -f "$T" || cap grim grim -t jpeg -q 80 "$T"; ' +
      'fi; ' +
      'if [ -s "$T" ]; then command -v convert >/dev/null 2>&1 && convert "$T" -resize 1100x\\> -quality 80 "$T" 2>/dev/null; base64 "$T" | tr -d "\\n"; else echo ERR_NO_CAPTURE; fi; ' +
      'rm -f "$T"'
  }
};

// Resuelve la función de comando para (acción, máquina) según su plataforma.
// Acepta tanto el formato nuevo {macos,linux} como una función suelta (compat).
function resolveAction(action, m) {
  const spec = ACTIONS[action];
  if (!spec) return null;
  if (typeof spec === 'function') return spec;
  return spec[platOf(m)] || spec.macos || spec.linux || null;
}

/* ----- helpers HTTP --------------------------------------------------------- */
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOW_ORIGINS.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
  if (o && ALLOW_ORIGINS.includes(o)) res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fleet-Token, X-Fleet-Session, X-Fleet-Command-Id, X-Fleet-CSRF, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  // Chrome exige PNA cuando el panel público llama a un relay del tailnet. Se
  // concede sólo a los mismos orígenes exactos ya autorizados por CORS.
  if (o && ALLOW_ORIGINS.includes(o) && req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'", 'Cache-Control':'no-store' }); res.end(JSON.stringify(obj)); }

// Comparación de token en tiempo constante (S3). La diferencia de longitud
// se filtra (inevitable), pero no el contenido.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function authed(req) { return safeEqual(req.headers['x-fleet-token'], currentToken()); }

// --- auditoría + anti-abuso ---
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}
function audit(ev) {
  try { fs.appendFile(AUDIT_FILE, JSON.stringify({ t: new Date().toISOString(), ...ev }) + '\n', () => {}); } catch (e) {}
}
const _hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(ts => now - ts < RL_WINDOW_MS);
  arr.push(now); _hits.set(ip, arr);
  return arr.length > RL_MAX;
}
let _recentFails = [];
function tarpitMs() {
  const now = Date.now();
  _recentFails = _recentFails.filter(ts => now - ts < RL_WINDOW_MS);
  return Math.min(TARPIT_MAX_MS, 250 * _recentFails.length);
}
// Exige token; si falla, audita + tarpit creciente. Devuelve true si autorizado.
// Acceso por sesión Google SSO (único método humano). `allowToken` solo lo activa
// /api/register para el alta HEADLESS de máquinas nuevas (onboard.sh, sin navegador).
async function gate(req, res, ip, allowToken) {
  const auth=await sessionState(sessionFromReq(req));
  if (auth.state===ACTIVE) {
    const mutationError=sessionMutationError(req,auth.session,ALLOW_ORIGINS);
    if(mutationError){json(res,403,{error:mutationError});return false;}
    return true;
  }
  if(auth.state===UNAVAILABLE){json(res,503,{error:'registro de sesión no disponible'});return false;}
  if (allowToken && authed(req)) return true;                   // X-Fleet-Token (solo onboarding headless)
  _recentFails.push(Date.now());
  const wait = tarpitMs();
  audit({ ip, ev: 'auth_fail', url: req.url, wait });
  if (wait) await new Promise(r => setTimeout(r, wait));
  json(res, 401, { error: 'token requerido' });
  return false;
}
function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) b = b.slice(0, 1e6); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } }); });
}
function readRawBody(req, limit=20000) {
  return new Promise((resolve) => { let body='', tooLarge=false; req.on('data', chunk => { if (tooLarge) return; body += chunk; if (body.length > limit) { tooLarge=true; body=''; } }); req.on('end', () => resolve(tooLarge ? null : body)); req.on('error', () => resolve(null)); });
}

// ── VIGÍA DE CONTROL (decisión yokup 0148 ★, 4-sep-2026) ─────────────────────
// Prueba real «ver + tocar» cada 10 min, aviso en cada transición y auto-reparación.
const Vigia = require('./control-vigia');
const VIGIA_FILE = path.join(DIR, 'control-vigia.json');
const VIGIA_MD5 = (() => { try { return Vigia.md5AgenteCanonico(fs.readFileSync(path.join(DIR, 'deploy-capture-agent.sh'), 'utf8')); } catch (e) { return null; } })();
function vigiaSpawn(bin, args, stdinText, timeoutMs) {
  return new Promise((resolve) => {
    const ch = spawn(bin, args, { env: process.env });
    let out = '', err = '', done = false;
    const kill = setTimeout(() => { if (!done) { done = true; try { ch.kill('SIGKILL'); } catch (e) {} resolve({ rc: 124, stdout: out, stderr: err }); } }, timeoutMs || 60000);
    ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { err += d; });
    ch.on('close', (rc) => { if (!done) { done = true; clearTimeout(kill); resolve({ rc, stdout: out, stderr: err }); } });
    ch.on('error', (e) => { if (!done) { done = true; clearTimeout(kill); resolve({ rc: -1, stdout: out, stderr: String(e) }); } });
    if (stdinText != null) { try { ch.stdin.end(stdinText); } catch (e) {} } else { try { ch.stdin.end(); } catch (e) {} }
  });
}
async function vigiaReparar(m, tipo) {
  const target = (m.user || 'csilvasantin') + '@' + m.host;
  if (tipo === 'agente') {
    const inst = fs.readFileSync(path.join(DIR, 'deploy-capture-agent.sh'), 'utf8');
    const r = isRelayLocal(m) ? await vigiaSpawn('bash', ['-s', '--', 'local'], inst, 60000)
      : await vigiaSpawn('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', target, 'bash -s -- local'], inst, 60000);
    return r.rc === 0 && /instalado/.test(r.stdout);
  }
  if (tipo === 'inyector') {
    const src = path.join(os.homedir(), '.fleet', 'fleet-input.py');
    if (!fs.existsSync(src)) return false;
    const r = isRelayLocal(m) ? { rc: 0 } : await vigiaSpawn('scp', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', src, target + ':~/.fleet/fleet-input.py'], null, 30000);
    return r.rc === 0;
  }
  return false;
}
async function vigiaAvisar(texto) {
  const agora = path.join(os.homedir(), '.local', 'bin', 'agora');
  if (!fs.existsSync(agora)) return;
  await vigiaSpawn(agora, ['send', '--from', 'Claude', '--code', '[vigía de control · ' + RELAY_ID + '] ' + texto], null, 20000);
}
const VIGIA = Vigia.crear({
  maquinas: () => FLEET.machines.filter((m) => ['macos', 'linux', 'windows'].includes(platOf(m))),
  platOf, run, reparar: vigiaReparar, avisar: vigiaAvisar, audit,
  persistir: (e) => { try { fs.writeFileSync(VIGIA_FILE, JSON.stringify(e, null, 1)); } catch (err) {} },
  estadoInicial: (() => { try { return JSON.parse(fs.readFileSync(VIGIA_FILE, 'utf8')); } catch (e) { return {}; } })(),
  md5Canonico: VIGIA_MD5,
});
setTimeout(() => { VIGIA.ronda().catch(() => {}); }, 60 * 1000).unref?.();
const _vigiaTimer = setInterval(() => { VIGIA.ronda().catch(() => {}); }, Vigia.INTERVALO_MS); if (_vigiaTimer.unref) _vigiaTimer.unref();

/* ----- rutas ---------------------------------------------------------------- */
/* ── TERMINAL INTERACTIVA (PTY real por `ssh -tt`) ───────────────────────────
 * Consola interactiva de verdad para las maquinas (pensada para las Linux).
 * Sin dependencias nuevas: `ssh -tt` asigna un PTY en el destino; la salida sale
 * por SSE (EventSource no manda headers -> auth por TICKET efimero en el query)
 * y las teclas entran por POST /api/term/input (gate Google normal). Mismo nivel
 * de acceso que /api/run (shell): no anade privilegio, solo interactividad. */
const TERMS = new Map();                 // sessionId -> sesion
const TERM_MAX = 8;                      // sesiones vivas simultaneas
const TERM_IDLE_MS = 15 * 60 * 1000;     // corta sesiones inactivas
function termGC() {
  const now = Date.now();
  for (const [id, t] of TERMS) {
    if (!t.alive || now - t.last > TERM_IDLE_MS) { try { t.proc.kill('SIGKILL'); } catch (e) {} TERMS.delete(id); }
  }
}
const _termGcTimer = setInterval(termGC, 30 * 1000); if (_termGcTimer.unref) _termGcTimer.unref();

function termCreate(m, cols, rows, ip) {
  const user = m.user || 'csilvasantin';
  const host = m.host || 'localhost';
  const C = Math.max(20, Math.min(400, parseInt(cols, 10) || 100));
  const R = Math.max(6, Math.min(200, parseInt(rows, 10) || 30));
  // stty fija el tamano inicial del PTY remoto; luego shell de login interactivo.
  const remote = 'stty rows ' + R + ' cols ' + C + ' 2>/dev/null; exec "${SHELL:-/bin/bash}" -il';
  const args = ['-tt', '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3',
                user + '@' + host, remote];
  const proc = spawn('ssh', args, { env: process.env });
  const id = crypto.randomBytes(9).toString('hex');
  const ticket = crypto.randomBytes(18).toString('hex');
  const t = { id, proc, machine: m.id, ticket, buf: [], sse: null, alive: true, last: Date.now(), graceTimer: null, cols: C, rows: R };
  TERMS.set(id, t);
  const onOut = (d) => {
    t.last = Date.now();
    if (t.sse) { try { t.sse.write('data: ' + d.toString('base64') + '\n\n'); } catch (e) {} }
    else { t.buf.push(d); while (t.buf.length > 400) t.buf.shift(); }
  };
  proc.stdout.on('data', onOut);
  proc.stderr.on('data', onOut);
  proc.on('exit', (code) => {
    t.alive = false;
    if (t.sse) { try { t.sse.write('event: exit\ndata: ' + (code == null ? 0 : code) + '\n\n'); t.sse.end(); } catch (e) {} }
    setTimeout(() => TERMS.delete(id), 3000);
  });
  proc.on('error', () => { t.alive = false; });
  audit({ ip, ev: 'term_open', machine: m.id, cols: C, rows: R });
  return t;
}



const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const ip = clientIp(req);
  const requestUrl = new URL(req.url, 'https://fleet.admira.live');
  let url = requestUrl.pathname;
  if (url.startsWith(BASE)) url = url.slice(BASE.length) || '/';

  if (rateLimited(ip)) { audit({ ip, ev: 'rate_limited', url }); return json(res, 429, { error: 'demasiadas peticiones' }); }

  // salud (sin token)
  if (url === '/api/health' || url === '/health') return json(res, 200, {
    ok: true,
    service: 'fleet-control',
    relay: {
      id: RELAY_ID,
      label: RELAY_LABEL,
      checkedAt: Date.now(),
      capabilities: {
        status: true,
        commands: true,
        capture: true,
        terminal: true,
        targetIdempotency: ['macos', 'linux']
      }
    },
    machines: FLEET.machines.length,
    hasToken: !!currentToken()
  });

  if (url === '/api/auth/challenge' && (req.method === 'GET' || req.method === 'POST')) {
    if (!ALLOW_ORIGINS.includes(String(req.headers.origin || ''))) return json(res,403,{error:'origin no permitido'});
    const challengeInput=req.method==='POST'?await readBody(req):{};
    const flow=(challengeInput.flow||requestUrl.searchParams.get('flow'))==='redirect'?'redirect':'popup';
    const challenge=issueChallenge(flow==='redirect'?(challengeInput.return_to||requestUrl.searchParams.get('return_to')):'/',flow);
    setChallengeCookie(res,challenge.state,Math.floor(CHALLENGE_TTL_MS/1000),flow==='redirect'?'None':'Lax');
    return json(res,200,{ok:true,state:challenge.state,nonce:challenge.nonce,expiresAt:challenge.expiresAt,login_uri:flow==='redirect'?AUTH_CALLBACK_URI:undefined});
  }
  if (url === '/api/auth/session' && req.method === 'GET') {
    if (!ALLOW_ORIGINS.includes(String(req.headers.origin || ''))) return json(res,403,{error:'origin no permitido'});
    const auth=await sessionState(sessionFromReq(req));
    const policy=sessionEndpointPolicy(auth.state);
    if(policy.clearCookie)clearSessionCookie(res);
    if(policy.status===503)return json(res,503,{ok:false,error:'registro de sesión no disponible'});
    if(policy.status===401)return json(res,401,{ok:false});
    return json(res,200,{ok:true,email:auth.session.email,csrf:auth.session.csrf});
  }
  if (url === '/api/auth/logout' && req.method === 'POST') {
    if (!ALLOW_ORIGINS.includes(String(req.headers.origin || ''))) return json(res,403,{error:'origin no permitido'});
    // Logout no depende de un check previo: valida firma+CSRF localmente y
    // solicita revocación aun cuando el endpoint de check esté degradado.
    const session=verifySessionLocally(sessionFromReq(req));
    const mutationError=session&&sessionMutationError(req,session,ALLOW_ORIGINS);
    if(mutationError)return json(res,403,{error:mutationError});
    const state=session?await _sessionRegistry.revoke(session):REVOKED;
    const policy=logoutEndpointPolicy(!!session,state);
    if(!policy.clearCookie)return json(res,503,{error:'no se pudo revocar la sesión'});
    clearSessionCookie(res);
    return json(res,200,{ok:true});
  }
  // AUTH: challenge+nonce de un solo uso; el navegador sólo recibe cookie HttpOnly.
  if (url === '/api/auth' && req.method === 'POST') {
    if (!ALLOW_ORIGINS.includes(String(req.headers.origin || ''))) return json(res,403,{error:'origin no permitido'});
    const body = await readBody(req);
    const challenge=consumeChallenge(req,String(body&&body.state||'')); clearChallengeCookie(res);
    const email = challenge && await verifyGoogleCredential(body && body.credential,challenge.nonce);
    if (!email) {
      _recentFails.push(Date.now()); const wait = tarpitMs();
      audit({ ip, ev: 'auth_google_fail' });
      if (wait) await new Promise(r => setTimeout(r, wait));
      return json(res, 401, { error: 'google no autorizado' });
    }
    audit({ ip, ev: 'auth_google_ok', email });
    const token=await mintSession(email);
    if(!token)return json(res,503,{error:'registro de sesión no disponible'});
    setSessionCookie(res,token);
    return json(res, 200, { ok: true, email });
  }
  if (url === '/api/auth/callback' && req.method === 'POST') {
    const raw=await readRawBody(req), form=raw==null?{error:'invalid_form'}:parseGoogleCallback(raw,req.headers['content-type'],req.headers.cookie);
    if(form.error){clearChallengeCookie(res,'None');audit({ip,ev:'auth_callback_rejected',reason:form.error});return json(res,form.error==='csrf_invalid'?403:400,{error:form.error});}
    const challenge=consumeChallenge(req,form.state,'redirect'); clearChallengeCookie(res,'None');
    const email=challenge&&await verifyGoogleCredential(form.credential,challenge.nonce);
    if(!email){_recentFails.push(Date.now());audit({ip,ev:'auth_google_fail'});return json(res,401,{error:'google no autorizado'});}
    const token=await mintSession(email);
    if(!token)return json(res,503,{error:'registro de sesión no disponible'});
    audit({ip,ev:'auth_google_ok',email}); setSessionCookie(res,token);
    res.writeHead(303,{Location:AUTH_PUBLIC_ORIGIN+challenge.returnPath,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'}); return res.end();
  }
  if (url === '/api/auth/handoff' && req.method === 'POST') {
    if (!handoffOriginAllowed(req.headers)) return json(res,403,{error:'origin no permitido'});
    const raw=await readRawBody(req);
    if(raw==null||String(req.headers['content-type']||'').split(';',1)[0].trim().toLowerCase()!=='application/x-www-form-urlencoded'||raw.length>1024)return json(res,400,{error:'invalid_form'});
    const code=String(new URLSearchParams(raw).get('code')||'');
    if(!/^[A-Za-z0-9_-]{40,80}$/.test(code))return json(res,400,{error:'invalid_code'});
    let handoff=null;
    try{
      const exchange=await fetch(AUTH_HANDOFF_CONSUME,{method:'POST',headers:{Authorization:'Bearer '+AUTH_EDGE_SHARED_SECRET,'Content-Type':'application/x-www-form-urlencoded',Origin:'https://fleet.admira.live'},body:new URLSearchParams({code}).toString(),signal:AbortSignal.timeout(8000)});
      if(exchange.ok)handoff=await exchange.json();
    }catch(e){}
    if(!handoff||!handoff.email||!handoff.session)return json(res,409,{error:'handoff_invalid'});
    const email=String(handoff.email).toLowerCase();
    if(Date.now()-_superTs>60000)await refreshSupers();
    if(!SUPERS.has(email))return json(res,403,{error:'google no autorizado'});
    let token;
    try{token=_sessionCodec.mintClaims(handoff.session);}catch(e){return json(res,409,{error:'handoff_invalid'});}
    const session=_sessionCodec.verify(token);
    if(!session||session.email!==email||await _sessionRegistry.check(session)!==ACTIVE)return json(res,409,{error:'handoff_invalid'});
    setSessionCookie(res,token);
    res.writeHead(303,{Location:AUTH_PUBLIC_ORIGIN+safeReturnPath(handoff.returnPath),'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'}); return res.end();
  }

  // estado de la flota (lectura) — requiere token (el funnel es público)
  if (url === '/api/status') {
    if (!(await gate(req, res, ip))) return;
    const results = await Promise.all(FLEET.machines.map(async (m) => {
      // Windows OpenSSH tarda ~5,4s en negociar con AsusFold aun estando sano;
      // darle 9s evita el falso offline. Los sondeos corren en paralelo.
      const r = await run(m, statusProbe(m), platOf(m) === 'windows' ? 9000 : 4500);
      const online = r.rc === 0 && /ONLINE/.test(r.stdout);
      const sm = r.stdout.match(/__FLEET_SIGNAGE__=([01])/);
      const info = stripControlMarkers(r.stdout.replace(/ONLINE\s*/, '').replace(/^__FLEET_SIGNAGE__=[01]\s*$/gm, ''));
      const control = parseControlSignals(r.stdout, online);
      return {
        id: m.id,
        name: m.name,
        emoji: m.emoji,
        role: m.role,
        local: isRelayLocal(m),
        relayCapable: m.relayCapable === true,
        online,
        signageOn: sm ? sm[1] === '1' : null,
        signageBatch: m.signageBatch === true,
        host: m.host,
        user: m.user || 'csilvasantin',
        platform: platOf(m),
        info: online ? info : (r.stderr || 'sin respuesta').slice(0, 120),
        signals: {
          controlProbe: {
            reachable: online,
            checkedAt: Date.now(),
            relay: RELAY_ID,
            latencyMs: r.ms
          },
          control,
          vigia: VIGIA.estado[m.id] || null
        }
      };
    }));
    return json(res, 200, {
      machines: results,
      relay: { id: RELAY_ID, label: RELAY_LABEL },
      ts: Date.now()
    });
  }

  // Preflight DS fiable: accesibilidad remota, player/executor, versión,
  // permiso de captura, screen canónico, circuito y heartbeat real. No usa
  // localStorage ni las señales blandas de presencia de la UI.
  if (url === '/api/preflight' && req.method === 'GET') {
    if (!(await gate(req, res, ip))) return;
    const q = new URL(req.url, 'http://x').searchParams;
    const only = String(q.get('machine') || '');
    const targets = only ? FLEET.machines.filter(m => m.id === only) : FLEET.machines.slice();
    if (only && !targets.length) return json(res, 404, { error: 'máquina desconocida' });

    let liveByScreen = new Map();
    try {
      const sr = await fetch('https://api.admira.store/signage/screens?_t=' + Date.now(), { signal: AbortSignal.timeout(7000) });
      const sd = sr.ok ? await sr.json() : {};
      liveByScreen = new Map((Array.isArray(sd.screens) ? sd.screens : []).map(s => [String(s.screen || '').toLowerCase(), s]));
    } catch (e) {}

    const results = await Promise.all(targets.map(async m => {
      // OpenSSH de Windows puede gastar 5–9s solo en negociar; el probe y la
      // captura interactiva necesitan margen propio para no convertir lentitud
      // en un falso "offline" (AsusFold es el canario más lento conocido).
      const windows = platOf(m) === 'windows';
      const probe = await run(m, preflightCommand(m), windows ? 18000 : 9000);
      let capture = { rc: 1, stdout: '', stderr: 'sin acceso' };
      if (probe.rc === 0) {
        const capFn = resolveAction('screenshot', m);
        if (capFn) capture = await run(m, capFn(null, m), windows ? 22000 : 12000);
      }
      const screen = canonicalScreenId(m);
      const live = liveByScreen.get(screen) || { screen, online: false, age_seconds: null };
      let current = null, commandAck = null;
      await Promise.all([
        (async () => {
          if (!live.online) return;
          try {
            const r = await fetch('https://api.admira.store/signage/now?screen=' + encodeURIComponent(screen) + '&_t=' + Date.now(), { signal: AbortSignal.timeout(5000) });
            const d = r.ok ? await r.json() : null; current = d && d.item || null;
          } catch (e) {}
        })(),
        (async () => {
          try {
            const r = await fetch('https://omnipublicity-api.csilvasantin.workers.dev/control/seen?screen=' + encodeURIComponent(screen), { signal: AbortSignal.timeout(5000) });
            const d = r.ok ? await r.json() : null, seen = d && Array.isArray(d.seen) ? d.seen : [];
            commandAck = seen.length ? seen[seen.length - 1] : null;
          } catch (e) {}
        })()
      ]);
      const assessed = assessPreflight(m, probe, capture, live, { current, commandAck });
      audit({ ip, ev: 'signage_preflight', machine: m.id, eligible: assessed.eligible, blockers: assessed.blockers.length });
      return assessed;
    }));
    const states = results.reduce((acc, item) => { const state = item.deployment && item.deployment.state || 'unknown'; acc[state] = (acc[state] || 0) + 1; return acc; }, {});
    return json(res, 200, {
      ok: true,
      checkedAt: Date.now(),
      eligible: results.filter(x => x.eligible).length,
      blocked: results.filter(x => !x.eligible).length,
      states,
      machines: results
    });
  }

  // ejecutar comando libre
  if (url === '/api/run' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    if (!body.cmd || !String(body.cmd).trim()) return json(res, 400, { error: 'comando vacío' });
    const commandId = commandIdFromReq(req);
    const command = idempotentCommand(m, String(body.cmd), commandId);
    const r = await run(m, command, Math.min(body.timeoutMs || 25000, 60000));
    audit({ ip, ev: 'run', relay: RELAY_ID, commandId: commandId || undefined, machine: m.id, cmd: String(body.cmd).slice(0, 500), rc: r.rc, ms: r.ms });
    return json(res, 200, { machine: m.id, relay: RELAY_ID, commandId: commandId || null, ...r });
  }

  // ── TERMINAL INTERACTIVA: abrir sesion PTY (gate Google) -> {session, ticket}
  if (url === '/api/term/open' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    if (!m.host) return json(res, 400, { error: 'máquina sin host ssh' });
    termGC();
    let live = 0; for (const t of TERMS.values()) if (t.alive) live++;
    if (live >= TERM_MAX) return json(res, 429, { error: 'demasiadas terminales abiertas' });
    const t = termCreate(m, body.cols, body.rows, ip);
    return json(res, 200, { session: t.id, ticket: t.ticket, machine: m.id });
  }

  // ── TERMINAL: salida en vivo (SSE). Auth = ticket efimero (reusable en la sesion).
  if (url === '/api/term/stream' && req.method === 'GET') {
    const tk = new URL(req.url, 'http://x').searchParams.get('ticket') || '';
    let t = null; for (const s of TERMS.values()) if (s.ticket && s.ticket === tk) { t = s; break; }
    if (!t) return json(res, 403, { error: 'ticket inválido' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    if (t.graceTimer) { clearTimeout(t.graceTimer); t.graceTimer = null; }
    t.sse = res; t.last = Date.now();
    for (const d of t.buf.splice(0)) { try { res.write('data: ' + d.toString('base64') + '\n\n'); } catch (e) {} }
    if (!t.alive) { try { res.write('event: exit\ndata: 0\n\n'); } catch (e) {} return res.end(); }
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 15000);
    req.on('close', () => {
      clearInterval(hb);
      if (t.sse === res) t.sse = null;
      if (t.graceTimer) clearTimeout(t.graceTimer);
      t.graceTimer = setTimeout(() => { if (!t.sse && t.alive) { try { t.proc.kill('SIGKILL'); } catch (e) {} TERMS.delete(t.id); } }, 60000);
    });
    return;
  }

  // ── TERMINAL: entrada (teclas). Gate Google. data = base64 de los bytes.
  if (url === '/api/term/input' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const t = TERMS.get(String(body.session || ''));
    if (!t || !t.alive) return json(res, 404, { error: 'sesión no activa' });
    t.last = Date.now();
    let buf; try { buf = Buffer.from(String(body.data || ''), body.b64 === false ? 'utf8' : 'base64'); } catch (e) { buf = Buffer.alloc(0); }
    try { t.proc.stdin.write(buf); } catch (e) {}
    return json(res, 200, { ok: true });
  }

  // ── TERMINAL: cerrar sesion. Gate Google.
  if (url === '/api/term/close' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const t = TERMS.get(String(body.session || ''));
    if (t) { try { t.proc.kill('SIGKILL'); } catch (e) {} TERMS.delete(t.id); audit({ ip, ev: 'term_close', machine: t.machine }); }
    return json(res, 200, { ok: true });
  }


  // acción predefinida
  if (url === '/api/action' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const fn = resolveAction(body.action, m);
    if (!fn) return json(res, 400, { error: 'acción desconocida', acciones: Object.keys(ACTIONS) });
    let cmd;
    try { cmd = fn(body.arg, m); }
    catch (e) { return json(res, 400, { error: String(e && e.message || e || 'parámetro no válido') }); }
    const commandId = commandIdFromReq(req);
    const command = idempotentCommand(m, cmd, commandId);
    const r = await run(m, command, 25000);
    audit({ ip, ev: 'action', relay: RELAY_ID, commandId: commandId || undefined, machine: m.id, action: body.action, arg: body.arg != null ? String(body.arg).slice(0, 200) : undefined, rc: r.rc, ms: r.ms });
    return json(res, 200, { machine: m.id, action: body.action, relay: RELAY_ID, commandId: commandId || null, ...r });
  }

  // ── CONTROL REMOTO EN VIVO: /api/live/frame — devuelve un frame (screenshot fresco)
  // de la máquina como JPEG. El panel (control/index.html openRemoteControl) lo sondea
  // en bucle. Reutiliza la acción 'screenshot' (AgoraCapture/SSH) que ya funciona; si la
  // captura falla, devuelve 'capture_failed_or_no_permission' (el panel avisa de conceder
  // Grabación de pantalla). Antes esta ruta NO existía → 404 'no encontrado' en toda la flota.
  if (url === '/api/live/frame') {
    if (!(await gate(req, res, ip))) return;
    const q = new URL(req.url, 'http://x').searchParams;
    const m = machineById(q.get('machine'));
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const fn = resolveAction('screenshot', m);
    if (!fn) return json(res, 500, { error: 'sin acción screenshot' });
    // ?display=N → esa pantalla (FLT-1021). Sin parámetro, la de siempre.
    const dsp = parseInt(q.get('display'), 10) || 0;
    const r = await run(m, fn(dsp, m), 20000);
    const b64 = String(r.stdout || '').trim();
    if (/ERR_NO_SUCH_DISPLAY/.test(b64)) {
      return json(res, 404, { error: 'no_such_display', detail: 'la máquina no ha capturado la pantalla ' + dsp });
    }
    if (r.rc !== 0 || !b64 || /ERR_NO_CAPTURE/.test(b64) || b64.length < 200) {
      audit({ ip, ev: 'live_frame_fail', machine: m.id, rc: r.rc });
      return json(res, 502, { error: 'capture_failed_or_no_permission', detail: String(r.stderr || b64 || '').slice(0, 140) });
    }
    let buf; try { buf = Buffer.from(b64, 'base64'); } catch (e) { return json(res, 502, { error: 'bad-capture' }); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    return res.end(buf);
  }


  // ── CONTROL REMOTO: RATÓN Y TECLADO — /api/input (FLT-1021) ─────────────────
  // Carlos, 24-jul-2026: «el control remoto ha perdido las funciones de
  // interactividad». No se perdió: NUNCA EXISTIÓ esta ruta. Había /api/live/frame
  // (ver) pero no /api/input (tocar), así que el panel POSTeaba a una URL que
  // devolvía 404 y encima se lo tragaba en silencio. Los tooltips citaban un
  // «AdmiraRemoteAgent» que no está en ningún repo: el ejecutor real es
  // ~/.fleet/fleet-input.py, que postea CGEvents con Quartz en la máquina destino.
  // Las coordenadas viajan NORMALIZADAS (0..1) junto al índice de pantalla, para
  // que en un equipo de varios monitores el clic caiga en el que se está viendo.
  if (url === '/api/input' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const plataforma = platOf(m);
    if (!['macos', 'linux', 'windows'].includes(plataforma)) return json(res, 501, { error: 'input_no_soportado_en_' + plataforma });
    const accion = {
      type: String(body.type || ''),
      x: body.x, y: body.y, dx: body.dx, dy: body.dy,
      button: body.button, clicks: body.clicks,
      text: body.text, code: body.code, mods: body.mods,
      display: body.display
    };
    // El JSON viaja en base64: así no hay que pelearse con el escapado de comillas,
    // acentos ni emojis a través de ssh + shell (escribir « ñ » se rompía si no).
    const b64 = Buffer.from(JSON.stringify(accion), 'utf8').toString('base64');
    // Un inyector por plataforma, mismo contrato JSON (misión 0052, 4-sep-2026):
    //   macOS   → fleet-input.py (Quartz)      linux → fleet-input-linux.py (xdotool/ydotool)
    //   windows → fleet-input.ps1 (SendInput), con PowerShell como shell de SSH.
    const cmd = plataforma === 'linux'
      ? LGUI + 'echo ' + sh(b64) + ' | base64 -d | python3 "$HOME/.fleet/fleet-input-linux.py"'
      : plataforma === 'windows'
        ? '& "$env:USERPROFILE\\.fleet\\fleet-input.ps1" -Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(\'' + b64 + '\')))'
        : 'echo ' + sh(b64) + ' | base64 -d | /usr/bin/python3 "$HOME/.fleet/fleet-input.py"';
    const r = await run(m, cmd, 8000);
    let out = null; try { out = JSON.parse(String(r.stdout || '').trim()); } catch (e) {}
    if (!out || out.ok !== true) {
      // Fallar en VOZ ALTA: el silencio de antes es justo lo que hizo que esto
      // pasara meses sin que nadie supiera que el ratón no llegaba.
      audit({ ip, ev: 'input_fail', machine: m.id, type: accion.type, rc: r.rc });
      return json(res, 502, {
        error: (out && out.error) || 'input_failed',
        detalle: (out && out.detalle) || String(r.stderr || r.stdout || '').slice(0, 200)
      });
    }
    return json(res, 200, out);
  }

  // ── VIGÍA: estado y prueba manual ────────────────────────────────────────────
  // Sesión Google O X-Fleet-Token: el vigía también lo consultan y disparan agentes headless.
  if (url === '/api/vigia' && req.method === 'GET') {
    if (!(await gate(req, res, ip, true))) return;
    return json(res, 200, { ok: true, intervaloMs: Vigia.INTERVALO_MS, agenteCanonico: VIGIA_MD5, maquinas: VIGIA.estado });
  }
  if (url === '/api/vigia/run' && req.method === 'POST') {
    if (!(await gate(req, res, ip, true))) return;
    const body = await readBody(req);
    if (body && body.machine) {
      const m = machineById(body.machine);
      if (!m) return json(res, 400, { error: 'máquina desconocida' });
      const r = await VIGIA.vigilar(m, { forzar: true });
      audit({ ip, ev: 'vigia_manual', machine: m.id, ready: r && r.ready });
      return json(res, 200, { ok: true, maquina: m.id, resultado: r });
    }
    const e = await VIGIA.ronda({ forzar: true });
    audit({ ip, ev: 'vigia_manual', machine: '*' });
    return json(res, 200, { ok: true, maquinas: e });
  }

  // Pantallas de una máquina, para el selector del panel (FLT-1021). El MacMini
  // tiene 3 monitores: sin esto siempre se veía y se tocaba el principal.
  if (url === '/api/displays') {
    if (!(await gate(req, res, ip))) return;
    const q = new URL(req.url, 'http://x').searchParams;
    const m = machineById(q.get('machine'));
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const plataforma = platOf(m);
    const cmdDisplays = plataforma === 'linux' ? LGUI + 'python3 "$HOME/.fleet/fleet-input-linux.py" --displays'
      : plataforma === 'windows' ? '& "$env:USERPROFILE\\.fleet\\fleet-input.ps1" -Displays'
      : plataforma === 'macos' ? '/usr/bin/python3 "$HOME/.fleet/fleet-input.py" --displays' : null;
    if (!cmdDisplays) return json(res, 200, { displays: [] });
    const r = await run(m, cmdDisplays, 8000);
    let out = null; try { out = JSON.parse(String(r.stdout || '').trim()); } catch (e) {}
    if (!out || !out.ok) return json(res, 502, { error: 'sin_agente_de_entrada', detalle: String(r.stderr || r.stdout || '').slice(0, 200) });
    return json(res, 200, { displays: out.displays || [] });
  }

  // ── ONBOARDING: alta/auto-registro de una máquina nueva en la flota ──────────
  // La máquina nueva (p.ej. una MacBook Air) se da de alta sola: POST con su
  // identidad + el token de flota. Upsert por id/host → persiste en fleet.json.
  // Aparece en admira.live/control en cuanto el MacMini pueda hacerle SSH.
  if (url === '/api/register' && req.method === 'POST') {
    if (!(await gate(req, res, ip, true))) return;   // sesión O X-Fleet-Token (onboarding headless)
    const body = await readBody(req);
    const host = String(body.host || '').trim();
    const name = String(body.name || '').trim();
    if (!host || !name) return json(res, 400, { error: 'host y name son obligatorios' });
    const slug = String(body.id || name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id = slug || ('mac-' + Date.now());
    const plat = String(body.platform || 'macos').toLowerCase().startsWith('lin') ? 'linux' : 'macos';
    const machine = {
      id,
      name,
      emoji: String(body.emoji || (plat === 'linux' ? '🐧' : '💻')),
      role: String(body.role || 'Equipo nuevo'),
      host,
      user: String(body.user || 'csilvasantin'),
      platform: plat
    };
    if (body.relayCapable === true) machine.relayCapable = true;
    // player de signage propio (Linux): { url, start, stop } — opcional en el alta.
    if (body.signage && typeof body.signage === 'object') {
      machine.signage = {
        url: String(body.signage.url || ''),
        start: String(body.signage.start || ''),
        stop: String(body.signage.stop || '')
      };
    }
    const idx = FLEET.machines.findIndex(m => m.id === id || (m.host && m.host === host));
    let created;
    if (idx >= 0) { FLEET.machines[idx] = { ...FLEET.machines[idx], ...machine }; created = false; }
    else { FLEET.machines.push(machine); created = true; }
    try { fs.writeFileSync(path.join(DIR, 'fleet.json'), JSON.stringify(FLEET, null, 1) + '\n'); }
    catch (e) { return json(res, 500, { error: 'no se pudo persistir fleet.json: ' + (e.message || e) }); }
    audit({ ip, ev: 'register', machine: id, host, created });
    return json(res, created ? 201 : 200, { ok: true, created, machine, total: FLEET.machines.length });
  }

  json(res, 404, { error: 'no encontrado' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[fleet-control] relay ' + RELAY_ID + ' · escuchando en 127.0.0.1:' + PORT + ' · ' + FLEET.machines.length + ' máquinas · token ' + (TOKEN ? 'OK' : 'FALTA'));
});
