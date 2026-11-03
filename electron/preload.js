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
