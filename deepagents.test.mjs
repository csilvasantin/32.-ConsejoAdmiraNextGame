import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lib from "./deepagents-lib.mjs";
import * as api from "./functions/api/deepagents/registro.js";
import { emitir, cookieDe } from "./functions/_puerta.js";

const FIRMA = "f".repeat(40);
const msg = (id, de, para, hora, extra = {}) => ({
  id, de, para, texto: `texto ${id}`, maquina: "MacBookAirAzul", hora, leido: false, leido_en: null, responde_a: null,
  de_tipo: lib.agente(de) ? "agente" : "consejero", para_tipo: lib.agente(para) ? "agente" : "consejero", ...extra,
});
const M1 = msg("cm1", "Neo", "Jobs", "2026-11-21T10:00:00.000Z");
const M2 = msg("cm2", "Jobs", "Neo", "2026-11-21T10:05:00.000Z", { responde_a: "cm1", maquina: "GrokBot", maquina_para: "MacBookAirAzul" });
const M3 = msg("cm3", "Musk", "Morfeo", "2026-10-30T09:00:00.000Z");
const ENTRE = msg("cm9", "Musk", "Jobs", "2026-11-21T11:00:00.000Z");

function kvFalso(inicial = {}) {
  const d = new Map(Object.entries(inicial));
  return { d, puts: 0, async get(k) { return d.has(k) ? d.get(k) : null; }, async put(k, v) { this.puts++; d.set(k, v); } };
}
/** Bandeja falsa: devuelve por ?con= lo que toque; registra las llamadas. */
function bandejaFalsa(mensajes, vistos = [], roto = false) {
  return async (u, i) => {
    vistos.push({ u: String(u), i });
    if (roto) return new Response("no", { status: 503 });
    const con = new URL(String(u)).searchParams.get("con");
    return new Response(JSON.stringify({ ok: true, mensajes: mensajes.filter((m) => m.de === con || m.para === con) }), { status: 200 });
  };
}
async function conPuerta(tipo, q = "") {
  const c = await emitir(FIRMA, tipo, "prueba");
  return new Request("https://www.admira.live/api/deepagents/registro" + q, { headers: { cookie: cookieDe(c.valor, c.maxAge).split(";")[0] } });
}


function cargaDA() {
  const ctx = {};
  new Function("globalThis", "module", readFileSync(new URL("./assets/deepagents-estado.js", import.meta.url), "utf8"))(ctx, undefined);
  return ctx.DeepAgentsEstado;
}

test("lib: agente canónico, pareja y supervisor", () => {
  assert.equal(lib.agente("oráculo"), "Oraculo");
  assert.equal(lib.agente("Jobs"), null);
  assert.deepEqual(lib.pareja(M2), { agente: "Neo", consejero: "Jobs", clave: "Neo↔Jobs" });
  assert.equal(lib.pareja(ENTRE), null);
  assert.equal(lib.SUPERVISOR.Neo, "Jobs");
  assert.equal(lib.SUPERVISOR.Cypher, "Huang");
});

test("lib: unir no duplica, no borra y solo actualiza el acuse", () => {
  const a = lib.unir([], [M2, M1, M1]);
  assert.equal(a.nuevos, 2);
  assert.deepEqual(a.lista.map((m) => m.id), ["cm1", "cm2"]);
  const b = lib.unir(a.lista, [{ ...M1, leido: true, leido_en: "2026-11-21T10:01:00.000Z", texto: "cambiado" }]);
  assert.equal(b.nuevos, 0); assert.equal(b.cambiados, 1);
  assert.equal(b.lista[0].leido, true); assert.equal(b.lista[0].texto, "texto cm1");
  // Lo que la bandeja ya recortó sigue en el archivo.
  assert.equal(lib.unir(b.lista, []).lista.length, 2);
  // Sin id o sin hora válida, fuera. Campos de más, fuera.
  assert.equal(lib.unir([], [{ de: "Neo" }, { id: "x", hora: "ayer" }]).lista.length, 0);
  assert.equal(lib.limpiar({ ...M1, secreto: "no" }).secreto, undefined);
});

