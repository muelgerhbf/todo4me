/* Todo4Me — Focus mode with a lightweight Pomodoro timer.
 * Timer state is kept in its own localStorage key so a refresh doesn't lose it. */
T4.focus = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store, tasks = T4.tasks;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);
  const KEY = 'todo4me.focus.v1';

  // { taskId, mode: 'focus'|'break', running, endsAt (ms), remaining (s) }
  let st = load();
  let ticker = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        return {
          taskId: typeof s.taskId === 'string' ? s.taskId : null,
          mode: s.mode === 'break' ? 'break' : 'focus',
          running: !!s.running && Number.isFinite(s.endsAt),
          endsAt: Number(s.endsAt) || 0,
          remaining: Number.isFinite(s.remaining) ? s.remaining : null,
        };
      }
    } catch (e) { /* ignore */ }
    return { taskId: null, mode: 'focus', running: false, endsAt: 0, remaining: null };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }

  const duration = (mode) => (mode === 'break' ? store.settings.pomodoroBreak : store.settings.pomodoroFocus) * 60;
  function secondsLeft() {
    if (st.running) return Math.max(0, Math.round((st.endsAt - Date.now()) / 1000));
    return st.remaining == null ? duration(st.mode) : st.remaining;
  }
  const mmss = (s) => U.pad(Math.floor(s / 60)) + ':' + U.pad(s % 60);

  function start() {
    st.endsAt = Date.now() + secondsLeft() * 1000;
    st.running = true;
    persist();
    ensureTicker();
    paint();
  }
  function pause() {
    st.remaining = secondsLeft();
    st.running = false;
    persist();
    paint();
  }
  function reset(mode) {
    st.mode = mode || st.mode;
    st.running = false;
    st.remaining = null;
    persist();
    paint();
  }

  function ensureTicker() {
    if (ticker) return;
    ticker = setInterval(tick, 1000);
  }
  function tick() {
    if (!st.running) { clearInterval(ticker); ticker = null; updateTitle(); return; }
    if (secondsLeft() <= 0) finishPhase();
    paint();
  }
  function finishPhase() {
    const was = st.mode;
    st.running = false;
    st.remaining = null;
    st.mode = was === 'focus' ? 'break' : 'focus';
    persist();
    beep();
    if (was === 'focus') {
      store.recordFocusSession();
      ui.toast(tt('fc.doneFocus', { n: store.settings.pomodoroBreak }), 'info', 8000);
    } else {
      ui.toast(tt('fc.doneBreak'), 'info', 8000);
    }
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch (e) { /* audio is optional */ }
  }

  function updateTitle() {
    document.title = st.running ? mmss(secondsLeft()) + ' · ' + tt(st.mode === 'focus' ? 'fc.focus' : 'fc.break') + ' — Todo4Me' : (T4.app ? T4.app.pageTitle() : 'Todo4Me');
  }

  /** Update only timer DOM (cheap; called every second). */
  function paint() {
    updateTitle();
    const el = document.getElementById('pomo');
    if (!el) return;
    const left = secondsLeft(), total = duration(st.mode);
    el.querySelector('.pomo__time').textContent = mmss(left);
    const ring = el.querySelector('.ring__bar');
    const c = Number(ring.getAttribute('stroke-dasharray'));
    ring.setAttribute('stroke-dashoffset', (c * (left / total)).toFixed(2));
    el.classList.toggle('is-break', st.mode === 'break');
    el.classList.toggle('is-running', st.running);
    const btn = el.querySelector('[data-action="pomo-toggle"]');
    btn.innerHTML = icon(st.running ? 'pause' : 'play') + esc(tt(st.running ? 'fc.pause' : (left < total ? 'fc.resume' : 'fc.start')));
    U.$$('[data-action="pomo-mode"]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
  }

  function pomodoroHtml() {
    const size = 200, r = 92, c = 2 * Math.PI * r;
    const sessions = store.data.stats.focusSessions[U.today()] || 0;
    return '<section class="pomo card" id="pomo" aria-label="' + esc(tt('fc.timer')) + '">' +
      '<div class="seg seg--sm" role="group" aria-label="' + esc(tt('fc.timerMode')) + '">' +
        '<button type="button" class="seg__btn" data-action="pomo-mode" data-mode="focus" aria-pressed="' + (st.mode === 'focus') + '">' + esc(tt('fc.focusMin', { n: store.settings.pomodoroFocus })) + '</button>' +
        '<button type="button" class="seg__btn" data-action="pomo-mode" data-mode="break" aria-pressed="' + (st.mode === 'break') + '">' + esc(tt('fc.breakMin', { n: store.settings.pomodoroBreak })) + '</button>' +
      '</div>' +
      '<div class="pomo__ring"><svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle class="ring__track" cx="100" cy="100" r="' + r + '"/>' +
        '<circle class="ring__bar" cx="100" cy="100" r="' + r + '" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="0"/></svg>' +
        '<div class="pomo__center"><span class="pomo__time" role="timer" aria-live="off">' + mmss(secondsLeft()) + '</span>' +
        '<span class="pomo__mode">' + esc(tt(st.mode === 'focus' ? 'fc.focus' : 'fc.break')) + '</span></div></div>' +
      '<div class="pomo__controls">' +
        '<button type="button" class="btn btn--primary" data-action="pomo-toggle"></button>' +
        '<button type="button" class="btn" data-action="pomo-reset">' + icon('reset') + esc(tt('fc.reset')) + '</button>' +
      '</div>' +
      '<p class="muted small">' + esc(tt('fc.sessions', { count: sessions })) + '</p>' +
      '</section>';
  }

  ui.on('pomo-toggle', () => (st.running ? pause() : start()));
  ui.on('pomo-reset', () => reset());
  ui.on('pomo-mode', (el) => {
    if (st.mode === el.dataset.mode) return;
    reset(el.dataset.mode);
  });

  /* ---------- Task selection ---------- */
  function select(id) {
    st.taskId = id;
    persist();
  }
  ui.on('focus-select', (el) => { select(el.dataset.id); T4.app.render(); });
  ui.on('focus-switch', () => { select(null); T4.app.render(); });
  ui.on('focus-exit', () => { location.hash = '#/dashboard'; });
  ui.on('focus-subtask', (el) => store.toggleSubtask(el.dataset.id, el.dataset.sub));
  ui.on('focus-start', (el) => {
    const t = store.getTask(el.dataset.id);
    if (t && t.status === 'todo') { store.setStatus(t.id, 'in_progress'); ui.toast(tt('tk.markedIn_progress'), 'info'); }
  });

  function pickerHtml() {
    const today = U.today();
    const top = store.getPlan(today).top3.map(store.getTask).filter((t) => t && store.isOpen(t));
    const rest = store.sortTasks(store.data.tasks.filter((t) => store.isOpen(t) && !top.includes(t) &&
      (!t.dueDate || t.dueDate <= U.addDays(today, 7))));
    const item = (t, star) => '<li><button type="button" class="pick-task prio-' + (t.priority || 'none') + '" data-action="focus-select" data-id="' + t.id + '">' +
      (star ? icon('star', 'text-accent') : '<span class="prio-dot"></span>') + '<span class="pick-task__title">' + esc(t.title) + '</span>' +
      '<span class="task__meta">' + tasks.priorityBadge(t.priority) + tasks.dueChip(t) + '</span></button></li>';
    if (!top.length && !rest.length) {
      return ui.emptyState('target', tt('fc.nothing'), tt('fc.nothingText'), '<button type="button" class="btn btn--primary" data-action="new-task">' + icon('plus') + esc(tt('tk.newTask')) + '</button>');
    }
    return '<div class="focus-picker">' +
      '<h2 class="focus-picker__title">' + esc(tt('fc.what')) + '</h2>' +
      (top.length ? '<h3 class="subhead">' + icon('star') + esc(tt('fc.todayTop3')) + '</h3><ul class="pick-tasks" role="list">' + top.map((t) => item(t, true)).join('') + '</ul>' : '') +
      (rest.length ? '<h3 class="subhead">' + esc(tt('fc.openTasks')) + '</h3><ul class="pick-tasks" role="list">' + rest.slice(0, 30).map((t) => item(t)).join('') + '</ul>' : '') +
      '</div>';
  }

  function taskHtml(t) {
    const done = t.status === 'done';
    if (done) {
      return '<section class="focus-card card is-done">' +
        '<div class="focus-done">' + icon('check') + '</div>' +
        '<h2 class="focus-card__title">' + esc(t.title) + '</h2>' +
        '<p class="muted">' + esc(tt('fc.completedNice')) + '</p>' +
        '<div class="focus-card__actions"><button type="button" class="btn btn--primary" data-action="focus-switch">' + icon('target') + esc(tt('fc.pickNext')) + '</button>' +
        '<button type="button" class="btn" data-action="toggle-task" data-id="' + t.id + '">' + icon('reset') + esc(tt('fc.reopen')) + '</button></div></section>';
    }
    const subDone = t.subtasks.filter((s) => s.done).length;
    return '<section class="focus-card card prio-' + (t.priority || 'none') + '">' +
      '<div class="task__meta">' + tasks.priorityBadge(t.priority) + tasks.categoryChip(t.categoryId) + tasks.dueChip(t) +
        (t.status === 'in_progress' ? '<span class="chip chip--progress">' + icon('progress') + esc(tt('status.in_progress')) + '</span>' : '') +
        (t.estimate ? '<span class="chip">' + icon('clock') + U.fmtMinutes(t.estimate) + '</span>' : '') + '</div>' +
      '<h2 class="focus-card__title">' + esc(t.title) + '</h2>' +
      (t.description ? '<p class="focus-card__desc">' + U.escMultiline(t.description) + '</p>' : '') +
      (t.subtasks.length ? '<div class="focus-subs"><h3 class="subhead">' + esc(tt('fc.checklist')) + ' <span class="count">' + subDone + '/' + t.subtasks.length + '</span></h3>' +
        ui.progressBar(subDone / t.subtasks.length, tt('fc.checklistProgress')) +
        '<ul class="subtasks" role="list">' + t.subtasks.map((s) =>
          '<li class="subtask' + (s.done ? ' is-done' : '') + '"><button type="button" class="check check--sm" role="checkbox" aria-checked="' + s.done + '" data-action="focus-subtask" data-id="' + t.id + '" data-sub="' + s.id + '" aria-label="' + esc(s.title) + '">' + icon('check') + '</button>' +
          '<span>' + esc(s.title) + '</span></li>').join('') + '</ul></div>' : '') +
      (t.notes ? '<details class="focus-notes"><summary>' + esc(tt('tk.fNotes')) + '</summary><p>' + U.escMultiline(t.notes) + '</p></details>' : '') +
      '<div class="focus-card__actions">' +
        '<button type="button" class="btn btn--primary btn--lg" data-action="toggle-task" data-id="' + t.id + '">' + icon('check') + esc(tt('fc.markComplete')) + '</button>' +
        (t.status === 'todo' ? '<button type="button" class="btn" data-action="focus-start" data-id="' + t.id + '">' + icon('play') + esc(tt('fc.start')) + '</button>' : '') +
        '<button type="button" class="btn btn--ghost" data-action="edit-task" data-id="' + t.id + '">' + icon('edit') + esc(tt('c.edit')) + '</button>' +
        '<button type="button" class="btn btn--ghost" data-action="focus-switch">' + icon('repeat') + esc(tt('fc.switch')) + '</button>' +
      '</div></section>';
  }

  T4.views.focus = {
    get title() { return tt('nav.focus'); },
    bodyClass: 'is-focus',
    render() {
      const t = st.taskId ? store.getTask(st.taskId) : null;
      if (st.taskId && !t) { st.taskId = null; persist(); }
      return '<div class="focus-wrap">' +
        '<header class="focus-top"><span class="focus-top__label">' + icon('target') + esc(tt('nav.focus')) + '</span>' +
          '<button type="button" class="btn btn--ghost" data-action="focus-exit">' + icon('x') + esc(tt('fc.exit')) + ' <kbd>Esc</kbd></button></header>' +
        '<div class="focus-layout">' +
          '<div class="focus-main">' + (t ? taskHtml(t) : pickerHtml()) + '</div>' +
          '<aside class="focus-side">' + pomodoroHtml() + '</aside>' +
        '</div></div>';
    },
    mount() { paint(); if (st.running) ensureTicker(); },
  };

  // Resume a running timer after reload.
  if (st.running) ensureTicker();

  return { select, get running() { return st.running; }, paint };
})();
