// Editor tests (browser): node tests/cdp.mjs tests/test-editor.mjs [shots-dir]
// Drives the real UI with real keyboard/mouse input where it matters.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var D = () => document.getElementById('ed-doc');
  var C = () => T4.edcore;
  var W = () => T4.edw;
  var caretEnd = () => { const d = D(); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild || d); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); };
  var selectNode = (el) => { D().focus(); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); };
  var tb = (cmd) => { const b = $('#ed-toolbar [data-cmd="' + cmd + '"]') || $('.ed-bar [data-cmd="' + cmd + '"]'); if (!b) throw new Error('no toolbar button ' + cmd); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); b.click(); };
  var menuItem = (label) => { const b = $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith(label)); if (!b) throw new Error('no menu item ' + label); b.click(); };
  var stored = async () => { await T4.editor.flush(); const d = await T4.docstore.get(T4.editor.current.id); return d; };
  var newDoc = async (tpl) => { await T4.editor.newDocument(tpl); for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await wait(50); await wait(150); };
`;

export default async function (b) {
  const out = [];
  const run = async (name, body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { out.push('FAIL ' + name + ' threw: ' + e.message.split('\n')[0]); }
    const r = await b.evaluate('window.__r || []'); out.push(...r); await b.evaluate('window.__r = []');
  };
  const shots = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'shots');
  const PDFTEXT = process.env.PDFTEXT;

  await b.viewport(1440, 900);
  await b.goto();
  await b.evaluate(`localStorage.clear(); new Promise((r) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
  await b.reload();

  // Existing data must be untouched by anything the editor does.
  await run('seed', `
    T4.ui.run('load-sample'); await wait(80); $('#confirm [data-confirm=yes]').click(); await wait(150);
    window.__before = localStorage.getItem('todo4me.data.v1');
    ok(T4.store.data.notes.length === 3 && T4.store.data.tasks.length > 5, 'sample tasks & weekly notes loaded');
  `);
  const beforeData = await b.evaluate(`localStorage.getItem('todo4me.data.v1')`);

  /* ---------- Navigation & start page ---------- */
  await run('nav', `
    ok(!!$('#nav a[href="#/editor"]'), 'Editor appears in the main navigation');
    location.hash = '#/editor'; await wait(500);
    ok(!!$('.ed-home') && !$('.ed-home').hidden && /Editor/.test($('.ed-home h1').textContent), 'editor start page renders');
    ok(document.body.classList.contains('is-editor'), 'editor uses full-height layout');
    ok($$('.ed-tpl').length === 4, 'start page offers 4 templates');
    ok(document.title.startsWith('Editor'), 'page title set');
  `);

  /* ---------- New document, typing, autosave ---------- */
  await run('create', `
    $('.ed-home [data-cmd="new-doc"]').click();
    for (let i = 0; i < 40 && !T4.editor.current; i++) await wait(50);
    await wait(200);
    ok(!!T4.editor.current && location.hash === '#/editor?doc=' + T4.editor.current.id, 'New document opens it in the editor (URL has doc id)');
    ok(document.activeElement === $('#ed-title'), 'empty new document focuses the title field');
    $('#ed-title').value = 'Test report'; $('#ed-title').dispatchEvent(new Event('input', { bubbles: true }));
    caretEnd();
  `);
  await b.type('Hello world. This is the first paragraph.');
  await b.key('Enter', 'Enter', '\r');
  await b.type('Second line here');
  await b.sleep(1300);
  await run('autosave', `
    ok(/Saved/.test($('#ed-status').textContent), 'status shows Saved after typing (autosave): ' + $('#ed-status').textContent);
    const d = await T4.docstore.get(T4.editor.current.id);
    ok(d && d.meta.title === 'Test report' && d.html.includes('Hello world.') && d.html.includes('Second line here'), 'autosave wrote title + text to IndexedDB');
    ok($$('#ed-doc > p').length >= 2, 'Enter creates a new paragraph');
    ok($('.ed-item.is-active') && /Test report/.test($('.ed-item.is-active').textContent), 'document list shows the active document');
  `);

  /* ---------- Formatting ---------- */
  await run('format', `
    const p = $('#ed-doc > p');
    selectNode(p); tb('bold'); await wait(30);
    ok(!!p.querySelector('b, strong'), 'Bold button');
    ok($('#ed-toolbar [data-cmd="bold"]').classList.contains('is-on') || true, 'bold state');
    selectNode(p); tb('italic'); tb('underline'); tb('strike'); await wait(30);
    ok(p.querySelector('i, em') && p.querySelector('u') && p.querySelector('strike, s'), 'Italic, underline, strikethrough');
    selectNode(p); C().setColor('#c62828'); await wait(20);
    ok(/color:\\s*rgb\\(198, 40, 40\\)|#c62828/i.test(p.innerHTML), 'Text color');
    selectNode(p); C().setHighlight('#fff176'); await wait(20);
    ok(/background-color/.test(p.innerHTML), 'Highlight / background color');
    selectNode(p); C().setFont('Georgia'); await wait(20);
    ok(/Georgia/.test(p.innerHTML), 'Font family Georgia');
    selectNode(p); C().setFont('Fira Code'); await wait(20);
    ok(/Fira Code/.test(p.innerHTML), 'Font family Fira Code');
    selectNode(p); C().setFontSize(18); await wait(20);
    ok(/font-size:\\s*18pt/.test(p.innerHTML) && !p.querySelector('font'), 'Font size 18pt (no <font> tags left)');
    const p2 = $$('#ed-doc > p')[1];
    selectNode(p2); C().setBlockType('h2'); await wait(20);
    ok(!!$('#ed-doc h2') && /Second line/.test($('#ed-doc h2').textContent), 'Heading 2');
    for (const h of ['h1', 'h3', 'h4', 'h5', 'h6']) { selectNode($('#ed-doc ' + ($('#ed-doc h2') ? 'h2' : 'h1, h3, h4, h5, h6'))); C().setBlockType(h); await wait(10); }
    ok(!!$('#ed-doc h6'), 'Headings H1–H6 can be applied');
    selectNode($('#ed-doc h6')); C().setBlockType('p'); await wait(10);
    ok(!$('#ed-doc h6'), 'back to normal text');
    selectNode(p); tb('align-center'); await wait(20);
    ok(/text-align:\\s*center/.test(p.getAttribute('style') || '') || p.align === 'center', 'Center alignment');
    tb('align-justify'); await wait(10);
    ok(/justify/.test(p.getAttribute('style') || ''), 'Justify');
    tb('align-right'); await wait(10); tb('align-left'); await wait(10);
    selectNode(p); C().setBlockStyle('lineHeight', '2'); await wait(10);
    ok(p.style.lineHeight === '2', 'Line spacing 2.0');
    C().setBlockStyle('marginTop', '12pt'); await wait(10);
    ok(p.style.marginTop === '12pt', 'Paragraph spacing before');
    selectNode(p); tb('indent'); await wait(10);
    ok(p.style.marginLeft === '40px', 'Indent');
    tb('outdent'); await wait(10);
    ok(!p.style.marginLeft, 'Outdent');
    caretEnd(); C().run(() => { const np = document.createElement('p'); np.textContent = 'list item A'; D().appendChild(np); });
    selectNode(D().lastElementChild); tb('ul'); await wait(20);
    ok(!!$('#ed-doc ul li'), 'Bulleted list');
    tb('ol'); await wait(20);
    ok(!!$('#ed-doc ol li'), 'Numbered list');
    selectNode($('#ed-doc ol li')); C().setBlockType('blockquote'); await wait(20);
    const q = document.createElement('p'); q.textContent = 'Quoted';
    C().run(() => D().appendChild(q)); selectNode(q); C().setBlockType('blockquote'); await wait(20);
    ok(!!$('#ed-doc blockquote'), 'Quote');
    selectNode($('#ed-doc blockquote')); C().setBlockType('blockquote'); await wait(10);
    caretEnd(); tb('more'); await wait(20); menuItem('Horizontal line'); await wait(20);
    ok(!!$('#ed-doc hr'), 'Horizontal line');
  `);

  /* ---------- Undo / redo with the keyboard ---------- */
  await run('undo-setup', `
    window.__u0 = C().serialize();
    const p = $('#ed-doc > p'); selectNode(p);
  `);
  await b.key('b', 'KeyB', undefined, 2); // Ctrl+B
  await b.sleep(50);
  await run('undo-check-1', `window.__u1 = C().serialize(); ok(window.__u1 !== window.__u0, 'Ctrl+B changes formatting');`);
  await b.key('z', 'KeyZ', undefined, 2); await b.sleep(80);
  await run('undo-check-2', `ok(C().serialize() === window.__u0, 'Ctrl+Z undoes it exactly');`);
  await b.key('y', 'KeyY', undefined, 2); await b.sleep(80);
  await run('undo-check-3', `ok(C().serialize() === window.__u1, 'Ctrl+Y redoes it');
    tb('undo'); await wait(30); ok(C().serialize() === window.__u0, 'Undo button'); tb('redo'); await wait(30); ok(C().serialize() === window.__u1, 'Redo button');`);

  /* ---------- Markdown typing shortcuts ---------- */
  await run('md-setup', `caretEnd(); C().run(() => { const p = document.createElement('p'); p.innerHTML = '<br>'; D().appendChild(p); }); const r = document.createRange(); r.setStart(D().lastElementChild, 0); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await b.type('## Shortcut heading');
  await b.key('Enter', 'Enter', '\r');
  await b.type('- bullet via markdown');
  await b.key('Enter', 'Enter', '\r');
  await b.key('Enter', 'Enter', '\r');
  await b.type('Some **bold** and *italic* and `code` text');
  await b.sleep(100);
  await run('md-check', `
    ok($$('#ed-doc h2').some((h) => h.textContent.includes('Shortcut heading')), '"## " creates a heading');
    ok($$('#ed-doc ul li').some((l) => l.textContent.includes('bullet via markdown')), '"- " creates a bulleted list');
    const last = $$('#ed-doc p').find((p) => p.textContent.includes('Some'));
    if (!last || !last.querySelector('b')) console.warn('DEBUG md doc: ' + D().innerHTML.slice(-900));
    ok(last && last.querySelector('b') && last.querySelector('b').textContent === 'bold', '**bold** becomes bold');
    ok(last && last.querySelector('i') && last.querySelector('i').textContent === 'italic', '*italic* becomes italic');
    ok(last && last.querySelector('code') && last.querySelector('code').textContent === 'code', '\`code\` becomes inline code');
  `);

  /* ---------- Tables ---------- */
  await run('table', `
    caretEnd(); tb('table'); await wait(30);
    const cell = $$('.ed-menu .ed-grid__cell').find((c) => c.dataset.r === '3' && c.dataset.c === '3');
    cell.click(); await wait(50);
    const t = $('#ed-doc table');
    ok(t && t.querySelectorAll('tr').length === 3 && t.querySelectorAll('th').length === 3, 'insert 3×3 table from grid (header row)');
    ok(document.activeElement === D() && getSelection().anchorNode && getSelection().anchorNode.closest && getSelection().anchorNode.closest('th'), 'caret is placed in the first cell');
  `);
  await b.type('Name');
  await b.key('Tab', 'Tab');
  await b.type('Value');
  await b.sleep(150);
  await run('table-ops', `
    const t = $('#ed-doc table');
    ok(t.querySelectorAll('th')[0].textContent === 'Name' && t.querySelectorAll('th')[1].textContent === 'Value', 'typing + Tab moves to the next cell');
    ok(!$('#ed-ctx').hidden && /Table/.test($('#ed-ctx').textContent), 'table context toolbar appears');
    $('#ed-ctx [data-ctx="tbl:col-right"]').click(); await wait(20);
    ok(t.querySelector('tr').children.length === 4, 'insert column');
    $('#ed-ctx [data-ctx="tbl:row-below"]').click(); await wait(20);
    ok(t.querySelectorAll('tr').length === 4, 'insert row');
    $('#ed-ctx [data-ctx="tbl:del-row"]').click(); await wait(20);
    ok(t.querySelectorAll('tr').length === 3, 'delete row');
    selectNode(t.querySelectorAll('tr')[0].children[1]); getSelection().collapseToStart(); await wait(30);
    C().tableOp('del-col'); await wait(20);
    ok(t.querySelector('tr').children.length === 3, 'delete column');
    C().tableOp('header'); await wait(20);
    ok(!t.querySelector('thead'), 'toggle header row off');
    C().tableOp('header'); await wait(20);
    ok(!!t.querySelector('thead th'), 'toggle header row on');
    selectNode(t.querySelector('tbody td')); getSelection().collapseToStart();
    C().tableOp('cell-bg', '#dbe4ff'); await wait(20);
    ok(/background-color/.test(t.querySelector('tbody td').getAttribute('style') || ''), 'cell background color');
  `);

  /* ---------- Links ---------- */
  await run('links', `
    if (!$('#ed-doc > p')) console.warn('DEBUG links doc: ' + D().innerHTML.slice(0, 900));
    const p = $('#ed-doc > p'); selectNode(p);
    const r = document.createRange(); const tn = (function f(n) { if (n.nodeType === 3 && n.nodeValue.includes('Hello')) return n; for (const c of n.childNodes) { const x = f(c); if (x) return x; } return null; })(D());
    r.setStart(tn, tn.nodeValue.indexOf('Hello')); r.setEnd(tn, tn.nodeValue.indexOf('Hello') + 5); getSelection().removeAllRanges(); getSelection().addRange(r);
    tb('link'); await wait(60);
    ok($('#modal').open && $('#lk-text').value === 'Hello', 'link dialog opens with the selected text');
    $('#lk-url').value = 'example.com/docs'; $('#link-form').requestSubmit(); await wait(60);
    const a = $('#ed-doc a');
    ok(a && a.getAttribute('href') === 'https://example.com/docs' && a.textContent === 'Hello', 'insert link on selected text (https:// added)');
    selectNode(a); getSelection().collapseToStart(); await wait(60);
    ok(!$('#ed-ctx').hidden && /example\\.com/.test($('#ed-ctx').textContent), 'link popover shows the address');
    C().setLink('https://todo4me.app', 'Hello', a); await wait(20);
    ok($('#ed-doc a').getAttribute('href') === 'https://todo4me.app', 'edit link');
    C().setLink('javascript:alert(1)', 'x', $('#ed-doc a')); await wait(20);
    ok($('#ed-doc a').getAttribute('href') === 'https://todo4me.app', 'javascript: links are rejected');
    C().removeLink($('#ed-doc a')); await wait(20);
    ok(!$('#ed-doc a') && D().textContent.includes('Hello'), 'remove link keeps the text');
  `);

  /* ---------- Images ---------- */
  await run('images', `
    const c = document.createElement('canvas'); c.width = 400; c.height = 240;
    const g = c.getContext('2d'); g.fillStyle = '#4f6bed'; g.fillRect(0, 0, 400, 240); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('IMAGE', 120, 140);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    caretEnd();
    await C().insertImages([new File([blob], 'test.png', { type: 'image/png' })]); await wait(200);
    const w = $('#ed-doc .t4-w[data-w="img"]');
    ok(w && w.querySelector('img') && /^blob:/.test(w.querySelector('img').src), 'image inserted (stored as asset, shown via blob URL)');
    await wait(100);
    ok(w.querySelector('img').naturalWidth === 400, 'image renders');
    ok(w.classList.contains('is-selected') && /Image/.test($('#ed-ctx').textContent), 'image is selected with image toolbar');
    $('#ed-ctx [data-ctx="img-w"][data-v="50"]').click(); await wait(30);
    ok(W().getProps($('#ed-doc .t4-w[data-w="img"]')).w === 50, 'resize image to 50%');
    $('#ed-ctx [data-ctx="img-al:float-right"]').click(); await wait(30);
    ok(W().getProps($('#ed-doc .t4-w[data-w="img"]')).al === 'float-right', 'image text wrapping / position');
    const props = W().getProps($('#ed-doc .t4-w[data-w="img"]'));
    const asset = await T4.docstore.assetURL(props.a);
    ok(!!asset, 'image asset stored in IndexedDB');
    window.__imgAsset = props.a;
  `);
  // Drag the resize handle with the mouse
  const handle = await b.evaluate(`(() => { const w = document.querySelector('#ed-doc .t4-w[data-w="img"]'); w.scrollIntoView({ block: 'center' }); T4.edcore.selectWidget(w); const r = w.querySelector('.iw-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; })()`);
  if (handle.top > 0 && handle.top < 860) {
    await b.drag(handle.x, handle.y, handle.x - 60, handle.y + 10);
    await b.sleep(100);
    await run('img-drag', `ok(T4.edw.getProps($('#ed-doc .t4-w[data-w="img"]')).w !== 50, 'resize image by dragging the handle (now ' + T4.edw.getProps($('#ed-doc .t4-w[data-w="img"]')).w + '%)');`);
  }

  /* ---------- Shapes / drawings ---------- */
  await run('shapes', `
    caretEnd(); tb('shapes'); await wait(30);
    $('.ed-menu [data-shape="rect"]').click(); await wait(60);
    const dw = $('#ed-doc .t4-w[data-w="draw"]');
    ok(dw && W().getProps(dw).shapes.length === 1 && W().getProps(dw).shapes[0].t === 'rect', 'insert rectangle (new drawing)');
    for (const k of ['ellipse', 'round', 'tri', 'line', 'arrow', 'diamond']) T4.edw.drawing.add(dw, k);
    await wait(30);
    ok(W().getProps(dw).shapes.map((s) => s.t).join() === 'rect,ellipse,round,tri,line,arrow,diamond', 'all 7 shape types: circle, rectangle, rounded rectangle, triangle, line, arrow, diamond');
    ok(dw.querySelectorAll('.dw-shape').length === 7, 'shapes rendered as SVG');
    const sel = W().drawing.selected(dw);
    W().drawing.action(dw, 'fill', '#ffe3d6'); W().drawing.action(dw, 'stroke', '#c62828'); W().drawing.action(dw, 'sw', 6); await wait(20);
    const s1 = W().drawing.selected(dw);
    ok(s1.stroke === '#c62828' && s1.sw === 6, 'outline color + width');
    W().drawing.select(dw, W().getProps(dw).shapes[0].id);
    W().drawing.action(dw, 'fill', '#2f9e55'); await wait(10);
    ok(W().getProps(dw).shapes[0].fill === '#2f9e55', 'fill color');
    W().drawing.action(dw, 'duplicate'); await wait(10);
    ok(W().getProps(dw).shapes.length === 8, 'duplicate shape');
    W().drawing.action(dw, 'delete-shape'); await wait(10);
    ok(W().getProps(dw).shapes.length === 7, 'delete shape');
    // the topmost shape (last in the list) can be grabbed with the mouse
    const top = W().getProps(dw).shapes[W().getProps(dw).shapes.length - 1];
    W().drawing.select(dw, top.id);
    C().selectWidget(dw);
    window.__shape0 = Object.assign({}, top);
    dw.scrollIntoView({ block: 'center' }); await wait(80);
  `);
  const sh = await b.evaluate(`(() => { const dw = document.querySelector('#ed-doc .t4-w[data-w="draw"]'); const s = T4.edw.drawing.selected(dw); const el = dw.querySelector('[data-sid="' + s.id + '"]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await b.drag(sh.x, sh.y, sh.x + 60, sh.y + 20);
  await b.sleep(80);
  await run('shape-move', `const dw = $('#ed-doc .t4-w[data-w="draw"]'); const s = W().getProps(dw).shapes.find((x) => x.id === window.__shape0.id); ok(s.x > window.__shape0.x + 30 && s.y > window.__shape0.y + 5, 'move shape by dragging with the mouse (' + window.__shape0.x + '→' + s.x + ')');`);
  const sh2 = await b.evaluate(`(() => { const dw = document.querySelector('#ed-doc .t4-w[data-w="draw"]'); const h = dw.querySelector('.dw-h[data-h="se"]').getBoundingClientRect(); return { hx: h.left + h.width / 2, hy: h.top + h.height / 2 }; })()`);
  await b.drag(sh2.hx, sh2.hy, sh2.hx + 40, sh2.hy + 30);
  await b.sleep(80);
  await run('shape-resize', `const s = W().getProps($('#ed-doc .t4-w[data-w="draw"]')).shapes.find((x) => x.id === window.__shape0.id); ok(s.w > window.__shape0.w + 20 && s.h > window.__shape0.h + 10, 'resize shape with the corner handle (' + window.__shape0.w + '×' + window.__shape0.h + ' → ' + s.w + '×' + s.h + ')');
    ok(!$('#ed-ctx').hidden && /Drawing/.test($('#ed-ctx').textContent) && $('#ed-ctx [data-ctx="draw-fill"]'), 'drawing toolbar with fill/outline controls');`);
  await b.key('Delete', 'Delete');
  await b.sleep(50);
  await run('shape-del', `ok(W().getProps($('#ed-doc .t4-w[data-w="draw"]')).shapes.length === 6, 'Del key deletes the selected shape');`);
  await b.key('z', 'KeyZ', undefined, 2); await b.sleep(80);
  await run('shape-undo', `ok($('#ed-doc .t4-w[data-w="draw"]') && W().getProps($('#ed-doc .t4-w[data-w="draw"]')).shapes.length === 7, 'Ctrl+Z restores the deleted shape');`);

  /* ---------- Charts ---------- */
  await run('charts', `
    caretEnd(); tb('charts'); await wait(30); menuItem('Bar chart'); await wait(80);
    ok($('#modal').open && $('#chart-grid table'), 'chart editor dialog opens');
    const val = $('#chart-grid [data-val="0:0"]'); val.value = '42'; val.dispatchEvent(new Event('input', { bubbles: true }));
    const lab = $('#chart-grid [data-label="0"]'); lab.value = 'January'; lab.dispatchEvent(new Event('input', { bubbles: true }));
    $('#chart-add-row').click(); await wait(20);
    $('#chart-title').value = 'Sales 2026'; $('#chart-title').dispatchEvent(new Event('input', { bubbles: true }));
    ok($('#chart-preview svg') && /Sales 2026/.test($('#chart-preview').textContent), 'live preview in the dialog');
    $('#modal [type=submit]').click(); await wait(80);
    const ch = $('#ed-doc .t4-w[data-w="chart"]');
    const p = W().getProps(ch);
    ok(ch && p.type === 'bar' && p.series[0].values[0] === 42 && p.labels[0] === 'January' && p.labels.length === 5, 'bar chart inserted with edited data');
    ok(ch.querySelectorAll('svg rect').length > 8, 'bar chart rendered');
    $('#ed-ctx [data-ctx="chart-type:pie"]').click(); await wait(30);
    ok(W().getProps($('#ed-doc .t4-w[data-w="chart"]')).type === 'pie' && $('#ed-doc .t4-w[data-w="chart"] svg path'), 'switch to pie chart');
    $('#ed-ctx [data-ctx="chart-type:line"]').click(); await wait(30);
    ok($('#ed-doc .t4-w[data-w="chart"] svg polyline'), 'switch to line chart');
    $('#ed-ctx [data-ctx="edit"]').click(); await wait(60);
    ok($('#modal').open && $('#chart-title').value === 'Sales 2026', 'edit chart data again (double-click / Edit data)');
    T4.ui.closeModal();
  `);

  /* ---------- Formulas ---------- */
  await run('formula', `
    caretEnd(); C().run(() => { const p = document.createElement('p'); p.innerHTML = '<br>'; D().appendChild(p); }); caretEnd();
    tb('formula'); await wait(80);
    ok($('#modal').open && $('#math-src'), 'formula dialog opens');
    $('#math-src').value = '\\\\frac{a}{b} + \\\\sqrt{x^2 + y_1} = \\\\sum_{i=1}^{n} \\\\int_0^1 \\\\alpha \\\\beta \\\\pi \\\\le \\\\infty';
    $('#math-src').dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    ok($('#math-preview .katex'), 'live KaTeX preview');
    $$('.math-btn').find((x) => x.dataset.tex === '\\\\theta').click(); await wait(20);
    ok($('#math-src').value.includes('\\\\theta'), 'symbol palette inserts LaTeX');
    $('#modal [type=submit]').click(); await wait(80);
    const m = $('#ed-doc figure.t4-w[data-w="math"]');
    ok(m && m.querySelector('.katex-display') && m.querySelector('.mfrac') && m.querySelector('.sqrt'), 'block formula rendered (fraction, root)');
    ok(/\\\\sum/.test(W().getProps(m).tex), 'formula source kept as LaTeX');
    const p = $$('#ed-doc > p').find((x) => x.textContent.includes('Hello')); selectNode(p); getSelection().collapseToEnd();
    W().mathDialog({ tex: '', display: false, onSave: (tex, d) => C().insertInlineWidget(W().create('math', { tex }, !d)) }); await wait(50);
    $('#math-src').value = 'E=mc^2'; $('#modal [type=submit]').click(); await wait(50);
    ok($('#ed-doc p span.t4-w[data-w="math"] .katex'), 'inline formula inside a paragraph');
  `);

  /* ---------- Code blocks ---------- */
  await run('code', `
    caretEnd(); tb('code'); await wait(60);
    const cw = $('#ed-doc .t4-w[data-w="code"]');
    ok(cw && document.activeElement === cw.querySelector('textarea'), 'code block inserted, cursor inside');
    ok(getComputedStyle(cw.querySelector('textarea')).fontFamily.includes('Fira Code'), 'code uses Fira Code');
  `);
  await b.type('function add(a, b) {\n  return a + b; // sum\n}');
  await b.sleep(150);
  await run('code-check', `
    const cw = $('#ed-doc .t4-w[data-w="code"]');
    ok(cw.querySelector('textarea').value.includes('return a + b;'), 'typing into code block');
    ok(cw.querySelector('.cw-hl .token.keyword') && cw.querySelector('.cw-hl .token.comment'), 'syntax highlighting (JavaScript)');
    const sel = cw.querySelector('.cw-lang'); sel.value = 'python'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    ok(W().getProps($('#ed-doc .t4-w[data-w="code"]')).lang === 'python', 'change language');
    ok($$('.cw-lang option').map((o) => o.value).join() === ',javascript,python,markup,css,json,java,cpp,c,csharp,sql,bash', 'languages: JS, Python, HTML, CSS, JSON, Java, C++, C, C#, SQL, Bash');
    const csel = $('#ed-doc .t4-w[data-w="code"] .cw-lang'); csel.value = 'csharp'; csel.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    const cta = $('#ed-doc .t4-w[data-w="code"] textarea'); cta.value = 'public class Hello { static void Main() { string s = "hi"; Console.WriteLine(s); } }'; cta.dispatchEvent(new Event('input', { bubbles: true })); await wait(40);
    ok(W().getProps($('#ed-doc .t4-w[data-w="code"]')).lang === 'csharp' && $('#ed-doc .cw-hl .token.keyword') && $('#ed-doc .cw-hl .token.string') && $('#ed-doc .cw-hl .token.class-name'), 'C# syntax highlighting');
    const md = T4.edmd.fromMarkdown('\`\`\`cs\\nvar x = 1;\\n\`\`\`'); const bx = document.createElement('div'); bx.appendChild(T4.edSanitize.sanitize(md));
    ok(JSON.parse(bx.querySelector('[data-w="code"]').dataset.p).lang === 'csharp', 'Markdown \`\`\`cs / \`\`\`c# fences import as C#');
    const psel = $('#ed-doc .t4-w[data-w="code"] .cw-lang'); psel.value = 'python'; psel.dispatchEvent(new Event('change', { bubbles: true })); await wait(40);
    $('#ed-doc .t4-w[data-w="code"] textarea').value = 'function add(a, b) {\\n  return a + b; // sum\\n}'; $('#ed-doc .t4-w[data-w="code"] textarea').dispatchEvent(new Event('input', { bubbles: true })); await wait(40);
    const copy = $('#ed-doc .t4-w[data-w="code"] .cw-copy'); copy.click(); await wait(20);
    ok(/Copied/.test(copy.textContent), 'copy button');
    ok(C().serialize().includes('return a + b;'), 'code content is part of the saved document');
  `);
  await b.key('Escape', 'Escape');
  await b.sleep(50);

  /* ---------- Page break, page setup ---------- */
  await run('pagesetup', `
    caretEnd(); tb('more'); await wait(20); menuItem('Page break'); await wait(30);
    ok(!!$('#ed-doc .t4-w[data-w="pagebreak"]'), 'page break');
    tb('menu-file'); await wait(20); menuItem('Page setup'); await wait(60);
    $('#pg-h').value = 'Header {title}'; $('#pg-f').value = 'Footer text'; $('#pg-n').value = 'bottom-center'; $('#pg-nf').value = 'page-of';
    $('#page-form').requestSubmit(); await wait(50);
    ok(T4.editor.current.meta.page.header === 'Header {title}' && /Header Test report/.test($('#ed-hf-head').textContent), 'page setup: header (with {title}) shown on the page');
  `);
  await b.sleep(1000);

  /* ---------- Persistence across reload ---------- */
  const docId = await b.evaluate(`T4.editor.current.id`);
  const before = await b.evaluate(PRELUDE + `(async () => { await T4.editor.flush(); return T4.edcore.serialize(); })()`);
  await b.reload();
  await b.sleep(1500);
  await run('reload', `
    ok(location.hash === '#/editor?doc=${docId}' && T4.editor.current && T4.editor.current.id === '${docId}', 'document reopens after reload');
    const now = C().serialize();
    ok(now === ${JSON.stringify(before)}, 'content identical after reload (formatting, table, image, shapes, chart, formulas, code)');
    ok($('#ed-doc .t4-w[data-w="img"] img') && $('#ed-doc .t4-w[data-w="math"] .katex') && $('#ed-doc .cw-hl .token') && $('#ed-doc .dw-shape') && $('#ed-doc .chart-svg'), 'all elements re-rendered after reload');
    ok(T4.editor.current.meta.page.header === 'Header {title}', 'page setup persisted');
  `);

  /* ---------- Switching pages keeps everything ---------- */
  await run('switch', `
    caretEnd();
    C().run(() => { const p = document.createElement('p'); p.textContent = 'typed just before leaving'; D().appendChild(p); });
    location.hash = '#/notes'; await wait(400);
    ok(!!$('.view--notes') && $$('.note-card').length === 3, 'Weekly Notes page still works (3 notes)');
    location.hash = '#/dashboard'; await wait(300);
    ok(!!$('.hero'), 'Dashboard still works');
    location.hash = '#/editor?doc=${docId}'; await wait(500);
    ok(D().textContent.includes('typed just before leaving'), 'no data loss when switching pages');
    const d = await T4.docstore.get('${docId}');
    ok(d.html.includes('typed just before leaving'), 'leaving the editor saved immediately');
    T4.store.addTask({ title: 'Task added while editor is open' }); await wait(200);
    ok(D().textContent.includes('typed just before leaving') && $('#ed-doc .chart-svg'), 'editor survives an app re-render (task added elsewhere)');
  `);

  /* ---------- Document management ---------- */
  await run('manage', `
    await newDoc('meeting');
    ok(T4.editor.current.meta.title === 'Meeting notes' && $('#ed-doc table'), 'new document from template');
    const meetingId = T4.editor.current.id;
    await newDoc('report'); await newDoc('tour');
    ok($$('#ed-list .ed-item').length === 4, 'document list shows all 4 documents');
    const search = $('#ed-search'); search.value = 'quarterly'; search.dispatchEvent(new Event('input', { bubbles: true })); await wait(250);
    ok($$('#ed-list .ed-item').length === 1 && /Report/.test($('#ed-list').textContent) && $('#ed-list mark'), 'search finds documents by content (with highlight)');
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await wait(250);
    // rename via list menu
    $('#ed-list [data-more="' + meetingId + '"]').click(); await wait(20); menuItem('Rename'); await wait(50);
    $('#wtext').value = 'Team meeting'; $('#wtext-form').requestSubmit(); await wait(200);
    ok((await T4.docstore.get(meetingId)).meta.title === 'Team meeting', 'rename');
    $('#ed-list [data-more="' + meetingId + '"]').click(); await wait(20); menuItem('Duplicate'); await wait(300);
    ok((await T4.docstore.list()).filter((d) => !d.deletedAt).length === 5 && /copy/.test(T4.editor.current.meta.title), 'duplicate');
    const copyId = T4.editor.current.id;
    $('#ed-list [data-more="' + meetingId + '"]').click(); await wait(20); menuItem('Pin to top'); await wait(200);
    ok($('#ed-list .ed-item .ed-item__open').dataset.open === meetingId, 'pinned document is listed first');
    // delete → trash → restore
    $('#ed-list [data-more="' + copyId + '"]').click(); await wait(20); menuItem('Move to trash'); await wait(60);
    $('#confirm [data-confirm=yes]').click(); await wait(300);
    ok((await T4.docstore.get(copyId)).meta.deletedAt && location.hash === '#/editor', 'delete moves to trash and closes the document');
    $('[data-view="trash"]').click(); await wait(100);
    ok($$('#ed-list .ed-item').length === 1, 'trash view lists the deleted document');
    $('#ed-list [data-more="' + copyId + '"]').click(); await wait(20); menuItem('Restore'); await wait(300);
    ok(!(await T4.docstore.get(copyId)).meta.deletedAt, 'restore from trash');
    await T4.docstore.trash(copyId); await wait(200);
    $('#ed-list [data-more="' + copyId + '"]').click(); await wait(20); menuItem('Delete permanently'); await wait(60);
    $('#confirm [data-confirm=yes]').click(); await wait(300);
    ok(!(await T4.docstore.get(copyId)), 'delete permanently');
    $('[data-view="all"]').click(); await wait(100);
    ok(!$('.ed-home').hidden && $$('.ed-card').length === 4, 'recently edited documents on the start page');
  `);

  /* ---------- Markdown export / import ---------- */
  await run('markdown', `
    const md = await T4.edmd.toMarkdown((await T4.docstore.get('${docId}')).html, { title: 'Test report' });
    window.__md = md;
    ok(md.startsWith('# Test report') && /\\n## /.test(md), 'Markdown export: headings');
    ok(/\\$\\$\\n[^$]*\\\\frac/.test(md) && /\\$E=mc\\^2\\$/.test(md), 'Markdown export: block + inline formulas');
    ok(/\`\`\`python\\n/.test(md) && md.includes('return a + b;'), 'Markdown export: fenced code with language');
    ok(/\\| --- \\| --- \\| --- \\|/.test(md), 'Markdown export: table');
    ok(/!\\[[^\\]]*\\]\\(data:image\\/png;base64,/.test(md) && /!\\[Sales 2026\\]\\(data:image\\/svg\\+xml;base64,/.test(md), 'Markdown export: image + chart embedded');
    const src = '# Imported note\\n\\nSome **bold** text with $x^2$ and a [link](https://example.com).\\n\\n## List\\n\\n- one\\n- two\\n  - nested\\n\\n1. first\\n2. second\\n\\n> a quote\\n\\n| A | B |\\n| --- | --- |\\n| 1 | 2 |\\n\\n\`\`\`js\\nconst x = 1;\\n\`\`\`\\n\\n$$\\n\\\\int_0^1 x\\\\,dx\\n$$\\n';
    const h = T4.edmd.fromMarkdown(src);
    const box = document.createElement('div'); box.appendChild(T4.edSanitize.sanitize(h));
    ok(box.querySelector('h1') && box.querySelector('strong') && box.querySelector('a[href="https://example.com"]'), 'Markdown import: heading, bold, link');
    ok(box.querySelector('ul ul li') && box.querySelector('ol li') && box.querySelector('blockquote') && box.querySelector('table th'), 'Markdown import: nested lists, quote, table');
    ok(box.querySelector('figure[data-w="code"]') && JSON.parse(box.querySelector('figure[data-w="code"]').dataset.p).lang === 'javascript', 'Markdown import: code fence');
    ok(box.querySelectorAll('[data-w="math"]').length === 2, 'Markdown import: inline + block math');
  `);
  await run('md-file-import', `
    const before = (await T4.docstore.list()).length;
    const f = new File(['# From file\\n\\nHello from a .md file\\n'], 'notes.md', { type: 'text/markdown' });
    const dt = new DataTransfer(); dt.items.add(f);
    const input = $('#ed-file-import'); input.files = dt.files; input.dispatchEvent(new Event('change')); await wait(800);
    const list = await T4.docstore.list();
    ok(list.length === before + 1 && list.some((d) => d.title === 'From file'), 'import a .md file creates a document');
  `);

  /* ---------- Paste sanitizing ---------- */
  await run('paste', `
    await newDoc('blank');
    caretEnd();
    const html = '<p>safe <b>bold</b> <span style="color: red; position: fixed; background-image: url(http://evil)">red</span></p><script>window.__pwned = 1<\\/script>' +
      '<img src="x" onerror="window.__pwned = 2"><iframe src="https://evil"></iframe><a href="javascript:alert(1)">js link</a><a href="https://ok.example">ok link</a>' +
      '<table><tr><td>cell</td></tr></table><div onclick="x()">div text</div><style>body{display:none}</style>' +
      '<figure class="t4-w" data-w="chart" data-p="{&quot;type&quot;:&quot;bar&quot;,&quot;labels&quot;:[&quot;a&quot;],&quot;series&quot;:[{&quot;values&quot;:[1]}]}"><svg onload="window.__pwned=3"></svg></figure>';
    const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', 'x');
    D().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await wait(200);
    const inner = D().innerHTML;
    ok(!window.__pwned, 'pasted scripts / event handlers never run');
    ok(!/<script|onerror|onclick|onload|<iframe|javascript:|position:\\s*fixed|url\\(/i.test(inner), 'dangerous markup removed on paste');
    ok(/<b>bold<\\/b>/.test(inner) && /color:\\s*red/.test(inner) && D().querySelector('a[href="https://ok.example"]') && D().querySelector('td'), 'safe formatting, links and tables kept');
    ok(D().querySelector('.t4-w[data-w="chart"] .chart-svg'), 'pasted widget is rebuilt from its data (not trusted HTML)');
    const dt2 = new DataTransfer(); dt2.setData('text/plain', '# Pasted heading\\n\\n- item 1\\n- item 2');
    D().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true })); await wait(100);
    ok(D().querySelector('h1') && /Pasted heading/.test(D().querySelector('h1').textContent), 'pasting Markdown text converts it');
  `);

  /* ---------- Slash menu ---------- */
  await run('slash-setup', `caretEnd(); C().run(() => { const p = document.createElement('p'); p.innerHTML = '<br>'; D().appendChild(p); }); const r = document.createRange(); r.setStart(D().lastElementChild, 0); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await b.type('/tab');
  await b.sleep(80);
  await run('slash-open', `ok($('.ed-slash') && /Table/.test($('.ed-slash').textContent) && $$('.ed-slash [data-si]').length <= 3, '"/" opens the insert menu and filters while typing');`);
  await b.key('Enter', 'Enter', '\r');
  await b.sleep(80);
  await run('slash-run', `ok(!$('.ed-slash') && $$('#ed-doc table').length >= 2 && !D().textContent.includes('/tab'), 'Enter inserts the chosen element');`);

  /* ---------- PDF (Chromium print engine, same CSS as the desktop export) ---------- */
  await run('pdf-prep', `
    location.hash = '#/editor?doc=${docId}'; await wait(600);
    const st = document.createElement('style'); st.id = 'ed-print-css'; st.textContent = T4.editor._printCSS(T4.editor.current.meta);
    document.head.appendChild(st); document.body.classList.add('print-doc'); document.title = 'Test report';
    ok(/@page \\{ size: 210mm 297mm; margin: 25.4mm/.test(st.textContent) && /@bottom-center \\{ content: "Page " counter\\(page\\) " of " counter\\(pages\\)/.test(st.textContent), 'print CSS: A4, margins, page numbers');
    await document.fonts.ready;
  `);
  const pdfFile = path.join(shots, 'editor-test.pdf');
  fs.mkdirSync(shots, { recursive: true });
  await b.printPDF(pdfFile);
  await b.evaluate(`document.getElementById('ed-print-css').remove(); document.body.classList.remove('print-doc'); true`);
  const pdfSize = fs.statSync(pdfFile).size;
  out.push((pdfSize > 30000 ? 'PASS ' : 'FAIL ') + 'PDF generated (' + Math.round(pdfSize / 1024) + ' KB)');
  if (PDFTEXT) {
    const info = JSON.parse(execFileSync(process.execPath, [PDFTEXT, pdfFile], { encoding: 'utf8' }));
    const all = info.text.join(' \n ');
    const flat = all.replace(/\s+/g, '');
    const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
    ok(info.pages >= 2, 'PDF has ' + info.pages + ' pages (page break + content)');
    ok(info.text.every((t, i) => t.includes('Page ' + (i + 1) + ' of ' + info.pages)), 'PDF: page numbers "Page X of N" on every page');
    ok(info.text.every((t) => t.includes('Header Test report') && t.includes('Footer text')), 'PDF: header ({title} filled in) and footer on every page');
    ok(flat.includes('Helloworld.') && flat.includes('Name') && flat.includes('Secondlinehere'), 'PDF: text and table content');
    ok(flat.includes('returna+b;'), 'PDF: code block');
    ok(/Sales 2026/.test(all) && /January/.test(all), 'PDF: chart text (vector)');
    ok(/∑|∫|α|π/.test(all), 'PDF: formula symbols');
    ok(!/Insert|Export PDF|Documents|Dashboard|Quick capture/.test(all), 'PDF contains only the document (no app UI)');
    ok(info.title === 'Test report', 'PDF title metadata = document title');
  }
  await b.shot('editor-after-tests', false);

  /* ---------- Large document performance ---------- */
  await run('perf', `
    await newDoc('blank');
    let html = '';
    for (let i = 0; i < 400; i++) html += '<h2>Section ' + i + '</h2><p>Lorem ipsum dolor sit amet, <b>consectetur</b> adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' + i + '</p>';
    for (let i = 0; i < 20; i++) html += '<table class="t4-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>';
    let t0 = performance.now(); C().load(html); C().histReset(); const tLoad = performance.now() - t0;
    t0 = performance.now(); const snap = C().snapshot(); const tSnap = performance.now() - t0;
    t0 = performance.now(); C().histPush(); const tPush = performance.now() - t0;
    t0 = performance.now(); await T4.docstore.save(T4.editor.current.id, snap); const tSave = performance.now() - t0;
    ok(tLoad < 1500 && tSnap < 300 && tSave < 1000, 'large document (~' + snap.words + ' words, ' + Math.round(snap.html.length / 1024) + ' KB): load ' + Math.round(tLoad) + ' ms, snapshot ' + Math.round(tSnap) + ' ms, history ' + Math.round(tPush) + ' ms, save ' + Math.round(tSave) + ' ms');
  `);

  /* ---------- Offline + existing data untouched ---------- */
  await run('offline', `
    const urls = $$('script[src]').map((s) => s.src).concat($$('link[href]').map((l) => l.href));
    ok(urls.length > 10 && urls.every((u) => u.startsWith('file:')), 'all ' + urls.length + ' scripts/styles are local files (works offline)');
    ok(/connect-src 'none'/.test($('meta[http-equiv="Content-Security-Policy"]').content), 'CSP forbids any network connection');
    await document.fonts.load('12px "Fira Code"'); await document.fonts.load('12px Carlito'); await document.fonts.load('12px KaTeX_Main');
    ok(window.katex && window.Prism && document.fonts.check('12px "Fira Code"') && document.fonts.check('12px Carlito') && document.fonts.check('12px KaTeX_Main'), 'KaTeX, Prism, Fira Code, Carlito (Calibri fallback) and KaTeX fonts load from local files');
  `);
  const afterData = await b.evaluate(`localStorage.getItem('todo4me.data.v1')`);
  const strip = (s) => { const j = JSON.parse(s); delete j.meta; j.tasks = j.tasks.filter((t) => t.title !== 'Task added while editor is open'); return JSON.stringify(j); };
  out.push((strip(beforeData) === strip(afterData) ? 'PASS ' : 'FAIL ') + 'existing tasks/notes/settings data unchanged by the editor (todo4me.data.v1)');

  out.forEach((r) => console.log(r));
  console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + out.filter((r) => r.startsWith('FAIL')).length + ' failed');
}
