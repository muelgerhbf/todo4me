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

  /** Open 'data' or 'backups' folder in Explorer. */
  openFolder: (which) => ipcRenderer.invoke('folder:open', which === 'backups' ? 'backups' : 'data'),

  /** Subscribe to application-menu commands. Returns an unsubscribe function. */
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => { if (typeof action === 'string') callback(action); };
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
});
