import { FORMATS } from './formats.js';

// Mirrors a project for RTL markets by coordinate math — never scaleX(-1),
// which would reverse glyphs, logos, and the real app UI inside device frames.
// Horizontal-only: cy, scale, sizes, fonts, colors and images are untouched;
// device screenshots stay as supplied (ship RTL captures for RTL sets).
// Involution: mirroring twice returns the original project.
const SWAP = { left: 'right', right: 'left' };

export function mirrorProject(project) {
  const fmt = FORMATS[project.format];
  if (!fmt) throw new Error(`unknown format "${project.format}"`);
  const W = fmt.w;

  const p = structuredClone(project);
  p.brand = { ...(p.brand || {}), dir: p.brand?.dir === 'rtl' ? 'ltr' : 'rtl' };

  for (const screen of p.screens || []) {
    // a spanning backdrop reads with the carousel, so slice order reverses
    if (screen.bg?.span?.len > 1) {
      screen.bg.span.idx = screen.bg.span.len - 1 - screen.bg.span.idx;
    }
    for (const l of screen.layers || []) {
      if (typeof l.cx === 'number') l.cx = W - l.cx;
      if (l.rot) l.rot = -l.rot;
      if (l.ry3d) l.ry3d = -l.ry3d;      // yaw flips; rx3d (pitch) does not
      if (SWAP[l.align]) l.align = SWAP[l.align];
      if (SWAP[l.arrow]) l.arrow = SWAP[l.arrow];
    }
  }
  return p;
}
