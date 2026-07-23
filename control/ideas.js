/* control/ideas.js · Módulo «Ideas» del cockpit de flota (AdmiraNeXT · /control)
 * Captura ideas y muestra el norte del Consejo contra el worker de yokup.
 *   GET/POST  https://api.yokup.com/ideas
 *   GET       https://api.yokup.com/objetivos/progreso
 * CORS abierto, sin auth. Vista completa: https://www.yokup.com/objetivos
 * Autocontenido: inyecta su propio estilo (SCUMM/ámbar) y se monta en #ideasMount.
 * SubNeoMini · v.2026.07.23.r1
 */
(function () {
  'use strict';
  var API = 'https://api.yokup.com';
  var SEATS = ['ceo', 'cto', 'coo', 'cfo', 'cco', 'cdo', 'cxo', 'cso'];
  var mount = document.getElementById('ideasMount');
  if (!mount) return;

  // Autoría: el nombre que el cockpit ya conozca, o "control".
  function author() {
    try {
      var g = window.ADMIRA_USER || window.__ADMIRA_USER__ || window.AGENT_NAME;
      if (g && typeof g === 'string') return g;
    } catch (e) {}
    return 'control';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Estilo propio, a juego con el chrome SCUMM de la portería ───────────────
  var css = ''
    + '#ideasMount{margin-top:12px}'
    + '.ideas-card{border:2px solid #8b5a14;background:#150e06;box-shadow:2px 2px 0 #000;padding:9px 9px 11px;color:#ffdd66;font-size:12px}'
    + '.ideas-hd{font-family:"Press Start 2P",monospace;font-size:8px;line-height:1.7;color:#ffdd66;letter-spacing:.5px;border-bottom:2px solid #8b5a14;padding:2px 2px 8px;margin-bottom:9px;display:flex;align-items:center;justify-content:space-between;gap:6px}'
    + '.ideas-hd a{color:#f0c040;text-decoration:none;font-family:inherit;font-size:7px}'
    + '.ideas-hd a:hover{color:#fff}'
    + '.ideas-cap{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}'
    + '.ideas-cap input,.ideas-cap select{border-radius:0;border:2px solid #8b5a14;background:#2a1a08;color:#ffdd66;padding:5px 6px;font-size:12px;font-family:inherit}'
    + '.ideas-cap input{flex:1 1 100%;min-width:0}'
    + '.ideas-cap select{flex:1 1 auto}'
    + '.ideas-cap button{flex:0 0 auto;border-radius:0;border:2px solid #f0c040;background:#a07828;color:#2a1a08;font-weight:700;padding:5px 10px;cursor:pointer;box-shadow:2px 2px 0 #000;font-family:inherit}'
    + '.ideas-cap button:hover{background:#f0c040}'
    + '.ideas-cap button:disabled{opacity:.5;cursor:default}'
    + '.ideas-sub{font-family:"Press Start 2P",monospace;font-size:7px;color:#c9a86a;letter-spacing:.5px;margin:2px 2px 6px}'
    + '.ideas-list{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:4px}'
    + '.ideas-it{border:1px solid #5a3a1e;background:#1b130a;padding:5px 7px;display:flex;align-items:flex-start;gap:6px;line-height:1.35}'
    + '.ideas-it .t{flex:1;min-width:0;word-break:break-word}'
    + '.ideas-it .st{flex:0 0 auto;font-size:9px;padding:1px 5px;border:1px solid #8b5a14;color:#ffdd66;text-transform:uppercase;letter-spacing:.5px}'
    + '.ideas-it .st.estudio{color:#7aa2ff;border-color:#3498db}'
    + '.ideas-it .st.nueva{color:#5bd6c0;border-color:#2f8f7f}'
    + '.ideas-it .seat{flex:0 0 auto;font-size:9px;color:#c9a86a;text-transform:uppercase}'
    + '.ideas-empty{color:#c9a86a;font-size:11px;padding:2px}'
    + '.ideas-prog{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}'
    + '.ideas-pr{display:flex;align-items:center;gap:5px;font-size:10px;color:#ffdd66;font-family:var(--mono,monospace)}'
    + '.ideas-pr .s{flex:0 0 30px;text-transform:uppercase;color:#c9a86a}'
    + '.ideas-pr .bar{flex:1;height:6px;background:#2a1a08;border:1px solid #5a3a1e;position:relative;overflow:hidden}'
    + '.ideas-pr .bar>i{display:block;height:100%;background:#f0c040}'
    + '.ideas-pr .n{flex:0 0 auto;color:#c9a86a}'
    + '.ideas-msg{font-size:10px;margin:2px 2px 0;min-height:12px;color:#c9a86a}'
    + '.ideas-msg.ok{color:#5bd6c0}.ideas-msg.bad{color:#ff6b6b}';
  var st = document.createElement('style');
  st.id = 'ideas-style';
  st.textContent = css;
  document.head.appendChild(st);

  // ── Esqueleto ───────────────────────────────────────────────────────────────
  var seatOpts = '<option value="">— silla —</option>'
    + SEATS.map(function (s) { return '<option value="' + s + '">' + s.toUpperCase() + '</option>'; }).join('');
  mount.innerHTML = ''
    + '<section class="ideas-card" aria-label="Ideas del Consejo">'
    + '  <div class="ideas-hd"><span>💡 Ideas</span>'
    + '    <a href="https://www.yokup.com/objetivos" target="_blank" rel="noopener">objetivos ↗</a></div>'
    + '  <form class="ideas-cap" id="ideasForm">'
    + '    <input id="ideasTitle" type="text" maxlength="140" placeholder="captura una idea…" autocomplete="off" required>'
    + '    <select id="ideasSeat">' + seatOpts + '</select>'
    + '    <button type="submit" id="ideasBtn">＋ idea</button>'
    + '  </form>'
    + '  <div class="ideas-msg" id="ideasMsg"></div>'
    + '  <div class="ideas-sub">IDEAS VIVAS</div>'
    + '  <ul class="ideas-list" id="ideasList"><li class="ideas-empty">cargando…</li></ul>'
    + '  <div class="ideas-sub">NORTE POR SILLA</div>'
    + '  <ul class="ideas-prog" id="ideasProg"><li class="ideas-empty">cargando…</li></ul>'
    + '</section>';

  var form = document.getElementById('ideasForm');
  var elTitle = document.getElementById('ideasTitle');
  var elSeat = document.getElementById('ideasSeat');
  var elBtn = document.getElementById('ideasBtn');
  var elMsg = document.getElementById('ideasMsg');
  var elList = document.getElementById('ideasList');
  var elProg = document.getElementById('ideasProg');

  function msg(text, kind) {
    elMsg.textContent = text || '';
    elMsg.className = 'ideas-msg' + (kind ? ' ' + kind : '');
  }

  // ── Ideas vivas (nueva/estudio) ──────────────────────────────────────────────
  function renderIdeas(ideas) {
    var live = (ideas || []).filter(function (i) {
      return i.status === 'nueva' || i.status === 'estudio';
    });
    live.sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
    if (!live.length) {
      elList.innerHTML = '<li class="ideas-empty">sin ideas vivas</li>';
      return;
    }
    elList.innerHTML = live.slice(0, 8).map(function (i) {
      var seat = i.seat ? '<span class="seat">' + esc(i.seat) + '</span>' : '';
      return '<li class="ideas-it"><span class="t">' + esc(i.title) + '</span>'
        + seat + '<span class="st ' + esc(i.status) + '">' + esc(i.status) + '</span></li>';
    }).join('');
  }

  function loadIdeas() {
    return fetch(API + '/ideas', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderIdeas(d && d.ideas); })
      .catch(function () { elList.innerHTML = '<li class="ideas-empty">sin conexión</li>'; });
  }

  // ── Norte por silla (progreso) ───────────────────────────────────────────────
  function renderProg(seats) {
    if (!seats || !seats.length) {
      elProg.innerHTML = '<li class="ideas-empty">sin datos</li>';
      return;
    }
    elProg.innerHTML = seats.map(function (s) {
      var done = s.tasks_done || 0, tot = s.tasks_total || 0;
      var pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
      var n = tot > 0 ? (done + '/' + tot) : (s.ideas_count || 0) + '💡';
      return '<li class="ideas-pr" title="' + esc(s.seat) + ' · ' + (s.missions || 0) + ' misiones · '
        + (s.ideas_count || 0) + ' ideas"><span class="s">' + esc(s.seat) + '</span>'
        + '<span class="bar"><i style="width:' + pct + '%"></i></span>'
        + '<span class="n">' + esc(n) + '</span></li>';
    }).join('');
  }

  function loadProg() {
    return fetch(API + '/objetivos/progreso', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderProg(d && d.seats); })
      .catch(function () { elProg.innerHTML = '<li class="ideas-empty">sin conexión</li>'; });
  }

  // ── Captura ──────────────────────────────────────────────────────────────────
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var title = (elTitle.value || '').trim();
    if (!title) { elTitle.focus(); return; }
    var body = { title: title, author: author(), tag: 'control' };
    var seat = elSeat.value;
    if (seat) body.seat = seat;
    elBtn.disabled = true;
    msg('enviando…');
    fetch(API + '/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function () {
        elTitle.value = '';
        elSeat.value = '';
        msg('idea capturada', 'ok');
        return Promise.all([loadIdeas(), loadProg()]);
      })
      .catch(function (e) { msg('error: ' + (e && e.message || e), 'bad'); })
      .then(function () { elBtn.disabled = false; });
  });

  // Carga inicial + refresco suave.
  loadIdeas();
  loadProg();
  setInterval(function () { loadIdeas(); loadProg(); }, 60000);
})();
