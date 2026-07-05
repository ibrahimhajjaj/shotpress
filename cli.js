#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { FORMATS, STORES, formatList } from './src/formats.js';
import { PACKS, packList } from './src/packs.js';
import { validateProject } from './src/schema.js';
import { renderProject } from './src/render.js';
import { buildProject, launchHarness, reflowProject } from './src/harness.js';
import { discoverExternalPacks, loadPackFile } from './src/external-packs.js';
import { fastlanePath } from './src/fastlane.js';
import { installFrames, listFrames, APPLE_BEZELS, APPLE_TERMS_URL } from './src/frames.js';
import { zipFiles, zipName } from './src/zip.js';
import { lintProject, sketchProject } from './src/lint.js';
import { parseMasks } from './src/imgedit.js';
import { captureRoutes } from './src/capture.js';
import { simShot } from './src/simshot.js';
import { emitVariants } from './src/variants.js';
import { editProject } from './src/edit.js';
import { runDoctor } from './src/doctor.js';

const USAGE = `shotpress — App Store / Google Play screenshot renderer

Usage:
  shotpress render <project.json>      render every screen to images
  shotpress render-all <project.json>  render at every store size
  shotpress new                        scaffold a project.json
  shotpress capture <url>              screenshot a live web app at device size
  shotpress simshot <ios|android>      screenshot the booted simulator/emulator
  shotpress packs                      list starter packs (JSON)
  shotpress formats                    list formats (JSON)
  shotpress validate <project.json>    validate a project spec
  shotpress lint <project.json>        design-quality checks (numeric, pre-render)
  shotpress variants <project.json>    emit A/B variant projects for CPP tests
  shotpress edit <project.json>        open the visual editor; edits autosave back
  shotpress frames [install]           official Apple bezels (downloaded from Apple)
  shotpress doctor                     preflight: node, engine files, browser

render options:
  --format <id>       ${Object.keys(FORMATS).join('|')} (default: project.format)
  --out <dir>         output directory (default ./shotpress-out)
  --type png|jpeg|svg default png
  --scale <n>         override render scale
  --screens 1,3,5     subset, 1-indexed (default all)
  --name <prefix>     filename prefix (default "screen")
  --rtl               mirror the layout for RTL markets (supply translated copy)
  --zip               also write a zip bundle
  --json              print a JSON manifest to stdout

render-all options:
  --stores appstore,play,mac,watch   (default appstore,play)
  --fastlane                         also copy into fastlane deliver/supply layout
  --locale <str>                     fastlane locale directory (default en-US)
  --out, --type, --zip, --json       as above

new options:
  --pack <id>         ${Object.keys(PACKS).join('|')},
                      an installed shotpress-pack-<id>, or a pack .json path
  --format <id>       default iphone
  --app-name <str>    brand.appName
  --accent <hex>      brand.accent
  --screens <n>       blank screens when no --pack (default 3)
  --out <file>        write to file instead of stdout

capture options:
  --routes /,/settings   comma-separated routes (default /)
  --discover             auto-discover routes (sitemap, links, common paths)
  --max-routes <n>       cap on discovered routes (default 8)
  --format <id>          device viewport to emulate (default iphone)
  --out <dir>            default ./shotpress-captures
  --dark                 prefers-color-scheme: dark
  --wait-selector <css>  wait for an element before shooting
  --cookies "k=v; k2=v2" session cookies for the target origin
  --json                 print a JSON manifest

simshot options:
  --device <id>       simulator UDID / adb serial (default: the booted one)
  --flow <file>       run a Maestro flow first; collect its takeScreenshot pngs
  --video             record video instead (with --flow: records the driven session)
  --duration <s>      video length without a flow (default 20, max 120)
  --crop-top <px>     trim capture tops (status quirks); still captures only
  --crop-bottom <px>  trim capture bottoms (nav bars, dev overlays)
  --mask x,y,w,h      fill a rect with its surrounding color; repeatable
  --name <str>        output filename without extension (default "sim"/"preview")
  --out <dir>         default ./shotpress-captures
  --json              print a JSON manifest

lint options:
  --sketch            print an ascii map of layer positions per screen
  --strict            non-zero exit when findings exist
  --json              findings as JSON

variants options:
  --patches <file>    { "variants": [{ "id", "screens": { "1": {…} }, "brand": {…} }] }
  --out <dir>         where variant project files go (default ./shotpress-variants)
  --render            also render each variant (project format) into <out>/<id>/
  --json              print a JSON manifest

global:
  --browser-path <p>  use an existing Chromium instead of Playwright's
`;

