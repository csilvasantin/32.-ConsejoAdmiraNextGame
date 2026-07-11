/* ADcelerate by Admira — nav + footer + conmutador de temas compartidos.
   Vanilla, sin frameworks. Se inyecta al vuelo para no duplicar markup.
   El conmutador (3 vistas: NEON · STUDIO · OPS) habla con window.AdmiraTheme
   (definido en theme-loader.js, cargado en <head>). */
(function () {
  var page = document.body.getAttribute('data-page') || '';
  var links = [
    { href: 'index.html',      key: 'home',       label: 'Tesis' },
    { href: 'audiencias.html', key: 'audiencias', label: 'Audiencias' },
    { href: 'activacion.html', key: 'activacion', label: 'Activación' },
    { href: 'medicion.html',   key: 'medicion',   label: 'Medición' },
    { href: 'circuito.html',   key: 'circuito',   label: 'Inventario' }
  ];

  var nav = document.createElement('nav');
  nav.className = 'ac-nav';
  nav.innerHTML =
    '<div class="ac-nav-inner">' +
      '<a class="ac-brand" href="index.html">' +
        '<span class="mark">A</span>' +
        '<span class="name">ADCELERATE</span>' +
        '<span class="by">by Admira</span>' +
      '</a>' +
      '<div class="ac-links">' +
        links.map(function (l) {
          return '<a href="' + l.href + '"' + (l.key === page ? ' class="active"' : '') + '>' + l.label + '</a>';
        }).join('') +
      '</div>' +
      '<span class="ac-tail">geo-contextual · inside-out</span>' +
    '</div>';
  document.body.insertBefore(nav, document.body.firstChild);

  /* ── Conmutador de temas (3 vistas) ───────────────────────── */
  buildThemeSwitch(nav.querySelector('.ac-nav-inner'));

  var foot = document.createElement('footer');
  foot.className = 'ac-foot';
  foot.innerHTML =
    '<span>ADcelerate <span class="muted">by Admira · la publicidad geo-contextual, desde dentro del circuito</span></span>' +
    '<a class="mono" href="https://admira.tv/adcelerate/" target="_blank" rel="noopener" style="text-decoration:none">versión pública →</a>' +
    '<span class="mono">AdmiraNeXT · prototipo v2 · datos mock · privado</span>';
  var wrap = document.querySelector('.wrap');
  if (wrap) wrap.appendChild(foot);

  /* ============================================================
     Conmutador: 3 píldoras con micro-preview al hover, accesible
     por teclado (role=radiogroup / radio), cambia SIN recargar vía
     window.AdmiraTheme.set (que hace View Transition si puede).
     ============================================================ */
  function buildThemeSwitch(host) {
    var AT = window.AdmiraTheme;
    if (!host || !AT) return;

    var order = ['neon', 'studio', 'ops'];
    var group = document.createElement('div');
    group.className = 'ac-theme';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Vista de la interfaz');

    var current = AT.current();
    var btns = {};

    order.forEach(function (name) {
      var meta = AT.THEMES[name];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ac-theme-pill';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-theme-name', name);
      b.setAttribute('aria-checked', name === current ? 'true' : 'false');
      b.setAttribute('aria-label', 'Vista ' + meta.label + ' (' + meta.sub + ')');
      b.tabIndex = (name === current) ? 0 : -1;
      b.style.setProperty('--pill-hue', meta.hue);
      b.innerHTML =
        '<span class="ac-theme-swatch" aria-hidden="true"></span>' +
        '<span class="ac-theme-label">' + meta.label + '</span>' +
        '<span class="ac-theme-tip" role="tooltip">' + meta.label + ' · ' + meta.sub + '</span>';
      b.addEventListener('click', function () { select(name, true); });
      btns[name] = b;
      group.appendChild(b);
    });

    // Navegación por teclado (flechas) dentro del radiogroup.
    group.addEventListener('keydown', function (e) {
      var idx = order.indexOf(AT.current());
      if (idx < 0) idx = 0;
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(idx + 1) % order.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[(idx - 1 + order.length) % order.length];
      else if (e.key === 'Home') next = order[0];
      else if (e.key === 'End') next = order[order.length - 1];
      if (next) { e.preventDefault(); select(next, true); btns[next].focus(); }
    });

    host.appendChild(group);

    function paint(name) {
      order.forEach(function (n) {
        var on = n === name;
        btns[n].setAttribute('aria-checked', on ? 'true' : 'false');
        btns[n].tabIndex = on ? 0 : -1;
        btns[n].classList.toggle('sel', on);
      });
    }

    function select(name, persist) {
      AT.set(name, { persist: persist !== false });
      paint(name);
    }

    // Refleja cambios de tema hechos por otras vías (query, API, otra pestaña).
    AT.on(function (name) { paint(name); });
    paint(AT.current());
  }
})();
