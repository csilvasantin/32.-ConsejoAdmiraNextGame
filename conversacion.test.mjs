import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "./yk-quien.js";
import "./conversacion.js";

const C = globalThis.Conversacion;
const Q = globalThis.YkQuien;

test("la charla de coetáneos se lee como mensaje con foco de proyecto", () => {
  const entry = C.parseAgoraLine("2026-10-04T14:38:09+02:00  [MorfeoMBP14]  ⏱ Morfeo · MacBookProNegro14 · foco: pixeria.com · ahora: Auditando el creador TikTok");
  assert.equal(entry.source, "charla");
  assert.equal(entry.from_name, "MorfeoMBP14");
  assert.equal(entry.project_id, "pixeria.com");
  assert.equal(C.displayName(entry.from_name), "Morfeo");
  assert.ok(entry.ts > Date.parse("2026-10-04T12:00:00Z"));
  assert.match(entry.text, /TikTok/);
});

test("un encargo conserva persona, estado, etiqueta, proyecto y tarea", () => {
  const entry = C.fromInbox({
    id: 5063,
    ts: 1791117794,
    from_name: "status-web · JobsGrokBot",
    target_persona: "Smith",
    status: "done",
    project_id: "admiranext",
    etiqueta: "#5063.10.04",
    task_id: "task-web-1791117794-lez9",
    text: "Sustituye a #5056"
  });
  assert.equal(entry.source, "encargo");
  assert.equal(C.displayName(entry.from_name), "Jobs");
  assert.equal(C.displayName(entry.target_persona), "Smith");
  assert.equal(C.statusLabel(entry.status), "hecho");
  assert.equal(entry.project_id, "admiranext");
  assert.equal(entry.etiqueta, "#5063.10.04");
  assert.equal(entry.task_id, "task-web-1791117794-lez9");
  assert.equal(entry.ts, 1791117794000);
});

test("el feed mezcla las dos fuentes, lo más reciente primero, y filtra por persona", () => {
  const feed = C.buildFeed(
    ["2026-10-04T15:08:12+02:00  [MorfeoMBP14]  foco: pixeria.com · ahora: auditoria"],
    [
      { ts: 1791110000, from_name: "status-web · JobsGrokBot", target_persona: "Smith", status: "pending", project_id: "admiranext", etiqueta: "#1", task_id: "task-1", text: "encargo de Jobs" },
      { ts: 1791120000, from_name: "NeoMacBookPro14", target_persona: "Trinity", status: "in_progress", text: "encargo de Neo" }
    ]
  );
  assert.ok(feed[0].ts >= feed[1].ts && feed[1].ts >= feed[2].ts);
  const jobs = C.filterFeed(feed, { tipo: "consejeros", quien: "Jobs" });
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].text, /Jobs/);
  const morfeo = C.filterFeed(feed, { tipo: "deepagents", quien: "Morfeo" });
  assert.equal(morfeo.length, 1);
  assert.equal(morfeo[0].source, "charla");
  assert.equal(C.filterFeed(feed, Q.normalizeSelection({ tipo: "todos" })).length, 3);
});

test("cada consejero de las dos salas tiene silueta en el arte", () => {
  const raw = fs.readFileSync("assets/council-silhouettes.js", "utf8");
  const data = JSON.parse(raw.split("=").slice(1).join("=").trim().replace(/;$/, ""));
  assert.equal(data.leyendas.width, 1360);
  assert.equal(data.leyendas.height, 768);
  assert.equal(data.coetaneos.width, 1280);
  assert.equal(data.coetaneos.height, 720);
  for (const name of ["Steve Jobs", "Steve Wozniak", "Tim Cook", "Warren Buffett", "Walt Disney", "Dieter Rams", "Howard Schultz", "George Lucas"]) {
    assert.match(data.leyendas.paths[name], /^M\d+ \d+(?: L\d+ \d+){5,} Z$/, name);
  }
  for (const name of ["Elon Musk", "Jensen Huang", "Gwynne Shotwell", "Ruth Porat", "John Lasseter", "Jony Ive", "Carlos Ratti", "Ryan Reynolds"]) {
    assert.match(data.coetaneos.paths[name], /^M\d+ \d+(?: L\d+ \d+){5,} Z$/, name);
  }
});

test("la home solo renombra la entrada a Conversación", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /href="\/conversacion"/);
  assert.match(html, />Conversación</);
  assert.doesNotMatch(html, />Yarig\.AI</);
  assert.match(html, /council-silhouettes\.js/);
});
