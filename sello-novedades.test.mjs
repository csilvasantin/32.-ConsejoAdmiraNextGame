import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

test('novedades.json has r10 notes for the seal tooltip', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./novedades.json', import.meta.url), 'utf8'));
  const key = Object.keys(raw).find(k => k.includes('.r10.')) || Object.keys(raw)[0];
  assert.ok(key, 'need an r10 entry');
  const lines = raw[key];
  assert.ok(Array.isArray(lines) && lines.length >= 3);
  assert.ok(lines.some(l => /abajo|mesa/i.test(l)));
  assert.ok(lines.some(l => /Accesos|integrad/i.test(l)));
  assert.ok(lines.some(l => /Previos|conversaci/i.test(l)));
  assert.ok(lines.some(l => /tooltip|novedades|sello/i.test(l)));
});

test('deploy.sh embeds novedades into version.json', () => {
  const sh = fs.readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  assert.match(sh, /novedades\.json/);
  assert.match(sh, /novedades:\$n/);
});

test('sello-novedades.js paints .rail-ver with SCUMM popover', () => {
  const js = fs.readFileSync(new URL('./assets/sello-novedades.js', import.meta.url), 'utf8');
  assert.match(js, /\.rail-ver/);
  assert.match(js, /sello-tip/);
  assert.match(js, /novedades/);
  assert.match(js, /version\.json/);
  assert.match(js, /title/); // native fallback
});
