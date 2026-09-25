import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
const datos = JSON.parse(readFileSync(new URL("./consumos-plataformas.json", import.meta.url), "utf8"));

test("el resumen urgente son tres líneas y cada tarjeta trae lectura", () => {
  assert.equal(datos.resumen.length, 3);
  assert.ok(datos.plataformas.length >= 5);
  for (const p of datos.plataformas) {
    assert.ok(p.nombre && p.frase && p.leido && p.semaforo);
    assert.ok(["rojo", "ambar", "verde", "sin"].includes(p.semaforo));
  }
  const porNombre = Object.fromEntries(datos.plataformas.map((p) => [p.nombre, p]));
  assert.equal(porNombre.Cloudflare.semaforo, "rojo");
  assert.equal(porNombre.Cloudflare.cifra, "253,85");
  assert.equal(porNombre["Grok, la cuenta de Smith"].cifra, "7,39");
  assert.equal(porNombre["Cursor, El Arquitecto"].semaforo, "ambar");
  assert.equal(porNombre["Consejeros de Grok"].semaforo, "verde");
  assert.equal(porNombre["Consolas de Anthropic"].cifra, "");
  assert.equal(porNombre["Consolas de OpenAI"].leido, "sin lectura todavía");
});

test("la página lee el archivo estático y no la base de datos", () => {
  assert.match(html, /\/consumos-plataformas\.json/);
  assert.equal(/api\.yokup\.com|d1|D1|wrangler/.test(html), false);
  assert.equal(JSON.stringify(datos).includes("D1"), false);
  assert.equal(JSON.stringify(datos).includes(" KV"), false);
});
