/* assets/interface-cli.js — /interface del modo experto (r29 · Jensen Huang · Carlos 11-10-2026 12:51).
 *
 *   /interface terminal 4 [dispositivo]   cuadratura 2x2 de los deepagents de pago (Neo, Morfeo, Trinity, Oráculo)
 *   /interface terminal 2 [dispositivo]   los 2 de Grok (Smith + Merovingio · cuadratura-grok)
 *   /interface 6 · terminal 6 [fold|iphone]  r33 (Carlos 13:30): 3x2 = los 4 de pago + Smith y Merovingio (Grok), del mismo
 *                                         visor /visor/?g=6 (llave del visor), con los mismos estados Idle / Login pendiente /
 *                                         Sin sesión / en misión que la cuadrícula del Mac (estado-agente.py)
 *   /interface 2 claude|codex|grok [Fold|Iphone]   #5707: los 2 agentes vivos de ese modelo (latido más reciente)
 *   /interface 2 Neo Trinity [Fold|Iphone]         #5707: esos dos (Neo, Morfeo, Trinity, Oráculo, Smith, Merovingio)
 *                                         → visor con llave filtrado /visor/?a=Neo,Trinity en 2x1. El modelo sale de la
 *                                         presencia real vía /api/visor/seleccion (interface-seleccion.mjs); sin dato,
 *                                         «desconocido» y fuera de los grupos. Menos de 2 vivos → mensaje, nunca panel vacío.
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
  // #5707: selector detrás del «2» (sin mayúsculas ni tildes). Los nombres son los 6 del visor.
  var MODELOS = ['claude', 'codex', 'grok'];
  var AGENTES = ['Neo', 'Morfeo', 'Trinity', 'Oráculo', 'Smith', 'Merovingio'];
  function sinTilde(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function agente(s) { var k = sinTilde(s); if (!k) return null; for (var i = 0; i < AGENTES.length; i++) if (sinTilde(AGENTES[i]) === k) return AGENTES[i]; return null; }
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
    if (a === '2' || a === '4') { p.unshift('terminal'); a = 'terminal'; } // forma corta: /interface 4 · /interface 2 fold (6 ya arriba)
    if (a === 'terminal' || a === 'terminales') {
      var n = p[1];
      if (n !== '2' && n !== '4' && n !== '6') return { ok: false, error: 'grid', valor: n };
      var resto = p.slice(2).join(' ').split(/[\s,]+/).filter(Boolean), sel = null;
      if (n === '2' && resto.length) { // #5707: /interface 2 claude · /interface 2 Neo Trinity [dispositivo]
        if (MODELOS.indexOf(sinTilde(resto[0])) >= 0) sel = { modelo: sinTilde(resto.shift()) };
        else if (agente(resto[0])) {
          var a1 = agente(resto[0]), a2 = agente(resto[1]);
          if (!a2 || a2 === a1) return { ok: false, error: 'selector', valor: resto[1] || '', agente: a1, grid: 2 };
          sel = { agentes: [a1, a2] }; resto.splice(0, 2);
        }
      }
      var d = dispositivo(resto[0]);
      if (d === undefined) return { ok: false, error: 'dispositivo', valor: resto[0], grid: +n };
      var o = { ok: true, accion: 'terminal', grid: +n, dispositivo: d };
      if (sel) o.seleccion = sel;
      return o;
    }
    return { ok: false, error: 'accion', valor: a };
  }

  function ayuda() {
    return T('/interface [terminal] 4 [dispositivo] — cuadratura Neo·Morfeo·Trinity·Oráculo · /interface [terminal] 2 [dispositivo] — Smith·Merovingio · /interface 6 [Fold|Iphone] — los 6 en 3x2 · ',
             '/interface [terminal] 4 [device] — Neo·Morph·Trinity·Oracle grid · /interface [terminal] 2 [device] — Smith·Merovingio · /interface 6 [Fold|Iphone] — all 6 in 3x2 · ') +
      T('/interface 2 claude|codex|grok [Fold|Iphone] — los 2 vivos de ese modelo · /interface 2 Neo Trinity — esos dos · ',
        '/interface 2 claude|codex|grok [Fold|Iphone] — the 2 live agents on that model · /interface 2 Neo Trinity — those two · ') +
      T('sin dispositivo se abre aquí; dispositivos: Fold, Iphone, Air, MBP16, MBP14 · /interface off [dispositivo] la cierra',
        'no device opens it here; devices: Fold, Iphone, Air, MBP16, MBP14 · /interface off [device] closes it');
  }

  // ── Panel cuadrado en esta misma pantalla ───────────────────────────────
  var encajeActual = null;
  function cerrarPanel() {
    var el = document.getElementById('admira-interface'); if (el) el.remove();
    if (encajeActual) { root.removeEventListener('resize', encajeActual); encajeActual = null; }
  }
  // El panel cuadrado NO tapa el ⌘ EXPERTO · CLI anclado abajo: se encaja en el hueco que queda encima,
  // para poder seguir escribiendo (/interface off) mientras se ve. Sigue al alto del dock (experto-dock.js avisa con resize).
  function encajar(w) {
    var lim = root.innerHeight, d = document.querySelector('.ax-dock');
    if (d && d.offsetHeight && getComputedStyle(d).display !== 'none') { var r = d.getBoundingClientRect(); if (r.top > 160) lim = r.top; }
    // Responsive: en pantallas estrechas o en vertical (iPhone, Fold, tablet en vertical) ocupa TODO el ancho y todo
    // el alto libre; en pantallas anchas, el cuadrado de siempre.
    var estrecho = root.innerWidth < 820 || root.innerWidth < (lim - 12) * 1.15;
    if (w.dataset.dos && !estrecho) { // #5707: 2x1 apaisado, cada ficha casi cuadrada
      var alto = Math.max(140, Math.floor(Math.min(lim - 12, root.innerWidth * 0.96 / 1.6)));
      w.style.height = alto + 'px'; w.style.width = Math.floor(Math.min(root.innerWidth * 0.96, alto * 2)) + 'px';
    } else if (estrecho) {
      w.style.width = (root.innerWidth - 8) + 'px';
      w.style.height = Math.max(160, Math.floor(lim - 8)) + 'px';
    } else {
      var lado = Math.max(140, Math.floor(Math.min(root.innerWidth * 0.94, lim - 12)));
      w.style.width = w.style.height = lado + 'px';
    }
    w.style.top = Math.round(lim / 2) + 'px';
    w.style.borderWidth = estrecho ? '1px' : '2px';
  }
  /** abrirPanel(grid, eleccion?) — eleccion = respuesta de /api/visor/seleccion ({ agentes, modelo, url }) → visor filtrado 2x1. */
  function abrirPanel(grid, eleccion) {
    cerrarPanel();
    var url = eleccion ? urlSeleccion(eleccion.agentes) : grid === 6 ? GRID6_URL : grid === 4 ? GRID4_URL : GRID2_URL;
    var titulo = eleccion ? '⌨ TERMINAL 2 · ' + eleccion.agentes.join(' · ') + (eleccion.modelo ? ' (' + eleccion.modelo + ')' : '') :
      grid === 6 ? '⌨ TERMINAL 6 · Neo · Morfeo · Trinity · Oráculo · Smith · Merovingio' : grid === 4 ? '⌨ TERMINAL 4 · Neo · Morfeo · Trinity · Oráculo' : '⌨ TERMINAL 2 · Smith · Merovingio (Grok)';
    var nota = grid >= 4 || eleccion
      ? T('Visor privado de admira.live (llave del visor en este navegador). Solo lectura.', 'admira.live private viewer (viewer key in this browser). Read only.')
      : T('Solo dentro del tailnet de Carlos (ttyd de solo lectura en el MacBook Air). Si no carga, este equipo no está en Tailscale.', 'Only inside Carlos\'s tailnet (read-only ttyd on the MacBook Air). If it does not load, this device is not on Tailscale.');
    var w = document.createElement('div');
    w.id = 'admira-interface';
    if (eleccion) w.dataset.dos = '1';
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
    encajar(w);
    encajeActual = function () { encajar(w); };
    root.addEventListener('resize', encajeActual);
    var esc = function (e) { if (e.key === 'Escape' && document.getElementById('admira-interface')) { e.stopPropagation(); cerrarPanel(); document.removeEventListener('keydown', esc, true); } };
    document.addEventListener('keydown', esc, true);
    return true;
  }

  // ── #5707: /interface 2 <claude|codex|grok|Nombre Nombre> ─────────────────
  /** ['Neo','Oráculo'] → '/visor/?a=Neo,Oraculo' (solo nombres; la llave sigue en la cabecera del visor). */
  function urlSeleccion(agentes) { return GRID4_URL + '?a=' + agentes.map(function (a) { return sinTilde(a).replace(/^./, function (c) { return c.toUpperCase(); }); }).join(','); }
  /** Pregunta al servidor quién encaja (presencia real) → { ok, agentes, modelo, aviso } | { ok:false, mensaje, sugerencias }. */
  function consultarSeleccion(sel) {
    var q = sel.modelo ? 'modelo=' + sel.modelo : 'a=' + encodeURIComponent(sel.agentes.join(','));
    return fetch('/api/visor/seleccion?' + q, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, mensaje: T('admira.live no responde (presencia)', 'admira.live is not answering (presence)'), sugerencias: [] }; });
  }
  function conSeleccion(o, decir) {
    var etiqueta = o.seleccion.modelo || o.seleccion.agentes.join(' + ');
    if (o.dispositivo && DISPOSITIVOS[o.dispositivo].tipo === 'mac') {
      decir('⚠️ ' + T('El 2 con selector de momento es aquí o en Fold/Iphone (en los Mac: /interface 2 a secas) · ', 'The 2 with a selector is here or on Fold/Iphone for now (on Macs: plain /interface 2) · ') + ayuda());
      return Promise.resolve();
    }
    decir('🔎 ' + T('Buscando en la presencia: ', 'Looking up presence: ') + etiqueta + '…');
    return consultarSeleccion(o.seleccion).then(function (r) {
      if (!r || !r.ok || !r.agentes || r.agentes.length !== 2) {
        decir('⚠️ ' + ((r && r.mensaje) || T('No hay 2 agentes para ', 'There are no 2 agents for ') + etiqueta) + T(' · no abro un panel vacío', ' · not opening an empty panel') +
          (r && r.sugerencias && r.sugerencias.length ? T(' · prueba: ', ' · try: ') + r.sugerencias.join(' · ') : ''));
        return;
      }
      if (r.aviso) decir('ℹ️ ' + r.aviso);
      if (r.desconocidos && r.desconocidos.length && o.seleccion.modelo) decir('· ' + T('Modelo desconocido (fuera de los grupos): ', 'Unknown model (left out of the groups): ') + r.desconocidos.join(', '));
      if (!o.dispositivo) {
        abrirPanel(2, r);
        decir('⌨ ' + T('Terminal 2 aquí · ', 'Terminal 2 here · ') + r.agentes.join(' · ') + (r.modelo ? ' (' + r.modelo + ')' : '') + T(' · Esc o /interface off para cerrar', ' · Esc or /interface off to close'));
        return;
      }
      return enviarMovil({ accion: 'terminal', grid: 2, dispositivo: o.dispositivo, agentes: r.agentes }, decir);
    });
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
      body: JSON.stringify({ dispositivo: o.dispositivo, accion: o.accion, grid: o.grid || 0, agentes: o.agentes || undefined }) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); })
      .then(function (d) {
        if (d && d.ok) decir('📱 ' + D.nombre + ' · ' + (o.accion === 'off' ? T('cerrando', 'closing') : T('terminal ', 'terminal ') + o.grid + (o.agentes ? ' · ' + o.agentes.join(' · ') : '')) +
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
      var dispos = o.grid === 2 ? Object.keys(DISPOSITIVOS).concat(MODELOS, AGENTES.map(sinTilde)) : Object.keys(DISPOSITIVOS);
      var A = root.AdmiraCliAyuda, sug = A && o.valor ? A.sugerir(sinTilde(o.valor), o.error === 'selector' ? AGENTES.map(sinTilde) : o.error === 'dispositivo' ? dispos : ['terminal', 'help', 'ayuda', 'off', 'cerrar']) : '';
      decir('⚠️ ' + (o.error === 'selector' ? T('Con nombres hacen falta dos agentes distintos (', 'Names need two different agents (') + AGENTES.join(', ') + '): ' + o.agente + ' + ' + (o.valor || '?') + ' · ' :
        o.error === 'dispositivo' ? (o.grid === 2 ? T('No reconozco «', 'I do not recognise «') + o.valor + T('» (modelo claude|codex|grok, agente o dispositivo) · ', '» (model claude|codex|grok, agent or device) · ') : T('Dispositivo desconocido: ', 'Unknown device: ') + o.valor + ' · ') : o.error === 'grid' ? T('Usa terminal 2, 4 o 6 · ', 'Use terminal 2, 4 or 6 · ') : T('No entiendo «', 'I do not understand «') + o.valor + '» · ') +
        (sug ? T('¿Quisiste decir ', 'Did you mean ') + sug + '? · ' : '') + ayuda());
      return true;
    }
    if (o.accion === 'help') { decir('⌨ ' + ayuda()); return true; }
    if (o.seleccion) { conSeleccion(o, decir); return true; }
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

  // ── /demo interface: recorrido guiado que se ejecuta solo ────────────────
  var PASOS = [
    ['/interface help', 'Así se pide ayuda: el comando y los dispositivos.', 'This is how you ask for help: the command and the devices.', 2600],
    ['/interface 4', 'Terminal 4 aquí mismo: la cuadratura de Neo, Morfeo, Trinity y Oráculo (visor privado con llave).', 'Terminal 4 right here: the Neo, Morph, Trinity and Oracle grid (private keyed viewer).', 6500],
    ['/interface off', 'La cierro con /interface off (o Esc).', 'Closing it with /interface off (or Esc).', 1800],
    ['/interface 2', 'Terminal 2: Smith y Merovingio (Grok), solo dentro del tailnet de Carlos.', 'Terminal 2: Smith and Merovingio (Grok), only inside Carlos\'s tailnet.', 6500],
    ['/interface off', 'Y la cierro. Con dispositivo: /interface 2 Fold, /interface 4 MBP16…', 'And close it. With a device: /interface 2 Fold, /interface 4 MBP16…', 1800],
    // #5707: el 2 con selector (modelo sacado de la presencia real; sin dato = desconocido, fuera de los grupos)
    ['/interface 2 claude', 'Ahora escojo qué 2: los 2 vivos con Claude, por latido más reciente (visor con llave, 2x1).', 'Now I pick which 2: the 2 live agents on Claude, most recent heartbeat first (keyed viewer, 2x1).', 6500],
    ['/interface 2 codex', 'Los 2 vivos con Codex.', 'The 2 live agents on Codex.', 6500],
    ['/interface 2 grok', 'Los 2 con Grok. Si hay menos de 2 vivos con ese modelo, no abre un panel vacío: lo dice y sugiere otra cosa.', 'The 2 on Grok. With fewer than 2 live on that model it never opens an empty panel: it says so and suggests something else.', 6500],
    ['/interface 2 Neo Trinity', 'Por nombre: Neo y Trinity, sin importar mayúsculas ni tildes.', 'By name: Neo and Trinity, case and accents ignored.', 6500],
    ['/interface 2 Neo Cypher', 'Un caso de error: Cypher no tiene panel, así que no hay 2 → mensaje con sugerencias.', 'An error case: Cypher has no panel, so there are no 2 → message with suggestions.', 3500],
    ['/interface off', 'Y la cierro. /interface 2 a secas sigue siendo Smith y Merovingio.', 'And close it. Plain /interface 2 is still Smith and Merovingio.', 1200]
  ];
  var demoEnCurso = null;
  /** demo(decir) — decir(texto, esOrden) escribe en el registro del CLI que la lanzó. */
  function demo(decir) {
    decir = decir || function () {};
    if (demoEnCurso) clearTimeout(demoEnCurso);
    decir('▶ ' + T('Demo /interface · ', 'Demo /interface · ') + PASOS.length + T(' pasos (se ejecutan solos)', ' steps (they run by themselves)'));
    var i = 0;
    function paso() {
      if (i >= PASOS.length) { demoEnCurso = null; decir('✓ ' + T('Fin de la demo /interface.', 'End of the /interface demo.')); try { document.dispatchEvent(new CustomEvent('admira:demo', { detail: { id: 'interface', ok: true } })); } catch (e) {} return; }
      var s = PASOS[i++];
      decir('— ' + i + '/' + PASOS.length + ' · ' + T(s[1], s[2]));
      decir('› ' + s[0], true);
      run(s[0], function (t) { decir(t); });
      demoEnCurso = setTimeout(paso, s[3]);
    }
    paso();
    return PASOS.length;
  }
  var RE_DEMO = /^\/?demo\s+(interface|interfaz|terminal|terminales)\s*$/i;

  // ── Registro en el ⌘ EXPERTO · CLI de la suite (www.admiranext.com/suite/experto.js) ──
  function li(log, t, cls) {
    if (!log || !root.document) return;
    String(t).split('\n').forEach(function (l) { var e = document.createElement('li'); e.className = cls || ''; e.textContent = l; log.appendChild(e); });
    log.scrollTop = log.scrollHeight;
  }
  function registrarExperto() {
    var E = root.AdmiraExperto;
    if (!E || typeof E.verb !== 'function') return false;
    if (E.has && E.has('interface')) return true;
    E.verb({ name: 'interface', alias: ['interfaz'], args: '[terminal] 4|2|6 [dispositivo] · 2 claude|codex|grok · 2 <agente> <agente> · off [dispositivo] · help',
      desc: ['terminales en vivo de los deepagents: 4 = Neo·Morfeo·Trinity·Oráculo, 2 = Smith·Merovingio, 6 = los seis; 2 claude|codex|grok = los 2 vivos de ese modelo; 2 Neo Trinity = esos dos; sin dispositivo aquí, o Fold/Iphone/Air/MBP16/MBP14 · /demo interface',
             'live deepagent terminals: 4 = Neo·Morph·Trinity·Oracle, 2 = Smith·Merovingio, 6 = all six; 2 claude|codex|grok = the 2 live on that model; 2 Neo Trinity = those two; no device = here, or Fold/Iphone/Air/MBP16/MBP14 · /demo interface'],
      run: function (parts, log) { run('/interface ' + (parts || []).join(' '), function (t) { li(log, t, /^⚠/.test(t) ? 'err' : ''); }); } });
    return true;
  }
  function engancharDemo() {
    // Igual que assets/live-demo-portada.js: se captura el submit del CLI antes que la suite.
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      var input = form.querySelector('input, textarea');
      var t = String((input && input.value) || '').trim();
      var log = (form.closest('.ax-cli') || document).querySelector('.ax-cli-out');
      if (RE_DEMO.test(t)) {
        e.preventDefault(); e.stopPropagation();
        if (input) input.value = '';
        li(log, '› ' + t, 'cmd');
        demo(function (x, orden) { li(log, x, orden ? 'cmd' : (/^⚠/.test(x) ? 'err' : '')); });
        return;
      }
      // /demo help: lo contesta assets/cli-ayuda.js (catálogo con fechas, orden reciente/antiguas/alfabético)
    }, true);
  }
  if (root.document) {
    var intentos = 0;
    (function esperar() { if (!registrarExperto() && intentos++ < 120) setTimeout(esperar, 250); })();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', engancharDemo); else engancharDemo();
  }

  var api = { MODELOS: MODELOS, AGENTES: AGENTES, urlSeleccion: urlSeleccion, conSeleccion: conSeleccion, parse: parse, demo: demo, PASOS: PASOS, RE_DEMO: RE_DEMO, registrarExperto: registrarExperto, run: run, ayuda: ayuda, abrirPanel: abrirPanel, cerrarPanel: cerrarPanel, ordenMac: ordenMac, DISPOSITIVOS: DISPOSITIVOS, GRID2_URL: GRID2_URL, GRID4_URL: GRID4_URL, GRID6_URL: GRID6_URL };
  root.AdmiraInterface = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
