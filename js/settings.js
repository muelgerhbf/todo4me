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
    ui.toast(T4.i18n.t('dk.settingsSaved'), 'success', 1800);
  });
  /* ---------- Appearance & customization (2.3.0) ---------- */
  const tr = (k, p) => T4.i18n.t(k, p);
  const HEX6 = /^#[0-9a-f]{6}$/i;
  const APPEARANCE_DEFAULTS = () => ({ design: 'classic', theme: 'system', accentSource: 'custom', accent: S.ACCENTS[0], font: 'design', radius: 'design', density: 'comfortable', fontScale: 100 });
  const setAppearance = (patch) => { store.updateSettings(patch); applyAppearance(); };

  ui.on('set-design', (el) => setAppearance({ design: el.dataset.value }));
  ui.on('set-theme', (el) => setAppearance({ theme: el.dataset.value }));
  ui.on('set-accent', (el) => setAppearance({ accentSource: 'custom', accent: el.dataset.value }));
  ui.on('set-accent-design', () => setAppearance({ accentSource: 'design' }));
  ui.on('set-font', (el) => setAppearance({ font: el.dataset.value }));
  ui.on('set-radius', (el) => setAppearance({ radius: el.dataset.value }));
  ui.on('set-density', (el) => setAppearance({ density: el.dataset.value }));
  // Live preview while dragging/picking: apply without saving; the 'change' event saves (no toast per step).
  ui.on('input:scale', (el) => {
    const v = Number(el.value);
    T4.themes.apply(Object.assign({}, store.settings, { fontScale: v }));
    const out = document.getElementById('set-scale-out');
    if (out) out.textContent = v + ' %';
  });
  ui.on('change:scale', (el) => setAppearance({ fontScale: Number(el.value) }));
  ui.on('input:accent-custom', (el) => { if (HEX6.test(el.value)) T4.themes.apply(Object.assign({}, store.settings, { accentSource: 'custom', accent: el.value })); });
  ui.on('change:accent-custom', (el) => { if (HEX6.test(el.value)) setAppearance({ accentSource: 'custom', accent: el.value }); });
  ui.on('change:language', (el) => { T4.i18n.setLanguage(el.value); });

  ui.on('change:nav-toggle', (el) => {
    T4.nav.setHidden(el.dataset.id, !el.checked);
    const again = document.querySelector('input[data-change="nav-toggle"][data-id="' + el.dataset.id + '"]');
    if (again) again.focus({ preventScroll: true });
  });
  ui.on('nav-move', (el) => {
    const id = el.dataset.id, dir = Number(el.dataset.dir);
    T4.nav.move(id, dir);
    const again = document.querySelector('[data-action="nav-move"][data-id="' + id + '"][data-dir="' + dir + '"]');
    const target = again && !again.disabled ? again : document.querySelector('[data-action="nav-move"][data-id="' + id + '"]:not([disabled])');
    if (target) target.focus({ preventScroll: true });
  });
  ui.on('nav-reset', () => { T4.nav.reset(); ui.toast(tr('set.appearance.sidebar.resetDone'), 'success', 1800); });

  ui.on('reset-appearance', async () => {
    const ok = await ui.confirm({ title: tr('set.appearance.reset.title'), message: tr('set.appearance.reset.message'), confirmText: tr('set.appearance.reset.confirm'), cancelText: tr('set.appearance.cancel') });
    if (!ok) return;
    const defaults = APPEARANCE_DEFAULTS(), before = {};
    Object.keys(defaults).forEach((k) => { before[k] = store.settings[k]; });
    setAppearance(defaults);
    ui.toast(tr('set.appearance.reset.done'), 'success', 6000, { label: tr('set.appearance.reset.undo'), fn: () => setAppearance(before) });
  });

  // Arrow keys inside our radio groups (roving tabindex): select the neighbour and keep the focus on it.
  document.addEventListener('keydown', (e) => {
    const cur = e.target.closest && e.target.closest('[role="radio"]');
    const group = cur && cur.closest('[data-rg]');
    if (!group || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    const radios = Array.from(group.querySelectorAll('[role="radio"]:not([disabled])'));
    const i = radios.indexOf(cur);
    if (i < 0) return;
    e.preventDefault();
    const k = keys[e.key];
    const next = k === 'first' ? radios[0] : k === 'last' ? radios[radios.length - 1] : radios[(i + k + radios.length) % radios.length];
    const name = group.dataset.rg, value = next.dataset.value;
    next.click();
    const again = document.querySelector('[data-rg="' + name + '"] [role="radio"][data-value="' + CSS.escape(value) + '"]');
    if (again) again.focus({ preventScroll: true });
  });

  /* ---------- Categories ---------- */
  ui.on('change:category', (el) => {
    const id = el.dataset.id;
    const res = store.updateCategory(id, el.dataset.field === 'color' ? { color: el.value } : { name: el.value });
    if (res.error) { ui.toast(res.error, 'error'); T4.app.render(); } else ui.toast(tr('set.catUpdated'), 'success', 1800);
  });
  ui.on('delete-category', async (el) => {
    const c = store.category(el.dataset.id);
    if (!c) return;
    const n = store.data.tasks.filter((t) => t.categoryId === c.id).length;
    const ok = await ui.confirm({ title: tr('set.delCatTitle', { name: c.name }), message: n ? tr('set.delCatMsg', { count: n }) : tr('set.delCatNone'), confirmText: tr('set.delCatConfirm'), danger: true });
    if (!ok) return;
    store.deleteCategory(c.id);
    ui.toast(tr('set.catDeleted'));
  });
  ui.on('submit:add-category', (form) => {
    const res = store.addCategory(form.querySelector('[name="name"]').value, form.querySelector('[name="color"]').value);
    if (res.error) { ui.toast(res.error, 'error'); return; }
    ui.toast(tr('set.catAdded', { name: res.category.name }));
  });

  /* ---------- Export / import ---------- */
  function exportData() {
    U.download('todo4me-backup-' + U.today() + '.json', S.exportJSON(store.data));
    ui.toast(tr('set.backupDownloaded'));
  }
  ui.on('export-data', exportData);

  const fileInput = document.getElementById('import-file');
  ui.on('import-data', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { ui.toast(tr('set.fileTooLarge'), 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => ui.toast(tr('cf.fileReadFailed'), 'error');
    reader.onload = () => {
      let result;
      try { result = S.parseImport(String(reader.result)); } catch (e) { ui.toast(e.message, 'error', 6000); return; }
      openImportDialog(file.name, result.data, result.issues);
    };
    reader.readAsText(file);
  });

  function openImportDialog(name, data, issues) {
    ui.openModal({
      title: tr('set.importTitle'),
      body: '<p>' + esc(tr('set.file')) + ' <strong>' + esc(name) + '</strong></p>' +
        '<ul class="import-summary">' +
          '<li>' + tr('set.impTasks', { count: data.tasks.length }) + '</li><li>' + tr('set.impNotes', { count: data.notes.length }) + '</li>' +
          '<li>' + tr('set.impCats', { count: data.categories.length }) + '</li><li>' + tr('set.impPlans', { count: Object.keys(data.dailyPlans).length }) + '</li></ul>' + // dictionary HTML with numbers only

        (issues.length ? '<p class="callout callout--warn">' + icon('alert') + esc(issues.join(' · ')) + '</p>' : '') +
        '<p class="muted small">' + tr('set.importHelp') + '</p>',
      footer: '<button type="button" class="btn btn--ghost mr-auto" data-action="modal-close">' + esc(tr('c.cancel')) + '</button>' +
        '<button type="button" class="btn" id="imp-merge">' + esc(tr('set.merge')) + '</button>' +
        '<button type="button" class="btn btn--danger" id="imp-replace">' + esc(tr('set.replaceAll')) + '</button>',
      onMount(m) {
        m.querySelector('#imp-merge').addEventListener('click', () => {
          store.mergeData(data);
          ui.closeModal(true);
          applyAppearance();
          ui.toast(tr('set.merged', { tasks: tr('tk.results', { count: data.tasks.length }), notes: tr('set.notesN', { count: data.notes.length }) }));
        });
        m.querySelector('#imp-replace').addEventListener('click', async () => {
          const ok = await ui.confirm({ title: tr('set.replaceTitle'), message: tr('set.replaceMsg'), confirmText: tr('set.replaceAll'), danger: true });
          if (!ok) return;
          store.replaceData(data);
          ui.closeModal(true);
          applyAppearance();
          ui.toast(tr('set.dataImported'));
        });
      },
    });
  }

  ui.on('restore-backup', async () => {
    const b = S.loadBackup();
    if (!b) { ui.toast(tr('set.noBackupYet'), 'info'); return; }
    const ok = await ui.confirm({ title: tr('set.restoreTitle'), message: tr('set.restoreMsg', { date: U.fmtDateTime(b.at), tasks: tr('tk.results', { count: b.data.tasks.length }), notes: tr('set.notesN', { count: b.data.notes.length }) }), confirmText: tr('set.restoreConfirm'), danger: true });
    if (!ok) return;
    store.replaceData(b.data);
    applyAppearance();
    ui.toast(tr('set.restored'));
  });

  ui.on('reset-data', async () => {
    const ok = await ui.confirm({ title: tr('set.resetTitle'), message: tr('set.resetMsg'), confirmText: tr('set.resetConfirm'), danger: true });
    if (!ok) return;
    store.resetAll();
    try { localStorage.removeItem('todo4me.focus.v1'); } catch (e) { /* ignore */ }
    if (T4.calfeeds) T4.calfeeds.clearAll(); // calendar subscriptions (secret links) and their cache
    applyAppearance();
    ui.toast(tr('set.resetDone'));
    location.hash = '#/dashboard';
  });

  ui.on('load-sample', async () => {
    const ok = await ui.confirm({ title: tr('set.sampleTitle'), message: tr('set.sampleMsg'), confirmText: tr('set.addSample') });
    if (!ok) return;
    store.mergeData(S.sanitize(sampleData()).data);
    ui.toast(tr('set.sampleDone'));
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
    return '<div class="setting" id="set-notify"><span class="label">' + esc(tr('set.reminderNotif')) + '<span class="setting__help">' + esc(st.text) + '</span></span>' +
      '<div class="btn-row">' +
        (st.kind === 'ask' ? '<button type="button" class="btn btn--sm btn--primary" data-action="reminders-permission">' + esc(tr('set.allowNotif')) + '</button>' : '') +
        '<button type="button" class="btn btn--sm" data-action="reminders-test">' + icon('bell') + esc(tr('set.test')) + '</button>' +
      '</div></div>';
  }

  /** Radio group with roving tabindex. items: [{ value, html, label?, disabled?, cls?, style? }] */
  function radios(name, action, current, items, o) {
    o = o || {};
    const sel = items.find((it) => String(it.value) === String(current) && !it.disabled) || items.find((it) => !it.disabled);
    return '<div class="' + (o.cls || 'seg') + '" role="radiogroup" data-rg="' + name + '" aria-label="' + esc(o.label || '') + '">' + items.map((it) => {
      const on = it === sel && String(it.value) === String(current);
      return '<button type="button" class="' + (it.cls || 'seg__btn') + '" role="radio" aria-checked="' + on + '" tabindex="' + (it === sel ? 0 : -1) + '"' + (it.disabled ? ' disabled' : '') +
        ' data-action="' + action + '" data-value="' + esc(it.value) + '" data-id="' + esc(it.value) + '"' + (it.style ? ' style="' + it.style + '"' : '') + '>' + it.html + '</button>';
    }).join('') + '</div>';
  }
  const cssColor = (c, fb) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fb);

  function designCard(d, mode, selected) {
    const def = T4.themes.get(d.id);
    const m = def.modes.indexOf(mode) >= 0 ? mode : def.modes[0];
    const p = def.previews[m];
    const vars = '--pv-bg:' + cssColor(p.bg, '#f6f6f8') + ';--pv-surface:' + cssColor(p.surface, '#fff') + ';--pv-sidebar:' + cssColor(p.sidebar, '#fff') + ';--pv-text:' + cssColor(p.text, '#222') + ';--pv-accent:' + cssColor(p.accent, '#5b5bd6');
    const badges = def.modes.map((x) => '<span class="badge-mode">' + icon(x === 'dark' ? 'moon' : 'sun') + esc(tr('set.appearance.mode.' + x)) + '</span>').join('');
    const on = selected === d.id;
    return '<button type="button" class="dcard' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-action="set-design" data-value="' + esc(d.id) + '" data-id="' + esc(d.id) + '">' +
      '<span class="dcard__pv" style="' + vars + '" aria-hidden="true"><i class="pv-side"></i><span class="pv-main"><b class="pv-bar"></b><span class="pv-card"><i class="pv-line"></i><i class="pv-line pv-line--s"></i><i class="pv-dot"></i></span></span></span>' +
      '<span class="dcard__name">' + esc(d.name) + '<span class="dcard__check">' + icon('check') + '</span></span>' +
      '<span class="dcard__tag">' + esc(T4.i18n && T4.i18n.has('design.' + d.id + '.tagline') ? T4.i18n.t('design.' + d.id + '.tagline') : d.tagline) + '</span><span class="dcard__modes">' + badges + '</span></button>';
  }

  function appearanceSection() {
    const s = store.settings, TH = T4.themes;
    const designs = TH.list();
    const cur = TH.get(s.design);
    const mode = TH.resolveMode(s);
    const single = cur.modes.length === 1;
    const modeItems = [['light', icon('sun') + esc(tr('set.appearance.mode.light'))], ['dark', icon('moon') + esc(tr('set.appearance.mode.dark'))], ['system', esc(tr('set.appearance.mode.system'))]].map(([v, html]) => ({
      value: v, html, disabled: single && (v === 'system' || cur.modes.indexOf(v) < 0),
    }));
    const modeCurrent = single ? cur.modes[0] : s.theme;
    const fontLabels = { inter: 'Inter', system: tr('set.appearance.font.system'), serif: tr('set.appearance.font.serif'), mono: tr('set.appearance.font.mono'), rounded: tr('set.appearance.font.rounded') };
    const fontItems = [{ value: 'design', html: esc(tr('set.appearance.designDefault')) }].concat(Object.keys(TH.FONTS).map((k) => ({
      value: k, html: esc(fontLabels[k] || k), style: 'font-family:' + TH.FONTS[k].replace(/"/g, "'"),
    })));
    const radiusOf = (v) => TH.tokens({ design: s.design, radius: v })['--radius'];
    const radiusItems = ['design', 'sharp', 'soft', 'round'].map((v) => ({
      value: v, html: '<span class="rpv" style="border-top-left-radius:' + radiusOf(v) + '"></span>' + esc(tr(v === 'design' ? 'set.appearance.designDefault' : 'set.appearance.radius.' + v)),
    }));
    const densityItems = ['comfortable', 'compact'].map((v) => ({ value: v, html: esc(tr('set.appearance.density.' + v)) }));
    const accentOn = s.accentSource === 'custom';
    const customIsSwatch = S.ACCENTS.indexOf(s.accent) >= 0;
    const lang = T4.i18n.preference();

    const sidebar = (function () {
      const items = T4.nav.items();
      const secs = [];
      items.forEach((n) => { let g = secs.find((x) => x.id === n.section); if (!g) { g = { id: n.section, items: [] }; secs.push(g); } g.items.push(n); });
      return secs.map((g) => {
        const head = g.id && T4.i18n.has('nav.section.' + g.id.toLowerCase()) ? tr('nav.section.' + g.id.toLowerCase()) : tr('set.appearance.sidebar.main');
        return '<div class="nav-edit__group"><h4 class="nav-edit__head">' + esc(head) + '</h4><ul class="nav-edit__list" role="list">' + g.items.map((n, i) => {
          const upOff = n.locked || i === 0 || g.items[i - 1].locked, downOff = n.locked || i === g.items.length - 1 || g.items[i + 1].locked;
          const mv = (dir, off, cls) => '<button type="button" class="icon-btn icon-btn--sm nav-edit__' + cls + '" data-action="nav-move" data-id="' + esc(n.id) + '" data-dir="' + dir + '"' + (off ? ' disabled' : '') +
            ' aria-label="' + esc(tr(dir < 0 ? 'set.appearance.sidebar.up' : 'set.appearance.sidebar.down', { name: n.label })) + '">' + icon('chevron-down') + '</button>';
          return '<li class="nav-edit__row' + (n.hidden ? ' is-hidden' : '') + '" data-nav-id="' + esc(n.id) + '">' + icon(n.icon) +
            '<span class="nav-edit__label">' + esc(n.label) + (n.locked ? '<span class="nav-edit__lock">' + icon('lock') + esc(tr('set.appearance.sidebar.locked')) + '</span>' : '') + '</span>' +
            '<label class="switch"><input type="checkbox" data-change="nav-toggle" data-id="' + esc(n.id) + '"' + (n.hidden ? '' : ' checked') + (n.locked ? ' disabled' : '') +
            ' aria-label="' + esc(tr('set.appearance.sidebar.show', { name: n.label })) + '"><span class="switch__track" aria-hidden="true"></span></label>' +
            mv(-1, upOff, 'up') + mv(1, downOff, 'down') + '</li>';
        }).join('') + '</ul></div>';
      }).join('');
    })();

    return '<section class="card settings__section appearance" id="set-appearance"><h2 class="card__title">' + icon('droplet') + esc(tr('set.appearance.title')) + '</h2>' +
      '<p class="muted small appearance__sub">' + esc(tr('set.appearance.sub')) + '</p>' +

      '<div class="setting setting--stack"><span class="label" id="lbl-design">' + esc(tr('set.appearance.design')) + '</span>' +
        '<div class="dgallery" role="radiogroup" data-rg="design" aria-labelledby="lbl-design">' + designs.map((d) => designCard(d, mode, s.design)).join('') + '</div></div>' +

      '<div class="setting"><span class="label" id="lbl-mode">' + esc(tr('set.appearance.mode')) +
        (single ? '<span class="setting__help" id="mode-hint">' + esc(tr('set.appearance.modeOnly.' + cur.modes[0], { name: cur.name })) + '</span>' : '') + '</span>' +
        radios('theme', 'set-theme', modeCurrent, modeItems, { label: tr('set.appearance.mode') }) + '</div>' +

      '<div class="setting setting--stack"><span class="label" id="lbl-accent">' + esc(tr('set.appearance.accent')) + '</span>' +
        '<div class="accent-row"><button type="button" class="chip' + (accentOn ? '' : ' is-on') + '" data-action="set-accent-design" aria-pressed="' + !accentOn + '"><span class="chip__dot" style="background:' + cssColor(cur.accentFor(mode), '#5b5bd6') + '"></span>' + esc(tr('set.appearance.accent.design')) + '</button>' +
        '<div class="swatches" role="radiogroup" data-rg="accent" aria-labelledby="lbl-accent">' + S.ACCENTS.map((c) => {
          const on = accentOn && c === s.accent;
          const tab = on || (!(accentOn && customIsSwatch) && c === S.ACCENTS[0]);
          return '<button type="button" class="swatch' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="' + (tab ? 0 : -1) + '" data-action="set-accent" data-value="' + c + '" data-id="' + c + '" style="--sw:' + c + '" aria-label="' + esc(tr('set.appearance.accent.swatch', { color: c })) + '">' + icon('check') + '</button>';
        }).join('') + '</div>' +
        '<label class="color-pick' + (accentOn && !customIsSwatch ? ' is-on' : '') + '"><input type="color" id="set-accent-custom" value="' + esc(HEX6.test(s.accent) ? s.accent : S.ACCENTS[0]) + '" data-input="accent-custom" data-change="accent-custom"><span>' + esc(tr('set.appearance.accent.custom')) + '</span></label></div></div>' +

      '<div class="setting setting--stack"><span class="label">' + esc(tr('set.appearance.font')) + '</span>' + radios('font', 'set-font', s.font, fontItems, { cls: 'seg seg--wrap', label: tr('set.appearance.font') }) + '</div>' +
      '<div class="setting setting--stack"><span class="label">' + esc(tr('set.appearance.radius')) + '</span>' + radios('radius', 'set-radius', s.radius, radiusItems, { cls: 'seg seg--wrap', label: tr('set.appearance.radius') }) + '</div>' +
      '<div class="setting"><span class="label">' + esc(tr('set.appearance.density')) + '</span>' + radios('density', 'set-density', s.density, densityItems, { label: tr('set.appearance.density') }) + '</div>' +
      '<div class="setting"><label for="set-scale">' + esc(tr('set.appearance.textSize')) + '</label><div class="range-row"><span class="range-row__min" aria-hidden="true">A</span>' +
        '<input type="range" id="set-scale" min="85" max="125" step="5" value="' + s.fontScale + '" data-input="scale" data-change="scale"><span class="range-row__max" aria-hidden="true">A</span>' +
        '<output id="set-scale-out" for="set-scale">' + s.fontScale + ' %</output></div></div>' +

      '<div class="setting setting--stack"><span class="label">' + esc(tr('set.appearance.sidebar')) + '<span class="setting__help">' + esc(tr('set.appearance.sidebar.help')) + '</span></span>' +
        '<div class="nav-edit" id="nav-edit">' + sidebar + '</div>' +
        '<div class="btn-row"><button type="button" class="btn btn--sm" data-action="nav-reset">' + icon('reset') + esc(tr('set.appearance.sidebar.reset')) + '</button></div></div>' +

      '<div class="setting"><label for="set-language">' + esc(tr('set.appearance.language')) + '</label><select id="set-language" data-change="language">' +
        '<option value="auto"' + (lang === 'auto' ? ' selected' : '') + '>' + esc(tr('set.appearance.language.auto')) + '</option>' +
        T4.i18n.languages().map((l) => '<option value="' + l.id + '"' + (lang === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></div>' +

      '<div class="setting"><span class="label">' + esc(tr('set.appearance.reset')) + '<span class="setting__help">' + esc(tr('set.appearance.reset.help')) + '</span></span>' +
        '<button type="button" class="btn" data-action="reset-appearance">' + icon('reset') + esc(tr('set.appearance.reset.button')) + '</button></div>' +
    '</section>';
  }

  T4.views.settings = {
    get title() { return tr('nav.settings'); },
    render() {
      const s = store.settings;
      const backupAt = S.backupInfo();
      const kb = (S.usageBytes() / 1024).toFixed(1);
      return '<header class="page-head"><div><h1 class="page-title">' + esc(tr('nav.settings')) + '</h1><p class="page-sub">' + esc(tr('set.sub')) + '</p></div></header>' +
        '<div class="settings">' +
        '<section class="card settings__section"><h2 class="card__title">' + esc(tr('set.profile')) + '</h2>' +
          '<div class="setting"><label for="set-name">' + esc(tr('set.yourName')) + '<span class="setting__help">' + esc(tr('set.yourNameHelp')) + '</span></label>' +
          '<input id="set-name" type="text" maxlength="60" value="' + esc(s.userName) + '" data-change="setting" data-key="userName" placeholder="' + esc(tr('ed.Optional')) + '"></div></section>' +

        appearanceSection() +

        '<section class="card settings__section"><h2 class="card__title">' + esc(tr('set.tasksPlanning')) + '</h2>' +
          '<div class="setting"><label for="set-sort">' + esc(tr('set.defaultSort')) + '</label><select id="set-sort" data-change="setting" data-key="defaultSort">' +
            [['priority', tr('sort.priority')], ['due', tr('sort.due')], ['created', tr('set.sortCreated')], ['alpha', tr('sort.alpha')], ['status', tr('sort.status')]].map(([v, l]) => '<option value="' + v + '"' + (s.defaultSort === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>' +
          '<div class="setting"><label for="set-week">' + esc(tr('set.weekStart')) + '</label><select id="set-week" data-change="setting" data-key="weekStart">' +
            '<option value="1"' + (s.weekStart === 1 ? ' selected' : '') + '>' + esc(T4.i18n.fmtWeekday(1, 'long')) + '</option><option value="0"' + (s.weekStart === 0 ? ' selected' : '') + '>' + esc(T4.i18n.fmtWeekday(0, 'long')) + '</option></select></div>' +
          '<div class="setting"><label for="set-pf">' + esc(tr('set.focusLength')) + '<span class="setting__help">' + esc(tr('set.minutes')) + '</span></label><input id="set-pf" type="number" min="1" max="120" value="' + s.pomodoroFocus + '" data-change="setting" data-key="pomodoroFocus"></div>' +
          '<div class="setting"><label for="set-pb">' + esc(tr('set.breakLength')) + '<span class="setting__help">' + esc(tr('set.minutes')) + '</span></label><input id="set-pb" type="number" min="1" max="60" value="' + s.pomodoroBreak + '" data-change="setting" data-key="pomodoroBreak"></div>' +
          '<div class="setting"><label for="set-remtime">' + esc(tr('set.reminderTime')) + '<span class="setting__help">' + esc(tr('set.reminderTimeHelp')) + '</span></label><input id="set-remtime" type="time" value="' + esc(s.reminderTime) + '" data-change="setting" data-key="reminderTime"></div>' +
          reminderStatusRow() +
        '</section>' +

        (T4.calfeeds ? T4.calfeeds.settingsCard() : '') +

        '<section class="card settings__section"><h2 class="card__title">' + esc(tr('set.categories')) + '</h2>' +
          '<ul class="cat-list" role="list">' + store.data.categories.map((c) => {
            const n = store.data.tasks.filter((t) => t.categoryId === c.id).length;
            return '<li class="cat-row"><input type="color" value="' + esc(c.color) + '" data-change="category" data-field="color" data-id="' + c.id + '" aria-label="' + esc(tr('cf.colorFor', { name: c.name })) + '">' +
              '<input type="text" maxlength="40" value="' + esc(c.name) + '" data-change="category" data-field="name" data-id="' + c.id + '" aria-label="' + esc(tr('tk.categoryName')) + '">' +
              '<span class="muted small nowrap">' + esc(tr('tk.results', { count: n })) + '</span>' +
              '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-category" data-id="' + c.id + '" aria-label="' + esc(tr('set.delCatLabel', { name: c.name })) + '">' + icon('trash') + '</button></li>';
          }).join('') + '</ul>' +
          '<form class="cat-row cat-row--add" data-form="add-category"><input type="color" name="color" value="#0e7c86" aria-label="' + esc(tr('set.newCatColor')) + '">' +
            '<input type="text" name="name" maxlength="40" placeholder="' + esc(tr('tk.newCategoryName')) + '" aria-label="' + esc(tr('tk.newCategoryName')) + '" required>' +
            '<button type="submit" class="btn btn--sm">' + icon('plus') + esc(tr('c.add')) + '</button></form>' +
        '</section>' +

        '<section class="card settings__section"><h2 class="card__title">' + esc(tr('set.dataBackup')) + '</h2>' +
          '<p class="muted small">' + esc(tr('set.dataInfo', { adapter: S.adapterName, kb })) + '</p>' +
          (S.isAvailable ? '' : '<p class="callout callout--warn">' + icon('alert') + esc(tr('set.storageOff')) + '</p>') +
          '<div class="btn-row">' +
            '<button type="button" class="btn" data-action="export-data">' + icon('download') + esc(tr('set.exportJson')) + '</button>' +
            '<button type="button" class="btn" data-action="import-data">' + icon('upload') + esc(tr('set.importJson')) + '</button>' +
            '<button type="button" class="btn" data-action="restore-backup"' + (backupAt ? '' : ' disabled') + '>' + icon('reset') + esc(tr('set.restoreBackup')) + '</button>' +
            '<button type="button" class="btn btn--ghost" data-action="load-sample">' + icon('sparkle') + esc(tr('set.addSample')) + '</button>' +
          '</div>' +
          '<p class="muted small">' + esc(backupAt ? tr('set.autoBackup', { date: U.fmtDateTime(backupAt) }) : tr('set.noAutoBackup')) + '</p>' +
          '<div class="danger-zone"><div><strong>' + esc(tr('set.resetApp')) + '</strong><p class="muted small">' + esc(tr('set.resetAppHelp')) + '</p></div>' +
            '<button type="button" class="btn btn--danger" data-action="reset-data">' + icon('trash') + esc(tr('set.resetAll')) + '</button></div>' +
        '</section>' +

        '<section class="card settings__section"><h2 class="card__title">' + esc(tr('set.shortcuts')) + '</h2>' +
          '<dl class="shortcuts"><dt><kbd>N</kbd></dt><dd>' + esc(tr('set.scNew')) + '</dd><dt><kbd>Q</kbd></dt><dd>' + esc(tr('set.scQuick')) + '</dd><dt><kbd>/</kbd></dt><dd>' + esc(tr('set.scSearch')) + '</dd>' +
          '<dt><kbd>G</kbd> ' + esc(tr('set.then')) + ' <kbd>D</kbd>/<kbd>I</kbd>/<kbd>T</kbd>/<kbd>W</kbd>/<kbd>O</kbd></dt><dd>' + esc(tr('set.scGo')) + '</dd>' +
          '<dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>' + esc(tr('set.scSave')) + '</dd><dt><kbd>Esc</kbd></dt><dd>' + esc(tr('set.scClose')) + '</dd></dl>' +
          '<p class="muted small">' + tr('set.syntax') + '</p>' +
        '</section>' +
        '</div>';
    },
  };

  return { applyAppearance, resolvedTheme, exportData };
})();
