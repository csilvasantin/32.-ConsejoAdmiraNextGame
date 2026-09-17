/* YK_MISSION_NOVELTY_CORE_START
 * Estado puro y versionado de nuevas misiones. Vive antes del marco para poder
 * probarse sin DOM; la UI de la barra lo consume más abajo. */
(function (root) {
  "use strict";
  var KEY = "yk_nav_missions_v2";
  function number(value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function meta(payload) {
    var p = payload || {}, cursor = number(p.created_cursor);
    if (cursor == null) cursor = number(p.latest_cursor);
    if (cursor == null) cursor = number(p.event_cursor);
    if (cursor == null) cursor = number(p.cursor);
    var events = Array.isArray(p.events) ? p.events.map(function (event) {
      return { cursor:number(event && event.cursor), mission_id:clean(event && (event.mission_id || event.id)), created_at:number(event && event.created_at), source:clean(event && event.source), decision_id:clean(event && event.decision_id), batch_id:clean(event && event.batch_id) };
    }).filter(function (event) { return event.cursor != null || event.mission_id; }) : [];
    return { cursor:cursor, newest_id:clean(p.newest_id || (events[0] && events[0].mission_id)), latest_created_at:number(p.latest_created_at), events:events, fallback_count:Math.max(0,(number(p.curso)||0)+(number(p.pend)||0)) };
  }
  function initial() { return { version:2, seen_cursor:null, observed_cursor:null, unread:0, fallback_count:null, fallback_sig:"", newest_id:"", latest_created_at:null, events:[] }; }
  function normalize(value) {
    var out=initial(),v=value&&typeof value==="object"?value:{};
    out.seen_cursor=number(v.seen_cursor);out.observed_cursor=number(v.observed_cursor);out.unread=Math.max(0,number(v.unread)||0);
    out.fallback_count=number(v.fallback_count);out.fallback_sig=clean(v.fallback_sig);out.newest_id=clean(v.newest_id);out.latest_created_at=number(v.latest_created_at);
    out.events=Array.isArray(v.events)?v.events.slice(0,20):[];return out;
  }
  function eventKey(event){return event&&event.cursor!=null?"c:"+event.cursor:"m:"+clean(event&&event.mission_id);}
  function mergeEvents(a,b,seen){
    var found={},rows=[];(a||[]).concat(b||[]).forEach(function(event){var key=eventKey(event);if(!key||found[key])return;found[key]=true;if(event.cursor==null||seen==null||event.cursor>seen)rows.push(event);});
    rows.sort(function(x,y){return (number(y.cursor)||0)-(number(x.cursor)||0);});return rows.slice(0,20);
  }
  function countNew(events,after){
    var found={},n=0;(events||[]).forEach(function(event){var cursor=number(event&&event.cursor),key=eventKey(event);if(!key||found[key]||cursor==null||after!=null&&cursor<=after)return;found[key]=true;n++;});return n;
  }
  function create(options) {
    options=options||{};var storage=options.storage||null,publish=typeof options.publish==="function"?options.publish:function(){};
    function read(){try{return normalize(JSON.parse(storage&&storage.getItem(KEY)||"null"));}catch(_){return initial();}}
    var state=read();
    function write(broadcast){try{if(storage)storage.setItem(KEY,JSON.stringify(state));}catch(_){}if(broadcast!==false)publish(JSON.parse(JSON.stringify(state)));}
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function observe(payload) {
      var m=meta(payload),before=state.unread,first=state.observed_cursor==null&&state.fallback_count==null;
      if(m.cursor!=null){
        if(state.observed_cursor==null){state.observed_cursor=m.cursor;state.seen_cursor=Math.max(0,m.cursor-state.unread);}
        else if(m.cursor>state.observed_cursor){var previous=state.observed_cursor,added=countNew(m.events,previous);state.observed_cursor=m.cursor;state.unread+=added||1;}
        // Una respuesta de polling antigua nunca puede hacer retroceder ni el
        // cursor observado ni el ACK. Sólo aporta detalle que aún no tuviéramos.
        state.events=mergeEvents(state.events,m.events,state.seen_cursor);
      }else{
        var sig=[m.newest_id,m.latest_created_at||"",m.fallback_count].join(":");
        if(state.fallback_count!=null&&!first){var increase=Math.max(0,m.fallback_count-state.fallback_count),changed=state.fallback_sig&&sig!==state.fallback_sig&&(m.newest_id||m.latest_created_at);if(increase||changed)state.unread+=Math.max(1,increase);}
        state.fallback_count=m.fallback_count;state.fallback_sig=sig;state.events=m.events.slice(0,20);
      }
      state.fallback_count=m.fallback_count;if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null)state.latest_created_at=m.latest_created_at;
      var changed=JSON.stringify(state)!==JSON.stringify(read());if(changed)write(true);
      return {first:first,added:Math.max(0,state.unread-before),state:snapshot(),meta:m};
    }
    function ack(payload){var before=JSON.stringify(state),m=meta(payload);if(m.cursor!=null){state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}else state.fallback_count=m.fallback_count;state.unread=0;state.events=[];if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null)state.latest_created_at=m.latest_created_at;if(JSON.stringify(state)!==before)write(true);return snapshot();}
    function sync(value){
      var incoming;try{incoming=normalize(typeof value==="string"?JSON.parse(value||"null"):value);}catch(_){return snapshot();}
      var currentObserved=state.observed_cursor==null?-1:state.observed_cursor,nextObserved=incoming.observed_cursor==null?-1:incoming.observed_cursor;
      if(nextObserved<currentObserved)return snapshot();
      var seen=Math.max(state.seen_cursor==null?-1:state.seen_cursor,incoming.seen_cursor==null?-1:incoming.seen_cursor);
      if(nextObserved===currentObserved&&seen===(state.seen_cursor==null?-1:state.seen_cursor)&&incoming.unread<=state.unread)return snapshot();
      var combined=mergeEvents(state.events,incoming.events,seen<0?null:seen);
      state=incoming;state.observed_cursor=Math.max(currentObserved,nextObserved);state.seen_cursor=seen<0?null:Math.min(seen,state.observed_cursor);
      state.events=combined;
      // Un ACK remoto gana a mensajes viejos; si además llegó un cursor posterior,
      // sólo permanecen sin leer sus eventos realmente posteriores al ACK.
      state.unread=countNew(combined,state.seen_cursor);
      if(state.observed_cursor>state.seen_cursor&&!state.unread)state.unread=Math.max(1,incoming.unread||0);
      write(false);return snapshot();
    }
    return {observe:observe,ack:ack,sync:sync,snapshot:snapshot,key:KEY,meta:meta};
  }
  root.YkMissionNovelty={create:create,meta:meta,key:KEY,_test:{normalize:normalize}};
})(typeof window!=="undefined"?window:globalThis);
/* YK_MISSION_NOVELTY_CORE_END */

/* YK_PROJECT_NOVELTY_CORE_START
 * Altas del censo: el cursor ordena, pero sólo events[].project_id cuenta.
 * Así huecos AUTOINCREMENT, ediciones, reordenados y bajas no crean novedad. */
(function(root){
  "use strict";
  var KEY="yk_project_novelty_v1";
  function number(value){if(value==null||value==="")return null;var n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):null;}
  function clean(value){return String(value==null?"":value).trim();}
  function uniq(values){var seen={},out=[];(values||[]).forEach(function(value){value=clean(value);if(value&&!seen[value]){seen[value]=true;out.push(value);}});return out;}
  function union(a,b){return uniq((a||[]).concat(b||[]));}
  function meta(payload){
    var p=payload||{},projects=Array.isArray(p.projects)?p.projects:[],selectable=projects.filter(function(project){return project&&project.id&&String(project.status||"activo").toLowerCase()!=="archivado";});
    var events=(Array.isArray(p.events)?p.events:[]).map(function(event){return {cursor:number(event&&event.cursor),project_id:clean(event&&(event.project_id||event.id)),created_at:number(event&&event.created_at)};}).filter(function(event){return event.cursor!=null&&event.project_id;});
    events.sort(function(a,b){return b.cursor-a.cursor;});
    var total=number(p.total);return {cursor:number(p.created_cursor),newest_id:clean(p.newest_id||(events[0]&&events[0].project_id)),latest_created_at:number(p.latest_created_at),events:events.slice(0,20),all_ids:uniq(projects.map(function(project){return project&&project.id;})),selectable_ids:uniq(selectable.map(function(project){return project.id;})),total:total==null?selectable.length:total};
  }
  function initial(){return {version:1,initialized:false,seen_cursor:null,observed_cursor:null,known_ids:[],acked_keys:[],unread:[],newest_id:"",latest_created_at:null};}
  function record(value){var cursor=number(value&&value.cursor),id=clean(value&&value.project_id),key=clean(value&&value.key);if(!id)return null;return {key:key||(cursor==null?"i:"+id:"c:"+cursor),project_id:id,cursor:cursor};}
  function records(values){var seen={},out=[];(values||[]).forEach(function(value){var row=record(value);if(row&&!seen[row.key]){seen[row.key]=true;out.push(row);}});return out;}
  function normalize(value){var out=initial(),v=value&&typeof value==="object"?value:{};out.initialized=!!v.initialized;out.seen_cursor=number(v.seen_cursor);out.observed_cursor=number(v.observed_cursor);out.known_ids=uniq(v.known_ids);out.acked_keys=uniq(v.acked_keys);out.unread=records(v.unread);out.newest_id=clean(v.newest_id);out.latest_created_at=number(v.latest_created_at);return out;}
  function create(options){
    options=options||{};var storage=options.storage||null,publish=typeof options.publish==="function"?options.publish:function(){};
    function read(){try{return normalize(JSON.parse(storage&&storage.getItem(KEY)||"null"));}catch(_){return initial();}}
    var state=read();
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function write(broadcast){try{if(storage)storage.setItem(KEY,JSON.stringify(state));}catch(_){}if(broadcast!==false)publish(snapshot());}
    function unreadIds(){return uniq(state.unread.map(function(row){return row.project_id;}));}
    function add(row){row=record(row);if(!row||state.acked_keys.indexOf(row.key)>=0||state.unread.some(function(old){return old.key===row.key;}))return false;state.unread.push(row);return true;}
    function observe(payload){
      var m=meta(payload),before=unreadIds().length,was=JSON.stringify(state),first=!state.initialized,selectable={},stale=m.cursor!=null&&state.observed_cursor!=null&&m.cursor<state.observed_cursor;m.selectable_ids.forEach(function(id){selectable[id]=true;});
      if(first){state.initialized=true;state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}
      else if(m.cursor!=null&&state.observed_cursor==null){state.observed_cursor=m.cursor;state.seen_cursor=m.cursor;}
      else if(m.cursor!=null&&m.cursor>state.observed_cursor){
        m.events.forEach(function(event){if((state.seen_cursor==null||event.cursor>state.seen_cursor)&&selectable[event.project_id])add({key:"c:"+event.cursor,project_id:event.project_id,cursor:event.cursor});});
        // Si el salto supera la ventana de 20 eventos, los ids realmente nuevos
        // del catálogo completan la señal sin convertir el total en heurística.
        m.selectable_ids.forEach(function(id){if(state.known_ids.indexOf(id)<0&&!state.unread.some(function(row){return row.project_id===id;}))add({key:"i:"+id,project_id:id,cursor:null});});
        state.observed_cursor=m.cursor;
      }else if(m.cursor==null&&!first){
        // Rollout sin metadatos: sólo un id jamás visto es alta probable. Cambiar
        // nombre/orden/estado o reducir el total no produce ninguna señal.
        m.selectable_ids.forEach(function(id){if(state.known_ids.indexOf(id)<0)add({key:"i:"+id,project_id:id,cursor:null});});
      }
      state.known_ids=union(state.known_ids,m.all_ids);if(!stale)state.unread=state.unread.filter(function(row){return selectable[row.project_id]&&state.acked_keys.indexOf(row.key)<0;});
      if(m.newest_id)state.newest_id=m.newest_id;if(m.latest_created_at!=null&&(!state.latest_created_at||m.latest_created_at>state.latest_created_at))state.latest_created_at=m.latest_created_at;
      if(JSON.stringify(state)!==was)write(true);
      return {first:first,added:Math.max(0,unreadIds().length-before),unread_ids:unreadIds(),state:snapshot(),meta:m};
    }
    function ack(ids){var wanted={};uniq(ids).forEach(function(id){wanted[id]=true;});var was=JSON.stringify(state),kept=[];state.unread.forEach(function(row){if(wanted[row.project_id])state.acked_keys=union(state.acked_keys,[row.key]);else kept.push(row);});state.unread=kept;if(!state.unread.length&&state.observed_cursor!=null)state.seen_cursor=Math.max(state.seen_cursor==null?0:state.seen_cursor,state.observed_cursor);if(JSON.stringify(state)!==was)write(true);return snapshot();}
    function sync(value){
      var incoming;try{incoming=normalize(typeof value==="string"?JSON.parse(value||"null"):value);}catch(_){return snapshot();}
      var was=JSON.stringify(state),seen=Math.max(state.seen_cursor==null?-1:state.seen_cursor,incoming.seen_cursor==null?-1:incoming.seen_cursor),observed=Math.max(state.observed_cursor==null?-1:state.observed_cursor,incoming.observed_cursor==null?-1:incoming.observed_cursor);
      state.initialized=state.initialized||incoming.initialized;state.known_ids=union(state.known_ids,incoming.known_ids);state.acked_keys=union(state.acked_keys,incoming.acked_keys);state.unread=records(state.unread.concat(incoming.unread)).filter(function(row){return state.acked_keys.indexOf(row.key)<0&&(row.cursor==null||seen<0||row.cursor>seen);});state.seen_cursor=seen<0?null:seen;state.observed_cursor=observed<0?null:observed;
      if(incoming.latest_created_at!=null&&(!state.latest_created_at||incoming.latest_created_at>state.latest_created_at)){state.latest_created_at=incoming.latest_created_at;state.newest_id=incoming.newest_id||state.newest_id;}
      if(JSON.stringify(state)!==was)write(false);return snapshot();
    }
    return {observe:observe,ack:ack,sync:sync,snapshot:snapshot,unreadIds:unreadIds,key:KEY,meta:meta};
  }
  root.YkProjectNovelty={create:create,meta:meta,key:KEY,_test:{normalize:normalize}};
})(typeof window!=="undefined"?window:globalThis);
/* YK_PROJECT_NOVELTY_CORE_END */

/* ============================================================================
 * yk-frame.js — Marco CUADRÁTICO de AdmiraNeXT para el perímetro de Yokup.
 * Script CLÁSICO (sin módulos). Se inicializa tras DOMContentLoaded.
 *
 * yk-frame v3 (2026-07-12, canon precisado por Carlos):
 *   · Construye la BARRA SUPERIOR REAL (.yk-bar) como entidad propia del sitio,
 *     fixed y de ancho completo:
 *       [icono OPCIONES] · logotipo YO KUP (→ /) · rótulo de la página ·
 *       referencias de la home · FLOTA admira.tv + reloj ·
 *       [icono AVANZADO] [icono EXPERTO]
 *   · Los tres paneles OVERLAY nacen bajo la barra (top: alto de la barra) y NO
 *     encogen el contenido: flotan encima. La esquina inf-dcha queda para el avatar.
 *   · Los ICONOS viven DENTRO de la barra y NO se mueven: toggle + Escape, con
 *     estado encendido (aria-pressed) cuando su panel está abierto.
 *   · El reloj lo pinta la barra (intervalo propio); las páginas ya no lo llevan.
 *
 * Mecánica de slots: MUEVE (no clona, para preservar los handlers ya enlazados
 * por la página) los nodos [data-yk-slot="left|right|bottom"] al panel
 * correspondiente. Si un slot no tiene nodos, muestra «— sin opciones».
 *
 * Los tres paneles nacen plegados en cada carga. NO toca acceso.js ni
 * avatar-widget.js.
 * ==========================================================================*/
