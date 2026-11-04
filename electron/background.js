/* Todo4Me — running in the background (main process).
 *
 *  - tray icon with a small menu; closing the window hides it to the tray (setting, default on)
 *    so reminders keep working. Quitting is explicit: tray → Quit, File → Exit, an update restart
 *    or Windows shutting down (main.js tells "hide" and "quit" apart).
 *  - "Start Todo4Me when Windows starts" (setting, default off) → starts hidden in the tray
 *  - a system-wide quick-capture hotkey (setting, default Ctrl+Alt+Space)
 *  - native notifications for reminders (the page decides *when*, see js/reminders.js)
 *
 * These are machine settings, not user data: they live in <userData>/desktop-settings.json
 * (not in the LocalStorage document, not in exports), because the main process needs them
 * before the page has loaded (e.g. to start hidden or to register the hotkey). */
'use strict';

const { app, Tray, Menu, Notification, globalShortcut, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const HIDDEN_ARG = '--hidden';
// Presets only: no AltGr characters on common European layouts (AltGr = Ctrl+Alt, e.g. AltGr+Q = @
// on German keyboards), and nothing the app already uses (Ctrl+Shift+Space, Ctrl+Alt+N).
const HOTKEYS = [
  { id: 'Control+Alt+Space', label: 'Ctrl+Alt+Space' },
  { id: 'Control+Shift+Alt+Space', label: 'Ctrl+Shift+Alt+Space' },
  { id: 'Control+Alt+T', label: 'Ctrl+Alt+T' },
  { id: 'Control+Shift+Alt+T', label: 'Ctrl+Shift+Alt+T' },
];
const DEFAULTS = Object.freeze({ closeToTray: true, openAtLogin: false, hotkeyEnabled: true, hotkey: HOTKEYS[0].id, trayHintShown: false });
const SNOOZE_LABEL = 'Snooze 10 min';

let ctx = null;          // { file, iconPath, showWindow(), send(action), notificationClick(id, action), quit() }
let settings = Object.assign({}, DEFAULTS);
let tray = null;
let hotkey = { registered: null, error: null };
let loginImpl = (opts) => app.setLoginItemSettings(opts);
let loginSupportOverride; // tests: null = treat as supported
const live = new Map();   // notifications must stay referenced, or their click/action events get lost
const shown = [];         // the last notifications shown (diagnostics / tests)

/* ---------- Settings file ---------- */
function sanitize(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    closeToTray: typeof s.closeToTray === 'boolean' ? s.closeToTray : DEFAULTS.closeToTray,
    openAtLogin: s.openAtLogin === true,
    hotkeyEnabled: typeof s.hotkeyEnabled === 'boolean' ? s.hotkeyEnabled : DEFAULTS.hotkeyEnabled,
    hotkey: HOTKEYS.some((h) => h.id === s.hotkey) ? s.hotkey : DEFAULTS.hotkey,
    trayHintShown: s.trayHintShown === true,
  };
}
function load() {
  try { settings = sanitize(JSON.parse(fs.readFileSync(ctx.file, 'utf8'))); } catch (e) { settings = sanitize(null); }
}
function save() {
  try {
    fs.mkdirSync(path.dirname(ctx.file), { recursive: true });
    const tmp = ctx.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tmp, ctx.file);
  } catch (e) { /* settings stay in memory for this session */ }
}

/* ---------- Start with Windows ---------- */
function loginUnsupportedReason() {
  if (loginSupportOverride !== undefined) return loginSupportOverride;
  if (process.platform !== 'win32' && process.platform !== 'darwin') return 'Not available on this system.';
  if (process.env.TODO4ME_USER_DATA) return 'Not available in test runs.';
  if (!app.isPackaged) return 'Only available in the installed app.';
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'Not available in the portable version (it runs from a temporary folder). Use the installer version.';
  return null;
}
function applyLogin() {
  if (loginUnsupportedReason()) return false;
  try {
    loginImpl({ openAtLogin: !!settings.openAtLogin, path: process.execPath, args: [HIDDEN_ARG], name: 'Todo4Me' });
    return true;
  } catch (e) { return false; }
}

