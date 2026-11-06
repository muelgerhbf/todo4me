/* Todo4Me — shared utilities (dates, escaping, DOM helpers).
 * All dates in the data model are local calendar dates as 'YYYY-MM-DD'
 * strings and times as 'HH:MM'; timestamps are ISO strings. */
window.T4 = window.T4 || {};

T4.util = (function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  function uid(prefix) {
    const rnd = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  }

  /* ---------- Dates ---------- */
  function toDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDate(str) {
    if (!isDateStr(str)) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function isDateStr(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function isTimeStr(str) {
    return typeof str === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
  }
  function today() { return toDateStr(new Date()); }
  function addDays(str, n) {
    const d = parseDate(str);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function addMonths(str, n) {
    const d = parseDate(str);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toDateStr(d);
  }
  /** weekStart: 0 = Sunday, 1 = Monday */
  function startOfWeek(str, weekStart) {
    const d = parseDate(str);
    const diff = (d.getDay() - weekStart + 7) % 7;
    d.setDate(d.getDate() - diff);
    return toDateStr(d);
  }
  function weekDays(startStr) {
    return Array.from({ length: 7 }, (_, i) => addDays(startStr, i));
  }
  function diffDays(a, b) {
    // whole days from a to b (b - a)
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  function startOfMonth(str) { return str.slice(0, 8) + '01'; }

  const tr = (key, fallback, params) => (T4.i18n && T4.i18n.has(key) ? T4.i18n.t(key, params) : fallback);
  const loc = () => (T4.i18n ? T4.i18n.locale() : undefined); // js/i18n.js loads after utils.js; everything works without it

  const fmtCache = {};
  function fmt(str, opts) {
    const key = loc() + '|' + JSON.stringify(opts);
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat(loc(), opts);
    const d = typeof str === 'string' ? parseDate(str) : str;
    return d ? fmtCache[key].format(d) : '';
  }
  /** Friendly relative label: Today, Tomorrow, Yesterday, Mon, Nov 12 (in the active language) */
  function relDate(str) {
    if (!str) return '';
    const t = today();
    const diff = diffDays(t, str);
    if (diff === 0) return tr('date.today', 'Today');
    if (diff === 1) return tr('date.tomorrow', 'Tomorrow');
    if (diff === -1) return tr('date.yesterday', 'Yesterday');
    if (diff > 1 && diff < 7) return fmt(str, { weekday: 'long' });
    const sameYear = str.slice(0, 4) === t.slice(0, 4);
    return fmt(str, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtTime(hhmm) {
    if (!isTimeStr(hhmm)) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return new Intl.DateTimeFormat(loc(), { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat(loc(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }
  function weekRangeLabel(startStr) {
    const end = addDays(startStr, 6);
    if (T4.i18n) return T4.i18n.fmtRange(startStr, end); // locale-correct order and separators
    const sameMonth = startStr.slice(0, 7) === end.slice(0, 7);
    const a = fmt(startStr, { month: 'short', day: 'numeric' });
    const b = fmt(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    return a + ' – ' + b + ', ' + end.slice(0, 4);
  }
  function fmtMinutes(min) {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    const H = (n) => tr('time.hoursShort', n + 'h', { n }), M = (n) => tr('time.minutesShort', n + 'm', { n });
    return h ? (m ? H(h) + ' ' + M(m) : H(h)) : M(m);
  }
  function nowTime() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------- Strings / HTML ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }
  /** Escape then turn line breaks into <br> */
  function escMultiline(v) { return esc(v).replace(/\n/g, '<br>'); }
  function icon(name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  function plural(n, word, pluralWord) {
    return n + ' ' + (n === 1 ? word : (pluralWord || word + 's'));
  }
  function parseTags(str) {
    if (Array.isArray(str)) return normalizeTags(str);
    return normalizeTags(String(str || '').split(','));
  }
  function normalizeTags(arr) {
    const out = [];
    arr.forEach((t) => {
      const v = String(t).trim().replace(/^#/, '').toLowerCase().slice(0, 40);
      if (v && !out.includes(v)) out.push(v);
    });
    return out.slice(0, 20);
  }

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function debounce(fn, ms) {
    let t;
    const d = function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
    d.flush = function () { clearTimeout(t); fn(); };
    return d;
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return tr('greeting.night', 'Good night');
    if (h < 12) return tr('greeting.morning', 'Good morning');
    if (h < 18) return tr('greeting.afternoon', 'Good afternoon');
    return tr('greeting.evening', 'Good evening');
  }

  return {
    uid, pad, toDateStr, parseDate, isDateStr, isTimeStr, today, addDays, addMonths,
    startOfWeek, weekDays, diffDays, startOfMonth, fmt, relDate, fmtTime, fmtDateTime,
    weekRangeLabel, fmtMinutes, nowTime, esc, escMultiline, icon, plural, parseTags,
    normalizeTags, $, $$, debounce, download, greeting,
  };
})();
