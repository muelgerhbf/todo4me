#!/usr/bin/env node
/**
 * Generates the Todo4Me "Tangram" brand assets reproducibly (no npm deps; needs Chrome/Chromium).
 *   node scripts/build-icons.mjs          # regenerate everything
 *   CHROME=/path/to/chrome node ...       # override the browser
 * Writes: build/brand/*.svg, build/icon.png (1024), build/icon.ico, build/icons/NxN.png,
 *         assets/icons/{icon.png,tray-*.png,favicon.svg}. Verifies size + transparency afterwards.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const INK = '#0E0E12', PURPLE = '#5B3BEA', WHITE = '#FFFFFF';

/** Cut width (in 100-unit viewBox) so the "4" survives at the target pixel size. */
const cutFor = (px) => (px >= 64 ? 3.2 : px >= 48 ? 4.5 : px >= 32 ? 6 : px >= 24 ? 6 : 9);

const NS = 'xmlns="http://www.w3.org/2000/svg"';
/** App icon: purple rounded tile, ink triangle, transparent "4" cuts. */
export function iconSvg(cut, { px, id = 'c' } = {}) {
  const size = px ? ` width="${px}" height="${px}"` : '';
  return `<svg ${NS}${size} viewBox="0 0 100 100"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect width="100" height="100" fill="#fff"/><g stroke="#000" stroke-width="${cut}" fill="none">` +
    `<path d="M62.5 -2V102M-2 62.5H102M64.5 -2L-2 64.5"/></g></mask></defs>` +
    `<g mask="url(#${id})"><rect width="100" height="100" rx="20" fill="${PURPLE}"/><path d="M62.5 0L0 62.5H62.5Z" fill="${INK}"/></g></svg>\n`;
}
/** Standalone mark (no tile): ink square, purple triangle, cuts via mask. */
export function markSvg(square, tri, id = 'm') {
  return `<svg ${NS} viewBox="0 0 100 100"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect width="100" height="100" fill="#fff"/><g stroke="#000" stroke-width="3.2" fill="none">` +
    `<path d="M60 -2V102M-2 60H102M72 -2L-2 72"/></g></mask></defs>` +
    `<g mask="url(#${id})"><rect x="10" y="10" width="80" height="80" fill="${square}"/><path d="M60 10L10 60H60Z" fill="${tri}"/></g></svg>\n`;
}

const tmp = mkdtempSync(path.join(tmpdir(), 't4m-icons-'));

/* ---- Headless Chrome driven over CDP (the plain --screenshot flag mis-renders masked SVGs in small windows) ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chrome, ws, msgId = 0; const pending = new Map();
async function startChrome() {
  const profile = path.join(tmp, 'profile');
  mkdirSync(profile, { recursive: true });
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Chrome did not start (set CHROME=/path/to/chrome)');
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!page) await sleep(100);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await send('Page.enable');
}
const send = (method, params = {}) => new Promise((r) => { const i = ++msgId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}
/** Renders an HTML document to a PNG. transparent: no page background. selector: clip to that element's box. */
async function shot(html, w, h, { scale = 1, transparent = true, selector, waitFonts = false } = {}) {
  const file = path.join(tmp, `p${++msgId}.html`);
  writeFileSync(file, html);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await send('Page.navigate', { url: 'file://' + file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:') });
  await sleep(300);
  await evalJs(`new Promise((res) => { const ok = () => document.readyState === 'complete' ? res(1) : setTimeout(ok, 50); ok(); })`);
  if (waitFonts) {
    await evalJs(`document.fonts.ready.then(() => document.fonts.check('700 40px Manrope'))`).then((ok) => { if (!ok) throw new Error('Manrope web font did not load (network needed for the logo lockups)'); });
  }
  await sleep(150);
  const params = { format: 'png', captureBeyondViewport: false };
  if (selector) {
    const r = JSON.parse(await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height }); })()`));
    params.clip = { ...r, scale: 1 };
  }
  const r = await send('Page.captureScreenshot', params);
  return Buffer.from(r.result.data, 'base64');
}
const page = (body, bg = 'transparent') => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${bg}">${body}`;
const sized = {};
async function pngAt(px) { return (sized[px] ??= await shot(page(iconSvg(cutFor(px), { px }).replace('<svg ', '<svg style="display:block" ')), px, px)); }
const png = (px) => sized[px];

/* ---- Lockup (mark + "todo4me" wordmark, Manrope Bold loaded from Google Fonts at render time only) ---- */
const FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@700&display=block">';
function lockupHtml(square, tri, text, accent, { height = 150, bg = 'transparent', frame } = {}) {
  const mark = markSvg(square, tri, 'lm').replace('<svg ', `<svg width="${height * 0.8}" height="${height * 0.8}" `).replace('viewBox="0 0 100 100"', 'viewBox="10 10 80 80"');
  return page(`${FONT_LINK}<style>.l{display:inline-flex;align-items:center;gap:${height * 0.16}px;padding:${height * 0.1}px ${height * 0.1}px}
    .l svg{display:block}.l span{font:700 ${height * 0.62}px/1 Manrope,sans-serif;letter-spacing:-0.045em;color:${text};padding-bottom:${height * 0.04}px}.l b{color:${accent};font-weight:700}</style>
    ${frame ? `<div style="width:${frame[0]}px;height:${frame[1]}px;display:grid;place-items:center">` : ''}<div class="l" id="lock">${mark}<span>todo<b>4</b>me</span></div>${frame ? '</div>' : ''}`, bg);
}

const put = (rel, data) => { const f = path.join(ROOT, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, data); };

/* ICO container with PNG-compressed entries (size 256 is stored as 0). */
function ico(sizes) {
  const imgs = sizes.map(png);
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = 6 + 16 * sizes.length;
  const dir = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(off, 12); off += imgs[i].length; return e;
  });
  return Buffer.concat([head, ...dir, ...imgs]);
}

