/* Todo4Me — task components, editor, quick capture and task views
 * (Inbox, My Tasks, Today, Upcoming). */
T4.views = T4.views || {};

T4.tasks = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);

  // Labels are getters: they follow the active language at the time they are read.
  const lab = (o) => { Object.keys(o).forEach((k) => { const key = o[k]; Object.defineProperty(o, k, { get: () => (typeof key === 'string' ? tt(key) : key), enumerable: true }); }); return o; };
  const PRIORITY = {};
  ['critical', 'high', 'medium', 'low'].forEach((p) => { PRIORITY[p] = lab({ label: 'prio.' + p, hint: 'prio.hint.' + p }); });
  const STATUS = lab({ todo: 'status.todo', in_progress: 'status.in_progress', done: 'status.done' });
  const SORT_LABELS = lab({ priority: 'sort.priority', due: 'sort.due', created: 'sort.created', alpha: 'sort.alpha', status: 'sort.status' });

  /* ======================= Components ======================= */
  function priorityBadge(p) {
    if (!p) return '';
    return '<span class="badge badge--' + p + '" title="' + esc(PRIORITY[p].hint) + '">' + icon('flag') + PRIORITY[p].label + '</span>';
  }

  function categoryChip(id) {
    const c = store.category(id);
    if (!c) return '';
    return '<span class="chip chip--cat"><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</span>';
  }

  function dueChip(t) {
    if (!t.dueDate) return '';
    const overdue = store.isOverdue(t);
    const today = t.dueDate === U.today();
    const cls = t.status === 'done' ? '' : overdue ? ' chip--danger' : today ? ' chip--accent' : '';
    return '<span class="chip' + cls + '">' + icon(t.dueTime ? 'clock' : 'calendar') +
      esc(U.relDate(t.dueDate)) + (t.dueTime ? ' · ' + esc(U.fmtTime(t.dueTime)) : '') + '</span>';
  }

  /**
   * One task row.
   * opts: { hideDate, hideCategory, draggable, compact, top3Date, actions:false }
   */
  function row(t, opts) {
    opts = opts || {};
    const done = t.status === 'done';
    const top3Date = opts.top3Date || U.today();
    const inTop3 = store.getPlan(top3Date).top3.includes(t.id);
    const subDone = t.subtasks.filter((s) => s.done).length;
    const meta = [];
    if (t.status === 'in_progress') meta.push('<span class="chip chip--progress">' + icon('progress') + esc(STATUS.in_progress) + '</span>');
    if (!opts.hideDate) meta.push(dueChip(t));
    if (!opts.compact) meta.push(priorityBadge(t.priority));
    if (!opts.hideCategory) meta.push(categoryChip(t.categoryId));
    if (t.subtasks.length) meta.push('<span class="chip">' + icon('list') + subDone + '/' + t.subtasks.length + '</span>');
    if (t.estimate && !opts.compact) meta.push('<span class="chip">' + icon('clock') + U.fmtMinutes(t.estimate) + '</span>');
    if (t.recurrence) meta.push('<span class="chip" title="' + esc(tt('tk.repeats', { rule: T4.recur.describe(t.recurrence) })) + '">' + icon('repeat') + (opts.compact ? '' : esc(T4.recur.describe(t.recurrence, { short: true }))) + '</span>');
    if (t.reminder != null && t.dueDate && !done && T4.reminders) meta.push('<span class="chip chip--reminder" title="' + esc(tt('tk.reminderTip', { label: T4.reminders.label(t.reminder) })) + '">' + icon('bell') + '<span class="sr-only">' + esc(tt('tk.reminder')) + '</span></span>');
    if (!opts.compact) t.tags.forEach((g) => meta.push('<span class="chip chip--tag">#' + esc(g) + '</span>'));
    const metaHtml = meta.filter(Boolean).join('');

    return '<li class="task prio-' + (t.priority || 'none') + (done ? ' is-done' : '') + (store.isOverdue(t) ? ' is-overdue' : '') + (opts.compact ? ' task--compact' : '') + '" data-id="' + t.id + '"' +
      (opts.draggable ? ' draggable="true"' : '') + '>' +
      '<button type="button" class="check" role="checkbox" aria-checked="' + done + '" data-action="toggle-task" data-id="' + t.id + '" aria-label="' + esc(tt(done ? 'tk.reopenLabel' : 'tk.completeLabel', { title: t.title })) + '">' + icon('check') + '</button>' +
      '<button type="button" class="task__body" data-action="edit-task" data-id="' + t.id + '" aria-label="' + esc(tt('tk.editLabel', { title: t.title })) + '">' +
        '<span class="task__title">' + esc(t.title) + '</span>' +
        (metaHtml ? '<span class="task__meta">' + metaHtml + '</span>' : '') +
      '</button>' +
      (opts.actions === false ? '' :
      '<span class="task__actions">' +
        (done ? '' : '<button type="button" class="icon-btn icon-btn--sm' + (inTop3 ? ' is-on' : '') + '" data-action="toggle-top3" data-id="' + t.id + '" data-date="' + top3Date + '" aria-pressed="' + inTop3 + '" title="' + esc(tt(inTop3 ? 'tk.removeTop3' : 'tk.addTop3')) + '" aria-label="' + esc(tt(inTop3 ? 'tk.removeTop3' : 'tk.addTop3')) + '">' + icon('star') + '</button>') +
        (done ? '' : '<button type="button" class="icon-btn icon-btn--sm" data-action="focus-task" data-id="' + t.id + '" title="' + esc(tt('tk.focusOn')) + '" aria-label="' + esc(tt('tk.focusOn')) + '">' + icon('target') + '</button>') +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-task" data-id="' + t.id + '" title="' + esc(tt('c.delete')) + '" aria-label="' + esc(tt('tk.deleteTask')) + '">' + icon('trash') + '</button>' +
      '</span>') +
      '</li>';
  }

  function list(tasks, opts, empty) {
    if (!tasks.length) return empty || '';
    return '<ul class="task-list" role="list">' + tasks.map((t) => row(t, opts)).join('') + '</ul>';
  }

  /** Inline quick-add form. defaults is serialized onto the form. */
  function quickAddForm(defaults, placeholder, id) {
    return '<form class="quick-add" data-form="quick-add" data-defaults="' + esc(JSON.stringify(defaults || {})) + '"' + (id ? ' id="' + id + '"' : '') + '>' +
      icon('plus', 'quick-add__icon') +
      '<input type="text" name="title" maxlength="500" autocomplete="off" placeholder="' + esc(placeholder || tt('tk.addPlaceholder')) + '" aria-label="' + esc(tt('tk.newTaskTitle')) + '">' +
      '<span class="quick-add__hint" aria-hidden="true">' + esc(tt('tk.quickHint')) + '</span>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + esc(tt('c.add')) + '</button>' +
      '</form>';
  }

  /* ======================= Quick-add parsing ======================= */
  const PRIO_TOKENS = { '!1': 'critical', '!c': 'critical', '!critical': 'critical', '!2': 'high', '!h': 'high', '!high': 'high', '!3': 'medium', '!m': 'medium', '!medium': 'medium', '!4': 'low', '!l': 'low', '!low': 'low' };
  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /** Parse "Call mom !2 #personal @tomorrow every monday" → fields. */
  function parseQuickAdd(text) {
    const out = { tags: [] };
    const words = [];
    const src = String(text).trim().split(/\s+/);
    for (let i = 0; i < src.length; i++) {
      const w = src[i];
      const lw = w.toLowerCase();
      if (PRIO_TOKENS[lw]) { out.priority = PRIO_TOKENS[lw]; continue; }
      if (/^@\S+$/.test(lw)) {
        const d = parseDateWord(lw.slice(1));
        if (d) { out.dueDate = d; continue; }
      }
      if (!out.recurrence) {
        const rec = lw === 'every' ? parseEveryPhrase(src.slice(i + 1).map((x) => x.toLowerCase())) : parseRecurShorthand(lw);
        if (rec) { out.recurrence = rec.rule; i += rec.used; continue; }
      }
      if (/^#[\p{L}\p{N}_-]{1,40}$/u.test(w)) { // letters of any language: #büro, #einkäufe
        const name = lw.slice(1);
        const cat = store.data.categories.find((c) => c.name.toLowerCase() === name) ||
          store.data.categories.find((c) => c.name.toLowerCase().startsWith(name));
        if (cat && !out.categoryId) out.categoryId = cat.id;
        else out.tags.push(name);
        continue;
      }
      words.push(w);
    }
    out.title = words.join(' ');
    if (out.recurrence && !out.dueDate) out.dueDate = firstRecurDate(out.recurrence);
    return out;
  }

  /* ---- recurrence phrases: "every monday", "*weekly" ---- */
  const RECUR_UNITS = { day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month', year: 'year', years: 'year' };
  const RECUR_SHORT = {
    '*daily': { unit: 'day' }, '*weekly': { unit: 'week' }, '*monthly': { unit: 'month' }, '*yearly': { unit: 'year' },
    '*weekdays': { unit: 'week', weekdays: [1, 2, 3, 4, 5] },
  };
  function parseRecurShorthand(lw) {
    const r = RECUR_SHORT[lw];
    return r ? { rule: T4.recur.normalize(Object.assign({ every: 1 }, r)), used: 0 } : null;
  }
  /** "mon", "monday", "mondays" (at least 3 letters, prefix of the day name, optional plural s) → 0..6 or -1. */
  function dayIndexOf(w) {
    const x = w.length > 3 && w.endsWith('s') && DAY_NAMES.some((n) => n.startsWith(w.slice(0, -1))) ? w.slice(0, -1) : w;
    return x.length >= 3 ? DAY_NAMES.findIndex((n) => n.startsWith(x)) : -1;
  }
  /**
   * Words after "every" (lowercase) → { rule, used } (used = number of words consumed) or null when they are no valid rule
   * (then "every" simply stays in the title). Numbers outside 1..99 are rejected, not clamped.
   */
  function parseEveryPhrase(w) {
    let rule = null;
    let n = 0;
    const strip = (x) => (x || '').replace(/[.,;!?]+$/, '');
    if (w[0] === 'other' && RECUR_UNITS[strip(w[1])] === 'week') { rule = { unit: 'week', every: 2 }; n = 2; }
    else if (w[0] === 'other' && dayIndexOf(strip(w[1])) >= 0) { rule = { unit: 'week', every: 2, weekdays: [dayIndexOf(strip(w[1]))] }; n = 2; }
    else if (/^\d{1,3}$/.test(w[0] || '') && RECUR_UNITS[strip(w[1])]) {
      const k = Number(w[0]);
      if (k < 1 || k > 99) return null;
      rule = { unit: RECUR_UNITS[strip(w[1])], every: k }; n = 2;
    } else if (/^\d{1,2}(st|nd|rd|th)$/.test(strip(w[0]))) {
      const k = parseInt(w[0], 10);
      if (k < 1 || k > 31) return null;
      rule = { unit: 'month', every: 1, monthDay: k }; n = 1;
    } else if (w[0] === 'last' && strip(w[1]) === 'day') { rule = { unit: 'month', every: 1, monthDay: -1 }; n = 2; }
    else if (strip(w[0]) === 'weekday' || strip(w[0]) === 'weekdays') { rule = { unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] }; n = 1; }
    else if (RECUR_UNITS[strip(w[0])]) { rule = { unit: RECUR_UNITS[strip(w[0])], every: 1 }; n = 1; }
    if (!rule && w[0]) { // "mon", "mondays", "mon,wed,fri", "mon, wed"
      const days = [];
      for (let j = 0; j < w.length; j++) {
        const parts = w[j].split(',').filter(Boolean);
        const idx = parts.map((p) => dayIndexOf(strip(p)));
        if (!parts.length || idx.some((d) => d < 0)) break;
        days.push(...idx);
        n = j + 1;
        if (!w[j].endsWith(',')) break;
      }
      if (days.length) rule = { unit: 'week', every: 1, weekdays: days };
    }
    if (!rule) return null;
    if (w[n] === 'after' && strip(w[n + 1]) === 'done') { rule.from = 'done'; n += 2; }
    const norm = T4.recur.normalize(rule);
    return norm ? { rule: norm, used: n } : null;
  }
  /** First date >= today that fits the rule (every monday → next Monday or today; every 15th → next 15th; otherwise today). */
  function firstRecurDate(rule) {
    const t = U.today();
    if (!(rule.weekdays && rule.weekdays.length) && rule.monthDay == null) return t;
    for (let i = 0; i < 70; i++) {
      const d = U.addDays(t, i);
      const dt = U.parseDate(d);
      if (rule.weekdays && rule.weekdays.length) {
        if (rule.weekdays.includes(dt.getDay())) return d;
      } else {
        const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        if (dt.getDate() === (rule.monthDay === -1 ? last : Math.min(rule.monthDay, last))) return d;
      }
    }
    return t;
  }

  function parseDateWord(w) {
    const t = U.today();
    if (w === 'today' || w === 'tod') return t;
    if (w === 'tomorrow' || w === 'tom') return U.addDays(t, 1);
    if (w === 'nextweek') return U.addDays(store.weekStartOf(t), 7);
    // "@fri", "@frid", "@friday" — but not "@month" or "@satire" (must be a prefix of the day's name).
    const i = w.length >= 3 ? DAY_NAMES.findIndex((n) => n.startsWith(w)) : -1;
    if (i >= 0) {
      const cur = U.parseDate(t).getDay();
      return U.addDays(t, ((i - cur + 7) % 7) || 7);
    }
    if (U.isDateStr(w)) return w;
    return null;
  }

  /* ======================= Editor ======================= */
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const weekShort = (d) => T4.i18n.fmtWeekday(d, 'short');
  const weekLong = (d) => T4.i18n.fmtWeekday(d, 'long');
  /** Rule with the defaults of the due date filled in (weekday for weeks, day of month for months). */
  function fillRecurDefaults(rule, due) {
    const r = T4.recur.normalize(rule);
    if (!r) return null;
    const d = U.parseDate(due);
    if (r.unit === 'week' && !r.weekdays) r.weekdays = [d.getDay()];
    if (r.unit === 'month' && r.monthDay == null) r.monthDay = d.getDate();
    return r;
  }
  /** Markup of the inline controls for a custom repeat rule (filled and wired in openEditor). */
  function recurCustomHtml() {
    return '<div class="recur-custom" id="tf-recur-custom" hidden>' +
      '<div class="recur-custom__row"><label for="tf-r-every">' + esc(tt('tk.every')) + '</label>' +
        '<input id="tf-r-every" type="number" min="1" max="99" step="1" inputmode="numeric">' +
        '<select id="tf-r-unit" aria-label="' + esc(tt('tk.unit')) + '"><option value="day">' + esc(tt('tk.unitDays')) + '</option><option value="week">' + esc(tt('tk.unitWeeks')) + '</option><option value="month">' + esc(tt('tk.unitMonths')) + '</option><option value="year">' + esc(tt('tk.unitYears')) + '</option></select></div>' +
      '<div class="recur-custom__row" id="tf-r-week" role="group" aria-label="' + esc(tt('tk.repeatOnWeekdays')) + '" hidden><span class="label">' + esc(tt('tk.on')) + '</span><div class="seg">' +
        WEEK_ORDER.map((d) => '<button type="button" class="seg__btn" data-wd="' + d + '" aria-pressed="false" aria-label="' + esc(weekLong(d)) + '">' + esc(weekShort(d)) + '</button>').join('') + '</div></div>' +
      '<div class="recur-custom__row" id="tf-r-month" hidden><label for="tf-r-monthday">' + esc(tt('tk.onDay')) + '</label><select id="tf-r-monthday">' +
        Array.from({ length: 31 }, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + '</option>').join('') + '<option value="-1">' + esc(tt('tk.lastDay')) + '</option></select></div>' +
      '<label class="checkbox"><input type="checkbox" id="tf-r-done"><span>' + esc(tt('tk.countFromDone')) + '</span></label>' +
      '<p class="recur-custom__preview" id="tf-r-preview" aria-live="polite"></p></div>';
  }

  /** Open the task editor. existing = task or null; defaults for new tasks. */
  function openEditor(existing, defaults) {
    const t = existing || Object.assign({
      title: '', description: '', notes: '', status: 'todo', priority: 'medium', categoryId: null,
      tags: [], dueDate: null, dueTime: null, estimate: null, subtasks: [], recurrence: null, reminder: null, inbox: false,
    }, defaults || {});
    const R = T4.reminders;
    const remindOpts = R ? R.OPTIONS.slice() : [];
    if (R && t.reminder != null && !remindOpts.some((o) => o[0] === t.reminder)) remindOpts.push([t.reminder, R.label(t.reminder)]);
    let subtasks = t.subtasks.map((s) => Object.assign({}, s));
    const cats = store.data.categories;
    const isNew = !existing;

    const prioRadios = ['critical', 'high', 'medium', 'low', 'none'].map((p) =>
      '<label class="seg__opt seg__opt--' + p + '"><input type="radio" name="priority" value="' + p + '"' + ((t.priority || 'none') === p ? ' checked' : '') + '>' +
      '<span>' + esc(p === 'none' ? tt('c.none') : PRIORITY[p].label) + '</span></label>').join('');

    const body =
      '<form id="task-form" class="form" novalidate>' +
        (t.inbox && existing ? '<p class="callout">' + icon('inbox') + esc(tt('tk.inboxCallout')) + '</p>' : '') +
        '<div class="field"><label for="tf-title">' + esc(tt('tk.fTitle')) + '</label>' +
          '<input id="tf-title" name="title" type="text" maxlength="500" required value="' + esc(t.title) + '" autofocus placeholder="' + esc(tt('tk.fTitlePh')) + '">' +
          '<p class="field__error" id="tf-title-err" hidden>' + esc(tt('tk.fTitleErr')) + '</p></div>' +
        '<div class="field"><label for="tf-desc">' + esc(tt('tk.fDesc')) + '</label>' +
          '<textarea id="tf-desc" name="description" rows="2" placeholder="' + esc(tt('tk.fDescPh')) + '">' + esc(t.description) + '</textarea></div>' +
        '<fieldset class="field"><legend>' + esc(tt('tk.fPriority')) + '</legend><div class="seg seg--prio">' + prioRadios + '</div></fieldset>' +
        '<div class="grid-3">' +
          '<div class="field"><label for="tf-date">' + esc(tt('tk.fDue')) + '</label><input id="tf-date" name="dueDate" type="date" value="' + esc(t.dueDate || '') + '"></div>' +
          '<div class="field"><label for="tf-time">' + esc(tt('tk.fDueTime')) + ' <span class="muted">' + esc(tt('tk.optional')) + '</span></label><input id="tf-time" name="dueTime" type="time" value="' + esc(t.dueTime || '') + '"></div>' +
          '<div class="field"><label for="tf-est">' + esc(tt('tk.fEstimate')) + ' <span class="muted">' + esc(tt('tk.minShort')) + '</span></label><input id="tf-est" name="estimate" type="number" min="1" max="1440" step="5" inputmode="numeric" value="' + esc(t.estimate || '') + '" placeholder="' + esc(tt('tk.fEstimatePh')) + '"></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="field"><label for="tf-status">' + esc(tt('tk.fStatus')) + '</label><select id="tf-status" name="status">' +
            Object.keys(STATUS).map((s) => '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + esc(STATUS[s]) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="tf-cat">' + esc(tt('tk.fCategory')) + '</label><div class="input-row"><select id="tf-cat" name="categoryId"><option value="">' + esc(tt('tk.noCategory')) + '</option>' +
            cats.map((c) => '<option value="' + c.id + '"' + (t.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
            '</select><button type="button" class="icon-btn" id="tf-newcat-btn" title="' + esc(tt('tk.newCategory')) + '" aria-label="' + esc(tt('tk.newCategory')) + '" aria-expanded="false">' + icon('plus') + '</button></div>' +
            '<div class="input-row mt-xs" id="tf-newcat" hidden><input type="text" id="tf-newcat-name" maxlength="40" placeholder="' + esc(tt('tk.categoryName')) + '" aria-label="' + esc(tt('tk.newCategoryName')) + '"><button type="button" class="btn btn--sm" id="tf-newcat-add">' + esc(tt('c.add')) + '</button></div></div>' +
          '<div class="field"><label for="tf-recur">' + esc(tt('tk.fRepeat')) + '</label><select id="tf-recur" name="recurrence"><option value="">' + esc(tt('tk.noRepeat')) + '</option></select></div>' +
        '</div>' + recurCustomHtml() +
        (R ? '<div class="grid-3"><div class="field"><label for="tf-remind">' + esc(tt('tk.fReminder')) + '</label><select id="tf-remind" name="reminder" aria-describedby="tf-remind-hint"><option value="">' + esc(tt('tk.noReminder')) + '</option>' +
            remindOpts.map((o) => '<option value="' + o[0] + '"' + (t.reminder === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' +
            '<p class="field__hint" id="tf-remind-hint" aria-live="polite"></p></div></div>' : '') +
        '<div class="field"><label for="tf-tags">' + esc(tt('tk.fTags')) + ' <span class="muted">' + esc(tt('tk.commaSeparated')) + '</span></label><input id="tf-tags" name="tags" type="text" value="' + esc(t.tags.join(', ')) + '" placeholder="' + esc(tt('tk.fTagsPh')) + '" list="tf-tag-list">' +
          '<datalist id="tf-tag-list">' + store.allTags().map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist></div>' +
        '<div class="field"><span class="label">' + esc(tt('tk.fSubtasks')) + '</span><ul class="subtasks" id="tf-subtasks"></ul>' +
          '<div class="input-row"><input type="text" id="tf-sub-new" maxlength="300" placeholder="' + esc(tt('tk.subtaskPh')) + '" aria-label="' + esc(tt('tk.newSubtask')) + '"><button type="button" class="btn btn--sm" id="tf-sub-add">' + esc(tt('c.add')) + '</button></div></div>' +
        '<div class="field"><label for="tf-notes">' + esc(tt('tk.fNotes')) + '</label><textarea id="tf-notes" name="notes" rows="3" placeholder="' + esc(tt('tk.fNotesPh')) + '">' + esc(t.notes) + '</textarea></div>' +
        (existing ? '<p class="meta-line">' + esc(t.completedAt
          ? tt('tk.createdCompleted', { created: U.fmtDateTime(t.createdAt), completed: U.fmtDateTime(t.completedAt) })
          : tt('tk.created', { date: U.fmtDateTime(t.createdAt) })) + '</p>' : '') +
      '</form>';

    const footer =
      (existing ? '<button type="button" class="btn btn--ghost btn--danger-text mr-auto" id="tf-delete">' + icon('trash') + esc(tt('c.delete')) + '</button>' : '') +
      '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button>' +
      '<button type="submit" class="btn btn--primary" form="task-form">' + esc(tt(isNew ? 'tk.createTask' : 'tk.saveChanges')) + ' <kbd>Ctrl ↵</kbd></button>';

    ui.openModal({
      title: tt(isNew ? 'tk.newTask' : 'tk.editTask'),
      body, footer, size: 'lg',
      onMount(m) {
        const form = m.querySelector('#task-form');
        const subList = m.querySelector('#tf-subtasks');
        const renderSubs = () => {
          subList.innerHTML = subtasks.map((s) =>
            '<li class="subtask' + (s.done ? ' is-done' : '') + '" data-sub="' + s.id + '">' +
              '<label class="checkbox"><input type="checkbox"' + (s.done ? ' checked' : '') + ' data-sub-toggle><span>' + esc(s.title) + '</span></label>' +
              '<button type="button" class="icon-btn icon-btn--sm" data-sub-remove aria-label="' + esc(tt('tk.removeSubtask')) + '">' + icon('x') + '</button></li>').join('');
        };
        renderSubs();
        const subInput = m.querySelector('#tf-sub-new');
        const addSub = () => {
          const v = subInput.value.trim();
          if (!v) return;
          subtasks.push({ id: U.uid('sub'), title: v.slice(0, 300), done: false });
          subInput.value = '';
          renderSubs();
          subInput.focus();
        };
        m.querySelector('#tf-sub-add').addEventListener('click', addSub);
        subInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
        subList.addEventListener('change', (e) => {
          const li = e.target.closest('[data-sub]');
          if (li && e.target.matches('[data-sub-toggle]')) {
            const s = subtasks.find((x) => x.id === li.dataset.sub);
            s.done = e.target.checked;
            li.classList.toggle('is-done', s.done);
          }
        });
        subList.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sub-remove]');
          if (b) { subtasks = subtasks.filter((x) => x.id !== b.closest('[data-sub]').dataset.sub); renderSubs(); }
        });

        // Inline category creation
        const ncWrap = m.querySelector('#tf-newcat'), ncBtn = m.querySelector('#tf-newcat-btn');
        const ncName = m.querySelector('#tf-newcat-name');
        ncBtn.addEventListener('click', () => {
          ncWrap.hidden = !ncWrap.hidden;
          ncBtn.setAttribute('aria-expanded', String(!ncWrap.hidden));
          if (!ncWrap.hidden) ncName.focus();
        });
        const addCat = () => {
          const res = store.addCategory(ncName.value, T4.storage.ACCENTS[store.data.categories.length % T4.storage.ACCENTS.length]);
          if (res.error) { ui.toast(res.error, 'error'); return; }
          const sel = m.querySelector('#tf-cat');
          sel.insertAdjacentHTML('beforeend', '<option value="' + res.category.id + '">' + esc(res.category.name) + '</option>');
          sel.value = res.category.id;
          ncName.value = '';
          ncWrap.hidden = true;
          ui.toast(tt('tk.categoryCreated', { name: res.category.name }));
        };
        m.querySelector('#tf-newcat-add').addEventListener('click', addCat);
        ncName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });

        // Repeat: presets that follow the due date, plus inline custom controls.
        const recurSel = m.querySelector('#tf-recur'), recurPanel = m.querySelector('#tf-recur-custom');
        const dateEl = m.querySelector('#tf-date');
        const rEvery = m.querySelector('#tf-r-every'), rUnit = m.querySelector('#tf-r-unit'), rMonthDay = m.querySelector('#tf-r-monthday');
        const rDone = m.querySelector('#tf-r-done'), rPreview = m.querySelector('#tf-r-preview');
        const rWeekRow = m.querySelector('#tf-r-week'), rMonthRow = m.querySelector('#tf-r-month');
        const recurDue = () => (U.isDateStr(dateEl.value) ? dateEl.value : U.today());
        let presets = [];
        let draft = null; // rule being edited in "Custom…"
        let touchedDays = false; // the user chose weekdays / month day, so the due date no longer drives them
        let lastRecurValue = '';
        const optHtml = (v, label) => '<option value="' + v + '">' + esc(label) + '</option>';
        const paintRecurOptions = (selected) => {
          presets = T4.recur.presets(recurDue());
          recurSel.innerHTML = optHtml('', tt('tk.noRepeat')) + presets.map((p) => optHtml(p.id, p.label)).join('') +
            '<option disabled>──────────</option>' + optHtml('custom', tt('tk.custom'));
          recurSel.value = selected;
        };
        const defaultDraft = (rule) => {
          const d = U.parseDate(recurDue());
          const r = T4.recur.normalize(rule) || { unit: 'week', every: 1, from: 'due' };
          return { unit: r.unit, every: r.every, from: r.from, weekdays: r.weekdays ? r.weekdays.slice() : [d.getDay()], monthDay: r.monthDay != null ? r.monthDay : d.getDate() };
        };
        const draftRule = () => T4.recur.normalize({
          unit: draft.unit, every: draft.every, from: draft.from,
          weekdays: draft.unit === 'week' ? draft.weekdays : undefined, monthDay: draft.unit === 'month' ? draft.monthDay : undefined,
        });
        const currentRule = () => {
          if (recurSel.value === '') return null;
          if (recurSel.value === 'custom') return draftRule();
          const p = presets.find((x) => x.id === recurSel.value);
          return p ? p.rule : null;
        };
        const paintCustom = () => {
          recurPanel.hidden = recurSel.value !== 'custom';
          if (recurPanel.hidden || !draft) return;
          rEvery.value = draft.every;
          rUnit.value = draft.unit;
          rMonthDay.value = String(draft.monthDay);
          rDone.checked = draft.from === 'done';
          rWeekRow.hidden = draft.unit !== 'week';
          rMonthRow.hidden = draft.unit !== 'month';
          m.querySelectorAll('[data-wd]').forEach((b) => b.setAttribute('aria-pressed', String(draft.weekdays.includes(Number(b.dataset.wd)))));
          rPreview.textContent = T4.recur.describe(draftRule());
        };
        const selectCustom = (rule) => { draft = defaultDraft(rule); touchedDays = false; recurSel.value = 'custom'; paintCustom(); };
        // Initial selection: a matching preset (legacy rules get the due date's defaults first), otherwise Custom.
        paintRecurOptions('');
        const existingRule = T4.recur.normalize(t.recurrence);
        if (existingRule) {
          const hit = presets.find((p) => T4.recur.equals(p.rule, fillRecurDefaults(existingRule, recurDue())));
          if (hit) recurSel.value = hit.id;
          else selectCustom(existingRule);
        }
        lastRecurValue = recurSel.value;
        paintCustom();
        recurSel.addEventListener('change', () => {
          if (recurSel.value === 'custom') {
            const prev = presets.find((x) => x.id === lastRecurValue);
            selectCustom(prev ? prev.rule : (draft ? draftRule() : null));
          } else paintCustom();
          lastRecurValue = recurSel.value;
        });
        // A new due date relabels the presets; the selection is kept by id.
        const onDueChange = () => {
          const prevId = recurSel.value, prevPreset = presets.find((x) => x.id === prevId);
          paintRecurOptions(prevId);
          if (prevPreset && recurSel.value !== prevId) selectCustom(prevPreset.rule); // preset does not exist for the new date
          else if (prevId === 'custom' && !touchedDays) {
            const d = defaultDraft(null);
            draft.weekdays = d.weekdays; draft.monthDay = d.monthDay;
          }
          lastRecurValue = recurSel.value;
          paintCustom();
        };
        dateEl.addEventListener('change', onDueChange);
        dateEl.addEventListener('input', onDueChange);
        rEvery.addEventListener('input', () => {
          const n = Math.round(Number(rEvery.value));
          if (rEvery.value !== '' && Number.isFinite(n)) draft.every = Math.min(99, Math.max(1, n));
          rPreview.textContent = T4.recur.describe(draftRule());
        });
        rEvery.addEventListener('change', paintCustom);
        rUnit.addEventListener('change', () => { draft.unit = rUnit.value; paintCustom(); });
        rMonthDay.addEventListener('change', () => { draft.monthDay = Number(rMonthDay.value); touchedDays = true; paintCustom(); });
        rDone.addEventListener('change', () => { draft.from = rDone.checked ? 'done' : 'due'; paintCustom(); });
        rWeekRow.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-wd]');
          if (!btn) return;
          const d = Number(btn.dataset.wd);
          if (!draft.weekdays.includes(d)) draft.weekdays.push(d);
          else if (draft.weekdays.length > 1) draft.weekdays = draft.weekdays.filter((x) => x !== d); // keep at least one day
          touchedDays = true;
          paintCustom();
        });

        // Reminder: show when it will fire.
        const remSel = m.querySelector('#tf-remind'), remHint = m.querySelector('#tf-remind-hint');
        const paintReminder = () => {
          if (!remSel) return;
          const rem = remSel.value === '' ? null : Number(remSel.value);
          const date = m.querySelector('#tf-date').value, time = m.querySelector('#tf-time').value;
          if (rem == null) { remHint.textContent = ''; return; }
          const at = R.fireAt({ dueDate: date || U.today(), dueTime: date ? time || null : null, reminder: rem }, store.settings);
          remHint.textContent = (date ? '' : tt('tk.remNoDate') + ' · ') + tt('tk.remAt', { when: U.fmtDateTime(at.toISOString()) }) +
            (date && !time ? ' ' + tt('tk.remDefaultTime') : '') + (at < new Date() ? ' — ' + tt('tk.remPassed') : '');
        };
        ['#tf-remind', '#tf-date', '#tf-time'].forEach((sel) => { const el = m.querySelector(sel); if (el) el.addEventListener('input', paintReminder); if (el) el.addEventListener('change', paintReminder); });
        paintReminder();

        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
          // Plain Enter in single-line inputs shouldn't submit unexpectedly except in title.
          if (e.key === 'Enter' && e.target.matches('input') && !e.target.matches('#tf-title') && !e.ctrlKey && !e.metaKey) e.preventDefault();
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = String(fd.get('title') || '').trim();
          const err = m.querySelector('#tf-title-err');
          if (!title) {
            err.hidden = false;
            m.querySelector('#tf-title').setAttribute('aria-invalid', 'true');
            m.querySelector('#tf-title').focus();
            return;
          }
          // Commit a half-typed subtask instead of silently dropping it.
          if (subInput.value.trim()) addSub();
          const prio = fd.get('priority');
          const fields = {
            title,
            description: String(fd.get('description') || ''),
            notes: String(fd.get('notes') || ''),
            status: fd.get('status'),
            priority: prio === 'none' ? null : prio,
            categoryId: fd.get('categoryId') || null,
            tags: U.parseTags(fd.get('tags')),
            dueDate: fd.get('dueDate') || null,
            dueTime: fd.get('dueDate') ? (fd.get('dueTime') || null) : null,
            estimate: fd.get('estimate') ? Number(fd.get('estimate')) : null,
            recurrence: currentRule(),
            subtasks,
          };
          if (remSel) fields.reminder = remSel.value === '' ? null : Number(remSel.value);
          if (fields.recurrence && !fields.dueDate) {
            // No due date: today, or the first matching day (>= today) when the rule names weekdays / a day of the month.
            const named = (fields.recurrence.unit === 'week' && fields.recurrence.weekdays) || (fields.recurrence.unit === 'month' && fields.recurrence.monthDay != null);
            const yesterday = U.addDays(U.today(), -1);
            fields.dueDate = (named && T4.recur.next(Object.assign({}, fields.recurrence, { from: 'due' }), { due: yesterday, today: yesterday })) || U.today();
          }
          if (fields.reminder != null && !fields.dueDate) fields.dueDate = U.today();
          // A changed due date/time or reminder is a new occurrence: drop a pending snooze.
          if (existing && (fields.dueDate !== t.dueDate || fields.dueTime !== t.dueTime || (remSel && fields.reminder !== t.reminder))) fields.reminderSnooze = null;
          if (fields.reminder != null && R) R.requestPermission();
          if (t.inbox) {
            fields.inbox = !(fields.dueDate || fields.priority || fields.categoryId);
          }
          if (isNew) {
            const created = store.addTask(Object.assign({}, defaults, fields));
            ui.closeModal(true);
            ui.toast(created && created.dueDate ? tt('tk.taskCreatedFor', { date: U.relDate(created.dueDate) }) : tt('tk.taskCreated'));
          } else {
            const wasInbox = t.inbox;
            const updated = store.updateTask(t.id, fields);
            ui.closeModal(true);
            ui.toast(tt(wasInbox && updated && !updated.inbox ? 'tk.taskOrganized' : 'tk.taskUpdated'));
          }
        });

        const del = m.querySelector('#tf-delete');
        if (del) del.addEventListener('click', () => confirmDelete(t.id, true));
      },
    });
  }

  async function confirmDelete(id, fromModal) {
    const t = store.getTask(id);
    if (!t) return;
    const ok = await ui.confirm({
      title: tt('tk.deleteTitle'),
      message: t.subtasks.length ? tt('tk.deleteMsgSubs', { title: t.title, count: t.subtasks.length }) : tt('tk.deleteMsg', { title: t.title }),
      confirmText: tt('c.delete'), danger: true,
    });
    if (!ok) return;
    if (fromModal) ui.closeModal(true);
    const snapshot = JSON.parse(JSON.stringify(t));
    const plans = Object.keys(store.data.dailyPlans).filter((d) => store.data.dailyPlans[d].top3.includes(id));
    store.deleteTask(id);
    ui.toast(tt('tk.taskDeleted'), 'success', 6000, {
      label: tt('c.undo'),
      fn() {
        store.addTask(snapshot);
        plans.forEach((d) => { const p = store.getPlan(d); if (p.top3.length < 3) store.updatePlan(d, { top3: p.top3.concat(id) }); });
        ui.toast(tt('tk.taskRestored'));
      },
    });
  }

  /* ======================= Quick capture ======================= */
  function openQuickCapture() {
    ui.openModal({
      title: tt('tk.qcTitle'),
      size: 'sm',
      body: '<form id="qc-form" class="form">' +
        '<p class="muted small">' + esc(tt('tk.qcIntro')) + '</p>' +
        '<div class="field"><label for="qc-title" class="sr-only">' + esc(tt('tk.qcTask')) + '</label>' +
        '<input id="qc-title" type="text" maxlength="500" autocomplete="off" placeholder="' + esc(tt('tk.qcPh')) + '" autofocus></div>' +
        '<p class="muted small">' + tt('tk.qcTip') + '</p>' + // trusted dictionary text (contains <code>)
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.close')) + '</button>' +
        '<button type="submit" form="qc-form" class="btn btn--primary">' + esc(tt('tk.addToInbox')) + '</button>',
      onMount(m) {
        m.querySelector('#qc-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const input = m.querySelector('#qc-title');
          if (captureText(input.value, { inbox: true })) {
            input.value = '';
            input.focus();
          }
        });
      },
    });
  }

  /** Create a task from quick text; returns task or null. */
  function captureText(text, defaults) {
    const parsed = parseQuickAdd(text);
    if (!parsed.title) {
      ui.toast(tt('tk.enterTitle'), 'error');
      return null;
    }
    const fields = Object.assign({ priority: null }, defaults, stripUndefined(parsed));
    if (!parsed.tags.length) delete fields.tags;
    if (fields.inbox && (parsed.dueDate || parsed.priority || parsed.categoryId || parsed.recurrence)) fields.inbox = false;
    const task = store.addTask(fields);
    if (task) {
      ui.toast(task.inbox ? tt('tk.addedInbox') : task.dueDate ? tt('tk.taskAddedFor', { date: U.relDate(task.dueDate) }) : tt('tk.taskAdded'), 'success', 4000, {
        label: tt('c.edit'), fn: () => openEditor(store.getTask(task.id)),
      });
    }
    return task;
  }
  function stripUndefined(o) {
    const r = {};
    Object.keys(o).forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
    return r;
  }

  /* ======================= Actions ======================= */
  ui.on('toggle-task', (el) => {
    const id = el.dataset.id;
    const t = store.getTask(id);
    if (!t) return;
    const li = el.closest('.task, .top3__item, .focus-card');
    const finish = () => {
      const res = store.toggleComplete(id);
      if (!res) return;
      if (res.status === 'done') {
        const next = res.nextOccurrenceId ? store.getTask(res.nextOccurrenceId) : null;
        ui.toast(next ? tt('tk.doneNext', { date: U.relDate(next.dueDate) }) : tt('tk.completed'), 'success', 5000, {
          label: tt('c.undo'), fn: () => store.setStatus(id, 'todo'),
        });
      } else {
        ui.toast(tt('tk.reopened'), 'info');
      }
    };
    if (li && t.status !== 'done' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      li.classList.add('is-completing');
      el.setAttribute('aria-checked', 'true');
      setTimeout(finish, 260);
    } else finish();
  });
  ui.on('edit-task', (el) => {
    const t = store.getTask(el.dataset.id);
    if (t) openEditor(t);
  });
  ui.on('delete-task', (el) => confirmDelete(el.dataset.id));
  ui.on('new-task', (el) => {
    const defaults = {};
    if (el && el.dataset.date) defaults.dueDate = el.dataset.date;
    openEditor(null, defaults);
  });
  ui.on('quick-capture', () => openQuickCapture());
  ui.on('toggle-top3', (el) => {
    const date = el.dataset.date || U.today();
    const res = store.toggleTop3(date, el.dataset.id);
    if (res === 'full') ui.toast(tt('tk.top3Full'), 'info');
    else ui.toast(tt(res === 'added' ? 'tk.top3Added' : 'tk.top3Removed'), 'info');
  });
  ui.on('focus-task', (el) => {
    T4.focus.select(el.dataset.id);
    location.hash = '#/focus';
  });
  ui.on('set-status', (el) => {
    store.setStatus(el.dataset.id, el.dataset.status);
    ui.toast(tt('tk.marked' + el.dataset.status.charAt(0).toUpperCase() + el.dataset.status.slice(1)), 'info');
  });
  ui.on('submit:quick-add', (form) => {
    const input = form.querySelector('input[name="title"]');
    let defaults = {};
    try { defaults = JSON.parse(form.dataset.defaults || '{}'); } catch (e) { /* ignore */ }
    // Clear the field BEFORE adding: adding re-renders the view synchronously, and the re-render keeps
    // half-typed quick-add text as a draft – the submitted text would otherwise stay in the new field.
    const text = input.value;
    input.value = '';
    if (!captureText(text, defaults)) {
      input.value = text; // nothing added (e.g. empty title): keep what was typed
    } else {
      // Re-focus the same quick-add after re-render.
      requestAnimationFrame(() => {
        const again = form.id ? document.getElementById(form.id) : null;
        if (again) again.querySelector('input[name="title"]').focus();
      });
    }
  });
  ui.on('inbox-schedule', (el) => {
    const when = el.dataset.when;
    const date = when === 'today' ? U.today() : U.addDays(U.today(), 1);
    store.updateTask(el.dataset.id, { dueDate: date, inbox: false });
    ui.toast(tt('tk.scheduledFor', { date: U.relDate(date) }));
  });
  ui.on('inbox-move', (el) => {
    store.updateTask(el.dataset.id, { inbox: false });
    ui.toast(tt('tk.movedToTasks'));
  });
  ui.on('reschedule-overdue', async () => {
    const list = store.overdueTasks();
    if (!list.length) return;
    const ok = await ui.confirm({ title: tt('tk.moveOverdueTitle'), message: tt('tk.moveOverdueMsg', { count: list.length }), confirmText: tt('tk.moveToToday') });
    if (!ok) return;
    store.commit((d) => {
      const today = U.today(), now = new Date().toISOString();
      d.tasks.forEach((t) => { if (list.some((o) => o.id === t.id)) { t.dueDate = today; t.updatedAt = now; } });
    }, { type: 'bulk' });
    ui.toast(tt('tk.movedToToday', { count: list.length }));
  });

  /* ======================= Views ======================= */
  function pageHeader(title, subtitle, actionsHtml) {
    return '<header class="page-head"><div><h1 class="page-title">' + esc(title) + '</h1>' +
      (subtitle ? '<p class="page-sub">' + subtitle + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="page-actions">' + actionsHtml + '</div>' : '') + '</header>';
  }
  function newTaskBtn(date) {
    return '<button type="button" class="btn btn--primary" data-action="new-task"' + (date ? ' data-date="' + date + '"' : '') + '>' + icon('plus') + esc(tt('tk.newTask')) + ' <kbd>N</kbd></button>';
  }

  /* ---------- Inbox ---------- */
  T4.views.inbox = {
    get title() { return tt('nav.inbox'); },
    render() {
      const items = store.inboxTasks().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const rows = items.map((t) =>
        '<li class="inbox-item">' + row(t, { actions: false }).replace(/^<li/, '<div').replace(/<\/li>$/, '</div>') +
          '<div class="inbox-item__actions">' +
            '<button type="button" class="btn btn--sm" data-action="inbox-schedule" data-when="today" data-id="' + t.id + '">' + icon('sun') + esc(tt('tk.today')) + '</button>' +
            '<button type="button" class="btn btn--sm" data-action="inbox-schedule" data-when="tomorrow" data-id="' + t.id + '">' + icon('calendar') + esc(tt('tk.tomorrow')) + '</button>' +
            '<button type="button" class="btn btn--sm" data-action="edit-task" data-id="' + t.id + '">' + icon('edit') + esc(tt('tk.organize')) + '</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-action="inbox-move" data-id="' + t.id + '" title="' + esc(tt('tk.moveTip')) + '">' + icon('arrow-right') + esc(tt('tk.move')) + '</button>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-task" data-id="' + t.id + '" aria-label="' + esc(tt('tk.deleteTask')) + '">' + icon('trash') + '</button>' +
          '</div></li>').join('');
      return pageHeader(tt('nav.inbox'), esc(tt('tk.inboxSub') + (items.length ? ' ' + tt('tk.inboxWaiting', { count: items.length }) : ''))) +
        '<section class="card">' + quickAddForm({ inbox: true }, tt('tk.inboxPh'), 'qa-inbox') + '</section>' +
        '<section class="mt">' + (items.length ? '<ul class="inbox-list" role="list">' + rows + '</ul>'
          : ui.emptyState('inbox', tt('tk.inboxZero'), tt('tk.inboxZeroText'))) + '</section>';
    },
  };

  /* ---------- My Tasks ---------- */
  const filters = { q: '', status: 'open', priority: '', category: '', tag: '', when: '', sort: null };

  function filteredTasks() {
    const today = U.today();
    const weekStart = store.weekStartOf(today), weekEnd = U.addDays(weekStart, 6);
    let tasks = store.planned().filter((t) => {
      if (filters.status === 'open' && t.status === 'done') return false;
      if (filters.status && filters.status !== 'open' && filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.priority && (t.priority || 'none') !== filters.priority) return false;
      if (filters.category && (t.categoryId || 'none') !== filters.category) return false;
      if (filters.tag && !t.tags.includes(filters.tag)) return false;
      if (filters.when === 'today' && t.dueDate !== today) return false;
      if (filters.when === 'overdue' && !(t.dueDate && t.dueDate < today && t.status !== 'done')) return false;
      if (filters.when === 'week' && !(t.dueDate && t.dueDate >= weekStart && t.dueDate <= weekEnd)) return false;
      if (filters.when === 'nodate' && t.dueDate) return false;
      return store.matchesQuery(t, filters.q);
    });
    return store.sortTasks(tasks, filters.sort || store.settings.defaultSort);
  }

  function renderTaskResults() {
    const tasks = filteredTasks();
    const active = filters.q || filters.priority || filters.category || filters.tag || filters.when || (filters.status !== 'open');
    return '<p class="result-count">' + esc(tt(active ? 'tk.resultsFiltered' : 'tk.results', { count: tasks.length })) + (active ? ' · <button type="button" class="link" data-action="clear-filters">' + esc(tt('tk.clearFilters')) + '</button>' : '') + '</p>' +
      list(tasks, {}, ui.emptyState(active ? 'search' : 'list', tt(active ? 'tk.noMatch' : 'tk.noTasks'),
        tt(active ? 'tk.noMatchText' : 'tk.noTasksText')));
  }

  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label) + '</option>';

  T4.views.tasks = {
    get title() { return tt('nav.tasks'); },
    render() {
      const sort = filters.sort || store.settings.defaultSort;
      const cats = store.data.categories;
      return pageHeader(tt('nav.tasks'), esc(tt('tk.tasksSub')), newTaskBtn()) +
        '<section class="card">' + quickAddForm({}, tt('tk.tasksPh'), 'qa-tasks') + '</section>' +
        '<section class="toolbar" aria-label="' + esc(tt('tk.searchFilters')) + '">' +
          '<label class="search">' + icon('search') + '<span class="sr-only">' + esc(tt('tk.searchTasks')) + '</span>' +
            '<input type="search" id="task-search" data-input="task-filter" data-key="q" value="' + esc(filters.q) + '" placeholder="' + esc(tt('tk.searchPh')) + '"></label>' +
          '<div class="filters">' +
            '<select data-change="task-filter" data-key="status" aria-label="' + esc(tt('tk.filterStatus')) + '">' + opt('open', tt('tk.fOpen'), filters.status) + opt('all', tt('tk.fAllStatuses'), filters.status) + opt('todo', STATUS.todo, filters.status) + opt('in_progress', STATUS.in_progress, filters.status) + opt('done', STATUS.done, filters.status) + '</select>' +
            '<select data-change="task-filter" data-key="priority" aria-label="' + esc(tt('tk.filterPriority')) + '">' + opt('', tt('tk.fAnyPriority'), filters.priority) + ['critical', 'high', 'medium', 'low'].map((p) => opt(p, PRIORITY[p].label, filters.priority)).join('') + opt('none', tt('tk.fNoPriority'), filters.priority) + '</select>' +
            '<select data-change="task-filter" data-key="category" aria-label="' + esc(tt('tk.filterCategory')) + '">' + opt('', tt('tk.fAnyCategory'), filters.category) + cats.map((c) => opt(c.id, c.name, filters.category)).join('') + opt('none', tt('tk.noCategory'), filters.category) + '</select>' +
            '<select data-change="task-filter" data-key="when" aria-label="' + esc(tt('tk.filterDue')) + '">' + opt('', tt('tk.fAnyDate'), filters.when) + opt('today', tt('tk.fDueToday'), filters.when) + opt('overdue', tt('tk.fOverdue'), filters.when) + opt('week', tt('tk.fThisWeek'), filters.when) + opt('nodate', tt('tk.fNoDate'), filters.when) + '</select>' +
            (store.allTags().length ? '<select data-change="task-filter" data-key="tag" aria-label="' + esc(tt('tk.filterTag')) + '">' + opt('', tt('tk.fAnyTag'), filters.tag) + store.allTags().map((g) => opt(g, '#' + g, filters.tag)).join('') + '</select>' : '') +
            '<label class="sort">' + icon('sort') + '<span class="sr-only">' + esc(tt('tk.sortBy')) + '</span><select data-change="task-filter" data-key="sort" aria-label="' + esc(tt('tk.sortBy')) + '">' + Object.keys(SORT_LABELS).map((k) => opt(k, SORT_LABELS[k], sort)).join('') + '</select></label>' +
          '</div>' +
        '</section>' +
        '<section id="task-results" aria-live="polite">' + renderTaskResults() + '</section>';
    },
  };
  const refreshResults = () => {
    const el = document.getElementById('task-results');
    if (el) el.innerHTML = renderTaskResults();
  };
  const debouncedRefresh = U.debounce(refreshResults, 120);
  ui.on('input:task-filter', (el) => { filters[el.dataset.key] = el.value; debouncedRefresh(); });
  ui.on('change:task-filter', (el) => {
    filters[el.dataset.key] = el.value;
    if (filters.tag && !store.allTags().includes(filters.tag)) filters.tag = '';
    refreshResults();
  });
  ui.on('clear-filters', () => {
    Object.assign(filters, { q: '', status: 'open', priority: '', category: '', tag: '', when: '' });
    T4.app.render();
  });

  /* ---------- Today ---------- */
  T4.views.today = {
    get title() { return tt('nav.today'); },
    render() {
      const today = U.today();
      const all = store.tasksOn(today);
      const open = store.sortTasks(all.filter(store.isOpen));
      const done = all.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
      const overdue = store.sortTasks(store.overdueTasks());
      const pct = all.length ? done.length / all.length : 0;
      const estimate = open.reduce((s, t) => s + (t.estimate || 0), 0);
      return pageHeader(tt('nav.today'), esc(U.fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })) +
          ' · ' + esc(tt('tk.todayDone', { done: done.length, total: all.length })) + (estimate ? ' · ' + esc(tt('tk.todayRemaining', { time: U.fmtMinutes(estimate) })) : ''),
          '<a class="btn" href="#/plan">' + icon('book') + esc(tt('tk.dailyPlan')) + '</a>' + newTaskBtn(today)) +
        (all.length ? '<div class="mb">' + ui.progressBar(pct, tt('tk.todayProgress')) + '</div>' : '') +
        '<section class="card">' + quickAddForm({ dueDate: today, priority: 'medium' }, tt('tk.todayPh'), 'qa-today') + '</section>' +
        (overdue.length ? '<section class="section"><div class="section__head"><h2 class="section__title text-danger">' + icon('alert') + esc(tt('tk.overdue')) + ' <span class="count">' + overdue.length + '</span></h2>' +
          '<button type="button" class="btn btn--sm" data-action="reschedule-overdue">' + esc(tt('tk.moveAllToday')) + '</button></div>' + list(overdue) + '</section>' : '') +
        '<section class="section"><div class="section__head"><h2 class="section__title">' + icon('sun') + esc(tt('tk.today')) + ' <span class="count">' + open.length + '</span></h2></div>' +
          list(open, { hideDate: true }, ui.emptyState('sun', tt(all.length ? 'tk.allDoneToday' : 'tk.nothingToday'), tt(all.length ? 'tk.allDoneText' : 'tk.nothingTodayText'))) + '</section>' +
        (done.length ? '<details class="section done-section"><summary class="section__title">' + icon('check') + esc(tt('tk.completedHeading')) + ' <span class="count">' + done.length + '</span></summary>' + list(done, { hideDate: true }) + '</details>' : '');
    },
  };

  /* ---------- Upcoming ---------- */
  T4.views.upcoming = {
    get title() { return tt('nav.upcoming'); },
    render() {
      const today = U.today();
      const horizon = U.addDays(today, 14);
      const future = store.sortTasks(store.planned().filter((t) => t.dueDate && t.dueDate > today && store.isOpen(t)), 'due');
      const groups = {};
      future.forEach((t) => {
        const key = t.dueDate <= horizon ? t.dueDate : 'later';
        (groups[key] = groups[key] || []).push(t);
      });
      const days = [];
      for (let i = 1; i <= 14; i++) days.push(U.addDays(today, i));
      let html = '';
      days.forEach((d) => {
        const g = groups[d];
        if (!g) return;
        html += '<section class="section"><div class="section__head"><h2 class="section__title">' + esc(U.relDate(d)) +
          ' <span class="muted fw-normal">' + esc(U.fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span> <span class="count">' + g.length + '</span></h2>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-action="new-task" data-date="' + d + '">' + icon('plus') + esc(tt('c.add')) + '</button></div>' +
          list(store.sortTasks(g), { hideDate: true }) + '</section>';
      });
      if (groups.later) {
        html += '<section class="section"><div class="section__head"><h2 class="section__title">' + esc(tt('tk.later')) + ' <span class="count">' + groups.later.length + '</span></h2></div>' + list(groups.later) + '</section>';
      }
      return pageHeader(tt('nav.upcoming'), esc(tt('tk.upcomingSub')), newTaskBtn(U.addDays(today, 1))) +
        '<section class="card">' + quickAddForm({ dueDate: U.addDays(today, 1), priority: 'medium' }, tt('tk.upcomingPh'), 'qa-upcoming') + '</section>' +
        (html || ui.emptyState('upcoming', tt('tk.nothingUpcoming'), tt('tk.nothingUpcomingText')));
    },
  };

  return { row, list, priorityBadge, categoryChip, dueChip, quickAddForm, openEditor, openQuickCapture, captureText, parseQuickAdd, confirmDelete, pageHeader, newTaskBtn, PRIORITY, STATUS };
})();
