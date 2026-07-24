/* control/fleet-mesh.js · AdmiraNeXT Fleet Mesh · v.2026.07.24.r1
 *
 * Cliente de control sin punto único de fallo. Mantiene una sesión Google
 * independiente por relay, conmuta lecturas y comandos entre relays y adjunta
 * un identificador estable a cada orden para que el equipo objetivo la dedupe.
 *
 * Los relays conocidos son solo el arranque. Se pueden añadir más antes de
 * cargar este script con window.ADMIRA_FLEET_RELAYS = [{id,label,base}, ...].
 */
(function (root, factory) {
  var api = factory(root);
  root.AdmiraFleetMesh = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = '2026.07.24.r1';
  var DEFAULT_RELAYS = [
    {
      id: 'macmini',
      label: 'Mac Mini',
      base: 'https://macmini.tail48b61c.ts.net/fleet/api',
      priority: 10
    },
    {
      id: 'macbookpro16',
      label: 'MacBook Pro 16',
      base: 'https://macbook-pro-16.tail48b61c.ts.net:10000/fleet/api',
      priority: 20
    }
  ];

  function cleanBase(v) { return String(v || '').replace(/\/+$/, ''); }
  function relayList(extra) {
    var src = Array.isArray(extra) && extra.length ? extra : DEFAULT_RELAYS;
    var seen = {};
    return src.map(function (r, i) {
      return {
        id: String(r.id || ('relay-' + i)),
        label: String(r.label || r.id || ('Relay ' + (i + 1))),
        base: cleanBase(r.base),
        priority: Number.isFinite(+r.priority) ? +r.priority : (i + 1) * 10
      };
    }).filter(function (r) {
      if (!r.base || seen[r.base]) return false;
      seen[r.base] = true;
      return true;
    }).sort(function (a, b) { return a.priority - b.priority; });
  }

  function randomId() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    } catch (e) {}
    return 'cmd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function memoryStore() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  function create(options) {
    options = options || {};
    var relays = relayList(options.relays || root.ADMIRA_FLEET_RELAYS);
    var fetchFn = options.fetch || (root.fetch && root.fetch.bind(root));
    if (!fetchFn) throw new Error('Fleet Mesh necesita fetch');
    var store = options.store || root.sessionStorage || memoryStore();
    var getCredential = options.getCredential || function () { return Promise.resolve(''); };
    var timeoutMs = Math.max(1000, +(options.timeoutMs || 9000));
    var cooldownMs = Math.max(1000, +(options.cooldownMs || 15000));
    var state = {};
    var active = null;
    var sessions = {};

    try { sessions = JSON.parse(store.getItem('admira_fleet_mesh_sessions') || '{}') || {}; } catch (e) { sessions = {}; }
    relays.forEach(function (r) { state[r.id] = { failures: 0, downUntil: 0, lastOk: 0, lastError: '' }; });

    function saveSessions() {
      try { store.setItem('admira_fleet_mesh_sessions', JSON.stringify(sessions)); } catch (e) {}
    }
    function sessionFor(relay) {
      var s = sessions[relay.id];
      if (!s || !s.token || !s.exp || Date.now() >= s.exp) return '';
      return s.token;
    }
    function dropSession(relay) {
      delete sessions[relay.id];
      saveSessions();
    }
    function ordered(relayId) {
      if (relayId) return relays.filter(function (r) { return r.id === relayId; });
      var now = Date.now();
      return relays.slice().sort(function (a, b) {
        if (active && a.id === active.id && state[a.id].downUntil <= now) return -1;
        if (active && b.id === active.id && state[b.id].downUntil <= now) return 1;
        var ad = state[a.id].downUntil > now ? 1 : 0;
        var bd = state[b.id].downUntil > now ? 1 : 0;
        return ad - bd || a.priority - b.priority;
      });
    }
    function markOk(relay) {
      state[relay.id].failures = 0;
      state[relay.id].downUntil = 0;
      state[relay.id].lastOk = Date.now();
      state[relay.id].lastError = '';
      active = relay;
    }
    function markFail(relay, err) {
      var s = state[relay.id];
      s.failures += 1;
      s.downUntil = Date.now() + cooldownMs;
      s.lastError = String(err && (err.message || err) || 'sin respuesta');
    }
    function withTimeout(init) {
      init = Object.assign({}, init || {});
      if (init.signal || typeof AbortController === 'undefined') return { init: init, cancel: function () {} };
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, timeoutMs);
      init.signal = ctl.signal;
      return { init: init, cancel: function () { clearTimeout(timer); } };
    }
    async function mint(relay, force) {
      if (!force) {
        var cached = sessionFor(relay);
        if (cached) return cached;
      }
      var cred = await getCredential();
      if (!cred) throw new Error('sin credential Google');
      var timed = withTimeout({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: cred }),
        cache: 'no-store'
      });
      try {
        var r = await fetchFn(relay.base + '/auth', timed.init);
        if (!r.ok) throw new Error('auth HTTP ' + r.status);
        var d = await r.json();
        if (!d || !d.session) throw new Error('auth sin sesión');
        sessions[relay.id] = { token: d.session, exp: d.exp || (Date.now() + 12 * 3600 * 1000) };
        saveSessions();
        return d.session;
      } finally { timed.cancel(); }
    }
    async function fetchRelay(relay, path, opts, commandId) {
      opts = Object.assign({}, opts || {});
      var headers = Object.assign({}, opts.headers || {});
      if (opts.auth !== false) headers.Authorization = 'Bearer ' + await mint(relay, false);
      if (commandId) headers['X-Fleet-Command-Id'] = commandId;
      opts.headers = headers;
      delete opts.auth;
      delete opts.relayId;
      delete opts.commandId;
      delete opts.retry;
      var timed = withTimeout(opts);
      try {
        var response = await fetchFn(relay.base + path, timed.init);
        if (response.status === 401 && headers.Authorization) {
          dropSession(relay);
          headers.Authorization = 'Bearer ' + await mint(relay, true);
          timed.cancel();
          timed = withTimeout(Object.assign({}, opts, { headers: headers }));
          response = await fetchFn(relay.base + path, timed.init);
        }
        return response;
      } finally { timed.cancel(); }
    }
    async function request(path, opts) {
      opts = Object.assign({}, opts || {});
      var method = String(opts.method || 'GET').toUpperCase();
      var mutating = !/^(GET|HEAD|OPTIONS)$/.test(method);
      var commandId = opts.commandId || (mutating ? randomId() : '');
      var candidates = ordered(opts.relayId);
      var attempts = [];
      var lastError = null;

      for (var i = 0; i < candidates.length; i++) {
        var relay = candidates[i];
        try {
          var response = await fetchRelay(relay, path, opts, commandId);
          attempts.push({ relay: relay.id, status: response.status });
          if (response.status >= 500) {
            markFail(relay, 'HTTP ' + response.status);
            lastError = new Error('HTTP ' + response.status);
            continue;
          }
          markOk(relay);
          response.__admiraMesh = {
            version: VERSION,
            relay: relay,
            failover: !!(relays[0] && relay.id !== relays[0].id),
            attempts: attempts,
            commandId: commandId || null
          };
          return response;
        } catch (err) {
          attempts.push({ relay: relay.id, error: String(err && (err.message || err) || err) });
          markFail(relay, err);
          lastError = err;
        }
      }
      var error = lastError instanceof Error ? lastError : new Error('ningún relay de control disponible');
      error.mesh = { version: VERSION, attempts: attempts, commandId: commandId || null };
      throw error;
    }
    async function json(path, opts) {
      var response = await request(path, opts);
      var data;
      try { data = await response.json(); } catch (e) { data = { error: 'respuesta no JSON', status: response.status }; }
      if (data && typeof data === 'object') data._mesh = response.__admiraMesh;
      return { response: response, data: data };
    }
    async function ensureAnySession() {
      var candidates = ordered();
      for (var i = 0; i < candidates.length; i++) {
        try {
          await mint(candidates[i], false);
          markOk(candidates[i]);
          return true;
        } catch (e) { markFail(candidates[i], e); }
      }
      return false;
    }
    async function probeAll() {
      return Promise.all(relays.map(async function (relay) {
        var t0 = Date.now();
        try {
          var response = await fetchRelay(relay, '/health', { method: 'GET', auth: false, cache: 'no-store' }, '');
          var ok = response.ok;
          var body = null;
          try { body = await response.json(); } catch (e) {}
          if (ok) markOk(relay); else markFail(relay, 'HTTP ' + response.status);
          return { relay: relay, reachable: ok, ms: Date.now() - t0, status: response.status, body: body };
        } catch (err) {
          markFail(relay, err);
          return { relay: relay, reachable: false, ms: Date.now() - t0, error: String(err && (err.message || err) || err) };
        }
      }));
    }
    function snapshot() {
      return {
        version: VERSION,
        active: active,
        relays: relays.map(function (r) { return { relay: r, state: Object.assign({}, state[r.id]), session: !!sessionFor(r) }; })
      };
    }

    return {
      version: VERSION,
      relays: relays,
      request: request,
      json: json,
      ensureAnySession: ensureAnySession,
      probeAll: probeAll,
      snapshot: snapshot,
      activeRelay: function () { return active; },
      activeBase: function () { return (active || relays[0] || {}).base || ''; },
      commandId: randomId
    };
  }

  return { VERSION: VERSION, DEFAULT_RELAYS: DEFAULT_RELAYS, create: create, commandId: randomId };
});
