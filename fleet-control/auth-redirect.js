'use strict';

const crypto = require('crypto');

const CALLBACK_URI = 'https://fleet.admira.live/api/auth/callback';
const PUBLIC_ORIGIN = 'https://www.admira.live';
const RETURN_ORIGINS = new Set([PUBLIC_ORIGIN, 'https://admira.live']);
const CHALLENGE_COOKIE = '__Host-fleet_challenge';

function parseCookies(header) {
  const out = {};
  for (const item of String(header || '').split(';')) {
    const at = item.indexOf('=');
    if (at < 1) continue;
    try { out[item.slice(0, at).trim()] = decodeURIComponent(item.slice(at + 1).trim()); } catch (_) {}
  }
  return out;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeReturnPath(value) {
  const raw = String(value || '/control/');
  if (/[\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//')) return '/control/';
  try {
    const parsed = new URL(raw, PUBLIC_ORIGIN);
    if (!RETURN_ORIGINS.has(parsed.origin.toLowerCase())) return '/control/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) { return '/control/'; }
}

function createChallengeStore({ ttlMs = 10 * 60 * 1000, now = Date.now, randomBytes = crypto.randomBytes } = {}) {
  const rows = new Map();
  return {
    issue(returnTo, flow = 'popup') {
      const issuedAt = now();
      const state = randomBytes(24).toString('base64url');
      const nonce = randomBytes(24).toString('base64url');
      const row = { nonce, returnPath:safeReturnPath(returnTo), flow, expiresAt:issuedAt + ttlMs };
      rows.set(state, row);
      for (const [key, value] of rows) if (value.expiresAt < issuedAt) rows.delete(key);
      return { state, ...row };
    },
    consume(cookieHeader, state, flow = 'popup') {
      const row = rows.get(String(state || ''));
      const cookieState = parseCookies(cookieHeader)[CHALLENGE_COOKIE] || '';
      if (!row || !safeEqual(state, cookieState) || row.flow !== flow || row.expiresAt < now()) return null;
      rows.delete(state);
      return row;
    },
  };
}

function parseGoogleCallback(raw, contentType, cookieHeader) {
  const type = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded' || String(raw || '').length > 20000) return { error:'invalid_form' };
  const form = new URLSearchParams(String(raw || ''));
  const cookieCsrf = parseCookies(cookieHeader).g_csrf_token || '';
  const bodyCsrf = form.get('g_csrf_token') || '';
  if (!safeEqual(cookieCsrf, bodyCsrf)) return { error:'csrf_invalid' };
  const credential = form.get('credential') || '', state = form.get('state') || '';
  if (!credential || credential.length > 16384 || !state) return { error:'invalid_form' };
  return { credential, state };
}

function handoffOriginAllowed(headers) {
  const origin = String(headers && headers.origin || '');
  if (origin !== PUBLIC_ORIGIN && origin !== 'null') return false;
  return !headers.cookie && !headers.authorization && !headers['x-fleet-token'] && !headers['x-fleet-session'];
}

module.exports = { CALLBACK_URI, PUBLIC_ORIGIN, createChallengeStore, handoffOriginAllowed, parseGoogleCallback, safeReturnPath };
