/* r250 (Carlos, 22-11 18:25): los 3 testigos del reloj de Proyectos pasan a 4 puntos, a la altura de los de DeepAgents
 * (entre el reloj y el odómetro «Ayer · total tokens»). Cada punto es la app Grok Bot de una cuenta en un Mac:
 *   1 Leyendas (csilva@admira.com: Jobs, Wozniak, Lucas, Disney) en MacStudio · 2 Leyendas en MacMini
 *   3 Coetáneos (csilvasantin@gmail.com: Musk, Jensen) en MacStudio · 4 Coetáneos en MacMini
 * Relleno verde = Grok Bot abierto con esa cuenta en ese Mac (criterio «conectado» de r246/r249: pulso o presencia,
 * /api/flota/trabajando → appsGrokBot y superficies app GrokBot). Negro = no.
 * Aro = estado POR DEFECTO (deseado): Leyendas en MacStudio encendido, el resto apagado. Si el real difiere, se ve
 * (aro verde con relleno negro, o aro gris con relleno verde) y el tooltip lo dice.
 * Doble clic (o doble toque) = encender / apagar: confirmación en la web y orden por el canal que ya usa
 * admira.live/control para sus interruptores (#5872): relay FleetControl (login Google de Carlos + CSRF; las sesiones
 * de agente son de solo lectura) → POST /run → /fleet/interruptor-agentes.sh grok-on|grok-off <cuenta> por SSH en
 * ese Mac (open -g sin robar el foco; quit normal). No se instala nada en los Macs. El punto parpadea mientras la
 * orden está pendiente y se resuelve con el pulso real (o caduca a los 3 min). */
