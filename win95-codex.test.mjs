import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanear, contieneSecreto, normalizarSnap, normalizarEnvio, anadirSalida, aplicarAcuses, vistaPublica, textoParaCodex,
  CLAVE_SNAP, CLAVE_SALIDA, MAX_PENDIENTES,
} from "./win95-codex-lib.mjs";
import { onRequestGet, onRequestPost } from "./functions/api/win95/codex.js";
import { emitir, COOKIE } from "./functions/_puerta.js";
import { parseRunCommand } from "./win95-experto-lib.mjs";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const H1 = "01a186e2-8dea-7dd3-89fa-6d510d428d4c";
const TOKEN = "t".repeat(40);
const FIRMA = "f".repeat(48);

function kvFalso() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } };
}
const env = (kv) => ({ RECORTE_KV: kv, CONSUMOS_LECTURAS_TOKEN: TOKEN, PUERTA_FIRMA: FIRMA });
const req = (metodo, url, { token, cookie, body } = {}) => new Request("https://www.admira.live" + url, {
  method: metodo,
  headers: { ...(token ? { "X-Council-Token": token } : {}), ...(cookie ? { Cookie: COOKIE + "=" + cookie } : {}), "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
const noGoogle = async () => new Response("{}", { status: 400 });
async function cookie(tipo) { return (await emitir(FIRMA, tipo, tipo === "persona" ? "csilva@admira.com" : tipo)).valor; }

test("sanear quita tokens, IPs, correos y claves sin tocar el resto", () => {
  const t = sanear("deploy ok con token=abcd1234efgh desde 192.168.1.36 por csilva@admira.com y ghp_" + "a".repeat(30) + " y Bearer abc.def.ghi123");
  assert.ok(!/abcd1234efgh|192\.168|csilva@|ghp_a/.test(t), t);
  assert.match(t, /deploy ok/);
  assert.ok(contieneSecreto("sk-proj-" + "x".repeat(30)));
  assert.ok(!contieneSecreto("Hola Trinity, ¿cómo va la build 0.1.0?"));
});

test("normalizarSnap valida ids, roles y recorta", () => {
  const { snap } = normalizarSnap({ hilos: [
    { id: H1, titulo: "Publica nueva build", estado: "trabajando", turnos: [{ id: "1", ts: "2026-11-28T09:38:51Z", rol: "carlos", texto: "hola" }, { id: "2", ts: 1, rol: "raro", texto: "x" }, { id: "3", rol: "codex", texto: "  " }] },
    { id: "no-es-uuid", turnos: [] },
  ] }, 1000);
  assert.equal(snap.hilos.length, 1);
  assert.equal(snap.hilos[0].estado, "trabajando");
  assert.deepEqual(snap.hilos[0].turnos.map((t) => t.rol), ["carlos", "nota"]);
  assert.equal(normalizarSnap({}).error, "faltan hilos");
});

test("bandeja de salida: idempotente, tope de pendientes y acuses", () => {
  const hilos = [{ id: H1 }];
  assert.equal(normalizarEnvio({ hilo: H1, texto: "", msg_id: "abcdef" }, { hilos }).error, "texto vacío");
  assert.match(normalizarEnvio({ hilo: "01a1a269-0f99-7ef1-b973-82e26cbefb79", texto: "x", msg_id: "abcdef" }, { hilos }).error, /no está/);
  const { item } = normalizarEnvio({ hilo: H1, texto: "Hola Trinity", msg_id: "w95cdx-1" }, { hilos, autorNombre: "Carlos", ahora: 5 });
  let r = anadirSalida([], item);
  assert.equal(r.duplicado, false);
  r = anadirSalida(r.lista, item);
  assert.equal(r.duplicado, true);
  let l = [];
  for (let i = 0; i < MAX_PENDIENTES; i++) l = anadirSalida(l, { ...item, id: "m" + i }).lista;
  assert.match(anadirSalida(l, { ...item, id: "otro" }).error, /pendientes/);
  const a = aplicarAcuses(r.lista, [{ id: "w95cdx-1", estado: "entregado", nota: "en la cola" }, { id: "nada", estado: "entregado" }], 9);
  assert.equal(a.aplicados, 1);
  assert.equal(a.lista[0].estado, "entregado");
  assert.match(textoParaCodex(item, "10:50"), /^\[WIN95 · ICQGRAM → CODEX · CARLOS · 10:50\]\nHola Trinity$/);
});

test("vistaPublica no expone el correo del autor y avisa si el puente está parado", () => {
  const v = vistaPublica({ recibido: 0, hilos: [], maquina: "MacStudio" }, [{ id: "a", hilo: H1, texto: "x", autor: "csilva@admira.com", autorNombre: "Carlos", estado: "pendiente" }], { ahora: 10 * 60000 });
  assert.equal(v.fresco, false);
  assert.match(v.aviso, /no responde/);
  assert.ok(!JSON.stringify(v).includes("csilva@"));
});

test("endpoint: sin sesión 401; kiosco lee pero no escribe; persona escribe; el puente recoge y acusa", async () => {
  const kv = kvFalso(); const e = env(kv);
  const ctx = (request) => ({ request, env: e, fetchImpl: noGoogle });
  assert.equal((await onRequestGet(ctx(req("GET", "/api/win95/codex")))).status, 401);
  // el puente sube la instantánea
  let r = await onRequestPost(ctx(req("POST", "/api/win95/codex", { token: TOKEN, body: { accion: "snap", hilos: [{ id: H1, titulo: "Hilo", turnos: [{ id: "1", rol: "codex", texto: "Listo, IP 10.0.0.5" }] }] } })));
  assert.equal(r.status, 200);
  assert.ok(!kv.m.get(CLAVE_SNAP).includes("10.0.0.5"));
  // kiosco: lee
  const ck = await cookie("kiosco");
  r = await onRequestGet(ctx(req("GET", "/api/win95/codex", { cookie: ck })));
  const v = await r.json();
  assert.equal(v.hay, true); assert.equal(v.puedeEscribir, false); assert.equal(v.hilos[0].turnos.length, 1);
  // kiosco: no escribe
  r = await onRequestPost(ctx(req("POST", "/api/win95/codex", { cookie: ck, body: { accion: "enviar", hilo: H1, texto: "hola", msg_id: "w95cdx-a" } })));
  assert.equal(r.status, 403);
  // kiosco: no puede subir snap ni leer la bandeja del puente
  assert.equal((await onRequestPost(ctx(req("POST", "/api/win95/codex", { cookie: ck, body: { accion: "snap", hilos: [] } })))).status, 403);
  assert.equal((await onRequestGet(ctx(req("GET", "/api/win95/codex?puente=1", { cookie: ck })))).status, 403);
  // persona: escribe
  const cp = await cookie("persona");
  r = await onRequestPost(ctx(req("POST", "/api/win95/codex", { cookie: cp, body: { accion: "enviar", hilo: H1, texto: "Hola Trinity", msg_id: "w95cdx-b" } })));
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(kv.m.get(CLAVE_SALIDA)).items[0].autorNombre, "Carlos");
  // el puente recoge y acusa
  r = await onRequestGet(ctx(req("GET", "/api/win95/codex?puente=1", { token: TOKEN })));
  const p = await r.json();
  assert.equal(p.pendientes.length, 1);
  r = await onRequestPost(ctx(req("POST", "/api/win95/codex", { token: TOKEN, body: { accion: "acuse", acuses: [{ id: "w95cdx-b", estado: "entregado", nota: "ok" }] } })));
  assert.equal((await r.json()).aplicados, 1);
  r = await onRequestGet(ctx(req("GET", "/api/win95/codex?puente=1", { token: TOKEN })));
  assert.equal((await r.json()).pendientes.length, 0);
  // escrituras de snap demasiado seguidas: 202 sin guardar
  r = await onRequestPost(ctx(req("POST", "/api/win95/codex", { token: TOKEN, body: { accion: "snap", hilos: [] } })));
  assert.equal(r.status, 202);
});

test("Win95 trae la ventana Codex · Trinity, menú, Ejecutar «codex» y sin secretos", () => {
  assert.match(html, /id="cdx" class="win"/);
  assert.match(html, /Codex · Trinity \(MacStudio\)/);
  assert.match(html, /r\.action==='codex'\)\{ openCodex\(true\)/);
  assert.match(html, /wireCodex\(\)/);
  assert.match(html, /\/api\/win95\/codex/);
  assert.equal(parseRunCommand("codex").action, "codex");
  assert.equal(parseRunCommand("trinity").action, "codex");
  const bloque = html.slice(html.indexOf("/* ---------- Codex · Trinity (MacStudio) — Carlos t1419u, 28-11-2026 ----------"), html.indexOf("/* ---------- icono de red de la bandeja"));
  assert.ok(bloque.length > 1000);
  assert.ok(!/X-Council-Token|consumos-lecturas|192\.168/.test(bloque));
});

test("el puente vive fuera del sitio publicado (deploy.sh borra fleet-control salvo machine-id.js)", () => {
  const dep = readFileSync(join(raiz, "deploy.sh"), "utf8");
  assert.match(dep, /find "\$TMP\/fleet-control" -type f ! -name 'machine-id\.js' -delete/);
  const py = readFileSync(join(raiz, "fleet-control/codex-espejo.py"), "utf8");
  assert.match(py, /"queue", "--thread"/);
  assert.ok(!/AXUIElement|osascript|keystroke|activate/.test(py), "sin AX, sin AppleScript, sin robar foco");
});
