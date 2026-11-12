// QA suite helpers evaluated inside the page (window.QA). Kept apart from tests/editor-qa.mjs so the suite stays readable.
export const QA_LIB = String.raw`
window.QA = window.QA || {};
(() => {
  const Q = window.QA;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  Q.wait = wait;
  Q.png = (w, h, c1, c2) => new Promise((res) => { const c = document.createElement('canvas'); c.width = w || 40; c.height = h || 30; const g = c.getContext('2d'); g.fillStyle = c1 || '#c33'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = c2 || '#39f'; g.fillRect(10, 8, 20, 14); c.toBlob(res, 'image/png'); });
  Q.esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  Q.wid = (type, props, inline) => T4.edw.create(type, props, inline).outerHTML;
  Q.fn = (text) => Q.wid('footnote', { text }, true);
  Q.wl = (d, t) => Q.wid('wikilink', { d, t }, true);
  Q.callout = (ty, title, body) => '<blockquote class="t4-callout t4-callout--' + ty + '"><p><strong>' + title + '</strong></p><p>' + body + '</p></blockquote>';
  Q.PAGE = { size: 'A3', orientation: 'landscape', margins: 'custom', marginsMm: { t: 12, r: 15, b: 18, l: 20 }, headerL: 'HDR-LEFT {title}', header: 'HDR-CENTER', headerR: 'HDR-RIGHT', footer: '', footerC: 'FTR-CENTER', footerR: 'FTR-RIGHT', pageNumbers: 'bottom-right', numberFormat: 'page-of', firstPageHeader: true };
  Q.META = { kn_tags: ['qa', 'sink'], kn_folder: 'Projects/QA', kn_props: { status: 'draft', owner: 'qa' }, wr_goal: 500 };
  /** The kitchen sink: every block/inline feature of every module in one document. Resolves { id, targetId, assetId, html }. */
  Q.sinkHtml = (targetId, assetId, missingId) => {
    const h = [];
    h.push('<h1>Kitchen Sink</h1>');
    h.push('<p>Intro with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>, <code>inline code</code> and a <a href="https://example.org/page">web link</a>. See ' + Q.wl(targetId, 'QA Target') + ' and ' + Q.wl(missingId, 'Ghost Page') + '.' + Q.fn('First footnote ALPHA text') + '</p>');
    h.push(Q.wid('toc', { levels: 3, title: 'Contents', numbered: false }, false));
    h.push('<h2>Lists</h2>');
    h.push('<ul><li>Bullet one<ul><li>Nested bullet</li></ul></li><li>Bullet two</li></ul>');
    h.push('<ol><li>Step first</li><li>Step second<ol><li>Step second A</li></ol></li></ol>');
    h.push('<h3>Checklist</h3>');
    h.push('<ul class="t4-check"><li data-x-check="1">Done item<ul class="t4-check"><li data-x-check="0">Nested todo item</li></ul></li><li data-x-check="1">Another done item</li><li data-x-check="0">Open item</li></ul>');
    h.push('<h2>Callouts</h2>');
    [['note', 'Note'], ['tip', 'Tip'], ['info', 'Info'], ['warning', 'Warning'], ['danger', 'Danger']].forEach(([ty, ti]) => h.push(Q.callout(ty, ti, 'Body of the ' + ti + ' callout.')));
    h.push('<p>Second paragraph with note.' + Q.fn('Second footnote BETA text') + ' End.</p>');
    h.push('<h2>Data</h2>');
    h.push('<table class="t4-table"><thead><tr><th>Name</th><th>Qty</th></tr></thead><tbody><tr><td>Apple</td><td>3</td></tr><tr><td>Pear</td><td>7</td></tr></tbody></table>');
    h.push(Q.wid('img', { a: assetId, w: 40, al: 'center', cap: 'A caption', alt: 'Test image' }, false));
    h.push(Q.wid('math', { tex: 'E=mc^2 + \\frac{a}{b}' }, false));
    const code = T4.edw.create('code', { lang: 'javascript', code: 'const answer = 42;\nconsole.log(answer);' }, false); h.push(code.outerHTML);
    h.push(Q.wid('chart', { type: 'bar', title: 'Fruit sales', labels: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Sales', values: [3, 5, 8] }] }, false));
    h.push(Q.wid('pagebreak', {}, false));
    h.push('<h2>After the break</h2><p>Last paragraph after the page break.</p>');
    return h.join('');
  };
  Q.buildSink = async (opts) => {
    opts = opts || {};
    const X = T4.edx, DS = T4.docstore;
    const tm = await X.editor.newDocument({ title: 'QA Target', html: '<p>I am the target note.</p>' });
    await X.editor.flush();
    const assetId = await DS.putAsset(await Q.png());
    const missingId = 'doc_missing_qa_0001';
    const html = Q.sinkHtml(tm.id, assetId, missingId);
    const meta = Object.assign({ page: Q.PAGE }, Q.META);
    const m = await X.editor.newDocument({ title: 'Kitchen Sink', html, meta });
    for (let i = 0; i < 40 && !(X.editor.current && X.editor.current.id === m.id); i++) await wait(50);
    await wait(300);
    await X.editor.flush();
    Q.ids = { target: tm.id, sink: m.id, asset: assetId, missing: missingId };
    return Q.ids;
  };
  /** Structural fingerprint of an HTML string (used for round trip equality). */
  Q.fp = (html) => {
    const d = document.createElement('div'); d.innerHTML = html;
    const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const widgets = (type) => Array.from(d.querySelectorAll('.t4-w[data-w="' + type + '"]')).map((w) => { try { return JSON.parse(w.getAttribute('data-p')); } catch (e) { return null; } });
    const own = (li) => { const c = li.cloneNode(true); c.querySelectorAll('ul, ol').forEach((x) => x.remove()); return txt(c); };
    const lis = Array.from(d.querySelectorAll('ul.t4-check > li')).map((li) => (li.getAttribute('data-x-check') === '1' ? '[x]' : '[ ]') + ' ' + own(li));
    return {
      headings: Array.from(d.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => h.tagName + ':' + txt(h)),
      plainItems: Array.from(d.querySelectorAll('ul:not(.t4-check) > li, ol > li')).map(own),
      checks: lis,
      callouts: Array.from(d.querySelectorAll('blockquote.t4-callout')).map((b) => b.className.replace(/.*t4-callout--(\w+).*/, '$1') + ':' + txt(b.querySelector('p'))),
      footnotes: widgets('footnote').map((p) => p && p.text),
      wikilinks: widgets('wikilink').map((p) => p && p.t),
      tableCells: Array.from(d.querySelectorAll('table td, table th')).map(txt),
      images: d.querySelectorAll('.t4-w[data-w="img"]').length,
      formulas: d.querySelectorAll('.t4-w[data-w="math"]').length,
      charts: d.querySelectorAll('.t4-w[data-w="chart"]').length,
      tocs: d.querySelectorAll('.t4-w[data-w="toc"]').length,
      breaks: d.querySelectorAll('.t4-w[data-w="pagebreak"]').length,
      codes: d.querySelectorAll('.t4-w[data-w="code"]').length,
    };
  };
  Q.metaOf = (m) => ({ title: m.title, page: m.page, kn_tags: m.kn_tags, kn_folder: m.kn_folder, kn_props: m.kn_props, wr_goal: m.wr_goal, kn_archived: m.kn_archived, pinned: m.pinned });
  Q.reopen = async (id) => { await T4.editor.openDoc(id); await wait(500); };
  Q.caretIn = (el, atEnd) => { const d = document.getElementById('ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); getSelection().removeAllRanges(); getSelection().addRange(r); };
  Q.exportBlob = async (id, docId) => { const d = await T4.docstore.get(docId); return T4.edx.exporters.get(id).run({ id: d.meta.id, meta: d.meta, html: d.html }); };
  Q.b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  Q.importDocx = async (blob, name) => { const f = new File([blob], name || 'x.docx'); const imp = T4.edx.importers.forFile(f); return imp.run(f); };
})();
`;
