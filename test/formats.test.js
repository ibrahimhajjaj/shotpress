import test from 'node:test';
import assert from 'node:assert/strict';
import { outputSize, formatList, FORMATS } from '../src/formats.js';

test('iphone default output stretches to store-exact size', () => {
  // design 360x780 at native scale (1290/360) rounds to h=2795, which is
  // within 5% of the store's 2796 — so it stretches to the exact store size.
  const result = outputSize(FORMATS.iphone);
  assert.equal(result.w, 1290);
  assert.equal(result.h, 2796);
  assert.equal(result.storeExact, true);
});

test('aphone default output keeps design aspect, not store-exact', () => {
  // 1080x1920 is >5% off from the design aspect at native scale, so the
  // design width wins and the result is not stretched to the store size.
  const result = outputSize(FORMATS.aphone);
  assert.equal(result.w, 1080);
  assert.equal(result.h, 2160);
  assert.equal(result.storeExact, false);
});

test('atablet default output is store-exact', () => {
  const result = outputSize(FORMATS.atablet);
  assert.equal(result.w, 1600);
  assert.equal(result.h, 2560);
  assert.equal(result.storeExact, true);
});

test('feature graphic default output is store-exact', () => {
  const result = outputSize(FORMATS.feature);
  assert.equal(result.w, 1024);
  assert.equal(result.h, 500);
  assert.equal(result.storeExact, true);
});

test('explicit scaleOverride on iphone skips the store stretch', () => {
  const result = outputSize(FORMATS.iphone, 2);
  assert.equal(result.w, 720);
  assert.equal(result.h, 1560);
  assert.equal(result.scale, 2);
  assert.equal(result.storeExact, false);
});

test('formatList returns all 9 formats with id/design/real fields', () => {
  const list = formatList();
  assert.equal(list.length, 9);
  for (const entry of list) {
    assert.equal(typeof entry.id, 'string');
    assert.ok('design' in entry);
    assert.ok('real' in entry);
    assert.equal(typeof entry.design.w, 'number');
    assert.equal(typeof entry.design.h, 'number');
    assert.equal(typeof entry.real.w, 'number');
    assert.equal(typeof entry.real.h, 'number');
  }
  const iphone = list.find((f) => f.id === 'iphone');
  assert.deepEqual(iphone.design, { w: 360, h: 780 });
  assert.deepEqual(iphone.real, { w: 1290, h: 2796 });
});
