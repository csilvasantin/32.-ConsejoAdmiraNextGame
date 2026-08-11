const RELAYS = [
  { id: 'macmini', base: 'https://macmini.tail48b61c.ts.net/fleet' },
  { id: 'macbookpro16', base: 'https://macbook-pro-16.tail48b61c.ts.net:10000/fleet' },
];

export const ALLOWED_ORIGINS = new Set([
  'https://www.admira.live',
  'https://admira.live',
]);

// Deliberately narrow: do not turn this relay into a transparent proxy. Origin
// and Cookie are required by the first-party challenge/session flow; all other
// request headers remain on the pre-existing allowlist.
export const HEADERS_TO_HUB = [
  'authorization',
  'content-type',
  'x-fleet-token',
  'x-fleet-session',
  'x-fleet-command-id',
  'x-fleet-csrf',
  'accept',
  'cookie',
  'origin',
];

function addVary(headers, value) {
  const values = String(headers.get('Vary') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) values.push(value);
  headers.set('Vary', values.join(', '));
}

export function applyCors(headers, origin) {
  // Never trust CORS returned by a relay: the public edge owns the allowlist.
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  addVary(headers, 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Fleet-Token, X-Fleet-Session, X-Fleet-Command-Id, X-Fleet-CSRF, Authorization',
  );
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}

export function headersToHub(request) {
  const output = new Headers();
  const origin = request.headers.get('Origin');
  for (const name of HEADERS_TO_HUB) {
    // An absent or untrusted Origin stays absent. In particular, never invent
    // an allowlisted Origin for headless/no-Origin traffic.
    if ((name === 'origin' || name === 'cookie') && (!origin || !ALLOWED_ORIGINS.has(origin))) continue;
    const value = request.headers.get(name);
    if (value) output.set(name, value);
  }
  return output;
}

function responseHeaders(upstream, origin) {
  const output = new Headers(upstream);

  // Cloudflare and modern Fetch expose every Set-Cookie independently. Re-add
  // them after cloning so challenge/session rotation cannot be folded or lost.
  let cookies = [];
  if (typeof upstream.getSetCookie === 'function') cookies = upstream.getSetCookie();
  else if (typeof upstream.getAll === 'function') cookies = upstream.getAll('Set-Cookie');
  if (cookies.length) {
    output.delete('Set-Cookie');
    for (const cookie of cookies) output.append('Set-Cookie', cookie);
  }

  return applyCors(output, origin);
}

function jsonResponse(origin, body, status) {
  const headers = applyCors(new Headers({ 'Content-Type': 'application/json; charset=utf-8' }), origin);
  return new Response(JSON.stringify(body, null, 1), { status, headers });
}

export function createFleetProxy({ relays = RELAYS, fetchImpl = fetch } = {}) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      const path = url.pathname.replace(/^\/fleet(?=\/|$)/, '') || '/';

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: applyCors(new Headers(), origin) });
      }

      // Cookie-auth de navegador: el borde corta mutaciones sin Origin y CSRF
      // exactos antes de leer el body o contactar un relay. Los clientes máquina
      // no llevan Cookie y conservan su autenticación X-Fleet-Token independiente.
      const mutating = !/^(GET|HEAD|OPTIONS)$/i.test(request.method);
      const cookie = request.headers.get('Cookie');
      const handoffRequest = request.method === 'POST' && path === '/api/auth/handoff';
      const opaqueHandoff = request.method === 'POST' && path === '/api/auth/handoff' && origin === 'null';
      if (handoffRequest && origin !== 'https://www.admira.live' && origin !== 'null') return jsonResponse('', { error:'origin no permitido' }, 403);
      if (mutating && cookie && !handoffRequest) {
        if (!origin || !ALLOWED_ORIGINS.has(origin)) return jsonResponse(origin, { error:'origin no permitido' }, 403);
        const csrf = String(request.headers.get('X-Fleet-CSRF') || '');
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(csrf)) return jsonResponse(origin, { error:'csrf inválido' }, 403);
      }

      if (url.pathname === '/proxy-health') {
        const health = [];
        for (const relay of relays) {
          const startedAt = Date.now();
          try {
            const response = await fetchImpl(relay.base + '/api/health', {
              signal: AbortSignal.timeout(6000),
            });
            health.push({ relay: relay.id, ok: response.ok, status: response.status, ms: Date.now() - startedAt });
          } catch (error) {
            health.push({ relay: relay.id, ok: false, error: String(error.message || error), ms: Date.now() - startedAt });
          }
        }
        return jsonResponse(origin, { ok: true, service: 'admira-fleet-proxy', relays: health }, 200);
      }

      const outgoingHeaders = headersToHub(request);
      const body = request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();
      if (handoffRequest) {
        // GIS puede renderizar el callback dentro de un documento sandboxed cuyo
        // Origin de form-submit es literalmente `null`. Esta excepción sólo vale
        // para el canje pre-sesión de un código opaco one-shot: no acepta ni
        // reenvía Cookie/token/sesión, y valida el formulario antes del relay.
        const type = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
        const hasAuth = ['Authorization', 'X-Fleet-Token', 'X-Fleet-Session'].some((name) => request.headers.has(name));
        const raw = body && body.byteLength <= 1024 ? new TextDecoder().decode(body) : '';
        const form = new URLSearchParams(raw);
        const entries = [...form.keys()];
        const code = String(form.get('code') || '');
        if (type !== 'application/x-www-form-urlencoded' || hasAuth || entries.length !== 1 || entries[0] !== 'code' || !/^[A-Za-z0-9_-]{40,80}$/.test(code)) {
          return jsonResponse('', { error:'handoff inválido' }, 403);
        }
        if (opaqueHandoff) outgoingHeaders.set('Origin', 'null');
        outgoingHeaders.delete('Cookie');
      }
      let lastError = null;

      for (const relay of relays) {
        try {
          const destination = relay.base + path + url.search;
          const response = await fetchImpl(destination, {
            method: request.method,
            headers: outgoingHeaders,
            body,
            // El 303 del handoff pertenece al navegador: seguirlo aquí convertiría
            // la respuesta en HTML 200 bajo fleet.admira.live y descartaría el
            // Set-Cookie intermedio que crea la sesión __Host-fleet_session.
            redirect: 'manual',
            signal: AbortSignal.timeout(20000),
          });
          if (response.status === 502 || response.status === 504) {
            lastError = `relay ${relay.id} → ${response.status}`;
            continue;
          }
          const headers = responseHeaders(response.headers, origin);
          headers.set('X-Fleet-Relay', relay.id);
          return new Response(response.body, { status: response.status, headers });
        } catch (error) {
          lastError = `relay ${relay.id} → ${String(error.message || error)}`;
        }
      }

      return jsonResponse(origin, { ok: false, error: 'ningún relay disponible', detalle: lastError }, 502);
    },
  };
}

export default createFleetProxy();
