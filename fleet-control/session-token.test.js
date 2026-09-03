const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSessionCodec, deriveSessionSecret, loadAuthEdgeSecretMaterial, loadSessionSecretMaterial } = require('./session-token');

function deterministicRandom(size) {
  return Buffer.alloc(size, 7);
}

test('una sesion emitida por un relay valida en otro y tras reiniciar', () => {
  let clock = 10_000;
  const secret = deriveSessionSecret('s'.repeat(64));
  const firstRelay = createSessionCodec({secret, ttlMs:43_200_000, now:() => clock, randomBytes:deterministicRandom});
  const token = firstRelay.mint('Owner@Example.com');

  const secondRelay = createSessionCodec({secret, ttlMs:43_200_000, now:() => clock});
  assert.deepEqual(secondRelay.verify(token), {
    email:'owner@example.com',
    jti:'BwcHBwcHBwcHBwcHBwcHBwcH',
    iat:10_000,
    exp:43_210_000,
    csrf:'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH',
  });

  const restartedSecondRelay = createSessionCodec({secret, ttlMs:43_200_000, now:() => clock});
  assert.deepEqual(restartedSecondRelay.verify(token), secondRelay.verify(token));
  clock = 43_210_001;
  assert.equal(restartedSecondRelay.verify(token), null, 'expira después de 12 horas');
});

test('dos relays firman exactamente la concesion estable creada por AuthStore', () => {
  const secret = deriveSessionSecret('z'.repeat(64));
  const claims = {email:'owner@example.com', jti:'j'.repeat(24), csrf:'c'.repeat(32), iat:1000, exp:43_201_000};
  const first = createSessionCodec({secret, ttlMs:43_200_000, now:() => 1001});
  const second = createSessionCodec({secret, ttlMs:43_200_000, now:() => 1002});
  assert.equal(first.mintClaims(claims), second.mintClaims(claims));
  assert.deepEqual(second.verify(first.mintClaims(claims)), {...claims});
});

test('otra clave, una firma alterada o claims con formato incorrecto no validan', () => {
  const codec = createSessionCodec({secret:deriveSessionSecret('a'.repeat(64)), ttlMs:1000, now:() => 1000, randomBytes:deterministicRandom});
  const token = codec.mint('owner@example.com');
  const otherRelay = createSessionCodec({secret:deriveSessionSecret('b'.repeat(64)), ttlMs:1000, now:() => 1000});
  assert.equal(otherRelay.verify(token), null);
  assert.equal(codec.verify(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), null);
  assert.equal(codec.verify('not-a-token'), null);
});

test('la derivacion exige material compartido fuerte y separa dominios', () => {
  assert.throws(() => deriveSessionSecret('short'), /32 bytes/);
  assert.notDeepEqual(deriveSessionSecret('x'.repeat(32)), Buffer.from('x'.repeat(32)));
  assert.deepEqual(deriveSessionSecret('x'.repeat(32)), deriveSessionSecret('x'.repeat(32)));
});

test('env directo tiene prioridad estricta y un valor corto falla cerrado', () => {
  const material = 'direct-'.repeat(8);
  assert.equal(loadSessionSecretMaterial({
    environment:{FLEET_SESSION_SECRET:material, FLEET_SESSION_SECRET_FILE:'/does/not/exist'},
    homeDir:'/also/missing',
  }), material);
  assert.throws(
    () => loadSessionSecretMaterial({environment:{FLEET_SESSION_SECRET:'secret-corto'}, homeDir:'/missing'}),
    error => /32 bytes/.test(error.message) && !error.message.includes('secret-corto'),
  );
});

test('acepta fichero 0600 >=32 bytes y falla cerrado si falta, es corto o permisivo', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-session-test-'));
  try {
    const validFile = path.join(directory, 'valid');
    const shortFile = path.join(directory, 'short');
    const looseFile = path.join(directory, 'loose');
    const symlinkFile = path.join(directory, 'symlink');
    fs.writeFileSync(validFile, 'v'.repeat(64), {mode:0o600});
    fs.writeFileSync(shortFile, 'short', {mode:0o600});
    fs.writeFileSync(looseFile, 'l'.repeat(64), {mode:0o644});
    fs.symlinkSync(validFile, symlinkFile);
    assert.equal(loadSessionSecretMaterial({environment:{FLEET_SESSION_SECRET_FILE:validFile}}), 'v'.repeat(64));
    for (const file of [path.join(directory, 'missing'), shortFile, looseFile, symlinkFile]) {
      assert.throws(() => loadSessionSecretMaterial({environment:{FLEET_SESSION_SECRET_FILE:file}}), /no se pudo cargar/);
    }
  } finally {
    fs.rmSync(directory, {recursive:true, force:true});
  }
});

test('usa ~/.fleet/fleet-session-secret como único fallback', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-session-home-'));
  try {
    const fleetDirectory = path.join(directory, '.fleet');
    fs.mkdirSync(fleetDirectory, {mode:0o700});
    fs.writeFileSync(path.join(fleetDirectory, 'fleet-session-secret'), 'h'.repeat(64), {mode:0o600});
    assert.equal(loadSessionSecretMaterial({environment:{}, homeDir:directory}), 'h'.repeat(64));
    assert.throws(() => loadSessionSecretMaterial({environment:{FLEET_SESSION_SECRET_FILE:'relative'}}), /ruta absoluta/);
  } finally {
    fs.rmSync(directory, {recursive:true, force:true});
  }
});

test('AUTH_EDGE_SHARED_SECRET usa env, fichero seguro y fallback propio', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-edge-secret-home-'));
  try {
    const fleetDirectory = path.join(directory, '.fleet');
    const explicitFile = path.join(directory, 'edge-secret');
    fs.mkdirSync(fleetDirectory, {mode:0o700});
    fs.writeFileSync(explicitFile, 'e'.repeat(64), {mode:0o600});
    fs.writeFileSync(path.join(fleetDirectory, 'auth-edge-shared-secret'), 'f'.repeat(64), {mode:0o600});
    assert.equal(loadAuthEdgeSecretMaterial({environment:{AUTH_EDGE_SHARED_SECRET:'d'.repeat(64)}, homeDir:directory}), 'd'.repeat(64));
    assert.equal(loadAuthEdgeSecretMaterial({environment:{AUTH_EDGE_SHARED_SECRET_FILE:explicitFile}, homeDir:directory}), 'e'.repeat(64));
    assert.equal(loadAuthEdgeSecretMaterial({environment:{}, homeDir:directory}), 'f'.repeat(64));
    assert.throws(() => loadAuthEdgeSecretMaterial({environment:{AUTH_EDGE_SHARED_SECRET:'short'}, homeDir:directory}), /32 bytes/);
  } finally {
    fs.rmSync(directory, {recursive:true, force:true});
  }
});
