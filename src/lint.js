import { FORMATS } from './formats.js';

// Design lint: numeric taste checks an agent runs before rendering. Everything
// here is computable from the project JSON alone; findings are warnings about
// conversion quality, not schema errors (schema.js owns validity).

// Frame outer heights in design px at scale 1, per device kind/orientation.
// The engine draws the frames; update these alongside src/engine.
const DEVICE_BASE_H = {
  phone: { portrait: 462, landscape: 230 },
  tablet: { portrait: 486, landscape: 366 },
  mac: { portrait: 404, landscape: 404 },
  watch: { portrait: 192, landscape: 192 },
};

// which canvas each official bezel kind belongs on
const FRAME_FITS = {
  iphone: { kind: 'phone', os: 'ios' },
  ipad: { kind: 'tablet', os: 'ios' },
  mac: { kind: 'mac' },
  watch: { kind: 'watch' },
};

const NEUTRALS = new Set(['#fff', '#ffffff', '#000', '#000000']);
// white/black with alpha (scrims, muted subheads) reads as neutral too
const NEUTRAL_FN = /^rgba?\(\s*(255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)/i;
const isNeutral = (c) => NEUTRALS.has(c) || NEUTRAL_FN.test(c);

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const hexesIn = (s) => (typeof s === 'string' ? s.match(/#[0-9a-f]{3,8}\b/gi) || [] : [])
  .map(h => h.length > 7 ? h.slice(0, 7) : h).filter(h => h.length === 4 || h.length === 7);

const isHeadline = (l) => l.type === 'text' && (l.fontSize || 0) >= 20;
const words = (t) => String(t || '').replace(/[*~]/g, '').trim().split(/\s+/).filter(Boolean);

// Heuristic: 0.55em average advance, UTF-16 lengths. Overestimates emoji/ZWJ
// runs and misjudges CJK/Arabic — acceptable for warnings, not measurement.
function textLines(l) {
  const explicit = String(l.text || '').replace(/[*~]/g, '').split('\n');
  const chWidth = (l.fontSize || 16) * 0.5;
  return explicit.reduce((n, line) => n + Math.max(1, Math.ceil((line.length * chWidth) / (l.width || 300))), 0);
}

function textBox(l) {
  const h = textLines(l) * (l.fontSize || 16) * (l.lineHeight || 1.2);
  const w = l.width || 300;
  return { top: l.cy - h / 2, bottom: l.cy + h / 2, left: l.cx - w / 2, right: l.cx + w / 2 };
}

const DEVICE_BASE_W = {
  phone: { portrait: 226, landscape: 470 },
  tablet: { portrait: 366, landscape: 486 },
  mac: { portrait: 660, landscape: 660 },
  watch: { portrait: 158, landscape: 158 },
};

function deviceBox(l, fmt) {
  const orient = l.orientation === 'landscape' ? 'landscape' : 'portrait';
  const h = (DEVICE_BASE_H[l.kind] || DEVICE_BASE_H.phone)[orient] * (l.scale || 1);
  const w = (DEVICE_BASE_W[l.kind] || DEVICE_BASE_W.phone)[orient] * (l.scale || 1);
  return { top: l.cy - h / 2, bottom: l.cy + h / 2, left: l.cx - w / 2, right: l.cx + w / 2 };
}

// First pair of text layers whose estimated boxes collide, or null. A few px of
// slop is tolerated so two adjacent lines that merely touch don't trip it; a
// headline that wraps into the copy below clears it comfortably.
function textOverlap(layers) {
  const boxes = layers.filter(l => l.type === 'text').map(textBox);
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox > 4 && oy > 4) return { ox, oy };
    }
  }
  return null;
}

// Font family a text layer resolves to, for optical (not raw-px) comparisons.
const familyOf = (l) => {
  const m = typeof l.font === 'string' && l.font.match(/'([^']+)'/);
  return m ? m[1] : 'default';
};

