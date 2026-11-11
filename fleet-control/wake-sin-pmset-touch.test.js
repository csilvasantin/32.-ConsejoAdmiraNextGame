// /api/wake (macOS): sin `pmset touch` (exige root y fallaba) y con caffeinate -u -d -t 180 (Carlos, 11-nov-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const wake = src.slice(src.indexOf("if (url === '/api/wake'"), src.indexOf("pasos.push('sin SSH por Tailscale')"));

test('despertar en macOS no usa pmset touch y mantiene la pantalla 3 min', () => {
  assert.ok(wake.length > 0);
  assert.doesNotMatch(wake, /pmset touch/);
  assert.match(wake, /plat === 'macos' \? '\(nohup caffeinate -u -d -t 180 >\/dev\/null 2>&1 &\); echo pantalla despierta'/);
});
