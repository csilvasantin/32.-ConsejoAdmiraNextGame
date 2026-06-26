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
 *   FLEET_TOKEN=<token> FLEET_PORT=9140 node fleet-control/server.js
 * El token también se lee de fleet-control/.fleet-token si no hay env.
 * ========================================================================== */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PORT = parseInt(process.env.FLEET_PORT || '9140', 10);
const BASE = '/fleet';                       // prefijo de ruta (lo pone el funnel)
const ALLOW_ORIGINS = ['https://www.admira.live', 'https://admira.live', 'https://macmini.tail48b61c.ts.net'];

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
const ALLOWLIST = new Set(['csilva@admira.com', 'csilvasantin@gmail.com']);
const SESSION_TTL_MS = 12 * 3600 * 1000;
const SESSION_SECRET = (function () {
  const f = path.join(DIR, '.session-secret');
  try { const s = fs.readFileSync(f, 'utf8').trim(); if (s) return s; } catch (e) {}
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(f, s, { mode: 0o600 }); } catch (e) {}
  return s;
})();
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = p => crypto.createHmac('sha256', SESSION_SECRET).update(p).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Verifica un ID token de Google con el endpoint tokeninfo (Google valida la
// firma). Devuelve el email allowlisted o null.
async function verifyGoogleCredential(cred) {
  if (!cred || typeof cred !== 'string') return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.aud !== GOOGLE_CLIENT_ID) return null;            // token de OTRA app → no
    if (String(d.email_verified) !== 'true') return null;
    const email = String(d.email || '').toLowerCase();
    if (!ALLOWLIST.has(email)) return null;                 // no allowlisted → no
    return email;
  } catch (e) { return null; }
}
function mintSession(email) {
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS }));
  return payload + '.' + hmac(payload);
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.'); if (i < 1) return null;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  if (!safeEqual(sig, hmac(payload))) return null;
  let d; try { d = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) { return null; }
  if (!d || !d.exp || Date.now() > d.exp) return null;
  const email = String(d.email || '').toLowerCase();
  if (!ALLOWLIST.has(email)) return null;
  return email;
}
function sessionFromReq(req) {
  const h = String(req.headers['authorization'] || '');
  return (h.startsWith('Bearer ') ? h.slice(7).trim() : '') || String(req.headers['x-fleet-session'] || '');
}

/* ----- ejecutar en una máquina (local o ssh) -------------------------------- */
function machineById(id) { return FLEET.machines.find(m => m.id === id); }

