import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameLayer, TREATMENTS_3D, renderDevices3d } from '../src/device3d.js';

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

test('only plain/angled treatments are eligible for a model3d render', () => {
  assert.ok(TREATMENTS_3D.has('plain') && TREATMENTS_3D.has('angled') && TREATMENTS_3D.has(undefined));
  assert.ok(!TREATMENTS_3D.has('bleed') && !TREATMENTS_3D.has('duo'));
});

// a minimal box glb (own geometry) so the e2e exercises the real GLTF load path
function boxGlbDataUrl() {
  const P = new Float32Array([-0.5, -1, -0.1, 0.5, -1, -0.1, 0.5, 1, -0.1, -0.5, 1, -0.1, -0.5, -1, 0.1, 0.5, -1, 0.1, 0.5, 1, 0.1, -0.5, 1, 0.1]);
  const I = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]);
  const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(I.buffer)]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, -1, -0.1], max: [0.5, 1, 0.1] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 96, byteLength: 72, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return 'data:model/gltf-binary;base64,' + Buffer.concat([header, jh, json, bh, bin]).toString('base64');
}

test('renders a user glTF model to a PNG data URL', { skip: !process.env.SHOTPRESS_E2E && 'set SHOTPRESS_E2E=1' }, async () => {
  const [res] = await renderDevices3d([{ kind: 'phone', model3d: boxGlbDataUrl(), rx3d: 5, ry3d: -16, screenshot: null }], { px: 500 });
  assert.ok(res.dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(res.dataUrl.length > 5000, 'expected a non-empty render');
});