test("lib: parejas cuenta por sentido y pendientes; filtrar por agente, consejero y texto", () => {
  const p = lib.parejas([M1, M2, M3]);
  assert.equal(p[0].agente, "Neo"); assert.equal(p[0].total, 2);
  assert.equal(p[0].del_agente, 1); assert.equal(p[0].del_consejero, 1); assert.equal(p[0].pendientes, 2);
  assert.equal(p[1].supervisor, "Musk");
  assert.equal(lib.filtrar([M1, M2, M3], { agente: "morfeo" }).length, 1);
  assert.equal(lib.filtrar([M1, M2, M3], { consejero: "Jobs", q: "CM2" }).length, 1);
  assert.equal(lib.filtrar([M1, M2, M3], { desde: "2026-11-01" }).length, 2);
});

test("api: sin sesión 401 y no toca la bandeja; el kiosco tampoco entra", async () => {
  const vistos = [];
  const sin = await api.onRequestGet({ request: new Request("https://www.admira.live/api/deepagents/registro"), env: { PUERTA_FIRMA: FIRMA }, fetchImpl: bandejaFalsa([M1], vistos) });
  assert.equal(sin.status, 401);
  const kiosco = await api.onRequestGet({ request: await conPuerta("kiosco"), env: { PUERTA_FIRMA: FIRMA }, fetchImpl: bandejaFalsa([M1], vistos) });
  assert.equal(kiosco.status, 401);
  assert.equal(vistos.length, 0);
});

