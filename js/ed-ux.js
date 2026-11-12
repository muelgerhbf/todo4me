/* Todo4Me editor module "ux": shared actions + commands, floating selection toolbar, context-menu items,
 * roving tabindex for the editor toolbars, slash-menu accessibility. Palette/shortcut help: ed-ux-palette.js,
 * block handle/drag: ed-ux-blocks.js. Everything goes through T4.edx (docs/EDITOR-EXTENSIONS.md); no core file is touched. */
T4.edux = (function () {
  'use strict';
  const X = T4.edx;
  const esc = X.util.esc, icon = X.util.icon;
  const t = (k, fb, p) => X.t('edx.ux.' + k, fb, p);
  const core = () => T4.edcore;
  const rootEl = () => { try { return X.editor.root(); } catch (e) { return null; } };
  const hasDoc = () => { try { return !!X.editor.current(); } catch (e) { return false; } };
  const readonly = () => { try { return X.editor.readonly(); } catch (e) { return false; } };
  const canEdit = () => hasDoc() && !readonly() && !!rootEl();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const fmtKey = (s) => (isMac ? s.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : s);

  // Icons the sprite does not have.
  X.icons.add('ux-grip', '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>');
  X.icons.add('ux-keyboard', '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="10" y1="10" x2="10.01" y2="10"/><line x1="14" y1="10" x2="14.01" y2="10"/><line x1="18" y1="10" x2="18.01" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/>');
  X.icons.add('ux-command', '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>');

  /** Click a button of the editor shell (the editor's own commands are wired to those buttons). */
  function shellClick(cmd) {
    const b = document.querySelector('#ed [data-cmd="' + cmd + '"]');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }
  function selectionState() { try { return core().state(); } catch (e) { return {}; } }
  /** Is some ancestor (up to the document) matching? Used for highlight/code state. */
  function inlineAncestor(test) {
    const root = rootEl(), s = window.getSelection();
    if (!root || !s.rangeCount) return false;
    let n = s.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    for (; n && n !== root; n = n.parentNode) if (n.nodeType === 1 && test(n)) return true;
    return false;
  }
  const hasHighlight = () => inlineAncestor((n) => n.tagName === 'MARK' || (n.style && n.style.backgroundColor && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(n.style.backgroundColor)));
  const inCode = () => inlineAncestor((n) => n.tagName === 'CODE');

  /* ====================== Shared actions (palette, floating bar, context menu use the same table) ====================== */
  const blockIs = (b) => (s) => s.block === b;
  const actions = {
    bold: { icon: 'bold', kbd: 'Ctrl+B', run: () => core().exec('bold'), active: (s) => !!s.bold },
    italic: { icon: 'italic', kbd: 'Ctrl+I', run: () => core().exec('italic'), active: (s) => !!s.italic },
    underline: { icon: 'underline', kbd: 'Ctrl+U', run: () => core().exec('underline'), active: (s) => !!s.underline },
    strike: { icon: 'strike', kbd: 'Ctrl+Shift+X', run: () => core().exec('strikeThrough'), active: (s) => !!s.strike },
    highlight: { icon: 'highlight', run: () => (hasHighlight() ? core().setHighlight(null) : core().setHighlight('#fff176')), active: () => hasHighlight() },
    icode: { icon: 'code', run: () => core().wrapInline('code'), active: () => inCode() },
    clear: { icon: 'eraser', kbd: 'Ctrl+\\', run: () => core().clearFormatting() },
    link: { icon: 'link', kbd: 'Ctrl+K', run: () => shellClick('link'), active: (s) => !!s.link },
    p: { icon: 'type', run: () => core().setBlockType('p'), active: blockIs('p') },
    h1: { icon: 'heading', text: 'H1', kbd: 'Alt+1', run: () => core().setBlockType(selectionState().block === 'h1' ? 'p' : 'h1'), active: blockIs('h1') },
    h2: { icon: 'heading', text: 'H2', kbd: 'Alt+2', run: () => core().setBlockType(selectionState().block === 'h2' ? 'p' : 'h2'), active: blockIs('h2') },
    h3: { icon: 'heading', text: 'H3', kbd: 'Alt+3', run: () => core().setBlockType(selectionState().block === 'h3' ? 'p' : 'h3'), active: blockIs('h3') },
    quote: { icon: 'quote', run: () => core().setBlockType('blockquote'), active: blockIs('blockquote') },
    ul: { icon: 'list-ul', kbd: 'Ctrl+Shift+8', run: () => core().exec('insertUnorderedList'), active: (s) => !!s.ul },
    ol: { icon: 'list-ol', kbd: 'Ctrl+Shift+7', run: () => core().exec('insertOrderedList'), active: (s) => !!s.ol },
    table: { icon: 'table', run: () => core().insertTable(3, 3, true) },
    image: { icon: 'image', run: () => shellClick('image') },
    math: { icon: 'sigma', kbd: 'Ctrl+M', run: () => shellClick('formula') },
    code: { icon: 'code', run: () => shellClick('code') },
    divider: { icon: 'minus', run: () => core().insertBlock(document.createElement('hr')) },
  };
  Object.keys(actions).forEach((k) => { actions[k].id = k; });
  const actionLabel = (id) => t('c.' + id, id);

  /* ====================== Commands (appear in the palette and are scriptable) ====================== */
  function cmd(id, spec) {
    if (X.commands.has('ux.' + id)) return;
    X.commands.register('ux.' + id, Object.assign({ labelKey: 'edx.ux.c.' + (spec.key || id), groupKey: 'edx.ux.g.editor', order: 100 }, spec));
  }
  const editable = () => canEdit();
  [['bold', 'format'], ['italic', 'format'], ['underline', 'format'], ['strike', 'format'], ['highlight', 'format'], ['icode', 'format'], ['clear', 'format'],
    ['p', 'blocks'], ['h1', 'blocks'], ['h2', 'blocks'], ['h3', 'blocks'], ['quote', 'blocks'], ['ul', 'blocks'], ['ol', 'blocks']].forEach(([id, g], i) => {
    cmd(id, { icon: actions[id].icon, groupKey: 'edx.ux.g.' + g, order: 10 + i, when: editable, run: () => { X.editor.restore(); actions[id].run(); } });
  });
  cmd('link', { icon: 'link', groupKey: 'edx.ux.g.format', order: 30, when: editable, run: () => { X.editor.restore(); actions.link.run(); } });
  [['table', 'insert'], ['image', 'insert'], ['math', 'insert'], ['code', 'insert'], ['divider', 'insert']].forEach(([id, g], i) => {
    cmd(id, { icon: actions[id].icon, groupKey: 'edx.ux.g.' + g, order: 40 + i, when: editable, run: () => { X.editor.restore(); actions[id].run(); } });
  });
  cmd('new', { icon: 'file-plus', readonlyOk: true, global: true, order: 1, when: () => !!document.querySelector('#ed [data-cmd="new-doc"]'), run: () => shellClick('new-doc') });
  cmd('pdf', { icon: 'pdf', readonlyOk: true, order: 2, when: hasDoc, run: () => shellClick('export-pdf') });
  cmd('page', { icon: 'page', order: 3, when: canEdit, run: () => X.commands.run('editor.page-setup') });
  cmd('undo', { icon: 'undo', order: 4, when: canEdit, run: () => { X.editor.restore(); core().undo(); } });
  cmd('redo', { icon: 'redo', order: 5, when: canEdit, run: () => { X.editor.restore(); core().redo(); } });
  cmd('sidebar', { icon: 'panel', groupKey: 'edx.ux.g.view', readonlyOk: true, order: 60, when: hasDoc, run: () => shellClick('toggle-side') });
  cmd('zoomin', { icon: 'plus', groupKey: 'edx.ux.g.view', readonlyOk: true, order: 61, when: hasDoc, run: () => shellClick('zoom-in') });
  cmd('zoomout', { icon: 'minus', groupKey: 'edx.ux.g.view', readonlyOk: true, order: 62, when: hasDoc, run: () => shellClick('zoom-out') });
  cmd('zoomreset', { icon: 'reset', groupKey: 'edx.ux.g.view', readonlyOk: true, order: 63, when: hasDoc, run: () => shellClick('zoom-reset') });


  /* ====================== Floating selection toolbar ====================== */
  const FT = { el: null, visible: false, timer: 0, mouse: false, extra: [], key: '', dismissed: null };
  const FLOAT_BASE = ['bold', 'italic', 'underline', 'strike', 'highlight', 'icode', 'link', '|', 'h1', 'h2'];

  function floatItems() {
    const list = FLOAT_BASE.map((id) => (id === '|' ? { sep: true } : actions[id]));
    if (FT.extra.length) list.push({ sep: true }, ...FT.extra);
    return list;
  }
  /** Add a quick action to the floating toolbar: { id, icon, label, run(), active?() } → remove(). */
  function addQuickAction(spec) {
    if (!spec || !spec.id || typeof spec.run !== 'function' || !spec.icon) throw new TypeError('edux.addQuickAction: id, icon and run() required');
    const rec = Object.assign({}, spec, { extra: true });
    FT.extra.push(rec);
    FT.key = '';
    return () => { const i = FT.extra.indexOf(rec); if (i >= 0) FT.extra.splice(i, 1); FT.key = ''; };
  }
  function ensureFloat() {
    if (FT.el && FT.el.isConnected) return FT.el;
    const el = document.createElement('div');
    el.className = 'ed-ui ed-ux-float';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-orientation', 'horizontal');
    el.hidden = true;
    el.addEventListener('mousedown', (e) => { e.preventDefault(); }); // keep the selection and the focus in the document
    el.addEventListener('click', onFloatClick);
    el.addEventListener('keydown', onFloatKey);
    el.addEventListener('focusin', (e) => { const b = e.target.closest('button'); if (b) setRoving(el, b); });
    document.body.appendChild(el);
    FT.el = el;
    return el;
  }
  function floatLabel(it) { return it.extra ? (it.label || it.id) : actionLabel(it.id); }
  function buildFloat() {
    const el = ensureFloat();
    const key = floatItems().map((i) => i.id || '|').join(',') + '|' + (X.t('edx.ux.c.bold', 'Bold'));
    if (key === FT.key) return;
    FT.key = key;
    el.setAttribute('aria-label', t('float.label', 'Text formatting'));
    el.innerHTML = floatItems().map((it) => {
      if (it.sep) return '<span class="ed-ux-float__sep" role="separator"></span>';
      const label = floatLabel(it), kbd = it.kbd ? ' (' + fmtKey(it.kbd) + ')' : '';
      return '<button type="button" class="ed-ux-fbtn" data-ux="' + esc(it.id) + '" tabindex="-1" title="' + esc(label + kbd) + '" aria-label="' + esc(label) + '" aria-pressed="false">' +
        (it.text ? '<span class="ed-ux-fbtn__text">' + esc(it.text) + '</span>' : icon(it.icon)) + '</button>';
    }).join('');
    const first = el.querySelector('button');
    if (first) first.tabIndex = 0;
  }
  function floatItem(id) { return floatItems().find((i) => i.id === id); }
  function onFloatClick(e) {
    const b = e.target.closest('button[data-ux]');
    if (!b) return;
    const it = floatItem(b.dataset.ux);
    if (!it || !canEdit()) return;
    const isLink = it.id === 'link';
    try {
      X.editor.restore();
      if (it.extra) it.run({ editor: X.editor, edx: X }); else it.run();
    } catch (err) { console.error('[Todo4Me editor] selection toolbar action failed', err); }
    if (isLink) hideFloat();
    else { refreshActive(); schedule(30); }
  }
  function refreshActive() {
    if (!FT.el || !FT.visible) return;
    const s = selectionState();
    FT.el.querySelectorAll('button[data-ux]').forEach((b) => {
      const it = floatItem(b.dataset.ux);
      let on = false;
      try { on = !!(it && it.active && it.active(s)); } catch (e) { on = false; }
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function onFloatKey(e) {
    const bar = FT.el;
    const btns = Array.from(bar.querySelectorAll('button'));
    const i = btns.indexOf(document.activeElement);
    let to = null;
    if (e.key === 'ArrowRight') to = btns[(i + 1) % btns.length];
    else if (e.key === 'ArrowLeft') to = btns[(i - 1 + btns.length) % btns.length];
    else if (e.key === 'Home') to = btns[0];
    else if (e.key === 'End') to = btns[btns.length - 1];
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') dismissFloat(); else hideFloat();
      X.editor.restore();
      return;
    }
    if (to) { e.preventDefault(); e.stopPropagation(); to.focus(); }
  }
  /** The selection the floating toolbar belongs to, or null. */
  function floatRange() {
    const root = rootEl();
    if (!root || !canEdit()) return null;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const ae = document.activeElement;
    if (ae && ae !== root && ae !== document.body && root.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.commonAncestorContainer)) return null;
    if (core().selectedWidget) return null;
    const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
    if (anc && anc.closest && anc.closest('.t4-w')) return null;
    if (!sel.toString().replace(/[​\s]/g, '')) return null;
    return r;
  }
  function placeFloat(r) {
    const el = FT.el, sc = document.getElementById('ed-scroll');
    const sr = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    if (rect.bottom < sr.top + 2 || rect.top > sr.bottom - 2) return false; // scrolled out of view
    const w = el.offsetWidth, h = el.offsetHeight;
    let top = rect.top - h - 10;
    const ctx = document.getElementById('ed-ctx');
    const overlapsCtx = () => {
      if (!ctx || ctx.hidden) return false;
      const c = ctx.getBoundingClientRect();
      return !(top + h < c.top - 4 || top > c.bottom + 4);
    };
    if (top < sr.top + 4 || overlapsCtx()) {
      top = rect.bottom + 10;
      if (overlapsCtx()) top = rect.top - h - 10;
    }
    top = Math.max(sr.top + 4, Math.min(top, sr.bottom - h - 4));
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(sr.left + 8, Math.min(left, sr.right - w - 8));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    return true;
  }
  const sameRange = (a, b) => a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;
  /** Esc: hide the bar and keep it hidden until the selection changes. */
  function dismissFloat() { const r = floatRange(); FT.dismissed = r ? r.cloneRange() : null; hideFloat(); }
  function showFloat(force) {
    const r = floatRange();
    if (!r) { hideFloat(); return false; }
    if (force) FT.dismissed = null;
    else if (FT.dismissed && sameRange(FT.dismissed, r)) return false;
    buildFloat();
    const el = FT.el;
    const was = FT.visible;
    el.hidden = false;
    FT.visible = true;
    if (!placeFloat(r)) { hideFloat(); return false; }
    refreshActive();
    if (!was) { el.classList.remove('ed-ux-float--in'); void el.offsetWidth; el.classList.add('ed-ux-float--in'); }
    return true;
  }
  function hideFloat(keepSel) {
    if (FT.timer) { clearTimeout(FT.timer); FT.timer = 0; }
    if (!FT.el || !FT.visible) return;
    FT.visible = false;
    FT.el.hidden = true;
  }
  function schedule(ms) {
    if (FT.timer) clearTimeout(FT.timer);
    FT.timer = setTimeout(() => {
      FT.timer = 0;
      if (FT.mouse) return;
      const inBar = FT.el && FT.el.contains(document.activeElement);
      if (inBar) { if (floatRange()) placeFloat(window.getSelection().getRangeAt(0)); return; }
      showFloat();
    }, ms);
  }
  function floatFocus() {
    if (!floatRange()) { X.editor.toast(t('float.none', 'Select some text first.'), 'info', 2200); return; }
    if (!showFloat(true)) return;
    const b = FT.el.querySelector('button[tabindex="0"]') || FT.el.querySelector('button');
    if (b) b.focus();
  }
  function initFloat() {
    X.events.on('selection-change', () => {
      if (!hasDoc()) { hideFloat(); return; }
      if (FT.mouse) return;
      if (window.getSelection().isCollapsed) { FT.dismissed = null; hideFloat(); return; }
      schedule(FT.visible ? 40 : 150);
    });
    X.events.on('doc-close', () => hideFloat());
    X.events.on('shell-built', () => hideFloat());
    document.addEventListener('pointerdown', (e) => {
      if (FT.el && FT.el.contains(e.target)) return;
      const root = rootEl();
      if (root && root.contains(e.target)) { FT.mouse = true; hideFloat(); }
    }, true);
    window.addEventListener('pointerup', () => { if (FT.mouse) { FT.mouse = false; schedule(150); } }, true);
    window.addEventListener('pointercancel', () => { FT.mouse = false; }, true);
    document.addEventListener('keydown', (e) => {
      if (!FT.visible || (FT.el && FT.el.contains(e.target))) return;
      if (e.key === 'Escape') dismissFloat();
      else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) hideFloat();
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) hideFloat(); // typing replaces the selection
    }, true);
    document.addEventListener('contextmenu', () => hideFloat(), true);
    document.addEventListener('scroll', (e) => {
      if (!FT.visible) return;
      const r = floatRange();
      if (!r || !placeFloat(r)) hideFloat();
    }, true);
    window.addEventListener('resize', () => { if (FT.visible) schedule(60); });
    // The page zoom changes the layout without any event: watch the page element.
    X.events.on('shell-built', () => {
      const page = document.getElementById('ed-page');
      if (page && window.MutationObserver) new MutationObserver(() => { if (FT.visible) schedule(30); }).observe(page, { attributes: true, attributeFilter: ['style'] });
    });
  }

  /* ====================== Roving tabindex for toolbars ====================== */
  function visibleButtons(bar) {
    return Array.from(bar.querySelectorAll('button')).filter((b) => !b.disabled && !b.hidden && !b.closest('[hidden]') && b.getClientRects().length);
  }
  function setRoving(bar, btn) {
    bar.querySelectorAll('button').forEach((b) => { b.tabIndex = b === btn ? 0 : -1; });
    bar._uxCur = btn;
  }
  function applyRoving(bar) {
    const all = Array.from(bar.querySelectorAll('button'));
    if (!all.length) return;
    let cur = bar._uxCur;
    const vis = visibleButtons(bar);
    if (!cur || !bar.contains(cur) || !vis.includes(cur)) cur = vis[0] || all[0];
    all.forEach((b) => { const v = b === cur ? 0 : -1; if (b.tabIndex !== v) b.tabIndex = v; });
    bar._uxCur = cur;
  }
  function initRoving(root) {
    const bar = root && root.querySelector('#ed-toolbar');
    if (!bar || bar._uxRoving) return;
    bar._uxRoving = true;
    bar.setAttribute('aria-orientation', 'horizontal');
    applyRoving(bar);
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; applyRoving(bar); }); })
      .observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    bar.addEventListener('focusin', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && bar.contains(b)) setRoving(bar, b); });
    bar.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const b = e.target.closest && e.target.closest('button');
      if (!b || !bar.contains(b)) return;
      const btns = visibleButtons(bar);
      const i = btns.indexOf(b);
      let to = null;
      if (e.key === 'ArrowRight') to = btns[(i + 1) % btns.length];
      else if (e.key === 'ArrowLeft') to = btns[(i - 1 + btns.length) % btns.length];
      else if (e.key === 'Home') to = btns[0];
      else if (e.key === 'End') to = btns[btns.length - 1];
      else if (e.key === 'Escape' && !e.shiftKey) { e.preventDefault(); X.editor.restore(); return; }
      if (to) { e.preventDefault(); to.focus(); }
    });
  }

  /* ====================== Slash menu accessibility (observed from outside) ====================== */
  function initSlashA11y() {
    let obs = null, menu = null;
    const sync = () => {
      if (!menu) return;
      menu.setAttribute('aria-label', t('slash.label', 'Insert block'));
      menu.querySelectorAll('.ed-menu__heading').forEach((h) => h.setAttribute('role', 'presentation'));
      menu.querySelectorAll('[role="option"]').forEach((o, i) => { o.id = 'ed-ux-slash-o' + i; });
      const act = menu.querySelector('[role="option"].is-active') || menu.querySelector('[role="option"]');
      const doc = rootEl();
      if (doc) { doc.setAttribute('aria-controls', 'ed-ux-slash'); doc.setAttribute('aria-haspopup', 'listbox'); if (act) doc.setAttribute('aria-activedescendant', act.id); }
    };
    const clear = () => {
      const doc = rootEl() || document.getElementById('ed-doc');
      if (doc) ['aria-controls', 'aria-haspopup', 'aria-activedescendant'].forEach((a) => doc.removeAttribute(a));
    };
    new MutationObserver(() => {
      const m = document.querySelector('body > .ed-slash');
      if (m === menu) return;
      if (obs) { obs.disconnect(); obs = null; }
      menu = m;
      if (!m) { clear(); return; }
      m.id = 'ed-ux-slash';
      sync();
      obs = new MutationObserver(sync);
      obs.observe(m, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }).observe(document.body, { childList: true });
  }

  /* ====================== Context menu items ====================== */
  function placeCaretIn(node) {
    const r = document.createRange(); r.selectNodeContents(node); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function slashEntries() { return X.slash.list().filter((s) => !(s.when && !s.when())); }
  function findSlash(re) { return slashEntries().find((s) => re.test(s.id)); }
  function runSlash(spec) { X.editor.restore(); return spec.run({ editor: X.editor, edx: X }); }

  function contextItems(ctx) {
    if (!ctx || ctx.readonly || !canEdit()) return [];
    const root = rootEl();
    const out = [];
    const s = selectionState();
    const act = (id) => ({ label: actionLabel(id), icon: actions[id].icon, kbd: actions[id].kbd ? fmtKey(actions[id].kbd) : '', checked: actions[id].active ? !!actions[id].active(s) : false, run: () => { X.editor.restore(); actions[id].run(); } });
    const target = ctx.target && ctx.target.closest ? ctx.target : null;
    const widget = ctx.widget;
    let cell = target ? target.closest('td, th') : null;
    if (!cell && !widget) { const cc = core().cellCtx(); cell = cc ? cc.cell : null; }
    const wtype = widget ? widget.getAttribute('data-w') : '';

    if (wtype === 'img') {
      const ctxBtn = (a) => () => { const b = document.querySelector('#ed-ctx [data-ctx="' + a + '"]'); if (b) b.click(); };
      out.push({ sep: true }, { label: t('img.replace', 'Replace image…'), icon: 'image', run: ctxBtn('img-replace') }, { label: t('img.caption', 'Alt text and caption…'), icon: 'edit', run: ctxBtn('img-cap') });
    }
    if (!widget && ctx.hasSelection) {
      out.push({ sep: true }, { label: t('ctx.format', 'Format'), icon: 'bold', items: ['bold', 'italic', 'underline', 'strike', 'highlight', 'icode', 'clear'].map(act) });
    }
    if (!widget && (ctx.hasSelection || ctx.link)) out.push({ label: t('c.link', 'Link…'), icon: 'link', kbd: fmtKey('Ctrl+K'), run: () => { X.editor.restore(); actions.link.run(); } });
    if (!widget) {
      const turn = ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol'].map(act);
      if (X.commands.has('layout.checklist')) turn.push({ label: t('c.check', 'Checklist'), icon: 'ly-checklist', run: () => { X.editor.restore(); X.commands.run('layout.checklist'); } });
      out.push({ label: t('ctx.turn', 'Turn into'), icon: 'type', items: turn });
    }
    if (cell && root.contains(cell)) {
      const op = (name, key, ic) => ({ label: t(key), icon: ic, run: () => { X.editor.restore(); const c = core().cellCtx(); if (!c || c.cell !== cell) placeCaretIn(cell); core().tableOp(name); } });
      out.push({ label: t('ctx.table', 'Table'), icon: 'table', items: [
        op('row-above', 't.rowabove', 'plus'), op('row-below', 't.rowbelow', 'plus'), op('col-left', 't.colleft', 'plus'), op('col-right', 't.colright', 'plus'), { sep: true },
        op('header', 't.header', 'type'), { sep: true }, op('del-row', 't.delrow', 'trash'), op('del-col', 't.delcol', 'trash'), op('delete', 't.deltable', 'trash'),
      ] });
    }
    if (!widget) {
      const sub = [{ heading: t('g.insert', 'Insert') }, ['table', 'image', 'math', 'code', 'divider'].map((id) => ({ label: actionLabel(id), icon: actions[id].icon, run: () => { X.editor.restore(); actions[id].run(); } }))].flat();
      let last = '';
      slashEntries().forEach((sp) => {
        const g = sp.group ? X.text(sp, 'group') : '';
        if (g && g !== last) { sub.push({ heading: g }); last = g; }
        sub.push({ label: X.text(sp), icon: sp.icon || 'sparkle', run: () => runSlash(sp) });
      });
      out.push({ label: t('ctx.insert', 'Insert'), icon: 'plus', items: sub });
    }
    return out;
  }
  function registerContext() {
    X.menus.add('context', (ctx) => contextItems(ctx));
    X.menus.add('file', { label: () => t('palette', 'Command palette'), icon: 'ux-command', order: 900, kbd: 'Ctrl+Shift+P', run: () => X.commands.run('ux.palette') });
    X.menus.add('file', { label: () => t('c.shortcuts', 'Keyboard shortcuts'), icon: 'ux-keyboard', order: 901, kbd: 'Ctrl+/', run: () => X.commands.run('ux.shortcuts') });
  }

  /* ====================== Wire up ====================== */
  cmd('seltb', { icon: 'bold', order: 70, when: canEdit, run: floatFocus });
  X.shortcuts.add('alt-f10', 'ux.seltb');
  initFloat();
  registerContext();
  X.events.on('shell-built', ({ root }) => initRoving(root));
  initSlashA11y();

  /* ====================== Slash menu: fuzzy matching + recently used (edx.slash.setRanker / onPick) ====================== */
  const RECENT_KEY = 'todo4me.ux.slashRecent';
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((x) => typeof x === 'string').slice(0, 8); } catch (e) { recent = []; }
  X.slash.onPick((id) => {
    if (typeof id !== 'string') return;
    recent = [id].concat(recent.filter((x) => x !== id)).slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) { /* convenience only */ }
  });
  const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const subseq = (needle, hay) => { let i = 0; for (let k = 0; k < hay.length && i < needle.length; k++) if (hay[k] === needle[i]) i++; return i === needle.length; };
  function slashScore(d, q) {
    const label = fold(d.label), kw = fold(d.keywords);
    let sc = 0;
    if (label.startsWith(q)) sc = 100;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) sc = 90;
    else if (label.includes(q)) sc = 80;
    else if (kw.split(/\s+/).some((w) => w.startsWith(q))) sc = 70;
    else if (kw.includes(q)) sc = 60;
    else if (q.length > 1 && subseq(q, label)) sc = 40;
    else if (q.length > 1 && subseq(q, kw)) sc = 20;
    if (!sc) return 0;
    const r = recent.indexOf(d.id);
    return sc + (r >= 0 ? 9 - r : 0);
  }
  X.slash.setRanker((items, q) => {
    q = fold(q).trim();
    if (!q) return items; // the grouped default order
    return items.map((d, i) => ({ d, i, sc: slashScore(d, q) })).filter((x) => x.sc > 0).sort((a, b) => (b.sc - a.sc) || (a.i - b.i)).map((x) => x.d);
  });

  return { t, esc, icon, core, rootEl, hasDoc, readonly, canEdit, fmtKey, shellClick, actions, actionLabel, cmd, addQuickAction, floatFocus, hideFloat, showFloat, dismissFloat, placeCaretIn,
    _float: FT };
})();
