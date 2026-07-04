// Pack metadata; the engine's packThemes() holds the authoritative values.
// Screen building itself always goes through the engine (src/harness.js) so the
// generated screens can never drift from what the editor produces.
export const PACKS = {
  productivity: { name: 'Flow', cat: 'Productivity', accent: '#e5dbff', chip: '#6d5cf5', bezel: 'black' },
  fitness: { name: 'Pulse', cat: 'Fitness', accent: '#c2f24d', chip: '#7bc000', bezel: 'black' },
  finance: { name: 'Ledger', cat: 'Finance', accent: '#38e0a6', chip: '#0e9e73', bezel: 'black' },
  social: { name: 'Circle', cat: 'Social', accent: '#ffe4d1', chip: '#ff5a7e', bezel: 'white' },
  food: { name: 'Munch', cat: 'Food', accent: '#ffe1c2', chip: '#ff5a1f', bezel: 'black' },
  saas: { name: 'Atlas', cat: 'SaaS', accent: '#bcd6ff', chip: '#2a6fdb', bezel: 'black' },
  ecommerce: { name: 'Shelf', cat: 'Shopping', accent: '#9b2fb0', chip: '#a23ea8', bezel: 'white' },
  ai: { name: 'Nova', cat: 'AI', accent: '#b3a6ff', chip: '#7c5cff', bezel: 'black' },
  secure: { name: 'Secure', cat: 'Privacy', accent: '#b9a5ff', chip: '#7c5cff', bezel: 'black' },
};

export function packList(externals = {}) {
  return [
    ...Object.entries(PACKS).map(([id, p]) => ({ id, name: p.name, category: p.cat, screens: 10, source: 'builtin' })),
    ...Object.entries(externals).map(([id, p]) => ({ id, name: p.name, category: p.category, screens: p.template.screens.length, source: p.source })),
  ];
}
