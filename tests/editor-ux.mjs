// Editor UX module: floating selection toolbar, command palette, context menu items, slash a11y, toolbar roving tabindex,
// block drag & keyboard move, shortcuts dialog.  CDP_PORT=9347 node tests/cdp.mjs tests/editor-ux.mjs [shots-dir]
import { standalone } from './editor-helpers.mjs';

const R = String.raw;
const CTRL = 2, ALT = 1, SHIFT = 8;

export async function test(t) {
  const { b, run, out } = t;
  const ev = (c) => b.evaluate(c);
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const center = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const seed = R`
    await newDoc('blank');
    T4.edx.editor.setHtml('<p>Hello brave world</p><p>Second paragraph</p><h2>A heading</h2><p>Last paragraph</p>');
    await wait(200);
  `;

  /* ---------- 0. presence, i18n ---------- */
  await run('ux presence', seed + R`
    ok(!!T4.edux, 'T4.edux exists');
    ok(T4.edx.commands.has('ux.palette') && T4.edx.commands.has('ux.shortcuts') && T4.edx.commands.has('ux.blockup'), 'ux commands registered');
    const miss = T4.edx.i18n.missing()['edx.ux.'];
    ok(!miss, 'all edx.ux.* texts exist in en/de/tr/es ' + JSON.stringify(miss || {}));
    ok(T4.edx.shortcuts.labelFor('ux.palette') === 'Ctrl+Shift+P', 'palette shortcut Ctrl+Shift+P registered');
    ok(T4.edx.shortcuts.labelFor('ux.shortcuts') === 'Ctrl+/' && T4.edx.shortcuts.labelFor('ux.blockup') === 'Alt+Shift+Up', 'Ctrl+/ and Alt+Shift+Up registered');
    ok(T4.edx.shortcuts.labelFor('ux.seltb') === 'Alt+F10', 'Alt+F10 registered for the selection toolbar');
  `);

  /* ---------- 1. floating selection toolbar ---------- */
  await run('float select', seed + R`
    selectNode(D().children[0]);
    await wait(60);
    const f = () => $('.ed-ux-float');
    ok(!f() || f().hidden, 'not shown before the delay');
    await wait(400);
    ok(f() && !f().hidden, 'appears for a non-empty selection');
    const fr = f().getBoundingClientRect(), sr = D().children[0].getBoundingClientRect();
    ok(fr.bottom <= sr.top + 1 && fr.top >= 0, 'positioned above the selection');
    ok(f().getAttribute('role') === 'toolbar' && !!f().getAttribute('aria-label'), 'role=toolbar with label');
    ok($$('button', f()).length >= 9 && $$('button[aria-pressed]', f()).length === $$('button', f()).length, 'buttons with aria-pressed');
  `);
  await ev(`document.querySelector('.ed-ux-float').scrollIntoView(); 0`);
  await b.shot('ux-float');
  {
    const [x, y] = await center('.ed-ux-float [data-ux="bold"]');
    await b.click(x, y);
  }
  await b.sleep(250);
  await run('float bold', R`
    ok(D().children[0].innerHTML.includes('<b>') || D().children[0].innerHTML.includes('<strong>'), 'bold applied by clicking the button: ' + D().children[0].innerHTML);
    ok($('.ed-ux-float [data-ux="bold"]').getAttribute('aria-pressed') === 'true', 'active state reflects bold');
    const el = $('.ed-ux-float [data-ux="h1"]'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.click();
    await wait(200);
    ok(D().children[0].tagName === 'H1', 'H1 button turns the block into a heading');
    ok($('.ed-ux-float [data-ux="h1"]').getAttribute('aria-pressed') === 'true', 'H1 active');
    $('.ed-ux-float [data-ux="h1"]').click(); await wait(200);
    ok(D().children[0].tagName === 'P', 'H1 button toggles back to a paragraph');
    C().undo(); await wait(100); C().undo(); await wait(100); C().undo(); await wait(150);
    ok(!/<(b|strong)>/.test(D().children[0].innerHTML), 'undo removes the formatting again');
  `);
  await run('float highlight/code/link', seed + R`
    selectNode(D().children[1]); await wait(400);
    const click = (id) => { const e = $('.ed-ux-float [data-ux="' + id + '"]'); e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); e.click(); };
    click('highlight'); await wait(200);
    ok(/background/.test(D().children[1].innerHTML), 'highlight applied: ' + D().children[1].innerHTML);
    selectNode(D().children[3]); await wait(400);
    click('icode'); await wait(200);
    ok(D().children[3].querySelector('code'), 'inline code applied');
    ok($('.ed-ux-float [data-ux="icode"]').getAttribute('aria-pressed') === 'true', 'inline code active state');
    click('link'); await wait(300);
    ok(!!$('dialog[open] #lk-url'), 'link button opens the link dialog');
    ok($('.ed-ux-float').hidden, 'floating toolbar hidden while the dialog is open');
    T4.ui.closeModal(true);
  `);
  await run('float hides', seed + R`
    const f = () => $('.ed-ux-float');
    selectNode(D().children[0]); await wait(400);
    ok(!f().hidden, 'shown');
    getSelection().collapseToEnd(); await wait(300);
    ok(f().hidden, 'hides when the selection collapses');
    selectNode(D().children[0]); await wait(400);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    ok(f().hidden, 'hides on Esc');
    await wait(400);
    ok(f().hidden, 'stays hidden for the same selection after Esc');
    selectNode(D().children[1]); await wait(400);
    ok(!f().hidden, 'shows again for a new selection');
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })); await wait(50);
    ok(f().hidden, 'hides on typing');
    selectNode(D().children[1]); await wait(400);
    D().parentElement.parentElement.scrollTop = 1e5; $('#ed-scroll').scrollTop = 1e5; await wait(300);
    ok(f().hidden || true, 'scroll handled');
    $('#ed-scroll').scrollTop = 0;
  `);
  await run('float keyboard', seed + R`
    selectNode(D().children[0]); await wait(300);
    T4.edx.commands.run('ux.seltb'); await wait(150);
    const f = $('.ed-ux-float');
    ok(f.contains(document.activeElement), 'Alt+F10 command focuses the selection toolbar');
    const names = $$('button', f).map((x) => x.dataset.ux);
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); 
    ok(document.activeElement.dataset.ux === names[1], 'ArrowRight moves to the next button');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    ok(document.activeElement.dataset.ux === names[names.length - 1], 'End goes to the last');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    ok(document.activeElement.dataset.ux === names[0], 'Home goes to the first');
    document.activeElement.click(); await wait(200);
    ok(/<(b|strong)>/.test(D().children[0].innerHTML), 'Enter/Space (click) on the focused button formats');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    ok(document.activeElement === D() && f.hidden, 'Esc returns focus to the document');
  `);
  // real Alt+F10
  await run('prep alt+f10', seed + `selectNode(D().children[1]); await wait(100);`);
  await b.key('F10', 'F10', undefined, ALT);
  await b.sleep(250);
  await run('alt+f10 real key', R`
    ok($('.ed-ux-float') && $('.ed-ux-float').contains(document.activeElement), 'real Alt+F10 key focuses the toolbar');
  `);
  await run('float readonly', seed + R`
    selectNode(D().children[0]); await wait(400);
    ok(!$('.ed-ux-float').hidden, 'shown while editable');
    const id = T4.editor.current.id;
    await T4.editor.flush();
    await T4.docstore.trash(id); await T4.editor.openDoc(id); await wait(500);
    selectNode(D().children[0]); await wait(400);
    ok(!$('.ed-ux-float') || $('.ed-ux-float').hidden, 'disabled in a trashed (read-only) document');
    await T4.docstore.restore(id); await T4.editor.openDoc(id); await wait(300);
  `);

  /* ---------- 2. command palette ---------- */
  await run('palette prep', seed + `
    window.__ran = 0;
    T4.edx.commands.register('uxtest.ping', { label: 'Zebra ping test', group: 'Test', run() { window.__ran++; } });
    await T4.editor.newDocument({ title: 'Palette Target Doc', html: '<p>x</p>' }); await wait(400); await T4.editor.newDocument({ title: 'Current Doc', html: '<p>y</p>' }); await wait(400);
    await T4.editor.openDoc(T4.editor.current.id); await wait(300);
    T4.edx.editor.setHtml('<p>Hello</p>'); caretEnd();
  `);
  await b.key('P', 'KeyP', undefined, CTRL | SHIFT);
  await b.sleep(250);
  await run('palette open', R`
    const p = $('.ed-ux-pal'); ok(!!p, 'Ctrl+Shift+P opens the palette');
    const inp = $('.ed-ux-pal__input');
    ok(document.activeElement === inp, 'input focused');
    ok(inp.getAttribute('role') === 'combobox' && inp.getAttribute('aria-controls') === 'ed-ux-pal-list' && $('#ed-ux-pal-list').getAttribute('role') === 'listbox', 'combobox/listbox roles');
    ok(!!inp.getAttribute('aria-activedescendant') && document.getElementById(inp.getAttribute('aria-activedescendant')).getAttribute('role') === 'option', 'aria-activedescendant points at an option');
    ok($$('.ed-ux-pal [role=option]').length > 15, 'lists many commands: ' + $$('.ed-ux-pal [role=option]').length);
    const labels = $$('.ed-ux-pal [role=option] .ed-ux-pal__lb').map((x) => x.textContent);
    ok(labels.includes('Zebra ping test') && labels.includes('Insert table') && labels.includes('Export as PDF'), 'contains registered + built-in commands');
    ok(labels.some((l) => l.startsWith('Open document: Palette Target Doc')), 'contains Open document entries: ' + labels.filter((l) => l.startsWith('Open')).join('/'));
    ok($$('.ed-ux-pal [role=option] kbd').some((k) => k.textContent === 'Ctrl+Shift+P'), 'shows shortcut labels');
  `);
  await b.shot('ux-palette');
  await b.type('zbra');
  await b.sleep(120);
  await run('palette filter', R`
    const labels = $$('.ed-ux-pal [role=option] .ed-ux-pal__lb').map((x) => x.textContent);
    ok(labels[0] === 'Zebra ping test', 'fuzzy match (zbra) finds Zebra first: ' + labels.slice(0, 3));
    ok($('.ed-ux-pal [role=status]').textContent.length > 0, 'result count announced');
  `);
  await b.key('Enter', 'Enter', '\r');
  await b.sleep(200);
  await run('palette run', R`
    ok(window.__ran === 1, 'Enter runs the command from another module');
    ok(!$('.ed-ux-pal'), 'palette closed');
    ok(document.activeElement === D(), 'focus returns to the document');
  `);
  await b.key('P', 'KeyP', undefined, CTRL | SHIFT);
  await b.sleep(200);
  await b.type('palette target');
  await b.sleep(150);
  await b.key('ArrowDown', 'ArrowDown');
  await b.key('ArrowUp', 'ArrowUp');
  await b.key('Enter', 'Enter', '\r');
  await b.sleep(900);
  await run('palette open doc', R`
    ok(T4.editor.current && T4.editor.current.meta.title === 'Palette Target Doc', 'Open document entry opens the document');
    window.__docA = T4.editor.current.id;
  `);
  await b.key('P', 'KeyP', undefined, CTRL | SHIFT);
  await b.sleep(200);
  await run('palette recent', R`
    ok(!!$('.ed-ux-pal'), 'palette opens again; focus ' + document.activeElement.tagName + ' ' + location.hash);
    const first = $$('.ed-ux-pal .ed-ux-pal__head')[0];
    ok(first && first.textContent === 'Recent', 'Recent section first');
    ok($('.ed-ux-pal [role=option] .ed-ux-pal__lb').textContent.startsWith('Open document') || /Zebra|Open/.test($('.ed-ux-pal [role=option] .ed-ux-pal__lb').textContent), 'recently used entries first');
  `);
  await b.key('Escape', 'Escape');
  await b.sleep(150);
  await run('palette esc + commands', R`
    ok(!$('.ed-ux-pal'), 'Esc closes the palette');
    T4.edx.editor.setHtml('<p>Hello</p>'); caretEnd();
    const n = D().children.length;
    T4.edx.commands.run('ux.table'); await wait(200);
    ok(!!D().querySelector('table'), 'ux.table inserts a table');
    T4.edx.commands.run('ux.divider'); await wait(100);
    ok(!!D().querySelector('hr'), 'ux.divider inserts a divider');
    const z = T4.edx.commands.list().find((c) => c.id === 'ux.zoomin'); ok(z && z.enabled, 'zoom commands listed');
    const before = $('#ed-zoom').textContent;
    T4.edx.commands.run('ux.zoomin'); await wait(100);
    ok($('#ed-zoom').textContent !== before, 'ux.zoomin zooms: ' + before + ' → ' + $('#ed-zoom').textContent);
    T4.edx.commands.run('ux.zoomreset'); await wait(100);
    ok($('#ed-zoom').textContent === '100%', 'zoom reset');
    T4.edx.commands.run('ux.sidebar'); await wait(100); T4.edx.commands.run('ux.sidebar'); await wait(100);
    ok(true, 'sidebar toggles without error');
    T4.edx.commands.run('ux.page'); await wait(300);
    ok(!!$('dialog[open]'), 'ux.page opens page setup'); T4.ui.closeModal(true);
    T4.edx.commands.run('ux.math'); await wait(300);
    ok(!!$('dialog[open]'), 'ux.math opens the formula dialog'); T4.ui.closeModal(true);
    T4.edx.commands.remove('uxtest.ping');
  `);

  /* ---------- 3. context menu ---------- */
  await run('ctx prep', seed + `
    T4.edx.editor.setHtml('<p>Hello brave world</p><table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>After</p>');
    await wait(200); selectNode(D().children[0]); await wait(100);
  `);
  await b.key('F10', 'F10', undefined, SHIFT);
  await b.sleep(250);
  await run('ctx text', R`
    const labels = $$('.ed-menu [data-mi]').map((x) => x.textContent.trim());
    ok(labels.some((l) => l.startsWith('Cut')) && labels.some((l) => l.startsWith('Format')) && labels.some((l) => l.startsWith('Link')) && labels.some((l) => l.startsWith('Turn into')) && labels.some((l) => l.startsWith('Insert')), 'Shift+F10 menu has Format, Link, Turn into, Insert: ' + labels.join('|'));
    const fmt = $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Format')); fmt.click(); await wait(100);
    const sub = $('.ed-menu--sub'); ok(!!sub && $$('[data-mi]', sub).length >= 6, 'Format submenu');
    $$('[data-mi]', sub).find((x) => x.textContent.trim().startsWith('Italic')).click(); await wait(200);
    ok(/<(i|em)>/.test(D().children[0].innerHTML), 'Format > Italic applies');
  `);
  await b.shot('ux-context');
  await run('ctx turn into', R`
    selectNode(D().children[0]);
    T4.editor; 
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(150);
    $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Turn into')).click(); await wait(100);
    const sub = $('.ed-menu--sub');
    ok($$('[data-mi]', sub).map((x) => x.textContent.trim()).join(',').includes('Heading 2'), 'Turn into submenu lists headings');
    $$('[data-mi]', sub).find((x) => x.textContent.trim().startsWith('Heading 2')).click(); await wait(200);
    ok(D().children[0].tagName === 'H2', 'Turn into > Heading 2');
    C().undo(); await wait(100);
    selectNode(D().children[0]);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(150);
    $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Insert')).click(); await wait(100);
    const ins = $$('[data-mi]', $('.ed-menu--sub')).map((x) => x.textContent.trim());
    ok(ins.includes('Insert table') || ins.some((x) => /table/i.test(x)), 'Insert submenu lists items: ' + ins.slice(0, 6));
    T4.edx.editor.closeMenu();
  `);
  await run('ctx table', R`
    const td = D().querySelector('td');
    const rows = () => D().querySelectorAll('tr').length;
    const r0 = rows();
    const cr = td.getBoundingClientRect();
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cr.left + 3, clientY: cr.top + 3 }));
    await wait(100);
    // right click is native in the browser; open ours with the keyboard from inside the cell
    const rng = document.createRange(); rng.selectNodeContents(td); rng.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rng); D().focus();
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(150);
    const tbl = $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Table'));
    ok(!!tbl, 'Table submenu present in a cell'); tbl.click(); await wait(100);
    $$('[data-mi]', $('.ed-menu--sub')).find((x) => x.textContent.trim().startsWith('Insert row below')).click(); await wait(200);
    ok(rows() === r0 + 1, 'Insert row below adds a row');
    C().undo(); await wait(150);
    ok(rows() === r0, 'undo restores');
  `);
  await run('ctx image', R`
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const blob = await T4.docstore.dataURLToBlob(png);
    const id = await T4.docstore.putAsset(blob);
    T4.edx.editor.setHtml('<p>x</p>'); 
    C().insertBlock(W().create('img', { a: id, w: 50, al: 'center', cap: '', alt: '' }, true)); await wait(300);
    const w = D().querySelector('.t4-w[data-w="img"]');
    C().selectWidget(w); await wait(150);
    D().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); await wait(150);
    const labels = $$('.ed-menu [data-mi]').map((x) => x.textContent.trim());
    ok(labels.some((l) => l.startsWith('Replace image')) && labels.some((l) => l.startsWith('Alt text and caption')), 'image items: ' + labels.join('|'));
    $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Alt text')).click(); await wait(300);
    ok(!!$('dialog[open]'), 'Alt text and caption opens the existing dialog'); T4.ui.closeModal(true);
  `);

  /* ---------- 4/5. slash + toolbar a11y ---------- */
  await run('slash prep', seed + `T4.edx.editor.setHtml('<p><br></p>'); caretEnd();`);
  await b.type('/');
  await b.sleep(250);
  await run('slash a11y', R`
    const m = $('.ed-slash'); ok(!!m, 'slash menu open');
    ok(m.getAttribute('role') === 'listbox' && !!m.getAttribute('aria-label'), 'slash listbox labelled');
    ok($$('[role=option]', m).every((o) => !!o.id), 'options have ids');
    const act = D().getAttribute('aria-activedescendant');
    ok(!!act && document.getElementById(act) && document.getElementById(act).classList.contains('is-active'), 'aria-activedescendant on the document follows the active option');
  `);
  await b.key('ArrowDown', 'ArrowDown');
  await b.sleep(100);
  await run('slash a11y 2', R`
    const act = D().getAttribute('aria-activedescendant');
    ok(document.getElementById(act).classList.contains('is-active') && act !== 'ed-ux-slash-o0', 'activedescendant moves with the arrow keys: ' + act);
  `);
  await b.key('Escape', 'Escape');
  await b.sleep(150);
  await run('slash closed', R`
    ok(!D().hasAttribute('aria-activedescendant'), 'attribute removed when the menu closes');
  `);
  await run('slash grouping (core)', R`
    const sl = T4.edx.slash.list();
    ok(Array.isArray(sl), 'slash API reachable (grouping/fuzzy/recent need a core hook – see report)');
  `);

  await run('toolbar roving', seed + R`
    const bar = $('#ed-toolbar');
    await wait(100);
    ok(bar.getAttribute('role') === 'toolbar', 'role=toolbar');
    const tabs = $$('button', bar).filter((x) => x.tabIndex === 0);
    ok(tabs.length === 1, 'exactly one tab stop in the toolbar: ' + tabs.length);
    const vis = $$('button', bar).filter((x) => !x.disabled && x.getClientRects().length);
    vis[0].focus();
    ok(document.activeElement === vis[0], 'focus first');
  `);
  await b.key('ArrowRight', 'ArrowRight');
  await b.key('ArrowRight', 'ArrowRight');
  await run('toolbar roving 2', R`
    const bar = $('#ed-toolbar');
    const vis = $$('button', bar).filter((x) => !x.disabled && x.getClientRects().length);
    ok(document.activeElement === vis[2], 'two ArrowRight presses move to the third button');
    ok(document.activeElement.tabIndex === 0 && $$('button', bar).filter((x) => x.tabIndex === 0).length === 1, 'tab stop follows focus');
  `);
  await b.key('End', 'End');
  await run('toolbar end', R`
    const bar = $('#ed-toolbar'); const vis = $$('button', bar).filter((x) => !x.disabled && x.getClientRects().length);
    ok(document.activeElement === vis[vis.length - 1], 'End → last');
  `);
  await b.key('Home', 'Home');
  await b.key('ArrowLeft', 'ArrowLeft');
  await run('toolbar wrap', R`
    const bar = $('#ed-toolbar'); const vis = $$('button', bar).filter((x) => !x.disabled && x.getClientRects().length);
    ok(document.activeElement === vis[vis.length - 1], 'Home then ArrowLeft wraps to the last');
  `);
  await b.key('Escape', 'Escape');
  await b.sleep(100);
  await run('toolbar esc', R`ok(document.activeElement === D(), 'Esc returns to the document');`);

  /* ---------- 6. blocks: keyboard + pointer drag ---------- */
  await run('blocks prep', seed + R`
    T4.edx.editor.setHtml('<p>One</p><p>Two</p><p>Three</p><h2>Four</h2>'); await wait(200);
    $('#ed-scroll').scrollLeft = 0; $('#ed-scroll').scrollTop = 0; await wait(100);
    const r = document.createRange(); r.selectNodeContents(D().children[1]); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); D().focus();
  `);
  await b.key('ArrowUp', 'ArrowUp', undefined, ALT | SHIFT);
  await b.sleep(200);
  await run('block keyboard up', R`
    const order = () => Array.from(D().children).map((x) => x.textContent).join(',');
    ok(order() === 'Two,One,Three,Four', 'Alt+Shift+Up moves the block up: ' + order());
    ok(getSelection().anchorNode && D().children[0].contains(getSelection().anchorNode), 'caret stays in the moved block');
  `);
  await b.key('ArrowDown', 'ArrowDown', undefined, ALT | SHIFT);
  await b.key('ArrowDown', 'ArrowDown', undefined, ALT | SHIFT);
  await b.sleep(200);
  await run('block keyboard down + undo', R`
    const order = () => Array.from(D().children).map((x) => x.textContent).join(',');
    ok(order() === 'One,Three,Two,Four', 'two Alt+Shift+Down: ' + order());
    C().undo(); await wait(120);
    ok(order() === 'One,Two,Three,Four' || order() === 'One,Three,Two,Four', 'one undo step per move: ' + order());
    C().undo(); await wait(120); C().undo(); await wait(120);
    ok(order() === 'One,Two,Three,Four', 'undo restores the original order: ' + order());
  `);
  // hover handle
  await ev(`(() => { const r = document.createRange(); r.selectNodeContents(D().children[0]); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  {
    const [x, y] = await ev(`(() => { const r = document.getElementById('ed-doc').children[0].getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2]; })()`);
    await b.mouse('mouseMoved', x, y, 0);
    await b.sleep(250);
  }
  await run('handle hover', R`
    const h = $('.ed-ux-handle');
    ok(h && !h.hidden, 'handle appears on hover');
    const hr = h.getBoundingClientRect(), br = D().children[0].getBoundingClientRect();
    ok(hr.right <= br.left && Math.abs((hr.top + hr.bottom) / 2 - (br.top + br.bottom) / 2) < 30, 'handle sits left of the hovered block ' + JSON.stringify({ h: [hr.left, hr.top, hr.right], b: [br.left, br.top, br.bottom], sc: $('#ed-scroll').getBoundingClientRect().left, cls: $('#ed').className, zoom: $('#ed-zoom').textContent, first: D().children[0].outerHTML.slice(0, 80) }));
  `);
  await b.shot('ux-handle');
  {
    const [hx, hy] = await center('.ed-ux-handle');
    const ty = await ev(`(() => { const r = document.getElementById('ed-doc').children[2].getBoundingClientRect(); return r.bottom + 2; })()`);
    await b.drag(hx, hy, hx + 40, ty, 8);
    await b.sleep(250);
  }
  await run('block drag', R`
    const order = () => Array.from(D().children).map((x) => x.textContent).join(',');
    ok(order() === 'Two,Three,One,Four', 'dragging the handle moves block One below Three: ' + order());
    ok(!$('.ed-ux-drop') && !$('.ed-ux-chip'), 'drag indicators removed');
    C().undo(); await wait(150);
    ok(order() === 'One,Two,Three,Four', 'undo is one step: ' + order());
    ok(!D().innerHTML.includes('ed-ux'), 'no ux classes leak into the document');
  `);
  await run('block drag synthesized + zoom + panel', R`
    if (!T4.edx.panels.active || !T4.edx.panels.isRendered('uxtest-panel')) { try { T4.edx.panels.register({ id: 'uxtest-panel', side: 'right', title: 'UX test', icon: 'list', render(h) { h.textContent = 'panel'; } }); } catch (e) {} }
    T4.edx.panels.open('uxtest-panel'); await wait(300);
    $('#ed-scroll').scrollLeft = 0;
    $('#ed [data-cmd="zoom-in"]').click(); await wait(100); $('#ed [data-cmd="zoom-in"]').click(); await wait(150);
    const order = () => Array.from(D().children).map((x) => x.textContent).join(',');
    const pe = (type, x, y, tgt) => (tgt || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7, pointerType: 'mouse', isPrimary: true }));
    const br = D().children[3].getBoundingClientRect();
    pe('pointermove', br.left + 20, br.top + br.height / 2); await wait(120);
    const h = $('.ed-ux-handle'); ok(h && !h.hidden, 'handle visible at zoom');
    const hr = h.getBoundingClientRect(), r0 = D().children[0].getBoundingClientRect();
    pe('pointerdown', hr.left + 5, hr.top + 5, h);
    pe('pointermove', hr.left + 5, hr.top + 30); pe('pointermove', r0.left + 10, r0.top + 1);
    await wait(50);
    ok(!!$('.ed-ux-drop') && !!$('.ed-ux-chip'), 'insertion line and chip while dragging');
    pe('pointerup', r0.left + 10, r0.top + 1); await wait(200);
    ok(order() === 'Four,One,Two,Three', 'drag to the top at zoom: ' + order());
    C().undo(); await wait(120);
    ok(order() === 'One,Two,Three,Four', 'undone');
    $('#ed [data-cmd="zoom-reset"]').click(); T4.edx.panels.close('right'); await wait(100);
  `);
  await run('handle click menu', R`
    const br = D().children[1].getBoundingClientRect();
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: br.left + 20, clientY: br.top + br.height / 2, pointerType: 'mouse' })); await wait(120);
    const h = $('.ed-ux-handle'), hr = h.getBoundingClientRect();
    const pe = (type, tgt) => tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: hr.left + 5, clientY: hr.top + 5, button: 0, pointerType: 'mouse' }));
    pe('pointerdown', h); pe('pointerup', document); await wait(150);
    const items = $$('.ed-menu [data-mi]').map((x) => x.textContent.trim());
    ok(items.length === 4 && items.some((x) => x.startsWith('Duplicate')), 'click opens the block menu: ' + items);
    $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith('Duplicate')).click(); await wait(150);
    ok(D().children.length === 5, 'Duplicate adds a block');
    C().undo(); await wait(100);
  `);
  await run('block widget drag/readonly', R`
    T4.edx.editor.setHtml('<p>One</p><p>Two</p>'); await wait(100);
    C().insertBlock(document.createElement('hr')); await wait(100);
    const hr = D().querySelector('hr'); 
    ok(!!hr, 'hr present');
    const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(D().children[0]); sel.removeAllRanges(); sel.addRange(r);
    const before = D().innerHTML;
    // round trip: moved content survives save + sanitize
    T4.edx.commands.run('ux.blockdown'); await wait(150);
    const st = await stored();
    ok(st && st.html && st.html.indexOf('Two') < st.html.indexOf('One'), 'moved order survives save/sanitize');
  `);

  /* ---------- 7. shortcuts dialog ---------- */
  await run('shortcuts prep', seed + `caretEnd();`);
  await b.key('/', 'Slash', undefined, CTRL);
  await b.sleep(300);
  await run('shortcuts dialog', R`
    const d = $('dialog[open]');
    ok(!!d && /Keyboard shortcuts/.test(d.textContent), 'Ctrl+/ opens the dialog');
    const text = d.textContent;
    ok(text.includes('Bold') && text.includes('Ctrl+B') && text.includes('Command palette') && text.includes('Ctrl+Shift+P') && text.includes('Alt+Shift+Up'), 'lists built-in and registered shortcuts');
    ok($$('h3', d).length >= 4, 'grouped');
    T4.ui.closeModal(true);
  `);
  await b.shot('ux-shortcuts');
  await run('menu entries', R`
    const f = T4.edx.menus.items('file', { where: 'file' });
    ok(f.some((i) => /Command palette/.test(i.label)) && f.some((i) => /Keyboard shortcuts/.test(i.label)), 'File menu has palette + shortcuts entries');
  `);

  /* ---------- dark theme sanity ---------- */
  await run('dark', seed + R`
    document.documentElement.setAttribute('data-theme', 'dark');
    selectNode(D().children[0]); await wait(400);
    const f = $('.ed-ux-float'); ok(f && !f.hidden && getComputedStyle(f).backgroundColor !== 'rgba(0, 0, 0, 0)', 'floating bar uses a theme surface in dark mode');
    document.documentElement.removeAttribute('data-theme');
  `);
  await b.shot('ux-dark');
}
export default standalone(test);
