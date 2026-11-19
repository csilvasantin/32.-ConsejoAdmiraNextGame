import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest } from "./functions/hackeo/index.js";

test("/hackeo redirige a /control/?hackeo=1 sin caché", () => {
  const r = onRequest({ request: new Request("https://www.admira.live/hackeo") });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/control/?hackeo=1");
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("/hackeo conserva parámetros", () => {
  const r = onRequest({ request: new Request("https://www.admira.live/hackeo?lang=en") });
  assert.equal(r.headers.get("location"), "/control/?lang=en&hackeo=1");
});

test("control: HACKEO sigue en Control, con el login y sin arranque automático por la ruta", () => {
  const h = readFileSync(new URL("./control/index.html", import.meta.url), "utf8");
  assert.match(h, /<button id="hackOpen"[^>]*>🕶️ HACKEO<\/button>/);
  assert.match(h, /<script src="\/auth-gate\.js/);
  const pre = h.slice(0, h.indexOf('<script src="/admira-bar.js'));
  assert.match(pre, /pf_left/);
  const ruta = h.slice(h.indexOf("// Ruta /hackeo"), h.indexOf("// Ruta /hackeo") + 500);
  assert.doesNotMatch(ruta, /hkOpenFresh\(|startHack\(|hk_autoopen/);
});

test("menú Avanzado enlaza /hackeo", () => {
  const b = readFileSync(new URL("./admira-bar.js", import.meta.url), "utf8");
  assert.match(b, /h: "https:\/\/www\.admira\.live\/hackeo"/);
});
