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

function deviceBox(l, fmt) {
  const baseH = (DEVICE_BASE_H[l.kind] || DEVICE_BASE_H.phone)[l.orientation === 'landscape' ? 'landscape' : 'portrait'];
  const h = baseH * (l.scale || 1);
  return { top: l.cy - h / 2, bottom: l.cy + h / 2 };
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
  const sizes = [...new Set(screens.flatMap(s => (s.layers || []).filter(l => l.type === 'text').map(l => l.fontSize || 0)))].sort((a, b) => a - b);
  if (sizes.length > 4) {
    add('TYPE_SCALE_NOISE', null, `${sizes.length} distinct font sizes (${sizes.join(', ')}) ; snap to a 3-tier scale (hero/headline/body)`);
  }
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i] - sizes[i - 1] <= 2 && sizes[i - 1] >= 12) {
      add('TYPE_SCALE_NOISE', null, `font sizes ${sizes[i - 1]} and ${sizes[i]} differ by ≤2px, so make them the same size`);
      break;
    }
  }

  // BODY_TOO_SMALL — legibility floor on the real-pixel output
  for (const [i, s] of screens.entries()) {
    for (const l of (s.layers || []).filter(l => l.type === 'text')) {
      if ((l.fontSize || 0) * realScale < 60 && (l.fontSize || 0) > 0) {
        add('BODY_TOO_SMALL', i + 1, `text renders at ${Math.round((l.fontSize || 0) * realScale)}px real (<60px floor); thumbs scroll past what they can't read`);
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

  // ALIGNMENT_DRIFT — near-equal headline anchors that don't quite line up
  for (let i = 1; i < screens.length; i++) {
    const a = headlinesOf(screens[i - 1])[0];
    const b = headlinesOf(screens[i])[0];
    if (a && b) {
      const d = Math.abs(a.cy - b.cy);
      if (d > 0 && d <= 8) {
        add('ALIGNMENT_DRIFT', i + 1, `headline anchor drifts ${d}px from the previous screen — align exactly or move deliberately (>8px)`);
      }
    }
  }

  // SAFE_ZONE + TEXT_OVER_DEVICE_NO_SCRIM + DEVICE_SCALE_BOUNDS + LAYER_DENSITY
  for (const [i, s] of screens.entries()) {
    const layers = s.layers || [];
    const devices = layers.filter(l => l.type === 'device');
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
