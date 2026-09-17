/* Detalle factual del Highscore. Funciones puras compartidas con las pruebas. */
(function (root) {
  "use strict";
  var TIME_ZONE = "Europe/Madrid";
  var DAY = new Intl.DateTimeFormat("en-CA", { timeZone:TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit" });
  var HOUR = new Intl.DateTimeFormat("es-ES", { timeZone:TIME_ZONE, hour:"2-digit", hour12:false });
  var PERIODS = ["today", "yesterday", "week", "month", "year"];
  var TYPES = ["all", "objective", "window", "mission", "task"];
  var ORDERS = ["desc", "asc"];
  var METRICS = ["objectives", "windows", "missions", "tasks", "points"];
  var MONTH = new Intl.DateTimeFormat("es-ES", { timeZone:TIME_ZONE, month:"long", year:"numeric" });

  function text(value) { return String(value == null ? "" : value).trim(); }
  function ms(value) { var n = Number(value) || 0; return n > 0 && n < 1e11 ? n * 1000 : n; }
  function day(value) { var n = ms(value); return n ? DAY.format(new Date(n)) : ""; }
  function today(value, now) { return day(value) === day(now || Date.now()); }
  function key(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function identityParts(value, machine, identity) {
    var parsed = identity.parse(value), sf = identity.suffix(machine) || parsed.suffix || "";
    return { base:identity.key(parsed.persona), suffix:sf, role:parsed.role || "main" };
  }
  function sameFamily(value, machine, target, identity) {
    if (!text(value)) return false;
    var candidate = identityParts(value, machine, identity), wanted = identityParts(target, "", identity);
    return candidate.base === wanted.base && candidate.suffix === wanted.suffix;
  }
  /* Vale la identidad canónica (NeoMBAAzul) y también la escritura antigua que
     resuelve a ella (NeoAzul, OraculoMacMini, Agente Smith Azul): los enlaces ya
     compartidos tienen que seguir abriendo. Lo que NO vale es una persona sin
     apellido de equipo (normativa reglas 03 y 04). */
  function validAgent(value, identity) {
    var parsed = identity.parse(value), canonical = parsed.suffix && parsed.role === "main"
      ? identity.display(parsed.persona, parsed.suffix) : "";
    return !!canonical && /^(?:oraculo|neo|morfeo|trinity|smith|agentesmith|whiterabbit|niobe)/.test(key(canonical));
  }
  function taskIdentity(task, identity) {
    var owner = text(task.owner || task.agent_identity), generic = /^infra(?:agente)?$/i.test(owner) ? "infra" : /^sub(?:agente)?$/i.test(owner) ? "sub" : "";
    return generic ? identity.scoped(task.assignee, task.loc, generic) : (owner || task.assignee || "");
  }
  function mainTask(code) { return /^([a-c])(?:[1-3])?$/i.test(text(code)); }

  function validPeriod(value) { return PERIODS.indexOf(text(value).toLowerCase()) >= 0; }
  function validType(value) { return TYPES.indexOf(text(value).toLowerCase()) >= 0; }
  function validOrder(value) { return ORDERS.indexOf(text(value).toLowerCase()) >= 0; }
  function canonicalType(value) {
    var aliases={objective:"objective",objectives:"objective",idea:"objective",objetivo:"objective",
      window:"window",windows:"window",decision:"window",ventana:"window",
      mission:"mission",missions:"mission",mision:"mission",
      task:"task",tasks:"task",tarea:"task"};
    return aliases[key(value)] || "";
  }
  function queryState(search) {
    var params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    var period = text(params.get("period")).toLowerCase(), type=text(params.get("type")).toLowerCase(), order=text(params.get("order")).toLowerCase();
    return { agent:text(params.get("agent")), projectId:text(params.get("project_id")),
      period:validPeriod(period) ? period : "today", type:validType(type) ? type : "all",
      order:validOrder(order) ? order : "desc" };
  }
  function detailUrl(state) {
    var params = new URLSearchParams();
    params.set("agent", text(state && state.agent));
    params.set("project_id", text(state && state.projectId));
    params.set("period", validPeriod(state && state.period) ? state.period : "today");
    params.set("type", validType(state && state.type) ? state.type : "all");
    params.set("order", validOrder(state && state.order) ? state.order : "desc");
    return "/highscoreDetail?" + params.toString();
  }

  function isoDate(value) {
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    return match ? new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)) : null;
  }
  function dateKey(value) { return value.toISOString().slice(0,10); }
  function shiftDay(value, amount) { var date=isoDate(value);if(!date)return "";date.setUTCDate(date.getUTCDate()+amount);return dateKey(date); }
  function monday(value) { var date=isoDate(value);if(!date)return "";return shiftDay(value,-((date.getUTCDay()+6)%7)); }
  function shortDate(value) { return text(value).slice(8,10)+"/"+text(value).slice(5,7); }
  function groupKey(value, period) { return period==="year"?text(value).slice(0,7):period==="month"?monday(value):text(value); }
  function groupMeta(keyValue, period, firstDay, lastDay) {
    if(period==="year"){
      var monthDate=isoDate(keyValue+"-01"),monthLabel=monthDate?MONTH.format(monthDate):keyValue;
      return {key:keyValue,start:firstDay,end:lastDay,label:monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1),grain:"month"};
    }
    if(period==="month"){
      var naturalEnd=shiftDay(keyValue,6),label="Semana "+shortDate(keyValue)+"–"+shortDate(naturalEnd);
      if(firstDay!==keyValue||lastDay!==naturalEnd)label+=" · datos "+shortDate(firstDay)+"–"+shortDate(lastDay);
      return {key:keyValue,start:firstDay,end:lastDay,naturalStart:keyValue,naturalEnd:naturalEnd,label:label,grain:"week"};
    }
    return {key:keyValue,start:firstDay,end:lastDay,label:shortDate(keyValue),grain:"day"};
  }
  function chronologicalGroups(rows, period, order) {
    var grouped=Object.create(null),sequence=[];
    (rows||[]).forEach(function(row){var rowDay=text(row&&row.day),group=groupKey(rowDay,period);if(!rowDay||!group)return;
      if(!grouped[group]){grouped[group]={key:group,rows:[],first:rowDay,last:rowDay};sequence.push(group);}
      grouped[group].rows.push(row);if(rowDay<grouped[group].first)grouped[group].first=rowDay;if(rowDay>grouped[group].last)grouped[group].last=rowDay;});
    sequence.sort(function(a,b){return (validOrder(order)?order:"desc")==="asc"?a.localeCompare(b):b.localeCompare(a);});
    return sequence.map(function(group){var current=grouped[group],meta=groupMeta(group,period,current.first,current.last);return Object.assign(meta,{rows:current.rows.slice()});});
  }
  function evolutionGroups(days, period, order) {
    return chronologicalGroups(days,period,order).map(function(group){var total={};METRICS.forEach(function(metric){total[metric]=0;});
      group.rows.forEach(function(row){METRICS.forEach(function(metric){total[metric]+=Number(row[metric]);});});
      return Object.assign({},group,total,{day:group.key,count:group.rows.length});});
  }
  function timelineGroups(timeline, period, order) {
    var selected=validOrder(order)?order:"desc",events=Array.from(timeline||[]).sort(function(a,b){return selected==="asc"?a.at-b.at:b.at-a.at;});
    return chronologicalGroups(events,period,selected).map(function(group){return Object.assign({},group,{events:group.rows});});
  }

  function nextWindow(payload, agent, identity) {
    if (!(payload && payload.ok === true) || !Array.isArray(payload.turnos)) return null;
    for (var i=0;i<payload.turnos.length;i++) {
      var row=payload.turnos[i]||{}, next=Number(row.proxima);
      if (sameFamily(row.agent, "", agent, identity) && Number.isFinite(next) && next > 0) {
        return { at:next, turn:Number(row.turno)||0, agents:Number(payload.agentes)||0,
          stepMinutes:Number(payload.pasoMin)||0 };
      }
    }
    return null;
  }
  function windowCountdown(nextAt, now) {
    var seconds=Math.max(0,Math.ceil((Number(nextAt)-Number(now||Date.now()))/1000));
    if (!seconds) return "ahora";
    var hours=Math.floor(seconds/3600), minutes=Math.floor((seconds%3600)/60), rest=seconds%60;
    return (hours?hours+" h ":"")+minutes+" min "+String(rest).padStart(2,"0")+" s";
  }

  /* La respuesta del scheduler no es permiso para abrir una lista genérica. La
     UI conserva el alcance exacto y pre-valida la decisión antes de navegar. */
  function decisionUrl(payload, state) {
    var status=text(payload && payload.status), decisionId=text(payload && payload.decision_id);
    if ((status!=="created"&&status!=="existing")||!decisionId) return "";
    var params=new URLSearchParams();
    params.set("decision_id",decisionId);params.set("agent",text(state&&state.agent));
    params.set("project_id",text(state&&state.projectId));
    return "/decisiones?"+params.toString();
  }
  function onIdleDecisionError(decision, state, identity, expectedId) {
    if (!(decision&&decision.ok===true)||text(decision.id)!==text(expectedId)) return "La decisión recibida no coincide con la solicitada.";
    if (text(decision.status)!=="pending") return "La decisión recibida ya no está pendiente.";
    if (text(decision.project_id)!==text(state&&state.projectId)) return "La decisión recibida pertenece a otro proyecto.";
    if (!text(decision.agent)||!sameFamily(decision.agent,decision.machine,state&&state.agent,identity)) return "La decisión recibida pertenece a otro agente.";
    var options=decision.options, recommended=Number(decision.recommended);
    if (!Array.isArray(options)||options.length!==5||options.some(function(option){return !text(option);})) return "La decisión recibida no contiene exactamente cinco opciones válidas.";
    if (!/volver\s+atr[aá]s/i.test(text(options[3]))||!/custom|escribe\s+la\s+mejora/i.test(text(options[4]))) return "La decisión recibida no respeta el orden canónico de opciones.";
    if (!Number.isInteger(recommended)||recommended<0||recommended>2) return "La decisión recibida no tiene una recomendación canónica.";
    return "";
  }

  function timelineForType(timeline, type) {
    var selected=validType(type) ? type : "all";
    return selected === "all" ? Array.from(timeline || []) : (timeline || []).filter(function(event){
      return canonicalType(event && event.type) === selected;
    });
  }
  function metricForType(row, type) {
    var field={all:"points",objective:"objectives",window:"windows",mission:"missions",task:"tasks"}[validType(type)?type:"all"];
    return Math.max(0,Number(row && row[field])||0);
  }

  /* El servidor es la única fuente del orden de la clasificación. Esta capa
     valida el scope y la identidad de cada fila antes de habilitar navegación;
     un ranking parcial o ambiguo se degrada honestamente a «no disponible». */
  function rankingFromHistory(value, requested, identity) {
    if (!value || text(value.project_id) !== text(requested && requested.projectId) ||
      text(value.period) !== text(requested && requested.period) || !Array.isArray(value.ordered)) return null;
    /* null significa «este agente no puntuó»: Number(null) sería 0 y lo haría
       pasar falsamente por el líder. El índice del contrato debe ser numérico. */
    var currentIndex=value.current_index == null ? null : (typeof value.current_index === "number" ? value.current_index : NaN);
    if (currentIndex !== null && (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= value.ordered.length)) return null;
    var seen=Object.create(null), ordered=[], previousPoints=Infinity, requestedMatches=[];
    for (var i=0;i<value.ordered.length;i++) {
      var row=value.ordered[i]||{}, agent=text(row.agent), points=Number(row.points), position=Number(row.position), parsed=identity.parse(agent);
      var identityKey=identity.key(parsed.persona)+"|"+text(parsed.suffix);
      if (!validAgent(agent,identity) || seen[identityKey] || !Number.isFinite(points) || points <= 0 ||
        !Number.isInteger(position) || position !== i+1 || points > previousPoints) return null;
      seen[identityKey]=true;previousPoints=points;
      if (sameFamily(agent,"",requested.agent,identity)) requestedMatches.push(i);
      ordered.push({agent:agent,points:points,position:position});
    }
    if (currentIndex === null ? requestedMatches.length !== 0 : requestedMatches.length !== 1 || requestedMatches[0] !== currentIndex) return null;
    return {projectId:text(value.project_id),period:text(value.period),ordered:ordered,currentIndex:currentIndex};
  }
  function rankedAgentAt(value, offset) {
    if (!value || !Array.isArray(value.ordered) || value.ordered.length < 2 ||
      !Number.isInteger(value.currentIndex) || value.currentIndex < 0 || value.currentIndex >= value.ordered.length) return null;
    var target=value.currentIndex+offset;
    return target >= 0 && target < value.ordered.length ? value.ordered[target] || null : null;
  }
  function previousRankedAgent(value) { return rankedAgentAt(value,-1); }
  function nextRankedAgent(value) { return rankedAgentAt(value,1); }
  function rankingComparisonRows(value) {
    if (!value || !Array.isArray(value.ordered)) return [];
    var max=value.ordered.length ? Number(value.ordered[0].points) : 0;
    return value.ordered.map(function(row,index){return {agent:row.agent,points:row.points,position:row.position,
      ratio:max ? row.points/max : 0,current:index===value.currentIndex};});
  }

  /* Serie comparativa factual. No reconstruimos puntos desde el ranking: el
     gráfico sólo se habilita cuando el servidor entrega el mismo universo,
     orden, total y foco que ranking.ordered para el scope solicitado. */
  function comparisonEvolutionFromHistory(value, rankingValue, requested, identity) {
    var expectedGrain={today:"hour",yesterday:"hour",week:"day",month:"day",year:"month"};
    var maximum={hour:25,day:31,month:12};
    if (!value || !rankingValue || text(value.project_id)!==text(requested&&requested.projectId) ||
      text(value.period)!==text(requested&&requested.period) || text(value.timezone)!==TIME_ZONE ||
      text(value.mode)!=="cumulative" || text(value.granularity)!==expectedGrain[text(requested&&requested.period)] ||
      !Array.isArray(value.labels) || !value.labels.length || value.labels.length>maximum[value.granularity] ||
      !Array.isArray(value.series) || value.series.length!==rankingValue.ordered.length) return null;
    var labels=[],previousAt=-Infinity,seenLabels=Object.create(null);
    for (var i=0;i<value.labels.length;i++) {
      var sourceLabel=value.labels[i]||{},labelKey=text(sourceLabel.key),label=text(sourceLabel.label),at=ms(sourceLabel.at);
      if (!labelKey || !label || !Number.isFinite(at) || at<=previousAt || seenLabels[labelKey]) return null;
      seenLabels[labelKey]=true;previousAt=at;labels.push({key:labelKey,label:label,at:at});
    }
    var series=[];
    for (var j=0;j<value.series.length;j++) {
      var source=value.series[j]||{},ranked=rankingValue.ordered[j],points=Number(source.points),position=Number(source.position);
      var shouldCurrent=j===rankingValue.currentIndex;
      if (!sameFamily(source.agent,"",ranked.agent,identity) || text(source.agent)!==text(ranked.agent) ||
        position!==ranked.position || points!==ranked.points || source.current!==shouldCurrent || !Array.isArray(source.values) ||
        source.values.length!==labels.length) return null;
      var values=[],previousValue=0;
      for (var k=0;k<source.values.length;k++) {
        var point=Number(source.values[k]);
        if (!Number.isFinite(point) || point<0 || point<previousValue) return null;
        previousValue=point;values.push(point);
      }
      if (values[values.length-1]!==points) return null;
      series.push({agent:text(source.agent),position:position,points:points,current:shouldCurrent,values:values});
    }
    return {projectId:text(value.project_id),period:text(value.period),timezone:TIME_ZONE,mode:"cumulative",
      granularity:text(value.granularity),labels:labels,series:series};
  }

  /* Un punto no atribuye trabajo concreto: sólo deriva el bucket acumulado
     alineado que ya entregó comparison_evolution. */
  function comparisonMarkerPoint(evolution, seriesIndex, pointIndex) {
    if (!evolution || !Array.isArray(evolution.labels) || !Array.isArray(evolution.series) ||
      !Number.isInteger(seriesIndex) || !Number.isInteger(pointIndex) || seriesIndex<0 || pointIndex<0 ||
      seriesIndex>=evolution.series.length || pointIndex>=evolution.labels.length) return null;
    var series=evolution.series[seriesIndex],label=evolution.labels[pointIndex];
    if (!series || !Array.isArray(series.values) || pointIndex>=series.values.length || !label) return null;
    var cumulative=Number(series.values[pointIndex]),previous=pointIndex?Number(series.values[pointIndex-1]):0,leader=0;
    if (!Number.isFinite(cumulative) || !Number.isFinite(previous)) return null;
    for (var i=0;i<evolution.series.length;i++) {
      var candidate=Number(evolution.series[i]&&evolution.series[i].values&&evolution.series[i].values[pointIndex]);
      if (!Number.isFinite(candidate)) return null;if(candidate>leader)leader=candidate;
    }
    return {agent:text(series.agent),position:Number(series.position),label:text(label.label),at:Number(label.at),
      cumulative:cumulative,delta:cumulative-previous,share:leader?cumulative/leader:0,leaderGap:leader-cumulative,
      seriesIndex:seriesIndex,pointIndex:pointIndex,current:!!series.current};
  }

  /* Control semanal factual. No reconstruye puntos ni mezcla proyectos: usa el
     mismo ranking y la misma serie acumulada que el servidor ya validó para el
     detalle abierto. La comparación de puesto toma el último corte anterior de
     la semana; un agente a cero aún no tenía posición, no era el último. */
  function weeklyRankAt(evolution, pointIndex, agent) {
    if (!evolution || !Array.isArray(evolution.series) || !Number.isInteger(pointIndex) || pointIndex<0) return null;
    var rows=[];
    for (var i=0;i<evolution.series.length;i++) {
      var series=evolution.series[i],points=Number(series&&series.values&&series.values[pointIndex]);
      if (!series || !Number.isFinite(points) || points<=0) continue;
      rows.push({agent:text(series.agent),points:points});
    }
    rows.sort(function(a,b){return b.points-a.points||a.agent.localeCompare(b.agent);});
    var index=rows.findIndex(function(row){return row.agent===text(agent);});
    return index<0?null:index+1;
  }
  function weeklyControl(value) {
    if (!value || value.period!=="week" || !value.ranking || !value.comparisonEvolution ||
      !Array.isArray(value.evolution) || !Array.isArray(value.ranking.ordered) ||
      !Number.isInteger(value.ranking.currentIndex)) return null;
    var current=value.ranking.ordered[value.ranking.currentIndex],leader=value.ranking.ordered[0],
      evolution=value.comparisonEvolution,last=evolution.labels.length-1;
    if (!current || !leader || last<0) return null;
    var currentSeries=evolution.series.find(function(row){return row.current===true;});
    if (!currentSeries || Number(currentSeries.values[last])!==Number(current.points)) return null;
    var previousPosition=last>0?weeklyRankAt(evolution,last-1,current.agent):null;
    var currentPosition=Number(current.position),change=previousPosition===null?null:previousPosition-currentPosition;
    return {
      zeroDays:value.evolution.filter(function(row){return Number(row.points)===0;}).map(function(row){return row.day;}),
      currentPosition:currentPosition,previousPosition:previousPosition,rankChange:change,rankFell:change!==null&&change<0,
      points:Number(current.points),leaderAgent:text(leader.agent),leaderPoints:Number(leader.points),
      leaderGap:Math.max(0,Number(leader.points)-Number(current.points))
    };
  }

  /* Contexto cruzado explícito, nunca un hecho del timeline seleccionado. El
     enlace debe volver al mismo detalle con el project_id que afirma el
     servidor; si no coincide, el panel se omite en vez de fabricar navegación. */
  // EN QUÉ PROYECTOS ESTUVO EL AGENTE EN ESTE PERIODO. Alimenta el selector de la
  // esquina del gráfico. Contrato defensivo a propósito: si el backend todavía no
  // manda el campo —una pestaña abierta desde antes del despliegue del worker—, se
  // devuelve al menos el proyecto abierto, así el selector nunca aparece vacío ni
  // desaparece la referencia de lo que se está mirando.
  function projectsWorkedFromHistory(value, currentId, currentName) {
    var actual=text(currentId), lista=[], vistos=Object.create(null);
    (Array.isArray(value)?value:[]).forEach(function(row){
      if(!row) return;
      var id=text(row.project_id); if(!id||vistos[id]) return;
      vistos[id]=true;
      lista.push({projectId:id,projectName:text(row.project_name)||id,
        missions:Math.max(0,Number(row.missions)||0),lastAt:ms(row.last_at)});
    });
    if(actual&&!vistos[actual]) lista.unshift({projectId:actual,projectName:text(currentName)||actual,missions:0,lastAt:0});
    return lista;
  }
  function latestWorkFromHistory(value, requested, identity, now) {
    if (value == null) return null;
    var agent=text(value.agent),executor=text(value.executor),projectId=text(value.project_id),projectName=text(value.project_name);
    var status=text(value.status),at=ms(value.at),startedAt=ms(value.started_at),finishedAt=ms(value.finished_at),duration=Number(value.duration_ms);
    if (!sameFamily(agent,"",requested.agent,identity) || !projectId || !projectName ||
      ["running","finalized"].indexOf(status)<0 || !at || at > Number(now||Date.now())+60000) return null;
    if (executor && !sameFamily(executor,"",requested.agent,identity)) return null;
    if (startedAt && startedAt > at || finishedAt && (finishedAt > at || status!=="finalized") ||
      status==="finalized" && !finishedAt || !Number.isFinite(duration) || duration < 0) return null;
    var detail=text(value.detail_url),url;
    try { url=new URL(detail,"https://yokup.local"); } catch (_) { return null; }
    if (url.origin!=="https://yokup.local" || url.pathname!=="/highscoreDetail" ||
      !sameFamily(url.searchParams.get("agent"),"",requested.agent,identity) ||
      text(url.searchParams.get("project_id"))!==projectId || url.searchParams.get("period")!=="today") return null;
    return {agent:agent,executor:executor,reference:text(value.reference),title:text(value.title)||"Trabajo reciente",
      projectId:projectId,projectName:projectName,status:status,at:at,startedAt:startedAt||null,
      finishedAt:finishedAt||null,durationMs:duration,detailUrl:url.pathname+url.search};
  }

  function snapshot(agent) {
    try { return JSON.parse(sessionStorage.getItem("yokup.highscore.detail." + key(agent)) || "null"); }
    catch (_) { return null; }
  }

  function scoreFor(agent, daily, tasks, identity, now) {
    var objectives = 0, windows = 0, missions = 0, bonus = 0, windowCount = 0, missionCount = 0, taskFamilies = Object.create(null);
    (daily && daily.scores || []).forEach(function (row) {
      if (!sameFamily(row.agent, row.machine, agent, identity)) return;
      objectives += Number(row.objective_points) || 0;
      windows += Number(row.window_points) || 0;
      missions += Number(row.mission_points) || 0;
      bonus += Number(row.race_bonus_points) || 0;
      // CUÁNTAS ventanas y misiones lleva (no sólo cuántos puntos valen): Carlos, 3-sep-2026.
      windowCount += Number(row.windows) || 0;
      missionCount += Number(row.missions) || 0;
    });
    (tasks || []).forEach(function (task) {
      var match = text(task.code).toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      if (!match || !today(task.updated_at, now) || !/^(?:doing|in_progress|done)$/.test(text(task.status))) return;
      if (!sameFamily(taskIdentity(task, identity), task.loc, agent, identity)) return;
      var family = text(task.mission_id) + "|" + match[1], previous = taskFamilies[family];
      if (!previous || ms(task.updated_at) >= ms(previous.updated_at)) taskFamilies[family] = task;
    });
    var taskCount = Object.keys(taskFamilies).length;
    var taskPoints = Object.keys(taskFamilies).reduce(function (sum, family) {
      return sum + 15 + (/^(?:doing|in_progress)$/.test(text(taskFamilies[family].status)) ? 10 : 0);
    }, 0);
    return { objectives:objectives, windows:windows, missions:missions, tasks:taskPoints, taskCount:taskCount,
      windowCount:windowCount, missionCount:missionCount,
      total:objectives + windows + missions + taskPoints + bonus };
  }

  function canonicalAgent(value, machine, identity) {
    var parsed = identity.parse(value), resolved = identity.suffix(machine) || parsed.suffix;
    return resolved ? identity.display(parsed.persona, resolved) : text(value);
  }

  function history(payload, agent, identity, now) {
    var clock = Number(now) || Date.now(), sampled = Number(payload && payload.sampled_at), generated = Number(payload && payload.generated_at);
    if (!(payload && payload.ok === true) || !Number.isInteger(sampled) || sampled <= 0 || sampled > clock + 60000 ||
      !Number.isInteger(generated) || generated !== sampled) return null;
    if (!sameFamily(payload.agent, "", agent, identity)) return null;
    var periods = payload.periods || {}, names = ["week", "month", "total"], normalized = {};
    for (var i=0; i<names.length; i++) {
      var name=names[i], period=periods[name], points=Number(period && period.points);
      if (!period || !Number.isFinite(points) || points < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(text(period.end))) return null;
      if (name !== "total" && !/^\d{4}-\d{2}-\d{2}$/.test(text(period.start))) return null;
      normalized[name] = { start:period.start || null, end:period.end, points:points,
        objectives:Number(period.objectives) || 0, windows:Number(period.windows) || 0,
        missions:Number(period.missions) || 0, tasks:Number(period.tasks) || 0 };
    }
    var source = payload.evolution && payload.evolution.days;
    if (!Array.isArray(source)) return null;
    var seen=Object.create(null), previous="", todayKey=day(clock), evolution=[];
    for (var j=0; j<source.length; j++) {
      var row=source[j], date=text(row && row.day), value=Number(row && row.points);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey || date <= previous || seen[date] || !Number.isFinite(value) || value < 0) return null;
      seen[date]=true; previous=date; evolution.push({ day:date, points:value });
    }
    return { agent:payload.agent, sampledAt:sampled, periods:normalized, evolution:evolution };
  }

  /* Contrato periodizado: el servidor hace el corte factual. El navegador sólo
     valida y presenta; nunca recorta un histórico parcial para fingir Hoy/Ayer. */
  function periodHistory(payload, requested, identity, now) {
    var clock=Number(now)||Date.now(), sampled=Number(payload && (payload.generated_at || payload.sampled_at));
    if (!(payload && payload.ok === true) || !Number.isInteger(sampled) || sampled <= 0 || sampled > clock + 60000) return null;
    if (!sameFamily(payload.agent, "", requested.agent, identity) || text(payload.project_id) !== text(requested.projectId) ||
      text(payload.period) !== text(requested.period)) return null;
    var range=payload.range || {}, from=text(payload.from || range.start_day), to=text(payload.to || range.end_day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
    var sourceMetrics=payload.metrics || {}, metrics={}, metricNames=["objectives","windows","missions","tasks","points"];
    for (var i=0;i<metricNames.length;i++) {
      var metric=metricNames[i], value=Number(sourceMetrics[metric]);
      if (!Number.isFinite(value) || value < 0) return null;
      metrics[metric]=value;
    }
    var days=payload.evolution && payload.evolution.days;
    if (!Array.isArray(days) || !Array.isArray(payload.timeline)) return null;
    var previous="", normalizedDays=[];
    for (var j=0;j<days.length;j++) {
      var row=days[j]||{}, date=text(row.day), normalizedRow={day:date};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to || date <= previous) return null;
      for(var dayMetric=0;dayMetric<METRICS.length;dayMetric++){
        var dayMetricName=METRICS[dayMetric],dayMetricValue=Number(row[dayMetricName]);
        if(!Number.isFinite(dayMetricValue)||dayMetricValue<0)return null;normalizedRow[dayMetricName]=dayMetricValue;
      }
      previous=date; normalizedDays.push(normalizedRow);
    }
    var timeline=[], previousAt=Infinity;
    for (var k=0;k<payload.timeline.length;k++) {
      var event=payload.timeline[k]||{}, at=ms(event.at), eventDay=text(event.day || day(at));
      if (!at || at > clock + 60000 || at > previousAt || eventDay < from || eventDay > to ||
        (event.project_id != null && text(event.project_id) !== text(requested.projectId))) return null;
      var eventPoints=Number(event.points);if(!Number.isFinite(eventPoints)||eventPoints<0)return null;
      previousAt=at; timeline.push({type:text(event.type)||"Actividad",id:text(event.id),title:text(event.title)||text(event.detail)||"Sin título",
        at:at,day:eventDay,projectId:text(event.project_id || requested.projectId),points:eventPoints});
    }
    var factualRanking=rankingFromHistory(payload.ranking,requested,identity);
    var latestWork=latestWorkFromHistory(payload.latest_work,requested,identity,clock);
    var comparisonEvolution=comparisonEvolutionFromHistory(payload.comparison_evolution,factualRanking,requested,identity);
    return {agent:payload.agent,projectId:payload.project_id,period:payload.period,timezone:text(payload.timezone)||TIME_ZONE,
      from:from,to:to,label:text(payload.label),sampledAt:sampled,metrics:metrics,evolution:normalizedDays,timeline:timeline,
      ranking:factualRanking,latestWork:latestWork,comparisonEvolution:comparisonEvolution,
      projectsWorked:projectsWorkedFromHistory(payload.projects_worked,payload.project_id,payload.project_name)};
  }
  function ranking(agent, daily, tasks, identity, now) {
    var names = Object.create(null);
    (daily && daily.scores || []).forEach(function (row) {
      var name = canonicalAgent(row.agent, row.machine, identity); if (name) names[key(name)] = name;
    });
    (tasks || []).forEach(function (task) {
      var name = canonicalAgent(taskIdentity(task, identity), task.loc, identity); if (name) names[key(name)] = name;
    });
    names[key(agent)] = agent;
    var rows = Object.keys(names).map(function (k) { var name = names[k]; return { agent:name, score:scoreFor(name, daily, tasks, identity, now).total }; });
    rows.sort(function (a, b) { return b.score - a.score || a.agent.localeCompare(b.agent); });
    var index = rows.findIndex(function (row) { return key(row.agent) === key(agent); });
    return { place:index >= 0 ? index + 1 : null, total:index >= 0 ? rows[index].score : 0, rows:rows };
  }

  function matchedTasks(agent, tasks, identity) {
    return (tasks || []).filter(function (task) { return sameFamily(taskIdentity(task, identity), task.loc, agent, identity); });
  }
  function taskCountToday(agent, tasks, identity, now) {
    var families = Object.create(null);
    matchedTasks(agent, tasks, identity).forEach(function (task) {
      var match = text(task.code).toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      if (!match || !today(task.updated_at, now) || !/^(?:doing|in_progress|done)$/.test(text(task.status))) return;
      families[text(task.mission_id) + "|" + match[1]] = true;
    });
    return Object.keys(families).length;
  }
  function matchedMissions(agent, missions, identity) {
    return (missions || []).filter(function (mission) {
      return sameFamily(mission.assignee || mission.persona || mission.agent, mission.machine || mission.loc, agent, identity);
    });
  }
  function matchedIncidents(agent, incidents, identity) {
    return (incidents || []).filter(function (incident) {
      return sameFamily(incident.assignee || incident.persona || incident.agent, incident.machine || incident.loc, agent, identity);
    });
  }

  function facts(agent, tasks, missions, incidents, identity) {
    var ownTasks = matchedTasks(agent, tasks, identity), ownMissions = matchedMissions(agent, missions, identity), ownIncidents = matchedIncidents(agent, incidents, identity);
    var topTasks = ownTasks.filter(function (task) { return /^[a-c]$/i.test(text(task.code)); });
    var doneTasks = topTasks.filter(function (task) { return /^(?:done|resolved)$/.test(text(task.status)); }).length;
    var reports = ownTasks.filter(function (task) { return !!text(task.report); }).length;
    var resolvedMissions = ownMissions.filter(function (mission) { return text(mission.status) === "resolved"; }).length;
    var resolvedIncidents = ownIncidents.filter(function (incident) { return text(incident.status) === "resolved"; }).length;
    var pendingTasks = topTasks.filter(function (task) { return !/^(?:done|resolved)$/.test(text(task.status)); }).length;
    var activeMissions = ownMissions.filter(function (mission) { return /^(?:open|in_progress)$/.test(text(mission.status)); }).length;
    var openIncidents = ownIncidents.filter(function (incident) { return /^(?:open|in_progress)$/.test(text(incident.status)); }).length;
    var good = [], improve = [];
    if (resolvedMissions) good.push({ value:resolvedMissions, label:"misiones finalizadas", href:"/misiones" });
    if (doneTasks) good.push({ value:doneTasks, label:"tareas principales terminadas", href:"/tareas" });
    if (reports) good.push({ value:reports, label:"informes con contenido", href:"/informes" });
    if (resolvedIncidents) good.push({ value:resolvedIncidents, label:"incidencias resueltas", href:"/incidencias" });
    if (activeMissions) improve.push({ value:activeMissions, label:"misiones abiertas o en curso", href:"/misiones" });
    if (pendingTasks) improve.push({ value:pendingTasks, label:"tareas principales aún no terminadas", href:"/tareas" });
    if (openIncidents) improve.push({ value:openIncidents, label:"incidencias abiertas o en curso", href:"/incidencias" });
    return { good:good, improve:improve };
  }

  function timeline(agent, tasks, missions, incidents, identity, now) {
    var events = [];
    matchedTasks(agent, tasks, identity).forEach(function (task) {
      if (!today(task.updated_at, now)) return;
      events.push({ at:ms(task.updated_at), type:"Tarea", detail:text(task.code).toUpperCase() + " · " + text(task.status) });
      if (text(task.report)) events.push({ at:ms(task.updated_at), type:"Informe", detail:text(task.mission_id) + " · " + text(task.code).toUpperCase() });
    });
    matchedMissions(agent, missions, identity).forEach(function (mission) {
      var at = mission.resolved_at || mission.live_at || mission.updated_at || mission.created_at;
      if (today(at, now)) events.push({ at:ms(at), type:"Misión", detail:text(mission.id) + " · " + text(mission.status) });
    });
    matchedIncidents(agent, incidents, identity).forEach(function (incident) {
      var at = incident.resolved_at || incident.updated_at || incident.created_at;
      if (today(at, now)) events.push({ at:ms(at), type:"Incidencia", detail:(text(incident.display_ref || incident.id) || "Sin referencia") + " · " + text(incident.status) });
    });
    var grouped = Object.create(null);
    events.sort(function (a, b) { return a.at - b.at; }).forEach(function (event) {
      var hour = HOUR.format(new Date(event.at)).padStart(2, "0") + ":00";
      if (!grouped[hour]) grouped[hour] = { hour:hour, count:0, events:[] };
      grouped[hour].count++; grouped[hour].events.push(event);
    });
    return Object.keys(grouped).sort().map(function (hour) { return grouped[hour]; });
  }

  root.YkHighscoreDetail = { key:key, ms:ms, today:today, validAgent:validAgent, sameFamily:sameFamily, taskIdentity:taskIdentity,
    snapshot:snapshot, scoreFor:scoreFor, ranking:ranking, taskCountToday:taskCountToday, history:history,
    periods:PERIODS.slice(), types:TYPES.slice(), orders:ORDERS.slice(), validPeriod:validPeriod, validType:validType, validOrder:validOrder, canonicalType:canonicalType,
    queryState:queryState, detailUrl:detailUrl, timelineForType:timelineForType, metricForType:metricForType,
    rankingFromHistory:rankingFromHistory, previousRankedAgent:previousRankedAgent, nextRankedAgent:nextRankedAgent,
    rankingComparisonRows:rankingComparisonRows, comparisonEvolutionFromHistory:comparisonEvolutionFromHistory,
    comparisonMarkerPoint:comparisonMarkerPoint, weeklyControl:weeklyControl,
    latestWorkFromHistory:latestWorkFromHistory,
    evolutionGroups:evolutionGroups, timelineGroups:timelineGroups, periodHistory:periodHistory,
    nextWindow:nextWindow, windowCountdown:windowCountdown, decisionUrl:decisionUrl, onIdleDecisionError:onIdleDecisionError,
    facts:facts, timeline:timeline, timeZone:TIME_ZONE };
})(typeof window !== "undefined" ? window : globalThis);
