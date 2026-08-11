const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const gate = fs.readFileSync(path.join(__dirname, '..', 'auth-gate.js'), 'utf8');
const mesh = fs.readFileSync(path.join(__dirname, '..', 'control', 'fleet-mesh.js'), 'utf8');
const headers = fs.readFileSync(path.join(__dirname, '..', '_headers'), 'utf8');

test('Google se valida sin token en URL y con claims+nonce completos', () => {
  assert.match(server, /fetch\('https:\/\/oauth2\.googleapis\.com\/tokeninfo',\s*\{/);
  assert.doesNotMatch(server, /tokeninfo\?id_token/);
  for (const claim of ['GOOGLE_ISSUERS', 'd.aud', 'd.exp', 'd.iat', 'd.email_verified', 'd.nonce']) assert.match(server, new RegExp(claim.replace('.', '\\.')));
});

test('challenge es ligado a cookie, expira y se consume una vez', () => {
  assert.match(server, /__Host-fleet_challenge/);
  assert.match(server, /consumeChallenge\(req/);
  assert.match(server, /row\.used/);
  assert.match(server, /row\.expiresAt<Date\.now\(\)/);
  assert.match(gate, /nonce:challenge\.nonce/);
  assert.match(gate, /state:activeChallenge\.state/);
});

test('sesión queda en cookie segura, rota y no vuelve en JSON o storage', () => {
  assert.match(server, /__Host-fleet_session/);
  assert.match(server, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(server, /jti=crypto\.randomBytes/);
  assert.doesNotMatch(server, /session:\s*mintSession/);
  assert.doesNotMatch(mesh, /sessionStorage|Authorization\s*=/);
  assert.doesNotMatch(gate, /localStorage\.setItem/);
  assert.match(headers, /\/control\/\*[\s\S]*Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/);
});

test('CORS, mutaciones, logout y CSP fallan cerrados', () => {
  assert.match(server, /ALLOW_ORIGINS\.includes\(o\)/);
  assert.match(server, /Access-Control-Allow-Credentials/);
  assert.match(server, /Access-Control-Allow-Private-Network/);
  assert.match(server, /access-control-request-private-network/);
  assert.match(server, /origin no permitido/);
  assert.match(server, /\/api\/auth\/logout/);
  assert.match(server, /_activeSessions\.delete/);
  assert.match(server, /_activeSessions\.get/);
  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /default-src 'none'; frame-ancestors 'none'; base-uri 'none'/);
});
