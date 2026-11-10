#!/usr/bin/env node
// Builds the deployable website (GitHub Pages: https://muelgerhbf.github.io/todo4me/).
//   node scripts/build-site.mjs [--out <dir>]      (default: dist/site)
//
// Output layout (all URLs relative, so it works under the sub-path /todo4me/):
//   <out>/                site/ sources + screenshots + brand images
//   <out>/app/            live demo: a COPY of the browser app (index.html, css, js, assets, vendor)
//
// Nothing outside <out> is modified. The original index.html is never edited: the demo banner is injected into the copy only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : path.join(ROOT, 'dist', 'site'));

// --- safety: never wipe the repo, one of its source folders, or a parent of it ---
const protectedDirs = ['', 'site', 'docs', 'css', 'js', 'assets', 'vendor', 'build', 'electron', 'tests', 'scripts', '.git', 'node_modules']
  .map((d) => path.join(ROOT, d));
const isInside = (child, parent) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
if (protectedDirs.some((d) => isInside(OUT, d) && d !== ROOT) || isInside(ROOT, OUT) || (OUT === ROOT)) {
  console.error('Refusing to use ' + OUT + ' as output directory (it contains or is part of the sources).');
  process.exit(1);
}

const cp = (from, to) => {
  if (!fs.existsSync(from)) throw new Error('Missing source file: ' + path.relative(ROOT, from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: (src) => !/(^|[\\/])(\.DS_Store|Thumbs\.db)$/.test(src) });
};

// only wipe a folder this script built before (it contains .nojekyll), never an arbitrary non-empty folder
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length && !fs.existsSync(path.join(OUT, '.nojekyll'))) {
  console.error('Refusing to delete ' + OUT + ': not empty and not a previous website build.');
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. website sources
cp(SITE, OUT);

// 2. screenshots + brand images (copied, never moved)
const SHOTS = [
  'dashboard-light.png', 'dashboard-dark.png', 'planner-calendar-light.png', 'planner-calendar-dark.png',
  'editor-light.png', 'editor-dark.png', 'tasks-light.png', 'notes-light.png', 'planner-days-light.png',
  'statistics-light.png', 'focus-dark.png', 'repeat-editor-light.png', 'mobile-menu.png',
  'designs/tokio-dark-dashboard.png', 'designs/paper-light-planner.png', 'designs/development-dark-editor.png',
];
for (const f of SHOTS) cp(path.join(ROOT, 'docs', 'screenshots', f), path.join(OUT, 'img', 'screenshots', f));
cp(path.join(ROOT, 'docs', 'brand', 'mark.svg'), path.join(OUT, 'img', 'brand', 'mark.svg'));
cp(path.join(ROOT, 'docs', 'brand', 'social-preview.png'), path.join(OUT, 'social-preview.png'));
cp(path.join(ROOT, 'assets', 'icons', 'favicon.svg'), path.join(OUT, 'favicon.svg'));
cp(path.join(ROOT, 'build', 'icons', '32x32.png'), path.join(OUT, 'favicon-32.png'));
cp(path.join(ROOT, 'build', 'icons', '256x256.png'), path.join(OUT, 'apple-touch-icon.png'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// 3. live demo: copy of the browser app (what index.html needs at runtime; no electron/, node_modules, tests, build, dist)
const APP = path.join(OUT, 'app');
for (const d of ['css', 'js', 'vendor']) cp(path.join(ROOT, d), path.join(APP, d));
cp(path.join(ROOT, 'assets', 'icons', 'favicon.svg'), path.join(APP, 'assets', 'icons', 'favicon.svg')); // <link rel=icon>
cp(path.join(ROOT, 'assets', 'icons', 'icon.png'), path.join(APP, 'assets', 'icons', 'icon.png'));       // reminders.js notification icon

// demo-only files (sources live in site/demo/, moved inside the OUTPUT only)
fs.renameSync(path.join(OUT, 'demo', 'demo.js'), path.join(APP, 'demo.js'));
fs.renameSync(path.join(OUT, 'demo', 'demo.css'), path.join(APP, 'demo.css'));
fs.rmSync(path.join(OUT, 'demo'), { recursive: true, force: true });

// inject banner + hooks into the COPY of index.html
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inject = (needle, replacement) => {
  if (!html.includes(needle)) throw new Error('index.html changed: cannot find ' + JSON.stringify(needle) + ' to inject the demo banner');
  html = html.replace(needle, () => replacement);
};
inject('</head>', '  <link rel="stylesheet" href="demo.css">\n</head>');
inject('<body>', '<body>\n' +
  '  <div class="t4demo" id="t4demo" role="region" aria-label="Demo">\n' +
  '    <span class="t4demo__text"><strong data-t="badge">Demo</strong> <span data-t="text">Your data stays in this browser.</span></span>\n' +
  '    <span class="t4demo__actions">\n' +
  '      <button type="button" class="t4demo__btn" id="t4demo-sample" data-t="sample">Load sample data</button>\n' +
  '      <a class="t4demo__link" href="../" data-t="back">Back to website</a>\n' +
  '    </span>\n' +
  '  </div>');
inject('<script src="js/desktop.js"></script>', '<script src="js/desktop.js"></script>\n  <script src="demo.js"></script>');
fs.writeFileSync(path.join(APP, 'index.html'), html);

// 4. sanity checks: every local file referenced by the two HTML pages exists, and nothing absolute/external is loaded by the demo
function check(file) {
  const dir = path.dirname(file);
  const src = fs.readFileSync(file, 'utf8');
  const problems = [];
  for (const m of src.matchAll(/\s(?:src|href)="([^"#]+)(?:#[^"]*)?"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:)/.test(url)) { if (file.startsWith(APP) && /^https?:/.test(url)) problems.push('external URL in demo: ' + url); continue; }
    if (url.startsWith('/')) { problems.push('absolute URL: ' + url); continue; }
    const clean = url.split('?')[0];
    if (clean && !fs.existsSync(path.join(dir, clean))) problems.push('missing file: ' + url);
  }
  return problems;
}
const problems = [...check(path.join(OUT, 'index.html')).map((p) => 'index.html: ' + p), ...check(path.join(APP, 'index.html')).map((p) => 'app/index.html: ' + p)];
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log('Website built: ' + path.relative(process.cwd(), OUT) + ' (' + count(OUT) + ' files, demo in app/)');
