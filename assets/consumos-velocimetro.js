/* Velocímetros de tokens/hora en /consumos (GrokBotBox, 09-10-2026).
 * Lee /api/consumos/velocidad cada 10 s (datos REALES: pulso en tiempo real de cada Mac — logs locales de Claude Code
 * y Codex, POST /api/consumos/pulso cada 60 s — y, para los agentes sin pulso, partes de consumo de Yokup).
 * r18: aguja animada con requestAnimationFrame (sin saltos), «tiempo real · hace N s» que corre cada segundo y
 * minigráfica de los últimos 60 min (tokens por minuto).
 * r19: DOS diales lado a lado (apilados en móvil): 1) toda la flota · 2) TOKENS POR PROYECTO (por defecto el que más
 * ha gastado hoy; selector para cambiar). En el centro de cada dial, un CUENTAKILÓMETROS de rodillos con los tokens
 * acumulados del día (flota / proyecto).
 * r21 (Carlos): selector de AGENTE junto a «Toda la flota» (aguja = tok/h del agente, cuentakilómetros = sus tokens de
 * hoy); el dial de proyecto SIGUE en auto al que más quema ahora (max tok/h 15 min; si todos a 0, el que más lleva hoy)
 * hasta que se elige uno a mano; las elecciones manuales se guardan en localStorage. Criterio: consumos-velocimetro-elegir.js.
 * Si no hay pulso ni partes: dial en gris y «sin datos» — nunca números inventados. */
