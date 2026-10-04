'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGrokBotRouter } = require('./grokbot-encargo');

test('server.js deja remote con el chat en webhook y no arranca el escritorio', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(server, /const grokBotDesktop = createGrokBotDesktop\(\);/);
  assert.match(server, /GROKBOT_CHAT_PROVIDER === 'desktop'\s*\?\s*grokBotDesktop : grokBotLegacy/);
  assert.match(server, /if \(!grokBotBridge\.remote\) grokBotBridge\.remote = \(\.\.\.a\) => grokBotDesktop\.remote\(\.\.\.a\);/);
  assert.doesNotMatch(server, /grokBotDesktop\.start\(/);
});

test('el router de webhook recibe remote del escritorio y su start no lo sondea', async () => {
  let baseStarted = false;
  let desktopStarted = false;
  const base = {
    start() { baseStarted = true; },
    stop() {},
    get() { return null; },
  };
  const desktop = {
    start() { desktopStarted = true; },
    async remote(_session, body) {
      assert.equal(body.persona, 'Wozniak');
      return { token: 'tok-test', frame: { jpeg: '/9j/aaaa', width: 10, height: 10 } };
    },
  };
  const encargo = { handles() { return false; }, fallback() {}, async get() { return null; } };
  const provider = 'webhook';
  const grokBotBase = provider === 'desktop' ? desktop : base;
  const bridge = createGrokBotRouter({ base: grokBotBase, encargo, inbox: base });
  if (!bridge.remote) bridge.remote = (...a) => desktop.remote(...a);
  assert.equal(typeof bridge.remote, 'function');
  const out = await bridge.remote({ email: 'ops@example.test', jti: 'jti' }, { action: 'open', persona: 'Wozniak' });
  assert.equal(out.token, 'tok-test');
  assert.match(out.frame.jpeg, /^\/9j\//);
  bridge.start();
  assert.equal(baseStarted, true);
  assert.equal(desktopStarted, false);
});
