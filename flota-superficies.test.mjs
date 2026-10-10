// r23 superficies (Carlos, 10-10-2026 17:28/17:29/17:36): Terminal (CLI) vs app de escritorio, por Mac.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarPulso, aplicarPulso, superficiesDePulso, STALE_MS } from "./consumos-pulso-lib.mjs";
import { tarjetas, superficiesDe, appsEnUso, conCarlosPorPresencia, RUNTIME_ASISTENTE } from "./flota-trabajando-lib.mjs";
import { conSuperficies } from "./functions/api/flota/trabajando.js";

const T = 1791627668, A = T * 1000;
const supMBP16 = (enUsoGrok = true) => [
  { agente: "Neo", tipo: "cli", sesion: "neo", motor: "claude", runtime: "Claude Code", adjunto: false },
  { agente: "Morfeo", tipo: "cli", sesion: "morfeo", motor: "claude", runtime: "Claude Code", adjunto: false },
  { agente: "Trinity", tipo: "cli", sesion: "trinity", motor: "codex", runtime: "Codex CLI", adjunto: false },
  { agente: "Smith", tipo: "cli", sesion: "smith", motor: "grok", runtime: "GrokBot CLI", adjunto: false },
  { agente: "Neo", tipo: "app", app: "Claude", alFrente: false, enUso: false },
  { agente: "Trinity", tipo: "app", app: "Codex", alFrente: false, enUso: false },
  { agente: null, tipo: "app", app: "GrokBot", alFrente: enUsoGrok, enUso: enUsoGrok, cuenta: "csilvasantin@gmail.com" },
];

test("normalizarSuperficies: valida, sin campos extra, y un Mac solo con superficies es un pulso válido", () => {
  const n = normalizarPulso({ maquina: "MacBookPro16", agentes: [], superficies: [...supMBP16(), { tipo: "cli", agente: "X" }, { tipo: "app", app: "Evil<script>" }, { tipo: "app", app: "Claude", agente: "Neo", secreto: "no" }] });
  assert.equal(n.ok, true);
  assert.equal(n.pulso.superficies.length, 8);
  assert.equal(n.pulso.superficies[7].secreto, undefined);
  const d = aplicarPulso(null, n.pulso, A).doc;
  assert.equal(superficiesDePulso([d], A + 1000).length, 8);
  assert.equal(superficiesDePulso([d], A + STALE_MS + 1).length, 0, "pulso viejo: no se sabe nada de ese Mac");
  assert.equal(superficiesDePulso([d], A)[0].maquina, "MacBookPro16");
});

