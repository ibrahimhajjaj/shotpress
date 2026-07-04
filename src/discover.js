import { launchBrowser } from './harness.js';

const EXT_RE = /\.(png|jpe?g|gif|svg|webp|ico|avif|bmp|css|js|mjs|json|xml|pdf|zip|gz|mp4|mp3|wav|woff2?|ttf|eot|txt|csv|rss)$/i;
const PROBE_PATHS = ['/pricing', '/features', '/about', '/dashboard', '/settings', '/login', '/blog', '/docs'];

// Same-origin pathname, normalized for dedup: no hash/query, no trailing
// slash (except root), lowercase, http(s) only, no asset-extension paths.
export function normalizePath(href, base) {
  const baseURL = base instanceof URL ? base : new URL(base);
  let u;
  try { u = new URL(href, baseURL); } catch { return null; }
  if (u.origin !== baseURL.origin || !/^https?:$/.test(u.protocol)) return null;
  let pathname = u.pathname.toLowerCase();
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  if (EXT_RE.test(pathname)) return null;
  return pathname || '/';
}

// No XML dependency — sitemaps are regular enough for a <loc> pull.
export function locsFromSitemap(xml, base) {
  const out = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const p = normalizePath(m[1], base);
    if (p) out.push(p);
  }
  return out;
}

// Combines discovery batches in priority order (sitemap > links > probes),
// deduped, capped at maxRoutes, with '/' always present.
export function mergeRoutes(batches, maxRoutes) {
  const routes = new Set(['/']);
  const sources = {};
  for (const [key, list] of batches) {
    sources[key] = 0;
    if (routes.size >= maxRoutes) continue;
    for (const p of list) {
      if (routes.size >= maxRoutes) break;
      if (routes.has(p)) continue;
      routes.add(p);
      sources[key]++;
    }
  }
  return { routes: [...routes], sources };
}

async function fromSitemap(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(new URL('/sitemap.xml', base), { signal: controller.signal });
    if (!res.ok) return [];
    return locsFromSitemap(await res.text(), base);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const linksOnPage = (page) =>
  page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));

// Depth-2 BFS: the start page, then up to 3 of the pages it pointed to.
async function fromLinks(page, base) {
  const found = new Set();
  await page.goto(base.href, { waitUntil: 'load', timeout: 30_000 });
  for (const href of await linksOnPage(page)) {
    const p = normalizePath(href, base);
    if (p) found.add(p);
  }

  const visited = new Set([normalizePath(base.href, base)]);
  const toVisit = [...found].filter(p => !visited.has(p)).slice(0, 3);
  for (const p of toVisit) {
    visited.add(p);
    try {
      await page.goto(new URL(p, base).href, { waitUntil: 'load', timeout: 30_000 });
      for (const href of await linksOnPage(page)) {
        const q = normalizePath(href, base);
        if (q) found.add(q);
      }
    } catch { /* dead or blocked link — skip it */ }
  }
  return [...found];
}

async function fromProbes(page, base, skip) {
  const found = [];
  for (const p of PROBE_PATHS) {
    if (skip.has(p)) continue;
    try {
      const res = await page.request.get(new URL(p, base).href, { maxRedirects: 0 });
      if (res.status() >= 200 && res.status() < 300) found.push(p);
    } catch { /* unreachable — treat as absent */ }
  }
  return found;
}

export async function discoverRoutes(url, opts = {}) {
  const { maxRoutes = 8, browser = null } = opts;
  const base = new URL(url);

  const sitemapPaths = await fromSitemap(base);
  let linkPaths = [];
  let probePaths = [];

  const foundSoFar = (extra) => new Set(['/', ...sitemapPaths, ...extra]).size;

  if (foundSoFar([]) < maxRoutes) {
    const ownBrowser = browser ? null : await launchBrowser(null);
    const b = browser || ownBrowser;
    const context = await b.newContext();
    try {
      const page = await context.newPage();
      linkPaths = await fromLinks(page, base);
      if (foundSoFar(linkPaths) < maxRoutes) {
        probePaths = await fromProbes(page, base, new Set(['/', ...sitemapPaths, ...linkPaths]));
      }
    } finally {
      await context.close();
      if (ownBrowser) await ownBrowser.close().catch(() => {});
    }
  }

  return mergeRoutes([
    ['sitemap', sitemapPaths],
    ['links', linkPaths],
    ['probes', probePaths],
  ], maxRoutes);
}
