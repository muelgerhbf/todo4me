/* Todo4Me — main dashboard + Top 3 picker. */
T4.dashboard = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store, tasks = T4.tasks;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);

  function stat(label, value, iconName, tone, hint) {
    return '<div class="stat stat--' + (tone || 'default') + '">' +
      '<span class="stat__icon">' + icon(iconName) + '</span>' +
      '<div><div class="stat__value">' + value + '</div><div class="stat__label">' + esc(label) + '</div>' +
      (hint ? '<div class="stat__hint">' + esc(hint) + '</div>' : '') + '</div></div>';
  }

  function summarySentence(open, overdue, important) {
    if (!open && !overdue) return tt('db.sumClear');
    // Dictionary text with <strong>; the only values are numbers.
    let s = tt(important ? 'db.sumLeftImp' : 'db.sumLeft', { count: open, important });
    if (overdue) s += ' <span class="text-danger">' + esc(tt('db.sumOverdue', { count: overdue })) + '</span>';
    return s;
  }

  /* ---------- Top 3 ---------- */
  function top3Card(date, compactHeader) {
    const plan = store.getPlan(date);
    const items = plan.top3.map(store.getTask).filter(Boolean);
    let slots = '';
    for (let i = 0; i < 3; i++) {
      const t = items[i];
      if (t) {
        const done = t.status === 'done';
        slots += '<li class="top3__item prio-' + (t.priority || 'none') + (done ? ' is-done' : '') + '">' +
          '<span class="top3__num">' + (i + 1) + '</span>' +
          '<button type="button" class="check" role="checkbox" aria-checked="' + done + '" data-action="toggle-task" data-id="' + t.id + '" aria-label="' + esc(tt(done ? 'tk.reopenLabel' : 'tk.completeLabel', { title: t.title })) + '">' + icon('check') + '</button>' +
          '<button type="button" class="top3__title" data-action="edit-task" data-id="' + t.id + '">' + esc(t.title) +
            '<span class="task__meta">' + tasks.priorityBadge(t.priority) + tasks.categoryChip(t.categoryId) + (t.dueDate && t.dueDate !== date ? tasks.dueChip(t) : '') + '</span></button>' +
          (done ? '' : '<button type="button" class="icon-btn icon-btn--sm" data-action="focus-task" data-id="' + t.id + '" aria-label="' + esc(tt('tk.focusOn')) + '" title="' + esc(tt('db.focus')) + '">' + icon('target') + '</button>') +
          '<button type="button" class="icon-btn icon-btn--sm" data-action="toggle-top3" data-id="' + t.id + '" data-date="' + date + '" aria-label="' + esc(tt('tk.removeTop3')) + '" title="' + esc(tt('tk.removeTop3')) + '">' + icon('x') + '</button>' +
          '</li>';
      } else {
        slots += '<li class="top3__item top3__item--empty"><span class="top3__num">' + (i + 1) + '</span>' +
          '<button type="button" class="top3__pick" data-action="pick-top3" data-date="' + date + '">' + icon('plus') + esc(tt('db.chooseImportant')) + '</button></li>';
      }
    }
    const doneCount = items.filter((t) => t.status === 'done').length;
    return '<section class="card card--top3" aria-labelledby="top3-h-' + date + '">' +
      '<div class="card__head"><h2 class="card__title" id="top3-h-' + date + '">' + icon('star') + esc(tt(compactHeader ? 'db.top3' : 'db.top3Today')) +
        (items.length ? ' <span class="count">' + doneCount + '/' + items.length + '</span>' : '') + '</h2>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="pick-top3" data-date="' + date + '">' + esc(tt('db.choose')) + '</button></div>' +
      (!compactHeader ? (plan.goal
        ? '<a class="goal" href="#/plan">' + icon('target') + '<span><span class="goal__label">' + esc(tt('db.mainGoal')) + '</span>' + esc(plan.goal) + '</span></a>'
        : '<a class="goal goal--empty" href="#/plan">' + icon('target') + '<span>' + esc(tt('db.setGoal')) + '</span></a>') : '') +
      '<ol class="top3" role="list">' + slots + '</ol></section>';
  }

  function openTop3Picker(date) {
    const plan = store.getPlan(date);
    let selected = plan.top3.slice();
    const candidates = store.sortTasks(store.data.tasks.filter((t) =>
      store.isOpen(t) && (!t.dueDate || t.dueDate <= U.addDays(date, 7)) || selected.includes(t.id)));
    const render = () => candidates.map((t) => {
      const on = selected.includes(t.id);
      const disabled = !on && selected.length >= 3;
      return '<li><label class="pick' + (on ? ' is-on' : '') + (disabled ? ' is-disabled' : '') + '">' +
        '<input type="checkbox" value="' + t.id + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
        '<span class="pick__title">' + esc(t.title) + '</span>' +
        '<span class="task__meta">' + tasks.priorityBadge(t.priority) + tasks.dueChip(t) + (t.inbox ? '<span class="chip">' + icon('inbox') + esc(tt('nav.inbox')) + '</span>' : '') + '</span>' +
        '</label></li>';
    }).join('');
    ui.openModal({
      title: tt('db.pickTitle', { date: U.relDate(date) }),
      body: '<p class="muted small mb">' + esc(tt(date === U.today() ? 'db.pickTextToday' : 'db.pickTextDay')) + ' <span id="pick-count"></span></p>' +
        (candidates.length ? '<ul class="pick-list" id="pick-list" role="list">' + render() + '</ul>'
          : ui.emptyState('list', tt('db.noOpenTasks'), tt('db.noOpenTasksText'), '<button type="button" class="btn btn--primary" data-action="new-task" data-date="' + date + '">' + icon('plus') + esc(tt('tk.newTask')) + '</button>')),
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button>' +
        '<button type="button" class="btn btn--primary" id="pick-save"' + (candidates.length ? '' : ' disabled') + '>' + esc(tt('db.saveTop3')) + '</button>',
      onMount(m) {
        const listEl = m.querySelector('#pick-list');
        const countEl = m.querySelector('#pick-count');
        const upd = () => { countEl.textContent = tt('db.selected', { n: selected.length }); };
        upd();
        if (listEl) listEl.addEventListener('change', (e) => {
          const id = e.target.value;
          selected = e.target.checked ? selected.concat(id).slice(0, 3) : selected.filter((x) => x !== id);
          listEl.innerHTML = render();
          const again = listEl.querySelector('input[value="' + id + '"]');
          if (again) again.focus();
          upd();
        });
        m.querySelector('#pick-save').addEventListener('click', () => {
          store.updatePlan(date, { top3: selected });
          ui.closeModal(true);
          ui.toast(tt('db.top3Saved'));
        });
      },
    });
  }
  ui.on('pick-top3', (el) => openTop3Picker(el.dataset.date || U.today()));

  /* ---------- Dashboard view ---------- */
  T4.views.dashboard = {
    get title() { return tt('nav.dashboard'); },
    render() {
      const today = U.today();
      const s = store.settings;
      const todays = store.tasksOn(today);
      const doneToday = todays.filter((t) => t.status === 'done');
      const openToday = store.sortTasks(todays.filter(store.isOpen));
      const overdue = store.sortTasks(store.overdueTasks());
      const pct = todays.length ? doneToday.length / todays.length : 0;
      const importantToday = openToday.filter((t) => t.priority === 'critical' || t.priority === 'high').length;

      // Important: critical/high open tasks that are overdue or due within 7 days, plus undated critical ones.
      const horizon = U.addDays(today, 7);
      const important = store.sortTasks(store.planned().filter((t) => store.isOpen(t) &&
        (t.priority === 'critical' || t.priority === 'high') && (!t.dueDate ? t.priority === 'critical' : t.dueDate <= horizon)), 'due').slice(0, 6);

      // This week
      const ws = store.weekStartOf(today), we = U.addDays(ws, 6);
      const weekTasks = store.planned().filter((t) => t.dueDate && t.dueDate >= ws && t.dueDate <= we);
      const weekDone = weekTasks.filter((t) => t.status === 'done').length;
      const upcoming = store.sortTasks(store.planned().filter((t) => store.isOpen(t) && t.dueDate && t.dueDate > today), 'due').slice(0, 5);
      const weekNotes = store.data.notes.filter((n) => store.weekStartOf(n.weekOf) === ws)
        .sort((a, b) => (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

      const strip = U.weekDays(ws).map((d) => {
        const dt = store.tasksOn(d);
        const dn = dt.filter((t) => t.status === 'done').length;
        const cls = d === today ? ' is-today' : d < today ? ' is-past' : '';
        const p = dt.length ? dn / dt.length : 0;
        return '<a class="strip__day' + cls + '" href="#/planner" title="' + esc(tt('db.stripTip', { date: U.fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }), done: dn, total: dt.length })) + '">' +
          '<span class="strip__wd">' + esc(U.fmt(d, { weekday: 'narrow' })) + '</span>' +
          '<span class="strip__num">' + Number(d.slice(8)) + '</span>' +
          '<span class="strip__bar"><span style="height:' + (p * 100).toFixed(0) + '%"></span></span>' +
          '<span class="strip__count">' + (dt.length ? dn + '/' + dt.length : '–') + '</span></a>';
      }).join('');

      const name = s.userName ? ', ' + esc(s.userName) : '';
      const todayList = overdue.slice(0, 5).concat(openToday);

      return '<section class="hero">' +
          '<div class="hero__text">' +
            '<p class="hero__date">' + esc(U.fmt(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '</p>' +
            '<h1 class="hero__title">' + U.greeting() + name + '</h1>' +
            '<p class="hero__sub">' + summarySentence(openToday.length, overdue.length, importantToday) + '</p>' +
          '</div>' +
          '<div class="hero__ring">' + ui.progressRing(pct, 96, tt('db.todayRing', { pct: Math.round(pct * 100) })) + '<span class="hero__ring-cap">' + esc(tt('db.todayCap')) + '</span></div>' +
        '</section>' +

        '<section class="card card--capture">' + tasks.quickAddForm({ inbox: true }, tt('db.quickPh'), 'qa-dash') + '</section>' +

        '<section class="stats" aria-label="' + esc(tt('db.glance')) + '">' +
          stat(tt('db.statTasks'), todays.length, 'calendar', 'default') +
          stat(tt('db.statDone'), doneToday.length, 'check', 'good') +
          stat(tt('db.statRemaining'), openToday.length, 'clock', 'accent') +
          stat(tt('db.statOverdue'), overdue.length, 'alert', overdue.length ? 'danger' : 'default') +
        '</section>' +

        '<div class="dash-grid">' +
          '<div class="dash-col">' +
            top3Card(today) +
            '<section class="card" aria-labelledby="dash-today-h">' +
              '<div class="card__head"><h2 class="card__title" id="dash-today-h">' + icon('sun') + esc(tt('db.todaysTasks')) + ' <span class="count">' + todayList.length + '</span></h2>' +
                '<a class="btn btn--sm btn--ghost" href="#/today">' + esc(tt('db.viewAll')) + ' ' + icon('arrow-right') + '</a></div>' +
              tasks.list(todayList, {}, ui.emptyState('sun', tt(todays.length ? 'tk.allDoneToday' : 'db.nothingToday'),
                tt(todays.length ? 'db.allDoneText' : 'db.nothingTodayText'),
                '<button type="button" class="btn btn--sm" data-action="new-task" data-date="' + today + '">' + icon('plus') + esc(tt('db.addForToday')) + '</button>')) +
              (doneToday.length ? '<p class="card__foot muted small">' + icon('check') + esc(tt('db.completedToday', { count: doneToday.length })) + '</p>' : '') +
            '</section>' +
            (T4.calfeeds ? T4.calfeeds.todayCard() : '') + // only when calendars are subscribed
          '</div>' +
          '<div class="dash-col">' +
            '<section class="card" aria-labelledby="dash-imp-h">' +
              '<div class="card__head"><h2 class="card__title" id="dash-imp-h">' + icon('zap') + esc(tt('db.important')) + '</h2></div>' +
              tasks.list(important, { compact: false }, '<p class="muted small">' + esc(tt('db.noImportant')) + '</p>') +
            '</section>' +
            '<section class="card" aria-labelledby="dash-week-h">' +
              '<div class="card__head"><h2 class="card__title" id="dash-week-h">' + icon('week') + esc(tt('db.thisWeek')) + '</h2>' +
                '<a class="btn btn--sm btn--ghost" href="#/planner">' + esc(tt('nav.short.planner')) + ' ' + icon('arrow-right') + '</a></div>' +
              '<div class="week-progress"><span>' + esc(tt('db.weekDone', { done: weekDone, total: weekTasks.length })) + '</span>' + ui.progressBar(weekTasks.length ? weekDone / weekTasks.length : 0, tt('db.weekProgress')) + '</div>' +
              '<div class="strip">' + strip + '</div>' +
              '<h3 class="subhead">' + esc(tt('db.comingUp')) + '</h3>' +
              (upcoming.length ? '<ul class="mini-list" role="list">' + upcoming.map((t) =>
                '<li><button type="button" class="mini-item prio-' + (t.priority || 'none') + '" data-action="edit-task" data-id="' + t.id + '"><span class="prio-dot"></span><span class="mini-item__title">' + esc(t.title) + '</span><span class="muted small">' + esc(U.relDate(t.dueDate)) + '</span></button></li>').join('') + '</ul>'
                : '<p class="muted small">' + esc(tt('db.noUpcoming')) + '</p>') +
              '<h3 class="subhead">' + esc(tt('db.weeklyNotes')) + ' <a class="link small" href="#/notes">' + esc(tt('db.allNotes')) + '</a></h3>' +
              (weekNotes.length ? '<ul class="mini-notes" role="list">' + weekNotes.map((n) =>
                '<li><button type="button" class="mini-note" data-action="edit-note" data-id="' + n.id + '">' + (n.pinned ? icon('pin', 'text-accent') : '') +
                '<span><strong>' + esc(n.title || tt('db.untitled')) + '</strong><span class="muted small clamp-2">' + esc(n.body) + '</span></span></button></li>').join('') + '</ul>'
                : '<p class="muted small">' + esc(tt('db.noNotesWeek')) + ' <button type="button" class="link" data-action="new-note">' + esc(tt('db.addNote')) + '</button></p>') +
            '</section>' +
          '</div>' +
        '</div>';
    },
  };

  return { top3Card, openTop3Picker };
})();
