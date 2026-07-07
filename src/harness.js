import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const ENGINE_DIR = fileURLToPath(new URL('./engine/', import.meta.url));
const FONTS_DIR = fileURLToPath(new URL('./fonts/', import.meta.url));
const VENDOR_DIR = fileURLToPath(new URL('./vendor/', import.meta.url));
const ENGINE_PAGE = '/Screenshot%20Builder.dc.html';

const FONTS_CSS = readFileSync(path.join(FONTS_DIR, 'fonts.css'), 'utf8');
const VENDORED_FAMILIES = new Set([...FONTS_CSS.matchAll(/font-family:'([^']+)'/g)].map(m => m[1]));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// The engine resolves its Frame component and its own source over fetch(),
// which Chromium refuses on file:// — so serve the engine dir over loopback.
// /__fonts/ serves the vendored woff2 referenced by the intercepted font CSS.
function startEngineServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const root = pathname.startsWith('/__fonts/') ? FONTS_DIR : ENGINE_DIR;
      const rel = pathname.startsWith('/__fonts/') ? pathname.slice('/__fonts/'.length) : pathname;
      const file = path.normalize(path.join(root, rel === '/' || rel === '' ? 'Screenshot Builder.dc.html' : rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'access-control-allow-origin': '*',
      });
      res.end(data);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function browserInstallHint() {
  try {
    const require = createRequire(import.meta.url);
    const { version } = require('playwright-core/package.json');
    return `npx playwright-core@${version} install chromium`;
  } catch {
    return 'npx playwright install chromium';
  }
}

// Resolution order: explicit path → Playwright's cached Chromium → system
// Chrome. Only then give up, with the exact install command.
export async function launchBrowser(browserPath, { headless = true, args = [] } = {}) {
  if (browserPath) return chromium.launch({ headless, executablePath: browserPath, args });
  try {
    return await chromium.launch({ headless, args });
  } catch (first) {
    if (!/executable doesn't exist|Looks like Playwright/i.test(String(first.message))) throw first;
    try {
      return await chromium.launch({ headless, channel: 'chrome', args });
    } catch {
      const err = new Error(`no Chromium found — run: ${browserInstallHint()} (or install Google Chrome, or pass --browser-path)`);
      err.code = 'NO_BROWSER';
      throw err;
    }
  }
}

// Track live harnesses so Ctrl-C doesn't orphan Chromium or the server.
const live = new Set();
let signalsInstalled = false;

// Lets other entry points (capture) join the same Ctrl-C cleanup.
export function trackForCleanup(closeable) {
  live.add(closeable);
  installSignals();
  return () => live.delete(closeable);
}

function installSignals() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.on(signal, async () => {
      await Promise.allSettled([...live].map(h => h.close()));
      process.exit(code);
    });
  }
}

export async function launchHarness({ browserPath = null, headed = false } = {}) {
  const { server, url } = await startEngineServer();
  let browser;
  try {
    browser = await launchBrowser(browserPath, { headless: !headed });
  } catch (e) {
    server.close();
    throw e;
  }
  const harness = {
    url,
    browser,
    async close() {
      live.delete(harness);
      await browser.close().catch(() => {});
      server.close();
    },
  };
  live.add(harness);
  installSignals();
  return harness;
}

// One context per render pass: deviceScaleFactor is context-scoped, and a fresh
// context guarantees no state bleeds between formats.
// Embeds a directory of font files as @font-face rules, so a project can name a
// custom display face and render it offline (family = the file's base name).
const FONT_FORMAT = { '.woff2': ['woff2', 'font/woff2'], '.woff': ['woff', 'font/woff'], '.otf': ['opentype', 'font/otf'], '.ttf': ['truetype', 'font/ttf'] };
async function injectUserFonts(page, dir) {
  let files;
  try { files = (await readdir(dir)).filter(f => FONT_FORMAT[path.extname(f).toLowerCase()]); }
  catch { throw new Error(`--fonts: cannot read directory ${dir}`); }
  const faces = [];
  for (const f of files) {
    const [fmt, mime] = FONT_FORMAT[path.extname(f).toLowerCase()];
    const buf = await readFile(path.join(dir, f));
    faces.push(`@font-face{font-family:'${path.basename(f, path.extname(f))}';src:url(data:${mime};base64,${buf.toString('base64')}) format('${fmt}');font-display:block;}`);
  }
  if (faces.length) await page.addStyleTag({ content: faces.join('\n') });
}

