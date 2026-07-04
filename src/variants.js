import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateProject } from './schema.js';
import { lintProject } from './lint.js';

// A variant replaces whole screens by 1-based index and may patch the brand —
// coarse on purpose: unambiguous to generate, trivial to diff, no merge rules.
// { variants: [{ id, name?, screens?: { "1": <screen> }, brand?: <partial> }] }
export function applyVariant(base, variant) {
  const project = structuredClone(base);
  if (variant.brand) project.brand = { ...project.brand, ...variant.brand };
  for (const [key, screen] of Object.entries(variant.screens || {})) {
    const idx = Number(key) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= project.screens.length) {
      throw new Error(`variant "${variant.id}": screen ${key} is out of range (project has ${project.screens.length})`);
    }
    project.screens[idx] = screen;
  }
  return project;
}

export function checkVariantSpec(spec) {
  if (!spec || !Array.isArray(spec.variants) || !spec.variants.length) {
    throw new Error('patches file must be { "variants": [ { "id", "screens": { "1": {…} } } ] }');
  }
  const ids = new Set();
  for (const v of spec.variants) {
    if (!v.id || typeof v.id !== 'string') throw new Error('every variant needs a string "id"');
    if (ids.has(v.id)) throw new Error(`duplicate variant id "${v.id}"`);
    ids.add(v.id);
    if (!v.screens && !v.brand) throw new Error(`variant "${v.id}" changes nothing — add "screens" or "brand"`);
  }
}

export async function emitVariants(base, spec, { outDir, baseName }) {
  checkVariantSpec(spec);
  await mkdir(outDir, { recursive: true });
  const out = [];
  for (const variant of spec.variants) {
    const project = applyVariant(base, variant);
    const valid = validateProject(project);
    if (!valid.ok) {
      throw new Error(`variant "${variant.id}" is invalid: ${valid.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`);
    }
    const file = path.join(outDir, `${baseName}-${variant.id}.json`);
    await writeFile(file, JSON.stringify(project, null, 2) + '\n');
    out.push({
      id: variant.id,
      name: variant.name || null,
      path: file,
      lintFindings: lintProject(project).count,
      changedScreens: Object.keys(variant.screens || {}).map(Number),
    });
  }
  return out;
}
