/* Verbos bilingües de las líneas de órdenes de admira.live (Carlos, 06-10-2026 10:58).
 * Cada verbo vale en castellano y en inglés (/marca = /brand, /ayuda = /help, /flota = /fleet…).
 * El idioma del verbo pasa a ser el de la web: /brand84 aplica la piel 84 y pone inglés; /marca84
 * la aplica y pone castellano (el mismo AdmiraIdioma de /idioma · /language). Lo que se escribe igual
 * en los dos idiomas (/menu, /mac, /google…) y los atajos /81…/89 no tocan el idioma.
 * Forma compacta: /marca84 = /marca 84, /brand84 = /brand 84, /marcaoff = /marca off.
 * /idioma y /language conservan su contrato (sin argumento alternan; con ESP|ENG fijan).
 * Lo usan la línea de órdenes SCUMM (app.flt-100529.js) y la del EXPERTO de Yokup (yk-frame.js);
 * el ⌘ EXPERTO · CLI de la suite (admiranext.com/suite/experto.js) trae la misma regla. */
(function (root) {
  'use strict';
  // [castellano, inglés, verbo que entiende el intérprete SCUMM]
  var PARES = [
    ['ayuda', 'help', 'help'], ['comandos', 'commands', 'comandos'], ['marca', 'brand', 'marca'],
    ['marcador', 'scoreboard', 'marcador'], ['flota', 'fleet', 'flota'], ['recorte', 'crop', 'recorte'],
    ['recortar', 'cut', 'recortar'], ['leyendas', 'legends', 'leyendas'], ['coetaneos', 'peers', 'coetaneos'],
    ['agentes', 'agents', 'agentes'], ['tareas', 'tasks', 'tareas'], ['tarea', 'task', 'tarea'],
    ['finalizada', 'done', 'finalizada'], ['olvidar', 'forget', 'olvidar'], ['motor', 'engine', 'motor'],
    ['bocas', 'mouths', 'bocas'], ['nombres', 'names', 'nombres'], ['diario', 'journal', 'diario'],
    ['importar', 'import', 'importar'], ['verbos', 'verbs', 'verbos'], ['sitios', 'sites', 'sites'],
    ['oraculo', 'oracle', 'oraculo'], ['orquestar', 'orchestrate', 'orquestar']
  ];
  // Adjetivos de la primera palabra tras el verbo: [castellano, inglés]; el intérprete entiende el castellano.
  // Solo en los verbos con adjetivo fijo (no en /tarea, /diario… que llevan texto libre).
  var ADJETIVOS = [['todo', 'all'], ['lista', 'list']];
  var CON_ADJETIVO = ['olvidar', 'marca'];
  var COMPACTO = /^(marca|brand)(off|[a-z0-9][a-z0-9_-]*)$/;
  function plano(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function par(nombre) {
    var n = plano(nombre);
    for (var i = 0; i < PARES.length; i++) {
      if (PARES[i][0] === n) return {es: PARES[i][0], en: PARES[i][1], canon: PARES[i][2], idioma: 'es'};
      if (PARES[i][1] === n) return {es: PARES[i][0], en: PARES[i][1], canon: PARES[i][2], idioma: 'en'};
    }
    return null;
  }
  function adjetivo(resto) {
    return resto.replace(/^(\s+)(\S+)/, function (todo, esp, w) {
      var n = plano(w);
      for (var i = 0; i < ADJETIVOS.length; i++) if (ADJETIVOS[i][1] === n) return esp + ADJETIVOS[i][0];
      return todo;
    });
  }
  // «/brand84» → {texto: '/marca 84', idioma: 'en', verbo: 'marca', compacto: true}.
  // conocidos: verbos que ya entiende quien llama (no se parten: /marcador no es «/marca dor»).
  function normalizar(texto, conocidos) {
    var t = String(texto == null ? '' : texto).trim();
    var m = t.match(/^\/([^\s/]+)([\s\S]*)$/);
    if (!m) return {texto: t, idioma: null, verbo: null, compacto: false};
    var p = par(m[1]);
    if (p) return {texto: '/' + p.canon + (CON_ADJETIVO.indexOf(p.canon) >= 0 ? adjetivo(m[2]) : m[2]), idioma: p.idioma, verbo: p.canon, compacto: false};
    var n = plano(m[1]);
    var sabidos = (conocidos || []).map(function (c) { return plano(c).replace(/^\//, ''); });
    var c = !m[2].trim() && n !== 'marcablanca' && sabidos.indexOf(n) < 0 ? COMPACTO.exec(n) : null;
    if (c) return {texto: '/marca ' + c[2], idioma: c[1] === 'brand' ? 'en' : 'es', verbo: 'marca', compacto: true};
    return {texto: t, idioma: null, verbo: null, compacto: false};
  }
  // Pone la web en el idioma del verbo con AdmiraIdioma (admira-idioma.js). Devuelve el mensaje o ''.
  function ponerIdioma(idioma) {
    var I = root.AdmiraIdioma;
    if (!idioma || !I || typeof I.run !== 'function') return '';
    if (typeof I.lang === 'function' && I.lang() === idioma) return '';
    var r = I.run('/idioma ' + (idioma === 'en' ? 'ENG' : 'ESP'));
    return r && r.message ? r.message : '';
  }
  var api = {PARES: PARES, ADJETIVOS: ADJETIVOS, COMPACTO: COMPACTO, par: par, normalizar: normalizar, ponerIdioma: ponerIdioma,
    lineaAyuda: function (en) {
      return (en ? 'Every verb works in Spanish or English; the Spanish one switches the site to Spanish, the English one to English: '
                 : 'Cada verbo vale en castellano o en inglés; el castellano pone la web en castellano y el inglés en inglés: ') +
        PARES.map(function (p) { return '/' + p[0] + ' · /' + p[1]; }).join(', ') + (en ? '. /brand84 = /brand 84.' : '. /marca84 = /marca 84.');
    }};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AdmiraCliBilingue = api;
})(typeof window !== 'undefined' ? window : globalThis);
