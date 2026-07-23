/* control/decisions.js · Morfeo Negro · v.2026.07.23.r6
   Panel de SOLO-LECTURA: las ventanas de decisión ABIERTAS de yokup dentro del
   cockpit — ves qué se está decidiendo en la flota y saltas a responder, sin
   salir de /control. Datos: GET api.yokup.com/decisions (dominio custom, NO
   workers.dev → funciona en ISPs ES). No escribe nada: responder se hace en
   yokup (enlace). Autocontenido, patrón de health.js/ideas.js. */
(function () {
  var API = 'https://api.yokup.com/decisions';
  var YOKUP = 'https://www.yokup.com/misiones';
  var mount = document.getElementById('decisionsMount');
  if (!mount) return;

  var st = document.createElement('style');
  st.textContent =
    '#decisionsMount{margin-top:12px}' +
    '.dec-hd{font:600 12px/1.3 -apple-system,system-ui,sans-serif;color:var(--acc,#f7c95d);display:flex;align-items:center;gap:6px;margin:0 0 6px}' +
    '.dec-hd .dec-sum{margin-left:auto;font-weight:700;background:rgba(247,201,93,.16);border-radius:999px;padding:1px 8px}' +
    '.dec-row{display:block;text-decoration:none;color:inherit;border:1px solid var(--line,#20303a);border-left:3px solid var(--acc,#f7c95d);border-radius:7px;padding:6px 8px;margin-bottom:6px;background:rgba(247,201,93,.04)}' +
    '.dec-row:hover{background:rgba(247,201,93,.10)}' +
    '.dec-top{display:flex;align-items:center;gap:8px;font:600 11px/1.2 -apple-system,system-ui,sans-serif}' +
    '.dec-proj{color:var(--acc,#f7c95d);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.dec-time{color:#ff8866;font-variant-numeric:tabular-nums;font-weight:700}' +
    '.dec-q{color:#cfe6ef;font:500 11.5px/1.35 -apple-system,system-ui,sans-serif;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.dec-rec{color:var(--mut,#75aab9);font-size:10.5px;margin-top:3px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}';
  document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(s) { s = Math.max(0, s | 0); var m = Math.floor(s / 60), ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss; }

  var DATA = [];
  function render() {
    var pend = DATA.filter(function (d) { return d.status === 'pending' && d.secondsLeft > 0; });
    if (!pend.length) { mount.style.display = 'none'; mount.innerHTML = ''; return; }
    mount.style.display = '';
    mount.innerHTML = '<div class="dec-hd">🗳️ Decisiones abiertas <span class="dec-sum">' + pend.length + '</span></div>' +
      pend.map(function (d) {
        var opts = Array.isArray(d.options) ? d.options : [];
        var rec = opts[(d.recommended != null ? d.recommended : 0)] || '';
        return '<a class="dec-row" href="' + esc(d.url || YOKUP) + '" target="_blank" rel="noopener" title="Responder en yokup (se abre en pestaña nueva)">' +
          '<div class="dec-top"><span class="dec-proj">' + esc(d.project || d.agent || '—') + '</span>' +
          '<span class="dec-time" data-dl="' + (+d.deadline || 0) + '">' + fmt(d.secondsLeft) + '</span></div>' +
          '<div class="dec-q">' + esc(d.question || '') + '</div>' +
          (rec ? '<div class="dec-rec">★ ' + esc(String(rec).slice(0, 90)) + '</div>' : '') +
          '</a>';
      }).join('');
  }
  function tick() {
    var now = Date.now();
    var rows = mount.querySelectorAll('.dec-time');
    for (var i = 0; i < rows.length; i++) {
      var dl = +rows[i].getAttribute('data-dl'); if (!dl) continue;
      var s = Math.round((dl - now) / 1000);
      rows[i].textContent = s <= 0 ? 'cerrando…' : fmt(s);
    }
  }
  function load() {
    // /decisions es lento (~3-4s: expira lotes + D1). Timeout de 10s para no colgar
    // si hay un pico; reintenta en el siguiente ciclo.
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 10000);
    fetch(API, { cache: 'no-store', signal: ctl.signal }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(to); DATA = (j && j.items) || []; render();
    }).catch(function () { clearTimeout(to); /* lento/sin red: no molesta, reintenta */ });
  }
  load();
  setInterval(load, 20000);
  setInterval(tick, 1000);
})();
