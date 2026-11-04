/* Todo4Me — Weekly planner and Daily plan views. */
T4.planner = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store, tasks = T4.tasks;
  const { esc, icon } = U;

  let weekStart = null; // null → current week
  let planDate = null;  // null → today

  const currentWeek = () => weekStart || store.weekStartOf(U.today());

  /* ======================= Weekly planner ======================= */
  function dayColumn(d) {
    const today = U.today();
    const list = store.sortTasks(store.tasksOn(d));
    const done = list.filter((t) => t.status === 'done').length;
    const hasDeadline = list.some((t) => store.isOpen(t) && (t.priority === 'critical' || t.priority === 'high'));
    const cls = (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '');
    return '<section class="day' + cls + '" data-drop-date="' + d + '" aria-label="' + esc(U.fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' +
      '<button type="button" class="day__head" data-action="open-day" data-date="' + d + '" title="Open day">' +
        '<span class="day__wd">' + esc(U.fmt(d, { weekday: 'short' })) + '</span>' +
        '<span class="day__num">' + Number(d.slice(8)) + '</span>' +
        (hasDeadline ? '<span class="day__flag" title="Important deadline">' + icon('flag') + '</span>' : '') +
        '<span class="day__count">' + (list.length ? done + '/' + list.length : '') + '</span>' +
      '</button>' +
      (list.length ? '<ul class="task-list task-list--compact" role="list">' + list.map((t) => tasks.row(t, { hideDate: true, compact: true, draggable: true, hideCategory: true, actions: false })).join('') + '</ul>'
        : '<p class="day__empty">No tasks</p>') +
      '<form class="day__add" data-form="quick-add" data-defaults="' + esc(JSON.stringify({ dueDate: d, priority: 'medium' })) + '" id="qa-day-' + d + '">' +
        '<input type="text" name="title" maxlength="500" autocomplete="off" placeholder="+ Add task" aria-label="Add task on ' + esc(U.fmt(d, { weekday: 'long' })) + '">' +
      '</form>' +
      '</section>';
  }

  T4.views.planner = {
    title: 'Weekly Planner',
    render(params) {
      // "Calendar" view (hour grid, js/calendar.js); "Days" below is the original planner.
      if (T4.calendar && T4.calendar.active(params)) return T4.calendar.render(params);
      const ws = currentWeek();
      const days = U.weekDays(ws);
      const we = days[6];
      const isCurrent = ws === store.weekStartOf(U.today());
      const weekTasks = store.planned().filter((t) => t.dueDate && t.dueDate >= ws && t.dueDate <= we);
      const done = weekTasks.filter((t) => t.status === 'done').length;
      const urgent = weekTasks.filter((t) => store.isOpen(t) && (t.priority === 'critical' || t.priority === 'high')).length;
      const notes = T4.notes.notesForWeek(ws);

      return '<header class="page-head"><div><h1 class="page-title">Weekly Planner</h1>' +
          '<p class="page-sub">' + esc(U.weekRangeLabel(ws)) + (isCurrent ? ' · <span class="text-accent">This week</span>' : '') + '</p></div>' +
          '<div class="page-actions">' + (T4.calendar ? T4.calendar.modeToggle('days') : '') +
            '<div class="btn-group" role="group" aria-label="Week navigation">' +
              '<button type="button" class="btn" data-action="week-nav" data-dir="-1" aria-label="Previous week">' + icon('chevron-left') + '</button>' +
              '<button type="button" class="btn" data-action="week-nav" data-dir="0"' + (isCurrent ? ' disabled' : '') + '>This week</button>' +
              '<button type="button" class="btn" data-action="week-nav" data-dir="1" aria-label="Next week">' + icon('chevron-right') + '</button>' +
            '</div></div></header>' +
        '<section class="week-summary">' +
          '<div class="week-summary__item"><strong>' + weekTasks.length + '</strong> scheduled</div>' +
          '<div class="week-summary__item"><strong>' + done + '</strong> completed</div>' +
          '<div class="week-summary__item"><strong>' + (weekTasks.length - done) + '</strong> open</div>' +
          '<div class="week-summary__item' + (urgent ? ' text-danger' : '') + '"><strong>' + urgent + '</strong> high priority</div>' +
          '<div class="week-summary__bar">' + ui.progressBar(weekTasks.length ? done / weekTasks.length : 0, 'Week progress') + '</div>' +
        '</section>' +
        '<p class="muted small hint-dnd">Tip: drag tasks between days to reschedule. Click a day for details.</p>' +
        '<div class="week-grid">' + days.map(dayColumn).join('') + '</div>' +
        '<section class="section mt-lg"><div class="section__head"><h2 class="section__title">' + icon('note') + 'Notes for this week <span class="count">' + notes.length + '</span></h2>' +
          '<button type="button" class="btn btn--sm" data-action="new-note" data-week="' + ws + '">' + icon('plus') + 'Add note</button></div>' +
          (notes.length ? '<div class="notes-grid">' + notes.map(T4.notes.card).join('') + '</div>'
            : '<p class="muted small">No notes for this week yet.</p>') +
        '</section>';
    },
    mount(root) { if (T4.calendar && T4.calendar.isActive()) T4.calendar.mount(root); },
    leave() { if (T4.calendar) T4.calendar.leave(); },
  };

  ui.on('week-nav', (el) => {
    const dir = Number(el.dataset.dir);
    weekStart = dir === 0 ? null : U.addDays(currentWeek(), dir * 7);
    if (weekStart === store.weekStartOf(U.today())) weekStart = null;
    T4.app.render();
  });

  /* ---------- Day detail modal ---------- */
  function dayBody(d) {
    const list = store.sortTasks(store.tasksOn(d));
    const done = list.filter((t) => t.status === 'done').length;
    return '<div class="day-modal__summary">' + U.plural(list.length, 'task') + ' · ' + done + ' completed' +
        (list.length ? ui.progressBar(done / list.length, 'Day progress') : '') + '</div>' +
      tasks.list(list, { hideDate: true, top3Date: d }, ui.emptyState('calendar', 'Nothing scheduled', 'Add a task for this day below.')) +
      '<form class="quick-add mt" data-form="quick-add" data-defaults="' + esc(JSON.stringify({ dueDate: d, priority: 'medium' })) + '" id="qa-daymodal">' +
        icon('plus', 'quick-add__icon') + '<input type="text" name="title" maxlength="500" autocomplete="off" placeholder="Add a task for this day…" aria-label="New task title">' +
        '<button type="submit" class="btn btn--primary btn--sm">Add</button></form>';
  }

  function openDay(d) {
    ui.openModal({
      title: U.fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }) + (d === U.today() ? ' · Today' : ''),
      size: 'lg',
      body: dayBody(d),
      refresh: () => dayBody(d),
      footer: '<a class="btn btn--ghost mr-auto" href="#/plan?date=' + d + '" data-action="modal-close">' + icon('book') + 'Open daily plan</a>' +
        '<button type="button" class="btn btn--primary" data-action="modal-close">Done</button>',
    });
  }
  ui.on('open-day', (el) => openDay(el.dataset.date));

  /* ---------- Drag & drop rescheduling ---------- */
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const li = e.target.closest && e.target.closest('.task[draggable="true"]');
    if (!li) return;
    dragId = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    li.classList.add('is-dragging');
  });
  document.addEventListener('dragend', (e) => {
    const li = e.target.closest && e.target.closest('.task');
    if (li) li.classList.remove('is-dragging');
    U.$$('.day.is-drop').forEach((x) => x.classList.remove('is-drop'));
    dragId = null;
  });
  document.addEventListener('dragover', (e) => {
    const day = dragId && e.target.closest && e.target.closest('[data-drop-date]');
    if (!day) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    U.$$('.day.is-drop').forEach((x) => { if (x !== day) x.classList.remove('is-drop'); });
    day.classList.add('is-drop');
  });
  document.addEventListener('drop', (e) => {
    const day = dragId && e.target.closest && e.target.closest('[data-drop-date]');
    if (!day) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    const t = store.getTask(id);
    const date = day.dataset.dropDate;
    if (t && t.dueDate !== date) {
      store.updateTask(id, { dueDate: date, inbox: false });
      ui.toast('Moved to ' + U.relDate(date));
    }
  });

  /* ======================= Daily plan ======================= */
  const pending = {};
  function savePlanField(date, key, value) {
    store.updatePlan(date, { [key]: value }, { silent: true });
    const ind = document.getElementById('plan-saved');
    if (ind) { ind.textContent = 'Saved'; ind.classList.add('is-on'); }
  }
  function queueSave(date, key, value) {
    const id = date + '|' + key;
    clearTimeout(pending[id] && pending[id].t);
    pending[id] = { date, key, value, t: setTimeout(() => { delete pending[id]; savePlanField(date, key, value); }, 500) };
    const ind = document.getElementById('plan-saved');
    if (ind) { ind.textContent = 'Saving…'; ind.classList.remove('is-on'); }
  }
  function flushPlanSaves() {
    Object.keys(pending).forEach((id) => {
      const p = pending[id];
      clearTimeout(p.t);
      delete pending[id];
      savePlanField(p.date, p.key, p.value);
    });
  }
  window.addEventListener('beforeunload', flushPlanSaves);
  window.addEventListener('pagehide', flushPlanSaves);

  ui.on('input:plan-field', (el) => queueSave(el.dataset.date, el.dataset.key, el.value));
  ui.on('change:plan-field', (el) => {
    const id = el.dataset.date + '|' + el.dataset.key;
    if (pending[id]) { clearTimeout(pending[id].t); delete pending[id]; }
    if (store.getPlan(el.dataset.date)[el.dataset.key] !== el.value) savePlanField(el.dataset.date, el.dataset.key, el.value);
  });
  ui.on('plan-nav', (el) => {
    flushPlanSaves();
    const dir = Number(el.dataset.dir);
    const cur = planDate || U.today();
    planDate = dir === 0 ? null : U.addDays(cur, dir);
    if (planDate === U.today()) planDate = null;
    location.hash = '#/plan' + (planDate ? '?date=' + planDate : '');
  });

  T4.views.plan = {
    title: 'Daily Plan',
    render(params) {
      planDate = params && U.isDateStr(params.date) && params.date !== U.today() ? params.date : null;
      const d = planDate || U.today();
      const plan = store.getPlan(d);
      const dayTasks = store.sortTasks(store.tasksOn(d));
      const done = dayTasks.filter((t) => t.status === 'done').length;
      const isToday = d === U.today();
      const isPast = d < U.today();
      return '<header class="page-head"><div><h1 class="page-title">Daily Plan</h1>' +
          '<p class="page-sub">' + esc(U.fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) +
            (isToday ? ' · <span class="text-accent">Today</span>' : '') + '</p></div>' +
          '<div class="page-actions"><span class="saved-pill" id="plan-saved" aria-live="polite">' + (plan.updatedAt ? 'Saved' : '') + '</span>' +
            '<div class="btn-group" role="group" aria-label="Day navigation">' +
              '<button type="button" class="btn" data-action="plan-nav" data-dir="-1" aria-label="Previous day">' + icon('chevron-left') + '</button>' +
              '<button type="button" class="btn" data-action="plan-nav" data-dir="0"' + (isToday ? ' disabled' : '') + '>Today</button>' +
              '<button type="button" class="btn" data-action="plan-nav" data-dir="1" aria-label="Next day">' + icon('chevron-right') + '</button>' +
            '</div></div></header>' +
        '<div class="plan-grid">' +
          '<div class="dash-col">' +
            '<section class="card"><label class="card__title" for="plan-goal">' + icon('target') + 'Main goal</label>' +
              '<input id="plan-goal" class="goal-input" type="text" maxlength="500" data-input="plan-field" data-change="plan-field" data-key="goal" data-date="' + d + '" value="' + esc(plan.goal) + '" placeholder="If I achieve one thing ' + (isToday ? 'today' : 'this day') + ', it should be…"></section>' +
            T4.dashboard.top3Card(d, true) +
            '<section class="card"><div class="card__head"><h2 class="card__title">' + icon('list') + 'Tasks <span class="count">' + done + '/' + dayTasks.length + '</span></h2>' +
              '<button type="button" class="btn btn--sm btn--ghost" data-action="new-task" data-date="' + d + '">' + icon('plus') + 'New</button></div>' +
              tasks.list(dayTasks, { hideDate: true, top3Date: d }, '<p class="muted small">No tasks scheduled for this day.</p>') +
              '<form class="quick-add quick-add--flat mt-sm" data-form="quick-add" data-defaults="' + esc(JSON.stringify({ dueDate: d, priority: 'medium' })) + '" id="qa-plan">' +
                icon('plus', 'quick-add__icon') + '<input type="text" name="title" maxlength="500" autocomplete="off" placeholder="Add a task to this day…" aria-label="New task title"></form>' +
            '</section>' +
          '</div>' +
          '<div class="dash-col">' +
            '<section class="card"><label class="card__title" for="plan-notes">' + icon('note') + 'Daily notes</label>' +
              '<textarea id="plan-notes" class="plan-text" rows="7" data-input="plan-field" data-change="plan-field" data-key="notes" data-date="' + d + '" placeholder="Meetings, thoughts, things to remember today…">' + esc(plan.notes) + '</textarea></section>' +
            '<section class="card"><label class="card__title" for="plan-reflection">' + icon('sparkle') + 'Reflection</label>' +
              '<p class="muted small">' + (isPast || isToday ? 'What went well? What could be better? What did you learn?' : 'Come back at the end of the day to reflect.') + '</p>' +
              '<textarea id="plan-reflection" class="plan-text" rows="6" data-input="plan-field" data-change="plan-field" data-key="reflection" data-date="' + d + '" placeholder="End-of-day reflection…">' + esc(plan.reflection) + '</textarea></section>' +
          '</div>' +
        '</div>';
    },
    leave: flushPlanSaves,
  };

  /** The week shown by the planner (both views); setWeek(null) = current week. */
  function setWeek(ws) {
    weekStart = ws && ws !== store.weekStartOf(U.today()) ? ws : null;
  }

  return { openDay, flushPlanSaves, currentWeek, setWeek };
})();