function run(machine, cmd, timeoutMs) {
  return new Promise((resolve) => {
    timeoutMs = timeoutMs || 25000;
    let bin, args;
    if (machine.local) {
      bin = 'bash'; args = ['-lc', cmd];
    } else {
      const target = (machine.user || 'csilvasantin') + '@' + machine.host;
      bin = 'ssh';
      args = ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', target, cmd];
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

/* ----- acciones predefinidas (seguras, mapeadas a comandos) ------------------ */
function sh(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; } // single-quote safe
const ACTIONS = {
  sysinfo: () =>
    'echo "🖥️ $(scutil --get ComputerName 2>/dev/null || hostname)"; ' +
    'echo "⏱️ $(uptime | sed "s/.*up //;s/, [0-9]* user.*//")"; ' +
    'echo "🔋 $(pmset -g batt 2>/dev/null | grep -o "[0-9]*%" | head -1 || echo n/a)"; ' +
    'echo "💾 $(df -h / | awk "NR==2{print \\$4\\" libre de \\"\\$2}")"; ' +
    'echo "🔊 $(osascript -e "output volume of (get volume settings)" 2>/dev/null)%"; ' +
    'echo "📊 $(ps -A -o %cpu | awk "{s+=\\$1} END{printf \\"%.0f%% CPU\\", s}")"',
  volume: (arg) => 'osascript -e "set volume output volume ' + (parseInt(arg, 10) || 0) + '"; echo "volumen → ' + (parseInt(arg, 10) || 0) + '%"',
  displaysleep: () => 'pmset displaysleepnow; echo "pantalla dormida"',
  lock: () => 'pmset displaysleepnow; echo "bloqueado"',
  say: (arg) => 'say ' + sh(arg) + '; echo "dicho"',
  notify: (arg) => 'osascript -e ' + sh('display notification "' + String(arg).replace(/"/g, "'") + '" with title "FleetControl"') + '; echo "notificado"',
  open: (arg) => 'open -a ' + sh(arg) + ' && echo "abierto: ' + String(arg).replace(/"/g, '') + '"',
  closeapp: (arg) => 'osascript -e ' + sh('quit app "' + String(arg).replace(/"/g, '') + '"') + ' && echo "cerrada: ' + String(arg).replace(/"/g, '') + '"',
  // Captura vía el mini-agente de captura (LaunchAgent en la sesión del usuario,
  // que SÍ tiene TCC). Handshake por ficheros: tocamos capture.req → el agente
  // (WatchPaths) captura y deja base64 en capture.out (más nuevo que la petición).
  screenshot: () =>
    'D="$HOME/.fleet"; mkdir -p "$D"; O="$D/capture.out"; N="fc-$(date +%s)-$$-$RANDOM"; ' +
    'printf "%s" "$N" > "$D/capture.req"; ' +
    'for i in $(seq 1 30); do [ "$(head -1 "$O" 2>/dev/null)" = "$N" ] && break; sleep 0.3; done; ' +
    'if [ "$(head -1 "$O" 2>/dev/null)" = "$N" ]; then tail -n +2 "$O"; else echo ERR_NO_CAPTURE; fi'
};

/* ----- helpers HTTP --------------------------------------------------------- */
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOW_ORIGINS.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fleet-Token, X-Fleet-Session, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

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
async function gate(req, res, ip) {
  if (authed(req)) return true;                          // X-Fleet-Token (fallback)
  if (verifySession(sessionFromReq(req))) return true;   // sesión Google SSO (opción B)
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

/* ----- rutas ---------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const ip = clientIp(req);
  let url = req.url.split('?')[0];
  if (url.startsWith(BASE)) url = url.slice(BASE.length) || '/';

  if (rateLimited(ip)) { audit({ ip, ev: 'rate_limited', url }); return json(res, 429, { error: 'demasiadas peticiones' }); }

  // salud (sin token)
  if (url === '/api/health' || url === '/health') return json(res, 200, { ok: true, service: 'fleet-control', machines: FLEET.machines.length, hasToken: !!currentToken() });

  // AUTH (opción B): intercambia un ID token de Google (allowlisted) por una
  // sesión propia del backend (12h). Sin token: es el bootstrap. Google verifica
  // la firma del ID token; aquí solo aceptamos aud=nuestro client + email allowlisted.
  if (url === '/api/auth' && req.method === 'POST') {
    const body = await readBody(req);
    const email = await verifyGoogleCredential(body && body.credential);
    if (!email) {
      _recentFails.push(Date.now()); const wait = tarpitMs();
      audit({ ip, ev: 'auth_google_fail' });
      if (wait) await new Promise(r => setTimeout(r, wait));
      return json(res, 401, { error: 'google no autorizado' });
    }
    audit({ ip, ev: 'auth_google_ok', email });
    return json(res, 200, { ok: true, session: mintSession(email), email, exp: Date.now() + SESSION_TTL_MS });
  }

  // estado de la flota (lectura) — requiere token (el funnel es público)
  if (url === '/api/status') {
    if (!(await gate(req, res, ip))) return;
    const probe = 'echo ONLINE; scutil --get ComputerName 2>/dev/null || hostname';
    const results = await Promise.all(FLEET.machines.map(async (m) => {
      const r = await run(m, probe, 9000);
      const online = r.rc === 0 && /ONLINE/.test(r.stdout);
      return { id: m.id, name: m.name, emoji: m.emoji, role: m.role, local: !!m.local, online, host: m.host, user: m.user || 'csilvasantin', info: online ? r.stdout.replace(/ONLINE\s*/, '').trim() : (r.stderr || 'sin respuesta').slice(0, 120) };
    }));
    return json(res, 200, { machines: results, ts: Date.now() });
  }

  // ejecutar comando libre
  if (url === '/api/run' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    if (!body.cmd || !String(body.cmd).trim()) return json(res, 400, { error: 'comando vacío' });
    const r = await run(m, String(body.cmd), Math.min(body.timeoutMs || 25000, 60000));
    audit({ ip, ev: 'run', machine: m.id, cmd: String(body.cmd).slice(0, 500), rc: r.rc, ms: r.ms });
    return json(res, 200, { machine: m.id, ...r });
  }

  // acción predefinida
  if (url === '/api/action' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const fn = ACTIONS[body.action];
    if (!fn) return json(res, 400, { error: 'acción desconocida', acciones: Object.keys(ACTIONS) });
    const r = await run(m, fn(body.arg), 25000);
    audit({ ip, ev: 'action', machine: m.id, action: body.action, arg: body.arg != null ? String(body.arg).slice(0, 200) : undefined, rc: r.rc, ms: r.ms });
    return json(res, 200, { machine: m.id, action: body.action, ...r });
  }

  // ── ONBOARDING: alta/auto-registro de una máquina nueva en la flota ──────────
  // La máquina nueva (p.ej. una MacBook Air) se da de alta sola: POST con su
  // identidad + el token de flota. Upsert por id/host → persiste en fleet.json.
  // Aparece en admira.live/control en cuanto el MacMini pueda hacerle SSH.
  if (url === '/api/register' && req.method === 'POST') {
    if (!(await gate(req, res, ip))) return;
    const body = await readBody(req);
    const host = String(body.host || '').trim();
    const name = String(body.name || '').trim();
    if (!host || !name) return json(res, 400, { error: 'host y name son obligatorios' });
    const slug = String(body.id || name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id = slug || ('mac-' + Date.now());
    const machine = {
      id,
      name,
      emoji: String(body.emoji || '💻'),
      role: String(body.role || 'Equipo nuevo'),
      host,
      user: String(body.user || 'csilvasantin')
    };
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
  console.log('[fleet-control] escuchando en 127.0.0.1:' + PORT + ' · ' + FLEET.machines.length + ' máquinas · token ' + (TOKEN ? 'OK' : 'FALTA'));
});
