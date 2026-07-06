import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorKinds, makeDecor } from '../src/decor.js';

test('lists every kind with a usage', () => {
  const kinds = decorKinds();
  const ids = kinds.map(k => k.id);
  for (const want of ['blob', 'glow', 'rings', 'waves', 'grain', 'mesh']) assert.ok(ids.includes(want), `missing ${want}`);
  for (const k of kinds) assert.ok(['layer', 'overlay', 'background'].includes(k.usage), `${k.id} bad usage ${k.usage}`);
});

test('every kind renders valid self-contained svg', () => {
  for (const { id } of decorKinds()) {
    const d = makeDecor(id, { color: '#2a6fdb', image: 'data:image/png;base64,iVBORw0KGgo=' });
    assert.ok(d.svg.startsWith('<svg') && d.svg.includes('viewBox'), `${id} not an svg`);
    assert.ok(d.dataUrl.startsWith('data:image/svg+xml;base64,'), `${id} bad data url`);
    // self-contained: no external resource loads (the xmlns namespace URL aside)
    assert.ok(!/(href|url)\s*[=(]\s*["']?https?:/i.test(d.svg), `${id} reaches for a network resource`);
  }
});

test('layer/overlay kinds emit an image layer with src + w0, square', () => {
  const blob = makeDecor('blob', { color: '#2a6fdb' });
  assert.equal(blob.usage, 'layer');
  assert.equal(blob.layer.type, 'image');
  assert.ok(blob.layer.src.startsWith('data:'), 'src should hold the image');
  assert.equal(blob.layer.image, undefined, 'image field is for devices/bg, not image layers');
  assert.ok(blob.layer.w0 > 0, 'needs w0 to size');
  assert.equal(blob.width, blob.height, 'layer art is square');
});

test('background kind emits a bg, not a layer', () => {
  const mesh = makeDecor('mesh', { color: '#2a6fdb' });
  assert.equal(mesh.usage, 'background');
  assert.equal(mesh.bg.type, 'image');
  assert.ok(mesh.bg.image.startsWith('data:'));
  assert.equal(mesh.layer, undefined);
});

test('grain covers the canvas as the larger-dimension square', () => {
  const grain = makeDecor('grain', { format: 'iphone' });
  assert.equal(grain.width, 780); // max(360, 780) so a square overlay blankets the canvas
});

test('same seed is byte-identical, different seed differs', () => {
  const a = makeDecor('blob', { color: '#2a6fdb', seed: 5 }).svg;
  const b = makeDecor('blob', { color: '#2a6fdb', seed: 5 }).svg;
  const c = makeDecor('blob', { color: '#2a6fdb', seed: 6 }).svg;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('mask clips a supplied image and errors without one', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const m = makeDecor('mask', { image: png, shape: 'circle', color: '#2a6fdb' });
  assert.ok(m.svg.includes('clipPath') && m.svg.includes('<image'));
  assert.ok(m.layer.src.startsWith('data:image/svg+xml'));
  assert.throws(() => makeDecor('mask', {}), /needs --image/);
});

test('rejects an unknown kind and a bad colour', () => {
  assert.throws(() => makeDecor('nope', {}), /unknown decor kind/);
  assert.throws(() => makeDecor('blob', { color: 'periwinkle' }), /colour must be a hex/);
});
