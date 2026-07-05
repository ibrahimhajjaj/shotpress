import { readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from './harness.js';

// "x,y,w,h" strings → rects, validated hard because they come from the CLI.
export function parseMasks(values = []) {
  return values.map((raw) => {
    const parts = String(raw).split(',').map(s => Number(s.trim()));
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0) || parts[2] === 0 || parts[3] === 0) {
      const err = new Error(`--mask must be "x,y,w,h" in image pixels with positive w/h (got "${raw}")`);
      err.code = 'USAGE';
      throw err;
    }
    const [x, y, w, h] = parts;
    return { x, y, w, h };
  });
}

// Capture cleanup: fill mask rects with the average color of the 2px ring
// around each (dev buttons, debug overlays), then crop top/bottom. Runs in a
// page canvas so there is no image dependency; writes the PNG back in place.
export async function cleanImage(file, { cropTop = 0, cropBottom = 0, masks = [] } = {}, { browser = null, browserPath = null } = {}) {
  const own = !browser;
  if (own) browser = await launchBrowser(browserPath);
  const page = await browser.newPage();
  try {
    const b64 = (await readFile(file)).toString('base64');
    const dataUrl = await page.evaluate(async ([data, opts]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const W = img.width, H = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      for (const m of opts.masks) {
        const pad = 2;
        const ox = Math.max(0, m.x - pad), oy = Math.max(0, m.y - pad);
        const ow = Math.min(W - ox, m.w + pad * 2), oh = Math.min(H - oy, m.h + pad * 2);
        const px = ctx.getImageData(ox, oy, ow, oh).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = 0; yy < oh; yy++) {
          for (let xx = 0; xx < ow; xx++) {
            const insideMask = xx + ox >= m.x && xx + ox < m.x + m.w && yy + oy >= m.y && yy + oy < m.y + m.h;
            if (insideMask) continue; // ring only
            const k = (yy * ow + xx) * 4;
            r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
          }
        }
        ctx.fillStyle = n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : '#000';
        ctx.fillRect(m.x, m.y, m.w, m.h);
      }
      const outH = H - opts.cropTop - opts.cropBottom;
      if (outH <= 0) throw new Error('crop removes the whole image');
      if (opts.cropTop || opts.cropBottom) {
        const cropped = document.createElement('canvas');
        cropped.width = W; cropped.height = outH;
        cropped.getContext('2d').drawImage(canvas, 0, opts.cropTop, W, outH, 0, 0, W, outH);
        return cropped.toDataURL('image/png');
      }
      return canvas.toDataURL('image/png');
    }, [b64, { cropTop, cropBottom, masks }]);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    await writeFile(file, buf);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await page.close().catch(() => {});
    if (own) await browser.close().catch(() => {});
  }
}
