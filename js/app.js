/* Todo4Me — application shell: routing, navigation, event delegation, shortcuts. */
T4.app = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;

  // Sections are fixed; custom order applies within a section. Dashboard and Settings are locked (always visible).
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: '', locked: true },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', count: 'inbox', section: '' },
    { id: 'tasks', label: 'My Tasks', icon: 'list', count: 'tasks', section: '' },
    { id: 'today', label: 'Today', icon: 'sun', count: 'today', section: '' },
    { id: 'upcoming', label: 'Upcoming', icon: 'upcoming', count: 'upcoming', section: '' },
    { id: 'planner', label: 'Weekly Planner', icon: 'week', section: 'Plan' },
    { id: 'plan', label: 'Daily Plan', icon: 'book', section: 'Plan' },
    { id: 'notes', label: 'Weekly Notes', icon: 'note', count: 'notes', section: 'Plan' },
    { id: 'editor', label: 'Editor', icon: 'doc', section: 'Write' },
    { id: 'focus', label: 'Focus Mode', icon: 'target', section: 'Do' },
    { id: 'stats', label: 'Statistics', icon: 'chart', section: 'Do' },
    { id: 'settings', label: 'Settings', icon: 'settings', section: 'Do', locked: true },
  ];
  const SECTIONS = ['', 'Plan', 'Write', 'Do'];
  const navLabel = (n) => (T4.i18n && T4.i18n.has && T4.i18n.has('nav.' + n.id)) ? T4.i18n.t('nav.' + n.id) : n.label;
  const navSection = (s) => (s && T4.i18n && T4.i18n.has && T4.i18n.has('nav.section.' + s.toLowerCase())) ? T4.i18n.t('nav.section.' + s.toLowerCase()) : s;

  /** Sidebar customization API (settings.nav = { hidden, order }). Unknown ids in settings are ignored. */
  const nav = (function () {
    const cfg = () => store.data.settings.nav || { hidden: [], order: [] };
    const known = (id) => NAV.some((n) => n.id === id);
    const decorate = (n) => ({ id: n.id, label: navLabel(n), icon: n.icon, section: n.section, locked: !!n.locked, hidden: !n.locked && cfg().hidden.indexOf(n.id) >= 0 });
    /** All views in effective order (sections fixed, custom order within each section), hidden ones included. */
    function items() {
      const order = cfg().order.filter(known);
      const rank = (n) => { const i = order.indexOf(n.id); return i < 0 ? 1e6 + NAV.indexOf(n) : i; };
      const out = [];
      SECTIONS.forEach((sec) => out.push(...NAV.filter((n) => n.section === sec).sort((a, b) => rank(a) - rank(b))));
      return out.map(decorate);
    }
    const visible = () => items().filter((n) => !n.hidden);
    function setHidden(id, hide) {
      const n = NAV.find((x) => x.id === id);
      if (!n || n.locked) return false;
      const set = new Set(cfg().hidden.filter(known));
      if (hide) set.add(id); else set.delete(id);
      store.updateSettings({ nav: { hidden: Array.from(set), order: cfg().order } });
      return true;
    }
    /** Move one step (delta -1 up / +1 down) within its section; hidden items keep their slot. */
    function move(id, delta) {
      const all = items();
      const it = all.find((x) => x.id === id);
      if (!it) return false;
      const sec = all.filter((x) => x.section === it.section);
      const i = sec.indexOf(sec.find((x) => x.id === id)), j = Math.max(0, Math.min(sec.length - 1, i + (delta < 0 ? -1 : 1) * Math.max(1, Math.abs(delta | 0))));
      if (i === j) return false;
      const [m] = sec.splice(i, 1);
      sec.splice(j, 0, m);
      const ids = [];
      SECTIONS.forEach((s) => ids.push(...(s === it.section ? sec : all.filter((x) => x.section === s)).map((x) => x.id)));
      setOrder(ids);
      return true;
    }
    function setOrder(ids) {
      const clean = Array.from(new Set((ids || []).filter(known)));
      store.updateSettings({ nav: { hidden: cfg().hidden, order: clean } });
    }
    function reset() { store.updateSettings({ nav: { hidden: [], order: [] } }); }
    return { items, visible, setHidden, move, setOrder, reset, isHidden: (id) => !!(items().find((x) => x.id === id) || {}).hidden };
  })();
  const BOTTOM = ['dashboard', 'today', 'planner', 'notes'];

  const main = document.getElementById('main');
  let current = { name: null, params: {} };
  let lastDay = U.today();

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const params = {};
    if (query) query.split('&').forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    const name = T4.views[path] ? path : 'dashboard';
    return { name, params };
  }

  function pageTitle() {
    const v = T4.views[current.name];
    return (v ? v.title + ' · ' : '') + 'Todo4Me';
  }

  /* ---------- Navigation ---------- */
  function renderNav() {
    const c = store.counts();
    const counts = { inbox: c.inbox, tasks: c.tasks, today: c.today, upcoming: c.upcoming, notes: c.notes };
    const overdue = store.overdueTasks().length;
    let lastSec = null;
    document.getElementById('nav').innerHTML = '<ul role="list">' + nav.visible().map((n) => {
      let sep = '';
      if (n.section !== lastSec) {
        lastSec = n.section;
        if (n.section) sep = '<li class="nav__sep" aria-hidden="true">' + esc(navSection(n.section)) + '</li>';
      }
      const def = NAV.find((x) => x.id === n.id);
      const active = current.name === n.id;
      const count = def.count ? counts[def.count] : 0;
      const danger = n.id === 'today' && overdue;
      return sep + '<li><a class="nav__link' + (active ? ' is-active' : '') + '" href="#/' + n.id + '"' + (active ? ' aria-current="page"' : '') + '>' +
        icon(n.icon) + '<span>' + esc(n.label) + '</span>' +
        (count ? '<span class="nav__count' + (danger ? ' nav__count--danger' : '') + '"' + (danger ? ' title="' + U.plural(overdue, 'overdue task') + '"' : '') + '>' + count + '<span class="sr-only"> items</span></span>' : '') +
        '</a></li>';
    }).join('') + '</ul>';
    const shown = nav.visible().map((n) => n.id);
    document.getElementById('bottom-nav').innerHTML = BOTTOM.filter((id) => shown.indexOf(id) >= 0).map((id) => {
      const n = NAV.find((x) => x.id === id);
      const active = current.name === id;
      const count = n.count ? counts[n.count] : 0;
      return '<a class="bnav__link' + (active ? ' is-active' : '') + '" href="#/' + id + '"' + (active ? ' aria-current="page"' : '') + '>' +
        icon(n.icon) + '<span>' + esc(navLabel(n).replace('Weekly ', '')) + '</span>' + (count ? '<span class="bnav__dot" aria-hidden="true"></span>' : '') + '</a>';
    }).join('') +
      '<button type="button" class="bnav__link" data-action="open-sidebar" aria-label="More sections">' + icon('menu') + '<span>More</span></button>';
    document.getElementById('topbar-title').textContent = (T4.views[current.name] || {}).title || 'Todo4Me';
  }

  function updateSaveIndicator(info) {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    if (info && info.saved === false) { el.textContent = 'Not saved!'; el.classList.add('is-error'); return; }
    el.classList.remove('is-error');
    const at = T4.storage.lastSavedAt;
    el.textContent = at ? 'Saved ' + new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at) : 'All changes saved locally';
  }

  /* ---------- Rendering ---------- */
  function render() {
    const view = T4.views[current.name];
    // Preserve focus and half-typed quick-add text across re-renders.
    const active = document.activeElement;
    let focusKey = null;
    if (active && main.contains(active)) {
      if (active.id) focusKey = '#' + CSS.escape(active.id);
      else if (active.dataset.action) focusKey = '[data-action="' + active.dataset.action + '"]' + (active.dataset.id ? '[data-id="' + CSS.escape(active.dataset.id) + '"]' : '');
      else if (active.form && active.form.id) focusKey = '#' + CSS.escape(active.form.id) + ' [name="' + active.name + '"]';
    }
    const drafts = {};
    U.$$('form[id] input[name="title"]', main).forEach((i) => { if (i.value) drafts[i.form.id] = i.value; });

    main.innerHTML = '<div class="view view--' + current.name + '">' + view.render(current.params) + '</div>';
    document.body.className = view.bodyClass || '';

    Object.keys(drafts).forEach((id) => {
      const f = document.getElementById(id);
      const i = f && f.querySelector('input[name="title"]');
      if (i && !i.value) i.value = drafts[id];
    });
    if (focusKey) {
      const again = main.querySelector(focusKey);
      if (again) again.focus({ preventScroll: true });
    }
    if (view.mount) view.mount(main);
    renderNav();
    if (!(T4.focus && T4.focus.running)) document.title = pageTitle();
  }

  function navigate() {
    const prev = T4.views[current.name];
    if (prev && prev.leave) prev.leave();
    current = parseRoute();
    ui.closeModal(true);
    closeSidebar();
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  /* ---------- Sidebar (mobile drawer) ---------- */
  function openSidebar() {
    document.getElementById('app').classList.add('sidebar-open');
    const first = document.querySelector('#sidebar .nav__link');
    if (first) first.focus();
  }
  function closeSidebar() { document.getElementById('app').classList.remove('sidebar-open'); }
  ui.on('open-sidebar', openSidebar);
  ui.on('close-sidebar', closeSidebar);

  /* ---------- Event delegation ---------- */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      if (el.tagName !== 'A') e.preventDefault();
      ui.run(el.dataset.action, el, e);
    });
    document.addEventListener('submit', (e) => {
      const form = e.target.closest('form[data-form]');
      if (!form) return;
      e.preventDefault();
      ui.run('submit:' + form.dataset.form, form, e);
    });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('[data-input]');
      if (el) ui.run('input:' + el.dataset.input, el, e);
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (el) ui.run('change:' + el.dataset.change, el, e);
    });

    let gPending = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('app').classList.contains('sidebar-open')) { closeSidebar(); return; }
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (ui.modalOpen || document.getElementById('confirm').open) return;
      if (typing) {
        if (e.key === 'Escape' && e.target.matches('input[type="search"]')) e.target.blur();
        return;
      }
      const k = e.key.toLowerCase();
      if (gPending && Date.now() - gPending < 1200) {
        gPending = 0;
        const map = { d: 'dashboard', i: 'inbox', t: 'today', u: 'upcoming', m: 'tasks', w: 'planner', p: 'plan', o: 'notes', e: 'editor', f: 'focus', s: 'stats' };
        if (map[k]) { e.preventDefault(); location.hash = '#/' + map[k]; }
        return;
      }
      if (k === 'g') { gPending = Date.now(); return; }
      if (k === 'n') { e.preventDefault(); ui.run('new-task', null); }
      else if (k === 'q') { e.preventDefault(); ui.run('quick-capture', null); }
      else if (k === '/') {
        const s = main.querySelector('input[type="search"]');
        if (s) { e.preventDefault(); s.focus(); }
      } else if (e.key === 'Escape' && current.name === 'focus') { location.hash = '#/dashboard'; }
    });

    window.addEventListener('hashchange', navigate);

    // Day rollover & overdue refresh when the app stays open.
    setInterval(() => {
      const t = U.today();
      const typing = document.activeElement && document.activeElement.closest('input, textarea');
      if (t !== lastDay && !typing && !ui.modalOpen) { lastDay = t; render(); }
    }, 60 * 1000);
  }

  /* ---------- Boot ---------- */
  function init() {
    const res = store.init();
    T4.settings.applyAppearance();
    store.subscribe((info) => {
      updateSaveIndicator(info);
      if (info.type === 'settings' || info.type === 'replace' || info.external) T4.settings.applyAppearance();
      if (info.silent) { renderNav(); return; }
      render();
      ui.refreshModal();
    });
    bindEvents();
    current = parseRoute();
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    render();
    updateSaveIndicator();
    res.warnings.forEach((w) => ui.toast(w, 'error', 10000));
    if (res.firstRun) {
      ui.toast('Welcome to Todo4Me! Press N for a new task, Q to capture an idea, or add sample data in Settings.', 'info', 9000, {
        label: 'Settings', fn: () => { location.hash = '#/settings'; },
      });
    }
  }

  return { init, render, pageTitle, nav, get route() { return current; } };
})();
T4.nav = T4.app.nav;

document.addEventListener('DOMContentLoaded', () => {
  try {
    T4.app.init();
  } catch (err) {
    console.error(err);
    document.getElementById('main').innerHTML = '<div class="empty"><p class="empty__title">Something went wrong while starting Todo4Me.</p>' +
      '<p class="empty__text">Your data has not been deleted. Try reloading the page. Details: ' + T4.util.esc(err.message) + '</p></div>';
  }
});
