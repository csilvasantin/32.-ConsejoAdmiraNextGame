// r27 (Carlos, 11-10-2026 12:16): visor de los 4 deepagents de pago en el Samsung Fold (admira.live/visor).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tapar, normalizarPane, fundir, vista, CONF_DEFECTO, sha256 } from "./visor-lib.mjs";
import { onRequestPost, onRequestGet, _olvidarUbicacion } from "./functions/api/visor/pane.js";
const sinYokup = async () => new Response("no", { status: 503 }); // los tests no salen a la red
import { onRequestPost as llavePost } from "./functions/api/visor/llave.js";

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
  const g = await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env, fetchImpl: sinYokup });
  assert.equal(g.status, 200);
  const d = await g.json();
  assert.equal(d.fichas[0].estado, "vivo");
  assert.ok(d.fichas[0].lineas[0].includes("hola") && !d.fichas[0].lineas[0].includes("sk-ant-abc"), "el servidor también tapa");
  await llavePost({ request: new Request("https://www.admira.live/api/visor/llave", { method: "POST", headers: { "X-Council-Token": "maquina-123" }, body: JSON.stringify({ accion: "revocar" }) }), env });
  assert.equal((await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env, fetchImpl: sinYokup })).status, 401, "revocada");
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
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/visor/pane?g=6", { headers: { "X-Visor-Key": "v".repeat(43) } }), env, fetchImpl: sinYokup })).json();
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

// ── r42 (tras #5681): la ficha sigue a la máquina donde trabaja el agente; varias sesiones; terminal sin panel = aviso ──
import { ubicar, terminalesDe, normMaq } from "./visor-lib.mjs";
const T0 = 1_791_724_600_000, S0 = T0 / 1000;
const docDe = (maquina, agentes, ts = T0 - 2000) => ({ maquina, ts, conf: CONF_DEFECTO, agentes, vivas: Object.keys(agentes) });
const ag = (agente, linea) => ({ lineas: agente === "vivo" ? [linea] : [], ancho: 120, alto: 30, cmd: "codex", sub: "", rotulo: [], cambio: T0 - 5000, agente, mision: linea, linea, viejo: "", modelo: "Codex CLI", mac: "MacBook Pro 16", arte: [], desde: T0 - 9000 });
const pres = (persona, machine, extra = {}) => ({ persona, machine, host: "cli", session_id: persona.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), updated: S0 - 5, declared_updated: 0, source: "process_snapshot", ...extra });
const PRES = [
  pres("Trinity", "MacBookProNegro14", { task: "Admira Visor #5655", declared_updated: S0 - 150 }),
  pres("Trinity", "MacBook Pro 16", { task: "Hoy132 · Paso1", declared_updated: S0 - 10 }),
  { persona: "Trinity", machine: "MacBook Pro 16", host: "app", session_id: "desktop:codex", updated: S0 - 5 },
  pres("Neo", "MacBook Pro 16", { task: "#5664", declared_updated: S0 - 20 }),
  pres("Trinity", "GrokBotBox", { updated: S0 - 5641 }),
];
const ENC = { trinity: [{ id: 5670, status: "in_progress", target_persona: "Trinity", target_machine: "macbookpronegro14" }] };

test("r42 terminales: solo CLI (tmux), sin desktop:, latido ≤ 15 min, una por máquina", () => {
  const t = terminalesDe(PRES, "trinity", "trinity", S0);
  assert.deepEqual(t.map((x) => x.maquina).sort(), ["macbookpro16", "macbookpronegro14"]);
  assert.equal(normMaq("MacBook Pro 16"), normMaq("macbook-pro-16"));
});

test("r42 la ficha sigue al encargo in_progress (Trinity en el MBP14), no a la conf (MBP16)", () => {
  const docs = [docDe("macbook-pro-16", { trinity: ag("vivo", "Hoy132"), neo: ag("vivo", "neo") }), docDe("macbookpronegro14", { trinity: ag("vivo", "#5670 coste real") })];
  const u = ubicar(CONF_DEFECTO[2], docs, T0, { presencia: PRES, encargos: ENC });
  assert.equal(u.maquina, "macbookpronegro14"); assert.match(u.motivo, /5670/);
  const f = vista(docs, T0, { presencia: PRES, encargos: ENC }).fichas[2];
  assert.equal(f.host, "macbookpronegro14"); assert.equal(f.mac, "MacBook Pro 14"); assert.equal(f.hostConf, "macbook-pro-16");
  assert.deepEqual(f.lineas, ["#5670 coste real"]);
  assert.deepEqual(f.otras.map((x) => x.nombre), ["MacBook Pro 16"], "la otra sesión se ve");
  assert.ok(f.avisos.some((a) => /también tiene sesión en MacBook Pro 16/.test(a)));
  assert.equal(vista(docs, T0, { presencia: PRES, encargos: ENC }).fichas[0].host, "macbook-pro-16", "Neo sigue donde está");
});

