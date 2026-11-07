'use strict';
/**
 * machine-removal.js — baja y restauración de equipos en fleet.json (relay fleet-control).
 *
 * Por qué (19-10-2026): «🗑 Eliminar equipo» de admira.live/control sólo ocultaba la
 * ficha en el KV de Pages; el relay seguía sirviéndola desde fleet.json y el equipo
 * volvía. El relay sólo sabía dar de ALTA (POST /api/register). Esto añade la BAJA:
 *
 *   DELETE /api/machines/:id[?dryRun=1]   quita la entrada de fleet.json
 *   POST   /api/machines/:id/restore      la vuelve a poner (desde la papelera)
 *   POST   /api/machines/:id/ticket       {accion:"eliminar"|"restaurar"} → ticket firmado
 *
 * Cada baja/restauración:
 *   1) copia fleet.json a fleet-backups/fleet-<AAAAMMDD-HHMMSS-mmm>.json (antes de tocarlo),
 *   2) reescribe fleet.json de forma atómica (tmp + rename),
 *   3) actualiza FLEET.machines en memoria (sin reiniciar el servicio),
 *   4) guarda la entrada quitada en fleet-eliminados.json (papelera, para restaurar sin pérdida).
 * La auditoría (audit.log) la escribe server.js con el resultado.
 *
 * El TICKET permite que la Pages Function de admira.live (servidor) haga la baja con el
 * token de flota SIN fiarse de una cabecera Origin falsificable: el navegador lo pide al
 * relay con su sesión Google + CSRF (Fleet Mesh) y la Function verifica la firma
 * HMAC-SHA256 con el mismo token de flota (que sólo conocen el relay y Pages).
 * Formato: base64url(JSON{v,id,accion,email,exp}) + "." + base64url(HMAC(clave, payload))
 * clave = HMAC-SHA256(tokenDeFlota, "admira-control-equipos-ticket-v1").
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TICKET_CONTEXT = 'admira-control-equipos-ticket-v1';
const TICKET_TTL_S = 120;
const TRASH_MAX = 200;

const norm = (s) => String(s || '').toLowerCase().replace(/^admira-?/, '').replace(/[^a-z0-9]/g, '');
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 80 && /^[A-Za-z0-9._()\- ]+$/.test(id);

function stamp(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + p(d.getMilliseconds(), 3);
}

/** Busca la máquina: id exacto; si no, host exacto; si no, id normalizado ÚNICO. */
function findMachine(machines, id) {
  const list = Array.isArray(machines) ? machines : [];
  let idx = list.findIndex((m) => m && m.id === id);
  if (idx < 0) idx = list.findIndex((m) => m && m.host && m.host === id);
  if (idx >= 0) return { idx };
  const k = norm(id);
  if (!k) return { idx: -1 };
  const hits = [];
  list.forEach((m, i) => { if (m && (norm(m.id) === k || norm(m.name) === k)) hits.push(i); });
  if (hits.length > 1) return { idx: -1, ambiguous: hits.map((i) => list[i].id) };
  return { idx: hits.length ? hits[0] : -1 };
}

function writeAtomic(file, text, fsi) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fsi.writeFileSync(tmp, text);
  fsi.renameSync(tmp, file);
}

function readTrash(dir, fsi) {
  try { const d = JSON.parse(fsi.readFileSync(path.join(dir, 'fleet-eliminados.json'), 'utf8')); return Array.isArray(d.items) ? d : { items: [] }; }
  catch (e) { return { items: [] }; }
}

