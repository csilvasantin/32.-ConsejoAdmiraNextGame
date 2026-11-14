/* Cabecera de la mesa de Coetáneos (Lucas, 14-nov-2026, pedido de Carlos).
 * Un invitado se sienta al fondo, al centro, de la mesa de Coetáneos como un consejero más (dibujo
 * con el look de la mesa, silla azul) y con su placa dorada delante, como las de los consejeros. Sin cargo: solo nombre y retrato.
 *   /cabecera bonomi · /cabecera Carlo Bonomi · /cabecera off · /cabecera (alterna)
 *   ?cabecera=bonomi en la URL (la deja puesta) · ?cabecera=off la quita.
 * Estado en localStorage (admira:consejo-cabecera). Misma ficha y posición que escena0-guion.mjs.
 * Cartelas (Carlos 23:39): por defecto la mesa va SIN placas y cada consejero tiene su objeto en el sitio de su
 * cartela (Model X, DGX, portátil; Bonomi, la maqueta de Ferrari Land). «/consejeros placas» alterna: con placas
 * (arte council-coetaneos-placas.jpg + placa HTML de la cabecera) los objetos desaparecen. Estado en
 * localStorage (admira:coetaneos-placas = '1' si se ven); ?placas=on|off en la URL. */
(function (root) {
  'use strict';
  var KEY = 'admira:consejo-cabecera';
  var CABECERAS = {
    'carlo-bonomi': { id: 'carlo-bonomi', nombre: 'Carlo Bonomi', foto: '/assets/cabecera/carlo-bonomi-sentado.webp?v=20261114-mesa4', alias: ['bonomi', 'carlo', 'carlo bonomi', 'carlo-bonomi', 'carlobonomi'],
      // Maqueta de Ferrari Land (PortAventura) en el sitio de su placa, cuando las placas están ocultas. % del arte 1280×720.
      objeto: { foto: '/assets/cabecera/carlo-bonomi-ferrariland.webp?v=20261114-mesa4', alt: 'Maqueta de Ferrari Land', cx: 53.125, y: 51.61, h: 10.4167 } }
  };
  var KEY_PLACAS = 'admira:coetaneos-placas';
  // Arte de la mesa de Coetáneos: sin placas (por defecto, con los objetos) o con placas (sin objetos).
  var ARTE = { defecto: 'assets/council-coetaneos.jpg', placas: 'assets/council-coetaneos-placas.jpg' };
  // Carlos 21:33: Bonomi un 10 % más grande y más al fondo, tras el borde lejano de la mesa (y=57.57 %); corte = % inferior oculto por la mesa.
  var POS = { mesa: 'coetaneos', x: 44.37, y: 33.24, w: 13.86, h: 28.294, corte: 14 };
  // Demo (?demo=pan, data-demo-pan en <html>): el neón de la mesa dice «PortAventuraNeXT». Igual que LOGO_DEMO de escena0-guion.mjs.
  var LOGO = { mesa: 'coetaneos', foto: '/assets/demo/logo-portaventuranext.webp?v=20261114-mesa4', x: 36.5625, y: 74.1667, w: 26.4062, h: 13.3333 };
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

  // «/consejeros placas [on|off]» → null si no es suyo; si no {ok, visibles, msg}. est: {get():bool, set(bool)}
  function comandoPlacas(texto, est) {
    var m = String(texto || '').trim().match(/^\/(?:consejeros?|advisors?|councill?ors?)\s+(?:placas?|cartelas?|plates?|nameplates?)(?:\s+(\S+))?\s*$/i);
    if (!m) return null;
    var arg = plano(m[1] || ''), v;
    if (!arg || arg === 'toggle' || arg === 'alternar') v = !est.get();
    else if (['on', 'si', 'ver', 'mostrar', 'show', '1', 'true'].indexOf(arg) >= 0) v = true;
    else if (apagar(arg) || ['ocultar', 'hide'].indexOf(arg) >= 0) v = false;
    else return { ok: false, visibles: est.get(), msg: '⚠️ Uso: /consejeros placas (alterna) · /consejeros placas on · off' };
    est.set(v);
    return { ok: true, visibles: v, msg: v ? '🪧 Placas de los Coetáneos visibles (sin objetos) · /consejeros placas las oculta'
                                         : '🚗 Placas ocultas: cada consejero con su objeto en la mesa · /consejeros placas las enseña' };
  }
  function crearEstadoPlacas(storage) {
    var v = false;
    try { v = !!(storage && storage.getItem(KEY_PLACAS) === '1'); } catch (e) {}
    return {
      get: function () { return v; },
      set: function (x) { v = !!x; try { if (storage) { if (v) storage.setItem(KEY_PLACAS, '1'); else storage.removeItem(KEY_PLACAS); } } catch (e) {} }
    };
  }
  function arte(visibles, ver) { return (visibles ? ARTE.placas : ARTE.defecto) + (ver ? '?v=' + ver : ''); }

  function crearEstado(storage) {
    var id = null;
    try { var raw = storage && storage.getItem(KEY); if (raw && CABECERAS[raw]) id = raw; } catch (e) {}
    return {
      get: function () { return id; },
      set: function (v) { id = v && CABECERAS[v] ? v : null; try { if (storage) { if (id) storage.setItem(KEY, id); else storage.removeItem(KEY); } } catch (e) {} }
    };
  }

  var lib = { KEY: KEY, KEY_PLACAS: KEY_PLACAS, CABECERAS: CABECERAS, POS: POS, LOGO: LOGO, ARTE: ARTE, plano: plano, buscar: buscar, comando: comando, crearEstado: crearEstado,
    comandoPlacas: comandoPlacas, crearEstadoPlacas: crearEstadoPlacas, arte: arte };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document === 'undefined') { root.CouncilCabeceraLib = lib; return; }

  // ── DOM ────────────────────────────────────────────────────────────
  var estado = crearEstado(root.localStorage);
  try {
    var q = new URLSearchParams(root.location.search).get('cabecera');
    if (q != null) { var c0 = buscar(q); estado.set(c0 ? c0.id : null); }
  } catch (e) {}
  var placas = crearEstadoPlacas(root.localStorage);
  try {
    var qp = new URLSearchParams(root.location.search).get('placas');
    if (qp != null) placas.set(['on', '1', 'si', 'true'].indexOf(plano(qp)) >= 0);
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
  function pintarLogo(gen) {
    var box = document.querySelector('.council-image'); if (!box) return;
    var el = document.getElementById('demo-logo-layer');
    var on = gen === LOGO.mesa && document.documentElement.hasAttribute('data-demo-pan');
    if (!on) { if (el) ocultar(el); return; }
    if (!el) {
      el = document.createElement('img'); el.id = 'demo-logo-layer'; el.alt = 'PortAventuraNeXT'; el.src = LOGO.foto;
      el.style.cssText = 'position:absolute;left:' + LOGO.x + '%;top:' + LOGO.y + '%;width:' + LOGO.w + '%;height:' + LOGO.h + '%;pointer-events:none;z-index:2';
      box.appendChild(el);
    }
    alMostrar(el, gen);
  }
  // Carlos 21:50: al pasar de Leyendas a Coetáneos, Bonomi (y el neón de demo) salían antes que la mesa.
  // Las capas esperan a que #council-img tenga el arte de su mesa cargado y visible, y entran con el mismo fundido (.4s).
  var FUNDIDO = 'opacity .4s ease';
  var ARTE_V = '20261114-mesa4'; // = COUNCIL_IMAGE_VERSION de app.flt-100529.js / app.js
  function mesaLista(gen) {
    var img = document.getElementById('council-img');
    if (!img) return true;
    var src = img.getAttribute('src') || '';
    return src.indexOf('council-' + gen) >= 0 && img.complete && img.naturalWidth > 0 && img.style.opacity !== '0';
  }
  // Entra en el mismo instante que el arte: si la mesa está fundiendo (opacity < 1), con su mismo fundido; si ya está, de golpe.
  function entrar(el) {
    var img = document.getElementById('council-img');
    var op = img ? parseFloat(getComputedStyle(img).opacity) : 1;
    el.style.transition = op < 0.99 ? FUNDIDO : 'none';
    el.style.opacity = '1';
  }
  function alMostrar(el, gen) {
    el.style.display = 'block';
    if (mesaLista(gen)) { if (el.style.opacity !== '1') entrar(el); return; }
    el.style.transition = 'none'; el.style.opacity = '0';
    var img = document.getElementById('council-img'), t0 = Date.now(), obs = null, hecho = false;
    function mirar() {
      if (hecho) return;
      if (genVista !== gen) { fin(); return; }
      if (mesaLista(gen) || Date.now() - t0 > 8000) { fin(); entrar(el); }
    }
    function fin() { hecho = true; if (obs) obs.disconnect(); if (img) img.removeEventListener('load', mirar); }
    if (img && root.MutationObserver) { obs = new MutationObserver(mirar); obs.observe(img, { attributes: true, attributeFilter: ['src', 'style'] }); }
    if (img) img.addEventListener('load', mirar);
    (function sondeo() { if (hecho) return; mirar(); if (!hecho) setTimeout(sondeo, 30); })();
  }
  // Al salir de los Coetáneos el arte cambia de golpe: la capa se va en el mismo instante (no queda flotando sobre Leyendas).
  function ocultar(el) { el.style.transition = 'none'; el.style.opacity = '0'; el.style.display = 'none'; }
  function pintar(gen) {
    genVista = gen;
    pintarLogo(gen);
    var el = capa(); if (!el) return;
    var c = estado.get() && CABECERAS[estado.get()];
    document.documentElement.toggleAttribute('data-cabecera', !!(c && gen === POS.mesa));
    if (!c) { el.style.display = 'none'; el.style.opacity = '0'; el.innerHTML = ''; el.removeAttribute('data-id'); return; }
    if (gen !== POS.mesa) { ocultar(el); return; }
    if (el.getAttribute('data-id') !== c.id) {
    el.setAttribute('data-id', c.id);
    var ob = c.objeto;
    el.innerHTML =
      '<img alt="' + c.nombre + ' en la cabecera" data-cabecera="' + c.id + '" src="' + c.foto + '" style="position:absolute;left:' + POS.x + '%;top:' + POS.y + '%;width:' + POS.w + '%;height:' + POS.h + '%;image-rendering:auto;clip-path:inset(0 0 ' + (POS.corte || 0) + '% 0)">' +
      (ob ? '<img class="cabecera-objeto" alt="' + ob.alt + '" src="' + ob.foto + '" style="position:absolute;left:' + ob.cx + '%;top:' + ob.y + '%;height:' + ob.h + '%;width:auto;transform:translateX(-50%)">' : '') +
      '<span class="cabecera-placa" style="position:absolute;left:' + (POS.x + POS.w / 2) + '%;top:' + (POS.y + POS.h * (1 - (POS.corte || 0) / 100) + 0.8) + '%;transform:translateX(-50%);white-space:nowrap;padding:.25em .7em;font:700 clamp(8px,1.05vw,15px)/1.1 Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#3a2405;background:linear-gradient(#ffe58a,#c9a227 55%,#9c7414);border:1px solid #5a3d08;border-radius:3px;box-shadow:0 2px 0 rgba(0,0,0,.6)">' + c.nombre + '</span>';
    }
    var vis = placas.get();
    var pl = el.querySelector('.cabecera-placa'); if (pl) pl.style.display = vis ? '' : 'none';
    var obj = el.querySelector('.cabecera-objeto'); if (obj) obj.style.display = vis ? 'none' : '';
    alMostrar(el, gen);
  }
  // Cambia el arte de la mesa en pantalla (si se ven los Coetáneos) sin parpadeo: precarga y cambia de golpe.
  function aplicarArte() {
    var img = document.getElementById('council-img'); if (!img) return;
    var src = img.getAttribute('src') || '';
    if (src.indexOf('council-coetaneos') < 0) return;
    var nuevo = arte(placas.get(), ARTE_V);
    if (src === nuevo) return;
    var p = new Image();
    p.onload = function () { if ((img.getAttribute('src') || '').indexOf('council-coetaneos') >= 0) img.src = nuevo; };
    p.src = nuevo;
  }
  // Precarga: los dos artes de mesa y los retratos de cabecera, para que el cambio de mesa no espere a la red.
  function precargar() {
    ['assets/council-leyendas.jpg', ARTE.defecto, ARTE.placas].forEach(function (u) { var i = new Image(); i.src = u + '?v=' + ARTE_V; });
    Object.keys(CABECERAS).forEach(function (k) { var i = new Image(); i.src = CABECERAS[k].foto; if (CABECERAS[k].objeto) { var j = new Image(); j.src = CABECERAS[k].objeto.foto; } });
  }
  try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', precargar); else precargar(); } catch (e) {}
  root.CouncilCabecera = {
    lib: lib, estado: estado,
    sync: function (gen) { pintar(gen); },
    actual: function () { var id = estado.get(); return id ? CABECERAS[id] : null; },
    comando: function (texto) { var r = comando(texto, estado); return r; },
    // Placas de los Coetáneos (por defecto ocultas): estado, arte que toca y el comando «/consejeros placas».
    placasVisibles: function () { return placas.get(); },
    arteCoetaneos: function () { return arte(placas.get(), ARTE_V); },
    comandoPlacas: function (texto) {
      var r = comandoPlacas(texto, placas); if (!r) return null;
      if (r.ok) { aplicarArte(); pintar(genVista || 'coetaneos'); }
      return r;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
