/* Todo4Me — editing engine for the document editor.
 *
 * Wraps a contenteditable element and provides: robust selection save/restore
 * (character offsets, independent of DOM node identity), an own undo/redo history
 * built from document snapshots (so widget edits, tables etc. are undoable too),
 * formatting commands, tables, links, paste/drop sanitizing, widget selection and
 * Markdown-style typing shortcuts. The UI (toolbar, menus) lives in editor.js. */
T4.edcore = (function () {
  'use strict';
  const U = T4.util, W = T4.edw, SAN = T4.edSanitize, DS = T4.docstore;

  let root = null;
  let hooks = { change() {}, selection() {}, input() {}, toast(m, t) { T4.ui.toast(m, t); }, shortcut() { return false; } };

  const TEXT_BLOCKS = /^(P|H[1-6]|LI|BLOCKQUOTE|TD|TH)$/;
  const COUNT_BLOCKS = /^(P|H[1-6]|LI|BLOCKQUOTE|TD|TH|UL|OL|TABLE|TR|THEAD|TBODY)$/;
  const isWidget = (n) => n && n.nodeType === 1 && n.classList.contains('t4-w');
  const isAtom = (n) => n.nodeType === 1 && (n.tagName === 'BR' || n.tagName === 'HR' || n.classList.contains('t4-w'));
  const isTopBlock = (n) => n && n.nodeType === 1 && (/^(P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|HR)$/.test(n.tagName) || (n.tagName === 'FIGURE' && isWidget(n)));
  const inField = (t) => t && t.nodeType === 1 && !!t.closest('textarea, input, select, .cw-head');
  const idx = (n) => Array.prototype.indexOf.call(n.parentNode.childNodes, n);

  /* ====================== Selection as character offsets ====================== */
  function pointToIndex(node, offset) {
    let count = 0, result = null;
    (function visit(n) {
      if (result !== null) return;
      if (n.nodeType === 3) { if (n === node) result = count + Math.min(offset, n.nodeValue.length); else count += n.nodeValue.length; return; }
      if (n.nodeType !== 1) return;
      if (n !== root) {
        if (isAtom(n)) { if (n === node || n.contains(node)) { result = count + (n === node && offset > 0 ? 1 : 0); return; } count += 1; return; }
        if (COUNT_BLOCKS.test(n.tagName)) count += 1;
      }
      const kids = n.childNodes;
      for (let i = 0; i < kids.length; i++) {
        if (n === node && i === offset) { result = count; return; }
        visit(kids[i]);
        if (result !== null) return;
      }
      if (n === node) result = count;
    })(root);
    return result === null ? count : result;
  }
  function indexToPoint(index) {
    let count = 0, res = null;
    (function visit(n) {
      if (res) return;
      if (n.nodeType === 3) {
        const len = n.nodeValue.length;
        if (index <= count + len) res = [n, Math.max(0, index - count)];
        else count += len;
        return;
      }
      if (n.nodeType !== 1) return;
      if (n !== root) {
        if (isAtom(n)) {
          if (index <= count) { res = [n.parentNode, idx(n)]; return; }
          count += 1;
          if (index === count && !n.nextSibling) res = [n.parentNode, idx(n) + 1];
          return;
        }
        if (COUNT_BLOCKS.test(n.tagName)) {
          count += 1;
          if (index === count && !n.firstChild) { res = [n, 0]; return; }
        }
      }
      for (let i = 0; i < n.childNodes.length && !res; i++) visit(n.childNodes[i]);
      if (!res && n !== root && index === count && TEXT_BLOCKS.test(n.tagName)) res = [n, n.childNodes.length];
    })(root);
    return res || [root, root.childNodes.length];
  }
  function getSel() {
    const s = window.getSelection();
    if (!s.rangeCount || !root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null;
    return { a: pointToIndex(s.anchorNode, s.anchorOffset), f: pointToIndex(s.focusNode, s.focusOffset) };
  }
  function setSel(sel) {
    if (!sel) return;
    try {
      const a = indexToPoint(sel.a), f = sel.f === sel.a ? a : indexToPoint(sel.f);
      const s = window.getSelection();
      s.setBaseAndExtent(a[0], a[1], f[0], f[1]);
    } catch (e) { caretAtEnd(); }
  }
  function caretAtEnd() {
    const r = document.createRange();
    r.selectNodeContents(root.lastElementChild && !isWidget(root.lastElementChild) ? root.lastElementChild : root);
    r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function range() {
    const s = window.getSelection();
    return s.rangeCount && root.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : null;
  }

  // Remember the selection while the user works in toolbars/dialogs.
  let liveRange = null, savedSel = null;
  const saveSelSoon = U.debounce(() => { if (root && root.isConnected) savedSel = getSel() || savedSel; }, 200);
  document.addEventListener('selectionchange', () => {
    if (!root) return;
    const r = range();
    if (r) { liveRange = r.cloneRange(); saveSelSoon(); }
    syncWidgetSelection();
    hooks.selection();
  });
  /** Put focus + selection back into the document (after a toolbar click, dialog, re-mount…). */
  function restore() {
    if (!root || !root.isConnected) return;
    const hasSel = !!range();
    if (document.activeElement !== root && !(document.activeElement && root.contains(document.activeElement) && inField(document.activeElement))) root.focus({ preventScroll: true });
    if (hasSel) return;
    if (liveRange && root.contains(liveRange.startContainer) && liveRange.startContainer.isConnected) {
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(liveRange);
    } else if (savedSel) setSel(savedSel);
    else caretAtEnd();
  }
  function rememberSelection() { savedSel = getSel() || savedSel; return savedSel; }

  /* ====================== Serialization ====================== */
  function canonicalClone() {
    const c = root.cloneNode(true);
    const live = root.querySelectorAll('.t4-w');
    c.querySelectorAll('.t4-w').forEach((w, i) => {
      const type = w.getAttribute('data-w');
      const fresh = document.createElement(w.tagName === 'SPAN' ? 'span' : 'figure');
      fresh.className = 't4-w';
      fresh.setAttribute('data-w', type);
      fresh.setAttribute('data-p', w.getAttribute('data-p') || '{}');
      if (type === 'code') {
        const ta = live[i] && live[i].querySelector('textarea');
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = ta ? ta.value : (w.querySelector('pre') || w).textContent;
        pre.appendChild(code);
        fresh.appendChild(pre);
      }
      w.replaceWith(fresh);
    });
    // Zero-width helpers that keep the caret next to inline formulas are not content.
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    const empty = [];
    while (tw.nextNode()) {
      const t = tw.currentNode;
      if (t.nodeValue.indexOf('​') !== -1) { t.nodeValue = t.nodeValue.replace(/​/g, ''); if (!t.nodeValue) empty.push(t); }
    }
    empty.forEach((t) => t.remove());
    c.querySelectorAll('[contenteditable], [spellcheck]').forEach((e) => { e.removeAttribute('contenteditable'); e.removeAttribute('spellcheck'); });
    c.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
    return c;
  }
  /** Canonical, sanitized HTML of the document — exactly what is stored and what undo restores. */
  function serialize() { return SAN.sanitizeToString(canonicalClone().innerHTML); }

  function textOf(container) {
    let out = '';
    (function visit(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (isWidget(n)) {
        let p = {};
        try { p = JSON.parse(n.getAttribute('data-p') || '{}'); } catch (e) { /* ignore */ }
        const w = n.getAttribute('data-w');
        if (w === 'math') out += ' ' + (p.tex || '') + ' ';
        else if (w === 'code') out += '\n' + n.textContent + '\n';
        else if (w === 'chart') out += '\n' + (p.title || '') + ' ' + (p.labels || []).join(' ') + '\n';
        else if (w === 'img') out += '\n' + (p.cap || '') + '\n';
        else if (w === 'draw') out += '\n' + (p.shapes || []).map((s) => s.text || '').join(' ') + '\n';
        return;
      }
      if (n.tagName === 'BR') { out += '\n'; return; }
      const block = /^(P|H[1-6]|LI|BLOCKQUOTE|TR|TABLE|UL|OL)$/.test(n.tagName);
      if (n.tagName === 'TD' || n.tagName === 'TH') out += ' ';
      n.childNodes.forEach(visit);
      if (block) out += '\n';
    })(container);
    return out.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /** { html, text, words, chars } of the current document */
  function snapshot() {
    const html = serialize();
    return Object.assign({ html }, statsOf(html));
  }
  /** { text, words, chars } for any stored document HTML (used for search and counts). */
  function statsOf(html) {
    const c = document.createElement('div');
    c.innerHTML = html;
    const text = textOf(c);
    return { text, words: (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []).length, chars: text.replace(/\s/g, '').length };
  }

  /* ====================== History (undo / redo) ====================== */
  const hist = { stack: [], index: -1, timer: null, coalesce: null, coalesceAt: 0 };
  function histReset() {
    clearTimeout(hist.timer); hist.timer = null;
    hist.stack = [{ html: serialize(), sel: null }];
    hist.index = 0;
  }
  function histPush(coalesceKey) {
    clearTimeout(hist.timer); hist.timer = null;
    if (!root) return;
    const html = serialize();
    const sel = getSel();
    const top = hist.stack[hist.index];
    if (top && top.html === html) { top.sel = sel; return; }
    const now = Date.now();
    if (coalesceKey && hist.coalesce === coalesceKey && now - hist.coalesceAt < 1500 && hist.index > 0) {
      hist.stack[hist.index] = { html, sel };
    } else {
      hist.stack = hist.stack.slice(0, hist.index + 1);
      hist.stack.push({ html, sel });
      // Cap memory: at most 200 steps or ~60 MB of snapshots.
      let total = hist.stack.reduce((s, x) => s + x.html.length, 0);
      while (hist.stack.length > 200 || (total > 30e6 && hist.stack.length > 2)) total -= hist.stack.shift().html.length;
      hist.index = hist.stack.length - 1;
    }
    hist.coalesce = coalesceKey || null;
    hist.coalesceAt = now;
  }
  function histTyping(inputType) {
    if (/^(insertParagraph|insertLineBreak|insertFromPaste|insertFromDrop|deleteByCut|deleteByDrag|insertReplacementText|format)/.test(inputType || '')) { histPush(); return; }
    clearTimeout(hist.timer);
    hist.timer = setTimeout(() => histPush(), 650);
  }
  function load(html) {
    clearWidget();
    root.innerHTML = '';
    root.appendChild(SAN.sanitize(html));
    W.hydrate(root);
    ensureStructure();
  }
  function applySnapshot(s) {
    load(s.html);
    if (s.sel) setSel(s.sel); else caretAtEnd();
    savedSel = s.sel;
    hooks.change({ history: true });
    hooks.selection();
  }
  function undo() {
    if (hist.timer) histPush();
    if (hist.index <= 0) return false;
    const sel = hist.stack[hist.index].sel;
    hist.index--;
    applySnapshot(Object.assign({}, hist.stack[hist.index], { sel: sel || hist.stack[hist.index].sel }));
    return true;
  }
  function redo() {
    if (hist.index >= hist.stack.length - 1) return false;
    hist.index++;
    applySnapshot(hist.stack[hist.index]);
    return true;
  }
  const canUndo = () => hist.index > 0 || !!hist.timer;
  const canRedo = () => hist.index < hist.stack.length - 1;

  /** Run a mutation as one undo step. */
  function run(fn, opts) {
    opts = opts || {};
    if (!opts.keepFocus) restore();
    if (hist.timer) histPush();
    let out;
    try { out = fn(); } finally {
      tidy();
      ensureStructure();
      histPush(opts.coalesce);
      hooks.change({});
      hooks.selection();
    }
    return out;
  }

  /* ====================== Structure & cleanup ====================== */
  function ensureStructure() {
    if (!root) return;
    let para = null;
    Array.from(root.childNodes).forEach((c) => {
      if (isTopBlock(c)) { para = null; return; }
      if (c.nodeType === 3 && !c.nodeValue.trim() && !para) { if (!c.nodeValue) c.remove(); return; }
      if (c.nodeType === 1 && c.tagName === 'DIV') { const p = document.createElement('p'); while (c.firstChild) p.appendChild(c.firstChild); c.replaceWith(p); para = null; return; }
      if (!para) { para = document.createElement('p'); root.insertBefore(para, c); }
      para.appendChild(c);
    });
    if (!root.firstChild) root.appendChild(document.createElement('p')).appendChild(document.createElement('br'));
    // The caret must be able to go below a widget or table at the very end.
    const last = root.lastElementChild;
    if (last && (isWidget(last) || last.tagName === 'TABLE' || last.tagName === 'HR')) root.appendChild(document.createElement('p')).appendChild(document.createElement('br'));
  }
  function tidy() {
    root.querySelectorAll('font').forEach((f) => {
      const span = document.createElement('span');
      if (f.getAttribute('color')) span.style.color = f.getAttribute('color');
      const fam = SAN.canonicalFont(f.getAttribute('face'));
      if (fam) span.style.fontFamily = SAN.FONT_STACK[fam];
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    root.querySelectorAll('span:not(.t4-w):not([style]), span:not(.t4-w)[style=""]').forEach((s) => {
      if (s.closest('.t4-w')) return;
      while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
      s.remove();
    });
    // Chrome sometimes wraps pasted/indented blocks in <div>s.
    root.querySelectorAll(':scope > div:not(.t4-w)').forEach((d) => {
      const p = document.createElement('p');
      while (d.firstChild) p.appendChild(d.firstChild);
      d.replaceWith(p);
    });
    // Empty paragraphs need a <br>, or the caret cannot enter them.
    root.querySelectorAll(':scope > p:empty, li:empty, td:empty, th:empty').forEach((e) => e.appendChild(document.createElement('br')));
  }

  /* ====================== Blocks ====================== */
  function blockOf(n) {
    while (n && n !== root) {
      if (n.nodeType === 1 && TEXT_BLOCKS.test(n.tagName)) {
        // a <p> inside <li>/<blockquote> is the more specific block
        return n;
      }
      n = n.parentNode;
    }
    return null;
  }
  function topBlockOf(n) {
    while (n && n.parentNode !== root) n = n.parentNode;
    return n && n.parentNode === root ? n : null;
  }
  function currentBlock() { const r = range(); return r ? blockOf(r.startContainer) : null; }
  function currentTopBlock() { const r = range(); return r ? topBlockOf(r.startContainer) : null; }
  function selectedBlocks() {
    const r = range();
    if (!r) return [];
    const out = [];
    const add = (n) => { const b = blockOf(n); if (b && !out.includes(b)) out.push(b); };
    add(r.startContainer);
    if (!r.collapsed) {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      tw.currentNode = r.startContainer;
      while (tw.nextNode()) {
        const n = tw.currentNode;
        if (r.comparePoint(n, 0) > 0) break;
        add(n);
      }
      add(r.endContainer);
    }
    // Paragraph-level formats apply to the paragraph, not to an enclosing quote/list item + paragraph twice.
    return out.filter((b) => !out.some((o) => o !== b && b.contains(o)));
  }
  const isEmptyBlock = (b) => b && !b.textContent.replace(/​/g, '').trim() && !b.querySelector('.t4-w, img');

  function setBlockStyle(prop, value) {
    run(() => selectedBlocks().forEach((b) => {
      const target = b.tagName === 'TD' || b.tagName === 'TH' ? b : b;
      target.style[prop] = value == null ? '' : value;
      if (!target.getAttribute('style')) target.removeAttribute('style');
    }));
  }
  function indent(delta) {
    const r = range();
    if (!r) return;
    const inList = !!(blockOf(r.startContainer) && blockOf(r.startContainer).closest('li'));
    if (inList) { run(() => document.execCommand(delta > 0 ? 'indent' : 'outdent')); return; }
    run(() => selectedBlocks().forEach((b) => {
      if (b.tagName === 'TD' || b.tagName === 'TH') return;
      const cur = parseFloat(b.style.marginLeft) || 0;
      const next = Math.max(0, Math.min(400, cur + delta * 40));
      b.style.marginLeft = next ? next + 'px' : '';
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }));
  }
  /** Normal text / headings / quote. */
  function setBlockType(tag) {
    run(() => {
      const blocks = selectedBlocks();
      const inQuote = blocks.length && blocks.every((b) => b.closest('blockquote'));
      if (tag === 'blockquote' && inQuote) { document.execCommand('formatBlock', false, 'p'); unwrapQuotes(blocks); return; }
      document.execCommand('formatBlock', false, tag);
    });
  }
  function unwrapQuotes(blocks) {
    blocks.forEach((b) => {
      const q = b.closest('blockquote');
      if (!q || !q.isConnected) return;
      while (q.firstChild) q.parentNode.insertBefore(q.firstChild, q);
      q.remove();
    });
  }

  /* ====================== Inline formatting ====================== */
  function exec(cmd, val, css) {
    run(() => {
      document.execCommand('styleWithCSS', false, !!css);
      document.execCommand(cmd, false, val);
      document.execCommand('styleWithCSS', false, false);
    });
  }
  function setFontSize(pt) {
    run(() => {
      const sel = getSel();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      root.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement('span');
        span.style.fontSize = pt + 'pt';
        if (f.getAttribute('color')) span.style.color = f.getAttribute('color');
        if (f.getAttribute('face')) { const fam = SAN.canonicalFont(f.getAttribute('face')); if (fam) span.style.fontFamily = SAN.FONT_STACK[fam]; }
        while (f.firstChild) span.appendChild(f.firstChild);
        span.querySelectorAll('[style]').forEach((x) => { x.style.fontSize = ''; });
        f.replaceWith(span);
      });
      // Chrome uses "font-size: xxx-large" spans in some contexts instead of <font>.
      root.querySelectorAll('span[style*="xxx-large"]').forEach((s) => { s.style.fontSize = pt + 'pt'; });
      setSel(sel);
    });
  }
  function setFont(name) {
    const stack = SAN.FONT_STACK[name];
    if (stack) exec('fontName', stack, true);
  }
  function setColor(c) { exec('foreColor', c || '#1f2330', true); if (!c) stripStyleInSelection('color'); }
  function setHighlight(c) { if (c) exec('hiliteColor', c, true); else run(() => { document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, 'transparent'); document.execCommand('styleWithCSS', false, false); stripStyleInSelection('background-color', true); }); }
  function stripStyleInSelection(prop, noRun) {
    const doIt = () => {
      const r = range();
      if (!r) return;
      root.querySelectorAll('span[style]').forEach((s) => {
        if (!r.intersectsNode(s)) return;
        s.style.removeProperty(prop);
        if (!s.getAttribute('style')) s.removeAttribute('style');
      });
    };
    if (noRun) doIt(); else run(doIt, { keepFocus: true });
  }
  function clearFormatting() {
    run(() => {
      document.execCommand('removeFormat');
      const r = range();
      if (r) root.querySelectorAll('span[style], mark, code').forEach((s) => {
        if (!r.intersectsNode(s) || s.closest('.t4-w')) return;
        while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
        s.remove();
      });
    });
  }
  function wrapInline(tag) {
    run(() => {
      const r = range();
      if (!r || r.collapsed) return;
      const existing = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer.closest(tag) : r.commonAncestorContainer.parentNode.closest(tag);
      if (existing && root.contains(existing)) { while (existing.firstChild) existing.parentNode.insertBefore(existing.firstChild, existing); existing.remove(); return; }
      const el = document.createElement(tag);
      el.appendChild(r.extractContents());
      r.insertNode(el);
      const s = window.getSelection(); const nr = document.createRange(); nr.selectNodeContents(el); s.removeAllRanges(); s.addRange(nr);
    });
  }

  /* ====================== Toolbar state ====================== */
  function state() {
    const r = range();
    const st = { inDoc: !!r, widget: selWidget };
    if (!r) return st;
    const q = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
    st.bold = q('bold'); st.italic = q('italic'); st.underline = q('underline'); st.strike = q('strikeThrough');
    st.sup = q('superscript'); st.sub = q('subscript');
    st.ul = q('insertUnorderedList'); st.ol = q('insertOrderedList');
    st.align = q('justifyCenter') ? 'center' : q('justifyRight') ? 'right' : q('justifyFull') ? 'justify' : 'left';
    const b = blockOf(r.startContainer);
    st.block = b ? (b.closest('blockquote') && b.tagName === 'P' ? 'blockquote' : b.tagName === 'LI' || b.tagName === 'TD' || b.tagName === 'TH' ? 'p' : b.tagName.toLowerCase()) : 'p';
    if (b && b.tagName === 'BLOCKQUOTE') st.block = 'blockquote';
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const cs = getComputedStyle(el);
    st.font = SAN.canonicalFont(cs.fontFamily) || 'Calibri';
    st.size = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    st.lineHeight = b ? (b.style.lineHeight || '') : '';
    st.cell = el.closest('td, th');
    st.link = el.closest('a');
    if (st.cell && !root.contains(st.cell)) st.cell = null;
    if (st.link && !root.contains(st.link)) st.link = null;
    return st;
  }

  /* ====================== Widgets: insert / select ====================== */
  let selWidget = null;
  function selectWidget(w, opts) {
    if (selWidget && selWidget !== w) clearWidget();
    selWidget = w;
    w.classList.add('is-selected');
    if (!(opts && opts.noRange)) {
      if (document.activeElement !== root) root.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNode(w);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    hooks.selection();
  }
  function clearWidget() {
    if (!selWidget) return;
    const w = selWidget;
    selWidget = null;
    w.classList.remove('is-selected');
    if (w.getAttribute('data-w') === 'draw' && w._sel && w.isConnected) W.drawing.select(w, null);
    hooks.selection();
  }
  function syncWidgetSelection() {
    if (!selWidget) return;
    if (!selWidget.isConnected) { selWidget = null; return; }
    if (document.activeElement && selWidget.contains(document.activeElement)) return; // typing in code block
    const r = range();
    if (!r) return;
    const w = selWidget;
    const touches = r.intersectsNode(w) || (r.startContainer === w.parentNode && Math.abs(r.startOffset - idx(w)) <= 1);
    if (!touches) clearWidget();
  }
  function caretBefore(n) {
    const r = document.createRange();
    const prev = n.previousSibling;
    if (prev && prev.nodeType === 1 && TEXT_BLOCKS.test(prev.tagName)) { r.selectNodeContents(prev); r.collapse(false); }
    else if (n.parentNode === root) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); root.insertBefore(p, n); r.setStart(p, 0); r.collapse(true); }
    else { r.setStartBefore(n); r.collapse(true); }
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function caretAfter(n) {
    const r = document.createRange();
    if (n.parentNode === root) {
      let next = n.nextSibling;
      if (!next || !(next.nodeType === 1 && TEXT_BLOCKS.test(next.tagName))) {
        next = document.createElement('p'); next.appendChild(document.createElement('br'));
        n.parentNode.insertBefore(next, n.nextSibling);
      }
      r.setStart(next, 0);
    } else {
      // inline widget: make sure a text node follows so the caret has somewhere to go
      if (!n.nextSibling || n.nextSibling.nodeType !== 3) n.parentNode.insertBefore(document.createTextNode('​'), n.nextSibling);
      r.setStart(n.nextSibling, n.nextSibling.nodeValue.startsWith('​') ? 1 : 0);
    }
    r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /** Split the current paragraph/heading at the caret; returns the block the new content goes after. */
  function splitAtCaret() {
    const r = range();
    const top = r ? topBlockOf(r.startContainer) : null;
    if (!top) return root.lastChild;
    if (!/^(P|H[1-6])$/.test(top.tagName)) return top;
    if (!r.collapsed) r.deleteContents();
    const tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(top, top.childNodes.length);
    const frag = tail.extractContents();
    const hasTail = frag.textContent.replace(/​/g, '').trim() || frag.querySelector && frag.querySelector('.t4-w');
    if (hasTail) {
      const nb = top.cloneNode(false);
      nb.appendChild(frag);
      top.after(nb);
    }
    if (isEmptyBlock(top)) {
      const before = top.previousSibling;
      if (!top.nextSibling || hasTail) { top.remove(); return before || null; }
    }
    return top;
  }
  function insertBlocksAfter(after, nodes) {
    if (after && after.parentNode === root) after.after(...nodes);
    else root.prepend(...nodes);
  }
  /** Insert a block element (widget, table, hr) at the caret. */
  function insertBlock(el, opts) {
    opts = opts || {};
    return run(() => {
      const after = splitAtCaret();
      insertBlocksAfter(after, [el]);
      if (isWidget(el)) W.hydrate(el);
      ensureStructure();
      if (opts.select && isWidget(el)) selectWidget(el);
      else if (opts.caretIn) { const r = document.createRange(); r.selectNodeContents(opts.caretIn); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      else caretAfter(el);
      return el;
    });
  }
  function insertInlineWidget(el) {
    return run(() => {
      const r = range() || (caretAtEnd(), range());
      r.deleteContents();
      r.insertNode(el);
      W.hydrate(el);
      caretAfter(el);
      return el;
    });
  }
  function replaceWidget(oldEl, newEl) {
    return run(() => {
      oldEl.replaceWith(newEl);
      W.hydrate(newEl);
      selectWidget(newEl);
    }, { keepFocus: true });
  }
  function removeWidget(w) {
    run(() => {
      const next = w.nextSibling, prev = w.previousSibling;
      const inline = w.tagName === 'SPAN';
      clearWidget();
      w.remove();
      const r = document.createRange();
      if (inline) { if (next) r.setStart(next, 0); else if (prev) r.setStartAfter(prev); else r.selectNodeContents(root); }
      else if (next && next.nodeType === 1 && TEXT_BLOCKS.test(next.tagName)) r.setStart(next, 0);
      else if (prev && prev.nodeType === 1 && TEXT_BLOCKS.test(prev.tagName)) { r.selectNodeContents(prev); r.collapse(false); }
      else { ensureStructure(); r.selectNodeContents(root.firstChild); }
      r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }, { keepFocus: true });
  }

  /* ====================== Images ====================== */
  async function insertImages(files, at) {
    for (const f of files) {
      try {
        const blob = await W.prepareImage(f);
        const id = await DS.putAsset(blob);
        let w = 100;
        try {
          const bmp = await createImageBitmap(blob);
          w = Math.max(10, Math.min(100, Math.round((bmp.width / Math.max(300, root.clientWidth || 600)) * 100)));
          bmp.close();
        } catch (e) { /* keep 100 */ }
        if (at) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(at); at = null; }
        insertBlock(W.create('img', { a: id, w, al: 'center', alt: (f.name || '').replace(/\.\w+$/, '') }), { select: true });
      } catch (e) {
        hooks.toast(e.message || 'Could not insert the image.', 'error');
      }
    }
  }
  function startImageResize(w, e) {
    e.preventDefault();
    const box = w.querySelector('.iw-box');
    const total = root.clientWidth || 600;
    const al = w.getAttribute('data-al');
    const left = box.getBoundingClientRect().left;
    const right = box.getBoundingClientRect().right;
    let pct = parseFloat(box.style.width) || 100;
    const move = (ev) => {
      const width = al === 'right' || al === 'float-right' ? right - ev.clientX : ev.clientX - left;
      pct = Math.max(5, Math.min(100, Math.round(((al === 'center' ? width * 2 - (right - left) : width) / total) * 100)));
      if (al === 'center') pct = Math.max(5, Math.min(100, Math.round(((ev.clientX - left) / total) * 100)));
      box.style.width = pct + '%';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const p = W.getProps(w); p.w = pct;
      run(() => W.setProps(w, p), { keepFocus: true });
      selectWidget(w);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ====================== Tables ====================== */
  function makeTable(rows, cols, header) {
    const t = document.createElement('table');
    t.className = 't4-table';
    const mk = (tag) => { const c = document.createElement(tag); c.appendChild(document.createElement('br')); return c; };
    if (header) {
      const th = document.createElement('thead'), tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) tr.appendChild(mk('th'));
      th.appendChild(tr); t.appendChild(th);
    }
    const tb = document.createElement('tbody');
    for (let r = 0; r < rows - (header ? 1 : 0); r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) tr.appendChild(mk('td'));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }
  function insertTable(rows, cols, header) {
    const t = makeTable(Math.max(1, rows), Math.max(1, cols), header !== false && rows > 1);
    insertBlock(t, { caretIn: t.querySelector('th, td') });
  }
  function cellCtx() {
    const r = range();
    if (!r) return null;
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const cell = el.closest('td, th');
    if (!cell || !root.contains(cell)) return null;
    const row = cell.parentNode, table = cell.closest('table');
    return { cell, row, table, col: Array.prototype.indexOf.call(row.children, cell) };
  }
  function focusCell(cell, atEnd) {
    const r = document.createRange(); r.selectNodeContents(cell); r.collapse(!atEnd);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function tableOp(op, value) {
    const c = cellCtx();
    if (!c) return;
    const { cell, row, table, col } = c;
    const before = getSel();
    const rows = () => Array.from(table.querySelectorAll('tr'));
    const newCell = (tag) => { const x = document.createElement(tag); x.appendChild(document.createElement('br')); return x; };
    run(() => {
      switch (op) {
        case 'row-above': case 'row-below': {
          const tr = document.createElement('tr');
          const inHead = row.parentNode.tagName === 'THEAD';
          for (let i = 0; i < row.children.length; i++) tr.appendChild(newCell(inHead && op === 'row-above' ? 'th' : 'td'));
          if (inHead && op === 'row-below') { let tb = table.querySelector('tbody'); if (!tb) { tb = document.createElement('tbody'); table.appendChild(tb); } tb.prepend(tr); }
          else if (op === 'row-above') row.before(tr); else row.after(tr);
          focusCell(tr.children[Math.min(col, tr.children.length - 1)]);
          break;
        }
        case 'col-left': case 'col-right':
          rows().forEach((tr) => {
            const ref = tr.children[Math.min(col, tr.children.length - 1)];
            const nc = newCell(tr.parentNode.tagName === 'THEAD' ? 'th' : 'td');
            if (op === 'col-left') ref.before(nc); else ref.after(nc);
          });
          focusCell(row.children[op === 'col-left' ? col : col + 1]);
          break;
        case 'del-row': {
          const all = rows();
          if (all.length <= 1) { removeTable(table); break; }
          const i = all.indexOf(row);
          row.remove();
          const next = rows()[Math.min(i, rows().length - 1)];
          if (next && !next.parentNode.children.length) next.parentNode.remove();
          focusCell(next.children[Math.min(col, next.children.length - 1)]);
          table.querySelectorAll('thead, tbody').forEach((s) => { if (!s.children.length) s.remove(); });
          break;
        }
        case 'del-col':
          if (row.children.length <= 1) { removeTable(table); break; }
          rows().forEach((tr) => { const x = tr.children[col]; if (x) x.remove(); });
          focusCell(row.children[Math.min(col, row.children.length - 1)]);
          break;
        case 'header': {
          const head = table.querySelector('thead');
          const swap = (tr, tag) => Array.from(tr.children).forEach((x) => { const n = document.createElement(tag); while (x.firstChild) n.appendChild(x.firstChild); Array.from(x.attributes).forEach((a) => n.setAttribute(a.name, a.value)); x.replaceWith(n); });
          if (head) {
            let tb = table.querySelector('tbody'); if (!tb) { tb = document.createElement('tbody'); table.appendChild(tb); }
            Array.from(head.children).reverse().forEach((tr) => { swap(tr, 'td'); tb.prepend(tr); });
            head.remove();
          } else {
            const first = table.querySelector('tr');
            const th = document.createElement('thead');
            table.prepend(th);
            th.appendChild(first);
            swap(first, 'th');
          }
          setSel(before); // the cells were replaced: keep the caret where it was
          break;
        }
        case 'cell-bg':
          cell.style.backgroundColor = value || '';
          if (!cell.getAttribute('style')) cell.removeAttribute('style');
          setSel(before);
          break;
        case 'delete':
          removeTable(table);
          break;
      }
    });
  }
  function removeTable(table) {
    const next = table.nextElementSibling;
    table.remove();
    ensureStructure();
    const target = next && TEXT_BLOCKS.test(next.tagName) ? next : root.firstElementChild;
    const r = document.createRange(); r.selectNodeContents(target); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function tabInTable(back) {
    const c = cellCtx();
    if (!c) return false;
    const cells = Array.from(c.table.querySelectorAll('td, th'));
    const i = cells.indexOf(c.cell);
    if (back) { if (i > 0) focusCell(cells[i - 1], true); return true; }
    if (i < cells.length - 1) { focusCell(cells[i + 1], true); return true; }
    tableOp('row-below');
    return true;
  }

  /* ====================== Links ====================== */
  function linkAtCaret() { const s = state(); return s.link || null; }
  function setLink(href, text, existing) {
    href = SAN.safeHref(href);
    if (!href) { hooks.toast('Please enter a valid web address (https://…) or e-mail (mailto:…).', 'error'); return false; }
    run(() => {
      if (existing && existing.isConnected) {
        existing.setAttribute('href', href);
        if (text && text !== existing.textContent) existing.textContent = text;
        const r = document.createRange(); r.selectNodeContents(existing); r.collapse(false);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        return;
      }
      const r = range();
      if (r && !r.collapsed && !text) { document.execCommand('createLink', false, href); return; }
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text || (r && !r.collapsed ? r.toString() : href);
      if (r) { r.deleteContents(); r.insertNode(a); }
      const nr = document.createRange(); nr.setStartAfter(a); nr.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr);
    });
    return true;
  }
  function removeLink(a) {
    if (!a || !a.isConnected) return;
    run(() => { while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a); a.remove(); }, { keepFocus: true });
  }

  /* ====================== Paste & drop ====================== */
  function looksLikeMarkdown(t) {
    return t.includes('\n') && /(^|\n)(#{1,6} |[-*+] |\d+\. |> |```|\|.+\|\s*\n\s*\|?\s*:?-{3})/.test(t);
  }
  function insertSanitized(html) {
    const pending = [];
    const frag = SAN.sanitize(html, {
      onImage(url, alt) {
        const ph = document.createElement('p');
        ph.className = 'ed-img-pending';
        ph.textContent = '…';
        pending.push({ ph, url, alt });
        return ph;
      },
    });
    run(() => {
      const r = range() || (caretAtEnd(), range());
      if (!r.collapsed) document.execCommand('delete');
      const nodes = Array.from(frag.childNodes);
      const blockCtx = blockOf(range().startContainer);
      const intoCell = blockCtx && /^(TD|TH|LI)$/.test(blockCtx.tagName);
      const single = nodes.length === 1 && nodes[0].nodeType === 1 && /^(P)$/.test(nodes[0].tagName) && !nodes[0].getAttribute('style');
      if (single || intoCell) {
        // Inline paste into the current line (multi-paragraph content into a cell → line breaks)
        const inlineFrag = document.createDocumentFragment();
        nodes.forEach((n, i) => {
          if (i) inlineFrag.appendChild(document.createElement('br'));
          if (n.nodeType === 1 && TEXT_BLOCKS.test(n.tagName)) { while (n.firstChild) inlineFrag.appendChild(n.firstChild); }
          else if (!isWidget(n) || n.tagName === 'SPAN') inlineFrag.appendChild(n);
        });
        const last = inlineFrag.lastChild;
        const rr = range();
        rr.insertNode(inlineFrag);
        if (last) { const nr = document.createRange(); nr.setStartAfter(last); nr.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr); }
      } else {
        const after = splitAtCaret();
        insertBlocksAfter(after, nodes);
        const last = nodes[nodes.length - 1];
        if (last && last.isConnected) {
          if (isWidget(last) || last.tagName === 'TABLE' || last.tagName === 'HR') { ensureStructure(); caretAfter(last); }
          else { const nr = document.createRange(); nr.selectNodeContents(last); nr.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr); }
        }
      }
      W.hydrate(root);
    });
    // Pasted images arrive as data URLs: store them as assets, then swap in real image widgets.
    pending.forEach(async ({ ph, url, alt }) => {
      try {
        const blob = await W.prepareImage(await DS.dataURLToBlob(url));
        const id = await DS.putAsset(blob);
        if (!ph.isConnected) return;
        const el = W.create('img', { a: id, w: 100, al: 'center', alt });
        run(() => { ph.replaceWith(el); W.hydrate(el); }, { keepFocus: true });
      } catch (e) { if (ph.isConnected) ph.remove(); }
    });
  }
  function insertPlainText(text, asMarkdown) {
    if (asMarkdown && looksLikeMarkdown(text)) { insertSanitized(T4.edmd.fromMarkdown(text)); return; }
    const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
    if (paras.length === 1) { run(() => document.execCommand('insertText', false, text)); return; }
    insertSanitized(paras.map((p) => '<p>' + U.esc(p).replace(/\n/g, '<br>') + '</p>').join(''));
  }
  let plainPaste = false;

  /* ====================== Typing shortcuts (Markdown style) ====================== */
  function textBeforeCaretInBlock() {
    const r = range();
    const b = r && blockOf(r.startContainer);
    if (!b) return null;
    const pre = document.createRange();
    pre.setStart(b, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    return { block: b, text: pre.toString().replace(/​/g, ''), range: pre };
  }
  function blockShortcut() {
    const info = textBeforeCaretInBlock();
    if (!info || info.block.tagName !== 'P' || info.block.closest('li, td, th')) return false;
    const t = info.text.replace(/ /g, ' ');
    let m;
    const clear = () => {
      info.range.deleteContents();
      // Leftover empty text nodes make Chrome move the caret into the previous block.
      Array.from(info.block.childNodes).forEach((n) => { if (n.nodeType === 3 && !n.nodeValue) n.remove(); });
      if (!info.block.firstChild) info.block.appendChild(document.createElement('br'));
      const r = document.createRange();
      r.setStart(info.block, 0);
      r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    };
    if ((m = t.match(/^(#{1,6}) $/))) { histPush(); clear(); document.execCommand('formatBlock', false, 'h' + m[1].length); return true; }
    if (/^[-*+] $/.test(t)) { histPush(); clear(); document.execCommand('insertUnorderedList'); return true; }
    if ((m = t.match(/^(\d{1,3})[.)] $/))) { histPush(); clear(); document.execCommand('insertOrderedList'); const ol = currentBlock() && currentBlock().closest('ol'); if (ol && +m[1] > 1) ol.setAttribute('start', m[1]); return true; }
    if (/^> $/.test(t)) { histPush(); clear(); document.execCommand('formatBlock', false, 'blockquote'); return true; }
    return false;
  }
  const INLINE_RULES = [
    [/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'b', '**'],
    [/(?:^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'i', '*'],
    [/~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's', '~~'],
    [/==([^=\s](?:[^=]*[^=\s])?)==$/, 'mark', '=='],
    [/`([^`]+)`$/, 'code', '`'],
  ];
  function inlineShortcut() {
    const r = range();
    if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return false;
    if (r.startContainer.parentNode.closest('code')) return false;
    const node = r.startContainer;
    const before = node.nodeValue.slice(0, r.startOffset);
    for (const [re, tag, marker] of INLINE_RULES) {
      const m = before.match(re);
      if (!m) continue;
      const start = r.startOffset - (marker.length * 2 + m[1].length);
      histPush();
      const target = document.createRange();
      target.setStart(node, start);
      target.setEnd(node, r.startOffset);
      target.deleteContents();
      const el = document.createElement(tag);
      el.textContent = m[1];
      target.insertNode(el);
      const after = document.createTextNode('​');
      el.after(after);
      const nr = document.createRange(); nr.setStart(after, 1); nr.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr);
      return true;
    }
    return false;
  }
  function enterShortcut() {
    const b = currentBlock();
    if (!b || b.tagName !== 'P' || b.closest('li, td, th, blockquote')) return false;
    const t = b.textContent.replace(/​/g, '').trim();
    let m;
    if ((m = t.match(/^(```|~~~)\s*([\w+#-]*)$/))) {
      const el = W.create('code', { lang: m[2] || '', code: '' });
      run(() => { b.replaceWith(el); W.hydrate(el); ensureStructure(); });
      const ta = el.querySelector('textarea'); if (ta) ta.focus();
      selectWidget(el, { noRange: true });
      return true;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      run(() => { const hr = document.createElement('hr'); b.replaceWith(hr); caretAfter(hr); });
      return true;
    }
    if (t === '$$') { run(() => { b.textContent = ''; b.appendChild(document.createElement('br')); }); hooks.shortcut('formula-block'); return true; }
    return false;
  }

  /* ====================== Event wiring ====================== */
  function onKeyDown(e) {
    if (inField(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (hooks.keydown && hooks.keydown(e)) { e.preventDefault(); return; }

    if (selWidget && selWidget.isConnected && !(mod && /^[cxv]$/.test(k))) {
      const w = selWidget;
      if (w.getAttribute('data-w') === 'draw' && W.drawing.key(w, e)) { e.preventDefault(); return; }
      if (mod && k === 'z') { e.preventDefault(); clearWidget(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); clearWidget(); redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeWidget(w); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (w.tagName === 'SPAN' || e.ctrlKey) { hooks.shortcut('edit-widget', w); return; }
        clearWidget(); caretAfter(w); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); clearWidget(); caretBefore(w); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Escape') { e.preventDefault(); clearWidget(); caretAfter(w); return; }
      if (e.key.length === 1 && !mod) { clearWidget(); caretAfter(w); return; } // typing continues after the widget
      if (!mod) { e.preventDefault(); return; }
    }

    if (mod && !e.altKey) {
      switch (k) {
        case 'z': e.preventDefault(); e.shiftKey ? redo() : undo(); return;
        case 'y': e.preventDefault(); redo(); return;
        case 'b': e.preventDefault(); exec('bold'); return;
        case 'i': e.preventDefault(); exec('italic'); return;
        case 'u': e.preventDefault(); exec('underline'); return;
        case 'x': if (e.shiftKey) { e.preventDefault(); exec('strikeThrough'); return; } break;
        case '7': if (e.shiftKey) { e.preventDefault(); exec('insertOrderedList'); return; } break;
        case '8': if (e.shiftKey) { e.preventDefault(); exec('insertUnorderedList'); return; } break;
        case 'l': if (e.shiftKey) { e.preventDefault(); exec('justifyLeft'); return; } break;
        case 'e': e.preventDefault(); exec('justifyCenter'); return; // Ctrl+E and Ctrl+Shift+E (like Word / Google Docs)
        case 'r': if (e.shiftKey) { e.preventDefault(); exec('justifyRight'); return; } break;
        case 'j': if (e.shiftKey) { e.preventDefault(); exec('justifyFull'); return; } break;
        case '\\': e.preventDefault(); clearFormatting(); return;
        case '.': e.preventDefault(); exec('superscript'); return;
        case ',': e.preventDefault(); exec('subscript'); return;
        case 'Enter': e.preventDefault(); hooks.shortcut('pagebreak'); return;
        case ']': e.preventDefault(); indent(1); return;
        case '[': e.preventDefault(); indent(-1); return;
      }
      if (hooks.shortcut('mod-' + k, e)) { e.preventDefault(); return; }
    }
    if (mod && e.altKey && /^[0-6]$/.test(e.key)) { e.preventDefault(); setBlockType(e.key === '0' ? 'p' : 'h' + e.key); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (tabInTable(e.shiftKey)) return;
      const b = currentBlock();
      if (b && b.closest('li')) { run(() => document.execCommand(e.shiftKey ? 'outdent' : 'indent')); return; }
      if (e.shiftKey) { indent(-1); return; }
      run(() => document.execCommand('insertText', false, '    '));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      if (enterShortcut()) { e.preventDefault(); return; }
      // Enter in an empty quote line leaves the quote.
      const b = currentBlock();
      if (b && isEmptyBlock(b) && b.closest('blockquote') && b.tagName === 'P') {
        e.preventDefault();
        run(() => { const q = b.closest('blockquote'); q.after(b); if (!q.children.length && !q.textContent.trim()) q.remove(); const r = document.createRange(); r.setStart(b, 0); r.collapse(true); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); });
        return;
      }
      if (b && b.tagName === 'BLOCKQUOTE' && isEmptyBlock(b)) { e.preventDefault(); run(() => document.execCommand('formatBlock', false, 'p')); return; }
    }
    if (e.key === 'v' && mod && e.shiftKey) plainPaste = true;
  }

  function onBeforeInput(e) {
    if (inField(e.target)) return;
    if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); return; }
    if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); return; }
    if (e.inputType === 'formatBold' || e.inputType === 'formatItalic' || e.inputType === 'formatUnderline') {
      // Native shortcuts from the Edit menu etc.: route through our history.
      e.preventDefault();
      exec({ formatBold: 'bold', formatItalic: 'italic', formatUnderline: 'underline' }[e.inputType]);
    }
  }

  function onInput(e) {
    if (inField(e.target)) return;
    ensureStructure();
    let handled = false;
    if (e.inputType === 'insertText' && e.data === ' ') handled = blockShortcut();
    else if (e.inputType === 'insertText' && /[*~=`]/.test(e.data || '')) handled = inlineShortcut();
    if (/^insertFrom(Paste|Drop)/.test(e.inputType)) { tidy(); W.hydrate(root); }
    if (handled) { tidy(); histPush(); } else histTyping(e.inputType);
    hooks.change({});
    hooks.input(e);
  }

  function onPaste(e) {
    if (inField(e.target)) return;
    e.preventDefault();
    const dt = e.clipboardData;
    if (!dt) return;
    const files = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
    const html = dt.getData('text/html');
    const text = dt.getData('text/plain');
    const plain = plainPaste;
    plainPaste = false;
    if (files.length && (!html || !/<(p|div|span|table|h\d|li)\b/i.test(html))) { insertImages(files); return; }
    if (html && !plain) insertSanitized(html);
    else if (text) insertPlainText(text, !plain);
  }
  function onDrop(e) {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    insertImages(files, r && root.contains(r.startContainer) ? r : null);
  }

  function onPointerDown(e) {
    const w = e.target.closest && e.target.closest('.t4-w');
    if (!w || !root.contains(w)) { if (selWidget) clearWidget(); return; }
    if (e.target.closest('.cw-input, .cw-head')) { selectWidget(w, { noRange: true }); return; }
    if (w.getAttribute('data-w') === 'draw') {
      selectWidget(w);
      if (W.drawing.pointerDown(w, e)) e.preventDefault();
      return;
    }
    if (e.target.closest('.iw-handle')) { selectWidget(w); startImageResize(w, e); return; }
    selectWidget(w);
  }
  function onMouseDown(e) {
    const w = e.target.closest && e.target.closest('.t4-w');
    if (w && root.contains(w) && !e.target.closest('.cw-input, .cw-head')) e.preventDefault();
  }
  function onDblClick(e) {
    const w = e.target.closest && e.target.closest('.t4-w');
    if (!w || !root.contains(w) || e.target.closest('.cw-input, .cw-head')) return;
    e.preventDefault();
    if (w.getAttribute('data-w') === 'draw') { if (W.drawing.selected(w)) W.drawing.action(w, 'text'); return; }
    hooks.shortcut('edit-widget', w);
  }
  function onClick(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && root.contains(a)) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) hooks.shortcut('open-link', a);
    }
  }

  /* Code block textareas */
  function onCodeInput(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('cw-input')) return;
    const w = ta.closest('.t4-w');
    W.paintCode(w);
    histTyping('insertText');
    hooks.change({});
  }
  function onCodeKey(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('cw-input')) return;
    const w = ta.closest('.t4-w');
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      if (e.shiftKey) {
        const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
        if (ta.value.slice(lineStart, lineStart + 2) === '  ') { ta.setRangeText('', lineStart, lineStart + 2, 'preserve'); ta.setSelectionRange(Math.max(lineStart, s - 2), Math.max(lineStart, en - 2)); }
      } else ta.setRangeText('  ', s, en, 'end');
      onCodeInput({ target: ta });
      return;
    }
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); root.focus({ preventScroll: true }); clearWidget(); caretAfter(w); return; }
    if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length) { e.preventDefault(); root.focus({ preventScroll: true }); clearWidget(); caretAfter(w); return; }
    if (e.key === 'ArrowUp' && ta.selectionStart === 0) { e.preventDefault(); root.focus({ preventScroll: true }); clearWidget(); caretBefore(w); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); hooks.shortcut('mod-s', e); }
  }
  function onCodeChange(e) {
    const t = e.target;
    if (t.classList && t.classList.contains('cw-lang')) {
      const w = t.closest('.t4-w');
      const p = W.getProps(w); p.lang = t.value;
      run(() => { W.setProps(w, p); }, { keepFocus: true });
      const ta = w.querySelector('textarea'); if (ta) ta.focus();
    }
  }
  function onCodeClick(e) {
    const b = e.target.closest && e.target.closest('.cw-copy');
    if (!b) return;
    e.preventDefault();
    const w = b.closest('.t4-w');
    const ta = w.querySelector('textarea');
    copyText(ta.value);
    b.classList.add('is-done');
    b.querySelector('span').textContent = 'Copied';
    setTimeout(() => { if (b.isConnected) { b.classList.remove('is-done'); b.querySelector('span').textContent = 'Copy'; } }, 1500);
  }
  function copyText(text) {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed'; t.style.opacity = '0'; t.style.left = '-9999px';
    const prev = document.activeElement;
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    if (prev && prev.focus) prev.focus({ preventScroll: true });
    return ok;
  }

  /** Attach to a contenteditable element (once). */
  function init(el, h) {
    root = el;
    hooks = Object.assign(hooks, h || {});
    document.execCommand('defaultParagraphSeparator', false, 'p');
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('input', onInput);
    root.addEventListener('paste', onPaste);
    root.addEventListener('drop', onDrop);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('dblclick', onDblClick);
    root.addEventListener('click', onClick);
    root.addEventListener('click', onCodeClick);
    root.addEventListener('input', onCodeInput, true);
    root.addEventListener('keydown', onCodeKey, true);
    root.addEventListener('change', onCodeChange);
    W.onChange = (w, opts) => {
      if (opts.selectionOnly) { hooks.selection(); return; }
      histPush(opts.coalesce);
      hooks.change({});
      hooks.selection();
    };
  }

  return {
    init, load, serialize, snapshot, statsOf, textOf, histReset, histPush, undo, redo, canUndo, canRedo, run, restore, rememberSelection,
    getSel, setSel, exec, setFontSize, setFont, setColor, setHighlight, clearFormatting, wrapInline, setBlockType, setBlockStyle, indent,
    selectedBlocks, currentBlock, state, insertBlock, insertInlineWidget, replaceWidget, removeWidget, selectWidget, clearWidget,
    insertImages, insertTable, tableOp, cellCtx, setLink, removeLink, linkAtCaret, insertSanitized, insertPlainText, copyText,
    caretAfter, ensureStructure, textBeforeCaretInBlock,
    get selectedWidget() { return selWidget; },
    get root() { return root; },
  };
})();
