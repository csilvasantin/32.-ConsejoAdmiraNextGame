/* «Trabajando ahora» — franja en lo alto de /consumos (GrokBotBox, 09-10-2026 · r28).
 * Lee /api/flota/trabajando cada 10 s: una tarjeta por consejero/agente con retrato, nombre, máquina · motor/modelo,
 * foco/tarea, proyecto y encargo. Color: VERDE trabajando · AMARILLO con Carlos · ROJO parado > 1 h pero activo hoy · GRIS sin actividad hoy («parado · hace X min ·
 * último: …») o «sin latido». Orden: verde, amarillo, gris. Sin datos: lo dice, nunca inventa.
 * r40: tokens honestos («≈ X tok/h (15 min × 4)» + real de la última hora; «sin medición» en vez de 0) y aviso en la
 * fila de resumen cuando la presencia viene de caché o no responde (faltan agentes).
 * r4 (Jensen, 10-10-2026): verde también con latido < 15 min + encargo en curso (Oráculo en OpenCode, Merovingio…);
 * nota «plan C gratis» / «gratis» en la ficha; ES/EN con ?lang=en; avisa a la Matriz de agentes («flota:trabajando»). */
(function (root) {
  'use strict';
  var API = '/api/flota/trabajando', POLL = 10000, ultimo = null;
  // r11 (Carlos, 13:57): el dato de cada chip alterna cada 10 s entre máquina/equipo y runtime (Grok · Codex · Claude ·
  // OpenCode · Nemotron 3 Ultra). La fase sale del reloj, así un repintado no la reinicia.
  // r26 (Carlos, 11-10-2026 11:31): rota cada 15 s en tres fases: máquina → runtime → foco («admira.live · Morfeo»).
  var ALTERNA_MS = 15000;
  function fase() { return Math.floor(Date.now() / ALTERNA_MS) % 3; }
  function faseB() { return fase() === 1; }
  function ponFase(el) { if (!el) return; var f = fase(); el.classList.toggle('tr-fase-b', f === 1); el.classList.toggle('tr-fase-c', f === 2); }
  function alterna() { ponFase(document.getElementById('trabajando-chips')); ponFase(document.getElementById('trabajando-lista')); }
  function en() {
    // r5: /consumos no carga admira-idioma.js al entrar: se mira también ?lang= y la preferencia guardada de la suite.
    var h = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (root.AdmiraIdioma) return h.indexOf('en') === 0;
    try { var q = new URL(location.href).searchParams.get('lang'); if (q) return /^en/i.test(q); } catch (e) {}
    try { var s = localStorage.getItem('admiranext_expert_lang') || localStorage.getItem('xtanco_lang'); if (s) return /^en/i.test(s); } catch (e) {}
    return h.indexOf('en') === 0;
  }
  function T(es, en_) { return en() ? en_ : es; }
  /** r4: nota de coste secundaria: el modelo principal manda; el plan C gratis solo se apunta. */
  function notaCoste(t) {
    if (t.gratis) return '<span class="tr-chip tr-gratis" title="' + esc(T('Solo late en runtimes gratuitos (OpenCode / DeepAgents / Nemotron): no reporta tokens', 'Only free runtimes (OpenCode / DeepAgents / Nemotron): no token reporting')) + '">' + T('gratis', 'free') + '</span>';
    if (t.planC) return '<span class="tr-chip tr-gratis" title="' + esc(T('Además tiene una instancia en el plan C gratis (OpenCode / Nemotron)', 'Also runs an instance on free plan C (OpenCode / Nemotron)')) + '">' + T('+ plan C gratis', '+ free plan C') + '</span>';
    return '';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    function f(x, d) { return x.toLocaleString(en() ? 'en-GB' : 'es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e6) return f(n / 1e6, 1) + ' M'; if (n >= 1e3) return f(n / 1e3, 0) + ' k'; return f(n, 0);
  }
  function hace(s) {
    if (s == null) return '';
    var v = s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d';
    return en() ? v + ' ago' : 'hace ' + v;
  }
  function retrato(t) {
    var r = t.retrato, ini = esc(String(vis(t.agente) || '?').slice(0, 2));
    if (r && (r.cara || r.crop)) {
      // Recorte de la cara en la ilustración del Consejo («cara» del servidor; «crop» antiguo = cuerpo → 42 % de arriba).
      var c = r.cara || r.crop, h = r.cara ? c.h : c.h * 0.42, w = c.w;
      var sx = (10000 / w).toFixed(1), sy = (10000 / h).toFixed(1), px = (c.l / (100 - w) * 100).toFixed(2), py = (c.t / (100 - h) * 100).toFixed(2);
      return '<span class="tr-foto" role="img" aria-label="' + esc(vis(t.agente)) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:' + sx + '% ' + sy + '%;background-position:' + px + '% ' + py + '%"></span>';
    }
    if (r && r.img) return '<span class="tr-foto" role="img" aria-label="' + esc(vis(t.agente)) + '" style="background-image:url(\'' + esc(r.img) + '\');background-size:cover;background-position:center 25%"></span>';
    return '<span class="tr-foto tr-ini" aria-hidden="true">' + ini + '</span>';
  }
  /** r40: «≈ 2,5 M tok/h (15 min × 4) · 868 k última hora»; «sin medición» si no hay medición de tokens. */
  function tokens(t) {
    // r44: Musk activo vía Merovingio: sus tokens van en la ficha de Merovingio (no se cuentan dos veces).
    if (t.via) return ' · <small class="tr-via">' + esc(T('tokens en la ficha de ', 'tokens on the card of ') + t.via) + '</small>';
    if (t.sinMedicion) return ' · <span class="tr-sinmed" title="' + esc(T('Este agente no tiene medición de tokens (sin pulso o a 0 todo el día): no es un 0 real', 'No token measurement for this agent: not a real 0')) + '">' + T('sin medición de tokens', 'no token measurement') + '</span>';
    var r = '';
    if (t.tokHora > 0) r += ' · ≈ ' + fmt(t.tokHora) + ' tok/h <small>(15 min × 4)</small>';
    if (t.tokUltimaHora != null && (t.tokHora > 0 || t.tokUltimaHora > 0)) r += ' · ' + fmt(t.tokUltimaHora) + ' ' + T('última hora', 'last hour');
    return r;
  }
  // r18 (Carlos, 15:55): la familia visible es «GrokBot», nunca «Grok» a secas; «Grok CLI» → «GrokBot CLI». Se respetan
  // los nombres de modelo con versión («Grok 4.7», «Grok Heavy», «grok-4.7») y los nombres de consejeros/URLs (no llevan «Grok»).
  /** #6961 (Carlos, 21-10-2026): etiqueta visible «Jensen» para la silla Huang (la silla interna sigue siendo Huang). */
  function vis(n) { return n === 'Huang' ? 'Jensen' : n; }
  function gb(s) { return s == null ? s : String(s).replace(/\bGrok Bot\b/g, 'GrokBot').replace(/\bGrok CLI\b/g, 'GrokBot CLI').replace(/\bGrok\b(?![\s-]*(?:\d|Heavy|Imagine|Fast|Code|Mini|Beta))/g, 'GrokBot').replace(/(^|· )grok(?= ·|$)/g, '$1GrokBot CLI'); }
  /** r28-sup: «GrokBot (asistente)» → 'GrokBot (assistant)' en inglés. */
  function rt(s) { s = gb(s); return s && en() ? String(s).replace(/\(asistente\)/g, '(assistant)') : s; }
  /** r28-sup (Carlos, 17:28/17:29): superficie de una instancia. Terminal (CLI) = canal de trabajo del agente; la app de
   *  escritorio solo la usa Carlos: «App de escritorio · Carlos» si la está usando, si no «App abierta, sin uso» (atenuado). */
  function supTexto(x) {
    if (x.tipo === 'cli') return T('Terminal (CLI)', 'Terminal (CLI)') + (x.corta ? ' · ' + maqNombre(x.corta) : '') + (x.runtime ? ' · ' + rt(x.runtime) : '');
    if (x.tipo === 'asistente') return rt(x.runtime || 'GrokBot (asistente)');
    return (x.enUso ? T('App de escritorio · Carlos', 'Desktop app · Carlos') : T('App abierta, sin uso', 'App open, not in use')) + (x.corta ? ' · ' + maqNombre(x.corta) : '') + (x.app ? ' (' + gb(x.app) + ')' : '');
  }
  function superficies(t) {
    var l = t.superficies || [];
    if (!l.length) return '';
    return '<span class="tr-sups">' + l.map(function (x) {
      var off = x.tipo === 'app' && !x.enUso;
      return '<span class="tr-sup tr-sup-' + esc(x.tipo) + (off ? ' tr-sup-off' : '') + '" title="' + esc(off ? T('La app de escritorio solo la usa Carlos: abierta sin uso no cuenta como trabajo del agente', 'Only Carlos uses the desktop app: open but unused never counts as the agent working') : x.tipo === 'cli' ? T('Canal de trabajo del agente (sesión de terminal)', "The agent's working channel (terminal session)") + (x.sesion ? ' · tmux «' + x.sesion + '»' : '') : x.tipo === 'asistente' ? T('Corre en el asistente de GrokBot (nube), lo despiertan rutinas y webhooks', 'Runs in the GrokBot assistant (cloud), woken by routines and webhooks') : T('Carlos la está usando ahora (al frente o escribiendo, reposo < 5 min)', 'Carlos is using it now (frontmost or typing, idle < 5 min)')) + '">' + esc(supTexto(x)) + '</span>';
    }).join('') + '</span>';
  }
  /** r28-sup: resumen corto para la fila plegada: «CLI», «asistente», «+ App · Carlos». */
  function supCorta(t) {
    var l = t.superficies || [], p = [];
    // r232 (Carlos, 21-11 21:37: «no está en el cli del MacStudio sino en la desktop app»): la superficie es la del Mac que
    // se enseña junto al nombre (// MacStudio). Antes salía «CLI» si había un CLI en CUALQUIER Mac (el de Trinity está en
    // el MBP16). Si en ese Mac no hay ninguna superficie, se dice en qué Mac está cada una.
    var m = maqActual(t), aqui = m ? l.filter(function (x) { return x.maquina && maqCanon(x.maquina) === m; }) : [];
    if (aqui.length) {
      if (aqui.some(function (x) { return x.tipo === 'cli'; })) p.push('CLI');
      if (aqui.some(function (x) { return x.tipo === 'app' && x.enUso; })) p.push('App · Carlos');
      else if (aqui.some(function (x) { return x.tipo === 'app'; })) p.push(T('App', 'App'));
      return p.join(' + ');
    }
    var cli = l.filter(function (x) { return x.tipo === 'cli'; })[0];
    if (cli) p.push('CLI' + (cli.maquina && maqCanon(cli.maquina) && maqCanon(cli.maquina) !== m ? ' (' + maqCanon(cli.maquina) + ')' : ''));
    // r24: el asistente ya va en el runtime («GrokBot (asistente)»): no se repite.
    if (l.some(function (x) { return x.tipo === 'app' && x.enUso; })) p.push('App · Carlos');
    return p.join(' + ');
  }
  /** r41: «con Carlos · MBP16». */
  function cc(t) { return T('con Carlos', 'with Carlos') + (t.conCarlosEn ? ' · ' + maqNombre(t.conCarlosEn) : ''); }
  /** r44: «· activo vía Merovingio» (dualidad Elon ↔ Merovingio). */
  function via(t) { return t.via ? ' · <span class="tr-via">' + esc((t.estado === 'gris' ? T('parado vía ', 'idle via ') : T('activo vía ', 'active via ')) + t.via) + '</span>' : ''; }
  function aviso(d) {
    if (!d || d.presencia === 'ok') return '';
    if (d.presencia === 'cache') return ' · <span class="tr-aviso" title="' + esc(T('Yokup no ha respondido: se usa la última presencia buena', 'Yokup did not answer: using the last good presence')) + '">⚠ ' + esc(T('presencia de ', 'presence from ') + hace(d.presenciaEdadS || 0)) + '</span>';
    return ' · <span class="tr-aviso" title="' + esc(T('Yokup no ha respondido y no hay presencia reciente: solo salen agentes con pulso de tokens', 'Yokup did not answer and there is no recent presence: only agents with a token pulse are shown')) + '">⚠ ' + T('presencia sin respuesta: pueden faltar agentes', 'no presence answer: agents may be missing') + '</span>';
  }
  /** #7037: «Encargo abierto · sin actividad desde 21-oct 06:56» (Madrid) en ámbar, en vez de «trabajando». */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fechaMadrid(iso) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return p.day + '-' + (en() ? MONTHS : MESES)[Number(p.month) - 1] + ' ' + p.hour + ':' + p.minute;
  }
  function sinAct(t) {
    var s = t.sinActividad;
    var txt = s.desde ? T('Encargo abierto · sin actividad desde ', 'Open task · no activity since ') + fechaMadrid(s.desde)
      : T('Encargo abierto · sin actividad hoy', 'Open task · no activity today');
    return '<span class="tr-est tr-sinact" title="' + esc(T('Tiene encargo en curso pero ningún token del modelo desde hace ≥ 2 h (hora de Madrid)', 'Has a task in progress but no model tokens for ≥ 2 h (Madrid time)')) + '">⚠ ' + esc(txt) + '</span>';
  }
  /* r246 (Carlos, 22-11-2026 09:57): dos señales. CONECTADO (borde verde) = su aplicación lanzada (consejero: el Grok Bot
   * de su cuenta; DeepAgent: su Desktop App Claude/Codex; agente: su CLI). ACTIVIDAD (punto) = actividad real:
   * verde demostrada, rojo nada, amarillo no se sabe. Vienen de la API (conectado / actividadLuz); si faltan (caché
   * antigua), se deducen de «estado» y de las superficies frescas. «Con Carlos» ya no es color: texto «· 👤 Carlos». */
  function luzDe(t) { return t && /^(verde|amarillo|rojo)$/.test(t.actividadLuz) ? t.actividadLuz : t && t.estado === 'verde' ? 'verde' : t && t.estado === 'amarillo' ? 'amarillo' : 'rojo'; }
  function conDe(t) { return t && typeof t.conectado === 'boolean' ? t.conectado : conAppAbierta(t); }
  function luzTxt(l) { return l === 'verde' ? T('trabajando', 'working') : l === 'amarillo' ? T('sin dato', 'no data') : T('parado', 'idle'); }
  function conTxt(t) { return conDe(t) ? T('conectado', 'connected') : T('no conectado', 'not connected'); }
  function carlosTxt(t) { return t && t.conCarlosEn ? ' · 👤 ' + T('con Carlos', 'with Carlos') + ' (' + maqNombre(t.conCarlosEn) + ')' : ''; }
  function porqueDos(t) {
    return T('Conectado: ', 'Connected: ') + (conDe(t) ? (t.conectadoPor || T('sí', 'yes')) : T('no', 'no')) + ' · ' + T('Actividad: ', 'Activity: ') + luzTxt(luzDe(t)) + (t.actividadPorque ? ' — ' + t.actividadPorque : t.porqueColor ? ' — ' + t.porqueColor : '') + (t.conCarlosEn ? ' · ' + T('Carlos está en ', 'Carlos is on ') + maqNombre(t.conCarlosEn) : '');
  }
  function claseDos(t) { return (conDe(t) ? ' tr-con' : ' tr-descon') + ' tr-luz-' + luzDe(t); }
  function tarjeta(t) {
    var motor = rt([t.motor, t.modelo && t.modelo !== t.motor ? t.modelo : ''].filter(Boolean).join(' · '));
    var que = t.queHace !== undefined ? queHaceTxt(t) : (t.tarea || t.foco || ''); // r242
    var ult = t.queHace !== undefined ? '' : T('último', 'last') + ': ';
    // r246: «conectado · trabajando — tokens propios hace 71 s · misión»
    var linea = '<span class="tr-est">' + esc(conTxt(t) + ' · ' + luzTxt(luzDe(t))) + '</span>' + (t.actividadPorque ? ' · ' + esc(t.actividadPorque) : '') + esc(carlosTxt(t)) + via(t) + (t.sinActividad ? ' · ' + sinAct(t) : '') + tokens(t) + (que ? ' · ' + ult + esc(que) : '');
    var fuera = t.fuera && t.fuera.length ? '<span class="tr-chip tr-fuera" title="' + esc(t.fuera.join(' · ')) + '">⚠ ' + T('de pago fuera de las 6', 'paid outside the 6') + '</span>' : '';
    var chips = fuera + notaCoste(t) + (t.proyecto ? '<span class="tr-chip">' + esc(t.proyecto) + '</span>' : '') + (t.encargo ? '<span class="tr-chip tr-enc">' + esc(t.encargo) + '</span>' : '');
    return '<li class="tr-card' + claseDos(t) + (t.fuera && t.fuera.length ? ' tr-fuera6' : '') + '" title="' + esc(porqueDos(t) + (t.incluye && t.incluye.length ? ' · ' + T('incluye el consumo de ', 'includes the usage of ') + t.incluye.join(', ') : '')) + '">' + retrato(t) +
      '<span class="tr-txt"><b class="tr-nom"><i class="tr-punto" aria-hidden="true"></i>' + esc(vis(t.agente)) + nHoy(t) + '</b>' +
      '<small class="tr-maq tr-rot"><span class="tr-a">' + esc([maqNombre(t.maquina), motor].filter(Boolean).join(' · ') || '—') + '</span><span class="tr-c" title="' + esc(focoTitulo(t)) + '">' + esc(focoTxt(t) || [maqNombre(t.maquina), motor].filter(Boolean).join(' · ') || '—') + '</span></small>' +
      '<small class="tr-que">' + linea + '</small>' + superficies(t) + (chips ? '<span class="tr-chips">' + chips + '</span>' : '') + '</span></li>';
  }
  /** r43 (Carlos, 12:59): dos grupos, AGENTES y CONSEJEROS, cada uno con sus cuentas. Puro (testeable). */
  function grupos(ts) {
    var g = { agentes: [], consejeros: [] };
    (ts || []).forEach(function (t) { (t.grupo === 'consejeros' || (!t.grupo && t.consejero) ? g.consejeros : g.agentes).push(t); });
    // r246: conectados (borde) y, por el punto, trabajando / parados / sin dato. conCarlos queda como dato (ya no es color).
    function cuenta(l) {
      var n = function (f) { return l.filter(f).length; };
      return { conectados: n(conDe), trabajando: n(function (t) { return luzDe(t) === 'verde'; }), parados: n(function (t) { return luzDe(t) === 'rojo'; }),
        sinDato: n(function (t) { return luzDe(t) === 'amarillo'; }), conCarlos: n(function (t) { return !!t.conCarlosEn; }), total: l.length };
    }
    return [{ id: 'agentes', titulo: T('Agentes', 'Agents'), tarjetas: g.agentes, n: cuenta(g.agentes) },
            { id: 'consejeros', titulo: T('Consejeros', 'Councillors'), tarjetas: g.consejeros, n: cuenta(g.consejeros) }];
  }
  /** r246: x = trabajando (punto verde, actividad real demostrada). Carlos 22-10-2026: cabecera «AGENTES (x/y)» / «CONSEJEROS (x/y)»: x = trabajando ahora (verde, la misma lógica
   *  que el reloj «Agentes (x/y)»: «con Carlos» no cuenta como trabajando), y = total del grupo en el panel. Puro. */
  function xyGrupo(n) { var t = (n && n.total) || 0, x = Math.min((n && n.trabajando) || 0, t); return x + '/' + t; }
  function rotGrupo(g) { return g.titulo + ' (' + xyGrupo(g.n) + ')'; }
  /** r227 (Carlos): una ficha parada pero con su app de escritorio o sesión CLI abierta (señal fresca: pulso < 3 min o
   *  latido < 15 min) no es lo mismo que apagada. Sigue sin contar como «trabajando» (no gasta tokens), pero se dice. */
  function conAppAbierta(t) {
    return ((t && t.superficies) || []).some(function (x) {
      if (!x || !x.maquina || (x.fuente !== 'pulso' && x.fuente !== 'latido')) return false;
      return x.tipo === 'app' || (x.tipo === 'cli' && Object.prototype.hasOwnProperty.call(x, 'sesion'));
    });
  }
  function nAbiertas(ts) { return (ts || []).filter(function (t) { return t.estado !== 'verde' && t.estado !== 'amarillo' && conAppAbierta(t); }).length; }
  /** r246: «4 conectados · 1 trabajando · 2 parados · 1 sin dato». */
  function cifras(n) {
    return '<b>' + n.conectados + '</b> ' + T(n.conectados === 1 ? 'conectado' : 'conectados', 'connected') + ' · <b class="tr-n-verde">' + n.trabajando + '</b> ' + T('trabajando', 'working') +
      ' · <b class="tr-n-rojo">' + n.parados + '</b> ' + T(n.parados === 1 ? 'parado' : 'parados', 'idle') + ' · <b class="tr-n-amarillo">' + n.sinDato + '</b> ' + T('sin dato', 'no data');
  }
  /** r11: «MBA16 · +C» ↔ «Claude» (o «OpenCode · Nemotron 3 Ultra»); si falta un lado, se repite el otro. */
  /** r26: foco de la ficha: «admira.live · Morfeo» (consejero: proyecto principal · deepagent; agente: proyecto actual). */
  function focoTxt(t) {
    var f = t.foco; if (!f || !f.proyecto) return '';
    return f.proyecto + (f.deepagent ? ' · ' + f.deepagent : '') + (f.defecto ? ' · ' + T('por defecto', 'default') : '');
  }
  function focoTitulo(t) {
    var f = t.foco; if (!f) return '';
    var de = { consejero: T('fijado por el consejero', 'set by the councillor'), agente: T('fijado por el agente', 'set by the agent'), latido: T('de su latido', 'from its heartbeat'),
      ahora: T('proyecto en el que trabaja ahora', 'project it is working on now'), reparto: T('pilar del reparto del finde', 'weekend split pillar'), defecto: T('valor por defecto (aún no lo ha fijado)', 'default value (not set yet)'), training: T('sin proyecto reportado', 'no project reported') }[f.fuente] || '';
    return (t.consejero ? T('Proyecto principal · deepagent', 'Main project · deepagent') : T('Proyecto', 'Project')) + ': ' + focoTxt(t) + (de ? ' (' + de + ')' : '');
  }
  /** r45 (encargo #6919): nombres completos de ordenador en /consumos: «Mini» → «MacMini», «MBP16» → «MacBookPro16»… */
  var LARGAS = { mini: 'MacMini', macmini: 'MacMini', studio: 'MacStudio', macstudio: 'MacStudio', mbp16: 'MacBookPro16', mbp14: 'MacBookPro14', mba16: 'MacBookAir16', mba13: 'MacBookAir13', box: 'GrokBotBox', macbookpro16: 'MacBookPro16', macbookpro14: 'MacBookPro14', macbookpronegro14: 'MacBookPro14', macbookair16: 'MacBookAir16', macbookair16plata: 'MacBookAir16', grokbotbox: 'GrokBotBox' };
  function maqNombre(s) {
    if (!s) return s;
    return String(s).split(' + ').map(function (m) { return LARGAS[m.toLowerCase().replace(/[^a-z0-9]/g, '')] || m; }).join(' + ');
  }
  /** Carlos 22-10-2026: «Nombre // Máquina». Máquina canónica: MacMini · MacStudio · MBP16 · MBP14 · Android · iPhone;
   *  donde corre ahora (con Carlos → su Mac; si no, la del último latido = t.maquina). «GrokBot» (caja en la nube) solo si
   *  ningún Mac aplica. Desconocida → sin sufijo. */
  function maqCanon(s) {
    var k = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k) return '';
    if (/^(mini|macmini)/.test(k)) return 'MacMini';
    if (/studio/.test(k)) return 'MacStudio';
    if (/(pro16|mbp16)/.test(k)) return 'MBP16';
    if (/(pro14|negro14|mbp14)/.test(k)) return 'MBP14';
    if (/(android|samsung|fold|galaxy|pixel)/.test(k)) return 'Android';
    if (/iphone/.test(k)) return 'iPhone';
    if (/(grokbot|box|cloud|nube)/.test(k)) return 'GrokBot';
    return '';
  }
  function maqActual(t) {
    var cands = [t.estado === 'amarillo' ? t.conCarlosEn : null, t.maquina, String(t.maqCorta || '').split(' + ')[0]].concat(t.maquinas || []);
    var gbot = '';
    for (var i = 0; i < cands.length; i++) { var c = maqCanon(cands[i]); if (c === 'GrokBot') gbot = c; else if (c) return c; }
    return gbot;
  }
  function sufMaq(t) { var m = maqActual(t); return m ? '<span class="tr-maqsuf"><span class="tr-sl">//</span> ' + esc(m) + '</span>' : ''; }
  /** r45: misión del chip: «#6919 · título» si hay encargo, si no «FLT · título» (tarea o foco). */
  function misionTxt(t) {
    var tit = String(t.tarea || '').replace(/(?:encargo\s*)?#\d{3,6}\b|\bFLT-\d{3,6}\b/gi, '').replace(/^[\s·:—-]+|[\s·:—-]+$/g, '').trim() || focoTxt(t);
    if (!tit && !t.encargo) return '';
    return (t.encargo || 'FLT') + (tit ? ' · ' + tit : '');
  }
  /** r242 (Carlos, 21-11-2026 22:50: «que ponga en que esta el Agente o el DeepAgent … la misión actual o la ultima que
   *  ha hecho»). Texto FIJO de la fila (ya no rota cada 15 s): t.queHace de la API → «#7621 · título» (en curso),
   *  «última: #7643 · título · 18:33», «último: chat con Steve Jobs · 22:32» o «sin misión registrada». Si la misión es
   *  de otro Mac que el mostrado, lo dice («· en MBP16»): no se atribuye a la app de este. */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function madrid(ts) {
    try {
      var f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts * 1000));
      var o = {}; f.forEach(function (x) { o[x.type] = x.value; }); return o;
    } catch (e) { return null; }
  }
  function horaMision(ts, desde) {
    if (!ts) return '';
    var a = madrid(ts), h = madrid(Date.now() / 1000);
    if (!a) return '';
    var hm = a.hour + ':' + a.minute, mismoDia = h && a.day === h.day && a.month === h.month && a.year === h.year;
    if (desde) return mismoDia ? '' : T('desde ', 'since ') + Number(a.day) + '-' + MESES[Number(a.month) - 1];
    return mismoDia ? hm : Number(a.day) + '-' + MESES[Number(a.month) - 1] + ' ' + hm;
  }
  function queHaceTxt(t) {
    var q = t && t.queHace;
    if (!q || !q.titulo) return T('sin misión registrada', 'no mission on record');
    var cab = (q.id ? q.id + ' · ' : '') + q.titulo;
    var otra = q.otraMaquina && q.maquina ? ' · ' + T('en ', 'on ') + (maqCanon(q.maquina) || q.maquina) : '';
    if (q.tipo === 'en_curso') { var d = horaMision(q.ts, true); return cab + (d ? ' · ' + d : '') + otra; }
    if (q.tipo === 'declarado') return cab + otra;
    var hm = horaMision(q.ts);
    return (q.tipo === 'ultima' ? T('última: ', 'last: ') : T('último: ', 'latest: ')) + cab + (hm ? ' · ' + hm : '') + otra;
  }
  /** r244 (Carlos, 23:31): «(N)» junto al nombre = misiones HECHAS hoy (Madrid) según la bandeja de Yokup de ese agente,
   *  en todas sus máquinas; tooltip con número, título y hora. Sin dato de la bandeja (null) no se pinta nada. */
  function nHoy(t) {
    // r248 (Carlos, 22-11 11:46): N = TRABAJOS hechos hoy — misiones done de Yokup + PRs fusionados con rama del agente
    // (TrabajosHoy.combinar); sin esos datos, las misiones de la API (r244).
    var tr = t && Array.isArray(t.trabajosHoy) ? t.trabajosHoy : null;
    var l = tr || (t && t.hechasHoy);
    if (!Array.isArray(l)) return '';
    // r252: cada trabajo contado, numerado, para auditar el (N): PR = rama + repos#número; misión = #id (+ sus PRs).
    var linea = function (m, i) { var a = madrid(m.ts); return (i + 1) + '. ' + (m.tipo === 'pr' ? 'PR ' + (m.rama ? m.rama + ' · ' : '') + (m.prs || []).join(' + ') : T('misión ', 'mission ') + m.id) + (a ? ' · ' + a.hour + ':' + a.minute : '') + (m.maquina ? ' · ' + (maqCanon(m.maquina) || m.maquina) : '') + (m.titulo && m.titulo !== m.rama ? ' · ' + m.titulo : '') + (m.tipo === 'mision' && m.prs && m.prs.length ? ' (PR ' + m.prs.join(' + ') + ')' : '') + (m.deDestinatario ? ' · ' + T('encargada a ', 'assigned to ') + m.deDestinatario : ''); };
    var tip = l.length ? (tr ? T('Trabajos hechos hoy', 'Work done today') : T('Misiones cumplidas hoy', 'Missions completed today')) + ' (' + l.length + '):\n' + l.map(linea).join('\n')
      : T('Ningún trabajo hecho hoy (bandeja de Yokup y PRs fusionados)', 'No work done today (Yokup inbox and merged PRs)');
    if (t && Array.isArray(t.trabajosCedidos) && t.trabajosCedidos.length) tip += '\n' + T('Cedidas a quien las hizo (no cuentan aquí): ', 'Credited to whoever did them: ') + t.trabajosCedidos.join(', ');
    // r247 (Carlos, 22-11 10:26): el número lleva color — gris nada hoy · amarillo misión en curso · verde última de hoy
    // hecha · rojo última de hoy no acabada bien (failed / blocked); desglose «2 hechas · 1 en curso · 1 fallida».
    var luz = nLuz(t), d = t.misionesDesglose;
    if (d && d.texto) tip = d.texto + '\n' + tip + (d.enCursoIds && d.enCursoIds.length ? '\n' + T('En curso: ', 'In progress: ') + d.enCursoIds.join(', ') : '') +
      (d.fallidasIds && d.fallidasIds.length ? '\n' + T('No acabadas bien: ', 'Not completed well: ') + d.fallidasIds.join(', ') : '') +
      (d.sinCerrarIds && d.sinCerrarIds.length ? '\n' + T('Sin cerrar (> 24 h, no da color): ', 'Never closed (> 24 h, no colour): ') + d.sinCerrarIds.join(', ') : '');
    return ' <span class="tr-nhoy tr-nhoy-' + luz + (l.length ? '' : ' tr-nhoy0') + '" title="' + esc(tip) + '">(' + l.length + ')</span>';
  }
  /** r247: color del «(N)»: el de la API (misionesLuz) o, con API vieja, verde si N > 0 y gris si 0. */
  function nLuz(t) { return t && /^(gris|amarillo|verde|rojo)$/.test(t.misionesLuz || '') ? t.misionesLuz : t && Array.isArray(t.hechasHoy) && t.hechasHoy.length ? 'verde' : 'gris'; }
  function fijaChip(t) {
    var a = queHaceTxt(t);
    var c = llmTxt(t), sc = supCorta(t);
    if (/\bCLI\b/.test(c)) sc = sc.replace(/^CLI( \+ )?/, '');
    var proy = t.proyecto && t.proyecto !== 'otros' && a.toLowerCase().indexOf(String(t.proyecto).toLowerCase()) < 0 ? t.proyecto : '';
    var peq = [proy, c, sc, t.gratis && !/gratis|free/i.test(c) ? T('gratis', 'free') : t.planC ? '+C' : ''].filter(Boolean).join(' · ');
    var tit = { en_curso: T('Misión en curso', 'Mission in progress'), declarado: T('Tarea declarada en su latido', 'Task declared in its heartbeat'), ultima: T('Última misión hecha', 'Last mission done'), ultimo: T('Lo último que hizo', 'Latest activity') }[(t.queHace || {}).tipo] || '';
    return ' <small class="tr-alt tr-fija' + (t.queHace && t.queHace.titulo ? '' : ' tr-sinmision') + '" title="' + esc((tit ? tit + ': ' : '') + a + (peq ? ' · ' + peq : '')) + '"><span class="tr-qh">' + esc(a) + '</span>' + (peq ? '<span class="tr-peq">' + esc(peq) + '</span>' : '') + '</small>';
  }
  /** r45: LLM / modelo del chip («Claude · claude-opus-5», «GrokBot CLI»…). */
  function llmTxt(t) { return rt([t.motor || t.runtime, t.modelo && t.modelo !== t.motor ? t.modelo : ''].filter(Boolean).join(' · ')); }
  function altChip(t, sinMaq) {
    // r45 (encargo #6919): cada 15 s, como el ciclo del panel: misión → ordenador → LLM/modelo.
    var maq = maqNombre(t.appMaquinas && t.appMaquinas.length > 1 ? t.maqCorta : t.estado === 'amarillo' && t.conCarlosEn ? t.conCarlosEn : (t.maquina || t.maqCorta));
    var a = misionTxt(t);
    // Con «// Máquina» junto al nombre, la máquina no se repite a la derecha (quedan «gratis», «+C»).
    if (sinMaq && maqActual(t)) maq = '';
    var b = [maq, t.gratis ? T('gratis', 'free') : t.planC ? '+C' : ''].filter(Boolean).join(' · ');
    // La superficie (CLI / App · Carlos) acompaña al LLM; sin «GrokBot CLI · CLI».
    var c = llmTxt(t), sc = supCorta(t);
    if (/\bCLI\b/.test(c)) sc = sc.replace(/^CLI( \+ )?/, '');
    c = [c, sc].filter(Boolean).join(' · ');
    if (!a && !b && !c) return '';
    return ' <small class="tr-alt" title="' + esc(T('Cada 15 s: misión → ordenador → LLM', 'Every 15 s: mission → computer → LLM') + (a ? ' · ' + a : '')) + '"><span class="tr-a">' + esc(a || b || c) + '</span><span class="tr-b">' + esc(b || a || c) + '</span><span class="tr-c">' + esc(c || a || b) + '</span></small>';
  }
  /** r24 (Carlos, 18:00 — «Trinity ni siquiera sale»): todos con nombre. Primero los que trabajan / con Carlos; después
   *  los parados como chips atenuados «Trinity · Codex · CLI · en espera» (antes, caras anónimas en un montón). */
  function chipsDe(l) {
    // r246: un solo chip: borde = conectado, punto = actividad real. Orden: DeepAgents (orden de /deepagents) y después
    // trabajando → sin dato → parados, conectados antes que no conectados.
    function chip(t) {
      var L = luzDe(t), C = conDe(t);
      var cuenta250 = C && t.grupo !== 'consejeros' && !t.consejero && (t.superficies || []).some(function (x) { return x && x.tipo === 'app' && /^(claude|codex)$/i.test(String(x.app || '')) && (x.fuente === 'pulso' || x.fuente === 'latido'); });
      var lado = (C ? T('conectado', 'connected') + (cuenta250 ? ' · 250k/h' : '') + ' · ' : '') + luzTxt(L) + (t.conCarlosEn ? ' · 👤' : '');
      return '<span class="tr-chipa' + claseDos(t) + (t.fuera && t.fuera.length ? ' tr-fuera6' : '') + '" title="' + esc(vis(t.agente) + ' · ' + porqueDos(t)) + '">' + retrato(t) + '<i></i>' + esc(vis(t.agente)) + nHoy(t) + sufMaq(t) + fijaChip(t) + ' <small class="tr-espera">' + esc(lado) + '</small></span>';
    }
    var esDA = function (t) { return t._da >= 0; };
    var ORD = { verde: 0, amarillo: 1, rojo: 2 };
    var resto = l.filter(function (t) { return !esDA(t); }).map(function (t, i) { return [t, i]; }).sort(function (a, b) {
      return ORD[luzDe(a[0])] - ORD[luzDe(b[0])] || (conDe(b[0]) - conDe(a[0])) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    return l.filter(esDA).map(chip).join('') + resto.map(chip).join('');
  }
  /* r235 (Carlos, 21-11 22:15: «Trabajando Ahora tiene que empezar por los DeepAgents y si estan abiertos como en
   * deepagents que aparezcan en verde»). Los cuatro deepagents (orden de /deepagents: Trinity, Neo, Oráculo, Morfeo) van
   * primero; después el resto en su orden. Un deepagent ABIERTO según la misma regla de /deepagents
   * (DeepAgentsEstado.abiertoEn: app/sesión en el pulso de su Mac) sale VERDE aunque no gaste tokens ahora
   * (t.abiertoDA = el porqué); «con Carlos» (amarillo) sigue mandando. Rojo/gris solo si no está abierto. Copia: los
   * datos originales (los del evento flota:trabajando, que usan los relojes) no se tocan. Puro. */
  function normN(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function conDeepAgents(ts) {
    var DA = root.DeepAgentsEstado;
    if (!DA || !DA.resumen || !ts) return ts;
    var res = DA.resumen(ts), pos = {};
    res.forEach(function (a, i) { pos[normN(a.agente)] = i; });
    var out = ts.map(function (t, i) {
      var k = t && pos.hasOwnProperty(normN(t.agente)) ? pos[normN(t.agente)] : -1;
      var c = {}; for (var p in t) if (Object.prototype.hasOwnProperty.call(t, p)) c[p] = t[p];
      c._i = i; c._da = k;
      // r246: «abierto» ya NO pinta el punto verde (r235 deshecho): es conectado (borde). Solo el orden.
      return c;
    });
    return out.sort(function (a, b) { var da = a._da < 0 ? 99 : a._da, db = b._da < 0 ? 99 : b._da; return da - db || a._i - b._i; });
  }
  function pinta(d) {
    var ul = document.getElementById('trabajando-lista'), pie = document.getElementById('trabajando-pie'), res = document.getElementById('trabajando-resumen');
    if (!ul) return;
    var ts = d && d.ok ? d.tarjetas || [] : null;
    if (!ts) { ul.innerHTML = '<li class="tr-vacio">' + T('Sin datos de presencia ni de pulso ahora: no se enseña nadie.', 'No presence or pulse data right now: nobody is shown.') + '</li>'; return; }
    var gs = grupos(conDeepAgents(ts));
    // r43: una cabecera por grupo (ocupa toda la fila de la rejilla) con sus cuentas, y debajo sus tarjetas.
    ul.innerHTML = gs.map(function (g) {
      return '<li class="tr-grupo" id="trabajando-' + g.id + '"><b>' + esc(rotGrupo(g)) + '</b> <small>' + cifras(g.n, g.tarjetas) + '</small></li>' +
        (g.tarjetas.length ? g.tarjetas.map(tarjeta).join('') : '<li class="tr-vacio">' + T('Nadie en este grupo ahora.', 'Nobody in this group right now.') + '</li>');
    }).join('');
    // r31/r43: fila compacta (zona plegada), también por grupo.
    var ch = document.getElementById('trabajando-chips');
    ponFase(ch); ponFase(ul); if (ch) ch.innerHTML = gs.map(function (g) { return '<span class="tr-chipgrupo"><b class="tr-chiptit">' + esc(rotGrupo(g)) + '</b>' + chipsDe(g.tarjetas) + '</span>'; }).join('');
    if (res) res.innerHTML = gs.map(function (g) { return '<span class="tr-resgrupo">' + esc(g.titulo) + ': ' + cifras(g.n, g.tarjetas) + '</span>'; }).join(' — ') + aviso(d);
    if (pie) pie.innerHTML = T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid' }) + ' (Madrid) · ' +
      T('borde verde = CONECTADO, su aplicación está lanzada (consejero: el Grok Bot de su cuenta abierto en algún Mac — Leyendas = Jobs, Wozniak, Lucas, Disney; Coetáneos = Musk, Jensen —; DeepAgent: su Desktop App Claude o Codex, o si no su CLI; agente: su CLI); borde gris discontinuo = no conectado · el PUNTO es la actividad real: verde = trabajando de verdad (tokens propios hace < 5 min, su app a más del 40 % de CPU, su CLI a más del 10 % de CPU, latido «trabajando» del consejero o mensaje / encargo / acción propia hace < 10 min); rojo = parado (nada lanzado, o lanzado y con pulso medible pero sin tokens ni CPU); amarillo = sin dato (lanzado pero el pulso de su Mac no da tokens ni CPU, o Grok Bot compartido sin actividad atribuible) · «👤 con Carlos» = Carlos está en ese Mac (ya no es un color) · 250k/h = suelo por Desktop App abierta (depende de CONECTADO) · (N) = trabajos hechos hoy (día de Madrid): misiones cerradas en Yokup + PRs fusionados con rama del agente (trinity/…, neo/…, woz/…; una misión y sus PRs cuentan una vez y se acreditan a quien la hizo; los repos privados no se ven), con su color: gris = ninguna hoy · amarillo = misión en curso ahora (aceptada en las últimas 24 h) · verde = la última de hoy acabó bien (done) · rojo = la última de hoy no acabó bien (failed / blocked; «cancelada» no cuenta: suele ser una sustitución) · fuentes: ',
        'green border = CONNECTED, its app is running (councillor: the Grok Bot of its account open on some Mac; DeepAgent: its Claude or Codex desktop app, or else its CLI; agent: its CLI); dashed grey border = not connected · the DOT is real activity: green = actually working (own tokens < 5 min ago, its app above 40 % CPU, its CLI above 10 % CPU, councillor «working» heartbeat or own message / task / action < 10 min ago); red = idle (nothing running, or running with a measurable pulse but no tokens or CPU); yellow = no data (running but its Mac\'s pulse gives no tokens or CPU, or a shared Grok Bot with no attributable activity) · «👤 with Carlos» = Carlos is on that Mac (no longer a colour) · 250k/h = floor per open desktop app (depends on CONNECTED) · (N) = work done today (Madrid day): missions closed in Yokup + merged PRs on the agent\'s branch (a mission and its PRs count once, credited to whoever did it; private repos are not visible), with a colour: grey = none today · yellow = a mission in progress now (accepted in the last 24 h) · green = today\'s last one ended well (done) · red = today\'s last one did not end well (failed / blocked; «cancelled» does not count: it is usually a replacement) · sources: ') +
      '<a href="https://bot.yokup.com/api/presence">' + T('presencia de Yokup', 'Yokup presence') + '</a> + <a href="/api/consumos/velocidad">' + T('pulso de tokens', 'token pulse') + '</a>' +
      (d.presencia === 'cache' ? ' · ⚠ ' + T('presencia de caché (hace ', 'cached presence (') + esc(String(d.presenciaEdadS)) + T(' s)', ' s ago)') : d.presencia !== 'ok' ? ' · ⚠ ' + T('presencia sin respuesta', 'no presence answer') : '') + ' · ' + T('cada 10 s', 'every 10 s');
  }
  function avisa(d) { ultimo = d; try { root.dispatchEvent(new CustomEvent('flota:trabajando', { detail: d })); } catch (e) {} return d; }
  // r248: los relojes reciben los datos tal cual (avisa); la lista, con los trabajos de hoy (misiones + PRs fusionados).
  function conTrabajos(d) { return root.TrabajosHoy && d && d.ok ? root.TrabajosHoy.asegurar(d).catch(function () { return d; }) : d; }
  function leer() { return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(avisa).then(conTrabajos).then(pinta); }
  function arranca() {
    if (!document.getElementById('trabajando')) return;
    leer();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
    setInterval(alterna, 1000);
  }
  root.ConsumosTrabajando = { conDeepAgents: conDeepAgents, grupos: grupos, luzDe: luzDe, conDe: conDe, cifras: cifras, xyGrupo: xyGrupo, rotGrupo: rotGrupo, focoTxt: focoTxt, altChip: altChip, maqNombre: maqNombre, maqCanon: maqCanon, maqActual: maqActual, misionTxt: misionTxt, queHaceTxt: queHaceTxt, fijaChip: fijaChip, nHoy: nHoy, nLuz: nLuz, chipsDe: chipsDe, supTexto: supTexto, supCorta: supCorta, leer: leer, ultimo: function () { return ultimo; } };
  root.addEventListener && root.addEventListener('admira:languagechange', function () { if (ultimo) pinta(ultimo); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
