/* Todo4Me — application state, mutations and selectors.
 * Every mutation goes through commit(), which validates nothing more than
 * needed, persists immediately and notifies subscribers to re-render. */
T4.store = (function () {
  'use strict';
  const U = T4.util;
  const S = T4.storage;

  let data = S.defaultData();
  const listeners = new Set();
  let saveFailedNotified = false;

  function init() {
    const res = S.load();
    data = res.data;
    // Cross-tab sync: another tab saved → reload our copy.
    window.addEventListener('storage', (e) => {
      if (e.key !== S.KEY || e.newValue == null) return;
      try {
        data = S.sanitize(JSON.parse(e.newValue)).data;
        emit({ external: true });
      } catch (err) { /* ignore partial writes */ }
    });
    return res;
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit(info) { listeners.forEach((fn) => fn(info || {})); }

  function commit(mutator, info) {
    const result = mutator(data);
    const ok = S.save(data);
    if (!ok && !saveFailedNotified && T4.ui) {
      saveFailedNotified = true;
      T4.ui.toast('Could not save — browser storage may be full or disabled. Export your data to keep it safe.', 'error', 8000);
    } else if (ok) {
      saveFailedNotified = false;
    }
    emit(Object.assign({ saved: ok }, info));
    return result;
  }

  const nowIso = () => new Date().toISOString();
  const catIds = () => new Set(data.categories.map((c) => c.id));

  /* ======================= Tasks ======================= */
  function getTask(id) { return data.tasks.find((t) => t.id === id) || null; }

  function addTask(fields) {
    const task = S.sanitizeTask(Object.assign({
      status: 'todo', createdAt: nowIso(), updatedAt: nowIso(),
    }, fields), catIds());
    if (!task) return null;
    return commit((d) => { d.tasks.push(task); return task; }, { type: 'task-added', id: task.id });
  }

  function updateTask(id, patch) {
    const current = getTask(id);
    if (!current) return null;
    const wasDone = current.status === 'done';
    const merged = Object.assign({}, current, patch, { id, updatedAt: nowIso() });
    // Completion bookkeeping when status changes through the editor.
    if (!wasDone && merged.status === 'done') merged.completedAt = nowIso();
    if (merged.status !== 'done') merged.completedAt = null;
    const task = S.sanitizeTask(merged, catIds());
    if (!task) return null;
    return commit((d) => {
      const i = d.tasks.findIndex((t) => t.id === id);
      d.tasks[i] = task;
      if (!wasDone && task.status === 'done') onCompleted(d, task);
      if (wasDone && task.status !== 'done') onReopened(d, current);
      return task;
    }, { type: 'task-updated', id });
  }

  function setStatus(id, status) {
    return updateTask(id, { status });
  }

  function toggleComplete(id) {
    const t = getTask(id);
    if (!t) return null;
    return setStatus(id, t.status === 'done' ? 'todo' : 'done');
  }

  function onCompleted(d, task) {
    const day = U.today();
    d.stats.completions[day] = (d.stats.completions[day] || 0) + 1;
    // Recurring task: spawn the next occurrence once.
    if (task.recurrence && !task.nextOccurrenceId) {
      const next = T4.recur.next(task.recurrence, { due: task.dueDate || day, done: day, today: day });
      const clone = S.sanitizeTask(Object.assign({}, task, {
        id: U.uid('task'),
        status: 'todo',
        dueDate: next,
        subtasks: task.subtasks.map((s) => ({ id: U.uid('sub'), title: s.title, done: false })),
        nextOccurrenceId: null,
        // The next occurrence keeps the reminder offset and gets its own, not yet fired reminder.
        reminderFired: null,
        reminderSnooze: null,
        completedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }), catIds());
      d.tasks.push(clone);
      task.nextOccurrenceId = clone.id;
    }
  }

  function onReopened(d, prev) {
    const day = prev.completedAt ? U.toDateStr(new Date(prev.completedAt)) : null;
    if (day && d.stats.completions[day]) {
      d.stats.completions[day] -= 1;
      if (d.stats.completions[day] <= 0) delete d.stats.completions[day];
    }
  }

  function deleteTask(id) {
    const t = getTask(id);
    if (!t) return null;
    return commit((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== id);
      Object.values(d.dailyPlans).forEach((p) => { p.top3 = p.top3.filter((x) => x !== id); });
      return t;
    }, { type: 'task-deleted', id });
  }

  function toggleSubtask(taskId, subId) {
    const t = getTask(taskId);
    if (!t) return;
    const subtasks = t.subtasks.map((s) => (s.id === subId ? Object.assign({}, s, { done: !s.done }) : s));
    updateTask(taskId, { subtasks });
  }

  /* ======================= Categories ======================= */
  function category(id) { return data.categories.find((c) => c.id === id) || null; }

  function addCategory(name, color) {
    name = String(name || '').trim().slice(0, 40);
    if (!name) return { error: 'Please enter a category name.' };
    if (data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return { error: 'A category with that name already exists.' };
    const c = { id: U.uid('cat'), name, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#5f6b7a' };
    commit((d) => { d.categories.push(c); }, { type: 'category-added' });
    return { category: c };
  }

  function updateCategory(id, patch) {
    const c = category(id);
    if (!c) return { error: 'Category not found.' };
    const name = patch.name != null ? String(patch.name).trim().slice(0, 40) : c.name;
    if (!name) return { error: 'Category name cannot be empty.' };
    if (data.categories.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return { error: 'A category with that name already exists.' };
    const color = patch.color && /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : c.color;
    commit(() => { c.name = name; c.color = color; }, { type: 'category-updated' });
    return { category: c };
  }

  function deleteCategory(id) {
    commit((d) => {
      d.categories = d.categories.filter((c) => c.id !== id);
      d.tasks.forEach((t) => { if (t.categoryId === id) t.categoryId = null; });
    }, { type: 'category-deleted' });
  }

  /* ======================= Notes ======================= */
  function getNote(id) { return data.notes.find((n) => n.id === id) || null; }

  function addNote(fields) {
    const note = S.sanitizeNote(Object.assign({ createdAt: nowIso(), updatedAt: nowIso(), weekOf: weekStartOf(U.today()) }, fields));
    if (!note) return null;
    return commit((d) => { d.notes.push(note); return note; }, { type: 'note-added' });
  }

  function updateNote(id, patch) {
    const n = getNote(id);
    if (!n) return null;
    const note = S.sanitizeNote(Object.assign({}, n, patch, { id, updatedAt: nowIso() }));
    if (!note) return null;
    return commit((d) => {
      d.notes[d.notes.findIndex((x) => x.id === id)] = note;
      return note;
    }, { type: 'note-updated' });
  }

  function deleteNote(id) {
    return commit((d) => { d.notes = d.notes.filter((n) => n.id !== id); }, { type: 'note-deleted' });
  }

  /* ======================= Daily plans ======================= */
  function getPlan(date) {
    return data.dailyPlans[date] || { date, goal: '', top3: [], notes: '', reflection: '', updatedAt: null };
  }

  function updatePlan(date, patch, opts) {
    return commit((d) => {
      const p = Object.assign({}, getPlan(date), patch, { date, updatedAt: nowIso() });
      p.top3 = (p.top3 || []).filter((id, i, a) => getTask(id) && a.indexOf(id) === i).slice(0, 3);
      d.dailyPlans[date] = p;
      return p;
    }, Object.assign({ type: 'plan-updated' }, opts));
  }

  /** Toggle a task in a day's Top 3. Returns 'added' | 'removed' | 'full'. */
  function toggleTop3(date, taskId) {
    const p = getPlan(date);
    if (p.top3.includes(taskId)) {
      updatePlan(date, { top3: p.top3.filter((x) => x !== taskId) });
      return 'removed';
    }
    if (p.top3.length >= 3) return 'full';
    updatePlan(date, { top3: p.top3.concat(taskId) });
    return 'added';
  }

  /* ======================= Settings / stats / data ======================= */
  function updateSettings(patch) {
    return commit((d) => {
      d.settings = S.sanitizeSettings(Object.assign({}, d.settings, patch));
    }, { type: 'settings' });
  }

  function recordFocusSession() {
    commit((d) => {
      const day = U.today();
      d.stats.focusSessions[day] = (d.stats.focusSessions[day] || 0) + 1;
    }, { type: 'focus-session', silent: true });
  }

  function replaceData(newData) { commit((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, newData); }, { type: 'replace' }); }
  function mergeData(incoming) { replaceData(S.merge(data, incoming)); }
  function resetAll() {
    S.clearAll();
    data = S.defaultData();
    commit(() => {}, { type: 'replace' });
  }

  /* ======================= Selectors ======================= */
  const PRIORITY_WEIGHT = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_WEIGHT = { in_progress: 0, todo: 1, done: 2 };
  const pw = (t) => (t.priority ? PRIORITY_WEIGHT[t.priority] : 4);
  const dueKey = (t) => (t.dueDate ? t.dueDate + 'T' + (t.dueTime || '99:99') : '9999-99-99');

  function weekStartOf(date) { return U.startOfWeek(date, data.settings.weekStart); }

  function isOverdue(t) {
    if (t.status === 'done' || !t.dueDate) return false;
    const today = U.today();
    if (t.dueDate < today) return true;
    return t.dueDate === today && !!t.dueTime && t.dueTime < U.nowTime();
  }

  const isOpen = (t) => t.status !== 'done';
  const planned = () => data.tasks.filter((t) => !t.inbox);
  function inboxTasks() { return data.tasks.filter((t) => t.inbox && isOpen(t)); }
  function tasksOn(date) { return planned().filter((t) => t.dueDate === date); }
  function overdueTasks() {
    const today = U.today();
    return planned().filter((t) => isOpen(t) && t.dueDate && t.dueDate < today);
  }

  function compare(by) {
    const tie = (a, b) => pw(a) - pw(b) || dueKey(a).localeCompare(dueKey(b)) || a.createdAt.localeCompare(b.createdAt);
    switch (by) {
      case 'due': return (a, b) => dueKey(a).localeCompare(dueKey(b)) || pw(a) - pw(b) || a.createdAt.localeCompare(b.createdAt);
      case 'created': return (a, b) => b.createdAt.localeCompare(a.createdAt);
      case 'alpha': return (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
      case 'status': return (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] || tie(a, b);
      default: return tie;
    }
  }

  /** Sort; completed tasks always sink to the bottom (except 'status' sort, which already does). */
  function sortTasks(list, by) {
    const cmp = compare(by || data.settings.defaultSort);
    return list.slice().sort((a, b) => ((a.status === 'done') - (b.status === 'done')) || cmp(a, b));
  }

  function matchesQuery(t, q) {
    if (!q) return true;
    q = q.toLowerCase();
    const cat = category(t.categoryId);
    return t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q) ||
      t.tags.some((g) => g.includes(q.replace(/^#/, ''))) ||
      (cat && cat.name.toLowerCase().includes(q)) ||
      t.subtasks.some((s) => s.title.toLowerCase().includes(q));
  }

  function allTags() {
    const set = new Set();
    data.tasks.forEach((t) => t.tags.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }

  function counts() {
    const today = U.today();
    const open = planned().filter(isOpen);
    const weekStart = weekStartOf(today);
    const weekEnd = U.addDays(weekStart, 6);
    return {
      inbox: inboxTasks().length,
      tasks: open.length,
      today: open.filter((t) => t.dueDate && t.dueDate <= today).length,
      upcoming: open.filter((t) => t.dueDate && t.dueDate > today).length,
      planner: open.filter((t) => t.dueDate && t.dueDate >= weekStart && t.dueDate <= weekEnd).length,
      notes: data.notes.filter((n) => weekStartOf(n.weekOf) === weekStart).length,
    };
  }

  return {
    init, subscribe, commit,
    get data() { return data; },
    get settings() { return data.settings; },
    // tasks
    getTask, addTask, updateTask, setStatus, toggleComplete, deleteTask, toggleSubtask,
    // categories
    category, addCategory, updateCategory, deleteCategory,
    // notes
    getNote, addNote, updateNote, deleteNote,
    // plans
    getPlan, updatePlan, toggleTop3,
    // settings/data
    updateSettings, recordFocusSession, replaceData, mergeData, resetAll,
    // selectors
    weekStartOf, isOverdue, isOpen, inboxTasks, tasksOn, overdueTasks, sortTasks, matchesQuery,
    allTags, counts, planned, PRIORITY_WEIGHT,
  };
})();
