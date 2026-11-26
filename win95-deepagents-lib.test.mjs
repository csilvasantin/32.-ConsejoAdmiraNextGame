import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STALE_MS, superficiesDePulso } from "./consumos-pulso-lib.mjs";
import {
  CATALOGO, VENTANA_SNAPSHOT_S, canonicoDeep, appDe, nombreMaquina, claveMaquina,
  censoDesktop, etiquetaCenso, lineaAgente, atribuirPulso, textoEdad,
} from "./win95-deepagents-lib.mjs";
import { construir } from "./functions/api/win95/deepagents.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-26T12:21:44Z");
const S = Math.floor(AHORA / 1000);

test("canonicoDeep: sufijos de máquina y tildes; los consejeros no cuentan", () => {
  assert.equal(canonicoDeep("Oraculo"), "Oráculo");
  assert.equal(canonicoDeep("NeoMBP14"), "Neo");
  assert.equal(canonicoDeep("TrinityMBP14"), "Trinity");
  assert.equal(canonicoDeep("SmithMacMini"), "Smith");
  assert.equal(canonicoDeep("NiobeMacMini"), "Niobe");
  assert.equal(canonicoDeep("WhiteRabbit"), "WhiteRabbit");
  assert.equal(canonicoDeep("Merovingio"), "Merovingio");
  assert.equal(canonicoDeep("Jobs"), "");
  assert.equal(canonicoDeep("Musk"), "");
  assert.equal(canonicoDeep("Grok Bot"), "");
  assert.equal(canonicoDeep("Grok Bot (Consejo)"), "");
});

test("appDe: unifica runtimes y descarta Grok Bot.app de consejeros", () => {
  assert.equal(appDe("Claude", null), "Claude");
  assert.equal(appDe("Codex", "ChatGPT"), "Codex");
  assert.equal(appDe(null, "Claude"), "Claude");
  assert.equal(appDe(null, "GrokBot"), null);
  assert.equal(appDe("Grok Bot", null), null);
  assert.equal(appDe("OpenCode", "OpenCode"), "OpenCode");
  assert.equal(appDe("Grok", "Grok"), "Grok");
});

test("nombreMaquina: nombres cortos y legibles, sin IPs", () => {
  assert.equal(nombreMaquina("MacBook Pro 16"), "MBP16");
  assert.equal(nombreMaquina("MacBookPro16"), "MBP16");
  assert.equal(nombreMaquina("MacStudio"), "Mac Studio");
  assert.equal(nombreMaquina("Mac Mini (Carlos)"), "Mac Mini");
  assert.equal(nombreMaquina("MacBookAirRosa"), "Air Rosa");
  assert.equal(claveMaquina("MacBook Pro 16"), claveMaquina("MacBookPro16"));
});

test("censo: sin pulso ni presencia es «sin dato», no un cero inventado", () => {
  const r = censoDesktop({ superficies: [], presence: [], ahoraMs: AHORA, pulsoOk: false, presenciaOk: false });
  assert.equal(r.ok, false);
  assert.equal(r.sinFuente, true);
  assert.equal(r.abiertos, 0);
  assert.match(r.motivo, /no ha llegado/);
  const e = etiquetaCenso(r);
  assert.equal(e.txt, "(sin dato)");
  assert.match(e.title, /sin dato/);
});

