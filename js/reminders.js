/* Todo4Me — task reminders.
 *
 * Model (see README "Data model"): task.reminder = minutes before the due date/time
 * (0 = at due time, null = no reminder). Tasks with a due date but no time use the
 * "reminder time" setting (default 09:00). Because the offset is relative, a reminder
 * moves with the task when it is rescheduled, and the next occurrence of a recurring
 * task automatically gets its own reminder.
 *
 * Bookkeeping, stored on the task so it survives restarts, export/import and merge:
 *  - reminderFired:  key of the occurrence whose reminder was shown ("date time|minutes").
 *                    Changing the due date/time or the offset makes a new key → a new reminder.
 *  - reminderSnooze: ISO time a snoozed reminder is shown again (or null).
 *
 * Delivery: the desktop app shows Windows notifications through the preload bridge
 * (main process, works while the window is hidden in the tray); the browser uses the Web
 * Notification API when permitted. An in-app toast with "Snooze 10 min" is always shown too,
 * so nothing depends on the system notification actually appearing.
 *
 * The scheduler is testable: check({ now }) takes an explicit time, setClock() replaces the
 * clock and setNotifier() captures system notifications instead of showing them. */
T4.reminders = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const bridge = window.todo4meDesktop && window.todo4meDesktop.isDesktop && typeof window.todo4meDesktop.notify === 'function' ? window.todo4meDesktop : null;

  const OPTIONS = [[0, 'At due time'], [5, '5 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];
  const SNOOZE_MIN = 10;
  const TICK_MS = 30 * 1000;  // safety net; the next reminder is also timed exactly
  const BURST = 3;            // more reminders than this at once → one summary notification

  let clock = () => new Date();
  let notifier = null;        // tests: function(notification) instead of the system notification
  let timer = null, started = false;

  /* ---------- Pure helpers ---------- */
  function label(min) {
    if (min == null) return 'No reminder';
    const o = OPTIONS.find((x) => x[0] === min);
    if (o) return o[1];
    if (min % 1440 === 0) return U.plural(min / 1440, 'day') + ' before';
    if (min % 60 === 0) return U.plural(min / 60, 'hour') + ' before';
    return U.plural(min, 'minute') + ' before';
  }

  /** When the reminder of this task fires (Date), or null if it has none. */
  function fireAt(task, settings) {
    if (!task || task.reminder == null || !U.isDateStr(task.dueDate)) return null;
    const time = U.isTimeStr(task.dueTime) ? task.dueTime : (settings && U.isTimeStr(settings.reminderTime) ? settings.reminderTime : '09:00');
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm - Number(task.reminder), 0, 0);
  }

  /** Identifies one occurrence of a reminder; it fires at most once per key. */
  function occurrenceKey(task) {
    return task.dueDate + ' ' + (task.dueTime || '') + '|' + task.reminder;
  }

  /** Reminders that are due at `now` (not completed, not fired yet, snooze elapsed), oldest first. */
  function pending(tasks, settings, now) {
    const out = [];
    const t0 = +now;
    tasks.forEach((task) => {
      if (task.status === 'done') return;
      if (task.reminderSnooze) {
        const s = Date.parse(task.reminderSnooze);
        if (s <= t0) out.push({ task, at: new Date(s), snoozed: true });
        return; // a snoozed reminder waits for its snooze time
      }
      const at = fireAt(task, settings);
      if (!at || +at > t0 || task.reminderFired === occurrenceKey(task)) return;
      out.push({ task, at, snoozed: false });
    });
    return out.sort((a, b) => a.at - b.at);
  }

  /** The next time a reminder will be due after `now` (Date), or null. */
  function nextAt(tasks, settings, now) {
    let best = null;
    tasks.forEach((task) => {
      if (task.status === 'done') return;
      let at = null;
      if (task.reminderSnooze) at = new Date(Date.parse(task.reminderSnooze));
      else if (task.reminderFired !== occurrenceKey(task)) at = fireAt(task, settings);
      if (at && +at > +now && (!best || at < best)) best = at;
    });
    return best;
  }

  function dueText(task) {
    if (!task.dueDate) return '';
    const rel = U.relDate(task.dueDate);
    const day = rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday' ? rel.toLowerCase() : rel;
    return 'Due ' + day + (task.dueTime ? ' at ' + U.fmtTime(task.dueTime) : '');
  }

  /* ---------- Firing ---------- */
  /**
   * Show every reminder that is due. opts: { now: Date, startup: bool }.
   * Returns { fired: [taskIds], summary: bool, notifications: [...] }.
   * Reminders are marked as fired *before* they are shown, so one can never appear twice.
   */
  function check(opts) {
    opts = opts || {};
    const now = opts.now || clock();
    const due = pending(store.data.tasks, store.settings, now);
    if (!due.length) return { fired: [], summary: false, notifications: [] };

    store.commit((d) => {
      due.forEach((r) => {
        const t = d.tasks.find((x) => x.id === r.task.id);
        if (!t) return;
        if (!r.snoozed) t.reminderFired = occurrenceKey(t);
        t.reminderSnooze = null;
      });
    }, { type: 'reminders', silent: true });

    const notes = [];
    const summary = due.length > BURST || (!!opts.startup && due.length > 1);
    if (summary) {
      const titles = due.map((r) => r.task.title);
      notes.push({
        id: 'summary',
        title: opts.startup ? U.plural(due.length, 'reminder') + ' missed' : U.plural(due.length, 'reminder'),
        body: titles.slice(0, 3).join(', ') + (titles.length > 3 ? ' and ' + (titles.length - 3) + ' more' : '') +
          (opts.startup ? ' (while Todo4Me was closed)' : ''),
        taskId: null,
      });
    } else {
      due.forEach((r) => {
        const missed = opts.startup && +r.at < +now - 60 * 1000;
        notes.push({
          id: 'task:' + r.task.id,
          title: r.task.title.slice(0, 120),
          body: (missed ? 'Missed while Todo4Me was closed · ' : r.snoozed ? 'Snoozed reminder · ' : '') + dueText(r.task),
          taskId: r.task.id,
        });
      });
    }
    notes.forEach(deliver);
    return { fired: due.map((r) => r.task.id), summary, notifications: notes };
  }

  function deliver(n) {
    // In-app toast: always (works without any permission, offers Snooze).
    const actions = n.taskId
      ? [{ label: 'Open', fn: () => openTask(n.taskId) }, { label: 'Snooze ' + SNOOZE_MIN + ' min', fn: () => snooze(n.taskId) }]
      : n.id === 'summary' ? [{ label: 'Show', fn: () => { location.hash = '#/today'; } }] : null;
    ui.toast((n.taskId ? 'Reminder: ' : '') + n.title + (n.body ? ' — ' + n.body : ''), 'reminder', n.taskId || n.id === 'summary' ? 60000 : 8000, actions);
    // System notification.
    if (notifier) { try { notifier(n); } catch (e) { /* test hook */ } return; }
    if (bridge) {
      bridge.notify({ id: n.id, title: n.title, body: n.body, snooze: !!n.taskId })
        .then((res) => { if (res && !res.ok) console.info('[Todo4Me] system notification not shown:', res.error); })
        .catch(() => {});
      return;
    }
    browserNotify(n);
  }

  function browserNotify(n) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      const sys = new Notification(n.title, { body: n.body, tag: n.id, icon: 'assets/icons/icon.png' });
      sys.onclick = () => { try { window.focus(); sys.close(); } catch (e) { /* ignore */ } handleClick(n.id); };
      return true;
    } catch (e) {
      return false; // e.g. mobile browsers that only allow notifications from a service worker
    }
  }

  /** A click on a notification: 'task:<id>' opens the task, 'summary' shows Today. */
  function handleClick(id, action) {
    id = String(id || '');
    if (id === 'summary') { location.hash = '#/today'; return; }
    if (id.indexOf('task:') !== 0) return;
    const taskId = id.slice(5);
    if (action === 'snooze') { snooze(taskId); return; }
    openTask(taskId);
  }

  function openTask(taskId) {
    const t = store.getTask(taskId);
    if (!t) { ui.toast('This task no longer exists.', 'info'); return; }
    if (ui.modalOpen || document.getElementById('confirm').open) {
      // Never throw away a dialog the user is working in.
      ui.toast('Reminder: ' + t.title, 'reminder', 20000, { label: 'Open task', fn: () => T4.tasks.openEditor(store.getTask(taskId)) });
      return;
    }
    T4.tasks.openEditor(t);
  }

  function snooze(taskId, minutes) {
    const t = store.getTask(taskId);
    if (!t || t.status === 'done') return false;
    const until = new Date(+clock() + (minutes || SNOOZE_MIN) * 60000).toISOString();
    store.commit((d) => {
      const x = d.tasks.find((y) => y.id === taskId);
      if (x) x.reminderSnooze = until;
    }, { type: 'reminders', silent: true });
    ui.toast('Snoozed — reminding you again in ' + (minutes || SNOOZE_MIN) + ' minutes', 'info', 3000);
    schedule();
    return true;
  }

  /* ---------- Scheduling ---------- */
  function schedule() {
    if (!started) return;
    clearTimeout(timer);
    const now = clock();
    const next = nextAt(store.data.tasks, store.settings, now);
    // Something is due already (e.g. a reminder was just set for a time that has passed): check right away.
    const dueNow = pending(store.data.tasks, store.settings, now).length > 0;
    const delay = dueNow ? 250 : next ? Math.max(250, Math.min(TICK_MS, +next - +now + 200)) : TICK_MS;
    timer = setTimeout(() => { try { check(); } catch (e) { console.warn('[Todo4Me] reminder check failed', e); } schedule(); }, delay);
  }

  let wired = false;
  function start() {
    if (started) return;
    started = true;
    try { check({ startup: true }); } catch (e) { console.warn('[Todo4Me] reminder check failed', e); }
    schedule();
    if (wired) return;
    wired = true;
    // Data changed (task edited, another tab, import): re-time the next reminder.
    store.subscribe((info) => { if (info.type !== 'reminders') schedule(); });
    // After sleep/hibernate timers are late: check as soon as the page is active again.
    document.addEventListener('visibilitychange', () => { if (started && !document.hidden) { check(); schedule(); } });
  }
  function stop() { started = false; clearTimeout(timer); }

  /* ---------- Permission / settings ---------- */
  function systemStatus() {
    if (bridge) return { kind: 'desktop', text: 'Reminders appear as Windows notifications — also while Todo4Me runs in the tray.' };
    if (!('Notification' in window)) return { kind: 'none', text: 'This browser cannot show system notifications; reminders appear inside Todo4Me while it is open.' };
    if (Notification.permission === 'granted') return { kind: 'granted', text: 'Reminders appear as browser notifications while Todo4Me is open in a tab.' };
    if (Notification.permission === 'denied') return { kind: 'denied', text: 'Notifications are blocked for this page in your browser settings; reminders appear inside Todo4Me only.' };
    return { kind: 'ask', text: 'Allow notifications so reminders also show up while this tab is in the background.' };
  }
  function requestPermission() {
    if (bridge || !('Notification' in window) || Notification.permission !== 'default') return Promise.resolve(false);
    try {
      const p = Notification.requestPermission();
      return (p && p.then ? p : Promise.resolve(Notification.permission)).then((r) => r === 'granted').catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  }
  ui.on('reminders-permission', () => {
    requestPermission().then((ok) => {
      ui.toast(ok ? 'Notifications allowed' : 'Notifications were not allowed — reminders appear inside Todo4Me.', ok ? 'success' : 'info');
      if (T4.app.route.name === 'settings') T4.app.render();
    });
  });
  ui.on('reminders-test', () => deliver({ id: 'test', title: 'Todo4Me', body: 'This is how reminders will look.', taskId: null }));

  document.addEventListener('DOMContentLoaded', () => { setTimeout(start, 1000); });

  return {
    OPTIONS, SNOOZE_MIN, label, fireAt, occurrenceKey, pending, nextAt, check, snooze, handleClick, openTask,
    systemStatus, requestPermission, start, stop, schedule,
    setClock(fn) { clock = typeof fn === 'function' ? fn : () => new Date(); },
    setNotifier(fn) { notifier = typeof fn === 'function' ? fn : null; },
    get started() { return started; },
  };
})();
