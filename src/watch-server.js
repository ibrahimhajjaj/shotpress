import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GET_INSTANCE } from './harness.js';
import { restorePaths, collectPathMap } from './edit.js';
import { inlineImages, renderProject } from './render.js';

const ENGINE_DIR = fileURLToPath(new URL('./engine/', import.meta.url));
const FONTS_DIR = fileURLToPath(new URL('./fonts/', import.meta.url));
const VENDOR_DIR = fileURLToPath(new URL('./vendor/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// Stable stringify with sorted keys — dedup compares projects by value, not by
// the key order the engine's saveJson or a hand-edit happens to emit.
function canon(value) {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canon(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// A normal browser can't be driven over CDP, and it can't intercept the engine's
// CDN <script>/<link> loads the way the Playwright harness does. So the loopback
// server rewrites those absolute URLs to its own vendored copies before handing
// the bytes over — the board becomes fully self-contained (works offline, no CDN
// dependency) without touching the frozen engine files on disk.
function rewriteHtml(html) {
  return html
    .replace(/<link[^>]*rel=["']preconnect["'][^>]*>/gi, '')
    .replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"')]*/g, '/__vendor/fonts.css')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/[^"']*html2canvas[^"']*/g, '/__vendor/html2canvas.js')
    .replace(/<\/body>/i, '<script src="/__watch/client.js"></script></body>');
}

function rewriteSupport(js) {
  return js
    .replace(/https:\/\/unpkg\.com\/@babel\/standalone@[^"']*/g, '/__vendor/babel.js')
    .replace(/https:\/\/unpkg\.com\/react@[^"']*react\.production\.min\.js/g, '/__vendor/react.production.min.js')
    .replace(/https:\/\/unpkg\.com\/react-dom@[^"']*react-dom\.production\.min\.js/g, '/__vendor/react-dom.production.min.js')
    // vendored copies are same-origin; drop SRI so a byte-diff can't block boot
    .replace(/s\.integrity = integrity;/g, 's.integrity = "";');
}

// The page updates itself: this script (served, never written into the frozen
// engine file) locates the editor instance via the React fiber, pulls new
// project state when the server's version advances, posts the editor's own
// edits back, and drives a store-exact export through the server's headless
// renderer (the browser's own rasterizer mishandles blur/3D, so export never
// runs in-page). Turn-based in practice, so last-writer-wins at the server.
function clientScript() {
  return `(() => {
  const getInst = () => ${GET_INSTANCE};
  let appliedVersion = -1;
  let lastLocal = null;
  let busy = false;

  const toast = (() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;font:500 13px system-ui,sans-serif;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:none;max-width:80vw;text-align:center';
    let t; const show = (msg, ms) => { el.textContent = msg; el.style.opacity = '1'; clearTimeout(t); if (ms) t = setTimeout(() => { el.style.opacity = '0'; }, ms); };
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
    if (document.body) document.body.appendChild(el);
    return show;
  })();

  const btn = document.createElement('button');
  btn.id = '__shot_export';
  btn.textContent = 'Export store PNGs';
  btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#5b46f5;color:#fff;border:0;font:600 14px system-ui,sans-serif;padding:12px 20px;border-radius:10px;box-shadow:0 6px 24px rgba(91,70,245,.4);cursor:pointer';
  btn.onclick = async () => {
    btn.disabled = true; btn.style.opacity = '.6';
    toast('Rendering store-exact PNGs…');
    try {
      const r = await fetch('/__watch/export', { method: 'POST' });
      const d = await r.json();
      toast(d.ok ? ('Exported ' + d.count + ' PNG' + (d.count === 1 ? '' : 's') + ' → ' + d.outDir) : ('Export failed: ' + d.error), 8000);
    } catch (e) { toast('Export failed', 6000); }
    finally { btn.disabled = false; btn.style.opacity = '1'; }
  };
  const mountBtn = () => { if (document.body && !document.getElementById('__shot_export')) document.body.appendChild(btn); };

  // Steer to the correct (server-side) export: hide the engine's own lossy
  // html2canvas export control. It's a bare div, so match on the element's own
  // direct text (an ancestor's bubbled text would over-match). Idempotent —
  // re-run each tick since the editor re-renders. Never touches our own UI.
  function hideNativeExport() {
    for (const el of document.querySelectorAll('div, button, a')) {
      if (el === btn) continue;
      const direct = [];
      for (const n of el.childNodes) if (n.nodeType === 3) direct.push(n.textContent);
      const label = direct.join('').replace(/[^A-Za-z ]/g, '').trim();
      if (label === 'Export') el.style.display = 'none';
    }
  }

  function apply(project) {
    const inst = getInst();
    if (!inst || !inst.formats || !inst.formats[project.format]) return false;
    inst.setState({
      format: project.format,
      brand: project.brand,
      screens: project.screens,
      selected: 0, onboard: false, selLayer: null, selIds: [], view: 'board',
    }, () => { try { inst.syncFonts(); } catch (e) {} });
    return true;
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const inst = getInst();
      if (!inst) return;
      mountBtn();
      hideNativeExport();
      const res = await fetch('/__watch/state?v=' + appliedVersion, { cache: 'no-store' });
      const data = await res.json();
      if (data.version !== appliedVersion && data.project) {
        if (apply(data.project)) {
          appliedVersion = data.version;
          await new Promise(r => setTimeout(r, 80));
          lastLocal = getInst().saveJson();
        }
        return;
      }
      const cur = inst.saveJson();
      if (lastLocal === null) { lastLocal = cur; return; }
      if (cur !== lastLocal) {
        await fetch('/__watch/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: cur,
        });
        lastLocal = cur;
      }
    } catch (e) {
      /* transient: engine still booting, navigation, busy frame */
    } finally {
      busy = false;
    }
  }
  setInterval(tick, 400);
})();`;
}

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* headless box / no opener — the URL is printed for manual open */
  }
}

// Serves the engine over loopback and live-syncs a project file with it in both
// directions, so an ordinary browser is the editor: the agent writes the file
// and the board updates; you drag a layer and the file updates; you click Export
// and the server renders store-exact PNGs headlessly. Resolves on SIGINT.
export async function watchServe(file, {
  open = true,
  browserPath = null,
  outDir = null,
  onUpdate = () => {},
  onExport = () => {},
  onReady = () => {},
  signal = null,
} = {}) {
  const baseDir = path.dirname(path.resolve(file));
  const exportDir = outDir || path.join(baseDir, 'shotpress-out');

  // baseline: canonical, path-space (on-disk representation) both sides agree on
  let baseline = null;
  let version = 0;
  let project = null;       // inlined (data-URL) snapshot handed to the browser
  let pathMap = new Map();  // data-URL -> original path, to un-inline on save
  let updates = 0;
  let exporting = false;

  async function pullFile({ count = true } = {}) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return; // mid-write / briefly absent — retry next tick
    }
    const c = canon(parsed);
    if (c === baseline) return;
    try {
      const inlined = await inlineImages(parsed, baseDir);
      pathMap = collectPathMap(parsed, inlined);
      project = inlined;
      baseline = c;
      version += 1;
      if (count) { updates += 1; onUpdate(updates); }
    } catch (e) {
      if (count) onUpdate(updates, e); // e.g. a referenced capture not on disk yet
    }
  }

  // Writes a browser-origin edit back to disk. The board owns the on-disk format
  // here: 2-space `JSON.stringify`, same as the CLI's own writers, so an agent
  // that read-modify-writes the whole file round-trips cleanly. The canon guard
  // means a no-op save never rewrites the file, so an agent's own edits (which
  // arrive via pullFile, not here) don't churn formatting on their own.
  async function pushSave(editorJson) {
    let parsed;
    try {
      parsed = JSON.parse(restorePaths(editorJson, pathMap));
    } catch {
      return;
    }
    const c = canon(parsed);
    if (c === baseline) return;
    baseline = c;
    await writeAtomic(file, JSON.stringify(parsed, null, 2) + '\n');
  }

  // Renders the current file to store-exact PNGs through the headless harness —
  // the same path the CLI render uses, so the pixels match exactly.
  async function runExport() {
    if (exporting) return { ok: false, error: 'an export is already running' };
    exporting = true;
    try {
      const current = JSON.parse(await readFile(file, 'utf8'));
      const res = await renderProject(current, { outDir: exportDir, baseDir, browserPath });
      onExport(res.files.length, exportDir);
      return { ok: true, count: res.files.length, outDir: exportDir };
    } catch (e) {
      onExport(0, exportDir, e);
      return { ok: false, error: e.message };
    } finally {
      exporting = false;
    }
  }

  await pullFile({ count: false });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/__watch/client.js') {
        res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
        res.end(clientScript());
        return;
      }
      if (pathname === '/__watch/state') {
        const known = Number(url.searchParams.get('v'));
        const body = known === version ? { version } : { version, project };
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
        return;
      }
      if (pathname === '/__watch/save' && req.method === 'POST') {
        await pushSave(await readBody(req));
        res.writeHead(204);
        res.end();
        return;
      }
      if (pathname === '/__watch/export' && req.method === 'POST') {
        const result = await runExport();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // vendored runtime deps, so the board never reaches for a CDN
      if (pathname.startsWith('/__vendor/')) {
        const name = pathname.slice('/__vendor/'.length);
        if (name === 'fonts.css') {
          res.writeHead(200, { 'content-type': MIME['.css'], 'access-control-allow-origin': '*' });
          res.end(await readFile(path.join(FONTS_DIR, 'fonts.css')));
        } else if (name === 'react.production.min.js' || name === 'react-dom.production.min.js') {
          res.writeHead(200, { 'content-type': MIME['.js'] });
          res.end(await readFile(path.join(VENDOR_DIR, name)));
        } else {
          // babel / html2canvas: lazily-loaded and unused by the board — a stub
          // keeps the engine from stalling on a missing script
          res.writeHead(200, { 'content-type': MIME['.js'] });
          res.end('/* offline stub: not used by the watch board */');
        }
        return;
      }

      // static engine files; the entry HTML and support.js are rewritten to
      // pull their runtime deps from /__vendor instead of a CDN
      const onFonts = pathname.startsWith('/__fonts/');
      const root = onFonts ? FONTS_DIR : ENGINE_DIR;
      const rel = onFonts ? pathname.slice('/__fonts/'.length) : pathname;
      const target = path.normalize(path.join(root, rel === '/' || rel === '' ? 'Screenshot Builder.dc.html' : rel));
      if (!target.startsWith(root)) { res.writeHead(403); res.end(); return; }
      let data = await readFile(target);
      const ext = path.extname(target).toLowerCase();
      if (ext === '.html') data = Buffer.from(rewriteHtml(String(data)));
      else if (path.basename(target) === 'support.js') data = Buffer.from(rewriteSupport(String(data)));
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  const url = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  const poll = setInterval(() => { pullFile().catch(() => {}); }, 500);

  onReady(url);
  if (open) openInBrowser(url);

  await new Promise((resolve) => {
    const stop = () => resolve();
    if (signal) signal.addEventListener('abort', stop, { once: true });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

  clearInterval(poll);
  await new Promise((r) => server.close(r));
  return { file, url, updates };
}
