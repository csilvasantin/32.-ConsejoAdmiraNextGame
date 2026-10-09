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
  function elegirProyecto(lista, manual) {
    if (manual) return { proyecto: manual, auto: false };
    return { proyecto: proyectoPorDefecto(lista), auto: true };
  }
  /** porAgente de /api/consumos/velocidad + nombre elegido ('' = flota) → { agente|null, fila|null } */
  function elegirAgente(porAgente, nombre) {
    if (!nombre) return { agente: null, fila: null };
    var fila = null;
    (porAgente || []).forEach(function (a) { if (a && a.agente === nombre && !fila) fila = a; });
    return { agente: nombre, fila: fila };
  }
  function nombreProyecto(p) { return p === OTROS ? 'otros (sin proyecto)' : p; }
  var api = { ordenarProyectos: ordenarProyectos, proyectoPorDefecto: proyectoPorDefecto, elegirProyecto: elegirProyecto, elegirAgente: elegirAgente, nombreProyecto: nombreProyecto };
  root.ConsumosElegir = api;
})(typeof window !== 'undefined' ? window : globalThis);
