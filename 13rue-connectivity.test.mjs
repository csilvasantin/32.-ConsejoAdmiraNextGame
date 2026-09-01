import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Implementar y Enjambre hablan por el proxy same-origin", () => {
  for (const path of ["./13rue/implementar.html", "./13rue/enjambre.html"]) {
    const html = source(path);
    assert.match(html, /BUS\s*=\s*["']\/13rue\/api\/hablar["']/,
      `${path} debe usar /13rue/api/hablar`);
    assert.doesNotMatch(html, /incubadora-bus\.csilvasantin\.workers\.dev\/hablar/,
      `${path} no debe saltarse el proxy same-origin`);
  }
});

test("Pausar distingue un WebSocket activo de la ausencia de timer", () => {
  const html = source("./13rue/index.html");
  assert.match(html, /var pausado = true, intentoConexion = 0;/);
  assert.match(html, /m-play[\s\S]*addEventListener\("click",function\(\)\{ pausado\?play\(\):pause\(\); \}\);/);
  assert.doesNotMatch(html, /m-play[\s\S]*addEventListener\("click",function\(\)\{ timer\?pause\(\):play\(\); \}\);/);

  const pause = html.match(/function pause\(\)\{([\s\S]*?)\n    \}\n    function stress/);
  assert.ok(pause, "debe existir la transición pause");
  assert.ok(pause[1].indexOf("pausado=true") < pause[1].indexOf("activo.close()"),
    "la pausa debe invalidar la conexión antes de cerrar el socket");
});

test("el cierre remoto del WebSocket libera la referencia y arranca sondeo real", () => {
  const html = source("./13rue/index.html");
  const close = html.match(/s\.onclose = function\(\)\{([\s\S]*?)\n        \};/);
  assert.ok(close, "debe existir el manejador onclose");
  assert.match(close[1], /if\(ws === s\) ws = null;/);
  assert.match(close[1], /if\(!abierto\)/);
  assert.match(close[1], /rej\(new Error\("ws cerrado antes de conectar"\)\)/);
  assert.match(close[1], /if\(pausado \|\| intento !== intentoConexion\) return;/);
  assert.match(close[1], /empiezaSondeo\(\)\.catch\(empiezaLocal\);/);
  assert.doesNotMatch(close[1], /if\(timer\)/,
    "el fallback no puede depender de un timer inexistente en modo WebSocket");

  assert.match(html, /function empiezaSondeo\(\)[\s\S]*timer=setInterval\(function\(\)\{ sondea\(\)/);
});
