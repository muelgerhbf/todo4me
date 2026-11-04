import fs from 'node:fs';
import path from 'node:path';

const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var click = (el) => { if (typeof el === 'string') el = $(el); if (!el) throw new Error('missing element'); el.click(); };
  var S = () => T4.store.data;
`;

export default async function (b) {
  const out = [];
  const ok = (c, m) => { const r = (c ? 'PASS ' : 'FAIL ') + m; out.push(r); console.log(r); };
  const run = async (body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { ok(false, 'threw: ' + e.message); }
    const r = await b.evaluate('window.__r'); out.push(...r); r.forEach((x) => console.log(x)); await b.evaluate('window.__r = []');
  };
  const udata = b.env.TODO4ME_USER_DATA;

  // --- Security & environment
  await run(`
    ok(typeof require === 'undefined' && typeof process === 'undefined' && typeof module === 'undefined', 'no Node.js APIs in the page (nodeIntegration off, contextIsolation on)');
    ok(window.todo4meDesktop && window.todo4meDesktop.isDesktop, 'preload bridge available');
    ok(Object.keys(window.todo4meDesktop).sort().join() === 'checkForUpdates,exportPDF,getDesktopSettings,getInfo,getUpdateState,installUpdate,isDesktop,notify,onBeforeClose,onMenuAction,onNotificationClick,onUpdateState,openFolder,openPath,platform,setDesktopSettings,writeBackup,writeDocBackup', 'bridge exposes only the intended API: ' + Object.keys(window.todo4meDesktop).sort().join());
    ok(document.documentElement.classList.contains('is-desktop'), 'desktop class set');
    const w = window.open('file:///C:/Windows/win.ini');
    ok(w === null, 'window.open is denied');
    const info = await todo4meDesktop.getInfo();
    ok(info.userData.replace(/\\\\/g, '/').toLowerCase() === ${JSON.stringify(udata.replace(/\\/g, '/').toLowerCase())}, 'userData points to isolated test folder: ' + info.userData);
    for (let i = 0; i < 50 && !$$('.toast').some(t => /browser before/.test(t.textContent)); i++) await wait(100);
    ok(!!$('.toast') && $$('.toast').some(t => /browser before/.test(t.textContent)), 'migration hint shown when no data');
  `);
  const pages = await (await fetch('http://127.0.0.1:' + b.PORT + '/json/list')).json();
  ok(pages.filter((p) => p.type === 'page').length === 1, 'no extra window was opened');

  // Navigation away from the app is blocked
  await b.evaluate(`location.href = 'file:///C:/Windows/win.ini'; true`).catch(() => {});
  await b.sleep(500);
  ok((await b.evaluate('location.pathname')).endsWith('/index.html'), 'navigation to other files is blocked');

  // --- Menu actions (sent from the main process like a real menu click)
  const sendMenu = (a) => b.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.send('menu:action', ${JSON.stringify(a)}); true`);
  await sendMenu('go:planner'); await b.sleep(150);
  ok((await b.evaluate('location.hash')) === '#/planner', 'menu Go → Weekly Planner navigates');
  await sendMenu('new-task'); await b.sleep(150);
  ok(await b.evaluate(`document.getElementById('modal').open && !!document.getElementById('tf-title')`), 'menu File → New task opens editor');
  await b.evaluate(`T4.ui.closeModal()`);
  await sendMenu('quick-capture'); await b.sleep(150);
  ok(await b.evaluate(`!!document.getElementById('qc-title')`), 'menu Quick capture opens dialog');
  await b.evaluate(`T4.ui.closeModal()`);
  await sendMenu('new-note'); await b.sleep(150);
  ok(await b.evaluate(`!!document.getElementById('nf-title')`), 'menu New weekly note opens note editor');
  await b.evaluate(`T4.ui.closeModal()`);
  await sendMenu('go:../../evil'); await b.sleep(100);
  ok((await b.evaluate('location.hash')) === '#/planner', 'unknown menu routes are ignored');
  const menuLabels = await b.mainEval(`process.mainModule.require('electron').Menu.getApplicationMenu().items.map(i => i.label).join('|')`);
  ok(/File/.test(menuLabels) && /Go/.test(menuLabels) && /Help/.test(menuLabels), 'application menu present: ' + menuLabels);
  const subLabels = await b.mainEval(`process.mainModule.require('electron').Menu.getApplicationMenu().items.map(i => i.submenu ? i.submenu.items.map(s => s.label).join(',') : '').join('|')`);
  ok(/New document/.test(subLabels) && /Export document as PDF/.test(subLabels) && /Editor/.test(subLabels) && /Check for updates/.test(subLabels) && /New task/.test(subLabels) && /Weekly Notes/.test(subLabels), 'menu: New document, Export PDF, Go → Editor, Check for updates (old entries kept)');
  await sendMenu('go:editor'); await b.sleep(400);
  ok((await b.evaluate('location.hash')) === '#/editor', 'menu Go → Editor navigates');

  // --- Settings desktop card
  await run(`
    location.hash = '#/settings'; await wait(300);
    const card = $$('.settings__section').pop();
    ok(card && /Desktop app/.test(card.textContent) && /backups/i.test(card.textContent), 'settings shows Desktop app card with backup folder');
    ok(card.textContent.includes(${JSON.stringify(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)}), 'version shown');
    ok($$('.settings__section').length === 8, 'all original settings sections still present (+ Documents + Desktop app)');
    ok(/Updates/.test(card.textContent) && /installed app|portable/i.test(card.textContent), 'update section explains why the dev build cannot self-update');
    const st = await todo4meDesktop.getUpdateState();
    ok(st.status === 'unsupported' && st.current, 'update state reported by main process: ' + st.status);
  `);

  /* ---------- Running in the background: tray, close to tray, hotkey, start with Windows, notifications ---------- */
  const E = `process.mainModule.require('electron')`;
  const BG = `Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.endsWith('background.js') && m.filename.includes('todo4me')).exports`;
  const winState = () => b.mainEval(`(() => { const all = ${E}.BrowserWindow.getAllWindows(); const w = all[0]; return { n: all.length, visible: !!w && w.isVisible(), destroyed: !w || w.isDestroyed() }; })()`);
  const shownList = () => b.mainEval(`${BG}.shown`);
  const waitShown = async (pred, ms = 6000) => { for (let i = 0; i < ms / 200; i++) { const s = (await shownList()).find(pred); if (s) return s; await b.sleep(200); } return null; };
  // Like clicking the window's X button (a page-side window.close() would bypass the 'close' event).
  const hideWindow = async () => { await b.mainEval(`setTimeout(() => ${E}.BrowserWindow.getAllWindows()[0].close(), 20); true`); await b.sleep(700); };

  const ds = await b.evaluate('todo4meDesktop.getDesktopSettings()');
  ok(ds.closeToTray === true && ds.openAtLogin === false && ds.hotkeyEnabled === true && ds.hotkey === 'Control+Alt+Space' && ds.tray === true, 'desktop defaults: close to tray on, start with Windows off, hotkey Ctrl+Alt+Space on');
  ok(ds.loginSupported === false && /test/i.test(ds.loginReason || ''), 'start with Windows is never written to the registry in test runs: ' + ds.loginReason);
  const regSpace = await b.mainEval(`${E}.globalShortcut.isRegistered('Control+Alt+Space')`);
  ok(regSpace === ds.hotkeyRegistered && (regSpace || !!ds.hotkeyError), 'global hotkey Ctrl+Alt+Space registered: ' + regSpace + (ds.hotkeyError ? ' (' + ds.hotkeyError + ')' : ''));
  const trayInfo = await b.mainEval(`(() => { const bg = ${BG}; return { exists: !!bg.tray && !bg.tray.isDestroyed(), menu: bg._test.trayMenuLabels().join('|') }; })()`);
  ok(trayInfo.exists && trayInfo.menu === 'Open Todo4Me|Quick capture|New task|---|Quit Todo4Me', 'tray icon with menu: ' + trayInfo.menu);

  // Settings UI → main process
  await run(`
    location.hash = '#/settings'; await wait(300);
    ok($('#set-tray') && $('#set-tray').checked && $('#set-login') && $('#set-login').disabled && $('#set-hk-on').checked && $('#set-hk').value === 'Control+Alt+Space', 'Settings → Desktop app: tray, start with Windows and hotkey options');
    ok(/Ctrl\\+Alt\\+Space|already used/.test($('#hk-status').textContent), 'hotkey status shown: ' + $('#hk-status').textContent);
    const sel = $('#set-hk'); sel.value = 'Control+Alt+T'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
  `);
  let hk = await b.mainEval(`({ t: ${E}.globalShortcut.isRegistered('Control+Alt+T'), space: ${E}.globalShortcut.isRegistered('Control+Alt+Space'), err: ${BG}.state().hotkeyError })`);
  ok((hk.t || !!hk.err) && !hk.space, 'choosing another preset re-registers the hotkey (old one released)' + (hk.err ? ': ' + hk.err : ''));
  await run(`click('#set-hk-on'); await wait(400); ok(!$('#set-hk-on').checked && $('#set-hk').disabled && /off/.test($('#hk-status').textContent), 'hotkey can be switched off');`);
  hk = await b.mainEval(`${E}.globalShortcut.isRegistered('Control+Alt+T') || ${E}.globalShortcut.isRegistered('Control+Alt+Space')`);
  ok(hk === false, 'switched off → no global shortcut registered');
  await run(`click('#set-hk-on'); await wait(400); ok($('#set-hk-on').checked, 'hotkey switched on again');`);
  const bad = await b.evaluate(`todo4meDesktop.setDesktopSettings({ hotkey: 'Alt+F4', closeToTray: 'no', openAtLogin: true, evil: 1 })`);
  const bad2 = await b.mainEval(`${BG}.setSettings({ hotkey: 'Control+A', closeToTray: 1, hotkeyEnabled: 'yes' })`);
  ok(bad.hotkey === 'Control+Alt+T' && bad.closeToTray === true && bad.openAtLogin === false && bad2.hotkey === 'Control+Alt+T' && bad2.closeToTray === true && bad2.hotkeyEnabled === true, 'invalid desktop settings are rejected by the main process');

  // Closing the window hides it to the tray; the app keeps running
  await hideWindow();
  let w = await winState();
  ok(!b.exited && w.n === 1 && !w.visible && !w.destroyed, 'closing the window hides it to the tray (app keeps running)');
  const hint = await waitShown((x) => x.id === 'tray-hint');
  ok(hint && (await b.mainEval(`${BG}.settings.trayHintShown`)) === true, 'one-time hint "keeps running in the tray": ' + (hint ? (hint.ok ? 'Windows notification shown' + (hint.unconfirmed ? ' (unconfirmed)' : '') : 'notification failed (' + hint.error + '), balloon used') : 'missing'));
  // Global hotkey while hidden → window + Quick capture
  await b.mainEval(`${BG}._test.triggerHotkey(); true`); await b.sleep(500);
  w = await winState();
  ok(w.visible && await b.evaluate(`!!document.getElementById('qc-title')`), 'global hotkey brings the window back and opens Quick capture');
  await run(`
    $('#qc-title').value = 'Captured from anywhere'; $('#qc-form').requestSubmit(); await wait(60);
    ok(S().tasks.some(t => t.title === 'Captured from anywhere' && t.inbox), 'hotkey quick capture adds the task to the Inbox');
    T4.ui.closeModal();
  `);
  // Tray menu
  await b.mainEval(`${BG}._test.clickTrayItem('New task'); true`); await b.sleep(300);
  ok(await b.evaluate(`!!document.getElementById('tf-title')`), 'tray → New task opens the task editor');
  await b.evaluate(`document.getElementById('tf-title').value = 'half typed'; true`);
  await b.mainEval(`${BG}._test.clickTrayItem('Quick capture'); true`); await b.sleep(300);
  ok(await b.evaluate(`document.getElementById('tf-title') && document.getElementById('tf-title').value === 'half typed' && [...document.querySelectorAll('.toast')].some(t => /open dialog/.test(t.textContent))`), 'tray/hotkey never replace a dialog the user is typing in');
  await b.evaluate(`T4.ui.closeModal(); true`);
  await hideWindow();
  await b.mainEval(`${BG}._test.clickTrayItem('Open Todo4Me'); true`); await b.sleep(300);
  w = await winState();
  ok(w.visible && (await shownList()).filter((x) => x.id === 'tray-hint').length === 1, 'tray → Open Todo4Me shows the window; the tray hint appeared only once');
  // Start with Windows (registry call stubbed — never touch the real login items)
  const login = await b.mainEval(`(() => { const bg = ${BG}; const calls = []; bg._test.setLogin((o) => calls.push(o)); const s1 = bg.setSettings({ openAtLogin: true }).openAtLogin; const s2 = bg.setSettings({ openAtLogin: false }).openAtLogin; return { calls, s1, s2, exe: process.execPath }; })()`);
  ok(login.calls.length === 2 && login.calls[0].openAtLogin === true && login.calls[0].args.join() === '--hidden' && login.calls[0].path === login.exe && login.calls[1].openAtLogin === false && login.s1 && !login.s2, 'start with Windows: login item with --hidden is added and removed (stubbed)');
  ok(await b.mainEval(`${BG}.startHidden(['x', '--hidden']) === true && ${BG}.startHidden(['x']) === false`), 'started at login (--hidden) the window stays in the tray');

  // A due reminder → Windows notification from the main process; click opens the task, the button snoozes
  await run(`
    const n = new Date(), hhmm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    window.__remId = T4.store.addTask({ title: 'Desktop reminder test', dueDate: T4.util.today(), dueTime: hhmm, reminder: 0, priority: 'low' }).id;
  `);
  const remId = await b.evaluate('window.__remId');
  const rem = await waitShown((x) => x.id === 'task:' + remId);
  ok(rem && rem.title === 'Desktop reminder test' && rem.snooze, 'due reminder → native notification with Snooze button: ' + (rem ? (rem.ok ? 'shown' + (rem.unconfirmed ? ' (unconfirmed)' : '') : 'failed: ' + rem.error) : 'none'));
  ok(await b.evaluate(`T4.store.getTask(window.__remId).reminderFired !== null && [...document.querySelectorAll('.toast--reminder')].some(t => /Desktop reminder test/.test(t.textContent))`), 'reminder marked as fired + in-app toast');
  await hideWindow();
  await b.mainEval(`${BG}._test.emitOnLastNotification('click')`); await b.sleep(500);
  w = await winState();
  ok(w.visible && await b.evaluate(`!!document.getElementById('tf-title') && document.getElementById('tf-title').value === 'Desktop reminder test'`), 'clicking the notification brings the window back and opens the task');
  await b.evaluate(`T4.ui.closeModal(); true`);
  await b.mainEval(`${BG}._test.emitOnLastNotification('action')`); await b.sleep(300);
  ok(await b.evaluate(`(() => { const s = T4.store.getTask(window.__remId).reminderSnooze; return !!s && Math.abs(Date.parse(s) - Date.now() - 600000) < 5000; })()`), 'Snooze button on the notification snoozes for 10 minutes');
  await b.evaluate(`T4.store.deleteTask(window.__remId); document.querySelectorAll('.toast').forEach(t => t.remove()); true`);

  // --- Migration: import a browser export via file input + Merge keeps existing data
  await run(`
    T4.store.addTask({ title: 'Desktop-only task', priority: 'high', dueDate: T4.util.today() });
    const browserExport = { app: 'todo4me', version: 1, tasks: [{ id: 'task_browser1', title: 'Task from browser', status: 'todo', priority: 'critical', dueDate: T4.util.today() }],
      notes: [{ id: 'note_b1', title: 'Browser note', body: 'hi', weekOf: T4.util.today() }], categories: S().categories, dailyPlans: {}, settings: { theme: 'dark' } };
    const dtf = new DataTransfer(); dtf.items.add(new File([JSON.stringify(browserExport)], 'todo4me-backup.json', { type: 'application/json' }));
    location.hash = '#/settings'; await wait(100);
    const input = $('#import-file'); input.files = dtf.files; input.dispatchEvent(new Event('change')); await wait(200);
    ok($('#modal').open && $('#imp-merge'), 'import dialog opens for browser export');
    click('#imp-merge'); await wait(100);
    ok(S().tasks.some(t => t.title === 'Desktop-only task') && S().tasks.some(t => t.title === 'Task from browser') && S().notes.some(n => n.title === 'Browser note'), 'merge keeps existing data and adds browser data');
    ok(S().settings.theme !== 'dark', 'merge does not overwrite local settings');
  `);

  // --- Focus timer running + data, then a real restart
  await run(`
    T4.focus.select(S().tasks.find(t => t.title === 'Task from browser').id);
    location.hash = '#/focus'; await wait(200);
    click('[data-action=pomo-toggle]'); await wait(300);
    ok(T4.focus.running, 'focus timer running before restart');
    T4.store.updatePlan(T4.util.today(), { goal: 'Survive restart' });
    // Two reminders become due while the app is closed (scheduler stopped so they don't fire now)
    T4.reminders.stop();
    const y = T4.util.addDays(T4.util.today(), -1);
    T4.store.addTask({ title: 'Missed A', dueDate: y, dueTime: '09:00', reminder: 0 });
    T4.store.addTask({ title: 'Missed B', dueDate: y, dueTime: '10:00', reminder: 15 });
  `);
  const before = await b.evaluate('JSON.stringify({ t: T4.store.data.tasks.length, n: T4.store.data.notes.length })');
  const quitByTray = await b.restartGracefully('tray'); // tray → Quit Todo4Me
  ok(quitByTray && !b.exited, 'tray → Quit Todo4Me really quits the app (then it is started again)');
  const missed = await waitShown((x) => x.id === 'summary');
  ok(missed && missed.title === '2 reminders missed' && /Missed A/.test(missed.body) && /Missed B/.test(missed.body) && (await shownList()).filter((x) => /^task:/.test(x.id)).length === 0, 'reminders missed while closed → one summary notification on start: ' + (missed ? missed.title + ' / ' + missed.body : 'none'));
  const hk2 = await b.evaluate('todo4meDesktop.getDesktopSettings()');
  ok(hk2.hotkey === 'Control+Alt+T' && hk2.closeToTray && (hk2.hotkeyRegistered || !!hk2.hotkeyError), 'desktop settings persist across a restart (desktop-settings.json)');
  const hk3 = await b.evaluate(`todo4meDesktop.setDesktopSettings({ hotkey: 'Control+Alt+Space' })`);
  ok(hk3.hotkey === 'Control+Alt+Space' && !(await b.mainEval(`${E}.globalShortcut.isRegistered('Control+Alt+T')`)), 'hotkey back to Ctrl+Alt+Space');
  await run(`
    const now = JSON.stringify({ t: T4.store.data.tasks.length, n: T4.store.data.notes.length });
    ok(now === ${JSON.stringify(before)}, 'tasks & notes persist after app restart ' + now);
    ok(T4.store.getPlan(T4.util.today()).goal === 'Survive restart', 'daily plan persists after restart');
    ok(!!localStorage.getItem('todo4me.data.v1') && !!localStorage.getItem('todo4me.backup.v1') && !!localStorage.getItem('todo4me.focus.v1'), 'all localStorage keys present after restart');
    location.hash = '#/focus'; await wait(300);
    ok(T4.focus.running && $('.focus-card__title').textContent === 'Task from browser', 'focus task & running timer survive restart');
    ok(!$$('.toast').some(t => /browser before/.test(t.textContent)), 'no migration hint once data exists');
  `);

  // --- Backup file written to disk
  const bdir = path.join(udata, 'backups');
  const files = fs.existsSync(bdir) ? fs.readdirSync(bdir) : [];
  ok(files.length === 1 && /^todo4me-\d{4}-\d{2}-\d{2}\.json$/.test(files[0]), 'daily backup file written: ' + files.join(','));
  if (files[0]) {
    const j = JSON.parse(fs.readFileSync(path.join(bdir, files[0]), 'utf8'));
    ok(j.app === 'todo4me' && Array.isArray(j.tasks) && j.tasks.length > 0, 'backup file is a valid, importable export (' + j.tasks.length + ' tasks)');
  }
  const res = await b.evaluate(`todo4meDesktop.writeBackup('not json')`);
  ok(res.ok === false, 'main process rejects invalid backup payloads');

  /* ---------- Editor in the desktop app ---------- */
  const sendMenuMeta = (a, meta) => b.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.send('menu:action', ${JSON.stringify(a)}, ${JSON.stringify(meta)}); true`);
  await run(`
    location.hash = '#/editor'; await wait(500);
    await T4.editor.newDocument('tour'); for (let i = 0; i < 40 && !T4.editor.current; i++) await wait(50); await wait(800);
    ok(T4.editor.current && $('#ed-doc .katex') && $('#ed-doc .cw-hl .token') && $('#ed-doc .chart-svg'), 'editor works in the desktop app (formulas, code, charts)');
    // Keyboard shortcut conflicts: Ctrl+I in the editor must not trigger "Import data"
    const calls = []; const orig = T4.ui.run; T4.ui.run = function (a) { calls.push(a); return orig.apply(this, arguments); };
    window.__calls = calls; window.__orig = orig;
    const p = $('#ed-doc p'); const r = document.createRange(); r.selectNodeContents(p); $('#ed-doc').focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
  `);
  await sendMenuMeta('import-data', { accel: true }); await b.sleep(150);
  await run(`ok(!window.__calls.includes('import-data'), 'Ctrl+I shortcut is ignored by the menu while typing in a document');`);
  await sendMenuMeta('import-data', { accel: false }); await b.sleep(150);
  await run(`ok(window.__calls.includes('import-data'), 'File → Import via mouse still works in the editor'); T4.ui.run = window.__orig;`);
  // PDF export through the real IPC + Chromium print engine
  await run(`
    T4.editor.current.meta.page.header = '{title}'; T4.editor.current.meta.page.footer = 'Todo4Me test';
    T4.editor.exportPDF();
    for (let i = 0; i < 100 && !$$('.toast').some((t) => /PDF saved|PDF export failed/.test(t.textContent)); i++) await wait(100);
    ok($$('.toast').some((t) => /PDF saved/.test(t.textContent)), 'PDF export reports success');
    ok(!document.body.classList.contains('print-doc') && !$('#ed-print-css'), 'print mode is removed after export (document unchanged)');
  `);
  const winBg = await b.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].getBackgroundColor()`);
  ok(/^#f6f6f8$/i.test(winBg), 'window background is white only while printing, restored afterwards (' + winBg + ')');
  const pdfDir = b.env.TODO4ME_PDF_DIR;
  const pdfs = pdfDir && fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf')) : [];
  ok(pdfs.length === 1 && pdfs[0] === 'Feature tour.pdf', 'PDF file written: ' + pdfs.join(','));
  if (pdfs[0] && process.env.PDFTEXT) {
    const { execFileSync } = await import('node:child_process');
    const info = JSON.parse(execFileSync(process.execPath, [process.env.PDFTEXT, path.join(pdfDir, pdfs[0])], { encoding: 'utf8' }));
    const flat = info.text.join(' ').replace(/\s+/g, '');
    ok(info.pages >= 2 && info.text.every((t, i) => t.includes('Page ' + (i + 1) + ' of ' + info.pages)), 'desktop PDF: ' + info.pages + ' pages with page numbers');
    ok(info.text.every((t) => t.includes('Feature tour') && t.includes('Todo4Me test')), 'desktop PDF: header + footer on every page');
    ok(flat.includes('WelcometotheTodo4Meeditor') && flat.includes('functiongreet') && /∑|∫/.test(info.text.join(' ')), 'desktop PDF: text, code and formulas');
    ok(info.outline.length > 0, 'desktop PDF has a bookmark outline from the headings: ' + info.outline.join(' / '));
  }
  // Type, then close the window immediately: the close handshake must save the last keystrokes.
  await run(`const d = $('#ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await b.type('LAST WORDS BEFORE CLOSE');
  const docId = await b.evaluate('T4.editor.current.id');
  const quitByMenu = await b.restartGracefully(); // app.quit() = File → Exit
  ok(quitByMenu, 'File → Exit quits the app although "keep running in the tray" is on');
  await run(`
    await wait(800);
    const d = await T4.docstore.get(${JSON.stringify(docId)});
    ok(d && d.html.includes('LAST WORDS BEFORE CLOSE'), 'text typed right before closing the window is saved (close handshake)');
    ok((await T4.docstore.list()).length === 1, 'documents persist across an app restart');
    location.hash = '#/editor?doc=${docId}'; await wait(900);
    ok($('#ed-doc .t4-w[data-w="draw"] .dw-shape') && $('#ed-doc').textContent.includes('LAST WORDS'), 'document reopens with all elements after restart');
  `);
  console.log('waiting for the daily documents backup (20 s after start)…');
  await b.sleep(21000);
  const dfiles = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter((f) => /^documents-\d{4}-\d{2}-\d{2}\.json$/.test(f)) : [];
  ok(dfiles.length === 1, 'daily documents backup file written: ' + dfiles.join(','));
  if (dfiles[0]) {
    const j = JSON.parse(fs.readFileSync(path.join(bdir, dfiles[0]), 'utf8'));
    ok(j.kind === 'documents' && j.documents.length === 1 && j.documents[0].html.includes('LAST WORDS'), 'documents backup is a complete, importable export');
  }
  ok(fs.readdirSync(bdir).some((f) => /^todo4me-\d{4}/.test(f)), 'original tasks/notes backup file still written');

  // --- Windows shutdown/logoff while hidden in the tray: a real quit, and unsaved editor text is saved first
  await run(`
    location.hash = '#/editor?doc=${docId}'; await wait(900);
    const d = $('#ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
  `);
  await b.type('SHUTDOWN WORDS');
  await b.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].close(); true`); // X button: hide to tray right after typing …
  const quitBySession = await b.restartGracefully('session-end'); // … then Windows logs off
  ok(quitBySession, 'Windows shutdown/logoff really quits the app (no hiding to the tray)');
  await run(`
    await wait(800);
    const d = await T4.docstore.get(${JSON.stringify(docId)});
    ok(d && d.html.includes('SHUTDOWN WORDS') && d.html.includes('LAST WORDS'), 'editor text typed before hide + shutdown is saved');
  `);

  // --- Single instance
  const second = b.spawn(b.EXE, b.EXE_ARGS, { env: b.env, stdio: 'ignore' });
  const exited = await new Promise((r) => { second.once('exit', () => r(true)); setTimeout(() => r(false), 45000); });
  ok(exited, 'second instance exits immediately (single-instance lock)');
  const pages2 = await (await fetch('http://127.0.0.1:' + b.PORT + '/json/list')).json();
  ok(pages2.filter((p) => p.type === 'page').length === 1, 'still exactly one window');

  console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + out.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
