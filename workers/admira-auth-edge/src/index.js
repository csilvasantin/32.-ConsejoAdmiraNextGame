const PUBLIC_ORIGIN = 'https://www.admira.live';
const API_HANDOFF = 'https://fleet.admira.live/api/auth/handoff';
const LOGIN_URI = PUBLIC_ORIGIN + '/auth/callback';
const GOOGLE_CLIENT_ID = '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
const WHITELIST_URL = 'https://admira-whitelist.csilvasantin.workers.dev/list';
const CHALLENGE_COOKIE = '__Host-fleet_challenge';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

function token(bytes = 24) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let raw = '';
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseCookies(header) {
  const out = Object.create(null);
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    try { out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim()); } catch (_) {}
  }
  return out;
}

function equalText(left, right) {
  const a = String(left || ''), b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function safeReturnPath(value) {
  const raw = String(value || '/control/');
  if (/[\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//')) return '/control/';
  try {
    const parsed = new URL(raw, PUBLIC_ORIGIN);
    if (parsed.origin !== PUBLIC_ORIGIN && parsed.origin !== 'https://admira.live') return '/control/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) { return '/control/'; }
}

async function readBody(request, type, limit) {
  if (String(request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== type) return null;
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) return null;
  const raw = await request.text();
  return raw.length <= limit ? raw : null;
}

function challengeCookie(state, maxAge = CHALLENGE_TTL_MS / 1000) {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

function json(body, status = 200, extra = {}) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'", ...extra}});
}

async function verifyGoogle(credential, nonce, env, fetchImpl, now = Date.now()) {
  if (!credential || credential.length > 16384 || !nonce) return null;
  try {
    const response = await fetchImpl('https://oauth2.googleapis.com/tokeninfo', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({id_token:credential}).toString()
    });
    if (!response.ok) return null;
    const claims = await response.json();
    const exp = Number(claims.exp) * 1000, iat = Number(claims.iat) * 1000;
    if (!GOOGLE_ISSUERS.has(String(claims.iss || ''))) return null;
    if (String(claims.aud || '') !== String(env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID)) return null;
    if (!Number.isFinite(exp) || exp <= now) return null;
    if (!Number.isFinite(iat) || iat > now + 5 * 60 * 1000 || iat < now - 2 * 60 * 60 * 1000) return null;
    if (claims.email_verified !== true && String(claims.email_verified) !== 'true') return null;
    if (String(claims.nonce || '') !== nonce) return null;
    const email = String(claims.email || '').toLowerCase();
    if (!email) return null;
    const allowResponse = await fetchImpl(env.WHITELIST_URL || WHITELIST_URL, {headers:{Accept:'application/json'}});
    if (!allowResponse.ok) return null;
    const allow = await allowResponse.json();
    const allowed = Array.isArray(allow.superusers) && allow.superusers.some((entry) => String(entry).toLowerCase() === email);
    return allowed ? {email, name:String(claims.name || '')} : null;
  } catch (_) { return null; }
}

function handoffHtml(code) {
  const nonce = token(18);
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head><body>' +
    '<form id="handoff" method="post" action="' + API_HANDOFF + '"><input type="hidden" name="code" value="' + code + '"></form>' +
    '<script nonce="' + nonce + '">document.getElementById("handoff").submit()</script></body></html>';
  const headers = new Headers({
    'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; form-action ${API_HANDOFF}; frame-ancestors 'none'; base-uri 'none'`
  });
  headers.append('Set-Cookie', challengeCookie('', 0));
  return new Response(html, {status:200, headers});
}

export class AuthStore {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const data = await request.json();
    const now = Number(data.now || Date.now());
    if (path === '/issue') {
      const state = token(), nonce = token();
      await this.state.storage.put('challenge:' + state, {nonce, returnPath:safeReturnPath(data.returnPath), expiresAt:now + CHALLENGE_TTL_MS});
      await this.state.storage.setAlarm(now + CHALLENGE_TTL_MS);
      return json({state, nonce, expiresAt:now + CHALLENGE_TTL_MS});
    }
    if (path === '/peek') {
      const row = await this.state.storage.get('challenge:' + String(data.state || ''));
      return json(row && row.expiresAt >= now ? row : null, row && row.expiresAt >= now ? 200 : 404);
    }
    if (path === '/exchange') {
      const result = await this.state.storage.transaction(async (txn) => {
        const key = 'challenge:' + String(data.state || '');
        const row = await txn.get(key);
        if (!row || row.expiresAt < now || row.nonce !== data.nonce) return null;
        await txn.delete(key);
        const code = token(32);
        await txn.put('handoff:' + code, {email:String(data.email || ''), name:String(data.name || ''), returnPath:safeReturnPath(row.returnPath), expiresAt:now + HANDOFF_TTL_MS});
        return {code};
      });
      return json(result || {error:'challenge_used'}, result ? 200 : 409);
    }
    if (path === '/consume') {
      const result = await this.state.storage.transaction(async (txn) => {
        const key = 'handoff:' + String(data.code || '');
        const row = await txn.get(key);
        if (!row || row.expiresAt < now) return null;
        await txn.delete(key);
        return row;
      });
      return json(result || {error:'handoff_used'}, result ? 200 : 409);
    }
    return json({error:'not_found'}, 404);
  }

  async alarm() {
    const now = Date.now();
    const rows = await this.state.storage.list();
    const expired = [];
    let next = Infinity;
    for (const [key, row] of rows) {
      if (!row || Number(row.expiresAt) < now) expired.push(key);
      else next = Math.min(next, Number(row.expiresAt));
    }
    if (expired.length) await this.state.storage.delete(expired);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
  }
}

function store(env) {
  return env.AUTH_STORE.get(env.AUTH_STORE.idFromName('admira-auth'));
}

async function storeCall(env, path, body) {
  return store(env).fetch('https://auth-store' + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
}

export function createWorker({fetchImpl = fetch, now = Date.now} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/auth/')) return new Response('Not Found', {status:404});
      if (url.pathname === '/auth/challenge') {
        if (request.method !== 'POST' || request.headers.get('Origin') !== PUBLIC_ORIGIN) return json({error:'origin_not_allowed'}, 403);
        const raw = await readBody(request, 'application/json', 2048);
        if (raw == null) return json({error:'invalid_form'}, 400);
        let body; try { body = JSON.parse(raw); } catch (_) { return json({error:'invalid_form'}, 400); }
        const issued = await storeCall(env, '/issue', {returnPath:safeReturnPath(body.return_to), now:now()});
        const value = await issued.json();
        const headers = new Headers({'Cache-Control':'no-store', 'Content-Type':'application/json'});
        headers.append('Set-Cookie', challengeCookie(value.state));
        return new Response(JSON.stringify({...value, login_uri:LOGIN_URI}), {status:200, headers});
      }
      if (url.pathname === '/auth/callback') {
        if (request.method !== 'POST') return json({error:'method_not_allowed'}, 405, {Allow:'POST'});
        const raw = await readBody(request, 'application/x-www-form-urlencoded', 20000);
        if (raw == null) return json({error:'invalid_form'}, 400, {'Set-Cookie':challengeCookie('', 0)});
        const form = new URLSearchParams(raw), allCookies = parseCookies(request.headers.get('Cookie'));
        if (!equalText(allCookies.g_csrf_token, form.get('g_csrf_token'))) return json({error:'csrf_invalid'}, 403, {'Set-Cookie':challengeCookie('', 0)});
        const state = String(form.get('state') || ''), credential = String(form.get('credential') || '');
        if (!equalText(allCookies[CHALLENGE_COOKIE], state) || !credential || credential.length > 16384) return json({error:'challenge_invalid'}, 403, {'Set-Cookie':challengeCookie('', 0)});
        const peekResponse = await storeCall(env, '/peek', {state, now:now()});
        if (!peekResponse.ok) return json({error:'challenge_invalid'}, 403, {'Set-Cookie':challengeCookie('', 0)});
        const challenge = await peekResponse.json();
        const identity = await verifyGoogle(credential, challenge.nonce, env, fetchImpl, now());
        if (!identity) return json({error:'google_not_authorized'}, 401, {'Set-Cookie':challengeCookie('', 0)});
        const exchange = await storeCall(env, '/exchange', {state, nonce:challenge.nonce, ...identity, now:now()});
        if (!exchange.ok) return json({error:'challenge_used'}, 409, {'Set-Cookie':challengeCookie('', 0)});
        return handoffHtml((await exchange.json()).code);
      }
      if (url.pathname === '/auth/handoff/consume') {
        if (request.method !== 'POST' || request.headers.get('Origin') !== 'https://fleet.admira.live') return json({error:'origin_not_allowed'}, 403);
        const raw = await readBody(request, 'application/x-www-form-urlencoded', 1024);
        if (raw == null) return json({error:'invalid_form'}, 400);
        const code = String(new URLSearchParams(raw).get('code') || '');
        if (!/^[A-Za-z0-9_-]{40,80}$/.test(code)) return json({error:'invalid_code'}, 400);
        return storeCall(env, '/consume', {code, now:now()});
      }
      return new Response('Not Found', {status:404, headers:{'Cache-Control':'no-store'}});
    }
  };
}

export default createWorker();
