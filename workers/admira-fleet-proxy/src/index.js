const RELAYS = [
  { id: 'macmini', base: 'https://macmini.tail48b61c.ts.net/fleet' },
  { id: 'macbookpro16', base: 'https://macbook-pro-16.tail48b61c.ts.net:8443/fleet' },
];

// Estos estados los genera la capa de conectividad (Cloudflare/origen), no la
// aplicacion FleetControl. Sólo permiten probar otro relay cuando repetir la
// peticion no puede duplicar una mutacion.
export const RETRYABLE_RELAY_STATUSES = new Set([502, 504, 521, 522, 523, 525, 526]);

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
  const headers = applyCors(new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }), origin);
  return new Response(JSON.stringify(body, null, 1), { status, headers });
}

function retrySafe(request, path, handoffRequest) {
  if (/^(GET|HEAD)$/i.test(request.method)) return true;
  // El handoff tiene resultado estable durante sus 60 s de TTL en AuthStore.
  if (handoffRequest) return true;
  // /run y /action deduplican este identificador en la maquina objetivo.
  const commandId = String(request.headers.get('X-Fleet-Command-Id') || '');
  return (path === '/api/run' || path === '/api/action') && /^[A-Za-z0-9._:-]{8,120}$/.test(commandId);
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
      const handoffPost = request.method === 'POST' && path === '/api/auth/handoff';
      const handoffGet = request.method === 'GET' && path === '/api/auth/handoff';
      const handoffRequest = handoffPost || handoffGet;
      const mayFailover = retrySafe(request, path, handoffRequest);
      const opaqueHandoff = handoffPost && origin === 'null';
      if (handoffPost && origin !== 'https://www.admira.live' && origin !== 'null') return jsonResponse('', { error:'origin no permitido' }, 403);
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
      let body = request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();
      let upstreamMethod = request.method;
      if (handoffRequest) {
        // GIS puede renderizar el callback dentro de un documento sandboxed cuyo
        // Origin de form-submit es literalmente `null`. Esta excepción sólo vale
        // para el canje pre-sesión de un código opaco one-shot: no acepta ni
        // reenvía Cookie/token/sesión, y valida el formulario antes del relay.
        const type = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
        const hasAuth = ['Authorization', 'X-Fleet-Token', 'X-Fleet-Session'].some((name) => request.headers.has(name));
        const form = handoffGet ? url.searchParams : new URLSearchParams(body && body.byteLength <= 1024 ? new TextDecoder().decode(body) : '');
        const entries = [...form.keys()];
        const code = String(form.get('code') || '');
        if ((!handoffGet && type !== 'application/x-www-form-urlencoded') || hasAuth || entries.length !== 1 || entries[0] !== 'code' || !/^[A-Za-z0-9_-]{40,80}$/.test(code)) {
          return jsonResponse('', { error:'handoff inválido' }, 403);
        }
        // La navegación GET es el rescate canónico: se transforma en POST en el
        // borde para que el código no llegue en logs ni URLs del relay privado.
        if (handoffGet) {
          upstreamMethod = 'POST';
          body = new TextEncoder().encode(new URLSearchParams({code}).toString());
          outgoingHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
          outgoingHeaders.set('Origin', 'https://www.admira.live');
        } else if (opaqueHandoff) outgoingHeaders.set('Origin', 'null');
        outgoingHeaders.delete('Cookie');
      }
      for (const relay of relays) {
        try {
          // Ningún handoff reenvía query strings: el único código aceptado ya
          // fue validado en el body (o transformado desde el GET de rescate).
          const destination = relay.base + path + (handoffRequest ? '' : url.search);
          const response = await fetchImpl(destination, {
            method: upstreamMethod,
            headers: outgoingHeaders,
            body,
            // El 303 del handoff pertenece al navegador: seguirlo aquí convertiría
            // la respuesta en HTML 200 bajo fleet.admira.live y descartaría el
            // Set-Cookie intermedio que crea la sesión __Host-fleet_session.
            redirect: 'manual',
            signal: AbortSignal.timeout(20000),
          });
          if (RETRYABLE_RELAY_STATUSES.has(response.status)) {
            // No necesitamos el cuerpo de la respuesta de infraestructura y
            // cancelarlo libera pronto la conexion antes del siguiente relay.
            try { await response.body?.cancel(); } catch (_) {}
            if (mayFailover) continue;
            return jsonResponse(origin, {ok:false, error:'relay no disponible; operación no reintentada'}, 502);
          }
          const headers = responseHeaders(response.headers, origin);
          headers.set('X-Fleet-Relay', relay.id);
          return new Response(response.body, { status: response.status, headers });
        } catch (error) {
          // Un timeout de escritura puede ocurrir después de que el origen haya
          // aplicado la mutacion. Sin idempotencia demostrable, no se repite.
          if (!mayFailover) break;
        }
      }

      // Los mensajes de red pueden contener hostnames o datos del proveedor;
      // no se reflejan al cliente.
      return jsonResponse(origin, { ok: false, error: 'ningún relay disponible' }, 502);
    },
  };
}

export default createFleetProxy();
