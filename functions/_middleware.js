/*
 * Hard-gate Pages Function: /control + /usuarios + /presentar interno.
 * El resto del sitio (consejo, marketing, 13rue) sigue con soft-gate auth-gate.js.
 */
import {
  kindOf, safeReturn, mintCookie, readSession, leerLista, verificarGoogle,
  loginPage, html, json, autorizado, wantsControl,
} from './_live-gate.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const kind = kindOf(url.pathname);
  if (!kind) return next();

  const fetchImpl = env.LIVE_GATE_FETCH || fetch;
  const now = Number(env.NOW) || Date.now();

  if (kind === 'acceso' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'JSON no válido' }, 400); }
    if (!String(env.LIVE_GATE_SIGNING_KEY || '').trim() || !String(env.WHITELIST_MACHINE_TOKEN || '').trim()) {
      return json({ ok: false, error: 'acceso no disponible ahora mismo' }, 503);
    }
    const identity = await verificarGoogle(body.credential, env, fetchImpl, now);
    if (!identity) return json({ ok: false, error: 'Google no pudo verificar esa identidad' }, 401);
    const lista = await leerLista(env, fetchImpl);
    if (!lista.ok) return json({ ok: false, error: 'lista blanca no disponible' }, 503);
    const dest = safeReturn(body.return_to || '/presentar');
    const destKind = kindOf(new URL(dest, url.origin).pathname) || 'presentar';
    const superuser = lista.superusers.includes(identity.email);
    const allowed = lista.emails.includes(identity.email) || superuser;
    if (!allowed) return json({ ok: false, error: 'no estás en la lista blanca' }, 403);
    if (wantsControl(destKind) && !superuser) return json({ ok: false, error: 'hace falta superusuario para /control y /usuarios' }, 403);
    const cookie = await mintCookie(env, { email: identity.email, superuser }, now);
    return json({ ok: true, return_to: dest }, 200, { 'set-cookie': cookie });
  }

  if (!String(env.LIVE_GATE_SIGNING_KEY || '').trim()) {
    return html(loginPage('Acceso no disponible ahora mismo.', url.pathname + url.search), 503);
  }

  const session = await readSession(request, env, now);
  if (kind === 'acceso') {
    if (session) {
      const dest = safeReturn(url.searchParams.get('return_to') || '/presentar');
      return Response.redirect(new URL(dest, url.origin), 302);
    }
    return html(loginPage('', url.searchParams.get('return_to') || '/presentar'));
  }

  if (!session) {
    return html(loginPage('', url.pathname + url.search), 401);
  }

  const lista = await leerLista(env, fetchImpl);
  if (!lista.ok) return html(loginPage('Lista blanca no disponible. Reinténtalo.', url.pathname), 503);
  const gate = autorizado(session, lista, kind);
  if (!gate.ok) return html(loginPage(gate.error, url.pathname), gate.status);

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, headers });
}
