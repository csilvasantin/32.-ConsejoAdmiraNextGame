/* assets/interruptores.js — los dos interruptores de cada Mac en admira.live/control (#5862, Jensen por orden de Carlos,
 * 14-10-2026): «Apps» (Claude + ChatGPT/Codex de escritorio) y «CLIs» (sesiones tmux de los deepagents del Mac).
 *   · Cada botón muestra el estado REAL que devuelve el propio Mac (línea «__INTERRUPTOR__ {json}» de
 *     /fleet/interruptor-agentes.sh), pide confirmación antes de apagar y, al pulsarlo, enciende o apaga.
 *   · Lo ejecuta el relay FleetControl por SSH (POST /api/run, login Google + CSRF): la web envía el script de
 *     /fleet/interruptor-agentes.sh en base64, así que no hay nada que instalar en cada Mac.
 *   · Con los CLIs encendidos, sus ventanas ocupan el sitio que tenían las apps (lo guarda «apagar apps»).
 *   · /demo/interruptores/ monta lo mismo sin login ni SSH, con dos Macs simulados.
 * Pura en lo que se prueba (interruptores.test.mjs): html(), parse(), comando() y siguiente().
 *
 * #5867 (complemento, Jensen por orden de Carlos, 14-10-2026): cada equipo tiene DOS MODOS predeterminados.
 *   · Desktop app = uso interactivo de Carlos (Claude y ChatGPT/Codex de escritorio).
 *   · CLI = uso remoto; solo lo usan los consejeros y los agentes (sesiones tmux de los deepagents).
 *   Cada botón se rotula con su modo y lista qué agente está en él: «Morfeo · CLI · MBP16». Los agentes salen de la
 *   presencia viva (bot.yokup.com/api/presence, host app|cli) y, en CLI, también de las sesiones tmux que da el Mac.
 *
 * #5870 (Elon por orden de Carlos, 14-10-2026): cada UNIDAD es su propio botón. «Morfeo · Desktop app · Mac Mini» abre o
 *   cierra solo esa app de escritorio; «Smith · CLI · Mac Mini» arranca o apaga solo ese agente en ese Mac
 *   (apagar/arrancar-agentes.sh <Persona> --_remoto) y el resto sigue igual. Cada fila muestra su estado; los dos
 *   botones generales de arriba siguen encendiendo o apagando todas las unidades de su modo a la vez.
 */
