const test = require('node:test');
const assert = require('node:assert/strict');

const { ACTIVE, REVOKED, UNAVAILABLE, createSessionRegistry, logoutEndpointPolicy, sessionEndpointPolicy } = require('./session-registry');

function registry(fetchImpl) {
  return createSessionRegistry({
    api:'https://auth.invalid/auth/session/',
    secret:'s'.repeat(64),
    fetchImpl,
    timeout:() => undefined,
  });
}

test('/api/auth/session distingue active, revoked y caída del edge', async () => {
  assert.equal(await registry(async () => new Response(null, {status:200})).check({}), ACTIVE);
  assert.equal(await registry(async () => new Response(null, {status:401})).check({}), REVOKED);
  assert.equal(await registry(async () => new Response(null, {status:503})).check({}), UNAVAILABLE);
  assert.equal(await registry(async () => { throw new Error('timeout'); }).check({}), UNAVAILABLE);
  assert.deepEqual(sessionEndpointPolicy(REVOKED), {status:401, clearCookie:true});
  assert.deepEqual(sessionEndpointPolicy(UNAVAILABLE), {status:503, clearCookie:false});
});

test('logout confirma revocación en 200/401 y conserva sesión ante 5xx/timeout', async () => {
  assert.equal(await registry(async () => new Response(null, {status:200})).revoke({}), REVOKED);
  assert.equal(await registry(async () => new Response(null, {status:401})).revoke({}), REVOKED);
  assert.equal(await registry(async () => new Response(null, {status:500})).revoke({}), UNAVAILABLE);
  assert.equal(await registry(async () => { throw new Error('timeout'); }).revoke({}), UNAVAILABLE);
  assert.deepEqual(logoutEndpointPolicy(true, REVOKED), {status:200, clearCookie:true});
  assert.deepEqual(logoutEndpointPolicy(true, UNAVAILABLE), {status:503, clearCookie:false});
});
