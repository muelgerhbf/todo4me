/* Todo4Me — knowledge layer, part 3: graph view. Documents are nodes, wiki links are edges.
 * Plain SVG + a small force layout (Fruchterman–Reingold) that runs in requestAnimationFrame slices of ~8 ms,
 * so even 500+ documents never freeze the page. Pan (drag), zoom (wheel / buttons), click or Enter opens a document. */
(function () {
  'use strict';
  const X = T4.edx, K = T4.edKnowledge;
  const { esc, icon, t } = K;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_NODES = 1500;
  let g = null; // the open graph, if any

  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function collect(f) {
    let docs = K.live().filter((d) => f.archived || !d.kn_archived);
    if (f.tag) docs = docs.filter((d) => (d.kn_tags || []).some((x) => x === f.tag || x.indexOf(f.tag + '/') === 0));
    if (f.folder) docs = docs.filter((d) => d.kn_folder === f.folder || (d.kn_folder || '').indexOf(f.folder + '/') === 0);
    const ids = new Set(docs.map((d) => d.id));
    let edges = [];
    docs.forEach((d) => (d.kn_links || []).forEach((tg) => { if (tg !== d.id && ids.has(tg)) edges.push([d.id, tg]); }));
    if (f.local && f.currentId && ids.has(f.currentId)) {
      const adj = new Map();
      edges.forEach(([a, b]) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); });
      const keep = new Set([f.currentId]);
      let front = [f.currentId];
      for (let depth = 0; depth < 2; depth++) { const nx = []; front.forEach((id) => (adj.get(id) || []).forEach((n) => { if (!keep.has(n)) { keep.add(n); nx.push(n); } })); front = nx; }
      docs = docs.filter((d) => keep.has(d.id));
      edges = edges.filter(([a, b]) => keep.has(a) && keep.has(b));
    }
    if (f.hideOrphans) {
      const used = new Set(); edges.forEach(([a, b]) => { used.add(a); used.add(b); });
      docs = docs.filter((d) => used.has(d.id) || d.id === f.currentId);
    }
    let capped = false;
    if (docs.length > MAX_NODES) {
      const deg = new Map(); edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
      docs = docs.sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0)).slice(0, MAX_NODES);
      const keep = new Set(docs.map((d) => d.id));
      edges = edges.filter(([a, b]) => keep.has(a) && keep.has(b));
      capped = true;
    }
    return { docs, edges, capped };
  }

  function openGraph() {
    if (g) { g.root.querySelector('input, select, button').focus(); return g; }
    const root = document.createElement('div');
    root.className = 'ed-kn-graph';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('cmdGraph', 'Knowledge graph'));
    const cur = (() => { try { return X.editor.current(); } catch (e) { return null; } })();
    const tagOpts = K.allTags().map(([tg]) => '<option value="' + esc(tg) + '">#' + esc(tg) + '</option>').join('');
    const folOpts = K.folderPaths().map((p) => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
    root.innerHTML =
      '<div class="ed-kn-graph__bar">' +
        '<h2 class="ed-kn-graph__title">' + icon('graph') + esc(t('cmdGraph', 'Knowledge graph')) + '</h2>' +
        '<input type="search" class="ed-kn-graph__q" data-g="q" placeholder="' + esc(t('graphFind', 'Find a document…')) + '" aria-label="' + esc(t('graphFind', 'Find a document…')) + '" autocomplete="off">' +
        '<select data-g="tag" aria-label="' + esc(t('tags', 'Tags')) + '"><option value="">' + esc(t('allTags', 'All tags')) + '</option>' + tagOpts + '</select>' +
        '<select data-g="folder" aria-label="' + esc(t('folder', 'Folder')) + '"><option value="">' + esc(t('allFolders', 'All folders')) + '</option>' + folOpts + '</select>' +
        '<label class="ed-kn-check"><input type="checkbox" data-g="orphans"> ' + esc(t('hideOrphans', 'Linked only')) + '</label>' +
        '<label class="ed-kn-check"><input type="checkbox" data-g="archived"> ' + esc(t('showArchived', 'Archived')) + '</label>' +
        (cur ? '<label class="ed-kn-check"><input type="checkbox" data-g="local"> ' + esc(t('localGraph', 'Around this document')) + '</label>' : '') +
        '<span class="ed-kn-graph__sp"></span>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-g-act="out" aria-label="' + esc(t('zoomOut', 'Zoom out')) + '">' + icon('minus') + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-g-act="in" aria-label="' + esc(t('zoomIn', 'Zoom in')) + '">' + icon('plus') + '</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-g-act="fit">' + esc(t('fit', 'Fit')) + '</button>' +
        '<button type="button" class="icon-btn" data-g-act="close" aria-label="' + esc(T4.i18n.t('c.close')) + '">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="ed-kn-graph__stage"><svg class="ed-kn-graph__svg" role="group" aria-label="' + esc(t('graphDesc', 'Graph of linked documents')) + '"></svg><p class="ed-kn-graph__empty muted" hidden></p></div>' +
      '<p class="ed-kn-graph__status small muted" aria-live="polite"></p>';
    document.body.appendChild(root);
    const prevFocus = document.activeElement;
    const svg = root.querySelector('.ed-kn-graph__svg');
    const vp = svgEl('g', { class: 'ed-kn-vp' });
    const gEdges = svgEl('g', { class: 'ed-kn-edges' }), gNodes = svgEl('g', { class: 'ed-kn-nodes' });
    vp.append(gEdges, gNodes); svg.appendChild(vp);
    const st = { root, nodes: [], edges: [], map: new Map(), tx: 0, ty: 0, s: 1, raf: 0, iter: 0, maxIter: 0, pos: new Map(), q: '', currentId: cur && cur.id, done: false, frames: 0, t0: 0, layoutMs: 0, frameMax: 0 };
    g = st;
    const status = root.querySelector('.ed-kn-graph__status'), empty = root.querySelector('.ed-kn-graph__empty');

    function apply() { vp.setAttribute('transform', 'translate(' + st.tx.toFixed(1) + ' ' + st.ty.toFixed(1) + ') scale(' + st.s.toFixed(3) + ')'); svg.classList.toggle('ed-kn-graph--labels', st.s >= 1.3 || st.nodes.length <= 80); }
    function paint() {
      st.edges.forEach((e) => { e.el.setAttribute('x1', e.a.x.toFixed(1)); e.el.setAttribute('y1', e.a.y.toFixed(1)); e.el.setAttribute('x2', e.b.x.toFixed(1)); e.el.setAttribute('y2', e.b.y.toFixed(1)); });
      st.nodes.forEach((n) => n.el.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ' ' + n.y.toFixed(1) + ')'));
    }
    function fit() {
      if (!st.nodes.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      st.nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
      const r = svg.getBoundingClientRect(), pad = 60;
      const w = Math.max(40, x1 - x0), h = Math.max(40, y1 - y0);
      st.s = Math.max(0.15, Math.min(2, Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h)));
      st.tx = r.width / 2 - ((x0 + x1) / 2) * st.s; st.ty = r.height / 2 - ((y0 + y1) / 2) * st.s;
      apply();
    }
    function zoomAt(f, cx, cy) {
      const r = svg.getBoundingClientRect();
      cx = cx == null ? r.width / 2 : cx - r.left; cy = cy == null ? r.height / 2 : cy - r.top;
      const ns = Math.max(0.1, Math.min(6, st.s * f));
      st.tx = cx - ((cx - st.tx) / st.s) * ns; st.ty = cy - ((cy - st.ty) / st.s) * ns; st.s = ns;
      apply();
    }
    function highlight(id) {
      const nb = new Set();
      if (id) { nb.add(id); st.edges.forEach((e) => { if (e.a.id === id) nb.add(e.b.id); else if (e.b.id === id) nb.add(e.a.id); }); }
      svg.classList.toggle('has-focus', !!id);
      st.nodes.forEach((n) => n.el.classList.toggle('is-nb', !!id && nb.has(n.id)));
      st.edges.forEach((e) => e.el.classList.toggle('is-nb', !!id && (e.a.id === id || e.b.id === id)));
    }
    function matches() {
      const q = K.fold(st.q).trim();
      let n = 0;
      st.nodes.forEach((nd) => { const m = !!q && K.fold(nd.title).includes(q); nd.el.classList.toggle('is-match', m); if (m) n++; });
      svg.classList.toggle('has-query', !!q);
      return n;
    }

    function layout() {
      const nodes = st.nodes, n = nodes.length;
      if (st.raf) cancelAnimationFrame(st.raf);
      st.iter = 0; st.maxIter = n > 1000 ? 90 : n > 400 ? 160 : 260; st.done = false; st.t0 = performance.now(); st.frames = 0; st.frameMax = 0;
      const k = 48, k2 = k * k, cut2 = (k * 6) * (k * 6), temp0 = k * 3;
      const dx = new Float32Array(n), dy = new Float32Array(n);
      const tick = () => {
        const fs = performance.now();
        while (st.iter < st.maxIter && performance.now() - fs < 8) {
          const temp = temp0 * Math.pow(1 - st.iter / st.maxIter, 2) + 1.5;
          dx.fill(0); dy.fill(0);
          for (let i = 0; i < n; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < n; j++) {
              const b = nodes[j];
              let ex = a.x - b.x, ey = a.y - b.y;
              let d2 = ex * ex + ey * ey;
              if (d2 > cut2) continue;
              if (d2 < 0.01) { ex = (i % 7) - 3 + 0.1; ey = (j % 5) - 2 + 0.1; d2 = ex * ex + ey * ey; }
              const f = k2 / d2;
              dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
            }
          }
          st.edges.forEach((e) => {
            const ex = e.a.x - e.b.x, ey = e.a.y - e.b.y, d = Math.sqrt(ex * ex + ey * ey) || 0.1, f = d / k;
            dx[e.a.i] -= ex * f; dy[e.a.i] -= ey * f; dx[e.b.i] += ex * f; dy[e.b.i] += ey * f;
          });
          for (let i = 0; i < n; i++) {
            const nd = nodes[i];
            dx[i] -= nd.x * 0.35; dy[i] -= nd.y * 0.35; // gravity keeps unconnected parts near the middle
            if (nd.fixed) continue;
            const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, m = Math.min(len, temp) / len;
            nd.x += dx[i] * m; nd.y += dy[i] * m;
          }
          st.iter++;
        }
        paint();
        st.frames++; st.frameMax = Math.max(st.frameMax, performance.now() - fs);
        if (st.iter < st.maxIter) st.raf = requestAnimationFrame(tick);
        else { st.raf = 0; st.done = true; st.layoutMs = performance.now() - st.t0; fit(); root.dataset.layout = 'done'; }
      };
      root.dataset.layout = 'running';
      st.raf = requestAnimationFrame(tick);
    }

    function build() {
      const f = {
        tag: root.querySelector('[data-g="tag"]').value, folder: root.querySelector('[data-g="folder"]').value,
        hideOrphans: root.querySelector('[data-g="orphans"]').checked, archived: root.querySelector('[data-g="archived"]').checked,
        local: !!(root.querySelector('[data-g="local"]') && root.querySelector('[data-g="local"]').checked), currentId: st.currentId,
      };
      st.nodes.forEach((n) => st.pos.set(n.id, { x: n.x, y: n.y }));
      const { docs, edges, capped } = collect(f);
      gEdges.textContent = ''; gNodes.textContent = '';
      const deg = new Map(); edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
      st.map = new Map();
      st.nodes = docs.map((d, i) => {
        const p = st.pos.get(d.id), ang = i * 2.399963, rad = 14 * Math.sqrt(i + 1);
        const nd = { id: d.id, i, title: K.title(d), deg: deg.get(d.id) || 0, x: p ? p.x : Math.cos(ang) * rad, y: p ? p.y : Math.sin(ang) * rad, archived: !!d.kn_archived };
        const el = svgEl('g', { class: 'ed-kn-gn' + (d.id === st.currentId ? ' is-current' : '') + (nd.archived ? ' is-archived' : '') + (nd.deg ? '' : ' is-orphan'), tabindex: '0', role: 'link', 'aria-label': nd.title, 'data-id': d.id });
        el.appendChild(svgEl('circle', { r: String(Math.min(14, 5 + Math.sqrt(nd.deg) * 2.2)) }));
        const tx = svgEl('text', { x: '0', y: '-9', 'text-anchor': 'middle' }); tx.textContent = nd.title.length > 28 ? nd.title.slice(0, 27) + '…' : nd.title;
        el.appendChild(tx);
        const ti = svgEl('title'); ti.textContent = nd.title; el.appendChild(ti);
        nd.el = el; gNodes.appendChild(el); st.map.set(d.id, nd);
        return nd;
      });
      st.edges = edges.map(([a, b]) => { const el = svgEl('line', { class: 'ed-kn-ge' }); gEdges.appendChild(el); return { a: st.map.get(a), b: st.map.get(b), el }; });
      status.textContent = t('graphStatus', '{n} documents, {m} links', { n: st.nodes.length, m: st.edges.length }) + (capped ? ' — ' + t('graphCapped', 'showing the {n} best connected', { n: MAX_NODES }) : '');
      empty.hidden = st.nodes.length > 0;
      empty.textContent = t('graphEmpty', 'No documents match these filters.');
      root.dataset.nodes = String(st.nodes.length); root.dataset.edges = String(st.edges.length);
      matches(); highlight(null);
      const settled = st.nodes.length && st.nodes.every((n) => st.pos.has(n.id));
      if (settled) { st.maxIter = 0; paint(); layoutShort(); } else layout();
      apply();
    }
    function layoutShort() { layout(); st.maxIter = Math.min(st.maxIter, 60); }

    // events
    root.addEventListener('change', (e) => { if (e.target.dataset.g && e.target.dataset.g !== 'q') build(); });
    root.querySelector('[data-g="q"]').addEventListener('input', (e) => { st.q = e.target.value; const c = matches(); status.textContent = st.q ? t('graphMatches', '{n} matches', { n: c }) : t('graphStatus', '{n} documents, {m} links', { n: st.nodes.length, m: st.edges.length }); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g-act]');
      if (!b) return;
      const a = b.dataset.gAct;
      if (a === 'close') closeGraph(); else if (a === 'fit') fit(); else if (a === 'in') zoomAt(1.3); else if (a === 'out') zoomAt(1 / 1.3);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeGraph(); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = Array.from(root.querySelectorAll('button, input, select, [tabindex="0"]')).filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      const nd = e.target.closest && e.target.closest('.ed-kn-gn');
      if (nd && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNode(nd.dataset.id); }
      else if (!e.target.closest('input, select') && (e.key === '+' || e.key === '=')) zoomAt(1.3);
      else if (!e.target.closest('input, select') && (e.key === '-' || e.key === '_')) zoomAt(1 / 1.3);
    });
    svg.addEventListener('focusin', (e) => { const nd = e.target.closest('.ed-kn-gn'); highlight(nd ? nd.dataset.id : null); });
    svg.addEventListener('focusout', () => highlight(null));
    svg.addEventListener('pointerover', (e) => { const nd = e.target.closest('.ed-kn-gn'); if (nd && !drag) highlight(nd.dataset.id); });
    svg.addEventListener('pointerout', (e) => { if (!drag && e.target.closest('.ed-kn-gn')) highlight(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ed-kn-gn') ? document.activeElement.dataset.id : null); });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const nd = e.target.closest('.ed-kn-gn');
      drag = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty, node: nd ? st.map.get(nd.dataset.id) : null, moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (drag.node) { const r = svg.getBoundingClientRect(); drag.node.x = (e.clientX - r.left - st.tx) / st.s; drag.node.y = (e.clientY - r.top - st.ty) / st.s; drag.node.fixed = true; paint(); }
      else { st.tx = drag.tx + dx; st.ty = drag.ty + dy; apply(); }
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      if (!d.moved && d.node) openNode(d.node.id);
      if (d.node) d.node.fixed = false;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    function openNode(id) { closeGraph(true); X.editor.openDoc(id); }
    st.build = build; st.fit = fit; st.prevFocus = prevFocus;
    build();
    root.querySelector('[data-g="q"]').focus();
    return st;
  }
  function closeGraph(noRestore) {
    if (!g) return false;
    const s = g; g = null;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.root.remove();
    if (!noRestore && s.prevFocus && document.contains(s.prevFocus)) s.prevFocus.focus();
    return true;
  }
  K.openGraph = openGraph;
  K.closeGraph = closeGraph;
  K.graphState = () => g;
  X.events.on('shell-built', () => closeGraph(true));
})();