test("api: con la puerta lee la bandeja, deja fuera consejero↔consejero y archiva por mes", async () => {
  const almacen = kvFalso(), vistos = [];
  const env = { PUERTA_FIRMA: FIRMA, RECORTE_KV: almacen, CONSEJERO_MENSAJES_TOKEN: "t".repeat(32) };
  const r = await api.onRequestGet({ request: await conPuerta("persona"), env, fetchImpl: bandejaFalsa([M1, M2, M3, ENTRE], vistos) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.lector, "persona");
  assert.deepEqual(d.mensajes.map((m) => m.id), ["cm2", "cm1", "cm3"]); // lo más reciente primero
  assert.equal(d.total_registro, 3);
  assert.equal(d.parejas.length, 2);
  assert.deepEqual(d.archivo.meses, ["2026-10", "2026-11"]);
  assert.equal(d.archivo.nuevos_en_esta_lectura, 3);
  assert.equal(JSON.parse(almacen.d.get(lib.claveMes("2026-11"))).length, 2);
  const w = vistos.find((v) => v.u.includes("con=Neo"));
  assert.ok(w.u.startsWith("https://mcp.admira.live/consejero/mensajes?"));
  assert.equal(w.i.headers["x-mensajes-token"], "t".repeat(32));
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("api: lo archivado sobrevive a que la bandeja lo recorte o se caiga; sin cambios no reescribe", async () => {
  const almacen = kvFalso();
  const env = { PUERTA_FIRMA: FIRMA, RECORTE_KV: almacen };
  await api.onRequestGet({ request: await conPuerta("agente"), env, fetchImpl: bandejaFalsa([M1, M2, M3]) });
  const escrituras = almacen.puts;
  // La bandeja ya solo conserva M2 (ahora leído).
  const r2 = await api.onRequestGet({ request: await conPuerta("agente"), env, fetchImpl: bandejaFalsa([{ ...M2, leido: true, leido_en: "2026-11-21T10:06:00.000Z" }]) });
  const d2 = await r2.json();
  assert.equal(d2.total_registro, 3);
  assert.equal(d2.mensajes.find((m) => m.id === "cm2").leido, true);
  assert.equal(almacen.puts, escrituras + 1);
  // Bandeja caída: se sirve el archivo, se avisa y no se escribe nada.
  const r3 = await api.onRequestGet({ request: await conPuerta("agente"), env, fetchImpl: bandejaFalsa([], [], true) });
  const d3 = await r3.json();
  assert.equal(d3.bandeja.ok, false); assert.equal(d3.total_registro, 3);
  assert.equal(almacen.puts, escrituras + 1);
});

test("api: filtros y validación; sin KV sirve lo vivo", async () => {
  const env = { PUERTA_FIRMA: FIRMA };
  const mal = await api.onRequestGet({ request: await conPuerta("persona", "?agente=Nadie"), env, fetchImpl: bandejaFalsa([M1]) });
  assert.equal(mal.status, 400);
  const r = await api.onRequestGet({ request: await conPuerta("persona", "?agente=Neo&limite=1"), env, fetchImpl: bandejaFalsa([M1, M2, M3]) });
  const d = await r.json();
  assert.equal(d.archivo.almacen, "ninguno");
  assert.equal(d.total, 2); assert.equal(d.mensajes.length, 1); assert.equal(d.mensajes[0].id, "cm2");
});

test("página: va tras la verja, llama al API y no pinta HTML de los mensajes", () => {
  const html = readFileSync(new URL("./deepagents/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  assert.ok(html.includes("/auth-gate.js"));
  assert.ok(html.includes("/deepagents/deepagents.js"));
  assert.ok(js.includes("/api/deepagents/registro"));
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js));
});

test("página: lo primero son los cuatro deepagents fijos, sin rótulos de motor ni «flota leída»", () => {
  const html = readFileSync(new URL("./deepagents/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="ahora"') > 0 && html.indexOf('id="ahora"') < html.indexOf('id="cifras"'));
  assert.ok(!html.includes("<h2>Ahora</h2>") && !html.includes('id="ahora-hora"'));
  assert.ok(!js.includes("flota leída") && !js.includes('motor: "Claude"'));
  assert.ok(js.includes("/api/flota/trabajando") && js.includes("window.DeepAgentsEstado"));
  const mod = readFileSync(new URL("./assets/deepagents-estado.js", import.meta.url), "utf8");
  // Leyendas → MacStudio, Coetáneos → MacMini; la máquina principal va por defecto.
  assert.ok(mod.includes('{ agente: "Trinity", maquina: "MacStudio", proyecto: "admira.studio", lado: "izquierda" }'));
  assert.ok(mod.includes('{ agente: "Neo", maquina: "MacStudio", proyecto: "admira.live", lado: "derecha" }'));
  assert.ok(/agente: "Oraculo", maquina: "MacMini", proyecto: "admira.tv"/.test(mod) && /agente: "Morfeo", maquina: "MacMini"/.test(mod));
  assert.ok(mod.indexOf('agente: "Trinity"') < mod.indexOf('agente: "Neo"') && mod.indexOf('agente: "Neo"') < mod.indexOf('agente: "Oraculo"'));
  // Desplegable solo con más de un equipo; luz verde/rojo/amarillo; la pastilla abre la captura en vivo.
  assert.ok(js.includes("maqs.length > 1") && js.includes('el("select", "ag-maq")'));
  assert.ok(js.includes('verde: "trabajando", rojo: "parado", amarillo: "sin dato"')); // r246: abierto = borde; punto = actividad real
  assert.ok(js.includes('"/control/?rc="') && js.includes('"&ver=1"') && js.includes('"&lado="') && !js.includes('"&pantalla="'));
  assert.ok(js.includes("Sin tarea declarada"));
});

test("menú: DeepAgents y Consumo llevan el menú de la plataforma, y la sección se llama DeepAgents", () => {
  const lee = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  for (const f of ["./deepagents/index.html", "./comunicaciones.html", "./consumos.html", "./consumos-proyectos.html"]) {
    const h = lee(f);
    assert.ok(/<body[^>]*data-yk-zone="app"/.test(h), f + " sin zona app");
    assert.ok(h.includes("/yk-frame.js"), f + " sin marco");
  }
  const marco = lee("./yk-frame.js");
  // Barra única (21-11-2026): DeepAgents va justo ANTES de Consumo.
  const iDA = marco.search(/\["DEEPAGENTS",\s+"\/deepagents"/), iCO = marco.search(/\["CONSUMO",\s+"\/consumos"/);
  assert.ok(iDA > 0 && iCO > iDA, "DeepAgents antes de Consumo en APP_NAV");
  assert.ok(lee("./admira-bar.js").includes("https://www.admira.live/deepagents"));
  const home = lee("./index.html");
  assert.ok(!home.includes("💬 Comunicaciones"));
  assert.equal((home.match(/🤖 DeepAgents<\/a>/g) || []).length, 2);
  assert.ok(lee("./deepagents/index.html").includes("<h1>DeepAgents</h1>"));
});

test("r230: la pastilla enseña el proyecto real (foco/latido) y el de por defecto solo como respaldo marcado", () => {
  const { proyectoActual, nombreProy } = cargaDA();
  const neo = { proyecto: "admira.live" };
  assert.deepEqual(proyectoActual({ foco: { proyecto: "admira.store", fuente: "ahora", defecto: false }, proyecto: "admira.store" }, neo), { k: "admira.store", defecto: false, fuente: "latido / pulso de ahora" });
  assert.equal(proyectoActual({ foco: { proyecto: "https://www.admira.store/admira-xp", fuente: "agente", defecto: false } }, neo).k, "admira.store");
  assert.deepEqual(proyectoActual({ foco: null, proyecto: "otros" }, neo), { k: "admira.live", defecto: true, fuente: "por defecto" });
  assert.equal(proyectoActual({ foco: { proyecto: "admira.tv", fuente: "reparto", defecto: false }, proyecto: null }, neo).defecto, true);
  assert.equal(proyectoActual({ foco: null, proyecto: null }, { proyecto: "" }), null);
  assert.equal(nombreProy("admira.store"), "Admira.Store");
  assert.equal(nombreProy("admira.live"), "Admira.live");
  assert.equal(nombreProy("admira.studio"), "Admira.Studio");
  assert.equal(nombreProy("admira.tv"), "Admira.tv");
});

test("r230: /control elige el monitor por posición (etiqueta del equipo o geometría), nunca adivina", () => {
  const html = readFileSync(new URL("./control/index.html", import.meta.url), "utf8");
  const ini = html.indexOf("function rcIndicePorLado("), fin = html.indexOf("let _rcDeepDone=false;");
  const f = new Function(html.slice(ini, fin) + "return rcIndicePorLado;")();
  // Como lo lista el MacStudio de Carlos: el índice no sigue el orden físico.
  const studio = [
    { indice: 0, nombre: "Monitor 2 · centro 5120x2880" },
    { indice: 1, nombre: "Monitor 3 · derecha 1440x2560" },
    { indice: 2, nombre: "Monitor 1 · izquierda 1440x2560" },
  ];
  assert.equal(f(studio, "derecha"), 1);
  assert.equal(f(studio, "izquierda"), 2);
  assert.equal(f(studio, "centro"), 0);
  const geo = [{ indice: 0, nombre: "Principal", x: 0, w: 5120 }, { indice: 1, nombre: "Pantalla 2", x: 5120, w: 1440 }, { indice: 2, nombre: "Pantalla 3", x: -1440, w: 1440 }];
  assert.equal(f(geo, "derecha"), 1);
  assert.equal(f(geo, "izquierda"), 2);
  assert.equal(f([{ indice: 0, nombre: "Principal · 1920x1080" }, { indice: 1, nombre: "Pantalla 2 · 1920x1080" }], "derecha"), null);
  assert.ok(html.includes("q.get('lado')"));
});

test("r231: borde = abierto en la máquina, punto = actividad; GitHub firma la actividad de Trinity", async () => {
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("./deepagents/deepagents.css", import.meta.url), "utf8");
  assert.ok(js.includes('"ag ab-" + ab.estado + " act-" + l.luz'));
  assert.ok(/\.ag\.ab-verde\{border-top-color:var\(--good\)\}/.test(css) && /\.act-rojo \.ag-led\{/.test(css));
  assert.ok(!/\.ag\.(verde|rojo|amarillo)\{border-top/.test(css), "el borde ya no usa el color de actividad");
  assert.ok(js.includes("/api/deepagents/actividad"));
  const { actividadDeEventos } = await import("./deepagents-actividad-lib.mjs");
  const ev = [
    { type: "PullRequestEvent", created_at: "2026-11-21T19:19:55Z", repo: { name: "csilvasantin/admira-studio" }, payload: { action: "merged", pull_request: { number: 168, head: { ref: "trinity/content-title-es-en-20261121" } } } },
    { type: "PullRequestEvent", created_at: "2026-11-21T19:08:07Z", repo: { name: "csilvasantin/admira-tv" }, payload: { action: "closed", pull_request: { merged: true, number: 221, head: { ref: "trinity/content-title-es-en-20261121" } } } },
    { type: "PullRequestEvent", created_at: "2026-11-21T19:11:03Z", repo: { name: "csilvasantin/admira-store" }, payload: { action: "opened", pull_request: { number: 274, head: { ref: "neo/suite-cinco-soluciones-2" } } } },
    { type: "PushEvent", created_at: "2026-11-21T19:30:00Z", repo: { name: "csilvasantin/x" }, payload: { ref: "refs/heads/main" } },
    { type: "PushEvent", created_at: "2026-11-21T19:31:00Z", repo: { name: "csilvasantin/x" }, payload: { ref: "refs/heads/woz/algo" } },
  ];
  const a = actividadDeEventos(ev);
  assert.deepEqual(Object.keys(a).sort(), ["Neo", "Trinity"]);
  assert.equal(a.Trinity.repo, "admira-studio"); assert.equal(a.Trinity.accion, "merged");
  assert.equal(a.Neo.repo, "admira-store");
});

test("r232: si el servidor no llega a GitHub, el navegador lee los eventos públicos y los interpreta igual que la lib", async () => {
  const mod = readFileSync(new URL("./assets/deepagents-estado.js", import.meta.url), "utf8");
  assert.ok(mod.includes("https://api.github.com/users/csilvasantin/events/public") && mod.includes("function leerActividad("));
  const nav = cargaDA().actividadDeEventos;
  const { actividadDeEventos } = await import("./deepagents-actividad-lib.mjs");
  const ev = [
    { type: "PullRequestEvent", created_at: "2026-11-21T19:19:55Z", repo: { name: "csilvasantin/admira-studio" }, payload: { action: "merged", pull_request: { number: 168, head: { ref: "trinity/x" } } } },
    { type: "PushEvent", created_at: "2026-11-21T19:31:00Z", repo: { name: "csilvasantin/admira-store" }, payload: { ref: "refs/heads/neo/y" } },
    { type: "CreateEvent", created_at: "2026-11-21T19:32:00Z", repo: { name: "csilvasantin/z" }, payload: { ref_type: "branch", ref: "morfeo/z" } },
    { type: "PushEvent", created_at: "2026-11-21T19:33:00Z", repo: { name: "csilvasantin/z" }, payload: { ref: "refs/heads/main" } },
  ];
  assert.deepEqual(nav(ev), actividadDeEventos(ev));
});

test("r234: Consumo y DeepAgents cuentan con el mismo módulo; Oráculo admira.tv por defecto", () => {
  const D = cargaDA();
  const ts = [
    { agente: "Neo", estado: "verde", maquina: "MacStudio", foco: { proyecto: "admira.store", fuente: "ahora", defecto: false }, superficies: [{ tipo: "app", maquina: "MacStudio", app: "Claude", enUso: true, fuente: "pulso" }] },
    { agente: "Trinity", estado: "rojo", maquina: "MacStudio", superficies: [{ tipo: "app", maquina: "MacStudio", app: "Codex", enUso: false, fuente: "pulso" }] },
    { agente: "Oráculo", estado: "rojo", maquina: "MacMini", superficies: [{ tipo: "app", maquina: "MacMini", app: "Codex", enUso: false, fuente: "pulso" }] },
    { agente: "Morfeo", estado: "rojo", maquina: "MacMini", haceS: 30000, superficies: [] },
  ];
  const r = D.resumen(ts, { Trinity: { ts: Date.now() - 5 * 60000, accion: "merged", repo: "admira-studio", rama: "trinity/x" } });
  assert.deepEqual(r.map((a) => [a.visible, a.abierto.estado, a.actividad.luz]), [["Trinity", "verde", "verde"], ["Neo", "verde", "verde"], ["Oráculo", "verde", "amarillo"], ["Morfeo", "rojo", "rojo"]]); // r246: abierto sin actividad = sin dato
  const c = D.contadores(r);
  assert.equal(c.agentesTrabajando + "/" + c.agentesAbiertos, "2/3");
  assert.deepEqual(c.proyectos.map((p) => p.nombre), ["Admira.Studio", "Admira.Store", "Admira.tv"]);
  assert.equal(c.proyectosActivos + "/" + c.proyectosTotal, "2/3"); // r246: Oráculo abierto sin actividad
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("/assets/deepagents-estado.js") > 0 && html.indexOf("/assets/deepagents-estado.js") < html.indexOf("/assets/consumos-velocimetro.js"));
});

test("r240: el desplegable de cada DeepAgent ofrece siempre los 4 pilares; sin latido se marca; Claude compartido no se finge", () => {
  const D = cargaDA();
  const morfeo = { agente: "Morfeo", maquina: "MacMini", maquinas: ["MacMini", "MacBookAirRosa"], superficies: [{ tipo: "app", maquina: "MacMini", app: "Claude", fuente: "pulso" }] };
  const neo = { agente: "Neo", maquina: "MacStudio", maquinas: ["MacStudio", "MacBook Pro 16"], superficies: [
    { tipo: "app", maquina: "MacStudio", app: "Claude", fuente: "pulso" },
    { tipo: "app", maquina: "MacBook Pro 16", app: "Claude", enUso: false, fuente: "pulso" },
  ] };
  const trinity = { agente: "Trinity", maquina: "MacStudio", superficies: [
    { tipo: "cli", maquina: "MacBookPro16", runtime: "Codex CLI", sesion: "trinity", fuente: "pulso" },
    { tipo: "app", maquina: "MacStudio", app: "Codex", fuente: "pulso" },
  ] };
  const maqs = D.maquinasDe(morfeo, "MacMini");
  assert.deepEqual(maqs.slice(0, 4), ["MacMini", "MacStudio", "MacBookPro16", "MacBookProNegro14"]);
  assert.ok(maqs.includes("MacBookAirRosa"));
  assert.equal(maqs.filter((m) => D.claveLista(m) === "MacBookPro16" || m === "MacBook Pro 16").length, 1);
  assert.equal(D.conLatidoEn(morfeo, "MacMini"), true);
  assert.equal(D.conLatidoEn(morfeo, "MacBookAirRosa"), true);
  assert.equal(D.conLatidoEn(morfeo, "MacBookPro16"), false);
  assert.equal(D.conLatidoEn(morfeo, "MacBookProNegro14"), false);
  const ts = [morfeo, neo, trinity];
  // Morfeo en su MacMini: Claude propio en el pulso → abierto.
  assert.equal(D.abiertoEn(morfeo, "MacMini", ts).estado, "verde");
  // Claude en el MBP16 lo firma el pulso como Neo: no se distingue si es Morfeo → amarillo, no rojo ni verde.
  const amb = D.abiertoEn(morfeo, "MacBookPro16", ts);
  assert.equal(amb.estado, "amarillo");
  assert.match(amb.porque, /Claude/);
  assert.match(amb.porque, /Neo/);
  assert.match(amb.porque, /no se distingue/);
  // Pulso vivo en el MBP16 (CLI de Trinity) pero sin Claude de nadie → cerrado de verdad.
  const sinClaude = [morfeo, { ...neo, superficies: [{ tipo: "app", maquina: "MacStudio", app: "Claude", fuente: "pulso" }] }, trinity];
  assert.equal(D.abiertoEn(morfeo, "MacBookPro16", sinClaude).estado, "rojo");
  // Sin pulso de ese Mac → amarillo (p. ej. MBP14).
  assert.equal(D.abiertoEn(morfeo, "MacBookProNegro14", ts).estado, "amarillo");
  // Si el pulso atribuye Claude a Morfeo en el MBP16, abierto.
  const propio = { ...morfeo, superficies: morfeo.superficies.concat([{ tipo: "app", maquina: "MacBookPro16", app: "Claude", fuente: "pulso" }]) };
  assert.equal(D.abiertoEn(propio, "MacBook Pro 16", [propio, neo, trinity]).estado, "verde");
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  assert.ok(js.includes("sin latido") && js.includes("conLatidoEn"));
  const html = readFileSync(new URL("./deepagents/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("r246-actividad"));
});

test("r233: cerrar/arrancar app: lista cerrada en el relay y en admira.live, foto = botón, cerrar pide confirmación", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { deepagentAppCommand, COMANDOS } = require("./fleet-control/deepagent-app.js");
  assert.deepEqual(Object.keys(COMANDOS).sort(), ["abrir:claude", "abrir:codex", "cerrar:claude", "cerrar:codex"]);
  for (const mal of ["cerrar:Safari", "abrir:claude; rm -rf ~", "", null, "quit:codex"]) assert.throws(() => deepagentAppCommand(mal));
  assert.match(deepagentAppCommand("cerrar:claude"), /quit app "Claude"/);
  assert.match(deepagentAppCommand("abrir:codex"), /open -a Codex/);
  const srv = readFileSync(new URL("./fleet-control/server.js", import.meta.url), "utf8");
  assert.ok(srv.includes("deepagentapp: {\n    macos: (arg) => deepagentAppCommand(arg)\n  }"));
  const { validarAccion } = await import("./deepagents-app-lib.mjs");
  assert.equal(validarAccion({ agente: "Trinity", maquina: "MacStudio", accion: "cerrar" }).accion.arg, "cerrar:codex");
  assert.equal(validarAccion({ agente: "Neo", maquina: "MacStudio", accion: "abrir" }).accion.arg, "abrir:claude");
  assert.equal(validarAccion({ agente: "Smith", maquina: "MacMini", accion: "abrir" }).ok, false);
  assert.equal(validarAccion({ agente: "Neo", maquina: "MacStudio", accion: "borrar" }).ok, false);
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  assert.ok(js.includes('action: "deepagentapp"') && js.includes("window.confirm(") && js.includes('el("button", "ag-foto")'));
  const fn = readFileSync(new URL("./functions/api/deepagents/app.js", import.meta.url), "utf8");
  assert.ok(fn.includes('q.tipo !== "persona"'));
});
