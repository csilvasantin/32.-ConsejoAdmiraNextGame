/* r251 (Carlos, 22-11 18:59, sustituye a r250): en el reloj de Proyectos, los 4 puntos son los 4 PILARES, en orden
 *   1 MacStudio · 2 MacMini · 3 MBP16 · 4 MBP14
 * Relleno verde = en ese pilar hay un Grok Bot abierto (cualquier cuenta: Leyendas csilva@admira.com — Jobs, Wozniak,
 * Lucas, Disney — o Actuales/Coetáneos csilvasantin@gmail.com — Musk, Jensen), según el pulso o la presencia (criterio
 * «conectado» de r246/r249). Negro = no. «Sin dato» = ni pulso fresco de su Grok Bot ni presencia (no se inventa).
 * Aro = estado por defecto: solo el MacStudio encendido.
 * Clic / toque = la etiqueta «Ayer · total tokens» bajo el odómetro pasa a «MacStudio · Leyendas», «MacMini · apagado»…
 *   (otra vez la misma bola, clic fuera o 20 s sin tocar = vuelve). El odómetro no cambia.
 * Doble clic / doble toque = encender o apagar Grok Bot en ese pilar (confirmación + bloqueos), por el canal de
 *   /control (#5872): relay FleetControl (Google de Carlos + CSRF) → POST /run → fleet/interruptor-agentes.sh
 *   grok-on|grok-off <cuenta> por SSH (open -g sin robar foco; quit normal). Encender abre la cuenta por defecto del Mac
 *   (Leyendas en el MacStudio; en el resto, la última usada). Pendiente = parpadeo hasta que el pulso lo confirma. */
