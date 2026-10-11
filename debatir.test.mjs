// /debatir · /debate — mesa de debate del Consejo (11-10-2026). node --test debatir.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "./debatir-lib.mjs";
import { onRequestGet, onRequestPost } from "./functions/api/consejo/debatir.js";
import { onRequestPost as vozPost } from "./functions/api/consejo/voz.js";
import "./assets/live-debatir.js";
globalThis.window = globalThis.window || globalThis;
await import("./assets/council-silhouettes.js");

const D = globalThis.AdmiraDebatir;
const PREVIEW = "https://debatir-mesa.admira-live.pages.dev";
const ENV = { NVIDIA_API_KEY: "nv-test", DEBATIR_TOKEN: "tok-preview" };
const req = (body, { url = PREVIEW + "/api/consejo/debatir", token = "tok-preview", method = "POST" } = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: method === "POST" ? JSON.stringify(body) : undefined });

function fakeFetch(handlers) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url: String(url), init, body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : null });
    for (const [pat, fn] of handlers) if (String(url).includes(pat)) return fn(url, init);
    throw new Error("red no esperada: " + url);
  };
  f.llamadas = llamadas;
  return f;
}
const llm = (content, extra = {}) => () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 50, completion_tokens: 40, ...extra } }), { status: 200, headers: { "content-type": "application/json" } });

// ── Parser del comando (cliente) ──
test("parse: /debatir y /debate, nivel, audio, rondas, todos, stop", () => {
  assert.deepEqual(D.parse("/debatir ¿pantallas en tienda?"), { lang: "es", nivel: "gratis", audio: false, todos: false, rondas: 2, tema: "¿pantallas en tienda?", stop: false });
  const a = D.parse("/debate better audio rounds=3 all https://example.com/x");
  assert.equal(a.lang, "en"); assert.equal(a.nivel, "pago"); assert.equal(a.audio, true); assert.equal(a.rondas, 3); assert.equal(a.todos, true); assert.equal(a.tema, "https://example.com/x");
  assert.equal(D.parse("/debatir mejor audio x9 tema").rondas, 4, "máximo 4 rondas");
  assert.equal(D.parse("/debatir audio tema").nivel, "gratis", "audio solo no sube a pago");
  assert.equal(D.parse("/debatir stop").stop, true);
  assert.equal(D.parse("/debater x"), null);
  assert.equal(D.parse("/demo"), null);
});

test("DMZ del cliente: no intercepta en www.admira.live salvo flag local", () => {
  const store = (v) => ({ getItem: () => v });
  assert.equal(D.dmzActiva({ hostname: "www.admira.live" }, store(null)), false);
  assert.equal(D.dmzActiva({ hostname: "admira.live" }, store(null)), false);
  assert.equal(D.dmzActiva({ hostname: "www.admira.live" }, store("1")), true);
  assert.equal(D.dmzActiva({ hostname: "debatir-mesa.admira-live.pages.dev" }, store(null)), true);
});

test("anclas: cada consejero de la mesa tiene cabeza en su silueta (ambas vistas)", () => {
  for (const gen of ["leyendas", "coetaneos"]) {
    for (const t of D.orden(gen, true, 1)) {
      const a = D.ancla(gen, t.persona);
      assert.ok(a, gen + "/" + t.persona);
      assert.ok(a.x > 0 && a.x < 100 && a.y > 15 && a.y < 60, `${t.persona} ${JSON.stringify(a)}`);
    }
  }
  assert.equal(D.ancla("coetaneos", "jobs"), null, "Jobs no está en Coetáneos: bocadillo centrado");
  assert.equal(D.orden("leyendas", false, 2).length, 8);
});

// ── Librería ──
test("mesa por defecto y todos, rondas acotadas", () => {
  assert.deepEqual(L.participantes("leyendas"), ["jobs", "wozniak", "disney", "lucas"]);
  assert.equal(L.participantes("coetaneos", true).length, 8);
  assert.equal(L.rondasValidas(9), 4); assert.equal(L.rondasValidas("x"), 2);
});

test("urlSegura bloquea SSRF y esquemas raros", () => {
  assert.ok(L.urlSegura("https://www.admira.com/es/"));
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/", "file:///etc/passwd", "https://a.b:8443/", "http://intranet/", "https://u:p@x.com/"]) assert.equal(L.urlSegura(u), null, u);
  assert.equal(L.extraerUrl("mira esto: https://x.com/a)."), "https://x.com/a");
});

test("textoDeHtml quita scripts y saca título/descripción", () => {
  const r = L.textoDeHtml('<html><head><title>Admira &amp; Co</title><meta name="description" content="Retail media"><script>alert(1)</script></head><body><nav>menu</nav><p>Hola <b>mundo</b></p></body></html>');
  assert.equal(r.titulo, "Admira & Co");
  assert.match(r.texto, /Retail media/); assert.match(r.texto, /Hola mundo/);
  assert.doesNotMatch(r.texto, /alert|menu/);
});

