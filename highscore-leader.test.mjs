import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = name => readFileSync(new URL("./" + name, import.meta.url), "utf8");
const html = read("highscore.html"), root = {};
vm.runInNewContext(read("highscore-daily-record.js"), root);
vm.runInNewContext(read("admira-idioma-highscore.js"), root);
const D = root.YkHighscoreDailyRecord, I = root.HsIdioma;
const NOW = Date.parse("2026-10-11T13:30:00Z"), TODAY = "2026-10-11";
const history = {
  first_day:"2026-09-01",
  all_days:[{day:"2026-10-01",top:[{agent:"WozniakGrokBot",points:200}]}],
  hour_records:{records:[{agent:"WozniakGrokBot",points:200,start:NOW-7200000,end:NOW-3600000}]}
};

function pageFunction(name, next, dependencies) {
  const start = html.indexOf("function " + name + "("), end = html.indexOf(next, start);
  assert.ok(start >= 0 && end > start, name);
  return new Function(...Object.keys(dependencies), html.slice(start, end) + ";return " + name)(...Object.values(dependencies));
}
const plain = value => value.replace(/<[^>]*>/g, "");

test("a day with only zero or negative scores has no leader and keeps the historical target", () => {
  for (const points of [0, -1, "0"]) {
    const result = D.dailyRecord({all_days:[...history.all_days,{day:TODAY,top:[
      {agent:"WozniakGrokBot",points}, {agent:"DisneyGrokBot",points:0}
    ]}]}, TODAY);
    assert.equal(result.leader, null);
    assert.equal(result.record.agent, "WozniakGrokBot");
    assert.equal(result.record.points, 200);
    assert.equal(result.target, 201);
    assert.equal(result.remaining, 201);
    assert.equal(result.progress, 0);
  }
});

test("every current period has no zero-point leader without excluding its historical identity", () => {
  for (const period of ["hour", "day", "week", "month"]) {
    const fixture = structuredClone(history);
    fixture.all_days[0].day = period === "month" ? "2026-09-30" : "2026-10-01";
    const result = D.periodRecord(fixture, period, NOW, [
      {agent:"WozniakGrokBot",points:0}, {agent:"DisneyGrokBot",points:0}
    ]);
    assert.equal(result.leader, null, period);
    assert.equal(result.available, true, period + " retains the allowed historical identity");
    assert.equal(result.record.agent, "WozniakGrokBot");
    assert.equal(result.remaining, 201);
    assert.equal(result.progress, 0);
  }
});

test("a positive score still selects the strongest current leader and preserves chase arithmetic", () => {
  const rows = [{agent:"DisneyGrokBot",points:40},{agent:"WozniakGrokBot",points:325}];
  const daily = D.dailyRecord({all_days:[...history.all_days,{day:TODAY,top:rows}]}, TODAY);
  const period = D.periodRecord(history, "day", NOW, rows);
  for (const result of [daily, period]) {
    assert.equal(result.leader.agent, "WozniakGrokBot");
    assert.equal(result.leader.points, 325);
    assert.equal(result.remaining, 0);
    assert.equal(result.beatenBy, 125);
    assert.equal(result.progress, 100);
  }
  assert.equal(D.periodRecord(history, "day", NOW, [{agent:"WozniakGrokBot",points:1}]).leader.points, 1);
});

function renderRecordState(language, points, fresh = true, historyFresh = fresh) {
  const classes = new Set();
  const box = {dataset:{},classes,classList:{toggle(key,enabled){if (enabled) classes.add(key); else classes.delete(key);}},setAttribute(){}};
  const render = pageFunction("pintaRecordDiario", "\n  function esHoy", {
    document:{getElementById:() => box}, YkHighscoreDailyRecord:D, PODIUM_PERIOD:"day",
    listaCache:[{agente:"WozniakGrokBot",points}],
    puntosPodioPeriodo:row => row.points, datos:{historial:history,actividadFresh:fresh,historialFresh:historyFresh},
    claveAgentePeriodo:value => value,
    Date:class extends Date { static now() { return NOW; } },
    rotuloPeriodoRanking:() => I.t("day", language), rotuloPeriodoPodio:() => language === "es" ? "hoy" : "today",
    hsT:(es,en) => language === "es" ? es : en,
    hsText:(key,params) => I.t(key, language, params),
    esc:String, nombreAgenteVisible:String, fechaRecord:String
  });
  render();
  return box;
}
const renderRecord = (...args) => renderRecordState(...args).innerHTML;

