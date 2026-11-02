/* Todo4Me — Electron main process.
 *
 * Wraps the existing web app (index.html + css/ + js/) unchanged. Responsibilities:
 *  - a fixed, stable data folder so LocalStorage survives updates and restarts
 *  - single instance (two instances must never share the LocalStorage database)
 *  - flushing LocalStorage to disk before quitting
 *  - secure defaults: contextIsolation, no nodeIntegration, sandbox, no remote
 *    navigation, external links open in the system browser, permissions denied
 *  - application menu, save dialog for exports, daily JSON backup files
 */
'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_NAME = 'Todo4Me';
const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const INDEX_URL = pathToFileURL(INDEX).href;
const isDev = process.argv.includes('--dev');

/* ---------- Stable data location ----------
 * All LocalStorage data lives in <userData>/Local Storage. Pin userData to
 * %APPDATA%\Todo4Me so that renaming, updating, or switching between the
 * installed and the portable build never "loses" data.
 * TODO4ME_USER_DATA lets tests run against an isolated folder. */
app.setName(APP_NAME);
app.setPath('userData', process.env.TODO4ME_USER_DATA || path.join(app.getPath('appData'), APP_NAME));
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 14;

/* ---------- Single instance ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(onReady);
}

let mainWindow = null;

function onReady() {
  hardenSession();
  registerIpc();
  Menu.setApplicationMenu(buildMenu());
  createWindow();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: APP_NAME,
    icon: path.join(ROOT, 'assets', 'icons', 'icon.png'),
    backgroundColor: '#f6f6f8',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      // The Pomodoro end sound plays without a click; allow it.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Only the app itself may be shown in the window; everything else opens externally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== INDEX_URL) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });

  // Write LocalStorage to disk before the window goes away.
  mainWindow.on('close', () => {
    try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadFile(INDEX);
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function openExternalSafely(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

/* ---------- Session hardening & downloads ---------- */
function hardenSession() {
  const ses = session.defaultSession;
  // The app needs no camera, microphone, notifications, geolocation, …
  ses.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  // "Export JSON" creates a download → show a normal Save dialog in Documents.
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: 'Save Todo4Me backup',
      defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
  });
}

/* ---------- IPC (only what the renderer strictly needs) ---------- */
function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    userData: app.getPath('userData'),
    backupDir: BACKUP_DIR,
  }));

  ipcMain.handle('folder:open', (_e, which) => {
    const target = which === 'backups' ? BACKUP_DIR : which === 'data' ? app.getPath('userData') : null;
    if (!target) return false;
    fs.mkdirSync(target, { recursive: true });
    shell.openPath(target);
    return true;
  });

  // Daily safety snapshot of the app data as a plain JSON file.
  ipcMain.handle('backup:write', (_e, json) => {
    if (typeof json !== 'string' || json.length < 2 || json.length > 50 * 1024 * 1024) return { ok: false, error: 'invalid payload' };
    try { JSON.parse(json); } catch (e) { return { ok: false, error: 'invalid JSON' }; }
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const d = new Date();
      const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const file = path.join(BACKUP_DIR, 'todo4me-' + stamp + '.json');
      // Keep the first snapshot of the day: a later mistake the same day can't overwrite it.
      if (fs.existsSync(file)) return { ok: true, skipped: true, file };
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, file); // atomic replace: never leaves a half-written backup
      pruneBackups();
      return { ok: true, file };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^todo4me-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  files.slice(0, Math.max(0, files.length - MAX_BACKUPS)).forEach((f) => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* ignore */ }
  });
}

/* ---------- Menu ---------- */
function send(action) {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('menu:action', action);
}

function buildMenu() {
  const go = (label, route, accelerator) => ({ label, accelerator, click: () => send('go:' + route) });
  return Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        { label: 'New task', accelerator: 'CmdOrCtrl+N', click: () => send('new-task') },
        { label: 'Quick capture', accelerator: 'CmdOrCtrl+Shift+Space', click: () => send('quick-capture') },
        { label: 'New weekly note', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new-note') },
        { type: 'separator' },
        { label: 'Export data (JSON)…', accelerator: 'CmdOrCtrl+E', click: () => send('export-data') },
        { label: 'Import data (JSON)…', accelerator: 'CmdOrCtrl+I', click: () => send('import-data') },
        { type: 'separator' },
        { label: 'Open backups folder', click: () => { fs.mkdirSync(BACKUP_DIR, { recursive: true }); shell.openPath(BACKUP_DIR); } },
        { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '&Go',
      submenu: [
        go('Dashboard', 'dashboard', 'CmdOrCtrl+1'),
        go('Inbox', 'inbox', 'CmdOrCtrl+2'),
        go('My Tasks', 'tasks', 'CmdOrCtrl+3'),
        go('Today', 'today', 'CmdOrCtrl+4'),
        go('Upcoming', 'upcoming', 'CmdOrCtrl+5'),
        go('Weekly Planner', 'planner', 'CmdOrCtrl+6'),
        go('Daily Plan', 'plan', 'CmdOrCtrl+7'),
        go('Weekly Notes', 'notes', 'CmdOrCtrl+8'),
        go('Focus Mode', 'focus', 'CmdOrCtrl+9'),
        go('Statistics', 'stats'),
        go('Settings', 'settings', 'CmdOrCtrl+,'),
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'About Todo4Me',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Todo4Me',
            message: 'Todo4Me ' + app.getVersion(),
            detail: 'Your data is stored locally on this computer:\n' + app.getPath('userData') +
              '\n\nDaily backup files:\n' + BACKUP_DIR +
              '\n\nElectron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome,
          }),
        },
      ],
    },
  ]);
}

/* ---------- Lifecycle ---------- */
app.on('before-quit', () => {
  try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
// Refuse to create any additional webviews/windows from content.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
