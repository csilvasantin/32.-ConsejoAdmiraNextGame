// r28 (GrokBotBox, 09-10-2026): «Trabajando ahora» en /consumos — estado de cada tarjeta.
import test from "node:test";
import assert from "node:assert/strict";
import { estadoTrabajo, latidoTrabajando, canonico, tarjetas, CONSEJEROS_GROK } from "./flota-trabajando-lib.mjs";

const T = 1791552812;
const hb = (o) => ({ source: "heartbeat", mode: "pasivo", cpu: 0, updated: T - 10, ...o });

test("estado: con Carlos (amarillo) > trabajando (verde) > parado/sin latido (gris)", () => {
  assert.equal(estadoTrabajo({ tokHora: 9e6, conCarlos: true, ahoraS: T }).estado, "amarillo");
  assert.equal(estadoTrabajo({ tokHora: 1, ahoraS: T }).estado, "verde");
  assert.equal(estadoTrabajo({ tokHora: 0, latidos: [hb({ mode: "trabajando" })], ahoraS: T }).estado, "verde");
  assert.equal(estadoTrabajo({ latidos: [hb({ trabajando: true })], ahoraS: T }).estado, "verde");
  assert.equal(estadoTrabajo({ latidos: [hb({ mode: "trabajando", updated: T - 121 })], ahoraS: T }).estado, "gris", "latido «trabajando» de hace > 2 min ya no vale");
  assert.deepEqual(estadoTrabajo({ latidos: [hb({})], ahoraS: T }), { estado: "gris", motivo: "parado" });
  assert.deepEqual(estadoTrabajo({ ahoraS: T }), { estado: "gris", motivo: "sin latido" });
});

test("process_snapshot: CPU DEL PROCESO > 5 y declarado hace < 2 min = trabajando (r40: la cpu de la máquina no vale)", () => {
  assert.equal(latidoTrabajando({ source: "process_snapshot", proc_cpu: 24, declared_updated: T - 20, updated: T - 500 }, T), true);
  assert.equal(latidoTrabajando({ source: "process_snapshot", cpu: 24, cpu_scope: "process", declared_updated: T - 20 }, T), true);
  assert.equal(latidoTrabajando({ source: "process_snapshot", proc_cpu: 3, declared_updated: T - 20 }, T), false);
  assert.equal(latidoTrabajando({ source: "process_snapshot", proc_cpu: 40, declared_updated: T - 600 }, T), false);
  assert.equal(latidoTrabajando({ source: "process_snapshot", cpu: 27, idle: 61946, declared_updated: T - 20 }, T), false, "cpu de toda la máquina");
});

test("nombres canónicos: NeoMBP16 → Neo, Oraculo → Oráculo, TrinityMacBookPro16 → Trinity, Steve Jobs → Jobs", () => {
  assert.equal(canonico("NeoMBP16"), "Neo");
  assert.equal(canonico("Oraculo"), "Oráculo");
  assert.equal(canonico("TrinityMacBookPro16"), "Trinity");
  assert.equal(canonico("Steve Jobs"), "Jobs");
  assert.equal(canonico("Cypher"), "Cypher");
});

test("tarjetas: dedupe por agente (manda el latido más fresco), siempre los 6 consejeros, orden verde → amarillo → gris", () => {
  const presencia = [
    hb({ persona: "NeoMBP14", machine: "MacBookProNegro14", updated: T - 3000, task: "viejo" }),
    hb({ persona: "NeoMBP16", machine: "MacBook Pro 16", updated: T - 30, task: "encargo #5451 MetaHuman", project: "admiranext" }),
    hb({ persona: "Jobs", machine: "GrokBot", mode: "trabajando", updated: T - 20, task: "FLT-101758 a/b/c" }),
  ];
  const velocidad = { porAgente: [{ agente: "Morfeo", tokHora: 0, tokHoy: 5, conCarlos: true, maquina: "MacMini" }, { agente: "Trinity", tokHora: 3e6, tokHoy: 7e6, maquina: "MacBookPro16", proyectoAhora: "admira.studio" }] };
  const t = tarjetas({ presencia, velocidad, ahoraS: T });
  const n = t.map((x) => x.agente);
  for (const c of CONSEJEROS_GROK) assert.ok(n.includes(c), c);
  assert.equal(n.filter((x) => x === "Neo").length, 1);
  const neo = t.find((x) => x.agente === "Neo");
  assert.equal(neo.maquina, "MacBook Pro 16");
  assert.equal(neo.encargo, "#5451");
  assert.deepEqual(t.slice(0, 3).map((x) => [x.agente, x.estado]), [["Trinity", "verde"], ["Jobs", "verde"], ["Morfeo", "amarillo"]]);
  assert.equal(t.find((x) => x.agente === "Jobs").encargo, "FLT-101758");
  assert.equal(t.find((x) => x.agente === "Lucas").motivo, "sin latido");
  assert.ok(t.find((x) => x.agente === "Musk").retrato.img.includes("coetaneos"));
});