export async function openEngine(harness, { deviceScaleFactor = 1, viewport = { width: 1100, height: 1000 }, fontsDir = null } = {}) {
  const context = await harness.browser.newContext({
    viewport,
    deviceScaleFactor,
  });

  // Hermetic mode for tests/CI: nothing but the loopback server gets through.
  if (process.env.SHOTPRESS_NO_NETWORK) {
    await context.route('**/*', (route) => {
      const { hostname } = new URL(route.request().url());
      hostname === '127.0.0.1' ? route.fallback() : route.abort();
    });
  }

  // The engine pulls React and html2canvas from CDNs at boot; serve vendored
  // copies so a render never depends on (or waits for) the network. html2canvas
  // is only used by the editor's in-browser export, never by this harness — an
  // empty stub keeps the parser from stalling on it.
  await context.route('**://unpkg.com/react@*/umd/react.production.min.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', path: path.join(VENDOR_DIR, 'react.production.min.js') }));
  await context.route('**://unpkg.com/react-dom@*/umd/react-dom.production.min.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', path: path.join(VENDOR_DIR, 'react-dom.production.min.js') }));
  await context.route('**://cdnjs.cloudflare.com/**/html2canvas*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '/* stubbed: unused headless */' }));

  // Serve vendored families locally so default-font renders are deterministic
  // and offline-safe. Requests for families we don't ship fall through to the
  // network; ensureFonts() turns a miss into a hard, named failure.
  const cssBody = FONTS_CSS.replaceAll("url('/__fonts/", `url('${harness.url}/__fonts/`);
  await context.route('**://fonts.googleapis.com/**', (route) => {
    const requested = [...new URL(route.request().url()).searchParams.getAll('family')]
      .map(f => f.split(':')[0]);
    const covered = requested.length && requested.every(f => VENDORED_FAMILIES.has(f));
    if (covered) {
      route.fulfill({ contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: cssBody });
    } else {
      route.fallback();
    }
  });

  const page = await context.newPage();
  if (process.env.SHOTPRESS_DEBUG) {
    page.on('pageerror', (e) => console.error('PAGE_ERROR:', e));
    page.on('console', (msg) => { if (msg.type() === 'error') console.error('CONSOLE_ERROR:', msg.text()); });
  }
  await page.goto(harness.url + ENGINE_PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-screen-idx]', { timeout: 30_000 });
  await page.waitForFunction(GET_INSTANCE + ' !== null', { timeout: 30_000 });
  if (fontsDir) await injectUserFonts(page, fontsDir);
  // kill transitions so screenshots never catch an in-flight animation
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;}' });
  return { context, page };
}

// The editor's logic class isn't exposed on window; the runtime hosts it as
// `stateNode.logic` on a wrapper component, reachable through React's fiber
// tree from any node the editor rendered. Runs in page context. Exported so the
// browser-side watch client can locate the same instance without CDP.
export const GET_INSTANCE = `(() => {
  function logicOf(stateNode) {
    if (!stateNode) return null;
    if (typeof stateNode.buildPackScreens === 'function') return stateNode;
    if (stateNode.logic && typeof stateNode.logic.buildPackScreens === 'function') return stateNode.logic;
    return null;
  }
  function find(el) {
    for (let node = el; node; node = node.parentElement) {
      const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      if (!key) continue;
      for (let fiber = node[key]; fiber; fiber = fiber.return) {
        const inst = logicOf(fiber.stateNode);
        if (inst) return inst;
      }
    }
    return null;
  }
  const el = document.querySelector('[data-shotcanvas]') || document.querySelector('[data-screen-idx]');
  return el ? find(el) : null;
})()`;

// Runs an expression against the editor instance in page context.
// body receives (inst, args) and may return a promise.
export function evalOnInstance(page, body, args = null) {
  return page.evaluate(
    ([src, a]) => {
      const inst = eval(src.instance);
      if (!inst) throw new Error('editor instance not found');
      return new Function('inst', 'args', `return (${src.body})(inst, args)`)(inst, a);
    },
    [{ instance: GET_INSTANCE, body: body.toString() }, args],
  );
}

// Fills the brand fields the engine assumes are present. A hand-authored or
// variant brand that omits colors/clayColor/logo would otherwise crash the
// engine's own render (br.colors.map on undefined), which surfaces only as an
// opaque board-render timeout — so complete it before it ever reaches the page.
export function withBrandDefaults(brand = {}) {
  const accent = brand.accent || '#6d5cf5';
  const merged = { appName: 'Your App', accent, colors: [accent], bezel: 'black', clayColor: '#9b8cff', logo: null, ...brand };
  if (!Array.isArray(merged.colors) || !merged.colors.length) merged.colors = [merged.accent];
  return merged;
}

// Project state goes in through setState, not localStorage: the payload rides
// the DevTools protocol, so multi-megabyte inlined screenshots can't hit the
// ~5MB storage quota and silently boot the default project instead.
export async function injectProject(page, project) {
  await evalOnInstance(page, (inst, p) => new Promise((resolve, reject) => {
    if (!inst.formats[p.format]) return reject(new Error('unknown format ' + p.format));
    inst.setState({
      format: p.format,
      brand: p.brand,
      screens: p.screens,
      selected: 0,
      onboard: false,
      selLayer: null,
      selIds: [],
    }, () => {
      try { inst.syncFonts(); } catch {}
      const ok = inst.state.screens.length === p.screens.length && inst.state.format === p.format;
      if (!ok) return reject(new Error('project injection failed: engine state does not match the spec'));
      resolve();
    });
  }), { format: project.format, brand: withBrandDefaults(project.brand), screens: project.screens });
}

