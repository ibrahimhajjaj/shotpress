import { FORMATS, formatList } from './formats.js';
import { LAYER_TYPES, LAYER_ALIASES, BG_PATTERNS, ENUMS } from './schema.js';

const typeOf = (v) => v === null ? 'string|null' : Array.isArray(v) ? 'array' : typeof v;

function fieldsOf(fields, layerType) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = { type: typeOf(v), default: v };
    const e = ENUMS[`${layerType}.${k}`];
    if (e) out[k].enum = e;
  }
  return out;
}

// Assembles the authoritative layer schema from the engine-introspected defaults
// (harness.introspectLayers) plus the enums schema.js already owns. Pure, so it
// unit-tests without a browser.
export function buildSchema(introspected) {
  const layers = {};
  for (const t of LAYER_TYPES) {
    if (introspected[t]) layers[t] = { fields: fieldsOf(introspected[t].fields, t) };
  }
  const aliases = {};
  for (const [alias, base] of Object.entries(LAYER_ALIASES)) {
    if (introspected[alias]) aliases[alias] = { base, fields: fieldsOf(introspected[alias].fields, base) };
  }
  return {
    note: 'authoritative layer schema read from the engine. cx/cy are design-space px for the format; scale/rot/opacity apply to every layer.',
    common: {
      fields: {
        type: { type: 'string', enum: LAYER_TYPES },
        cx: { type: 'number' }, cy: { type: 'number' },
        scale: { type: 'number', default: 1 }, rot: { type: 'number', default: 0 },
        opacity: { type: 'number', default: 1 }, hidden: { type: 'boolean', default: false },
        blend: { type: 'string', note: 'CSS mix-blend-mode (screen/overlay/multiply/…) — glows sit naturally on dark with "screen"' },
      },
    },
    depth: {
      note: 'shape, icon and device accept these (drawn natively by the engine)',
      fields: {
        shadow: { type: 'boolean | object | array', note: 'true = default drop shadow; {x,y,blur,spread,color} or an array of them = custom' },
        glow: { type: 'object', note: '{blur,spread,color} — a coloured halo (device uses a rounded drop-shadow)' },
        blur: { type: 'number', note: 'gaussian blur in px (shape/icon)' },
      },
    },
    bg: {
      note: 'each screen carries one bg',
      fields: {
        type: { type: 'string', enum: ['solid', 'gradient', 'image'] },
        value: { type: 'string', note: 'CSS colour or gradient (solid/gradient)' },
        image: { type: 'string|null', note: 'path or data URL (image type)' },
        pattern: { type: 'string', enum: BG_PATTERNS, default: 'none' },
      },
    },
    formats: formatList().map(f => f.id),
    layers,
    aliases,
  };
}

// A reference project that uses every layer type once — the scaffold doubles as
// living docs, so an agent sees the whole vocabulary, not just device/text.
export function buildKitchenSink(introspected, format = 'iphone') {
  const fmt = FORMATS[format] || FORMATS.iphone;
  const col = Math.round(fmt.w / 2);
  const mk = (key, over) => ({ id: `ks_${key}`, type: introspected[key].type, ...introspected[key].fields, ...over });
  const bg = { type: 'gradient', value: 'linear-gradient(165deg,#1a1230,#0c0a18)', pattern: 'dots', image: null };
  const brand = { appName: 'Kitchen Sink', accent: '#7c5cff', colors: ['#7c5cff'], bezel: 'black', clayColor: '#9b8cff', logo: null };
  const stack = ['text', 'heading', 'rating', 'badge', 'callout', 'icon', 'feature', 'shape', 'circle', 'line', 'logo', 'image'];
  const step = Math.round((fmt.h * 0.9) / stack.length);
  const catalogue = stack.map((key, i) => mk(key, { cx: col, cy: Math.round(fmt.h * 0.06) + i * step, scale: 0.9 }));
  const device = mk('device', { cx: col, cy: Math.round(fmt.h * 0.52) });
  return {
    format,
    brand,
    screens: [
      { bg, layers: catalogue },
      { bg: { ...bg, pattern: 'grid' }, layers: [mk('heading', { id: 'ks_title', cx: col, cy: Math.round(fmt.h * 0.1), text: 'Every **layer** type', scale: 1 }), device] },
    ],
  };
}

const cell = (f) => (f.enum ? f.enum.join(' \\| ') : f.type);
const def = (f) => (f.default === undefined ? '' : JSON.stringify(f.default)) + (f.note ? ` — ${f.note}` : '');

export function schemaMarkdown(schema) {
  const table = (fields) => ['| field | type | default |', '|---|---|---|', ...Object.entries(fields).map(([k, f]) => `| \`${k}\` | ${cell(f)} | ${def(f)} |`)];
  const out = ['# Layer catalogue', '', schema.note, '',
    'Generated from the engine by `npx shotpress schema --markdown`. `shotpress schema --json` gives the machine-readable form.', '',
    '## Every layer carries these', '', ...table(schema.common.fields),
    ...(schema.depth ? ['', '## Depth (shape / icon / device)', '', schema.depth.note, '', ...table(schema.depth.fields)] : []),
    '', '## Background — `screen.bg`', '', ...table(schema.bg.fields)];
  for (const [t, d] of Object.entries(schema.layers)) {
    out.push('', `## \`${t}\``, '', ...table(d.fields));
  }
  if (Object.keys(schema.aliases).length) {
    out.push('', '## Add-keyword aliases', '');
    for (const [a, d] of Object.entries(schema.aliases)) out.push(`- \`${a}\` — a \`${d.base}\` preset (differs in size/shape defaults)`);
  }
  return out.join('\n') + '\n';
}
