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
  const g = await onRequestGet({ request: new Request("https://www.admira.live/api/visor/pane?g=4", { headers: { "X-Visor-Key": lr.llave } }), env });
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
test("r33: ?g=6 añade Smith y Merovingio con su estado; vista() sin grupo sigue en 4", async () => {
  const A = 3_000_000;
  const mbp = fundir(null, normalizarPane({ maquina: "macbook-pro-16", conf: CONF_DEFECTO, vivas: ["smith"], agentes: { smith: { estado: "idle", mision: "#5600 · done · x", modelo: "Grok CLI", mac: "MacBook Pro 16" } } }, A).pane);
  const caja = fundir(null, normalizarPane({ maquina: "grokbotbox", vivas: ["merovingio"], agentes: { merovingio: { estado: "vivo", lineas: ["• Working (2s)"] } } }, A).pane);
  assert.equal(vista([mbp, caja], A + 1000).fichas.length, 4);
  const v6 = vista([mbp, caja], A + 1000, { grupo: 6 }).fichas;
  // #5803: el mosaico de 6 va agrupado por modo (nube · híbrido · edge)
  assert.deepEqual(v6.map((f) => f.sesion), ["smith", "merovingio", "oraculo", "morfeo", "neo", "trinity"]);
  assert.equal(v6[0].agente, "idle"); assert.equal(v6[1].agente, "vivo"); assert.equal(v6[1].host, "grokbotbox");
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123", VISOR_VIEW_TOKEN: "v".repeat(43) };
  await onRequestPost({ request: req("POST", { maquina: "grokbotbox", vivas: ["merovingio"], agentes: { merovingio: { estado: "login", lineas: ["https://claude.com/cai/oauth/authorize?client_id=1"] } } }, { "X-Council-Token": "maquina-123" }), env });
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/visor/pane?g=6", { headers: { "X-Visor-Key": "v".repeat(43) } }), env })).json();
  assert.equal(g.grupo, 6); assert.equal(g.fichas.length, 6);
  assert.equal(g.fichas[1].agente, "login"); assert.deepEqual(g.fichas[1].lineas, []);
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
  assert.equal(etiquetaModo({ modo: "hibrido" }), "GrokBot → sin terminal publicada");
  assert.equal(etiquetaModo({ modo: "hibrido", terminalMaquina: "MBP14 Negro" }), "GrokBot → MBP14 Negro");
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

test("#5803/#5801/#5802 mosaico de 6 por modo: edge sin falsos positivos, desktop app, CONTROL CARLOS, sin datos", () => {
  const A = 5_000_000, S = A / 1000;
  // Falso positivo clásico: el Mac del conf publica Neo «pendiente» y Trinity «idle» en el MBP16.
  const fp = fundir(null, normalizarPane({ maquina: "macbook-pro-16", conf: CONF_DEFECTO, vivas: ["neo", "trinity"], agentes: {
    neo: { estado: "pendiente", mision: "#1 · x", lineas: ["x"] }, trinity: { estado: "idle", modelo: "Codex CLI", mac: "MacBook Pro 16" } } }, A).pane);
  const vivos = [{ agente: "Neo", maquinas: ["MBP14"], latido: S, modeloTxt: "Claude desktop app" }, { agente: "Smith", maquinas: ["grokbotbox"], latido: S, modeloTxt: "grok-4.6" }];
  const v = vista([fp], A + 1000, { grupo: 6, vivos, ultimos: { Trinity: S - 7200 } });
  assert.deepEqual(v.fichas.map((f) => f.modo), ["nube", "nube", "hibrido", "hibrido", "edge", "edge"]);
  const neo = v.fichas.find((f) => f.sesion === "neo"), tri = v.fichas.find((f) => f.sesion === "trinity");
  for (const f of [neo, tri]) {
    assert.equal(f.agente, undefined); assert.equal(f.etiqueta, undefined); assert.equal(f.lineas, undefined);
    assert.equal(f.control, "CONTROL CARLOS"); assert.equal(f.noMolestar, true); assert.equal(f.desktop, true);
  }
  assert.equal(neo.etiquetaModo, "EDGE · MBP14 · Carlos al mando · NO MOLESTAR · admira.tv");
  assert.equal(neo.estado, "desktop"); assert.equal(neo.latidoMaquina, "MBP14");
  const neo16 = vista([], A, { grupo: 6, vivos: [{ agente: "Neo", maquinas: ["MacBook Pro 16"], latido: S, modeloTxt: "Fable 5" }] }).fichas.find((x) => x.sesion === "neo");
  assert.equal(neo16.latidoMaquina, null); assert.equal(neo16.latidoIgnorado, "MacBook Pro 16"); assert.equal(neo16.latidoModelo, null);
  assert.equal(tri.etiquetaModo, "EDGE · MBA16 · Carlos al mando · NO MOLESTAR · vigilante de incidencias de admira.app");
  assert.equal(tri.estado, "sin_datos"); assert.match(tri.sinDatos, /^sin datos de MBA16 desde \d\d:\d\d$/);
  const mer = v.fichas.find((f) => f.sesion === "merovingio");
  assert.equal(mer.estado, "sin_datos"); assert.match(mer.sinDatos, /^sin datos de GrokBotBox/);
  assert.equal(v.fichas.find((f) => f.sesion === "morfeo").etiquetaModo, "GrokBot → sin terminal publicada");
  assert.equal(v.fichas.find((f) => f.sesion === "smith").etiquetaModo, "GrokBot");
});

test("#5804 estado OK / KO / ESPERA CARLOS sale del latido y del encargo reales", async () => {
  const { estadoVisor, rotuloEstado, vista, normalizarEspera } = await import("./visor-lib.mjs");
  const ahoraS = 1791800000;
  assert.deepEqual(estadoVisor({ nombre: "Neo", vivo: { modo: "autonomo", tarea: "Fetch Telegram" }, ahoraS }).valor, "OK");
  assert.equal(estadoVisor({ nombre: "Trinity", vivo: { modo: "pasivo", tarea: "" }, ahoraS }).valor, "KO");
  const sin = estadoVisor({ nombre: "Oráculo", vivo: undefined, ahoraS, ultimoS: ahoraS - 600 });
  assert.equal(sin.valor, "KO"); assert.match(sin.motivo, /^sin latido desde \d\d:\d\d$/);
  const esp = estadoVisor({ nombre: "Morfeo", vivo: { modo: "trabajando", tarea: "x" }, espera: { Morfeo: "reiniciar tmux de Morfeo" }, ahoraS });
  assert.equal(esp.valor, "ESPERA CARLOS"); assert.equal(esp.motivo, "reiniciar tmux de Morfeo");
  assert.equal(rotuloEstado("OK").length, 3); assert.equal(rotuloEstado("ESPERA CARLOS").length, 6);
  assert.deepEqual(normalizarEspera({ espera: { smith: "poner UBICACION_KEY_PARTE", nadie: "x", Neo: "" } }), { Smith: "poner UBICACION_KEY_PARTE" });
  const v = vista([], 1791800000000, { grupo: 6, vivos: [{ agente: "Smith", maquinas: ["GrokBotBox"], latido: ahoraS, modo: "trabajando", tarea: "x" }], ultimos: {}, espera: { Merovingio: "secreto UBICACION_KEY_PARTE" } });
  assert.equal(v.fichas.length, 6);
  assert.ok(v.fichas.every((f) => ["OK", "KO", "ESPERA CARLOS"].includes(f.estadoVisor) && f.estadoAscii.length >= 3));
  assert.equal(v.fichas.find((f) => f.sesion === "smith").estadoVisor, "OK");
  assert.equal(v.fichas.find((f) => f.sesion === "merovingio").estadoVisor, "ESPERA CARLOS");
  assert.equal(v.fichas.find((f) => f.sesion === "neo").estadoVisor, "KO");
});

test("#5788 híbrido: la máquina de Morfeo/Oráculo sale del pane o del latido reales (MBP14 Negro), nunca fija", async () => {
  const { maquinaCorta } = await import("./visor-lib.mjs");
  assert.equal(maquinaCorta("macbookpronegro14"), "MBP14 Negro");
  assert.equal(maquinaCorta("MacBookAir16plata"), "MBA16 Plata");
  assert.equal(maquinaCorta("macbook-pro-16"), "MBP16");
  const A = 7_000_000, S = A / 1000;
  const conf = CONF_DEFECTO.map((c) => (c.sesion === "morfeo" || c.sesion === "oraculo" ? { ...c, host: "macbookpronegro14" } : c));
  const d = fundir(null, normalizarPane({ maquina: "macbookpronegro14", conf, vivas: ["morfeo"], agentes: {
    morfeo: { estado: "vivo", lineas: ["hola"], modelo: "Claude Code", mac: "MBP14 Negro" } } }, A).pane);
  const vivos = [{ agente: "Morfeo", maquinas: ["MacBookProNegro14"], latido: S }, { agente: "Oraculo", maquinas: ["MacBookProNegro14"], latido: S }];
  const v6 = vista([d], A + 1000, { grupo: 6, vivos });
  const mor = v6.fichas.find((f) => f.sesion === "morfeo"), ora = v6.fichas.find((f) => f.sesion === "oraculo");
  assert.equal(mor.estado, "vivo"); assert.deepEqual(mor.lineas, ["hola"]);
  assert.equal(mor.etiquetaModo, "GrokBot → MBP14 Negro");
  assert.equal(ora.etiquetaModo, "GrokBot → MBP14 Negro"); // sin pane: la del latido
  const v4 = vista([d], A + 1000, { vivos });
  const m4 = v4.fichas.find((f) => f.sesion === "morfeo");
  assert.equal(m4.host, "macbookpronegro14"); assert.equal(m4.mac, "MBP14 Negro"); assert.equal(m4.estado, "vivo");
});
