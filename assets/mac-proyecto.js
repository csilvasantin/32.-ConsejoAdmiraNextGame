/* EXAMINAR → Mac 1984 con el PROYECTO del consejero en el monitor (Carlos, 24-10-2026 15:52).
 * «si Steve Jobs está con admira.live, en el monitor del Mac 1984 aparece el site».
 * Fuente del proyecto, de más a menos fiable:
 *   1) /api/flota/trabajando → tarjetas[].foco.proyecto (foco fijado por el consejero en
 *      /api/consejo/foco, o el proyecto de su latido). «Training» no cuenta.
 *   2) DEFECTO_SILLA (estático). TODO: sustituir cuando todos los consejeros publiquen foco.
 * El site va EN VIVO en un iframe escalado al plano 512×342 del CRT; si el site prohíbe
 * enmarcarse (/api/council/frameable), cae a una captura (image.thum.io). */
(function (root) {
  'use strict';
  var PROYECTO_URL = {
    'admira.live': 'https://www.admira.live/',
    'admira.tv': 'https://admira.tv/',
    'admira.studio': 'https://admira.studio/',
    'admira.store': 'https://admira.store/',
    'admira.app': 'https://admira.app/',
    'admira.biz': 'https://admira.biz/',
    'admiranext.com': 'https://www.admiranext.com/',
    'yokup.com': 'https://yokup.com/',
    'yokup': 'https://yokup.com/',
    'pixeria': 'https://pixeria.es/',
    'pixeria.es': 'https://pixeria.es/'
  };
  // TODO(foco): mapa estático mientras los consejeros no publiquen su foco en /api/consejo/foco.
  var DEFECTO_SILLA = { Jobs: 'admira.live', Wozniak: 'admiranext.com', Lucas: 'admira.tv', Disney: 'admira.studio', Musk: 'admiranext.com', Huang: 'admira.live' };
  var W = 1280, H = 855;            // viewport «de escritorio» que se encoge a 512×342 (×0,4)
  var gen = 0, encendidoPorMi = false, layer = null;

  function alias(p) { return (root.MacHoy && root.MacHoy.chairAlias && root.MacHoy.chairAlias(p)) || String(p || '').trim().split(/\s+/).pop(); }
  function urlDe(proyecto) {
    var k = String(proyecto || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    return PROYECTO_URL[k] || (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(k) ? 'https://' + k + '/' : null);
  }
  function proyectoDe(a, fetchImpl) {
    var f = fetchImpl || root.fetch;
    var def = { proyecto: DEFECTO_SILLA[a] || 'admira.live', fuente: 'mapa estático' };
    if (!f) return Promise.resolve(def);
    return Promise.resolve(f('/api/flota/trabajando', { cache: 'no-store' }))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var t = (d.tarjetas || []).find(function (x) { return x && x.consejero && x.agente === a; });
        var p = t && ((t.foco && t.foco.proyecto) || t.proyecto);
        if (p && p !== 'Training' && p !== 'otros' && urlDe(p)) return { proyecto: p, fuente: (t.foco && t.foco.fuente) || 'latido' };
        return def;
      })
      .catch(function () { return def; });
  }
  // Una capa por superficie: el Mac de la mesa (#mac-hoy-prop) y CADA vista frontal ampliada
  // (.mac-hoy-front-stage: la grande con CERRAR y la pequeña de Previos). Antes solo existía la
  // de la mesa y la ampliada seguía enseñando el mosaico de los 6 (Carlos, 24-10 16:49).
  var layers = [];
  function makeLayer(doc, host, front) {
    var el = doc.createElement('div');
    el.className = 'mac-proyecto' + (front ? ' mac-proyecto--front' : '');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');   // el iframe nunca roba el foco (Esc tiene que llegar a la escena)
    el.innerHTML = '<iframe class="mac-proyecto__frame" title="Proyecto del consejero" loading="eager" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin" tabindex="-1"></iframe><img class="mac-proyecto__shot" alt=""><span class="mac-proyecto__label"></span>';
    var before = front ? host.querySelector('.mac-hoy-front-shade') : doc.getElementById('mac-hoy-shade');
    host.insertBefore(el, before || null);
    return el;
  }
  function ensureLayers(doc) {
    layers = layers.filter(function (l) { return l.isConnected; });
    var prop = doc.getElementById('mac-hoy-prop');
    if (prop && !prop.querySelector(':scope > .mac-proyecto')) layers.push(makeLayer(doc, prop, false));
    doc.querySelectorAll('.mac-hoy-front-stage').forEach(function (st) {
      if (!st.querySelector(':scope > .mac-proyecto')) layers.push(makeLayer(doc, st, true));
    });
    layer = layers[0] || null;
    return layers;
  }
  function each(fn) { layers.forEach(function (el) { fn(el, el.querySelector('iframe'), el.querySelector('img'), el.querySelector('span')); }); }
  function show(persona, opts) {
    opts = opts || {};
    var doc = root.document, a = alias(persona), my = ++gen;
    var mac = root.MacHoy;
    if (mac && !mac.isVisible()) { mac.setVisible(true); encendidoPorMi = true; }
    if (!ensureLayers(doc).length) return Promise.resolve(null);
    each(function (el, frame, shot, label) {
      el.classList.add('on'); el.dataset.persona = a; el.dataset.modo = 'cargando';
      label.textContent = a + ' · buscando proyecto…';
    });
    doc.body.classList.add('examinar-mac');
    if (mac && mac.fitScreen) { mac.fitScreen(); setTimeout(function () { mac.fitScreen(); }, 60); }
    return proyectoDe(a, opts.fetch).then(function (info) {
      if (my !== gen) return null;
      var url = urlDe(info.proyecto);
      var check = (opts.fetch || root.fetch)('/api/council/frameable?url=' + encodeURIComponent(url))
        .then(function (r) { return r.json(); }).catch(function () { return { frameable: true }; });
      return check.then(function (c) {
        if (my !== gen) return null;
        var captura = c && c.frameable === false;
        each(function (el, frame, shot, label) {
          label.textContent = a + ' · ' + info.proyecto;
          el.dataset.proyecto = info.proyecto; el.dataset.fuente = info.fuente;
          if (captura) {
            frame.removeAttribute('src'); frame.style.display = 'none';
            shot.src = 'https://image.thum.io/get/width/1280/crop/855/' + url;
            shot.style.display = 'block'; el.dataset.modo = 'captura';
          } else {
            shot.style.display = 'none'; shot.removeAttribute('src');
            frame.style.display = 'block';
            if (frame.getAttribute('src') !== url) { frame.onload = function () { setTimeout(devuelveFoco, 50); setTimeout(devuelveFoco, 1500); }; frame.src = url; }
            el.dataset.modo = 'vivo';
          }
        });
        return { persona: a, proyecto: info.proyecto, url: url, fuente: info.fuente, modo: captura ? 'captura' : 'vivo' };
      });
    });
  }
  // Consejero seleccionado en la escena (placa o cuerpo marcados), o null.
  function seleccionado() {
    var d = root.document;
    var el = d && d.querySelector('.np.selected[data-persona], .body-hotspot.selected[data-persona]');
    return el ? el.getAttribute('data-persona') : null;
  }
  // Verbo MAC 1984: con consejero elegido, su proyecto en el Mac (y la vista ampliada); sin nadie, lo de siempre.
  function verboMac() {
    var p = seleccionado(), mac = root.MacHoy;
    if (!p) { if (isOn()) hide(); if (mac) mac.toggle(); return; }
    if (isOn() && layer && layer.dataset.persona === alias(p)) { hide({ apagar: true }); return; }
    if (mac && mac.showRemote) mac.showRemote(p);
    show(p);
  }
  function hide(opts) {
    gen++;
    each(function (el, f) { el.classList.remove('on'); if (f) f.removeAttribute('src'); });
    if (root.document) root.document.body.classList.remove('examinar-mac');
    var mac = root.MacHoy;
    if (mac && mac.fitScreen) mac.fitScreen();
    if (mac && mac.clearRemote) mac.clearRemote();
    if (mac && (encendidoPorMi || (opts && opts.apagar)) && mac.isVisible()) mac.setVisible(false);
    encendidoPorMi = false;
  }
  // Algunos sites hacen autofocus y el iframe se queda el teclado: lo devolvemos a la escena.
  function devuelveFoco() {
    var d = root.document, f = d && d.activeElement;
    if (isOn() && f && f.classList && f.classList.contains('mac-proyecto__frame')) { try { f.blur(); } catch (e) {} try { root.focus(); } catch (e) {} if (d.body) { d.body.tabIndex = -1; d.body.focus({ preventScroll: true }); } }
  }
  if (root.addEventListener) root.addEventListener('blur', function () { setTimeout(devuelveFoco, 0); });
  function isOn() { return !!(layer && layer.classList.contains('on')); }
  if (root.document) {
    root.document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOn()) hide(); }, true);
    // Clic fuera: ni en el Mac, ni en un consejero, ni en un verbo/barra → se guarda el Mac.
    root.document.addEventListener('click', function (e) {
      if (!isOn()) return;
      var t = e.target;
      if (t && t.closest && t.closest('#mac-hoy-prop, #mac-hoy-front, .verb-btn, .rail-btn, .np, .body-hotspot, [data-persona], .mac-hoy-btn')) return;
      hide();
    }, true);
  }
  root.MacProyecto = { show: show, hide: hide, verboMac: verboMac, seleccionado: seleccionado, isOn: isOn, urlDe: urlDe, proyectoDe: proyectoDe, PROYECTO_URL: PROYECTO_URL, DEFECTO_SILLA: DEFECTO_SILLA, W: W, H: H };
})(typeof window !== 'undefined' ? window : globalThis);
