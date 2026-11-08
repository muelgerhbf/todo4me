/* Todo4Me — automatic updates (electron-updater).
 *
 * How it works:
 *  - The installed app (NSIS setup on Windows, AppImage on Linux) checks the release feed shortly after start and
 *    every 4 hours. Releases are published to GitHub (see package.json → build.publish).
 *  - A new version is downloaded in the background; the user is told when it is ready
 *    and can restart now or later (it is also installed automatically on the next quit; not for deb / rpm, see below).
 *  - User data lives in the user's app-data folder (Windows %APPDATA%\Todo4Me, Linux ~/.config/Todo4Me), outside the installation folder, so updating
 *    never touches tasks, notes or documents.
 *  - The portable .exe and the unpackaged dev app cannot update themselves; the state
 *    is then "unsupported" and the UI explains how to update manually. The same applies to the Linux
 *    tar.gz package. Linux feed: latest-linux.yml. The AppImage installs through electron-updater itself; the
 *    deb / rpm packages are downloaded and sha512-verified by electron-updater, but installed by installPackage()
 *    (async pkexec, no shell, only when the user clicks "Restart & install" — never silently at quit).
 *
 * TODO4ME_UPDATE_URL (optional) points the updater at another feed (a folder with
 * latest.yml + the installer, served over HTTP) — used to test updates locally. */
'use strict';

const { app, ipcMain, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const T = (key, params) => require('./i18n').t(key, params);

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (e) { autoUpdater = null; }

const CHECK_DELAY_MS = 10 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

const state = {
  status: 'idle',       // idle | unsupported | checking | available | downloading | ready | installing | latest | error
  current: app.getVersion(),
  version: null,        // version being offered
  percent: 0,
  error: null,
  checkedAt: null,
  reason: null,         // why updates are unsupported
  notice: null,         // short message next to the status (installing hint, cancelled password prompt, …)
};
let manualCheck = false;
let beforeInstall = () => {};
let onReady = () => {};
let installAborted = () => {};

/* ---------- Linux deb / rpm: package type, tools, installer ---------- */
let pkgTypeOverride;      // tests: undefined = detect, otherwise 'deb' | 'rpm' | null
let findToolOverride = null; // tests: (name) => absolute path | null
let spawnImpl = spawn;
let exitImpl = () => { app.relaunch(); app.quit(); };
let downloaded = null;    // { file, sha512, version } of the update that is ready (deb / rpm)
let installBusy = false;

/** electron-builder writes resources/package-type ("deb" | "rpm") into the Linux packages of those formats. */
function packageType() {
  if (pkgTypeOverride !== undefined) return pkgTypeOverride;
  if (process.platform !== 'linux') return null;
  try {
    const v = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
    return v === 'deb' || v === 'rpm' ? v : null;
  } catch (e) { return null; }
}
/** deb / rpm install: our own pkexec installer instead of electron-updater's synchronous shell-based one. */
function usesPackageInstaller() {
  return process.platform === 'linux' && !process.env.APPIMAGE && !!packageType();
}

/** Find a tool by scanning the absolute directories of PATH (no shell). The tools end up running as root, so
 *  only root-owned files in root-owned directories that nobody else can write to are accepted. */
function findTool(name) {
  if (findToolOverride) return findToolOverride(name);
  const trusted = (p) => { const st = fs.statSync(p); return st.uid === 0 && (st.mode & 0o022) === 0; };
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const file = path.join(dir, name);
    try {
      if (!fs.statSync(file).isFile()) continue;
      fs.accessSync(file, fs.constants.X_OK);
      if (trusted(dir) && trusted(file)) return file;
    } catch (e) { /* not here */ }
  }
  return null;
}

/** The elevated command (after pkexec) for the downloaded package; null when no package manager is available.
 *  File paths are passed as plain argv entries — never through a shell. */
function installCommand(type, file) {
  const tool = (n) => findTool(n);
  let t;
  if (type === 'deb') {
    if ((t = tool('apt-get'))) return [t, 'install', '-y', file];
    if ((t = tool('dpkg'))) return [t, '-i', file];
  } else if (type === 'rpm') {
    // A local rpm from our own release is not signed by a distribution key; dnf/zypper refuse such files unless
    // told otherwise. The integrity check is our own sha512 comparison right before this command runs.
    if ((t = tool('dnf'))) return [t, 'install', '-y', '--nogpgcheck', file];
    if ((t = tool('zypper'))) return [t, '--non-interactive', 'install', '--allow-unsigned-rpm', file];
    if ((t = tool('rpm'))) return [t, '-U', file];
  }
  return null;
}

function supported() {
  if (!autoUpdater) return T('upd.missing');
  if (process.env.PORTABLE_EXECUTABLE_DIR) return T('upd.portable');
  if (!app.isPackaged && !process.env.TODO4ME_UPDATE_URL) return T('upd.installedOnly');
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    if (!packageType()) return T('upd.linuxPackage'); // tar.gz
    if (!findTool('pkexec')) return T('upd.noPkexec');  // deb / rpm without polkit: never offer an install
  }
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') return T('upd.noAuto');
  return null;
}

