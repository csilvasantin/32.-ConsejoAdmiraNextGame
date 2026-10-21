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
  /** porAgente de /api/consumos/velocidad + nombre elegido ('' = flota) → { agente|null, fila|null } */
  function elegirAgente(porAgente, nombre) {
    if (!nombre) return { agente: null, fila: null };
    var fila = null;
    (porAgente || []).forEach(function (a) { if (a && a.agente === nombre && !fila) fila = a; });
    return { agente: nombre, fila: fila };
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
  function nombreProyecto(p) { return p === OTROS ? 'otros (sin proyecto)' : p; }
  var api = { agenteUnicoActivo: agenteUnicoActivo, proyectoUnicoActivo: proyectoUnicoActivo, proyectosActivos: proyectosActivos, proyectoRotando: proyectoRotando, ordenarProyectos: ordenarProyectos, proyectoPorDefecto: proyectoPorDefecto, elegirProyecto: elegirProyecto, elegirAgente: elegirAgente, nombreProyecto: nombreProyecto, estadoFila: estadoFila, colorMargen: colorMargen, notaOrquestador: notaOrquestador, agentesConConocidos: agentesConConocidos };
  root.ConsumosElegir = api;
})(typeof window !== 'undefined' ? window : globalThis);
