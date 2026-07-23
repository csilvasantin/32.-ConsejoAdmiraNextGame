/* control/health.js · Morfeo Negro · v.2026.07.23.r2
   Semáforo de SALUD de las dependencias de FleetControl: un vistazo = qué está
   caído. Verde/rojo + latencia por dependencia, con resumen n/N. Reachabilidad
   por fetch no-cors + timeout (no lee el body, solo si RESPONDE), así evita
   errores de CORS. Autocontenido, sin tocar el resto del panel.
   Nota: el MacMini es tailnet-only → si sale «caído» desde tu equipo, es que
   ESTE navegador no lo alcanza (y /control entrará en modo degradado). */
(function () {
  var DEPS = [
    { k: 'mini',  name: 'MacMini · fleet',    url: 'https://macmini.tail48b61c.ts.net/fleet/api',              note: 'backend de flota (SSH · capturas · comandos). Tailnet.' },
    { k: 'fleet', name: 'admira-fleet',        url: 'https://admira-fleet.csilvasantin.workers.dev/machines',   note: 'registro de flota (Cloudflare) — fuente del modo degradado' },
    { k: 'yokup', name: 'yokup-rtc',           url: 'https://yokup-rtc.csilvasantin.workers.dev/fleet/missions', note: 'misiones y decisiones' },
    { k: 'tg',    name: 'admira-telegram',     url: 'https://admira-telegram.csilvasantin.workers.dev/',        note: 'AgoraMatrix / espejo Telegram' },
    { k: 'store', name: 'api.admira.store',    url: 'https://api.admira.store/signage/now',                     note: 'signage / proof-of-play' }
  ];
  var mount = document.getElementById('healthMount');
  if (!mount) return;

  var st = document.createElement('style');
  st.textContent =
    '#healthMount{margin-top:12px}' +
    '.hlth-hd{font:600 12px/1.3 -apple-system,system-ui,sans-serif;color:var(--acc,#f7c95d);display:flex;align-items:center;gap:6px;margin:0 0 6px}' +
    '.hlth-hd .hlth-sum{margin-left:auto;font-weight:700}' +
    '.hlth-row{display:flex;align-items:center;gap:8px;padding:4px 7px;border:1px solid var(--line,#20303a);border-radius:7px;margin-bottom:4px;font:500 11px/1.2 -apple-system,system-ui,sans-serif;background:rgba(255,255,255,.02)}' +
    '.hlth-dot{width:9px;height:9px;border-radius:50%;flex:none;background:#666}' +
    '.hlth-dot.up{background:#3fd07c;box-shadow:0 0 6px #3fd07c}' +
    '.hlth-dot.down{background:#ff5d5d;box-shadow:0 0 6px #ff5d5d}' +
    '.hlth-dot.chk{background:#f7c95d;animation:hlthpulse 1s infinite}' +
    '@keyframes hlthpulse{50%{opacity:.3}}' +
    '.hlth-nm{color:#cfe6ef;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.hlth-lat{color:#7fa8b8;font-variant-numeric:tabular-nums;flex:none}' +
    '.hlth-row.down .hlth-nm{color:#ffb0b0}';
  document.head.appendChild(st);

  mount.innerHTML =
    '<div class="hlth-hd" title="Salud de las dependencias de FleetControl">🩺 Dependencias <span class="hlth-sum" id="hlthSum">…</span></div>' +
    '<div id="hlthRows"></div>';
  var rows = document.getElementById('hlthRows');
  DEPS.forEach(function (d) {
    var r = document.createElement('div');
    r.className = 'hlth-row'; r.setAttribute('data-k', d.k); r.title = d.note;
    r.innerHTML = '<span class="hlth-dot chk"></span><span class="hlth-nm">' + d.name + '</span><span class="hlth-lat">…</span>';
    rows.appendChild(r);
  });

  function ping(d) {
    var t0 = performance.now();
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 6000);
    return fetch(d.url, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal })
      .then(function () { clearTimeout(to); return { up: true,  ms: Math.round(performance.now() - t0) }; })
      .catch(function () { clearTimeout(to); return { up: false, ms: Math.round(performance.now() - t0) }; });
  }

  function sweep() {
    var up = 0;
    return Promise.all(DEPS.map(function (d) {
      var row = rows.querySelector('[data-k="' + d.k + '"]');
      var dot = row.querySelector('.hlth-dot');
      var lat = row.querySelector('.hlth-lat');
      dot.className = 'hlth-dot chk';
      return ping(d).then(function (r) {
        if (r.up) { up++; dot.className = 'hlth-dot up'; lat.textContent = r.ms + ' ms'; row.classList.remove('down'); }
        else      { dot.className = 'hlth-dot down'; lat.textContent = 'caído'; row.classList.add('down'); }
      });
    })).then(function () {
      var sum = document.getElementById('hlthSum');
      sum.textContent = up + '/' + DEPS.length;
      sum.style.color = up === DEPS.length ? '#3fd07c' : (up === 0 ? '#ff5d5d' : '#f7c95d');
    });
  }

  sweep();
  setInterval(sweep, 25000);
})();
