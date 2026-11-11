// UI modes (Simple / Advanced): task form, quick-add help, weekly planner — part of tests/test-functional.mjs.
// Runs against the page's own mode switch (T4.mode) when it exists; otherwise it sets the body class itself and restores it.
export default async function modesUiChecks(b, run) {
  const MODE = `
    var setMode = async (m) => {
      if (window.T4.mode && T4.mode.set) T4.mode.set(m);
      else { document.body.classList.remove('mode-simple', 'mode-advanced'); document.body.classList.add('mode-' + m); }
      await wait(60);
    };
    var vis = (sel) => { const e = $(sel); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
  `;
  await run('modes-ui-form', MODE + `
    window.__modeBefore = document.body.classList.contains('mode-simple') ? 'simple' : 'advanced';
    await setMode('advanced');
    await go('tasks');
    // Advanced: exactly the classic form, no disclosure
    T4.tasks.openEditor(null, {}); await wait(50);
    const ids = ['#tf-title', '#tf-desc', '#tf-date', '#tf-time', '#tf-est', '#tf-status', '#tf-cat', '#tf-recur', '#tf-remind', '#tf-tags', '#tf-sub-new', '#tf-notes'];
    ok(ids.every(vis) && !$('#tf-more-btn') && !$('#tf-more'), 'Advanced: all form fields visible, no "More options" disclosure');
    click('#modal [data-action=modal-close]'); await wait(40);

    // Simple: basic fields only, More options collapsed
    await setMode('simple');
    const hiddenIds = ['#tf-desc', '#tf-est', '#tf-status', '#tf-cat', '#tf-recur', '#tf-tags', '#tf-sub-new', '#tf-notes'];
    T4.tasks.openEditor(null, {}); await wait(50);
    ok(['#tf-title', '#tf-date', '#tf-time', '#tf-remind'].every(vis) && $$('input[name=priority]').length === 5 && vis('input[name=priority]:checked + span'), 'Simple: title, due date + time, priority, reminder visible');
    ok(hiddenIds.every((s) => !vis(s)), 'Simple: description, estimate, status, category, repeat, tags, subtasks, notes hidden');
    const btn = $('#tf-more-btn');
    ok(btn && btn.getAttribute('aria-expanded') === 'false' && btn.getAttribute('aria-controls') === 'tf-more' && $('#tf-more').hidden && btn.tagName === 'BUTTON', 'More options: real button, aria-expanded=false, panel collapsed');
    btn.focus(); btn.click(); await wait(30);
    ok(btn.getAttribute('aria-expanded') === 'true' && hiddenIds.every(vis), 'More options expands and shows the remaining fields');
    btn.click(); await wait(30);
    ok(btn.getAttribute('aria-expanded') === 'false' && !vis('#tf-tags'), 'More options collapses again');
    // collapsed fields are still part of the form (defaults)
    $('#tf-title').value = 'Simple basic task'; $('#tf-date').value = T4.util.today();
    $('#task-form').requestSubmit(); await wait(60);
    const nb = S().tasks.find((x) => x.title === 'Simple basic task');
    ok(nb && nb.status === 'todo' && nb.tags.length === 0 && !nb.recurrence && nb.dueDate === T4.util.today(), 'Simple: creating a task with basic fields works (defaults for the rest)');

    // A task with hidden-field values opens expanded; saving keeps everything
    const rich = T4.store.addTask({ title: 'Rich task', dueDate: T4.util.today(), priority: 'high', tags: ['alpha', 'beta'], estimate: 45, categoryId: 'cat_work', notes: 'some notes', description: 'desc here',
      subtasks: [{ id: 'sub_m1', title: 'step one', done: true }, { id: 'sub_m2', title: 'step two', done: false }],
      recurrence: { unit: 'week', every: 1, weekdays: [T4.util.parseDate(T4.util.today()).getDay()], from: 'due' } });
    const before = JSON.parse(JSON.stringify(T4.store.getTask(rich.id)));
    T4.tasks.openEditor(T4.store.getTask(rich.id)); await wait(50);
    ok($('#tf-more-btn').getAttribute('aria-expanded') === 'true' && vis('#tf-tags') && vis('#tf-recur'), 'Simple: task with tags/repeat/subtasks opens with More options expanded');
    $('#tf-more-btn').click(); await wait(20);
    ok(!vis('#tf-tags'), 'collapsed by hand');
    $('#tf-title').value = 'Rich task renamed';
    $('#task-form').requestSubmit(); await wait(60);
    const after = T4.store.getTask(rich.id);
    const same = ['tags', 'estimate', 'categoryId', 'notes', 'description', 'subtasks', 'recurrence', 'status', 'priority', 'dueDate'].every((k) => JSON.stringify(after[k]) === JSON.stringify(before[k]));
    ok(after.title === 'Rich task renamed' && same, 'Simple: saving with collapsed More options keeps tags/repeat/subtasks/estimate/category/notes unchanged' + (same ? '' : ' ' + JSON.stringify(after)));
    T4.store.deleteTask(rich.id); if (nb) T4.store.deleteTask(nb.id);

    // a non-default status alone also counts as "set"
    const ip = T4.store.addTask({ title: 'In progress only', status: 'in_progress', dueDate: T4.util.today() });
    T4.tasks.openEditor(T4.store.getTask(ip.id)); await wait(50);
    ok($('#tf-more-btn').getAttribute('aria-expanded') === 'true', 'Simple: non-default status opens More options expanded');
    click('#modal [data-action=modal-close]'); await wait(40);
    T4.store.deleteTask(ip.id);

    await setMode('advanced');
    T4.tasks.openEditor(null, {}); await wait(50);
    ok(ids.every(vis) && !$('#tf-more-btn'), 'back in Advanced: full form again');
    click('#modal [data-action=modal-close]'); await wait(40);
  `);

  await run('modes-ui-quickadd', MODE + `
    const lang0 = T4.i18n.getLanguage ? T4.i18n.getLanguage() : 'en';
    for (const mode of ['advanced', 'simple']) {
      await setMode(mode);
      for (const l of ['en', 'de', 'tr', 'es']) {
        T4.i18n.setLanguage(l); await wait(60);
        await go('inbox');
        const inp = $('#qa-inbox input[name=title]');
        ok(inp && /!2/.test(inp.placeholder) && /@fri/.test(inp.placeholder), mode + '/' + l + ': quick-add placeholder shows an example (' + (inp && inp.placeholder) + ')');
        ok(!!$('#qa-inbox [data-qa-help]'), mode + '/' + l + ': "?" help button present');
        if (l === 'en') {
          const hb = $('#qa-inbox [data-qa-help]'), pop = $('#' + hb.getAttribute('aria-controls'));
          ok(hb.getAttribute('aria-expanded') === 'false' && pop.hidden, mode + ': help popover closed by default');
          hb.click(); await wait(30);
          ok(hb.getAttribute('aria-expanded') === 'true' && !pop.hidden && /!1/.test(pop.textContent) && /@tomorrow/.test(pop.textContent) && /#work/.test(pop.textContent) && /every monday/.test(pop.textContent), mode + ': help popover lists priority, tag, date and repeat syntax');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(30);
          ok(pop.hidden && hb.getAttribute('aria-expanded') === 'false', mode + ': Esc closes the help popover');
        }
      }
      T4.i18n.setLanguage('en'); await wait(40);
      await go('tasks');
      ok(/Add a task/.test($('#qa-tasks input[name=title]').placeholder), mode + ': My Tasks placeholder keeps its old text');
      const p = T4.tasks.parseQuickAdd('Pay rent !2 @fri');
      ok(p.title === 'Pay rent' && p.priority === 'high' && !!p.dueDate, mode + ': the example syntax parses');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true })); await wait(40);
      ok($('#modal').open && /!2/.test($('#qc-title').placeholder) && !!$('#qc-form [data-qa-help]'), mode + ': quick capture dialog has example + "?"');
      click('#modal [data-action=modal-close]'); await wait(40);
    }
    T4.i18n.setLanguage(lang0); await wait(40);
  `);

  await run('modes-ui-planner', MODE + `
    const KEY = 'todo4me.planner.ui';
    await setMode('advanced');
    await go('planner');
    ok(!!$('[data-action=planner-mode]'), 'Advanced planner: Days | Calendar toggle present');
    click('[data-action=planner-mode][data-mode=calendar]'); await wait(80);
    ok(!!$('.cal') && JSON.parse(localStorage.getItem(KEY)).mode === 'calendar', 'Advanced: calendar view chosen and stored');
    await setMode('simple');
    await go('planner'); await wait(60);
    ok($$('.day').length === 7 && !$('.cal') && !$('[data-action=planner-mode]'), 'Simple: planner shows the Days view, no Days|Calendar toggle');
    ok(JSON.parse(localStorage.getItem(KEY)).mode === 'calendar', 'Simple: stored calendar preference is untouched');
    ok(!$('.mode-hint'), 'Simple: no calendar hint without the deep link');
    await go('planner?view=calendar'); await wait(80);
    ok($$('.day').length === 7 && !$('.cal') && !!$('.mode-hint [data-action=modeui-advanced]'), 'Simple: #/planner?view=calendar shows Days plus a hint to switch');
    ok(JSON.parse(localStorage.getItem(KEY)).mode === 'calendar', 'deep link in Simple does not change the preference');
    await go('planner?view=days'); await wait(60);
    ok(JSON.parse(localStorage.getItem(KEY)).mode === 'calendar', '?view=days in Simple does not overwrite the preference either');
    await go('planner'); await wait(40);
    await setMode('advanced');
    await go('planner'); await wait(80);
    ok(!!$('.cal') && !!$('[data-action=planner-mode]'), 'back in Advanced: calendar preference restored, toggle back');
    click('[data-action=planner-mode][data-mode=days]'); await wait(60);
    localStorage.setItem(KEY, JSON.stringify({ mode: 'days', span: 'week' }));
    await go('dashboard');
    await setMode(window.__modeBefore || 'advanced');
    window.__modeBefore = null;
  `);
}
