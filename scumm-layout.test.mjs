import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, migrateLegacyLayout, resizePair, moveModule } from './assets/scumm-layout.js';

test('saved layout cannot lose or duplicate a module; bad storage recovers safely', () => {
  assert.deepEqual(normalizeLayout(null).order, ['verbos','accesos','previos']);
  assert.deepEqual(normalizeLayout(null).hidden, ['previos']);
  assert.equal(normalizeLayout(null).height, 260);
  const layout = normalizeLayout({order:['previos','previos','invalid'], hidden:['accesos','invalid'], weights:{verbos:NaN,accesos:-1},height:999999});
  assert.deepEqual(layout.order,['previos','verbos','accesos']);
  assert.deepEqual(layout.hidden,['accesos']);
  assert.equal(layout.weights.verbos,62); assert.equal(layout.weights.accesos,38); assert.equal(layout.height,600);
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

test('v4 defaults: Accesos below Verbos, Previos hidden, compact height', () => {
  const d = normalizeLayout();
  assert.deepEqual(d.order, ['verbos','accesos','previos']);
  assert.deepEqual(d.hidden, ['previos']);
  assert.deepEqual(d.weights, {verbos:62, accesos:38, previos:40});
  assert.equal(d.height, 260);
});

test('legacy side-by-side migrates to stacked Verbos→Accesos with Previos hidden', () => {
  assert.deepEqual(normalizeLayout().weights,{verbos:62,accesos:38,previos:40});
  const old={weights:{verbos:1,accesos:1,previos:1},height:320,hidden:[]};
  const migrated=migrateLegacyLayout(old);
  assert.deepEqual(migrated.weights,normalizeLayout().weights);
  assert.deepEqual(migrated.hidden,['previos']);
  assert.equal(migrated.height,260);
  assert.deepEqual(migrated.order,['verbos','accesos','previos']);
  const side={weights:{verbos:22,accesos:22,previos:56},height:294};
  const m2=migrateLegacyLayout(side);
  assert.deepEqual(m2.weights,normalizeLayout().weights);
  assert.deepEqual(m2.hidden,['previos']);
});
