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
  function ensureLayer(doc) {
    if (layer && layer.isConnected) return layer;
    var prop = doc.getElementById('mac-hoy-prop');
    if (!prop) return null;
    layer = doc.createElement('div');
    layer.className = 'mac-proyecto';
    layer.id = 'mac-proyecto';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<iframe class="mac-proyecto__frame" title="Proyecto del consejero" loading="eager" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin" tabindex="-1"></iframe><img class="mac-proyecto__shot" alt=""><span class="mac-proyecto__label"></span>';
    var shade = doc.getElementById('mac-hoy-shade');
    prop.insertBefore(layer, shade || null);
    return layer;
  }
  function show(persona, opts) {
    opts = opts || {};
    var doc = root.document, a = alias(persona), my = ++gen;
    var mac = root.MacHoy;
    if (mac && !mac.isVisible()) { mac.setVisible(true); encendidoPorMi = true; }
    var el = ensureLayer(doc);
    if (!el) return Promise.resolve(null);
    var frame = el.querySelector('iframe'), shot = el.querySelector('img'), label = el.querySelector('span');
    el.classList.add('on'); el.dataset.persona = a; el.dataset.modo = 'cargando';
    label.textContent = a + ' · buscando proyecto…';
    doc.body.classList.add('examinar-mac');
    if (mac && mac.fitScreen) { mac.fitScreen(); setTimeout(function () { mac.fitScreen(); }, 60); }
    return proyectoDe(a, opts.fetch).then(function (info) {
      if (my !== gen) return null;
      var url = urlDe(info.proyecto);
      label.textContent = a + ' · ' + info.proyecto;
      el.dataset.proyecto = info.proyecto; el.dataset.fuente = info.fuente;
      var check = (opts.fetch || root.fetch)('/api/council/frameable?url=' + encodeURIComponent(url))
        .then(function (r) { return r.json(); }).catch(function () { return { frameable: true }; });
      return check.then(function (c) {
        if (my !== gen) return null;
        if (c && c.frameable === false) {
          frame.removeAttribute('src'); frame.style.display = 'none';
          shot.src = 'https://image.thum.io/get/width/1280/crop/855/' + url;
          shot.style.display = 'block'; el.dataset.modo = 'captura';
        } else {
          shot.style.display = 'none'; shot.removeAttribute('src');
          frame.style.display = 'block';
          if (frame.getAttribute('src') !== url) frame.src = url;
          el.dataset.modo = 'vivo';
        }
        return { persona: a, proyecto: info.proyecto, url: url, fuente: info.fuente, modo: el.dataset.modo };
      });
    });
  }
  function hide(opts) {
    gen++;
    if (layer) { layer.classList.remove('on'); var f = layer.querySelector('iframe'); if (f) f.removeAttribute('src'); }
    if (root.document) root.document.body.classList.remove('examinar-mac');
    var mac = root.MacHoy;
    if (mac && mac.fitScreen) mac.fitScreen();
    if (mac && mac.clearRemote) mac.clearRemote();
    if (mac && (encendidoPorMi || (opts && opts.apagar)) && mac.isVisible()) mac.setVisible(false);
    encendidoPorMi = false;
  }
  function isOn() { return !!(layer && layer.classList.contains('on')); }
  if (root.document) {
    root.document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOn()) hide(); });
    // Clic fuera: ni en el Mac, ni en un consejero, ni en un verbo/barra → se guarda el Mac.
    root.document.addEventListener('click', function (e) {
      if (!isOn()) return;
      var t = e.target;
      if (t && t.closest && t.closest('#mac-hoy-prop, #mac-hoy-front, .verb-btn, .rail-btn, .np, .body-hotspot, [data-persona], .mac-hoy-btn')) return;
      hide();
    }, true);
  }
  root.MacProyecto = { show: show, hide: hide, isOn: isOn, urlDe: urlDe, proyectoDe: proyectoDe, PROYECTO_URL: PROYECTO_URL, DEFECTO_SILLA: DEFECTO_SILLA, W: W, H: H };
})(typeof window !== 'undefined' ? window : globalThis);
