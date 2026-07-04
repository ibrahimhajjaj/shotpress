import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));

const fixture = {
  format: 'iphone',
  brand: { logo: null, appName: 'E2E', colors: ['#6d5cf5'], accent: '#6d5cf5', bezel: 'black', clayColor: '#9b8cff' },
  screens: [{
    bg: { type: 'gradient', value: 'linear-gradient(165deg,#7b5cff,#c44cff)', pattern: 'none', image: null },
    layers: [
      { id: 'u_t1', type: 'text', cx: 180, cy: 80, scale: 1, rot: 0, text: 'Hello *world*', font: "'Space Grotesk', sans-serif", fontSize: 34, weight: 700, color: '#ffffff', align: 'center', width: 300, lineHeight: 1.05, accent: '#c9beff', scrim: 'none' },
      { id: 'u_d1', type: 'device', cx: 180, cy: 480, scale: 1, rot: 0, kind: 'phone', os: 'ios', orientation: 'portrait', notch: 'auto', rx3d: 0, ry3d: 0, bezel: 'black', treatment: 'plain', image: null, showStatus: true, statusDark: true, accent: '#ffffff' },
    ],
  }],
};

// full browser render; opt in with SHOTPRESS_E2E=1
test('renders a screen at store-exact size', { skip: !process.env.SHOTPRESS_E2E && 'set SHOTPRESS_E2E=1' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'shotpress-e2e-'));
  const spec = path.join(dir, 'project.json');
  await writeFile(spec, JSON.stringify(fixture));

  const { stdout } = await run(process.execPath, [CLI, 'render', spec, '--out', dir, '--json'], { timeout: 120_000 });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].width, 1290);
  assert.equal(manifest.files[0].height, 2796);

  const png = await readFile(manifest.files[0].path);
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 1290);
  assert.equal(png.readUInt32BE(20), 2796);
});