(function (root) {
  'use strict';
  var API = '/api/consumos/velocidad';
  var R = 120, CX = 150, CY = 150, POLL = 10000, DIGITOS = 10;
  // Los 13 proyectos de la Galaxia (tools/hackeo-corpus.py) + «otros»: el selector los ofrece todos, con o sin datos.
  var GALAXIA = ['admiranext.com', 'admira.live', 'admira.studio', 'admira.store', 'admira.tv', 'admira.app', 'admira.biz', 'yokup.com', 'pixeria.com', 'xpaceos.com', 'clearchannel.tv', 'ainimation.studio', 'digitalavatar.ai', 'otros'];
  function en() { return (document.documentElement.lang || 'es').slice(0, 2) === 'en'; }
  function T(es, ing) { return en() ? ing : es; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    var loc = en() ? 'en-US' : 'es-ES';
    function f(x, d) { return x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }); }
    if (n >= 1e9) return f(n / 1e9, 2) + ' G';
    if (n >= 1e6) return f(n / 1e6, 1) + ' M';
    if (n >= 1e3) return f(n / 1e3, 0) + ' k';
    return f(n, 0);
  }
  /** Escala «bonita» del dial: max(mínimo, 1,5 × pico). */
  function escala(pico, minimo) {
    var bruto = Math.max(minimo, 1.5 * (Number(pico) || 0));
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var ms = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < ms.length; i++) if (ms[i] * mag >= bruto) return ms[i] * mag;
    return 10 * mag;
  }
  function pt(frac, r) { var a = Math.PI * (1 - frac); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; }
  function arco(f0, f1, r) {
    var a = pt(f0, r), b = pt(f1, r);
    return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
  }
  function svg(max, pfx, etiqueta) {
    var ticks = '', i;
    for (i = 0; i <= 20; i++) {
      var f = i / 20, a = pt(f, R + 8), b = pt(f, R + (i % 5 ? 14 : 20));
      ticks += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" class="vel-tick' + (i % 5 ? '' : ' mayor') + '"/>';
      if (i % 5 === 0) { var l = pt(f, R - 22); ticks += '<text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" class="vel-num">' + fmt(max * f).replace(/\s/g, '') + '</text>'; }
    }
    return '<svg viewBox="0 0 300 175" class="vel-svg" role="img" aria-label="' + esc(etiqueta) + '">' +
      '<defs><linearGradient id="' + pfx + '-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#88ffaa"/><stop offset=".55" stop-color="#78f3ff"/><stop offset=".8" stop-color="#ffd866"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs>' +
      '<path d="' + arco(0, 1, R) + '" class="vel-pista"/>' +
      '<path d="' + arco(0, 1, R) + '" class="vel-valor" pathLength="1" style="stroke:url(#' + pfx + '-grad)"/>' +
      ticks +
      '<g class="vel-aguja"><polygon points="' + CX + ',' + (CY - R + 18) + ' ' + (CX - 5) + ',' + CY + ' ' + (CX + 5) + ',' + CY + '"/></g>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="10" class="vel-eje"/>' +
      '</svg>';
  }

  /* ---------- Cuentakilómetros de rodillos ---------- */
  function odometroHTML() {
    var h = '';
    for (var i = 0; i < DIGITOS; i++) {
      var col = '';
      for (var k = 0; k <= 9; k++) col += '<span>' + k + '</span>';
      h += (i && (DIGITOS - i) % 3 === 0 ? '<i class="odo-sep"></i>' : '') + '<span class="odo-rueda"><span class="odo-tira">' + col + '</span></span>';
    }
    return h;
  }
  function odometro(el, n) {
    if (!el) return;
    if (!el.querySelector('.odo-rueda')) el.innerHTML = odometroHTML();
    var sin = n == null || !isFinite(n);
    el.classList.toggle('odo-sin', sin);
    var s = sin ? '' : String(Math.max(0, Math.round(n)));
    if (s.length > DIGITOS) s = s.slice(-DIGITOS);
    var pad = DIGITOS - s.length;
    var ruedas = el.querySelectorAll('.odo-rueda');
    for (var i = 0; i < ruedas.length; i++) {
      var d = i < pad ? 0 : Number(s[i - pad]);
      ruedas[i].classList.toggle('odo-cero', i < pad);
      ruedas[i].firstChild.style.transform = 'translateY(' + (-d * 10) + '%)';
    }
    el.setAttribute('aria-label', sin ? T('sin datos', 'no data') : (Math.round(n).toLocaleString(en() ? 'en-US' : 'es-ES') + ' ' + T('tokens hoy', 'tokens today')));
  }

  /* ---------- Un dial (aguja + arco + cifra + cuentakilómetros) ----------
   * r21 (Carlos): aguja ANALÓGICA — muelle amortiguado (un pelín de sobreimpulso al cambiar de valor) y una vibración
   * continua de carretera (±0,5–1,5°, ruido nuevo ~15 Hz suavizado, por requestAnimationFrame) cuya amplitud crece con
   * los tok/h; a 0 tok/h (o sin datos) queda quieta. prefers-reduced-motion: sin muelle ni vibración. */
  function menosMovimiento() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function Dial(box, pfx, etiqueta) {
    this.box = box; this.pfx = pfx; this.etiqueta = etiqueta;
    this.max = 0; this.frac = 0; this.vel = 0; this.destino = 0; this.valor = 0; this.v = 0; this.sin = true;
    this.ruido = 0; this.ruidoObj = 0; this.tRuido = 0; this.tPrev = 0; this.corriendo = false;
  }
  /** Amplitud de la vibración (grados) para una fracción de escala: 0 si parada; 0,5° → 1,5° a fondo. */
  function amplitud(frac, sin) { return sin || !(frac > 0.002) ? 0 : 0.5 + Math.min(1, frac * 1.6); }
  Dial.prototype.cuadro = function (t) {
    var self = this, dt = Math.min(0.05, Math.max(0.001, ((t - (this.tPrev || t)) / 1000) || 0.016));
    this.tPrev = t;
    var quieto = menosMovimiento();
    if (quieto) { this.frac = this.destino; this.vel = 0; this.valor = this.v; this.ruido = 0; }
    else {
      // Muelle subamortiguado (ζ≈0,55): llega con un pequeño sobreimpulso y se asienta en ~1 s.
      var k = 38, c = 2 * Math.sqrt(k) * 0.55;
      this.vel += (k * (this.destino - this.frac) - c * this.vel) * dt;
      this.frac += this.vel * dt;
      this.valor += (this.v - this.valor) * Math.min(1, dt * 6);
      var amp = amplitud(this.destino, this.sin);
      if (t - this.tRuido > 66) { this.tRuido = t; this.ruidoObj = (Math.random() * 2 - 1) * amp; }
      this.ruido += (this.ruidoObj - this.ruido) * Math.min(1, dt * 22);
      if (!amp) this.ruido *= 0.8;
    }
    var b = this.box, ag = b.querySelector('.vel-aguja'), val = b.querySelector('.vel-valor'), cifra = b.querySelector('.vel-cifra');
    var f = Math.max(-0.02, Math.min(1.03, this.frac));
    if (ag) ag.style.transform = 'rotate(' + (-90 + 180 * f + this.ruido).toFixed(2) + 'deg)';
    if (val) val.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, f)));
    if (cifra && !this.sin) cifra.textContent = fmt(Math.abs(this.valor - this.v) < 1 ? this.v : this.valor);
    var asentado = Math.abs(this.destino - this.frac) < 0.0005 && Math.abs(this.vel) < 0.001;
    var vibra = !quieto && amplitud(this.destino, this.sin) > 0;
    if (!asentado || vibra || Math.abs(this.ruido) > 0.01) requestAnimationFrame(function (tt) { self.cuadro(tt); });
    else this.corriendo = false;
  };
  Dial.prototype.arranca = function () {
    if (this.corriendo) return;
    this.corriendo = true; this.tPrev = 0;
    var self = this;
    requestAnimationFrame(function (t) { self.cuadro(t); });
  };
  Dial.prototype.pinta = function (tokHora, max, tokHoy, sin) {
    var b = this.box;
    b.classList.toggle('sin-datos', !!sin);
    if (max !== this.max || !b.querySelector('.vel-svg')) {
      var fracVieja = this.max ? (this.frac * this.max) / max : 0;
      b.querySelector('.vel-dial-svg').innerHTML = svg(max, this.pfx, this.etiqueta); this.max = max; this.frac = Math.max(0, Math.min(1, fracVieja));
    }
    var v = sin ? 0 : (Number(tokHora) || 0);
    this.sin = !!sin; this.v = v;
    this.destino = Math.max(0, Math.min(1, v / max));
    var cifra = b.querySelector('.vel-cifra');
    if (sin) cifra.textContent = T('sin datos', 'no data');
    b.querySelector('.vel-unidad').textContent = sin ? '' : 'tok/h';
    this.arranca();
    odometro(b.querySelector('.odo'), tokHoy);
  };
  root.ConsumosVelocimetroAguja = { amplitud: amplitud };

  var LS_PROY = 'consumos.vel.proyecto', LS_AG = 'consumos.vel.agente', AUTO = '__auto__';
  function lsGet(k) { try { return root.localStorage ? root.localStorage.getItem(k) || '' : ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (!root.localStorage) return; if (v) root.localStorage.setItem(k, v); else root.localStorage.removeItem(k); } catch (e) {} }
  var E = root.ConsumosElegir;
  var estado = { datos: null, recibido: 0, proyecto: lsGet(LS_PROY) || null, agente: lsGet(LS_AG) || '', d1: null, d2: null };
  function hace(s) {
    if (s == null || !isFinite(s)) return '';
    if (s < 90) return T('hace ', '') + Math.round(s) + ' s' + T('', ' ago');
    return T('hace ', '') + Math.round(s / 60) + ' min' + T('', ' ago');
  }
  function textoMetodo() {
    var d = estado.datos;
    if (!d || d.metodo !== 'tiempo real') return null;
    var s = (d.haceS || 0) + (Date.now() - estado.recibido) / 1000;
    return '<b class="vel-rt"><i class="vel-punto"></i>' + T('tiempo real', 'real time') + '</b> · ' + hace(s) + ' · ' + T('últimos 15 min × 4', 'last 15 min × 4') +
      (d.etiqueta && d.etiqueta !== 'tiempo real' ? ' · <span>' + esc(T('+ partes de Yokup para el resto', '+ Yokup reports for the rest')) + '</span>' : '');
  }
  /* Minigráfica: tokens por minuto de los últimos 60 min (solo pulso en tiempo real). */
  function sparkline(serie) {
    if (!serie || serie.length < 2) return '';
    var W = 300, Hh = 46, max = 0, i;
    for (i = 0; i < serie.length; i++) max = Math.max(max, serie[i].tok || 0);
    var pts = serie.map(function (p, j) { return [(j / (serie.length - 1)) * W, Hh - 4 - (max > 0 ? (p.tok / max) * (Hh - 10) : 0)]; });
    var linea = pts.map(function (p, j) { return (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = linea + ' L' + W + ' ' + Hh + ' L0 ' + Hh + ' Z';
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="vel-spark" preserveAspectRatio="none" role="img" aria-label="' + T('Tokens por minuto, últimos 60 min', 'Tokens per minute, last 60 min') + '">' +
      '<path d="' + area + '" class="vel-spark-area"/><path d="' + linea + '" class="vel-spark-linea"/></svg>' +
      '<p class="vel-spark-pie"><span>−60 min</span><span>' + T('pico ', 'peak ') + fmt(max) + ' tok/min</span><span>' + T('ahora', 'now') + '</span></p>';
  }

  /** Proyecto a enseñar: el elegido a mano (guardado) o, en AUTO, el que más quema ahora (se reevalúa cada 10 s). */
  function eleccion(d) { return E.elegirProyecto((d && d.porProyecto) || [], estado.proyecto); }
  function proyectoActual(d) { return eleccion(d).proyecto; }
  function nomP(p) { return p === 'otros' ? T('otros (sin proyecto)', 'others (no project)') : p; }
  /* r23 (Carlos): desplegables propios (assets/consumos-desplegable.js) en vez de <select> nativos — el menú nativo de
   * macOS no deja colorear. Punto de estado por fila: verde = tok/h > 0 ahora · amarillo = tokens hoy, 0 tok/h ·
   * rojo = sin datos hoy (E.estadoFila). Agentes: tok/h, hoy, máquina, proyecto, modelo/cuenta, % de margen y «con Carlos». */
  var DD = { proy: null, ag: null }, ORQ = { margen: {}, leido: 0 };
  function punto(est) { return '<i class="dd-punto dd-' + (est || 'rojo') + '" aria-hidden="true"></i>'; }
  function txtEstado(est) { return est === 'verde' ? T('activo ahora', 'active now') : est === 'amarillo' ? T('hoy sí, ahora parado', 'today yes, idle now') : T('sin datos hoy', 'no data today'); }
  function pintaSelector(d) {
    if (!DD.proy) return;
    var lista = E.ordenarProyectos((d && d.porProyecto) || []), vistos = {}, opts = [];
    lista.forEach(function (p) { vistos[p.proyecto] = 1; opts.push(p); });
    GALAXIA.forEach(function (p) { if (!vistos[p]) opts.push({ proyecto: p, tokHoy: null, tokHora: null }); });
    var el = eleccion(d), elegido = opts.filter(function (o) { return o.proyecto === el.proyecto; })[0];
    var items = [{ valor: AUTO, estado: elegido ? E.estadoFila(elegido.tokHora, elegido.tokHoy) : '',
      html: '<span class="dd-fila"><span class="dd-tit"><i class="dd-punto dd-auto" aria-hidden="true"></i>' + T('Automático: el que más gasta ahora', 'Automatic: top spender right now') + '</span>' +
        (el.auto && el.proyecto ? '<small>' + T('ahora sigue a ', 'now following ') + '<b>' + esc(nomP(el.proyecto)) + '</b></small>' : '') + '</span>' }];
    opts.forEach(function (o) {
      var est = o.tokHoy == null ? 'rojo' : E.estadoFila(o.tokHora, o.tokHoy);
      var cifras = o.tokHoy == null ? T('sin datos hoy', 'no data today') : '<b>' + (o.tokHora != null ? fmt(o.tokHora) : '—') + ' tok/h</b> · ' + fmt(o.tokHoy) + T(' hoy', ' today') + (o.maquinas && o.maquinas.length ? ' · ' + esc(o.maquinas.join(', ')) : '');
      items.push({ valor: o.proyecto, estado: est, titulo: esc(txtEstado(est)),
        html: '<span class="dd-fila"><span class="dd-tit">' + punto(est) + esc(nomP(o.proyecto)) + '</span><small>' + cifras + '</small></span>',
        boton: punto(est) + '<span class="dd-bt">' + esc(nomP(o.proyecto)) + (el.auto ? ' <em class="dd-autotag">auto</em>' : '') + (o.tokHora != null ? ' · ' + fmt(o.tokHora) + ' tok/h' : '') + '</span>' });
    });
    DD.proy.pon(items, el.auto ? (elegido ? elegido.proyecto : AUTO) : el.proyecto);
    if (el.auto) DD.proy.valor = AUTO; // el botón enseña el proyecto seguido; la opción marcada es «Automático»
    var lis = DD.proy.l.children;
    for (var k = 0; k < lis.length; k++) lis[k].setAttribute('aria-selected', String(el.auto ? k === 0 : DD.proy.items[k].valor === el.proyecto));
  }
  function perfilDe(d, nombre) { return ((d && d.conocidos) || []).filter(function (c) { return c.agente === nombre; })[0] || null; }
  function notaHtml(m) {
    var n = E.notaOrquestador(m);
    return n ? ' <span class="dd-nota dd-n-' + esc(n.semaforo || 'rojo') + '" title="' + esc(T('Semáforo del orquestador (no es el margen)', 'Orchestrator status (not the margin)')) + '">⚠ ' + esc(n.texto) + '</span>' : '';
  }
  function filaAgenteInfo(a, pf) {
    var est = a.sinDatos ? 'rojo' : E.estadoFila(a.tokHora, a.tokHoy);
    var motor = a.motor ? (a.motor === 'claude' ? 'Claude' : a.motor === 'codex' ? 'Codex' : a.motor) : '';
    var modelo = pf && pf.modelo ? pf.modelo : motor;
    var cuenta = pf ? (pf.email || pf.plan || '') : '';
    var m = ORQ.margen[a.agente];
    var lin1 = a.sinDatos ? T('sin datos hoy', 'no data today') :
      '<b>' + (a.tokHora == null ? T('parado', 'stopped') : fmt(a.tokHora) + ' tok/h') + '</b> · ' + fmt(a.tokHoy) + T(' hoy', ' today') +
      (a.maquina || (pf && pf.maquina) ? ' · ' + esc(a.maquina || pf.maquina) : '') + (a.proyectoAhora ? ' · ' + esc(nomP(a.proyectoAhora)) : '');
    var lin2 = [modelo ? esc(modelo) : '', cuenta ? esc(cuenta) : '', m && m.pct != null ? '<span class="dd-margen dd-m-' + E.colorMargen(m.pct) + '">' + T('margen ', 'margin ') + m.pct + ' %</span>' + notaHtml(m) : (pf ? '<span class="dd-margen dd-m-sin">' + T('margen sin lectura', 'margin not read') + '</span>' : '')].filter(Boolean).join(' · ');
    return { est: est, html: '<span class="dd-fila"><span class="dd-tit">' + punto(est) + esc(a.agente) + (a.conCarlos ? ' <em class="con-carlos">' + T('con Carlos', 'with Carlos') + '</em>' : '') + '</span><small>' + lin1 + '</small>' + (lin2 ? '<small class="dd-sub">' + lin2 + '</small>' : '') + '</span>' };
  }
  function pintaSelectorAgente(d) {
    if (!DD.ag) return;
    var ags = E.agentesConConocidos((d && d.porAgente) || [], (d && d.conocidos) || []);
    if (estado.agente && !ags.some(function (a) { return a.agente === estado.agente; })) ags.push({ agente: estado.agente, tokHora: null, tokHoy: 0, sinDatos: true });
    var activos = ags.filter(function (a) { return a.tokHora > 0; }).length, conDatos = ags.filter(function (a) { return !a.sinDatos && a.tokHoy > 0; }).length;
    var estF = d && d.tokHora != null ? E.estadoFila(d.tokHora, d.tokHoy) : 'rojo';
    var items = [{ valor: '', estado: estF,
      html: '<span class="dd-fila"><span class="dd-tit">' + punto(estF) + T('Toda la flota', 'Whole fleet') + '</span><small><b>' + (d && d.tokHora != null ? fmt(d.tokHora) + ' tok/h' : T('sin datos', 'no data')) + '</b>' + (d && d.tokHoy != null ? ' · ' + fmt(d.tokHoy) + T(' hoy', ' today') : '') + ' · ' + activos + ' ' + T(activos === 1 ? 'agente activo' : 'agentes activos', activos === 1 ? 'active agent' : 'active agents') + ' ' + T('de ', 'of ') + ags.length + (conDatos > activos ? ' (' + (conDatos - activos) + T(' parados con tokens hoy', ' idle with tokens today') + ')' : '') + '</small></span>',
      boton: punto(estF) + '<span class="dd-bt">' + T('Toda la flota', 'Whole fleet') + '</span>' }];
    ags.forEach(function (a) {
      var f = filaAgenteInfo(a, perfilDe(d, a.agente));
      items.push({ valor: a.agente, estado: f.est, titulo: esc(txtEstado(f.est)), html: f.html, boton: punto(f.est) + '<span class="dd-bt">' + esc(a.agente) + '</span>' });
    });
    DD.ag.pon(items, estado.agente || '');
  }
  function leerMargen() {
    return fetch('/api/orquestar', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (o) {
      if (!o) return;
      var m = {};
      (o.candidatos || []).concat(o.excluidos || []).forEach(function (c) { if (c && c.persona) m[c.persona] = { pct: c.margenPct == null ? null : Math.round(c.margenPct), semaforo: c.semaforo || 'sin', agotaAntes: !!c.agotaAntes, proyeccionTexto: c.proyeccionTexto || null }; });
      ORQ.margen = m; ORQ.leido = Date.now();
      if (estado.datos) pintaSelectorAgente(estado.datos);
    }).catch(function () {});
  }
  /* Dial izquierdo: toda la flota o el agente elegido. */
  function pintaIzquierdo(d, sin) {
    var g1 = document.getElementById('vel-g-total');
    if (!estado.d1) estado.d1 = new Dial(g1, 'vg1', T('Velocímetro de tokens por hora', 'Tokens per hour speedometer'));
    var r = E.elegirAgente(sin ? [] : d.porAgente, estado.agente);
    var tit = document.getElementById('vel-ag-titulo'), rot = document.getElementById('vel-ag-rotulo'), met = document.getElementById('vel-ag-metodo');
    var max;
    if (!r.agente) {
      max = sin ? (estado.d1.max || 50e6) : (d.escalaMax || 50e6);
      estado.d1.pinta(sin ? 0 : d.tokHora, max, sin ? null : d.tokHoy, sin);
      if (tit) tit.textContent = T('Agente', 'Agent'); // r26: rótulo fijo «Agente ·»; el desplegable dice «Toda la flota»
      if (rot) rot.textContent = T('tokens hoy', 'tokens today');
      if (met) met.textContent = '';
      return max;
    }
    var f = r.fila;
    var maxAg = ((d && d.porAgente) || []).reduce(function (m, a) { return Math.max(m, a.tokHora || 0); }, 0);
    max = escala(maxAg, 5e6);
    var sinA = sin || !f;
    estado.d1.pinta(f ? (f.tokHora || 0) : 0, max, f ? f.tokHoy : null, sinA);
    if (tit) tit.textContent = T('Agente', 'Agent');
    if (rot) rot.textContent = r.agente + ' · ' + T('tokens hoy', 'tokens today');
    if (met) met.innerHTML = !f ? T('Este agente no aparece ahora en el pulso ni en Yokup: sin cifra.', 'This agent is not in the pulse or Yokup right now: no number.') :
      (f.tokHora == null ? T('parado (sin pulso reciente)', 'stopped (no recent pulse)') : (f.motor ? esc(f.motor) + ' · ' : '') + (f.maquina ? esc(f.maquina) + ' · ' : '') + (f.tokUltimos5min != null ? '5 min: <b>' + fmt(f.tokUltimos5min) + '</b> tok' : esc(f.metodo || '')));
    return d && d.escalaMax || max;
  }
  function pintaProyecto(d, sin) {
    var box = document.getElementById('vel-g-proy');
    if (!box) return;
    if (!estado.d2) estado.d2 = new Dial(box, 'vg2', T('Velocímetro de tokens por hora del proyecto', 'Project tokens per hour speedometer'));
    var nombre = proyectoActual(d);
    var lista = (d && d.porProyecto) || [];
    var p = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].proyecto === nombre) p = lista[i];
    var maxRate = lista.reduce(function (m, x) { return Math.max(m, x.tokHora || 0); }, 0);
    var hayPulso = d && d.agentesTiempoReal > 0;
    // tok/h del proyecto: medido (p.tokHora), 0 si hay pulso fresco y el proyecto no aparece (medido: nadie trabaja en él), si no «sin datos».
    var rate = p ? p.tokHora : (hayPulso ? 0 : null);
    var hoy = p ? p.tokHoy : (lista.length ? 0 : null);
    var sinP = sin || rate == null;
    estado.d2.pinta(rate, escala(maxRate, 5e6), hoy, sinP);
    var nom = document.getElementById('vel-proy-nombre');
    if (nom) nom.textContent = (nombre && nomP(nombre)) || T('ningún proyecto con datos', 'no project with data');
    var met = document.getElementById('vel-proy-metodo');
    if (met) met.innerHTML = !nombre ? T('Aún no llega el desglose por proyecto de ningún Mac.', 'No per-project breakdown from any Mac yet.') :
      sinP ? T('Sin pulso fresco que lo mida: no se enseña ninguna cifra.', 'No fresh pulse measuring it: no number is shown.') :
      (p ? T('15 min', '15 min') + ': <b>' + fmt(p.tokUltimos15min) + '</b> tok' + (p.maquinas && p.maquinas.length ? ' · ' + esc(p.maquinas.join(', ')) : '') +
        (eleccion(d).auto ? ' · ' + T('auto: el que más gasta ahora', 'auto: top spender right now') : '') : T('0 tokens hoy en los Macs con pulso', '0 tokens today on the Macs with a pulse'));
  }

  /* r22 (Carlos: «falta la velocidad por hora por agente para ver qué agente trabaja más»): ranking en vivo por tok/h,
   * barra relativa al líder, tokens de hoy, máquina, proyecto actual y «con Carlos»; clic = elegir el agente en el dial. */
  function ordenAgentes(lista) {
    return (lista || []).slice().sort(function (a, b) {
      var x = a.tokHora == null ? -1 : a.tokHora, y = b.tokHora == null ? -1 : b.tokHora;
      return y - x || (b.tokHoy || 0) - (a.tokHoy || 0);
    });
  }
  function pintaRanking(d) {
    var lista = document.getElementById('vel-agentes');
    if (!lista) return;
    var ags = d ? ordenAgentes(d.porAgente).slice(0, 12) : [];
    var lider = ags.length && ags[0].tokHora > 0 ? ags[0] : null;
    var maxR = lider ? lider.tokHora : 0;
    lista.innerHTML = ags.map(function (a, i) {
      var parado = a.tokHora == null;
      var w = maxR > 0 && !parado ? Math.max(a.tokHora > 0 ? 2 : 0, Math.round(100 * a.tokHora / maxR)) : 0;
      var origen = a.metodo === 'tiempo real' ? (a.stale ? T('sin pulso ', 'no pulse ') + hace(a.haceS) : T('tiempo real', 'real time')) : esc(a.metodo || T('partes Yokup', 'Yokup reports'));
      var cls = [parado ? 'parado' : '', a === lider ? 'lider' : '', a.agente === estado.agente ? 'sel' : ''].filter(Boolean).join(' ');
      return '<li' + (cls ? ' class="' + cls + '"' : '') + ' role="button" tabindex="0" data-agente="' + esc(a.agente) + '" title="' + esc(T('Ver ', 'Show ') + a.agente + T(' en el velocímetro', ' on the gauge')) + '">' +
        '<span class="vel-ag"><span class="vel-pos">' + (i + 1) + '</span>' + (a === lider ? '<span class="vel-corona" aria-label="' + T('el que más trabaja ahora', 'top worker now') + '">★</span> ' : '') + esc(a.agente) + (a.motor ? ' · ' + esc(a.motor) : '') +
        (a.conCarlos ? ' <em class="con-carlos" title="' + esc(T('Carlos está trabajando con este agente: no se le inyectan encargos', 'Carlos is working with this agent: no tasks are injected') + (a.conCarlosMotivo ? ' · ' + a.conCarlosMotivo : '')) + '">' + T('con Carlos', 'with Carlos') + '</em>' : '') + '</span>' +
        '<span class="vel-bar"><i style="width:' + w + '%"></i></span><b>' + (parado ? T('parado', 'stopped') : fmt(a.tokHora) + ' tok/h') + '</b>' +
        '<small>' + T('hoy ', 'today ') + '<b>' + fmt(a.tokHoy) + '</b>' + (a.maquina ? ' · ' + esc(a.maquina) : '') + (a.proyectoAhora ? ' · ' + T('proyecto ', 'project ') + '<b>' + esc(nomP(a.proyectoAhora)) + '</b>' : '') +
        (a.tokUltimos5min != null ? ' · 5 min ' + fmt(a.tokUltimos5min) : '') + ' · ' + origen + '</small></li>';
    }).join('');
  }
  function eligeAgente(nombre) {
    estado.agente = nombre || '';
    lsSet(LS_AG, estado.agente);
    pintaSelectorAgente(estado.datos);
    pintaIzquierdo(estado.datos, !estado.datos);
    pintaRanking(estado.datos);
  }

  function pinta(d) {
    var box = document.getElementById('velocimetro');
    if (!box) return;
    var sin = !d || d.ok === false || d.tokHora == null;
    estado.datos = sin ? null : d;
    estado.recibido = Date.now();
    box.classList.toggle('sin-datos', sin);
    box.classList.toggle('rt', !sin && d.metodo === 'tiempo real');
    pintaSelectorAgente(d);
    pintaIzquierdo(d, sin);
    var max = sin ? 50e6 : (d.escalaMax || 50e6);
    pintaSelector(d);
    pintaProyecto(d, sin);
    var met = document.getElementById('vel-metodo');
    if (sin) met.textContent = T('Sin pulso en tiempo real y sin partes de Yokup. No se enseña ninguna cifra.', 'No real-time pulse and no Yokup reports. No number is shown.');
    else if (d.metodo === 'tiempo real') met.innerHTML = textoMetodo();
    else if (d.metodo === 'ultima-hora') met.innerHTML = '<b>' + T('Última hora', 'Last hour') + '</b> · ' + T('medido en ', 'measured over ') + esc(d.ventanaMin) + ' min';
    else met.innerHTML = '<b>' + T('Media de hoy', 'Today\'s average') + '</b> · ' + T('estimado: total de hoy / horas desde las 00:00 (Madrid)', 'estimated: today\'s total / hours since 00:00 (Madrid)');
    var extra = document.getElementById('vel-extra');
    extra.innerHTML = sin ? '' :
      T('Hoy', 'Today') + ': <b>' + fmt(d.tokHoy) + '</b> tok' +
      (d.tokUltimos5min != null ? ' · ' + T('últimos 5 min', 'last 5 min') + ': <b>' + fmt(d.tokUltimos5min) + '</b> · ' + T('última hora', 'last hour') + ': <b>' + fmt(d.tokUltimaHora) + '</b>' : '') +
      ' · ' + T('Pico 24 h', '24 h peak') + ': <b>' + (d.pico24h == null ? '—' : fmt(d.pico24h) + ' tok/h') + '</b> · ' + T('Escala', 'Scale') + ' 0 → ' + fmt(max);
    var sp = document.getElementById('vel-spark');
    if (sp) sp.innerHTML = sin ? '' : sparkline(d.serie60);
    pintaRanking(sin ? null : d);
    var pie = document.getElementById('vel-pie');
    pie.innerHTML = (d && d.generado ? T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (Madrid) · ' : '') +
      T('Fuente: pulso de cada Mac (logs de Claude Code y Codex, cada 60 s, ', 'Source: each Mac\'s pulse (Claude Code and Codex logs, every 60 s, ') + '<a href="/api/consumos/pulso">/api/consumos/pulso</a>) + ' +
      T('partes de Yokup para el resto (', 'Yokup reports for the rest (') + '<a href="https://api.yokup.com/fleet/consumo?dias=1">fleet/consumo</a>) · ' +
      T('proyecto = carpeta de trabajo → repo git → uno de los 13 de la Galaxia · ', 'project = working folder → git repo → one of the 13 Galaxy projects · ') + T('se refresca cada 10 s', 'refreshes every 10 s');
  }
  function leer() {
    return fetch(API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) { pinta(d); return d; });
  }
  root.ConsumosVelocimetro = { leer: leer, fmt: fmt, escala: escala };
  function arranca() {
    if (!document.getElementById('velocimetro')) return;
    // r26 (Carlos): rótulos «Tokens por hora» · «Agente ·» · «Proyecto ·» (en inglés: Tokens per hour · Agent · Project).
    var tv = document.getElementById('vel-titulo'), tp = document.getElementById('vel-proy-titulo'), ta = document.getElementById('vel-ag-titulo');
    if (tv) tv.textContent = T('Tokens por hora', 'Tokens per hour');
    if (tp) tp.textContent = T('Proyecto', 'Project');
    if (ta) ta.textContent = T('Agente', 'Agent');
    if (en()) { var h1 = document.querySelector('h1'); if (h1 && /Consumo Agentes/.test(h1.textContent)) h1.textContent = 'AdmiraNeXT Agents Usage'; if (/Consumo Agentes/.test(document.title)) document.title = 'AdmiraNeXT Agents Usage · admira.live'; }
    var D = root.ConsumosDesplegable;
    var rp = document.getElementById('vel-proy-dd'), ra = document.getElementById('vel-ag-dd');
    if (D && rp) DD.proy = new D(rp, { etiqueta: T('Proyecto', 'Project'), alCambiar: function (v) {
      estado.proyecto = v === AUTO ? null : v;
      lsSet(LS_PROY, estado.proyecto);
      pintaSelector(estado.datos);
      if (estado.datos) pintaProyecto(estado.datos, false);
    } });
    if (D && ra) DD.ag = new D(ra, { etiqueta: T('Agente', 'Agent'), alCambiar: function (v) { eligeAgente(v || ''); } });
    var rk = document.getElementById('vel-agentes');
    if (rk) {
      var desdeFila = function (ev) {
        var li = ev.target && ev.target.closest ? ev.target.closest('li[data-agente]') : null;
        if (!li) return;
        var n = li.getAttribute('data-agente');
        eligeAgente(n === estado.agente ? '' : n); // segundo clic en el mismo: vuelve a toda la flota
        var g = document.getElementById('vel-g-total');
        if (g && g.scrollIntoView && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      rk.addEventListener('click', desdeFila);
      rk.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); desdeFila(ev); } });
    }
    leer();
    leerMargen();
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
    setInterval(function () { if (!document.hidden) leerMargen(); }, 60000);
    setInterval(function () { var t = textoMetodo(), m = document.getElementById('vel-metodo'); if (t && m) m.innerHTML = t; }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
