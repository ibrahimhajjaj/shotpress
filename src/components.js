// Compound layers: a `component: "stat"` layer expands (at resolve time) into a
// group of positioned primitive layers, so recurring patterns don't get
// hand-built every set. Each builder takes the component layer (its cx/cy plus
// any params) and returns primitives centred on that point. Colours pass through
// verbatim, so `@token` refs on the component resolve with the rest.

const text = (id, cx, cy, over) => ({ id, type: 'text', cx, cy, scale: 1, rot: 0, width: 280, lineHeight: 1.2, align: 'center', font: "'Manrope', sans-serif", ...over });

export const COMPONENTS = {
  // a big metric over a muted label — "3x" / "faster handoffs"
  stat: (l) => {
    const size = l.size || 68;
    return [
      text(l.id + '_v', l.cx, l.cy - Math.round(size * 0.3), { fontSize: size, weight: 800, color: l.color || '#ffffff', font: l.font || "'Space Grotesk', sans-serif", text: l.value || '3x', width: 320, lineHeight: 1 }),
      text(l.id + '_l', l.cx, l.cy + Math.round(size * 0.38), { fontSize: l.labelSize || 18, weight: 500, color: l.muted || 'rgba(255,255,255,.72)', text: l.label || '', width: 300, lineHeight: 1.3 }),
    ];
  },

  // a floating notification / info card: pill + icon + title + sub
  chip: (l) => {
    const w = l.w0 || 288, h = l.h0 || 76, cx = l.cx, cy = l.cy, tx = cx - w / 2 + 62;
    return [
      { id: l.id + '_bg', type: 'shape', shape: 'rect', cx, cy, scale: 1, rot: 0, w0: w, h0: h, radius: 18, fill: l.bg || 'rgba(255,255,255,.12)', shadow: { x: 0, y: 16, blur: 40, spread: -14, color: 'rgba(0,0,0,.5)' } },
      { id: l.id + '_ic', type: 'icon', cx: cx - w / 2 + 34, cy, scale: 1, rot: 0, glyph: l.glyph || '✓', size: 22, bgShape: 'circle', iconBg: l.accent || '#7c5cff', color: '#ffffff' },
      text(l.id + '_t', tx + (w - 90) / 2, cy - 10, { fontSize: 16, weight: 700, color: l.color || '#ffffff', text: l.title || 'All caught up', width: w - 90, align: 'start', lineHeight: 1.15 }),
      text(l.id + '_s', tx + (w - 90) / 2, cy + 11, { fontSize: 13, weight: 500, color: l.muted || 'rgba(255,255,255,.72)', text: l.sub || 'Nothing left to do', width: w - 90, align: 'start', lineHeight: 1.2 }),
    ];
  },

  // overlapping avatar circles + an optional label
  'avatar-stack': (l) => {
    const n = Math.max(2, Math.min(6, l.count || 4)), d = l.size || 52, gap = Math.round(d * 0.62);
    const cols = (Array.isArray(l.colors) && l.colors.length) ? l.colors : ['#7c5cff', '#38e0a6', '#ff5a7e', '#ffc53d', '#2a6fdb', '#c2f24d'];
    const total = (n - 1) * gap;
    const start = l.cx - total / 2;
    const dots = Array.from({ length: n }, (_, i) => ({ id: `${l.id}_a${i}`, type: 'shape', shape: 'ellipse', cx: start + i * gap, cy: l.cy, scale: 1, rot: 0, w0: d, h0: d, fill: cols[i % cols.length], stroke: true, strokeColor: l.ring || '#0d0d14', strokeW: 3, blend: l.blend }));
    if (l.label) dots.push(text(l.id + '_l', l.cx, l.cy + d / 2 + 22, { fontSize: 15, weight: 600, color: l.muted || 'rgba(255,255,255,.72)', text: l.label, width: 300 }));
    return dots;
  },

  // stars + value + a muted "from N" note
  'rating-row': (l) => [
    { id: l.id + '_r', type: 'rating', cx: l.cx, cy: l.cy, scale: 1, rot: 0, stars: l.stars || 5, value: l.value || '4.9', showValue: true, color: l.color || '#ffc53d', textColor: l.ink || '#ffffff' },
    text(l.id + '_n', l.cx, l.cy + 26, { fontSize: 14, weight: 500, color: l.muted || 'rgba(255,255,255,.66)', text: l.note || 'from 2,000+ reviews', width: 300 }),
  ],

  // a vertical stack of feature rows
  'feature-list': (l) => {
    const items = Array.isArray(l.items) && l.items.length ? l.items : [{ glyph: '⚡', title: 'Fast', sub: 'Built for speed' }, { glyph: '🔒', title: 'Private', sub: 'Yours alone' }, { glyph: '✦', title: 'Simple', sub: 'No setup' }];
    const gap = l.gap || 74, top = l.cy - ((items.length - 1) * gap) / 2;
    return items.map((it, i) => ({ id: `${l.id}_f${i}`, type: 'feature', cx: l.cx, cy: top + i * gap, scale: 1, rot: 0, w0: l.w0 || 300, glyph: it.glyph || '✦', title: it.title || 'Feature', sub: it.sub || '', iconColor: l.iconColor || '#ffffff', iconBg: l.accent || '#7c5cff', bgShape: 'round', titleColor: l.color || '#ffffff', subColor: l.muted || 'rgba(255,255,255,.72)', font: "'Manrope', sans-serif" }));
  },
};

export function componentList() {
  return Object.keys(COMPONENTS).map(id => ({
    id,
    params: {
      stat: 'value, label, size, color, muted',
      chip: 'title, sub, glyph, accent, bg, w0, h0, color, muted',
      'avatar-stack': 'count, size, colors[], ring, label, blend',
      'rating-row': 'stars, value, note, color, ink, muted',
      'feature-list': 'items[{glyph,title,sub}], gap, accent, w0',
    }[id],
  }));
}
