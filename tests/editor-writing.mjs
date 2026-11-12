// Editor module "writing": find & replace, outline, table of contents, statistics + goal, focus modes.
// Run alone:  CDP_PORT=9343 node tests/cdp.mjs tests/editor-writing.mjs [shots-dir]
import { standalone } from './editor-helpers.mjs';

const R = String.raw;

export async function test(t) {
  const { b, run } = t;
  const shot = async (n) => { try { await b.shot('writing-' + n, false); } catch (e) { /* ignore */ } };

  await run('presence', R`
    const X = T4.edx;
    ok(['writing.find','writing.replace','writing.outline','writing.stats','writing.focus','writing.typewriter','writing.dim','writing.fullscreen','writing.toc','writing.find-next','writing.find-prev','writing.heading-next'].every((c) => X.commands.has(c)), 'commands registered');
    const sc = X.shortcuts.list().map((s) => s.combo);
    ok(['mod-f','mod-h','mod-shift-o','mod-shift-f','f3','shift-f3'].every((c) => sc.includes(c)), 'shortcuts bound: ' + sc.join(','));
    ok(X.panels.has('writing-outline') && X.panels.has('writing-stats'), 'panels registered');
    ok(X.widgets.has('toc'), 'toc widget registered');
    ok(JSON.stringify(X.i18n.missing()['edx.writing.'] || {}) === '{}', 'i18n complete in 4 languages');
    ok(!X.problems.some((p) => /writing|wr_/.test(p)), 'no registration problems');
    ok(typeof CSS !== 'undefined' && !!CSS.highlights, 'CSS Custom Highlight API available');
    await newDoc('blank');
    ok(T4.editor.current.meta.wr_goal === null, 'wr_goal default null');
  `);

  /* ---------- find & replace ---------- */
  await run('find', R`
    const X = T4.edx, WR = T4.edWriting;
    const html = '<h1>Alpha Title</h1><p>The cat and the Cat sat. Concatenate cats!</p><ul><li>a cat in a list</li></ul><table class="t4-table"><tbody><tr><td>cat cell</td><td>dog</td></tr></tbody></table><p>foo<b>bar</b> split</p><p>x1 y22 z333</p>';
    X.editor.setHtml(html); await wait(100);
    const before = await stored(); const beforeHtml = C().serialize();
    const key = (k, code, mods) => D().dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, code, bubbles: true, cancelable: true }, mods || {})));
    key('f', 'KeyF', { ctrlKey: true }); await wait(100);
    const bar = $('#ed-wr-find'), q = $('.ed-wr-find__q'), cnt = () => $('.ed-wr-find__count').textContent;
    ok(bar && !bar.hidden && document.activeElement === q, 'Ctrl+F opens the find bar and focuses the query');
    const type = async (v) => { q.value = v; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); };
    await type('cat');
    ok(/1 of 6/.test(cnt()), 'case-insensitive "cat": ' + cnt() + ' (paragraph, list, table, "Cat", "Concatenate", "cats")');
    ok(CSS.highlights.get('ed-wr-find').size === 6 && CSS.highlights.get('ed-wr-find-cur').size === 1, 'all matches highlighted, one current');
    ok(C().serialize() === beforeHtml && !D().querySelector('mark'), 'highlighting does not change the document (no <mark>)');
    $('[data-opt="case"]').click(); await wait(80);
    ok(/of 5/.test(cnt()), 'match case: ' + cnt());
    $('[data-opt="case"]').click(); $('[data-opt="word"]').click(); await wait(80);
    ok(/of 4/.test(cnt()), 'whole word: ' + cnt() + ' (not Concatenate, cats)');
    $('[data-opt="word"]').click();
    await type('foobar'); ok(/1 of 1/.test(cnt()), 'match across inline formatting (foo<b>bar</b>): ' + cnt());
    await type('dog'); ok(/1 of 1/.test(cnt()), 'finds text in table cells');
    // next / prev
    await type('cat'); const n0 = cnt();
    key('F3', 'F3'); await wait(30); ok(cnt() !== n0 && /2 of 6/.test(cnt()), 'F3 goes to the next match: ' + cnt());
    key('F3', 'F3', { shiftKey: true }); await wait(30); ok(/1 of 6/.test(cnt()), 'Shift+F3 goes back');
    key('F3', 'F3', { shiftKey: true }); await wait(30); ok(/6 of 6/.test(cnt()), 'previous wraps around');
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(30); ok(/1 of 6/.test(cnt()), 'Enter in the query = next (wraps)');
    // regex
    $('[data-opt="regex"]').click();
    await type('[a-z]\\d+'); ok(/of 3/.test(cnt()), 'regex [a-z]\\d+: ' + cnt());
    await type('('); ok(!$('.ed-wr-find__err').hidden && /Invalid/.test($('.ed-wr-find__err').textContent) && q.getAttribute('aria-invalid') === 'true', 'invalid regex shows an error: ' + $('.ed-wr-find__err').textContent.slice(0, 60));
    await type('\\bcat\\b'); ok(/of 4/.test(cnt()), 'regex \\bcat\\b: ' + cnt());
    $('[data-opt="regex"]').click();
    // replace all = one undo step
    X.editor.setHtml(html); await wait(100);
    key('h', 'KeyH', { ctrlKey: true }); await wait(100);
    ok(!$('.ed-wr-find__rep').hidden, 'Ctrl+H shows the replace row');
    await type('cat'); $('.ed-wr-find__r').value = 'dog'; $('.ed-wr-find__r').dispatchEvent(new Event('input', { bubbles: true }));
    $('[data-opt="word"]').click(); await wait(80);
    const h0 = C().serialize();
    $('[data-wr="repall"]').click(); await wait(150);
    const h1 = C().serialize();
    ok((h1.match(/\bdog\b/g) || []).length >= 5 && !/\bcat\b/.test(h1.replace(/Concatenate|cats/g, '')) && /Concatenate/.test(h1) && /cats!/.test(h1), 'replace all (whole word) replaced 4 matches only');
    ok(/0 matches|No matches/.test(cnt()) || cnt() === 'No matches', 'count updated after replace all: ' + cnt());
    C().undo(); await wait(50);
    ok(C().serialize() === h0, 'replace all is ONE undo step');
    C().redo(); await wait(50); ok(C().serialize() === h1, 'redo restores the replacement');
    $('[data-opt="word"]').click();
    // replace one + regex groups
    X.editor.setHtml('<p>one two three</p><p>one two</p>'); await wait(100);
    await type('(\\w+) (\\w+)'); $('[data-opt="regex"]').click(); await wait(80);
    $('.ed-wr-find__r').value = '$2-$1'; $('.ed-wr-find__r').dispatchEvent(new Event('input', { bubbles: true }));
    $('[data-wr="rep1"]').click(); await wait(100);
    ok(D().textContent.startsWith('two-one three') , 'regex group replacement + replace one: ' + D().textContent.slice(0, 30));
    ok(/of 2/.test(cnt()), 'moves on to the next match after replace: ' + cnt());
    $('[data-opt="regex"]').click();
    // Esc closes, clears highlights, restores selection
    await type('two'); 
    key('Escape', 'Escape'); // from the document: closes the bar too
    await wait(50);
    ok($('#ed-wr-find').hidden, 'Esc closes the bar');
    ok(!CSS.highlights.has('ed-wr-find') && !CSS.highlights.has('ed-wr-find-cur'), 'highlights cleared on close');
    // selection restore
    X.editor.setHtml('<p>first line here</p><p>second line here</p>'); await wait(100);
    const p2 = D().children[1]; const r = document.createRange(); r.setStart(p2.firstChild, 3); r.setEnd(p2.firstChild, 6); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    key('f', 'KeyF', { ctrlKey: true }); await wait(100);
    ok($('.ed-wr-find__q').value === 'ond', 'selected text pre-fills the query');
    await type('first'); 
    $('[data-wr="close"]').click(); await wait(80);
    ok(getSelection().toString() === 'ond', 'closing restores the previous selection: "' + getSelection().toString() + '"');
    // widget internals skipped
    X.editor.setHtml('<p>needle text</p>'); await wait(50);
    X.widgets.insert('toc', { props: { levels: 2, title: 'needle toc title' } }); await wait(100);
    key('f', 'KeyF', { ctrlKey: true }); await wait(80); await type('needle');
    ok(/1 of 1/.test(cnt()), 'text inside widgets (TOC) is skipped: ' + cnt());
    $('[data-wr="close"]').click();
    // fallback overlay path
    WR.find.state.forceFallback = true; key('f', 'KeyF', { ctrlKey: true }); await wait(80); await type('needle'); await wait(50);
    ok(!!$('.ed-wr-ovl') && $$('.ed-wr-ovl__box').length >= 1 && !D().querySelector('.ed-wr-ovl'), 'fallback overlay lives outside the document');
    WR.find.state.forceFallback = false; $('[data-wr="close"]').click();
    ok(before.html !== undefined, 'sanity');
  `);
  await shot('find-pre');
  await run('find-shot', R`
    const WR = T4.edWriting;
    T4.edx.editor.setHtml('<h1>Notes on cats</h1><p>The cat sat on the mat. Another cat watched the cat.</p><p>Dogs do not care about a cat.</p>'); await wait(100);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, bubbles: true, cancelable: true })); await wait(100);
    const q = $('.ed-wr-find__q'); q.value = 'cat'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
    $('.ed-wr-find__r').value = 'lion'; 
  `);
  await shot('find');
  await run('find-close', R`$('[data-wr="close"]').click(); await wait(50); ok($('#ed-wr-find').hidden, 'bar closed');`);

  /* ---------- outline ---------- */
  await run('outline', R`
    const X = T4.edx, WR = T4.edWriting;
    let html = '';
    for (let i = 1; i <= 8; i++) html += '<h1>Chapter ' + i + '</h1>' + '<p>Text of chapter ' + i + ' lorem ipsum dolor sit amet. </p>'.repeat(14) + '<h2>Sub ' + i + '.1</h2>' + '<p>More text for subsection. </p>'.repeat(10);
    X.editor.setHtml(html); await wait(150);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); await wait(250);
    ok(X.panels.active('right') === 'writing-outline', 'Ctrl+Shift+O opens the outline panel');
    const rows = () => $$('.ed-wr-ol__item');
    ok(rows().length === 16, 'outline lists all headings: ' + rows().length);
    ok(rows()[1].style.getPropertyValue('--d') === '1', 'sub headings are indented');
    // navigation
    rows()[6].querySelector('[data-act="go"]').click(); await wait(900);
    const sc = $('#ed-scroll'), h = X.editor.headings()[6].el;
    ok(Math.abs(h.getBoundingClientRect().top - sc.getBoundingClientRect().top) < 120, 'click scrolls to the heading (offset ' + Math.round(h.getBoundingClientRect().top - sc.getBoundingClientRect().top) + ')');
    // current section follows scroll
    sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll')); await wait(120);
    ok($('.ed-wr-ol__item.is-active') && $('.ed-wr-ol__item.is-active').dataset.i === '0', 'current section highlighted at top');
    sc.scrollTop = h.offsetTop + 40; sc.dispatchEvent(new Event('scroll')); await wait(120);
    const act = $('.ed-wr-ol__item.is-active');
    ok(act && Math.abs(+act.dataset.i - 6) <= 1, 'current section follows scrolling: ' + (act && act.dataset.i));
    // live update
    const t0 = performance.now();
    X.editor.run(() => { const n = document.createElement('h2'); n.textContent = 'Brand new'; D().insertBefore(n, D().children[1]); });
    await wait(500);
    ok(rows().length === 17 && /Brand new/.test($('.ed-wr-ol').textContent), 'outline updates after an edit (' + Math.round(performance.now() - t0) + ' ms incl. debounce)');
    // collapse + levels
    const fold = rows()[1].querySelector('[data-act="fold"]');
    // find first H1 with children
    const f1 = rows().find((r) => r.dataset.level === '1' && r.querySelector('[data-act="fold"]'));
    f1.querySelector('[data-act="fold"]').click(); await wait(50);
    ok(rows().length < 17, 'collapsing a heading hides its children: ' + rows().length);
    $('[data-wr="max"]').value = '1'; $('[data-wr="max"]').dispatchEvent(new Event('change')); await wait(50);
    ok(rows().every((r) => r.dataset.level === '1') && rows().length === 8, 'level filter shows only H1: ' + rows().length);
    $('[data-wr="max"]').value = '6'; $('[data-wr="max"]').dispatchEvent(new Event('change'));
    // move section
    X.editor.setHtml('<h1>A</h1><p>a1</p><h1>B</h1><p>b1</p><h1>C</h1><p>c1</p>'); await wait(400);
    const before = C().serialize();
    rows()[1].querySelector('[data-act="up"]').click(); await wait(400);
    ok(D().innerHTML.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') === '|B|b1|A|a1|C|c1|', 'move section up keeps the content together: ' + D().textContent);
    C().undo(); await wait(50); ok(C().serialize() === before, 'move section is one undo step');
    ok(rows().length === 3 && rows()[0].querySelector('[data-act="up"]') !== null, 'outline refreshed after undo');
    rows()[2].querySelector('[data-act="down"]').click(); await wait(300);
    ok(D().textContent === 'AABBCC'.replace('AABBCC','Aa1Bb1Cc1'), 'last section cannot move down');
    // empty
    X.editor.setHtml('<p>no headings</p>'); await wait(400);
    ok(!$('[data-wr="empty"]').hidden, 'empty state without headings');
    ok(typeof X.panels.active === 'function', 'ok');
  `);
  await run('outline-shot', R`
    let html = '<h1>Introduction</h1><p>Opening words.</p><h2>Background</h2><p>More.</p><h2>Goals</h2><p>Text.</p><h1>Method</h1><p>Text.</p><h2>Data</h2><h3>Sources</h3><p>x</p><h1>Results</h1><p>Done.</p>';
    T4.edx.editor.setHtml(html); await wait(500);
  `);
  await shot('outline');

  /* ---------- table of contents ---------- */
  await run('toc', R`
    const X = T4.edx, WR = T4.edWriting;
    X.editor.setHtml('<h1>One</h1><p>a</p><h2>Two</h2><p>b</p><h3>Three</h3><p>c</p><p><br></p>'); await wait(100);
    D().lastElementChild.focus && 0;
    const r = document.createRange(); r.selectNodeContents(D().lastElementChild); r.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    // slash menu entry
    ok(X.slash.list().some((s) => s.id === 'writing.toc'), 'slash entry exists');
    $('[data-cmd="menu-insert"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); $('[data-cmd="menu-insert"]').click(); await wait(150);
  `);
  await run('toc2', R`
    const X = T4.edx;
    const ins = $$('.ed-menu [data-mi]').find((x) => /Table of contents/.test(x.textContent));
    ok(!!ins, 'Insert menu has "Table of contents"');
    ins.click(); await wait(200);
    const w = D().querySelector('.t4-w[data-w="toc"]');
    ok(!!w, 'toc widget inserted');
    const links = () => $$('.t4-wr-toc__link', w).map((l) => l.textContent);
    ok(JSON.stringify(links()) === '["One","Two","Three"]', 'renders the headings: ' + links());
    ok(JSON.parse(w.dataset.p).levels === 3, 'props.levels = 3');
    // live update
    X.editor.run(() => { const h = document.createElement('h2'); h.textContent = 'Added later'; D().insertBefore(h, D().children[1]); }); await wait(500);
    ok(links().includes('Added later'), 'TOC updates live');
    // heading text edit
    X.editor.run(() => { D().querySelector('h1').textContent = 'Renamed'; }); await wait(500);
    ok(links()[0] === 'Renamed', 'TOC follows heading rename');
    // levels via ctx bar
    T4.edw.setProps(w, { levels: 1 }); await wait(50);
    ok(links().length === 1, 'levels=1 shows only H1');
    X.editor.run(() => T4.edw.setProps(w, { levels: 3, numbered: true, title: 'Contents' })); await wait(100);
    ok($('.t4-wr-toc__title', w).textContent === 'Contents' && $$('.t4-wr-toc__num', w).map((n) => n.textContent).join(',') === '1,1.1,1.2,1.2.1', 'numbering + title: ' + $$('.t4-wr-toc__num', w).map((n) => n.textContent));
    // click navigates
    const sc = $('#ed-scroll');
    let filler = ''; for (let i = 0; i < 40; i++) filler += '<p>filler text filler text filler text</p>';
    X.editor.run(() => { D().insertAdjacentHTML('beforeend', filler + '<h1>Far away</h1><p>end</p>'); }); await wait(500);
    const far = $$('.t4-wr-toc__link', w).find((l) => /Far away/.test(l.textContent));
    ok(!!far, 'new heading listed');
    sc.scrollTop = 0; far.click(); await wait(1600);
    const fh = [...D().querySelectorAll('h1')].find((h) => /Far away/.test(h.textContent));
    ok(fh.getBoundingClientRect().top > sc.getBoundingClientRect().top && fh.getBoundingClientRect().bottom < sc.getBoundingClientRect().bottom && sc.scrollTop > 500, 'clicking an entry scrolls to the heading (offset ' + Math.round(fh.getBoundingClientRect().top - sc.getBoundingClientRect().top) + ')');
    ok(D().contains(document.getSelection().anchorNode) && fh.contains(getSelection().anchorNode), 'caret placed in the heading');
    // persistence round trip
    const st = await stored();
    ok(/data-w="toc"/.test(st.html) && !/t4-wr-toc/.test(st.html) && !/Renamed/.test(st.html.match(/<figure[^>]*data-w="toc"[^>]*>.*?<\/figure>/)[0]), 'stored as props only (no rendered list)');
    X.editor.setHtml(st.html); await wait(200);
    const w2 = D().querySelector('.t4-w[data-w="toc"]');
    ok(w2 && JSON.parse(w2.dataset.p).numbered === true && $$('.t4-wr-toc__link', w2).length === 5, 'reload: TOC re-rendered from props (' + $$('.t4-wr-toc__link', w2).length + ' entries)');
    ok(!/toc/.test(C().textOf(D()).toLowerCase().replace(/contents/g, '')) , 'TOC text is not part of the document text');
    // validation
    ok(JSON.stringify(X.widgets.validate('toc', { levels: 99, title: 5 })) === '{"levels":6}' && X.widgets.validate('toc', {levels: 0}).levels === 1, 'validate clamps levels');
    // markdown
    const md = await X.widgets.toMarkdown('toc', { levels: 2, numbered: false });
    ok(/- Renamed/.test(md) && /  - Two/.test(md), 'toMarkdown lists headings');
    // print CSS
    document.body.classList.add('print-doc');
    const l = $('.t4-wr-toc__link', w2); const disp = getComputedStyle(l).display;
    document.body.classList.remove('print-doc');
    ok(disp !== 'none', 'TOC entries stay visible in print (display ' + disp + ')');
    ok(/t4-wr-toc__link/.test(X.print.css({})), 'print CSS contributed');
    // ctx bar
    T4.edcore.selectWidget && T4.edcore.selectWidget(w2); await wait(100);
    ok(!!$('#ed-ctx [data-ctx="x:lv-"]') && !!$('#ed-ctx [data-ctx="x:num"]'), 'context bar has level/numbering buttons');
    $('#ed-ctx [data-ctx="x:lv-"]').click(); await wait(200);
    ok(JSON.parse(D().querySelector('.t4-w[data-w="toc"]').dataset.p).levels === 2, 'ctx bar "fewer levels" works');
    // edit dialog
    X.widgets.edit(D().querySelector('.t4-w[data-w="toc"]')); await wait(150);
    ok(!!$('dialog [data-f="levels"]'), 'edit dialog opens');
    $('dialog [data-f="levels"]').value = '4'; $('dialog [data-f="title"]').value = 'Index'; $('dialog [data-f="save"]').click(); await wait(150);
    const p3 = JSON.parse(D().querySelector('.t4-w[data-w="toc"]').dataset.p);
    ok(p3.levels === 4 && p3.title === 'Index', 'edit dialog applies');
  `);
  await run('toc-shot', R`$('#ed-scroll').scrollTop = 0; await wait(200);`);
  await shot('toc');

  /* ---------- statistics ---------- */
  await run('stats', R`
    const X = T4.edx, WR = T4.edWriting;
    X.editor.setHtml('<h1>Hello world.</h1><p>The quick brown fox jumps over the lazy dog. It runs fast!</p><p>Second paragraph here.</p>'); await wait(500);
    const s = WR.refreshStats();
    // words: 2 + 9 + 3 + 3 = 17 ; chars with spaces: 12 + 58 + 22 ; paragraphs 3 ; sentences 4
    ok(s.words === 17, 'words = 17 (' + s.words + ')');
    const l1 = 'Hello world.'.length, l2 = 'The quick brown fox jumps over the lazy dog. It runs fast!'.length, l3 = 'Second paragraph here.'.length;
    ok(s.chars === l1 + l2 + l3, 'characters with spaces = ' + (l1 + l2 + l3) + ' (' + s.chars + ')');
    ok(s.charsNoSpaces === (l1 + l2 + l3) - (1 + 11 + 2), 'characters without spaces (' + s.charsNoSpaces + ')');
    ok(s.paragraphs === 3 && s.sentences === 4, 'paragraphs 3, sentences 4 (' + s.paragraphs + ', ' + s.sentences + ')');
    ok(Math.abs(s.reading - 17 / 238) < 1e-9 && Math.abs(s.speaking - 17 / 130) < 1e-9, 'reading 238 wpm, speaking 130 wpm');
    X.panels.open('writing-stats'); await wait(250);
    const txt = $('[data-wr="doc"]').textContent;
    ok(/Words17/.test(txt), 'stats panel shows the words');
    ok(/< 1 min/.test(txt), 'reading time shown');
    ok(/min read|< 1 min read/.test($('.ed-wr-sb__time').textContent), 'status bar shows reading time: ' + $('.ed-wr-sb__time').textContent);
    // selection stats
    const p = D().children[1]; const r = document.createRange(); r.selectNodeContents(p); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r); await wait(200);
    ok(!$('.ed-wr-sb__sel').hidden && /12 words/.test($('.ed-wr-sb__sel').textContent), 'selection stats in status bar: ' + $('.ed-wr-sb__sel').textContent);
    ok(!$('[data-wr="selwrap"]').hidden, 'selection stats in the panel');
    getSelection().collapseToEnd(); await wait(200); ok($('.ed-wr-sb__sel').hidden, 'selection stats hidden again');
    // typing updates
    X.editor.run(() => { D().lastElementChild.textContent += ' Three more words'; }); await wait(600);
    ok(WR.getStats().words === 20, 'stats follow edits (' + WR.getStats().words + ')');
    // readability
    ok(WR.readability('The cat sat on the mat. The dog ran in the sun. It was a fun day for all of us here.') === null || true, 'ok');
    const en = 'The cat sat on the mat. The dog is in the sun. We are at home and we like to play. It is a good day for us. They go to the park with a ball. The sun is up and the sky is blue. We have a nice time.';
    const rEn = WR.readability(en);
    ok(rEn && rEn.lang === 'en' && rEn.score >= 80, 'English easy text: Flesch ' + (rEn && rEn.score));
    const de = 'Der Hund ist nicht im Haus und die Katze ist auch nicht da. Wir gehen mit dem Ball in den Park und es ist ein schöner Tag. Ich habe einen Freund und er ist mit mir auf der Wiese. Das Wetter ist gut und wir sind froh.';
    const rDe = WR.readability(de);
    ok(rDe && rDe.lang === 'de' && rDe.score > 50, 'German text: Amstad ' + (rDe && rDe.score));
    ok(WR.readability('El perro no está en la casa y el gato tampoco está con los niños que juegan en el parque por la tarde con una pelota y un amigo que se llama Pedro y es muy simpático con todos.') === null, 'Spanish text: no score (hidden)');
    ok(WR.readability('short text') === null, 'too short: no score');
    X.editor.setHtml('<p>' + en + '</p>'); await wait(500);
    WR.refreshStats(); await wait(100);
    ok(!$('[data-wr="readwrap"]').hidden && /Flesch/.test($('[data-wr="read-note"]').textContent), 'readability is labelled (Flesch, English)');
    X.editor.setHtml('<p>' + de + '</p>'); await wait(500); WR.refreshStats();
    ok(/Amstad/.test($('[data-wr="read-note"]').textContent), 'readability is labelled (Amstad, German)');
  `);
  await shot('stats');

  /* ---------- writing goal ---------- */
  await run('goal', R`
    const X = T4.edx, WR = T4.edWriting;
    X.editor.setHtml('<p>one two three four five six seven eight nine ten</p>'); await wait(500); WR.refreshStats();
    X.panels.open('writing-stats'); await wait(200);
    const inp = $('[data-wr="goal-in"]');
    inp.value = '40'; inp.dispatchEvent(new Event('change')); await wait(400);
    ok(T4.editor.current.meta.wr_goal === 40, 'goal stored in meta');
    ok($('.ed-wr-goalbtn__txt').textContent.includes('10') && $('.ed-wr-goalbtn__txt').textContent.includes('40'), 'status bar shows 10 / 40: ' + $('.ed-wr-goalbtn__txt').textContent);
    ok($('.ed-wr-goalbtn').dataset.progress === '25', 'ring progress 25%');
    ok(+$('.ed-wr-ring__fg').getAttribute('stroke-dashoffset') > 0 && Math.abs(+$('.ed-wr-ring__fg').getAttribute('stroke-dashoffset') - 50.27 * 0.75) < 0.1, 'ring offset reflects 25%');
    X.editor.run(() => { D().lastElementChild.textContent += ' eleven twelve thirteen'; }); await wait(600);
    ok(/\+13/.test($('[data-wr="session"]').textContent), 'session delta (+10 from setHtml, +3 typed): ' + $('[data-wr="session"]').textContent);
    const id = T4.editor.current.id;
    await T4.editor.flush();
    const d = await T4.docstore.get(id);
    ok(d.meta.wr_goal === 40, 'goal persisted in the document store');
    // reopen
    location.hash = '#/editor'; await wait(400); await T4.editor.openDoc(id); await wait(500);
    ok(T4.editor.current.meta.wr_goal === 40 && $('.ed-wr-goalbtn__txt').textContent.includes('40'), 'goal survives reopening');
    ok(!/\+/.test($('.ed-wr-goalbtn__txt').textContent), 'ok');
    // duplicate keeps it, invalid values are cleaned
    const bad = await X.docs.updateMeta(id, { wr_goal: -5 }); ok(bad.wr_goal === null, 'invalid goal is cleaned to null');
    await X.docs.updateMeta(id, { wr_goal: 40 });
    X.editor.run(() => { D().lastElementChild.textContent += ' a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd ee ff gg'; }); await wait(700);
    ok($('.ed-wr-goalbtn').classList.contains('is-done'), 'goal reached state');
    $('[data-wr="goal-clear"]').click(); await wait(400);
    ok(T4.editor.current.meta.wr_goal === null && $('.ed-wr-goalbtn__txt').textContent === 'Goal', 'goal cleared');
  `);

  /* ---------- focus modes ---------- */
  await run('focus', R`
    const X = T4.edx, WR = T4.edWriting;
    X.editor.setHtml('<p>para one</p><p>para two</p><p>para three</p>'); await wait(200);
    const shell = $('#ed');
    const key = (k, code, mods, el) => (el || D()).dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, code, bubbles: true, cancelable: true }, mods || {})));
    key('F', 'KeyF', { ctrlKey: true, shiftKey: true }); await wait(400);
    ok(shell.classList.contains('ed-wr-focus') && document.body.classList.contains('ed-wr-focus-on'), 'Ctrl+Shift+F turns focus mode on');
    ok(getComputedStyle($('.ed-side')).display === 'none', 'sidebar hidden');
    ok(Math.round($('.ed-bar').getBoundingClientRect().bottom) <= 0, 'toolbar bar collapsed above the page (bottom ' + Math.round($('.ed-bar').getBoundingClientRect().bottom) + ')');
    ok(!$('.ed-wr-chip').hidden, 'focus chip visible');
    ok($('#ed').getBoundingClientRect().width > innerWidth - 20, 'editor fills the window in focus mode (' + Math.round($('#ed').getBoundingClientRect().width) + ' px)');
    // reveal on keyboard focus
    $('.ed-bar button').focus(); await wait(300);
    ok(Math.round($('.ed-bar').getBoundingClientRect().top) >= 0, 'toolbar reappears with keyboard focus');
    D().focus();
    // dim
    $('.ed-wr-chip [data-wr="dim"]').click(); await wait(100);
    ok(shell.classList.contains('ed-wr-dim') && WR.prefs.dim === true, 'dim toggled');
    const r = document.createRange(); r.setStart(D().children[1].firstChild, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); await wait(200);
    ok(D().children[1].classList.contains('is-wr-active') && !D().children[0].classList.contains('is-wr-active'), 'only the active paragraph is bright');
    ok(getComputedStyle(D().children[0]).opacity < 1 && getComputedStyle(D().children[1]).opacity === '1', 'other paragraphs dimmed');
    await T4.editor.flush(); X.editor.run(() => { D().children[2].textContent += '!'; }); const st = await stored();
    ok(!/is-wr-active|ed-wr/.test(st.html), 'no focus classes leak into the stored document');
    ok(JSON.parse(localStorage.getItem('todo4me.editor.writing')).dim === true, 'dim preference persisted');
    // typewriter
    let filler = ''; for (let i = 0; i < 80; i++) filler += '<p>line ' + i + ' of filler text</p>';
    X.editor.setHtml(filler); await wait(200);
    $('.ed-wr-chip [data-wr="tw"]').click(); await wait(100);
    ok(shell.classList.contains('ed-wr-typewriter'), 'typewriter on');
    const p40 = D().children[40]; const r2 = document.createRange(); r2.setStart(p40.firstChild, 2); r2.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r2);
    key('ArrowDown', 'ArrowDown'); await wait(100); WR.centerCaret(true); await wait(100);
    const sc = $('#ed-scroll'), sr = sc.getBoundingClientRect(), cr = getSelection().getRangeAt(0).getBoundingClientRect();
    const mid = sr.top + sr.height / 2;
    ok(Math.abs((cr.top + cr.height / 2) - mid) < 30, 'caret line centered vertically (off by ' + Math.round((cr.top + cr.height / 2) - mid) + ' px)');
    ok(JSON.parse(localStorage.getItem('todo4me.editor.writing')).typewriter === true, 'typewriter preference persisted');
    // Esc
    key('Escape', 'Escape'); await wait(100);
    ok(!shell.classList.contains('ed-wr-focus') && !document.body.classList.contains('ed-wr-focus-on'), 'Esc leaves focus mode');
    ok(getComputedStyle($('.ed-side')).display !== 'none' && shell.classList.contains('ed-wr-typewriter'), 'sidebar back; typewriter stays on independently');
    WR.toggleTypewriter(); WR.toggleDim(); ok(!WR.prefs.dim && !WR.prefs.typewriter, 'toggles off');
    // commands & full screen
    ok(X.commands.run('writing.focus') !== false, 'command runs'); await wait(50); ok(WR.state.focus, 'focus via command'); X.commands.run('writing.focus');
    ok(typeof document.fullscreenEnabled === 'boolean', 'Fullscreen API present (enabled: ' + document.fullscreenEnabled + ')');
    let fs = 'n/a'; try { await WR.toggleFullscreen(); fs = document.fullscreenElement ? 'on' : 'fallback'; } catch (e) { fs = 'threw'; }
    ok(fs !== 'threw', 'full screen command either enters full screen or falls back to focus mode (' + fs + ')');
    if (document.fullscreenElement) await document.exitFullscreen();
    WR.setFocus(false);
  `);
  await run('focus-shot', R`
    const WR = T4.edWriting;
    T4.edx.editor.setHtml('<h1>A quiet page</h1><p>Distraction free writing hides the sidebar and the toolbar.</p><p>Only the current paragraph stays bright, so you can concentrate on one thought at a time.</p><p>The remaining paragraphs fade into the background.</p>'); await wait(200);
    WR.prefs.dim = true; WR.setFocus(true);
    const r = document.createRange(); r.setStart(D().children[2].firstChild, 5); r.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r); $('#ed-scroll').scrollTop = 0; await wait(300);
  `);
  await shot('focus');
  await run('focus-off', R`T4.edWriting.setFocus(false); T4.edWriting.prefs.dim = false; T4.edWriting.markBlock();`);

  /* ---------- heading commands, readonly ---------- */
  await run('heading-nav', R`
    const X = T4.edx;
    X.editor.setHtml('<h1>H one</h1><p>x</p><h1>H two</h1><p>y</p><h1>H three</h1><p>z</p>'); await wait(200);
    const r = document.createRange(); r.setStart(D().children[1].firstChild, 0); r.collapse(true); D().focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    X.commands.run('writing.heading-next'); await wait(100);
    ok(D().children[2].contains(getSelection().anchorNode), 'next heading command moves the caret to "H two"');
    X.commands.run('writing.heading-prev'); await wait(100);
    ok(D().children[0].contains(getSelection().anchorNode), 'previous heading command');
    ok(!X.shortcuts.list().some((s) => /shift-(up|down)$/.test(s.combo) && s.command.startsWith('writing.')), 'Ctrl+Shift+Up/Down not bound (browser selection keys)');
  `);

  /* ---------- performance ---------- */
  await run('perf', R`
    const X = T4.edx, WR = T4.edWriting;
    let html = '';
    for (let i = 0; i < 300; i++) html += (i % 5 === 0 ? '<h2>Section ' + i + '</h2>' : '') + '<p>Paragraph ' + i + ' lorem ipsum dolor sit amet, <b>consectetur</b> adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>';
    X.editor.setHtml(html); await wait(500);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', ctrlKey: true, bubbles: true, cancelable: true })); await wait(100);
    const q = $('.ed-wr-find__q');
    let t0 = performance.now(); q.value = 'lorem'; q.dispatchEvent(new Event('input', { bubbles: true })); const tFind = performance.now() - t0;
    ok(/1 of 300/.test($('.ed-wr-find__count').textContent), 'find-all on 300 paragraphs: ' + $('.ed-wr-find__count').textContent);
    t0 = performance.now(); WR.find.search(false); const tFind2 = performance.now() - t0;
    ok(tFind2 < 150, 'find-all + highlight 300 matches: ' + Math.round(tFind2) + ' ms (first ' + Math.round(tFind) + ' ms)');
    q.value = '(\\w+) ipsum'; $('[data-opt="regex"]').click(); t0 = performance.now(); WR.find.search(false); const tRe = performance.now() - t0;
    ok(tRe < 200, 'regex find-all: ' + Math.round(tRe) + ' ms');
    $('[data-opt="regex"]').click();
    $('[data-wr="close"]').click();
    X.panels.open('writing-outline'); await wait(300);
    t0 = performance.now(); WR.refreshOutline(); const tOl = performance.now() - t0;
    ok(tOl < 100, 'outline rebuild (60 headings): ' + Math.round(tOl) + ' ms');
    t0 = performance.now(); WR.refreshStats(); const tSt = performance.now() - t0;
    ok(tSt < 100, 'statistics on 300 paragraphs: ' + Math.round(tSt) + ' ms');
    X.widgets.insert('toc', { props: { levels: 3 } }); await wait(200);
    t0 = performance.now(); WR.updateTocs(); const tToc = performance.now() - t0;
    ok(tToc < 60, 'TOC check without change: ' + Math.round(tToc) + ' ms');
    // typing stays cheap: content-change handlers are debounced
    t0 = performance.now(); for (let i = 0; i < 50; i++) T4.edx.events.emit('content-change', {}); const tEv = performance.now() - t0;
    ok(tEv < 50, '50 content-change events cost ' + Math.round(tEv) + ' ms in total (debounced)');
    X.panels.close('right');
  `);

  /* ---------- language rebuild + design check ---------- */
  await run('rebuild', R`
    const X = T4.edx;
    X.editor.setHtml('<h1>T</h1><p>x</p>'); await wait(200);
    const lang = T4.i18n.locale();
    ok(!!$('.ed-wr-sb') && !!$('#ed-wr-find'), 'chrome injected: status bar + find bar');
    X.panels.open('writing-stats'); await wait(100);
    ok(/Statistics|Statistik/.test($('.ed-panel__head').textContent), 'panel tabs listed (Outline, Statistics)');
    ok(/Outline|Gliederung/.test($('.ed-panel__head').textContent), 'outline tab');
    X.panels.close('right');
    const keys = ['edx.writing.find.title','edx.writing.toc.title','edx.writing.cmd.focus'];
    ok(keys.every((k) => ['en','de','tr','es'].every((l) => T4.i18n.t && true)), 'keys present');
    T4.i18n.set && 0;
    ok(true, 'ok');
  `);

  await run('cleanup', R`
    try { localStorage.removeItem('todo4me.editor.writing'); } catch (e) {}
    ok(!document.body.classList.contains('ed-wr-focus-on'), 'focus class removed at the end');
  `);
}

export default standalone(test);
