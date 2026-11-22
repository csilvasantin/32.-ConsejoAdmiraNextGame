// r246 (Carlos, 22-11-2026 09:57): «tenemos que diferenciar entre Conectados y Trabajando … el punto es el que marca la
// actividad real, y tiene que estar amarillo sino se sabe o rojo sino estan haciendo nada».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aplicarConectadoActividad, aplicarConsejerosAbiertos, DEEPAGENTS, TOKENS_RECIENTES_S, CPU_APP_TRABAJANDO, CPU_CLI_TRABAJANDO } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-22T09:00:00Z") / 1000);
const iso = (s) => new Date(s * 1000).toISOString();
const app = (maq, a, o = {}) => ({ tipo: "app", maquina: maq, corta: maq === "MacMini" ? "Mini" : maq, app: a, enUso: false, fuente: "pulso", ...o });
const cli = (maq, rt, o = {}) => ({ tipo: "cli", maquina: maq, corta: maq, runtime: rt, sesion: "s", fuente: "latido", ...o });
// Producción 22-11 10:01 (Madrid): el falso verde de esta mañana.
const ts = () => [
  { agente: "Trinity", estado: "verde", ultimoToken: iso(T - 71), pulsoMedible: true, superficies: [app("MacStudio", "Codex", { cpu: 63 })] },
  { agente: "Neo", estado: "gris", pulsoMedible: true, superficies: [app("MacStudio", "Claude", { cpu: 5.8 })] },
  { agente: "Oráculo", estado: "gris", pulsoMedible: false, superficies: [app("MacMini", "Codex", { fuente: "latido", cpu: null })] },
  { agente: "Morfeo", estado: "gris", pulsoMedible: false, superficies: [app("MacMini", "Claude", { fuente: "latido", cpu: null })] },
  { agente: "Smith", estado: "gris", pulsoMedible: false, superficies: [] },
  { agente: "Niobe", estado: "gris", superficies: [cli("MacMini", "OpenCode", { cpu: 0.4 })] },
  { agente: "Merovingio", estado: "gris", superficies: [cli("GrokBotBox", "GrokBot CLI", { cpu: 22 })] },
  { agente: "Jobs", estado: "gris", consejero: true, grupo: "consejeros", superficies: [], actividad: { ts: T - 7200, fuente: "mensaje de consejero" } },
  { agente: "Wozniak", estado: "gris", consejero: true, grupo: "consejeros", superficies: [], actividad: { ts: T - 240, fuente: "encargo cerrado" } },
  { agente: "Musk", estado: "gris", consejero: true, grupo: "consejeros", superficies: [] },
];
const apps = [{ maquina: "MacStudio", cuenta: "csilva@admira.com", haceS: 37, fuente: "app" }, { maquina: "MacBookPro16", cuenta: null, haceS: 37, fuente: "desconocida" }];
const corre = () => { const l = ts(); aplicarConsejerosAbiertos(l, apps, T); aplicarConectadoActividad(l, { apps, ahoraS: T }); return Object.fromEntries(l.map((t) => [t.agente, t])); };

test("r246: constantes y DeepAgents", () => {
  assert.deepEqual(DEEPAGENTS, ["Trinity", "Neo", "Oráculo", "Morfeo"]);
  assert.equal(TOKENS_RECIENTES_S, 300); assert.equal(CPU_APP_TRABAJANDO, 40); assert.equal(CPU_CLI_TRABAJANDO, 10);
});

test("r246: CONECTADO (borde) = app lanzada; ACTIVIDAD (punto) = solo actividad real", () => {
  const r = corre();
  const v = (n) => [r[n].conectado, r[n].actividadLuz];
  assert.deepEqual(v("Trinity"), [true, "verde"]); assert.match(r.Trinity.actividadPorque, /^tokens propios hace 71 s/);
  assert.deepEqual(v("Neo"), [true, "rojo"]); assert.match(r.Neo.actividadPorque, /conectado sin tokens recientes ni CPU/); // el falso verde de r235
  assert.deepEqual(v("Oráculo"), [true, "amarillo"]); assert.match(r["Oráculo"].actividadPorque, /el pulso de Mini no da tokens ni CPU/);
  assert.deepEqual(v("Morfeo"), [true, "amarillo"]);
  assert.deepEqual(v("Smith"), [false, "rojo"]); assert.match(r.Smith.actividadPorque, /CLI no lanzada/);
  assert.deepEqual(v("Niobe"), [true, "rojo"]);
  assert.deepEqual(v("Merovingio"), [true, "verde"]); assert.match(r.Merovingio.actividadPorque, /GrokBot CLI al 22 % de CPU/);
  assert.match(r.Merovingio.conectadoPor, /^GrokBot CLI en GrokBotBox$/);
  assert.match(r.Trinity.conectadoPor, /^Desktop App Codex en MacStudio/);
});

