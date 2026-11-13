// Screenshots of the pen / handwriting feature (2.9.0), taken from the running app with content made through the app's own API.
//   CDP_PORT=9344 node tests/cdp.mjs tests/test-ink-shots.mjs [outdir]    -> ink-light.png, ink-dark.png
export default async function (b) {
  const ev = (c) => b.evaluate(c);
  await b.viewport(1440, 900);
  await b.goto();
  await ev(`localStorage.clear(); new Promise((r) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
  await b.reload();
  await ev(`T4.store.updateSettings({ theme: 'light' }); T4.settings.applyAppearance(); location.hash = '#/editor'; new Promise((r) => setTimeout(r, 600))`);
  await ev(`(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    await T4.editor.newDocument({ title: 'Circuit notes', html: '<h1>Circuit notes</h1><p>Sketch the voltage divider directly in the document. The handwriting canvas keeps every stroke as editable vector data, so it stays sharp at any zoom and is part of the PDF export.</p>' });
    for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await w(50);
    await w(200);
    if (!T4.ink.test.stroke) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/ed-ink-input.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    { const d = document.getElementById('ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild || d); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
    T4.ink.canvas.insert({ w: 1000, h: 360, bg: 'grid' });
    await w(150);
    const P = (a, o) => T4.ink.test.stroke(a, o);
    const line = (x1, y1, x2, y2, n = 14) => Array.from({ length: n + 1 }, (_, i) => ({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n, p: 0.35 + 0.4 * Math.sin(Math.PI * i / n) }));
    // pen: handwritten-looking title and a zig-zag resistor
    T4.ink.setTool('pen'); T4.ink.setToolOptions('pen', { c: '#1f3a8a', s: 4 });
    const wave = (x0, y0, x1, amp, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (x1 - x0) * i / n, y: y0 + amp * Math.sin(i / n * 14) * (i % 2 ? 1 : 0.8), p: 0.5 }));
    P(wave(60, 70, 420, 14, 60), { pointerType: 'pen' });
    P(wave(60, 110, 300, 8, 40), { pointerType: 'pen' });
    P(line(140, 260, 330, 260), { pointerType: 'pen' });
    P(line(330, 260, 350, 230, 4), { pointerType: 'pen' });
    P(line(350, 230, 370, 290, 4), { pointerType: 'pen' });
    P(line(370, 290, 390, 230, 4), { pointerType: 'pen' });
    P(line(390, 230, 410, 290, 4), { pointerType: 'pen' });
    P(line(410, 290, 430, 260, 4), { pointerType: 'pen' });
    P(line(430, 260, 640, 260), { pointerType: 'pen' });
    // highlighter
    T4.ink.setTool('hl'); T4.ink.setToolOptions('hl', { c: '#fde047' });
    P(line(50, 62, 440, 62, 20), { pointerType: 'mouse' });
    // shapes
    T4.ink.setTool('shape');
    T4.ink.setToolOptions('shape', { kind: 'rect', c: '#b91c1c', s: 4 });
    P([{ x: 540, y: 60 }, { x: 900, y: 170 }], { pointerType: 'mouse' });
    T4.ink.setToolOptions('shape', { kind: 'ellipse', c: '#047857', s: 4 });
    P([{ x: 700, y: 215 }, { x: 860, y: 320 }], { pointerType: 'mouse' });
    T4.ink.setToolOptions('shape', { kind: 'arrow', c: '#b91c1c', s: 4 });
    P([{ x: 660, y: 270 }, { x: 540, y: 175 }], { pointerType: 'mouse' });
    T4.ink.setTool('pen');
    await w(300);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    return true;
  })()`);
  await b.sleep(400);
  await b.shot('ink-light', false);
  await ev(`T4.store.updateSettings({ theme: 'dark' }); T4.settings.applyAppearance(); document.querySelectorAll('.toast').forEach((t) => t.remove()); true`);
  await b.sleep(400);
  await b.shot('ink-dark', false);
  await ev(`T4.store.updateSettings({ theme: 'light' }); T4.settings.applyAppearance(); true`);
  console.log('page errors:', b.errors.length, b.errors.slice(0, 3).join(' | '));
}
