const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  resolveMachine, unknownMachineBody, commandTarget, gateThenTarget,
  selectControlId, frameRequest, inputRequest, frameFailure, fallbackBanner, classifyStatusFailure,
} = require('./machine-id');

const FLEET = [
  { id: 'macbookairplata', name: 'MacBook Air Plata', host: 'macbookairplata.tail48b61c.ts.net' },
  { id: 'macbookair16', name: 'MacBook Air 16', host: 'macbookair16plata.tail48b61c.ts.net' },
  { id: 'macmini', name: 'Mac Mini', host: 'macmini.tail48b61c.ts.net' },
  { id: 'dgx-spark', name: 'DGX Spark', host: 'dgx-spark.tail48b61c.ts.net' },
];

test('el id canónico del censo se queda en su máquina', () => {
  const found = resolveMachine(FLEET, 'macbookairplata');
  assert.equal(found.via, 'exact');
  assert.equal(found.machine.host, 'macbookairplata.tail48b61c.ts.net');
  assert.equal(resolveMachine(FLEET, 'macmini').machine.id, 'macmini');
  assert.equal(resolveMachine(FLEET, 'dgx-spark').machine.id, 'dgx-spark');
});

test('admira-macbookairplata es alias único de macbookairplata y no de otro Air', () => {
  for (const id of ['admira-macbookairplata', 'MacBookAirPlata', 'macbook-air-plata']) {
    const found = resolveMachine(FLEET, id);
    assert.equal(found.machine && found.machine.id, 'macbookairplata', id);
    assert.equal(found.via, 'alias', id);
    assert.notEqual(found.machine.host, 'macbookair16plata.tail48b61c.ts.net');
  }
  assert.equal(resolveMachine(FLEET, 'admira-macbookair16').machine.id, 'macbookair16');
  assert.equal(resolveMachine(FLEET, 'admira-dgx-spark').machine.id, 'dgx-spark');
});

test('un id desconocido, un prefijo o dos censo con la misma clave no eligen máquina', () => {
  for (const id of ['', '   ', 'macbookair', 'macbookairgold', 'admira-macbookairplata-extra', 'macbookairplata.local']) {
    const found = resolveMachine(FLEET, id);
    assert.equal(found.machine, null, id);
    const body = unknownMachineBody(id, found);
    assert.equal(body.retry, false);
    assert.equal(body.relay, false);
    assert.equal(body.matches, undefined);
    assert.doesNotMatch(JSON.stringify(body), /macmini|macbookair16|dgx-spark/);
  }
  const both = [
    { id: 'macbookairplata', host: 'short' },
    { id: 'admira-macbookairplata', host: 'long' },
  ];
  assert.equal(resolveMachine(both, 'macbookairplata').machine.host, 'short');
  assert.equal(resolveMachine(both, 'admira-macbookairplata').machine.host, 'long');
  const ambiguous = resolveMachine(both, 'MacBook Air Plata');
  assert.equal(ambiguous.machine, null);
  assert.equal(ambiguous.reason, 'ambiguous');
  const body = unknownMachineBody('MacBook Air Plata', ambiguous);
  assert.equal(body.error, 'máquina ambigua');
  assert.deepEqual(body.matches.sort(), ['admira-macbookairplata', 'macbookairplata']);
});

test('sin sesión no hay objetivo aunque el id canónico o el alias existan', () => {
  for (const id of ['macbookairplata', 'admira-macbookairplata', 'macmini']) {
    const denied = gateThenTarget(false, FLEET, id);
    assert.equal(denied.status, 401);
    assert.equal(denied.error, 'token requerido');
    assert.equal(denied.executed, false);
    assert.equal(denied.machine, null);
  }
});

test('con sesión, frame e input van a la máquina resuelta y un desconocido no se ejecuta', () => {
  const frame = frameRequest('admira-macbookairplata', FLEET);
  const input = inputRequest('admira-macbookairplata', FLEET, { type: 'move', x: 0.25, y: 0.5, button: 'left' });
  assert.equal(frame.path, '/live/frame');
  assert.equal(frame.query.machine, 'macbookairplata');
  assert.equal(input.path, '/input');
  assert.equal(input.body.machine, 'macbookairplata');
  assert.equal(input.body.type, 'move');
  assert.equal(input.body.x, 0.25);
  const allowed = gateThenTarget(true, FLEET, 'admira-macbookairplata');
  assert.equal(allowed.executed, true);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.machine.id, 'macbookairplata');
  assert.equal(allowed.via, 'alias');
  const target = commandTarget(FLEET, input.body.machine);
  assert.equal(target.ok, true);
  assert.equal(target.machine.host, 'macbookairplata.tail48b61c.ts.net');
  const missing = gateThenTarget(true, FLEET, 'no-such-machine');
  assert.equal(missing.status, 400);
  assert.equal(missing.executed, false);
  assert.equal(missing.body.error, 'máquina desconocida');
  assert.equal(missing.body.retry, false);
});

