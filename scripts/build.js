/* Builds the desktop app with electron-builder (Windows and Linux).
 *
 * Usage (via npm scripts):
 *   node scripts/build.js nsis portable             -> installer + portable .exe in ./dist        (Windows)
 *   node scripts/build.js linux                     -> AppImage, deb, rpm and tar.gz in ./dist    (Linux)
 *   node scripts/build.js appimage deb              -> only the named Linux targets
 *   node scripts/build.js dir                       -> unpacked app in ./dist/win-unpacked or ./dist/linux-unpacked
 *   node scripts/build.js linux --publish           -> same, and upload a draft GitHub release
 *   (--publish needs the GH_TOKEN environment variable)
 *
 * The platform is chosen from the target names: nsis/portable -> Windows; linux/appimage/deb/rpm/
 * tar.gz/snap -> Linux. Without target names the default is nsis + portable on Windows and all
 * Linux targets on Linux. "dir" builds for the platform you are running on.
 * (rpm needs the `rpmbuild` tool; on Debian/Ubuntu: apt install rpm.)
 *
 * Why not run electron-builder directly into ./dist? Electron-based editors such as
 * VS Code open .asar files they come across in the workspace and keep them locked,
 * which makes electron-builder fail with EBUSY/EPERM. So the build runs in a temp
 * folder outside the project and only the finished results are copied to ./dist.
 *
 * Besides the installers, latest.yml (Windows) / latest-linux.yml (Linux) and *.blockmap are
 * copied: they are the update feed that installed apps read (see electron/updater.js). */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP_OUT = path.join(os.tmpdir(), 'todo4me-build');
const args = process.argv.slice(2);
const publish = args.includes('--publish');
let targets = args.filter((a) => !a.startsWith('--')).map((a) => (a.toLowerCase() === 'appimage' ? 'AppImage' : a.toLowerCase()));
const LINUX_TARGETS = ['AppImage', 'deb', 'rpm', 'tar.gz', 'snap'];
const WIN_TARGETS = ['nsis', 'portable', 'msi', 'zip'];
if (targets.includes('linux')) targets = [...new Set(targets.filter((t) => t !== 'linux').concat('AppImage', 'deb', 'rpm', 'tar.gz'))];
if (!targets.length) targets.push(...(process.platform === 'win32' ? ['nsis', 'portable'] : process.platform === 'linux' ? ['AppImage', 'deb', 'rpm', 'tar.gz'] : []));
if (!targets.length) { console.error('Name the targets to build, e.g. "nsis portable" or "linux".'); process.exit(1); }
const wantsLinux = targets.some((t) => LINUX_TARGETS.includes(t));
const wantsWin = targets.some((t) => WIN_TARGETS.includes(t));
if (wantsLinux && wantsWin) { console.error('Build Windows and Linux targets in separate runs.'); process.exit(1); }
const unknown = targets.filter((t) => t !== 'dir' && !LINUX_TARGETS.includes(t) && !WIN_TARGETS.includes(t));
if (unknown.length) { console.error('Unknown target(s): ' + unknown.join(', ')); process.exit(1); }
const platform = wantsLinux ? 'linux' : wantsWin ? 'win' : process.platform === 'linux' ? 'linux' : 'win';

if (publish && !process.env.GH_TOKEN) {
  console.error('Publishing needs a GitHub token in the GH_TOKEN environment variable (see README → Releasing an update).');
  process.exit(1);
}

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

fs.rmSync(TMP_OUT, { recursive: true, force: true });
const cli = require.resolve('electron-builder/cli.js', { paths: [ROOT] });
const res = spawnSync(process.execPath, [cli, platform === 'linux' ? '--linux' : '--win', ...targets, '--config.directories.output=' + TMP_OUT, '--publish', publish ? 'always' : 'never'], {
  cwd: ROOT, env, stdio: 'inherit',
});
if (res.status !== 0) {
  console.error('\nBuild failed (exit code ' + res.status + ').');
  process.exit(res.status || 1);
}

fs.mkdirSync(DIST, { recursive: true });
const copied = [];
if (targets.includes('dir')) {
  const unpacked = platform === 'linux' ? 'linux-unpacked' : 'win-unpacked';
  const dest = path.join(DIST, unpacked);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(TMP_OUT, unpacked), dest, { recursive: true });
  copied.push(dest);
}
fs.readdirSync(TMP_OUT).filter((f) => /\.(exe|blockmap|AppImage|deb|rpm|tar\.gz)$/i.test(f) || /^latest(-linux)?\.yml$/.test(f)).forEach((f) => {
  fs.copyFileSync(path.join(TMP_OUT, f), path.join(DIST, f));
  copied.push(path.join(DIST, f));
});
fs.rmSync(TMP_OUT, { recursive: true, force: true });

console.log('\nDone. Output:');
copied.forEach((f) => console.log('  ' + f));
if (publish) console.log('\nA DRAFT release was uploaded to GitHub. Open it on github.com and click "Publish release" to roll the update out.');
