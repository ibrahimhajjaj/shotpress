import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverExternalPacks, loadPackFile } from '../src/external-packs.js';
import { packList } from '../src/packs.js';

const template = async () => JSON.parse(await readFile(new URL('../examples/shotpress-pack-sample/pack.json', import.meta.url), 'utf8')).template;

async function fixtureTree(entries) {
  const root = await mkdtemp(path.join(tmpdir(), 'shotpress-packs-'));
  for (const [rel, content] of Object.entries(entries)) {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(content));
  }
  return root;
}

test('discovers plain and scoped packs, skips broken ones', async () => {
  const tpl = await template();
  const root = await fixtureTree({
    'node_modules/shotpress-pack-neon/pack.json': { name: 'Neon', category: 'Gaming', template: tpl },
    'node_modules/@acme/shotpress-pack-corp/pack.json': { name: 'Corp', template: tpl },
    'node_modules/shotpress-pack-broken/pack.json': { name: 'Broken', template: { format: 'nope', screens: [] } },
    'node_modules/unrelated-package/pack.json': { name: 'NotAPack', template: tpl },
  });
  const { packs, problems } = discoverExternalPacks(root);
  assert.deepEqual(Object.keys(packs).sort(), ['corp', 'neon']);
  assert.equal(packs.neon.category, 'Gaming');
  assert.equal(packs.corp.source, '@acme/shotpress-pack-corp');
  assert.equal(problems.length, 1);
  assert.match(problems[0].package, /broken/);
});

test('walks up parent directories like npm resolution', async () => {
  const tpl = await template();
  const root = await fixtureTree({
    'node_modules/shotpress-pack-up/pack.json': { name: 'Up', template: tpl },
  });
  const nested = path.join(root, 'apps', 'web');
  await mkdir(nested, { recursive: true });
  const { packs } = discoverExternalPacks(nested);
  assert.ok(packs.up);
});

test('loadPackFile accepts a pack.json or a bare template', async () => {
  const tpl = await template();
  const root = await fixtureTree({ 'wrapped.json': { name: 'W', template: tpl }, 'bare.json': tpl });
  assert.equal(loadPackFile(path.join(root, 'wrapped.json')).name, 'W');
  assert.equal(loadPackFile(path.join(root, 'bare.json')).template.format, tpl.format);
  assert.throws(() => loadPackFile(path.join(root, 'missing.json')));
});

test('packList merges builtins and externals with sources', async () => {
  const tpl = await template();
  const list = packList({ neon: { name: 'Neon', category: 'Gaming', source: 'shotpress-pack-neon', template: tpl } });
  assert.equal(list.filter(p => p.source === 'builtin').length, 9);
  const neon = list.find(p => p.id === 'neon');
  assert.equal(neon.screens, 3);
  assert.equal(neon.source, 'shotpress-pack-neon');
});
