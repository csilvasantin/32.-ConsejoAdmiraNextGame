import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('wrangler.preview.toml = wrangler.toml salvo la bandeja preview', () => {
  const prod = leer('wrangler.toml');
  const prev = leer('wrangler.preview.toml').split('\n').filter((l) => !l.startsWith('# COPIA') && !l.startsWith('# Única diferencia')).join('\n');
  assert.match(prod, /script_name = "admira-live-bandeja"\n/);
  assert.equal(prev, prod.replace('script_name = "admira-live-bandeja"', 'script_name = "admira-live-bandeja-preview"'));
});
test('ningún wrangler de admira-live-mcp declara migraciones de Durable Objects', () => {
  for (const f of ['wrangler.toml', 'wrangler.preview.toml']) assert.doesNotMatch(leer(f), /\[\[migrations\]\]/);
  for (const f of ['wrangler.bandeja.toml', 'wrangler.bandeja-preview.toml']) assert.match(leer(f), /new_sqlite_classes = \["BandejaConsejo"\]/);
});
