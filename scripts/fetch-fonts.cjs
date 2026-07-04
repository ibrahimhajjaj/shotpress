// One-off: downloads the default font families (latin subset) and generates
// fonts.css for the render harness. Run from src/fonts/ — outputs land in cwd.
// Rerun if the default pairing changes.
const fs = require('fs');
const { execSync } = require('child_process');

const wanted = {
  'space-grotesk': ['regular', '500', '700'],
  'manrope': ['regular', '500', '600', '700', '800'],
  'instrument-serif': ['regular'],
};

const css = [];
for (const [id, variants] of Object.entries(wanted)) {
  const meta = JSON.parse(
    execSync(`curl -s "https://gwfh.mranftl.com/api/fonts/${id}?subsets=latin"`, { encoding: 'utf8' }),
  );
  for (const vid of variants) {
    const v = (meta.variants || []).find(x => x.id === vid);
    if (!v || !v.woff2) { console.error('missing variant', id, vid); process.exitCode = 1; continue; }
    const weight = vid === 'regular' ? 400 : parseInt(vid, 10);
    const file = `${id}-${weight}.woff2`;
    execSync(`curl -sL "${v.woff2}" -o "${file}"`);
    css.push(`@font-face{font-family:'${meta.family}';font-style:normal;font-weight:${weight};font-display:block;src:url('/__fonts/${file}') format('woff2');}`);
  }
}
fs.writeFileSync('fonts.css', css.join('\n') + '\n');
console.log('wrote fonts.css with', css.length, 'faces');
