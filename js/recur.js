/* Todo4Me — recurrence engine (pure, no DOM, no store access).
 *
 * A task's `recurrence` is null or a rule object:
 *   { unit: 'day'|'week'|'month'|'year', every: 1..99,
 *     weekdays?: [0..6] (unit week only, 0 = Sunday, sorted, unique; absent = weekday of the due date),
 *     monthDay?: 1..31 | -1 (unit month only; absent = day of the due date; -1 = last day),
 *     from: 'due' | 'done' }
 * Old data stored the strings 'daily' | 'weekly' | 'monthly'; normalize() reads them forever.
 * All dates are local 'YYYY-MM-DD' strings (see utils.js). */
T4.recur = (function () {
  'use strict';
  const U = T4.util;
  const tt = (k, p) => T4.i18n.t(k, p);

  const UNITS = ['day', 'week', 'month', 'year'];
  const LEGACY = { daily: 'day', weekly: 'week', monthly: 'month' };
  const dayShort = (d) => T4.i18n.fmtWeekday(d, 'short');
  const dayLong = (d) => T4.i18n.fmtWeekday(d, 'long');
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const MAX_STEPS = 5000;

  /* ---------- normalize / equals ---------- */
  function intIn(x, min, max) {
    const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
    return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
  }

  /** Legacy string / rule object → clean rule object, anything invalid → null. */
  function normalize(x) {
    if (x == null) return null;
    if (typeof x === 'string') {
      const unit = LEGACY[x.trim().toLowerCase()];
      return unit ? { unit, every: 1, from: 'due' } : null;
    }
    if (typeof x !== 'object' || Array.isArray(x)) return null;
    if (!UNITS.includes(x.unit)) return null;
    let every = 1;
    if (x.every != null) {
      const n = typeof x.every === 'string' ? Number(x.every) : x.every;
      if (typeof n !== 'number' || !Number.isFinite(n)) return null;
      every = Math.min(99, Math.max(1, Math.round(n)));
    }
    const rule = { unit: x.unit, every };
    if (x.unit === 'week' && Array.isArray(x.weekdays)) {
      const days = Array.from(new Set(x.weekdays.map((d) => intIn(d, 0, 6)).filter((d) => d != null))).sort((a, b) => a - b);
      if (days.length) rule.weekdays = days;
    }
    if (x.unit === 'month' && x.monthDay != null) {
      const md = intIn(x.monthDay, 1, 31) != null ? intIn(x.monthDay, 1, 31) : (intIn(x.monthDay, -1, -1));
      if (md != null) rule.monthDay = md;
    }
    rule.from = x.from === 'done' ? 'done' : 'due';
    return rule;
  }

  function equals(a, b) {
    const x = normalize(a);
    const y = normalize(b);
    if (!x || !y) return !x && !y;
    return JSON.stringify(x) === JSON.stringify(y);
  }

  /* ---------- next occurrence ---------- */
  const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
  /** Monday-based index of a date: 0 = Monday … 6 = Sunday. */
  const mondayIndex = (str) => (U.parseDate(str).getDay() + 6) % 7;

  /**
   * Next due date for a completed task. `due` = its due date (falls back to the completion day),
   * `done` = completion day (default today), `today` (default today) is the floor for from 'due':
   * the result is always after today and after the due date; from 'done' it is after `done`.
   * Whole intervals are always counted from the base date (no drift: Jan 31 monthly → Feb 28 → Mar 31).
   */
  function next(rule, ctx) {
    const r = normalize(rule);
    if (!r) return null;
    ctx = ctx || {};
    const today = U.isDateStr(ctx.today) ? ctx.today : U.today();
    const done = U.isDateStr(ctx.done) ? ctx.done : today;
    const byDone = r.from === 'done';
    const anchor = byDone ? done : (U.isDateStr(ctx.due) ? ctx.due : done);
    const floor = byDone ? done : (today > anchor ? today : anchor); // result must be > floor

    if (r.unit === 'day' || (r.unit === 'week' && !(r.weekdays && r.weekdays.length))) {
      const step = r.unit === 'day' ? r.every : 7 * r.every;
      const gap = U.diffDays(anchor, floor);
      const k = Math.max(1, Math.floor(gap / step) + 1);
      return U.addDays(anchor, k * step);
    }

    if (r.unit === 'week') {
      // Weeks start on Monday; with every > 1 only every n-th week counted from the anchor's week is used.
      const monday0 = U.addDays(anchor, -mondayIndex(anchor));
      const order = r.weekdays.map((d) => (d + 6) % 7).sort((a, b) => a - b); // Monday-first offsets
      const weeksGap = Math.floor(U.diffDays(monday0, floor) / 7);
      let j = Math.max(0, Math.floor(weeksGap / r.every) * r.every);
      for (let n = 0; n < MAX_STEPS; n++, j += r.every) {
        for (const off of order) {
          const d = U.addDays(monday0, 7 * j + off);
          if (d > floor) return d;
        }
      }
      return null;
    }

    const a = U.parseDate(anchor);
    if (r.unit === 'month') {
      const startIdx = a.getFullYear() * 12 + a.getMonth();
      const fl = U.parseDate(floor);
      const gapMonths = fl.getFullYear() * 12 + fl.getMonth() - startIdx;
      let k = Math.max(0, Math.floor(gapMonths / r.every) * r.every);
      for (let n = 0; n < MAX_STEPS; n++, k += r.every) {
        let d;
        if (r.monthDay == null) {
          d = U.addMonths(anchor, k); // clipped from the original day each time → no drift
        } else {
          const idx = startIdx + k;
          const y = Math.floor(idx / 12);
          const m0 = idx % 12;
          const last = daysInMonth(y, m0);
          d = U.toDateStr(new Date(y, m0, r.monthDay === -1 ? last : Math.min(r.monthDay, last)));
        }
        if (d > floor && d > anchor) return d;
      }
      return null;
    }

    // year: same month/day, Feb 29 → Feb 28 in non-leap years (counted from the original, so it comes back)
    const gapYears = U.parseDate(floor).getFullYear() - a.getFullYear();
    let k = Math.max(0, Math.floor(gapYears / r.every) * r.every);
    for (let n = 0; n < MAX_STEPS; n++, k += r.every) {
      const d = U.addMonths(anchor, 12 * k);
      if (d > floor && d > anchor) return d;
    }
    return null;
  }

  /* ---------- text ---------- */
  /** Ordinal number in the active language (English 1st/2nd/3rd/4th via Intl ordinal rules, others "5." / "5"). */
  function ordinal(n) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(T4.i18n.language(), { type: 'ordinal' }).select(n); } catch (e) { /* other */ }
    return tt('rc.ord.' + (['one', 'two', 'few'].includes(cat) ? cat : 'other'), { n });
  }
  const mondayFirst = (days) => days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const isWeekdays = (r) => r.weekdays && r.weekdays.length === 5 && WEEKDAYS.every((d) => r.weekdays.includes(d));

  /** Description in the active language; short: true gives compact text for chips. */
  function describe(rule, opts) {
    const r = normalize(rule);
    if (!r) return '';
    const short = !!(opts && opts.short);
    const n = r.every;
    let s;
    if (r.unit === 'day') {
      s = n === 1 ? tt('rc.daily') : tt('rc.everyNDays', { count: n });
    } else if (r.unit === 'week') {
      const days = r.weekdays ? mondayFirst(r.weekdays).map(dayShort).join(', ') : '';
      if (n === 1 && isWeekdays(r)) s = tt(short ? 'rc.weekdaysShort' : 'rc.weekdaysLong');
      else if (short) s = (n === 1 ? (days || tt('rc.weekly')) : tt('rc.everyNWeeksShort', { count: n }) + (days ? ' ' + days : ''));
      else {
        const base = n === 1 ? tt('rc.weekly') : tt('rc.everyNWeeks', { count: n });
        s = days ? tt('rc.onDays', { base, days }) : base;
      }
    } else if (r.unit === 'month') {
      const md = r.monthDay == null ? '' : (r.monthDay === -1 ? tt(short ? 'rc.lastShort' : 'rc.theLast') : (short ? ordinal(r.monthDay) : tt('rc.theOrd', { ord: ordinal(r.monthDay) })));
      if (short) s = (n === 1 ? tt('rc.monthly') : tt('rc.everyNMonthsShort', { count: n })) + (md ? ' ' + md : '');
      else {
        const base = n === 1 ? tt('rc.monthly') : tt('rc.everyNMonths', { count: n });
        s = md ? tt('rc.onDay', { base, day: md }) : base;
      }
    } else {
      s = n === 1 ? tt('rc.yearly') : tt(short ? 'rc.everyNYearsShort' : 'rc.everyNYears', { count: n });
    }
    if (r.from === 'done') s = tt(short ? 'rc.afterDoneShort' : 'rc.afterDone', { text: s });
    return s;
  }

  /* ---------- editor presets ---------- */
  /** Common rules for the editor, matched to the due date (default today). */
  function presets(dueDate) {
    const due = U.isDateStr(dueDate) ? dueDate : U.today();
    const d = U.parseDate(due);
    const dow = d.getDay();
    const day = d.getDate();
    const isLast = day === daysInMonth(d.getFullYear(), d.getMonth());
    const list = [
      { id: 'daily', label: tt('rc.daily'), rule: { unit: 'day', every: 1, from: 'due' } },
      { id: 'weekdays', label: tt('rc.weekdaysLong'), rule: { unit: 'week', every: 1, weekdays: WEEKDAYS.slice(), from: 'due' } },
      { id: 'weekly', label: tt('rc.presetWeekly', { day: dayLong(dow) }), rule: { unit: 'week', every: 1, weekdays: [dow], from: 'due' } },
      { id: 'biweekly', label: tt('rc.presetBiweekly', { day: dayLong(dow) }), rule: { unit: 'week', every: 2, weekdays: [dow], from: 'due' } },
      { id: 'monthly', label: tt('rc.presetMonthly', { ord: ordinal(day) }), rule: { unit: 'month', every: 1, monthDay: day, from: 'due' } },
    ];
    if (isLast) list.push({ id: 'monthly-last', label: tt('rc.presetMonthlyLast'), rule: { unit: 'month', every: 1, monthDay: -1, from: 'due' } });
    list.push({ id: 'yearly', label: tt('rc.presetYearly', { date: T4.i18n.fmtDate(due, { month: 'short', day: 'numeric' }) }), rule: { unit: 'year', every: 1, from: 'due' } });
    return list;
  }

  return { normalize, next, describe, presets, equals };
})();
