/* Todo4Me — Calendar view (time grid) of the Weekly Planner.
 *
 * The Weekly Planner has two views, switched with "Days | Calendar" in its header:
 *  - Days: the original day columns (unchanged, planner.js)
 *  - Calendar: an hour grid for a week or a single day (this file). Narrow screens always get the day grid.
 * Both share the planner's week (and its week-start setting). The choice is remembered in the
 * view preference key todo4me.planner.ui ({ mode, span }); #/planner?view=calendar opens it directly.
 *
 * In the grid:
 *  - tasks with a due date and time are blocks; height = estimate (30 min if none)
 *  - tasks with a date but no time sit in the "All day" strip of their day
 *  - events of subscribed calendars (calfeeds.js) are read-only blocks in the calendar's color
 *  - overlapping blocks are laid out side by side
 * Pointer interactions (mouse, pen; touch after a long press): drag a block to another time/day,
 * drag its lower edge to change the estimate (15-minute steps), drag an all-day or side-list task
 * into the grid to give it a time, click or drag on an empty slot to create a task there.
 * Keyboard: a focused block moves with ↑/↓ (15 min) and ←/→ (one day); Shift+↑/↓ changes the length.
 * Every change goes through store.updateTask() (→ commit) and offers Undo; reminders follow
 * automatically because they are stored relative to the due date/time. */