/* ---------- Tray ---------- */
function trayImage() {
  const src = nativeImage.createFromPath(ctx.iconPath);
  if (src.isEmpty()) return null;
  const img = nativeImage.createEmpty();
  [[1, 16], [1.5, 24], [2, 32]].forEach(([scaleFactor, size]) => {
    img.addRepresentation({ scaleFactor, width: size, height: size, buffer: src.resize({ width: size, height: size, quality: 'best' }).toPNG() });
  });
  return img;
}
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Todo4Me', click: () => ctx.showWindow() },
    { label: 'Quick capture', click: () => { ctx.showWindow(); ctx.send('quick-capture-global'); } },
    { label: 'New task', click: () => { ctx.showWindow(); ctx.send('new-task-global'); } },
    { type: 'separator' },
    { label: 'Quit Todo4Me', click: () => ctx.quit() },
  ]);
}
function createTray() {
  if (tray && !tray.isDestroyed()) return true;
  try {
    const img = trayImage();
    if (!img) return false;
    tray = new Tray(img);
    tray.setToolTip('Todo4Me');
    tray.setContextMenu(trayMenu());
    tray.on('click', () => ctx.showWindow());
    return true;
  } catch (e) {
    tray = null;
    return false;
  }
}
function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
const hasTray = () => !!tray && !tray.isDestroyed();

/** Closing the window hides it (instead of quitting) only if the user wants that and the tray icon exists. */
function shouldHideOnClose() { return settings.closeToTray && hasTray(); }
/** Launched at login with --hidden: stay in the tray. */
function startHidden(argv) { return (argv || process.argv).includes(HIDDEN_ARG) && shouldHideOnClose(); }

/** Called by main.js after the window was hidden to the tray: one-time hint. */
function onHidden() {
  if (settings.trayHintShown) return;
  settings.trayHintShown = true;
  save();
  const title = 'Todo4Me keeps running in the tray';
  const body = 'Reminders keep working. Click the Todo4Me icon in the notification area to open it again; right-click it → Quit to exit.';
  notify({ id: 'tray-hint', title, body }).then((res) => {
    if (!res.ok && hasTray() && process.platform === 'win32') {
      try { tray.displayBalloon({ title, content: body, iconType: 'info' }); } catch (e) { /* ignore */ }
    }
  });
}

/* ---------- Global hotkey ---------- */
function hotkeyLabel(id) { const h = HOTKEYS.find((x) => x.id === id); return h ? h.label : id; }
function onHotkey() { ctx.showWindow(); ctx.send('quick-capture-global'); }
function applyHotkey() {
  if (hotkey.registered) { try { globalShortcut.unregister(hotkey.registered); } catch (e) { /* ignore */ } }
  hotkey = { registered: null, error: null };
  if (!settings.hotkeyEnabled) return;
  let ok = false;
  try { ok = globalShortcut.register(settings.hotkey, onHotkey); } catch (e) { ok = false; }
  if (ok && globalShortcut.isRegistered(settings.hotkey)) hotkey.registered = settings.hotkey;
  else hotkey.error = hotkeyLabel(settings.hotkey) + ' is already used by another program, so Todo4Me could not reserve it. Choose a different shortcut.';
}

/* ---------- Notifications ---------- */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** Show a native notification. Resolves { ok } once Windows has shown it (or { ok: false, error }). */
function notify(opts) {
  return new Promise((resolve) => {
    const id = typeof opts.id === 'string' && /^[\w:.-]{1,80}$/.test(opts.id) ? opts.id : null;
    const title = clean(opts.title, 120);
    if (!id || !title) { resolve({ ok: false, error: 'invalid notification' }); return; }
    if (!Notification.isSupported()) { resolve({ ok: false, error: 'Notifications are not supported on this system.' }); return; }
    const body = clean(opts.body, 300);
    let n;
    try {
      n = new Notification({
        title, body, icon: ctx.iconPath, silent: false,
        actions: opts.snooze ? [{ type: 'button', text: SNOOZE_LABEL }] : [],
      });
    } catch (e) { resolve({ ok: false, error: e.message }); return; }
    const key = id + '#' + Date.now() + Math.random().toString(36).slice(2, 6);
    live.set(key, n);
    while (live.size > 50) live.delete(live.keys().next().value);
    n.on('click', () => { ctx.showWindow(); ctx.notificationClick(id, null); });
    n.on('action', (details, legacyIndex) => {
      const index = details && typeof details.actionIndex === 'number' ? details.actionIndex : legacyIndex;
      if (opts.snooze && index === 0) ctx.notificationClick(id, 'snooze');
    });
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      shown.push(Object.assign({ id, title, body, at: new Date().toISOString(), snooze: !!opts.snooze }, res));
      if (shown.length > 20) shown.shift();
      if (!res.ok) live.delete(key);
      resolve(res);
    };
    n.once('show', () => finish({ ok: true }));
    n.once('failed', (_e, err) => finish({ ok: false, error: String(err || 'failed') }));
    setTimeout(() => finish({ ok: true, unconfirmed: true }), 4000);
    try { n.show(); } catch (e) { finish({ ok: false, error: e.message }); }
  });
}