test("r42 sin encargo manda el latido con tarea más reciente; sin presencia, el panel en misión", () => {
  const docs = [docDe("macbook-pro-16", { trinity: ag("idle", "") }), docDe("macbookpronegro14", { trinity: ag("vivo", "trabajando") })];
  assert.equal(ubicar(CONF_DEFECTO[2], docs, T0, { presencia: PRES }).maquina, "macbookpro16");
  assert.equal(ubicar(CONF_DEFECTO[2], docs, T0, {}).maquina, "macbookpronegro14", "sin Yokup: el que está en misión");
  assert.equal(ubicar(CONF_DEFECTO[2], [docs[0]], T0, {}).maquina, "macbookpro16");
});

test("r42/r43 terminal que no publica → aviso; la ficha se queda en su máquina real y no toma el panel de otra", () => {
  const docs = [docDe("macbook-pro-16", { trinity: ag("vivo", "Hoy132"), neo: ag("vivo", "neo") })]; // el MBP14 no publica
  const v = vista(docs, T0, { presencia: PRES, encargos: ENC });
  const f = v.fichas[2];
  assert.equal(f.maquinaReal, "macbookpronegro14"); assert.equal(f.host, "macbookpronegro14", "r43: nunca el panel del MBP16");
  assert.equal(f.lineas, undefined); assert.equal(f.sinDatos, "sin datos de MacBook Pro 14 (no publica en el panel)");
  assert.deepEqual(f.otras.map((x) => x.nombre), ["MacBook Pro 16"], "la sesión del MBP16 se ve como otra");
  assert.match(f.avisos[0], /trabaja en MacBook Pro 14 .*no publica/);
  assert.ok(f.avisos.some((a) => /terminal en MacBook Pro 14 que no publica/.test(a)));
  assert.ok(v.avisos.some((a) => /Trinity tiene terminal en MacBook Pro 14/.test(a)), "aviso general");
  assert.equal(v.fichas[0].avisos.length, 0, "Neo sin avisos");
  // nadie publica a Trinity: ficha esperando en la máquina real, con aviso
  const solo = vista([docDe("macbook-pro-16", { neo: ag("vivo", "neo") })], T0, { presencia: PRES, encargos: ENC }).fichas[2];
  assert.equal(solo.estado, "esperando"); assert.equal(solo.maquinaReal, "macbookpronegro14"); assert.match(solo.sinDatos, /^sin datos de MacBook Pro 14/);
  assert.ok(solo.avisos.length >= 2);
});

test("r42 GET: lee presencia y bandeja (cacheadas) y no se cae si Yokup no contesta", async () => {
  _olvidarUbicacion();
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123", VISOR_VIEW_TOKEN: "v".repeat(43) };
  const post = (b) => onRequestPost({ request: req("POST", b, { "X-Council-Token": "maquina-123" }), env });
  await post({ maquina: "macbook-pro-16", agentes: { trinity: ag("vivo", "Hoy132") }, vivas: ["trinity"], conf: CONF_DEFECTO });
  const pedidas = [];
  const yokup = async (url) => {
    pedidas.push(String(url));
    if (String(url).includes("/presence")) return Response.json({ ok: true, now: Math.floor(Date.now() / 1000), presence: PRES.map((e) => ({ ...e, updated: Math.floor(Date.now() / 1000) - 5, declared_updated: e.declared_updated ? Math.floor(Date.now() / 1000) - (S0 - e.declared_updated) : 0 })) });
    if (String(url).includes("persona=Trinity")) return Response.json({ items: ENC.trinity });
    return Response.json({ items: [] });
  };
  const g = await (await onRequestGet({ request: req("GET", null, { "X-Visor-Key": "v".repeat(43) }), env, fetchImpl: yokup })).json();
  assert.equal(g.ubicacion, "presencia+encargos");
  const f = g.fichas.find((x) => x.sesion === "trinity");
  assert.equal(f.maquinaReal, "macbookpronegro14"); assert.ok(g.avisos.length > 0);
  const n = pedidas.length;
  await onRequestGet({ request: req("GET", null, { "X-Visor-Key": "v".repeat(43) }), env, fetchImpl: yokup });
  assert.equal(pedidas.length, n, "caché de 20 s: no vuelve a Yokup en cada refresco");
  _olvidarUbicacion();
  const g2 = await (await onRequestGet({ request: req("GET", null, { "X-Visor-Key": "v".repeat(43) }), env, fetchImpl: sinYokup })).json();
  assert.equal(g2.ok, true); assert.equal(g2.ubicacion, "solo paneles");
  assert.ok(!JSON.stringify(g).includes("maquina-123"), "el token nunca sale");
});

