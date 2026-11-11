/* Todo4Me — persistence layer.
 *
 * Responsibilities:
 *  - define the default data shape (see README "Data model")
 *  - validate + sanitize any data coming from storage or an import file
 *  - read/write through a swappable adapter (LocalStorage today; a REST
 *    adapter with the same load/save interface can replace it later)
 *  - keep a rolling daily backup and quarantine corrupted data instead of
 *    silently discarding it.
 */
T4.storage = (function () {
  'use strict';
  const U = T4.util;

  const SCHEMA_VERSION = 1;
  const KEY = 'todo4me.data.v1';
  const BACKUP_KEY = 'todo4me.backup.v1';
  const CORRUPT_PREFIX = 'todo4me.corrupt.';

  const PRIORITIES = ['critical', 'high', 'medium', 'low'];
  const STATUSES = ['todo', 'in_progress', 'done'];
  const THEMES = ['light', 'dark', 'system'];
  const SORTS = ['priority', 'due', 'created', 'alpha', 'status'];
  // Customization (2.3.0): design = look preset (js/themes.js); 'design' values follow the chosen design.
  const ACCENT_SOURCES = ['design', 'custom'];
  const FONTS = ['design', 'system', 'inter', 'serif', 'mono', 'rounded'];
  const RADII = ['design', 'sharp', 'soft', 'round'];
  const DENSITIES = ['comfortable', 'compact'];
  const LANGUAGES = ['auto', 'en', 'de', 'tr', 'es'];
  const UI_MODES = ['simple', 'advanced'];
  const ACCENTS = ['#5b5bd6', '#0e7c86', '#2f6fed', '#d6409f', '#e5603c', '#3e9b4f', '#8e4ec6', '#5f6b7a'];

  const DEFAULT_CATEGORIES = [
    { id: 'cat_work', name: 'Work', color: '#2f6fed' },
    { id: 'cat_personal', name: 'Personal', color: '#8e4ec6' },
    { id: 'cat_health', name: 'Health', color: '#3e9b4f' },
    { id: 'cat_shopping', name: 'Shopping', color: '#e5603c' },
    { id: 'cat_learning', name: 'Learning', color: '#0e7c86' },
    { id: 'cat_other', name: 'Other', color: '#5f6b7a' },
  ];

  function defaultSettings() {
    return {
      userName: '',
      theme: 'system',
      accent: ACCENTS[0],
      defaultSort: 'priority',
      weekStart: 1,
      showCompleted: true,
      pomodoroFocus: 25,
      pomodoroBreak: 5,
      reminderTime: '09:00', // when to remind for tasks that have a due date but no time
      design: 'classic',       // look preset id (js/themes.js); unknown ids fall back to classic
      accentSource: 'custom',  // 'design' = use the design's accent, 'custom' = settings.accent
      font: 'design',
      radius: 'design',
      density: 'comfortable',
      fontScale: 100,          // percent, 85..125
      nav: { hidden: [], order: [] }, // sidebar: hidden view ids, custom order of view ids
      language: 'auto',        // 'auto' = from the system/browser language
      uiMode: 'advanced',      // 'simple' | 'advanced' (js/mode.js); a missing value (data from before 2.7) means advanced
    };
  }

  function defaultData() {
    const now = new Date().toISOString();
    return {
      version: SCHEMA_VERSION,
      tasks: [],
      categories: DEFAULT_CATEGORIES.map((c) => Object.assign({}, c)),
      notes: [],
      dailyPlans: {},
      settings: defaultSettings(),
      stats: { completions: {}, focusSessions: {} },
      meta: { createdAt: now, updatedAt: now },
    };
  }

  /* ---------------- Validation / sanitizing ---------------- */
  const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max || 10000);
  const isoOrNull = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null);
  const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const intIn = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
  };
  const hex = (v, dflt) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : dflt);
  // Reminder = minutes before the due date/time (0 = at due time, max. 4 weeks). Needs a due date.
  const REMINDER_MAX = 40320;
  const reminderOrNull = (v, hasDate) => (!hasDate || v == null || v === '' || typeof v === 'boolean' ? null : intIn(v, 0, REMINDER_MAX, null));
  // Bookkeeping key of the occurrence whose reminder already fired ("YYYY-MM-DD HH:MM|minutes").
  const firedKey = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} (\d{2}:\d{2})?\|\d{1,5}$/.test(v) ? v : null);

  function sanitizeTask(t, categoryIds) {
    if (!t || typeof t !== 'object') return null;
    const title = str(t.title, 500).trim();
    if (!title) return null;
    const now = new Date().toISOString();
    const status = oneOf(t.status, STATUSES, t.completed ? 'done' : 'todo');
    const subtasks = Array.isArray(t.subtasks) ? t.subtasks
      .filter((s) => s && typeof s === 'object' && str(s.title, 300).trim())
      .slice(0, 100)
      .map((s) => ({ id: typeof s.id === 'string' && s.id ? s.id : U.uid('sub'), title: str(s.title, 300).trim(), done: !!s.done }))
      : [];
    const est = t.estimate == null || t.estimate === '' ? null : intIn(t.estimate, 1, 1440, null);
    return {
      id: typeof t.id === 'string' && t.id ? t.id : U.uid('task'),
      title,
      description: str(t.description, 10000),
      notes: str(t.notes, 10000),
      status,
      priority: t.priority == null ? null : oneOf(t.priority, PRIORITIES, null),
      categoryId: typeof t.categoryId === 'string' && categoryIds.has(t.categoryId) ? t.categoryId : null,
      tags: U.normalizeTags(Array.isArray(t.tags) ? t.tags : []),
      dueDate: U.isDateStr(t.dueDate) ? t.dueDate : null,
      dueTime: U.isDateStr(t.dueDate) && U.isTimeStr(t.dueTime) ? t.dueTime : null,
      estimate: est,
      subtasks,
      recurrence: T4.recur.normalize(t.recurrence), // legacy 'daily'/'weekly'/'monthly' strings become rule objects
      reminder: reminderOrNull(t.reminder, U.isDateStr(t.dueDate)),
      reminderFired: firedKey(t.reminderFired),
      reminderSnooze: isoOrNull(t.reminderSnooze),
      inbox: !!t.inbox,
      nextOccurrenceId: typeof t.nextOccurrenceId === 'string' ? t.nextOccurrenceId : null,
      createdAt: isoOrNull(t.createdAt) || now,
      updatedAt: isoOrNull(t.updatedAt) || now,
      completedAt: status === 'done' ? (isoOrNull(t.completedAt) || now) : null,
    };
  }

  function sanitizeCategory(c) {
    if (!c || typeof c !== 'object') return null;
    const name = str(c.name, 40).trim();
    if (!name) return null;
    return {
      id: typeof c.id === 'string' && c.id ? c.id : U.uid('cat'),
      name,
      color: hex(c.color, '#5f6b7a'),
    };
  }

  function sanitizeNote(n) {
    if (!n || typeof n !== 'object') return null;
    const title = str(n.title, 300).trim();
    const body = str(n.body, 20000);
    if (!title && !body.trim()) return null;
    const now = new Date().toISOString();
    return {
      id: typeof n.id === 'string' && n.id ? n.id : U.uid('note'),
      title,
      body,
      weekOf: U.isDateStr(n.weekOf) ? n.weekOf : U.today(),
      tags: U.normalizeTags(Array.isArray(n.tags) ? n.tags : []),
      pinned: !!n.pinned,
      createdAt: isoOrNull(n.createdAt) || now,
      updatedAt: isoOrNull(n.updatedAt) || now,
    };
  }

  function sanitizePlan(date, p, taskIds) {
    if (!U.isDateStr(date) || !p || typeof p !== 'object') return null;
    const top3 = (Array.isArray(p.top3) ? p.top3 : [])
      .filter((id, i, arr) => typeof id === 'string' && taskIds.has(id) && arr.indexOf(id) === i)
      .slice(0, 3);
    return {
      date,
      goal: str(p.goal, 500),
      top3,
      notes: str(p.notes, 20000),
      reflection: str(p.reflection, 20000),
      updatedAt: isoOrNull(p.updatedAt) || new Date().toISOString(),
    };
  }

  function sanitizeSettings(s) {
    const d = defaultSettings();
    s = s && typeof s === 'object' ? s : {};
    return {
      userName: str(s.userName, 60).trim(),
      theme: oneOf(s.theme, THEMES, d.theme),
      accent: hex(s.accent, d.accent),
      defaultSort: oneOf(s.defaultSort, SORTS, d.defaultSort),
      weekStart: s.weekStart === 0 || s.weekStart === '0' ? 0 : 1,
      showCompleted: s.showCompleted == null ? d.showCompleted : !!s.showCompleted,
      pomodoroFocus: intIn(s.pomodoroFocus, 1, 120, d.pomodoroFocus),
      pomodoroBreak: intIn(s.pomodoroBreak, 1, 60, d.pomodoroBreak),
      reminderTime: U.isTimeStr(s.reminderTime) ? s.reminderTime : d.reminderTime,
      design: typeof s.design === 'string' && /^[a-z0-9-]{1,32}$/.test(s.design) ? s.design : d.design,
      accentSource: oneOf(s.accentSource, ACCENT_SOURCES, d.accentSource),
      font: oneOf(s.font, FONTS, d.font),
      radius: oneOf(s.radius, RADII, d.radius),
      density: oneOf(s.density, DENSITIES, d.density),
      fontScale: intIn(s.fontScale, 85, 125, d.fontScale),
      nav: sanitizeNav(s.nav),
      language: oneOf(s.language, LANGUAGES, d.language),
      uiMode: oneOf(s.uiMode, UI_MODES, d.uiMode),
    };
  }

  /** Sidebar customization: hidden view ids and a custom order (unknown ids are ignored by the app). */
  function sanitizeNav(n) {
    const ids = (a) => Array.from(new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && /^[a-z-]{1,24}$/.test(x)))).slice(0, 30);
    n = n && typeof n === 'object' ? n : {};
    return { hidden: ids(n.hidden), order: ids(n.order) };
  }

  function sanitizeCounterMap(m) {
    const out = {};
    if (m && typeof m === 'object') {
      Object.keys(m).forEach((k) => {
        const n = Number(m[k]);
        if (U.isDateStr(k) && Number.isFinite(n) && n > 0) out[k] = Math.round(n);
      });
    }
    return out;
  }

  /**
   * Turn arbitrary input into a valid data object. Never throws for
   * object input; returns { data, issues } where issues counts dropped items.
   */
  function sanitize(input) {
    const issues = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Data is not a JSON object.');
    }
    if (typeof input.version === 'number' && input.version > SCHEMA_VERSION) {
      issues.push(T4.i18n.t('sto.newerVersion'));
    }
    const base = defaultData();

    let categories = Array.isArray(input.categories) ? input.categories.map(sanitizeCategory).filter(Boolean) : base.categories;
    categories = dedupeById(categories);
    if (Array.isArray(input.categories) && categories.length < input.categories.length) issues.push(T4.i18n.t('sto.skipCats', { count: input.categories.length - categories.length }));
    const catIds = new Set(categories.map((c) => c.id));

    const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
    const tasks = dedupeById(rawTasks.map((t) => sanitizeTask(t, catIds)).filter(Boolean));
    if (tasks.length < rawTasks.length) issues.push(T4.i18n.t('sto.skipTasks', { count: rawTasks.length - tasks.length }));
    const taskIds = new Set(tasks.map((t) => t.id));

    const rawNotes = Array.isArray(input.notes) ? input.notes : [];
    const notes = dedupeById(rawNotes.map(sanitizeNote).filter(Boolean));
    if (notes.length < rawNotes.length) issues.push(T4.i18n.t('sto.skipNotes', { count: rawNotes.length - notes.length }));

    const dailyPlans = {};
    if (input.dailyPlans && typeof input.dailyPlans === 'object') {
      Object.keys(input.dailyPlans).forEach((date) => {
        const p = sanitizePlan(date, input.dailyPlans[date], taskIds);
        if (p) dailyPlans[date] = p;
      });
    }

    const stats = input.stats && typeof input.stats === 'object' ? input.stats : {};
    const data = {
      version: SCHEMA_VERSION,
      tasks,
      categories,
      notes,
      dailyPlans,
      settings: sanitizeSettings(input.settings),
      stats: {
        completions: sanitizeCounterMap(stats.completions),
        focusSessions: sanitizeCounterMap(stats.focusSessions),
      },
      meta: {
        createdAt: isoOrNull(input.meta && input.meta.createdAt) || base.meta.createdAt,
        updatedAt: isoOrNull(input.meta && input.meta.updatedAt) || base.meta.updatedAt,
      },
    };
    return { data, issues };
  }

  function dedupeById(list) {
    const seen = new Set();
    return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  }

  /* ---------------- Adapter ---------------- */
  // Any object with load(): string|null and save(string): void can be used.
  const localAdapter = {
    name: 'localStorage',
    load: (key) => localStorage.getItem(key),
    save: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  };
  let adapter = localAdapter;
  let available = true;
  try {
    const probe = '__t4_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (e) {
    available = false;
    const mem = {};
    adapter = { name: 'memory', load: (k) => (k in mem ? mem[k] : null), save: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } };
  }

  /**
   * Load data. Returns { data, warnings[], firstRun }.
   * Corrupted primary data falls back to the backup and is quarantined.
   */
  function load() {
    const warnings = [];
    if (!available) warnings.push(T4.i18n.t('sto.unavailable'));
    let raw = null;
    try { raw = adapter.load(KEY); } catch (e) { warnings.push(T4.i18n.t('sto.readFailed')); }
    if (raw == null) {
      return { data: defaultData(), warnings, firstRun: true };
    }
    try {
      const { data, issues } = sanitize(JSON.parse(raw));
      if (issues.length) warnings.push(T4.i18n.t('sto.repaired', { issues: issues.join('; ') }));
      return { data, warnings, firstRun: false };
    } catch (err) {
      // Quarantine the unreadable payload so it is never lost.
      try { adapter.save(CORRUPT_PREFIX + Date.now(), raw); } catch (e) { /* ignore */ }
      const backup = loadBackup();
      if (backup) {
        warnings.push(T4.i18n.t('sto.restoredBackup', { date: U.fmtDateTime(backup.at) }));
        return { data: backup.data, warnings, firstRun: false };
      }
      warnings.push(T4.i18n.t('sto.noBackup'));
      return { data: defaultData(), warnings, firstRun: false };
    }
  }

  function loadBackup() {
    try {
      const raw = adapter.load(BACKUP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { at: parsed.at, data: sanitize(parsed.data).data };
    } catch (e) { return null; }
  }

  let lastSavedAt = null;
  /** Persist data. Returns true on success. */
  function save(data) {
    data.meta.updatedAt = new Date().toISOString();
    const json = JSON.stringify(data);
    try {
      adapter.save(KEY, json);
      lastSavedAt = new Date();
      maybeBackup(data);
      return true;
    } catch (e) {
      console.warn('[Todo4Me] save failed', e);
      return false;
    }
  }

  /** Keep one automatic backup, refreshed at most once per day. */
  function maybeBackup(data) {
    try {
      const raw = adapter.load(BACKUP_KEY);
      const prev = raw ? JSON.parse(raw) : null;
      if (prev && prev.at && Date.now() - Date.parse(prev.at) < 24 * 3600 * 1000) return;
      adapter.save(BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), data }));
    } catch (e) { /* backup is best-effort */ }
  }

  function backupInfo() {
    try {
      const raw = adapter.load(BACKUP_KEY);
      return raw ? JSON.parse(raw).at : null;
    } catch (e) { return null; }
  }

  function usageBytes() {
    try {
      const raw = adapter.load(KEY) || '';
      return raw.length * 2;
    } catch (e) { return 0; }
  }

  function clearAll() {
    [KEY, BACKUP_KEY].forEach((k) => { try { adapter.remove(k); } catch (e) { /* ignore */ } });
  }

  /* ---------------- Export / import ---------------- */
  function exportJSON(data) {
    return JSON.stringify({ app: 'todo4me', exportedAt: new Date().toISOString(), ...data }, null, 2);
  }

  /** Parse an import file. Throws with a readable message on failure. */
  function parseImport(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error(T4.i18n.t('sto.badJson')); }
    if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.notes))) {
      throw new Error(T4.i18n.t('sto.notBackup'));
    }
    return sanitize(parsed);
  }

  /** Merge incoming into current; for equal ids the most recently updated wins. */
  function merge(current, incoming) {
    const pick = (a, b) => (Date.parse(b.updatedAt || 0) > Date.parse(a.updatedAt || 0) ? b : a);
    const mergeList = (a, b, newer) => {
      const map = new Map(a.map((x) => [x.id, x]));
      b.forEach((x) => map.set(x.id, map.has(x.id) ? (newer ? pick(map.get(x.id), x) : map.get(x.id)) : x));
      return Array.from(map.values());
    };
    const plans = Object.assign({}, current.dailyPlans);
    Object.keys(incoming.dailyPlans).forEach((d) => {
      plans[d] = plans[d] ? pick(plans[d], incoming.dailyPlans[d]) : incoming.dailyPlans[d];
    });
    const sumMaps = (a, b) => {
      const out = Object.assign({}, a);
      Object.keys(b).forEach((k) => { out[k] = Math.max(out[k] || 0, b[k]); });
      return out;
    };
    const merged = {
      version: SCHEMA_VERSION,
      tasks: mergeList(current.tasks, incoming.tasks, true),
      categories: mergeList(current.categories, incoming.categories, false),
      notes: mergeList(current.notes, incoming.notes, true),
      dailyPlans: plans,
      settings: current.settings,
      stats: {
        completions: sumMaps(current.stats.completions, incoming.stats.completions),
        focusSessions: sumMaps(current.stats.focusSessions, incoming.stats.focusSessions),
      },
      meta: current.meta,
    };
    return sanitize(merged).data;
  }

  return {
    KEY, SCHEMA_VERSION, REMINDER_MAX, ACCENT_SOURCES, FONTS, RADII, DENSITIES, LANGUAGES, PRIORITIES, STATUSES, SORTS, ACCENTS, DEFAULT_CATEGORIES,
    defaultData, defaultSettings, sanitize, sanitizeTask, sanitizeNote, sanitizeSettings, load, save, loadBackup,
    backupInfo, usageBytes, clearAll, exportJSON, parseImport, merge,
    get isAvailable() { return available; },
    get adapterName() { return adapter.name; },
    get lastSavedAt() { return lastSavedAt; },
    setAdapter(a) { adapter = a; },
  };
})();
