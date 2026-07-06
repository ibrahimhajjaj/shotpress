import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { launchHarness, openEngine, injectProject, ensureFonts, usedFamilies, evalOnInstance } from './harness.js';
import { inlineImages } from './render.js';

// Lays every screen out on the board so the whole set is visible at once, then
// keeps it there across re-injections.
async function showBoard(page) {
  await evalOnInstance(page, (inst) => new Promise((resolve) => {
    inst.setState({ view: 'board', selLayer: null, selIds: [] }, () => resolve());
  }));
}

// Reflects one snapshot of the project onto the live board: inline image paths,
// push the state, switch to board, load fonts. Best-effort on fonts so a family
// that hasn't loaded yet never stalls the watch loop.
async function reflect(page, project, baseDir) {
  const inlined = await inlineImages(project, baseDir);
  await injectProject(page, inlined);
  await showBoard(page);
  await ensureFonts(page, usedFamilies(inlined)).catch(() => {});
}

// Opens the visual board in a real browser window and mirrors a project file
// into it as the file changes on disk — the file→editor direction, so an agent
// (or anything) editing the JSON is watched composing the set in real time.
// Resolves when the window is closed. One-way by design: the board is a live
// view, not an input; rendering the approved file is the export step.
export async function watchProject(file, {
  browserPath = null,
  pollMs = 500,
  onUpdate = () => {},
  onReady = null,
} = {}) {
  const baseDir = path.dirname(path.resolve(file));
  const firstRaw = await readFile(file, 'utf8');
  const first = JSON.parse(firstRaw);

  const harness = await launchHarness({ browserPath, headed: true });
  try {
    const { page } = await openEngine(harness, { viewport: { width: 1600, height: 1000 } });

    let closed = false;
    page.on('close', () => { closed = true; });
    harness.browser.on('disconnected', () => { closed = true; });

    await reflect(page, first, baseDir);
    let last = firstRaw;
    let updates = 0;
    if (onReady) Promise.resolve(onReady(page)).catch(() => {});

    while (!closed) {
      await new Promise(r => setTimeout(r, pollMs));
      let raw;
      try {
        raw = await readFile(file, 'utf8');
      } catch {
        continue; // file briefly gone during an atomic rename — retry next poll
      }
      if (raw === last) continue;

      let project;
      try {
        project = JSON.parse(raw);
      } catch {
        continue; // mid-write / partial JSON — wait for the next complete save
      }
      last = raw;

      try {
        await reflect(page, project, baseDir);
        updates += 1;
        onUpdate(updates);
      } catch (e) {
        if (closed) break;
        // a transient bad edit (missing image, unknown format) shouldn't kill
        // the window — surface it and keep watching for the next save
        onUpdate(updates, e);
      }
    }
    return { file, updates };
  } finally {
    await harness.close();
  }
}
