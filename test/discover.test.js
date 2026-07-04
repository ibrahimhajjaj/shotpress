import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, locsFromSitemap, mergeRoutes } from '../src/discover.js';

const BASE = 'https://example.com';

test('normalizePath', async (t) => {
  const cases = [
    ['strips hash', '/pricing#top', '/pricing'],
    ['strips query', '/pricing?ref=nav', '/pricing'],
    ['strips both hash and query', '/pricing?ref=nav#top', '/pricing'],
    ['strips trailing slash', '/blog/', '/blog'],
    ['keeps root as /', '/', '/'],
    ['keeps root when given as bare origin', 'https://example.com', '/'],
    ['lowercases pathname', '/Pricing/Plans', '/pricing/plans'],
    ['resolves relative to base', 'about', '/about'],
    ['excludes .png', '/logo.png', null],
    ['excludes .css', '/assets/style.css', null],
    ['excludes .js', '/bundle.js', null],
    ['excludes .pdf', '/whitepaper.pdf', null],
    ['excludes cross-origin http(s) links', 'https://other.com/pricing', null],
    ['excludes mailto', 'mailto:a@b.com', null],
    ['excludes tel', 'tel:+123456789', null],
  ];
  for (const [name, input, expected] of cases) {
    await t.test(name, () => {
      assert.equal(normalizePath(input, BASE), expected);
    });
  }
});

test('locsFromSitemap', async (t) => {
  await t.test('parses <loc> entries and normalizes them', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://example.com/pricing</loc></url>
      <url><loc>https://example.com/about/</loc></url>
    </urlset>`;
    assert.deepEqual(locsFromSitemap(xml, BASE), ['/pricing', '/about']);
  });

  await t.test('drops cross-origin locs', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/pricing</loc></url>
      <url><loc>https://other.com/features</loc></url>
    </urlset>`;
    assert.deepEqual(locsFromSitemap(xml, BASE), ['/pricing']);
  });

  await t.test('returns nothing for a sitemap with no locs', () => {
    assert.deepEqual(locsFromSitemap('<urlset></urlset>', BASE), []);
  });
});

test('mergeRoutes', async (t) => {
  await t.test('always includes / even with empty batches', () => {
    const { routes, sources } = mergeRoutes([['sitemap', []], ['links', []], ['probes', []]], 8);
    assert.deepEqual(routes, ['/']);
    assert.deepEqual(sources, { sitemap: 0, links: 0, probes: 0 });
  });

  await t.test('dedupes across and within batches, preserving priority order', () => {
    const { routes, sources } = mergeRoutes([
      ['sitemap', ['/pricing', '/about', '/pricing']],
      ['links', ['/about', '/features']],
      ['probes', ['/login']],
    ], 8);
    assert.deepEqual(routes, ['/', '/pricing', '/about', '/features', '/login']);
    assert.deepEqual(sources, { sitemap: 2, links: 1, probes: 1 });
  });

  await t.test('caps total routes at maxRoutes', () => {
    const { routes, sources } = mergeRoutes([
      ['sitemap', ['/a', '/b', '/c']],
      ['links', ['/d', '/e']],
      ['probes', ['/f']],
    ], 3);
    assert.deepEqual(routes, ['/', '/a', '/b']);
    assert.deepEqual(sources, { sitemap: 2, links: 0, probes: 0 });
  });
});
