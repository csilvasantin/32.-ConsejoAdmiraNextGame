/* assets/experto-dock.js — el ⌘ EXPERTO · CLI se puede redimensionar siempre (r33 · Jensen Huang · Carlos 11-10-2026 13:35).
 * Se engancha a CUALQUIER dock del modo experto de la suite (section.ax-dock / .ax-experto con .ax-own-body) en las
 * páginas de admira.live que lo carguen, sin tocar www.admiranext.com/suite/experto.js:
 *   · asa de arriba (≡): arrastrar arriba/abajo cambia el alto de todo el dock (mín 120 px, máx 85 % de la ventana) a través
 *     de la variable que la suite ya ofrece para eso, --ax-dock-h (minimizado sigue en una línea);
 *   · separador vertical entre la ficha del motor (izquierda) y el registro del CLI: arrastrar cambia el ancho de
 *     la ficha (mín 120 px, máx 70 % del panel);
 *   · doble clic (o doble toque) en cualquiera de los dos vuelve al tamaño de serie; Intro/flechas con el foco también.
 * Ratón y dedo (Pointer Events + touch-action:none). Se guarda en localStorage «ax-dock-alto» y «ax-dock-motor».
 */
(function (root) {
  'use strict';
  if (root.__axDockResize || typeof document === 'undefined') return;
  root.__axDockResize = true;
  var K_ALTO = 'ax-dock-alto', K_MOTOR = 'ax-dock-motor';
  var MIN_ALTO = 120, MAX_ALTO_F = 0.85, MIN_MOTOR = 120, MAX_MOTOR_F = 0.7;
  function lee(k) { try { var v = parseInt(localStorage.getItem(k), 10); return isFinite(v) ? v : null; } catch (e) { return null; } }
  function guarda(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(Math.round(v))); } catch (e) {} }
  /** Límite puro (lo prueba experto-dock.test.mjs). */
  function limita(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function css() {
    if (document.getElementById('ax-dock-rs-css')) return;
    var st = document.createElement('style');
    st.id = 'ax-dock-rs-css';
    st.textContent =
      '.ax-rs-alto{position:absolute;left:50%;top:1px;transform:translateX(-50%);width:84px;height:14px;z-index:5;cursor:ns-resize;touch-action:none;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);border:1px solid currentColor;border-radius:7px;opacity:.75;color:inherit;padding:0}' +
      '.ax-rs-alto:hover,.ax-rs-alto:focus-visible,.ax-rs-alto.on{opacity:1}' +
      '.ax-rs-alto::before{content:"";width:40px;height:2px;border-top:2px solid currentColor;border-bottom:2px solid currentColor;padding-top:2px}' +
      '.ax-rs-split{flex:0 0 10px;align-self:stretch;cursor:ew-resize;touch-action:none;position:relative;margin:0 2px;background:transparent;border:0;padding:0;color:inherit}' +
      '.ax-rs-split::before{content:"";position:absolute;top:10%;bottom:10%;left:4px;width:2px;background:currentColor;opacity:.35;border-radius:1px}' +
      '.ax-rs-split:hover::before,.ax-rs-split:focus-visible::before,.ax-rs-split.on::before{opacity:.9}' +
      '.ax-dock.ax-min .ax-rs-alto,.ax-dock.ax-min .ax-rs-split{display:none!important}' +
      '@media (pointer:coarse){.ax-rs-alto{height:22px;width:110px}.ax-rs-split{flex-basis:18px}.ax-rs-split::before{left:8px}}' +
      '.ax-dock.ax-rs-arrastre,.ax-dock.ax-rs-arrastre *{user-select:none!important}';
    document.head.appendChild(st);
  }

  function arrastre(el, dock, alMover, alSoltar) {
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('on'); dock.classList.add('ax-rs-arrastre');
      var mover = function (ev) { alMover(ev); };
      var fin = function () {
        el.classList.remove('on'); dock.classList.remove('ax-rs-arrastre');
        el.removeEventListener('pointermove', mover); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin);
        alSoltar();
      };
      el.addEventListener('pointermove', mover); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
    });
    // doble toque en táctil (dblclick no siempre llega)
    var ultimo = 0;
    el.addEventListener('pointerup', function (e) { if (e.pointerType !== 'touch') return; var t = Date.now(); if (t - ultimo < 320) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); ultimo = t; });
  }

  function enganchar(dock) {
    var body = dock.querySelector('.ax-own-body, .ax-body');
    if (!body || dock.classList.contains('ax-rs-arrastre')) return;
    if (body.dataset.axRs === '1' && dock.querySelector(':scope > .ax-rs-alto') && (!body.querySelector(':scope > .ax-engine-slot') || body.querySelector(':scope > .ax-rs-split'))) return;
    var primera = body.dataset.axRs !== '1';
    body.dataset.axRs = '1';
    css();
    if (getComputedStyle(dock).position === 'static') dock.style.position = 'relative';
    // ── alto ──
    var asa = dock.querySelector(':scope > .ax-rs-alto');
    if (!asa) {
      asa = document.createElement('button');
      asa.type = 'button'; asa.className = 'ax-rs-alto';
      asa.title = 'Arrastra para cambiar el alto · doble clic: tamaño de serie';
      asa.setAttribute('aria-label', 'Alto del modo experto'); asa.setAttribute('data-en-aria-label', 'Expert mode height');
      dock.appendChild(asa);
      var y0 = 0, h0 = 0;
      asa.addEventListener('pointerdown', function (e) { y0 = e.clientY; h0 = dock.getBoundingClientRect().height; }, true);
      arrastre(asa, dock, function (e) {
        var h = limita(h0 + (y0 - e.clientY), MIN_ALTO, Math.round(innerHeight * MAX_ALTO_F));
        ponerAlto(dock, h);
      }, function () { guarda(K_ALTO, dock.getBoundingClientRect().height); avisar(); });
      asa.addEventListener('dblclick', function () { ponerAlto(dock, null); guarda(K_ALTO, null); avisar(); });
      asa.addEventListener('keydown', function (e) {
        var h = dock.getBoundingClientRect().height;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); h = limita(h + (e.key === 'ArrowUp' ? 24 : -24), MIN_ALTO, Math.round(innerHeight * MAX_ALTO_F)); ponerAlto(dock, h); guarda(K_ALTO, h); avisar(); }
        if (e.key === 'Enter') { ponerAlto(dock, null); guarda(K_ALTO, null); avisar(); }
      });
    }
    var hg = primera ? lee(K_ALTO) : null; if (hg) ponerAlto(dock, limita(hg, MIN_ALTO, Math.round(innerHeight * MAX_ALTO_F)));
    // ── ancho de la ficha del motor ──
    var motor = body.querySelector(':scope > .ax-engine-slot'), cli = body.querySelector(':scope > .ax-cli, :scope > .ax-own-cli');
    if (motor && cli && !body.querySelector(':scope > .ax-rs-split')) {
      var sp = document.createElement('button');
      sp.type = 'button'; sp.className = 'ax-rs-split';
      sp.title = 'Arrastra para repartir ficha y registro · doble clic: reparto de serie';
      sp.setAttribute('aria-label', 'Reparto ficha / registro'); sp.setAttribute('data-en-aria-label', 'Engine card / log split');
      body.insertBefore(sp, cli);
      var x0 = 0, w0 = 0;
      sp.addEventListener('pointerdown', function (e) { x0 = e.clientX; w0 = motor.getBoundingClientRect().width; }, true);
      arrastre(sp, dock, function (e) {
        ponerMotor(motor, limita(w0 + (e.clientX - x0), MIN_MOTOR, Math.round(body.getBoundingClientRect().width * MAX_MOTOR_F)));
      }, function () { guarda(K_MOTOR, motor.getBoundingClientRect().width); });
      sp.addEventListener('dblclick', function () { ponerMotor(motor, null); guarda(K_MOTOR, null); });
      sp.addEventListener('keydown', function (e) {
        var w = motor.getBoundingClientRect().width;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); w = limita(w + (e.key === 'ArrowRight' ? 24 : -24), MIN_MOTOR, Math.round(body.getBoundingClientRect().width * MAX_MOTOR_F)); ponerMotor(motor, w); guarda(K_MOTOR, w); }
        if (e.key === 'Enter') { ponerMotor(motor, null); guarda(K_MOTOR, null); }
      });
    }
    var wg = primera ? lee(K_MOTOR) : null; if (motor && wg) ponerMotor(motor, limita(wg, MIN_MOTOR, Math.max(MIN_MOTOR, Math.round(body.getBoundingClientRect().width * MAX_MOTOR_F) || wg)));
  }
  function ponerAlto(dock, h) {
    if (h == null) dock.style.removeProperty('--ax-dock-h'); else dock.style.setProperty('--ax-dock-h', h + 'px');
  }
  function ponerMotor(motor, w) {
    if (w == null) { motor.style.removeProperty('flex'); motor.style.removeProperty('width'); motor.style.removeProperty('max-width'); return; }
    motor.style.flex = '0 0 ' + w + 'px'; motor.style.width = w + 'px'; motor.style.maxWidth = w + 'px';
  }
  // el espacio reservado abajo (div.ax-dock-spacer / --ax-dock-pad) sigue al nuevo alto
  function avisar() { try { root.dispatchEvent(new Event('resize')); } catch (e) {} }

  function buscar() { [].forEach.call(document.querySelectorAll('.ax-dock, section.ax-experto'), enganchar); }
  function arrancar() {
    buscar();
    // la suite monta el dock tarde y lo repinta: se vuelve a enganchar si falta algo
    var mo = new MutationObserver(function () { clearTimeout(arrancar.t); arrancar.t = setTimeout(buscar, 120); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  root.AdmiraDockResize = { limita: limita, enganchar: enganchar, reset: function () { guarda(K_ALTO, null); guarda(K_MOTOR, null); [].forEach.call(document.querySelectorAll('.ax-own-body, .ax-body'), function (b) { var m = b.querySelector('.ax-engine-slot'); if (m) ponerMotor(m, null); }); [].forEach.call(document.querySelectorAll('.ax-dock'), function (d) { ponerAlto(d, null); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})(typeof window !== 'undefined' ? window : globalThis);
