/* ============================================================================
 * failover.js — conmutación automática del backend del Consejo
 * ----------------------------------------------------------------------------
 * Todas las páginas del Consejo llaman al hub del Mac Mini
 * (macmini.tail48b61c.ts.net, en :443 y :8443). Si el Mini cae, la web se queda
 * sin backend. Este script envuelve window.fetch: cuando una llamada AL MINI
 * falla (error de red, timeout, o 5xx/530), la reintenta de forma transparente
 * contra el RESPALDO (este patrón vale para cualquier consumidor) y recuerda el
 * cambio para las siguientes llamadas. Orden de preferencia:
 *
 *   1. Mac Mini   (primario)   https://macmini.tail48b61c.ts.net[:8443]
 *   2. Respaldo   (este Mac)   https://macbook-pro-16.tail48b61c.ts.net:10000  (:8443 optoken)
 *   3. Cloudflare (degradado)  — fase 2 (solo lectura)
 *
 * Es ADITIVO: no toca ninguna llamada existente; solo reescribe el host cuando
 * el primario no responde. Inclúyelo lo antes posible en el <head>.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__admiraFailover) return;
  window.__admiraFailover = true;

  var PRIMARY_HOST = 'macmini.tail48b61c.ts.net';
  // Respaldos por puerto del primario. El gateway de este Mac expone el mismo
  // árbol de rutas (/api, /fleet, /council) en :10000; optoken sigue en :8443.
  var BACKUPS = {
    // primario :443 → 1º respaldo local (este Mac :10000) → 2º Cloudflare degradado
    '': ['https://macbook-pro-16.tail48b61c.ts.net:10000', 'https://fallback.admira.store'],
    '8443': ['https://macbook-pro-16.tail48b61c.ts.net:8443'],   // optoken :8443 → respaldo :8443
  };

  var MINI_DOWN = false;           // una vez detectado, vamos directos al respaldo
  var PROBE_EVERY = 30000;         // cada 30s reintentamos el primario
  var TIMEOUT_MS = 6000;           // techo por intento al primario
  var origFetch = window.fetch.bind(window);

  function parse(u) { try { return new URL(u, location.href); } catch (e) { return null; } }
  function isMini(url) { var p = parse(url); return p && p.hostname === PRIMARY_HOST; }
  function backupsFor(url) {
    var p = parse(url); if (!p) return [];
    var key = (p.port && p.port !== '443') ? p.port : '';
    var list = BACKUPS[key] || [];
    return list.map(function (base) { return base + p.pathname + p.search; });
  }
  function bad(res) { return !res || res.status === 0 || res.status >= 500; }

  function withTimeout(input, init) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    var merged = Object.assign({}, init, { signal: ctl.signal });
    return origFetch(input, merged).finally(function () { clearTimeout(t); });
  }

  async function tryBackups(input, init, urlStr) {
    var alts = backupsFor(urlStr);
    for (var i = 0; i < alts.length; i++) {
      try {
        var r = await origFetch(alts[i], init);
        if (!bad(r)) { MINI_DOWN = true; return r; }
      } catch (e) { /* siguiente */ }
    }
    return null;
  }

  window.fetch = async function (input, init) {
    var urlStr = (typeof input === 'string') ? input : (input && input.url) || String(input);
    if (!isMini(urlStr)) return origFetch(input, init);
    // FleetControl (/fleet) tiene su propia malla en /control/fleet-mesh.js:
    // sesión por relay, timeout largo e idempotencia de comandos. No se debe
    // mezclar con este failover genérico o una misma llamada cambiaría de ruta
    // dos veces sin conservar su X-Fleet-Command-Id.
    var pf = parse(urlStr); if (pf && pf.pathname.indexOf('/fleet/') === 0) return origFetch(input, init);

    // Si ya sabemos que el Mini está caído, vamos directos al respaldo.
    if (MINI_DOWN) {
      var direct = await tryBackups(input, init, urlStr);
      if (direct) return direct;
      MINI_DOWN = false; // el respaldo también falló: reintenta el primario
    }

    try {
      var res = await withTimeout(input, init);
      if (!bad(res)) return res;
      var alt = await tryBackups(input, init, urlStr);
      return alt || res;            // si no hay respaldo, devuelve el 5xx original
    } catch (e) {
      var alt2 = await tryBackups(input, init, urlStr);
      if (alt2) return alt2;
      throw e;                      // ni primario ni respaldo
    }
  };

  // Rearme periódico: vuelve a preferir el Mini cuando se recupere.
  setInterval(function () {
    if (!MINI_DOWN) return;
    origFetch('https://' + PRIMARY_HOST + '/api/council/health', { cache: 'no-store' })
      .then(function (r) { if (!bad(r)) { MINI_DOWN = false; } })
      .catch(function () {});
  }, PROBE_EVERY);

  console.log('[failover] activo · primario', PRIMARY_HOST, '· respaldo', BACKUPS[''][0]);
})();
