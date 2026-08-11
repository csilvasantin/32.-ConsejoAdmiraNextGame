const test = require('node:test');
const assert = require('node:assert/strict');

const { CALLBACK_URI, PUBLIC_ORIGIN, createChallengeStore, handoffOriginAllowed, parseGoogleCallback, safeReturnPath } = require('./auth-redirect');

test('callback y return_to quedan fijados a first-party exacto', () => {
  assert.equal(CALLBACK_URI, 'https://fleet.admira.live/api/auth/callback');
  assert.equal(PUBLIC_ORIGIN, 'https://www.admira.live');
  assert.equal(safeReturnPath('/control/?machine=mini#terminal'), '/control/?machine=mini#terminal');
  assert.equal(safeReturnPath('https://www.admira.live/control/'), '/control/');
  assert.equal(safeReturnPath('https://admira.live/equipos/'), '/equipos/');
  assert.equal(safeReturnPath('https://evil.example/steal'), '/control/');
  assert.equal(safeReturnPath('//evil.example/steal'), '/control/');
});

test('POST GIS exige form-urlencoded y doble g_csrf_token antes de exponer credential', () => {
  const body = new URLSearchParams({ credential:'secret-id-token', state:'state-1', g_csrf_token:'csrf-1' }).toString();
  assert.deepEqual(parseGoogleCallback(body, 'application/x-www-form-urlencoded', 'g_csrf_token=csrf-1'), { credential:'secret-id-token', state:'state-1' });
  assert.deepEqual(parseGoogleCallback(body, 'application/json', 'g_csrf_token=csrf-1'), { error:'invalid_form' });
  assert.deepEqual(parseGoogleCallback(body, 'application/x-www-form-urlencoded', 'g_csrf_token=otro'), { error:'csrf_invalid' });
  assert.doesNotMatch(JSON.stringify(parseGoogleCallback(body, 'application/x-www-form-urlencoded', 'g_csrf_token=otro')), /secret-id-token/);
});

test('state+nonce expiran y sólo se consumen una vez con su cookie propia', () => {
  let clock = 1000, sequence = 0;
  const store = createChallengeStore({ ttlMs:100, now:() => clock, randomBytes:() => Buffer.alloc(24, ++sequence) });
  const issued = store.issue('/control/', 'redirect');
  const cookie = `__Host-fleet_challenge=${encodeURIComponent(issued.state)}`;
  assert.equal(store.consume(cookie, issued.state, 'popup'), null);
  assert.equal(store.consume(cookie, issued.state, 'redirect').nonce, issued.nonce);
  assert.equal(store.consume(cookie, issued.state, 'redirect'), null, 'replay falla');
  const expired = store.issue('/control/', 'redirect'); clock += 101;
  assert.equal(store.consume(`__Host-fleet_challenge=${expired.state}`, expired.state, 'redirect'), null);
});

test('handoff acepta Origin www o null opaco sólo antes de cualquier credencial', () => {
  assert.equal(handoffOriginAllowed({origin:'https://www.admira.live'}), true);
  assert.equal(handoffOriginAllowed({origin:'https://www.admira.live', cookie:'__Host-fleet_session=stale'}), false);
  assert.equal(handoffOriginAllowed({origin:'https://www.admira.live', authorization:'Bearer x'}), false);
  assert.equal(handoffOriginAllowed({origin:'null'}), true);
  assert.equal(handoffOriginAllowed({origin:'null', cookie:'__Host-fleet_session=stale'}), false);
  assert.equal(handoffOriginAllowed({origin:'null', authorization:'Bearer x'}), false);
  assert.equal(handoffOriginAllowed({}), false);
  assert.equal(handoffOriginAllowed({origin:'https://evil.example'}), false);
});
