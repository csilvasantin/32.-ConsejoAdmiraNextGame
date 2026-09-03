/* control/fleet-mesh.js · AdmiraNeXT Fleet Mesh · v.03.09.2026.r1.13:08
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

  var VERSION = 'v.03.09.2026.r1.13:08';
  var DEFAULT_RELAYS = [
    {
      // PUERTA PÚBLICA (Carlos, 11-ago-2026: «le meto el usuario y va muy lento;
      // en un navegador externo va sin problemas»). Los dos relays de abajo viven
      // en nombres *.ts.net que, DENTRO del tailnet, MagicDNS resuelve a una IP
      // PRIVADA (100.64/10). Chrome 138+ corta ese salto público→privado por
      // «Local Network Access» sin dar error de CORS: la petición muere en 2 ms y
      // el panel se queda sin sesión pareciendo lento. Fuera del tailnet el mismo
      // nombre resuelve al Funnel (IP pública) y todo iba bien — de ahí el
      // síntoma. Este relay va PRIMERO porque funciona en los dos escenarios: el
      // navegador solo habla con Cloudflare y es el worker quien llama al hub.
      // Los directos se quedan de respaldo: si el borde falla, siguen sirviendo
      // a quien esté fuera del tailnet.
      id: 'proxy',
      label: 'Puerta pública',
      base: 'https://fleet.admira.live/api',
      priority: 5
    },
    {
      id: 'macmini',
      label: 'Mac Mini',
      base: 'https://macmini.tail48b61c.ts.net/fleet/api',
      priority: 10
    },
    {
      id: 'macbookpro16',
      label: 'MacBook Pro 16',
      base: 'https://macbook-pro-16.tail48b61c.ts.net:8443/fleet/api',
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
    var timeoutMs = Math.max(1000, +(options.timeoutMs || 9000));
    var cooldownMs = Math.max(1000, +(options.cooldownMs || 15000));
    var state = {};
    var active = null;
    var sessions = {};
    relays.forEach(function (r) { state[r.id] = { failures: 0, downUntil: 0, lastOk: 0, lastError: '' }; });

    function sessionFor(relay) {
      return !!sessions[relay.id];
    }
    function dropSession(relay) {
      delete sessions[relay.id];
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
    /* UN ABORTO DICE POR QUÉ ABORTA (2026-08-10). `ctl.abort()` sin argumento hace
       que fetch rechace con «signal is aborted without reason»: ni dice que fue un
       tiempo de espera, ni de cuánto era, ni contra qué relay. Ese texto subía tal
       cual al control remoto y allí se leía como un fallo del agente de la otra
       máquina. El motivo se declara aquí, y si el motor ignora el argumento de
       abort() se sustituye el rechazo en `explain`. */
    function withTimeout(init, etiqueta) {
      init = Object.assign({}, init || {});
      var tal_cual = function (err) { return err; };
      if (init.signal || typeof AbortController === 'undefined') {
        return { init: init, cancel: function () {}, explain: tal_cual };
      }
      var ctl = new AbortController();
      var motivo = new Error('sin respuesta en ' + timeoutMs + ' ms' + (etiqueta ? ' · ' + etiqueta : ''));
      motivo.name = 'FleetMeshTimeout';
      motivo.fleetMeshTimeout = true;
      var vencido = false;
      var timer = setTimeout(function () {
        vencido = true;
        try { ctl.abort(motivo); } catch (e) { ctl.abort(); }
      }, timeoutMs);
      init.signal = ctl.signal;
      return {
        init: init,
        cancel: function () { clearTimeout(timer); },
        explain: function (err) { return vencido ? motivo : err; }
      };
    }
    async function mint(relay, force) {
      if (!force) {
        if (sessionFor(relay)) return true;
      }
      var timed = withTimeout({
        method: 'GET', credentials:'include',
        cache: 'no-store'
      }, relay.label + ' · auth');
      try {
        var r = await fetchFn(relay.base + '/auth/session', timed.init);
        if (!r.ok) throw new Error('auth HTTP ' + r.status);
        var d = await r.json();
        if (!d || !d.ok) throw new Error('auth sin sesión');
        sessions[relay.id] = String(d.csrf || '');
        if (!sessions[relay.id]) throw new Error('auth sin CSRF');
        return true;
      } catch (err) { throw timed.explain(err); }
      finally { timed.cancel(); }
    }
    async function fetchRelay(relay, path, opts, commandId) {
      opts = Object.assign({}, opts || {});
      var headers = Object.assign({}, opts.headers || {});
      if (opts.auth !== false) await mint(relay, false);
      if (commandId) headers['X-Fleet-Command-Id'] = commandId;
      if (!/^(GET|HEAD|OPTIONS)$/i.test(String(opts.method || 'GET'))) headers['X-Fleet-CSRF'] = sessions[relay.id] || '';
      opts.headers = headers;
      opts.credentials = 'include';
      delete opts.auth;
      delete opts.relayId;
      delete opts.commandId;
      delete opts.retry;
      var timed = withTimeout(opts, relay.label);
      try {
        var response = await fetchFn(relay.base + path, timed.init);
        if (response.status === 401 && opts.auth !== false) {
          dropSession(relay);
          await mint(relay, true);
          timed.cancel();
          timed = withTimeout(Object.assign({}, opts, { headers: headers }), relay.label);
          response = await fetchFn(relay.base + path, timed.init);
        }
        return response;
      } catch (err) { throw timed.explain(err); }
      finally { timed.cancel(); }
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
    async function logoutAll() {
      await Promise.all(relays.map(function(relay){return fetchFn(relay.base+'/auth/logout',{method:'POST',credentials:'include',cache:'no-store'}).catch(function(){});}));
      sessions={}; active=null;
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
      logoutAll: logoutAll,
      snapshot: snapshot,
      activeRelay: function () { return active; },
      activeBase: function () { return (active || relays[0] || {}).base || ''; },
      commandId: randomId
    };
  }

  return { VERSION: VERSION, DEFAULT_RELAYS: DEFAULT_RELAYS, create: create, commandId: randomId };
});
