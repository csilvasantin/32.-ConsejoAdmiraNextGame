// r27 (Carlos, 11-10-2026 12:16): visor de los 4 deepagents de pago en el Samsung Fold (admira.live/visor).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tapar, normalizarPane, fundir, vista, etiquetaModo, CONF_DEFECTO, sha256 } from "./visor-lib.mjs";
import { onRequestPost, onRequestGet } from "./functions/api/visor/pane.js";
import { onRequestPost as llavePost } from "./functions/api/visor/llave.js";

// #5794: pane.js lee la presencia real; en test, sin red: presencia vacía (los tests viejos siguen con la conf).
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, ...r) => String(u).includes("/api/presence") ? new Response(JSON.stringify({ presence: [] })) : fetchReal(u, ...r);

test("tapa secretos y deja el resto", () => {
  const s = tapar("export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv ghp_abcdefghijklmnopqrstuvwxyz12 Authorization: Bearer abc.def.ghijklmnopqrst password: hunter22");
  for (const malo of ["sk-proj-abc", "ghp_abc", "abc.def.ghij", "hunter22"]) assert.ok(!s.includes(malo), malo);
  assert.equal(tapar("✻ Thinking… (12s · ↓ 1.2k tokens) · git log --author Carlos"), "✻ Thinking… (12s · ↓ 1.2k tokens) · git log --author Carlos");
  assert.ok(!tapar("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawABCDEF").includes("AAHdq"));
});

test("la lista es la de la cuadratura del Mac (mismo orden, mismas sesiones)", () => {
  assert.deepEqual(CONF_DEFECTO.map((c) => c.sesion), ["neo", "morfeo", "trinity", "oraculo"]);
  const v = vista([], 0);
  assert.deepEqual(v.fichas.map((f) => f.estado), ["esperando", "esperando", "esperando", "esperando"]);
});

test("fundir: solo lo que cambió + sesiones muertas fuera; vista vivo/congelado/esperando", () => {
  const A = 1_000_000;
  const p1 = normalizarPane({ maquina: "MacBook-Pro-16", agentes: { neo: { lineas: ["a"] }, trinity: { lineas: ["t"] } }, vivas: ["neo", "trinity"] }, A).pane;
  const d1 = fundir(null, p1);
  const p2 = normalizarPane({ maquina: "macbook-pro-16", completo: false, agentes: { neo: { lineas: ["b"] } }, vivas: ["neo"] }, A + 3000).pane;
  const d2 = fundir(d1, p2);
  assert.deepEqual(Object.keys(d2.agentes), ["neo"]); assert.deepEqual(d2.agentes.neo.lineas, ["b"]);
  const v = vista([d2], A + 5000);
  assert.equal(v.fichas[0].estado, "vivo"); assert.equal(v.fichas[2].estado, "esperando"); assert.equal(v.fichas[3].estado, "esperando");
  assert.equal(vista([d2], A + 300000).fichas[0].estado, "congelado");
});

function kvMem() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
const req = (method, body, h = {}) => new Request("https://www.admira.live/api/visor/pane", { method, headers: { "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined });

test("POST con token de máquina; GET exige llave del visor (no es público) y la revocación es inmediata", async () => {
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123" };
  assert.equal((await onRequestPost({ request: req("POST", { maquina: "macbook-pro-16", agentes: {} }), env })).status, 401);
  const r = await onRequestPost({ request: req("POST", { maquina: "macbook-pro-16", agentes: { neo: { lineas: ["\u001b[32mhola\u001b[0m sk-ant-abcdefghijklmnopqrstu"] } }, vivas: ["neo"], conf: CONF_DEFECTO }, { "X-Council-Token": "maquina-123" }), env });
  assert.equal(r.status, 200);
  assert.equal((await onRequestGet({ request: req("GET"), env })).status, 401, "sin llave");
  assert.equal((await onRequestGet({ request: req("GET", null, { "X-Visor-Key": "x".repeat(43) }), env })).status, 401, "llave inventada");
  const lr = await (await llavePost({ request: new Request("https://www.admira.live/api/visor/llave", { method: "POST", headers: { "X-Council-Token": "maquina-123" }, body: JSON.stringify({ accion: "nueva" }) }), env })).json();
  assert.ok(lr.llave.length >= 40);
  assert.ok(!env.RECORTE_KV.m.get("visor:v1:llaves").includes(lr.llave), "en KV solo el hash");
  assert.ok(env.RECORTE_KV.m.get("visor:v1:llaves").includes(await sha256(lr.llave)));
  const g = await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env });
  assert.equal(g.status, 200);
  const d = await g.json();
  assert.equal(d.fichas[0].estado, "vivo");
  assert.ok(d.fichas[0].lineas[0].includes("hola") && !d.fichas[0].lineas[0].includes("sk-ant-abc"), "el servidor también tapa");
  await llavePost({ request: new Request("https://www.admira.live/api/visor/llave", { method: "POST", headers: { "X-Council-Token": "maquina-123" }, body: JSON.stringify({ accion: "revocar" }) }), env });
  assert.equal((await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env })).status, 401, "revocada");
});

