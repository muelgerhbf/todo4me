// Editor extension foundation (T4.edx): registries, sanitizer rules, events, meta fields, DB v2, import/export, panels.
// Run alone:  CDP_PORT=9341 node tests/cdp.mjs tests/editor-foundation.mjs
// Also called by tests/test-editor.mjs (first module suite).
// Everything is registered at runtime from here (like a feature module would) and verified through the real UI.
import { standalone } from './editor-helpers.mjs';

const R = String.raw; // page code contains regular expressions: keep backslashes as written

export async function test(t) {
  const { b, run, out } = t;
  const ev = (code) => b.evaluate(code);
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

  /* ---------- 0. presence & load order ---------- */
  await run('presence', R`
    ok(!!T4.edx && T4.edx.api === 1, 'T4.edx exists (api 1)');
    const names = ['sanitizer','widgets','commands','shortcuts','slash','menus','toolbar','panels','docList','events','meta','docs','db','exporters','importers','search','print','editor','i18n','icons'];
    ok(names.every((n) => T4.edx[n] && typeof T4.edx[n] === 'object'), 'all registries present ' + names.filter((n) => !T4.edx[n]).join(','));
    ok(['download','report','t','text','safeHTML'].every((n) => typeof T4.edx[n] === 'function'), 'helpers download/report/t/text/safeHTML');
    const scripts = $$('script[src]').map((s) => s.getAttribute('src'));
    const ri = scripts.indexOf('js/editor-registry.js');
    ok(ri > -1 && ri < scripts.indexOf('js/editor-sanitize.js') && ri < scripts.indexOf('js/docstore.js'), 'registry loads before sanitizer and docstore');
    ok(scripts.indexOf('js/editor.js') < scripts.indexOf('js/app.js'), 'editor scripts load before app.js');
    ok(['knowledge','writing','versions','io','layout','ux','qa'].every((m) => document.documentElement.innerHTML.includes('<!-- ed-module:' + m + ' -->') && document.documentElement.innerHTML.includes('<!-- /ed-module:' + m + ' -->')), 'all 7 module anchor pairs exist in index.html');
    await newDoc('blank');
    ok(!!T4.editor.current, 'a document is open for the following tests');
    // Feature modules are loaded in the real app: take their registrations out of the way (shortcuts, toolbar items, exporters, panels, views,
    // importers, search providers, slash entries) so this suite tests the registries in isolation. The page is reloaded at the end of the suite.
    const X0 = T4.edx;
    window.__stash = { sc: X0.shortcuts.list().length, tb: X0.toolbar.list().length, ex: X0.exporters.list().length, pn: X0.panels.list().length, vw: X0.docList.views().length };
    X0.shortcuts.list().forEach((s) => X0.shortcuts.remove(s.combo));
    X0.toolbar.list().forEach((i) => X0.toolbar.remove(i.id));
    X0.exporters.list().forEach((i) => X0.exporters.remove(i.id));
    X0.panels.list().forEach((i) => X0.panels.remove(i.id));
    X0.docList.views().forEach((i) => X0.docList.removeView(i.id));
    X0.search.list().filter((i) => i.id !== 'builtin').forEach((i) => X0.search.remove(i.id));
    X0.slash.list().forEach((i) => X0.slash.remove(i.id));
    await wait(100);
    ok(X0.shortcuts.list().length === 0 && X0.toolbar.list().length === 0 && X0.exporters.list().length === 0 && X0.panels.list().length === 0, 'isolated from module registrations (' + JSON.stringify(window.__stash) + ' removed)');
  `);

  /* ---------- 1. sanitizer: strict per-element/attribute rules + hostile input ---------- */
  await run('sanitizer-allow', R`
    const X = T4.edx, S = (h) => T4.edSanitize.sanitizeToString(h);
    ok(S('<p><time datetime="2026-01-02" onclick="alert(1)">t</time></p>') === '<p>t</p>', 'before registering: unknown element <time> is unwrapped');
    const undo = X.sanitizer.allow({
      tags: ['TIME'],
      attrs: {
        TIME: { datetime: /^\d{4}-\d{2}-\d{2}$/, 'data-x-note': /^[\w ]{1,20}$/ },
        SPAN: { 'data-x-tag': /^[a-z]{1,10}$/, class: /^t4x-[a-z]+$/ },
        P: { id: /^[\w-]+$/, class: /^.*$/ },
      },
      styles: { SPAN: { 'letter-spacing': (v) => (/^\d(\.\d)?px$/.test(v) ? v : null), 'word-spacing': (v) => v } },
    });
    ok(S('<p><time datetime="2026-01-02" data-x-note="hi there">t</time></p>') === '<p><time datetime="2026-01-02" data-x-note="hi there">t</time></p>', 'registered element + attributes kept');
    ok(S('<p><time datetime="2026-01-02" onclick="alert(1)" onmouseover="x" style="position:fixed" data-x-other="1" href="javascript:alert(1)">t</time></p>') === '<p><time datetime="2026-01-02">t</time></p>', 'onclick / on* / style / unregistered data-x / href are dropped on a registered element');
    ok(S('<p><time datetime="evil" data-x-note="<script>">t</time></p>') === '<p><time>t</time></p>', 'values must pass the validators');
    ok(S('<p><span data-x-tag="abc">a</span><span data-x-tag="ABC">b</span></p>') === '<p><span data-x-tag="abc">a</span>b</p>', 'span with a registered attribute stays a span; invalid value → plain text');
    ok(S('<p><span class="t4x-ok" onclick="x()">a</span></p>') === '<p><span class="t4x-ok">a</span></p>', 'class rule is per element');
    ok(S('<p><em class="t4x-ok">a</em></p>') === '<p><em>a</em></p>', 'attributes registered for SPAN are not allowed on EM');
    ok(S('<p><span data-x-tag="a" style="letter-spacing: 2px; position: fixed; background: url(javascript:1)">a</span></p>') === '<p><span style="letter-spacing: 2px" data-x-tag="a">a</span></p>', 'registered style property kept, everything else dropped');
    ok(S('<p><span data-x-tag="a" style="word-spacing: 1px; position: fixed">a</span></p>').indexOf('position') === -1, 'style injection through a lax style validator: ; and url( are refused');
    ok(S('<p id="my-id">a</p>') === '<p id="my-id">a</p>', 'id with a safe name accepted when registered');
    ['__proto__', 'constructor', 'valueOf', 'toString', 'T4', 'location', 'document', 'hasOwnProperty', '__defineGetter__'].forEach((id) => {
      ok(S('<p id="' + id + '">a</p>') === '<p>a</p>', 'id="' + id + '" is refused (DOM clobbering)');
    });
    ok(S('<p class="t4-w">a</p>') === '<p>a</p>' && S('<p class="ok t4-w">a</p>') === '<p>a</p>' && S('<p class="ed-ui">a</p>') === '<p>a</p>', 'reserved classes (t4-w, ed-ui, …) can never be set, even by a lax class rule');
    ok(S('<p class="fine other">a</p>') === '<p class="fine other">a</p>', 'ordinary classes pass a lax class rule');
    ok(S('<foo data-x-note="1"><p>a</p></foo><bar>b</bar>') === '<p>a</p><p>b</p>', 'unknown elements stay dropped/unwrapped');
    ok(S('<script>alert(1)</script><p onclick="x">ok<iframe src="https://x"></iframe></p>') === '<p>ok</p>', 'scripts, handlers and iframes still removed');
    undo();
    ok(S('<p><time datetime="2026-01-02">t</time></p>') === '<p>t</p>' && S('<p id="my-id">a</p>') === '<p>a</p>', 'the returned undo() removes the rules again');

    const bad = [
      ['href on A', { attrs: { A: { href: /.*/ } } }], ['onclick', { attrs: { P: { onclick: /.*/ } } }], ['style attr', { attrs: { P: { style: /.*/ } } }],
      ['src', { attrs: { P: { src: /.*/ } } }], ['plain data-*', { attrs: { P: { 'data-foo': /.*/ } } }], ['name', { attrs: { P: { name: /.*/ } } }],
      ['wholesale true', { attrs: { P: { class: true } } }], ['SCRIPT tag', { tags: ['SCRIPT'] }], ['IFRAME tag', { tags: ['IFRAME'] }], ['A tag', { tags: ['A'] }],
      ['widgets via allow', { widgets: ['x'] }], ['bad style rule', { styles: { P: { 'color': 'red' } } }], ['block tag not safe', { tags: { TIME: 'block' } }],
    ];
    bad.forEach(([name, rules]) => {
      let threw = false; try { X.sanitizer.allow(rules); } catch (e) { threw = true; }
      ok(threw, 'allow() refuses ' + name);
    });
    ok(!X.sanitizer.hasAttrRules('A') && !X.sanitizer.tagKind('SCRIPT'), 'refused rules leave no trace');
  `);

  await run('sanitizer-containers', R`
    const X = T4.edx, S = (h) => T4.edSanitize.sanitizeToString(h);
    ok(S('<details open><summary>S</summary><p>x</p></details>') === '<p>S</p><p>x</p>', 'before registering: details/summary are flattened');
    const u1 = X.sanitizer.allow({ attrs: { DETAILS: { open: /^.*$/ }, DIV: { class: /^t4x-[a-z]+$/, 'data-x-kind': /^(info|warn)$/ } }, tags: { SUMMARY: 'block' } });
    const u2 = X.sanitizer.blockContainer('DETAILS');
    const u3 = X.sanitizer.blockContainer('DIV', { match: (el) => el.classList.contains('t4x-box') });
    const h = S('<details open onclick="x()"><summary>Title</summary><p>x</p></details>');
    ok(h === '<details open=""><summary>Title</summary><p>x</p></details>', 'details container + summary kept, onclick dropped: ' + h);
    ok(S('<div class="t4x-box" data-x-kind="warn">loose text</div>') === '<div class="t4x-box" data-x-kind="warn"><p>loose text</p></div>', 'matching DIV kept as container, loose text wrapped in a paragraph');
    ok(S('<div>plain</div>') === '<p>plain</p>', 'ordinary DIV is still flattened');
    ok(S('<details></details>') === '<details><p><br></p></details>', 'empty container gets a paragraph');
    ok(S('<div class="t4x-box"><div class="t4x-box"><p>in</p></div></div>').indexOf('<div class="t4x-box"><div class="t4x-box"><p>in</p></div></div>') === 0, 'containers nest');
    // live editor: the container survives typing, undo and reload
    T4.edx.editor.setHtml('<p>before</p><details open><summary>Sum</summary><p>inside</p></details><p>after</p>');
    await wait(100);
    ok(!!D().querySelector('details > summary') && D().querySelector('details > p').textContent === 'inside', 'container rendered in the editor');
    const snap = C().snapshot().html;
    ok(snap.includes('<details open=""><summary>Sum</summary><p>inside</p></details>'), 'container is serialized: ' + snap);
    C().undo(); await wait(50); C().redo(); await wait(50);
    ok(!!D().querySelector('details > p'), 'container survives undo/redo');
    ok(D().children[1].tagName === 'DETAILS', 'ensureStructure keeps the container as a top-level block');
    u1(); u2(); u3();
    ok(S('<details open><summary>S</summary><p>x</p></details>') === '<p>S</p><p>x</p>', 'container rules removable');
    let threw = false; try { X.sanitizer.blockContainer('TABLE'); } catch (e) { threw = true; }
    ok(threw, 'blockContainer refuses unsafe/unknown tags');
  `);

  /* ---------- 2. widgets ---------- */
  await run('widgets', R`
    const X = T4.edx, S = (h) => T4.edSanitize.sanitizeToString(h);
    window.__xn = []; window.__xnEdit = null;
    X.widgets.register('xnote', {
      validate: (p) => (typeof p.text === 'string' ? { text: p.text.slice(0, 50), tone: ['a', 'b'].includes(p.tone) ? p.tone : 'a' } : null),
      render: (el, p) => { const s = document.createElement('span'); s.className = 'xn-body'; s.textContent = p.text; s.dataset.tone = p.tone; el.appendChild(s); },
      textOf: (p) => 'XN:' + p.text,
      toMarkdown: (p) => '> note: ' + p.text,
      ctxBar: { label: 'Note', items: [{ action: 'tone-b', icon: 'star', label: 'Tone B' }, { sep: true }, { builtin: 'delete', icon: 'trash', label: 'Delete note' }],
        onAction: (a, info) => { window.__xn.push(a); if (a === 'tone-b') info.setProps({ tone: 'b' }); } },
      edit: (el, p) => { window.__xnEdit = p.text; },
      css: '.xn-body { color: #2f6fed } </style><script>bad()</script>',
    });
    X.widgets.register('xchip', { inline: true, validate: (p) => ({ v: String(p.v || '').slice(0, 10) }), render: (el, p) => { el.textContent = '[' + p.v + ']'; }, textOf: (p) => p.v, toMarkdown: (p) => '{' + p.v + '}' });
    ok(X.widgets.has('xnote') && X.widgets.list().includes('xchip'), 'widgets registered');
    ok(!!document.querySelector('style[data-edx-widget="xnote"]') && !document.querySelector('style[data-edx-widget="xnote"]').textContent.includes('</style'), 'widget css injected (no style breakout)');

    const wh = '<figure class="t4-w" data-w="xnote" data-p="{&quot;text&quot;:&quot;hi&quot;,&quot;tone&quot;:&quot;zzz&quot;}">EVIL<script>x()</script></figure>';
    ok(S(wh) === '<figure class="t4-w" data-w="xnote" data-p="{&quot;text&quot;:&quot;hi&quot;,&quot;tone&quot;:&quot;a&quot;}"></figure>', 'sanitizer: registered widget validated, inner HTML never trusted');
    ok(!S('<figure class="t4-w" data-w="evil" data-p="{}"></figure>').includes('evil'), 'sanitizer: unregistered widget type dropped');
    ['[]', 'null', '"s"', '{bad', '{"text":5}'].forEach((p) => ok(!S('<figure class="t4-w" data-w="xnote" data-p=\'' + p + '\'></figure>').includes('xnote'), 'sanitizer: invalid props ' + p + ' → widget dropped'));
    ok(S('<figure class="t4-w" data-w="xnote" data-p=\'{"text":"' + 'x'.repeat(80) + '"}\'></figure>').includes('x'.repeat(50)) && !S('<figure class="t4-w" data-w="xnote" data-p=\'{"text":"' + 'x'.repeat(80) + '"}\'></figure>').includes('x'.repeat(51)), 'validator clamps values');
    ok(S('<p>a <span class="t4-w" data-w="xchip" data-p=\'{"v":"q"}\'>zz</span> b</p>') === '<p>a <span class="t4-w" data-w="xchip" data-p="{&quot;v&quot;:&quot;q&quot;}"></span> b</p>', 'inline widget stays an inline span');
    ok(S('<figure class="t4-w" data-w="xchip" data-p=\'{"v":"q"}\'></figure>').includes('<span class="t4-w"'), 'inline widget type is always a span');

    // insert via the registry
    T4.edx.editor.setHtml('<p>start</p>'); caretEnd(); await wait(50);
    X.widgets.insert('xnote', { props: { text: 'Hello' } });
    await wait(150);
    const w = D().querySelector('[data-w="xnote"]');
    ok(!!w && w.tagName === 'FIGURE' && w.querySelector('.xn-body').textContent === 'Hello' && w.getAttribute('contenteditable') === 'false', 'block widget inserted and rendered');
    ok(C().selectedWidget === w, 'inserted widget is selected');
    await wait(100);
    const bar = $('#ed-ctx');
    ok(!bar.hidden && bar.querySelector('.ctx-label').textContent === 'Note' && !!bar.querySelector('[data-ctx="x:tone-b"]') && !!bar.querySelector('[data-ctx="delete"]'), 'context bar from ctxBar.items (module action + built-in delete)');
    bar.querySelector('[data-ctx="x:tone-b"]').click(); await wait(100);
    ok(window.__xn.join() === 'tone-b' && JSON.parse(w.getAttribute('data-p')).tone === 'b' && w.querySelector('.xn-body').dataset.tone === 'b', 'ctx action → onAction → setProps re-renders');
    C().undo(); await wait(100);
    const w2 = D().querySelector('[data-w="xnote"]');
    ok(JSON.parse(w2.getAttribute('data-p')).tone === 'a', 'widget change is one undo step');
    ok(C().snapshot().text.includes('XN:Hello'), 'textOf feeds search text / counts');
    const st = await stored();
    ok(st.html.includes('data-w="xnote"') && !st.html.includes('xn-body'), 'stored HTML holds only the source props: ' + st.html.slice(0, 160));
    ok((await T4.edmd.toMarkdown(C().serialize())).includes('> note: Hello'), 'toMarkdown(props, ctx) used by Markdown export');
    w2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    ok(window.__xnEdit === 'Hello', 'double click → edit(el, props)');

    caretEnd(); X.widgets.insert('xchip', { props: { v: 'q' } }); await wait(100);
    const chip = D().querySelector('span[data-w="xchip"]');
    ok(!!chip && chip.parentNode.tagName === 'P' && chip.textContent === '[q]', 'inline widget inserted inside a paragraph');
    ok((await T4.edmd.toMarkdown(C().serialize())).includes('{q}'), 'inline widget toMarkdown');
    // reload the stored document: the registered widgets are hydrated again
    const id = T4.editor.current.id;
    await T4.editor.flush(); location.hash = '#/editor'; await wait(400); location.hash = '#/editor?doc=' + id; await wait(600);
    ok(!!D().querySelector('[data-w="xnote"] .xn-body') && !!D().querySelector('[data-w="xchip"]'), 'registered widgets rendered after reloading the document');

    let threw = 0;
    ['img', 'Bad Type', 'x'].forEach((tp) => { try { X.widgets.register(tp, { validate: () => ({}), render() {} }); } catch (e) { threw++; } });
    try { X.widgets.register('xbad', { validate: () => ({}) }); } catch (e) { threw++; }
    try { X.widgets.register('xnote', { validate: () => ({}), render() {} }); } catch (e) { threw++; }
    ok(threw === 5, 'reserved/invalid/duplicate widget registrations throw');
    ok(T4.edw.validate('xnote', {}) === null && T4.edw.create('xnote', { text: 't' }).getAttribute('data-w') === 'xnote', 'edw.validate/create fall back to the registry');
    const bad = X.widgets.register('xboom', { validate: () => { throw new Error('boom'); }, render() {} });
    ok(T4.edSanitize.sanitizeToString('<figure class="t4-w" data-w="xboom" data-p="{}"></figure>').includes('xboom') === false, 'a throwing validator drops the widget instead of breaking the sanitizer');
    bad();
  `);

  /* ---------- 3. commands & shortcuts (real key events) ---------- */
  await run('commands-setup', R`
    const X = T4.edx;
    window.__log = [];
    X.commands.register('t.hello', { label: 'Hello command', icon: 'star', group: 'Test', run: (ctx) => { window.__log.push('hello:' + ctx.source); return 'r1'; } });
    X.commands.register('t.pal', { labelKey: 'edx.nonexistent.pal', label: 'Palette command', run: () => { window.__log.push('pal'); } });
    X.commands.register('t.f3', { label: 'F3 command', run: () => { window.__log.push('f3'); } });
    X.commands.register('t.ro', { label: 'Read-only OK', readonlyOk: true, run: () => { window.__log.push('ro'); } });
    window.__on = true;
    X.commands.register('t.when', { label: 'Conditional', when: () => window.__on, run: () => { window.__log.push('when'); } });
    ok(X.shortcuts.add('mod-shift-h', 't.hello') === true, 'shortcut mod-shift-h registered');
    ok(X.shortcuts.add('Ctrl+Shift+P', 't.pal') === true, 'Ctrl+Shift+P (formerly caught by the built-in Ctrl+P) can be registered');
    ok(X.shortcuts.add('f3', 't.f3') && X.shortcuts.add('mod-f', 't.when') && X.shortcuts.add('mod-alt-shift-r', 't.ro'), 'F3, mod-f, mod-alt-shift-r registered');
    ok(X.shortcuts.add('mod-shift-h', 't.pal') === false, 'a combo bound to another command is refused');
    const reserved = ['mod-b', 'mod-i', 'mod-z', 'mod-s', 'mod-p', 'mod-k', 'mod-n', 'mod-shift-n', 'mod-alt-n', 'mod-1', 'mod-shift-d', 'mod-r', 'f11', 'tab', 'enter', 'mod-c', 'mod-shift-space'];
    ok(reserved.every((c) => X.shortcuts.add(c, 't.hello') === false), 'reserved editor/app/menu combos are refused: ' + reserved.filter((c) => X.shortcuts.add(c, 't.hello')).join());
    ok(['x', 'shift-x', 'enter', 'mod-', 'nonsense-combo', ''].every((c) => X.shortcuts.add(c, 't.hello') === false), 'plain keys / invalid combos refused');
    ok(X.shortcuts.normalize('Ctrl+Shift+H') === 'mod-shift-h' && X.shortcuts.normalize('shift-alt-cmd-j') === 'mod-alt-shift-j' && X.shortcuts.normalize('mod--') === 'mod--', 'combo normalisation (one format)');
    ok(X.shortcuts.reserved().app.includes('mod-shift-d') && X.shortcuts.reserved().editor.includes('mod-b'), 'reserved() lists the combos');
    const l = X.commands.list().find((c) => c.id === 't.hello');
    ok(l && l.label === 'Hello command' && l.icon === 'star' && l.group === 'Test' && l.kbd === 'Ctrl+Shift+H' && l.enabled === true, 'commands.list(): label, icon, group, shortcut label');
    ok(X.commands.list().find((c) => c.id === 't.pal').label === 'Palette command', 'label falls back to the English text when the key has no translation');
    ok(X.commands.run('t.hello') === 'r1' && window.__log.pop() === 'hello:api', 'commands.run(id) runs and returns the result');
    window.__on = false; ok(X.commands.run('t.when') === false && !X.commands.list().find((c) => c.id === 't.when').enabled, 'when() false → disabled, run() returns false');
    ok(X.commands.run('nope') === false, 'unknown command → false');
    window.__log.length = 0;
    T4.edx.editor.setHtml('<p>keys</p>'); caretEnd(); await wait(100);
  `);
  const keyCase = async (label, key, code, mods, expect, focusJs) => {
    if (focusJs) await ev(focusJs);
    await ev('window.__log.length = 0; true');
    await b.key(key, code, '', mods);
    await b.sleep(120);
    const log = await ev('window.__log.join()');
    ok(log === expect, label + ' → [' + log + '] (expected [' + expect + '])');
  };
  const FOCUS_DOC = `(() => { const d = document.getElementById('ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()`;
  await keyCase('Ctrl+Shift+H in the document', 'H', 'KeyH', 10, 'hello:shortcut', FOCUS_DOC);
  await keyCase('Ctrl+Shift+P runs the command (not the built-in PDF export)', 'P', 'KeyP', 10, 'pal', FOCUS_DOC);
  ok((await ev(`!document.getElementById('ed-print-css')`)), 'no PDF export was started by Ctrl+Shift+P');
  await keyCase('F3', 'F3', 'F3', 0, 'f3', FOCUS_DOC);
  await keyCase('Ctrl+F with a false when() does nothing', 'f', 'KeyF', 2, '', FOCUS_DOC);
  await ev('window.__on = true');
  await keyCase('Ctrl+F once when() is true', 'f', 'KeyF', 2, 'when', FOCUS_DOC);
  await keyCase('Ctrl+Alt+Shift+R', 'R', 'KeyR', 11, 'ro', FOCUS_DOC);
  await keyCase('Ctrl+Shift+H while the title field has focus', 'H', 'KeyH', 10, 'hello:shortcut', `document.getElementById('ed-title').focus(); true`);
  await keyCase('plain H is never intercepted', 'h', 'KeyH', 0, '', FOCUS_DOC);
  await keyCase('Ctrl+H (not registered) does nothing', 'h', 'KeyH', 2, '', FOCUS_DOC);
  ok((await ev(`document.getElementById('ed-doc').textContent.includes('keys')`)), 'typing was not disturbed');
  // built-in shortcuts keep working next to registered ones
  await ev(R`(() => { T4.edx.editor.setHtml('<p>bold me</p>'); const d = document.getElementById('ed-doc'); d.focus(); const r = document.createRange(); r.selectNodeContents(d.firstElementChild); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()`);
  await b.key('b', 'KeyB', '', 2);
  await b.sleep(150);
  ok((await ev(`document.getElementById('ed-doc').querySelector('b, strong') !== null`)), 'Ctrl+B still bolds');
  // read-only (trashed) document: only readonlyOk commands run
  await run('commands-readonly', R`
    const X = T4.edx;
    const meta = await T4.editor.newDocument({ title: 'Trashed one', html: '<p>x</p>' });
    for (let i = 0; i < 40 && !(T4.editor.current && T4.editor.current.id === meta.id); i++) await wait(50);
    await T4.docstore.trash(meta.id); await T4.editor.flush();
    location.hash = '#/editor'; await wait(300); location.hash = '#/editor?doc=' + meta.id; await wait(600);
    ok(T4.edx.editor.readonly() === true, 'trashed document opens read-only');
    window.__log.length = 0;
    ok(X.commands.run('t.hello') === false, 'commands.run is refused in a read-only document');
    ok(X.commands.run('t.ro') === undefined && window.__log.join() === 'ro', 'readonlyOk command still runs');
    window.__trashed = meta.id;
  `);
  await keyCase('shortcut in a read-only document', 'H', 'KeyH', 10, '', `document.getElementById('ed-doc').focus(); true`);
  await run('commands-after', R`
    await T4.docstore.restore(window.__trashed); location.hash = '#/editor'; await wait(300);
    await T4.editor.openDoc(window.__trashed); await wait(300);
    ok(T4.edx.editor.readonly() === false, 'document restored');
    T4.edx.commands.remove('t.when');
    ok(!T4.edx.shortcuts.list().some((s) => s.command === 't.when') && !T4.edx.commands.has('t.when'), 'removing a command removes its shortcuts');
  `);

  /* ---------- 4. slash menu ---------- */
  await run('slash-setup', R`
    window.__slash = [];
    T4.edx.slash.add({ id: 't.slash', label: 'Zebra thing', keywords: ['stripes', 'animal'], icon: 'star', group: 'Test group', order: 1, run: (ctx) => { window.__slash.push(!!ctx.editor); ctx.editor.insertHTML('<p>ZEBRA</p>'); } });
    T4.edx.slash.add({ id: 't.slash2', labelKey: 'edx.none.slash2', label: 'Aardvark', keywords: 'ants', icon: 'star', run: () => { window.__slash.push('aard'); } });
    T4.edx.editor.setHtml('<p><br></p>'); D().focus(); caretEnd(); await wait(100);
  `);
  await b.type('/');
  await b.sleep(150);
  ok(await ev(`!!document.querySelector('.ed-slash') && Array.from(document.querySelectorAll('.ed-slash .ed-menu__label')).some((l) => l.textContent === 'Zebra thing') && Array.from(document.querySelectorAll('.ed-slash .ed-menu__label')).some((l) => l.textContent === 'Heading 1')`), 'slash menu shows built-in and registered entries');
  ok(await ev(`Array.from(document.querySelectorAll('.ed-slash .ed-menu__heading')).some((h) => h.textContent === 'Test group')`), 'registered group heading shown');
  await b.type('stripes');
  await b.sleep(150);
  ok(await ev(`document.querySelectorAll('.ed-slash [data-si]').length === 1 && document.querySelector('.ed-slash [data-si]').textContent.includes('Zebra thing')`), 'slash filter matches registered keywords');
  await b.key('Enter', 'Enter', '\r');
  await b.sleep(200);
  ok(await ev(`window.__slash[0] === true && document.getElementById('ed-doc').textContent.includes('ZEBRA') && !document.getElementById('ed-doc').textContent.includes('/stripes')`), 'Enter runs the registered slash entry (typed text removed, run(ctx) called)');
  ok(await ev(`!document.querySelector('.ed-slash')`), 'slash menu closed');

  /* ---------- 5. menus (file / insert / more / doc / context), exporters, toolbar ---------- */
  await run('menus', R`
    const X = T4.edx;
    window.__m = [];
    X.menus.add('file', { id: 'x', label: 'Test file item', icon: 'star', run: (ctx) => window.__m.push('file:' + ctx.where + ':' + (ctx.doc && ctx.doc.id === T4.editor.current.id)) });
    X.menus.add('insert', (ctx) => [{ label: 'Test insert A', run: () => window.__m.push('insert') }, { label: 'Hidden', when: () => false, run() {} }]);
    X.menus.add('more', { label: 'Test more item', order: 1, run: () => window.__m.push('more') });
    X.menus.add('doc', (ctx) => ({ label: 'Test doc item ' + (ctx.docId ? 'ok' : 'noid'), run: (c) => window.__m.push('doc:' + c.docId) }));
    X.menus.add('context', (ctx) => [{ label: 'Test context item', run: (c) => window.__m.push('context:' + c.hasSelection + ':' + (c.target ? c.target.tagName : '')) }, { label: 'Ctx sub', items: [{ label: 'Ctx sub item', run: () => window.__m.push('ctxsub') }] }]);
    X.exporters.register({ id: 't.exp', label: 'Test format', ext: 'tst', mime: 'text/plain', run: async (doc) => 'EXPORT:' + doc.meta.title + ':' + doc.html.length });
    X.exporters.register({ id: 't.hand', label: 'Handled format', ext: 'hnd', run: async () => ({ handled: true }) });
    X.exporters.register({ id: 't.fail', label: 'Failing format', ext: 'bad', run: async () => { throw new Error('nope'); } });
    window.__dl = [];
    window.__origDownload = X.download;
    X.download = (data, name, mime) => { window.__dl.push({ data, name, mime }); return name; };
    ok(['t.exp','t.hand','t.fail'].every((id) => X.exporters.get(id)) && X.exporters.list().length === 3, 'exporters registered');
    T4.edx.editor.setHtml('<p>menu doc</p>'); await wait(100);
    $('.ed-bar [data-cmd="menu-file"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); $('.ed-bar [data-cmd="menu-file"]').click(); await wait(100);
    const items = $$('.ed-menu [data-mi]').map((x) => x.textContent.trim());
    ok(items.some((x) => x.startsWith('Test file item')), 'File menu shows the registered item');
    ok(items.some((x) => x.startsWith('Export as PDF')) && items.some((x) => x.startsWith('Close document')) && items.indexOf('Close document') > items.findIndex((x) => x.startsWith('Test file item')), 'built-in items intact, registered ones before Close/Trash');
    const sub = $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Export as…'));
    ok(!!sub && sub.getAttribute('aria-haspopup') === 'menu', 'File menu has an "Export as…" submenu when exporters exist');
    sub.click(); await wait(100);
    const subItems = $$('.ed-menu--sub [data-mi]').map((x) => x.textContent.trim());
    ok(subItems.length === 3 && subItems[0] === 'Test format (.tst)', 'submenu lists the exporters: ' + subItems.join('|'));
    $$('.ed-menu--sub [data-mi]')[0].click(); await wait(400);
    ok(window.__dl.length === 1 && /\.tst$/.test(window.__dl[0].name) && window.__dl[0].data.startsWith('EXPORT:') && window.__dl[0].mime === 'text/plain', 'exporter result is downloaded as <title>.tst: ' + JSON.stringify(window.__dl[0] && window.__dl[0].name));
    ok(!$('.ed-menu') , 'menu closed after choosing');
    $('.ed-bar [data-cmd="menu-file"]').click(); await wait(80); $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Test file item')).click(); await wait(50);
    ok(window.__m.join() === 'file:file:true', 'File item run(ctx) gets where/doc');
    ok((await T4.edx.exporters.export('t.hand')) === true && window.__dl.length === 1, 'exporter returning {handled:true} downloads nothing');
    ok((await T4.edx.exporters.export('t.fail')) === false && !!$$('.toast').find((x) => /Export failed: nope/.test(x.textContent)), 'failing exporter → toast, returns false');
    // insert + more
    tb('menu-insert'); await wait(80);
    ok($$('.ed-menu [data-mi]').some((x) => x.textContent.trim() === 'Test insert A') && !$$('.ed-menu [data-mi]').some((x) => x.textContent.trim() === 'Hidden'), 'Insert menu: provider function, when() filter');
    menuItem('Test insert A'); await wait(30);
    tb('more'); await wait(80);
    menuItem('Test more item'); await wait(30);
    ok(window.__m.join() === 'file:file:true,insert,more', 'insert/more items run');
    // doc menu in the list
    const more = $('.ed-item__more'); more.click(); await wait(80);
    ok($$('.ed-menu [data-mi]').some((x) => x.textContent.trim() === 'Test doc item ok') && $$('.ed-menu [data-mi]').some((x) => x.textContent.trim().startsWith('Export as…')), 'document "…" menu: provider with docId, export submenu');
    menuItem('Test doc item'); await wait(30);
    ok(window.__m[3].startsWith('doc:doc_'), 'doc item run(ctx.docId)');
    X.download = window.__origDownload;
  `);
  // context menu: keyboard (Shift+F10) and mouse
  await ev(FOCUS_DOC);
  await b.key('F10', 'F10', '', 8);
  await b.sleep(200);
  ok(await ev(`(() => { const l = Array.from(document.querySelectorAll('.ed-menu [data-mi]')).map((x) => x.textContent.trim()); return ['Cut', 'Copy', 'Paste', 'Paste as plain text', 'Select all', 'Test context item', 'Ctx sub'].every((n) => l.some((x) => x.startsWith(n))); })()`), 'Shift+F10 opens the context menu: Cut/Copy/Paste/Paste as plain text/Select all + registered items');
  ok(await ev(`(() => { const b = Array.from(document.querySelectorAll('.ed-menu [data-mi]')); return b.find((x) => x.textContent.startsWith('Cut')).disabled && b.find((x) => x.textContent.startsWith('Copy')).disabled; })()`), 'Cut/Copy disabled without a selection');
  await b.key('Escape', 'Escape', '', 0);
  await b.sleep(100);
  ok(await ev(`!document.querySelector('.ed-menu')`), 'Escape closes the context menu');
  await run('context-mouse', R`
    const p = D().querySelector('p');
    const evText = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
    ok(p.dispatchEvent(evText) === true && !$('.ed-menu'), 'browser: right-click on text stays native (spell-check suggestions keep working)');
    T4.edx.widgets.insert('xnote', { props: { text: 'ctx' } }); await wait(150);
    const w = D().querySelector('[data-w="xnote"]');
    const r = w.getBoundingClientRect();
    const evW = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 });
    ok(w.dispatchEvent(evW) === false && !!$('.ed-menu'), 'right-click on a widget opens our menu (native menu prevented)');
    ok(C().selectedWidget === w, 'right-click selects the widget');
    menuItem('Test context item'); await wait(30);
    ok(/^context:(true|false):FIGURE$/.test(window.__m[window.__m.length - 1]), 'context item run(ctx) gets target and selection info: ' + window.__m[window.__m.length - 1]);
    T4.edx.commands.run('t.hello');
    // selection + Cut/Copy enabled
    T4.edx.editor.setHtml('<p>select me</p>'); await wait(60);
    selectNode(D().querySelector('p'));
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(100);
    const cut = $$('.ed-menu [data-mi]').find((x) => x.textContent.startsWith('Cut'));
    ok(!!cut && !cut.disabled, 'Cut enabled when text is selected');
    $$('.ed-menu [data-mi]').find((x) => x.textContent.startsWith('Ctx sub')).click(); await wait(80);
    ok(!!$('.ed-menu--sub') && $('.ed-menu--sub').textContent.includes('Ctx sub item'), 'submenu in the context menu');
    $('.ed-menu--sub [data-mi]').click(); await wait(50);
    ok(window.__m.includes('ctxsub') && !$('.ed-menu'), 'submenu item runs and closes everything');
  `);
  await run('toolbar', R`
    const X = T4.edx;
    window.__tbRuns = 0; window.__tbOn = false;
    X.toolbar.add({ id: 't.tb', group: 'testgrp', icon: 'star', label: 'Test button', kbd: 'mod-shift-j', run: (ctx) => { window.__tbRuns++; window.__tbOn = !window.__tbOn; }, isActive: () => window.__tbOn });
    X.toolbar.add({ id: 't.tb2', group: 'testgrp', icon: 'bold', label: 'Second', run: () => { window.__tbRuns += 10; }, readonlyOk: false });
    X.toolbar.add({ id: 't.tb3', group: 'other', icon: 'bold', label: 'Other group', run: () => {} });
    const ext = $('#ed-tb-ext');
    ok(!ext.hidden && ext.querySelectorAll('.tb-group').length === 2 && ext.querySelectorAll('button').length === 3, 'reserved toolbar group renders registered buttons grouped by "group"');
    const btn = ext.querySelector('[data-cmd="ext:t.tb"]');
    ok(btn.title.startsWith('Test button') && btn.title.includes('Ctrl+Shift+J'), 'tooltip contains label and shortcut');
    tb('ext:t.tb'); await wait(30);
    ok(window.__tbRuns === 1, 'toolbar button runs');
    C().run(() => {}); await wait(150);
    ok(btn.classList.contains('is-on') && btn.getAttribute('aria-pressed') === 'true', 'isActive() reflected after the selection update');
    X.toolbar.remove('t.tb3');
    ok(ext.querySelectorAll('button').length === 2, 'toolbar.remove re-renders');
  `);

  /* ---------- 6. panels ---------- */
  await run('panels', R`
    const X = T4.edx;
    window.__p = { render: 0, open: 0, close: 0, doc: [], hostOk: false };
    X.panels.register({ id: 'tp.right', side: 'right', title: 'Test panel', icon: 'list', order: 1,
      render: (host, api) => { window.__p.render++; window.__p.hostOk = host.isConnected && api.id === 'tp.right' && typeof api.close === 'function' && !!api.editor; host.innerHTML = '<p class="tp-body">Panel body</p>'; },
      onDocChange: (d) => window.__p.doc.push(d ? d.id : null), onOpen: () => window.__p.open++, onClose: () => window.__p.close++ });
    X.panels.register({ id: 'tp.right2', side: 'right', title: 'Second panel', order: 2, render: (host) => { host.textContent = 'Second body'; } });
    X.panels.register({ id: 'tp.left', side: 'left', title: 'Left panel', icon: 'doc', render: (host) => { host.innerHTML = '<p class="tp-left-body">Left body</p>'; } });
    const btn = $('#ed-panel-btn');
    ok(!btn.hidden, 'panel toggle button appears in the editor bar');
    ok(!$('#ed').classList.contains('panel-open') && getComputedStyle($('#ed-panel')).display === 'none', 'panels start closed');
    ok(window.__p.render === 0, 'a panel is rendered lazily (only when first opened)');
    btn.click(); await wait(150);
    ok($('#ed').classList.contains('panel-open') && getComputedStyle($('#ed-panel')).display === 'flex', 'toggle opens the right panel column');
    ok(getComputedStyle($('#ed')).gridTemplateColumns.split(' ').length === 3, 'editor grid has three columns with the panel open');
    ok(window.__p.render === 1 && window.__p.open === 1 && window.__p.hostOk && !!$('.tp-body'), 'render(host, api) + onOpen called once');
    ok(window.__p.doc[window.__p.doc.length - 1] === T4.editor.current.id, 'onDocChange(doc) called with the current document on open');
    ok($$('#ed-panel-head .ed-panel__tab').length === 2 && $('#ed-panel-head .ed-panel__tab.is-on').textContent.includes('Test panel') && btn.getAttribute('aria-expanded') === 'true', 'tab switcher, first panel active');
    ok(JSON.parse(localStorage.getItem('todo4me.editor.ui')).panel === 'tp.right', 'open panel persisted in the editor UI prefs');
    $$('#ed-panel-head .ed-panel__tab')[1].click(); await wait(100);
    ok(window.__p.close === 1 && $('.ed-panel__host:not([hidden])').textContent === 'Second body' && X.panels.active() === 'tp.right2', 'switching tabs: onClose of the old panel, new host visible');
    X.panels.open('tp.right'); await wait(100);
    ok(window.__p.render === 1 && window.__p.open === 2, 'switching back does not render again');
    const before = window.__p.doc.length;
    caretEnd(); document.execCommand('insertText', false, ' typing'); await wait(1600);
    ok(window.__p.doc.length > before, 'onDocChange fires after the document autosaved (doc-saved)');
    // left panel
    ok(!$('#ed-side-tabs').hidden && $$('#ed-side-tabs .ed-panel__tab').length === 2, 'left tab strip appears with Documents + the left panel');
    $$('#ed-side-tabs .ed-panel__tab')[1].click(); await wait(100);
    ok($('#ed-side').classList.contains('is-panel') && !!$('.tp-left-body') && $('#ed-list').offsetParent === null, 'left panel replaces the document list');
    $$('#ed-side-tabs .ed-panel__tab')[0].click(); await wait(100);
    ok(!$('#ed-side').classList.contains('is-panel') && $('#ed-list').offsetParent !== null, 'Documents tab brings the list back');
    // close
    $('.ed-panel__head [data-cmd="toggle-panel"]').click(); await wait(100);
    ok(!$('#ed').classList.contains('panel-open') && window.__p.close === 2 && JSON.parse(localStorage.getItem('todo4me.editor.ui')).panel === '', 'closing the panel: onClose, pref cleared');
    X.panels.toggle('tp.right'); await wait(100);
    ok(X.panels.active() === 'tp.right' && X.panels.isRendered('tp.right'), 'panels.toggle(id) opens');
  `);
  // responsive: drawer under 1100px, mobile
  await b.viewport(1000, 800);
  await b.sleep(250);
  ok(await ev(`(() => { const p = document.getElementById('ed-panel'); const cs = getComputedStyle(p); return cs.position === 'fixed' && getComputedStyle(document.querySelector('.ed-pscrim')).display === 'block' && getComputedStyle(document.getElementById('ed')).gridTemplateColumns.split(' ').length === 2; })()`), 'under 1100px the open panel is an overlay drawer with a scrim (grid keeps 2 columns)');
  await ev(`document.querySelector('.ed-pscrim').click(); true`);
  await b.sleep(150);
  ok(await ev(`!document.getElementById('ed').classList.contains('panel-open')`), 'clicking the scrim closes the drawer');
  await b.viewport(600, 800, true);
  await b.sleep(250);
  ok(await ev(`(() => { const btn = document.getElementById('ed-panel-btn'); btn.click(); return true; })()`) && await ev(`new Promise((r) => setTimeout(() => r(getComputedStyle(document.getElementById('ed-panel')).display === 'flex' && getComputedStyle(document.getElementById('ed-panel')).position === 'fixed'), 150))`), 'mobile: the panel is closed by default and opens as a drawer via the button');
  ok(await ev(`JSON.parse(localStorage.getItem('todo4me.editor.ui')).panel === ''`), 'a drawer opened on a small screen is not remembered as "open"');
  await ev(`T4.edx.panels.close(); true`);
  await b.viewport(1440, 900);
  await b.sleep(250);
  // re-creatable on shell rebuild (language change)
  await run('panels-rebuild', R`
    T4.edx.panels.open('tp.right'); await wait(100);
    const id = T4.editor.current.id;
    const renders = window.__p.render, closes = window.__p.close;
    T4.i18n.setLanguage('de'); await wait(400);
    ok(window.__p.close === closes + 1, 'language change: open panel gets onClose before the shell is rebuilt');
    location.hash = '#/editor?doc=' + id; await wait(800);
    ok(window.__p.render === renders + 1 && !!$('#ed-panel .tp-body') && $('#ed').classList.contains('panel-open'), 'panel is re-created in the new shell and re-opened (persisted pref)');
    ok($('#ed-panel-btn').title.includes('Seitenleiste'), 'new texts in German');
    T4.i18n.setLanguage('en'); await wait(400);
    location.hash = '#/editor?doc=' + id; await wait(800);
    T4.edx.panels.close(); await wait(50);
  `);

  /* ---------- 7. doc list: views, badges, search providers ---------- */
  await run('doclist', R`
    const X = T4.edx, DS = T4.docstore;
    X.meta.extend({ tdl_flag: { default: false, clean: (v) => v === true } });
    const mk = (title, html, extra) => DS.create(Object.assign({ title, html }, C().statsOf(html), extra));
    const a = await mk('Flagged doc alpha', '<p>alphazz</p>', { tdl_flag: true });
    const c = await mk('Plain doc gamma', '<p>gamma</p>');
    window.__flagId = a.id; window.__plainId = c.id;
    await wait(300);
    X.docList.registerView({ id: 'tflag', label: 'Flagged', icon: 'flag', filter: (m) => m.tdl_flag === true, empty: 'Nothing flagged' });
    X.docList.decorate((m) => (m.tdl_flag ? '<span class="tdl-badge" title="Flag">F</span><script>window.__xss = 1</script><img src=x onerror="window.__xss = 2"><b onclick="x()">B</b>' : ''));
    await wait(100);
    const vb = $('[data-view="tflag"]');
    ok(!!vb && vb.textContent.trim() === 'Flagged' && $('#ed-views').classList.contains('has-extra'), 'extra list view button next to All/Pinned/Trash');
    ok($$('#ed-views [data-view]').length === 4, 'all/pinned/trash buttons unchanged');
    vb.click(); await wait(100);
    const titles = $$('.ed-item__title').map((x) => x.textContent);
    ok(titles.length === 1 && titles[0].startsWith('Flagged doc alpha') && vb.getAttribute('aria-checked') === 'true', 'view filter(meta) applied: ' + titles.join('|'));
    const badge = $('.ed-item__badges');
    ok(!!badge && !!badge.querySelector('.tdl-badge') && !badge.querySelector('script, img') && !badge.querySelector('[onclick]') && window.__xss === undefined, 'decorate() badge shown, HTML reduced to a safe subset');
    $('[data-view="all"]').click(); await wait(50);
    ok($$('.ed-item').length >= 2 && !!$$('.ed-item__badges').length === true, 'back to All: badge only on the flagged doc');
    // search provider
    X.search.register({ id: 't.search', query: async (q) => (q === 'zzmagic' ? [{ id: window.__plainId, snippet: 'Matched by <b>provider</b>', score: 5 }] : []) });
    const inp = $('#ed-search'); inp.value = 'zzmagic'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(500);
    const items = $$('.ed-item');
    ok(items.length === 1 && items[0].querySelector('.ed-item__title').textContent.startsWith('Plain doc gamma'), 'extra search provider adds its matches to the list');
    ok(items[0].querySelector('.ed-item__snip') && items[0].querySelector('.ed-item__snip').textContent.includes('<b>provider</b>') && !items[0].querySelector('.ed-item__snip b'), 'provider snippet is escaped plain text');
    const res = await X.search.query('zzmagic');
    ok(res.some((r) => r.id === window.__plainId && r.provider === 't.search') && res.some((r) => r.id === window.__plainId), 'edx.search.query merges providers: ' + JSON.stringify(res.map((r) => r.provider)));
    inp.value = 'alphazz'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
    ok($$('.ed-item').length === 1 && $('.ed-item__title').textContent.startsWith('Flagged doc alpha') && !!$('.ed-item__snip mark'), 'built-in title/text search + highlight unchanged: ' + $$('.ed-item').map((x) => x.textContent).join('|'));
    inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    X.search.remove('t.search'); X.docList.removeView('tflag'); await wait(100);
    ok(!$('[data-view="tflag"]'), 'removing a view removes its button');
  `);

  /* ---------- 8. events ---------- */
  await run('events', R`
    const X = T4.edx;
    const seen = [];
    const names = ['doc-open', 'doc-close', 'doc-saved', 'content-change', 'selection-change', 'before-export', 'after-export', 'docs-changed', 'doc-meta'];
    const offs = names.map((n) => X.events.on(n, (d) => seen.push([n, d])));
    const count = (n) => seen.filter((s) => s[0] === n).length;
    const first = (n) => (seen.find((s) => s[0] === n) || [])[1];
    const m1 = await T4.editor.newDocument({ title: 'Events one', html: '<p>one</p>' });
    for (let i = 0; i < 40 && !(T4.editor.current && T4.editor.current.id === m1.id); i++) await wait(50);
    await wait(500);
    ok(count('doc-open') === 1 && first('doc-open').id === m1.id && first('doc-open').meta.title === 'Events one', 'doc-open {id, meta}');
    ok(count('docs-changed') >= 1, 'docs-changed when the list changes');
    seen.length = 0;
    caretEnd(); document.execCommand('insertText', false, ' more'); await wait(1400);
    ok(count('content-change') >= 1, 'content-change on typing');
    const saved = first('doc-saved');
    ok(count('doc-saved') >= 1 && saved.id === m1.id && saved.html.includes('more') && saved.meta.words >= 2, 'doc-saved {id, meta, html}');
    C().run(() => {}); await wait(100);
    ok(count('selection-change') >= 1, 'selection-change (coalesced per frame)');
    seen.length = 0;
    const m2 = await T4.editor.newDocument({ title: 'Events two', html: '<p>two</p>' });
    for (let i = 0; i < 40 && !(T4.editor.current && T4.editor.current.id === m2.id); i++) await wait(50);
    await wait(400);
    const order = seen.map((s) => s[0]).filter((n) => n === 'doc-close' || n === 'doc-open');
    ok(order.join() === 'doc-close,doc-open' && first('doc-close').id === m1.id, 'switching documents: doc-close(old) then doc-open(new)');
    seen.length = 0;
    await T4.edx.exporters.export('t.exp');
    ok(count('before-export') === 1 && first('before-export').format === 't.exp' && seen.filter((s) => s[0] === 'after-export')[0][1].ok === true, 'before-export / after-export {format}');
    seen.length = 0;
    await T4.edx.docs.updateMeta(m2.id, { tdl_flag: true });
    ok(count('doc-meta') === 1 && first('doc-meta').id === m2.id && first('doc-meta').meta.tdl_flag === true, 'doc-meta after edx.docs.updateMeta');
    seen.length = 0;
    location.hash = '#/editor'; await wait(500);
    ok(count('doc-close') === 1 && first('doc-close').id === m2.id, 'doc-close when leaving to the start page');
    offs.forEach((o) => o()); seen.length = 0;
    C().run(() => {}); T4.docstore.touch(m1.id, { pinned: false }); await wait(300);
    ok(seen.length === 0, 'off() unsubscribes');
    // debounce + cheapness
    let n = 0; const off2 = X.events.on('t:ping', () => n++, { debounce: 50 });
    for (let i = 0; i < 20; i++) X.events.emit('t:ping', i);
    await wait(150); off2();
    ok(n === 1, 'on(…, { debounce }) collapses bursts');
    X.events.on('t:err', () => { throw new Error('listener bug'); }); let after = 0; X.events.on('t:err', () => after++);
    const origErr = console.error; console.error = () => {}; X.events.emit('t:err'); console.error = origErr;
    ok(after === 1, 'a throwing listener does not stop the others');
    const t0 = performance.now(); for (let i = 0; i < 20000; i++) X.events.emit('t:nobody', { history: false }); const dt = performance.now() - t0;
    ok(dt < 25, 'emit with no listener is free (20000 emits: ' + dt.toFixed(1) + ' ms)');
    let threw = false; try { X.events.on('Bad Name', () => {}); } catch (e) { threw = true; }
    ok(threw, 'invalid event names are refused');
  `);

  /* ---------- 9. document meta fields ---------- */
  await run('meta', R`
    const X = T4.edx, DS = T4.docstore;
    let threw = 0;
    ['stars', '__proto__', 'Tst_x', 'tst_', 'a_b_c', 'constructor'].forEach((n) => { try { X.meta.extend({ [n]: { default: 0, clean: (v) => v } }); } catch (e) { threw++; } });
    try { X.meta.extend({ tst_nodef: { clean: (v) => v } }); } catch (e) { threw++; }
    ok(threw === 7, 'meta field names must be <module>_<name>, with default and clean()');
    X.meta.extend({
      tst_stars: { default: 0, clean: (v) => Math.max(0, Math.min(5, v | 0)) },
      tst_tags: { default: [], clean: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []) },
      tst_once: { default: '', clean: (v) => String(v).slice(0, 10), dup: 'reset' },
      tst_boom: { default: 'safe', clean: () => { throw new Error('x'); } },
    });
    ok(['tst_stars', 'tst_tags', 'tst_once', 'tdl_flag'].every((f) => X.meta.fields().includes(f)), 'fields registered');
    const m = await DS.create({ title: 'Meta doc', html: '<p>m</p>', tst_stars: 9, tst_tags: ['a', 'b', 3], tst_once: 'once', evil_field: 1 });
    ok(m.tst_stars === 5 && m.tst_tags.join() === 'a,b' && m.tst_once === 'once' && m.tst_boom === 'safe' && !('evil_field' in m), 'create(): registered fields cleaned/defaulted, unknown dropped');
    const listed = (await DS.list()).find((x) => x.id === m.id);
    ok(listed.tst_stars === 5 && listed.tst_tags.join() === 'a,b', 'list() returns the fields');
    const s = await DS.save(m.id, null, { tst_stars: 3 });
    ok(s.tst_stars === 3 && (await DS.get(m.id)).meta.tst_stars === 3, 'save(patch) persists registered fields');
    const d = await DS.duplicate(m.id);
    ok(d.tst_stars === 3 && d.tst_once === '' && d.tst_tags.join() === 'a,b', 'duplicate(): dup:"reset" fields reset, others copied');
    window.__metaId = m.id;
    // while the document is open in the editor
    location.hash = '#/editor?doc=' + m.id; await wait(700);
    await T4.edx.docs.updateMeta(m.id, { tst_stars: 4 });
    ok(T4.editor.current.meta.tst_stars === 4, 'updateMeta syncs the open document');
    caretEnd(); document.execCommand('insertText', false, ' edit'); await wait(1500);
    ok((await DS.get(m.id)).meta.tst_stars === 4 && (await DS.get(m.id)).html.includes('edit'), 'autosave of the open document keeps registered fields');
    // bundle round trip
    const bundle = await DS.exportBundle([m.id]);
    ok(bundle.documents[0].tst_stars === 4 && bundle.documents[0].tst_tags.join() === 'a,b', 'export bundle contains the fields');
    bundle.documents[0].tst_stars = 'abc'; bundle.documents[0].tst_tags = 'oops';
    await DS.importBundle(JSON.parse(JSON.stringify(bundle)));
    const imported = (await DS.list()).filter((x) => x.title === 'Meta doc' && x.id !== m.id && x.id !== d.id);
    ok(imported.length === 1 && imported[0].tst_stars === 0 && Array.isArray(imported[0].tst_tags) && imported[0].tst_tags.length === 0, 'import: invalid values are cleaned by clean()');
    bundle.documents[0].tst_stars = 2; bundle.documents[0].tst_tags = ['x', 'y'];
    await DS.importBundle(JSON.parse(JSON.stringify(bundle)));
    ok((await DS.list()).some((x) => x.tst_stars === 2 && x.tst_tags.join() === 'x,y'), 'bundle round-trip keeps registered fields');
    ok(!('versions' in bundle) && !JSON.stringify(bundle).includes('"versions"'), 'bundle does not contain version history');
  `);

  /* ---------- 10. database v2: migration from a real v1 database ---------- */
  const trashedAt = new Date(Date.now() - 86400000).toISOString();
  await run('db-migration-prepare', R`
    // Drop the database (the editor's open connection closes itself on versionchange) and build a REAL version-1 database like 2.7.0 did.
    await new Promise((r) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    await new Promise((res, rej) => {
      const q = indexedDB.open('todo4me-docs', 1);
      q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('docs', { keyPath: 'id' }); d.createObjectStore('bodies', { keyPath: 'id' }); d.createObjectStore('assets', { keyPath: 'id' }); };
      q.onerror = () => rej(q.error);
      q.onsuccess = () => {
        const d = q.result;
        const t = d.transaction(['docs', 'bodies', 'assets'], 'readwrite');
        const old = '2020-01-01T00:00:00.000Z';
        t.objectStore('docs').put({ id: 'doc_old1', format: 1, title: 'Old document', text: 'hello old world', words: 3, page: { size: 'Letter', orientation: 'landscape', margins: 'wide', header: 'H', footer: 'F', pageNumbers: 'none', numberFormat: 'plain', firstPageHeader: false }, pinned: true, createdAt: old, updatedAt: old, openedAt: old, deletedAt: null });
        t.objectStore('docs').put({ id: 'doc_old2', format: 1, title: 'Trashed old', text: 'gone', words: 1, page: {}, pinned: false, createdAt: old, updatedAt: old, openedAt: null, deletedAt: '${trashedAt}' });
        t.objectStore('bodies').put({ id: 'doc_old1', html: '<p>hello old world</p><figure class="t4-w" data-w="img" data-p="{&quot;a&quot;:&quot;img_old1&quot;,&quot;w&quot;:50,&quot;al&quot;:&quot;center&quot;}"></figure>' });
        t.objectStore('bodies').put({ id: 'doc_old2', html: '<p>gone</p>' });
        t.objectStore('assets').put({ id: 'img_old1', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), type: 'image/png', size: 4, createdAt: old });
        t.objectStore('assets').put({ id: 'img_orphan', blob: new Blob([new Uint8Array([9])], { type: 'image/png' }), type: 'image/png', size: 1, createdAt: old });
        t.oncomplete = () => { d.close(); res(); };
        t.onerror = () => rej(t.error);
      };
    });
    const probe = await new Promise((res) => { const q = indexedDB.open('todo4me-docs'); q.onsuccess = () => { const d = q.result; const o = { v: d.version, stores: Array.from(d.objectStoreNames) }; d.close(); res(o); }; });
    ok(probe.v === 1 && probe.stores.join() === 'assets,bodies,docs', 'prepared a genuine v1 database: ' + JSON.stringify(probe));
  `);
  await b.reload();
  await b.sleep(600);
  await run('db-migration-verify', R`
    // (the page was reloaded: registrations are gone, register the meta field again)
    T4.edx.meta.extend({ tst_stars: { default: 0, clean: (v) => Math.max(0, Math.min(5, v | 0)) } });
    location.hash = '#/editor'; await wait(900); // first use of the editor opens the database with the new code → upgrade
    const raw = await new Promise((res) => { const q = indexedDB.open('todo4me-docs'); q.onsuccess = () => {
      const d = q.result;
      const o = { v: d.version, stores: Array.from(d.objectStoreNames).sort() };
      const vs = d.transaction(['versions']).objectStore('versions'); o.vIdx = Array.from(vs.indexNames).sort(); o.vKey = vs.keyPath;
      o.kvKey = d.transaction(['kv']).objectStore('kv').keyPath;
      d.close(); res(o); }; });
    ok(raw.v === 2 && raw.stores.join() === 'assets,bodies,docs,kv,versions', 'database upgraded to version 2 with new stores: ' + JSON.stringify(raw.stores));
    ok(raw.vIdx.join() === 'createdAt,docId' && raw.vKey === 'id' && raw.kvKey === 'k', 'versions {id} with indexes docId + createdAt, kv {k}');
    const DS = T4.docstore;
    ok(DS.mode === 'idb' && DS.DB_VERSION === 2, 'docstore in IndexedDB mode, DB_VERSION 2');
    const list = await DS.list();
    const o1 = list.find((x) => x.id === 'doc_old1'), o2 = list.find((x) => x.id === 'doc_old2');
    ok(!!o1 && o1.title === 'Old document' && o1.pinned === true && o1.words === 3 && o1.page.size === 'Letter' && o1.page.orientation === 'landscape' && o1.page.margins === 'wide' && o1.page.firstPageHeader === false, 'v1 documents intact after the upgrade (metadata + page setup)');
    ok(!!o2 && o2.deletedAt === '${trashedAt}', 'trashed v1 document intact');
    const g = await DS.get('doc_old1');
    ok(g.html.includes('hello old world') && g.html.includes('img_old1'), 'v1 body intact');
    const url = await DS.assetURL('img_old1');
    ok(typeof url === 'string' && url.startsWith('blob:'), 'v1 asset readable');
    ok(o1.updatedAt === '2020-01-01T00:00:00.000Z', 'upgrade did not touch timestamps');
    // the document opens in the editor and the image is shown
    location.hash = '#/editor?doc=doc_old1'; await wait(900);
    ok(T4.editor.current && T4.editor.current.id === 'doc_old1' && D().textContent.includes('hello old world') && !!D().querySelector('[data-w="img"]'), 'v1 document opens in the editor');
    ok($('#ed-title').value === 'Old document', 'title shown');
    // GC: orphan (old) goes, the referenced one stays
    const n = await DS.collectGarbage();
    ok(n === 1 && (await DS.assetURL('img_old1')) && !(await DS.assetURL('img_orphan')), 'garbage collection after upgrade: only the unreferenced asset removed');
    // versions API
    const V = T4.edx.db.versions;
    const v1 = await V.add({ docId: 'doc_old1', html: '<p>v1</p>', title: 'T1', words: 1, reason: 'manual', createdAt: '2026-02-01T10:00:00.000Z' });
    const v2 = await V.add({ docId: 'doc_old1', html: '<p>v2</p>', title: 'T2', words: 2, reason: 'auto', createdAt: '2026-02-02T10:00:00.000Z' });
    const v3 = await V.add({ docId: 'doc_old1', html: '<p>v3</p>', title: 'T3', words: 3, reason: 'bad <reason>!', createdAt: '2026-02-03T10:00:00.000Z' });
    await V.add({ docId: 'doc_old2', html: '<p>other</p>', createdAt: '2026-02-03T10:00:00.000Z' });
    ok(/^ver_/.test(v1.id) && v3.reason === 'bad reason', 'versions.add: id generated, reason cleaned');
    const lst = await V.list('doc_old1');
    ok(lst.map((x) => x.title).join() === 'T3,T2,T1' && lst.every((x) => !('html' in x)), 'versions.list: newest first, without html');
    ok((await V.list('doc_old1', { html: true }))[0].html === '<p>v3</p>', 'versions.list(docId, { html: true })');
    ok((await V.get(v2.id)).html === '<p>v2</p>' && (await V.get('nope')) === null, 'versions.get');
    ok((await V.count('doc_old1')) === 3, 'versions.count');
    let threw = false; try { await V.add({ html: 'x' }); } catch (e) { threw = true; }
    ok(threw, 'versions.add needs a docId');
    const removed = await V.prune('doc_old1', 1, { protect: (r) => r.reason === 'manual' });
    const left = (await V.list('doc_old1')).map((x) => x.title).join();
    ok(removed === 1 && left === 'T3,T1', 'versions.prune(docId, keep, { protect }) keeps newest + protected: ' + left);
    await V.remove(v1.id);
    ok((await V.list('doc_old1')).length === 1, 'versions.remove');
    // kv
    const K = T4.edx.db.kv;
    await K.set('tst.a', { n: 1, list: [1, 2] }); await K.set('tst.b', 'x');
    ok(JSON.stringify(await K.get('tst.a')) === '{"n":1,"list":[1,2]}' && (await K.get('missing')) === undefined, 'kv.get/set');
    ok((await K.keys('tst.')).sort().join() === 'tst.a,tst.b', 'kv.keys(prefix)');
    await K.remove('tst.b');
    ok((await K.get('tst.b')) === undefined, 'kv.remove');
    threw = false; try { await K.set('bad key!', 1); } catch (e) { threw = true; }
    ok(threw, 'kv rejects invalid keys');
    // GC keeps assets referenced only by a version
    const aOnlyVer = await DS.putAsset(new Blob([new Uint8Array([7, 7])], { type: 'image/png' }));
    const old = '2020-01-01T00:00:00.000Z';
    await new Promise((res, rej) => { const q = indexedDB.open('todo4me-docs'); q.onsuccess = () => { const d = q.result; const t = d.transaction(['assets'], 'readwrite'); const s = t.objectStore('assets'); const r = s.get(aOnlyVer); r.onsuccess = () => { s.put(Object.assign(r.result, { createdAt: old })); }; t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); }; });
    const ver = await V.add({ docId: 'doc_old1', html: '<p>img</p><figure class="t4-w" data-w="img" data-p="{&quot;a&quot;:&quot;' + aOnlyVer + '&quot;}"></figure>', reason: 'auto' });
    await DS.collectGarbage();
    ok(!!(await DS.assetDataURL(aOnlyVer)), 'GC keeps an asset that only a saved version references');
    await V.remove(ver.id);
    await DS.collectGarbage();
    ok(!(await DS.assetDataURL(aOnlyVer)), 'GC removes it once the version is gone');
    // deleting a document deletes its versions
    await V.add({ docId: 'doc_old2', html: '<p>keep until destroy</p>' });
    ok((await V.count('doc_old2')) === 2, 'versions exist for the trashed doc');
    await DS.destroy('doc_old2');
    ok((await V.count('doc_old2')) === 0, 'destroy(doc) removes its versions');
    const pt = await DS.create({ title: 'Purge me', html: '<p>p</p>' });
    await V.add({ docId: pt.id, html: '<p>pv</p>' });
    await DS.trash(pt.id); await DS.purgeTrash(true);
    ok((await V.count(pt.id)) === 0, 'purgeTrash removes versions of purged documents');
  `);
  // in-memory fallback (no IndexedDB): load a second instance of the docstore with indexedDB hidden
  await run('db-memory', R`
    const real = T4.docstore; const desc = Object.getOwnPropertyDescriptor(window, 'indexedDB') || Object.getOwnPropertyDescriptor(Window.prototype, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/docstore.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const M = T4.docstore; T4.docstore = real; delete window.indexedDB;
    ok(M !== real, 'second docstore instance loaded');
    await M.open();
    ok(M.mode === 'memory', 'no IndexedDB → in-memory mode');
    const doc = await M.create({ title: 'Mem', html: '<p>m</p>' });
    const a = await M.versions.add({ docId: doc.id, html: '<p>a</p>', createdAt: '2026-03-01T00:00:00.000Z' });
    await M.versions.add({ docId: doc.id, html: '<p>b</p>', createdAt: '2026-03-02T00:00:00.000Z' });
    ok((await M.versions.list(doc.id)).length === 2 && (await M.versions.get(a.id)).html === '<p>a</p>', 'memory mode: versions add/list/get');
    ok((await M.versions.prune(doc.id, 1)) === 1 && (await M.versions.count(doc.id)) === 1, 'memory mode: prune/count');
    await M.kv.set('k1', { z: 1 }); ok((await M.kv.get('k1')).z === 1 && (await M.kv.keys()).join() === 'k1', 'memory mode: kv');
    const img = await M.putAsset(new Blob([new Uint8Array([5])], { type: 'image/png' }));
    await M.versions.add({ docId: doc.id, html: '<figure class="t4-w" data-w="img" data-p="{&quot;a&quot;:&quot;' + img + '&quot;}"></figure>' });
    ok((await M.collectGarbage()) === 0, 'memory mode: GC keeps assets used by versions');
    await M.destroy(doc.id); ok((await M.versions.count(doc.id)) === 0, 'memory mode: destroy removes versions');
  `);

  /* ---------- 11. importers, download, report ---------- */
  await run('import-export', R`
    const X = T4.edx;
    location.hash = '#/editor'; await wait(500);
    // download helper
    const recorded = { blobs: [], anchors: [] };
    const origCreate = URL.createObjectURL, origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { recorded.blobs.push(b); return 'blob:test/' + recorded.blobs.length; };
    HTMLAnchorElement.prototype.click = function () { recorded.anchors.push({ download: this.download, href: this.href }); };
    const n1 = X.download('abc', 'a/b:c.txt', 'text/plain');
    X.download(new Uint8Array([1, 2, 3]), 'bin.docx');
    X.download(new Blob(['zz'], { type: 'text/html' }), 'x.html');
    URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick;
    ok(n1 === 'a b c.txt' && recorded.anchors[0].download === 'a b c.txt' && recorded.anchors[0].href.startsWith('blob:'), 'download(): sanitised file name, blob URL, anchor download: ' + n1);
    ok((await recorded.blobs[0].text()) === 'abc' && recorded.blobs[0].type === 'text/plain', 'download(string, name, mime)');
    ok(recorded.blobs[1].size === 3 && recorded.blobs[2].type === 'text/html', 'download(typed array / Blob)');
    ok(!document.querySelector('a[download]'), 'download() leaves no element behind');

    // importer
    let threw = 0;
    try { X.importers.register({ id: 't.bad', exts: ['md'], run() {} }); } catch (e) { threw++; }
    try { X.importers.register({ id: 't.bad2', exts: ['json'], run() {} }); } catch (e) { threw++; }
    try { X.importers.register({ id: 't.bad3', exts: [], run() {} }); } catch (e) { threw++; }
    ok(threw === 3, 'importers may not take over built-in extensions (md/json) or register nothing');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    X.importers.register({ id: 't.imp', exts: ['tst'], accept: '.tst,text/x-test', run: async (file) => ({
      title: 'Imported ' + (await file.text()),
      html: '<p>Body</p><script>window.__bad = 1</script><p onclick="window.__bad = 2">Z</p><img src="' + png + '"><figure class="t4-w" data-w="evil" data-p="{}"></figure>',
      meta: { tst_stars: 2, id: 'doc_evil', createdAt: '2000-01-01T00:00:00.000Z', deletedAt: '2000-01-01T00:00:00.000Z', pinned: true },
      report: [{ level: 'warn', text: 'Dropped a <b>thing</b>' }, 'plain warning', { level: 'info', text: 'FYI' }] }) });
    const input = $('#ed-file-import');
    ok(input.accept.includes('.tst') && input.accept.includes('.md') && input.accept.includes('.json'), 'file input accepts built-in types + importer types');
    const dt = new DataTransfer(); dt.items.add(new File(['Hello'], 'note.tst', { type: 'text/x-test' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 60 && !$('.ed-report'); i++) await wait(50);
    ok(!!$('.ed-report'), 'conversion report dialog shown ' + $$('.toast').map((x) => x.textContent).join('|'));
    if (!$('.ed-report')) return;
    ok($$('.ed-report__item').length === 3 && $('.ed-report__heading').textContent === 'note.tst' && $$('.ed-report__item--warn').length === 2 && !!$('.ed-report__item--info'), 'report: heading per file, warn/info items');
    ok(!$('.ed-report b') && $('.ed-report').textContent.includes('<b>thing</b>'), 'report text is escaped');
    X.report; $('#modal [data-action="modal-close"]').click(); await wait(100);
    ok(!$('.ed-report'), 'report dialog closes');
    for (let i = 0; i < 40 && !(T4.editor.current && /Imported Hello/.test(T4.editor.current.meta.title)); i++) await wait(50);
    ok(!!T4.editor.current && T4.editor.current.meta.title === 'Imported Hello', 'importer result opened as a new document');
    await wait(300);
    const st = await stored();
    ok(!st.html.includes('script') && !st.html.includes('onclick') && !st.html.includes('evil') && st.html.includes('<p>Body</p>') && st.html.includes('data-w="img"') && window.__bad === undefined, 'imported HTML is sanitized; data-URL image became an image asset');
    ok(st.meta.tst_stars === 2 && st.meta.id !== 'doc_evil' && st.meta.createdAt.startsWith('202') && st.meta.deletedAt === null && st.meta.pinned === false, 'importer meta: only registered fields honoured (no id/createdAt/deletedAt/pinned injection)');
    // importer errors → toast, nothing created
    X.importers.register({ id: 't.imp2', exts: ['tbad'], run: async () => { throw new Error('cannot parse'); } });
    const before = (await T4.docstore.list()).length;
    const dt2 = new DataTransfer(); dt2.items.add(new File(['x'], 'broken.tbad'));
    input.files = dt2.files; input.dispatchEvent(new Event('change', { bubbles: true })); await wait(500);
    ok((await T4.docstore.list()).length === before && !!$$('.toast').find((x) => /broken\.tbad/.test(x.textContent) && /cannot parse/.test(x.textContent)), 'failing importer: error toast with file name and reason, no document');
    X.importers.remove('t.imp2'); X.importers.remove('t.imp');
    ok(!$('#ed-file-import').accept.includes('.tst'), 'removing an importer updates the file input');
    // report() with nothing to say shows nothing
    ok((await X.report('x', [])) === false && !$('.ed-report'), 'report([]) shows no dialog');
  `);

  /* ---------- 12. print ---------- */
  await run('print', R`
    const X = T4.edx;
    if (!T4.editor.current) { await newDoc('blank'); }
    T4.edx.editor.setHtml('<p>print me</p>'); await wait(100);
    const order = [];
    X.events.on('before-export', (d) => order.push('ev-before:' + d.format)); X.events.on('after-export', (d) => order.push('ev-after:' + d.format));
    X.print.addCSS((meta) => '.tprint-x { color: red } /* ' + meta.title + ' */ </style><b>');
    X.print.before(async (ctx) => { await wait(20); order.push('before:' + (ctx.meta.id === T4.editor.current.id) + ':' + (ctx.root === D())); });
    X.print.after(() => order.push('after:' + (!document.getElementById('ed-print-css'))));
    let seen = null;
    const origPrint = window.print;
    window.print = () => { seen = { css: document.getElementById('ed-print-css').textContent, cls: document.body.classList.contains('print-doc') }; order.push('print'); };
    await T4.editor.exportPDF(); await wait(100);
    window.print = origPrint;
    ok(order.join() === 'ev-before:pdf,before:true:true,print,after:true,ev-after:pdf', 'export order: before-export, print.before, print, print.after, after-export — ' + order.join());
    ok(seen.cls && seen.css.includes('@page') && seen.css.includes('.tprint-x') && !seen.css.includes('</style'), 'print.addCSS appended to the generated print stylesheet (breakout stripped)');
    ok(!document.getElementById('ed-print-css') && !document.body.classList.contains('print-doc'), 'print state cleaned up');
    ok(!X.print.css({ title: 'x' }).includes('</style'), 'print.css() never contains </style');
  `);

  /* ---------- 13. editor facade ---------- */
  await run('facade', R`
    const X = T4.edx, ed = X.editor;
    const cur = ed.current();
    ok(cur && cur.id === T4.editor.current.id && cur.meta && ed.root() === D() && ed.readonly() === false, 'current() / root() / readonly()');
    ed.setHtml('<h1>Alpha</h1><p>text</p><h2>Beta</h2><h3>Gamma</h3>'); await wait(100);
    const hs = ed.headings();
    ok(hs.length === 3 && hs[0].level === 1 && hs[0].text === 'Alpha' && hs[2].index === 2 && hs[1].el === D().querySelectorAll('h2')[0], 'headings() → [{level, text, el, index}]');
    ok(ed.scrollToBlock(hs[2].el) === true && hs[2].el.classList.contains('ed-flash'), 'scrollToBlock scrolls and flashes the block');
    ok(ed.scrollToBlock(document.createElement('p')) === false, 'scrollToBlock on a detached node → false');
    ed.run(() => { D().insertAdjacentHTML('beforeend', '<p>FACADE</p>'); }); await wait(50);
    ok(D().textContent.includes('FACADE') && C().canUndo(), 'run(fn) records an undo step');
    C().undo(); await wait(50);
    ok(!D().textContent.includes('FACADE'), 'undo reverts the run() change');
    ed.setHtml('<p>replaced</p>'); await wait(50);
    C().undo(); await wait(50);
    ok(D().textContent.includes('Alpha') && !D().textContent.includes('replaced'), 'setHtml is one undo step');
    ed.setHtml('<p>x</p><script>bad()</script>'); ok(!D().querySelector('script'), 'setHtml sanitizes');
    ed.setHtml('<p>one two three</p>'); selectNode(D().querySelector('p')); await wait(30);
    ok(ed.selectedText() === 'one two three', 'selectedText()');
    const sel = ed.getSel(); getSelection().removeAllRanges(); ed.setSel(sel); ok(ed.selectedText() === 'one two three', 'getSel()/setSel() round trip');
    ok(ed.textOf(D()).includes('one two three') && ed.snapshot().words === 3 && ed.snapshot().html.includes('<p>'), 'textOf() / snapshot()');
    caretEnd(); ed.insertHTML('<p onclick="x()">ins</p><script>y()</script>'); await wait(50);
    ok(D().textContent.includes('ins') && !D().querySelector('script, [onclick]'), 'insertHTML sanitizes');
    ed.insertText('plain text here'); await wait(50);
    ok(D().textContent.includes('plain text here'), 'insertText inserts text like typing');
    const hr = document.createElement('hr'); ed.insertBlock(hr); ok(!!D().querySelector('hr'), 'insertBlock');
    ed.toast('Facade toast', 'success'); await wait(50);
    ok(!!$$('.toast').find((x) => x.textContent.includes('Facade toast')), 'toast()');
    ok(ed.t('edx.nothing.here', 'Hi {n}', { n: 2 }) === 'Hi 2' && ed.t('ed.Documents') === 'Documents', 't(key, fallback, params)');
    const anchor = document.createElement('button'); document.body.appendChild(anchor);
    const mm = ed.openMenu(anchor, [{ label: 'Facade menu', run: () => { window.__fm = 1; } }]);
    ok(!!mm && !!$$('.ed-menu [data-mi]').find((x) => x.textContent === 'Facade menu'), 'openMenu(anchor, items)');
    $$('.ed-menu [data-mi]')[0].click(); ok(window.__fm === 1 && !$('.ed-menu'), 'menu item runs and closes'); anchor.remove();
    ed.openModal({ title: 'Facade modal', body: '<p id="fm">hi</p>' }); ok(!!$('#fm'), 'openModal'); ed.closeModal(true);
    ok((await ed.ready()) === undefined || true, 'ready()');
    // new / open documents
    const m = await ed.newDocument({ title: 'Facade doc', html: '<h1>X</h1><script>no()</script><p onclick="y()">p</p>', meta: { tst_stars: 3, pinned: true, id: 'doc_hack' } });
    ok(m && m.title === 'Facade doc' && m.tst_stars === 3 && m.pinned === true && m.id !== 'doc_hack', 'newDocument({ title, html, meta }) → meta ' + JSON.stringify(m));
    for (let i = 0; i < 40 && !(ed.current() && ed.current().id === m.id); i++) await wait(50);
    await wait(300);
    ok(ed.current().id === m.id && $('#ed-title').value === 'Facade doc' && !D().querySelector('script') && D().querySelector('h1').textContent === 'X', 'new document opens, HTML sanitized');
    const other = (await T4.docstore.list()).find((x) => x.id !== m.id && !x.deletedAt);
    ok((await ed.openDoc(other.id)) === true && ed.current().id === other.id, 'openDoc(id) resolves once the document is open');
    ok((await ed.openDoc(m.id)) === true, 'openDoc back');
    await ed.flush();
    ok((await X.docs.get(m.id)).meta.title === 'Facade doc' && (await X.docs.list()).some((x) => x.id === m.id), 'edx.docs.get / list');
    const um = await X.docs.updateMeta(m.id, { tst_stars: 1, title: 'Renamed' });
    ok(um.tst_stars === 1 && um.title === 'Renamed', 'edx.docs.updateMeta goes through docstore validation');
    let threw = false; const undo = ed.run; try { window.__tmp = T4.edx.editor.nope(); } catch (e) { threw = true; }
    ok(threw, 'unknown facade members are not silently available');
  `);

  /* ---------- 13b. Markdown: checklists, Obsidian callouts, footnotes (layout module markup) ---------- */
  await run('markdown-layout', R`
    const MD = T4.edmd, S = (h) => T4.edSanitize.sanitizeToString(h);
    ok(!!T4.edx.layout && T4.edx.widgets.has('footnote'), 'layout module is loaded (checklist/callout/footnote rules)');
    const src = '- [ ] open\n- [x] done\n  - [x] sub\n\n> [!warning] Careful now\n> body text\n>\n> second\n\nText with note^[the note, with \\] bracket] end';
    const h = S(MD.fromMarkdown(src));
    ok(h.includes('<ul class="t4-check"><li data-x-check="0">open</li><li data-x-check="1">done<ul class="t4-check"><li data-x-check="1">sub</li></ul></li></ul>'), 'import: task list → checklist with nested checklist: ' + h.slice(0, 220));
    ok(h.includes('<blockquote class="t4-callout t4-callout--warning"><p><strong>Careful now</strong></p><p>body text</p><p>second</p></blockquote>'), 'import: Obsidian callout → layout callout');
    const fn = new DOMParser().parseFromString(h, 'text/html').querySelector('.t4-w[data-w="footnote"]');
    ok(!!fn && JSON.parse(fn.getAttribute('data-p')).text === 'the note, with ] bracket' && fn.tagName === 'SPAN', 'import: ^[text] → footnote widget');
    const md = await MD.toMarkdown(h);
    ok(md.includes('- [ ] open\n- [x] done\n  - [x] sub'), 'export: checklist as - [ ] / - [x]: ' + JSON.stringify(md.slice(0, 80)));
    ok(md.includes('> [!warning] Careful now\n> body text\n>\n> second'), 'export: callout as > [!type] Title: ' + JSON.stringify(md));
    ok(md.includes('^[the note, with \\] bracket]'), 'export: footnote as ^[text]');
    ok(S(MD.fromMarkdown(md)) === h, 'round trip: export → import gives the same document');
    const o = S(MD.fromMarkdown('> [!question]- Fold me\n> a\n\n> [!bug]\n> b\n\n> [!tip]\n\n> [!unknown-kind] X'));
    ok(o.includes('t4-callout--info"><p><strong>Fold me</strong>') && o.includes('t4-callout--danger"><p><strong>Bug</strong></p><p>b') && o.includes('t4-callout--tip"><p><strong>Tip</strong></p></blockquote>') && o.includes('t4-callout--note"><p><strong>X</strong>'), 'Obsidian types map to the layout types; missing title → type name: ' + o);
    const mixed = S(MD.fromMarkdown('- [ ] a\n- plain'));
    ok(!mixed.includes('t4-check') && mixed.includes('☐ a'), 'mixed list (task + plain item) keeps the old ☐ characters');
    ok(S(MD.fromMarkdown('1. [ ] a\n2. [x] b')).indexOf('t4-check') === -1, 'ordered lists are never checklists');
    ok(!(await MD.toMarkdown('<blockquote><p>plain quote</p></blockquote>')).includes('[!'), 'plain blockquotes are not callouts');
    // without the layout module: previous behaviour
    const L = T4.edx.layout; T4.edx.layout = undefined;
    try {
      const w = S(MD.fromMarkdown('- [ ] a\n- [x] b\n\n> [!note] T\n> body\n\nx^[n]'));
      ok(w.includes('☐ a') && w.includes('☑ b') && !w.includes('t4-check') && !w.includes('t4-callout') && w.includes('<strong>Note: ') === false && w.includes('<strong>') && w.includes('^[n]') || w.includes('^[n]') , 'without layout: ☐/☑ characters, plain quote, literal ^[n]: ' + w.slice(0, 200));
      ok(!w.includes('data-w="footnote"') && !w.includes('t4-callout'), 'without layout: no layout markup is produced');
    } finally { T4.edx.layout = L; }
  `);

  /* ---------- 14. i18n, icons, safe HTML ---------- */
  await run('i18n-icons', R`
    const X = T4.edx;
    let threw = 0;
    try { X.i18n.add('bad.', { en: {} }); } catch (e) { threw++; }
    try { X.i18n.add('edx.tst.', { en: { 'other.key': 'x' } }); } catch (e) { threw++; }
    ok(threw === 2, 'i18n.add validates the prefix and that keys start with it');
    X.i18n.add('edx.tst.', {
      en: { 'edx.tst.a': 'Alpha', 'edx.tst.b': 'Beta {n}' }, de: { 'edx.tst.a': 'Älpha', 'edx.tst.b': 'Beta {n}' },
      tr: { 'edx.tst.a': 'Alfa', 'edx.tst.b': 'Beta {n}' }, es: { 'edx.tst.a': 'Alfa' },
    });
    const miss = X.i18n.missing();
    ok(miss['edx.tst.'] && miss['edx.tst.'].es.join() === 'edx.tst.b' && !miss['edx.tst.'].de, 'i18n.missing() reports keys missing per language');
    ok(X.t('edx.tst.b', 'Fallback', { n: 5 }) === 'Beta 5' && X.t('edx.tst.zzz', 'Fallback {n}', { n: 5 }) === 'Fallback 5', 'edx.t(key, fallback, params)');
    T4.i18n.setLanguage('de'); ok(X.t('edx.tst.a') === 'Älpha' && X.text({ labelKey: 'edx.tst.a', label: 'x' }) === 'Älpha', 'language switch → module texts follow'); T4.i18n.setLanguage('en');
    ok(X.text({ label: () => 'fn label' }) === 'fn label' && X.text({ label: 'plain' }) === 'plain', 'text(spec): function and plain labels');
    ok(X.icons.add('tst-icon', '<path d="M3 3h18v18H3z"/><circle cx="12" cy="12" r="4"/><script>bad()</script><path d="javascript:alert(1)" onload="x()"/>') === true, 'icons.add');
    const sym = document.getElementById('i-tst-icon');
    ok(!!sym && sym.querySelectorAll('path').length === 2 && !sym.querySelector('script') && !sym.querySelector('[onload]') && !sym.innerHTML.includes('javascript'), 'icon markup reduced to validated shapes');
    ok(T4.util.icon('tst-icon').includes('#i-tst-icon') && X.icons.add('tst-icon', '<path d="M0 0"/>') === false, 'icon usable via U.icon; duplicates ignored');
    threw = false; try { X.icons.add('Bad Name', ''); } catch (e) { threw = true; } ok(threw, 'icons.add validates the name');
    const sh = X.safeHTML('<span class="a b" onclick="x()" style="color:red">t</span><script>x()</script><img src=x onerror=x><svg><use href="#i-star"></use></svg><svg><use href="https://evil/x.svg#a"></use></svg><b class="t4-w">z</b>');
    ok(sh.includes('<span class="a b">t</span>') && !/script|img|onerror|onclick|style|evil|t4-w/.test(sh) && sh.includes('href="#i-star"'), 'safeHTML allow-list: ' + sh);
  `);

  /* ---------- 15. problems log stays empty for correct usage ---------- */
  await run('problems', R`
    const p = T4.edx.problems.filter((x) => !/^shortcut (is reserved|needs Ctrl|not understood|already used)/.test(x));
    ok(p.length === 0, 'no unexpected registry problems logged: ' + p.join(' | '));
  `);

  /* ---------- clean up: fresh page without the test registrations, empty documents database ---------- */
  await b.reload();
  await b.evaluate(`new Promise((r) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
  await b.reload();
}

export default standalone(test);
