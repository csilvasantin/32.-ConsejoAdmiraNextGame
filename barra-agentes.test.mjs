// r41 barra de agentes (11-10-2026): «la barra inferior muestra, para cada agente, estado + encargos abiertos + % de
// tokens usados y hora de reinicio». Cuota real de cada cuenta (statusline de Claude Code / rate_limits de Codex)
// → pulso → /api/flota/trabajando → assets/barra-agentes.js. Sin dato fresco, nunca un número.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPulso, aplicarPulso, normalizarLimites, limitesDePulso, LIMITE_MAX_EDAD_MS, KEY_PREFIX, KEY_INDICE } from "./consumos-pulso-lib.mjs";
import { construir } from "./functions/api/flota/trabajando.js";

const T = 1791722400; // 11-10-2026 14:40 (Madrid)
const lim = (o) => ({ agente: "Neo", motor: "claude", ventanas: [{ ventana: "5h", pct: 34, reinicio: T + 3600 }, { ventana: "7d", pct: 12, reinicio: T + 86400 }], medido: T - 60, ...o });

test("normalizarLimites: valida, redondea y tira ventanas ya reiniciadas o absurdas", () => {
  const r = normalizarLimites([
    lim({ ventanas: [{ ventana: "5h", pct: 34.26, reinicio: T + 3600 }, { ventana: "7d", pct: 12, reinicio: T - 5 }] }),
    { agente: "Trinity", motor: "codex", ventanas: [{ ventana: "7d", pct: 140, reinicio: T + 99 }] },      // % imposible
    { agente: "Smith", motor: "grok", ventanas: [{ ventana: "5h", pct: 5, reinicio: T + 40 * 86400 }] },   // reinicio a > 31 días
    { agente: "", motor: "claude", ventanas: [] },
    { agente: "X", motor: "otro", ventanas: [{ ventana: "5h", pct: 1, reinicio: T + 9 }] },
  ], T);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].ventanas, [{ ventana: "5h", pct: 34.3, reinicio: T + 3600 }]);
  assert.equal(normalizarLimites("no", T), null);
});

test("el pulso guarda los límites aunque la máquina no tenga agentes de tokens propios", () => {
  const ahora = Math.floor(Date.now() / 1000);   // normalizarPulso valida contra el reloj real
  const n = normalizarPulso({ maquina: "MacBookPro16", agentes: [], limites: [lim({ medido: ahora - 60, ventanas: [{ ventana: "5h", pct: 34, reinicio: ahora + 3600 }] })] });
  assert.equal(n.ok, true);
  const { doc, guardar } = aplicarPulso(null, n.pulso, ahora * 1000);
  assert.equal(guardar, true);
  assert.equal(doc.limites.lista[0].agente, "Neo");
  assert.equal(doc.limites.ts, ahora * 1000);
});

test("limitesDePulso: manda la ventana más gastada; la medición más reciente por persona; nada caducado", () => {
  const ahora = T * 1000;
  const docs = [
    { maquina: "MacBookAir16plata", limites: { ts: ahora - 60000, lista: [lim({ agente: "Morfeo", medido: T - 3000, ventanas: [{ ventana: "5h", pct: 80, reinicio: T + 600 }] })] } },
    { maquina: "MacBookPro16", limites: { ts: ahora - 30000, lista: [
      lim(),
      lim({ agente: "Morfeo", medido: T - 30 }),                                                     // más reciente que la del Air
      { agente: "Oráculo", motor: "codex", ventanas: [{ ventana: "7d", pct: 3, reinicio: T - 1 }], medido: T - 10 }, // ya reiniciada
    ] } },
    { maquina: "MacMini", limites: { ts: ahora - LIMITE_MAX_EDAD_MS - 1, lista: [lim({ agente: "Trinity" })] } },      // pulso viejo
  ];
  const r = limitesDePulso(docs, ahora);
  const neo = r.find((x) => x.persona === "neo");
  assert.equal(neo.pct, 34);
  assert.equal(neo.ventana, "5h");
  assert.equal(neo.reinicio, T + 3600);
  assert.equal(neo.ventanas.length, 2);
  assert.equal(r.find((x) => x.persona === "morfeo").maquina, "MacBookPro16");
  assert.equal(r.find((x) => x.persona === "morfeo").pct, 34);
  assert.ok(!r.find((x) => x.persona === "oraculo"));
  assert.ok(!r.find((x) => x.persona === "trinity"));
});

test("/api/flota/trabajando: cada tarjeta lleva estado, encargos abiertos y cuota (o null si no hay dato)", async () => {
  const ahoraMs = Date.now(), ahora = Math.floor(ahoraMs / 1000);
  const doc = { maquina: "MacBookPro16", ultimoPulso: ahoraMs - 20000, agentes: {
    Neo: { motor: "claude", tokHoy: 1000, cacheHoy: 0, ultimoEvento: new Date(ahoraMs - 30000).toISOString(), ultimoPulso: ahoraMs - 20000, serie: [[ahora - 900, 0, 0], [ahora - 20, 1000, 0]] },
  }, limites: { ts: ahoraMs - 20000, lista: [lim({ medido: ahora - 20, ventanas: [{ ventana: "5h", pct: 34, reinicio: ahora + 3600 }, { ventana: "7d", pct: 12, reinicio: ahora + 86400 }] })] } };
  const kv = new Map([[KEY_INDICE, JSON.stringify(["MacBookPro16"])], [KEY_PREFIX + "MacBookPro16", JSON.stringify(doc)]]);
  const env = { CONSUMOS_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/api/presence")) return new Response(JSON.stringify({ ok: true, now: ahora, presence: [
      { persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude Code", source: "heartbeat", mode: "trabajando", updated: ahora - 5 },
      { persona: "Smith", machine: "MacBook Pro 16", runtime: "grok", source: "heartbeat", updated: ahora - 5 },
    ] }));
    if (u.includes("/api/public/inbox") && u.includes("persona=Neo")) return new Response(JSON.stringify({ items: [
      { target_persona: "Neo", status: "in_progress" }, { target_persona: "Neo", status: "pending" }, { target_persona: "Neo", status: "blocked" }, { target_persona: "Neo", status: "done" },
    ] }));
    if (u.includes("/api/public/inbox")) return new Response(JSON.stringify({ items: [] }));
    return new Response("no", { status: 503 });
  };
  const r = await construir({ env, fetchImpl, ahoraMs, cache: null });
  const neo = r.tarjetas.find((t) => t.agente === "Neo");
  assert.equal(neo.estado, "verde");
  assert.equal(neo.abiertos, 3);
  assert.equal(neo.bloqueados, 1);
  assert.equal(neo.limite.pct, 34);
  assert.equal(neo.limite.ventana, "5h");
  assert.equal(neo.limite.reinicio, new Date((ahora + 3600) * 1000).toISOString());
  assert.equal(neo.limite.ventanas.length, 2);
  const smith = r.tarjetas.find((t) => t.agente === "Smith");
  assert.equal(smith.limite, null);   // Grok CLI no informa de cuota: sin número
  assert.equal(smith.abiertos, 0);
});
