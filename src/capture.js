import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { FORMATS } from './formats.js';
import { launchBrowser, trackForCleanup } from './harness.js';
import { discoverRoutes } from './discover.js';

// Viewports matched to what each store format's device frame displays. The
// captures go straight into device layers, which crop cover-style, so the
// aspect only needs to be close — the numbers below are current-generation
// device CSS viewports.
const CAPTURE_VIEWPORTS = {
  phone_ios: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phone_android: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet_ios: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet_android: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  watch: { viewport: { width: 205, height: 251 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  graphic: { viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

function captureProfile(format) {
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`unknown format "${format}"`);
  if (fmt.kind === 'phone' || fmt.kind === 'tablet') return CAPTURE_VIEWPORTS[`${fmt.kind}_${fmt.os}`];
  return CAPTURE_VIEWPORTS[fmt.kind];
}

const slug = (route) => route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';

export async function captureRoutes(url, opts = {}) {
  const {
    routes = ['/'],
    format = 'iphone',
    outDir = './shotpress-captures',
    dark = false,
    waitSelector = null,
    cookies = null,     // "name=value; name2=value2"
    headers = null,     // { name: value }
    browserPath = null,
    discover = false,
    maxRoutes = 8,
    onProgress = () => {},
  } = opts;

  const profile = captureProfile(format);
  await mkdir(outDir, { recursive: true });

  const browser = await launchBrowser(browserPath);
  const untrack = trackForCleanup({ close: () => browser.close().catch(() => {}) });

  try {
    const base = new URL(url);

    let routeList = routes;
    let discovered = null;
    if (discover) {
      discovered = await discoverRoutes(url, { maxRoutes, browser });
      routeList = [...new Set([...routes, ...discovered.routes])].slice(0, maxRoutes);
    }

    const context = await browser.newContext({
      ...profile,
      colorScheme: dark ? 'dark' : 'light',
      ...(headers ? { extraHTTPHeaders: headers } : {}),
    });
    if (cookies) {
      const jar = cookies.split(';')
        .map(pair => pair.trim()).filter(Boolean)
        .map(pair => {
          const [name, ...rest] = pair.split('=');
          return { name: name.trim(), value: rest.join('='), domain: base.hostname, path: '/' };
        })
        .filter(c => c.name);
      if (jar.length) await context.addCookies(jar);
    }

    const page = await context.newPage();
    const files = [];
    for (const [i, route] of routeList.entries()) {
      onProgress(i + 1, routeList.length, route);
      // 'networkidle' never settles on apps holding websockets or beacons —
      // wait for load and let --wait-selector define app readiness.
      await page.goto(new URL(route, base).href, { waitUntil: 'load', timeout: 60_000 });
      if (waitSelector) await page.waitForSelector(waitSelector, { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready.then(() => {}));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${slug(route)}${dark ? '-dark' : ''}.png`);
      await page.screenshot({ path: file, type: 'png', animations: 'disabled' });
      files.push({ route, path: file, viewport: profile.viewport });
    }
    return { url, format, files, ...(discovered ? { discovered } : {}) };
  } finally {
    untrack();
    await browser.close().catch(() => {});
  }
}
