import { FORMATS } from './formats.js';

const LAYER_TYPES = ['device', 'text', 'rating', 'callout', 'badge', 'logo', 'image', 'shape', 'icon', 'feature'];
const ENUMS = {
  'device.kind': ['phone', 'tablet', 'mac', 'watch'],
  'device.os': ['ios', 'android', 'mac', 'watch'],
  'device.treatment': ['plain', 'bleed', 'angled', 'compare', 'duo', 'pano', 'multi'],
  'device.notch': ['auto', 'island', 'notch', 'punch', 'none'],
  'bg.type': ['solid', 'gradient', 'image'],
};
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLORISH = /^(rgb|rgba|hsl|hsla|linear-gradient|radial-gradient|conic-gradient)\(|^[a-z]+$/i;

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// Validates a project spec. Structural problems are errors; questionable color
// values only warn since the engine passes them straight to CSS.
export function validateProject(project) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => errors.push({ path, message: msg });
  const warn = (path, msg) => warnings.push({ path, message: msg });

  if (!project || typeof project !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'project must be a JSON object' }], warnings };
  }
  if (!FORMATS[project.format]) {
    err('format', `unknown format "${project.format}" — one of: ${Object.keys(FORMATS).join(', ')}`);
  }
  if (!Array.isArray(project.screens) || project.screens.length === 0) {
    err('screens', 'screens must be a non-empty array');
    return { ok: false, errors, warnings };
  }

  const color = (path, v) => {
    if (v == null || v === '') return;
    if (typeof v !== 'string') { warn(path, 'color should be a string'); return; }
    if (!HEX.test(v) && !CSS_COLORISH.test(v)) warn(path, `"${v}" does not look like a CSS color`);
  };

  project.screens.forEach((screen, si) => {
    const sp = `screens[${si}]`;
    const bg = screen.bg;
    if (!bg || typeof bg !== 'object') err(`${sp}.bg`, 'missing bg object');
    else {
      if (!ENUMS['bg.type'].includes(bg.type)) err(`${sp}.bg.type`, `must be one of ${ENUMS['bg.type'].join('|')}`);
      if (bg.type === 'image' && !bg.image) err(`${sp}.bg.image`, 'bg.type is "image" but bg.image is missing');
      if (bg.type !== 'image') color(`${sp}.bg.value`, bg.value);
    }
    if (!Array.isArray(screen.layers)) { err(`${sp}.layers`, 'layers must be an array'); return; }

    screen.layers.forEach((l, li) => {
      const lp = `${sp}.layers[${li}]`;
      if (!l || typeof l !== 'object') { err(lp, 'layer must be an object'); return; }
      if (!LAYER_TYPES.includes(l.type)) { err(`${lp}.type`, `unknown layer type "${l.type}"`); return; }
      if (!isNum(l.cx) || !isNum(l.cy)) err(lp, 'cx and cy must be numbers');
      if (l.scale != null && !isNum(l.scale)) err(`${lp}.scale`, 'scale must be a number');
      if (l.rot != null && !isNum(l.rot)) err(`${lp}.rot`, 'rot must be a number');

      if (l.type === 'device') {
        for (const key of ['kind', 'os']) {
          if (!ENUMS[`device.${key}`].includes(l[key])) err(`${lp}.${key}`, `must be one of ${ENUMS[`device.${key}`].join('|')}`);
        }
        if (l.treatment != null && !ENUMS['device.treatment'].includes(l.treatment)) {
          err(`${lp}.treatment`, `must be one of ${ENUMS['device.treatment'].join('|')}`);
        }
        if (l.notch != null && !ENUMS['device.notch'].includes(l.notch)) {
          err(`${lp}.notch`, `must be one of ${ENUMS['device.notch'].join('|')}`);
        }
      }
      if (l.type === 'text') {
        if (typeof l.text !== 'string') err(`${lp}.text`, 'text layer needs a string "text"');
        if (l.fontSize != null && !isNum(l.fontSize)) err(`${lp}.fontSize`, 'fontSize must be a number');
        color(`${lp}.color`, l.color);
        color(`${lp}.accent`, l.accent);
      }
    });
  });

  if (project.brand) {
    color('brand.accent', project.brand.accent);
    (project.brand.colors || []).forEach((c, i) => color(`brand.colors[${i}]`, c));
  }

  return { ok: errors.length === 0, errors, warnings };
}
