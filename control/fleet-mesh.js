/* control/fleet-mesh.js · AdmiraNeXT Fleet Mesh · v.10.11.2026.control-lan
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

  var VERSION = 'v.10.11.2026.control-lan';
  var DEFAULT_RELAYS = [
    {
      // Arranque universal. Un sondeo breve, paralelo a las peticiones, permite
      // preferir un relay privado sólo si Serve acredita la ruta tailnet y ese
      // host ya tiene su propia sesión. LNA denegado, Funnel o falta de cookie
      // conservan esta puerta sin retrasar el panel.
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
      id: 'macstudio',
      label: 'Mac Studio',
      base: 'https://macstudio.tail48b61c.ts.net:8443/fleet/api',
      priority: 15
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
    var timeoutMs = Math.max(1000, +(options.timeoutMs || 9000));
    var cooldownMs = Math.max(1000, +(options.cooldownMs || 15000));
    var privateProbeMs = Math.max(500, Math.min(2000, +(options.privateProbeMs || 1000)));
    var privateProbeIntervalMs = 30000;
    var state = {};
    var active = null;
    var sessions = {};
    var authGeneration = 0;
    var loggingOut = false;
    var logoutPromise = null;
    var privateProbes = {};
    var nextPrivateProbe = {};
    relays.forEach(function (r) { state[r.id] = { failures: 0, downUntil: 0, lastOk: 0, lastError: '', privateUntil: 0 }; });

    function knownDirect(relay) {
      // No descubrir hosts de la red ni enviar credenciales a bases añadidas.
      return DEFAULT_RELAYS.some(function (r) { return r.id !== 'proxy' && r.base === relay.base; });
    }
    function preferredPrivate(relay) {
      return knownDirect(relay) && state[relay.id].privateUntil > Date.now()
        && state[relay.id].downUntil <= Date.now() && sessionFor(relay);
    }

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
        var ap = preferredPrivate(a) ? 1 : 0, bp = preferredPrivate(b) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        if (active && a.id === active.id && state[a.id].downUntil <= now && (!knownDirect(a) || ap)) return -1;
        if (active && b.id === active.id && state[b.id].downUntil <= now && (!knownDirect(b) || bp)) return 1;
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
      if (!active || !preferredPrivate(active) || preferredPrivate(relay)) active = relay;
    }
    function markFail(relay, err) {
      var s = state[relay.id];
      s.failures += 1;
      s.downUntil = Date.now() + cooldownMs;
      s.lastError = String(err && (err.message || err) || 'sin respuesta');
      s.privateUntil = 0;
    }
    function pathOnly(path) {
      return String(path || '').split('?')[0];
    }
    // El censo SSH (/status, /preflight) puede tardar más que /health sin que
    // la puerta pública esté caída. Enfriarla manda el control al nombre
    // *.ts.net, que dentro del tailnet Chrome corta y que además no tiene la
    // cookie __Host- de fleet.admira.live.
    function heavyCensus(path) {
      return /^\/(status|preflight)$/.test(pathOnly(path));
    }
    function stickyControl(path) {
      return /^\/(live\/frame|input|displays)$/.test(pathOnly(path));
    }
    function noteSlow(relay, err) {
      state[relay.id].lastError = String(err && (err.message || err) || 'censo lento');
    }
    /* UN ABORTO DICE POR QUÉ ABORTA (2026-08-10). `ctl.abort()` sin argumento hace
       que fetch rechace con «signal is aborted without reason»: ni dice que fue un
       tiempo de espera, ni de cuánto era, ni contra qué relay. Ese texto subía tal
       cual al control remoto y allí se leía como un fallo del agente de la otra
       máquina. El motivo se declara aquí, y si el motor ignora el argumento de
       abort() se sustituye el rechazo en `explain`. */
    function withTimeout(init, etiqueta) {
      init = Object.assign({}, init || {});
      var limit = Math.max(500, +(init.timeoutMs || timeoutMs));
      delete init.timeoutMs;
      var tal_cual = function (err) { return err; };
      if (init.signal || typeof AbortController === 'undefined') {
        return { init: init, cancel: function () {}, explain: tal_cual };
      }
      var ctl = new AbortController();
      var motivo = new Error('sin respuesta en ' + limit + ' ms' + (etiqueta ? ' · ' + etiqueta : ''));
      motivo.name = 'FleetMeshTimeout';
      motivo.fleetMeshTimeout = true;
      var vencido = false;
      var timer = setTimeout(function () {
        vencido = true;
        try { ctl.abort(motivo); } catch (e) { ctl.abort(); }
      }, limit);
      init.signal = ctl.signal;
      return {
        init: init,
        cancel: function () { clearTimeout(timer); },
        explain: function (err) { return vencido ? motivo : err; }
      };
    }
    async function mint(relay, force, limitMs) {
      if (loggingOut) throw new Error('cierre de sesión en curso');
      if (!force) {
        if (sessionFor(relay)) return true;
      }
      var generation = authGeneration;
      var timed = withTimeout({
        method: 'GET', credentials:'include',
        cache: 'no-store', timeoutMs: limitMs || timeoutMs
      }, relay.label + ' · auth');
      try {
        var r = await fetchFn(relay.base + '/auth/session', timed.init);
        if (!r.ok) {
          var authError = new Error('auth HTTP ' + r.status);
          authError.status = r.status;
          throw authError;
        }
        var d = await r.json();
        if (!d || !d.ok) throw new Error('auth sin sesión');
        if (generation !== authGeneration) throw new Error('sesión cerrada');
        // Agente: la API responde ok+agent+readOnly y no trae csrf de escritura.
        // Si además viniera un csrf, no se guarda: el agente no escribe.
        if (d.agent === true && d.readOnly === true) {
          sessions[relay.id] = { csrf: '', readOnly: true, agent: true, name: String(d.name || ''), email: String(d.email || '') };
          return true;
        }
        if (d.agent === true) throw new Error('agente sin lectura');
        sessions[relay.id] = { csrf: String(d.csrf || ''), readOnly: false, agent: false };
        if (!sessions[relay.id].csrf) throw new Error('auth sin CSRF');
        return true;
      } catch (err) { throw timed.explain(err); }
      finally { timed.cancel(); }
    }
    async function bridgePrivateSession(relay, generation, serverId) {
      try {
        var proxy = relays.find(function (r) { return r.base === DEFAULT_RELAYS[0].base; });
        if (!proxy || generation !== authGeneration) throw new Error('sesión privada no disponible');
        await mint(proxy, false, privateProbeMs);
        var human = sessions[proxy.id];
        // Sólo una sesión humana activa con CSRF puede pedir el puente. La
        // identidad Serve y las sesiones de agente no conceden control humano.
        if (!human || human.agent || human.readOnly || !human.csrf || generation !== authGeneration) {
          throw new Error('sesión privada no disponible');
        }
        var issued = await fetchRelay(proxy, '/auth/relay-ticket', {
          method: 'POST', cache: 'no-store', redirect: 'error', timeoutMs: privateProbeMs,
          headers: { 'Content-Type': 'application/json' }, body: '{}'
        }, '');
        if (!issued.ok) throw new Error('sesión privada no disponible');
        var body = await issued.json();
        if (!body || !body.ok || !serverId || body.relay !== serverId || typeof body.ticket !== 'string' || !body.ticket || body.ticket.length > 4096 || generation !== authGeneration) {
          throw new Error('sesión privada no disponible');
        }
        // Ticket opaco, de un uso, sólo en memoria hasta consumirlo en el host
        // privado. Nunca se guarda ni viaja en una URL, registro o mensaje.
        var timed = withTimeout({
          method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', timeoutMs: privateProbeMs,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: body.ticket })
        }, relay.label + ' · sesión privada');
        try {
          var consumed = await fetchFn(relay.base + '/auth/relay-ticket/consume', timed.init);
          if (!consumed.ok || generation !== authGeneration) throw new Error('sesión privada no disponible');
          var result = await consumed.json();
          if (!result || result.ok !== true) throw new Error('sesión privada no disponible');
        } catch (err) { throw new Error('sesión privada no disponible'); }
        finally { timed.cancel(); }
        await mint(relay, true, privateProbeMs);
      } catch (err) { throw new Error('sesión privada no disponible'); }
    }
    function probePrivate(relay, force) {
      if (loggingOut) return Promise.resolve(null);
      if (privateProbes[relay.id]) return privateProbes[relay.id];
      if (!force && Date.now() < (nextPrivateProbe[relay.id] || 0)) return Promise.resolve(null);
      nextPrivateProbe[relay.id] = Date.now() + privateProbeIntervalMs;
      var generation = authGeneration;
      privateProbes[relay.id] = (async function () {
        var t0 = Date.now();
        var timed = withTimeout({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', timeoutMs: privateProbeMs }, relay.label + ' · red privada');
        try {
          var response = await fetchFn(relay.base + '/health', timed.init);
          var body = response.ok ? await response.json() : null;
          // Un *.ts.net accesible desde fuera puede estar pasando por Funnel.
          // La salud declara sólo un booleano, nunca el usuario de Tailscale.
          var privateRoute = !!(body && body.ok && body.service === 'fleet-control' && body.network && body.network.private === true);
          if (!privateRoute || generation !== authGeneration) {
            state[relay.id].privateUntil = 0;
            return { relay: relay, reachable: response.ok, private: false, ms: Date.now() - t0, status: response.status, body: body };
          }
          try { await mint(relay, false, privateProbeMs); }
          catch (err) {
            if (!err || err.status !== 401) throw err;
            await bridgePrivateSession(relay, generation, body.relay && body.relay.id);
          }
          if (generation !== authGeneration) return null;
          state[relay.id].privateUntil = Date.now() + privateProbeIntervalMs * 2;
          markOk(relay);
          return { relay: relay, reachable: true, private: true, authenticated: true, ms: Date.now() - t0, status: response.status, body: body };
        } catch (err) {
          state[relay.id].privateUntil = 0;
          state[relay.id].lastError = String(timed.explain(err).message || err);
          return { relay: relay, reachable: false, private: false, ms: Date.now() - t0, error: state[relay.id].lastError };
        } finally { timed.cancel(); }
      })().finally(function () { delete privateProbes[relay.id]; });
      return privateProbes[relay.id];
    }
    function schedulePrivateProbes() {
      if (loggingOut) return;
      relays.filter(knownDirect).forEach(function (relay) { probePrivate(relay, false); });
    }
    async function fetchRelay(relay, path, opts, commandId) {
      opts = Object.assign({}, opts || {});
      var headers = Object.assign({}, opts.headers || {});
      if (opts.auth !== false) await mint(relay, false, opts.timeoutMs);
      var ses = sessions[relay.id] || null;
      var method = String(opts.method || 'GET');
      if (ses && ses.readOnly && !/^(GET|HEAD|OPTIONS)$/i.test(method)) {
        var readOnlyError = new Error('solo lectura');
        readOnlyError.fleetReadOnly = true;
        throw readOnlyError;
      }
      if (commandId) headers['X-Fleet-Command-Id'] = commandId;
      if (!/^(GET|HEAD|OPTIONS)$/i.test(method)) headers['X-Fleet-CSRF'] = (ses && ses.csrf) || '';
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
          await mint(relay, true, opts.timeoutMs);
          timed.cancel();
          timed = withTimeout(Object.assign({}, opts, { headers: headers }), relay.label);
          response = await fetchFn(relay.base + path, timed.init);
        }
        return response;
      } catch (err) { throw timed.explain(err); }
      finally { timed.cancel(); }
    }
    async function request(path, opts) {
      schedulePrivateProbes();
      opts = Object.assign({}, opts || {});
      var method = String(opts.method || 'GET').toUpperCase();
      var mutating = !/^(GET|HEAD|OPTIONS)$/.test(method);
      var commandId = opts.commandId || (mutating ? randomId() : '');
      var candidates = ordered(opts.relayId);
      var attempts = [];
      var lastError = null;

      for (var i = 0; i < candidates.length; i++) {
        var relay = candidates[i];
        // La procedencia de esta petición no cambia si un sondeo paralelo
        // invalida la ruta mientras esperamos su fotograma.
        var wasPrivate = preferredPrivate(relay);
        try {
          var response = await fetchRelay(relay, path, opts, commandId);
          attempts.push({ relay: relay.id, status: response.status });
          if (response.status >= 500) {
            lastError = new Error('HTTP ' + response.status);
            lastError.status = response.status;
            if (heavyCensus(path) && sessions[relay.id]) {
              noteSlow(relay, lastError);
              break;
            }
            if (stickyControl(path) && sessions[relay.id] && !wasPrivate) {
              noteSlow(relay, lastError);
              response.__admiraMesh = {
                version: VERSION,
                relay: relay,
                failover: !!(relays[0] && relay.id !== relays[0].id),
                attempts: attempts,
                commandId: commandId || null,
                sticky: true
              };
              return response;
            }
            markFail(relay, lastError);
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
          lastError = err;
          if (err && err.fleetReadOnly) break;
          var timedOut = !!(err && err.fleetMeshTimeout);
          if (timedOut && sessions[relay.id] && (heavyCensus(path) || (stickyControl(path) && !wasPrivate))) {
            noteSlow(relay, err);
            break;
          }
          markFail(relay, err);
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
      schedulePrivateProbes();
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
        if (knownDirect(relay)) return probePrivate(relay, true);
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
    function logoutAll() {
      if (logoutPromise) return logoutPromise;
      loggingOut = true;
      authGeneration += 1;
      relays.forEach(function (relay) { state[relay.id].privateUntil = 0; });
      var pendingRelays = Object.keys(privateProbes);
      // Un canje ya enviado puede recibir Set-Cookie aunque su generación haya
      // caducado. Esperarlo asegura que el cierre borre esa cookie después.
      var pending = pendingRelays.map(function (id) { return privateProbes[id].catch(function () {}); });
      logoutPromise = (async function () {
        await Promise.all(pending);
        var failures = [];
        await Promise.all(relays.map(async function (relay) {
          var tracked = sessionFor(relay) || pendingRelays.includes(relay.id);
          var ses = sessions[relay.id];
          var timed = withTimeout({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' }, relay.label + ' · cierre');
          try {
            // También puede haber cookie en un host aún no usado por la malla,
            // o en un canje que acaba de terminar sin guardar sesión en memoria.
            if (!ses) {
              var probe = await fetchFn(relay.base + '/auth/session', timed.init);
              if (probe.status === 401) { dropSession(relay); return; }
              if (!probe.ok) throw new Error('HTTP ' + probe.status);
              var body = await probe.json();
              if (!body || !body.ok) throw new Error('auth sin sesión');
              ses = { csrf: String(body.csrf || ''), agent: body.agent === true, readOnly: body.readOnly === true };
              if (!ses.agent && !ses.csrf) throw new Error('auth sin CSRF');
              sessions[relay.id] = ses;
              tracked = true;
            }
            timed.cancel();
            timed = withTimeout({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error',
              headers: ses.csrf ? { 'X-Fleet-CSRF': ses.csrf } : {} }, relay.label + ' · cierre');
            var response = await fetchFn(relay.base + '/auth/logout', timed.init);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var result = await response.json();
            if (!result || !result.ok) throw new Error('cierre no confirmado');
            dropSession(relay);
          } catch (err) {
            // Un relay sin sesión conocida y sin conexión no impide cerrar los
            // hosts usados. Un fallo en una sesión activa sí debe mostrarse.
            if (tracked) failures.push(relay.label + ': ' + String(timed.explain(err).message || 'sin respuesta'));
          } finally { timed.cancel(); }
        }));
        if (active && !sessionFor(active)) active = null;
        if (failures.length) throw new Error('No se pudo cerrar la sesión · ' + failures.join(' · '));
      })().finally(function () { loggingOut = false; logoutPromise = null; });
      return logoutPromise;
    }
    function agentReadOnly() {
      for (var i = 0; i < relays.length; i++) {
        var ses = sessions[relays[i].id];
        if (ses && ses.agent === true && ses.readOnly === true) return true;
      }
      return false;
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
      agentReadOnly: agentReadOnly,
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
