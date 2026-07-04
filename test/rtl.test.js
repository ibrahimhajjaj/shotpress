import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorProject } from '../src/rtl.js';

const base = () => ({
  format: 'iphone', // W = 360
  brand: { logo: null, appName: 'App', colors: [], accent: '#6d5cf5', bezel: 'black', clayColor: '#9b8cff' },
  screens: [{
    bg: { type: 'gradient', value: 'linear-gradient(90deg,#111,#333)', pattern: 'none', image: null, span: { idx: 0, len: 3 } },
    layers: [
      { id: 't', type: 'text', cx: 100, cy: 120, scale: 1, rot: 4, text: 'هلا', font: "'Cairo', sans-serif", fontSize: 30, weight: 700, color: '#fff', align: 'left', width: 300, lineHeight: 1.1, accent: '#c9beff', scrim: 'none' },
      { id: 'd', type: 'device', cx: 240, cy: 520, scale: 0.9, rot: -8, rx3d: 8, ry3d: -16, kind: 'phone', os: 'ios', treatment: 'plain', image: 'data:image/png;base64,abc' },
      { id: 'c', type: 'callout', cx: 180, cy: 300, scale: 1, rot: 0, text: 'هنا', arrow: 'left', cstyle: 'accent', accent: '#6d5cf5' },
      { id: 'r', type: 'rating', cx: 180, cy: 200, scale: 1, rot: 0, stars: 5, value: '4.9', showValue: true, color: '#ffc53d', textColor: '#fff' },
    ],
  }],
});

test('mirror table: cx, rot, ry3d flip; cy, rx3d, sizes, images do not', () => {
  const m = mirrorProject(base());
  const [t, d, c] = m.screens[0].layers;
  assert.equal(t.cx, 260);            // 360 - 100
  assert.equal(d.cx, 120);            // 360 - 240
  assert.equal(t.rot, -4);
  assert.equal(d.rot, 8);
  assert.equal(d.ry3d, 16);
  assert.equal(d.rx3d, 8);            // pitch untouched
  assert.equal(t.cy, 120);
  assert.equal(d.scale, 0.9);
  assert.equal(t.fontSize, 30);
  assert.equal(d.image, 'data:image/png;base64,abc'); // app UI never flips
  assert.equal(t.align, 'right');
  assert.equal(c.arrow, 'right');
});

test('center align and vertical arrows are fixed points', () => {
  const p = base();
  p.screens[0].layers[0].align = 'center';
  p.screens[0].layers[2].arrow = 'down';
  const m = mirrorProject(p);
  assert.equal(m.screens[0].layers[0].align, 'center');
  assert.equal(m.screens[0].layers[2].arrow, 'down');
});

test('spanning background slice order reverses', () => {
  const m = mirrorProject(base());
  assert.equal(m.screens[0].bg.span.idx, 2); // len 3: 0 -> 2
});

test('brand.dir toggles and mirroring is an involution', () => {
  const once = mirrorProject(base());
  assert.equal(once.brand.dir, 'rtl');
  const twice = mirrorProject(once);
  assert.equal(twice.brand.dir, 'ltr');
  const { dir, ...brandTwice } = twice.brand;
  const original = base();
  assert.deepEqual(twice.screens, original.screens);
  assert.deepEqual(brandTwice, original.brand);
});

test('rejects unknown formats', () => {
  assert.throws(() => mirrorProject({ format: 'nope', screens: [] }), /unknown format/);
});
