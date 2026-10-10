// r40 (Carlos, 10-10-2026 — «que todos sus feedbacks sean seguros»): con Carlos por presencia, Merovingio, CPU de
// máquina, presencia lenta con caché y tokens honestos. Casos sacados de la captura real de las 12:20 (Madrid).
import test from "node:test";
import assert from "node:assert/strict";
import { canonico, tarjetas, maquinasConCarlos, superficieDeCarlos, conCarlosPorPresencia, claveMaquina, SIEMPRE } from "./flota-trabajando-lib.mjs";
import { construir, leerPresencia, _olvidarPresencia, MAX_EDAD_PRESENCIA_S } from "./functions/api/flota/trabajando.js";

const T = 1791627668;
const snap = (o) => ({ source: "process_snapshot", declaration_state: "exact_surface", updated: T - 2, declared_updated: T - 30, ...o });
// El Air (donde está Carlos): Trinity y Neo en la app de escritorio; Oráculo y Morfeo en tmux con cliente adjunto.
const air = (idle) => [
  snap({ persona: "Neo", machine: "MacBookAir16plata", runtime: "Claude", host: "app", session_id: "desktop:claude", attached: false, cpu: 9, idle }),
  snap({ persona: "Trinity", machine: "MacBookAir16plata", runtime: "Codex", host: "app", session_id: "desktop:codex", attached: false, cpu: 9, idle }),
  snap({ persona: "Oraculo", machine: "MacBookAir16plata", runtime: "Codex", host: "cli", session_id: "oraculo", attached: true, cpu: 9, idle }),
];
// El MBP16 en reposo 8 min: apps abiertas y adjuntas, pero Carlos no está ahí.
const mbp16 = [
  snap({ persona: "Neo", machine: "MacBook Pro 16", host: "app", session_id: "desktop:claude", attached: true, cpu: 12, idle: 490 }),
  snap({ persona: "Trinity", machine: "MacBook Pro 16", host: "app", session_id: "desktop:codex", attached: true, cpu: 12, idle: 490 }),
  snap({ persona: "Morfeo", machine: "MacBook Pro 16", host: "cli", session_id: "morfeo", attached: false, cpu: 12, idle: 490 }),
];
const velocidadReal = { porAgente: [
  { agente: "Trinity", maquina: "MacBookPro16", motor: "codex", tokHoy: 868037, tokHora: 2464048, tokUltimaHora: 868037, conCarlos: false, conCarlosMotivo: "Mac en reposo 8 min" },
  { agente: "Neo", maquina: "MacBookPro16", motor: "claude", tokHoy: 0, tokHora: 0, tokUltimaHora: 0, conCarlos: false, conCarlosMotivo: "Mac en reposo 8 min" },
] };
const de = (t, n) => t.find((x) => x.agente === n);
const resumen = (t) => ({ v: t.filter((x) => x.estado === "verde").length, a: t.filter((x) => x.estado === "amarillo").length });

test("claveMaquina iguala «MacBook Pro 16», «MacBookPro16» y «MacBook-Pro-16.local»", () => {
  assert.equal(claveMaquina("MacBook Pro 16"), claveMaquina("MacBookPro16"));
  assert.equal(claveMaquina("MacBook-Pro-16.local"), "macbookpro16");
});

test("Merovingio: «Elon / Merovingio», «Elon», «MerovingioMBA16» → Merovingio; «Elon Musk» y «Musk» siguen siendo Musk", () => {
  for (const n of ["Elon / Merovingio", "Elon/Merovingio", "Elon", "Merovingio", "MerovingioMBA16", "merovingio"]) assert.equal(canonico(n), "Merovingio", n);
  assert.equal(canonico("Elon Musk"), "Musk");
  assert.equal(canonico("Musk"), "Musk");
});

test("Merovingio sale SIEMPRE (aunque no haya latido ni pulso), sin marcarse como consejero", () => {
  assert.ok(SIEMPRE.includes("Merovingio"));
  const m = de(tarjetas({ presencia: [], velocidad: null, ahoraS: T }), "Merovingio");
  assert.ok(m, "sale la tarjeta");
  assert.deepEqual([m.estado, m.motivo, m.consejero], ["gris", "sin latido", false]);
  const t = tarjetas({ presencia: [{ persona: "Elon / Merovingio", machine: "MacBookAir16plata", runtime: "Grok", host: "cli", source: "heartbeat", mode: "pasivo", updated: T - 5 }], ahoraS: T });
  assert.equal(t.filter((x) => x.agente === "Merovingio").length, 1);
  assert.equal(de(t, "Musk").motivo, "sin latido", "el latido de Merovingio no se le apunta a Musk");
});

