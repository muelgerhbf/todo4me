// Ink module, UI part: pen bar, popovers (tools, canvas menu, layers, selection, settings), pen profiles, bar customisation,
// toolbar button, texts, themes, small screens.   CDP_PORT=9343 node tests/cdp.mjs tests/editor-ink-ui.mjs [shots-dir]
// Everything is driven through the real UI (CDP mouse/keyboard events); assertions read T4.ink.get() and the DOM.
// Dev hook: INK_UI_MOCK=<file> evaluates a file (a stand-in engine or a not yet wired engine part) before the checks.
import fs from 'node:fs';
import { standalone } from './editor-helpers.mjs';

const R = String.raw;

export async function test(t) {
  try { await body(t); } catch (e) { t.out.push('FAIL ink ui suite threw: ' + e.message.split('\n')[0]); }
}

async function body(t) {
  const { b, run, out } = t;
  const ev = (c) => b.evaluate(c);
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const errors0 = b.errors ? b.errors.length : 0;
  const center = (sel, fx = 0.5) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width * ${fx}, r.top + r.height / 2]; })()`);
  const click = async (sel, fx) => {
    const c = await center(sel, fx);
    if (!c) { ok(false, 'element exists: ' + sel); return false; }
    await b.click(c[0], c[1]);
    await b.sleep(130);
    return true;
  };
  const key = async (k, mod = 0) => { await b.key(k, k.length === 1 ? 'Key' + k.toUpperCase() : k, k === 'Enter' ? '\r' : undefined, mod); await b.sleep(80); };
  const mock = process.env.INK_UI_MOCK;
  const install = async () => {
    if (!mock) return;
    await ev(fs.readFileSync(mock, 'utf8') + '\n0');
    if (!(await ev('!!T4.inkui'))) await ev(fs.readFileSync(new URL('../js/ed-ink-ui.js', import.meta.url), 'utf8') + '\n0');
  };
  const open = async () => ev(R`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await T4.editor.newDocument({ title: 'Ink UI', html: '<p>Hello ink</p><p>Second paragraph</p>' });
    for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await wait(50);
    await wait(250); return true; })()`);

  await install();

  /* ---------- 0. presence, texts ---------- */
  await run('ink ui presence', R`
    ok(!!T4.inkui, 'T4.inkui exists (T4.ink engine API is present)');
    await (T4.inkui && T4.inkui.ready);
    ok(T4.edx.toolbar.has('ink.mode') && T4.edx.toolbar.get('ink.mode').group === 'ink', 'toolbar button ink.mode registered in group ink');
    ok(T4.edx.icons.has('ink-write') && T4.edx.icons.has('ink-pen') && T4.edx.icons.has('ink-layers'), 'own icons registered');
    const miss = T4.edx.i18n.missing()['edx.ink.'];
    ok(!miss, 'all edx.ink.* texts exist in en/de/tr/es ' + JSON.stringify(miss || {}));
    const keys = ['name', 'insert', 'mode', 'draw', 'bgNone', 'bgDots', 'bgLines', 'bgGrid', 'exportSvg', 'exportPng', 'delete', 'clear', 'full', 'layerLocked', 'layerN', 'annotation', 'pasteEmpty', 'drawingAlt'];
    ok(keys.every((k) => T4.i18n.has('edx.ink.' + k)), 'all contract keys (section 6) defined');
    ok(T4.edx.t('edx.ink.layerN', 'x', { n: 3 }) === 'Layer 3', 'layerN takes {n}');
    ok(T4.inkui.bar() && T4.inkui.bar().parentNode === document.body && T4.inkui.bar().hidden, 'bar is appended to body and hidden without pen mode');
    ok(T4.inkui.state().profiles.length === 4, 'four default profiles on first use');
  `);
  const ink = await ev('T4.ink && typeof T4.ink.get === "function"');
  if (!ink) return;
  await open();

  /* ---------- 1. toolbar button toggles pen mode and the bar ---------- */
  await run('ink toolbar button', R`
    const btn = () => $('#ed-tb-ext [data-cmd="ext:ink.mode"]');
    ok(!!btn(), 'toolbar button rendered'); ok(!T4.ink.get().mode && T4.inkui.bar().hidden, 'pen mode off, bar hidden');
  `);
  await click('#ed-tb-ext [data-cmd="ext:ink.mode"]');
  await run('ink toolbar on', R`
    ok(T4.ink.get().mode === true, 'click on the toolbar button turns pen mode on');
    ok(!T4.inkui.bar().hidden && T4.inkui.bar().getAttribute('role') === 'toolbar' && !!T4.inkui.bar().getAttribute('aria-label'), 'pen bar visible, role=toolbar with label');
    ok($('#ed-tb-ext [data-cmd="ext:ink.mode"]').getAttribute('aria-pressed') === 'true', 'toolbar button shows the pressed state');
    ok(!D().contains(T4.inkui.bar()), 'bar lives outside the document');
  `);
  await b.shot('ink-ui-bar');
  await click('#ed-tb-ext [data-cmd="ext:ink.mode"]');
  await run('ink toolbar off', R`
    ok(T4.ink.get().mode === false && T4.inkui.bar().hidden, 'second click turns pen mode and the bar off');
    T4.ink.setMode(true); await wait(150);
    ok(!T4.inkui.bar().hidden, 'bar follows setMode(true) from the API');
    $('.ink-bar [data-act="done"]').click(); await wait(120);
    ok(T4.ink.get().mode === false && T4.inkui.bar().hidden, 'the "exit" button leaves pen mode');
    T4.ink.setMode(true); await wait(150);
  `);

  /* ---------- 2. tool buttons ---------- */
  const POPTOOLS = ['pen', 'hl', 'eraser', 'shape'];
  for (const tool of ['hl', 'eraser', 'lasso', 'shape', 'pan', 'pen']) {
    await click(`.ink-bar [data-id="tool:${tool}"]`);
    await run('ink tool ' + tool, `
      ok(T4.ink.get().tool === '${tool}', 'tool button switches the tool to ${tool}');
      ok($('.ink-bar [data-id="tool:${tool}"]').getAttribute('aria-pressed') === 'true' && $$('.ink-bar [data-id^="tool:"][aria-pressed="true"]').length === 1, 'only the ${tool} button is pressed');
      ok($('.ink-pop').hidden, 'a first tap only switches, no popover');
    `);
    await click(`.ink-bar [data-id="tool:${tool}"]`);
    const popOpen = await ev(`!document.querySelector('.ink-pop').hidden`);
    ok(popOpen === POPTOOLS.includes(tool), `tapping the active ${tool} tool again ${POPTOOLS.includes(tool) ? 'opens' : 'does not open'} its settings`);
    if (popOpen) await click(`.ink-bar [data-id="tool:${tool}"]`);
  }
  await run('ink tool keys', R`
    ok($('.ink-pop').hidden, 'second tap closed the popover again');
    ok($$('.ink-bar button').every((x) => x.getAttribute('aria-label')), 'every bar button has an accessible name');
  `);

  /* ---------- 3. tool option popovers ---------- */
  await click('.ink-bar [data-id="tool:pen"]');
  await click('.ink-pop [data-opt="pen.c"][data-val="#e03131"]');
  await click('.ink-pop [data-opt="pen.s"][data-val="9"]');
  await click('.ink-pop [data-opt="pen.o"]', 0.5);
  await click('.ink-pop [data-opt="pen.pressure"]');
  await run('ink pen options', R`
    const p = T4.ink.get().tools.pen;
    ok(p.c === '#e03131', 'swatch sets the pen colour: ' + p.c);
    ok(p.s === 9, 'size preset sets the size: ' + p.s);
    ok(p.o > 0.35 && p.o < 0.7, 'opacity slider sets the opacity: ' + p.o);
    ok(p.pressure === false, 'pressure toggle flips (was on): ' + p.pressure);
    ok($('.ink-pop [data-opt="pen.c"][data-val="#e03131"]').getAttribute('aria-pressed') === 'true', 'swatch shows the active colour');
    ok($('.ink-pop [data-opt="pen.pressure"]').getAttribute('aria-checked') === 'false', 'pressure switch reflects state');
    const ci = $('.ink-pop input[type=color][data-opt="pen.c"]'); ci.value = '#00aa55'; ci.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
    ok(T4.ink.get().tools.pen.c === '#00aa55', 'custom colour input sets the colour');
    T4.ink.setToolOptions('pen', { s: 4 }); await wait(120);
    ok(+$('.ink-pop input[data-opt="pen.s"]').value === 4, 'popover follows changes made through the API');
    ok($('.ink-bar [data-id="tool:pen"] .ink-dot').getAttribute('style').includes('#00aa55'), 'pen button shows the colour dot');
  `);
  await click('.ink-pop [data-opt="pen.pressure"]');
  await click('.ink-bar [data-id="tool:hl"]');
  await click('.ink-bar [data-id="tool:hl"]');
  await click('.ink-pop [data-opt="hl.c"][data-val="#8ad8ff"]');
  await click('.ink-pop [data-opt="hl.s"][data-val="36"]');
  await click('.ink-bar [data-id="tool:eraser"]');
  await click('.ink-bar [data-id="tool:eraser"]');
  await click('.ink-pop [data-opt="eraser.mode"][data-val="area"]');
  await click('.ink-pop [data-opt="eraser.s"][data-val="24"]');
  await click('.ink-bar [data-id="tool:shape"]');
  await click('.ink-bar [data-id="tool:shape"]');
  await click('.ink-pop [data-opt="shape.kind"][data-val="ellipse"]');
  await click('.ink-pop [data-opt="shape.c"][data-val="#1971c2"]');
  await click('.ink-pop [data-opt="shape.f"][data-val="#d0ebff"]');
  await click('.ink-pop [data-opt="shape.s"]', 0.3);
  await run('ink other tool options', R`
    const g = T4.ink.get();
    ok(g.tools.pen.pressure === true, 'pressure toggled back on');
    ok(g.tools.hl.c === '#8ad8ff' && g.tools.hl.s === 36, 'highlighter colour + size: ' + JSON.stringify(g.tools.hl));
    ok(g.tools.eraser.mode === 'area' && g.tools.eraser.s === 24, 'eraser mode + size: ' + JSON.stringify(g.tools.eraser));
    ok(g.tools.shape.kind === 'ellipse' && g.tools.shape.c === '#1971c2' && g.tools.shape.f === '#d0ebff', 'shape kind, colour, fill: ' + JSON.stringify(g.tools.shape));
    ok(g.tools.shape.s < 12, 'shape width slider: ' + g.tools.shape.s);
    ok($$('.ink-pop [data-opt="shape.kind"]').length === 5, 'five shape kinds offered');
  `);
  await click('.ink-pop [data-opt="shape.f"][data-val="none"]');
  await click('.ink-pop [data-opt="shape.kind"][data-val="tri"]');
  await run('ink shape none', R`
    ok(T4.ink.get().tools.shape.f === 'none' && T4.ink.get().tools.shape.kind === 'tri', 'no fill + triangle');
    await wait(50);
  `);
  await key('Escape');
  await run('ink esc closes pop', R`
    ok($('.ink-pop').hidden, 'Esc closes the popover');
    ok(T4.ink.get().mode === true, 'Esc with a popover open keeps pen mode');
    T4.ink.setTool('pen');
  `);

  /* ---------- 4. profiles ---------- */
  await run('ink profiles default', R`
    await wait(100);
    const chips = $$('.ink-row--main .ink-prof');
    ok(chips.length === 4, 'four profile slots in the bar: ' + chips.length);
    ok(chips.every((c) => c.getAttribute('aria-label')), 'profile chips are named');
    ok(!!$('.ink-bar [data-id="prof-add"]'), 'add-profile button visible while the pen is active');
  `);
  await click('.ink-row--main .ink-prof:nth-of-type(2)');
  await run('ink profile apply', R`
    const g = T4.ink.get();
    ok(g.tool === 'pen' && g.tools.pen.c === '#1971c2' && g.tools.pen.s === 3, 'one tap on the blue pen profile applies it: ' + JSON.stringify(g.tools.pen));
    ok($('.ink-row--main .ink-prof.is-on') && $$('.ink-row--main .ink-prof.is-on').length === 1, 'applied profile is marked');
  `);
  await click('.ink-row--main .ink-prof:nth-of-type(4)');
  await run('ink profile apply hl', R`
    const g = T4.ink.get();
    ok(g.tool === 'hl' && g.tools.hl.c === '#fff176' && g.tools.hl.s === 24 && Math.abs(g.tools.hl.o - 0.35) < 0.01, 'highlighter profile switches tool and options: ' + g.tool + JSON.stringify(g.tools.hl));
    ok(!!$('.ink-bar [data-id="prof-add"]'), 'add button also for the highlighter');
    T4.ink.setTool('pen'); T4.ink.setToolOptions('pen', { c: '#00aa55', s: 6, o: 1 }); await wait(150);
  `);
  await click('.ink-bar [data-id="prof-add"]');
  await run('ink profile added', R`
    const pr = T4.inkui.state().profiles;
    ok(pr.length === 5 && pr[4].c === '#00aa55' && pr[4].s === 6 && pr[4].tool === 'pen', 'current pen saved as a new profile: ' + JSON.stringify(pr[4]));
    ok(!$('.ink-pop').hidden && document.activeElement && document.activeElement.classList.contains('ink-name'), 'profile popover opens with the name field focused');
    ok($$('.ink-row--main .ink-prof').length === 5, 'the new profile gets a slot (slots raised)');
  `);
  await ev(`document.activeElement.select(); 0`);
  await b.type('Green fine');
  await key('Enter');
  await run('ink profile renamed', R`
    const pr = T4.inkui.state().profiles;
    ok(pr[4].name === 'Green fine', 'rename by typing: ' + pr[4].name);
    ok($('.ink-row--main .ink-prof:nth-of-type(5)').getAttribute('aria-label') === 'Green fine', 'chip label follows the name');
  `);
  await key('Escape');
  // reorder + delete in the settings popover
  await click('.ink-bar [data-id="settings"]');
  await click('.ink-pop .ink-prow:nth-child(5) [data-act="prof-mv"][data-arg$=":-1"]');
  await run('ink profile reorder', R`
    const pr = T4.inkui.state().profiles;
    ok(pr[3].name === 'Green fine' && pr[4].tool === 'hl', 'move earlier reorders: ' + pr.map((p) => p.name).join(','));
    ok($$('.ink-pop .ink-prow').length === 5, 'settings list shows all profiles');
  `);
  await click('.ink-pop .ink-prow:nth-child(1) [data-act="prof-del"]');
  await run('ink profile delete', R`
    const pr = T4.inkui.state().profiles;
    ok(pr.length === 4 && pr[0].name !== 'Fine pen', 'delete removes the profile: ' + pr.map((p) => p.name).join(','));
    ok($$('.ink-row--main .ink-prof').length === 4, 'slot disappears from the bar');
    const stored = await T4.edx.db.kv.get('ink.profiles');
    ok(Array.isArray(stored) && stored.length === 4 && stored[2].name === 'Green fine', 'profiles stored in kv ink.profiles');
  `);
  await key('Escape');

  /* ---------- 5. undo / redo ---------- */
  await run('ink undo state', R`
    ok($('.ink-bar [data-id="undo"]').disabled === !T4.ink.get().canUndo, 'undo button mirrors canUndo');
    ok($('.ink-bar [data-id="redo"]').disabled === !T4.ink.get().canRedo, 'redo button mirrors canRedo');
    T4.ink.canvas.insert({ w: 1000, h: 300, bg: 'none' }); await wait(250);
    ok(!!T4.ink.get().active, 'canvas inserted and active');
    T4.ink.test.stroke([{ x: 100, y: 100 }, { x: 200, y: 140 }, { x: 300, y: 100 }], { pointerType: 'mouse' }); await wait(250);
    T4.ink.test.stroke([{ x: 100, y: 200 }, { x: 400, y: 220 }], { pointerType: 'mouse' }); await wait(250);
    ok(T4.ink.get().active.count === 2, 'two strokes drawn: ' + T4.ink.get().active.count);
    ok(!$('.ink-bar [data-id="undo"]').disabled, 'undo enabled after drawing');
  `);
  await click('.ink-bar [data-id="undo"]');
  await run('ink undo clicked', R`
    await wait(150);
    ok(T4.ink.get().active && T4.ink.get().active.count === 1, 'undo button removes the last stroke: ' + (T4.ink.get().active && T4.ink.get().active.count));
    ok(!$('.ink-bar [data-id="redo"]').disabled, 'redo enabled');
  `);
  await click('.ink-bar [data-id="redo"]');
  await run('ink redo clicked', R`
    await wait(150);
    ok(T4.ink.get().active.count === 2, 'redo button brings it back');
  `);

  /* ---------- 6. canvas menu ---------- */
  await click('.ink-bar [data-id="canvas"]');
  await run('ink canvas menu open', R`
    ok(!$('.ink-pop').hidden && $('.ink-bar [data-id="canvas"]').getAttribute('aria-expanded') === 'true', 'canvas popover opens');
    ok($$('.ink-pop [data-opt="cv.bg"]').length === 4, 'four backgrounds');
  `);
  await click('.ink-pop [data-opt="cv.bg"][data-val="grid"]');
  await click('.ink-pop [data-opt="cv.al"][data-val="left"]');
  await ev(`document.querySelector('.ink-pop [data-opt="cv.w"]').focus(); 0`);
  await key('ArrowLeft');
  await ev(`document.querySelector('.ink-pop [data-opt="cv.h"]').focus(); 0`);
  await key('ArrowRight');
  await click('.ink-pop [data-act="cv-zoom"][data-arg="in"]');
  await run('ink canvas settings', R`
    const a = T4.ink.get().active;
    ok(a.bg === 'grid', 'background grid: ' + a.bg);
    ok(a.al === 'left', 'alignment left: ' + a.al);
    ok(a.w === 950, 'width slider (keyboard step): ' + a.w);
    ok(a.h > 300, 'height slider: ' + a.h);
    ok(a.zoom > 1, 'zoom in: ' + a.zoom);
    ok($('.ink-pop [data-opt="cv.bg"][data-val="grid"]').getAttribute('aria-pressed') === 'true', 'background button shows state');
    ok(/%/.test($('.ink-pop [data-out="cv.zoom"]').textContent), 'zoom readout: ' + $('.ink-pop [data-out="cv.zoom"]').textContent);
  `);
  await click('.ink-pop [data-act="cv-zoom"][data-arg="reset"]');
  await run('ink canvas zoom reset', R`
    ok(Math.abs(T4.ink.get().active.zoom - 1) < 0.01, 'reset zoom: ' + T4.ink.get().active.zoom);
    window.__spy = [];
    const C = T4.ink.canvas;
    window.__orig = { svg: C.exportSVG, png: C.exportPNG, scale: C.scale };
    C.exportSVG = (o) => { window.__spy.push(['svg', o]); }; C.exportPNG = (o) => { window.__spy.push(['png', o]); }; C.scale = (f) => { window.__spy.push(['scale', f]); };
  `);
  await click('.ink-pop [data-act="cv-export"][data-arg="svg"]');
  await click('.ink-pop [data-act="cv-export"][data-arg="png"]');
  await click('.ink-pop [data-act="cv-scale"][data-arg="1.25"]');
  await run('ink canvas export calls', R`
    const s = window.__spy;
    ok(s.length === 3 && s[0][0] === 'svg' && s[1][0] === 'png' && s[2][0] === 'scale' && s[2][1] === 1.25, 'export SVG, export PNG and scale call through: ' + JSON.stringify(s));
    ok(s[1][1] && s[1][1].scale >= 1, 'PNG export asks for a scale');
    Object.assign(T4.ink.canvas, { exportSVG: window.__orig.svg, exportPNG: window.__orig.png, scale: window.__orig.scale });
  `);
  await click('.ink-pop [data-act="cv-clear"]');
  await run('ink canvas clear', R`
    await wait(150);
    ok(T4.ink.get().active && T4.ink.get().active.count === 0, 'clear empties the drawing: ' + (T4.ink.get().active && T4.ink.get().active.count));
  `);
  await click('.ink-pop [data-act="cv-insert"]');
  await run('ink canvas insert', R`
    await wait(200);
    ok($$('.t4-w[data-w="ink"]').length === 2, 'insert adds a second canvas: ' + $$('.t4-w[data-w="ink"]').length);
    ok($('.ink-pop').hidden, 'popover closes after inserting');
  `);
  await click('.ink-bar [data-id="canvas"]');
  await click('.ink-pop [data-act="cv-delete"]');
  await run('ink canvas delete', R`
    await wait(200);
    ok($$('.t4-w[data-w="ink"]').length === 1, 'delete removes the canvas: ' + $$('.t4-w[data-w="ink"]').length);
    T4.ink.canvas.activate(JSON.parse($('.t4-w[data-w="ink"]').getAttribute('data-p')).id); await wait(200);
    ok(!!T4.ink.get().active, 'remaining canvas can be activated');
  `);

  /* ---------- 7. layers ---------- */
  await click('.ink-bar [data-id="layers"]');
  await run('ink layers open', R`
    ok(!$('.ink-pop').hidden && $$('.ink-pop .ink-lrow').length === T4.ink.get().active.layers.length, 'layers popover lists the layers: ' + $$('.ink-pop .ink-lrow').length);
  `);
  await click('.ink-pop [data-act="layer-add"]');
  await run('ink layers added', R`
    await wait(150);
    const a = T4.ink.get().active;
    ok(a.layers.length === 2, 'add layer: ' + a.layers.length);
    ok($$('.ink-pop .ink-lrow').length === 2, 'list updated');
    window.__lid = a.layers.map((l) => l.id);
  `);
  const first = await ev('window.__lid[0]');
  await click(`.ink-pop [data-act="layer-active"][data-arg="${first}"]`);
  await run('ink layers active', R`
    ok(T4.ink.get().active.layer === window.__lid[0], 'tapping a row makes it the active layer');
    ok($('.ink-pop .ink-lrow.is-active').dataset.lid === window.__lid[0], 'active row marked');
  `);
  await click(`.ink-pop [data-act="layer-ren"][data-arg="${first}"]`);
  await b.type('Notes');
  await key('Enter');
  await run('ink layers renamed', R`
    await wait(100);
    ok(T4.ink.get().active.layers[0].name === 'Notes', 'rename: ' + T4.ink.get().active.layers[0].name);
    ok($('.ink-pop .ink-lrow[data-lid="' + window.__lid[0] + '"] .ink-lname').textContent === 'Notes', 'list shows the new name');
  `);
  await click(`.ink-pop [data-act="layer-eye"][data-arg="${first}"]`);
  await click(`.ink-pop [data-act="layer-lock"][data-arg="${first}"]`);
  await run('ink layers flags', R`
    const l = T4.ink.get().active.layers[0];
    ok(l.hidden === true, 'hide layer'); ok(l.locked === true, 'lock layer');
    ok($('.ink-pop .ink-lrow[data-lid="' + l.id + '"]').classList.contains('is-hidden'), 'hidden row styled');
  `);
  await click(`.ink-pop [data-act="layer-eye"][data-arg="${first}"]`);
  await click(`.ink-pop [data-act="layer-lock"][data-arg="${first}"]`);
  await click(`.ink-pop [data-act="layer-mv"][data-arg="${first}:1"]`);
  await run('ink layers move', R`
    await wait(100);
    const L = T4.ink.get().active.layers;
    ok(L[0].hidden === false && L[0].locked === false, 'show + unlock again');
    ok(L[1].id === window.__lid[0], 'move up reorders: ' + L.map((l) => l.id).join(','));
  `);
  await click(`.ink-pop [data-act="layer-del"][data-arg="${first}"]`);
  await run('ink layers delete', R`
    await wait(150);
    ok(T4.ink.get().active.layers.length === 1, 'delete layer');
    ok($('.ink-pop [data-act="layer-del"]').disabled, 'the last layer cannot be deleted');
  `);
  await key('Escape');

  /* ---------- 8. selection actions ---------- */
  await run('ink selection hidden', R`
    T4.ink.test.stroke([{ x: 100, y: 100 }, { x: 200, y: 140 }, { x: 300, y: 100 }], { pointerType: 'mouse' }); await wait(200);
    T4.ink.test.stroke([{ x: 100, y: 200 }, { x: 400, y: 220 }], { pointerType: 'mouse' }); await wait(200);
    T4.ink.setTool('lasso'); await wait(100);
    ok(T4.ink.get().selection.count === 0 && $('.ink-row--sel').hidden, 'no selection actions without a selection');
    T4.ink.selection.all(); await wait(200);
    ok(T4.ink.get().selection.count === 2, 'selection of 2: ' + T4.ink.get().selection.count);
    ok(!$('.ink-row--sel').hidden && $$('.ink-row--sel button').length >= 9, 'selection actions appear: ' + $$('.ink-row--sel button').length);
  `);
  await click('.ink-bar [data-id="sel-colour"]');
  await click('.ink-pop [data-opt="sel.c"][data-val="#e03131"]');
  await run('ink selection colour', R`
    await wait(150);
    const p = T4.ink.test.props(T4.ink.get().active.id);
    ok(p.items.length === 2 && p.items.every((i) => i.c === '#e03131'), 'colour applied to the selected items');
  `);
  await key('Escape');
  await run('ink selection layer prep', R`
    T4.ink.canvas.layers.add(''); await wait(150); T4.ink.selection.all(); await wait(150);
    window.__l2 = T4.ink.get().active.layers[1].id;
  `);
  await click('.ink-bar [data-id="sel-layer"]');
  const l2 = await ev('window.__l2');
  await click(`.ink-pop [data-act="sel-layer"][data-arg="${l2}"]`);
  await run('ink selection to layer', R`
    await wait(150);
    const p = T4.ink.test.props(T4.ink.get().active.id);
    ok(p.items.every((i) => i.l === window.__l2), 'move to layer: ' + p.items.map((i) => i.l).join(','));
    ok($('.ink-pop').hidden, 'layer popover closes');
  `);
  await click('.ink-bar [data-id="sel-front"]');
  await click('.ink-bar [data-id="sel-back"]');
  await click('.ink-bar [data-id="sel-copy"]');
  await click('.ink-bar [data-id="sel-paste"]');
  await run('ink selection paste', R`
    await wait(200);
    ok(T4.ink.get().active.count === 4, 'copy + paste adds the items: ' + T4.ink.get().active.count);
  `);
  await click('.ink-bar [data-id="sel-dup"]');
  await run('ink selection duplicate', R`
    await wait(200);
    ok(T4.ink.get().active.count >= 6, 'duplicate adds the items: ' + T4.ink.get().active.count);
  `);
  await click('.ink-bar [data-id="sel-del"]');
  await run('ink selection delete', R`
    await wait(200);
    ok(T4.ink.get().selection.count === 0 && $('.ink-row--sel').hidden, 'delete removes the selection and hides the actions');
    T4.ink.selection.all(); await wait(150);
  `);
  await click('.ink-bar [data-id="sel-cut"]');
  await run('ink selection cut', R`
    await wait(200);
    ok(T4.ink.get().active.count < 6 && T4.ink.get().selection.count === 0, 'cut removes the items: ' + T4.ink.get().active.count);
    T4.ink.selection.paste(); await wait(200);
    T4.ink.selection.all(); await wait(150);
  `);
  await click('.ink-bar [data-id="sel-clear"]');
  await run('ink selection clear', R`
    ok(T4.ink.get().selection.count === 0 && $('.ink-row--sel').hidden, 'deselect clears the selection');
  `);

  /* ---------- 9. toggles in the settings popover ---------- */
  await click('.ink-bar [data-id="settings"]');
  const opt0 = await ev('JSON.stringify(T4.ink.get().options)');
  await click('.ink-pop [data-opt="opt.recognize"]');
  await click('.ink-pop [data-opt="opt.fingerDraw"]');
  await click('.ink-pop [data-opt="opt.autoPen"]');
  await run('ink toggles', `
    const o0 = ${opt0}, o = T4.ink.get().options;
    ok(o.recognize === !o0.recognize, 'shape recognition toggled');
    ok(o.fingerDraw === !o0.fingerDraw, 'draw with finger toggled');
    ok(o.autoPen === !o0.autoPen, 'auto pen toggled');
    ok($('.ink-pop [data-opt="opt.recognize"]').getAttribute('aria-checked') === String(o.recognize), 'switch reflects the option');
  `);
  await click('.ink-pop [data-opt="opt.recognize"]');
  await click('.ink-pop [data-opt="opt.fingerDraw"]');
  await click('.ink-pop [data-opt="opt.autoPen"]');
  await key('Escape');
  await run('ink toggles esc', R`
    ok(T4.ink.get().mode === true && !T4.inkui.bar().hidden, 'Esc in the settings popover only closes it (pen mode stays on)');
    ok($('.ink-pop').hidden, 'settings popover closed');
  `);

  /* ---------- 10. keyboard ---------- */
  await ev(`document.querySelector('.ink-bar [data-id="tool:pen"]').focus(); 0`);
  await key('ArrowRight');
  await run('ink keyboard', R`
    ok(document.activeElement && document.activeElement.dataset.id === 'tool:hl', 'ArrowRight moves focus along the bar: ' + (document.activeElement && document.activeElement.dataset.id));
    ok($$('.ink-row button[tabindex="0"]').length === 1, 'roving tabindex: one tab stop');
    document.querySelector('.ink-bar [data-id="tool:pen"]').focus();
  `);
  await key('Enter');
  await run('ink keyboard enter', R`
    ok(T4.ink.get().tool === 'pen', 'Enter on a focused tool button activates it');
  `);
  await key('Enter');
  await run('ink keyboard pop', R`
    ok(!$('.ink-pop').hidden, 'Enter on the active tool opens its popover');
    ok(document.activeElement && $('.ink-pop').contains(document.activeElement), 'focus moves into the popover when opened by keyboard');
  `);
  await key('Escape');
  await run('ink keyboard esc', R`
    ok($('.ink-pop').hidden && document.activeElement && document.activeElement.dataset.id === 'tool:pen', 'Esc closes the popover and returns focus to its button');
    const rule = Array.from(document.styleSheets).flatMap((s) => { try { return Array.from(s.cssRules); } catch (e) { return []; } })
      .find((r) => r.conditionText && /pointer:\s*coarse/.test(r.conditionText) && r.cssText.includes('.ink-btn'));
    ok(!!rule && /44px/.test(rule.cssText), 'coarse-pointer rule gives 44px targets');
    ok($('.ink-bar [data-id="tool:pen"]').getBoundingClientRect().width >= 34, 'compact buttons >= 34px on fine pointers');
  `);

  /* ---------- 11. drag, viewport ---------- */
  const gc = await center('.ink-bar .ink-grip');
  const before = await ev(`(() => { const r = document.querySelector('.ink-bar').getBoundingClientRect(); return [r.left, r.top]; })()`);
  await b.drag(gc[0], gc[1], gc[0] - 300, gc[1] - 250, 8);
  await b.sleep(400);
  const after = await ev(`(() => { const r = document.querySelector('.ink-bar').getBoundingClientRect(); return [r.left, r.top]; })()`);
  ok(Math.abs(after[0] - (before[0] - 300)) < 3 && Math.abs(after[1] - (before[1] - 250)) < 3, `dragging the grip moves the bar (${before} -> ${after})`);
  await run('ink drag stored', R`
    const st = T4.inkui.state().ui.pos, kv = await T4.edx.db.kv.get('ink.ui');
    ok(st && kv && kv.pos && kv.pos.x === st.x && kv.pos.y === st.y, 'position remembered in kv ink.ui: ' + JSON.stringify(kv && kv.pos));
  `);
  await b.viewport(700, 420);
  await b.sleep(300);
  await run('ink resize keeps inside', R`
    const r = $('.ink-bar').getBoundingClientRect();
    ok(r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, 'bar stays inside a smaller viewport: ' + JSON.stringify([r.left, r.top, r.right, r.bottom]));
  `);
  await b.viewport(360, 740);
  await b.sleep(400);
  await run('ink 360', R`
    const r = $('.ink-bar').getBoundingClientRect();
    ok(r.left >= 0 && r.right <= 360.5 && r.top >= 0 && r.bottom <= 740.5, 'bar fits at 360px width: ' + JSON.stringify([r.left, r.right, r.top, r.bottom]));
    ok($$('.ink-bar .ink-row button').every((x) => { const q = x.getBoundingClientRect(); return q.left >= -0.5 && q.right <= 360.5 && q.width > 0; }), 'no bar button is cut off');
    ok(document.documentElement.scrollWidth <= 361, 'no horizontal page overflow caused by the bar');
  `);
  for (const [sel, name] of [['[data-id="tool:pen"]', 'pen'], ['[data-id="canvas"]', 'canvas'], ['[data-id="layers"]', 'layers'], ['[data-id="settings"]', 'settings']]) {
    if (name === 'pen') await ev(`T4.ink.setTool('pen'); 0`);
    await click(`.ink-bar ${sel}`);
    await run('ink 360 pop ' + name, `
      const p = $('.ink-pop'), r = p.getBoundingClientRect();
      ok(!p.hidden && r.left >= 0 && r.right <= 360.5 && r.top >= 0 && r.bottom <= 740.5, '${name} popover fits at 360px: ' + JSON.stringify([r.left, r.right, r.top, r.bottom]));
    `);
    await key('Escape');
  }
  await b.shot('ink-ui-360');
  await b.viewport(1440, 900);
  await b.sleep(300);
  await run('ink toolbar clearance', R`
    $('.ink-bar [data-id="grip"]');
    const bar = $('.ink-bar').getBoundingClientRect(), tbar = $('#ed-toolbar').getBoundingClientRect();
    ok(bar.top >= tbar.bottom - 1 || bar.bottom <= tbar.top + 1 || bar.right <= tbar.left || bar.left >= tbar.right, 'bar does not overlap the editor toolbar');
  `);

  /* ---------- 12. themes: contrast and visibility ---------- */
  await run('ink themes', R`
    const rgb = (s) => { let m = s.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
      m = s.match(/color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[ \/]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] == null ? 1 : p[3]]; } return null; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const cr = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const html = document.documentElement, saved = [html.getAttribute('data-theme'), html.getAttribute('data-design')];
    const themes = [['light', null], ['dark', null], ['dark', 'tokio'], ['light', 'aubergine'], ['dark', 'paper']];
    T4.ink.setTool('pen'); await wait(100);
    for (const [mode, design] of themes) {
      html.setAttribute('data-theme', mode); if (design) html.setAttribute('data-design', design); else html.removeAttribute('data-design');
      await wait(400);
      const label = mode + (design ? '/' + design : '');
      const bar = $('.ink-bar'), cs = getComputedStyle(bar), bg = rgb(cs.backgroundColor);
      const norm = $('.ink-bar [data-id="tool:hl"]'), act = $('.ink-bar [data-id="tool:pen"]');
      const nfg = rgb(getComputedStyle(norm).color), afg = rgb(getComputedStyle(act).color), abg = rgb(getComputedStyle(act).backgroundColor);
      ok(bg && bg[3] === 1, label + ': bar background is opaque');
      ok(nfg && cr(nfg, bg) >= 4.5, label + ': tool icon contrast on the bar ' + (nfg && cr(nfg, bg).toFixed(1)));
      ok(abg && afg && cr(afg, abg) >= 3, label + ': active tool icon contrast ' + (abg && afg && cr(afg, abg).toFixed(1)));
      ok(abg && cr(abg, bg) >= 1.5, label + ': active tool distinct from the bar ' + (abg && cr(abg, bg).toFixed(1)));
      const r = bar.getBoundingClientRect(); ok(r.width > 100 && r.height > 30, label + ': bar visible');
      ok(cs.borderTopStyle === 'solid' && cs.boxShadow !== 'none', label + ': bar has border and shadow');
    }
    T4.ink.setTool('shape'); await wait(100); $('.ink-bar [data-id="tool:shape"]').click(); await wait(150);
    for (const [mode, design] of themes) {
      html.setAttribute('data-theme', mode); if (design) html.setAttribute('data-design', design); else html.removeAttribute('data-design');
      await wait(400);
      const pop = $('.ink-pop'), pbg = rgb(getComputedStyle(pop).backgroundColor), ptx = rgb(getComputedStyle($('.ink-pop .ink-lb')).color);
      ok(pbg && ptx && cr(ptx, pbg) >= 3.5, mode + (design ? '/' + design : '') + ': popover label contrast ' + (pbg && ptx && cr(ptx, pbg).toFixed(1)));
      const on = $('.ink-pop .ink-segb.is-on'); ok(!!on && on.getBoundingClientRect().width > 20, mode + (design ? '/' + design : '') + ': selected option visible');
    }
    if (saved[0]) html.setAttribute('data-theme', saved[0]); else html.removeAttribute('data-theme');
    if (saved[1]) html.setAttribute('data-design', saved[1]); else html.removeAttribute('data-design');
    T4.ink.setTool('pen'); await wait(100);
  `);
  await key('Escape');

  /* ---------- 13. language change rebuilds the bar ---------- */
  await run('ink language', R`
    T4.i18n.setLanguage('de'); await wait(700);
    await T4.edx.editor.ready();
  `);
  await open();
  await run('ink language de', R`
    T4.ink.setMode(true); await wait(250);
    ok($('.ink-bar').getAttribute('aria-label') === 'Stiftleiste', 'bar label rebuilt in German: ' + $('.ink-bar').getAttribute('aria-label'));
    ok($('.ink-bar [data-id="tool:eraser"]').getAttribute('aria-label') === 'Radierer', 'tool names rebuilt in German');
    ok(/Stiftmodus/.test($('#ed-tb-ext [data-cmd="ext:ink.mode"]').getAttribute('title') || ''), 'toolbar button title in German: ' + $('#ed-tb-ext [data-cmd="ext:ink.mode"]').getAttribute('title'));
    $('.ink-bar [data-id="canvas"]').click(); await wait(150);
    ok(/Zeichenfläche/.test($('.ink-pop').textContent), 'popover texts in German');
    T4.i18n.setLanguage('en'); await wait(700);
  `);
  await open();
  await run('ink language en', R`
    T4.ink.setMode(true); await wait(250);
    ok($('.ink-bar').getAttribute('aria-label') === 'Pen bar', 'bar label back in English');
  `);

  /* ---------- 14. nothing of the bar in the document ---------- */
  await run('ink not stored', R`
    T4.ink.canvas.insert({ w: 1000, h: 200, bg: 'dots' }); await wait(250);
    $('.ink-bar [data-id="settings"]').click(); await wait(100);
    const s = await stored();
    ok(!/ink-bar|ink-pop|ink-prof|ink-row|ink-grip|ink-sw/.test(s.html || ''), 'stored document HTML has no pen bar markup');
    ok(!/ink-bar|ink-pop|ink-row/.test(D().innerHTML), 'document DOM has no pen bar markup');
    ok(!D().querySelector('.ink-bar, .ink-pop'), 'no bar element inside the document');
    ok(/data-w="ink"/.test(s.html || ''), 'the canvas itself is stored');
  `);

  /* ---------- 15. customisation persists ---------- */
  await run('ink customise open', R`
    T4.ink.setMode(true); await wait(100);
    if ($('.ink-pop').hidden) { $('.ink-bar [data-id="settings"]').click(); await wait(100); }
    ok(!$('.ink-pop').hidden, 'settings popover open');
  `);
  await click('.ink-pop [data-opt="uit.pan"]');
  await click('.ink-pop [data-opt="uit.lasso"]');
  await ev(`document.querySelector('.ink-pop [data-opt="ui.slots"]').focus(); 0`);
  for (let n = await ev('T4.inkui.state().ui.slots'); n > 2; n--) await key('ArrowLeft');
  await click('.ink-pop [data-opt="ui.size"][data-val="large"]');
  await run('ink customise applied', R`
    ok(!$('.ink-bar [data-id="tool:pan"]') && !$('.ink-bar [data-id="tool:lasso"]') && !!$('.ink-bar [data-id="tool:pen"]'), 'hidden tools leave the bar');
    ok($$('.ink-row--main .ink-prof').length === 2, 'profile slots reduced to 2: ' + $$('.ink-row--main .ink-prof').length);
    ok($('.ink-bar').classList.contains('is-large') && $('.ink-bar [data-id="tool:pen"]').getBoundingClientRect().width >= 44, 'large buttons: ' + $('.ink-bar [data-id="tool:pen"]').getBoundingClientRect().width);
    ok($('.ink-pop [data-opt="uit.pan"]').getAttribute('aria-checked') === 'false' && $('.ink-pop [data-opt="uit.pen"]').getAttribute('aria-checked') === 'true', 'switches reflect the choice');
    const ui = T4.inkui.state().ui;
    window.__ui = JSON.stringify(ui); window.__prof = JSON.stringify(T4.inkui.state().profiles);
    ok(ui.slots === 2 && ui.size === 'large' && !ui.tools.includes('pan'), 'state: ' + window.__ui);
    await wait(300);
  `);
  const uiStr = await ev('window.__ui'), profStr = await ev('window.__prof');
  await b.reload();
  await install();
  await ev(`location.hash = '#/editor'; new Promise((r) => setTimeout(r, 500))`);
  await run('ink persisted after reload', `
    await T4.inkui.ready;
    ok(JSON.stringify(T4.inkui.state().ui) === ${JSON.stringify(uiStr)}, 'bar settings survive a reload: ' + JSON.stringify(T4.inkui.state().ui));
    ok(JSON.stringify(T4.inkui.state().profiles) === ${JSON.stringify(profStr)}, 'profiles survive a reload (names, order, deletion)');
  `);
  await open();
  await run('ink persisted bar', R`
    T4.ink.setMode(true); await wait(250);
    ok($('.ink-bar').classList.contains('is-large') && !$('.ink-bar [data-id="tool:pan"]') && $$('.ink-row--main .ink-prof').length === 2, 'reloaded bar uses the saved layout');
    const r = $('.ink-bar').getBoundingClientRect();
    ok(r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, 'saved position is inside the viewport');
    // restore defaults for the rest of the run
    await T4.edx.db.kv.remove('ink.ui');
    T4.ink.setMode(false); await wait(100);
    ok(T4.inkui.bar().hidden, 'bar hidden again after leaving pen mode');
  `);
  const errs = b.errors ? b.errors.slice(errors0) : [];
  ok(errs.length === 0, 'no page errors during the ink UI run' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
}
export default standalone(test);