test('la tarjeta usa el id del censo cuando lo conoce y no inventa uno si no', () => {
  assert.equal(selectControlId('admira-macbookairplata', FLEET), 'macbookairplata');
  assert.equal(selectControlId({ id: 'admira-macmini' }, [{ id: 'macmini' }]), 'macmini');
  assert.equal(selectControlId('admira-macbookairplata', []), 'admira-macbookairplata');
  assert.equal(selectControlId('macbookairgold', FLEET), 'macbookairgold');
});

test('un 400 de máquina desconocida no se cuenta como relay y un timeout sí', () => {
  const census = frameFailure(
    { status: 400 },
    'HTTP 400 ' + JSON.stringify({
      error: 'máquina desconocida',
      requested: 'admira-macbookairplata',
      detail: 'Ese id no está en el censo de este relay. No es un fallo de ruta ni de permisos.',
      retry: false,
    })
  );
  assert.equal(census.definitive, true);
  assert.equal(census.retryMs, 15000);
  assert.equal(census.relayFault, false);
  assert.match(census.title, /desconocida/i);
  assert.match(census.cause, /admira-macbookairplata/);
  assert.match(census.hint, /No se prueba otro relay/);
  assert.doesNotMatch(census.hint, /probará otro relay|permiso|Grabación/);

  const timeout = frameFailure(Object.assign(new Error('sin respuesta en 12000 ms · Puerta pública'), { fleetMeshTimeout: true }), 'sin respuesta en 12000 ms · Puerta pública');
  assert.equal(timeout.relayFault, true);
  assert.equal(timeout.retryMs, 1200);
  assert.match(timeout.hint, /ese mismo relay/);
  assert.match(timeout.hint, /No es un permiso de captura/);
  assert.doesNotMatch(timeout.hint, /Grabación de pantalla/);

  assert.equal(frameFailure({ status: 424 }, 'HTTP 424 {"error":"capture_failed_or_no_permission"}').title, 'La máquina no devuelve imagen');
  assert.match(fallbackBanner('no-relay').text, /Sin relay de control disponible/);
  assert.doesNotMatch(fallbackBanner('census').text, /Sin relay de control disponible/);
  assert.match(fallbackBanner('census').text, /relay de control responde/);
  assert.match(fallbackBanner('paint').text, /no falta una ruta/);
  assert.equal(classifyStatusFailure({ code: 401 }, true), 'auth');
  assert.equal(classifyStatusFailure({ mesh: { attempts: [] }, message: 'sin respuesta en 12000 ms' }, true), 'census');
  assert.equal(classifyStatusFailure({ message: 'ningún relay de control disponible' }, false), 'no-relay');
});

test('el hub autoriza antes de resolver y el frame/input ejecutan la máquina resuelta', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  function block(start, end) {
    const from = src.indexOf(start);
    const to = src.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, start);
    return src.slice(from, to);
  }
  const routes = [
    ["if (url === '/api/live/frame')", "if (url === '/api/input'"],
    ["if (url === '/api/input' && req.method === 'POST')", 'DESPERTAR'],
    ["if (url === '/api/action' && req.method === 'POST')", 'CONTROL REMOTO EN VIVO'],
    ["if (url === '/api/run' && req.method === 'POST')", 'TERMINAL INTERACTIVA'],
  ];
  for (const [start, end] of routes) {
    const chunk = block(start, end);
    const gateAt = chunk.indexOf('await gate(');
    const machineAt = chunk.indexOf('rejectUnknownMachine(');
    assert.ok(gateAt >= 0 && machineAt > gateAt, start);
    assert.doesNotMatch(chunk, /machineById\(body\.machine\)|machineById\(q\.get\('machine'\)\)/);
  }
  const frame = block("if (url === '/api/live/frame')", "if (url === '/api/input'");
  const input = block("if (url === '/api/input' && req.method === 'POST')", 'DESPERTAR');
  assert.match(frame, /CaptureClient\.macosCaptureCommand\(dsp, frameOptions\)/);
  assert.match(frame, /: fn\(dsp, m\)/);
  assert.match(frame, /run\(m, cmd, 22000\)/);
  assert.match(input, /run\(m, cmd, 8000\)/);
  assert.match(input, /machine: m\.id/);
  assert.doesNotMatch(frame + input, /allowToken:\s*true|gate\(req, res, ip, true\)/);
});
