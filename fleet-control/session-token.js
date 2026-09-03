'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOKEN_VERSION = 1;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function deriveSessionSecret(material) {
  const source = Buffer.from(String(material || ''), 'utf8');
  if (source.length < 32) throw new Error('FLEET_SESSION_SECRET debe tener al menos 32 bytes');
  // Separacion de dominio para que el material configurado no se use como HMAC
  // de sesion directamente.
  return crypto.createHash('sha256').update('admira-fleet-session-v1\0').update(source).digest();
}

function readSecretFile(file, label, fsImpl = fs) {
  const noFollow = Number(fsImpl.constants.O_NOFOLLOW || 0);
  let descriptor;
  try {
    descriptor = fsImpl.openSync(file, fsImpl.constants.O_RDONLY | noFollow);
    const stat = fsImpl.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('not_regular');
    if ((stat.mode & 0o777) !== 0o600) throw new Error('unsafe_permissions');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('wrong_owner');
    const material = String(fsImpl.readFileSync(descriptor, 'utf8') || '').trim();
    if (Buffer.byteLength(material, 'utf8') < 32) throw new Error('too_short');
    return material;
  } catch (error) {
    // No incluir el contenido ni el error del sistema en el mensaje público.
    throw new Error('no se pudo cargar ' + label + ' de forma segura', {cause:error});
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
  }
}

function loadSecretMaterial({environment, homeDir, fsImpl, directName, fileName, defaultName}) {
  // Incluso un env directo vacío/corto bloquea el fallback: la configuración
  // equivocada debe fallar cerrada, no seleccionar silenciosamente otra clave.
  if (Object.prototype.hasOwnProperty.call(environment, directName)) {
    const material = String(environment[directName] || '').trim();
    if (Buffer.byteLength(material, 'utf8') < 32) throw new Error(directName + ' debe tener al menos 32 bytes');
    return material;
  }
  const explicit = Object.prototype.hasOwnProperty.call(environment, fileName);
  const file = explicit
    ? String(environment[fileName] || '').trim()
    : path.join(homeDir, '.fleet', defaultName);
  if (!file || !path.isAbsolute(file)) throw new Error(fileName + ' debe ser una ruta absoluta');
  return readSecretFile(file, fileName, fsImpl);
}

function loadSessionSecretMaterial({environment = process.env, homeDir = os.homedir(), fsImpl = fs} = {}) {
  return loadSecretMaterial({environment, homeDir, fsImpl, directName:'FLEET_SESSION_SECRET', fileName:'FLEET_SESSION_SECRET_FILE', defaultName:'fleet-session-secret'});
}

function loadAuthEdgeSecretMaterial({environment = process.env, homeDir = os.homedir(), fsImpl = fs} = {}) {
  return loadSecretMaterial({environment, homeDir, fsImpl, directName:'AUTH_EDGE_SHARED_SECRET', fileName:'AUTH_EDGE_SHARED_SECRET_FILE', defaultName:'auth-edge-shared-secret'});
}

function createSessionCodec({secret, ttlMs, now = Date.now, randomBytes = crypto.randomBytes}) {
  const key = Buffer.from(secret || '');
  if (key.length < 32) throw new Error('session signing key debe tener al menos 32 bytes');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('session ttl invalido');

  const sign = payload => crypto.createHmac('sha256', key).update(payload).digest('base64url');

  function normalizeClaims(value) {
    const claims = {
      v:TOKEN_VERSION,
      email:String(value && value.email || '').trim().toLowerCase(),
      jti:String(value && value.jti || ''),
      csrf:String(value && value.csrf || ''),
      iat:Number(value && value.iat),
      exp:Number(value && value.exp),
    };
    if (!claims.email || !/^[A-Za-z0-9_-]{24,64}$/.test(claims.jti) || !/^[A-Za-z0-9_-]{32}$/.test(claims.csrf)) return null;
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp - claims.iat !== ttlMs) return null;
    return claims;
  }

  function mintClaims(value) {
    const claims = normalizeClaims(value);
    if (!claims) throw new Error('claims de sesion invalidos');
    const payload = base64url(JSON.stringify(claims));
    return payload + '.' + sign(payload);
  }

  function mint(email) {
    const issuedAt = Number(now());
    return mintClaims({
      email,
      jti:randomBytes(18).toString('base64url'),
      csrf:randomBytes(24).toString('base64url'),
      iat:issuedAt,
      exp:issuedAt + ttlMs,
    });
  }

  function verify(token) {
    if (!token || typeof token !== 'string') return null;
    const separator = token.lastIndexOf('.');
    if (separator < 1) return null;
    const payload = token.slice(0, separator), signature = token.slice(separator + 1);
    const expected = sign(payload);
    const suppliedBytes = Buffer.from(signature), expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) return null;
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (_) { return null; }
    const checkedAt = Number(now());
    if (!claims || claims.v !== TOKEN_VERSION || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;
    if (claims.iat > checkedAt + 5 * 60 * 1000 || claims.exp < checkedAt || claims.exp - claims.iat !== ttlMs) return null;
    const normalized = normalizeClaims(claims);
    if (!normalized) return null;
    return {email:normalized.email, jti:normalized.jti, iat:normalized.iat, exp:normalized.exp, csrf:normalized.csrf};
  }

  return {mint, mintClaims, verify};
}

module.exports = { createSessionCodec, deriveSessionSecret, loadAuthEdgeSecretMaterial, loadSessionSecretMaterial, readSecretFile };
