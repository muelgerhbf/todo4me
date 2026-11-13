/* Todo4Me — ink module, model (T4.ink.model): pure functions for digital handwriting.
 * Data format, outline geometry, hit testing, erasing, shape recognition, SVG / PNG output. No editor state, no dependencies.
 * Contract: docs/INK-CONTRACT.md (section 2 data, section 3 functions). `validate` is the security boundary for stored data:
 * every string that ends up in SVG markup is built from values that passed it (ids, #rrggbb colours, finite numbers). */
(function () {
  'use strict';
  const T4 = (window.T4 = window.T4 || {});

  const LIMITS = Object.freeze({
    W_MIN: 200, W_MAX: 1000, H_MIN: 60, H_MAX: 20000,
    LAYERS: 8, ITEMS: 5000, POINTS: 5000, NAME: 40,
    SIZE_MIN: 0.5, SIZE_MAX: 60, OPACITY_MIN: 0.05, OPACITY_MAX: 1,
    COORD_MIN: -2000, COORD_MAX: 30000, POLY_MIN: 3, POLY_MAX: 12,
    BYTES: 1900000, // estimated JSON size at which further items are dropped (registry cap is 2 MB)
    PNG_MAX_SIDE: 8192, PNG_MAX_PIXELS: 40e6,
  });
  const TOOLS_DEFAULT = Object.freeze({
    pen: { c: '#1a1a1a', s: 2.5, o: 1, pressure: true },
    hl: { c: '#ffd60a', s: 18, o: 0.35 },
    eraser: { mode: 'stroke', s: 14 },
    shape: { kind: 'rect', c: '#1a1a1a', s: 2.5, o: 1, f: 'none' },
  });

  const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const COL_RE = /^#[0-9a-fA-F]{6}$/;
  const ALIGNS = ['left', 'center', 'right'];
  const BGS = ['none', 'dots', 'lines', 'grid'];
  const BG_STEP = 40;
  const CMIN10 = LIMITS.COORD_MIN * 10, CMAX10 = LIMITS.COORD_MAX * 10;

  /* ---------- small helpers ---------- */
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const num = (v, lo, hi, d) => (isNum(v) ? clamp(v, lo, hi) : d);
  const r1 = (v) => Math.round(v * 10) / 10;
  const col = (v, d) => (typeof v === 'string' && COL_RE.test(v) ? v.toLowerCase() : d);
  const fmt = (n) => { const r = Math.round(n * 100) / 100; return String(r === 0 || !isFinite(r) ? 0 : r); };
  const cl1 = (v) => clamp(r1(v), LIMITS.COORD_MIN, LIMITS.COORD_MAX);
  // eslint-disable-next-line no-control-regex
  const CTRL = /[\u0000-\u001f\u007f]/g;

  let counter = 0;
  function uid() {
    let s = '';
    try { const a = new Uint32Array(2); crypto.getRandomValues(a); s = a[0].toString(36) + a[1].toString(36); } catch (e) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); }
    counter = (counter + 1) % 1296;
    return 'k' + s.replace(/[^a-z0-9]/g, '').slice(0, 14) + counter.toString(36);
  }

  /* ====================== codec ====================== */
  function ci(v) { return isNum(v) ? clamp(Math.round(v * 10), CMIN10, CMAX10) : 0; }

  function encodePoints(pts, withPressure) {
    const out = [];
    if (!Array.isArray(pts)) return out;
    const n = Math.min(pts.length, LIMITS.POINTS);
    let px = 0, py = 0, pp = 0;
    for (let i = 0; i < n; i++) {
      const q = pts[i] || {};
      const x = ci(q.x), y = ci(q.y);
      if (withPressure) {
        const p = clamp(Math.round((isNum(q.p) ? q.p : 0.5) * 100), 0, 100);
        if (i === 0) out.push(x, y, p); else out.push(x - px, y - py, p - pp);
        pp = p;
      } else if (i === 0) out.push(x, y); else out.push(x - px, y - py);
      px = x; py = y;
    }
    return out;
  }

  function decodePoints(item) {
    const src = item && item.p;
    if (!Array.isArray(src)) return [];
    const wp = item.pr === 1, st = wp ? 3 : 2;
    const n = Math.min(Math.floor(src.length / st), LIMITS.POINTS);
    const out = new Array(n);
    let ax = 0, ay = 0, ap = 0;
    for (let i = 0; i < n; i++) {
      const j = i * st;
      ax += isNum(src[j]) ? src[j] : 0; ay += isNum(src[j + 1]) ? src[j + 1] : 0;
      if (wp) ap += isNum(src[j + 2]) ? src[j + 2] : 0;
      out[i] = { x: ax / 10, y: ay / 10, p: wp ? clamp(ap, 0, 100) / 100 : 0.5 };
    }
    return out;
  }

  /* ====================== validation ====================== */
  /** One item → clean copy or null. `layers` = { set, first } (null: any valid layer id), `used` = Set of item ids (null: not tracked). */
  function cleanItem(r, layers, used) {
    if (!r || typeof r !== 'object') return null;
    const k = r.k;
    let l = typeof r.l === 'string' && ID_RE.test(r.l) ? r.l : (layers ? layers.first : 'l1');
    if (layers && !layers.set.has(l)) l = layers.first;
    let item = null;
    if (k === 'pen' || k === 'hl') {
      const wp = r.pr === 1, st = wp ? 3 : 2, src = r.p;
      if (!Array.isArray(src)) return null;
      const n = Math.min(Math.floor(src.length / st), LIMITS.POINTS);
      if (n < 1) return null;
      const out = new Array(n * st);
      let px = 0, py = 0, pp = 0;
      for (let i = 0; i < n; i++) {
        const j = i * st;
        let vx = src[j], vy = src[j + 1];
        if (!isNum(vx) || !isNum(vy)) return null;
        vx = Math.round(vx); vy = Math.round(vy);
        const ax = clamp(i === 0 ? vx : px + vx, CMIN10, CMAX10), ay = clamp(i === 0 ? vy : py + vy, CMIN10, CMAX10);
        out[j] = i === 0 ? ax : ax - px; out[j + 1] = i === 0 ? ay : ay - py;
        px = ax; py = ay;
        if (wp) {
          const vp = src[j + 2];
          if (!isNum(vp)) return null;
          const ap = clamp(i === 0 ? Math.round(vp) : pp + Math.round(vp), 0, 100);
          out[j + 2] = i === 0 ? ap : ap - pp;
          pp = ap;
        }
      }
      item = { id: '', l, k, c: col(r.c, TOOLS_DEFAULT.pen.c), o: num(r.o, LIMITS.OPACITY_MIN, LIMITS.OPACITY_MAX, k === 'hl' ? TOOLS_DEFAULT.hl.o : 1), s: num(r.s, LIMITS.SIZE_MIN, LIMITS.SIZE_MAX, k === 'hl' ? TOOLS_DEFAULT.hl.s : 3), pr: wp ? 1 : 0, p: out };
    } else if (k === 'line' || k === 'arrow' || k === 'rect' || k === 'ellipse') {
      if (!isNum(r.x1) || !isNum(r.y1) || !isNum(r.x2) || !isNum(r.y2)) return null;
      let x1 = cl1(r.x1), y1 = cl1(r.y1), x2 = cl1(r.x2), y2 = cl1(r.y2);
      if (k === 'rect' || k === 'ellipse') { const a = Math.min(x1, x2), b = Math.max(x1, x2), c2 = Math.min(y1, y2), d = Math.max(y1, y2); x1 = a; x2 = b; y1 = c2; y2 = d; }
      item = { id: '', l, k, c: col(r.c, TOOLS_DEFAULT.shape.c), o: num(r.o, LIMITS.OPACITY_MIN, LIMITS.OPACITY_MAX, 1), s: num(r.s, LIMITS.SIZE_MIN, LIMITS.SIZE_MAX, TOOLS_DEFAULT.shape.s), f: k === 'line' || k === 'arrow' ? 'none' : (r.f === 'none' ? 'none' : col(r.f, 'none')), x1, y1, x2, y2 };
    } else if (k === 'poly') {
      const src = r.pts;
      if (!Array.isArray(src)) return null;
      let n = Math.min(Math.floor(src.length / 2), LIMITS.POLY_MAX);
      if (n < LIMITS.POLY_MIN) return null;
      const pts = new Array(n * 2);
      for (let i = 0; i < n * 2; i++) { if (!isNum(src[i])) return null; pts[i] = cl1(src[i]); }
      item = { id: '', l, k, c: col(r.c, TOOLS_DEFAULT.shape.c), o: num(r.o, LIMITS.OPACITY_MIN, LIMITS.OPACITY_MAX, 1), s: num(r.s, LIMITS.SIZE_MIN, LIMITS.SIZE_MAX, TOOLS_DEFAULT.shape.s), f: r.f === 'none' ? 'none' : col(r.f, 'none'), pts };
    } else return null;
    let id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : null;
    if (used) { if (!id || used.has(id)) id = uid(); used.add(id); } else if (!id) id = uid();
    item.id = id;
    return item;
  }

  function validate(props) {
    try {
      if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
      const out = {
        v: 1,
        id: typeof props.id === 'string' && ID_RE.test(props.id) ? props.id : uid(),
        w: Math.round(num(props.w, LIMITS.W_MIN, LIMITS.W_MAX, 1000)),
        h: Math.round(num(props.h, LIMITS.H_MIN, LIMITS.H_MAX, 300)),
        al: ALIGNS.indexOf(props.al) >= 0 ? props.al : 'center',
        bg: BGS.indexOf(props.bg) >= 0 ? props.bg : 'none',
        overlay: props.overlay === true,
        layers: [],
        items: [],
      };
      const lset = new Set();
      if (Array.isArray(props.layers)) {
        const n = Math.min(props.layers.length, LIMITS.LAYERS);
        for (let i = 0; i < n; i++) {
          const L = props.layers[i];
          if (!L || typeof L !== 'object') continue;
          let id = typeof L.id === 'string' && ID_RE.test(L.id) ? L.id : null;
          if (!id || lset.has(id)) id = uid();
          lset.add(id);
          out.layers.push({ id, name: typeof L.name === 'string' ? L.name.replace(CTRL, '').slice(0, LIMITS.NAME) : '', hidden: L.hidden === true, locked: L.locked === true });
        }
      }
      if (!out.layers.length) { out.layers.push({ id: 'l1', name: '', hidden: false, locked: false }); lset.add('l1'); }
      const layers = { set: lset, first: out.layers[0].id };
      if (Array.isArray(props.items)) {
        const used = new Set();
        const n = Math.min(props.items.length, LIMITS.ITEMS);
        let bytes = 0;
        for (let i = 0; i < n; i++) {
          const it = cleanItem(props.items[i], layers, used);
          if (!it) continue;
          bytes += it.p ? it.p.length * 6 + 130 : 170;
          if (bytes > LIMITS.BYTES) break;
          out.items.push(it);
        }
      }
      return out;
    } catch (e) { return null; }
  }

  function empty(opts) {
    const o = opts || {};
    return validate({
      id: uid(), w: o.w, h: o.h, al: o.al, bg: o.bg, overlay: o.overlay === true,
      layers: [{ id: 'l1', name: '', hidden: false, locked: false }], items: [],
    });
  }

  /* ====================== simplify, makeStroke, makeShape ====================== */
  function segDistSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }

  function simplify(pts, tol) {
    tol = isNum(tol) && tol >= 0 ? tol : 0.35;
    const src = Array.isArray(pts) ? pts : [];
    const n = src.length;
    const cp = (q) => ({ x: q.x, y: q.y, p: isNum(q.p) ? q.p : 0.5 });
    if (n < 3) return src.map(cp);
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const t2 = tol * tol, stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const A = src[a], B = src[b];
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = segDistSq(src[i].x, src[i].y, A.x, A.y, B.x, B.y);
        if (d > md) { md = d; mi = i; }
      }
      if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(cp(src[i]));
    return out;
  }

  function cleanPoints(pts) {
    const out = [];
    if (!Array.isArray(pts)) return out;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (!q || !isNum(q.x) || !isNum(q.y)) continue;
      const l = out[out.length - 1];
      if (l && Math.abs(q.x - l.x) < 0.05 && Math.abs(q.y - l.y) < 0.05) continue;
      out.push({ x: q.x, y: q.y, p: isNum(q.p) ? clamp(q.p, 0, 1) : 0.5 });
    }
    return out;
  }

  function makeStroke(pts, style) {
    const st = style || {};
    const k = st.k === 'hl' ? 'hl' : 'pen';
    const D = TOOLS_DEFAULT[k];
    let sp = cleanPoints(pts);
    if (!sp.length) return null;
    let tol = 0.35;
    sp = simplify(sp, tol);
    while (sp.length > LIMITS.POINTS) { tol *= 1.5; sp = simplify(sp, tol); }
    const wp = k === 'pen' && (st.pressure === undefined ? D.pressure : !!st.pressure);
    return cleanItem({
      id: uid(), l: typeof st.l === 'string' ? st.l : 'l1', k, c: col(st.c, D.c), o: num(st.o, LIMITS.OPACITY_MIN, LIMITS.OPACITY_MAX, D.o), s: num(st.s, LIMITS.SIZE_MIN, LIMITS.SIZE_MAX, D.s),
      pr: wp ? 1 : 0, p: encodePoints(sp, wp),
    }, null, null);
  }

  function makeShape(kind, x1, y1, x2, y2, style, mods) {
    const st = style || {}, D = TOOLS_DEFAULT.shape;
    if (!isNum(x1) || !isNum(y1) || !isNum(x2) || !isNum(y2)) return null;
    const constrain = !!(mods && mods.constrain);
    const base = { id: uid(), l: typeof st.l === 'string' ? st.l : 'l1', c: col(st.c, D.c), o: num(st.o, LIMITS.OPACITY_MIN, LIMITS.OPACITY_MAX, D.o), s: num(st.s, LIMITS.SIZE_MIN, LIMITS.SIZE_MAX, D.s), f: st.f === 'none' ? 'none' : col(st.f, 'none') };
    let dx = x2 - x1, dy = y2 - y1;
    if (constrain) {
      if (kind === 'line' || kind === 'arrow') {
        const len = Math.hypot(dx, dy), step = Math.PI / 12, a = Math.round(Math.atan2(dy, dx) / step) * step;
        dx = len * Math.cos(a); dy = len * Math.sin(a);
      } else {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx = (dx < 0 ? -1 : 1) * m; dy = (dy < 0 ? -1 : 1) * m;
      }
    }
    x2 = x1 + dx; y2 = y1 + dy;
    if (kind === 'tri') return cleanItem(Object.assign(base, { k: 'poly', pts: [(x1 + x2) / 2, y1, x2, y2, x1, y2] }), null, null);
    if (kind !== 'line' && kind !== 'arrow' && kind !== 'rect' && kind !== 'ellipse') return null;
    return cleanItem(Object.assign(base, { k: kind, x1, y1, x2, y2 }), null, null);
  }

  /* ====================== outline ====================== */
  const ANGLE_STEP = 0.3;
  const CORNER = 1.2; // turn angle (rad) above which a stroke vertex stays a sharp corner

  /** Closed outline polygon `[[x, y], …]` of a variable-width stroke: spline through the (lightly smoothed) points, round caps and joins. */
  function outline(pts, opts) {
    const o = opts || {};
    const size = clamp(isNum(o.size) ? o.size : 3, 0.05, 400);
    const press = !!o.pressure;
    const P = [];
    if (Array.isArray(pts)) {
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (!q || !isNum(q.x) || !isNum(q.y)) continue;
        const l = P[P.length - 1];
        if (l && Math.abs(q.x - l.x) < 0.02 && Math.abs(q.y - l.y) < 0.02) { if (press && isNum(q.p)) l.p = Math.max(l.p, q.p); continue; }
        P.push({ x: q.x, y: q.y, p: press && isNum(q.p) ? clamp(q.p, 0, 1) : 0.5 });
      }
    }
    const radiusOf = (p) => (press ? size * (0.35 + 1.3 * p) : size) / 2;
    if (!P.length) return [];
    if (P.length === 1) return circlePoly(P[0].x, P[0].y, radiusOf(P[0].p));
    const n0 = P.length;
    // chord lengths + turn angles at the vertices
    const seg = new Array(n0 - 1);
    for (let i = 0; i < n0 - 1; i++) seg[i] = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
    const turn = new Array(n0).fill(0);
    for (let i = 1; i < n0 - 1; i++) {
      const a1 = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x), a2 = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      turn[i] = Math.abs(d);
    }
    // light smoothing: positions (not at corners / ends) and pressure
    const S = P.map((q) => ({ x: q.x, y: q.y, p: q.p }));
    for (let i = 1; i < n0 - 1; i++) {
      if (turn[i] < CORNER) { S[i].x = 0.5 * P[i].x + 0.25 * (P[i - 1].x + P[i + 1].x); S[i].y = 0.5 * P[i].y + 0.25 * (P[i - 1].y + P[i + 1].y); }
    }
    if (press) for (let pass = 0; pass < 2; pass++) {
      const prev = S.map((q) => q.p);
      for (let i = 1; i < n0 - 1; i++) S[i].p = 0.25 * prev[i - 1] + 0.5 * prev[i] + 0.25 * prev[i + 1];
    }
    // tangents (chordal Hermite); corners keep one-sided tangents
    const sl = new Array(n0 - 1);
    for (let i = 0; i < n0 - 1; i++) sl[i] = Math.max(1e-6, Math.hypot(S[i + 1].x - S[i].x, S[i + 1].y - S[i].y));
    const tan = new Array(n0); // per vertex: [mx, my] smooth tangent
    for (let i = 0; i < n0; i++) {
      if (i === 0) tan[i] = [(S[1].x - S[0].x) / sl[0], (S[1].y - S[0].y) / sl[0]];
      else if (i === n0 - 1) tan[i] = [(S[i].x - S[i - 1].x) / sl[i - 1], (S[i].y - S[i - 1].y) / sl[i - 1]];
      else { const h = sl[i - 1] + sl[i]; tan[i] = [(S[i + 1].x - S[i - 1].x) / h, (S[i + 1].y - S[i - 1].y) / h]; }
    }
    // resample: centre points + radii
    const C = [], R = [];
    const push = (x, y, r) => { C.push([x, y]); R.push(r); };
    push(S[0].x, S[0].y, radiusOf(S[0].p));
    for (let i = 0; i < n0 - 1; i++) {
      const A = S[i], B = S[i + 1], h = sl[i];
      const ex = (B.x - A.x) / h, ey = (B.y - A.y) / h;
      const m0 = turn[i] >= CORNER && i > 0 ? [ex, ey] : tan[i];
      const m1 = turn[i + 1] >= CORNER && i + 1 < n0 - 1 ? [ex, ey] : tan[i + 1];
      const l0 = Math.hypot(m0[0], m0[1]), l1 = Math.hypot(m1[0], m1[1]);
      let ang = 0;
      if (l0 > 1e-6 && l1 > 1e-6) ang = Math.acos(clamp((m0[0] * m1[0] + m0[1] * m1[1]) / (l0 * l1), -1, 1));
      const r0 = radiusOf(A.p), r1v = radiusOf(B.p);
      const m = clamp(Math.ceil(Math.max(ang / 0.15, Math.abs(r1v - r0) / 0.6)), 1, 48);
      for (let k = 1; k <= m; k++) {
        const u = k / m;
        if (k === m) { push(B.x, B.y, r1v); break; }
        const u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        push(h00 * A.x + h10 * h * m0[0] + h01 * B.x + h11 * h * m1[0], h00 * A.y + h10 * h * m0[1] + h01 * B.y + h11 * h * m1[1], r0 + (r1v - r0) * u);
      }
    }
    // drop coincident centres
    const Cc = [C[0]], Rr = [R[0]];
    for (let i = 1; i < C.length; i++) {
      const l = Cc[Cc.length - 1];
      if (Math.hypot(C[i][0] - l[0], C[i][1] - l[1]) > 0.01) { Cc.push(C[i]); Rr.push(R[i]); }
    }
    const N = Cc.length;
    if (N === 1) return circlePoly(Cc[0][0], Cc[0][1], Rr[0]);
    // segment directions
    const D = new Array(N - 1);
    for (let i = 0; i < N - 1; i++) {
      const dx = Cc[i + 1][0] - Cc[i][0], dy = Cc[i + 1][1] - Cc[i][1], l = Math.hypot(dx, dy) || 1;
      D[i] = [dx / l, dy / l];
    }
    // sides: left = +n (n = (-dy, dx)), right = -n
    const left = [], right = [];
    const sideAdd = (arr, x, y, dir, force) => {
      const q = arr[arr.length - 1];
      if (!force && q && (x - q.x) * dir[0] + (y - q.y) * dir[1] <= 0) return; // reversed on the inner side of a sharp turn
      arr.push({ x, y });
    };
    for (let i = 0; i < N; i++) {
      const c = Cc[i], r = Rr[i];
      const din = i > 0 ? D[i - 1] : D[0], dout = i < N - 1 ? D[i] : D[N - 2];
      const dir = i < N - 1 ? D[i] : D[N - 2];
      const cross = din[0] * dout[1] - din[1] * dout[0], dot = din[0] * dout[0] + din[1] * dout[1];
      const theta = Math.atan2(cross, dot);
      if (Math.abs(theta) <= ANGLE_STEP) {
        let nx = -(din[1] + dout[1]), ny = din[0] + dout[0];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        sideAdd(left, c[0] + nx * r, c[1] + ny * r, dir);
        sideAdd(right, c[0] - nx * r, c[1] - ny * r, dir);
      } else {
        // join: the outer side gets a round arc, the inner side one averaged point
        let nx = -(din[1] + dout[1]), ny = din[0] + dout[0];
        const nl = Math.hypot(nx, ny);
        if (nl < 1e-6) { nx = -din[1]; ny = din[0]; } else { nx /= nl; ny /= nl; }
        const outerRight = cross > 0; // left turn: right side is outside
        const steps = Math.ceil(Math.abs(theta) / ANGLE_STEP);
        const arc = (sign) => {
          const res = [];
          for (let k = 0; k <= steps; k++) {
            const a = (theta * k) / steps, ca = Math.cos(a), sa = Math.sin(a);
            const bx = -din[1] * sign, by = din[0] * sign;
            res.push([c[0] + (bx * ca - by * sa) * r, c[1] + (bx * sa + by * ca) * r]);
          }
          return res;
        };
        if (outerRight) { arc(-1).forEach((q) => sideAdd(right, q[0], q[1], dir, true)); sideAdd(left, c[0] + nx * r, c[1] + ny * r, dir); }
        else { arc(1).forEach((q) => sideAdd(left, q[0], q[1], dir, true)); sideAdd(right, c[0] - nx * r, c[1] - ny * r, dir); }
      }
    }
    const poly = [];
    for (let i = 0; i < left.length; i++) poly.push([left[i].x, left[i].y]);
    // end cap: from the left side round the front to the right side
    const dEnd = D[N - 2], nEnd = [-dEnd[1], dEnd[0]], cE = Cc[N - 1], rE = Rr[N - 1];
    const capSteps = Math.max(4, Math.ceil(Math.PI / ANGLE_STEP));
    for (let k = 1; k < capSteps; k++) {
      const a = (Math.PI * k) / capSteps, ca = Math.cos(a), sa = Math.sin(a);
      poly.push([cE[0] + (nEnd[0] * ca + dEnd[0] * sa) * rE, cE[1] + (nEnd[1] * ca + dEnd[1] * sa) * rE]);
    }
    for (let i = right.length - 1; i >= 0; i--) poly.push([right[i].x, right[i].y]);
    const dS = D[0], nS = [-dS[1], dS[0]], cS = Cc[0], rS = Rr[0];
    for (let k = 1; k < capSteps; k++) {
      const a = (Math.PI * k) / capSteps, ca = Math.cos(a), sa = Math.sin(a);
      poly.push([cS[0] + (-nS[0] * ca - dS[0] * sa) * rS, cS[1] + (-nS[1] * ca - dS[1] * sa) * rS]);
    }
    return poly;
  }

  function circlePoly(cx, cy, r) {
    const n = Math.max(16, Math.min(48, Math.ceil(r * 3)));
    const out = [];
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }

  /* ====================== paths ====================== */
  function polyPath(poly) {
    const n = poly.length;
    if (n < 3) return '';
    // quadratic smoothing through the edge midpoints (like a rounded polygon)
    const parts = ['M' + fmt(poly[0][0]) + ' ' + fmt(poly[0][1]) + 'Q'];
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      parts.push(fmt(a[0]) + ' ' + fmt(a[1]) + ' ' + fmt((a[0] + b[0]) / 2) + ' ' + fmt((a[1] + b[1]) / 2));
    }
    return parts.join(' ').replace('Q ', 'Q') + 'Z';
  }

  function arrowHead(x1, y1, x2, y2, s) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.01) return null;
    const hl = Math.min(len * 0.5, Math.max(s * 4, 12));
    const a = Math.atan2(y2 - y1, x2 - x1), sp = 0.5;
    return [x2 - hl * Math.cos(a - sp), y2 - hl * Math.sin(a - sp), x2 - hl * Math.cos(a + sp), y2 - hl * Math.sin(a + sp)];
  }

  function centerPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + fmt(pts[0].x) + ' ' + fmt(pts[0].y) + 'h0.01';
    if (pts.length === 2) return 'M' + fmt(pts[0].x) + ' ' + fmt(pts[0].y) + 'L' + fmt(pts[1].x) + ' ' + fmt(pts[1].y);
    // through the midpoints with the points as quadratic control points (smooth, small)
    let d = 'M' + fmt(pts[0].x) + ' ' + fmt(pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) d += 'Q' + fmt(pts[i].x) + ' ' + fmt(pts[i].y) + ' ' + fmt((pts[i].x + pts[i + 1].x) / 2) + ' ' + fmt((pts[i].y + pts[i + 1].y) / 2);
    const l = pts[pts.length - 1];
    return d + 'L' + fmt(l.x) + ' ' + fmt(l.y);
  }

  function pathOfClean(it) {
    switch (it.k) {
      case 'pen': return polyPath(outline(decodePoints(it), { size: it.s, pressure: it.pr === 1 }));
      case 'hl': return centerPath(decodePoints(it));
      case 'line': return 'M' + fmt(it.x1) + ' ' + fmt(it.y1) + 'L' + fmt(it.x2) + ' ' + fmt(it.y2);
      case 'arrow': {
        let d = 'M' + fmt(it.x1) + ' ' + fmt(it.y1) + 'L' + fmt(it.x2) + ' ' + fmt(it.y2);
        const h = arrowHead(it.x1, it.y1, it.x2, it.y2, it.s);
        if (h) d += 'M' + fmt(h[0]) + ' ' + fmt(h[1]) + 'L' + fmt(it.x2) + ' ' + fmt(it.y2) + 'L' + fmt(h[2]) + ' ' + fmt(h[3]);
        return d;
      }
      case 'rect': return 'M' + fmt(it.x1) + ' ' + fmt(it.y1) + 'H' + fmt(it.x2) + 'V' + fmt(it.y2) + 'H' + fmt(it.x1) + 'Z';
      case 'ellipse': {
        const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, rx = Math.max(0.01, Math.abs(it.x2 - it.x1) / 2), ry = Math.max(0.01, Math.abs(it.y2 - it.y1) / 2);
        return 'M' + fmt(cx - rx) + ' ' + fmt(cy) + 'A' + fmt(rx) + ' ' + fmt(ry) + ' 0 1 0 ' + fmt(cx + rx) + ' ' + fmt(cy) + 'A' + fmt(rx) + ' ' + fmt(ry) + ' 0 1 0 ' + fmt(cx - rx) + ' ' + fmt(cy) + 'Z';
      }
      case 'poly': {
        let d = '';
        for (let i = 0; i < it.pts.length; i += 2) d += (i ? 'L' : 'M') + fmt(it.pts[i]) + ' ' + fmt(it.pts[i + 1]);
        return d + 'Z';
      }
      default: return '';
    }
  }

  function itemPath(item) { const it = cleanItem(item, null, null); return it ? pathOfClean(it) : ''; }

  function itemSVGClean(it) {
    const d = pathOfClean(it);
    if (!d) return '';
    const op = it.o < 1 ? ' opacity="' + Math.round(it.o * 1000) / 1000 + '"' : '';
    const head = '<path data-id="' + it.id + '" d="' + d + '"';
    if (it.k === 'pen') return head + ' fill="' + it.c + '"' + op + '/>';
    if (it.k === 'hl') return head + ' fill="none" stroke="' + it.c + '" stroke-width="' + fmt(it.s) + '" stroke-linecap="round" stroke-linejoin="round"' + op + ' style="mix-blend-mode:multiply"/>';
    return head + ' fill="' + (it.f === 'none' ? 'none' : it.f) + '" stroke="' + it.c + '" stroke-width="' + fmt(it.s) + '" stroke-linecap="round" stroke-linejoin="round"' + op + '/>';
  }
  function itemSVG(item) { const it = cleanItem(item, null, null); return it ? itemSVGClean(it) : ''; }

  /* ====================== backgrounds ====================== */
  function bgDims(w, h) { return { w: clamp(isNum(w) ? w : 1000, 1, 100000), h: clamp(isNum(h) ? h : 300, 1, 100000) }; }
  function backgroundSVG(bg, w, h) {
    if (BGS.indexOf(bg) < 1) return '';
    const D = bgDims(w, h);
    let d = '';
    if (bg === 'dots' || bg === 'lines' || bg === 'grid') for (let y = BG_STEP; y < D.h; y += BG_STEP) d += 'M' + (bg === 'dots' ? BG_STEP : 0) + ' ' + y + 'H' + fmt(D.w);
    if (bg === 'dots') return '<g class="ink-bg" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"><path d="' + d + '" stroke-dasharray="0.01 ' + (BG_STEP - 0.01) + '"/></g>';
    if (bg === 'grid') for (let x = BG_STEP; x < D.w; x += BG_STEP) d += 'M' + x + ' 0V' + fmt(D.h);
    return '<g class="ink-bg" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1"><path d="' + d + '"/></g>';
  }
  function drawBackground(ctx, bg, w, h) {
    if (BGS.indexOf(bg) < 1) return;
    ctx.save();
    ctx.strokeStyle = '#000000';
    if (bg === 'dots') {
      ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.35;
      for (let y = BG_STEP; y < h; y += BG_STEP) for (let x = BG_STEP; x < w; x += BG_STEP) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 6.2832); ctx.fill(); }
    } else {
      ctx.globalAlpha = 0.18; ctx.lineWidth = 1; ctx.beginPath();
      for (let y = BG_STEP; y < h; y += BG_STEP) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      if (bg === 'grid') for (let x = BG_STEP; x < w; x += BG_STEP) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ====================== canvas painting ====================== */
  function drawItemClean(ctx, it) {
    const d = pathOfClean(it);
    if (!d || typeof Path2D !== 'function') return;
    const path = new Path2D(d);
    ctx.save();
    ctx.globalAlpha = it.o;
    if (it.k === 'pen') { ctx.fillStyle = it.c; ctx.fill(path); }
    else {
      if (it.k === 'hl') ctx.globalCompositeOperation = 'multiply';
      ctx.lineWidth = it.s; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = it.c;
      if (it.k !== 'hl' && it.f !== 'none') { ctx.fillStyle = it.f; ctx.fill(path); }
      ctx.stroke(path);
    }
    ctx.restore();
  }
  function drawItem(ctx, item) { const it = cleanItem(item, null, null); if (it && ctx) drawItemClean(ctx, it); }

  /* ====================== geometry: bbox, hit, lasso, transform ====================== */
  function polylineOf(it) {
    // { pts: [[x, y]…], closed, fill }
    switch (it.k) {
      case 'pen': case 'hl': return { pts: decodePoints(it).map((q) => [q.x, q.y]), closed: false, fill: false };
      case 'line': case 'arrow': return { pts: [[it.x1, it.y1], [it.x2, it.y2]], closed: false, fill: false };
      case 'rect': return { pts: [[it.x1, it.y1], [it.x2, it.y1], [it.x2, it.y2], [it.x1, it.y2]], closed: true, fill: it.f !== 'none' };
      case 'ellipse': {
        const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, rx = Math.abs(it.x2 - it.x1) / 2, ry = Math.abs(it.y2 - it.y1) / 2, pts = [];
        for (let i = 0; i < 48; i++) { const a = (i * Math.PI * 2) / 48; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
        return { pts, closed: true, fill: it.f !== 'none' };
      }
      case 'poly': { const pts = []; for (let i = 0; i < it.pts.length; i += 2) pts.push([it.pts[i], it.pts[i + 1]]); return { pts, closed: true, fill: it.f !== 'none' }; }
      default: return { pts: [], closed: false, fill: false };
    }
  }
  function halfWidth(it) { return it.k === 'pen' && it.pr === 1 ? it.s * 0.825 : it.s / 2; }

  function bboxClean(it) {
    const pl = polylineOf(it);
    if (!pl.pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    pl.pts.forEach((q) => add(q[0], q[1]));
    if (it.k === 'arrow') { const h = arrowHead(it.x1, it.y1, it.x2, it.y2, it.s); if (h) { add(h[0], h[1]); add(h[2], h[3]); } }
    const hw = halfWidth(it) + (it.k === 'arrow' ? it.s * 0.5 : 0);
    return { x: x0 - hw, y: y0 - hw, w: x1 - x0 + 2 * hw, h: y1 - y0 + 2 * hw };
  }
  function bbox(item) { const it = cleanItem(item, null, null); return it ? bboxClean(it) : { x: 0, y: 0, w: 0, h: 0 }; }
  function bboxOf(items) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (Array.isArray(items) ? items : []).forEach((item) => {
      const it = cleanItem(item, null, null); if (!it) return;
      const b = bboxClean(it);
      if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y; if (b.x + b.w > x1) x1 = b.x + b.w; if (b.y + b.h > y1) y1 = b.y + b.h;
    });
    return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function hitClean(it, x, y, r) {
    if (!isNum(x) || !isNum(y)) return false;
    r = isNum(r) && r >= 0 ? r : 0;
    const reach = r + halfWidth(it);
    const b = bboxClean(it);
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
    const pl = polylineOf(it), p = pl.pts, n = p.length;
    if (!n) return false;
    const R2 = reach * reach;
    if (n === 1) return (p[0][0] - x) ** 2 + (p[0][1] - y) ** 2 <= R2;
    const last = pl.closed ? n : n - 1;
    for (let i = 0; i < last; i++) { const a = p[i], c = p[(i + 1) % n]; if (segDistSq(x, y, a[0], a[1], c[0], c[1]) <= R2) return true; }
    if (it.k === 'arrow') { const h = arrowHead(it.x1, it.y1, it.x2, it.y2, it.s); if (h && (segDistSq(x, y, h[0], h[1], it.x2, it.y2) <= R2 || segDistSq(x, y, h[2], h[3], it.x2, it.y2) <= R2)) return true; }
    return pl.fill && pointInPoly(x, y, p);
  }
  function hit(item, x, y, r) { const it = cleanItem(item, null, null); return it ? hitClean(it, x, y, r) : false; }

  function eraseArea(item, x, y, r) {
    const it = cleanItem(item, null, null);
    if (!it || !isNum(x) || !isNum(y)) return null;
    r = isNum(r) && r >= 0 ? r : 0;
    if (!hitClean(it, x, y, r)) return null;
    if (it.k !== 'pen' && it.k !== 'hl') return [];
    const pts = decodePoints(it);
    const R = r + it.s / 2;
    if (pts.length < 2) return [];
    const pieces = [];
    let cur = [pts[0]], prevInside = false, touched = false;
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
    const flush = () => { if (cur.length >= 2) { let len = 0; for (let i = 1; i < cur.length; i++) len += Math.hypot(cur[i].x - cur[i - 1].x, cur[i].y - cur[i - 1].y); if (len > 0.1) pieces.push(cur); } cur = []; };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - x, fy = a.y - y;
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), Cq = fx * fx + fy * fy - R * R;
      let lo = 0, hi = 0, has = false;
      if (A > 1e-12) {
        const disc = B * B - 4 * A * Cq;
        if (disc >= 0) { const sq = Math.sqrt(disc); lo = Math.max(0, (-B - sq) / (2 * A)); hi = Math.min(1, (-B + sq) / (2 * A)); has = lo < hi; }
      } else if (Cq <= 0) { lo = 0; hi = 1; has = true; }
      if (!has) { if (prevInside) cur = [b]; else cur.push(b); prevInside = false; continue; }
      touched = true;
      if (prevInside) lo = 0;
      if (lo > 0) { if (!cur.length) cur.push(a); cur.push(lerp(a, b, lo)); }
      flush();
      if (hi < 1) { cur = [lerp(a, b, hi), b]; prevInside = false; } else prevInside = true;
    }
    flush();
    if (!touched) return null;
    const out = [];
    pieces.forEach((pc) => {
      const q = cleanItem({ id: uid(), l: it.l, k: it.k, c: it.c, o: it.o, s: it.s, pr: it.pr, p: encodePoints(pc, it.pr === 1) }, null, null);
      if (q) out.push(q);
    });
    return out;
  }

  function sampleOf(it) {
    const pl = polylineOf(it);
    const p = pl.pts;
    if (!p.length) return [];
    if (it.k === 'pen' || it.k === 'hl') {
      let total = 0;
      for (let i = 1; i < p.length; i++) total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (p.length < 2 || total < 1e-6) return p.slice(0, 1);
      const step = total / 200, out = [p[0]];
      let carry = 0;
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let at = step - carry;
        while (at <= len) { out.push([a[0] + ((b[0] - a[0]) * at) / len, a[1] + ((b[1] - a[1]) * at) / len]); at += step; }
        carry = len - (at - step);
      }
      return out;
    }
    const out = [];
    const n = p.length, last = pl.closed ? n : n - 1;
    for (let i = 0; i < last; i++) { const a = p[i], b = p[(i + 1) % n]; for (let k = 0; k < 4; k++) out.push([a[0] + ((b[0] - a[0]) * k) / 4, a[1] + ((b[1] - a[1]) * k) / 4]); }
    if (!pl.closed) out.push(p[n - 1]);
    return out;
  }
  function fractionIn(it, test) {
    const s = sampleOf(it);
    if (!s.length) return false;
    let c = 0;
    for (let i = 0; i < s.length; i++) if (test(s[i][0], s[i][1])) c++;
    return c / s.length >= 0.6;
  }
  function inLasso(item, polygon) {
    const it = cleanItem(item, null, null);
    if (!it || !Array.isArray(polygon) || polygon.length < 3) return false;
    const poly = polygon.filter((q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
    if (poly.length < 3) return false;
    return fractionIn(it, (x, y) => pointInPoly(x, y, poly));
  }
  function inRect(item, rect) {
    const it = cleanItem(item, null, null);
    if (!it || !rect || !isNum(rect.x) || !isNum(rect.y) || !isNum(rect.w) || !isNum(rect.h)) return false;
    const x0 = Math.min(rect.x, rect.x + rect.w), x1 = Math.max(rect.x, rect.x + rect.w), y0 = Math.min(rect.y, rect.y + rect.h), y1 = Math.max(rect.y, rect.y + rect.h);
    return fractionIn(it, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  }

  function transform(item, t) {
    const it = cleanItem(item, null, null);
    if (!it) return null;
    const o = t || {};
    const dx = isNum(o.dx) ? o.dx : 0, dy = isNum(o.dy) ? o.dy : 0, sx = isNum(o.sx) ? o.sx : 1, sy = isNum(o.sy) ? o.sy : 1, ox = isNum(o.ox) ? o.ox : 0, oy = isNum(o.oy) ? o.oy : 0;
    const fx = (x) => ox + (x - ox) * sx + dx, fy = (y) => oy + (y - oy) * sy + dy;
    const s = clamp(it.s * Math.min(Math.abs(sx), Math.abs(sy)), LIMITS.SIZE_MIN, LIMITS.SIZE_MAX);
    const out = Object.assign({}, it, { s });
    if (it.k === 'pen' || it.k === 'hl') {
      out.p = encodePoints(decodePoints(it).map((q) => ({ x: fx(q.x), y: fy(q.y), p: q.p })), it.pr === 1);
    } else if (it.k === 'poly') {
      out.pts = it.pts.map((v, i) => (i % 2 ? fy(v) : fx(v)));
    } else { out.x1 = fx(it.x1); out.y1 = fy(it.y1); out.x2 = fx(it.x2); out.y2 = fy(it.y2); }
    return cleanItem(out, null, null);
  }

  /* ====================== recognition ====================== */
  const REC = { MIN_SIZE: 70, SNAP_DEG: 8, GRID: 80 };

  function resample(P, total, n) {
    const out = [P[0]], step = total / (n - 1);
    let acc = 0, i = 1, prev = P[0];
    while (i < P.length && out.length < n - 1) {
      const d = Math.hypot(P[i][0] - prev[0], P[i][1] - prev[1]);
      if (acc + d >= step && d > 0) {
        const t = (step - acc) / d, q = [prev[0] + (P[i][0] - prev[0]) * t, prev[1] + (P[i][1] - prev[1]) * t];
        out.push(q); prev = q; acc = 0;
      } else { acc += d; prev = P[i]; i++; }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  function rdpIdx(P, tol) {
    const n = P.length, keep = [0, n - 1], stack = [[0, n - 1]], t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = segDistSq(P[i][0], P[i][1], P[a][0], P[a][1], P[b][0], P[b][1]); if (d > md) { md = d; mi = i; } }
      if (mi >= 0 && md > t2) { keep.push(mi); stack.push([a, mi], [mi, b]); }
    }
    return keep.sort((x, y) => x - y);
  }
  function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function snapDir(ang) {
    // snap to the axes when within SNAP_DEG
    const q = Math.PI / 2, k = Math.round(ang / q), diff = Math.abs(ang - k * q);
    return diff <= (REC.SNAP_DEG * Math.PI) / 180 ? k * q : ang;
  }
  function lineResult(kind, ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay), ang = snapDir(Math.atan2(by - ay, bx - ax));
    const mx = (ax + bx) / 2, my = (ay + by) / 2, ux = Math.cos(ang) * len / 2, uy = Math.sin(ang) * len / 2;
    return { kind, x1: r1(mx - ux), y1: r1(my - uy), x2: r1(mx + ux), y2: r1(my + uy) };
  }
  function distToPolygon(q, V) {
    let best = Infinity;
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; best = Math.min(best, segDistSq(q[0], q[1], a[0], a[1], b[0], b[1])); }
    return Math.sqrt(best);
  }
  function interiorAngle(prev, cur, next) {
    const ax = prev[0] - cur[0], ay = prev[1] - cur[1], bx = next[0] - cur[0], by = next[1] - cur[1];
    return Math.acos(clamp((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1), -1, 1));
  }

  function recognize(pts) {
    try { return recog(pts); } catch (e) { return null; }
  }
  function recog(input) {
    if (!Array.isArray(input)) return null;
    const P = [];
    for (const q of input) {
      if (!q || !isNum(q.x) || !isNum(q.y)) continue;
      const l = P[P.length - 1];
      if (!l || Math.hypot(q.x - l[0], q.y - l[1]) > 0.05) P.push([q.x, q.y]);
    }
    if (P.length < 4) return null;
    let L = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < P.length; i++) {
      if (i) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]);
    }
    const bw = x1 - x0, bh = y1 - y0, D = Math.hypot(bw, bh);
    if (D < REC.MIN_SIZE || L < REC.MIN_SIZE) return null;
    const R = resample(P, L, REC.GRID);
    const S = R[0], E = R[R.length - 1];
    const chord = Math.hypot(E[0] - S[0], E[1] - S[1]);

    // ---- straight line
    if (chord >= REC.MIN_SIZE && L <= chord * 1.12) {
      let dev = 0;
      const ux = (E[0] - S[0]) / chord, uy = (E[1] - S[1]) / chord;
      for (const q of R) dev = Math.max(dev, Math.abs((q[0] - S[0]) * -uy + (q[1] - S[1]) * ux));
      if (dev <= Math.max(0.05 * chord, 1.5)) return lineResult('line', S[0], S[1], E[0], E[1]);
    }

    // ---- closed shapes
    const gap = chord;
    if (gap <= 0.2 * L && gap <= 0.4 * Math.max(bw, bh)) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = bw / 2, ry = bh / 2;
      if (Math.min(rx, ry) / Math.max(rx, ry) >= 0.3) {
        let sum = 0, sum2 = 0, maxDev = 0, sweep = 0, same = 0, steps = 0, sign = 0;
        const rho = [];
        for (const q of R) { const v = Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry); rho.push(v); sum += v; }
        const m = sum / rho.length;
        for (const v of rho) { sum2 += (v - m) * (v - m); maxDev = Math.max(maxDev, Math.abs(v - 1)); }
        const sd = Math.sqrt(sum2 / rho.length);
        const angs = R.map((q) => Math.atan2((q[1] - cy) / ry, (q[0] - cx) / rx));
        const diffs = [];
        for (let i = 1; i < angs.length; i++) { const d = angleDiff(angs[i - 1], angs[i]); diffs.push(d); sweep += d; }
        sign = sweep >= 0 ? 1 : -1;
        for (const d of diffs) { steps++; if (d * sign >= 0) same++; }
        if (Math.abs(m - 1) <= 0.1 && sd <= 0.08 && maxDev <= 0.22 && Math.abs(sweep) >= 5.4 && Math.abs(sweep) <= 8.6 && same / steps >= 0.95) {
          const asp = rx / ry;
          if (asp >= 0.87 && asp <= 1.15) { const r = (rx + ry) / 2; return { kind: 'ellipse', x1: r1(cx - r), y1: r1(cy - r), x2: r1(cx + r), y2: r1(cy + r) }; }
          return { kind: 'ellipse', x1: r1(x0), y1: r1(y0), x2: r1(x1), y2: r1(y1) };
        }
      }
      return polygonShape(R, P, L, D);
    }

    return arrowShape(P, L, D);
  }

  function polygonShape(R, P, L, D) {
    const idx = rdpIdx(R, 0.035 * D);
    let V = idx.map((i) => R[i]);
    if (V.length > 1 && Math.hypot(V[V.length - 1][0] - V[0][0], V[V.length - 1][1] - V[0][1]) < 0.2 * L) V.pop();
    if (V.length < 3 || V.length > 12) return null;
    const turnOf = (i) => {
      const a = V[(i + V.length - 1) % V.length], b = V[i], c = V[(i + 1) % V.length];
      return Math.PI - interiorAngle(a, b, c);
    };
    while (V.length > 3) {
      let mi = -1, mt = Infinity;
      for (let i = 0; i < V.length; i++) { const t = turnOf(i); if (t < mt) { mt = t; mi = i; } }
      if (mt < 0.55) V.splice(mi, 1); else break;
    }
    if (V.length !== 3 && V.length !== 4) return null;
    // every side long enough, every raw point close to the polygon
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.12 * D) return null; }
    for (const q of R) if (distToPolygon(q, V) > 0.06 * D) return null;
    for (let i = 0; i < V.length; i++) if (turnOf(i) < 0.55) return null;
    if (V.length === 4) {
      for (let i = 0; i < 4; i++) { const ang = interiorAngle(V[(i + 3) % 4], V[i], V[(i + 1) % 4]); if (Math.abs(ang - Math.PI / 2) > 0.45) return null; }
      let sc = 0, ss = 0;
      for (let i = 0; i < 4; i++) { const a = Math.atan2(V[(i + 1) % 4][1] - V[i][1], V[(i + 1) % 4][0] - V[i][0]); sc += Math.cos(4 * a); ss += Math.sin(4 * a); }
      let th = Math.atan2(ss, sc) / 4; // in (-pi/4, pi/4]
      if (Math.abs(th) <= (REC.SNAP_DEG * Math.PI) / 180) th = 0;
      const ux = Math.cos(th), uy = Math.sin(th), A = V.map((q) => q[0] * ux + q[1] * uy), B = V.map((q) => -q[0] * uy + q[1] * ux);
      const two = (arr) => { const s = arr.slice().sort((a, b) => a - b); return [(s[0] + s[1]) / 2, (s[2] + s[3]) / 2]; };
      const [a0, a1] = two(A), [b0, b1] = two(B);
      if (th === 0) return { kind: 'rect', x1: r1(a0), y1: r1(b0), x2: r1(a1), y2: r1(b1) };
      const back = (a, b) => [a * ux - b * uy, a * uy + b * ux];
      const c = [back(a0, b0), back(a1, b0), back(a1, b1), back(a0, b1)];
      return { kind: 'poly', pts: [].concat(...c).map(r1) };
    }
    // triangle: angles not too small; snap a near-right angle
    const ang = V.map((q, i) => interiorAngle(V[(i + 2) % 3], q, V[(i + 1) % 3]));
    if (Math.min(...ang) < 0.4) return null;
    let ri = -1;
    for (let i = 0; i < 3; i++) if (Math.abs(ang[i] - Math.PI / 2) < 0.17) ri = i;
    if (ri >= 0) {
      const Bv = V[ri], Av = V[(ri + 2) % 3], Cv = V[(ri + 1) % 3];
      const la = Math.hypot(Av[0] - Bv[0], Av[1] - Bv[1]), lc = Math.hypot(Cv[0] - Bv[0], Cv[1] - Bv[1]);
      const ua = snapDir(Math.atan2(Av[1] - Bv[1], Av[0] - Bv[0]));
      let vx = -Math.sin(ua), vy = Math.cos(ua);
      if ((Cv[0] - Bv[0]) * vx + (Cv[1] - Bv[1]) * vy < 0) { vx = -vx; vy = -vy; }
      V = [];
      V[ri] = Bv; V[(ri + 2) % 3] = [Bv[0] + Math.cos(ua) * la, Bv[1] + Math.sin(ua) * la]; V[(ri + 1) % 3] = [Bv[0] + vx * lc, Bv[1] + vy * lc];
    }
    return { kind: 'poly', pts: [].concat(...V).map(r1) };
  }

  function arrowShape(P, L, D) {
    const V = rdpIdx(P, 0.04 * D).map((i) => P[i]);
    if (V.length < 4) return null;
    const S = V[0];
    let tip = 1, far = -1;
    for (let i = 1; i < V.length; i++) { const d = Math.hypot(V[i][0] - S[0], V[i][1] - S[1]); if (d > far) { far = d; tip = i; } }
    const T = V[tip], len = far;
    if (len < REC.MIN_SIZE || len < 0.55 * L || L < len * 1.2 || tip >= V.length - 1) return null;
    const ux = (T[0] - S[0]) / len, uy = (T[1] - S[1]) / len;
    for (let i = 1; i < tip; i++) if (Math.abs((V[i][0] - S[0]) * -uy + (V[i][1] - S[1]) * ux) > 0.07 * len) return null;
    let pos = 0, neg = 0;
    for (let i = tip + 1; i < V.length; i++) {
      const dx = V[i][0] - T[0], dy = V[i][1] - T[1], dist = Math.hypot(dx, dy);
      if (dist > 0.5 * len) return null;
      if (dx * ux + dy * uy > 0.05 * len) return null; // the head lies behind the tip
      const perp = dx * -uy + dy * ux;
      pos = Math.max(pos, perp); neg = Math.min(neg, perp);
    }
    if (pos < 0.05 * len || neg > -0.05 * len) return null;
    return lineResult('arrow', S[0], S[1], T[0], T[1]);
  }

  /* ====================== export: SVG / PNG ====================== */
  function exportPlan(props, opts) {
    const v = validate(props);
    if (!v) return null;
    const o = opts || {};
    let only = null;
    if (Array.isArray(o.items)) only = new Set(o.items.filter((s) => typeof s === 'string'));
    else if (o.items instanceof Set) only = o.items;
    const layers = v.layers.filter((l) => !l.hidden).map((l) => ({ id: l.id, items: v.items.filter((it) => it.l === l.id && (!only || only.has(it.id))) }));
    let view = { x: 0, y: 0, w: v.w, h: v.h };
    if (o.crop) {
      const shown = [];
      layers.forEach((l) => l.items.forEach((it) => shown.push(it)));
      if (shown.length) {
        const b = bboxOf(shown), m = 8;
        view = { x: Math.floor(b.x - m), y: Math.floor(b.y - m), w: Math.max(1, Math.ceil(b.w + 2 * m)), h: Math.max(1, Math.ceil(b.h + 2 * m)) };
      }
    }
    return { v, layers, view, background: o.background !== false };
  }

  function toSVG(props, opts) {
    const plan = exportPlan(props, opts);
    if (!plan) return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300" viewBox="0 0 1000 300"></svg>';
    const { v, view } = plan;
    const size = opts && opts.sized === false ? '' : ' width="' + view.w + '" height="' + view.h + '"';
    let s = '<svg xmlns="http://www.w3.org/2000/svg"' + size + ' viewBox="' + view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h + '">';
    if (plan.background) s += backgroundSVG(v.bg, v.w, v.h);
    plan.layers.forEach((l) => { s += '<g data-layer="' + l.id + '">'; l.items.forEach((it) => { s += itemSVGClean(it); }); s += '</g>'; });
    return s + '</svg>';
  }

  function toPNG(props, opts) {
    return new Promise((resolve, reject) => {
      try {
        const o = opts || {};
        const plan = exportPlan(props, o);
        if (!plan) throw new Error('invalid drawing');
        const { view } = plan;
        let scale = clamp(isNum(o.scale) ? o.scale : 2, 0.1, 8);
        scale = Math.min(scale, LIMITS.PNG_MAX_SIDE / Math.max(view.w, view.h), Math.sqrt(LIMITS.PNG_MAX_PIXELS / (view.w * view.h)));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(view.w * scale)); c.height = Math.max(1, Math.round(view.h * scale));
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        const bg = o.background === undefined ? '#ffffff' : o.background;
        if (typeof bg === 'string' && COL_RE.test(bg)) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.scale(c.width / view.w, c.height / view.h);
        ctx.translate(-view.x, -view.y);
        if (o.guides !== false) drawBackground(ctx, plan.v.bg, plan.v.w, plan.v.h);
        plan.layers.forEach((l) => l.items.forEach((it) => drawItemClean(ctx, it)));
        c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
      } catch (e) { reject(e); }
    });
  }

  T4.ink = Object.assign(T4.ink || {}, {
    model: {
      LIMITS, TOOLS_DEFAULT, empty, validate, validateItem: (item) => cleanItem(item, null, null), uid, encodePoints, decodePoints, simplify, makeStroke, makeShape,
      outline, itemPath, itemSVG, backgroundSVG, drawItem, bbox, bboxOf, hit, eraseArea, inLasso, inRect, transform, recognize, toSVG, toPNG,
    },
  });
})();
