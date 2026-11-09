'use strict';

const { randomBytes: secureRandomBytes } = require('node:crypto');
const { ACTIVE, UNAVAILABLE } = require('./session-registry');
const { sessionMutationError } = require('./session-csrf');

const TICKET_TTL_MS = 30 * 1000;
const MAX_TICKETS = 1000;

function relaySessionCookie(token, maxAge) {
  if (typeof token !== 'string' || !token || !Number.isInteger(maxAge) || maxAge <= 0) throw new Error('relay_session_invalid');
  // The top-level public site and *.ts.net are different sites. CHIPS allows
  // this existing human session only in the current top-level site's partition.
  return `__Host-fleet_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

function clearRelaySessionCookie() {
  return '__Host-fleet_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned';
}

function createRelaySessionBridge({ allowOrigins, sessionState, isPrivateRequest, now = Date.now,
  randomBytes = secureRandomBytes, ttlMs = TICKET_TTL_MS, maxTickets = MAX_TICKETS } = {}) {
  if (!Array.isArray(allowOrigins) || typeof sessionState !== 'function' || typeof isPrivateRequest !== 'function') throw new Error('relay_bridge_unconfigured');
  const tickets = new Map();
  const fail = (status, error) => ({ status, body: { ok: false, error } });

  function prune() {
    const at = now();
    for (const [ticket, value] of tickets) if (value.expiresAt <= at) tickets.delete(ticket);
  }

  // `auth` is the human session already verified by the server's existing gate.
  // The token is copied unchanged from the request, never minted or exposed.
  function issue(req, token, auth) {
    if (req.method !== 'POST') return fail(405, 'method');
    const origin = String(req.headers.origin || '');
    if (!allowOrigins.includes(origin)) return fail(403, 'origin no permitido');
    if (!auth || auth.state !== ACTIVE || !auth.session || auth.agent || auth.readOnly) {
      return fail(auth && auth.state === UNAVAILABLE ? 503 : 403, 'sesión humana activa requerida');
    }
    const mutationError = sessionMutationError(req, auth.session, allowOrigins);
    if (mutationError) return fail(403, mutationError);
    const expiration = Number(auth.session.exp);
    if (typeof token !== 'string' || !token || !Number.isFinite(expiration) || expiration <= now()) return fail(401, 'sesión caducada');
    prune();
    if (tickets.size >= maxTickets) return fail(503, 'relay_ticket_busy');
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(ticket, { token, origin, expiresAt: Math.min(now() + ttlMs, expiration) });
    return { status: 200, body: { ok: true, ticket } };
  }

  async function consume(req, ticket) {
    if (req.method !== 'POST') return fail(405, 'method');
    const origin = String(req.headers.origin || '');
    if (!allowOrigins.includes(origin)) return fail(403, 'origin no permitido');
    if (!isPrivateRequest(req)) return fail(403, 'relay privado requerido');
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return fail(401, 'relay_ticket_invalid');
    prune();
    const value = tickets.get(ticket);
    // Remove synchronously before the registry await: concurrent redemptions
    // cannot both inherit the session, even when the registry is slow.
    tickets.delete(ticket);
    if (!value || value.expiresAt <= now()) return fail(401, 'relay_ticket_invalid');
    if (value.origin !== origin) return fail(403, 'origin no coincide');
    let auth;
    try { auth = await sessionState(value.token); }
    catch (_) { return fail(503, 'registro de sesión no disponible'); }
    if (!auth || auth.state !== ACTIVE || !auth.session) return fail(auth && auth.state === UNAVAILABLE ? 503 : 401, 'sesión no activa');
    // A slow check must not extend a ticket or the original session lifetime.
    if (value.expiresAt <= now()) return fail(401, 'relay_ticket_invalid');
    const maxAge = Math.floor((Number(auth.session.exp) - now()) / 1000);
    if (!Number.isFinite(maxAge) || maxAge <= 0) return fail(401, 'sesión caducada');
    return { status: 200, body: { ok: true }, cookie: relaySessionCookie(value.token, maxAge) };
  }

  return { issue, consume };
}

module.exports = { createRelaySessionBridge, relaySessionCookie, clearRelaySessionCookie, TICKET_TTL_MS, MAX_TICKETS };
