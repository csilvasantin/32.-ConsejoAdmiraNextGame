/* assets/interface-cli.js — /interface del modo experto (r29 · Jensen Huang · Carlos 11-10-2026 12:51).
 *
 *   /interface terminal 4 [dispositivo]   cuadratura 2x2 de los deepagents de pago (Neo, Morfeo, Trinity, Oráculo)
 *   /interface terminal 2 [dispositivo]   los 2 de Grok (Smith + Merovingio · cuadratura-grok)
 *   /interface 6 · terminal 6 [fold|iphone]  r33 (Carlos 13:30): 3x2 = los 4 de pago + Smith y Merovingio (Grok), del mismo
 *                                         visor /visor/?g=6 (llave del visor), con los mismos estados Idle / Login pendiente /
 *                                         Sin sesión / en misión que la cuadrícula del Mac (estado-agente.py)
 *   /interface off [dispositivo]          la cierra
 *   /interface help                       esta ayuda
 *
 * Sin dispositivo → se pinta AQUÍ, en un panel cuadrado encima de la web.
 * Con dispositivo:
 *   · Mac (Air, MBP16, MBP14) → orden por Fleet Mesh /run (misma sesión Google del relay que /control):
 *     el Mac ejecuta ~/Claude/vista/admira-interface.sh, que abre la cuadrícula en su Terminal.
 *   · Móvil (Fold, iPhone) → orden en /api/interface (con la llave del visor); el móvil tiene abierta
 *     admira.live/interface/?d=fold y la cuadrícula aparece sola.
 *
 * SEGURIDAD (no hay terminales públicas):
 *   · terminal 4 = /visor/ de Elon/Merovingio: relay de admira.live con llave revocable (cabecera X-Visor-Key,
 *     nunca en la URL), los Macs tapan secretos antes de publicar. Funciona en cualquier red.
 *   · terminal 2 = ttyd de solo lectura en el MacBook Air servido con `tailscale serve`: SOLO lo alcanzan los
 *     equipos del tailnet de Carlos (https://macbookair16plata.tail48b61c.ts.net/). Esta web pública solo
 *     enseña ese enlace privado; ninguna clave pasa por aquí.
 */
