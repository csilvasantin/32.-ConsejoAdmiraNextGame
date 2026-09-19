/*
 * Hard-gate de admira.live (FLT-100644 / FLT-100645).
 * /control, /usuarios y /presentar interno no se sirven sin sesión en ESTE host.
 * La cookie de Fleet (__Host-fleet_session) vive en fleet.admira.live: aquí hace
 * falta __Host-live_session. Soft-gate (auth-gate.js) sigue en el marketing/consejo.
 * La contraseña de sala Presentar del cliente no entra aquí.
 */

export const COOKIE = '__Host-live_session';
export const CLIENT_ID = '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
export const OWNERS = ['csilva@admira.com', 'csilvasantin@gmail.com'];
export const MAXAGE = 12 * 60 * 60;
export const WL_URL = 'https://whitelist.admira.store/list';
const enc = new TextEncoder();

export function kindOf(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (p === '/acceso') return 'acceso';
  if (p === '/usuarios' || p === '/usuarios.html') return 'usuarios';
  if (p === '/presentar' || p === '/presentar.html' || p.startsWith('/presentar/')) return 'presentar';
  if (p === '/control' || p.startsWith('/control/')) return 'control';
  return '';
}

export function safeReturn(value) {
  const raw = String(value || '/presentar');
  if (/[\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//') || !raw.startsWith('/')) return '/presentar';
  try {
    const parsed = new URL(raw, 'https://www.admira.live');
    if (parsed.origin !== 'https://www.admira.live' && parsed.origin !== 'https://admira.live') return '/presentar';
    const kind = kindOf(parsed.pathname);
    return kind ? parsed.pathname + parsed.search : '/presentar';
  } catch (_) {
    return '/presentar';
  }
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(value) {
  const raw = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function equalText(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function emailOf(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
function cookies(request) {
  const out = {};
  for (const part of String(request.headers.get('Cookie') || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); } catch (_) {}
    }
  }
  return out;
}

export async function mintCookie(env, { email, superuser }, now = Date.now()) {
  const key = String(env.LIVE_GATE_SIGNING_KEY || '').trim();
  if (!key) throw new Error('LIVE_GATE_SIGNING_KEY missing');
  const payload = { e: emailOf(email), s: superuser ? 1 : 0, iat: now, exp: now + MAXAGE * 1000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(key, body);
  return `${COOKIE}=${body}.${sig}; Path=/; Max-Age=${MAXAGE}; HttpOnly; Secure; SameSite=Lax`;
}

export async function readSession(request, env, now = Date.now()) {
  const key = String(env.LIVE_GATE_SIGNING_KEY || '').trim();
  const raw = cookies(request)[COOKIE] || '';
  const dot = raw.lastIndexOf('.');
  if (!key || dot < 8) return null;
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1);
  if (!equalText(sig, await hmac(key, body))) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch (_) { return null; }
  const email = emailOf(data && data.e);
  if (!email || Number(data.exp) < now || Number(data.iat) > now + 60 * 1000) return null;
  return { email, superuser: Number(data.s) === 1, exp: Number(data.exp) };
}

export async function leerLista(env, fetchImpl = fetch) {
  const token = String(env.WHITELIST_MACHINE_TOKEN || '').trim();
  if (!token) return { ok: false, error: 'token missing', emails: [], superusers: [] };
  try {
    const res = await fetchImpl(env.WHITELIST_URL || WL_URL, {
      headers: { Accept: 'application/json', 'X-Whitelist-Token': token },
    });
    if (!res.ok) return { ok: false, error: 'whitelist ' + res.status, emails: [], superusers: [] };
    const data = await res.json();
    const emails = Array.isArray(data.emails) ? data.emails.map(emailOf).filter(Boolean) : [];
    const superusers = Array.isArray(data.superusers) ? data.superusers.map(emailOf).filter(Boolean) : [];
    return { ok: true, emails, superusers };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).slice(0, 80), emails: [], superusers: [] };
  }
}

export async function verificarGoogle(credential, env, fetchImpl = fetch, now = Date.now()) {
  if (!credential || String(credential).length > 16384) return null;
  try {
    const res = await fetchImpl('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: String(credential) }).toString(),
    });
    if (!res.ok) return null;
    const claims = await res.json();
    if (String(claims.aud || '') !== CLIENT_ID) return null;
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss || ''))) return null;
    if (claims.email_verified !== true && String(claims.email_verified) !== 'true') return null;
    const exp = Number(claims.exp) * 1000;
    if (!Number.isFinite(exp) || exp <= now) return null;
    const email = emailOf(claims.email);
    return email ? { email, name: String(claims.name || '') } : null;
  } catch (_) {
    return null;
  }
}

export function loginPage(error = '', returnTo = '/presentar') {
  const dest = safeReturn(returnTo);
  const err = error ? `<p class="err">${esc(error)}</p>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acceso · admira.live</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080401;color:#f4e2b0;font-family:ui-sans-serif,system-ui;padding:24px}.box{max-width:420px;border:1px solid #b5651d;padding:28px;background:#160f06}h1{margin:0 0 8px;font-size:22px}.k{letter-spacing:.2em;text-transform:uppercase;color:#d89a3a;font:700 11px ui-monospace,monospace}p{color:#c4a36a;line-height:1.5}.err{color:#e0563a}</style></head>
<body><div class="box"><div class="k">admira.live · hard gate</div><h1>Acceso interno</h1><p>Google verifica quién eres. La lista blanca decide si entras a /control, /usuarios o Presentar interno. Sin /control para terceros. La clave de sala del cliente es otra puerta.</p>
<div id="g_id_onload" data-client_id="${CLIENT_ID}" data-callback="onLiveGoogle" data-auto_prompt="false"></div>
<div class="g_id_signin" data-type="standard" data-theme="filled_black" data-size="large" data-width="320"></div>
${err}<p id="msg" class="err" hidden></p></div>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
function onLiveGoogle(resp){
  var msg=document.getElementById('msg');
  fetch('/acceso',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({credential:resp.credential,return_to:${JSON.stringify(dest)}})})
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
    .then(function(x){if(x.d&&x.d.ok){location.replace(x.d.return_to||${JSON.stringify(dest)});return}msg.hidden=false;msg.textContent=(x.d&&x.d.error)||'acceso denegado'})
    .catch(function(){msg.hidden=false;msg.textContent='no se pudo completar el acceso'});
}
</script></body></html>`;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(body, status = 401, extra = {}) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    ...extra,
  };
  return new Response(body, { status, headers });
}

export function json(body, status = 200, extra = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } });
}

export function wantsControl(kind) {
  return kind === 'control' || kind === 'usuarios';
}

export function autorizado(session, lista, kind) {
  if (!session) return { ok: false, status: 401, error: 'sesión requerida' };
  const email = session.email;
  const supers = new Set((lista.superusers || []).concat(OWNERS));
  const emails = new Set((lista.emails || []).concat(OWNERS));
  if (wantsControl(kind) && !supers.has(email) && !session.superuser) {
    return { ok: false, status: 403, error: 'hace falta superusuario para /control y /usuarios' };
  }
  if (!emails.has(email) && !supers.has(email)) {
    return { ok: false, status: 403, error: 'no estás en la lista blanca' };
  }
  return { ok: true };
}
