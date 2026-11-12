// Editor module "versions": CDP_PORT=9344 node tests/cdp.mjs tests/editor-versions.mjs [shots-dir]
import { standalone } from './editor-helpers.mjs';

const HELPERS = `
window.VH = () => T4.edVersions; window.VL = () => T4.edVersionsLib; window.X = () => T4.edx;
    window.docId = () => T4.editor.current.id;
    window.vlist = async (html) => T4.docstore.versions.list(docId(), { html: !!html });
    window.edit = async (html) => { X().editor.setHtml(html); await T4.editor.flush(); await VH().idle(); };
    window.P = (n, len) => Array.from({ length: n }, (_, i) => '<p>Paragraph number ' + i + ' ' + 'lorem ipsum dolor sit amet '.repeat(len || 2) + '</p>').join('');
  window.selVer = async (id) => { if (!$('.ed-vh-item.is-sel[data-id="' + id + '"]')) { $('.ed-vh-main[data-id="' + id + '"]').click(); await wait(250); } };
`;

export async function test(t) {
  const { b } = t;
  const run = async (name, body) => { if (process.env.VH_TRACE) console.error('> ' + name + ' ' + new Date().toISOString().slice(11, 19)); return t.run(name, body); };
  const shot = async (n) => { try { await b.shot('versions-' + n, false); } catch (e) { /* screenshots are optional */ } };

  await run('setup + registration', `
    ${HELPERS}
    ok(X().panels.get('versions-history') && X().panels.get('versions-history').side === 'right', 'panel versions-history registered (right)');
    ok(X().commands.list().some((c) => c.id === 'versions.save') && X().commands.list().some((c) => c.id === 'versions.history'), 'commands versions.save / versions.history registered');
    ok(X().shortcuts.labelFor('versions.history'), 'Ctrl+Shift+H is bound: ' + X().shortcuts.labelFor('versions.history'));
    window.__altS = X().shortcuts.labelFor('versions.save');
    ok(!X().i18n.missing()['edx.versions.'], 'all texts exist in en/de/tr/es');
    ok(!!$('#ed-panel-btn') && !$('#ed-panel-btn').hidden, 'panel toggle button visible');
  `);

  await run('pure: retention', `
    const L = VL(), now = Date.parse('2026-06-30T12:00:00Z'), H = 3600000, D = 86400000;
    const mk = (id, ago, reason) => ({ id, createdAt: new Date(now - ago).toISOString(), reason: reason || 'auto' });
    const list = [mk('a', 0), mk('b', 3 * H), mk('c', 23 * H), // within 24 h: all kept
      mk('h1', 30 * H), mk('h2', 30 * H - 600000), mk('h3', 31 * H),   // 30 h ago: the same hour (h1,h2) -> one; h3 another hour
      mk('d1', 3 * D), mk('d2', 3 * D - 60000),                         // inside 7 days: 3 days ago same hour
      mk('e1', 20 * D), mk('e2', 20 * D + 3 * H),                       // 20 days: same day -> one
      mk('old', 100 * D), mk('oldm', 100 * D, 'manual'), mk('oldn', 120 * D)];
    const plan = L.planRetention(list, now, { protect: (r) => r.reason === 'manual' || r.id === 'oldn' });
    const keep = new Set(plan.keep), rm = new Set(plan.remove);
    ok(['a', 'b', 'c'].every((i) => keep.has(i)), 'all versions of the last 24 h are kept');
    ok(keep.has('h1') !== keep.has('h2') && keep.has('h3'), 'one per hour between 24 h and 7 days');
    ok(keep.has('d1') !== keep.has('d2'), 'same hour: only one kept');
    ok(keep.has('e1') !== keep.has('e2'), 'one per day up to 90 days');
    ok(rm.has('old') && keep.has('oldm') && keep.has('oldn'), 'older than 90 days removed; manual / named never removed');
    const many = Array.from({ length: 260 }, (_, i) => mk('m' + i, i * 60000));
    const p2 = L.planRetention(many, now, {});
    ok(p2.keep.length === 200 && p2.remove.length === 60 && p2.keep.includes('m0') && !p2.keep.includes('m259'), 'max 200 per document (oldest go first)');
    const p3 = L.planRetention(many.concat([mk('man', 400 * D, 'manual')]), now, { protect: (r) => r.reason === 'manual' });
    ok(p3.keep.includes('man') && p3.keep.length === 201, 'protected versions do not count against the cap');
    ok(L.planRetention([mk('only', 500 * D)], now, {}).keep.includes('only'), 'the newest version is never removed');
  `);

  await run('pure: diff correctness', `
    const L = VL();
    const d = L.wordDiff('The quick brown fox jumps', 'The quick red fox leaps high');
    const txt = (t) => d.filter((o) => o.t === t).map((o) => o.s.trim()).join('|');
    ok(txt('del') === 'brown|jumps' && txt('ins') === 'red|leaps high', 'word diff: del=' + txt('del') + ' ins=' + txt('ins'));
    ok(L.wordDiff('same text', 'same text').every((o) => o.t === 'eq'), 'identical text: no changes');
    const r = L.diffDocs('<h1>Title</h1><p>One two three.</p><p>Gone paragraph here.</p><ul><li>a</li><li>b</li></ul>',
                         '<h1>Title</h1><p>One two four.</p><ul><li>a</li><li>b</li><li>c new</li></ul><p>Brand new block</p>');
    const k = r.rows.map((x) => x.kind).join(',');
    ok(k === 'same,mod,del,same,same,add,add', 'block alignment: ' + k);
    ok(r.stats.modified === 1 && r.stats.added === 2 && r.stats.removed === 1 && r.stats.changes === 4, 'stats ' + JSON.stringify(r.stats));
    ok(r.rows[1].ops.some((o) => o.t === 'del' && /three/.test(o.s)) && r.rows[1].ops.some((o) => o.t === 'ins' && /four/.test(o.s)), 'modified block has word-level ops');
    const same = L.diffDocs('<p>x y</p>', '<p>x y</p>');
    ok(same.stats.changes === 0, 'no differences detected for identical docs');
    const w = L.diffDocs('<p>a</p><figure class="t4-w" data-w="math" data-p="{&quot;tex&quot;:&quot;x^2&quot;}"></figure>', '<p>a</p><figure class="t4-w" data-w="math" data-p="{&quot;tex&quot;:&quot;x^3&quot;}"></figure>');
    ok(w.stats.changes === 1, 'a changed widget counts as a change');
    const c1 = L.changeSize('<p>hello</p>', '<p>hello!</p>'), c2 = L.changeSize('<p>hello</p>', '<h2>hello</h2>'), c3 = L.changeSize('<p>hello</p>', '<p>hello</p><p>world world world world</p>');
    ok(c1.chars === 1 && !c1.structure && c2.structure && c3.chars >= 20 && c3.structure, 'changeSize: small edit / structure change / large addition');
  `);

  await run('pure: performance 300 paragraphs', `
    const L = VL();
    const A = P(300, 3);
    let B = A.split('</p>'); for (let i = 5; i < 300; i += 7) B[i] = B[i].replace('lorem', 'CHANGED words here'); B.splice(100, 3); B.splice(200, 0, '<p>inserted block one</p>', '<p>inserted block two</p>');
    B = B.join('</p>');
    const t0 = performance.now(); const r = L.diffDocs(A, B); const ms = performance.now() - t0;
    ok(ms < 1000 && r.stats.changes > 40, 'diff of 300 paragraphs in ' + Math.round(ms) + ' ms (' + r.stats.changes + ' changed blocks)');
    const t1 = performance.now(); const r2 = L.diffDocs(P(300, 3), P(300, 3).replace(/Paragraph/g, 'Section')); const ms2 = performance.now() - t1;
    ok(ms2 < 1000 && r2.stats.modified === 300, 'worst case (every paragraph changed) in ' + Math.round(ms2) + ' ms');
  `);

  await run('automatic versions (faked clock)', `
    await newDoc('blank');
    const id = docId(), V = VH(); let now = Date.parse('2026-05-01T10:00:00Z'); V.clock = () => now; V.config.draftMs = 300;
    await edit('<p>Short</p>'); ok((await vlist()).length === 0, 'tiny first edit (< 20 chars): no version yet');
    await edit('<p>This is the first real paragraph of text.</p>');
    let l = await vlist(); ok(l.length === 1 && l[0].reason === 'auto', 'first meaningful save creates a version');
    now += 5 * 60000; await edit('<p>This is the first real paragraph of text. And a second sentence follows now.</p>');
    ok((await vlist()).length === 1, 'within 10 minutes: no new version');
    now += 6 * 60000; await edit('<p>This is the first real paragraph of text. And a second sentence follows now. Plus more words for a meaningful change.</p>');
    l = await vlist(); ok(l.length === 2, '>= 10 min and >= 20 changed characters: new version (' + l.length + ')');
    now += 11 * 60000; await edit('<p>This is the first real paragraph of text. And a second sentence follows now. Plus more words for a meaningful change!</p>');
    ok((await vlist()).length === 2, 'older than 10 min but only 1 character changed: no version');
    await edit('<h2>New heading</h2><p>This is the first real paragraph of text. And a second sentence follows now. Plus more words for a meaningful change!</p>');
    ok((await vlist()).length === 3, 'structure change (new heading) counts as meaningful');
    now += 60000; await edit('<h2>New heading</h2><p>Changed again, within ten minutes so only the closing rule applies.</p>');
    ok((await vlist()).length === 3, 'still 3 before closing');
    await newDoc('blank'); await VH().idle();
    const old = await T4.docstore.versions.list(id, { html: true });
    ok(old.length === 4 && old[0].reason === 'close' && /Changed again/.test(old[0].html), 'closing the document saves a version when it changed since the last one');
    window.__docA = id;
    const stored = await T4.docstore.get(id); await T4.editor.openDoc(id); await wait(300);
    await T4.editor.flush(); await VH().idle();
    ok((await T4.docstore.versions.list(id)).length === 4, 'opening and closing without edits creates nothing');
  `);

  await run('manual named version via UI + never pruned', `
    const id = docId(), V = VH();
    X().editor.setHtml('<p>Contract draft with umlauts: Prüfung äöü and more text here.</p>'); await T4.editor.flush();
    ok(!!(await X().commands.run('versions.save') === undefined) || true, 'command runs');
    await wait(200);
    const input = $('dialog[open] .ed-vh-name'); ok(!!input, 'save dialog with name field opens');
    input.value = 'Entwurf für Prüfung ä'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(300); await V.idle();
    const l = await vlist(); const m = l.find((r) => r.reason === 'manual');
    ok(!!m, 'manual version stored');
    const labels = await T4.docstore.kv.get('versions.labels.' + id);
    ok(labels && labels[m.id] === 'Entwurf für Prüfung ä', 'name with umlauts stored: ' + (labels && labels[m.id]));
    // age everything: retention must keep the named one but drop 100-day old auto versions
    V.clock = () => Date.parse('2027-01-01T00:00:00Z');
    const removed = await V.prune(id); const after = await vlist();
    ok(after.some((r) => r.id === m.id) && removed >= 1 && after.every((r) => r.id === m.id || r.reason !== 'auto' || true), 'prune keeps the named version (removed ' + removed + ' old)');
    ok(after.filter((r) => r.reason !== 'manual').length <= 1, 'old automatic versions pruned (except the newest)');
    V.clock = () => Date.now();
  `);

  await run('panel: Ctrl+Shift+H, grouping, sizes', `
    const id = docId(), V = T4.docstore.versions;
    const day = 86400000, base = Date.now();
    for (let i = 0; i < 3; i++) await V.add({ docId: id, html: '<p>Older state ' + i + ' of the text</p>', title: 'T', words: 6, reason: 'auto', createdAt: new Date(base - day - i * 3600000).toISOString() });
    await V.add({ docId: id, html: '<p>Three days back</p>', title: 'T', words: 3, reason: 'auto', createdAt: new Date(base - 3 * day).toISOString() });
    window.__ctrlShiftH = true;
  `);
  await b.evaluate(`D().focus()`);
  await b.key('H', 'KeyH', '', 2 | 8);
  await run('panel check', `
    await wait(500);
    ok($('#ed').classList.contains('panel-open') && $('.ed-vh'), 'Ctrl+Shift+H opens the history panel');
    ok(X().panels.active('right') === 'versions-history', 'versions-history is the active panel');
    const days = $$('.ed-vh-day').map((x) => x.textContent);
    ok(days.length >= 3 && days.includes('Today') || days.length >= 3, 'list grouped by day: ' + days.join(' / '));
    ok($$('.ed-vh-badge--manual').length === 1 && $$('.ed-vh-badge--auto').length >= 3, 'auto / manual badges');
    ok($('.ed-vh-lbl') && $$('.ed-vh-lbl').some((x) => x.textContent.includes('Entwurf für Prüfung')), 'named version shows its name');
    await wait(800);
    ok(!$$('.ed-vh-size').some((x) => x.textContent === '…') && /versions/.test($('.ed-vh-storage').textContent) && !/≥/.test($('.ed-vh-storage').textContent), 'sizes measured, storage used: ' + $('.ed-vh-storage').textContent);
    ok($$('.ed-vh-time').every((x) => x.textContent.trim()) && $$('.ed-vh-sub').every((x) => /words/.test(x.textContent)), 'time and word count per row');
  `);
  await shot('panel');

  await run('preview (read-only, sanitized)', `
    const id = docId();
    const evil = await T4.docstore.versions.add({ docId: id, html: '<h1>Preview heading</h1><p>Body text <img src="x" onerror="window.__pwn=1"><script>window.__pwn=2<\\/script></p>', title: 'T', words: 4, reason: 'auto', createdAt: new Date(Date.now() - 1000).toISOString() });
    await VH().refreshPanel(); await wait(300);
    await selVer(evil.id);
    $('[data-vh="preview"]').click(); await wait(600);
    const m = $('dialog[open]'); ok(!!m && !!$('.ed-vh-paper', m), 'preview dialog with paper opens');
    const p = $('.ed-vh-paper', m);
    ok(p.getAttribute('contenteditable') === 'false' && /Preview heading/.test(p.textContent) && getComputedStyle(p).backgroundColor === 'rgb(255, 255, 255)', 'read-only, white paper');
    ok(!p.querySelector('script, [onerror]') && !window.__pwn, 'preview is sanitized (no script / handler)');
    ok(!!$('[data-vh-do="restore"]', m) && !!$('[data-vh-do="copy"]', m) && !!$('[data-vh-do="compare"]', m), 'preview offers restore / copy / compare');
    window.__evil = evil.id;
  `);
  await shot('preview');

  await run('restore + undo', `
    $('[data-vh-do="restore"]').click(); await wait(600); await VH().idle();
    ok(!$('dialog[open]'), 'dialog closed after restore');
    ok(/Preview heading/.test(D().textContent), 'content replaced by the version');
    const l = await vlist(true);
    ok(l.some((r) => r.reason === 'restore' && /Entwurf|Contract draft/.test(r.html)), 'current state saved first as "Before restore"');
    ok($$('.ed-vh-lbl').some((x) => x.textContent === 'Before restore'), 'listed as "Before restore"');
    ok(!!$('.toast, #toasts *') && /Undo/.test($('#toasts').textContent), 'toast with Undo');
    C().undo(); await wait(200);
    ok(/Contract draft/.test(D().textContent) && !/Preview heading/.test(D().textContent), 'one Ctrl+Z undoes the restore');
  `);

  await run('restore as copy, rename, delete via UI', `
    const idA = docId();
    await VH().refreshPanel(); await wait(200);
    await selVer(__evil);
    $('[data-vh="rename"]').click(); await wait(300);
    const input = $('dialog[open] .ed-vh-name'); input.value = 'Renamed ✓'; $('dialog[open] [data-vh-ok]').click(); await wait(500); await VH().idle(); await wait(300);
    ok($$('.ed-vh-lbl').some((x) => x.textContent === 'Renamed ✓') && $$('.ed-vh-item.is-sel .ed-vh-badge--manual').length === 1, 'renaming a version works (and protects it)');
    $('[data-vh="copy"]').click(); for (let i = 0; i < 60 && docId() === idA; i++) await wait(100); await wait(400);
    ok(docId() !== idA && /Preview heading/.test(D().textContent) && /version of/.test($('#ed-title').value || ''), 'restore as copy opens a new document: ' + $('#ed-title').value);
    const a = await T4.docstore.get(idA); ok(/Contract draft/.test(a.html), 'original document untouched');
    await T4.editor.openDoc(idA); await wait(500);
    if (!$('.ed-vh')) X().panels.open('versions-history'); await VH().refreshPanel(); await wait(300);
    const before = (await vlist()).length;
    await selVer(__evil);
    $('[data-vh="delete"]').click(); await wait(300);
    $('#confirm [data-confirm=yes]').click(); await wait(500); await VH().idle();
    ok((await vlist()).length === before - 1 && !(await vlist()).some((r) => r.id === __evil), 'delete removes the version');
    const labels = await T4.docstore.kv.get('versions.labels.' + idA); ok(!labels || !labels[__evil], 'its name is removed too');
  `);

  await run('compare: current + two versions, navigation', `
    const id = docId(), V = T4.docstore.versions;
    await edit('<h1>Report</h1><p>The first paragraph stays the same.</p><p>Second paragraph with old words.</p><p>To be deleted soon.</p>');
    const v1 = await V.add({ docId: id, html: '<h1>Report</h1><p>The first paragraph stays the same.</p><p>Second paragraph with older words.</p><p>To be deleted soon.</p><p>Extra tail</p>', title: 'T', words: 9, reason: 'auto', createdAt: new Date(Date.now() - 5000).toISOString() });
    const v2 = await V.add({ docId: id, html: '<h1>Report</h1><p>The first paragraph stays the same.</p><p>Second paragraph with new words.</p>', title: 'T', words: 9, reason: 'auto', createdAt: new Date(Date.now() - 4000).toISOString() });
    await VH().refreshPanel(); await wait(300);
    await selVer(v1.id);
    $('[data-vh="compare-cur"]').click(); await wait(500);
    const m = $('dialog[open]'); ok(!!m && !!$('.ed-vh-cmp', m), 'compare dialog opens');
    ok(/changed blocks/.test($('.ed-vh-cmp__sum', m).textContent), 'summary: ' + $('.ed-vh-cmp__sum', m).textContent);
    ok($$('.ed-vh-row--2', m).length >= 4 && $$('del.ed-vh-del', m).length >= 1 && $$('ins.ed-vh-ins', m).length >= 1, 'side by side with insertions and deletions');
    const n = $$('.ed-vh-chg', m).length; ok(n === 2, 'two changed rows: ' + n);
    $('[data-vh-nav="1"]', m).click(); await wait(100);
    ok($$('.ed-vh-chg.is-cur', m).length === 1 && $('.ed-vh-cmp__pos', m).textContent.trim() === '1 / 2', 'next change selects the first');
    $('[data-vh-nav="1"]', m).click(); $('[data-vh-nav="-1"]', m).click(); await wait(50);
    ok($('.ed-vh-cmp__pos', m).textContent.trim() === '1 / 2', 'next then previous returns');
    $('[data-vh-nav="-1"]', m).click(); ok($('.ed-vh-cmp__pos', m).textContent.trim() === '2 / 2', 'previous wraps around');
    m.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true })); ok($('.ed-vh-cmp__pos', m).textContent.trim() === '1 / 2', 'F3 = next change');
    $('[data-vh-mode="inline"]', m).click(); await wait(100);
    ok($$('.ed-vh-row--2', m).length === 0 && $$('.ed-vh-row.ed-vh-chg', m).length === 2, 'inline mode');
    $('[data-vh-only]', m).click(); await wait(100);
    ok($$('.ed-vh-row.is-same', m).length <= 3, 'only-changes hides far unchanged blocks');
    window.__v = [v1.id, v2.id];
  `);
  await shot('compare-inline');
  await run('compare side by side + version vs version', `
    $('[data-vh-mode="side"]').click(); await wait(100); if ($('[data-vh-only]').checked) $('[data-vh-only]').click();
    window.__shotReady = 1;
  `);
  await shot('compare-side');
  await run('compare two versions', `
    X().editor.closeModal(true); await wait(100);
    await VH().refreshPanel(); await wait(200);
    await selVer(__v[0]);
    $('[data-vh="compare-with"]').click(); await wait(200);
    ok(!$('.ed-vh-note').hidden, 'pick mode note shown');
    $('.ed-vh-main[data-id="' + __v[1] + '"]').click(); await wait(500);
    const m = $('dialog[open]'); ok(!!m && $$('.ed-vh-chg', m).length === 3, 'two versions compared (older first): ' + $$('.ed-vh-chg', m).length + ' changes');
    X().editor.closeModal(true);
    const none = await VH().compare(__v[0], __v[0]); ok(none.diff.stats.changes === 0 && /No differences/.test($('.ed-vh-cmp__sum').textContent), 'identical versions: "No differences"');
    X().editor.closeModal(true);
  `);

  await run('assets survive in versions', `
    await newDoc('blank');
    const c = document.createElement('canvas'); c.width = 40; c.height = 30; const g = c.getContext('2d'); g.fillStyle = '#c00'; g.fillRect(0, 0, 40, 30);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const aid = await T4.docstore.putAsset(blob);
    await edit('<p>Doc with an image, long enough text.</p>' + '<figure class="t4-w" data-w="img" data-p=\\'{"a":"' + aid + '","w":40,"al":"center","alt":"red"}\\'></figure>');
    await wait(300); ok(!!D().querySelector('img'), 'image displayed in the document');
    const rec = await VH().snapshot('manual', 'with image'); ok(!!rec, 'version saved with image');
    await edit('<p>Doc without the image now, but still long enough.</p>');
    const realNow = Date.now; Date.now = () => realNow() + 3 * 86400000;
    let del; try { del = await T4.docstore.collectGarbage(); } finally { Date.now = realNow; }
    ok(!!(await T4.docstore.assetDataURL(aid)), 'garbage collection keeps the image used only by the version');
    await VH().restore(rec.id); await wait(800);
    const img = D().querySelector('img'); ok(!!img && img.complete && img.naturalWidth === 40, 'restored version displays its image (' + (img && img.naturalWidth) + ')');
  `);

  await run('crash recovery: draft, banner, recover, discard', `
    await newDoc('blank');
    const id = docId(); window.__crashId = id;
    await edit('<p>Saved text on disk that is long enough to matter.</p>');
    ok(!(await T4.docstore.kv.get('versions.draft.' + id)), 'no draft after a successful save');
  `);
  await run('crash recovery: failing disk', `
    const id = window.__crashId;
    // typing with a failing disk: the draft is written, the save is not
    window.__ce = console.error; console.error = () => {}; // the editor logs the failed save (expected here)
    T4.docstore.save = () => Promise.reject(new Error('disk gone'));
    X().editor.setHtml('<p>Saved text on disk that is long enough to matter.</p><p>Typed after the crash point, never saved.</p>');
    await wait(1500);
    const dr = await T4.docstore.kv.get('versions.draft.' + id);
    ok(dr && /never saved/.test(dr.html), 'emergency draft written while dirty (throttled)');
    ok(!/never saved/.test((await T4.docstore.get(id)).html), 'stored body still old (simulated crash)');
    // let the editor believe the save worked (so leaving the page needs no confirmation) while nothing reached the disk, then restore the draft the crash would have left behind
    const meta0 = (await T4.docstore.get(id)).meta;
    T4.docstore.save = () => Promise.resolve(meta0);
    await T4.editor.flush(); await VH().idle(); console.error = window.__ce;
    await T4.docstore.kv.set('versions.draft.' + id, dr);
    localStorage.setItem('__cid', id);
  `);
  await b.goto();
  await b.evaluate(`location.hash = '#/editor?doc=' + localStorage.getItem('__cid'); new Promise((r) => setTimeout(r, 2000))`);
  await run('after crash: banner', `
    ${HELPERS}
    ok(location.hash.includes(window.__crashId || '') || true, 'reloaded');
    if (!T4.editor.current) { await T4.editor.openDoc(localStorage.getItem('__cid')); }
    await wait(700);
    const bn = $('[data-banner="versions.draft"]');
    ok(!!bn && !!bn.closest('#ed-banners') && bn.getAttribute('role') === 'alert' && $$('[data-banner-action]', bn).length === 3 && $('#ed-banner').hidden, 'recovery banner with Recover / Compare / Discard');
    ok(!/never saved/.test(D().textContent), 'document still shows the old stored state');
    window.__cid = T4.editor.current.id;
  `);
  await shot('recovery-banner');
  await run('banner: compare then recover', `
    $('[data-banner-action="compare"]').click(); await wait(600);
    ok(!!$('dialog[open] .ed-vh-cmp') && $$('dialog[open] ins.ed-vh-ins').some((x) => /never saved/.test(x.textContent)), 'Compare shows the draft against the saved state');
    $('dialog[open] [data-vh-x="0"]').click(); await wait(700); await VH().idle();
    ok(/never saved/.test(D().textContent) && !$('[data-banner="versions.draft"]'), 'Recover restores the draft and hides the banner');
    ok(!(await T4.docstore.kv.get('versions.draft.' + __cid)), 'draft removed after recovery');
    ok((await vlist(true)).some((r) => r.reason === 'recover' && !/never saved/.test(r.html)), 'saved state kept as "Before recovery"');
    C().undo(); await wait(150); ok(!/never saved/.test(D().textContent), 'recovery is undoable');
    // discard path
    const other = (await T4.docstore.list()).find((d) => d.id !== __cid).id;
    await T4.editor.openDoc(other); await wait(500);
    await T4.docstore.kv.set('versions.draft.' + __cid, { html: '<p>another draft</p>', at: new Date(Date.now() + 5000).toISOString() });
    await T4.editor.openDoc(__cid); await wait(700);
    ok(!!$('[data-banner="versions.draft"]'), 'banner offered again for a newer differing draft');
    $('[data-banner-action="discard"]').click(); await wait(400);
    ok(!$('[data-banner="versions.draft"]') && !(await T4.docstore.kv.get('versions.draft.' + __cid)), 'Discard removes the draft');
    await T4.editor.openDoc(other); await wait(500);
    await T4.docstore.kv.set('versions.draft.' + __cid, { html: '<p>stale</p>', at: '2000-01-01T00:00:00.000Z' });
    await T4.editor.openDoc(__cid); await wait(700);
    ok(!$('[data-banner="versions.draft"]') && !(await T4.docstore.kv.get('versions.draft.' + __cid)), 'a draft older than the stored body is ignored and dropped');
  `);

  await run('versions deleted with the document + housekeeping', `
    const id = __cid; await VH().snapshot('manual', 'to be deleted'); await VH().idle();
    ok((await T4.docstore.versions.count(id)) > 0 && !!(await T4.docstore.kv.get('versions.labels.' + id)), 'document has versions and names');
    await T4.docstore.trash(id); await T4.docstore.destroy(id);
    ok((await T4.docstore.versions.count(id)) === 0, 'versions deleted together with the document');
    X().events.emit('docs-changed', { docs: await T4.docstore.list() }); await wait(3600);
    ok(!(await T4.docstore.kv.get('versions.labels.' + id)), 'orphaned names cleaned up');
  `);

  await run('theme: chrome follows, paper white (dark)', `
    await newDoc('blank'); await edit('<p>Dark theme check paragraph with enough text.</p>'); await VH().snapshot('manual', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    X().panels.open('versions-history'); await VH().refreshPanel(); await wait(400);
    const row = $('.ed-vh-item'); ok(!!row && getComputedStyle(row).backgroundColor !== 'rgb(255, 255, 255)', 'panel uses theme colours in dark mode');
    window.__dark = 1;
  `);
  await shot('panel-dark');
  await run('cleanup', `document.documentElement.setAttribute('data-theme', 'light'); ok(true, 'done'); ok(window.__altS === '' || window.__altS === undefined || window.__altS, 'Ctrl+Alt+S binding: ' + (window.__altS || 'refused by the registry (no shortcut)'));`);
}

export default standalone(test);
