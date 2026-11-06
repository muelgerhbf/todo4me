// Functional tests driven through the real DOM.
import calendarChecks from './functional-calendar.mjs';
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
    ok($$('#nav .nav__link').length === 12, 'sidebar has 12 nav links (11 original + Editor)');
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
    const p = T4.tasks.parseQuickAdd('Belege sortieren #büro #einkäufe');
    ok(p.title === 'Belege sortieren' && p.tags.join() === 'büro,einkäufe', 'quick-add: tags with umlauts (#büro) are recognized: ' + JSON.stringify(p));
    const p2 = T4.tasks.parseQuickAdd('Report @month @satire @fri');
    ok(p2.title === 'Report @month @satire' && !!p2.dueDate, 'quick-add: only real day names are dates (@fri yes, @month/@satire no): ' + JSON.stringify(p2));
    const p3 = T4.tasks.parseQuickAdd('Call @thurs');
    ok(p3.title === 'Call' && p3.dueDate > T4.util.today(), 'quick-add: day-name prefixes like @thurs still work');
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
    // Due on the 31st, several months overdue: the next date must be the last day of its month
    // (short months in between must not drag it to the 28th for good).
    const lastDay = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7), 0).getDate();
    const m = T4.recur.next('monthly', { due: '2026-01-31' });
    ok(m > T4.util.today() && +m.slice(8) === Math.min(31, lastDay(m)), 'monthly catch-up from Jan 31 keeps the 31st (or the last day of a short month): ' + m);
    ok(T4.recur.next('monthly', { due: '2026-01-15' }).endsWith('-15'), 'monthly keeps the 15th');
    ok(T4.recur.next('weekly', { due: T4.util.addDays(T4.util.today(), -10) }) > T4.util.today(), 'overdue weekly jumps to the future');
  `);

  // ---- Flexible recurrence (2.2.0): engine T4.recur, legacy strings, store integration ----
  await run('recurrence-engine', `
    const R = T4.recur, n = (o) => JSON.stringify(R.normalize(o));
    const nx = (rule, due, done, today) => R.next(rule, { due, done, today });
    const day = (d) => ({ unit: 'day', every: d, from: 'due' });
    // --- normalize: legacy strings, objects, invalid input
    ok(n('daily') === JSON.stringify({ unit: 'day', every: 1, from: 'due' }), 'normalize: legacy "daily"');
    ok(n('weekly') === JSON.stringify({ unit: 'week', every: 1, from: 'due' }) && n('monthly') === JSON.stringify({ unit: 'month', every: 1, from: 'due' }), 'normalize: legacy "weekly" / "monthly"');
    ok(R.normalize(null) === null && R.normalize('') === null && R.normalize('yearly') === null && R.normalize(5) === null && R.normalize({}) === null && R.normalize({ unit: 'hour' }) === null && R.normalize([]) === null, 'normalize: invalid values give null');
    ok(R.normalize({ unit: 'day', every: 500 }).every === 99 && R.normalize({ unit: 'day', every: 0 }).every === 1 && R.normalize({ unit: 'day', every: '3' }).every === 3 && R.normalize({ unit: 'day' }).every === 1 && R.normalize({ unit: 'day', every: 'x' }) === null, 'normalize: every clamped to 1..99, missing = 1');
    ok(JSON.stringify(R.normalize({ unit: 'week', every: 1, weekdays: [5, 1, 1, 9, -1, 'x', 3] }).weekdays) === '[1,3,5]', 'normalize: weekdays sorted, unique, 0..6 only');
    ok(R.normalize({ unit: 'week', weekdays: [] }).weekdays === undefined && R.normalize({ unit: 'day', weekdays: [1], monthDay: 5 }).weekdays === undefined && R.normalize({ unit: 'day', monthDay: 5 }).monthDay === undefined, 'normalize: weekdays / monthDay only for their unit, empty weekdays dropped');
    ok(R.normalize({ unit: 'month', monthDay: 31 }).monthDay === 31 && R.normalize({ unit: 'month', monthDay: -1 }).monthDay === -1 && R.normalize({ unit: 'month', monthDay: 32 }).monthDay === undefined && R.normalize({ unit: 'month', monthDay: 0 }).monthDay === undefined, 'normalize: monthDay 1..31 or -1');
    ok(R.normalize({ unit: 'day', from: 'done' }).from === 'done' && R.normalize({ unit: 'day', from: 'whenever' }).from === 'due', 'normalize: from defaults to due');
    ok(R.equals('daily', { unit: 'day', every: 1 }) && !R.equals('daily', 'weekly') && R.equals(null, undefined) && !R.equals(null, 'daily'), 'equals');
    // --- next: day / week / month / year
    ok(nx(day(1), '2030-05-10', null, '2030-05-10') === '2030-05-11', 'day: due today, next is tomorrow');
    ok(nx(day(3), '2030-05-10', null, '2030-05-10') === '2030-05-13', 'day: every 3 days');
    ok(nx(day(3), '2030-05-01', null, '2030-05-10') === '2030-05-13', 'day: overdue every 3 days stays on the 3-day grid (1,4,7,10,13)');
    ok(nx(day(1), '2030-05-20', null, '2030-05-10') === '2030-05-21', 'day: due in the future, one step after the due date');
    ok(nx('weekly', '2030-05-10', null, '2030-05-10') === '2030-05-17' && nx('weekly', '2030-04-01', null, '2030-05-10') === '2030-05-13', 'week: plain weekly keeps the weekday, overdue jumps forward');
    ok(nx({ unit: 'week', every: 2 }, '2030-05-10', null, '2030-05-10') === '2030-05-24', 'week: every 2 weeks');
    ok(nx({ unit: 'month', every: 2 }, '2030-01-31', null, '2030-01-31') === '2030-03-31' && nx({ unit: 'month', every: 3 }, '2030-01-15', null, '2030-01-15') === '2030-04-15', 'month: every 2 / 3 months');
    ok(nx('monthly', '2030-01-31', null, '2030-01-31') === '2030-02-28' && nx('monthly', '2030-01-31', null, '2030-02-28') === '2030-03-31', 'month: Jan 31 to Feb 28 to Mar 31 (no drift)');
    ok(nx('monthly', '2030-01-31', null, '2030-06-10') === '2030-06-30' && nx('monthly', '2030-01-31', null, '2030-06-30') === '2030-07-31', 'month: overdue from Jan 31 keeps the 31st / last day');
    ok(nx({ unit: 'year', every: 1 }, '2030-03-15', null, '2030-03-15') === '2031-03-15' && nx({ unit: 'year', every: 2 }, '2030-03-15', null, '2030-03-15') === '2032-03-15', 'year: every 1 / 2 years');
    ok(nx({ unit: 'year', every: 1 }, '2028-02-29', null, '2028-02-29') === '2029-02-28', 'year: Feb 29 becomes Feb 28 in a non-leap year');
    ok(nx({ unit: 'year', every: 1 }, '2028-02-29', null, '2031-06-01') === '2032-02-29', 'year: Feb 29 comes back in the next leap year (no drift)');
    ok(nx({ unit: 'year', every: 1 }, '2020-06-01', null, '2030-03-01') === '2030-06-01', 'year: long overdue lands on the next future occurrence');
    // --- weekdays (2030-05-08 is a Wednesday, 05-10 a Friday, 05-13 a Monday)
    const wd = [1, 2, 3, 4, 5];
    ok(nx({ unit: 'week', every: 1, weekdays: wd }, '2030-05-10', null, '2030-05-10') === '2030-05-13', 'every weekday: Friday to Monday');
    ok(nx({ unit: 'week', every: 1, weekdays: wd }, '2030-05-08', null, '2030-05-08') === '2030-05-09', 'every weekday: Wednesday to Thursday');
    ok(nx({ unit: 'week', every: 1, weekdays: [1, 3] }, '2030-05-08', null, '2030-05-08') === '2030-05-13' && nx({ unit: 'week', every: 1, weekdays: [1, 3] }, '2030-05-13', null, '2030-05-13') === '2030-05-15', 'weekly on Mon, Wed: Wed to Mon to Wed');
    ok(nx({ unit: 'week', every: 1, weekdays: [0] }, '2030-05-08', null, '2030-05-08') === '2030-05-12', 'weekdays: Sunday is the last day of the Monday-based week');
    ok(nx({ unit: 'week', every: 2, weekdays: [1, 3] }, '2030-05-08', null, '2030-05-08') === '2030-05-20', 'every 2 weeks on Mon, Wed from a Wednesday: skips next week, Monday two weeks on');
    ok(nx({ unit: 'week', every: 2, weekdays: [1, 3] }, '2030-05-20', null, '2030-05-20') === '2030-05-22' && nx({ unit: 'week', every: 2, weekdays: [1, 3] }, '2030-05-22', null, '2030-05-22') === '2030-06-03', 'every 2 weeks on Mon, Wed: Mon, Wed, then Mon two weeks later');
    ok(nx({ unit: 'week', every: 2, weekdays: [5] }, '2030-05-10', null, '2030-05-10') === '2030-05-24', 'every 2 weeks on Friday');
    {
      const c = nx({ unit: 'week', every: 2, weekdays: [1, 3] }, '2030-05-08', null, '2030-07-01');
      const weeks = T4.util.diffDays(T4.util.startOfWeek('2030-05-08', 1), T4.util.startOfWeek(c, 1)) / 7;
      ok(c > '2030-07-01' && weeks % 2 === 0 && [1, 3].includes(T4.util.parseDate(c).getDay()), 'every 2 weeks, overdue: future date on the 2-week grid: ' + c);
    }
    // --- monthDay
    const md = (d, ev) => ({ unit: 'month', every: ev || 1, monthDay: d });
    ok(nx(md(15), '2030-01-10', null, '2030-01-10') === '2030-01-15', 'monthDay 15, due on the 10th: this month on the 15th');
    ok(nx(md(15), '2030-01-15', null, '2030-01-15') === '2030-02-15' && nx(md(15), '2030-01-20', null, '2030-01-20') === '2030-02-15', 'monthDay 15: after the 15th, next month');
    ok(nx(md(31), '2030-03-31', null, '2030-03-31') === '2030-04-30', 'monthDay 31 in April gives the 30th');
    ok(nx(md(31), '2030-01-31', null, '2030-01-31') === '2030-02-28' && nx(md(31), '2030-02-28', null, '2030-02-28') === '2030-03-31', 'monthDay 31: Feb 28, then back to the 31st');
    ok(nx(md(-1), '2030-01-31', null, '2030-01-31') === '2030-02-28' && nx(md(-1), '2030-02-28', null, '2030-02-28') === '2030-03-31' && nx(md(-1), '2028-02-10', null, '2028-02-10') === '2028-02-29', 'monthDay -1 = last day (incl. leap year)');
    ok(nx(md(15, 2), '2030-01-15', null, '2030-01-15') === '2030-03-15', 'monthDay 15 every 2 months');
    // --- from 'done'
    const dn = (u, ev) => ({ unit: u, every: ev || 1, from: 'done' });
    ok(nx(dn('day', 3), '2030-05-01', '2030-05-10', '2030-05-10') === '2030-05-13', "from 'done': counted from the completion day, not the due date");
    ok(nx(dn('day', 3), '2030-05-10', '2030-05-14', '2030-05-14') === '2030-05-17', "from 'done': completed 4 days after the due date, completion + 3 days");
    ok(nx(dn('week'), '2030-05-01', '2030-05-10', '2030-05-10') === '2030-05-17', "from 'done': weekly after completion");
    ok(nx(dn('month'), '2030-01-01', '2030-01-31', '2030-01-31') === '2030-02-28', "from 'done': monthly after completion on Jan 31 gives Feb 28");
    ok(nx(dn('year'), '2029-01-01', '2030-03-05', '2030-03-05') === '2031-03-05', "from 'done': yearly after completion");
    ok(nx({ unit: 'week', every: 1, weekdays: [1], from: 'done' }, '2030-05-01', '2030-05-10', '2030-05-10') === '2030-05-13', "from 'done' + weekday: next Monday after completion");
    ok(nx(dn('day', 2), '2030-05-10', '2030-05-10', '2030-05-10') === '2030-05-12', "from 'done': completed on the due date");
    // --- describe / presets
    const dsc = (o, s) => R.describe(o, { short: s });
    ok(dsc('daily') === 'Daily' && dsc(day(3)) === 'Every 3 days' && dsc('weekly') === 'Weekly' && dsc('monthly') === 'Monthly' && dsc({ unit: 'year' }) === 'Yearly', 'describe: basics');
    ok(dsc({ unit: 'week', weekdays: wd }) === 'Every weekday' && dsc({ unit: 'week', weekdays: [3, 1] }) === 'Weekly on Mon, Wed' && dsc({ unit: 'week', every: 2, weekdays: [5] }) === 'Every 2 weeks on Fri', 'describe: weekdays');
    ok(dsc(md(15)) === 'Monthly on the 15th' && dsc(md(-1)) === 'Monthly on the last day' && dsc(md(1)) === 'Monthly on the 1st' && dsc(md(22)) === 'Monthly on the 22nd' && dsc(md(23)) === 'Monthly on the 23rd' && dsc(md(11)) === 'Monthly on the 11th', 'describe: month days / ordinals');
    ok(dsc(dn('day')) === 'Daily after completion' && dsc(dn('week', 2)) === 'Every 2 weeks after completion', 'describe: after completion');
    ok(dsc({ unit: 'week', every: 2 }, true) === 'Every 2 wks' && dsc({ unit: 'week', weekdays: wd }, true) === 'Weekdays' && dsc('daily', true) === 'Daily' && dsc(null) === '', 'describe: short chip text');
    const pr = R.presets('2030-05-08');
    ok(pr.map((p) => p.id).join() === 'daily,weekdays,weekly,biweekly,monthly,yearly' && pr.find((p) => p.id === 'weekly').label === 'Weekly on Wednesday' && pr.find((p) => p.id === 'monthly').label === 'Monthly on the 8th' && pr.find((p) => p.id === 'yearly').label === 'Yearly on May 8', 'presets: labels follow the due date');
    ok(R.presets('2030-04-30').some((p) => p.id === 'monthly-last' && p.rule.monthDay === -1) && !pr.some((p) => p.id === 'monthly-last'), 'presets: "last day" only when the due date is the last day');
    ok(pr.every((p) => R.equals(p.rule, R.normalize(p.rule))) && R.presets(null).length >= 6, 'presets: rules are normalized, no due date means today');
    // --- storage: legacy strings and old backups
    const lg = T4.storage.sanitize({ version: 1, tasks: [
      { id: 'a1', title: 'Old weekly', recurrence: 'weekly', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
      { id: 'a2', title: 'Old garbage', recurrence: 'hourly' },
      { id: 'a3', title: 'New rule', recurrence: { unit: 'week', every: 2, weekdays: [3, 1] } },
      { id: 'a4', title: 'None' }] }).data.tasks;
    const rec = (id) => lg.find((x) => x.id === id).recurrence;
    ok(JSON.stringify(rec('a1')) === JSON.stringify({ unit: 'week', every: 1, from: 'due' }) && rec('a2') === null && rec('a4') === null && JSON.stringify(rec('a3').weekdays) === '[1,3]', 'sanitize: legacy strings become rules, garbage / missing become null');
    // old JSON backup (2.1 format with string values) through sanitize and through the real import path
    const old = { version: 1, tasks: [{ id: 'imp_old1', title: 'Imported weekly (2.1)', dueDate: '2030-05-10', recurrence: 'weekly', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }], categories: [], notes: [], dailyPlans: {}, settings: {}, stats: { completions: {}, focusSessions: {} }, meta: {} };
    const impTask = T4.storage.sanitize(JSON.parse(JSON.stringify(old))).data.tasks[0];
    ok(impTask && impTask.recurrence && impTask.recurrence.unit === 'week' && impTask.recurrence.every === 1, 'old JSON backup with "weekly" sanitizes to a rule object');
    const before = S().tasks.length;
    T4.store.mergeData(T4.storage.parseImport(JSON.stringify(old)).data); // same path as Settings → Import → Merge
    const imported = S().tasks.find((x) => x.id === 'imp_old1');
    if (imported) {
      ok(imported.recurrence && imported.recurrence.unit === 'week', 'import (merge) of an old backup: recurrence becomes a rule object');
      T4.store.deleteTask('imp_old1');
    }
    ok(S().tasks.length === before, 'recurrence import: no leftovers');
    const viaAdd = T4.store.addTask({ title: 'Legacy via addTask', dueDate: '2030-05-10', recurrence: 'monthly' });
    ok(viaAdd && viaAdd.recurrence && viaAdd.recurrence.unit === 'month', 'addTask with a legacy string stores a rule object');
    T4.store.deleteTask(viaAdd.id);
  `);

  await run('recurrence-store', `
    const D0 = T4.util.today();
    const done = (id) => { T4.store.toggleComplete(id); const t = T4.store.getTask(id); return T4.store.getTask(t.nextOccurrenceId); };
    const dow = (s) => T4.util.parseDate(s).getDay();
    // weekdays rule through the store
    const a = T4.store.addTask({ title: 'Rule: every weekday', dueDate: D0, recurrence: { unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] } });
    const na = done(a.id);
    ok(na && na.dueDate > D0 && dow(na.dueDate) >= 1 && dow(na.dueDate) <= 5, 'store: every weekday, next occurrence is a weekday after today: ' + (na && na.dueDate));
    ok(na && na.recurrence && na.recurrence.unit === 'week' && na.recurrence.weekdays.length === 5, 'store: the next occurrence keeps the rule');
    // legacy string completes like before
    const b = T4.store.addTask({ title: 'Rule: legacy weekly', dueDate: D0, recurrence: 'weekly' });
    ok(done(b.id).dueDate === T4.util.addDays(D0, 7), 'store: legacy "weekly" gives +7 days');
    // from 'done': a task due 6 days ago, completed today, counts from today
    const c = T4.store.addTask({ title: 'Rule: after done', dueDate: T4.util.addDays(D0, -6), recurrence: { unit: 'day', every: 3, from: 'done' } });
    ok(done(c.id).dueDate === T4.util.addDays(D0, 3), "store: from 'done' counts from the completion day (today + 3)");
    // from 'due': the same overdue task stays on its grid (-6, -3, 0, +3)
    const d = T4.store.addTask({ title: 'Rule: from due', dueDate: T4.util.addDays(D0, -6), recurrence: { unit: 'day', every: 3, from: 'due' } });
    ok(done(d.id).dueDate === T4.util.addDays(D0, 3), "store: from 'due', overdue by 6 days, every 3 gives today + 3 (grid)");
    // no due date: base is today
    const e = T4.store.addTask({ title: 'Rule: no due date', recurrence: { unit: 'month', every: 1, monthDay: -1 } });
    const ne = done(e.id);
    ok(ne && ne.dueDate > D0 && T4.util.addDays(ne.dueDate, 1).endsWith('-01'), 'store: no due date, last day of the month gives a future last day: ' + (ne && ne.dueDate));
    // reopen + complete does not duplicate
    T4.store.toggleComplete(a.id); T4.store.toggleComplete(a.id);
    ok(S().tasks.filter((x) => x.title === 'Rule: every weekday').length === 2, 'store: reopen + complete does not duplicate (rule object)');
    // reminders on the next occurrence of a rule-based task
    const R = T4.reminders;
    const r = T4.store.addTask({ title: 'Rule: reminder', dueDate: D0, dueTime: '08:00', reminder: 30, recurrence: { unit: 'week', every: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] } });
    const nr = done(r.id);
    const fireAt = R.fireAt(nr, S().settings);
    ok(nr && nr.dueDate === T4.util.addDays(D0, 1) && nr.reminder === 30 && nr.reminderFired === null, 'reminder: rule-based next occurrence keeps the offset');
    ok(R.check({ now: new Date(+fireAt - 60000) }).fired.length === 0 && R.check({ now: fireAt }).fired.join() === nr.id, 'reminder: rule-based next occurrence fires on its own date');
    // editor: existing rules are shown and survive a save
    const x = T4.store.addTask({ title: 'Rule: editor', dueDate: D0, recurrence: { unit: 'week', every: 2, weekdays: [1, 3] } });
    T4.tasks.openEditor(T4.store.getTask(x.id)); await wait(40);
    ok($('#tf-recur').value === 'custom' && $('#tf-r-preview').textContent === 'Every 2 weeks on Mon, Wed', 'editor: a non-preset rule opens as Custom with its preview');
    $('#tf-title').value = 'Rule: editor 2'; $('#task-form').requestSubmit(); await wait(50);
    const x2 = T4.store.getTask(x.id);
    ok(x2.title === 'Rule: editor 2' && x2.recurrence.every === 2 && x2.recurrence.weekdays.join() === '1,3', 'editor: saving keeps the custom rule');
    T4.tasks.openEditor(x2); await wait(40);
    $('#tf-recur').value = 'monthly'; $('#task-form').requestSubmit(); await wait(50);
    ok(T4.store.getTask(x.id).recurrence.unit === 'month' && typeof T4.store.getTask(x.id).recurrence === 'object', 'editor: choosing Monthly saves a rule object');
    T4.tasks.openEditor(T4.store.getTask(x.id)); await wait(40);
    ok($('#tf-recur').value === 'monthly', 'editor: a basic rule selects the matching preset');
    $('#tf-recur').value = ''; $('#task-form').requestSubmit(); await wait(50);
    ok(T4.store.getTask(x.id).recurrence === null, 'editor: Does not repeat clears the rule');
    S().tasks.filter((t) => t.title.startsWith('Rule:')).forEach((t) => T4.store.deleteTask(t.id));
  `);

  // ---- Flexible recurrence (2.2.0 part 2): Repeat field of the task editor ----
  await run('recurrence-editor', `
    const U = T4.util, DUE = '2030-05-15'; // a Wednesday
    const dowOf = (d) => U.parseDate(d).getDay();
    const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const open = async (t, defaults) => { T4.tasks.openEditor(t || null, defaults); await wait(40); };
    const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
    const pick = (v) => { const s = $('#tf-recur'); s.value = v; fire(s); };
    const setDate = (d) => { $('#tf-date').value = d; fire($('#tf-date')); };
    const labels = () => $$('#tf-recur option').map((o) => o.textContent);
    const days = () => $$('#tf-r-week [data-wd]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent).join();
    const save = async () => { $('#task-form').requestSubmit(); await wait(50); };
    const find = (title) => S().tasks.find((x) => x.title === title);

    // --- new task: options, presets follow the due date, Custom hidden by default
    await open(null, { dueDate: DUE });
    ok($('#tf-recur').value === '' && $('#tf-recur').options[0].textContent === 'Does not repeat', 'repeat: new task defaults to Does not repeat');
    ok($('#tf-recur-custom').hidden, 'repeat: custom controls hidden by default');
    ok(labels().includes('Daily') && labels().includes('Every weekday') && labels().includes('Weekly on Wednesday') && labels().includes('Every 2 weeks on Wednesday') &&
       labels().includes('Monthly on the 15th') && labels().includes('Yearly on May 15') && labels().pop() === 'Custom…', 'repeat: presets labelled from the due date: ' + labels().join(' | '));
    ok(!labels().includes('Monthly on the last day'), 'repeat: no last-day preset on a mid-month date');
    pick('weekly');
    setDate('2030-05-17'); // Friday
    ok($('#tf-recur').value === 'weekly' && $('#tf-recur').selectedOptions[0].textContent === 'Weekly on Friday', 'repeat: changing the due date relabels the preset and keeps the selection');
    ok(labels().includes('Monthly on the 17th') && labels().includes('Yearly on May 17'), 'repeat: other labels follow the due date');
    setDate('2030-05-31');
    ok(labels().includes('Monthly on the last day') && labels().includes('Monthly on the 31st'), 'repeat: last-day preset appears on the last day of the month');
    pick('monthly-last'); setDate('2030-05-30');
    ok($('#tf-recur').value === 'custom' && !$('#tf-recur-custom').hidden && $('#tf-r-preview').textContent === 'Monthly on the last day', 'repeat: a vanished preset turns into Custom with the same rule');
    setDate(DUE); pick('');
    $('#tf-title').value = 'Rep: none'; await save();
    ok(find('Rep: none').recurrence === null, 'repeat: Does not repeat saves null');

    // --- presets save the rule
    await open(null, { dueDate: DUE });
    pick('weekdays'); $('#tf-title').value = 'Rep: weekdays'; await save();
    const rw = find('Rep: weekdays').recurrence;
    ok(rw.unit === 'week' && rw.weekdays.join() === '1,2,3,4,5' && rw.every === 1, 'repeat: Every weekday preset saves weekdays 1-5');
    await open(null, { dueDate: DUE });
    pick('biweekly'); $('#tf-title').value = 'Rep: biweekly'; await save();
    const rb = find('Rep: biweekly').recurrence;
    ok(rb.every === 2 && rb.weekdays.join() === '3', 'repeat: every 2 weeks preset uses the weekday of the due date');
    await open(find('Rep: biweekly'));
    ok($('#tf-recur').value === 'biweekly' && $('#tf-recur-custom').hidden, 'repeat: reopening selects the matching preset');
    T4.ui.closeModal();

    // --- Custom: weekdays + interval
    await open(null, { dueDate: DUE });
    pick('custom');
    ok(!$('#tf-recur-custom').hidden && $('#tf-r-unit').value === 'week' && $('#tf-r-every').value === '1', 'custom: panel opens (weekly, every 1)');
    ok(days() === 'Wed' && !$('#tf-r-week').hidden && $('#tf-r-month').hidden, 'custom: weekday toggles default to the weekday of the due date');
    ok($$('#tf-r-week [data-wd]').map((b) => b.textContent).join() === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'custom: weekday toggles run Monday to Sunday');
    $('#tf-r-every').value = '2'; fire($('#tf-r-every'), 'input');
    click('#tf-r-week [data-wd="1"]');
    ok(days() === 'Mon,Wed' && $('#tf-r-week [data-wd="1"]').getAttribute('aria-pressed') === 'true', 'custom: clicking a weekday toggles aria-pressed');
    ok($('#tf-r-preview').textContent === 'Every 2 weeks on Mon, Wed', 'custom: live preview: ' + $('#tf-r-preview').textContent);
    click('#tf-r-week [data-wd="1"]'); click('#tf-r-week [data-wd="3"]');
    ok(days() === 'Wed', 'custom: the last weekday cannot be switched off');
    click('#tf-r-week [data-wd="1"]');
    $('#tf-title').value = 'Rep: custom week'; await save();
    const rc = find('Rep: custom week').recurrence;
    ok(rc.unit === 'week' && rc.every === 2 && rc.weekdays.join() === '1,3' && rc.from === 'due', 'custom: saved rule {week, every 2, Mon+Wed}: ' + JSON.stringify(rc));
    await open(find('Rep: custom week'));
    ok($('#tf-recur').value === 'custom' && days() === 'Mon,Wed' && $('#tf-r-every').value === '2' && $('#tf-r-preview').textContent === 'Every 2 weeks on Mon, Wed', 'custom: reopening shows Custom with prefilled controls');
    T4.ui.closeModal();

    // --- Custom: months and day, years, days, after completion
    await open(null, { dueDate: DUE });
    pick('custom'); $('#tf-r-unit').value = 'month'; fire($('#tf-r-unit'));
    ok(!$('#tf-r-month').hidden && $('#tf-r-week').hidden && $('#tf-r-monthday').value === '15', 'custom: months show "On day", default = day of the due date');
    $('#tf-r-monthday').value = '-1'; fire($('#tf-r-monthday'));
    ok($('#tf-r-preview').textContent === 'Monthly on the last day', 'custom: last day preview');
    $('#tf-r-monthday').value = '31'; fire($('#tf-r-monthday'));
    $('#tf-r-every').value = '3'; fire($('#tf-r-every'), 'input');
    $('#tf-r-done').checked = true; fire($('#tf-r-done'));
    ok($('#tf-r-preview').textContent === 'Every 3 months on the 31st after completion', 'custom: preview with interval, day and completion: ' + $('#tf-r-preview').textContent);
    $('#tf-title').value = 'Rep: custom month'; await save();
    const rm = find('Rep: custom month').recurrence;
    ok(rm.unit === 'month' && rm.every === 3 && rm.monthDay === 31 && rm.from === 'done', 'custom: saved month rule with from:done: ' + JSON.stringify(rm));
    await open(find('Rep: custom month'));
    ok($('#tf-recur').value === 'custom' && $('#tf-r-done').checked && $('#tf-r-monthday').value === '31', 'custom: month rule reopens as Custom');
    $('#tf-r-unit').value = 'day'; fire($('#tf-r-unit'));
    ok($('#tf-r-week').hidden && $('#tf-r-month').hidden && $('#tf-r-preview').textContent === 'Every 3 days after completion', 'custom: days hide the weekday and month controls');
    $('#tf-r-every').value = '500'; fire($('#tf-r-every'), 'input'); fire($('#tf-r-every'));
    ok($('#tf-r-every').value === '99', 'custom: interval is clamped to 99');
    $('#tf-r-unit').value = 'year'; fire($('#tf-r-unit'));
    ok($('#tf-r-preview').textContent === 'Every 99 years after completion', 'custom: years preview');
    T4.ui.closeModal();

    // --- selecting Custom from a preset starts from that preset
    await open(null, { dueDate: DUE });
    pick('weekdays'); pick('custom');
    ok(days() === 'Mon,Tue,Wed,Thu,Fri' && $('#tf-r-preview').textContent === 'Every weekday', 'custom: starts from the previously selected preset');
    T4.ui.closeModal();

    // --- legacy and non-preset rules
    const lw = T4.store.addTask({ title: 'Rep: legacy weekly', dueDate: DUE, recurrence: 'weekly' });
    await open(T4.store.getTask(lw.id));
    ok($('#tf-recur').value === 'weekly' && $('#tf-recur').selectedOptions[0].textContent === 'Weekly on Wednesday', 'legacy "weekly" selects "Weekly on <weekday of the due date>"');
    T4.ui.closeModal();
    const lm = T4.store.addTask({ title: 'Rep: legacy monthly', dueDate: DUE, recurrence: 'monthly' });
    await open(T4.store.getTask(lm.id));
    ok($('#tf-recur').value === 'monthly' && $('#tf-recur').selectedOptions[0].textContent === 'Monthly on the 15th', 'legacy "monthly" selects "Monthly on the <day>"');
    $('#tf-title').value = 'Rep: legacy monthly 2'; await save();
    const lmr = T4.store.getTask(lm.id).recurrence;
    ok(lmr.unit === 'month' && lmr.monthDay === 15 && lmr.every === 1, 'legacy monthly is saved as an explicit rule');
    const ld = T4.store.addTask({ title: 'Rep: legacy daily', dueDate: DUE, recurrence: 'daily' });
    await open(T4.store.getTask(ld.id));
    ok($('#tf-recur').value === 'daily', 'legacy "daily" selects Daily');
    T4.ui.closeModal();
    const dn = T4.store.addTask({ title: 'Rep: daily after done', dueDate: DUE, recurrence: { unit: 'day', every: 1, from: 'done' } });
    await open(T4.store.getTask(dn.id));
    ok($('#tf-recur').value === 'custom' && $('#tf-r-done').checked, 'a preset-like rule counted from completion opens as Custom');
    T4.ui.closeModal();
    const ev = T4.store.addTask({ title: 'Rep: monthly other day', dueDate: DUE, recurrence: { unit: 'month', every: 1, monthDay: 3 } });
    await open(T4.store.getTask(ev.id));
    ok($('#tf-recur').value === 'custom' && $('#tf-r-monthday').value === '3', 'monthly on a different day than the due date opens as Custom');
    T4.ui.closeModal();

    // --- keyboard / a11y
    await open(null, { dueDate: DUE });
    pick('custom');
    ok(!!$('label[for=tf-recur]') && !!$('label[for=tf-r-every]') && $('#tf-r-unit').getAttribute('aria-label') && $$('#tf-r-week button').every((b) => b.type === 'button' && b.hasAttribute('aria-pressed') && b.getAttribute('aria-label')), 'a11y: labelled controls, weekday toggles are real buttons with aria-pressed');
    ok($('#tf-r-preview').getAttribute('aria-live') === 'polite', 'a11y: preview is a live region');
    T4.ui.closeModal();

    // --- no due date: recurrence sets one
    const today = U.today();
    await open(null, {}); $('#tf-date').value = ''; fire($('#tf-date'));
    $('#tf-title').value = 'Rep: no date daily'; pick('daily'); await save();
    ok(find('Rep: no date daily').dueDate === today, 'no due date + Daily: due today');
    await open(null, {}); $('#tf-date').value = ''; fire($('#tf-date'));
    pick('custom'); $('#tf-r-unit').value = 'week'; fire($('#tf-r-unit'));
    const target = (dowOf(today) + 2) % 7;
    click('#tf-r-week [data-wd="' + target + '"]');
    click('#tf-r-week [data-wd="' + dowOf(today) + '"]');
    $('#tf-title').value = 'Rep: no date weekday'; await save();
    const nd = find('Rep: no date weekday').dueDate;
    ok(nd === U.addDays(today, 2) && dowOf(nd) === target, 'no due date + weekly on a weekday: first matching day >= today (' + nd + ')');
    await open(null, {}); $('#tf-date').value = ''; fire($('#tf-date'));
    pick('custom'); $('#tf-r-unit').value = 'month'; fire($('#tf-r-unit'));
    $('#tf-r-monthday').value = '-1'; fire($('#tf-r-monthday'));
    $('#tf-title').value = 'Rep: no date last day'; await save();
    const td = U.parseDate(today), lastDay = U.toDateStr(new Date(td.getFullYear(), td.getMonth() + 1, 0));
    ok(find('Rep: no date last day').dueDate === lastDay, 'no due date + monthly on the last day: due ' + lastDay);

    S().tasks.filter((x) => x.title.startsWith('Rep:')).forEach((x) => T4.store.deleteTask(x.id));
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

  await run('reminders-data', `
    // Old data / old exports (no reminder fields, no reminderTime) load unchanged.
    const old = { app: 'todo4me', version: 1, tasks: [{ id: 'task_old1', title: 'Old task', status: 'todo', priority: 'high', dueDate: '2030-03-10', dueTime: '10:00', tags: ['a'], createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.000Z' }],
      notes: [], settings: { theme: 'dark', weekStart: 0 } };
    const p = T4.storage.parseImport(JSON.stringify(old));
    const ot = p.data.tasks[0];
    ok(p.issues.length === 0 && ot.title === 'Old task' && ot.priority === 'high' && ot.dueTime === '10:00' && ot.updatedAt === old.tasks[0].updatedAt && ot.tags.join() === 'a', 'old export without reminder fields loads unchanged');
    ok(ot.reminder === null && ot.reminderFired === null && ot.reminderSnooze === null, 'missing reminder fields default to null (no reminder)');
    ok(p.data.settings.reminderTime === '09:00' && p.data.settings.theme === 'dark' && p.data.settings.weekStart === 0, 'missing reminderTime setting defaults to 09:00, other settings kept');
    // Sanitizing
    const s = T4.storage.parseImport(JSON.stringify({ tasks: [
      { title: 'a', dueDate: '2030-03-10', reminder: 'soon' }, { title: 'b', reminder: 15 }, { title: 'c', dueDate: '2030-03-10', reminder: -5 },
      { title: 'd', dueDate: '2030-03-10', reminder: 1e9, reminderFired: '<script>', reminderSnooze: 'tomorrow-ish' }, { title: 'e', dueDate: '2030-03-10', reminder: '30', reminderFired: '2030-03-10 10:00|30', reminderSnooze: '2030-03-10T09:40:00.000Z' }],
      settings: { reminderTime: '25:99' } })).data;
    const by = (t) => s.tasks.find((x) => x.title === t);
    ok(by('a').reminder === null && by('b').reminder === null && by('c').reminder === 0 && by('d').reminder === T4.storage.REMINDER_MAX, 'invalid reminders sanitized (no date → none, clamped to 0…4 weeks)');
    ok(by('d').reminderFired === null && by('d').reminderSnooze === null && by('e').reminder === 30 && by('e').reminderFired === '2030-03-10 10:00|30' && by('e').reminderSnooze === '2030-03-10T09:40:00.000Z', 'reminder bookkeeping validated');
    ok(s.settings.reminderTime === '09:00', 'invalid reminderTime falls back to 09:00');
    // Export → import → merge keeps reminders
    const t = T4.store.addTask({ title: 'Reminder roundtrip', dueDate: '2030-03-10', dueTime: '10:00', reminder: 15 });
    const back = T4.storage.parseImport(T4.storage.exportJSON(S())).data.tasks.find((x) => x.id === t.id);
    ok(back && back.reminder === 15, 'export → import keeps the reminder');
    T4.store.mergeData(T4.storage.parseImport(T4.storage.exportJSON(S())).data);
    ok(T4.store.getTask(t.id).reminder === 15 && S().tasks.filter((x) => x.id === t.id).length === 1, 'merge keeps the reminder (no duplicate)');
    T4.store.deleteTask(t.id);
  `);

  await run('reminders-scheduler', `
    const R = T4.reminders;
    ok(R && R.started, 'reminder scheduler started');
    R.stop();
    const sent = []; R.setNotifier((n) => sent.push(n));
    const at = (d, hh, mm) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, hh, mm); };
    const D = '2030-03-10';
    const a = T4.store.addTask({ title: 'Call the bank', dueDate: D, dueTime: '10:00', reminder: 15 });
    ok(+R.fireAt(a, S().settings) === +at(D, 9, 45), 'fire time = due time minus offset');
    ok(R.check({ now: at(D, 9, 44) }).fired.length === 0, 'not due yet → nothing');
    let res = R.check({ now: at(D, 9, 45) });
    ok(res.fired.join() === a.id && sent.length === 1 && sent[0].id === 'task:' + a.id && sent[0].title === 'Call the bank', 'due → notification for that task');
    ok(T4.store.getTask(a.id).reminderFired === D + ' 10:00|15', 'fired occurrence persisted on the task');
    ok(R.check({ now: at(D, 9, 50) }).fired.length === 0 && R.check({ now: at(D, 12, 0) }).fired.length === 0 && sent.length === 1, 'fires only once per occurrence');
    ok($$('.toast--reminder').some((el) => /Call the bank/.test(el.textContent) && /Snooze 10 min/.test(el.textContent)), 'in-app reminder toast with Snooze button');
    // Snooze via the toast button
    R.setClock(() => at(D, 9, 46));
    click($$('.toast--reminder').find((el) => /Call the bank/.test(el.textContent)).querySelectorAll('.toast__action')[1]);
    ok(T4.store.getTask(a.id).reminderSnooze === at(D, 9, 56).toISOString(), 'Snooze 10 min sets the snooze time');
    ok(R.check({ now: at(D, 9, 55) }).fired.length === 0, 'snoozed reminder waits');
    res = R.check({ now: at(D, 9, 56) });
    ok(res.fired.join() === a.id && /Snoozed/.test(res.notifications[0].body) && !T4.store.getTask(a.id).reminderSnooze, 'snoozed reminder comes back after 10 minutes');
    ok(R.check({ now: at(D, 10, 30) }).fired.length === 0, 'snoozed reminder does not repeat');
    // Rescheduling makes a new occurrence
    T4.store.updateTask(a.id, { dueDate: '2030-03-11' });
    ok(R.check({ now: at(D, 12, 0) }).fired.length === 0 && R.check({ now: at('2030-03-11', 9, 45) }).fired.join() === a.id, 'moving the due date gives a new reminder');
    // Date without a time → reminder time setting
    const b = T4.store.addTask({ title: 'Pay invoice', dueDate: D, reminder: 0 });
    ok(R.check({ now: at(D, 8, 59) }).fired.length === 0 && R.check({ now: at(D, 9, 0) }).fired.join() === b.id, 'date-only task reminds at the reminder time (09:00)');
    // Completed tasks never fire
    const c = T4.store.addTask({ title: 'Done already', dueDate: D, dueTime: '11:00', reminder: 5 });
    T4.store.toggleComplete(c.id);
    ok(R.check({ now: at(D, 11, 30) }).fired.length === 0, 'completed task never fires');
    // Recurring: the next occurrence gets its own reminder
    const r = T4.store.addTask({ title: 'Standup', dueDate: D, dueTime: '08:00', reminder: 30, recurrence: 'daily' });
    ok(R.check({ now: at(D, 7, 30) }).fired.join() === r.id, 'recurring task: first occurrence fires');
    T4.store.toggleComplete(r.id);
    const nx = T4.store.getTask(T4.store.getTask(r.id).nextOccurrenceId);
    ok(nx && nx.reminder === 30 && nx.reminderFired === null && nx.reminderSnooze === null, 'next occurrence keeps the offset, not yet fired');
    const nxAt = R.fireAt(nx, S().settings);
    ok(R.check({ now: new Date(+nxAt - 60000) }).fired.length === 0 && R.check({ now: nxAt }).fired.join() === nx.id, 'next occurrence fires on its own date');
    [a, b, c, r, nx].forEach((x) => T4.store.deleteTask(x.id));
    // Missed while closed → one summary on start
    sent.length = 0;
    const m = ['One', 'Two', 'Three'].map((tt, i) => T4.store.addTask({ title: 'Missed ' + tt, dueDate: D, dueTime: '0' + (i + 7) + ':00', reminder: 0 }));
    res = R.check({ now: at(D, 18, 0), startup: true });
    ok(res.summary && sent.length === 1 && sent[0].id === 'summary' && sent[0].title === '3 reminders missed' && /Missed One/.test(sent[0].body), 'missed reminders on start → one summary notification');
    ok(m.every((x) => T4.store.getTask(x.id).reminderFired) && R.check({ now: at(D, 18, 1) }).fired.length === 0, 'summarized reminders are marked as fired');
    m.forEach((x) => T4.store.deleteTask(x.id));
    const one = T4.store.addTask({ title: 'Single missed', dueDate: D, dueTime: '07:00', reminder: 0 });
    sent.length = 0; res = R.check({ now: at(D, 18, 0), startup: true });
    ok(!res.summary && sent.length === 1 && sent[0].id === 'task:' + one.id && /Missed while/.test(sent[0].body), 'a single missed reminder is shown on its own');
    T4.store.deleteTask(one.id);
    const many = [1, 2, 3, 4].map((i) => T4.store.addTask({ title: 'Burst ' + i, dueDate: D, dueTime: '10:00', reminder: 0 }));
    sent.length = 0; res = R.check({ now: at(D, 10, 0) });
    ok(res.summary && sent.length === 1 && sent[0].title === '4 reminders', 'many reminders at once → summary, not a flood');
    many.forEach((x) => T4.store.deleteTask(x.id));
    // Click on a notification opens the task
    const o = T4.store.addTask({ title: 'Open me from a notification', dueDate: D, dueTime: '10:00', reminder: 0 });
    R.handleClick('task:' + o.id);
    await wait(50);
    ok($('#modal').open && $('#tf-title') && $('#tf-title').value === 'Open me from a notification', 'notification click opens the task');
    T4.ui.closeModal(); await wait(30);
    T4.store.deleteTask(o.id);
    R.setClock(null); R.setNotifier(null);
    $$('.toast').forEach((el) => el.remove());
    R.start();
    ok(R.started, 'scheduler restarted');
    // Real clock: a reminder that is already due fires right away (not only on the next 30 s tick)
    const live = []; R.setNotifier((n) => live.push(n));
    const nw = new Date(), hhmm = String(nw.getHours()).padStart(2, '0') + ':' + String(nw.getMinutes()).padStart(2, '0');
    const lt = T4.store.addTask({ title: 'Due right now', dueDate: T4.util.today(), dueTime: hhmm, reminder: 0 });
    for (let i = 0; i < 30 && !live.length; i++) await wait(100);
    ok(live.length === 1 && live[0].id === 'task:' + lt.id, 'live scheduler fires a due reminder within a second');
    R.setNotifier(null); T4.store.deleteTask(lt.id); $$('.toast').forEach((el) => el.remove());
  `);

  await run('reminders-ui', `
    await go('upcoming');
    click('main [data-action=new-task]'); await wait(40);
    const sel = $('#tf-remind');
    ok(sel && sel.options.length === 7 && sel.value === '', 'task editor has a Reminder field (none + 6 options), default none');
    $('#tf-title').value = 'Dentist';
    $('#tf-date').value = '2030-03-12'; $('#tf-time').value = '14:30';
    sel.value = '60'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    ok(/Reminds you/.test($('#tf-remind-hint').textContent), 'editor shows when the reminder fires: ' + $('#tf-remind-hint').textContent);
    $('#task-form').requestSubmit(); await wait(60);
    const t = S().tasks.find((x) => x.title === 'Dentist');
    ok(t && t.reminder === 60 && t.dueTime === '14:30', 'editor saves the reminder');
    await go('tasks'); await wait(30);
    ok(!!$('.task[data-id="' + t.id + '"] .chip--reminder'), 'task row shows a reminder bell');
    click($('.task[data-id="' + t.id + '"] .task__body')); await wait(40);
    ok($('#tf-remind').value === '60', 'editing shows the saved reminder');
    $('#tf-remind').value = ''; $('#task-form').requestSubmit(); await wait(60);
    ok(T4.store.getTask(t.id).reminder === null && !$('.task[data-id="' + t.id + '"] .chip--reminder'), 'reminder can be removed');
    // No due date + reminder → due today
    click('main [data-action=new-task]'); await wait(40);
    $('#tf-title').value = 'Undated reminder'; $('#tf-remind').value = '0'; $('#task-form').requestSubmit(); await wait(60);
    const u = S().tasks.find((x) => x.title === 'Undated reminder');
    ok(u && u.dueDate === T4.util.today() && u.reminder === 0, 'reminder without a date schedules the task for today');
    T4.store.deleteTask(t.id); T4.store.deleteTask(u.id);
    $$('.toast').forEach((el) => el.remove());
    await go('settings');
    const rt = $('#set-remtime');
    ok(rt && rt.value === '09:00' && !!$('#set-notify'), 'settings: reminder time and notification status');
    rt.value = '08:30'; rt.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    ok(S().settings.reminderTime === '08:30', 'reminder time setting saved');
    $('#set-remtime').value = '09:00'; $('#set-remtime').dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    if (!window.todo4meDesktop) {
      let threw = false; try { click('[data-action=reminders-test]'); await wait(50); } catch (e) { threw = true; }
      ok(!threw && $$('.toast--reminder').length >= 1, 'browser without notification permission: in-app reminder, no error');
    } else {
      ok(/Windows notifications/.test($('#set-notify').textContent), 'desktop: reminders use Windows notifications');
    }
    $$('.toast').forEach((el) => el.remove());
  `);

  // Weekly Planner → Calendar view + calendar subscriptions (tests/functional-calendar.mjs)
  await calendarChecks(b, run);

  // ---- Quick-add recurrence syntax (2.2.0) ----
  await run('recurrence-quickadd', `
    const P = (s) => T4.tasks.parseQuickAdd(s), U = T4.util, today = U.today();
    const nextDow = (i) => { for (let k = 0; k < 7; k++) { const d = U.addDays(today, k); if (U.parseDate(d).getDay() === i) return d; } };
    const rj = (s) => JSON.stringify(P(s).recurrence);
    const J = JSON.stringify;
    ok(rj('Water plants every day') === J({unit:'day',every:1,from:'due'}) && P('Water plants every day').title === 'Water plants' && P('x every day').dueDate === today, 'every day -> daily, due today, phrase removed from title');
    ok(rj('a every weekday') === J({unit:'week',every:1,weekdays:[1,2,3,4,5],from:'due'}), 'every weekday');
    ok(rj('a every week') === J({unit:'week',every:1,from:'due'}) && rj('a every month') === J({unit:'month',every:1,from:'due'}) && rj('a every year') === J({unit:'year',every:1,from:'due'}), 'every week / month / year');
    ok(rj('a every monday') === J({unit:'week',every:1,weekdays:[1],from:'due'}) && P('a every monday').dueDate === nextDow(1), 'every monday: next Monday (or today)');
    ok(rj('a EVERY Mon') === rj('a every monday') && rj('a every mondays') === rj('a every monday'), 'every mon / mondays / any case');
    ok(rj('a every mo') === undefined && P('a every mo').title === 'a every mo', 'two letters are not a weekday');
    ok(rj('a every mon,wed,fri') === J({unit:'week',every:1,weekdays:[1,3,5],from:'due'}) && rj('a every mon, wed, fri') === rj('a every mon,wed,fri'), 'every mon,wed,fri (with or without spaces)');
    ok(P('a every mon,wed,fri').dueDate === [1,3,5].map(nextDow).sort()[0], 'weekday list: first matching date');
    const m = P('Call every monday, then rest'); ok(m.recurrence && m.title === 'Call then rest', 'comma after a weekday does not break parsing: ' + m.title);
    ok(rj('a every 2 weeks') === J({unit:'week',every:2,from:'due'}) && P('a every 2 weeks').dueDate === today, 'every 2 weeks, due today');
    ok(rj('a every 3 days') === J({unit:'day',every:3,from:'due'}) && rj('a every 2 months') === J({unit:'month',every:2,from:'due'}) && rj('a every 1 year') === J({unit:'year',every:1,from:'due'}), 'every n days / months / year');
    ok(rj('a every other week') === rj('a every 2 weeks') && rj('a every other friday') === J({unit:'week',every:2,weekdays:[5],from:'due'}), 'every other week / friday');
    const d15 = P('Rent every 15th'); const dd = U.parseDate(d15.dueDate);
    ok(d15.recurrence.monthDay === 15 && d15.recurrence.unit === 'month' && dd.getDate() === 15 && d15.dueDate >= today && U.diffDays(today, d15.dueDate) <= 31 && d15.title === 'Rent', 'every 15th: monthly on 15, next 15th');
    ok(P('a every 1st').recurrence.monthDay === 1 && P('a every 22nd').recurrence.monthDay === 22 && P('a every 3rd').recurrence.monthDay === 3, '1st / 22nd / 3rd');
    const ld = P('Report every last day'); const ldd = U.parseDate(ld.dueDate);
    ok(ld.recurrence.monthDay === -1 && ld.dueDate >= today && ldd.getDate() === new Date(ldd.getFullYear(), ldd.getMonth() + 1, 0).getDate(), 'every last day: month end, next month end');
    ok(P('a every day after done').recurrence.from === 'done' && P('a every day after done').title === 'a' && P('a every 3 days after done').recurrence.every === 3, 'after done -> from done');
    ok(P('a every monday after done').recurrence.from === 'done' && P('a every day after').title === 'a after' && P('a every day after').recurrence.from === 'due', 'after done needs both words');
    ok(rj('a *daily') === J({unit:'day',every:1,from:'due'}) && rj('a *weekly') === J({unit:'week',every:1,from:'due'}) && rj('a *monthly') === J({unit:'month',every:1,from:'due'}) && rj('a *yearly') === J({unit:'year',every:1,from:'due'}) && rj('a *weekdays') === rj('a every weekday'), 'shorthands only with *');
    ok(P('Check daily weekly reports').recurrence === undefined && P('Check daily weekly reports').title === 'Check daily weekly reports', 'bare daily/weekly stay in the title');
    // Negative cases: "every" stays in the title (numbers outside 1..99 are rejected, not clamped)
    for (const s of ['Read every chapter', 'every', 'Do every', 'Do every 0 days', 'Do every 100 weeks', 'Do every 2', 'Do every 32nd', 'Do every 0th', 'Do every other', 'Do every last', 'Do every thing', 'Do every moon']) {
      const p = P(s); ok(p.recurrence === undefined && p.title === s && !p.dueDate, 'not a recurrence: "' + s + '"');
    }
    ok(P('every day').title === '' && P('every day').recurrence.unit === 'day', 'phrase only -> empty title (caller rejects)');
    // Combination and explicit date
    const c = P('Team meeting !2 #work every monday @fri');
    ok(c.title === 'Team meeting' && c.priority === 'high' && c.categoryId === 'cat_work' && c.recurrence.weekdays[0] === 1 && c.dueDate === P('x @fri').dueDate, 'combination with !2 #work @fri: explicit @date wins');
    ok(P('a every day every week').recurrence.unit === 'day' && P('a every day every week').title === 'a every week', 'only the first phrase counts');
    // Creating tasks
    await go('dashboard');
    await submitQuick('#qa-dash', 'Standup every weekday #work');
    const t1 = S().tasks.find(t => t.title === 'Standup');
    ok(t1 && T4.recur.equals(t1.recurrence, {unit:'week',every:1,weekdays:[1,2,3,4,5]}) && !!t1.dueDate && t1.categoryId === 'cat_work', 'quick-add form saves recurrence on the task');
    await submitQuick('#qa-dash', 'Remember every 2 weeks');
    const t2 = S().tasks.find(t => t.title === 'Remember');
    ok(t2 && t2.recurrence.every === 2 && t2.dueDate === today && !t2.inbox, 'recurring task has a due date');
    const t3 = T4.tasks.captureText('Backup *weekly', { inbox: true });
    ok(t3 && t3.recurrence && t3.recurrence.unit === 'week' && t3.inbox === false, 'recurrence sorts a task out of the Inbox');
    const t4 = T4.tasks.captureText('Plain thought', { inbox: true });
    ok(t4 && t4.inbox === true && !t4.recurrence, 'plain Inbox capture stays in the Inbox');
    T4.store.toggleComplete(t2.id);
    const n2 = S().tasks.find(t => t.title === 'Remember' && t.id !== t2.id);
    ok(n2 && n2.dueDate === U.addDays(today, 14), 'completing schedules the next occurrence via the parsed rule');
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

  await run('quick-add-twice', `
    // Regression (found in 2.2.0 manual testing, existed since 1.0.0): the field kept the submitted text,
    // so a second task was appended to the first one.
    location.hash = '#/tasks'; await new Promise(r => setTimeout(r, 300));
    const add = async (text) => {
      const input = $('#qa-tasks input[name=title]'); input.focus(); input.value = text;
      $('#qa-tasks').requestSubmit(); await new Promise(r => setTimeout(r, 120));
    };
    await add('Twice A every monday');
    ok($('#qa-tasks input[name=title]').value === '', 'quick-add field is empty after adding');
    ok(document.activeElement === $('#qa-tasks input[name=title]'), 'quick-add field keeps focus after adding');
    await add('Twice B');
    const titles = T4.store.data.tasks.map(t => t.title);
    ok(titles.includes('Twice A') && titles.includes('Twice B'), 'two quick-adds in a row create two separate tasks: ' + titles.filter(t => t.startsWith('Twice')).join(' / '));
    const input = $('#qa-tasks input[name=title]'); input.value = '   '; $('#qa-tasks').requestSubmit(); await new Promise(r => setTimeout(r, 80));
    ok(T4.store.data.tasks.filter(t => t.title.startsWith('Twice')).length === 2, 'blank quick-add adds nothing');
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
  // i18n engine + pilot
  await run('i18n', `
    const I = T4.i18n;
    ok(I.languages().map(l => l.id + ':' + l.name).join() === 'en:English,de:Deutsch,tr:Türkçe,es:Español', 'languages() lists native names');
    I.setLanguage('en');
    ok(I.t('nav.today') === 'Today' && I.has('nav.today') && !I.has('nope.key'), 't/has basics');
    ok(I.t('time.hoursShort', { n: 3 }) === '3h' && I.t('time.hoursShort') === '{n}h', 'interpolation (unknown placeholder stays)');
    ok(I.t('nav.overdueTasks', { count: 1 }) === '1 overdue task' && I.t('nav.overdueTasks', { count: 2 }) === '2 overdue tasks', 'plural en');
    ok(I.t('totally.missing.key') === 'totally.missing.key', 'missing key → key');
    I.add('de', { 'test.onlyDe': 'nur Deutsch', 'test.pl': { '=0': 'keine', one: '{count} Ding', other: '{count} Dinge' } });
    I.add('en', { 'test.pl': { '=0': 'none', one: '{count} thing', other: '{count} things' } });
    I.setLanguage('de');
    ok(I.t('test.onlyDe') === 'nur Deutsch' && I.t('nav.today') === 'Heute', 'de active');
    ok(I.t('test.pl', { count: 0 }) === 'keine' && I.t('test.pl', { count: 1 }) === '1 Ding' && I.t('test.pl', { count: 5 }) === '5 Dinge', 'plural de incl. =0');
    I.setLanguage('tr');
    ok(I.t('test.onlyDe') === 'test.onlyDe', 'fallback: key missing in tr and en → key');
    ok(I.t('test.pl', { count: 2 }) === '2 things', 'fallback: tr → en');
    ok(I.detect('de-AT') === 'de' && I.detect('tr-TR') === 'tr' && I.detect('es_MX') === 'es' && I.detect('fr-FR') === 'en' && I.detect('EN-gb') === 'en', 'auto detection maps tags, unknown → en');
    ok(['en','de','tr','es'].includes(I.detect()), 'detect() from navigator');
    I.setLanguage('de');
    ok(document.documentElement.lang === 'de' && T4.store.settings.language === 'de' && I.locale().startsWith('de'), 'setLanguage → <html lang>, settings, locale');
    ok($('#sidebar').getAttribute('aria-label') === 'Hauptnavigation' && $('.skip-link').textContent === 'Zum Inhalt springen' && $('meta[name=description]').content.includes('Aufgaben'), 'data-i18n static texts (text, aria-label, meta content)');
    ok($('.sidebar__capture span').textContent === 'Schnell erfassen', 'sidebar capture button translated');
    const t0 = T4.util.today();
    ok(T4.util.relDate(t0) === 'Heute' && T4.util.relDate(T4.util.addDays(t0, 1)) === 'Morgen' && T4.util.relDate(T4.util.addDays(t0, -1)) === 'Gestern', 'relDate de');
    ok(T4.util.fmtMinutes(90) === '1 Std. 30 Min.', 'fmtMinutes de');
    ok(I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }) === '6. November 2026', 'fmtDate de: ' + I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }));
    ok(I.fmtWeekday(1) === 'Montag' && I.fmtMonth(2) === 'März' && I.fmtTime('14:05') === '14:05', 'weekday/month/time de');
    I.setLanguage('tr');
    ok(document.documentElement.lang === 'tr' && I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }) === '6 Kasım 2026', 'fmtDate tr: ' + I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }));
    ok(I.fmtWeekday(0) === 'Pazar' && I.fmtWeekday(2) === 'Salı' && I.fmtMonth(0) === 'Ocak' && T4.util.relDate(t0) === 'Bugün', 'weekday/month/relDate tr');
    I.setLanguage('es');
    ok(I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }) === '6 de noviembre de 2026' && I.fmtWeekday(6) === 'sábado' && I.fmtMonth(4) === 'mayo', 'fmtDate/weekday/month es: ' + I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }));
    ok(T4.util.relDate(T4.util.addDays(t0, 1)) === 'Mañana' && T4.util.greeting().startsWith('Buen'), 'relDate/greeting es');
    I.setLanguage('en');
    ok(I.fmtWeekday(3) === 'Wednesday' && I.fmtDate('2026-11-06', { day: 'numeric', month: 'long', year: 'numeric' }) === 'November 6, 2026', 'fmtDate en');
    const base = I.keys('en').sort().join('|');
    ok(['de', 'tr', 'es'].every((l) => I.keys(l).filter(k => !k.startsWith('test.')).sort().join('|') === I.keys('en').filter(k => !k.startsWith('test.')).sort().join('|')), 'all 4 dictionaries have the same keys');
    ok(['nav.dashboard','nav.inbox','nav.tasks','nav.today','nav.upcoming','nav.planner','nav.plan','nav.notes','nav.editor','nav.focus','nav.stats','nav.settings','nav.section.plan','nav.section.write','nav.section.do'].every(k => ['en','de','tr','es'].every(l => I.keys(l).includes(k))), 'nav keys exist in all languages');
    // language change re-renders the current view
    await go('dashboard');
    const h1 = $('.hero__title').textContent;
    I.setLanguage('de');
    ok($('.hero__title').textContent !== h1 && /^(Gute|Guten)/.test($('.hero__title').textContent), 'language switch re-renders the view: ' + $('.hero__title').textContent);
    I.setLanguage('en');
    ok($('.hero__title').textContent.startsWith('Good'), 'switch back to English');
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
