// A project may carry a small design system that expands into concrete layers
// before render/lint: `tokens` (named colours), `styles` (named text presets),
// and `decorations` (layers drawn on every screen). This keeps a set consistent
// from one place instead of the same accent/ink/muted repeated across dozens of
// layers by hand. Resolution is a no-op for a project that uses none of them, so
// existing specs are untouched. The engine never sees these keys — it only ever
// gets the fully-resolved layers, so nothing new is asked of the frozen editor.

import { COMPONENTS } from './components.js';

// Tasteful named 3D poses so a device gets a considered tilt without blind
// trial on raw rx3d/ry3d angles (pitch/yaw in degrees). `shotpress pose` lists them.
export const POSES = {
  upright: { rx3d: 0, ry3d: 0 },
  tilt: { rx3d: 4, ry3d: -14 },
  lean: { rx3d: 6, ry3d: -10 },
  'hero-left': { rx3d: 8, ry3d: -20 },
  'hero-right': { rx3d: 8, ry3d: 20 },
  'lay-flat': { rx3d: 54, ry3d: 0 },
};

export function resolveProject(project) {
  if (!project || typeof project !== 'object') return project;
  const scan = (pred) => (project.screens || []).some(s => (s.layers || []).some(l => l && pred(l)));
  const hasPose = scan(l => l.pose);
  const hasComponent = scan(l => l.component);
  if (!project.tokens && !project.styles && !(project.decorations && project.decorations.length) && !hasPose && !hasComponent) return project;

  const p = structuredClone(project);
  const tokens = p.tokens || {};
  const styles = p.styles || {};
  const decorations = p.decorations || [];

  // decorations: drawn on every screen, behind the screen's own content
  for (const [si, s] of (p.screens || []).entries()) {
    if (!Array.isArray(s.layers)) continue;
    if (decorations.length) {
      const drawn = decorations.map((d, i) => ({ ...structuredClone(d), id: d.id ? `${d.id}_${si}` : `decor_all_${si}_${i}` }));
      s.layers = [...drawn, ...s.layers];
    }
  }

  // components: a compound layer expands into its group of primitives. A missing
  // id gets a stable fallback so two id-less components can't collide.
  for (const [si, s] of (p.screens || []).entries()) {
    if (!Array.isArray(s.layers)) continue;
    s.layers = s.layers.flatMap((l, li) => {
      if (!l || !l.component) return [l];
      if (!COMPONENTS[l.component]) throw new Error(`unknown component "${l.component}" — one of: ${Object.keys(COMPONENTS).join(', ')}`);
      return COMPONENTS[l.component]({ ...l, id: l.id || `cmp_${si}_${li}` });
    });
  }

  // named text styles: `style: "eyebrow"` fills the preset's fields as defaults,
  // the layer's own fields win. named device poses expand to rx3d/ry3d.
  for (const s of p.screens || []) {
    for (const l of s.layers || []) {
      if (l.style && styles[l.style]) {
        for (const [k, v] of Object.entries(styles[l.style])) if (!(k in l)) l[k] = v;
      }
      delete l.style;
      if (l.type === 'device' && l.pose && POSES[l.pose]) Object.assign(l, POSES[l.pose]);
      delete l.pose;
    }
  }

  // @token substitution in every string value (only when the token is defined,
  // so an undefined @handle in copy is left alone)
  const sub = (str) => str.replace(/@([A-Za-z][\w-]*)/g, (m, name) => (name in tokens ? tokens[name] : m));
  const walk = (o) => {
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        if (typeof o[i] === 'string') o[i] = sub(o[i]);
        else walk(o[i]);
      }
      return;
    }
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string') o[k] = sub(o[k]);
        else walk(o[k]);
      }
    }
  };
  walk(p.screens);
  if (p.brand) walk(p.brand);

  delete p.tokens;
  delete p.styles;
  delete p.decorations;
  return p;
}
