import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, migrateLegacyLayout, resizePair, moveModule, IDS } from './assets/scumm-layout.js';

test('saved layout cannot lose or duplicate a module; bad storage recovers safely', () => {
  assert.deepEqual(normalizeLayout(null).order, ['verbos','accesos','previos']);
  assert.deepEqual(normalizeLayout(null).hidden, ['accesos']);
  assert.equal(normalizeLayout(null).height, 220);
  const layout = normalizeLayout({order:['previos','previos','invalid'], hidden:['accesos','invalid'], weights:{verbos:NaN,accesos:-1},height:999999});
  assert.deepEqual(layout.order,['previos','verbos','accesos']);
  assert.ok(layout.hidden.includes('accesos'));
  assert.equal(layout.weights.verbos,44); assert.equal(layout.height,600);
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

test('v8 defaults: Accesos icons in Verbos, Previos visible as third block', () => {
  const d = normalizeLayout();
  assert.deepEqual(IDS, ['verbos','accesos','previos']);
  assert.deepEqual(d.order, ['verbos','accesos','previos']);
  assert.deepEqual(d.hidden, ['accesos']);
  assert.ok(!d.hidden.includes('previos'), 'Previos must be visible');
  assert.deepEqual(d.weights, {verbos:44, accesos:1, previos:56});
  assert.equal(d.height, 220);
});

test('normalizeLayout always keeps Accesos module hidden', () => {
  const shown = normalizeLayout({hidden:[], order:['verbos','accesos','previos']});
  assert.ok(shown.hidden.includes('accesos'));
  assert.ok(!shown.hidden.includes('previos'));
});

test('v4-v7 layouts migrate to Verbos+icons | Previos visible', () => {
  const m1 = migrateLegacyLayout({weights:{verbos:100,accesos:1,previos:40},height:168,hidden:['accesos','previos']});
  assert.deepEqual(m1.hidden, ['accesos']);
  assert.deepEqual(m1.weights, {verbos:44, accesos:1, previos:56});
  assert.equal(m1.height, 220);
  const m2 = migrateLegacyLayout({weights:{verbos:62,accesos:38,previos:40},hidden:['previos']});
  assert.deepEqual(m2.hidden, ['accesos']);
  assert.ok(!m2.hidden.includes('previos'));
  const m3 = migrateLegacyLayout({weights:{verbos:22,accesos:22,previos:56}});
  assert.deepEqual(m3.weights, normalizeLayout().weights);
  assert.deepEqual(m3.hidden, ['accesos']);
});
