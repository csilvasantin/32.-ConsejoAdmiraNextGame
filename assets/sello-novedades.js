/* Sello de versión con popover SCUMM de novedades (Carlos 2026-10-05 23:56).
 * Lee /version.json → { version, novedades:[…] }. Pinta .rail-ver y muestra
 * un tip al hover/focus (title nativo como fallback). */
(function () {
  if (window.__admiraSelloNovedades) return;
  window.__admiraSelloNovedades = true;

  var meta = document.querySelector('meta[name="admiranext-version"]');
  var SELLO_META = meta
    ? String(meta.getAttribute('content') || '').replace(/^AdmiraNeXT\s*/, '').trim()
    : '';

  function ensureCss() {
    if (document.getElementById('sello-novedades-css')) return;
    var s = document.createElement('style');
    s.id = 'sello-novedades-css';
    s.textContent = [
      '.rail-ver.sello-vivo{position:relative;cursor:help;color:#e6c788!important;border:1px solid #886633;padding:4px 6px;margin-top:auto;background:rgba(30,18,4,.35)}',
      '.rail-ver.sello-vivo:hover,.rail-ver.sello-vivo:focus-visible{color:#fff0b0!important;border-color:#c0995a;background:#3a2410}',
      '.sello-tip{position:absolute;left:0;bottom:calc(100% + 6px);z-index:40;min-width:220px;max-width:280px;',
      'background:#2a1a08;border:2px solid #ad8448;border-top-color:#c0995a;box-shadow:3px 3px 0 #0008;',
      'padding:8px 10px;font-family:"Press Start 2P",monospace;font-size:7px;line-height:1.55;color:#ffee88;',
      'pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}',
      '.rail-ver.sello-vivo:hover .sello-tip,.rail-ver.sello-vivo:focus-within .sello-tip,.rail-ver.sello-vivo.is-tip .sello-tip{opacity:1;transform:translateY(0)}',
      '.sello-tip b{display:block;color:#daa520;margin-bottom:6px;letter-spacing:.5px}',
      '.sello-tip li{margin:0 0 5px 0;padding:0 0 0 8px;list-style:none;position:relative;color:#e6c788}',
      '.sello-tip li::before{content:"▸";position:absolute;left:0;color:#c0995a}',
      '.sello-tip .sello-meta{margin-top:6px;padding-top:5px;border-top:1px solid #3a2410;color:#886633;font-size:6px}'
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

  function paint(el, d) {
    ensureCss();
    var sello = String((d && d.version) || SELLO_META || '').trim() || el.textContent.trim();
    var lines = linesFrom(d);
    el.classList.add('sello-vivo');
    el.textContent = sello;
    el.tabIndex = 0;
    var fallback = lines.length
      ? (sello + ' — ' + lines.join(' · '))
      : (sello + ' — versión publicada');
    el.setAttribute('title', fallback);
    el.setAttribute('aria-label', 'Sello ' + fallback);

    var tip = el.querySelector('.sello-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'sello-tip';
      tip.setAttribute('role', 'tooltip');
      el.appendChild(tip);
    }
    tip.innerHTML = '';
    var head = document.createElement('b');
    head.textContent = 'NOVEDADES · ' + sello;
    tip.appendChild(head);
    if (lines.length) {
      var ul = document.createElement('ul');
      ul.style.cssText = 'margin:0;padding:0';
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

    // touch / keyboard: toggle tip
    el.addEventListener('focus', function () { el.classList.add('is-tip'); });
    el.addEventListener('blur', function () { el.classList.remove('is-tip'); });
  }

  function boot() {
    var el = document.querySelector('.rail-ver');
    if (!el) return;
    // Immediate paint from meta so the seal isn't stale while fetch runs.
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
