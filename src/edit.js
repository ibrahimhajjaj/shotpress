import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { launchHarness, openEngine, injectProject, evalOnInstance } from './harness.js';
import { inlineImages } from './render.js';

// Local image paths are inlined so the editor displays them; on save the exact
// data URLs are swapped back so the file on disk keeps clean path references.
export function restorePaths(json, map) {
  let out = json;
  for (const [dataUrl, original] of map) {
    out = out.split(JSON.stringify(dataUrl)).join(JSON.stringify(original));
  }
  return out;
}

export function collectPathMap(original, inlined) {
  const map = new Map();
  const walk = (a, b) => {
    if (typeof a === 'string' && typeof b === 'string' && a !== b && b.startsWith('data:')) map.set(b, a);
    else if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of Object.keys(a)) walk(a[k], b[k]);
    }
  };
  walk(original, inlined);
  return map;
}

async function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

// Opens the visual editor on a project file and streams edits back to disk.
// Resolves when the user closes the browser window.
export async function editProject(file, { browserPath = null, headed = true, pollMs = 800, onSave = () => {}, onReady = null } = {}) {
  const original = JSON.parse(await readFile(file, 'utf8'));
  const inlined = await inlineImages(original, path.dirname(path.resolve(file)));
  const pathMap = collectPathMap(original, inlined);

  const harness = await launchHarness({ browserPath, headed });
  try {
    const { context, page } = await openEngine(harness, { viewport: { width: 1440, height: 900 } });
    await injectProject(page, inlined);

    let closed = false;
    page.on('close', () => { closed = true; });
    harness.browser.on('disconnected', () => { closed = true; });
    if (onReady) Promise.resolve(onReady(page)).catch(() => {});

    let last = null;
    let saves = 0;
    while (!closed) {
      await new Promise(r => setTimeout(r, pollMs));
      let json;
      try {
        json = await evalOnInstance(page, (inst) => inst.saveJson());
      } catch {
        if (closed) break;
        continue; // transient (navigation, busy frame) — retry next poll
      }
      if (json !== last) {
        last = json;
        const pretty = JSON.stringify(JSON.parse(restorePaths(json, pathMap)), null, 2) + '\n';
        await writeAtomic(file, pretty);
        saves += 1;
        onSave(saves);
      }
    }
    return { file, saves };
  } finally {
    await harness.close();
  }
}
