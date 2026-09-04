import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("cada fallo del feed lleva título y causa reales, y un 401 de respaldo no se vende como problema de login", () => {
  assert.match(html, /function tituloDeFallo\(err,txt\)/);
  assert.match(html, /err\.status===424\) return 'La máquina no devuelve imagen'/);
  assert.match(html, /err\.failover\?'Relé de respaldo sin tu sesión':'Sesión caducada en el hub'/);
  assert.match(html, /e\.failover=!!\(r\.__admiraMesh&&r\.__admiraMesh\.failover\)/, "el error del feed sabe si venía de un relé de respaldo");
  assert.match(html, /reconexión automática cada 1,2 s/);
});
test("selector de pantalla siempre visible; desbloqueo y pegado van por el inyector (texto + Intro)", () => {
  assert.doesNotMatch(html, /id="rc-disp" style="display:none"/);
  assert.match(html, /id="rc-unlock"/); assert.match(html, /id="rc-paste"/);
  assert.match(html, /enqueueInput\(\{type:'text',text:pw\}\); enqueueInput\(\{type:'key',code:36,mods:\[\]\}\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^)]*pw/, "la contraseña no se guarda");
});
