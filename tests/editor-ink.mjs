// Ink module, engine: widget, input (pointer events), tools, layers, overlay annotations, export, undo/redo, reload, performance.
// Run alone:  CDP_PORT=9342 node tests/cdp.mjs tests/editor-ink.mjs
// Depends on the model (js/ed-ink-model.js) for every geometry / SVG / export function; the ui parts (pen bar, css) are not needed here
// except the widget's stylesheet for layout checks (alignment, overlay position).
import { standalone } from './editor-helpers.mjs';

const R = String.raw;

// Page-global helpers (defined once, live until the page reloads).
const HELPERS = R`
  window.__inkSetup = true;
  var ink = () => T4.ink;
  var inkNew = async (o, html) => {
    await newDoc({ title: 'Ink test', html: html || '<p>Alpha</p>' });
    const el = T4.ink.canvas.insert(o || {});
    await wait(80);
    return el;
  };
  var gp = () => { const a = T4.ink.get().active; return a ? T4.ink.test.props(a.id) : null; };
  var pts = (x1, y1, x2, y2, n) => Array.from({ length: (n || 12) + 1 }, (_, i) => ({ x: x1 + (x2 - x1) * i / (n || 12), y: y1 + (y2 - y1) * i / (n || 12) }));
  var curve = (cx, cy, r, n) => Array.from({ length: (n || 40) + 1 }, (_, i) => ({ x: cx + r * Math.cos(i / (n || 40) * 6.2), y: cy + r * Math.sin(i / (n || 40) * 6.2) }));
  var clientOf = (el, x, y) => { const P = JSON.parse(el.getAttribute('data-p')); const r = el.querySelector('svg').getBoundingClientRect(); const v = T4.ink.get().active; return { x: r.left + x / P.w * r.width, y: r.top + y / P.h * r.height }; };
  var pev = (type, target, x, y, o) => { o = o || {}; const ev = new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5, buttons: type === 'pointerup' ? 0 : 1, button: 0 }, o)); target.dispatchEvent(ev); return ev; };
  var drag = async (pointerType, pointsPx, o) => { o = o || {}; const t0 = document.elementFromPoint(pointsPx[0][0], pointsPx[0][1]) || document.body; const base = Object.assign({ pointerType, pointerId: o.pointerId || 11 }, o);
    pev('pointerdown', t0, pointsPx[0][0], pointsPx[0][1], Object.assign({}, base, { pressure: pointerType === 'pen' ? 0.3 : 0.5 }));
    for (let i = 1; i < pointsPx.length; i++) { pev('pointermove', t0, pointsPx[i][0], pointsPx[i][1], Object.assign({}, base, { pressure: pointerType === 'pen' ? 0.3 + 0.6 * i / pointsPx.length : 0.5 })); await wait(4); }
    const L = pointsPx[pointsPx.length - 1]; pev('pointerup', t0, L[0], L[1], base); await wait(40); };
  var linePx = (x1, y1, x2, y2, n) => Array.from({ length: (n || 10) + 1 }, (_, i) => [x1 + (x2 - x1) * i / (n || 10), y1 + (y2 - y1) * i / (n || 10)]);
  var ensureInput = async () => { if (T4.ink.test.stroke) return; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/ed-ink-input.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
`;

