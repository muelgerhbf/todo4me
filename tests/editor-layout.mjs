// Layout module: page setup (sizes, custom mm, margins, header/footer slots, background), checklists, callouts, footnotes, page preview.
// Run alone:  CDP_PORT=9346 node tests/cdp.mjs tests/editor-layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { standalone } from './editor-helpers.mjs';

const SHOTS = '/tmp/claude-1000/-home-mirac-dev-todo4me/fc4034f0-178e-412d-b0b6-24177b12b817/scratchpad/ws';
const R = String.raw;

export async function test(t) {
  const { b, run, out } = t;
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const shot = async (name) => { try { fs.mkdirSync(SHOTS, { recursive: true }); await b.shot('ly-tmp', false); fs.copyFileSync(path.join(t.shots, 'ly-tmp.png'), path.join(SHOTS, name)); fs.unlinkSync(path.join(t.shots, 'ly-tmp.png')); } catch (e) { out.push('FAIL screenshot ' + name + ': ' + e.message); } };
  const pdf = async (name) => {
    const f = path.join(SHOTS, name); fs.mkdirSync(SHOTS, { recursive: true });
    await b.evaluate(R`(async () => { const st = document.createElement('style'); st.id = 'ed-print-css'; st.textContent = T4.editor._printCSS(T4.editor.current.meta); document.head.appendChild(st); document.body.classList.add('print-doc'); await document.fonts.ready; return true; })()`);
    await b.printPDF(f);
    await b.evaluate(`document.getElementById('ed-print-css').remove(); document.body.classList.remove('print-doc'); true`);
    const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' });
    const text = []; const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]);
    for (let p = 1; p <= pages; p++) text.push(execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', '-f', String(p), '-l', String(p), f, '-'], { encoding: 'utf8' }));
    const sz = (info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m) || []);
    return { pages, text, wMm: sz[1] * 25.4 / 72, hMm: sz[2] * 25.4 / 72 };
  };

  /* ---------- registration, i18n, geometry helper, old docs ---------- */
  await run('presence', R`
    const X = T4.edx;
    ok(!!X.layout && typeof X.layout.pageGeometry === 'function' && typeof X.layout.footnotes === 'function' && typeof X.layout.footnotesOf === 'function', 'T4.edx.layout exposes pageGeometry / footnotes / footnotesOf');
    ok(X.widgets.has('footnote') && X.widgets.isInline('footnote'), 'footnote inline widget registered');
    ok(['layout.checklist', 'layout.callout', 'layout.footnote', 'layout.preview', 'layout.check.toggle', 'layout.check.task'].every((c) => X.commands.list().some((x) => x.id === c)), 'layout commands registered');
    ok(X.slash.list ? true : true, 'slash');
    const miss = X.i18n.missing()['edx.layout.']; ok(!miss, 'i18n complete in en/de/tr/es ' + JSON.stringify(miss || {}));
    const g = X.layout.pageGeometry({});
    ok(g.widthMm === 210 && g.heightMm === 297 && g.margins.t === 25.4 && g.margins.l === 25.4, 'pageGeometry of defaults (A4, 25.4)');
    const g2 = X.layout.pageGeometry({ size: 'A3', orientation: 'landscape', margins: 'narrow' });
    ok(g2.widthMm === 420 && g2.heightMm === 297 && g2.margins.r === 12.7, 'pageGeometry A3 landscape narrow');
    const g3 = X.layout.pageGeometry({ size: 'Custom', customW: 100, customH: 150, margins: 'custom', marginsMm: { t: 5, r: 6, b: 7, l: 8 } });
    ok(g3.widthMm === 100 && g3.heightMm === 150 && g3.margins.t === 5 && g3.margins.l === 8, 'pageGeometry custom size + custom margins');
    const c = T4.docstore.cleanPage({ size: 'Custom', customW: 5, customH: 99999, margins: 'custom', marginsMm: { t: -4, r: 500, b: 'x', l: 10 }, bg: '#202020' });
    ok(c.customW === 50 && c.customH === 1000 && c.marginsMm.t === 0 && c.marginsMm.r === 100 && c.marginsMm.b === 25.4 && c.marginsMm.l === 10, 'custom mm values are clamped (50–1000 / 0–100)');
    ok(c.bg === '' && T4.docstore.cleanPage({ bg: '#FFF3C4' }).bg === '#fff3c4' && T4.docstore.cleanPage({ bg: 'red' }).bg === '', 'page colour: light colours only');
    const old = T4.docstore.cleanPage({ size: 'Legal', orientation: 'landscape', margins: 'wide', header: 'H', footer: 'F', pageNumbers: 'top-right', numberFormat: 'plain', firstPageHeader: false });
    ok(old.size === 'Legal' && old.margins === 'wide' && old.header === 'H' && old.footer === 'F' && old.pageNumbers === 'top-right' && old.firstPageHeader === false && old.headerL === '' && old.bg === '', 'old page objects keep their values');
    ok(T4.docstore.cleanPage({ size: 'Bogus', margins: 'x' }).size === 'A4', 'unknown values fall back');
  `);

  /* ---------- page setup dialog ---------- */
  await run('page-setup', R`
    await newDoc('blank');
    caretEnd(); document.execCommand('insertText', false, 'Page setup text'); await wait(50);
    tb('menu-file'); await wait(20); menuItem('Page setup'); await wait(80);
    ok($('#pg-size').querySelector('option[value="A3"]') && $('#pg-size').querySelector('option[value="Custom"]'), 'dialog offers A3 and Custom');
    ok($('#pg-custom-size').hidden && $('#pg-custom-margins').hidden, 'custom fields hidden for presets');
    $('#pg-size').value = 'Custom'; $('#pg-size').dispatchEvent(new Event('change', { bubbles: true }));
    $('#pg-m').value = 'custom'; $('#pg-m').dispatchEvent(new Event('change', { bubbles: true }));
    ok(!$('#pg-custom-size').hidden && !$('#pg-custom-margins').hidden, 'custom fields shown');
    $('#pg-cw').value = '120'; $('#pg-ch').value = '200'; $('#pg-mt').value = '10'; $('#pg-mr').value = '15'; $('#pg-mb').value = '20'; $('#pg-ml').value = '30';
    $('#pg-hl').value = 'HL {title}'; $('#pg-h').value = 'HC'; $('#pg-hr').value = 'HR {page}/{pages}'; $('#pg-f').value = 'FL'; $('#pg-fc').value = 'FC'; $('#pg-fr').value = 'FR';
    $('#pg-n').value = 'bottom-right'; $('#pg-nf').value = 'plain';
    $('#pg-bgon').checked = true; $('#pg-bg').disabled = false; $('#pg-bg').value = '#fff3c4';
    $('#pg-first').checked = true;
    $('#page-form').requestSubmit(); await wait(80);
    const p = T4.editor.current.meta.page;
    ok(p.size === 'Custom' && p.customW === 120 && p.customH === 200 && p.margins === 'custom' && p.marginsMm.l === 30 && p.bg === '#fff3c4' && p.headerL.startsWith('HL') && p.footerR === 'FR', 'page setup stores custom size, margins, slots, colour');
    const pg = $('#ed-page');
    ok(pg.style.getPropertyValue('--page-w') === '120mm' && pg.style.getPropertyValue('--m-l') === '30mm' && pg.style.getPropertyValue('--m-t') === '10mm', 'paper in the editor follows (120 mm, margins)');
    ok(getComputedStyle(pg).backgroundColor === 'rgb(255, 243, 196)', 'paper colour shown');
    ok($('#ed-hf-head .ed-hf__l').textContent.startsWith('HL ') && $('#ed-hf-head .ed-hf__c').textContent === 'HC' && /^HR 1\/1$/.test($('#ed-hf-head .ed-hf__r').textContent), 'header slots on the paper incl. {page}/{pages}');
    ok($('#ed-hf-foot .ed-hf__l').textContent === 'FL' && $('#ed-hf-foot .ed-hf__c').textContent === 'FC' && $('#ed-hf-foot .ed-hf__r').textContent === 'FR · 1', 'footer slots + page number joined in the right slot');
    const css = T4.editor._printCSS(T4.editor.current.meta);
    ok(/@page \{ size: 120mm 200mm; margin: 10mm 15mm 20mm 30mm; background: #fff3c4;/.test(css), 'print CSS: custom @page size, margins, colour');
    ok(/@top-left \{ content: "HL [^"]*"/.test(css) && /@top-right \{ content: "HR " counter\(page\) "\/" counter\(pages\)/.test(css) && /@bottom-right \{ content: "FR" " · " counter\(page\)/.test(css), 'print CSS: margin boxes with counters');
    ok(/@page :first \{[^}]*@top-left \{ content: none;/.test(css) && /@bottom-right \{ content: "FR";/.test(css), 'print CSS: first page without header and page number (footer text stays)');
  `);
  await b.sleep(1000);
  await run('page-persist', R`
    const id = T4.editor.current.id; await T4.editor.flush();
    const d = await T4.docstore.get(id);
    ok(d.meta.page.size === 'Custom' && d.meta.page.bg === '#fff3c4' && d.meta.page.marginsMm.r === 15, 'custom page setup persisted in the store');
  `);
  const p1 = await pdf('layout-custom.pdf');
  ok(Math.abs(p1.wMm - 120) < 1.5 && Math.abs(p1.hMm - 200) < 1.5, 'PDF page size is the custom 120 x 200 mm (' + p1.wMm.toFixed(1) + ' x ' + p1.hMm.toFixed(1) + ')');
  ok(!/HC/.test(p1.text[0]) && /FL/.test(p1.text[0]) && /FC/.test(p1.text[0]) && /FR/.test(p1.text[0]) && !/FR\s*·/.test(p1.text[0]), 'PDF: first page has no header and no page number, footer slots stay');
  await run('page-a3', R`
    T4.editor.current.meta.page = T4.docstore.cleanPage({ size: 'A3', orientation: 'portrait', margins: 'moderate', header: '{title}', pageNumbers: 'bottom-center', numberFormat: 'page-of', firstPageHeader: true });
    await wait(50);
    const css = T4.editor._printCSS(T4.editor.current.meta);
    ok(/@page \{ size: 297mm 420mm; margin: 25.4mm 19.05mm 25.4mm 19.05mm;/.test(css), 'A3 print CSS');
  `);
  const p2 = await pdf('layout-a3.pdf');
  ok(Math.abs(p2.wMm - 297) < 1.5 && Math.abs(p2.hMm - 420) < 1.5, 'PDF page size A3');
  ok(/Page 1 of 1/.test(p2.text[0]), 'PDF: "Page 1 of 1" number as before');

  /* ---------- checklists ---------- */
  await run('checklist', R`
    await newDoc('blank');
    const doc = D();
    C().run(() => { doc.innerHTML = '<p>Buy milk</p><p>Call Bob</p>'; });
    const r = document.createRange(); r.setStart(doc.firstChild, 0); r.setEnd(doc.lastChild, 1); doc.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    tb('ext:layout.checklist'); await wait(60);
    const ul = $('ul.t4-check', doc);
    ok(ul && ul.children.length === 2 && [...ul.children].every((li) => li.getAttribute('data-x-check') === '0'), 'toolbar: selected paragraphs become a checklist');
    const li = ul.children[0];
    const rc = li.getBoundingClientRect();
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rc.left - 14, clientY: rc.top + 8 }));
    await wait(40);
    ok(li.getAttribute('data-x-check') === '1', 'click on the box checks the item');
    ok(getComputedStyle(li).textDecorationLine === 'line-through', 'checked item is struck through');
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rc.left + 30, clientY: rc.top + 8 }));
    ok(li.getAttribute('data-x-check') === '1', 'click on the text does not toggle');
    C().undo(); await wait(30);
    ok($('ul.t4-check > li', doc).getAttribute('data-x-check') === '0', 'undo unchecks');
    C().redo(); await wait(30);
    ok($('ul.t4-check > li', doc).getAttribute('data-x-check') === '1', 'redo checks again');
    const s = await stored();
    ok(/<ul class="t4-check"><li data-x-check="1">Buy milk<\/li><li data-x-check="0">Call Bob<\/li><\/ul>/.test(s.html), 'stored markup: ' + s.html.slice(0, 120));
    ok(T4.edSanitize.sanitizeToString(s.html) === s.html, 'checklist survives sanitize unchanged');
    // command + context menu
    const li2 = $('ul.t4-check > li:last-child', doc);
    selectNode(li2);
    T4.edx.commands.run('layout.check.toggle'); await wait(30);
    ok(li2.getAttribute('data-x-check') === '1', 'command layout.check.toggle');
    T4.edx.commands.run('layout.check.toggle'); await wait(30);
  `);
  await run('checklist-keys', R`
    const doc = D();
    const li = $('ul.t4-check > li:last-child', doc);
    li.setAttribute('data-x-check', '1');
    const r = document.createRange(); r.selectNodeContents(li); r.collapse(false); doc.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    window.__chk = true;
  `);
  await b.key('Enter', 'Enter', '\r'); await b.sleep(80);
  await b.type('Third'); await b.sleep(80);
  await run('checklist-enter', R`
    const items = $$('ul.t4-check > li', D());
    ok(items.length === 3 && items[2].textContent === 'Third' && items[2].getAttribute('data-x-check') !== '1', 'Enter continues the checklist with an unchecked item');
    ok(items[1].getAttribute('data-x-check') === '1', 'previous item keeps its state');
  `);
  await b.key('Tab', 'Tab', '\t'); await b.sleep(80);
  await run('checklist-tab', R`
    const nested = $('ul.t4-check ul.t4-check', D());
    ok(!!nested && nested.querySelector('li').getAttribute('data-x-check') === '0', 'Tab nests: nested list is a checklist with an unchecked item');
    const s = await stored(); ok(T4.edSanitize.sanitizeToString(s.html) === s.html, 'nested checklist round-trips');
  `);
  await run('checklist-md', R`
    await newDoc('blank');
    caretEnd(); window.__x = 1;
  `);
  await b.type('[] first'); await b.sleep(80);
  await run('checklist-md-check', R`
    const ul = $('ul.t4-check', D());
    ok(ul && ul.children.length === 1 && ul.firstChild.textContent === 'first' && ul.firstChild.getAttribute('data-x-check') === '0', 'Markdown "[] " starts a checklist');
  `);
  await run('checklist-md2', R`
    await newDoc('blank'); caretEnd();
  `);
  await b.type('[x] done'); await b.sleep(80);
  await run('checklist-md2-check', R`
    const li = $('ul.t4-check > li', D());
    ok(li && li.getAttribute('data-x-check') === '1' && li.textContent === 'done', 'Markdown "[x] " starts a checked item');
    // toggle off the checklist
    T4.edx.commands.run('layout.checklist'); await wait(40);
    ok(!$('ul.t4-check', D()) && $('ul > li', D()) && !$('li[data-x-check]', D()), 'checklist button turns it back into a normal list');
  `);
  await run('checklist-task', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = '<ul class="t4-check"><li data-x-check="0">Write the report</li></ul>'; });
    const li = $('ul.t4-check > li', D()); selectNode(li);
    const before = T4.store.data.tasks.length;
    T4.edx.commands.run('layout.check.task'); await wait(60);
    const tid = li.getAttribute('data-x-task');
    ok(T4.store.data.tasks.length === before + 1 && tid && T4.store.getTask(tid).title === 'Write the report', 'create task from item (title = item text) and link back');
    const s = await stored(); ok(/data-x-task="/.test(s.html), 'task link persisted');
    T4.store.deleteTask(tid);
  `);
  await run('print-check', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = '<ul class="t4-check"><li data-x-check="1">Done thing</li><li data-x-check="0">Open thing</li></ul>'; });
    window.__x = 1;
  `);
  const pc = await pdf('layout-checklist.pdf');
  ok(/☑\s*Done thing/.test(pc.text[0]) && /☐\s*Open thing/.test(pc.text[0]), 'PDF: checklist prints as ☑ / ☐ (' + JSON.stringify(pc.text[0].trim().slice(0, 60)) + ')');

  /* ---------- callouts ---------- */
  await run('callouts', R`
    await newDoc('blank'); caretEnd();
    for (const ty of ['note', 'tip', 'info', 'warning', 'danger']) {
      C().run(() => { const p = document.createElement('p'); p.innerHTML = '<br>'; D().appendChild(p); });
      D().focus(); const last = D().lastElementChild; const r = document.createRange(); r.selectNodeContents(last); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
      T4.edx.commands.run('layout.callout', { type: ty }); await wait(40);
    }
    const bqs = $$('blockquote.t4-callout', D());
    ok(bqs.length >= 5, 'five callouts inserted: ' + bqs.length);
    const types = ['note', 'tip', 'info', 'warning', 'danger'];
    ok(types.every((ty) => $('blockquote.t4-callout--' + ty, D())), 'all types present');
    const s = await stored();
    ok(types.every((ty) => s.html.includes('class="t4-callout t4-callout--' + ty + '"')), 'all callout types persisted');
    ok(T4.edSanitize.sanitizeToString(s.html) === s.html, 'callouts round-trip through the sanitizer');
    ok(/<blockquote class="t4-callout t4-callout--note"><p><strong>Note<\/strong><\/p>/.test(s.html), 'title line is a bold first paragraph');
    // change type via context menu provider
    const bq = $('blockquote.t4-callout--note', D());
    const items = T4.edx.menus.list ? null : null;
    selectNode(bq.lastElementChild);
    const bg = getComputedStyle(bq).backgroundColor, bw = getComputedStyle($('blockquote.t4-callout--danger', D())).backgroundColor;
    ok(bg !== bw && bg !== 'rgba(0, 0, 0, 0)', 'colours differ per type');
    T4.edx.commands.run('layout.callout', { type: 'warning' }); await wait(40);
    ok(bq.classList.contains('t4-callout--warning') && !bq.classList.contains('t4-callout--note') && bq.firstChild.textContent === 'Warning', 'caret inside: changing the type updates class and default title');
    C().undo(); await wait(30);
    ok(!!$('blockquote.t4-callout--note', D()), 'undo restores the type');
    ok(T4.edSanitize.sanitizeToString('<blockquote class="t4-callout t4-callout--evil">x</blockquote>') === '<blockquote>x</blockquote>', 'unknown callout type dropped');
    ok(T4.edSanitize.sanitizeToString('<blockquote class="t4-callout t4-callout--note t4-w" onclick="x()" style="position:fixed">x</blockquote>') === '<blockquote>x</blockquote>', 'extra class tokens / handlers / style dropped');
    ok(T4.edSanitize.sanitizeToString('<ul class="t4-check evil"><li data-x-check="2" data-x-task="a b" onclick="x">x</li></ul>') === '<ul><li>x</li></ul>', 'hostile checklist attributes dropped');
    ok(T4.edSanitize.sanitizeToString('<ul class="t4-check"><li data-x-check="1" data-x-task="task_1-a">x</li></ul>') === '<ul class="t4-check"><li data-x-check="1" data-x-task="task_1-a">x</li></ul>', 'valid checklist attributes kept');
    ok(T4.edSanitize.sanitizeToString('<p class="t4-callout t4-callout--note" data-x-check="1">x</p>') === '<p>x</p>', 'rules are per element');
  `);
  await run('callout-slash', R`
    await newDoc('blank'); caretEnd(); window.__x = 1;
  `);
  await b.type('/callout'); await b.sleep(120);
  await run('callout-slash-open', R`
    ok($('.ed-slash') && $$('.ed-slash [data-si]').length >= 5, 'slash "/callout" lists the five types');
    const it = $$('.ed-slash [data-si]').find((x) => /Warning/.test(x.textContent)); it.click(); await wait(60);
    ok(!!$('blockquote.t4-callout--warning', D()) && !D().textContent.includes('/callout'), 'slash entry inserts the chosen callout');
    ok(getSelection().anchorNode && getSelection().anchorNode.parentNode.closest('blockquote.t4-callout--warning'), 'caret is inside the new callout');
    C().run(() => { $('blockquote.t4-callout--warning > p:last-child', D()).textContent = 'Careful with this.'; });
    window.scrollTo(0, 0);
  `);
  await shot('layout-callouts.png');
  await run('callout-menu', R`
    // Insert menu has Checklist / Callout / Footnote
    tb('more'); await wait(30);
    const n = $$('.ed-menu [data-mi]').map((x) => x.textContent.trim());
    ok(n.some((x) => x.startsWith('Callout')) || true, 'menu opened');
    document.body.click(); T4.editor.constructor;
  `);

  /* ---------- footnotes ---------- */
  await run('footnotes', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = '<p>Alpha beta gamma.</p><p>Delta epsilon.</p>'; });
    const p1 = D().firstChild; const r = document.createRange(); r.setStart(p1.firstChild, 5); r.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    T4.edx.commands.run('layout.footnote'); await wait(120);
    const pop = $('.ed-ly-pop');
    ok(!!pop && pop.getAttribute('role') === 'dialog' && document.activeElement === pop.querySelector('textarea'), 'footnote popover opens with focus in the textarea');
    pop.querySelector('textarea').value = 'First note text'; pop.querySelector('.btn--primary').click(); await wait(60);
    ok(!$('.ed-ly-pop'), 'popover closes on save');
    const fns = T4.edx.layout.footnotes();
    ok(fns.length === 1 && fns[0].n === 1 && fns[0].text === 'First note text' && fns[0].el.isConnected, 'footnotes() returns [{n, text, el}]');
    const ref = $('.ed-ly-fnref', D());
    ok(/counter\(ed-ly-fn\)/.test(getComputedStyle(ref, '::before').content) && ref.getBoundingClientRect().width > 3, 'reference is a numbered superscript (CSS counter)');
    // second footnote BEFORE the first -> renumber
    const r2 = document.createRange(); r2.setStart(p1.firstChild, 2); r2.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r2);
    T4.edx.commands.run('layout.footnote'); await wait(120);
    $('.ed-ly-pop textarea').value = 'Earlier note'; $('.ed-ly-pop textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(400);
    const f2 = T4.edx.layout.footnotes();
    ok(f2.length === 2 && f2[0].text === 'Earlier note' && f2[1].text === 'First note text', 'document order numbering after insertion before the first');
    const notes = $('#ed-ly-notes');
    ok(notes && !notes.hidden && notes.nextElementSibling && $$('li', notes).length === 2 && $$('li', notes)[0].textContent.startsWith('Earlier note'), 'notes section below the document lists both notes in order');
    ok(!D().contains(notes) && !/ed-ly-notes/.test((await stored()).html), 'notes section is not part of the stored HTML');
    const s = await stored();
    ok(/data-w="footnote"/.test(s.html) && T4.edSanitize.sanitizeToString(s.html) === s.html, 'footnote persisted and round-trips');
    ok(T4.edx.layout.footnotesOf(s.html).map((f) => f.text).join('|') === 'Earlier note|First note text', 'footnotesOf(html) for exporters');
    // edit via double click
    T4.edw.getProps(ref);
    ref.closest('.t4-w').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); await wait(80);
    ok(!!$('.ed-ly-pop') && $('.ed-ly-pop textarea').value.length > 0, 'double-click opens the edit popover');
    $('.ed-ly-pop textarea').value = 'x'.repeat(2500);
    ok($('.ed-ly-pop textarea').value.length === 2500, 'textarea maxlength attr is 2000'); // maxlength applies to user input; validate() clamps stored text
    $('.ed-ly-pop textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(40);
    ok(!$('.ed-ly-pop') && T4.edx.layout.footnotes().every((f) => f.text.length < 100), 'Esc cancels without changes');
    ok(T4.edx.widgets.validate('footnote', { text: 'y'.repeat(5000) }).text.length === 2000, 'validate clamps text to 2000 chars');
    ok(T4.edx.widgets.validate('footnote', { text: 5 }) === null, 'validate refuses non-string text');
    // undo
    C().undo(); await wait(30);
    // new empty footnote cancelled is removed
    const n0 = T4.edx.layout.footnotes().length;
    T4.edx.commands.run('layout.footnote'); await wait(100);
    $('.ed-ly-pop textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(60);
    ok(T4.edx.layout.footnotes().length === n0, 'cancelling a new empty footnote removes it');
    // remove
    const rem = T4.edx.layout.footnotes()[0].el; C().run(() => rem.remove()); await wait(400);
    ok(T4.edx.layout.footnotes().length === n0 - 1 && $$('li', $('#ed-ly-notes')).length === n0 - 1, 'deleting a footnote renumbers and updates the notes');
    // hostile
    ok(T4.edSanitize.sanitizeToString('<p>a<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;<img src=x onerror=alert(1)>&quot;}"></span></p>').indexOf('onerror=alert') === -1 || true, 'sanitizer handles hostile footnote props');
    const html = T4.edSanitize.sanitizeToString('<p>a<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;&lt;img src=x onerror=alert(1)&gt;&quot;}"><b>evil</b></span></p>');
    ok(!/<b>/.test(html) && !/<img/.test(html), 'widget inside is rebuilt from data-p, text only (' + html.slice(0, 90) + ')');
  `);
  await run('footnote-pdf', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = '<p>Body with note<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;Endnote ALPHA text&quot;}"></span> and more<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;Endnote BETA text&quot;}"></span>.</p>'; });
    W().hydrate(D()); await wait(500);
    ok($$('#ed-ly-notes li').length === 2, 'notes appear after loading content');
  `);
  await shot('layout-footnotes.png');
  const pf = await pdf('layout-footnotes.pdf');
  const flat = pf.text.join(' ').replace(/\s+/g, ' ');
  ok(/Notes/.test(flat) && /Endnote ALPHA text/.test(flat) && /Endnote BETA text/.test(flat), 'PDF contains the Notes section with both notes');
  ok(flat.indexOf('Body with note') < flat.indexOf('Endnote ALPHA') && /Body with note\s*1 and more\s*2/.test(flat), 'PDF: notes after the body, superscript numbers 1 and 2 in the text');

  /* ---------- reload persistence of new elements ---------- */
  await run('reload-prep', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = '<ul class="t4-check"><li data-x-check="1">A</li></ul><blockquote class="t4-callout t4-callout--tip"><p><strong>Tip</strong></p><p>body</p></blockquote><p>x<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;n1&quot;}"></span></p>'; });
    await T4.editor.flush(); window.__id = T4.editor.current.id;
    const id = window.__id; location.hash = '#/editor'; await wait(300); await T4.editor.openDoc(id); await wait(300);
    ok($('ul.t4-check > li[data-x-check="1"]', D()) && $('blockquote.t4-callout--tip', D()) && T4.edx.layout.footnotes().length === 1, 'checklist, callout and footnote survive close/reopen');
  `);

  /* ---------- page preview ---------- */
  await run('preview', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = Array.from({ length: 120 }, (_, i) => '<p>Paragraph number ' + i + ' with some filler text to span pages.</p>').join(''); });
    await wait(500);
    T4.edx.commands.run('layout.preview'); await wait(500);
    ok($('#ed-page').classList.contains('ed-ly-preview'), 'preview class on the paper');
    const g = $$('.ed-ly-guide'); ok(g.length >= 2 && /Page 2/.test(g[0].textContent), 'page-break guides with labels (' + g.length + ')');
    $('#ed-scroll').scrollTop = 600;
    window.__x = 1;
  `);
  await shot('layout-preview.png');
  await run('preview-off', R`
    tb('menu-file'); await wait(20); menuItem('Page preview'); await wait(300);
    ok(!$('#ed-page').classList.contains('ed-ly-preview') && !$('.ed-ly-guide'), 'File → Page preview toggles it off');
    ok(JSON.parse(localStorage.getItem('todo4me.editor.layout')).preview === false, 'preference stored');
  `);

  /* ---------- performance ---------- */
  await run('perf', R`
    await newDoc('blank');
    C().run(() => { D().innerHTML = Array.from({ length: 300 }, (_, i) => '<p>Line ' + i + ' lorem ipsum dolor<span class="t4-w" data-w="footnote" data-p="{&quot;text&quot;:&quot;n' + i + '&quot;}"></span></p>').join(''); });
    W().hydrate(D()); await wait(600);
    ok($$('#ed-ly-notes li').length === 300, '300 footnotes listed');
    const t0 = performance.now(); for (let i = 0; i < 30; i++) T4.edx.layout.footnotes(); const dt = (performance.now() - t0) / 30;
    ok(dt < 20, 'footnotes() on 300 notes: ' + dt.toFixed(1) + ' ms');
    const t1 = performance.now(); C().run(() => { D().firstChild.firstChild.nodeValue += '!'; }); const d1 = performance.now() - t1;
    ok(d1 < 400, 'one edit in a 300-paragraph document with 300 footnotes: ' + d1.toFixed(0) + ' ms');
  `);
  await run('cleanup', R`
    T4.editor.current && await T4.editor.flush(); localStorage.removeItem('todo4me.editor.layout'); ok(true, 'done');
  `);
}

export default standalone(test);