test("/api/flota/trabajando: une la presencia; sin pulso ni Yokup sigue enseñando a los consejeros", async () => {
  const { construir } = await import("./functions/api/flota/trabajando.js");
  const ahora = Math.floor(Date.now() / 1000);
  const fetchImpl = async (url) => String(url).includes("presence")
    ? new Response(JSON.stringify({ ok: true, presence: [{ persona: "Jobs", machine: "GrokBot", runtime: "Grok", model: "Grok Heavy", source: "heartbeat", mode: "trabajando", updated: ahora - 5, task: "FLT-101758 a/b/c" }] }))
    : new Response("no", { status: 503 });
  const r = await construir({ env: {}, fetchImpl, cache: null });
  assert.equal(r.presencia, "ok");
  assert.equal(r.tarjetas[0].agente, "Jobs");
  assert.equal(r.tarjetas[0].estado, "verde");
  assert.equal(r.tarjetas.filter((t) => CONSEJEROS_GROK.includes(t.agente)).length, 6);
});

test("gris: «hace X» y máquina de la fuente más fresca (latido, proceso o pulso)", () => {
  const presencia = [
    hb({ persona: "NeoMBP14", machine: "MacBookProNegro14", updated: T - 3000 }),
    { persona: "Neo", machine: "MacBook Pro 16", source: "process_snapshot", cpu: 1, updated: T - 900, declared_updated: T - 400 },
  ];
  const velocidad = { porAgente: [{ agente: "Neo", tokHora: 0, tokHoy: 9, maquina: "MacMini", ultimoEvento: new Date((T - 200) * 1000).toISOString() }] };
  let neo = tarjetas({ presencia, velocidad, ahoraS: T }).find((x) => x.agente === "Neo");
  assert.deepEqual([neo.estado, neo.maquina, neo.haceS, neo.fuente], ["gris", "MacMini", 200, "pulso"]);
  velocidad.porAgente[0].ultimoEvento = new Date((T - 5000) * 1000).toISOString();
  neo = tarjetas({ presencia, velocidad, ahoraS: T }).find((x) => x.agente === "Neo");
  assert.deepEqual([neo.maquina, neo.haceS, neo.fuente], ["MacBook Pro 16", 400, "process_snapshot"]);
});

test("retratos: Musk y Huang con recorte de cara propio; Oráculo con avatar de iniciales PNG", () => {
  const t = tarjetas({ presencia: [], velocidad: { porAgente: [{ agente: "Oráculo", tokHora: 0, tokHoy: 1 }] }, ahoraS: T });
  assert.deepEqual(t.find((x) => x.agente === "Musk").retrato.cara, { l: 9, t: 44, w: 9, h: 16 });
  assert.equal(t.find((x) => x.agente === "Oráculo").retrato.img, "/avatars/oraculo.png");
});

test("r39 · un pulso con retraso (Cursor) nunca pone en verde: los consejeros Grok solo por su latido en vivo", async () => {
  const { tarjetas } = await import("./flota-trabajando-lib.mjs");
  const ahoraS = 1760000000;
  const velocidad = { porAgente: [{ agente: "Grok Bot (Consejo)", conRetraso: true, tokHora: 380000, tokHoy: 1000000, maquina: "GrokBotBox", ultimoEvento: new Date((ahoraS - 9000) * 1000).toISOString() }] };
  const t = tarjetas({ presencia: [], velocidad, ahoraS }).find((x) => x.agente === "Merovingio");
  assert.ok(t, "sale la tarjeta");
  assert.notEqual(t.estado, "verde");
});
