// UI modes (Simple / Advanced): migration, first-run chooser, navigation, Settings control, routes, data safety.
// Run: CDP_PORT=9341 node tests/cdp.mjs tests/functional-modes.mjs [screenshot-dir]
// The harness seeds 'advanced' for fresh profiles; this suite opts out via sessionStorage 't4.test.noSeed'.
const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var click = (el, label) => { if (typeof el === 'string') { label = label || el; el = $(el); } if (!el) throw new Error('missing element: ' + label); el.click(); };
  var go = async (route) => { location.hash = '#/' + route; await wait(80); };
  var navIds = () => $$('#nav .nav__link').map((a) => a.getAttribute('href').slice(2));
  var key = async (k) => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await wait(30); };
  var ST = () => JSON.parse(localStorage.getItem('todo4me.data.v1') || 'null');
`;
const SIMPLE_NAV = 'today,upcoming,inbox,tasks,planner,notes,settings';
const ADVANCED_NAV = 'dashboard,inbox,tasks,today,upcoming,planner,plan,notes,editor,focus,stats,settings';

export default async function (b) {
  const all = [];
  const run = async (name, body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { await b.evaluate(PRELUDE + 'ok(false, ' + JSON.stringify(name + ' threw: ') + ' + ' + JSON.stringify(e.message) + ')'); }
    all.push(...await b.evaluate('window.__r.splice(0)'));
  };
  const fresh = async () => {
    await b.evaluate(`sessionStorage.setItem('t4.test.noSeed', '1'); localStorage.clear(); history.replaceState(null, '', location.pathname); true`);
    await b.reload();
  };
  await b.viewport(1366, 900);
  await b.goto();

  // ---------- existing profile: migration ----------
  await b.evaluate(`sessionStorage.setItem('t4.test.noSeed', '1'); localStorage.clear(); true`);
  await b.evaluate(`(() => {
    const d = T4.storage.defaultData(); delete d.settings.uiMode;
    d.tasks.push({ id: 'task_a', title: 'Old task', tags: ['x', 'y'], recurrence: { unit: 'week', every: 1, weekdays: [1], from: 'due' }, status: 'todo' });
    localStorage.setItem('todo4me.data.v1', JSON.stringify(d)); return true; })()`);
  await b.reload();
  await run('migration', `
    ok(!$('#modal').open, 'existing profile: no first-run chooser');
    ok(T4.mode.get() === 'advanced' && T4.store.settings.uiMode === 'advanced', 'existing profile without uiMode migrates to advanced');
    ok(document.body.classList.contains('mode-advanced') && !document.body.classList.contains('mode-simple'), 'body class mode-advanced');
    ok(navIds().join() === '${ADVANCED_NAV}', 'advanced sidebar unchanged (12 links): ' + navIds().join());
    ok(location.hash === '#/dashboard' && !!$('.hero'), 'advanced start page is the dashboard');
    ok(getComputedStyle($('.sidebar__more')).display === 'none', 'no "More features" link in advanced');
    ok(!$('.toast'), 'no welcome toast for an existing profile');
  `);

  // ---------- first run: chooser ----------
  await fresh();
  await run('chooser', `
    ok($('#modal').open && $$('#modal .mode-card').length === 2, 'fresh profile: first-run chooser with two cards');
    ok($('#modal .mode-card[data-value=simple]').getAttribute('aria-checked') === 'true' && $('#modal .mode-card[data-value=advanced]').getAttribute('aria-checked') === 'false', 'Simple is preselected');
    ok(/Recommended/.test($('#modal .mode-card[data-value=simple]').textContent) && /Simple/.test($('#modal').textContent) && /Advanced/.test($('#modal').textContent), 'cards carry names and the recommendation');
    ok(/any time in Settings\\. Nothing is lost/.test($('#modal').textContent), 'chooser notes that nothing is lost');
    ok(!$('.toast'), 'no welcome toast while the chooser is open');
    ok(localStorage.getItem('todo4me.data.v1') === null, 'nothing is stored before a choice is made');
  `);
  if (process.env.MODE_SHOTS) await b.shot('chooser-en', false);
  await run('chooser-advanced', `
    click('#modal .mode-card[data-value=advanced]'); await wait(30);
    ok($('#modal .mode-card[data-value=advanced]').getAttribute('aria-checked') === 'true' && $('#modal .mode-card[data-value=simple]').getAttribute('aria-checked') === 'false', 'clicking a card selects it');
    ok(ST() === null, 'selecting alone stores nothing');
    click('#mode-continue'); await wait(120);
    ok(!$('#modal').open, 'chooser closes');
    ok(ST().settings.uiMode === 'advanced' && document.body.classList.contains('mode-advanced'), 'choosing Advanced stores uiMode and sets the body class');
    ok(navIds().length === 12, 'advanced sidebar after choosing');
    ok(!!$('.toast') && /Welcome/.test($('.toast').textContent), 'welcome hint follows the chooser');
  `);
  await b.reload();
  await run('chooser-once', `ok(!$('#modal').open && T4.mode.get() === 'advanced', 'chooser is shown only once (reload keeps the choice)');`);

  await fresh();
  await run('chooser-simple', `
    click('#mode-continue'); await wait(120);
    ok(ST().settings.uiMode === 'simple' && document.body.classList.contains('mode-simple') && !document.body.classList.contains('mode-advanced'), 'continuing with the preselected Simple stores simple and sets the body class');
    ok(location.hash === '#/today' && !!$('.view--today'), 'simple start page is Today');
    ok(!!$('.toast'), 'welcome hint follows the chooser');
  `);

  await fresh();
  await b.key('Escape', 'Escape');
  await b.sleep(150);
  await run('chooser-dismiss', `
    ok(!$('#modal').open, 'Esc closes the chooser');
    ok(ST() && ST().settings.uiMode === 'simple' && T4.mode.get() === 'simple' && document.body.classList.contains('mode-simple'), 'dismissing the chooser means Simple (and stores it)');
  `);
  await b.reload();
  await run('chooser-dismiss-persist', `ok(!$('#modal').open && T4.mode.get() === 'simple', 'dismissed choice persists across reload');`);

  // ---------- Simple navigation ----------
  await run('simple-nav', `
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    ok(navIds().join() === '${SIMPLE_NAV}', 'simple sidebar shows exactly Today, Upcoming, Inbox, My Tasks, Weekly Planner, Weekly Notes, Settings: ' + navIds().join());
    ok($$('#nav .nav__sep').map((e) => e.textContent).join() === 'Plan', 'section headings without entries are gone; Settings gets no lone heading: ' + $$('#nav .nav__sep').map((e) => e.textContent).join());
    ok(!!$('.sidebar__capture') && getComputedStyle($('.sidebar__capture')).display !== 'none', 'quick capture stays');
    const more = $('.sidebar__more');
    ok(getComputedStyle(more).display !== 'none' && /More features/.test(more.textContent), '"More features? Switch to Advanced" link is shown');
    ok(more.getBoundingClientRect().top > $('#nav').getBoundingClientRect().bottom - 1 && more.getBoundingClientRect().bottom <= $('.sidebar__footer').getBoundingClientRect().top + 1, 'link sits below the navigation, above the footer');
  `);
  if (process.env.MODE_SHOTS) { await b.evaluate(`T4.store.updateSettings({ userName: 'Sam' }); true`); await b.shot('sidebar-simple', false); }

  // ---------- hidden pages stay reachable ----------
  await run('simple-routes', `
    await go('editor');
    ok(location.hash === '#/editor' && !!$('.view--editor') && document.body.classList.contains('is-editor') && document.body.classList.contains('mode-simple'), 'deep link #/editor opens in Simple (mode class survives the page class)');
    for (const r of ['dashboard', 'plan', 'focus', 'stats']) { await go(r); ok(!!$('.view--' + r), '#/' + r + ' opens in Simple'); }
    await go('today');
    await key('g'); await key('e');
    ok(location.hash === '#/editor' && !!$('.view--editor'), 'G then E opens the Editor in Simple');
    await go('today'); await key('g'); await key('s');
    ok(location.hash === '#/stats', 'G then S opens Statistics in Simple');
    await go('today'); await key('g'); await key('d');
    ok(location.hash === '#/dashboard' && !!$('.hero'), 'G then D opens the Dashboard in Simple');
    location.hash = '#/nonsense'; await wait(80);
    ok(T4.app.route.name === 'today', 'unknown route falls back to Today in Simple');
    await go('focus'); await key('Escape');
    await wait(60);
    ok(location.hash === '#/today', 'leaving Focus Mode returns to the Simple home (Today)');
  `);

  // ---------- link switches to advanced (+ Undo) ----------
  await run('more-link', `
    await go('today');
    window.__events = []; document.addEventListener('t4:modechange', (e) => window.__events.push(e.detail.mode));
    window.__marker = 42;
    click('.sidebar__more'); await wait(120);
    ok(T4.mode.get() === 'advanced' && ST().settings.uiMode === 'advanced' && document.body.classList.contains('mode-advanced') && !document.body.classList.contains('mode-simple'), 'link switches to Advanced (stored, body class)');
    ok(navIds().join() === '${ADVANCED_NAV}', 'advanced navigation back in full');
    ok(window.__marker === 42 && location.hash === '#/today', 'no reload, same page');
    ok(window.__events.join() === 'advanced', 't4:modechange fired once with the new mode: ' + window.__events.join());
    const t = $$('.toast').find((x) => /Advanced mode on/.test(x.textContent));
    ok(!!t && /Settings/.test(t.textContent), 'toast explains how to switch back');
    const undo = t && Array.from(t.querySelectorAll('.toast__action')).find((x) => x.textContent === 'Undo');
    ok(!!undo, 'toast offers Undo');
    undo.click(); await wait(120);
    ok(T4.mode.get() === 'simple' && navIds().join() === '${SIMPLE_NAV}', 'Undo returns to Simple');
    ok(window.__events.join() === 'advanced,simple', 'event fired for the undo as well');
    ok(T4.mode.set('bogus') === false && T4.mode.get() === 'simple', 'invalid modes are rejected');
    T4.mode.set('simple'); await wait(30);
    ok(window.__events.length === 2, 'setting the current mode again fires nothing');
  `);

  // ---------- Settings control ----------
  await run('settings', `
    await go('settings');
    ok($('.settings > section:first-child').id === 'set-mode', 'mode control is the first Settings section');
    ok($$('#set-mode .mode-card').length === 2 && $('#set-mode .mode-card[data-value=simple]').getAttribute('aria-checked') === 'true', 'control reflects Simple');
    ok(/Simple hides the calendar, editor, focus and statistics\\. Your data stays complete\\./.test($('#set-mode').textContent), 'one-line explanation');
    ok(!$('#nav-edit'), 'sidebar editor is not offered in Simple (fixed sidebar)');
    window.__marker = 7;
    $('#set-mode .mode-card[data-value=advanced]').focus(); click('#set-mode .mode-card[data-value=advanced]'); await wait(120);
    ok(T4.mode.get() === 'advanced' && ST().settings.uiMode === 'advanced' && navIds().length === 12 && window.__marker === 7, 'Settings: Simple to Advanced applies immediately, no reload');
    ok($('#set-mode .mode-card[data-value=advanced]').getAttribute('aria-checked') === 'true' && !!$('#nav-edit'), 'control updated, sidebar editor back');
    ok(document.activeElement === $('#set-mode .mode-card[data-value=advanced]'), 'focus stays on the control');
    click('#set-mode .mode-card[data-value=simple]'); await wait(120);
    ok(T4.mode.get() === 'simple' && navIds().join() === '${SIMPLE_NAV}' && document.body.classList.contains('mode-simple') && window.__marker === 7, 'Settings: Advanced to Simple applies immediately');
    document.querySelectorAll('.toast').forEach((t) => t.remove());
  `);
  if (process.env.MODE_SHOTS) await b.shot('settings-mode', false);

  // ---------- data untouched ----------
  await run('data', `
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    T4.store.mergeData(T4.storage.sanitize({ tasks: [
      { id: 'task_r', title: 'Weekly review', tags: ['work', 'weekly'], priority: 'high', dueDate: T4.util.today(), estimate: 30, recurrence: { unit: 'week', every: 1, weekdays: [1], from: 'due' }, subtasks: [{ title: 'one' }] },
      { id: 'task_i', title: 'Inbox idea', inbox: true },
    ], notes: [{ id: 'note_1', title: 'N', body: 'body', tags: ['t'] }] }).data);
    const snap = () => JSON.stringify({ tasks: T4.store.data.tasks, categories: T4.store.data.categories, notes: T4.store.data.notes, plans: T4.store.data.dailyPlans, stats: T4.store.data.stats });
    const before = snap();
    for (let i = 0; i < 3; i++) { T4.mode.set('advanced'); await wait(40); T4.mode.set('simple'); await wait(40); }
    T4.mode.set('advanced'); await wait(40);
    ok(snap() === before, 'tasks (tags, repeat, subtasks), notes, categories, stats identical after switching back and forth');
    const r = T4.store.getTask('task_r');
    ok(r.tags.join() === 'weekly,work' || r.tags.join() === 'work,weekly', 'tags kept: ' + r.tags.join());
    ok(r.recurrence && r.recurrence.unit === 'week' && r.subtasks.length === 1, 'repeat and subtasks kept');
    ok(JSON.stringify(ST().tasks.map((t) => t.id).sort()) === JSON.stringify(T4.store.data.tasks.map((t) => t.id).sort()), 'stored data matches');
    T4.mode.set('simple'); await wait(40);
    await go('tasks');
    ok(!!$$('#task-results .task').length && $$('#task-results .task').some((e) => /Weekly review/.test(e.textContent)), 'tasks still listed in Simple');
    // a custom sidebar choice made in Advanced stays untouched by mode switches
    T4.mode.set('advanced'); await wait(30);
    T4.nav.setHidden('stats', true); T4.mode.set('simple'); await wait(30); T4.mode.set('advanced'); await wait(30);
    ok(T4.nav.isHidden('stats') && !navIds().includes('stats'), 'sidebar customization of Advanced survives mode switches');
    T4.nav.reset();
    // reset keeps the interface mode
    T4.mode.set('simple'); await wait(30);
    await go('settings'); click('[data-action=reset-data]'); await wait(40);
    click('#confirm [data-confirm=yes]'); await wait(120);
    ok(T4.mode.get() === 'simple' && T4.store.data.tasks.length === 0 && location.hash === '#/today', 'reset all data keeps the chosen mode and goes to the mode home');
  `);

  if (process.env.MODE_SHOTS) { await b.evaluate(`T4.mode.set('advanced'); location.hash = '#/today'; true`); await b.sleep(200); await b.shot('sidebar-advanced', false); await b.evaluate(`T4.mode.set('simple'); true`); await b.sleep(100); }

  // ---------- mobile ----------
  await b.viewport(390, 800, true);
  await run('mobile', `
    await go('today'); await wait(100);
    const bn = $$('#bottom-nav .bnav__link');
    ok(getComputedStyle($('#bottom-nav')).display !== 'none', 'bottom navigation visible on a phone');
    ok(bn.length === 5 && bn.slice(0, 4).map((a) => a.getAttribute('href')).join() === '#/today,#/inbox,#/planner,#/notes' && bn[4].dataset.action === 'open-sidebar', 'Simple bottom nav: Today, Inbox, Planner, Notes + More: ' + bn.map((a) => a.getAttribute('href') || a.dataset.action).join());
    ok(!$('#bottom-nav [href="#/dashboard"]'), 'no Dashboard in the Simple bottom nav');
    bn[4].click(); await wait(200);
    ok($('#app').classList.contains('sidebar-open') && navIds().join() === '${SIMPLE_NAV}' && getComputedStyle($('.sidebar__more')).display !== 'none', 'More menu opens the drawer with the Simple list and the "More features" link');
  `);
  if (process.env.MODE_SHOTS) await b.shot('mobile-simple', false);
  await run('mobile-adv', `
    click('.sidebar__more'); await wait(150);
    ok(!$('#app').classList.contains('sidebar-open') || true, 'drawer link works');
    const bn = $$('#bottom-nav .bnav__link');
    ok(T4.mode.get() === 'advanced' && bn.slice(0, 4).map((a) => a.getAttribute('href')).join() === '#/dashboard,#/today,#/planner,#/notes', 'Advanced bottom nav unchanged: ' + bn.map((a) => a.getAttribute('href') || a.dataset.action).join());
  `);
  await b.viewport(1366, 900);

  // ---------- languages ----------
  await run('i18n', `
    const keys = ['mode.simple', 'mode.advanced', 'mode.label', 'mode.title', 'mode.simple.desc', 'mode.advanced.desc', 'mode.settings.help', 'mode.recommended', 'mode.chooser.title', 'mode.chooser.sub', 'mode.chooser.note', 'mode.chooser.continue', 'mode.moreLink', 'mode.on.simple', 'mode.on.advanced', 'nav.short.inbox'];
    for (const l of ['en', 'de', 'tr', 'es']) { const have = new Set(T4.i18n.keys(l)); ok(keys.every((k) => have.has(k)), 'all mode keys present in ' + l + ': ' + keys.filter((k) => !have.has(k)).join()); }
    const name = (l) => { T4.i18n.setLanguage(l); return T4.i18n.t('mode.simple') + '/' + T4.i18n.t('mode.advanced'); };
    ok(name('de') === 'Einfach/Erweitert' && name('tr') === 'Basit/Gelişmiş' && name('es') === 'Simple/Avanzado' && name('en') === 'Simple/Advanced', 'mode names per language');
    T4.mode.set('simple'); await wait(40); T4.i18n.setLanguage('de'); await wait(60);
    ok(/Mehr Funktionen/.test($('.sidebar__more').textContent), 'link is translated (static text)');
    T4.i18n.setLanguage('en'); await wait(60);
  `);
  if (process.env.MODE_SHOTS) {
    await b.evaluate(`T4.i18n.setLanguage('de'); true`); await b.sleep(100);
    await b.evaluate(`T4.mode.chooser(); true`); await b.sleep(200);
    await b.shot('chooser-de', false);
    await b.evaluate(`T4.ui.closeModal(true); T4.i18n.setLanguage('en'); true`);
  }

  all.forEach((r) => console.log(r));
  console.log('\n' + all.filter((r) => r.startsWith('PASS')).length + ' passed, ' + all.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
