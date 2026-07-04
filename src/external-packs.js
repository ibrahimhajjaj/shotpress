import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validateProject } from './schema.js';

// Community packs are data-only npm packages named shotpress-pack-<id>
// (scoped variants too) carrying a pack.json:
//   { "name": "Neon", "category": "Gaming", "template": <project JSON> }
// The template is a full project spec; nothing from the package is executed.

const PREFIX = 'shotpress-pack-';

const list = (dir) => { try { return readdirSync(dir); } catch { return []; } };

function readPack(pkgDir, pkgName, packs, problems) {
  const id = pkgName.split('/').pop().slice(PREFIX.length);
  if (!id || packs[id]) return;
  try {
    const meta = JSON.parse(readFileSync(path.join(pkgDir, 'pack.json'), 'utf8'));
    if (!meta.template) throw new Error('pack.json has no "template"');
    const check = validateProject(meta.template);
    if (!check.ok) throw new Error(check.errors.map(e => `${e.path}: ${e.message}`).join('; '));
    packs[id] = {
      name: meta.name || id,
      category: meta.category || 'Community',
      source: pkgName,
      template: meta.template,
    };
  } catch (e) {
    problems.push({ package: pkgName, error: e.message });
  }
}

// Walks node_modules from cwd upward, npm-resolution style.
export function discoverExternalPacks(fromDir = process.cwd()) {
  const packs = {};
  const problems = [];
  let dir = path.resolve(fromDir);
  for (;;) {
    const nm = path.join(dir, 'node_modules');
    if (existsSync(nm)) {
      for (const entry of list(nm)) {
        if (entry.startsWith(PREFIX)) readPack(path.join(nm, entry), entry, packs, problems);
        else if (entry.startsWith('@')) {
          for (const scoped of list(path.join(nm, entry))) {
            if (scoped.startsWith(PREFIX)) readPack(path.join(nm, entry, scoped), `${entry}/${scoped}`, packs, problems);
          }
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { packs, problems };
}

// A pack given as a path to a pack.json or a bare project template file.
export function loadPackFile(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const template = raw.template || raw;
  const check = validateProject(template);
  if (!check.ok) throw new Error(`${file}: ${check.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`);
  return { name: raw.name || path.basename(file, '.json'), category: raw.category || 'Local', source: file, template };
}
