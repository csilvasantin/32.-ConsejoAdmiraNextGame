/* /assets/deepagents-estado.js — estado de los cuatro deepagents fijos, UNA sola fuente (r234 · Carlos, 21-11-2026).
 * Lo usan /deepagents (fichas: borde = abierto, punto = actividad, pastilla = proyecto) y /consumos
 * («Agentes (trabajando/abiertos)» y «Proyectos (activos/total)»). Entrada: tarjetas de /api/flota/trabajando
 * (pulso fresco de cada Mac + latidos) y la actividad firmada en GitHub. Puro: sin DOM ni red. */
(function (root, factory) {
  var api = factory();
  root.DeepAgentsEstado = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  var NOMBRE = { Oraculo: "Oráculo" };
  /* Carlos, 21-11-2026 (r229): los cuatro deepagents fijos van primero y sin rótulos de motor (Claude/Codex ya va
   * dentro de cada ficha). Leyendas → MacStudio (Trinity, Neo) · Coetáneos → MacMini (Oráculo, Morfeo).
   * La máquina principal sale SIEMPRE por defecto; solo si el agente vive además en otro equipo de AdmiraNeXT aparece,
   * en el mismo sitio, un desplegable con las otras (nunca elegidas por defecto). */
  var FIJOS = [
    // proyecto = SOLO el de por defecto (respaldo marcado «por defecto»); manda el que el agente trabaja de verdad.
    // lado = monitor físico del agente en su equipo principal (r230: por posición, no por índice).
    { agente: "Trinity", maquina: "MacStudio", proyecto: "admira.studio", lado: "izquierda" },
    { agente: "Neo", maquina: "MacStudio", proyecto: "admira.live", lado: "derecha" },
    { agente: "Oraculo", maquina: "MacMini", proyecto: "admira.tv", lado: "" },
    { agente: "Morfeo", maquina: "MacMini", proyecto: "", lado: "" }
  ];

  function tarjetaDe(tarjetas, nombre) {
    var k = norm(nombre), ts = tarjetas || [];
    for (var i = 0; i < ts.length; i++) if (ts[i] && norm(ts[i].agente) === k) return ts[i];
    return null;
  }
  function claveMaq(m) { return norm(m).replace(/[^a-z0-9]/g, ""); }
  function fijoDe(nombre) { for (var i = 0; i < FIJOS.length; i++) if (FIJOS[i].agente === nombre) return FIJOS[i]; return null; }
  // Equipos donde el agente está desplegado o tiene latido: el principal primero, luego el resto (sin repetir).
  function maquinasDe(t, principal) {
    var vistas = {}, lista = [];
    function poner(m) { var k = claveMaq(m); if (!k || vistas[k]) return; vistas[k] = 1; lista.push(String(m)); }
    poner(principal);
    if (t) {
      (t.maquinas || []).forEach(poner);
      (t.superficies || []).forEach(function (s) { if (s && s.maquina) poner(s.maquina); });
    }
    return lista;
  }
  /* r231 (Carlos, 21-11-2026 20:23) — DOS señales separadas, por máquina elegida:
   * BORDE/ETIQUETA = ¿está ABIERTO en esa máquina?  verde abierto · rojo cerrado · amarillo no se sabe.
   *   Abierto: la app o la sesión aparece en el pulso fresco de ESE Mac (< 3 min, lista de procesos/ventanas que manda
   *   el propio Mac), o un latido vivo de su app de escritorio, o «con Carlos» en él. Cerrado: el pulso de ese Mac está
   *   vivo (otro agente sale en él) y este agente no aparece. Sin pulso de ese Mac → amarillo: un latido viejo NO es «cerrado».
   * PUNTO = actividad.  verde trabajando · rojo abierto sin hacer nada · amarillo no se sabe.
   *   Trabajando: app en uso/al frente en ese Mac, con Carlos, o en la principal encargo en curso, tokens reales,
   *   encargo cerrado hace < 20 min o trabajo firmado en GitHub (rama «trinity/…», «neo/…») hace < 20 min. */
  var RECIENTE_S = 20 * 60;
  function pulsoVivoEn(k, tarjetas) {
    var ts = tarjetas || [];
    for (var i = 0; i < ts.length; i++) {
      var ss = ts[i].superficies || [];
      for (var j = 0; j < ss.length; j++) if (ss[j] && ss[j].fuente === "pulso" && claveMaq(ss[j].maquina) === k) return true;
    }
    return false;
  }
  function nombreSup(s) { return s.app || s.runtime || "sesión"; }
  function abiertoEn(t, maq, tarjetas) {
    if (!t) return { estado: "amarillo", porque: "la flota no informa de este agente" };
    var k = claveMaq(maq);
    var sup = (t.superficies || []).filter(function (s) { return s && claveMaq(s.maquina) === k; });
    var pul = sup.filter(function (s) { return s.fuente === "pulso"; });
    if (pul.length) return { estado: "verde", porque: pul.map(nombreSup).join(" + ") + " abierto en " + maq + " (pulso del Mac)" };
    if (sup.length) return { estado: "verde", porque: sup.map(nombreSup).join(" + ") + " abierto en " + maq + " (latido de la app)" };
    if (t.conCarlosEn && claveMaq(t.conCarlosEn) === k) return { estado: "verde", porque: "con Carlos en " + maq };
    if (pulsoVivoEn(k, tarjetas)) return { estado: "rojo", porque: "el pulso de " + maq + " no lo ve abierto" };
    return { estado: "amarillo", porque: "sin pulso de " + maq + ": no se sabe si está abierto" };
  }
  function haceTexto(seg) { return seg < 90 ? "hace " + Math.max(0, Math.round(seg)) + " s" : "hace " + Math.round(seg / 60) + " min"; }
  function actividadEn(t, maq, principal, abierto, nombre, actividadGit) {
    actividadGit = actividadGit || {};
    if (!t) return { luz: "amarillo", porque: "sin datos de actividad" };
    var k = claveMaq(maq), esPrincipal = k === claveMaq(principal), ahora = Date.now() / 1000;
    var sup = (t.superficies || []).filter(function (s) { return s && claveMaq(s.maquina) === k; });
    for (var i = 0; i < sup.length; i++) if (sup[i].enUso || sup[i].alFrente) return { luz: "verde", porque: nombreSup(sup[i]) + " en uso en " + maq };
    if (t.conCarlosEn && claveMaq(t.conCarlosEn) === k) return { luz: "verde", porque: "con Carlos en " + maq };
    if (esPrincipal) {
      if (t.enCurso > 0) return { luz: "verde", porque: t.enCurso + " encargo en curso" };
      if (t.estado === "verde") return { luz: "verde", porque: t.porqueColor || t.motivo || "trabajando" };
      var g = actividadGit[nombre] || actividadGit[NOMBRE[nombre] || nombre];
      if (g && isFinite(g.ts) && ahora - g.ts / 1000 < RECIENTE_S) return { luz: "verde", porque: "GitHub: " + (g.accion === "merged" ? "PR fusionado" : g.accion === "opened" ? "PR abierto" : g.accion) + " en " + g.repo + " " + haceTexto(ahora - g.ts / 1000) + " (" + g.rama + ")" };
      if (t.actividad && isFinite(t.actividad.ts) && ahora - t.actividad.ts < RECIENTE_S) return { luz: "verde", porque: (t.actividad.fuente || "actividad") + " " + haceTexto(ahora - t.actividad.ts) };
    }
    if (abierto.estado === "verde") return { luz: "rojo", porque: "abierto en " + maq + " sin actividad ahora" };
    if (abierto.estado === "rojo") return { luz: "rojo", porque: "cerrado en " + maq };
    return { luz: "amarillo", porque: "no se sabe qué hace en " + maq };
  }
  /* r230 (Carlos, 21-11-2026 20:02: «Neo está con admira.store, no con admira.live»). La pastilla enseña el proyecto en
   * el que el agente trabaja AHORA, con evidencia de /api/flota/trabajando: foco declarado por el agente
   * (POST /api/consejo/foco → fuente «agente»), proyecto de su latido/pulso (fuente «ahora»/«latido»: campo project del
   * latido en bot.yokup.com o proyecto medido en el pulso). Sin dato real → el de por defecto, marcado «por defecto». */
  var FUENTE_REAL = { agente: "declarado por el agente", ahora: "latido / pulso de ahora", latido: "latido", consejero: "declarado" };
  function limpioProy(p) {
    var k = String(p || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return k && k !== "otros" && k !== "training" ? k : "";
  }
  function nombreProy(k) {
    var partes = k.split(".");
    if (partes.length < 2) return k.charAt(0).toUpperCase() + k.slice(1);
    var ext = partes.slice(1).join(".");
    return partes[0].charAt(0).toUpperCase() + partes[0].slice(1) + "." + (ext.length < 5 ? ext : ext.charAt(0).toUpperCase() + ext.slice(1));
  }
  function proyectoActual(t, fijo) {
    var f = t && t.foco;
    if (f && !f.defecto && FUENTE_REAL[f.fuente] && limpioProy(f.proyecto)) return { k: limpioProy(f.proyecto), defecto: false, fuente: FUENTE_REAL[f.fuente] };
    if (t && limpioProy(t.proyecto)) return { k: limpioProy(t.proyecto), defecto: false, fuente: "latido" };
    if (fijo && fijo.proyecto) return { k: fijo.proyecto, defecto: true, fuente: "por defecto" };
    return null;
  }

  var AGENTES_RAMA = { trinity: "Trinity", neo: "Neo", oraculo: "Oráculo", "oráculo": "Oráculo", morfeo: "Morfeo" };
  function actividadDeEventos(eventos) {
    var out = {};
    (Array.isArray(eventos) ? eventos : []).forEach(function (e) {
      if (!e || !e.created_at || !e.repo) return;
      var p = e.payload || {}, rama = null, accion = null, pr = null;
      if (e.type === "PullRequestEvent" && p.pull_request) {
        rama = p.pull_request.head && p.pull_request.head.ref;
        accion = p.action === "closed" && p.pull_request.merged ? "merged" : p.action;
        pr = p.pull_request.number || p.number || null;
      } else if (e.type === "PushEvent" || e.type === "CreateEvent") {
        rama = e.type === "CreateEvent" ? (p.ref_type === "branch" ? p.ref : null) : p.ref;
        accion = e.type === "PushEvent" ? "push" : "rama creada";
      }
      var r = String(rama || "").replace(/^refs\/heads\//, "").toLowerCase(), pre = r.split("/")[0];
      var agente = r.indexOf("/") > 0 && AGENTES_RAMA[pre] ? AGENTES_RAMA[pre] : null;
      var ts = Date.parse(e.created_at);
      if (!agente || !isFinite(ts)) return;
      if (!out[agente] || out[agente].ts < ts) out[agente] = { ts: ts, hora: new Date(ts).toISOString(), accion: accion, repo: String(e.repo.name || "").split("/").pop(), rama: String(rama).replace(/^refs\/heads\//, ""), pr: pr };
    });
    return out;
  }

  /* Actividad firmada en GitHub: primero el servidor (/api/deepagents/actividad, caché de borde); si GitHub le niega la
   * consulta (403 sin token desde Cloudflare), el navegador la pide a la API pública (CORS, 60/h por IP; aquí ≤ 20/h). */
  var GH_EVENTOS = "https://api.github.com/users/csilvasantin/events/public?per_page=100";
  var ghUltima = 0, ghCache = null;
  function leerActividad(fetchImpl) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.resolve(null);
    function directo() {
      if (Date.now() - ghUltima < 180000) return Promise.resolve(ghCache);
      ghUltima = Date.now();
      return f(GH_EVENTOS, { headers: { accept: "application/vnd.github+json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ev) { if (ev) ghCache = actividadDeEventos(ev); return ghCache; })
        .catch(function () { return ghCache; });
    }
    return f("/api/deepagents/actividad", { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ok && d.agentes ? d.agentes : directo(); })
      .catch(directo);
  }
  /** Los cuatro en su máquina principal: [{ agente, visible, maquina, abierto, actividad, proyecto }]. */
  function resumen(tarjetas, actividadGit) {
    return FIJOS.map(function (f) {
      var t = tarjetaDe(tarjetas, f.agente), ab = abiertoEn(t, f.maquina, tarjetas);
      var ac = actividadEn(t, f.maquina, f.maquina, ab, f.agente, actividadGit), pr = proyectoActual(t, f);
      return { agente: f.agente, visible: NOMBRE[f.agente] || f.agente, maquina: f.maquina, abierto: ab, actividad: ac,
        proyecto: pr ? { k: pr.k, nombre: nombreProy(pr.k), defecto: pr.defecto, fuente: pr.fuente } : null };
    });
  }
  /** Contadores de Consumo: agentes trabajando/abiertos y proyectos activos/total de los agentes abiertos. */
  function contadores(lista) {
    var abiertos = lista.filter(function (a) { return a.abierto.estado === "verde"; });
    var trabajando = abiertos.filter(function (a) { return a.actividad.luz === "verde"; });
    var proys = {};
    abiertos.forEach(function (a) { if (!a.proyecto) return; var p = proys[a.proyecto.k] || (proys[a.proyecto.k] = { k: a.proyecto.k, nombre: a.proyecto.nombre, agentes: [], activo: false }); p.agentes.push(a.visible); if (a.actividad.luz === "verde") p.activo = true; });
    var lp = Object.keys(proys).map(function (k) { return proys[k]; });
    return { agentesTrabajando: trabajando.length, agentesAbiertos: abiertos.length, total: lista.length,
      proyectos: lp, proyectosActivos: lp.filter(function (p) { return p.activo; }).length, proyectosTotal: lp.length };
  }
  return { FIJOS: FIJOS, NOMBRE: NOMBRE, RECIENTE_S: RECIENTE_S, norm: norm, claveMaq: claveMaq, fijoDe: fijoDe, tarjetaDe: tarjetaDe,
    maquinasDe: maquinasDe, abiertoEn: abiertoEn, actividadEn: actividadEn, limpioProy: limpioProy, nombreProy: nombreProy,
    proyectoActual: proyectoActual, actividadDeEventos: actividadDeEventos, leerActividad: leerActividad, resumen: resumen, contadores: contadores };
});