// An eyebrow/kicker: an explicit role, or a short all-caps label. It rides above
// a headline as a category marker, not body copy, so the legibility floor eases.
const EYEBROW_ROLES = new Set(['eyebrow', 'kicker', 'label']);
const isEyebrow = (l) => {
  if (EYEBROW_ROLES.has(l.role)) return true;
  const t = String(l.text || '').replace(/[*~]/g, '').trim();
  return words(t).length <= 3 && /[A-Za-z]/.test(t) && t === t.toUpperCase();
};

const SKETCH_MARK = { text: 'T', device: 'D', rating: 'R', badge: 'B', callout: 'C', feature: 'F', image: 'I', logo: 'L', shape: 'S', icon: 'i' };

// ASCII map of layer boxes per screen, so positions can be sanity-checked
// before the first render. Overlaps show as *; the store-UI bands as ~.
export function sketchProject(project) {
  const fmt = FORMATS[project.format] || FORMATS.iphone;
  const cols = 26;
  const rows = Math.max(12, Math.round((cols * fmt.h / fmt.w) / 2.1));
  const sx = (x) => Math.max(0, Math.min(cols - 1, Math.floor((x / fmt.w) * cols)));
  const sy = (y) => Math.max(0, Math.min(rows - 1, Math.floor((y / fmt.h) * rows)));
  const lines = [];
  for (const [i, screen] of (project.screens || []).entries()) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const bandTop = sy(fmt.h * 0.06), bandBottom = sy(fmt.h * 0.96);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r <= bandTop; r++) grid[r][c] = '~';
      for (let r = bandBottom; r < rows; r++) grid[r][c] = '~';
    }
    for (const l of screen.layers || []) {
      if (l.hidden) continue;
      const box = l.type === 'device' ? deviceBox(l, fmt) : l.type === 'text' ? textBox(l)
        : { top: l.cy - 14, bottom: l.cy + 14, left: l.cx - 60, right: l.cx + 60 };
      const ch = SKETCH_MARK[l.type] || '?';
      for (let r = sy(box.top); r <= sy(box.bottom); r++) {
        for (let c = sx(box.left); c <= sx(box.right); c++) {
          grid[r][c] = grid[r][c] === ' ' || grid[r][c] === '~' ? ch : '*';
        }
      }
    }
    lines.push(`screen ${i + 1}  (${fmt.w}×${fmt.h} design px)`);
    lines.push('┌' + '─'.repeat(cols) + '┐');
    for (const row of grid) lines.push('│' + row.join('') + '│');
    lines.push('└' + '─'.repeat(cols) + '┘');
  }
  lines.push('T text  D device  R rating  B badge  C callout  F feature  * overlap  ~ store-UI band');
  return lines.join('\n');
}

