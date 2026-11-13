// Editor module "ink" (model): pure functions of T4.ink.model + ink in the Word/HTML export.
// CDP_PORT=9341 node tests/cdp.mjs tests/editor-ink-model.mjs
import { standalone } from './editor-helpers.mjs';

// shared page helpers: seeded noise + synthetic gestures (units; points {x, y, p})
const GEN = `
  const M = T4.ink.model;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const jit = (a) => (rnd() - 0.5) * 2 * a;
  const lin = (x1, y1, x2, y2, n, noise) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n; o.push({ x: x1 + (x2 - x1) * t + jit(noise), y: y1 + (y2 - y1) * t + jit(noise), p: 0.5 }); } return o; };
  const path = (corners, per, noise, close) => { let o = []; const n = corners.length; for (let i = 0; i < (close ? n : n - 1); i++) { const a = corners[i], b = corners[(i + 1) % n]; const s = lin(a[0], a[1], b[0], b[1], per, noise); o = o.concat(i ? s.slice(1) : s); } return o; };
  const circ = (cx, cy, rx, ry, n, noise, sweep) => { const o = []; for (let i = 0; i <= n; i++) { const a = -1.2 + (sweep || 6.4) * i / n; o.push({ x: cx + rx * Math.cos(a) + jit(noise), y: cy + ry * Math.sin(a) + jit(noise), p: 0.5 }); } return o; };
  const wave = (n) => { const o = []; for (let i = 0; i <= n; i++) o.push({ x: 100 + i * 5, y: 200 + Math.sin(i / 3) * 25, p: 0.5 }); return o; };
  const finiteOutline = (poly) => poly.length > 3 && poly.every((q) => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]));
  const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  const segX = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  const selfX = (poly) => { let n = 0; for (let i = 0; i < poly.length; i++) for (let j = i + 2; j < poly.length; j++) { if (i === 0 && j === poly.length - 1) continue; if (segX(poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length])) n++; } return n; };
  const stroke = (pts, extra) => M.makeStroke(pts, Object.assign({ k: 'pen', c: '#112233', s: 3, o: 1, pressure: true, l: 'l1' }, extra || {}));
`;

