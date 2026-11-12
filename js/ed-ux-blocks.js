/* Todo4Me editor module "ux": block handle (hover), drag & drop of top-level blocks, Alt+Shift+Up/Down. All changes go through edx.editor.run. */
(function () {
  'use strict';
  const X = T4.edx, UX = T4.edux;
  const { t, icon } = UX;
  const H = { el: null, block: null, pt: null, raf: 0, drag: null, line: null, chip: null, live: null, scrollTimer: 0 };

  const root = () => UX.rootEl();
  function topBlock(el) {
    const r = root();
    while (el && el.parentNode !== r) el = el.parentNode;
    return el && el.nodeType === 1 && el.parentNode === r ? el : null;
  }
  function announce(msg) {
    if (!H.live) { H.live = document.createElement('div'); H.live.className = 'sr-only'; H.live.setAttribute('role', 'status'); H.live.setAttribute('aria-live', 'polite'); document.body.appendChild(H.live); }
    H.live.textContent = '';
    setTimeout(() => { H.live.textContent = msg; }, 30);
  }
  function snippet(b) {
    if (b.classList.contains('t4-w')) return (b.getAttribute('data-w') || 'widget');
    if (b.tagName === 'TABLE') return '▦ ' + (b.textContent || '').trim().slice(0, 30);
    return (b.textContent || '').replace(/​/g, '').trim().slice(0, 48) || '¶';
  }

  /* ---- move ---- */
  function saveRange() {
    const s = window.getSelection(), r = root();
    if (!s.rangeCount || !r.contains(s.getRangeAt(0).commonAncestorContainer)) return null;
    const g = s.getRangeAt(0);
    return { sc: g.startContainer, so: g.startOffset, ec: g.endContainer, eo: g.endOffset };
  }
  function restoreRange(sv) {
    if (!sv || !sv.sc.isConnected || !sv.ec.isConnected) return;
    const g = document.createRange();
    try { g.setStart(sv.sc, sv.so); g.setEnd(sv.ec, sv.eo); } catch (e) { return; }
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(g);
  }
  /** Move a top-level block before `ref` (null = to the end) as one undo step. */
  function moveBlock(block, ref) {
    const r = root();
    if (!r || block.parentNode !== r || ref === block || (ref && ref.parentNode !== r)) return false;
    if (block.nextElementSibling === ref) return false;
    const wasWidget = UX.core().selectedWidget === block;
    const sv = wasWidget ? null : saveRange();
    X.editor.run(() => {
      r.insertBefore(block, ref);
      if (!wasWidget) restoreRange(sv);
    });
    if (wasWidget) UX.core().selectWidget(block);
    block.scrollIntoView({ block: 'nearest' });
    return true;
  }
  function currentBlock() {
    const r = root();
    const w = UX.core().selectedWidget;
    if (w && r.contains(w)) return topBlock(w);
    const s = window.getSelection();
    if (!s.rangeCount) return null;
    const n = s.getRangeAt(0).startContainer;
    return r.contains(n) ? topBlock(n) : null;
  }
  function moveBy(dir) {
    const b = currentBlock();
    if (!b) return false;
    const ok = dir < 0 ? (b.previousElementSibling ? moveBlock(b, b.previousElementSibling) : false) : (b.nextElementSibling ? moveBlock(b, b.nextElementSibling.nextElementSibling) : false);
    if (ok) announce(t('blk.moved', 'Block moved'));
    return ok;
  }
  UX.cmd('blockup', { icon: 'arrow-right', groupKey: 'edx.ux.g.blocks', order: 30, when: UX.canEdit, run: () => moveBy(-1) });
  UX.cmd('blockdown', { icon: 'arrow-right', groupKey: 'edx.ux.g.blocks', order: 31, when: UX.canEdit, run: () => moveBy(1) });
  X.shortcuts.add('alt-shift-up', 'ux.blockup');
  X.shortcuts.add('alt-shift-down', 'ux.blockdown');

  /* ---- handle ---- */
  function ensureHandle() {
    if (H.el && H.el.isConnected) return H.el;
    const el = document.createElement('div');
    el.className = 'ed-ui ed-ux-handle';
    el.setAttribute('role', 'presentation');
    el.hidden = true;
    el.innerHTML = icon('ux-grip');
    el.addEventListener('pointerdown', onHandleDown);
    document.body.appendChild(el);
    H.el = el;
    return el;
  }
  function hideHandle() { if (H.el) H.el.hidden = true; H.block = null; }
  function placeHandle(b) {
    const el = ensureHandle(), r = root();
    const sc = document.getElementById('ed-scroll');
    const sr = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, bottom: innerHeight };
    const br = b.getBoundingClientRect();
    const scale = r.offsetWidth ? r.getBoundingClientRect().width / r.offsetWidth : 1;
    const lh = (parseFloat(getComputedStyle(b).lineHeight) || 18) * scale;
    const top = br.top + Math.max(0, (lh - 22) / 2);
    if (top < sr.top - 2 || top > sr.bottom - 14) { hideHandle(); return; }
    el.title = t('blk.drag', 'Drag to move block, click for options');
    el.hidden = false;
    el.style.left = Math.max(2, br.left - 26) + 'px'; // may overlap the sidebar when the page is scrolled sideways
    el.style.top = Math.round(top) + 'px';
    H.block = b;
  }
  function updateHover() {
    H.raf = 0;
    const r = root(), pt = H.pt;
    if (!r || !pt || !UX.canEdit() || H.drag) { if (!H.drag) hideHandle(); return; }
    const rr = r.getBoundingClientRect();
    if (pt.x < rr.left - 60 || pt.x > rr.right + 10 || pt.y < rr.top || pt.y > rr.bottom) { hideHandle(); return; }
    const el = document.elementFromPoint(Math.min(Math.max(pt.x, rr.left + 4), rr.right - 4), pt.y);
    const b = el && el.nodeType === 1 && r.contains(el) ? topBlock(el) : null;
    if (!b) { if (!(el && H.el && H.el.contains(el))) hideHandle(); return; }
    if (b !== H.block || H.el.hidden) placeHandle(b);
  }
  document.addEventListener('pointermove', (e) => {
    if (H.drag) { dragMove(e); return; }
    if (e.pointerType === 'touch' || !UX.hasDoc()) return;
    H.pt = { x: e.clientX, y: e.clientY };
    if (!H.raf) H.raf = requestAnimationFrame(updateHover);
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (H.drag) { if (e.key === 'Escape') { e.preventDefault(); endDrag(false); } return; }
    if (H.el && !H.el.hidden && e.key.length === 1) hideHandle();
  }, true);
  document.addEventListener('scroll', () => { if (H.block && H.block.isConnected && !H.drag) placeHandle(H.block); }, true);
  X.events.on('doc-close', hideHandle);
  X.events.on('shell-built', hideHandle);

  /* ---- drag ---- */
  function onHandleDown(e) {
    if (e.button !== 0 || !H.block || !UX.canEdit()) return;
    e.preventDefault();
    H.drag = { block: H.block, x: e.clientX, y: e.clientY, active: false, ref: undefined };
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
  }
  function startDrag() {
    const d = H.drag;
    d.active = true;
    document.body.classList.add('ed-ux-dragging');
    H.line = document.createElement('div'); H.line.className = 'ed-ui ed-ux-drop'; document.body.appendChild(H.line);
    H.chip = document.createElement('div'); H.chip.className = 'ed-ui ed-ux-chip'; H.chip.textContent = snippet(d.block); document.body.appendChild(H.chip);
  }
  function dropTarget(y) {
    const r = root(), kids = Array.from(r.children);
    let prev = null;
    for (const c of kids) {
      const b = c.getBoundingClientRect();
      if (y < b.top + b.height / 2) return { ref: c, y: prev ? (prev.getBoundingClientRect().bottom + b.top) / 2 : b.top };
      prev = c;
    }
    return { ref: null, y: prev ? prev.getBoundingClientRect().bottom : r.getBoundingClientRect().bottom };
  }
  function dragMove(e) {
    const d = H.drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      startDrag();
    }
    d.last = e;
    H.chip.style.left = e.clientX + 14 + 'px';
    H.chip.style.top = e.clientY + 8 + 'px';
    updateDrop();
    autoScroll(e);
  }
  function updateDrop() {
    const d = H.drag, e = d.last, r = root(), rr = r.getBoundingClientRect();
    const tg = dropTarget(e.clientY);
    d.ref = tg.ref;
    const noop = tg.ref === d.block || (d.block.nextElementSibling === tg.ref);
    H.line.style.left = rr.left + 'px'; H.line.style.width = rr.width + 'px'; H.line.style.top = Math.round(tg.y - 1) + 'px';
    H.line.classList.toggle('is-noop', !!noop);
  }
  function autoScroll(e) {
    clearInterval(H.scrollTimer);
    const sc = document.getElementById('ed-scroll');
    if (!sc) return;
    const sr = sc.getBoundingClientRect();
    const dy = e.clientY < sr.top + 40 ? -14 : e.clientY > sr.bottom - 40 ? 14 : 0;
    if (!dy) return;
    H.scrollTimer = setInterval(() => { if (!H.drag) { clearInterval(H.scrollTimer); return; } sc.scrollTop += dy; updateDrop(); }, 30);
  }
  function endDrag(drop) {
    const d = H.drag;
    H.drag = null;
    clearInterval(H.scrollTimer);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onCancel, true);
    document.body.classList.remove('ed-ux-dragging');
    if (H.line) { H.line.remove(); H.line = null; }
    if (H.chip) { H.chip.remove(); H.chip = null; }
    if (!d) return;
    if (d.active && drop && d.ref !== undefined && d.block.isConnected && moveBlock(d.block, d.ref)) announce(t('blk.moved', 'Block moved'));
    hideHandle();
  }
  function onUp(e) {
    const d = H.drag;
    if (!d) return;
    if (!d.active) { const b = d.block; endDrag(false); blockMenu(b); return; }
    endDrag(true);
  }
  function onCancel() { endDrag(false); }

  /* ---- click: small block menu ---- */
  function blockMenu(b) {
    if (!b || !b.isConnected || !H.el) return;
    const dupe = () => X.editor.run(() => { const c = b.cloneNode(true); b.after(c); });
    X.editor.openMenu(H.el, [
      { label: t('c.blockup', 'Move block up'), icon: 'arrow-right', disabled: !b.previousElementSibling, run: () => moveBlock(b, b.previousElementSibling) },
      { label: t('c.blockdown', 'Move block down'), icon: 'arrow-right', disabled: !b.nextElementSibling, run: () => moveBlock(b, b.nextElementSibling && b.nextElementSibling.nextElementSibling) },
      { label: t('blk.dup', 'Duplicate'), icon: 'copy', run: dupe },
      { label: t('blk.del', 'Delete'), icon: 'trash', danger: true, run: () => X.editor.run(() => b.remove()) },
    ], { focusFirst: false });
  }
  UX.blocks = { moveBlock, moveBy, currentBlock, dropTarget };
})();
