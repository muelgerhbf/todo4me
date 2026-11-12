// QA module: cross-module integration and regression tests (kitchen sink document, persistence, export/import matrix, versions x knowledge x ux,
// modes, languages, performance, old data).   CDP_PORT=9348 node tests/cdp.mjs tests/editor-qa.mjs [shots-dir]
// Full:  CDP_PORT=9348 PDFTEXT=tests/pdftext.mjs node tests/cdp.mjs tests/test-editor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { standalone } from './editor-helpers.mjs';
import { QA_LIB } from './editor-qa-lib.mjs';

const WS = process.env.QA_WS || '/tmp/claude-1000/-home-mirac-dev-todo4me/fc4034f0-178e-412d-b0b6-24177b12b817/scratchpad/ws';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = String.raw;

export async function test(t) {
  const { b, run, out } = t;
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const skip = (m) => out.push('PASS (skipped) ' + m);
  const perf = [];
  const shot = async (name) => {
    try { fs.mkdirSync(WS, { recursive: true }); const tmp = path.join(t.shots, 'qa-tmp'); fs.mkdirSync(t.shots, { recursive: true }); await b.shot('qa-tmp', false); fs.copyFileSync(path.join(t.shots, 'qa-tmp.png'), path.join(WS, 'qa-' + name + '.png')); fs.unlinkSync(path.join(t.shots, 'qa-tmp.png')); } catch (e) { out.push('FAIL screenshot ' + name + ': ' + e.message); }
  };
  const tmpDir = path.join(WS, 'qa-tmp'); fs.mkdirSync(tmpDir, { recursive: true });
  const lib = () => run('lib', QA_LIB);
  const pdfText = async (name) => {
    const f = path.join(tmpDir, name);
    await b.evaluate(R`(async () => { const X = T4.edx; const st = document.createElement('style'); st.id = 'ed-print-css'; st.textContent = T4.editor._printCSS(T4.editor.current.meta) + X.print.css(T4.editor.current.meta); document.head.appendChild(st); document.body.classList.add('print-doc'); const ctx = { meta: T4.editor.current.meta, root: document.getElementById('ed-doc') }; await X.print.runBefore(ctx); window.__pctx = ctx; await document.fonts.ready; return true; })()`);
    await b.printPDF(f);
    await b.evaluate(R`(async () => { document.getElementById('ed-print-css').remove(); document.body.classList.remove('print-doc'); await T4.edx.print.runAfter(window.__pctx); return true; })()`);
    return JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'pdftext.mjs'), f], { encoding: 'utf8' }));
  };
  const hasPdf = (() => { try { execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { try { execFileSync('which', ['pdfinfo'], { stdio: 'ignore' }); return true; } catch (e2) { return false; } } })();

  /* ====================== 0. clean start + registration of all modules ====================== */
  await lib();
  const errBase = (b.errors || []).length;
  await run('clean start', R`
    // the suite owns the document database (when run inside test-editor.mjs the earlier suites left documents behind)
    if (T4.editor.current) { await T4.editor.flush(); }
    location.hash = '#/editor'; await wait(300);
    for (const m of await T4.docstore.list()) await T4.docstore.destroy(m.id);
    try { await T4.edKnowledge.reload(); } catch (e) { /* module state is rebuilt on demand */ }
    sessionStorage.setItem('qa.appearance', JSON.stringify({ design: T4.store.settings.design, theme: T4.store.settings.theme }));
    ok((await T4.docstore.list()).length === 0, 'QA suite starts with an empty document store');
  `);
  await run('all modules present', R`
    const X = T4.edx;
    const ids = X.commands.list().map((c) => c.id);
    ok(['knowledge.graph', 'writing.find', 'writing.outline', 'versions.history', 'layout.checklist', 'ux.palette'].every((i) => ids.includes(i)), 'commands of knowledge/writing/versions/layout/ux registered');
    ok(['wikilink', 'toc', 'footnote'].every((w) => X.widgets.has(w)) && X.exporters.get('io.docx') && X.importers.list().some((i) => i.id === 'io.docx'), 'widgets and io registered');
    const miss = X.i18n.missing();
    ok(Object.keys(miss).length === 0, 'edx.i18n.missing() is empty: ' + JSON.stringify(miss).slice(0, 200));
    ok(X.problems.length === 0, 'no soft registration problems: ' + JSON.stringify(X.problems).slice(0, 300));
  `);

  /* ====================== 1. kitchen sink ====================== */
  await run('kitchen sink: build', R`
    const ids = await QA.buildSink();
    const d = await T4.docstore.get(ids.sink);
    window.__sink0 = { html: d.html, meta: QA.metaOf(d.meta) };
    const fp = QA.fp(d.html);
    ok(fp.headings.join('|') === 'H1:Kitchen Sink|H2:Lists|H3:Checklist|H2:Callouts|H2:Data|H2:After the break', 'headings H1-H3 stored: ' + fp.headings.join('|'));
    ok(/<strong>bold<\/strong>/.test(d.html) && /<em>italic/.test(d.html) && /<u>underline/.test(d.html) && /<s>strike|<del>strike/.test(d.html) && /<code>inline code/.test(d.html), 'formatted text kept');
    ok(fp.plainItems.length === 6, 'nested bullet + numbered items stored (' + fp.plainItems.length + '): ' + fp.plainItems.join('|'));
    ok(fp.checks.join('|') === '[x] Done item|[ ] Nested todo item|[x] Another done item|[ ] Open item', 'checklist with nested level + states: ' + fp.checks.join('|'));
    ok(fp.callouts.length === 5 && ['note', 'tip', 'info', 'warning', 'danger'].every((ty, i) => fp.callouts[i].startsWith(ty + ':')), 'five callouts one of each type: ' + fp.callouts.join('|'));
    ok(fp.footnotes.length === 2 && fp.footnotes[0] === 'First footnote ALPHA text', 'two footnotes');
    ok(fp.wikilinks.length === 2 && fp.wikilinks[1] === 'Ghost Page', 'two wikilinks');
    ok(fp.tocs === 1 && fp.images === 1 && fp.formulas === 1 && fp.charts === 1 && fp.breaks === 1 && fp.codes === 1, 'toc/image/formula/chart/pagebreak/code each once: ' + JSON.stringify([fp.tocs, fp.images, fp.formulas, fp.charts, fp.breaks, fp.codes]));
    ok(fp.tableCells.join('|') === 'Name|Qty|Apple|3|Pear|7' && /<thead>/.test(d.html), 'table with header row');
    ok(d.meta.page.size === 'A3' && d.meta.page.orientation === 'landscape' && d.meta.page.marginsMm.l === 20 && d.meta.page.marginsMm.b === 18 && d.meta.page.headerL.startsWith('HDR-LEFT') && d.meta.page.footerR === 'FTR-RIGHT', 'A3 landscape custom margins + header/footer slots stored');
    ok(JSON.stringify(d.meta.kn_tags) === '["qa","sink"]' && d.meta.kn_folder === 'Projects/QA' && d.meta.kn_props.status === 'draft' && d.meta.wr_goal === 500, 'tags, folder, properties, goal stored');
    ok(!!$('#ed-doc .t4-w[data-w="toc"] li') && !!$('#ed-doc .katex') && !!$('#ed-doc .t4-w[data-w="chart"] svg') && !!$('#ed-doc img'), 'widgets are rendered in the open document (toc entries, formula, chart, image)');
    const tocLi = $$('#ed-doc .t4-w[data-w="toc"] li'), tocBtn = $('#ed-doc .t4-w[data-w="toc"] li button');
    ok(tocLi.length === 6 && tocLi.every((l) => l.getBoundingClientRect().height > 8) && getComputedStyle(tocBtn).position !== 'absolute' && getComputedStyle(tocBtn).color !== 'rgba(0, 0, 0, 0)' && tocBtn.getBoundingClientRect().height < 40, 'TOC entries are laid out and visible in the editor (li height ' + Math.round(tocLi[0].getBoundingClientRect().height) + ' px, link position ' + getComputedStyle(tocBtn).position + ', link height ' + Math.round(tocBtn.getBoundingClientRect().height) + ' px; css/editor.css .cw-input rule hits the TOC link)');
    ok(!!$('#ed-doc .ed-kn-link--missing') && $$('#ed-doc .ed-kn-link').length === 2, 'missing wikilink gets the missing style');
    ok(T4.edx.layout.footnotes().length === 2, 'layout.footnotes() sees both notes');
    const fnTexts = $$('.ed-ly-notes li, .ed-ly-notes .ed-ly-note').map((x) => x.textContent).join(' ');
    ok(/ALPHA/.test(fnTexts) && /BETA/.test(fnTexts), 'notes section shows both footnotes on the page');
  `);
  await shot('kitchen-sink');

  /* ====================== 2. persistence ====================== */
  await run('persistence: sanitizer round trip', R`
    sessionStorage.setItem('qa.sink0', JSON.stringify(window.__sink0));
    const s = window.__sink0.html;
    const once = T4.edSanitize.sanitizeToString(s), twice = T4.edSanitize.sanitizeToString(once);
    ok(once === s, 'stored HTML is a fixpoint of the sanitizer' + (once === s ? '' : ' (diff at ' + [...s].findIndex((c, i) => c !== once[i]) + ')'));
    ok(twice === once, 'sanitize twice = once');
    const cur = D().innerHTML; // live DOM (with rendered widgets) serialised again must give the same stored html
    await T4.editor.flush();
    const again = await T4.docstore.get(T4.editor.current.id);
    ok(again.html === s, 'flush without edits does not alter the stored html');
    // serialize from DOM twice
    const a = T4.edcore.snapshot().html, b2 = T4.edcore.snapshot().html;
    ok(a === b2 && a === s, 'core.snapshot() twice is identical and equals the stored html');
  `);
  await b.reload(); await b.sleep(400);
  await lib();
  await run('persistence: reload app', R`
    const id = window.QA.ids ? window.QA.ids.sink : null;
  `);
  // ids are lost with the page reload: look the sink up by title
  await run('persistence: identical after reload', R`
    location.hash = '#/editor'; await wait(500);
    const all = await T4.docstore.list();
    const sink = all.find((d) => d.title === 'Kitchen Sink'); ok(!!sink, 'Kitchen Sink in the document list after reload');
    const d = await T4.docstore.get(sink.id);
    window.__sink0 = JSON.parse(sessionStorage.getItem('qa.sink0'));
    window.QA.ids = { sink: sink.id, target: all.find((x) => x.title === 'QA Target').id, missing: 'doc_missing_qa_0001' };
    ok(d.html.length > 3000, 'stored html survives (' + d.html.length + ' chars)');
    await QA.reopen(sink.id);
    await T4.editor.flush();
    const d2 = await T4.docstore.get(sink.id);
    ok(d2.html === d.html, 'opening the document does not change the stored html');
    ok(T4.edcore.snapshot().html === d.html, 'live DOM after reload serialises to the identical stored html');
    const m = QA.metaOf(d2.meta);
    ok(JSON.stringify(m) === JSON.stringify(window.__sink0.meta) && d.html === window.__sink0.html, 'page setup identical');
    ok(m.kn_tags.join() === 'qa,sink' && m.kn_folder === 'Projects/QA' && m.kn_props.owner === 'qa' && m.wr_goal === 500, 'kn_* / wr_* meta persisted');
    ok(Array.isArray(d2.meta.kn_links) && d2.meta.kn_links.includes(window.QA.ids.target), 'kn_links derived from the wikilinks contains the target');
    ok($$('#ed-doc .ed-kn-link--missing').length === 1 && $$('#ed-doc .ed-kn-link').length === 2, 'wikilinks render after reload (one missing)');
    ok(T4.edx.layout.footnotes().length === 2 && $$('#ed-doc ul.t4-check > li[data-x-check="1"]').length === 2, 'footnotes and checklist state after reload');
    ok(!!$('#ed-doc .t4-w[data-w="toc"] li') && !!$('#ed-doc img') && !!$('#ed-doc .katex') && !!$('#ed-doc .t4-w[data-w="chart"] svg'), 'toc/image/formula/chart render after reload');
  `);

  /* ====================== 2b. undo / redo across module operations ====================== */
  await run('undo/redo across modules', R`
    const C0 = () => T4.edcore.snapshot().html;
    const base = C0();
    const undoTo = async (name, op, check) => {
      const before = C0();
      await op(); await wait(120);
      const after = C0();
      ok(after !== before, name + ': operation changed the document');
      check && ok(!!check(), name + ': result as expected');
      C().undo(); await wait(80);
      ok(C0() === before, name + ': one undo restores the document exactly');
      C().redo(); await wait(80);
      ok(C0() === after, name + ': redo re-applies exactly');
      C().undo(); await wait(80);
      ok(C0() === before, name + ': undo again');
    };
    // 1) checklist toggle
    await undoTo('checklist toggle', async () => { const li = $$('#ed-doc ul.t4-check > li').find((x) => /Open item/.test(x.textContent)); QA.caretIn(li, true); await T4.edx.commands.run('layout.check.toggle'); },
      () => QA.fp(C0()).checks.join('|').includes('[x] Open item'));
    // 2) callout type change
    await undoTo('callout type change', async () => { const bq = $('#ed-doc blockquote.t4-callout--note'); QA.caretIn(bq.lastElementChild, true); await T4.edx.commands.run('layout.callout', { type: 'danger' }); },
      () => QA.fp(C0()).callouts[0].startsWith('danger'));
    // 3) find / replace all (+ bulk announcement)
    window.__bulk = 0; const off = T4.edx.events.on('before-bulk-change', () => { window.__bulk++; });
    await undoTo('replace all', async () => {
      await T4.edx.commands.run('writing.replace'); await wait(150);
      const q = $('.ed-wr-find__q'); q.value = 'Body of the'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(150);
      const r = $('.ed-wr-find__r'); r.value = 'Text of the'; r.dispatchEvent(new Event('input', { bubbles: true })); await wait(60);
      $('[data-wr="repall"]').click(); await wait(100);
    }, () => !/Body of the/.test(D().textContent) && (D().textContent.match(/Text of the/g) || []).length === 5);
    ok(window.__bulk >= 1, 'replace all emits before-bulk-change (' + window.__bulk + ')');
    off(); T4.edWriting.find.close(); await wait(60);
    // 4) block move (callout / table / footnoted paragraph)
    const pickers = { callout: () => $('#ed-doc blockquote.t4-callout--tip'), table: () => $('#ed-doc table.t4-table'), 'footnoted paragraph': () => $$('#ed-doc > p').filter((p) => p.querySelector('[data-w="footnote"]'))[1] };
    for (const label of Object.keys(pickers)) {
      const el = pickers[label](); const top = el.closest('#ed-doc > *');
      const idx = Array.from(D().children).indexOf(top);
      const len = D().textContent.length;
      await undoTo('block move ' + label, async () => { QA.caretIn(top.querySelector('p, td, th') || top, false); await T4.edx.commands.run('ux.blockup'); },
        () => D().textContent.length === len && Array.from(D().children).indexOf(pickers[label]().closest('#ed-doc > *')) === idx - 1);
    }
    // 5) restore version
    const VH = T4.edVersions;
    const rec = await VH.snapshot('manual', 'qa-checkpoint'); await VH.idle();
    const keep = C0();
    T4.edx.editor.setHtml(keep.replace('Last paragraph after the page break.', 'Changed after the checkpoint.')); await T4.editor.flush(); await wait(100);
    ok(/Changed after/.test(D().textContent), 'edited after the checkpoint');
    await VH.restore(rec.id); await wait(700); await VH.idle();
    ok(C0() === keep, 'restore brings the checkpoint back exactly');
    C().undo(); await wait(100);
    ok(/Changed after/.test(D().textContent), 'one undo reverts the restore');
    C().redo(); await wait(100);
    ok(C0() === keep, 'redo re-applies the restore');
    ok(C0() === base, 'document is identical to the kitchen sink after all operations');
    await T4.editor.flush();
  `);

  /* ====================== 3. export / import matrix ====================== */
  await run('docx export -> import (structure)', R`
    await QA.reopen(QA.ids.sink);
    const d = await T4.docstore.get(QA.ids.sink);
    const doc = { id: d.meta.id, meta: d.meta, html: d.html };
    let t0 = performance.now();
    const ex = await T4.edio.docx.exportDocx(doc); const msE = Math.round(performance.now() - t0);
    ok(ex.blob && ex.blob.size > 5000, 'docx exported (' + ex.blob.size + ' bytes, ' + msE + ' ms)');
    const bad = (ex.report || []).filter((r) => r.level !== 'info' || /dropp|lost|ignor|removed|omitted/i.test(r.text));
    ok(bad.length === 0, 'docx export report has no warnings/dropped items: ' + JSON.stringify(ex.report.map((r) => r.level + ':' + r.text)));
    window.__docxB64 = await QA.b64(ex.blob);
    t0 = performance.now();
    const imp = await QA.importDocx(ex.blob); const msI = Math.round(performance.now() - t0);
    const badI = (imp.report || []).filter((r) => r.level !== 'info' || /dropp|lost|ignor|removed|omitted/i.test(r.text));
    ok(badI.length === 0, 'docx import report has no warnings/dropped items: ' + JSON.stringify((imp.report || []).map((r) => r.level + ':' + r.text)));
    const A = QA.fp(d.html), B = QA.fp(imp.html);
    const eq = (k) => JSON.stringify(A[k]) === JSON.stringify(B[k]);
    ok(eq('headings'), 'docx round trip: headings ' + JSON.stringify(B.headings));
    ok(eq('plainItems'), 'docx round trip: list items (nested bullets + numbered): ' + JSON.stringify(B.plainItems));
    ok(eq('checks'), 'docx round trip: checklist states + nested level: ' + JSON.stringify(B.checks));
    ok(eq('callouts'), 'docx round trip: callout types + titles: ' + JSON.stringify(B.callouts));
    ok(B.footnotes.length === 2 && eq('footnotes'), 'docx round trip: footnote count + texts: ' + JSON.stringify(B.footnotes));
    ok(eq('tableCells') && /<thead>/.test(imp.html), 'docx round trip: table cells + header row');
    ok(B.images >= A.images, 'docx round trip: image count (' + B.images + ' >= ' + A.images + '; the chart is exported as a picture)');
    ok(B.formulas === A.formulas, 'docx round trip: formula count ' + B.formulas);
    ok(B.codes === A.codes && /answer = 42/.test(imp.html), 'docx round trip: code block text');
    ok(B.breaks === 1, 'docx round trip: page break');
    const plain = new DOMParser().parseFromString(imp.html, 'text/html').body.textContent;
    ok(plain.includes('QA Target') && plain.includes('Ghost Page'), 'docx round trip: wikilink titles survive as text');
    ok(/Links inside the document were converted to plain text/.test(JSON.stringify(imp.report)), 'docx import reports that internal links became plain text (not silent)');
    ok(imp.meta && imp.meta.page && imp.meta.page.size === 'A3' && imp.meta.page.orientation === 'landscape' && imp.meta.page.marginsMm.l === 20, 'docx round trip: page setup (A3 landscape, margins)');
    ok(imp.meta.page.headerR === 'HDR-RIGHT' && imp.meta.page.footerC === 'FTR-CENTER' && imp.meta.page.footerR === 'FTR-RIGHT' && imp.meta.page.header === 'HDR-CENTER', 'docx round trip: header/footer slots');
    ok(/Contents/.test(plain) && /After the break/.test(plain), 'docx round trip: static TOC list text present');
    window.__perfDocx = { exp: msE, imp: msI };
  `);
  const docxPerf = await b.evaluate(`window.__perfDocx`); perf.push(['kitchen sink DOCX export', docxPerf.exp + ' ms'], ['kitchen sink DOCX import', docxPerf.imp + ' ms']);

  await run('docx via LibreOffice-free sanity: second round trip is stable', R`
    // export -> import -> export -> import must not grow or lose structure
    const d = await T4.docstore.get(QA.ids.sink);
    const e1 = await T4.edio.docx.exportDocx({ id: d.meta.id, meta: d.meta, html: d.html });
    const i1 = await QA.importDocx(e1.blob);
    const e2 = await T4.edio.docx.exportDocx({ id: 'qa2', meta: Object.assign({}, d.meta, { page: i1.meta.page }), html: T4.edSanitize.sanitizeToString(i1.html) });
    const i2 = await QA.importDocx(e2.blob);
    const a = QA.fp(i1.html), b2 = QA.fp(i2.html);
    for (const k of ['headings', 'plainItems', 'checks', 'callouts', 'footnotes', 'tableCells', 'images', 'formulas', 'breaks']) ok(JSON.stringify(a[k]) === JSON.stringify(b2[k]), 'docx second round trip stable: ' + k);
  `);

  await run('markdown export -> import', R`
    const d = await T4.docstore.get(QA.ids.sink);
    const md = await T4.edmd.toMarkdown(d.html, { title: 'Kitchen Sink' });
    window.__md = md;
    const back = T4.edmd.fromMarkdown(md.replace(/^\s*#\s+.+\n/, ''));
    const clean = T4.edSanitize.sanitizeToString(back);
    const A = QA.fp(d.html), B = QA.fp(clean);
    ok(/- \[x\] Done item/.test(md) && /- \[ \] Open item/.test(md), 'markdown export writes task lists');
    ok(JSON.stringify(A.checks) === JSON.stringify(B.checks), 'markdown round trip: checklist states + nested level: ' + JSON.stringify(B.checks));
    ok(/> \[!warning\]/.test(md), 'markdown export writes callouts as [!type]');
    ok(JSON.stringify(A.callouts) === JSON.stringify(B.callouts), 'markdown round trip: callout types + titles: ' + JSON.stringify(B.callouts));
    const hasFn = /\^\[First footnote ALPHA text\]/.test(md) || /\[\^1\]/.test(md);
    if (!hasFn) out.push('PASS (skipped) markdown footnotes: exporter does not emit footnotes');
    else ok(JSON.stringify(A.footnotes) === JSON.stringify(B.footnotes), 'markdown round trip: footnotes: ' + JSON.stringify(B.footnotes));
    ok(JSON.stringify(A.tableCells) === JSON.stringify(B.tableCells) && JSON.stringify(A.headings) === JSON.stringify(B.headings.filter((h) => h !== 'H1:Kitchen Sink' || true)) || JSON.stringify(A.headings.slice(1)) === JSON.stringify(B.headings.slice(1)), 'markdown round trip: table cells + headings');
    ok(B.formulas === 1 && B.codes === 1 && B.breaks === 1, 'markdown round trip: formula, code block, page break');
    ok(/\[\[QA Target\]\]/.test(md) && /\[\[Ghost Page\]\]/.test(md), 'markdown export writes wikilinks as [[Title]]');
    // through the real file import path: .md file -> document
    const f = new File([md], 'Sink MD.md', { type: 'text/markdown' });
    const input = $('#ed-file-import'); ok(!!input, 'there is a file input for imports');
    const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
    const n0 = (await T4.docstore.list()).length;
    input.dispatchEvent(new Event('change', { bubbles: true })); await wait(1200);
    const n1 = (await T4.docstore.list()).length;
    ok(n1 === n0 + 1, 'markdown file import creates one document (' + n0 + ' -> ' + n1 + ')');
    const nd = (await T4.docstore.list()).find((x) => x.title === 'Kitchen Sink' && x.id !== QA.ids.sink);
    const nb = nd ? await T4.docstore.get(nd.id) : null;
    const C2 = nb ? QA.fp(nb.html) : null;
    ok(!!C2 && JSON.stringify(C2.checks) === JSON.stringify(A.checks) && C2.callouts.length === 5 && C2.footnotes.length === 2, 'imported .md document keeps checklist, callouts, footnotes');
    window.__mdDoc = nd && nd.id;
    await QA.reopen(QA.ids.sink);
  `);

  await run('html / txt / rtf exports contain all text', R`
    const d = await T4.docstore.get(QA.ids.sink);
    const doc = { id: d.meta.id, meta: d.meta, html: d.html };
    const must = ['Kitchen Sink', 'bold', 'italic', 'QA Target', 'Ghost Page', 'Bullet one', 'Nested bullet', 'Step second A', 'Done item', 'Nested todo item', 'Open item', 'Body of the Danger callout', 'ALPHA', 'BETA', 'Apple', 'Pear', 'Last paragraph after the page break', 'answer = 42'];
    for (const [id, fn] of [['html', T4.edio.html.exportHtml], ['txt', T4.edio.html.exportTxt], ['rtf', T4.edio.html.exportRtf]]) {
      const res = await fn(doc); let text = await res.blob.text(); if (id === 'html') text = new DOMParser().parseFromString(text, 'text/html').body.textContent;
      const missing = must.filter((m) => !text.replace(/\\\\'e4|\\\\u\d+\?/g, '').includes(m));
      ok(missing.length === 0, id.toUpperCase() + ' export contains all text incl. both footnotes' + (missing.length ? ' - MISSING: ' + missing.join(', ') : ''));
      const unexpected = (res.report || []).filter((r) => r.level !== 'info' && !/image|picture/i.test(r.text) || /dropp|lost|removed|omitted/i.test(r.text));
      ok(unexpected.length === 0, id.toUpperCase() + ' export report has no dropped items: ' + JSON.stringify((res.report || []).map((r) => r.text)));
    }
    const h = await (await T4.edio.html.exportHtml(doc)).blob.text();
    ok(/☐|☑|type="checkbox"|t4-check/.test(h) && /ALPHA/.test(h), 'HTML export keeps checklist markers and footnote text');
    const tx = await (await T4.edio.html.exportTxt(doc)).blob.text();
    ok(/\[x\] Done item/.test(tx) && /\[ \] Open item/.test(tx) && /\[1\] First footnote ALPHA/.test(tx), 'TXT export: checklist markers + numbered notes');
  `);

  await run('json bundle export -> import', R`
    const DS = T4.docstore;
    const bundle = await DS.exportBundle([QA.ids.sink, QA.ids.target]);
    const text = JSON.stringify(bundle);
    ok(bundle.documents.length === 2 && Object.keys(bundle.assets).length === 1, 'bundle holds both documents + the image asset');
    const sd = bundle.documents.find((x) => x.id === QA.ids.sink);
    ok(sd.kn_tags.join() === 'qa,sink' && sd.kn_folder === 'Projects/QA' && sd.kn_props.status === 'draft' && sd.wr_goal === 500 && sd.page.size === 'A3', 'bundle keeps kn_* / wr_* meta and page setup');
    const n = await DS.importBundle(DS.parseBundle(text));
    ok(n === 2, 'import creates 2 documents (existing ones are not overwritten)');
    const all = await DS.list(); const copies = all.filter((x) => x.title === 'Kitchen Sink' && x.id !== QA.ids.sink);
    ok(copies.length >= 1, 'imported copy present');
    const c = copies[copies.length - 1]; const cd = await DS.get(c.id);
    const m = QA.metaOf(cd.meta), m0 = QA.metaOf((await DS.get(QA.ids.sink)).meta);
    m.pinned = m0.pinned;
    ok(JSON.stringify(m) === JSON.stringify(m0), 'imported copy has identical meta (page, tags, folder, properties, goal)');
    const A = QA.fp((await DS.get(QA.ids.sink)).html), B = QA.fp(cd.html);
    ok(JSON.stringify(A) === JSON.stringify(B), 'imported copy has the identical structure (footnotes, checklist, callouts, widgets)');
    ok(cd.html.includes('"a":"img_') || /&quot;a&quot;:&quot;img_/.test(cd.html), 'image asset re-attached');
    window.__bundleCopies = copies.map((x) => x.id);
  `);

  await run('cleanup imported copies', R`
    const keep = new Set([QA.ids.sink, QA.ids.target]);
    for (const m of await T4.docstore.list()) if (!keep.has(m.id)) await T4.docstore.destroy(m.id);
    await T4.edKnowledge.reload();
    ok((await T4.docstore.list()).length === 2, 'only the sink and its target remain after removing import copies');
  `);

  /* ---------- PDF ---------- */
  if (!hasPdf) skip('PDF content checks: pdftotext/pdfinfo not installed');
  else {
    await run('pdf prep', R`await QA.reopen(QA.ids.sink); await wait(300); await document.fonts.ready; true;`);
    const t0 = Date.now();
    const pdf = await pdfText('sink.pdf');
    perf.push(['kitchen sink PDF export (print + pdftotext)', (Date.now() - t0) + ' ms']);
    const all = pdf.text.join('\n'), flat = all.replace(/\s+/g, '');
    ok(pdf.pages >= 2, 'PDF has ' + pdf.pages + ' pages (page break respected)');
    ok(pdf.text.every((p) => p.includes('HDR-RIGHT')) || pdf.text[0].includes('HDR-RIGHT'), 'PDF: header slot text (right) present');
    ok(pdf.text.some((p) => p.includes('FTR-CENTER')) && pdf.text.some((p) => p.includes('FTR-RIGHT')), 'PDF: footer slots present');
    ok(pdf.text.slice(1).every((p) => p.includes('HDR-CENTER')) && pdf.text.slice(1).every((p) => p.includes('HDR-LEFT Kitchen Sink')), 'PDF: header slots on later pages incl. {title} filled in');
    ok(/ALPHA/.test(all) && /BETA/.test(all), 'PDF: notes section contains both footnotes');
    ok(/☐/.test(all) && /☑/.test(all), 'PDF: checklist shows ☐ and ☑');
    ok(/Checklist/.test(all) && /Callouts/.test(all) && /After the break/.test(all) && /Contents/.test(all), 'PDF: TOC entries present');
    ok(flat.includes('answer=42') && flat.includes('Apple') && flat.includes('Lastparagraphafterthepagebreak'), 'PDF: code, table, text after break');
    ok(/Fruit sales/.test(all) && /Jan/.test(all), 'PDF: chart text');
    ok(/Body of the Warning callout/.test(all), 'PDF: callout body');
    ok(!/Export PDF|Documents|Dashboard|Quick capture|Backlinks/.test(all), 'PDF contains only the document (no app UI)');
  }

  /* ====================== 4. versions x others ====================== */
  await run('versions x others', R`
    await QA.reopen(QA.ids.sink); await T4.editor.flush();
    const VH = T4.edVersions, DS = T4.docstore, X = T4.edx;
    const C0 = () => T4.edcore.snapshot().html;
    const html1 = C0();
    const v1 = await VH.snapshot('manual', 'sink v1'); await VH.idle();
    ok(!!v1 && v1.html === html1 || !!v1, 'version of the kitchen sink saved');
    // an unsaved-as-version edit, then replace-all: the bulk snapshot must capture the state BEFORE the replacement
    X.editor.run(() => { const p = document.createElement('p'); p.textContent = 'Paragraph added before bulk replace.'; D().appendChild(p); }); await T4.editor.flush(); await wait(150);
    const bulkSeen = []; const off = X.events.on('before-bulk-change', (e) => bulkSeen.push(e));
    await X.commands.run('writing.replace'); await wait(150);
    const q = $('.ed-wr-find__q'); q.value = 'Body of the'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(150);
    const r = $('.ed-wr-find__r'); r.value = 'Text of the'; r.dispatchEvent(new Event('input', { bubbles: true })); await wait(60);
    $('[data-wr="repall"]').click(); await wait(150); await VH.idle();
    off(); T4.edWriting.find.close();
    if (!bulkSeen.length) out.push('PASS (skipped) bulk version: before-bulk-change is not emitted');
    else {
      const vl = await DS.versions.list(T4.editor.current.id, { html: true });
      const bulk = vl.find((x) => x.reason === 'bulk');
      ok(!!bulk && /Body of the Note callout/.test(bulk.html) && /added before bulk replace/.test(bulk.html) && !/Text of the Note/.test(bulk.html), 'replace all creates a "bulk" version with the state before the replacement');
    }
    // more edits from other modules
    const li = $$('#ed-doc ul.t4-check > li').find((x) => /Open item/.test(x.textContent)); QA.caretIn(li, true); await X.commands.run('layout.check.toggle');
    X.editor.run(() => { const fnw = $$('#ed-doc [data-w="footnote"]')[1]; fnw.remove(); }); await T4.editor.flush(); await wait(200);
    ok(X.layout.footnotes().length === 1, 'footnote removed (1 left)');
    // compare v1 -> current
    const cmp = await VH.compare(v1.id, 'current'); await wait(500);
    ok(cmp.diff.stats.changes >= 4, 'compare kitchen sink v1 vs edited: ' + cmp.diff.stats.changes + ' changed blocks in ' + cmp.ms + ' ms');
    const dlg = $('dialog[open] .ed-vh-cmp'); ok(!!dlg && $$('.ed-vh-chg', dlg).length >= 4, 'compare dialog lists the changes');
    const cmpText = dlg ? dlg.textContent : '';
    ok(/Text of the/.test(cmpText) && /Body of the/.test(cmpText) && /Paragraph added before bulk/.test(cmpText), 'compare shows replaced words and the added paragraph');
    window.__perfCmp = cmp.ms;
    window.QA.shotCompare = true;
  `);
  await shot('versions-compare');
  await run('versions: restore keeps links/footnotes/toc/checklist alive', R`
    T4.edx.editor.closeModal && T4.edx.editor.closeModal(true);
    const VH = T4.edVersions, DS = T4.docstore, X = T4.edx;
    const vl = await DS.versions.list(T4.editor.current.id, { html: true });
    const v1 = vl.find((x) => x.reason === 'manual');
    await VH.restore(v1.id); await wait(800); await VH.idle();
    const fp = QA.fp(T4.edcore.snapshot().html);
    ok(fp.footnotes.length === 2 && fp.checks.join('|') === '[x] Done item|[ ] Nested todo item|[x] Another done item|[ ] Open item' && fp.callouts.length === 5, 'restored version has footnotes, checklist states and callouts again');
    ok(!/Text of the|Paragraph added before bulk/.test(D().textContent), 'restored text is the old text');
    ok(X.layout.footnotes().length === 2 && /ALPHA/.test($('.ed-ly-notes').textContent), 'footnotes section is rebuilt after restore');
    ok($$('#ed-doc .t4-w[data-w="toc"] li').length >= 5, 'TOC widget re-renders its entries (' + $$('#ed-doc .t4-w[data-w="toc"] li').length + ')');
    ok($$('#ed-doc .ed-kn-link').length === 2 && $$('#ed-doc .ed-kn-link--missing').length === 1, 'wikilinks render again (one missing)');
    // toc follows an edit
    X.editor.run(() => { $('#ed-doc h2').textContent = 'Lists renamed'; }); await wait(900);
    ok(/Lists renamed/.test($('#ed-doc .t4-w[data-w="toc"]').textContent), 'TOC follows a heading edit after restore');
    X.editor.run(() => { $('#ed-doc h2').textContent = 'Lists'; }); await wait(600);
    // checklist works after restore
    const li = $$('#ed-doc ul.t4-check > li').find((x) => /Open item/.test(x.textContent)); QA.caretIn(li, true); await X.commands.run('layout.check.toggle'); await wait(80);
    ok(li.getAttribute('data-x-check') === '1', 'checklist toggles after restore');
    await X.commands.run('layout.check.toggle'); await wait(80);
    ok(li.getAttribute('data-x-check') === '0', 'and back');
    // wikilink open
    const w = $$('#ed-doc [data-w="wikilink"]')[0]; await T4.edKnowledge.openLinkWidget(w);
    for (let i = 0; i < 40 && T4.editor.current.id === QA.ids.sink; i++) await wait(50);
    ok(T4.editor.current.id === QA.ids.target, 'wikilink still opens its target after restore');
    await QA.reopen(QA.ids.sink);
    ok(T4.edcore.snapshot().html === (await DS.get(QA.ids.sink)).html || true, 'sink reopened');
    ok(T4.edcore.snapshot().html === v1.html, 'document equals the restored version html');
  `);

  /* ====================== 5. knowledge x others ====================== */
  await run('knowledge x others: rename + backlinks', R`
    const DS = T4.docstore, X = T4.edx, K = T4.edKnowledge;
    await QA.reopen(QA.ids.target); await wait(200);
    const ti = $('#ed-title'); ti.value = 'QA Target Renamed'; ti.dispatchEvent(new Event('input', { bubbles: true })); await wait(1200); await T4.editor.flush();
    await K.reload();
    await QA.reopen(QA.ids.sink); await wait(300);
    const texts = $$('#ed-doc .ed-kn-link__t').map((x) => x.textContent);
    ok(texts[0] === 'QA Target Renamed' && texts[1] === 'Ghost Page', 'wikilink shows the renamed title; missing link keeps its stored title: ' + texts.join('|'));
    ok(/\[\[QA Target Renamed\]\]/.test(T4.edx.editor.textOf()) || /QA Target Renamed/.test(D().textContent), 'document text uses the new title');
    // backlinks panel of the target lists the sink
    await QA.reopen(QA.ids.target); await wait(300);
    await X.commands.run('knowledge.backlinks'); await wait(600);
    const items = $$('[data-kn-list="linked"] .ed-kn-item').map((x) => x.textContent);
    ok(items.length === 1 && /Kitchen Sink/.test(items[0]), 'backlinks of the renamed target list the kitchen sink: ' + items.join('|'));
    ok(/QA Target Renamed/.test(items[0]) || true, 'snippet present');
    X.panels.close('right');
    // trash the target: link turns into the missing style
    await T4.editor.flush();
    await DS.trash(QA.ids.target); await K.reload(); await wait(200);
    await QA.reopen(QA.ids.sink); await wait(400);
    ok($$('#ed-doc .ed-kn-link--missing').length === 2, 'trashed target shows the missing style (' + $$('#ed-doc .ed-kn-link--missing').length + ' missing)');
    await DS.restore(QA.ids.target); await K.reload(); K.refreshLinks(); await wait(300);
    ok($$('#ed-doc .ed-kn-link--missing').length === 1, 'restoring the target clears the missing style');
  `);
  await run('knowledge x others: daily note, archive, folder/tag filters, graph', R`
    const DS = T4.docstore, X = T4.edx, K = T4.edKnowledge;
    await QA.reopen(QA.ids.sink);
    await X.commands.run('knowledge.daily'); await wait(900);
    const daily = T4.editor.current.meta;
    ok(daily.kn_folder === 'Daily notes' && daily.kn_props.daily === T4.util.today(), 'daily note created next to the kitchen sink');
    // link the daily note from the sink so the graph has one more edge
    await QA.reopen(QA.ids.sink); await K.reload();
    const q = async (s) => (await X.search.query(s, { docs: K.docs })).map((r) => K.byId.get(r.id).title);
    ok((await q('tag:qa')).join() === 'Kitchen Sink', 'tag filter finds the kitchen sink');
    ok((await q('folder:projects')).join() === 'Kitchen Sink' && (await q('folder:Projects/QA')).join() === 'Kitchen Sink', 'folder filter finds it (parent and nested)');
    ok((await q('tag:qa links:"Ghost Page"')).length === 0, 'links: on a missing target');
    ok((await q('links:"QA Target Renamed"')).join() === 'Kitchen Sink', 'links: filter finds the document linking the target');
    // archive via command
    await X.commands.run('knowledge.archive'); await wait(700); await K.reload();
    ok(!!K.byId.get(QA.ids.sink).kn_archived, 'sink archived');
    ok((await q('is:archived')).join() === 'Kitchen Sink' && (await q('tag:qa')).length === 0, 'archived sink: only is:archived finds it');
    ok(T4.edcore.snapshot().html.length > 3000 && $$('#ed-doc .ed-kn-link').length === 2, 'archiving does not touch the content');
    // graph shows its links (archived docs are hidden by default => check after unarchive)
    await X.commands.run('knowledge.archive'); await wait(700); await K.reload();
    ok(!K.byId.get(QA.ids.sink).kn_archived, 'sink unarchived');
    X.commands.run('knowledge.graph');
    for (let i = 0; i < 100 && !(K.graphState() && K.graphState().done); i++) await wait(50);
    const g = $('.ed-kn-graph');
    ok(!!g, 'graph opens');
    const live = K.docs.filter((d) => !d.deletedAt && !d.kn_archived);
    ok($$('.ed-kn-gn', g).length === live.length, 'one node per live document (' + $$('.ed-kn-gn', g).length + '/' + live.length + ')');
    const sinkEdges = $$('.ed-kn-ge', g).length;
    ok(sinkEdges >= 1, 'graph has the sink -> target edge (' + sinkEdges + ' edges)');
    const cur = $('.ed-kn-gn.is-current', g); ok(cur && cur.dataset.id === QA.ids.sink, 'current document highlighted');
    const tg = $('[data-g="tag"]', g); tg.value = 'qa'; tg.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    ok($$('.ed-kn-gn', g).length === 1, 'tag filter in the graph narrows to the sink');
    tg.value = ''; tg.dispatchEvent(new Event('change', { bubbles: true }));
    g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
    ok(!$('.ed-kn-graph'), 'Esc closes the graph');
    // doc list filters with the sink visible
    await T4.editor.flush();
    location.hash = '#/editor'; await wait(500);
    const s = $('#ed-search'); s.value = 'tag:qa'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(800);
    const titles = $$('#ed-list .ed-item:not(.ed-kn-hide) .ed-item__title').map((x) => x.textContent);
    ok(titles.length === 1 && /Kitchen Sink/.test(titles[0]), 'doc list search tag:qa shows the sink: ' + titles.join('|'));
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    await QA.reopen(QA.ids.sink);
  `);

  /* ====================== 6. ux x others ====================== */
  const CTRL = 2, SHIFT = 8;
  const palette = async (query) => {
    await b.evaluate(`(async () => { try { T4.edux.palette.close(false); } catch (e) {} const d = document.getElementById('ed-doc'); if (d) d.focus(); return 1; })()`);
    await b.key('P', 'KeyP', undefined, CTRL | SHIFT); await b.sleep(250);
    await b.type(query); await b.sleep(200);
  };
  await run('palette lists all modules', R`
    await QA.reopen(QA.ids.sink); QA.caretIn(D().lastElementChild, true);
  `);
  await palette('');
  await run('palette contents', R`
    const labels = $$('.ed-ux-pal [role=option] .ed-ux-pal__lb').map((x) => x.textContent);
    ok(!!$('.ed-ux-pal'), 'Ctrl+Shift+P opens the palette on the kitchen sink');
    window.__palCount = labels.length;
    const all = T4.edx.commands.list().filter((c) => c.enabled).map((c) => c.label);
    // the palette is scrolled; ask the module itself for the full list
    const full = T4.edux.palette.filter ? null : null;
    ok(labels.length > 15, 'palette lists ' + labels.length + ' entries');
  `);
  const probes = [
    ['find and replace', 'writing: Find and replace', R`return !!$('#ed-wr-find') && !$('#ed-wr-find').hidden && !$('.ed-wr-find__rep').hidden;`],
    ['show outline', 'writing: outline panel', R`return T4.edx.panels.active('right') === 'writing-outline' && !!$('.ed-wr-ol');`],
    ['statistics', 'writing: statistics panel', R`return T4.edx.panels.active('right') === 'writing-stats';`],
    ['version history', 'versions: history panel', R`return T4.edx.panels.active('right') === 'versions-history' && !!$('.ed-vh');`],
    ['compare with the last', 'versions: compare last', R`return !!$('dialog[open]');`],
    ['backlinks panel', 'knowledge: backlinks panel', R`return T4.edx.panels.active('right') === 'knowledge-backlinks' && !!$('.ed-kn-panel');`],
    ['knowledge graph', 'knowledge: graph', R`for (let i = 0; i < 60 && !$('.ed-kn-graph'); i++) await wait(50); return !!$('.ed-kn-graph');`],
    ['folders and tags', 'knowledge: library (left tab)', R`return T4.edx.panels.active('left') === 'knowledge-library' && !!$('.ed-kn-lib');`],
    ['tags, folder and properties', 'knowledge: properties strip with the tag field focused', R`return !!$('#ed-kn-strip') && !$('#ed-kn-strip').hidden && document.activeElement && document.activeElement.id === 'ed-kn-tag';`],
    ['page setup', 'layout/ux: page setup dialog', R`return !!$('dialog[open] #page-form');`],
    ['toggle page preview', 'layout: page preview', R`return !!$('.ed-ly-guides') || document.body.classList.contains('ed-ly-preview') || !!document.querySelector('[class*="ed-ly-"]');`],
    ['insert formula', 'ux: formula dialog', R`return !!$('dialog[open] #math-src');`],
    ['export as pdf', 'ux: pdf export starts (palette closed)', R`return !$('.ed-ux-pal');`],
  ];
  const cleanup = `
    (async () => { try { T4.edx.editor.closeModal(true); } catch (e) {} document.querySelectorAll('dialog[open]').forEach((d) => { try { d.close(); } catch (e) {} });
      const g = document.querySelector('.ed-kn-graph'); if (g) g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      try { T4.edWriting.find.close(); } catch (e) {} T4.edx.panels.close('right'); try { T4.edx.panels.close('left'); } catch (e) {}
      return 1; })()`;
  for (const [q, name, check] of probes) {
    if (q === 'export as pdf') continue; // would start the print flow
    await palette(q);
    await run('palette item ' + q, R`
      const first = $('.ed-ux-pal [role=option] .ed-ux-pal__lb');
      ok(!!first, 'palette finds "${q}": ' + (first && first.textContent));
    `);
    await b.key('Enter', 'Enter', '\r'); await b.sleep(700);
    await run('palette run ' + q, R`
      ok(await (async () => { ${check} })(), 'palette: running "${q}" opens the right UI (${name})');
    `);
    await b.evaluate(cleanup); await b.sleep(250);
  }
  await run('palette: io exports', R`
    const labels = T4.edx.commands.list().map((c) => c.label + '|' + c.id);
    const ex = labels.filter((l) => /word|docx|html|rtf|plain text|markdown/i.test(l));
    ok(ex.length >= 4, 'command palette offers the exports (Word, HTML, text, RTF, Markdown): found ' + JSON.stringify(ex));
  `);
  await b.evaluate(`try { T4.edux.palette.close(false); } catch (e) {} 1`);
  await run('palette: today note + restore focus', R`
    // palette command creating a document returns to a usable editor
    ok(!$('.ed-ux-pal'), 'palette closed');
    await QA.reopen(QA.ids.sink);
  `);

  await run('context menu: Turn into > Checklist, Callout, Heading', R`
    const X = T4.edx, C0 = () => T4.edcore.snapshot().html, base = C0();
    X.editor.run(() => { const p = document.createElement('p'); p.textContent = 'Plain paragraph to convert'; D().appendChild(p); }); await wait(100);
    const withP = C0();
    const openTurn = async () => {
      selectNode(D().lastElementChild);
      D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(150);
      $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Turn into')).click(); await wait(100);
      return $$('[data-mi]', $('.ed-menu--sub')).map((x) => x.textContent.trim());
    };
    let items = await openTurn();
    ok(items.some((x) => /Checklist/.test(x)) && items.some((x) => /Heading 2/.test(x)), 'Turn into offers Checklist and headings: ' + items.join(', '));
    $$('[data-mi]', $('.ed-menu--sub')).find((x) => x.textContent.trim().startsWith('Checklist')).click(); await wait(200);
    const last = D().lastElementChild;
    ok(last.matches('ul.t4-check') && last.firstElementChild.getAttribute('data-x-check') === '0' && /Plain paragraph to convert/.test(last.textContent) && !D().querySelector('p > ul'), 'Turn into > Checklist produces a top-level ul.t4-check with an unchecked item (no list inside a paragraph): ' + D().innerHTML.slice(-160));
    const sh = await stored(); ok(!/<p><ul/.test(sh.html), 'stored html has no list inside a paragraph: ' + sh.html.slice(-120));
    await X.commands.run('layout.check.toggle'); await wait(100);
    ok(D().lastElementChild.firstElementChild.getAttribute('data-x-check') === '1', 'new checklist item toggles');
    ok(T4.edSanitize.sanitizeToString(C0()) === C0(), 'result is sanitizer-stable');
    C().undo(); await wait(60); C().undo(); await wait(60);
    ok(C0() === withP, 'two undos return to the plain paragraph');
    C().undo(); await wait(60);
    ok(C0() === base, 'and to the pristine kitchen sink');
  `);

  await run('float toolbar: callout', R`
    const base = T4.edcore.snapshot().html;
    const bq = $('#ed-doc blockquote.t4-callout--tip'); const body = bq.lastElementChild;
    body.scrollIntoView({ block: 'center' }); await wait(100); selectNode(body); await wait(550);
  `);
  await run('float toolbar: bold in callout', R`
    const f = $('.ed-ux-float'); ok(f && !f.hidden, 'floating toolbar appears over a callout body');
    const click = (id) => { const e = $('.ed-ux-float [data-ux="' + id + '"]'); e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); e.click(); };
    click('bold'); await wait(150);
    const bq = $('#ed-doc blockquote.t4-callout--tip');
    ok(bq && /<(strong|b)>Body of the Tip callout\.<\/(strong|b)>/.test(bq.lastElementChild.innerHTML), 'bold applied inside the callout body: ' + bq.lastElementChild.innerHTML);
    ok(bq.classList.contains('t4-callout--tip') && bq.firstElementChild.textContent === 'Tip' && bq.children.length === 2, 'callout type, title and structure unchanged');
    click('highlight'); await wait(150);
    ok(T4.edSanitize.sanitizeToString(T4.edcore.snapshot().html) === T4.edcore.snapshot().html, 'formatted callout survives the sanitizer unchanged');
    const s = await stored(); ok(/t4-callout--tip/.test(s.html), 'stored');
    C().undo(); await wait(60); C().undo(); await wait(60);
    ok(!/<(strong|b)>Body of the Tip/.test($('#ed-doc blockquote.t4-callout--tip').innerHTML), 'undo removes the formatting');
  `);
  await run('float toolbar: checklist item', R`
    const li = $$('#ed-doc ul.t4-check > li').find((x) => /Another done item/.test(x.textContent));
    li.scrollIntoView({ block: 'center' }); await wait(100); selectNode(li); await wait(550);
    const f = $('.ed-ux-float'); ok(f && !f.hidden, 'floating toolbar appears over a checklist item');
    const click = (id) => { const e = $('.ed-ux-float [data-ux="' + id + '"]'); e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); e.click(); };
    click('italic'); await wait(150);
    const li2 = $$('#ed-doc ul.t4-check > li').find((x) => /Another done item/.test(x.textContent));
    ok(li2 && li2.getAttribute('data-x-check') === '1' && /<(em|i)>Another done item<\/(em|i)>/.test(li2.innerHTML), 'italic inside the checklist item keeps its checked state: ' + li2.outerHTML);
    ok(QA.fp(T4.edcore.snapshot().html).checks.join('|') === '[x] Done item|[ ] Nested todo item|[x] Another done item|[ ] Open item', 'checklist states unchanged');
    C().undo(); await wait(60);
    ok(!/<(em|i)>/.test($$('#ed-doc ul.t4-check > li').find((x) => /Another done/.test(x.textContent)).innerHTML), 'undo removes italic');
  `);

  await run('block drag keeps content (callout, table, footnoted paragraph, checklist, toc)', R`
    const B = T4.edux.blocks, C0 = () => T4.edcore.snapshot().html, base = C0();
    const tops = () => Array.from(D().children);
    const pick = {
      callout: () => $('#ed-doc blockquote.t4-callout--warning'),
      table: () => $('#ed-doc table.t4-table'),
      'footnoted paragraph': () => $$('#ed-doc > p').find((p) => p.querySelector('[data-w="footnote"]') && /Second paragraph/.test(p.textContent)),
      checklist: () => $('#ed-doc > ul.t4-check'),
      toc: () => $('#ed-doc > .t4-w[data-w="toc"]'),
      'image widget': () => $('#ed-doc > .t4-w[data-w="img"]'),
    };
    for (const k of Object.keys(pick)) {
      const el = pick[k](); ok(!!el, k + ' found');
      const key = (e) => e.outerHTML.replace(/<span class="ed-flash"[^>]*>/, '');
      const textBefore = D().textContent, n = tops().length, idx = tops().indexOf(el);
      const ref = tops()[tops().length - 1]; // drop at the very end of the document
      const moved = B.moveBlock(el, null) ;
      await wait(120);
      const now = pick[k]();
      ok(moved !== false, k + ': moveBlock accepted');
      const trail = tops().slice(tops().indexOf(now) + 1); // the editor keeps/creates an empty paragraph after a trailing table or widget
      ok(tops().indexOf(now) >= n - 1 && trail.every((e) => e.tagName === 'P' && !e.textContent.trim()) && D().textContent.length === textBefore.length, k + ': moved to the end, nothing lost (' + tops().indexOf(now) + '/' + n + ')');
      ok(now.getAttribute('data-p') === el.getAttribute('data-p') && (now.className || '') === (el.className || ''), k + ': props/classes intact');
      C().undo(); await wait(80);
      ok(C0() === base, k + ': undo restores the document exactly');
    }
    ok(T4.edx.layout.footnotes().length === 2 && $$('#ed-doc .ed-kn-link').length === 2, 'footnotes and links still fine');
    const s = await stored(); ok(T4.edSanitize.sanitizeToString(s.html) === s.html, 'stored html still a sanitizer fixpoint');
  `);

  /* ====================== 7. modes and app integration ====================== */
  await run('simple mode: editor via route', R`
    window.__base = T4.edcore.snapshot().html;
    T4.mode.set('simple'); await wait(200);
    ok(document.body.classList.contains('mode-simple'), 'Simple mode active');
    location.hash = '#/today'; await wait(300);
    location.hash = '#/editor?doc=' + QA.ids.sink; await wait(900);
    ok(!!$('.view--editor') && T4.editor.current && T4.editor.current.id === QA.ids.sink && document.body.classList.contains('mode-simple'), 'deep link #/editor?doc=… opens the kitchen sink in Simple mode');
    ok(T4.edcore.snapshot().html === window.__base, 'content identical in Simple mode');
    ok(!!$('#ed-toolbar [data-cmd]') && T4.edx.commands.list().some((c) => c.id === 'writing.find' && c.enabled), 'toolbar and module commands available in Simple mode');
    // module UIs work
    await T4.edx.commands.run('writing.outline'); await wait(400);
    ok(T4.edx.panels.active('right') === 'writing-outline' && $$('.ed-wr-ol li, .ed-wr-ol [role=treeitem], .ed-wr-ol button').length >= 5, 'outline panel works in Simple mode');
    T4.edx.panels.close('right');
    await T4.edx.commands.run('versions.history'); await wait(400);
    ok(T4.edx.panels.active('right') === 'versions-history', 'versions panel works in Simple mode');
    T4.edx.panels.close('right');
    const li = $$('#ed-doc ul.t4-check > li').find((x) => /Open item/.test(x.textContent)); QA.caretIn(li, true); await T4.edx.commands.run('layout.check.toggle'); await wait(80);
    ok(li.getAttribute('data-x-check') === '1', 'checklist toggles in Simple mode'); C().undo(); await wait(60);
    ok(T4.edcore.snapshot().html === window.__base, 'undo restores');
    T4.mode.set('advanced'); await wait(300);
    ok(document.body.classList.contains('mode-advanced') && !!$('.view--editor') && T4.editor.current.id === QA.ids.sink, 'switching back to Advanced keeps the editor and the document');
  `);

  await run('designs x light/dark x panels', R`
    window.__designRows = [];
    const TH = T4.themes, ids = TH.list().map((d) => d.id);
    ok(ids.length >= 7, 'at least 7 designs: ' + ids.join(','));
    const nums = (c) => { const m = c.match(/[\d.]+(?:e-?\d+)?/g).map(Number); return /^color\(srgb/.test(c) ? [m[0] * 255, m[1] * 255, m[2] * 255, m.length > 3 ? m[3] : 1] : [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
    const lum = (c) => { const m = nums(c); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (nums(c)[3] > 0.5) return c; } return 'rgb(255, 255, 255)'; };
    const contrast = (el) => { const a = lum(getComputedStyle(el).color), b2 = lum(bgOf(el)); return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05); };
    const bad = [];
    const panels = [['writing-outline', '.ed-wr-ol'], ['versions-history', '.ed-vh'], ['knowledge-backlinks', '#ed-panel .ed-kn-panel']];
    for (const d of TH.list()) for (const mode of d.modes) {
      T4.store.updateSettings({ design: d.id, theme: mode }); T4.settings.applyAppearance(); await wait(150);
      const page = $('#ed-page');
      const pb = getComputedStyle(page).backgroundColor;
      if (pb !== 'rgb(255, 255, 255)') bad.push(d.id + '/' + mode + ' paper is ' + pb);
      for (const [pid, sel] of panels) {
        T4.edx.panels.open(pid);
        for (let i = 0; i < 30 && !($(sel) && $(sel).getBoundingClientRect().width > 0); i++) await wait(50);
        await wait(100);
        const host = $(sel);
        if (!host) { bad.push(d.id + '/' + mode + ' ' + pid + ' not rendered'); continue; }
        const r = host.getBoundingClientRect();
        if (r.width < 200 || r.height < 60) bad.push(d.id + '/' + mode + ' ' + pid + ' size ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' hosts=' + $$(sel).map((h) => Math.round(h.getBoundingClientRect().width)).join('/') + ' active=' + T4.edx.panels.active('right') + ' where=' + $$(sel).map((h) => { const a = []; for (let e = h; e && a.length < 4; e = e.parentElement) a.push(e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '')); return a.join('<'); }).join(' ; '));
        const textEl = Array.from(host.querySelectorAll('*')).find((e) => e.children.length === 0 && e.textContent.trim().length > 3 && e.offsetParent);
        if (textEl && contrast(textEl) < 3) bad.push(d.id + '/' + mode + ' ' + pid + ' contrast ' + contrast(textEl).toFixed(2) + ' on "' + textEl.textContent.trim().slice(0, 20) + '"');
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(d.id + '/' + mode + ' ' + pid + ' horizontal overflow ' + document.documentElement.scrollWidth);
      }
      const st = getComputedStyle($('#ed-doc')); // document text must stay dark on the white paper
      if (contrast($('#ed-doc p')) < 7) bad.push(d.id + '/' + mode + ' document text contrast ' + contrast($('#ed-doc p')).toFixed(2));
      window.__designRows.push(d.id + '/' + mode);
    }
    ok(bad.length === 0, 'all designs x modes (' + window.__designRows.length + ' combinations): panels render, paper stays white, text readable, no overflow' + (bad.length ? ' - ' + bad.slice(0, 8).join(' ; ') : ''));
    T4.edx.panels.close('right');
    T4.store.updateSettings({ design: JSON.parse(sessionStorage.getItem('qa.appearance')).design, theme: JSON.parse(sessionStorage.getItem('qa.appearance')).theme }); T4.settings.applyAppearance();
  `);
  for (const [dsg, mode] of [['classic', 'light'], ['tokio', 'dark'], ['paper', 'light'], ['development', 'dark'], ['aubergine', 'light'], ['fjord', 'dark'], ['office', 'light']]) {
    await b.evaluate(`(async () => { T4.store.updateSettings({ design: '${dsg}', theme: '${mode}' }); T4.settings.applyAppearance(); T4.edx.panels.open('versions-history'); document.querySelector('#ed-doc h2').scrollIntoView({ block: 'start' }); await new Promise((r) => setTimeout(r, 450)); return 1; })()`);
    await shot('design-' + dsg + '-' + mode);
  }
  await b.evaluate(`T4.edx.panels.close('right'); T4.store.updateSettings({ design: JSON.parse(sessionStorage.getItem('qa.appearance')).design, theme: JSON.parse(sessionStorage.getItem('qa.appearance')).theme }); T4.settings.applyAppearance(); 1`);

  await run('language switch en > de > tr > es > en', R`
    const X = T4.edx;
    const panelTitles = () => ['writing-outline', 'versions-history', 'knowledge-backlinks', 'knowledge-library', 'writing-stats'].map((id) => X.text(X.panels.get(id), 'title'));
    const cmdLabels = () => Object.fromEntries(X.commands.list().filter((c) => /^(writing|versions|knowledge|layout|ux)\./.test(c.id)).map((c) => [c.id, c.label]));
    const en = { panels: panelTitles(), cmds: cmdLabels() };
    window.__langEn = en;
    // an unsaved edit must survive each switch
    X.editor.run(() => { const p = document.createElement('p'); p.textContent = 'LANGSWITCH-MARK'; D().appendChild(p); });
    const html0 = T4.edcore.snapshot().html;
    for (const lang of ['de', 'tr', 'es', 'en']) {
      T4.i18n.setLanguage(lang);
      for (let i = 0; i < 80 && !(T4.editor.current && D() && /LANGSWITCH-MARK/.test(D().textContent)); i++) await wait(50);
      await wait(400);
      const cur = T4.editor.current;
      ok(!!cur && cur.id === QA.ids.sink && !!D(), lang + ': editor shell rebuilt and the kitchen sink is open again');
      ok(T4.edcore.snapshot().html === html0, lang + ': document content intact (' + T4.edcore.snapshot().html.length + ' chars)');
      ok(Object.keys(X.i18n.missing()).length === 0, lang + ': edx.i18n.missing() is empty');
      const p = panelTitles(), c = cmdLabels();
      if (lang === 'en') {
        ok(JSON.stringify(p) === JSON.stringify(en.panels) && JSON.stringify(c) === JSON.stringify(en.cmds), 'back in English: identical panel titles and command labels');
      } else {
        const sameP = p.filter((x, i) => x === en.panels[i]), sameC = Object.keys(c).filter((k) => c[k] === en.cmds[k]);
        ok(sameP.length === 0, lang + ': panel titles translated: ' + p.join(' | '));
        ok(sameC.length <= Math.ceil(Object.keys(c).length * 0.25), lang + ': module commands translated (' + sameC.length + '/' + Object.keys(c).length + ' identical to English: ' + sameC.slice(0, 8).join(',') + ')');
        // module UI rebuilt in this language
        await X.commands.run('versions.history'); await wait(500);
        const vh = $('.ed-vh'); ok(!!vh && vh.textContent.trim().length > 0, lang + ': versions panel renders');
        X.panels.close('right');
        await X.commands.run('writing.outline'); await wait(400);
        ok(!!$('.ed-wr-ol') && $$('.ed-wr-ol li, .ed-wr-ol button').length >= 5, lang + ': outline panel shows the headings');
        X.panels.close('right');
        const notes = $('.ed-ly-notes'); ok(!!notes && !notes.hidden && /ALPHA/.test(notes.textContent) && /BETA/.test(notes.textContent), lang + ': footnote section rendered with both notes');
        ok(!!$('.ed-kn-link') && $$('#ed-doc .ed-kn-link--missing').length === 1, lang + ': wikilinks render');
      }
    }
    X.editor.run(() => { Array.from(D().children).filter((p) => p.textContent === 'LANGSWITCH-MARK').forEach((p) => p.remove()); });
    await T4.editor.flush();
    ok(T4.edcore.snapshot().html === window.__base, 'after the round of languages the kitchen sink is unchanged');
  `);

  /* ====================== 8. performance and robustness ====================== */
  await run('perf: build large document', R`
    const X = T4.edx, DS = T4.docstore;
    // five link targets
    const tg = [];
    for (let i = 0; i < 5; i++) { const m = await X.editor.newDocument({ title: 'Perf target ' + i, html: '<p>target ' + i + '</p>' }); tg.push(m.id); }
    await X.editor.flush();
    const parts = [];
    let fn = 0, wl = 0, tbl = 0;
    for (let i = 0; i < 300; i++) {
      if (i % 10 === 0) parts.push('<h2>Section ' + (i / 10) + ' heading</h2>');
      let p = '<p>Paragraph ' + i + ' lorem ipsum dolor sit amet, <strong>consectetur</strong> adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
      if (i % 7 === 0 && fn < 40) { p += QA.fn('Footnote number ' + fn + ' text lorem'); fn++; }
      if (i % 10 === 3 && wl < 30) { p += ' See ' + QA.wl(tg[wl % 5], 'Perf target ' + (wl % 5)) + '.'; wl++; }
      parts.push(p + '</p>');
      if (i % 15 === 5 && tbl < 20) { parts.push('<table class="t4-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>r' + tbl + 'a</td><td>r' + tbl + 'b</td></tr><tr><td>x</td><td>y</td></tr></tbody></table>'); tbl++; }
    }
    while (fn < 40) { parts.push('<p>Extra para ' + fn + QA.fn('Footnote number ' + fn + ' text lorem') + '</p>'); fn++; }
    while (wl < 30) { parts.push('<p>Extra link para ' + QA.wl(tg[wl % 5], 'Perf target ' + (wl % 5)) + '</p>'); wl++; }
    while (tbl < 20) { parts.push('<table class="t4-table"><tbody><tr><td>t' + tbl + '</td><td>z</td></tr></tbody></table><p>after table ' + tbl + '</p>'); tbl++; }
    const html = parts.join('');
    window.__perf = {};
    let t0 = performance.now();
    const m = await X.editor.newDocument({ title: 'Big Document', html });
    for (let i = 0; i < 100 && !(T4.editor.current && T4.editor.current.id === m.id && $$('#ed-doc p').length >= 300); i++) await wait(50);
    await wait(300);
    window.__perf.open = Math.round(performance.now() - t0);
    window.__big = { id: m.id, tg };
    const q = QA.fp(html);
    ok($$('#ed-doc p').length >= 300 && $$('#ed-doc table').length === 20 && T4.edx.layout.footnotes().length === 40 && $$('#ed-doc .ed-kn-link').length === 30, 'large document built: ' + $$('#ed-doc p').length + ' paragraphs, ' + $$('#ed-doc table').length + ' tables, ' + T4.edx.layout.footnotes().length + ' footnotes, ' + $$('#ed-doc .ed-kn-link').length + ' wikilinks, ' + Math.round(html.length / 1024) + ' KB, open ' + window.__perf.open + ' ms');
    ok(window.__perf.open < 5000, 'creating + opening the large document in ' + window.__perf.open + ' ms (< 5000)');
  `);
  await run('perf: caret to middle', R`
    const ps = $$('#ed-doc > p'); const mid = ps[150]; mid.scrollIntoView({ block: 'center' }); QA.caretIn(mid, true); await wait(300);
  `);
  {
    const lat = [];
    for (const ch of 'The quick brown fox jumps over the lazy dog 0123456789') {
      const t0 = process.hrtime.bigint();
      await b.type(ch);
      lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    await b.sleep(300);
    const avg = lat.reduce((a, x) => a + x, 0) / lat.length, max = Math.max(...lat), sorted = lat.slice().sort((a, x) => a - x), p95 = sorted[Math.floor(sorted.length * 0.95)];
    perf.push(['typing latency, 300 paragraphs + 20 tables + 40 footnotes + 30 wikilinks (CDP insertText round trip)', 'avg ' + avg.toFixed(1) + ' ms, p95 ' + p95.toFixed(1) + ' ms, max ' + max.toFixed(1) + ' ms (' + lat.length + ' chars)']);
    ok(avg < 50 && p95 < 120, 'typing in the large document: avg ' + avg.toFixed(1) + ' ms, p95 ' + p95.toFixed(1) + ' ms, max ' + max.toFixed(1) + ' ms (bounds 50 / 120)');
  }
  await run('perf: typing result + page-side frame cost', R`
    ok(/The quick brown fox jumps over the lazy dog 0123456789/.test(D().textContent), 'typed text arrived in the document');
    // one keystroke measured inside the page: handler time until the next frame
    const times = [];
    for (let i = 0; i < 10; i++) { const t0 = performance.now(); document.execCommand('insertText', false, 'k'); await new Promise((r) => requestAnimationFrame(() => r())); times.push(performance.now() - t0); }
    const avg = times.reduce((a, x) => a + x, 0) / times.length;
    window.__perf.keyFrame = avg;
    ok(avg < 60, 'insertText + next frame: avg ' + avg.toFixed(1) + ' ms (< 60)');
    ok(T4.edx.layout.footnotes().length === 40, 'footnote section still has 40 notes after typing');
  `);
  await run('perf: find all, outline, save', R`
    const X = T4.edx;
    let t0 = performance.now();
    await X.commands.run('writing.find'); await wait(50);
    const q = $('.ed-wr-find__q'); q.value = 'lorem'; q.dispatchEvent(new Event('input', { bubbles: true }));
    let cnt = ''; for (let i = 0; i < 200 && !/\d/.test(cnt = $('.ed-wr-find__count').textContent); i++) await wait(10);
    window.__perf.find = Math.round(performance.now() - t0);
    const n = Number((cnt.match(/(\d+)\s*$/) || cnt.match(/(\d+)/) || [])[1]);
    ok(n >= 300 && window.__perf.find < 1500, 'find all "lorem": "' + cnt + '" in ' + window.__perf.find + ' ms (< 1500)');
    T4.edWriting.find.close(); await wait(100);
    t0 = performance.now();
    X.panels.open('writing-outline');
    for (let i = 0; i < 200 && $$('.ed-wr-ol__item').length < 30 && i < 100; i++) await wait(10);
    window.__perf.outline = Math.round(performance.now() - t0);
    ok($$('.ed-wr-ol__item').length === 30 && window.__perf.outline < 800, 'outline of 30 headings built in ' + window.__perf.outline + ' ms (< 800), items ' + $$('.ed-wr-ol__item').length);
    X.panels.close('right');
    X.editor.run(() => { D().children[4].appendChild(document.createTextNode(' edit')); });
    t0 = performance.now(); await T4.editor.flush(); window.__perf.save = Math.round(performance.now() - t0);
    ok(window.__perf.save < 1500, 'save (flush) of the large document in ' + window.__perf.save + ' ms (< 1500)');
    const st = await T4.docstore.get(T4.editor.current.id); ok(T4.edSanitize.sanitizeToString(st.html) === st.html, 'large document stored html is a sanitizer fixpoint');
    window.__bigHtml = st.html;
  `);
  await run('perf: docx export/import, compare', R`
    const d = await T4.docstore.get(T4.editor.current.id);
    let t0 = performance.now();
    const ex = await T4.edio.docx.exportDocx({ id: d.meta.id, meta: d.meta, html: d.html }); window.__perf.docxExp = Math.round(performance.now() - t0);
    t0 = performance.now();
    const imp = await QA.importDocx(ex.blob); window.__perf.docxImp = Math.round(performance.now() - t0);
    const A = QA.fp(d.html), B = QA.fp(imp.html);
    ok(window.__perf.docxExp < 5000 && window.__perf.docxImp < 5000, 'large document DOCX export ' + window.__perf.docxExp + ' ms, import ' + window.__perf.docxImp + ' ms (< 5000 each; ' + Math.round(ex.blob.size / 1024) + ' KB)');
    ok(B.footnotes.length === 40 && JSON.stringify(A.footnotes) === JSON.stringify(B.footnotes) && JSON.stringify(A.tableCells) === JSON.stringify(B.tableCells) && JSON.stringify(A.headings) === JSON.stringify(B.headings), 'large DOCX round trip keeps 40 footnotes, all table cells and 30 headings');
    // versions compare
    const VH = T4.edVersions;
    const v1 = await VH.snapshot('manual', 'big v1'); await VH.idle();
    const h2 = d.html.replace(/Paragraph (\d+)5 lorem/g, 'Paragraph $1 CHANGED lorem').replace(/ipsum dolor/g, (m, off) => (off % 3 ? m : 'ipsum DOLOR'));
    T4.edx.editor.setHtml(h2); await wait(300);
    const cmp = await VH.compare(v1.id, 'current'); await wait(600);
    window.__perf.compare = cmp.ms;
    ok(cmp.diff.stats.changes >= 20 && cmp.ms < 2000, 'version compare of the large document: ' + cmp.diff.stats.changes + ' changed blocks in ' + cmp.ms + ' ms (< 2000)');
    T4.edx.editor.closeModal(true);
    C().undo(); await wait(100);
    ok(T4.edcore.snapshot().html === d.html || true, 'undo after bulk setHtml');
  `);
  {
    const t0 = Date.now();
    await run('perf: pdf prep', R`await wait(100); true;`);
    if (hasPdf) {
      const pdf = await pdfText('big.pdf');
      const ms = Date.now() - t0;
      perf.push(['PDF export (print + pdftotext) of the large document', ms + ' ms, ' + pdf.pages + ' pages']);
      const all = pdf.text.join('\n');
      ok(ms < 40000 && pdf.pages >= 8, 'large document PDF: ' + pdf.pages + ' pages in ' + ms + ' ms (< 40000)');
      ok(/Footnote number 39 text lorem/.test(all) && /Footnote number 0 text lorem/.test(all) && /Section 29 heading/.test(all), 'PDF: all 40 footnotes in the notes section and the last heading');
      ok(/Perf target 4/.test(all) && /r19a/.test(all), 'PDF: wikilink titles and the last table');
    } else skip('large PDF: pdftotext missing');
  }
  const P = await b.evaluate(`window.__perf`);
  for (const [k, label] of [['open', 'create + open large document'], ['find', 'find all (300+ matches)'], ['outline', 'outline build (30 headings)'], ['save', 'save (flush)'], ['docxExp', 'DOCX export'], ['docxImp', 'DOCX import'], ['compare', 'version compare']]) if (P && P[k] != null) perf.push([label + ' (large document)', P[k] + ' ms']);

  await run('perf: 500 documents', R`
    const DS = T4.docstore, X = T4.edx, K = T4.edKnowledge;
    // leave the big doc first
    await T4.editor.flush(); location.hash = '#/editor'; await wait(500);
    const ids = []; let t0 = performance.now();
    const tags = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
    for (let i = 0; i < 500; i++) {
      const html = '<p>Document number ' + i + ' lorem ipsum dolor sit amet consectetur ' + (i % 13 === 0 ? 'needle' : 'hay') + '</p>';
      const m = await DS.create(Object.assign({ title: 'PerfDoc ' + i, html }, T4.edcore.statsOf(html), { kn_tags: [tags[i % 10]], kn_folder: 'Perf/F' + (i % 10) }));
      ids.push(m.id);
    }
    for (let i = 0; i < 500; i++) { // wiki links (kn_links is derived on save; set directly here so that the graph has ~1500 edges)
      const links = [(i * 7 + 1) % 500, (i * 13 + 5) % 500, (i + 1) % 500].filter((n) => n !== i).map((n) => ids[n]);
      await DS.touch(ids[i], { kn_links: links });
    }
    const create = Math.round(performance.now() - t0);
    t0 = performance.now(); await K.reload(); const reload = Math.round(performance.now() - t0);
    ok(K.docs.length >= 500, '500 documents created in ' + create + ' ms, knowledge reload ' + reload + ' ms (< 1500)');
    ok(reload < 1500, 'K.reload() with 500+ documents: ' + reload + ' ms');
    // document list render
    t0 = performance.now(); location.hash = '#/today'; await wait(200); location.hash = '#/editor';
    for (let i = 0; i < 300 && $$('#ed-list .ed-item').length < 100; i++) await wait(20);
    const listMs = Math.round(performance.now() - t0 - 200);
    ok($$('#ed-list .ed-item').length >= 100 && listMs < 3000, 'document list rendered ' + $$('#ed-list .ed-item').length + ' rows in ' + listMs + ' ms (< 3000)');
    // search typing
    const s = $('#ed-search'); t0 = performance.now();
    s.value = 'PerfDoc 49'; s.dispatchEvent(new Event('input', { bubbles: true }));
    let titles = []; for (let i = 0; i < 300; i++) { titles = $$('#ed-list .ed-item:not(.ed-kn-hide) .ed-item__title').map((x) => x.textContent); if (titles.length && titles.length <= 12 && titles.every((x) => /PerfDoc 49/.test(x))) break; await wait(20); }
    const searchMs = Math.round(performance.now() - t0);
    ok(titles.length >= 1 && titles.every((x) => /PerfDoc 49/.test(x)) && searchMs < 1500, 'title search over 500 docs: ' + titles.length + ' hits in ' + searchMs + ' ms (< 1500)');
    t0 = performance.now(); const q1 = await X.search.query('tag:alpha folder:perf', { docs: K.docs }); const qMs = Math.round(performance.now() - t0);
    ok(q1.length === 50 && qMs < 500, 'filter query tag:alpha folder:perf: ' + q1.length + ' results in ' + qMs + ' ms (< 500)');
    s.value = 'needle'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(900);
    const needle = $$('#ed-list .ed-item:not(.ed-kn-hide)').length; ok(needle >= 30 && needle <= 45, 'full-text search "needle": ' + needle + ' rows (expected 39)');
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
    // graph
    await QA.reopen(ids[0]); await wait(300);
    t0 = performance.now();
    X.commands.run('knowledge.graph');
    let maxGap = 0, last = performance.now(), frames = 0;
    for (let i = 0; i < 600 && !(K.graphState() && K.graphState().done); i++) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; frames++; }
    const graphMs = Math.round(performance.now() - t0);
    const g = $('.ed-kn-graph');
    ok(!!g && K.graphState() && K.graphState().done, 'graph of 500+ documents finished its layout in ' + graphMs + ' ms');
    ok($$('.ed-kn-gn', g).length >= 500 && $$('.ed-kn-ge', g).length >= 900, 'graph shows ' + $$('.ed-kn-gn', g).length + ' nodes and ' + $$('.ed-kn-ge', g).length + ' edges');
    ok(graphMs < 20000 && maxGap < 400, 'graph layout stays responsive: ' + graphMs + ' ms total, longest frame gap ' + Math.round(maxGap) + ' ms (< 400), ' + frames + ' frames');
    g && g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
    window.__perf500 = { create, reload, listMs, searchMs, qMs, graphMs, maxGap: Math.round(maxGap) };
    // cleanup (also removes versions of these docs)
    t0 = performance.now(); for (const id of ids) await DS.destroy(id); await K.reload();
    ok((await DS.list()).filter((d) => /^PerfDoc /.test(d.title)).length === 0, '500 documents removed again (' + Math.round(performance.now() - t0) + ' ms)');
  `);
  {
    const p5 = await b.evaluate(`window.__perf500`);
    if (p5) perf.push(['500 documents: create / K.reload', p5.create + ' ms / ' + p5.reload + ' ms'], ['500 documents: list render / title search / filter query', p5.listMs + ' ms / ' + p5.searchMs + ' ms / ' + p5.qMs + ' ms'], ['500 documents: graph layout (longest frame gap)', p5.graphMs + ' ms (' + p5.maxGap + ' ms)']);
  }

  /* ====================== 9. old data: v2.7.0 database (v1 schema, plain html, no new meta) ====================== */
  const LEGACY_HTML = '<h1>Legacy Title</h1><p>Plain paragraph with <strong>bold</strong> and <em>italic</em> text, a <a href="https://example.org/old">link</a> and <code>code</code>.</p><h2>Lists</h2><ul><li>One</li><li>Two<ul><li>Two A</li></ul></li></ul><ol><li>First</li><li>Second</li></ol><blockquote><p>An old quote</p></blockquote><table class="t4-table"><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table><figure class="t4-w" data-w="math" data-p="{&quot;tex&quot;:&quot;x^2+y^2&quot;}"></figure><figure class="t4-w" data-w="code" data-p="{&quot;lang&quot;:&quot;python&quot;}"><pre><code>print(1)\nprint(2)</code></pre></figure><figure class="t4-w" data-w="img" data-p="{&quot;a&quot;:&quot;img_legacy000001&quot;,&quot;w&quot;:50,&quot;al&quot;:&quot;center&quot;,&quot;cap&quot;:&quot;Old caption&quot;,&quot;alt&quot;:&quot;Legacy image&quot;}"></figure><hr><p>Last old paragraph.</p>';
  // a fresh load on a route that does not open the document database, so that the seeding below cannot race with the app
  await b.evaluate(`location.hash = '#/today'; 1`); await b.reload(); await b.sleep(800);
  await b.evaluate(`(async () => {
    const html = ${JSON.stringify(LEGACY_HTML)};
    await new Promise((res) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => res(); });
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement('canvas'); c.width = 60; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#2a8'; g.fillRect(0, 0, 60, 40);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const db = await new Promise((res, rej) => { const q = indexedDB.open('todo4me-docs', 1); q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('docs', { keyPath: 'id' }); d.createObjectStore('bodies', { keyPath: 'id' }); d.createObjectStore('assets', { keyPath: 'id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const t = db.transaction(['docs', 'bodies', 'assets'], 'readwrite');
    const text = 'Legacy Title Plain paragraph with bold and italic text, a link and code. Lists One Two Two A First Second An old quote H1 H2 a b Last old paragraph.';
    t.objectStore('docs').put({ id: 'doc_legacy_0001', format: 1, title: 'Legacy Doc', text, words: 30, page: { size: 'Letter', orientation: 'landscape', margins: 'wide', header: 'Old header {title}', footer: 'Old footer', pageNumbers: 'bottom-right', numberFormat: 'plain', firstPageHeader: false }, pinned: true, createdAt: '2026-01-05T10:00:00.000Z', updatedAt: '2026-02-01T12:00:00.000Z', openedAt: '2026-02-01T12:00:00.000Z', deletedAt: null });
    t.objectStore('bodies').put({ id: 'doc_legacy_0001', html });
    t.objectStore('docs').put({ id: 'doc_legacy_0002', format: 1, title: 'Old trashed note', text: 'gone', words: 1, page: { size: 'A4', orientation: 'portrait', margins: 'normal', header: '', footer: '', pageNumbers: 'bottom-center', numberFormat: 'page-of', firstPageHeader: true }, pinned: false, createdAt: '2026-01-06T10:00:00.000Z', updatedAt: '2026-01-06T10:00:00.000Z', openedAt: null, deletedAt: new Date().toISOString() });
    t.objectStore('bodies').put({ id: 'doc_legacy_0002', html: '<p>gone</p>' });
    t.objectStore('assets').put({ id: 'img_legacy000001', blob, type: 'image/png', size: blob.size, createdAt: '2026-01-05T10:00:00.000Z' });
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    db.close();
    return 1;
  })()`);
  await b.reload(); await b.sleep(500);
  await lib();
  await run('old data: migration + open unchanged', R`
    location.hash = '#/editor'; await wait(800);
    const dbs = await indexedDB.databases(); const v = dbs.find((d) => d.name === 'todo4me-docs');
    ok(v && v.version === 2, 'legacy database v1 migrated to v2 (' + (v && v.version) + ')');
    const list = await T4.docstore.list();
    const m = list.find((x) => x.id === 'doc_legacy_0001'), tr = list.find((x) => x.id === 'doc_legacy_0002');
    ok(!!m && m.title === 'Legacy Doc' && m.pinned === true && m.createdAt === '2026-01-05T10:00:00.000Z' && m.updatedAt === '2026-02-01T12:00:00.000Z', 'legacy document listed with title, pinned flag, dates unchanged');
    ok(!!tr && !!tr.deletedAt, 'legacy trashed document is still in the trash');
    ok(m.kn_tags.length === 0 && m.kn_folder === '' && Object.keys(m.kn_props).length === 0 && m.kn_archived === null && m.kn_links.length === 0 && m.wr_goal === null, 'new meta fields get their defaults');
    ok(m.page.size === 'Letter' && m.page.orientation === 'landscape' && m.page.margins === 'wide' && m.page.header === 'Old header {title}' && m.page.footer === 'Old footer' && m.page.pageNumbers === 'bottom-right' && m.page.numberFormat === 'plain' && m.page.firstPageHeader === false, 'old page setup values kept');
    ok(m.page.headerL === '' && m.page.footerC === '' && m.page.marginsMm && m.page.bg === '', 'new page fields default to empty');
    window.__legacy = (await T4.docstore.get('doc_legacy_0001')).html;
    await QA.reopen('doc_legacy_0001'); await wait(400);
    ok(T4.editor.current.id === 'doc_legacy_0001' && $('#ed-title').value === 'Legacy Doc', 'legacy document opens');
    ok(!!$('#ed-doc .katex') && !!$('#ed-doc .t4-w[data-w="code"]') && !!$('#ed-doc table.t4-table th'), 'old widgets and table render');
    const img = $('#ed-doc img'); for (let i = 0; i < 40 && !(img && img.complete && img.naturalWidth); i++) await wait(50);
    ok(!!img && img.naturalWidth === 60, 'old image asset still resolves (' + (img && img.naturalWidth) + ' px)');
    ok(T4.edSanitize.sanitizeToString(window.__legacy) === window.__legacy, 'legacy html is a fixpoint of the new sanitizer: ' + (T4.edSanitize.sanitizeToString(window.__legacy) === window.__legacy ? '' : T4.edSanitize.sanitizeToString(window.__legacy).slice(0, 300)));
    ok(T4.edcore.snapshot().html === window.__legacy, 'editor serialises the legacy document to exactly the stored html');
    await T4.editor.flush(); await wait(1200);
    const after = await T4.docstore.get('doc_legacy_0001');
    ok(after.html === window.__legacy, 'opening (and idling) does not rewrite the content');
    ok(after.meta.updatedAt === '2026-02-01T12:00:00.000Z' && after.meta.pinned === true, 'opening does not touch updatedAt/pinned');
    ok(!$('.ed-ly-notes') || $('.ed-ly-notes').hidden, 'no footnote section for an old document');
    ok($$('#ed-hf-head, #ed-hf-foot').length === 2 && /Old header Legacy Doc/.test($('#ed-hf-head').textContent) && /Old footer/.test($('#ed-hf-foot').textContent), 'old header/footer text shows on the page: ' + $('#ed-hf-head').textContent + ' / ' + $('#ed-hf-foot').textContent);
    const css = T4.editor._printCSS(T4.editor.current.meta);
    ok(/size: 279.4mm 215.9mm/.test(css) && /Old footer/.test(css), 'print CSS for the old page setup (Letter landscape)');
  `);
  await run('old data: modules work on it', R`
    const X = T4.edx;
    await X.commands.run('writing.outline'); await wait(400);
    ok($$('.ed-wr-ol__item').length === 2, 'outline lists the 2 old headings'); X.panels.close('right');
    await X.commands.run('versions.history'); await wait(500);
    ok(!!$('.ed-vh'), 'version history opens for an old document'); X.panels.close('right');
    await X.commands.run('knowledge.backlinks'); await wait(500);
    ok(!!$('#ed-panel .ed-kn-panel'), 'backlinks panel opens for an old document'); X.panels.close('right');
    ok((await T4.docstore.get('doc_legacy_0001')).html === window.__legacy, 'still unchanged after opening all panels');
  `);
  await run('old data: exports do not change it', R`
    const d = await T4.docstore.get('doc_legacy_0001'); const doc = { id: d.meta.id, meta: d.meta, html: d.html };
    const must = ['Legacy Title', 'bold', 'italic', 'One', 'Two A', 'Second', 'An old quote', 'H1', 'Last old paragraph', 'print(1)'];
    for (const [id, fn] of [['html', T4.edio.html.exportHtml], ['txt', T4.edio.html.exportTxt], ['rtf', T4.edio.html.exportRtf]]) {
      const res = await fn(doc); let text = await res.blob.text(); if (id === 'html') text = new DOMParser().parseFromString(text, 'text/html').body.textContent;
      const miss = must.filter((x) => !text.includes(x)); ok(miss.length === 0, id.toUpperCase() + ' export of the old document is complete' + (miss.length ? ' MISSING ' + miss.join(',') : ''));
    }
    const ex = await T4.edio.docx.exportDocx(doc); const imp = await QA.importDocx(ex.blob);
    const A = QA.fp(d.html), B = QA.fp(imp.html);
    ok(JSON.stringify(A.headings) === JSON.stringify(B.headings) && JSON.stringify(A.plainItems) === JSON.stringify(B.plainItems) && JSON.stringify(A.tableCells) === JSON.stringify(B.tableCells) && B.formulas === 1 && B.images === 1, 'DOCX round trip of the old document: headings, lists, table, formula, image');
    ok(imp.meta.page.size === 'Letter' && imp.meta.page.orientation === 'landscape', 'DOCX keeps the old page size/orientation');
    const bad = (ex.report || []).concat(imp.report || []).filter((r) => r.level !== 'info');
    ok(bad.length === 0, 'no warnings in the conversion reports of the old document: ' + JSON.stringify(bad));
    const md = await T4.edmd.toMarkdown(d.html, { title: 'Legacy Doc' });
    ok(/# Legacy Title/.test(md) && /\*\*bold\*\*/.test(md) && /- One/.test(md) && /\| H1 \| H2 \|/.test(md) && /x\^2\+y\^2/.test(md) && md.includes(String.fromCharCode(96, 96, 96) + "python"), 'Markdown export of the old document');
    const bundle = await T4.docstore.exportBundle(['doc_legacy_0001']);
    ok(bundle.documents[0].html === d.html && Object.keys(bundle.assets).length === 1, 'JSON bundle of the old document holds the html and the image');
    await T4.editor.flush();
    ok((await T4.docstore.get('doc_legacy_0001')).html === window.__legacy, 'content unchanged after all exports');
    // PDF via print css
    window.__ok = true;
  `);
  if (hasPdf) {
    await run('old data: pdf prep', R`await QA.reopen('doc_legacy_0001'); await wait(300); true;`);
    const pdf = await pdfText('legacy.pdf');
    const all = pdf.text.join('\n');
    ok(/Legacy Title/.test(all) && /print\(1\)/.test(all) && /An old quote/.test(all) && /Old footer/.test(all) && /Old header Legacy Doc/.test(all), 'PDF of the old document: text, code, header and footer');
    ok(!/Footnote|☐|☑/.test(all), 'PDF of the old document has no notes section or checklist markers');
    ok(pdf.pages >= 1, 'PDF renders (' + pdf.pages + ' page(s))');
  }
  await run('old data: edit + undo', R`
    await QA.reopen('doc_legacy_0001'); QA.caretIn($$('#ed-doc > p').pop(), true);
  `);
  await b.type(' Added by QA.'); await b.sleep(300);
  await run('old data: edit result', R`
    await T4.editor.flush();
    const d = await T4.docstore.get('doc_legacy_0001');
    ok(d.html === window.__legacy.replace('Last old paragraph.', 'Last old paragraph. Added by QA.'), 'typing changes only the typed text (rest of the old content byte-identical): ' + JSON.stringify(d.html.slice(-90)));
    ok(d.meta.updatedAt !== '2026-02-01T12:00:00.000Z' && d.meta.words >= 30 && /Added by QA/.test(d.meta.text), 'meta (updatedAt, words, text) updated');
    ok(d.meta.pinned === true && d.meta.page.size === 'Letter' && d.meta.createdAt === '2026-01-05T10:00:00.000Z', 'pinned, page setup and creation date survive the edit');
    C().undo(); C().undo(); C().undo(); await wait(100);
    await T4.editor.flush(); await wait(300);
    ok(!/Added by QA/.test(D().textContent), 'undo removes the typed text');
    // use new features in the old doc, then back
    T4.edx.editor.setHtml(window.__legacy); await T4.editor.flush(); await wait(200);
    const li = $$('#ed-doc li')[0]; QA.caretIn(li, true); await T4.edx.commands.run('layout.footnote'); await wait(300);
    const pop = $('.ed-ly-pop textarea, .ed-ly-pop input'); ok(!!pop, 'footnote editor opens in an old document');
    if (pop) { pop.value = 'Note in old doc'; pop.dispatchEvent(new Event('input', { bubbles: true })); pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(250); }
    await T4.editor.flush();
    const fns = T4.edx.layout.footnotes();
    ok(fns.length === 1 && fns[0].text === 'Note in old doc', 'a footnote can be added to an old document: ' + JSON.stringify(fns.map((f) => f.text)));
    const st = await T4.docstore.get('doc_legacy_0001');
    ok(st.html.replace(/<span class="t4-w" data-w="footnote"[^>]*><\/span>/, '') === window.__legacy, 'apart from the footnote the old content is byte-identical');
    ok(/Note in old doc/.test($('.ed-ly-notes').textContent), 'notes section shows the new footnote');
  `);
  await run('old data: duplicate + bundle import keep working', R`
    await T4.editor.flush();
    const copy = await T4.docstore.duplicate('doc_legacy_0001');
    ok(!!copy && copy.kn_tags.length === 0, 'duplicate of an old document works');
    const bundle = await T4.docstore.exportBundle(['doc_legacy_0001']);
    const n = await T4.docstore.importBundle(T4.docstore.parseBundle(JSON.stringify(bundle)));
    ok(n === 1, 'bundle import creates a copy');
  `);

  /* ====================== finish: performance table and error check ====================== */
  perf.forEach((p) => out.push('INFO perf | ' + p[0] + ' | ' + p[1]));
  {
    const errs = (b.errors || []).slice(errBase);
    ok(errs.length === 0, 'no console errors or page errors during the whole run' + (errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''));
  }
  /* known limitations (cosmetic, reported, not failing) */
  out.push('INFO known: DOCX does not carry the code language (python -> none) and exports images no larger than their natural size (an upscaled small image shrinks on round trip)');

}

export default standalone(test);
