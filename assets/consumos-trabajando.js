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
    if (l.some(function (x) { return x.tipo === 'cli'; })) p.push('CLI');
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
  function tarjeta(t) {
    var motor = rt([t.motor, t.modelo && t.modelo !== t.motor ? t.modelo : ''].filter(Boolean).join(' · '));
    var que = t.tarea || t.foco || '';
    var linea;
    if (t.estado === 'rojo') linea = '<span class="tr-est">' + T('sin actividad', 'inactive') + ' · ' + esc(hace(t.haceS)) + '</span>' + via(t) + (que ? ' · ' + T('último', 'last') + ': ' + esc(que) : '');
    else if (t.estado === 'gris') linea = t.motivo === 'sin latido' ? '<span class="tr-est">' + T('sin latido', 'no heartbeat') + '</span>' : '<span class="tr-est">' + T('parado', 'idle') + ' · ' + esc(hace(t.haceS)) + '</span>' + via(t) + (que ? ' · ' + T('último', 'last') + ': ' + esc(que) : '');
    else if (t.sinActividad) linea = sinAct(t) + via(t) + (que ? ' · ' + esc(que) : '');
    else linea = '<span class="tr-est">' + (t.estado === 'amarillo' ? esc(cc(t)) : T('trabajando', 'working')) + '</span>' + via(t) + (t.enCurso > 0 ? ' · ' + t.enCurso + ' ' + T('en curso', 'in progress') : '') + tokens(t) + (que ? ' · ' + esc(que) : '');
    var fuera = t.fuera && t.fuera.length ? '<span class="tr-chip tr-fuera" title="' + esc(t.fuera.join(' · ')) + '">⚠ ' + T('de pago fuera de las 6', 'paid outside the 6') + '</span>' : '';
    var chips = fuera + notaCoste(t) + (t.proyecto ? '<span class="tr-chip">' + esc(t.proyecto) + '</span>' : '') + (t.encargo ? '<span class="tr-chip tr-enc">' + esc(t.encargo) + '</span>' : '');
    return '<li class="tr-card tr-' + esc(t.estado) + (t.fuera && t.fuera.length ? ' tr-fuera6' : '') + '" title="' + esc(t.porqueColor ? t.porqueColor : gb(t.motivo) + (t.foco ? ' — ' + t.foco : '') + (t.incluye && t.incluye.length ? ' · ' + T('incluye el consumo de ', 'includes the usage of ') + t.incluye.join(', ') : '')) + '">' + retrato(t) +
      '<span class="tr-txt"><b class="tr-nom"><i class="tr-punto" aria-hidden="true"></i>' + esc(vis(t.agente)) + '</b>' +
      '<small class="tr-maq tr-rot"><span class="tr-a">' + esc([maqNombre(t.maquina), motor].filter(Boolean).join(' · ') || '—') + '</span><span class="tr-c" title="' + esc(focoTitulo(t)) + '">' + esc(focoTxt(t) || [maqNombre(t.maquina), motor].filter(Boolean).join(' · ') || '—') + '</span></small>' +
      '<small class="tr-que">' + linea + '</small>' + superficies(t) + (chips ? '<span class="tr-chips">' + chips + '</span>' : '') + '</span></li>';
  }
  /** r43 (Carlos, 12:59): dos grupos, AGENTES y CONSEJEROS, cada uno con sus cuentas. Puro (testeable). */
  function grupos(ts) {
    var g = { agentes: [], consejeros: [] };
    (ts || []).forEach(function (t) { (t.grupo === 'consejeros' || (!t.grupo && t.consejero) ? g.consejeros : g.agentes).push(t); });
    function cuenta(l) {
      var v = l.filter(function (t) { return t.estado === 'verde'; }).length, a = l.filter(function (t) { return t.estado === 'amarillo'; }).length;
      return { trabajando: v, conCarlos: a, parados: l.length - v - a, total: l.length };
    }
    return [{ id: 'agentes', titulo: T('Agentes', 'Agents'), tarjetas: g.agentes, n: cuenta(g.agentes) },
            { id: 'consejeros', titulo: T('Consejeros', 'Councillors'), tarjetas: g.consejeros, n: cuenta(g.consejeros) }];
  }
  /** Carlos 22-10-2026: cabecera «AGENTES (x/y)» / «CONSEJEROS (x/y)»: x = trabajando ahora (verde, la misma lógica
   *  que el reloj «Agentes (x/y)»: «con Carlos» no cuenta como trabajando), y = total del grupo en el panel. Puro. */
  function xyGrupo(n) { var t = (n && n.total) || 0, x = Math.min((n && n.trabajando) || 0, t); return x + '/' + t; }
  function rotGrupo(g) { return g.titulo + ' (' + xyGrupo(g.n) + ')'; }
  function cifras(n) {
    return '<b>' + n.trabajando + '</b> ' + T('trabajando', 'working') + ' · <b>' + n.conCarlos + '</b> ' + T('con Carlos', 'with Carlos') + ' · <b>' + n.parados + '</b> ' + T('parados', 'idle');
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
    var vivos = l.filter(function (t) { return t.estado !== 'gris' && t.estado !== 'rojo'; }), rojos = l.filter(function (t) { return t.estado === 'rojo'; }), grises = l.filter(function (t) { return t.estado === 'gris'; });
    function chip(t) {
      var gris = t.estado === 'gris', rojo = t.estado === 'rojo';
      var est = gris ? T('en espera', 'idle') : rojo ? T('sin actividad > 1 h (activo hoy)', 'inactive > 1 h (active today)') : t.estado === 'amarillo' ? cc(t) : T('trabajando', 'working');
      return '<span class="tr-chipa tr-' + esc(t.estado) + (t.fuera && t.fuera.length ? ' tr-fuera6' : '') + '" title="' + esc(t.porqueColor ? t.porqueColor : vis(t.agente) + ' · ' + est + (t.via ? ' · ' + T('vía ', 'via ') + t.via : '') + ' · ' + rt(t.motor || '') + (supCorta(t) ? ' · ' + supCorta(t) : '') + (t.planC ? T(' + plan C gratis', ' + free plan C') : t.gratis ? T(' · gratis', ' · free') : '') + ((gris || rojo) && t.haceS != null ? ' · ' + hace(t.haceS) : '')) + '">' + retrato(t) + '<i></i>' + esc(vis(t.agente)) + sufMaq(t) + altChip(t, true) + (gris ? ' <small class="tr-espera">' + esc(T('en espera', 'idle')) + '</small>' : rojo ? ' <small class="tr-espera">' + esc(hace(t.haceS) || T('hoy', 'today')) + '</small>' : '') + '</span>';
    }
    return vivos.map(chip).join('') + rojos.map(chip).join('') + grises.map(chip).join('');
  }
  function pinta(d) {
    var ul = document.getElementById('trabajando-lista'), pie = document.getElementById('trabajando-pie'), res = document.getElementById('trabajando-resumen');
    if (!ul) return;
    var ts = d && d.ok ? d.tarjetas || [] : null;
    if (!ts) { ul.innerHTML = '<li class="tr-vacio">' + T('Sin datos de presencia ni de pulso ahora: no se enseña nadie.', 'No presence or pulse data right now: nobody is shown.') + '</li>'; return; }
    var gs = grupos(ts);
    // r43: una cabecera por grupo (ocupa toda la fila de la rejilla) con sus cuentas, y debajo sus tarjetas.
    ul.innerHTML = gs.map(function (g) {
      return '<li class="tr-grupo" id="trabajando-' + g.id + '"><b>' + esc(rotGrupo(g)) + '</b> <small>' + cifras(g.n) + '</small></li>' +
        (g.tarjetas.length ? g.tarjetas.map(tarjeta).join('') : '<li class="tr-vacio">' + T('Nadie en este grupo ahora.', 'Nobody in this group right now.') + '</li>');
    }).join('');
    // r31/r43: fila compacta (zona plegada), también por grupo.
    var ch = document.getElementById('trabajando-chips');
    ponFase(ch); ponFase(ul); if (ch) ch.innerHTML = gs.map(function (g) { return '<span class="tr-chipgrupo"><b class="tr-chiptit">' + esc(rotGrupo(g)) + '</b>' + chipsDe(g.tarjetas) + '</span>'; }).join('');
    if (res) res.innerHTML = gs.map(function (g) { return '<span class="tr-resgrupo">' + esc(g.titulo) + ': ' + cifras(g.n) + '</span>'; }).join(' — ') + aviso(d);
    if (pie) pie.innerHTML = T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid' }) + ' (Madrid) · ' +
      T('verde = en un agente, SOLO si gasta tokens de verdad (tokens en los últimos 15 min o en la última hora) o su app de escritorio está en uso (proceso vivo o encargos abiertos no bastan); en un consejero, tokens, latido «trabajando», CPU del proceso, latido con encargo en curso o su consejero_latido «trabajando» vigente · amarillo = con Carlos (pulso, o app de escritorio / tmux adjunto en el Mac que estás usando) · rojo = sin actividad desde hace más de 1 h, pero activo hoy (Madrid) · gris = sin actividad hoy · consejeros = los 16 del Consejo (leyendas y coetáneos) · Terminal (CLI) = canal de trabajo del agente; la app de escritorio solo la usa Carlos («App de escritorio · Carlos» si la está usando; «App abierta, sin uso», atenuado, nunca cuenta como trabajo) · fuentes: ',
        'green = tokens in the last 15 min, «working» heartbeat &lt; 2 min old, the process\'s own CPU or a heartbeat &lt; 15 min old with a task in progress (any runtime, also the free plan C) · yellow = with Carlos (pulse, or desktop app / attached tmux on the Mac you are using) · red = no activity for over 1 h, but active today (Madrid) · grey = no activity today · councillors = the 16 of the Council (legends and contemporaries) · Terminal (CLI) = the agent\'s working channel; only Carlos uses the desktop app («Desktop app · Carlos» when he is using it; «App open, not in use», dimmed, never counts as work) · sources: ') +
      '<a href="https://bot.yokup.com/api/presence">' + T('presencia de Yokup', 'Yokup presence') + '</a> + <a href="/api/consumos/velocidad">' + T('pulso de tokens', 'token pulse') + '</a>' +
      (d.presencia === 'cache' ? ' · ⚠ ' + T('presencia de caché (hace ', 'cached presence (') + esc(String(d.presenciaEdadS)) + T(' s)', ' s ago)') : d.presencia !== 'ok' ? ' · ⚠ ' + T('presencia sin respuesta', 'no presence answer') : '') + ' · ' + T('cada 10 s', 'every 10 s');
  }
  function avisa(d) { ultimo = d; try { root.dispatchEvent(new CustomEvent('flota:trabajando', { detail: d })); } catch (e) {} return d; }
  function leer() { return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(avisa).then(pinta); }
  function arranca() {
    if (!document.getElementById('trabajando')) return;
    leer();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
    setInterval(alterna, 1000);
  }
  root.ConsumosTrabajando = { grupos: grupos, xyGrupo: xyGrupo, rotGrupo: rotGrupo, focoTxt: focoTxt, altChip: altChip, maqNombre: maqNombre, maqCanon: maqCanon, maqActual: maqActual, misionTxt: misionTxt, chipsDe: chipsDe, supTexto: supTexto, supCorta: supCorta, leer: leer, ultimo: function () { return ultimo; } };
  root.addEventListener && root.addEventListener('admira:languagechange', function () { if (ultimo) pinta(ultimo); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
