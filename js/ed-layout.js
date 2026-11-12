/* Todo4Me — layout module: checklists, callouts, footnotes (+ notes section), page preview, page geometry helper.
 * Registers everything through T4.edx (see docs/EDITOR-EXTENSIONS.md); the page model itself lives in docstore.cleanPage / editor.js (page setup). */
(function () {
  'use strict';
  const X = T4.edx;
  const L = (X.layout = X.layout || {});
  const t = (k, f, p) => X.t('edx.layout.' + k, f, p);
  const run = (fn, opts) => X.editor.run(fn, opts);
  const PREF_KEY = 'todo4me.editor.layout';
  const TYPES = ['note', 'tip', 'info', 'warning', 'danger'];
  const TYPE_FALLBACK = { note: 'Note', tip: 'Tip', info: 'Info', warning: 'Warning', danger: 'Danger' };

  /* ---------- helpers ---------- */
  const root = () => X.editor.root();
  const caretNode = () => { const s = window.getSelection(); const r = root(); return s && s.rangeCount && r && r.contains(s.anchorNode) ? s.anchorNode : null; };
  const elOf = (n) => (n && n.nodeType === 3 ? n.parentNode : n);
  const closestIn = (n, sel) => { const e = elOf(n); const r = root(); const c = e && e.closest ? e.closest(sel) : null; return c && r && r.contains(c) ? c : null; };
  const editable = () => !!X.editor.current() && !X.editor.readonly() && !!root();
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const lsSet = (o) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(Object.assign(lsGet(), o))); } catch (e) { /* convenience only */ } };
  const setCaret = (node, offset) => { const r = document.createRange(); r.setStart(node, offset); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };

  /* ---------- page geometry (for IO and others) ---------- */
  L.pageGeometry = (page) => T4.docstore.pageGeometry(page);

  /* ---------- icons ---------- */
  X.icons.add('ly-checklist', '<rect x="3" y="4" width="5" height="5" rx="1"/><polyline points="4 6.5 5.5 8 7.5 5"/><line x1="11" y1="6.5" x2="21" y2="6.5"/><rect x="3" y="14" width="5" height="5" rx="1"/><line x1="11" y1="16.5" x2="21" y2="16.5"/>');
  X.icons.add('ly-callout', '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="11" y2="9"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="7" y1="16" x2="14" y2="16"/>');
  X.icons.add('ly-footnote', '<path d="M4 18 9 6l5 12"/><line x1="5.8" y1="14" x2="12.2" y2="14"/><line x1="17" y1="5" x2="20" y2="5"/><line x1="18.5" y1="5" x2="18.5" y2="11"/>');
  X.icons.add('ly-eye', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');

  /* ---------- sanitizer rules (the only places where our markup is allowed) ---------- */
  X.sanitizer.allow({
    attrs: {
      UL: { class: (v) => (String(v).split(/\s+/).filter(Boolean).every((c) => c === 't4-check') && /t4-check/.test(v) ? 't4-check' : null) },
      LI: { 'data-x-check': /^[01]$/, 'data-x-task': /^[\w-]{1,80}$/ },
      BLOCKQUOTE: {
        class: (v) => {
          const toks = String(v).split(/\s+/).filter(Boolean);
          const types = toks.map((c) => (c.match(/^t4-callout--(note|tip|info|warning|danger)$/) || [])[1]).filter(Boolean);
          if (!toks.includes('t4-callout') || types.length !== 1 || toks.length !== 2) return null;
          return 't4-callout t4-callout--' + types[0];
        },
      },
    },
  });

  /* ====================== Checklists ====================== */
  const isCheckList = (ul) => !!ul && ul.tagName === 'UL' && ul.classList.contains('t4-check');
  /** Keep nested lists of a checklist checklists and give every item a state. Call inside run(). */
  function fixChecklists() {
    const r = root(); if (!r) return;
    r.querySelectorAll('ul.t4-check ul').forEach((u) => u.classList.add('t4-check'));
    r.querySelectorAll('ul.t4-check > li').forEach((li) => { if (li.getAttribute('data-x-check') !== '1' && li.getAttribute('data-x-check') !== '0') li.setAttribute('data-x-check', '0'); });
  }
  function toggleChecklist() {
    if (!editable()) return false;
    const li = closestIn(caretNode(), 'li');
    const ul0 = li && li.parentNode;
    run(() => {
      if (isCheckList(ul0)) { // back to a normal bullet list
        const top = ul0.closest('ul.t4-check:not(ul.t4-check ul)') || ul0;
        [top].concat(Array.from(top.querySelectorAll('ul.t4-check'))).forEach((u) => { u.classList.remove('t4-check'); if (!u.getAttribute('class')) u.removeAttribute('class'); });
        top.querySelectorAll('li').forEach((l) => { l.removeAttribute('data-x-check'); });
        return;
      }
      if (!(ul0 && ul0.tagName === 'UL')) document.execCommand('insertUnorderedList');
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const rg = sel.getRangeAt(0);
      root().querySelectorAll('ul').forEach((u) => { if (!u.parentNode.closest('ul.t4-check') && rg.intersectsNode(u)) u.classList.add('t4-check'); });
      fixChecklists();
    });
    return true;
  }
  function setItem(li, on) { run(() => { li.setAttribute('data-x-check', on ? '1' : '0'); }, { keepFocus: true }); }
  function toggleItem(li) {
    li = li || closestIn(caretNode(), 'ul.t4-check > li');
    if (!li || !isCheckList(li.parentNode) || !editable()) return false;
    setItem(li, li.getAttribute('data-x-check') !== '1');
    return true;
  }
  const ownText = (li) => { const c = li.cloneNode(true); c.querySelectorAll('ul, ol').forEach((u) => u.remove()); return c.textContent.replace(/[​\s]+/g, ' ').trim(); };
  function taskFromItem(li) {
    li = li || closestIn(caretNode(), 'ul.t4-check > li');
    if (!li || !editable()) return false;
    const title = ownText(li).slice(0, 500);
    if (!title) { X.editor.toast(t('check.taskEmpty', 'The item has no text.'), 'info'); return false; }
    const cur = X.editor.current();
    const task = T4.store.addTask({ title, inbox: true, notes: (cur.meta.title || '').slice(0, 200) });
    if (!task) return false;
    run(() => { li.setAttribute('data-x-task', task.id); }, { keepFocus: true });
    X.editor.toast(t('check.taskCreated', 'Task created: {title}', { title }), 'success', 6000, { label: t('check.open', 'Open'), fn: () => { location.hash = '#/inbox'; } });
    return true;
  }

  function wireDoc(doc) {
    // Click on the box (the ::before area left of the item text) toggles the item.
    doc.addEventListener('click', (e) => {
      const li = e.target && e.target.closest ? e.target.closest('ul.t4-check > li') : null;
      if (!li || !doc.contains(li) || X.editor.readonly()) return;
      const rc = li.getBoundingClientRect();
      if (e.clientX >= rc.left || e.clientX < rc.left - 36) return;
      const lh = parseFloat(getComputedStyle(li).lineHeight) || 24;
      if (e.clientY > rc.top + lh * 1.6) return;
      e.preventDefault();
      toggleItem(li);
    });
    // Markdown shortcut "[] " / "[ ] " / "[x] " at the start of a paragraph; Enter starts an unchecked item.
    doc.addEventListener('input', (e) => {
      if (X.editor.readonly()) return;
      const core = T4.edcore;
      if (e.inputType === 'insertText' && e.data === ' ') {
        const info = core.textBeforeCaretInBlock();
        const m = info && info.block.tagName === 'P' && !info.block.closest('li, td, th') && info.text.replace(/ /g, ' ').match(/^\[([ xX]?)\] $/);
        if (!m) return;
        run(() => {
          info.range.deleteContents();
          Array.from(info.block.childNodes).forEach((n) => { if (n.nodeType === 3 && !n.nodeValue) n.remove(); });
          if (!info.block.firstChild) info.block.appendChild(document.createElement('br'));
          setCaret(info.block, 0);
          document.execCommand('insertUnorderedList');
          const li = closestIn(caretNode(), 'li');
          if (li && li.parentNode.tagName === 'UL') { li.parentNode.classList.add('t4-check'); fixChecklists(); li.setAttribute('data-x-check', m[1].toLowerCase() === 'x' ? '1' : '0'); }
        });
      } else if (e.inputType === 'insertParagraph') {
        const li = closestIn(caretNode(), 'ul.t4-check > li');
        if (li && li.getAttribute('data-x-check') !== '0') run(() => { li.setAttribute('data-x-check', '0'); }, { keepFocus: true });
      }
    });
    // Tab / Shift+Tab nests in checklists (nested lists stay checklists).
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || X.editor.readonly()) return;
      if (!closestIn(caretNode(), 'ul.t4-check > li')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      run(() => { document.execCommand(e.shiftKey ? 'outdent' : 'indent'); fixChecklists(); });
    }, true);
    // Footnote references: double-click edits (core), single click on the reference of a note list is handled by the notes section.
  }

  /* ====================== Callouts ====================== */
  const typeLabel = (ty) => t('callout.' + ty, TYPE_FALLBACK[ty]);
  const calloutType = (bq) => TYPES.find((ty) => bq.classList.contains('t4-callout--' + ty)) || 'note';
  function makeCallout(ty) {
    const bq = document.createElement('blockquote');
    bq.className = 't4-callout t4-callout--' + ty;
    const tp = document.createElement('p'); const st = document.createElement('strong'); st.textContent = typeLabel(ty); tp.appendChild(st);
    const bp = document.createElement('p'); bp.appendChild(document.createElement('br'));
    bq.append(tp, bp);
    return bq;
  }
  function setCalloutType(bq, ty) {
    run(() => {
      const old = calloutType(bq);
      bq.className = 't4-callout t4-callout--' + ty;
      const st = bq.querySelector(':scope > p:first-child > strong:only-child');
      if (st && TYPES.some((x) => st.textContent.trim() === typeLabel(x) && x === old)) st.textContent = typeLabel(ty);
    }, { keepFocus: true });
  }
  function insertCallout(ty) {
    ty = TYPES.includes(ty) ? ty : 'note';
    if (!editable()) return false;
    const inside = closestIn(caretNode(), 'blockquote.t4-callout');
    if (inside) { setCalloutType(inside, ty); return true; }
    run(() => {
      const r = root();
      let top = caretNode();
      while (top && top.parentNode !== r) top = top.parentNode;
      const el = makeCallout(ty);
      const body = el.lastElementChild;
      if (!top) r.appendChild(el);
      else if (top.tagName === 'P' && !top.textContent.replace(/[​\s]/g, '') && !top.querySelector('.t4-w')) top.replaceWith(el);
      else if (/^(P|H[1-6])$/.test(top.tagName)) { top.replaceWith(el); body.replaceWith(top); }
      else top.after(el);
      const target = el.contains(body) ? body : el.lastElementChild;
      setCaret(target, target.childNodes.length && target.firstChild.nodeName === 'BR' ? 0 : target.childNodes.length);
    });
    return true;
  }
  function removeCallout(bq) {
    run(() => { while (bq.firstChild) bq.parentNode.insertBefore(bq.firstChild, bq); bq.remove(); }, { keepFocus: true });
  }
  const calloutItems = (onPick, cur) => TYPES.map((ty) => ({ label: typeLabel(ty), icon: 'ly-callout', checked: cur === ty, run: () => onPick(ty) }));
  function calloutMenuAtCaret() {
    const s = window.getSelection(); let x = 200, y = 200;
    if (s.rangeCount) { const b = s.getRangeAt(0).getBoundingClientRect(); if (b.width || b.height) { x = b.left; y = b.bottom + 4; } else { const e = elOf(s.anchorNode); if (e && e.getBoundingClientRect) { const b2 = e.getBoundingClientRect(); x = b2.left; y = b2.bottom; } } }
    X.editor.rememberSelection();
    X.editor.openMenu(null, calloutItems(insertCallout, null), { at: { x, y }, focusFirst: true });
  }

  /* ====================== Footnotes ====================== */
  X.widgets.register('footnote', {
    inline: true,
    defaults: { text: '' },
    validate(p) { if (p.text != null && typeof p.text !== 'string') return null; return { text: String(p.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 2000) }; },
    render(el, p) {
      const sup = document.createElement('sup');
      sup.className = 'ed-ly-fnref';
      sup.setAttribute('role', 'doc-noteref');
      sup.setAttribute('aria-label', t('fn.aria', 'Footnote {n}: {text}', { n: '', text: p.text }).replace(/\s+:/, ':'));
      el.title = p.text || t('fn.label', 'Footnote');
      el.appendChild(sup);
    },
    textOf() { return ''; },
    toMarkdown(p) { return '^[' + p.text.replace(/\]/g, '\\]').replace(/\s*\n\s*/g, ' ') + ']'; }, // Pandoc inline note
    edit(el, p) { openPop(el, p, false); },
    ctxBar: {
      labelKey: 'edx.layout.fn.label', label: 'Footnote',
      items: () => [
        { builtin: 'edit', icon: 'edit', label: t('fn.edit', 'Edit footnote') },
        { action: 'goto', icon: 'arrow-right', label: t('fn.goto', 'Go to note') },
        { sep: true },
        { builtin: 'delete', icon: 'trash', label: t('fn.remove', 'Remove') },
      ],
      onAction(action, info) {
        if (action === 'goto') { const n = footnotes().findIndex((f) => f.el === info.el); const li = notesHost() && notesHost().querySelectorAll('li')[n]; if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('ed-flash'); setTimeout(() => li.classList.remove('ed-flash'), 1200); } }
      },
    },
  });

  /** Live footnotes in document order: [{ n, text, el }] */
  function footnotes() {
    const r = root(); if (!r) return [];
    return Array.from(r.querySelectorAll('.t4-w[data-w="footnote"]')).map((el, i) => ({ n: i + 1, text: T4.edw.getProps(el).text || '', el }));
  }
  /** Footnotes of a stored HTML string: [{ n, text }] (for exporters). */
  function footnotesOf(html) {
    const d = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html');
    return Array.from(d.body.querySelectorAll('.t4-w[data-w="footnote"]')).map((el, i) => {
      let p = {}; try { p = JSON.parse(el.getAttribute('data-p') || '{}') || {}; } catch (e) { /* ignore */ }
      return { n: i + 1, text: String(p.text || '').slice(0, 2000) };
    });
  }
  L.footnotes = footnotes;
  L.footnotesOf = footnotesOf;

  function insertFootnote() {
    if (!editable()) return false;
    const el = X.widgets.insert('footnote', { props: { text: '' } });
    if (el) setTimeout(() => openPop(el, { text: '' }, true), 0);
    return true;
  }

  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', onOutside, true); } }
  function onOutside(e) { if (pop && !pop.contains(e.target)) cancelPop(); }
  function cancelPop() { const p = pop; if (!p) return; const { el, isNew } = p._ctx; closePop(); if (isNew && el.isConnected && !(T4.edw.getProps(el).text)) run(() => el.remove(), { keepFocus: true }); X.editor.restore(); }
  function openPop(el, props, isNew) {
    closePop();
    const box = document.createElement('div');
    box.className = 'ed-ui ed-ly-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('fn.edit', 'Edit footnote'));
    const ta = document.createElement('textarea');
    ta.maxLength = 2000; ta.rows = 3; ta.value = props.text || '';
    ta.placeholder = t('fn.placeholder', 'Footnote text');
    ta.setAttribute('aria-label', t('fn.placeholder', 'Footnote text'));
    const row = document.createElement('div'); row.className = 'ed-ly-pop__row';
    const mk = (cls, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--sm ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; };
    const save = () => {
      const text = ta.value.replace(/\s*\n\s*/g, ' ').trim();
      closePop();
      run(() => { T4.edw.setProps(el, { text }); }, { keepFocus: true });
      X.editor.restore();
    };
    row.append(
      mk('btn--ghost', t('fn.remove', 'Remove'), () => { closePop(); run(() => el.remove(), { keepFocus: true }); X.editor.restore(); }),
      mk('btn--ghost', t('fn.cancel', 'Cancel'), cancelPop),
      mk('btn--primary', t('fn.save', 'Save'), save));
    box.append(ta, row);
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cancelPop(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    });
    box._ctx = { el, isNew };
    document.body.appendChild(box);
    const rc = el.getBoundingClientRect();
    const w = 340;
    box.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - w - 8)) + 'px';
    const below = rc.bottom + 6, h = 150;
    box.style.top = (below + h > window.innerHeight ? Math.max(8, rc.top - h - 6) : below) + 'px';
    pop = box;
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
    ta.focus(); ta.select();
  }

  /* ---- notes section below the document (generated, not stored) ---- */
  let lastSig = null;
  const notesHost = () => document.getElementById('ed-ly-notes');
  function ensureNotes() {
    const doc = root(); if (!doc) return null;
    let h = notesHost();
    if (!h || h.previousElementSibling !== doc) {
      if (h) h.remove();
      h = document.createElement('section');
      h.id = 'ed-ly-notes'; h.className = 'ed-ly-notes'; h.setAttribute('role', 'doc-endnotes'); h.contentEditable = 'false'; h.hidden = true;
      doc.after(h); lastSig = null;
    }
    return h;
  }
  function refreshNotes() {
    const h = ensureNotes(); if (!h) return;
    const list = footnotes();
    const sig = list.map((f) => f.text).join('\u0001') + '|' + list.length;
    if (sig === lastSig) return;
    lastSig = sig;
    h.textContent = '';
    h.hidden = !list.length;
    if (!list.length) return;
    h.setAttribute('aria-label', t('fn.notes', 'Notes'));
    const title = document.createElement('div'); title.className = 'ed-ly-notes__title'; title.textContent = t('fn.notes', 'Notes');
    const ol = document.createElement('ol');
    list.forEach((f) => {
      const li = document.createElement('li');
      const span = document.createElement('span'); span.className = 'ed-ly-notes__text';
      span.textContent = f.text || t('fn.empty', '(empty footnote)');
      if (!f.text) span.classList.add('is-empty');
      span.addEventListener('dblclick', () => { if (editable()) openPop(f.el, { text: f.text }, false); });
      const back = document.createElement('button'); back.type = 'button'; back.className = 'ed-ly-notes__back ed-ui';
      back.textContent = '↩'; back.title = back.ariaLabel = t('fn.back', 'Back to text');
      back.addEventListener('click', () => { X.editor.scrollToBlock(f.el, { block: 'center', flash: true }); });
      li.append(span, ' ', back);
      ol.appendChild(li);
    });
    h.append(title, ol);
  }
  const refreshNotesSoon = X.util.debounce(refreshNotes, 250);

  /* ====================== Page preview (page-break guides) ====================== */
  const previewOn = () => !!lsGet().preview;
  function paintPreview() {
    const page = document.getElementById('ed-page'); const doc = root();
    if (!page) return;
    page.classList.toggle('ed-ly-preview', previewOn() && !!doc);
    let g = page.querySelector(':scope > .ed-ly-guides');
    if (!previewOn() || !doc || !X.editor.current()) { if (g) g.remove(); return; }
    if (!g) { g = document.createElement('div'); g.className = 'ed-ly-guides ed-ui'; g.setAttribute('aria-hidden', 'true'); page.appendChild(g); }
    const geo = T4.docstore.pageGeometry(X.editor.current().meta.page);
    const mm = 96 / 25.4;
    const pc = (geo.heightMm - geo.margins.t - geo.margins.b) * mm;
    const pages = Math.max(1, Math.ceil(doc.scrollHeight / pc));
    g.textContent = '';
    for (let i = 1; i < pages; i++) {
      const d = document.createElement('div'); d.className = 'ed-ly-guide';
      d.style.top = (geo.margins.t * mm + i * pc) + 'px';
      const s = document.createElement('span'); s.textContent = t('preview.page', 'Page {n}', { n: i + 1 });
      d.appendChild(s); g.appendChild(d);
    }
  }
  const paintPreviewSoon = X.util.debounce(paintPreview, 250);
  function togglePreview() { lsSet({ preview: !previewOn() }); paintPreview(); return true; }
  let ro = null;

  /* ====================== Registration of commands, menus, slash, toolbar ====================== */
  const cmd = (id, spec) => X.commands.register(id, spec);
  cmd('layout.checklist', { labelKey: 'edx.layout.check.label', label: 'Checklist', icon: 'ly-checklist', group: 'Layout', order: 10, when: editable, run: toggleChecklist });
  cmd('layout.check.toggle', { labelKey: 'edx.layout.check.toggle', label: 'Check / uncheck item', icon: 'check', group: 'Layout', order: 11, when: () => editable() && !!closestIn(caretNode(), 'ul.t4-check > li'), run: () => toggleItem() });
  cmd('layout.check.task', { labelKey: 'edx.layout.check.task', label: 'Create task from item', icon: 'plus', group: 'Layout', order: 12, when: () => editable() && !!closestIn(caretNode(), 'ul.t4-check > li'), run: () => taskFromItem() });
  cmd('layout.callout', { labelKey: 'edx.layout.callout.label', label: 'Callout', icon: 'ly-callout', group: 'Layout', order: 20, when: editable, run(ctx) { return insertCallout(ctx && ctx.args && ctx.args.type); } });
  cmd('layout.footnote', { labelKey: 'edx.layout.fn.label', label: 'Footnote', icon: 'ly-footnote', group: 'Layout', order: 30, when: editable, run: insertFootnote });
  cmd('layout.preview', { labelKey: 'edx.layout.preview.cmd', label: 'Toggle page preview', icon: 'ly-eye', group: 'Layout', order: 40, readonlyOk: true, when: () => !!X.editor.current(), run: togglePreview });

  X.shortcuts.add('mod-alt-f', 'layout.footnote'); // refusal (reserved/AltGr) is recorded in edx.problems and simply leaves the footnote without a shortcut

  X.slash.add({ id: 'layout.checklist', label: 'Checklist', labelKey: 'edx.layout.check.label', keywords: ['todo', 'task', 'checkbox', 'check', 'aufgabe', 'liste'], icon: 'ly-checklist', group: 'Layout', order: 10, run: toggleChecklist });
  TYPES.forEach((ty, i) => X.slash.add({
    id: 'layout.callout.' + ty, label: () => t('callout.label', 'Callout') + ': ' + typeLabel(ty), keywords: ['callout', 'box', 'hint', ty, typeLabel(ty).toLowerCase()],
    icon: 'ly-callout', group: 'Layout', order: 20 + i, run: () => insertCallout(ty),
  }));
  X.slash.add({ id: 'layout.footnote', label: 'Footnote', labelKey: 'edx.layout.fn.label', keywords: ['note', 'fussnote', 'endnote', 'reference'], icon: 'ly-footnote', group: 'Layout', order: 30, run: insertFootnote });

  X.menus.add('insert', () => [
    { sep: true },
    { label: t('check.label', 'Checklist'), icon: 'ly-checklist', order: 50, run: toggleChecklist },
    { label: t('callout.label', 'Callout'), icon: 'ly-callout', order: 51, items: calloutItems(insertCallout, null) },
    { label: t('fn.label', 'Footnote'), icon: 'ly-footnote', kbd: X.shortcuts.labelFor('layout.footnote') || undefined, order: 52, run: insertFootnote },
  ]);
  X.menus.add('file', () => ({ label: t('preview.label', 'Page preview'), icon: 'ly-eye', order: 40, checked: previewOn(), disabled: !X.editor.current(), run: togglePreview }));
  X.menus.add('context', (ctx) => {
    if (ctx.readonly || !ctx.target || !ctx.target.closest) return [];
    const out = [];
    const li = ctx.target.closest('ul.t4-check > li');
    if (li && root() && root().contains(li)) {
      out.push({ sep: true },
        { label: t('check.toggle', 'Check / uncheck item'), icon: 'check', run: () => toggleItem(li) },
        li.getAttribute('data-x-task') && T4.store.getTask(li.getAttribute('data-x-task'))
          ? { label: t('check.taskOpen', 'Open linked task'), icon: 'external', run: () => { location.hash = '#/inbox'; } }
          : { label: t('check.task', 'Create task from item'), icon: 'plus', run: () => taskFromItem(li) },
        { label: t('check.remove', 'Turn checklist into a normal list'), icon: 'list-ul', run: () => toggleChecklist() });
    }
    const bq = ctx.target.closest('blockquote.t4-callout');
    if (bq && root() && root().contains(bq)) {
      out.push({ sep: true }, { label: t('callout.type', 'Callout type'), icon: 'ly-callout', items: calloutItems((ty) => setCalloutType(bq, ty), calloutType(bq)) },
        { label: t('callout.remove', 'Remove callout (keep text)'), icon: 'trash', run: () => removeCallout(bq) });
    }
    return out;
  });

  X.toolbar.add({ id: 'layout.checklist', group: 'layout', icon: 'ly-checklist', label: 'Checklist', labelKey: 'edx.layout.check.label', order: 1, run: toggleChecklist, isActive: () => !!closestIn(caretNode(), 'ul.t4-check') });
  X.toolbar.add({ id: 'layout.callout', group: 'layout', icon: 'ly-callout', label: 'Callout', labelKey: 'edx.layout.callout.label', order: 2, run: calloutMenuAtCaret, isActive: () => !!closestIn(caretNode(), 'blockquote.t4-callout') });
  X.toolbar.add({ id: 'layout.footnote', group: 'layout', icon: 'ly-footnote', label: 'Footnote', labelKey: 'edx.layout.fn.label', order: 3, run: insertFootnote });

  /* ---------- events ---------- */
  X.events.on('shell-built', ({ root: shell }) => {
    const doc = shell.querySelector('#ed-doc');
    if (doc) wireDoc(doc);
    lastSig = null;
    if (ro) ro.disconnect();
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (previewOn()) paintPreviewSoon(); }); const pg = shell.querySelector('#ed-page'); if (pg) ro.observe(pg); if (doc) ro.observe(doc); }
  });
  X.events.on('doc-open', () => { closePop(); lastSig = null; setTimeout(() => { refreshNotes(); paintPreview(); }, 0); });
  X.events.on('doc-close', () => { closePop(); const h = notesHost(); if (h) { h.textContent = ''; h.hidden = true; } lastSig = null; });
  X.events.on('content-change', () => { refreshNotesSoon(); if (previewOn()) paintPreviewSoon(); });
  X.events.on('doc-saved', () => { if (previewOn()) paintPreviewSoon(); });
  window.addEventListener('beforeprint', () => { closePop(); });

  /* ---------- print: notes are printed after the document ---------- */
  X.print.addCSS(() => '.ed-ly-guides, .ed-ly-pop { display: none !important; } .ed-ly-notes:not([hidden]) { display: block !important; }');
  X.print.before(() => { refreshNotes(); });
})();
