/* Todo4Me — internationalisation engine (T4.i18n).
 * Languages: en (base), de, tr, es. Dictionaries live in js/i18n/<lang>.js and register themselves
 * with T4.i18n.add(lang, { 'key': 'text' | { one, other, … } }).
 *  - t(key, params): "{name}" interpolation; a plural entry is an object keyed by Intl.PluralRules
 *    categories (zero/one/two/few/many/other) and/or exact '=0' / '=1'; the count comes from params.count.
 *  - Fallback chain: active language → English → the key itself.
 *  - Dates/numbers go through Intl with the active locale (fmtDate, fmtTime, fmtWeekday, fmtMonth).
 *  - Static HTML: data-i18n="key" (textContent) and data-i18n-<attr>="key" for aria-label, title, placeholder, content, alt.
 * Translate whole sentences with placeholders — never glue translated fragments together
 * (word order, suffixes and vowel harmony differ between languages). */
window.T4 = window.T4 || {};

T4.i18n = (function () {
  'use strict';

  const LANGUAGES = [
    { id: 'en', name: 'English' },
    { id: 'de', name: 'Deutsch' },
    { id: 'tr', name: 'Türkçe' },
    { id: 'es', name: 'Español' },
  ];
  const IDS = LANGUAGES.map((l) => l.id);
  const DEFAULT_LOCALE = { en: 'en-US', de: 'de-DE', tr: 'tr-TR', es: 'es-ES' };
  const ATTRS = ['aria-label', 'title', 'placeholder', 'content', 'alt'];

  const dicts = {};
  const listeners = [];
  const state = { pref: 'auto', lang: 'en' };
  let subscribed = false;

  function add(lang, entries) {
    if (!IDS.includes(lang) || !entries) return;
    dicts[lang] = Object.assign(dicts[lang] || {}, entries);
  }

  /* ---------- Detection ---------- */
  function browserTags() {
    const nav = (typeof navigator !== 'undefined' && navigator) || {};
    const list = Array.isArray(nav.languages) && nav.languages.length ? nav.languages.slice() : [];
    if (nav.language) list.unshift(nav.language);
    return list.filter((x) => typeof x === 'string');
  }
  /** Map a BCP-47 tag (or the browser's language list when omitted) to a supported language id; unsupported → 'en'. */
  function detect(tag) {
    const tags = tag ? [tag] : browserTags();
    for (let i = 0; i < tags.length; i++) {
      const base = String(tags[i]).toLowerCase().split(/[-_]/)[0];
      if (IDS.includes(base)) return base;
    }
    return 'en';
  }
  function resolve(pref) { return IDS.includes(pref) ? pref : detect(); }

  /* ---------- Translation ---------- */
  function lookup(lang, key) {
    const d = dicts[lang];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }
  function pickPlural(entry, lang, count) {
    if (Object.prototype.hasOwnProperty.call(entry, '=' + count)) return entry['=' + count];
    let cat = 'other';
    try { cat = new Intl.PluralRules(lang).select(Number(count)); } catch (e) { /* other */ }
    return entry[cat] != null ? entry[cat] : (entry.other != null ? entry.other : entry.one);
  }
  function t(key, params) {
    let lang = state.lang;
    let entry = lookup(lang, key);
    if (entry === undefined) { entry = lookup('en', key); lang = 'en'; }
    if (entry === undefined) return key;
    if (entry && typeof entry === 'object') {
      const p = params || {};
      const n = p.count != null ? p.count : p.n;
      entry = pickPlural(entry, lang, n == null ? 1 : n);
      if (entry == null) return key;
    }
    if (!params) return String(entry);
    return String(entry).replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
  }
  function has(key) { return lookup(state.lang, key) !== undefined || lookup('en', key) !== undefined; }

  /* ---------- Locale + Intl formatting ---------- */
  function locale() {
    const tag = browserTags().find((x) => String(x).toLowerCase().split(/[-_]/)[0] === state.lang);
    return tag || DEFAULT_LOCALE[state.lang] || 'en-US';
  }
  const fmtCache = {};
  function formatter(opts) {
    const loc = locale();
    const key = loc + '|' + JSON.stringify(opts);
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat(loc, opts);
    return fmtCache[key];
  }
  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      const d = new Date(v);
      return isNaN(d) ? null : d;
    }
    return null;
  }
  /** 'YYYY-MM-DD' | Date, Intl options (default: medium date) */
  function fmtDate(v, opts) {
    const d = toDate(v);
    return d ? formatter(opts || { dateStyle: 'medium' }).format(d) : '';
  }
  /** 'HH:MM' | Date → localized time (12h/24h per locale) */
  function fmtTime(v) {
    let d = v;
    if (typeof v === 'string') {
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
      if (!m) return '';
      d = new Date(2000, 0, 1, +m[1], +m[2]);
    }
    return d instanceof Date && !isNaN(d) ? formatter({ hour: 'numeric', minute: '2-digit' }).format(d) : '';
  }
  /** idx 0..6 (0 = Sunday) or a date; style 'long' | 'short' | 'narrow' */
  function fmtWeekday(v, style) {
    const d = typeof v === 'number' ? new Date(2024, 0, 7 + (((v % 7) + 7) % 7)) : toDate(v); // 2024-01-07 is a Sunday
    return d ? formatter({ weekday: style || 'long' }).format(d) : '';
  }
  /** idx 0..11 or a date; style 'long' | 'short' | 'narrow' */
  function fmtMonth(v, style) {
    const d = typeof v === 'number' ? new Date(2024, ((v % 12) + 12) % 12, 1) : toDate(v);
    return d ? formatter({ month: style || 'long' }).format(d) : '';
  }
  function fmtNumber(n, opts) { return new Intl.NumberFormat(locale(), opts).format(n); }
  /** Localized date range ("Nov 6 – 12, 2026"); a/b are 'YYYY-MM-DD' or Date. */
  function fmtRange(a, b, opts) {
    const da = toDate(a), db = toDate(b);
    if (!da || !db) return '';
    return formatter(opts || { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(da, db);
  }

  /* ---------- DOM (static HTML) ---------- */
  function applyStatic(root) {
    if (typeof document === 'undefined') return;
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (has(k)) el.textContent = t(k);
    });
    ATTRS.forEach((a) => {
      scope.querySelectorAll('[data-i18n-' + a + ']').forEach((el) => {
        const k = el.getAttribute('data-i18n-' + a);
        if (has(k)) el.setAttribute(a, t(k));
      });
    });
  }

  /* ---------- Language selection ---------- */
  function apply(pref, opts) {
    const o = opts || {};
    const next = IDS.includes(pref) ? pref : 'auto';
    const lang = resolve(next);
    const langChanged = lang !== state.lang;
    const changed = langChanged || next !== state.pref;
    state.pref = next;
    state.lang = lang;
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang);
    applyStatic();
    if (o.first || langChanged) {
      // Desktop: tell the main process (menu, tray, notifications) which language the UI uses.
      const d = typeof window !== 'undefined' && window.todo4meDesktop;
      if (d && typeof d.setLanguage === 'function') { try { d.setLanguage(lang); } catch (e) { /* ignore */ } }
    }
    if (changed) listeners.slice().forEach((fn) => { try { fn(lang, next); } catch (e) { console.error(e); } });
    if (langChanged && o.render !== false) {
      if (T4.app && T4.app.render) T4.app.render();
      if (T4.ui && T4.ui.refreshModal) T4.ui.refreshModal();
    }
    return changed;
  }
  /** Change the language ('auto' | 'en' | 'de' | 'tr' | 'es'): persists settings.language, updates <html lang>,
   *  the static texts and re-renders the current view. */
  function setLanguage(lang) {
    if (lang !== 'auto' && !IDS.includes(lang)) return false;
    const st = T4.store && T4.store.settings;
    // The store subscriber below applies the change (and the app re-renders); apply directly if nothing was notified.
    if (st && st.language !== lang && T4.store.updateSettings) T4.store.updateSettings({ language: lang });
    if (state.pref !== lang) apply(lang);
    return true;
  }
  /** Follow settings.language; also reacts to imports and changes from elsewhere. Called automatically on DOMContentLoaded
   *  (before the app's own init renders), so no wiring in app.js is needed. */
  function init() {
    const read = () => (T4.store && T4.store.settings && T4.store.settings.language) || 'auto';
    apply(stored() || read(), { first: true, render: false });
    if (!subscribed && T4.store && T4.store.subscribe) {
      subscribed = true;
      T4.store.subscribe(() => { const p = read(); if (p !== state.pref) apply(p, { render: false }); });
    }
  }
  /** settings.language straight from LocalStorage – available before store.init() has run. */
  function stored() {
    try {
      const raw = localStorage.getItem('todo4me.data.v1');
      const l = raw ? (JSON.parse(raw).settings || {}).language : null;
      return l === 'auto' || IDS.includes(l) ? l : null;
    } catch (e) { return null; }
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => { try { init(); } catch (e) { console.error(e); } });
  }

  return {
    t, has, add, init, detect, locale, setLanguage, onChange, applyStatic,
    languages: () => LANGUAGES.map((l) => Object.assign({}, l)),
    language: () => state.lang,
    preference: () => state.pref,
    keys: (lang) => Object.keys(dicts[lang] || {}),
    fmtDate, fmtTime, fmtWeekday, fmtMonth, fmtNumber, fmtRange,
  };
})();
