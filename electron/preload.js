/* Todo4Me — preload (runs sandboxed, with contextIsolation).
 * Exposes a minimal, explicit API as window.todo4meDesktop.
 * No Node.js APIs and no raw ipcRenderer are handed to the page. */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todo4meDesktop', {
  isDesktop: true,
  platform: process.platform,

  /** { version, userData, backupDir } */
  getInfo: () => ipcRenderer.invoke('app:info'),

  /** Write today's safety snapshot (JSON string) to <userData>/backups. */
  writeBackup: (json) => ipcRenderer.invoke('backup:write', String(json)),

  /** Write today's snapshot of the editor documents (JSON string) to <userData>/backups. */
  writeDocBackup: (json) => ipcRenderer.invoke('backup:write-docs', String(json)),

  /** Open 'data' or 'backups' folder in Explorer. */
  openFolder: (which) => ipcRenderer.invoke('folder:open', which === 'backups' ? 'backups' : 'data'),

  /** Print the current page (the editor applies print styles) to a PDF file chosen by the user. */
  exportPDF: (opts) => ipcRenderer.invoke('pdf:export', { filename: String((opts && opts.filename) || 'document.pdf') }),

  /** Open a file this session exported (e.g. the PDF) with the default program. */
  openPath: (p) => ipcRenderer.invoke('file:open', String(p)),

  /** Subscribe to application-menu commands. Returns an unsubscribe function.
   *  callback(action, { accel }) — accel is true when triggered by a keyboard shortcut. */
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action, meta) => { if (typeof action === 'string') callback(action, { accel: !!(meta && meta.accel) }); };
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },

  /** Called before the window closes; the callback may return a Promise (max. ~3 s). */
  onBeforeClose: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('app:before-close', async () => {
      try { await callback(); } catch (e) { /* closing anyway */ }
      ipcRenderer.send('app:close-ready');
    });
  },

  /* ---------- Tray, start with Windows, global hotkey (machine settings, validated in main) ---------- */
  getDesktopSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  setDesktopSettings: (patch) => {
    const p = {};
    ['closeToTray', 'openAtLogin', 'hotkeyEnabled'].forEach((k) => { if (patch && typeof patch[k] === 'boolean') p[k] = patch[k]; });
    if (patch && typeof patch.hotkey === 'string') p.hotkey = patch.hotkey.slice(0, 40);
    return ipcRenderer.invoke('desktop:set-settings', p);
  },

  /* ---------- Native notifications (reminders) ---------- */
  /** Show a Windows notification: { id: 'task:<id>' | 'summary' | …, title, body, snooze }. Resolves { ok }. */
  notify: (n) => ipcRenderer.invoke('notify:show', {
    id: String((n && n.id) || '').slice(0, 80),
    title: String((n && n.title) || '').slice(0, 200),
    body: String((n && n.body) || '').slice(0, 400),
    snooze: !!(n && n.snooze),
  }),
  /** callback(id, action) when a notification is clicked (action null) or its Snooze button is used ('snooze'). */
  onNotificationClick: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, id, action) => { if (typeof id === 'string') callback(id, action === 'snooze' ? 'snooze' : null); };
    ipcRenderer.on('notification:click', listener);
    return () => ipcRenderer.removeListener('notification:click', listener);
  },

  /* ---------- Updates ---------- */
  getUpdateState: () => ipcRenderer.invoke('update:get'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, s) => { if (s && typeof s === 'object') callback(s); };
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
});
