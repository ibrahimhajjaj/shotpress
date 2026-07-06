import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchema, schemaMarkdown, buildKitchenSink } from '../src/schema-doc.js';

// stand-in for what harness.introspectLayers returns (engine defaults)
const introspected = {
  device: { type: 'device', fields: { kind: 'phone', os: 'ios', treatment: 'plain', scale: 0.7 } },
  text: { type: 'text', fields: { text: 'x', fontSize: 30, color: '#fff' } },
  rating: { type: 'rating', fields: { stars: 5, value: '4.9' } },
  callout: { type: 'callout', fields: { text: 'x', arrow: 'down' } },
  badge: { type: 'badge', fields: { variant: 'pill', text: 'x' } },
  logo: { type: 'logo', fields: { src: null, w0: 120 } },
  image: { type: 'image', fields: { src: null, w0: 160, fit: 'cover' } },
  shape: { type: 'shape', fields: { shape: 'rect', fill: '#fff', w0: 140, h0: 140 } },
  icon: { type: 'icon', fields: { glyph: '✓', size: 46 } },
  feature: { type: 'feature', fields: { title: 'x', sub: 'y' } },
  heading: { type: 'text', fields: { text: 'x', fontSize: 52 } },
  circle: { type: 'shape', fields: { shape: 'ellipse', w0: 120, h0: 120 } },
  line: { type: 'shape', fields: { shape: 'line', w0: 180, h0: 4 } },
};

test('schema carries every type with fields, defaults, and enums', () => {
  const s = buildSchema(introspected);
  for (const t of ['device', 'text', 'shape', 'icon', 'callout', 'feature']) assert.ok(s.layers[t], `missing ${t}`);
  assert.equal(s.layers.text.fields.fontSize.default, 30);
  assert.deepEqual(s.layers.device.fields.treatment.enum, ['plain', 'bleed', 'angled', 'compare', 'duo', 'pano', 'multi']);
  assert.equal(s.layers.device.fields.kind.enum.includes('phone'), true);
  assert.ok(s.formats.includes('iphone'));
  assert.equal(s.bg.fields.pattern.enum.join(','), 'none,dots,grid,lines');
  assert.deepEqual(Object.keys(s.aliases).sort(), ['circle', 'heading', 'line']);
});

test('markdown renders a table per type', () => {
  const md = schemaMarkdown(buildSchema(introspected));
  assert.ok(md.includes('## `device`'));
  assert.ok(md.includes('| field | type | default |'));
});

test('kitchen sink uses every layer type and validates structurally', () => {
  const ks = buildKitchenSink(introspected, 'iphone');
  const types = new Set(ks.screens.flatMap(s => s.layers.map(l => l.type)));
  for (const t of ['device', 'text', 'rating', 'callout', 'badge', 'logo', 'image', 'shape', 'icon', 'feature']) assert.ok(types.has(t), `kitchen-sink missing ${t}`);
  assert.ok(ks.screens.every(s => s.layers.every(l => Number.isFinite(l.cx) && Number.isFinite(l.cy))));
});