function fail(message, code = 1) {
  process.stderr.write(JSON.stringify({ error: message }) + '\n');
  process.exit(code);
}

async function loadProject(file) {
  if (!file) fail('missing <project.json> argument', 2);
  let raw;
  try { raw = await readFile(file, 'utf8'); } catch { fail(`cannot read ${file}`, 2); }
  try { return JSON.parse(raw); } catch (e) { fail(`${file} is not valid JSON: ${e.message}`, 2); }
}

function parse(argv, extra = {}) {
  try {
    return parseUnsafe(argv, extra);
  } catch (e) {
    fail(e.message, 2);
  }
}

function parseUnsafe(argv, extra = {}) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: 'string' },
      out: { type: 'string' },
      type: { type: 'string', default: 'png' },
      scale: { type: 'string' },
      screens: { type: 'string' },
      name: { type: 'string', default: 'screen' },
      zip: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      stores: { type: 'string', default: 'appstore,play' },
      pack: { type: 'string' },
      'app-name': { type: 'string' },
      accent: { type: 'string' },
      'browser-path': { type: 'string' },
      'headless-browser-path': { type: 'string' },
      routes: { type: 'string', default: '/' },
      discover: { type: 'boolean', default: false },
      'max-routes': { type: 'string', default: '8' },
      device: { type: 'string' },
      flow: { type: 'string' },
      dark: { type: 'boolean', default: false },
      'wait-selector': { type: 'string' },
      cookies: { type: 'string' },
      strict: { type: 'boolean', default: false },
      patches: { type: 'string' },
      render: { type: 'boolean', default: false },
      rtl: { type: 'boolean', default: false },
      fastlane: { type: 'boolean', default: false },
      locale: { type: 'string', default: 'en-US' },
      'accept-apple-terms': { type: 'boolean', default: false },
      kinds: { type: 'string' },
      dmg: { type: 'string' },
      video: { type: 'boolean', default: false },
      duration: { type: 'string', default: '20' },
      'crop-top': { type: 'string', default: '0' },
      'crop-bottom': { type: 'string', default: '0' },
      mask: { type: 'string', multiple: true },
      sketch: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      ...extra,
    },
  });
}

function checkType(type) {
  if (!['png', 'jpeg', 'svg'].includes(type)) fail(`--type must be png, jpeg or svg (got "${type}")`, 2);
}

const browserPathOf = (v) => v['browser-path'] || v['headless-browser-path'] || null;

function parseScale(v) {
  if (v.scale == null) return null;
  const n = Number(v.scale);
  if (!Number.isFinite(n) || n <= 0) fail(`--scale must be a positive number (got "${v.scale}")`, 2);
  return n;
}

function parseScreens(v) {
  if (v.screens == null) return null;
  const list = v.screens.split(',').map(s => Number(s.trim()));
  if (!list.length || list.some(n => !Number.isInteger(n) || n < 1)) {
    fail(`--screens must be a comma-separated list of 1-indexed integers (got "${v.screens}")`, 2);
  }
  return list;
}

function parseLocale(v) {
  if (!/^[A-Za-z]{2}([-_][A-Za-z0-9]+)*$/.test(v.locale)) {
    fail(`--locale must look like en-US or ar-SA (got "${v.locale}")`, 2);
  }
  return v.locale;
}

function parseMaxRoutes(v) {
  const n = Number(v['max-routes']);
  if (!Number.isInteger(n) || n <= 0) fail(`--max-routes must be a positive integer (got "${v['max-routes']}")`, 2);
  return n;
}

function progress(quiet) {
  return quiet ? () => {} : (n, total) => process.stderr.write(`\rrendering ${n}/${total}…${n === total ? '\n' : ''}`);
}

