'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMachineRemoval, findMachine, mintTicket, verifyTicket } = require('./machine-removal');

function sandbox(machines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-removal-'));
  const fleet = { machines: machines.map((m) => ({ ...m })) };
  fs.writeFileSync(path.join(dir, 'fleet.json'), JSON.stringify(fleet, null, 1) + '\n');
  return { dir, fleet, onDisk: () => JSON.parse(fs.readFileSync(path.join(dir, 'fleet.json'), 'utf8')) };
}
const BASE = [
  { id: 'macmini', name: 'Mac Mini', host: 'macmini.tail48b61c.ts.net' },
  { id: 'macstudio', name: 'Mac Studio', host: 'macstudio.tail48b61c.ts.net', signageBatch: true, net: { lanIp: '192.168.1.9', mac: 'aa:bb' } },
  { id: 'reuniones-1', name: 'REUNIONES-1', host: 'reuniones-1.tail48b61c.ts.net' },
];

test('DELETE quita la entrada de fleet.json y de memoria, con copia de seguridad fechada y papelera', () => {
  const s = sandbox(BASE);
  const R = createMachineRemoval({ dir: s.dir, fleet: s.fleet, now: () => new Date(2026, 9, 19, 16, 5, 7, 42) });
  const out = R.remove('macstudio', { by: 'carlos@admira.com' });
  assert.equal(out.status, 200);
  assert.equal(out.body.removed, true);
  assert.equal(out.body.backup, 'fleet-20261019-160507-042.json');
  assert.deepEqual(s.fleet.machines.map((m) => m.id), ['macmini', 'reuniones-1'], 'memoria sin reiniciar');
  assert.deepEqual(s.onDisk().machines.map((m) => m.id), ['macmini', 'reuniones-1'], 'fleet.json');
  const bk = JSON.parse(fs.readFileSync(path.join(s.dir, 'fleet-backups', out.body.backup), 'utf8'));
  assert.equal(bk.machines.length, 3, 'la copia es el fleet.json de ANTES');
  const trash = JSON.parse(fs.readFileSync(path.join(s.dir, 'fleet-eliminados.json'), 'utf8'));
  assert.equal(trash.items[0].machine.id, 'macstudio'); assert.equal(trash.items[0].by, 'carlos@admira.com');
  assert.ok(!fs.readdirSync(s.dir).some((f) => f.includes('.tmp-')), 'escritura atómica sin restos');
});

test('restore devuelve la entrada COMPLETA (sin perder campos) y vacía la papelera', () => {
  const s = sandbox(BASE);
  const R = createMachineRemoval({ dir: s.dir, fleet: s.fleet });
  R.remove('macstudio');
  const out = R.restore('macstudio');
  assert.equal(out.status, 200); assert.equal(out.body.restored, true);
  const m = s.onDisk().machines.find((x) => x.id === 'macstudio');
  assert.equal(m.signageBatch, true); assert.equal(m.net.lanIp, '192.168.1.9');
  assert.ok(s.fleet.machines.some((x) => x.id === 'macstudio'));
  assert.equal(R.restore('macstudio').body.already, true, 'idempotente');
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.dir, 'fleet-eliminados.json'), 'utf8')).items.length, 0);
});

test('restore sin papelera usa la copia que manda la Function (mínimos validados) o da 404', () => {
  const s = sandbox(BASE);
  const R = createMachineRemoval({ dir: s.dir, fleet: s.fleet });
  assert.equal(R.restore('pc-nuevo').status, 404);
  const out = R.restore('pc-nuevo', { fallback: { id: 'pc-nuevo', name: 'PC Nuevo', host: 'pc-nuevo.tail48b61c.ts.net', platform: 'windows', evil: 'x' } });
  assert.equal(out.status, 200);
  assert.equal(out.body.machine.evil, undefined);
});

test('dryRun no escribe nada; ids admira-xxx y normalizados encuentran la entrada; desconocido 404; inválido 400', () => {
  const s = sandbox(BASE);
  const R = createMachineRemoval({ dir: s.dir, fleet: s.fleet });
  const d = R.remove('admira-reuniones1', { dryRun: true });
  assert.equal(d.status, 200); assert.equal(d.body.dryRun, true); assert.equal(d.body.machine.id, 'reuniones-1');
  assert.equal(s.fleet.machines.length, 3); assert.equal(s.onDisk().machines.length, 3);
  assert.ok(!fs.existsSync(path.join(s.dir, 'fleet-backups')));
  assert.equal(R.remove('no-existe').status, 404);
  assert.equal(R.remove('../../etc/passwd').status, 400);
  assert.equal(R.remove('macmini.tail48b61c.ts.net', { dryRun: true }).body.machine.id, 'macmini', 'por host');
});

test('id normalizado ambiguo → 409, no borra a ciegas; el id exacto siempre gana', () => {
  const lista = [{ id: 'luna', name: 'x' }, { id: 'admira-luna', name: 'y' }];
  assert.equal(findMachine(lista, 'admira-luna').idx, 1, 'exacto');
  const amb = findMachine(lista, 'LUNA!');
  assert.equal(amb.idx, -1); assert.deepEqual(amb.ambiguous, ['luna', 'admira-luna']);
  const s = sandbox(lista);
  const R = createMachineRemoval({ dir: s.dir, fleet: s.fleet });
  assert.equal(R.remove('Luna').status, 409);
  assert.equal(s.fleet.machines.length, 2);
});

test('ticket: firma, caducidad y token incorrecto', () => {
  const t = mintTicket('tok', { id: 'macstudio', accion: 'eliminar', email: 'c@a' }, 1000000);
  assert.equal(verifyTicket('tok', t, 1000000).id, 'macstudio');
  assert.equal(verifyTicket('tok2', t, 1000000), null);
  assert.equal(verifyTicket('tok', t, 1000000 + 121000), null);
  assert.throws(() => mintTicket('', { id: 'x', accion: 'eliminar' }));
  assert.throws(() => mintTicket('tok', { id: 'x', accion: 'apagar' }));
});

test('server.js expone DELETE /api/machines/:id (token o sesión), restore y ticket (solo sesión) y audita', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/machine-removal'\)/);
  assert.match(src, /\/\^\\\/api\\\/machines\\\/\(\[\^\/\]\+\)\(\?:\\\/\(restore\|ticket\)\)\?\$\//);
  assert.match(src, /sub === 'ticket'[\s\S]{0,200}gate\(req, res, ip\)\)\)/, 'ticket exige sesión, no token');
  assert.match(src, /!sub && req.method === 'DELETE'[\s\S]{0,120}gate\(req, res, ip, true\)/);
  assert.match(src, /ev: dryRun \? 'machine_remove_dry' : 'machine_remove'/);
});
