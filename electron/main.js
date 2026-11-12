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
 *  - downloading subscribed calendars (ICS) for the page, which itself has no network access (see calendar.js)
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
const WINDOW_BG = '#f6f6f8';

/* UI language reported by the renderer (menu, tray and notifications can read it; translations follow in a later step). */
const UI_LANGUAGES = ['en', 'de', 'tr', 'es'];
let uiLanguage = 'en';
const i18n = require('./i18n');
const T = (key, params) => i18n.t(key, params);

/* ---------- Stable data location ----------
 * All LocalStorage data lives in <userData>/Local Storage. Pin userData to
 * <appData>\Todo4Me (Windows: %APPDATA%\Todo4Me, Linux: ~/.config/Todo4Me) so that renaming, updating, or switching between the
 * installed and the portable build never "loses" data.
 * TODO4ME_USER_DATA lets tests run against an isolated folder.
 * A build may set "todo4meDataFolder" in its package.json (electron-builder
 * extraMetadata) so a test or beta build can never share data with the real app;
 * regular builds don't have it and always use <appData>/Todo4Me. */
/* Linux AppImage on distros that restrict unprivileged user namespaces (Ubuntu 23.10+: AppArmor
 * apparmor_restrict_unprivileged_userns=1): an AppImage has no AppArmor profile and runs from a
 * FUSE mount, so Chromium's sandbox cannot start and the app would abort at launch. Only in that
 * exact situation we start with --no-sandbox. Trade-off: the Chromium process sandbox is off for the
 * AppImage (the window itself still uses contextIsolation, a sandboxed renderer setting and loads
 * only local files). The deb/rpm packages ship an AppArmor profile (or setuid sandbox) and keep the
 * sandbox; users can also pick those formats. Must run before app 'ready'. */
if (process.platform === 'linux' && process.env.APPIMAGE) {
  try {
    if (fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1') {
      app.commandLine.appendSwitch('no-sandbox');
    }
  } catch (e) { /* file missing: no such restriction */ }
}

let dataFolder = APP_NAME;
let appId = 'com.todo4me.app'; // = build.appId (the installer gives its shortcuts this AppUserModelID)
try {
  const pkg = require('../package.json');
  if (typeof pkg.todo4meDataFolder === 'string' && /^[\w .-]{1,60}$/.test(pkg.todo4meDataFolder)) dataFolder = pkg.todo4meDataFolder;
  if (pkg.build && typeof pkg.build.appId === 'string' && /^[\w.-]{1,100}$/.test(pkg.build.appId)) appId = pkg.build.appId;
} catch (e) { /* default */ }
app.setName(APP_NAME);
app.setPath('userData', process.env.TODO4ME_USER_DATA || path.join(app.getPath('appData'), dataFolder));
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 14;
const updater = require('./updater');
const background = require('./background');
const calendar = require('./calendar');

