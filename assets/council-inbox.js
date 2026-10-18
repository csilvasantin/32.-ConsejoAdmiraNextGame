/* Bandeja de conversaciones con consejeros (UX tipo GrokBot) — SOLO con ?chat=1 en la home.
 * Pasos 1 y 2 del plan «woz/ux-chat-inbox»:
 *   1. Lista a la izquierda: avatar/inicial, nombre + rol, hora, fragmento del último mensaje, LED de señal y
 *      punto de no leído. Datos: ChatHiloClient.PERSONAS + placas (#nameplates), estado público de
 *      GET /api/chat/salud?persona= y GET /api/flota/trabajando cada 10 s. Los consejeros sin hilo salen en gris.
 *   2. Hilo persistente a la derecha: al elegir un consejero se carga leerHilo(persona,{limite:60}) y se pinta con
 *      CouncilGrokBot (renderShared/sharedSend, opción historyMode), con caja fija abajo y botón Enviar.
 *      Sin sesión de Google se muestra «Entrar con Google» (nada falla en silencio).
 * Script clásico (window.CouncilInbox). Las funciones puras se prueban con node:test (council-inbox.test.mjs).
 * No toca el backend ni escribe nada: lee salud/flota (públicos) y el hilo (con el ID token de Google del usuario). */