test("prompts: en personaje, corto, construye sobre el anterior, bilingüe", () => {
  const m = L.mensajesTurno({ persona: "wozniak", lang: "es", tema: "pantallas", historial: [{ persona: "jobs", texto: "Menos es más." }], ronda: 2, rondas: 2 });
  assert.match(m[0].content, /Steve Wozniak/); assert.match(m[0].content, /ingeniería/); assert.match(m[0].content, /1 a 3 frases/);
  assert.match(m[1].content, /Steve Jobs: Menos es más\./); assert.match(m[1].content, /Última ronda/);
  const en = L.mensajesTurno({ persona: "lucas", lang: "en", tema: "screens", historial: [] });
  assert.match(en[0].content, /Speak in English/); assert.match(en[1].content, /open the debate/);
  assert.match(L.mensajesConclusion({ lang: "es", tema: "t", historial: [] })[0].content, /moderador/);
});

test("limpiarBocadillo: sin markdown, sin prefijo de nombre, máx 3 frases", () => {
  assert.equal(L.limpiarBocadillo('Steve Jobs: "**Uno.** Dos. Tres. Cuatro."', { nombre: "Steve Jobs" }), "Uno. Dos. Tres.");
  assert.ok(L.limpiarBocadillo("a ".repeat(400)).length <= 340);
});

test("proveedor: gratis = Nemotron NIM sin razonamiento; pago solo si se pide y hay clave", () => {
  const g = L.proveedor("gratis", { NVIDIA_API_KEY: "k", XAI_API_KEY: "x" });
  assert.equal(g.id, "nvidia"); assert.equal(g.modelo, L.MODELO_GRATIS); assert.equal(g.nivel, "gratis");
  assert.deepEqual(L.cuerpoPeticion(g, [], 200).chat_template_kwargs, { enable_thinking: false });
  assert.equal(L.proveedor("cualquiera", { NVIDIA_API_KEY: "k", XAI_API_KEY: "x" }).nivel, "gratis", "nivel desconocido = gratis");
  assert.equal(L.proveedor("pago", { NVIDIA_API_KEY: "k" }), null, "sin XAI_API_KEY no hay pago (ni se degrada en silencio)");
  assert.equal(L.proveedor("pago", { XAI_API_KEY: "x" }).modelo, "grok-4.6");
  assert.equal(L.proveedor("gratis", { OPENROUTER_API_KEY: "o" }).modelo, L.MODELO_GRATIS_OR);
  assert.equal(L.costeUsd(g, { usage: { cost_in_usd_ticks: 5e8 } }), 0, "gratis nunca suma coste");
  assert.equal(L.costeUsd(L.proveedor("pago", { XAI_API_KEY: "x" }), { usage: { cost_in_usd_ticks: 58800000 } }), 0.00588);
});

// ── Endpoint ──
test("GET salud en preview; 404 en producción (DMZ) salvo DEBATIR_PUBLICO=1", async () => {
  const r = await onRequestGet({ request: req(null, { method: "GET" }), env: ENV });
  const d = await r.json();
  assert.equal(r.status, 200); assert.match(d.niveles.gratis, /Nemotron/); assert.equal(d.niveles.pago, null);
  const p = await onRequestGet({ request: req(null, { method: "GET", url: "https://www.admira.live/api/consejo/debatir" }), env: ENV });
  assert.equal(p.status, 404);
  const p2 = await onRequestPost({ request: req({ accion: "turno" }, { url: "https://www.admira.live/api/consejo/debatir" }), env: ENV, fetchImpl: fakeFetch([]) });
  assert.equal(p2.status, 404);
  const pub = await onRequestGet({ request: req(null, { method: "GET", url: "https://www.admira.live/api/consejo/debatir" }), env: { ...ENV, DEBATIR_PUBLICO: "1" } });
  assert.equal(pub.status, 200);
});

test("POST sin credencial → 401 y no llama a ningún modelo", async () => {
  const f = fakeFetch([["oauth2.googleapis.com", () => new Response("{}", { status: 400 })]]);
  const r = await onRequestPost({ request: req({ accion: "turno", persona: "jobs", tema: "t" }, { token: "malo" }), env: ENV, fetchImpl: f });
  assert.equal(r.status, 401);
  assert.ok(!f.llamadas.some((l) => l.url.includes("nvidia")));
});

