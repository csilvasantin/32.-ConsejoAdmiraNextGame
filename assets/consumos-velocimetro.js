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
 * Si no hay pulso ni partes: dial en gris y «sin datos» — nunca números inventados.
 * r27 (Carlos: «¿por qué no sales en la flota, Jobs?»): motores «cursor» (Grok Bot (Consejo), cuenta Cursor Pro, export CSV
 * con horas de retraso: tok/h = última hora CON DATOS y aviso «Cursor · datos con ~X h de retraso») y «grok» (Smith, Grok CLI). */
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
  /* r36 (Carlos): el cuentakilómetros RUEDA sin parar, como el de un coche, al ritmo MEDIO del día:
   * ritmo = tokens de hoy / segundos desde la medianoche de Madrid (10 M en 10 h → 1 M/h ≈ 278 tokens/s). Entre lecturas
   * del servidor sube sola; en cada lectura se re-ancla al valor real (si va por detrás, alcanza suave; si va por delante,
   * espera quieta: nunca rueda hacia atrás salvo que cambie el día). Las ruedas son continuas: la última gira siempre y
   * cada una arrastra a la de su izquierda al pasar de 9 a 0. Tira de 11 cifras (0…9,0) para dar la vuelta sin salto. */
  function odometroHTML() {
    var h = '';
    for (var i = 0; i < DIGITOS; i++) {
      var col = '';
      for (var k = 0; k <= 10; k++) col += '<span>' + (k % 10) + '</span>';
      h += (i && (DIGITOS - i) % 3 === 0 ? '<i class="odo-sep"></i>' : '') + '<span class="odo-rueda"><span class="odo-tira">' + col + '</span></span>';
    }
    return h;
  }
  /** Segundos desde la medianoche de Madrid y la fecha de Madrid (AAAA-MM-DD). */
  function relojMadrid(ms) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    var o = {}; f.forEach(function (x) { o[x.type] = x.value; });
    return { s: (Number(o.hour) % 24) * 3600 + Number(o.minute) * 60 + Number(o.second) + (ms % 1000) / 1000, dia: o.year + '-' + o.month + '-' + o.day };
  }
  /** Posición (en cifras, continua) de cada rueda para un valor real n ≥ 0: la de la derecha = n mod 10; las demás giran
   *  solo mientras todas las de su derecha pasan de 9…9 a 0…0 (como un cuentakilómetros mecánico). */
  function posicionesRuedas(n, digitos) {
    var out = [], v = Math.max(0, n);
    for (var i = 0; i < digitos; i++) {
      var p = Math.pow(10, digitos - 1 - i), entero = Math.floor(v / p) % 10;
      var resto = v - Math.floor(v / p) * p, umbral = p - 1;
      var frac = p === 1 ? v - Math.floor(v) : Math.max(0, Math.min(1, resto - umbral));
      out.push(entero + frac);
    }
    return out;
  }
  /* r38 (Carlos: «el cuentakilómetros se para»). Causa: en cada lectura (cada 10 s) se re-anclaba la extrapolación al
   * valor del servidor y al instante de la lectura; como el total del servidor sube a saltos (los colectores lo mandan al
   * cerrar turnos, Cursor llega con horas de retraso), el valor mostrado iba por delante y se quedaba QUIETO esperando.
   * Modelo nuevo — PRONÓSTICO a fin de hora: en cada lectura, objetivo = real + ritmo × segundos que quedan de la hora,
   * con ritmo = tokens/hora ahora (15 min) si > 0; si no, la media del día si hay algún agente trabajando (verde); si no, 0.
   * Se gira a velocidad constante para llegar al objetivo al acabar la hora; si el real va por delante, se alcanza en ~30 s;
   * si el mostrado se pasó del objetivo, NO retrocede: frena hasta un mínimo (nunca 0 mientras haya actividad).
   * Solo se para del todo si todo está a 0 tokens/hora y nadie trabaja. Reinicio a la medianoche de Madrid.
   * Reloj de pared (no frames): en segundo plano el navegador pausa la animación; al volver se suma el tiempo pasado. */
  var ALCANCE_S = 30, MIN_FRAC = 0.05, MIN_TOK_S = 1;
  /** Segundos que quedan para acabar la hora en curso (mínimo 30 para no dividir por casi 0 al filo de la hora). */
  function segundosFinHora(ms) { var r = 3600 - (relojMadrid(ms).s % 3600); return Math.max(ALCANCE_S, r); }
  /** Ritmo del pronóstico (tokens/s): tokens/hora de ahora si > 0; si no, la media del día si hay alguien activo; si no, 0. */
  function ritmoPronostico(tokHora, tokHoy, activo, segDia) {
    if (tokHora > 0) return tokHora / 3600;
    if (activo && tokHoy > 0) return tokHoy / Math.max(600, segDia);
    return 0;
  }
  /** Velocidad de giro (tokens/s ≥ 0) del cuentakilómetros: nunca negativa; nunca 0 mientras haya actividad. */
  function velocidadOdometro(o) {
    var mostrado = o.mostrado, real = o.real, objetivo = o.objetivo, seg = Math.max(1, o.segundosRestantes), ritmo = o.ritmo || 0;
    var activo = ritmo > 0 || !!o.activo;
    var minimo = activo ? Math.max(MIN_TOK_S, ritmo * MIN_FRAC) : 0;
    var v = objetivo > mostrado ? (objetivo - mostrado) / seg : 0;           // llegar al objetivo justo a fin de hora
    if (real > mostrado) v = Math.max(v, (real - mostrado) / ALCANCE_S);      // el real va por delante: alcanzarlo en ~30 s
    return Math.max(v, minimo);
  }
  function Odometro(el) { this.el = el; this.real = null; this.objetivo = null; this.ritmo = 0; this.activo = false; this.finHora = 0; this.mostrado = null; this.dia = ''; this.tPrev = 0; this.vel = 0; this.corre = false; }
  Odometro.prototype.pon = function (n, tokHora, activo) {
    var el = this.el;
    if (!el.querySelector('.odo-rueda')) el.innerHTML = odometroHTML();
    var sin = n == null || !isFinite(n);
    el.classList.toggle('odo-sin', sin);
    if (sin) { this.real = null; this.mostrado = null; this.dibuja(null); return; }
    var ahora = Date.now(), rel = relojMadrid(ahora);
    if (rel.dia !== this.dia || this.mostrado == null) { this.mostrado = n; this.dia = rel.dia; } // primer valor o día nuevo
    this.real = n; this.activo = !!activo;
    this.ritmo = ritmoPronostico(Number(tokHora) || 0, n, this.activo, rel.s);
    var seg = segundosFinHora(ahora);
    this.finHora = ahora + seg * 1000;
    this.objetivo = n + this.ritmo * seg;
    el.setAttribute('aria-label', Math.round(n).toLocaleString(en() ? 'en-US' : 'es-ES') + ' ' + T('tokens hoy', 'tokens today'));
    this.arranca();
  };
  Odometro.prototype.avanza = function (ahora) {
    if (this.real == null) return;
    var dt = this.tPrev ? Math.max(0, Math.min(86400, (ahora - this.tPrev) / 1000)) : 0;
    this.tPrev = ahora;
    var rel = relojMadrid(ahora);
    if (rel.dia !== this.dia) { this.dia = rel.dia; this.mostrado = 0; this.real = 0; this.objetivo = this.ritmo * segundosFinHora(ahora); this.finHora = ahora + segundosFinHora(ahora) * 1000; }
    // Pasó la hora sin lectura nueva (pestaña en segundo plano, red caída): el pronóstico se alarga otra hora.
    while (ahora >= this.finHora) { this.finHora += 3600e3; this.objetivo += this.ritmo * 3600; }
    // Paso en trozos de ≤ 1 s para que, al volver de segundo plano, la velocidad se recalcule por el camino.
    while (dt > 0) {
      var h = Math.min(1, dt); dt -= h;
      this.vel = velocidadOdometro({ mostrado: this.mostrado, real: this.real, objetivo: this.objetivo, segundosRestantes: (this.finHora - ahora) / 1000, ritmo: this.ritmo, activo: this.activo });
      this.mostrado += this.vel * h;
    }
  };
  Odometro.prototype.arranca = function () {
    if (this.corre) return;
    this.corre = true; this.tPrev = Date.now();
    var self = this;
    var paso = function () {
      if (self.real == null) { self.corre = false; return; }
      self.avanza(Date.now());
      self.dibuja(menosMovimiento() ? Math.floor(self.mostrado) : self.mostrado);
      if (menosMovimiento() || document.hidden) setTimeout(paso, 1000); else requestAnimationFrame(paso);
    };
    if (!this.visto) { this.visto = true; document.addEventListener && document.addEventListener('visibilitychange', function () { if (self.real != null) { self.avanza(Date.now()); self.dibuja(self.mostrado); } }); }
    requestAnimationFrame(paso);
  };
  Odometro.prototype.dibuja = function (v) {
    var ruedas = this.el.querySelectorAll('.odo-rueda');
    if (v == null) { for (var j = 0; j < ruedas.length; j++) { ruedas[j].classList.add('odo-cero'); ruedas[j].firstChild.style.transform = 'translateY(0)'; } return; }
    var pos = posicionesRuedas(v, ruedas.length), lider = String(Math.floor(v)).length;
    for (var i = 0; i < ruedas.length; i++) {
      ruedas[i].classList.toggle('odo-cero', i < ruedas.length - lider);
      ruedas[i].firstChild.style.transform = 'translateY(' + (-pos[i] * 100 / 11).toFixed(3) + '%)';
    }
  };
  function odometro(el, n, tokHora, activo) {
    if (!el) return;
    if (!el._odo) el._odo = new Odometro(el);
    el._odo.pon(n, tokHora, activo);
  }
  /** Ritmo medio del día en tokens/s (tokens de hoy / segundos desde la medianoche de Madrid; mínimo 10 min). */
  function ritmoMedio(tokHoy) { if (tokHoy == null || !isFinite(tokHoy)) return 0; return Math.max(0, tokHoy) / Math.max(600, relojMadrid(Date.now()).s); }
  /** ¿Hay algún agente trabajando (tarjeta verde en «Trabajando ahora»)? */
  function hayVerdes() { try { return !!document.querySelector('#trabajando-lista .tr-verde, #trabajando-chips .tr-verde'); } catch (e) { return false; } }
  root.ConsumosOdometro = { posicionesRuedas: posicionesRuedas, ritmoMedio: ritmoMedio, relojMadrid: relojMadrid, ritmoPronostico: ritmoPronostico, velocidadOdometro: velocidadOdometro, Odometro: Odometro };

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
    b.querySelector('.vel-unidad').textContent = sin ? '' : T('tokens/hora', 'tokens/hour');
    this.arranca();
    var rm = ritmoMedio(sin ? null : tokHoy);
    odometro(b.querySelector('.odo'), tokHoy, v, v > 0 || hayVerdes());
    // r36: qué es la cifra grande, explícito.
    var que = b.querySelector('.vel-que');
    if (que) que.innerHTML = sin ? '' : T('tokens/hora ahora (últimos 15 min)', 'tokens/hour now (last 15 min)') + ' · ' + T('media del día ', 'day average ') + '<b>' + fmt(rm * 3600) + '</b> ' + T('tokens/hora', 'tokens/hour');
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
  /* r30: segunda gráfica — LÍNEAS DE CÓDIGO escritas por los agentes, mismo eje que los tokens (1 h / 24 h / 7 d).
   * /api/consumos/lineas?rango= da los cubos de líneas (barras escalonadas) y, para 24 h y 7 d, los de tokens. */
  var LS_RANGO = 'consumos.rango.v1', API_LIN = '/api/consumos/lineas?rango=';
  var LIN = { rango: lsGet(LS_RANGO) || '1h', d: null, leido: 0 };
  if (!/^(1h|24h|7d)$/.test(LIN.rango)) LIN.rango = '1h';
  function rotuloRango(r) { return r === '7d' ? T('−7 d', '−7 d') : r === '24h' ? '−24 h' : '−60 min'; }
  function unidadPaso(r) { return r === '7d' ? '4 h' : r === '24h' ? '30 min' : 'min'; }
  function grafica(vals, o) {
    // vals: números o null (sin datos). o: { barras, clase, aria, unidad, rango }
    if (!vals || vals.length < 2) return '';
    var W = 300, Hh = 46, n = vals.length, max = 0, i;
    for (i = 0; i < n; i++) if (vals[i] != null) max = Math.max(max, vals[i]);
    var y = function (v) { return Hh - 4 - (max > 0 ? (v / max) * (Hh - 10) : 0); };
    var cuerpo = '';
    if (o.barras) {
      var bw = W / n;
      for (i = 0; i < n; i++) if (vals[i] > 0) cuerpo += '<rect x="' + (i * bw + bw * 0.12).toFixed(2) + '" y="' + y(vals[i]).toFixed(2) + '" width="' + (bw * 0.76).toFixed(2) + '" height="' + (Hh - y(vals[i])).toFixed(2) + '" class="' + o.clase + '-barra"/>';
    } else {
      var trozos = [], cur = [];
      for (i = 0; i < n; i++) { if (vals[i] == null) { if (cur.length) trozos.push(cur); cur = []; } else cur.push([(i / (n - 1)) * W, y(vals[i])]); }
      if (cur.length) trozos.push(cur);
      trozos.forEach(function (t) {
        if (t.length === 1) t.push([t[0][0] + 0.01, t[0][1]]);
        var l = t.map(function (p, j) { return (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        cuerpo += '<path d="' + l + ' L' + t[t.length - 1][0].toFixed(1) + ' ' + Hh + ' L' + t[0][0].toFixed(1) + ' ' + Hh + ' Z" class="vel-spark-area"/><path d="' + l + '" class="vel-spark-linea"/>';
      });
      var primero = vals.findIndex(function (v) { return v != null; });
      if (primero > 0) cuerpo = '<rect x="0" y="0" width="' + ((primero / (n - 1)) * W).toFixed(1) + '" height="' + Hh + '" class="vel-spark-sin"/>' + cuerpo;
    }
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="vel-spark" preserveAspectRatio="none" role="img" aria-label="' + esc(o.aria) + '">' + cuerpo + '</svg>' +
      '<p class="vel-spark-pie"><span>' + rotuloRango(o.rango) + '</span><span>' + o.titulo + ' · ' + T('pico ', 'peak ') + fmt(max) + ' ' + o.unidad + '</span><span>' + T('ahora', 'now') + '</span></p>';
  }
  /* Minigráfica: tokens (1 h: por minuto, del velocímetro; 24 h/7 d: por cubo, de /api/consumos/lineas). */
  function sparkline(serie) {
    if (LIN.rango !== '1h') {
      var t = LIN.d && LIN.d.rango === LIN.rango ? LIN.d.tokens : null;
      return t ? grafica(t.map(function (x) { return x.tok; }), { rango: LIN.rango, unidad: 'tok/' + unidadPaso(LIN.rango), titulo: T('tokens', 'tokens'), aria: T('Tokens por cubo', 'Tokens per bucket') }) : '';
    }
    if (!serie || serie.length < 2) return '';
    return grafica(serie.map(function (p) { return p.tok || 0; }), { rango: '1h', unidad: 'tok/min', titulo: T('tokens', 'tokens'), aria: T('Tokens por minuto, últimos 60 min', 'Tokens per minute, last 60 min') });
  }
  function pintaLineas() {
    var box = document.getElementById('vel-lineas'), d = LIN.d;
    if (!box) return;
    if (!d || d.rango !== LIN.rango) { box.innerHTML = '<p class="vel-spark-pie"><span>' + T('Leyendo líneas de código…', 'Reading lines of code…') + '</span></p>'; return; }
    if (d.fuente === 'ninguna') { box.innerHTML = '<p class="vel-spark-pie"><span>' + T('Sin datos de líneas de código todavía.', 'No lines-of-code data yet.') + '</span></p>'; return; }
    var ags = (d.lineas.porAgente || []).slice(0, 6).map(function (a) { return esc(a.agente) + ' <b>' + fmt(a.lineas) + '</b>'; }).join(' · ');
    box.innerHTML = grafica(d.lineas.serie.map(function (x) { return x.lineas; }), { barras: true, clase: 'vel-lin', rango: d.rango, unidad: T('líneas', 'lines') + '/' + unidadPaso(d.rango), titulo: T('líneas de código', 'lines of code'), aria: T('Líneas de código escritas por los agentes', 'Lines of code written by the agents') }) +
      '<p class="vel-lin-pie">' + T('Líneas añadidas en el rango', 'Lines added in range') + ': <b>' + fmt(d.lineas.total) + '</b>' + (ags ? ' · ' + ags : '') +
      ' · <span title="' + esc(d.metodo || '') + '">' + (d.fuente === 'commits' ? T('commits de la rama principal', 'main-branch commits') + (d.actualizado ? ' · ' + T('leídos ', 'read ') + new Date(d.actualizado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '') : T('fotos 00:00/12:00 (escalonado)', '00:00/12:00 snapshots (stepped)')) + '</span></p>';
  }
  function canonAg(n) { return String(n || '').replace(/\s*\(.*\)\s*$/, '').toLowerCase(); }
  function pintaRatio() {
    var el = document.getElementById('vel-ag-lineas'), d = LIN.d, v = estado.datos;
    if (!el) return;
    if (!d || d.fuente !== 'commits' || !v) { el.textContent = ''; return; }
    var lin, tok;
    if (estado.agente) {
      var a = (d.hoy.porAgente || []).find(function (x) { return canonAg(x.agente) === canonAg(estado.agente); });
      var f = (v.porAgente || []).find(function (x) { return x.agente === estado.agente; });
      lin = a ? a.lineas : 0; tok = f ? f.tokHoy : null;
    } else { lin = d.hoy.total; tok = v.tokHoy; }
    var ratio = tok > 0 && lin > 0 ? Math.round(tok / lin) : null;
    el.innerHTML = T('Hoy', 'Today') + ': <b>' + fmt(lin) + '</b> ' + T('líneas de código', 'lines of code') + (ratio ? ' · <b>' + fmt(ratio) + '</b> tok/' + T('línea', 'line') : '');
  }
  /* r31: resumen de una línea de la zona plegada «Velocidad por agente · gráficas». */
  function pintaResumen() {
    var el = document.getElementById('vel-resumen'), d = estado.datos;
    if (!el) return;
    if (!d || d.sinDatos) { el.textContent = T('Sin pulso ahora', 'No pulse right now'); return; }
    var ags = (d.porAgente || []).filter(function (a) { return a.tokHora > 0; }).sort(function (x, y) { return y.tokHora - x.tokHora; });
    var p = [];
    if (ags.length) p.push('★ <b>' + esc(ags[0].agente) + '</b> ' + fmt(ags[0].tokHora) + ' ' + T('tokens/hora', 'tokens/hour'));
    else p.push(T('nadie quemando ahora', 'nobody burning now'));
    p.push(T('hoy ', 'today ') + '<b>' + fmt(d.tokHoy) + '</b> tok');
    if (LIN.d && LIN.d.fuente === 'commits') {
      var r = LIN.d.hoy.total > 0 && d.tokHoy > 0 ? Math.round(d.tokHoy / LIN.d.hoy.total) : null;
      p.push('<b>' + fmt(LIN.d.hoy.total) + '</b> ' + T('líneas hoy', 'lines today') + (r ? ' · ' + fmt(r) + ' tok/' + T('línea', 'line') : ''));
    }
    el.innerHTML = p.join(' · ');
  }
  function leerLineas() {
    var r = LIN.rango;
    return fetch(API_LIN + r, { cache: 'no-store' }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; }).then(function (d) {
      if (d && d.ok && d.rango === LIN.rango) { LIN.d = d; LIN.leido = Date.now(); }
      pintaLineas(); pintaRatio(); pintaResumen();
      var sp = document.getElementById('vel-spark');
      if (sp && estado.datos && !estado.datos.sinDatos) sp.innerHTML = sparkline(estado.datos.serie60);
    });
  }
  function ponRango(r) {
    LIN.rango = r; lsSet(LS_RANGO, r);
    var b = document.querySelectorAll('#vel-rango button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', b[i].getAttribute('data-r') === r ? 'true' : 'false');
    var sp = document.getElementById('vel-spark');
    if (sp && estado.datos && !estado.datos.sinDatos) sp.innerHTML = sparkline(estado.datos.serie60);
    pintaLineas();
    leerLineas();
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
  /** r27: «Cursor · datos con ~X h de retraso» (o min si < 1 h). */
  function txtRetraso(a) {
    if (!a || !a.conRetraso) return '';
    var s = Number(a.retrasoS) || 0, h = s / 3600;
    var cuanto = h >= 1 ? '~' + (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10).toString().replace('.', en() ? '.' : ',') + ' h' : '~' + Math.max(1, Math.round(s / 60)) + ' min';
    return T('Cursor · datos con ' + cuanto + ' de retraso', 'Cursor · data ' + cuanto + ' behind');
  }
  function nombreMotor(m) { return m === 'claude' ? 'Claude' : m === 'codex' ? 'Codex' : m === 'cursor' ? 'Cursor' : m === 'grok' ? 'Grok CLI' : (m || ''); }
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
      var cifras = o.tokHoy == null ? T('sin datos hoy', 'no data today') : '<b>' + (o.tokHora != null ? fmt(o.tokHora) : '—') + ' ' + T('tokens/hora', 'tokens/hour') + '</b> · ' + fmt(o.tokHoy) + T(' hoy', ' today') + (o.maquinas && o.maquinas.length ? ' · ' + esc(o.maquinas.join(', ')) : '');
      items.push({ valor: o.proyecto, estado: est, titulo: esc(txtEstado(est)),
        html: '<span class="dd-fila"><span class="dd-tit">' + punto(est) + esc(nomP(o.proyecto)) + '</span><small>' + cifras + '</small></span>',
        boton: punto(est) + '<span class="dd-bt">' + esc(nomP(o.proyecto)) + (el.auto ? ' <em class="dd-autotag">auto</em>' : '') + (o.tokHora != null ? ' · ' + fmt(o.tokHora) + ' ' + T('tokens/hora', 'tokens/hour') : '') + '</span>' });
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
    var motor = nombreMotor(a.motor);
    var modelo = a.modelo || (pf && pf.modelo ? pf.modelo : motor);
    var cuenta = (a.motor === 'cursor' || a.motor === 'grok') && a.cuenta ? a.cuenta : pf ? (pf.email || pf.plan || '') : '';
    var m = ORQ.margen[a.agente];
    var lin1 = a.sinDatos ? T('sin datos hoy', 'no data today') :
      '<b>' + (a.tokHora == null ? T('parado', 'stopped') : fmt(a.tokHora) + ' ' + T('tokens/hora', 'tokens/hour')) + '</b> · ' + fmt(a.tokHoy) + T(' hoy', ' today') +
      (a.maquina || (pf && pf.maquina) ? ' · ' + esc(a.maquina || pf.maquina) : '') + (a.proyectoAhora ? ' · ' + esc(nomP(a.proyectoAhora)) : '') +
      (a.conRetraso ? ' · <span class="dd-retraso">' + esc(txtRetraso(a)) + '</span>' : '');
    if (a.sinDatos && pf && pf.nota) lin1 += ' · ' + esc(pf.nota);
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
      html: '<span class="dd-fila"><span class="dd-tit">' + punto(estF) + T('Toda la flota', 'Whole fleet') + '</span><small><b>' + (d && d.tokHora != null ? fmt(d.tokHora) + ' ' + T('tokens/hora', 'tokens/hour') : T('sin datos', 'no data')) + '</b>' + (d && d.tokHoy != null ? ' · ' + fmt(d.tokHoy) + T(' hoy', ' today') : '') + ' · ' + activos + ' ' + T(activos === 1 ? 'agente activo' : 'agentes activos', activos === 1 ? 'active agent' : 'active agents') + ' ' + T('de ', 'of ') + ags.length + (conDatos > activos ? ' (' + (conDatos - activos) + T(' parados con tokens hoy', ' idle with tokens today') + ')' : '') + '</small></span>',
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
      (f.tokHora == null ? T('parado (sin pulso reciente)', 'stopped (no recent pulse)') : (f.motor ? esc(nombreMotor(f.motor)) + ' · ' : '') + (f.maquina ? esc(f.maquina) + ' · ' : '') +
        (f.conRetraso ? '<b>' + esc(txtRetraso(f)) + '</b> · ' + T('tokens/hora de la última hora con datos', 'tokens/hour of the last hour with data') : f.tokUltimos5min != null ? '5 min: <b>' + fmt(f.tokUltimos5min) + '</b> tok' : esc(f.metodo || '')));
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
      var origen = a.conRetraso ? (a.stale ? T('sin export de Cursor ', 'no Cursor export ') + hace(a.haceS) : esc(txtRetraso(a))) :
        a.metodo === 'tiempo real' ? (a.stale ? T('sin pulso ', 'no pulse ') + hace(a.haceS) : T('tiempo real', 'real time')) : esc(a.metodo || T('partes Yokup', 'Yokup reports'));
      var cls = [parado ? 'parado' : '', a === lider ? 'lider' : '', a.agente === estado.agente ? 'sel' : ''].filter(Boolean).join(' ');
      return '<li' + (cls ? ' class="' + cls + '"' : '') + ' role="button" tabindex="0" data-agente="' + esc(a.agente) + '" title="' + esc(T('Ver ', 'Show ') + a.agente + T(' en el velocímetro', ' on the gauge')) + '">' +
        '<span class="vel-ag"><span class="vel-pos">' + (i + 1) + '</span>' + (a === lider ? '<span class="vel-corona" aria-label="' + T('el que más trabaja ahora', 'top worker now') + '">★</span> ' : '') + esc(a.agente) + (a.motor ? ' · ' + esc(nombreMotor(a.motor)) : '') +
        (a.conCarlos ? ' <em class="con-carlos" title="' + esc(T('Carlos está trabajando con este agente: no se le inyectan encargos', 'Carlos is working with this agent: no tasks are injected') + (a.conCarlosMotivo ? ' · ' + a.conCarlosMotivo : '')) + '">' + T('con Carlos', 'with Carlos') + '</em>' : '') + '</span>' +
        '<span class="vel-bar"><i style="width:' + w + '%"></i></span><b>' + (parado ? T('parado', 'stopped') : fmt(a.tokHora) + ' ' + T('tokens/hora', 'tokens/hour')) + '</b>' +
        '<small>' + T('hoy ', 'today ') + '<b>' + fmt(a.tokHoy) + '</b>' + (a.maquina ? ' · ' + esc(a.maquina) : '') + (a.proyectoAhora ? ' · ' + T('proyecto ', 'project ') + '<b>' + esc(nomP(a.proyectoAhora)) + '</b>' : '') +
        (a.tokUltimos5min != null ? ' · 5 min ' + fmt(a.tokUltimos5min) : '') + ' · ' + origen + '</small></li>';
    }).join('');
  }
  function eligeAgente(nombre) {
    estado.agente = nombre || '';
    lsSet(LS_AG, estado.agente);
    setTimeout(pintaRatio, 0);
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
      ' · ' + T('Pico 24 h', '24 h peak') + ': <b>' + (d.pico24h == null ? '—' : fmt(d.pico24h) + ' ' + T('tokens/hora', 'tokens/hour')) + '</b> · ' + T('Escala', 'Scale') + ' 0 → ' + fmt(max);
    var sp = document.getElementById('vel-spark');
    if (sp) sp.innerHTML = sin ? '' : sparkline(d.serie60);
    pintaRanking(sin ? null : d);
    pintaRatio();
    pintaResumen();
    var pie = document.getElementById('vel-pie');
    pie.innerHTML = (d && d.generado ? T('Actualizado ', 'Updated ') + new Date(d.generado).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (Madrid) · ' : '') +
      T('Fuente: pulso de cada Mac (logs de Claude Code, Codex y Grok CLI, cada 60 s, ', 'Source: each Mac\'s pulse (Claude Code, Codex and Grok CLI logs, every 60 s, ') + '<a href="/api/consumos/pulso">/api/consumos/pulso</a>) + ' +
      T('Cursor Pro (Grok Bot) por el export CSV de cursor.com, cada hora y con retraso', 'Cursor Pro (Grok Bot) from the cursor.com CSV export, hourly and delayed') +
      (d && d.excluidosYokup && d.excluidosYokup.length ? ' (' + T('no se suman aparte: ', 'not added twice: ') + esc(d.excluidosYokup.map(function (x) { return x.agente; }).join(', ')) + ')' : '') + ' + ' +
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
    var rg = document.getElementById('vel-rango');
    if (rg) rg.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('button[data-r]') : null; if (b) ponRango(b.getAttribute('data-r')); });
    ponRango(LIN.rango);
    leer();
    leerMargen();
    setInterval(function () { if (!document.hidden) leerLineas(); }, 60000);
    setInterval(function () { if (!document.hidden) leer(); }, POLL);
    setInterval(function () { if (!document.hidden) leerMargen(); }, 60000);
    setInterval(function () { var t = textoMetodo(), m = document.getElementById('vel-metodo'); if (t && m) m.innerHTML = t; }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
