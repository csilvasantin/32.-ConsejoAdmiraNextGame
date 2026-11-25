import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// t1383u (25-nov-2026): una pantalla con cookie de kiosco de www (GET /puerta/kiosco) entra en solo lectura sin Google.
test('auth-gate: kiosco reconocido por /puerta/estado entra en solo lectura; si no, Google', () => {
  const src = fs.readFileSync(new URL('./auth-gate.js', import.meta.url), 'utf8');
  assert.match(src, /function kioscoOGoogle\(\)/);
  assert.match(src, /fetch\("\/puerta\/estado", \{ credentials:"same-origin"/);
  assert.match(src, /e\.tipo === "kiosco"\) \{ entrarAgente\(\{ name: "kiosco" \}\)/);
  assert.match(src, /\.catch\(kioscoOGoogle\);/);
  assert.doesNotMatch(src, /gateCsrf = String\(e/);   // el kiosco nunca recibe csrf de escritura
});
