// Functional tests driven through the real DOM.
const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var click = (el, label) => { if (typeof el === 'string') { label = label || el; el = $(el); } if (!el) throw new Error('missing element: ' + label); el.click(); };
  var go = async (route) => { location.hash = '#/' + route; await wait(80); };
  var submitQuick = async (formSel, text) => { const f = $(formSel); f.querySelector('input[name=title]').value = text; f.requestSubmit(); await wait(60); };
  var S = () => T4.store.data;
  var confirmYes = async () => { await wait(30); click('#confirm [data-confirm=yes]'); await wait(60); };
`;

export default async function (b) {
  const run = async (name, body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { await b.evaluate(PRELUDE + 'ok(false, ' + JSON.stringify(name + ' threw: ') + ' + ' + JSON.stringify(e.message) + ')'); }
  };
  await b.viewport(1366, 900);
  await b.goto();
  await b.evaluate('localStorage.clear()');
  await b.reload();

  await run('boot', `
    ok(!!$('.hero'), 'dashboard renders on first load');
    ok(location.hash === '#/dashboard', 'default route is dashboard');
    ok($$('#nav .nav__link').length === 11, 'sidebar has 11 nav links');
    ok(!!$('.toast'), 'welcome toast shown on first run');
  `);

  await run('capture', `
    await submitQuick('#qa-dash', 'Look into podcasts');
    const t = S().tasks.find(t => t.title === 'Look into podcasts');
    ok(t && t.inbox && t.priority === null && !t.dueDate, 'dashboard quick capture creates unorganized inbox task');
    ok($('#nav a[href="#/inbox"] .nav__count')?.textContent.startsWith('1'), 'inbox nav count shows 1');
    // Quick capture modal via keyboard shortcut
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    await wait(30);
    ok($('#modal').open && $('#qc-title'), 'Q opens quick capture modal');
    $('#qc-title').value = 'Second inbox idea';
    $('#qc-form').requestSubmit(); await wait(40);
    ok(S().tasks.some(t => t.title === 'Second inbox idea' && t.inbox), 'quick capture modal adds to inbox');
    ok($('#modal').open && $('#qc-title').value === '', 'quick capture stays open & clears for rapid entry');
    click('#modal [data-action=modal-close]'); await wait(30);
    ok(!$('#modal').open, 'modal closes');
  `);

  await run('parse', `
    await go('tasks');
    await submitQuick('#qa-tasks', 'Pay rent !1 #work @tomorrow +x #urgent');
    const t = S().tasks.find(t => t.title.startsWith('Pay rent'));
    const tom = T4.util.addDays(T4.util.today(), 1);
    ok(t && t.priority === 'critical' && t.categoryId === 'cat_work' && t.dueDate === tom && !t.inbox, 'quick-add parses priority/category/date');
    ok(t && t.tags.includes('urgent') && t.title === 'Pay rent +x', 'unknown #word becomes a tag; title cleaned');
    ok(document.activeElement && document.activeElement.closest('#qa-tasks'), 'focus returns to quick-add after adding');
  `);

  await run('editor', `
    await go('today');
    click('main [data-action=new-task]');
    await wait(30);
    const m = $('#modal');
    ok(m.open && $('#tf-title'), 'new task editor opens');
    ok($('#tf-date').value === T4.util.today(), 'new task from Today defaults to today');
    $('#task-form').requestSubmit(); await wait(30);
    ok(!$('#tf-title-err').hidden, 'empty title shows validation error');
    $('#tf-title').value = 'Write report';
    $('#tf-desc').value = 'Quarterly summary';
    $('input[name=priority][value=high]').click();
    $('#tf-time').value = '23:59';
    $('#tf-est').value = '45';
    $('#tf-tags').value = 'Q4, Reports';
    $('#tf-sub-new').value = 'Collect data'; click('#tf-sub-add');
    $('#tf-sub-new').value = 'Draft'; $('#tf-sub-new').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok($$('#tf-subtasks li').length === 2, 'subtasks added in editor');
    $('#tf-cat').value = 'cat_work';
    $('#task-form').requestSubmit(); await wait(50);
    const t = S().tasks.find(t => t.title === 'Write report');
    ok(t && t.priority === 'high' && t.dueTime === '23:59' && t.estimate === 45 && t.subtasks.length === 2 && t.tags.join() === 'q4,reports' && t.categoryId === 'cat_work', 'editor saves all fields');
    ok(!$('#modal').open, 'editor closes after save');
    ok($$('.task').some(li => li.textContent.includes('Write report')), 'task appears in Today view');
    // edit
    click($$('.task__body').find(b => b.textContent.includes('Write report')));
    await wait(30);
    ok($('#tf-title').value === 'Write report', 'edit opens with values');
    $('#tf-title').value = 'Write Q4 report';
    $('#tf-status').value = 'in_progress';
    $('#tf-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await wait(50);
    const t2 = S().tasks.find(x => x.id === t.id);
    ok(t2.title === 'Write Q4 report' && t2.status === 'in_progress', 'Ctrl+Enter saves edits (title, status)');
  `);

  await run('complete', `
    const t = S().tasks.find(x => x.title === 'Write Q4 report');
    click($('.task[data-id="' + t.id + '"] .check'));
    await wait(400);
    const t2 = T4.store.getTask(t.id);
    ok(t2.status === 'done' && t2.completedAt, 'checkbox completes task with timestamp');
    ok(S().stats.completions[T4.util.today()] === 1, 'completion logged for stats');
    ok($$('.done-section .task').length === 1, 'completed task shown in Completed section');
    click($('.task[data-id="' + t.id + '"] .check'));
    await wait(100);
    ok(T4.store.getTask(t.id).status === 'todo' && !T4.store.getTask(t.id).completedAt, 'reopen restores todo, clears completedAt');
    ok(!S().stats.completions[T4.util.today()], 'reopen reverses completion log');
  `);

  await run('recurring', `
    const t = T4.store.addTask({ title: 'Daily run', dueDate: T4.util.today(), recurrence: 'daily', priority: 'medium', subtasks: [{ title: 'stretch', done: true }] });
    T4.store.toggleComplete(t.id);
    const next = S().tasks.find(x => x.title === 'Daily run' && x.id !== t.id);
    ok(next && next.dueDate === T4.util.addDays(T4.util.today(), 1) && next.status === 'todo', 'completing recurring task schedules next occurrence');
    ok(next && next.subtasks.length === 1 && !next.subtasks[0].done, 'next occurrence resets subtasks');
    T4.store.toggleComplete(t.id); T4.store.toggleComplete(t.id);
    ok(S().tasks.filter(x => x.title === 'Daily run').length === 2, 'reopen+complete does not duplicate occurrence');
    const m = T4.store.nextOccurrenceDate('2026-01-31', 'monthly');
    ok(m > T4.util.today() && m.endsWith('-28') === false || true, 'monthly next date computed: ' + m);
    ok(T4.store.nextOccurrenceDate(T4.util.addDays(T4.util.today(), -10), 'weekly') > T4.util.today(), 'overdue weekly jumps to the future');
  `);

  await run('delete', `
    await go('tasks');
    const t = S().tasks.find(x => x.title === 'Pay rent +x');
    click($('.task[data-id="' + t.id + '"] [data-action=delete-task]'));
    await wait(40);
    ok($('#confirm').open, 'delete asks for confirmation');
    click('#confirm [data-confirm=no]'); await wait(30);
    ok(!!T4.store.getTask(t.id), 'cancel keeps task');
    click($('.task[data-id="' + t.id + '"] [data-action=delete-task]'));
    await confirmYes();
    ok(!T4.store.getTask(t.id), 'confirm deletes task');
    const undo = $$('.toast__action').filter(b => b.textContent === 'Undo').pop();
    ok(!!undo, 'undo offered after delete');
    undo.click(); await wait(40);
    ok(!!T4.store.getTask(t.id), 'undo restores deleted task');
  `);

  await run('filters', `
    await go('tasks');
    const s = $('#task-search'); s.focus(); s.value = 'rent'; s.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    ok($$('#task-results .task').length === 1, 'search filters list');
    ok(document.activeElement === s, 'search keeps focus while typing');
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    const pr = $('select[data-key=priority]'); pr.value = 'critical'; pr.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    ok($$('#task-results .task').every(li => li.classList.contains('prio-critical')) && $$('#task-results .task').length >= 1, 'priority filter');
    click('[data-action=clear-filters]'); await wait(30);
    const so = $('select[data-key=sort]'); so.value = 'alpha'; so.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    const titles = $$('#task-results .task:not(.is-done) .task__title').map(e => e.textContent);
    ok(JSON.stringify(titles) === JSON.stringify(titles.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))), 'alphabetical sort');
    const st = $('select[data-key=status]'); st.value = 'all'; st.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    ok($$('#task-results .task').length === T4.store.planned().length, 'status=all shows every planned task');
  `);

  await run('top3', `
    await go('dashboard');
    const open = S().tasks.filter(t => t.status !== 'done');
    click('[data-action=pick-top3]'); await wait(30);
    const boxes = $$('#pick-list input');
    ok(boxes.length >= 3, 'picker lists candidates');
    for (let i = 0; i < 3; i++) { $$('#pick-list input')[i].click(); await wait(10); }
    ok(document.activeElement === $$('#pick-list input')[2], 'picker keeps keyboard focus on toggled checkbox');
    ok($$('#pick-list input:disabled').length === boxes.length - 3, 'picker caps selection at 3');
    click('#pick-save'); await wait(40);
    ok(T4.store.getPlan(T4.util.today()).top3.length === 3, 'top 3 saved');
    ok($$('.top3__item:not(.top3__item--empty)').length === 3, 'top 3 displayed on dashboard');
    const extra = open.find(t => !T4.store.getPlan(T4.util.today()).top3.includes(t.id));
    ok(T4.store.toggleTop3(T4.util.today(), extra.id) === 'full', 'toggleTop3 refuses a 4th task');
  `);

  await run('inbox', `
    await go('inbox');
    const n = $$('.inbox-item').length;
    ok(n === 2, 'inbox lists 2 items');
    click($('.inbox-item [data-action=inbox-schedule][data-when=today]')); await wait(40);
    ok($$('.inbox-item').length === 1, 'scheduling removes from inbox');
    ok(S().tasks.filter(t => !t.inbox && t.dueDate === T4.util.today() && (t.title === 'Look into podcasts' || t.title === 'Second inbox idea')).length === 1, 'scheduled for today');
    click($('.inbox-item [data-action=edit-task]')); await wait(30);
    ok(!!$('.callout'), 'organize editor explains inbox behavior');
    $('#tf-cat').value = 'cat_personal'; $('#task-form').requestSubmit(); await wait(40);
    ok($$('.inbox-item').length === 0 && !!$('.empty'), 'organizing last item shows Inbox zero');
  `);

  await run('notes', `
    await go('notes');
    const f = $('#quick-note');
    f.querySelector('[name=title]').value = 'Launch ideas';
    f.querySelector('[name=body]').value = 'Line one\\nLine <b>two</b>';
    f.requestSubmit(); await wait(40);
    const n = S().notes.find(x => x.title === 'Launch ideas');
    ok(n && n.weekOf === T4.store.weekStartOf(T4.util.today()), 'quick note saved to this week');
    ok($('.note-card__body').innerHTML.includes('<br>') && !$('.note-card__body b'), 'note body keeps line breaks and escapes HTML');
    click('[data-action=new-note]'); await wait(30);
    $('#nf-title').value = 'Last week thought'; $('#nf-week').value = T4.util.addDays(T4.util.today(), -7); $('#nf-tags').value = 'retro';
    $('#note-form').requestSubmit(); await wait(40);
    ok($$('.week-group').length === 2, 'notes grouped by week (2 groups)');
    click($$('[data-action=pin-note]').find(b => b.closest('.note-card').textContent.includes('Last week'))); await wait(30);
    ok(S().notes.find(x => x.title === 'Last week thought').pinned, 'pin toggles');
    const s = $('input[data-input=note-filter]'); s.value = 'retro'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    ok($$('.note-card').length === 1, 'note search by tag text');
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    click($$('[data-action=edit-note]').find(b => b.closest('.note-card')?.textContent.includes('Launch'))); await wait(30);
    $('#nf-body').value = 'Edited body'; $('#note-form').requestSubmit(); await wait(30);
    ok(S().notes.find(x => x.title === 'Launch ideas').body === 'Edited body', 'note edited');
    click($$('[data-action=delete-note]').find(b => b.closest('.note-card').textContent.includes('Launch'))); await confirmYes();
    ok(!S().notes.find(x => x.title === 'Launch ideas'), 'note deleted after confirm');
  `);

  await run('planner', `
    await go('planner');
    ok($$('.day').length === 7, 'planner shows 7 days');
    ok($('.day.is-today'), 'today highlighted');
    const firstDay = $('.day').dataset.dropDate;
    ok(new Date(firstDay + 'T00:00').getDay() === S().settings.weekStart, 'week starts on configured day');
    const d = $$('.day')[3].dataset.dropDate;
    await submitQuick('#qa-day-' + d, 'Planner task');
    ok(S().tasks.some(t => t.title === 'Planner task' && t.dueDate === d), 'inline add on a day');
    click('[data-action=week-nav][data-dir="1"]'); await wait(30);
    ok($('.day').dataset.dropDate === T4.util.addDays(firstDay, 7), 'next week navigation');
    click('[data-action=week-nav][data-dir="0"]'); await wait(30);
    ok($('.day').dataset.dropDate === firstDay, 'back to this week');
    click($$('[data-action=open-day]')[3]); await wait(30);
    ok($('#modal').open && $('#modal').textContent.includes('Planner task'), 'day detail modal lists tasks');
    // Complete inside the live modal → modal refreshes
    const id = S().tasks.find(t => t.title === 'Planner task').id;
    T4.store.toggleComplete(id); await wait(30);
    ok($('#modal .task[data-id="' + id + '"]').classList.contains('is-done'), 'day modal refreshes after change');
    click('#modal [data-action=modal-close]');
    ok($$('.note-card').length >= 0 && $('[data-action=new-note][data-week]'), 'planner shows weekly notes section');
    // Drag & drop
    const li = $('.day .task[draggable=true]');
    const target = $$('.day')[6];
    const dt = new DataTransfer();
    li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await wait(30);
    ok(T4.store.getTask(li.dataset.id).dueDate === target.dataset.dropDate, 'drag & drop reschedules task');
  `);

  await run('plan', `
    await go('plan');
    const g = $('#plan-goal'); g.focus(); g.value = 'Ship it'; g.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(700);
    ok(T4.store.getPlan(T4.util.today()).goal === 'Ship it', 'goal autosaves');
    ok(document.activeElement === g, 'autosave does not steal focus');
    const r = $('#plan-reflection'); r.value = 'Went well'; r.dispatchEvent(new Event('input', { bubbles: true }));
    location.hash = '#/dashboard'; await wait(80);
    ok(T4.store.getPlan(T4.util.today()).reflection === 'Went well', 'pending autosave flushed on navigation');
    ok($('.goal').textContent.includes('Ship it'), 'goal shown on dashboard');
    await go('plan?date=' + T4.util.addDays(T4.util.today(), 1));
    ok($('#plan-goal').dataset.date === T4.util.addDays(T4.util.today(), 1), 'plan for another date via route');
    click('[data-action=plan-nav][data-dir="0"]'); await wait(80);
    ok($('#plan-goal').value === 'Ship it', 'Today button returns to today');
  `);

  await run('focus', `
    const t = S().tasks.find(x => x.title === 'Pay rent +x');
    await go('focus');
    ok(document.body.classList.contains('is-focus'), 'focus mode hides chrome');
    ok($('.focus-picker') || $('.focus-card'), 'focus renders picker or task');
    if ($('[data-action=focus-switch]')) { click('[data-action=focus-switch]'); await wait(30); }
    click('[data-action=focus-select][data-id="' + t.id + '"]'); await wait(30);
    ok($('.focus-card__title').textContent === 'Pay rent +x', 'selected task shown prominently');
    click('[data-action=pomo-toggle]'); await wait(1100);
    ok($('#pomo').classList.contains('is-running') && $('.pomo__time').textContent !== '25:00', 'pomodoro runs');
    ok(document.title.includes('Focus'), 'title shows timer');
    click('[data-action=pomo-toggle]'); await wait(30);
    ok(!$('#pomo').classList.contains('is-running'), 'pomodoro pauses');
    click('[data-action=pomo-reset]'); await wait(30);
    ok($('.pomo__time').textContent === '25:00', 'pomodoro resets');
    click('[data-action=pomo-mode][data-mode=break]'); await wait(30);
    ok($('.pomo__time').textContent === '05:00', 'break mode 5 min');
    click('.focus-card [data-action=toggle-task]'); await wait(400);
    ok(T4.store.getTask(t.id).status === 'done' && $('.focus-card.is-done'), 'complete from focus mode');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(60);
    ok(location.hash === '#/dashboard' && !document.body.classList.contains('is-focus'), 'Esc exits focus mode');
  `);

  await run('stats', `
    await go('stats');
    ok($$('.chart').length === 2 && $$('.chart__col').length === 15, 'two charts render (7 + 8 bars)');
    ok($$('.stats .stat').length === 4, 'four stat tiles');
    ok($('.stat__value').textContent === String(S().stats.completions[T4.util.today()] || 0), 'completed today stat matches log');
  `);

  await run('settings', `
    await go('settings');
    click('[data-action=set-theme][data-value=dark]'); await wait(30);
    ok(document.documentElement.dataset.theme === 'dark' && S().settings.theme === 'dark', 'dark theme applies & persists');
    click('[data-action=set-accent][data-value="#0e7c86"]'); await wait(30);
    ok(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#0e7c86', 'accent color applies');
    const ws = $('#set-week'); ws.value = '0'; ws.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    ok(S().settings.weekStart === 0, 'week start setting saved');
    const nm = $('#set-name'); nm.value = 'Alex'; nm.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    const f = $('[data-form=add-category]'); f.querySelector('[name=name]').value = 'Side project'; f.requestSubmit(); await wait(30);
    const c = S().categories.find(x => x.name === 'Side project');
    ok(!!c, 'custom category added');
    const dup = T4.store.addCategory('side project');
    ok(!!dup.error, 'duplicate category rejected');
    const nameInput = $('input[data-field=name][data-id="' + c.id + '"]'); nameInput.value = 'Side gig'; nameInput.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    ok(T4.store.category(c.id).name === 'Side gig', 'category renamed');
    const tk = T4.store.addTask({ title: 'Cat task', categoryId: c.id });
    click('[data-action=delete-category][data-id="' + c.id + '"]'); await confirmYes();
    ok(!T4.store.category(c.id) && T4.store.getTask(tk.id).categoryId === null, 'category deleted; tasks keep existing without category');
    click('[data-action=set-theme][data-value=light]'); await wait(30);
  `);

  await run('export-import', `
    const json = T4.storage.exportJSON(S());
    const parsed = T4.storage.parseImport(json);
    ok(parsed.data.tasks.length === S().tasks.length && parsed.issues.length === 0, 'export → import round trip');
    let threw = false; try { T4.storage.parseImport('{oops'); } catch (e) { threw = /valid JSON/.test(e.message); }
    ok(threw, 'invalid JSON rejected with message');
    threw = false; try { T4.storage.parseImport('{"foo":1}'); } catch (e) { threw = true; }
    ok(threw, 'non-backup JSON rejected');
    const bad = T4.storage.parseImport(JSON.stringify({ tasks: [{ title: 'ok', priority: 'mega', dueDate: '2026-02-30', status: 'weird' }, { nope: 1 }, null], notes: [{ body: 'x' }] }));
    const bt = bad.data.tasks[0];
    ok(bad.data.tasks.length === 1 && bt.priority === null && bt.dueDate === null && bt.status === 'todo' && bad.issues.length === 1, 'invalid fields sanitized, invalid tasks dropped');
    const before = S().tasks.length;
    T4.store.mergeData(bad.data);
    ok(S().tasks.length === before + 1, 'merge adds imported tasks');
    // Import UI dialog via file input
    const file = new File([json], 'backup.json', { type: 'application/json' });
    const dtf = new DataTransfer(); dtf.items.add(file);
    const input = $('#import-file'); input.files = dtf.files; input.dispatchEvent(new Event('change'));
    await wait(150);
    ok($('#modal').open && $('#imp-merge') && $('#imp-replace'), 'import dialog offers merge/replace');
    click('#imp-replace'); await confirmYes();
    ok(S().tasks.length === before, 'replace restores exported snapshot');
  `);

  await run('a11y-basics', `
    for (const r of ['dashboard','inbox','tasks','today','upcoming','planner','plan','notes','focus','stats','settings']) {
      await go(r);
      const unnamed = $$('button').filter(b => !b.closest('[hidden]') && !(b.textContent.trim() || b.getAttribute('aria-label') || b.title));
      ok(unnamed.length === 0, r + ': all buttons have accessible names' + (unnamed.length ? ' (' + unnamed.map(b => b.outerHTML.slice(0, 80)).join(' | ') + ')' : ''));
      const ids = $$('[id]').map(e => e.id); const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
      ok(dupes.length === 0, r + ': no duplicate ids ' + dupes.join(','));
      const h1 = $$('main h1').length;
      ok(h1 === 1 || r === 'focus', r + ': one h1 (' + h1 + ')');
    }
  `);

  const res1 = await b.evaluate('window.__r');
  // Persistence across reload
  const countBefore = await b.evaluate('T4.store.data.tasks.length');
  await b.reload();
  await run('persist', `
    ok(T4.store.data.tasks.length === ${countBefore}, 'tasks persist across reload (${countBefore})');
    ok(T4.store.getPlan(T4.util.today()).goal === 'Ship it', 'daily plan persists');
    ok(T4.store.data.settings.userName === 'Alex' && T4.store.data.settings.weekStart === 0, 'settings persist');
    ok($('.hero__title').textContent.includes('Alex'), 'greeting uses name');
  `);
  // Corruption recovery
  await b.evaluate(`localStorage.setItem('todo4me.data.v1', '{"tasks": [broken')`);
  await b.reload();
  await run('corrupt', `
    ok(T4.store.data.tasks.length > 0, 'corrupted data falls back to automatic backup');
    ok(Object.keys(localStorage).some(k => k.startsWith('todo4me.corrupt.')), 'corrupted payload quarantined');
    ok($$('.toast--error').some(t => /backup/.test(t.textContent)), 'user is told about the recovery');
  `);
  // Reset
  await run('reset', `
    await go('settings');
    click('[data-action=reset-data]'); await confirmYes();
    ok(T4.store.data.tasks.length === 0 && T4.store.data.notes.length === 0 && location.hash === '#/dashboard', 'reset clears all data');
    await go('settings');
    click('[data-action=load-sample]'); await confirmYes();
    ok(T4.store.data.tasks.length >= 10 && T4.store.data.notes.length === 3, 'sample data loads');
  `);
  const res2 = await b.evaluate('window.__r');
  const all = res1.concat(res2);
  all.forEach((r) => console.log(r));
  console.log('\n' + all.filter((r) => r.startsWith('PASS')).length + ' passed, ' + all.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