test("superficieDeCarlos (r41): app de escritorio ADJUNTA o tmux adjunto sí; ranura desktop sin adjuntar, tmux sin cliente o latido de la mesa Grok no", () => {
  assert.equal(superficieDeCarlos(air(30)[0]), false, "la ranura desktop:claude del Air existe, pero nadie la mira");
  assert.equal(superficieDeCarlos(mbp16[0]), true);
  assert.equal(superficieDeCarlos(air(30)[2]), true);
  assert.equal(superficieDeCarlos(mbp16[2]), false);
  assert.equal(superficieDeCarlos({ source: "heartbeat", host: "app", persona: "Jobs", machine: "GrokBot" }), false);
});

test("maquinasConCarlos: reposo HID medido < 5 min sí; MBP16 a 490 s no; idle 0 con cpu 0 (sin medir) no", () => {
  const m = maquinasConCarlos({ presencia: [...air(30), ...mbp16], velocidad: velocidadReal, ahoraS: T });
  assert.deepEqual([...m.keys()], ["macbookair16plata"]);
  assert.equal(maquinasConCarlos({ presencia: air(0).map((e) => ({ ...e, cpu: 0 })), ahoraS: T }).size, 0);
  const porPulso = maquinasConCarlos({ presencia: [], velocidad: { porAgente: [{ agente: "Neo", maquina: "MacBookAir16plata", conCarlos: true }] }, ahoraS: T });
  assert.ok(porPulso.has("macbookair16plata"));
});

test("Air activo: solo cuenta lo adjunto (tmux «oraculo»); las ranuras desktop sin adjuntar del Air no", () => {
  const t = tarjetas({ presencia: [...air(30), ...mbp16], velocidad: velocidadReal, ahoraS: T });
  assert.equal(de(t, "Oráculo").estado, "amarillo", "tmux con cliente adjunto en el Mac activo");
  assert.match(de(t, "Oráculo").motivo, /tmux «oraculo»/);
  assert.equal(de(t, "Oráculo").conCarlosEn, "MBA16");
  assert.notEqual(de(t, "Neo").estado, "amarillo", "MBP16 en reposo 490 s y la app del Air sin adjuntar");
  assert.equal(de(t, "Morfeo").estado, "gris", "Morfeo en el MBP16 en reposo, sin cpu propia: parado, no «trabajando»");
  assert.equal(resumen(t).a, 1);
});

test("sin señal de que Carlos use el Mac, una app abierta NO es «con Carlos» (no se inventa)", () => {
  const t = tarjetas({ presencia: mbp16, velocidad: velocidadReal, ahoraS: T });
  assert.equal(resumen(t).a, 0);
  assert.equal(de(t, "Trinity").estado, "verde", "Trinity sigue en verde por sus tokens");
  const viejo = tarjetas({ presencia: air(30).map((e) => ({ ...e, updated: T - 600, declared_updated: T - 600 })), ahoraS: T });
  assert.equal(resumen(viejo).a, 0, "presencia de hace 10 min no vale");
});

test("el pulso con conCarlos sigue mandando (r20) y con con_carlos:true en el latido también", () => {
  const t = tarjetas({ presencia: [], velocidad: { porAgente: [{ agente: "Neo", maquina: "MacBookAir16plata", conCarlos: true, tokHoy: 5, tokHora: 0 }] }, ahoraS: T });
  assert.deepEqual([de(t, "Neo").estado, de(t, "Neo").motivo], ["amarillo", "con Carlos"]);
  const h = tarjetas({ presencia: [{ persona: "Merovingio", machine: "MacBookAir16plata", source: "heartbeat", con_carlos: true, updated: T - 5 }], ahoraS: T });
  assert.equal(de(h, "Merovingio").estado, "amarillo");
});

test("captura real de MacMini: cpu 27 de toda la máquina con 17 h de reposo → Smith/Morfeo parados, no «trabajando»", () => {
  const mini = [
    snap({ persona: "Smith", machine: "MacMini", host: "cli", session_id: "smith", cpu: 27, idle: 61946 }),
    snap({ persona: "Morfeo", machine: "MacMini", host: "app", session_id: "desktop:claude", attached: true, cpu: 27, idle: 61946, mode: "pasivo" }),
  ];
  const t = tarjetas({ presencia: mini, ahoraS: T });
  assert.equal(de(t, "Smith").estado, "gris");
  assert.equal(de(t, "Morfeo").estado, "gris");
});

