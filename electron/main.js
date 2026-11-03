/* Todo4Me — Electron main process.
 *
 * Wraps the existing web app (index.html + css/ + js/) unchanged. Responsibilities:
 *  - a fixed, stable data folder so LocalStorage survives updates and restarts
 *  - single instance (two instances must never share the LocalStorage database)
 *  - flushing LocalStorage to disk before quitting
 *  - secure defaults: contextIsolation, no nodeIntegration, sandbox, no remote
 *    navigation, external links open in the system browser, permissions denied
 *  - application menu, save dialog for exports, daily JSON backup files
 *  - editor: PDF export (Chromium print engine), daily documents backup, a short
 *    "save before close" handshake so no keystroke is lost when the window closes
 *  - automatic updates (see updater.js)
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
 * TODO4ME_USER_DATA lets tests run against an isolated folder.
 * A build may set "todo4meDataFolder" in its package.json (electron-builder
 * extraMetadata) so a test or beta build can never share data with the real app;
 * regular builds don't have it and always use %APPDATA%\Todo4Me. */
let dataFolder = APP_NAME;
try {
  const pkg = require('../package.json');
  if (typeof pkg.todo4meDataFolder === 'string' && /^[\w .-]{1,60}$/.test(pkg.todo4meDataFolder)) dataFolder = pkg.todo4meDataFolder;
} catch (e) { /* default */ }
app.setName(APP_NAME);
app.setPath('userData', process.env.TODO4ME_USER_DATA || path.join(app.getPath('appData'), dataFolder));
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 14;
const updater = require('./updater');

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
let allowClose = false; // set right before an update restart (data is already saved then)

function onReady() {
  hardenSession();
  registerIpc();
  updater.init({ beforeInstall: saveEverything });
  Menu.setApplicationMenu(buildMenu());
  createWindow();
}

