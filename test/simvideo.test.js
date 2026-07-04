import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));

const exec = (args) => run(process.execPath, [CLI, ...args]).then(
  () => ({ code: 0, stderr: '' }),
  (e) => ({ code: e.code, stderr: e.stderr }),
);

test('rejects non-numeric and out-of-range durations before touching a device', async () => {
  for (const bad of ['abc', '0', '-5', '121', '2.5']) {
    const { code, stderr } = await exec(['simshot', 'ios', '--video', '--duration', bad]);
    assert.equal(code, 2, `--duration ${bad}`);
    assert.match(stderr, /--duration/);
  }
});

test('rejects unknown platforms with --video', async () => {
  const { code, stderr } = await exec(['simshot', 'windows', '--video']);
  assert.equal(code, 2);
  assert.match(stderr, /ios or android/);
});
