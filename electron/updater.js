/* Todo4Me — automatic updates (electron-updater).
 *
 * How it works:
 *  - The installed app (NSIS setup) checks the release feed shortly after start and
 *    every 4 hours. Releases are published to GitHub (see package.json → build.publish).
 *  - A new version is downloaded in the background; the user is told when it is ready
 *    and can restart now or later (it is also installed automatically on the next quit).
 *  - User data lives in %APPDATA%\Todo4Me, outside the installation folder, so updating
 *    never touches tasks, notes or documents.
 *  - The portable .exe and the unpackaged dev app cannot update themselves; the state
 *    is then "unsupported" and the UI explains how to update manually.
 *
 * TODO4ME_UPDATE_URL (optional) points the updater at another feed (a folder with
 * latest.yml + the installer, served over HTTP) — used to test updates locally. */
'use strict';

const { app, ipcMain, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const T = (key, params) => require('./i18n').t(key, params);

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (e) { autoUpdater = null; }

const CHECK_DELAY_MS = 10 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

const state = {
  status: 'idle',       // idle | unsupported | checking | available | downloading | ready | latest | error
  current: app.getVersion(),
  version: null,        // version being offered
  percent: 0,
  error: null,
  checkedAt: null,
  reason: null,         // why updates are unsupported
};
let manualCheck = false;
let beforeInstall = () => {};
let onReady = () => {};

function supported() {
  if (!autoUpdater) return T('upd.missing');
  if (process.env.PORTABLE_EXECUTABLE_DIR) return T('upd.portable');
  if (!app.isPackaged && !process.env.TODO4ME_UPDATE_URL) return T('upd.installedOnly');
  if (process.platform !== 'win32' && process.platform !== 'darwin') return T('upd.noAuto');
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
  if (state.status === 'ready') return state;
  manualCheck = !!manual;
  set({ status: 'checking', error: null });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ status: 'error', error: friendlyError(err), checkedAt: new Date().toISOString() });
  }
  return state;
}

function init(opts) {
  beforeInstall = (opts && opts.beforeInstall) || beforeInstall;
  onReady = (opts && opts.onReady) || onReady;
  ipcMain.handle('update:get', () => Object.assign({}, state, { reason: state.reason || supported() }));
  ipcMain.handle('update:check', () => check(true));
  ipcMain.handle('update:install', () => install());

  const why = supported();
  if (why) { state.status = 'unsupported'; state.reason = why; return; }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = null;
  if (process.env.TODO4ME_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.TODO4ME_UPDATE_URL });

  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info && info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest', checkedAt: new Date().toISOString(), version: null }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info && info.version, percent: 100, checkedAt: new Date().toISOString() });
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
  if (state.status !== 'ready' || !autoUpdater) return { ok: false, error: T('upd.noneReady') };
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

module.exports = { init, check, install, get state() { return state; } };
