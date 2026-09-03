const PUBLIC_ORIGIN = 'https://www.admira.live';
const API_HANDOFF = 'https://fleet.admira.live/api/auth/handoff';
const LOGIN_URI = PUBLIC_ORIGIN + '/auth/callback';
const GOOGLE_CLIENT_ID = '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
const WHITELIST_URL = 'https://admira-whitelist.csilvasantin.workers.dev/list';
const CHALLENGE_COOKIE = '__Host-fleet_challenge';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
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

function internalAuthorized(request, env) {
  const header = String(request.headers.get('Authorization') || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const expected = String(env.AUTH_EDGE_SHARED_SECRET || '');
  return expected.length >= 32 && equalText(supplied, expected);
}

function sessionClaims(value) {
  if (!value || typeof value !== 'object') return null;
  const claims = {
    email:String(value.email || '').trim().toLowerCase(),
    jti:String(value.jti || ''),
    csrf:String(value.csrf || ''),
    iat:Number(value.iat),
    exp:Number(value.exp),
  };
  if (!claims.email || !/^[A-Za-z0-9_-]{24,64}$/.test(claims.jti) || !/^[A-Za-z0-9_-]{32}$/.test(claims.csrf)) return null;
  if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp - claims.iat !== SESSION_TTL_MS) return null;
  return claims;
}

function sameSession(left, right) {
  return left && right && left.email === right.email && left.jti === right.jti && left.csrf === right.csrf && left.iat === right.iat && left.exp === right.exp;
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

function handoffRedirect(code) {
  const headers = new Headers({
    'Location':API_HANDOFF + '?code=' + encodeURIComponent(code),
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  });
  headers.append('Set-Cookie', challengeCookie('', 0));
  return new Response(null, {status:303, headers});
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
        const session = {email:String(data.email || '').trim().toLowerCase(), jti:token(18), csrf:token(24), iat:now, exp:now + SESSION_TTL_MS};
        await txn.put('session:' + session.jti, {...session, expiresAt:session.exp});
        await txn.put('handoff:' + code, {email:session.email, name:String(data.name || ''), returnPath:safeReturnPath(row.returnPath), session, expiresAt:now + HANDOFF_TTL_MS});
        await txn.setAlarm?.(Math.min(now + HANDOFF_TTL_MS, session.exp));
        return {code};
      });
      return json(result || {error:'challenge_used'}, result ? 200 : 409);
    }
    if (path === '/consume') {
      // No borrar al leer: si el relay recibe la identidad pero su respuesta
      // 303 se pierde, el proxy debe poder repetir el canje por otro relay. El
      // mismo codigo siempre devuelve la misma identidad hasta expirar; el TTL
      // corto y el alarm del Durable Object acotan el replay.
      const key = 'handoff:' + String(data.code || '');
      const row = await this.state.storage.get(key);
      return json(row && row.expiresAt >= now ? row : {error:'handoff_invalid'}, row && row.expiresAt >= now ? 200 : 409);
    }
    if (path === '/session/register') {
      const session = sessionClaims(data.session);
      if (!session || session.exp < now) return json({error:'session_invalid'}, 400);
      const result = await this.state.storage.transaction(async (txn) => {
        const key = 'session:' + session.jti;
        const current = await txn.get(key);
        if (current && !sameSession(current, session)) return false;
        await txn.put(key, {...session, expiresAt:session.exp});
        await txn.setAlarm?.(session.exp);
        return true;
      });
      return json(result ? {ok:true} : {error:'session_conflict'}, result ? 200 : 409);
    }
    if (path === '/session/check') {
      const session = sessionClaims(data.session);
      const current = session && await this.state.storage.get('session:' + session.jti);
      return json(current && current.expiresAt >= now && sameSession(current, session) ? {ok:true} : {ok:false}, current && current.expiresAt >= now && sameSession(current, session) ? 200 : 401);
    }
    if (path === '/session/revoke') {
      const session = sessionClaims(data.session);
      const result = session && await this.state.storage.transaction(async (txn) => {
        const key = 'session:' + session.jti;
        const current = await txn.get(key);
        if (!current || !sameSession(current, session)) return false;
        await txn.delete(key);
        return true;
      });
      return json(result ? {ok:true} : {error:'session_invalid'}, result ? 200 : 404);
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
        // El callback termina con una navegación HTTP real. No depende de JS,
        // form-action, sandbox, temporizadores ni de que el navegador permita
        // auto-enviar formularios cross-origin. El código es opaco, dura 60 s
        // y viaja sin Referer; el edge público lo convierte de nuevo
        // a POST antes de tocar el hub privado. El canje es idempotente durante
        // su TTL para tolerar perdida de respuesta y failover entre relays.
        return handoffRedirect((await exchange.json()).code);
      }
      if (url.pathname === '/auth/handoff/consume') {
        if (request.method !== 'POST' || request.headers.get('Origin') !== 'https://fleet.admira.live' || !internalAuthorized(request, env)) return json({error:'origin_not_allowed'}, 403);
        const raw = await readBody(request, 'application/x-www-form-urlencoded', 1024);
        if (raw == null) return json({error:'invalid_form'}, 400);
        const code = String(new URLSearchParams(raw).get('code') || '');
        if (!/^[A-Za-z0-9_-]{40,80}$/.test(code)) return json({error:'invalid_code'}, 400);
        return storeCall(env, '/consume', {code, now:now()});
      }
      if (url.pathname === '/auth/session/check' || url.pathname === '/auth/session/revoke' || url.pathname === '/auth/session/register') {
        if (request.method !== 'POST' || !internalAuthorized(request, env)) return json({error:'not_authorized'}, 403);
        const raw = await readBody(request, 'application/json', 2048);
        if (raw == null) return json({error:'invalid_form'}, 400);
        let data; try { data = JSON.parse(raw); } catch (_) { return json({error:'invalid_form'}, 400); }
        const action = url.pathname.slice('/auth'.length);
        return storeCall(env, action, {...data, now:now()});
      }
      return new Response('Not Found', {status:404, headers:{'Cache-Control':'no-store'}});
    }
  };
}

export default createWorker();