/* ---------- Single instance ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    // A second start brings the window to the front (also out of the tray) — except an
    // autostart at login, which must not pop up a window that is already running hidden.
    if (Array.isArray(argv) && argv.includes(background.HIDDEN_ARG)) return;
    showWindow();
  });
  app.whenReady().then(onReady);
}

let mainWindow = null;
let allowClose = false; // set right before an update restart (data is already saved then)
// Closing the window hides it to the tray; only a real quit closes it. `quitting` is set by every
// way of really quitting: app.quit() (tray → Quit, File → Exit, the updater's quitAndInstall)
// via 'before-quit', and Windows shutdown/logoff via the window's session-end events.
let quitting = false;

function onReady() {
  hardenSession();
  registerIpc();
  calendar.init(); // calendar subscriptions: validated https download of ICS files (see calendar.js)
  updater.init({
    beforeInstall: saveEverything,
    installAborted: () => { allowClose = false; }, // the Linux install was cancelled: closing the window hides to the tray again
    // The page announces a ready update with a toast, but nobody sees it while the window is hidden in
    // the tray — and closing the window no longer quits (which used to install the update). So say it
    // with a system notification; clicking it restarts into the new version.
    onReady: (version) => {
      const win = mainWindow;
      if (win && !win.isDestroyed() && win.isVisible()) return;
      background.notify({ id: 'update', title: T('notif.updateTitle', { version: version || '' }), body: T('notif.updateBody') });
    },
  });
  Menu.setApplicationMenu(buildMenu());
  background.init({
    appId,
    file: path.join(app.getPath('userData'), 'desktop-settings.json'),
    iconPath: path.join(ROOT, 'assets', 'icons', 'icon.png'),
    showWindow,
    send,
    notificationClick: (id, action) => {
      if (id === 'update') { updater.install(); return; }
      const win = mainWindow || BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('notification:click', id, action || null);
    },
    quit: () => app.quit(),
  });
  createWindow();
}

/** Bring the window back (from the tray, minimized or behind other windows). */
function showWindow() {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) { if (app.isReady() && !quitting) createWindow(true); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
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

function createWindow(forceShow) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: APP_NAME,
    icon: path.join(ROOT, 'assets', 'icons', 'icon.png'),
    backgroundColor: WINDOW_BG,
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

  // Started at login (--hidden): stay in the tray. The page still loads, so reminders run.
  const hidden = !forceShow && background.startHidden(process.argv);
  mainWindow.once('ready-to-show', () => { if (!hidden && mainWindow) mainWindow.show(); });

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
  // Closing the window while the app is not quitting only hides it to the tray (if enabled).
  let closeReady = false, closing = false;
  const win = mainWindow;
  mainWindow.on('close', (event) => {
    try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
    if (closeReady || allowClose) return;
    if (!quitting && !closing && background.shouldHideOnClose()) {
      event.preventDefault();
      // Save open documents anyway (the app keeps running, but Windows could end it later).
      requestRendererSave(win).then(() => { try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ } });
      win.hide();
      background.onHidden();
      return;
    }
    event.preventDefault();
    if (closing) return;
    closing = true;
    requestRendererSave(win).then(() => {
      closeReady = true;
      try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
      if (!win.isDestroyed()) win.close();
    });
  });
  // Windows shutdown / restart / logoff: this is a real quit, never "hide to tray".
  // ('before-quit' is not emitted in that case.) Save as much as possible right away.
  const sessionEnding = () => {
    quitting = true;
    try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
  };
  mainWindow.on('query-session-end', () => { sessionEnding(); requestRendererSave(win, 2000).then(sessionEnding); });
  mainWindow.on('session-end', sessionEnding);
  mainWindow.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  setupZoom(mainWindow);
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
  // The only exception: 'fullscreen' (the editor's full-screen writing mode), and only for the app's own page (file://…/index.html).
  const appUrl = INDEX_URL;
  const isOwnPage = (url) => typeof url === 'string' && url.split('#')[0].split('?')[0] === appUrl;
  ses.setPermissionRequestHandler((wc, perm, callback, details) => callback(perm === 'fullscreen' && isOwnPage((details && details.requestingUrl) || (wc && wc.getURL && wc.getURL()))));
  ses.setPermissionCheckHandler((wc, perm, origin, details) => perm === 'fullscreen' && isOwnPage((details && details.requestingUrl) || (wc && wc.getURL && wc.getURL())));

  // Exports (JSON, Markdown, and the editor's Word / HTML / text exports) create a download → show a normal Save dialog in Documents.
  // Strict allowlist: only these extensions get a typed filter; anything else gets "All files" (the extension list is never built from the file name).
  const DOWNLOAD_TYPES = {
    json: { title: 'dlg.saveBackup', name: () => 'JSON' },
    md: { title: 'dlg.saveMarkdown', name: () => 'Markdown' },
    docx: { title: 'dlg.saveWord', name: () => T('flt.word') },
    html: { title: 'dlg.saveHtml', name: () => 'HTML' },
    txt: { title: 'dlg.saveText', name: () => T('flt.text') },
    rtf: { title: 'dlg.saveRtf', name: () => T('flt.rtf') },
  };
  ses.on('will-download', (_event, item) => {
    const ext = path.extname(item.getFilename()).slice(1).toLowerCase();
    const type = Object.prototype.hasOwnProperty.call(DOWNLOAD_TYPES, ext) ? DOWNLOAD_TYPES[ext] : null;
    item.setSaveDialogOptions({
      title: type ? T(type.title) : T('dlg.saveFile'),
      defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      filters: type ? [{ name: type.name(), extensions: [ext] }] : [{ name: T('flt.all'), extensions: ['*'] }],
    });
  });
}