/* Minimal PNG decoder (8-bit RGBA, non-interlaced) for the verification. */
export function decodePng(buf) {
  let p = 8, w = 0, h = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 6 || d[12] !== 0) throw new Error('unsupported PNG format'); }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c), pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v += pr; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, alphaAt: (x, y) => out[y * stride + x * 4 + 3], rgbaAt: (x, y) => [...out.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] };
}
function verify(rel, px) {
  const img = decodePng(readFileSync(path.join(ROOT, rel)));
  if (img.w !== px || img.h !== px) throw new Error(`${rel}: expected ${px}px, got ${img.w}x${img.h}`);
  if (img.alphaAt(0, 0) > 30) throw new Error(`${rel}: corner (0,0) is not transparent`);
  // vertical cut at x=62.5 sits in the lower-right region of the tile (purple area), y=80
  const cx = Math.min(px - 1, Math.floor(px * 0.625)), cy = Math.floor(px * 0.8);
  let minA = 255; for (const dx of [-1, 0]) minA = Math.min(minA, img.alphaAt(Math.max(0, cx + dx), cy));
  if (minA > 128) throw new Error(`${rel}: vertical cut not transparent (alpha ${minA})`);
  if (img.alphaAt(Math.floor(px * 0.85), Math.floor(px * 0.85)) < 250) throw new Error(`${rel}: tile body not opaque`);
}

try {
  await startChrome();
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) await pngAt(s);

  // brand sources
  put('build/brand/mark.svg', markSvg(INK, PURPLE));
  put('build/brand/mark-mono-black.svg', markSvg(INK, INK));
  put('build/brand/mark-mono-white.svg', markSvg(WHITE, WHITE));
  put('docs/brand/mark.svg', markSvg(INK, PURPLE));
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) put(`build/brand/icon-${s}.svg`, iconSvg(cutFor(s)));
  put('assets/icons/favicon.svg', iconSvg(6));

  const checks = [];
  put('build/icon.png', png(1024)); checks.push(['build/icon.png', 1024]);
  put('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]));
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) { put(`build/icons/${s}x${s}.png`, png(s)); checks.push([`build/icons/${s}x${s}.png`, s]); }
  put('assets/icons/icon.png', png(512)); checks.push(['assets/icons/icon.png', 512]);
  for (const s of [16, 24, 32, 48, 64]) { put(`assets/icons/tray-${s}.png`, png(s)); checks.push([`assets/icons/tray-${s}.png`, s]); }
  checks.forEach(([f, s]) => verify(f, s));
  const ic = readFileSync(path.join(ROOT, 'build/icon.ico'));
  if (ic.readUInt16LE(4) !== 7) throw new Error('ico entry count');
  console.log(`OK: ${checks.length} icon PNGs verified (size, corner transparency, cut transparency), ICO with 7 entries.`);

  // README / GitHub brand images (need network for the Manrope web font; not shipped in the app)
  const light = await shot(lockupHtml(INK, PURPLE, INK, PURPLE), 1400, 400, { scale: 2, selector: '#lock', waitFonts: true });
  const dark = await shot(lockupHtml(WHITE, '#8B72FF', WHITE, '#8B72FF'), 1400, 400, { scale: 2, selector: '#lock', waitFonts: true });
  put('docs/brand/logo-light.png', light); put('docs/brand/logo-dark.png', dark);
  // social preview: dark lockup on ink (stronger contrast than the light variant on white)
  const social = await shot(lockupHtml(WHITE, '#8B72FF', WHITE, '#8B72FF', { height: 230, frame: [1280, 640] }).replace('background:transparent', `background:${INK}`), 1280, 640, { transparent: false, waitFonts: true });
  put('docs/brand/social-preview.png', social);
  for (const f of ['docs/brand/logo-light.png', 'docs/brand/logo-dark.png']) {
    const img = decodePng(readFileSync(path.join(ROOT, f)));
    if (img.alphaAt(0, 0) !== 0 || img.alphaAt(img.w - 1, img.h - 1) !== 0) throw new Error(f + ': background not transparent');
    if (img.h < 280 || img.h > 320) throw new Error(f + ': unexpected height ' + img.h);
    console.log(`OK: ${f} ${img.w}x${img.h}, transparent background`);
  }
  const sp = readFileSync(path.join(ROOT, 'docs/brand/social-preview.png')); // Chrome writes an opaque page as RGB (color type 2)
  if (sp.readUInt32BE(16) !== 1280 || sp.readUInt32BE(20) !== 640 || sp[25] !== 2) throw new Error('social-preview.png: wrong size or not opaque');
  console.log('OK: docs/brand/social-preview.png 1280x640, opaque ink background');
} finally {
  try { chrome?.kill(); } catch {}
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
}