(function (root) {
  'use strict';
  var TIPOS = {
    apps: { nombre: 'Desktop app', host: 'app', titulo: 'Modo Desktop app: uso interactivo de Carlos (Claude + ChatGPT/Codex de escritorio)', on: 'apps-on', off: 'apps-off' },
    clis: { nombre: 'CLI', host: 'cli', titulo: 'Modo CLI: uso remoto, solo consejeros y agentes (sesiones tmux de los deepagents)', on: 'clis-on', off: 'clis-off' }
  };
  var SCRIPT_URL = '/fleet/interruptor-agentes.sh';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Estado de un tipo a partir del JSON del Mac: true | false | null (desconocido). */
  function encendido(st, tipo) { if (!st) return null; var v = st[tipo + '_on']; return typeof v === 'boolean' ? v : null; }

  function detalle(st, tipo) {
    if (!st) return '';
    if (tipo === 'apps') return Object.keys(st.apps || {}).map(function (k) { return k + (st.apps[k] ? ' ●' : ' ○'); }).join(' · ');
    return (st.clis && st.clis.length) ? st.clis.join(' · ') : 'ninguna sesión';
  }

  function clave(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /** Nombre corto del equipo para el rótulo: «MacBook Pro 16» → MBP16, «MacBook Pro Negro 14» → MBP14. */
  function corto(nombre) {
    var n = String(nombre || '').replace(/\s+de\s+Carlos\b/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    var m = /^MacBook\s*(Pro|Air)\s*(.*)$/i.exec(n);
    if (!m) return n;
    var ini = /pro/i.test(m[1]) ? 'MBP' : 'MBA', resto = m[2].trim(), num = /(\d+)\s*$/.exec(resto);
    return num ? ini + num[1] : (resto ? ini + ' ' + resto : ini);
  }

  /** Nombre visible de una persona: la de la presencia si la hay («Oraculo»), si no la sesión tmux con mayúscula. */
  function persona(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  /**
   * Qué agente está en cada modo de un Mac: {apps: [...], clis: [...]}.
   *   presencia: filas de /api/presence de ESTE Mac ya filtradas por frescura ({persona, host: 'app'|'cli'}).
   *   st: estado del Mac; manda sobre la presencia (apps cerradas → nadie en Desktop app aunque haya un latido viejo)
   *       y aporta las sesiones tmux de los CLIs, que existen aunque el agente aún no haya latido.
   */
  function quien(presencia, st) {
    var res = { apps: [], clis: [] }, vistos = { apps: {}, clis: {} };
    function poner(tipo, nombre) {
      var k = clave(nombre); if (!k || vistos[tipo][k]) return;
      vistos[tipo][k] = 1; res[tipo].push(persona(nombre));
    }
    (presencia || []).forEach(function (p) {
      var h = String(p && p.host || '').toLowerCase(), tipo = h === 'app' ? 'apps' : h === 'cli' ? 'clis' : null;
      if (tipo && p.persona) poner(tipo, p.persona);
    });
    if (st && st.clis) st.clis.forEach(function (s) { poner('clis', s); });
    if (encendido(st, 'apps') === false) res.apps = [];
    if (encendido(st, 'clis') === false) res.clis = [];
    res.apps.sort(); res.clis.sort();
    return res;
  }

  /** «Morfeo · CLI · MBP16» por cada agente del modo; vacío si no hay nadie. */
  function rotulos(tipo, agentes, maquina) {
    var maq = corto(maquina);
    return (agentes || []).map(function (a) { return [a, TIPOS[tipo].nombre, maq].filter(Boolean).join(' · '); });
  }

  /** Botón de un tipo. ocupado: texto mientras se ejecuta la orden. ctx: {maquina, presencia} (#5867). */
  function boton(id, tipo, st, ocupado, ctx) {
    var t = TIPOS[tipo], on = encendido(st, tipo);
    var est = ocupado ? 'ocupado' : on === true ? 'on' : on === false ? 'off' : 'nd';
    var rotulo = ocupado ? ocupado : on === true ? 'encendido' : on === false ? 'apagado' : 'estado…';
    var accion = on === true ? 'Apagar' : on === false ? 'Encender' : 'Consultar el estado de';
    var det = detalle(st, tipo);
    ctx = ctx || {};
    var rot = rotulos(tipo, quien(ctx.presencia, st)[tipo], ctx.maquina);
    var linea = rot.length ? rot.join(' / ') : (on === false ? 'nadie' : on === true ? 'sin agente identificado' : '');
    return '<button type="button" class="int-btn int-' + est + '" data-int="' + tipo + '" data-m="' + esc(id) + '"' +
      (ocupado ? ' disabled aria-busy="true"' : '') +
      ' aria-pressed="' + (on === true) + '" title="' + esc(t.titulo + ' · ' + accion + (det ? ' · ' + det : '') + (rot.length ? ' · ' + rot.join(' / ') : '')) + '">' +
      '<span class="int-fila"><span class="int-ico" aria-hidden="true">⏻</span><span class="int-nm">' + t.nombre + '</span>' +
      '<span class="int-st">' + esc(rotulo) + '</span></span>' +
      (linea ? '<span class="int-quien">' + rot.map(function (r) { return '<span class="int-ag">' + esc(r) + '</span>'; }).join('') +
        (rot.length ? '' : '<span class="int-ag int-nadie">' + esc(linea) + '</span>') + '</span>' : '') +
      '</button>';
  }

  /* ---------- #5870: unidades (agente · modo · máquina), cada una con su botón ---------- */
  /** App de escritorio de un runtime de presencia: Claude → Claude; Codex/ChatGPT → la app de Codex que tenga el Mac. */
  function appDeRuntime(runtime, apps) {
    var r = clave(runtime);
    if (r.indexOf('claude') === 0) return 'Claude';
    if (r.indexOf('codex') === 0 || r.indexOf('chatgpt') === 0) return Object.keys(apps || {}).filter(function (k) { return k !== 'Claude'; })[0] || 'Codex';
    return null;
  }

  /**
   * Unidades de un Mac: [{tipo:'app'|'cli', clave, on, agentes, rotulo}].
   *   app: una por app de escritorio (Claude, ChatGPT/Codex); sus agentes salen de la presencia (host app, mismo runtime).
   *   cli: una por agente CLI del Mac (st.agentes_cli del propio Mac; si el Mac aún no lo da, sus sesiones tmux).
   */
  function unidades(st, ctx) {
    ctx = ctx || {};
    var maq = corto(ctx.maquina), res = [];
    if (!st) return res;
    Object.keys(st.apps || {}).forEach(function (app) {
      var ags = [], vistos = {};
      (ctx.presencia || []).forEach(function (p) {
        if (String(p && p.host || '').toLowerCase() !== 'app' || !p.persona || appDeRuntime(p.runtime, st.apps) !== app) return;
        var k = clave(p.persona); if (!vistos[k]) { vistos[k] = 1; ags.push(persona(p.persona)); }
      });
      ags.sort();
      var on = !!st.apps[app];
      res.push({ tipo: 'app', clave: app, on: on, agentes: on ? ags : [],
        rotulo: [(on && ags.length ? ags.join(' / ') : app), 'Desktop app', maq].filter(Boolean).join(' · '), sub: on && ags.length ? app : '' });
    });
    var cli = st.agentes_cli || (st.clis || []).map(function (s) { return { persona: persona(s), on: true, sesiones: [s] }; });
    cli.slice().sort(function (a, b) { return String(a.persona).localeCompare(String(b.persona)); }).forEach(function (a) {
      res.push({ tipo: 'cli', clave: persona(a.persona), on: !!a.on, agentes: [persona(a.persona)],
        rotulo: [persona(a.persona), 'CLI', maq].filter(Boolean).join(' · '), sub: (a.sesiones && a.sesiones.length) ? 'tmux ' + a.sesiones.join(', ') : '' });
    });
    return res;
  }

  function claveUnidad(u) { return 'u:' + u.tipo + ':' + u.clave; }

  /** Orden de una unidad al pulsarla: encendida → apagar, apagada → encender. */
  function siguienteUnidad(u) { return u.tipo + (u.on ? '-off' : '-on'); }

  function botonUnidad(id, u, ocupado) {
    var est = ocupado ? 'ocupado' : u.on ? 'on' : 'off';
    var rotulo = ocupado ? ocupado : u.on ? 'encendido' : 'apagado';
    return '<button type="button" class="int-btn int-u int-' + est + '" data-int="unidad" data-m="' + esc(id) + '" data-u-tipo="' + u.tipo +
      '" data-u="' + esc(u.clave) + '"' + (ocupado ? ' disabled aria-busy="true"' : '') + ' aria-pressed="' + u.on + '"' +
      ' title="' + esc((u.on ? 'Apagar solo ' : 'Encender solo ') + u.rotulo + (u.sub ? ' (' + u.sub + ')' : '') + '. El resto sigue igual.') + '">' +
      '<span class="int-fila"><span class="int-ico" aria-hidden="true">⏻</span><span class="int-nm">' + esc(u.rotulo) + '</span>' +
      '<span class="int-st">' + esc(rotulo) + '</span></span>' + (u.sub ? '<span class="int-sub">' + esc(u.sub) + '</span>' : '') + '</button>';
  }

  /** ctx (#5867): {maquina: nombre del equipo, presencia: filas frescas de /api/presence de ese equipo}. */
  function html(id, st, ocupado, ctx) {
    ocupado = ocupado || {};
    var us = unidades(st, ctx);
    return '<div class="int-bloque" data-int-bloque="' + esc(id) + '">' +
      boton(id, 'apps', st, ocupado.apps, ctx) + boton(id, 'clis', st, ocupado.clis, ctx) +
      (us.length ? '<div class="int-unidades" role="group" aria-label="Cada unidad por separado">' +
        us.map(function (u) { return botonUnidad(id, u, ocupado[claveUnidad(u)]); }).join('') + '</div>' : '') +
      '</div>';
  }

  /** Busca la línea de estado en la salida del Mac. */
  function parse(stdout) {
    var m = /__INTERRUPTOR__ (\{.*\})\s*$/m.exec(String(stdout || ''));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  /** Orden que hay que pedir al pulsar: según el estado conocido, encender, apagar o solo consultar. */
  function siguiente(st, tipo) {
    var on = encendido(st, tipo);
    return on === true ? TIPOS[tipo].off : on === false ? TIPOS[tipo].on : 'estado';
  }

  function b64(txt) {
    var bytes = new TextEncoder().encode(txt), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  /** Comando de shell para /api/run: el script viaja entero en base64 y se ejecuta con la orden. */
  function comando(script, orden, unidad) {
    if (/^(estado|apps-on|apps-off|clis-on|clis-off)$/.test(orden) && unidad == null) return 'echo ' + b64(script) + ' | base64 -D | bash -s ' + orden;
    // #5870: órdenes de una unidad; el argumento solo puede ser un nombre limpio (nada de shell).
    if (typeof unidad !== 'string') throw new Error('orden no válida: ' + orden);
    if (/^app-(on|off)$/.test(orden) && /^(Claude|ChatGPT|Codex)$/.test(unidad)) return 'echo ' + b64(script) + ' | base64 -D | bash -s ' + orden + ' ' + unidad;
    if (/^cli-(on|off)$/.test(orden) && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(unidad)) return 'echo ' + b64(script) + ' | base64 -D | bash -s ' + orden + ' ' + unidad;
    throw new Error('orden no válida: ' + orden + (unidad != null ? ' ' + unidad : ''));
  }

  var _script = null;
  function script() {
    if (_script) return Promise.resolve(_script);
    return fetch(SCRIPT_URL + '?v=' + (root.INTERRUPTORES_VER || Date.now()), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { if (t.indexOf('__INTERRUPTOR__') < 0) throw new Error('script inesperado'); _script = t; return t; });
  }

  function confirmacion(nombreMaq, tipo, st) {
    if (tipo === 'apps') return '¿Apagar el modo Desktop app de «' + nombreMaq + '»?\n\n' + detalle(st, 'apps') +
      '\n\nSe cierran Claude y ChatGPT/Codex en ese Mac (se guarda el sitio de sus ventanas para los CLIs).';
    return '¿Apagar el modo CLI (deepagents) de «' + nombreMaq + '»?\n\nSesiones: ' + detalle(st, 'clis') +
      '\n\nApagado ordenado (apagar-agentes.sh todos): si un agente está a media misión, se interrumpe; sus encargos quedan pendientes. Vuelven con este mismo botón.';
  }

  /** #5870: confirmación de apagar UNA unidad. */
  function confirmacionUnidad(u) {
    if (u.tipo === 'app') return '¿Cerrar solo «' + u.rotulo + '»?\n\nSe cierra ' + u.clave + ' de escritorio en ese Mac. Las otras apps y los CLIs siguen igual.';
    return '¿Apagar solo «' + u.rotulo + '»?\n\nApagado ordenado de ese agente (apagar-agentes.sh ' + u.clave + '): si está a media misión, se interrumpe y sus encargos quedan pendientes. Los demás agentes y las apps siguen igual. Vuelve con este mismo botón.';
  }

  /* ---------- /demo/interruptores/: dos Macs simulados, sin login ni SSH ---------- */
  function mountDemo(el, opts) {
    opts = opts || {};
    var macs = [
      { id: 'macmini', name: 'Mac Mini', st: { apps: { Claude: true, ChatGPT: true }, apps_on: true, clis: ['niobe', 'smith'], clis_on: true,
          agentes_cli: [{ persona: 'Niobe', on: true, sesiones: ['niobe'] }, { persona: 'Smith', on: true, sesiones: ['smith'] }, { persona: 'Morfeo', on: false, sesiones: [] }] },
        presencia: [{ persona: 'Morfeo', host: 'app', runtime: 'Claude' }, { persona: 'Oraculo', host: 'app', runtime: 'Codex' }] },
      { id: 'macbookpro16', name: 'MacBook Pro 16', st: { apps: { Claude: false, ChatGPT: false }, apps_on: false, clis: ['morfeo', 'smith'], clis_on: true,
          agentes_cli: [{ persona: 'Morfeo', on: true, sesiones: ['morfeo'] }, { persona: 'Smith', on: true, sesiones: ['smith'] }, { persona: 'Neo', on: false, sesiones: [] }] },
        presencia: [{ persona: 'Neo', host: 'app', runtime: 'Claude' }] }
    ];
    // Recalcula los totales del Mac a partir de sus unidades (como hace el estado real del Mac).
    function sync(st) {
      st.apps_on = Object.keys(st.apps).some(function (k) { return st.apps[k]; });
      st.clis = st.agentes_cli.filter(function (a) { return a.on; }).map(function (a) { a.sesiones = [a.persona.toLowerCase()]; return a.persona.toLowerCase(); });
      st.agentes_cli.forEach(function (a) { if (!a.on) a.sesiones = []; });
      st.clis_on = st.clis.length > 0;
    }
    var ocup = {};
    function pintar() {
      el.innerHTML = macs.map(function (m) {
        return '<div class="int-card"><div class="int-cabeza"><b>' + esc(m.name) + '</b><span class="int-demo">demo</span></div>' +
          '<div class="int-pantalla">' + pantalla(m.st) + '</div>' +
          '<div class="acts int-acts"><button type="button" class="int-fake" disabled>🖥️ control remoto</button><button type="button" class="int-fake" disabled>🖳 terminal</button>' +
          html(m.id, m.st, ocup[m.id], { maquina: m.name, presencia: m.presencia }) + '</div></div>';
      }).join('');
    }
    function pantalla(st) {
      var cajas = [];
      Object.keys(st.apps).forEach(function (k) { if (st.apps[k]) cajas.push('<span class="int-win int-app">Desktop app · ' + k + '</span>'); });
      st.clis.forEach(function (s) { cajas.push('<span class="int-win int-cli">CLI · ' + esc(persona(s)) + '</span>'); });
      return cajas.length ? cajas.join('') : '<span class="int-vacio">escritorio libre</span>';
    }
    function ejecutar(m, tipo, sinPreguntar) {
      var orden = siguiente(m.st, tipo);
      if (/-off$/.test(orden) && !sinPreguntar && !root.confirm(confirmacion(m.name + ' (demo)', tipo, m.st))) return Promise.resolve();
      ocup[m.id] = {}; ocup[m.id][tipo] = /-off$/.test(orden) ? 'apagando…' : 'encendiendo…'; pintar();
      return new Promise(function (ok) {
        setTimeout(function () {
          var on = /-on$/.test(orden);
          if (tipo === 'apps') Object.keys(m.st.apps).forEach(function (k) { m.st.apps[k] = on; });
          else m.st.agentes_cli.forEach(function (a) { a.on = on; });
          sync(m.st); delete ocup[m.id]; pintar(); ok();
        }, opts.ms || 1100);
      });
    }
    // #5870: una sola unidad; las demás no se tocan.
    function ejecutarUnidad(m, tipo, clv, sinPreguntar) {
      var u = unidades(m.st, { maquina: m.name, presencia: m.presencia }).filter(function (x) { return x.tipo === tipo && x.clave === clv; })[0];
      if (!u) return Promise.resolve();
      if (u.on && !sinPreguntar && !root.confirm(confirmacionUnidad(u))) return Promise.resolve();
      ocup[m.id] = {}; ocup[m.id][claveUnidad(u)] = u.on ? 'apagando…' : 'encendiendo…'; pintar();
      return new Promise(function (ok) {
        setTimeout(function () {
          if (tipo === 'app') m.st.apps[clv] = !u.on;
          else m.st.agentes_cli.forEach(function (a) { if (a.persona === clv) a.on = !u.on; });
          sync(m.st); delete ocup[m.id]; pintar(); ok();
        }, opts.ms || 1100);
      });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-int]'); if (!b || b.disabled) return;
      var m = macs.filter(function (x) { return x.id === b.getAttribute('data-m'); })[0];
      if (!m) return;
      if (b.getAttribute('data-int') === 'unidad') ejecutarUnidad(m, b.getAttribute('data-u-tipo'), b.getAttribute('data-u'));
      else ejecutar(m, b.getAttribute('data-int'));
    });
    pintar();
    // Recorrido automático: unidades sueltas (#5870) y los botones generales (#5862) de los dos Macs.
    function recorrido(decir) {
      decir = decir || function () {};
      var mini = macs[0], mbp = macs[1], paso = function (t, f) { return function () { decir(t); return f(); }; };
      var p = Promise.resolve();
      [
        paso('Mac Mini: «Morfeo · Desktop app · Mac Mini» cierra solo Claude; ChatGPT (Oraculo) sigue abierto', function () { return ejecutarUnidad(mini, 'app', 'Claude', true).then(function () { return ejecutarUnidad(mini, 'app', 'Claude', true); }); }),
        paso('Mac Mini: Desktop app encendido (Morfeo y Oraculo) → ⏻ Desktop app lo apaga (pide confirmación)', function () { return ejecutar(mini, 'apps', true); }),
        paso('Mac Mini: modo CLI apagado primero, para verlo volver', function () { mini.st.agentes_cli.forEach(function (a) { a.on = false; }); sync(mini.st); pintar(); return new Promise(function (r) { setTimeout(r, 600); }); }),
        paso('Mac Mini: el botón general ⏻ CLI enciende todos sus agentes CLI en el sitio que tenía el Desktop app', function () { return ejecutar(mini, 'clis', true); }),
        paso('MacBook Pro 16: pulsar solo «Morfeo · CLI · MBP16» apaga ese Morfeo; Smith sigue encendido', function () { return ejecutarUnidad(mbp, 'cli', 'Morfeo', true); }),
        paso('MacBook Pro 16: el mismo botón vuelve a encender solo a Morfeo', function () { return ejecutarUnidad(mbp, 'cli', 'Morfeo', true); }),
        paso('MacBook Pro 16: el botón general ⏻ CLI apaga todos sus agentes CLI a la vez, y vuelve', function () { return ejecutar(mbp, 'clis', true).then(function () { return ejecutar(mbp, 'clis', true); }); }),
        paso('MacBook Pro 16: ⏻ Desktop app lo abre sin robar el foco (Neo · Desktop app · MBP16)', function () { return ejecutar(mbp, 'apps', true); }),
        paso('Fin de la demo · en /control cada unidad muestra su estado real y se enciende o apaga sola', function () {})
      ].forEach(function (f) { p = p.then(f); });
      return p;
    }
    return { recorrido: recorrido, macs: macs };
  }

  root.AdmiraInterruptores = {
    version: '2', TIPOS: TIPOS, html: html, parse: parse, siguiente: siguiente, comando: comando,
    script: script, confirmacion: confirmacion, encendido: encendido, detalle: detalle, mountDemo: mountDemo,
    quien: quien, rotulos: rotulos, corto: corto,
    unidades: unidades, siguienteUnidad: siguienteUnidad, claveUnidad: claveUnidad, confirmacionUnidad: confirmacionUnidad
  };
})(typeof window !== 'undefined' ? window : globalThis);
