import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, migrateLegacyLayout, resizePair, moveModule, IDS } from './assets/scumm-layout.js';

test('saved layout cannot lose or duplicate a module; bad storage recovers safely', () => {
  assert.deepEqual(normalizeLayout(null).order, ['verbos','accesos','previos']);
  assert.deepEqual(normalizeLayout(null).hidden, ['accesos','previos']);
  assert.equal(normalizeLayout(null).height, 168);
  const layout = normalizeLayout({order:['previos','previos','invalid'], hidden:['accesos','invalid'], weights:{verbos:NaN,accesos:-1},height:999999});
  assert.deepEqual(layout.order,['previos','verbos','accesos']);
  assert.ok(layout.hidden.includes('accesos'));
  assert.equal(layout.weights.verbos,100); assert.equal(layout.height,600);
});

test('resizing visible neighbours conserves their space and leaves a hidden block intact', () => {
  const weights = {verbos:2,accesos:1,previos:3};
  const resized = resizePair(weights,'verbos','previos',.7);
  assert.equal(resized.verbos,3.5); assert.ok(Math.abs(resized.previos-1.5)<1e-10);
  assert.equal(resized.accesos,1); assert.deepEqual(weights,{verbos:2,accesos:1,previos:3});
  assert.equal(resizePair(weights,'verbos','previos',9).verbos,4.25);
});

test('moving works in both directions without losing closed blocks', () => {
  const order = ['verbos','accesos','previos'];
  assert.deepEqual(moveModule(order,'verbos','previos'),['accesos','previos','verbos']);
  assert.deepEqual(moveModule(order,'previos','verbos'),['previos','verbos','accesos']);
  assert.deepEqual(moveModule(order,'unknown','verbos'),order);
});

test('v7 defaults: Accesos icons inside Verbos, Accesos module + Previos hidden, compact', () => {
  const d = normalizeLayout();
  assert.deepEqual(IDS, ['verbos','accesos','previos']);
  assert.deepEqual(d.order, ['verbos','accesos','previos']);
  assert.deepEqual(d.hidden, ['accesos','previos']);
  assert.deepEqual(d.weights, {verbos:100, accesos:1, previos:40});
  assert.equal(d.height, 168);
});

test('normalizeLayout always keeps Accesos module hidden (icons live in Verbos)', () => {
  const shown = normalizeLayout({hidden:[], order:['verbos','accesos','previos']});
  assert.ok(shown.hidden.includes('accesos'));
  const onlyPrevios = normalizeLayout({hidden:['previos']});
  assert.ok(onlyPrevios.hidden.includes('accesos'));
  assert.ok(onlyPrevios.hidden.includes('previos'));
});

test('v4/v5/v6 stacked or two-module row migrate to integrated single bar', () => {
  assert.deepEqual(normalizeLayout().weights,{verbos:100,accesos:1,previos:40});
  const stacked={weights:{verbos:62,accesos:38,previos:40},height:236,hidden:['previos'],order:['verbos','accesos','previos']};
  const m1=migrateLegacyLayout(stacked);
  assert.deepEqual(m1.weights,{verbos:100,accesos:1,previos:40});
  assert.deepEqual(m1.hidden,['accesos','previos']);
  assert.equal(m1.height,168);
  assert.deepEqual(m1.order,['verbos','accesos','previos']);
  const row={weights:{verbos:58,accesos:42,previos:40},height:210,hidden:['previos'],order:['verbos','accesos','previos']};
  const m2=migrateLegacyLayout(row);
  assert.deepEqual(m2.hidden,['accesos','previos']);
  assert.equal(m2.height,168);
  assert.deepEqual(m2.weights,normalizeLayout().weights);
  const side={weights:{verbos:22,accesos:22,previos:56},height:294,order:['accesos','verbos','previos']};
  const m3=migrateLegacyLayout(side);
  assert.deepEqual(m3.order,['verbos','accesos','previos']);
  assert.deepEqual(m3.hidden,['accesos','previos']);
  const thirds={weights:{verbos:1,accesos:1,previos:1},height:320,hidden:[]};
  const m4=migrateLegacyLayout(thirds);
  assert.deepEqual(m4.weights,normalizeLayout().weights);
  assert.deepEqual(m4.hidden,['accesos','previos']);
});
