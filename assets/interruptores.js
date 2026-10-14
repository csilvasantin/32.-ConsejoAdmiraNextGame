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

  /** ctx (#5867): {maquina: nombre del equipo, presencia: filas frescas de /api/presence de ese equipo}. */
  function html(id, st, ocupado, ctx) {
    ocupado = ocupado || {};
    return boton(id, 'apps', st, ocupado.apps, ctx) + boton(id, 'clis', st, ocupado.clis, ctx);
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
  function comando(script, orden) {
    if (!/^(estado|apps-on|apps-off|clis-on|clis-off)$/.test(orden)) throw new Error('orden no válida: ' + orden);
    return 'echo ' + b64(script) + ' | base64 -D | bash -s ' + orden;
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

  /* ---------- /demo/interruptores/: dos Macs simulados, sin login ni SSH ---------- */
  function mountDemo(el, opts) {
    opts = opts || {};
    var macs = [
      { id: 'macmini', name: 'Mac Mini', st: { apps: { Claude: true, ChatGPT: true }, apps_on: true, clis: ['niobe', 'smith'], clis_on: true },
        presencia: [{ persona: 'Morfeo', host: 'app' }, { persona: 'Oraculo', host: 'app' }] },
      { id: 'macbookpro16', name: 'MacBook Pro 16', st: { apps: { Claude: false, ChatGPT: false }, apps_on: false, clis: ['morfeo', 'smith'], clis_on: true },
        presencia: [{ persona: 'Neo', host: 'app' }] }
    ];
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
      if (st.apps_on) Object.keys(st.apps).forEach(function (k) { if (st.apps[k]) cajas.push('<span class="int-win int-app">Desktop app · ' + k + '</span>'); });
      else if (st.clis_on) st.clis.forEach(function (s) { cajas.push('<span class="int-win int-cli">CLI · ' + esc(persona(s)) + '</span>'); });
      return cajas.length ? cajas.join('') : '<span class="int-vacio">escritorio libre</span>';
    }
    function ejecutar(m, tipo, sinPreguntar) {
      var orden = siguiente(m.st, tipo);
      if (/-off$/.test(orden) && !sinPreguntar && !root.confirm(confirmacion(m.name + ' (demo)', tipo, m.st))) return Promise.resolve();
      ocup[m.id] = {}; ocup[m.id][tipo] = /-off$/.test(orden) ? 'apagando…' : 'encendiendo…'; pintar();
      return new Promise(function (ok) {
        setTimeout(function () {
          var on = /-on$/.test(orden);
          if (tipo === 'apps') { Object.keys(m.st.apps).forEach(function (k) { m.st.apps[k] = on; }); m.st.apps_on = on; }
          else { m.st.clis_on = on; if (on && !m.st.clis.length) m.st.clis = ['neo', 'morfeo']; }
          delete ocup[m.id]; pintar(); ok();
        }, opts.ms || 1100);
      });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-int]'); if (!b || b.disabled) return;
      var m = macs.filter(function (x) { return x.id === b.getAttribute('data-m'); })[0];
      if (m) ejecutar(m, b.getAttribute('data-int'));
    });
    pintar();
    // Recorrido automático: Mac Mini apaga apps → enciende CLIs en su sitio; MBP16 apaga CLIs → los enciende.
    function recorrido(decir) {
      decir = decir || function () {};
      var mini = macs[0], mbp = macs[1], paso = function (t, f) { return function () { decir(t); return f(); }; };
      var p = Promise.resolve();
      [
        paso('Mac Mini: Desktop app encendido (Morfeo y Oraculo) → ⏻ Desktop app lo apaga (pide confirmación)', function () { return ejecutar(mini, 'apps', true); }),
        paso('Mac Mini: modo CLI apagado primero, para verlo volver', function () { mini.st.clis_on = false; pintar(); return new Promise(function (r) { setTimeout(r, 600); }); }),
        paso('Mac Mini: ⏻ CLI enciende Niobe y Smith en el sitio que tenía el Desktop app', function () { return ejecutar(mini, 'clis', true); }),
        paso('MacBook Pro 16: ⏻ CLI (Morfeo · CLI · MBP16) se apaga con confirmación y vuelve', function () { return ejecutar(mbp, 'clis', true).then(function () { return ejecutar(mbp, 'clis', true); }); }),
        paso('MacBook Pro 16: ⏻ Desktop app lo abre sin robar el foco (Neo · Desktop app · MBP16)', function () { return ejecutar(mbp, 'apps', true); }),
        paso('Fin de la demo · en /control cada botón muestra el estado real del Mac y quién está en cada modo', function () {})
      ].forEach(function (f) { p = p.then(f); });
      return p;
    }
    return { recorrido: recorrido, macs: macs };
  }

  root.AdmiraInterruptores = {
    version: '1', TIPOS: TIPOS, html: html, parse: parse, siguiente: siguiente, comando: comando,
    script: script, confirmacion: confirmacion, encendido: encendido, detalle: detalle, mountDemo: mountDemo,
    quien: quien, rotulos: rotulos, corto: corto
  };
})(typeof window !== 'undefined' ? window : globalThis);