test("la página no lleva llaves ni tokens y manda la llave solo por cabecera", () => {
  const h = readFileSync(new URL("./visor/index.html", import.meta.url), "utf8");
  assert.ok(h.includes('"X-Visor-Key": llave'));
  assert.ok(h.includes("noindex"));
  assert.ok(!/\?k=/.test(h));
});

// r31 (Carlos 11-10-2026 13:13 «¿por qué no coinciden?»): estado único Mac ↔ visor
test("r31: el estado del Mac viaja tal cual (idle / login / nosesion) y fuera de vivo no viaja la terminal", () => {
  const A = 2_000_000;
  const p = normalizarPane({ maquina: "macbook-pro-16", vivas: ["neo", "morfeo", "trinity"], agentes: {
    neo: { estado: "idle", lineas: ["no debería verse"], mision: "#5645 · done · Insignia PAGO/GRATIS", modelo: "Claude Code", mac: "MacBook Pro 16", arte: [" _ _ "] },
    morfeo: { estado: "login", lineas: ["https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c"], mision: "#5647 · ack · admira.store" },
    trinity: { estado: "vivo", lineas: ["• Working (3s · esc to interrupt)"], mision: "#5648 · in_progress · admira.biz" },
  } }, A).pane;
  const v = vista([fundir(null, p)], A + 1000);
  const [neo, morfeo, trinity, oraculo] = v.fichas;
  assert.equal(neo.agente, "idle"); assert.equal(neo.etiqueta, "Idle"); assert.deepEqual(neo.lineas, []); assert.match(neo.mision, /#5645/);
  assert.equal(morfeo.agente, "login"); assert.equal(morfeo.etiqueta, "Login pendiente"); assert.deepEqual(morfeo.lineas, []);
  assert.equal(trinity.agente, "vivo"); assert.equal(trinity.lineas.length, 1);
  assert.equal(oraculo.estado, "esperando"); assert.equal(oraculo.agente, undefined);
});

test("r31: el enlace OAuth del login nunca sale, ni partido en varias líneas", () => {
  for (const l of ["https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a", "type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth", "user%3Aplugins&code_challenge=rmos4BPtdyuCuP&code_challenge_method=S256&stat", "e=QYGTzTNQJnudxAUjgIKTSf8a7ZSsfeKYitj_TToukJ0"])
    assert.equal(tapar(l), "[enlace de login oculto]", l);
  assert.equal(tapar("   Paste code here if prompted >"), "   Paste code here if prompted >");
  assert.equal(tapar("PR https://github.com/csilvasantin/32.-ConsejoAdmiraNextGame/pull/169 fusionado"), "PR https://github.com/csilvasantin/32.-ConsejoAdmiraNextGame/pull/169 fusionado");
});

test("r31: un publicador viejo (sin estado) sigue viéndose como antes", () => {
  const p = normalizarPane({ maquina: "macmini", vivas: ["oraculo"], agentes: { oraculo: { lineas: ["hola"] } } }, 5000).pane;
  const f = vista([fundir(null, p)], 6000).fichas[3];
  assert.equal(f.estado, "vivo"); assert.equal(f.agente, undefined); assert.deepEqual(f.lineas, ["hola"]);
});

test("r31: la página pinta Idle / Login pendiente / Sin sesión como el Mac", () => {
  const h = readFileSync(new URL("./visor/index.html", import.meta.url), "utf8");
  for (const s of ["f.agente", "última misión: ", "ficha-idle", "Login pendiente"]) assert.ok(h.includes(s), s);
});

// r33 (Carlos 11-10-2026 13:30 «/interface 6»): 3x2 = los 4 de pago + Smith y Merovingio
test("r33: ?g=6 añade Smith (MBP16) y Merovingio (caja de GrokBot) con su estado; sin g siguen siendo 4", async () => {
  const A = 3_000_000;
  const mbp = fundir(null, normalizarPane({ maquina: "macbook-pro-16", conf: CONF_DEFECTO, vivas: ["smith"], agentes: { smith: { estado: "idle", mision: "#5600 · done · x", modelo: "Grok CLI", mac: "MacBook Pro 16" } } }, A).pane);
  const caja = fundir(null, normalizarPane({ maquina: "grokbotbox", vivas: ["merovingio"], agentes: { merovingio: { estado: "vivo", lineas: ["• Working (2s)"] } } }, A).pane);
  assert.equal(vista([mbp, caja], A + 1000).fichas.length, 4);
  const v6 = vista([mbp, caja], A + 1000, { grupo: 6 }).fichas;
  assert.deepEqual(v6.map((f) => f.sesion), ["neo", "morfeo", "trinity", "oraculo", "smith", "merovingio"]);
  assert.equal(v6[4].agente, "idle"); assert.equal(v6[5].agente, "vivo"); assert.equal(v6[5].host, "grokbotbox");
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123", VISOR_VIEW_TOKEN: "v".repeat(43) };
  await onRequestPost({ request: req("POST", { maquina: "grokbotbox", vivas: ["merovingio"], agentes: { merovingio: { estado: "login", lineas: ["https://claude.com/cai/oauth/authorize?client_id=1"] } } }, { "X-Council-Token": "maquina-123" }), env });
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/visor/pane?g=6", { headers: { "X-Visor-Key": "v".repeat(43) } }), env })).json();
  assert.equal(g.grupo, 6); assert.equal(g.fichas.length, 6);
  assert.equal(g.fichas[5].agente, "login"); assert.deepEqual(g.fichas[5].lineas, []);
});

// r33b (Carlos 13:43): última misión = la más reciente; terminal quieta + encargo abierto = «Pendiente sin trabajar»; viejo tenue
test("r33b: pendiente sin trabajar y «abierto desde» viajan tal cual", () => {
  const p = normalizarPane({ maquina: "macbook-pro-16", vivas: ["neo", "trinity"], agentes: {
    neo: { estado: "idle", mision: "#5645 · done · insignia", linea: "última misión: #5645 · done · insignia", viejo: "#5493 abierto desde 10/10 09:19" },
    trinity: { estado: "pendiente", mision: "#5620 · in_progress · biz", linea: "pendiente: #5620 · in_progress · biz", lineas: ["x"] } } }, 9000).pane;
  const [neo, , trinity] = vista([fundir(null, p)], 9500).fichas;
  assert.equal(neo.linea, "última misión: #5645 · done · insignia"); assert.equal(neo.viejo, "#5493 abierto desde 10/10 09:19");
  assert.equal(trinity.agente, "pendiente"); assert.equal(trinity.etiqueta, "Pendiente sin trabajar"); assert.deepEqual(trinity.lineas, []);
});

test("r34: un toque = pantalla completa (sin doble toque), con history para Esc / atrás de Android", () => {
  const h = readFileSync(new URL("./visor/index.html", import.meta.url), "utf8");
  for (const s of ["pointerup", "popstate", "pushState", "visorMosaico", '"Escape"', "> 10"]) assert.ok(h.includes(s), s);
  assert.ok(!h.includes("dblclick") && !h.includes("touchend"), "fuera el doble toque");
});

test("#5794 vista sigue a la máquina real del latido: varias máquinas, y terminal sin publicar avisa", () => {
  const A = 1_000_000;
  const mk = (maquina, sesion) => fundir(null, normalizarPane({ maquina, agentes: { [sesion]: { lineas: ["x"] } }, vivas: [sesion] }, A).pane);
  const docs = [mk("macmini", "neo"), mk("macbook-pro-16", "neo")];
  const v = vista(docs, A + 1000, { vivos: [
    { agente: "Neo", maquinas: ["macmini", "macbook-pro-16"], latido: 1 },
    { agente: "Morfeo", maquinas: ["macmini"], latido: 1 },
  ] });
  const neo = v.fichas.filter((f) => f.sesion === "neo").map((f) => f.host).sort();
  assert.deepEqual(neo, ["macbook-pro-16", "macmini"]);
  const morfeo = v.fichas.find((f) => f.sesion === "morfeo");
  assert.equal(morfeo.host, "macmini");
  assert.equal(morfeo.estado, "sin_publicar");
  assert.equal(v.avisos.length, 2);
  assert.deepEqual(vista(docs, A, {}).avisos, []);
});

test("#5794 etiquetas de modo: nube, híbrido, edge y sin terminal (nunca «parado»)", () => {
  const A = 1_000_000;
  assert.equal(etiquetaModo({ modo: "nube" }), "GrokBot");
  assert.equal(etiquetaModo({ modo: "hibrido" }), "GrokBot → MBP16");
  assert.equal(etiquetaModo({ modo: "edge", terminalMaquina: "MBA16" }), "MBA16");
  assert.equal(etiquetaModo({ modo: "sin_terminal", encargo: "5794", encargoEstado: "in_progress" }), "sin terminal, solo encargo · #5794 in_progress");
  assert.equal(etiquetaModo({}), null);
  const p = normalizarPane({ maquina: "macbook-pro-16", agentes: { trinity: { lineas: ["x"], modo_agente: "edge", terminal_maquina: "MBP14" } }, vivas: ["trinity"] }, A).pane;
  const f = vista([fundir(null, p)], A + 1000).fichas.find((x) => x.sesion === "trinity");
  assert.equal(f.etiquetaModo, "MBP14");
  const v = vista([], A, { vivos: [{ agente: "Neo", maquinas: ["mba16"], modo: "sin_terminal", encargo: "5801", encargoEstado: "in_progress" }] });
  const neo = v.fichas.find((x) => x.sesion === "neo");
  assert.equal(neo.estado, "sin_terminal");
  assert.equal(neo.etiquetaModo, "sin terminal, solo encargo · #5801 in_progress");
  assert.deepEqual(v.avisos, []);
});
