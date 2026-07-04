import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyVariant, checkVariantSpec, emitVariants } from '../src/variants.js';

const base = () => JSON.parse(JSON.stringify({
  format: 'iphone',
  brand: { logo: null, appName: 'App', colors: ['#6d5cf5'], accent: '#6d5cf5', bezel: 'black', clayColor: '#9b8cff' },
  screens: [1, 2, 3].map(n => ({
    bg: { type: 'solid', value: '#101018', pattern: 'none', image: null },
    layers: [{ id: `t${n}`, type: 'text', cx: 180, cy: 120, scale: 1, rot: 0, text: `Screen ${n}`, font: "'Space Grotesk', sans-serif", fontSize: 30, weight: 700, color: '#ffffff', align: 'center', width: 300, lineHeight: 1.1, accent: '#c9beff', scrim: 'none' }],
  })),
}));

test('applyVariant replaces screens by 1-based index and patches brand', () => {
  const alt = base().screens[0];
  alt.layers[0].text = 'Different hook';
  const out = applyVariant(base(), { id: 'b', screens: { 1: alt }, brand: { accent: '#ff5a3c' } });
  assert.equal(out.screens[0].layers[0].text, 'Different hook');
  assert.equal(out.screens[1].layers[0].text, 'Screen 2');
  assert.equal(out.brand.accent, '#ff5a3c');
  assert.equal(out.brand.appName, 'App');
});

test('applyVariant rejects out-of-range screens', () => {
  assert.throws(() => applyVariant(base(), { id: 'x', screens: { 9: base().screens[0] } }), /out of range/);
});

test('checkVariantSpec enforces ids and non-empty changes', () => {
  assert.throws(() => checkVariantSpec({ variants: [] }));
  assert.throws(() => checkVariantSpec({ variants: [{ id: 'a', screens: { 1: {} } }, { id: 'a', screens: { 1: {} } }] }), /duplicate/);
  assert.throws(() => checkVariantSpec({ variants: [{ id: 'a' }] }), /changes nothing/);
});

test('emitVariants writes valid variant files with lint counts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'shotpress-variants-'));
  const alt = base().screens[0];
  alt.layers[0].text = 'Faster *everything*';
  const out = await emitVariants(base(), { variants: [{ id: 'b', screens: { 1: alt } }] }, { outDir: dir, baseName: 'proj' });
  assert.equal(out.length, 1);
  assert.equal(out[0].changedScreens[0], 1);
  const written = JSON.parse(await readFile(out[0].path, 'utf8'));
  assert.equal(written.screens[0].layers[0].text, 'Faster *everything*');
});

test('emitVariants hard-fails on structurally invalid variants', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'shotpress-variants-'));
  await assert.rejects(
    emitVariants(base(), { variants: [{ id: 'bad', screens: { 1: { bg: { type: 'nope' }, layers: [] } } }] }, { outDir: dir, baseName: 'p' }),
    /invalid/,
  );
});