test("the current leader cell says no leader yet in both languages and never names a zero-point person", () => {
  for (const language of ["es", "en"]) {
    const body = renderRecord(language, 0);
    const current = body.match(/<div class="record-cell record-chase">([\s\S]*?)<\/div>/)[1];
    assert.ok(plain(current).includes(language === "es" ? "— · Sin líder todavía" : "— · No leader yet"));
    assert.ok(!current.includes("WozniakGrokBot"));
    assert.ok(!/<strong>0<\/strong>/.test(current));
    const positive = renderRecord(language, 40).match(/<div class="record-cell record-chase">([\s\S]*?)<\/div>/)[1];
    assert.match(positive, /<strong>40<\/strong> · WozniakGrokBot/);
  }
});

test("the to-beat heading stays concise when score and history sources are stale", () => {
  for (const language of ["es", "en"]) {
    const body = renderRecord(language, 40, false);
    const heading = body.match(/<div class="record-cell record-gap"><span class="record-kicker">([^<]*)/)[1];
    assert.equal(heading.toLowerCase(), language === "es" ? "para batirlo" : "to beat it");
    assert.ok(!/pendientes|awaiting update/i.test(heading));
  }
});

test("stale score or comparison data cannot claim a new record or a completed chase", () => {
  for (const language of ["es","en"]) {
    for (const [dailyFresh,historyFresh] of [[false,true],[true,false],[false,false]]) {
      const box = renderRecordState(language,325,dailyFresh,historyFresh), body = box.innerHTML;
      const current = body.match(/<div class="record-cell record-chase">([\s\S]*?)<\/div>/)[1];
      const gap = body.match(/<div class="record-cell record-gap">([\s\S]*?)<\/div>/)[1];
      assert.equal(box.classes.has("record-beaten"), false);
      assert.ok(!/NEW RECORD|NUEVO RÉCORD/.test(body));
      assert.match(gap, /<strong>—<\/strong>/);
      assert.match(body, /class="record-progress"[^>]*><i style="width:0\.00%/);
      if (dailyFresh) assert.match(current, /<strong>325<\/strong> · WozniakGrokBot/);
      else assert.ok(plain(current).includes(language === "es" ? "— · Sin líder todavía" : "— · No leader yet"));
    }
    const fresh = renderRecordState(language,325,true,true);
    assert.equal(fresh.classes.has("record-beaten"), true, "verified positive records still celebrate");
    assert.match(fresh.innerHTML, /NEW RECORD|NUEVO RÉCORD/);
    assert.match(fresh.innerHTML, /width:100\.00%/);
  }
});

function scoreHelpers() {
  const hsRacePoints = pageFunction("hsRacePoints", "\n  function", {metricaHoraDia:row => ({day:row.todayPoints ?? row.points})});
  return {
    hsRacePoints,
    hsRacePlace:pageFunction("hsRacePlace", "\n  function", {hsRacePoints}),
    hsLaneHasScore:pageFunction("hsLaneHasScore", "\n  function", {})
  };
}

test("race leadership follows today's points when the selected podium period has historical points", () => {
  const {hsRacePoints,hsRacePlace} = scoreHelpers();
  assert.equal(hsRacePoints({points:1000,todayPoints:0}), 0);
  assert.equal(hsRacePlace({points:1000,todayPoints:0}, 0), 0);
  assert.equal(hsRacePlace({points:0,todayPoints:1}, 0), 1);
});

function renderLanes(points, dailyFresh = true) {
  const rows = points.map((value,index) => ({agente:["WozniakGrokBot","DisneyGrokBot"][index],points:value,total:value,posicion:index+1}));
  const works = rows.map(row => ({agente:row.agente,key:row.agente,state:"running",kind:"mission",reference:"FLT-"+row.agente}));
  const nodes = {
    refreshLanes:{innerHTML:"",querySelectorAll:() => []},
    refreshRace:{setAttribute(){},classList:{toggle(){}}},
    raceEvidenceStatus:{textContent:""}
  };
  const render = pageFunction("actualizaCarreraPodio", "\n  function pintaFormula", {
    ...scoreHelpers(),
    document:{getElementById:id => nodes[id],activeElement:null},
    listaCompletaCache:rows, listaVisible:rows => rows, aplicaAgentScope:rows => rows,
    claveAgenteCarrera:String, hsEffectiveAgentScope:() => null, trabajosCarrera:() => works,
    hsBandoAdmite:() => true, pistaEnVivo:() => true, faenaReal:() => true,
    HS_BANDO:"consejeros", AGENT_SCOPE_MODE:"all",
    resumenTrabajoActivo:work => ({responsible:work.agente,state:"running",startedClock:"—",duration:"—",sessionDuration:"—",title:"Current mission"}),
    YkHighscoreRace:{raceRows:rows => rows,runnerVariant:() => "light"},
    aplicaParrilla:rows => rows, personaCarrera:work => work.agente, puntuaFaena:() => 1,
    normaliza:String, identidadVisualCorredor:responsible => ({nombre:responsible}), contextoVisualCorredor:() => "",
    proyectoPrincipalCorredor:() => "Yokup", hsProject:String, nombreCorredorHtml:identity => "<span>" + identity.nombre + "</span>",
    hsText:(key,params) => I.t(key,"en",params), hsT:(_es,en) => en, esc:String,
    rotuloMisionCarrera:summary => summary.title,
    datos:{trabajosAvailable:true,trabajosMode:"active",actividadFresh:dailyFresh},
    hsWorkEvidenceStatus:() => ({text:"Verified work"}),
    hsRenderRankingScope:() => {}, hsRenderDataStatus:() => {}
  });
  render();
  return nodes.refreshLanes.innerHTML;
}

test("actual race lanes do not give zero-point participants a medal or a first-place marker", () => {
  const zero = renderLanes([0,0]);
  assert.equal((zero.match(/data-agent-key=/g) || []).length, 2, "confirmed work still runs");
  assert.ok(!/refresh-lane-p[123]/.test(zero), "zero scores have neutral lane colors");
  assert.equal((zero.match(/data-place="0"/g) || []).length, 2);
  assert.equal((zero.match(/data-race-points="0"/g) || []).length, 2);
  const positive = renderLanes([325,40]);
  assert.match(positive, /refresh-lane-p1/);
  assert.match(positive, /data-place="1"/);
  assert.match(positive, /data-race-points="325"/);
  const stale = renderLanes([325,40],false);
  assert.ok(!/refresh-lane-p[123]/.test(stale), "cached scores cannot assign a current leader");
  assert.equal((stale.match(/data-race-points="0"/g) || []).length, 2);
});

function lane(points) {
  const classes = new Set(), attrs = {
    "data-agent-key":"wozniak", "data-work-state":"running", "data-race-points":String(points),
    "data-race-order":"1", "data-place":points > 0 ? "1" : "0"
  };
  const runner = {style:{}}, fill = {offsetLeft:2,style:{}}, finish = {offsetLeft:500}, mission = {style:{}};
  return {
    classes, runner, clientWidth:600,
    getAttribute:key => attrs[key] || "", setAttribute:(key,value) => { attrs[key] = value; },
    querySelector:selector => ({'[data-race-role="runner"]':runner,'[data-race-role="fill"]':fill,'.refresh-finish':finish,'[data-race-role="mission"]':mission})[selector] || null,
    classList:{toggle(key,enabled){if (enabled) classes.add(key); else classes.delete(key);},remove(...keys){keys.forEach(key => classes.delete(key));}}
  };
}

test("assigning a finish order and every animation tick keep zero-point lanes free of winner highlights", () => {
  for (const points of [0,325]) {
    const current = lane(points), document = {
      querySelectorAll:() => [current],
      getElementById:() => ({textContent:"",setAttribute(){}})
    };
    const helpers = scoreHelpers();
    const shuffle = pageFunction("sorteaOrdenLlegada", "\n  function actualizaMarcador", {
      ...helpers, document, ordenLlegadaFirma:"", ordenLlegadaPorAgente:{}, bonusCarrera:null,
      YkHighscoreRace:{randomFinishOrder:() => [1]}
    });
    shuffle(true);
    assert.equal(current.classes.has("race-winner"), points > 0, "finish-order assignment");
    if (!points) assert.ok(Number(current.getAttribute("data-race-order")) >= 3, "a zero-point runner gets no early finish advance");
    const animate = pageFunction("pintaCarrera", "\n  function centraLlamadaCarrera", {
      ...helpers, document, progresoCarril:progress => progress,
      SALIDA_CORREDOR_OFFSET_PX:15, META_CORREDOR_PX:16, RADIO_CORREDOR_PX:13, REFRESCO_MS:24000,
      hsText:(key,params) => I.t(key,"en",params), confirmaBonusCarrera(){}
    });
    let previous = -Infinity;
    for (const progress of [0,.5,1]) {
      animate(progress);
      assert.equal(current.classes.has("race-winner"), points > 0, "animation at " + progress);
      assert.equal(current.classes.has("race-loser"), false);
      const position = parseFloat(current.runner.style.left);
      assert.ok(position > previous, "confirmed work retains forward movement");
      previous = position;
    }
  }
});

function warningHelpers(language) {
  const hsText = (key,params) => I.t(key,language,params);
  return {hsText,hsUnifiedDataWarning:pageFunction("hsUnifiedDataWarning", "\n  function", {hsText})};
}

test("a work-source failure uses one concise warning next to the participant count in ES and EN", () => {
  for (const language of ["es","en"]) {
    const nodes = Object.fromEntries(["rankingScopeSummary","rankingScopeAll","rankingDataWarning","rankingWorkStatus"].map(id => [id,{}]));
    const fallos = ["/tasks/all?scope=fleet → 401","/tickets?scope=fleet → 401"];
    const datos = {actividadFresh:true,historialFresh:true,trabajosAvailable:false,raceEvidence:{info:"",fallback:false}};
    const helpers = warningHelpers(language);
    const dependencies = {
      ...helpers, document:{getElementById:id => nodes[id]}, datos, fallos,
      RANKING_PERIOD:"day", PODIUM_PERIOD:"day", HS_BANDO:"agentes", AGENT_SCOPE_MODE:"all",
      listaCompletaCache:[{},{}], filtroSoloVivos:false, colapsaFilasRanking:rows => rows, hsBandoFila:() => true
    };
    const hsRenderDataStatus = pageFunction("hsRenderDataStatus", "\n  function", dependencies);
    const hsRankingScopeSummary = pageFunction("hsRankingScopeSummary", "\n  function", dependencies);
    const render = pageFunction("hsRenderRankingScope", "\n  function", {...dependencies,hsRenderDataStatus,hsRankingScopeSummary});
    render([{},{}],2);
    assert.equal(nodes.rankingScopeSummary.textContent, helpers.hsText("scopeSummary",{people:helpers.hsText("agents"),mode:helpers.hsText("all"),shown:2,total:2}));
    const warning = nodes.rankingDataWarning;
    assert.equal(warning.hidden, false);
    assert.equal(warning.textContent, helpers.hsText("workUnavailable"));
    assert.ok(!warning.textContent.includes(helpers.hsText("partialDataStatus")), "a generic partial notice does not repeat a specific work failure");
    assert.equal(nodes.rankingWorkStatus.hidden, true, "no second unavailable-work notice");
    assert.ok(!warning.textContent.includes("/tasks/all"), "endpoint diagnostics stay out of the visible notice");
    assert.equal(warning.title, fallos.join(" · "));
    datos.trabajosAvailable = true; fallos.length = 0;
    render([{},{}],2);
    assert.equal(warning.hidden, true, "a successful refresh clears the warning");
    assert.equal(warning.textContent, "");
    datos.raceEvidence = {scopeNotice:"2 of 4 participants in this selection",info:helpers.hsText("workAdvisors")};
    render([{},{}],2);
    assert.equal(warning.hidden, true, "scope selection is informational");
    assert.equal(nodes.rankingWorkStatus.hidden, false);
    assert.equal(nodes.rankingWorkStatus.textContent, datos.raceEvidence.scopeNotice + " · " + datos.raceEvidence.info);
  }
  assert.equal((html.match(/\bid="rankingDataWarning"/g) || []).length, 1);
  assert.ok(!/\bid="raceEvidenceStatus"/.test(html), "the race has no duplicate error line");
});

test("the unified warning prioritizes a single sentence and leaves scope information out of error text", () => {
  for (const language of ["es","en"]) {
    const {hsText,hsUnifiedDataWarning} = warningHelpers(language);
    const shared = {dailyFresh:false,historyFresh:false,failures:["offline"],workAvailable:false,workFallback:true};
    const scopeNotice = "2 of 4 participants in this selection";
    const text = hsUnifiedDataWarning({...shared,scopeNotice});
    assert.equal(text, hsText("scoreAndWorkPartial"));
    assert.ok(!text.includes(scopeNotice));
    assert.equal(hsUnifiedDataWarning({...shared,dailyFresh:true,historyFresh:true}), hsText("workQueryPartial"));
    assert.equal(hsUnifiedDataWarning({...shared,workAvailable:true}), hsText("scoresStale"));
    assert.equal(hsUnifiedDataWarning({...shared,dailyFresh:true,workAvailable:true}), hsText("historyStale"));
    assert.equal(hsUnifiedDataWarning({...shared,historyFresh:true,workAvailable:true}), hsText("dailyStale"));
    assert.equal(hsUnifiedDataWarning({...shared,dailyFresh:true,historyFresh:true,workAvailable:true}), hsText("partialDataStatus"));
    assert.equal(hsUnifiedDataWarning({dailyFresh:true,historyFresh:true,workAvailable:true,scopeNotice}), "");
  }
});
