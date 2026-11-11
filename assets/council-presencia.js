/* Presencia de los consejeros en la mesa de la home (Carlos, 06-11-2026).
 * /consejero todos · ninguno · <nombre> · (vacío = invierte) y /ceo (Carlos, «yo»).
 * Placa de sillas vacías + recortes por consejero en assets/consejo-vacio/ (meta.json).
 * Estado en localStorage por generación + persona. Default: todos visibles, Carlos visible. */
(function (root) {
  'use strict';
  var KEY = 'admira:consejo-presencia';
  var ASSET_V = '20261111-flechas';
  var GENS = {
    leyendas: [
      ['Steve Jobs', 'CEO', 'racional', ['jobs', 'steve jobs', 'steve-jobs']],
      ['Steve Wozniak', 'CTO', 'racional', ['woz', 'wozniak', 'steve wozniak', 'steve-wozniak']],
      ['Tim Cook', 'COO', 'racional', ['cook', 'tim', 'tim cook', 'tim-cook']],
      ['Warren Buffett', 'CFO', 'racional', ['buffett', 'buffet', 'warren', 'warren buffett', 'warren-buffett']],
      ['Walt Disney', 'CCO', 'creativo', ['disney', 'walt', 'walt disney', 'walt-disney']],
      ['Dieter Rams', 'CDO', 'creativo', ['rams', 'dieter', 'dieter rams', 'dieter-rams']],
      ['Howard Schultz', 'CXO', 'creativo', ['schultz', 'howard', 'howard schultz', 'howard-schultz']],
      ['George Lucas', 'CSO', 'creativo', ['lucas', 'george', 'george lucas', 'george-lucas']]
    ],
    coetaneos: [
      ['Elon Musk', 'CEO', 'racional', ['musk', 'elon', 'elon musk', 'elon-musk']],
      ['Jensen Huang', 'CTO', 'racional', ['jensen', 'huang', 'jensen huang', 'jensen-huang']],
      ['Mira Murati', 'COO', 'racional', ['murati', 'mira', 'mira murati', 'mira-murati', 'shotwell', 'gwynne', 'gwynne shotwell', 'gwynne-shotwell']],
      ['Ruth Porat', 'CFO', 'racional', ['porat', 'ruth', 'ruth porat', 'ruth-porat']],
      ['John Lasseter', 'CCO', 'creativo', ['lasseter', 'john', 'john lasseter', 'john-lasseter']],
      ['Jony Ive', 'CDO', 'creativo', ['ive', 'jony', 'jony ive', 'jony-ive']],
      ['Carlos Ratti', 'CXO', 'creativo', ['ratti', 'carlos ratti', 'carlos-ratti']],
      ['Ryan Reynolds', 'CSO', 'creativo', ['reynolds', 'ryan', 'ryan reynolds', 'ryan-reynolds']]
    ]
  };
  function plano(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' '); }
  function personas(gen) { return (GENS[gen] || []).map(function (r) { return r[0]; }); }
  function lado(gen, side) { return (GENS[gen] || []).filter(function (r) { return r[2] === side; }).map(function (r) { return r[0]; }); }

  // Resuelve un nombre: devuelve {gen, persona} | {error}. Prefiere la generación actual.
  function resolver(nombre, genActual) {
    var n = plano(nombre); if (!n) return { error: 'vacío' };
    var orden = [genActual].concat(Object.keys(GENS).filter(function (g) { return g !== genActual; }));
    for (var i = 0; i < orden.length; i++) {
      var g = orden[i], rows = GENS[g] || [];
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (plano(r[0]) === n || r[3].indexOf(n) >= 0) return { gen: g, persona: r[0] };
      }
    }
    // Rol (CEO, CTO…) solo en la mesa actual y sin ambigüedad.
    var porRol = (GENS[genActual] || []).filter(function (r) { return plano(r[1]) === n; });
    if (porRol.length === 1) return { gen: genActual, persona: porRol[0][0] };
    if (porRol.length > 1) return { error: 'Rol ambiguo: «' + nombre + '» — usa el nombre' };
    return { error: 'No conozco a «' + nombre + '» en el Consejo' };
  }

  function crearEstado(storage) {
    var st = { ocultos: {}, carlosOculto: false };
    try { var raw = storage && storage.getItem(KEY); if (raw) { var j = JSON.parse(raw); if (j && j.ocultos) st.ocultos = j.ocultos; st.carlosOculto = !!(j && j.carlosOculto); } } catch (e) {}
    function guardar() { try { storage && storage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
    function lista(gen) { return st.ocultos[gen] || (st.ocultos[gen] = []); }
    var api = {
      visible: function (gen, p) { return lista(gen).indexOf(p) < 0; },
      visibles: function (gen) { return personas(gen).filter(function (p) { return api.visible(gen, p); }); },
      set: function (gen, p, on) {
        var l = lista(gen), i = l.indexOf(p);
        if (on && i >= 0) l.splice(i, 1); else if (!on && i < 0) l.push(p);
        guardar();
      },
      setVarios: function (gen, ps, on) { ps.forEach(function (p) { api.set(gen, p, on); }); },
      todos: function (gen) { st.ocultos[gen] = []; guardar(); },
      ninguno: function (gen) { st.ocultos[gen] = personas(gen).slice(); guardar(); },
      // Mitad: los dos primeros asientos de ese lado presentes, los otros dos en silla vacía.
      mitad: function (gen, side) { var l = lado(gen, side), h = Math.ceil(l.length / 2); l.forEach(function (p, i) { api.set(gen, p, i < h); }); },
      carlosVisible: function () { return !st.carlosOculto; },
      toggleCarlos: function () { st.carlosOculto = !st.carlosOculto; guardar(); return !st.carlosOculto; },
      raw: function () { return st; }
    };
    return api;
  }

  // Interpreta «/consejero …» y «/ceo». Devuelve null si no es suyo; si no {ok, gen, msg}.
  function comando(texto, genActual, estado) {
    var t = String(texto || '').trim();
    if (/^\/(ceo|yo)$/i.test(t)) {
      var on = estado.toggleCarlos();
      return { ok: true, gen: 'leyendas', carlos: true, msg: on ? '👤 Carlos en la mesa (CEO)' : '👤 Carlos fuera — su silla queda vacía' };
    }
    var m = t.match(/^\/(consejeros?|advisors?|councill?ors?)(?:\s+(.+))?$/i);
    if (!m) return null;
    var arg = plano(m[2] || '');
    var gen = genActual;
    var cuenta = function (g) { var n = estado.visibles(g).length; return n === 0 ? 'Mesa vacía (solo sillas)' : n + ' consejero' + (n === 1 ? '' : 's') + ' visible' + (n === 1 ? '' : 's'); };
    if (!arg) {
      if (estado.visibles(gen).length > 0) estado.ninguno(gen); else estado.todos(gen);
      return { ok: true, gen: gen, msg: cuenta(gen) };
    }
    if (/^(todos|all|everyone|on)$/.test(arg)) { estado.todos(gen); return { ok: true, gen: gen, msg: cuenta(gen) }; }
    if (/^(ninguno|nadie|none|off|vacio)$/.test(arg)) { estado.ninguno(gen); return { ok: true, gen: gen, msg: cuenta(gen) }; }
    var r = resolver(arg, gen);
    if (r.error) return { ok: false, gen: gen, msg: '⚠️ ' + r.error + ' — /consejero todos · ninguno · jobs · woz · musk…' };
    var vis = estado.visible(r.gen, r.persona);
    estado.set(r.gen, r.persona, !vis);
    var corto = r.persona.split(' ').slice(-1)[0];
    return { ok: true, gen: r.gen, persona: r.persona, msg: (vis ? corto + ' oculto — solo silla' : corto + ' en la mesa') + ' · ' + cuenta(r.gen) };
  }

  var lib = { GENS: GENS, KEY: KEY, plano: plano, personas: personas, lado: lado, resolver: resolver, crearEstado: crearEstado, comando: comando };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document === 'undefined') { root.CouncilPresenciaLib = lib; return; }

  // ── DOM ────────────────────────────────────────────────────────────
  var estado = crearEstado(root.localStorage);
  var meta = null, metaP = null, genVista = null, oyentes = [];
  function base() { return 'assets/consejo-vacio/'; }
  function cargarMeta() {
    if (!metaP) metaP = fetch(base() + 'meta.json?v=' + ASSET_V).then(function (r) { return r.json(); }).then(function (j) { meta = j; return j; }).catch(function () { return null; });
    return metaP;
  }
  function capa() {
    var box = document.querySelector('.council-image'); if (!box) return null;
    var el = document.getElementById('presencia-layer');
    if (!el) {
      el = document.createElement('div'); el.id = 'presencia-layer';
      el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;display:none;border-radius:inherit;overflow:hidden';
      var img = document.getElementById('council-img');
      if (img && img.nextSibling) box.insertBefore(el, img.nextSibling); else box.appendChild(el);
    }
    return el;
  }
  function pintar(gen) {
    genVista = gen;
    var el = capa(); if (!el) return;
    var todos = estado.visibles(gen).length === personas(gen).length && (gen !== 'leyendas' || estado.carlosVisible());
    // Ocultos fuera de nameplates y hotspots.
    document.querySelectorAll('#nameplates .np[data-persona], #body-hotspots [data-persona]').forEach(function (n) {
      var p = n.getAttribute('data-persona'); var off = personas(gen).indexOf(p) >= 0 && !estado.visible(gen, p);
      n.style.display = off ? 'none' : '';
    });
    document.querySelectorAll('.presente-cb[data-persona]').forEach(function (cb) { cb.checked = estado.visible(gen, cb.getAttribute('data-persona')); });
    actualizarMaestros(gen);
    if (todos) { el.style.display = 'none'; el.innerHTML = ''; return; }
    cargarMeta().then(function (m) {
      if (genVista !== gen || !m || !m[gen]) return;
      var g = m[gen], W = g.width, H = g.height;
      var html = '<img alt="" src="' + base() + gen + '.jpg?v=' + ASSET_V + '" style="position:absolute;left:0;top:0;width:100%;height:100%;image-rendering:pixelated">';
      Object.keys(g.cutouts).forEach(function (p) {
        var vis = p === 'Carlos' ? estado.carlosVisible() : estado.visible(gen, p);
        if (!vis) return; var c = g.cutouts[p];
        html += '<img alt="" data-presencia="' + p + '" src="' + base() + c.src + '?v=' + ASSET_V + '" style="position:absolute;left:' + (c.x / W * 100) + '%;top:' + (c.y / H * 100) + '%;width:' + (c.w / W * 100) + '%;height:' + (c.h / H * 100) + '%;image-rendering:pixelated">';
      });
      el.innerHTML = html; el.style.display = 'block';
    });
  }
  function actualizarMaestros(gen) {
    ['racional', 'creativo'].forEach(function (side) {
      var cb = document.getElementById('presente-maestro-' + side); if (!cb) return;
      var l = lado(gen, side), n = l.filter(function (p) { return estado.visible(gen, p); }).length;
      cb.checked = n === l.length; cb.indeterminate = n > 0 && n < l.length;
      var lab = document.getElementById('presente-cuenta-' + side); if (lab) lab.textContent = n + '/' + l.length;
    });
  }
  function avisar(gen) { oyentes.forEach(function (f) { try { f(gen); } catch (e) {} }); }
  // Controles de grupo encima de cada lista (Racional = sillas rojas, Creativo = azules).
  function montarMaestros(gen) {
    ['racional', 'creativo'].forEach(function (side) {
      var list = document.getElementById(side + '-members'); if (!list) return;
      var bar = document.getElementById('presente-bar-' + side);
      if (!bar) {
        bar = document.createElement('div'); bar.id = 'presente-bar-' + side; bar.className = 'presente-bar';
        bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0 6px;padding:4px 8px;font-size:11px;border:1px dashed rgba(255,221,102,.35);border-radius:4px;color:#ffdd66';
        bar.innerHTML = '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="presente-maestro-' + side + '"> <span data-en="Present · all">Presentes · todos</span> <span id="presente-cuenta-' + side + '"></span></label>' +
          '<button type="button" data-mitad="' + side + '" style="margin-left:auto;font-size:10px;padding:2px 6px;background:#2a1a08;border:1px solid #8b5a14;color:#ffdd66;border-radius:3px;cursor:pointer" data-en="Half">Mitad</button>';
        list.parentNode.insertBefore(bar, list);
        bar.addEventListener('click', function (e) { e.stopPropagation(); });
        bar.querySelector('input').addEventListener('change', function (e) {
          e.stopPropagation(); estado.setVarios(genVista, lado(genVista, side), e.target.checked); pintar(genVista); avisar(genVista);
        });
        bar.querySelector('button').addEventListener('click', function () { estado.mitad(genVista, side); pintar(genVista); avisar(genVista); });
      }
    });
    actualizarMaestros(gen);
  }
  document.addEventListener('change', function (e) {
    var cb = e.target; if (!cb || !cb.classList || !cb.classList.contains('presente-cb')) return;
    estado.set(genVista, cb.getAttribute('data-persona'), cb.checked); pintar(genVista); avisar(genVista);
  });
  root.CouncilPresencia = {
    lib: lib, estado: estado,
    sync: function (gen) { montarMaestros(gen); pintar(gen); },
    visible: function (gen, p) { return estado.visible(gen, p); },
    casilla: function (gen, p) {
      var on = estado.visible(gen, p);
      return '<label class="presente-lbl" onclick="event.stopPropagation()" title="Presente en la mesa (desmarcado = solo su silla)" style="display:flex;align-items:center;gap:3px;font-size:10px;color:#ffdd66;cursor:pointer;white-space:nowrap"><input type="checkbox" class="presente-cb" data-persona="' + p + '"' + (on ? ' checked' : '') + '><span data-en="Present">Presente</span></label>';
    },
    comando: function (texto, gen) { return comando(texto, gen, estado); },
    onChange: function (f) { oyentes.push(f); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
