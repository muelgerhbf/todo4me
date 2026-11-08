/* Todo4Me — desktop (Electron) integration.
 * Purely additive: does nothing when window.todo4meDesktop is absent (browser version).
 * Uses only existing app actions, so no app behavior is duplicated here. */
(function () {
  'use strict';
  const desktop = window.todo4meDesktop;
  if (!desktop || !desktop.isDesktop) return;

  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);
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
        ui.toast(tt('dk.finishDialog'), 'info', 5000); // never discard what is being typed
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
      case 'checking': return esc(tt('dk.checking'));
      case 'downloading': return esc(tt('dk.downloading', { version: s.version || '' })) + ' ' + (s.percent ? esc(s.percent) + '%' : '');
      case 'ready': return tt('dk.ready', { version: esc(s.version) }); // dictionary HTML, value escaped
      case 'latest': return esc(tt('dk.latest') + (s.checkedAt ? ' ' + tt('dk.lastChecked', { date: U.fmtDateTime(s.checkedAt) }) : ''));
      case 'error': return '<span class="text-danger">' + esc(s.error || tt('dk.checkFailed')) + '</span>';
      case 'unsupported': return esc(s.reason || tt('dk.noAutoUpdate'));
      default: return esc(tt('dk.idle'));
    }
  }
  function updateButtons(s) {
    if (s.status === 'ready') return '<button type="button" class="btn btn--primary" data-action="desktop-install-update">' + icon('reset') + esc(tt('dk.restartInstall')) + '</button>';
    if (s.status === 'unsupported') return '';
    return '<button type="button" class="btn" data-action="desktop-check-update"' + (s.status === 'checking' || s.status === 'downloading' ? ' disabled' : '') + '>' + icon('download') + esc(tt('dk.checkUpdates')) + '</button>';
  }
  function paintUpdate() {
    const t = document.getElementById('upd-text'), b = document.getElementById('upd-buttons');
    if (t) t.innerHTML = updateText(upd);
    if (b) b.innerHTML = updateButtons(upd);
  }
  function onUpdate(s) {
    upd = s;
    paintUpdate();
    paintUpdateButton();
    if (s.status === 'downloading' && s.version && !notified['dl' + s.version]) {
      notified['dl' + s.version] = true;
      ui.toast(tt('dk.updAvailable', { version: s.version }), 'info', 6000);
    }
    if (s.manual) {
      if (s.status === 'latest') ui.toast(tt('dk.latestToast', { version: s.current }), 'success', 4000);
      if (s.status === 'error') ui.toast(s.error, 'error', 9000);
      if (s.status === 'unsupported') ui.toast(s.reason, 'info', 9000);
    }
  }
  /* Sidebar button (like VS Code): shown only once an update is fully downloaded; the color comes from the accent in CSS. */
  let updBtn = null;
  function paintUpdateButton() {
    if (!updBtn) {
      const brand = document.querySelector('#sidebar .sidebar__brand');
      if (!brand) return;
      updBtn = document.createElement('button');
      updBtn.type = 'button';
      updBtn.id = 'update-btn';
      updBtn.className = 'update-btn';
      updBtn.dataset.action = 'desktop-install-update';
      updBtn.hidden = true;
      brand.after(updBtn);
    }
    if (upd.status !== 'ready' || !upd.version) { updBtn.hidden = true; return; }
    const label = tt('dk.updateTo', { version: upd.version });
    updBtn.innerHTML = icon('reset') + '<span>' + esc(tt('dk.update')) + '</span>';
    updBtn.title = label;
    updBtn.setAttribute('aria-label', label);
    if (updBtn.hidden) { // pulse once whenever the button appears
      updBtn.hidden = false;
      updBtn.classList.remove('is-new'); void updBtn.offsetWidth; updBtn.classList.add('is-new');
    }
  }
  let installing = false;
  async function installUpdate() {
    if (installing) return;
    installing = true;
    if (updBtn) updBtn.disabled = true;
    const failed = (msg) => { ui.toast(msg, 'error', 9000); installing = false; if (updBtn) updBtn.disabled = false; };
    try {
      ui.toast(tt('dk.restarting'), 'info', 4000);
      if (T4.editor) await T4.editor.flush();
      const res = await desktop.installUpdate();
      if (res && !res.ok) failed(res.error || tt('dk.installFailed'));
    } catch (e) { failed(tt('dk.installFailed')); }
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

  /* ---------- Tray, start at login, global hotkey ---------- */
  let dset = null; // state from the main process (desktop-settings.json)
  function backgroundSettingsHtml() {
    if (!dset) return '';
    const chk = (on) => (on ? ' checked' : '');
    const hkStatus = !dset.hotkeyEnabled ? esc(tt('dk.hotkeyOff'))
      : dset.hotkeyError ? '<span class="text-danger">' + icon('alert') + esc(dset.hotkeyError) + '</span>'
      : tt('dk.hotkeyPress', { key: esc(dset.hotkeyLabel) });
    return '<h3 class="settings__subhead">' + esc(tt('dk.trayStartup')) + '</h3>' +
      '<div class="setting"><label for="set-tray">' + esc(tt('dk.keepTray')) +
        '<span class="setting__help">' + esc(tt('dk.keepTrayHelp')) + '</span></label>' +
        '<input id="set-tray" type="checkbox" data-change="desktop-setting" data-key="closeToTray"' + chk(dset.closeToTray) + '></div>' +
      '<div class="setting"><label for="set-login">' + esc(tt(/Windows/.test(navigator.userAgent) ? 'dk.autostart' : 'dk.autostartGeneric')) +
        '<span class="setting__help">' + (dset.loginSupported ? esc(tt(dset.closeToTray ? 'dk.autostartHelp' : 'dk.autostartHelpNoTray')) : esc(dset.loginReason || tt('dk.notAvailable'))) + '</span></label>' +
        '<input id="set-login" type="checkbox" data-change="desktop-setting" data-key="openAtLogin"' + chk(dset.openAtLogin) + (dset.loginSupported ? '' : ' disabled') + '></div>' +
      '<h3 class="settings__subhead">' + esc(tt('dk.hotkeyHeading')) + '</h3>' +
      '<div class="setting"><label for="set-hk-on">' + esc(tt('dk.hotkeyGlobal')) + '<span class="setting__help">' + esc(tt('dk.hotkeyGlobalHelp')) + '</span></label>' +
        '<input id="set-hk-on" type="checkbox" data-change="desktop-setting" data-key="hotkeyEnabled"' + chk(dset.hotkeyEnabled) + '></div>' +
      '<div class="setting"><label for="set-hk">' + esc(tt('dk.shortcut')) + '</label><select id="set-hk" data-change="desktop-setting" data-key="hotkey"' + (dset.hotkeyEnabled ? '' : ' disabled') + '>' +
        dset.hotkeys.map((h) => '<option value="' + esc(h.id) + '"' + (h.id === dset.hotkey ? ' selected' : '') + '>' + esc(h.label) + '</option>').join('') + '</select></div>' +
      '<p class="desktop-status" id="hk-status">' + hkStatus + '</p>';
  }
  ui.on('change:desktop-setting', (el) => {
    const key = el.dataset.key;
    desktop.setDesktopSettings({ [key]: el.type === 'checkbox' ? el.checked : el.value }).then((s) => {
      dset = s;
      if (T4.app.route.name === 'settings') T4.app.render();
      if ((key === 'hotkey' || key === 'hotkeyEnabled') && s.hotkeyEnabled && s.hotkeyError) ui.toast(s.hotkeyError, 'error', 9000);
      else ui.toast(tt('dk.settingsSaved'), 'success', 1800);
    });
  });

  /* ---------- Settings: desktop card ---------- */
  ui.on('desktop-open-folder', (el) => desktop.openFolder(el.dataset.folder));

  const baseSettings = T4.views.settings.render;
  T4.views.settings.render = function () {
    const html = baseSettings.apply(this, arguments);
    const card = '<section class="card settings__section"><h2 class="card__title">' + esc(tt('dk.desktopApp')) + '</h2>' +
      '<p class="muted small">' + (info ? tt('dk.dataInfoPath', { version: esc(info.version), path: esc(info.userData) }) : tt('dk.dataInfo', { version: '' })) + '</p>' +
      '<p class="muted small">' + (info ? tt('dk.backupInfoPath', { path: esc(info.backupDir) }) : tt('dk.backupInfo')) + '</p>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn" data-action="desktop-open-folder" data-folder="backups">' + icon('download') + esc(tt('dk.openBackups')) + '</button>' +
        '<button type="button" class="btn btn--ghost" data-action="desktop-open-folder" data-folder="data">' + esc(tt('dk.openData')) + '</button>' +
      '</div>' +
      '<p class="muted small">' + tt('dk.migrate') + '</p>' +
      backgroundSettingsHtml() +
      '<h3 class="settings__subhead">' + esc(tt('dk.updates')) + '</h3>' +
      '<p class="muted small">' + esc(tt('dk.version', { version: info ? info.version : '' })) + ' · <span id="upd-text">' + updateText(upd) + '</span></p>' +
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
      if (last && last !== i.version) ui.toast(tt('dk.updatedTo', { version: i.version }), 'success', 9000);
    });
    if (desktop.getUpdateState) desktop.getUpdateState().then((s) => { upd = s; paintUpdate(); paintUpdateButton(); });
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
        ui.toast(tt('dk.migrateHint'), 'info', 12000, {
          label: tt('dk.import'), fn: () => ui.run('import-data', null),
        });
      }, 600);
    }
  });
})();
