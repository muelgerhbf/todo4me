/* Builds the Windows app with electron-builder.
 *
 * Usage (via npm scripts):
 *   node scripts/build.js nsis portable   → installer + portable .exe in ./dist
 *   node scripts/build.js dir             → unpacked app in ./dist/win-unpacked
 *
 * Why not run electron-builder directly into ./dist? Electron-based editors such as
 * VS Code open .asar files they come across in the workspace and keep them locked,
 * which makes electron-builder fail with EBUSY/EPERM. So the build runs in a temp
 * folder outside the project and only the finished results are copied to ./dist. */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP_OUT = path.join(os.tmpdir(), 'todo4me-build');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['nsis', 'portable'];

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

fs.rmSync(TMP_OUT, { recursive: true, force: true });
const cli = require.resolve('electron-builder/cli.js', { paths: [ROOT] });
const res = spawnSync(process.execPath, [cli, '--win', ...targets, '--config.directories.output=' + TMP_OUT], {
  cwd: ROOT, env, stdio: 'inherit',
});
if (res.status !== 0) {
  console.error('\nBuild failed (exit code ' + res.status + ').');
  process.exit(res.status || 1);
}

fs.mkdirSync(DIST, { recursive: true });
const copied = [];
if (targets.includes('dir')) {
  const dest = path.join(DIST, 'win-unpacked');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(TMP_OUT, 'win-unpacked'), dest, { recursive: true });
  copied.push(dest);
}
fs.readdirSync(TMP_OUT).filter((f) => f.toLowerCase().endsWith('.exe')).forEach((f) => {
  fs.copyFileSync(path.join(TMP_OUT, f), path.join(DIST, f));
  copied.push(path.join(DIST, f));
});
fs.rmSync(TMP_OUT, { recursive: true, force: true });

console.log('\nDone. Output:');
copied.forEach((f) => console.log('  ' + f));
