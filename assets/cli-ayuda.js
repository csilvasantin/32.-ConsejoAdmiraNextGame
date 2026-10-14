/* assets/cli-ayuda.js — ayuda automática y catálogo de demos del ⌘ EXPERTO · CLI (r35 · Jensen Huang · Carlos 11-10-2026 14:20).
 * Compartido por los CLI expertos de admira.live (la portada con la suite www.admiranext.com/suite/experto.js y la barra
 * de las demás páginas, admira-bar.js, que lo carga al vuelo):
 *   · orden mal escrita → la suite dice «Verbo desconocido» / «Demo desconocida»; aquí se añade «¿Quisiste decir …?»
 *     y la ayuda que toca (verbo → /help general · /demo xyz → la ayuda de /demo), sin tocar la suite;
 *   · /demo help (/demo ayuda, /demo ?) → «Hay N demos», de la más reciente a la más antigua con su fecha de alta;
 *     /demo help antiguas (old) → al revés · /demo help alfabetico (--orden alfabetico, alpha) → por nombre.
 * Fechas: las demos de admira.live, del sello de novedades.json que las trajo; las cinco soluciones de la suite,
 * del 7-oct-2026 (catálogo /demo de experto.js); pixeria novedades del 9-oct-2026. Las de la suite sin fecha conocida
 * van al final sin fecha (no se inventa).
 */
