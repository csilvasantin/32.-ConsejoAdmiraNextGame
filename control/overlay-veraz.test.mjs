import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { frameFailure } = require("../fleet-control/machine-id.js");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("cada fallo del feed lleva título y causa reales, y un 401 de respaldo no se vende como problema de login", () => {
  assert.match(html, /function tituloDeFallo\(err,txt\)/);
  assert.match(html, /e\.failover=!!\(r\.__admiraMesh&&r\.__admiraMesh\.failover\)/, "el error del feed sabe si venía de un relé de respaldo");
  assert.match(html, /reconexión automática cada 1,2 s/);
  assert.equal(frameFailure({ status: 424 }, "HTTP 424 capture_failed_or_no_permission").title, "La máquina no devuelve imagen");
  const pausa = frameFailure({ status: 424 }, 'HTTP 424 {"error":"capture_transient","detail":"SCREEN_CAPTURE_FAILED rc=1 could not create image from display"}');
  assert.equal(pausa.title, "La captura se interrumpió");
  assert.match(pausa.hint, /No es un permiso/);
  assert.equal(frameFailure({ status: 404 }, 'HTTP 404 {"error":"no_such_display"}').title, "Esa pantalla no existe");
  assert.equal(frameFailure({ status: 424 }, 'HTTP 424 {"error":"capture_stale"}').title, "La imagen no es de ahora");
  assert.equal(frameFailure({ status: 401, failover: true, relay: "MacBook Pro 16" }, "HTTP 401").title, "Relé de respaldo sin tu sesión");
  assert.equal(frameFailure({ status: 401 }, "HTTP 401").title, "Sesión caducada en el hub");
});
test("selector de pantalla siempre visible; desbloqueo y pegado van por el inyector (texto + Intro)", () => {
  assert.doesNotMatch(html, /id="rc-disp" style="display:none"/);
  assert.match(html, /id="rc-unlock"/); assert.match(html, /id="rc-paste"/);
  assert.match(html, /enqueueInput\(\{type:'text',text:pw\}\); enqueueInput\(\{type:'key',code:36,mods:\[\]\}\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^)]*pw/, "la contraseña no se guarda");
});
