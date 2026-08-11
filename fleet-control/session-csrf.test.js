const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionMutationError } = require('./session-csrf');

const origins = ['https://www.admira.live', 'https://admira.live'];
const session = {csrf:'csrf-exacto'};
const request = (origin, csrf) => ({method:'POST', headers:{...(origin ? {origin} : {}), ...(csrf ? {'x-fleet-csrf':csrf} : {})}});

test('cookie-auth mutante rechaza Origin ausente o malicioso antes del CSRF', () => {
  assert.equal(sessionMutationError(request('', 'csrf-exacto'), session, origins), 'origin no permitido');
  assert.equal(sessionMutationError(request('https://evil.example', 'csrf-exacto'), session, origins), 'origin no permitido');
});

test('Origin exacto requiere CSRF presente y coincidente', () => {
  assert.equal(sessionMutationError(request(origins[0], ''), session, origins), 'csrf inválido');
  assert.equal(sessionMutationError(request(origins[0], 'otro'), session, origins), 'csrf inválido');
  assert.equal(sessionMutationError(request(origins[0], 'csrf-exacto'), session, origins), '');
});

test('las lecturas no exigen CSRF y los tokens de máquina no pasan por este helper', () => {
  assert.equal(sessionMutationError({method:'GET', headers:{}}, session, origins), '');
  assert.equal(sessionMutationError(request(origins[0], 'csrf-exacto'), null, origins), 'csrf inválido');
});
