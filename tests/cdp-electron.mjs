// Minimal CDP harness: node cdp.mjs <script.js> [outdir]
// The script exports steps via a JSON-ish plan file evaluated in node.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const profile = path.join(here, 'profile-' + Date.now());
const APP = 'file:///C:/dev/todo4me/index.html';

const plan = await import('file:///' + path.resolve(process.argv[2]).replace(/\\/g, '/'));
const outDir = process.argv[3] || path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const EXE = process.env.EXE || 'C:/dev/todo4me/node_modules/electron/dist/electron.exe';
const EXE_ARGS = process.env.EXE ? [] : ['C:/dev/todo4me'];
const env = Object.assign({}, process.env, { TODO4ME_USER_DATA: process.env.UDATA || profile });
delete env.ELECTRON_RUN_AS_NODE;
let chrome;
function launch() { chrome = spawn(EXE, EXE_ARGS.concat(['--remote-debugging-port=' + PORT, '--inspect=9339']), { stdio: 'ignore', env }); }
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
  const list = await (await fetch('http://127.0.0.1:9339/json/list')).json();
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
  async restartGracefully() {
    await send('Runtime.evaluate', { expression: 'setTimeout(() => window.close(), 50); true' });
    await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 15000); });
    console.log('app exited, exit code', chrome.exitCode);
    launch(); await connect(); await enable();
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
  async key(key, code, text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
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
  try { (await import('node:child_process')).execSync('taskkill /F /T /PID ' + chrome.pid, { stdio: 'ignore' }); } catch {}
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