(function (root) {
  'use strict';
  if (root.AdmiraCliAyuda && root.AdmiraCliAyuda.version) return;
  function en() {
    try { var A = root.AdmiraIdioma; if (A && A.lang) return A.lang() === 'en'; } catch (e) {}
    return root.document ? /^en/i.test(document.documentElement.lang || '') : false;
  }
  function T(es, e) { return en() ? e : es; }

  // [orden, fecha AAAA-MM-DD | null, castellano, inglés, origen]
  // /demo interruptores (#5862): página pública propia con su recorrido automático.
  var RE_DEMO_INT = /^\/?demo\s+(interruptores?|apps|clis)\s*$/i;
  var CATALOGO = [
    ['/demo interruptores', '2026-10-14', '⏻ Desktop app y ⏻ CLI de cada Mac, con un botón por unidad («Morfeo · CLI · MBP16» apaga solo ese Morfeo): abrir/cerrar Claude y ChatGPT/Codex y arrancar/apagar los deepagents, de uno en uno o todos (también /demo apps, /demo clis)', '⏻ Desktop app and ⏻ CLI per Mac, with one button per unit («Morfeo · CLI · MBP16» stops only that Morfeo): open/close Claude and ChatGPT/Codex and start/stop the deepagents, one by one or all at once (also /demo apps, /demo clis)', 'admira.live'],
    ['/demo interface', '2026-10-11', 'terminales en vivo de los deepagents: help → 4 aquí → off → 2 aquí → off → 2 claude · codex · grok · Neo Trinity → error con menos de 2, sola', 'live deepagent terminals: help → 4 here → off → 2 here → off → 2 claude · codex · grok · Neo Trinity → fewer-than-2 error, by itself', 'admira.live'],
    ['/demo velocidad', '2026-10-09', 'velocímetro de tokens/hora de la flota (/demo speed en inglés)', 'fleet tokens/hour speedometer (/demo speed)', 'admira.live'],
    ['/demo lectura', '2026-10-09', 'qué ve una sesión de agente de solo lectura', 'what a read-only agent session sees', 'admira.live'],
    ['/demo portada', '2026-10-09', 'la portada en vivo: conversación, paste e imagen (también /demo home)', 'the live home page: conversation, paste and image (also /demo home)', 'admira.live'],
    ['/demo pixeria novedades', '2026-10-09', 'mejoras de Trinity → gemelo 360', 'Trinity improvements → 360 twin', 'suite'],
    ['/demo studio', '2026-10-07', 'admira.studio — contenidos con IA', 'admira.studio — AI content', 'suite'],
    ['/demo store', '2026-10-07', 'admira.store — gemelo digital del Starbucks de Alsea', 'admira.store — Alsea Starbucks digital twin', 'suite'],
    ['/demo tv', '2026-10-07', 'admira.tv — la fachada entra en Matrix', 'admira.tv — the storefront enters Matrix', 'suite'],
    ['/demo app', '2026-10-07', 'admira.app — operación de la red', 'admira.app — network operations', 'suite'],
    ['/demo biz', '2026-10-07', 'admira.biz — retail media y campañas', 'admira.biz — retail media and campaigns', 'suite'],
    ['/demo global', null, 'Sneakers Store: proyecto → Xpacio → Pixeria → gemelo → cámara', 'Sneakers Store: project → Xpacio → Pixeria → twin → camera', 'suite'],
    ['/demo hoy', null, 'lo de hoy: bien, mal o pendiente (/demo today)', "today's work: good, bad or pending (/demo today)", 'suite'],
    ['/demo idioma', null, 'cambia de idioma sin perder el paso', 'switches language mid-walkthrough', 'suite'],
    ['/demo proyectos', null, 'recorre proyectos (también marcas y roadmap)', 'walks projects (also brands and roadmap)', 'suite'],
    ['/demo editor', null, 'editor de demos', 'demo editor', 'suite']
  ];
  function fechaCorta(f) { if (!f) return T('sin fecha', 'no date'); var p = f.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }

  /** Ayuda de /demo (pura: la prueba interface-cli.test.mjs). orden: 'recientes' | 'antiguas' | 'alfabetico'. */
  function demoHelp(args, idiomaEn) {
    var E = idiomaEn == null ? en() : !!idiomaEn;
    var t = function (es, e) { return E ? e : es; };
    var a = String(args || '').toLowerCase();
    var orden = /alfab|alpha|nombre|name|az/.test(a) ? 'alfabetico' : /antig|old|asc|primer/.test(a) ? 'antiguas' : 'recientes';
    var con = CATALOGO.filter(function (d) { return d[1]; }), sin = CATALOGO.filter(function (d) { return !d[1]; });
    var lista;
    if (orden === 'alfabetico') lista = CATALOGO.slice().sort(function (x, y) { return x[0].localeCompare(y[0]); });
    else {
      con.sort(function (x, y) { return x[1] === y[1] ? 0 : (x[1] < y[1] ? 1 : -1); }); // estable: dentro del día, el orden del catálogo
      if (orden === 'antiguas') con.reverse();
      lista = con.concat(sin);
    }
    var cab = t('Hay ', 'There are ') + CATALOGO.length + t(' demos', ' demos') + ' · ' +
      (orden === 'alfabetico' ? t('por nombre', 'by name') : orden === 'antiguas' ? t('de la más antigua a la más reciente', 'oldest first') : t('de la más reciente a la más antigua', 'newest first'));
    var filas = lista.map(function (d) {
      return (d[1] ? fechaCorta(d[1]) : t('sin fecha  ', 'no date    ')) + '  ' + d[0] + ' — ' + (E ? d[3] : d[2]) + (d[4] === 'suite' ? t(' · suite', ' · suite') : '');
    });
    return [cab].concat(filas, [t('Orden: /demo help (recientes) · /demo help antiguas · /demo help alfabetico (--orden alfabetico) · /demo lista: macros de la suite.',
      'Order: /demo help (newest) · /demo help old · /demo help alpha (--orden alfabetico) · /demo lista: suite macros.')]).join('\n');
  }

  /** Distancia de edición (Damerau-Levenshtein: una transposición cuenta 1). */
  function dist(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // hlep → help
    }
    return d[m][n];
  }
  /** La palabra conocida más parecida (o '' si ninguna se parece de verdad). */
  function sugerir(palabra, conocidas) {
    var w = String(palabra || '').toLowerCase().replace(/^\//, ''), mejor = '', md = 99;
    if (!w) return '';
    (conocidas || []).forEach(function (c) {
      var k = String(c).toLowerCase(), dd = dist(w, k);
      if (k.indexOf(w) === 0 && w.length >= 3) dd = Math.min(dd, 1); // prefijo: /interf → /interface
      if (dd < md) { md = dd; mejor = c; }
    });
    var tope = w.length <= 4 ? 1 : w.length <= 7 ? 2 : 3;
    return md <= tope ? mejor : '';
  }
  function verbosConocidos() {
    var E = root.AdmiraExperto, out = [];
    try { (E && E.list ? E.list() : []).forEach(function (v) { out.push(v.name); (v.alias || []).forEach(function (a) { out.push(a); }); }); } catch (e) {}
    return out.concat(['velocidad', 'speed', 'interface', 'interfaz', 'demo']);
  }
  function demosConocidas() { return CATALOGO.map(function (d) { return d[0].replace(/^\/demo /, ''); }).concat(['home', 'live', 'speed', 'interfaz', 'today', 'language', 'projects', 'brands', 'roadmap', 'marcas', 'lista', 'siguiente']); }

  // ── enganche al ⌘ EXPERTO · CLI de la suite ─────────────────────────────
  var RE_DEMO_HELP = /^\/?demo\s+(help|ayuda|\?)(?:\s+(.*))?$/i;
  function li(log, t, cls) {
    if (!log) return;
    String(t).split('\n').forEach(function (l) { var e = document.createElement('li'); e.className = cls || ''; e.setAttribute('data-ayuda', '1'); e.textContent = l; log.appendChild(e); });
    log.scrollTop = log.scrollHeight;
  }
  function vigilar(log) {
    if (!log || log.__axAyuda) return;
    log.__axAyuda = true;
    var ultimaDemo = 0;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes, function (n) {
          if (!n || n.nodeType !== 1 || n.getAttribute('data-ayuda')) return;
          var tx = n.textContent || '';
          var mv = /^(?:Verbo desconocido|Unknown verb): \/(\S+)/.exec(tx);
          if (mv) {
            var s = sugerir(mv[1], verbosConocidos());
            setTimeout(function () {
              if (s) li(log, T('¿Quisiste decir /', 'Did you mean /') + s + '?', 'err');
              li(log, T('Esto es lo que entiende el CLI:', 'This is what the CLI understands:'));
              var E = root.AdmiraExperto;
              // /ayuda o /help según el idioma actual: así la ayuda no cambia el idioma de la web
              if (E && E.exec) E.exec(en() ? '/help' : '/ayuda', log, { echo: false });
            }, 0);
            return;
          }
          var md = /^(?:Demo desconocida|Unknown demo): (.+)$/.exec(tx);
          if (md && Date.now() - ultimaDemo > 800) {
            ultimaDemo = Date.now();
            var pedida = md[1].trim();
            if (/^(help|ayuda|\?)/i.test(pedida)) return; // /demo help lo contestamos nosotros (y no llega a la suite)
            var sd = sugerir(pedida, demosConocidas());
            setTimeout(function () {
              if (sd) li(log, T('¿Quisiste decir /demo ', 'Did you mean /demo ') + sd + '?', 'err');
              li(log, demoHelp(''));
            }, 0);
          }
        });
      });
    }).observe(log, { childList: true });
  }
  function enganchar() {
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      var log = (form.closest('.ax-cli') || document).querySelector('.ax-cli-out');
      vigilar(log);
      var input = form.querySelector('input, textarea');
      var t = String((input && input.value) || '').trim();
      if (/^\/?demo$/i.test(t)) { setTimeout(function () { li(log, T('Hay ', 'There are ') + CATALOGO.length + T(' demos · /demo help las lista de la más reciente a la más antigua (la última: /demo interruptores)', ' demos · /demo help lists them newest first (latest: /demo interruptores)')); }, 0); return; }
      if (RE_DEMO_INT.test(t)) { e.preventDefault(); e.stopPropagation(); if (input) input.value = ''; li(log, T('Abriendo /demo/interruptores/ …', 'Opening /demo/interruptores/ …')); setTimeout(function () { location.href = '/demo/interruptores/?auto=1'; }, 400); return; }
      var m = RE_DEMO_HELP.exec(t);
      if (!m) return;
      e.preventDefault(); e.stopPropagation();
      if (input) input.value = '';
      li(log, '› ' + t, 'cmd');
      li(log, demoHelp(m[2] || ''));
    }, true);
    var busca = 0;
    (function mira() { var l = document.querySelector('.ax-dock .ax-cli-out, .ax-cli-out'); if (l) vigilar(l); else if (busca++ < 80) setTimeout(mira, 250); })();
  }
  var api = { version: 'r35', CATALOGO: CATALOGO, demoHelp: demoHelp, sugerir: sugerir, dist: dist, RE_DEMO_HELP: RE_DEMO_HELP };
  root.AdmiraCliAyuda = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