test("r42 el Mac de la conf sin la sesión (nosesion) no se cuenta como «otra sesión»", () => {
  const docs = [docDe("macbook-pro-16", { trinity: ag("nosesion", "") }), docDe("macbookpronegro14", { trinity: ag("vivo", "aquí") })];
  const f = vista(docs, T0, {}).fichas[2];
  assert.equal(f.host, "macbookpronegro14"); assert.deepEqual(f.otras, []); assert.deepEqual(f.avisos, []);
});

// ── r43 (#5697, Carlos: ni falsos positivos ni datos falsos) ──
// Caso real: la ficha de Trinity decía «Codex CLI · MacBook Pro 16 · Pendiente sin trabajar · #5689 in_progress»,
// con el #5689 en curso en el MBP14: máquina del conf, estado de otro sitio.
const ENC_5689 = { trinity: [{ id: 5689, status: "in_progress", target_persona: "Trinity", target_machine: "macbookpronegro14" }] };
const PEND_16 = () => ({ ...ag("pendiente", "pendiente: #5689 · in_progress · admira.live"), mision: "#5689 · in_progress · admira.live" });

test("r43 #5697: encargo in_progress en otra máquina → «trabajando en MBP14 · #5689», nunca «Pendiente sin trabajar»", () => {
  const docs = [docDe("macbook-pro-16", { trinity: PEND_16(), neo: ag("vivo", "neo") })]; // el MBP14 no publica y Yokup no lo ve
  const f = vista(docs, T0, { presencia: [], encargos: ENC_5689 }).fichas[2];
  assert.equal(f.host, "macbook-pro-16"); assert.equal(f.mac, "MacBook Pro 16"); assert.equal(f.estado, "vivo");
  assert.notEqual(f.etiqueta, "Pendiente sin trabajar"); assert.notEqual(f.agente, "pendiente");
  assert.equal(f.etiqueta, "trabajando en MBP14 · #5689"); assert.equal(f.encargoFuera, "trabajando en MBP14 · #5689");
  assert.ok(!/#5689 · in_progress/.test(f.linea + f.mision), "el encargo del MBP14 no se pinta como del MBP16");
  assert.equal(f.linea, "#5689 en curso en MBP14");
});

test("r43 #5697: con la terminal del MBP14 en Yokup, la ficha va al MBP14 y, sin su panel, dice «sin datos», no el estado del MBP16", () => {
  const presencia = [pres("Trinity", "MacBookProNegro14", { task: "#5689", declared_updated: S0 - 60 })];
  const viejo14 = docDe("macbookpronegro14", { trinity: ag("pendiente", "pendiente: #5689") }, T0 - 30 * 60000); // último panel del MBP14: 14:46
  for (const [docs, texto] of [
    [[docDe("macbook-pro-16", { trinity: PEND_16() })], "sin datos de MacBook Pro 14 (no publica en el panel)"],
    [[docDe("macbook-pro-16", { trinity: PEND_16() }), viejo14], "sin datos de MacBook Pro 14 desde 14:46"],
  ]) {
    const f = vista(docs, T0, { presencia, encargos: ENC_5689 }).fichas[2];
    assert.equal(f.maquinaReal, "macbookpronegro14"); assert.equal(f.maquinaNombre, "MacBook Pro 14");
    assert.equal(f.sinDatos, texto);
    for (const k of ["agente", "etiqueta", "mision", "linea", "lineas", "mac"]) assert.equal(f[k], undefined, k + " no viene de otra fuente");
    assert.equal(f.encargo, 5689); assert.equal(f.encargoFuera, undefined, "el encargo es de su misma máquina");
  }
});

test("r43 #5697: sin latido fresco de la sesión en su máquina (panel parado) tampoco hay «Pendiente sin trabajar»", () => {
  const f = vista([docDe("macbook-pro-16", { trinity: PEND_16() }, T0 - 10 * 60000)], T0, {}).fichas[2];
  assert.equal(f.estado, "congelado"); assert.equal(f.etiqueta, undefined); assert.equal(f.agente, undefined);
  assert.equal(f.sinDatos, "sin datos de MacBook Pro 16 desde 15:06");
});
