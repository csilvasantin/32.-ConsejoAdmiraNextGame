import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// FLT-1827 (Carlos, 5-sep-2026): lo binario es UN botón que cambia con el estado.
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const tarjeta = html.slice(html.indexOf('<div class="acts"'), html.indexOf("</div>", html.indexOf('data-a="signagetoggle"')));

test("energía: un solo botón que apaga si está encendido y enciende si no; dormir solo encendido", () => {
  assert.match(tarjeta, /data-a="powertoggle"/);
  assert.match(tarjeta, /\$\{m\.online\?'⏻ apagar':'⚡ encender'\}/);
  assert.doesNotMatch(tarjeta, /data-a="powershutdown"|data-a="powerwake"/);
  assert.match(tarjeta, /\$\{m\.online\?`<button data-a="powersleep"/);
});

test("app y canal DS son toggles; desaparecen las parejas abrir/cerrar", () => {
  assert.match(tarjeta, /data-a="apptoggle"/);
  assert.doesNotMatch(tarjeta, /data-a="open"|data-a="closeapp"|data-a="closechannel"/);
  assert.match(tarjeta, /data-a="channeltoggle"/);
  assert.match(tarjeta, /signageIsOn\(m\.id\)\?'⏹ cerrar canal':'📺 abrir canal'/);
});

test("el manejador resuelve cada toggle a la acción real según el estado", () => {
  assert.match(html, /if\(action==='powertoggle'\)\{[\s\S]*?action = m0\.online \? 'powershutdown' : 'powerwake';/);
  assert.match(html, /if\(action==='channeltoggle'\)\{ action = signageIsOn\(machine\) \? 'closechannel' : 'openchannel'; \}/);
  assert.match(html, /\^\(\?:cerrar\|close\|quit\)\\s\+\(\.\+\)\$/);
});
