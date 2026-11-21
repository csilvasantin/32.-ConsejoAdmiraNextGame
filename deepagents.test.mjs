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
  assert.ok(js.includes("/api/flota/trabajando"));
  // Leyendas → MacStudio, Coetáneos → MacMini; la máquina principal va por defecto.
  assert.ok(js.includes('{ agente: "Trinity", maquina: "MacStudio", proyecto: "admira.studio", lado: "izquierda" }'));
  assert.ok(js.includes('{ agente: "Neo", maquina: "MacStudio", proyecto: "admira.live", lado: "derecha" }'));
  assert.ok(/agente: "Oraculo", maquina: "MacMini"/.test(js) && /agente: "Morfeo", maquina: "MacMini"/.test(js));
  assert.ok(js.indexOf('agente: "Trinity"') < js.indexOf('agente: "Neo"') && js.indexOf('agente: "Neo"') < js.indexOf('agente: "Oraculo"'));
  // Desplegable solo con más de un equipo; luz verde/rojo/amarillo; la pastilla abre la captura en vivo.
  assert.ok(js.includes("maqs.length > 1") && js.includes('el("select", "ag-maq")'));
  assert.ok(js.includes('verde: "Trabajando", rojo: "Sin hacer nada", amarillo: "No se sabe"'));
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
  const js = readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8");
  const ini = js.indexOf("  var FUENTE_REAL"), fin = js.indexOf("  function fichaAgente(");
  const { proyectoActual, nombreProy } = new Function(js.slice(ini, fin) + "return { proyectoActual, nombreProy };")();
  const neo = { proyecto: "admira.live" };
  assert.deepEqual(proyectoActual({ foco: { proyecto: "admira.store", fuente: "ahora", defecto: false }, proyecto: "admira.store" }, neo), { k: "admira.store", defecto: false, fuente: "latido / pulso de ahora" });
  assert.equal(proyectoActual({ foco: { proyecto: "https://www.admira.store/admira-xp", fuente: "agente", defecto: false } }, neo).k, "admira.store");
  assert.deepEqual(proyectoActual({ foco: null, proyecto: "otros" }, neo), { k: "admira.live", defecto: true, fuente: "por defecto" });
  assert.equal(proyectoActual({ foco: { proyecto: "admira.tv", fuente: "reparto", defecto: false }, proyecto: null }, neo).defecto, true);
  assert.equal(proyectoActual({ foco: null, proyecto: null }, { proyecto: "" }), null);
  assert.equal(nombreProy("admira.store"), "Admira.Store");
  assert.equal(nombreProy("admira.live"), "Admira.live");
  assert.equal(nombreProy("admira.studio"), "Admira.Studio");
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
