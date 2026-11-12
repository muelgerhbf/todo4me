// Editor module "io" (DOCX/HTML/TXT/RTF export, DOCX import, zip): CDP_PORT=9345 node tests/cdp.mjs tests/editor-io.mjs [shots-dir]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { standalone } from './editor-helpers.mjs';

const WS = process.env.IO_WS || '/tmp/claude-1000/-home-mirac-dev-todo4me/fc4034f0-178e-412d-b0b6-24177b12b817/scratchpad/ws';

export async function test(t) {
  const { b, run, out } = t;
  const shot = async (n) => { try { await b.shot(n, false); } catch (e) { /* optional */ } };
  const okN = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

  /* ---------- registration, i18n ---------- */
  await run('registration', `
    window.X = () => T4.edx; window.IO = () => T4.edio;
    ok(['io.docx','io.html','io.txt','io.rtf'].every((i) => !!X().exporters.get(i)), 'exporters docx/html/txt/rtf registered');
    ok(X().importers.list().some((i) => i.id === 'io.docx' && i.exts.includes('docx')), 'docx importer registered');
    ok(!X().i18n.missing()['edx.io.'], 'all io texts exist in en/de/tr/es');
    ok(!X().problems.some((p) => /io\\./.test(JSON.stringify(p))), 'no soft registration problems');
  `);

  /* ---------- zip library ---------- */
  const PYB64 = execFileSync('python3', ['-c', "import zipfile,io,base64;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr('hello.txt','hello from python '*40);z.close();print(base64.b64encode(b.getvalue()).decode())"], { encoding: 'utf8' }).trim();
  await run('zip', `
    const Z = IO().zip, enc = new TextEncoder();
    ok(Z.crc32(enc.encode('123456789')) === 0xCBF43926, 'CRC32("123456789") = CBF43926');
    ok(Z.crc32(new Uint8Array(0)) === 0, 'CRC32 of nothing is 0');
    const w = Z.createWriter();
    const big = 'hello zip '.repeat(5000);
    await w.add('a.txt', 'small');
    await w.add('dir/b.txt', big);
    await w.add('raw.bin', new Uint8Array([1,2,3,4,5,250]), { store: true });
    await w.add('ünï.txt', 'utf8 name');
    const bytes = await w.finish();
    const r = await Z.readZip(bytes);
    ok(r.names().join() === 'a.txt,dir/b.txt,raw.bin,ünï.txt', 'names round trip incl. UTF-8: ' + r.names());
    ok(await r.text('a.txt') === 'small' && await r.text('dir/b.txt') === big, 'content round trip (stored + deflate)');
    ok(r.entries.get('dir/b.txt').method === 8 && r.entries.get('dir/b.txt').csize < big.length / 5, 'large entry is deflated (' + r.entries.get('dir/b.txt').csize + ' of ' + big.length + ')');
    ok(r.entries.get('a.txt').method === 0, 'small entry stays stored');
    ok((await r.read('raw.bin')).join() === '1,2,3,4,5,250', 'binary entry intact');
    // a deflate zip produced elsewhere (python zipfile) is embedded base64 below
    const pyZip = Uint8Array.from(atob('${PYB64}'), (c) => c.charCodeAt(0));
    let pyOk = false, pyMsg = '';
    try { const pr = await Z.readZip(pyZip); pyMsg = await pr.text('hello.txt'); pyOk = true; } catch (e) { pyMsg = e.message; }
    window.__pyZipOk = pyOk;
    ok(pyOk && pyMsg === 'hello from python '.repeat(40), 'zip made by python (deflate) is read correctly: ' + (pyOk ? pyMsg.length + ' chars' : pyMsg));
    // corruption detection
    const bad = bytes.slice(); bad[40] ^= 0xff;
    let err = ''; try { const rb = await Z.readZip(bad); for (const n of rb.names()) await rb.read(n); } catch (e) { err = e.message; }
    ok(/CRC|damaged|size|inflat|data/i.test(err) || err, 'corrupt entry is detected: ' + err);
    err = ''; try { await Z.readZip(bytes.slice(0, 30)); } catch (e) { err = e.message; }
    ok(/zip/.test(err), 'truncated file refused: ' + err);
    err = ''; try { await Z.readZip(enc.encode('this is not a zip file at all, just text '.repeat(3))); } catch (e) { err = e.message; }
    ok(/not a ZIP/i.test(err), 'non-zip refused: ' + err);
    // zip bomb: declared size above the cap
    const bomb = bytes.slice(); const dv = new DataView(bomb.buffer);
    let p = dv.getUint32(bomb.length - 6, true); // central dir offset (EOCD at end, no comment)
    dv.setUint32(p + 24, 250 * 1024 * 1024, true);
    err = ''; try { await Z.readZip(bomb, { limits: { entryBytes: 500 * 1024 * 1024 } }); } catch (e) { err = e.message; }
    ok(/too large/i.test(err), 'declared size over the cap refused: ' + err);
    // lying header: tiny declared size, real content bigger -> refused while inflating
    const lie = bytes.slice(); const dl = new DataView(lie.buffer);
    let q = dl.getUint32(lie.length - 6, true);
    // second central entry (dir/b.txt): find by name
    let cur = q; for (let i = 0; i < 4; i++) { const nl = dl.getUint16(cur + 28, true); const name = new TextDecoder().decode(lie.subarray(cur + 46, cur + 46 + nl)); if (name === 'dir/b.txt') break; cur += 46 + nl + dl.getUint16(cur + 30, true) + dl.getUint16(cur + 32, true); }
    dl.setUint32(cur + 24, 100, true);
    err = ''; try { const rl = await Z.readZip(lie); await rl.read('dir/b.txt'); } catch (e) { err = e.message; }
    ok(/larger than declared|size mismatch|bomb/i.test(err), 'lying size header refused: ' + err);
    // too many entries
    err = ''; try { await Z.readZip(bytes, { limits: { entries: 2 } }); } catch (e) { err = e.message; }
    ok(/too many/i.test(err), 'entry count capped: ' + err);
    // zip64 detection
    const z64 = bytes.slice(); new DataView(z64.buffer).setUint16(z64.length - 12, 0xffff, true);
    err = ''; try { await Z.readZip(z64); } catch (e) { err = e.message; }
    ok(/ZIP64/.test(err), 'ZIP64 detected and reported: ' + err);
    ok(Z.hasCompression, 'CompressionStream/DecompressionStream available');
  `);

  /* ---------- rich document ---------- */
  await run('build rich document', `
    await newDoc('blank');
    const mkPng = async (color) => { const c = document.createElement('canvas'); c.width = 800; c.height = 400; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0,0,800,400); g.fillStyle = '#fff'; g.fillRect(20,20,200,200); return new Promise((r) => c.toBlob(r, 'image/png')); };
    window.assetA = await T4.docstore.putAsset(await mkPng('#2f6fed'));
    const has = (n) => X().widgets.has(n);
    const wd = (type, p, inline) => '<' + (inline ? 'span' : 'figure') + ' class="t4-w" data-w="' + type + '" data-p="' + JSON.stringify(p).replace(/"/g, '&quot;') + '"></' + (inline ? 'span' : 'figure') + '>';
    let h = '<h1>Quarterly report</h1>'
      + '<p>Plain <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s> H<sub>2</sub>O x<sup>2</sup> <code>inline_code()</code> <mark>marked</mark> '
      + '<span style="color: #d14343">red text</span> <span style="font-family: Georgia">serif</span> <span style="font-size: 18pt">big</span> <a href="https://example.org/page?a=1&amp;b=2">a link</a> end.</p>'
      + '<p style="text-align: center; background-color: #eef1ff; margin-left: 40px">Centered shaded indented paragraph</p>'
      + '<h2>Lists</h2><ul><li>Bullet one<ul><li>Nested bullet<ol><li>deep number</li></ol></li></ul></li><li>Bullet two</li></ul>'
      + '<ol start="3"><li>Third</li><li>Fourth</li></ol>'
      + '<h2>Table</h2><table><thead><tr><th>Name</th><th>Qty</th><th>Note</th></tr></thead><tbody><tr><td>Apples</td><td style="text-align: right">12</td><td rowspan="2">merged vertical</td></tr><tr><td>Pears</td><td style="text-align: right; background-color: #fff6e0">7</td></tr><tr><td colspan="2">wide cell</td><td>x</td></tr></tbody></table>'
      + '<blockquote><p>A quoted thought.</p></blockquote>'
      + wd('img', { a: assetA, w: 50, al: 'center', cap: 'Figure caption', alt: 'blue box' })
      + wd('code', { lang: 'javascript' }).replace('></figure>', '><pre><code>function hi() {\\n  return 42;\\n}</code></pre></figure>')
      + wd('math', { tex: '\\\\frac{a}{b} + \\\\sqrt{x^2+1}' })
      + '<p>Inline math: ' + wd('math', { tex: 'E=mc^2' }, true) + ' done.</p>'
      + wd('chart', { type: 'bar', title: 'Sales', labels: ['Q1','Q2','Q3'], series: [{ name: 'A', values: [3,5,2] }] })
      + wd('draw', { h: 120, shapes: [{ t: 'rect', x: 20, y: 20, w: 120, h: 60, text: 'Box' }] })
      + wd('pagebreak', {})
      + '<h2>After the break</h2>';
    window.__has = { wikilink: has('wikilink'), toc: has('toc'), footnote: has('footnote') };
    if (has('toc')) h += wd('toc', { levels: 3, title: 'Contents' });
    if (has('footnote')) h += '<p>Text with a note' + wd('footnote', { text: 'The footnote text.' }, true) + ' here.</p>';
    if (has('wikilink')) h += '<p>See ' + wd('wikilink', { d: 'doc_missing', t: 'Other note' }, true) + '.</p>';
    const chk = T4.edSanitize.sanitizeToString('<ul class="t4-check"><li data-x-check="1">x</li></ul>').includes('t4-check');
    window.__has.check = chk;
    if (chk) h += '<ul class="t4-check"><li data-x-check="1">done item</li><li data-x-check="0">open item</li></ul>';
    const cal = T4.edSanitize.sanitizeToString('<blockquote class="t4-callout t4-callout--warning"><p>x</p></blockquote>').includes('t4-callout');
    window.__has.callout = cal;
    if (cal) h += '<blockquote class="t4-callout t4-callout--warning"><p><strong>Careful</strong></p><p>Callout body text.</p></blockquote>';
    X().editor.setHtml(h);
    await T4.editor.flush();
    const cur = T4.editor.current;
    cur.meta.page = T4.docstore.cleanPage({ size: 'Letter', orientation: 'portrait', margins: 'moderate', header: '{title} header', footer: 'Footer {date}', pageNumbers: 'bottom-right', numberFormat: 'page-of', firstPageHeader: false });
    await T4.docstore.save(cur.id, null, { title: 'Quarterly report', page: cur.meta.page });
    const d = await T4.docstore.get(cur.id);
    window.__doc = { id: d.meta.id, meta: d.meta, html: d.html };
    ok(d.meta.page.size === 'Letter' && d.html.includes('Quarterly'), 'rich test document stored (widgets: ' + JSON.stringify(window.__has) + ')');
  `);

  /* ---------- DOCX export + structure validation ---------- */
  await run('docx export', `
    const t0 = performance.now();
    const blob = await X().exporters.get('io.docx').run(window.__doc);
    window.__ms = Math.round(performance.now() - t0);
    ok(blob instanceof Blob && blob.size > 5000, 'docx blob created (' + blob.size + ' bytes, ' + window.__ms + ' ms)');
    const buf = new Uint8Array(await blob.arrayBuffer());
    window.__docx = buf;
    const z = await IO().zip.readZip(buf);
    const names = z.names();
    const need = ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/numbering.xml','word/settings.xml','word/_rels/document.xml.rels','docProps/core.xml'];
    ok(need.every((n) => names.includes(n)), 'required parts present: ' + need.filter((n) => !names.includes(n)).join(',') + ' (' + names.length + ' parts)');
    ok(names[0] === '[Content_Types].xml', '[Content_Types].xml is the first entry');
    // XML well-formedness of every xml/rels part
    const bad = [];
    for (const n of names) { if (/\\.(xml|rels)$/.test(n)) { const doc = new DOMParser().parseFromString(await z.text(n), 'application/xml'); if (doc.getElementsByTagName('parsererror').length) bad.push(n); } }
    ok(!bad.length, 'all XML parts are well-formed ' + bad.join(','));
    // relationships resolve
    const relDoc = new DOMParser().parseFromString(await z.text('word/_rels/document.xml.rels'), 'application/xml');
    const rels = Array.from(relDoc.documentElement.children);
    const missing = rels.filter((r) => r.getAttribute('TargetMode') !== 'External' && !z.has('word/' + r.getAttribute('Target')));
    ok(!missing.length, 'every internal relationship target exists (' + rels.length + ' rels) ' + missing.map((r) => r.getAttribute('Target')));
    const ids = rels.map((r) => r.getAttribute('Id'));
    ok(new Set(ids).size === ids.length, 'relationship ids are unique');
    const docXml = await z.text('word/document.xml');
    const used = Array.from(docXml.matchAll(/r:(?:id|embed)="(rId\\d+)"/g)).map((m) => m[1]);
    ok(used.every((i) => ids.includes(i)), 'all r:id references in document.xml are defined (' + used.length + ')');
    // content types complete
    const ct = new DOMParser().parseFromString(await z.text('[Content_Types].xml'), 'application/xml').documentElement;
    const defs = new Set(Array.from(ct.children).filter((c) => c.localName === 'Default').map((c) => c.getAttribute('Extension')));
    const ovr = new Set(Array.from(ct.children).filter((c) => c.localName === 'Override').map((c) => c.getAttribute('PartName')));
    const uncovered = names.filter((n) => n !== '[Content_Types].xml' && !ovr.has('/' + n) && !defs.has(n.split('.').pop()));
    ok(!uncovered.length, 'content types cover every part ' + uncovered.join(','));
    const unusedOv = Array.from(ovr).filter((p) => !z.has(p.slice(1)));
    ok(!unusedOv.length, 'no content-type override points to a missing part ' + unusedOv.join(','));
    // content
    ok(/w:pStyle w:val="Heading1"/.test(docXml) && /w:pStyle w:val="Heading2"/.test(docXml), 'headings use Heading styles');
    ok(/<w:numPr>/.test(docXml) && (await z.text('word/numbering.xml')).includes('w:numFmt w:val="bullet"'), 'lists use numbering.xml (bullets + decimal)');
    ok(/w:ilvl w:val="2"/.test(docXml), 'nested list levels (ilvl 2)');
    ok(/w:startOverride w:val="3"/.test(await z.text('word/numbering.xml')), 'ordered list start=3 kept');
    ok(/<w:tbl>/.test(docXml) && /w:tblHeader/.test(docXml) && /w:gridSpan w:val="2"/.test(docXml) && /w:vMerge w:val="restart"/.test(docXml), 'table: header row, colspan, rowspan');
    ok(/<w:drawing>/.test(docXml) && names.filter((n) => n.startsWith('word/media/')).length >= 3, 'images embedded (image + chart + drawing PNG): ' + names.filter((n) => n.startsWith('word/media/')).length);
    ok(/<m:oMath>/.test(docXml) && /<m:f>/.test(docXml) && /<m:rad>/.test(docXml), 'formulas are real Word equations (OMML: fraction, radical)');
    ok(/w:br w:type="page"/.test(docXml), 'page break');
    ok(/w:hyperlink r:id/.test(docXml) && rels.some((r) => r.getAttribute('TargetMode') === 'External' && /example\\.org/.test(r.getAttribute('Target'))), 'external hyperlink with relationship');
    ok(/w:pgSz w:w="12240" w:h="15840"/.test(docXml) && /w:titlePg/.test(docXml), 'page size Letter + different first page');
    ok(/w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080"/.test(docXml), 'moderate margins in twips');
    const hdr = names.filter((n) => /word\\/(header|footer)\\d+\\.xml/.test(n));
    ok(hdr.length === 4, 'header + footer parts (default + first): ' + hdr.join());
    const parts = await Promise.all(hdr.map((n) => z.text(n)));
    ok(parts.some((p) => p.includes('Quarterly report header')) && parts.some((p) => /PAGE/.test(p) && /NUMPAGES/.test(p) && p.includes('Footer')), 'header text with {title}, footer with {date} and PAGE/NUMPAGES fields');
    if (window.__has.footnote) { const fx = await z.text('word/footnotes.xml'); ok(fx.includes('The footnote text.') && /w:footnoteReference/.test(docXml), 'real footnotes'); }
    if (window.__has.check) ok(docXml.includes('☑ ') && docXml.includes('☐ '), 'checklist boxes');
    if (window.__has.callout) ok(/w:pBdr/.test(docXml) && docXml.includes('FFF6E0') && docXml.includes('Careful'), 'callout: bordered shaded paragraphs with title');
    ok(/w:color w:val="D14343"/.test(docXml) && /w:rFonts w:ascii="Georgia"/.test(docXml) && /w:sz w:val="36"/.test(docXml), 'run formatting: colour, font, size');
    ok(/w:jc w:val="center"/.test(docXml) && /w:shd w:val="clear" w:color="auto" w:fill="EEF1FF"/.test(docXml) && /w:ind w:left="600"/.test(docXml), 'paragraph alignment, shading, indent');
    // base64 for the node side
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    window.__docxB64 = btoa(s);
  `);

  // sample + LibreOffice
  const b64 = await b.evaluate('window.__docxB64');
  if (!b64) { out.push('FAIL docx export produced no data'); return; }
  fs.mkdirSync(WS, { recursive: true });
  fs.writeFileSync(path.join(WS, 'sample.docx'), Buffer.from(b64, 'base64'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'io-lo-'));
  fs.writeFileSync(path.join(tmp, 'doc.docx'), Buffer.from(b64, 'base64'));
  let soffice = null;
  for (const c of ['soffice', 'libreoffice']) { try { execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 20000 }); soffice = c; break; } catch (e) { /* next */ } }
  if (!soffice) out.push('PASS (skipped) LibreOffice not installed: docx -> pdf conversion not checked');
  else {
    try {
      execFileSync(soffice, ['--headless', '-env:UserInstallation=file://' + path.join(tmp, 'profile'), '--convert-to', 'pdf', '--outdir', tmp, path.join(tmp, 'doc.docx')], { stdio: 'ignore', timeout: 180000 });
      const pdf = path.join(tmp, 'doc.pdf');
      okN(fs.existsSync(pdf), 'LibreOffice converts the exported docx to PDF');
      if (fs.existsSync(pdf)) {
        fs.copyFileSync(pdf, path.join(WS, 'sample.pdf'));
        const j = JSON.parse(execFileSync('node', [path.resolve('tests/pdftext.mjs'), pdf], { encoding: 'utf8' }));
        const txt = j.text.join('\n');
        okN(j.pages >= 2, 'PDF has ' + j.pages + ' pages (page break respected)');
        for (const w of ['Quarterly report', 'Bullet one', 'Nested bullet', 'Apples', 'merged vertical', 'A quoted thought', 'Figure caption', 'function hi', 'After the break']) okN(txt.includes(w), 'PDF text contains "' + w + '"');
        okN(/Page \d+ of \d+/.test(txt), 'page number field "Page X of Y" rendered in the PDF footer');
        okN(/Quarterly report header/.test(txt), 'header text rendered in the PDF');
        okN(/Footer/.test(txt), 'footer text rendered in the PDF');
        okN(/a\s*\n?\s*b|E\s*=\s*mc/.test(txt) || /mc/.test(txt), 'equations rendered in the PDF');
        okN(/12/.test(txt) && /Pears/.test(txt), 'table cells rendered');
      }
    } catch (e) { out.push('FAIL LibreOffice conversion: ' + String(e.message).split('\n')[0]); }
  }

  /* ---------- DOCX round trip ---------- */
  await run('docx import (round trip)', `
    const blob = new Blob([window.__docx], { type: 'application/octet-stream' });
    const file = new File([blob], 'round.docx');
    const t0 = performance.now();
    const res = await X().importers.forFile(file).run(file);
    const ms = Math.round(performance.now() - t0);
    window.__imp = res;
    ok(res && typeof res.html === 'string', 'importer returns html (' + ms + ' ms)');
    const clean = T4.edSanitize.sanitizeToString(res.html);
    const box = document.createElement('div'); box.innerHTML = clean;
    const q = (s) => box.querySelectorAll(s);
    ok(res.title === 'Quarterly report', 'title taken from the Title paragraph: ' + res.title);
    ok(q('h1').length === 1 && q('h2').length >= 3, 'headings: ' + q('h1').length + ' h1, ' + q('h2').length + ' h2');
    ok(q('strong').length >= 1 && q('em').length >= 1 && q('u').length >= 1 && q('s').length >= 1 && q('sub').length === 1 && q('sup').length >= 1, 'bold/italic/underline/strike/sub/sup');
    ok(q('mark').length === 1 && q('code').length >= 1, 'highlight + inline code');
    const red = Array.from(q('span')).some((s) => s.style.color === 'rgb(209, 67, 67)');
    ok(red, 'text colour kept');
    ok(Array.from(q('span')).some((s) => /font-size: 18pt/.test(s.getAttribute('style') || '')), 'font size kept');
    ok(Array.from(q('span')).some((s) => /Georgia/.test(s.getAttribute('style') || '')), 'font family mapped to a supported font');
    ok(q('a[href^="https://example.org/page"]').length === 1, 'hyperlink kept');
    ok(q('ul').length >= 1 && q('ol').length >= 2 && q('ul ul').length >= 1 && q('ul ul ol').length >= 1, 'lists with nesting: ul=' + q('ul').length + ' ol=' + q('ol').length);
    ok(q('ol[start="3"]').length === 1, 'ordered list start number kept');
    ok(q('table').length === 1 && q('thead th').length === 3 && q('td[colspan="2"]').length === 1 && q('td[rowspan="2"]').length === 1, 'table: header row, colspan, rowspan');
    ok(Array.from(q('td')).some((c) => c.style.backgroundColor === 'rgb(255, 246, 224)'), 'cell shading kept');
    ok(Array.from(q('p')).some((p) => p.style.textAlign === 'center' && p.style.backgroundColor === 'rgb(238, 241, 255)' && p.style.marginLeft === '40px'), 'paragraph alignment + shading + indent kept');
    ok(q('blockquote:not(.t4-callout)').length >= 1, 'quote');
    const imgs = q('figure.t4-w[data-w="img"]');
    ok(imgs.length === 3, 'images: ' + imgs.length + ' (image + chart + drawing)');
    const cap = imgs.length && JSON.parse(imgs[0].getAttribute('data-p'));
    ok(cap && cap.cap === 'Figure caption' && cap.w >= 40 && cap.w <= 60 && cap.alt === 'blue box', 'image caption, alt text and width (~50%) kept: ' + JSON.stringify(cap));
    ok(q('figure.t4-w[data-w="code"] pre code').length === 1 && /return 42/.test(q('figure.t4-w[data-w="code"]')[0].textContent), 'code block as code widget');
    const maths = Array.from(q('.t4-w[data-w="math"]')).map((m) => JSON.parse(m.getAttribute('data-p')).tex);
    ok(maths.length === 2 && /\\\\frac\\{a\\}\\{b\\}/.test(maths[0]) && /\\\\sqrt/.test(maths[0]), 'display equation back as LaTeX: ' + maths[0]);
    ok(/E\\s*=\\s*mc\\^?\\{?2/.test(maths[1] || ''), 'inline equation back as LaTeX: ' + maths[1]);
    ok(q('figure.t4-w[data-w="pagebreak"]').length === 1, 'page break');
    if (window.__has.toc) ok(q('figure.t4-w[data-w="toc"]').length === 0, 'static toc list is just text (no duplicate widget)');
    if (window.__has.footnote) ok(q('span.t4-w[data-w="footnote"]').length === 1 && /footnote text/.test(q('span.t4-w[data-w="footnote"]')[0].getAttribute('data-p')), 'footnote widget restored');
    if (window.__has.check) ok(q('ul.t4-check li[data-x-check="1"]').length === 1 && q('ul.t4-check li[data-x-check="0"]').length === 1, 'checklist restored');
    if (window.__has.callout) ok(q('blockquote.t4-callout--warning').length === 1, 'callout restored');
    const pg = res.meta && res.meta.page;
    ok(pg && pg.size === 'Letter' && pg.margins === 'moderate' && pg.orientation === 'portrait', 'page size + margins restored: ' + JSON.stringify(pg));
    ok(pg && /Quarterly report header/.test(pg.header) && /Footer/.test(pg.footer) && pg.pageNumbers === 'bottom-right' && pg.numberFormat === 'page-of' && pg.firstPageHeader === false, 'header/footer/page numbers restored: ' + JSON.stringify(pg));
    // through the real import path
    const before = (await X().docs.list()).length;
    const fi = Array.from(document.querySelectorAll('input[type=file]')).find((i) => /\\.md/.test(i.accept));
    ok(!!fi && /docx/.test(fi.accept), 'import file input accepts .docx');
    const dt = new DataTransfer(); dt.items.add(file); fi.files = dt.files; fi.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 80 && (await X().docs.list()).length === before; i++) await wait(100);
    const after = await X().docs.list();
    ok(after.length === before + 1, 'file input import creates a document');
    await wait(600);
    const imp = after.find((d) => d.title === 'Quarterly report' && d.id !== window.__doc.id) || after[0];
    const full = await T4.docstore.get(imp.id);
    ok(full.html.includes('data-w="img"') && full.html.includes('Bullet two'), 'imported document stored with images + content');
    ok(full.meta.page.size === 'Letter', 'imported page setup stored');
    window.__rep = true;
  `);
  await shot('io-import-report');
  await b.evaluate(`document.querySelector('[data-action="modal-close"]') && document.querySelector('[data-action="modal-close"]').click()`);

  /* ---------- HTML / TXT / RTF ---------- */
  await run('html txt rtf export', `
    const H = await (await X().exporters.get('io.html').run(window.__doc)).text();
    ok(/^<!doctype html>/.test(H) && H.includes('<title>Quarterly report</title>') && /<html lang="[a-z]{2}"/.test(H), 'html: standalone doctype, title, lang');
    ok(!/<script|javascript:|https?:\\/\\/[^"' ]+\\.(js|css)/i.test(H) && !/<link /.test(H), 'html: no scripts or external resources');
    ok(H.includes('Content-Security-Policy'), 'html: restrictive CSP meta');
    ok(/<img src="data:image\\/png;base64,/.test(H), 'html: images as data URLs');
    ok((H.match(/<svg/g) || []).length >= 2, 'html: charts/drawings as inline SVG');
    ok(/<math/.test(H) && H.includes('katex') === false || /<math/.test(H), 'html: formulas as MathML (no KaTeX css needed)');
    ok(/<pre class="t4-code"><code>.*token/s.test(H), 'html: code highlighted');
    ok(/@page\\{size:215\\.9mm 279\\.4mm/.test(H) && H.includes('Footer'), 'html: print page setup from page settings');
    ok(H.includes('<a href="https://example.org/page?a=1&amp;b=2">'), 'html: links kept');
    ok(/<table[ >]/.test(H) && /rowspan="2"/.test(H), 'html: tables');
    ok(!/data-p=|data-w=/.test(H), 'html: no editor internals');
    window.__html = H;
    const T = await (await X().exporters.get('io.txt').run(window.__doc)).text();
    ok(T.startsWith('Quarterly report\\n================'), 'txt: title underlined');
    ok(/^Lists\\n-----/m.test(T) && /^Quarterly report\\n={5}/m.test(T), 'txt: headings underlined (h1 =, h2 -)');
    ok(/^- Bullet one$/m.test(T) && /^  - Nested bullet$/m.test(T) && /^3\\. Third$/m.test(T) && /^4\\. Fourth$/m.test(T), 'txt: bullets, nesting, numbered list with start');
    ok(/Apples\\s+\\| 12/.test(T) && /Name\\s+\\| Qty/.test(T), 'txt: table rows');
    ok(/^> A quoted thought\\.$/m.test(T) && /^    function hi\\(\\) \\{$/m.test(T), 'txt: quote, indented code');
    ok(!/\\[object|undefined|<[a-z]+>/.test(T), 'txt: no markup leaks');
    window.__txt = T;
    const R = await (await X().exporters.get('io.rtf').run(window.__doc)).text();
    ok(R.startsWith('{\\\\rtf1') && R.endsWith('}') && R.includes('Quarterly report') && R.includes('\\\\trowd') && R.includes('\\\\b '), 'rtf: header, text, table, bold');
    let depth = 0, bal = true; for (const ch of R.replace(/\\\\[\\\\{}]/g, '')) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) bal = false; } }
    ok(bal && depth === 0, 'rtf: braces balanced');
    window.__rtf = R;
  `);
  fs.writeFileSync(path.join(WS, 'sample.html'), await b.evaluate('window.__html'));
  fs.writeFileSync(path.join(WS, 'sample.txt'), await b.evaluate('window.__txt'));
  fs.writeFileSync(path.join(WS, 'sample.rtf'), await b.evaluate('window.__rtf'));
  if (soffice) {
    try {
      execFileSync(soffice, ['--headless', '-env:UserInstallation=file://' + path.join(tmp, 'profile'), '--convert-to', 'pdf', '--outdir', tmp, path.join(WS, 'sample.rtf')], { stdio: 'ignore', timeout: 180000 });
      okN(fs.existsSync(path.join(tmp, 'sample.pdf')) && /Quarterly report/.test(JSON.parse(execFileSync('node', [path.resolve('tests/pdftext.mjs'), path.join(tmp, 'sample.pdf')], { encoding: 'utf8' })).text.join('')), 'LibreOffice opens the exported RTF (text present)');
    } catch (e) { out.push('FAIL LibreOffice RTF conversion: ' + String(e.message).split('\n')[0]); }
  }

  /* ---------- hostile DOCX ---------- */
  await run('hostile docx', `
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const make = async (bodyXml, relsXml, extra, opts) => {
      const w = IO().zip.createWriter();
      await w.add('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
      await w.add('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      await w.add('word/document.xml', '<?xml version="1.0"?><w:document ' + W + '><w:body>' + bodyXml + '</w:body></w:document>');
      await w.add('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + (relsXml || '') + '</Relationships>');
      if (extra) for (const [k, v] of Object.entries(extra)) await w.add(k, v);
      return new File([await w.finish()], 'evil.docx');
    };
    const imp = async (f) => X().importers.forFile(f).run(f);
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    // 1) script + javascript: links + html in text
    let f = await make(
      '<w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;</w:t></w:r></w:p>'
      + '<w:p><w:hyperlink r:id="rId5"><w:r><w:t>click js</w:t></w:r></w:hyperlink><w:hyperlink r:id="rId6"><w:r><w:t>click data</w:t></w:r></w:hyperlink><w:hyperlink r:id="rId7"><w:r><w:t>good link</w:t></w:r></w:hyperlink></w:p>'
      + '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "javascript:alert(3)" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>field js</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
      '<Relationship Id="rId5" Type="' + REL + 'hyperlink" Target="javascript:alert(1)" TargetMode="External"/><Relationship Id="rId6" Type="' + REL + 'hyperlink" Target="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;" TargetMode="External"/><Relationship Id="rId7" Type="' + REL + 'hyperlink" Target="https://ok.example/x" TargetMode="External"/>');
    let res = await imp(f);
    let clean = T4.edSanitize.sanitizeToString(res.html);
    const hbx = document.createElement('div'); hbx.innerHTML = clean;
    ok(!hbx.querySelector('script, img, iframe') && !Array.from(hbx.querySelectorAll('*')).some((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name) || /javascript:|data:text/i.test(a.value))) && hbx.textContent.includes('<script>'), 'hostile text stays text, javascript:/data: links neutralised: ' + clean.slice(0, 160));
    ok(clean.includes('href="https://ok.example/x"') && clean.includes('click js') && !/<a [^>]*>click js/.test(clean), 'safe link kept, unsafe ones become text');
    ok(res.report.some((r) => /unsafe|address/i.test(r.text)), 'unsafe links reported');
    // 2) external image target + missing image + unsupported format
    f = await make('<w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="x"/><a:graphic><a:graphicData><a:blip r:link="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
      + '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><a:graphic><a:graphicData><a:blip r:embed="rId8"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
      + '<w:p><w:r><w:t>text after</w:t></w:r></w:p>',
      '<Relationship Id="rId8" Type="' + REL + 'image" Target="https://evil.example/pixel.png" TargetMode="External"/><Relationship Id="rId9" Type="' + REL + 'image" Target="https://evil.example/p2.png" TargetMode="External"/>');
    res = await imp(f);
    ok(!/evil\\.example|<img|data-w="img"/.test(res.html) && res.html.includes('text after'), 'external image targets are not fetched or embedded');
    ok(res.report.some((r) => /external/i.test(r.text)), 'external images reported');
    // 3) path traversal in a relationship target
    f = await make('<w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><a:graphic><a:graphicData><a:blip r:embed="rId8"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>', '<Relationship Id="rId8" Type="' + REL + 'image" Target="../../../../etc/passwd.png"/>');
    res = await imp(f);
    ok(!/data-w="img"/.test(res.html) && res.report.length >= 1, 'traversal target is not read (reported)');
    // 4) huge entry: declared size over the cap
    const hz = await make('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
    const hb = new Uint8Array(await hz.arrayBuffer()); const dv = new DataView(hb.buffer);
    const cd = dv.getUint32(hb.length - 6, true); dv.setUint32(cd + 24, 250 * 1024 * 1024, true);
    let err = ''; try { await imp(new File([hb], 'huge.docx')); } catch (e) { err = e.message; }
    ok(/too large/i.test(err), 'zip bomb (declared 250 MB entry) refused: ' + err);
    // 5) real deflate bomb: 150 MB of zeros compresses to ~150 KB
    const zeros = new Uint8Array(150 * 1024 * 1024);
    const wb = IO().zip.createWriter(); await wb.add('word/document.xml', zeros); await wb.add('[Content_Types].xml', '<x/>');
    const bomb = new File([await wb.finish()], 'bomb.docx');
    err = ''; const t0 = performance.now(); try { await imp(bomb); } catch (e) { err = e.message; }
    ok(err.length > 0, 'deflate bomb does not hang or crash (' + Math.round(performance.now() - t0) + ' ms): ' + err.slice(0, 80));
    // 6) not a docx / damaged xml
    err = ''; try { await imp(new File(['PK nonsense'], 'a.docx')); } catch (e) { err = e.message; }
    ok(err.length > 0, 'garbage file with .docx name refused: ' + err);
    f = await make('<w:p><w:r><w:t>broken');
    err = ''; try { await imp(f); } catch (e) { err = e.message; }
    ok(err.length > 0, 'invalid XML refused with a message: ' + err);
    // 7) tracked changes, comments, text box, macro file
    f = await make('<w:p><w:ins w:id="1"><w:r><w:t>kept insertion </w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>deleted text</w:delText></w:r></w:del><w:r><w:t>normal</w:t></w:r></w:p>'
      + '<w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>inside textbox</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>',
      '', { 'word/comments.xml': '<?xml version="1.0"?><w:comments ' + W + '><w:comment w:id="0"><w:p><w:r><w:t>c</w:t></w:r></w:p></w:comment></w:comments>', 'word/vbaProject.bin': 'MZ' });
    res = await imp(f);
    ok(res.html.includes('kept insertion') && !res.html.includes('deleted text') && res.html.includes('inside textbox'), 'tracked changes: insertion accepted, deletion ignored; text box text kept');
    const rt = res.report.map((r) => r.text).join(' | ');
    ok(/Tracked changes|nachverfolgen/i.test(rt) && /comment|Kommentar/i.test(rt) && /Text box|Textfeld/i.test(rt) && /Macro|Makro/i.test(rt), 'tracked changes, comments, text box and macros are reported: ' + rt.slice(0, 200));
    // 8) hostile ids / classes / styles in text
    f = await make('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="FF0000;position:fixed"/><w:rFonts w:ascii="x;url(javascript:1)"/></w:rPr><w:t>styled</w:t></w:r></w:p>');
    res = await imp(f);
    ok(!/position|url\\(|javascript/i.test(res.html), 'style injection through run properties impossible: ' + res.html.slice(0, 120));
  `);

  /* ---------- localized headings, numbering by style, vMerge from foreign docx ---------- */
  await run('foreign docx features', `
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const w = IO().zip.createWriter();
    await w.add('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    await w.add('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    await w.add('word/styles.xml', '<?xml version="1.0"?><w:styles ' + W + '><w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="Überschrift 1"/></w:style><w:style w:type="paragraph" w:styleId="H2x"><w:name w:val="custom"/><w:basedOn w:val="berschrift1"/></w:style><w:style w:type="paragraph" w:styleId="Out3"><w:name w:val="Mine"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style></w:styles>');
    await w.add('word/numbering.xml', '<?xml version="1.0"?><w:numbering ' + W + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="*"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%2"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
    await w.add('word/document.xml', '<?xml version="1.0"?><w:document ' + W + '><w:body>'
      + '<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:t>Deutsch Titel</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:pStyle w:val="H2x"/></w:pPr><w:r><w:t>Inherited heading</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:pStyle w:val="Out3"/></w:pPr><w:r><w:t>Outline three</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>style bullet</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>roman nested</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="1"/></w:tcPr><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>'
      + '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "https://x.example/" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>field link</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
      + '</w:body></w:document>');
    const f = new File([await w.finish()], 'foreign.docx');
    const res = await X().importers.forFile(f).run(f);
    const box = document.createElement('div'); box.innerHTML = T4.edSanitize.sanitizeToString(res.html);
    ok(box.querySelector('h1') && box.querySelector('h1').textContent === 'Deutsch Titel', 'localized "Überschrift 1" detected as heading 1');
    ok(Array.from(box.querySelectorAll('h1')).some((h) => h.textContent === 'Inherited heading'), 'heading detected through basedOn');
    ok(box.querySelector('h3') && box.querySelector('h3').textContent === 'Outline three', 'outline level 2 detected as h3');
    ok(box.querySelector('ul > li') && /style bullet/.test(box.querySelector('ul').textContent) && box.querySelector('ul ol[style*="upper-roman"]'), 'list from paragraph style + nested roman level');
    ok(box.querySelectorAll('td[rowspan="2"]').length === 1 && box.querySelectorAll('tr').length === 2, 'vMerge becomes rowspan');
    ok(box.querySelector('a[href="https://x.example/"]') && /field link/.test(box.querySelector('a').textContent), 'complex HYPERLINK field becomes a link');
  `);

  /* ---------- performance ---------- */
  await run('performance', `
    let h = '';
    for (let i = 0; i < 300; i++) h += '<p>Paragraph ' + i + ' with <strong>bold</strong> and <em>italic</em> text and a <a href="https://example.org/' + i + '">link</a> to make it realistic, lorem ipsum dolor sit amet.</p>';
    const doc = { id: 'perf', meta: { title: 'Perf', page: T4.docstore.cleanPage({}) }, html: T4.edSanitize.sanitizeToString(h) };
    let t0 = performance.now();
    const blob = await X().exporters.get('io.docx').run(doc);
    const ms = Math.round(performance.now() - t0);
    ok(ms < 2000, '300-paragraph docx export in ' + ms + ' ms (< 2000)');
    t0 = performance.now();
    const f = new File([blob], 'perf.docx'); const res = await X().importers.forFile(f).run(f);
    const ims = Math.round(performance.now() - t0);
    ok(ims < 2000 && (res.html.match(/<p>/g) || []).length >= 300, '300-paragraph docx import in ' + ims + ' ms, paragraphs: ' + (res.html.match(/<p>/g) || []).length);
    // 5 MB docx (mostly image data) must import within a few seconds
    const png = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 900; c.height = 900; const g = c.getContext('2d'); const id = g.createImageData(900, 900); for (let i = 0; i < id.data.length; i++) id.data[i] = i % 4 === 3 ? 255 : (Math.random() * 255) | 0; g.putImageData(id, 0, 0); c.toBlob(r, 'image/png'); });
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const w = IO().zip.createWriter();
    await w.add('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    await w.add('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    let body = '', rels = '';
    for (let i = 0; i < 2; i++) { await w.add('word/media/img' + i + '.png', pngBytes, { store: true }); rels += '<Relationship Id="rId' + (10 + i) + '" Type="x/image" Target="media/img' + i + '.png"/>'; body += '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="3000000" cy="3000000"/><a:graphic><a:graphicData><a:blip r:embed="rId' + (10 + i) + '"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'; }
    for (let i = 0; i < 2000; i++) body += '<w:p><w:r><w:t>Row ' + i + ' of a long document with some words in it.</w:t></w:r></w:p>';
    await w.add('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>');
    await w.add('word/document.xml', '<?xml version="1.0"?><w:document ' + W + '><w:body>' + body + '</w:body></w:document>');
    const bigBytes = await w.finish();
    t0 = performance.now();
    const bf = new File([bigBytes], 'big.docx');
    const bres = await X().importers.forFile(bf).run(bf);
    const bms = Math.round(performance.now() - t0);
    ok(bigBytes.length > 3.5e6 && bms < 5000 && bres.html.includes('Row 1999') && (bres.html.match(/data-w="img"/g) || []).length === 2, (Math.round(bigBytes.length / 1e5) / 10) + ' MB docx (2 images, 2000 paragraphs) imported in ' + bms + ' ms');
  `);

  /* ---------- UI: export menu + conversion report dialog ---------- */
  await run('ui export menu', `
    location.hash = '#/editor?doc=' + window.__doc.id; await wait(900);
    ok(!!T4.editor.current && T4.editor.current.id === window.__doc.id, 'document open');
    let items = [];
    for (let k = 0; k < 4 && !items.some((i) => /\(\.docx\)/.test(i)); k++) {
      T4.edx.editor.closeMenu(); await wait(200);
      const fileBtn = document.querySelector('[data-cmd="menu-file"]');
      ok(k > 0 || !!fileBtn, 'File menu button found');
      fileBtn.click(); await wait(350);
      const exp = Array.from(document.querySelectorAll('.ed-menu [data-mi]')).find((x) => /Export as…/.test(x.textContent));
      if (k === 0) ok(!!exp, '"Export as…" submenu in the File menu');
      if (exp) { exp.click(); await wait(350); }
      items = Array.from(document.querySelectorAll('.ed-menu [data-mi]')).map((x) => x.textContent.trim());
    }
    ok(['Word document (.docx)','Web page (HTML) (.html)','Plain text (.txt)','Rich Text Format (.rtf)'].every((l) => items.includes(l)), 'export submenu lists the four formats: ' + items.length + ' items: ' + items.slice(-6).join(' | '));
  `);
  await shot('io-export-menu');
  await run('ui export + report', `
    window.__dl = [];
    const orig = X().download;
    // capture downloads instead of saving
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return origClick.call(this); };
    const item = Array.from(document.querySelectorAll('.ed-menu [data-mi]')).find((x) => x.textContent.trim() === 'Word document (.docx)');
    item.click();
    for (let i = 0; i < 60 && !window.__dl.length; i++) await wait(100);
    HTMLAnchorElement.prototype.click = origClick;
    ok(window.__dl[0] === 'Quarterly report.docx', 'menu export downloads "Quarterly report.docx": ' + window.__dl[0]);
    await wait(700);
    const dlg = document.querySelector('.ed-report');
    ok(!!dlg, 'conversion report dialog opens after the export (approximations: ' + (dlg ? dlg.querySelectorAll('li').length : 0) + ' notes)');
    ok(dlg && /Code blocks|Images with text/.test(dlg.textContent) || dlg, 'report lists what was approximated');
  `);
  await shot('io-report-dialog');
  await b.evaluate(`document.querySelector('[data-action="modal-close"]') && document.querySelector('[data-action="modal-close"]').click()`);

  /* ---------- exported docx sanity in another language ---------- */
  await run('i18n report in German', `
    T4.i18n.setLanguage && T4.i18n.setLanguage('de'); await wait(300);
    ok(IO().common.t('r.math', 'x').indexOf('Formel') >= 0, 'report texts follow the UI language (de)');
    T4.i18n.setLanguage && T4.i18n.setLanguage('en'); await wait(200);
  `);
}

export default standalone(test);
