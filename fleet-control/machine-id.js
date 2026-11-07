/* fleet-control/machine-id.js
 * Id canónico del censo del hub y alias yokup/estático «admira-».
 *
 * El censo del relay (fleet.json) usa ids cortos: macbookairplata.
 * admira-fleet y las fichas estáticas usan admira-macbookairplata.
 * machineById comparaba el id exacto, así que el botón de la tarjeta
 * recibía HTTP 400 «máquina desconocida» y el overlay lo contaba como
 * un relay caído.
 *
 * Regla: el id exacto gana. Si no hay exacto, solo se acepta un alias
 * cuando la clave (minúsculas, un prefijo admira- y sin signos) coincide
 * con UNA sola máquina del censo. Cero o varias coincidencias no eligen
 * otra máquina. Esto no autentica ni autoriza: el gate sigue delante.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AdmiraRcMachine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function censusKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/^admira-/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function uniqueMachines(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (machine) {
      if (!machine || machine.id == null || seen[machine.id]) return;
      seen[machine.id] = 1;
      out.push(machine);
    });
    return out;
  }

  function resolveMachine(machines, requested) {
    var list = uniqueMachines(machines);
    var raw = requested == null ? '' : String(requested);
    var trimmed = raw.trim();
    if (!trimmed) {
      return { machine: null, via: null, reason: 'empty', requested: raw, matches: [] };
    }
    var exact = list.filter(function (machine) { return machine.id === trimmed; });
    if (exact.length === 1) {
      return { machine: exact[0], via: 'exact', reason: 'exact', requested: raw, matches: [exact[0].id] };
    }
    if (exact.length > 1) {
      return { machine: null, via: null, reason: 'ambiguous', requested: raw, matches: exact.map(function (machine) { return machine.id; }) };
    }
    var key = censusKey(trimmed);
    if (!key) {
      return { machine: null, via: null, reason: 'empty', requested: raw, matches: [] };
    }
    var hits = list.filter(function (machine) { return censusKey(machine.id) === key; });
    if (hits.length === 1) {
      return {
        machine: hits[0],
        via: hits[0].id === trimmed ? 'exact' : 'alias',
        reason: 'alias',
        requested: raw,
        matches: [hits[0].id]
      };
    }
    if (hits.length > 1) {
      return {
        machine: null,
        via: null,
        reason: 'ambiguous',
        requested: raw,
        matches: hits.map(function (machine) { return machine.id; })
      };
    }
    return { machine: null, via: null, reason: 'unknown', requested: raw, matches: [] };
  }

  function unknownMachineBody(requested, resolution) {
    var found = resolution || { reason: 'unknown', matches: [] };
    var body = {
      error: found.reason === 'ambiguous' ? 'máquina ambigua' : 'máquina desconocida',
      requested: String(requested == null ? '' : requested).slice(0, 120),
      retry: false,
      relay: false
    };
    if (found.reason === 'ambiguous') {
      body.detail = 'Ese id coincide con más de una máquina del censo de este relay. No se elige ninguna.';
      body.matches = (found.matches || []).slice(0, 8);
      return body;
    }
    body.detail = 'Ese id no está en el censo de este relay. No es un fallo de ruta ni de permisos.';
    return body;
  }

  /* Tras el gate. No ejecuta nada: solo dice a qué máquina del censo iría la orden. */
  function commandTarget(machines, machineId) {
    var found = resolveMachine(machines, machineId);
    if (!found.machine) {
      return { ok: false, status: 400, body: unknownMachineBody(machineId, found), machine: null, via: null, executed: false };
    }
    return { ok: true, status: 200, machine: found.machine, via: found.via, executed: false };
  }

  /* El mismo contrato que el hub: sin sesión no hay máquina, aunque el id exista. */
  function gateThenTarget(authorized, machines, machineId) {
    if (!authorized) {
      return { status: 401, error: 'token requerido', body: { error: 'token requerido' }, machine: null, via: null, executed: false };
    }
    var target = commandTarget(machines, machineId);
    if (!target.ok) {
      return { status: target.status, error: target.body.error, body: target.body, machine: null, via: null, executed: false };
    }
    return { status: 200, error: null, body: null, machine: target.machine, via: target.via, executed: true };
  }

  /* Id que el botón debe enviar. Sin censo conocido se deja el id de la tarjeta:
     el hub resuelve el alias. Nunca se sustituye por otra máquina. */
  /* Id que el hub desplegado acepta. Quitar un solo prefijo admira- no
     cambia de máquina: la clave es la misma. El ?rc= pedido gana si nombra
     esta misma ficha. Nunca se elige el id de otra. */
  function controlIdFor(machineOrId, requested) {
    var card = machineOrId && typeof machineOrId === 'object' ? machineOrId.id : machineOrId;
    var cardRaw = card == null ? '' : String(card);
    var ask = requested == null ? '' : String(requested).trim();
    if (ask && censusKey(ask) && censusKey(ask) === censusKey(cardRaw)) return ask;
    var stripped = cardRaw.replace(/^admira-/, '');
    if (stripped && stripped !== cardRaw && censusKey(stripped) === censusKey(cardRaw)) return stripped;
    return cardRaw;
  }

  function canonicalControlUrl(href) {
    var raw = String(href || '');
    var parsed;
    try { parsed = new URL(raw); } catch (e) { return null; }
    if (parsed.protocol !== 'https:') return null;
    var host = parsed.hostname.toLowerCase();
    if (host !== 'admira.live' && host !== 'www.admira.live') return null;
    var nextHost = host === 'admira.live' ? 'www.admira.live' : host;
    var nextPath = parsed.pathname === '/control' ? '/control/' : parsed.pathname;
    if (nextHost === host && nextPath === parsed.pathname) return null;
    parsed.hostname = nextHost;
    parsed.pathname = nextPath;
    return parsed.toString();
  }

  function esFalloPermisoCaptura(payload) {
    var text = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
    // Un screencapture rc=1 o un agente en pausa no es «falta Grabación de pantalla».
    if (/ERR_CAPTURE_PAUSED|ERR_CAPTURE_TRANSIENT|ERR_STALE_FRAME|ERR_NO_SUCH_DISPLAY|SCREEN_CAPTURE_FAILED|capture_transient|capture_stale|no_such_display/.test(text)) return false;
    return /ERR_NO_CAPTURE|capture_failed_or_no_permission/.test(text);
  }

  function selectControlId(machineOrId, census) {
    var requested = machineOrId && typeof machineOrId === 'object' ? machineOrId.id : machineOrId;
    var raw = requested == null ? '' : String(requested);
    var list = Array.isArray(census) ? census : [];
    if (!list.length) return raw;
    var found = resolveMachine(list, raw);
    return found.machine && found.machine.id ? found.machine.id : raw;
  }

  function frameRequest(machineId, census) {
    var id = selectControlId(machineId, census);
    return { path: '/live/frame', query: { machine: id } };
  }

  function inputRequest(machineId, census, payload) {
    var id = selectControlId(machineId, census);
    var body = {};
    var source = payload || {};
    Object.keys(source).forEach(function (key) { body[key] = source[key]; });
    body.machine = id;
    return { path: '/input', body: body };
  }

  function parseErrorBody(text) {
    var raw = String(text || '').replace(/^HTTP \d+\s*/, '');
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function frameFailure(err, text) {
    var status = err && err.status ? err.status : 0;
    var source = text || (err && err.message) || '';
    var body = parseErrorBody(source) || {};
    var timeout = !!(err && (err.fleetMeshTimeout || /FleetMeshTimeout|sin respuesta en \d+ ms|aborted without reason/i.test(String(source))));
    var unknown = status === 400 || body.error === 'máquina desconocida' || body.error === 'máquina ambigua' || body.retry === false;
    var title = 'Esperando al agente…';
    var cause = String((body.error || '') + (body.requested ? (' · ' + body.requested) : '') + (body.detail ? (' · ' + body.detail) : '')).replace(/^ · /, '');
    if (!cause) cause = String(source);
    var hint = 'Fleet Mesh probará otro relay.';
    var retryMs = 1200;
    var definitive = false;

    if (/ERR_NO_SUCH_DISPLAY|no_such_display/.test(String(source)) || body.error === 'no_such_display') {
      title = 'Esa pantalla no existe';
      hint = 'El índice no está en la lista de la máquina. No se ha mostrado otra pantalla en su lugar.';
      retryMs = 5000;
      definitive = true;
      unknown = false;
    } else if (/ERR_STALE_FRAME|capture_stale/.test(String(source)) || body.error === 'capture_stale') {
      title = 'La imagen no es de ahora';
      hint = 'El fotograma es viejo y no se cuenta como en vivo. Se pide otro.';
      unknown = false;
    } else if (/ERR_CAPTURE_PAUSED|ERR_CAPTURE_TRANSIENT|SCREEN_CAPTURE_FAILED|capture_transient/.test(String(source)) || body.error === 'capture_transient') {
      title = 'La captura se interrumpió';
      hint = 'screencapture no pudo crear la imagen (fallo transitorio). El agente sigue en marcha y el siguiente fotograma se pide de nuevo. No es un permiso de Grabación de pantalla.';
      unknown = false;
    } else if (status === 424 || /capture_failed_or_no_permission|ERR_NO_CAPTURE|agente de captura desactualizado/.test(String(source))) {
      title = 'La máquina no devuelve imagen';
      if (/agente de captura desactualizado/.test(String(source))) {
        hint = 'El agente de captura de esa máquina es más viejo que el del repo: el vigía lo actualiza si la versión instalada no es más nueva. Pulsa «🔎 probar» en su tarjeta para forzarlo.';
      } else if (/ERR_NO_CAPTURE|capture_failed_or_no_permission/.test(String(source))) {
        hint = 'No hay fotograma. Si el agente ya está al día, falta Grabación de pantalla para /usr/bin/python3 en esa sesión. El arreglo abre el panel; el permiso lo concede la persona. No se toca TCC desde aquí.';
      } else {
        hint = 'La máquina no ha devuelto captura. Pulsa «🔎 probar» en su tarjeta.';
      }
      unknown = false;
    } else if (status === 401) {
      title = err && err.failover ? 'Relé de respaldo sin tu sesión' : 'Sesión caducada en el hub';
      cause = (err && err.relay ? ('relé ' + err.relay + ' · ') : '') + 'HTTP 401' + (err && err.failover ? ' (respaldo)' : '');
      hint = err && err.failover
        ? 'La cookie de sesión sólo viaja al relé principal (fleet.admira.live). Reconectando por el principal; si persiste, recarga y entra de nuevo.'
        : 'Vuelve a entrar con Google (la sesión ha caducado).';
      unknown = false;
    } else if (status >= 500) {
      title = 'El relé de control ha fallado';
      hint = 'Este relé ha respondido con error. Fleet Mesh probará otro relay.';
      unknown = false;
    }     else if (timeout) {
      title = 'El relé no contesta a tiempo';
      hint = 'El relay que tiene la sesión no contestó a tiempo. No es un permiso de captura. Se reintenta ese mismo relay; un nombre *.ts.net no hereda la cookie.';
      unknown = false;
    } else if (unknown) {
      title = body.error === 'máquina ambigua' ? 'Identificador ambiguo' : 'Máquina desconocida para el relay';
      hint = 'El relay contestó: el id pedido no se puede operar. No se prueba otro relay, porque la respuesta es del censo, no de la ruta.';
      retryMs = 15000;
      definitive = true;
    } else if (status === 403 || status === 404) {
      title = 'El relay ha rechazado la orden';
      hint = 'La respuesta es definitiva. Reintentar por otro relay no cambia el censo ni el permiso.';
      retryMs = 15000;
      definitive = true;
    }

    return {
      title: title,
      cause: String(cause).slice(0, 220),
      hint: hint,
      retryMs: retryMs,
      definitive: definitive,
      relayFault: (status >= 500 || timeout) && !definitive
    };
  }

  function fallbackBanner(kind, routeLabel) {
    if (!kind || kind === 'ok' || kind === false) return null;
    if (kind === 'failover' || kind === true) {
      return {
        level: 'route',
        text: 'La ruta primaria no responde desde este navegador. Control activo por ' + (routeLabel || 'otro relay') + '. Esto describe la ruta de control, no el estado físico del Mac Mini.'
      };
    }
    if (kind === 'census') {
      return {
        level: 'readonly-list',
        text: 'El relay de control responde a /health, pero el censo en vivo (/status) no llegó. La lista se reconstruye desde admira-fleet (solo lectura de fichas). SSH, capturas y comandos siguen saliendo por el relay al elegir un equipo; no falta la ruta.'
      };
    }
    if (kind === 'paint') {
      return {
        level: 'paint',
        text: 'El relay respondió, pero el tablero no pudo pintarse. No se ha pasado a solo lectura y no falta una ruta de control.'
      };
    }
    return {
      level: 'readonly',
      text: 'Sin relay de control disponible — la flota se reconstruye desde admira-fleet (solo lectura). Los equipos pueden seguir encendidos; falta una ruta confirmada para SSH, capturas y comandos.'
    };
  }

  function classifyStatusFailure(err, healthReachable) {
    var code = err && (err.code || err.status);
    if (code === 401) return 'auth';
    if (healthReachable) return 'census';
    return 'no-relay';
  }

  return {
    censusKey: censusKey,
    resolveMachine: resolveMachine,
    unknownMachineBody: unknownMachineBody,
    commandTarget: commandTarget,
    gateThenTarget: gateThenTarget,
    controlIdFor: controlIdFor,
    canonicalControlUrl: canonicalControlUrl,
    esFalloPermisoCaptura: esFalloPermisoCaptura,
    selectControlId: selectControlId,
    frameRequest: frameRequest,
    inputRequest: inputRequest,
    frameFailure: frameFailure,
    fallbackBanner: fallbackBanner,
    classifyStatusFailure: classifyStatusFailure
  };
});
