'use strict';

// Sesión de agente de solo lectura para FleetControl (encargo #5411).
// El secreto ADMIRA_AGENT_LOGIN_TOKEN no se escribe aquí: entra por argumento
// o por un fichero 0600 fuera del repo. La cookie firma con una clave derivada
// de ese secreto, así que rotarlo deja de verificar las cookies ya emitidas.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AGENT_COOKIE = '__Host-fleet_agent';
const AGENT_TTL_MS = 24 * 3600 * 1000;
const AGENT_EMAIL = 'agentes@silicio.admiranext.com';
const AGENT_VERSION = 'v.09.10.2026.agente-lectura.1';
const TOKEN_MIN = 32;
const TOKEN_MAX = 512;

function sameSecret(given, expected) {
  const left = Buffer.from(String(given || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function agentName(raw) {
  const clean = String(raw || '').replace(/[^\p{L}\p{N} ._·@-]/gu, '').slice(0, 80).trim();
  return clean || 'agente';
}

function normalizeRoute(url) {
  const pathOnly = String(url || '').split('?')[0];
  if (pathOnly === '/fleet') return '/';
  if (pathOnly.startsWith('/fleet/')) return pathOnly.slice('/fleet'.length);
  return pathOnly;
}

// GET de estado (Control, vigía, capacidades) sigue abierto.
// Estas lecturas disparan captura, preflight o un PTY: cuentan como ejecución.
const EXECUTE_GET = new Set([
  '/api/live/frame',
  '/api/preflight',
  '/api/displays',
  '/api/term/stream',
]);

function agentDenied(method, url) {
  const verb = String(method || 'GET').toUpperCase();
  const route = normalizeRoute(url);
  if (verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS') return true;
  return EXECUTE_GET.has(route);
}

function createAgentCodec({ token, ttlMs = AGENT_TTL_MS, now = Date.now }) {
  const material = Buffer.from(String(token || ''), 'utf8');
  if (material.length < TOKEN_MIN || material.length > TOKEN_MAX) throw new Error('token de agente fuera de rango');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttl de agente invalido');
  const key = crypto.createHash('sha256').update('admira-fleet-agent-cookie-v1\0').update(material).digest();
  const fp = crypto.createHash('sha256').update('admira-fleet-agent-fp-v1\0').update(material).digest('base64url').slice(0, 22);

  function sign(payload) {
    return crypto.createHmac('sha256', key).update(payload).digest('base64url');
  }

  function mint(name) {
    const iat = Number(now());
    const claims = {
      v: 1,
      kind: 'agent',
      name: agentName(name),
      email: AGENT_EMAIL,
      fp,
      iat,
      exp: iat + ttlMs,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return payload + '.' + sign(payload);
  }

  function verify(cookie) {
    if (!cookie || typeof cookie !== 'string') return null;
    const separator = cookie.lastIndexOf('.');
    if (separator < 1) return null;
    const payload = cookie.slice(0, separator);
    const signature = cookie.slice(separator + 1);
    const expected = sign(payload);
    const suppliedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) return null;
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (_) { return null; }
    const checkedAt = Number(now());
    if (!claims || claims.v !== 1 || claims.kind !== 'agent' || claims.fp !== fp) return null;
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;
    if (claims.exp - claims.iat !== ttlMs) return null;
    if (claims.iat > checkedAt + 5 * 60 * 1000 || claims.exp < checkedAt) return null;
    return {
      agent: true,
      readOnly: true,
      name: agentName(claims.name),
      email: AGENT_EMAIL,
      iat: claims.iat,
      exp: claims.exp,
    };
  }

  return { mint, verify, fingerprint: fp, ttlMs };
}

function readAgentToken({ environment = process.env, homeDir = os.homedir(), fsImpl = fs } = {}) {
  if (Object.prototype.hasOwnProperty.call(environment, 'ADMIRA_AGENT_LOGIN_TOKEN')) {
    return String(environment.ADMIRA_AGENT_LOGIN_TOKEN || '').trim();
  }
  const explicit = Object.prototype.hasOwnProperty.call(environment, 'ADMIRA_AGENT_LOGIN_TOKEN_FILE');
  const file = explicit
    ? String(environment.ADMIRA_AGENT_LOGIN_TOKEN_FILE || '').trim()
    : path.join(homeDir, '.fleet', 'admira-agent-login-token');
  if (!file || !path.isAbsolute(file)) return '';
  let descriptor;
  try {
    const noFollow = Number(fsImpl.constants.O_NOFOLLOW || 0);
    descriptor = fsImpl.openSync(file, fsImpl.constants.O_RDONLY | noFollow);
    const stat = fsImpl.fstatSync(descriptor);
    if (!stat.isFile()) return '';
    if ((stat.mode & 0o777) !== 0o600) return '';
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return '';
    return String(fsImpl.readFileSync(descriptor, 'utf8') || '').trim();
  } catch (_) {
    return '';
  } finally {
    if (descriptor !== undefined) {
      try { fsImpl.closeSync(descriptor); } catch (_) {}
    }
  }
}

module.exports = {
  AGENT_COOKIE,
  AGENT_EMAIL,
  AGENT_TTL_MS,
  AGENT_VERSION,
  TOKEN_MIN,
  TOKEN_MAX,
  agentDenied,
  agentName,
  createAgentCodec,
  normalizeRoute,
  readAgentToken,
  sameSecret,
};