/* ---------- State for the page ---------- */
function state() {
  const loginReason = loginUnsupportedReason();
  return {
    closeToTray: settings.closeToTray,
    openAtLogin: settings.openAtLogin && !loginReason,
    loginSupported: !loginReason,
    loginReason,
    tray: hasTray(),
    hotkeyEnabled: settings.hotkeyEnabled,
    hotkey: settings.hotkey,
    hotkeyLabel: hotkeyLabel(settings.hotkey),
    hotkeys: HOTKEYS.map((h) => Object.assign({}, h)),
    hotkeyRegistered: !!hotkey.registered,
    hotkeyError: hotkey.error,
    notifications: Notification.isSupported(),
  };
}

/** Apply a change from the settings page. Only known keys with valid values are accepted. */
function setSettings(patch) {
  if (!patch || typeof patch !== 'object') return state();
  let hotkeyChanged = false, loginChanged = false;
  if (typeof patch.closeToTray === 'boolean' && patch.closeToTray !== settings.closeToTray) {
    settings.closeToTray = patch.closeToTray;
    if (settings.closeToTray) createTray(); else destroyTray();
  }
  if (typeof patch.openAtLogin === 'boolean' && !loginUnsupportedReason() && patch.openAtLogin !== settings.openAtLogin) {
    settings.openAtLogin = patch.openAtLogin;
    loginChanged = true;
  }
  if (typeof patch.hotkeyEnabled === 'boolean' && patch.hotkeyEnabled !== settings.hotkeyEnabled) {
    settings.hotkeyEnabled = patch.hotkeyEnabled;
    hotkeyChanged = true;
  }
  if (typeof patch.hotkey === 'string' && HOTKEYS.some((h) => h.id === patch.hotkey) && patch.hotkey !== settings.hotkey) {
    settings.hotkey = patch.hotkey;
    hotkeyChanged = true;
  }
  if (hotkeyChanged) applyHotkey();
  if (loginChanged) applyLogin();
  save();
  return state();
}

/* ---------- Setup ---------- */
function init(options) {
  ctx = options;
  load();
  if (process.platform === 'win32') {
    // Notifications are attributed to the Start-menu shortcut with this id (set by the installer).
    try { app.setAppUserModelId(app.isPackaged ? options.appId : process.execPath); } catch (e) { /* ignore */ }
  }
  if (settings.closeToTray) createTray();
  applyHotkey();
  if (settings.openAtLogin) applyLogin(); // keeps the entry pointing at the current program file

  ipcMain.handle('desktop:get-settings', () => state());
  ipcMain.handle('desktop:set-settings', (_e, patch) => setSettings(patch));
  ipcMain.handle('notify:show', (_e, opts) => notify(opts && typeof opts === 'object' ? opts : {}));

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch (e) { /* ignore */ }
    destroyTray();
  });
}

module.exports = {
  HIDDEN_ARG, HOTKEYS, init, state, setSettings, shouldHideOnClose, startHidden, onHidden, notify,
  get tray() { return tray; },
  get settings() { return Object.assign({}, settings); },
  get shown() { return shown.slice(); },
  /* test hooks (used by tests/test-electron.mjs through the main-process inspector) */
  _test: {
    triggerHotkey: onHotkey,
    setLogin(fn) { loginImpl = fn; loginSupportOverride = null; },
    trayMenuLabels: () => (hasTray() ? trayMenu().items.map((i) => i.label || '---') : []),
    clickTrayItem(label) { const item = trayMenu().items.find((i) => i.label === label); if (item) item.click(); return !!item; },
    /** Emit 'click' or 'action' on the most recent live notification, as Windows would. */
    emitOnLastNotification(event) {
      const n = Array.from(live.values()).pop();
      if (!n) return false;
      if (event === 'action') n.emit('action', { actionIndex: 0 }, 0); else n.emit('click', {});
      return true;
    },
  },
};
