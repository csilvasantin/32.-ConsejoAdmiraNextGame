/* /hablar en cualquier input de chat con un consejero (11-11-2026).
 * Parser puro: el literal «/hablar …» nunca debe enviarse al consejero.
 * /hablar a secas → Jobs si la mesa es Leyendas (o no hay contexto), Elon si es Coetáneos.
 * Lógica exportada para node:test; el DOM solo entra en mesaActiva y en el micrófono.
 */
(function (root) {
  'use strict';

  var PERSONAS = {
    'Steve Jobs': 'jobs',
    'Steve Wozniak': 'wozniak',
    'Walt Disney': 'disney',
    'George Lucas': 'lucas',
    'Elon Musk': 'musk',
    'Jensen Huang': 'huang'
  };
  var ALIAS = {
    'Steve Jobs': ['steve jobs', 'jobs', 'yobs', 'jops', 'steve'],
    'Steve Wozniak': ['steve wozniak', 'wozniak', 'wozniac', 'woz', 'woss'],
    'Walt Disney': ['walt disney', 'disney', 'disnei', 'walt'],
    'George Lucas': ['george lucas', 'lucas', 'yorch lucas', 'jorge lucas', 'george'],
    'Elon Musk': ['elon musk', 'elon', 'ilon', 'musk', 'mask'],
    'Jensen Huang': ['jensen huang', 'jensen', 'huang', 'yensen', 'jenson'],
    'John Lasseter': ['john lasseter', 'lasseter', 'laseter', 'john'],
    'Jony Ive': ['jony ive', 'jony', 'johnny ive', 'ive', 'yoni ive'],
    'Tim Cook': ['tim cook', 'cook'],
    'Warren Buffett': ['warren buffett', 'warren buffet', 'buffett', 'buffet', 'warren'],
    'Dieter Rams': ['dieter rams', 'rams', 'dieter'],
    'Howard Schultz': ['howard schultz', 'schultz', 'howard'],
    'Gwynne Shotwell': ['gwynne shotwell', 'shotwell', 'gwynne', 'gwen'],
    'Ruth Porat': ['ruth porat', 'porat', 'ruth'],
    'Carlos Ratti': ['carlos ratti', 'carlo ratti', 'ratti'],
    'Ryan Reynolds': ['ryan reynolds', 'reynolds', 'ryan']
  };
  var COLGAR = /^(off|fin|adios|adiós|cerrar|colgar|stop|end|bye|gracias)$/i;
  var AYUDA = /^(help|ayuda|\?)$/i;
  var ESTADO_CMD = /^(estado|status)$/i;
  var VERBO = /^\/(?:hablar|talk)(?:\s+([\s\S]*))?$/i;
  var LINEA = Object.keys(PERSONAS);

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function defaultPersona(generation) {
    var g = norm(generation);
    if (g === 'coetaneos' || g === 'peers' || g === 'contemporaries' || g === 'coetaneo') return 'Elon Musk';
    return 'Steve Jobs';
  }
  function mesaActiva(doc) {
    try {
      var el = doc && doc.querySelector && (
        doc.querySelector('.council-image[data-generation]') ||
        doc.querySelector('[data-generation]') ||
        doc.querySelector('.council-image')
      );
      var g = el && el.getAttribute && el.getAttribute('data-generation');
      if (g) return norm(g) === 'coetaneos' ? 'coetaneos' : 'leyendas';
    } catch (e) {}
    return null;
  }
  function resolverCon(texto, Intent) {
    var t = String(texto || '').trim();
    if (!t) return null;
    if (Intent && typeof Intent.consejeroCon === 'function') {
      var m = Intent.consejeroCon(t);
      if (m && m.persona) {
        var resto = m.resto || '';
        if (resto) {
          var n = String(resto).split(' ').filter(Boolean).length, w = t.split(/\s+/);
          resto = n && w.length >= n ? w.slice(w.length - n).join(' ') : resto;
        }
        return { persona: m.persona, resto: resto };
      }
    }
    var f = ' ' + norm(t) + ' ', mejor = null, i, pos, alias, persona, keys, a;
    keys = Object.keys(ALIAS);
    var indice = [];
    for (i = 0; i < keys.length; i++) {
      persona = keys[i];
      for (a = 0; a < ALIAS[persona].length; a++) indice.push([norm(ALIAS[persona][a]), persona]);
    }
    indice.sort(function (x, y) { return y[0].length - x[0].length; });
    for (i = 0; i < indice.length; i++) {
      alias = indice[i][0];
      pos = f.indexOf(' ' + alias + ' ');
      if (pos < 0) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && alias.length > mejor.alias.length))
        mejor = { pos: pos, alias: alias, persona: indice[i][1] };
    }
    if (!mejor || mejor.pos !== 0) return null;
    var despues = f.slice(mejor.alias.length + 2).trim();
    var ap = mejor.persona.toLowerCase().split(' ').pop();
    if (despues.split(' ')[0] === ap) despues = despues.split(' ').slice(1).join(' ');
    var n2 = despues.split(' ').filter(Boolean).length, w2 = t.split(/\s+/);
    var resto2 = n2 && w2.length >= n2 ? w2.slice(w2.length - n2).join(' ') : '';
    return { persona: mejor.persona, resto: resto2 };
  }
  function parseHablar(args, estado, Intent) {
    var t = String(args || '').trim();
    if (COLGAR.test(t)) return { accion: 'colgar' };
    if (ESTADO_CMD.test(t)) return { accion: 'estado' };
    if (AYUDA.test(t)) return { accion: 'ayuda' };
    if (!t) {
      return {
        accion: 'conectar',
        persona: defaultPersona(estado && estado.generation),
        porDefecto: true
      };
    }
    var m = resolverCon(t, Intent);
    if (m) return m.resto
      ? { accion: 'conectar', persona: m.persona, pregunta: m.resto }
      : { accion: 'conectar', persona: m.persona };
    if (estado && estado.persona) return { accion: 'preguntar', persona: estado.persona, texto: t };
    return { accion: 'error', mensaje: 'nombre' };
  }
  function parseLinea(texto, estado, Intent) {
    var raw = String(texto || '').trim();
    var m = VERBO.exec(raw);
    if (!m) return null;
    return parseHablar(m[1] || '', estado, Intent);
  }
  function tieneLinea(persona) { return !!PERSONAS[persona]; }
  function claveDe(persona) { return PERSONAS[persona] || null; }
  function urlChat(persona) {
    var k = claveDe(persona);
    return k ? '/chat/' + k + '/' : null;
  }
  function listaAyuda(en) {
    var con = LINEA.join(', ');
    return en
      ? '/talk [counselor] [message] — same channel as /hola (mirrored in Grok Bot). Bare /talk talks to Jobs on Legends, Elon on Contemporaries.\nWith a line today: ' + con + '.\n/talk Woz how are you  ·  /talk off to hang up.'
      : '/hablar [consejero] [mensaje] — el mismo canal que /hola (se espeja en Grok Bot). /hablar a secas habla con Jobs en Leyendas y con Elon en Coetáneos.\nCon línea hoy: ' + con + '.\n/hablar Woz hola  ·  /hablar off para colgar.';
  }
  function crearMic(opts) {
    opts = opts || {};
    var rec = null, escuchando = false;
    function RecAPI() { return root.SpeechRecognition || root.webkitSpeechRecognition || null; }
    function parar() {
      escuchando = false;
      try { if (rec) rec.abort(); } catch (e) {}
      rec = null;
    }
    function arrancar() {
      var Rec = RecAPI();
      if (!Rec) { if (opts.onSinMic) opts.onSinMic(); return false; }
      parar();
      rec = new Rec();
      rec.lang = (opts.lang || 'es-ES');
      rec.continuous = true;
      rec.interimResults = true;
      escuchando = true;
      rec.onresult = function (ev) {
        var final = '', i;
        for (i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        }
        final = final.trim();
        if (final && opts.onTexto) opts.onTexto(final);
      };
      rec.onerror = function (e) {
        if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
          escuchando = false;
          if (opts.onSinPermiso) opts.onSinPermiso();
        }
      };
      rec.onend = function () {
        if (escuchando && rec) { try { rec.start(); } catch (e) {} }
      };
      try { rec.start(); return true; }
      catch (e) { escuchando = false; if (opts.onSinMic) opts.onSinMic(); return false; }
    }
    return {
      arrancar: arrancar,
      parar: parar,
      get escuchando() { return escuchando; }
    };
  }

  var api = {
    PERSONAS: PERSONAS, ALIAS: ALIAS, LINEA: LINEA, VERBO: VERBO,
    norm: norm, defaultPersona: defaultPersona, mesaActiva: mesaActiva,
    resolverCon: resolverCon, parseHablar: parseHablar, parseLinea: parseLinea,
    tieneLinea: tieneLinea, claveDe: claveDe, urlChat: urlChat,
    listaAyuda: listaAyuda, crearMic: crearMic
  };
  root.AdmiraHablarCmd = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
