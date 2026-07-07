import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBrandDefaults } from '../src/harness.js';

test('fills the brand fields the engine assumes, deriving colors from accent', () => {
  const b = withBrandDefaults({ accent: '#123456', bezel: 'white' });
  assert.deepEqual(b.colors, ['#123456']); // else the engine crashes on br.colors.map
  assert.equal(b.clayColor, '#9b8cff');
  assert.equal(b.logo, null);
  assert.equal(b.appName, 'Your App');
  assert.equal(b.bezel, 'white'); // provided value kept
});

test('empty brand still yields a complete, renderable brand', () => {
  const b = withBrandDefaults({});
  assert.ok(Array.isArray(b.colors) && b.colors.length >= 1);
  assert.ok(b.accent && b.bezel && b.clayColor);
});

test('a provided non-empty colors array is preserved', () => {
  const b = withBrandDefaults({ accent: '#111111', colors: ['#111111', '#222222'] });
  assert.deepEqual(b.colors, ['#111111', '#222222']);
});
