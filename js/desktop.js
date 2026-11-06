/* Todo4Me — desktop (Electron) integration.
 * Purely additive: does nothing when window.todo4meDesktop is absent (browser version).
 * Uses only existing app actions, so no app behavior is duplicated here. */
(function () {
  'use strict';
  const desktop = window.todo4meDesktop;
  if (!desktop || !desktop.isDesktop) return;

  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;
  let info = null;

  document.documentElement.classList.add('is-desktop');

  /* ---------- Application menu → existing actions ---------- */
  const ROUTES = ['dashboard', 'inbox', 'tasks', 'today', 'upcoming', 'planner', 'plan', 'notes', 'editor', 'focus', 'stats', 'settings'];
  // While typing in a document, Ctrl+I / Ctrl+E / Ctrl+N belong to the editor (italic, …), not to the menu.
  const EDITOR_KEYS = ['new-task', 'quick-capture', 'new-note', 'export-data', 'import-data'];
  desktop.onMenuAction((action, meta) => {
    if (meta && meta.accel && T4.editor && T4.editor.hasFocus && EDITOR_KEYS.includes(action)) {
      if (action === 'new-task') ui.run('new-document', null); // Ctrl+N in a document → new document (like Word)
      return;
    }
    // From the tray menu or the system-wide hotkey (the window was just brought to the front).
    if (action === 'quick-capture-global' || action === 'new-task-global') {
      const qc = document.getElementById('qc-title');
      if (action === 'quick-capture-global' && qc) { qc.focus(); return; }
      if (ui.modalOpen || document.getElementById('confirm').open) {
        ui.toast('Finish or close the open dialog first, then try again.', 'info', 5000); // never discard what is being typed
        return;
      }
      ui.run(action === 'quick-capture-global' ? 'quick-capture' : 'new-task', null);
      return;
    }
    if (action.indexOf('go:') === 0) {
      const route = action.slice(3);
      if (ROUTES.includes(route)) location.hash = '#/' + route;
      return;
    }
    if (['new-task', 'quick-capture', 'new-note', 'export-data', 'import-data', 'new-document', 'export-pdf'].includes(action)) {
      if (document.getElementById('confirm').open) return; // don't stack on a pending confirmation
      ui.run(action, null);
    }
  });

  /* ---------- Save open documents before the window closes ---------- */
  if (desktop.onBeforeClose) desktop.onBeforeClose(() => (T4.editor ? T4.editor.flush() : null));

  /* ---------- Daily safety snapshot (file on disk, kept 14 days) ---------- */
  function hasData() {
    const d = store.data;
    return d.tasks.length > 0 || d.notes.length > 0 || Object.keys(d.dailyPlans).length > 0;
  }
  function snapshot() {
    if (!hasData()) return; // never rotate good backups out with empty ones
    desktop.writeBackup(T4.storage.exportJSON(store.data)).then((res) => {
      if (res && !res.ok) console.warn('[Todo4Me] backup file not written:', res.error);
    });
  }

  /* Editor documents: one JSON file per day as well (with images), only when documents exist. */
  const DOC_BACKUP_KEY = 'todo4me.docs.backupDay';
  async function documentsSnapshot() {
    if (!T4.docstore || !desktop.writeDocBackup) return;
    let day = null;
    try { day = localStorage.getItem(DOC_BACKUP_KEY); } catch (e) { /* ignore */ }
    if (day === U.today()) return;
    try {
      await T4.docstore.open();
      const bundle = await T4.docstore.exportBundle();
      if (!bundle.documents.length) return;
      const res = await desktop.writeDocBackup(JSON.stringify(bundle));
      if (res && res.ok) { try { localStorage.setItem(DOC_BACKUP_KEY, U.today()); } catch (e) { /* ignore */ } }
      else if (res) console.warn('[Todo4Me] documents backup not written:', res.error);
    } catch (e) { console.warn('[Todo4Me] documents backup failed:', e.message); }
  }

  /* ---------- Updates ---------- */
  let upd = { status: 'idle' };
  const notified = {};
  function updateText(s) {
    switch (s.status) {
      case 'checking': return 'Checking for updates…';
      case 'downloading': return 'Downloading Todo4Me ' + esc(s.version || '') + '… ' + (s.percent ? s.percent + '%' : '');
      case 'ready': return '<strong>Todo4Me ' + esc(s.version) + ' is ready to install.</strong> Restart to finish — your data stays where it is.';
      case 'latest': return 'You are using the latest version.' + (s.checkedAt ? ' Last checked ' + esc(U.fmtDateTime(s.checkedAt)) + '.' : '');
      case 'error': return '<span class="text-danger">' + esc(s.error || 'Update check failed.') + '</span>';
      case 'unsupported': return esc(s.reason || 'Automatic updates are not available.');
      default: return 'Todo4Me checks for updates automatically when you are online.';
    }
  }
  function updateButtons(s) {
    if (s.status === 'ready') return '<button type="button" class="btn btn--primary" data-action="desktop-install-update">' + icon('reset') + 'Restart & install</button>';
    if (s.status === 'unsupported') return '';
    return '<button type="button" class="btn" data-action="desktop-check-update"' + (s.status === 'checking' || s.status === 'downloading' ? ' disabled' : '') + '>' + icon('download') + 'Check for updates</button>';
  }
  function paintUpdate() {
    const t = document.getElementById('upd-text'), b = document.getElementById('upd-buttons');
    if (t) t.innerHTML = updateText(upd);
    if (b) b.innerHTML = updateButtons(upd);
  }
  function onUpdate(s) {
    upd = s;
    paintUpdate();
    if (s.status === 'downloading' && s.version && !notified['dl' + s.version]) {
      notified['dl' + s.version] = true;
      ui.toast('Todo4Me ' + s.version + ' is available and is being downloaded in the background.', 'info', 6000);
    }
    if (s.status === 'ready' && !notified['ready' + s.version]) {
      notified['ready' + s.version] = true;
      ui.toast('Todo4Me ' + s.version + ' is ready. Restart to update — your data is kept.', 'info', 30000, { label: 'Restart now', fn: installUpdate });
    }
    if (s.manual) {
      if (s.status === 'latest') ui.toast('You are using the latest version (' + s.current + ').', 'success', 4000);
      if (s.status === 'error') ui.toast(s.error, 'error', 9000);
      if (s.status === 'unsupported') ui.toast(s.reason, 'info', 9000);
    }
  }
  async function installUpdate() {
    ui.toast('Saving and restarting…', 'info', 4000);
    if (T4.editor) await T4.editor.flush();
    const res = await desktop.installUpdate();
    if (res && !res.ok) ui.toast(res.error || 'The update could not be installed.', 'error', 9000);
  }
  ui.on('desktop-check-update', () => {
    desktop.checkForUpdates().then((s) => { if (s && s.status === 'unsupported') ui.toast(s.reason, 'info', 9000); });
  });
  ui.on('desktop-install-update', installUpdate);
  if (desktop.onUpdateState) desktop.onUpdateState(onUpdate);

  /* ---------- Reminder notifications: click opens the task, the toast's button snoozes ---------- */
  if (desktop.onNotificationClick) {
    desktop.onNotificationClick((id, action) => { if (T4.reminders) T4.reminders.handleClick(id, action); });
  }

  /* ---------- Tray, start with Windows, global hotkey ---------- */
  let dset = null; // state from the main process (desktop-settings.json)
  function backgroundSettingsHtml() {
    if (!dset) return '';
    const chk = (on) => (on ? ' checked' : '');
    const hkStatus = !dset.hotkeyEnabled ? 'The system-wide shortcut is off.'
      : dset.hotkeyError ? '<span class="text-danger">' + icon('alert') + esc(dset.hotkeyError) + '</span>'
      : 'Press <kbd>' + esc(dset.hotkeyLabel) + '</kbd> in any program to capture a task.';
    return '<h3 class="settings__subhead">Tray &amp; startup</h3>' +
      '<div class="setting"><label for="set-tray">Keep running in the tray when the window is closed' +
        '<span class="setting__help">Reminders keep working while the window is closed. To quit, use the tray icon → Quit Todo4Me or File → Exit.</span></label>' +
        '<input id="set-tray" type="checkbox" data-change="desktop-setting" data-key="closeToTray"' + chk(dset.closeToTray) + '></div>' +
      '<div class="setting"><label for="set-login">Start Todo4Me when Windows starts' +
        '<span class="setting__help">' + (dset.loginSupported ? 'Starts quietly in the tray' + (dset.closeToTray ? '' : ' (needs the tray option above; otherwise the window opens)') + '.' : esc(dset.loginReason || 'Not available.')) + '</span></label>' +
        '<input id="set-login" type="checkbox" data-change="desktop-setting" data-key="openAtLogin"' + chk(dset.openAtLogin) + (dset.loginSupported ? '' : ' disabled') + '></div>' +
      '<h3 class="settings__subhead">Quick capture hotkey</h3>' +
      '<div class="setting"><label for="set-hk-on">System-wide shortcut<span class="setting__help">Brings Todo4Me to the front and opens Quick capture, even while you work in another program.</span></label>' +
        '<input id="set-hk-on" type="checkbox" data-change="desktop-setting" data-key="hotkeyEnabled"' + chk(dset.hotkeyEnabled) + '></div>' +
      '<div class="setting"><label for="set-hk">Shortcut</label><select id="set-hk" data-change="desktop-setting" data-key="hotkey"' + (dset.hotkeyEnabled ? '' : ' disabled') + '>' +
        dset.hotkeys.map((h) => '<option value="' + esc(h.id) + '"' + (h.id === dset.hotkey ? ' selected' : '') + '>' + esc(h.label) + '</option>').join('') + '</select></div>' +
      '<p class="desktop-status" id="hk-status">' + hkStatus + '</p>';
  }
  ui.on('change:desktop-setting', (el) => {
    const key = el.dataset.key;
    desktop.setDesktopSettings({ [key]: el.type === 'checkbox' ? el.checked : el.value }).then((s) => {
      dset = s;
      if (T4.app.route.name === 'settings') T4.app.render();
      if ((key === 'hotkey' || key === 'hotkeyEnabled') && s.hotkeyEnabled && s.hotkeyError) ui.toast(s.hotkeyError, 'error', 9000);
      else ui.toast('Settings saved', 'success', 1800);
    });
  });

  /* ---------- Settings: desktop card ---------- */
  ui.on('desktop-open-folder', (el) => desktop.openFolder(el.dataset.folder));

  const baseSettings = T4.views.settings.render;
  T4.views.settings.render = function () {
    const html = baseSettings.apply(this, arguments);
    const card = '<section class="card settings__section"><h2 class="card__title">Desktop app</h2>' +
      '<p class="muted small">Todo4Me ' + esc(info ? info.version : '') + ' works fully offline. Your data is saved automatically on this computer' +
      (info ? ' in <code>' + esc(info.userData) + '</code>' : '') + '.</p>' +
      '<p class="muted small">In addition to the in-app backup, a JSON backup file is written once per day (the last 14 days are kept)' +
      (info ? ' to <code>' + esc(info.backupDir) + '</code>' : '') + '. Any of these files can be restored with <strong>Import JSON</strong>.</p>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn" data-action="desktop-open-folder" data-folder="backups">' + icon('download') + 'Open backups folder</button>' +
        '<button type="button" class="btn btn--ghost" data-action="desktop-open-folder" data-folder="data">Open data folder</button>' +
      '</div>' +
      '<p class="muted small"><strong>Moving from the browser version?</strong> Open Todo4Me in your browser, use Settings → Export JSON, then choose Import JSON here and pick <em>Merge</em>. Nothing is overwritten.</p>' +
      backgroundSettingsHtml() +
      '<h3 class="settings__subhead">Updates</h3>' +
      '<p class="muted small">Version ' + esc(info ? info.version : '') + ' · <span id="upd-text">' + updateText(upd) + '</span></p>' +
      '<div class="btn-row" id="upd-buttons">' + updateButtons(upd) + '</div>' +
      '</section>';
    // Insert as the last card inside the settings column.
    const i = html.lastIndexOf('</div>');
    return i === -1 ? html + card : html.slice(0, i) + card + html.slice(i);
  };

  /* ---------- Startup ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    desktop.getInfo().then((i) => {
      info = i;
      if (T4.app.route.name === 'settings') T4.app.render();
      // First start after an update: confirm the new version once.
      let last = null;
      try { last = localStorage.getItem('todo4me.app.version'); localStorage.setItem('todo4me.app.version', i.version); } catch (e) { /* ignore */ }
      if (last && last !== i.version) ui.toast('Todo4Me was updated to version ' + i.version + '. All your data is still here.', 'success', 9000);
    });
    if (desktop.getUpdateState) desktop.getUpdateState().then((s) => { upd = s; paintUpdate(); });
    if (desktop.getDesktopSettings) {
      desktop.getDesktopSettings().then((s) => {
        dset = s;
        if (T4.app.route.name === 'settings') T4.app.render();
        if (s.hotkeyEnabled && s.hotkeyError) console.info('[Todo4Me] ' + s.hotkeyError);
      });
    }
    // Once per calendar day. Todo4Me can now run for days in the tray without a restart,
    // so check for a new day regularly instead of only at start (the main process keeps the
    // first file of each day and never overwrites it).
    let snapDay = null;
    const dailySnapshots = (docsDelay) => {
      if (snapDay === U.today()) return;
      snapDay = U.today();
      snapshot();
      setTimeout(documentsSnapshot, docsDelay);
    };
    dailySnapshots(20000);
    setInterval(() => dailySnapshots(0), 15 * 60 * 1000);
    // Migration hint for people who used the browser version before.
    if (!hasData()) {
      setTimeout(() => {
        ui.toast('Used Todo4Me in the browser before? Export your data there (Settings → Export JSON), then import it here.', 'info', 12000, {
          label: 'Import…', fn: () => ui.run('import-data', null),
        });
      }, 600);
    }
  });
})();
