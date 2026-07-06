import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FORMATS, outputSize } from './formats.js';
import { mirrorProject } from './rtl.js';
import { resolveFrame } from './frames.js';
import { launchHarness, openEngine, injectProject, ensureFonts, usedFamilies, evalOnInstance } from './harness.js';

const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

// Device screenshots / logos / bg photos may be local file paths in the spec;
// the browser only ever sees data URLs.
export async function inlineImages(project, baseDir) {
  const inline = async (v) => {
    if (typeof v !== 'string' || !v || /^(data:|https?:)/.test(v)) return v;
    const file = path.resolve(baseDir, v);
    const mime = IMG_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let data;
    try {
      data = await readFile(file);
    } catch {
      throw new Error(`image not found: ${v} (resolved to ${file})`);
    }
    return `data:${mime};base64,${data.toString('base64')}`;
  };
  const p = structuredClone(project);
  if (p.brand) p.brand.logo = await inline(p.brand.logo);
  for (const screen of p.screens || []) {
    if (screen.bg) screen.bg.image = await inline(screen.bg.image);
    for (const layer of screen.layers || []) {
      layer.image = await inline(layer.image);
      layer.beforeImage = await inline(layer.beforeImage);
      layer.src = await inline(layer.src);
    }
  }
  return p;
}

function collectDataUrls(project) {
  const urls = new Set();
  const add = (v) => { if (typeof v === 'string' && v.startsWith('data:image/')) urls.add(v); };
  add(project.brand?.logo);
  for (const screen of project.screens || []) {
    add(screen.bg?.image);
    for (const layer of screen.layers || []) {
      add(layer.image); add(layer.beforeImage); add(layer.src);
    }
  }
  return [...urls];
}

// CSS background-image has no decode() hook, so decode every inlined image
// once at page level — after that, background paints land within a frame.
async function predecodeImages(page, urls) {
  if (!urls.length) return;
  await page.evaluate((list) => Promise.all(list.map(u => new Promise((done) => {
    const img = new Image();
    img.onload = () => img.decode().then(done, done);
    img.onerror = done;
    img.src = u;
  }))), urls);
}