test("tokens honestos: tokUltimaHora real, método «15 min × 4» y sinMedicion en vez de 0", () => {
  const t = tarjetas({ presencia: mbp16, velocidad: velocidadReal, ahoraS: T });
  const tr = de(t, "Trinity"), neo = de(t, "Neo");
  assert.deepEqual([tr.tokHora, tr.tokUltimaHora, tr.tokHoraMetodo, tr.sinMedicion], [2464048, 868037, "15 min × 4", false]);
  assert.equal(neo.sinMedicion, true, "Claude a 0 todo el día = sin medición");
  assert.equal(de(t, "Jobs").sinMedicion, true, "sin pulso = sin medición");
});

test("conCarlosPorPresencia ignora máquinas no activas", () => {
  assert.equal(conCarlosPorPresencia(air(30), new Map(), T), null);
  assert.ok(conCarlosPorPresencia(air(30), new Map([["macbookair16plata", "x"]]), T));
});

const presOk = (ahora) => new Response(JSON.stringify({ ok: true, presence: [{ persona: "Merovingio", machine: "MacBookAir16plata", runtime: "Grok", source: "heartbeat", mode: "pasivo", updated: Math.floor(ahora / 1000) - 5 }] }));

test("presencia: si Yokup falla, la última buena de ≤ 2 min se usa como «cache»; más vieja → «sin respuesta»", async () => {
  _olvidarPresencia();
  const t0 = Date.now();
  let r = await leerPresencia(async () => presOk(t0), t0, null);
  assert.equal(r.estado, "ok");
  const falla = async () => { throw new Error("timeout"); };
  r = await leerPresencia(falla, t0 + 30000, null);
  assert.deepEqual([r.estado, r.edadS, r.d.presence[0].persona], ["cache", 30, "Merovingio"]);
  r = await leerPresencia(falla, t0 + (MAX_EDAD_PRESENCIA_S + 1) * 1000, null);
  assert.deepEqual([r.estado, r.d], ["sin respuesta", null]);
  _olvidarPresencia();
});

test("presencia: la última buena también se guarda/lee de la caché de borde (otro isolate)", async () => {
  _olvidarPresencia();
  const mem = new Map();
  const cache = { put: async (req, res) => { mem.set(req.url, await res.text()); }, match: async (req) => (mem.has(req.url) ? new Response(mem.get(req.url)) : undefined) };
  const t0 = Date.now();
  await leerPresencia(async () => presOk(t0), t0, cache);
  _olvidarPresencia(); // otro isolate: sin memoria
  const r = await leerPresencia(async () => new Response("x", { status: 504 }), t0 + 10000, cache);
  assert.deepEqual([r.estado, r.edadS], ["cache", 10]);
  _olvidarPresencia();
});

test("/api/flota/trabajando: presencia de caché → presencia «cache» con su edad, y Merovingio sigue en la franja", async () => {
  _olvidarPresencia();
  const t0 = Date.now();
  const ok = async (url) => (String(url).includes("presence") ? presOk(t0) : new Response("no", { status: 503 }));
  await construir({ env: {}, fetchImpl: ok, ahoraMs: t0, cache: null });
  const r = await construir({ env: {}, fetchImpl: async () => new Response("no", { status: 503 }), ahoraMs: t0 + 20000, cache: null });
  assert.deepEqual([r.presencia, r.presenciaEdadS], ["cache", 20]);
  assert.ok(r.tarjetas.some((x) => x.agente === "Merovingio"));
  _olvidarPresencia();
});

// ── r41 (Carlos, 12:48): «con Carlos · MBP16», Neo y Trinity con él en el MBP16, varios pulsos por agente ──
import { unirPulsos, maquinaCorta } from "./flota-trabajando-lib.mjs";
import { latidosOcultos } from "./functions/api/flota/trabajando.js";

// Captura de las 12:49: MBP16 activo (reposo 150 s, Firefox al frente), apps adjuntas; el pulso del MBP16 dice «sin señal».
const mbp16Activo = mbp16.map((e) => ({ ...e, idle: 150, cpu: 11 }));
const vel1249 = { porAgente: [
  { agente: "Neo", maquina: "MacBookAir16plata", motor: "claude", tokHoy: 641587, tokHora: 170778, tokUltimaHora: 200000, conCarlos: false, conCarlosMotivo: "Mac activo (reposo 14s, Grok Bot al frente) pero sin señal de este agente", ultimoEvento: "2026-10-10T10:49:00Z" },
  { agente: "Trinity", maquina: "MacBookPro16", motor: "codex", tokHoy: 1381712, tokHora: 0, conCarlos: false, conCarlosMotivo: "Mac activo (reposo 150s, Firefox al frente) pero sin señal de este agente" },
  { agente: "Neo", maquina: "MacBookPro16", motor: "claude", tokHoy: 0, tokHora: 0, conCarlos: false, conCarlosMotivo: "Mac activo (reposo 150s, Firefox al frente) pero sin señal de este agente" },
] };

