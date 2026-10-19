// «🗑 Eliminar equipo» borra también en las FUENTES (relay del Mac mini + admira-fleet), 19-10-2026.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { firmarTicket, verificarTicket, propagar, COPIA } from "./equipos-propagar.js";
const { onRequestPost, onRequestGet, KEY } = await import("../functions/api/control/equipos.js");
const require = createRequire(import.meta.url);
const relay = require("../fleet-control/machine-removal.js");

const TOKEN = "token-de-prueba-0123456789";
const AHORA_MS = Date.now();

function kvFalso() {
  const datos = new Map();
  return { datos, get: async (k) => (datos.has(k) ? datos.get(k) : null), put: async (k, v) => { datos.set(k, v); }, delete: async (k) => { datos.delete(k); } };
}
const web = { Origin: "https://www.admira.live", "X-Admira-Control": "1" };
const req = (body, headers = web) => new Request("https://www.admira.live/api/control/equipos", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Simula relay (fleet.json en memoria) + admira-fleet y anota cada llamada. */
function fuentesFalsas({ relayTieneDelete = true } = {}) {
  const relayMachines = [{ id: "macstudio", name: "Mac Studio", host: "macstudio.tail48b61c.ts.net", net: { lanIp: "192.168.1.9" } }, { id: "macmini", name: "Mac Mini", host: "macmini.tail48b61c.ts.net" }];
  const papelera = [];
  const fleet = new Map([["admira-macstudio", { id: "admira-macstudio", name: "Mac Studio", fqdn: "", platform: "macos", lastSeen: 1 }], ["admira-macmini", { id: "admira-macmini", name: "Mac Mini (Carlos)" }]]);
  const llamadas = [];
  const res = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), metodo = init.method || "GET";
    const h = new Headers(init.headers || {});
    llamadas.push({ url: u.href, metodo, token: h.get("X-Fleet-Token") || h.get("Authorization") });
    if (u.host === "macmini.tail48b61c.ts.net") {
      if (h.get("X-Fleet-Token") !== TOKEN) return res(401, { error: "token requerido" });
      const m = u.pathname.match(/^\/fleet\/api\/machines\/([^/]+)(\/restore)?$/);
      if (!m || !relayTieneDelete) return res(404, { error: "no encontrado" });
      const id = decodeURIComponent(m[1]);
      if (!m[2] && metodo === "DELETE") {
        const i = relayMachines.findIndex((x) => x.id === id);
        if (i < 0) return res(404, { ok: false, error: "máquina desconocida" });
        if (u.searchParams.get("dryRun") === "1") return res(200, { ok: true, dryRun: true, machine: relayMachines[i] });
        const [quitada] = relayMachines.splice(i, 1); papelera.push(quitada);
        return res(200, { ok: true, removed: true, machine: quitada, backup: "fleet-x.json" });
      }
      if (m[2] && metodo === "POST") {
        const i = papelera.findIndex((x) => x.id === id);
        if (i < 0) return res(404, { ok: false, error: "no está en la papelera" });
        relayMachines.push(papelera.splice(i, 1)[0]);
        return res(200, { ok: true, restored: true });
      }
    }
    if (u.host === "fleet.yokup.com") {
      if (u.pathname === "/machines" && metodo === "GET") return res(200, { ok: true, machines: [...fleet.values()] });
      if (h.get("Authorization") !== "Bearer " + TOKEN) return res(401, { ok: false, error: "unauthorized" });
      if (metodo === "DELETE") { const id = decodeURIComponent(u.pathname.slice("/machines/".length)); fleet.delete(id); return res(200, { ok: true, id }); }
      if (u.pathname === "/machines/register") { const b = JSON.parse(init.body); fleet.set(b.id, b); return res(200, { ok: true, id: b.id }); }
    }
    return res(404, { error: "no encontrado" });
  };
  return { relayMachines, papelera, fleet, llamadas, fetchImpl };
}

test("ticket: el relay (Node crypto) y Pages (WebCrypto) firman y verifican igual", async () => {
  const t = relay.mintTicket(TOKEN, { id: "macstudio", accion: "eliminar", email: "carlos@admira.com" }, AHORA_MS);
  const p = await verificarTicket(TOKEN, t, AHORA_MS);
  assert.equal(p.id, "macstudio"); assert.equal(p.accion, "eliminar"); assert.equal(p.email, "carlos@admira.com");
  assert.equal(await verificarTicket("otro-token", t, AHORA_MS), null);
  assert.equal(await verificarTicket(TOKEN, t, AHORA_MS + 121000), null, "caduca a los 120 s");
  assert.equal(await verificarTicket(TOKEN, t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), AHORA_MS), null);
  const t2 = await firmarTicket(TOKEN, { v: 1, id: "x", accion: "restaurar", email: "", exp: Math.floor(AHORA_MS / 1000) + 60 });
  assert.equal(relay.verifyTicket(TOKEN, t2, AHORA_MS).id, "x");
});

