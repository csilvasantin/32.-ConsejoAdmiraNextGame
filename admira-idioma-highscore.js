/* Highscore: explicit ES/EN UI keys and project names. Data titles stay verbatim. */
(function (root) {
  "use strict";
  var messages = {
    es: {
      hour:"Hora", day:"Día", week:"Semana", month:"Mes",
      agent:"Agente", advisor:"Consejero", agents:"Agentes", advisors:"Consejeros",
      all:"Todos", active:"Activos", manual:"Selección manual",
      highscorePeriod:"Periodo de Highscore: {period}. Carrera en directo",
      rankingPeriod:"Periodo del ranking: {period}",
      scopeSummary:"{people}: {mode} · {shown}/{total}", lifeFilter:"filtro con vida",
      compactRow:"{count} fila visible (compacto)", compactRows:"{count} filas visibles (compacto)",
      historyStale:"Histórico sin actualizar; pueden faltar agentes o puntos.",
      dailyStale:"Puntuación del día sin actualizar; pueden faltar agentes o puntos.",
      noMorePeople:"No hay más participantes que mostrar", showAllPeople:"Ver los {count} participantes", showFirstPeople:"Ver solo los {count} primeros",
      projectWorking:"Proyecto en curso · sale de su trabajo de las últimas horas",
      projectDeclared:"Proyecto principal de hoy · declarado expresamente; no hay una tarea activa que lo sustituya",
      projectStructural:"Proyecto principal estructural · asignado en el censo; hoy no se declaró otro",
      projectDefault:"Sin proyecto concreto del día · Galaxia Admira, el default de la flota",
      projectAlso:"hoy además ha tocado {project}", projectUnknown:"Proyecto no indicado",
      workUnavailableLabel:"TRABAJO NO DISPONIBLE", workUnavailable:"No se pudo consultar el trabajo registrado. La ausencia de carriles no indica inactividad.",
      workOutsideLabel:"TRABAJO FUERA DE LA SELECCIÓN", workOutside:"{shown} de {total} participantes verificados en esta selección. Revisa el filtro de agentes para ver los demás.",
      workEmptyLabel:"SIN TRABAJO VERIFICADO", workEmpty:"No hay trabajo verificado visible en este ámbito. Puede existir actividad todavía sin vincular a Yokup.",
      workPresence:"Carriles desde presencia verificada + focus (active-work no disponible o incompleto). Ranking y podio no cambian.",
      workRecent:"Últimos trabajos finalizados. La actividad actual de otras sesiones no está verificada.",
      workRegistered:"Carriles de trabajo registrado, presencia+focus o actividad Desktop APP verificada. La ausencia de otro agente no confirma inactividad.",
      workAdvisors:"Carriles de trabajo verificado de hoy o de encargos y misiones en curso. La animación del trabajo diario no añade puntos.",
      warmupAgents:"Todos nuestros agentes están calentando 🙂", warmupAdvisors:"Todos nuestros consejeros están calentando 🙂",
      advisorDailyWork:"Trabajo verificado de hoy", verifiedDailyActivity:"Actividad del día verificada",
      show:"Mostrar", hide:"Ocultar", scoring:"Cómo se puntúa",
      pauseRace:"Pausar carrera para leer las misiones", resumeRace:"Reanudar carrera desde el punto de pausa",
      racePaused:"Carrera pausada. Pulsa para reanudarla.", showPodium:"Mostrar podio", hidePodium:"Ocultar podio",
      raceCountdown:"Próxima actualización de puntuación en {seconds} segundos. Pulsa para parar la carrera.",
      raceStart:"{phase} · salida en {seconds} segundos. Pulsa para parar la carrera.",
      raceFinish:"Meta · celebrando el resultado. Pulsa para parar la carrera.",
      ready:"READY", set:"SET", go:"GO",
      observation:"Actividad sin verificar", openUnlinked:"abierto, sin trabajo vinculado",
      checkingWork:"Comprobando trabajo registrado…", noStartTime:"Hora de inicio no disponible",
      partialDataHeading:"No pude leer todo", partialDataExplanation:"El marcador sale con lo que sí llegó, no con datos inventados.",
      formulaDay:'Solo cuenta la actividad del <b>día actual en Madrid</b>; el marcador vuelve a cero cada medianoche.',
      formulaPeriods:'<b>Periodos del podio:</b> Hora es la hora natural actual; Día va desde las 00:00; Semana va desde el lunes; Mes va desde el día 1. Todos terminan en el momento actual. Semana y Mes pueden dar la misma cifra al comienzo del mes si no hubo puntos en los días de esa semana anteriores al día 1.',
      formulaObjective:'Cada <b>objetivo creado hoy</b> por un agente identificado: <b>{objective}</b>.',
      formulaWindow:'Cada <b>ventana de decisión generada</b>: <b>{window}</b>. La apertura automática admite una sola ventana cada 60 minutos; una ventana por hora suma <b>240 puntos en 24 horas</b>. Es un <b>acumulado diario, no ventanas simultáneas</b>; cerrarla o generar misiones no vuelve a sumarla.',
      formulaMission:'Cada <b>misión ejecutada hoy</b> —su primera entrada real en curso—: <b>{mission}</b>. Los reintentos no duplican puntos.',
      formulaTask:'Cada <b>tarea A·B·C trabajada hoy</b>: <b>15</b>, y <b>+10</b> si está en curso. La actividad del agente, subagente e infraagente se reúne en su familia sin duplicar A1…C3.',
      formulaBonus:'<b>Bonus Track gratuito:</b> cada victoria confirmada por Yokup suma <b>+1</b> a la misión del Running Man ganador y a su marcador. La carrera es compartida: recargar o abrir otra pestaña no repite el premio. Solo participa trabajo en curso vinculado a una misión; los trabajos sin actividad confirmada y las sesiones sin misión no reciben bonus.',
      formulaHeartbeat:'<b>El latido no da puntos.</b> El propio <b>número de posición parpadea en verde</b> cuando recibió uno hace menos de 15 minutos. Los cinco indicadores muestran siempre una pareja numérica <b>hora / total del día</b>; una hora sin actividad se representa con <b>0</b>.',
      formulaRunning:'<b>Running Man en color:</b> existe trabajo canónico abierto y su última marca de avance material tiene como máximo <b>{idleMinutes} minutos</b>. Tener el proceso o la máquina conectados no basta: la presencia nunca hace correr ni colorea por sí sola.',
      formulaStale:'<b>Running Man ámbar · trabajo en curso sin actividad confirmada:</b> la misión o tarea continúa asignada, pero no tiene una marca fiable o lleva más de <b>{idleMinutes} minutos</b> sin progreso material. Recorre la pista sólo como aviso, sin puesto ni puntos extra, durante <b>{cycles} ciclos de {cycleSeconds} segundos</b> —como máximo <b>{maxDuration}</b>— y después desaparece hasta que cambie el trabajo o vuelva a registrar avance.',
      formulaFinished:'<b>Running Man gris quieto · trabajo finalizado:</b> la misión o tarea ya terminó. Sólo rellena una calle libre cuando hay menos de tres trabajos activos; puede seguir visible hasta <b>24 horas desde el cierre</b>, pero desaparece antes si lo sustituye un trabajo activo o un cierre más reciente.',
      formulaEmpty:'<b>No aparece corredor:</b> no hay una asignación demostrable en la última hora, una sesión exacta abierta ni un cierre elegible de las últimas 24 horas. Si la fuente de trabajo no responde se indica “trabajo no disponible”; no se conserva una carrera antigua como si siguiera viva.',
      formulaComputer:'<b>Ordenador:</b> en verde el que late ahora, apagado el conocido sin latido reciente. Un mismo agente corre en varios a la vez.',
      formulaProject:'<b>Proyecto:</b> manda el <b>proyecto principal declarado para hoy</b> — la asignación de Carlos. Si ese día se ha tocado además otra cosa, se dice en el detalle de la pastilla. Sin declaración, manda la tarea activa (ventana, misión u objetivo) y sólo después el proyecto estructural del censo.',
      formulaActivity:'El <b>número verde que parpadea</b> señala qué hace el agente ahora: objetivo, ventana, misión o tarea. Si ninguno parpadea, está <b>idle</b>. Solo se muestra una señal, priorizando la tarea activa.',
      formulaCounters:'Hoy puntúan <b>{tasks}</b> tareas. La bitácora ha anotado <b>{objectives}</b> objetivos, <b>{windows}</b> ventanas y <b>{missions}</b> misiones; ',
      formulaUnattributed:'<b>{unattributed}</b> eventos automáticos o sin agente no reparten puntos. ',
      formulaInventory:'Se comprueban además <b>{presence}</b> registros de presencia y <b>{machines}</b> inventarios de equipo para distinguir 0 de — y registrado de encendido, sin alterar la puntuación.',
      formulaIdentity:'<b>Identidad normativa:</b> cada rótulo une agente y máquina: <b>NeoMBP16</b>, <b>MorfeoMBA16</b>… Si una actividad antigua no trae equipo, hereda el último equipo observado de esa familia; sin ninguna evidencia se marca <b>SINMAQ</b>. <a href="/normativa">Ver normativa →</a>'
    },
    en: {
      hour:"Hour", day:"Day", week:"Week", month:"Month",
      agent:"Agent", advisor:"Advisor", agents:"Agents", advisors:"Advisors",
      all:"All", active:"Active", manual:"Manual selection",
      highscorePeriod:"Highscore period: {period}. Live race",
      rankingPeriod:"Ranking period: {period}",
      scopeSummary:"{people}: {mode} · {shown}/{total}", lifeFilter:"life filter",
      compactRow:"{count} visible row (compact)", compactRows:"{count} visible rows (compact)",
      historyStale:"History has not been updated; some participants or points may be missing.",
      dailyStale:"Today's score has not been updated; some participants or points may be missing.",
      noMorePeople:"No more participants to show", showAllPeople:"Show all {count} participants", showFirstPeople:"Show only the first {count}",
      projectWorking:"Current project · based on work in the last few hours",
      projectDeclared:"Today's main project · explicitly declared; no active task overrides it",
      projectStructural:"Structural main project · assigned in the roster; no other project declared today",
      projectDefault:"No specific project today · Admira Galaxy, the fleet default",
      projectAlso:"also worked on {project} today", projectUnknown:"Project not specified",
      workUnavailableLabel:"WORK UNAVAILABLE", workUnavailable:"Registered work could not be retrieved. The absence of lanes does not indicate inactivity.",
      workOutsideLabel:"WORK OUTSIDE THE SELECTION", workOutside:"{shown} of {total} verified participants in this selection. Check the agent filter to see the others.",
      workEmptyLabel:"NO VERIFIED WORK", workEmpty:"No verified work is visible in this scope. There may be activity that has not yet been linked to Yokup.",
      workPresence:"Lanes from verified presence + focus (active-work unavailable or incomplete). Ranking and podium are unchanged.",
      workRecent:"Most recently completed work. Current activity in other sessions is unverified.",
      workRegistered:"Lanes from registered work, presence+focus or verified Desktop APP activity. The absence of another agent does not confirm inactivity.",
      workAdvisors:"Lanes from verified work today or orders and missions in progress. Daily work animation does not add points.",
      warmupAgents:"All our agents are warming up 🙂", warmupAdvisors:"All our advisors are warming up 🙂",
      advisorDailyWork:"Verified work today", verifiedDailyActivity:"Verified daily activity",
      show:"Show", hide:"Hide", scoring:"How scoring works",
      pauseRace:"Pause the race to read the missions", resumeRace:"Resume the race from the paused position",
      racePaused:"Race paused. Click to resume.", showPodium:"Show podium", hidePodium:"Hide podium",
      raceCountdown:"Next score update in {seconds} seconds. Click to pause the race.",
      raceStart:"{phase} · starting in {seconds} seconds. Click to pause the race.",
      raceFinish:"Finish · celebrating the result. Click to pause the race.",
      ready:"READY", set:"SET", go:"GO",
      observation:"Unverified activity", openUnlinked:"open, with no linked work",
      checkingWork:"Checking registered work…", noStartTime:"Start time unavailable",
      partialDataHeading:"Some data could not be read", partialDataExplanation:"The scoreboard shows the data that arrived, without inventing missing data.",
      formulaDay:'Only activity from the <b>current day in Madrid</b> counts; the scoreboard resets at midnight.',
      formulaPeriods:'<b>Podium periods:</b> Hour is the current clock hour; Day starts at 00:00; Week starts on Monday; Month starts on day 1. All end at the current moment. Week and Month can show the same figure at the start of the month if there were no points earlier in that week before day 1.',
      formulaObjective:'Each <b>goal created today</b> by an identified agent: <b>{objective}</b>.',
      formulaWindow:'Each <b>decision window generated</b>: <b>{window}</b>. Automatic opening allows one window every 60 minutes; one window per hour adds <b>240 points in 24 hours</b>. This is a <b>daily total, not simultaneous windows</b>; closing a window or generating missions does not count it again.',
      formulaMission:'Each <b>mission executed today</b> —its first actual start—: <b>{mission}</b>. Retries do not duplicate points.',
      formulaTask:'Each <b>A·B·C task worked on today</b>: <b>15</b>, plus <b>+10</b> while in progress. Agent, subagent and infra-agent activity is grouped by family without duplicating A1…C3.',
      formulaBonus:'<b>Free Bonus Track:</b> each win confirmed by Yokup adds <b>+1</b> to the winning Running Man’s mission and scoreboard. The race is shared: reloading or opening another tab does not repeat the reward. Only work in progress linked to a mission qualifies; work without confirmed activity and sessions without a mission receive no bonus.',
      formulaHeartbeat:'<b>A heartbeat gives no points.</b> The <b>position number flashes green</b> when it received a point less than 15 minutes ago. The five indicators always show a numeric pair: <b>hour / daily total</b>; an hour without activity shows <b>0</b>.',
      formulaRunning:'<b>Colored Running Man:</b> canonical work is open and its last material progress was at most <b>{idleMinutes} minutes</b> ago. Having a connected process or machine is not enough: presence alone never starts or colors a runner.',
      formulaStale:'<b>Amber Running Man · work in progress without confirmed activity:</b> the mission or task remains assigned, but has no reliable timestamp or has had no material progress for more than <b>{idleMinutes} minutes</b>. It crosses the track as a warning, without a place or extra points, for <b>{cycles} cycles of {cycleSeconds} seconds</b> —at most <b>{maxDuration}</b>— then disappears until the work changes or progress is recorded again.',
      formulaFinished:'<b>Stationary gray Running Man · completed work:</b> the mission or task has ended. It only fills a free lane when there are fewer than three active jobs; it can remain visible for up to <b>24 hours after completion</b>, but disappears sooner if active work or a more recent completion replaces it.',
      formulaEmpty:'<b>No runner appears:</b> there is no demonstrable assignment in the last hour, exact open session or eligible completion in the last 24 hours. If the work source does not respond, “work unavailable” is shown; an old race is not retained as though it were still live.',
      formulaComputer:'<b>Computer:</b> green means a current heartbeat; a known computer without a recent heartbeat is dimmed. An agent can run on several computers at once.',
      formulaProject:'<b>Project:</b> the <b>main project declared for today</b> takes priority — Carlos’s assignment. Any other work done that day appears in the chip’s details. Without a declaration, the active task (window, mission or goal) takes priority, followed by the structural project in the roster.',
      formulaActivity:'The <b>flashing green number</b> shows what the agent is doing now: goal, window, mission or task. If none flashes, it is <b>idle</b>. Only one signal is shown, prioritizing the active task.',
      formulaCounters:'Today, <b>{tasks}</b> tasks score points. The log has recorded <b>{objectives}</b> goals, <b>{windows}</b> windows and <b>{missions}</b> missions; ',
      formulaUnattributed:'<b>{unattributed}</b> automatic events or events without an agent do not award points. ',
      formulaInventory:'A further <b>{presence}</b> presence records and <b>{machines}</b> machine inventories are checked to distinguish 0 from — and registered from running, without changing the score.',
      formulaIdentity:'<b>Identity policy:</b> each label combines agent and machine: <b>NeoMBP16</b>, <b>MorfeoMBA16</b>… If old activity has no machine, it inherits the last observed machine for that family; without any evidence it is marked <b>SINMAQ</b>. <a href="/normativa">View policy →</a>'
    }
  };
  var projects = {
    "galaxia-admira":{es:"Galaxia Admira", en:"Admira Galaxy"},
    "templo-de-la-soledad":{es:"Templo de la Soledad", en:"Temple of Solitude"},
    "generador-de-presentaciones":{es:"Generador de Presentaciones", en:"Presentation Generator"},
    "generador-de-presites":{es:"Generador de Presites", en:"Presite Generator"},
    "generador-de-informes":{es:"Generador de Informes", en:"Report Generator"},
    "generador-presupuestos":{es:"Generador de Presupuestos", en:"Budget Generator"},
    "admira-etiqueta-digital":{es:"Admira Etiqueta Digital", en:"Admira Digital Label"},
    "admira-live":{es:"Admira Live · Consejo", en:"Admira Live · Council"},
    "altadis-estancos-bcn":{es:"Altadis · Estancos Barcelona 9", en:"Altadis · Barcelona Tobacconists 9"},
    "cafebreria-xpacio-001":{es:"Cafebrería · Xpacio demo", en:"Café Bookshop · Xpacio demo"},
    "yokup-aa7b7790-5b84-4702-9a3a-ca7e66b72ef7":{es:"Estanco 1", en:"Tobacconist 1"},
    "la-incubadora":{es:"La Incubadora", en:"The Incubator"},
    "smith-ascii":{es:"Laboratorio ASCII", en:"ASCII Laboratory"},
    "eink":{es:"Tinta electrónica · SY11-ab", en:"Electronic Ink · SY11-ab"},
    "clearchannel-tv":{es:"Venta de activos · Clear Channel + Admira App", en:"Asset Sales · Clear Channel + Admira App"},
    "yokup-ideas-objetivos":{es:"Yokup · ideas-objetivos", en:"Yokup · ideas-goals"},
    "prueba-numero-5134":{es:"Prueba número 40 · no borrar", en:"Test number 40 · do not delete"}
  };
  function validateCatalog(catalog) {
    if (!catalog || !catalog.es || !catalog.en) throw new Error("Highscore requires both es and en catalogs");
    var keys = Array.from(new Set(Object.keys(catalog.es).concat(Object.keys(catalog.en))));
    keys.forEach(function (key) {
      ["es", "en"].forEach(function (lang) {
        if (typeof catalog[lang][key] !== "string" || !catalog[lang][key].trim()) throw new Error("Missing Highscore translation: " + lang + "." + key);
      });
      var params = function (value) { return (value.match(/\{\w+\}/g) || []).sort().join("|"); };
      if (params(catalog.es[key]) !== params(catalog.en[key])) throw new Error("Mismatched Highscore parameters: " + key);
    });
    return true;
  }
  function lang(value) {
    return (value || root.AdmiraIdioma && root.AdmiraIdioma.lang && root.AdmiraIdioma.lang() || root.document && root.document.documentElement.lang) === "en" ? "en" : "es";
  }
  function t(key, language, params) {
    var value = messages[lang(language)][key];
    if (typeof value !== "string") throw new Error("Unknown Highscore translation key: " + key);
    return value.replace(/\{(\w+)\}/g, function (all, name) { return params && params[name] != null ? String(params[name]) : all; });
  }
  function normalize(value) { return String(value || "").trim().toLocaleLowerCase(); }
  function project(value, language) {
    var name = String(value || ""), key = normalize(name), result = name;
    Object.keys(projects).some(function (id) {
      var item = projects[id];
      if (key !== id && key !== normalize(item.es) && key !== normalize(item.en)) return false;
      result = item[lang(language)]; return true;
    });
    return result;
  }
  validateCatalog(messages);
  Object.keys(projects).forEach(function (id) { validateCatalog({ es:{name:projects[id].es}, en:{name:projects[id].en} }); });
  root.HsIdioma = { messages:messages, projects:projects, t:t, project:project, validateCatalog:validateCatalog };

  // The shared DOM translator handles existing static UI and rerendered text.
  // A bidirectional project map above also handles direct EN → ES visits.
  var dictionary = {};
  Object.keys(messages.es).forEach(function (key) {
    if (messages.es[key] !== messages.en[key] && !/\{\w+\}/.test(messages.es[key])) dictionary[messages.es[key]] = messages.en[key];
  });
  Object.keys(projects).forEach(function (id) { dictionary[projects[id].es] = projects[id].en; });
  var rules = [
    [/^Periodo de Highscore: (Hora|Día|Semana|Mes)\. Carrera en directo$/, function (m) { return t("highscorePeriod", "en", {period:t(({Hora:"hour",Día:"day",Semana:"week",Mes:"month"})[m[1]], "en")}); }],
    [/^Periodo del ranking: (Hora|Día|Semana|Mes)$/, function (m) { return t("rankingPeriod", "en", {period:t(({Hora:"hour",Día:"day",Semana:"week",Mes:"month"})[m[1]], "en")}); }],
    [/^Actividad sin verificar · (\d+) (agente|agentes|consejero|consejeros)$/, function (m) { return "Unverified activity · " + m[1] + " " + ({agente:"agent",agentes:"agents",consejero:"advisor",consejeros:"advisors"})[m[2]]; }],
    [/^(.+) · abierto, sin trabajo vinculado$/, "$1 · open, with no linked work"],
    [/^Proyecto responsable: (.+)$/, function (m) { return "Responsible project: " + project(m[1], "en"); }],
    [/^Proyecto responsable (.+)$/, function (m) { return "Responsible project " + project(m[1], "en"); }],
    [/^Tiempo transcurrido (.+)$/, "Elapsed time $1"],
    [/^Inició a las (.+)$/, "Started at $1"],
    [/^Finalizó a las (.+) · Duración (.+)$/, "Finished at $1 · Duration $2"],
    [/^Próxima actualización de puntuación en (\d+) segundos\. Pulsa para parar la carrera\.$/, function (m) { return t("raceCountdown", "en", {seconds:m[1]}); }],
    [/^(READY|SET|GO) · salida en (\d+) segundos\. Pulsa para parar la carrera\.$/, function (m) { return t("raceStart", "en", {phase:m[1],seconds:m[2]}); }]
  ];
  if (root.AdmiraIdioma && root.AdmiraIdioma.extra) root.AdmiraIdioma.extra(dictionary, rules);
  else (root.AdmiraIdiomaExtra = root.AdmiraIdiomaExtra || []).push([dictionary, rules]);
})(typeof globalThis !== "undefined" ? globalThis : this);