(function (root) {
  'use strict';

  var CADA_MS = 10000;
  var LIMITE = 60;
  var VISTOS_CLAVE = 'council-inbox-vistos';

  // Cargo corto por consejero (mismos CEO/CTO/… que las placas de app.flt-100529.js · NAMEPLATE_POS).
  var ROLES = {
    'Steve Jobs': 'CEO', 'Steve Wozniak': 'CTO', 'Tim Cook': 'COO', 'Warren Buffett': 'CFO',
    'Walt Disney': 'CCO', 'Dieter Rams': 'CDO', 'Howard Schultz': 'CXO', 'George Lucas': 'CSO',
    'Elon Musk': 'CEO', 'Jensen Huang': 'CTO', 'Gwynne Shotwell': 'COO', 'Ruth Porat': 'CFO',
    'John Lasseter': 'CCO', 'Jony Ive': 'CDO', 'Carlos Ratti': 'CXO', 'Ryan Reynolds': 'CSO'
  };
  var COLORES = ['#6fb3ff', '#b6e36a', '#ffd98a', '#ff8fc4', '#c9c9d6', '#7fe0c0', '#c4a7ff', '#f0b46a'];

  // ── Lógica pura ─────────────────────────────────────────────────────────────
  function iniciales(nombre) {
    var p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function colorDe(nombre) {
    var h = 0, s = String(nombre || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return COLORES[h % COLORES.length];
  }
  // Tarjeta de /api/flota/trabajando de un consejero: se casa por apellido, solo entre las tarjetas de consejero
  // (misma regla que assets/consejo-rotulo.js).
  function tarjetaDe(nombre, tarjetas) {
    var apellido = String(nombre || '').trim().split(/\s+/).pop().toLowerCase();
    var ts = Array.isArray(tarjetas) ? tarjetas : [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (!t || !(t.consejero || t.grupo === 'consejeros')) continue;
      if (String(t.agente || '').toLowerCase() === apellido) return t;
    }
    return null;
  }
  // LED de señal. Prioridad: aviso (mensaje de Carlos sin respuesta > avisoTrasMin) > estado de la flota > sin dato.
  //  verde  = trabajando · ambar = con Carlos · aviso = sin respuesta a tiempo · gris = parado/sin latido · nd = sin dato
  function led(tarjeta, salud) {
    if (salud && salud.estado === 'aviso') {
      var m = salud.pendiente && salud.pendiente.minutos;
      return { clase: 'aviso', texto: 'sin respuesta' + (m != null ? ' desde hace ' + m + ' min' : '') };
    }
    if (tarjeta) {
      var motivo = tarjeta.motivo ? ' · ' + tarjeta.motivo : '';
      if (tarjeta.estado === 'verde') return { clase: 'verde', texto: 'trabajando' + motivo };
      if (tarjeta.estado === 'amarillo') return { clase: 'ambar', texto: 'con Carlos' + motivo };
      return { clase: 'gris', texto: (tarjeta.motivo || 'parado') };
    }
    return { clase: 'nd', texto: 'sin datos de señal' };
  }
  function esDia(a, b, tz) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(a) === f.format(b);
  }
  // Hora estilo mensajería, en Europe/Madrid: «10:02» hoy · «ayer» · «lun» (< 7 días) · «9 oct».
  function hora(ts, ahora) {
    var t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!isFinite(t)) return '';
    var tz = 'Europe/Madrid', d = new Date(t), n = new Date(ahora == null ? Date.now() : ahora);
    if (esDia(d, n, tz)) return new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    if (esDia(d, new Date(n.getTime() - 86400000), tz)) return 'ayer';
    var dias = (n.getTime() - t) / 86400000;
    if (dias >= 0 && dias < 7) return new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'short' }).format(d).replace('.', '');
    return new Intl.DateTimeFormat('es-ES', { timeZone: tz, day: 'numeric', month: 'short' }).format(d).replace('.', '');
  }
  function fragmento(turno, max) {
    if (!turno || !turno.texto) return '';
    var s = String(turno.texto).replace(/\s+/g, ' ').trim();
    max = max || 72;
    if (s.length > max) s = s.slice(0, max - 1).replace(/\s+$/, '') + '…';
    return (turno.rol === 'carlos' ? 'Tú: ' : '') + s;
  }
  // No leído: la última actividad es del consejero (no tuya) y es posterior a lo último que viste en este navegador.
  function sinLeer(ultimo, visto) {
    if (!ultimo || !ultimo.ts || ultimo.rol === 'carlos') return false;
    var t = Date.parse(ultimo.ts);
    return isFinite(t) && t > (Number(visto) || 0);
  }
  // Texto de la fila cuando no hay fragmento real. Siempre dice por qué.
  function lineaVacia(tieneHilo, salud, haySesion, ahora) {
    if (!tieneHilo) return 'Sin hilo todavía: este consejero aún no tiene silla en GrokBot.';
    if (!salud) return 'Estado del hilo no disponible ahora.';
    if (!salud.ultimo) return 'Sin mensajes todavía · escribe para empezar.';
    var quien = salud.ultimo.rol === 'carlos' ? 'Tu último mensaje' : 'Última respuesta';
    return quien + ' · ' + hora(salud.ultimo.ts, ahora) + (haySesion ? '' : ' · entra con Google para leerlo');
  }
  // Lista: primero los consejeros con hilo (más reciente arriba), después los que no tienen (gris).
  function ordenar(items) {
    var con = items.filter(function (i) { return i.persona; });
    var sin = items.filter(function (i) { return !i.persona; });
    con.sort(function (a, b) {
      var ta = a.salud && a.salud.ultimo ? Date.parse(a.salud.ultimo.ts) || 0 : 0;
      var tb = b.salud && b.salud.ultimo ? Date.parse(b.salud.ultimo.ts) || 0 : 0;
      return tb - ta || a.orden - b.orden;
    });
    return { con: con, sin: sin };
  }
  // Nombres: placas de la generación visible primero, luego el resto de PERSONAS (todos los que tienen hilo).
  function nombres(placas, personas) {
    var vistos = {}, out = [];
    (placas || []).concat(Object.keys(personas || {})).forEach(function (n) { if (n && !vistos[n]) { vistos[n] = 1; out.push(n); } });
    return out;
  }

  // ── Almacén de «visto» (localStorage; si no hay, memoria) ───────────────────
  function leerVistos(st) {
    try { var d = JSON.parse((st && st.getItem(VISTOS_CLAVE)) || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (e) { return {}; }
  }
  function guardarVistos(st, v) { try { st && st.setItem(VISTOS_CLAVE, JSON.stringify(v)); } catch (e) {} }

  // ── Montaje ─────────────────────────────────────────────────────────────────
  function mount(opts) {
    opts = opts || {};
    var doc = opts.document || root.document;
    var hilo = opts.hilo || root.ChatHiloClient;
    var Grok = opts.grokbot || root.CouncilGrokBot;
    var Composer = opts.composer || root.CouncilComposer;
    var f = opts.fetch || (root.fetch && root.fetch.bind(root));
    var base = opts.base || '';
    if (!doc || !hilo || !hilo.PERSONAS || !f) return null;
    var storage = null; try { storage = root.localStorage; } catch (e) {}
    var vistos = leerVistos(storage);

    var salud = {};        // persona → respuesta de /api/chat/salud (o null si falló)
    var flota = null;      // respuesta de /api/flota/trabajando
    var previews = {};     // persona → último turno (solo con sesión)
    var previewTs = {};    // persona → ultimo.ts con el que se pidió la vista previa
    var selected = null, destruido = false, timer = null, ticking = false;
    var drafts = {};
    var ahora = function () { return Date.now(); };

    // DOM
    var host = opts.host || doc.querySelector('.stage-row');
    if (!host) return null;
    var sec = doc.createElement('section');
    sec.id = 'council-inbox'; sec.className = 'ci'; sec.setAttribute('aria-label', 'Conversaciones con consejeros');
    sec.innerHTML =
      '<aside class="ci__list" aria-label="Consejeros"><div class="ci__head"><span>CONSEJEROS</span><span class="ci__sello" data-ci-sello></span></div><div class="ci__scroll" data-ci-lista></div></aside>' +
      '<div class="ci__thread"><header class="ci__thead" hidden><button type="button" class="ci__back" data-ci-back aria-label="Volver a la lista">◀</button><span class="ci__av ci__av--lg" data-ci-tav></span><span class="ci__tname"><b data-ci-tnombre></b><i data-ci-trol></i><small data-ci-tled></small></span></header>' +
      '<div class="ci__host" data-ci-host><p class="ci__empty" data-ci-empty>Elige un consejero de la lista para ver su conversación.</p></div></div>';
    host.insertAdjacentElement('afterend', sec);
    doc.body.classList.add('ci-on');
    var $ = function (s) { return sec.querySelector(s); };
    var listaEl = $('[data-ci-lista]'), selloEl = $('[data-ci-sello]'), thead = $('.ci__thead'), hostEl = $('[data-ci-host]'), emptyEl = $('[data-ci-empty]');

    function placas() {
      var out = [], np = doc.getElementById('nameplates');
      if (np) np.querySelectorAll('.np[data-persona]').forEach(function (n) { out.push(n.getAttribute('data-persona')); });
      return out;
    }
    function items() {
      return nombres(placas(), hilo.PERSONAS).map(function (n, i) {
        var p = hilo.personaDe ? hilo.personaDe(n) : (hilo.PERSONAS[n] || null);
        return { nombre: n, persona: p, rol: ROLES[n] || '', orden: i, salud: p ? salud[p] || null : null, tarjeta: tarjetaDe(n, flota && flota.tarjetas) };
      });
    }
    function avatar(span, it) {
      span.textContent = iniciales(it.nombre);
      span.style.setProperty('--c', colorDe(it.nombre));
      if (it.persona) {
        var img = doc.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = '/avatars/' + it.persona + '.jpg';
        img.addEventListener('error', function () { img.remove(); });
        span.append(img);
      }
    }
    function fila(it) {
      var b = doc.createElement('button'); b.type = 'button';
      b.className = 'ci__item' + (it.persona ? '' : ' ci__item--sin') + (selected === it.nombre ? ' is-sel' : '');
      b.setAttribute('data-persona', it.nombre);
      if (selected === it.nombre) b.setAttribute('aria-current', 'true');
      var av = doc.createElement('span'); av.className = 'ci__av'; avatar(av, it);
      var l = led(it.tarjeta, it.salud);
      var lamp = doc.createElement('i'); lamp.className = 'ci__led ci__led--' + (it.persona ? l.clase : 'nd'); lamp.title = it.persona ? 'Señal: ' + l.texto : 'Sin hilo: sin señal de chat';
      av.append(lamp);
      var txt = doc.createElement('span'); txt.className = 'ci__txt';
      var top = doc.createElement('span'); top.className = 'ci__top';
      var nm = doc.createElement('b'); nm.textContent = it.nombre;
      var rl = doc.createElement('i'); rl.textContent = it.rol;
      top.append(nm, rl);
      var prev = doc.createElement('span'); prev.className = 'ci__prev';
      var pv = it.persona ? previews[it.persona] : null;
      var typing = it.persona && it.salud && it.salud.pendiente && it.salud.estado !== 'aviso';
      var ult = it.salud && it.salud.ultimo ? it.salud.ultimo.ts : (pv && pv.ts);
      if (typing) { prev.textContent = it.nombre.split(' ').pop() + ' está escribiendo…'; prev.classList.add('ci__prev--typing'); }
      else if (pv) prev.textContent = fragmento(pv);
      else prev.textContent = lineaVacia(!!it.persona, it.salud, !!hilo.credencial(), ahora());
      var side = doc.createElement('span'); side.className = 'ci__side';
      var tm = doc.createElement('time'); tm.textContent = it.persona && ult ? hora(ult, ahora()) : '';
      side.append(tm);
      if (it.persona && it.salud && sinLeer(it.salud.ultimo, vistos[it.persona]) && selected !== it.nombre) {
        var dot = doc.createElement('em'); dot.className = 'ci__dot'; dot.title = 'Mensaje sin leer'; dot.setAttribute('aria-label', 'Mensaje sin leer'); side.append(dot);
      }
      txt.append(top, prev); b.append(av, txt, side);
      b.addEventListener('click', function () { select(it.nombre); });
      return b;
    }
    function pintarLista() {
      if (destruido) return;
      var o = ordenar(items());
      var scroll = listaEl.scrollTop;
      listaEl.replaceChildren();
      var mk = function (t, n) { var h = doc.createElement('div'); h.className = 'ci__grp'; h.textContent = t; var c = doc.createElement('span'); c.textContent = n; h.append(c); return h; };
      listaEl.append(mk('CON HILO', o.con.length));
      o.con.forEach(function (it) { listaEl.append(fila(it)); });
      if (o.sin.length) {
        listaEl.append(mk('SIN HILO', o.sin.length));
        o.sin.forEach(function (it) { listaEl.append(fila(it)); });
      }
      listaEl.scrollTop = scroll;
      var ok = Object.keys(salud).filter(function (k) { return salud[k]; }).length;
      selloEl.textContent = (flota || ok) ? 'señal ' + new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) : 'sin señal';
      selloEl.title = 'Estado: /api/chat/salud + /api/flota/trabajando · cada ' + (CADA_MS / 1000) + ' s';
      pintarCabecera();
    }
    function pintarCabecera() {
      var it = items().filter(function (x) { return x.nombre === selected; })[0];
      thead.hidden = !it;
      if (!it) return;
      var av = $('[data-ci-tav]'); av.replaceChildren(); avatar(av, it);
      $('[data-ci-tnombre]').textContent = it.nombre; $('[data-ci-trol]').textContent = it.rol;
      var l = led(it.tarjeta, it.salud), el = $('[data-ci-tled]');
      el.textContent = it.persona ? '● ' + l.texto : '● sin hilo';
      el.className = 'ci__tled ci__tled--' + (it.persona ? l.clase : 'nd');
    }

    // Hilo (CouncilGrokBot en modo historyMode) + compositor fijo abajo.
    var bridge = null, composer = null;
    function syncComposer(pending) {
      if (!composer) return;
      composer.update({ persona: selected && hilo.personaDe(selected) ? selected : null, value: selected ? drafts[selected] || '' : '', pending: !!pending });
    }
    function marcarVisto(persona, ts) {
      var t = typeof ts === 'number' ? ts : Date.parse(ts);
      if (!persona || !isFinite(t)) return;
      if (t > (Number(vistos[persona]) || 0)) { vistos[persona] = t; guardarVistos(storage, vistos); }
    }
    function montarHilo() {
      if (bridge || !Grok) return;
      bridge = Grok.mount({
        container: hostEl, mountInside: true, historyMode: true, fetch: f,
        csrf: function () { return (root.admiraGateCsrf && root.admiraGateCsrf()) || ''; },
        onSelect: function () {},
        onPendingChange: function (e) { syncComposer(e && e.pending); },
        onAuthReady: function () { previews = {}; previewTs = {}; tick(); },
        onThread: function (e) {
          var ts = e.turnos || [], ult = ts.length ? ts[ts.length - 1] : null, p = hilo.personaDe(e.persona);
          if (!p || !ult) return;
          previews[p] = ult; previewTs[p] = ult.ts;
          var ultResp = ts.filter(function (t) { return t.rol !== 'carlos'; }).pop();
          if (ultResp && selected === e.persona) marcarVisto(p, ultResp.ts);
          pintarLista();
        }
      });
      var chat = hostEl.querySelector('.council-chat');
      if (chat && Composer) {
        composer = Composer.mount({
          container: chat,
          onInput: function (v) { if (selected) drafts[selected] = v; },
          onSend: function (text) {
            var name = selected, t = String(text || '').trim();
            if (!name || !t || !bridge) return;
            bridge.send(name, t).then(function (ok) { if (ok) { drafts[name] = ''; if (selected === name) syncComposer(false); } });
          },
          // En este modo el hilo solo admite texto: se avisa en vez de ignorar el pegado.
          onPasteImage: function () { var s = hostEl.querySelector('.council-chat__status'); if (s) s.textContent = 'En la bandeja el envío es solo texto por ahora (imágenes: en el panel Conversación).'; return Promise.resolve(null); }
        });
        syncComposer(false);
      }
    }
    function sinHilo(it) {
      var p = hostEl.querySelector('.ci__nohilo');
      if (!p) { p = doc.createElement('div'); p.className = 'ci__nohilo'; hostEl.append(p); }
      p.hidden = !it; if (!it) return;
      p.replaceChildren();
      var t = doc.createElement('b'); t.textContent = it.nombre + ' no tiene hilo de conversación todavía';
      var d = doc.createElement('p'); d.textContent = 'Solo los consejeros con silla en GrokBot (' + Object.keys(hilo.PERSONAS).join(', ') + ') tienen hilo compartido. No puedes escribirle desde aquí; cuando se cree su silla aparecerá en «Con hilo».';
      p.append(t, d);
    }
    function select(nombre) {
      if (destruido) return;
      if (nombre && selected === nombre) { sec.classList.add('ci--thread'); return; }
      selected = nombre || null;
      sec.classList.toggle('ci--thread', !!selected);
      var p = selected && hilo.personaDe ? hilo.personaDe(selected) : null;
      emptyEl.hidden = !!selected;
      montarHilo();
      var chat = hostEl.querySelector('.council-chat');
      if (selected && p) {
        sinHilo(null); if (chat) chat.hidden = false;
        var s = salud[p]; if (s && s.ultimo && s.ultimo.rol !== 'carlos') marcarVisto(p, s.ultimo.ts);
        syncComposer(false);
        if (bridge) bridge.select(selected);
      } else {
        if (bridge) bridge.select(null);
        if (chat) chat.hidden = true;
        sinHilo(selected ? items().filter(function (x) { return x.nombre === selected; })[0] : null);
      }
      pintarLista();
    }
    $('[data-ci-back]').addEventListener('click', function () { sec.classList.remove('ci--thread'); });

    // Sondeo de estado.
    function json(url) {
      return f(base + url, { cache: 'no-store', headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function tick() {
      if (destruido || ticking) return Promise.resolve();
      ticking = true;
      var ps = Object.keys(hilo.PERSONAS).map(function (n) { return hilo.PERSONAS[n]; });
      return Promise.all([json('/api/flota/trabajando')].concat(ps.map(function (p) { return json('/api/chat/salud?persona=' + encodeURIComponent(p)); })))
        .then(function (r) {
          if (destruido) return;
          if (r[0] && r[0].ok) flota = r[0];
          ps.forEach(function (p, i) { salud[p] = r[i + 1] && r[i + 1].ok ? r[i + 1] : null; });
          // Vista previa (fragmento del último mensaje): solo con sesión; solo si cambió el último turno.
          var jobs = [];
          if (hilo.credencial()) ps.forEach(function (p) {
            var s = salud[p];
            if (!s || !s.ultimo) return;
            if (previews[p] && previewTs[p] === s.ultimo.ts) return;
            jobs.push(hilo.leerHilo(p, { fetch: f, base: base, limite: 1 }).then(function (h) {
              if (h && h.ok && h.turnos.length) { previews[p] = h.turnos[h.turnos.length - 1]; previewTs[p] = s.ultimo.ts; }
            }).catch(function () {}));
          });
          return Promise.all(jobs);
        })
        .then(function () { pintarLista(); })
        .catch(function () {})
        .then(function () { ticking = false; });
    }
    function programar() {
      clearTimeout(timer);
      timer = setTimeout(function () { if (destruido) return; (doc.hidden ? Promise.resolve() : tick()).then(programar); }, CADA_MS);
    }
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) tick(); });
    // Cambio de generación (Leyendas/Coetáneos): las placas se vuelven a pintar → se rehace la lista.
    var np = doc.getElementById('nameplates'), firma = placas().join('|');
    if (np && root.MutationObserver) new root.MutationObserver(function () { var n = placas().join('|'); if (n !== firma) { firma = n; pintarLista(); } }).observe(np, { childList: true });

    pintarLista();
    tick().then(programar);
    return {
      select: select, refresh: tick, el: sec,
      get selected() { return selected; },
      destroy: function () { destruido = true; clearTimeout(timer); bridge && bridge.destroy && bridge.destroy(); sec.remove(); doc.body.classList.remove('ci-on'); }
    };
  }

  var api = {
    mount: mount, iniciales: iniciales, colorDe: colorDe, tarjetaDe: tarjetaDe, led: led, hora: hora, fragmento: fragmento,
    sinLeer: sinLeer, lineaVacia: lineaVacia, ordenar: ordenar, nombres: nombres, ROLES: ROLES, CADA_MS: CADA_MS, LIMITE: LIMITE
  };
  root.CouncilInboxApi = api;

  // Arranque automático SOLO con ?chat=1 y en el navegador (la home sin el parámetro no cambia).
  var d = root.document;
  if (d && root.location && /(?:^|[?&])chat=1(?:&|$)/.test(root.location.search || '')) {
    var arrancar = function () {
      if (root.CouncilInbox) return;
      root.CouncilInbox = mount({});
      // La mesa (clic en una placa en modo Preguntar) también abre el hilo en la bandeja.
      var ci = root.CouncilInterface;
      if (root.CouncilInbox && ci && typeof ci.select === 'function' && !ci.__ciWrap) {
        var orig = ci.select.bind(ci);
        ci.select = function (persona) {
          var r = orig(persona);
          if (persona && root.CouncilInbox && root.ChatHiloClient.personaDe(persona)) root.CouncilInbox.select(persona);
          return r;
        };
        ci.__ciWrap = true;
      }
    };
    // Los scripts defer de la home (council-grokbot, council-composer, council-integration…) pueden ejecutarse
    // después que este: se espera (máx. 15 s) a que existan sus APIs antes de montar.
    var listo = function () { return root.ChatHiloClient && root.CouncilGrokBot && root.CouncilComposer && root.CouncilInterface && d.querySelector('.stage-row'); };
    var t0 = Date.now();
    (function espera() {
      if (listo()) return arrancar();
      if (Date.now() - t0 > 15000) { if (root.console) console.warn('[council-inbox] la home no expuso sus APIs; la bandeja no se monta'); return; }
      setTimeout(espera, 50);
    })();
  }
})(typeof window !== 'undefined' ? window : globalThis);
