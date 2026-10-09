const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../control/fleet-mesh.js');
// Node 26 no publica el module.exports que esta UMD asigna dentro de la función.
// El navegador usa globalThis.AdmiraFleetMesh, que es el mismo objeto.
const meshMod = global.AdmiraFleetMesh;

const gate = fs.readFileSync(path.join(__dirname, '..', 'auth-gate.js'), 'utf8');

function meshCon(session, extra) {
  const calls = [];
  const mesh = meshMod.create({
    relays: [{ id: 'proxy', label: 'Puerta', base: 'https://fleet.admira.live/api', priority: 1 }],
    fetch: async (url, opts) => {
      opts = opts || {};
      calls.push({ url: String(url), method: String(opts.method || 'GET'), csrf: opts.headers && opts.headers['X-Fleet-CSRF'] });
      if (String(url).endsWith('/auth/session')) {
        if (session === 401) return { ok: false, status: 401, json: async () => ({ ok: false }) };
        return { ok: true, status: 200, json: async () => session };
      }
      return { ok: true, status: 200, json: async () => ({ machines: [{ id: 'macmini' }], ...(extra || {}) }) };
    }
  });
  return { mesh, calls };
}

test('la verja de agente no guarda csrf', () => {
  const ini = gate.indexOf('function entrarAgente');
  const fin = gate.indexOf('function modoSoloLectura');
  assert.ok(ini > 0 && fin > ini);
  const fn = gate.slice(ini, fin);
  assert.match(fn, /gateCsrf = ""/);
  assert.doesNotMatch(fn, /d\.csrf/);
  assert.match(gate, /d\.agent === true && d\.readOnly === true/);
  assert.match(gate, /solo lectura/);
  assert.match(gate, /d\.agent === true\) \{ loadGoogle/);
});

test('agente readOnly lee y no escribe, aunque la sesión traiga un csrf', async () => {
  const { mesh, calls } = meshCon({
    ok: true, agent: true, readOnly: true, name: 'SmithMacMini',
    email: 'agentes@silicio.admiranext.com', csrf: 'NO-DEBE-USARSE'
  });
  assert.equal(await mesh.ensureAnySession(), true);
  assert.equal(mesh.agentReadOnly(), true);
  const got = await mesh.json('/status');
  assert.equal(got.data.machines[0].id, 'macmini');
  await assert.rejects(mesh.json('/run', { method: 'POST', body: '{}' }), /solo lectura/);
  await assert.rejects(mesh.json('/action', { method: 'POST', body: '{}' }), /solo lectura/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  assert.equal(calls.some((c) => c.csrf === 'NO-DEBE-USARSE'), false);
});

test('persona con csrf sigue pudiendo escribir', async () => {
  const { mesh, calls } = meshCon({ ok: true, email: 'carlos@admira.com', csrf: 'csrf-persona' });
  assert.equal(await mesh.ensureAnySession(), true);
  assert.equal(mesh.agentReadOnly(), false);
  await mesh.json('/action', { method: 'POST', body: '{}' });
  const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/action'));
  assert.ok(post);
  assert.equal(post.csrf, 'csrf-persona');
});

test('agente sin readOnly y humano sin sesión no abren', async () => {
  const sinLectura = meshCon({ ok: true, agent: true, readOnly: false, csrf: 'tampoco' });
  assert.equal(await sinLectura.mesh.ensureAnySession(), false);
  assert.equal(sinLectura.mesh.agentReadOnly(), false);
  const anon = meshCon(401);
  assert.equal(await anon.mesh.ensureAnySession(), false);
});