// fonts.ready only covers loads already in flight — lazily-declared families
// the layout hasn't touched yet stay invisible to it, and a family whose
// stylesheet hasn't parsed yet makes fonts.load() resolve empty. So: wait for
// each family's @font-face to register, force-load it, and fail with names,
// not with wrong-font output.
export async function ensureFonts(page, families, { timeout = 15_000 } = {}) {
  const missing = await page.evaluate(async ([fams, ms]) => {
    const deadline = Date.now() + ms;
    const sleep = (t) => new Promise(r => setTimeout(r, t));
    const registered = (f) => [...document.fonts].some(face => face.family.replace(/["']/g, '') === f);
    const pending = new Set(fams);
    while (pending.size && Date.now() < deadline) {
      for (const f of [...pending]) {
        if (!registered(f)) continue;
        await Promise.all([400, 500, 700].map(w => document.fonts.load(`${w} 16px '${f}'`).catch(() => {})));
        if (document.fonts.check(`16px '${f}'`)) pending.delete(f);
      }
      if (pending.size) await sleep(100);
    }
    return [...pending];
  }, [families, timeout]);
  if (missing.length) {
    throw new Error(`fonts failed to load: ${missing.join(', ')} — vendored families work offline, others need network`);
  }
}

// Families referenced by the project's text layers plus the engine defaults.
export function usedFamilies(project) {
  const fams = new Set(['Manrope', 'Space Grotesk']);
  for (const screen of project.screens || []) {
    for (const layer of screen.layers || []) {
      const m = typeof layer.font === 'string' && layer.font.match(/'([^']+)'/);
      if (m) fams.add(m[1]);
    }
  }
  return [...fams];
}

// Reflows a project to another format through the engine's own transform
// (fractional reposition + geometric-mean sizing) and returns the new JSON.
export async function reflowProject(project, format, { browserPath = null } = {}) {
  if (project.format === format) return project;
  const harness = await launchHarness({ browserPath });
  try {
    const { context, page } = await openEngine(harness);
    try {
      await injectProject(page, project);
      return await evalOnInstance(page, (inst, f) => new Promise((resolve, reject) => {
        if (!inst.formats[f]) return reject(new Error('unknown format ' + f));
        inst.setFormat(f);
        let tries = 0;
        const poll = () => {
          if (inst.state.format === f) return resolve(JSON.parse(inst.saveJson()));
          if (++tries > 100) return reject(new Error('format reflow timed out'));
          setTimeout(poll, 50);
        };
        poll();
      }), format);
    } finally {
      await context.close();
    }
  } finally {
    await harness.close();
  }
}

// Reads every layer type's real default fields straight from the engine's own
// addLayer() (the authoritative source), so `schema`/`--kitchen-sink` can never
// drift from what the editor produces. Returns { type: { type, fields } } plus
// the alias presets (heading/circle/line).
export async function introspectLayers({ browserPath = null, types, aliases }) {
  const harness = await launchHarness({ browserPath });
  try {
    const { context, page } = await openEngine(harness);
    try {
      return await evalOnInstance(page, async (inst, args) => {
        const drop = new Set(['id', 'cx', 'cy', 'type']);
        const added = [...args.types, ...Object.keys(args.aliases)].map(t => ({ t, id: inst.addLayer(t, 100, 100) }));
        await new Promise(r => setTimeout(r, 0)); // let the state flush
        const layers = inst.state.screens[inst.state.selected].layers;
        const out = {};
        for (const { t, id } of added) {
          const layer = layers.find(l => l.id === id);
          if (!layer) continue;
          const fields = {};
          for (const [k, v] of Object.entries(layer)) if (!drop.has(k)) fields[k] = v;
          out[t] = { type: layer.type, fields };
        }
        return out;
      }, { types, aliases });
    } finally {
      await context.close();
    }
  } finally {
    await harness.close();
  }
}

// Builds a fresh project through the engine's own pack/screen builders,
// so `shotpress new` output is exactly what the editor would produce.
export async function buildProject({ pack = null, format = 'iphone', appName = null, accent = null, screens = null, browserPath = null }) {
  const harness = await launchHarness({ browserPath });
  try {
    const { context, page } = await openEngine(harness);
    try {
      return await evalOnInstance(page, (inst, args) => new Promise((resolve, reject) => {
        const f = inst.formats[args.format];
        if (!f) return reject(new Error('unknown format ' + args.format));
        const brand = Object.assign({}, inst.state.brand);
        if (args.appName) brand.appName = args.appName;
        if (args.accent) { brand.accent = args.accent; brand.colors = [args.accent]; }
        inst.setState({ format: args.format, brand }, () => {
          let next;
          if (args.pack) {
            next = inst.buildPackScreens(args.pack, f);
            if (!next.length) return reject(new Error('unknown pack ' + args.pack));
            if (args.screens != null) next = next.slice(0, Math.max(1, args.screens));
          } else {
            next = Array.from({ length: Math.max(1, args.screens ?? 3) }, () => inst.newScreen(f, {}));
          }
          inst.setState({ screens: next, selected: 0, onboard: false }, () => {
            resolve(JSON.parse(inst.saveJson()));
          });
        });
      }), { pack, format, appName, accent, screens });
    } finally {
      await context.close();
    }
  } finally {
    await harness.close();
  }
}
