/* Todo4Me — editor module "versions": pure helpers (no DOM state, no database).
 *   T4.edVersionsLib.planRetention(list, now, opts)  which versions the retention policy removes
 *   T4.edVersionsLib.changeSize(oldHtml, newHtml)    how much a document changed (characters + structure)
 *   T4.edVersionsLib.diffDocs(oldHtml, newHtml)      block-aligned word-level diff of two documents
 * Kept separate from js/ed-versions.js so the logic can be unit-tested in the page. */
T4.edVersionsLib = (function () {
  'use strict';

  const HOUR = 3600000, DAY = 86400000;
  const RETENTION = { keepAllMs: DAY, hourlyMs: 7 * DAY, dailyMs: 90 * DAY, max: 200 };

  /* ====================== Retention ====================== */
  /** planRetention(list, now, { protect(rec) → bool, max, keepAllMs, hourlyMs, dailyMs })
   *  list: [{ id, createdAt (ISO), reason }]. Returns { keep: [ids], remove: [ids] }.
   *  Rules: protected versions (manual / named) are never removed and do not count towards `max`; unprotected versions are all kept for
   *  24 h, then one per hour (the newest of each hour) for 7 days, then one per day for 90 days, older ones go; at most `max`
   *  unprotected versions stay (oldest go first). The newest version is never removed. */
  function planRetention(list, now, opts) {
    const o = Object.assign({}, RETENTION, opts || {});
    const items = list.map((r) => ({ r, t: Date.parse(r.createdAt) })).filter((x) => !isNaN(x.t)).sort((a, b) => b.t - a.t);
    const keep = new Set(), remove = new Set();
    const hours = new Set(), days = new Set();
    let unprotected = 0;
    items.forEach((x, i) => {
      const id = x.r.id;
      if (o.protect && o.protect(x.r)) { keep.add(id); return; }
      const age = now - x.t;
      let ok;
      if (i === 0 || age <= o.keepAllMs) ok = true;
      else if (age <= o.hourlyMs) { const k = Math.floor(x.t / HOUR); ok = !hours.has(k); hours.add(k); }
      else if (age <= o.dailyMs) { const d = new Date(x.t); const k = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); ok = !days.has(k); days.add(k); }
      else ok = false;
      if (ok && ++unprotected > o.max && i !== 0) ok = false;
      (ok ? keep : remove).add(id);
    });
    return { keep: Array.from(keep), remove: Array.from(remove) };
  }

  /* ====================== Documents → blocks ====================== */
  const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'PRE', 'DT', 'DD', 'SUMMARY', 'ADDRESS', 'FIGCAPTION']);
  const CONTAINER_TAGS = new Set(['UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'DETAILS', 'ASIDE', 'SECTION', 'ARTICLE', 'DIV', 'DL', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIELDSET']);
  const clean = (s) => String(s || '').replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();

  function widgetLabel(el) {
    const type = el.getAttribute('data-w') || 'widget';
    let p = {};
    try { p = JSON.parse(el.getAttribute('data-p') || '{}'); } catch (e) { /* keep empty */ }
    let hint = '';
    if (type === 'math') hint = p.tex || p.src || '';
    else if (type === 'code') hint = String(p.code || p.src || '').split('\n')[0];
    else if (type === 'img') hint = p.alt || '';
    else if (typeof p.title === 'string') hint = p.title;
    else if (typeof p.text === 'string') hint = p.text;
    return { type, label: '[' + type + (hint ? ': ' + String(hint).slice(0, 60) : '') + ']', sig: type + ':' + (el.getAttribute('data-p') || '') };
  }

  /** html → [{ tag, text, sig? }] in document order. Lists, tables and quotes are flattened to their items/rows. */
  function blocksOf(html) {
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html'); // inert: nothing loads or runs
    const out = [];
    const textOf = (el) => {
      // inline widgets count as one token, line breaks as spaces
      let s = '';
      (function walk(n) {
        n.childNodes.forEach((c) => {
          if (c.nodeType === 3) s += c.nodeValue;
          else if (c.nodeType === 1) {
            if (c.classList.contains('t4-w')) { const w = widgetLabel(c); s += ' ' + w.label + ' '; }
            else if (c.tagName === 'BR') s += ' ';
            else if (c.tagName === 'UL' || c.tagName === 'OL') { /* nested lists are their own blocks */ }
            else walk(c);
          }
        });
      })(el);
      return clean(s);
    };
    (function walk(parent) {
      let loose = null; // inline run directly inside a container
      const flush = () => { if (loose && clean(loose)) out.push({ tag: 'p', text: clean(loose) }); loose = null; };
      parent.childNodes.forEach((n) => {
        if (n.nodeType === 3) { loose = (loose || '') + n.nodeValue; return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (n.classList.contains('t4-w')) {
          if (n.tagName === 'FIGURE' || n.tagName === 'DIV') { flush(); const w = widgetLabel(n); out.push({ tag: 'widget', text: w.label, sig: w.sig }); }
          else loose = (loose || '') + ' ' + widgetLabel(n).label + ' ';
          return;
        }
        if (tag === 'HR') { flush(); out.push({ tag: 'hr', text: '' }); return; }
        if (tag === 'TR') {
          flush();
          out.push({ tag: 'tr', text: Array.from(n.children).map((c) => textOf(c)).join(' | ') });
          return;
        }
        if (BLOCK_TAGS.has(tag)) {
          flush();
          out.push({ tag: tag.toLowerCase(), text: textOf(n) });
          // nested lists inside an item
          n.querySelectorAll(':scope > ul, :scope > ol, :scope > blockquote').forEach((sub) => walk(sub));
          return;
        }
        if (CONTAINER_TAGS.has(tag)) { flush(); walk(n); return; }
        loose = (loose || '') + ' ' + n.textContent + ' ';
      });
      flush();
    })(doc.body);
    return out;
  }
  const keyOf = (b) => b.tag + '\u0001' + (b.sig || b.text);

  /* ====================== Change size ====================== */
  /** changeSize(oldHtml, newHtml) → { chars, structure, same }: chars = size of the changed middle of the text, structure = the block
   *  sequence (tags / widgets) differs. Used to decide whether an automatic version is worth keeping. */
  function changeSize(oldHtml, newHtml) {
    if (oldHtml === newHtml) return { chars: 0, structure: false, same: true };
    const a = blocksOf(oldHtml), b = blocksOf(newHtml);
    const sig = (bl) => bl.map((x) => (x.tag === 'widget' ? x.sig : x.tag)).join(',');
    const structure = a.length !== b.length || sig(a) !== sig(b);
    const ta = a.map((x) => x.text).join('\n'), tb = b.map((x) => x.text).join('\n');
    let p = 0;
    const max = Math.min(ta.length, tb.length);
    while (p < max && ta.charCodeAt(p) === tb.charCodeAt(p)) p++;
    let s = 0;
    while (s < max - p && ta.charCodeAt(ta.length - 1 - s) === tb.charCodeAt(tb.length - 1 - s)) s++;
    const chars = Math.max(ta.length - p - s, tb.length - p - s);
    return { chars, structure, same: chars === 0 && !structure && ta === tb };
  }

  /* ====================== Diff ====================== */
  /** Longest common subsequence of two arrays → matched index pairs [[i, j], …]. Common prefix/suffix are trimmed first; the middle
   *  uses a DP table up to 6M cells (beyond that the middle counts as completely different). */
  function lcsPairs(a, b, eq) {
    const pairs = [];
    let lo = 0, ha = a.length, hb = b.length;
    while (lo < ha && lo < hb && eq(a[lo], b[lo])) { pairs.push([lo, lo]); lo++; }
    const tail = [];
    while (ha > lo && hb > lo && eq(a[ha - 1], b[hb - 1])) { ha--; hb--; tail.push([ha, hb]); }
    const n = ha - lo, m = hb - lo;
    if (n > 0 && m > 0 && n * m <= 6000000) {
      const w = m + 1;
      const t = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          t[i * w + j] = eq(a[lo + i], b[lo + j]) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (eq(a[lo + i], b[lo + j])) { pairs.push([lo + i, lo + j]); i++; j++; }
        else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
        else j++;
      }
    }
    for (let k = tail.length - 1; k >= 0; k--) pairs.push(tail[k]);
    return pairs;
  }

  const TOKEN_RE = /[\p{L}\p{N}_]+(?:['’\-][\p{L}\p{N}_]+)*|\s+|[^\s]/gu;
  const tokens = (s) => String(s || '').match(TOKEN_RE) || [];
  const isSpace = (t) => /^\s+$/.test(t);

  /** Word-level diff of two strings → [{ t: 'eq'|'ins'|'del', s }] (adjacent ops of the same kind are merged; whitespace between two
   *  changes joins the change so "a b" → "x y" reads as one replacement). */
  function wordDiff(oldText, newText) {
    const a = tokens(oldText), b = tokens(newText);
    const pairs = lcsPairs(a, b, (x, y) => x === y);
    const ops = [];
    const push = (t, s) => { const l = ops[ops.length - 1]; if (l && l.t === t) l.s += s; else ops.push({ t, s }); };
    let i = 0, j = 0;
    pairs.concat([[a.length, b.length]]).forEach(([pi, pj]) => {
      while (i < pi) push('del', a[i++]);
      while (j < pj) push('ins', b[j++]);
      if (pi < a.length) { push('eq', a[pi]); i = pi + 1; j = pj + 1; }
    });
    // absorb whitespace-only equal runs sitting between two changes
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op.t === 'eq' && isSpace(op.s) && k > 0 && k < ops.length - 1 && ops[k - 1].t !== 'eq' && ops[k + 1].t !== 'eq') {
        out.push({ t: 'del', s: op.s }, { t: 'ins', s: op.s });
      } else out.push(op);
    }
    // regroup: within a run of changes, all deletions first, then all insertions
    const res = [];
    let dels = '', inss = '';
    const flush = () => { if (dels) res.push({ t: 'del', s: dels }); if (inss) res.push({ t: 'ins', s: inss }); dels = inss = ''; };
    out.forEach((op) => {
      if (op.t === 'eq') { flush(); const l = res[res.length - 1]; if (l && l.t === 'eq') l.s += op.s; else res.push({ t: 'eq', s: op.s }); }
      else if (op.t === 'del') dels += op.s; else inss += op.s;
    });
    flush();
    return res;
  }

  const wordSet = (s) => new Set(tokens(s).filter((t) => !isSpace(t)));
  function similarity(x, y) {
    if (x.tag !== y.tag && !(/^(p|li|h\d)$/.test(x.tag) && /^(p|li|h\d)$/.test(y.tag))) return 0;
    if (x.tag === 'widget' || y.tag === 'widget') return x.tag === y.tag && x.text === y.text ? 1 : (x.tag === y.tag ? 0.5 : 0);
    const A = wordSet(x.text), B = wordSet(y.text);
    if (!A.size && !B.size) return 1;
    let inter = 0;
    A.forEach((t) => { if (B.has(t)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  /** diffDocs(oldHtml, newHtml) → { rows, stats }.
   *  rows: [{ kind: 'same'|'add'|'del'|'mod', a: block|null, b: block|null, ops?: [{t,s}] }]
   *  stats: { added, removed, modified, changes (rows that differ), insChars, delChars, insWords, delWords, same } */
  function diffDocs(oldHtml, newHtml) {
    const A = blocksOf(oldHtml), B = blocksOf(newHtml);
    return diffBlocks(A, B);
  }
  function diffBlocks(A, B) {
    const ka = A.map(keyOf), kb = B.map(keyOf);
    const matched = lcsPairs(ka, kb, (x, y) => x === y);
    const rows = [];
    let i = 0, j = 0;
    const gap = (i1, j1) => {
      // unmatched blocks old[i..i1) / new[j..j1): pair similar ones into "modified" rows, the rest are deleted / added
      const ga = A.slice(i, i1), gb = B.slice(j, j1);
      let sim = [];
      if (ga.length && gb.length) {
        if (ga.length * gb.length <= 250000) sim = lcsPairs(ga, gb, (x, y) => similarity(x, y) >= 0.5);
        else sim = Array.from({ length: Math.min(ga.length, gb.length) }, (_, k) => [k, k]); // huge gap: pair by position
      }
      let x = 0, y = 0;
      sim.concat([[ga.length, gb.length]]).forEach(([pi, pj]) => {
        while (x < pi) rows.push({ kind: 'del', a: ga[x++], b: null });
        while (y < pj) rows.push({ kind: 'add', a: null, b: gb[y++] });
        if (pi < ga.length) { rows.push({ kind: 'mod', a: ga[pi], b: gb[pj], ops: wordDiff(ga[pi].text, gb[pj].text) }); x = pi + 1; y = pj + 1; }
      });
    };
    matched.forEach(([mi, mj]) => {
      if (mi > i || mj > j) gap(mi, mj);
      rows.push({ kind: 'same', a: A[mi], b: B[mj] });
      i = mi + 1; j = mj + 1;
    });
    if (i < A.length || j < B.length) gap(A.length, B.length);
    // a "modified" pair whose tag changed only (same text) or whose text is equal is still a change; text-equal same-tag cannot occur here
    const stats = { added: 0, removed: 0, modified: 0, changes: 0, insChars: 0, delChars: 0, insWords: 0, delWords: 0, same: 0 };
    const words = (s) => tokens(s).filter((t) => !isSpace(t) && /[\p{L}\p{N}]/u.test(t)).length;
    rows.forEach((r) => {
      if (r.kind === 'same') { stats.same++; return; }
      stats.changes++;
      if (r.kind === 'add') { stats.added++; stats.insChars += r.b.text.length; stats.insWords += words(r.b.text); }
      else if (r.kind === 'del') { stats.removed++; stats.delChars += r.a.text.length; stats.delWords += words(r.a.text); }
      else {
        stats.modified++;
        r.ops.forEach((o) => { if (o.t === 'ins') { stats.insChars += o.s.length; stats.insWords += words(o.s); } else if (o.t === 'del') { stats.delChars += o.s.length; stats.delWords += words(o.s); } });
      }
    });
    return { rows, stats };
  }

  return { RETENTION, planRetention, blocksOf, changeSize, lcsPairs, wordDiff, diffDocs, diffBlocks, tokens };
})();