/* ---------- IPC (only what the renderer strictly needs) ---------- */
function registerIpc() {
  ipcMain.handle('i18n:set-language', (_e, lang) => {
    if (UI_LANGUAGES.includes(lang) && lang !== uiLanguage) {
      uiLanguage = lang;
      i18n.setLanguage(lang);
      try { Menu.setApplicationMenu(buildMenu()); } catch (e) { /* keep the old menu */ }
      try { background.refreshLanguage(); } catch (e) { /* tray menu keeps the old texts */ }
    }
    return { ok: UI_LANGUAGES.includes(lang), language: uiLanguage };
  });

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
        title: T('dlg.exportPdf'),
        defaultPath: path.join(lastPdfDir || app.getPath('documents'), name),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      filePath = res.filePath;
    }
    // The window's background color shows through the page margins of the PDF: print on white paper.
    win.setBackgroundColor('#ffffff');
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
    } finally {
      if (!win.isDestroyed()) win.setBackgroundColor(WINDOW_BG);
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

/* ---------- Zoom (Ctrl +, Ctrl -, Ctrl 0) ---------- */
// The built-in zoomIn role listens for CommandOrControl+Plus, which does not fire on many layouts
// ("+" is a plain key on a German keyboard but Shift+= on a US one). So the keys are matched here on the
// produced character (input.key), and the menu items call the same functions.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function currentWindow() {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  return win && !win.isDestroyed() ? win : null;
}
function applyZoom(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try { win.webContents.setZoomFactor(background.getZoom()); } catch (e) { /* ignore */ }
}
/** dir: 1 = zoom in, -1 = zoom out, 0 = reset to 100 %. Moves to the next step relative to the current factor. */
function zoomBy(dir, win) {
  win = win || currentWindow();
  if (!win) return;
  const cur = background.getZoom();
  let next = 1;
  if (dir > 0) next = ZOOM_STEPS.find((z) => z > cur + 0.001) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  else if (dir < 0) next = [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001) || ZOOM_STEPS[0];
  background.setZoom(next);
  applyZoom(win);
}
/** Which zoom command a key press means (null = none). Alt is excluded (AltGr on German layouts, Ctrl+Alt+0 in the editor). */
function zoomKeyDir(input) {
  if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return null;
  if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') return 1;
  if (input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract') return -1;
  if (input.key === '0' && !input.shift) return 0;
  return null;
}
function setupZoom(win) {
  const wc = win.webContents;
  wc.on('before-input-event', (event, input) => {
    const dir = zoomKeyDir(input);
    if (dir === null) return;
    event.preventDefault();
    zoomBy(dir, win);
  });
  // A (re)load or navigation can reset the factor: apply the saved one again.
  wc.on('dom-ready', () => applyZoom(win));
  wc.on('did-finish-load', () => applyZoom(win));
  applyZoom(win);
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
  const viewRole = (role, key) => (uiLanguage === 'en' ? { role } : { role, label: T(key) });
  const go = (label, route, accelerator) => ({ label, accelerator, click: (_i, _w, e) => send('go:' + route, viaKey(e)) });
  return Menu.buildFromTemplate([
    {
      label: T('menu.file'),
      submenu: [
        { label: T('menu.newTask'), accelerator: 'CmdOrCtrl+N', click: (_i, _w, e) => send('new-task', viaKey(e)) },
        { label: T('menu.quickCapture'), accelerator: 'CmdOrCtrl+Shift+Space', click: (_i, _w, e) => send('quick-capture', viaKey(e)) },
        { label: T('menu.newNote'), accelerator: 'CmdOrCtrl+Shift+N', click: (_i, _w, e) => send('new-note', viaKey(e)) },
        { label: T('menu.newDoc'), accelerator: 'CmdOrCtrl+Alt+N', click: (_i, _w, e) => send('new-document', viaKey(e)) },
        { type: 'separator' },
        { label: T('menu.exportPdf'), accelerator: 'CmdOrCtrl+P', click: (_i, _w, e) => send('export-pdf', viaKey(e)) },
        { label: T('menu.exportData'), accelerator: 'CmdOrCtrl+E', click: (_i, _w, e) => send('export-data', viaKey(e)) },
        { label: T('menu.importData'), accelerator: 'CmdOrCtrl+I', click: (_i, _w, e) => send('import-data', viaKey(e)) },
        { type: 'separator' },
        { label: T('menu.openBackups'), click: () => { fs.mkdirSync(BACKUP_DIR, { recursive: true }); shell.openPath(BACKUP_DIR); } },
        { label: T('menu.openData'), click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: T('menu.exit') },
      ],
    },
    // English keeps Electron's own Edit menu; the other languages get the same entries with translated labels.
    uiLanguage === 'en' ? { role: 'editMenu' } : {
      label: T('menu.edit'),
      submenu: [
        { role: 'undo', label: T('menu.undo') },
        { role: 'redo', label: T('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: T('menu.cut') },
        { role: 'copy', label: T('menu.copy') },
        { role: 'paste', label: T('menu.paste') },
        { role: 'selectAll', label: T('menu.selectAll') },
      ],
    },
    {
      label: T('menu.go'),
      submenu: [
        go(T('menu.dashboard'), 'dashboard', 'CmdOrCtrl+1'),
        go(T('menu.inbox'), 'inbox', 'CmdOrCtrl+2'),
        go(T('menu.tasks'), 'tasks', 'CmdOrCtrl+3'),
        go(T('menu.today'), 'today', 'CmdOrCtrl+4'),
        go(T('menu.upcoming'), 'upcoming', 'CmdOrCtrl+5'),
        go(T('menu.planner'), 'planner', 'CmdOrCtrl+6'),
        go(T('menu.plan'), 'plan', 'CmdOrCtrl+7'),
        go(T('menu.notes'), 'notes', 'CmdOrCtrl+8'),
        go(T('menu.editor'), 'editor', 'CmdOrCtrl+Shift+D'),
        go(T('menu.focus'), 'focus', 'CmdOrCtrl+9'),
        go(T('menu.stats'), 'stats'),
        go(T('menu.settings'), 'settings', 'CmdOrCtrl+,'),
      ],
    },
    {
      label: T('menu.view'),
      submenu: [
        viewRole('reload', 'menu.reload'),
        viewRole('toggleDevTools', 'menu.devTools'),
        { type: 'separator' },
        // Keys are handled in setupZoom() (registerAccelerator: false = only show the shortcut in the label).
        { label: T('menu.resetZoom'), accelerator: 'CmdOrCtrl+0', registerAccelerator: false, click: () => zoomBy(0) },
        { label: T('menu.zoomIn'), accelerator: 'CmdOrCtrl+Plus', registerAccelerator: false, click: () => zoomBy(1) },
        { label: T('menu.zoomOut'), accelerator: 'CmdOrCtrl+-', registerAccelerator: false, click: () => zoomBy(-1) },
        { type: 'separator' },
        viewRole('togglefullscreen', 'menu.fullscreen'),
      ],
    },
    {
      label: T('menu.help'),
      submenu: [
        { label: T('menu.checkUpdates'), click: () => updater.check(true) },
        { type: 'separator' },
        {
          label: T('menu.about'),
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: T('menu.about'),
            message: 'Todo4Me ' + app.getVersion(),
            detail: T('about.dataDir') + '\n' + app.getPath('userData') +
              '\n\n' + T('about.backupDir') + '\n' + BACKUP_DIR +
              '\n\nElectron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome,
          }),
        },
      ],
    },
  ]);
}

/* ---------- Lifecycle ---------- */
app.on('before-quit', () => {
  quitting = true; // from now on closing the window really closes it (with the save handshake)
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
