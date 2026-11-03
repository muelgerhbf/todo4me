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

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn', 'assert'].includes(m.params.type)) errors.push('CONSOLE.' + m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

const api = {
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
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, modifiers, windowsVirtualKeyCode: VK[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: VK[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) });
  },
  /** Type text like a user (fires beforeinput/input events). */
  async type(text) {
    for (const ch of text) {
      if (ch === '\n') { await api.key('Enter', 'Enter', '\r'); continue; }
      await send('Input.insertText', { text: ch });
    }
  },
  async mouse(type, x, y, buttons = 1) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1 });
  },
  async drag(x1, y1, x2, y2, steps = 6) {
    await api.mouse('mouseMoved', x1, y1, 0);
    await api.mouse('mousePressed', x1, y1);
    for (let i = 1; i <= steps; i++) await api.mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await api.mouse('mouseReleased', x2, y2);
  },
  /** Mouse wheel at (x, y); modifiers: 2 = Ctrl. */
  async wheel(x, y, deltaY, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers });
  },
  async click(x, y) {
    await api.mouse('mouseMoved', x, y, 0);
    await api.mouse('mousePressed', x, y);
    await api.mouse('mouseReleased', x, y);
  },
  async printPDF(file) {
    const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true });
    if (!r.result || !r.result.data) throw new Error('printToPDF failed: ' + JSON.stringify(r.error || r));
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  },
};
const VK = { Enter: 13, Tab: 9, Backspace: 8, Delete: 46, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32 };

try {
  await plan.default(api, APP);
} catch (e) {
  console.log('PLAN FAILED:', e.message);
} finally {
  console.log('--- page errors (' + errors.length + ') ---');
  errors.forEach((e) => console.log(e));
  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
