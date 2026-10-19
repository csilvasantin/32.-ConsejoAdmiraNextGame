import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOOGLE_CLIENT_ID } from "./chat-hilo-lib.mjs";
import * as api from "./functions/api/chat/entre-consejeros.js";

const exp = Math.floor(Date.now() / 1000) + 3600;
const req = (auth, q = "con=Jobs") => new Request("https://www.admira.live/api/chat/entre-consejeros?" + q, { headers: auth ? { authorization: "Bearer " + auth } : {} });
const jwt = (n) => "aaa.bbb.ccc" + n;
function falso(google, bandeja, vistos) {
  return async (u, i) => {
    vistos && vistos.push({ u: String(u), i });
    if (String(u).includes("tokeninfo")) return new Response(JSON.stringify(google), { status: google ? 200 : 400 });
    return new Response(JSON.stringify(bandeja), { status: 200 });
  };
}
const carlos = { aud: GOOGLE_CLIENT_ID, email: "csilvasantin@gmail.com", email_verified: true, exp };
const bandeja = { ok: true, pendientes: 1, mensajes: [{ id: "cm1", de: "Musk", para: "Jobs", texto: "hola", hora: "2026-10-19T17:00:00Z", leido: false, extra: "no" }] };

test("sin sesión Google: 401 y no llama al Worker", async () => {
  const vistos = [];
  const r = await api.onRequestGet({ request: req(""), env: {}, fetchImpl: falso(null, bandeja, vistos) });
  assert.equal(r.status, 401);
  assert.ok(!vistos.some((v) => v.u.includes("consejero/mensajes")));
});

test("cuenta no autorizada: 401", async () => {
  const r = await api.onRequestGet({ request: req(jwt(1)), env: {}, fetchImpl: falso({ ...carlos, email: "otro@x.com" }, bandeja) });
  assert.equal(r.status, 401);
});

test("con Google autorizado lee la bandeja (con token al Worker si existe) y filtra campos", async () => {
  const vistos = [];
  const r = await api.onRequestGet({ request: req(jwt(2)), env: { CONSEJERO_MENSAJES_TOKEN: "t".repeat(32) }, fetchImpl: falso(carlos, bandeja, vistos) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.con, "Jobs"); assert.equal(d.mensajes.length, 1); assert.equal(d.mensajes[0].texto, "hola");
  assert.equal(d.mensajes[0].extra, undefined);
  const w = vistos.find((v) => v.u.includes("/consejero/mensajes?con=Jobs"));
  assert.ok(w.u.startsWith("https://mcp.admira.live/"));
  assert.equal(w.i.headers["x-mensajes-token"], "t".repeat(32));
});

test("con inválido: 400; Elon es Musk", async () => {
  assert.equal((await api.onRequestGet({ request: req(jwt(3), "con=Nadie"), env: {}, fetchImpl: falso(carlos, bandeja) })).status, 400);
  assert.equal(api.silla("elon"), "Musk"); assert.equal(api.silla("Jensen"), "Huang");
});

test("la página ya no lee la bandeja en abierto", () => {
  const js = readFileSync(new URL("./assets/consejero-mensajes.js", import.meta.url), "utf8");
  assert.ok(!js.includes("mcp.admira.live/consejero/mensajes"));
  assert.ok(js.includes("/api/chat/entre-consejeros"));
  assert.ok(js.includes("Authorization"));
  const home = readFileSync(new URL("./council-grokbot.js", import.meta.url), "utf8");
  assert.ok(home.includes("#entre-consejeros"));
});
