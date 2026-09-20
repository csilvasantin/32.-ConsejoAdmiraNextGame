import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./consumo.html', import.meta.url), 'utf8');
const folder = fs.readFileSync(new URL('./consumo/index.html', import.meta.url), 'utf8');
const plural = fs.readFileSync(new URL('./consumos.html', import.meta.url), 'utf8');

test('FLT-100722: /consumo es tablero DeepAgents, no la mesa', () => {
  assert.match(html, /Tablero DeepAgents/);
  assert.match(html, /<html lang="es">/);
  for (const name of ['Neo', 'Trinity', 'Morfeo', 'Oráculo']) {
    assert.match(html, new RegExp(name));
  }
  assert.match(html, /Anthropic/);
  assert.match(html, /Claude Code/);
  assert.match(html, /OpenAI/);
  assert.match(html, /csilva@admira\.com/);
  assert.match(html, /csilvasantin@gmail\.com/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/consumos"/);
  assert.doesNotMatch(html, /id="action-input"/);
  assert.doesNotMatch(html, /council-image/);
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /MTok/);
});

test('FLT-100722: /consumo/ sirve la misma página (no cae al Consejo)', () => {
  assert.equal(folder, html);
});

test('FLT-100722: /consumos plural sigue siendo gasto Yokup — no destruir', () => {
  assert.match(plural, /Consumos por proyecto · Yokup/);
  assert.match(plural, /yokup-espejo/);
  assert.doesNotMatch(plural, /Tablero DeepAgents/);
});