(function (root) {
  'use strict';
  var GRUPOS = {
    leyendas: { nombre: 'Leyendas', cuenta: 'csilva@admira.com', consejeros: ['Jobs', 'Wozniak', 'Lucas', 'Disney'] },
    coetaneos: { nombre: 'Coetáneos', cuenta: 'csilvasantin@gmail.com', consejeros: ['Musk', 'Jensen'], alias: { huang: 'Jensen' } }
  };
  var PUNTOS = [
    { grupo: 'leyendas', maquina: 'MacStudio', id: 'macstudio', defecto: true },
    { grupo: 'leyendas', maquina: 'MacMini', id: 'macmini', defecto: false },
    { grupo: 'coetaneos', maquina: 'MacStudio', id: 'macstudio', defecto: false },
    { grupo: 'coetaneos', maquina: 'MacMini', id: 'macmini', defecto: false }
  ];
  var PEND_MAX_MS = 180000, DOBLE_MS = 450, CLAVE_LS = 'admira:gb-pend';
  function en() { try { return (root.document && document.documentElement.lang || '').indexOf('en') === 0; } catch (e) { return false; } }
  function T(es, ing) { return en() ? ing : es; }
  function llano(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@.]/g, ''); }
  function maqCanon(m) { var k = llano(m); return k.indexOf('studio') >= 0 ? 'MacStudio' : k.indexOf('mini') >= 0 ? 'MacMini' : k.indexOf('mbp') >= 0 || k.indexOf('macbook') >= 0 ? 'MBP16' : (m || ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function grupoDeAgente(a) {
    var k = llano(a);
    for (var g in GRUPOS) { if (GRUPOS[g].consejeros.some(function (c) { return llano(c) === k; }) || (GRUPOS[g].alias && GRUPOS[g].alias[k])) return g; }
    return null;
  }
  function grupoDeCuenta(c) { c = llano(c); for (var g in GRUPOS) if (llano(GRUPOS[g].cuenta) === c) return g; return null; }

  /** d = /api/flota/trabajando → 4 puntos { grupo, maquina, id, defecto, on, alFrente, fuente, ... } (en orden). */
  function puntos(d) {
    var ok = d && d.ok !== false;
    var apps = ok && Array.isArray(d.appsGrokBot) ? d.appsGrokBot : [], ts = ok && Array.isArray(d.tarjetas) ? d.tarjetas : [];
    return PUNTOS.map(function (p) {
      var on = false, alFrente = false, fuente = null;
      apps.forEach(function (a) { if (a && grupoDeCuenta(a.cuenta) === p.grupo && maqCanon(a.maquina) === p.maquina) { on = true; alFrente = alFrente || !!a.alFrente; fuente = fuente || (a.fuente === 'ultima' ? 'pulso (última cuenta usada)' : 'pulso'); } });
      ts.forEach(function (t) {
        if (!t || grupoDeAgente(t.agente) !== p.grupo) return;
        (Array.isArray(t.superficies) ? t.superficies : []).forEach(function (s) {
          if (s && s.tipo === 'app' && s.app === 'GrokBot' && maqCanon(s.maquina) === p.maquina) { on = true; alFrente = alFrente || !!s.alFrente || !!s.enUso; fuente = fuente || (s.fuente === 'latido' ? 'presencia' : 'pulso'); }
        });
      });
      // Otra cuenta abierta en el mismo Mac (la app es una sola: una cuenta activa a la vez).
      var otra = null;
      apps.forEach(function (a) { var g = a && grupoDeCuenta(a.cuenta); if (g && g !== p.grupo && maqCanon(a.maquina) === p.maquina) otra = g; });
      var G = GRUPOS[p.grupo];
      return { grupo: p.grupo, nombre: G.nombre, cuenta: G.cuenta, consejeros: G.consejeros, maquina: p.maquina, id: p.id, defecto: p.defecto,
        on: on, alFrente: alFrente, fuente: fuente, otra: otra, difiere: on !== p.defecto };
    });
  }
  function partes(p, pend) {
    var a = [p.nombre + ' · ' + p.consejeros.join(', '), p.cuenta + ' · ' + p.maquina,
      (p.on ? T('conectado', 'connected') + (p.fuente ? ' (' + p.fuente + ')' : '') : T('no conectado', 'not connected')) +
      ' · ' + T('por defecto ', 'default ') + (p.defecto ? T('encendido', 'on') : T('apagado', 'off')) + (p.difiere ? T(' ⚠ difiere', ' ⚠ differs') : '')];
    if (pend) a.push(pend.error ? '✗ ' + pend.error : pend.nota ? pend.nota : T('pendiente: ', 'pending: ') + (pend.on ? T('encendiendo…', 'turning on…') : T('apagando…', 'turning off…')));
    if (!pend || pend.error || pend.nota) a.push(T('doble clic: ', 'double click: ') + (p.on ? T('apagar', 'turn off') : T('encender', 'turn on')));
    return a;
  }
  function titulo(p, pend) { return partes(p, pend).join(' · '); }
  /** Qué hacer al doble clic: { orden, pregunta } o { bloqueo } (pura, se prueba). */
  function decidir(p) {
    var dest = p.on ? 'off' : 'on', G = GRUPOS[p.grupo];
    if (dest === 'off' && p.alFrente) return { bloqueo: T('Carlos está usando Grok Bot (' + G.nombre + ') en el ' + p.maquina + ' ahora mismo: no se cierra (manda su teclado y ratón).', 'Carlos is using Grok Bot (' + G.nombre + ') on the ' + p.maquina + ' right now: it is not closed.') };
    if (dest === 'on' && p.otra) return { bloqueo: T('Grok Bot del ' + p.maquina + ' está abierto con la cuenta ' + GRUPOS[p.otra].nombre + '. Es una sola app con una cuenta activa: para ' + G.nombre + ' hay que cambiar de cuenta dentro de la app (no hay forma fiable de elegirla desde aquí).', 'Grok Bot on the ' + p.maquina + ' is open with the ' + GRUPOS[p.otra].nombre + ' account; switch account inside the app.') };
    return { orden: 'grok-' + dest, unidad: p.grupo, on: dest === 'on',
      pregunta: dest === 'off' ? T('¿Apagar ' + G.nombre + ' en ' + p.maquina + '?\n\nSe cierra la app Grok Bot (' + G.cuenta + ') con quit normal. Claude, Codex y los CLIs siguen igual.', 'Turn off ' + G.nombre + ' on ' + p.maquina + '?')
        : T('¿Encender ' + G.nombre + ' en ' + p.maquina + '?\n\nSe abre Grok Bot en segundo plano (open -g, sin robar el foco). Ojo: abre con la última cuenta usada en ese Mac; si no es ' + G.cuenta + ', habrá que cambiarla dentro de la app.', 'Turn on ' + G.nombre + ' on ' + p.maquina + '?') };
  }
  function html(ps, pends) {
    return ps.map(function (p, i) {
      var pd = pends && pends[i], t = titulo(p, pd);
      return '<button type="button" class="vel-da-p' + (p.on ? ' on' : '') + (p.defecto ? ' def-on' : ' def-off') + (p.difiere ? ' difiere' : '') + (pd && !pd.error && !pd.nota ? ' pend' : '') + (pd && pd.error ? ' err' : '') + '" data-i="' + i + '" title="' + esc(t) + '" aria-label="' + esc(t) + '"></button>';
    }).join('') + '<span class="vel-da-txt" role="status" aria-live="polite"></span>';
  }
  /** Resuelve pendientes con el pulso: llegó al destino → fuera; caducó → nota. */
  function resolver(pends, ps, ahora) {
    var out = {};
    Object.keys(pends || {}).forEach(function (i) {
      var pd = pends[i], p = ps[+i]; if (!pd || !p) return;
      if (pd.error || pd.nota) { if (ahora - (pd.hasta || pd.ts) < 60000) out[i] = pd; return; }
      if (p.on === pd.on) return;
      if (ahora - pd.ts > PEND_MAX_MS) { out[i] = { on: pd.on, ts: pd.ts, hasta: ahora, nota: T('la orden no se ha confirmado con el pulso en 3 min', 'not confirmed by the pulse in 3 min') + (pd.salida ? ' (' + pd.salida + ')' : '') }; return; }
      out[i] = pd;
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
  var ultimo = null, pends = {};
  try { pends = JSON.parse((root.localStorage && localStorage.getItem(CLAVE_LS)) || '{}') || {}; } catch (e) { pends = {}; }
  function guarda() { try { localStorage.setItem(CLAVE_LS, JSON.stringify(pends)); } catch (e) {} }
  function caja() { return root.document && document.getElementById('vel-gb'); }
  function pinta(d) {
    var el = caja(); if (!el) return;
    if (d !== undefined) ultimo = puntos(d);
    if (!ultimo) ultimo = puntos(null);
    pends = resolver(pends, ultimo, Date.now()); guarda();
    var abierto = el.getAttribute('data-abierto');
    el.innerHTML = html(ultimo, pends);
    el.setAttribute('aria-label', T('Grok Bot de Leyendas y Coetáneos por Mac', 'Grok Bot of Legends and Contemporaries per Mac') + ': ' + ultimo.filter(function (p) { return p.on; }).length + '/4');
    if (abierto != null && ultimo[+abierto]) muestra(el, +abierto);
  }
  function muestra(el, i) {
    var t = el.querySelector('.vel-da-txt'); if (!t || !ultimo || !ultimo[i]) return;
    t.textContent = partes(ultimo[i], pends[i]).join('\n'); el.setAttribute('data-abierto', String(i)); el.classList.add('ver');
    t.style.removeProperty('--x');
  }
  function oculta(el) { el.removeAttribute('data-abierto'); el.classList.remove('ver'); }
  function doble(el, i) {
    var p = ultimo && ultimo[i]; if (!p) return;
    if (pends[i] && !pends[i].error && !pends[i].nota) { muestra(el, i); return; }
    var dec = decidir(p);
    if (dec.bloqueo) { pends[i] = { on: !p.on, ts: Date.now(), hasta: Date.now(), error: dec.bloqueo }; guarda(); pinta(); muestra(el, i); return; }
    if (!root.confirm(dec.pregunta)) return;
    pends[i] = { on: dec.on, ts: Date.now() }; guarda(); pinta(); muestra(el, i);
    ejecutar(p, dec).then(function (res) {
      if (pends[i]) { pends[i].salida = res.salida; if (res.rc != null && res.rc !== 0) { pends[i].error = T('el Mac respondió rc=', 'Mac answered rc=') + res.rc + (res.salida ? ': ' + res.salida : ''); pends[i].hasta = Date.now(); } }
      guarda(); pinta();
    }).catch(function (err) {
      pends[i] = { on: dec.on, ts: Date.now(), hasta: Date.now(), error: T('no se pudo enviar: ', 'could not send: ') + String(err && (err.message || err) || err) };
      guarda(); pinta(); muestra(el, i);
    });
  }
  function arranca() {
    var el = caja(); if (!el) return;
    pinta(root.ConsumosTrabajando && root.ConsumosTrabajando.ultimo ? root.ConsumosTrabajando.ultimo() : null);
    root.addEventListener('flota:trabajando', function (e) { pinta(e && e.detail); });
    setInterval(function () { if (Object.keys(pends).length) pinta(); }, 5000);
    el.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('mouseleave', function () { if (!el.classList.contains('fijo')) oculta(el); });
    el.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.vel-da-p'); if (b) muestra(el, +b.getAttribute('data-i')); });
    el.addEventListener('focusout', function () { if (!el.classList.contains('fijo')) oculta(el); });
    // Un clic / toque = ver quién es; dos seguidos sobre el mismo punto (doble clic o doble toque) = encender / apagar.
    var previo = { i: null, t: 0 };
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vel-da-p'); if (!b) return;
      var i = +b.getAttribute('data-i'), ahora = Date.now();
      el.classList.add('fijo'); muestra(el, i);
      if (previo.i === i && ahora - previo.t < DOBLE_MS) { previo = { i: null, t: 0 }; doble(el, i); return; }
      previo = { i: i, t: ahora };
    });
    el.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('click', function (e) { if (e.target && e.target.isConnected !== false && !el.contains(e.target)) { el.classList.remove('fijo'); oculta(el); } });
  }
  root.MarchasGrokBot = { GRUPOS: GRUPOS, PUNTOS: PUNTOS, puntos: puntos, titulo: titulo, decidir: decidir, html: html, resolver: resolver, PEND_MAX_MS: PEND_MAX_MS };
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca(); }
})(typeof window !== 'undefined' ? window : globalThis);
