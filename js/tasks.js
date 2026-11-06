/* Todo4Me — task components, editor, quick capture and task views
 * (Inbox, My Tasks, Today, Upcoming). */
T4.views = T4.views || {};

T4.tasks = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;

  const PRIORITY = {
    critical: { label: 'Critical', hint: 'Requires immediate attention' },
    high: { label: 'High', hint: 'Very important' },
    medium: { label: 'Medium', hint: 'Normal importance' },
    low: { label: 'Low', hint: 'Can wait' },
  };
  const STATUS = { todo: 'To do', in_progress: 'In progress', done: 'Completed' };
  // Repeat presets of the editor select (part 2 replaces this with T4.recur.presets); other rules show as an extra option.
  const RECUR_BASIC = ['daily', 'weekly', 'monthly'];
  const SORT_LABELS = { priority: 'Priority', due: 'Due date', created: 'Newest first', alpha: 'Alphabetical', status: 'Status' };

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
    if (t.status === 'in_progress') meta.push('<span class="chip chip--progress">' + icon('progress') + 'In progress</span>');
    if (!opts.hideDate) meta.push(dueChip(t));
    if (!opts.compact) meta.push(priorityBadge(t.priority));
    if (!opts.hideCategory) meta.push(categoryChip(t.categoryId));
    if (t.subtasks.length) meta.push('<span class="chip">' + icon('list') + subDone + '/' + t.subtasks.length + '</span>');
    if (t.estimate && !opts.compact) meta.push('<span class="chip">' + icon('clock') + U.fmtMinutes(t.estimate) + '</span>');
    if (t.recurrence) meta.push('<span class="chip" title="Repeats: ' + esc(T4.recur.describe(t.recurrence)) + '">' + icon('repeat') + (opts.compact ? '' : esc(T4.recur.describe(t.recurrence, { short: true }))) + '</span>');
    if (t.reminder != null && t.dueDate && !done && T4.reminders) meta.push('<span class="chip chip--reminder" title="Reminder: ' + esc(T4.reminders.label(t.reminder).toLowerCase()) + '">' + icon('bell') + '<span class="sr-only">Reminder</span></span>');
    if (!opts.compact) t.tags.forEach((g) => meta.push('<span class="chip chip--tag">#' + esc(g) + '</span>'));
    const metaHtml = meta.filter(Boolean).join('');

    return '<li class="task prio-' + (t.priority || 'none') + (done ? ' is-done' : '') + (store.isOverdue(t) ? ' is-overdue' : '') + (opts.compact ? ' task--compact' : '') + '" data-id="' + t.id + '"' +
      (opts.draggable ? ' draggable="true"' : '') + '>' +
      '<button type="button" class="check" role="checkbox" aria-checked="' + done + '" data-action="toggle-task" data-id="' + t.id + '" aria-label="' + (done ? 'Reopen' : 'Complete') + ': ' + esc(t.title) + '">' + icon('check') + '</button>' +
      '<button type="button" class="task__body" data-action="edit-task" data-id="' + t.id + '" aria-label="Edit: ' + esc(t.title) + '">' +
        '<span class="task__title">' + esc(t.title) + '</span>' +
        (metaHtml ? '<span class="task__meta">' + metaHtml + '</span>' : '') +
      '</button>' +
      (opts.actions === false ? '' :
      '<span class="task__actions">' +
        (done ? '' : '<button type="button" class="icon-btn icon-btn--sm' + (inTop3 ? ' is-on' : '') + '" data-action="toggle-top3" data-id="' + t.id + '" data-date="' + top3Date + '" aria-pressed="' + inTop3 + '" title="' + (inTop3 ? 'Remove from' : 'Add to') + ' Top 3" aria-label="' + (inTop3 ? 'Remove from' : 'Add to') + ' Top 3">' + icon('star') + '</button>') +
        (done ? '' : '<button type="button" class="icon-btn icon-btn--sm" data-action="focus-task" data-id="' + t.id + '" title="Focus on this task" aria-label="Focus on this task">' + icon('target') + '</button>') +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-task" data-id="' + t.id + '" title="Delete" aria-label="Delete task">' + icon('trash') + '</button>' +
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
      '<input type="text" name="title" maxlength="500" autocomplete="off" placeholder="' + esc(placeholder || 'Add a task…') + '" aria-label="New task title">' +
      '<span class="quick-add__hint" aria-hidden="true">!1–!4 · #category · @tomorrow</span>' +
      '<button type="submit" class="btn btn--primary btn--sm">Add</button>' +
      '</form>';
  }

  /* ======================= Quick-add parsing ======================= */
  const PRIO_TOKENS = { '!1': 'critical', '!c': 'critical', '!critical': 'critical', '!2': 'high', '!h': 'high', '!high': 'high', '!3': 'medium', '!m': 'medium', '!medium': 'medium', '!4': 'low', '!l': 'low', '!low': 'low' };
  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /** Parse "Call mom !2 #personal @tomorrow" → fields. */
  function parseQuickAdd(text) {
    const out = { tags: [] };
    const words = [];
    String(text).trim().split(/\s+/).forEach((w) => {
      const lw = w.toLowerCase();
      if (PRIO_TOKENS[lw]) { out.priority = PRIO_TOKENS[lw]; return; }
      if (/^@\S+$/.test(lw)) {
        const d = parseDateWord(lw.slice(1));
        if (d) { out.dueDate = d; return; }
      }
      if (/^#[\p{L}\p{N}_-]{1,40}$/u.test(w)) { // letters of any language: #büro, #einkäufe
        const name = lw.slice(1);
        const cat = store.data.categories.find((c) => c.name.toLowerCase() === name) ||
          store.data.categories.find((c) => c.name.toLowerCase().startsWith(name));
        if (cat && !out.categoryId) out.categoryId = cat.id;
        else out.tags.push(name);
        return;
      }
      words.push(w);
    });
    out.title = words.join(' ');
    return out;
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
  /** Options of the Repeat select: the 3 basic rules; any other existing rule is shown as an extra selected option. */
  function recurOptions(rule) {
    const r = T4.recur.normalize(rule);
    const basic = RECUR_BASIC.find((k) => r && T4.recur.equals(r, k));
    const opt = (v, label, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>';
    return RECUR_BASIC.map((k) => opt(k, T4.recur.describe(k), basic === k)).join('') +
      (r && !basic ? opt('current', T4.recur.describe(r), true) : '');
  }
  /** Select value → rule object ('current' keeps the existing non-basic rule). */
  function recurFromSelect(value, existingRule) {
    if (!value) return null;
    return T4.recur.normalize(value === 'current' ? existingRule : value);
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
      '<span>' + (p === 'none' ? 'None' : PRIORITY[p].label) + '</span></label>').join('');

    const body =
      '<form id="task-form" class="form" novalidate>' +
        (t.inbox && existing ? '<p class="callout">' + icon('inbox') + 'This task is in your Inbox. Setting a date, priority or category moves it to My Tasks.</p>' : '') +
        '<div class="field"><label for="tf-title">Title</label>' +
          '<input id="tf-title" name="title" type="text" maxlength="500" required value="' + esc(t.title) + '" autofocus placeholder="What needs to be done?">' +
          '<p class="field__error" id="tf-title-err" hidden>Please enter a title.</p></div>' +
        '<div class="field"><label for="tf-desc">Description</label>' +
          '<textarea id="tf-desc" name="description" rows="2" placeholder="Add details…">' + esc(t.description) + '</textarea></div>' +
        '<fieldset class="field"><legend>Priority</legend><div class="seg seg--prio">' + prioRadios + '</div></fieldset>' +
        '<div class="grid-3">' +
          '<div class="field"><label for="tf-date">Due date</label><input id="tf-date" name="dueDate" type="date" value="' + esc(t.dueDate || '') + '"></div>' +
          '<div class="field"><label for="tf-time">Due time <span class="muted">(optional)</span></label><input id="tf-time" name="dueTime" type="time" value="' + esc(t.dueTime || '') + '"></div>' +
          '<div class="field"><label for="tf-est">Estimate <span class="muted">(min)</span></label><input id="tf-est" name="estimate" type="number" min="1" max="1440" step="5" inputmode="numeric" value="' + esc(t.estimate || '') + '" placeholder="e.g. 30"></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="field"><label for="tf-status">Status</label><select id="tf-status" name="status">' +
            Object.keys(STATUS).map((s) => '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + STATUS[s] + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="tf-cat">Category</label><div class="input-row"><select id="tf-cat" name="categoryId"><option value="">No category</option>' +
            cats.map((c) => '<option value="' + c.id + '"' + (t.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
            '</select><button type="button" class="icon-btn" id="tf-newcat-btn" title="New category" aria-label="New category" aria-expanded="false">' + icon('plus') + '</button></div>' +
            '<div class="input-row mt-xs" id="tf-newcat" hidden><input type="text" id="tf-newcat-name" maxlength="40" placeholder="Category name" aria-label="New category name"><button type="button" class="btn btn--sm" id="tf-newcat-add">Add</button></div></div>' +
          '<div class="field"><label for="tf-recur">Repeat</label><select id="tf-recur" name="recurrence"><option value="">Does not repeat</option>' +
            recurOptions(t.recurrence) + '</select></div>' +
        '</div>' +
        (R ? '<div class="grid-3"><div class="field"><label for="tf-remind">Reminder</label><select id="tf-remind" name="reminder" aria-describedby="tf-remind-hint"><option value="">No reminder</option>' +
            remindOpts.map((o) => '<option value="' + o[0] + '"' + (t.reminder === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' +
            '<p class="field__hint" id="tf-remind-hint" aria-live="polite"></p></div></div>' : '') +
        '<div class="field"><label for="tf-tags">Tags <span class="muted">(comma separated)</span></label><input id="tf-tags" name="tags" type="text" value="' + esc(t.tags.join(', ')) + '" placeholder="e.g. urgent, client-a" list="tf-tag-list">' +
          '<datalist id="tf-tag-list">' + store.allTags().map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist></div>' +
        '<div class="field"><span class="label">Subtasks</span><ul class="subtasks" id="tf-subtasks"></ul>' +
          '<div class="input-row"><input type="text" id="tf-sub-new" maxlength="300" placeholder="Add a subtask and press Enter" aria-label="New subtask"><button type="button" class="btn btn--sm" id="tf-sub-add">Add</button></div></div>' +
        '<div class="field"><label for="tf-notes">Notes</label><textarea id="tf-notes" name="notes" rows="3" placeholder="Links, context, anything useful…">' + esc(t.notes) + '</textarea></div>' +
        (existing ? '<p class="meta-line">Created ' + esc(U.fmtDateTime(t.createdAt)) +
          (t.completedAt ? ' · Completed ' + esc(U.fmtDateTime(t.completedAt)) : '') + '</p>' : '') +
      '</form>';

    const footer =
      (existing ? '<button type="button" class="btn btn--ghost btn--danger-text mr-auto" id="tf-delete">' + icon('trash') + 'Delete</button>' : '') +
      '<button type="button" class="btn btn--ghost" data-action="modal-close">Cancel</button>' +
      '<button type="submit" class="btn btn--primary" form="task-form">' + (isNew ? 'Create task' : 'Save changes') + ' <kbd>Ctrl ↵</kbd></button>';

    ui.openModal({
      title: isNew ? 'New task' : 'Edit task',
      body, footer, size: 'lg',
      onMount(m) {
        const form = m.querySelector('#task-form');
        const subList = m.querySelector('#tf-subtasks');
        const renderSubs = () => {
          subList.innerHTML = subtasks.map((s) =>
            '<li class="subtask' + (s.done ? ' is-done' : '') + '" data-sub="' + s.id + '">' +
              '<label class="checkbox"><input type="checkbox"' + (s.done ? ' checked' : '') + ' data-sub-toggle><span>' + esc(s.title) + '</span></label>' +
              '<button type="button" class="icon-btn icon-btn--sm" data-sub-remove aria-label="Remove subtask">' + icon('x') + '</button></li>').join('');
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
          ui.toast('Category "' + res.category.name + '" created');
        };
        m.querySelector('#tf-newcat-add').addEventListener('click', addCat);
        ncName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });

        // Reminder: show when it will fire.
        const remSel = m.querySelector('#tf-remind'), remHint = m.querySelector('#tf-remind-hint');
        const paintReminder = () => {
          if (!remSel) return;
          const rem = remSel.value === '' ? null : Number(remSel.value);
          const date = m.querySelector('#tf-date').value, time = m.querySelector('#tf-time').value;
          if (rem == null) { remHint.textContent = ''; return; }
          const at = R.fireAt({ dueDate: date || U.today(), dueTime: date ? time || null : null, reminder: rem }, store.settings);
          remHint.textContent = (date ? '' : 'Due today (no date set) · ') + 'Reminds you ' + U.fmtDateTime(at.toISOString()) +
            (date && !time ? ' (default reminder time, see Settings)' : '') + (at < new Date() ? ' — already passed, so right away' : '');
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
            recurrence: recurFromSelect(fd.get('recurrence'), t.recurrence),
            subtasks,
          };
          if (remSel) fields.reminder = remSel.value === '' ? null : Number(remSel.value);
          if (fields.recurrence && !fields.dueDate) fields.dueDate = U.today();
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
            ui.toast('Task created' + (created && created.dueDate ? ' for ' + U.relDate(created.dueDate) : ''));
          } else {
            const wasInbox = t.inbox;
            const updated = store.updateTask(t.id, fields);
            ui.closeModal(true);
            ui.toast(wasInbox && updated && !updated.inbox ? 'Task organized and moved to My Tasks' : 'Task updated');
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
      title: 'Delete task?',
      message: '"' + t.title + '" will be permanently deleted.' + (t.subtasks.length ? ' Its ' + U.plural(t.subtasks.length, 'subtask') + ' will be deleted too.' : ''),
      confirmText: 'Delete', danger: true,
    });
    if (!ok) return;
    if (fromModal) ui.closeModal(true);
    const snapshot = JSON.parse(JSON.stringify(t));
    const plans = Object.keys(store.data.dailyPlans).filter((d) => store.data.dailyPlans[d].top3.includes(id));
    store.deleteTask(id);
    ui.toast('Task deleted', 'success', 6000, {
      label: 'Undo',
      fn() {
        store.addTask(snapshot);
        plans.forEach((d) => { const p = store.getPlan(d); if (p.top3.length < 3) store.updatePlan(d, { top3: p.top3.concat(id) }); });
        ui.toast('Task restored');
      },
    });
  }

  /* ======================= Quick capture ======================= */
  function openQuickCapture() {
    ui.openModal({
      title: 'Quick capture',
      size: 'sm',
      body: '<form id="qc-form" class="form">' +
        '<p class="muted small">Jot it down now, organize it later. It goes to your Inbox.</p>' +
        '<div class="field"><label for="qc-title" class="sr-only">Task</label>' +
        '<input id="qc-title" type="text" maxlength="500" autocomplete="off" placeholder="e.g. Book dentist appointment" autofocus></div>' +
        '<p class="muted small">Tip: add <code>!1</code>–<code>!4</code> for priority, <code>#category</code>, or <code>@tomorrow</code>.</p>' +
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">Close</button>' +
        '<button type="submit" form="qc-form" class="btn btn--primary">Add to Inbox</button>',
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
      ui.toast('Please enter a task title.', 'error');
      return null;
    }
    const fields = Object.assign({ priority: null }, defaults, stripUndefined(parsed));
    if (!parsed.tags.length) delete fields.tags;
    if (fields.inbox && (parsed.dueDate || parsed.priority || parsed.categoryId)) fields.inbox = false;
    const task = store.addTask(fields);
    if (task) {
      ui.toast(task.inbox ? 'Added to Inbox' : 'Task added' + (task.dueDate ? ' for ' + U.relDate(task.dueDate) : ''), 'success', 4000, {
        label: 'Edit', fn: () => openEditor(store.getTask(task.id)),
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
        ui.toast(next ? 'Done! Next one scheduled for ' + U.relDate(next.dueDate) : 'Task completed', 'success', 5000, {
          label: 'Undo', fn: () => store.setStatus(id, 'todo'),
        });
      } else {
        ui.toast('Task reopened', 'info');
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
    if (res === 'full') ui.toast('Your Top 3 is full. Remove one first.', 'info');
    else ui.toast(res === 'added' ? 'Added to Top 3' : 'Removed from Top 3', 'info');
  });
  ui.on('focus-task', (el) => {
    T4.focus.select(el.dataset.id);
    location.hash = '#/focus';
  });
  ui.on('set-status', (el) => {
    store.setStatus(el.dataset.id, el.dataset.status);
    ui.toast('Marked as ' + STATUS[el.dataset.status].toLowerCase(), 'info');
  });
  ui.on('submit:quick-add', (form) => {
    const input = form.querySelector('input[name="title"]');
    let defaults = {};
    try { defaults = JSON.parse(form.dataset.defaults || '{}'); } catch (e) { /* ignore */ }
    if (captureText(input.value, defaults)) {
      input.value = '';
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
    ui.toast('Scheduled for ' + U.relDate(date));
  });
  ui.on('inbox-move', (el) => {
    store.updateTask(el.dataset.id, { inbox: false });
    ui.toast('Moved to My Tasks');
  });
  ui.on('reschedule-overdue', async () => {
    const list = store.overdueTasks();
    if (!list.length) return;
    const ok = await ui.confirm({ title: 'Move overdue tasks to today?', message: U.plural(list.length, 'overdue task') + ' will be rescheduled to today.', confirmText: 'Move to today' });
    if (!ok) return;
    store.commit((d) => {
      const today = U.today(), now = new Date().toISOString();
      d.tasks.forEach((t) => { if (list.some((o) => o.id === t.id)) { t.dueDate = today; t.updatedAt = now; } });
    }, { type: 'bulk' });
    ui.toast(U.plural(list.length, 'task') + ' moved to today');
  });

  /* ======================= Views ======================= */
  function pageHeader(title, subtitle, actionsHtml) {
    return '<header class="page-head"><div><h1 class="page-title">' + esc(title) + '</h1>' +
      (subtitle ? '<p class="page-sub">' + subtitle + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="page-actions">' + actionsHtml + '</div>' : '') + '</header>';
  }
  function newTaskBtn(date) {
    return '<button type="button" class="btn btn--primary" data-action="new-task"' + (date ? ' data-date="' + date + '"' : '') + '>' + icon('plus') + 'New task <kbd>N</kbd></button>';
  }

  /* ---------- Inbox ---------- */
  T4.views.inbox = {
    title: 'Inbox',
    render() {
      const items = store.inboxTasks().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const rows = items.map((t) =>
        '<li class="inbox-item">' + row(t, { actions: false }).replace(/^<li/, '<div').replace(/<\/li>$/, '</div>') +
          '<div class="inbox-item__actions">' +
            '<button type="button" class="btn btn--sm" data-action="inbox-schedule" data-when="today" data-id="' + t.id + '">' + icon('sun') + 'Today</button>' +
            '<button type="button" class="btn btn--sm" data-action="inbox-schedule" data-when="tomorrow" data-id="' + t.id + '">' + icon('calendar') + 'Tomorrow</button>' +
            '<button type="button" class="btn btn--sm" data-action="edit-task" data-id="' + t.id + '">' + icon('edit') + 'Organize</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-action="inbox-move" data-id="' + t.id + '" title="Move to My Tasks without a date">' + icon('arrow-right') + 'Move</button>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-task" data-id="' + t.id + '" aria-label="Delete task">' + icon('trash') + '</button>' +
          '</div></li>').join('');
      return pageHeader('Inbox', 'Capture now, organize later. ' + (items.length ? U.plural(items.length, 'item') + ' waiting.' : '')) +
        '<section class="card">' + quickAddForm({ inbox: true }, 'Capture a task… (press Enter)', 'qa-inbox') + '</section>' +
        '<section class="mt">' + (items.length ? '<ul class="inbox-list" role="list">' + rows + '</ul>'
          : ui.emptyState('inbox', 'Inbox zero', 'Everything is organized. Use Quick capture (Q) whenever something pops into your head.')) + '</section>';
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
    return '<p class="result-count">' + U.plural(tasks.length, 'task') + (active ? ' match your filters · <button type="button" class="link" data-action="clear-filters">Clear filters</button>' : '') + '</p>' +
      list(tasks, {}, ui.emptyState(active ? 'search' : 'list', active ? 'No matching tasks' : 'No tasks yet',
        active ? 'Try a different search or clear the filters.' : 'Add your first task above, or press N.'));
  }

  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label) + '</option>';

  T4.views.tasks = {
    title: 'My Tasks',
    render() {
      const sort = filters.sort || store.settings.defaultSort;
      const cats = store.data.categories;
      return pageHeader('My Tasks', 'Everything you have planned, in one place.', newTaskBtn()) +
        '<section class="card">' + quickAddForm({}, 'Add a task… (e.g. "Send report !2 #work @fri")', 'qa-tasks') + '</section>' +
        '<section class="toolbar" aria-label="Search and filters">' +
          '<label class="search">' + icon('search') + '<span class="sr-only">Search tasks</span>' +
            '<input type="search" id="task-search" data-input="task-filter" data-key="q" value="' + esc(filters.q) + '" placeholder="Search tasks…  ( / )"></label>' +
          '<div class="filters">' +
            '<select data-change="task-filter" data-key="status" aria-label="Filter by status">' + opt('open', 'Open', filters.status) + opt('all', 'All statuses', filters.status) + opt('todo', 'To do', filters.status) + opt('in_progress', 'In progress', filters.status) + opt('done', 'Completed', filters.status) + '</select>' +
            '<select data-change="task-filter" data-key="priority" aria-label="Filter by priority">' + opt('', 'Any priority', filters.priority) + ['critical', 'high', 'medium', 'low'].map((p) => opt(p, PRIORITY[p].label, filters.priority)).join('') + opt('none', 'No priority', filters.priority) + '</select>' +
            '<select data-change="task-filter" data-key="category" aria-label="Filter by category">' + opt('', 'Any category', filters.category) + cats.map((c) => opt(c.id, c.name, filters.category)).join('') + opt('none', 'No category', filters.category) + '</select>' +
            '<select data-change="task-filter" data-key="when" aria-label="Filter by due date">' + opt('', 'Any date', filters.when) + opt('today', 'Due today', filters.when) + opt('overdue', 'Overdue', filters.when) + opt('week', 'This week', filters.when) + opt('nodate', 'No date', filters.when) + '</select>' +
            (store.allTags().length ? '<select data-change="task-filter" data-key="tag" aria-label="Filter by tag">' + opt('', 'Any tag', filters.tag) + store.allTags().map((g) => opt(g, '#' + g, filters.tag)).join('') + '</select>' : '') +
            '<label class="sort">' + icon('sort') + '<span class="sr-only">Sort by</span><select data-change="task-filter" data-key="sort" aria-label="Sort by">' + Object.keys(SORT_LABELS).map((k) => opt(k, SORT_LABELS[k], sort)).join('') + '</select></label>' +
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
    title: 'Today',
    render() {
      const today = U.today();
      const all = store.tasksOn(today);
      const open = store.sortTasks(all.filter(store.isOpen));
      const done = all.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
      const overdue = store.sortTasks(store.overdueTasks());
      const pct = all.length ? done.length / all.length : 0;
      const estimate = open.reduce((s, t) => s + (t.estimate || 0), 0);
      return pageHeader('Today', esc(U.fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })) +
          ' · ' + done.length + ' of ' + all.length + ' done' + (estimate ? ' · ~' + U.fmtMinutes(estimate) + ' remaining' : ''),
          '<a class="btn" href="#/plan">' + icon('book') + 'Daily plan</a>' + newTaskBtn(today)) +
        (all.length ? '<div class="mb">' + ui.progressBar(pct, 'Today\'s progress') + '</div>' : '') +
        '<section class="card">' + quickAddForm({ dueDate: today, priority: 'medium' }, 'Add a task for today…', 'qa-today') + '</section>' +
        (overdue.length ? '<section class="section"><div class="section__head"><h2 class="section__title text-danger">' + icon('alert') + 'Overdue <span class="count">' + overdue.length + '</span></h2>' +
          '<button type="button" class="btn btn--sm" data-action="reschedule-overdue">Move all to today</button></div>' + list(overdue) + '</section>' : '') +
        '<section class="section"><div class="section__head"><h2 class="section__title">' + icon('sun') + 'Today <span class="count">' + open.length + '</span></h2></div>' +
          list(open, { hideDate: true }, ui.emptyState('sun', all.length ? 'All done for today!' : 'Nothing scheduled for today', all.length ? 'Great work. Take a break or plan tomorrow.' : 'Add a task above or pull something from your Inbox.')) + '</section>' +
        (done.length ? '<details class="section done-section"><summary class="section__title">' + icon('check') + 'Completed <span class="count">' + done.length + '</span></summary>' + list(done, { hideDate: true }) + '</details>' : '');
    },
  };

  /* ---------- Upcoming ---------- */
  T4.views.upcoming = {
    title: 'Upcoming',
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
          '<button type="button" class="btn btn--sm btn--ghost" data-action="new-task" data-date="' + d + '">' + icon('plus') + 'Add</button></div>' +
          list(store.sortTasks(g), { hideDate: true }) + '</section>';
      });
      if (groups.later) {
        html += '<section class="section"><div class="section__head"><h2 class="section__title">Later <span class="count">' + groups.later.length + '</span></h2></div>' + list(groups.later) + '</section>';
      }
      return pageHeader('Upcoming', 'What\'s coming up in the next two weeks and beyond.', newTaskBtn(U.addDays(today, 1))) +
        '<section class="card">' + quickAddForm({ dueDate: U.addDays(today, 1), priority: 'medium' }, 'Add a task for tomorrow… (or use @fri)', 'qa-upcoming') + '</section>' +
        (html || ui.emptyState('upcoming', 'Nothing upcoming', 'Tasks with future due dates will appear here.'));
    },
  };

  return { row, list, priorityBadge, categoryChip, dueChip, quickAddForm, openEditor, openQuickCapture, captureText, parseQuickAdd, confirmDelete, pageHeader, newTaskBtn, PRIORITY, STATUS };
})();
