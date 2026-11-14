/* Demo del Consejo en la home (Lucas, 14-11-2026, pedido de Carlos):
 *   https://www.admira.live/?demo=pan            (opcional: &a=disney&b=elon)
 * Barra de tres pasos: 1 · Leyendas → 2 · Coetáneos con Carlo Bonomi en la cabecera →
 * 3 · /conversacion <a> vs <b> <tema de PortAventuraNeXT> por el compositor de Conversación
 * (t1341u, Jobs): los consejeros de verdad se escriben por consejero_mensaje y el recuadro de
 * Conversación lo pinta y lo locuta. Nada se envía solo: el paso 3 sale con el clic de Carlos.
 * Plan B sin red: /escena0/?flujo=pan&cabecera=bonomi (el mismo relato, guionizado). */
(function (root) {
  'use strict';
  var PARES = { a: 'disney', b: 'elon' };
  var NOMBRE = { disney: 'Walt', walt: 'Walt', jobs: 'Jobs', steve: 'Jobs', woz: 'Woz', wozniak: 'Woz', lucas: 'Lucas', george: 'Lucas', elon: 'Elon', musk: 'Elon', jensen: 'Jensen', huang: 'Jensen' };
  var PERSONA = { disney: 'Walt Disney', walt: 'Walt Disney', jobs: 'Steve Jobs', steve: 'Steve Jobs', woz: 'Steve Wozniak', wozniak: 'Steve Wozniak', lucas: 'George Lucas', george: 'George Lucas', elon: 'Elon Musk', musk: 'Elon Musk', jensen: 'Jensen Huang', huang: 'Jensen Huang' };

  function limpio(v, def) { var s = String(v || '').toLowerCase().replace(/[^a-z]/g, ''); return NOMBRE[s] ? s : def; }

  function tema(invitado) {
    return 'la presentación de PortAventuraNeXT, «El parque que se cuenta solo», para el show del lunes 16-nov en Planeta 7: ' +
      'el mito (cada historia que se compra, se come, se monta o se duerme ya existía antes en una pantalla), ' +
      'el conflicto (cinco minutos de magia y cincuenta de colas, mapas y menús) y la continuidad de AdmiraNeXT ' +
      '(una sala, cinco ordenadores, una cocina: un solo relato con un solo reloj), capítulo a capítulo: zonas, la grieta, ' +
      'la pared extendida, Paseo Creel, la interactiva, tienda, restaurante, atracción, hotel LEGO y el cierre con la web de PortAventuraNeXT en las cinco pantallas' +
      (invitado ? '. En la cabecera de la mesa escucha ' + invitado : '');
  }

  function comandoConversacion(a, b, invitado) { return '/conversacion ' + a + ' vs ' + b + ' ' + tema(invitado); }

  var lib = { tema: tema, comandoConversacion: comandoConversacion, limpio: limpio, PERSONA: PERSONA, NOMBRE: NOMBRE, PARES: PARES };
  if (typeof document === 'undefined') { root.CouncilDemoLib = lib; return; }

  var q; try { q = new URLSearchParams(root.location.search); } catch (e) { return; }
  var modo = String(q.get('demo') || '').toLowerCase();
  if (!/^(pan|consejo|portaventura|portaventuranext)$/.test(modo)) return;
  var a = limpio(q.get('a'), PARES.a), b = limpio(q.get('b'), PARES.b);
  if (a === b) b = a === 'elon' ? 'jobs' : 'elon';

  function aviso(t) { var el = document.getElementById('demo-consejo-estado'); if (el) el.textContent = t; }
  function invitado() { var c = root.CouncilCabecera && root.CouncilCabecera.actual(); return c ? c.nombre : ''; }
  function irA(gen) {
    if (typeof root.setGen === 'function') root.setGen(gen);
    else if (typeof root.handleCliCommand === 'function') root.handleCliCommand('/' + gen);
  }
  function marcar(n) {
    document.querySelectorAll('#demo-consejo [data-paso]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-paso') === String(n))); });
  }
  var pasos = {
    1: function () { irA('leyendas'); aviso('Consejo de Leyendas'); },
    2: function () {
      if (root.CouncilCabecera) root.CouncilCabecera.estado.set('carlo-bonomi');
      irA('coetaneos');
      if (root.CouncilCabecera) root.CouncilCabecera.sync('coetaneos');
      aviso('Consejo de Coetáneos · en la cabecera, ' + (invitado() || 'Carlo Bonomi'));
    },
    3: function () {
      var I = root.CouncilInterface;
      var cmd = comandoConversacion(a, b, invitado());
      if (!I || typeof I.send !== 'function') { aviso('La Conversación aún no ha cargado: recarga o escribe ' + cmd.slice(0, 40) + '…'); return; }
      aviso('Lanzando /conversacion ' + NOMBRE[a] + ' vs ' + NOMBRE[b] + '… la transcripción y las voces salen en Conversación.');
      Promise.resolve(I.send(PERSONA[a], cmd)).catch(function () { aviso('No se pudo enviar: entra con Google y vuelve a pulsar 3.'); });
    }
  };

  function montar() {
    if (document.getElementById('demo-consejo')) return;
    var bar = document.createElement('div');
    bar.id = 'demo-consejo';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Demo del Consejo');
    bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:96vw;padding:8px 12px;background:rgba(20,14,6,.94);border:2px solid #c9a227;box-shadow:4px 4px 0 #000;font:600 13px/1.2 system-ui,sans-serif;color:#f3e6c4';
    var btn = 'appearance:none;background:#1a140a;color:#ffd75e;border:1px solid #c9a227;padding:8px 12px;font:700 13px/1 system-ui,sans-serif;cursor:pointer';
    bar.innerHTML =
      '<b style="color:#ffd75e;letter-spacing:.06em;text-transform:uppercase;font-size:11px">Demo · PortAventuraNeXT</b>' +
      '<button type="button" data-paso="1" style="' + btn + '">1 · Leyendas</button>' +
      '<button type="button" data-paso="2" style="' + btn + '">2 · Coetáneos + Bonomi</button>' +
      '<button type="button" data-paso="3" style="' + btn + '">3 · /conversación ' + NOMBRE[a] + ' vs ' + NOMBRE[b] + '</button>' +
      '<a href="/escena0/?flujo=pan&amp;cabecera=bonomi" style="color:#cbb98a;font-size:12px" title="El mismo relato guionizado, sin depender de los consejeros">plan B sin red</a>' +
      '<span id="demo-consejo-estado" aria-live="polite" style="color:#cbb98a;font-weight:500;max-width:420px"></span>' +
      '<button type="button" data-cerrar style="' + btn + ';padding:4px 8px" aria-label="Cerrar la barra de demo">×</button>';
    bar.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-cerrar')) { bar.remove(); return; }
      var n = t.getAttribute('data-paso'); if (!pasos[n]) return;
      marcar(n); pasos[n]();
    });
    document.body.appendChild(bar);
    aviso('Pulsa 1, 2 y 3');
  }
  root.CouncilDemo = { lib: lib, paso: function (n) { if (pasos[n]) { marcar(n); pasos[n](); } }, a: a, b: b };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(typeof window !== 'undefined' ? window : globalThis);
