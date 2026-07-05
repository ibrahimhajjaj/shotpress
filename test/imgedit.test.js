import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parseMasks } from '../src/imgedit.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const exec = (args) => run(process.execPath, [CLI, ...args]).then(
  () => ({ code: 0, stderr: '' }),
  (e) => ({ code: e.code, stderr: e.stderr }),
);

test('parseMasks accepts rects and rejects garbage', () => {
  assert.deepEqual(parseMasks(['10,20,30,40']), [{ x: 10, y: 20, w: 30, h: 40 }]);
  assert.deepEqual(parseMasks([]), []);
  for (const bad of ['10,20,30', 'a,b,c,d', '10,20,-5,40', '10,20,0,40', '1,2,3,4,5']) {
    assert.throws(() => parseMasks([bad]), /--mask/, bad);
  }
});

test('cli rejects bad masks and crops before touching a device', async () => {
  const badMask = await exec(['simshot', 'ios', '--mask', '1,2,3']);
  assert.equal(badMask.code, 2);
  assert.match(badMask.stderr, /--mask/);
  const badCrop = await exec(['simshot', 'ios', '--crop-bottom', '-4']);
  assert.equal(badCrop.code, 2);
  assert.match(badCrop.stderr, /--crop-bottom/);
});