const velocidad = (enUsoGrok) => ({
  porAgente: [
    { agente: "Neo", maquina: "MacBookPro16", motor: "claude", tokHoy: 10, tokHora: 0, conCarlos: false, conCarlosMotivo: "Mac activo (reposo 0s, Grok Bot al frente) pero sin señal de este agente" },
    { agente: "Trinity", maquina: "MacBookPro16", motor: "codex", tokHoy: 10, tokHora: 0, conCarlos: false, conCarlosMotivo: "Mac activo (reposo 0s, Grok Bot al frente) pero sin señal de este agente" },
  ],
  superficies: supMBP16(enUsoGrok).map((x) => ({ maquina: "MacBookPro16", ...x })),
  grokbotApps: [{ maquina: "MacBookPro16", cuenta: "csilvasantin@gmail.com", alFrente: enUsoGrok, reposoS: 0, usoS: 0, fuente: "app" }],
});
const snap = (o) => ({ source: "process_snapshot", declaration_state: "exact_surface", updated: T - 2, declared_updated: T - 30, ...o });
const presencia = [
  snap({ persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", host: "app", session_id: "desktop:claude", attached: true, idle: 0 }),
  snap({ persona: "Trinity", machine: "MacBook Pro 16", runtime: "Codex", host: "app", session_id: "desktop:codex", attached: true, idle: 0 }),
  snap({ persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", host: "cli", session_id: "neo", attached: false, idle: 0 }),
  snap({ persona: "Merovingio", machine: "GrokBot", runtime: "Grok", host: "cli", source: "heartbeat" }),
];
const de = (t, n) => t.find((x) => x.agente === n);

test("MBP16 con GrokBot al frente: Neo/Trinity en Terminal (CLI) + app abierta sin uso, y NO «con Carlos»", () => {
  const t = tarjetas({ presencia, velocidad: velocidad(true), ahoraS: T });
  for (const n of ["Neo", "Trinity"]) {
    const x = de(t, n);
    assert.notEqual(x.estado, "amarillo", n + ": la app abierta (aunque «adjunta») no es estar con Carlos");
    assert.equal(x.superficies[0].tipo, "cli");
    assert.equal(x.superficies[0].corta, "MBP16");
    const app = x.superficies.find((s) => s.tipo === "app");
    assert.equal(app.enUso, false);
    assert.equal(x.superficies.filter((s) => s.tipo === "cli").length, 1, "latido + pulso del mismo Mac = una sola");
  }
  assert.deepEqual(de(t, "Morfeo").superficies.map((s) => s.tipo + ":" + s.corta), ["cli:MBP16"]);
  assert.equal(de(t, "Smith").superficies[0].runtime, "GrokBot CLI");
});

test("Merovingio: Terminal (CLI) en el servidor GrokBot + «App de escritorio · Carlos» cuando habla con Elon en la app", () => {
  const m = de(tarjetas({ presencia, velocidad: velocidad(true), ahoraS: T }), "Merovingio");
  assert.deepEqual(m.superficies.map((s) => [s.tipo, s.corta, s.app || null, !!s.enUso]), [["cli", "GrokBot", null, false], ["app", "MBP16", "GrokBot", true]]);
  const m2 = de(tarjetas({ presencia, velocidad: velocidad(false), ahoraS: T }), "Merovingio");
  assert.equal(m2.superficies.find((s) => s.tipo === "app").enUso, false, "app abierta sin estar al frente: sin uso");
});

test("Consejeros principales: «GrokBot (asistente)», nunca «GrokBot CLI»; app con Carlos si usa su chat", () => {
  const t = tarjetas({ presencia, velocidad: velocidad(true), ahoraS: T });
  for (const n of ["Musk", "Huang", "Jobs", "Wozniak"]) {
    const x = de(t, n);
    assert.equal(x.runtime, RUNTIME_ASISTENTE, n);
    assert.doesNotMatch(String(x.motor), /CLI/, n);
    assert.ok(!x.superficies.some((s) => s.tipo === "cli"), n + " no tiene CLI");
    assert.equal(x.superficies[0].tipo, "asistente");
  }
  assert.equal(de(t, "Musk").superficies.find((s) => s.tipo === "app").enUso, true);
  assert.equal(de(t, "Jobs").superficies.some((s) => s.tipo === "app"), false, "la app del MBP16 está en la cuenta de Musk/Huang");
});

test("La app de escritorio solo cuenta como «con Carlos» si el pulso dice enUso", () => {
  const act = new Map([["macbookpro16", "pulso"]]);
  const l = [presencia[0]];
  assert.equal(conCarlosPorPresencia(l, act, T), null);
  assert.equal(conCarlosPorPresencia(l, act, T, appsEnUso([{ maquina: "MacBookPro16", tipo: "app", app: "Codex", enUso: true }])), null);
  assert.ok(conCarlosPorPresencia(l, act, T, appsEnUso([{ maquina: "MacBookPro16", tipo: "app", app: "Claude", enUso: true }])));
});

test("Matriz: columna Superficie con las superficies de la ficha (Oráculo = Oraculo)", () => {
  const m = conSuperficies({ filas: [{ persona: "Oraculo", agente: "Oráculo" }, { persona: "Cypher" }] }, [{ agente: "Oráculo", superficies: [{ tipo: "cli", corta: "Mini" }] }]);
  assert.equal(m.filas[0].superficies[0].corta, "Mini");
  assert.deepEqual(m.filas[1].superficies, []);
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /<th data-en="Surface">Superficie<\/th>/);
  assert.match(html, /data-en="Surface: Terminal \(CLI\) is the agent's working channel/);
});

test("Cliente: textos ES/EN de superficie", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  for (const s of ["'Terminal (CLI)'", "'App de escritorio · Carlos', 'Desktop app · Carlos'", "'App abierta, sin uso', 'App open, not in use'", "(assistant)"]) assert.ok(js.includes(s), s);
  const mz = readFileSync(new URL("./assets/consumos-matriz.js", import.meta.url), "utf8");
  assert.ok(mz.includes("'GrokBot (assistant)'") && mz.includes("colspan=\"7\""));
});

test("r24: fila plegada con todos por nombre (parados atenuados «en espera») y sin «asistente» repetido", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const win = { addEventListener() {}, dispatchEvent() {} };
  const doc = { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null };
  new Function("window", "document", "location", "localStorage", "URL", js.replace(/\(typeof window !== 'undefined' \? window : globalThis\)\s*;?\s*$/, "(window);"))(win, doc, { href: "https://x/consumos" }, { getItem: () => null }, URL);
  const { chipsDe } = win.ConsumosTrabajando;
  const html = chipsDe([
    { agente: "Trinity", estado: "gris", motor: "Codex", runtime: "Codex", maqCorta: "MBP16", superficies: [{ tipo: "cli", corta: "MBP16" }] },
    { agente: "Musk", estado: "amarillo", conCarlosEn: "MBP16", motor: "GrokBot (asistente)", runtime: "GrokBot (asistente)", maqCorta: "MBP16", superficies: [{ tipo: "asistente" }, { tipo: "app", enUso: true }] },
  ]);
  assert.ok(html.indexOf("Musk") < html.indexOf("Trinity"), "los vivos primero");
  assert.match(html, /tr-chipa tr-gris[^>]*>.*Trinity.*Codex · CLI.*en espera/);
  assert.doesNotMatch(html, /tr-grises/);
  assert.match(html, /GrokBot \(asistente\) · App · Carlos</);
  assert.doesNotMatch(html, /asistente\) · asistente/);
});
