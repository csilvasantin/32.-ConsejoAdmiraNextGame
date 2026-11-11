/* Intercepta /hablar en las páginas /chat/<consejero>/ (11-11-2026).
 * El literal nunca se POST-ea. Si el destino es otro consejero, navega a su hilo.
 */
(function (root) {
  'use strict';
  var PEND = 'hablar-pendiente';
  function cmd() { return root.AdmiraHablarCmd || null; }
  function aviso(msg) {
    var pie = root.document.getElementById('pie') || root.document.querySelector('.estado, .aviso');
    if (pie) { pie.textContent = msg; pie.hidden = false; }
    else try { root.console && console.info(msg); } catch (e) {}
  }
  function pendiente(clave, texto) {
    try { root.sessionStorage.setItem(PEND, JSON.stringify({ clave: clave, texto: texto, ts: Date.now() })); } catch (e) {}
  }
  function consumirPendiente(clave) {
    try {
      var p = JSON.parse(root.sessionStorage.getItem(PEND) || 'null');
      if (!p || p.clave !== clave || !p.texto) return null;
      if (Date.now() - (p.ts || 0) > 120000) { root.sessionStorage.removeItem(PEND); return null; }
      root.sessionStorage.removeItem(PEND);
      return p.texto;
    } catch (e) { return null; }
  }
  function aplicar(linea, opts) {
    opts = opts || {};
    var C = cmd();
    if (!C || !linea) return null;
    if (linea.accion === 'colgar') { aviso('Has colgado.'); return { interceptado: true }; }
    if (linea.accion === 'ayuda') { aviso(C.listaAyuda()); return { interceptado: true }; }
    if (linea.accion === 'estado') { aviso('Estás en el hilo de ' + (opts.nombre || opts.clave) + '.'); return { interceptado: true }; }
    if (linea.accion === 'error') { aviso('No reconozco a ese consejero. Prueba /hablar Lucas, Jobs, Woz, Disney, Elon o Jensen.'); return { interceptado: true }; }
    if (linea.accion === 'conectar' || linea.accion === 'preguntar') {
      var persona = linea.persona;
      var clave = C.claveDe(persona);
      if (!clave) {
        aviso((persona || 'Ese consejero') + ' aún no tiene línea directa desde aquí.');
        return { interceptado: true };
      }
      var pregunta = linea.pregunta || linea.texto || '';
      if (clave !== opts.clave) {
        if (pregunta) pendiente(clave, pregunta);
        aviso('Pasando a ' + persona + '…');
        root.location.assign(C.urlChat(persona));
        return { interceptado: true };
      }
      if (pregunta) return { interceptado: true, enviar: pregunta };
      aviso('Hablas con ' + persona + ' · /hablar off cuelga. Puedes escribir o usar el micrófono en /hola.');
      return { interceptado: true };
    }
    return { interceptado: true };
  }
  function instalar() {
    var caja = root.document.getElementById('caja');
    var form = root.document.getElementById('enviar');
    if (!caja || !form || !cmd()) return;
    var clave = root.PERSONA, nombre = root.NOMBRE;
    function interceptar(e) {
      var texto = caja.value.trim();
      var linea = cmd().parseLinea(texto, { persona: nombre });
      if (!linea) return false;
      if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
      caja.value = '';
      var r = aplicar(linea, { clave: clave, nombre: nombre });
      if (r && r.enviar) {
        caja.value = r.enviar;
        if (e && e.type === 'submit') return false;
        try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch (err) {}
      }
      return true;
    }
    caja.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) interceptar(e);
    }, true);
    form.addEventListener('submit', interceptar, true);
    var pending = consumirPendiente(clave);
    if (pending) {
      caja.value = pending;
      setTimeout(function () {
        try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch (e) {}
      }, 400);
    }
  }
  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', instalar);
  } else {
    instalar();
  }
  root.AdmiraHablarPagina = { aplicar: aplicar, consumirPendiente: consumirPendiente, pendiente: pendiente };
})(typeof window !== 'undefined' ? window : globalThis);