export function lintProject(project) {
  const findings = [];
  const add = (rule, screen, message) => findings.push({ rule, screen, message });
  const fmt = FORMATS[project.format] || FORMATS.iphone;
  const { w: W, h: H } = fmt;
  const screens = project.screens || [];
  const realScale = fmt.realW / fmt.w;

  const headlinesOf = (s) => (s.layers || []).filter(isHeadline);
  const margin = Math.round(W * 0.045);

  // HERO_NOT_LARGEST — screen 1 must carry the biggest type in the set.
  // Skipped when screen 1 is deliberately text-free; display numerals
  // ("2.5h", "#1") and one-liners aren't headlines and don't compete.
  const maxOf = (s, phraseOnly) => Math.max(0, ...headlinesOf(s)
    .filter(l => !phraseOnly || words(l.text).length >= 3)
    .map(l => l.fontSize || 0));
  const heroSize = maxOf(screens[0] || {}, false);
  if (heroSize > 0 && screens.length > 1 && screens.slice(1).some(s => maxOf(s, true) > heroSize)) {
    add('HERO_NOT_LARGEST', 1, `screen 1's largest text (${heroSize}px) is outsized by a later screen. Put the biggest type on the hook.`);
  }

  // NO_SOCIAL_PROOF — a rating or badge belongs in the first two screens
  const proofEarly = screens.slice(0, 2).some(s => (s.layers || []).some(l => l.type === 'rating' || l.type === 'badge'));
  if (screens.length >= 3 && !proofEarly) {
    add('NO_SOCIAL_PROOF', 1, 'screens 1-2 carry no rating or badge. Social proof in the search triptych converts harder than anything else here.');
  }

  // TYPE_SCALE_NOISE — a set should use ~3 sizes, not a smear
  const textLayers = screens.flatMap(s => (s.layers || []).filter(l => l.type === 'text'));
  const sizes = [...new Set(textLayers.map(l => l.fontSize || 0))].sort((a, b) => a - b);
  if (sizes.length > 4) {
    add('TYPE_SCALE_NOISE', null, `${sizes.length} distinct font sizes (${sizes.join(', ')}) ; snap to a 3-tier scale (hero/headline/body)`);
  }
  // Near-duplicate sizes read as noise, but only within one family: optical size
  // differs by typeface (Instrument Serif at 46 looks smaller than Manrope at
  // 46), so two faces sharing a px is a deliberate pairing, not a smear.
  const sizesByFamily = new Map();
  for (const l of textLayers) {
    const fam = familyOf(l);
    (sizesByFamily.get(fam) || sizesByFamily.set(fam, new Set()).get(fam)).add(l.fontSize || 0);
  }
  for (const [fam, set] of sizesByFamily) {
    const fs = [...set].sort((a, b) => a - b);
    for (let i = 1; i < fs.length; i++) {
      if (fs[i] - fs[i - 1] <= 2 && fs[i - 1] >= 12) {
        add('TYPE_SCALE_NOISE', null, `${fam} sizes ${fs[i - 1]} and ${fs[i]} differ by ≤2px — make them one size (px equality within a family, not across)`);
        break;
      }
    }
  }

  // BODY_TOO_SMALL — legibility floor on the real-pixel output. A short all-caps
  // kicker, or a layer tagged role:"eyebrow"/"kicker"/"label", is an editorial
  // device rather than body copy a thumbnail-scroller must read, so it earns a
  // relaxed floor instead of the full 60 (still caught if it goes truly tiny).
  for (const [i, s] of screens.entries()) {
    for (const l of (s.layers || []).filter(l => l.type === 'text')) {
      const real = (l.fontSize || 0) * realScale;
      const floor = isEyebrow(l) ? 40 : 60;
      if (real < floor && (l.fontSize || 0) > 0) {
        add('BODY_TOO_SMALL', i + 1, `text renders at ${Math.round(real)}px real (<${floor}px floor); thumbs scroll past what they can't read`);
        break;
      }
    }
  }

  // COLOR_SPRAWL — one accent, few text colors
  const textColors = new Set(screens.flatMap(s => (s.layers || [])
    .filter(l => l.type === 'text').map(l => (l.color || '').toLowerCase()).filter(c => c && !isNeutral(c))));
  if (textColors.size > 3) {
    add('COLOR_SPRAWL', null, `${textColors.size} non-neutral text colors across the set. Cap at 3; sprawl reads as template output.`);
  }

  // CONTRAST_LOW — worst-case text color vs background stops (scrim excuses it)
  for (const [i, s] of screens.entries()) {
    const bgHexes = s.bg && s.bg.type !== 'image' ? hexesIn(s.bg.value) : [];
    if (!bgHexes.length) continue;
    for (const l of (s.layers || []).filter(l => l.type === 'text')) {
      if (l.scrim && l.scrim !== 'none') continue;
      const fg = hexesIn(l.color)[0];
      if (!fg) continue;
      const worst = Math.min(...bgHexes.map(bg => contrast(fg, bg)));
      if (worst < 3) {
        add('CONTRAST_LOW', i + 1, `text ${l.color} vs background hits ${worst.toFixed(1)}:1 (needs ≥3, ideally ≥4.5). Add a scrim or change the color.`);
        break;
      }
    }
  }

  // COMPOSITION_REPEAT — same treatment bucket >2 screens running
  const bucket = (s) => {
    const devices = (s.layers || []).filter(l => l.type === 'device');
    if (!devices.length) return 'no-device';
    const d = devices[0];
    const posed = devices.length > 1 || d.rx3d || d.ry3d;
    return `${d.treatment || 'plain'}${posed ? '-posed' : ''}`;
  };
  let run = 1;
  for (let i = 1; i < screens.length; i++) {
    run = bucket(screens[i]) === bucket(screens[i - 1]) ? run + 1 : 1;
    if (run === 3) {
      add('COMPOSITION_REPEAT', i + 1, `three consecutive screens use the same "${bucket(screens[i])}" composition — schedule variety (bleed, angled, compare, duo, pano)`);
    }
  }

  // MONOTONE_BG — identical background on every screen
  const bgs = new Set(screens.map(s => JSON.stringify(s.bg || {})));
  if (screens.length >= 4 && bgs.size === 1) {
    add('MONOTONE_BG', null, 'every screen has an identical background — ramp hue or lightness within one family across the set');
  }

  // HEADLINE_TOO_LONG / FEATURE_JARGON
  for (const [i, s] of screens.entries()) {
    for (const l of headlinesOf(s)) {
      const n = words(l.text).length;
      const isQuote = /^["“'‘]/.test(String(l.text || '').trim());
      if (isQuote) continue; // testimonials run long by nature
      if ((l.fontSize || 0) >= 26 && n > 6) add('HEADLINE_TOO_LONG', i + 1, `headline is ${n} words; cap at 6 and lead with the outcome`);
      else if ((l.fontSize || 0) < 26 && n > 14) add('HEADLINE_TOO_LONG', i + 1, `subhead is ${n} words (cap: 14, one sentence)`);
      if (i < 3 && /™|®|[a-z][A-Z]/.test(String(l.text || ''))) {
        add('FEATURE_JARGON', i + 1, 'screens 1-3 carry product jargon — lead with the outcome, name features later');
      }
    }
  }

  // ALIGNMENT_DRIFT — near-equal headline anchors that don't quite line up.
  // A drift of exactly 8px passes (the deliberate-move threshold is ≥8, so 8 is
  // reachable). Screens that declare a different layout family — via a
  // `layoutFamily` tag or simply a different hero text alignment — are skipped,
  // since a centered hook and a left-column feature aren't meant to share a line.
  const familyOfScreen = (s, hero) => s.layoutFamily || (hero && hero.align) || 'default';
  for (let i = 1; i < screens.length; i++) {
    const a = headlinesOf(screens[i - 1])[0];
    const b = headlinesOf(screens[i])[0];
    if (a && b && familyOfScreen(screens[i - 1], a) === familyOfScreen(screens[i], b)) {
      const d = Math.abs(a.cy - b.cy);
      if (d > 0 && d < 8) {
        add('ALIGNMENT_DRIFT', i + 1, `headline anchor drifts ${d}px from the previous screen — align it exactly, or move it clearly (≥8px)`);
      }
    }
  }

  // PLACEHOLDER_PROOF — pack scaffolds ship demo ratings and quotes; shipping
  // them on a live listing is fabricated social proof. The flag survives edits
  // on purpose: replace the content AND delete `placeholder` to clear it.
  for (const [i, s] of screens.entries()) {
    if ((s.layers || []).some(l => l.placeholder === true)) {
      add('PLACEHOLDER_PROOF', i + 1, 'demo social proof from the pack (rating/quote). Replace with real numbers or remove the layer, then drop its "placeholder" flag.');
    }
  }

  // DOUBLE_STATUS_BAR — real captures bring their own status bar; drawing the
  // synthetic (iOS-styled) one on top reads as two clocks
  for (const [i, s] of screens.entries()) {
    if ((s.layers || []).some(l => l.type === 'device' && l.image && l.showStatus)) {
      add('DOUBLE_STATUS_BAR', i + 1, 'device has a real capture and showStatus:true; the synthetic bar will overlap the one in the screenshot. Set showStatus:false.');
    }
  }

  // SAFE_ZONE + TEXT_OVER_DEVICE_NO_SCRIM + DEVICE_SCALE_BOUNDS + LAYER_DENSITY
  for (const [i, s] of screens.entries()) {
    const layers = s.layers || [];
    const devices = layers.filter(l => l.type === 'device');
    // TEXT_OVERLAP — a headline that wraps into the copy below it (or any two
    // text boxes that collide). Invisible to geometry-only checks; this is the
    // text-layout result that used to only surface on the rendered PNG.
    const ov = textOverlap(layers);
    if (ov) {
      add('TEXT_OVERLAP', i + 1, `two text layers overlap (~${Math.round(ov.ox)}×${Math.round(ov.oy)}px) — a headline is likely wrapping into copy below it; shorten it, widen its box, or move one`);
    }
    for (const l of layers.filter(l => l.type === 'text')) {
      const box = textBox(l);
      if (box.left < margin || box.right > W - margin) {
        add('SAFE_ZONE', i + 1, `text extends past the ${margin}px side margin (spans ${Math.round(box.left)}–${Math.round(box.right)} on a ${W}px canvas)`);
      }
      if (box.top < H * 0.06 || box.bottom > H * 0.96) {
        add('SAFE_ZONE', i + 1, 'text sits in the store-UI overlap band (top 6% / bottom 4%)');
      }
      if ((!l.scrim || l.scrim === 'none') && devices.some(d => {
        const db = deviceBox(d, fmt);
        return box.bottom > db.top + 12 && box.top < db.bottom - 12;
      })) {
        add('TEXT_OVER_DEVICE_NO_SCRIM', i + 1, 'text overlaps a device frame with no scrim. Set one (dark/light/blur) or move the text.');
      }
    }
    for (const d of devices) {
      if (d.frame && (d.rot || d.rx3d || d.ry3d)) {
        add('FRAME_ART_TILTED', i + 1, 'official Apple bezels must be used as-is — no rotation or 3D pose (Apple marketing artwork terms)');
      }
      if (d.frame) {
        const want = FRAME_FITS[String(d.frame).split(':')[0]];
        if (want && (want.kind !== fmt.kind || (want.os && fmt.os !== want.os))) {
          add('FRAME_KIND_MISMATCH', i + 1, `"${String(d.frame).split(':')[0]}" bezel on a ${fmt.label} canvas — match the frame to the format (and keep Apple hardware off Play listings)`);
        }
      }
      if (d.treatment === 'bleed') continue; // full-canvas by design
      if ((d.scale || 1) < 0.6) add('DEVICE_SCALE_BOUNDS', i + 1, `device scale ${d.scale} ; below 0.6 the store thumbnail turns to mush`);
      if ((d.scale || 1) > 1.35) add('DEVICE_SCALE_BOUNDS', i + 1, `device scale ${d.scale} ; above 1.35 you get visible upscaling artifacts`);
    }
    if (layers.filter(l => l.type === 'text').length > 3 || devices.length > 2) {
      add('LAYER_DENSITY', i + 1, 'more than 3 text or 2 device layers — one idea per screen');
    }
  }

  return { findings, count: findings.length };
}

// Per-layer computed geometry — the same estimates the lint reasons about — so
// an agent can see that a headline wrapped to N lines, or where a device's box
// lands, WITHOUT rendering the PNG and measuring it. These are estimates, not a
// raster measurement (see textLines); the device box matches the engine's frame
// table exactly, text boxes assume ~0.55em advance.
export function measureProject(project) {
  const fmt = FORMATS[project.format] || FORMATS.iphone;
  const realScale = fmt.realW / fmt.w;
  const r = (n) => Math.round(n * 10) / 10;
  const boxOut = (b) => ({ x: r(b.left), y: r(b.top), w: r(b.right - b.left), h: r(b.bottom - b.top) });
  return {
    format: project.format,
    design: { w: fmt.w, h: fmt.h },
    real: { w: fmt.realW, h: fmt.realH },
    realScale: Math.round(realScale * 100) / 100,
    screens: (project.screens || []).map((s, i) => ({
      screen: i + 1,
      layers: (s.layers || []).map((l) => {
        const base = { id: l.id, type: l.type, cx: l.cx, cy: l.cy };
        if (l.type === 'text') {
          return { ...base, text: String(l.text || ''), fontSize: l.fontSize || 0, realPx: Math.round((l.fontSize || 0) * realScale), lines: textLines(l), box: boxOut(textBox(l)) };
        }
        if (l.type === 'device') {
          return { ...base, kind: l.kind, scale: l.scale || 1, treatment: l.treatment || 'plain', box: boxOut(deviceBox(l, fmt)) };
        }
        return base;
      }),
    })),
  };
}
