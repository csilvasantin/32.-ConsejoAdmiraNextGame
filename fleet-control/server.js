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
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PORT = parseInt(process.env.FLEET_PORT || '9140', 10);
const BASE = '/fleet';                       // prefijo de ruta (lo pone el funnel)
const ALLOW_ORIGINS = ['https://www.admira.live', 'https://admira.live', 'https://macmini.tail48b61c.ts.net'];

function loadJSON(f, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return fallback; } }
const FLEET = loadJSON('fleet.json', { machines: [] });

function token() {
  if (process.env.FLEET_TOKEN) return process.env.FLEET_TOKEN.trim();
  try { return fs.readFileSync(path.join(DIR, '.fleet-token'), 'utf8').trim(); } catch (e) { return ''; }
}
const TOKEN = token();

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fleet-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function authed(req) { return TOKEN && (req.headers['x-fleet-token'] === TOKEN); }
function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) b = b.slice(0, 1e6); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } }); });
}

/* ----- rutas ---------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url = req.url.split('?')[0];
  if (url.startsWith(BASE)) url = url.slice(BASE.length) || '/';

  // salud (sin token)
  if (url === '/api/health' || url === '/health') return json(res, 200, { ok: true, service: 'fleet-control', machines: FLEET.machines.length, hasToken: !!TOKEN });

  // estado de la flota (lectura) — requiere token (el funnel es público)
  if (url === '/api/status') {
    if (!authed(req)) return json(res, 401, { error: 'token requerido' });
    const probe = 'echo ONLINE; scutil --get ComputerName 2>/dev/null || hostname';
    const results = await Promise.all(FLEET.machines.map(async (m) => {
      const r = await run(m, probe, 9000);
      const online = r.rc === 0 && /ONLINE/.test(r.stdout);
      return { id: m.id, name: m.name, emoji: m.emoji, role: m.role, local: !!m.local, online, host: m.host, info: online ? r.stdout.replace(/ONLINE\s*/, '').trim() : (r.stderr || 'sin respuesta').slice(0, 120) };
    }));
    return json(res, 200, { machines: results, ts: Date.now() });
  }

  // ejecutar comando libre
  if (url === '/api/run' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { error: 'token requerido' });
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    if (!body.cmd || !String(body.cmd).trim()) return json(res, 400, { error: 'comando vacío' });
    const r = await run(m, String(body.cmd), Math.min(body.timeoutMs || 25000, 60000));
    return json(res, 200, { machine: m.id, ...r });
  }

  // acción predefinida
  if (url === '/api/action' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { error: 'token requerido' });
    const body = await readBody(req);
    const m = machineById(body.machine);
    if (!m) return json(res, 400, { error: 'máquina desconocida' });
    const fn = ACTIONS[body.action];
    if (!fn) return json(res, 400, { error: 'acción desconocida', acciones: Object.keys(ACTIONS) });
    const r = await run(m, fn(body.arg), 25000);
    return json(res, 200, { machine: m.id, action: body.action, ...r });
  }

  json(res, 404, { error: 'no encontrado' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[fleet-control] escuchando en 127.0.0.1:' + PORT + ' · ' + FLEET.machines.length + ' máquinas · token ' + (TOKEN ? 'OK' : 'FALTA'));
});
