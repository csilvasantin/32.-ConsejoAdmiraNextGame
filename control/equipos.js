/* control/equipos.js · Depuración del censo de equipos de /control · v.19.10.2026.r1
 *
 * Dos problemas, una sola pieza:
 *
 * 1) DUPLICADOS. admira-fleet guarda una ficha por id derivado del NOMBRE del Mac
 *    (POST /machines/register → slug(id||name)). Cuando un Mac cambia de nombre
 *    (Mac Studio: «Mac Studio de Carlos» → «Mac Studio», 18-10-2026 13:23 CEST) se
 *    crea una ficha nueva y la vieja se queda para siempre: el Worker no caduca ni
 *    fusiona. El panel, en modo degradado, pinta cada ficha como un equipo.
 *    ALIAS_FIJOS dice «esta ficha es la misma máquina que aquella»: la vieja se
 *    funde en la buena (su latido cuenta para la buena) y no vuelve a salir sola.
 *
 * 2) «ELIMINAR EQUIPO». Borrado LÓGICO y reversible: el equipo se oculta de la
 *    lista (estado en /api/control/equipos, KV del proyecto Pages, con copia en
 *    localStorage), no se toca admira-fleet. Se restaura desde el pie del tablero.
 *
 *    Criterio si vuelve a latir:
 *      · Si estaba CALLADO al eliminarlo (sin señal en los últimos 10 min) y luego
 *        late de verdad (admira-fleet lastSeen o latido de presencia POSTERIOR a la
 *        eliminación), REAPARECE marcado «↩ ha vuelto a latir»: era una ficha muerta
 *        y ahora hay una máquina viva detrás; esconderla sería mentir.
 *      · Si estaba VIVO al eliminarlo, se respeta la decisión: sigue oculto aunque
 *        siga latiendo (se ve en la lista de eliminados con «🟢 sigue latiendo»).
 *      · Reconstruir desde admira-fleet NO lo resucita: las fichas viejas no traen
 *        señal nueva.
 */
