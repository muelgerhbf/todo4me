/* Todo4Me — ink module, engine core: widget `ink`, state, SVG rendering, commits (one editor.run per action), canvas / layer /
 * selection API, export, commands. Pointer input and tools live in js/ed-ink-input.js (loads right after this file).
 * Contract: docs/INK-CONTRACT.md (sections 2, 4, 7). All document changes go through T4.edx.editor.run. */
(function () {
  'use strict';
  const T4 = window.T4;
  if (!T4 || !T4.edx || !T4.ink || !T4.ink.model || typeof T4.ink.model.validate !== 'function') {
    if (T4 && T4.edx) console.warn('[Todo4Me ink] model not loaded: handwriting is disabled.');
    return;
  }
  const X = T4.edx, M = T4.ink.model, ink = T4.ink, C = () => T4.edcore;
  const t = (k, f, p) => X.t('edx.ink.' + k, f, p);
  const root = () => X.editor.root();
  const NS = 'http://www.w3.org/2000/svg';
  const SEL = 'figure.t4-w[data-w="ink"]';
  const L = M.LIMITS;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TOOLS = ['pen', 'hl', 'eraser', 'lasso', 'shape', 'pan'];
  const SHAPE_KINDS = ['line', 'arrow', 'rect', 'ellipse', 'tri'];
  const BGS = ['none', 'dots', 'lines', 'grid'];
  const HEX = /^#[0-9a-fA-F]{6}$/;

  /* ====================== State ====================== */
  const S = {
    mode: false, tool: 'pen',
    tools: clone(M.TOOLS_DEFAULT),
    options: { recognize: false, fingerDraw: false, autoPen: true, speedWidth: false },
    penSeen: false, activeId: null, layerOf: {}, views: {}, sel: [], clip: null, pasteN: 0, touched: false,
  };
  const subs = new Set();
  function on(fn) { subs.add(fn); return () => subs.delete(fn); }
  function emit(reason) { subs.forEach((fn) => { try { fn(reason); } catch (e) { console.error('[Todo4Me ink] listener failed', e); } }); }

  /* ====================== Elements and props ====================== */
  const byId = new Map();
  const figs = () => { const r = root(); return r ? Array.from(r.querySelectorAll(SEL)) : []; };
  function propsOf(el) {
    const a = el.getAttribute('data-p');
    if (el._inkJson !== a) { try { el._inkProps = JSON.parse(a); } catch (e) { el._inkProps = null; } el._inkJson = a; el._inkNodes = null; }
    return el._inkProps;
  }
  function elById(id) {
    if (!id) return null;
    const r = root();
    const c = byId.get(id);
    if (c && c.isConnected && r && r.contains(c)) return c;
    const f = figs().find((e) => { const p = propsOf(e); return p && p.id === id; });
    if (f) byId.set(id, f); else byId.delete(id);
    return f || null;
  }
  const activeEl = () => elById(S.activeId);
  const activeProps = () => { const e = activeEl(); return e ? propsOf(e) : null; };
  const svgOf = (el) => el.querySelector('svg.ink-svg');
  const boxOf = (el) => el.querySelector('.ink-box');
  const canInk = () => !!(X.editor.current() && !X.editor.readonly() && root());
  const toast = (m, kind) => { try { X.editor.toast(m, kind || 'info'); } catch (e) { /* ignore */ } };

  /* ---------- views (zoom / pan, never stored) ---------- */
  const viewOf = (id) => S.views[id] || { z: 1, x: 0, y: 0 };
  function clampView(P, v) {
    v.z = clamp(v.z, 0.5, 8);
    const ex = P.w - P.w / v.z, ey = P.h - P.h / v.z;
    v.x = clamp(v.x, Math.min(0, ex), Math.max(0, ex));
    v.y = clamp(v.y, Math.min(0, ey), Math.max(0, ey));
    return v;
  }
  function applyView(el, P) {
    const svg = svgOf(el); if (!svg) return;
    const v = viewOf(P.id);
    const f = (n) => Math.round(n * 1000) / 1000;
    svg.setAttribute('viewBox', f(v.x) + ' ' + f(v.y) + ' ' + f(P.w / v.z) + ' ' + f(P.h / v.z));
  }
  function setView(el, v) {
    const P = propsOf(el);
    S.views[P.id] = clampView(P, v);
    applyView(el, P); renderSel(); emit('view');
  }

  /* ====================== Rendering ====================== */
  function layerName(l, i) { return l.name || t('layerN', 'Layer {n}', { n: i + 1 }); }
  function buildSvg(P) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ink-svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('drawingAlt', 'Handwritten drawing'));
    svg.style.cssText = 'display:block;width:100%;height:auto';
    const bg = M.backgroundSVG(P.bg, P.w, P.h);
    if (bg) svg.insertAdjacentHTML('beforeend', bg);
    const groups = new Map();
    P.layers.forEach((l) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ink-layer');
      g.setAttribute('data-layer', l.id);
      if (l.hidden) g.style.display = 'none';
      if (l.locked) g.setAttribute('data-locked', '');
      svg.appendChild(g); groups.set(l.id, []);
    });
    P.items.forEach((it) => { const a = groups.get(it.l); if (a) a.push(M.itemSVG(it)); });
    P.layers.forEach((l) => { const g = Array.from(svg.children).find((n) => n.getAttribute && n.getAttribute('data-layer') === l.id); if (g) g.innerHTML = groups.get(l.id).join(''); });
    return svg;
  }
  /** Inline geometry of the box (width, aspect ratio, overlay placement). */
  function layoutBox(el, P) {
    const box = boxOf(el); if (!box) return;
    const ov = !!P.overlay;
    const s = box.style;
    s.aspectRatio = P.w + ' / ' + P.h;
    s.touchAction = 'none';
    // the box carries .cw-input (so the editor core leaves pointer events alone); undo that class's code-editor layout
    s.padding = '0'; s.border = '0'; s.overflow = 'visible'; s.right = 'auto'; s.bottom = 'auto'; s.setProperty('height', 'auto', 'important');
    if (ov) {
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.width = '100%'; s.margin = '0'; s.pointerEvents = 'none';
    } else {
      s.position = 'relative'; s.left = 'auto'; s.top = 'auto'; s.pointerEvents = ''; s.width = P.w / 10 + '%';
      s.margin = P.al === 'left' ? '0 auto 0 0' : P.al === 'right' ? '0 0 0 auto' : '0 auto';
    }
    applyView(el, P);
  }
  function render(el, P) {
    el._inkJson = el.getAttribute('data-p'); el._inkProps = P; el._inkNodes = null;
    byId.set(P.id, el);
    el.setAttribute('data-al', P.al);
    el.toggleAttribute('data-overlay', !!P.overlay);
    el.classList.toggle('is-ink-empty', !P.items.length);
    el.classList.toggle('is-ink-active', S.activeId === P.id);
    if (P.overlay) { el.style.margin = '0'; el.style.position = 'relative'; el.style.height = '0'; el.style.pointerEvents = 'none'; el.style.minHeight = '0'; }
    else { el.style.margin = ''; el.style.position = ''; el.style.height = ''; el.style.pointerEvents = ''; el.style.minHeight = ''; }
    const box = document.createElement('div');
    box.className = 'ink-box cw-input';
    if (P.bg !== 'none') box.setAttribute('data-bg', P.bg);
    if (!P.overlay) box.setAttribute('data-hint', t('emptyHint', 'Empty canvas: write or draw here'));
    box.appendChild(buildSvg(P));
    el.appendChild(box);
    layoutBox(el, P);
    if (S.activeId === P.id) addChrome(el, P);
  }
  /** Replace the SVG of an already rendered widget (layer / background / size changes). */
  function rebuild(el, P) {
    const box = boxOf(el); if (!box) { el.textContent = ''; render(el, P); return; }
    const old = svgOf(el);
    old.replaceWith(buildSvg(P));
    if (P.bg !== 'none') box.setAttribute('data-bg', P.bg); else box.removeAttribute('data-bg');
    el.setAttribute('data-al', P.al);
    el.classList.toggle('is-ink-empty', !P.items.length);
    el._inkNodes = null;
    layoutBox(el, P);
    if (S.activeId === P.id) addChrome(el, P);
    renderSel();
  }

  /* ---------- chrome of the active canvas (wet canvas, selection box, resize handles); never stored (.ed-ui) ---------- */
  function addChrome(el, P) {
    const box = boxOf(el); if (!box) return;
    el.classList.add('is-ink-active');
    if (!box.querySelector('.ink-wet')) {
      const c = document.createElement('canvas');
      c.className = 'ink-wet ed-ui';
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
      box.appendChild(c);
    }
    if (!box.querySelector('.ink-sel')) {
      const s = document.createElement('div');
      s.className = 'ink-sel ed-ui';
      s.style.cssText = 'position:absolute;display:none;pointer-events:none';
      ['nw', 'ne', 'sw', 'se'].forEach((h) => { const n = document.createElement('span'); n.className = 'ink-sel-h'; n.setAttribute('data-h', h); s.appendChild(n); });
      box.appendChild(s);
    }
    if (!P.overlay && !box.querySelector('.ink-rs')) {
      ['e', 's', 'se'].forEach((h) => { const n = document.createElement('span'); n.className = 'ink-rs ed-ui'; n.setAttribute('data-rs', h); box.appendChild(n); });
    }
  }
  function dropChrome(el) {
    el.classList.remove('is-ink-active');
    el.querySelectorAll('.ink-wet, .ink-sel, .ink-rs').forEach((n) => n.remove());
  }

  /* ---------- incremental DOM updates ---------- */
  function nodeIndex(el) {
    if (!el._inkNodes) {
      const m = new Map();
      el.querySelectorAll('.ink-layer [data-id]').forEach((n) => m.set(n.getAttribute('data-id'), n));
      el._inkNodes = m;
    }
    return el._inkNodes;
  }
  const layerG = (el, lid) => { const s = svgOf(el); return s && Array.from(s.children).find((n) => n.getAttribute('data-layer') === lid); };
  function addNodes(el, items) {
    const idx = nodeIndex(el);
    items.forEach((it) => {
      const g = layerG(el, it.l); if (!g) return;
      g.insertAdjacentHTML('beforeend', M.itemSVG(it));
      if (g.lastElementChild) idx.set(it.id, g.lastElementChild);
    });
  }
  function removeNode(el, id) { const idx = nodeIndex(el); const n = idx.get(id); if (n) { n.remove(); idx.delete(id); } }
  function replaceNode(el, oldId, items) {
    const idx = nodeIndex(el), node = idx.get(oldId);
    if (!node || !node.parentNode) { addNodes(el, items); return; }
    items.forEach((it) => { node.insertAdjacentHTML('beforebegin', M.itemSVG(it)); if (node.previousElementSibling) idx.set(it.id, node.previousElementSibling); });
    node.remove();
    if (idx.get(oldId) === node) idx.delete(oldId);
  }

  /* ====================== Commit: one editor.run per action ====================== */
  /** mutate(draft) edits a shallow copy of the props (replace arrays, never edit them in place); dom(validProps, previousProps) updates the SVG
   *  incrementally (default: rebuild). Returns the new props or false. */
  function commit(el, mutate, dom, opts) {
    opts = opts || {};
    if (!el || !el.isConnected || !canInk()) return false;
    const prev = propsOf(el); if (!prev) return false;
    const d = Object.assign({}, prev);
    mutate(d);
    const v = M.validate(d);
    if (!v) return false;
    if (v.items.length < d.items.length) { toast(t('full', 'This drawing is full. Add another canvas.'), 'error'); return false; }
    const json = JSON.stringify(v);
    if (json.length > L.BYTES + 50000) { toast(t('full', 'This drawing is full. Add another canvas.'), 'error'); return false; }
    const removeOverlay = v.overlay && !v.items.length && !opts.keep;
    if (!removeOverlay) {
      el._inkJson = json; el._inkProps = v;
      if (dom) dom(v, prev); else rebuild(el, v);
      el.classList.toggle('is-ink-empty', !v.items.length);
    }
    X.editor.run(() => {
      if (removeOverlay) {
        if (el._inkTemp) { el.remove(); return; }
        el.remove();
      } else { el.setAttribute('data-p', json); }
    }, { keepFocus: true });
    el._inkTemp = false;
    if (removeOverlay) { byId.delete(prev.id); if (S.activeId === prev.id) { S.activeId = null; S.sel = []; emit('active'); } }
    if (S.sel.length) { const have = new Set(v.items.map((it) => it.id)); S.sel = S.sel.filter((id) => have.has(id)); }
    emit('content'); emit('history');
    return v;
  }
  const addItems = (el, items, grow) => commit(el, (d) => {
    d.items = d.items.concat(items);
    if (grow) {
      const b = M.bboxOf(items);
      if (b && b.y + b.h > d.h - 40 && d.h < L.H_MAX) d.h = Math.min(L.H_MAX, d.h + 200);
    }
  }, (v, prev) => {
    if (v.h !== prev.h) { layoutBox(el, v); const bg = svgOf(el).querySelector('.ink-bg'); const nb = M.backgroundSVG(v.bg, v.w, v.h); if (bg) bg.remove(); if (nb) svgOf(el).insertAdjacentHTML('afterbegin', nb); }
    addNodes(el, items); renderSel();
  });

  /* ====================== Layers helpers ====================== */
  function layerId(P) {
    const id = S.layerOf[P.id];
    return P.layers.some((l) => l.id === id) ? id : P.layers[P.layers.length - 1].id;
  }
  function editableLayers(P) { const s = new Set(); P.layers.forEach((l) => { if (!l.hidden && !l.locked) s.add(l.id); }); return s; }
  /** Layer to draw on, or null (with a toast) when it is locked or hidden. */
  function drawLayer(P) {
    const id = layerId(P), l = P.layers.find((x) => x.id === id);
    if (l.locked) { toast(t('layerLocked', 'This layer is locked.'), 'info'); return null; }
    if (l.hidden) { toast(t('layerHidden', 'This layer is hidden.'), 'info'); return null; }
    return id;
  }

  /* ====================== Selection (lasso) ====================== */
  const bboxCache = new WeakMap();
  function bboxOfItem(it) { let b = bboxCache.get(it); if (!b) { b = M.bbox(it) || { x: 0, y: 0, w: 0, h: 0 }; bboxCache.set(it, b); } return b; }
  function selItems(P) {
    if (!S.sel.length) return [];
    const s = new Set(S.sel);
    return P.items.filter((it) => s.has(it.id));
  }
  function selBBox() { const P = activeProps(); const it = P ? selItems(P) : []; return it.length ? M.bboxOf(it) : null; }
  function setSel(ids) { S.sel = ids.slice(); renderSel(); emit('selection'); }
  function renderSel(over) {
    const el = activeEl(); if (!el) return;
    const s = el.querySelector('.ink-sel'); if (!s) return;
    const P = propsOf(el), b = over || selBBox();
    if (!b) { s.style.display = 'none'; return; }
    const v = viewOf(P.id), vw = P.w / v.z, vh = P.h / v.z, pad = 1;
    s.style.display = 'block';
    s.style.left = ((b.x - v.x) / vw * 100) + '%';
    s.style.top = ((b.y - v.y) / vh * 100) + '%';
    s.style.width = (b.w / vw * 100) + '%';
    s.style.height = (b.h / vh * 100) + '%';
    void pad;
  }

  /* ====================== Active canvas ====================== */
  function setActive(id) {
    if (S.activeId === id) return;
    const old = activeEl();
    if (old) dropChrome(old);
    S.activeId = id; S.sel = [];
    if (id) {
      const el = elById(id);
      if (el) addChrome(el, propsOf(el)); else S.activeId = null;
    }
    emit('active'); emit('selection');
  }
  /** After undo/redo/rendering replaced the DOM: re-find the active canvas by id. */
  function rebind() {
    byId.clear();
    if (S.activeId) {
      const el = elById(S.activeId);
      if (!el) { S.activeId = null; S.sel = []; emit('active'); }
      else { addChrome(el, propsOf(el)); el.classList.add('is-ink-active'); }
    }
    const P = activeProps();
    if (P) S.sel = S.sel.filter((id) => P.items.some((it) => it.id === id));
    renderSel();
    emit('history'); emit('content'); emit('selection');
  }

  /* ====================== Mode, tool, options ====================== */
  const tcls = () => { TOOLS.forEach((x) => document.body.classList.toggle('ink-tool-' + x, S.tool === x)); };
  function applyTouchAction() { const r = root(); if (r) r.style.touchAction = S.mode ? 'none' : ''; }
  function sweepOverlays() {
    figs().forEach((el) => {
      const P = propsOf(el);
      if (!P || !P.overlay || P.items.length) return;
      if (el._inkTemp) el.remove(); else X.editor.run(() => el.remove(), { keepFocus: true });
      if (S.activeId === P.id) { S.activeId = null; S.sel = []; }
    });
  }
  function setMode(on) {
    on = !!on;
    if (on === S.mode) return true;
    if (on && !canInk()) return false;
    S.mode = on;
    document.body.classList.toggle('ink-mode', on);
    tcls();
    applyTouchAction();
    if (on) {
      C().clearWidget();
      const ae = document.activeElement, r = root();
      if (ae && r && r.contains(ae) && ae.blur) ae.blur();
      const sel = window.getSelection();
      if (r && sel && sel.rangeCount && r.contains(sel.anchorNode)) sel.removeAllRanges();   // the document keeps no text selection while inking
    } else {
      if (ink._input && ink._input.abort) ink._input.abort();
      S.sel = [];
      sweepOverlays();
      if (activeEl() && !(C().selectedWidget && C().selectedWidget === activeEl())) setActive(null);
      if (root() && X.editor.current()) C().restore();
      renderSel();
    }
    emit('mode'); emit('selection');
    return true;
  }
  const toggleMode = () => setMode(!S.mode);
  function setTool(name) {
    if (!TOOLS.includes(name)) return;
    S.tool = name; S.touched = true;
    if (name !== 'lasso' && S.sel.length) { S.sel = []; renderSel(); emit('selection'); }
    tcls(); persist(); emit('tool');
  }
  function cleanTool(tool, patch) {
    const cur = S.tools[tool]; if (!cur || !patch) return;
    const n = (v, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : null);
    if ('c' in patch && cur.c !== undefined && HEX.test(patch.c)) cur.c = patch.c.toLowerCase();
    if ('s' in patch) { const v = n(patch.s, tool === 'eraser' ? 1 : L.SIZE_MIN, tool === 'eraser' ? 200 : L.SIZE_MAX); if (v != null) cur.s = Math.round(v * 10) / 10; }
    if ('o' in patch && cur.o !== undefined) { const v = n(patch.o, L.OPACITY_MIN, L.OPACITY_MAX); if (v != null) cur.o = Math.round(v * 100) / 100; }
    if ('pressure' in patch && cur.pressure !== undefined) cur.pressure = !!patch.pressure;
    if (tool === 'eraser' && ['stroke', 'area'].includes(patch.mode)) cur.mode = patch.mode;
    if (tool === 'shape') {
      if (SHAPE_KINDS.includes(patch.kind)) cur.kind = patch.kind;
      if ('f' in patch && (patch.f === 'none' || HEX.test(patch.f))) cur.f = patch.f === 'none' ? 'none' : patch.f.toLowerCase();
    }
  }
  function setToolOptions(tool, patch) { cleanTool(tool, patch); S.touched = true; persist(); emit('tools'); }
  function setOption(name, b) {
    if (!(name in S.options)) return;
    S.options[name] = !!b; S.touched = true; persist(); emit('options');
  }
  let persistTimer = 0;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { const k = X.db && X.db.kv; if (k) Promise.resolve(k.set('ink.state', { tool: S.tool, tools: S.tools, options: S.options })).catch(() => {}); } catch (e) { /* convenience only */ }
    }, 250);
  }
  function loadState() {
    try {
      const k = X.db && X.db.kv; if (!k) return;
      Promise.resolve(k.get('ink.state')).then((st) => {
        if (!st || typeof st !== 'object' || S.touched) return;
        Object.keys(S.tools).forEach((tool) => { if (st.tools && st.tools[tool]) cleanTool(tool, st.tools[tool]); });
        if (st.options) Object.keys(S.options).forEach((o) => { if (typeof st.options[o] === 'boolean') S.options[o] = st.options[o]; });
        if (TOOLS.includes(st.tool)) S.tool = st.tool;
        tcls(); emit('tools'); emit('tool'); emit('options');
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /* ====================== Snapshot for the UI ====================== */
  const countsMemo = { P: null, m: null };
  function countsOf(P) {
    if (countsMemo.P !== P) { const m = {}; P.items.forEach((it) => { m[it.l] = (m[it.l] || 0) + 1; }); countsMemo.P = P; countsMemo.m = m; }
    return countsMemo.m;
  }
  function get() {
    const P = activeProps();
    let active = null;
    if (P) {
      const cn = countsOf(P), v = viewOf(P.id);
      active = { id: P.id, w: P.w, h: P.h, al: P.al, bg: P.bg, overlay: !!P.overlay, zoom: v.z, layer: layerId(P),
        layers: P.layers.map((l, i) => ({ id: l.id, name: layerName(l, i), hidden: !!l.hidden, locked: !!l.locked, count: cn[l.id] || 0 })), count: P.items.length };
    }
    const bb = selBBox();
    let cu = false, cr = false;
    try { cu = C().canUndo(); cr = C().canRedo(); } catch (e) { /* no editor yet */ }
    return { mode: S.mode, tool: S.tool, tools: clone(S.tools), options: Object.assign({}, S.options), active,
      selection: { count: S.sel.length, bbox: bb ? { x: bb.x, y: bb.y, w: bb.w, h: bb.h } : null }, canUndo: cu, canRedo: cr, penSeen: S.penSeen };
  }
  function undo() { const r = C().undo(); S.sel = []; return r; }
  function redo() { const r = C().redo(); S.sel = []; return r; }

  /* ====================== Canvas API ====================== */
  const needActive = (fn) => (...a) => { const el = activeEl(); return el ? fn(el, propsOf(el), ...a) : false; };
  const docTitle = () => { const c = X.editor.current(); return (c && c.meta && c.meta.title) || 'drawing'; };

  function insertCanvas(o) {
    if (!canInk()) return null;
    o = o || {};
    const P = M.empty({ w: o.w || 1000, h: o.h || 300, bg: BGS.includes(o.bg) ? o.bg : 'none', al: o.al });
    if (!P) return null;
    const el = T4.edw.create('ink', P);
    if (!el) return null;
    if (activeEl()) dropChrome(activeEl());
    S.activeId = P.id; S.sel = [];
    X.editor.insertBlock(el, { select: true });
    byId.set(P.id, el);
    setMode(true);
    emit('active'); emit('selection'); emit('content'); emit('history');
    return el;
  }
  function activate(id) { const el = elById(id); if (!el) return false; setActive(id); return true; }
  const canvas = {
    insert: insertCanvas, activate,
    setBackground: needActive((el, P, bg) => !!BGS.includes(bg) && !!commit(el, (d) => { d.bg = bg; })),
    setSize: needActive((el, P, s) => {
      s = s || {};
      const w = clamp(Math.round(s.w == null ? P.w : +s.w) || P.w, L.W_MIN, L.W_MAX), h = clamp(Math.round(s.h == null ? P.h : +s.h) || P.h, L.H_MIN, L.H_MAX);
      delete S.views[P.id];
      return !!commit(el, (d) => { d.w = P.overlay ? 1000 : w; d.h = h; });
    }),
    setAlign: needActive((el, P, al) => ['left', 'center', 'right'].includes(al) && !!commit(el, (d) => { d.al = al; })),
    scale: needActive((el, P, f) => {
      f = +f; if (!(f > 0) || f === 1) return false;
      const w = clamp(Math.round(P.w * f), L.W_MIN, L.W_MAX), eff = P.overlay ? 1 : w / P.w;
      const h = clamp(Math.round(P.h * eff), L.H_MIN, L.H_MAX);
      delete S.views[P.id]; S.sel = [];
      return !!commit(el, (d) => { d.w = P.overlay ? 1000 : w; d.h = h; d.items = P.items.map((it) => M.transform(it, { sx: eff, sy: eff, ox: 0, oy: 0 }) || it); });
    }),
    zoomTo(z, cx, cy) {
      const el = activeEl(); if (!el) return false;
      const P = propsOf(el), v = Object.assign({}, viewOf(P.id)), nz = clamp(+z || 1, 0.5, 8);
      const px = cx == null ? v.x + P.w / v.z / 2 : cx, py = cy == null ? v.y + P.h / v.z / 2 : cy;
      const fx = (px - v.x) / (P.w / v.z), fy = (py - v.y) / (P.h / v.z);
      v.z = nz; v.x = px - fx * (P.w / nz); v.y = py - fy * (P.h / nz);
      setView(el, v); return true;
    },
    zoomBy(f, cx, cy) { const P = activeProps(); return P ? canvas.zoomTo(viewOf(P.id).z * (+f || 1), cx, cy) : false; },
    resetView() { const el = activeEl(); if (!el) return false; delete S.views[propsOf(el).id]; applyView(el, propsOf(el)); renderSel(); emit('view'); return true; },
    clear: needActive((el, P) => { S.sel = []; return !!commit(el, (d) => { d.items = []; }); }),
    remove() { const el = activeEl(); if (!el) return false; const id = S.activeId; C().removeWidget(el); S.activeId = null; S.sel = []; byId.delete(id); emit('active'); emit('selection'); return true; },
    exportSVG(o) {
      const P = activeProps(); if (!P) return false;
      const ids = o && o.selectionOnly && S.sel.length ? S.sel.slice() : null;
      const svg = M.toSVG(P, { background: true, crop: !!ids, items: ids });
      X.download(svg, docTitle() + '.svg', 'image/svg+xml');
      return true;
    },
    async exportPNG(o) {
      const P = activeProps(); if (!P) return false;
      const ids = o && o.selectionOnly && S.sel.length ? S.sel.slice() : null;
      const blob = await M.toPNG(P, { scale: (o && o.scale) || 2, background: '#ffffff', crop: !!ids, items: ids });
      X.download(blob, docTitle() + '.png', 'image/png');
      return true;
    },
    layers: {
      add: needActive((el, P, name) => {
        if (P.layers.length >= L.LAYERS) return false;
        const id = M.uid();
        const v = commit(el, (d) => { d.layers = d.layers.concat([{ id, name: String(name || '').slice(0, L.NAME), hidden: false, locked: false }]); });
        if (v) { S.layerOf[P.id] = id; emit('active'); }
        return !!v;
      }),
      remove: needActive((el, P, id) => {
        if (P.layers.length <= 1 || !P.layers.some((l) => l.id === id)) return false;
        S.sel = [];
        const v = commit(el, (d) => { d.layers = d.layers.filter((l) => l.id !== id); d.items = d.items.filter((it) => it.l !== id); });
        if (v) emit('active');
        return !!v;
      }),
      rename: needActive((el, P, id, name) => P.layers.some((l) => l.id === id) && !!commit(el, (d) => { d.layers = d.layers.map((l) => (l.id === id ? Object.assign({}, l, { name: String(name || '').slice(0, L.NAME) }) : l)); })),
      setHidden: needActive((el, P, id, b) => P.layers.some((l) => l.id === id) && !!commit(el, (d) => { d.layers = d.layers.map((l) => (l.id === id ? Object.assign({}, l, { hidden: !!b }) : l)); }, () => {
        const g = layerG(el, id); if (g) g.style.display = b ? 'none' : '';
        S.sel = S.sel.filter((sid) => { const it = P.items.find((x) => x.id === sid); return !(it && it.l === id && b); }); renderSel();
      })),
      setLocked: needActive((el, P, id, b) => P.layers.some((l) => l.id === id) && !!commit(el, (d) => { d.layers = d.layers.map((l) => (l.id === id ? Object.assign({}, l, { locked: !!b }) : l)); }, () => {
        const g = layerG(el, id); if (g) { if (b) g.setAttribute('data-locked', ''); else g.removeAttribute('data-locked'); }
        S.sel = S.sel.filter((sid) => { const it = P.items.find((x) => x.id === sid); return !(it && it.l === id && b); }); renderSel();
      })),
      move: needActive((el, P, id, dir) => {
        const i = P.layers.findIndex((l) => l.id === id), j = i + (dir > 0 ? 1 : -1);
        if (i < 0 || j < 0 || j >= P.layers.length) return false;
        return !!commit(el, (d) => { const a = d.layers.slice(); const x = a[i]; a[i] = a[j]; a[j] = x; d.layers = a; });
      }),
      setActive(id) { const P = activeProps(); if (!P || !P.layers.some((l) => l.id === id)) return false; S.layerOf[P.id] = id; emit('active'); return true; },
    },
  };

  /* ====================== Selection API ====================== */
  const lassoOn = () => { if (S.tool !== 'lasso') { S.tool = 'lasso'; tcls(); persist(); emit('tool'); } };
  const withSel = (fn) => (...a) => { const el = activeEl(); if (!el) return false; const P = propsOf(el), items = selItems(P); return items.length ? fn(el, P, items, ...a) : false; };
  /** Swap items (same positions) and update the SVG nodes; `next` maps old item → new item. */
  function replaceItems(el, P, next, keepSel) {
    const map = new Map(next.map((n) => [n.old.id, n.item]));
    const v = commit(el, (d) => { d.items = d.items.map((it) => map.get(it.id) || it); }, (nv) => {
      next.forEach((n) => replaceNode(el, n.old.id, [n.item]));
      renderSel();
    });
    if (v && keepSel !== false) { S.sel = next.map((n) => n.item.id); renderSel(); emit('selection'); }
    return v;
  }
  const selection = {
    clear() { if (S.sel.length) setSel([]); return true; },
    all() {
      const el = activeEl(); if (!el) return false;
      const P = propsOf(el), ok = editableLayers(P);
      lassoOn();
      setSel(P.items.filter((it) => ok.has(it.l)).map((it) => it.id)); return true;
    },
    delete: withSel((el, P, items) => {
      const ids = new Set(items.map((i) => i.id));
      S.sel = [];
      const v = commit(el, (d) => { d.items = d.items.filter((it) => !ids.has(it.id)); }, () => { ids.forEach((id) => removeNode(el, id)); renderSel(); });
      emit('selection'); return !!v;
    }),
    copy: withSel((el, P, items) => { S.clip = { items: clone(items) }; S.pasteN = 0; return true; }),
    cut: withSel((el, P, items) => { S.clip = { items: clone(items) }; S.pasteN = 0; return selection.delete(); }),
    paste() {
      if (!S.clip || !S.clip.items.length) { toast(t('pasteEmpty', 'Nothing to paste.'), 'info'); return false; }
      const el = activeEl(); if (!el) return false;
      const P = propsOf(el), lid = drawLayer(P); if (!lid) return false;
      S.pasteN++;
      const b = M.bboxOf(S.clip.items) || { x: 0, y: 0, w: 0, h: 0 };
      let off = 14 * S.pasteN;
      if (b.x + b.w + off > P.w || b.y + b.h + off > P.h) off = 0;
      const items = S.clip.items.map((it) => { const n = M.transform(clone(it), { dx: off, dy: off }); if (n) { n.id = M.uid(); n.l = lid; } return n; }).filter(Boolean);
      const v = addItems(el, items, false);
      if (v) { lassoOn(); setSel(items.map((i) => i.id)); }
      return !!v;
    },
    duplicate: withSel((el, P, items) => { S.clip = { items: clone(items) }; S.pasteN = 0; return selection.paste(); }),
    setStyle: withSel((el, P, items, patch) => {
      patch = patch || {};
      const next = items.map((it) => {
        const n = Object.assign({}, it);
        if (HEX.test(patch.c)) n.c = patch.c.toLowerCase();
        if (Number.isFinite(+patch.o) && patch.o !== '' && patch.o != null) n.o = clamp(+patch.o, L.OPACITY_MIN, L.OPACITY_MAX);
        if (Number.isFinite(+patch.s) && patch.s != null && patch.s !== '') n.s = clamp(+patch.s, L.SIZE_MIN, L.SIZE_MAX);
        if (it.k !== 'pen' && it.k !== 'hl' && (patch.f === 'none' || HEX.test(patch.f)) && it.k !== 'line' && it.k !== 'arrow') n.f = patch.f === 'none' ? 'none' : patch.f.toLowerCase();
        return { old: it, item: M.validateItem ? (M.validateItem(n) || it) : n };
      });
      return !!replaceItems(el, P, next);
    }),
    toFront: withSel((el, P, items) => { const ids = new Set(items.map((i) => i.id)); return !!commit(el, (d) => { d.items = d.items.filter((i) => !ids.has(i.id)).concat(d.items.filter((i) => ids.has(i.id))); }); }),
    toBack: withSel((el, P, items) => { const ids = new Set(items.map((i) => i.id)); return !!commit(el, (d) => { d.items = d.items.filter((i) => ids.has(i.id)).concat(d.items.filter((i) => !ids.has(i.id))); }); }),
    toLayer: withSel((el, P, items, lid) => {
      if (!P.layers.some((l) => l.id === lid)) return false;
      const ids = new Set(items.map((i) => i.id));
      return !!commit(el, (d) => { d.items = d.items.map((i) => (ids.has(i.id) ? Object.assign({}, i, { l: lid }) : i)); });
    }),
  };

  /* ====================== Widget ====================== */
  function isoDataUrl(blob) {
    return blob.arrayBuffer().then((buf) => {
      const u = new Uint8Array(buf); let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return 'data:' + (blob.type || 'image/png') + ';base64,' + btoa(s);
    });
  }
  const bgItems = () => BGS.map((b) => ({ b, label: t('bg' + b.charAt(0).toUpperCase() + b.slice(1), { none: 'No background', dots: 'Dots', lines: 'Lines', grid: 'Grid' }[b]) }));

  X.icons.add('ink-pen', '<path d="M4 20c2-1 3-3 4-5l9-10 3 3-10 9c-2 1-4 2-6 3z"/><path d="M14 6l3 3"/>');
  X.widgets.register('ink', {
    validate: (p) => M.validate(p),
    render,
    textOf: () => '',
    async toMarkdown(p, ctx) {
      if (ctx && ctx.images === false) return '';
      try {
        const blob = await M.toPNG(p, { scale: 1.5, background: '#ffffff', crop: true });
        return '![' + t('drawingAlt', 'Handwritten drawing') + '](' + (await isoDataUrl(blob)) + ')';
      } catch (e) { return ''; }
    },
    defaults: {},
    insert(opts) { return insertCanvas((opts && opts.props) || {}); },
    edit(el) { const P = propsOf(el); if (P) { setActive(P.id); setMode(true); } },
    ctxBar: {
      labelKey: 'edx.ink.name', label: 'Handwriting',
      items: () => [
        { action: 'draw', icon: 'edit', text: true, label: t('draw', 'Draw') },
        { action: 'bg', icon: 'table', label: t('background', 'Background') },
        { sep: true },
        { action: 'svg', icon: 'download', text: true, label: t('exportSvg', 'Export SVG') },
        { action: 'png', icon: 'image', text: true, label: t('exportPng', 'Export PNG') },
        { sep: true },
        { builtin: 'delete', icon: 'trash', label: t('delete', 'Delete drawing') },
      ],
      onAction(action, info) {
        const P = propsOf(info.el); if (!P) return;
        if (S.activeId !== P.id) setActive(P.id);
        if (action === 'draw') setMode(true);
        else if (action === 'bg') X.editor.openMenu(info.btn, bgItems().map((x) => ({ label: x.label, checked: P.bg === x.b, run: () => { setActive(P.id); canvas.setBackground(x.b); } })));
        else if (action === 'svg') canvas.exportSVG({});
        else if (action === 'png') canvas.exportPNG({});
      },
    },
  });
  X.slash.add({ id: 'ink.canvas', label: 'Handwriting canvas', labelKey: 'edx.ink.insert', keywords: ['draw', 'drawing', 'handwriting', 'pen', 'ink', 'sketch', 'zeichnen', 'handschrift'], icon: 'ink-pen', group: 'Media', order: 60, run: () => { insertCanvas({}); } });
  X.menus.add('insert', () => ({ label: 'Handwriting canvas', labelKey: 'edx.ink.insert', icon: 'ink-pen', order: 60, disabled: !canInk(), run: () => { insertCanvas({}); } }));

  const cmd = (id, label, key, run, extra) => X.commands.register(id, Object.assign({ label, labelKey: 'edx.ink.' + key, icon: 'ink-pen', group: 'Handwriting', when: () => canInk(), run }, extra));
  cmd('ink.mode', 'Pen mode', 'mode', () => { toggleMode(); });
  cmd('ink.insert', 'Handwriting canvas', 'insert', () => { insertCanvas({}); });
  [['pen', 'Pen', 'tool.pen'], ['hl', 'Highlighter', 'tool.hl'], ['eraser', 'Eraser', 'tool.eraser'], ['lasso', 'Lasso', 'tool.lasso'], ['shape', 'Shapes', 'tool.shape'], ['pan', 'Pan', 'tool.pan']]
    .forEach(([id, label, key]) => cmd('ink.tool.' + id, label, key, () => { if (setMode(true) !== false) setTool(id); }));
  X.shortcuts.add('mod-alt-shift-p', 'ink.mode');

  // The stylesheet hides .cw-input in print (code textareas); the canvas is a .cw-input too.
  X.print.addCSS(() => 'body.print-doc .t4-w[data-w="ink"] .ink-box.cw-input { display: block !important; } body.print-doc .t4-w[data-w="ink"] .ink-wet, body.print-doc .t4-w[data-w="ink"] .ink-sel, body.print-doc .t4-w[data-w="ink"] .ink-rs { display: none !important; }');

  /* ====================== Editor events ====================== */
  X.events.on('content-change', (d) => { if (d && d.history) rebind(); });
  X.events.on('selection-change', () => {
    if (S.mode) return;
    const w = C().selectedWidget;
    if (w && w.isConnected && w.getAttribute('data-w') === 'ink') { const P = propsOf(w); if (P && S.activeId !== P.id) setActive(P.id); }
    else if (S.activeId && !(ink._input && ink._input.busy && ink._input.busy())) setActive(null);
  });
  const reset = () => {
    if (S.mode) { S.mode = false; document.body.classList.remove('ink-mode'); if (ink._input && ink._input.abort) ink._input.abort(); emit('mode'); }
    byId.clear(); S.activeId = null; S.sel = []; S.views = {}; S.layerOf = {};
    emit('active'); emit('selection');
  };
  X.events.on('doc-close', reset);
  X.events.on('doc-open', () => { reset(); applyTouchAction(); tcls(); });
  X.events.on('shell-built', () => applyTouchAction());

  /* ====================== Public API ====================== */
  Object.assign(ink, {
    get, on, setMode, toggleMode, setTool, setToolOptions, setOption, undo, redo, canvas, selection,
    test: { widgetEl: (id) => elById(id), props: (id) => { const e = elById(id || S.activeId); return e ? clone(propsOf(e)) : null; } },
  });
  // internals shared with js/ed-ink-input.js (not a stable API)
  ink._e = { S, M, X, C, L, emit, propsOf, elById, activeEl, activeProps, svgOf, boxOf, viewOf, clampView, setView, applyView, layoutBox, rebuild, commit, addItems,
    addNodes, removeNode, replaceNode, nodeIndex, layerId, editableLayers, drawLayer, selItems, selBBox, setSel, renderSel, setActive, setMode, setTool, canInk, toast, figs,
    root, bboxOfItem, replaceItems, selection, clone, clamp, r1, lassoOn, rebuildPending: false, addChrome, sweepOverlays, canvas, t, NS };
  tcls();
  loadState();
})();
