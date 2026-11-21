// r242 (Carlos, 21-11-2026 22:50): «que ponga en que esta el Agente o el DeepAgent … la misión actual o la ultima que ha hecho».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tituloEncargo, misionesDe, queHaceDe } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-21T21:50:00Z") / 1000);

test("r242: título legible, sin coletillas de quién lo pide; chats → «chat con …»", () => {
  assert.equal(tituloEncargo("[chat-coetaneos] Steve Jobs → Morfeo\nCanal agente ↔ consejero"), "chat con Steve Jobs");
  assert.equal(tituloEncargo("Carlos (via Jensen): if the AdmiraTV player on this PC isn't running, start it."), "If the AdmiraTV player on this PC isn't running, start it");
  assert.equal(tituloEncargo("URGENTE, Carlos por voz (19-nov 12:31). En este PC la pantalla está en negro. 1) Haz"), "En este PC la pantalla está en negro");
  assert.equal(tituloEncargo("Encargo de Jobs (consejero Leyenda) para Trinity en el MacStudio, la primera prueba del reparto fijo de DeepAgents. Carlos ha fijado"), "La primera prueba del reparto fijo de DeepAgents");
  assert.ok(tituloEncargo("x ".repeat(80)).length <= 80);
  assert.equal(tituloEncargo(""), null);
});

const items = [
  { id: 7621, status: "in_progress", target_persona: "Neo", target_machine: "macstudio", ack_at: T - 200000, text: "Retoma de #7612 (Screen sync AdmiraNeXT01–05), sesión nueva. Carlos dio el OK" },
  { id: 7650, status: "in_progress", target_persona: "Neo", target_machine: "macstudio", ack_at: T - 10, text: "[chat-coetaneos] Steve Jobs → Neo\nhola" },
  { id: 7647, status: "done", target_persona: "Neo", target_machine: "macbookpro16", done_at: T - 1300, text: "Actualiza FleetControl en este MacBook Pro 16 a main." },
  { id: 7649, status: "done", target_persona: "Neo", target_machine: "macstudio", done_at: T - 60, text: "[chat-coetaneos] Steve Jobs → Neo\nx" },
  { id: 7600, status: "cancelled", target_persona: "Neo", done_at: T - 5, text: "Cancelado" },
  { id: 1, status: "done", target_persona: "Trinity", done_at: T, text: "De otra persona." },
];

test("r242: misionesDe — en curso (no chat primero), última hecha (no chat), último chat; cancelados fuera", () => {
  const m = misionesDe(items, "Neo");
  assert.equal(m.enCurso.id, "#7621");
  assert.equal(m.ultima.id, "#7647");
  assert.equal(m.ultimoChat.titulo, "chat con Steve Jobs");
});

test("r242: queHaceDe — prioridad y máquina mostrada", () => {
  const m = misionesDe(items, "Neo");
  assert.deepEqual(queHaceDe({ misiones: m, maquina: "MacStudio", ahoraS: T }).tipo, "en_curso");
  const sinCurso = { ...m, enCurso: null };
  const u = queHaceDe({ misiones: sinCurso, maquina: "MacStudio", ahoraS: T });
  assert.equal(u.tipo, "ultima"); assert.equal(u.id, "#7647"); assert.equal(u.otraMaquina, true); assert.equal(u.maquina, "MBP16");
  // caso #7556 SubTrinity: tarea de un process_snapshot del CLI del MBP16 → nunca «en curso» en la ficha del MacStudio
  const lat = { tarea: "SubTrinity · #7556/#7586 FLT-102832: etiqueta subida", encargo: "#7556", ts: T - 5, maquina: "MacBook Pro 16", fuente: "process_snapshot" };
  const q = queHaceDe({ misiones: { enCurso: null, ultima: null, ultimoChat: null }, latido: lat, maquina: "MacStudio", ahoraS: T });
  assert.equal(q.tipo, "ultimo"); assert.equal(q.ts, null); assert.equal(q.otraMaquina, true);
  // latido propio fresco de la misma máquina → tarea declarada en curso
  const d = queHaceDe({ misiones: null, latido: { tarea: "Revisar consumos", ts: T - 60, maquina: "MacMini", fuente: "heartbeat" }, maquina: "MacMini", ahoraS: T });
  assert.equal(d.tipo, "declarado");
  assert.equal(queHaceDe({ misiones: null, latido: null, maquina: "MacMini", ahoraS: T }), null);
  // consejeros: la máquina de la misión (grokbot) no se marca como «otra»
  assert.equal(queHaceDe({ misiones: sinCurso, maquina: "MacStudio", consejero: true, ahoraS: T }).otraMaquina, false);
});

test("r242: cliente — texto fijo de la misión (no rota), LLM pequeño, «sin misión registrada», elipsis en móvil", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  const win = { addEventListener() {}, dispatchEvent() {} };
  const doc = { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null };
  new Function("window", "document", "location", "localStorage", "URL", js.replace(/\(typeof window !== 'undefined' \? window : globalThis\)\s*;?\s*$/, "(window);"))(win, doc, { href: "https://x/consumos" }, { getItem: () => null }, URL);
  const { queHaceTxt, fijaChip } = win.ConsumosTrabajando;
  const ahora = Math.floor(Date.now() / 1000);
  assert.equal(queHaceTxt({ queHace: { tipo: "en_curso", id: "#7642", titulo: "Instalar AdmiraStudioImporter 1.0.9", ts: ahora - 60 } }), "#7642 · Instalar AdmiraStudioImporter 1.0.9");
  assert.match(queHaceTxt({ queHace: { tipo: "ultima", id: "#7630", titulo: "Algo", ts: ahora - 60, maquina: "MBP16", otraMaquina: true } }), /^última: #7630 · Algo · \d\d:\d\d · en MBP16$/);
  assert.equal(queHaceTxt({ queHace: null }), "sin misión registrada");
  const h = fijaChip({ agente: "Trinity", estado: "verde", motor: "Codex", modelo: "6.1 Sol", proyecto: "admira.studio", queHace: { tipo: "en_curso", id: "#1", titulo: "X", ts: ahora } });
  assert.match(h, /tr-qh">#1 · X</); assert.match(h, /tr-peq">admira\.studio · Codex · 6\.1 Sol</); assert.doesNotMatch(h, /tr-b"/);
  assert.match(html, /\.tr-fija \.tr-qh\{[^}]*text-overflow:ellipsis/);
  assert.match(html, /max-width:640px\)\{\.tr-fija \.tr-peq\{display:none\}/);
});