test("maquinaCorta: MBP16, MBA16, MBP14, Mini; desconocida tal cual", () => {
  assert.deepEqual(["MacBook Pro 16", "MacBookPro16", "MacBookAir16plata", "MacBookProNegro14", "MacMini", "Spark"].map(maquinaCorta), ["MBP16", "MBP16", "MBA16", "MBP14", "Mini", "Spark"]);
});

test("caso de Carlos (12:49): Neo y Trinity con él en el MBP16 → «con Carlos · MBP16» los dos, no en el Air", () => {
  const t = tarjetas({ presencia: [...air(14), ...mbp16Activo], velocidad: vel1249, ahoraS: T });
  for (const n of ["Neo", "Trinity"]) {
    assert.equal(de(t, n).estado, "amarillo", n);
    assert.equal(de(t, n).conCarlosEn, "MBP16", n);
    assert.equal(de(t, n).maquina, "MacBook Pro 16", n);
  }
});

test("un Mac está en uso si su pulso dice «reposo Ns» < 5 min, aunque el vigilante no mida idle", () => {
  const sinIdle = mbp16.map((e) => ({ ...e, idle: 0, cpu: 0 }));
  const m = maquinasConCarlos({ presencia: sinIdle, velocidad: vel1249, ahoraS: T });
  assert.ok(m.has("macbookpro16"));
  assert.equal(maquinasConCarlos({ presencia: [], velocidad: { porAgente: [{ agente: "X", maquina: "MacMini", conCarlosMotivo: "Mac en reposo 1061 min" }] }, ahoraS: T }).size, 0);
});

test("unirPulsos: dos pulsos de Neo (Air y MBP16) no se pisan: manda el con Carlos, tokens sumados", () => {
  const u = unirPulsos([{ agente: "Neo", maquina: "MacBookPro16", tokHoy: 10, tokHora: 0, conCarlos: true }, { agente: "Neo", maquina: "MacBookAir16plata", tokHoy: 5, tokHora: 7 }]);
  assert.deepEqual([u.maquina, u.conCarlos, u.tokHoy, u.tokHora, u.maquinasPulso], ["MacBookPro16", true, 15, 7, ["MacBookPro16", "MacBookAir16plata"]]);
  const t = tarjetas({ presencia: [], velocidad: { porAgente: [{ agente: "Neo", maquina: "MacBookPro16", tokHoy: 10, tokHora: 0, conCarlos: true, conCarlosMotivo: "x" }, { agente: "Neo", maquina: "MacBookAir16plata", tokHoy: 5, tokHora: 0 }] }, ahoraS: T });
  assert.deepEqual([de(t, "Neo").estado, de(t, "Neo").conCarlosEn, de(t, "Neo").tokHoy], ["amarillo", "MBP16", 15]);
});

test("latidosOcultos: el latido de Merovingio@Air (guardado, oculto por el vigilante del Air) se recupera; lo que el vigilante declara, no", () => {
  const d = { now: T, presence: [snap({ persona: "Neo", machine: "MacBookAir16plata" })], control_machines: [{ machine: "MacBookAir16plata", slots: [{ persona: "Morfeo" }, { persona: "Neo" }] }] };
  const todo = { presence: [
    { persona: "Merovingio", machine: "MacBookAir16plata", runtime: "Grok", host: "cli", mode: "pasivo", updated: T - 25 },
    { persona: "Morfeo", machine: "MacBookAir16plata", runtime: "Claude", host: "cli", updated: T - 10 },
    { persona: "Neo", machine: "MacBookAir16plata", updated: T - 10 },
    { persona: "Merovingio", machine: "MacMini", updated: T - 795325 },
  ] };
  const x = latidosOcultos(d, todo, T);
  assert.deepEqual(x.map((e) => e.persona + "@" + e.machine), ["Merovingio@MacBookAir16plata"]);
  assert.equal(x[0].source, "heartbeat");
  const t = tarjetas({ presencia: [...d.presence, ...x, { persona: "Merovingio", machine: "GrokBotBox", source: "heartbeat", runtime: "DeepAgents", updated: T - 55 }], ahoraS: T });
  assert.equal(de(t, "Merovingio").maquinas.includes("MacBookAir16plata"), true);
});
