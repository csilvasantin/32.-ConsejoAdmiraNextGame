/* ============================================================================
 * yk-misiones.js — Lógica compartida del modelo MISIONES · TAREAS.
 *
 * Doctrina — REGLA DE LOS TERCIOS: una MISIÓN (ticket) se descompone en 3 tareas
 * a·b·c con 3 subtareas cada una (a1..c3, máx 9). Los planes ANTIGUOS con pasos
 * d…h (modelo de 8) no se tocan: se cuentan aparte como «+n». La fila de cierre
 * z1 la genera el worker y no cuenta. Subagentes ejecutan, infraagentes
 * reportan. Este módulo es la fuente ÚNICA de la fila de misión, la selección
 * con glow y el árbol de tareas — lo usan /incidencias, /misiones y /tareas
 * para no divergir. Script clásico (sin módulos): expone window.YkMisiones.
 *
 * Uso:
 *   YkMisiones.init({ worker, treeId })   // una vez, antes de pintar
 *   YkMisiones.rowHtml(t)                 // fila .tk de una misión (ticket)
 *   YkMisiones.bindRows(container)        // click=seleccionar (salvo «abrir →»)
 *   YkMisiones.refreshTree()              // repinta el árbol de la selección
 *   YkMisiones.selected()                 // id de la misión activa
 *   YkMisiones.stepsHtml(tasks)           // árbol a·b·c/1·2·3 (vistas globales)
 *   YkMisiones.tercios(tasks)             // {done,total:3,sdone,stotal:9,extra}
 *   YkMisiones.progHtml(p)                // chip «n/3 · n/9 (+n)»
 *   YkMisiones.subCount(tasks)            // subtareas definidas del plan
 *   YkMisiones.nextStatus(cur) / postStatus(id, code, status)
 * ==========================================================================*/
