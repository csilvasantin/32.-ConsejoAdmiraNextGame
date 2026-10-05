/* Sello de versión con popover SCUMM de novedades (Carlos 2026-10-05 23:56).
 * Fix r11 (2026-10-06): el tip se porta a document.body con position:fixed
 * anclado al seal (getBoundingClientRect), clamped al viewport, z-index alto —
 * así no lo recorta overflow del rail izquierdo. title nativo = fallback. */
(function () {
  if (window.__admiraSelloNovedades) return;
  window.__admiraSelloNovedades = true;

  var TIP_W = 300;
  var GAP = 8;
  var Z = 2147483000;

  var meta = document.querySelector('meta[name="admiranext-version"]');
  var SELLO_META = meta
    ? String(meta.getAttribute('content') || '').replace(/^AdmiraNeXT\s*/, '').trim()
    : '';

  var tipEl = null;
  var sealEl = null;
  var hideTimer = null;

  function ensureCss() {
    if (document.getElementById('sello-novedades-css')) return;
    var s = document.createElement('style');
    s.id = 'sello-novedades-css';
    s.textContent = [
      '.rail-ver.sello-vivo{cursor:help;color:#e6c788!important;border:1px solid #886633;padding:4px 6px;margin-top:auto;background:rgba(30,18,4,.35)}',
      '.rail-ver.sello-vivo:hover,.rail-ver.sello-vivo:focus-visible{color:#fff0b0!important;border-color:#c0995a;background:#3a2410}',
      /* Portal tip: NEVER a child of the overflowing rail */
      '#sello-novedades-tip{position:fixed;z-index:' + Z + ';width:' + TIP_W + 'px;max-width:min(320px,calc(100vw - 16px));',
      'box-sizing:border-box;background:#2a1a08;border:2px solid #ad8448;border-top-color:#c0995a;',
      'box-shadow:4px 4px 0 #000a;padding:8px 10px;font-family:"Press Start 2P",monospace;',
      'font-size:7px;line-height:1.55;color:#ffee88;pointer-events:none;',
      'opacity:0;visibility:hidden;transform:translateY(4px);',
      'transition:opacity .12s ease,transform .12s ease,visibility .12s}',
      '#sello-novedades-tip.is-on{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto}',
      '#sello-novedades-tip b{display:block;color:#daa520;margin-bottom:6px;letter-spacing:.5px}',
      '#sello-novedades-tip ul{margin:0;padding:0}',
      '#sello-novedades-tip li{margin:0 0 5px 0;padding:0 0 0 8px;list-style:none;position:relative;color:#e6c788}',
      '#sello-novedades-tip li::before{content:"▸";position:absolute;left:0;color:#c0995a}',
      '#sello-novedades-tip .sello-meta{margin-top:6px;padding-top:5px;border-top:1px solid #3a2410;color:#886633;font-size:6px}'
    ].join('');
    document.head.appendChild(s);
  }

  function linesFrom(d) {
    var n = d && d.novedades;
    if (Array.isArray(n)) return n.map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 6);
    if (typeof n === 'string' && n.trim()) {
      return n.split(/\s*[;|\n]\s*/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6);
    }
    return [];
  }

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = 'sello-novedades-tip';
    tipEl.className = 'sello-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function fillTip(d, sello) {
    var tip = ensureTip();
    var lines = linesFrom(d);
    tip.innerHTML = '';
    var head = document.createElement('b');
    head.textContent = 'NOVEDADES · ' + sello;
    tip.appendChild(head);
    if (lines.length) {
      var ul = document.createElement('ul');
      lines.forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      });
      tip.appendChild(ul);
    } else {
      var empty = document.createElement('div');
      empty.textContent = 'Sin notas en este sello.';
      empty.style.color = '#886633';
      tip.appendChild(empty);
    }
    var metaLine = [d && d.signature, d && d.deployedAt ? String(d.deployedAt).replace('T', ' ').replace(/Z$/, ' UTC') : '']
      .filter(Boolean).join(' · ');
    if (metaLine) {
      var foot = document.createElement('div');
      foot.className = 'sello-meta';
      foot.textContent = metaLine;
      tip.appendChild(foot);
    }
    return tip;
  }

  /** Place tip above the seal when possible; clamp to viewport. Exported for tests. */
  function placeTip(anchor, tip) {
    if (!anchor || !tip) return null;
    var r = anchor.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    // Measure after making it measurable but still hidden
    tip.style.visibility = 'hidden';
    tip.style.opacity = '0';
    tip.classList.add('is-on'); // so layout has real size
    var tw = tip.offsetWidth || TIP_W;
    var th = tip.offsetHeight || 120;
    tip.classList.remove('is-on');

    var left = r.left;
    if (left + tw > vw - 8) left = Math.max(8, vw - tw - 8);
    if (left < 8) left = 8;

    var top = r.top - th - GAP;
    if (top < 8) {
      // not enough room above → place below the seal
      top = r.bottom + GAP;
      if (top + th > vh - 8) top = Math.max(8, vh - th - 8);
    }

    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.style.right = 'auto';
    tip.style.bottom = 'auto';
    return { left: Math.round(left), top: Math.round(top), width: tw, height: th, vw: vw, vh: vh };
  }

  // Expose for node tests / debug
  window.__admiraSelloPlaceTip = placeTip;

  function showTip() {
    if (!sealEl || !tipEl) return;
    clearTimeout(hideTimer);
    placeTip(sealEl, tipEl);
    tipEl.classList.add('is-on');
    tipEl.setAttribute('aria-hidden', 'false');
  }

  function hideTip() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!tipEl) return;
      tipEl.classList.remove('is-on');
      tipEl.setAttribute('aria-hidden', 'true');
    }, 80);
  }

  function paint(el, d) {
    ensureCss();
    sealEl = el;
    var sello = String((d && d.version) || SELLO_META || '').trim() || el.textContent.trim();
    var lines = linesFrom(d);
    el.classList.add('sello-vivo');
    // Keep only the seal text as direct content (no tip child — tip lives on body)
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(document.createTextNode(sello));
    el.tabIndex = 0;
    var fallback = lines.length
      ? (sello + ' — ' + lines.join(' · '))
      : (sello + ' — versión publicada');
    el.setAttribute('title', fallback);
    el.setAttribute('aria-label', 'Sello ' + fallback);
    el.setAttribute('aria-describedby', 'sello-novedades-tip');

    fillTip(d || {}, sello);

    if (!el.__selloTipBound) {
      el.__selloTipBound = true;
      el.addEventListener('mouseenter', showTip);
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('focus', showTip);
      el.addEventListener('blur', hideTip);
      window.addEventListener('scroll', function () {
        if (tipEl && tipEl.classList.contains('is-on')) placeTip(sealEl, tipEl);
      }, true);
      window.addEventListener('resize', function () {
        if (tipEl && tipEl.classList.contains('is-on')) placeTip(sealEl, tipEl);
      });
    }
  }

  function boot() {
    var el = document.querySelector('.rail-ver');
    if (!el) return;
    paint(el, { version: SELLO_META, novedades: [] });
    fetch('/version.json?sello=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        paint(el, d);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
