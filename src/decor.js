import { FORMATS } from './formats.js';

// Decorative background/overlay art as self-contained SVG, generated on-brand
// and deterministically (seedable) so a whole set can share one visual family.
// It renders through the real browser at export, so it carries effects the flat
// `shape` layer can't — soft blur/glow, gradient fills, feTurbulence grain,
// aurora mesh — without touching the vendored engine. Output is a data URL plus
// a paste-ready layer or bg snippet, so an agent runs one command and drops the
// result straight into a project.

// --- colour helpers ---------------------------------------------------------
function normHex(c) {
  let h = String(c).trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) throw new Error(`colour must be a hex value (got "${c}")`);
  if (h.length === 4) h = '#' + [...h.slice(1)].map(x => x + x).join('');
  return h.toLowerCase();
}
const toRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = toRgb(a), B = toRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lighten = (h, t) => mix(h, '#ffffff', t);
const darken = (h, t) => mix(h, '#000000', t);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// mulberry32 — small seeded PRNG so the same seed always draws the same art
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (x) => Math.round(x * 10) / 10;
const svg = (w, h, op, inner, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}<g opacity="${op}">${inner}</g></svg>`;

// smooth closed blob path through jittered points around a circle
function blobPath(cx, cy, r, count, jitter, rand) {
  const pts = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const rr = r * (1 - jitter + rand() * jitter * 2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  let d = `M ${n1(pts[0][0])} ${n1(pts[0][1])} `;
  for (let i = 0; i < count; i++) {
    const p0 = pts[(i - 1 + count) % count], p1 = pts[i], p2 = pts[(i + 1) % count], p3 = pts[(i + 2) % count];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${n1(c1x)} ${n1(c1y)} ${n1(c2x)} ${n1(c2y)} ${n1(p2[0])} ${n1(p2[1])} `;
  }
  return d + 'Z';
}

// --- kinds ------------------------------------------------------------------
// draw(ctx) returns the SVG string; ctx = { w, h, c1, c2, seed, op }.
const KINDS = {
  blob: {
    desc: 'soft organic blob with a gradient fill and a blur — depth behind a device or in a corner',
    usage: 'layer', op: 0.5,
    draw: ({ w, h, c1, c2, seed, op }) => {
      const d = blobPath(w / 2, h / 2, Math.min(w, h) * 0.42, 7, 0.22, rng(seed));
      const blur = n1(Math.min(w, h) * 0.02);
      return svg(w, h, op,
        `<path d="${d}" fill="url(#g)" filter="url(#b)"/>`,
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter>`);
    },
  },
  glow: {
    desc: 'a single soft radial glow — the light that lifts a phone off a dark ground; place behind the device',
    usage: 'layer', op: 0.6,
    draw: ({ w, h, c1, op }) => svg(w, h, op,
      `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${n1(w * 0.5)}" ry="${n1(h * 0.5)}" fill="url(#rg)"/>`,
      `<radialGradient id="rg"><stop offset="0" stop-color="${c1}" stop-opacity="1"/><stop offset="0.6" stop-color="${c1}" stop-opacity="0.35"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>`),
  },
  rings: {
    desc: 'concentric rings fading outward — a subtle orbit/ripple motif centred behind content',
    usage: 'layer', op: 0.4,
    draw: ({ w, h, c1, c2, op }) => {
      const cx = w / 2, cy = h / 2, rmax = Math.min(w, h) * 0.46;
      let r = '';
      for (let i = 0; i < 5; i++) {
        r += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(rmax * (1 - i * 0.16))}" fill="none" stroke="${mix(c1, c2, i / 4)}" stroke-width="${n1(1.5 + i * 0.3)}" opacity="${(0.55 - i * 0.08).toFixed(2)}"/>`;
      }
      return svg(w, h, op, r);
    },
  },
  waves: {
    desc: 'stacked sine-wave bands — a soft divider anchored to the lower canvas',
    usage: 'layer', op: 0.55,
    draw: ({ w, h, c1, c2, seed, op }) => {
      const rand = rng(seed);
      let bands = '';
      for (let i = 0; i < 3; i++) {
        const baseY = h * (0.55 + i * 0.14), amp = h * (0.05 + rand() * 0.04);
        const wl = w * (0.5 + rand() * 0.4), phase = rand() * Math.PI * 2;
        let d = `M 0 ${n1(baseY)} `;
        for (let x = 0; x <= w; x += Math.max(4, w / 48)) d += `L ${n1(x)} ${n1(baseY + Math.sin((x / wl) * Math.PI * 2 + phase) * amp)} `;
        d += `L ${w} ${h} L 0 ${h} Z`;
        bands += `<path d="${d}" fill="${mix(c1, c2, i / 2)}" opacity="${(0.45 + 0.2 * i).toFixed(2)}"/>`;
      }
      return svg(w, h, op, bands);
    },
  },
  grain: {
    desc: 'fine grain/noise texture — overlay it at low opacity over a flat background for a premium finish',
    usage: 'overlay', op: 0.08,
    draw: ({ w, h, seed, op }) => svg(w, h, op,
      `<rect width="${w}" height="${h}" filter="url(#n)"/>`,
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`),
  },
  mask: {
    desc: 'a screenshot clipped into a circle or rounded card (needs --image) — avatar bubbles, a magnified UI detail',
    usage: 'layer', op: 1,
    draw: ({ w, h, c1, op, image, shape, radius }) => {
      if (!image) throw new Error('decor mask needs --image <file> to clip');
      const clip = shape === 'rounded'
        ? `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}"/>`
        : `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}"/>`;
      const ring = shape === 'rounded'
        ? `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${radius}" fill="none" stroke="${c1}" stroke-width="3"/>`
        : `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 1.5}" fill="none" stroke="${c1}" stroke-width="3"/>`;
      return svg(w, h, op,
        `<image href="${image}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp)"/>${ring}`,
        `<clipPath id="cp">${clip}</clipPath>`);
    },
  },
  mesh: {
    desc: 'aurora / mesh gradient — a full-canvas background of soft overlapping colour fields',
    usage: 'background', op: 1,
    draw: ({ w, h, c1, c2, seed, op }) => {
      const rand = rng(seed);
      const cols = [c1, c2, lighten(c1, 0.35)];
      let defs = '', shapes = '';
      for (let i = 0; i < 4; i++) {
        const gx = (0.2 + rand() * 0.6) * 100, gy = (0.15 + rand() * 0.7) * 100, rad = (0.4 + rand() * 0.35) * 100;
        defs += `<radialGradient id="m${i}" cx="${gx.toFixed(0)}%" cy="${gy.toFixed(0)}%" r="${rad.toFixed(0)}%"><stop offset="0" stop-color="${cols[i % cols.length]}" stop-opacity="0.9"/><stop offset="1" stop-color="${cols[i % cols.length]}" stop-opacity="0"/></radialGradient>`;
        shapes += `<rect width="${w}" height="${h}" fill="url(#m${i})"/>`;
      }
      return svg(w, h, op, `<rect width="${w}" height="${h}" fill="${darken(c1, 0.62)}"/>${shapes}`, defs);
    },
  },
};

