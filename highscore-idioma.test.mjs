import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = name => readFileSync(new URL("./" + name, import.meta.url), "utf8");
const html = read("highscore.html");
const root = {};
vm.runInNewContext(read("admira-idioma-highscore.js"), root);
const I = root.HsIdioma;

function pageFunction(name, next, dependencies) {
  const start = html.indexOf("function " + name + "("), end = html.indexOf(next, start);
  assert.ok(start >= 0 && end > start, name);
  return new Function(...Object.keys(dependencies), html.slice(start, end) + ";return " + name)(...Object.values(dependencies));
}

test("every Highscore UI key has ES and EN, with matching interpolation parameters", () => {
  assert.equal(I.validateCatalog(I.messages), true);
  for (const language of ["es", "en"]) {
    for (const key of Object.keys(I.messages[language])) {
      const missing = structuredClone(I.messages);
      delete missing[language][key];
      assert.throws(() => I.validateCatalog(missing), new RegExp("Missing Highscore translation: " + language + "\\." + key), language + "." + key);
    }
  }
  const badParameters = structuredClone(I.messages);
  badParameters.en.workOutside = "Only {total} participants";
  assert.throws(() => I.validateCatalog(badParameters), /Mismatched Highscore parameters: workOutside/);
  for (const [, key] of html.matchAll(/hsText\(["']([^"']+)["']/g)) {
    assert.ok(Object.hasOwn(I.messages.es, key) && Object.hasOwn(I.messages.en, key), "Unknown UI key: " + key);
  }
  assert.throws(() => I.t("missing-key", "en"), /Unknown Highscore translation key/);
});

test("project labels have both languages and round-trip from either source language", () => {
  for (const [id, item] of Object.entries(I.projects)) {
    assert.ok(item.es.trim() && item.en.trim(), id);
    assert.equal(I.project(item.es, "en"), item.en, id + " ES → EN");
    assert.equal(I.project(item.en, "es"), item.es, id + " EN → ES");
    assert.equal(I.project(id, "en"), item.en, id + " ID → EN");
  }
  assert.equal(I.project("Galaxia Admira", "en"), "Admira Galaxy");
  assert.equal(I.project("Templo de la Soledad", "en"), "Temple of Solitude");
  assert.equal(I.project("Yokup", "en"), "Yokup");
  assert.equal(I.project("admira.live", "en"), "admira.live");
  assert.equal(I.project("Customer-defined project", "es"), "Customer-defined project");
});

test("every empty/unavailable/filtered work branch renders in either language", () => {
  for (const language of ["es", "en"]) {
    const evidence = pageFunction("hsWorkEvidenceStatus", "\n  // PARRILLA FIJA", { hsText:(key, params) => I.t(key, language, params) });
    assert.equal(evidence(false, 0, 0, "active").text, I.t("workUnavailable", language));
    assert.equal(evidence(true, 0, 0, "active").text, I.t("workEmpty", language));
    assert.equal(evidence(true, 4, 2, "active").text, I.t("workOutside", language, {shown:2,total:4}));
    assert.equal(evidence(true, 1, 1, "presence").text, I.t("workPresence", language));
    assert.equal(evidence(true, 1, 1, "recent").text, I.t("workRecent", language));
    assert.equal(evidence(true, 1, 1, "advisors").text, I.t("workAdvisors", language));
  }
});

test("ranking scopes, advisor headings and all four periods use the selected language", () => {
  for (const language of ["es", "en"]) {
    const hsText = (key, params) => I.t(key, language, params);
    const period = pageFunction("rotuloPeriodoRanking", "\n  function cambiaPeriodoRanking", {hsText});
    for (const key of ["hour", "day", "week", "month"]) assert.equal(period(key), I.t(key, language));
    for (const bando of ["agentes", "consejeros"]) {
      const summary = pageFunction("hsRankingScopeSummary", "\n  function hsRankingSourceWarning", {hsText,HS_BANDO:bando});
      assert.equal(summary("all", 2, 3, false, 2), hsText("scopeSummary", {people:hsText(bando === "consejeros" ? "advisors" : "agents"),mode:hsText("all"),shown:2,total:3}));
    }
  }
  assert.match(html, /window\.addEventListener\("admira:languagechange", hsActualizaIdioma\)/);
  assert.match(html, /html:lang\(en\) \.score-formula-toggle::before\{content:"Show/);
  assert.match(html, /html:lang\(en\) \.score-formula\[open\] \.score-formula-toggle::before\{content:"Hide/);
});

test("READY/SET/GO countdown, pause and finish announce the selected language", () => {
  for (const language of ["es", "en"]) {
    for (const key of ["ready", "set", "go"]) {
      const phase = I.t(key, language);
      const label = I.t("raceStart", language, {phase,seconds:2});
      assert.ok(label.startsWith(phase + " · "));
      assert.ok(!label.includes("{"));
      assert.ok(label.includes(language === "en" ? "starting in 2 seconds" : "salida en 2 segundos"));
    }
    assert.match(I.t("racePaused", language), language === "en" ? /Race paused/ : /Carrera pausada/);
    assert.match(I.t("raceFinish", language), language === "en" ? /Finish/ : /Meta/);
  }
});

test("the complete rendered scoring formula and partial-data warning stay in the chosen language", () => {
  for (const language of ["es", "en"]) {
    for (const failures of [
      ["/tasks/all?scope=fleet → 401", "/tickets?scope=fleet → 401"],
      ["/tickets?scope=fleet → 401", "/tasks/all?scope=fleet → 401"],
      []
    ]) {
      const nodes = {formula:{},formulaBody:{}};
      const render = pageFunction("pintaFormula", "\n  /* De 15 s", {
        document:{getElementById:id => nodes[id]},
        tareasDeHoy:() => [1,2,3],
        datos:{actividadMeta:{weights:{objective:20,window:10,mission:40},recorded:{objectives:3,windows:2,missions:1},unattributed:{objectives:4,windows:0,missions:0}},presencia:[1,2],controlMachines:[1]},
        window:{YkHighscoreRace:{IDLE_AFTER_MS:1200000,STALE_RACE_MAX_CYCLES:3}},
        CICLO_MS:42000,
        fallos:failures,
        esc:value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
        hsText:(key, params) => I.t(key, language, params)
      });
      render([]);
      const body = nodes.formulaBody.innerHTML;
      assert.ok(!/\{\w+\}/.test(body), "Every numeric placeholder is resolved");
      assert.equal((body.match(/<li>/g) || []).length, 15);
      if (language === "en") {
        assert.match(body, /Free Bonus Track/);
        assert.match(body, /<b>20 minutes<\/b>/);
        assert.match(body, /Stationary gray Running Man/);
        assert.match(body, /No runner appears/);
        assert.match(body, /Identity policy/);
        assert.match(body, /<b>3<\/b> tasks/);
        assert.ok(!/gratuito|minutos|trabajo finalizado|No aparece corredor|Identidad normativa|No pude leer todo|El marcador sale/.test(body));
      } else {
        assert.match(body, /Bonus Track gratuito/);
        assert.match(body, /<b>20 minutos<\/b>/);
        assert.match(body, /Identidad normativa/);
        assert.ok(!/Free Bonus Track|20 minutes|Identity policy|Some data could not be read/.test(body));
      }
      for (const failure of failures) assert.ok(body.includes(failure), "Diagnostic endpoint remains verbatim");
      if (failures.length) {
        assert.ok(body.includes(I.t("partialDataHeading", language)));
        assert.ok(body.includes(I.t("partialDataExplanation", language)));
      } else assert.ok(!body.includes(I.t("partialDataHeading", language)));
    }
  }
});

test("a same-page language change rerenders the explicit formula instead of restoring partial DOM translations", () => {
  let paints = 0;
  const dependencies = Object.fromEntries([
    "hsCabeceraPersona", "actualizaPeriodoHighscore", "actualizaPeriodoRanking", "pintaSonido", "pintaControlPodio",
    "actualizaFiltroVida", "hsRenderAgentScope", "pintaVistaFiltrada", "hsPintaTiempos", "hsRenderWorkObservations", "pintaControlCarrera"
  ].map(key => [key, () => {}]));
  const refresh = pageFunction("hsActualizaIdioma", '\n  window.addEventListener("admira:languagechange"', {
    ...dependencies, sonando:false, listaCompletaCache:[], listaCache:[], pintaFormula:() => paints++
  });
  refresh(); refresh();
  assert.equal(paints, 2, "Both language directions repaint the whole formula");
  assert.match(html, /id="formulaBody" data-no-traducir/);
});
