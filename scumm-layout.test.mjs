import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, migrateLegacyLayout, resizePair, moveModule } from './assets/scumm-layout.js';
test('saved layout cannot lose or duplicate a module; bad storage recovers safely', () => {
  assert.deepEqual(normalizeLayout(null).order, ['verbos','accesos','previos']);
  const layout = normalizeLayout({order:['previos','previos','invalid'], hidden:['accesos','invalid'], weights:{verbos:NaN,accesos:-1},height:999999});
  assert.deepEqual(layout.order,['previos','verbos','accesos']);
  assert.deepEqual(layout.hidden,['accesos']);
  assert.equal(layout.weights.verbos,22); assert.equal(layout.weights.accesos,22); assert.equal(layout.height,600);
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

test('default migration upgrades thirds but preserves manual sizes and later equal-width choices', () => {
  assert.deepEqual(normalizeLayout().weights,{verbos:22,accesos:22,previos:56});
  const old={weights:{verbos:1,accesos:1,previos:1},height:320,hidden:['accesos']};
  const migrated=migrateLegacyLayout(old);
  assert.deepEqual(migrated.weights,normalizeLayout().weights);
  assert.equal(migrated.height,320);assert.deepEqual(migrated.hidden,['accesos']);
  const manual={weights:{verbos:.7,accesos:.8,previos:1.5}};
  assert.deepEqual(migrateLegacyLayout(manual).weights,manual.weights);
  assert.deepEqual(normalizeLayout(old).weights,old.weights);
});