test("r246: consejeros — Grok Bot de su cuenta = conectado; compartido sin actividad = amarillo; su actividad < 10 min = verde", () => {
  const r = corre();
  assert.deepEqual([r.Jobs.conectado, r.Jobs.actividadLuz], [true, "amarillo"]);
  assert.match(r.Jobs.actividadPorque, /Grok Bot compartido \(cuenta Leyendas\)/);
  assert.notEqual(r.Jobs.estado, "verde", "abierto ya no pinta verde");
  assert.deepEqual([r.Wozniak.conectado, r.Wozniak.actividadLuz], [true, "verde"]);
  assert.match(r.Wozniak.actividadPorque, /encargo cerrado hace 4 min/);
  // Musk: la app del MBP16 tiene cuenta desconocida → no conectado, sin dato
  assert.deepEqual([r.Musk.conectado, r.Musk.actividadLuz], [false, "amarillo"]);
  const solo = [{ agente: "Huang", estado: "gris", consejero: true, superficies: [] }];
  aplicarConectadoActividad(solo, { apps: [], ahoraS: T });
  assert.deepEqual([solo[0].conectado, solo[0].actividadLuz], [false, "rojo"]);
});

test("r246: tokens viejos (> 5 min) o app abierta a menos del 40 % no dan verde; app > 40 % sí", () => {
  const l = [
    { agente: "Neo", ultimoToken: iso(T - 400), pulsoMedible: true, superficies: [app("MacStudio", "Claude", { cpu: 39 })] },
    { agente: "Trinity", pulsoMedible: true, superficies: [app("MacStudio", "Codex", { cpu: 55 })] },
  ];
  aplicarConectadoActividad(l, { ahoraS: T });
  assert.equal(l[0].actividadLuz, "rojo"); assert.match(l[0].actividadPorque, /último token hace 7 min/);
  assert.equal(l[1].actividadLuz, "verde"); assert.match(l[1].actividadPorque, /app Codex al 55 % de CPU en MacStudio/);
});

function cargaFront() {
  const ctx = { document: { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null, addEventListener() {} }, location: { search: "", href: "https://www.admira.live/consumos" }, navigator: { language: "es" }, localStorage: { getItem: () => null }, setInterval() {}, fetch: async () => ({ ok: false }), CustomEvent: class {}, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {}; ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8"), ctx);
  return ctx.ConsumosTrabajando;
}

test("r246: cliente — cabecera «N conectados · X trabajando · Y parados · Z sin dato», chip con borde y punto separados", () => {
  const ct = cargaFront();
  const r = corre();
  const l = Object.values(r).map((t) => ({ ...t, grupo: t.consejero ? "consejeros" : "agentes" }));
  const g = JSON.parse(JSON.stringify(ct.grupos(l)));
  assert.deepEqual({ ...g[0].n }, { conectados: 6, trabajando: 2, parados: 3, sinDato: 2, conCarlos: 0, total: 7 });
  assert.deepEqual({ ...g[1].n }, { conectados: 2, trabajando: 1, parados: 0, sinDato: 2, conCarlos: 0, total: 3 });
  const txt = ct.cifras(g[0].n).replace(/<[^>]+>/g, "");
  assert.equal(txt, "6 conectados · 2 trabajando · 3 parados · 2 sin dato");
  const html = ct.chipsDe(g[0].tarjetas);
  assert.match(html, /tr-chipa tr-con tr-luz-rojo" title="Neo · Conectado: Desktop App Claude en MacStudio · Actividad: parado — conectado sin tokens/);
  assert.match(html, /tr-chipa tr-descon tr-luz-rojo" title="Smith/);
  assert.match(html, /conectado · 250k\/h · trabajando/); // Trinity: suelo 250k por conectado, punto verde por tokens
  // «con Carlos» ya no es color: icono 👤 en el chip y texto en el porqué
  const cc = ct.chipsDe([{ agente: "Trinity", conectado: true, actividadLuz: "verde", actividadPorque: "tokens propios hace 1 min", conCarlosEn: "MacStudio", superficies: [] }]);
  assert.match(cc, /tr-luz-verde/); assert.match(cc, /👤/); assert.match(cc, /Carlos está en MacStudio/);
});

test("r246: legenda, CSS y versiones", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /borde verde = CONECTADO/); assert.match(js, /el PUNTO es la actividad real/); assert.match(js, /green border = CONNECTED/);
  assert.doesNotMatch(js, /c\.estado = 'verde'; c\.abiertoDA/, "r235 deshecho");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /\.tr-chipa\.tr-con\{/); assert.match(html, /\.tr-chipa\.tr-luz-amarillo i/);
  assert.match(html, /deepagents-estado\.js\?v=20261122-r246-actividad/);
  const idx = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(idx, /barra-agentes\.js\?v=20261122-r248-trabajos/); assert.match(idx, /consejo-rotulo\.js\?v=20261122-r246-actividad/);
  const api = readFileSync(new URL("./functions/api/flota/trabajando.js", import.meta.url), "utf8");
  assert.ok(api.indexOf("aplicarConectadoActividad(ts") > api.indexOf("aplicarMedicionCiega(ts)"));
});