function broadcast() {
  BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.webContents.send('update:state', Object.assign({}, state, { manual: manualCheck })); });
}
function set(patch) { Object.assign(state, patch); broadcast(); }

/** Turn low-level errors into something a user can act on. */
function friendlyError(err) {
  const msg = String((err && (err.message || err)) || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_CONNECTION|socket hang up|net::/i.test(msg)) {
    return T('upd.offline');
  }
  if (/404|Cannot find latest|No published versions|latest\.yml/i.test(msg)) return T('upd.noInfo');
  if (/sha512|checksum|signature|not signed/i.test(msg)) return T('upd.unverified');
  if (/ENOSPC/i.test(msg)) return T('upd.disk');
  if (/EPERM|EACCES|operation not permitted/i.test(msg)) return T('upd.permission');
  return T('upd.failed', { msg: msg.split('\n')[0].slice(0, 200) });
}

async function check(manual) {
  const why = supported();
  if (why) { set({ status: 'unsupported', reason: why }); return state; }
  if (state.status === 'checking' || state.status === 'downloading') { manualCheck = manualCheck || !!manual; return state; }
  if (state.status === 'ready' || state.status === 'installing') return state;
  manualCheck = !!manual;
  set({ status: 'checking', error: null });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ status: 'error', error: friendlyError(err), checkedAt: new Date().toISOString() });
  }
  return state;
}

/** deb / rpm: never install at quit (that would raise a password prompt while the app closes). */
function applyOptions() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = !usesPackageInstaller();
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = null;
}

/** Remember which file is ready and the sha512 the feed promised for it. */
function onDownloaded(info) {
  downloaded = null;
  if (!usesPackageInstaller() || !info || !info.downloadedFile) return;
  const file = info.downloadedFile;
  const files = Array.isArray(info.files) ? info.files : [];
  const base = path.basename(file);
  const entry = files.find((f) => f && f.url && path.basename(decodeURIComponent(String(f.url))) === base)
    || files.find((f) => f && f.url && path.extname(String(f.url)) === path.extname(file));
  const sha512 = (entry && entry.sha512) || (files.length <= 1 && info.sha512) || null;
  downloaded = { file, sha512, version: info.version };
}

function init(opts) {
  beforeInstall = (opts && opts.beforeInstall) || beforeInstall;
  onReady = (opts && opts.onReady) || onReady;
  installAborted = (opts && opts.installAborted) || installAborted;
  ipcMain.handle('update:get', () => Object.assign({}, state, { reason: state.reason || supported() }));
  ipcMain.handle('update:check', () => check(true));
  ipcMain.handle('update:install', () => install());

  const why = supported();
  if (why) { state.status = 'unsupported'; state.reason = why; return; }

  applyOptions();
  if (process.env.TODO4ME_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.TODO4ME_UPDATE_URL });

  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info && info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest', checkedAt: new Date().toISOString(), version: null }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    onDownloaded(info);
    set({ status: 'ready', notice: null, version: info && info.version, percent: 100, checkedAt: new Date().toISOString() });
    try { onReady(state.version); } catch (e) { /* the page still shows "Restart & install" */ }
  });
  autoUpdater.on('error', (err) => set({ status: 'error', error: friendlyError(err), checkedAt: new Date().toISOString() }));

  setTimeout(() => check(false), CHECK_DELAY_MS);
  setInterval(() => check(false), CHECK_EVERY_MS).unref();
}

/* The installer is told to start Todo4Me again (--force-run), but it does that through the Windows
 * shell, which is not always reachable. As a safety net a small hidden watcher waits until this app
 * has exited and the installer has finished, then starts Todo4Me unless it is already running
 * (a second start would only bring the existing window to the front anyway). */
function spawnRelaunchWatcher() {
  if (process.platform !== 'win32') return;
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const script = [
    '$exe = ' + q(process.execPath),
    '$name = [IO.Path]::GetFileNameWithoutExtension($exe)',
    'while (Get-Process -Id ' + process.pid + ' -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }',
    'Start-Sleep -Seconds 2',
    '$until = (Get-Date).AddMinutes(5)',
    "while ((Get-Date) -lt $until -and (Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*-updater\\pending\\*' })) { Start-Sleep -Milliseconds 500 }",
    'Start-Sleep -Seconds 3',
    'if (-not (Get-Process -Name $name -ErrorAction SilentlyContinue)) { Start-Process -FilePath $exe }',
  ].join('; ');
  try {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) { /* the installer's own restart still applies */ }
}

/** Restart into the new version. Data is flushed first (see main.js beforeInstall). */
async function install() {
  if (installBusy) return { ok: false, busy: true, error: T('upd.installing') }; // one install at a time
  if (state.status !== 'ready' || !autoUpdater) return { ok: false, error: T('upd.noneReady') };
  if (usesPackageInstaller()) return installPackage();
  try {
    await beforeInstall();
    spawnRelaunchWatcher();
    // isSilent: no installer wizard; isForceRunAfter: start Todo4Me again afterwards.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ok: true };
  } catch (err) {
    set({ status: 'error', error: friendlyError(err) });
    return { ok: false, error: state.error };
  }
}

