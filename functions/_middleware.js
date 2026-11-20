/*
 * Puerta de servidor de www.admira.live — ver functions/_puerta.js.
 * Sin cookie válida: las páginas reciben solo la verja de login (401) y el resto 401 sin cuerpo útil.
 */
import {
  FLEET, VIDA, esPublico, verificar, emitir, cookieDe, cookieFuera, leerCookie,
  secretoValido, sha256hex, igual, rutaSegura,
} from './_puerta.js';

const SIN_CACHE = { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

function json(datos, status = 200, extra = {}) {
  return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SIN_CACHE, ...extra } });
}

// La verja pide auth-gate.js con una URL propia de cada despliegue: la zona cachea 4 h en el navegador
// y una copia vieja (sin la lógica de la puerta) dejaría la pantalla en blanco.
export const verjaHtml = (version) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>admira.live · acceso</title>
<style>html,body{margin:0;height:100%;background:#070401;color:#d9b77a;font:14px/1.5 ui-monospace,Menlo,monospace}main{display:flex;height:100%;align-items:center;justify-content:center;text-align:center}</style>
<script>window.ADMIRA_PUERTA=1;</script>
<script src="/auth-gate.js?v=puerta-${version}"></script>
</head><body><main><p>admira.live · acceso restringido</p></main></body></html>`;

function quierePagina(request, pathname) {
  if (!/^(GET|HEAD)$/.test(request.method)) return false;
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) return true;
  return pathname.endsWith('/') || pathname.endsWith('.html') || !/\.[A-Za-z0-9]{1,8}$/.test(pathname);
}

function mismoOrigen(request, url) {
  return (request.headers.get('Origin') || '') === url.origin;
}

async function puerta(context, url, secreto) {
  const { request, env } = context;
  const ruta = url.pathname;
  if (ruta === '/puerta/entrar') {
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, { Allow: 'POST' });
    if (!mismoOrigen(request, url)) return json({ ok: false, error: 'origin' }, 403);
    let ticket = '';
    try { ticket = String(((await request.json()) || {}).ticket || ''); } catch (_) {}
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) return json({ ok: false, error: 'ticket' }, 400);
    let email = '';
    try {
      const r = await fetch(FLEET + '/api/auth/yokup-ticket/consume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }),
        redirect: 'manual', signal: AbortSignal.timeout(10000),
      });
      const d = r.ok ? await r.json() : null;
      email = d && d.ok === true && typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
    } catch (_) { return json({ ok: false, error: 'fleet_no_disponible' }, 503); }
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return json({ ok: false, error: 'ticket' }, 401);
    const c = await emitir(secreto, 'persona', email);
    return json({ ok: true, tipo: 'persona' }, 200, { 'Set-Cookie': cookieDe(c.valor, c.maxAge) });
  }
  if (ruta === '/puerta/agente') {
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, { Allow: 'POST' });
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S{16,512}$/i.test(auth)) return json({ ok: false, error: 'clave' }, 401);
    let d = null;
    try {
      const r = await fetch(FLEET + '/api/auth/agente', {
        method: 'POST', headers: { Authorization: auth, 'X-Agente': String(request.headers.get('X-Agente') || 'agente').slice(0, 40) },
        redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      d = r.ok ? await r.json() : null;
    } catch (_) { return json({ ok: false, error: 'fleet_no_disponible' }, 503); }
    if (!(d && d.ok === true && d.agent === true && d.readOnly === true)) return json({ ok: false, error: 'clave' }, 401);
    const c = await emitir(secreto, 'agente', String(d.name || 'agente'));
    return json({ ok: true, tipo: 'agente', readOnly: true }, 200, { 'Set-Cookie': cookieDe(c.valor, c.maxAge) });
  }
  if (ruta === '/puerta/kiosco') {
    if (request.method !== 'GET') return json({ ok: false, error: 'method' }, 405, { Allow: 'GET' });
    const k = url.searchParams.get('k') || '';
    const huellas = String(env.PUERTA_KIOSCO_SHA256 || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{64}$/.test(x));
    const h = k.length >= 32 && k.length <= 256 ? await sha256hex(k) : '';
    const n = h ? huellas.findIndex((x) => igual(x, h)) : -1;
    if (n < 0) return new Response('Llave de kiosco no válida\n', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SIN_CACHE } });
    const c = await emitir(secreto, 'kiosco', 'kiosco-' + (n + 1));
    return new Response(null, { status: 303, headers: { Location: rutaSegura(url.searchParams.get('a')), 'Set-Cookie': cookieDe(c.valor, c.maxAge), ...SIN_CACHE } });
  }
  if (ruta === '/puerta/salir') {
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookieFuera(), ...SIN_CACHE } });
  }
  if (ruta === '/puerta/estado') {
    const d = await verificar(secreto, leerCookie(request));
    return json(d ? { ok: true, tipo: d.t, hasta: d.x } : { ok: false });
  }
  return json({ ok: false, error: 'no encontrado' }, 404);
}

function privada(res) {
  const out = new Response(res.body, res);
  const cc = out.headers.get('Cache-Control') || '';
  if (!/no-store/i.test(cc)) {
    const resto = cc.split(',').map((x) => x.trim()).filter((x) => x && !/^(public|private|s-maxage=.*)$/i.test(x));
    out.headers.set('Cache-Control', ['private', ...(resto.length ? resto : ['no-cache'])].join(', '));
  }
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const secreto = env.PUERTA_FIRMA;
  if (url.pathname.startsWith('/puerta/')) {
    if (!secretoValido(secreto)) return json({ ok: false, error: 'puerta sin configurar' }, 503);
    return puerta(context, url, secreto);
  }
  if (esPublico(url.pathname)) {
    // La verja siempre trae auth-gate.js fresco (no-store pasa por encima del TTL de navegador de la zona).
    if (url.pathname === '/auth-gate.js' && (url.searchParams.get('v') || '').startsWith('puerta-')) {
      const base = await context.next();
      const r = new Response(base.body, base);
      r.headers.set('Cache-Control', 'no-store');
      r.headers.delete('ETag');
      return r;
    }
    return context.next();
  }
  // Sin secreto la puerta no abre (falla cerrada): nunca se sirve el sitio sin comprobar.
  if (!secretoValido(secreto)) return new Response('admira.live · puerta sin configurar\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SIN_CACHE } });
  const ahora = Math.floor(Date.now() / 1000);
  const d = await verificar(secreto, leerCookie(request), ahora);
  if (!d) {
    if (quierePagina(request, url.pathname)) {
      const version = String(env.CF_PAGES_COMMIT_SHA || '20261120').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || '20261120';
      return new Response(request.method === 'HEAD' ? null : verjaHtml(version), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SIN_CACHE } });
    }
    return new Response('Acceso restringido\n', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SIN_CACHE } });
  }
  const res = privada(await context.next());
  // Renovación deslizante: a mitad de vida se reemite (sin pasar nunca del tope desde el login).
  const vida = VIDA[d.t];
  if (d.x - ahora < vida.renovar / 2 && ahora - d.i < vida.tope) {
    const c = await emitir(secreto, d.t, d.s, d.i, ahora);
    if (c.maxAge > 0) res.headers.append('Set-Cookie', cookieDe(c.valor, c.maxAge));
  }
  return res;
}
