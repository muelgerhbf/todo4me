import fs from 'node:fs';
import path from 'node:path';
import calendarFetchChecks from './electron-calendar.mjs';

const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var click = (el) => { if (typeof el === 'string') el = $(el); if (!el) throw new Error('missing element'); el.click(); };
  var S = () => T4.store.data;
`;

// An existing local file the app must never open (window.open / navigation / fetch).
const FORBIDDEN_FILE = process.platform === 'win32' ? 'file:///C:/Windows/win.ini' : 'file:///etc/passwd';

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
    ok(Object.keys(window.todo4meDesktop).sort().join() === 'checkForUpdates,exportPDF,fetchCalendar,getDesktopSettings,getInfo,getUpdateState,installUpdate,isDesktop,notify,onBeforeClose,onMenuAction,onNotificationClick,onUpdateState,openFolder,openPath,platform,setDesktopSettings,setLanguage,writeBackup,writeDocBackup', 'bridge exposes only the intended API: ' + Object.keys(window.todo4meDesktop).sort().join());
    ok(document.documentElement.classList.contains('is-desktop'), 'desktop class set');
    const w = window.open(${JSON.stringify(FORBIDDEN_FILE)});
    ok(w === null, 'window.open is denied');
    const info = await todo4meDesktop.getInfo();
    ok(info.userData.replace(/\\\\/g, '/').toLowerCase() === ${JSON.stringify(udata.replace(/\\/g, '/').toLowerCase())}, 'userData points to isolated test folder: ' + info.userData);
    for (let i = 0; i < 50 && !$$('.toast').some(t => /browser before/.test(t.textContent)); i++) await wait(100);
    ok(!!$('.toast') && $$('.toast').some(t => /browser before/.test(t.textContent)), 'migration hint shown when no data');
  `);
  const pages = await (await fetch('http://127.0.0.1:' + b.PORT + '/json/list')).json();
  ok(pages.filter((p) => p.type === 'page').length === 1, 'no extra window was opened');

  // Navigation away from the app is blocked
  await b.evaluate(`location.href = ${JSON.stringify(FORBIDDEN_FILE)}; true`).catch(() => {});
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
    ok($$('.settings__section').length === 10, 'all original settings sections still present (+ Mode + Calendars + Documents + Desktop app)');
    ok(/Updates/.test(card.textContent) && /installed app|portable/i.test(card.textContent), 'update section explains why the dev build cannot self-update');
    const st = await todo4meDesktop.getUpdateState();
    ok(st.status === 'unsupported' && st.current, 'update state reported by main process: ' + st.status);
  `);

  // --- Sidebar "Update" button: only with a fully downloaded update, in the accent color, click installs
  const sendUpd = (s) => b.mainEval(`${'process.mainModule.require(\'electron\')'}.BrowserWindow.getAllWindows()[0].webContents.send('update:state', ${JSON.stringify(s)}); true`);
  await run(`
    const btn = () => $('#update-btn');
    const shown = () => { const e = btn(); return !!e && !e.hidden && e.offsetParent !== null; };
    ok(!shown(), 'update button hidden without an update (dev build: updater unsupported)');
  `);
  await sendUpd({ status: 'downloading', version: '9.9.9', percent: 40, current: '2.1.2' }); await b.sleep(200);
  await run(`ok(!($('#update-btn') && !$('#update-btn').hidden), 'update button hidden while the update is still downloading');`);
  await sendUpd({ status: 'ready', version: '9.9.9', percent: 100, current: '2.1.2' }); await b.sleep(300);
  await run(`
    const e = $('#update-btn');
    ok(e && !e.hidden && e.offsetParent !== null, 'update button visible once the update is downloaded');
    ok(e.previousElementSibling && e.previousElementSibling.classList.contains('sidebar__brand') && e.nextElementSibling && e.nextElementSibling.classList.contains('sidebar__capture'), 'update button sits between the logo and Quick capture');
    ok(e.getAttribute('aria-label') === 'Update to 9.9.9 – restarts Todo4Me' && e.title === e.getAttribute('aria-label') && e.textContent.trim() === 'Update' && e.querySelector('svg'), 'update button: icon + "Update", tooltip/aria-label with version');
    ok(parseFloat(getComputedStyle(e).borderTopLeftRadius) >= 15, 'update button is pill shaped');
    ok(!$$('.toast').some((t) => /Restart now/.test(t.textContent)), 'no "Restart now" toast any more');
    const probe = document.createElement('i'); probe.style.transition = 'none'; document.body.appendChild(probe); // no transition: otherwise getComputedStyle returns a mid-transition color
    const accentRgb = (hex) => { probe.style.color = hex; return getComputedStyle(probe).color; };
    const fgOf = () => getComputedStyle(e).color;
    let n = 0;
    for (const theme of ['light', 'dark']) {
      if (T4.store.settings.theme !== theme) click('[data-action=toggle-theme]');
      for (const hex of T4.storage.ACCENTS) {
        click('[data-action=set-accent][data-value="' + hex + '"]'); await wait(30);
        const bg = getComputedStyle(e).backgroundColor;
        if (bg === accentRgb(hex) && fgOf() === 'rgb(255, 255, 255)') n++; else window.__r.push('FAIL accent mismatch ' + theme + ' ' + hex + ' ' + bg);
      }
    }
    ok(n === 2 * T4.storage.ACCENTS.length, 'update button background = accent color (' + n + ' combinations of light/dark x all accents), white text');
    probe.remove();
    click('[data-action=set-accent][data-value="' + T4.storage.ACCENTS[0] + '"]');
    if (T4.store.settings.theme !== 'light') click('[data-action=toggle-theme]');
    // click -> install flow: the dev build has no real update, so the main process refuses; the button must come back
    const t0 = Date.now(); e.click();
    ok(e.disabled, 'update button is disabled right after the click (no double install)');
    e.click(); // ignored while installing
    await wait(1200);
    ok([...document.querySelectorAll('.toast')].some((t) => /No update is ready to install/.test(t.textContent)), 'click calls the install flow in the main process');
    ok(!e.disabled, 'button usable again when the installation failed');
  `);
  await sendUpd({ status: 'unsupported', reason: 'x', current: '2.1.2' }); await b.sleep(200);
  await run(`ok($('#update-btn').hidden, 'update button hidden again when the status is not "ready"');`);

  /* ---------- Running in the background: tray, close to tray, hotkey, start with Windows, notifications ---------- */
  const E = `process.mainModule.require('electron')`;
  const BG = `Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.replace(/\\\\/g, '/').endsWith('/electron/background.js')).exports`;
  const winState = () => b.mainEval(`(() => { const all = ${E}.BrowserWindow.getAllWindows(); const w = all[0]; return { n: all.length, visible: !!w && w.isVisible(), destroyed: !w || w.isDestroyed() }; })()`);
  const shownList = () => b.mainEval(`${BG}.shown`);
  const waitShown = async (pred, ms = 6000) => { for (let i = 0; i < ms / 200; i++) { const s = (await shownList()).find(pred); if (s) return s; await b.sleep(200); } return null; };
  // Like clicking the window's X button (a page-side window.close() would bypass the 'close' event).
  const hideWindow = async () => { await b.mainEval(`setTimeout(() => ${E}.BrowserWindow.getAllWindows()[0].close(), 20); true`); await b.sleep(700); };

  let ds = await b.evaluate('todo4meDesktop.getDesktopSettings()');
  if (process.platform === 'linux') {
    // Linux defaults: no tray / global hotkey until the user turns them on. The rest of this section tests the
    // tray and hotkey, so switch both on (like the user would) once the defaults are verified.
    ok(ds.closeToTray === false && ds.openAtLogin === false && ds.hotkeyEnabled === false && ds.tray === false && ds.hotkeyRegistered === false, 'Linux desktop defaults: close to tray off, hotkey off, no tray icon');
    ok(await b.mainEval(`${BG}._test.sanitize(null).closeToTray === false && ${BG}._test.sanitize({}).hotkeyEnabled === false`), 'Linux defaults also apply to missing/corrupt settings');
    await run(`
      location.hash = '#/settings'; await wait(300);
      ok($('#set-tray') && !$('#set-tray').checked && $('#set-hk-on') && !$('#set-hk-on').checked, 'Linux settings page shows tray and hotkey switched off by default');
      click('#set-tray'); await wait(400); click('#set-hk-on'); await wait(400);
      location.hash = '#/'; await wait(100);
    `);
    ds = await b.evaluate('todo4meDesktop.getDesktopSettings()');
    const saved = JSON.parse(fs.readFileSync(path.join(udata, 'desktop-settings.json'), 'utf8'));
    ok(ds.closeToTray === true && ds.hotkeyEnabled === true && saved.closeToTray === true && saved.hotkeyEnabled === true, 'Linux: an explicit "on" is saved to disk');
    ok(await b.mainEval(`(() => { const s = ${BG}._test.sanitize(${JSON.stringify(saved)}); return s.closeToTray === true && s.hotkeyEnabled === true; })()`), 'Linux: a saved explicit true survives loading (beats the Linux default)');
    ds = await b.evaluate('todo4meDesktop.getDesktopSettings()');
  } else {
    ok(ds.closeToTray === true && ds.openAtLogin === false && ds.hotkeyEnabled === true && ds.hotkey === 'Control+Alt+Space' && ds.tray === true, 'desktop defaults: close to tray on, start with Windows off, hotkey Ctrl+Alt+Space on');
  }
  ok(ds.loginSupported === false && /test/i.test(ds.loginReason || ''), 'start at login is never written to the registry / autostart folder in test runs: ' + ds.loginReason);
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

  if (process.platform === 'linux') {
    // Linux autostart: XDG .desktop file, redirected into the test profile (never ~/.config/autostart)
    const realAuto = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config'), 'autostart', 'todo4me.desktop');
    const statOf = (f) => { try { const st = fs.statSync(f); return st.mtimeMs + ':' + st.size; } catch { return null; } };
    const realBefore = statOf(realAuto);
    const adir = path.join(udata, 'autostart-test');
    const res = await b.mainEval(`(() => {
      const fs = process.mainModule.require('fs'), path = process.mainModule.require('path');
      const bg = ${BG}, dir = ${JSON.stringify(adir)}, file = path.join(dir, 'todo4me.desktop');
      const oldDir = process.env.TODO4ME_AUTOSTART_DIR, oldImg = process.env.APPIMAGE, r = {};
      try {
        process.env.TODO4ME_AUTOSTART_DIR = dir; delete process.env.APPIMAGE;
        bg._test.linuxAutostart(true);
        r.plain = fs.readFileSync(file, 'utf8'); r.exec = process.execPath;
        process.env.APPIMAGE = '/opt/My Apps/To"do4Me.AppImage';
        bg._test.linuxAutostart(true);
        r.image = fs.readFileSync(file, 'utf8');
        bg._test.linuxAutostart(false); r.removed = !fs.existsSync(file);
        try { bg._test.linuxAutostart(false); r.again = true; } catch (e) { r.again = false; }
      } finally {
        if (oldDir === undefined) delete process.env.TODO4ME_AUTOSTART_DIR; else process.env.TODO4ME_AUTOSTART_DIR = oldDir;
        if (oldImg === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = oldImg;
      }
      return r;
    })()`);
    const line = (txt, k) => (txt.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1);
    const q = (p) => (/[\s"'\\><~|&;$*?#()`]/.test(p) ? '"' + p.replace(/["`$\\]/g, (c) => (c === '\\' ? '\\\\\\\\' : '\\\\' + c)) + '"' : p);
    ok(res.plain.startsWith('[Desktop Entry]') && line(res.plain, 'Type') === 'Application' && line(res.plain, 'X-GNOME-Autostart-enabled') === 'true' && line(res.plain, 'Exec') === q(res.exec) + ' --hidden', 'Linux autostart: todo4me.desktop with Type=Application, Exec=<execPath> --hidden, autostart enabled: ' + line(res.plain, 'Exec'));
    ok(line(res.image, 'Exec') === '"/opt/My Apps/To\\\\"do4Me.AppImage" --hidden', 'Linux autostart: AppImage path with space and quote is quoted/escaped per Desktop Entry spec: ' + line(res.image, 'Exec'));
    ok(res.removed && res.again, 'Linux autostart: disabling removes the file; removing again does not throw');
    ok(statOf(realAuto) === realBefore, 'Linux autostart: nothing written to the real ~/.config/autostart');

    // Updater: only an AppImage self-updates; other Linux installs get the "package" explanation
    const upd = await b.mainEval(`(async () => {
      const upd = Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.replace(/\\\\/g, '/').endsWith('/electron/updater.js')).exports;
      const oldUrl = process.env.TODO4ME_UPDATE_URL, oldImg = process.env.APPIMAGE, r = {};
      try {
        r.dev = (await upd.check(true)).reason; // unpackaged dev app: caught before the Linux branch
        process.env.TODO4ME_UPDATE_URL = 'http://127.0.0.1:9/'; delete process.env.APPIMAGE;
        const s = await upd.check(true); r.status = s.status; r.pkg = s.reason;
      } finally {
        if (oldUrl === undefined) delete process.env.TODO4ME_UPDATE_URL; else process.env.TODO4ME_UPDATE_URL = oldUrl;
        if (oldImg === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = oldImg;
      }
      return r;
    })()`);
    ok(/only available in the installed app/.test(upd.dev), 'updater: unpackaged dev app → "installed app only": ' + upd.dev);
    ok(upd.status === 'unsupported' && /Installed as a Linux package/.test(upd.pkg) && /releases\/latest/.test(upd.pkg), 'updater: Linux without AppImage → linuxPackage reason: ' + upd.pkg);

    // Updater for the deb / rpm packages: own pkexec installer (stubbed spawn, no real prompt, no real quit)
    const UPD = `Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.replace(/\\\\/g, '/').endsWith('/electron/updater.js')).exports`;
    const pk = await b.mainEval(`(async () => {
      const U = ${UPD}, t = U._test, M = process.mainModule;
      const fs = M.require('fs'), os = M.require('os'), path = M.require('path'), crypto = M.require('crypto'), EventEmitter = M.require('events');
      const eu = t.autoUpdater;
      const oldUrl = process.env.TODO4ME_UPDATE_URL, oldImg = process.env.APPIMAGE, oldAuto = eu.autoInstallOnAppQuit, r = {};
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't4m-pkg-'));
      const file = path.join(dir, "it's a pkg.deb"); // a quote in the path: harmless without a shell
      fs.writeFileSync(file, 'package-bytes');
      const sha = crypto.createHash('sha512').update('package-bytes').digest('base64');
      const tools = { pkexec: '/usr/bin/pkexec', 'apt-get': '/usr/bin/apt-get', dpkg: '/usr/bin/dpkg', dnf: '/usr/bin/dnf', zypper: '/usr/bin/zypper', rpm: '/usr/bin/rpm' };
      let have = Object.keys(tools);
      t.setFindTool((n) => (have.includes(n) ? tools[n] : null));
      const calls = [], counts = { before: 0, aborted: 0, exit: 0 };
      let plan = { code: 0, stderr: '', delay: 0 }, statusAtSpawn = null, noticeAtSpawn = null;
      t.setSpawn((exe, argv, opts) => {
        calls.push({ exe, argv, shell: opts.shell, stdio: opts.stdio });
        statusAtSpawn = U.state.status; noticeAtSpawn = U.state.notice;
        const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
        setTimeout(() => { if (plan.stderr) c.stderr.emit('data', Buffer.from(plan.stderr)); c.emit('close', plan.code, null); }, plan.delay);
        return c;
      });
      t.setExit(() => { counts.exit++; });
      const prev = t.setHooks({ beforeInstall: async () => { counts.before++; }, installAborted: () => { counts.aborted++; } });
      const ready = () => t.setReady({ file, sha512: sha, version: '9.9.9' });
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      try {
        process.env.TODO4ME_UPDATE_URL = 'http://127.0.0.1:9/'; delete process.env.APPIMAGE;
        // supported() / autoInstallOnAppQuit per package type
        t.setPackageType('deb'); r.supDeb = t.supported(); t.applyOptions(); r.autoDeb = eu.autoInstallOnAppQuit;
        t.setPackageType('rpm'); r.supRpm = t.supported(); t.applyOptions(); r.autoRpm = eu.autoInstallOnAppQuit;
        t.setPackageType(null); r.supTar = t.supported();
        t.setPackageType('deb'); have = have.filter((x) => x !== 'pkexec'); r.supNoPk = t.supported(); have = Object.keys(tools);
        t.setPackageType(null); process.env.APPIMAGE = '/tmp/x.AppImage'; r.supImg = t.supported(); t.applyOptions(); r.autoImg = eu.autoInstallOnAppQuit; delete process.env.APPIMAGE;
        t.setPackageType('deb');
        // downloaded file + sha512 from the update info
        t.onDownloaded({ version: '9.9.9', downloadedFile: '/c/Todo4Me-9.9.9-x64.deb', files: [{ url: 'Todo4Me-9.9.9-x64.AppImage', sha512: 'IMG' }, { url: 'Todo4Me-9.9.9-x64.deb', sha512: 'DEB' }] });
        r.dl = t.downloaded;
        // success
        ready(); r.ok = await U.install(); await sleep(30);
        r.okCalls = calls.slice(); r.okExit = counts.exit; r.okStatus = statusAtSpawn; r.okNotice = noticeAtSpawn; r.okBefore = counts.before;
        // 126 / 127 / other
        calls.length = 0; counts.exit = 0;
        plan = { code: 126, stderr: '', delay: 0 }; ready(); r.c126 = await U.install(); r.s126 = { status: U.state.status, notice: U.state.notice, aborted: counts.aborted };
        plan = { code: 127, stderr: '', delay: 0 }; ready(); r.c127 = await U.install(); r.s127 = { status: U.state.status, notice: U.state.notice };
        plan = { code: 100, stderr: 'E: Unable to locate package\\nsecond line', delay: 0 }; ready(); r.c100 = await U.install(); r.s100 = { status: U.state.status, error: U.state.error };
        r.noExitOnFail = counts.exit;
        // sha512 mismatch → refused, nothing spawned
        calls.length = 0; plan = { code: 0, stderr: '', delay: 0 };
        ready(); fs.writeFileSync(file, 'tampered'); r.bad = await U.install(); r.sBad = { status: U.state.status, error: U.state.error, spawned: calls.length }; fs.writeFileSync(file, 'package-bytes');
        // pkexec missing → refused
        ready(); have = have.filter((x) => x !== 'pkexec'); r.nopk = await U.install(); r.sNopk = { status: U.state.status, spawned: calls.length }; have = Object.keys(tools);
        // double click: second call is refused while the first one waits for the password
        calls.length = 0; counts.exit = 0; plan = { code: 0, stderr: '', delay: 120 };
        ready(); const p1 = U.install(); const p2 = U.install(); r.dbl2 = await p2; r.dbl1 = await p1; await sleep(30); r.dblSpawns = calls.length; r.dblExit = counts.exit;
        // argv per package manager
        r.argvDeb = t.installCommand('deb', file);
        have = have.filter((x) => x !== 'apt-get'); r.argvDpkg = t.installCommand('deb', file); have = Object.keys(tools);
        r.argvDnf = t.installCommand('rpm', file);
        have = have.filter((x) => x !== 'dnf'); r.argvZyp = t.installCommand('rpm', file);
        have = have.filter((x) => x !== 'zypper'); r.argvRpm = t.installCommand('rpm', file);
        have = []; r.argvNone = t.installCommand('rpm', file); have = Object.keys(tools);
        // the real PATH scan finds pkexec only in trusted (root-owned) places
        t.setFindTool(null); r.realPk = t.findTool('pkexec'); r.realNone = t.findTool('definitely-not-a-tool-xyz');
      } finally {
        if (oldUrl === undefined) delete process.env.TODO4ME_UPDATE_URL; else process.env.TODO4ME_UPDATE_URL = oldUrl;
        if (oldImg === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = oldImg;
        eu.autoInstallOnAppQuit = oldAuto;
        t.setHooks(prev); t.reset();
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return r;
    })()`);
    ok(pk.supDeb === null && pk.supRpm === null && pk.supImg === null, 'updater: deb, rpm (pkexec present) and AppImage can self-update');
    ok(/Installed as a Linux package/.test(pk.supTar), 'updater: tar.gz keeps the "download manually" hint');
    ok(/pkexec/.test(pk.supNoPk) && /releases\/latest/.test(pk.supNoPk), 'updater: deb without pkexec → manual-install hint, no install offered: ' + pk.supNoPk);
    ok(pk.autoDeb === false && pk.autoRpm === false && pk.autoImg === true, 'updater: autoInstallOnAppQuit is off for deb/rpm, on for AppImage');
    ok(pk.dl && pk.dl.file === '/c/Todo4Me-9.9.9-x64.deb' && pk.dl.sha512 === 'DEB', 'updater: downloaded file and its sha512 are taken from the update info');
    const A = pk.okCalls[0] || {};
    ok(pk.ok && pk.ok.ok === true && pk.okCalls.length === 1 && pk.okExit === 1 && pk.okBefore >= 1, 'updater: exit 0 → data saved, relaunch + quit requested once');
    ok(A.exe === '/usr/bin/pkexec' && A.shell === false && JSON.stringify(A.argv.slice(0, 4)) === JSON.stringify(['--disable-internal-agent', '/usr/bin/apt-get', 'install', '-y']) && A.argv.length === 5 && A.argv[4].endsWith("it's a pkg.deb"), 'updater: pkexec --disable-internal-agent apt-get install -y <file>, no shell, quote in path kept as one argument');
    ok(pk.okStatus === 'installing' && /password prompt/.test(pk.okNotice), 'updater: "installing / password prompt" state is broadcast before pkexec is spawned');
    ok(pk.c126.ok === false && pk.s126.status === 'ready' && /cancelled/.test(pk.s126.notice) && pk.s126.aborted >= 1, 'updater: exit 126 → back to ready with "password prompt was cancelled", close handling restored');
    ok(pk.c127.ok === false && pk.s127.status === 'ready' && /authorization failed/.test(pk.s127.notice), 'updater: exit 127 → authorization-failed message, ready again');
    ok(pk.s100.status === 'error' && /Unable to locate package/.test(pk.s100.error) && !/second line/.test(pk.s100.error) && /exit code 100/.test(pk.s100.error) && pk.noExitOnFail === 0, 'updater: other exit code → error with first stderr line only, no quit: ' + pk.s100.error);
    ok(pk.bad.ok === false && pk.sBad.status === 'error' && /could not be verified/.test(pk.sBad.error) && pk.sBad.spawned === 0, 'updater: sha512 mismatch right before install → refused, nothing spawned');
    ok(pk.nopk.ok === false && /pkexec/.test(pk.nopk.error) && pk.sNopk.spawned === 0, 'updater: pkexec missing at install time → refused');
    ok(pk.dbl2.ok === false && pk.dbl2.busy === true && pk.dbl1.ok === true && pk.dblSpawns === 1 && pk.dblExit === 1, 'updater: second click while installing is refused (one pkexec, one restart)');
    const J = JSON.stringify;
    ok(J(pk.argvDeb.slice(0, 2)) === J(['/usr/bin/apt-get', 'install']) && J(pk.argvDpkg.slice(0, 2)) === J(['/usr/bin/dpkg', '-i']) && pk.argvDpkg.length === 3, 'updater: deb → apt-get install -y, dpkg -i as fallback');
    ok(J(pk.argvDnf.slice(0, 4)) === J(['/usr/bin/dnf', 'install', '-y', '--nogpgcheck']) && J(pk.argvZyp.slice(0, 4)) === J(['/usr/bin/zypper', '--non-interactive', 'install', '--allow-unsigned-rpm']) && J(pk.argvRpm.slice(0, 2)) === J(['/usr/bin/rpm', '-U']) && pk.argvNone === null, 'updater: rpm → dnf, zypper, rpm -U in that order; none → no command');
    ok(pk.realNone === null && (pk.realPk === null || /\/pkexec$/.test(pk.realPk)), 'updater: PATH scan returns absolute trusted paths only: ' + pk.realPk);
    await sendUpd({ status: 'installing', version: '9.9.9', notice: 'Installing the update… A system password prompt will appear', current: '2.4.0' }); await b.sleep(250);
    await run(`
      location.hash = '#/settings'; await wait(300);
      ok(/password prompt will appear/.test($('#upd-text').textContent) && $('#upd-buttons button') && $('#upd-buttons button').disabled, 'settings: "installing" state shows the password hint and a disabled button');
    `);
    await sendUpd({ status: 'ready', version: '9.9.9', notice: 'Update not installed — the password prompt was cancelled. You can try again.', current: '2.4.0' }); await b.sleep(250);
    await run(`
      ok(/cancelled/.test($('#upd-text').textContent) && $('#upd-buttons button') && !$('#upd-buttons button').disabled, 'settings: cancelled prompt is explained and "Restart & install" is usable again');
      ok($$('.toast').some((t) => /password prompt was cancelled/.test(t.textContent)), 'cancelled prompt also shown as a toast');
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    `);
    await sendUpd({ status: 'unsupported', reason: 'x', current: '2.4.0' }); await b.sleep(150);

    // UI wording: generic, not "Windows"
    await run(`
      location.hash = '#/settings'; await wait(300);
      const lab = $('label[for=set-login]');
      ok(lab && /Start Todo4Me at login/.test(lab.textContent) && !/Windows/.test(lab.textContent), 'Linux settings: generic "Start Todo4Me at login" label');
      const rs = T4.reminders.systemStatus();
      ok(rs.kind === 'desktop' && /system notifications/.test(rs.text) && !/Windows/.test(rs.text), 'Linux reminders: generic system-notification text: ' + rs.text);
    `);
  }

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

  // --- Zoom: Ctrl + / - / 0 work on every layout, steps like Chrome, saved across reloads and restarts
  const zf = () => b.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()`);
  // CDP key events skip Electron's before-input-event, so the listener is fed the input object directly
  // (key/code exactly as Chromium reports them per layout); a few real keys go through sendInputEvent below.
  const ctrl = (key, code, mods = {}) => b.mainEval(`(() => { const w = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]; let prevented = false; w.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, Object.assign({ type: 'keyDown', key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, control: true, shift: false, alt: false, meta: false }, ${JSON.stringify(mods)})); return prevented; })()`);
  const realKey = (keyCode, modifiers) => b.mainEval(`(() => { const w = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]; w.webContents.sendInputEvent({ type: 'keyDown', keyCode: ${JSON.stringify(keyCode)}, modifiers: ${JSON.stringify(modifiers)} }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: ${JSON.stringify(keyCode)}, modifiers: ${JSON.stringify(modifiers)} }); return true; })()`);
  const near = (a, v) => Math.abs(a - v) < 0.005;
  await ctrl('0', 'Digit0'); await b.sleep(150);
  ok(near(await zf(), 1), 'Ctrl+0 resets the zoom to 100 %');
  await ctrl('+', 'BracketRight'); await b.sleep(150);   // German layout: "+" is its own key
  ok(near(await zf(), 1.1), 'Ctrl++ (German layout, key "+" on BracketRight) zooms in to 110 %');
  await ctrl('=', 'Equal'); await b.sleep(150);          // US layout without Shift
  ok(near(await zf(), 1.25), 'Ctrl+= (US layout) zooms in to 125 %');
  await ctrl('+', 'NumpadAdd'); await b.sleep(150);
  ok(near(await zf(), 1.5), 'Ctrl+Numpad+ zooms in to 150 %');
  await ctrl('-', 'Minus'); await b.sleep(150);
  ok(near(await zf(), 1.25), 'Ctrl+- zooms out to 125 %');
  await ctrl('-', 'NumpadSubtract'); await b.sleep(150);
  ok(near(await zf(), 1.1), 'Ctrl+Numpad- zooms out to 110 %');
  ok(!(await ctrl('+', 'BracketRight', { control: false })) && near(await zf(), 1.1), 'plain "+" without Ctrl does not zoom and is not swallowed');
  ok(!(await ctrl('}', 'Digit0', { alt: true })) && !(await ctrl('0', 'Digit0', { alt: true })) && near(await zf(), 1.1), 'Ctrl+Alt (AltGr, editor Ctrl+Alt+0) does not zoom');
  ok(!(await ctrl('c', 'KeyC')) && !(await ctrl('0', 'Numpad0', { key: 'Insert' })), 'other Ctrl keys (copy, Numpad0 with NumLock off) are left alone');
  await realKey('+', ['control', 'shift']); await b.sleep(150);
  ok(near(await zf(), 1.25), 'real key event Ctrl+Shift+= (US layout "+") zooms in');
  await realKey('numsub', ['control']); await b.sleep(150);
  ok(near(await zf(), 1.1), 'real key event Ctrl+Numpad- zooms out');
  await realKey('0', ['control']); await b.sleep(150);
  ok(near(await zf(), 1), 'real key event Ctrl+0 resets');
  await ctrl('+', 'BracketRight'); await b.sleep(150);
  await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await b.sleep(200);
  ok(near(await zf(), 3), 'zoom in clamps at 300 %');
  for (let i = 0; i < 14; i++) await ctrl('-', 'Minus');
  await b.sleep(200);
  ok(near(await zf(), 0.5), 'zoom out clamps at 50 %');
  await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await ctrl('+', 'BracketRight'); await b.sleep(150);
  ok(near(await zf(), 0.8), 'steps 50 → 67 → 75 → 80 %');
  await b.reload(); await b.sleep(500);
  ok(near(await zf(), 0.8), 'zoom survives a page reload');
  const zmenu = await b.mainEval(`(() => { const m = process.mainModule.require('electron').Menu.getApplicationMenu(); const v = m.items.find((i) => i.submenu && i.submenu.items.some((s) => s.accelerator === 'CmdOrCtrl+Plus')); v.submenu.items.find((s) => s.accelerator === 'CmdOrCtrl+Plus').click(); return true; })()`);
  await b.sleep(150);
  ok(zmenu && near(await zf(), 0.9), 'View → Zoom in (menu click) uses the same steps');
  ok(near(JSON.parse(fs.readFileSync(path.join(b.env.TODO4ME_USER_DATA, 'desktop-settings.json'), 'utf8')).zoom, 0.9), 'zoom is saved in desktop-settings.json (not in the task data)');
  await b.restartGracefully('quit'); await b.sleep(800);
  ok(near(await zf(), 0.9), 'zoom is restored after an app restart');
  await ctrl('0', 'Digit0'); await b.sleep(150);
  ok(near(await zf(), 1), 'Ctrl+0 resets to 100 % again');

  // --- Calendar subscriptions: fetchCalendar in the main process against a local HTTPS server (tests/electron-calendar.mjs)
  await calendarFetchChecks(b, ok, run);

  // --- Single instance
  const second = b.spawn(b.EXE, b.EXE_ARGS, { env: b.env, stdio: 'ignore' });
  const exited = await new Promise((r) => { second.once('exit', () => r(true)); setTimeout(() => r(false), 45000); });
  ok(exited, 'second instance exits immediately (single-instance lock)');
  const pages2 = await (await fetch('http://127.0.0.1:' + b.PORT + '/json/list')).json();
  ok(pages2.filter((p) => p.type === 'page').length === 1, 'still exactly one window');

  console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + out.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
