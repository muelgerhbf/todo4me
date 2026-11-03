/* Copies the third-party files the document editor needs from node_modules into ./vendor.
 *
 * Usage: npm run vendor   (only needed after upgrading one of these packages)
 *
 * ./vendor is committed to git, so the app keeps working offline and as a plain web app
 * (open index.html) without running npm at all. Everything is MIT / SIL OFL licensed;
 * the license files are copied alongside. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'vendor');

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

fs.rmSync(OUT, { recursive: true, force: true });

/* KaTeX — math typesetting. Only the woff2 fonts are shipped (all current browsers use them first). */
const katex = path.join(NM, 'katex');
copy(path.join(katex, 'dist', 'katex.min.js'), path.join(OUT, 'katex', 'katex.min.js'));
copy(path.join(katex, 'dist', 'katex.min.css'), path.join(OUT, 'katex', 'katex.min.css'));
copy(path.join(katex, 'LICENSE'), path.join(OUT, 'katex', 'LICENSE'));
fs.readdirSync(path.join(katex, 'dist', 'fonts')).filter((f) => f.endsWith('.woff2')).forEach((f) => {
  copy(path.join(katex, 'dist', 'fonts', f), path.join(OUT, 'katex', 'fonts', f));
});

/* Prism — syntax highlighting. One file with the core and the supported languages (order matters). */
const LANGS = ['core', 'markup', 'css', 'clike', 'javascript', 'python', 'json', 'java', 'c', 'cpp', 'sql', 'bash'];
const prism = path.join(NM, 'prismjs');
const bundle = ['/* Prism ' + require(path.join(prism, 'package.json')).version + ' (MIT) — ' + LANGS.join(', ') + ' */',
  // Never auto-highlight the whole page; the editor highlights its own code blocks.
  'window.Prism = window.Prism || {}; window.Prism.manual = true;']
  .concat(LANGS.map((l) => fs.readFileSync(path.join(prism, 'components', 'prism-' + l + '.min.js'), 'utf8')))
  .join('\n');
fs.mkdirSync(path.join(OUT, 'prism'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'prism', 'prism.js'), bundle);
copy(path.join(prism, 'LICENSE'), path.join(OUT, 'prism', 'LICENSE'));

/* Fonts — Fira Code (code) and Carlito (metric-compatible Calibri replacement for systems without Calibri). */
const fonts = [
  ['fira-code', ['latin-400-normal', 'latin-ext-400-normal', 'latin-700-normal', 'latin-ext-700-normal']],
  ['carlito', ['latin-400-normal', 'latin-ext-400-normal', 'latin-700-normal', 'latin-ext-700-normal',
    'latin-400-italic', 'latin-ext-400-italic', 'latin-700-italic', 'latin-ext-700-italic']],
];
fonts.forEach(([name, files]) => {
  const dir = path.join(NM, '@fontsource', name);
  files.forEach((f) => copy(path.join(dir, 'files', name + '-' + f + '.woff2'), path.join(OUT, 'fonts', name + '-' + f + '.woff2')));
  const lic = ['LICENSE', 'LICENSE.md', 'OFL.txt'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
  if (lic) copy(lic, path.join(OUT, 'fonts', name.toUpperCase() + '-LICENSE.txt'));
});

let total = 0, count = 0;
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else { total += fs.statSync(p).size; count++; }
  });
})(OUT);
console.log('vendor/ written: ' + count + ' files, ' + (total / 1024).toFixed(0) + ' KB');
