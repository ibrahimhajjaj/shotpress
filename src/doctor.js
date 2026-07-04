import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';

const run = promisify(execFile);

// Preflight: answers "why doesn't it work on this machine" before a render is
// attempted. Each check is independent; the command reports all of them.
export async function runDoctor({ browserPath = null } = {}) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  const [major, minor] = process.versions.node.split('.').map(Number);
  check('node', major > 18 || (major === 18 && minor >= 19), `v${process.versions.node} (needs ≥18.19)`);

  for (const rel of [
    './engine/Screenshot Builder.dc.html',
    './engine/Frame.dc.html',
    './engine/support.js',
    './fonts/fonts.css',
    './vendor/react.production.min.js',
    './vendor/react-dom.production.min.js',
  ]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    const ok = await access(p).then(() => true, () => false);
    check(rel.replace('./', ''), ok, ok ? 'present' : `missing: ${p}`);
  }

  // Optional native-capture integrations: reported, never failing — simshot
  // names the missing tool itself when actually used.
  const opt = async (name, cmd, args) => {
    const found = await run(cmd, args).then(() => true, (e) => e.code !== 'ENOENT');
    checks.push({ name, ok: true, optional: true, detail: found ? 'available' : 'not found (only needed for simshot)' });
  };
  await opt('simctl', 'xcrun', ['simctl', 'help']);
  await opt('adb', 'adb', ['version']);
  await opt('maestro', 'maestro', ['--version']);

  let browser = null;
  let how = 'not found';
  try {
    if (browserPath) {
      browser = await chromium.launch({ headless: true, executablePath: browserPath });
      how = `--browser-path ${browserPath}`;
    } else {
      try {
        browser = await chromium.launch({ headless: true });
        how = 'playwright chromium cache';
      } catch {
        browser = await chromium.launch({ headless: true, channel: 'chrome' });
        how = 'system google chrome';
      }
    }
  } catch { /* reported below */ }
  check('browser', !!browser, browser ? `${how} (${browser.version()})` : 'none — run: npx playwright-core install chromium, install Google Chrome, or pass --browser-path');
  await browser?.close().catch(() => {});

  return { ok: checks.every(c => c.ok), checks };
}