(function () {
  "use strict";

  // DOMINIO PROPIO (23-jul-2026, DEC-mrxsvdx1glyx): api.yokup.com sobre la zona
  // yokup.com (ya en Cloudflare) cura el bloqueo de *.workers.dev por ISPs
  // españoles (188.114.96.0/22), que silenciaba contadores e ideas según la red.
  // WORKER_FALLBACK es un SEGUNDO dominio propio, rtc.yokup.com (28-jul-2026): si el
  // primario falla en una red rara, se reintenta UNA vez contra él. Antes apuntaba a
  // workers.dev, que devolvía 404 (quedó workers_dev=false al migrar) y además está en
  // el rango bloqueado: el respaldo no respaldaba nada.
  var WORKER = "https://api.yokup.com";
  var WORKER_FALLBACK = "https://rtc.yokup.com";
  // Dominio propio: LaLiga bloquea workers.dev en horas de fútbol (FLT-1633); workers.dev sigue vivo como respaldo.
  var TELEGRAM = "https://bot.yokup.com";
  // Sello del deploy, capturado mientras este script sigue siendo currentScript.
  // deploy.mjs versiona cada referencia /yk-frame.js?v=<sello>; version.json es
  // la confirmación pública. Nunca debe volver a vivir aquí una fecha manual.
  var FRAME_SRC = (document.currentScript && document.currentScript.src) || "";
  var VERSION = (function () {
    try { return new URL(FRAME_SRC, location.href).searchParams.get("v") || "versión pendiente"; }
    catch (e) { return "versión pendiente"; }
  })();

  // fetch con red de seguridad: intenta api.yokup.com y, si el fetch RECHAZA
  // (fallo de red/DNS/bloqueo, no un 4xx/5xx que sí llega), reintenta una vez
  // contra el host de respaldo (rtc.yokup.com). Solo se usa en los puntos críticos
  // (contadores del menú); el resto llama a WORKER directo.
  function ykFetch(path, opts) {
    return window.fetch(WORKER + path, opts).catch(function () {
      return window.fetch(WORKER_FALLBACK + path, opts);
    });
  }
  window.ykFetch = ykFetch;   // disponible para las páginas (ideas/objetivos)

  // FLT-1423 · un GET, un viaje. El marco y la página pedían /projects y
  // /api/presence CADA UNO por su cuenta en la misma carga. Este memo comparte
  // el JSON ya parseado durante un TTL corto (4 s): mata el duplicado del
  // arranque sin interferir con los refrescos periódicos, que van a >10 s.
  // Se define «si no existe» aquí y en las páginas que lo usan, para no
  // depender del orden de carga. Un fallo no se cachea: el reintento es libre.
  window.__ykJsonOnce = window.__ykJsonOnce || function (clave, ttlMs, trae) {
    var store = (window.__ykJsonOnceStore = window.__ykJsonOnceStore || {});
    var hit = store[clave];
    if (hit && Date.now() - hit.at < (ttlMs || 4000)) return hit.p;
    var p = trae();
    store[clave] = { at: Date.now(), p: p };
    p.catch(function () { if (store[clave] && store[clave].p === p) delete store[clave]; });
    return p;
  };
  // Los tres raíles empiezan SIEMPRE compactados. El estado anterior del
  // navegador no puede volver a abrir una superficie operativa al entrar.
  var OPEN_PANELS = { left:false, right:false, bottom:false };

  // NAV DE PLATAFORMA — fuente ÚNICA del menú tras la DMZ (zona app). Las
  // páginas de plataforma declaran <body data-yk-zone="app"> y nada más: los
  // items y el activo (deducido del pathname) salen de aquí, idénticos en
  // todas — no pueden divergir. Solo las intros/homes públicas llevan menú
  // propio (data-yk-nav o el NAV global de abajo).
  // EQUIPO y STATUS salieron del menú superior (Carlos, 2026-07-23): son
  // navegación de gestión, no del flujo de trabajo → viven ahora en el raíl
  // OPCIONES (ver buildRailFoot), encima de «Panel de control».
  var APP_NAV = [
    ["DASHBOARD",   "https://www.yokup.com/dashboard"],
    ["OBJETIVOS",   "https://www.yokup.com/objetivos"],
    ["DECISIONES",  "https://www.yokup.com/decisiones"],
    ["MISIONES",    "https://www.yokup.com/misiones"],
    ["TAREAS",      "https://www.yokup.com/tareas"],
    ["INCIDENCIAS", "https://www.yokup.com/incidencias"],
    ["SUPERVISOR",  "/supervisor"],
    ["INFORMES",    "/informes-flota"],
    // FLT-1020: un diálogo del sistema en cualquier equipo lo deja PARADO. Va en la
    // barra para que se vea desde cualquier página, no sólo si entras a buscarlo.
    ["NOTIFICACIONES", "https://www.yokup.com/notificaciones"],
    // FLT-1321 (Carlos, 2026-08-08): el Highscore es la foto de cómo va la flota y
    // sólo se alcanzaba desde el raíl AVANZADO, que hay que abrir para verlo. A la
    // derecha de NOTIFICACIONES y en todas las páginas de la plataforma.
    ["HIGHSCORE",   "/highscore"]
  ];

  // Secciones con CONTADOR real «curso/pend» en la barra (Carlos, 2026-07-23):
  // label → clave del agregado GET /menu/contadores. DASHBOARD y DECISIONES no
  // llevan contador. curso = en ello ahora; pend = esperando.
  var COUNTER_KEY = {
    OBJETIVOS: "objetivos", MISIONES: "misiones", TAREAS: "tareas",
    INCIDENCIAS: "incidencias", INFORMES: "informes", NOTIFICACIONES: "notificaciones"
  };

  // Scope global de proyecto (FLT-1218). Sin selección válida empieza en Todos.
  // Una elección explícita viaja por query + storage versionado; ambos guardan sólo
  // el `id` canónico del censo, nunca nombres, dominios o inferencias por pathname.
  var PROJECT_SCOPE_KEY = "yokup.project.scope.v1";
  var PROJECT_SCOPE = null, PROJECT_CATALOG = [];
  // Highscore es una clasificación global por agente. Arrastrar hasta ella el
  // project_id persistido por otra sección hacía que el cabezal prometiera un
  // alcance que ni /highscore/daily ni /highscore/active-work aplican: la tabla
  // podía quedar vacía mientras la carrera conservaba títulos globales. En esta
  // superficie el único alcance honesto es Todos; no borramos la preferencia
  // guardada, para que siga vigente al volver a una sección que sí es filtrable.
  function globalProjectScopeSurface(pathname) {
    return /^\/highscore(?:\.html)?\/?$/i.test(String(pathname || ""));
  }
  function projectScopeMatch(row, projectId) {
    return projectId == null || String(row && (row.project_id || row.project) || "") === String(projectId);
  }
  function resolveProjectScope(queryId, storedId, catalog) {
    var ids = (catalog || []).filter(function (p) {
      return p && p.id && String(p.status || "activo").toLowerCase() !== "archivado";
    }).map(function (p) { return p.id; });
    var query = String(queryId || "").trim(), stored = String(storedId || "").trim();
    return ids.indexOf(query) >= 0 ? query : (ids.indexOf(stored) >= 0 ? stored : null);
  }
  window.YkProjectScope = {
    get: function () { return PROJECT_SCOPE; },
    matches: projectScopeMatch,
    catalog: function () { return PROJECT_CATALOG.slice(); },
    _test: {resolve:resolveProjectScope}
  };
  function projectHost(project) {
    var raw = String(project && project.web || "").trim();
    if (!raw) return "";
    try { return new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw).hostname.replace(/^www\./i, ""); }
    catch (e) { return ""; }
  }

  // Referencias de la home (los 4 primeros son anclas de la landing)
  var NAV = [
    ["Plataforma",   "/#plataforma"],
    ["Agentes IoT",  "/#como"],
    ["as a Service", "/#xaas"],
    ["Equipo",       "/#equipo"],
    ["Incidencias",  "https://www.yokup.com/incidencias"],
    ["admira.live",  "https://www.yokup.com/admira-live"],
    ["Asistencia",   "/asistencia"],
    ["App",          "https://www.yokup.com/app"]
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[<>&"]/g, function (c) {
      return {"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"}[c];
    });
  }

  // CONTADOR «curso/pend» de una sección: span vacío con data-yk-count=<clave>
  // que rellena paintCounters tras el fetch. aria-hidden: el número es señal
  // visual y no debe leerse pegado al rótulo; el enlace ya se anuncia solo.
  function counterSpan(label, cls) {
    // DECISIONES no lleva «curso/pend» sino CUENTA ATRÁS: span data-yk-countdown que
    // sólo se rellena si hay un reloj de decisión vivo (deadline futuro). Ver paintDecisiones.
    if (label === "DECISIONES") {
      var d = el("span", cls);
      d.setAttribute("data-yk-countdown", "1");
      d.setAttribute("aria-hidden", "true");
      return d;
    }
    var key = COUNTER_KEY[label];
    if (!key) return null;
    var s = el("span", cls);
    s.setAttribute("data-yk-count", key);
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  // LOS NÚMEROS SALEN DEL MENÚ (Carlos, 2026-08-05). Desde que el hover enseña el
  // detalle, la cifra permanente bajo cada rótulo era ruido: siete pares de
  // números compitiendo por la atención para decir lo que ya se lee al pasar por
  // encima. Queda la LUZ —que es lo que se busca de un vistazo— y la tarjeta.
  // paintCounters sigue existiendo porque el título accesible y la alarma de
  // NOTIFICACIONES sí dependen del dato; lo que ya no escribe es el texto.
  function paintCounters(data) {
    var spans = document.querySelectorAll("[data-yk-count]");
    Array.prototype.forEach.call(spans, function (s) {
      var k = s.getAttribute("data-yk-count");
      var d = data && data[k];
      if (!d) { s.textContent = ""; return; }
      // INFORMES no es «curso/pend»: un informe no tiene estado, o está o no está
      // (Carlos, 24-jul-2026). Aquí el par es COBERTURA — de las misiones ya
      // terminadas, cuántas tienen su parte. Iguales = al día; si no, hay deuda.
      // NOTIFICACIONES: la luz roja sólo representa máquinas con un diálogo de
      // sistema confirmado en vivo. Backlog, stale y señales sin confirmar no
      // pueden afirmar que una máquina esté bloqueada ahora.
      if (k === "notificaciones") {
        var live = d.live | 0, machines = d.affected_machines | 0;
        s.textContent = "";
        if (!machines) { s.removeAttribute("title"); s.classList.remove("yk-count-alarma"); return; }
        s.setAttribute("title", machines === 1
          ? "1 máquina con " + live + (live === 1 ? " aviso" : " avisos") + " de sistema en vivo"
          : machines + " máquinas con " + live + " avisos de sistema en vivo");
        s.classList.add("yk-count-alarma");
        return;
      }
      if (k === "informes") {
        var hechos = d.hechos | 0, total = d.total | 0, faltan = total - hechos;
        s.textContent = "";
        if (!total) { s.removeAttribute("title"); s.classList.remove("yk-count-debe"); return; }
        s.setAttribute("title", faltan
          ? hechos + " de " + total + " misiones terminadas tienen su informe · faltan " + faltan
          : "las " + total + " misiones terminadas tienen su informe");
        s.classList.toggle("yk-count-debe", faltan > 0);
        return;
      }
      if (k === "tareas") {
        var taskRun = d.curso | 0, taskPend = d.pend | 0, taskOld = d.no_concluidas | 0,
            taskArchived = d.archivadas_incompletas | 0, taskOrphans = d.huerfanas | 0,
            taskInvalid = d.padre_invalido | 0, taskDebt = taskArchived + taskOrphans + taskInvalid;
        s.textContent = "";
        if (taskRun + taskPend + taskOld === 0) {
          if (taskDebt) s.setAttribute("title", "0 tareas operativas · " + taskDebt + " con deuda de integridad histórica");
          else s.removeAttribute("title");
          return;
        }
        s.setAttribute("title", taskRun + " en curso · " + taskPend + " pendientes operativas · " +
          taskOld + " no concluidas" + (taskDebt ? " · " + taskDebt + " con deuda de integridad histórica" : ""));
        return;
      }
      var curso = d.curso | 0, pend = d.pend | 0;
      // 0/0 → nada (Carlos, 2026-07-23): sección vacía enseña sólo su rótulo limpio.
      s.textContent = "";
      if (curso + pend === 0) { s.removeAttribute("title"); return; }
      s.setAttribute("title", curso + " en curso · " + pend + " pendientes");
    });
  }

  // DECISIONES: cuenta atrás ⏳ m:ss hacia el deadline VIVO más próximo. El tic-tac
  // es LOCAL (setInterval 1s): un solo fetch por carga basta; al llegar a 0 se oculta
  // sola sin recargar. Sin reloj vivo (deadline nulo o pasado) → DECISIONES limpia.
  var _cdTimer = 0;
  function paintDecisiones(data) {
    var span = document.querySelector("[data-yk-countdown]");
    if (!span) return;
    if (_cdTimer) { window.clearInterval(_cdTimer); _cdTimer = 0; }
    var dl = data && data.decisiones && data.decisiones.deadline;
    if (!dl || !(dl > Date.now())) { span.textContent = ""; span.removeAttribute("title"); return; }
    function tick() {
      var ms = dl - Date.now();
      if (ms <= 0) {
        span.textContent = ""; span.removeAttribute("title");
        if (_cdTimer) { window.clearInterval(_cdTimer); _cdTimer = 0; }
        return;
      }
      var s = Math.ceil(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
      var t = m + ":" + (ss < 10 ? "0" + ss : ss);
      span.textContent = "";   // sin número: la novedad se ve por la luz
      span.setAttribute("title", "Decisi\xF3n pendiente \xB7 cierra en " + t);
    }
    tick();
    _cdTimer = window.setInterval(tick, 1000);
  }

  // ==================== REFERENCIA LUMÍNICA DE LA BARRA =====================
  // Carlos, 2026-08-05: la barra es el nexo de todos los proyectos, así que
  // tiene que decir DÓNDE está pasando algo sin pulsar nada. Dos señales:
  //   1) el rótulo se ENCIENDE cuando hay novedad desde la última vez que
  //      pasaste por esa sección (una ventana de decisión nueva, una misión
  //      que se ha partido en tareas, un informe que ha cerrado el ciclo…);
  //   2) al ponerte ENCIMA sale el detalle de esos números, sin navegar.
  // Todo vive en el cliente sobre el MISMO /menu/contadores que ya se pedía: ni
  // un fetch más, ni un endpoint nuevo que desplegar.
  var SEEN_LS = "yk_nav_seen";
  var MISSION_ANNOUNCED_SS = "yk_nav_missions_announced_v2";
  var _missionChannel = null, _pendingMissionRender = null;
  try { if (typeof window.BroadcastChannel === "function") _missionChannel = new window.BroadcastChannel("yokup-nav-missions-v2"); } catch (e) {}
  var _missionNovelty = window.YkMissionNovelty.create({
    storage:window.localStorage,
    publish:function (state) { try { if (_missionChannel) _missionChannel.postMessage({ type:"mission-novelty", state:state }); } catch (e) {} }
  });

  function paintMissionNoveltyLink() {
    var a=document.querySelector('.yk-nav a[data-yk-sec="MISIONES"]');if(!a)return;
    var state=_missionNovelty.snapshot(),unread=state.unread|0;
    a.classList.toggle("yk-nuevo",unread>0);
    if(unread){a.setAttribute("data-yk-delta","+"+unread);if(state.newest_id)a.setAttribute("data-yk-newest",state.newest_id);a.setAttribute("aria-label","MISIONES, "+unread+(unread===1?" nueva":" nuevas"));}
    else{a.removeAttribute("data-yk-delta");a.removeAttribute("data-yk-newest");a.setAttribute("aria-label","MISIONES");}
    if(_popFor==="MISIONES"&&_lastCounters)paintPop(a,"MISIONES",_lastCounters);
  }
  function announceMissionNovelty(result) {
    if(!result||!result.added)return;
    var state=result.state,token=String(state.observed_cursor==null?(state.newest_id+":"+state.latest_created_at):state.observed_cursor),last="";
    try{last=window.sessionStorage.getItem(MISSION_ANNOUNCED_SS)||"";}catch(e){}
    if(token&&token===last)return;
    var live=document.getElementById("yk-nav-mission-live");
    if(!live){live=el("div","yk-nav-live");live.id="yk-nav-mission-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");live.setAttribute("aria-atomic","true");document.body.appendChild(live);}
    live.textContent=state.unread===1?("Nueva misión"+(state.newest_id?" "+state.newest_id:"")):state.unread+" misiones nuevas";
    try{window.sessionStorage.setItem(MISSION_ANNOUNCED_SS,token);}catch(e){}
  }
  function canAckMissionRender(state,ids){
    if(!state.unread)return true;
    ids=Array.isArray(ids)?ids.map(String):[];
    if(state.newest_id)return ids.indexOf(String(state.newest_id))>=0;
    var eventIds=(state.events||[]).map(function(event){return String(event.mission_id||"");}).filter(Boolean);
    return eventIds.length?eventIds.every(function(id){return ids.indexOf(id)>=0;}):ids.length>0;
  }
  function consumeRenderedMissions(data){
    if(_pendingMissionRender==null)return false;
    var state=_missionNovelty.snapshot(),ids=_pendingMissionRender;_pendingMissionRender=null;
    if(!canAckMissionRender(state,ids))return false;
    _missionNovelty.ack(data&&data.misiones||{});paintMissionNoveltyLink();return true;
  }
  function receiveMissionState(value){try{_missionNovelty.sync(value);paintMissionNoveltyLink();}catch(e){}}
  window.addEventListener("storage",function(event){if(event&&event.key===_missionNovelty.key&&event.newValue)receiveMissionState(event.newValue);});
  if(_missionChannel)_missionChannel.onmessage=function(event){var data=event&&event.data;if(data&&data.type==="mission-novelty")receiveMissionState(data.state);};
  window.addEventListener("yk:missions-rendered",function(event){_pendingMissionRender=event&&event.detail&&Array.isArray(event.detail.ids)?event.detail.ids:[];fetchCounters();});
  if(Array.isArray(window.__ykMissionsRenderedIds))_pendingMissionRender=window.__ykMissionsRenderedIds.slice();

  function seenRead() {
    try { return JSON.parse(window.localStorage.getItem(SEEN_LS) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function seenWrite(m) {
    try { window.localStorage.setItem(SEEN_LS, JSON.stringify(m)); } catch (e) {}
  }

  // Estado de una sección a partir del agregado: `n` es la magnitud que crece
  // cuando llega trabajo nuevo (es lo que dispara la luz), `sig` distingue dos
  // estados con la misma magnitud (p.ej. un reloj que cierra y otro que abre en
  // el mismo sondeo), y `rows` es lo que se lee en la tarjeta del hover.
  function sectionState(data, label) {
    if (!data) return null;
    if (label === "DECISIONES") {
      var dd = data.decisiones || {}, vivas = dd.vivas | 0, dl = dd.deadline || 0;
      var dia = dd.dia | 0, hora = dd.hora | 0;
      // «total día» y «total hora» sin repetir «ventanas» (Carlos, 2026-08-05):
      // en la tarjeta de DECISIONES se sobreentiende, y así cabe en una línea.
      var filas = [["relojes vivos", vivas, vivas ? "" : ""]];
      if (vivas) filas.push(["cierra", dl > Date.now() ? cdText(dl) : "—", ""]);
      filas.push(["total hora", hora, ""], ["total día", dia, ""]);
      return {
        n: vivas, sig: vivas + ":" + dl + ":" + dia,
        rows: filas,
        foot: vivas ? "Una ventana abierta espera tu elección."
          : (hora ? "Ninguna pendiente ahora; la flota ya preguntó esta hora."
                  : "Ninguna decisión pendiente.")
      };
    }
    if(label==="MISIONES"){
      var md=data.misiones||{},mc=md.curso|0,mp=md.pend|0,mn=md.no_concluidas|0,
          mu=md.sin_asignar|0,ms=_missionNovelty.snapshot(),mr=[];
      if(ms.unread)mr.push(["nuevas",ms.unread,"nuevo"]);
      mr.push(["en curso",mc,""],["pendientes",mp,""],["no concluidas",mn,""],["sin asignar",mu,""]);
      return {n:mc+mp+mn+mu,sig:String(md.created_cursor==null?(mc+"/"+mp+"/"+mn+"/"+mu):md.created_cursor),rows:mr,
        foot:(ms.unread?(ms.newest_id?("La misión "+ms.newest_id+" es nueva. "):"Hay misiones nuevas desde tu última visita. "):"")+"Resumen global · todo el backlog · todas las fechas y proyectos."};
    }
    var key = COUNTER_KEY[label], d = key && data[key];
    if (!d) return null;
    if (key === "notificaciones") {
      var live = d.live | 0, machines = d.affected_machines | 0,
          uncertain = d.unconfirmed | 0, history = (d.stale | 0) + (d.backlog | 0);
      return {
        n: machines, sig: "n:" + machines + "/" + live + "/" + uncertain + "/" + history,
        rows: [["máquinas afectadas ahora", machines, machines ? "alarma" : ""],
               ["avisos en vivo", live, live ? "alarma" : ""],
               ["sin confirmar", uncertain, ""], ["históricos", history, ""]],
        foot: machines ? "Señal de sistema confirmada en los últimos 90 segundos." : "Sin bloqueos confirmados ahora."
      };
    }
    if (key === "informes") {
      var he = d.hechos | 0, to = d.total | 0, fa = to - he;
      return {
        n: he, sig: he + "/" + to,
        rows: [["con informe", he, ""], ["misiones cerradas", to, ""],
               ["faltan", fa, fa > 0 ? "debe" : ""]],
        foot: (fa > 0 ? "Hay cierres con deuda de informe. " : "Todo el ciclo cerrado tiene informe. ") +
          "Resumen global · todas las fechas y proyectos."
      };
    }
    if (key === "tareas") {
      var tc = d.curso | 0, tp = d.pend | 0, tn = d.no_concluidas | 0,
          ta = d.archivadas_incompletas | 0, th = d.huerfanas | 0,
          ti = d.padre_invalido | 0, tt = d.total_historico | 0;
      return {
        n: tc + tp + tn, sig: tc + "/" + tp + "/" + tn + "/archive:" + ta,
        rows: [["en curso", tc, ""], ["pendientes operativas", tp, ""],
               ["no concluidas", tn, tn ? "debe" : ""],
               ["archivadas incompletas", ta, ta ? "debe" : ""],
               ["huérfanas", th, th ? "debe" : ""], ["padre inválido", ti, ti ? "debe" : ""]],
        foot: ta + th + ti ? "Deuda de integridad separada · " + tt + " tareas en el histórico; no enciende la señal operativa."
          : "Sólo tareas bajo misiones abiertas o en curso."
      };
    }
    var cu = d.curso | 0, pe = d.pend | 0;
    return {
      n: cu + pe, sig: cu + "/" + pe,
      rows: [["en curso", cu, ""], ["pendientes", pe, ""]],
      foot: ""
    };
  }

  function cdText(dl) {
    var s = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  // Enciende/apaga los rótulos comparando contra lo último visto. La sección en
  // la que ESTÁS nunca se enciende: estás mirándola, ya no es novedad.
  function markNovelties(data) {
    var links = document.querySelectorAll(".yk-nav a[data-yk-sec]");
    if (!links.length) return;
    var missionResult=_missionNovelty.observe(data&&data.misiones||{});
    var missionConsumed=consumeRenderedMissions(data);
    if(!missionConsumed)announceMissionNovelty(missionResult);
    var seen = seenRead(), primeraVez = !Object.keys(seen).length, dirty = false;
    Array.prototype.forEach.call(links, function (a) {
      var label = a.getAttribute("data-yk-sec");
      var st = sectionState(data, label);
      if (!st) return;
      if(label==="MISIONES"){
        paintMissionNoveltyLink();
        if(_popFor===label)paintPop(a,label,data);
        return;
      }
      var prev = seen[label];
      // Primera carga del navegador: se toma nota en silencio. Si no, la barra
      // entera se encendería de golpe y la señal no valdría nada.
      var nuevo = !primeraVez && prev
        ? (st.n > (prev.n | 0)) || (label === "DECISIONES" && st.n > 0 && st.sig !== prev.sig)
        : false;
      if (a.classList.contains("on")) nuevo = false;   // la sección abierta se lee como vista
      if (nuevo) {
        a.classList.add("yk-nuevo");
        a.setAttribute("data-yk-delta", "+" + (st.n - (prev.n | 0)));
        // Con el rótulo encendido NO se reanota: el punto de partida sigue
        // siendo la última visita de verdad, así el delta de la tarjeta no se
        // va a cero solo porque hayan entrado más cosas mientras no mirabas.
      } else {
        a.classList.remove("yk-nuevo");
        a.removeAttribute("data-yk-delta");
        if (!prev || prev.n !== st.n || prev.sig !== st.sig) {
          seen[label] = { n: st.n, sig: st.sig }; dirty = true;
        }
      }
      if (_popFor === label) paintPop(a, label, data);   // tarjeta abierta: refréscala
    });
    if (dirty || primeraVez) seenWrite(seen);
  }

  // Apaga una sección: se consume la novedad al entrar en ella.
  function consumeSection(label) {
    if (!label || !_lastCounters) return;
    var st = sectionState(_lastCounters, label);
    if (!st) return;
    var seen = seenRead();
    seen[label] = { n: st.n, sig: st.sig };
    seenWrite(seen);
    var a = document.querySelector('.yk-nav a[data-yk-sec="' + label + '"]');
    if (a) { a.classList.remove("yk-nuevo"); a.removeAttribute("data-yk-delta"); }
  }

  // --------- tarjeta de detalle (hover/foco). Una sola, se reposiciona. -----
  var _pop = null, _popFor = "", _lastCounters = null;

  function popEl() {
    if (_pop) return _pop;
    _pop = el("div", "yk-navpop");
    _pop.setAttribute("role", "tooltip");
    _pop.id = "yk-navpop";
    document.body.appendChild(_pop);
    return _pop;
  }

  function paintPop(a, label, data) {
    var st = sectionState(data, label);
    var p = popEl();
    if (!st) { hidePop(); return; }
    var html = '<div class="yk-pop-h">' + label + (label==="MISIONES"?" · TODO EL BACKLOG":"") + "</div>";
    st.rows.forEach(function (r) {
      html += '<div class="yk-pop-r ' + (r[2] || "") + '"><span>' + r[0] +
              "</span><b>" + r[1] + "</b></div>";
    });
    var delta = a.getAttribute("data-yk-delta");
    if(delta&&label==="MISIONES"){
      var dn=Math.max(0,parseInt(delta,10)||0),newest=a.getAttribute("data-yk-newest")||"";
      html+='<div class="yk-pop-n">▲ '+dn+(dn===1?" misión nueva":" misiones nuevas")+' desde tu última visita'+(newest?" · "+esc(newest):"")+"</div>";
    }else if(delta)html += '<div class="yk-pop-n">▲ ' + delta + " desde tu última visita</div>";
    if (st.foot) html += '<div class="yk-pop-f">' + esc(st.foot) + "</div>";
    p.innerHTML = html;
    // Anclada bajo el rótulo y recortada al viewport: la barra hace scroll
    // horizontal, así que el último ítem se saldría por la derecha.
    var r = a.getBoundingClientRect();
    p.style.top = Math.round(r.bottom + 7) + "px";
    p.style.left = "0px";
    var w = p.offsetWidth;
    var x = Math.round(r.left + r.width / 2 - w / 2);
    p.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    p.classList.add("on");
    _popFor = label;
  }

  function hidePop() {
    if (!_pop) return;
    _pop.classList.remove("on");
    _popFor = "";
  }

  // El hover NO consume la novedad ni navega: sólo enseña. Todo lo demás sigue
  // exactamente igual, que es lo que pidió Carlos.
  function wireNavPop(a, label) {
    a.setAttribute("data-yk-sec", label);
    // HIGHSCORE no tiene contador y su hover quedaba mudo: en vez del tooltip
    // de cifras abre un SUBMENÚ clicable con sus vistas (FLT-1426).
    if (label === "HIGHSCORE") { wireHsSubmenu(a); return; }
    a.setAttribute("aria-describedby", "yk-navpop");
    function show() { if (_lastCounters) paintPop(a, label, _lastCounters); }
    a.addEventListener("mouseenter", show);
    a.addEventListener("focus", show);
    a.addEventListener("mouseleave", hidePop);
    a.addEventListener("blur", hidePop);
    // MISIONES sólo se consume DESPUÉS de que su tablero confirme el render.
    // Las demás secciones conservan el comportamiento histórico al navegar.
    a.addEventListener("click", function () { if(label!=="MISIONES")consumeSection(label); });
  }
  window.addEventListener("scroll", hidePop, true);
  window.addEventListener("resize", hidePop);

  // ── Submenú de vistas del HIGHSCORE (FLT-1426, Carlos 2026-08-14) ─────────
  // El Marcador y el podio del día EN VIVO: cada puesto lleva a su Detalle,
  // que es donde viven la evolución y las series. Los datos se piden al ABRIR
  // el submenú, nunca al cargar la página —un submenú no puede costarle una
  // llamada a cada página del site—, y se guardan 60 s en sessionStorage.
  var HS_SUB_TTL_MS = 60000, HS_SUB_KEY = "yokup.hs.submenu.v2";
  var _hsSub = null, _hsSubClose = null;
  function hsSubTop() {
    try {
      var hit = JSON.parse(sessionStorage.getItem(HS_SUB_KEY) || "null");
      if (hit && Date.now() - hit.at < HS_SUB_TTL_MS && Array.isArray(hit.top)) return Promise.resolve(hit.top);
    } catch (_) {}
    return ykFetch("/highscore/daily", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var top = (d && d.scores || []).map(function (s) {
          return { agent: String(s.agent || ""),
            pts: (Number(s.objective_points) || 0) + (Number(s.window_points) || 0) + (Number(s.mission_points) || 0),
            ayer: Number(s.yesterday_points) || 0,
            comparacion: ["sube", "baja", "igual"].indexOf(s.day_comparison) >= 0 ? s.day_comparison : "igual" };
        }).filter(function (s) { return s.agent; })
          .sort(function (a, b) { return b.pts - a.pts; }).slice(0, 3);
        try { sessionStorage.setItem(HS_SUB_KEY, JSON.stringify({ at: Date.now(), top: top })); } catch (_) {}
        return top;
      });
  }
  function hsSubEl() {
    if (_hsSub) return _hsSub;
    _hsSub = el("div", "yk-submenu");
    _hsSub.id = "yk-hs-submenu";
    _hsSub.setAttribute("role", "menu");
    _hsSub.setAttribute("aria-label", "Vistas del Highscore");
    document.body.appendChild(_hsSub);
    _hsSub.addEventListener("mouseenter", function () { clearTimeout(_hsSubClose); });
    _hsSub.addEventListener("mouseleave", hsSubHideSoon);
    return _hsSub;
  }
  function hsSubRow(href, texto, cifra, comparacion, ayer) {
    var dato = "";
    if (cifra != null) {
      var estado = ["sube", "baja", "igual"].indexOf(comparacion) >= 0 ? comparacion : "igual";
      var simbolo = estado === "sube" ? "▲" : estado === "baja" ? "▼" : "=";
      var lectura = estado === "sube" ? "superior a ayer" : estado === "baja" ? "inferior a ayer" : "igual que ayer";
      dato = '<b class="yk-sub-score ' + estado + '" title="Ayer: ' + esc(String(Number(ayer) || 0)) +
        ' pt · ' + lectura + '" aria-label="' + esc(String(cifra)) + ', ' + lectura + '">' +
        '<span aria-hidden="true">' + simbolo + '</span> ' + esc(String(cifra)) + "</b>";
    }
    return '<a role="menuitem" href="' + href + '"><span>' + esc(texto) + "</span>" +
           dato + "</a>";
  }
  function hsSubShow(a) {
    clearTimeout(_hsSubClose);
    var p = hsSubEl();
    p.innerHTML = '<div class="yk-sub-h">HIGHSCORE · HOY</div>' +
      hsSubRow("/highscore", "Marcador", null) +
      '<div class="yk-sub-r yk-sub-espera">podio…</div>';
    var r = a.getBoundingClientRect();
    p.style.top = Math.round(r.bottom + 7) + "px";
    p.style.left = "0px";
    var w = p.offsetWidth;
    var x = Math.round(r.left + r.width / 2 - w / 2);
    p.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    p.classList.add("on");
    hsSubTop().then(function (top) {
      if (!p.classList.contains("on")) return;
      var medallas = ["🥇", "🥈", "🥉"];
      var filas = (top || []).map(function (s, i) {
        return hsSubRow("/highscoreDetail?agent=" + encodeURIComponent(s.agent),
          medallas[i] + " " + s.agent, s.pts + " pt", s.comparacion, s.ayer);
      }).join("");
      p.innerHTML = '<div class="yk-sub-h">HIGHSCORE · HOY</div>' +
        hsSubRow("/highscore", "Marcador", null) +
        (filas || '<div class="yk-sub-r yk-sub-espera">sin puntos aún</div>');
      // Recolocar: el ancho cambia al llegar el podio y no puede salirse.
      p.style.left = "0px";
      var w2 = p.offsetWidth, x2 = Math.round(r.left + r.width / 2 - w2 / 2);
      p.style.left = Math.max(8, Math.min(x2, window.innerWidth - w2 - 8)) + "px";
    }).catch(function () {
      var espera = p.querySelector(".yk-sub-espera");
      if (espera) espera.textContent = "podio no disponible";
    });
  }
  function hsSubHide() { if (_hsSub) _hsSub.classList.remove("on"); }
  function hsSubHideSoon() {
    clearTimeout(_hsSubClose);
    // La holgura da tiempo a cruzar del rótulo al submenú sin que se esfume.
    _hsSubClose = setTimeout(hsSubHide, 220);
  }
  function wireHsSubmenu(a) {
    a.setAttribute("aria-haspopup", "menu");
    a.setAttribute("aria-controls", "yk-hs-submenu");
    a.addEventListener("mouseenter", function () { hsSubShow(a); });
    a.addEventListener("focus", function () { hsSubShow(a); });
    a.addEventListener("mouseleave", hsSubHideSoon);
    a.addEventListener("blur", hsSubHideSoon);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hsSubHide(); });
  window.addEventListener("scroll", hsSubHide, true);
  window.addEventListener("resize", hsSubHide);

  // UN fetch por página al agregado del worker. Si falla, el menú se queda sin
  // contadores (degradación silenciosa: nada de toasts ni reintentos).
  function fetchCounters() {
    if (!document.querySelector("[data-yk-count],[data-yk-countdown]")) return Promise.resolve(false);
    return ykFetch("/menu/contadores", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return false;
        _lastCounters = d;
        paintCounters(d); paintDecisiones(d); markNovelties(d);
        return true;
      })
      .catch(function () { return false; });
  }

  // Los contadores reflejan cambios locales sin esperar una recarga y también
  // se reconcilian con cambios realizados por otros agentes cada 12 segundos.
  window.addEventListener("yk:decisions-changed", fetchCounters);
  window.addEventListener("yk:work-changed", fetchCounters);
  window.setInterval(fetchCounters, 12000);

  // id del recurso en la URL (?id=…) para el EXPERTO de ficha
  function urlId() {
    try { return new URLSearchParams(location.search).get("id") || ""; } catch (e) { return ""; }
  }

  // rótulo de la página actual: data-yk-title del <body>, o derivado de la ruta
  function pageTitle() {
    var t = document.body.getAttribute("data-yk-title");
    if (t) return t;
    var seg = location.pathname.replace(/\/+$/, "").split("/").pop() || "";
    seg = seg.replace(/\.html$/, "").toLowerCase();
    var map = {
      incidencias: "INCIDENCIAS", ticket: "TICKET", agentes: "AGENTES",
      "admira-live": "ADMIRA.LIVE", misiones: "MISIONES", tareas: "TAREAS",
      decisiones: "DECISIONES", objetivos: "OBJETIVOS", ideas: "OBJETIVOS",
      dashboard: "DASHBOARD", informes: "INFORMES", status: "STATUS", equipo: "EQUIPO",
      asistencia: "ASISTENCIA", intervencion: "INTERVENCIÓN", supervisor: "SUPERVISOR"
    };
    return map[seg] || "";
  }

  // menú de la barra: zona app (body[data-yk-zone="app"]) → APP_NAV único con
  // activo por pathname; si no, por página (body[data-yk-nav], JSON o lista
  // «Label:href|…»); sin nada, el menú global de la home.
  function pageNav() {
    if (document.body.getAttribute("data-yk-zone") === "app") {
      /* Las vistas detalle declaran su sección padre; el menú sigue saliendo de
         APP_NAV y no necesitan copiarlo ni falsificar enlaces propios. */
      var parentPath = document.body.getAttribute("data-yk-parent");
      var path = (parentPath || location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
      return APP_NAV.map(function (r) {
        return { label: r[0], href: r[1], active: (path === r[1] || path === r[1] + ".html") };
      });
    }
    var raw = document.body.getAttribute("data-yk-nav");
    if (raw) {
      try {
        var j = JSON.parse(raw);
        if (Array.isArray(j) && j.length) {
          return j.map(function (it) {
            return Array.isArray(it) ? { label: it[0], href: it[1] } : it;
          });
        }
      } catch (e) {
        return raw.split("|").map(function (s) {
          var p = s.split(":");
          return { label: (p[0] || "").trim(), href: (p.slice(1).join(":") || "").trim() || null };
        }).filter(function (x) { return x.label; });
      }
    }
    return NAV.map(function (r) { return { label: r[0], href: r[1] }; });
  }

  var FLEET = { items:[], selected:"", selectedApp:"", busy:false, dispatchBusy:false, focusQueued:"", appList:null, appCount:null, appBody:null,
    appStatus:null, appBulk:null, appBulkStatus:null, appNotice:"", appNoticeError:false, appsExpanded:false, appOpen:new Set(), cliOpen:new Set(), cliList:null, cliCount:null, cliTitle:null,
    cliMeta:null, cliMount:null, cliPtyStatus:null, cliStatus:null, cliBulk:null, cliBulkStatus:null, expertAppStatus:null, cliPower:null, cliRead:null, cliDisconnect:null, cliFocus:null,
    cliInput:null, cliSend:null, expertAppList:null, expertAppCount:null, expertAppOpen:new Set(), appDispatchKind:null,
    appDispatchInput:null, appDispatchSend:null, appDispatchStatus:null, appCapture:null, appCaptureImage:null, appCaptureMeta:null, appCaptureStatus:null,
    desktopCapture:{timer:null,freshnessTimer:null,controller:null,token:0,key:"",target:null,inFlight:false,windowId:0,capturedAt:0,label:"",geometry:null},
    desktopWrite:{controller:null,token:0,key:"",target:null},
    cliExpanded:"", structureKey:"", appActions:{}, bulk:{runtime:"",action:"",token:0}, appBulkState:{runtime:"",action:"",token:0}, pty:{term:null,fit:null,socket:null,key:"",loaded:null,resize:null,retry:null,manual:true,explicit:false} };

  function fleetText(tag, cls, value) { var node=el(tag,cls); node.textContent=String(value == null ? "" : value); return node; }

  function fleetKey(item) {
    return [item.machine,item.persona,item.runtime,item.host,item.session_id].map(function (value) {
      return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }).join("|");
  }

  function fleetItems(payload) {
    var groups={}, now=Date.now()/1000;
    (payload.control_machines || []).forEach(function (machine) {
      var name=String(machine.machine || "").trim(); if(!name)return;
      groups[name]={ machine:name, watcher:true, updated:Number(machine.updated || 0), slots:machine.slots || [], items:{} };
    });
    (payload.presence || []).forEach(function (row) {
      if (!(row && row.verified && row.source === "process_snapshot" && Number(row.updated || 0) >= now-35)) return;
      var name=String(row.machine || "").trim(); if(!name)return;
      var group=groups[name] || (groups[name]={machine:name,watcher:false,updated:Number(row.updated||0),slots:[],items:{}});
      var item={machine:name,persona:String(row.persona||""),runtime:String(row.runtime||""),host:String(row.host||"").toLowerCase(),
        session_id:String(row.session_id||""),pid:Number(row.pid||0),active:true,attached:row.attached===true,terminal_visible:row.terminal_visible===true,model:String(row.model||""),
        project:String(row.project||""),task:String(row.task||row.focus||""),updated:Number(row.updated||0),watcher:group.watcher};
      group.items[fleetKey(item)]=item;
    });
    Object.keys(groups).forEach(function (name) {
      var group=groups[name];
      group.slots.forEach(function (slot) {
        var item={machine:name,persona:String(slot.persona||""),runtime:String(slot.runtime||""),host:String(slot.host||"").toLowerCase(),
          session_id:String(slot.session_id||""),pid:0,active:false,attached:false,terminal_visible:false,model:"",project:"",task:"",updated:group.updated,watcher:true};
        var key=fleetKey(item); if(!group.items[key])group.items[key]=item; else group.items[key].watcher=true;
      });
      // Un equipo físico censado sigue visible aunque todavía no anuncie una
      // ranura CLI. Así Rosa/Crema no desaparecen ni se finge que pueden arrancar:
      // se muestran explícitamente "sin CLI anunciado" y todos los mandos quedan
      // bloqueados hasta que su watcher publique una identidad canónica.
      if(!Object.keys(group.items).some(function(key){return group.items[key].host==="cli";})){
        var placeholder={machine:name,persona:"Equipo",runtime:"sin CLI",host:"cli",session_id:"unconfigured",pid:0,
          active:false,attached:false,terminal_visible:false,model:"",project:"",task:"",updated:group.updated,watcher:false,placeholder:true};
        group.items[fleetKey(placeholder)]=placeholder;
      }
    });
    var rows=[]; Object.keys(groups).forEach(function(name){Object.keys(groups[name].items).forEach(function(key){rows.push(groups[name].items[key]);});});
    return rows.sort(function(a,b){return a.machine.localeCompare(b.machine,"es")||a.persona.localeCompare(b.persona,"es")||a.runtime.localeCompare(b.runtime,"es");});
  }

  // El latido cambia `updated` cada pocos segundos aunque la flota siga siendo
  // exactamente la misma. Reconstruir el DOM por ese latido borraba el elemento
  // que tenía el foco y hacía imposible escribir una frase completa. Esta firma
  // sólo cambia cuando cambia algo que la interfaz realmente debe reconstruir.
  function fleetStructureKey(items) {
    return items.map(function(item){
      return [fleetKey(item),item.pid,Number(!!item.active),Number(!!item.attached),Number(!!item.terminal_visible),Number(!!item.watcher)].join(":");
    }).join(";");
  }

  function fleetTarget(item, action) {
    var body={action:action,machine:item.machine,persona:item.persona,runtime:item.runtime,host:item.host,session_id:item.session_id};
    if(action === "stop" || action === "read" || action === "write" || action === "focus" || action === "unfocus")body.pid=item.pid;
    return body;
  }

  function fleetButton(label, cls, handler) {
    var button=el("button",cls,label); button.type="button"; button.addEventListener("click",handler); return button;
  }

  function fleetIcon(name) {
    var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.setAttribute("focusable","false");
    var paths={
      power:'<path d="M12 2v10M7.05 4.93a9 9 0 1 0 9.9 0"/>',
      play:'<path d="M8 5v14l11-7z"/>',
      reconnect:'<path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/>',
      display:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
      displayOff:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M4 3l16 16"/>'
    };
    svg.innerHTML=paths[name]||paths.display;return svg;
  }

  function setFleetIcon(button,name) {
    button.textContent="";button.appendChild(fleetIcon(name));
  }

  function desktopAppName(runtime) {
    var value=String(runtime||"").toLowerCase();
    if(value === "codex" || value === "openai" || value === "chatgpt")return "Codex";
    if(value === "claude" || value === "claude code")return "Claude";
    if(value === "opencode" || value === "open code")return "OpenCode";
    return String(runtime||"DesktopAPP");
  }

  function fleetControlRequest(item, action) {
    return ykFetch("/fleet/agent/control",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(fleetTarget(item,action))})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||("control "+response.status));return body;});})
  }

  function pollFleetAgentControl(id, deadline) {
    return ykFetch("/fleet/agent/control?id="+encodeURIComponent(id),{cache:"no-store"}).then(function(response){
      return response.json().catch(function(){return {};}).then(function(body){
        // D1 puede no ver todavía la auditoría escrita por el POST anterior.
        // Es un estado transitorio del seguimiento, no un fallo de la orden.
        if(!response.ok&&response.status===404&&body.error==="agent-control-command-not-found"){
          if(Date.now()>=deadline)throw new Error("No se pudo confirmar el resultado final de la máquina.");
          return {status:"lookup_pending"};
        }
        if(!response.ok)throw new Error(body.error||("estado "+response.status));return body;
      });
    }).then(function(body){
      if(["done","stopped","already_running","already_stopped"].includes(body.status))return body;
      if(body.status === "failed" || body.status === "rejected")throw new Error(body.error||"La máquina rechazó la orden");
      if(Date.now()>=deadline)throw new Error("La máquina sigue ejecutando la orden; no se confirmó el resultado.");
      return new Promise(function(resolve){setTimeout(resolve,750);}).then(function(){return pollFleetAgentControl(id,deadline);});
    });
  }

  function pollDesktopEvidence(path,id,deadline) {
    return ykFetch(path+"?id="+encodeURIComponent(id),{cache:"no-store"}).then(function(response){
      return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||("estado "+response.status));return body;});
    }).then(function(body){
      if(body.status==="done")return body;
      if(body.status==="failed")throw new Error(body.error||"la máquina no pudo producir evidencia");
      if(Date.now()>=deadline)throw new Error("la evidencia remota no llegó a tiempo");
      return new Promise(function(resolve){setTimeout(resolve,600);}).then(function(){return pollDesktopEvidence(path,id,deadline);});
    });
  }

  function captureDesktopEvidence(item,windowId) {
    var body=desktopCommandTarget(item);if(windowId)body.window_id=windowId;
    return ykFetch("/fleet/desktop/capture",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(data){if(!response.ok)throw new Error(data.error||("captura "+response.status));return data;});})
      .then(function(data){return pollDesktopEvidence("/fleet/desktop/capture",data.command_id,Date.now()+22000);})
      .then(function(result){
        if(!result.image||Number(result.pid)!==Number(item.pid)||!Number(result.window_id)||!Number(result.width)||!Number(result.height))throw new Error("captura sin PID, ventana o geometría exactos");
        var captured=Number(result.captured_at),now=Date.now();if(!Number.isSafeInteger(captured)||captured<now-30000||captured>now+5000)throw new Error("captured_at ausente o no fresco");
        return result;
      });
  }

  function showDesktopControlEvidence(item,result,confirmed,label) {
    if(FLEET.appCapture)FLEET.appCapture.hidden=false;
    if(FLEET.appCaptureImage&&result.image){FLEET.appCaptureImage.src=result.image;FLEET.appCaptureImage.hidden=false;FLEET.appCaptureImage.alt=(result.proof_kind==="absence_card"?"Comprobante remoto de ausencia, no captura de ventana":label+" · captura remota");}
    if(FLEET.appCaptureMeta){FLEET.appCaptureMeta.textContent="Proceso PID "+result.pid+" · ventana "+result.window_id+" · captured_at "+new Date(Number(result.captured_at)).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"});FLEET.appCaptureMeta.classList.toggle("stale",!confirmed);}
    if(FLEET.appCaptureStatus){FLEET.appCaptureStatus.textContent=(confirmed?"Confirmada":"No confirmada")+" · "+label;FLEET.appCaptureStatus.classList.toggle("error",!confirmed);}
  }

  function appActionState(item) { return FLEET.appActions[fleetKey(item)] || null; }

  function clearAppAction(key, token) {
    var state=FLEET.appActions[key];
    if(!state||state.token!==token)return;
    delete FLEET.appActions[key];renderApps();renderExpertApps();
  }

  function verifyFleetAppStart(key, token) {
    var state=FLEET.appActions[key];if(!state||state.token!==token)return;
    loadFleet().then(function(){
      state=FLEET.appActions[key];if(!state||state.token!==token)return;
      var current=FLEET.items.find(function(candidate){return fleetKey(candidate)===key;});
      if(current&&current.active&&Number(current.pid)>1&&Number(current.updated)*1000>=state.orderAt){
        captureDesktopEvidence(current,0).then(function(evidence){
          state=FLEET.appActions[key];if(!state||state.token!==token)return;
          if(Number(evidence.captured_at)<state.ackAt)throw new Error("la captura no es posterior al ACK de apertura");
          state.phase="success";state.detail="Confirmada · proceso, ventana y captura frescos";renderApps();renderExpertApps();
          showDesktopControlEvidence(current,evidence,true,"apertura posterior al ACK");
          fleetMessage(desktopAppName(state.runtime)+" abierta · Confirmada por PID "+evidence.pid+", ventana "+evidence.window_id+" y captura posterior.",false);
          setTimeout(function(){clearAppAction(key,token);},3000);
        }).catch(function(error){failFleetAppControl(key,token,error);});return;
      }
      if(Date.now()>=state.deadline){
        failFleetAppControl(key,token,new Error("No apareció un process_snapshot fresco con PID válido."));return;
      }
      setTimeout(function(){verifyFleetAppStart(key,token);},900);
    });
  }

  function failFleetAppControl(key,token,error) {
    var state=FLEET.appActions[key];if(!state||state.token!==token)return;
    state.phase="error";state.detail=error.message||String(error)||"No confirmada";renderApps();renderExpertApps();
    if(state.evidence)showDesktopControlEvidence(state.target,state.evidence,false,state.detail);
    fleetMessage(desktopAppName(state.runtime)+": No confirmada · "+state.detail,true);
    setTimeout(function(){clearAppAction(key,token);},8000);
  }

  function verifyFleetAppStop(key,token,stable) {
    var state=FLEET.appActions[key];if(!state||state.token!==token)return;
    loadFleet().then(function(){
      state=FLEET.appActions[key];if(!state||state.token!==token)return;
      var present=FLEET.items.some(function(candidate){return fleetKey(candidate)===key&&candidate.active;});
      stable=present?0:stable+1;
      if(stable<3){if(Date.now()>=state.deadline)return failFleetAppControl(key,token,new Error("La ausencia de proceso/presencia no se mantuvo estable."));setTimeout(function(){verifyFleetAppStop(key,token,stable);},900);return;}
      var evidence=state.evidence,body=Object.assign({},state.target,{window_id:evidence.window_id});
      ykFetch("/fleet/desktop/verify-close",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
        .then(function(response){return response.json().catch(function(){return {};}).then(function(data){if(!response.ok)throw new Error(data.error||("ausencia "+response.status));return data;});})
        .then(function(data){return pollDesktopEvidence("/fleet/desktop/verify-close",data.command_id,Date.now()+32000);})
        .then(function(result){
          state=FLEET.appActions[key];if(!state||state.token!==token)return;
          if(result.process_present||result.window_present||Number(result.same_slot_processes)!==0||Number(result.matching_windows)!==0||Number(result.stable_samples)<3||Number(result.stable_ms)<5000||result.proof_kind!=="absence_card"||Number(result.captured_at)<state.ackAt)throw new Error("la evidencia posterior no demuestra ausencia estable");
          state.phase="success";state.detail="Confirmada · proceso, ventana y presencia ausentes";renderApps();renderExpertApps();
          showDesktopControlEvidence(state.target,result,true,"cierre · proceso y ventana ausentes");
          fleetMessage(desktopAppName(state.runtime)+" cerrada · Confirmada por ACK, ausencia estable y comprobante remoto posterior.",false);
          setTimeout(function(){clearAppAction(key,token);},3000);
        }).catch(function(error){failFleetAppControl(key,token,error);});
    });
  }

  function fleetAppControl(item, action) {
    var key=fleetKey(item);if(FLEET.appActions[key])return;
    if(action === "stop" && !window.confirm("Cerrar " + desktopAppName(item.runtime) + " de " + item.persona + " en " + item.machine + " (PID " + item.pid + ")?"))return;
    var token=Date.now();FLEET.appActions[key]={action:action,token:token,orderAt:token,deadline:token+(action==="stop"?65000:30000),phase:"pending",runtime:item.runtime};
    renderApps();renderExpertApps();
    fleetMessage((action === "start" ? "Abriendo " : "Cerrando ") + desktopAppName(item.runtime) + " en " + item.machine + " · verificando el proceso real…",false);
    var preflight=action==="stop"?captureDesktopEvidence(item,FLEET.desktopCapture.key===key?FLEET.desktopCapture.windowId:0):Promise.resolve(null);
    preflight.then(function(evidence){
      var state=FLEET.appActions[key];if(!state||state.token!==token)return Promise.reject(new Error("control cancelado"));
      state.evidence=evidence;state.target=desktopCommandTarget(item);
      if(action==="stop"){stopDesktopCapture(true,"Vista detenida tras recoger evidencia previa.");stopDesktopWrite();showDesktopControlEvidence(item,evidence,false,"cierre pendiente de ACK y ausencia");}
      return fleetControlRequest(item,action);
    }).then(function(result){
      if(result.status==="already_running"||result.status==="already_stopped")return result;
      var active=FLEET.appActions[key];return pollFleetAgentControl(result.command_id,active?active.deadline:token+30000);
    }).then(function(){
      var state=FLEET.appActions[key];if(!state||state.token!==token)return;
      state.ackAt=Date.now();
      setTimeout(function(){if(action==="start")verifyFleetAppStart(key,token);else verifyFleetAppStop(key,token,0);},650);
    }).catch(function(error){failFleetAppControl(key,token,error);});
  }

  function fleetControl(item, action) {
    if(item.host === "app"){fleetAppControl(item,action);return;}
    if(FLEET.busy)return;
    if(action === "stop" && !window.confirm("Detener " + item.persona + " · " + item.runtime + " en " + item.machine + " (PID " + item.pid + ")?"))return;
    FLEET.busy=true; fleetMessage((action === "start" ? "Arrancando " : "Deteniendo ") + item.persona + " en " + item.machine + "…",false);
    fleetControlRequest(item,action)
      .then(function(){setTimeout(loadFleet,2200);}).catch(function(error){fleetMessage(error.message||"No se pudo enviar la orden",true);})
      .finally(function(){FLEET.busy=false;refreshFleetControls();});
  }

  function bulkAppGroups(runtime) {
    var groups={};
    FLEET.items.filter(function(item){return item.host === "app"&&item.watcher&&desktopAppName(item.runtime)===runtime;}).forEach(function(item){
      var key=item.machine+"|"+runtime;(groups[key]||(groups[key]=[])).push(item);
    });
    return Object.keys(groups).map(function(key){return groups[key];});
  }

  function bulkAppTargets(runtime, action) {
    return bulkAppGroups(runtime).flatMap(function(group){
      var active=group.filter(function(item){return item.active;});
      if(action === "stop")return active;
      if(active.length)return [];
      var canonical=group.find(function(item){return item.watcher;});
      return canonical?[canonical]:[];
    });
  }

  function appBulkMessage(message,error) {
    FLEET.appNotice=String(message||"");FLEET.appNoticeError=!!error;renderAppBulkControls();
    if(FLEET.appStatus){FLEET.appStatus.textContent=FLEET.appNotice;FLEET.appStatus.classList.toggle("error",FLEET.appNoticeError);}
  }

  function verifyAppBulkControl(token,runtime,action,pass) {
    if(FLEET.appBulkState.token!==token)return;
    loadFleet().then(function(){
      var groups=bulkAppGroups(runtime),active=groups.filter(function(group){return group.some(function(item){return item.active;});}).length;
      var pending=action === "start" ? active<groups.length : active>0;
      if(pending&&pass<3){
        var targets=bulkAppTargets(runtime,action);FLEET.busy=true;refreshFleetControls();
        appBulkMessage(runtime+": pasada "+(pass+1)+" sobre "+targets.length+" aplicaciones aún "+(action === "start"?"cerradas":"abiertas")+"…",false);
        Promise.allSettled(targets.map(function(item){return fleetControlRequest(item,action);})).finally(function(){
          FLEET.busy=false;refreshFleetControls();setTimeout(function(){verifyAppBulkControl(token,runtime,action,pass+1);},8000);
        });
        return;
      }
      var ok=action === "start" ? active===groups.length : active===0;
      appBulkMessage(runtime+": "+active+"/"+groups.length+" abiertas tras "+pass+" pasada"+(pass===1?"":"s")+(ok?".":" · revisión necesaria."),!ok);
      FLEET.appBulkState={runtime:"",action:"",token:token};renderAppBulkControls();
    });
  }

  function bulkAppControl(runtime, action) {
    if(FLEET.busy || FLEET.appBulkState.runtime)return;
    var targets=bulkAppTargets(runtime,action);
    if(!targets.length){appBulkMessage("No hay DesktopAPP "+runtime+" que "+(action === "start"?"abrir":"cerrar")+".",false);return;}
    if(action === "stop" && !window.confirm("Cerrar las "+targets.length+" DesktopAPP "+runtime+" abiertas en los equipos?"))return;
    var token=Date.now();FLEET.appBulkState={runtime:runtime,action:action,token:token};FLEET.busy=true;refreshFleetControls();
    appBulkMessage((action === "start"?"Abriendo":"Cerrando")+" "+targets.length+" DesktopAPP "+runtime+"…",false);
    Promise.allSettled(targets.map(function(item){return fleetControlRequest(item,action);})).then(function(results){
      var accepted=results.filter(function(result){return result.status === "fulfilled";}).length;
      var failures=results.length-accepted;
      appBulkMessage(runtime+": "+accepted+" órdenes aceptadas"+(failures?" · "+failures+" rechazadas":"")+" · verificando procesos reales…",failures>0);
    }).catch(function(error){appBulkMessage(error.message||"Falló el control global de DesktopAPP "+runtime,true);})
      .finally(function(){
        FLEET.busy=false;refreshFleetControls();
        setTimeout(loadFleet,3000);
        setTimeout(function(){verifyAppBulkControl(token,runtime,action,1);},12000);
      });
  }

  function bulkCliGroups(runtime) {
    var groups={};
    FLEET.items.filter(function(item){return item.host === "cli"&&!item.placeholder&&item.watcher&&item.runtime===runtime;}).forEach(function(item){
      var persona=String(item.persona||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
      var key=item.machine+"|"+persona+"|"+runtime;(groups[key]||(groups[key]=[])).push(item);
    });
    return Object.keys(groups).map(function(key){return groups[key];});
  }

  function bulkCliTargets(runtime, action) {
    return bulkCliGroups(runtime).flatMap(function(group){
      var active=group.filter(function(item){return item.active;});
      if(action === "stop")return active;
      if(active.length)return [];
      var canonical=group.find(function(item){
        var persona=String(item.persona||"").toLowerCase();
        return runtime === "Grok" ? item.session_id === "smith" : runtime === "Claude" ? item.session_id === (persona.indexOf("morfeo")===0?"morfeo":"neo") : item.session_id === (persona.indexOf("trinity")===0?"trinity":"oraculo");
      });
      return canonical?[canonical]:(group[0]?[group[0]]:[]);
    });
  }

  function verifyBulkControl(token,runtime,action,pass) {
    if(FLEET.bulk.token!==token)return;
    loadFleet().then(function(){
      var groups=bulkCliGroups(runtime),active=groups.filter(function(group){return group.some(function(item){return item.active;});}).length;
      var pending=action === "start" ? active<groups.length : active>0;
      if(pending&&pass<3){
        var targets=bulkCliTargets(runtime,action);FLEET.busy=true;refreshFleetControls();
        fleetMessage(runtime+": pasada "+(pass+1)+" sobre "+targets.length+" sesiones aún "+(action === "start"?"paradas":"activas")+"…",false);
        Promise.allSettled(targets.map(function(item){return fleetControlRequest(item,action);})).finally(function(){
          FLEET.busy=false;refreshFleetControls();setTimeout(function(){verifyBulkControl(token,runtime,action,pass+1);},8000);
        });
        return;
      }
      var ok=action === "start" ? active===groups.length : active===0;
      fleetMessage(runtime+": "+active+"/"+groups.length+" activos tras "+pass+" pasada"+(pass===1?"":"s")+(ok?".":" · revisión necesaria."),!ok);
      FLEET.bulk={runtime:"",action:"",token:token};renderBulkControls();
    });
  }

  function bulkFleetControl(runtime, action) {
    if(FLEET.busy || FLEET.bulk.runtime)return;
    var targets=bulkCliTargets(runtime,action);
    if(!targets.length){fleetMessage("No hay "+runtime+" que "+(action === "start"?"arrancar":"detener")+".",false);return;}
    if(action === "stop" && !window.confirm("Detener los "+targets.length+" agentes "+runtime+" activos en la flota?"))return;
    var token=Date.now();FLEET.bulk={runtime:runtime,action:action,token:token};FLEET.busy=true;renderBulkControls();refreshFleetControls();
    fleetMessage((action === "start"?"Arrancando":"Deteniendo")+" "+targets.length+" agentes "+runtime+"…",false);
    Promise.allSettled(targets.map(function(item){return fleetControlRequest(item,action);})).then(function(results){
      var accepted=results.filter(function(result){return result.status === "fulfilled";}).length;
      var failures=results.length-accepted;
      fleetMessage(runtime+": "+accepted+" órdenes aceptadas"+(failures?" · "+failures+" rechazadas":"")+" · verificando presencia real…",failures>0);
    }).catch(function(error){fleetMessage(error.message||"Falló el control global de "+runtime,true);})
      .finally(function(){
        FLEET.busy=false;refreshFleetControls();renderBulkControls();
        setTimeout(loadFleet,3000);
        setTimeout(function(){verifyBulkControl(token,runtime,action,1);},16000);
      });
  }

  function fleetMessage(message,error) {
    [FLEET.appStatus,FLEET.cliStatus,FLEET.cliBulkStatus,FLEET.expertAppStatus].forEach(function(status){
      if(!status)return;status.textContent=String(message||"");status.classList.toggle("error",!!error);
    });
  }

  function selectedCli() {
    return FLEET.items.find(function(item){return item.host === "cli" && fleetKey(item) === FLEET.selected;}) || null;
  }

  function selectedDesktopApp() {
    return FLEET.items.find(function(item){return item.host === "app" && fleetKey(item) === FLEET.selectedApp;}) || null;
  }

  function cliCountLabel(items) {
    var real=items.filter(function(item){return !item.placeholder;}),pending=items.length-real.length;
    return real.filter(function(item){return item.active;}).length+"/"+real.length+" vivos"+(pending?(" · "+pending+" equipos sin CLI"):"");
  }

  function refreshFleetControls() {
    var item=selectedCli(),active=!!(item&&item.active);
    if(FLEET.cliPower)FLEET.cliPower.disabled=FLEET.busy||(!active&&!(item&&item.watcher));
    if(FLEET.cliRead)FLEET.cliRead.disabled=!active||FLEET.busy;
    if(FLEET.cliFocus)FLEET.cliFocus.disabled=!active||FLEET.busy;
    if(FLEET.cliInput)FLEET.cliInput.disabled=!active;
    if(FLEET.cliSend)FLEET.cliSend.disabled=!active||FLEET.busy;
    refreshDesktopDispatch();
    renderBulkControls();renderAppBulkControls();
  }

  function desktopDispatchLabel(kind) {
    return kind === "task" ? "Tarea" : kind === "objective" ? "Objetivo" : "Misión";
  }

  function desktopCommandTarget(item) {
    return {machine:item.machine,persona:item.persona,runtime:item.runtime,host:"app",session_id:item.session_id,pid:item.pid};
  }

  function sameDesktopCommandTarget(item,target) {
    return !!item&&!!target&&item.machine===target.machine&&item.persona===target.persona&&item.runtime===target.runtime&&item.host===target.host&&item.session_id===target.session_id&&Number(item.pid)===Number(target.pid);
  }

  function desktopCommandPoll(path,id,deadline,token,key,write) {
    var state=write?FLEET.desktopWrite:FLEET.desktopCapture;
    if(state.token!==token||state.key!==key)return Promise.reject(new Error(write?"entrega cancelada":"captura cancelada"));
    return ykFetch(path+"?id="+encodeURIComponent(id),{cache:"no-store",signal:state.controller&&state.controller.signal})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||("estado "+response.status));return body;});})
      .then(function(body){
        if(state.token!==token||state.key!==key)throw new Error(write?"entrega cancelada":"captura cancelada");
        if(body.status==="done"||body.status==="failed")return body;
        if(Date.now()>=deadline)throw new Error("la ventana no respondió a tiempo");
        return new Promise(function(resolve){setTimeout(resolve,600);}).then(function(){return desktopCommandPoll(path,id,deadline,token,key,write);});
      });
  }

  function paintDesktopCaptureFreshness() {
    var state=FLEET.desktopCapture;if(!FLEET.appCaptureMeta)return;
    if(!state.capturedAt){FLEET.appCaptureMeta.textContent="Sin captura todavía";return;}
    var age=Math.max(0,Math.floor((Date.now()-state.capturedAt)/1000));
    FLEET.appCaptureMeta.textContent="Capturada "+new Date(state.capturedAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+" · hace "+age+" s";
    FLEET.appCaptureMeta.classList.toggle("stale",age>15);
  }

  function clearDesktopCaptureRemote(target) {
    if(!target)return;
    ykFetch("/fleet/desktop/capture/clear",{method:"POST",cache:"no-store",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify(target)}).catch(function(){});
  }

  function stopDesktopCapture(clearRemote,reason) {
    var state=FLEET.desktopCapture,oldTarget=state.target;
    state.token++;state.key="";state.target=null;state.inFlight=false;state.windowId=0;state.capturedAt=0;state.label="";
    if(state.timer){clearTimeout(state.timer);state.timer=null;}if(state.freshnessTimer){clearInterval(state.freshnessTimer);state.freshnessTimer=null;}
    if(state.controller){try{state.controller.abort();}catch(e){}state.controller=null;}
    if(clearRemote&&oldTarget)clearDesktopCaptureRemote(oldTarget);
    if(FLEET.appCaptureImage){FLEET.appCaptureImage.removeAttribute("src");FLEET.appCaptureImage.hidden=true;}
    if(FLEET.appCaptureMeta){FLEET.appCaptureMeta.textContent="Sin captura todavía";FLEET.appCaptureMeta.classList.remove("stale");}
    if(FLEET.appCaptureStatus)FLEET.appCaptureStatus.textContent=reason||"Vista desconectada";
  }

  function stopDesktopWrite() {
    var state=FLEET.desktopWrite;state.token++;state.key="";state.target=null;
    if(state.controller){try{state.controller.abort();}catch(e){}state.controller=null;}
  }

  function desktopCaptureTarget(token,key) {
    var item=selectedDesktopApp();
    return FLEET.desktopCapture.token===token&&FLEET.desktopCapture.key===key&&isOpen("bottom")&&item&&item.active&&fleetKey(item)===key&&sameDesktopCommandTarget(item,FLEET.desktopCapture.target)?item:null;
  }

  function scheduleDesktopCapture(token,key) {
    var state=FLEET.desktopCapture;if(!desktopCaptureTarget(token,key))return stopDesktopCapture(true,"Vista detenida: la app ya no está conectada.");
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(function(){state.timer=null;requestDesktopCapture(token,key);},10000);
  }

  function requestDesktopCapture(token,key) {
    var state=FLEET.desktopCapture,item=desktopCaptureTarget(token,key);if(!item)return stopDesktopCapture(true,"Vista detenida: cambió la app seleccionada.");
    if(state.inFlight)return;state.inFlight=true;state.controller=typeof AbortController==="function"?new AbortController():null;
    if(FLEET.appCaptureStatus){FLEET.appCaptureStatus.textContent=state.capturedAt?"Actualizando la ventana…":"Capturando la ventana ahora…";FLEET.appCaptureStatus.classList.remove("error");}
    var body=desktopCommandTarget(item);if(state.windowId)body.window_id=state.windowId;
    ykFetch("/fleet/desktop/capture",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:state.controller&&state.controller.signal})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(data){if(!response.ok)throw new Error(data.error||("captura "+response.status));return data;});})
      .then(function(data){return desktopCommandPoll("/fleet/desktop/capture",data.command_id,Date.now()+22000,token,key,false);})
      .then(function(result){
        if(!desktopCaptureTarget(token,key))return;
        if(result.status!=="done"||!result.image){var terminalError=new Error(result.error||"la máquina no entregó una captura");terminalError.desktopCaptureTerminal=true;throw terminalError;}
        if(state.windowId&&Number(result.window_id)!==state.windowId)throw new Error("la ventana cambió durante el seguimiento");
        var captured=Number(result.captured_at),now=Date.now();if(!Number.isSafeInteger(captured)||captured<now-30000||captured>now+5000)throw new Error("captured_at ausente o no fresco");
        state.windowId=Number(result.window_id)||0;state.capturedAt=captured;
        FLEET.appCaptureImage.src=result.image;FLEET.appCaptureImage.alt="Ventana de "+state.label+" tras recibir el encargo";FLEET.appCaptureImage.hidden=false;
        FLEET.appCaptureStatus.textContent="Ventana conectada · siguiente captura en 10 s";FLEET.appCaptureStatus.classList.remove("error");
        paintDesktopCaptureFreshness();if(!state.freshnessTimer)state.freshnessTimer=setInterval(paintDesktopCaptureFreshness,1000);
      }).catch(function(error){
        if(!desktopCaptureTarget(token,key))return;
        if(error&&error.desktopCaptureTerminal){
          stopDesktopCapture(true,"Captura detenida: "+(error.message||error)+" · reconecta la Desktop App.");
          if(FLEET.appCaptureStatus)FLEET.appCaptureStatus.classList.add("error");
          return;
        }
        FLEET.appCaptureStatus.textContent="Captura fallida: "+(error.message||error)+" · reintento en 10 s";FLEET.appCaptureStatus.classList.add("error");
      }).finally(function(){
        if(FLEET.desktopCapture.token!==token||FLEET.desktopCapture.key!==key)return;
        state.inFlight=false;state.controller=null;scheduleDesktopCapture(token,key);
      });
  }

  function startDesktopCapture(item,label) {
    stopDesktopCapture(true,"");var state=FLEET.desktopCapture,key=fleetKey(item),token=state.token+1;
    state.token=token;state.key=key;state.target=desktopCommandTarget(item);state.label=item.persona+" · "+desktopAppName(item.runtime);state.windowId=0;state.capturedAt=0;
    if(FLEET.appCapture)FLEET.appCapture.hidden=false;
    if(FLEET.appCaptureStatus){FLEET.appCaptureStatus.textContent=label+" entregada · primera captura inmediata";FLEET.appCaptureStatus.classList.remove("error");}
    requestDesktopCapture(token,key);
  }

  function refreshDesktopDispatch() {
    var item=selectedDesktopApp(),ready=!!(item&&item.active),hasText=!!(FLEET.appDispatchInput&&FLEET.appDispatchInput.value.trim());
    if(FLEET.appDispatchInput)FLEET.appDispatchInput.disabled=!ready||FLEET.dispatchBusy;
    if(FLEET.appDispatchKind)FLEET.appDispatchKind.disabled=!ready||FLEET.dispatchBusy;
    if(FLEET.appDispatchSend)FLEET.appDispatchSend.disabled=!ready||!hasText||FLEET.dispatchBusy;
  }

  function desktopDispatch() {
    var item=selectedDesktopApp(),text=FLEET.appDispatchInput&&FLEET.appDispatchInput.value.trim();
    if(!item||!text||FLEET.dispatchBusy)return;
    var kind=FLEET.appDispatchKind.value,label=desktopDispatchLabel(kind),appName=desktopAppName(item.runtime);
    FLEET.dispatchBusy=true;refreshDesktopDispatch();
    FLEET.appDispatchStatus.textContent="// enviando "+label.toLowerCase()+" a "+item.persona+" · "+appName+"…";
    FLEET.appDispatchStatus.classList.remove("error");
    stopDesktopCapture(true,"Vista detenida: enviando un nuevo encargo.");stopDesktopWrite();
    var targetKey=fleetKey(item),writeState=FLEET.desktopWrite,token=writeState.token+1;writeState.token=token;writeState.key=targetKey;writeState.target=desktopCommandTarget(item);writeState.controller=typeof AbortController==="function"?new AbortController():null;
    ykFetch("/fleet/desktop/write",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},signal:writeState.controller&&writeState.controller.signal,body:JSON.stringify(Object.assign(desktopCommandTarget(item),{
      text:"["+label.toUpperCase()+" · DESKTOPAPP]\n"+text
    }))}).then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(!response.ok||body.ok===false)throw new Error(body.error||("dispatch "+response.status));return body;});})
      .then(function(body){
        if(!sameDesktopCommandTarget(selectedDesktopApp(),writeState.target))throw new Error("cambió la Desktop App seleccionada");
        return desktopCommandPoll("/fleet/desktop/write",body.command_id,Date.now()+22000,token,targetKey,true);
      }).then(function(result){
        if(result.status!=="done"||result.delivered!==true)throw new Error(result.error||"la ventana no confirmó la entrega");
        if(FLEET.appDispatchInput.value===text)FLEET.appDispatchInput.value="";
        FLEET.appDispatchStatus.textContent="// "+label.toLowerCase()+" entregada a "+item.persona+" · "+appName+" en "+item.machine;
        startDesktopCapture(item,label);
      }).catch(function(error){stopDesktopCapture(true,"Vista detenida: la entrega no se confirmó.");FLEET.appDispatchStatus.textContent="// error al enviar: "+(error.message||error);FLEET.appDispatchStatus.classList.add("error");})
      .finally(function(){if(writeState.token===token){writeState.controller=null;writeState.key="";writeState.target=null;}FLEET.dispatchBusy=false;refreshDesktopDispatch();});
  }

  function renderAppBulkControls() {
    if(!FLEET.appBulk)return;FLEET.appBulk.textContent="";
    FLEET.appBulk.appendChild(fleetText("b","yk-app-bulk-title","Control global DesktopAPP"));
    [["Codex","Codex"],["Claude","Claude Code"],["OpenCode","OpenCode"]].forEach(function(config){
      var runtime=config[0],label=config[1],groups=bulkAppGroups(runtime),active=groups.filter(function(group){return group.some(function(item){return item.active;});}).length,pending=FLEET.appBulkState.runtime===runtime,row=el("div","yk-app-bulk-row");
      var copy=el("span","yk-app-bulk-copy");copy.appendChild(fleetText("b",null,label));copy.appendChild(fleetText("small",active?"live":"",active+"/"+groups.length+" abiertas"));row.appendChild(copy);
      var start=fleetButton("","yk-app-bulk-action",function(){bulkAppControl(runtime,"start");});setFleetIcon(start,"play");start.title="Abrir todas las DesktopAPP "+label;start.setAttribute("aria-label",start.title);start.disabled=FLEET.busy||pending||groups.length===0||active===groups.length;row.appendChild(start);
      var stop=fleetButton("","yk-app-bulk-action danger",function(){bulkAppControl(runtime,"stop");});setFleetIcon(stop,"power");stop.title="Cerrar todas las DesktopAPP "+label;stop.setAttribute("aria-label",stop.title);stop.disabled=FLEET.busy||pending||active===0;row.appendChild(stop);
      FLEET.appBulk.appendChild(row);
    });
    FLEET.appBulkStatus=fleetText("p","yk-app-bulk-status"+(FLEET.appNoticeError?" error":""),FLEET.appNotice);FLEET.appBulkStatus.setAttribute("role","status");FLEET.appBulk.appendChild(FLEET.appBulkStatus);
  }

  function renderBulkControls() {
    if(!FLEET.cliBulk)return;FLEET.cliBulk.textContent="";
    FLEET.cliBulk.appendChild(fleetText("b","yk-cli-bulk-title","Control global por agente"));
    ["Claude","Codex","Grok"].forEach(function(runtime){
      var groups=bulkCliGroups(runtime),active=groups.filter(function(group){return group.some(function(item){return item.active;});}).length,pending=FLEET.bulk.runtime===runtime,row=el("div","yk-cli-bulk-row");
      var copy=el("span","yk-cli-bulk-copy");copy.appendChild(fleetText("b",null,runtime));copy.appendChild(fleetText("small",active?"live":"",active+"/"+groups.length+" activos"));row.appendChild(copy);
      var start=fleetButton("","yk-cli-bulk-action",function(){bulkFleetControl(runtime,"start");});setFleetIcon(start,"play");start.title="Arrancar todos los "+runtime;start.setAttribute("aria-label",start.title);start.disabled=FLEET.busy||pending||active===groups.length;row.appendChild(start);
      var stop=fleetButton("","yk-cli-bulk-action danger",function(){bulkFleetControl(runtime,"stop");});setFleetIcon(stop,"power");stop.title="Detener todos los "+runtime;stop.setAttribute("aria-label",stop.title);stop.disabled=FLEET.busy||pending||active===0;row.appendChild(stop);
      FLEET.cliBulk.appendChild(row);
    });
  }

  function paintSelectedCli() {
    var selected=selectedCli();
    if(!selected){
      FLEET.cliTitle.textContent="Sin conexión";FLEET.cliMeta.textContent="Selecciona un CLI y pulsa conectar";
      if(FLEET.cliInput){FLEET.cliInput.placeholder="Sin conexión a terminal";FLEET.cliInput.disabled=true;}
      if(FLEET.cliSend)FLEET.cliSend.disabled=true;
      ptyState("Sin conexión · ningún PTY seleccionado",false);refreshFleetControls();return;
    }
    if(selected.placeholder){
      FLEET.cliTitle.textContent=selected.machine;
      FLEET.cliMeta.textContent="Equipo censado · sin identidad CLI anunciada por su watcher";
      if(FLEET.pty.key)disconnectSelectedPty(false);
      ptyState("Sin PTY: enciende o registra primero un CLI canónico en este equipo.",false);
      refreshFleetControls();return;
    }
    FLEET.cliTitle.textContent=selected.persona+" · "+selected.runtime;
    FLEET.cliMeta.textContent=selected.machine+" · "+(selected.active?("PID "+selected.pid+" · tmux:"+selected.session_id):"sesión parada")+" · PTY en vivo con xterm.js";
    if(FLEET.cliInput)FLEET.cliInput.placeholder="Mensaje para "+selected.persona+" en "+selected.machine;
    refreshFleetControls();
    if(!selected.active&&FLEET.pty.key){disconnectSelectedPty(false);ptyState("Sesión parada; el PTY no acepta entrada.",false);}
  }

  function loadPtyAssets() {
    if(FLEET.pty.loaded)return FLEET.pty.loaded;
    FLEET.pty.loaded=new Promise(function(resolve,reject){
      if(!document.querySelector('link[data-yk-xterm]')){
        var css=document.createElement("link");css.rel="stylesheet";css.href="/vendor/xterm-6.0.0.css";css.setAttribute("data-yk-xterm","1");document.head.appendChild(css);
      }
      function script(src,done){var old=document.querySelector('script[src="'+src+'"]');if(old){if(old.getAttribute("data-loaded")==="1")return done();old.addEventListener("load",done,{once:true});old.addEventListener("error",reject,{once:true});return;}var node=document.createElement("script");node.src=src;node.addEventListener("load",function(){node.setAttribute("data-loaded","1");done();},{once:true});node.addEventListener("error",reject,{once:true});document.head.appendChild(node);}
      script("/vendor/xterm-6.0.0.js",function(){script("/vendor/xterm-addon-fit-0.11.0.js",function(){if(window.Terminal&&window.FitAddon&&window.FitAddon.FitAddon)resolve();else reject(new Error("xterm no disponible"));});});
    });
    return FLEET.pty.loaded;
  }

  function bytesToBase64(bytes){var binary="",chunk=8192;for(var i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
  function base64ToBytes(value){var binary=atob(String(value||"")),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
  function ptySend(message){var socket=FLEET.pty.socket;if(socket&&socket.readyState===1)try{socket.send(JSON.stringify(message));}catch(e){}}
  function ptyState(text,error){if(FLEET.cliPtyStatus){FLEET.cliPtyStatus.textContent=text;FLEET.cliPtyStatus.classList.toggle("error",!!error);}}

  function ensurePtyTerminal() {
    if(FLEET.pty.term||!FLEET.cliMount)return;
    var term=new window.Terminal({cursorBlink:false,convertEol:false,scrollback:5000,allowProposedApi:false,disableStdin:true,
      fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',fontSize:12,lineHeight:1.12,
      theme:{background:"#02080d",foreground:"#bfe6df",cursor:"#78f3ff",selectionBackground:"#245064"}});
    var fit=new window.FitAddon.FitAddon();term.loadAddon(fit);term.open(FLEET.cliMount);FLEET.pty.term=term;FLEET.pty.fit=fit;
    term.onResize(function(size){ptySend({type:"resize",cols:size.cols,rows:size.rows});});
    if(window.ResizeObserver){FLEET.pty.resize=new ResizeObserver(function(){try{fit.fit();}catch(e){}});FLEET.pty.resize.observe(FLEET.cliMount);}
    setTimeout(function(){try{fit.fit();}catch(e){}},0);
  }

  function disconnectSelectedPty(manual) {
    FLEET.pty.manual=manual!==false;if(manual!==false)FLEET.pty.explicit=false;if(FLEET.pty.retry){clearTimeout(FLEET.pty.retry);FLEET.pty.retry=null;}
    var socket=FLEET.pty.socket;FLEET.pty.socket=null;FLEET.pty.key="";
    if(socket)try{socket.close(1000,"panel closed");}catch(e){}
    if(manual!==false){
      FLEET.selected="";FLEET.cliExpanded="";
      if(FLEET.pty.term)try{FLEET.pty.term.reset();}catch(e){}
      if(FLEET.cliTitle)FLEET.cliTitle.textContent="Sin conexión";
      if(FLEET.cliMeta)FLEET.cliMeta.textContent="Selecciona un CLI y pulsa conectar";
      ptyState("Sin conexión · ningún PTY seleccionado",false);
    }
  }

  function connectSelectedPty(force) {
    var item=selectedCli();if(!item||!item.active||!isOpen("bottom")||!FLEET.cliMount)return Promise.resolve();
    FLEET.pty.explicit=true;
    var key=fleetKey(item)+"|"+item.pid;
    if(!force&&FLEET.pty.key===key&&FLEET.pty.socket&&(FLEET.pty.socket.readyState===0||FLEET.pty.socket.readyState===1))return Promise.resolve();
    var sameSession=FLEET.pty.key===key&&!!FLEET.pty.term;
    disconnectSelectedPty(false);FLEET.pty.key=key;FLEET.pty.manual=false;ptyState("Abriendo el PTY verificado de "+item.machine+"…",false);
    return loadPtyAssets().then(function(){
      ensurePtyTerminal();if(FLEET.pty.term&&!sameSession){FLEET.pty.term.reset();FLEET.pty.term.write("\u001b[36mConectando a tmux:"+item.session_id+"…\u001b[0m\r\n");}
      return ykFetch("/fleet/pty/ticket",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(fleetTarget(item,"read"))});
    }).then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||("ticket "+response.status));return body;});})
      .then(function(body){
        if(FLEET.pty.key!==key)return;var socket=new WebSocket(body.url);FLEET.pty.socket=socket;
        socket.addEventListener("open",function(){ptyState("Canal seguro abierto; esperando el puente del equipo…",false);try{FLEET.pty.fit.fit();}catch(e){}});
        socket.addEventListener("message",function(event){
          var message;try{message=JSON.parse(event.data);}catch(e){return;}
          if(message.type==="output"&&FLEET.pty.term)FLEET.pty.term.write(base64ToBytes(message.data));
          else if(message.type==="status")ptyState(message.text||message.state,message.state==="error");
          else if(message.type==="title"&&message.text)FLEET.pty.term&&FLEET.pty.term.setOption&&FLEET.pty.term.setOption("title",message.text);
          else if(message.type==="bell")try{FLEET.pty.term&&FLEET.pty.term.bell();}catch(e){}
        });
        socket.addEventListener("close",function(){
          if(FLEET.pty.socket!==socket)return;
          FLEET.pty.socket=null;
          if(FLEET.pty.manual||!FLEET.pty.explicit||FLEET.pty.key!==key||!isOpen("bottom"))return;
          ptyState("PTY interrumpido; reconectando…",true);FLEET.pty.retry=setTimeout(function(){connectSelectedPty(true);},1800);
        });
        socket.addEventListener("error",function(){ptyState("No se pudo abrir el espejo PTY",true);});
      }).catch(function(error){
        if(FLEET.pty.explicit&&FLEET.pty.key===key){ptyState("PTY no disponible: "+(error.message||error),true);FLEET.pty.retry=setTimeout(function(){connectSelectedPty(true);},3000);}
      });
  }

  function pollTerminal(id, deadline) {
    return ykFetch("/fleet/cli/terminal?id="+encodeURIComponent(id),{cache:"no-store"}).then(function(response){
      return response.json().catch(function(){return {};}).then(function(body){if(!response.ok)throw new Error(body.error||("estado "+response.status));return body;});
    }).then(function(body){
      if(body.status === "done" || body.status === "failed")return body;
      if(Date.now() >= deadline)throw new Error("La orden sigue en proceso; vuelve a comprobar en unos segundos.");
      return new Promise(function(resolve){setTimeout(resolve,800);}).then(function(){return pollTerminal(id,deadline);});
    });
  }

  function terminalAction(action, text) {
    var item=selectedCli(); if(!item || !item.active)return Promise.resolve();
    if(FLEET.busy){
      if(action === "focus" || action === "unfocus"){
        FLEET.focusQueued=action;
        fleetMessage((action === "focus"?"Mostrar":"Dejar de mostrar")+" en equipo queda preparado; se ejecutará al terminar la orden actual.",false);
      }
      return Promise.resolve();
    }
    var targetKey=fleetKey(item);
    var sentText=String(text||"");
    FLEET.busy=true; fleetMessage(action === "focus" ? "Mostrando esta sesión en la Terminal del equipo…" : action === "unfocus" ? "Dejando de mostrar esta sesión en el equipo…" : action === "write" ? "Enviando el mensaje al agente…" : "Leyendo la misma sesión…",false);
    var body=fleetTarget(item,action);
    if(action === "write")body.text=sentText;
    return ykFetch("/fleet/cli/terminal",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
      .then(function(response){return response.json().catch(function(){return {};}).then(function(data){if(!response.ok)throw new Error(data.error||("terminal "+response.status));return data;});})
      .then(function(data){return pollTerminal(data.command_id,Date.now()+30000);})
      .then(function(result){
        if(result.status === "failed")throw new Error(result.error||"La sesión rechazó la orden");
        if(result.output&&FLEET.pty.term&&FLEET.selected===targetKey&&(!FLEET.pty.socket||FLEET.pty.socket.readyState!==1)){FLEET.pty.term.reset();FLEET.pty.term.write(new TextEncoder().encode(result.output.replace(/\n/g,"\r\n")));}
        if(action === "focus" || action === "unfocus"){
          item.terminal_visible=action === "focus";
          fleetMessage(action === "focus"?("Terminal del equipo conectada a tmux:"+item.session_id+"."):"La sesión sigue activa y ya no se muestra en la Terminal del equipo.",false);
          setTimeout(loadFleet,1200);
        }
        else if(action === "write"){
          if(FLEET.cliInput&&FLEET.cliInput.value===sentText)FLEET.cliInput.value="";
          fleetMessage("Mensaje entregado a "+item.persona+" · "+new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),false);
        } else fleetMessage("Sesión sincronizada · "+new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),false);
      }).catch(function(error){fleetMessage(error.message||"No se pudo comunicar con la sesión",true);})
      .finally(function(){
        // El PTY/xterm no se reconstruye: conserva foco, composición y cursor.
        FLEET.busy=false;refreshFleetControls();
        if(FLEET.focusQueued){var queued=FLEET.focusQueued;FLEET.focusQueued="";setTimeout(function(){terminalAction(queued);},0);}
      });
  }

  function renderApps() {
    if(!FLEET.appList)return; FLEET.appList.textContent="";
    var apps=FLEET.items.filter(function(item){return item.host === "app";});
    FLEET.appCount.textContent=apps.filter(function(item){return item.active;}).length+"/"+apps.length+" vivas";
    if(!apps.length){FLEET.appList.appendChild(el("p","yk-fleet-empty","Sin DesktopAPP observadas."));return;}
    var groups={};apps.forEach(function(item){(groups[item.machine]||(groups[item.machine]=[])).push(item);});
    Object.keys(groups).sort(function(a,b){return a.localeCompare(b,"es");}).forEach(function(machine,index){
      var items=groups[machine].sort(function(a,b){return Number(b.active)-Number(a.active)||a.persona.localeCompare(b.persona,"es")||a.runtime.localeCompare(b.runtime,"es");});
      var active=items.filter(function(item){return item.active;}).length,open=FLEET.appOpen.has(machine),rowsId="ykAppMachine"+index;
      var group=el("fieldset","yk-app-group");group.appendChild(fleetText("legend","yk-sr-only","DesktopAPP de "+machine));
      var toggle=el("button","yk-app-machine");toggle.type="button";toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-controls",rowsId);
      toggle.appendChild(el("span","yk-app-chevron"));toggle.appendChild(fleetText("span","yk-app-machine-name",machine));
      toggle.appendChild(fleetText("span","yk-app-tally"+(active?" live":""),active+"/"+items.length));
      var rows=el("div","yk-app-rows");rows.id=rowsId;rows.hidden=!open;
      toggle.addEventListener("click",function(){if(FLEET.appOpen.has(machine))FLEET.appOpen.delete(machine);else FLEET.appOpen.add(machine);renderApps();});
      group.appendChild(toggle);
      items.forEach(function(item){
        var row=el("div","yk-app-row");var copy=el("span","yk-app-copy");
        var appName=desktopAppName(item.runtime),progress=appActionState(item);
        copy.appendChild(fleetText("b",null,appName));
        copy.appendChild(fleetText("small",item.active?"live":"",item.persona+" · "+(item.active?("PID "+item.pid):"ranura disponible")));row.appendChild(copy);
        var action=fleetButton("","yk-app-switch"+(progress?(" is-"+progress.phase+" is-"+progress.action):""),function(){fleetControl(item,item.active?"stop":"start");});
        action.setAttribute("role","switch");action.setAttribute("aria-checked",String(item.active));
        action.setAttribute("aria-busy",String(!!progress&&progress.phase==="pending"));
        action.setAttribute("aria-label",appName+" en "+machine+": "+(progress?(progress.action==="start"?"abriendo":"cerrando"):(item.active?"abierta; cerrar":"cerrada; abrir")));
        if(progress&&progress.detail)action.title=progress.detail;
        action.appendChild(fleetText("span","yk-app-switch-name",appName));
        action.appendChild(fleetText("span","yk-app-switch-state",progress?(progress.phase==="pending"?(progress.action==="start"?"Abriendo…":"Cerrando…"):(progress.phase==="success"?"Verificada":"Error")):(item.active?"Abierta":"Cerrada")));
        action.appendChild(el("span","yk-app-switch-track"));
        action.disabled=!!progress||FLEET.busy||(!item.active&&!item.watcher);row.appendChild(action);rows.appendChild(row);
      });
      group.appendChild(rows);FLEET.appList.appendChild(group);
    });
  }

  function renderExpertApps() {
    if(!FLEET.expertAppList)return;FLEET.expertAppList.textContent="";
    var apps=FLEET.items.filter(function(item){return item.host === "app";});
    FLEET.expertAppCount.textContent=apps.filter(function(item){return item.active;}).length+"/"+apps.length+" vivas";
    if(!apps.length){FLEET.expertAppList.appendChild(el("p","yk-fleet-empty","Sin Desktop Apps censadas."));refreshDesktopDispatch();return;}
    if(FLEET.selectedApp&&!apps.some(function(item){return fleetKey(item)===FLEET.selectedApp;})){FLEET.selectedApp="";stopDesktopCapture(true,"Vista desconectada: el slot desapareció.");stopDesktopWrite();}
    var groups={};apps.forEach(function(item){(groups[item.machine]||(groups[item.machine]=[])).push(item);});
    Object.keys(groups).sort(function(a,b){return a.localeCompare(b,"es");}).forEach(function(machine,index){
      var items=groups[machine].sort(function(a,b){return Number(b.active)-Number(a.active)||a.persona.localeCompare(b.persona,"es")||a.runtime.localeCompare(b.runtime,"es");});
      var active=items.filter(function(item){return item.active;}).length,open=FLEET.expertAppOpen.has(machine),rowsId="ykExpertAppMachine"+index;
      var group=el("fieldset","yk-expert-app-group");group.appendChild(fleetText("legend","yk-sr-only","Desktop Apps de "+machine));
      var toggle=el("button","yk-expert-app-machine");toggle.type="button";toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-controls",rowsId);
      toggle.appendChild(el("span","yk-app-chevron"));toggle.appendChild(fleetText("span","yk-expert-app-machine-name",machine));
      toggle.appendChild(fleetText("span","yk-expert-app-tally"+(active?" live":""),active+"/"+items.length));group.appendChild(toggle);
      var rows=el("div","yk-expert-app-rows");rows.id=rowsId;rows.hidden=!open;
      toggle.addEventListener("click",function(){if(FLEET.expertAppOpen.has(machine))FLEET.expertAppOpen.delete(machine);else FLEET.expertAppOpen.add(machine);renderExpertApps();});
      items.forEach(function(item){
        var key=fleetKey(item),progress=appActionState(item),row=el("div","yk-expert-app-row"+(key===FLEET.selectedApp?" selected":""));
        var select=fleetButton("","yk-expert-app-select",function(){if(FLEET.selectedApp!==key){stopDesktopCapture(true,"Vista detenida: cambió la app seleccionada.");stopDesktopWrite();}disconnectSelectedPty(true);FLEET.selectedApp=key;renderCli();renderExpertApps();});
        select.setAttribute("aria-pressed",String(key===FLEET.selectedApp));
        select.appendChild(fleetText("b",null,item.persona+" · "+desktopAppName(item.runtime)));
        select.appendChild(fleetText("small",item.active?"live":"",item.active?("PID "+item.pid):"apagada · enciéndela para enviar"));row.appendChild(select);
        var power=fleetButton("","yk-expert-app-power"+(progress?(" is-"+progress.phase+" is-"+progress.action):""),function(){fleetControl(item,item.active?"stop":"start");});setFleetIcon(power,item.active?"power":"play");
        power.setAttribute("role","switch");power.setAttribute("aria-checked",String(item.active));power.setAttribute("aria-label",(item.active?"Cerrar ":"Abrir ")+desktopAppName(item.runtime)+" de "+item.persona+" en "+machine);
        power.setAttribute("aria-busy",String(!!progress&&progress.phase==="pending"));power.disabled=!!progress||FLEET.busy||(!item.active&&!item.watcher);row.appendChild(power);rows.appendChild(row);
      });
      group.appendChild(rows);FLEET.expertAppList.appendChild(group);
    });
    var selected=selectedDesktopApp();
    if(FLEET.appDispatchInput)FLEET.appDispatchInput.placeholder=selected?(selected.active?("Encargo para "+selected.persona+" · "+desktopAppName(selected.runtime)+" en "+selected.machine):("Enciende "+desktopAppName(selected.runtime)+" para enviarle trabajo")):"Selecciona una Desktop App";
    refreshDesktopDispatch();
  }

  function renderCli() {
    if(!FLEET.cliList)return;FLEET.cliList.textContent="";FLEET.cliPower=null;FLEET.cliRead=null;FLEET.cliFocus=null;
    var clis=FLEET.items.filter(function(item){return item.host === "cli";});
    FLEET.cliCount.textContent=cliCountLabel(clis);
    if(!clis.length){FLEET.cliList.appendChild(el("p","yk-fleet-empty","Sin CLIs observados."));return;}
    if(FLEET.selected&&!clis.some(function(item){return fleetKey(item)===FLEET.selected;}))disconnectSelectedPty(true);
    var groups={};clis.forEach(function(item){(groups[item.machine]||(groups[item.machine]=[])).push(item);});
    Object.keys(groups).sort(function(a,b){return a.localeCompare(b,"es");}).forEach(function(machine,index){
      var items=groups[machine].sort(function(a,b){return Number(b.active)-Number(a.active)||a.persona.localeCompare(b.persona,"es")||a.runtime.localeCompare(b.runtime,"es");});
      var real=items.filter(function(item){return !item.placeholder;}),active=real.filter(function(item){return item.active;}).length;
      var open=FLEET.cliOpen.has(machine),rowsId="ykCliMachine"+index,group=el("fieldset","yk-cli-machine-group");
      group.appendChild(fleetText("legend","yk-sr-only","CLIs de "+machine));
      var toggle=el("button","yk-cli-machine");toggle.type="button";toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-controls",rowsId);
      toggle.appendChild(el("span","yk-cli-machine-chevron"));toggle.appendChild(fleetText("span","yk-cli-machine-name",machine));
      toggle.appendChild(fleetText("span","yk-cli-machine-tally"+(active?" live":""),real.length?(active+"/"+real.length):"sin CLI"));
      var rows=el("div","yk-cli-machine-rows");rows.id=rowsId;rows.hidden=!open;
      toggle.addEventListener("click",function(){if(FLEET.cliOpen.has(machine))FLEET.cliOpen.delete(machine);else FLEET.cliOpen.add(machine);renderCli();});
      group.appendChild(toggle);
      items.forEach(function(item){
        var key=fleetKey(item),expanded=key===FLEET.cliExpanded,agentGroup=el("div","yk-cli-agent-group");
        var tab=el("div","yk-cli-agent-tab"+(key===FLEET.selected?" selected":""));
        var button=el("button","yk-cli-agent"+(key===FLEET.selected?" selected":""));button.type="button";
        button.setAttribute("aria-expanded",String(expanded));button.appendChild(el("span","yk-cli-chevron"));
        button.appendChild(fleetText("b",null,item.placeholder?"Equipo sin CLI":(item.persona+" · "+item.runtime)));
        button.appendChild(fleetText("small",item.active?"live":"",item.placeholder?"sin CLI anunciado":(item.active?(item.terminal_visible?"Visible en equipo":"tmux autónomo"):"parado")));
        button.addEventListener("click",function(){
          var changed=FLEET.selected!==key,isOpen=FLEET.cliExpanded===key;
          FLEET.selected=key;FLEET.cliExpanded=isOpen?"":key;
          if(changed)disconnectSelectedPty(false);
          renderCli();
        });
        tab.appendChild(button);
        if(expanded&&!item.placeholder){
          var controls=el("div","yk-cli-agent-buttons");
          FLEET.cliPower=fleetButton("","yk-cli-power",function(){fleetControl(item,item.active?"stop":"start");});setFleetIcon(FLEET.cliPower,item.active?"power":"play");
          FLEET.cliPower.title=item.active?"Agente encendido · detener":"Agente detenido · arrancar";FLEET.cliPower.setAttribute("aria-label",FLEET.cliPower.title);FLEET.cliPower.setAttribute("role","switch");FLEET.cliPower.setAttribute("aria-checked",String(item.active));
          FLEET.cliPower.disabled=FLEET.busy||(!item.active&&!item.watcher);controls.appendChild(FLEET.cliPower);
          FLEET.cliRead=fleetButton("","yk-cli-read",function(){connectSelectedPty(true).then(function(){terminalAction("read");});});setFleetIcon(FLEET.cliRead,"reconnect");FLEET.cliRead.title="Conectar explícitamente y sincronizar el visor PTY";FLEET.cliRead.setAttribute("aria-label",FLEET.cliRead.title);FLEET.cliRead.disabled=!item.active||FLEET.busy;controls.appendChild(FLEET.cliRead);
          FLEET.cliFocus=fleetButton("","yk-cli-focus",function(){terminalAction(item.terminal_visible?"unfocus":"focus");});setFleetIcon(FLEET.cliFocus,item.terminal_visible?"displayOff":"display");FLEET.cliFocus.title=item.terminal_visible?"Sesión visible en el equipo · dejar de mostrar":"Sesión oculta en el equipo · mostrar";FLEET.cliFocus.setAttribute("aria-label",FLEET.cliFocus.title);FLEET.cliFocus.setAttribute("role","switch");FLEET.cliFocus.setAttribute("aria-checked",String(item.terminal_visible));FLEET.cliFocus.disabled=!item.active;controls.appendChild(FLEET.cliFocus);tab.appendChild(controls);
        }
        agentGroup.appendChild(tab);rows.appendChild(agentGroup);
      });
      group.appendChild(rows);FLEET.cliList.appendChild(group);
    });
    paintSelectedCli();
  }

  function renderFleet(){renderApps();renderExpertApps();renderCli();renderBulkControls();renderAppBulkControls();}
  function reconcileDesktopCapture() {
    var state=FLEET.desktopCapture;if(!state.key)return;
    var item=selectedDesktopApp();
    if(!isOpen("bottom")||!item||!item.active||fleetKey(item)!==state.key||!sameDesktopCommandTarget(item,state.target))stopDesktopCapture(true,"Vista detenida: la conexión o el slot cambiaron.");
  }
  function reconcileDesktopWrite() {
    var state=FLEET.desktopWrite;if(!state.key)return;
    var item=selectedDesktopApp();if(!isOpen("bottom")||!item||!item.active||fleetKey(item)!==state.key||!sameDesktopCommandTarget(item,state.target))stopDesktopWrite();
  }
  function loadFleet() {
    return window.__ykJsonOnce(TELEGRAM+"/api/presence", 4000, function(){
      return fetch(TELEGRAM+"/api/presence",{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error("presence "+response.status);return response.json();});
    })
      .then(function(payload){
        var items=fleetItems(payload),structure=fleetStructureKey(items);FLEET.items=items;
        if(structure!==FLEET.structureKey){FLEET.structureKey=structure;renderFleet();}
        else{
          if(FLEET.appCount){var apps=items.filter(function(item){return item.host==="app";});FLEET.appCount.textContent=apps.filter(function(item){return item.active;}).length+"/"+apps.length+" vivas";}
          if(FLEET.expertAppCount){var expertApps=items.filter(function(item){return item.host==="app";});FLEET.expertAppCount.textContent=expertApps.filter(function(item){return item.active;}).length+"/"+expertApps.length+" vivas";}
          if(FLEET.cliCount){var clis=items.filter(function(item){return item.host==="cli";});FLEET.cliCount.textContent=cliCountLabel(clis);}
          paintSelectedCli();renderBulkControls();renderAppBulkControls();
        }
        reconcileDesktopCapture();reconcileDesktopWrite();return payload;
      })
      .catch(function(error){fleetMessage("No se pudo verificar la flota: "+(error.message||error),true);});
  }

  function buildDesktopControl() {
    var section=el("section","yk-app-control");var head=el("button","yk-app-head");head.type="button";head.setAttribute("aria-expanded","false");
    head.appendChild(el("span","yk-app-chevron"));head.appendChild(fleetText("b",null,"DesktopAPP"));
    FLEET.appCount=fleetText("span","yk-app-count","…");head.appendChild(FLEET.appCount);section.appendChild(head);
    FLEET.appBody=el("div","yk-app-body");FLEET.appBody.hidden=true;
    FLEET.appBody.appendChild(el("p","yk-fleet-help","Codex/OpenAI · Claude Code · OpenCode. Aplicaciones verificadas, agrupadas por equipo."));
    FLEET.appList=el("div","yk-app-list");FLEET.appBody.appendChild(FLEET.appList);
    FLEET.appStatus=el("p","yk-app-status");FLEET.appStatus.setAttribute("role","status");FLEET.appBody.appendChild(FLEET.appStatus);section.appendChild(FLEET.appBody);
    head.addEventListener("click",function(){FLEET.appsExpanded=!FLEET.appsExpanded;head.setAttribute("aria-expanded",String(FLEET.appsExpanded));FLEET.appBody.hidden=!FLEET.appsExpanded;});
    return section;
  }

  function buildExpertFold(title, count) {
    var section=el("section","yk-expert-fold"),head=el("button","yk-expert-fold-head");head.type="button";head.setAttribute("aria-expanded","false");
    head.appendChild(el("span","yk-expert-fold-chevron"));head.appendChild(fleetText("b",null,title));
    if(count)head.appendChild(count);section.appendChild(head);
    var body=el("div","yk-expert-fold-body");body.hidden=true;section.appendChild(body);
    head.addEventListener("click",function(){var expanded=head.getAttribute("aria-expanded")==="true";head.setAttribute("aria-expanded",String(!expanded));body.hidden=expanded;});
    return {section:section,head:head,body:body};
  }

  function buildCliConsole() {
    var section=el("section","yk-cli-console"),side=el("div","yk-cli-side");
    FLEET.cliCount=fleetText("span","yk-expert-fold-count","…");var cliFold=buildExpertFold("Control de CLIs",FLEET.cliCount);
    FLEET.cliList=el("div","yk-cli-list");cliFold.body.appendChild(FLEET.cliList);
    FLEET.cliStatus=el("p","yk-cli-status");FLEET.cliStatus.setAttribute("role","status");cliFold.body.appendChild(FLEET.cliStatus);side.appendChild(cliFold.section);
    var bulkFold=buildExpertFold("Control global por agente");
    FLEET.cliBulk=el("section","yk-cli-bulk");FLEET.cliBulk.setAttribute("aria-label","Control global por agente");bulkFold.body.appendChild(FLEET.cliBulk);
    FLEET.cliBulkStatus=el("p","yk-cli-status");FLEET.cliBulkStatus.setAttribute("role","status");bulkFold.body.appendChild(FLEET.cliBulkStatus);side.appendChild(bulkFold.section);
    FLEET.expertAppCount=fleetText("span","yk-expert-fold-count","…");var appFold=buildExpertFold("Control de Desktop Apps",FLEET.expertAppCount);
    appFold.body.appendChild(fleetText("p","yk-fleet-help","Selecciona una app exacta. Si está apagada, enciéndela con su control antes de enviar trabajo."));
    FLEET.expertAppList=el("div","yk-expert-app-list");appFold.body.appendChild(FLEET.expertAppList);
    FLEET.expertAppStatus=el("p","yk-cli-status");FLEET.expertAppStatus.setAttribute("role","status");appFold.body.appendChild(FLEET.expertAppStatus);
    var appForm=el("form","yk-app-dispatch-form");
    FLEET.appDispatchKind=el("select","yk-app-dispatch-kind");FLEET.appDispatchKind.setAttribute("aria-label","Tipo de encargo");
    [["mission","Misión"],["task","Tarea"],["objective","Objetivo"]].forEach(function(config){var option=el("option");option.value=config[0];option.textContent=config[1];FLEET.appDispatchKind.appendChild(option);});appForm.appendChild(FLEET.appDispatchKind);
    FLEET.appDispatchInput=el("textarea","yk-app-dispatch-input");FLEET.appDispatchInput.rows=2;FLEET.appDispatchInput.maxLength=1500;FLEET.appDispatchInput.disabled=true;FLEET.appDispatchInput.setAttribute("aria-label","Encargo para la Desktop App seleccionada");appForm.appendChild(FLEET.appDispatchInput);
    FLEET.appDispatchSend=fleetText("button","yk-app-dispatch-send","Enviar ⌘↵");FLEET.appDispatchSend.type="submit";FLEET.appDispatchSend.disabled=true;appForm.appendChild(FLEET.appDispatchSend);
    appForm.addEventListener("submit",function(event){event.preventDefault();desktopDispatch();});
    FLEET.appDispatchInput.addEventListener("input",refreshDesktopDispatch);
    FLEET.appDispatchInput.addEventListener("keydown",function(event){var enter=event.key==="Enter"||event.code==="Enter"||event.code==="NumpadEnter";if(enter&&(event.metaKey||event.ctrlKey)&&!event.isComposing){event.preventDefault();desktopDispatch();}});
    appFold.body.appendChild(appForm);FLEET.appDispatchStatus=el("p","yk-app-dispatch-status");FLEET.appDispatchStatus.setAttribute("role","status");FLEET.appDispatchStatus.setAttribute("aria-live","polite");appFold.body.appendChild(FLEET.appDispatchStatus);
    FLEET.appCapture=el("figure","yk-app-capture");FLEET.appCapture.hidden=true;
    FLEET.appCaptureImage=el("img","yk-app-capture-image");FLEET.appCaptureImage.hidden=true;FLEET.appCaptureImage.setAttribute("decoding","async");FLEET.appCapture.appendChild(FLEET.appCaptureImage);
    var captureCaption=el("figcaption","yk-app-capture-caption");FLEET.appCaptureMeta=fleetText("span","yk-app-capture-meta","Sin captura todavía");captureCaption.appendChild(FLEET.appCaptureMeta);
    FLEET.appCaptureStatus=fleetText("span","yk-app-capture-status","Vista desconectada");FLEET.appCaptureStatus.setAttribute("role","status");FLEET.appCaptureStatus.setAttribute("aria-live","polite");captureCaption.appendChild(FLEET.appCaptureStatus);FLEET.appCapture.appendChild(captureCaption);appFold.body.appendChild(FLEET.appCapture);
    side.appendChild(appFold.section);section.appendChild(side);
    var terminal=el("div","yk-cli-terminal");var terminalHead=el("div","yk-cli-terminal-head");
    var identity=el("span");FLEET.cliTitle=fleetText("b",null,"Sin conexión");FLEET.cliMeta=fleetText("small",null,"Selecciona un CLI y pulsa conectar");identity.appendChild(FLEET.cliTitle);identity.appendChild(FLEET.cliMeta);terminalHead.appendChild(identity);
    FLEET.cliDisconnect=fleetButton("Desconectar","yk-cli-disconnect",function(){disconnectSelectedPty(true);renderCli();});FLEET.cliDisconnect.setAttribute("aria-label","Desconectar y volver a terminal neutral");terminalHead.appendChild(FLEET.cliDisconnect);
    terminal.appendChild(terminalHead);
    FLEET.cliMount=el("div","yk-cli-xterm");FLEET.cliMount.setAttribute("aria-label","Visor PTY remoto de solo lectura");terminal.appendChild(FLEET.cliMount);
    FLEET.cliPtyStatus=fleetText("small","yk-cli-pty-status","Sin conexión · ningún PTY seleccionado");FLEET.cliPtyStatus.setAttribute("role","status");terminal.appendChild(FLEET.cliPtyStatus);
    terminal.appendChild(fleetText("small","yk-cli-terminal-help","Visor PTY real · ANSI y tamaño sincronizados por xterm.js · escritura separada debajo"));
    var form=el("form","yk-cli-terminal-form");
    FLEET.cliInput=el("textarea","yk-cli-terminal-input");FLEET.cliInput.rows=2;FLEET.cliInput.maxLength=4000;FLEET.cliInput.disabled=true;FLEET.cliInput.setAttribute("aria-label","Mensaje para el agente CLI seleccionado");form.appendChild(FLEET.cliInput);
    FLEET.cliSend=fleetText("button","yk-cli-terminal-send","Enviar ⌘↵");FLEET.cliSend.type="submit";FLEET.cliSend.disabled=true;form.appendChild(FLEET.cliSend);
    function submitCliEditor(){var text=FLEET.cliInput.value;if(!text.trim()||FLEET.busy)return;terminalAction("write",text);}
    form.addEventListener("submit",function(event){event.preventDefault();submitCliEditor();});
    FLEET.cliInput.addEventListener("keydown",function(event){var enter=event.key==="Enter"||event.code==="Enter"||event.code==="NumpadEnter";if(enter&&(event.metaKey||event.ctrlKey)&&!event.isComposing){event.preventDefault();event.stopPropagation();submitCliEditor();}});
    terminal.appendChild(form);
    section.appendChild(terminal);return section;
  }

  function build() {
    if (document.getElementById("yk-frame")) return;
    document.documentElement.classList.add("yk-framed"); // aplica padding-top al body

    var root = el("div", "yk-frame");
    root.id = "yk-frame";

    // ------------------------- BARRA SUPERIOR ------------------------------
    var bar = el("header", "yk-bar");
    bar.setAttribute("role", "banner");

    // [icono OPCIONES] al extremo izquierdo
    var icoL = icon("yk-ico yk-ico-left", "left", "▤", "Opciones");

    // logotipo YO KUP (→ /)
    var logo = el("a", "yk-logo",
      '<span class="yk-dot" aria-hidden="true"></span>Yo<b>kup</b>');
    logo.href = "/";
    logo.setAttribute("aria-label", "Yokup · inicio");

    // menú de la barra (se calcula ya para deducir el ítem activo)
    var navItems = pageNav();
    var activeLbl = "";
    for (var _i = 0; _i < navItems.length; _i++) { if (navItems[_i].active) { activeLbl = navItems[_i].label; break; } }

    // rótulo de la página — se OCULTA si coincide con el ítem ACTIVO del menú, para
    // no duplicarlo (p.ej. «DASHBOARD DASHBOARD» en /dashboard). En páginas fuera del
    // menú (p.ej. /ticket → «TICKET») el rótulo sigue mostrándose.
    var pt = pageTitle();
    var page = el("span", "yk-page", pt);
    if (!pt || (activeLbl && pt === activeLbl)) page.style.display = "none";

    // menú de la barra: por página (body[data-yk-nav]) o el global por defecto
    var nav = el("nav", "yk-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    navItems.forEach(function (it) {
      var a = el("a", it.active ? "on" : null, it.label);
      a.href = it.href || "#";
      if (it.active) a.setAttribute("aria-current", "page");
      if (it.panel) {
        // MISIONES/TAREAS: abre/enfoca el raíl izquierdo/derecho en vez de navegar
        a.setAttribute("data-yk-open", it.panel);
        a.addEventListener("click", function (e) { e.preventDefault(); setOpen(it.panel, true); });
      }
      var c = counterSpan(it.label, "yk-nav-c");
      if (c) a.appendChild(c);
      // Sólo las secciones con cifras entran en la referencia lumínica;
      // DASHBOARD no cuenta nada, así que ni se enciende ni saca tarjeta.
      // HIGHSCORE tampoco tiene contador pero SÍ entra: su hover abre el
      // submenú de vistas (FLT-1426), no el tooltip de cifras.
      if (COUNTER_KEY[it.label] || it.label === "DECISIONES" || it.label === "HIGHSCORE") wireNavPop(a, it.label);
      nav.appendChild(a);
    });

    // [PROYECTO ACTIVO ▾] — desplegable que absorbe el antiguo rótulo de flota
    var proj = buildProjMenu();

    // (el reloj de la barra se retiró — canon 2026-07-13, Carlos)

    // [icono AVANZADO] [icono EXPERTO] al extremo derecho
    var icoR = icon("yk-ico yk-ico-adv", "right", "◨", "Avanzado");
    var icoB = icon("yk-ico yk-ico-exp", "bottom", "▦", "Experto");

    bar.appendChild(icoL);
    bar.appendChild(logo);
    bar.appendChild(page);
    bar.appendChild(nav);
    bar.appendChild(proj);
    bar.appendChild(icoR);
    bar.appendChild(icoB);

    // ------------------------- PANELES (raíles) ----------------------------
    // Rótulos por página: <body data-yk-rail-left="…" data-yk-rail-right="…">.
    // Sin atributos, se mantiene el canon OPCIONES / AVANZADO (resto de páginas
    // intactas). En incidencias son MISIONES / TAREAS (modelo misiones·tareas).
    var railLeftLabel = document.body.getAttribute("data-yk-rail-left") || "OPCIONES";
    var railRightLabel = document.body.getAttribute("data-yk-rail-right") || "AVANZADO";

    var railL = el("aside", "yk-rail yk-rail-left");
    railL.appendChild(el("div", "yk-hd", railLeftLabel));
    // MÓVIL (≤520px): la barra esconde .yk-nav y las secciones quedaban
    // inalcanzables desde el teléfono (FLT-983). El MISMO menú, sin inventar
    // patrón nuevo, se replica dentro del cajón OPCIONES que ya existía; el CSS
    // solo lo muestra por debajo de 520px, así el escritorio no cambia.
    // Orden dentro del cajón: si la página NO trae panel de trabajo propio, las
    // secciones van delante (es lo único que hay). Si lo trae —misiones e
    // incidencias, que además rotulan el cajón MISIONES—, las secciones van
    // DETRÁS: medido a 320px, el bloque empujaba los filtros 387px hacia abajo y
    // obligaba a desplazar el cajón entero para llegar a ellos.
    var hasOwnPanel = !!document.querySelector('[data-yk-slot="left"]');
    var railNav = buildRailNav(navItems);
    if (!hasOwnPanel) railL.appendChild(railNav);
    var slotL = el("div", "yk-slot"); railL.appendChild(slotL);
    if (hasOwnPanel) railL.appendChild(railNav);
    // pie del raíl OPCIONES: AJUSTES + versión, abajo del todo (Carlos, 2026-07-19).
    // Vive en el marco, no en las páginas → idéntico en toda la zona-app.
    railL.appendChild(buildRailFoot());

    var railR = el("aside", "yk-rail yk-rail-right");
    railR.appendChild(el("div", "yk-hd", railRightLabel));
    // Navegación canónica de producto. Highscore sigue siendo accesible desde
    // cualquier otra página sin duplicarse en su propia vista; si no hay ningún
    // enlace no se monta un <nav> vacío ni queda su hueco ante lectores de pantalla.
    var advancedNav = buildAdvancedNav();
    if (advancedNav.childNodes.length) railR.appendChild(advancedNav);
    var slotR = el("div", "yk-slot"); railR.appendChild(slotR);
    slotR.appendChild(buildDesktopControl());

    var railB = el("aside", "yk-rail yk-rail-bottom");
    var expertResize = el("div", "yk-expert-resizer");
    expertResize.setAttribute("role", "separator");
    expertResize.setAttribute("aria-label", "Redimensionar modo Experto");
    expertResize.setAttribute("aria-orientation", "horizontal");
    expertResize.setAttribute("tabindex", "0");
    var expert = el("div", "yk-expert");
    var expertHead = el("div", "yk-hd yk-expert-hd");
    expertHead.appendChild(el("span", "yk-expert-title", "EXPERTO"));
    var expertVer = el("span", "yk-ver yk-expert-ver",
      'yokup · perímetro de seguridad · <b>' + VERSION + '</b>');
    expertVer.setAttribute("data-yk-version", "1");
    expertHead.appendChild(expertVer);
    expert.appendChild(expertHead);
    var slotB = el("div", "yk-slot"); expert.appendChild(slotB);
    slotB.appendChild(buildCliConsole());
    railB.appendChild(expertResize);
    railB.appendChild(expert);
    wireExpertResize(railB, expertResize);

    root.appendChild(bar);
    root.appendChild(railL); root.appendChild(railR); root.appendChild(railB);
    document.body.appendChild(root);

    // --- MOVER los nodos marcados a su slot ---
    fillSlot(slotL, "left");
    fillSlot(slotR, "right");
    fillSlot(slotB, "bottom");
    FLEET.appBulk=document.getElementById("desktopAppBulk");

    // --- estado abierto/plegado por panel ---
    wire(icoL, "left");
    wire(icoR, "right");
    wire(icoB, "bottom");
    closeRailOnNavigation(railL, "left");
    closeRailOnNavigation(railR, "right");
    refreshPublicVersion();

    // --- cerrar cualquier panel abierto con Escape ---
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        ["left", "right", "bottom"].forEach(function (p) { if (isOpen(p)) setOpen(p, false); });
      }
    });

    // --- botones del EXPERTO (fetch al worker + volcado JSON) ---
    wireExpertFetch(root);

    // --- contadores reales «curso/pend» del menú (un fetch, degradación silenciosa) ---
    fetchCounters();
    loadFleet();
    setInterval(loadFleet, 10000);
    document.addEventListener("visibilitychange",function(){if(document.hidden){stopDesktopCapture(true,"Vista detenida: Yokup quedó en segundo plano.");stopDesktopWrite();}});
    window.addEventListener("pagehide",function(){stopDesktopCapture(true,"Vista desconectada.");stopDesktopWrite();});
    // El WebSocket PTY entrega cambios al instante. No se repinta ni se roba el
    // foco con lecturas temporizadas mientras alguien escribe en xterm.
  }

  // Pie fijo del raíl OPCIONES: AJUSTES (plegado por defecto, contenido REAL de
  // la sesión de acceso.js) y la versión del perímetro debajo, abajo del todo.
  function buildRailFoot() {
    var foot = el("div", "yk-rail-foot");

    var set = el("div", "yk-set");
    var btn = el("button", "yk-set-btn",
      '<span aria-hidden="true">⚙</span> AJUSTES <span class="yk-set-cx" aria-hidden="true">▾</span>');
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");

    var body = el("div", "yk-set-body");
    var email = "";
    try { email = localStorage.getItem("yk_email") || ""; } catch (e) {}
    body.appendChild(el("div", "yk-set-row",
      '<span class="yk-set-k">Sesión</span><b class="yk-set-v" title="' + (email || "sesión local") + '">' +
      (email || "sesión local") + '</b>'));
    var out = el("button", "yk-set-out", "CERRAR SESIÓN");
    out.type = "button";
    out.addEventListener("click", function () {
      try { localStorage.removeItem("yk_session"); localStorage.removeItem("yk_email"); } catch (e) {}
      location.reload();
    });
    body.appendChild(out);

    // PERSONALIZACIÓN (Carlos, 2026-07-19): preferencias de las columnas del
    // perímetro. yk_pref_avatars → avatares de agente en las listas (def. ON);
    // lo leen yk-misiones.js y quien pinte agentes. Cambiar recarga la vista.
    body.appendChild(el("div", "yk-set-sec", "Personalización"));
    var avLbl = el("label", "yk-set-chk");
    var avChk = document.createElement("input");
    avChk.type = "checkbox";
    try { avChk.checked = localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { avChk.checked = true; }
    avLbl.appendChild(avChk);
    avLbl.appendChild(el("span", null, "Avatares de agentes"));
    avChk.addEventListener("change", function () {
      try { localStorage.setItem("yk_pref_avatars", avChk.checked ? "1" : "0"); } catch (e) {}
      location.reload();
    });
    body.appendChild(avLbl);

    // PANEL DE CONTROL (Carlos, 2026-07-19): personalización de ordenadores y
    // agentes — icono o foto por cada uno, compartida en todo el perímetro
    // (prefs 'customize' del worker, escritura con sesión).
    var pcBtn = el("button", "yk-set-btn yk-pc-open",
      '<span aria-hidden="true">▣</span> PERSONALIZACIÓN');
    pcBtn.type = "button";
    pcBtn.addEventListener("click", function () { openPanelControl(); });
    body.appendChild(pcBtn);

    btn.addEventListener("click", function () {
      var open = !set.classList.contains("open");
      set.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    set.appendChild(btn);
    set.appendChild(body);

    foot.appendChild(set);
    // Alta rápida contra el censo canónico; disponible desde cualquier vista.
    var newProject = el("button", "yk-set-btn yk-project-new",
      '<span aria-hidden="true">＋</span> NUEVO PROYECTO');
    newProject.type = "button";
    newProject.addEventListener("click", openNewProject);
    foot.appendChild(newProject);
    // EQUIPO · STATUS (Carlos, 2026-07-23): salieron del menú SUPERIOR y viven
    // ahora aquí, en el raíl OPCIONES, como navegación de gestión. Orden del pie:
    // EQUIPO · STATUS · Panel de control · sello de versión.
    var _path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    [["◫", "EQUIPO", "/equipo"], ["◈", "STATUS", "https://www.yokup.com/status"]].forEach(function (r) {
      var on = (_path === r[2] || _path === r[2] + ".html");
      var a = el("a", "yk-set-btn" + (on ? " on" : ""),
        '<span aria-hidden="true">' + r[0] + '</span> ' + r[1]);
      a.href = r[2];
      if (on) a.setAttribute("aria-current", "page");
      foot.appendChild(a);
    });
    // PANEL DE CONTROL → /asignaciones (Carlos, 2026-07-23): entrada del cajón
    // OPCIONES, justo ENCIMA del sello de versión. La personalización de flota
    // (antes «Panel de control») vive ahora dentro de AJUSTES como «Personalización».
    var pc = el("a", "yk-set-btn",
      '<span aria-hidden="true">▣</span> Panel de control');
    pc.href = "https://www.yokup.com/asignaciones";
    foot.appendChild(pc);
    var ver = el("div", "yk-ver",
      'yokup · perímetro de seguridad · <b>' + VERSION + '</b>');
    ver.setAttribute("data-yk-version", "1");
    foot.appendChild(ver);
    return foot;
  }

  function buildAdvancedNav() {
    var nav = el("nav", "yk-adv-nav");
    nav.setAttribute("aria-label", "Herramientas avanzadas de Yokup");
    var path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    var active = path === "/highscore" || path === "/highscore.html";
    // La página Highscore ya se identifica en el título del marco y en su H1:
    // repetirla dentro de Avanzado no es navegación. Normativa dejó de ser una
    // acción operativa del raíl: su espejo documental sigue existiendo, pero no
    // ocupa espacio ni queda anunciado como control de la aplicación.
    if (!active) {
      var highscore = el("a", "yk-set-btn yk-adv-link",
        '<span aria-hidden="true">🏃</span> HIGHSCORE');
      highscore.href = "/highscore";
      nav.appendChild(highscore);
    }
    return nav;
  }

  function projectField(label, name, type, placeholder) {
    var wrap = el("label", "yk-project-field");
    wrap.appendChild(el("span", null, label));
    var input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    input.name = name;
    if (type !== "textarea") input.type = type || "text";
    if (name === "web") { input.inputMode = "url"; input.autocomplete = "url"; }
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    return wrap;
  }

  function projectResponsibles(raw) {
    return String(raw || "").split(/\r?\n/).map(function (line) {
      var parts = line.split(/\s+\|\s+/);
      return { name:(parts.shift() || "").trim(), role:parts.join(" | ").trim() };
    }).filter(function (item) { return !!item.name; });
  }

  function normalizeProjectWeb(rawValue) {
    var raw = String(rawValue || "").trim();
    if (!raw) return "";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
      throw new Error("la web debe empezar por http o https");
    }
    var candidate = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    var parsed;
    try { parsed = new URL(candidate); }
    catch (e) { throw new Error("la web no es válida"); }
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("la web debe ser una dirección http o https válida");
    }
    return candidate.replace(/\/+$/, "");
  }

  function openNewProject() {
    var modal = el("div", "yk-project-modal");
    var card = el("form", "yk-project-card");
    card.innerHTML = '<div class="yk-project-hd"><div><b>＋ NUEVO PROYECTO</b><small>Alta en el censo canónico de Yokup</small></div><button type="button" class="yk-project-x" aria-label="Cerrar">×</button></div>';
    card.appendChild(projectField("Nombre *", "name", "text", "Ej. Nueva plataforma"));
    card.appendChild(projectField("Web · opcional", "web", "text", "www.ejemplo.com"));
    card.appendChild(projectField("Descripción", "blurb", "textarea", "Qué hace y para quién"));
    card.appendChild(projectField("Responsables · uno por línea (Nombre | Rol)", "responsibles", "textarea", "Carlos | Dirección\nOráculo | Producto"));
    card.appendChild(projectField("Primera nota de seguimiento", "initial_note", "textarea", "Punto de partida, siguiente hito o decisión pendiente"));
    var foot = el("div", "yk-project-actions");
    var msg = el("span", "yk-project-msg", "El nombre es obligatorio");
    var cancel = el("button", "yk-project-cancel", "CANCELAR"); cancel.type = "button";
    var save = el("button", "yk-project-save", "DAR DE ALTA"); save.type = "submit";
    foot.appendChild(msg); foot.appendChild(cancel); foot.appendChild(save); card.appendChild(foot);
    modal.appendChild(card); document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    card.querySelector(".yk-project-x").addEventListener("click", close);
    cancel.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    card.elements.web.addEventListener("blur", function () {
      if (!card.elements.web.value.trim()) return;
      try { card.elements.web.value = normalizeProjectWeb(card.elements.web.value); msg.textContent = "El nombre es obligatorio"; }
      catch (err) { msg.textContent = "✗ " + (err && err.message || err); }
    });
    card.addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = card.elements.name.value.trim();
      if (!name) { msg.textContent = "Escribe el nombre del proyecto"; card.elements.name.focus(); return; }
      var web;
      try { web = normalizeProjectWeb(card.elements.web.value); }
      catch (err) { msg.textContent = "✗ " + (err && err.message || err); card.elements.web.focus(); return; }
      save.disabled = true; msg.textContent = "Guardando…";
      try {
        var r = await fetch("https://api.yokup.com/projects", { method:"POST", headers:{"content-type":"application/json"},
          body:JSON.stringify({ name:name, web:web, blurb:card.elements.blurb.value.trim(),
            responsibles:projectResponsibles(card.elements.responsibles.value), initial_note:card.elements.initial_note.value.trim(),
            note_author:"yokup·rail-opciones", status:"activo", by:"yokup·rail-opciones" }) });
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok || !d.ok) throw new Error(d.error || ("HTTP " + r.status));
        msg.textContent = "✓ Proyecto creado";
        window.dispatchEvent(new CustomEvent("yk:projects-changed", { detail:d.project || null }));
        setTimeout(function () { close(); if (/\/equipo(?:\.html)?$/.test(location.pathname)) location.reload(); }, 650);
      } catch (err) {
        save.disabled = false; msg.textContent = "✗ " + (err && err.message || err);
      }
    });
    setTimeout(function () { card.elements.name.focus(); }, 0);
  }

  function paintPublicVersion(value) {
    var clean = String(value || "").trim();
    if (!clean) return;
    VERSION = clean;
    Array.prototype.forEach.call(document.querySelectorAll("[data-yk-version]"), function (node) {
      node.innerHTML = 'yokup · perímetro de seguridad · <b>' + VERSION + '</b>';
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-yk-deploy-version]"), function (node) {
      node.textContent = VERSION;
    });
  }

  // ── PESTAÑA CADUCA ────────────────────────────────────────────────────────
  // Una pestaña abierta desde antes de un deploy sigue REFRESCANDO SUS DATOS
  // (los sondeos al worker no paran) pero ejecuta el JavaScript de su carga: la
  // pantalla enseña cifras de hoy pintadas con código de ayer. Así reapareció el
  // «0 que late» en /highscore ya corregido en el servidor (Carlos, 2026-08-05).
  //
  // Y era peor: paintPublicVersion PISABA `VERSION` con el sello publicado, de
  // modo que la pestaña vieja presumía de estar al día mientras corría código
  // antiguo — justo lo contrario de lo que un sello sirve. Ahora el sello de la
  // COMPILACIÓN QUE CORRE (el ?v= con el que se cargó este fichero) es inmutable,
  // y cuando producción publica otro se avisa. No se recarga solo: puede haber
  // un filtro puesto o un formulario a medias; se ofrece y decide quien mira.
  var BUILD_VERSION = VERSION;
  var _stale = false;

  function marcaPestanaCaduca(publicada) {
    if (_stale) return;
    _stale = true;
    var bar = document.querySelector(".yk-bar");
    if (!bar) return;
    var b = el("button", "yk-stale",
      '<span aria-hidden="true">⟳</span> VERSIÓN NUEVA · RECARGAR');
    b.type = "button";
    b.title = "Se ha publicado algo desde que abriste esta pestaña (ahora en producción: " +
              publicada + "). Los datos se refrescan, el código no: recarga para verlos bien.";
    b.setAttribute("aria-live", "polite");
    b.addEventListener("click", function () { location.reload(); });
    bar.appendChild(b);
  }

  // NUNCA se comparan dos fuentes distintas (Carlos, 7-ago-2026: «cuando pulso
  // versión nueva · recargar vuelve a salir» · incidencia SVC-5FSKZH).
  //
  // Antes esto contrastaba BUILD_VERSION —el ?v= con el que se cargó este
  // fichero— contra el sello vivo. Son dos cosas que sólo casan si
  // TODOS los caminos de publicación las escriben a la vez, y no es el caso:
  // yokup.com se publica por dos vías (build automático de git y wrangler
  // directo) y ninguna pasa por el sellador, así que en producción el ?v= valía
  // r31 en /objetivos, v.2026.08.02.224605 en /misiones y v.2026.08.02.202305
  // en /highscore, mientras version.json seguía en su baseline del 3-ago. La
  // condición era verdadera SIEMPRE: el aviso salía en cada carga y recargar no
  // lo quitaba, porque el ?v= del HTML no cambia al recargar.
  //
  // Y un aviso que salta siempre es peor que no tenerlo: el día que de verdad
  // haya versión nueva, nadie le hará caso.
  //
  // Ahora cada fuente se compara CONSIGO MISMA a lo largo del tiempo:
  //   · el sello publicado, contra el que se leyó al cargar esta pestaña;
  //   · la huella (ETag) del propio yk-frame.js, contra la de su carga.
  // Así recargar siempre limpia el aviso —la referencia se toma de nuevo—, y
  // basta con que UNA de las dos se mueva para avisar: el ETag detecta un
  // despliegue aunque el sello esté congelado, y el sello lo detecta aunque un
  // intermediario sirva el mismo ETag. Sin sellado no hay falso positivo: si no
  // hay nada con que comparar, no se dice nada.
  var SELLO_AL_CARGAR = null;   // se fija en el primer sondeo
  var HUELLA_AL_CARGAR = null;

  function vigilaHuellaDelFrame() {
    if (!FRAME_SRC) return;
    window.fetch(FRAME_SRC, { method:"HEAD", cache:"no-store" })
      .then(function (r) {
        if (!r.ok) return;
        var h = r.headers.get("etag") || r.headers.get("last-modified");
        if (!h) return;
        if (HUELLA_AL_CARGAR === null) { HUELLA_AL_CARGAR = h; return; }
        if (h !== HUELLA_AL_CARGAR) marcaPestanaCaduca(VERSION);
      })
      .catch(function () {});
  }

  function refreshPublicVersion() {
    // El endpoint del guardián ejecuta el Worker antes de assets/cache. Así una
    // versión antigua de Pages no puede congelar el aviso ni el pie del marco.
    window.fetch("/version.json?frame=" + Date.now(), { cache:"no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.version) return;
        var sello = String(d.version).trim();
        paintPublicVersion(sello);
        if (SELLO_AL_CARGAR === null) { SELLO_AL_CARGAR = sello; return; }
        if (sello !== SELLO_AL_CARGAR) marcaPestanaCaduca(sello);
      })
      .catch(function () {});
    vigilaHuellaDelFrame();
  }
  // El primer sondeo va nada más cargar y sólo TOMA LA REFERENCIA: es lo que
  // hace que recargar limpie el aviso. Si se dejara para el sondeo de los 2 min,
  // la pestaña pasaría ese rato sin nada con que comparar.
  refreshPublicVersion();
  // Cada 2 min basta: es una cortesía, no un latido. Y al volver a la pestaña,
  // que es justo cuando se mira una que llevaba horas abierta.
  window.setInterval(refreshPublicVersion, 120000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshPublicVersion();
  });

  // ── PANEL DE CONTROL · personalización de ordenadores y agentes ────────────
  // Modal cuadrático: una fila por agente y por ordenador con su visual actual,
  // un emoji (icono) y una FOTO subible (POST /fleet/media → URL en R2). Todo se
  // guarda en UN doc {agents:{slug:{icon,img}}, machines:{slug:{icon,img}}} vía
  // /prefs/customize (GET abierto · POST con sesión del perímetro). Las listas
  // (yk-misiones) lo leen al cargar: la foto pisa al avatar de /avatars, el
  // icono pisa al emoji por defecto (👷 agente · 🖥 máquina).
  var PC_AGENTES = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith"];
  // espejo del canon MAQ_NOMBRE de yk-misiones.js (nombres de pantalla)
  var PC_MAQUINAS = ["MacBookPro14", "MacBookPro16", "MacBookAir16plata", "MacBookAirPlata",
    "MacBookAirAzul", "MacBookAirCrema", "MacBookAirRosa", "MacMini", "ASUS Zenbook", "DGX Spark", "ThinkStation PGX"];
  function pcSlug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function openPanelControl() {
    if (document.getElementById("yk-pc")) return;
    setOpen("left", false);   // el raíl fuera: el panel es un overlay enfocado
    var wrap = el("div", "yk-pc"); wrap.id = "yk-pc";
    var card = el("div", "yk-pc-card");
    card.appendChild(el("div", "yk-hd", "PANEL DE CONTROL · PERSONALIZACIÓN"));
    var bodyEl = el("div", "yk-pc-body", "Cargando personalización…");
    card.appendChild(bodyEl);
    var foot = el("div", "yk-pc-foot");
    var msg = el("span", "yk-pc-msg", "");
    var save = el("button", "yk-pc-save", "GUARDAR"); save.type = "button";
    var close = el("button", "yk-pc-close", "CERRAR"); close.type = "button";
    foot.appendChild(msg); foot.appendChild(save); foot.appendChild(close);
    card.appendChild(foot);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    function cerrar() {
      wrap.remove();
      document.removeEventListener("keydown", onEsc, true);
      document.removeEventListener("paste", onPaste);
    }
    function onEsc(e) { if (e.key === "Escape") { cerrar(); e.stopPropagation(); } }
    close.addEventListener("click", cerrar);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) cerrar(); });
    document.addEventListener("keydown", onEsc, true);

    var DATA = { agents: {}, machines: {} };
    function visual(kind, name) {
      var d = (DATA[kind] || {})[pcSlug(name)] || {};
      // la foto personalizada TAMBIÉN sondea: si su URL está rota (404, caída),
      // wireProbe la degrada al emoji con aviso — nunca el glifo de imagen rota.
      if (d.img) return '<img class="yk-pc-img yk-pc-probe" src="' + d.img + '" alt="">';
      if (d.icon) return '<span class="yk-pc-ico">' + d.icon + "</span>";
      // por defecto, SONDEO del avatar builtin (/avatars/<slug>.jpg): si el
      // fichero existe se ve (Trinity apareció así sin tocar listas); si 404,
      // wireProbe lo degrada al emoji canónico. Nada hardcodeado.
      if (kind === "agents") {
        return '<img class="yk-pc-img yk-pc-probe" src="/avatars/' + pcSlug(name) + '.jpg" alt="">';
      }
      return '<span class="yk-pc-ico dim">' + (kind === "agents" ? "👷" : "🖥") + "</span>";
    }
    function wireProbe(row, kind) {
      var p = row.querySelector(".yk-pc-probe");
      if (p) p.onerror = function () {
        this.outerHTML = '<span class="yk-pc-ico dim" title="foto rota o inaccesible — usa SIN FOTO para limpiarla">' +
          (kind === "agents" ? "👷" : "🖥") + "</span>";
      };
    }
    // Subida COMÚN de foto (selector, arrastre o pegado) → /fleet/media → URL.
    function subeFoto(f, kind, s, row, name) {
      if (!f || !/^image\//.test(f.type || "")) { msg.textContent = "Eso no es una imagen."; return; }
      msg.textContent = "Subiendo foto de " + name + "…";
      f.arrayBuffer().then(function (buf) {
        return window.fetch(WORKER + "/fleet/media", { method: "POST", headers: { "content-type": f.type || "image/jpeg" }, body: buf });
      }).then(function (r) { return r.json(); }).then(function (d2) {
        if (d2 && d2.url) { set(kind, s, "img", d2.url); refresh(row, kind, name); msg.textContent = "Foto de " + name + " lista — GUARDAR para fijarla."; }
        else msg.textContent = "No se pudo subir la foto.";
      }).catch(function () { msg.textContent = "No se pudo subir la foto."; });
    }
    var selRow = null;   // fila activa: destino del PEGADO (clic para elegirla)
    function fila(kind, name) {
      var s = pcSlug(name);
      var d = (DATA[kind] || {})[s] || {};
      var row = el("div", "yk-pc-row");
      row.innerHTML = '<span class="yk-pc-vis">' + visual(kind, name) + "</span>" +
        '<b class="yk-pc-nm">' + name + "</b>";
      wireProbe(row, kind);
      row.title = "clic: elegir fila (pegar con ⌘V) · también puedes ARRASTRAR una imagen aquí";
      var ico = document.createElement("input");
      ico.className = "yk-pc-icoin"; ico.maxLength = 4; ico.placeholder = "emoji";
      ico.value = d.icon || "";
      ico.addEventListener("input", function () { set(kind, s, "icon", ico.value.trim()); });
      var file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.style.display = "none";
      var fbtn = el("button", "yk-pc-foto", "FOTO…"); fbtn.type = "button";
      fbtn.title = "elegir fichero… o arrastra/pega una imagen sobre la fila";
      fbtn.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        subeFoto(file.files && file.files[0], kind, s, row, name);
      });
      var quitar = el("button", "yk-pc-quitar", "SIN FOTO"); quitar.type = "button";
      quitar.title = "quitar la foto personalizada";
      quitar.addEventListener("click", function () { set(kind, s, "img", ""); refresh(row, kind, name); });
      row.appendChild(ico); row.appendChild(fbtn); row.appendChild(file); row.appendChild(quitar);
      // FILA ACTIVA (destino del pegado): clic en cualquier hueco de la fila.
      row.addEventListener("click", function (e) {
        if (e.target.closest("button,input")) return;
        if (selRow) selRow.el.classList.remove("sel");
        selRow = { el: row, kind: kind, slug: s, name: name };
        row.classList.add("sel");
        msg.textContent = "Fila activa: " + name + " — pega una imagen (⌘V) o arrástrala encima.";
      });
      // ARRASTRAR Y SOLTAR: ficheros del Finder o imágenes arrastradas de una web.
      row.addEventListener("dragover", function (e) { e.preventDefault(); row.classList.add("drag"); });
      row.addEventListener("dragleave", function () { row.classList.remove("drag"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault(); row.classList.remove("drag");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) return subeFoto(f, kind, s, row, name);
        // imagen arrastrada desde otra web → llega como URL: se guarda directa
        var uri = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
        if (uri && /^https?:\/\//.test(uri.trim())) {
          set(kind, s, "img", uri.trim().split("\n")[0]);
          refresh(row, kind, name);
          msg.textContent = "Imagen de " + name + " enlazada — GUARDAR para fijarla.";
        }
      });
      return row;
    }
    function set(kind, slug, campo, valor) {
      DATA[kind] = DATA[kind] || {};
      DATA[kind][slug] = DATA[kind][slug] || {};
      if (valor) DATA[kind][slug][campo] = valor; else delete DATA[kind][slug][campo];
      if (!Object.keys(DATA[kind][slug]).length) delete DATA[kind][slug];
    }
    function refresh(row, kind, name) {
      var v = row.querySelector(".yk-pc-vis"); if (v) { v.innerHTML = visual(kind, name); wireProbe(row, kind); }
    }
    // PEGAR (⌘V) una imagen del portapapeles sobre la FILA ACTIVA (clic previo).
    function onPaste(e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (!items.length) return;
      if (!selRow) { msg.textContent = "Haz clic en una fila primero y vuelve a pegar."; return; }
      e.preventDefault();
      subeFoto(items[0], selRow.kind, selRow.slug, selRow.el, selRow.name);
    }
    document.addEventListener("paste", onPaste);
    // TABLERO DE MISIONES (Carlos, 2026-07-20): columnas visibles + densidad,
    // guardado en el mismo doc compartido (DATA.board) — se aplica en /misiones.
    var PC_COLS = [["proyecto", "Proyecto (miniatura)"], ["fecha", "Fecha y duración"],
      ["ordenador", "Ordenador"], ["agente", "Agente / plataforma"], ["estado", "Estado + abrir"]];
    function seccionTablero() {
      var frag = document.createDocumentFragment();
      frag.appendChild(el("div", "yk-set-sec", "Tablero de misiones"));
      DATA.board = DATA.board || {};
      DATA.board.cols = DATA.board.cols || {};
      PC_COLS.forEach(function (c) {
        var lbl = el("label", "yk-set-chk");
        var chk = document.createElement("input"); chk.type = "checkbox";
        chk.checked = DATA.board.cols[c[0]] !== 0;   // por defecto, visible
        chk.addEventListener("change", function () {
          if (chk.checked) delete DATA.board.cols[c[0]]; else DATA.board.cols[c[0]] = 0;
        });
        lbl.appendChild(chk);
        lbl.appendChild(el("span", null, "Columna " + c[1]));
        frag.appendChild(lbl);
      });
      var dens = el("div", "yk-pc-dens");
      dens.appendChild(el("span", "yk-set-k", "Densidad"));
      [["comoda", "CÓMODA"], ["compacta", "COMPACTA"]].forEach(function (d) {
        var b = el("button", "yk-pc-densb" + ((DATA.board.density || "comoda") === d[0] ? " on" : ""), d[1]);
        b.type = "button";
        b.addEventListener("click", function () {
          DATA.board.density = d[0];
          dens.querySelectorAll(".yk-pc-densb").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
        });
        dens.appendChild(b);
      });
      frag.appendChild(dens);
      return frag;
    }
    function pintar() {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(el("div", "yk-set-sec", "Agentes"));
      PC_AGENTES.forEach(function (n) { bodyEl.appendChild(fila("agents", n)); });
      bodyEl.appendChild(el("div", "yk-set-sec", "Ordenadores"));
      PC_MAQUINAS.forEach(function (n) { bodyEl.appendChild(fila("machines", n)); });
      bodyEl.appendChild(seccionTablero());
      // refleja el emoji tecleado en el visual al vuelo
      bodyEl.addEventListener("input", function (e) {
        if (!e.target.classList.contains("yk-pc-icoin")) return;
        var r = e.target.closest(".yk-pc-row"); if (!r) return;
        var nm = r.querySelector(".yk-pc-nm").textContent;
        var kind = PC_AGENTES.indexOf(nm) >= 0 ? "agents" : "machines";
        refresh(r, kind, nm);
      });
    }
    // /informes ya pide esta personalización para sus avatares. Compartir la
    // promesa evita duplicar el mismo GET al construir el panel lateral.
    (window.__ykCustomizeRequest || window.fetch(WORKER + "/prefs/customize", { cache: "no-store" }))
      .then(function (r) { return r && typeof r.json === "function" ? r.json() : r; })
      .then(function (d) { DATA = (d && d.customize) || {}; DATA.agents = DATA.agents || {}; DATA.machines = DATA.machines || {}; pintar(); })
      .catch(function () { pintar(); });
    save.addEventListener("click", function () {
      save.disabled = true; msg.textContent = "Guardando…";
      window.fetch(WORKER + "/prefs/customize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customize: DATA }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { msg.textContent = "Guardado — recargando…"; setTimeout(function () { location.reload(); }, 600); }
          else { msg.textContent = (d && d.error) || "No se pudo guardar."; save.disabled = false; }
        })
        .catch(function () { msg.textContent = "No se pudo guardar."; save.disabled = false; });
    });
  }

  // Selector de proyecto de la barra: Todos sin preferencia; una selección válida
  // explícita se restaura por query/storage. Ausente o archivada vuelve a Todos.
  function buildProjMenu() {
    var wrap = el("div", "yk-proj");
    var btn = el("button", "yk-proj-btn", "");
    btn.type = "button";
    btn.id = "yk-proj-btn";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    var menu = el("div", "yk-proj-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-labelledby", "yk-proj-btn");

    var projectTotal=0,projectLoadSeq=0,projectChannel=null;
    var PROJECT_ANNOUNCED_SS="yk_project_novelty_announced_v1";
    try{if(typeof window.BroadcastChannel==="function")projectChannel=new window.BroadcastChannel("yokup-project-novelty-v1");}catch(e){}
    var projectNovelty=window.YkProjectNovelty.create({storage:window.localStorage,publish:function(state){try{if(projectChannel)projectChannel.postMessage({type:"project-novelty",state:state});}catch(e){}}});
    var live=el("div","yk-nav-live");live.id="yk-project-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");live.setAttribute("aria-atomic","true");document.body.appendChild(live);

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function isMenuOpen() { return wrap.classList.contains("open"); }
    function setMenu(open) {
      wrap.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function unreadProjectIds(){var active={};PROJECT_CATALOG.forEach(function(project){active[String(project.id)]=true;});return projectNovelty.unreadIds().filter(function(id){return active[id];});}
    function paintProjectSignal(){
      var unread=unreadProjectIds(),base=btn.getAttribute("data-yk-base-label")||"Cambiar filtro de proyecto";
      wrap.classList.toggle("has-new",unread.length>0);
      btn.setAttribute("aria-label",base+(unread.length?". "+unread.length+" proyecto"+(unread.length===1?" nuevo":"s nuevos"):""));
    }
    function announceProjects(result){
      if(!result||!result.added)return;var state=result.state,token=String(state.observed_cursor==null?state.latest_created_at:state.observed_cursor),last="";
      try{last=sessionStorage.getItem(PROJECT_ANNOUNCED_SS)||"";}catch(e){}if(token&&token===last)return;
      var n=result.unread_ids.length;live.textContent=n+" proyecto"+(n===1?" nuevo":"s nuevos");try{sessionStorage.setItem(PROJECT_ANNOUNCED_SS,token);}catch(e){}
    }
    function ackRenderedProjects(){
      var ids=PROJECT_CATALOG.map(function(project){return String(project.id);});if(!ids.length)return;
      projectNovelty.ack(ids);paintProjectSignal();
    }
    function projectTotalLabel(prefix){return prefix+" · "+projectTotal;}

    function activeProject() {
      return PROJECT_CATALOG.filter(function (p) { return p.id === PROJECT_SCOPE; })[0] || null;
    }
    function validProjectId(value) {
      return resolveProjectScope(value, "", PROJECT_CATALOG);
    }
    function requestedProjectId() {
      var query = "", stored = "";
      if (globalProjectScopeSurface(location.pathname)) return null;
      try { query = new URL(location.href).searchParams.get("project_id") || ""; } catch (e) {}
      try { stored = localStorage.getItem(PROJECT_SCOPE_KEY) || ""; } catch (e) {}
      return resolveProjectScope(query, stored, PROJECT_CATALOG);
    }
    function rememberProject(projectId) {
      var globalOnly = globalProjectScopeSurface(location.pathname);
      try {
        if (!globalOnly) {
          if (projectId) localStorage.setItem(PROJECT_SCOPE_KEY, projectId);
          else localStorage.removeItem(PROJECT_SCOPE_KEY);
        }
      } catch (e) {}
      try {
        var url = new URL(location.href);
        if (projectId) url.searchParams.set("project_id", projectId);
        else url.searchParams.delete("project_id");
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      } catch (e) {}
    }
    function publishProject(projectId, persist) {
      PROJECT_SCOPE = globalProjectScopeSurface(location.pathname) ? null : validProjectId(projectId);
      if (persist) rememberProject(PROJECT_SCOPE);
      // CustomEvent se entrega síncronamente: los consumidores limpian o repintan
      // su DOM viejo antes de que el botón pueda anunciar el nuevo proyecto.
      window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:PROJECT_SCOPE,project:activeProject()}}));
      paintProject();
    }
    function paintProject() {
      var ap = activeProject(), host = projectHost(ap);
      var allButtonLabel=projectTotalLabel("TODOS"),allOptionLabel=projectTotalLabel("Todos");
      var name = ap ? (ap.name || ap.id) : allButtonLabel, full = ap && host ? name + " · " + host : name,unread=unreadProjectIds(),unreadMap={};unread.forEach(function(id){unreadMap[id]=true;});
      btn.innerHTML = '<span class="yk-proj-dot" aria-hidden="true"></span>'
        + '<span class="yk-proj-nm"><b class="yk-pj-full">' + esc(full) + '</b><b class="yk-pj-short">' + esc(name) + '</b></span>'
        + '<span class="yk-proj-cx" aria-hidden="true">▾</span>';
      btn.setAttribute("data-yk-base-label", "Proyecto: " + full + ". Cambiar filtro");
      btn.setAttribute("data-yk-project-total",String(projectTotal));
      btn.title = "Proyecto · " + full;
      menu.innerHTML = "";
      var selectableProjects = globalProjectScopeSurface(location.pathname) ? [] : PROJECT_CATALOG;
      [{id:null,name:"Todos",web:"Todos los proyectos"}].concat(selectableProjects).forEach(function (p) {
        var on = p.id === PROJECT_SCOPE;
        var option = el("button", "yk-proj-opt" + (on ? " on" : ""),
          '<span class="yk-proj-ic" aria-hidden="true">' + (p.id ? "📁" : "◉") + '</span>'
          + '<span class="yk-proj-txt"><b>' + esc(p.id ? (p.name || p.id) : allOptionLabel) + '</b><em>' + esc(p.id ? (projectHost(p) || p.id) : "Todos los proyectos") + '</em></span>'
          + (p.id&&unreadMap[String(p.id)]?'<span class="yk-proj-new-badge">NUEVO</span>':""));
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", on ? "true" : "false");
        if(!p.id){option.setAttribute("aria-label",allOptionLabel);option.setAttribute("data-yk-project-total",String(projectTotal));}
        option.addEventListener("click", function () {
          publishProject(p.id || null, true);
          setMenu(false); btn.focus();
        });
        menu.appendChild(option);
      });
      paintProjectSignal();
    }
    paintProject();
    function loadProjects(){
      var seq=++projectLoadSeq;
      return window.__ykJsonOnce(WORKER + "/projects", 4000, function () {
        return ykFetch("/projects", {cache:"no-store"}).then(function (r) { return r.json(); });
      }).then(function (d) {
        if(seq!==projectLoadSeq)return false;var result=projectNovelty.observe(d||{}),metadata=projectNovelty.meta(d||{});
        PROJECT_CATALOG = (d && d.projects || []).filter(function (p) {return p && p.id && String(p.status || "activo").toLowerCase() !== "archivado";});
        projectTotal=metadata.total;
        PROJECT_SCOPE = requestedProjectId();
        rememberProject(PROJECT_SCOPE);
        window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:PROJECT_SCOPE,project:activeProject(),ready:true}}));
        paintProject();announceProjects(result);if(isMenuOpen()){ackRenderedProjects();var firstOpen=menu.querySelector("button");if(firstOpen)firstOpen.focus();}return true;
      }).catch(function () {
        if(seq!==projectLoadSeq)return false;if(!PROJECT_CATALOG.length){projectTotal=0;PROJECT_SCOPE=null;paintProject();window.dispatchEvent(new CustomEvent("yk:project-change", {detail:{project_id:null,project:null,ready:true,error:true}}));}return false;
      });
    }
    loadProjects();
    window.addEventListener("yk:projects-changed",function(){loadProjects();});
    window.addEventListener("storage", function (event) {
      if(event.key===projectNovelty.key&&event.newValue){projectNovelty.sync(event.newValue);paintProject();return;}
      if (event.key !== PROJECT_SCOPE_KEY || !PROJECT_CATALOG.length) return;
      publishProject(validProjectId(event.newValue), true);
    });
    if(projectChannel)projectChannel.onmessage=function(event){var data=event&&event.data;if(data&&data.type==="project-novelty"){projectNovelty.sync(data.state);paintProject();}};

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !isMenuOpen();
      setMenu(open);
      if (open) { ackRenderedProjects(); var f = menu.querySelector("button"); if (f) f.focus(); }
    });

    // clic fuera cierra
    document.addEventListener("click", function (e) {
      if (isMenuOpen() && !wrap.contains(e.target)) setMenu(false);
    });

    // Escape en CAPTURA: si el menú está abierto, lo cierra y frena el evento
    // para que el handler de paneles (fase burbuja) no se dispare.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMenuOpen()) {
        setMenu(false);
        btn.focus();
        e.stopPropagation();
      }
    }, true);

    return wrap;
  }

  // MENÚ DEL CAJÓN (solo visible ≤520px, ver yk-frame.css) — mismos ítems que la
  // barra, misma fuente única (pageNav), mismo activo. Filas de 44px, activo
  // marcado con aria-current, y al navegar el cajón se deja CERRADO para no
  // aterrizar en la página siguiente con el panel tapando el contenido.
  function buildRailNav(items) {
    var nav = el("nav", "yk-rail-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    nav.appendChild(el("div", "yk-rail-navhd", "SECCIONES"));
    items.forEach(function (it) {
      var a = el("a", "yk-rail-navlink" + (it.active ? " on" : ""), it.label);
      a.href = it.href || "#";
      if (it.active) a.setAttribute("aria-current", "page");
      if (it.panel) {
        a.setAttribute("data-yk-open", it.panel);
        a.addEventListener("click", function (e) {
          e.preventDefault(); setOpen("left", false); setOpen(it.panel, true);
        });
      } else {
        a.addEventListener("click", function () { setOpen("left", false); });
      }
      var c = counterSpan(it.label, "yk-rail-navc");
      if (c) a.appendChild(c);
      nav.appendChild(a);
    });
    return nav;
  }

  // botón-icono cuadrático de la barra
  function icon(cls, panel, glyph, label) {
    // canon 2026-07-12: el botón es SOLO el glifo; el rótulo vive en el tooltip
    var b = el("button", cls,
      '<span class="yk-ico-gl" aria-hidden="true">' + glyph + '</span>');
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("data-yk-panel", panel);
    return b;
  }

  function fillSlot(slot, name) {
    var nodes = document.querySelectorAll('[data-yk-slot="' + name + '"]');
    if (!nodes.length) {
      // Avanzado siempre tiene su navegación canónica montada fuera del slot.
      // El mensaje de vacío sería falso y fue exactamente lo que vio Carlos.
      if (name !== "right" && !slot.children.length) slot.appendChild(el("div", "yk-empty", "— sin opciones en esta vista"));
    } else {
      // mover (no clonar): preserva los event listeners ya enlazados
      Array.prototype.forEach.call(nodes, function (n) {
        n.removeAttribute("data-yk-slot");
        slot.appendChild(n);
      });
    }
    // El sello del panel inferior vive en su cabecera: nunca ocupa una fila
    // operativa bajo la consola ni se solapa con el formulario de mensajes.
  }

  function isOpen(panel) { return OPEN_PANELS[panel] === true; }
  function setOpen(panel, v) {
    OPEN_PANELS[panel] = !!v;
    document.documentElement.classList.toggle("yk-open-" + panel, !!v);
    // reflejar el estado en el icono (encendido/apagado)
    var ico = document.querySelector('.yk-ico[data-yk-panel="' + panel + '"]');
    if (ico) ico.setAttribute("aria-pressed", v ? "true" : "false");
    if(panel==="bottom"){
      if(v)setTimeout(function(){if(FLEET.pty.term)try{FLEET.pty.fit.fit();}catch(e){}},0);
      else{disconnectSelectedPty(true);stopDesktopCapture(true,"Vista detenida: Experto está compactado.");stopDesktopWrite();}
    }
  }

  function wire(ico, panel) {
    // Canon visual: Opciones, Avanzado y Experto nacen compactados.
    setOpen(panel, false);
    ico.addEventListener("click", function () {
      setOpen(panel, !isOpen(panel));
    });
  }

  function wireExpertResize(rail, handle) {
    var MIN=190, STEP=32, dragging=false;
    function maxHeight(){return Math.max(MIN,window.innerHeight-Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--yk-bar-h")||46)-8);}
    function apply(height){var value=Math.max(MIN,Math.min(maxHeight(),Math.round(height)));rail.style.height=value+"px";handle.setAttribute("aria-valuemin",String(MIN));handle.setAttribute("aria-valuemax",String(Math.round(maxHeight())));handle.setAttribute("aria-valuenow",String(value));}
    function current(){return rail.getBoundingClientRect().height||240;}
    handle.addEventListener("pointerdown",function(event){dragging=true;handle.setPointerCapture(event.pointerId);document.documentElement.classList.add("yk-resizing-expert");event.preventDefault();});
    handle.addEventListener("pointermove",function(event){if(dragging)apply(window.innerHeight-event.clientY);});
    function stop(event){if(!dragging)return;dragging=false;try{handle.releasePointerCapture(event.pointerId);}catch(_){}document.documentElement.classList.remove("yk-resizing-expert");}
    handle.addEventListener("pointerup",stop);handle.addEventListener("pointercancel",stop);
    handle.addEventListener("dblclick",function(){rail.style.height="";handle.removeAttribute("aria-valuenow");});
    handle.addEventListener("keydown",function(event){var value=current();if(event.key==="ArrowUp")value+=STEP;else if(event.key==="ArrowDown")value-=STEP;else if(event.key==="Home")value=MIN;else if(event.key==="End")value=maxHeight();else return;event.preventDefault();apply(value);});
    window.addEventListener("resize",function(){if(rail.style.height)apply(current());});
  }

  function closeRailOnNavigation(rail, panel) {
    rail.addEventListener("click", function (event) {
      var link = event.target.closest("a[href]");
      if (link && rail.contains(link)) setOpen(panel, false);
    });
  }

  function wireExpertFetch(root) {
    var out = root.querySelector(".yk-expert-out");
    var btns = root.querySelectorAll("[data-yk-fetch]");
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener("click", function () {
        var path = b.getAttribute("data-yk-fetch").replace("{id}", encodeURIComponent(urlId()));
        var pick = b.getAttribute("data-yk-pick"); // subcampo opcional
        if (out) out.textContent = "… solicitando " + path;
        // fetch normal de window: acceso.js ya inyecta el Bearer al llamar al worker
        window.fetch(WORKER + path, { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var data = (pick && d && d[pick] != null) ? d[pick] : d;
            if (out) out.textContent = JSON.stringify(data, null, 2);
          })
          .catch(function () {
            if (out) out.textContent = "El worker no responde ahora (o la sesión ha caducado).";
          });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
