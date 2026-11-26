/* assets/cli-ayuda.js — ayuda automática y catálogo de demos del ⌘ EXPERTO · CLI (r36 · Disney · Carlos 15-11-2026 09:27 (t559u): /help y /ayuda del experto listan el consejo).
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
  var RE_APAGAR = /^\/?(?:apagar(?:\s+(?:sala(?:\s+de\s+)?)?(?:reuniones?|interactivos?|todo))?|encender(?:\s+(?:sala(?:\s+de\s+)?)?(?:reuniones?|interactivos?|todo))?|restaurar(?:\s+(?:sala(?:\s+de\s+)?)?(?:reuniones?|interactivos?|todo))?)\s*$/i;
  var RE_DEMO_LANZA = /^\/?(?:lanzadera|sala(?:\s+en)?\s+negro|demo\s+(lanzadera|negro|sala(?:\s+en)?\s+negro|admiradesk|interactivo|player(?:\s+interactivo)?|admiranext(?:-interactivo|\s+interactivo)?(?:\.com)?|modo(?:\s+demo)?\s+portaventura(?:next)?(?:\.com)?|portaventura(?:next)?(?:-interactivo|\s+interactivo)?(?:\.com)?|pan(?:-interactivo)?))\s*$/i;
  var CATALOGO = [
    ['/demo admiranext', '2026-11-26', 'Lanzadera, sala de reuniones de Terminator: las Leyendas presentan AdmiraNeXT.com en la Philips 86BDL3650Q del MacBook Air Rosa y el consumo en el PC Monitor del MacBook Air Crema (también «Demo AdmiraNeXT.com»)', 'Launcher, Terminator meeting room: the Legends present AdmiraNeXT.com on the Rosa’s Philips 86BDL3650Q and usage on the Crema’s PC Monitor (also “Demo AdmiraNeXT.com”)', 'admira.live'],
    ['/demo portaventura', '2026-11-26', 'Lanzadera, sala de reuniones de Terminator: las Leyendas presentan PortAventuraNeXT.com («El parque que se cuenta solo») en la Philips del Rosa y el consumo en el Crema (también /demo pan y «Demo PortAventuraNeXT.com»)', 'Launcher, Terminator meeting room: the Legends present PortAventuraNeXT.com (“the park that tells itself”) on Rosa’s Philips and usage on the Crema (also /demo pan and “Demo PortAventuraNeXT.com”)', 'admira.live'],
    ['/demo interactivo', '2026-11-26', 'Lanzadera, zona interactiva de Terminator: player interactivo de admira.tv en AdmiraNeXT01–05, controlado desde AdmiraDesk (también «Demo AdmiraNeXT», /demo admiradesk, /demo player interactivo)', 'Launcher, Terminator interactive zone: interactive admira.tv player on AdmiraNeXT01–05, controlled from AdmiraDesk (also “Demo AdmiraNeXT”, /demo admiradesk, /demo player interactivo)', 'admira.live'],
    ['/demo modo portaventura', '2026-11-26', 'Lanzadera, zona interactiva de Terminator: modo demo PortAventuraNeXT (admiranext.com/demo/PortAventuraNeXT y el player en 01–05)', 'Launcher, Terminator interactive zone: PortAventuraNeXT demo mode (admiranext.com/demo/PortAventuraNeXT and the player on 01–05)', 'admira.live'],
    ['/demo lanzadera', '2026-11-26', 'Abre la lanzadera de presentaciones (/lanzadera/) sin arrancar una demo', 'Opens the presentations launcher (/lanzadera/) without starting a demo', 'admira.live'],
    ['/demo negro', '2026-11-26', 'Lanzadera: pone la sala de reuniones en negro (Philips del Rosa y PC Monitor del Crema), sin apagar nada (también «sala en negro», /sala negro)', 'Launcher: puts the meeting room in black (Rosa’s Philips and the Crema’s PC Monitor) without turning anything off (also “sala en negro”, /sala negro)', 'admira.live'],
    ['/apagar reuniones', '2026-11-26', 'Lanzadera: apaga la sala de reuniones de Terminator (Philips del Rosa, PC Monitor y portátil del Crema, Plata si está conectado) con confirmación, reutilizando Sala en negro. No apaga el Studio ni el Mini', 'Launcher: turns off the Terminator meeting room (Rosa’s Philips, the Crema’s PC Monitor and laptop, the Plata if connected) after confirmation, reusing Sala en negro. The Studio and Mini are not shut down', 'admira.live'],
    ['/apagar interactivos', '2026-11-26', 'Lanzadera: apaga la sala de interactivos (players de AdmiraNeXT01–05, verticales y AdmiraDesk) con confirmación, en negro. No apaga ningún equipo', 'Launcher: turns off the interactive room (AdmiraNeXT01–05 players, verticals and AdmiraDesk) after confirmation, in black. No computer is shut down', 'admira.live'],
    ['/apagar todo', '2026-11-26', 'Lanzadera: apaga las dos zonas de Terminator, con confirmación (también /encender reuniones, /encender interactivos, /restaurar todo)', 'Launcher: turns off both Terminator zones, after confirmation (also /encender reuniones, /encender interactivos, /restaurar todo)', 'admira.live'],
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


  /** Catálogo del modo experto en admira.live (t559u): comandos reales del consejo y lo que pueden hacer los consejeros. */
  var HELP_URL = 'https://www.admira.live/help/';
  var MCP_URL = 'https://www.admira.live/mcp/';
  function catalogoExperto(idiomaEn) {
    var E = idiomaEn == null ? en() : !!idiomaEn;
    var t = function (es, e) { return E ? e : es; };
    var L = [];
    function sec(es, e) { L.push(''); L.push('—— ' + t(es, e) + ' ——'); }
    function row(cmd, es, e) { L.push(cmd + ' — ' + t(es, e)); }
    L.push(t(
      'CLI experto de admira.live · todo lo que puedes hacer en la mesa y lo que pueden hacer los consejeros.',
      'admira.live expert CLI · everything you can do at the table and everything the counsellors can do.'
    ));
    L.push(t('Ayuda completa: ' + HELP_URL, 'Full help: ' + HELP_URL));
    L.push(t('MCP para otros DeepAgents: ' + MCP_URL, 'MCP for other DeepAgents: ' + MCP_URL));
    L.push(t('/help pagina abre la página de ayuda. /mcp abre la del MCP.', '/help page opens the help page. /mcp opens the MCP page.'));
    sec('Comandos del consejo (mesa)', 'Council table commands');
    row('/help · /ayuda', 'muestra esta lista (en la mesa, el overlay); /help pagina la abre en /help/', 'shows this list (overlay at the table); /help page opens /help/');
    row('/comandos · /commands', 'abre https://www.admira.live/comandos', 'opens https://www.admira.live/comandos');
    row('/mcp', 'abre https://www.admira.live/mcp/ para Neo, Trinity, Oráculo, Morfeo, Smith, Merovingio y Claude o Codex', 'opens https://www.admira.live/mcp/ for Neo, Trinity, Oracle, Morpheus, Smith, Merovingio and Claude or Codex');
    row('/hablar [consejero] [mensaje] · /talk', 'habla con un consejero (Jobs en Leyendas, Elon en Coetáneos si omites el nombre). /hablar off cuelga. El literal no se envía al consejero. Mismo canal que /hola', 'talk to a counsellor (Jobs on Legends, Elon on Contemporaries if you omit the name). /talk off hangs up. The literal is never sent. Same channel as /hola');
    row('/conversacion <a> vs <b> <tema> · /conversation', 'dos consejeros hablan de un tema (p. ej. /conversacion jobs vs elon PortAventuraNeXT). También /conversación. @consejero en Conversación le habla a ese consejero', 'two counsellors talk about a topic (e.g. /conversation jobs vs elon PortAventuraNeXT). An @counsellor mention in Conversation talks to that counsellor');
    row('/consejero · /counselor · /advisor', '/consejero todos · ninguno · jobs|woz|musk… (alterna) · a secas invierte la mesa. También /consejeros, /counselors, /advisors y /consejero <nombre> aparecer|desaparecer', '/consejero todos · ninguno · jobs|woz|musk… (toggles) · bare inverts the table. Also /consejeros, /counselors, /advisors and /consejero <name> show|hide');
    row('/consejeros placas [on|off]', 'cartelas de los Coetáneos (por defecto ocultas: cada uno tiene su objeto — Model X, DGX, portátil, Ferrari Land)', 'Contemporaries name plates (hidden by default: each one has an object — Model X, DGX, laptop, Ferrari Land)');
    row('/cabecera [bonomi|off]', 'sienta a un invitado en la cabecera de Coetáneos (p. ej. /cabecera Carlo Bonomi)', 'seats a guest at the head of the Contemporaries table (e.g. /cabecera Carlo Bonomi)');
    row('/ceo', 'atajo de presencia del CEO de la mesa activa', 'shortcut for the sitting CEO of the active table');
    row('/leyendas · /legends · /coetaneos · /peers', 'cambia de mesa', 'switches table');
    row('/idioma · /language', 'castellano o inglés, sin recargar', 'Spanish or English, without reloading');
    row('/marca · /brand · /81…/89', 'marca blanca y pieles de cine; /marca off vuelve a Admira', 'white label and movie skins; /marca off returns to Admira');
    row('/marcador · /scoreboard · /flota · /fleet · /highscore', 'marcador y flota', 'scoreboard and fleet');
    row('/interface · /interfaz', 'terminales en vivo de los deepagents (ver /interface help)', 'live deepagent terminals (see /interface help)');
    row('/orquestar · /orchestrate', 'pide una orquestación al motor', 'asks the engine for an orchestration');
    row('/agentes · /agents · /tareas · /tasks · /tarea · /task · /diario · /journal', 'agentes, tablero y diario', 'agents, board and journal');
    row('/sites · /sitios', 'atajos a las webs de AdmiraNeXT', 'shortcuts to the AdmiraNeXT sites');
    row('/scumm · /verbos · /top · /bocas · /mouths · /nombres · /names · /motor · /engine · /olvidar · /forget', 'interfaz de la mesa', 'table interface');
    sec('Lo que pueden hacer los consejeros', 'What the counsellors can do');
    L.push(t(
      'Los 16 consejeros (8 roles × Leyendas y Coetáneos) viven en GrokBot. En la mesa puedes invocarlos (/hablar, /consejero, /cabecera), hacerlos conversar entre ellos, oírles (micrófono de /hablar) y ver u ocultar sus cajas de misión (ocultas por defecto, botón Misiones).',
      'The 16 counsellors (8 roles × Legends and Contemporaries) live in GrokBot. At the table you can invoke them (/talk, /counselor, /cabecera), have them converse, hear them (the /talk microphone) and show or hide their mission boxes (hidden by default, Missions button).'
    ));
    L.push(t(
      'Por MCP (https://mcp.admira.live/mcp, clave en secretos del servidor) otro DeepAgent (Neo, Trinity, Oráculo, Morfeo, Smith, Merovingio, o una sesión de Claude o Codex) puede: listar consejeros y modelos; preguntar a la mesa o a uno (consejo_preguntar, consejero_preguntar); escribirse en privado (consejero_mensaje, consejero_bandeja, consejero_responder) y registrar webhooks; encargar y seguir trabajo (agente_encargar, encargos_listar, encargo_estado, encargo_responder, encargo_anular); publicar en AgoraMatrix (agora_decir); ver flota, latidos y velocidad (agentes_vivos, flota_estado, consejero_latido, consumos_velocidad, consumo_reportar); handON/handOFF y ahorro; misiones Yokup (yokup_*); y Telegram (telegram_bandeja, telegram_responder). Lista completa en ' + MCP_URL,
      'Over MCP (https://mcp.admira.live/mcp, key in the server secrets) another DeepAgent (Neo, Trinity, Oracle, Morpheus, Smith, Merovingio, or a Claude or Codex session) can: list counsellors and models; ask the table or one counsellor (consejo_preguntar, consejero_preguntar); send private messages (consejero_mensaje, consejero_bandeja, consejero_responder) and register webhooks; assign and follow work (agente_encargar, encargos_listar, encargo_estado, encargo_responder, encargo_anular); post to AgoraMatrix (agora_decir); read fleet, heartbeats and speed (agentes_vivos, flota_estado, consejero_latido, consumos_velocidad, consumo_reportar); handON/handOFF and power-saving; Yokup missions (yokup_*); and Telegram (telegram_bandeja, telegram_responder). Full list at ' + MCP_URL
    ));
    sec('Suite EXPERTO (admira.live y plataformas)', 'EXPERTO suite (admira.live and platforms)');
    row('/marca · /idioma · /estado · /version', 'verbos de la suite anclada abajo', 'verbs of the suite docked at the bottom');
    row('/demo · /demo help', 'catálogo de demos (también /demo ayuda, /demo ?). /demo admiranext, /demo negro, /apagar reuniones, /apagar interactivos y /apagar todo abren la lanzadera', 'demo catalogue (also /demo help, /demo ?). /demo admiranext, /demo negro, /apagar reuniones, /apagar interactivos and /apagar todo open the launcher');
    L.push('');
    L.push(t('No se listan aquí capacidades inventadas: solo lo que el código de admira.live entiende hoy.', 'Nothing invented is listed here: only what admira.live’s code understands today.'));
    return L.join('\n').replace(/^\n/, '');
  }
  var RE_HELP_EXPERTO = /^\/?(help|ayuda)(?:\s+(pagina|p[aá]gina|page|all|todo)?)?$/i;
  var RE_MCP_EXPERTO = /^\/?mcp$/i;

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
              li(log, catalogoExperto());
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
      var mh = RE_HELP_EXPERTO.exec(t);
      if (mh) {
        e.preventDefault();
        e.stopPropagation();
        if (input) input.value = '';
        li(log, '› ' + t, 'cmd');
        li(log, catalogoExperto());
        if (mh[2] && /pagina|p[aá]gina|page|all|todo/i.test(mh[2])) {
          li(log, T('Abriendo ' + HELP_URL + ' …', 'Opening ' + HELP_URL + ' …'));
          setTimeout(function () { window.open(HELP_URL, '_blank', 'noopener'); }, 200);
        }
        return;
      }
      if (RE_MCP_EXPERTO.test(t)) {
        e.preventDefault();
        e.stopPropagation();
        if (input) input.value = '';
        li(log, '› ' + t, 'cmd');
        li(log, T('MCP de los consejeros para el resto de DeepAgents: ' + MCP_URL + ' · servidor https://mcp.admira.live/mcp · clave en secretos del servidor.',
          'Counsellor MCP for the other DeepAgents: ' + MCP_URL + ' · server https://mcp.admira.live/mcp · key in the server secrets.'));
        setTimeout(function () { window.open(MCP_URL, '_blank', 'noopener'); }, 200);
        return;
      }
      if (/^\/?demo$/i.test(t)) { setTimeout(function () { li(log, T('Hay ', 'There are ') + CATALOGO.length + T(' demos · /demo help las lista de la más reciente a la más antigua (la última: /demo admiranext)', ' demos · /demo help lists them newest first (latest: /demo admiranext)')); }, 0); return; }
      if (RE_APAGAR.test(t) || RE_DEMO_LANZA.test(t)) {
        e.preventDefault(); e.stopPropagation();
        if (input) input.value = '';
        var dest = '/lanzadera/';
        var arg = (t.replace(/^\//, '').replace(/^demo\s+/i, '') || '').toLowerCase();
        if (/^apagar|^encender|^restaurar/.test(arg)) {
          if (/^apagar\s*$/.test(arg)) dest += '#zona-apagado';
          else if (/^encender|^restaurar/.test(arg)) {
            if (/todo|all/.test(arg)) dest += '?encender=todo';
            else if (/interact/.test(arg)) dest += '?encender=interactivos';
            else dest += '?encender=reuniones';
          } else if (/todo|all/.test(arg)) dest += '?apagar=todo';
          else if (/interact/.test(arg)) dest += '?apagar=interactivos';
          else dest += '?apagar=reuniones';
        }
        else if (/modo\s*(demo\s*)?portaventura|portaventura[^\n]*interactivo|pan-interactivo/.test(arg)) dest += '?demo=pan-interactivo';
        else if (/negro|sala(?:\s+en)?\s+negro/.test(arg) || /sala(?:\s+en)?\s+negro/.test(t)) dest += '?demo=negro';
        else if (/admiradesk|interactivo|player/.test(arg)) dest += '?demo=interactivo';
        else if (/admiranext/.test(arg)) dest += '?demo=admiranext';
        else if (/portaventura|\bpan\b/.test(arg)) dest += '?demo=pan';
        li(log, T('Abriendo ' + dest + ' …', 'Opening ' + dest + ' …'));
        setTimeout(function () { location.href = dest; }, 400);
        return;
      }
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
  var api = { version: 'r36', CATALOGO: CATALOGO, demoHelp: demoHelp, catalogoExperto: catalogoExperto, sugerir: sugerir, dist: dist, RE_DEMO_HELP: RE_DEMO_HELP, RE_HELP_EXPERTO: RE_HELP_EXPERTO, RE_MCP_EXPERTO: RE_MCP_EXPERTO, HELP_URL: HELP_URL, MCP_URL: MCP_URL };
  root.AdmiraCliAyuda = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
