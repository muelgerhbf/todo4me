/* Todo4Me — ink module, engine input: Pointer Events, wet ink, tools (pen, highlighter, eraser, lasso, shapes, pan), overlay annotations,
 * canvas resize, zoom / pan, palm rejection, keyboard. Uses the internals of js/ed-ink.js (T4.ink._e). Every finished gesture is ONE commit. */
(function () {
  'use strict';
  const ink = window.T4 && window.T4.ink;
  const E = ink && ink._e;
  if (!E) return;
  const { S, M, X, L, emit, propsOf, svgOf, boxOf, viewOf, clamp } = E;
  const SEL = 'figure.t4-w[data-w="ink"]';
  const hasRawUpdate = 'onpointerrawupdate' in window;

  let G = null;                 // running gesture
  const touches = new Map();    // touch pointers over the document: id -> { cx, cy }
  let space = false;
  let raf = 0;

  /* ====================== Geometry ====================== */
  const rectOf = (el) => svgOf(el).getBoundingClientRect();
  function toUnits(el, cx, cy, rect) {
    const P = propsOf(el), v = viewOf(P.id), r = rect || rectOf(el);
    return { x: v.x + (cx - r.left) / r.width * (P.w / v.z), y: v.y + (cy - r.top) / r.height * (P.h / v.z) };
  }
  function toClient(el, x, y, rect) {
    const P = propsOf(el), v = viewOf(P.id), r = rect || rectOf(el);
    return { x: r.left + (x - v.x) / (P.w / v.z) * r.width, y: r.top + (y - v.y) / (P.h / v.z) * r.height };
  }
  const inBox = (el, cx, cy) => { const b = boxOf(el); if (!b) return false; const r = b.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; };
  const isTyping = (t) => !!(t && t.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable));
  const touchDraws = () => S.options.fingerDraw || !S.penSeen;

  /* ====================== Wet ink canvas ====================== */
  /** Prepared 2D context of the wet canvas of a canvas widget, cleared and mapped to logical units; null when there is none. */
  function wet(el, keep) {
    const cv = el.querySelector('.ink-wet'); if (!cv) return null;
    const rc = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rc.width * dpr)), h = Math.max(1, Math.round(rc.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv._ctx || (cv._ctx = cv.getContext('2d', { desynchronized: true }));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!keep) ctx.clearRect(0, 0, w, h);
    const P = propsOf(el), v = viewOf(P.id), sx = w / (P.w / v.z), sy = h / (P.h / v.z);
    ctx.setTransform(sx, 0, 0, sy, -v.x * sx, -v.y * sy);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return ctx;
  }
  function wetClear(el) {
    const cv = el && el.querySelector && el.querySelector('.ink-wet'); if (!cv || !cv._ctx) return;
    cv._ctx.setTransform(1, 0, 0, 1, 0, 0); cv._ctx.clearRect(0, 0, cv.width, cv.height); cv.style.mixBlendMode = '';
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (G && G.paint) { try { G.paint(); } catch (e) { console.error(e); } } }); }

  /* ====================== Overlay (annotation layer over ordinary content) ====================== */
  function discardTemp(el) {
    if (el && el._inkTemp && el.isConnected && !propsOf(el).items.length) {
      if (S.activeId === propsOf(el).id) { S.activeId = null; S.sel = []; emit('active'); }
      el.remove();
    }
  }
  function createOverlay(cx, cy) {
    const r = E.root(); if (!r) return null;
    const blocks = Array.from(r.children).filter((n) => !(n.matches && n.matches(SEL) && n.hasAttribute('data-overlay')));
    if (!blocks.length) return null;
    let B = blocks.find((n) => { const rc = n.getBoundingClientRect(); return cy >= rc.top && cy <= rc.bottom; });
    if (!B) {
      let best = Infinity;
      blocks.forEach((n) => { const rc = n.getBoundingClientRect(), d = Math.abs((rc.top + rc.bottom) / 2 - cy); if (d < best) { best = d; B = n; } });
    }
    if (!B) return null;
    const P0 = M.empty({ w: 1000, h: 300, overlay: true });
    const el = T4.edw.create('ink', P0);
    if (!el) return null;
    B.before(el);
    T4.edw.hydrate(el);
    el._inkTemp = true;
    E.setActive(P0.id);
    // cover everything from the anchor block to the end of the document
    const fr = el.getBoundingClientRect(), last = blocks[blocks.length - 1].getBoundingClientRect();
    const h = clamp(Math.ceil((last.bottom - fr.top) / Math.max(1, fr.width / 1000)) + 40, 300, L.H_MAX);
    if (h !== P0.h) {
      const P1 = M.validate(Object.assign({}, P0, { h }));
      if (P1) { el.setAttribute('data-p', JSON.stringify(P1)); E.rebuild(el, propsOf(el)); }
    }
    return el;
  }
  /** Canvas the point belongs to: the active one, another canvas, an overlay covering the point, or (drawing tools) a new overlay. */
  function surfaceAt(cx, cy, tool) {
    const ael = E.activeEl(), list = E.figs();
    if (ael && inBox(ael, cx, cy)) return ael;
    const plain = list.find((el) => !propsOf(el).overlay && inBox(el, cx, cy));
    if (plain) return plain;
    const ov = list.find((el) => propsOf(el).overlay && inBox(el, cx, cy));
    if (ov) return ov;
    return tool === 'pen' || tool === 'hl' || tool === 'shape' ? createOverlay(cx, cy) : null;
  }

  /* ====================== Samples ====================== */
  function sample(g, ev, rect) {
    const u = toUnits(g.el, ev.clientX, ev.clientY, rect);
    let p = 0.5;
    if (g.pt === 'pen') p = clamp(ev.pressure > 0 ? ev.pressure : 0.5, 0.05, 1);
    else if (g.usePr) {
      const last = g.last, t = ev.timeStamp || performance.now();
      if (last) { const sp = Math.hypot(ev.clientX - last.cx, ev.clientY - last.cy) / Math.max(1, t - last.t); g.sp = g.sp * 0.8 + clamp(1 - sp * 0.35, 0.3, 1) * 0.2; }
      p = g.sp;
    }
    const s = { x: u.x, y: u.y, p, cx: ev.clientX, cy: ev.clientY, t: ev.timeStamp || performance.now(), shift: !!ev.shiftKey };
    return s;
  }
  function push(g, s, force) {
    const l = g.pts[g.pts.length - 1];
    if (l && l.x === s.x && l.y === s.y) return;
    if (l && !force && Math.hypot(l.x - s.x, l.y - s.y) < 0.15) return;
    g.pts.push(s); g.last = s;
  }

  /* ====================== Gestures ====================== */
  /* ---- pen / highlighter ---- */
  function startDraw(el, tool, info) {
    const P = propsOf(el), lid = E.drawLayer(P);
    if (!lid) return null;
    const cfg = S.tools[tool];
    const g = { type: 'draw', el, tool, lid, cfg, pt: info.pt, pid: info.pid, pts: [], pred: [], last: null, sp: 0.5,
      usePr: tool === 'pen' && cfg.pressure !== false && (info.pt === 'pen' || S.options.speedWidth) };
    g.paint = () => {
      const ctx = wet(el); if (!ctx) return;
      const pts = g.pts.concat(g.pred);
      if (!pts.length) return;
      el.querySelector('.ink-wet').style.mixBlendMode = tool === 'hl' ? 'multiply' : '';
      ctx.globalAlpha = cfg.o;
      if (tool === 'hl' || pts.length < 2) {
        ctx.strokeStyle = ctx.fillStyle = cfg.c; ctx.lineWidth = tool === 'hl' ? cfg.s : cfg.s * (g.usePr ? pts[0].p * 1.6 : 1); ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke(); return;
      }
      const poly = M.outline(pts.map((q) => ({ x: q.x, y: q.y, p: q.p })), { size: cfg.s, pressure: g.usePr });
      if (!poly || !poly.length) return;
      ctx.fillStyle = cfg.c; ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.closePath(); ctx.fill();
    };
    g.move = (evs, e) => {
      const rect = rectOf(el);
      evs.forEach((ev) => push(g, sample(g, ev, rect)));
      g.pred = [];
      if (e && e.getPredictedEvents) { try { g.pred = e.getPredictedEvents().slice(0, 4).map((ev) => sample({ el, pt: g.pt, usePr: false, sp: 0.5, last: null }, ev, rect)); } catch (er) { g.pred = []; } }
      schedule();
    };
    g.up = () => {
      g.pred = [];
      if (!g.pts.length) { wetClear(el); discardTemp(el); return; }
      const pts = g.pts.map((q) => ({ x: q.x, y: q.y, p: q.p }));
      if (pts.length === 1) pts.push({ x: pts[0].x + 0.01, y: pts[0].y, p: pts[0].p });
      const style = { k: tool, c: cfg.c, o: cfg.o, s: cfg.s, pressure: g.usePr, l: lid };
      const item = M.makeStroke(pts, style);
      if (!item) { wetClear(el); discardTemp(el); return; }
      const v = E.addItems(el, [item], true);
      wetClear(el);
      if (!v) { discardTemp(el); return; }
      if (S.options.recognize && tool === 'pen' && pts.length >= 6) recognize(el, item, pts, cfg, lid);
    };
    g.cancel = () => { wetClear(el); discardTemp(el); };
    return g;
  }
  /** Replace a finished pen stroke by the clean shape; a second commit, so undo brings the raw stroke back. */
  function recognize(el, item, pts, cfg, lid) {
    let rec = null;
    try { rec = M.recognize(pts); } catch (e) { rec = null; }
    if (!rec) return;
    const style = { c: cfg.c, o: cfg.o, s: cfg.s, f: 'none', l: lid };
    let shape;
    if (rec.kind === 'poly') shape = { id: M.uid(), l: lid, k: 'poly', c: cfg.c, o: cfg.o, s: cfg.s, f: 'none', pts: rec.pts };
    else shape = M.makeShape(rec.kind, rec.x1, rec.y1, rec.x2, rec.y2, style, {});
    if (!shape) return;
    shape.l = lid;
    E.commit(el, (d) => { d.items = d.items.filter((i) => i.id !== item.id).concat([shape]); }, () => { E.removeNode(el, item.id); E.addNodes(el, [shape]); E.renderSel(); });
  }

  /* ---- shapes ---- */
  function startShape(el, info, s0) {
    const P = propsOf(el), lid = E.drawLayer(P);
    if (!lid) return null;
    const cfg = S.tools.shape;
    const g = { type: 'shape', el, pid: info.pid, pt: info.pt, a: s0, b: s0, shift: false };
    const make = () => M.makeShape(cfg.kind, g.a.x, g.a.y, g.b.x, g.b.y, { c: cfg.c, o: cfg.o, s: cfg.s, f: cfg.f, l: lid }, { constrain: g.shift });
    g.paint = () => { const ctx = wet(el); if (!ctx) return; const it = make(); if (it) M.drawItem(ctx, it); };
    g.move = (evs) => { const rect = rectOf(el); const ev = evs[evs.length - 1]; g.b = sample(g, ev, rect); g.shift = !!ev.shiftKey; schedule(); };
    g.up = () => {
      const moved = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
      if (moved < 2) { wetClear(el); discardTemp(el); return; }
      const it = make();
      if (it) { it.l = lid; const v = E.addItems(el, [it], true); wetClear(el); if (!v) discardTemp(el); } else { wetClear(el); discardTemp(el); }
    };
    g.cancel = () => { wetClear(el); discardTemp(el); };
    return g;
  }

  /* ---- eraser ---- */
  function startErase(el, info) {
    const P = propsOf(el), cfg = S.tools.eraser;
    const g = { type: 'erase', el, pid: info.pid, pt: info.pt, mode: cfg.mode, r: cfg.s / 2, items: P.items.slice(), ok: E.editableLayers(P), changed: false, last: null, cur: null };
    const at = (x, y) => {
      for (let i = g.items.length - 1; i >= 0; i--) {
        const it = g.items[i];
        if (!g.ok.has(it.l)) continue;
        const b = E.bboxOfItem(it), r = g.r;
        if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
        if (g.mode === 'stroke') { if (M.hit(it, x, y, r)) { g.items.splice(i, 1); E.removeNode(el, it.id); g.changed = true; } }
        else { const res = M.eraseArea(it, x, y, r); if (res) { g.items.splice(i, 1, ...res); E.replaceNode(el, it.id, res); g.changed = true; } }
      }
    };
    g.feed = (s) => {
      if (g.last) {
        const d = Math.hypot(s.x - g.last.x, s.y - g.last.y), n = Math.ceil(d / Math.max(0.5, g.r * 0.5));
        for (let k = 1; k < n; k++) at(g.last.x + (s.x - g.last.x) * k / n, g.last.y + (s.y - g.last.y) * k / n);
      }
      at(s.x, s.y); g.last = s; g.cur = s;
    };
    g.paint = () => {
      const ctx = wet(el); if (!ctx || !g.cur) return;
      ctx.strokeStyle = '#7a7f8c'; ctx.lineWidth = 0.6 * (propsOf(el).w / Math.max(1, rectOf(el).width)); ctx.beginPath(); ctx.arc(g.cur.x, g.cur.y, g.r, 0, Math.PI * 2); ctx.stroke();
    };
    g.move = (evs) => { const rect = rectOf(el); evs.forEach((ev) => g.feed(sample(g, ev, rect))); schedule(); };
    g.up = () => {
      wetClear(el);
      if (!g.changed) return;
      const keep = g.items;
      if (!E.commit(el, (d) => { d.items = keep; }, () => { E.renderSel(); })) E.rebuild(el, propsOf(el));
    };
    g.cancel = () => { wetClear(el); if (g.changed) E.rebuild(el, propsOf(el)); };
    return g;
  }

  /* ---- lasso select ---- */
  function startLasso(el, info, s0) {
    const g = { type: 'lasso', el, pid: info.pid, pt: info.pt, poly: [[s0.x, s0.y]], last: s0 };
    g.paint = () => {
      const ctx = wet(el); if (!ctx) return;
      const k = propsOf(el).w / Math.max(1, rectOf(el).width);
      ctx.strokeStyle = '#4f6bed'; ctx.fillStyle = 'rgba(79,107,237,0.08)'; ctx.lineWidth = 1.5 * k; ctx.setLineDash([6 * k, 4 * k]);
      ctx.beginPath(); g.poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.fill(); ctx.stroke();
    };
    g.move = (evs) => { const rect = rectOf(el); evs.forEach((ev) => { const s = toUnits(el, ev.clientX, ev.clientY, rect); const l = g.poly[g.poly.length - 1]; if (Math.hypot(l[0] - s.x, l[1] - s.y) > 0.8) g.poly.push([s.x, s.y]); }); schedule(); };
    g.up = () => {
      wetClear(el);
      const P = propsOf(el), poly = g.poly;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      poly.forEach((q) => { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); });
      if (poly.length < 3 || maxx - minx < 4 || maxy - miny < 4) { E.setSel([]); return; }
      const ok = E.editableLayers(P);
      E.setSel(P.items.filter((it) => ok.has(it.l) && M.inLasso(it, poly)).map((it) => it.id));
    };
    g.cancel = () => wetClear(el);
    return g;
  }

  /* ---- move / scale the lasso selection ---- */
  const CORNERS = { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] };
  function corner(b, h) { const c = CORNERS[h]; return [b.x + c[0] * b.w, b.y + c[1] * b.h]; }
  function selectionHit(el, cx, cy) {
    const b = E.selBBox(); if (!b) return null;
    const coarse = matchMedia('(pointer: coarse)').matches, tol = coarse ? 22 : 12;
    const rect = rectOf(el);
    for (const h of Object.keys(CORNERS)) {
      const [ux, uy] = corner(b, h), c = toClient(el, ux, uy, rect);
      if (Math.hypot(c.x - cx, c.y - cy) <= tol) return { handle: h, box: b };
    }
    const a = toClient(el, b.x, b.y, rect), z = toClient(el, b.x + b.w, b.y + b.h, rect);
    if (cx >= a.x - 4 && cx <= z.x + 4 && cy >= a.y - 4 && cy <= z.y + 4) return { handle: null, box: b };
    return null;
  }
  function startTransform(el, info, s0, hit) {
    const P = propsOf(el), items = E.selItems(P), b = hit.box, scale = !!hit.handle;
    const nodes = items.map((it) => E.nodeIndex(el).get(it.id)).filter(Boolean);
    let ax = 0, ay = 0, hx = 0, hy = 0;
    if (scale) { const opp = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }[hit.handle]; [ax, ay] = corner(b, opp); [hx, hy] = corner(b, hit.handle); }
    const g = { type: scale ? 'scale' : 'move', el, pid: info.pid, pt: info.pt, dx: 0, dy: 0, sx: 1, sy: 1 };
    g.move = (evs) => {
      const s = toUnits(el, evs[evs.length - 1].clientX, evs[evs.length - 1].clientY, rectOf(el)), shift = !!evs[evs.length - 1].shiftKey;
      if (!scale) {
        let dx = s.x - s0.x, dy = s.y - s0.y;
        if (b.w <= P.w) dx = clamp(dx, -b.x, P.w - b.x - b.w);
        if (b.h <= P.h) dy = clamp(dy, -b.y, P.h - b.y - b.h);
        g.dx = dx; g.dy = dy;
        nodes.forEach((n) => n.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ')'));
        E.renderSel({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
      } else {
        const vx = hx - ax, vy = hy - ay;
        let sx, sy;
        if (shift) { sx = vx ? (s.x - ax) / vx : 1; sy = vy ? (s.y - ay) / vy : 1; }
        else { const f = ((s.x - ax) * vx + (s.y - ay) * vy) / (vx * vx + vy * vy || 1); sx = sy = f; }
        g.sx = clamp(sx, 0.05, 30); g.sy = clamp(sy, 0.05, 30);
        nodes.forEach((n) => n.setAttribute('transform', 'translate(' + ax + ' ' + ay + ') scale(' + g.sx.toFixed(4) + ' ' + g.sy.toFixed(4) + ') translate(' + -ax + ' ' + -ay + ')'));
        const x1 = ax + (b.x - ax) * g.sx, x2 = ax + (b.x + b.w - ax) * g.sx, y1 = ay + (b.y - ay) * g.sy, y2 = ay + (b.y + b.h - ay) * g.sy;
        E.renderSel({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
      }
    };
    g.up = () => {
      const unchanged = scale ? (Math.abs(g.sx - 1) < 0.005 && Math.abs(g.sy - 1) < 0.005) : (Math.abs(g.dx) + Math.abs(g.dy) < 0.2);
      nodes.forEach((n) => n.removeAttribute('transform'));
      if (unchanged) { E.renderSel(); return; }
      const t = scale ? { sx: g.sx, sy: g.sy, ox: ax, oy: ay, dx: 0, dy: 0 } : { dx: g.dx, dy: g.dy, sx: 1, sy: 1, ox: 0, oy: 0 };
      const next = items.map((it) => ({ old: it, item: M.transform(it, t) })).filter((n) => n.item);
      if (!E.replaceItems(el, P, next)) E.rebuild(el, propsOf(el));
    };
    g.cancel = () => { nodes.forEach((n) => n.removeAttribute('transform')); E.renderSel(); };
    return g;
  }

  /* ---- pan / zoom ---- */
  function startPan(el, info, s0) {
    const P = propsOf(el), v0 = Object.assign({}, viewOf(P.id)), rect = rectOf(el);
    const g = { type: 'pan', el, pid: info.pid, pt: info.pt };
    g.move = (evs) => {
      const e = evs[evs.length - 1], k = (P.w / v0.z) / rect.width;
      E.setView(el, { z: v0.z, x: v0.x - (e.clientX - s0.cx) * k, y: v0.y - (e.clientY - s0.cy) * k });
    };
    g.up = () => {}; g.cancel = () => {};
    return g;
  }
  function zoomAt(el, z, cx, cy) {
    const P = propsOf(el), v = Object.assign({}, viewOf(P.id)), rect = rectOf(el), u = toUnits(el, cx, cy, rect);
    const fx = (cx - rect.left) / rect.width, fy = (cy - rect.top) / rect.height, nz = clamp(z, 0.5, 8);
    v.z = nz; v.x = u.x - fx * (P.w / nz); v.y = u.y - fy * (P.h / nz);
    E.setView(el, v);
  }
  function scroller() {
    let n = E.root();
    while (n && n !== document.body) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; }
    return document.scrollingElement;
  }
  /* ---- manual touch scrolling (touch-action is none while inking) ---- */
  function startScroll(info, s0) {
    const sc = scroller(); let last = s0.cy;
    const g = { type: 'scroll', pid: info.pid, pt: 'touch' };
    g.move = (evs) => { const y = evs[evs.length - 1].clientY; if (sc) sc.scrollTop -= y - last; last = y; };
    g.up = () => {}; g.cancel = () => {};
    return g;
  }
  /* ---- two fingers: zoom the canvas under them and pan ---- */
  function startPinch() {
    const ids = Array.from(touches.keys()).slice(0, 2), a = touches.get(ids[0]), b = touches.get(ids[1]);
    const c0 = { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 }, d0 = Math.max(10, Math.hypot(a.cx - b.cx, a.cy - b.cy));
    const el = E.figs().find((f) => !propsOf(f).overlay && inBox(f, c0.x, c0.y)) || E.activeEl();
    const sc = scroller();
    const g = { type: 'pinch', ids, pid: -2, last: c0 };
    let v0 = null, u0 = null;
    if (el) { const P = propsOf(el); v0 = Object.assign({}, viewOf(P.id)); u0 = toUnits(el, c0.x, c0.y); }
    g.update = () => {
      const p = touches.get(ids[0]), q = touches.get(ids[1]); if (!p || !q) return;
      const c = { x: (p.cx + q.cx) / 2, y: (p.cy + q.cy) / 2 }, d = Math.hypot(p.cx - q.cx, p.cy - q.cy);
      if (el && el.isConnected) {
        const P = propsOf(el), rect = rectOf(el), z = clamp(v0.z * d / d0, 0.5, 8);
        const fx = (c.x - rect.left) / rect.width, fy = (c.y - rect.top) / rect.height;
        E.setView(el, { z, x: u0.x - fx * (P.w / z), y: u0.y - fy * (P.h / z) });
      } else if (sc) sc.scrollTop -= c.y - g.last.y;
      g.last = c;
    };
    g.move = () => {}; g.up = () => {}; g.cancel = () => {};
    return g;
  }

  /* ---- resize handles of the canvas (width, height, corner) ---- */
  function handleAt(el, cx, cy) {
    const box = boxOf(el); if (!box) return null;
    const tol = matchMedia('(pointer: coarse)').matches ? 18 : 9;
    let best = null, bd = Infinity;
    box.querySelectorAll('.ink-rs').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= tol && d < bd) { bd = d; best = n.getAttribute('data-rs'); }
    });
    return best;
  }
  function startResize(el, info, which, s0) {
    const P = propsOf(el);
    delete S.views[P.id]; E.applyView(el, P);
    const rect = rectOf(el), colPx = rect.width / (P.w / 1000), kv = P.w / rect.width, fx = P.al === 'center' ? 2 : 1;
    const g = { type: 'resize', el, pid: info.pid, pt: info.pt, w: P.w, h: P.h };
    g.move = (evs) => {
      const e = evs[evs.length - 1], dx = e.clientX - s0.cx, dy = e.clientY - s0.cy;
      if (which.includes('e')) g.w = clamp(Math.round(1000 * (rect.width + dx * fx) / colPx), L.W_MIN, L.W_MAX);
      if (which.includes('s')) g.h = clamp(Math.round(P.h + dy * kv), L.H_MIN, L.H_MAX);
      E.layoutBox(el, Object.assign({}, P, { w: g.w, h: g.h }));
    };
    g.up = () => {
      if (g.w === P.w && g.h === P.h) { E.layoutBox(el, P); return; }
      if (!E.commit(el, (d) => { d.w = g.w; d.h = g.h; })) E.layoutBox(el, P);
    };
    g.cancel = () => E.layoutBox(el, P);
    return g;
  }

  /* ====================== Starting a gesture (shared by pointer events and the test helper) ====================== */
  /** info = { pt: pointerType, pid }, s0 = first sample; returns the gesture or null. */
  function begin(tool, el, info, s0, ev) {
    const P = propsOf(el);
    if (tool === 'lasso') {
      const hit = selectionHit(el, s0.cx, s0.cy);
      if (hit && S.sel.length) return startTransform(el, info, s0, hit);
      if (S.sel.length) E.setSel([]);
      return startLasso(el, info, s0);
    }
    if (tool === 'pan') return startPan(el, info, s0);
    if (tool === 'eraser') { const g = startErase(el, info); g.feed(s0); schedule(); return g; }
    if (tool === 'shape') return startShape(el, info, s0);
    if ((tool === 'pen' || tool === 'hl') && S.sel.length) E.setSel([]);
    const g = startDraw(el, tool, info);
    if (g) { g.last = null; push(g, s0, true); schedule(); }
    void P; void ev;
    return g;
  }

  /* ====================== Pointer events ====================== */
  function endGesture(e) {
    const g = G; G = null;
    if (g && e && e.target && e.target.releasePointerCapture) { try { e.target.releasePointerCapture(g.pid); } catch (er) { /* not captured */ } }
    emit('selection');
  }
  function onDown(e) {
    if (e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; emit('options'); }
    const r = E.root();
    if (!r || !E.canInk()) return;
    const inRoot = r.contains(e.target);
    // resize handles of the active canvas sit on its edge, possibly outside the document element: geometry test
    if (!inRoot) {
      const ael0 = E.activeEl();
      if (!G && ael0 && !propsOf(ael0).overlay && (e.button === 0) && e.target.closest && e.target.closest('.ed-scroll') && !e.target.closest('button, input, select, textarea')) {
        const h = handleAt(ael0, e.clientX, e.clientY);
        if (h) { e.preventDefault(); e.stopPropagation(); begin2(startResize(ael0, { pt: e.pointerType, pid: e.pointerId }, h, { cx: e.clientX, cy: e.clientY }), e); }
      }
      return;
    }
    if (e.pointerType === 'touch') touches.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
    if (e.button > 0 && e.button !== 5) return;                  // right / middle button: native behaviour
    const fig = e.target.closest && e.target.closest(SEL);
    const onCanvas = !!(fig && r.contains(fig) && !fig.hasAttribute('data-overlay'));
    const block = () => { e.preventDefault(); e.stopPropagation(); };

    // two fingers: zoom and pan instead of drawing
    if (e.pointerType === 'touch' && touches.size === 2 && (S.mode || onCanvas)) {
      if (G) { try { G.cancel(); } catch (er) { /* ignore */ } G = null; }
      G = startPinch(); block(); return;
    }
    if (G && G.type === 'scroll' && e.pointerType !== 'touch') G = null;   // a pen or mouse beats a resting palm
    if (G) { if (S.mode) block(); return; }

    const ael = E.activeEl();
    if (ael && !propsOf(ael).overlay) {
      const h = handleAt(ael, e.clientX, e.clientY);
      if (h) { block(); begin2(startResize(ael, { pt: e.pointerType, pid: e.pointerId }, h, { cx: e.clientX, cy: e.clientY }), e); return; }
    }
    const pen = e.pointerType === 'pen';
    const eraserEnd = pen && ((e.buttons & 32) || e.button === 5);
    if (!S.mode) {
      if (onCanvas && pen && S.options.autoPen) { E.setActive(propsOf(fig).id); E.setMode(true); }
      else { if (onCanvas && e.pointerType === 'touch') G = startScroll({ pid: e.pointerId }, { cy: e.clientY }); return; }
    }
    if (e.pointerType === 'touch' && !touchDraws()) { block(); G = startScroll({ pid: e.pointerId }, { cy: e.clientY }); capture(e); return; }
    const tool = eraserEnd ? 'eraser' : space ? 'pan' : S.tool;
    block();
    const el = surfaceAt(e.clientX, e.clientY, tool);
    if (!el) {
      if (S.sel.length) E.setSel([]);
      if (tool === 'pan' || e.pointerType === 'touch') { G = startScroll({ pid: e.pointerId }, { cy: e.clientY }); capture(e); }
      return;
    }
    if (E.activeEl() !== el) E.setActive(propsOf(el).id);
    const info = { pt: e.pointerType, pid: e.pointerId };
    const s0 = (() => { const g0 = { el, pt: e.pointerType, usePr: false, sp: 0.5, last: null }; return sample(g0, e, null); })();
    const g = begin(tool, el, info, s0, e);
    if (!g) return;
    begin2(g, e);
  }
  function begin2(g, e) { if (!g) return; G = g; capture(e); }
  function capture(e) { try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* synthetic or inactive pointer */ } }

  function onMove(e) {
    if (e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; emit('options'); }
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) { const t = touches.get(e.pointerId); t.cx = e.clientX; t.cy = e.clientY; }
    if (!G) return;
    if (G.type === 'pinch') { if (touches.has(e.pointerId)) { e.preventDefault(); G.update(); } return; }
    if (e.pointerId !== G.pid) return;
    e.preventDefault();
    let evs = null;
    if (e.getCoalescedEvents) { try { evs = e.getCoalescedEvents(); } catch (er) { evs = null; } }
    if (!evs || !evs.length) evs = [e];
    try { G.move(evs, e); } catch (er) { console.error('[Todo4Me ink]', er); }
  }
  function onUp(e) {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (!G) return;
    if (G.type === 'pinch') { if (!G.ids.includes(e.pointerId)) return; G = null; return; }
    if (e.pointerId !== G.pid) return;
    const g = G;
    if (e.type === 'pointerup' && g.move && g.type !== 'scroll' && g.type !== 'pinch') {
      // the last position may not have been delivered as a move
      const last = g.last, moved = last && (last.cx !== e.clientX || last.cy !== e.clientY);
      if (moved && g.type === 'draw') { try { g.move([e], null); } catch (er) { /* ignore */ } }
    }
    try { if (e.type === 'pointercancel') g.cancel(); else g.up(e); } catch (er) { console.error('[Todo4Me ink]', er); try { g.cancel(); } catch (e2) { /* ignore */ } }
    endGesture(e);
  }
  function abort() { if (G) { try { G.cancel(); } catch (er) { /* ignore */ } G = null; } touches.clear(); wetClear(E.activeEl()); }

  /* ====================== Wheel ====================== */
  function onWheel(e) {
    const r = E.root();
    if (!r || !E.canInk() || !r.contains(e.target)) return;
    const fig = e.target.closest && e.target.closest(SEL);
    if (!fig || !r.contains(fig) || fig.hasAttribute('data-overlay')) return;
    const P = propsOf(fig), v = viewOf(P.id);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(fig, v.z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    } else if (v.z > 1.001 || v.z < 0.999) {
      const k = (P.w / v.z) / rectOf(fig).width, nv = { z: v.z, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) * k, y: v.y + (e.shiftKey ? 0 : e.deltaY) * k };
      const c = E.clampView(P, Object.assign({}, nv));
      if (c.x !== v.x || c.y !== v.y) { e.preventDefault(); E.setView(fig, nv); }
    }
  }

  /* ====================== Keyboard ====================== */
  function onKey(e) {
    if (e.type === 'keyup') { if (e.key === ' ') space = false; return; }
    if (!S.mode || !E.canInk() || e.isComposing) return;
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const el = E.activeEl();
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && !e.altKey) {
      if (k === 'z') { stop(); e.shiftKey ? ink.redo() : ink.undo(); return; }
      if (k === 'y') { stop(); ink.redo(); return; }
      if (el && !e.shiftKey) {
        if (k === 'c' && S.sel.length) { stop(); ink.selection.copy(); return; }
        if (k === 'x' && S.sel.length) { stop(); ink.selection.cut(); return; }
        if (k === 'v') { stop(); ink.selection.paste(); return; }
        if (k === 'd' && S.sel.length) { stop(); ink.selection.duplicate(); return; }
        if (k === 'a') { stop(); ink.selection.all(); return; }
      }
    }
    if (mod || e.altKey) { X.shortcuts.dispatch(e); return; }
    if (k === 'Delete' || k === 'Backspace') { if (S.sel.length) { stop(); ink.selection.delete(); } return; }
    if (k === 'Escape') { stop(); if (G) abort(); else if (S.sel.length) ink.selection.clear(); else ink.setMode(false); return; }
    if (k === ' ') { stop(); space = true; return; }
    const tool = { p: 'pen', h: 'hl', e: 'eraser', l: 'lasso', s: 'shape' }[k];
    if (tool && !e.shiftKey) { stop(); ink.setTool(tool); }
  }

  /* ====================== Wiring ====================== */
  const cap = { capture: true };
  document.addEventListener('pointerdown', onDown, cap);
  document.addEventListener('pointermove', onMove, cap);
  if (hasRawUpdate) document.addEventListener('pointerrawupdate', onMove, cap);
  document.addEventListener('pointerup', onUp, cap);
  document.addEventListener('pointercancel', onUp, cap);
  document.addEventListener('keydown', onKey, cap);
  document.addEventListener('keyup', onKey, cap);
  window.addEventListener('blur', () => { space = false; });
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  // In pen mode the document is not edited: no selection, no caret jumps, no double-click dialogs, no native menu.
  const guard = (e) => { if (S.mode && E.root() && E.root().contains(e.target)) { e.preventDefault(); if (e.type !== 'selectstart') e.stopPropagation(); } };
  ['mousedown', 'dblclick', 'contextmenu', 'dragstart', 'selectstart'].forEach((n) => document.addEventListener(n, guard, cap));

  ink._input = { abort, busy: () => !!G };

  /* ====================== Test helper: synthesise a gesture without pointer events ====================== */
  ink.test.stroke = function (points, o) {
    o = o || {};
    const el = o.id ? E.elById(o.id) : E.activeEl();
    if (!el || !E.canInk()) return false;
    if (S.activeId !== propsOf(el).id) E.setActive(propsOf(el).id);
    const tool = o.tool || S.tool, pt = o.pointerType || 'mouse';
    const rect = rectOf(el);
    const smp = (q, i) => { const c = toClient(el, q.x, q.y, rect); return { x: q.x, y: q.y, p: q.p == null ? 0.5 : q.p, cx: c.x, cy: c.y, t: i * 8, shift: !!o.shift }; };
    const list = points.map(smp);
    if (!list.length) return false;
    const info = { pt, pid: -1 };
    const g = begin(tool, el, info, list[0], null);
    if (!g) return false;
    // real pressure only for pens (like the pointer path)
    if (g.type === 'draw' && pt === 'pen') { g.pt = 'pen'; g.pts[0].p = clamp(list[0].p, 0.05, 1); }
    for (let i = 1; i < list.length; i++) {
      const s = list[i];
      if (g.type === 'draw') push(g, s);
      else g.move([{ clientX: s.cx, clientY: s.cy, shiftKey: !!o.shift, pressure: s.p, timeStamp: s.t }], null);
    }
    g.up();
    return true;
  };
})();