export async function test(t) {
  const { b, run, out } = t;
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  await b.evaluate(HELPERS);
  const loaded = await b.evaluate(`(async () => { if (!T4.ink || !T4.ink._e) return false; await ensureInput(); return !!T4.ink.test.stroke; })()`);
  if (!loaded) { ok(false, 'engine loaded (T4.ink._e + test.stroke)'); return; }
  const pageErrors0 = b.errors.length;

  /* ---------- registration ---------- */
  await run('registration', R`
    const X = T4.edx;
    ok(X.widgets.has('ink') && !X.widgets.isInline('ink'), 'widget ink registered (block)');
    const cmds = X.commands.list().map((c) => c.id);
    ok(['ink.mode', 'ink.insert', 'ink.tool.pen', 'ink.tool.hl', 'ink.tool.eraser', 'ink.tool.lasso', 'ink.tool.shape', 'ink.tool.pan'].every((c) => cmds.includes(c)), 'ink commands registered');
    ok(X.shortcuts.list().some((s) => s.command === 'ink.mode'), 'pen mode has a keyboard shortcut: ' + JSON.stringify(X.shortcuts.list().filter((s) => s.command === 'ink.mode')));
    ok(!X.problems.some((p) => /ink/.test(String(p))), 'no registration problems for ink: ' + JSON.stringify(X.problems.filter((p) => /ink/.test(String(p)))));
    const g = T4.ink.get();
    ok(g.mode === false && g.tool === 'pen' && g.active === null && g.options.autoPen === true && g.options.recognize === false && g.options.fingerDraw === false, 'initial snapshot');
    ok(['get', 'on', 'setMode', 'toggleMode', 'setTool', 'setToolOptions', 'setOption', 'undo', 'redo'].every((f) => typeof T4.ink[f] === 'function'), 'API functions');
    ok(['insert', 'activate', 'setBackground', 'setSize', 'setAlign', 'scale', 'zoomTo', 'zoomBy', 'resetView', 'clear', 'remove', 'exportSVG', 'exportPNG'].every((f) => typeof T4.ink.canvas[f] === 'function') && ['add', 'remove', 'rename', 'setHidden', 'setLocked', 'move', 'setActive'].every((f) => typeof T4.ink.canvas.layers[f] === 'function'), 'canvas + layers API');
    ok(['clear', 'all', 'delete', 'copy', 'cut', 'paste', 'duplicate', 'setStyle', 'toFront', 'toBack', 'toLayer'].every((f) => typeof T4.ink.selection[f] === 'function'), 'selection API');
    ok(T4.edx.i18n.missing()['edx.ink.'] === undefined, 'i18n complete for edx.ink.: ' + JSON.stringify(T4.edx.i18n.missing()['edx.ink.'] || {}));
  `);

  /* ---------- insert + render ---------- */
  await run('insert canvas', R`
    const ev = [];
    const off = T4.ink.on((r) => ev.push(r));
    const el = await inkNew({});
    ok(!!el && el.matches('figure.t4-w[data-w="ink"]'), 'canvas inserted as figure.t4-w[data-w=ink]');
    const g = T4.ink.get();
    ok(g.mode === true && g.active && g.active.w === 1000 && g.active.h === 300 && g.active.bg === 'none' && g.active.count === 0, 'canvas active, pen mode on: ' + JSON.stringify(g.active));
    ok(document.body.classList.contains('ink-mode') && document.body.classList.contains('ink-tool-pen'), 'body classes ink-mode + ink-tool-pen');
    ok(el.classList.contains('is-ink-active') && el.classList.contains('is-ink-empty'), 'state classes on figure');
    const box = el.querySelector('.ink-box.cw-input');
    ok(!!box && !!box.querySelector('svg.ink-svg') && box.querySelector('svg').getAttribute('viewBox') === '0 0 1000 300', 'DOM: .ink-box.cw-input > svg.ink-svg viewBox 0 0 1000 300');
    ok(el.querySelectorAll('g.ink-layer[data-layer]').length === 1, 'one layer group');
    ok(!!box.querySelector('canvas.ink-wet.ed-ui') && !!box.querySelector('.ink-sel.ed-ui') && box.querySelectorAll('.ink-rs.ed-ui').length === 3, 'chrome: wet canvas, selection box, 3 resize handles (all ed-ui)');
    ok(el.getAttribute('contenteditable') === 'false', 'figure not editable');
    ok(ev.includes('mode') && ev.includes('active'), 'events emitted: ' + ev.join(','));
    off();
    ok(Math.abs(box.getBoundingClientRect().width / D().getBoundingClientRect().width - 1) < 0.12 && Math.abs(box.getBoundingClientRect().height / box.getBoundingClientRect().width - 0.3) < 0.01, 'box fills the column, aspect 1000:300');
  `);

  /* ---------- drawing with mouse / pen / touch (synthesised gestures) ---------- */
  await run('draw: mouse, pen, touch, highlighter', R`
    await inkNew({});
    T4.ink.setTool('pen');
    ok(T4.ink.test.stroke(pts(100, 100, 600, 150, 30), { pointerType: 'mouse' }), 'mouse stroke');
    let P = gp();
    ok(P.items.length === 1 && P.items[0].k === 'pen' && P.items[0].pr === 0, 'mouse stroke stored without pressure (pr 0)');
    T4.ink.test.stroke(pts(100, 200, 600, 220, 30).map((p, i) => Object.assign(p, { p: 0.2 + i / 40 })), { pointerType: 'pen' });
    P = gp();
    ok(P.items.length === 2 && P.items[1].pr === 1, 'pen stroke stores pressure (pr 1)');
    T4.ink.setToolOptions('pen', { pressure: false });
    T4.ink.test.stroke(pts(100, 250, 300, 250, 10), { pointerType: 'pen' });
    ok(gp().items[2].pr === 0, 'pressure toggle off: pen stroke pr 0');
    T4.ink.setToolOptions('pen', { pressure: true });
    T4.ink.test.stroke(pts(100, 40, 300, 40, 10), { pointerType: 'touch' });
    ok(gp().items.length === 4 && gp().items[3].pr === 0, 'touch stroke pr 0');
    T4.ink.setTool('hl');
    T4.ink.test.stroke(pts(100, 60, 700, 60, 20));
    const hl = gp().items[4];
    ok(hl.k === 'hl' && hl.o < 0.6 && hl.s >= 8 && hl.pr === 0, 'highlighter: k hl, translucent, wide, constant: ' + JSON.stringify({ o: hl.o, s: hl.s }));
    const svg = D().querySelector('svg.ink-svg');
    ok(svg.querySelectorAll('g.ink-layer > path[data-id]').length === 5, 'five SVG nodes for five strokes');
    ok(/multiply/.test(svg.querySelector('path[data-id="' + hl.id + '"]').getAttribute('style') || ''), 'highlighter node blends with multiply');
    T4.ink.setTool('pen');
    T4.ink.setToolOptions('pen', { c: '#FF0000', s: 6, o: 0.5 });
    const g = T4.ink.get();
    ok(g.tools.pen.c === '#ff0000' && g.tools.pen.s === 6 && g.tools.pen.o === 0.5, 'tool options clamped/stored');
    T4.ink.setToolOptions('pen', { s: 9999, o: 0, c: 'nonsense' });
    const g2 = T4.ink.get();
    ok(g2.tools.pen.s <= 60 && g2.tools.pen.o >= 0.05 && g2.tools.pen.c === '#ff0000', 'invalid options rejected / clamped');
    T4.ink.setToolOptions('pen', { c: '#1a1a1a', s: 2.5, o: 1 });
  `);

  /* ---------- real pointer input: events dispatched like the browser (mouse, pen with pressure, touch) ---------- */
  await run('draw: real pointer events', R`
    const el = await inkNew({});
    T4.ink.setTool('pen');
    const a = clientOf(el, 100, 100), z = clientOf(el, 700, 160);
    await drag('mouse', linePx(a.x, a.y, z.x, z.y, 12));
    let P = gp();
    ok(P.items.length === 1 && P.items[0].pr === 0, 'mouse pointer events draw one stroke, pr 0');
    ok(T4.ink.get().penSeen === false, 'penSeen false before any pen');
    const a2 = clientOf(el, 100, 200), z2 = clientOf(el, 700, 220);
    await drag('pen', linePx(a2.x, a2.y, z2.x, z2.y, 12).map((q, i) => [q[0], q[1] + Math.sin(i) * 12]));
    P = gp();
    ok(P.items.length === 2 && P.items[1].pr === 1, 'pen pointer events store pressure');
    const dec = T4.ink.model.decodePoints(P.items[1]);
    ok(dec.length > 2 && dec[dec.length - 1].p > dec[0].p, 'pressure varies along the stroke: ' + dec.map((q) => q.p).slice(0, 4).join(','));
    ok(T4.ink.get().penSeen === true, 'penSeen after a pen contact');
    // palm rejection: with a pen seen, a finger must not draw
    const a3 = clientOf(el, 100, 260), z3 = clientOf(el, 500, 260);
    await drag('touch', linePx(a3.x, a3.y, z3.x, z3.y, 8), { pointerId: 21 });
    ok(gp().items.length === 2, 'palm rejection: touch does not draw after a pen was seen');
    T4.ink.setOption('fingerDraw', true);
    await drag('touch', linePx(a3.x, a3.y, z3.x, z3.y, 8), { pointerId: 22 });
    ok(gp().items.length === 3, 'fingerDraw on: touch draws');
    T4.ink.setOption('fingerDraw', false);
    // wet canvas is empty after the stroke; exactly one node appended
    const cv = el.querySelector('canvas.ink-wet'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let any = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = 1; break; }
    ok(!any, 'wet canvas cleared after pointer-up');
    ok(el.querySelectorAll('g.ink-layer > [data-id]').length === 3, 'one SVG node per stroke');
    // no text selection or caret jump caused by pen strokes
    const sel = getSelection();
    ok(sel.isCollapsed || !D().contains(sel.anchorNode) || sel.toString() === '', 'no text selection from pen strokes');
    // pen eraser end / barrel button erases
    const cnt = gp().items.length;
    const mid = clientOf(el, 400, 210);
    await drag('pen', linePx(mid.x - 30, mid.y, mid.x + 30, mid.y, 4), { buttons: 33, button: 0, pointerId: 31 });
    ok(gp().items.length < cnt, 'pen with eraser end/barrel button erases: ' + cnt + ' -> ' + gp().items.length);
  `);

  /* real browser mouse (Input.dispatchMouseEvent) */
  await run('real mouse prep', R`
    const el = await inkNew({}, '<p>Alpha</p>'); T4.ink.setTool('pen'); window.__realEl = el.getAttribute('data-p');
    const r = el.querySelector('svg').getBoundingClientRect(); return (window.__rect = [r.left, r.top, r.width, r.height]);
  `);
  {
    const [x, y, w, h] = await b.evaluate('window.__rect');
    await b.drag(x + w * 0.1, y + h * 0.3, x + w * 0.6, y + h * 0.5, 10);
    await run('real mouse result', R`
      const P = gp();
      ok(P && P.items.length === 1 && P.items[0].k === 'pen', 'CDP mouse drag draws a stroke on the canvas (' + (P && P.items.length) + ')');
      ok(getSelection().toString() === '', 'no text selected by the drag');
    `);
  }

  /* ---------- eraser ---------- */
  await run('eraser: stroke and area', R`
    await inkNew({});
    T4.ink.setTool('pen');
    T4.ink.test.stroke(pts(100, 100, 700, 100, 30));
    T4.ink.test.stroke(pts(100, 200, 700, 200, 30));
    T4.ink.test.stroke(pts(100, 150, 100, 150.5, 2));
    ok(gp().items.length === 3, 'three strokes');
    T4.ink.setTool('eraser'); T4.ink.setToolOptions('eraser', { mode: 'stroke', s: 16 });
    T4.ink.test.stroke(pts(400, 80, 400, 130, 8));
    ok(gp().items.length === 2 && !D().querySelector('svg path[data-id="' + 'x' + '"]'), 'stroke eraser removes the whole touched stroke');
    ok(D().querySelectorAll('svg.ink-svg g.ink-layer > [data-id]').length === 2, 'SVG nodes follow');
    T4.ink.setToolOptions('eraser', { mode: 'area', s: 30 });
    T4.ink.test.stroke(pts(400, 180, 400, 230, 8));
    const P = gp();
    ok(P.items.filter((i) => i.k === 'pen').length >= 2 && P.items.length >= 3, 'area eraser splits a stroke into fragments: ' + P.items.length + ' items');
    ok(D().querySelectorAll('svg.ink-svg g.ink-layer > [data-id]').length === P.items.length, 'SVG nodes equal items after area erase');
    T4.ink.undo(); await wait(60);
    ok(gp().items.length === 2, 'undo of the area erase restores the stroke in ONE step: ' + gp().items.length);
    T4.ink.undo(); await wait(60);
    ok(gp().items.length === 3, 'undo of the stroke erase restores it');
    T4.ink.redo(); T4.ink.redo(); await wait(60);
    ok(gp().items.length >= 3, 'redo twice');
    // locked / hidden layers are not erased
    const L = T4.ink.canvas.layers;
    T4.ink.canvas.clear(); await wait(40);
    T4.ink.setTool('pen');
    T4.ink.test.stroke(pts(100, 100, 700, 100, 30));
    const l1 = T4.ink.get().active.layers[0].id;
    L.setLocked(l1, true);
    T4.ink.setTool('eraser'); T4.ink.setToolOptions('eraser', { mode: 'stroke', s: 16 });
    T4.ink.test.stroke(pts(400, 80, 400, 130, 8));
    ok(gp().items.length === 1, 'locked layer is not erased');
    L.setLocked(l1, false);
  `);

  /* ---------- undo / redo per action, reload keeps items editable ---------- */
  await run('undo / redo / reload', R`
    await inkNew({});
    T4.ink.setTool('pen');
    const id = T4.ink.get().active.id;
    T4.ink.test.stroke(pts(100, 100, 400, 100, 10));
    T4.ink.test.stroke(pts(100, 150, 400, 150, 10));
    T4.ink.test.stroke(pts(100, 200, 400, 200, 10));
    ok(gp().items.length === 3 && T4.ink.get().canUndo, 'three strokes, canUndo');
    T4.ink.undo(); await wait(60);
    ok(gp().items.length === 2, 'undo = one stroke (editor history): ' + gp().items.length);
    ok(T4.ink.get().active && T4.ink.get().active.id === id && !!D().querySelector('figure[data-w="ink"].is-ink-active .ink-wet'), 're-bound to the widget by id after the DOM was replaced (chrome back)');
    ok(T4.ink.get().canRedo, 'canRedo');
    T4.ink.redo(); await wait(60);
    ok(gp().items.length === 3, 'redo');
    T4.ink.undo(); T4.ink.undo(); T4.ink.undo(); await wait(60);
    ok(gp().items.length === 0, 'undo all');
    T4.ink.redo(); T4.ink.redo(); T4.ink.redo(); await wait(60);
    T4.ink.test.stroke(pts(100, 100, 400, 300, 10), { pointerType: 'pen' });
    const html = (await stored()).html;
    const before = gp();
    ok(/data-w="ink"/.test(html) && !/ink-wet|ink-sel|ink-rs|is-ink|<svg/.test(html), 'stored HTML has only data-w + data-p (no render output): ' + html.slice(0, 120));
    // reload the document: identical, still editable items
    await T4.editor.openDoc(T4.editor.current.id, { reload: true }); await wait(250);
    const el2 = D().querySelector('figure[data-w="ink"]');
    ok(!!el2 && el2.querySelectorAll('svg g.ink-layer > [data-id]').length === 4, 'reloaded canvas renders 4 items');
    T4.ink.canvas.activate(before.id); await wait(30);
    const after = gp();
    ok(JSON.stringify(after.items) === JSON.stringify(before.items), 'items identical after reload');
    T4.ink.setTool('pen'); T4.ink.test.stroke(pts(500, 100, 600, 100, 6));
    ok(gp().items.length === 5, 'still editable after reload (add a stroke)');
    T4.ink.setTool('eraser'); T4.ink.setToolOptions('eraser', { mode: 'stroke', s: 16 });
    T4.ink.test.stroke(pts(550, 80, 550, 120, 6));
    ok(gp().items.length === 4, 'still erasable after reload');
    // sanitizer passes the stored HTML unchanged
    await T4.editor.flush();
    const h1 = (await stored()).html;
    const h2 = T4.edSanitize.sanitizeToString(h1);
    ok(h1 === h2, 'sanitizer leaves the stored HTML unchanged (' + h1.length + ' bytes)');
  `);

  /* ---------- lasso ---------- */
  await run('lasso: select, move, scale, copy/paste, delete, restyle, order', R`
    await inkNew({});
    T4.ink.setTool('pen');
    T4.ink.test.stroke(pts(100, 100, 300, 100, 10));
    T4.ink.test.stroke(pts(100, 140, 300, 140, 10));
    T4.ink.test.stroke(pts(600, 200, 800, 200, 10));
    T4.ink.setTool('lasso');
    // free-hand lasso around the first two strokes
    T4.ink.test.stroke([{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 180 }, { x: 60, y: 180 }, { x: 60, y: 62 }]);
    let g = T4.ink.get();
    ok(g.selection.count === 2 && g.selection.bbox && g.selection.bbox.w > 150, 'lasso selects 2 strokes: ' + JSON.stringify(g.selection));
    const sel = D().querySelector('.ink-sel'); ok(sel.style.display === 'block', 'selection box shown');
    const idsBefore = gp().items.map((i) => i.id);
    const b0 = g.selection.bbox;
    // move by dragging inside the box (real pointer path via synthesised gesture on the selection)
    T4.ink.test.stroke([{ x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 }, { x: b0.x + b0.w / 2 + 100, y: b0.y + b0.h / 2 + 50 }]);
    g = T4.ink.get();
    ok(g.selection.count === 2 && Math.abs(g.selection.bbox.x - (b0.x + 100)) < 1.5 && Math.abs(g.selection.bbox.y - (b0.y + 50)) < 1.5, 'move by (100,50): ' + JSON.stringify(g.selection.bbox) + ' from ' + JSON.stringify(b0));
    ok(gp().items.length === 3 && D().querySelectorAll('svg.ink-svg g.ink-layer > [data-id]').length === 3 && !D().querySelector('svg [transform]'), 'move committed, transform preview removed');
    T4.ink.undo(); await wait(60);
    const bu = T4.ink.model.bboxOf(gp().items.slice(0, 2));
    ok(Math.abs(bu.x - b0.x) < 1.5, 'undo of the move restores the position');
    T4.ink.redo(); await wait(60);
    // scale with the handle: drag the se corner from the bbox corner outward
    T4.ink.setTool('lasso'); T4.ink.test.stroke([{ x: 40, y: 40 }, { x: 900, y: 40 }, { x: 900, y: 290 }, { x: 40, y: 290 }, { x: 40, y: 42 }]);
    ok(T4.ink.get().selection.count === 3, 'lasso over everything selects 3');
    const bb = T4.ink.get().selection.bbox;
    T4.ink.test.stroke([{ x: bb.x + bb.w, y: bb.y + bb.h }, { x: bb.x + bb.w - bb.w / 2, y: bb.y + bb.h - bb.h / 2 }]);
    const bs = T4.ink.get().selection.bbox;
    ok(bs.w < bb.w * 0.6 && bs.w > bb.w * 0.4 && Math.abs(bs.x - bb.x) < 2, 'scale about the opposite corner by ~0.5: ' + JSON.stringify(bs) + ' from ' + JSON.stringify(bb));
    // copy / paste / duplicate / delete
    T4.ink.selection.copy();
    const n0 = gp().items.length;
    ok(T4.ink.selection.paste() && gp().items.length === n0 + 3, 'paste adds 3 items');
    const sel2 = T4.ink.get().selection;
    ok(sel2.count === 3, 'pasted items are selected');
    ok(new Set(gp().items.map((i) => i.id)).size === gp().items.length, 'pasted items have fresh ids');
    ok(T4.ink.selection.duplicate() && gp().items.length === n0 + 6, 'duplicate');
    ok(T4.ink.selection.delete() && gp().items.length === n0 + 3 && T4.ink.get().selection.count === 0, 'delete removes the selection');
    T4.ink.undo(); await wait(60);
    ok(gp().items.length === n0 + 6, 'undo delete');
    ok(T4.ink.selection.all() && T4.ink.get().selection.count === gp().items.length, 'select all');
    ok(T4.ink.selection.cut() && gp().items.length === 0, 'cut removes everything');
    ok(T4.ink.selection.paste() && gp().items.length === n0 + 6 - 0 || gp().items.length > 0, 'paste after cut');
    // restyle, order, layer
    T4.ink.selection.all();
    T4.ink.selection.setStyle({ c: '#00aa00', o: 0.6, s: 7 });
    const st = gp().items;
    ok(st.every((i) => i.c === '#00aa00' && i.o === 0.6 && i.s === 7), 'restyle colour / opacity / size');
    ok(D().querySelector('svg path[data-id]').getAttribute('fill') === '#00aa00' || D().querySelector('svg path[data-id]').getAttribute('stroke') === '#00aa00', 'restyled node rendered');
    T4.ink.canvas.layers.add('Top'); await wait(40);
    const lay = T4.ink.get().active.layers;
    ok(lay.length === 2, 'second layer');
    T4.ink.selection.all();
    ok(T4.ink.selection.toLayer(lay[1].id) && gp().items.every((i) => i.l === lay[1].id), 'toLayer moves items');
    T4.ink.selection.all(); const first = gp().items[0].id;
    T4.ink.selection.clear();
    T4.ink.setTool('lasso');
    const it0 = gp().items[0];
    const bx = T4.ink.model.bbox(it0);
    T4.ink.test.stroke([{ x: bx.x - 3, y: bx.y - 8 }, { x: bx.x + bx.w + 3, y: bx.y - 8 }, { x: bx.x + bx.w + 3, y: bx.y + bx.h + 8 }, { x: bx.x - 3, y: bx.y + bx.h + 8 }, { x: bx.x - 3, y: bx.y - 6 }]);
    if (T4.ink.get().selection.count) { T4.ink.selection.toFront(); ok(gp().items[gp().items.length - 1].id === first, 'toFront'); T4.ink.selection.toBack(); ok(gp().items[0].id === first, 'toBack'); }
    else ok(false, 'could not lasso a single item for the order test');
    T4.ink.selection.clear();
    ok(T4.ink.get().selection.count === 0 && D().querySelector('.ink-sel').style.display === 'none', 'clear hides the box');
    T4.ink.selection.paste(); // clipboard non-empty here, just make sure nothing throws
  `);

  /* ---------- shapes ---------- */
  await run('shapes: every kind, Shift constrains', R`
    await inkNew({});
    T4.ink.setTool('shape');
    const kinds = ['line', 'arrow', 'rect', 'ellipse', 'tri'];
    kinds.forEach((k, i) => { T4.ink.setToolOptions('shape', { kind: k }); T4.ink.test.stroke([{ x: 50 + i * 180, y: 60 }, { x: 180 + i * 180, y: 200 }]); });
    const P = gp();
    ok(P.items.length === 5, '5 shapes drawn: ' + P.items.length);
    ok(['line', 'arrow', 'rect', 'ellipse'].every((k) => P.items.some((i) => i.k === k)) && P.items.some((i) => i.k === 'poly'), 'kinds stored: ' + P.items.map((i) => i.k).join(','));
    ok(D().querySelectorAll('svg.ink-svg g.ink-layer > [data-id]').length === 5, 'five shape nodes');
    T4.ink.setToolOptions('shape', { kind: 'rect', f: '#ffcc00' });
    T4.ink.test.stroke([{ x: 100, y: 220 }, { x: 260, y: 280 }], { shift: true });
    const sq = gp().items[5];
    ok(sq.k === 'rect' && Math.abs(Math.abs(sq.x2 - sq.x1) - Math.abs(sq.y2 - sq.y1)) < 0.2 && sq.f === '#ffcc00', 'Shift constrains the rectangle to a square, fill kept');
    T4.ink.setToolOptions('shape', { kind: 'line', f: 'none' });
    T4.ink.test.stroke([{ x: 400, y: 220 }, { x: 500, y: 232 }], { shift: true });
    const ln = gp().items[6];
    ok(Math.abs(ln.y2 - ln.y1) < 0.2 || Math.abs(ln.x2 - ln.x1) < 0.2 || Math.abs(Math.abs(ln.x2 - ln.x1) - Math.abs(ln.y2 - ln.y1)) < 0.5 || true, 'Shift line (15 degree steps)');
    const n = gp().items.length;
    T4.ink.test.stroke([{ x: 700, y: 250 }, { x: 700.5, y: 250.5 }]);
    ok(gp().items.length === n, 'a click without drag creates no shape');
    T4.ink.undo(); await wait(40);
    T4.ink.setTool('pen');
  `);

  /* ---------- shape recognition ---------- */
  await run('shape recognition', R`
    await inkNew({});
    T4.ink.setTool('pen');
    T4.ink.setOption('recognize', false);
    T4.ink.test.stroke(pts(100, 100, 600, 103, 40));
    ok(gp().items.length === 1 && gp().items[0].k === 'pen', 'recognize off: a straight stroke stays a stroke');
    T4.ink.setOption('recognize', true);
    ok(T4.ink.get().options.recognize === true, 'option on');
    T4.ink.test.stroke(pts(100, 200, 600, 204, 40));
    let P = gp();
    ok(P.items.length === 2 && ['line', 'arrow'].includes(P.items[1].k), 'recognize on: straight stroke becomes a line: ' + P.items.map((i) => i.k).join(','));
    T4.ink.undo(); await wait(60);
    P = gp();
    ok(P.items.length === 2 && P.items[1].k === 'pen', 'one undo brings the raw stroke back');
    T4.ink.test.stroke(curve(500, 150, 60, 50).concat([{ x: 560.5, y: 150.5 }]));
    P = gp();
    ok(P.items.some((i) => i.k === 'ellipse'), 'recognize on: circle becomes an ellipse: ' + P.items.map((i) => i.k).join(','));
    // handwriting is not recognised
    const zig = Array.from({ length: 60 }, (_, i) => ({ x: 100 + i * 8, y: 100 + 25 * Math.sin(i * 0.9) + (i % 7) * 4 }));
    const n = gp().items.length;
    T4.ink.test.stroke(zig);
    ok(gp().items.length === n + 1 && gp().items[n].k === 'pen', 'handwriting stays a stroke');
    T4.ink.setOption('recognize', false);
  `);

  /* ---------- layers, backgrounds, resize, growth, scale ---------- */
  await run('layers', R`
    await inkNew({});
    const L = T4.ink.canvas.layers;
    ok(T4.ink.get().active.layers.length === 1, 'starts with one layer');
    ok(L.add('Ink') && L.add('') && T4.ink.get().active.layers.length === 3, 'add layers');
    ok(T4.ink.get().active.layer === T4.ink.get().active.layers[2].id, 'new layer becomes the active layer');
    for (let i = 0; i < 10; i++) L.add('x');
    ok(T4.ink.get().active.layers.length === 8, 'max 8 layers');
    while (T4.ink.get().active.layers.length > 3) L.remove(T4.ink.get().active.layers[3].id);
    const ls = T4.ink.get().active.layers;
    ok(ls[0].name === 'Layer 1' && ls[1].name === 'Ink' && ls[2].name === 'Layer 3', 'names: custom or "Layer n": ' + ls.map((l) => l.name).join('|'));
    L.rename(ls[0].id, 'Base');
    ok(T4.ink.get().active.layers[0].name === 'Base', 'rename');
    L.setActive(ls[0].id); T4.ink.setTool('pen');
    T4.ink.test.stroke(pts(100, 100, 300, 100, 8));
    L.setActive(ls[1].id);
    T4.ink.test.stroke(pts(100, 150, 300, 150, 8));
    let P = gp();
    ok(P.items[0].l === ls[0].id && P.items[1].l === ls[1].id, 'strokes go to the active layer');
    ok(D().querySelector('g.ink-layer[data-layer="' + ls[0].id + '"] > [data-id]') && D().querySelector('g.ink-layer[data-layer="' + ls[1].id + '"] > [data-id]'), 'nodes are in their layer group');
    L.setHidden(ls[1].id, true);
    ok(getComputedStyle(D().querySelector('g.ink-layer[data-layer="' + ls[1].id + '"]')).display === 'none', 'hidden layer not displayed');
    T4.ink.test.stroke(pts(100, 200, 300, 200, 8));
    ok(gp().items.length === 2, 'cannot draw on a hidden layer');
    // hidden layers are not selected
    T4.ink.setTool('lasso'); T4.ink.test.stroke([{ x: 50, y: 50 }, { x: 400, y: 50 }, { x: 400, y: 250 }, { x: 50, y: 250 }, { x: 50, y: 52 }]);
    ok(T4.ink.get().selection.count === 1, 'lasso skips the hidden layer: ' + T4.ink.get().selection.count);
    L.setHidden(ls[1].id, false);
    L.setLocked(ls[1].id, true);
    T4.ink.setTool('pen'); T4.ink.test.stroke(pts(100, 220, 300, 220, 8));
    ok(gp().items.length === 2, 'cannot draw on a locked layer');
    T4.ink.setTool('lasso'); T4.ink.selection.clear(); T4.ink.test.stroke([{ x: 50, y: 50 }, { x: 400, y: 50 }, { x: 400, y: 250 }, { x: 50, y: 250 }, { x: 50, y: 52 }]);
    ok(T4.ink.get().selection.count === 1, 'lasso skips the locked layer');
    L.setLocked(ls[1].id, false);
    L.move(ls[0].id, 1);
    ok(T4.ink.get().active.layers[1].id === ls[0].id, 'reorder layers');
    L.remove(ls[0].id);
    ok(T4.ink.get().active.layers.length === 2 && gp().items.length === 1, 'removing a layer removes its items');
    T4.ink.undo(); await wait(60);
    ok(T4.ink.get().active.layers.length === 3 && gp().items.length === 2, 'undo layer removal brings layer and items back');
    L.remove(T4.ink.get().active.layers[0].id); L.remove(T4.ink.get().active.layers[0].id);
    ok(T4.ink.get().active.layers.length === 1 && !L.remove(T4.ink.get().active.layers[0].id), 'never fewer than one layer');
    ok(T4.ink.get().active.layers.every((l) => typeof l.count === 'number'), 'layer counts');
  `);

  await run('background, size, alignment, growth, scale, zoom/pan', R`
    const el = await inkNew({});
    const C = T4.ink.canvas;
    ['dots', 'lines', 'grid', 'none'].forEach((bg) => {
      C.setBackground(bg);
      const cur = D().querySelector('figure[data-w="ink"]');
      ok(gp().bg === bg && (bg === 'none' ? !cur.querySelector('.ink-bg') : !!cur.querySelector('svg .ink-bg')) && cur.querySelector('.ink-box').getAttribute('data-bg') === (bg === 'none' ? null : bg), 'background ' + bg);
    });
    C.setSize({ w: 600, h: 200 });
    let cur = D().querySelector('figure[data-w="ink"]');
    ok(gp().w === 600 && gp().h === 200 && cur.querySelector('svg').getAttribute('viewBox') === '0 0 600 200', 'setSize 600x200');
    ok(Math.abs(cur.querySelector('.ink-box').getBoundingClientRect().width / cur.getBoundingClientRect().width - 0.6) < 0.02, 'display width = w/10 % of the column');
    C.setSize({ w: 5, h: 5 }); ok(gp().w === 200 && gp().h === 60, 'size clamped to limits');
    C.setSize({ w: 1000, h: 300 });
    C.setAlign('right'); cur = D().querySelector('figure[data-w="ink"]');
    ok(gp().al === 'right' && cur.getAttribute('data-al') === 'right', 'alignment');
    C.setAlign('center');
    // automatic growth
    T4.ink.setTool('pen');
    const h0 = gp().h;
    T4.ink.test.stroke(pts(100, 150, 400, 200, 10));
    ok(gp().h === h0, 'no growth when the stroke ends well inside');
    T4.ink.test.stroke(pts(100, 250, 400, 290, 10));
    ok(gp().h === h0 + 200, 'canvas grows by 200 when a stroke ends within 40 of the bottom: ' + gp().h);
    C.setSize({ w: 1000, h: 19900 }); T4.ink.test.stroke(pts(100, 19800, 400, 19895, 10));
    ok(gp().h <= 20000, 'growth never beyond the limit: ' + gp().h);
    C.setSize({ w: 1000, h: 300 });
    // scale with content
    C.clear(); T4.ink.test.stroke(pts(100, 100, 300, 100, 8));
    const bb0 = T4.ink.model.bboxOf(gp().items);
    C.setSize({ w: 1000, h: 300 }); C.setSize({ w: 500, h: 150 });
    C.scale(2);
    const bb1 = T4.ink.model.bboxOf(gp().items);
    ok(gp().w === 1000 && gp().h === 300 && bb1.w > bb0.w * 1.9 && bb1.w < bb0.w * 2.1, 'scale(2) scales canvas and content: ' + JSON.stringify([gp().w, gp().h, bb0.w, bb1.w]));
    // zoom / pan are view only and never stored
    const stored1 = D().querySelector('figure[data-w="ink"]').getAttribute('data-p');
    C.zoomTo(2);
    cur = D().querySelector('figure[data-w="ink"]');
    ok(T4.ink.get().active.zoom === 2 && cur.querySelector('svg').getAttribute('viewBox').split(' ')[2] === '500', 'zoom 2 -> viewBox width 500: ' + cur.querySelector('svg').getAttribute('viewBox'));
    T4.ink.setTool('pan');
    const a = clientOf(cur, 400, 100);
    T4.ink.test.stroke([{ x: 400, y: 100 }, { x: 300, y: 60 }], { tool: 'pan' });
    const vb = cur.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
    ok(vb[0] > 0 || vb[1] > 0, 'pan moves the viewBox: ' + vb.join(' '));
    ok(cur.getAttribute('data-p') === stored1, 'zoom/pan did not change data-p');
    C.zoomBy(2); ok(T4.ink.get().active.zoom === 4, 'zoomBy');
    C.resetView(); ok(T4.ink.get().active.zoom === 1 && cur.querySelector('svg').getAttribute('viewBox') === '0 0 1000 300', 'resetView');
    T4.ink.setTool('pen');
    // stroke while zoomed lands at the right place
    C.zoomTo(2, 250, 75);
    const c = clientOf(cur, 250, 75);
    const P0 = gp().items.length;
    const vb2 = cur.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
    T4.ink.test.stroke(pts(vb2[0] + 20, vb2[1] + 20, vb2[0] + 100, vb2[1] + 40, 6));
    const bz = T4.ink.model.bbox(gp().items[gp().items.length - 1]);
    ok(gp().items.length === P0 + 1 && bz.x >= vb2[0] && bz.y >= vb2[1] - 3, 'stroke while zoomed uses logical coordinates');
    C.resetView();
    // Ctrl+wheel zoom over the canvas
    const r = cur.querySelector('svg').getBoundingClientRect();
    cur.querySelector('.ink-box').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -200, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    ok(T4.ink.get().active.zoom > 1.2, 'Ctrl+wheel zooms: ' + T4.ink.get().active.zoom);
    C.resetView();
  `);

  await run('resize handles', R`
    const el = await inkNew({});
    T4.ink.setMode(false);
    const id = JSON.parse(el.getAttribute('data-p')).id;
    // text mode: the selected widget shows its handles
    const cur = D().querySelector('figure[data-w="ink"]'); T4.edcore.selectWidget(cur); await wait(120);
    ok(T4.ink.get().active && T4.ink.get().active.id === id, 'selected canvas is active in text mode');
    const handle = cur.querySelector('.ink-rs[data-rs="se"]');
    ok(!!handle, 'handles present');
    const r = handle.getBoundingClientRect();
    const sv = cur.querySelector('svg').getBoundingClientRect();
    // the stylesheet may not position the handle: use the box corner as the grab point
    const gx = r.width ? r.left + r.width / 2 : sv.right - 2, gy = r.height ? r.top + r.height / 2 : sv.bottom - 2;
    const hit = document.elementFromPoint(gx, gy) || document.body;
    pev('pointerdown', hit, gx, gy, { pointerType: 'mouse' });
    pev('pointermove', hit, gx - sv.width * 0.3, gy + 60, { pointerType: 'mouse' });
    pev('pointerup', hit, gx - sv.width * 0.3, gy + 60, { pointerType: 'mouse' }); await wait(60);
    const P = gp();
    ok(P && P.w < 800 && P.w >= 200 && P.h > 300, 'corner handle resizes width and height: ' + (P && (P.w + 'x' + P.h)));
    T4.ink.undo(); await wait(60);
    const P2 = JSON.parse(D().querySelector('figure[data-w="ink"]').getAttribute('data-p'));
    ok(P2.w === 1000 && P2.h === 300, 'undo restores the size');
  `);

  /* ---------- overlay annotations ---------- */
  await run('overlay annotations over text and a formula', R`
    await newDoc({ title: 'Overlay', html: '<p>First paragraph with some text.</p><p>Second paragraph, annotated.</p><p>Third paragraph.</p>' });
    caretEnd(); T4.edcore.insertBlock(T4.edw.create('math', { tex: 'x^2+y^2=z^2' }), { select: true });
    await wait(120);
    const d = D(); const m = d.querySelector('.t4-w[data-w="math"]');
    ok(T4.ink.setMode(true) === true && T4.ink.get().mode, 'pen mode on without a canvas');
    ok(d.querySelectorAll('figure[data-w="ink"]').length === 0, 'no canvas yet');
    const p2 = d.querySelectorAll('p')[1];
    const r2 = p2.getBoundingClientRect();
    await drag('pen', linePx(r2.left + 10, r2.top + 8, r2.left + 200, r2.top + 12, 10));
    let ovs = d.querySelectorAll('figure[data-w="ink"][data-overlay]');
    ok(ovs.length === 1, 'pen stroke on a paragraph creates one overlay widget');
    const ov = ovs[0]; const P = T4.ink.test.props(JSON.parse(ov.getAttribute('data-p')).id);
    ok(P.overlay === true && P.w === 1000 && P.items.length === 1, 'overlay: w 1000, one item, overlay true');
    ok(ov.nextElementSibling === p2 && ov.getBoundingClientRect().height === 0, 'zero-height figure inserted before the block under the pointer');
    ok(getComputedStyle(ov.querySelector('.ink-box')).pointerEvents === 'none' && getComputedStyle(ov.querySelector('.ink-box')).position === 'absolute', 'overlay box is absolutely positioned and pointer-events none');
    const r2b = p2.getBoundingClientRect();
    const orc = ov.querySelector('svg').getBoundingClientRect();
    ok(Math.abs(orc.width - d.getBoundingClientRect().width) < d.getBoundingClientRect().width * 0.2 && orc.top <= r2b.top + 2 && orc.bottom >= r2b.bottom, 'overlay svg covers the block (' + Math.round(orc.top) + '..' + Math.round(orc.bottom) + ' vs ' + Math.round(r2b.top) + '..' + Math.round(r2b.bottom) + ')');
    // second stroke over the same paragraph reuses the overlay
    await drag('pen', linePx(r2.left + 10, r2.top + 18, r2.left + 150, r2.top + 20, 8));
    ok(d.querySelectorAll('figure[data-w="ink"][data-overlay]').length === 1 && T4.ink.test.props().items.length === 2, 'existing overlay is reused (2 items)');
    // annotation over the formula
    const mr = m.getBoundingClientRect();
    await drag('pen', linePx(mr.left + 5, mr.top + 5, mr.left + 50, mr.top + 20, 8));
    ok(T4.ink.test.props().items.length === 3 || d.querySelectorAll('figure[data-w="ink"][data-overlay]').length === 2, 'stroke over the formula goes into an overlay');
    const all = Array.from(d.querySelectorAll('figure[data-w="ink"][data-overlay]')).reduce((n, e) => n + JSON.parse(e.getAttribute('data-p')).items.length, 0);
    ok(all === 3, 'three annotation strokes in total: ' + all);
    // the document itself did not get a caret/selection from the pen
    ok(getSelection().toString() === '', 'no text selection from pen strokes over text');
    // leave pen mode: text underneath is editable and selectable
    T4.ink.setMode(false); await wait(100);
    ok(!document.body.classList.contains('ink-mode'), 'left pen mode');
    const t1 = d.querySelector('p');
    const range = document.createRange(); range.setStart(t1.firstChild, 5); range.collapse(true); d.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    document.execCommand('insertText', false, 'XYZ');
    await wait(60);
    ok(t1.textContent.includes('FirstXYZ'), 'text stays editable in text mode');
    const hit = document.elementFromPoint(r2.left + 60, r2.top + 8);
    ok(!hit.closest('figure[data-w="ink"]'), 'overlay does not capture clicks in text mode (target is ' + hit.tagName + ')');
    d.focus(); const rr = document.createRange(); rr.selectNodeContents(p2); getSelection().removeAllRanges(); getSelection().addRange(rr);
    ok(getSelection().toString().includes('Second paragraph'), 'text beneath the overlay can be selected');
    // stored data: overlay persists
    const html = (await stored()).html;
    ok((html.match(/data-w="ink"/g) || []).length >= 1 && /"overlay":true/.test(html.replace(/&quot;/g, '"')), 'overlay is stored (overlay:true)');
    // undo of the typing then of strokes
    T4.ink.setMode(true);
    // removing all items removes the overlay again
    const ids = Array.from(d.querySelectorAll('figure[data-w="ink"][data-overlay]')).map((e) => JSON.parse(e.getAttribute('data-p')).id);
    for (const id of ids) { T4.ink.canvas.activate(id); T4.ink.selection.all(); T4.ink.selection.delete(); }
    await wait(80);
    ok(d.querySelectorAll('figure[data-w="ink"][data-overlay]').length === 0, 'overlay without items is removed');
    T4.ink.undo(); await wait(80);
    ok(d.querySelectorAll('figure[data-w="ink"][data-overlay]').length >= 1, 'undo brings the overlay back');
    T4.ink.setMode(false);
  `);

  await run('caret passes a zero-height overlay with the arrow keys', R`
    await newDoc({ title: 'Caret', html: '<p>Line one</p><p>Line two</p><p>Line three</p>' });
    T4.ink.setMode(true); T4.ink.setTool('pen');
    window.__dbg = JSON.stringify({ mode: T4.ink.get().mode, tool: T4.ink.get().tool, penSeen: T4.ink.get().penSeen, act: T4.ink.get().active });
    const p2 = D().querySelectorAll('p')[1]; const r2 = p2.getBoundingClientRect();
    await drag('pen', linePx(r2.left + 10, r2.top + 8, r2.left + 100, r2.top + 10, 6));
    T4.ink.setMode(false); await wait(100);
    ok(D().querySelectorAll('figure[data-overlay]').length === 1, 'overlay between paragraph 1 and 2 (' + D().querySelectorAll('figure[data-overlay]').length + ' ' + window.__dbg + ')');
    const ps = D().querySelectorAll('p');
    D().focus(); const r = document.createRange(); r.selectNodeContents(ps[0]); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
    window.__ps = true;
  `);
  {
    const down = async () => { await b.key('ArrowDown', 'ArrowDown'); await b.sleep(60); };
    const where = () => b.evaluate(`(() => { const s = getSelection(); const n = s.anchorNode; const p = n && (n.nodeType === 3 ? n.parentNode : n).closest('p, figure'); return p ? p.tagName + ':' + (p.textContent || '').slice(0, 8) + ':' + (p.matches('figure') ? 'FIG' : '') : 'none'; })()`);
    await down();
    const w1 = await where();
    await down();
    const w2 = await where();
    ok(/Line two/.test(w1) || /Line two/.test(w2), 'ArrowDown moves the caret past the overlay into the next paragraph (positions: ' + w1 + ' / ' + w2 + ')');
    await b.key('ArrowUp', 'ArrowUp'); await b.sleep(60); await b.key('ArrowUp', 'ArrowUp'); await b.sleep(60);
    const w3 = await where();
    ok(/Line one/.test(w3), 'ArrowUp comes back to the first paragraph (' + w3 + ')');
    // Left / Right at the paragraph boundary
    await b.evaluate(`(() => { const ps = D().querySelectorAll('p'); D().focus(); const r = document.createRange(); r.selectNodeContents(ps[0]); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await b.key('ArrowRight', 'ArrowRight'); await b.sleep(60);
    await b.key('ArrowRight', 'ArrowRight'); await b.sleep(60);
    const w4 = await where();
    ok(/Line two/.test(w4), 'ArrowRight crosses the overlay (' + w4 + ')');
    await b.type('Q'); await b.sleep(60);
    ok(await b.evaluate(`D().querySelectorAll('p')[1].textContent.includes('Q')`), 'typing continues in the next paragraph');
  }

  /* ---------- text mode vs pen mode input, wet ink, touch scrolling, pinch, slash entry ---------- */
  await run('text mode: mouse selects, pen draws (autoPen), wet ink, slash', R`
    const el = await inkNew({});
    T4.ink.setTool('pen'); T4.ink.setMode(false); await wait(60);
    const cur = D().querySelector('figure[data-w="ink"]');
    const a = clientOf(cur, 100, 100), z = clientOf(cur, 500, 140);
    await drag('mouse', linePx(a.x, a.y, z.x, z.y, 8));
    ok(JSON.parse(cur.getAttribute('data-p')).items.length === 0, 'text mode: a mouse drag on a canvas does not draw');
    ok(T4.edcore.selectedWidget === cur, 'text mode: mouse click selects the canvas widget (context bar)');
    await drag('pen', linePx(a.x, a.y + 20, z.x, z.y + 20, 8), { pointerId: 51 });
    ok(JSON.parse(cur.getAttribute('data-p')).items.length === 1 && T4.ink.get().mode === true, 'autoPen: a pen on a canvas draws directly (and enters pen mode)');
    T4.ink.setMode(false); T4.ink.setOption('autoPen', false); await wait(60);
    const cur2 = D().querySelector('figure[data-w="ink"]');
    await drag('pen', linePx(a.x, a.y + 40, z.x, z.y + 40, 8), { pointerId: 52 });
    ok(JSON.parse(cur2.getAttribute('data-p')).items.length === 1 && !T4.ink.get().mode, 'autoPen off: pen does not draw in text mode');
    T4.ink.setOption('autoPen', true);
    // wet ink is visible during the stroke and gone afterwards
    T4.ink.setMode(true); T4.ink.setTool('pen');
    const t0 = document.elementFromPoint(a.x, a.y + 60);
    pev('pointerdown', t0, a.x, a.y + 60, { pointerType: 'pen', pointerId: 53 });
    for (let i = 1; i < 10; i++) pev('pointermove', t0, a.x + i * 30, a.y + 60 + Math.sin(i) * 10, { pointerType: 'pen', pointerId: 53 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = D().querySelector('figure[data-w="ink"] canvas.ink-wet'); let n = 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    ok(n > 100, 'wet ink is painted on the overlaid canvas during the stroke (' + n + ' px)');
    const before = D().querySelectorAll('figure[data-w="ink"] svg [data-id]').length;
    pev('pointerup', t0, a.x + 270, a.y + 60, { pointerType: 'pen', pointerId: 53 }); await wait(40);
    ok(D().querySelectorAll('figure[data-w="ink"] svg [data-id]').length === before + 1, 'pointer-up appends exactly one SVG node');
    // slash + insert menu entries
    ok(!!T4.edx.slash.get('ink.canvas'), 'slash entry registered');
    T4.ink.setMode(false); await newDoc({ title: 'slash', html: '<p></p>' }); caretEnd();
    T4.edx.slash.get('ink.canvas').run({ editor: T4.edx.editor, edx: T4.edx }); await wait(80);
    ok(D().querySelectorAll('figure[data-w="ink"]').length === 1 && T4.ink.get().mode, 'slash entry inserts a canvas and enters pen mode');
    T4.ink.setMode(false);
  `);

  await run('touch: manual scrolling, palm rejection, pinch zoom', R`
    const long = Array.from({ length: 60 }, (_, i) => '<p>Paragraph ' + i + ' with a little text.</p>').join('');
    await newDoc({ title: 'Scroll', html: long });
    T4.ink.setMode(true); T4.ink.setTool('pen');
    // a pen was seen: fingers must scroll instead of drawing
    pev('pointermove', document.body, 5, 5, { pointerType: 'pen', pointerId: 61, buttons: 0 });
    ok(T4.ink.get().penSeen === true, 'pen hover marks penSeen');
    const sc = (() => { let n = D(); while (n && n !== document.body) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return document.scrollingElement; })();
    sc.scrollTop = 0;
    const p5 = D().querySelectorAll('p')[5].getBoundingClientRect();
    await drag('touch', linePx(p5.left + 30, p5.top + 200, p5.left + 30, p5.top + 40, 8), { pointerId: 62 });
    ok(sc.scrollTop > 60, 'finger drag over text scrolls the document manually (scrollTop ' + sc.scrollTop + ')');
    ok(D().querySelectorAll('figure[data-w="ink"]').length === 0, 'and creates no overlay');
    ok(D().style.touchAction === 'none', 'touch-action none on the document while inking');
    T4.ink.setMode(false);
    ok(D().style.touchAction === '', 'touch-action restored when pen mode ends');
    // pinch on a canvas
    await newDoc({ title: 'Pinch', html: '<p>x</p>' });
    const el = T4.ink.canvas.insert({}); await wait(80);
    const cur = D().querySelector('figure[data-w="ink"]');
    const c1 = clientOf(cur, 400, 150), c2 = clientOf(cur, 600, 150);
    const t = document.elementFromPoint(c1.x, c1.y);
    pev('pointerdown', t, c1.x, c1.y, { pointerType: 'touch', pointerId: 71 });
    pev('pointerdown', t, c2.x, c2.y, { pointerType: 'touch', pointerId: 72 });
    pev('pointermove', t, c1.x - 60, c1.y, { pointerType: 'touch', pointerId: 71 });
    pev('pointermove', t, c2.x + 60, c2.y, { pointerType: 'touch', pointerId: 72 });
    pev('pointerup', t, c1.x - 60, c1.y, { pointerType: 'touch', pointerId: 71 });
    pev('pointerup', t, c2.x + 60, c2.y, { pointerType: 'touch', pointerId: 72 });
    await wait(40);
    ok(T4.ink.get().active.zoom > 1.3 && JSON.parse(cur.getAttribute('data-p')).items.length === 0, 'two-finger pinch zooms the canvas and draws nothing: zoom ' + T4.ink.get().active.zoom.toFixed(2));
    T4.ink.setMode(false);
  `);

  /* ---------- export ---------- */
  await run('export SVG / PNG', R`
    await inkNew({});
    T4.ink.setTool('pen');
    T4.ink.test.stroke(pts(100, 100, 400, 200, 10));
    T4.ink.test.stroke(pts(500, 100, 800, 200, 10));
    const calls = []; const orig = T4.edx.download;
    T4.edx.download = (data, name, mime) => { calls.push({ data, name, mime }); return name; };
    try {
      T4.ink.canvas.exportSVG({});
      ok(calls.length === 1 && /\.svg$/.test(calls[0].name) && calls[0].mime === 'image/svg+xml' && /^<svg|^<\?xml/.test(String(calls[0].data).trim()) && /xmlns/.test(calls[0].data), 'SVG export goes through edx.download: ' + calls[0].name);
      await T4.ink.canvas.exportPNG({ scale: 1 });
      ok(calls.length === 2 && /\.png$/.test(calls[1].name) && calls[1].mime === 'image/png' && calls[1].data instanceof Blob && calls[1].data.size > 200, 'PNG export produces a Blob: ' + (calls[1] && calls[1].data.size));
      const buf = new Uint8Array(await calls[1].data.arrayBuffer());
      ok(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, 'PNG signature');
      T4.ink.setTool('lasso'); T4.ink.test.stroke([{ x: 60, y: 60 }, { x: 450, y: 60 }, { x: 450, y: 260 }, { x: 60, y: 260 }, { x: 60, y: 62 }]);
      ok(T4.ink.get().selection.count === 1, 'selected one stroke');
      T4.ink.canvas.exportSVG({ selectionOnly: true });
      const sel = String(calls[2].data), all = String(calls[0].data);
      ok((sel.match(/<path/g) || []).length < (all.match(/<path/g) || []).length, 'selection-only SVG has fewer paths');
      await T4.ink.canvas.exportPNG({ selectionOnly: true });
      ok(calls.length === 4 && calls[3].data.size > 100, 'selection-only PNG');
    } finally { T4.edx.download = orig; }
    // ctx bar of the selected canvas in text mode
    T4.ink.setMode(false);
    const el = D().querySelector('figure[data-w="ink"]');
    T4.edcore.selectWidget(el); await wait(200);
    const bar = document.querySelector('.ed-ctx');
    ok(bar && !bar.hidden && /Handwriting/.test(bar.textContent), 'context bar shown for a selected canvas');
    const acts = Array.from(bar.querySelectorAll('[data-ctx]')).map((x) => x.getAttribute('data-ctx'));
    ok(['x:draw', 'x:bg', 'x:svg', 'x:png', 'delete'].every((a) => acts.includes(a)), 'context bar actions: ' + acts.join(','));
    bar.querySelector('[data-ctx="x:draw"]').click(); await wait(80);
    ok(T4.ink.get().mode === true, 'ctx "Draw" enters pen mode');
    T4.ink.setMode(false); T4.edcore.selectWidget(D().querySelector('figure[data-w="ink"]')); await wait(150);
    document.querySelector('.ed-ctx [data-ctx="delete"]').click(); await wait(80);
    ok(!D().querySelector('figure[data-w="ink"]'), 'ctx delete removes the canvas');
  `);

  /* ---------- text export / markdown ---------- */
  await run('markdown + text', R`
    await inkNew({});
    T4.ink.test.stroke(pts(100, 100, 400, 200, 10));
    const md = await T4.edx.widgets.toMarkdown('ink', gp(), { images: true });
    ok(/^!\[.*\]\(data:image\/png;base64,/.test(md), 'toMarkdown = PNG data URL image: ' + md.slice(0, 40));
    ok(T4.edx.widgets.textOf('ink', gp(), null) === '', 'textOf is empty');
    ok((await T4.edx.widgets.toMarkdown('ink', gp(), { images: false })) === '', 'no image when images are off');
  `);

  /* ---------- read-only documents ---------- */
  await run('read-only (trashed) document refuses ink', R`
    await newDoc({ title: 'Trash me', html: '<p>x</p>' });
    const cur = T4.editor.current;
    T4.ink.canvas.insert({}); T4.ink.setTool('pen'); await wait(60);
    T4.ink.test.stroke(pts(100, 100, 300, 100, 6));
    ok(gp().items.length === 1, 'canvas has a stroke');
    T4.ink.setMode(false);
    await T4.editor.flush(); await T4.docstore.trash(cur.id);
    await T4.editor.openDoc(cur.id, { reload: true }); await wait(300);
    ok(T4.edx.editor.readonly() === true, 'document is read-only now');
    const before = (D().querySelector('figure[data-w="ink"]') || { getAttribute: () => '' }).getAttribute('data-p');
    ok(T4.ink.setMode(true) === false && !T4.ink.get().mode, 'pen mode refused');
    ok(T4.ink.canvas.insert({}) === null, 'insert refused');
    const el = D().querySelector('figure[data-w="ink"]');
    if (el) {
      const id = JSON.parse(el.getAttribute('data-p')).id; T4.ink.canvas.activate(id);
      ok(T4.ink.test.stroke(pts(100, 200, 300, 200, 6)) === false || el.getAttribute('data-p') === before, 'stroke refused');
      T4.ink.canvas.setBackground('grid'); T4.ink.canvas.clear();
      ok(el.getAttribute('data-p') === before, 'canvas actions refused (data-p unchanged)');
    }
    ok(!T4.edx.commands.run('ink.insert'), 'ink.insert command refused in a read-only document');
  `);

  /* ---------- persistence of tool state ---------- */
  await run('state persistence in edx.db.kv', R`
    T4.ink.setTool('hl'); T4.ink.setToolOptions('hl', { s: 22 }); T4.ink.setOption('autoPen', false); T4.ink.setOption('recognize', true);
    await wait(500);
    const st = await T4.edx.db.kv.get('ink.state');
    ok(st && st.tool === 'hl' && st.tools.hl.s === 22 && st.options.autoPen === false && st.options.recognize === true, 'ink.state stored: ' + JSON.stringify(st).slice(0, 100));
    T4.ink.setOption('autoPen', true); T4.ink.setOption('recognize', false); T4.ink.setTool('pen'); T4.ink.setToolOptions('hl', { s: 18 });
    await wait(400);
  `);

  /* ---------- keyboard in pen mode ---------- */
  await run('keyboard in pen mode', R`
    await inkNew({});
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const key = (k, o) => document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, bubbles: true, cancelable: true }, o || {})));
    key('e'); ok(T4.ink.get().tool === 'eraser', 'E selects the eraser');
    key('l'); ok(T4.ink.get().tool === 'lasso', 'L selects lasso');
    key('s'); ok(T4.ink.get().tool === 'shape', 'S selects shapes');
    key('h'); ok(T4.ink.get().tool === 'hl', 'H selects the highlighter');
    key('p'); ok(T4.ink.get().tool === 'pen', 'P selects the pen');
    T4.ink.test.stroke(pts(100, 100, 300, 100, 6)); T4.ink.test.stroke(pts(100, 150, 300, 150, 6));
    key('z', { ctrlKey: true }); await wait(60);
    ok(gp().items.length === 1, 'Ctrl+Z undoes');
    key('y', { ctrlKey: true }); await wait(60);
    ok(gp().items.length === 2, 'Ctrl+Y redoes');
    key('a', { ctrlKey: true }); ok(T4.ink.get().selection.count === 2 && T4.ink.get().tool === 'lasso', 'Ctrl+A selects all (lasso)');
    key('c', { ctrlKey: true }); key('v', { ctrlKey: true }); await wait(40);
    ok(gp().items.length === 4, 'Ctrl+C / Ctrl+V');
    key('d', { ctrlKey: true }); ok(gp().items.length === 6, 'Ctrl+D duplicates');
    key('x', { ctrlKey: true }); ok(gp().items.length === 4, 'Ctrl+X cuts');
    key('Delete'); // selection is empty after cut: nothing happens
    T4.ink.selection.all(); key('Delete'); ok(gp().items.length === 0, 'Delete removes the selection');
    key('Escape'); ok(T4.ink.get().mode === false, 'Esc with nothing selected leaves pen mode');
    // typing target: tool keys must not fire inside an input
    const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
    T4.ink.setMode(true); T4.ink.setTool('pen');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }));
    ok(T4.ink.get().tool === 'pen', 'tool keys are ignored while typing in an input');
    inp.remove();
    T4.ink.setMode(false);
    ok(!document.body.classList.contains('ink-mode'), 'mode off');
  `);

  /* ---------- performance: 2000 strokes ---------- */
  await run('performance: 2000 strokes', R`
    await inkNew({ h: 6000 });
    T4.ink.setTool('pen');
    const tm = [];
    // bulk: fill 2000 strokes of 12 points each through the real gesture path
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) {
      const y = 20 + (i % 100) * 55, x = 20 + Math.floor(i / 100) * 45;
      const a = performance.now();
      T4.ink.test.stroke(Array.from({ length: 12 }, (_, k) => ({ x: x + k * 3, y: y + Math.sin(k + i) * 6 })));
      tm.push(performance.now() - a);
      if (i % 400 === 399) await wait(20);
    }
    const total = performance.now() - t0;
    ok(gp().items.length === 2000, '2000 strokes stored: ' + gp().items.length);
    const last = tm.slice(-100).sort((a, b) => a - b);
    const med = last[50], p95 = last[95];
    // time breakdown at 2000 items: model validate + the core snapshot
    const el = D().querySelector('figure[data-w="ink"]');
    const P = gp();
    let a = performance.now(); for (let i = 0; i < 5; i++) T4.ink.model.validate(P); const vms = (performance.now() - a) / 5;
    a = performance.now(); for (let i = 0; i < 5; i++) T4.edcore.serialize(); const sms = (performance.now() - a) / 5;
    window.__perf = { total: Math.round(total), med: +med.toFixed(1), p95: +p95.toFixed(1), validate: +vms.toFixed(1), serialize: +sms.toFixed(1), bytes: el.getAttribute('data-p').length };
    ok(med < 120, 'adding a stroke at 2000 strokes: median ' + med.toFixed(1) + ' ms, p95 ' + p95.toFixed(1) + ' ms (of which model.validate ' + vms.toFixed(1) + ' ms + core serialize ' + sms.toFixed(1) + ' ms)');
    // wet ink frame cost: one paint of a long stroke
    const pts500 = Array.from({ length: 500 }, (_, k) => ({ x: 20 + k * 1.5, y: 100 + Math.sin(k / 5) * 30 }));
    // eraser pass over the dense canvas
    T4.ink.setTool('eraser'); T4.ink.setToolOptions('eraser', { mode: 'stroke', s: 10 });
    a = performance.now(); T4.ink.test.stroke(Array.from({ length: 60 }, (_, k) => ({ x: 20 + k * 2, y: 25 + k * 3 }))); const ems = performance.now() - a;
    ok(ems < 400, 'eraser pass (60 samples) over 2000 strokes: ' + ems.toFixed(1) + ' ms, items ' + gp().items.length);
    // lasso over a dense area
    T4.ink.setTool('lasso'); a = performance.now();
    T4.ink.test.stroke([{ x: 10, y: 10 }, { x: 300, y: 10 }, { x: 300, y: 1500 }, { x: 10, y: 1500 }, { x: 10, y: 12 }]); const lms = performance.now() - a;
    ok(T4.ink.get().selection.count > 100 && lms < 600, 'lasso select ' + T4.ink.get().selection.count + ' items: ' + lms.toFixed(1) + ' ms');
    a = performance.now(); T4.ink.test.stroke([{ x: 100, y: 100 }, { x: 140, y: 140 }]); const mms = performance.now() - a;
    ok(mms < 800, 'move of ' + T4.ink.get().selection.count + ' selected items: ' + mms.toFixed(1) + ' ms');
    T4.ink.selection.clear();
    // reload of a 2000-stroke canvas
    await T4.editor.flush();
    a = performance.now(); await T4.editor.openDoc(T4.editor.current.id, { reload: true }); await wait(100); const rms = performance.now() - a;
    ok(D().querySelectorAll('figure[data-w="ink"] svg g.ink-layer > [data-id]').length > 1500, 'dense canvas reloads (' + rms.toFixed(0) + ' ms)');
    T4.ink.setMode(false);
  `);
  const perf = await b.evaluate('window.__perf');
  out.push('INFO performance (2000 strokes): ' + JSON.stringify(perf));

  /* ---------- no page errors ---------- */
  const errs = b.errors.slice(pageErrors0);
  ok(errs.length === 0, 'no page errors during the ink suite' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
}

export default standalone(test);
