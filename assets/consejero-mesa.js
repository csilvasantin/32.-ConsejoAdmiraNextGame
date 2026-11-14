/* /consejero <nombre> desaparecer|aparecer (Carlos, 14-11-2026 · t1347u).
 * Quita o devuelve a un consejero de la mesa de la home desde Conversación (y la CLI).
 * Estado propio en localStorage (admira:consejero-mesa): { "<Persona>": false|true }.
 * Se pinta con las capas que ya existen: la placa de sillas vacías de council-presencia.js
 * (consejeros y Carlos Silva, figura Y-3 de Leyendas) y la cabecera de consejo-cabecera.js
 * (Carlo Bonomi, invitado de la cabecera de Coetáneos). Nunca envía nada ni habla. */
(function (root) {
  'use strict';
  var KEY = 'admira:consejero-mesa';
  var CABECERA = { 'Carlo Bonomi': 'carlo-bonomi' };

  function crearEstado(storage) {
    var st = {};
    try { var raw = storage && storage.getItem(KEY); var j = raw ? JSON.parse(raw) : null; if (j && typeof j === 'object' && !Array.isArray(j)) st = j; } catch (e) {}
    return {
      get: function (p) { return Object.prototype.hasOwnProperty.call(st, p) ? !!st[p] : undefined; },
      set: function (p, on) { st[p] = !!on; try { storage && storage.setItem(KEY, JSON.stringify(st)); } catch (e) {} },
      todo: function () { return Object.assign({}, st); }
    };
  }
  // Aplica una persona a las capas: presencia (consejeros y Carlos) o cabecera (Bonomi).
  function aplicarPersona(persona, mesa, on, capas) {
    var pres = capas && capas.presencia && capas.presencia.estado, cab = capas && capas.cabecera && capas.cabecera.estado;
    if (CABECERA[persona]) {
      if (!cab) return false;
      var id = cab.get && cab.get();
      if (on) cab.set(CABECERA[persona]); else if (!id || id === CABECERA[persona]) cab.set(null);
      return true;
    }
    if (!pres) return false;
    if (persona === 'Carlos Silva') { if (pres.setCarlos) { pres.setCarlos(on); return true; } return false; }
    pres.set(mesa, persona, on);
    return true;
  }
  function mensaje(l, ok) {
    if (!ok) return '⚠️ No he podido cambiar a ' + l.persona + ' en la mesa (capa no cargada). No se ha enviado nada.';
    var donde = l.mesa === 'coetaneos' ? 'Coetáneos' : 'Leyendas';
    if (l.persona === 'Carlo Bonomi') return l.visible ? '🪑 Carlo Bonomi aparece en la cabecera de Coetáneos' : '🪑 Carlo Bonomi desaparece de la cabecera de Coetáneos';
    return '🪑 ' + l.persona + (l.visible ? ' aparece en la mesa de ' : ' desaparece de la mesa de ') + donde + (l.visible ? '' : ' — queda su silla');
  }
  function mensajeError(l) {
    var uso = 'Uso: /consejero <nombre> desaparecer · /consejero <nombre> aparecer (p. ej. /consejero carlos desaparecer, /consejero bonomi aparecer). No se ha enviado nada.';
    if (!l) return uso;
    if (l.mensaje === 'consejero-fuera') return l.persona + ' no está en la mesa (la silla COO de Coetáneos es de Mira Murati). No se ha enviado nada.';
    if (l.mensaje === 'consejero-nombre') return '«' + (l.nombre || '') + '» no está en la mesa. Leyendas: Jobs, Woz, Cook, Buffett, Disney, Rams, Schultz, Lucas y Carlos Silva · Coetáneos: Elon, Jensen, Murati, Porat, Lasseter, Ive, Ratti, Reynolds y Carlo Bonomi. No se ha enviado nada.';
    return uso;
  }

  var lib = { KEY: KEY, crearEstado: crearEstado, aplicarPersona: aplicarPersona, mensaje: mensaje, mensajeError: mensajeError };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document === 'undefined') { root.CouncilConsejeroMesaLib = lib; return; }

  // ── DOM ────────────────────────────────────────────────────────────
  var estado = crearEstado(root.localStorage);
  function capas() { return { presencia: root.CouncilPresencia, cabecera: root.CouncilCabecera }; }
  function genActual() {
    var el = document.querySelector('.council-image[data-generation]');
    var g = el && el.getAttribute('data-generation');
    return g === 'coetaneos' ? 'coetaneos' : 'leyendas';
  }
  function repintar(gen) {
    try { root.CouncilPresencia && root.CouncilPresencia.sync(gen); } catch (e) {}
    try { root.CouncilCabecera && root.CouncilCabecera.sync(gen); } catch (e) {}
  }
  function mesaDe(persona) {
    var M = root.AdmiraHablarCmd && root.AdmiraHablarCmd.MESA;
    if (M) for (var g in M) if (M[g][persona]) return g;
    return 'leyendas';
  }
  // Al cargar, lo guardado con /consejero manda sobre las capas.
  function restaurar() {
    var t = estado.todo(), n = 0;
    Object.keys(t).forEach(function (p) { if (aplicarPersona(p, mesaDe(p), t[p], capas())) n++; });
    if (n) repintar(genActual());
  }
  function aplicar(l) {
    if (!l || l.accion !== 'consejero') return { ok: false, msg: mensajeError(l) };
    var ok = aplicarPersona(l.persona, l.mesa, l.visible, capas());
    if (ok) {
      estado.set(l.persona, l.visible);
      var gen = genActual();
      if (l.mesa !== gen) {
        // Se ve en su mesa: mismo botón de generación que usa la home.
        var b = document.querySelector('[data-council-generation="' + l.mesa + '"]');
        if (b) b.click(); else repintar(gen);
      } else repintar(gen);
    }
    return { ok: ok, msg: mensaje(l, ok) };
  }
  if (document.readyState === 'complete') restaurar(); else document.addEventListener('DOMContentLoaded', restaurar);
  root.CouncilConsejeroMesa = { lib: lib, estado: estado, aplicar: aplicar, mensajeError: mensajeError, restaurar: restaurar };
})(typeof window !== 'undefined' ? window : globalThis);
