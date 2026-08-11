import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controlHtml = await readFile(new URL('./index.html', import.meta.url), 'utf8');

const assets = [
  {
    path: '/auth-gate.js',
    file: new URL('../auth-gate.js', import.meta.url),
    release: '20260811-r13',
  },
  {
    path: '/control/fleet-mesh.js',
    file: new URL('./fleet-mesh.js', import.meta.url),
    release: '20260811-r10',
  },
];

test('control enlaza cada asset de autenticación con release y sello de contenido actuales', async () => {
  for (const asset of assets) {
    const bytes = await readFile(asset.file);
    const seal = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const expected = `${asset.path}?v=${asset.release}-${seal}`;
    assert.match(
      controlHtml,
      new RegExp(`(?:src|href)=["']${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`),
      `${asset.path} cambió: actualiza su release y la referencia versionada en control/index.html`,
    );
  }
});