T4.calendar = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;

  const UI_KEY = 'todo4me.planner.ui';
  const SNAP = 15, DEFAULT_MIN = 30, DAY_MIN = 1440, START_HOUR = 6;
  const mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;

  let prefs = loadPrefs();
  let day = null;          // day shown in the single-day grid (null → today)
  let lastParam = null;    // last ?view= route parameter applied
  let scrollTop = null;    // keeps the grid's scroll position across re-renders
  let occMap = {};         // event key → occurrence (for the details dialog)
  let drag = null;         // the pointer interaction in progress
  let suppressClickUntil = 0;

  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { p = {}; }
    return { mode: p.mode === 'calendar' ? 'calendar' : 'days', span: p.span === 'day' ? 'day' : 'week' };
  }
  function savePrefs() { try { localStorage.setItem(UI_KEY, JSON.stringify(prefs)); } catch (e) { /* not important */ } }

  const narrow = () => !!(mq && mq.matches);
  const span = () => (narrow() ? 'day' : prefs.span);
  const curDay = () => day || U.today();
  const toMin = (hhmm) => (U.isTimeStr(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : 0);
  const fromMin = (m) => U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60);
  const snap = (m) => Math.round(m / SNAP) * SNAP;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pct = (m) => (m / DAY_MIN * 100).toFixed(4);
  function fmtClock(m) { return m >= DAY_MIN ? '24:00' : U.fmtTime(fromMin(m)); }
  const range = (s, e) => fmtClock(s) + ' – ' + fmtClock(e);

  /** Is the calendar shown? (?view=calendar|days in the route switches and is remembered.) */
  function active(params) {
    const v = params && params.view;
    if (v !== lastParam) {
      lastParam = v || null;
      if (v === 'calendar' || v === 'days') { prefs.mode = v; savePrefs(); }
    }
    return prefs.mode === 'calendar';
  }
  function leave() { lastParam = null; }
  const isActive = () => prefs.mode === 'calendar';

  function modeToggle(mode) {
    const b = (m, label) => '<button type="button" class="seg__btn" data-action="planner-mode" data-mode="' + m + '" aria-pressed="' + (mode === m) + '">' + label + '</button>';
    return '<div class="seg seg--sm" role="group" aria-label="Planner view">' + b('days', icon('week') + 'Days') + b('calendar', icon('clock') + 'Calendar') + '</div>';
  }

  /* ======================= Data for the visible days ======================= */
  function localMidnight(d) { return U.parseDate(d).getTime(); }
  function minutesOf(ms) { const x = new Date(ms); return x.getHours() * 60 + x.getMinutes(); }

  function collect(dates) {
    const from = dates[0], to = U.addDays(dates[dates.length - 1], 1);
    const cols = dates.map((d) => ({ date: d, timed: [], allDay: [] }));
    const idx = {};
    dates.forEach((d, i) => { idx[d] = i; });
    dates.forEach((d, i) => {
      store.sortTasks(store.tasksOn(d)).forEach((t) => {
        if (t.dueTime) {
          const s = toMin(t.dueTime);
          cols[i].timed.push({ kind: 'task', t, start: s, end: Math.min(DAY_MIN, s + (t.estimate || DEFAULT_MIN)) });
        } else cols[i].allDay.push({ kind: 'task', t });
      });
    });
    const events = T4.calfeeds ? T4.calfeeds.occurrences(from, to) : [];
    occMap = {};
    events.forEach((ev) => {
      occMap[ev.key] = ev;
      if (ev.allDay) {
        for (let d = ev.start < from ? from : ev.start, n = 0; d < ev.end && d < to && n < 400; d = U.addDays(d, 1), n++) {
          if (idx[d] != null) cols[idx[d]].allDay.push({ kind: 'event', ev });
        }
        return;
      }
      // Timed: one segment per local day it touches.
      let d = U.toDateStr(new Date(ev.start));
      for (let n = 0; n < 60; n++, d = U.addDays(d, 1)) {
        const dayStart = localMidnight(d), dayEnd = localMidnight(U.addDays(d, 1));
        if (dayStart >= ev.end && n > 0) break;
        if (idx[d] != null) {
          const s = ev.start > dayStart ? minutesOf(ev.start) : 0;
          const e = ev.end >= dayEnd ? DAY_MIN : ev.end > dayStart ? minutesOf(ev.end) : s;
          cols[idx[d]].timed.push({ kind: 'event', ev, start: s, end: Math.max(e, s), cont: ev.start < dayStart, more: ev.end > dayEnd });
        }
        if (dayEnd >= ev.end) break;
      }
    });
    cols.forEach((c) => layout(c.timed));
    return cols;
  }

  /** Side-by-side layout of overlapping items: sets item.col and item.cols. */
  function layout(items) {
    items.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    let cluster = [], colEnds = [], clusterEnd = -1;
    const flush = () => { cluster.forEach((it) => { it.cols = colEnds.length; }); cluster = []; colEnds = []; clusterEnd = -1; };
    items.forEach((it) => {
      const vEnd = Math.max(it.end, it.start + 20); // short blocks still need room for their text
      if (cluster.length && it.start >= clusterEnd) flush();
      let c = colEnds.findIndex((e) => e <= it.start);
      if (c < 0) { c = colEnds.length; colEnds.push(vEnd); } else colEnds[c] = vEnd;
      it.col = c;
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, vEnd);
    });
    flush();
  }

  /* ======================= Rendering ======================= */
  function posStyle(it) {
    const w = 100 / it.cols;
    return 'top:' + pct(it.start) + '%;height:' + pct(Math.max(it.end - it.start, SNAP)) + '%;' +
      'left:calc(' + (it.col * w).toFixed(3) + '% + 2px);width:calc(' + w.toFixed(3) + '% - 4px)';
  }

  function taskBlock(it, d) {
    const t = it.t, cat = store.category(t.categoryId);
    const done = t.status === 'done';
    const dur = it.end - it.start;
    return '<button type="button" class="cal-blk prio-' + (t.priority || 'none') + (done ? ' is-done' : '') + (dur < 45 ? ' is-short' : '') + (store.isOverdue(t) ? ' is-overdue' : '') + '"' +
      ' data-action="edit-task" data-id="' + t.id + '" data-cal-task="' + t.id + '"' +
      ' style="' + posStyle(it) + (cat ? ';--cat:' + esc(cat.color) : '') + '"' +
      ' aria-label="' + esc(t.title + ', ' + range(it.start, it.end) + ', ' + U.fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }) + (done ? ', completed' : '')) + '" aria-describedby="cal-kbd-help">' +
      '<span class="cal-blk__t">' + (done ? icon('check') : '') + esc(t.title) + '</span>' +
      '<span class="cal-blk__m">' + esc(range(it.start, it.end)) + (t.reminder != null && !done ? ' ' + icon('bell') : '') + '</span>' +
      '<span class="cal-blk__rs" data-cal-resize="' + t.id + '" aria-hidden="true"></span>' +
      '</button>';
  }

  function eventBlock(it) {
    const ev = it.ev;
    const when = T4.calfeeds.fmtRange(ev);
    return '<button type="button" class="cal-ev' + (it.end - it.start < 45 ? ' is-short' : '') + '" data-action="cal-event" data-key="' + esc(ev.key) + '"' +
      ' style="' + posStyle(it) + ';--ev:' + esc(ev.color) + '"' +
      ' aria-label="' + esc(ev.title + ', ' + when + ', ' + ev.calName + ' calendar (read-only)') + '">' +
      '<span class="cal-ev__t">' + esc(ev.title) + '</span>' +
      '<span class="cal-blk__m">' + esc(when) + (ev.location ? ' · ' + esc(ev.location) : '') + '</span>' +
      '</button>';
  }

  function allDayItem(it, d) {
    if (it.kind === 'event') {
      const ev = it.ev;
      return '<button type="button" class="cal-chip cal-chip--ev" data-action="cal-event" data-key="' + esc(ev.key) + '" style="--ev:' + esc(ev.color) + '" title="' + esc(ev.title) + '" aria-label="' + esc(ev.title + ', all day, ' + ev.calName + ' calendar (read-only)') + '">' + esc(ev.title) + '</button>';
    }
    const t = it.t;
    return '<button type="button" class="cal-chip prio-' + (t.priority || 'none') + (t.status === 'done' ? ' is-done' : '') + '" data-action="edit-task" data-id="' + t.id + '" data-cal-drag="' + t.id + '" title="' + esc(t.title) + '"' +
      ' aria-label="' + esc(t.title + ', ' + U.fmt(d, { weekday: 'long' }) + ', no time') + '"><span class="prio-dot"></span>' + esc(t.title) + '</button>';
  }

  function sideHtml() {
    const today = U.today();
    const open = store.planned().filter(store.isOpen);
    const groups = [
      ['Overdue', 'alert', store.sortTasks(open.filter((t) => t.dueDate && t.dueDate < today), 'due')],
      ['Inbox', 'inbox', store.sortTasks(store.inboxTasks(), 'created')],
      ['No date', 'list', store.sortTasks(open.filter((t) => !t.dueDate))],
    ];
    const item = (t) => '<li><button type="button" class="cal-side__item prio-' + (t.priority || 'none') + '" data-action="edit-task" data-id="' + t.id + '" data-cal-drag="' + t.id + '"' +
      ' aria-label="' + esc(t.title) + (t.dueDate ? ', due ' + esc(U.relDate(t.dueDate)) : '') + '"><span class="prio-dot"></span><span class="cal-side__t">' + esc(t.title) + '</span>' +
      (t.dueDate ? '<span class="muted small nowrap">' + esc(U.relDate(t.dueDate)) + '</span>' : '') + '</button></li>';
    const body = groups.filter((g) => g[2].length).map((g) =>
      '<h3 class="subhead">' + icon(g[1]) + g[0] + ' <span class="count">' + g[2].length + '</span></h3>' +
      '<ul class="cal-side__list" role="list">' + g[2].slice(0, 12).map(item).join('') + '</ul>' +
      (g[2].length > 12 ? '<p class="muted small">+ ' + (g[2].length - 12) + ' more</p>' : '')).join('');
    return '<aside class="cal-side" aria-labelledby="cal-side-h"><h2 class="cal-side__title" id="cal-side-h">' + icon('inbox') + 'To schedule</h2>' +
      '<p class="muted small">Drag a task into the calendar to give it a day and time.</p>' +
      (body || '<p class="muted small mt-sm">Nothing waiting: no overdue, inbox or undated tasks.</p>') + '</aside>';
  }

  function render() {
    const today = U.today();
    const sp = span();
    const ws = T4.planner.currentWeek();
    const dates = sp === 'week' ? U.weekDays(ws) : [curDay()];
    const cols = collect(dates);
    const isCurrent = sp === 'week' ? ws === store.weekStartOf(today) : curDay() === today;
    const nowMin = minutesOf(Date.now());
    const sub = sp === 'week' ? U.weekRangeLabel(ws) : U.fmt(curDay(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const feedsOn = T4.calfeeds ? T4.calfeeds.problems() : [];
    const hasFeeds = T4.calfeeds && T4.calfeeds.feeds.some((f) => f.enabled);

    const head = dates.map((d) => {
      const cls = (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '');
      const inner = '<span class="cal__wd">' + esc(U.fmt(d, { weekday: 'short' })) + '</span><span class="cal__num">' + Number(d.slice(8)) + '</span>';
      return '<div class="cal__dh' + cls + '">' + (sp === 'week'
        ? '<button type="button" class="cal__dhbtn" data-action="cal-day" data-date="' + d + '" title="Show this day" aria-label="Show ' + esc(U.fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' + inner + '</button>'
        : '<span class="cal__dhbtn">' + inner + '</span>') + '</div>';
    }).join('');

    const allDay = cols.map((c) => '<div class="cal__ad' + (c.date === today ? ' is-today' : '') + '" data-cal-allday="' + c.date + '">' +
      c.allDay.map((it) => allDayItem(it, c.date)).join('') +
      '<button type="button" class="cal__adadd" data-action="new-task" data-date="' + c.date + '" title="New task" aria-label="New task on ' + esc(U.fmt(c.date, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' + icon('plus') + '</button></div>').join('');

    const hours = Array.from({ length: 24 }, (_, h) => '<span class="cal__hour" style="top:' + pct(h * 60) + '%">' + (h ? esc(U.fmtTime(U.pad(h) + ':00')) : '') + '</span>').join('');

    const grid = cols.map((c) => '<div class="cal__col' + (c.date === today ? ' is-today' : '') + (c.date < today ? ' is-past' : '') + '" data-cal-date="' + c.date + '" role="group" aria-label="' + esc(U.fmt(c.date, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' +
      c.timed.map((it) => (it.kind === 'task' ? taskBlock(it, c.date) : eventBlock(it))).join('') +
      (c.date === today ? '<div class="cal__now" style="top:' + pct(nowMin) + '%" aria-hidden="true"></div>' : '') +
      '</div>').join('');

    return '<header class="page-head"><div><h1 class="page-title">Weekly Planner</h1>' +
        '<p class="page-sub">' + esc(sub) + (isCurrent ? ' · <span class="text-accent">' + (sp === 'week' ? 'This week' : 'Today') + '</span>' : '') + '</p></div>' +
        '<div class="page-actions">' + modeToggle('calendar') +
          (narrow() ? '' : '<div class="seg seg--sm" role="group" aria-label="Calendar range">' +
            '<button type="button" class="seg__btn" data-action="cal-span" data-span="day" aria-pressed="' + (sp === 'day') + '">Day</button>' +
            '<button type="button" class="seg__btn" data-action="cal-span" data-span="week" aria-pressed="' + (sp === 'week') + '">Week</button></div>') +
          '<div class="btn-group" role="group" aria-label="' + (sp === 'week' ? 'Week' : 'Day') + ' navigation">' +
            '<button type="button" class="btn" data-action="cal-nav" data-dir="-1" aria-label="Previous ' + sp + '">' + icon('chevron-left') + '</button>' +
            '<button type="button" class="btn" data-action="cal-nav" data-dir="0"' + (isCurrent ? ' disabled' : '') + '>' + (sp === 'week' ? 'This week' : 'Today') + '</button>' +
            '<button type="button" class="btn" data-action="cal-nav" data-dir="1" aria-label="Next ' + sp + '">' + icon('chevron-right') + '</button>' +
          '</div>' +
          (hasFeeds && T4.calfeeds.canSubscribe ? '<button type="button" class="icon-btn" data-action="cal-refresh-all" title="Update calendars" aria-label="Update subscribed calendars">' + icon('reset') + '</button>' : '') +
        '</div></header>' +
      feedsOn.map((p) => '<p class="callout callout--warn cal-problem">' + icon('alert') + '<span><strong>' + esc(p.name) + ':</strong> ' + esc(p.error) +
        (p.at ? ' Showing the version from ' + esc(U.fmtDateTime(p.at)) + '.' : '') + ' <a class="link" href="#/settings">Settings</a></span></p>').join('') +
      '<p class="muted small hint-dnd">Tip: drag a block to move it, drag its lower edge to change the length, click or drag in an empty slot to add a task. ' +
        'Keyboard: focus a block, then ↑/↓ moves it by 15 minutes, ←/→ by a day, Shift+↑/↓ changes the length.</p>' +
      '<p class="sr-only" id="cal-kbd-help">Arrow up or down moves the task by 15 minutes, arrow left or right by one day, Shift with arrow up or down changes its length. Enter opens it.</p>' +
      '<div class="cal' + (sp === 'day' ? ' cal--day' : '') + '" style="--cal-days:' + dates.length + '">' +
        '<div class="cal__main">' +
          '<div class="cal__scroller" id="cal-scroller">' +
            '<div class="cal__top">' +
              '<div class="cal__row cal__head"><div class="cal__corner"></div>' + head + '</div>' +
              '<div class="cal__row cal__allday"><div class="cal__corner cal__adlabel">All day</div>' + allDay + '</div>' +
            '</div>' +
            '<div class="cal__row cal__grid"><div class="cal__hours" aria-hidden="true">' + hours + '</div>' + grid + '</div>' +
          '</div>' +
        '</div>' +
        sideHtml() +
      '</div>';
  }

  function mount(root) {
    const sc = root.querySelector('#cal-scroller');
    if (!sc) return;
    const grid = sc.querySelector('.cal__grid');
    const hourPx = grid.getBoundingClientRect().height / 24;
    sc.scrollTop = scrollTop != null ? scrollTop : START_HOUR * hourPx - 10; // 06:00 at the top (with its label)
    sc.addEventListener('scroll', () => { scrollTop = sc.scrollTop; }, { passive: true });
  }

  // Keep the current-time line moving.
  setInterval(() => {
    const el = document.querySelector('.cal__now');
    if (el) el.style.top = pct(minutesOf(Date.now())) + '%';
  }, 60 * 1000);
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (T4.app.route.name === 'planner' && isActive() && !drag) T4.app.render(); });

  /* ======================= Changing tasks ======================= */
  /** Apply a calendar change to a task (with Undo). patch: { dueDate, dueTime } or { estimate }. */
  function applyChange(id, patch) {
    const t = store.getTask(id);
    if (!t) return null;
    const prev = { dueDate: t.dueDate, dueTime: t.dueTime, estimate: t.estimate, inbox: t.inbox, reminderSnooze: t.reminderSnooze };
    const next = Object.assign({}, patch);
    let msg;
    if ('estimate' in next) {
      if (next.estimate === (t.estimate || DEFAULT_MIN)) return null;
      msg = 'Length: ' + U.fmtMinutes(next.estimate);
    } else {
      if (next.dueDate === t.dueDate && next.dueTime === t.dueTime && !t.inbox) return null;
      next.inbox = false;
      if (next.dueDate !== t.dueDate || next.dueTime !== t.dueTime) next.reminderSnooze = null; // new occurrence (like the task editor)
      msg = (prev.dueDate ? 'Moved to ' : 'Scheduled for ') + U.relDate(next.dueDate) + (next.dueTime ? ', ' + U.fmtTime(next.dueTime) : ' (no time)');
    }
    const res = store.updateTask(id, next);
    if (res) {
      ui.toast(msg, 'success', 5000, { label: 'Undo', fn: () => { if (store.getTask(id)) { store.updateTask(id, prev); ui.toast('Change undone', 'info', 2000); } } });
    }
    return res;
  }

  function createAt(date, startMin, durMin) {
    if (ui.modalOpen) return;
    T4.tasks.openEditor(null, { dueDate: date, dueTime: fromMin(clamp(startMin, 0, DAY_MIN - SNAP)), estimate: durMin || null, priority: 'medium' });
  }

  /* ======================= Pointer interactions ======================= */
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return null;
    const ad = el.closest('[data-cal-allday]');
    if (ad) return { kind: 'allday', date: ad.dataset.calAllday, el: ad };
    const col = el.closest('.cal__col');
    if (col) {
      const r = col.getBoundingClientRect();
      return { kind: 'grid', date: col.dataset.calDate, min: (y - r.top) / r.height * DAY_MIN, el: col, r };
    }
    return null;
  }
  function colRect(date) {
    const col = document.querySelector('.cal__col[data-cal-date="' + date + '"]');
    return col ? col.getBoundingClientRect() : null;
  }

  let ghost = null;
  function ghostEl() {
    if (!ghost) { ghost = document.createElement('div'); ghost.setAttribute('aria-hidden', 'true'); }
    if (!ghost.isConnected) document.body.appendChild(ghost);
    return ghost;
  }
  function placeGhost(r, s, e, text, cls) {
    const g = ghostEl();
    g.className = 'cal-ghost ' + (cls || '');
    g.style.left = (r.left + 2) + 'px';
    g.style.top = (r.top + s / DAY_MIN * r.height) + 'px';
    g.style.width = Math.max(20, r.width - 4) + 'px';
    g.style.height = Math.max(10, (e - s) / DAY_MIN * r.height) + 'px';
    g.textContent = text;
  }
  function floatGhost(x, y, text, cls) {
    const g = ghostEl();
    g.className = 'cal-ghost cal-ghost--float ' + (cls || '');
    g.style.left = (x + 10) + 'px';
    g.style.top = (y + 8) + 'px';
    g.style.width = '';
    g.style.height = '';
    g.textContent = text;
  }
  function clearDrop() { U.$$('.cal__ad.is-drop').forEach((x) => x.classList.remove('is-drop')); }

  function startDrag() {
    drag.started = true;
    document.body.classList.add('cal-dragging');
    if (drag.src && drag.src.isConnected) drag.src.classList.add('is-dragging');
  }
  function endDrag() {
    if (drag && drag.timer) clearTimeout(drag.timer);
    stopAutoScroll();
    drag = null;
    document.body.classList.remove('cal-dragging');
    if (ghost) ghost.remove();
    clearDrop();
    U.$$('.cal .is-dragging, .cal-side .is-dragging').forEach((x) => x.classList.remove('is-dragging'));
  }

  // Auto-scroll when the pointer rests near the top or bottom edge of the grid (not while just passing through).
  let scrollTimer = null, scrollDir = 0;
  function stopAutoScroll() { clearTimeout(scrollTimer); scrollTimer = null; scrollDir = 0; }
  function autoScroll(y) {
    const sc = document.getElementById('cal-scroller');
    let dir = 0;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const top = r.top + (sc.querySelector('.cal__top') || { offsetHeight: 0 }).offsetHeight; // below the sticky day header
      dir = y > top && y < top + 24 ? -1 : y > r.bottom - 24 && y < r.bottom + 30 ? 1 : 0;
    }
    if (dir === scrollDir) return;
    stopAutoScroll();
    scrollDir = dir;
    if (!dir) return;
    const tick = () => {
      if (!drag || !drag.started || !sc.isConnected) { stopAutoScroll(); return; }
      sc.scrollTop += dir * 12;
      place(drag.lastX, drag.lastY);
      scrollTimer = setTimeout(tick, 40);
    };
    scrollTimer = setTimeout(tick, 350);
  }

  function update(x, y) {
    drag.lastX = x; drag.lastY = y;
    autoScroll(y);
    place(x, y);
  }
  function place(x, y) {
    clearDrop();
    const t = drag.task;
    if (drag.kind === 'resize') {
      const r = colRect(t.dueDate);
      if (!r) return;
      const s = toMin(t.dueTime);
      const e = clamp(snap((y - r.top) / r.height * DAY_MIN), s + SNAP, DAY_MIN);
      drag.result = { estimate: e - s };
      placeGhost(r, s, e, t.title + ' · ' + range(s, e) + ' (' + U.fmtMinutes(e - s) + ')', 'cal-ghost--task');
      return;
    }
    const tg = targetAt(x, y);
    if (drag.kind === 'move') {
      const dur = t.estimate || DEFAULT_MIN;
      if (tg && tg.kind === 'grid') {
        const s = clamp(snap(tg.min - drag.grabMin), 0, DAY_MIN - SNAP);
        drag.result = { dueDate: tg.date, dueTime: fromMin(s) };
        placeGhost(tg.r, s, Math.min(DAY_MIN, s + dur), t.title + ' · ' + U.fmt(tg.date, { weekday: 'short' }) + ' ' + range(s, Math.min(DAY_MIN, s + dur)), 'cal-ghost--task');
      } else if (tg && tg.kind === 'allday') {
        drag.result = { dueDate: tg.date, dueTime: null };
        tg.el.classList.add('is-drop');
        floatGhost(x, y, t.title + ' · ' + U.fmt(tg.date, { weekday: 'short' }) + ', no time', 'cal-ghost--task');
      } else {
        drag.result = null;
        floatGhost(x, y, t.title, 'cal-ghost--none');
      }
      return;
    }
    // create
    if (tg && tg.kind === 'grid' && tg.date === drag.anchor.date) {
      const a = drag.anchor.min;
      const m = clamp(snap(tg.min), 0, DAY_MIN);
      const s = m < a ? m : a;
      const e = m < a ? a + SNAP : Math.max(a + SNAP, m);
      drag.result = { date: tg.date, start: s, end: e };
      placeGhost(tg.r, s, e, 'New task · ' + range(s, e), 'cal-ghost--new');
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary || drag) return;
    const t = e.target;
    if (!t || !t.closest || !t.closest('.cal, .cal-side')) return;
    if (t.closest('.cal-ev, .cal-chip--ev, .cal__adadd, .cal__dhbtn')) return; // read-only events, buttons
    const rs = t.closest('[data-cal-resize]');
    const blk = t.closest('[data-cal-task]');
    const chip = t.closest('[data-cal-drag]');
    const col = t.closest('.cal__col');
    let kind = null, id = null;
    if (rs) { kind = 'resize'; id = rs.dataset.calResize; }
    else if (blk) { kind = 'move'; id = blk.dataset.calTask; }
    else if (chip) { kind = 'move'; id = chip.dataset.calDrag; }
    else if (col && t === col) kind = 'create';
    if (!kind) return;
    const task = id ? store.getTask(id) : null;
    if (id && !task) return;
    const tg = targetAt(e.clientX, e.clientY);
    drag = { kind, task, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, touch: e.pointerType === 'touch', started: false, src: blk || chip || null, grabMin: 0, anchor: null, result: null };
    if (kind === 'move' && blk && tg && tg.kind === 'grid') drag.grabMin = tg.min - toMin(task.dueTime);
    if (kind === 'create') {
      if (!tg || tg.kind !== 'grid') { drag = null; return; }
      drag.anchor = { date: tg.date, min: clamp(Math.floor(tg.min / SNAP) * SNAP, 0, DAY_MIN - SNAP) };
    }
    if (drag.touch) {
      const d = drag;
      d.timer = setTimeout(() => { if (drag === d && !d.started) { startDrag(); update(d.x0, d.y0); if (navigator.vibrate) navigator.vibrate(10); } }, 380);
    } else if (kind !== 'move' || !blk) {
      e.preventDefault(); // no text selection while dragging out a new slot or resizing
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (drag.touch) { if (dist > 10) endDrag(); return; } // the finger scrolls
      if (dist < 4) return;
      startDrag();
    }
    e.preventDefault();
    update(e.clientX, e.clientY);
  });
  // Touch: once a long-press drag has started, the page must not scroll.
  document.addEventListener('touchmove', (e) => { if (drag && drag.started && e.cancelable) e.preventDefault(); }, { passive: false });

  document.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    endDrag();
    if (!d.started) {
      if (d.kind === 'create') createAt(d.anchor.date, d.anchor.min, null); // click on an empty slot
      return; // a click on a block opens the task (click event)
    }
    suppressClickUntil = Date.now() + 400;
    if (!d.result) return;
    if (d.kind === 'create') createAt(d.result.date, d.result.start, d.result.end - d.result.start);
    else applyChange(d.task.id, d.result);
  });
  document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(); });
  // The click that ends a drag must not also open the task editor.
  document.addEventListener('click', (e) => {
    if (Date.now() >= suppressClickUntil || !e.isTrusted) return;
    const t = e.target;
    if (t && t.closest && (t === document.body || t.closest('.cal, .cal-side'))) { e.preventDefault(); e.stopPropagation(); suppressClickUntil = 0; }
  }, true);

  /* ======================= Keyboard ======================= */
  document.addEventListener('keydown', (e) => {
    if (drag && e.key === 'Escape') { if (drag.started) suppressClickUntil = Date.now() + 400; endDrag(); e.preventDefault(); return; }
    const blk = e.target && e.target.closest && e.target.closest('[data-cal-task]');
    if (!blk || e.ctrlKey || e.metaKey || e.altKey || ui.modalOpen) return;
    const t = store.getTask(blk.dataset.calTask);
    if (!t || !t.dueTime) return;
    const s = toMin(t.dueTime), dur = t.estimate || DEFAULT_MIN;
    let patch = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (e.shiftKey) {
        const est = clamp(dur + dir * SNAP, SNAP, DAY_MIN - s);
        if (est !== dur) patch = { estimate: est };
      } else {
        const ns = clamp(snap(s) + dir * SNAP, 0, DAY_MIN - SNAP);
        if (ns !== s) patch = { dueDate: t.dueDate, dueTime: fromMin(ns) };
      }
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      patch = { dueDate: U.addDays(t.dueDate, e.key === 'ArrowLeft' ? -1 : 1), dueTime: t.dueTime };
    }
    if (!patch) return;
    e.preventDefault();
    if (patch.dueDate && patch.dueDate !== t.dueDate) { // keep the moved block on screen
      if (span() === 'day') day = patch.dueDate === U.today() ? null : patch.dueDate;
      T4.planner.setWeek(store.weekStartOf(patch.dueDate));
    }
    applyChange(t.id, patch);
  });

  /* ======================= Actions ======================= */
  ui.on('planner-mode', (el) => {
    prefs.mode = el.dataset.mode === 'calendar' ? 'calendar' : 'days';
    savePrefs();
    T4.app.render();
  });
  ui.on('cal-span', (el) => {
    prefs.span = el.dataset.span === 'day' ? 'day' : 'week';
    if (prefs.span === 'day') {
      const ws = T4.planner.currentWeek(), today = U.today();
      day = store.weekStartOf(today) === ws ? null : ws;
    }
    savePrefs();
    T4.app.render();
  });
  ui.on('cal-day', (el) => {
    prefs.span = 'day';
    day = el.dataset.date === U.today() ? null : el.dataset.date;
    savePrefs();
    T4.app.render();
  });
  ui.on('cal-nav', (el) => {
    const dir = Number(el.dataset.dir);
    if (span() === 'week') {
      T4.planner.setWeek(dir === 0 ? null : U.addDays(T4.planner.currentWeek(), dir * 7));
    } else {
      const d = dir === 0 ? U.today() : U.addDays(curDay(), dir);
      day = d === U.today() ? null : d;
      T4.planner.setWeek(store.weekStartOf(d));
    }
    T4.app.render();
  });
  ui.on('cal-event', (el) => {
    const ev = occMap[el.dataset.key] || (T4.calfeeds && T4.calfeeds.occurrences(U.today(), U.addDays(U.today(), 1)).find((o) => o.key === el.dataset.key));
    if (!ev) return;
    let when;
    if (ev.allDay) {
      const last = U.addDays(ev.end, -1);
      when = U.fmt(ev.start, { weekday: 'long', month: 'long', day: 'numeric' }) + (last !== ev.start ? ' – ' + U.fmt(last, { weekday: 'long', month: 'long', day: 'numeric' }) : '') + ' · All day';
    } else {
      when = U.fmt(new Date(ev.start), { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + T4.calfeeds.fmtRange(ev);
    }
    ui.openModal({
      title: ev.title,
      size: 'sm',
      body: '<div class="cal-evd">' +
        '<p class="cal-evd__row">' + icon('clock') + '<span>' + esc(when) + '</span></p>' +
        (ev.location ? '<p class="cal-evd__row">' + icon('pin') + '<span>' + esc(ev.location) + '</span></p>' : '') +
        '<p class="cal-evd__row"><span class="cal-evd__dot" style="--ev:' + esc(ev.color) + '"></span><span>' + esc(ev.calName) + (ev.recurring ? ' · repeats' : '') + ' · read-only</span></p>' +
        (ev.description ? '<div class="cal-evd__desc">' + U.escMultiline(ev.description) + '</div>' : '') +
        '<p class="muted small">Events from subscribed calendars can only be changed in Outlook or Google Calendar.</p></div>',
      footer: '<button type="button" class="btn btn--primary" data-action="modal-close">Close</button>',
    });
  });

  return {
    active, isActive, leave, render, mount, modeToggle, applyChange, layout,
    get dragging() { return !!(drag && drag.started); },
    get prefs() { return Object.assign({}, prefs); },
  };
})();
