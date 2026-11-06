/* Todo4Me — Settings, categories and data management (export/import/backup/reset). */
T4.settings = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store, S = T4.storage;
  const { esc, icon } = U;

  /* ---------- Theme ---------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolvedTheme() { return T4.themes.resolveMode(store.settings); }
  function applyAppearance() {
    T4.themes.apply(store.settings);
    const btn = document.querySelector('[data-action="toggle-theme"] use');
    if (btn) btn.setAttribute('href', resolvedTheme() === 'dark' ? '#i-sun' : '#i-moon');
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (store.settings.theme === 'system') applyAppearance(); });

  ui.on('toggle-theme', () => {
    store.updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' });
    applyAppearance();
  });

  /* ---------- Setting changes ---------- */
  ui.on('change:setting', (el) => {
    const key = el.dataset.key;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'weekStart' || key === 'pomodoroFocus' || key === 'pomodoroBreak') value = Number(value);
    store.updateSettings({ [key]: value });
    applyAppearance();
    ui.toast('Settings saved', 'success', 1800);
  });
  ui.on('set-theme', (el) => { store.updateSettings({ theme: el.dataset.value }); applyAppearance(); });
  ui.on('set-accent', (el) => { store.updateSettings({ accent: el.dataset.value }); applyAppearance(); });

  /* ---------- Categories ---------- */
  ui.on('change:category', (el) => {
    const id = el.dataset.id;
    const res = store.updateCategory(id, el.dataset.field === 'color' ? { color: el.value } : { name: el.value });
    if (res.error) { ui.toast(res.error, 'error'); T4.app.render(); } else ui.toast('Category updated', 'success', 1800);
  });
  ui.on('delete-category', async (el) => {
    const c = store.category(el.dataset.id);
    if (!c) return;
    const n = store.data.tasks.filter((t) => t.categoryId === c.id).length;
    const ok = await ui.confirm({ title: 'Delete category "' + c.name + '"?', message: n ? U.plural(n, 'task') + ' in this category will be kept, but without a category.' : 'No tasks use this category.', confirmText: 'Delete category', danger: true });
    if (!ok) return;
    store.deleteCategory(c.id);
    ui.toast('Category deleted');
  });
  ui.on('submit:add-category', (form) => {
    const res = store.addCategory(form.querySelector('[name="name"]').value, form.querySelector('[name="color"]').value);
    if (res.error) { ui.toast(res.error, 'error'); return; }
    ui.toast('Category "' + res.category.name + '" added');
  });

  /* ---------- Export / import ---------- */
  function exportData() {
    U.download('todo4me-backup-' + U.today() + '.json', S.exportJSON(store.data));
    ui.toast('Backup downloaded');
  }
  ui.on('export-data', exportData);

  const fileInput = document.getElementById('import-file');
  ui.on('import-data', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { ui.toast('That file is too large to be a Todo4Me backup.', 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => ui.toast('Could not read the file.', 'error');
    reader.onload = () => {
      let result;
      try { result = S.parseImport(String(reader.result)); } catch (e) { ui.toast(e.message, 'error', 6000); return; }
      openImportDialog(file.name, result.data, result.issues);
    };
    reader.readAsText(file);
  });

  function openImportDialog(name, data, issues) {
    ui.openModal({
      title: 'Import data',
      body: '<p>File: <strong>' + esc(name) + '</strong></p>' +
        '<ul class="import-summary">' +
          '<li><strong>' + data.tasks.length + '</strong> tasks</li><li><strong>' + data.notes.length + '</strong> notes</li>' +
          '<li><strong>' + data.categories.length + '</strong> categories</li><li><strong>' + Object.keys(data.dailyPlans).length + '</strong> daily plans</li></ul>' +
        (issues.length ? '<p class="callout callout--warn">' + icon('alert') + esc(issues.join(' · ')) + '</p>' : '') +
        '<p class="muted small"><strong>Merge</strong> keeps your current data and adds the imported items (for items that exist in both, the most recently updated version wins). ' +
        '<strong>Replace</strong> deletes everything currently in the app and uses the file instead, including its settings.</p>',
      footer: '<button type="button" class="btn btn--ghost mr-auto" data-action="modal-close">Cancel</button>' +
        '<button type="button" class="btn" id="imp-merge">Merge</button>' +
        '<button type="button" class="btn btn--danger" id="imp-replace">Replace all</button>',
      onMount(m) {
        m.querySelector('#imp-merge').addEventListener('click', () => {
          store.mergeData(data);
          ui.closeModal(true);
          applyAppearance();
          ui.toast('Data merged: ' + U.plural(data.tasks.length, 'task') + ', ' + U.plural(data.notes.length, 'note') + ' imported');
        });
        m.querySelector('#imp-replace').addEventListener('click', async () => {
          const ok = await ui.confirm({ title: 'Replace all data?', message: 'Your current tasks, notes, plans and settings will be overwritten by the imported file. Consider exporting a backup first.', confirmText: 'Replace all', danger: true });
          if (!ok) return;
          store.replaceData(data);
          ui.closeModal(true);
          applyAppearance();
          ui.toast('Data imported');
        });
      },
    });
  }

  ui.on('restore-backup', async () => {
    const b = S.loadBackup();
    if (!b) { ui.toast('No automatic backup available yet.', 'info'); return; }
    const ok = await ui.confirm({ title: 'Restore automatic backup?', message: 'Your current data will be replaced with the backup from ' + U.fmtDateTime(b.at) + ' (' + U.plural(b.data.tasks.length, 'task') + ', ' + U.plural(b.data.notes.length, 'note') + ').', confirmText: 'Restore backup', danger: true });
    if (!ok) return;
    store.replaceData(b.data);
    applyAppearance();
    ui.toast('Backup restored');
  });

  ui.on('reset-data', async () => {
    const ok = await ui.confirm({ title: 'Reset all data?', message: 'This permanently deletes all tasks, notes, plans, categories, calendar subscriptions and settings stored in this browser. This cannot be undone — export a backup first if you might need it.', confirmText: 'Delete everything', danger: true });
    if (!ok) return;
    store.resetAll();
    try { localStorage.removeItem('todo4me.focus.v1'); } catch (e) { /* ignore */ }
    if (T4.calfeeds) T4.calfeeds.clearAll(); // calendar subscriptions (secret links) and their cache
    applyAppearance();
    ui.toast('All data has been reset');
    location.hash = '#/dashboard';
  });

  ui.on('load-sample', async () => {
    const ok = await ui.confirm({ title: 'Add sample data?', message: 'A handful of example tasks, notes and a daily plan will be added to your existing data. You can delete them anytime.', confirmText: 'Add sample data' });
    if (!ok) return;
    store.mergeData(S.sanitize(sampleData()).data);
    ui.toast('Sample data added');
  });

  function sampleData() {
    const t = U.today(), d = (n) => U.addDays(t, n);
    const ws = store.weekStartOf(t);
    const now = new Date().toISOString();
    const mk = (title, o) => Object.assign({ id: U.uid('task'), title, status: 'todo', createdAt: now, updatedAt: now }, o);
    const tasks = [
      mk('Finish quarterly report', { priority: 'critical', categoryId: 'cat_work', dueDate: t, dueTime: '15:00', estimate: 90, tags: ['q4'], description: 'Summarize results and next steps for the team.', subtasks: [{ title: 'Collect numbers', done: true }, { title: 'Write summary' }, { title: 'Send to manager' }] }),
      mk('Reply to client emails', { priority: 'high', categoryId: 'cat_work', dueDate: t, estimate: 30, status: 'in_progress' }),
      mk('30-minute run', { priority: 'medium', categoryId: 'cat_health', dueDate: t, recurrence: { unit: 'day', every: 1, from: 'due' }, estimate: 30 }),
      mk('Buy groceries', { priority: 'low', categoryId: 'cat_shopping', dueDate: t, subtasks: [{ title: 'Vegetables' }, { title: 'Coffee' }, { title: 'Oat milk' }] }),
      mk('Prepare slides for Monday meeting', { priority: 'high', categoryId: 'cat_work', dueDate: d(2), estimate: 60 }),
      mk('Read one chapter of a book', { priority: 'medium', categoryId: 'cat_learning', dueDate: d(1), recurrence: { unit: 'week', every: 1, from: 'due' } }),
      mk('Call mom', { priority: 'medium', categoryId: 'cat_personal', dueDate: d(3) }),
      mk('Renew passport', { priority: 'critical', categoryId: 'cat_personal', dueDate: d(5), notes: 'Need photo + old passport.' }),
      mk('Pay electricity bill', { priority: 'high', categoryId: 'cat_personal', dueDate: d(-1) }),
      mk('Update CV', { priority: 'low', categoryId: 'cat_work', dueDate: d(9) }),
      mk('Stretching routine', { priority: 'low', categoryId: 'cat_health', dueDate: d(-1), status: 'done', completedAt: new Date(Date.now() - 86400000).toISOString() }),
      mk('Look into a new podcast', { inbox: true }),
      mk('Idea: reorganize home office', { inbox: true }),
    ];
    const completions = {};
    for (let i = 1; i <= 40; i++) if (i % 3 !== 0) completions[d(-i)] = 1 + ((i * 7) % 5);
    return {
      tasks,
      categories: store.data.categories,
      notes: [
        { id: U.uid('note'), title: 'Focus this week', body: 'Ship the quarterly report.\nKeep mornings meeting-free for deep work.', weekOf: ws, tags: ['focus'], pinned: true, createdAt: now, updatedAt: now },
        { id: U.uid('note'), title: 'Gift ideas', body: '- Book for Sam\n- Plant for the office', weekOf: ws, tags: ['ideas'], createdAt: now, updatedAt: now },
        { id: U.uid('note'), title: 'Retro takeaways', body: 'Planning on Monday mornings works well. Batch emails twice a day.', weekOf: U.addDays(ws, -7), tags: ['review'], createdAt: now, updatedAt: now },
      ],
      dailyPlans: { [t]: { goal: 'Send the quarterly report', top3: [tasks[0].id, tasks[1].id, tasks[2].id], notes: '', reflection: '' } },
      stats: { completions, focusSessions: { [d(-1)]: 3, [d(-2)]: 2 } },
    };
  }

  /* ---------- View ---------- */
  function reminderStatusRow() {
    if (!T4.reminders) return '';
    const st = T4.reminders.systemStatus();
    return '<div class="setting" id="set-notify"><span class="label">Reminder notifications<span class="setting__help">' + esc(st.text) + '</span></span>' +
      '<div class="btn-row">' +
        (st.kind === 'ask' ? '<button type="button" class="btn btn--sm btn--primary" data-action="reminders-permission">Allow notifications</button>' : '') +
        '<button type="button" class="btn btn--sm" data-action="reminders-test">' + icon('bell') + 'Test</button>' +
      '</div></div>';
  }

  const seg =(key, value, options) => '<div class="seg" role="radiogroup">' + options.map(([v, l]) =>
    '<button type="button" class="seg__btn" role="radio" aria-checked="' + (String(value) === String(v)) + '" data-action="' + key + '" data-value="' + v + '">' + l + '</button>').join('') + '</div>';

  T4.views.settings = {
    title: 'Settings',
    render() {
      const s = store.settings;
      const backupAt = S.backupInfo();
      const kb = (S.usageBytes() / 1024).toFixed(1);
      return '<header class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-sub">Changes are saved automatically.</p></div></header>' +
        '<div class="settings">' +
        '<section class="card settings__section"><h2 class="card__title">Profile</h2>' +
          '<div class="setting"><label for="set-name">Your name<span class="setting__help">Used in the dashboard greeting.</span></label>' +
          '<input id="set-name" type="text" maxlength="60" value="' + esc(s.userName) + '" data-change="setting" data-key="userName" placeholder="Optional"></div></section>' +

        '<section class="card settings__section"><h2 class="card__title">Appearance</h2>' +
          '<div class="setting"><span class="label">Theme</span>' + seg('set-theme', s.theme, [['light', icon('sun') + 'Light'], ['dark', icon('moon') + 'Dark'], ['system', 'System']]) + '</div>' +
          '<div class="setting"><span class="label">Accent color</span><div class="swatches" role="radiogroup" aria-label="Accent color">' +
            S.ACCENTS.map((c) => '<button type="button" class="swatch' + (c === s.accent ? ' is-on' : '') + '" role="radio" aria-checked="' + (c === s.accent) + '" data-action="set-accent" data-value="' + c + '" style="--sw:' + c + '" aria-label="Accent ' + c + '">' + icon('check') + '</button>').join('') +
          '</div></div></section>' +

        '<section class="card settings__section"><h2 class="card__title">Tasks & planning</h2>' +
          '<div class="setting"><label for="set-sort">Default task sorting</label><select id="set-sort" data-change="setting" data-key="defaultSort">' +
            [['priority', 'Priority'], ['due', 'Due date'], ['created', 'Creation date (newest)'], ['alpha', 'Alphabetical'], ['status', 'Status']].map(([v, l]) => '<option value="' + v + '"' + (s.defaultSort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
          '<div class="setting"><label for="set-week">Start of the week</label><select id="set-week" data-change="setting" data-key="weekStart">' +
            '<option value="1"' + (s.weekStart === 1 ? ' selected' : '') + '>Monday</option><option value="0"' + (s.weekStart === 0 ? ' selected' : '') + '>Sunday</option></select></div>' +
          '<div class="setting"><label for="set-pf">Focus session length<span class="setting__help">Minutes</span></label><input id="set-pf" type="number" min="1" max="120" value="' + s.pomodoroFocus + '" data-change="setting" data-key="pomodoroFocus"></div>' +
          '<div class="setting"><label for="set-pb">Break length<span class="setting__help">Minutes</span></label><input id="set-pb" type="number" min="1" max="60" value="' + s.pomodoroBreak + '" data-change="setting" data-key="pomodoroBreak"></div>' +
          '<div class="setting"><label for="set-remtime">Reminder time<span class="setting__help">Used for reminders on tasks that have a due date but no time.</span></label><input id="set-remtime" type="time" value="' + esc(s.reminderTime) + '" data-change="setting" data-key="reminderTime"></div>' +
          reminderStatusRow() +
        '</section>' +

        (T4.calfeeds ? T4.calfeeds.settingsCard() : '') +

        '<section class="card settings__section"><h2 class="card__title">Categories</h2>' +
          '<ul class="cat-list" role="list">' + store.data.categories.map((c) => {
            const n = store.data.tasks.filter((t) => t.categoryId === c.id).length;
            return '<li class="cat-row"><input type="color" value="' + esc(c.color) + '" data-change="category" data-field="color" data-id="' + c.id + '" aria-label="Color for ' + esc(c.name) + '">' +
              '<input type="text" maxlength="40" value="' + esc(c.name) + '" data-change="category" data-field="name" data-id="' + c.id + '" aria-label="Category name">' +
              '<span class="muted small nowrap">' + U.plural(n, 'task') + '</span>' +
              '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-category" data-id="' + c.id + '" aria-label="Delete category ' + esc(c.name) + '">' + icon('trash') + '</button></li>';
          }).join('') + '</ul>' +
          '<form class="cat-row cat-row--add" data-form="add-category"><input type="color" name="color" value="#0e7c86" aria-label="New category color">' +
            '<input type="text" name="name" maxlength="40" placeholder="New category name" aria-label="New category name" required>' +
            '<button type="submit" class="btn btn--sm">' + icon('plus') + 'Add</button></form>' +
        '</section>' +

        '<section class="card settings__section"><h2 class="card__title">Data & backup</h2>' +
          '<p class="muted small">Your data lives only in this browser (' + esc(S.adapterName) + ', ~' + kb + ' KB). Export regularly to keep a safe copy or move it to another device.</p>' +
          (S.isAvailable ? '' : '<p class="callout callout--warn">' + icon('alert') + 'Browser storage is unavailable — changes will be lost when you close this tab. Export your data!</p>') +
          '<div class="btn-row">' +
            '<button type="button" class="btn" data-action="export-data">' + icon('download') + 'Export JSON</button>' +
            '<button type="button" class="btn" data-action="import-data">' + icon('upload') + 'Import JSON</button>' +
            '<button type="button" class="btn" data-action="restore-backup"' + (backupAt ? '' : ' disabled') + '>' + icon('reset') + 'Restore auto-backup</button>' +
            '<button type="button" class="btn btn--ghost" data-action="load-sample">' + icon('sparkle') + 'Add sample data</button>' +
          '</div>' +
          '<p class="muted small">' + (backupAt ? 'Automatic backup: ' + esc(U.fmtDateTime(backupAt)) + ' (refreshed daily).' : 'An automatic backup is created after your first change.') + '</p>' +
          '<div class="danger-zone"><div><strong>Reset application</strong><p class="muted small">Delete all tasks, notes, plans and settings from this browser.</p></div>' +
            '<button type="button" class="btn btn--danger" data-action="reset-data">' + icon('trash') + 'Reset all data</button></div>' +
        '</section>' +

        '<section class="card settings__section"><h2 class="card__title">Keyboard shortcuts</h2>' +
          '<dl class="shortcuts"><dt><kbd>N</kbd></dt><dd>New task</dd><dt><kbd>Q</kbd></dt><dd>Quick capture to Inbox</dd><dt><kbd>/</kbd></dt><dd>Search (Tasks & Notes)</dd>' +
          '<dt><kbd>G</kbd> then <kbd>D</kbd>/<kbd>I</kbd>/<kbd>T</kbd>/<kbd>W</kbd>/<kbd>O</kbd></dt><dd>Go to Dashboard / Inbox / Today / Week planner / nOtes</dd>' +
          '<dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Save the open form</dd><dt><kbd>Esc</kbd></dt><dd>Close dialog / exit focus mode</dd></dl>' +
          '<p class="muted small">Quick-add syntax: <code>!1</code>–<code>!4</code> priority (critical → low), <code>#work</code> category (or tag if no category matches), <code>@today</code>, <code>@tomorrow</code>, <code>@fri</code>, <code>@2026-12-24</code> due date.</p>' +
        '</section>' +
        '</div>';
    },
  };

  return { applyAppearance, resolvedTheme, exportData };
})();