/** Ask the page to save open documents; resolves on its answer or after a timeout. */
function requestRendererSave(win, timeout) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed() || (win.webContents.isCrashed && win.webContents.isCrashed())) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ipcMain.removeListener('app:close-ready', onReady);
      resolve();
    };
    const onReady = (e) => { if (e.sender === win.webContents) finish(); };
    ipcMain.on('app:close-ready', onReady);
    const timer = setTimeout(finish, timeout || 3000);
    win.webContents.send('app:before-close');
  });
}
async function saveEverything() {
  await Promise.all(BrowserWindow.getAllWindows().map((w) => requestRendererSave(w, 4000)));
  try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
  allowClose = true;
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
  // The editor saves documents asynchronously, so the window first lets the page finish
  // saving (at most 3 seconds), then closes for real.
  let closeReady = false, closing = false;
  const win = mainWindow;
  mainWindow.on('close', (event) => {
    try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
    if (closeReady || allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    requestRendererSave(win).then(() => {
      closeReady = true;
      try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
      if (!win.isDestroyed()) win.close();
    });
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

  // "Export JSON" / "Export Markdown" create a download → show a normal Save dialog in Documents.
  ses.on('will-download', (_event, item) => {
    const ext = path.extname(item.getFilename()).slice(1).toLowerCase();
    item.setSaveDialogOptions({
      title: ext === 'md' ? 'Save Markdown file' : 'Save Todo4Me backup',
      defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      filters: ext === 'md' ? [{ name: 'Markdown', extensions: ['md'] }] : [{ name: 'JSON', extensions: ['json'] }],
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
  ipcMain.handle('backup:write', (_e, json) => writeDailyBackup('todo4me-', json, 50 * 1024 * 1024));
  // Daily snapshot of the editor documents (with images) — same rules, separate files.
  ipcMain.handle('backup:write-docs', (_e, json) => writeDailyBackup('documents-', json, 500 * 1024 * 1024));

  // PDF export of the document currently shown in the editor (the page applies print styles).
  const exported = new Set();
  let lastPdfDir = null;
  ipcMain.handle('pdf:export', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'No window' };
    let name = String((opts && opts.filename) || 'document.pdf').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || 'document.pdf';
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    let filePath;
    if (process.env.TODO4ME_PDF_DIR) { // tests: no dialog
      fs.mkdirSync(process.env.TODO4ME_PDF_DIR, { recursive: true });
      filePath = path.join(process.env.TODO4ME_PDF_DIR, name);
    } else {
      const res = await dialog.showSaveDialog(win, {
        title: 'Export as PDF',
        defaultPath: path.join(lastPdfDir || app.getPath('documents'), name),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      filePath = res.filePath;
    }
    try {
      const data = await event.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true });
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, filePath);
      exported.add(filePath);
      lastPdfDir = path.dirname(filePath);
      return { ok: true, path: filePath, size: data.length };
    } catch (e) {
      try { fs.unlinkSync(filePath + '.tmp'); } catch (x) { /* ignore */ }
      return { ok: false, error: /EBUSY|EPERM|EACCES/.test(e.code || e.message) ? 'The file is open in another program or not writable. Close it and try again.' : e.message };
    }
  });
  // Only files this session exported may be opened from the page.
  ipcMain.handle('file:open', (_e, p) => {
    if (typeof p !== 'string' || !exported.has(p)) return false;
    shell.openPath(p);
    return true;
  });
}

function writeDailyBackup(prefix, json, maxLen) {
  if (typeof json !== 'string' || json.length < 2 || json.length > maxLen) return { ok: false, error: 'invalid payload' };
  try { JSON.parse(json); } catch (e) { return { ok: false, error: 'invalid JSON' }; }
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const file = path.join(BACKUP_DIR, prefix + stamp + '.json');
    // Keep the first snapshot of the day: a later mistake the same day can't overwrite it.
    if (fs.existsSync(file)) return { ok: true, skipped: true, file };
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file); // atomic replace: never leaves a half-written backup
    pruneBackups(prefix);
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function pruneBackups(prefix) {
  const re = new RegExp('^' + prefix + '\\d{4}-\\d{2}-\\d{2}\\.json$');
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => re.test(f)).sort();
  files.slice(0, Math.max(0, files.length - MAX_BACKUPS)).forEach((f) => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* ignore */ }
  });
}

/* ---------- Menu ---------- */
// meta.accel tells the page the command came from a keyboard shortcut (so the editor
// can keep e.g. Ctrl+I for italic while typing).
function send(action, meta) {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('menu:action', action, meta || {});
}
const viaKey = (e) => ({ accel: !!(e && e.triggeredByAccelerator) });

function buildMenu() {
  const go = (label, route, accelerator) => ({ label, accelerator, click: (_i, _w, e) => send('go:' + route, viaKey(e)) });
  return Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        { label: 'New task', accelerator: 'CmdOrCtrl+N', click: (_i, _w, e) => send('new-task', viaKey(e)) },
        { label: 'Quick capture', accelerator: 'CmdOrCtrl+Shift+Space', click: (_i, _w, e) => send('quick-capture', viaKey(e)) },
        { label: 'New weekly note', accelerator: 'CmdOrCtrl+Shift+N', click: (_i, _w, e) => send('new-note', viaKey(e)) },
        { label: 'New document', accelerator: 'CmdOrCtrl+Alt+N', click: (_i, _w, e) => send('new-document', viaKey(e)) },
        { type: 'separator' },
        { label: 'Export document as PDF…', accelerator: 'CmdOrCtrl+P', click: (_i, _w, e) => send('export-pdf', viaKey(e)) },
        { label: 'Export data (JSON)…', accelerator: 'CmdOrCtrl+E', click: (_i, _w, e) => send('export-data', viaKey(e)) },
        { label: 'Import data (JSON)…', accelerator: 'CmdOrCtrl+I', click: (_i, _w, e) => send('import-data', viaKey(e)) },
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
        go('Editor', 'editor', 'CmdOrCtrl+Shift+D'),
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
        { label: 'Check for updates…', click: () => updater.check(true) },
        { type: 'separator' },
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
