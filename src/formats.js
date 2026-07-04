// Store formats: design-space size (what the engine lays out in) and the real
// pixel size the store expects. The engine holds the same table; update both together.
export const FORMATS = {
  iphone: { label: 'iPhone 6.9”', w: 360, h: 780, realW: 1290, realH: 2796, os: 'ios', kind: 'phone', group: 'App Store' },
  iphone65: { label: 'iPhone 6.5”', w: 360, h: 779, realW: 1242, realH: 2688, os: 'ios', kind: 'phone', group: 'App Store' },
  ipad: { label: 'iPad 13”', w: 480, h: 640, realW: 2048, realH: 2732, os: 'ios', kind: 'tablet', group: 'App Store' },
  ipad11: { label: 'iPad 11”', w: 480, h: 687, realW: 1668, realH: 2388, os: 'ios', kind: 'tablet', group: 'App Store' },
  aphone: { label: 'Android Phone', w: 360, h: 720, realW: 1080, realH: 1920, os: 'android', kind: 'phone', group: 'Google Play' },
  atablet: { label: 'Android Tablet', w: 440, h: 704, realW: 1600, realH: 2560, os: 'android', kind: 'tablet', group: 'Google Play' },
  feature: { label: 'Play Feature Graphic', w: 760, h: 371, realW: 1024, realH: 500, os: 'android', kind: 'graphic', group: 'Google Play' },
  mac: { label: 'Mac', w: 760, h: 476, realW: 2880, realH: 1800, os: 'mac', kind: 'mac', group: 'Desktop' },
  watch: { label: 'Apple Watch', w: 340, h: 430, realW: 410, realH: 502, os: 'watch', kind: 'watch', group: 'Wearable' },
};

export const STORES = {
  appstore: ['iphone', 'iphone65', 'ipad', 'ipad11'],
  play: ['aphone', 'atablet', 'feature'],
  mac: ['mac'],
  watch: ['watch'],
};

// The raster comes out of the browser at design-size × scale. When the store's
// exact height is within 5% of that, stretch to the store dimensions so uploads
// pass validation (e.g. iPhone 2795 → 2796). Beyond 5% the design aspect wins:
// stretching would visibly distort, so keep width-exact output and let the
// caller surface a warning (Play accepts a range of phone sizes anyway).
export function outputSize(fmt, scaleOverride) {
  const s = scaleOverride ?? fmt.realW / fmt.w;
  const w = Math.round(fmt.w * s);
  const h = Math.round(fmt.h * s);
  if (scaleOverride == null && Math.abs(fmt.realH - h) / h <= 0.05) {
    return { w: fmt.realW, h: fmt.realH, scale: s, storeExact: true };
  }
  return { w, h, scale: s, storeExact: w === fmt.realW && h === fmt.realH };
}

export function formatList() {
  return Object.entries(FORMATS).map(([id, f]) => ({
    id, label: f.label, group: f.group, os: f.os, kind: f.kind,
    design: { w: f.w, h: f.h }, real: { w: f.realW, h: f.realH },
  }));
}