// Background art matches the canvas (drawn edge to edge via bg cover). Layer and
// overlay art is a SQUARE, because the engine sizes an image layer as w0×w0:
// grain covers the canvas as the larger-dimension square, the rest sit on a
// canvas-width square the agent positions.
function resolveSize(size, kind, format) {
  if (size) {
    const m = /^(\d+)x(\d+)$/i.exec(String(size).trim());
    if (!m) throw new Error(`--size must be WxH (got "${size}")`);
    return { w: +m[1], h: +m[2] };
  }
  const fmt = FORMATS[format] || FORMATS.iphone;
  if (KINDS[kind].usage === 'background') return { w: fmt.w, h: fmt.h };
  const s = kind === 'grain' ? Math.max(fmt.w, fmt.h) : Math.min(fmt.w, fmt.h);
  return { w: s, h: s };
}

// Metadata for `shotpress decor` with no kind — a self-describing catalogue so
// an agent learns the toolbox from one call, not by reading source.
export function decorKinds() {
  return Object.entries(KINDS).map(([id, k]) => ({ id, description: k.desc, usage: k.usage, defaultOpacity: k.op }));
}

// Builds one decoration and everything needed to use it.
export function makeDecor(kind, { color = '#6d5cf5', color2 = null, seed = 1, opacity = null, size = null, format = 'iphone', image = null, shape = 'circle' } = {}) {
  const meta = KINDS[kind];
  if (!meta) throw new Error(`unknown decor kind "${kind}" — one of: ${Object.keys(KINDS).join(', ')}`);
  const c1 = normHex(color);
  const c2 = color2 ? normHex(color2) : lighten(c1, 0.22);
  const op = opacity != null ? clamp(Number(opacity), 0, 1) : meta.op;
  const { w, h } = resolveSize(size, kind, format);
  const seedN = Math.max(1, Number(seed) | 0);
  const radius = Math.round(Math.min(w, h) * 0.14);
  const markup = meta.draw({ w, h, c1, c2, seed: seedN, op, image, shape, radius });
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(markup).toString('base64');

  const fmt = FORMATS[format] || FORMATS.iphone;
  const out = { kind, usage: meta.usage, width: w, height: h, dataUrl, svg: markup };
  if (meta.usage === 'background') {
    out.bg = { type: 'image', value: '', pattern: 'none', image: dataUrl };
    out.hint = 'set as a screen\'s "bg"';
  } else {
    // layer / overlay: an image layer (drawn from `src`, sized w0×w0), centred on
    // the canvas by default. Overlays cover it; place layer kinds where depth is
    // needed. opacity is already baked into the SVG, but l.opacity also works.
    out.layer = { id: `decor_${kind}`, type: 'image', cx: Math.round(fmt.w / 2), cy: Math.round(fmt.h / 2), w0: w, scale: 1, rot: 0, fit: 'cover', src: dataUrl };
    out.hint = meta.usage === 'overlay'
      ? 'push into a screen\'s "layers" — first (texture under content) or last (veil over everything)'
      : 'push into a screen\'s "layers" and move cx/cy to place it (keep it behind text and the device)';
  }
  return out;
}
