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
  const ROUTES = ['dashboard', 'inbox', 'tasks', 'today', 'upcoming', 'planner', 'plan', 'notes', 'focus', 'stats', 'settings'];
  desktop.onMenuAction((action) => {
    if (action.indexOf('go:') === 0) {
      const route = action.slice(3);
      if (ROUTES.includes(route)) location.hash = '#/' + route;
      return;
    }
    if (['new-task', 'quick-capture', 'new-note', 'export-data', 'import-data'].includes(action)) {
      if (document.getElementById('confirm').open) return; // don't stack on a pending confirmation
      ui.run(action, null);
    }
  });

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
    });
    snapshot();
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
