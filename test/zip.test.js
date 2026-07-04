import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { zipFiles, zipName } from '../src/zip.js';

test('zipFiles writes a zip with the given entry names and returns path/bytes/entries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'shotpress-zip-'));
  const fileA = path.join(dir, 'one.txt');
  const fileB = path.join(dir, 'two.txt');
  await writeFile(fileA, 'hello');
  await writeFile(fileB, 'world');

  const outPath = zipName(dir, 'out');
  const result = await zipFiles(
    [
      { path: fileA, name: 'a/one.txt' },
      { path: fileB, name: 'two.txt' },
    ],
    outPath
  );

  assert.equal(result.path, outPath);
  assert.equal(result.entries, 2);
  assert.equal(typeof result.bytes, 'number');
  assert.ok(result.bytes > 0);

  const buf = await readFile(outPath);
  const zip = await JSZip.loadAsync(buf);

  // jszip auto-creates an implicit directory entry for "a/one.txt", so the
  // archive itself has 3 entries even though only 2 files were zipped.
  const names = Object.keys(zip.files);
  assert.equal(names.length, 3);
  assert.ok(names.includes('a/'));
  assert.ok(names.includes('a/one.txt'));
  assert.ok(names.includes('two.txt'));

  const fileEntries = names.filter((n) => !zip.files[n].dir);
  assert.equal(fileEntries.length, 2);

  const contentA = await zip.files['a/one.txt'].async('string');
  const contentB = await zip.files['two.txt'].async('string');
  assert.equal(contentA, 'hello');
  assert.equal(contentB, 'world');
});

test('zipName joins outDir and base into a .zip path', () => {
  const result = zipName('/tmp/some-dir', 'my-export');
  assert.equal(result, path.join('/tmp/some-dir', 'my-export.zip'));
});