/* ---------- deb / rpm installer ---------- */
function sha512Of(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('base64')));
  });
}
/** First non-empty line of the package manager's output, without control characters. */
function firstLine(text) {
  const l = String(text || '').split(/\r?\n/).map((x) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).find(Boolean);
  return (l || '').slice(0, 200);
}
/** Run `pkexec --disable-internal-agent <cmd>` asynchronously (the password prompt can stay open for a long time). */
function runElevated(pkexec, cmd) {
  return new Promise((resolve) => {
    let stderr = '', done = false;
    const finish = (r) => { if (!done) { done = true; resolve(Object.assign({ stderr }, r)); } };
    let child;
    try {
      child = spawnImpl(pkexec, ['--disable-internal-agent', ...cmd], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
    } catch (error) { finish({ error }); return; }
    if (child.stdout) child.stdout.on('data', () => {}); // drain
    if (child.stderr) child.stderr.on('data', (c) => { if (stderr.length < 4096) stderr = (stderr + c).slice(0, 4096); });
    child.on('error', (error) => finish({ error }));
    child.on('close', (code, signal) => finish({ code, signal }));
  });
}

async function installPackage() {
  installBusy = true;
  const fail = (patch, error) => { // back to a usable state; the user decides about a retry
    installBusy = false;
    try { installAborted(); } catch (e) { /* ignore */ }
    set(patch);
    return { ok: false, error, handled: patch.status === 'ready' };
  };
  try {
    const pkexec = findTool('pkexec');
    if (!pkexec) return fail({ status: 'error', error: T('upd.noPkexec'), notice: null }, T('upd.noPkexec'));
    const type = packageType();
    const file = downloaded && downloaded.file;
    if (!file || !path.isAbsolute(file)) return fail({ status: 'error', error: T('upd.noneReady'), notice: null }, T('upd.noneReady'));
    // Verify the file again right before it is handed to a root process (it sits in a user-writable cache folder).
    let actual = null;
    try { actual = await sha512Of(file); } catch (e) { /* unreadable → treated as unverified */ }
    if (!actual || !downloaded.sha512 || actual !== downloaded.sha512) {
      return fail({ status: 'error', error: T('upd.unverified'), notice: null }, T('upd.unverified'));
    }
    const cmd = installCommand(type, file);
    if (!cmd) return fail({ status: 'error', error: T('upd.noTool'), notice: null }, T('upd.noTool'));

    set({ status: 'installing', notice: T('upd.installing'), error: null });
    await beforeInstall(); // save everything first; the app keeps running while the prompt is open
    const r = await runElevated(pkexec, cmd);
    if (r.error) {
      const msg = T('upd.failed', { msg: firstLine(r.error.message) });
      return fail({ status: 'error', error: msg, notice: null }, msg);
    }
    if (r.code === 0) {
      try { await beforeInstall(); } catch (e) { /* saved before already */ }
      installBusy = false;
      setImmediate(() => exitImpl());
      return { ok: true };
    }
    if (r.code === 126) { const m = T('upd.authCancelled'); return fail({ status: 'ready', notice: m }, m); }
    if (r.code === 127) { const m = T('upd.authFailed'); return fail({ status: 'ready', notice: m }, m); }
    const msg = T('upd.installError', { code: r.code == null ? (r.signal || '?') : r.code, msg: firstLine(r.stderr) });
    return fail({ status: 'error', error: msg, notice: null }, msg);
  } catch (err) {
    const msg = friendlyError(err);
    return fail({ status: 'error', error: msg, notice: null }, msg);
  }
}

module.exports = {
  init, check, install, get state() { return state; },
  /* test hooks (used by tests/test-electron.mjs through the main-process inspector) */
  _test: {
    supported, packageType, applyOptions, onDownloaded, installCommand, findTool,
    get downloaded() { return downloaded; },
    get autoUpdater() { return autoUpdater; },
    setPackageType(v) { pkgTypeOverride = v; },
    setFindTool(fn) { findToolOverride = fn; },
    setSpawn(fn) { spawnImpl = fn || spawn; },
    setExit(fn) { exitImpl = fn || (() => { app.relaunch(); app.quit(); }); },
    setHooks(h) { const prev = { beforeInstall, installAborted }; if (h.beforeInstall) beforeInstall = h.beforeInstall; if (h.installAborted) installAborted = h.installAborted; return prev; },
    setReady(d) { downloaded = d ? { file: d.file, sha512: d.sha512, version: d.version || '9.9.9' } : null; installBusy = false; state.status = d ? 'ready' : 'idle'; state.notice = null; state.error = null; state.version = d ? downloaded.version : null; },
    reset() { pkgTypeOverride = undefined; findToolOverride = null; spawnImpl = spawn; exitImpl = () => { app.relaunch(); app.quit(); }; downloaded = null; installBusy = false; state.status = 'unsupported'; state.notice = null; state.error = null; state.version = null; broadcast(); },
  },
};
