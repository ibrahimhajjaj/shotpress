import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProject, POSES } from '../src/resolve.js';

const base = (extra = {}) => ({
  format: 'iphone',
  screens: [{ bg: { type: 'solid', value: '#000', pattern: 'none', image: null }, layers: [{ id: 'h', type: 'text', cx: 180, cy: 100, text: 'Hi' }] }],
  ...extra,
});

test('a project with no design system is returned untouched', () => {
  const p = base();
  assert.equal(resolveProject(p), p); // same reference, no clone
});

test('tokens expand in every string (brand, bg, layers), undefined @refs stay', () => {
  const p = base({
    tokens: { accent: '#2a6fdb' },
    brand: { accent: '@accent' },
    screens: [{ bg: { type: 'gradient', value: 'linear-gradient(@accent,#000)', pattern: 'none', image: null }, layers: [{ id: 'h', type: 'text', cx: 180, cy: 100, color: '@accent', text: 'ping @someone' }] }],
  });
  const r = resolveProject(p);
  assert.equal(r.brand.accent, '#2a6fdb');
  assert.equal(r.screens[0].bg.value, 'linear-gradient(#2a6fdb,#000)');
  assert.equal(r.screens[0].layers[0].color, '#2a6fdb');
  assert.equal(r.screens[0].layers[0].text, 'ping @someone'); // no such token, left alone
  assert.ok(!('tokens' in r));
});

test('styles fill as defaults, the layer wins', () => {
  const p = base({
    styles: { eyebrow: { fontSize: 17, color: '#aaa', weight: 700 } },
    screens: [{ bg: { type: 'solid', value: '#000', pattern: 'none', image: null }, layers: [{ id: 'e', type: 'text', cx: 1, cy: 1, style: 'eyebrow', color: '#fff' }] }],
  });
  const l = resolveProject(p).screens[0].layers[0];
  assert.equal(l.fontSize, 17);       // from the preset
  assert.equal(l.weight, 700);        // from the preset
  assert.equal(l.color, '#fff');      // the layer's own value wins
  assert.ok(!('style' in l));
});

test('decorations are prepended (behind content) to every screen with unique ids', () => {
  const p = base({
    decorations: [{ type: 'shape', shape: 'ellipse', cx: 300, cy: 120, w0: 200, h0: 200, fill: '#333' }],
    screens: [
      { bg: { type: 'solid', value: '#000', pattern: 'none', image: null }, layers: [{ id: 'a', type: 'text', cx: 1, cy: 1, text: 'A' }] },
      { bg: { type: 'solid', value: '#000', pattern: 'none', image: null }, layers: [{ id: 'b', type: 'text', cx: 1, cy: 1, text: 'B' }] },
    ],
  });
  const r = resolveProject(p);
  assert.equal(r.screens[0].layers.length, 2);
  assert.equal(r.screens[0].layers[0].type, 'shape'); // drawn first = behind
  assert.notEqual(r.screens[0].layers[0].id, r.screens[1].layers[0].id); // unique per screen
});

test('named device pose expands to rx3d/ry3d', () => {
  const p = base({ screens: [{ bg: { type: 'solid', value: '#000', pattern: 'none', image: null }, layers: [{ id: 'd', type: 'device', cx: 180, cy: 400, kind: 'phone', os: 'ios', pose: 'hero-left' }] }] });
  const d = resolveProject(p).screens[0].layers[0];
  assert.deepEqual({ rx3d: d.rx3d, ry3d: d.ry3d }, POSES['hero-left']);
  assert.ok(!('pose' in d));
});