(function () {
  "use strict";

  var CFG = { worker: "", treeId: "taskTree", lsKey: "yk_mission", columnMode:"machine", projectIdLayout:false };
  var SELECTED = "";
  // CAJÓN DE DETALLE (Carlos, 2026-07-21): al seleccionar una misión, el raíl
  // derecho deja de ser solo el árbol abc y pasa a ser la ficha completa —
  // asunto, equipo/agente, estado, captura e informe — para no tener que saltar
  // a /ticket y perder el tablero. La ficha se cachea al pintar la fila (sin
  // fetch extra); el informe se pide a /ticket sólo al abrir el cajón.
  var MIS_CACHE = {};

  var OWN_ICON = { principal: "🧠", subagente: "⚙️", infraagente: "📝" };

  // AVATARES de agente (Ajustes → PERSONALIZACIÓN, Carlos 2026-07-19): si la
  // persona tiene imagen en /avatars/<slug>.jpg se pinta el retrato con el
  // nombre DEBAJO; sin imagen (o con el ajuste apagado) degrada al 👷 clásico.
  // Pref. en localStorage yk_pref_avatars (la escribe yk-frame · AJUSTES; def. ON).
  var AVATARES = { neo: 1, morfeo: 1, smith: 1, trinity: 1 };
  function avatarOn() { try { return localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { return true; } }
  function avSlug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // PERSONALIZACIÓN compartida (AJUSTES → Panel de control): {agents:{slug:
  // {icon,img}}, machines:{…}} desde /prefs/customize. La FOTO personalizada
  // pisa al avatar builtin; el ICONO pisa al emoji por defecto (👷 / 🖥).
  // customizeReady: las páginas pueden esperar antes del primer pintado.
  var CUSTOM = { agents: {}, machines: {}, board: {} };
  var customizeReady = (function () {
    try {
      return window.fetch("https://api.yokup.com/prefs/customize", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var c = (d && d.customize) || {};
          CUSTOM.agents = c.agents || {};
          CUSTOM.machines = c.machines || {};
          CUSTOM.board = c.board || {};
        }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  })();
  // Preferencias del TABLERO (Panel de control → Tablero de misiones):
  // {cols:{proyecto|fecha|ordenador|agente|estado:0|1}, density:"comoda"|"compacta"}.
  function boardPrefs() { return CUSTOM.board || {}; }

  // Imagen de un agente (foto del Panel de control > avatar builtin) o "".
  function agImg(name) {
    var s = agentSlugs(name), full = CUSTOM.agents[s.full] || {}, base = CUSTOM.agents[s.base] || {};
    return full.img || base.img || (AVATARES[s.base] ? "/avatars/" + s.base + ".jpg" : "");
  }
  // Máquinas VIVAS (canon) según /api/browsers + presence; lo inyecta la página con
  // setLiveMachines. null = aún sin datos → NO se alarma. (Carlos, 21-jul-2026)
  var LIVE_MACHINES = null;
  // PLATAFORMA VIVA por agente (RUNTIME · SUPERFICIE) deducida de la presencia real
  // que la página carga cada 60 s (radar → setLiveSurfaces). La 2ª línea de la celda
  // AGENTE de una misión NO reclamada muestra la plataforma REAL del asignado
  // (p.ej. «Claude · CLI»), no el estado del claim: el estado ya vive en su insignia.
  // Sin presencia viva del agente → «—» honesto, nunca «Pendiente». (Carlos, 2026-07-23)
  var LIVE_SURFACES = null;   // { claveAgente: {runtime, host} } · null = aún sin datos
  // Clave normalizada de un agente: usa la identidad canónica (yk-agent-identity) si
  // está cargada; si no (tests/vm sin ella), degrada a avSlug. NEO/NeoMacMini colapsan.
  function agentKey(n) {
    var id = (typeof window !== "undefined") && window.ykAgentIdentity;
    return id && id.key ? id.key(n) : avSlug(n);
  }
  // Clave de la PERSONA BASE (NeoMacMini → neo): así la plataforma casa aunque el
  // assignee lleve apellido de máquina y la presencia lata en pelado, o al revés.
  function baseAgentKey(n) {
    var id = (typeof window !== "undefined") && window.ykAgentIdentity;
    return id && id.base && id.key ? id.key(id.base(n)) : avSlug(n);
  }
  // Plataforma REAL «RUNTIME · SUPERFICIE» del primer agente con presencia viva de la
  // lista (nombre completo primero, luego persona base); "" si ninguno late. Null-safe.
  function liveSurfaceOf(names) {
    if (!LIVE_SURFACES) return "";
    names = names || [];
    for (var i = 0; i < names.length; i++) {
      var n = names[i]; if (!n) continue;
      var sf = LIVE_SURFACES[agentKey(n)] || LIVE_SURFACES[baseAgentKey(n)];
      if (sf) {
        var h = sf.host === "cli" ? "CLI" : sf.host === "app" ? "Desktop App" : "";
        return [sf.runtime, h].filter(Boolean).join(" · ");
      }
    }
    return "";
  }
  // Estado "máquina apagada" para una misión PENDIENTE (sin surface): si su máquina
  // destino NO está entre las vivas, el empujón no llegó y nadie la recogerá.
  function machOffOf(t, surface) {
    // Sin datos de vivas (null) o set VACÍO (fetch falló / aún no cargó) → no se
    // puede saber, así que NO se alarma: mejor «Pendiente» que un falso «apagada».
    if (surface || !LIVE_MACHINES || !LIVE_MACHINES.size) return null;
    var mc = canonMachine(t.machine || t.loc || "");
    if (!mc || LIVE_MACHINES.has(mc)) return null;
    return { since: t.created_at, machine: t.machine || t.loc || "" };
  }

  function agentSlugs(name) {
    var full = avSlug(name), id = (typeof window !== "undefined") && window.ykAgentIdentity;
    var base = id && id.base ? avSlug(id.base(name)) : full;
    return {full:full, base:base || full};
  }
  function agentCustom(name) {
    var s=agentSlugs(name), full=CUSTOM.agents[s.full]||{}, base=CUSTOM.agents[s.base]||{};
    return {icon:full.icon||base.icon||"", img:full.img||base.img||""};
  }
  function visibleAgent(name, machine) {
    return window.ykAgentIdentity ? window.ykAgentIdentity.display(name, machine) : name;
  }
  // Roles ESTRUCTURALES del ticket: no son nombres de nadie, no se pintan como origen.
  var ROLES_ESTRUCTURALES = ["mission", "standalone-task", ""];
  function delegacionHtml(t) {
    var quien = String((t && t.role) || "").trim();
    if (!quien || ROLES_ESTRUCTURALES.indexOf(quien) >= 0) return "";
    var hace = String((t && t.assignee) || "").trim();
    // mismo agente aunque lleve apellido de equipo: pedirtelo tu no es delegar
    var raiz = function (v) { return v.toLowerCase().replace(/[^a-z0-9]/g, ""); };
    if (hace && (raiz(quien).indexOf(raiz(hace)) === 0 || raiz(hace).indexOf(raiz(quien)) === 0)) return "";
    // El canal se lee del propio origen: lo que entra por la web se firma «status-web».
    var canal = /status-web/i.test(quien) ? "yokup.com" : "Telegram";
    var nombre = quien.split("\u00b7")[0].trim() || quien;
    return '<span class="deleg" title="' + esc("Delegada: te la pidio " + nombre + " por " + canal) +
      '">\u21aa delegada por ' + esc(nombre) + " \u00b7 " + esc(canal) + "</span>";
  }

  function whoHtml(name, machine, surface, agents, machOff) {
    if(arguments.length<=4){machOff=agents;agents=surface;surface=machine;machine="";}
    var cu = agentCustom(name);
    var visible = agents && agents.length > 1 ? agents.map(function(a){return visibleAgent(a,machine);}).join(" + ") : visibleAgent(name,machine);
    // Plataforma REAL del agente asignado (RUNTIME · SUPERFICIE), nunca el estado:
    //  · reclamada → la superficie que confirmó el propio claim;
    //  · sin claim pero con presencia viva → deducida de esa presencia AHORA;
    //  · máquina destino sin señal → aviso «apagada»;
    //  · sin presencia → «—» honesto (jamás «Pendiente»: eso vive en la insignia).
    var plat, platCls, platTitle = "";
    var names = (agents && agents.length) ? agents : [name];
    if (surface) { plat = esc(surface); platCls = "agent-surface"; }
    else {
      var live = liveSurfaceOf(names);
      if (live) {
        plat = esc(live); platCls = "agent-surface";
        platTitle = "Plataforma de " + name + " según su presencia viva ahora.";
      } else if (machOff) {
        plat = "⚠️ apagada"; platCls = "agent-surface off";
        platTitle = "La máquina destino" + (machOff.machine ? " (" + machOff.machine + ")" : "") + " está sin señal / apagada" + (machOff.since ? " · pendiente desde " + fechaCorta(machOff.since) : "") + ": el empujón no llegó y nadie la recogerá hasta que vuelva online.";
      } else {
        plat = "—"; platCls = "agent-surface pend";
        platTitle = name + " no late en presencia ahora — plataforma desconocida.";
      }
    }
    var smallHtml = '<small class="' + platCls + '"' + (platTitle ? ' title="' + esc(platTitle) + '"' : "") + ">" + plat + "</small>";
    // Misión DIFUNDIDA (2-3 agentes agrupados): PILA de retratos, una imagen
    // encima de la otra (Carlos, 2026-07-19), con el rótulo del grupo debajo.
    if (avatarOn() && agents && agents.length > 1) {
      var pics = agents.slice(0, 3).map(function (a) {
        var im = agImg(a);
        return im ? '<img class="agava" loading="lazy" onerror="this.remove()" src="' + esc(im) + '" alt="" title="' + esc(a) + '">' : "";
      }).filter(Boolean);
      if (pics.length) {
        return '<span class="who who-av"><span class="agstack">' + pics.join("") + "</span>" +
          "<span>" + esc(visible) + "</span>" + smallHtml + "</span>";
      }
    }
    // FOTO del Panel de control > avatar builtin; ICONO personalizado > 👷.
    var img = agImg(name);
    if (avatarOn() && img) {
      return '<span class="who who-av"><img class="agava" loading="lazy" onerror="this.remove()" src="' + esc(img) + '" alt="">' +
        "<span>" + esc(visible) + "</span>" + smallHtml + "</span>";
    }
    return '<span class="who"><span>' + (cu.icon ? esc(cu.icon) : "👷") + " " + esc(visible) +
      "</span>" + smallHtml + "</span>";
  }
  // Visual de la columna ORDENADOR: foto pequeña > icono personalizado > 🖥.
  function machineTypeVisual(maq) {
    var k=avSlug(canonMachine(maq));
    if(k.indexOf("macmini")===0)return '<span class="machtype mach-mini" aria-label="Mac mini">▣</span>';
    if(k.indexOf("macbookpro")===0)return '<span class="machtype mach-pro" aria-label="MacBook Pro">▰</span>';
    if(k.indexOf("macbookair")===0)return '<span class="machtype mach-air" aria-label="MacBook Air">▱</span>';
    return "";
  }
  function machVisual(maq) {
    var cu = CUSTOM.machines[avSlug(maq)] || {};
    if (cu.img) return '<img class="machava" loading="lazy" onerror="this.outerHTML=\'🖥\'" src="' + esc(cu.img) + '" alt="">';
    return machineTypeVisual(maq) || esc(cu.icon || "🖥");
  }
  var CHIP = { pending: "○", in_progress: "◐", done: "●" };
  var NEXT_ST = { pending: "in_progress", in_progress: "done", done: "pending" };
  var STS = ["pending", "in_progress", "done"];

  function esc(x) {
    return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }
  function cssq(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  function ago(ms) {
    if (!ms) return "—";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "hace " + s + "s";
    if (s < 3600) return "hace " + Math.round(s / 60) + "m";
    if (s < 86400) return "hace " + Math.round(s / 3600) + "h";
    return "hace " + Math.round(s / 86400) + "d";
  }
  function slaLeft(created) {
    var left = created + 7200000 - Date.now();
    if (left <= 0) return "SLA vencido";
    var m = Math.round(left / 60000);
    return "SLA " + (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m");
  }
  // Fecha ABSOLUTA de la misión (dd/mm hh:mm) — el «hace X» relativo se queda,
  // pero la tarjeta pinta también la fecha real (pedido Carlos, 2026-07-15).
  function fechaCorta(ms) {
    if (!ms) return "";
    var d = new Date(ms > 4102444800 ? ms : ms * 1000);
    if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function init(opts) {
    opts = opts || {};
    if (opts.worker) CFG.worker = opts.worker;
    if (opts.treeId) CFG.treeId = opts.treeId;
    if (opts.columnMode) CFG.columnMode = opts.columnMode;
    CFG.projectIdLayout = !!opts.projectIdLayout;
    try { SELECTED = localStorage.getItem(CFG.lsKey) || ""; } catch (e) {}
  }
  function selected() { return SELECTED; }

  // ---- Nombre CANÓNICO de máquina -------------------------------------------
  // Los encargos llegan con el nombre en formatos dispares (minúsculas, con
  // espacios, alias) y el selector sacaba duplicados del mismo equipo.
  // Canónico = el ComputerName real de cada Mac. DECISIÓN Carlos (2026-07-15):
  // «MacBookAirPlata» es el Air de 14; el de 16 es «MacBookAir16plata»
  // (y «macbookair16» es un alias suyo, NO otra máquina).
  // SIMPLIFICACIÓN (Carlos, 2026-07-15): los MacBookPro sin color, por tamaño —
  // solo hay dos: MacBookPro14 (antes «MacBookProNegro14») y MacBookPro16.
  // OJO: es nombre de PANTALLA; el target_machine de los encargos viaja con el
  // ComputerName real de cada Mac (si no, el claim daría wrong-machine).
  var MAQ_ALIAS = { macbookair16: "macbookair16plata", macbookpronegro14: "macbookpro14" };
  var MAQ_NOMBRE = {
    macbookpro14: "MacBookPro14",
    macbookpro16: "MacBookPro16",
    macbookair16plata: "MacBookAir16plata",
    macbookairplata: "MacBookAirPlata",
    macbookairazul: "MacBookAirAzul",
    macbookaircrema: "MacBookAirCrema",
    macbookairrosa: "MacBookAirRosa",
    // OJO: MacBookAirLuna/Luna1 NO existen (Carlos, 2026-07-15) — eran máquinas
    // fantasma de unos encargos mal dirigidos; no las legitimes aquí.
    macmini: "MacMini",
    asuszenbook: "ASUS Zenbook",
    dgxspark: "DGX Spark",
    thinkstationpgx: "ThinkStation PGX"
  };
  function canonMachine(raw) {
    var n = String(raw || "").toLowerCase().replace(/[\s·._-]+/g, "");
    n = MAQ_ALIAS[n] || n;
    if (MAQ_NOMBRE[n]) return MAQ_NOMBRE[n];
    // El router de encargos (admira-telegram) antepone «admira-» al ComputerName
    // real: la misión viaja con `admira-macmini` mientras la presencia y los
    // navegadores laten con el nombre pelado `MacMini`. Sin normalizar el prefijo
    // el canon no cuadraba y una misión en una máquina VIVA salía como «⚠ apagada»
    // (FLT-1005). Se normaliza GENÉRICO: quitando «admira» aparece el ComputerName
    // conocido → ese es el canónico (así vale para admira-macbookpro14, etc. sin
    // tabla a dedo). (Carlos, 2026-07-23)
    if (n.length > 6 && n.slice(0, 6) === "admira") {
      var bare = MAQ_ALIAS[n.slice(6)] || n.slice(6);
      if (MAQ_NOMBRE[bare]) return MAQ_NOMBRE[bare];
    }
    return raw;
  }

  // ID DE FLOTA para el enlace «operar» de admira.live/control. El registro
  // (admira-fleet) usa ids en minúsculas con un único prefijo «admira-»
  // (admira-macbookaircrema). Antes se concatenaba a pelo «admira-» + el nombre
  // CANÓNICO, que va en CamelCase → «admira-MacBookAirCrema»; y si el nombre ya
  // traía el prefijo, salía duplicado. (Carlos, 24-jul-2026)
  function rcId(maq) {
    var n = String(maq || "").toLowerCase().replace(/[\s·._-]+/g, "");
    if (n.slice(0, 6) === "admira") n = n.slice(6);
    return n ? "admira-" + n : "";
  }

  // Máquina donde corre/se solventa la misión: loc (target_machine del encargo)
  // o, en tickets de flota antiguos, incrustada en screen «Persona·Máquina #id».
  // Exportada: la usan los selectores de /misiones para filtrar por equipo.
  // Devuelve SIEMPRE el nombre canónico (dedupe de formatos y alias).
  function machineOf(t) {
    var maq = t.machine || t.loc || "";
    if (!maq) { var mm = /^[^·]+·(.+?)\s+#\d+$/.exec(t.screen || ""); if (mm) maq = mm[1]; }
    return maq === "?" ? "" : canonMachine(maq);
  }

  // Proyecto PRINCIPAL de una misión, deducido de su texto → web para la miniatura.
  // (Carlos, 2026-07-16: referencia visual de en qué está el agente/máquina.)
  var PROY = [
    ["pixeria", "https://www.pixeria.com"], ["xpaceos", "https://www.xpaceos.com"], ["xpace os", "https://www.xpaceos.com"],
    ["yokup", "https://www.yokup.com"], ["clearchannel", "https://www.clearchannel.tv"],
    ["admira.live", "https://www.admira.live"], ["admira.tv", "https://www.admira.tv"],
    ["admiranext", "https://admiranext.com"], ["ainimation", "https://ainimation.studio"], ["digitalavatar", "https://digitalavatar.ai"]
  ];
  // El proyecto ASIGNADO manda sobre el adivinado. Desde FLT-984 la misión lleva
  // su proyecto del censo (`project` = id, `project_name` = nombre, y la web en
  // /projects), así que la miniatura sale del dato y no de buscar palabras en el
  // asunto. La búsqueda por palabras se queda SOLO como respaldo para las
  // misiones viejas, que nadie ha asignado todavía.
  var PROY_WEB = {};   // id del censo → web, lo rellena YkMisiones.setProyectos
  var PROY_META = {};  // id → nombre y responsabilidad; sólo lectura en /misiones
  function proyectoDe(t) {
    var pid = t && (t.project || "");
    if (pid && PROY_WEB[String(pid).toLowerCase()]) return PROY_WEB[String(pid).toLowerCase()];
    var s = ((t && (t.subject || "")) + " " + (t && (t.screen || "")) + " " + (t && (t.loc || ""))).toLowerCase();
    for (var i = 0; i < PROY.length; i++) if (s.indexOf(PROY[i][0]) >= 0) return PROY[i][1];
    return "";
  }
  // Censo de proyectos (GET /projects) para resolver web y nombre sin adivinar.
  function setProyectos(list) {
    PROY_WEB = {};
    PROY_META = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var key = String(p.id).toLowerCase(), w = String(p.web || "").trim();
      if (w) PROY_WEB[key] = /^https?:\/\//i.test(w) ? w : "https://" + w;
      PROY_META[key] = {
        id:String(p.id), name:String(p.name || p.id), owner:String(p.owner || ""),
        primary_responsible:String(p.primary_responsible || p.owner || ""),
        agents:Array.isArray(p.agents) ? p.agents.slice() : []
      };
    });
  }
  // Compatibilidad con registros anteriores: el backend conserva inbox, eventos,
  // responsable y demás trazabilidad, pero el título visible describe sólo el
  // trabajo. La sintaxis estricta evita borrar frases sustantivas parecidas.
  function cleanMissionAttributions(value) {
    var subject = String(value || "");
    var boundary = "(^|[.!?]\\s+)";
    var date = "(?:\\d{1,2}[-/](?:\\d{1,2}|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[-/]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+de\\s+\\d{4})";
    var agent = "(?:(?:Sub|Infra)?(?:Oraculo|Oráculo|Morfeo|Neo|Trinity|Cypher|Smith|Agente\\s+Smith)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*(?:\\s+en\\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 -]+)?)";
    subject = subject.replace(new RegExp(boundary + "Encargo\\s+de\\s+Carlos\\s+el\\s+" + date + "\\s*(?::|\\.)\\s*", "gi"), "$1");
    subject = subject.replace(new RegExp(boundary + "Responsable\\s*:?[ \\t]+" + agent + "\\s*\\.\\s*", "gi"), "$1");
    return subject.replace(/[ \t]{2,}/g, " ").trim();
  }
  // La columna ya se llama MISIÓN y muestra el proyecto encima del asunto:
  // retiramos ambos prefijos sólo cuando están delimitados, sin tocar palabras
  // legítimas del título (p.ej. «Yokup Highscore» si el proyecto es «Yokup»).
  function missionTitle(t, raw) {
    var title = cleanMissionAttributions(raw).replace(/^\s*misión\s+/i, "").trim();
    var projectId = String(t && t.project || "").trim();
    var meta = projectId ? (PROY_META[projectId.toLowerCase()] || {}) : {};
    var projectName = String(meta.name || (t && t.project_name) || projectId).trim();
    if (projectName) {
      var escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      title = title.replace(new RegExp("^" + escaped + "\\s*(?:[·:—-]\\s*)", "i"), "").trim();
    }
    return title;
  }
  function missionSourceLabel(t) {
    return ({ "agent-iot": "🖥 Pantalla DOOH", monitor: "🌐 Servicio", service: "🌐 Servicio", agent: "🤖 Agente", agente: "🤖 Agente", presence: "🖥 Máquina", machine: "🖥 Máquina", fleet: "🎯 Misión", "decision-batch": "🗳 Decisión", "cli-declare": "⌨️ Declarada" }[t && t.source] || "👤 Manual");
  }
  // ENLACE AL TRABAJO REALIZADO (Carlos, 2026-07-23): la miniatura de la misión no
  // es un adorno ni sólo un lightbox — es un ENLACE al trabajo ENTREGADO. Resuelve
  // el destino EN ORDEN, sin adivinar:
  //   1) URL de trabajo EXPLÍCITA que la misión traiga como campo propio (work_url /
  //      url / web / link). Hoy /fleet/missions NO publica ninguno de estos campos en
  //      el ticket; se contemplan para cuando el worker los sirva (no se toca yokup-rtc).
  //   2) La PRIMERA URL http(s) que aparezca en los INFORMES (report) de sus tareas
  //      —el tablero las adjunta como t._tasks (de /tasks/all, que sí trae report);
  //      de respaldo t.tasks—, descartando la propia PRUEBA (/media/…) y las imágenes
  //      (.png/.jpg…), y PREFIRIENDO los dominios de la casa sobre cualquier otro.
  //   3) La web PUBLICADA del proyecto ASIGNADO (censo /projects → PROY_WEB): «dónde
  //      vive» el trabajo del proyecto. Sólo el proyecto ASIGNADO (t.project), nunca
  //      el adivinado por palabras (eso no es prueba del trabajo). FLT-1003 (Generador
  //      de Presites) sale por aquí: sus informes no llevan URL, y su project
  //      'generador-de-presites' → https://www.admiranext.com/presites.
  //   4) Sin nada resoluble → "" (la miniatura conserva el lightbox de siempre).
  // Función PURA y null-safe: no toca DOM ni red; sólo lee el ticket + PROY_WEB.
  var HOUSE_DOMS = [
    "admiranext.com", "admira.live", "yokup.com", "xpaceos.com", "pixeria.com",
    "admira.tv", "clearchannel.tv", "ainimation.studio", "digitalavatar.ai",
    "admira.store", "carlossilva.info", "admira.studio"
  ];
  function isProofUrl(u) {
    return /\/media\//.test(u) || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#]|$)/i.test(u);
  }
  function firstReportUrl(rows) {
    if (!rows || !rows.length) return "";
    var cands = [];
    for (var i = 0; i < rows.length; i++) {
      var rep = rows[i] && (rows[i].report || rows[i].informe);
      if (!rep) continue;
      var found = String(rep).match(/https?:\/\/[^\s)\]"'<>]+/g);
      if (!found) continue;
      for (var j = 0; j < found.length; j++) {
        // recorta la puntuación de prosa pegada al final de la URL (« . , ; : ) »).
        var u = found[j].replace(/[.,;:!?)\]}>'"»]+$/, "");
        if (u && !isProofUrl(u)) cands.push(u);
      }
    }
    if (!cands.length) return "";
    // dominios de la casa PRIMERO, en el orden en que aparezcan.
    for (var k = 0; k < cands.length; k++) {
      var host = cands[k].replace(/^https?:\/\/(www\.)?/i, "").toLowerCase();
      for (var h = 0; h < HOUSE_DOMS.length; h++) if (host.indexOf(HOUSE_DOMS[h]) === 0) return cands[k];
    }
    return cands[0];
  }
  function workUrlOf(t) {
    if (!t) return "";
    // 1) campo explícito en el propio ticket (hoy inexistente en /fleet/missions).
    var direct = t.work_url || t.workUrl || t.url || t.web || t.link;
    if (direct && /^https?:\/\//i.test(String(direct).trim())) return String(direct).trim();
    // 2) primera URL http(s) de los informes de las tareas (casa primero).
    var rep = firstReportUrl(t._tasks || t.tasks);
    if (rep) return rep;
    // 3) web publicada del proyecto ASIGNADO del censo (no la adivinada por palabras).
    var pid = t.project ? String(t.project).toLowerCase() : "";
    if (pid && PROY_WEB[pid]) return PROY_WEB[pid];
    // 4) nada resoluble → la miniatura se queda en lightbox.
    return "";
  }
  // miniatura de una web (thum.io; cargada directa desde el navegador — las IPs de
  // datacenter la bloquean, pero el navegador del usuario es residencial).
  // Miniatura de la web del proyecto vía el endpoint PROPIO /shot de yokup-rtc
  // (captura cacheada en R2, servida desde el propio dominio; antes se pegaba a
  // image.thum.io directo desde cada navegador). w se ignora: /shot da 480×300.
  function shotUrl(web, w) { return CFG.worker + "/shot?url=" + encodeURIComponent(web); }
  function dominioDe(web) {
    return String(web || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
  // El favicon del propio sitio: sin servicios de terceros y sin filtrar a nadie
  // qué proyectos mira la flota.
  function faviconUrl(web) {
    var d = dominioDe(web);
    return d ? "https://" + d + "/favicon.ico" : "";
  }
  // Evidencia representativa de una misión, separada de su estado «en vivo».
  // La frescura sólo decide si pulsa el halo; nunca autoriza a reemplazar una
  // captura real ya disponible por el favicon del proyecto. `process_image` es
  // el campo derivado por el worker cuando live_kind='process'; se acepta como
  // señal explícita incluso en payloads que ya no repiten live_kind.
  function missionEvidenceOf(t) {
    t = t || {};
    var proof = String(t.proof_image || "").trim();
    var proofKind = String(t.proof_kind || "").trim();
    if (proof && (!proofKind || proofKind === "final")) {
      return { src: proof, kind: "final", fresh: false };
    }
    var process = String(t.process_image || (t.live_kind === "process" ? t.live_shot : "") || "").trim();
    if (process) {
      var capturedAt = +(t.process_captured_at || t.live_at || 0);
      if (capturedAt && capturedAt < 4102444800) capturedAt *= 1000;
      return { src: process, kind: "process", fresh: !!capturedAt && Date.now() - capturedAt < 180000 };
    }
    return { src: "", kind: "fallback", fresh: false };
  }
  // LIGHTBOX: clic en la miniatura → captura EN GRANDE (no navega a la web).
  function openLightbox(web, direct) {
    var ov = document.getElementById("yk-lightbox");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "yk-lightbox";
      ov.innerHTML = '<div class="ykl-box"><img class="ykl-img" alt=""><a class="ykl-open" target="_blank" rel="noopener"></a></div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function (e) { if (e.target === ov || e.target.classList.contains("ykl-img")) ov.classList.remove("show"); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") ov.classList.remove("show"); });
    }
    ov.querySelector(".ykl-img").src = direct ? web : "https://image.thum.io/get/width/1100/" + web;
    var op = ov.querySelector(".ykl-open"); op.href = web; op.textContent = direct ? "abrir pantallazo ↗" : "abrir " + web.replace(/^https?:\/\/(www\.)?/, "") + " ↗";
    ov.classList.add("show");
  }
  document.addEventListener("click", function (e) {
    // Encapsulado: el botón de una letra despliega/pliega SUS subtareas (nivel de
    // dentro; delegado para que valga en /tareas y /misiones sin cablear cada vista).
    var tog = e.target.closest && e.target.closest(".substog");
    if (tog) { var step = tog.closest(".step"); if (step) { step.classList.toggle("collapsed"); var op = !step.classList.contains("collapsed"); tog.textContent = (op ? "▾ " : "▸ ") + tog.textContent.replace(/^[▸▾]\s*/, ""); } return; }
    var img = e.target.closest && e.target.closest(".shot-img");
    // Si la miniatura es un ENLACE al trabajo (envuelta en a.shot-link), NO se abre
    // el lightbox: se deja que el navegador siga el enlace (pestaña nueva). (2026-07-23)
    if (img && img.closest && img.closest(".shot-link")) return;
    if (img && (img.dataset.proof || img.dataset.shot)) {
      e.preventDefault(); openLightbox(img.dataset.proof || img.dataset.shot, !!img.dataset.proof);
    }
  });

  // ------- fila de MISIÓN (idéntica en /incidencias y /misiones) -------
  // ESTADOS canónicos (Carlos, 2026-07-19): Sin asignar · Pendiente · En curso ·
  // Finalizada. PENDIENTE = tiene AGENTE/EQUIPO pero aún NO reclamada (registrada,
  // sin arrancar). Al reclamarla (bot-inbox-claim) pasa a in_progress = En curso.
  // Antes esto se llamaba «Asignada», lo que confundía backlog con trabajo en marcha.
  //
  // OJO (Carlos, 2026-07-23): el «claim» (bot-inbox-claim) es UN camino a in_progress,
  // no el único. Los agentes CLI (Claude Code) NO reclaman: ejecutan directo y dejan
  // rastro REAL en el plan (tareas/subtareas in_progress o done, con informes). Una
  // misión así — p.ej. FLT-1005 con tareas a·b done — se quedaba «Pendiente», absurdo.
  // Por eso «Pendiente» exige AHORA cero rastro de trabajo: si el plan tiene algo
  // tocado, es «En curso» aunque nadie la reclamara. Es un OR con el claim, no un
  // reemplazo (quien reclame sigue subiendo a in_progress igual). El worker sigue
  // dueño de `status`; esto sólo corrige el caso en que el status quedó rezagado.
  function hayTrabajo(t) {
    if (!t) return false;
    // Array crudo del plan (lo adjunta el tablero como t._tasks): detecta también
    // in_progress, no sólo hechas. Null-safe: misiones sin plan pasan de largo.
    var rows = t._tasks;
    if (rows && rows.length) {
      for (var i = 0; i < rows.length; i++) {
        var s = rows[i] && rows[i].status;
        if (s === "in_progress" || s === "done" || s === "resolved") return true;
      }
    }
    // Sin el array, el resumen en TERCIOS (t._prog) ya trae el recuento de HECHAS
    // (tareas + subtareas + pasos antiguos). Cualquier recuento >0 = trabajo real.
    var p = t._prog;
    if (p && (((p.done | 0) > 0) || ((p.sdone | 0) > 0) || ((p.extraDone | 0) > 0))) return true;
    return false;
  }
  function estadoDe(t) {
    // Contrato /tickets visible-v1: el backend ya aplicó la misma precedencia
    // cerrada → no concluida → en curso real → pendiente → sin asignar sobre el
    // universo solicitado. Usarlo evita convertir 201 tickets técnicos
    // in_progress pero stale en un chip «En curso» que la cuadrícula no comparte.
    var visible = t && t.visible_state;
    if (visible === "cancelled") return { c: "b-cancel", l: "Eliminada" };
    if (visible === "resolved") return { c: "b-res", l: "Finalizada" };
    if (visible === "unconcluded") return { c: "b-cancel", l: "No concluida" };
    if (visible === "in_progress") return { c: "b-prog", l: "En curso" };
    if (visible === "pending") return { c: "b-pend", l: "Pendiente" };
    if (visible === "unassigned") return { c: "b-sina", l: "Sin asignar" };
    if (t.status === "cancelled") return { c: "b-cancel", l: "Eliminada" };
    if (t.status === "resolved") return { c: "b-res", l: "Finalizada" };
    if (t._unconcluded) return { c: "b-cancel", l: "No concluida" };
    if (t.status === "in_progress") return { c: "b-prog", l: "En curso" };
    // Trabajo real en el plan ⇒ «En curso», nunca «Pendiente» (rastro CLI sin claim).
    if (hayTrabajo(t)) return { c: "b-prog", l: "En curso" };
    return (t.assignee || t.loc || t.machine) ? { c: "b-pend", l: "Pendiente" } : { c: "b-sina", l: "Sin asignar" };
  }
  // Contrato canónico de cierre diario. No se infiere desde `note` ni desde el
  // texto de eventos: una cancelación manual o un payload legacy sigue siendo
  // simplemente «Eliminada», sin atribuirle una causa que no consta.
  function dailyClosureMeta(t) {
    if (!t || t.closure_reason !== "daily_cleanup" || t.status !== "cancelled" || t.visible_state !== "cancelled") return null;
    var at = +t.closed_at || 0;
    var date = "fecha no disponible";
    if (at) {
      try {
        var parts = {}, fmt = new Intl.DateTimeFormat("es-ES", {timeZone:"Europe/Madrid", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hourCycle:"h23"});
        fmt.formatToParts(new Date(at)).forEach(function (p) { if (p.type !== "literal") parts[p.type] = p.value; });
        date = parts.day + "/" + parts.month + "/" + parts.year + " " + parts.hour + ":" + parts.minute + " (Madrid)";
      } catch (e) { date = fechaCorta(at); }
    }
    return {
      at: at,
      date: date,
      text: "Eliminada automáticamente al cierre del día · " + date + ". Cierre recuperable; no es un borrado físico."
    };
  }
  // Un único criterio para contador, insignia y filtro. El estado técnico puede
  // seguir siendo in_progress mientras la categoría visible ya es «No concluida».
  function coincideEstado(t, filtro) {
    var label = estadoDe(t).l;
    if (filtro === "sin") return label === "Sin asignar";
    if (filtro === "asignadas") return label === "Pendiente";
    if (filtro === "in_progress") return label === "En curso";
    if (filtro === "unconcluded") return label === "No concluida";
    if (filtro === "resolved") return label === "Finalizada";
    if (filtro === "cancelled") return label === "Eliminada";
    return true;
  }
  function visibleId(t) {
    if (window.YkDisplayRef && window.YkDisplayRef.of) return window.YkDisplayRef.of(t || {});
    var supplied = String((t && t.display_ref) || "").trim();
    if (supplied) return supplied;
    var ms = +(t && t.created_at || 0); if (ms && ms < 4102444800) ms *= 1000;
    if (!ms) return "0000.--/--/----.--:--";
    try {
      var parts={},fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Madrid",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
      fmt.formatToParts(new Date(ms)).forEach(function(x){if(x.type!=="literal")parts[x.type]=x.value;});
      return "0000."+parts.day+"/"+parts.month+"/"+parts.year+"."+parts.hour+":"+parts.minute;
    } catch(e) {
      var d = new Date(ms), p = function(n){ return (n<10?"0":"")+n; };
      return "0000." + p(d.getDate()) + "/" + p(d.getMonth()+1) + "/" + d.getFullYear() + "." + p(d.getHours()) + ":" + p(d.getMinutes());
    }
  }

  // El marcador «[PRIORIDAD ABSOLUTA]» (o [PRIORIDAD …], [TEST …]) viajaba en el
  // TEXTO del encargo y ensuciaba el título. Se separa: el título queda limpio y
  // el marcador se pinta como ETIQUETA bajo el id (Carlos, 2026-07-18).
  function prioMarca(subject) {
    var m = /^\s*\[([^\]]+)\]\s*/.exec(String(subject || ""));
    if (!m) return { flag: "", limpio: String(subject || "") };
    return { flag: m[1].trim(), limpio: String(subject).slice(m[0].length) };
  }
  // REGLA DE LOS TERCIOS (FLT-979): el avance de una misión se lee SIEMPRE en
  // tercios — TAREAS a·b·c sobre 3 y SUBTAREAS a1…c3 sobre 9. Antes el contador
  // usaba `COUNT(*)` de mission_tasks (lo que sirve el worker en `progress`), que
  // mezcla pasos + subtareas + filas de cierre (z1) y daba 1/13, 0/12, 1/29 o
  // 33/33: denominadores que no se pueden comparar de un vistazo.
  // Las misiones VIEJAS con pasos d…h (modelo de 8) no se tocan ni se borran: sus
  // filas fuera del tercio se cuentan aparte y se avisan en el title.
  function tercios(rows, standalone) {
    var top = [], sub = [], extra = 0, extraDone = 0;
    (rows || []).forEach(function (r) {
      var c = String((r && r.code) || "").trim().toLowerCase();
      if (/^[a-c]$/.test(c)) top.push(r);
      else if (/^[a-c][1-3]$/.test(c)) sub.push(r);
      // z1/z2 = fila de CIERRE (informe) que genera el propio worker, no es un
      // paso del plan: ni suma ni resta en el contador de tercios.
      else if (c && !/^z\d*$/.test(c)) { extra++; if (r.status === "done") extraDone++; }
    });
    if (!top.length && !sub.length && !extra) return null;
    var hecho = function (a) { return a.filter(function (r) { return r.status === "done"; }).length; };
    // «No aplicaba» (estado no_aplica, 1-sep-2026) tiene cuenta PROPIA: concluye el
    // arbol pero NUNCA suma como hecho. Copiado del worker a proposito, igual que el
    // resto de esta funcion, para que tablero y navegador no puedan divergir.
    var nada = function (a) { return a.filter(function (r) { return r.status === "no_aplica"; }).length; };
    if (standalone) {
      return {
        done: hecho(top), total: Math.max(1, top.length),
        na: nada(top), sna: 0,
        sdone: 0, stotal: 0,
        topN: top.length, subN: 0,
        incompleto: false, standalone: true,
        extra: extra, extraDone: extraDone
      };
    }
    // DENOMINADORES FIJOS 3 y 9 (decisión de Carlos vía coordinación, 22-jul-2026).
    // La tarea suelta declarada es la única excepción: 1 tarea, 0 subtareas.
    // Antes el denominador era el tamaño REAL del plan (Math.min(top,3)||3 y
    // Math.min(sub,9)), así que un plan a medio definir leía 0/2 · 0/6 y volvía a
    // no poderse comparar con uno de 0/3 · 0/9 — justo el problema que la regla
    // venía a matar. Un plan con 2 tareas NO es un plan de 2: es un plan de 3
    // INCOMPLETO, y eso se dice (incompleto/topN/subN → borde discontinuo y ◌),
    // no se disimula bajando el denominador. Nunca se inventan filas.
    return {
      done: hecho(top), total: 3,
      na: nada(top), sna: nada(sub),
      sdone: hecho(sub), stotal: 9,
      topN: top.length, subN: sub.length,
      incompleto: top.length < 3 || sub.length < 9,
      extra: extra, extraDone: extraDone
    };
  }
  // Chip de progreso de una fila: «n/3» de tareas + «n/9» de subtareas, SIEMPRE
  // sobre 3 y 9 para que dos misiones se comparen de un vistazo. Estados:
  //   .full     → 3/3 · 9/9, el tercio entero hecho (verde sólido).
  //   .hechoinc → todo lo DEFINIDO está hecho, pero el plan no llega a 3×3:
  //               cifras en verde con borde discontinuo, no se vende por pleno.
  //   .inc      → plan incompleto (borde discontinuo + ◌); el tooltip dice
  //               cuántas filas hay definidas de las 3 y las 9 que tocan.
  function progHtml(p) {
    if (!p || !p.total) return "";
    // CONCLUIDO no es PLENO. Un paso descartado cierra el arbol pero no se pinta
    // como hecho: la barra solo avanza con trabajo real, y el descarte se dice
    // aparte. Si se sumara a `done`, una mision con 5 pasos inventados leeria
    // 12/12 y el planificador que los invento seguiria invisible.
    var na = (p.na | 0) + (p.sna | 0);
    var pct = p.standalone ? Math.round(100 * p.done / p.total) : Math.round(100 * (p.done * 3 + p.sdone) / (p.total * 3 + p.stotal));
    var pleno = p.done >= p.total && (p.standalone || p.sdone >= p.stotal);
    var hechoInc = !pleno && p.topN > 0 && p.done >= p.topN && p.sdone >= p.subN;
    var tip = p.done + " de " + p.total + (p.standalone ? " tarea suelta hecha" : " tareas hechas · " + p.sdone + " de " + p.stotal + " subtareas")
      + (na ? " · " + na + " NO APLICABAN (descartados con motivo; no cuentan como hechos)" : "")
      + (p.incompleto ? " · PLAN INCOMPLETO: sólo hay " + p.topN + " de 3 tareas y " + p.subN + " de 9 subtareas definidas" : "")
      + (p.extra ? " · +" + p.extraDone + "/" + p.extra + " pasos de un plan antiguo (d…h), fuera de los tercios" : "");
    return '<span class="prog' + (pleno ? " full" : "") + (hechoInc ? " hechoinc" : "") + (p.incompleto ? " inc" : "") + '" title="' + esc(tip) + '">' +
      '<span class="prog-fill" style="width:' + pct + '%"></span>' +
      "<b>" + p.done + "/" + p.total + "</b>" +
      (p.standalone ? "" : '<i class="prog-sub">' + p.sdone + "/" + p.stotal + "</i>") +
      (na ? '<i class="prog-na">' + na + " n/a</i>" : "") +
      (p.extra ? '<i class="prog-mas">+' + p.extra + "</i>" : "") +
      (p.incompleto ? '<i class="prog-inc" aria-hidden="true">◌</i>' : "") + "</span>";
  }
  function taskSummary(r){
    var s=String(r&&r.title||"").trim();if(!s)return "Sin definir";
    return s.replace(/^Implementar:\s*/i,"Implementar · ").replace(/^Verificar y entregar evidencia:\s*/i,"Verificar · ").replace(/^Documentar informe factual autorizado.*$/i,"Documentar informe");
  }
  function tasksAbcHtml(t){
    var by={},active={};((t&&t._tasks)||[]).forEach(function(r){var c=String(r&&r.code||"").trim().toLowerCase();if(/^[a-c]$/.test(c)&&!by[c])by[c]=r;if(/^[a-c](?:[1-3])?$/.test(c)&&r&&r.status==="in_progress")active[c.charAt(0)]=true;});
    var codes=t&&t.role==="standalone-task"?["a"]:["a","b","c"];
    var missionState=estadoDe(t).l,inferred={};
    if(missionState==="En curso"&&!Object.keys(active).length){codes.some(function(c){var r=by[c],s=r&&r.status;if(!r||s==="done"||s==="resolved")return false;active[c]=true;inferred[c]=true;return true;});}
    var labels={pending:"pendiente",in_progress:"en curso",done:"hecha"};
    var chips=codes.map(function(c){var r=by[c],upper=c.toUpperCase();if(!r)return{status:"pending",html:'<span class="abc-task pending missing" title="Tarea '+upper+' · sin definir" aria-label="Tarea '+upper+', sin definir"><i class="abc-dot"></i><b>'+upper+'</b><span class="abc-label">Sin definir</span></span>'};var raw=r.status==="resolved"?"done":r.status,status=active[c]?"in_progress":(/^(pending|in_progress|done)$/.test(raw)?raw:"pending");var title="Tarea "+upper+(r.title?" · "+r.title:"")+" · "+labels[status]+(inferred[c]?" por secuencia A-B-C":"");return{status:status,html:'<a class="abc-task '+status+'" href="/tareas?mission='+encodeURIComponent(t.id)+'#'+c+'" title="'+esc(title)+'" aria-label="'+esc(title)+'"><i class="abc-dot"></i><b>'+upper+'</b><span class="abc-label">'+esc(taskSummary(r))+"</span>"+(status==="in_progress"?'<span class="abc-state">EN CURSO</span>':"")+"</a>"};});
    var doneCount=chips.filter(function(chip){return chip.status==="done";}).length;
    var trafficClass=doneCount===codes.length?"traffic-green":chips.some(function(chip){return chip.status==="in_progress";})?"traffic-yellow":"traffic-red";
    var trafficLabel=chips.map(function(chip,index){return String.fromCharCode(65+index)+" "+labels[chip.status];}).join(", ");
    var progress='<span class="abc-mission-progress '+trafficClass+'" role="progressbar" aria-valuemin="0" aria-valuemax="'+codes.length+'" aria-valuenow="'+doneCount+'" aria-label="Estado de las tareas: '+esc(trafficLabel)+'">'+chips.map(function(chip,index){var code=String.fromCharCode(65+index);return '<i class="'+chip.status+'" title="'+code+' · '+labels[chip.status]+'"><b>'+code+'</b></i>';}).join("")+"</span>";
    return '<span class="abc-tasks" aria-label="'+(codes.length===1?'Tarea suelta':'Tareas A, B y C')+'"><span class="abc-list">'+chips.map(function(chip){return chip.html;}).join("")+"</span>"+progress+"</span>";
  }
  function missionPreviewHtml(t) {
    var p = proyectoDe(t);
    var work = workUrlOf(t);
    var evidence = missionEvidenceOf(t);
    var inner = evidence.kind === "final"
      ? '<img class="shot-img proof" loading="lazy" src="' + esc(evidence.src) + '" data-proof="' + esc(evidence.src) + '" alt="Pantallazo final" title="' + (work ? "pantallazo del trabajo realizado · clic para abrir el trabajo" : "pantallazo del trabajo realizado") + '">'
      : evidence.kind === "process"
        ? '<img class="shot-img' + (evidence.fresh ? ' working' : '') + ' process" loading="lazy" src="' + esc(evidence.src) + '" data-proof="' + esc(evidence.src) + '" alt="Captura del proceso" title="' + (evidence.fresh ? '🔴 en vivo · el agente está trabajando ahora' : 'captura real del proceso de trabajo') + '">'
        // ICONO DEL PROYECTO, no captura (Carlos, 2026-08-05): en PROJECT ID lo
        // que importa es reconocer de un golpe en qué proyecto estamos
        // —pixeria.com, clearchannel.tv, xpaceos.com…—. Se pide el favicon del
        // propio dominio; si no responde, cae al logo de AdmiraNeXT, que es
        // también el que sale cuando la misión no tiene proyecto.
        : (p ? '<img class="shot-img shot-icon" loading="lazy" src="' + esc(faviconUrl(p)) + '" data-shot="' + esc(p) + '" alt="' + esc(dominioDe(p)) + '" title="Proyecto · ' + esc(dominioDe(p)) + '" onerror="this.onerror=null;this.src=\'/img/admiranext-logo.svg\';this.classList.add(\'shot-logo\')">' : '<img class="shot-img shot-logo" loading="lazy" src="/img/admiranext-logo.svg" alt="AdmiraNeXT" title="AdmiraNeXT · sin proyecto asignado">');
    return work
      ? '<a class="shot-link" href="' + esc(work) + '" target="_blank" rel="noopener" title="Abrir el trabajo: ' + esc(work) + '">' + inner + "</a>"
      : inner;
  }
  function cacheMission(t) {
    if (t && t.id) MIS_CACHE[t.id] = t;
    return t;
  }
  function rowHtml(t) {
    cacheMission(t);   // cajón de detalle: la ficha ya viene con la lista, sin fetch extra
    var est = estadoDe(t);
    var sb = est.c, stt = est.l;
    var maq = machineOf(t);
    var pm = prioMarca(t.subject);
    var esPrio = /prioridad/i.test(pm.flag);
    // COLUMNAS con separador vertical sutil y REDIMENSIONABLES (Carlos, 2026-07-15):
    // cada .rz es la línea divisoria — se arrastra y ajusta la variable CSS de SU
    // columna (--c-*) para TODAS las tarjetas a la vez; se persiste en localStorage.
    var rz = function (col, side) { return '<span class="rz" data-col="' + col + '"' + (side ? ' data-side="' + side + '"' : "") + ' title="⇔ arrastra para redimensionar"></span>'; };
    var dv = durVal(t), dailyClose = dailyClosureMeta(t);
    var rt = String(t.agent_runtime || "");
    var host = t.agent_host === "cli" ? "CLI" : t.agent_host === "app" ? "Desktop App" : "";
    var surface = [rt, host].filter(Boolean).join(" · ");
    var sourceLabel = missionSourceLabel(t);
    var idHtml = '<div class="tkid" title="ID técnico: ' + esc(t.id) + '">' +
      (window.YkDisplayRef && window.YkDisplayRef.screenHtml ? window.YkDisplayRef.screenHtml(t, esc) : esc(visibleId(t))) +
      (CFG.projectIdLayout ? "" : '<span class="st">' + esc(sourceLabel) + "</span>") +
      (pm.flag ? '<span class="prioflag' + (esPrio ? " abs" : "") + '">' + (esPrio ? "⚡ " : "") + esc(pm.flag) + "</span>" : "") + "</div>";
    var shotHtml = '<div class="cel shot">' + missionPreviewHtml(t) + "</div>";
    // QUIEN PIDIO LA MISION, CUANDO NO FUE QUIEN LA HACE (Carlos, 2026-09-02: «que esas
    // peticiones queden reflejadas como misiones delegadas, algo como por Telegram me ha
    // pedido Morfeo que haga esto»). El dato ya se guardaba —la columna role del ticket
    // lleva quien mando el encargo— pero no se enseñaba en ningun sitio, asi que en el
    // tablero una mision delegada era indistinguible de una que el agente se puso solo.
    // No se pinta cuando quien pide es quien la hace: eso no es delegar.
        var subjectMetaHtml = CFG.projectIdLayout
      ? ""
      : '<span class="scr">' + esc(String(t.screen || "").replace(/^(svc|maq|agt|service|machine|agent):/, "").replace(/^https?:\/\/(www\.)?/, "")) + "</span>" +
        (t.loc ? "<span>" + esc(t.loc) + "</span>" : "") + "<span>" + ago(t.created_at) + "</span>";
    var attachmentHtml = +t.img_count > 0 ? '<span class="adjn" title="' + (+t.img_count) + ' imagen(es) adjunta(s) — ábrela para verlas">📎 ' + (+t.img_count) + "</span>" : "";
    var metaHtml = subjectMetaHtml + attachmentHtml + delegacionHtml(t);
    // La misión empieza diciendo DE QUÉ PROYECTO es y debajo qué hay que hacer
    // (Carlos, 2026-08-05). Sin proyecto no se inventa un rótulo: se omite.
    var proyectoNombre = (t && (t.project_name || "")) || dominioDe(proyectoDe(t));
    var proyectoLinea = proyectoNombre
      ? '<div class="subj-project" title="' + esc("Proyecto · " + proyectoNombre) + '">Proyecto ' + esc(proyectoNombre) + "</div>"
      : "";
    var displayTitle = CFG.projectIdLayout ? missionTitle(t, pm.limpio) : pm.limpio;
    var titleAttrs = CFG.projectIdLayout
      ? ' title="' + esc(displayTitle) + '" aria-label="Misión: ' + esc(displayTitle) + '"'
      : "";
    var subjectHtml = '<div class="subj">' + proyectoLinea + '<div class="t"' + titleAttrs + '>' + esc(displayTitle) + '</div>' +
      (metaHtml ? '<div class="m">' + metaHtml + "</div>" : "") + "</div>";
    var createdHtml =
      '<span class="fch2" title="creada: ' + esc(fechaCorta(t.created_at)) + '">📅 ' + fechaCorta(t.created_at) + "</span>";
    var progressTimingHtml =
      (dv && dv.end ? '<span class="fch2 fin" title="finalizada: ' + esc(fechaCorta(dv.end)) + '">🏁 ' + fechaCorta(dv.end) + "</span>"
        : (dv && dv.run ? '<span class="fch2 run' + (stt === "No concluida" ? " overdue" : "") + '" title="' + esc(dv.tip) + '">⏳ ' + (stt === "No concluida" ? "no concluida" : "en curso") + "</span>" : "")) +
      (dv && dv.txt ? '<span class="dur' + (dv.run ? " run yk-deadline" : "") + (stt === "No concluida" ? " overdue" : "") + '"' + (dv.run ? ' data-created="' + _ms(t.active_since||t.started_at||t.created_at) + '"' : '') + ' title="' + esc(dv.tip) + '">⏱ ' + (dv.run ? esc(deadlineText(_ms(t.active_since||t.started_at||t.created_at))) : esc(dv.txt)) + "</span>" : "");
    var timingHtml = createdHtml + progressTimingHtml;
    var projectIdHtml = CFG.projectIdLayout
      // El tirador de la PRIMERA columna es el único con side "r" (crece al
      // arrastrar a la derecha). Al pasar AGENTE delante, PROJECT ID vuelve a la
      // convención normal: divisor a su izquierda, crece al arrastrar hacia allí.
      ? '<div class="project-id-cell">' + rz("id") + '<div class="project-id-top"><div class="project-id-main"><span class="project-id-select-slot"></span>' + shotHtml + '</div>' +
          '<div class="project-id-meta">' + idHtml + '<div class="project-id-time">' + timingHtml + "</div></div></div></div>"
      : idHtml + shotHtml + subjectHtml.replace('<div class="subj">', '<div class="subj">' + rz("id", "r"));
    var missionHtml = CFG.projectIdLayout
      ? '<div class="mission-col">' + rz("mis") + subjectHtml + "</div>"
      : '<div class="cel rtiempo">' + rz("fch") + timingHtml + "</div>";
    return '<div class="tk ' + (t.status === "open" ? "open" : "") + " " + (t.id === SELECTED ? "sel" : "") + '" data-id="' + esc(t.id) + '">' +
      '<div class="hd' + (CFG.projectIdLayout ? " project-id-layout" : "") + '">' +
        '<div class="pri ' + esc(t.priority) + '"></div>' +
        // AGENTE/PLATAFORMA va PRIMERO (Carlos, 2026-08-05): lo que importa de un
        // vistazo es QUIÉN lleva la misión, antes que su referencia. La celda
        // conserva su clase `agc` —es el target del picker de reasignación— y su
        // tirador `who`, que ahora cae en el borde derecho de la primera columna.
        '<div class="cel agc">' + rz("who", "r") + whoHtml(t.assignee, maq, surface, t._agents, machOffOf(t, surface)) + "</div>" +
        projectIdHtml +
        // En /misiones PROJECT ID reúne referencia visual y evolución temporal;
        // Misión queda reservada al título y origen. Las vistas históricas
        // conservan su columna Fecha independiente.
        missionHtml +
        // ORDENADOR (entre Fecha y Agente).
        '<div class="cel ord ' + (CFG.columnMode === "tasks" ? "tasks-col" : "machine-col") + '">' + rz("ord") + (CFG.columnMode === "tasks" ? tasksAbcHtml(t) : (maq ? '<span class="mach2">' + machVisual(maq) + " " + (window.ykMaquina ? ykMaquina.html(maq) : esc(maq)) + "</span>" : '<span class="mach2 dim">🖥 sin máquina</span>')) + "</div>" +
        // Estado + ABRIR apilado (abrir debajo de la insignia).
        '<div class="cel est">' + rz("est") + '<span class="badge ' + sb + '"' + (dailyClose ? ' title="' + esc(dailyClose.text) + '" aria-label="' + esc(dailyClose.text) + '"' : (t.status === "cancelled" && t.note ? ' title="' + esc(t.note) + '"' : "")) + "><i></i>" + stt + "</span>" + (!dailyClose && t.status === "cancelled" && t.note ? '<small class="cancel-note" title="' + esc(t.note) + '">' + esc(t.note) + "</small>" : "") +
          // PROGRESO en la fila, en TERCIOS: tareas n/3 y subtareas n/9 (979).
          // Solo si la misión tiene plan. (959, 963)
          progHtml(t._prog) +
          '<a class="tkopen" href="/tareas?mission=' + encodeURIComponent(t.id) + '" title="ver el plan de esta misión en /tareas">detalle ↳</a>' +
          '<a class="tkopen" href="/ticket?id=' + encodeURIComponent(t.id) + '">abrir →</a>' +
          (maq ? '<a class="tkopen" target="_blank" rel="noopener" href="https://www.admira.live/control?rc=' + encodeURIComponent(rcId(maq)) + '&name=' + encodeURIComponent(maq) + '" title="Operar esta máquina en admira.live/control (ver + ratón + teclado)">🖥 operar ↗</a>' : '') +
          '</div>' +
      "</div></div>";
  }
  // Duración de la misión: de ASIGNADA (created_at, el encargo nace ya asignado) a
  // FINALIZADA (resolved_at). El reloj vivo sólo aparece tras empezar de verdad:
  // status in_progress o rastro real en el árbol. Una asignada aún PENDIENTE no
  // puede decir simultáneamente «en curso» ni consumir su plazo de ejecución.
  // Epoch tolerante a s/ms (fleet guarda ms; el guardia normaliza por si acaso).
  function _ms(v) { v = +v || 0; return v > 4102444800 ? v : v * 1000; }
  function durFmt(ms) {
    if (ms == null || ms < 0) return "";
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return d + "d " + (h % 24) + "h";
    if (h > 0) return h + "h " + (m % 60) + "m";
    if (m > 0) return m + "m";
    return s + "s";
  }
  function deadlineText(start, now) {
    var left=3600000-((now||Date.now())-start), late=left<=0, sec=Math.max(0,Math.ceil(Math.abs(left)/1000));
    var mm=Math.floor(sec/60), ss=sec%60;
    return (late?"+":"")+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0")+(late?" fuera de plazo":" restantes");
  }
  function tickMissionClocks(root) {
    var now=Date.now(),expired=false;
    (root||document).querySelectorAll(".yk-deadline[data-created]").forEach(function(el){
      var start=+el.dataset.created||0,late=start&&now-start>=3600000,wasLate=el.classList.contains("overdue");
      el.textContent="⏱ "+deadlineText(start,now); el.classList.toggle("overdue",!!late);
      if(late&&!wasLate){var row=el.closest(".tk");if(row&&!row.dataset.deadlineExpired){row.dataset.deadlineExpired="1";expired=true;}}
    });
    if(expired) window.dispatchEvent(new Event("yk:mission-deadline"));
  }
  function durVal(t) {
    var start = _ms(t.created_at);
    if (!start) return null;
    if (t.status === "resolved") {
      var end = _ms(t.resolved_at || t.updated_at);
      if (!end || end < start) return null;
      return { txt: durFmt(end - start), run: false, end: end, tip: "de asignada a finalizada" };
    }
    if (t.status !== "in_progress" && !hayTrabajo(t)) return null;
    return { txt: durFmt(Date.now() - start), run: true, tip: "transcurrido desde que empezó" };
  }

  // ---- Redimensionado de columnas de la lista -------------------------------
  var COLVARS = { id: "--c-id", mis: "--c-mis", fch: "--c-fch", ord: "--c-ord", who: "--c-who", est: "--c-est" };
  function initColResize() {
    if (initColResize._done) return; initColResize._done = true;
    // Tope RELATIVO al ancho de la lista: ninguna columna puede pasar del 35%
    // (dejaría a la misión sin carril y el contenido invadía la columna vecina).
    function tope() {
      var l = document.querySelector(".list");
      return l ? Math.max(160, Math.round(l.getBoundingClientRect().width * 0.35)) : 420;
    }
    function suelo(col) { return CFG.columnMode === "tasks" && col === "ord" ? 210 : 56; }
    var saved = {}; try { saved = JSON.parse(localStorage.getItem("yk_cols") || "{}"); } catch (e) {}
    for (var k in saved) if (COLVARS[k] && saved[k] > 0) {
      document.documentElement.style.setProperty(COLVARS[k], Math.max(suelo(k), Math.min(tope(), saved[k])) + "px");
    }
    var drag = null;
    document.addEventListener("mousedown", function (e) {
      var h = e.target && e.target.closest && e.target.closest(".rz"); if (!h) return;
      e.preventDefault(); e.stopPropagation();
      var col = h.dataset.col;
      var cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(COLVARS[col]));
      if (!cur) { var cell = h.parentElement; cur = cell ? cell.getBoundingClientRect().width : 120; }
      drag = { col: col, side: h.dataset.side || "l", x: e.clientX, w: cur };
      document.body.style.cursor = "col-resize";
    }, true);
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var w = Math.round(drag.side === "r" ? drag.w + dx : drag.w - dx);
      document.documentElement.style.setProperty(COLVARS[drag.col], Math.max(suelo(drag.col), Math.min(tope(), w)) + "px");
    });
    document.addEventListener("mouseup", function () {
      if (!drag) return;
      var out = {};
      for (var k in COLVARS) { var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(COLVARS[k])); if (v) out[k] = v; }
      try { localStorage.setItem("yk_cols", JSON.stringify(out)); } catch (e) {}
      drag = null; document.body.style.cursor = "";
    });
  }

  // click en la fila = seleccionar misión (el enlace «abrir →» sigue navegando)
  function bindRows(container) {
    initColResize();
    tickMissionClocks(container || document);
    if(!bindRows._clock) bindRows._clock=window.setInterval(function(){tickMissionClocks(document);},1000);
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".tkopen") || e.target.closest(".abc-task") || e.target.closest(".rz") || e.target.closest(".shot-img")) return;
        selectMission(row.dataset.id);
      });
    });
    if (SELECTED && document.querySelector('.tk[data-id="' + cssq(SELECTED) + '"]')) renderTaskTree(SELECTED);
  }

  function selectMission(id) {
    SELECTED = id;
    try { localStorage.setItem(CFG.lsKey, id); } catch (e) {}
    document.querySelectorAll(".tk").forEach(function (r) { r.classList.toggle("sel", r.dataset.id === id); });
    renderTaskTree(id);
  }

  // ------- árbol de TAREAS a·b·c/1·2·3 (jornada completa: 3×3) -------
  // Convierte URLs del texto en enlaces pulsables (target=_blank, rel=noopener).
  // Escapa TODO primero (anti-XSS) y solo entonces envuelve las URLs; el clic en el
  // enlace no debe propagar al nodo (que avanza el estado). Carlos, 21-jul-2026.
  function linkify(s) {
    s = String(s == null ? "" : s);
    var re = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]}"']/g, out = "", last = 0, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      out += '<a href="' + esc(m[0]) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(m[0]) + "</a>";
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  function taskNode(t, isSub) {
    var own = OWN_ICON[t.owner] || "⚙️";
    var ownerName = String(t.agent_identity || t.owner || "").trim();
    var ownerVisual = own;
    // /tareas carga yk-avatar antes de este módulo: una identidad operativa
    // (Sub/Infra + persona + equipo) hereda el retrato de su persona base. En
    // /misiones, o si la preferencia/foto no está disponible, se conserva el
    // emoji histórico. El fallback también aparece si la imagen falla al cargar.
    try {
      var av = window.ykAvatar;
      var src = ownerName && av && av.on && av.on() && av.img ? av.img(ownerName) : "";
      if (src) ownerVisual = '<img class="node-owner-avatar" loading="lazy" src="' + esc(src) + '" alt="' + esc(ownerName) + '" onerror="this.nextElementSibling.hidden=false;this.remove()">' +
        '<span class="node-owner-fallback" hidden aria-label="' + esc(ownerName) + '">' + own + "</span>";
    } catch (e) {}
    // Texto compacto: el título se recorta a 2 líneas por CSS (.ttl line-clamp) y el
    // texto COMPLETO —título + informe si lo hay— va en el tooltip; no se pierde nada.
    var full = String(t.title || "") + (t.report ? " — " + t.report : "");
    // Miniatura si la tarea tiene captura de prueba: reutiliza .shot-img → lightbox.
    var shot = t.image ? '<img class="node-shot shot-img" loading="lazy" src="' + esc(t.image) + '" data-proof="' + esc(t.image) + '" alt="prueba" title="pantallazo de esta tarea · clic para ampliar">' : "";
    return '<div class="node ' + (isSub ? "sub " : "") + esc(t.status) + '" data-code="' + esc(t.code) + '">' +
      '<button class="chip ' + esc(t.status) + '" data-code="' + esc(t.code) + '" title="' + esc(t.status) + ' · clic para avanzar">' + (CHIP[t.status] || "○") + "</button>" +
      // El CÓDIGO del paso enlaza a su detalle en /tareas (foco + scroll al paso); el
      // chip de al lado sigue AVANZANDO el estado — no le robamos el clic. (964)
      (t.mission_id ? '<a class="scode" href="/tareas?mission=' + encodeURIComponent(t.mission_id) + "#" + esc(t.code) + '" title="Ver tarea · ID técnico ' + esc(t.mission_id + ":" + t.code) + '">' + esc(visibleId(t)) + "</a>" : '<span class="scode" title="Código técnico: ' + esc(t.code) + '">' + esc(visibleId(t)) + "</span>") +
      '<span class="ttl" title="' + esc(full) + '">' + linkify(t.title) + "</span>" +
      shot +
      '<span class="own" title="' + esc(ownerName) + '">' + ownerVisual + "</span>" +
      // CONSTANCIA del paso: qué se hizo (report), con enlaces pulsables. Va en su
      // propia línea (flex-wrap) para que se lea sin apretar la fila. (954)
      (t.report && String(t.report).trim() && t.report !== t.title ? '<small class="node-rep" title="' + esc(t.report) + '">↳ ' + linkify(t.report) + "</small>" : "") +
      "</div>";
  }

  // html de los pasos del plan con sus subtareas (sin cabecera): reutilizable en
  // el raíl de una misión y en la vista global /tareas. OJO: aquí vivía el
  // ÚLTIMO tope del modelo de 3 pasos — el worker ya servía a…h y esta lista
  // pintaba sólo abc, así que d…h desaparecían en silencio (Carlos, 21-07-2026).
  function stepsHtml(tasks) {
    var byCode = {};
    tasks.forEach(function (t) { byCode[t.code] = t; });
    var html = "";
    ["a", "b", "c", "d", "e", "f", "g", "h"].forEach(function (c) {
      var subs = ["1", "2", "3"].map(function (n) { return byCode[c + n]; }).filter(Boolean);
      if (!byCode[c] && !subs.length) return;
      // Jerarquía ENCAPSULADA: las subtareas a1/a2/a3 van DENTRO de su letra y
      // PLEGADAS por defecto — se ve a/b/c y se despliega la letra que interese.
      // Es el nivel de DENTRO; la ficha entera se pliega aparte. (Carlos, 954/958)
      html += '<div class="step' + (subs.length ? " has-subs collapsed" : "") + '" data-step="' + esc(c) + '">';
      if (byCode[c]) html += taskNode(byCode[c], false);
      if (subs.length) {
        html += '<button class="substog" type="button" title="ver/ocultar las ' + subs.length + ' subtareas">▸ ' + subs.length + " sub" + (subs.length > 1 ? "s" : "") + "</button>";
        html += '<div class="substeps">';
        subs.forEach(function (s) { html += taskNode(s, true); });
        html += "</div>";
      }
      html += "</div>";
    });
    return html;
  }
  function subCount(tasks) {
    return tasks.filter(function (t) { return t.code.length === 2; }).length;
  }
  function nextStatus(cur) { return NEXT_ST[cur] || "in_progress"; }

  function fetchTasks(id) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/tasks", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.tasks || []; });
  }
  // TODAS las tareas de TODAS las misiones en UNA petición (endpoint agregado
  // /tasks/all): reemplaza el N+1 de /tareas y /informes. Cada tarea trae
  // adjuntos subject/screen/loc/created_at de su misión.
  // HALO en el previo del proyecto cuando HAY un agente trabajando la misión:
  // su máquina (canónica) o su agente asignado está VIVO en presencia y la
  // misión no está resuelta. `live` = { machines:Set(canon), personas:Set(lower) }.
  // (Carlos, FLT-761 — prioridad absoluta.)
  function markWorking(container, tickets, live) {
    live = live || {};
    var lm = live.machines, lp = live.personas;
    var byId = {};
    (tickets || []).forEach(function (t) { byId[t.id] = t; });
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      var t = byId[row.dataset.id]; if (!t) return;
      var img = row.querySelector(".shot-img"); if (!img) return;
      var maq = machineOf(t);   // ya canónica
      // una misión difundida agrupa varios agentes (_agents); vale con que UNO viva
      var pers = (t._agents && t._agents.length ? t._agents : [t.assignee])
        .map(function (x) { return String(x || "").toLowerCase(); });
      var alive = (maq && lm && lm.has(maq)) ||
        (lp && pers.some(function (p) { return p && lp.has(p); }));
      var activa = t.status !== "resolved";
      img.classList.toggle("working", !!(alive && activa));
    });
  }

  // El previo deja de ser la home genérica de la web y pasa a mostrar la
  // ACTIVIDAD EN VIVO del agente de la misión: su FOCO actual (de /api/presence)
  // — «qué está haciendo ahora mismo» — y su proof-of-play si lo hay. Si el
  // agente no está vivo, se queda la miniatura que pintó rowHtml. (Carlos, la
  // crítica de que el previo «no servía».) `act` = { "persona_lower|maq_canon":
  // {focus, proj, img, _u} }.
  function fillActivity(container, tickets, act) {
    if (!act) return;
    var byId = {};
    (tickets || []).forEach(function (t) { byId[t.id] = t; });
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      var t = byId[row.dataset.id]; if (!t) return;
      if (t.status === "resolved") return;         // solo misiones vivas
      var cell = row.querySelector(".cel.shot"); if (!cell) return;
      var maq = machineOf(t);
      var pers = (t._agents && t._agents.length ? t._agents : [t.assignee]);
      var a = null;
      for (var i = 0; i < pers.length && !a; i++) {
        var k = String(pers[i] || "").toLowerCase() + "|" + maq;
        if (act[k] && (act[k].focus || act[k].img)) a = act[k];
      }
      if (!a) return;                               // sin actividad → miniatura
      var foco = String(a.focus || "").replace(/^\s*el arquitecto me pide:\s*/i, "").trim();
      cell.innerHTML =
        '<div class="live-act" title="' + esc(a.focus || "") + '">' +
          '<div class="la-hd"><span class="la-dot"></span>EN VIVO</div>' +
          (a.img ? '<img class="la-shot" loading="lazy" src="' + esc(a.img) + '" alt="">' : '') +
          '<div class="la-focus">' + esc(foco || "trabajando…") + '</div>' +
        '</div>';
    });
  }

  function fetchAllTasks(scope, filters) {
    var params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    filters = filters || {};
    if (filters.projectId) params.set("project_id", filters.projectId);
    if (filters.mission) params.set("mission", filters.mission);
    if (filters.createdFrom != null) params.set("created_from", String(filters.createdFrom));
    if (filters.createdTo != null) params.set("created_to", String(filters.createdTo));
    var q = params.toString() ? "?" + params.toString() : "";
    // Hereda la red de seguridad del menú (yk-frame.js/ykFetch): api.yokup.com y,
    // si RECHAZA por red, reintento contra workers.dev — así el progreso a·b·c no
    // se pierde en redes que bloquean un host. Guarda por si ykFetch aún no cargó.
    var p = window.ykFetch
      ? window.ykFetch("/tasks/all" + q, { cache: "no-store" })
      : window.fetch(CFG.worker + "/tasks/all" + q, { cache: "no-store" });
    return p
      .then(function (r) { return r.json().then(function (d) { return { response:r, data:d }; }); })
      .then(function (result) {
        if (!result.response.ok || !Array.isArray(result.data.tasks)) {
          throw new Error((result.data && result.data.error) || "No se pudieron cargar las tareas");
        }
        return result.data.tasks;
      });
  }
  // Agrupa el array plano de /tasks/all por misión → [{mission, tasks}], la forma
  // que consumen /tareas e /informes. Preserva el orden de aparición.
  function groupByMission(rows) {
    var by = {}, order = [];
    (rows || []).forEach(function (t) {
      if (!by[t.mission_id]) {
        by[t.mission_id] = { mission: {
          id: t.mission_id, subject: t.subject, screen: t.screen, loc: t.loc,
          source: t.source, role: t.role, assignee: t.assignee, status: t.mission_status,
          project: t.project || "", project_name: t.project_name || t.project || "",
          live_shot: t.live_shot || "", live_at: t.live_at || 0,
          resolved_at: t.mission_resolved || 0,
          proof_image: t.mission_proof || "", created_at: t.mission_created,
          display_ref: t.mission_display_ref || ""
        }, tasks: [] };
        order.push(t.mission_id);
      }
      by[t.mission_id].tasks.push(t);
    });
    return order.map(function (id) { return by[id]; });
  }
  function postStatus(id, code, status) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/task/" + encodeURIComponent(code) + "/status", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: status })
    }).catch(function () {});
  }
  function postPlan(id) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/plan", { method: "POST" }).catch(function () {});
  }

  // Botón de alta anidada según el NIVEL de la misión (FLT-990 c). Nivel 0 (madre o
  // plana) → «+ misión»; nivel 1 (hija, su padre es raíz) → «+ submisión»; nivel 2
  // (submisión) o profundidad incierta → nada (evita ofrecer el 3er nivel que el
  // worker rechazaría). El padre se resuelve por la caché ya cargada con la lista.
  function addChildBtn(id, t) {
    if (!/^FLT-\d+$/.test(id)) return "";
    if (!t.parent_id) {
      return '<button type="button" class="mdet-addchild" data-add-child="' + esc(id) + '" data-child-kind="mision" title="Crear una misión hija colgada de ésta (hereda máquina y agente)">+ misión</button>';
    }
    var padre = MIS_CACHE[t.parent_id];
    // Solo es hija (nivel 1) si su padre existe en caché y NO tiene madre a su vez.
    if (padre && !padre.parent_id) {
      return '<button type="button" class="mdet-addchild" data-add-child="' + esc(id) + '" data-child-kind="submision" title="Crear una submisión colgada de esta misión (hereda máquina y agente)">+ submisión</button>';
    }
    return "";                                     // nivel 2 o incierto: sin 3er nivel
  }
  // Ficha del cajón: cabecera con asunto, equipo/agente, estado, captura y hueco
  // para el informe (que llega asíncrono de /ticket). Todo con lo ya cargado.
  function detalleHtml(id) {
    var t = MIS_CACHE[id];
    if (!t) return "";
    var est = estadoDe(t), maq = machineOf(t), dailyClose = dailyClosureMeta(t);
    var evidence = missionEvidenceOf(t);
    var img = evidence.src;
    var agentes = (t._agents && t._agents.length) ? t._agents.join(" · ") : (t.assignee || "sin agente");
    // La captura de la ficha también ENLAZA al trabajo realizado cuando hay destino.
    var work = workUrlOf(t);
    var imgHtml = img ? '<img class="mdet-img" loading="lazy" onerror="this.remove()" src="' + esc(img) + '" alt="prueba del trabajo">' : "";
    if (imgHtml && work) imgHtml = '<a class="shot-link mdet-imglink" href="' + esc(work) + '" target="_blank" rel="noopener" title="Abrir el trabajo: ' + esc(work) + '">' + imgHtml + "</a>";
    return '<div class="mdet">' +
      '<div class="mdet-t">' + esc(missionTitle(t, prioMarca(t.subject).limpio)) + "</div>" +
      '<div class="mdet-m"><span class="badge ' + est.c + '"><i></i>' + est.l + "</span>" +
        (maq ? '<span class="mdet-k">🖥 ' + esc(maq) + "</span>" : "") +
        '<span class="mdet-k">👷 ' + esc(agentes) + "</span></div>" +
      (dailyClose ? '<div class="mdet-policy" role="note" aria-label="' + esc(dailyClose.text) + '"><b>Cierre diario · ' + esc(dailyClose.date) + '</b><span>Pasó automáticamente de No concluida a Eliminada. Se puede reabrir; la misión, sus tareas, pruebas e historial siguen conservados.</span></div>' : "") +
      imgHtml +
      '<div class="mdet-inf" data-inf>· cargando informe…</div>' +
      '<div class="mdet-actions">' +
        // Alta anidada, modelo de DOS niveles madre → misión → submisión (FLT-990 c):
        // una madre/plana cuelga «+ misión» (una hija); una hija cuelga «+ submisión»
        // (una nieta); una submisión (nivel 2) ya no cuelga nada — sería 3er nivel. El
        // nivel se deduce del padre en caché; si no se conoce con certeza, no se ofrece.
        // La acción la cablea la página (misiones.html) por delegación. (FLT-1005 b1)
        addChildBtn(id, t) +
        '<a class="mdet-open" href="/ticket?id=' + encodeURIComponent(id) + '">ficha completa e historial →</a>' +
      "</div>" +
      "</div>";
  }
  // Informe: último evento con texto de /ticket (endpoint con sesión). Falla en
  // silencio — el cajón sigue siendo útil sin él.
  function fillInforme(id) {
    var box = document.getElementById(CFG.treeId); if (!box) return;
    var slot = box.querySelector("[data-inf]"); if (!slot) return;
    window.fetch(CFG.worker + "/ticket?id=" + encodeURIComponent(id), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (SELECTED !== id) return;                       // cambió la selección mientras cargaba
        var ev = (d && d.events) || [];
        var inf = ev.filter(function (e) { return e && e.text && /informe|hecha|done|resuelt/i.test((e.kind || "") + " " + e.text); }).pop()
               || ev.filter(function (e) { return e && e.text; }).pop();
        slot.innerHTML = inf ? ('<b>' + esc(inf.author || "informe") + "</b> · " + esc(String(inf.text).slice(0, 400)))
                             : '<span class="dim">sin informe todavía</span>';
      })
      .catch(function () { if (slot) slot.innerHTML = '<span class="dim">informe no disponible (¿sesión caducada?)</span>'; });
  }
  function renderTaskTree(id) {
    var box = document.getElementById(CFG.treeId);
    if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="empty2">Selecciona una <b>misión</b> en la lista para ver su <b>ficha</b> y sus <b>tareas</b>.</div>';
      return;
    }
    // 1) LA FICHA VA PRIMERO y SIN esperar a nada: sus datos ya vienen con la
    //    lista. Antes todo el cajón colgaba del fetch de tareas — si ese fetch
    //    tardaba (o esperaba sesión), no se veía NADA. Ahora el detalle es
    //    instantáneo y el árbol se rellena cuando llega.
    box.innerHTML = detalleHtml(id) + '<div id="ykTreePart"><div class="empty2">· cargando tareas…</div></div>';
    fillInforme(id);
    var part = function () { return document.getElementById("ykTreePart"); };
    fetchTasks(id).then(function (tasks) {
      if (SELECTED !== id) return;                      // cambió la selección mientras cargaba
      var p = part(); if (!p) return;
      // REGLA DE LOS TERCIOS (FLT-979, tarea c): la cabecera del cajón seguía
      // contando «subtareas definidas / máx 24» — el denominador del modelo VIEJO
      // de 8 pasos, justo lo que la misión venía a eliminar. Ahora lee en tercios
      // igual que el chip de la fila: tareas n/3 · subtareas n/9 (+n si el plan
      // es antiguo y arrastra pasos d…h).
      var _tc = tercios(tasks, MIS_CACHE[id] && MIS_CACHE[id].role === "standalone-task");
      var header = '<div class="thd"><span class="tmid" title="Misión activa">🎯 ' + esc(id) + "</span>" +
        (_tc ? progHtml(_tc) : '<span class="tcount" title="esta misión aún no tiene plan de tareas">0/3</span>') + "</div>";
      if (!tasks.length) {
        p.innerHTML = header + '<div class="empty2">Esta misión aún no tiene plan de tareas.</div><button class="propose" id="ykProposeBtn">🧠 Proponer plan (IA)</button>';
        var pb = document.getElementById("ykProposeBtn");
        if (pb) pb.onclick = function () {
          pb.disabled = true; pb.textContent = "🧠 Proponiendo plan…";
          postPlan(id).then(function () { renderTaskTree(id); });
        };
        return;
      }
      p.innerHTML = header + stepsHtml(tasks);
      p.querySelectorAll(".chip").forEach(function (ch) {
        ch.onclick = function () {
          var cur = STS.find(function (s) { return ch.classList.contains(s); }) || "pending";
          postStatus(id, ch.dataset.code, nextStatus(cur)).then(function () { renderTaskTree(id); });
        };
      });
    }).catch(function () {
      var p = part(); if (p) p.innerHTML = '<div class="empty2">No se pudieron cargar las tareas de esta misión.</div>';
    });
  }
  function refreshTree() {
    if (SELECTED && document.querySelector('.tk[data-id="' + cssq(SELECTED) + '"]')) renderTaskTree(SELECTED);
  }

  window.YkMisiones = {
    init: init, selected: selected, selectMission: selectMission,
    rowHtml: rowHtml, cacheMission: cacheMission, bindRows: bindRows, machineOf: machineOf, canonMachine: canonMachine, rcId: rcId, estadoDe: estadoDe, coincideEstado: coincideEstado, visibleId: visibleId, dailyClosureMeta: dailyClosureMeta,
    machOffOf: machOffOf, whoHtml: whoHtml,
    setLiveMachines: function (set) { LIVE_MACHINES = set || null; },
    setLiveSurfaces: function (m) { LIVE_SURFACES = m || null; },
    agentKey: agentKey, baseAgentKey: baseAgentKey, liveSurfaceOf: liveSurfaceOf,
    setProyectos: setProyectos, proyectoDe: proyectoDe, workUrlOf: workUrlOf, missionEvidenceOf: missionEvidenceOf,
    renderTaskTree: renderTaskTree, refreshTree: refreshTree, addChildBtn: addChildBtn,
    stepsHtml: stepsHtml, subCount: subCount, taskNode: taskNode,
    tercios: tercios, progHtml: progHtml, tasksAbcHtml: tasksAbcHtml,
    nextStatus: nextStatus, postStatus: postStatus, postPlan: postPlan,
    fetchTasks: fetchTasks, fetchAllTasks: fetchAllTasks, groupByMission: groupByMission,
    markWorking: markWorking, fillActivity: fillActivity, esc: esc, ago: ago, slaLeft: slaLeft,
    customizeReady: customizeReady, boardPrefs: boardPrefs, machVisual: machVisual
  };
})();