(function (root) {
  'use strict';
  var GRID2_URL = 'https://macbookair16plata.tail48b61c.ts.net/';
  var GRID4_URL = '/visor/';
  var GRID6_URL = '/visor/?g=6';
  var DISPOSITIVOS = {
    fold:   { tipo: 'movil', nombre: 'Samsung Fold', alias: ['fold', 'samsung', 'galaxy', 'zfold'] },
    iphone: { tipo: 'movil', nombre: 'iPhone', alias: ['iphone', 'ios'] },
    air:    { tipo: 'mac', nombre: 'MacBook Air 16 Plata', alias: ['air', 'mba', 'macbookair', 'air16', 'plata'], rx: /air.*(16|plata)|plata/i },
    mbp16:  { tipo: 'mac', nombre: 'MacBook Pro 16', alias: ['mbp16', 'mbp', 'pro16', 'macbookpro16'], rx: /pro\s*16/i },
    mbp14:  { tipo: 'mac', nombre: 'MacBook Pro Negro 14', alias: ['mbp14', 'pro14', 'negro', 'negro14', 'macbookpronegro14'], rx: /(negro|pro)\s*14/i }
  };
  function T(es, en) { return root.AdmiraIdioma ? root.AdmiraIdioma.t(es, en) : es; }

  function dispositivo(s) {
    var k = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k) return null;
    for (var id in DISPOSITIVOS) if (id === k || DISPOSITIVOS[id].alias.indexOf(k) >= 0) return id;
    return undefined; // desconocido
  }

  /** "/interface terminal 2 fold" → { ok, accion, grid, dispositivo } (puro: lo prueba interface-cli.test.mjs) */
  function parse(text) {
    var m = String(text || '').trim().match(/^\/(?:interface|interfaz)(?:\s+([\s\S]*))?$/i);
    if (!m) return null;
    var p = String(m[1] || '').trim().split(/\s+/).filter(Boolean);
    if (p[0] === '6') p.unshift('terminal'); // r33: «/interface 6 [dispositivo]» = «/interface terminal 6 [dispositivo]»
    var a = (p[0] || 'help').toLowerCase();
    if (a === 'help' || a === 'ayuda' || a === '?') return { ok: true, accion: 'help' };
    if (a === 'off' || a === 'cerrar' || a === 'close') {
      var g = /^[246]$/.test(p[1] || '') ? +p.splice(1, 1)[0] : 0;
      var d0 = dispositivo(p[1]);
      if (d0 === undefined) return { ok: false, error: 'dispositivo', valor: p[1] };
      return { ok: true, accion: 'off', grid: g, dispositivo: d0 };
    }
    if (a === 'terminal' || a === 'terminales') {
      var n = p[1];
      if (n !== '2' && n !== '4' && n !== '6') return { ok: false, error: 'grid', valor: n };
      var d = dispositivo(p[2]);
      if (d === undefined) return { ok: false, error: 'dispositivo', valor: p[2] };
      return { ok: true, accion: 'terminal', grid: +n, dispositivo: d };
    }
    return { ok: false, error: 'accion', valor: a };
  }

  function ayuda() {
    return T('/interface terminal 4 [dispositivo] — cuadratura Neo·Morfeo·Trinity·Oráculo · /interface terminal 2 [dispositivo] — Smith·Merovingio · /interface 6 [Fold|Iphone] — los 6 en 3x2 · ',
             '/interface terminal 4 [device] — Neo·Morph·Trinity·Oracle grid · /interface terminal 2 [device] — Smith·Merovingio · /interface 6 [Fold|Iphone] — all 6 in 3x2 · ') +
      T('sin dispositivo se abre aquí; dispositivos: Fold, Iphone, Air, MBP16, MBP14 · /interface off [dispositivo] la cierra',
        'no device opens it here; devices: Fold, Iphone, Air, MBP16, MBP14 · /interface off [device] closes it');
  }

  // ── Panel cuadrado en esta misma pantalla ───────────────────────────────
  function cerrarPanel() { var el = document.getElementById('admira-interface'); if (el) el.remove(); }
  function abrirPanel(grid) {
    cerrarPanel();
    var url = grid === 6 ? GRID6_URL : grid === 4 ? GRID4_URL : GRID2_URL;
    var titulo = grid === 6 ? '⌨ TERMINAL 6 · Neo · Morfeo · Trinity · Oráculo · Smith · Merovingio' : grid === 4 ? '⌨ TERMINAL 4 · Neo · Morfeo · Trinity · Oráculo' : '⌨ TERMINAL 2 · Smith · Merovingio (Grok)';
    var nota = grid >= 4
      ? T('Visor privado de admira.live (llave del visor en este navegador). Solo lectura.', 'admira.live private viewer (viewer key in this browser). Read only.')
      : T('Solo dentro del tailnet de Carlos (ttyd de solo lectura en el MacBook Air). Si no carga, este equipo no está en Tailscale.', 'Only inside Carlos\'s tailnet (read-only ttyd on the MacBook Air). If it does not load, this device is not on Tailscale.');
    var w = document.createElement('div');
    w.id = 'admira-interface';
    w.setAttribute('role', 'dialog');
    w.style.cssText = 'position:fixed;z-index:2147483200;left:50%;top:50%;transform:translate(-50%,-50%);' +
      (grid === 6 ? 'width:min(96vw,calc((94vh - 8px) * 1.5));height:min(94vh,calc(96vw / 1.5));' : 'width:min(94vw,calc(94vh - 8px));height:min(94vw,calc(94vh - 8px));') + 'background:#000;border:2px solid #28fe14;' +
      'box-shadow:0 0 0 4px #000,0 8px 30px rgba(0,0,0,.7);display:flex;flex-direction:column;font:12px/1.3 monospace;color:#28fe14';
    w.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:#061;color:#cfc;flex:0 0 auto">' +
      '<b style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></b>' +
      '<a target="_blank" rel="noopener" style="color:#cfc">' + T('abrir aparte', 'open apart') + ' ↗</a>' +
      '<button type="button" style="background:#000;color:#cfc;border:1px solid #cfc;cursor:pointer" title="' + T('Cerrar (Esc · /interface off)', 'Close (Esc · /interface off)') + '">✕</button></div>' +
      '<iframe style="flex:1;border:0;width:100%;background:#000" referrerpolicy="no-referrer" allow="local-network-access; local-network; clipboard-write"></iframe>' +
      '<div style="padding:3px 8px;color:#7a7;flex:0 0 auto"></div>';
    w.querySelector('b').textContent = titulo;
    w.querySelector('a').href = url;
    w.querySelector('iframe').src = url;
    w.querySelector('iframe').title = titulo;
    w.lastChild.textContent = nota;
    w.querySelector('button').onclick = cerrarPanel;
    document.body.appendChild(w);
    var esc = function (e) { if (e.key === 'Escape' && document.getElementById('admira-interface')) { e.stopPropagation(); cerrarPanel(); document.removeEventListener('keydown', esc, true); } };
    document.addEventListener('keydown', esc, true);
    return true;
  }

  // ── Mac: Fleet Mesh /run (sesión Google del relay) ───────────────────────
  var mesh = null;
  function cargarMesh() {
    if (root.AdmiraFleetMesh) return Promise.resolve(root.AdmiraFleetMesh);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = '/control/fleet-mesh.js?v=20261009-r10-lectura';
      s.onload = function () { root.AdmiraFleetMesh ? ok(root.AdmiraFleetMesh) : ko(new Error('fleet-mesh')); };
      s.onerror = function () { ko(new Error('fleet-mesh')); };
      document.head.appendChild(s);
    });
  }
  function ordenMac(o) {
    return o.accion === 'off' ? ('$HOME/Claude/vista/admira-interface.sh off' + (o.grid ? ' ' + o.grid : ''))
                              : ('$HOME/Claude/vista/admira-interface.sh terminal ' + o.grid);
  }
  function enviarMac(o, decir) {
    var D = DISPOSITIVOS[o.dispositivo];
    decir('📡 ' + T('Pidiendo a ', 'Asking ') + D.nombre + T(' que abra la terminal…', ' to open the terminal…'));
    return cargarMesh().then(function (M) {
      mesh = mesh || M.create({ timeoutMs: 12000, cooldownMs: 15000 });
      return mesh.ensureAnySession().then(function (s) {
        if (!s) throw new Error(T('sin sesión de control: entra una vez en admira.live/control con Google', 'no control session: sign in once at admira.live/control with Google'));
        return mesh.json('/status');
      });
    }).then(function (r) {
      var ms = (r.data && r.data.machines) || [];
      var m = ms.filter(function (x) { return D.rx.test(String(x.name || '') + ' ' + String(x.id || '') + ' ' + String(x.host || '')); })[0];
      if (!m) throw new Error(D.nombre + T(' no está en el censo del relay', ' is not in the relay census'));
      return mesh.json('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ machine: m.id, cmd: ordenMac(o) }) });
    }).then(function (r) {
      var d = r.data || {};
      if (r.response.status === 401) throw new Error(T('sesión caducada · entra en /control con Google', 'session expired · sign in at /control with Google'));
      if (d.rc === 0) decir('🖥 ' + D.nombre + ' · ' + String(d.stdout || 'ok').trim().split('\n').pop());
      else decir('⚠️ ' + D.nombre + ' · ' + String(d.stderr || d.error || d.stdout || ('rc=' + d.rc)).trim().slice(0, 160));
    }).catch(function (e) { decir('⚠️ ' + D.nombre + ' · ' + ((e && e.message) || e)); });
  }

  // ── Móvil: orden en /api/interface (llave del visor) ─────────────────────
  function llave() { try { return localStorage.getItem('visorLlave') || ''; } catch (e) { return ''; } }
  function enviarMovil(o, decir) {
    var D = DISPOSITIVOS[o.dispositivo], k = llave();
    if (!k) { decir('🔑 ' + T('Este navegador no tiene la llave del visor: ábrelo una vez con el enlace privado (#k=…) y repite.', 'This browser has no viewer key: open the private link (#k=…) once and retry.')); return Promise.resolve(); }
    return fetch('/api/interface', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Visor-Key': k },
      body: JSON.stringify({ dispositivo: o.dispositivo, accion: o.accion, grid: o.grid || 0 }) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); })
      .then(function (d) {
        if (d && d.ok) decir('📱 ' + D.nombre + ' · ' + (o.accion === 'off' ? T('cerrando', 'closing') : T('terminal ', 'terminal ') + o.grid) +
          T(' · lo verás en admira.live/interface/?d=', ' · you will see it at admira.live/interface/?d=') + o.dispositivo + T(' (déjala abierta en el móvil)', ' (keep it open on the phone)'));
        else decir('⚠️ ' + D.nombre + ' · ' + ((d && d.error) || 'error'));
      }).catch(function () { decir('⚠️ ' + D.nombre + ' · ' + T('admira.live no responde', 'admira.live is not answering')); });
  }

  /** run(text, decir) → true si era /interface (la home lo llama desde handleCliCommandBase). */
  function run(text, decir) {
    var o = parse(text);
    if (!o) return false;
    decir = decir || function () {};
    if (!o.ok) {
      decir('⚠️ ' + (o.error === 'dispositivo' ? T('Dispositivo desconocido: ', 'Unknown device: ') + o.valor + ' · ' : o.error === 'grid' ? T('Usa terminal 2, 4 o 6 · ', 'Use terminal 2, 4 or 6 · ') : '') + ayuda());
      return true;
    }
    if (o.accion === 'help') { decir('⌨ ' + ayuda()); return true; }
    if (!o.dispositivo) {
      if (o.accion === 'off') { cerrarPanel(); decir('⌨ ' + T('Interface cerrada', 'Interface closed')); }
      else { abrirPanel(o.grid); decir('⌨ ' + T('Terminal ', 'Terminal ') + o.grid + T(' aquí · Esc o /interface off para cerrar', ' here · Esc or /interface off to close')); }
      return true;
    }
    if (o.grid === 6 && o.accion === 'terminal' && DISPOSITIVOS[o.dispositivo].tipo === 'mac') {
      decir('⚠️ ' + T('La 6 de momento es aquí o en Fold/Iphone (en los Mac: terminal 4 y terminal 2) · ', 'The 6 is here or on Fold/Iphone for now (on Macs: terminal 4 and terminal 2) · ') + ayuda());
      return true;
    }
    (DISPOSITIVOS[o.dispositivo].tipo === 'mac' ? enviarMac : enviarMovil)(o, decir);
    return true;
  }

  var api = { parse: parse, run: run, ayuda: ayuda, abrirPanel: abrirPanel, cerrarPanel: cerrarPanel, ordenMac: ordenMac, DISPOSITIVOS: DISPOSITIVOS, GRID2_URL: GRID2_URL, GRID4_URL: GRID4_URL, GRID6_URL: GRID6_URL };
  root.AdmiraInterface = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
