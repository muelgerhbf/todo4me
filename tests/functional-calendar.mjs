// Calendar view (Weekly Planner → Calendar) and calendar subscriptions — part of tests/test-functional.mjs.
// Runs in Chrome (tests/cdp.mjs) and in the desktop app (tests/cdp-electron.mjs) with real mouse input.
export default async function calendarChecks(b, run) {
  const clearToasts = () => b.evaluate(`document.querySelectorAll('.toast').forEach((t) => t.remove()); true`);
  const box = (sel) => b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; })()`);
  /** Screen point of a time slot: date column, minutes after midnight (+dy px). */
  const slot = (date, min, dy = 0) => b.evaluate(`(() => { const r = document.querySelector('.cal__col[data-cal-date="${date}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + ${min} / 1440 * r.height + ${dy} }; })()`);
  const ids = async () => b.evaluate('window.__cal');

  await run('calendar-view', `
    await go('planner');
    ok(!!$('[data-action=planner-mode][data-mode=calendar]') && $$('.day').length === 7, 'planner: "Days | Calendar" toggle, Days view unchanged by default');
    click('[data-action=planner-mode][data-mode=calendar]'); await wait(80);
    ok(!!$('.cal') && $$('.cal__col').length === 7 && $$('.day').length === 0, 'calendar view: week grid with 7 day columns');
    ok(JSON.parse(localStorage.getItem('todo4me.planner.ui')).mode === 'calendar' && !(localStorage.getItem('todo4me.data.v1') || '').includes('planner.ui'), 'view choice remembered in its own preference key');
    const days = $$('.cal__col').map((c) => c.dataset.calDate);
    ok(new Date(days[0] + 'T00:00').getDay() === S().settings.weekStart && days[0] === T4.planner.currentWeek(), 'calendar week starts on the configured start of week (' + days[0] + ')');
    ok($$('.cal__hour').length === 24 && !!$('.cal__col.is-today .cal__now') && $$('.cal__now').length === 1, '24 hour rows, current-time line in today\\'s column');
    const hourPx = $('.cal__grid').getBoundingClientRect().height / 24;
    ok(Math.abs($('#cal-scroller').scrollTop - (6 * hourPx - 10)) < 2 && $('#cal-scroller').scrollHeight > $('#cal-scroller').clientHeight, 'opens scrolled to 06:00, scrollable to 0–24');
    const [d0, d1, d2, d3, d4, d5] = days;
    const A = T4.store.addTask({ title: 'Cal A', dueDate: d1, dueTime: '09:00', estimate: 60, priority: 'high', categoryId: 'cat_work' });
    const B = T4.store.addTask({ title: 'Cal B', dueDate: d1, dueTime: '09:30', priority: 'low' });
    const C = T4.store.addTask({ title: 'Cal C date only', dueDate: d2, priority: 'medium' });
    const D = T4.store.addTask({ title: 'Cal inbox item', inbox: true });
    await wait(60);
    window.__cal = { days, d0, d1, d2, d3, d4, d5, A: A.id, B: B.id, C: C.id, D: D.id, hourPx };
    const bA = $('.cal-blk[data-id="' + A.id + '"]'), bB = $('.cal-blk[data-id="' + B.id + '"]');
    const col = $('.cal__col[data-cal-date="' + d1 + '"]').getBoundingClientRect();
    ok(bA && bA.parentElement.dataset.calDate === d1, 'task with date + time is a block in its day column');
    const rA = bA.getBoundingClientRect(), rB = bB.getBoundingClientRect();
    ok(Math.abs(rA.top - col.top - 9 * hourPx) < 1.5 && Math.abs(rA.height - hourPx) < 1.5, 'block at 09:00, height = estimate 60 min (' + Math.round(rA.top - col.top) + 'px, ' + Math.round(rA.height) + 'px)');
    ok(Math.abs(rB.top - col.top - 9.5 * hourPx) < 1.5 && Math.abs(rB.height - hourPx / 2) < 1.5, 'task without estimate is 30 minutes high');
    ok(rB.left >= rA.right - 1 && rA.width < col.width / 2 + 1 && rB.width < col.width / 2 + 1, 'overlapping blocks are laid out side by side');
    ok(!!$('.cal__ad[data-cal-allday="' + d2 + '"] [data-cal-drag="' + C.id + '"]') && !$('.cal-blk[data-id="' + C.id + '"]'), 'task with a date but no time is in the all-day strip');
    ok(!!$('.cal-side [data-cal-drag="' + D.id + '"]') && /Inbox/.test($('.cal-side').textContent), 'inbox task listed under "To schedule"');
    ok(/Cal A/.test(bA.textContent) && /Work|Cal A, /.test(bA.getAttribute('aria-label')) && bA.getAttribute('aria-describedby') === 'cal-kbd-help', 'block has an accessible label and keyboard help');
    $$('.toast').forEach((t) => t.remove());
  `);

  // --- Text size (Settings → Appearance): time column grows with it, labels stay inside and on their hour line
  for (const fs of [85, 100, 125]) {
    await run('calendar-fontscale-' + fs, `
      const prevScale = S().settings.fontScale;
      T4.store.updateSettings({ fontScale: ${fs} }); T4.settings.applyAppearance(); await wait(120);
      const main = $('.cal__main').getBoundingClientRect(), grid = $('.cal__grid').getBoundingClientRect();
      const labels = $$('.cal__hour').filter((h) => h.textContent.trim());
      const colLeft = $('.cal__col').getBoundingClientRect().left;
      const bad = labels.filter((h) => { const r = h.getBoundingClientRect(); return r.left < main.left + 1 || r.right > colLeft + 1; });
      ok(labels.length === 23 && bad.length === 0, 'fontScale ${fs}: all hour labels inside the time column (' + bad.length + ' outside)');
      const off = labels.map((h, i) => { const r = h.getBoundingClientRect(); return Math.abs((r.top + r.height / 2) - (grid.top + (i + 1) / 24 * grid.height)); });
      ok(Math.max(...off) < 3, 'fontScale ${fs}: hour label centered on its hour line (max offset ' + Math.max(...off).toFixed(1) + 'px)');
      ok(document.documentElement.scrollWidth <= window.innerWidth + 1, 'fontScale ${fs}: no horizontal page overflow');
      const heads = $$('.cal__head .cal__dh').map((e) => e.getBoundingClientRect()), cols = $$('.cal__col').map((e) => e.getBoundingClientRect());
      ok(heads.length === cols.length && heads.every((h, i) => Math.abs(h.left - cols[i].left) < 1.5 && Math.abs(h.width - cols[i].width) < 1.5), 'fontScale ${fs}: day headers aligned with day columns');
      const ad = $$('.cal__ad').map((e) => e.getBoundingClientRect());
      ok(ad.every((h, i) => Math.abs(h.left - cols[i].left) < 1.5), 'fontScale ${fs}: all-day strip aligned with day columns');
      const bA = $('.cal-blk[data-id="' + window.__cal.A + '"]').getBoundingClientRect(), colA = $('.cal__col[data-cal-date="' + window.__cal.d1 + '"]').getBoundingClientRect();
      ok(Math.abs(bA.top - colA.top - 9 * colA.height / 24) < 1.5, 'fontScale ${fs}: block still sits at 09:00');
      T4.store.updateSettings({ fontScale: prevScale }); T4.settings.applyAppearance(); await wait(60);
    `);
  }

  // --- Real mouse: move a block to another day/time
  let c = await ids();
  let a = await box(`.cal-blk[data-id="${c.A}"]`);
  let to = await slot(c.d3, 13 * 60, a.top + 10 - (await slot(c.d1, 9 * 60)).y); // keep the grab offset
  await clearToasts();
  await b.drag(a.x, a.top + 10, to.x, to.y, 8);
  await b.sleep(150);
  await run('calendar-move', `
    const c = window.__cal, t = T4.store.getTask(c.A);
    ok(t.dueDate === c.d3 && t.dueTime === '13:00' && t.estimate === 60, 'mouse drag moves the block to another day and time: ' + t.dueDate + ' ' + t.dueTime);
    ok($('.cal-blk[data-id="' + c.A + '"]').parentElement.dataset.calDate === c.d3 && !$('.cal-ghost') && !document.body.classList.contains('cal-dragging'), 'block re-rendered in the new column, drag ghost removed');
    ok($$('.toast').some((x) => /Moved to/.test(x.textContent) && /Undo/.test(x.textContent)), 'move toast offers Undo');
    ok(!$('#modal').open, 'a drag does not open the task editor');
  `);

  // --- Resize the lower edge (15-minute snapping)
  a = await box(`.cal-blk[data-id="${c.A}"]`);
  to = await slot(c.d3, 14 * 60 + 33);
  await clearToasts();
  await b.drag(a.x, a.bottom - 3, a.x, to.y, 6);
  await b.sleep(150);
  await run('calendar-resize', `
    const c = window.__cal, t = T4.store.getTask(c.A);
    ok(t.estimate === 90 && t.dueTime === '13:00', 'dragging the lower edge changes the estimate in 15-minute steps: ' + t.estimate + ' min');
    const r = $('.cal-blk[data-id="' + c.A + '"]').getBoundingClientRect();
    ok(Math.abs(r.height - 1.5 * c.hourPx) < 1.5, 'block height follows the new estimate');
  `);

  // --- Click (no drag) opens the existing task editor
  await b.sleep(450);
  a = await box(`.cal-blk[data-id="${c.A}"]`);
  await b.click(a.x, a.top + 12);
  await b.sleep(150);
  await run('calendar-click', `
    ok($('#modal').open && $('#tf-title') && $('#tf-title').value === 'Cal A' && $('#tf-time').value === '13:00' && $('#tf-est').value === '90', 'click on a block opens the task editor');
    T4.ui.closeModal(); await wait(30);
  `);

  // --- Drag a date-only task from the all-day strip into the grid
  const chip = await box(`[data-cal-drag="${c.C}"]`);
  to = await slot(c.d4, 10 * 60, 2);
  await clearToasts();
  await b.drag(chip.x, chip.y, to.x, to.y, 8);
  await b.sleep(150);
  // --- Drag the inbox task from the side list into the grid
  const side = await box(`.cal-side [data-cal-drag="${c.D}"]`);
  to = await slot(c.d4, 14 * 60, 2);
  await clearToasts();
  await b.drag(side.x, side.y, to.x, to.y, 10);
  await b.sleep(150);
  // --- Drag a timed block into the all-day strip (removes the time)
  const bb = await box(`.cal-blk[data-id="${c.B}"]`);
  const ad = await box(`.cal__ad[data-cal-allday="${c.d2}"]`);
  await clearToasts();
  await b.drag(bb.x, bb.top + 6, ad.x, ad.top + 10, 8);
  await b.sleep(150);
  await run('calendar-schedule', `
    const c = window.__cal, C = T4.store.getTask(c.C), D = T4.store.getTask(c.D), B = T4.store.getTask(c.B);
    ok(C.dueDate === c.d4 && C.dueTime === '10:00' && !!$('.cal-blk[data-id="' + c.C + '"]'), 'drag from the all-day strip into the grid sets date and time: ' + C.dueDate + ' ' + C.dueTime);
    // Which group of the side list shows D now? (d4 can be a past day of this week — then D is
    // rightly listed again, under "Overdue"; it must never stay under "Inbox".)
    const dItem = $('.cal-side [data-cal-drag="' + c.D + '"]');
    const dGroup = dItem ? dItem.closest('ul').previousElementSibling.textContent : null;
    ok(D.dueDate === c.d4 && D.dueTime === '14:00' && D.inbox === false && (c.d4 < T4.util.today() ? /^Overdue/.test(dGroup) : !dItem), 'drag from the "To schedule" list schedules an inbox task (leaves the inbox' + (dGroup ? ', now listed under ' + dGroup.replace(/\\d+$/, '').trim() : '') + ')');
    ok(B.dueDate === c.d2 && B.dueTime === null && !!$('.cal__ad[data-cal-allday="' + c.d2 + '"] [data-cal-drag="' + c.B + '"]'), 'drag a block into the all-day strip: date kept, time removed');
    // Undo the last change from its toast
    const undo = $$('.toast__action').filter((x) => x.textContent === 'Undo').pop();
    undo.click(); await wait(60);
    const B2 = T4.store.getTask(c.B);
    ok(B2.dueDate === c.d1 && B2.dueTime === '09:30', 'Undo restores the previous date and time');
    $$('.toast').forEach((t) => t.remove());
  `);

  // --- Click on an empty slot → task editor at that time
  let s = await slot(c.d4, 8 * 60, 6);
  await b.click(s.x, s.y);
  await b.sleep(150);
  await run('calendar-empty-click', `
    const c = window.__cal;
    ok($('#modal').open && $('#tf-title') && $('#tf-title').value === '' && $('#tf-date').value === c.d4 && $('#tf-time').value === '08:00', 'click on an empty slot opens "New task" at that day and time');
    T4.ui.closeModal(); await wait(30);
    ok(!S().tasks.some((t) => t.dueDate === c.d4 && t.dueTime === '08:00'), 'cancelling the editor creates nothing');
  `);
  // --- Drag on empty slots → task editor with that time range
  s = await slot(c.d5, 11 * 60, 4);
  to = await slot(c.d5, 12 * 60 + 30, 2);
  await b.drag(s.x, s.y, to.x, to.y, 8);
  await b.sleep(150);
  await run('calendar-empty-drag', `
    const c = window.__cal;
    ok($('#modal').open && $('#tf-date').value === c.d5 && $('#tf-time').value === '11:00' && $('#tf-est').value === '90', 'dragging over empty slots opens "New task" with start time and length (11:00, 90 min)');
    $('#tf-title').value = 'Cal created'; $('#task-form').requestSubmit(); await wait(80);
    const t = S().tasks.find((x) => x.title === 'Cal created');
    ok(t && t.dueDate === c.d5 && t.dueTime === '11:00' && t.estimate === 90 && !!$('.cal-blk[data-id="' + t.id + '"]'), 'the new task appears as a block');
    $$('.toast').forEach((x) => x.remove());
    $('.cal-blk[data-id="' + c.A + '"]').focus();
  `);

  // --- Keyboard: ↑/↓ moves 15 min, Shift+↓ lengthens, → next day
  await b.key('ArrowDown', 'ArrowDown');
  await b.sleep(60);
  await b.key('ArrowDown', 'ArrowDown', undefined, 8);
  await b.sleep(60);
  await b.key('ArrowRight', 'ArrowRight');
  await b.sleep(60);
  await run('calendar-keyboard', `
    const c = window.__cal, t = T4.store.getTask(c.A);
    ok(t.dueTime === '13:15' && t.estimate === 105 && t.dueDate === c.d4, 'keyboard: ↓ moves by 15 min, Shift+↓ adds 15 min, → moves a day (' + t.dueDate + ' ' + t.dueTime + ', ' + t.estimate + ' min)');
    ok(document.activeElement && document.activeElement.dataset.id === c.A, 'focus stays on the moved block');
    $$('.toast').forEach((x) => x.remove());
  `);

  // --- Reminder follows a task moved in the calendar
  await run('calendar-reminder-setup', `
    const c = window.__cal;
    T4.reminders.stop();
    const E = T4.store.addTask({ title: 'Cal reminder', dueDate: c.d1, dueTime: '10:00', reminder: 15, priority: 'medium' });
    T4.store.commit((d) => { d.tasks.find((x) => x.id === E.id).reminderSnooze = new Date(2030, 0, 1).toISOString(); });
    c.E = E.id; await wait(40);
  `);
  c = await ids();
  const e = await box(`.cal-blk[data-id="${c.E}"]`);
  to = await slot(c.d2, 14 * 60, e.top + 8 - (await slot(c.d1, 10 * 60)).y);
  await clearToasts();
  await b.drag(e.x, e.top + 8, to.x, to.y, 8);
  await b.sleep(150);
  await run('calendar-reminder', `
    const c = window.__cal, R = T4.reminders, E = T4.store.getTask(c.E);
    const at = (d, hh, mm) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, hh, mm); };
    ok(E.dueDate === c.d2 && E.dueTime === '14:00' && E.reminder === 15 && E.reminderSnooze === null, 'moved task keeps its reminder offset; a pending snooze is cleared');
    ok(+R.fireAt(E, S().settings) === +at(c.d2, 13, 45), 'reminder now fires 15 min before the new time');
    const sent = []; R.setNotifier((n) => sent.push(n));
    ok(!R.check({ now: at(c.d1, 9, 50) }).fired.includes(E.id), 'no reminder at the old time');
    ok(R.check({ now: at(c.d2, 13, 45) }).fired.includes(E.id) && sent.some((n) => n.id === 'task:' + E.id), 'reminder fires at the new time');
    R.setNotifier(null); R.start();
    T4.store.deleteTask(E.id);
    $$('.toast').forEach((x) => x.remove());
  `);

  // --- Subscribed calendars: .ics import, read-only events, escaping, storage, dashboard
  await run('calendar-ics', `
    const c = window.__cal;
    ok(!!T4.ics && T4.ics.parse('BEGIN:VCALENDAR\\r\\nBEGIN:VEVENT\\r\\nDTSTART:20261104T100000Z\\r\\nSUMMARY:x\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR').events.length === 1, 'ICS parser loaded in the app');
    await go('settings');
    const card = $('#cal-settings');
    ok(card && /Calendars/.test(card.textContent) && !!$('[data-action=cal-import-pick]'), 'Settings → Calendars card with .ics import');
    if (window.todo4meDesktop) ok(!!$('#cal-add-form input[type=url]') && !$('#cal-settings .callout'), 'desktop: subscribe by address (https/webcal)');
    else ok(!$('#cal-add-form') && /desktop app/.test($('#cal-settings .callout').textContent), 'browser: no address subscription, a clear note and .ics import instead');
    const dc = (d) => d.replace(/-/g, '');
    const today = T4.util.today();
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Team', 'BEGIN:VEVENT', 'UID:e1', 'SUMMARY:<img src=x onerror="window.__xss=1">Standup',
      'DTSTART:' + dc(c.d1) + 'T080000', 'DTEND:' + dc(c.d1) + 'T083000', 'RRULE:FREQ=DAILY;COUNT=3', 'LOCATION:Room <b>1</b>',
      'DESCRIPTION:Line one\\\\nLine two <script>window.__xss=2<\\/script>', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:e2', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:' + dc(c.d2), 'DTEND;VALUE=DATE:' + dc(c.d4), 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:e3', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'DTSTART:' + dc(c.d1) + 'T120000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:e4', 'SUMMARY:Today event', 'DTSTART:' + dc(today) + 'T061500', 'DURATION:PT30M', 'END:VEVENT', 'END:VCALENDAR'].join('\\r\\n');
    const dt = new DataTransfer(); dt.items.add(new File([ics], 'team.ics', { type: 'text/calendar' }));
    const inp = $('#cal-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 30 && !T4.calfeeds.feeds.length; i++) await wait(50);
    const f = T4.calfeeds.feeds[0];
    ok(f && f.kind === 'file' && f.name === 'Team' && /Imported/.test($('#cal-settings').textContent), '.ics file imported as a calendar');
    ok(/Team/.test(localStorage.getItem('todo4me.calendars.v1')) && /Standup/.test(localStorage.getItem('todo4me.calendars.cache.v1')), 'calendar list and events stored in their own keys');
    ok(!/Standup|calendars/.test(localStorage.getItem('todo4me.data.v1')) && !/Standup|todo4me\\.calendars/.test(T4.storage.exportJSON(S())), 'not in the main data document and not in exports');
    await go('planner');
    ok(!!$('.cal'), 'calendar view still selected after navigating');
    const evs = $$('.cal-ev').filter((x) => /Standup/.test(x.textContent));
    ok(evs.length === 3 && evs.every((x) => /08:00|8:00/.test(x.textContent)), 'recurring event (daily, COUNT=3) shown on 3 days at 08:00 local');
    ok(Math.abs(parseFloat(evs[0].style.top) - 480 / 1440 * 100) < 0.01 && Math.abs(parseFloat(evs[0].style.height) - 30 / 1440 * 100) < 0.01, 'event block position and length from DTSTART/DTEND');
    ok($$('.cal-chip--ev').filter((x) => x.textContent === 'Offsite').length === 2, 'all-day event over two days in the all-day strip (DTEND exclusive)');
    ok(!$$('.cal-ev, .cal-chip--ev').some((x) => /Cancelled/.test(x.textContent)), 'cancelled event not shown');
    ok(!$('.cal img') && !window.__xss && evs[0].textContent.includes('<img src=x'), 'HTML in the event title is shown as text, never executed');
    ok(!evs[0].hasAttribute('data-cal-task') && !evs[0].querySelector('[data-cal-resize]') && getComputedStyle(evs[0]).borderLeftStyle === 'solid' && getComputedStyle(evs[0]).borderTopStyle === 'dashed', 'events look different from tasks (hatched, dashed) and have no resize handle');
    window.__evKey = evs[0].dataset.key;
  `);
  const ev = await box(`.cal-ev[data-key="${await b.evaluate('window.__evKey')}"]`);
  const before = await b.evaluate('JSON.stringify(T4.store.data.tasks)');
  await b.drag(ev.x, ev.y, ev.x + 120, ev.y + 100, 8);
  await b.sleep(150);
  await run('calendar-ics-readonly', `
    ok(JSON.stringify(T4.store.data.tasks) === ${JSON.stringify(before)} && !document.body.classList.contains('cal-dragging'), 'events cannot be dragged (read-only): no task changed');
    if ($('#modal').open) T4.ui.closeModal();
    $('.cal-ev[data-key="' + CSS.escape(window.__evKey) + '"]').click(); await wait(60);
    const m = $('#modal');
    ok(m.open && /Standup/.test($('#modal-title').textContent) && /read-only/.test(m.textContent) && /Room <b>1<\\/b>/.test(m.textContent) && !m.querySelector('img, script, b'), 'event details dialog (read-only), all text escaped');
    ok(/Line one/.test($('.cal-evd__desc').textContent) && $('.cal-evd__desc').innerHTML.includes('<br>') && /<script>/.test($('.cal-evd__desc').textContent) && !window.__xss, 'description with line breaks, script shown as text');
    T4.ui.closeModal(); await wait(30);
    await go('dashboard');
    const dc = $('#dash-cal-h');
    ok(dc && /Calendar today/.test(dc.textContent) && /Today event/.test(dc.closest('.card').textContent), 'dashboard shows today\\'s calendar events');
    await go('planner');
  `);

  // --- Narrow screen: single-day grid; dark theme
  await b.viewport(600, 900);
  await b.sleep(200);
  await run('calendar-narrow', `
    if (location.hash !== '#/planner') await go('planner');
    T4.app.render(); await wait(50);
    ok($$('.cal__col').length === 1 && !$('[data-action=cal-span]'), 'narrow screen: calendar falls back to a single day');
    click('[data-action=cal-nav][data-dir="1"]'); await wait(40);
    ok($('.cal__col').dataset.calDate === T4.util.addDays(T4.util.today(), 1), 'day navigation on narrow screens');
    click('[data-action=cal-nav][data-dir="0"]'); await wait(40);
  `);
  await b.viewport(1366, 900);
  await b.sleep(200);
  await run('calendar-theme-a11y', `
    T4.app.render(); await wait(50);
    ok($$('.cal__col').length === 7, 'wide screen: week grid again');
    const light = getComputedStyle($('.cal-blk')).backgroundColor;
    T4.store.updateSettings({ theme: 'dark' }); T4.settings.applyAppearance(); await wait(50);
    const dark = getComputedStyle($('.cal-blk')).backgroundColor;
    ok(document.documentElement.dataset.theme === 'dark' && light !== dark && !!$('.cal'), 'calendar follows the dark theme');
    T4.store.updateSettings({ theme: 'light' }); T4.settings.applyAppearance(); await wait(50);
    const unnamed = $$('main button').filter((x) => !(x.textContent.trim() || x.getAttribute('aria-label') || x.title));
    const idsAll = $$('[id]').map((e) => e.id); const dupes = idsAll.filter((x, i) => idsAll.indexOf(x) !== i);
    ok(unnamed.length === 0 && dupes.length === 0 && $$('main h1').length === 1, 'calendar view: all buttons named, no duplicate ids, one h1');
    click('[data-action=cal-day][data-date="' + window.__cal.d1 + '"]'); await wait(40);
    ok($$('.cal__col').length === 1 && $('.cal__col').dataset.calDate === window.__cal.d1 && $('[data-action=cal-span][data-span=day]').getAttribute('aria-pressed') === 'true', 'click on a day header shows that day');
    click('[data-action=cal-span][data-span=week]'); await wait(40);
    ok($$('.cal__col').length === 7, 'back to the week');
  `);

  // --- Remove the calendar; the old Days view still works exactly as before
  await run('calendar-remove-and-days', `
    await go('settings');
    click('[data-action=cal-remove]'); await wait(30); click('#confirm [data-confirm=yes]'); await wait(80);
    ok(T4.calfeeds.feeds.length === 0 && !/Standup/.test(localStorage.getItem('todo4me.calendars.cache.v1') || ''), 'removing a calendar deletes its events');
    await go('planner?view=days');
    ok($$('.day').length === 7 && !$('.cal'), '#/planner?view=days opens the original day columns');
    const c = window.__cal;
    ok($$('.day[data-drop-date="' + c.d4 + '"] .task').some((li) => li.dataset.id === c.C) && $$('.day[data-drop-date="' + c.d4 + '"] .task').some((li) => li.dataset.id === c.D), 'tasks scheduled in the calendar appear in the Days view');
    const li = $('.day .task[draggable=true]'), target = $$('.day')[6];
    const dt = new DataTransfer();
    li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await wait(30);
    ok(T4.store.getTask(li.dataset.id).dueDate === target.dataset.dropDate, 'Days view: drag & drop still reschedules');
    await go('planner?view=calendar');
    ok(!!$('.cal'), '#/planner?view=calendar opens the calendar');
    click('[data-action=planner-mode][data-mode=days]'); await wait(40);
    ok($$('.day').length === 7 && T4.calendar.prefs.mode === 'days', '"Days" switches back (although the address still says view=calendar)');
    [c.A, c.B, c.C, c.D].concat(S().tasks.filter((t) => t.title === 'Cal created').map((t) => t.id)).forEach((id) => T4.store.deleteTask(id));
    $$('.toast').forEach((x) => x.remove());
  `);
}
