import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameLayer, KINDS_3D, TREATMENTS_3D, renderDevices3d } from '../src/device3d.js';

test('frameLayer swaps a device for a contain-fit image layer at the same spot', () => {
  const dev = { id: 'd', type: 'device', cx: 180, cy: 470, scale: 0.82, kind: 'phone', rot: 0 };
  const img = frameLayer(dev, 'data:image/png;base64,AAAA');
  assert.equal(img.type, 'image');
  assert.equal(img.id, 'd');
  assert.equal(img.cx, 180);
  assert.equal(img.cy, 470);
  assert.equal(img.fit, 'contain'); // else the tall device PNG would be cropped
  assert.ok(img.w0 > 0);
  assert.equal(img.src, 'data:image/png;base64,AAAA');
});

test('only phones/tablets in plain/angled treatments are eligible for 3D', () => {
  assert.ok(KINDS_3D.has('phone') && KINDS_3D.has('tablet'));
  assert.ok(!KINDS_3D.has('mac') && !KINDS_3D.has('watch'));
  assert.ok(TREATMENTS_3D.has('plain') && TREATMENTS_3D.has(undefined));
  assert.ok(!TREATMENTS_3D.has('bleed') && !TREATMENTS_3D.has('duo'));
});

test('renders a real 3D device to a PNG data URL', { skip: !process.env.SHOTPRESS_E2E && 'set SHOTPRESS_E2E=1' }, async () => {
  const [res] = await renderDevices3d([{ kind: 'phone', bezel: 'black', rx3d: 5, ry3d: -16, screenshot: null }], { px: 500 });
  assert.ok(res.dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(res.dataUrl.length > 5000, 'expected a non-empty render');
});
