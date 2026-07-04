import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../src/schema.js';

// Minimal valid project, used as a base that each case tweaks.
function baseProject() {
  return {
    format: 'iphone',
    screens: [
      {
        bg: { type: 'solid', value: '#fff' },
        layers: [{ type: 'device', cx: 0.5, cy: 0.5, kind: 'phone', os: 'ios' }],
      },
    ],
  };
}

function withBg(overrides) {
  const p = baseProject();
  Object.assign(p.screens[0].bg, overrides);
  return p;
}

function withLayer(overrides) {
  const p = baseProject();
  Object.assign(p.screens[0].layers[0], overrides);
  return p;
}

test('valid minimal project passes with no errors or warnings', () => {
  const result = validateProject(baseProject());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

const errorCases = [
  {
    name: 'unknown format errors',
    build: () => {
      const p = baseProject();
      p.format = 'nope';
      return p;
    },
    path: 'format',
  },
  {
    name: 'empty screens array errors',
    build: () => {
      const p = baseProject();
      p.screens = [];
      return p;
    },
    path: 'screens',
  },
  {
    name: 'missing screens errors',
    build: () => ({ format: 'iphone' }),
    path: 'screens',
  },
  {
    name: 'missing bg errors',
    build: () => {
      const p = baseProject();
      delete p.screens[0].bg;
      return p;
    },
    path: 'screens[0].bg',
  },
  {
    name: 'bad bg.type errors',
    build: () => withBg({ type: 'nope' }),
    path: 'screens[0].bg.type',
  },
  {
    name: 'bg.type "image" without bg.image errors',
    build: () => {
      const p = baseProject();
      p.screens[0].bg = { type: 'image' };
      return p;
    },
    path: 'screens[0].bg.image',
  },
  {
    name: 'unknown layer type errors',
    build: () => withLayer({ type: 'nope' }),
    path: 'screens[0].layers[0].type',
  },
  {
    name: 'non-numeric cx errors',
    build: () => withLayer({ cx: 'a' }),
    path: 'screens[0].layers[0]',
  },
  {
    name: 'non-numeric cy errors',
    build: () => withLayer({ cy: 'a' }),
    path: 'screens[0].layers[0]',
  },
  {
    name: 'non-numeric optional scale errors',
    build: () => withLayer({ scale: 'big' }),
    path: 'screens[0].layers[0].scale',
  },
  {
    name: 'non-numeric optional rot errors',
    build: () => withLayer({ rot: 'big' }),
    path: 'screens[0].layers[0].rot',
  },
  {
    name: 'device.kind enum violation errors',
    build: () => withLayer({ kind: 'nope' }),
    path: 'screens[0].layers[0].kind',
  },
  {
    name: 'device.os enum violation errors',
    build: () => withLayer({ os: 'nope' }),
    path: 'screens[0].layers[0].os',
  },
  {
    name: 'device.treatment enum violation errors',
    build: () => withLayer({ treatment: 'nope' }),
    path: 'screens[0].layers[0].treatment',
  },
  {
    name: 'device.notch enum violation errors',
    build: () => withLayer({ notch: 'nope' }),
    path: 'screens[0].layers[0].notch',
  },
  {
    name: 'text layer without string text errors',
    build: () => {
      const p = baseProject();
      p.screens[0].layers[0] = { type: 'text', cx: 0.5, cy: 0.5, text: 123 };
      return p;
    },
    path: 'screens[0].layers[0].text',
  },
];

for (const { name, build, path } of errorCases) {
  test(name, () => {
    const result = validateProject(build());
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.path === path),
      `expected an error at path "${path}", got: ${JSON.stringify(result.errors)}`
    );
  });
}

test('weird color strings produce warnings, not errors', () => {
  const result = validateProject(withBg({ value: 'not-a-color-really-123' }));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.warnings.some((w) => w.path === 'screens[0].bg.value'),
    `expected a warning at screens[0].bg.value, got: ${JSON.stringify(result.warnings)}`
  );
});

test('valid CSS color rgba(0,0,0,.5) does not warn', () => {
  const result = validateProject(withBg({ value: 'rgba(0,0,0,.5)' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test('valid CSS gradient does not warn', () => {
  const result = validateProject(
    withBg({ type: 'gradient', value: 'linear-gradient(to bottom, #fff, #000)' })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});
