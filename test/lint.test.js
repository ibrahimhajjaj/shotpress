import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lintProject } from '../src/lint.js';

const text = (over = {}) => ({
  id: 'u_t', type: 'text', cx: 180, cy: 100, scale: 1, rot: 0,
  text: 'Fast and private', font: "'Space Grotesk', sans-serif", fontSize: 30,
  weight: 700, color: '#ffffff', align: 'center', width: 300, lineHeight: 1.1,
  accent: '#c9beff', scrim: 'none', ...over,
});
const device = (over = {}) => ({
  id: 'u_d', type: 'device', cx: 180, cy: 520, scale: 0.95, rot: 0,
  kind: 'phone', os: 'ios', treatment: 'plain', image: null, ...over,
});
const screen = (layers, bg = 'linear-gradient(165deg,#17102a,#0b0714)') =>
  ({ bg: { type: 'gradient', value: bg, pattern: 'none', image: null }, layers });
const project = (screens) => ({ format: 'iphone', brand: { accent: '#6d5cf5' }, screens });

const rules = (p) => new Set(lintProject(p).findings.map(f => f.rule));

test('clean two-screen set has no findings', () => {
  const p = project([
    screen([text({ fontSize: 48, text: 'Own your *day*' }), { id: 'u_r', type: 'rating', cx: 180, cy: 160, stars: 5, value: '4.9 · 12k', showValue: true, color: '#ffc53d', textColor: '#ffffff' }, device()]),
    screen([text({ text: 'Plan in *seconds*' }), device({ treatment: 'angled' })]),
  ]);
  assert.deepEqual([...rules(p)], []);
});

test('flags missing social proof on 3+ screens', () => {
  const p = project([screen([text(), device()]), screen([text(), device({ treatment: 'bleed' })]), screen([text(), device({ treatment: 'compare' })])]);
  assert.ok(rules(p).has('NO_SOCIAL_PROOF'));
});

test('flags sub-60-real-px body text', () => {
  const p = project([screen([text({ fontSize: 13 })])]);
  assert.ok(rules(p).has('BODY_TOO_SMALL'));
});

test('flags low contrast without scrim, excuses it with scrim', () => {
  const grey = screen([text({ color: '#888888' })], 'linear-gradient(165deg,#777777,#7a7a7a)');
  assert.ok(rules(project([grey])).has('CONTRAST_LOW'));
  const scrimmed = screen([text({ color: '#888888', scrim: 'dark' })], 'linear-gradient(165deg,#777777,#7a7a7a)');
  assert.ok(!rules(project([scrimmed])).has('CONTRAST_LOW'));
});

test('flags three identical compositions in a row', () => {
  const p = project([screen([text(), device()]), screen([text(), device()]), screen([text(), device()])]);
  assert.ok(rules(p).has('COMPOSITION_REPEAT'));
});

test('flags text overlapping a device without scrim', () => {
  const p = project([screen([text({ cy: 520 }), device({ cy: 520 })])]);
  assert.ok(rules(p).has('TEXT_OVER_DEVICE_NO_SCRIM'));
});

test('flags hero smaller than later headlines', () => {
  const p = project([screen([text({ fontSize: 26 })]), screen([text({ fontSize: 44 })])]);
  assert.ok(rules(p).has('HERO_NOT_LARGEST'));
});

test('every shipped pack template lints clean', async () => {
  for (const pack of ['productivity', 'fitness', 'finance', 'social', 'food', 'saas', 'ecommerce', 'ai', 'secure']) {
    const project = JSON.parse(await readFile(new URL(`../templates/${pack}.json`, import.meta.url), 'utf8'));
    const found = [...rules(project)];
    assert.deepEqual(found, [], `${pack} has findings: ${found.join(', ')}`);
  }
});

test('flags an official bezel on the wrong canvas', () => {
  const p = project([screen([device({ frame: 'iphone' })])]);
  p.format = 'ipad';
  assert.ok(rules(p).has('FRAME_KIND_MISMATCH'));
  const ok = project([screen([device({ frame: 'iphone' })])]);
  assert.ok(!rules(ok).has('FRAME_KIND_MISMATCH'));
  const play = project([screen([device({ frame: 'iphone' })])]);
  play.format = 'aphone';
  assert.ok(rules(play).has('FRAME_KIND_MISMATCH'));
});
