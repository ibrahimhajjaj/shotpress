// One-off: vendors Cairo (Arabic + Latin) for deterministic RTL renders.
// Run from src/fonts/.
const { execSync } = require('child_process');
const fs = require('fs');

const meta = JSON.parse(execSync('curl -s "https://gwfh.mranftl.com/api/fonts/cairo?subsets=arabic,latin"', { encoding: 'utf8' }));
let css = fs.readFileSync('fonts.css', 'utf8');
for (const vid of ['regular', '700']) {
  const v = (meta.variants || []).find(x => x.id === vid);
  if (!v || !v.woff2) { console.error('missing variant', vid); process.exit(1); }
  const weight = vid === 'regular' ? 400 : 700;
  const file = `cairo-${weight}.woff2`;
  execSync(`curl -sL "${v.woff2}" -o "${file}"`);
  css += `@font-face{font-family:'${meta.family}';font-style:normal;font-weight:${weight};font-display:block;src:url('/__fonts/${file}') format('woff2');}\n`;
}
fs.writeFileSync('fonts.css', css);
console.log('cairo vendored:', meta.family);
