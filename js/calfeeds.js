/* Todo4Me — subscribed calendars (Outlook / Google, read-only, via ICS).
 *
 * Storage (deliberately NOT in the main data document todo4me.data.v1, so it is never part of
 * exports, imports, merges or the daily backup files):
 *  - todo4me.calendars.v1        { version: 1, feeds: [{ id, name, color, kind: 'url'|'file', url, enabled, addedAt }] }
 *                                The subscription addresses are secrets (whoever has one can read the calendar):
 *                                they stay on this device, are shown masked and are never logged.
 *  - todo4me.calendars.cache.v1  { <feedId>: { at, checkedAt, error, cal: { name, events, zones } } }
 *                                The last successfully downloaded (or imported) calendar, parsed by js/ics.js.
 *                                Single events that ended more than 180 days ago are dropped; the cache is
 *                                size-limited so it can never crowd out the tasks in LocalStorage.
 *
 * Downloading needs the desktop app (main process, see electron/calendar.js): the page's CSP blocks
 * network access, and browsers would block cross-site calendar downloads anyway (CORS). In the browser
 * version only .ics files can be imported. Refresh: at start, every 30 minutes, and with a button. */
T4.calfeeds = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, ICS = T4.ics;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);
  const desktop = window.todo4meDesktop;
  const bridge = desktop && desktop.isDesktop && typeof desktop.fetchCalendar === 'function' ? desktop : null;

  const FEEDS_KEY = 'todo4me.calendars.v1';
  const CACHE_KEY = 'todo4me.calendars.cache.v1';
  const MAX_FEEDS = 20;
  const MAX_FILE = 5 * 1024 * 1024;
  const REFRESH_MS = 30 * 60 * 1000;
  const KEEP_PAST_MS = 180 * 86400000;
  const CACHE_MAX_CHARS = 1500000; // LocalStorage is shared with the tasks: stay well below its quota
  const COLORS = ['#0e7c86', '#d6409f', '#e5603c', '#3e9b4f', '#8e4ec6', '#2f6fed', '#c98a12', '#5f6b7a'];

  let feeds = [];
  let cals = {};    // id → { name, events, zones }
  let status = {};  // id → { state: 'idle'|'loading'|'ok'|'error', at, checkedAt, error, count, uncached }
  let version = 0;
  const inflight = {};
  const draft = { name: '', url: '', color: null };

  /* ---------- Validation ---------- */
  const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
  /** https:// or webcal:// → https URL string, or null. Same rules as the main process. */
  function normalizeUrl(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 2048) return null;
    if (/^webcals?:\/\//i.test(s)) s = 'https://' + s.replace(/^webcals?:\/\//i, '');
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
    u.hash = '';
    return u.href;
  }
  /** Shown instead of the secret address: only the server name. */
  function maskUrl(url) {
    try { return new URL(url).host + '/' + '•'.repeat(8); } catch (e) { return '•'.repeat(8); }
  }
  function sanitizeFeed(f) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !/^cal_[\w-]{1,60}$/.test(f.id)) return null;
    const kind = f.kind === 'file' ? 'file' : 'url';
    const url = kind === 'url' ? normalizeUrl(f.url) : null;
    if (kind === 'url' && !url) return null;
    return {
      id: f.id,
      name: String(f.name == null ? '' : f.name).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || tt('cf.defaultName'),
      color: hex(f.color, COLORS[0]),
      kind, url,
      enabled: f.enabled !== false,
      addedAt: typeof f.addedAt === 'string' && !isNaN(Date.parse(f.addedAt)) ? f.addedAt : new Date().toISOString(),
    };
  }
  function sanitizeCal(c) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.events)) return null;
    const events = c.events.filter((e) => e && typeof e === 'object' && Number.isFinite(e.start) && typeof e.title === 'string').slice(0, ICS.MAX.events);
    return { name: typeof c.name === 'string' ? c.name.slice(0, 60) : '', events, zones: c.zones && typeof c.zones === 'object' ? c.zones : {} };
  }

  /* ---------- Storage ---------- */
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function load() {
    const f = read(FEEDS_KEY);
    const seen = new Set();
    feeds = (f && Array.isArray(f.feeds) ? f.feeds : []).map(sanitizeFeed).filter((x) => x && !seen.has(x.id) && seen.add(x.id)).slice(0, MAX_FEEDS);
    const c = read(CACHE_KEY) || {};
    cals = {}; status = {};
    feeds.forEach((fd) => {
      const e = c[fd.id];
      const cal = e && sanitizeCal(e.cal);
      if (cal) cals[fd.id] = cal;
      status[fd.id] = {
        state: e && e.error ? 'error' : cal ? 'ok' : 'idle',
        at: e && typeof e.at === 'string' ? e.at : null,
        checkedAt: e && typeof e.checkedAt === 'string' ? e.checkedAt : null,
        error: e && typeof e.error === 'string' ? e.error.slice(0, 300) : null,
        count: cal ? cal.events.length : 0,
      };
    });
    version++;
  }
  function saveFeeds() {
    try { localStorage.setItem(FEEDS_KEY, JSON.stringify({ version: 1, feeds })); return true; } catch (e) {
      ui.toast(tt('cf.saveFailed'), 'error', 6000);
      return false;
    }
  }
  function saveCache() {
    const entries = {};
    feeds.forEach((f) => {
      const s = status[f.id] || {};
      entries[f.id] = { at: s.at || null, checkedAt: s.checkedAt || null, error: s.error || null, cal: cals[f.id] || null };
      if (s) s.uncached = false;
    });
    let json = JSON.stringify(entries);
    if (json.length > CACHE_MAX_CHARS) { // 1. without descriptions
      Object.keys(entries).forEach((id) => {
        const cal = entries[id].cal;
        if (cal) entries[id].cal = Object.assign({}, cal, { events: cal.events.map((e) => Object.assign({}, e, { description: '' })) });
      });
      json = JSON.stringify(entries);
    }
    if (json.length > CACHE_MAX_CHARS) { // 2. drop the largest calendars from the offline copy
      Object.keys(entries).sort((a, b) => JSON.stringify(entries[b].cal || '').length - JSON.stringify(entries[a].cal || '').length).forEach((id) => {
        if (json.length <= CACHE_MAX_CHARS) return;
        entries[id].cal = null;
        if (status[id]) status[id].uncached = true;
        json = JSON.stringify(entries);
      });
    }
    try { localStorage.setItem(CACHE_KEY, json); } catch (e) {
      try { localStorage.removeItem(CACHE_KEY); } catch (x) { /* ignore */ }
      Object.keys(status).forEach((id) => { status[id].uncached = true; });
    }
  }
  function clearAll() {
    [FEEDS_KEY, CACHE_KEY].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    feeds = []; cals = {}; status = {}; version++;
  }

  /* ---------- Repaint ---------- */
  let repaintTimer = null;
  function changed() {
    version++;
    clearTimeout(repaintTimer);
    const route = T4.app && T4.app.route ? T4.app.route.name : '';
    if (route === 'settings') { paintList(); return; }
    if (route !== 'planner' && route !== 'dashboard') return;
    const a = document.activeElement;
    const busy = (T4.calendar && T4.calendar.dragging) || ui.modalOpen || (a && a.closest && a.closest('#main') && a.matches('input, textarea, select'));
    if (busy) { repaintTimer = setTimeout(changed, 2000); return; } // never disturb typing or a drag
    T4.app.render();
  }
  function paintList() {
    const el = document.getElementById('cal-feeds');
    if (el) el.innerHTML = listHtml();
  }

  /* ---------- Refresh ---------- */
  function refresh(id, manual) {
    const f = feeds.find((x) => x.id === id);
    if (!f || f.kind !== 'url') return Promise.resolve(null);
    if (!bridge) return Promise.resolve(null);
    if (inflight[id]) return inflight[id];
    status[id] = Object.assign({}, status[id], { state: 'loading' });
    paintList();
    const p = bridge.fetchCalendar(f.url).then((res) => {
      const s = status[id] || {};
      s.checkedAt = new Date().toISOString();
      if (!res || !res.ok) {
        s.state = 'error';
        s.error = String((res && res.error) || tt('cf.downloadFailed')).slice(0, 300);
      } else {
        try {
          const cal = ICS.parse(res.text);
          ICS.prune(cal, Date.now() - KEEP_PAST_MS);
          cals[id] = { name: cal.name, events: cal.events, zones: cal.zones };
          s.state = 'ok'; s.error = null; s.at = s.checkedAt; s.count = cal.events.length;
        } catch (e) {
          s.state = 'error';
          s.error = e && e.message ? String(e.message).slice(0, 300) : tt('cf.readFailed');
        }
      }
      status[id] = s;
      if (!feeds.some((x) => x.id === id)) return s; // removed meanwhile
      saveCache();
      if (manual) ui.toast(s.state === 'ok' ? tt('cf.updated', { name: f.name, count: s.count }) : f.name + ': ' + s.error, s.state === 'ok' ? 'success' : 'error', s.state === 'ok' ? 3000 : 7000);
      changed();
      return s;
    }).catch(() => {
      status[id] = Object.assign({}, status[id], { state: 'error', error: tt('cf.downloadFailed') });
      changed();
      return status[id];
    }).finally(() => { delete inflight[id]; });
    inflight[id] = p;
    return p;
  }
  function refreshAll(manual) {
    const list = feeds.filter((f) => f.kind === 'url' && f.enabled);
    if (manual && !bridge) { ui.toast(tt('cf.desktopOnly'), 'info', 6000); return Promise.resolve([]); }
    if (manual && !list.length) { ui.toast(tt('cf.noneToUpdate'), 'info'); return Promise.resolve([]); }
    return Promise.all(list.map((f) => refresh(f.id, false))).then((res) => {
      if (manual) {
        const bad = res.filter((s) => s && s.state === 'error').length;
        ui.toast(bad ? tt('cf.someFailed', { count: bad }) : tt('cf.allUpdated'), bad ? 'error' : 'success', bad ? 6000 : 2500);
      }
      return res;
    });
  }

  /* ---------- Events ---------- */
  let memo = { key: null, list: [] };
  /** Occurrences of all visible calendars for the local dates [from, to). Never throws. */
  function occurrences(from, to) {
    const key = version + '|' + from + '|' + to;
    if (memo.key === key) return memo.list;
    const out = [];
    feeds.forEach((f) => {
      if (!f.enabled || !cals[f.id]) return;
      try {
        ICS.expand(cals[f.id], from, to).forEach((o) => {
          out.push(Object.assign(o, { feedId: f.id, color: f.color, calName: f.name, key: f.id + '|' + o.uid + '|' + o.start }));
        });
      } catch (e) {
        status[f.id] = Object.assign({}, status[f.id], { state: 'error', error: tt('cf.someEventsFailed') });
      }
    });
    memo = { key, list: out };
    return out;
  }
  /** Calendars with a problem: [{ name, error, at }] */
  function problems() {
    return feeds.filter((f) => f.enabled && status[f.id] && status[f.id].state === 'error').map((f) => ({ id: f.id, name: f.name, error: status[f.id].error, at: status[f.id].at }));
  }
  const visibleFeeds = () => feeds.filter((f) => f.enabled);

  /* ---------- Settings card ---------- */
  function statusText(f) {
    const s = status[f.id] || {};
    const when = (iso) => (iso ? U.fmtDateTime(iso) : '');
    const events = (n) => tt('cf.events', { count: n });
    if (f.kind === 'file') return esc(tt('cf.statusFile', { events: events(s.count || 0) }) + (s.at ? ' · ' + when(s.at) : ''));
    if (s.state === 'loading') return esc(tt('cf.updating'));
    if (s.state === 'error') return '<span class="text-danger">' + icon('alert') + esc(s.error || tt('cf.error')) + '</span>' + (cals[f.id] && s.at ? ' · ' + esc(tt('cf.statusErrVersion', { date: when(s.at) })) : '');
    if (s.state === 'ok') return esc(tt('cf.statusOk', { events: events(s.count || 0), date: when(s.at) }) + (s.uncached ? ' · ' + tt('cf.tooLarge') : ''));
    return esc(tt(bridge ? 'cf.notDownloaded' : 'cf.desktopOnlyStatus'));
  }
  function listHtml() {
    if (!feeds.length) return '<p class="muted small">' + esc(tt('cf.none')) + '</p>';
    return '<ul class="cal-feeds" role="list">' + feeds.map((f) =>
      '<li class="cal-feed" data-id="' + f.id + '">' +
        '<input type="color" value="' + esc(f.color) + '" data-change="cal-feed" data-field="color" data-id="' + f.id + '" aria-label="' + esc(tt('cf.colorFor', { name: f.name })) + '">' +
        '<div class="cal-feed__main">' +
          '<input type="text" maxlength="60" value="' + esc(f.name) + '" data-change="cal-feed" data-field="name" data-id="' + f.id + '" aria-label="' + esc(tt('cf.calName')) + '">' +
          '<span class="cal-feed__src">' + (f.kind === 'url' ? icon('calendar') + '<span class="cal-feed__url">' + esc(maskUrl(f.url)) + '</span> · ' : '') +
            '<span class="cal-feed__status" id="cal-status-' + f.id + '">' + statusText(f) + '</span></span>' +
        '</div>' +
        '<label class="checkbox small"><input type="checkbox" data-change="cal-feed" data-field="enabled" data-id="' + f.id + '"' + (f.enabled ? ' checked' : '') + '>' + esc(tt('cf.show')) + '</label>' +
        (f.kind === 'url' && bridge ? '<button type="button" class="icon-btn icon-btn--sm" data-action="cal-refresh" data-id="' + f.id + '" title="' + esc(tt('cf.updateNow')) + '" aria-label="' + esc(tt('cf.updateNowLabel', { name: f.name })) + '">' + icon('reset') + '</button>' : '') +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="cal-remove" data-id="' + f.id + '" title="' + esc(tt('cf.remove')) + '" aria-label="' + esc(tt('cf.removeLabel', { name: f.name })) + '">' + icon('trash') + '</button>' +
      '</li>').join('') + '</ul>';
  }
  const nextColor = () => COLORS.find((c) => !feeds.some((f) => f.color === c)) || COLORS[feeds.length % COLORS.length];

  function settingsCard() {
    const color = draft.color || nextColor();
    return '<section class="card settings__section" id="cal-settings"><h2 class="card__title">' + esc(tt('cf.title')) + '</h2>' +
      '<p class="muted small">' + tt('cf.intro') + '</p>' + // dictionary HTML, no values
      '<div id="cal-feeds">' + listHtml() + '</div>' +
      (bridge
        ? '<form class="cal-add" data-form="cal-add" id="cal-add-form" autocomplete="off">' +
            '<input type="color" name="color" value="' + esc(color) + '" data-input="cal-draft" aria-label="' + esc(tt('cf.newColor')) + '">' +
            '<input type="text" name="name" maxlength="60" value="' + esc(draft.name) + '" data-input="cal-draft" placeholder="' + esc(tt('cf.namePh')) + '" aria-label="' + esc(tt('cf.newName')) + '">' +
            '<input type="url" name="url" maxlength="2048" value="' + esc(draft.url) + '" data-input="cal-draft" placeholder="' + esc(tt('cf.urlPh')) + '" aria-label="' + esc(tt('cf.urlLabel')) + '" spellcheck="false" autocomplete="off">' +
            '<button type="submit" class="btn btn--sm btn--primary">' + icon('plus') + esc(tt('cf.subscribe')) + '</button>' +
          '</form>'
        : '<p class="callout">' + icon('alert') + '<span>' + tt('cf.browserNote') + '</span></p>') +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn--sm" data-action="cal-import-pick">' + icon('upload') + esc(tt('cf.importFile')) + '</button>' +
        (bridge && feeds.some((f) => f.kind === 'url') ? '<button type="button" class="btn btn--sm btn--ghost" data-action="cal-refresh-all">' + icon('reset') + esc(tt('cf.updateAll')) + '</button>' : '') +
        '<input type="file" id="cal-file" accept=".ics,text/calendar" hidden data-change="cal-import">' +
      '</div>' +
      '<p class="muted small">' + tt('cf.helpLink') + (bridge ? ' ' + esc(tt('cf.helpRefresh')) : '') + '</p>' +
      '</section>';
  }

  /* ---------- Actions ---------- */
  ui.on('input:cal-draft', (el) => { draft[el.name] = el.value; });
  ui.on('submit:cal-add', (form) => {
    const url = normalizeUrl(form.querySelector('[name="url"]').value);
    if (!url) { ui.toast(tt('cf.badLink'), 'error', 6000); return; }
    if (feeds.length >= MAX_FEEDS) { ui.toast(tt('cf.tooMany', { n: MAX_FEEDS }), 'error'); return; }
    if (feeds.some((f) => f.url === url)) { ui.toast(tt('cf.already'), 'info'); return; }
    let name = form.querySelector('[name="name"]').value.trim().slice(0, 60);
    if (!name) { try { name = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch (e) { name = ''; } name = name ? name.charAt(0).toUpperCase() + name.slice(1) : tt('cf.defaultName'); }
    const f = sanitizeFeed({ id: U.uid('cal'), name, color: form.querySelector('[name="color"]').value, kind: 'url', url, enabled: true });
    feeds.push(f);
    status[f.id] = { state: 'idle', count: 0 };
    if (!saveFeeds()) { feeds.pop(); return; }
    draft.name = ''; draft.url = ''; draft.color = null;
    if (T4.app.route.name === 'settings') T4.app.render();
    ui.toast(tt('cf.subscribed', { name: f.name }), 'info', 3000);
    refresh(f.id, true);
  });
  ui.on('cal-refresh', (el) => refresh(el.dataset.id, true));
  ui.on('cal-refresh-all', () => refreshAll(true));
  ui.on('change:cal-feed', (el) => {
    const f = feeds.find((x) => x.id === el.dataset.id);
    if (!f) return;
    if (el.dataset.field === 'name') f.name = el.value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || f.name;
    else if (el.dataset.field === 'color') f.color = hex(el.value, f.color);
    else if (el.dataset.field === 'enabled') f.enabled = !!el.checked;
    saveFeeds();
    changed();
    if (el.dataset.field === 'enabled' && f.enabled && f.kind === 'url' && !cals[f.id]) refresh(f.id);
  });
  ui.on('cal-remove', async (el) => {
    const f = feeds.find((x) => x.id === el.dataset.id);
    if (!f) return;
    const ok = await ui.confirm({ title: tt('cf.removeTitle', { name: f.name }), message: tt('cf.removeMsg'), confirmText: tt('cf.remove'), danger: true });
    if (!ok) return;
    feeds = feeds.filter((x) => x.id !== f.id);
    delete cals[f.id]; delete status[f.id];
    saveFeeds(); saveCache();
    changed();
    if (T4.app.route.name === 'settings') T4.app.render();
    ui.toast(tt('cf.removed'));
  });
  ui.on('cal-import-pick', () => { const i = document.getElementById('cal-file'); if (i) { i.value = ''; i.click(); } });
  ui.on('change:cal-import', (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    if (file.size > MAX_FILE) { ui.toast(tt('cf.fileTooLarge'), 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => ui.toast(tt('cf.fileReadFailed'), 'error');
    reader.onload = () => importText(String(reader.result), file.name);
    reader.readAsText(file);
  });
  /** Import ICS text as a new (static) calendar. Returns the feed or null. */
  function importText(text, fileName) {
    let cal;
    try { cal = ICS.parse(text); } catch (e) { ui.toast(e.message || tt('cf.fileBad'), 'error', 6000); return null; }
    if (feeds.length >= MAX_FEEDS) { ui.toast(tt('cf.addMax', { n: MAX_FEEDS }), 'error'); return null; }
    ICS.prune(cal, Date.now() - KEEP_PAST_MS);
    const base = String(fileName || '').replace(/\.ics$/i, '').trim();
    const f = sanitizeFeed({ id: U.uid('cal'), name: cal.name || base || tt('cf.importedName'), color: nextColor(), kind: 'file', enabled: true });
    feeds.push(f);
    cals[f.id] = { name: cal.name, events: cal.events, zones: cal.zones };
    status[f.id] = { state: 'ok', at: new Date().toISOString(), checkedAt: new Date().toISOString(), error: null, count: cal.events.length };
    if (!saveFeeds()) { feeds.pop(); delete cals[f.id]; return null; }
    saveCache();
    changed();
    if (T4.app.route.name === 'settings') T4.app.render();
    ui.toast(tt(status[f.id].uncached ? 'cf.importedLarge' : 'cf.imported', { name: f.name, events: tt('cf.events', { count: cal.events.length }) }), 'success', 4000);
    return f;
  }

  /* ---------- Dashboard ---------- */
  function fmtRange(o) {
    if (o.allDay) return tt('cl.allDay');
    const t = (ms) => U.fmtTime(U.pad(new Date(ms).getHours()) + ':' + U.pad(new Date(ms).getMinutes()));
    return o.end > o.start ? t(o.start) + ' – ' + t(o.end) : t(o.start);
  }
  function todayCard() {
    if (!visibleFeeds().length) return '';
    const today = U.today();
    const list = occurrences(today, U.addDays(today, 1)).slice().sort((a, b) => (b.allDay - a.allDay) || (a.allDay ? 0 : a.start - b.start));
    return '<section class="card" aria-labelledby="dash-cal-h">' +
      '<div class="card__head"><h2 class="card__title" id="dash-cal-h">' + icon('calendar') + esc(tt('cf.todayTitle')) + ' <span class="count">' + list.length + '</span></h2>' +
        '<a class="btn btn--sm btn--ghost" href="#/planner?view=calendar">' + esc(tt('cf.openCal')) + ' ' + icon('arrow-right') + '</a></div>' +
      (list.length ? '<ul class="mini-list" role="list">' + list.slice(0, 8).map((o) =>
        '<li><button type="button" class="mini-item cal-mini" data-action="cal-event" data-key="' + esc(o.key) + '" style="--ev:' + esc(o.color) + '">' +
          '<span class="cal-mini__dot" aria-hidden="true"></span><span class="mini-item__title">' + esc(o.title) + '</span>' +
          '<span class="muted small nowrap">' + esc(fmtRange(o)) + '</span></button></li>').join('') + '</ul>' +
          (list.length > 8 ? '<p class="muted small">' + esc(tt('cl.more', { n: list.length - 8 })) + '</p>' : '')
        : '<p class="muted small">' + esc(tt('cf.noEventsToday')) + '</p>') +
      '</section>';
  }

  /* ---------- Start ---------- */
  load();
  window.addEventListener('storage', (e) => { if (e.key === FEEDS_KEY || e.key === CACHE_KEY) { load(); changed(); } });
  if (bridge) {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => refreshAll(false), 3000);
      setInterval(() => refreshAll(false), REFRESH_MS);
      window.addEventListener('online', () => refreshAll(false));
    });
  }

  return {
    FEEDS_KEY, CACHE_KEY, occurrences, problems, refresh, refreshAll, importText, settingsCard, todayCard, fmtRange,
    normalizeUrl, maskUrl, clearAll, load,
    get feeds() { return feeds.map((f) => Object.assign({}, f)); },
    get status() { return JSON.parse(JSON.stringify(status)); },
    get canSubscribe() { return !!bridge; },
    get version() { return version; },
  };
})();
