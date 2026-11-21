/* Elección de proyecto y agente de los velocímetros de /consumos (GrokBotBox, 09-10-2026 · r20).
 * Funciones PURAS (sin DOM ni red): las usa assets/consumos-velocimetro.js en el navegador y los tests
 * (consumos-velocimetro-elegir.test.mjs, por vm). Mismo criterio que proyectoAhora de consumos-velocidad-lib.mjs.
 *  - ordenarProyectos: tok/h (últimos 15 min) desc → tokens de hoy desc → a igualdad, un proyecto real antes que «otros».
 *  - proyectoPorDefecto: el que más quema AHORA; si todos están a 0, el que más lleva hoy. «otros» vale si es el primero.
 *  - elegirProyecto: elección manual (guardada) o AUTO (se reevalúa en cada refresco de 10 s).
 *  - elegirAgente: '' = toda la flota; un nombre de porAgente = ese agente. */
(function (root) {
  'use strict';
  var OTROS = 'otros';
  function num(x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; }
  function ordenarProyectos(lista) {
    return (lista || []).filter(function (p) { return p && p.proyecto; }).slice().sort(function (a, b) {
      return num(b.tokHora) - num(a.tokHora) || num(b.tokHoy) - num(a.tokHoy) ||
        (a.proyecto === OTROS ? 1 : 0) - (b.proyecto === OTROS ? 1 : 0);
    });
  }
  function proyectoPorDefecto(lista) {
    var o = ordenarProyectos(lista);
    return o.length ? o[0].proyecto : null;
  }
  /** manual: proyecto elegido a mano (o null/'' = seguir en auto). → { proyecto, auto } */
  function elegirProyecto(lista, manual, ahoraMs) {
    if (manual) return { proyecto: manual, auto: false };
    var r = proyectoRotando(lista, ahoraMs);
    return { proyecto: r || proyectoPorDefecto(lista), auto: true, rota: !!r };
  }
  /** r45 (Carlos, 21-10-2026): en AUTO el reloj de PROYECTO rota cada 15 s entre los proyectos activos (consumo en la
   *  última hora), de mayor a menor tok/h; se reordena en cada ciclo con los datos frescos. Sin activos → null (modo actual). */
  var ROTA_MS = 15000;
  function tasa(p) { return p.tokUltimaHora != null ? num(p.tokUltimaHora) : num(p.tokHora); }
  function proyectosActivos(lista) {
    return (lista || []).filter(function (p) { return p && p.proyecto && tasa(p) > 0; }).slice().sort(function (a, b) {
      return tasa(b) - tasa(a) || num(b.tokHoy) - num(a.tokHoy) || (a.proyecto === OTROS ? 1 : 0) - (b.proyecto === OTROS ? 1 : 0);
    });
  }
  function proyectoRotando(lista, ahoraMs) {
    var a = proyectosActivos(lista);
    if (!a.length) return null;
    return a[Math.floor((ahoraMs == null ? Date.now() : ahoraMs) / ROTA_MS) % a.length].proyecto;
  }
  /** #6991 (Carlos, 21-10-2026): con UN solo agente operativo, el dial AGENTES lo enseña a él (no «Toda la flota»).
   *  activos = agentes de /api/flota/trabajando (fuente de verdad de las fichas) si los hay; si no, porAgente con
   *  consumo en la última hora. Exactamente 1 → su nombre; 0 o 2+ → null (sigue «Toda la flota»). */
  function agenteUnicoActivo(porAgente, activos) {
    var n = {};
    if (activos && activos.length !== undefined) (activos || []).forEach(function (a) { var x = a && (a.agente || a); if (x && typeof x === 'string') n[x] = 1; });
    else (porAgente || []).forEach(function (a) { if (a && a.agente && tasa(a) > 0) n[a.agente] = 1; });
    var k = Object.keys(n);
    return k.length === 1 ? k[0] : null;
  }
  /** #6991: mismo criterio en PROYECTOS: con un solo proyecto activo, ese (aunque el pulso no le dé tok/h). */
  function proyectoUnicoActivo(lista, activos) {
    var n = {};
    if (activos && activos.length !== undefined) (activos || []).forEach(function (p) { var x = p && (p.proyecto || p); if (x && typeof x === 'string') n[x] = 1; });
    else proyectosActivos(lista).forEach(function (p) { n[p.proyecto] = 1; });
    var k = Object.keys(n);
    return k.length === 1 ? k[0] : null;
  }
  /** 19-11 (Carlos: «Merovingio · GrokBotBox · sin datos»): /api/flota/trabajando llama «Merovingio» a la bolsa de
   *  Cursor/Grok Bot que el pulso guarda como «Grok Bot (Consejo)» (o «Grok Bot»). Mismo agente, dos nombres. */
  var ALIAS = { 'merovingio': ['Grok Bot (Consejo)', 'Grok Bot'], 'grok bot (consejo)': ['Merovingio', 'Grok Bot'], 'grok bot': ['Grok Bot (Consejo)', 'Merovingio'], 'jensen': ['Huang'], 'huang': ['Jensen'] };
  function filaDe(porAgente, nombre) {
    if (!nombre) return null;
    var lista = porAgente || [], fila = null, cands = [nombre].concat(ALIAS[String(nombre).toLowerCase()] || []);
    cands.forEach(function (n) { if (fila) return; lista.forEach(function (a) { if (!fila && a && a.agente === n) fila = a; }); });
    return fila;
  }
  /** porAgente de /api/consumos/velocidad + nombre elegido ('' = flota) → { agente|null, fila|null } (con alias) */
  function elegirAgente(porAgente, nombre) {
    if (!nombre) return { agente: null, fila: null };
    return { agente: nombre, fila: filaDe(porAgente, nombre) };
  }
  /** Actividad de una fila de agente: tok/h en vivo, o el estimado de Cursor, o la última hora. */
  function actividad(a) {
    if (!a) return 0;
    return num(a.tokHora) || num(a.tokHoraCursor) || num(a.tokHoraRetraso) || num(a.tokUltimaHora);
  }
  /** 21-11 (Carlos: «como me puedes decir 0 Tokens por hora !! y estan las agujas moviendose, y los consejeros y los
   *  agentes trabajando»): RITMO REAL de un velocímetro, sin inventar nada. Sustituye la cadena «nunca sin datos» del
   *  19-11 (media del día / último valor / estimado plausible, que sacaban cifras que nadie había medido).
   *  o = { tokHora (15 min × 4), ultimaHora (tokens de los últimos 60 min), cursor (última ventana publicada, datos con
   *        retraso), tokHoy, trabajando (alguien en verde en «Trabajando ahora»), ultimoEvento (ISO del último uso) }
   *  Orden: tokens en los últimos 15 min → tokens de la última hora (ritmo de la última hora con datos) → última
   *  ventana publicada con retraso → si hay trabajo pero ningún token medido: «sin dato en vivo» (tokHora null, nunca
   *  un 0 falso) → si nadie trabaja: 0 medido.
   *  → { tokHora: número|null, tokHoy: número|null, estimado: false, fuente: null|'hora'|'cursor'|'sinvivo', ultimoEvento } */
  function respaldo(o) {
    o = o || {};
    var fin = function (x) { return x !== null && x !== undefined && x !== '' && isFinite(Number(x)) && Number(x) >= 0; };
    var tokHora = null, fuente = null;
    if (fin(o.tokHora) && Number(o.tokHora) > 0) tokHora = Number(o.tokHora);
    else if (fin(o.ultimaHora) && Number(o.ultimaHora) > 0) { tokHora = Number(o.ultimaHora); fuente = 'hora'; }
    else if (fin(o.cursor) && Number(o.cursor) > 0) { tokHora = Number(o.cursor); fuente = 'cursor'; }
    else if (fin(o.tokHora) && !o.trabajando) tokHora = 0;
    else fuente = 'sinvivo';
    return { tokHora: tokHora == null ? null : Math.round(tokHora), tokHoy: fin(o.tokHoy) ? Math.round(Number(o.tokHoy)) : null,
      estimado: false, fuente: fuente, ultimoEvento: o.ultimoEvento || null };
  }
  /** Líneas de código: reales si las hay; si 0 y hay tokens, tokens / (tok por línea de la flota o el último conocido o 5000). */
  function lineasRespaldo(lineas, tok, ratioFlota, ratioUltimo) {
    if (num(lineas) > 0 || !(num(tok) > 0)) return { lineas: Math.round(num(lineas)), estimado: false };
    var r = num(ratioFlota) || num(ratioUltimo) || 5000;
    return { lineas: Math.max(1, Math.round(num(tok) / r)), estimado: true };
  }
  /** r23: estado de una fila (proyecto o agente): verde = tok/h > 0 ahora · amarillo = tokens hoy pero 0 tok/h · rojo = sin datos hoy. */
  function estadoFila(tokHora, tokHoy) {
    if (Number(tokHora) > 0) return 'verde';
    if (Number(tokHoy) > 0) return 'amarillo';
    return 'rojo';
  }
  /** r23: lista completa del desplegable de agentes: los de porAgente (en su orden) + los conocidos sin datos hoy (rojo). */
  function agentesConConocidos(porAgente, conocidos) {
    var vistos = {}, out = [];
    (porAgente || []).forEach(function (a) { if (a && a.agente && !vistos[a.agente]) { vistos[a.agente] = 1; out.push(a); } });
    (conocidos || []).forEach(function (c) { if (c && c.agente && !vistos[c.agente]) { vistos[c.agente] = 1; out.push({ agente: c.agente, tokHora: null, tokHoy: 0, sinDatos: true }); } });
    return out;
  }
  /** r24 (Carlos): color de la píldora de margen por el MARGEN mismo: verde ≥ 50 % · amarillo 20–49 % · rojo < 20 %. */
  function colorMargen(pct) {
    if (pct === null || pct === undefined || !isFinite(Number(pct))) return 'sin';
    var m = Number(pct);
    return m >= 50 ? 'verde' : m >= 20 ? 'amarillo' : 'rojo';
  }
  /** r24: nota aparte cuando el orquestador marca la cuenta por OTRO motivo que el margen (null si no hay nada que decir). */
  function notaOrquestador(o) {
    if (!o) return null;
    if (o.agotaAntes) return { semaforo: o.semaforo || 'rojo', texto: 'al ritmo actual se agota antes del reset' + (o.proyeccionTexto ? ' (' + o.proyeccionTexto + ')' : '') };
    var c = colorMargen(o.pct), s = o.semaforo === 'ambar' ? 'amarillo' : o.semaforo;
    var orden = { verde: 0, amarillo: 1, rojo: 2 };
    if (s in orden && c in orden && orden[s] > orden[c]) return { semaforo: o.semaforo, texto: 'el orquestador la marca en ' + (s === 'rojo' ? 'rojo' : 'ámbar') };
    return null;
  }
  /** r227 (Carlos, 21-11: «minimo 100k por cada aplicación abierta de agentes y de consejeros y siempre va a haber minimo
   *  6 … los consejeros actuales y los leyendas en MacStudio y MacMini y los 2 DeepAgents en el MacStudio y los 2
   *  DeepAgents en MacMini»). Regla del dueño: ritmo mínimo = 100.000 tokens/hora × apps abiertas de agentes y consejeros.
   *  Apps abiertas = señal REAL de /api/flota/trabajando: superficies frescas de cada ficha (app de escritorio o sesión
   *  CLI por pulso < 3 min o latido < 15 min; la sesión «siempre viva» de Merovingio sin latido propio no cuenta) + la app
   *  GrokBot detectada en cada Mac (appsGrokBot, fuente «app»). Una por Mac y app (o sesión CLI).
   *  Pilares MacStudio y MacMini: si el pilar está en línea (alguna señal fresca), cuentan al menos sus 4 apps de base
   *  (consejeros actuales + leyendas + 2 DeepAgents); si no hay ninguna señal, el pilar está apagado y no cuenta.
   *  → { n, suelo, porMaquina: {MacStudio: 4, …}, detectadas, base: {MacStudio: true|false, …} } */
  var SUELO_POR_APP = 100000, PILARES = { macstudio: 'MacStudio', macmini: 'MacMini' }, BASE_PILAR = 4;
  function claveMaq(m) { var k = String(m || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return k === 'mini' ? 'macmini' : k === 'studio' ? 'macstudio' : k === 'mbp16' ? 'macbookpro16' : k; }
  function nombreMaq(k, m) { return PILARES[k] || (k === 'macbookpro16' ? 'MacBookPro16' : k === 'grokbotbox' || k === 'box' ? 'GrokBotBox' : m || k); }
  function superficieViva(x) {
    if (!x || !x.maquina || (x.fuente !== 'pulso' && x.fuente !== 'latido')) return false;
    if (x.tipo === 'app') return true;
    return x.tipo === 'cli' && Object.prototype.hasOwnProperty.call(x, 'sesion');
  }
  function appsAbiertas(trab) {
    var vistas = {}, porMaq = {}, nombres = {};
    var apunta = function (maq, clave) {
      var k = claveMaq(maq); if (!k) return;
      nombres[k] = nombreMaq(k, maq);
      var id = k + '|' + clave;
      if (vistas[id]) return; vistas[id] = 1; porMaq[k] = (porMaq[k] || 0) + 1;
    };
    ((trab && trab.tarjetas) || []).forEach(function (t) {
      (t.superficies || []).forEach(function (x) {
        if (!superficieViva(x)) return;
        apunta(x.maquina, x.tipo === 'app' ? 'app:' + String(x.app || '').toLowerCase() : 'cli:' + String(x.sesion || t.agente || '').toLowerCase());
      });
    });
    ((trab && trab.appsGrokBot) || []).forEach(function (a) { if (a && a.maquina && a.fuente === 'app') apunta(a.maquina, 'app:grokbot'); });
    var detectadas = 0, n = 0, out = {}, base = {};
    Object.keys(porMaq).forEach(function (k) { detectadas += porMaq[k]; });
    Object.keys(PILARES).forEach(function (k) { if (!porMaq[k]) return; base[PILARES[k]] = porMaq[k] < BASE_PILAR; out[PILARES[k]] = Math.max(BASE_PILAR, porMaq[k]); });
    Object.keys(porMaq).forEach(function (k) { if (!PILARES[k]) out[nombres[k]] = (out[nombres[k]] || 0) + porMaq[k]; });
    Object.keys(out).forEach(function (m) { n += out[m]; });
    return { n: n, suelo: n * SUELO_POR_APP, porMaquina: out, detectadas: detectadas, base: base };
  }
  /** r229 (Carlos, 21-11 20:50: «le vamos a sumar 250.000 tokens por cada GrokBot Abierto … y en los agentes del primer
   *  reloj cada agente también vale 250.000 tokens … la diferencia será si hay consejeros o no ejecutandose»).
   *  Agentes abiertos: los DeepAgents con su app abierta en su Mac según assets/deepagents-estado.js (la MISMA fuente que
   *  «Agentes (trabajando/abiertos)»: pulso fresco del Mac o latido vivo de la app), si está cargado; si no, cada ficha de
   *  agente con una app Claude o Codex abierta con señal fresca. GrokBot abiertos: appsGrokBot de /api/flota/trabajando con
   *  fuente «app» (proceso de la app GrokBot visto por el pulso del Mac), uno por Mac y cuenta; sin esa lista, la app
   *  GrokBot de las fichas de consejero. Nada sin señal real.
   *  → { agentes: [nombres], nAgentes, sueloAgentes, grokbots: [{maquina, cuenta}], nGrokBot, sueloGrokBot } */
  var SUELO_AGENTE = 250000, SUELO_GROKBOT = 250000;
  function suelos(trab, dae) {
    var ag = [], gb = [], vistos = {};
    var ts = (trab && trab.tarjetas) || [];
    if (dae && dae.resumen && dae.contadores && ts.length) {
      dae.resumen(ts, null).forEach(function (a) { if (a && a.abierto && a.abierto.estado === 'verde') ag.push(a.visible || a.agente); });
    } else {
      ts.forEach(function (t) {
        if (!t || t.grupo === 'consejeros' || t.consejero) return;
        var ok = (t.superficies || []).some(function (x) { return superficieViva(x) && x.tipo === 'app' && /^(claude|codex)$/i.test(String(x.app || '')); });
        if (ok) ag.push(t.agente);
      });
    }
    var apuntaGB = function (maq, cuenta) { var k = claveMaq(maq) + '|' + String(cuenta || ''); if (!claveMaq(maq) || vistos[k]) return; vistos[k] = 1; gb.push({ maquina: nombreMaq(claveMaq(maq), maq), cuenta: cuenta || null }); };
    var lista = trab && trab.appsGrokBot;
    if (Array.isArray(lista) && lista.length) lista.forEach(function (a) { if (a && a.maquina && a.fuente === 'app') apuntaGB(a.maquina, a.cuenta); });
    else ts.forEach(function (t) {
      if (!t || !(t.grupo === 'consejeros' || t.consejero)) return;
      (t.superficies || []).forEach(function (x) { if (superficieViva(x) && x.tipo === 'app' && /^grokbot$/i.test(String(x.app || ''))) apuntaGB(x.maquina, null); });
    });
    var vistosMaq = {};
    gb = gb.filter(function (g) { if (g.cuenta) return true; if (vistosMaq[g.maquina]) return false; vistosMaq[g.maquina] = 1; return true; });
    return { agentes: ag, nAgentes: ag.length, sueloAgentes: ag.length * SUELO_AGENTE, grokbots: gb, nGrokBot: gb.length, sueloGrokBot: gb.length * SUELO_GROKBOT };
  }
  /** r229: fila de consumo de los consejeros (motor Cloudflare) frente a la de un agente. */
  function esFilaConsejeros(a) { return !!a && /^consejeros\b/i.test(String(a.agente || '')); }
  /** r227: ¿la ficha tiene una app o sesión abierta (señal fresca) aunque esté parada? (para «abierta», distinto de parado) */
  function conAppAbierta(t) { return ((t && t.superficies) || []).some(superficieViva); }
  function nombreProyecto(p) { return p === OTROS ? 'otros (sin proyecto)' : p; }
  var api = { agenteUnicoActivo: agenteUnicoActivo, proyectoUnicoActivo: proyectoUnicoActivo, proyectosActivos: proyectosActivos, proyectoRotando: proyectoRotando, ordenarProyectos: ordenarProyectos, proyectoPorDefecto: proyectoPorDefecto, elegirProyecto: elegirProyecto, elegirAgente: elegirAgente, nombreProyecto: nombreProyecto, estadoFila: estadoFila, colorMargen: colorMargen, notaOrquestador: notaOrquestador, agentesConConocidos: agentesConConocidos, filaDe: filaDe, actividad: actividad, respaldo: respaldo, lineasRespaldo: lineasRespaldo, appsAbiertas: appsAbiertas, conAppAbierta: conAppAbierta, suelos: suelos, esFilaConsejeros: esFilaConsejeros, SUELO_AGENTE: SUELO_AGENTE, SUELO_GROKBOT: SUELO_GROKBOT, SUELO_POR_APP: SUELO_POR_APP };
  root.ConsumosElegir = api;
})(typeof window !== 'undefined' ? window : globalThis);