(function (root) {
  'use strict';
  var GRUPOS = {
    leyendas: { nombre: 'Leyendas', cuenta: 'csilva@admira.com', consejeros: ['Jobs', 'Wozniak', 'Lucas', 'Disney'] },
    coetaneos: { nombre: 'Actuales', cuenta: 'csilvasantin@gmail.com', consejeros: ['Musk', 'Jensen'], alias: { huang: 'Jensen' } }
  };
  // id = máquina del relay FleetControl (fleet.json / /control); null = sin canal → sin doble clic.
  var PILARES = [
    { maquina: 'MacStudio', id: 'macstudio', defecto: true, cuentaDefecto: 'leyendas' },
    { maquina: 'MacMini', id: 'macmini', defecto: false, cuentaDefecto: null },
    { maquina: 'MBP16', id: 'macbookpro16', defecto: false, cuentaDefecto: null },
    { maquina: 'MBP14', id: 'macbookpronegro14', defecto: false, cuentaDefecto: null }
  ];
  var PEND_MAX_MS = 180000, DOBLE_MS = 320, ETIQUETA_MS = 20000, CLAVE_LS = 'admira:gb-pend-r251';
  function en() { try { return (root.document && document.documentElement.lang || '').indexOf('en') === 0; } catch (e) { return false; } }
  function T(es, ing) { return en() ? ing : es; }
  function llano(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@.]/g, ''); }
  function maqCanon(m) {
    var k = llano(m);
    if (k.indexOf('studio') >= 0) return 'MacStudio';
    if (k.indexOf('mini') >= 0) return 'MacMini';
    if (/(pro14|negro14|mbp14)/.test(k)) return 'MBP14';
    if (/(pro16|mbp16)/.test(k)) return 'MBP16';
    return m || '';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function grupoDeAgente(a) {
    var k = llano(a);
    for (var g in GRUPOS) { if (GRUPOS[g].consejeros.some(function (c) { return llano(c) === k; }) || (GRUPOS[g].alias && GRUPOS[g].alias[k])) return g; }
    return null;
  }
  function grupoDeCuenta(c) { c = llano(c); for (var g in GRUPOS) if (llano(GRUPOS[g].cuenta) === c) return g; return null; }

  /** d = /api/flota/trabajando → 4 pilares { maquina, id, defecto, on, grupos[], alFrente, fuente, sinDato, difiere }. */
  function pilares(d) {
    var ok = d && d.ok !== false;
    var apps = ok && Array.isArray(d.appsGrokBot) ? d.appsGrokBot : [], ts = ok && Array.isArray(d.tarjetas) ? d.tarjetas : [];
    var pul = ok && Array.isArray(d.grokbotPulso) ? d.grokbotPulso : [];
    return PILARES.map(function (p) {
      var on = false, alFrente = false, fuente = null, grupos = [], desconocida = false;
      function pon(g) { if (g && grupos.indexOf(g) < 0) grupos.push(g); }
      apps.forEach(function (a) {
        if (!a || maqCanon(a.maquina) !== p.maquina) return;
        on = true; alFrente = alFrente || !!a.alFrente;
        var g = grupoDeCuenta(a.cuenta); if (g) pon(g); else desconocida = true;
        fuente = fuente || (a.fuente === 'activa' ? T('pulso, cuenta activa', 'pulse, active account') : a.fuente === 'ultima' ? T('pulso, última cuenta usada', 'pulse, last account used') : T('pulso', 'pulse'));
      });
      ts.forEach(function (t) {
        var g = t && grupoDeAgente(t.agente); if (!g) return;
        (Array.isArray(t.superficies) ? t.superficies : []).forEach(function (s) {
          if (s && s.tipo === 'app' && s.app === 'GrokBot' && maqCanon(s.maquina) === p.maquina) { on = true; pon(g); alFrente = alFrente || !!s.alFrente || !!s.enUso; fuente = fuente || (s.fuente === 'latido' ? T('presencia', 'presence') : T('pulso', 'pulse')); }
        });
      });
      var pu = null; pul.forEach(function (x) { if (x && maqCanon(x.maquina) === p.maquina && (!pu || (x.haceS != null && x.haceS < pu.haceS))) pu = x; });
      var sinDato = !on && !(pu && pu.fresco);
      return { maquina: p.maquina, id: p.id, defecto: p.defecto, cuentaDefecto: p.cuentaDefecto, on: on, grupos: grupos, desconocida: desconocida && !grupos.length,
        alFrente: alFrente, fuente: fuente, pulso: pu, sinDato: sinDato, difiere: !sinDato && on !== p.defecto };
    });
  }
  function cuentasTxt(p) { return p.grupos.length ? p.grupos.map(function (g) { return GRUPOS[g].nombre; }).join(' + ') : p.desconocida ? T('cuenta sin identificar', 'unidentified account') : ''; }
  /** Texto de la etiqueta bajo el odómetro: «MacStudio · Leyendas», «MacMini · apagado», «MBP14 · sin dato». */
  function etiqueta(p) { return p.maquina + ' · ' + (p.on ? (cuentasTxt(p) || T('encendido', 'on')) : p.sinDato ? T('sin dato', 'no data') : T('apagado', 'off')); }
  function partes(p, pend) {
    var a = [p.maquina + ' · ' + (p.on ? T('Grok Bot encendido', 'Grok Bot on') + (p.fuente ? ' (' + p.fuente + ')' : '') : p.sinDato ? T('sin dato (ni pulso de su Grok Bot ni presencia)', 'no data') : T('Grok Bot apagado (pulso de hace ', 'Grok Bot off (pulse ') + (p.pulso ? p.pulso.haceS : '?') + ' s)')];
    p.grupos.forEach(function (g) { var G = GRUPOS[g]; a.push(G.nombre + ' · ' + G.consejeros.join(', ') + ' · ' + G.cuenta); });
    if (p.on && !p.grupos.length) a.push(T('cuenta sin identificar', 'unidentified account'));
    a.push(T('por defecto ', 'default ') + (p.defecto ? T('encendido', 'on') : T('apagado', 'off')) + (p.difiere ? T(' ⚠ difiere', ' ⚠ differs') : ''));
    if (pend) a.push(pend.error ? '✗ ' + pend.error : pend.nota ? pend.nota : T('pendiente: ', 'pending: ') + (pend.on ? T('encendiendo…', 'turning on…') : T('apagando…', 'turning off…')));
    if (!pend || pend.error || pend.nota) a.push(p.id ? T('clic: ver abajo · doble clic: ', 'click: show below · double click: ') + (p.on ? T('apagar', 'turn off') : T('encender', 'turn on')) : T('clic: ver abajo · sin canal en el relay para encender/apagar este Mac', 'no relay channel for this Mac'));
    return a;
  }
  function titulo(p, pend) { return partes(p, pend).join(' · '); }
  /** Qué hacer al doble clic: { orden, unidad, on, pregunta } o { bloqueo } (pura, se prueba). */
  function decidir(p) {
    if (!p.id) return { bloqueo: T('El ' + p.maquina + ' no tiene canal en el relay FleetControl: no se puede encender ni apagar desde aquí.', 'No relay channel for ' + p.maquina + '.') };
    if (p.on) {
      if (p.alFrente) return { bloqueo: T('Carlos está usando Grok Bot en el ' + p.maquina + ' ahora mismo: no se cierra (manda su teclado y ratón).', 'Carlos is using Grok Bot on the ' + p.maquina + ' right now.') };
      var g = p.grupos.length === 1 ? p.grupos[0] : 'desconocida';
      return { orden: 'grok-off', unidad: g, on: false, pregunta: T('¿Apagar Grok Bot en ' + p.maquina + '?\n\n' + (cuentasTxt(p) || '') + ' · se cierra la app con quit normal. Claude, Codex y los CLIs siguen igual.', 'Turn off Grok Bot on ' + p.maquina + '?') };
    }
    var cd = p.cuentaDefecto;
    return { orden: 'grok-on', unidad: cd || 'desconocida', on: true, pregunta: T('¿Encender Grok Bot en ' + p.maquina + '?\n\nSe abre en segundo plano (open -g, sin robar el foco) con ' + (cd ? 'la cuenta por defecto: ' + GRUPOS[cd].nombre + ' (' + GRUPOS[cd].cuenta + ')' : 'la última cuenta usada en ese Mac') + '. Si abre con otra cuenta, se cambia dentro de la app.', 'Turn on Grok Bot on ' + p.maquina + '?') };
  }
  function html(ps, pends, sel) {
    return ps.map(function (p, i) {
      var pd = pends && pends[p.maquina], t = titulo(p, pd);
      return '<button type="button" class="vel-da-p' + (p.on ? ' on' : '') + (p.defecto ? ' def-on' : ' def-off') + (p.sinDato ? ' sindato' : '') + (p.difiere ? ' difiere' : '') + (sel === i ? ' sel' : '') +
        (pd && !pd.error && !pd.nota ? ' pend' : '') + (pd && pd.error ? ' err' : '') + '" data-i="' + i + '" title="' + esc(t) + '" aria-label="' + esc(t) + '" aria-pressed="' + (sel === i) + '"></button>';
    }).join('') + '<span class="vel-da-txt" role="status" aria-live="polite"></span>';
  }
  /** Resuelve pendientes (clave = máquina) con el pulso: llegó al destino → fuera; caducó → nota. */
  function resolver(pends, ps, ahora) {
    var out = {}, por = {}; ps.forEach(function (p) { por[p.maquina] = p; });
    Object.keys(pends || {}).forEach(function (k) {
      var pd = pends[k], p = por[k]; if (!pd || !p) return;
      if (pd.error || pd.nota) { if (ahora - (pd.hasta || pd.ts) < 60000) out[k] = pd; return; }
      if (p.on === pd.on) return;
      if (ahora - pd.ts > PEND_MAX_MS) { out[k] = { on: pd.on, ts: pd.ts, hasta: ahora, nota: T('la orden no se ha confirmado con el pulso en 3 min', 'not confirmed by the pulse in 3 min') + (pd.salida ? ' (' + pd.salida + ')' : '') }; return; }
      out[k] = pd;
    });
    return out;
  }

  /* ---------- canal: relay FleetControl (el mismo de /control) ---------- */
  var mesh = null;
  function cargar(src, global) {
    if (root[global]) return Promise.resolve();
    return new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { ko(new Error('no se pudo cargar ' + src)); }; document.head.appendChild(s); });
  }
  function soloLectura() {
    try { var g = root.admiraGateUser && root.admiraGateUser(); if (g && g.agent === true) return true; } catch (e) {}
    try { return !!(mesh && mesh.agentReadOnly && mesh.agentReadOnly()); } catch (e) { return false; }
  }
  function ejecutar(p, dec) {
    return cargar('/control/fleet-mesh.js?v=20261110-control-lan-55a36066f39c', 'AdmiraFleetMesh')
      .then(function () { return cargar('/assets/interruptores.js?v=20261014-5872', 'AdmiraInterruptores'); })
      .then(function () {
        if (soloLectura()) throw new Error(T('sesión de agente: solo lectura', 'agent session: read only'));
        mesh = mesh || root.AdmiraFleetMesh.create({ timeoutMs: 12000, cooldownMs: 15000 });
        return mesh.ensureAnySession();
      })
      .then(function (ok) {
        if (!ok) throw new Error(T('sin sesión de FleetControl: entra una vez en admira.live/control con tu Google', 'no FleetControl session: sign in once at admira.live/control'));
        if (soloLectura()) throw new Error(T('sesión de agente: solo lectura', 'agent session: read only'));
        return root.AdmiraInterruptores.script();
      })
      .then(function (script) {
        return mesh.json('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ machine: p.id, cmd: root.AdmiraInterruptores.comando(script, dec.orden, dec.unidad), timeoutMs: 60000 }) });
      })
      .then(function (out) {
        var r = out.response, d = out.data || {};
        if (r.status === 401) throw new Error(T('sesión caducada: vuelve a entrar en /control', 'session expired'));
        if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
        var lineas = String(d.stdout || '').split('\n').filter(function (l) { return l && l.indexOf('__INTERRUPTOR__') < 0; });
        return { rc: d.rc, salida: lineas.slice(-2).join(' · ').slice(0, 160), st: root.AdmiraInterruptores.parse(d.stdout) };
      });
  }

  /* ---------- pintado e interacción ---------- */
  var ultimo = null, pends = {}, sel = null, selT = 0, rotuloOriginal = null;
  try { pends = JSON.parse((root.localStorage && localStorage.getItem(CLAVE_LS)) || '{}') || {}; } catch (e) { pends = {}; }
  function guarda() { try { localStorage.setItem(CLAVE_LS, JSON.stringify(pends)); } catch (e) {} }
  function caja() { return root.document && document.getElementById('vel-gb'); }
  function rotulo() { return root.document && document.getElementById('vel-proy-rotulo'); }
  function pintaRotulo() {
    var r = rotulo(); if (!r) return;
    if (sel == null || !ultimo || !ultimo[sel]) { r.classList.remove('vel-gb-pilar'); if (r.hasAttribute('data-r251')) { r.textContent = r.getAttribute('data-r251'); r.removeAttribute('data-r251'); } return; }
    if (!r.hasAttribute('data-r251')) r.setAttribute('data-r251', r.textContent);
    r.textContent = etiqueta(ultimo[sel]); r.classList.add('vel-gb-pilar');
  }
  function pinta(d) {
    var el = caja(); if (!el) return;
    if (d !== undefined) ultimo = pilares(d);
    if (!ultimo) ultimo = pilares(null);
    pends = resolver(pends, ultimo, Date.now()); guarda();
    if (sel != null && Date.now() - selT > ETIQUETA_MS && !el.classList.contains('ver')) sel = null;
    var abierto = el.getAttribute('data-abierto');
    el.innerHTML = html(ultimo, pends, sel);
    el.setAttribute('aria-label', T('Grok Bot por pilar (MacStudio, MacMini, MBP16, MBP14)', 'Grok Bot per pillar') + ': ' + ultimo.filter(function (p) { return p.on; }).length + '/4');
    if (abierto != null && ultimo[+abierto]) muestra(el, +abierto);
    pintaRotulo();
  }
  function muestra(el, i) {
    var t = el.querySelector('.vel-da-txt'); if (!t || !ultimo || !ultimo[i]) return;
    t.textContent = partes(ultimo[i], pends[ultimo[i].maquina]).join('\n'); el.setAttribute('data-abierto', String(i)); el.classList.add('ver');
  }
  function oculta(el) { el.removeAttribute('data-abierto'); el.classList.remove('ver'); }
  function selecciona(i) { sel = (sel === i) ? null : i; selT = Date.now(); pinta(); }
  function doble(el, i) {
    var p = ultimo && ultimo[i]; if (!p) return;
    var pd = pends[p.maquina];
    if (pd && !pd.error && !pd.nota) { muestra(el, i); return; }
    var dec = decidir(p);
    if (dec.bloqueo) { pends[p.maquina] = { on: !p.on, ts: Date.now(), hasta: Date.now(), error: dec.bloqueo }; guarda(); pinta(); muestra(el, i); return; }
    if (!root.confirm(dec.pregunta)) return;
    pends[p.maquina] = { on: dec.on, ts: Date.now() }; guarda(); pinta(); muestra(el, i);
    ejecutar(p, dec).then(function (res) {
      var x = pends[p.maquina];
      if (x) { x.salida = res.salida; if (res.rc != null && res.rc !== 0) { x.error = T('el Mac respondió rc=', 'Mac answered rc=') + res.rc + (res.salida ? ': ' + res.salida : ''); x.hasta = Date.now(); } }
      guarda(); pinta();
    }).catch(function (err) {
      pends[p.maquina] = { on: dec.on, ts: Date.now(), hasta: Date.now(), error: T('no se pudo enviar: ', 'could not send: ') + String(err && (err.message || err) || err) };
      guarda(); pinta(); muestra(el, i);
    });
  }
  function arranca() {
    var el = caja(); if (!el) return;
    pinta(root.ConsumosTrabajando && root.ConsumosTrabajando.ultimo ? root.ConsumosTrabajando.ultimo() : null);
    root.addEventListener('flota:trabajando', function (e) { pinta(e && e.detail); });
    setInterval(function () { if (Object.keys(pends).length || sel != null) pinta(); }, 5000);
    el.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('mouseleave', function () { if (!el.classList.contains('fijo')) oculta(el); });
    el.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('focusout', function () { if (!el.classList.contains('fijo')) oculta(el); });
    // Clic simple y doble clic separados: el simple espera DOBLE_MS por si llega el segundo; si llega, solo cuenta el doble.
    var espera = null, previo = null;
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vel-da-p'); if (!b) return;
      var i = +b.getAttribute('data-i');
      el.classList.add('fijo'); muestra(el, i);
      if (espera && previo === i) { clearTimeout(espera); espera = null; previo = null; doble(el, i); return; }
      if (espera) { clearTimeout(espera); selecciona(previo); }
      previo = i;
      espera = setTimeout(function () { espera = null; previo = null; selecciona(i); muestra(el, i); }, DOBLE_MS);
    });
    el.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('click', function (e) {
      if (e.target && e.target.isConnected !== false && !el.contains(e.target)) { el.classList.remove('fijo'); oculta(el); if (sel != null) { sel = null; pinta(); } }
    });
  }
  root.MarchasGrokBot = { GRUPOS: GRUPOS, PILARES: PILARES, pilares: pilares, etiqueta: etiqueta, titulo: titulo, decidir: decidir, html: html, resolver: resolver, maqCanon: maqCanon, PEND_MAX_MS: PEND_MAX_MS, DOBLE_MS: DOBLE_MS };
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca(); }
})(typeof window !== 'undefined' ? window : globalThis);