(function (root, factory) {
  var api = factory();
  root.AdmiraEquipos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'v.19.10.2026.r1';
  var VIVO_S = 600;        // señal más joven que esto al eliminar = «estaba vivo»
  var MARGEN_S = 60;       // un latido tiene que ser claramente posterior a la eliminación

  // id normalizado (sin «admira-», sin signos) → id normalizado del equipo canónico.
  // Confirmado por Carlos (19-10-2026): «Mac Studio de Carlos» es el Mac Studio (MacStudio.local).
  var ALIAS_FIJOS = { macstudiodecarlos: 'macstudio' };

  function norm(s) { return String(s || '').toLowerCase().replace(/^admira-?/, '').replace(/[^a-z0-9]/g, ''); }
  function clave(m) { return norm(m && (m.id || m.name)); }
  function segs(t) { t = +t || 0; return t > 1e12 ? Math.round(t / 1000) : t; }

  function estadoVacio() { return { ocultos: {}, alias: {}, updatedAt: null }; }
  // Mezcla el estado del servidor con el local: por equipo gana la acción MÁS RECIENTE
  // (ocultar o restaurar), para que una eliminación hecha sin red no se pierda.
  function mezclar(a, b) {
    var out = estadoVacio();
    [a, b].forEach(function (e) {
      if (!e) return;
      Object.keys(e.alias || {}).forEach(function (k) { out.alias[norm(k)] = norm(e.alias[k]); });
      Object.keys(e.ocultos || {}).forEach(function (k) {
        var v = e.ocultos[k], kk = norm(k), prev = out.ocultos[kk];
        if (!v) return;
        if (!prev || segs(v.at) >= segs(prev.at)) out.ocultos[kk] = v;
      });
    });
    return out;
  }
  function estaOculto(estado, k) { var o = estado && estado.ocultos && estado.ocultos[k]; return !!(o && !o.restaurado); }
  function canonico(estado, k) {
    var a = (estado && estado.alias) || {};
    var seen = {};
    while ((ALIAS_FIJOS[k] || a[k]) && !seen[k]) { seen[k] = 1; k = ALIAS_FIJOS[k] || a[k]; }
    return k;
  }

  /* depurar(lista, estado, ultimaSenal, ahora) → { visibles, ocultos, fusionados }
   *  · lista: equipos del censo (hub o admira-fleet)
   *  · ultimaSenal(m) → epoch (s) del último latido REAL conocido (o 0)
   *  No muta la lista de entrada salvo para anotar campos informativos en copias. */
  function depurar(lista, estado, ultimaSenal, ahora) {
    estado = estado || estadoVacio();
    ahora = segs(ahora || Date.now());
    var senal = function (m) { var t = 0; try { t = segs(ultimaSenal ? ultimaSenal(m) : 0); } catch (e) {} return Math.max(t, segs(m.lastSeen)); };
    var porClave = {}, orden = [], fusionados = [];
    (lista || []).forEach(function (m) {
      var k = clave(m); if (!k) return;
      if (!porClave[k]) { porClave[k] = Object.assign({}, m); orden.push(k); }
    });
    // 1) fusión de alias en su canónico (si el canónico está en el censo)
    orden.slice().forEach(function (k) {
      var c = canonico(estado, k);
      if (c === k || !porClave[c]) return;
      var vieja = porClave[k], buena = porClave[c];
      buena.lastSeen = Math.max(segs(buena.lastSeen), senal(vieja));
      buena.aliasDe = (buena.aliasDe || []).concat([vieja.name || vieja.id]);
      if (vieja.online && !buena.online) { buena.online = true; buena.viaAlias = true; }
      ['fqdn', 'host', 'endpoint'].forEach(function (f) { if (!buena[f] && vieja[f]) buena[f] = vieja[f]; });
      fusionados.push({ id: vieja.id, nombre: vieja.name || vieja.id, en: buena.id });
      delete porClave[k]; orden.splice(orden.indexOf(k), 1);
    });
    // 2) eliminados (borrado lógico)
    var visibles = [], ocultos = [];
    orden.forEach(function (k) {
      var m = porClave[k];
      if (!estaOculto(estado, k)) { visibles.push(m); return; }
      var o = estado.ocultos[k], at = segs(o.at), s = senal(m);
      var volvio = !o.vivo && s > at + MARGEN_S;
      if (volvio) { m.reaparecido = { eliminadoEn: at, latido: s }; visibles.push(m); return; }
      ocultos.push({ id: m.id, nombre: m.name || o.nombre || m.id, at: at, sigueLatiendo: !!(s && ahora - s < VIVO_S) });
    });
    // eliminados que ya ni siquiera están en el censo: se listan igual para poder restaurarlos
    Object.keys(estado.ocultos || {}).forEach(function (k) {
      var o = estado.ocultos[k];
      if (!estaOculto(estado, k) || porClave[k]) return;
      ocultos.push({ id: o.id || k, nombre: o.nombre || k, at: segs(o.at), sigueLatiendo: false, fueraDelCenso: true });
    });
    return { visibles: visibles, ocultos: ocultos, fusionados: fusionados };
  }

  // Entrada de estado al eliminar. `senalS` = último latido conocido en ese momento.
  function entradaOcultar(m, senalS, por, ahora) {
    ahora = segs(ahora || Date.now()); senalS = segs(senalS);
    return { id: String(m.id), nombre: String(m.name || m.id).slice(0, 80), at: ahora,
      vivo: !!(senalS && ahora - senalS < VIVO_S), por: String(por || '').slice(0, 80) };
  }
  function aplicar(estado, accion, entrada) {
    var e = mezclar(estado, null), k = norm(entrada.id);
    if (accion === 'ocultar') e.ocultos[k] = entrada;
    else if (accion === 'restaurar') e.ocultos[k] = { id: entrada.id, nombre: entrada.nombre || '', at: segs(entrada.at || Date.now()), restaurado: true };
    e.updatedAt = new Date().toISOString();
    return e;
  }

  return { VERSION: VERSION, ALIAS_FIJOS: ALIAS_FIJOS, VIVO_S: VIVO_S, norm: norm, clave: clave,
    estadoVacio: estadoVacio, mezclar: mezclar, canonico: canonico, depurar: depurar,
    entradaOcultar: entradaOcultar, aplicar: aplicar };
});
