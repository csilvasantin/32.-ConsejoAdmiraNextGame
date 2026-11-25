import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./windows95/index.html', import.meta.url), 'utf8');
test('#7728: la demo no arranca sola; solo con Inicio → Ejecutar «demo» o ?demo=1', () => {
  assert.match(html, /function start\(\)\{[^\n]*if\(DEMO_URL\) startAttract\(true\); else startDesktop\(\);/);
  assert.match(html, /if\(MODE!=='interactive'\|\|!DEMO_URL\) return;/);
  assert.match(html, /'mi-run':function\(\)\{ openRunDlg\(\); \}/);
  assert.match(html, /cmd==='demo'[^\n]*launchDemo\(\)/);
});
