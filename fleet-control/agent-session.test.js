'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { agentDenied, createAgentCodec, readAgentToken, sameSecret, AGENT_EMAIL } = require('./agent-session');
const Capture = require('./capture-client');

test('el agente lee el censo y no ejecuta captura, terminal ni escrituras', () => {
  assert.equal(agentDenied('GET', '/api/status'), false);
  assert.equal(agentDenied('GET', '/fleet/api/health'), false);
  assert.equal(agentDenied('HEAD', '/api/vigia'), false);
  assert.equal(agentDenied('GET', '/api/live/frame?machine=macmini'), true);
  assert.equal(agentDenied('GET', '/fleet/api/preflight'), true);
  assert.equal(agentDenied('POST', '/api/action'), true);
  assert.equal(agentDenied('DELETE', '/api/machines/macstudio'), true);
});

test('la cookie caduca con el secreto que la firmó y no con otro', () => {
  const codec = createAgentCodec({ token: 'a'.repeat(40), now: () => 1_000_000 });
  const cookie = codec.mint('Smith');
  assert.equal(codec.verify(cookie).email, AGENT_EMAIL);
  assert.equal(codec.verify(cookie).name, 'Smith');
  assert.equal(createAgentCodec({ token: 'b'.repeat(40), now: () => 1_000_000 }).verify(cookie), null);
  assert.equal(codec.verify('no.es.cookie'), null);
  assert.equal(sameSecret('corto', 'a'.repeat(40)), false);
});

test('el fichero del token se rechaza si no es 0600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tok-'));
  const file = path.join(dir, 'tok');
  fs.writeFileSync(file, 'c'.repeat(40), { mode: 0o644 });
  assert.equal(readAgentToken({ environment: { ADMIRA_AGENT_LOGIN_TOKEN_FILE: file } }), '');
  fs.chmodSync(file, 0o600);
  assert.equal(readAgentToken({ environment: { ADMIRA_AGENT_LOGIN_TOKEN_FILE: file } }), 'c'.repeat(40));
  assert.equal(readAgentToken({ environment: { ADMIRA_AGENT_LOGIN_TOKEN: 'd'.repeat(40) } }), 'd'.repeat(40));
});

test('el hub conserva captura v3, alias de máquina, lista de acceso, baja y sesión de agente', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/agent-session'\)/);
  assert.match(src, /require\('\.\/machine-removal'\)/);
  assert.match(src, /function rejectUnknownMachine/);
  assert.match(src, /CaptureClient\.macosCaptureCommand/);
  assert.match(src, /FALLBACK_ALLOW = \['csilva@admira\.com', 'csilvasantin@gmail\.com'\]/);
  assert.match(src, /return 'LOCKED'/);
  assert.match(src, /\/api\/auth\/agente/);
  assert.match(Capture.macosCaptureCommand(0), /capture-queue/);
  assert.doesNotMatch(Capture.macosProbeCommand(), /capture\.req/);
  const vigia = fs.readFileSync(path.join(__dirname, 'control-vigia.js'), 'utf8');
  assert.match(vigia, /versionAgenteCanonico/);
  assert.doesNotMatch(vigia, /> "\$D\/capture\.req"/);
});