// Mounts a transform-stripped clone of one screen at natural design size and
// returns its element. Screenshotting the live board node would capture it at
// the board's zoom, and inside its scale() transform the raster comes out wrong.
async function mountClone(page, idx) {
  await page.evaluate(async (i) => {
    const src = document.querySelector('[data-shotcanvas] [data-screen-idx="' + i + '"]');
    if (!src) throw new Error('screen ' + i + ' not found');
    const holder = document.createElement('div');
    holder.id = '__shot_holder';
    holder.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;';
    const clone = src.cloneNode(true);
    clone.id = '__shot';
    clone.querySelectorAll('[data-noexport]').forEach(n => n.remove());
    clone.style.transform = 'none';
    clone.style.borderRadius = '0';
    clone.style.boxShadow = 'none';
    clone.style.margin = '0';
    clone.style.position = 'static';
    holder.appendChild(clone);
    document.body.appendChild(holder);
    await Promise.all([...clone.querySelectorAll('img')].map(im => im.decode().catch(() => {})));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, idx);
  return page.$('#__shot');
}

const unmountClone = (page) => page.evaluate(() => document.getElementById('__shot_holder')?.remove());

// Resize/convert a PNG buffer to the exact target size in page context —
// data-URL images don't taint the canvas, so toDataURL stays available.
async function normalize(page, pngBuffer, { w, h, type, quality }) {
  const dataUrl = await page.evaluate(async ([b64, tw, th, kind, q]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (kind === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th); }
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(kind === 'jpeg' ? 'image/jpeg' : 'image/png', q);
  }, [pngBuffer.toString('base64'), w, h, type, quality]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// PNG dimensions live in the IHDR chunk at fixed offsets.
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Tiles the rendered screens into one montage, so the whole-set rhythm can be
// judged at a glance (the way you actually review a listing) without shelling
// out to an image tool. Composed in the page's own canvas.
async function contactSheet(page, files, { cols = 4, thumbW = 300, gap = 16, bg = '#0b0b12' } = {}) {
  const b64s = await Promise.all(files.map(async (f) => (await readFile(f.path)).toString('base64')));
  const dataUrl = await page.evaluate(async ([list, c, tw, g, back]) => {
    const imgs = await Promise.all(list.map(s => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s; })));
    const ar = imgs[0].height / imgs[0].width, th = Math.round(tw * ar);
    const cols2 = Math.min(c, imgs.length), rows = Math.ceil(imgs.length / cols2);
    const W = cols2 * tw + (cols2 + 1) * g, H = rows * th + (rows + 1) * g;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = back; ctx.fillRect(0, 0, W, H);
    imgs.forEach((im, i) => {
      const x = g + (i % cols2) * (tw + g), y = g + Math.floor(i / cols2) * (th + g);
      ctx.drawImage(im, x, y, tw, th);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x + 6, y + 6, 26, 22);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.fillText(String(i + 1), x + 12, y + 22);
    });
    return canvas.toDataURL('image/png');
  }, [b64s, cols, thumbW, gap, bg]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function renderProject(project, opts = {}, sharedHarness = null) {
  const {
    format = project.format,
    outDir = './shotpress-out',
    type = 'png',
    scale = null,
    screens = null,       // 1-indexed subset
    name = 'screen',
    rtl = false,
    contact = false,
    fontsDir = null,
    browserPath = null,
    baseDir = process.cwd(),
    onProgress = () => {},
  } = opts;

  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`unknown format "${format}"`);
  const target = outputSize(fmt, scale);
  let inlined = await inlineImages(project, baseDir);
  if (rtl) inlined = mirrorProject(inlined);
  // device layers may request official Apple bezels: frame: "iphone[:variant]"
  const warnings = [];
  for (const [si, screen] of (inlined.screens || []).entries()) {
    for (const layer of screen.layers || []) {
      if (layer.type === 'device' && layer.frame && !layer.frameArt) {
        layer.frameArt = await resolveFrame(layer.frame);
        if (layer.rot || layer.rx3d || layer.ry3d) {
          warnings.push(`screen ${si + 1}: official Apple bezel with a pose — Apple's terms require the artwork as-is; the pose is ignored/flagged`);
        }
        const frameKind = String(layer.frame).split(':')[0];
        const fits = { iphone: 'phone', ipad: 'tablet', mac: 'mac', watch: 'watch' }[frameKind];
        if (fits && (fits !== fmt.kind || (['iphone', 'ipad'].includes(frameKind) && fmt.os !== 'ios'))) {
          warnings.push(`screen ${si + 1}: "${frameKind}" bezel on a ${fmt.label} canvas — mismatched frame and format`);
        }
      }
    }
  }
  await mkdir(outDir, { recursive: true });

  if (!target.storeExact && scale == null) {
    warnings.push(`${format}: design aspect differs from the store size — writing ${target.w}×${target.h} instead of ${fmt.realW}×${fmt.realH}`);
  }

  const harness = sharedHarness ?? await launchHarness({ browserPath });
  let context;
  try {
    const opened = await openEngine(harness, { deviceScaleFactor: target.scale, fontsDir });
    context = opened.context;
    const page = opened.page;

    await injectProject(page, inlined);

    // A format override goes through the engine's setFormat so the reflow
    // transform repositions every layer for the new canvas.
    if (format !== inlined.format) {
      await evalOnInstance(page, (inst, f) => inst.setFormat(f), format);
      await page.waitForFunction(
        (w) => { const el = document.querySelector('[data-shotcanvas] [data-screen-idx]'); return el && el.clientWidth === w; },
        fmt.w, { timeout: 15_000 },
      );
    }

    await ensureFonts(page, usedFamilies(inlined));
    await predecodeImages(page, collectDataUrls(inlined));
    await evalOnInstance(page, (inst) => {
      try { inst.measure(); } catch {}
      try { inst.measureNat(); } catch {}
    });

    const total = await evalOnInstance(page, (inst) => new Promise((resolve) => {
      inst.setState({ view: 'board' }, () => resolve(inst.state.screens.length));
    }));
    await page.waitForFunction(
      (n) => new Set([...document.querySelectorAll('[data-shotcanvas] [data-screen-idx]')].map(e => e.getAttribute('data-screen-idx'))).size >= n,
      total, { timeout: 15_000 },
    );

    const wanted = screens
      ? screens.map(n => n - 1).filter(i => i >= 0 && i < total)
      : Array.from({ length: total }, (_, i) => i);
    if (!wanted.length) throw new Error('no screens matched --screens');

    const files = [];
    for (const [n, idx] of wanted.entries()) {
      onProgress(n + 1, wanted.length);
      if (type === 'svg') {
        const svg = await evalOnInstance(page, async (inst, a) => {
          const fontStyle = await inst.fontStyleFor('svg');
          return inst.buildScreenSVG(a.idx, a.w, a.h, fontStyle);
        }, { idx, w: fmt.w, h: fmt.h });
        if (!svg) throw new Error(`SVG build failed for screen ${idx + 1}`);
        const file = path.join(outDir, `${name}-${String(idx + 1).padStart(2, '0')}.svg`);
        await writeFile(file, svg);
        files.push({ screen: idx + 1, path: file, width: fmt.w, height: fmt.h });
        continue;
      }

      const el = await mountClone(page, idx);
      let buf = await el.screenshot({ type: 'png', animations: 'disabled' });
      await unmountClone(page);

      const size = pngSize(buf);
      if (size.w !== target.w || size.h !== target.h || type === 'jpeg') {
        buf = await normalize(page, buf, { w: target.w, h: target.h, type, quality: 0.92 });
      }
      const ext = type === 'jpeg' ? 'jpg' : 'png';
      const file = path.join(outDir, `${name}-${String(idx + 1).padStart(2, '0')}.${ext}`);
      await writeFile(file, buf);
      files.push({ screen: idx + 1, path: file, width: target.w, height: target.h });
    }

    let contactFile = null;
    if (contact && type !== 'svg' && files.length > 1) {
      const buf = await contactSheet(page, files);
      contactFile = path.join(outDir, `${name}-contact.png`);
      await writeFile(contactFile, buf);
    }

    return { format, scale: target.scale, files, warnings, ...(contactFile ? { contact: contactFile } : {}) };
  } finally {
    await context?.close().catch(() => {});
    if (!sharedHarness) await harness.close();
  }
}