function createMachineRemoval({ dir, fleet, fsImpl = fs, now = () => new Date() }) {
  const FLEET_FILE = path.join(dir, 'fleet.json');
  const BACKUP_DIR = path.join(dir, 'fleet-backups');
  const TRASH_FILE = path.join(dir, 'fleet-eliminados.json');

  function backup() {
    fsImpl.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, 'fleet-' + stamp(now()) + '.json');
    // Copia del fichero TAL CUAL está en disco (si no existiera, de la memoria).
    let raw;
    try { raw = fsImpl.readFileSync(FLEET_FILE, 'utf8'); } catch (e) { raw = JSON.stringify(fleet, null, 1) + '\n'; }
    fsImpl.writeFileSync(file, raw);
    return file;
  }
  function persist(machines) {
    const next = Object.assign({}, fleet, { machines });
    writeAtomic(FLEET_FILE, JSON.stringify(next, null, 1) + '\n', fsImpl);
  }

  /** Baja. Devuelve { status, body } listo para json(). */
  function remove(id, { dryRun = false, by = '' } = {}) {
    if (!validId(id)) return { status: 400, body: { ok: false, error: 'id inválido' } };
    const found = findMachine(fleet.machines, id);
    if (found.ambiguous) return { status: 409, body: { ok: false, error: 'id ambiguo', candidatos: found.ambiguous } };
    if (found.idx < 0) return { status: 404, body: { ok: false, error: 'máquina desconocida', id } };
    const machine = fleet.machines[found.idx];
    if (dryRun) return { status: 200, body: { ok: true, dryRun: true, removed: false, machine, total: fleet.machines.length } };
    let backupFile;
    try {
      backupFile = backup();
      const machines = fleet.machines.slice(); machines.splice(found.idx, 1);
      persist(machines);
      fleet.machines.splice(found.idx, 1);                 // memoria: sin reiniciar
    } catch (e) {
      return { status: 500, body: { ok: false, error: 'no se pudo persistir fleet.json: ' + (e.message || e) } };
    }
    try {
      const trash = readTrash(dir, fsImpl);
      trash.items.push({ at: now().toISOString(), by: String(by || '').slice(0, 120), machine });
      trash.items = trash.items.slice(-TRASH_MAX);
      writeAtomic(TRASH_FILE, JSON.stringify(trash, null, 1) + '\n', fsImpl);
    } catch (e) { /* la baja ya está hecha; la copia de seguridad la cubre */ }
    return { status: 200, body: { ok: true, removed: true, machine, backup: path.basename(backupFile), total: fleet.machines.length } };
  }

  /** Restauración desde la papelera (la última baja de ese id). Opcional `machine` de respaldo. */
  function restore(id, { dryRun = false, fallback = null } = {}) {
    if (!validId(id)) return { status: 400, body: { ok: false, error: 'id inválido' } };
    const already = findMachine(fleet.machines, id);
    if (already.idx >= 0) return { status: 200, body: { ok: true, restored: false, already: true, machine: fleet.machines[already.idx] } };
    const trash = readTrash(dir, fsImpl);
    const k = norm(id);
    let ti = -1;
    for (let i = trash.items.length - 1; i >= 0; i--) {
      const m = trash.items[i] && trash.items[i].machine;
      if (m && (m.id === id || norm(m.id) === k)) { ti = i; break; }
    }
    let machine = ti >= 0 ? trash.items[ti].machine : null;
    if (!machine && fallback && typeof fallback === 'object' && validId(String(fallback.id || '')) && fallback.host && fallback.name) {
      machine = { id: String(fallback.id), name: String(fallback.name).slice(0, 80), host: String(fallback.host).slice(0, 160),
        user: String(fallback.user || 'csilvasantin').slice(0, 60), platform: String(fallback.platform || 'macos').slice(0, 20),
        emoji: String(fallback.emoji || '💻').slice(0, 8), role: String(fallback.role || '').slice(0, 80) };
    }
    if (!machine) return { status: 404, body: { ok: false, error: 'no está en la papelera', id } };
    if (dryRun) return { status: 200, body: { ok: true, dryRun: true, restored: false, machine } };
    let backupFile;
    try {
      backupFile = backup();
      const machines = fleet.machines.concat([machine]);
      persist(machines);
      fleet.machines.push(machine);
    } catch (e) {
      return { status: 500, body: { ok: false, error: 'no se pudo persistir fleet.json: ' + (e.message || e) } };
    }
    if (ti >= 0) {
      try { trash.items.splice(ti, 1); writeAtomic(TRASH_FILE, JSON.stringify(trash, null, 1) + '\n', fsImpl); } catch (e) {}
    }
    return { status: 200, body: { ok: true, restored: true, machine, backup: path.basename(backupFile), total: fleet.machines.length } };
  }

  return { remove, restore, findMachine: (id) => findMachine(fleet.machines, id), FLEET_FILE, BACKUP_DIR, TRASH_FILE };
}

// ── tickets ───────────────────────────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function ticketKey(token) { return crypto.createHmac('sha256', String(token)).update(TICKET_CONTEXT).digest(); }
function mintTicket(token, { id, accion, email }, nowMs = Date.now()) {
  if (!token) throw new Error('sin token de flota');
  if (!validId(id)) throw new Error('id inválido');
  if (accion !== 'eliminar' && accion !== 'restaurar') throw new Error('accion inválida');
  const payload = b64u(JSON.stringify({ v: 1, id, accion, email: String(email || '').slice(0, 120), exp: Math.floor(nowMs / 1000) + TICKET_TTL_S }));
  return payload + '.' + b64u(crypto.createHmac('sha256', ticketKey(token)).update(payload).digest());
}
function verifyTicket(token, ticket, nowMs = Date.now()) {
  const parts = String(ticket || '').split('.');
  if (!token || parts.length !== 2) return null;
  const want = b64u(crypto.createHmac('sha256', ticketKey(token)).update(parts[0]).digest());
  const a = Buffer.from(want), b = Buffer.from(parts[1]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  if (!p || p.v !== 1 || !(p.exp > Math.floor(nowMs / 1000))) return null;
  return p;
}

module.exports = { createMachineRemoval, findMachine, norm, validId, stamp, mintTicket, verifyTicket, TICKET_CONTEXT, TICKET_TTL_S };
