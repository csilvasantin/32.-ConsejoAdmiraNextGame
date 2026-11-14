/* Cabecera de la mesa de Coetáneos (Lucas, 14-nov-2026, pedido de Carlos).
 * Un invitado se sienta al fondo, al centro, de la mesa de Coetáneos como un consejero más (dibujo
 * con el look de la mesa, silla azul) y con su placa dorada delante, como las de los consejeros. Sin cargo: solo nombre y retrato.
 *   /cabecera bonomi · /cabecera Carlo Bonomi · /cabecera off · /cabecera (alterna)
 *   ?cabecera=bonomi en la URL (la deja puesta) · ?cabecera=off la quita.
 * Estado en localStorage (admira:consejo-cabecera). Misma ficha y posición que escena0-guion.mjs. */
(function (root) {
  'use strict';
  var KEY = 'admira:consejo-cabecera';
  var CABECERAS = {
    'carlo-bonomi': { id: 'carlo-bonomi', nombre: 'Carlo Bonomi', foto: '/assets/cabecera/carlo-bonomi-sentado.webp?v=20261114-cartoon', alias: ['bonomi', 'carlo', 'carlo bonomi', 'carlo-bonomi', 'carlobonomi'] }
  };
  var POS = { mesa: 'coetaneos', x: 43.125, y: 36.944, w: 13.672, h: 28.056 };
  var DEFECTO = 'carlo-bonomi';

  function plano(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' '); }
  function apagar(n) { return ['off', 'no', 'ninguno', 'nadie', 'vacia', 'vacio', '0', 'false', 'quitar'].indexOf(n) >= 0; }
  function buscar(nombre) {
    var n = plano(nombre); if (!n) return null;
    for (var k in CABECERAS) {
      var c = CABECERAS[k];
      if (plano(c.nombre) === n || c.id === n || c.alias.indexOf(n) >= 0) return c;
    }
    return null;
  }

  // «/cabecera …» → null si no es suyo; si no {ok, gen, id, msg}. estado: {get():id|null, set(id|null)}
  function comando(texto, estado) {
    var m = String(texto || '').trim().match(/^\/(cabecera|cabeza|head)(?:\s+(.+))?$/i);
    if (!m) return null;
    var arg = plano(m[2] || '');
    if (!arg) {
      var nuevo = estado.get() ? null : DEFECTO;
      estado.set(nuevo);
      return { ok: true, gen: 'coetaneos', id: nuevo, msg: nuevo ? '🪑 ' + CABECERAS[nuevo].nombre + ' en la cabecera de los Coetáneos' : '🪑 Cabecera de los Coetáneos vacía' };
    }
    if (apagar(arg)) { estado.set(null); return { ok: true, gen: 'coetaneos', id: null, msg: '🪑 Cabecera de los Coetáneos vacía' }; }
    var c = buscar(arg);
    if (!c) return { ok: false, gen: null, id: estado.get(), msg: '⚠️ No tengo retrato de «' + m[2].trim() + '» — /cabecera bonomi · /cabecera off' };
    estado.set(c.id);
    return { ok: true, gen: 'coetaneos', id: c.id, msg: '🪑 ' + c.nombre + ' en la cabecera de los Coetáneos' };
  }

  function crearEstado(storage) {
    var id = null;
    try { var raw = storage && storage.getItem(KEY); if (raw && CABECERAS[raw]) id = raw; } catch (e) {}
    return {
      get: function () { return id; },
      set: function (v) { id = v && CABECERAS[v] ? v : null; try { if (storage) { if (id) storage.setItem(KEY, id); else storage.removeItem(KEY); } } catch (e) {} }
    };
  }

  var lib = { KEY: KEY, CABECERAS: CABECERAS, POS: POS, plano: plano, buscar: buscar, comando: comando, crearEstado: crearEstado };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document === 'undefined') { root.CouncilCabeceraLib = lib; return; }

  // ── DOM ────────────────────────────────────────────────────────────
  var estado = crearEstado(root.localStorage);
  try {
    var q = new URLSearchParams(root.location.search).get('cabecera');
    if (q != null) { var c0 = buscar(q); estado.set(c0 ? c0.id : null); }
  } catch (e) {}
  var genVista = null;

  function capa() {
    var box = document.querySelector('.council-image'); if (!box) return null;
    var el = document.getElementById('cabecera-layer');
    if (!el) {
      el = document.createElement('div'); el.id = 'cabecera-layer';
      el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;display:none';
      box.appendChild(el);
    }
    return el;
  }
  function pintar(gen) {
    genVista = gen;
    var el = capa(); if (!el) return;
    var c = estado.get() && CABECERAS[estado.get()];
    document.documentElement.toggleAttribute('data-cabecera', !!(c && gen === POS.mesa));
    if (!c || gen !== POS.mesa) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.innerHTML =
      '<img alt="' + c.nombre + ' en la cabecera" data-cabecera="' + c.id + '" src="' + c.foto + '" style="position:absolute;left:' + POS.x + '%;top:' + POS.y + '%;width:' + POS.w + '%;height:' + POS.h + '%;image-rendering:auto">' +
      '<span class="cabecera-placa" style="position:absolute;left:' + (POS.x + POS.w / 2) + '%;top:' + (POS.y + POS.h + 3) + '%;transform:translateX(-50%);white-space:nowrap;padding:.25em .7em;font:700 clamp(8px,1.05vw,15px)/1.1 Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#3a2405;background:linear-gradient(#ffe58a,#c9a227 55%,#9c7414);border:1px solid #5a3d08;border-radius:3px;box-shadow:0 2px 0 rgba(0,0,0,.6)">' + c.nombre + '</span>';
    el.style.display = 'block';
  }
  root.CouncilCabecera = {
    lib: lib, estado: estado,
    sync: function (gen) { pintar(gen); },
    actual: function () { var id = estado.get(); return id ? CABECERAS[id] : null; },
    comando: function (texto) { var r = comando(texto, estado); return r; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
