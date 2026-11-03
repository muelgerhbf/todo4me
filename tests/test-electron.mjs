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
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const run = async (body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { ok(false, 'threw: ' + e.message); }
    const r = await b.evaluate('window.__r'); out.push(...r); await b.evaluate('window.__r = []');
  };
  const udata = b.env.TODO4ME_USER_DATA;

  // --- Security & environment
  await run(`
    ok(typeof require === 'undefined' && typeof process === 'undefined' && typeof module === 'undefined', 'no Node.js APIs in the page (nodeIntegration off, contextIsolation on)');
    ok(window.todo4meDesktop && window.todo4meDesktop.isDesktop, 'preload bridge available');
    ok(Object.keys(window.todo4meDesktop).sort().join() === 'checkForUpdates,exportPDF,getInfo,getUpdateState,installUpdate,isDesktop,onBeforeClose,onMenuAction,onUpdateState,openFolder,openPath,platform,writeBackup,writeDocBackup', 'bridge exposes only the intended API: ' + Object.keys(window.todo4meDesktop).sort().join());
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
  `);
  const before = await b.evaluate('JSON.stringify({ t: T4.store.data.tasks.length, n: T4.store.data.notes.length })');
  await b.restartGracefully();
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
  await b.restartGracefully();
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

  // --- Single instance
  const second = b.spawn(b.EXE, b.EXE_ARGS, { env: b.env, stdio: 'ignore' });
  const exited = await new Promise((r) => { second.once('exit', () => r(true)); setTimeout(() => r(false), 45000); });
  ok(exited, 'second instance exits immediately (single-instance lock)');
  const pages2 = await (await fetch('http://127.0.0.1:' + b.PORT + '/json/list')).json();
  ok(pages2.filter((p) => p.type === 'page').length === 1, 'still exactly one window');

  out.forEach((r) => console.log(r));
  console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + out.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
