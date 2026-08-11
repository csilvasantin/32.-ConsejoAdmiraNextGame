import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const source = await readFile(new URL("./auth-gate.js", import.meta.url), "utf8");

test("la verja no abre un FedCM silencioso durante el login manual", () => {
  const prompts = source.match(/google\.accounts\.id\.prompt\s*\(/g) || [];
  assert.equal(prompts.length, 1, "prompt sólo permanece en el refresco de una sesión ya validada");
  assert.doesNotMatch(source, /trySilentSignIn/);
  assert.doesNotMatch(source, /admira-gold[\s\S]{0,220}\.prompt\s*\(/);
});

test("sin sesión local admiraGateRefresh no compite con el botón de Google", () => {
  assert.match(source, /if \(!current \|\| !current\.email \|\| !current\.exp \|\| Date\.now\(\) >= current\.exp\) return Promise\.resolve\(null\)/);
});

test("el acceso manual usa el botón FedCM y no el popup clásico", () => {
  assert.match(source, /use_fedcm_for_button:\s*true/);
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
