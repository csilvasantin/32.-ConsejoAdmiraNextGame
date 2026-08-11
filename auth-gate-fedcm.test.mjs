import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const source = await readFile(new URL("./auth-gate.js", import.meta.url), "utf8");

test("la verja no abre One Tap ni FedCM silencioso", () => {
  assert.doesNotMatch(source, /google\.accounts\.id\.prompt\s*\(/);
  assert.match(source, /auto_select:false/);
});

test("challenge+nonce preceden al callback y viajan con cookie", () => {
  assert.match(source, /\/auth\/challenge/);
  assert.match(source, /nonce:challenge\.nonce/);
  assert.match(source, /state:redirectState/);
  assert.match(source, /login_uri:LOGIN_URI/);
  assert.match(source, /credentials:"include"/);
});

test("el acceso manual navega top-level y JavaScript no recibe credenciales", () => {
  assert.match(source, /ux_mode:"redirect"/);
  assert.match(source, /use_fedcm_for_button:false/);
  assert.doesNotMatch(source, /callback:onCredential|resp\.credential|ephemeralCredential/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(cred|session|token)/i);
  assert.doesNotMatch(source, /sessionStorage/);
});

test("todas las zonas seguras invalidan la caché del perímetro", async () => {
  const root = new URL("./", import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".html"));
  let protectedPages = 0;
  for (const name of files) {
    const html = await readFile(new URL(name, root), "utf8");
    const refs = html.match(/\/auth-gate\.js/g) || [];
    if (!refs.length) continue;
    protectedPages += 1;
    assert.doesNotMatch(html, /\/auth-gate\.js(?!\?v=\d{8}-r\d+)/, name);
  }
  assert.ok(protectedPages > 0);
});