async function cmdRender(argv) {
  const { values: v, positionals } = parse(argv);
  const file = positionals[0];
  const project = await loadProject(file);
  const check = validateProject(project);
  if (!check.ok) fail(`invalid project: ${check.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 1);
  checkType(v.type);

  const result = await renderProject(project, {
    format: v.format || project.format,
    outDir: v.out || './shotpress-out',
    type: v.type,
    scale: parseScale(v),
    screens: parseScreens(v),
    name: v.name,
    rtl: v.rtl,
    browserPath: browserPathOf(v),
    baseDir: path.dirname(path.resolve(file)),
    onProgress: progress(v.json),
  });

  if (v.zip) {
    const zip = await zipFiles(
      result.files.map(f => ({ path: f.path, name: path.basename(f.path) })),
      zipName(v.out || './shotpress-out', v.name),
    );
    result.zip = zip.path;
  }
  for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  if (v.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else result.files.forEach(f => process.stdout.write(f.path + '\n'));
}

async function cmdRenderAll(argv) {
  const { values: v, positionals } = parse(argv);
  const file = positionals[0];
  const project = await loadProject(file);
  const check = validateProject(project);
  if (!check.ok) fail(`invalid project: ${check.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 1);
  checkType(v.type);
  if (v.type === 'svg') fail('render-all emits raster sets; use render --type svg for vectors', 2);

  const stores = v.stores.split(',').map(s => s.trim()).filter(Boolean);
  for (const s of stores) if (!STORES[s]) fail(`unknown store "${s}" — one of: ${Object.keys(STORES).join(', ')}`, 2);

  const outRoot = v.out || './shotpress-out';
  const all = { stores: {}, files: [], warnings: [] };
  // one browser for the whole batch — only the context (deviceScaleFactor)
  // changes between formats
  const harness = await launchHarness({ browserPath: browserPathOf(v) });
  try {
    for (const store of stores) {
      for (const format of STORES[store]) {
        const outDir = path.join(outRoot, store, format);
        await mkdir(outDir, { recursive: true });
        process.stderr.write(`${store}/${format}\n`);
        const result = await renderProject(project, {
          format,
          outDir,
          type: v.type,
          name: v.name,
          rtl: v.rtl,
          baseDir: path.dirname(path.resolve(file)),
          onProgress: progress(v.json),
        }, harness);
        all.stores[store] ??= {};
        all.stores[store][format] = result.files.map(f => f.path);
        all.files.push(...result.files.map(f => ({ ...f, store, format })));
        all.warnings.push(...result.warnings);
        if (v.fastlane) {
          all.fastlane ??= [];
          for (const f of result.files) {
            // the play feature graphic is a single slot — first screen only
            if (format === 'feature' && f.screen !== 1) continue;
            const dest = path.join(outRoot, fastlanePath({
              store, format, locale: parseLocale(v), screen: f.screen, ext: path.extname(f.path).slice(1),
            }));
            await mkdir(path.dirname(dest), { recursive: true });
            await copyFile(f.path, dest);
            all.fastlane.push(dest);
          }
        }
      }
    }
  } finally {
    await harness.close();
  }

  if (v.zip) {
    const zip = await zipFiles(
      all.files.map(f => ({ path: f.path, name: path.relative(outRoot, f.path) })),
      zipName(outRoot, 'shotpress-screens'),
    );
    all.zip = zip.path;
  }
  for (const w of all.warnings) process.stderr.write(`warning: ${w}\n`);
  if (v.json) process.stdout.write(JSON.stringify(all, null, 2) + '\n');
  else all.files.forEach(f => process.stdout.write(f.path + '\n'));
}

async function cmdNew(argv) {
  const { values: v } = parse(argv);
  const format = v.format || 'iphone';
  if (!FORMATS[format]) fail(`unknown format "${format}"`, 2);

  let project;
  if (!v.pack || PACKS[v.pack]) {
    project = await buildProject({
      pack: v.pack || null,
      format,
      appName: v['app-name'] || null,
      accent: v.accent || null,
      screens: v.screens ? Number(v.screens) : 3,
      browserPath: browserPathOf(v),
    });
  } else {
    // community pack: an installed shotpress-pack-<id> or a local pack file
    let pack;
    if (v.pack.endsWith('.json')) {
      try { pack = loadPackFile(v.pack); } catch (e) { fail(e.message, 2); }
    } else {
      const { packs, problems } = discoverExternalPacks();
      for (const p of problems) process.stderr.write(`warning: skipped ${p.package}: ${p.error}\n`);
      pack = packs[v.pack];
      if (!pack) {
        fail(`unknown pack "${v.pack}" — builtin: ${Object.keys(PACKS).join(', ')}; or install shotpress-pack-${v.pack}; or pass a pack file path`, 2);
      }
    }
    project = structuredClone(pack.template);
    project.brand = project.brand || { logo: null, appName: 'Your App', colors: [], accent: '#6d5cf5', bezel: 'black', clayColor: '#9b8cff' };
    if (v['app-name']) project.brand.appName = v['app-name'];
    if (v.accent) { project.brand.accent = v.accent; project.brand.colors = [v.accent]; }
    if (project.format !== format) {
      project = await reflowProject(project, format, { browserPath: browserPathOf(v) });
    }
  }

  const json = JSON.stringify(project, null, 2) + '\n';
  if (v.out) { await writeFile(v.out, json); process.stderr.write(`wrote ${v.out}\n`); }
  else process.stdout.write(json);
  if (JSON.stringify(project).includes('"placeholder":true')) {
    process.stderr.write('note: pack copy includes demo ratings/quotes marked "placeholder" — lint flags them until you replace the content and drop the flag\n');
  }
}

async function cmdValidate(argv) {
  const { positionals } = parse(argv);
  const project = await loadProject(positionals[0]);
  const result = validateProject(project);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exit(1);
}

async function cmdLint(argv) {
  const { values: v, positionals } = parse(argv);
  const project = await loadProject(positionals[0]);
  const result = lintProject(project);
  if (v.sketch) process.stdout.write(sketchProject(project) + '\n\n');
  if (v.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else if (!result.count) process.stdout.write('no findings\n');
  else for (const f of result.findings) {
    process.stdout.write(`${f.screen ? `screen ${f.screen}` : 'set'}  ${f.rule}  ${f.message}\n`);
  }
  if (v.strict && result.count) process.exit(1);
}

async function cmdVariants(argv) {
  const { values: v, positionals } = parse(argv);
  const base = await loadProject(positionals[0]);
  const check = validateProject(base);
  if (!check.ok) fail(`invalid base project: ${check.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 1);
  if (!v.patches) fail('variants needs --patches <file>', 2);
  const spec = await loadProject(v.patches);

  const outDir = v.out || './shotpress-variants';
  const baseName = path.basename(positionals[0], '.json');
  const manifest = { variants: await emitVariants(base, spec, { outDir, baseName }) };

  if (v.render) {
    const harness = await launchHarness({ browserPath: browserPathOf(v) });
    try {
      for (const variant of manifest.variants) {
        const project = await loadProject(variant.path);
        const result = await renderProject(project, {
          outDir: path.join(outDir, variant.id),
          name: v.name,
          baseDir: path.dirname(path.resolve(positionals[0])),
          onProgress: progress(v.json),
        }, harness);
        variant.rendered = result.files.map(f => f.path);
      }
    } finally {
      await harness.close();
    }
  }
  if (v.json) process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  else manifest.variants.forEach(x => process.stdout.write(`${x.id}\t${x.path}\tlint:${x.lintFindings}\n`));
}

async function cmdCapture(argv) {
  const { values: v, positionals } = parse(argv);
  const url = positionals[0];
  if (!url || !/^https?:\/\//.test(url)) fail('capture needs an http(s) url', 2);
  const result = await captureRoutes(url, {
    routes: v.routes.split(',').map(r => r.trim()).filter(Boolean),
    format: v.format || 'iphone',
    outDir: v.out || './shotpress-captures',
    dark: v.dark,
    waitSelector: v['wait-selector'] || null,
    cookies: v.cookies || null,
    browserPath: browserPathOf(v),
    discover: v.discover,
    maxRoutes: parseMaxRoutes(v),
    onProgress: v.json ? () => {} : (n, t, r) => process.stderr.write(`capturing ${n}/${t} ${r}\n`),
  });
  if (v.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else result.files.forEach(f => process.stdout.write(f.path + '\n'));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'render': await cmdRender(rest); break;
    case 'render-all': await cmdRenderAll(rest); break;
    case 'new': await cmdNew(rest); break;
    case 'packs': {
      const { packs, problems } = discoverExternalPacks();
      for (const p of problems) process.stderr.write(`warning: skipped ${p.package}: ${p.error}\n`);
      process.stdout.write(JSON.stringify(packList(packs), null, 2) + '\n');
      break;
    }
    case 'formats': process.stdout.write(JSON.stringify(formatList(), null, 2) + '\n'); break;
    case 'validate': await cmdValidate(rest); break;
    case 'lint': await cmdLint(rest); break;
    case 'variants': await cmdVariants(rest); break;
    case 'edit': {
      const { values: v, positionals } = parse(rest);
      const file = positionals[0];
      const project = await loadProject(file);
      const check = validateProject(project);
      if (!check.ok) fail(`invalid project: ${check.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 1);
      process.stderr.write(`editing ${file} — changes autosave; close the browser window to finish\n`);
      const { saves } = await editProject(file, { browserPath: browserPathOf(v) });
      process.stderr.write(`done — ${saves} save${saves === 1 ? '' : 's'} written\n`);
      break;
    }
    case 'capture': await cmdCapture(rest); break;
    case 'frames': {
      const { values: v, positionals } = parse(rest);
      if (positionals[0] === 'install') {
        const kinds = v.kinds ? v.kinds.split(',').map(k => k.trim()) : undefined;
        if (v.dmg && (!kinds || kinds.length !== 1)) fail('--dmg needs exactly one --kinds entry', 2);
        const meta = await installFrames({
          kinds,
          accept: v['accept-apple-terms'],
          browserPath: browserPathOf(v),
          local: v.dmg ? { [kinds[0]]: v.dmg } : {},
          onProgress: (kind, step) => process.stderr.write(`${kind}: ${step}\n`),
        });
        process.stdout.write(JSON.stringify(Object.fromEntries(
          Object.entries(meta).map(([k, m]) => [k, { source: m.source, variants: m.variants.map(x => x.name) }]),
        ), null, 2) + '\n');
      } else {
        const meta = await listFrames();
        if (!Object.keys(meta).length) {
          process.stdout.write(`no frames installed — available from Apple: ${Object.keys(APPLE_BEZELS).join(', ')}\n`
            + `install with: shotpress frames install --accept-apple-terms (terms: ${APPLE_TERMS_URL})\n`);
        } else {
          for (const [kind, m] of Object.entries(meta)) {
            process.stdout.write(`${kind}  ${m.source}  (${m.variants.length} variants: ${m.variants.map(x => x.name).join(', ')})\n`);
          }
        }
      }
      break;
    }
    case 'simshot': {
      const { values: v, positionals } = parse(rest);
      const duration = Number(v.duration);
      if (v.video && (!Number.isInteger(duration) || duration < 1 || duration > 120)) {
        fail(`--duration must be an integer between 1 and 120 seconds (got "${v.duration}")`, 2);
      }
      const crops = {};
      for (const key of ['crop-top', 'crop-bottom']) {
        const n = Number(v[key]);
        if (!Number.isInteger(n) || n < 0) fail(`--${key} must be a non-negative integer (got "${v[key]}")`, 2);
        crops[key === 'crop-top' ? 'cropTop' : 'cropBottom'] = n;
      }
      const masks = parseMasks(v.mask || []);
      const result = await simShot({
        platform: positionals[0],
        device: v.device || null,
        outDir: v.out || './shotpress-captures',
        name: v.name === 'screen' ? (v.video ? 'preview' : 'sim') : v.name,
        flow: v.flow || null,
        video: v.video,
        duration,
        clean: { ...crops, masks },
        browserPath: browserPathOf(v),
      });
      if (v.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else result.files.forEach(f => process.stdout.write(f.path + '\n'));
      break;
    }
    case 'doctor': {
      const { values: v } = parse(rest);
      const result = await runDoctor({ browserPath: browserPathOf(v) });
      if (v.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else for (const c of result.checks) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${c.detail}\n`);
      if (!result.ok) process.exit(1);
      break;
    }
    case undefined:
    case 'help':
    case '--help':
      process.stdout.write(USAGE);
      break;
    default:
      fail(`unknown command "${cmd}" — run shotpress help`, 2);
  }
} catch (e) {
  const code = e.code === 'NO_BROWSER' || e.code === 'NO_TOOL' ? 3 : e.code === 'USAGE' ? 2 : 1;
  fail(e.message, code);
}
