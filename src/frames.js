import { mkdir, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, homedir, platform } from 'node:os';
import path from 'node:path';
import { launchBrowser } from './harness.js';

const run = promisify(execFile);

// Official Apple product bezels. Never bundled: Apple's marketing artwork
// license is non-transferable, so each user downloads directly from Apple's
// CDN after accepting the terms. Usage conditions (Apple's, not ours):
// Apple Developer Program members, marketing App Store apps, artwork as-is —
// no tilting, cropping, or recoloring.
export const APPLE_TERMS_URL = 'https://www.apple.com/app-store/marketing/guidelines/';
export const APPLE_BEZELS = {
  iphone: { name: 'iPhone 17', url: 'https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg' },
  ipad: { name: 'iPad Pro (M5)', url: 'https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Pro-(M5).dmg' },
  mac: { name: 'MacBook Pro M5', url: 'https://devimages-cdn.apple.com/design/resources/download/Bezel-MacBook-Pro-M5.dmg' },
  watch: { name: 'Apple Watch Series 11', url: 'https://devimages-cdn.apple.com/design/resources/download/Bezel-Apple-Watch-Series-11-2025.dmg' },
};

export function framesDir() {
  const base = platform() === 'darwin'
    ? path.join(homedir(), 'Library', 'Caches')
    : process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache');
  return path.join(base, 'shotpress', 'frames');
}

const metaFile = () => path.join(framesDir(), 'frames.json');

export async function listFrames() {
  try { return JSON.parse(await readFile(metaFile(), 'utf8')); } catch { return {}; }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractDmg(dmg, outDir) {
  if (platform() !== 'darwin') {
    const err = new Error('frames install extracts Apple .dmg files and currently requires macOS');
    err.code = 'NO_TOOL';
    throw err;
  }
  // Apple's dmg embeds its artwork license agreement; hdiutil demands a Y on
  // stdin. The user already accepted via --accept-apple-terms, so pipe it.
  const { stdout } = await run('sh', ['-c', 'echo Y | hdiutil attach -nobrowse -readonly -plist "$1"', 'sh', dmg]);
  const mount = stdout.match(/<string>(\/Volumes\/[^<]+)<\/string>/)?.[1];
  const disk = stdout.match(/<string>(\/dev\/disk\d+)<\/string>/)?.[1];
  try {
    if (!mount) throw new Error('could not find the mount point for ' + dmg);
    const found = [];
    const walk = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue; // dmg decoration dirs
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.toLowerCase().endsWith('.png')) found.push(p);
      }
    };
    await walk(mount);
    await mkdir(outDir, { recursive: true });
    const copied = [];
    for (const src of found) {
      const dest = path.join(outDir, path.basename(src).replace(/\s+/g, '-'));
      await copyFile(src, dest);
      copied.push(dest);
    }
    return copied;
  } finally {
    if (mount || disk) await run('hdiutil', ['detach', mount || disk, '-quiet']).catch(() => {});
  }
}

// The screen opening in a bezel PNG is the transparent region connected to the
// image center. Flood from the center and take its bounding box — corners of
// the artwork are transparent too, so a global alpha scan would overshoot.
async function scanHole(browser, file) {
  const b64 = (await readFile(file)).toString('base64');
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (data) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const { width: w, height: h } = img;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const alpha = ctx.getImageData(0, 0, w, h).data;
      const clear = (i) => alpha[i * 4 + 3] < 8;
      const cx = w >> 1, cy = h >> 1;
      if (!clear(cy * w + cx)) return null;
      const seen = new Uint8Array(w * h);
      const stack = [cy * w + cx];
      seen[cy * w + cx] = 1;
      let minX = cx, maxX = cx, minY = cy, maxY = cy;
      const visit = (i) => { if (!seen[i] && clear(i)) { seen[i] = 1; stack.push(i); } };
      while (stack.length) {
        const i = stack.pop();
        const x = i % w, y = (i / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x + 1 < w) visit(i + 1);
        if (x > 0) visit(i - 1);
        if (y + 1 < h) visit(i + w);
        if (y > 0) visit(i - w);
      }
      return { w, h, hole: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
    }, b64);
  } finally {
    await page.close();
  }
}

// `local` maps a kind to an already-downloaded dmg (resumed/mirrored fetches).
export async function installFrames({ kinds = Object.keys(APPLE_BEZELS), accept = false, browserPath = null, local = {}, onProgress = () => {} } = {}) {
  if (!accept) {
    const err = new Error(
      'installing official Apple bezels requires accepting Apple\'s marketing artwork terms '
      + `(${APPLE_TERMS_URL}: Apple Developer Program members, App Store marketing, artwork as-is — no tilt or crop). `
      + 'Rerun with --accept-apple-terms. The files download directly from Apple\'s CDN and are never redistributed.');
    err.code = 'USAGE';
    throw err;
  }
  const dir = framesDir();
  await mkdir(dir, { recursive: true });
  const meta = await listFrames();
  const browser = await launchBrowser(browserPath);
  try {
    for (const kind of kinds) {
      const bezel = APPLE_BEZELS[kind];
      if (!bezel) throw new Error(`no Apple bezel mapping for "${kind}" — one of: ${Object.keys(APPLE_BEZELS).join(', ')}`);
      const provided = local[kind];
      const dmg = provided || path.join(tmpdir(), `shotpress-${kind}-${process.pid}.dmg`);
      let pngs;
      try {
        if (!provided) {
          onProgress(kind, 'downloading');
          await download(bezel.url, dmg);
        }
        onProgress(kind, 'extracting');
        pngs = await extractDmg(dmg, path.join(dir, kind));
      } finally {
        if (!provided) await rm(dmg, { force: true });
      }
      onProgress(kind, 'measuring');
      const variants = [];
      for (const file of pngs) {
        const scan = await scanHole(browser, file);
        if (scan) variants.push({ file, name: path.basename(file, '.png'), ...scan });
      }
      if (!variants.length) throw new Error(`no usable bezel PNGs found for ${kind}`);
      meta[kind] = { source: bezel.name, url: bezel.url, variants };
    }
    await writeFile(metaFile(), JSON.stringify(meta, null, 2));
    return meta;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Resolves a device layer's `frame` request ("iphone" or a variant name)
// to render-ready art: data-URL source plus hole geometry in percentages.
export async function resolveFrame(request) {
  const meta = await listFrames();
  const [kind, ...rest] = String(request).split(':');
  const entry = meta[kind];
  if (!entry) {
    throw new Error(`no installed frame for "${kind}" — run: shotpress frames install --accept-apple-terms`);
  }
  const wanted = rest.join(':');
  const variant = (wanted && entry.variants.find(v => v.name.toLowerCase().includes(wanted.toLowerCase())))
    || entry.variants.find(v => /portrait/i.test(v.name))
    || entry.variants.find(v => v.hole.h > v.hole.w)
    || entry.variants[0];
  const src = `data:image/png;base64,${(await readFile(variant.file)).toString('base64')}`;
  return {
    src,
    w: variant.w,
    h: variant.h,
    hole: {
      x: (variant.hole.x / variant.w) * 100,
      y: (variant.hole.y / variant.h) * 100,
      w: (variant.hole.w / variant.w) * 100,
      h: (variant.hole.h / variant.h) * 100,
    },
  };
}