test("eliminar con ticket: borra en el relay y en admira-fleet (servidor), guarda copia privada y oculta en KV", async () => {
  const f = fuentesFalsas();
  const env = { RECORTE_KV: kvFalso(), FLEET_TOKEN: TOKEN };
  const ticket = relay.mintTicket(TOKEN, { id: "macstudio", accion: "eliminar", email: "carlos@admira.com" });
  const r = await onRequestPost({ request: req({ accion: "ocultar", id: "macstudio", nombre: "Mac Studio", ticket }), env, fetchImpl: f.fetchImpl });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.propagacion.ok, true);
  assert.equal(d.propagacion.rele.removed, true);
  assert.deepEqual(d.propagacion.fleet.ids, ["admira-macstudio"]);
  assert.ok(!f.relayMachines.some((m) => m.id === "macstudio"));
  assert.ok(!f.fleet.has("admira-macstudio"));
  assert.ok(f.fleet.has("admira-macmini"), "no toca otros equipos");
  assert.equal(d.ocultos.macstudio.fuentes.ok, true);
  // el token no sale nunca hacia el navegador
  assert.ok(!JSON.stringify(d).includes(TOKEN));
  // copia privada (con host/red) en clave aparte; el GET público no la enseña
  const copia = JSON.parse(env.RECORTE_KV.datos.get(COPIA + "macstudio"));
  assert.equal(copia.rele.host, "macstudio.tail48b61c.ts.net");
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/control/equipos"), env })).json();
  assert.ok(!JSON.stringify(g).includes("192.168.1.9") && !JSON.stringify(g).includes("tail48b61c"));
});

test("restaurar con ticket: vuelve al relay (papelera) y a admira-fleet con la copia; desoculta", async () => {
  const f = fuentesFalsas();
  const env = { RECORTE_KV: kvFalso(), FLEET_TOKEN: TOKEN };
  await onRequestPost({ request: req({ accion: "ocultar", id: "macstudio", ticket: relay.mintTicket(TOKEN, { id: "macstudio", accion: "eliminar" }) }), env, fetchImpl: f.fetchImpl });
  const r = await onRequestPost({ request: req({ accion: "restaurar", id: "macstudio", ticket: relay.mintTicket(TOKEN, { id: "macstudio", accion: "restaurar" }) }), env, fetchImpl: f.fetchImpl });
  const d = await r.json();
  assert.equal(d.propagacion.ok, true);
  assert.equal(d.propagacion.rele.restored, true);
  assert.ok(f.relayMachines.some((m) => m.id === "macstudio"));
  assert.equal(f.fleet.get("admira-macstudio").name, "Mac Studio");
  assert.equal(d.ocultos.macstudio.restaurado, true);
  assert.ok(!env.RECORTE_KV.datos.has(COPIA + "macstudio"), "copia consumida");
});

test("sin ticket, ticket de otro id/acción o falsificado: SOLO KV (como antes), nada se borra fuera", async () => {
  for (const ticket of [undefined, relay.mintTicket(TOKEN, { id: "macmini", accion: "eliminar" }), relay.mintTicket(TOKEN, { id: "macstudio", accion: "restaurar" }), relay.mintTicket("otro", { id: "macstudio", accion: "eliminar" })]) {
    const f = fuentesFalsas();
    const env = { RECORTE_KV: kvFalso(), FLEET_TOKEN: TOKEN };
    const d = await (await onRequestPost({ request: req({ accion: "ocultar", id: "macstudio", ticket }), env, fetchImpl: f.fetchImpl })).json();
    assert.equal(d.ok, true);
    assert.ok(d.ocultos.macstudio, "se oculta igual");
    assert.equal(f.llamadas.filter((l) => l.metodo !== "GET").length, 0, "ninguna escritura en las fuentes");
    if (ticket) assert.match(d.propagacion.error, /ticket/);
  }
});

test("dryRun con ticket: dice qué borraría y no escribe NADA (ni fuentes ni KV)", async () => {
  const f = fuentesFalsas();
  const env = { RECORTE_KV: kvFalso(), FLEET_TOKEN: TOKEN };
  const d = await (await onRequestPost({ request: req({ accion: "ocultar", id: "macstudio", dryRun: true, ticket: relay.mintTicket(TOKEN, { id: "macstudio", accion: "eliminar" }) }), env, fetchImpl: f.fetchImpl })).json();
  assert.equal(d.dryRun, true);
  assert.equal(d.propagacion.rele.dryRun, true);
  assert.deepEqual(d.propagacion.fleet.ids, ["admira-macstudio"]);
  assert.equal(f.relayMachines.length, 2); assert.equal(f.fleet.size, 2);
  assert.equal(f.llamadas.filter((l) => l.metodo === "DELETE" && !l.url.includes("dryRun=1")).length, 0);
  assert.equal(env.RECORTE_KV.datos.size, 0);
});

test("relay aún sin el endpoint (404 «no encontrado»): se oculta y admira-fleet se borra; el aviso lo dice", async () => {
  const f = fuentesFalsas({ relayTieneDelete: false });
  const env = { RECORTE_KV: kvFalso(), FLEET_TOKEN: TOKEN };
  const d = await (await onRequestPost({ request: req({ accion: "ocultar", id: "macstudio", ticket: relay.mintTicket(TOKEN, { id: "macstudio", accion: "eliminar" }) }), env, fetchImpl: f.fetchImpl })).json();
  assert.equal(d.propagacion.ok, false);
  assert.match(d.propagacion.rele.error, /pendiente de instalar/);
  assert.equal(d.propagacion.fleet.ok, true);
  assert.ok(d.ocultos.macstudio);
});

test("sin FLEET_TOKEN en Pages: no propaga y lo explica", async () => {
  const p = await propagar({ env: {}, accion: "ocultar", id: "macstudio", fetchImpl: async () => { throw new Error("no debe llamar"); } });
  assert.match(p.rele.error, /FLEET_TOKEN/);
});

test("/control pide el ticket al relay por Fleet Mesh y lo manda a la Function (nunca un token)", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /FLEET_MESH\.json\('\/machines\/'\+encodeURIComponent\(id\)\+'\/ticket'/);
  assert.match(html, /guardarEquipoAccion\('ocultar',\{[^}]*ticket:ticket\|\|undefined\}\)/);
  assert.match(html, /guardarEquipoAccion\('restaurar',\{[^}]*ticket:ticket\|\|undefined\}\)/);
  assert.doesNotMatch(html, /FLEET_TOKEN/);
});
