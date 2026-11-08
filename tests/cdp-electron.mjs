// Minimal CDP harness: node cdp.mjs <script.js> [outdir]
// The script exports steps via a JSON-ish plan file evaluated in node.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
// Debug port: default 9333; override with env CDP_PORT so several test runs can use different ports in parallel.
const PORT = Number(process.env.CDP_PORT) || 9333;
const here = path.dirname(fileURLToPath(import.meta.url));
const profile = path.join(here, 'profile-' + Date.now());
const APP = pathToFileURL(path.resolve(here, '..', 'index.html')).href; // the checkout this test lives in (also works in worktrees)

const plan = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const outDir = process.argv[3] || path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const EXE = process.env.EXE || createRequire(import.meta.url)('electron') // path of the electron binary in this checkout (node_modules/electron);
const EXE_ARGS = process.env.EXE ? [] : [path.resolve(here, '..')];
const env = Object.assign({}, process.env, { TODO4ME_USER_DATA: process.env.UDATA || profile });
delete env.ELECTRON_RUN_AS_NODE;
let chrome;
function launch() { chrome = spawn(EXE, EXE_ARGS.concat(['--remote-debugging-port=' + PORT, '--inspect=' + (PORT + 6)]), { stdio: 'ignore', env }); }
launch();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
async function connect() {
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try { const t = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = t.find((x) => x.type === 'page' && x.url.startsWith('file:')); } catch {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('no app window found');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', onMsg);
  await sleep(800);
}
await connect();
let id = 0; const pending = new Map();
const errors = [];
function onMsg(ev) {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn', 'assert'].includes(m.params.type)) errors.push('CONSOLE.' + m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function enable() { await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); }
await enable();

async function mainEval(expr) {
  const list = await (await fetch('http://127.0.0.1:' + (PORT + 6) + '/json/list')).json();
  const mws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r) => mws.addEventListener('open', r));
  const res = await new Promise((r) => {
    mws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id === 1) r(m); });
    mws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  mws.close();
  if (res.result.exceptionDetails) throw new Error('main eval failed: ' + JSON.stringify(res.result.exceptionDetails));
  return res.result.result.value;
}
const api = {
  mainEval, PORT, env, EXE, EXE_ARGS, spawn,
  get exited() { return chrome.exitCode !== null; },
  /** Quit the app like a user (File → Exit / tray → Quit), then start it again.
   *  Closing the window is not enough any more: by default it only hides Todo4Me to the tray. */
  /*  how: 'quit' = app.quit() (File → Exit), 'tray' = tray menu → Quit Todo4Me,
   *       'session-end' = Windows shutdown/logoff (session-end, then the window is closed). */
  async restartGracefully(how = 'quit') {
    const exited = new Promise((r) => { chrome.once('exit', () => r(true)); setTimeout(() => r(false), 15000); });
    const expr = {
      quit: `process.mainModule.require('electron').app.quit()`,
      tray: `Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.replace(/\\\\/g, '/').endsWith('/electron/background.js')).exports._test.clickTrayItem('Quit Todo4Me')`,
      'session-end': `(() => { const w = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]; w.emit('query-session-end', { preventDefault() {} }); w.emit('session-end', { preventDefault() {} }); w.close(); })()`,
    }[how];
    await mainEval(`setTimeout(() => ${expr}, 50); true`);
    const didExit = await exited;
    console.log('app exited, exit code', chrome.exitCode);
    launch(); await connect(); await enable();
    return didExit;
  },
  sleep,
  errors,
  async goto(url = APP) { await send('Page.navigate', { url }); await sleep(700); },
  async reload() { await send('Page.reload', {}); await sleep(700); },
  async evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('eval failed: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result.result.value;
  },
  async viewport(width, height, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  },
  async shot(name, full = true) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
  },
  async key(key, code, text, modifiers = 0) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  },
  /** Type text like a user (fires beforeinput/input events). */
  async type(text) {
    for (const ch of text) {
      if (ch === '\n') { await api.key('Enter', 'Enter', '\r'); continue; }
      await send('Input.insertText', { text: ch });
    }
  },
  /** Real mouse input (same as tests/cdp.mjs). */
  async mouse(type, x, y, buttons = 1) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1 });
  },
  async drag(x1, y1, x2, y2, steps = 6) {
    await api.mouse('mouseMoved', x1, y1, 0);
    await api.mouse('mousePressed', x1, y1);
    for (let i = 1; i <= steps; i++) await api.mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await api.mouse('mouseReleased', x2, y2);
  },
  async click(x, y) {
    await api.mouse('mouseMoved', x, y, 0);
    await api.mouse('mousePressed', x, y);
    await api.mouse('mouseReleased', x, y);
  },
};

try {
  await plan.default(api, APP);
} catch (e) {
  console.log('PLAN FAILED:', e.message);
} finally {
  console.log('--- page errors (' + errors.length + ') ---');
  errors.forEach((e) => console.log(e));
  ws.close();
  // Quit gracefully first (removes the tray icon, unregisters the global hotkey), then make sure.
  if (chrome.exitCode === null) {
    const gone = new Promise((r) => { chrome.once('exit', r); setTimeout(r, 6000); });
    try { await mainEval(`setTimeout(() => process.mainModule.require('electron').app.quit(), 20); true`); await gone; } catch {}
  }
  if (process.platform === 'win32') { try { (await import('node:child_process')).execSync('taskkill /F /T /PID ' + chrome.pid, { stdio: 'ignore' }); } catch {} }
  else { try { chrome.kill('SIGKILL'); } catch {} }
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