test("censo: con fuente y cero apps abiertas es 0, no «sin dato»", () => {
  const r = censoDesktop({
    superficies: [{ maquina: "MacMini", tipo: "cli", agente: "Smith", app: "GrokBot CLI" }],
    presence: [],
    ahoraMs: AHORA,
    pulsoOk: true,
    presenciaOk: true,
    pulsoHaceS: 20,
  });
  assert.equal(r.ok, true);
  assert.equal(r.sinFuente, false);
  assert.equal(r.abiertos, 0);
  assert.equal(r.distintos, 0);
  const e = etiquetaCenso(r);
  assert.match(e.txt, /^\(0 abiertos · 0 distintos/);
  assert.doesNotMatch(e.txt, /sin dato/);
});

test("censo: process_snapshot verificado y fresco cuenta; heartbeat viejo o ranura no", () => {
  const presence = [
    { persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", host: "app", source: "process_snapshot", session_id: "desktop:claude", verified: 1, updated: S - 10, pid: 11 },
    { persona: "Trinity", machine: "MacBookAirRosa", runtime: "Codex", host: "app", source: "process_snapshot", session_id: "desktop:codex", verified: 1, updated: S - 17, pid: 12 },
    { persona: "Neo", machine: "MacStudio", runtime: "Claude", host: "app", source: "heartbeat", verified: 0, updated: S - 63899 },
    { persona: "Neo", machine: "MacBookAirPlata", runtime: "Claude", host: "app", source: "heartbeat", verified: 0, updated: S - 1571 },
    { persona: "Morfeo", machine: "MacBookAirRosa", runtime: "Claude", host: "cli", source: "process_snapshot", verified: 1, updated: S - 17, session_id: "morfeo", pid: 13 },
  ];
  const r = censoDesktop({ superficies: [], presence, ahoraMs: AHORA, pulsoOk: false, presenciaOk: true });
  assert.equal(r.abiertos, 2);
  assert.equal(r.distintos, 2);
  assert.deepEqual(r.agentes.map((a) => a.persona + ":" + a.maquinas.join("+")), ["Neo:MBP16", "Trinity:Air Rosa"]);
  assert.equal(lineaAgente(r.agentes[0]), "Neo · Claude — MBP16");
  assert.equal(lineaAgente(r.agentes[1]), "Trinity · Codex — Air Rosa");
});

test("censo: snapshot caducado (> 120 s) no cuenta", () => {
  const presence = [
    { persona: "Neo", machine: "MBP16", runtime: "Claude", host: "app", source: "process_snapshot", verified: 1, updated: S - (VENTANA_SNAPSHOT_S + 5), pid: 1 },
  ];
  const r = censoDesktop({ presence, ahoraMs: AHORA, pulsoOk: false, presenciaOk: true });
  assert.equal(r.abiertos, 0);
});

test("censo: pulso tipo app + atribución cuando el MAPA deja el agente vacío", () => {
  const snaps = [
    { persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", host: "app", source: "process_snapshot", verified: 1, updated: S - 10, pid: 1 },
    { persona: "Trinity", machine: "MacBook Pro 16", runtime: "Codex", host: "app", source: "process_snapshot", verified: 1, updated: S - 10, pid: 2 },
  ];
  assert.equal(atribuirPulso({ agente: null, app: "Claude", maquina: "MacBookPro16" }, [
    { persona: "Neo", app: "Claude", maquinaClave: claveMaquina("MacBookPro16") },
  ]), "Neo");
  const superficies = [
    { maquina: "MacMini", tipo: "app", app: "Claude", agente: "Morfeo" },
    { maquina: "MacMini", tipo: "app", app: "Codex", agente: "Oráculo" },
    { maquina: "MacMini", tipo: "app", app: "GrokBot", agente: null },
    { maquina: "MacBookPro16", tipo: "app", app: "Claude", agente: null },
    { maquina: "MacBookPro16", tipo: "app", app: "Codex", agente: null },
    { maquina: "MacBookPro16", tipo: "cli", app: "Claude Code", agente: "Neo" },
    { maquina: "MacStudio", tipo: "app", app: "Claude", agente: "Neo" },
    { maquina: "MacStudio", tipo: "app", app: "Codex", agente: "Trinity" },
    { maquina: "MacBookAirRosa", tipo: "cli", agente: "Smith", runtime: "Grok" },
  ];
  const presence = snaps.concat([
    { persona: "Morfeo", machine: "MacBookAirRosa", runtime: "Claude", host: "app", source: "process_snapshot", verified: 1, updated: S - 17, pid: 3 },
    { persona: "Trinity", machine: "MacBookAirRosa", runtime: "Codex", host: "app", source: "process_snapshot", verified: 1, updated: S - 17, pid: 4 },
  ]);
  const r = censoDesktop({ superficies, presence, ahoraMs: AHORA, pulsoOk: true, presenciaOk: true, pulsoHaceS: 32 });
  assert.equal(r.abiertos, 8, JSON.stringify(r.agentes, null, 2));
  assert.equal(r.distintos, 4);
  const por = Object.fromEntries(r.agentes.map((a) => [a.persona, a]));
  assert.deepEqual(por.Neo.maquinas, ["Mac Studio", "MBP16"]);
  assert.deepEqual(por.Morfeo.maquinas, ["Mac Mini", "Air Rosa"]);
  assert.deepEqual(por.Trinity.maquinas, ["Mac Studio", "MBP16", "Air Rosa"]);
  assert.deepEqual(por.Oráculo.maquinas, ["Mac Mini"]);
  assert.equal(lineaAgente(por.Morfeo), "Morfeo · Claude — Mac Mini, Air Rosa");
  assert.equal(lineaAgente(por.Trinity), "Trinity · Codex — Mac Studio, MBP16, Air Rosa");
  const e = etiquetaCenso(r);
  assert.match(e.txt, /\(8 abiertos · 4 distintos/);
  assert.doesNotMatch(JSON.stringify(r), /@|100\.\d+\.\d+\.\d+|token|secret/i);
});

test("superficiesDePulso ignora pulsos de más de 3 min; el censo no los cuenta", () => {
  const docs = [
    { maquina: "MacMini", superficies: { ts: AHORA - STALE_MS - 1000, lista: [{ tipo: "app", app: "Claude", agente: "Morfeo" }] } },
    { maquina: "MacStudio", superficies: { ts: AHORA - 20_000, lista: [{ tipo: "app", app: "Claude", agente: "Neo" }] } },
  ];
  const sup = superficiesDePulso(docs, AHORA);
  assert.equal(sup.length, 1);
  assert.equal(sup[0].agente, "Neo");
  const r = censoDesktop({ superficies: sup, presence: [], ahoraMs: AHORA, pulsoOk: true, pulsoHaceS: 20, presenciaOk: true });
  assert.equal(r.abiertos, 1);
  assert.equal(r.agentes[0].persona, "Neo");
});

test("construir: junta pulsos y presencia, y no cuela correos ni IPs", async () => {
  const ahora = AHORA;
  const pulsos = [
    { maquina: "MacStudio", superficies: { ts: ahora - 30_000, lista: [{ tipo: "app", app: "Claude", agente: "Neo" }, { tipo: "app", app: "GrokBot", agente: null }] } },
  ];
  const presence = [
    { persona: "Morfeo", machine: "MacBookAirRosa", runtime: "Claude", host: "app", source: "process_snapshot", verified: 1, updated: S - 12, pid: 9, focus: "secreto", email: "nobody@example.com" },
  ];
  const r = await construir({ pulsos, presencia: presence, ahoraMs: ahora, env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.abiertos, 2);
  assert.equal(r.distintos, 2);
  const raw = JSON.stringify(r);
  assert.equal(/@|secreto|example\.com/.test(raw), false);
  assert.equal(r.agentes.every((a) => !("focus" in a) && !("email" in a) && !("pid" in a)), true);
});

test("construir: si fallan pulso y presencia, sin dato", async () => {
  const r = await construir({ pulsos: [], presencia: null, ahoraMs: AHORA, env: {} });
  assert.equal(r.sinFuente, true);
  assert.equal(etiquetaCenso(r).txt, "(sin dato)");
});

test("ICQGram usa el censo de apps de escritorio, no el cupo, en DeepAgents", () => {
  assert.match(html, /function deepCab\(/);
  assert.match(html, /\/api\/win95\/deepagents/);
  assert.match(html, /deepCargar/);
  assert.match(html, /N abiertos|abiertos · .*distintos/);
  assert.match(html, /k===['"]deepagents['"]\s*\?\s*deepCab/);
  assert.doesNotMatch(html.replace(/function cupoCab[\s\S]*?\nfunction /, ""), /deepagents['"]\)\s*return \{txt:'\(sin dato\)'/);
});

test("textoEdad y catálogo conocidos", () => {
  assert.equal(textoEdad(32), "hace 32 s");
  assert.equal(textoEdad(120), "hace 2 min");
  assert.ok(CATALOGO.some((c) => c.persona === "WhiteRabbit"));
  assert.ok(CATALOGO.some((c) => c.persona === "Cypher"));
});