export async function test(t) {
  const { run } = t;

  await run('model: loaded, API complete', `${GEN}
    const names = ['LIMITS','TOOLS_DEFAULT','empty','validate','uid','encodePoints','decodePoints','simplify','makeStroke','makeShape','outline','itemPath','itemSVG','backgroundSVG','drawItem','bbox','bboxOf','hit','eraseArea','inLasso','inRect','transform','recognize','toSVG','toPNG'];
    ok(names.every((n) => M[n] !== undefined), 'all contract functions exist: ' + names.filter((n) => M[n] === undefined).join(','));
    ok(M.LIMITS.ITEMS === 5000 && M.LIMITS.POINTS === 5000 && M.LIMITS.LAYERS === 8, 'LIMITS');
    ok(M.TOOLS_DEFAULT.pen && M.TOOLS_DEFAULT.hl && M.TOOLS_DEFAULT.eraser && M.TOOLS_DEFAULT.shape, 'TOOLS_DEFAULT');
    const ids = new Set(); for (let i = 0; i < 500; i++) ids.add(M.uid());
    ok(ids.size === 500 && [...ids].every((i) => /^[A-Za-z0-9_-]{1,24}$/.test(i)), 'uid unique + simple');
    const e = M.empty({ w: 800, h: 400, bg: 'grid', overlay: true, al: 'left' });
    ok(e.w === 800 && e.h === 400 && e.bg === 'grid' && e.overlay === true && e.al === 'left' && e.layers.length === 1 && e.items.length === 0 && /^[A-Za-z0-9_-]{1,24}$/.test(e.id), 'empty(opts)');
    const e2 = M.empty(); ok(e2.w === 1000 && e2.h === 300 && e2.bg === 'none' && e2.al === 'center' && e2.overlay === false, 'empty() defaults');
  `);

  await run('model: codec round trip', `${GEN}
    const pts = [{ x: 10.5, y: 20.1, p: 0.3 }, { x: 11.2, y: 25, p: 0.9 }, { x: 8, y: 30.4, p: 0 }, { x: 100, y: 7, p: 1 }];
    const e1 = M.encodePoints(pts, true);
    ok(e1.length === 12 && e1[0] === 105 && e1[1] === 201 && e1[2] === 30 && e1[3] === 7 && e1[5] === 60, 'pressure encoding is delta + tenths: ' + e1.join(','));
    const d1 = M.decodePoints({ pr: 1, p: e1 });
    ok(d1.length === 4 && Math.abs(d1[2].x - 8) < 0.051 && Math.abs(d1[3].y - 7) < 0.051 && Math.abs(d1[1].p - 0.9) < 0.011 && d1[3].p === 1, 'pressure round trip');
    const e0 = M.encodePoints(pts, false);
    ok(e0.length === 8 && M.decodePoints({ pr: 0, p: e0 }).every((q, i) => Math.abs(q.x - pts[i].x) < 0.051 && Math.abs(q.y - pts[i].y) < 0.051 && q.p === 0.5), 'no-pressure round trip, p = 0.5');
    ok(M.decodePoints({ pr: 0, p: 'x' }).length === 0 && M.decodePoints(null).length === 0 && M.encodePoints(null, true).length === 0, 'codec tolerates garbage');
    const big = []; for (let i = 0; i < 6000; i++) big.push({ x: i, y: i, p: 0.5 });
    ok(M.encodePoints(big, false).length === 2 * 5000, 'encode capped at POINTS');
    ok(M.encodePoints([{ x: 1e9, y: -1e9 }], false).every((v) => Math.abs(v) <= 300000), 'encode clamps coordinates');
  `);

  await run('model: validate (good input)', `${GEN}
    const s1 = stroke(lin(10, 10, 200, 90, 30, 0.2));
    const sh = M.makeShape('rect', 20, 30, 120, 100, { c: '#ff0000', f: '#00ff00', l: 'l1' });
    const props = { v: 1, id: 'abc', w: 700, h: 500, al: 'right', bg: 'lines', overlay: true, layers: [{ id: 'l1', name: 'Base', hidden: false, locked: false }, { id: 'l2', name: '', hidden: true, locked: true }], items: [s1, Object.assign({}, sh, { l: 'l2' })] };
    const v = M.validate(props);
    ok(v && v.id === 'abc' && v.w === 700 && v.h === 500 && v.al === 'right' && v.bg === 'lines' && v.overlay === true, 'props kept');
    ok(v.layers.length === 2 && v.layers[1].hidden === true && v.layers[1].locked === true && v.layers[0].name === 'Base', 'layers kept');
    ok(v.items.length === 2 && v.items[0].id === s1.id && JSON.stringify(v.items[0].p) === JSON.stringify(s1.p) && v.items[1].k === 'rect' && v.items[1].f === '#00ff00' && v.items[1].l === 'l2', 'items kept');
    ok(JSON.stringify(M.validate(v)) === JSON.stringify(v), 'validate is idempotent');
    ok(v !== props && v.items[0] !== s1, 'validate returns a copy');
    ok(M.validate({}) && M.validate({}).layers.length === 1 && M.validate({}).w === 1000, 'empty object gives a default canvas');
    const poly = M.makeShape('tri', 10, 10, 110, 90, {});
    ok(poly.k === 'poly' && poly.pts.length === 6, 'tri makes a poly');
    ok(['line','arrow','ellipse'].every((k) => M.validate({ items: [M.makeShape(k, 5, 5, 50, 80, {})] }).items.length === 1), 'shapes survive validation');
  `);

  await run('model: validate (hostile input never throws)', `${GEN}
    const evil = [null, undefined, 0, 1, 'x', true, [], [[]], () => 1, Symbol('s'),
      { items: 'x', layers: 5 }, { items: [null, 1, 'x', [], {}, { k: 'pen' }, { k: 'pen', p: [NaN, 1] }, { k: 'pen', p: [1, Infinity] }, { k: '__proto__' }, { k: 'rect', x1: 'a' }] },
      { w: NaN, h: Infinity, al: '<script>', bg: '"><img src=x onerror=alert(1)>', layers: [null, 5, { id: '<svg onload=1>' }, { id: 'ok', name: 'a\\u0000b\\nc' + 'x'.repeat(500) }] },
      JSON.parse('{"__proto__":{"polluted":1},"items":[{"k":"pen","p":[0,0],"__proto__":{"x":1}}]}'),
      { get items() { throw new Error('boom'); } },
      new Proxy({}, { get() { throw new Error('proxy'); } })];
    let threw = 0; const res = [];
    for (const e of evil) { try { res.push(M.validate(e)); } catch (err) { threw++; } }
    ok(threw === 0, 'validate never throws on hostile input (' + threw + ' threw)');
    ok(res[0] === null && res[1] === null && res[2] === null && res[4] === null && res[8] === null, 'non-objects → null');
    ok(({}).polluted === undefined, 'no prototype pollution');
    const v = M.validate(evil[12]);
    ok(v && v.w === 1000 && v.h === 300 && v.al === 'center' && v.bg === 'none', 'bad enums/numbers → defaults/clamped: w=' + (v && v.w) + ' h=' + (v && v.h));
    ok(v.layers.every((l) => /^[A-Za-z0-9_-]{1,24}$/.test(l.id)) && v.layers.some((l) => l.id === 'ok'), 'layer ids sanitised');
    const nm = v.layers.find((l) => l.id === 'ok').name; ok(nm.length <= 40 && !/[\\u0000-\\u001f]/.test(nm), 'layer name capped, no control chars');
    ok(M.validate(evil[11]).items.length === 0, 'broken items dropped');
    // colours / numbers / ids
    const it = M.validate({ items: [{ id: 'a"b', l: 'zzz', k: 'pen', c: 'red', o: 99, s: -5, pr: 0, p: [0, 0, 5, 5] }, { id: 'ok1', k: 'hl', c: '#ABCDEF', o: 0, s: 1e9, p: [0, 0, 1, 1] }, { id: 'ok1', k: 'line', c: 'url(#x)', x1: 0, y1: 0, x2: 1e12, y2: -1e12, f: 'red' }] }).items;
    ok(it.length === 3 && it[0].c === '#1a1a1a' && it[0].o === 1 && it[0].s === 0.5, 'bad colour → default, o/s clamped');
    ok(it[1].c === '#abcdef' && it[1].o === 0.05 && it[1].s === 60, 'hex lower-cased, clamped');
    ok(it[2].c === '#1a1a1a' && it[2].x2 === 30000 && it[2].y2 === -2000 && it[2].f === 'none', 'shape coordinates clamped');
    ok(new Set(it.map((i) => i.id)).size === 3 && it.every((i) => /^[A-Za-z0-9_-]{1,24}$/.test(i.id)), 'item ids simple and unique');
    ok(it.every((i) => i.l === 'l1'), 'unknown layer → first layer');
    // string / array typed numbers are refused
    ok(M.validate({ items: [{ k: 'line', x1: '1', y1: '2', x2: '3', y2: '4' }] }).items.length === 0, 'numeric strings refused');
    // pressure bounds + giant deltas
    const pr = M.validate({ items: [{ k: 'pen', pr: 1, p: [0, 0, 500, 5, 5, 500, 1e15, 1e15, -1e15] }] }).items[0];
    ok(pr && M.decodePoints(pr).every((q) => q.p >= 0 && q.p <= 1 && Math.abs(q.x) <= 30000 && Math.abs(q.y) <= 30000), 'pressure + giant deltas clamped');
    // oversized
    const many = []; for (let i = 0; i < 9000; i++) many.push({ id: 'i' + i, k: 'line', x1: 0, y1: 0, x2: 10, y2: 10 });
    ok(M.validate({ items: many }).items.length === 5000, 'items capped at 5000');
    const layers9 = []; for (let i = 0; i < 20; i++) layers9.push({ id: 'L' + i });
    ok(M.validate({ layers: layers9 }).layers.length === 8, 'layers capped at 8');
    const longP = []; for (let i = 0; i < 20000; i++) longP.push(1);
    ok(M.decodePoints(M.validate({ items: [{ k: 'pen', pr: 0, p: longP }] }).items[0]).length === 5000, 'points capped at 5000');
    const heavy = []; for (let i = 0; i < 400; i++) { const p = []; for (let j = 0; j < 5000; j++) p.push(1, 1); heavy.push({ k: 'pen', pr: 0, p }); }
    const t0 = performance.now(); const hv = M.validate({ items: heavy }); const dt = performance.now() - t0;
    ok(JSON.stringify(hv).length < 2 * 1024 * 1024, 'output stays below 2 MB JSON (' + JSON.stringify(hv).length + ')');
    ok(dt < 1500, 'validate of a huge input is fast enough (' + Math.round(dt) + ' ms)');
    // duplicate layers, poly
    const dl = M.validate({ layers: [{ id: 'a' }, { id: 'a' }], items: [{ k: 'poly', pts: [0, 0, 10, 0, 5, 9, 'x'], c: '#000000' }, { k: 'poly', pts: [0, 0, 1, 1] }, { k: 'poly', pts: Array.from({ length: 40 }, (_, i) => i) }] });
    ok(dl.layers.length === 2 && dl.layers[0].id !== dl.layers[1].id, 'duplicate layer ids made unique');
    ok(dl.items.length === 2 && dl.items[0].pts.length === 6 && dl.items[1].pts.length === 24, 'too short poly dropped, long poly capped to 12 vertices');
  `);

  await run('model: simplify, makeStroke, makeShape', `${GEN}
    const dense = lin(0, 0, 200, 0, 400, 0.1);
    const sp = M.simplify(dense, 0.35);
    ok(sp.length === 2 && Math.abs(sp[0].x) < 0.2 && Math.abs(sp[1].x - 200) < 0.2, 'straight noisy line collapses to its ends (' + sp.length + ')');
    const corner = M.simplify(path([[0, 0], [100, 0], [100, 100]], 100, 0.05, false), 0.35);
    ok(corner.length === 3 && Math.abs(corner[1].x - 100) < 1.5, 'corner is kept');
    const pr = M.simplify([{ x: 0, y: 0, p: 0.2 }, { x: 5, y: 0.1, p: 0.8 }, { x: 10, y: 0, p: 0.4 }, { x: 10, y: 40, p: 0.9 }], 0.35);
    ok(pr.length >= 3 && pr[0].p === 0.2 && pr[pr.length - 1].p === 0.9, 'pressure preserved');
    ok(M.simplify([], 1).length === 0 && M.simplify([{ x: 1, y: 2, p: 1 }], 1).length === 1 && M.simplify(null, 1).length === 0, 'degenerate input');
    const loop = circ(100, 100, 50, 50, 200, 0, 6.28);
    ok(M.simplify(loop, 0.35).length > 8, 'closed loop is not collapsed');
    const s = stroke(wave(120));
    ok(s.k === 'pen' && s.pr === 1 && s.p.length < 120 * 3 && s.p.length % 3 === 0 && s.l === 'l1' && s.c === '#112233', 'makeStroke: simplified + pressure item');
    const h = M.makeStroke(wave(60), { k: 'hl', c: '#ffff00' });
    ok(h.k === 'hl' && h.pr === 0 && h.o === 0.35 && h.s === M.TOOLS_DEFAULT.hl.s, 'highlighter: constant width, default opacity');
    const dot = M.makeStroke([{ x: 5, y: 5, p: 0.5 }], {});
    ok(dot && dot.p.length >= 2 && M.decodePoints(dot).length === 1, 'single point stroke (tap)');
    ok(M.makeStroke([], {}) === null && M.makeStroke([{ x: NaN, y: 1 }], {}) === null, 'no valid points → null');
    const longs = []; for (let i = 0; i < 8000; i++) longs.push({ x: i * 0.2, y: Math.sin(i) * 3 + (i % 7), p: 0.5 });
    ok(M.decodePoints(M.makeStroke(longs, {})).length <= 5000, 'makeStroke respects POINTS');
    const sq = M.makeShape('rect', 10, 10, 90, 40, {}, { constrain: true });
    ok(Math.abs(sq.x2 - sq.x1) === Math.abs(sq.y2 - sq.y1), 'constrain: square');
    const ci = M.makeShape('ellipse', 50, 50, 10, 30, {}, { constrain: true });
    ok(Math.abs(ci.x2 - ci.x1 - (ci.y2 - ci.y1)) < 0.11, 'constrain: circle');
    const ln = M.makeShape('line', 0, 0, 100, 30, {}, { constrain: true });
    const ang = Math.atan2(ln.y2 - ln.y1, ln.x2 - ln.x1) * 180 / Math.PI;
    ok(Math.abs(ang - 15) < 0.5 && Math.abs(Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1) - Math.hypot(100, 30)) < 0.3, 'constrain: 15 degree steps (' + ang.toFixed(1) + ')');
    const ar = M.makeShape('arrow', 0, 0, 100, 4, { c: '#ff0000', s: 4 }, { constrain: true });
    ok(ar.k === 'arrow' && Math.abs(ar.y2) < 0.2 && ar.c === '#ff0000' && ar.s === 4, 'arrow keeps style, snaps to horizontal');
    ok(M.makeShape('nonsense', 0, 0, 1, 1, {}) === null && M.makeShape('line', NaN, 0, 1, 1, {}) === null, 'bad shape kind / numbers → null');
  `);

  await run('model: outline', `${GEN}
    const o1 = M.outline(wave(80), { size: 4, pressure: false });
    ok(finiteOutline(o1), 'wave outline finite (' + o1.length + ' points)');
    const bb = o1.reduce((a, q) => ({ x0: Math.min(a.x0, q[0]), x1: Math.max(a.x1, q[0]), y0: Math.min(a.y0, q[1]), y1: Math.max(a.y1, q[1]) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
    ok(bb.x0 < 100 && bb.x0 > 97 && bb.x1 > 500 && bb.x1 < 503.5, 'round caps extend half a width beyond the ends: ' + bb.x0.toFixed(2) + '..' + bb.x1.toFixed(2));
    const dotO = M.outline([{ x: 50, y: 60, p: 0.5 }], { size: 10 });
    const dc = dotO.reduce((a, q) => [a[0] + q[0] / dotO.length, a[1] + q[1] / dotO.length], [0, 0]);
    ok(finiteOutline(dotO) && Math.abs(dc[0] - 50) < 0.2 && Math.abs(dc[1] - 60) < 0.2 && dotO.every((q) => Math.abs(Math.hypot(q[0] - 50, q[1] - 60) - 5) < 0.05), 'single point gives a round dot of radius size/2');
    ok(Math.abs(area(dotO) - Math.PI * 25) < 3, 'dot area');
    const tap2 = M.outline([{ x: 50, y: 60, p: 0.5 }, { x: 50.01, y: 60.01, p: 0.5 }], { size: 10 });
    ok(finiteOutline(tap2) && area(tap2) > 60, 'two coincident points still a dot');
    ok(M.outline([], { size: 3 }).length === 0 && M.outline(null, {}).length === 0, 'empty input → []');
    ok(finiteOutline(M.outline([{ x: NaN, y: 1 }, { x: 1, y: 1 }, { x: 20, y: 5 }], { size: 3 })), 'non-finite points are skipped');
    // straight line: area ~ length*width + cap area
    const line = M.outline([{ x: 0, y: 0, p: 0.5 }, { x: 100, y: 0, p: 0.5 }], { size: 6, pressure: false });
    ok(Math.abs(area(line) - (100 * 6 + Math.PI * 9)) < 4, 'straight stroke area: ' + area(line).toFixed(1));
    // pressure: thick end vs thin end
    const pp = []; for (let i = 0; i <= 40; i++) pp.push({ x: i * 4, y: 0, p: i / 40 });
    const po = M.outline(pp, { size: 10, pressure: true });
    const wAt = (x) => { const ys = po.filter((q) => Math.abs(q[0] - x) < 3).map((q) => q[1]); return Math.max(...ys) - Math.min(...ys); };
    ok(wAt(140) > wAt(20) * 1.8, 'width follows pressure (' + wAt(20).toFixed(1) + ' → ' + wAt(140).toFixed(1) + ')');
    const flat = M.outline(pp, { size: 10, pressure: false });
    ok(Math.abs(Math.max(...flat.filter((q) => q[0] > 20 && q[0] < 140).map((q) => q[1])) - 5) < 0.2, 'pressure off: constant width');
    // sharp turns: no self intersections, finite
    const zig = []; for (let i = 0; i <= 10; i++) zig.push({ x: i * 10, y: i % 2 ? 40 : 0, p: 0.5 });
    const zo = M.outline(zig, { size: 8, pressure: false });
    ok(finiteOutline(zo) && selfX(zo) === 0, 'sharp zigzag outline has no self intersections (' + selfX(zo) + ')');
    const hair = M.outline([{ x: 0, y: 0, p: 0.5 }, { x: 60, y: 0, p: 0.5 }, { x: 0, y: 1, p: 0.5 }], { size: 6, pressure: false });
    ok(finiteOutline(hair) && selfX(hair) <= 2, 'hairpin turn is finite and nearly clean (' + selfX(hair) + ')');
    const rect4 = M.outline(path([[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]], 4, 0, false), { size: 6, pressure: false });
    ok(finiteOutline(rect4), 'square corners');
    const sp = []; for (let i = 0; i <= 200; i++) { const a = i * 0.12, r = 5 + i * 0.4; sp.push({ x: 150 + r * Math.cos(a), y: 150 + r * Math.sin(a), p: 0.4 + 0.4 * Math.sin(i / 9) }); }
    const so = M.outline(sp, { size: 5, pressure: true });
    ok(finiteOutline(so) && selfX(so) === 0, 'spiral with changing pressure is clean (' + selfX(so) + ')');
    const noisy = []; for (let i = 0; i <= 300; i++) noisy.push({ x: i, y: 20 + jit(0.3), p: 0.5 + jit(0.05) });
    ok(finiteOutline(M.outline(noisy, { size: 4, pressure: true })), 'dense noisy input');
    ok(M.outline(wave(400), { size: 3, pressure: false }).length < 2500, 'outline stays compact');
    const sparse = M.outline([{ x: 0, y: 0, p: 0.5 }, { x: 900, y: 0, p: 0.5 }], { size: 3, pressure: false });
    ok(sparse.length < 60, 'a long straight stroke has few vertices (' + sparse.length + ')');
    // path
    const d = M.itemPath(stroke(wave(60)));
    ok(/^M[-\\d. ]+Q[-\\d. ]+Z$/.test(d), 'itemPath is a closed path: ' + d.slice(0, 40));
  `);

  await run('model: bbox, hit', `${GEN}
    const s = stroke(lin(100, 100, 200, 100, 10, 0), { s: 10, pressure: false });
    const b = M.bbox(s);
    ok(Math.abs(b.x - 95) < 0.2 && Math.abs(b.w - 110) < 0.3 && Math.abs(b.y - 95) < 0.2 && Math.abs(b.h - 10) < 0.3, 'stroke bbox includes the width: ' + JSON.stringify(b));
    const sh = M.makeShape('rect', 10, 20, 60, 80, { s: 4 });
    const bs = M.bbox(sh); ok(Math.abs(bs.x - 8) < 0.01 && Math.abs(bs.w - 54) < 0.01 && Math.abs(bs.h - 64) < 0.01, 'shape bbox');
    const bo = M.bboxOf([s, sh]); ok(bo.x <= 8 && bo.x + bo.w >= 205 && bo.y <= 18 && bo.y + bo.h >= 102, 'bboxOf union');
    const be = M.bboxOf([]); ok(be && be.w === 0 && be.h === 0, 'bboxOf([]) is an empty box');
    ok(M.hit(s, 150, 100, 1) && M.hit(s, 150, 104, 1) && !M.hit(s, 150, 110, 1) && M.hit(s, 150, 110, 6) && !M.hit(s, 150, 300, 5), 'stroke hit uses width + radius');
    ok(M.hit(s, 98, 100, 0) && !M.hit(s, 80, 100, 3), 'hit near the stroke end');
    ok(M.hit(sh, 10, 50, 1) && !M.hit(sh, 35, 50, 1), 'unfilled rect: only its outline');
    const fl = M.makeShape('rect', 10, 20, 60, 80, { f: '#ff0000' }); ok(M.hit(fl, 35, 50, 1), 'filled rect: inside hits');
    const ar = M.makeShape('arrow', 0, 0, 100, 0, { s: 3 }); ok(M.hit(ar, 50, 1, 1) && M.hit(ar, 92, 6, 1) && !M.hit(ar, 50, 30, 2), 'arrow hit incl. head');
    const el = M.makeShape('ellipse', 0, 0, 100, 60, {}); ok(M.hit(el, 100, 30, 1) && !M.hit(el, 50, 30, 1) && M.hit(el, 50, 0, 1), 'ellipse outline hit');
    const tri = M.makeShape('tri', 0, 0, 100, 80, {}); ok(M.hit(tri, 50, 0, 1) && M.hit(tri, 50, 80, 1) && !M.hit(tri, 50, 40, 1), 'triangle (poly) hit');
    const dt = M.makeStroke([{ x: 5, y: 5, p: 0.5 }], { s: 6, pressure: false }); ok(M.hit(dt, 7, 5, 0) && !M.hit(dt, 20, 5, 2), 'dot hit');
    ok(M.hit(null, 1, 1, 1) === false && M.hit({}, 1, 1, 1) === false && M.hit(s, NaN, 1, 1) === false, 'hit tolerates garbage');
  `);

  await run('model: eraseArea', `${GEN}
    const s = stroke(lin(0, 100, 300, 100, 60, 0), { s: 4, pressure: true });
    const mid = M.eraseArea(s, 150, 100, 10);
    ok(Array.isArray(mid) && mid.length === 2, 'middle hit → 2 fragments');
    const bs = mid.map((f) => M.bbox(f));
    const [fa, fb] = mid.map((f) => M.decodePoints(f)).sort((a, b) => a[0].x - b[0].x);
    ok(Math.abs(fa[fa.length - 1].x - 138) < 0.3 && Math.abs(fb[0].x - 162) < 0.3, 'cut at R = r + size/2: ' + fa[fa.length - 1].x + ' / ' + fb[0].x);
    ok(mid.every((f) => f.id !== s.id && f.k === s.k && f.c === s.c && f.s === s.s && f.o === s.o && f.pr === 1 && f.l === s.l) && mid[0].id !== mid[1].id, 'fragments: new ids, same style, keep pressure');
    const wp = M.makeStroke([{ x: 0, y: 0, p: 0.1 }, { x: 100, y: 0, p: 0.9 }], { s: 4, pressure: true });
    const wf = M.eraseArea(wp, 50, 0, 5);
    ok(wf.length === 2 && Math.abs(M.decodePoints(wf[0])[1].p - 0.5 + 0.0) < 0.2 && M.decodePoints(wf[0])[1].p < 0.5 && M.decodePoints(wf[1])[0].p > 0.5, 'pressure interpolated at the cut');
    const end = M.eraseArea(s, 3, 100, 8);
    ok(end.length === 1 && M.decodePoints(end[0])[0].x > 5, 'end hit → 1 fragment');
    ok(M.eraseArea(s, 150, 160, 10) === null, 'miss → null');
    const all = M.eraseArea(s, 150, 100, 400);
    ok(Array.isArray(all) && all.length === 0, 'full hit → []');
    const l2 = M.eraseArea(s, 100, 100, 5); const l3 = M.eraseArea(l2.sort((a, b) => M.bbox(a).x - M.bbox(b).x)[1], 200, 100, 5);
    ok(l2.length === 2 && l3.length === 2, 'erasing again splits further');
    const poly = stroke(path([[0, 0], [100, 0], [100, 100]], 20, 0, false), { pressure: false, s: 3 });
    const cutc = M.eraseArea(poly, 100, 0, 8);
    ok(cutc.length === 2, 'cutting a corner gives two pieces');
    const sh = M.makeShape('rect', 0, 0, 50, 50, {});
    ok(M.eraseArea(sh, 25, 0, 3).length === 0 && M.eraseArea(sh, 25, 25, 3) === null, 'shape: [] when touched, null otherwise');
    const dt = M.makeStroke([{ x: 5, y: 5, p: 0.5 }], { s: 4, pressure: false });
    ok(M.eraseArea(dt, 5, 5, 3).length === 0 && M.eraseArea(dt, 50, 5, 3) === null, 'dot is erased whole');
    ok(M.eraseArea(null, 1, 1, 1) === null, 'garbage → null');
  `);

  await run('model: inLasso, inRect, transform', `${GEN}
    const s = stroke(lin(100, 100, 200, 100, 20, 0), { s: 3 });
    const box = [[90, 80], [210, 80], [210, 120], [90, 120]];
    ok(M.inLasso(s, box) && !M.inLasso(s, [[300, 0], [400, 0], [400, 50]]), 'lasso around / away');
    ok(M.inLasso(s, [[90, 80], [160, 80], [160, 120], [90, 120]]) === false, 'only half inside → no');
    ok(M.inLasso(s, [[90, 80], [180, 80], [180, 120], [90, 120]]) === true, '80 % inside → yes');
    ok(M.inRect(s, { x: 90, y: 80, w: 130, h: 40 }) && !M.inRect(s, { x: 0, y: 0, w: 50, h: 50 }), 'inRect');
    ok(M.inLasso(M.makeShape('rect', 100, 100, 150, 150, {}), box.map((q) => [q[0], q[1] + 100])) === false || true, 'shape lasso runs');
    ok(M.inLasso(M.makeShape('rect', 100, 100, 150, 150, {}), [[90, 90], [160, 90], [160, 160], [90, 160]]), 'shape inside lasso');
    ok(!M.inLasso(s, []) && !M.inLasso(s, null) && !M.inLasso(null, box), 'lasso tolerates garbage');
    const moved = M.transform(s, { dx: 10, dy: -20 });
    const mp = M.decodePoints(moved), op = M.decodePoints(s);
    ok(moved.id === s.id && Math.abs(mp[0].x - op[0].x - 10) < 0.11 && Math.abs(mp[0].y - op[0].y + 20) < 0.11 && moved.s === s.s && JSON.stringify(M.decodePoints(moved).map((q) => q.p)) === JSON.stringify(op.map((q) => q.p)), 'translate keeps id, size, pressure');
    const sc = M.transform(s, { sx: 2, sy: 3, ox: 100, oy: 100 });
    const sp = M.decodePoints(sc);
    ok(Math.abs(sp[0].x - 100) < 0.11 && Math.abs(sp[sp.length - 1].x - 300) < 0.11 && Math.abs(sp[0].y - 100) < 0.11 && Math.abs(sc.s - s.s * 2) < 1e-9, 'scale about origin, size follows min(sx, sy)');
    ok(M.transform(s, { sx: 0.1, sy: 0.1 }).s === 0.5, 'size clamps at the minimum');
    const sh = M.makeShape('ellipse', 10, 10, 50, 40, {});
    const fl = M.transform(sh, { sx: -1, ox: 30 });
    ok(fl.x1 === 10 && fl.x2 === 50, 'flipped ellipse stays normalised');
    const tr = M.transform(M.makeShape('tri', 0, 0, 100, 100, {}), { dx: 5, dy: 5, sx: 0.5, sy: 0.5 });
    ok(tr.pts.length === 6 && tr.pts[0] === 30 && tr.pts[1] === 5, 'poly transform');
    ok(M.transform(null, {}) === null, 'transform(null) → null');
    ok(M.transform(s, {}).p.join() === s.p.join(), 'identity transform keeps the points');
  `);

  await run('model: recognize (shapes are recognised)', `${GEN}
    const r1 = M.recognize(lin(100, 100, 400, 108, 60, 1.2));
    ok(r1 && r1.kind === 'line' && r1.y1 === r1.y2 && Math.abs(r1.x2 - r1.x1 - 300) < 6, 'near-horizontal line snaps to horizontal: ' + JSON.stringify(r1));
    const r2 = M.recognize(lin(300, 80, 306, 380, 60, 1.2));
    ok(r2 && r2.kind === 'line' && r2.x1 === r2.x2 && Math.abs(r2.y2 - r2.y1 - 300) < 6, 'near-vertical line snaps to vertical');
    const r3 = M.recognize(lin(100, 100, 400, 300, 60, 1.5));
    ok(r3 && r3.kind === 'line' && Math.abs(r3.y2 - r3.y1) > 150 && Math.abs(r3.x2 - r3.x1) > 250, 'diagonal line stays diagonal');
    const r3b = M.recognize(lin(400, 300, 100, 100, 60, 1.5));
    ok(r3b && r3b.kind === 'line' && r3b.x1 > r3b.x2, 'direction of the stroke is kept');
    // arrow: shaft then head
    const shaft = lin(100, 200, 400, 204, 50, 1); const tip = [400, 204];
    const head = lin(tip[0], tip[1], 370, 180, 8, 0.8).concat(lin(370, 180, tip[0], tip[1], 8, 0.8).slice(1), lin(tip[0], tip[1], 370, 228, 8, 0.8).slice(1));
    const ra = M.recognize(shaft.concat(head));
    ok(ra && ra.kind === 'arrow' && ra.y1 === ra.y2 && Math.abs(ra.x2 - 400) < 6 && Math.abs(ra.x1 - 100) < 6, 'arrow (shaft + head) recognised: ' + JSON.stringify(ra));
    // rectangle
    const rr = M.recognize(path([[100, 100], [400, 104], [398, 300], [102, 296]], 30, 1.5, true));
    ok(rr && rr.kind === 'rect' && Math.abs(rr.x1 - 100) < 6 && Math.abs(rr.x2 - 400) < 6 && Math.abs(rr.y1 - 100) < 6 && Math.abs(rr.y2 - 298) < 6, 'rectangle recognised and snapped: ' + JSON.stringify(rr));
    const rr2 = M.recognize(path([[100, 100], [400, 100], [400, 300], [100, 300], [100, 150]], 30, 1.2, false));
    ok(rr2 && rr2.kind === 'rect', 'rectangle with overshoot at the start recognised');
    const rr3 = M.recognize(path([[250, 100], [400, 100], [400, 300], [100, 300], [100, 100], [250, 100]], 25, 1, false));
    ok(rr3 && rr3.kind === 'rect', 'rectangle started mid-edge recognised');
    // rotated rectangle -> poly with right angles
    const rot = (a, [x, y]) => [250 + (x - 250) * Math.cos(a) - (y - 200) * Math.sin(a), 200 + (x - 250) * Math.sin(a) + (y - 200) * Math.cos(a)];
    const rr4 = M.recognize(path([[100, 120], [400, 120], [400, 280], [100, 280]].map((c) => rot(0.5, c)), 30, 1, true));
    ok(rr4 && rr4.kind === 'poly' && rr4.pts.length === 8, 'rotated rectangle becomes a poly: ' + JSON.stringify(rr4));
    if (rr4 && rr4.pts.length === 8) { const p = rr4.pts; const dot = (p[2] - p[0]) * (p[4] - p[2]) + (p[3] - p[1]) * (p[5] - p[3]); const l1 = Math.hypot(p[2] - p[0], p[3] - p[1]), l2 = Math.hypot(p[4] - p[2], p[5] - p[3]); ok(Math.abs(dot) / (l1 * l2) < 0.005, 'rotated rectangle has right angles'); }
    // circle / ellipse
    const rc = M.recognize(circ(300, 250, 90, 88, 80, 1.5));
    ok(rc && rc.kind === 'ellipse' && Math.abs(rc.x2 - rc.x1 - (rc.y2 - rc.y1)) < 0.2 && Math.abs((rc.x1 + rc.x2) / 2 - 300) < 6 && Math.abs(rc.x2 - rc.x1 - 178) < 10, 'circle recognised (square box): ' + JSON.stringify(rc));
    const re = M.recognize(circ(300, 250, 160, 70, 100, 1.5));
    ok(re && re.kind === 'ellipse' && Math.abs(re.x2 - re.x1 - 320) < 12 && Math.abs(re.y2 - re.y1 - 140) < 10, 'ellipse recognised: ' + JSON.stringify(re));
    const rc2 = M.recognize(circ(300, 250, 90, 90, 80, 1.5, 6.9));
    ok(rc2 && rc2.kind === 'ellipse', 'circle with overlapping ends recognised');
    // triangle
    const rt = M.recognize(path([[200, 100], [380, 330], [60, 300]], 30, 1.5, true));
    ok(rt && rt.kind === 'poly' && rt.pts.length === 6, 'triangle recognised: ' + JSON.stringify(rt));
    const rtr = M.recognize(path([[100, 100], [100, 300], [350, 300]], 30, 1.2, true));
    ok(rtr && rtr.kind === 'poly' && rtr.pts.length === 6 && rtr.pts[0] === rtr.pts[2] && rtr.pts[3] === rtr.pts[5], 'right triangle gets a snapped right angle: ' + JSON.stringify(rtr));
    // recognised shape can become an item
    const mk = M.makeShape(r1.kind, r1.x1, r1.y1, r1.x2, r1.y2, {});
    ok(mk && mk.k === 'line', 'recognition result feeds makeShape');
    ok(M.validate({ items: [M.makeShape('tri', 0, 0, 10, 10, {})] }).items.length === 1 && M.validate({ items: [Object.assign({ id: 'q1', l: 'l1', k: 'poly', c: '#000000', o: 1, s: 2, f: 'none' }, { pts: rt.pts })] }).items.length === 1, 'poly result validates');
  `);

  await run('model: recognize (handwriting stays null)', `${GEN}
    const cases = {
      'zigzag (m)': path([[100, 200], [120, 120], [140, 200], [160, 120], [180, 200], [200, 120], [220, 200]], 12, 1.5, false),
      'wide zigzag': path([[100, 100], [300, 180], [120, 220], [320, 300], [140, 340]], 20, 1.5, false),
      'sine wave': wave(120),
      'big sine': (() => { const o = []; for (let i = 0; i <= 120; i++) o.push({ x: 100 + i * 4, y: 200 + Math.sin(i / 8) * 60, p: 0.5 }); return o; })(),
      'S curve': (() => { const o = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * 6.28; o.push({ x: 200 + Math.sin(a) * 40, y: 100 + i * 2.5, p: 0.5 }); } return o; })(),
      'check mark': path([[100, 200], [140, 250], [260, 100]], 20, 1, false),
      'letter L': path([[100, 100], [100, 300], [250, 300]], 25, 1, false),
      'letter Z': path([[100, 100], [250, 100], [100, 300], [250, 300]], 25, 1, false),
      'letter U': (() => { const o = []; for (let i = 0; i <= 60; i++) { const a = Math.PI * i / 60; o.push({ x: 150 - 50 * Math.cos(a), y: 150 + 70 * Math.sin(a) + (i < 5 ? -(5 - i) * 8 : 0), p: 0.5 }); } return o; })(),
      'word scribble': (() => { const o = []; for (let i = 0; i <= 200; i++) o.push({ x: 50 + i * 2.5, y: 200 + Math.sin(i / 2.2) * 18 + Math.sin(i / 9) * 22 + jit(1), p: 0.5 }); return o; })(),
      'spiral': (() => { const o = []; for (let i = 0; i <= 160; i++) { const a = i * 0.14, r = 8 + i * 0.7; o.push({ x: 250 + r * Math.cos(a), y: 250 + r * Math.sin(a), p: 0.5 }); } return o; })(),
      'tiny tick': lin(100, 100, 120, 95, 6, 0.3),
      'short dash': lin(100, 100, 140, 102, 8, 0.3),
      'small o': circ(100, 100, 12, 14, 30, 0.5),
      'small 8': (() => { const o = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * 6.28; o.push({ x: 100 + 14 * Math.sin(a), y: 100 + 22 * Math.sin(2 * a) / 2 + 22 * (1 - Math.cos(a)) * 0, p: 0.5 }); } return o; })(),
      'open arc': circ(300, 250, 90, 90, 60, 1, 3.3),
      'two points': [{ x: 0, y: 0 }, { x: 300, y: 0 }],
      'single point': [{ x: 5, y: 5 }],
      'empty': [],
      'big 8': (() => { const o = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * 6.283; o.push({ x: 250 + 60 * Math.sin(a), y: 250 + 100 * Math.sin(a) * Math.cos(a), p: 0.5 }); } return o; })(),
      'star': path([[250, 60], [310, 240], [160, 130], [340, 130], [190, 240]], 15, 1, true),
      'cursive loops': (() => { const o = []; for (let i = 0; i <= 150; i++) { const a = i * 0.32; o.push({ x: 60 + i * 2.2 + 22 * Math.cos(a), y: 200 + 22 * Math.sin(a), p: 0.5 }); } return o; })(),
    };
    for (const [name, pts] of Object.entries(cases)) { const r = M.recognize(pts); ok(r === null, 'not recognised: ' + name + (r ? ' -> ' + JSON.stringify(r) : '')); }
    ok(M.recognize(null) === null && M.recognize('x') === null && M.recognize([{ x: NaN, y: 0 }, null, 5]) === null, 'garbage → null, no throw');
  `);

  await run('model: toSVG / itemSVG / backgroundSVG', `${GEN}
    const L2 = { id: 'l2', name: 'Top', hidden: false, locked: false };
    const a = stroke(wave(60)), h = M.makeStroke(wave(30), { k: 'hl', c: '#ffee00', l: 'l2', s: 14 });
    const sh = M.makeShape('arrow', 20, 20, 300, 60, { c: '#0000ff', l: 'l1' });
    const el = M.makeShape('ellipse', 20, 120, 200, 180, { f: '#00ff00' });
    const hid = Object.assign(M.makeShape('rect', 5, 5, 50, 50, { l: 'l3' }), { id: 'hiddenone' });
    const props = { w: 800, h: 400, bg: 'dots', layers: [{ id: 'l1', name: '', hidden: false, locked: false }, L2, { id: 'l3', name: '', hidden: true, locked: false }], items: [a, h, sh, el, hid] };
    const doc = (str) => new DOMParser().parseFromString(str, 'image/svg+xml');
    const bad = (d) => d.querySelector('parsererror');
    const svg = M.toSVG(props, {});
    const d = doc(svg);
    ok(!bad(d) && d.documentElement.localName === 'svg' && d.documentElement.namespaceURI === 'http://www.w3.org/2000/svg', 'toSVG is well-formed XML with xmlns');
    ok(d.documentElement.getAttribute('width') === '800' && d.documentElement.getAttribute('height') === '400' && d.documentElement.getAttribute('viewBox') === '0 0 800 400', 'width/height/viewBox');
    ok(d.querySelectorAll('[data-layer]').length === 2 && !svg.includes('hiddenone'), 'hidden layer left out');
    ok(d.querySelector('[data-id="' + a.id + '"]') && d.querySelector('[data-id="' + h.id + '"]') && d.querySelectorAll('path[data-id]').length === 4, 'one path per item');
    ok(d.querySelector('.ink-bg') && d.querySelector('.ink-bg').getAttribute('stroke') === 'currentColor', 'background uses currentColor');
    ok(!bad(doc(M.toSVG(props, { background: false }))) && !M.toSVG(props, { background: false }).includes('ink-bg'), 'background: false');
    const only = M.toSVG(props, { items: [a.id] }); ok(only.includes(a.id) && !only.includes(h.id) && !only.includes(sh.id), 'items filter');
    const crop = doc(M.toSVG(props, { crop: true })); const vb = crop.documentElement.getAttribute('viewBox').split(' ').map(Number);
    ok(!bad(crop) && vb[2] < 800 && vb[3] < 400 && vb[2] > 100, 'crop shrinks the viewBox: ' + vb.join(' '));
    const nosize = M.toSVG(props, { sized: false }); ok(!/ width=/.test(nosize.slice(0, 120)), 'sized: false omits width/height');
    ok(/mix-blend-mode:multiply/.test(M.itemSVG(h)) && /fill="none"/.test(M.itemSVG(h)) && /stroke-linejoin="round"/.test(M.itemSVG(h)), 'highlighter: stroked centre line, multiply');
    ok(/^<path data-id="[^"]+" d="[^"]+" fill="#112233"\\/>$/.test(M.itemSVG(a)), 'pen: filled outline path');
    ok(M.itemSVG(null) === '' && M.itemSVG({}) === '', 'itemSVG of garbage is empty');
    ['dots', 'lines', 'grid'].forEach((bg) => { const g = M.backgroundSVG(bg, 600, 300); ok(!bad(doc('<svg xmlns="http://www.w3.org/2000/svg">' + g + '</svg>')) && g.includes('currentColor') && g.includes('class="ink-bg"'), 'backgroundSVG ' + bg); });
    ok(M.backgroundSVG('none', 100, 100) === '' && M.backgroundSVG('evil', 100, 100) === '', "backgroundSVG('none') is empty");
    const hostile = { w: 500, h: 300, bg: '"/><script>alert(1)</script>', layers: [{ id: '"><script>x</script>', name: '<img src=x onerror=1>' }, { id: 'a b' }], items: [
      { id: '"/><script>alert(1)</script>', k: 'pen', c: '#fff"/><script>', o: '1" onload="x', s: '<b>', p: [0, 0, 5, 5] },
      { id: 'x1', k: 'line', c: 'javascript:alert(1)', x1: 0, y1: 0, x2: 10, y2: 10, f: '"><svg onload=1>' },
      { id: 'x2', k: 'rect', c: '#000000', f: 'url(javascript:1)', x1: 0, y1: 0, x2: 9, y2: 9 },
      { id: 'x3', k: 'poly', pts: [0, 0, 1, 1, '<x>', 5] },
      { id: 'x4', k: 'hl', c: '#00ff00', p: [0, 0, 3, 3], onclick: 'alert(1)', style: 'x', href: 'javascript:1' },
    ] };
    const hs = M.toSVG(hostile, {});
    ok(!/<script|onerror|onload|onclick|javascript:|<img|<b>|href=|<svg[^>]*onload/i.test(hs) && !bad(doc(hs)), 'hostile input produces clean markup: ' + hs.slice(0, 160));
    const walk = [...doc(hs).querySelectorAll('*')]; const allowed = new Set(['svg', 'g', 'path']);
    ok(walk.every((e) => allowed.has(e.localName) && [...e.attributes].every((at) => ['xmlns', 'width', 'height', 'viewBox', 'class', 'data-layer', 'data-id', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'style'].includes(at.name))), 'only svg/g/path with known attributes');
    ok(!bad(doc(M.toSVG(null, {}))) && !bad(doc(M.toSVG('x', {}))), 'toSVG(garbage) is still valid SVG');
    ok(!/NaN|Infinity|undefined|null/.test(svg), 'no NaN/undefined in the markup');
  `);

  await run('model: drawItem + toPNG', `${GEN}
    const props = { w: 600, h: 300, bg: 'grid', items: [stroke(wave(40)), M.makeShape('rect', 50, 50, 200, 150, { c: '#ff0000', f: '#00ff00' }), M.makeStroke(wave(20), { k: 'hl', c: '#ffff00' })] };
    const c = document.createElement('canvas'); c.width = 600; c.height = 300; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 300);
    props.items.forEach((it) => M.drawItem(ctx, it));
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    ok(px(125, 100).join() === '0,255,0,255', 'drawItem fills a filled rect: ' + px(125, 100));
    ok(px(50, 100)[0] > 200 && px(50, 100)[1] < 60, 'drawItem strokes the rect outline');
    ok(px(300, 280).join() === '255,255,255,255', 'untouched pixel stays white');
    let threw = false; try { M.drawItem(ctx, null); M.drawItem(ctx, { k: 'zzz' }); M.drawItem(null, props.items[0]); } catch (e) { threw = true; } ok(!threw, 'drawItem tolerates garbage');
    const blob = await M.toPNG(props, { scale: 1, background: '#ffffff' });
    ok(blob instanceof Blob && blob.type === 'image/png' && blob.size > 100, 'toPNG gives a PNG blob (' + blob.size + ' bytes)');
    const head = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(head.buffer);
    ok(head[0] === 0x89 && head[1] === 0x50 && dv.getUint32(16) === 600 && dv.getUint32(20) === 300, 'PNG signature and size 600x300 at scale 1');
    const b2 = new DataView(await (await M.toPNG(props, { scale: 2 })).arrayBuffer());
    ok(b2.getUint32(16) === 1200 && b2.getUint32(20) === 600, 'scale 2 doubles the size');
    const bc = new DataView(await (await M.toPNG(props, { scale: 1, crop: true })).arrayBuffer());
    ok(bc.getUint32(16) < 600 && bc.getUint32(20) < 300, 'crop shrinks the image: ' + bc.getUint32(16) + 'x' + bc.getUint32(20));
    const tall = new DataView(await (await M.toPNG({ w: 1000, h: 20000, items: [] }, { scale: 2 })).arrayBuffer());
    ok(tall.getUint32(20) <= 8192 && tall.getUint32(16) * tall.getUint32(20) <= 40e6 && tall.getUint32(16) / tall.getUint32(20) > 0.049 && tall.getUint32(16) / tall.getUint32(20) < 0.051, 'huge canvas is scaled down, ratio kept: ' + tall.getUint32(16) + 'x' + tall.getUint32(20));
    // transparent background: draw to a canvas and check alpha
    const tb = await M.toPNG({ w: 300, h: 100, items: [] }, { scale: 1, background: null });
    const bmp = await createImageBitmap(tb); const cc = document.createElement('canvas'); cc.width = bmp.width; cc.height = bmp.height; const c2 = cc.getContext('2d'); c2.drawImage(bmp, 0, 0);
    ok(c2.getImageData(10, 10, 1, 1).data[3] === 0, 'background: null is transparent');
    let rejected = false; try { await M.toPNG(null, {}); } catch (e) { rejected = true; } ok(rejected, 'toPNG(null) rejects');
  `);

  await run('model: ink in Word / HTML / text export', `${GEN}
    const X = T4.edx;
    let temp = false;
    if (!X.widgets.has('ink')) {
      X.widgets.register('ink', { inline: false, validate: (p) => M.validate(p), render: (el, p) => { el.innerHTML = '<div>ink</div>'; }, textOf: () => '' });
      temp = true;
    }
    const props = { w: 800, h: 300, bg: 'lines', al: 'center', layers: [{ id: 'l1', name: '', hidden: false, locked: false }], items: [stroke(wave(60), { c: '#cc0000' }), M.makeShape('ellipse', 30, 30, 200, 120, { c: '#0000cc' })] };
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const html = '<h1>Notes</h1><p>before</p><figure class="t4-w" data-w="ink" data-p="' + esc(JSON.stringify(props)) + '"></figure><p>after</p>';
    await T4.editor.newDocument({ title: 'Ink export', html });
    for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await wait(50);
    await wait(200);
    ok(!!D().querySelector('[data-w="ink"]'), 'ink widget is in the document');
    const id = T4.editor.current.id;
    await T4.editor.flush();
    const snap = X.editor.snapshot().html;
    const dd = { id, meta: (T4.editor.current || {}).meta || {}, html: snap };
    // HTML
    const h = await X.exporters.get('io.html').run(dd);
    const hb = h && h.blob ? h.blob : h; const hres = typeof hb === 'string' ? hb : await hb.text();
    ok(/<figure class="t4-svg"[^>]*><div class="t4-box" style="width:80%"><svg [^>]*viewBox="0 0 800 300"/.test(hres), 'HTML export contains the drawing as inline SVG at 80 % width');
    ok(/<path data-id=/.test(hres) && /#cc0000/.test(hres) && !/data-w="ink"/.test(hres), 'HTML export: ink paths present, widget markup gone');
    const hdoc = new DOMParser().parseFromString(hres, 'text/html');
    ok(!!hdoc.querySelector('figure.t4-svg svg path') && !hdoc.querySelector('script'), 'HTML export parses, no script');
    // text
    const tx = await X.exporters.get('io.txt').run(dd); const txb = tx && tx.blob ? tx.blob : tx; const ttxt = typeof txb === 'string' ? txb : await txb.text();
    ok(/\\[(Drawing|Zeichnung|Çizim|Dibujo)\\]/.test(ttxt) && /before/.test(ttxt) && /after/.test(ttxt), 'text export: short description, no silent drop');
    const rt = await X.exporters.get('io.rtf').run(dd); const rtb = rt && rt.blob ? rt.blob : rt; const rtxt = typeof rtb === 'string' ? rtb : await rtb.text();
    ok(/\\\\i \\[/.test(rtxt) && /after/.test(rtxt), 'RTF export: description of the drawing');
    // Word
    const wd = await X.exporters.get('io.docx').run(dd); const wb = wd && wd.blob ? wd.blob : wd;
    const bytes = new Uint8Array(await wb.arrayBuffer());
    const zip = await T4.edio.zip.readZip(bytes);
    const names = zip.names();
    const media = names.filter((n) => /^word\\/media\\/.*\\.png$/.test(n));
    ok(media.length === 1, 'Word export contains one PNG image: ' + names.filter((n) => /media/.test(n)).join());
    const docXml = await zip.text('word/document.xml');
    ok(/<w:drawing>/.test(docXml) && /<pic:pic/.test(docXml), 'document.xml references the picture');
    const png = await zip.read(media[0]); const pv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    ok(png[0] === 0x89 && pv.getUint32(16) === 640 * 2 && pv.getUint32(20) === Math.round(640 * 300 / 800) * 2, 'PNG has the canvas aspect ratio at 2x: ' + pv.getUint32(16) + 'x' + pv.getUint32(20));
    // ink module absent: the exporters keep working
    const keep = T4.ink; T4.ink = undefined;
    let res = null, err = ''; try { const r = await X.exporters.get('io.html').run(dd); res = typeof r === 'string' ? r : await (r.blob || r).text(); await X.exporters.get('io.docx').run(dd); await X.exporters.get('io.txt').run(dd); } catch (e) { err = e.message; }
    T4.ink = keep;
    ok(!err && res && /after/.test(res), 'exporters still work when T4.ink is absent' + (err ? ': ' + err : ''));
    // overlay note + empty canvas
    ok(T4.edio.common.widgetSVG('ink', { w: 1000, h: 200 }) === null, 'blank canvas without background: nothing to draw');
    ok(T4.edio.common.widgetSVG('ink', Object.assign({}, props, { overlay: true })).overlay === true, 'overlay flag reported');
    if (temp) X.widgets.remove('ink');
  `);
}

export default standalone(test);
