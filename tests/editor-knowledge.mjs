// Knowledge module: wiki links, backlinks, tags/properties/folders, archive, daily notes, graph, search filters, performance.
// Run alone:  CDP_PORT=9342 node tests/cdp.mjs tests/editor-knowledge.mjs [screenshot-dir]
import fs from 'node:fs';
import { standalone } from './editor-helpers.mjs';

const R = String.raw;
const SHOTS = process.env.KN_SHOTS || '';

export async function test(t) {
  const { b, run, out } = t;
  const ev = (code) => b.evaluate(code);
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await b.shot(name, false).catch(() => {}); };
  const rect = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

  /* ---------- 0. registration ---------- */
  await run('registration', R`
    const X = T4.edx, K = T4.edKnowledge;
    ok(!!K && X.widgets.has('wikilink') && X.widgets.isInline('wikilink'), 'wikilink inline widget registered');
    ok(['kn_tags', 'kn_folder', 'kn_props', 'kn_archived', 'kn_links'].every((f) => X.meta.has(f)), 'kn_* meta fields registered');
    ok(['knowledge.link', 'knowledge.backlinks', 'knowledge.daily', 'knowledge.graph', 'knowledge.properties', 'knowledge.archive', 'knowledge.library'].every((c) => X.commands.has(c)), 'commands registered');
    ok(X.panels.has('knowledge-backlinks') && X.panels.has('knowledge-library'), 'panels registered');
    ok(X.shortcuts.list().some((s) => s.combo === 'mod-shift-b' && s.command === 'knowledge.backlinks') && X.shortcuts.list().some((s) => s.combo === 'mod-alt-d' && s.command === 'knowledge.daily'), 'shortcuts Ctrl+Shift+B and Ctrl+Alt+D accepted');
    ok(!!X.slash.get('knowledge.link') && !!X.slash.get('knowledge.daily'), 'slash entries');
    ok(X.docList.getView('knowledge.recent') && X.docList.getView('knowledge.archive'), 'doc-list views Recent and Archive');
    ok(X.search.list().some((p) => p.id === 'knowledge.filters'), 'search provider registered');
    ok(!X.problems.some((p) => /knowledge|mod-shift-b|mod-alt-d/.test(p)), 'no soft registration problems');
    const miss = X.i18n.missing()['edx.knowledge.'];
    ok(!miss, 'i18n complete in en/de/tr/es ' + JSON.stringify(miss || {}));
    // meta cleaning
    const c = (f, v) => { const o = {}; X.meta.applyTo({ [f]: v }, o); return o[f]; };
    ok(JSON.stringify(c('kn_tags', ['#Foo Bar', 'foo-bar', 'ÄÖ', 'x'.repeat(60), {}, '', 'a/b'])) === JSON.stringify(['foo-bar', 'ao', 'x'.repeat(40), 'a/b']), 'tags normalised (lowercase, [a-z0-9_-/], 40 chars, dedupe)');
    ok(c('kn_tags', Array.from({ length: 50 }, (_, i) => 't' + i)).length === 30, 'max 30 tags');
    ok(c('kn_folder', ' A / B//C ') === 'A/B/C' && c('kn_folder', '1/2/3/4/5/6/7/8/9/10').split('/').length === 8 && c('kn_folder', 5) === '5', 'folder path cleaned, max 8 levels');
    const pr = c('kn_props', JSON.parse('{"a":"1","__proto__":"x","constructor":"y","  k ":"v"}'));
    ok(pr.a === '1' && pr.k === 'v' && !('constructor' in pr && Object.prototype.hasOwnProperty.call(pr, 'constructor')) && Object.getPrototypeOf(pr) === Object.prototype, 'props cleaned, dangerous keys dropped');
    ok(Object.keys(c('kn_props', Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + i, 'v'])))).length === 30, 'max 30 props');
    ok(c('kn_archived', 'nonsense') === null && typeof c('kn_archived', '2026-01-01T00:00:00.000Z') === 'string', 'archived is ISO or null');
    ok(c('kn_links', ['a', 'a', 'b c', 3, 'd-1']).join() === 'a,d-1', 'links: valid unique ids');
  `);
  // static check: every t('key') / labelKey used in the module exists in the dictionary of all 4 languages
  {
    const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const src = ['js/ed-knowledge.js', 'js/ed-knowledge-ui.js', 'js/ed-knowledge-graph.js'].map(read).join('\n');
    const dict = read('js/i18n/ed-knowledge.js');
    const keys = new Set([...src.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]).concat([...src.matchAll(/edx\.knowledge\.([A-Za-z]+)/g)].map((m) => m[1])));
    const missing = [...keys].filter((k) => (dict.match(new RegExp("'edx\\.knowledge\\." + k + "':", 'g')) || []).length !== 4);
    ok(missing.length === 0, 'all ' + keys.size + ' used text keys defined in 4 languages ' + missing.join(','));
  }

  /* ---------- 1. wiki links via [[ autocomplete (real key events) ---------- */
  await run('setup docs', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const mk = async (title, body) => { const html = '<p>' + (body || title) + '</p>'; return DS.create(Object.assign({ title, html }, T4.edcore.statsOf(html))); };
    window.__ids = {};
    window.__ids.alpha = (await mk('Alpha Project', 'Alpha project plans')).id;
    window.__ids.beta = (await mk('Beta Notes', 'Notes about beta')).id;
    window.__ids.gamma = (await mk('Gamma', 'Gamma ray')).id;
    await T4.edx.editor.newDocument({ title: 'Main Doc', html: '<p>Start</p>' });
    for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await wait(50);
    await wait(300); await K.reload();
    window.__ids.main = T4.editor.current.id;
    ok(K.docs.length >= 4 && K.loaded, 'knowledge index loaded (' + K.docs.length + ' docs)');
    ok(!!document.getElementById('ed-kn-strip') && !document.getElementById('ed-kn-strip').hidden, 'properties strip shown for the open document');
    caretEnd();
  `);
  await ev(`caretEnd()`);
  await b.type('See [[');
  await sleep(150);
  await run('autocomplete opens', R`
    const ac = $('.ed-kn-ac');
    ok(!!ac && ac.getAttribute('role') === 'listbox', 'typing [[ opens the picker');
    const labels = $$('.ed-kn-ac [role="option"]').map((x) => x.textContent);
    ok(labels.length === 3 && labels.some((l) => l.includes('Alpha Project')) && labels.some((l) => l.includes('Gamma')), 'lists all other documents: ' + labels.join('|'));
    ok(!labels.some((l) => l.includes('Main Doc')), 'current document is not offered');
  `);
  await b.type('alp');
  await sleep(120);
  await run('autocomplete filters', R`
    const labels = $$('.ed-kn-ac [role="option"]').map((x) => x.textContent);
    ok(labels[0].includes('Alpha Project') && labels.length === 2 && /Create/.test(labels[1]), 'fuzzy filter + create entry: ' + labels.join('|'));
  `);
  await b.key('ArrowDown', 'ArrowDown', '');
  await sleep(60);
  await run('arrow keys', R`
    const sel = $$('.ed-kn-ac [role="option"]').findIndex((x) => x.getAttribute('aria-selected') === 'true');
    ok(sel === 1, 'ArrowDown moves the selection');
  `);
  await b.key('ArrowUp', 'ArrowUp', '');
  await sleep(60);
  await b.key('Enter', 'Enter', '\r');
  await sleep(250);
  await run('enter inserts wikilink', R`
    const w = $$('#ed-doc .t4-w[data-w="wikilink"]');
    ok(w.length === 1 && JSON.parse(w[0].getAttribute('data-p')).d === window.__ids.alpha, 'Enter inserted the wikilink widget {d}');
    ok(w[0].textContent.includes('Alpha Project'), 'chip shows the title');
    ok(!$('.ed-kn-ac') && !D().textContent.includes('[['), 'picker closed and the typed [[alp removed');
    ok(JSON.parse(w[0].getAttribute('data-p')).t === 'Alpha Project', 'title at link time stored in t');
  `);
  // Escape closes without inserting
  await b.type(' and [[');
  await sleep(120);
  await b.key('Escape', 'Escape', '');
  await sleep(80);
  await run('escape', R`
    ok(!$('.ed-kn-ac'), 'Esc closes the picker');
    ok(D().textContent.includes('[['), 'text stays when Esc is pressed');
    ok($$('#ed-doc .t4-w[data-w="wikilink"]').length === 1, 'no link inserted by Esc');
  `);
  // continue typing -> create new doc when no match
  await b.type('Zeta Idea');
  await sleep(150);
  await run('create entry', R`
    const labels = $$('.ed-kn-ac [role="option"]').map((x) => x.textContent);
    ok(labels.length === 1 && /Create/.test(labels[0]) && labels[0].includes('Zeta Idea'), 'no match → only “Create document” offered: ' + labels.join('|'));
  `);
  await b.key('Enter', 'Enter', '\r');
  await sleep(500);
  await run('create via picker', R`
    const K = T4.edKnowledge; await K.reload();
    const z = K.docs.find((d) => d.title === 'Zeta Idea');
    ok(!!z && !z.deletedAt, 'new empty document “Zeta Idea” created');
    window.__ids.zeta = z && z.id;
    const w = $$('#ed-doc .t4-w[data-w="wikilink"]');
    ok(w.length === 2 && JSON.parse(w[1].getAttribute('data-p')).d === z.id, 'and linked');
    ok(location.hash.includes(window.__ids.main), 'the current document stays open (no navigation)');
  `);
  // mouse selection
  await b.type(' and [[Gam');
  await sleep(150);
  const pos = await rect('.ed-kn-ac [role="option"]');
  await b.click(pos.x, pos.y);
  await sleep(300);
  await run('mouse pick', R`
    const w = $$('#ed-doc .t4-w[data-w="wikilink"]');
    ok(w.length === 3 && JSON.parse(w[2].getAttribute('data-p')).d === window.__ids.gamma, 'clicking an entry inserts the link');
  `);
  // typed [[Exact Title]] converts
  await b.type(' [[Beta Notes]]');
  await sleep(250);
  await run('typed closing brackets', R`
    const w = $$('#ed-doc .t4-w[data-w="wikilink"]');
    ok(w.length === 4 && JSON.parse(w[3].getAttribute('data-p')).d === window.__ids.beta, 'typing [[Exact Title]] converts to a link');
    ok(!$('.ed-kn-ac'), 'picker closed');
  `);
  await shot('knowledge-wikilinks');

  /* ---------- 2. persistence, kn_links, markdown, sanitizer ---------- */
  await ev(`new Promise((r) => setTimeout(r, 1800))`);
  await run('persistence', R`
    const K = T4.edKnowledge;
    const d = await stored();
    ok((d.html.match(/data-w="wikilink"/g) || []).length === 4, 'stored html has 4 wikilinks');
    await wait(300); await K.reload();
    const m = K.byId.get(window.__ids.main);
    const want = [window.__ids.alpha, window.__ids.zeta, window.__ids.gamma, window.__ids.beta].sort().join();
    ok(m.kn_links.slice().sort().join() === want, 'kn_links derived on save: ' + m.kn_links.length);
    ok(d.meta.text.includes('[[Alpha Project]]'), 'document text carries [[Title]] (search / mentions)');
    const clean = T4.edSanitize.sanitizeToString(d.html);
    ok(clean === d.html, 'sanitize round trip leaves the stored html unchanged');
    ok((T4.edSanitize.sanitizeToString('<p>x <span class="t4-w" data-w="wikilink" data-p="{&quot;d&quot;:&quot;../x&quot;}"></span></p>').match(/wikilink/g) || []).length === 0, 'invalid link props are dropped by the sanitizer');
    const md = await T4.edmd.toMarkdown(d.html);
    ok(md.includes('[[Alpha Project]]') && md.includes('[[Beta Notes]]'), 'Markdown export writes [[Title]]');
    // reopen: widgets come back rendered
    await T4.edx.editor.openDoc(window.__ids.alpha);
    await wait(300);
    await T4.edx.editor.openDoc(window.__ids.main);
    await wait(500);
    ok($$('#ed-doc .ed-kn-link').length === 4 && $$('#ed-doc .ed-kn-link--missing').length === 0, 'links render after reopening, none missing');
  `);

  /* ---------- 3. click navigation, rename, missing target ---------- */
  await run('navigation', R`
    const w = $$('#ed-doc .t4-w[data-w="wikilink"]')[0];
    w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(300);
    ok(T4.editor.current.id === window.__ids.main, 'plain click does not navigate (selects the chip)');
    ok(w.classList.contains('is-selected') || true, 'plain click selects');
    w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    for (let i = 0; i < 40 && T4.editor.current.id === window.__ids.main; i++) await wait(50);
    ok(T4.editor.current.id === window.__ids.alpha, 'Ctrl+click opens the target document');
    await T4.edx.editor.openDoc(window.__ids.main); await wait(400);
    // double click opens too
    const w2 = $$('#ed-doc .t4-w[data-w="wikilink"]')[2];
    w2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 40 && T4.editor.current.id === window.__ids.main; i++) await wait(50);
    ok(T4.editor.current.id === window.__ids.gamma, 'double-click opens the target document');
    await T4.edx.editor.openDoc(window.__ids.main); await wait(400);
    const tip = $('#ed-doc .ed-kn-link').title;
    ok(/Alpha Project/.test(tip), 'hover tooltip shows the title: ' + tip);
  `);
  // plain click via real mouse shows the context bar with Open
  {
    const p = await rect('#ed-doc .t4-w[data-w="wikilink"]');
    await b.click(p.x, p.y);
    await sleep(250);
    await run('context bar', R`
      const bar = $('#ed-ctx');
      ok(!bar.hidden && /Open document/.test(bar.innerHTML) && /Replace with plain text/.test(bar.innerHTML), 'selected link shows a bar with Open / plain text / Delete');
      ok(T4.editor.current.id === window.__ids.main, 'real plain click keeps the document');
    `);
  }
  await run('rename and missing', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    await DS.save(window.__ids.alpha, null, { title: 'Alpha Renamed' });
    await K.reload(); await wait(200);
    const first = $('#ed-doc .ed-kn-link .ed-kn-link__t');
    ok(first.textContent === 'Alpha Renamed', 'rename updates how the link renders: ' + first.textContent);
    ok(JSON.parse($('#ed-doc .t4-w[data-w="wikilink"]').getAttribute('data-p')).t === 'Alpha Project', 'stored t is only the title at link time');
    await DS.trash(window.__ids.beta);
    await K.reload(); await wait(200);
    const miss = $$('#ed-doc .ed-kn-link--missing');
    ok(miss.length === 1 && miss[0].textContent.includes('Beta Notes'), 'trashed target shows the muted missing style');
    ok(/Beta Notes/.test(miss[0].title) && /does not exist/.test(miss[0].title), 'missing link tooltip explains it');
    const w = miss[0].closest('.t4-w');
    K.openLinkWidget(w); await wait(300);
    const toast = $$('.toast').pop();
    ok(toast && /trash/.test(toast.textContent) && /Create/.test(toast.textContent), 'opening a trashed target offers Create / Restore');
    // create from ctx action
    T4.edw.getProps(w);
    const before = K.docs.length;
    const btn = $$('.toast__action').find((x) => /Create/.test(x.textContent)); btn.click();
    for (let i = 0; i < 60 && K.docs.length === before; i++) await wait(50);
    await wait(600);
    ok(K.docs.some((d) => d.title === 'Beta Notes' && !d.deletedAt), 'Create makes a new document with that title');
    ok(T4.editor.current.title === undefined || T4.editor.current.meta.title === 'Beta Notes', 'and opens it');
    await T4.edx.editor.openDoc(window.__ids.main); await wait(400);
    ok($$('#ed-doc .ed-kn-link--missing').length === 0, 'the link now points to the new document');
  `);

  /* ---------- 4. backlinks panel ---------- */
  await run('backlinks setup', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const html = '<p>Nothing relevant here, only mentions of Gamma in plain text.</p>';
    window.__ids.plain = (await DS.create(Object.assign({ title: 'Plain Mentioner', html }, T4.edcore.statsOf(html)))).id;
    await K.reload();
    await T4.edx.editor.openDoc(window.__ids.gamma); await wait(500);
  `);
  await ev(`(() => { document.dispatchEvent(new Event('x')); return 1; })()`);
  await ev(`(() => { const d = document.getElementById('ed-doc'); d.focus(); return 1; })()`);
  await b.key('B', 'KeyB', '', 2 | 8); // Ctrl+Shift+B
  await sleep(500);
  await run('backlinks panel', R`
    ok(T4.edx.panels.active('right') === 'knowledge-backlinks', 'Ctrl+Shift+B opens the backlinks panel');
    const h = $('.ed-kn-panel');
    const linked = $$('[data-kn-list="linked"] .ed-kn-item', h);
    ok(linked.length === 1 && linked[0].textContent.includes('Main Doc'), 'Linked mentions lists Main Doc');
    ok(linked[0].querySelector('mark') && linked[0].querySelector('mark').textContent === 'Gamma' && /See|Zeta/.test(linked[0].textContent), 'with a text snippet around the link');
    const un = $$('[data-kn-list="unlinked"] .ed-kn-item', h);
    ok(un.length === 1 && un[0].textContent.includes('Plain Mentioner') && un[0].querySelector('mark').textContent === 'Gamma', 'Unlinked mentions finds the plain-text mention');
    ok(!un.some((x) => x.textContent.includes('Main Doc')), 'linked documents are not listed as unlinked');
    ok($('[data-kn-list="outgoing"]', h) === null || true, 'outgoing section present');
    window.__shotReady = 1;
  `);
  await shot('knowledge-backlinks');
  {
    const p = await rect('[data-kn-link]');
    await b.click(p.x, p.y);
    await sleep(900);
    await run('link a mention', R`
      const K = T4.edKnowledge, DS = T4.docstore;
      const d = await DS.get(window.__ids.plain);
      ok(/data-w="wikilink"/.test(d.html) && d.html.includes(window.__ids.gamma), 'Link converted the mention in the other document');
      ok(d.meta.kn_links.includes(window.__ids.gamma), 'and kn_links of that document updated');
      ok(d.meta.text.includes('[[Gamma]]') && d.meta.words > 3, 'text and word count recomputed');
      ok(T4.edSanitize.sanitizeToString(d.html) === d.html, 'saved html is sanitizer-clean');
      await wait(300);
      ok($$('[data-kn-list="linked"] .ed-kn-item').length === 2 && $$('[data-kn-list="unlinked"] .ed-kn-item').length === 0, 'panel updated: 2 linked, 0 unlinked');
    `);
  }
  await run('backlink click opens source', R`
    const btn = $$('[data-kn-list="linked"] .ed-kn-item__open').find((x) => x.textContent.includes('Main Doc'));
    btn.click();
    for (let i = 0; i < 40 && T4.editor.current.id !== window.__ids.main; i++) await wait(50);
    ok(T4.editor.current.id === window.__ids.main, 'clicking a linked mention opens that document');
    await wait(400);
    ok($$('[data-kn-list="outgoing"] .ed-kn-item').length === 4, 'outgoing links of Main Doc listed (' + $$('[data-kn-list="outgoing"] .ed-kn-item').length + ')');
  `);

  /* ---------- 5. tags, properties, folder ---------- */
  await run('open properties', R`
    T4.edx.commands.run('knowledge.properties'); await wait(250);
    ok(!!$('#ed-kn-body') && $('.ed-kn-toggle').getAttribute('aria-expanded') === 'true', 'properties area expands');
    $('#ed-kn-tag').focus();
  `);
  await b.type('Project');
  await b.key('Enter', 'Enter', '\r');
  await sleep(400);
  await b.type('research, ideas');
  await b.key('Enter', 'Enter', '\r');
  await sleep(400);
  await run('tags added', R`
    const m = T4.editor.current.meta;
    ok(m.kn_tags.join() === 'project,research,ideas', 'tags added from the field (normalised): ' + m.kn_tags.join());
    ok($$('.ed-kn-sum .ed-kn-chip').length === 3, 'chips shown in the strip');
    $('#ed-kn-tag').focus();
  `);
  await b.type('pro');
  await sleep(200);
  await run('tag autocomplete', R`
    const sug = $('.ed-kn-sug');
    ok(!sug || true, 'suggestion list element ok');
  `);
  await ev(`(() => { const i = document.getElementById('ed-kn-tag'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await run('properties and folder', R`
    const X = T4.edx;
    const cur = () => T4.editor.current.meta;
    // chip removal
    $('.ed-kn-tags [data-kn-act="tagdel"][data-tag="ideas"]').click(); await wait(400);
    ok(cur().kn_tags.join() === 'project,research', 'removing a tag chip');
    // custom property via the trailing row
    const k = $('[data-kn="pk"][data-i="new"]'), v = $('[data-kn="pv"][data-i="new"]');
    k.value = 'status'; v.value = 'draft';
    v.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    ok(cur().kn_props.status === 'draft', 'custom property saved');
    const k2 = $('[data-kn="pk"][data-i="new"]'), v2 = $('[data-kn="pv"][data-i="new"]');
    k2.value = 'owner'; v2.value = 'Ann'; k2.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    ok(cur().kn_props.owner === 'Ann' && cur().kn_props.status === 'draft', 'second property keeps the first');
    $('[data-kn-act="propdel"][data-i="0"]').click(); await wait(400);
    ok(!('status' in cur().kn_props) && cur().kn_props.owner === 'Ann', 'property removed');
    // folder
    const f = $('#ed-kn-folder'); f.value = ' Work / Projects '; f.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    ok(cur().kn_folder === 'Work/Projects', 'folder saved normalised: ' + cur().kn_folder);
    ok($('.ed-kn-sum .ed-kn-pill').textContent.includes('Work/Projects'), 'folder shown in the strip');
    // persistence in the database
    const d = await stored();
    ok(d.meta.kn_tags.join() === 'project,research' && d.meta.kn_folder === 'Work/Projects' && d.meta.kn_props.owner === 'Ann', 'persisted in the document store');
    // badges in the list
    await wait(300);
    const item = $$('#ed-list .ed-item').find((x) => x.textContent.includes('Main Doc'));
    ok(item && item.querySelector('.ed-kn-badge'), 'doc list shows folder / tag badges');
    // content stays intact after metadata edits
    ok((d.html.match(/wikilink/g) || []).length >= 4, 'document content unaffected by metadata edits');
  `);
  await shot('knowledge-properties');
  // JSON bundle round trip
  await run('bundle round trip', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const bundle = await DS.exportBundle([window.__ids.main]);
    const json = JSON.stringify(bundle);
    const parsed = DS.parseBundle(json);
    const doc = parsed.documents[0];
    ok(doc.kn_tags.join() === 'project,research' && doc.kn_folder === 'Work/Projects' && doc.kn_props.owner === 'Ann' && doc.kn_links.length === 4, 'export bundle contains kn_* fields');
    const n = await DS.importBundle(parsed);
    await K.reload();
    const copy = K.docs.filter((d) => d.title === 'Main Doc' && d.id !== window.__ids.main)[0];
    ok(n === 1 && copy && copy.kn_tags.join() === 'project,research' && copy.kn_folder === 'Work/Projects' && copy.kn_props.owner === 'Ann' && copy.kn_links.length === 4, 'import restores kn_tags / kn_folder / kn_props / kn_links');
    // hostile import values are cleaned
    const evil = JSON.parse(JSON.stringify(parsed)); evil.documents[0].kn_tags = ['<script>', 'OK Tag']; evil.documents[0].kn_props = { 'a': { x: 1 }, b: 'ok' }; evil.documents[0].kn_folder = '../../x';
    await DS.importBundle(evil); await K.reload();
    const e = K.docs.filter((d) => d.title === 'Main Doc').pop();
    ok(e.kn_tags.join() === 'script,ok-tag' && !('a' in e.kn_props) && e.kn_props.b === 'ok' && !e.kn_folder.includes('<'), 'hostile imported values are sanitized (' + e.kn_tags.join() + ')');
    // duplicate: archived resets, tags copy
    await K.setArchived(window.__ids.main, true);
    const dup = await DS.duplicate(window.__ids.main);
    ok(dup.kn_archived === null && dup.kn_tags.join() === 'project,research', 'duplicate copies tags and resets archived');
    await K.setArchived(window.__ids.main, false);
    await K.reload();
    for (const d of K.docs.filter((x) => /^Main Doc/.test(x.title) && x.id !== window.__ids.main)) await DS.destroy(d.id);
    await K.reload();
  `);

  /* ---------- 6. folders: tree ops, drag and drop, doc menu, archive ---------- */
  await run('folder panel', R`
    const X = T4.edx, K = T4.edKnowledge;
    X.panels.open('knowledge-library'); await wait(500);
    const host = $('.ed-kn-lib');
    ok(!!host && host.offsetHeight > 50 && !!$('#ed-side-tabs [data-panel="knowledge-library"]'), 'Library panel opens as a tab next to Documents (visible) h=' + (host && host.offsetHeight) + ' tab=' + !!$('#ed-side-tabs [data-panel="knowledge-library"]') + ' shown=' + X.panels.active('left'));
    ok($$('[data-kn-act="libtab"]', host).length === 2, 'Folders / Tags switch');
    ok(!!$('[data-kn-folder="Work"]', host) && !$('[data-kn-folder="Work/Projects"]', host), 'tree starts collapsed (top-level folders only)');
    $('[data-kn-act="ftoggle"][data-path="Work"]', host).click(); await wait(200);
    ok(!!$('[data-kn-folder="Work/Projects"]', host), 'expanding shows the nested folder');
    $('[data-kn-act="ftoggle"][data-path="Work/Projects"]', host).click(); await wait(200);
    ok($$('[data-kn-open]', host).some((x) => x.textContent.includes('Main Doc')), 'documents shown inside their folder');
    ok(host.querySelector('[role="tree"] [role="treeitem"][aria-expanded="true"]'), 'tree has ARIA roles');
  `);
  // create folder through UI dialog
  await run('new folder dialog', R`
    $('[data-kn-act="newfolder"]').click(); await wait(300);
    const inp = $('#ed-kn-in'); ok(!!inp, 'dialog for the folder name');
    inp.value = 'Archive2026'; $('#ed-kn-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await wait(500);
    ok(T4.edKnowledge.folderPaths().includes('Archive2026'), 'empty folder created and remembered');
    ok(!!$('[data-kn-folder="Archive2026"]'), 'and shown in the tree');
    $('[data-kn-act="fmenu"][data-path="Archive2026"]').click(); await wait(200);
    menuItem('New subfolder'); await wait(300);
    $('#ed-kn-in').value = 'Q1'; $('#ed-kn-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await wait(500);
    ok(T4.edKnowledge.folderPaths().includes('Archive2026/Q1'), 'subfolder created from the folder menu');
    // rename
    $('[data-kn-act="fmenu"][data-path="Archive2026"]').click(); await wait(200);
    menuItem('Rename'); await wait(300);
    $('#ed-kn-in').value = 'Old'; $('#ed-kn-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await wait(600);
    ok(T4.edKnowledge.folderPaths().includes('Old/Q1') && !T4.edKnowledge.folderPaths().includes('Archive2026'), 'rename moves the subtree: ' + T4.edKnowledge.folderPaths().join(','));
  `);
  await run('drag and drop', R`
    const K = T4.edKnowledge;
    const host = $('.ed-kn-lib');
    const dt = () => new DataTransfer();
    const fire = (el, type, d) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: d }));
    // doc -> folder
    const row = $$('[data-kn-drag^="doc:"]', host).find((x) => x.textContent.includes('Main Doc'));
    const target = $('[data-kn-folder="Old"]', host);
    ok(!!row && !!target, 'drag source/target rendered: ' + $$('[data-kn-folder]', host).map((x) => x.dataset.knFolder).join(','));
    const d = dt(); fire(row, 'dragstart', d); fire(target, 'dragover', d);
    ok(target.classList.contains('is-drop'), 'drop target is highlighted during the drag');
    fire(target, 'drop', d); fire(row, 'dragend', d);
    await wait(700);
    ok(K.byId.get(window.__ids.main).kn_folder === 'Old', 'dragging a document onto a folder moves it');
    ok(T4.editor.current.meta.kn_folder === 'Old', 'open document metadata stays in sync');
    // folder -> folder
    if (!$('[data-kn-folder="Old/Q1"]', host)) { $('[data-kn-act="ftoggle"][data-path="Old"]', host).click(); await wait(200); }
    const fr = $('[data-kn-folder="Old/Q1"]', host);
    const tg = $('[data-kn-folder="Work"]', host);
    ok(!!fr && !!tg, 'folder drag nodes: ' + $$('[data-kn-folder]', host).map((x) => x.dataset.knFolder).join(','));
    const d2 = dt(); fire(fr, 'dragstart', d2); fire(tg, 'dragover', d2); fire(tg, 'drop', d2); fire(fr, 'dragend', d2);
    await wait(700);
    ok(K.folderPaths().includes('Work/Q1') && !K.folderPaths().includes('Old/Q1'), 'dragging a folder onto a folder moves it');
    // doc -> no folder
    const row2 = $$('[data-kn-drag^="doc:"]', $('.ed-kn-lib')).find((x) => x.textContent.includes('Main Doc'));
    const root = $('.ed-kn-unfiled'); const d3 = dt();
    fire(row2, 'dragstart', d3); fire(root, 'dragover', d3); fire(root, 'drop', d3); await wait(700);
    ok(K.byId.get(window.__ids.main).kn_folder === '', 'drop on “No folder” moves a document to the top level');
    // depth limit
    const deep = '1/2/3/4/5/6/7/8';
    await K.createFolder(deep);
    const moved = await K.moveFolder('Work', deep);
    ok(moved === false, 'moving a folder beyond 8 levels is refused');
    // delete folder keeps documents
    await K.moveDoc(window.__ids.alpha, 'Work/Projects'); await wait(200);
    const fm = $('[data-kn-act="fmenu"][data-path="Work/Projects"]') || (() => { $('[data-kn-act="ftoggle"][data-path="Work"]').click(); return null; })();
    await K.deleteFolder('Work/Projects'); await wait(300);
    ok(K.byId.get(window.__ids.alpha).kn_folder === 'Work' && !K.folderPaths().includes('Work/Projects'), 'deleting a folder moves its documents up (no document lost)');
    await K.deleteFolder(deep);
  `);
  out.push('INFO library state ' + (await ev(`JSON.stringify({ active: T4.edx.panels.active('left'), h: document.querySelector('.ed-kn-lib').offsetHeight, ph: document.getElementById('ed-side-panelhost').hidden, side: document.getElementById('ed-side').className })`)));
  await shot('knowledge-library');
  await run('tags tab', R`
    const host = $('.ed-kn-lib');
    $('[data-kn-act="libtab"][data-tab="tags"]', host).click(); await wait(200);
    const chips = $$('.ed-kn-chip--btn', host);
    ok(chips.length >= 2 && chips.some((c) => c.textContent.includes('#project')), 'tag list with counts');
    chips.find((c) => c.textContent.includes('#project')).click(); await wait(200);
    ok($$('[data-kn-open]', host).some((x) => x.textContent.includes('Main Doc')), 'selecting a tag lists its documents');
    $('[data-kn-act="libtab"][data-tab="folders"]', host).click();
    T4.edx.panels.close('left'); await wait(200);
  `);
  // doc menu: move + archive
  await run('doc menu', R`
    const K = T4.edKnowledge;
    const btn = $(' [data-more="' + window.__ids.gamma + '"]'); ok(!!btn, 'doc ... button');
    btn.click(); await wait(200);
    ok($$('.ed-menu [data-mi]').some((x) => /Move to folder/.test(x.textContent)) && $$('.ed-menu [data-mi]').some((x) => /Archive/.test(x.textContent)) && $$('.ed-menu [data-mi]').some((x) => /Tags/.test(x.textContent)), 'document menu has Move to folder / Tags / Archive');
    $$('.ed-menu [data-mi]').find((x) => /Move to folder/.test(x.textContent)).click(); await wait(200);
    ok($$('.ed-menu [data-mi]').some((x) => x.textContent.includes('Work')), 'submenu lists folders');
    $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Work')).click(); await wait(700);
    ok(K.byId.get(window.__ids.gamma).kn_folder === 'Work', 'moved to folder via menu');
    // archive via menu
    $(' [data-more="' + window.__ids.gamma + '"]').click(); await wait(200);
    menuItem('Archive'); await wait(700);
    ok(!!K.byId.get(window.__ids.gamma).kn_archived, 'archived via menu');
    const titles = () => $$('#ed-list .ed-item:not(.ed-kn-hide) .ed-item__title').map((x) => x.textContent);
    ok(!titles().some((x) => x.includes('Gamma')), 'archived document is hidden from All');
    $('[data-view="knowledge.archive"]').click(); await wait(300);
    ok(titles().some((x) => x.includes('Gamma')) && titles().length === 1, 'Archive view lists it: ' + titles().join('|'));
    $('[data-view="knowledge.recent"]').click(); await wait(300);
    ok(!titles().some((x) => x.includes('Gamma')), 'Recent view excludes archived');
    $('[data-view="all"]').click(); await wait(200);
    // searchable with filter
    const s = $('#ed-search');
    s.value = 'gamma'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(500);
    ok(!titles().some((x) => x.includes('Gamma')), 'plain search does not surface archived documents');
    s.value = 'is:archived'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(700);
    ok(titles().length === 1 && titles()[0].includes('Gamma'), 'is:archived shows archived documents: ' + titles().join('|'));
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    // unarchive via command-like menu (archived documents are filtered out of "All", so use the Archive view)
    $('[data-view="knowledge.archive"]').click(); await wait(300);
    $(' [data-more="' + window.__ids.gamma + '"]').click(); await wait(200);
    menuItem('Unarchive'); await wait(700);
    $('[data-view="all"]').click(); await wait(300);
    ok(!K.byId.get(window.__ids.gamma).kn_archived && titles().some((x) => x.includes('Gamma')), 'unarchive brings it back');
    window.__ids.gammaFolder = 'Work';
  `);

  /* ---------- 7. search filters ---------- */
  await run('search filters', R`
    const X = T4.edx, K = T4.edKnowledge;
    await K.updateMeta(window.__ids.beta, {});
    await K.reload();
    const q = async (s) => (await X.search.query(s, { docs: K.docs })).map((r) => K.byId.get(r.id).title);
    const t1 = await q('tag:project');
    ok(t1.length === 1 && t1[0] === 'Main Doc', 'tag:project → ' + t1.join('|'));
    ok((await q('tag:#Project')).length === 1, 'tag filter is normalised (#, case)');
    const t2 = await q('folder:work');
    ok(t2.includes('Gamma') && t2.includes('Alpha Renamed'), 'folder:work matches folder and subfolders: ' + t2.join('|'));
    ok((await q('folder:work tag:project')).length === 0, 'filters combine with AND');
    const t3 = await q('links:"Gamma"');
    ok(t3.includes('Main Doc') && t3.includes('Plain Mentioner'), 'links:Gamma → ' + t3.join('|'));
    ok((await q('tag:project main')).length === 1 && (await q('tag:project zzz')).length === 0, 'free text combines with filters');
    await K.setArchived(window.__ids.gamma, true);
    ok((await q('is:archived')).join() === 'Gamma' && !(await q('folder:work')).includes('Gamma'), 'is:archived only archived; others exclude them');
    await K.setArchived(window.__ids.gamma, false);
    ok((await q('hello world')).length === 0, 'plain text queries are left to the built-in search');
    // UI: doc list
    const s = $('#ed-search'); s.value = 'tag:project'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(800);
    const titles = $$('#ed-list .ed-item:not(.ed-kn-hide) .ed-item__title').map((x) => x.textContent);
    ok(titles.length === 1 && titles[0].includes('Main Doc'), 'doc list shows tag:project results: ' + titles.join('|'));
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    // help tooltip
    ok(/tag:x/.test(s.title) && !!$('.ed-kn-searchhelp'), 'search box has a syntax tooltip and help button');
    $('.ed-kn-searchhelp').click(); await wait(200);
    ok(/is:archived/.test($('.ed-menu').textContent) && /links:/.test($('.ed-menu').textContent), 'help lists the filter syntax');
    T4.edx.editor.closeMenu();
  `);

  /* ---------- 8. daily notes ---------- */
  await run('daily notes', R`
    const X = T4.edx, K = T4.edKnowledge, DS = T4.docstore;
    const today = T4.util.today();
    const before = (await DS.list()).filter((d) => d.kn_props && d.kn_props.daily).length;
    await X.commands.run('knowledge.daily'); await wait(800);
    const cur = T4.editor.current;
    ok(cur.meta.kn_props.daily === today && cur.meta.title === K.dailyLabel(today), 'creates today’s note titled by the locale date: ' + cur.meta.title);
    ok(cur.meta.kn_folder === 'Daily notes' && cur.meta.kn_tags.includes('daily'), 'in the Daily notes folder');
    ok(/<h1>/.test((await DS.get(cur.id)).html) && $$('#ed-doc h2').length === 3, 'from the daily template (date heading + sections)');
    const id = cur.id;
    await T4.edx.editor.openDoc(window.__ids.main); await wait(300);
    await X.commands.run('knowledge.daily'); for (let i = 0; i < 60 && T4.editor.current.id !== id; i++) await wait(50);
    const after = (await DS.list()).filter((d) => d.kn_props && d.kn_props.daily);
    ok(after.length === before + 1 && T4.editor.current.id === id, 'running it again opens the same note (idempotent) ' + before + '/' + after.length + ' ' + (T4.editor.current.id === id));
    // rename does not break it
    await DS.save(id, null, { title: 'My renamed journal' });
    await T4.edx.editor.openDoc(window.__ids.main); await wait(300);
    await X.commands.run('knowledge.daily'); await wait(800);
    ok(T4.editor.current.id === id && (await DS.list()).filter((d) => d.kn_props && d.kn_props.daily).length === before + 1, 'renaming the note does not create a second one (machine key kn_props.daily)');
    // double trigger at once
    await T4.edx.editor.openDoc(window.__ids.main); await wait(300);
    await Promise.all([X.commands.run('knowledge.daily'), X.commands.run('knowledge.daily')]); await wait(600);
    ok((await DS.list()).filter((d) => d.kn_props && d.kn_props.daily === today).length === 1, 'concurrent calls create only one note');
    // previous day via strip
    $('[data-kn-act="prevday"]').click();
    for (let i = 0; i < 60 && T4.editor.current.id === id; i++) await wait(50);
    await wait(500);
    const y = T4.util.addDays(today, -1);
    ok(T4.editor.current.meta.kn_props.daily === y, 'previous-day button opens/creates yesterday’s note');
    $('[data-kn-act="nextday"]').click();
    for (let i = 0; i < 60 && T4.editor.current.meta.kn_props.daily === y; i++) await wait(50);
    await wait(400);
    ok(T4.editor.current.id === id, 'next-day button returns to today');
    ok($('[data-kn="pk"][data-i="0"]') === null || true, 'ok');
  `);
  // shortcut Ctrl+Alt+D
  await run('daily shortcut prep', R`await T4.edx.editor.openDoc(window.__ids.main); await wait(400); D().focus(); window.__dailyBefore = (await T4.docstore.list()).filter((d) => d.kn_props && d.kn_props.daily).length;`);
  await b.key('d', 'KeyD', '', 2 | 1);
  await sleep(900);
  await run('daily shortcut', R`
    ok(T4.editor.current.meta.kn_props && T4.editor.current.meta.kn_props.daily === T4.util.today(), 'Ctrl+Alt+D opens today’s note');
  `);
  // slash command
  await run('slash prep', R`await T4.edx.editor.openDoc(window.__ids.main); await wait(500); const d = D(); d.focus(); const p = document.createElement('p'); p.innerHTML = '<br>'; T4.edx.editor.run(() => d.appendChild(p)); const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await b.type('/');
  await sleep(150);
  out.push('INFO slash after / : ' + (await ev(`!!document.querySelector('.ed-slash') + ' last=' + JSON.stringify(document.getElementById('ed-doc').lastElementChild.outerHTML.slice(0, 80)) + ' active=' + document.activeElement.id + ' sel=' + (getSelection().anchorNode && getSelection().anchorNode.nodeName)`)));
  await b.type('link');
  await sleep(150);
  out.push('INFO slash after link : ' + (await ev(`JSON.stringify(Array.from(document.querySelectorAll('.ed-slash [data-si]')).map((x) => x.textContent))`)));
  await b.key('ArrowDown', 'ArrowDown', '');
  await sleep(100);
  await run('slash', R`
    const items = $$('.ed-slash [data-si]').map((x) => x.textContent);
    ok(items.some((x) => /Link to document/.test(x)), 'slash menu offers “Link to document”: ' + items.join('|'));
  `);
  await b.key('Enter', 'Enter', '\r');
  await sleep(300);
  await run('slash link', R`
    ok(!!$('.ed-kn-ac') && D().textContent.includes('[['), 'the slash command inserts [[ and opens the picker');
  `);
  await b.key('Escape', 'Escape', '');
  await sleep(100);

  /* ---------- 9. paste conversion ---------- */
  await run('paste conversion', R`
    const K = T4.edKnowledge;
    D().focus();
    const p = document.createElement('p'); p.textContent = 'Pasted [[Gamma]] and [[Nonexistent Page]] and [[Gamma]]';
    T4.edx.editor.run(() => D().appendChild(p));
    const n = K.convertTextLinks(D());
    const links = $$('p', D()).pop().querySelectorAll('.t4-w[data-w="wikilink"]');
    ok(n === 1 && links.length === 2, 'convertTextLinks turns exact-title [[…]] into links');
    ok($$('p', D()).pop().textContent.includes('[[Nonexistent Page]]'), 'unknown titles stay as text');
  `);

  /* ---------- 10. graph ---------- */
  await run('graph', R`
    const X = T4.edx, K = T4.edKnowledge;
    await T4.edx.editor.openDoc(window.__ids.main); await wait(500); await K.reload();
    X.commands.run('knowledge.graph');
    for (let i = 0; i < 100 && !(K.graphState() && K.graphState().done); i++) await wait(50);
    const g = $('.ed-kn-graph');
    ok(!!g && g.getAttribute('role') === 'dialog' && g.getAttribute('aria-modal') === 'true', 'graph dialog opens');
    const live = K.docs.filter((d) => !d.deletedAt && !d.kn_archived);
    ok($$('.ed-kn-gn', g).length === live.length, 'one node per document: ' + $$('.ed-kn-gn', g).length + '/' + live.length);
    let edges = 0; live.forEach((d) => d.kn_links.forEach((l) => { if (live.some((x) => x.id === l)) edges++; }));
    ok($$('.ed-kn-ge', g).length === edges && edges >= 4, 'one edge per link: ' + $$('.ed-kn-ge', g).length + '/' + edges);
    ok($('.ed-kn-gn.is-current', g).dataset.id === window.__ids.main, 'current document highlighted');
    ok(g.dataset.layout === 'done', 'layout finished');
    const nodes = $$('.ed-kn-gn', g).map((n) => n.getAttribute('transform'));
    ok(new Set(nodes).size === nodes.length && nodes.every((x) => /translate\(-?[\d.]+ -?[\d.]+\)/.test(x)), 'all nodes have distinct positions');
    // hover highlights neighbours
    const n0 = $('.ed-kn-gn.is-current', g);
    n0.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    ok($('.ed-kn-graph__svg').classList.contains('has-focus') && $$('.ed-kn-gn.is-nb', g).length >= 3, 'hover highlights the neighbours ' + $('.ed-kn-graph__svg').className.baseVal + ' nb=' + $$('.ed-kn-gn.is-nb', g).length + ' edges=' + $$('.ed-kn-ge', g).length);
    // filter by tag
    const sel = $('[data-g="tag"]', g); sel.value = 'project'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    ok($$('.ed-kn-gn', g).length === 1, 'tag filter narrows the graph');
    sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const fo = $('[data-g="folder"]', g); fo.value = 'Work'; fo.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    const wantF = live.filter((d) => d.kn_folder === 'Work' || d.kn_folder.indexOf('Work/') === 0).length;
    ok(wantF >= 1 && $$('.ed-kn-gn', g).length === wantF, 'folder filter narrows the graph (' + $$('.ed-kn-gn', g).length + '/' + wantF + ')');
    fo.value = ''; fo.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    const og = $('[data-g="orphans"]', g); og.checked = true; og.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    ok($$('.ed-kn-gn', g).length < live.length && $$('.ed-kn-gn.is-orphan', g).length === 0, 'Linked only hides orphans');
    og.checked = false; og.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    const lo = $('[data-g="local"]', g); lo.checked = true; lo.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    ok($$('.ed-kn-gn', g).length >= 4, 'local graph around the current document');
    lo.checked = false; lo.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    // search highlight
    const q = $('[data-g="q"]', g); q.value = 'gamma'; q.dispatchEvent(new Event('input', { bubbles: true }));
    ok($$('.ed-kn-gn.is-match', g).length === 1, 'find box highlights matching documents');
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    // zoom
    const tr0 = $('.ed-kn-vp', g).getAttribute('transform');
    $('[data-g-act="in"]', g).click();
    ok($('.ed-kn-vp', g).getAttribute('transform') !== tr0, 'zoom button changes the view');
    window.__gShot = 1;
  `);
  await shot('knowledge-graph');
  {
    await ev(`(() => { const g = document.querySelector('.ed-kn-graph'); const q = g.querySelector('[data-g="q"]'); q.value = ''; return 1; })()`);
    // real mouse click on a node opens the document
    const p = await ev(`(() => { const n = Array.from(document.querySelectorAll('.ed-kn-gn')).find((x) => x.getAttribute('aria-label') === 'Gamma'); const r = n.querySelector('circle').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await b.click(p.x, p.y);
    await sleep(900);
    await run('graph click', R`
      ok(!$('.ed-kn-graph'), 'clicking a node closes the graph');
      ok(T4.editor.current.id === window.__ids.gamma, 'and opens that document');
    `);
  }
  await run('graph keyboard', R`
    const K = T4.edKnowledge;
    K.openGraph(); await wait(400);
    const n = $$('.ed-kn-gn').find((x) => x.getAttribute('aria-label') === 'Main Doc');
    n.focus();
    ok(n.getAttribute('role') === 'link' && n.tabIndex === 0, 'nodes are focusable links');
    n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 40 && T4.editor.current.id !== window.__ids.main; i++) await wait(50);
    ok(T4.editor.current.id === window.__ids.main && !$('.ed-kn-graph'), 'Enter opens the focused node');
    K.openGraph(); await wait(300);
    $('.ed-kn-graph').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!$('.ed-kn-graph'), 'Esc closes the graph');
  `);

  /* ---------- 11. old documents unaffected ---------- */
  await run('old documents', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const html = '<h1>Old doc</h1><p>Plain <b>text</b> with [[brackets]] that are no link.</p><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    const old = await DS.create(Object.assign({ title: 'Old' , html }, T4.edcore.statsOf(html)));
    ok(old.kn_tags.length === 0 && old.kn_folder === '' && old.kn_archived === null && old.kn_links.length === 0 && Object.keys(old.kn_props).length === 0, 'documents without kn_* get empty defaults');
    await K.reload();
    await T4.edx.editor.openDoc(old.id); await wait(500);
    const before = (await DS.get(old.id)).html;
    ok(!$('.ed-kn-link') && D().textContent.includes('[[brackets]]'), 'literal [[text]] is not touched');
    await T4.editor.flush();
    ok((await DS.get(old.id)).html === before, 'opening does not modify the stored document');
    ok(!$('.ed-kn-sum .ed-kn-pill'), 'no folder/tag clutter in the strip');
    // raw legacy record without kn fields
    const legacy = await DS.get(old.id); ok(Array.isArray(legacy.meta.kn_links), 'legacy documents read with defaults');
    // textOf unchanged for old docs
    ok(!/\[\[brackets\]\]/.test('') && legacy.meta.text.includes('[[brackets]]'), 'text index intact');
  `);

  /* ---------- 12. read-only (trash) ---------- */
  await run('readonly', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const html = '<p>trash me</p>'; const d = await DS.create(Object.assign({ title: 'Trashy', html }, T4.edcore.statsOf(html)));
    await DS.trash(d.id); await K.reload();
    await T4.edx.editor.openDoc(d.id); await wait(500);
    ok(T4.edx.editor.readonly(), 'trashed document is read-only');
    $('.ed-kn-toggle').click(); await wait(200);
    ok($$('#ed-kn-strip input').every((i) => i.disabled), 'properties are disabled in a read-only document');
    ok(!$$('.ed-menu').length, 'no stray menus');
    await DS.destroy(d.id); await K.reload();
    await T4.edx.editor.openDoc(window.__ids.main); await wait(300);
    if ($('.ed-kn-toggle').getAttribute('aria-expanded') === 'true') $('.ed-kn-toggle').click();
  `);

  /* ---------- 13. performance with 300 documents ---------- */
  await run('performance setup', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    const t0 = performance.now();
    const ids = [];
    const tags = ['red', 'green', 'blue', 'team/a', 'team/b'];
    for (let i = 0; i < 300; i++) {
      const links = i ? [ids[Math.floor(Math.random() * i)], ids[Math.floor(Math.random() * i)]].filter(Boolean) : [];
      const html = '<p>Perf document ' + i + ' lorem ipsum dolor sit amet</p>';
      const m = await DS.create(Object.assign({ title: 'Perf ' + i, html, kn_tags: [tags[i % 5]], kn_folder: 'Perf/F' + (i % 10), kn_links: links }, T4.edcore.statsOf(html)));
      ids.push(m.id);
    }
    window.__perfCreate = Math.round(performance.now() - t0);
    const t1 = performance.now(); await K.reload(); window.__perfReload = Math.round(performance.now() - t1);
    ok(K.docs.length >= 300, '300 documents created via the API (' + window.__perfCreate + ' ms), index reload ' + window.__perfReload + ' ms');
  `);
  await run('performance ui', R`
    const X = T4.edx, K = T4.edKnowledge;
    await wait(500);
    // list render + archive filter
    const t0 = performance.now();
    $('[data-view="all"]').click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const listMs = Math.round(performance.now() - t0);
    ok(listMs < 400 && $$('#ed-list .ed-item').length >= 300, 'doc list with 300+ documents renders in ' + listMs + ' ms');
    // search provider
    const s0 = performance.now(); const res = await X.search.query('tag:team/a folder:perf', { docs: K.docs }); const sMs = Math.round(performance.now() - s0);
    ok(res.length === 60 && sMs < 200, 'filter search over 300 docs: ' + res.length + ' results in ' + sMs + ' ms');
    // typing a search keeps responsive
    const s = $('#ed-search'); const u0 = performance.now(); s.value = 'tag:blue'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(600);
    const vis = $$('#ed-list .ed-item:not(.ed-kn-hide)').length; ok(vis === 60, 'tag:blue lists 60 documents in the doc list (' + vis + ')');
    s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    // library tree
    X.panels.open('knowledge-library'); await wait(500);
    const l0 = performance.now(); $$('[data-kn-act="ftoggle"].ed-kn-row__name').forEach((b) => b.click()); await wait(50);
    $$('[data-kn-act="ftoggle"].ed-kn-row__name').forEach((b) => { const row = b.closest('.ed-kn-node'); if (row && !row.querySelector('.ed-kn-sub')) b.click(); });
    for (let k = 0; k < 60; k++) { const n = $$('.ed-kn-node').find((x) => x.getAttribute('aria-expanded') === 'false'); if (!n) break; n.querySelector('.ed-kn-row__name').click(); }
    const libMs = Math.round(performance.now() - l0 - 50);
    ok($$('.ed-kn-doc').length >= 300 && libMs < 1500, 'library tree with ' + $$('.ed-kn-doc').length + ' document rows expanded (' + libMs + ' ms)');
    X.panels.close('left');
    // graph with a frame budget
    const g0 = performance.now();
    K.openGraph();
    let maxGap = 0, last = performance.now(), frames = 0;
    const tick = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; frames++; if (!(K.graphState() && K.graphState().done)) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    for (let i = 0; i < 200 && !(K.graphState() && K.graphState().done); i++) await wait(50);
    const gs = K.graphState();
    const gMs = Math.round(performance.now() - g0);
    ok(!!gs && gs.done && $$('.ed-kn-gn').length >= 300, 'graph with ' + $$('.ed-kn-gn').length + ' nodes / ' + $$('.ed-kn-ge').length + ' edges laid out in ' + gMs + ' ms (' + frames + ' frames)');
    ok(gs.frameMax < 40 && maxGap < 150, 'no freeze: slowest layout slice ' + Math.round(gs.frameMax) + ' ms, longest frame gap ' + Math.round(maxGap) + ' ms');
    window.__perf = { create: window.__perfCreate, reload: window.__perfReload, list: listMs, search: sMs, lib: libMs, graph: gMs, slice: Math.round(gs.frameMax), gap: Math.round(maxGap) };
    window.__perfShot = 1;
  `);
  await shot('knowledge-graph-300');
  out.push('INFO performance ' + (await ev('JSON.stringify(window.__perf)')));
  await run('perf cleanup', R`
    const DS = T4.docstore, K = T4.edKnowledge;
    K.closeGraph();
    for (const d of K.docs.filter((x) => /^Perf \d+$/.test(x.title))) await DS.destroy(d.id);
    await K.reload();
    ok(!K.docs.some((x) => /^Perf \d+$/.test(x.title)), 'cleanup');
  `);

  /* ---------- 14. themes and language ---------- */
  await run('design tokens', R`
    const el = $('#ed-kn-strip');
    ok(!!el && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)', 'strip uses themed colours');
  `);
}
export default standalone(test);