test("turno gratis: Nemotron en NIM, bocadillo limpio, coste 0", async () => {
  const f = fakeFetch([["integrate.api.nvidia.com", llm("Steve Wozniak: Jobs tiene razón a medias. La pantalla debe funcionar sin manual. Y repararse fácil. Cuarta frase.")]]);
  const r = await onRequestPost({ request: req({ accion: "turno", persona: "wozniak", tema: "pantallas", ronda: 1, rondas: 2, historial: [{ persona: "jobs", texto: "Ruido." }, { persona: "nadie", texto: "x" }] }), env: ENV, fetchImpl: f });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.texto, "Jobs tiene razón a medias. La pantalla debe funcionar sin manual. Y repararse fácil.");
  assert.equal(d.nivel, "gratis"); assert.equal(d.coste_usd, 0);
  const body = f.llamadas[0].body;
  assert.equal(body.model, "nvidia/nemotron-3-ultra-550b-a55b");
  assert.match(body.messages[1].content, /Steve Jobs: Ruido\./);
  assert.doesNotMatch(body.messages[1].content, /nadie/);
  assert.equal(f.llamadas[0].init.headers.authorization, "Bearer nv-test");
});

test("turno pago: grok-4.6 con su coste; sin clave XAI → 503 (nunca cae a otro de pago)", async () => {
  const f = fakeFetch([["api.x.ai", llm("Primero, borra pasos.", { cost_in_usd_ticks: 58800000 })]]);
  const r = await onRequestPost({ request: req({ accion: "turno", persona: "musk", tema: "t", nivel: "pago" }), env: { ...ENV, XAI_API_KEY: "xai" }, fetchImpl: f });
  const d = await r.json();
  assert.equal(d.nivel, "pago"); assert.equal(d.modelo, "grok-4.6"); assert.equal(d.coste_usd, 0.00588);
  assert.ok(f.llamadas[0].body.max_tokens >= 2500, "razonador: margen para pensar");
  const sin = await onRequestPost({ request: req({ accion: "turno", persona: "musk", tema: "t", nivel: "pago" }), env: ENV, fetchImpl: fakeFetch([]) });
  assert.equal(sin.status, 503); assert.equal((await sin.json()).falta, "XAI_API_KEY");
});

test("preparar con URL: lee la página en el servidor y la resume con el modelo gratis", async () => {
  const f = fakeFetch([
    ["example.com", () => new Response("<html><title>Tienda X</title><body><p>" + "Pantallas en tienda que cambian el mensaje. ".repeat(5) + "</p></body></html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["integrate.api.nvidia.com", llm("La página explica pantallas dinámicas en tienda.")],
  ]);
  const r = await onRequestPost({ request: req({ accion: "preparar", tema: "https://example.com/p", nivel: "pago" }), env: ENV, fetchImpl: f });
  const d = await r.json();
  assert.equal(d.titulo, "Tienda X"); assert.match(d.contexto, /pantallas dinámicas/); assert.equal(d.nivel, "gratis");
  const sinUrl = await (await onRequestPost({ request: req({ accion: "preparar", tema: "solo texto" }), env: ENV, fetchImpl: fakeFetch([]) })).json();
  assert.equal(sinUrl.contexto, null);
  const ssrf = await (await onRequestPost({ request: req({ accion: "preparar", tema: "http://127.0.0.1/admin" }), env: ENV, fetchImpl: fakeFetch([]) })).json();
  assert.equal(ssrf.ok, true); assert.ok(ssrf.aviso, "URL privada: aviso, sin fetch");
});

test("conclusión: la firma Jobs (moderador)", async () => {
  const f = fakeFetch([["integrate.api.nvidia.com", llm("Conclusión: pantallas sí, pero con historia. Piloto en 3 tiendas.")]]);
  const d = await (await onRequestPost({ request: req({ accion: "conclusion", tema: "t", historial: [{ persona: "lucas", texto: "Historia." }] }), env: ENV, fetchImpl: f })).json();
  assert.equal(d.persona, "jobs"); assert.equal(d.conclusion, true); assert.match(d.texto, /Piloto/);
});

test("voz ElevenLabs: sin clave → 503 falta; con clave → audio y nunca expone la clave", async () => {
  const sin = await vozPost({ request: req({ persona: "jobs", texto: "Hola" }, { url: PREVIEW + "/api/consejo/voz" }), env: ENV, fetchImpl: fakeFetch([]) });
  assert.equal(sin.status, 503); assert.equal((await sin.json()).falta, "ELEVENLABS_API_KEY");
  const f = fakeFetch([["api.elevenlabs.io", () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } })]]);
  const r = await vozPost({ request: req({ persona: "wozniak", texto: "Funciona." }, { url: PREVIEW + "/api/consejo/voz" }), env: { ...ENV, ELEVENLABS_API_KEY: "el-secreta" }, fetchImpl: f });
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.match(f.llamadas[0].url, new RegExp(L.VOCES_ELEVEN.wozniak));
  assert.ok(![...r.headers.values()].some((v) => v.includes("el-secreta")));
  const voces = (gen) => L.participantes(gen, true).map((p) => L.vozEleven(p, {}));
  for (const g of ["leyendas", "coetaneos"]) assert.equal(new Set(voces(g)).size, 8, "voz distinta por consejero en " + g);
});
