'use strict';

// Puente de servicio de /control (23-sep-2026).
// Desde el login por redirect (943c3bd, 11-ago) el navegador ya no guarda el
// id_token de Google: la sesión vive en una cookie HttpOnly del relay. Pero el
// mando de agentes, la captura por watcher, la mensajería y el canal DS seguían
// llamando a bot.yokup y navegadores.yokup con `Bearer <id_token>`, y el panel se
// quedaba siempre en «sin sesión». El relay, que sí ve la sesión (cookie + CSRF),
// reenvía SOLO estas rutas con la clave de servicio que esos workers ya aceptan.
// Lista cerrada a propósito: esto no es un proxy transparente.

const fs = require('fs');
const path = require('path');

const ROUTES = {
  '/api/bridge/agent/control':           { svc: 'bot', path: '/api/fleet/agent/control' },
  '/api/bridge/desktop/capture':         { svc: 'bot', path: '/api/fleet/desktop/capture' },
  '/api/bridge/desktop/capture/consume': { svc: 'bot', path: '/api/fleet/desktop/capture/consume' },
  '/api/bridge/send':                    { svc: 'bot', path: '/api/send' },
  '/api/bridge/nav/cmd':                 { svc: 'nav', path: '/api/cmd' },
};

// La clave se lee de env o de un fichero 0600 junto al servidor (como .fleet-token),
// en cada petición: rotarla no exige reiniciar el servicio.
const SERVICES = {
  bot: { base: 'https://bot.yokup.com',         env: 'BOT_PANEL_KEY', file: '.bot-panel-key' },
  nav: { base: 'https://navegadores.yokup.com', env: 'NAV_TOKEN',     file: '.nav-token' },
};

// Los fallos del puente responden por debajo de 500 a propósito: el Fleet Mesh
// reintenta en otro relay cualquier 5xx de una orden, y repetir un encargo que
// quizá ya se encoló lo duplicaría.
const BRIDGE_FAIL_STATUS = 424;

function createServiceBridge({ dir, env = process.env, fetchFn = fetch, timeoutMs = 12000 } = {}) {
  function secret(svc) {
    const s = SERVICES[svc];
    if (env[s.env]) return String(env[s.env]).trim();
    try { return fs.readFileSync(path.join(dir, s.file), 'utf8').trim(); } catch (e) { return ''; }
  }
  function handles(url) { return Object.prototype.hasOwnProperty.call(ROUTES, url); }
  const fail = (error, extra) => ({ status: BRIDGE_FAIL_STATUS, body: { ok: false, error, ...extra } });

  async function forward(url, rawBody) {
    const route = ROUTES[url];
    if (!route) return { status: 404, body: { ok: false, error: 'bridge_route_not_found' } };
    let body;
    try { body = JSON.parse(rawBody || '{}'); } catch (e) { return { status: 400, body: { ok: false, error: 'invalid_json' } }; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { ok: false, error: 'invalid_json' } };
    const key = secret(route.svc);
    if (!key) return fail('bridge_secret_missing', { service: route.svc });
    let r;
    try {
      r = await fetchFn(SERVICES[route.svc].base + route.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) { return fail('upstream_unreachable', { service: route.svc }); }
    const d = await r.json().catch(() => ({ ok: false, error: 'upstream_not_json' }));
    // La sesión del operador ya la validó el relay: si el servicio rechaza, lo que
    // falla es NUESTRA clave, y decir «sesión caducada» mandaría a re-loguearse en vano.
    if (r.status === 401 || r.status === 403) return fail('bridge_secret_rejected', { service: route.svc, upstreamStatus: r.status });
    if (r.status >= 500) return fail((d && d.error) || 'upstream_failed', { service: route.svc, upstreamStatus: r.status });
    return { status: r.status, body: d };
  }

  return { handles, forward };
}

module.exports = { createServiceBridge, ROUTES, SERVICES, BRIDGE_FAIL_STATUS };
