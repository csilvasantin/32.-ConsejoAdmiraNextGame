/* Carrera de highscore: reglas puras y deterministas, compartidas con pruebas. */
(function (root) {
  "use strict";

  function key(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function activeMissionRows(rows, activeAgentKeys) {
    var active = Object.create(null);
    (activeAgentKeys || []).forEach(function (agentKey) { active[key(agentKey)] = true; });
    // La carrera representa trabajo factual, no conexión. Presencia, Desktop App
    // y selector viven en otros controles y nunca pueden retirar una calle activa.
    return (rows || []).filter(function (row) { return !!(row && active[laneKey(row)]); });
  }

  function raceRows(rows, activeAgentKeys) {
    var seen = Object.create(null);
    return activeMissionRows(rows, activeAgentKeys).filter(function (row) {
      var agentKey = laneKey(row);
      if (!agentKey || seen[agentKey]) return false;
      seen[agentKey] = true;
      return true;
    });
  }

  function laneKey(row) {
    return key(row && (row.agente || row.persona || row.agent));
  }

  /* Las sillas no publican el latido de una terminal de la flota. Su carrera
     representa el trabajo diario de Yokup o un encargo/misión en curso, nunca
     la mera presencia. La identidad de silla une Wozniak y WozniakGrokBot sin
     sumar ni modificar los puntos de las fuentes. */
  function advisorRows(sources, options) {
    sources = sources || {}; options = options || {};
    var advisor = options.advisor || function () { return null; };
    var best = Object.create(null);
    function epoch(value) { var n = Number(value) || 0; return n > 0 && n < 1e11 ? n * 1000 : n; }
    function name(row) { return row && (row.agent || row.agente || row.assignee || row.persona || row.owner); }
    function add(row, reason, priority, kind, title, reference, startedAt, at) {
      var seat = advisor(name(row)); if (!seat || row.cli_paused === true || row.cliPaused === true) return;
      var identity = options.identity ? options.identity(row, seat) : {agent:seat, machine:row.machine || row.loc || row.maquina || "", key:key(seat)};
      if (!identity || !identity.key) return;
      var previous = best[seat], stamp = epoch(at);
      if (previous && (previous.racePriority > priority || previous.racePriority === priority && previous.at >= stamp)) return;
      best[seat] = {
        key:identity.key, agente:identity.agent, machine:identity.machine, executor:identity.agent,
        reference:String(reference || ""), projectId:row.project_id || row.projectId || "",
        projectName:row.project_name || row.projectName || row.project || "", projectSource:"",
        detailUrl:row.detail_url || row.detailUrl || "/highscoreDetail?agent=" + encodeURIComponent(identity.agent) + "&period=today&type=all",
        kind:kind, title:String(title || options.dailyTitle || ""), state:"running", reachable:row.reachable === true,
        raceBasis:reason, racePriority:priority, raceRevision:"", assignmentAt:0, assignmentBasis:reason,
        startedAt:epoch(startedAt), at:stamp, endedAt:0, elapsedMs:null, timingBasis:reason,
        presenceAt:0, sessionDedicatedMs:null, sessionState:"unknown", sessionBasis:"", sessionSurface:"",
        runtime:row.runtime || "", activityExpiresAt:0, cliPaused:false, activityReason:reason, operationalState:""
      };
    }
    var daily = sources.daily || {};
    // El cambio de semana/mes del ranking nunca convierte trabajo antiguo en
    // trabajo de hoy; tampoco un bonus de carrera por sí solo activa otra.
    if (daily.day && daily.day === options.day) (daily.scores || []).forEach(function (row) {
      if (!row) return;
      var counts = ["objectives", "windows", "missions", "tasks"].some(function (field) { return Number(row[field]) > 0; });
      var points = ["objective_points", "window_points", "mission_points", "task_points"].reduce(function (sum, field) { return sum + (Number(row[field]) || 0); }, 0);
      if (counts || points > 0 || Number(row.points) - (Number(row.race_bonus_points) || 0) > 0)
        add(row, "advisor_daily", 1, "daily", options.dailyTitle, "", 0, 0);
    });
    (sources.tasks || []).forEach(function (row) {
      if (!row) return;
      var owner = String(row.owner || "").trim();
      var executor = options.taskAgent ? options.taskAgent(row) : (/^(infra|sub)(?:agente)?$/i.test(owner) ? row.assignee : owner || row.assignee || row.agent || row.persona);
      row = Object.assign({}, row, {agent:executor});
      var at = epoch(row && row.updated_at), state = String(row && (row.visible_state || row.status) || "");
      if (row && at > 0 && options.dayOf && options.dayOf(at) === options.day && ["in_progress", "done"].indexOf(String(row.status)) >= 0)
        add(row, "advisor_daily", 2, "daily", row.title || options.dailyTitle, "", 0, at);
      if (row && state === "in_progress") add(row, "advisor_in_progress", 4, "task", row.title || row.code,
        row.mission_id ? row.mission_id + ":" + (row.code || "") : "", row.work_started_at || row.started_at, at);
    });
    (sources.activeWork || []).forEach(function (row) {
      if (row && row.state === "running" && !(row.ended_at || row.endedAt) && ["mission", "task"].indexOf(row.kind) >= 0)
        add(row, "advisor_in_progress", 5, row.kind, row.activity_text || row.work_description || row.title,
          row.reference, row.work_started_at || row.startedAt, row.work_progress_at || row.at);
    });
    (sources.missions || []).forEach(function (row) {
      if (!row || String(row.visible_state || row.status) !== "in_progress") return;
      var reference = row.id || row.reference;
      var linked = (sources.activeWork || []).find(function (work) { return work && work.reference === reference; }) || {};
      add(row, "advisor_in_progress", 6, "mission", row.subject || row.title, reference,
        row.work_started_at || row.started_at || row.startedAt || row.live_at || linked.work_started_at || linked.startedAt,
        row.updated_at || row.work_progress_at || row.at || row.live_at || row.started_at || linked.work_progress_at || linked.at);
    });
    (sources.inbox || []).forEach(function (row) {
      if (row && !row.fin && String(row.estado || row.status) === "in_progress")
        add(row, "advisor_in_progress", 3, "inbox", row.subject || row.title || (options.orderTitle || "") + " #" + row.id,
          "#" + row.id, row.inicio, row.inicio);
    });
    return Object.keys(best).map(function (seat) { return best[seat]; });
  }

  /* Trabajo que AVANZA frente a máquina ENCENDIDA. La calle las confundía: el
     12-ago-2026 NeoMBP14 llevaba 330 minutos sin que su tarea se moviera y
     TrinityMBP14 499, y los dos salían corriendo con su título porque su proceso
     seguía vivo (operational_basis=verified_process, presencia de hace 0 minutos).
     Correr es afirmar «está haciendo esto ahora», y eso no se sostiene con la
     marca de avance parada. El umbral son cuatro pulsos perdidos: el mandamiento
     11 pide reportar cada 5 minutos, así que a los 20 sin tocar el trabajo ya no
     se puede pintar avanzando. Sin marca de avance se considera parado: si no
     consta que se movió, no se afirma que se mueve. */
  var IDLE_AFTER_MS = 20 * 60 * 1000;

  function workIdle(activeAt, now) {
    var mark = Number(activeAt) || 0;
    if (!mark) return true;
    return ((Number(now) || Date.now()) - mark) > IDLE_AFTER_MS;
  }

  /* Una marca disparatada no se pinta como si fuera un dato: una fecha de 1970 —o
     unos segundos donde se esperaban milisegundos— produciría «hace 496263 h», que
     no informa de nada y encima parece un cálculo. Por encima de un mes se admite
     que no hay marca fiable, y sigue contando como parado. */
  var MARCA_IMPLAUSIBLE_MS = 30 * 24 * 60 * 60 * 1000;

  function sinceLabel(activeAt, now) {
    var mark = Number(activeAt) || 0;
    if (!mark) return "sin marca de avance";
    var age = (Number(now) || Date.now()) - mark;
    if (age > MARCA_IMPLAUSIBLE_MS) return "sin marca de avance fiable";
    var min = Math.max(0, Math.round(age / 60000));
    if (min < 60) return "hace " + min + " min";
    var hours = Math.floor(min / 60), rest = min % 60;
    return "hace " + hours + " h" + (rest ? " " + rest + " min" : "");
  }

  function durationLabel(value) {
    if (value === null || value === undefined || value === "") return "—";
    var ms = Number(value);
    if (!Number.isFinite(ms) || ms < 0) return "—";
    var minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "<1 min";
    var hours = Math.floor(minutes / 60), rest = minutes % 60;
    return hours ? hours + " h" + (rest ? " " + rest + " min" : "") : minutes + " min";
  }

  function clockDurationLabel(value) {
    if (value === null || value === undefined || value === "") return "—";
    var ms = Number(value);
    if (!Number.isFinite(ms) || ms < 0) return "—";
    var total = Math.floor(ms / 1000), hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
    return String(hours).padStart(2,"0") + ":" + String(minutes).padStart(2,"0") + ":" + String(seconds).padStart(2,"0");
  }

  /* El reloj visible se ancla al generated_at del servidor. El paso del tiempo
     sólo avanza la presentación de un trabajo abierto; nunca se reutiliza como
     work_progress_at ni puede cambiar el estado factual de la calle. */
  function workClock(row, serverAt, clientElapsedMs) {
    var state = String(row && row.state || "");
    var start = Number(row && (row.work_started_at || row.startedAt)) || 0;
    var ended = Number(row && (row.ended_at || row.endedAt)) || 0;
    var anchor = Number(serverAt) || 0;
    var elapsed = Math.max(0, Number(clientElapsedMs) || 0);
    var closed = state === "last_work" || ended > 0;
    var at = closed ? ended : (anchor > 0 ? anchor + elapsed : 0);
    var durationMs = start > 0 && at >= start ? at - start : null;
    var sessionState = String(row && (row.session_state || row.sessionState) || "unknown");
    var dedicatedRaw = row && (row.session_dedicated_ms !== undefined ? row.session_dedicated_ms : row.sessionDedicatedMs);
    var dedicated = dedicatedRaw === null || dedicatedRaw === undefined || dedicatedRaw === "" ? NaN : Number(dedicatedRaw);
    var sessionDurationMs = Number.isFinite(dedicated) && dedicated >= 0
      ? dedicated + (sessionState === "open" ? elapsed : 0) : null;
    if (sessionState === "unknown") sessionDurationMs = null;
    return { at:at, durationMs:durationMs, missionDurationMs:durationMs,
      sessionDurationMs:sessionDurationMs, sessionState:sessionState, closed:closed };
  }

  var STALE_RACE_MAX_CYCLES = 3;

  function staleRaceStorageKey(family) {
    return "yk.highscore.stale-race.v1:" + key(family);
  }

  function staleRaceRecord(raw, revision, serverAt) {
    var value = null;
    try { value = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) {}
    if (!value || value.revision !== revision) return {
      revision:revision, server_started_at:Number(serverAt) || 0, cycles:0
    };
    return { revision:revision, server_started_at:Number(value.server_started_at) || Number(serverAt) || 0,
      cycles:Math.max(0, Math.min(STALE_RACE_MAX_CYCLES, Math.floor(Number(value.cycles) || 0))) };
  }

  function staleRaceComplete(record, expectedAnchor, cycleMs) {
    var current = staleRaceRecord(record, record && record.revision, expectedAnchor);
    if (Number(current.server_started_at) !== Number(expectedAnchor) || current.cycles >= STALE_RACE_MAX_CYCLES)
      return current;
    return { revision:current.revision,
      server_started_at:Number(expectedAnchor) + Math.max(1, Number(cycleMs) || 1),
      cycles:current.cycles + 1 };
  }

  function staleRaceVisible(record) {
    return !record || Number(record.cycles || 0) < STALE_RACE_MAX_CYCLES;
  }

  function runnerVariant(row) {
    var value = laneKey(row), hash = 0;
    for (var i = 0; i < value.length; i++) hash = ((hash * 31) + value.charCodeAt(i)) >>> 0;
    return hash % 2 ? "dark" : "light";
  }

  function finishPose(place, finished) {
    if (!finished) return "running";
    return Number(place) === 1 ? "winner-arm-up" : "loser-head-scratch";
  }

  // Sólo 1.º y 2.º reciben una pequeña ventaja; 3.º y calles posteriores
  // comparten la meta de referencia sin producir duraciones negativas.
  function finishAdvanceMs(place, stepMs) {
    return Math.max(0, 3 - Math.max(1, Number(place) || 1)) * (Number(stepMs) || 0);
  }

  /* Fisher-Yates puro: devuelve una permutación 1..N y permite inyectar el RNG
     para que pruebas y simulaciones reproduzcan exactamente el mismo sorteo. */
  function randomFinishOrder(count, rng) {
    var total = Math.max(0, Math.floor(Number(count) || 0));
    var order = Array.from({ length:total }, function (_, index) { return index + 1; });
    var random = typeof rng === "function" ? rng : Math.random;
    for (var i = order.length - 1; i > 0; i--) {
      var sample = Number(random());
      if (!Number.isFinite(sample)) sample = 0;
      sample = Math.max(0, Math.min(.9999999999999999, sample));
      var j = Math.floor(sample * (i + 1)), swap = order[i];
      order[i] = order[j]; order[j] = swap;
    }
    return order;
  }

  /* Un reinicio debe producir un ganador visible distinto cuando hay rival. La
     permutación sigue siendo aleatoria: sólo intercambia el 1 si el sorteo acaba
     de repetir al vencedor anterior. */
  function avoidRepeatedWinner(order, keys, previousWinnerKey) {
    var next = Array.from(order || []), lanes = Array.from(keys || []);
    if (next.length < 2 || lanes.length !== next.length || !previousWinnerKey) return next;
    var winnerIndex = next.indexOf(1), previousIndex = lanes.indexOf(previousWinnerKey);
    if (winnerIndex < 0 || winnerIndex !== previousIndex) return next;
    var challengerIndex = (winnerIndex + 1) % next.length;
    var swap = next[winnerIndex]; next[winnerIndex] = next[challengerIndex]; next[challengerIndex] = swap;
    return next;
  }

  var api = { key:key, activeMissionRows:activeMissionRows, raceRows:raceRows, laneKey:laneKey, advisorRows:advisorRows, runnerVariant:runnerVariant,
    IDLE_AFTER_MS:IDLE_AFTER_MS, workIdle:workIdle, sinceLabel:sinceLabel, durationLabel:durationLabel,
    clockDurationLabel:clockDurationLabel, workClock:workClock,
    STALE_RACE_MAX_CYCLES:STALE_RACE_MAX_CYCLES, staleRaceStorageKey:staleRaceStorageKey,
    staleRaceRecord:staleRaceRecord, staleRaceComplete:staleRaceComplete, staleRaceVisible:staleRaceVisible,
    finishPose:finishPose, finishAdvanceMs:finishAdvanceMs, randomFinishOrder:randomFinishOrder,
    avoidRepeatedWinner:avoidRepeatedWinner };
  root.YkHighscoreRace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
