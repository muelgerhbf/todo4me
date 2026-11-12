/* Todo4Me — editor module "writing": find & replace bar. Matches are highlighted with the CSS Custom Highlight API (fallback: an overlay
 * outside the document); the stored document is never touched by searching. Replacing goes through edx.editor.run (one undo step). */
(function () {
  'use strict';
  const X = T4.edx, WR = T4.edWriting, t = WR.t, esc = X.util.esc, icon = X.util.icon;
  const root = () => X.editor.root();
  const MAX = 5000;
  const F = (WR.find = {});
  const S = { open: false, replace: false, q: '', rep: '', matches: [], cur: -1, error: '', anchor: null, saved: null, forceFallback: false };
  F.state = S;
  const opts = WR.prefs.find;
  const hasHL = () => !S.forceFallback && typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  /* ---------- engine ---------- */
  const BLOCK = /^(P|H[1-6]|LI|UL|OL|BLOCKQUOTE|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|PRE|DIV|SECTION|ARTICLE|ASIDE|DETAILS|SUMMARY|FIGURE|FIGCAPTION|DL|DT|DD|HR|NAV|HEADER|FOOTER|CAPTION|ADDRESS)$/;
  function collectBlocks(r) {
    const blocks = []; let c = null;
    const flush = () => { if (c && c.nodes.length) blocks.push(c); c = null; };
    (function walk(n) {
      for (let k = n.firstChild; k; k = k.nextSibling) {
        if (k.nodeType === 3) {
          const v = k.nodeValue; if (!v) continue;
          if (!c) c = { text: '', nodes: [] };
          c.nodes.push({ node: k, from: c.text.length, to: c.text.length + v.length }); c.text += v;
        } else if (k.nodeType === 1) {
          if (k.classList.contains('t4-w')) { if (k.tagName === 'SPAN') { if (c) c.text += '\n'; } else flush(); continue; } // widget internals are skipped
          if (k.classList.contains('ed-ui')) continue;
          if (k.tagName === 'BR') { if (c) c.text += '\n'; continue; }
          if (BLOCK.test(k.tagName)) { flush(); walk(k); flush(); } else walk(k);
        }
      }
    })(r);
    flush();
    return blocks;
  }
  const WORDCH = '\\p{L}\\p{N}_';
  function build(q, o) {
    if (!q) return { re: null, error: '' };
    let src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (o.word) src = '(?<![' + WORDCH + '])(?:' + src + ')(?![' + WORDCH + '])';
    const fl = 'gm' + (o.case ? '' : 'i');
    try { return { re: new RegExp(src, fl + 'u'), error: '' }; } catch (e1) {
      if (!o.regex) return { re: null, error: e1.message };
      try { return { re: new RegExp(o.word ? '(?<![\\w])(?:' + q + ')(?![\\w])' : q, fl), error: '' }; } catch (e2) { return { re: null, error: e2.message.replace(/^Invalid regular expression: /, '') }; }
    }
  }
  function findAll(r, re) {
    const out = [];
    for (const b of collectBlocks(r)) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(b.text))) {
        if (m[0] === '') { re.lastIndex++; continue; }
        const s = m.index, e = s + m[0].length, segs = [];
        for (const nd of b.nodes) if (nd.from < e && nd.to > s) segs.push({ node: nd.node, a: Math.max(s, nd.from) - nd.from, b: Math.min(e, nd.to) - nd.from });
        if (segs.length) out.push({ segs, text: m[0], m });
        if (out.length >= MAX) return out;
      }
    }
    return out;
  }
  F.findAll = findAll;
  const rangeOf = (m) => { const rg = document.createRange(); rg.setStart(m.segs[0].node, m.segs[0].a); const l = m.segs[m.segs.length - 1]; rg.setEnd(l.node, l.b); return rg; };
  function expand(rep, m) {
    if (!opts.regex) return rep;
    return rep.replace(/\$(\$|&|\d{1,2}|<[^>]+>)/g, (all, k) => {
      if (k === '$') return '$';
      if (k === '&') return m[0];
      if (k[0] === '<') return (m.groups && m.groups[k.slice(1, -1)]) || '';
      const v = m[+k]; return v === undefined ? (+k <= m.length - 1 ? '' : all) : v;
    });
  }

  /* ---------- highlighting ---------- */
  let ovl = null;
  function paint() {
    const ranges = S.matches.map(rangeOf);
    S.ranges = ranges;
    if (hasHL()) {
      const h = new Highlight(...ranges), c = new Highlight(); h.priority = 0; c.priority = 1;
      if (S.cur >= 0 && ranges[S.cur]) c.add(ranges[S.cur]);
      CSS.highlights.set('ed-wr-find', h); CSS.highlights.set('ed-wr-find-cur', c);
      clearOverlay();
    } else paintOverlay(ranges);
  }
  function paintOverlay(ranges) {
    clearOverlay();
    const page = document.getElementById('ed-page'); if (!page) return;
    ovl = document.createElement('div'); ovl.className = 'ed-wr-ovl ed-ui'; ovl.setAttribute('aria-hidden', 'true');
    const pr = page.getBoundingClientRect(), z = pr.width / (page.offsetWidth || pr.width) || 1;
    ranges.forEach((rg, i) => Array.from(rg.getClientRects()).forEach((q) => {
      const d = document.createElement('div'); d.className = 'ed-wr-ovl__box' + (i === S.cur ? ' is-cur' : '');
      d.style.cssText = 'left:' + ((q.left - pr.left) / z) + 'px;top:' + ((q.top - pr.top) / z) + 'px;width:' + (q.width / z) + 'px;height:' + (q.height / z) + 'px';
      ovl.appendChild(d);
    }));
    page.appendChild(ovl);
  }
  function clearOverlay() { if (ovl) { ovl.remove(); ovl = null; } }
  function clearPaint() {
    if (typeof CSS !== 'undefined' && CSS.highlights) { CSS.highlights.delete('ed-wr-find'); CSS.highlights.delete('ed-wr-find-cur'); }
    clearOverlay();
  }
  F.clearPaint = clearPaint;
  function reveal(rg) {
    const sc = document.getElementById('ed-scroll'); if (!sc || !rg) return;
    const r = rg.getBoundingClientRect(), s = sc.getBoundingClientRect();
    if (r.top < s.top + 60 || r.bottom > s.bottom - 60) sc.scrollTop += r.top - (s.top + s.height / 2);
  }

  /* ---------- search state ---------- */
  function bar() { return document.getElementById('ed-wr-find'); }
  function firstAtOrAfter(node, off) {
    for (let i = 0; i < S.matches.length; i++) {
      const sg = S.matches[i].segs[0];
      const c = node === sg.node ? sg.a - off : (node.compareDocumentPosition(sg.node) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1);
      if (c >= 0) return i;
    }
    return S.matches.length ? 0 : -1;
  }
  function search(keep) {
    const r = root(); if (!r) return;
    const { re, error } = build(S.q, opts);
    S.error = error;
    S.matches = re ? findAll(r, re) : [];
    if (!S.matches.length) S.cur = -1;
    else if (keep && S.cur >= 0) S.cur = Math.min(S.cur, S.matches.length - 1);
    else if (S.anchor && S.anchor.isConnected !== false && S.anchor.node.isConnected) S.cur = firstAtOrAfter(S.anchor.node, S.anchor.off);
    else S.cur = 0;
    paint(); update();
    if (S.cur >= 0 && !keep) reveal(S.ranges[S.cur]);
  }
  F.search = search;
  const searchSoon = X.util.debounce(() => { if (S.open) search(true); }, 120);
  function update() {
    const b = bar(); if (!b) return;
    const cnt = b.querySelector('.ed-wr-find__count'), err = b.querySelector('.ed-wr-find__err');
    err.hidden = !S.error; err.textContent = S.error ? t('find.badregex', 'Invalid regular expression: {e}', { e: S.error }) : '';
    cnt.textContent = !S.q || S.error ? '' : !S.matches.length ? t('find.none', 'No matches') : t('find.count', '{n} of {m}', { n: S.cur + 1, m: S.matches.length >= MAX ? MAX + '+' : S.matches.length });
    const q = b.querySelector('.ed-wr-find__q'); q.setAttribute('aria-invalid', String(!!S.error));
    b.querySelectorAll('[data-opt]').forEach((o) => o.setAttribute('aria-pressed', String(!!opts[o.dataset.opt])));
    const ro = X.editor.readonly();
    b.querySelector('.ed-wr-find__rep').hidden = !S.replace || ro;
    b.querySelector('[data-wr="toggle"]').setAttribute('aria-expanded', String(S.replace && !ro));
    b.querySelectorAll('[data-wr="nav"]').forEach((n) => { n.disabled = !S.matches.length; });
    b.querySelectorAll('[data-wr="rep1"],[data-wr="repall"]').forEach((n) => { n.disabled = !S.matches.length || ro; });
  }
  function go(d) {
    if (!S.matches.length) return;
    S.cur = (S.cur + d + S.matches.length) % S.matches.length;
    S.anchor = null; paint(); update(); reveal(S.ranges[S.cur]);
  }
  F.next = () => go(1); F.prev = () => go(-1);

  /* ---------- replacing ---------- */
  function applyReplace(m, rep) {
    const n = m.segs.length;
    m.segs.forEach((sg, i) => {
      const v = sg.node.nodeValue;
      sg.node.nodeValue = i === 0 ? v.slice(0, sg.a) + rep + (n === 1 ? v.slice(sg.b) : '') : i === n - 1 ? v.slice(sg.b) : '';
    });
    m.segs.forEach((sg) => {
      if (sg.node.nodeValue !== '') return;
      let p = sg.node.parentNode; sg.node.remove();
      while (p && p !== root() && !p.firstChild && !BLOCK.test(p.tagName)) { const up = p.parentNode; p.remove(); p = up; }
      if (p && p !== root() && !p.firstChild && /^(P|H[1-6]|LI|TD|TH)$/.test(p.tagName)) p.appendChild(document.createElement('br'));
    });
  }
  function replaceOne() {
    const m = S.matches[S.cur]; if (!m || X.editor.readonly()) return;
    const rep = expand(S.rep, m.m), node = m.segs[0].node, off = m.segs[0].a + rep.length;
    X.editor.run(() => applyReplace(m, rep), { keepFocus: true });
    S.anchor = node.isConnected ? { node, off } : null;
    S.cur = -1; search(false);
  }
  function replaceAll() {
    if (!S.matches.length || X.editor.readonly()) return 0;
    const list = S.matches.slice(), n = list.length;
    X.events.emit('before-bulk-change', { reason: 'replace-all', count: n }); // lets the versions module snapshot first
    X.editor.run(() => { for (let i = list.length - 1; i >= 0; i--) applyReplace(list[i], expand(S.rep, list[i].m)); }, { keepFocus: true });
    S.anchor = null; search(false);
    X.editor.toast(t('find.replaced', 'Replaced {n} matches', { n }), 'info', 2500);
    return n;
  }
  F.replaceOne = replaceOne; F.replaceAll = replaceAll;

  /* ---------- UI ---------- */
  F.inject = function (shell) {
    if (shell.querySelector('#ed-wr-find')) return;
    const sc = shell.querySelector('#ed-scroll'); if (!sc) return;
    const b = document.createElement('div');
    b.id = 'ed-wr-find'; b.className = 'ed-wr-find ed-ui'; b.setAttribute('role', 'search'); b.setAttribute('aria-label', t('find.title', 'Find and replace')); b.hidden = true;
    const ob = (k, label, txt) => '<button type="button" class="ed-wr-opt" data-opt="' + k + '" aria-pressed="false" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + txt + '</button>';
    b.innerHTML =
      '<div class="ed-wr-find__row"><button type="button" class="ed-wr-opt ed-wr-find__tg" data-wr="toggle" aria-expanded="false" title="' + esc(t('find.togglerep', 'Show replace')) + '" aria-label="' + esc(t('find.togglerep', 'Show replace')) + '">' + icon('chevron-right') + '</button>' +
      '<input type="text" class="ed-wr-find__q" placeholder="' + esc(t('find.ph', 'Find')) + '" aria-label="' + esc(t('find.ph', 'Find')) + '" autocomplete="off" spellcheck="false">' +
      ob('case', t('find.case', 'Match case'), 'Aa') + ob('word', t('find.word', 'Whole word'), '<u>ab</u>') + ob('regex', t('find.regex', 'Regular expression'), '.*') +
      '<span class="ed-wr-find__count" aria-live="polite"></span>' +
      '<button type="button" class="ed-wr-opt" data-wr="nav" data-d="-1" title="' + esc(t('find.prev', 'Previous match (Shift+F3)')) + '" aria-label="' + esc(t('find.prev', 'Previous match (Shift+F3)')) + '">' + icon('chevron-down') + '</button>' +
      '<button type="button" class="ed-wr-opt" data-wr="nav" data-d="1" title="' + esc(t('find.next', 'Next match (F3)')) + '" aria-label="' + esc(t('find.next', 'Next match (F3)')) + '">' + icon('chevron-down') + '</button>' +
      '<button type="button" class="ed-wr-opt" data-wr="close" title="' + esc(t('find.close', 'Close (Esc)')) + '" aria-label="' + esc(t('find.close', 'Close (Esc)')) + '">' + icon('x') + '</button></div>' +
      '<div class="ed-wr-find__row ed-wr-find__rep" hidden><span class="ed-wr-find__sp"></span><input type="text" class="ed-wr-find__r" placeholder="' + esc(t('find.rph', 'Replace with')) + '" aria-label="' + esc(t('find.rph', 'Replace with')) + '" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="btn btn--sm" data-wr="rep1">' + esc(t('find.replace', 'Replace')) + '</button><button type="button" class="btn btn--sm" data-wr="repall">' + esc(t('find.replaceall', 'Replace all')) + '</button></div>' +
      '<div class="ed-wr-find__err" role="alert" hidden></div>';
    sc.before(b);
    const q = b.querySelector('.ed-wr-find__q'), r = b.querySelector('.ed-wr-find__r');
    q.value = S.q; r.value = S.rep;
    q.addEventListener('input', () => { S.q = q.value; S.anchor = anchorNow(); S.cur = -1; search(false); });
    r.addEventListener('input', () => { S.rep = r.value; });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } });
    b.addEventListener('click', (e) => {
      const o = e.target.closest('[data-opt]'), a = e.target.closest('[data-wr]');
      if (o) { opts[o.dataset.opt] = !opts[o.dataset.opt]; WR.savePrefs(); S.cur = -1; search(false); return; }
      if (!a) return;
      ({ nav: () => go(+a.dataset.d), close: F.close, rep1: replaceOne, repall: replaceAll, toggle: () => { S.replace = !S.replace; update(); } })[a.dataset.wr]();
    });
    // keep the document selection when clicking the bar's buttons
    b.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    if (S.open) { b.hidden = false; update(); }
  };
  function anchorNow() {
    const s = window.getSelection(), r = root();
    if (s.rangeCount && r && r.contains(s.anchorNode) && s.anchorNode.nodeType === 3) return { node: s.anchorNode, off: Math.min(s.anchorOffset, s.focusOffset) };
    return S.anchor;
  }
  F.isOpen = () => S.open;
  F.open = function (replace) {
    const r = root(); if (!r || !X.editor.current()) return false;
    const b = bar(); if (!b) return false;
    if (!S.open) { S.saved = X.editor.getSel(); S.anchor = anchorNow(); }
    S.open = true; S.replace = !!replace || (S.replace && S.open);
    if (replace) S.replace = true;
    const sel = X.editor.selectedText();
    if (sel && sel.length <= 120 && !/\n/.test(sel)) { S.q = sel; b.querySelector('.ed-wr-find__q').value = sel; }
    b.hidden = false;
    const q = b.querySelector('.ed-wr-find__q'); q.focus(); q.select();
    S.cur = -1; search(false);
    if (replace && !X.editor.readonly()) { const rr = b.querySelector('.ed-wr-find__r'); rr.focus(); }
    return true;
  };
  F.close = function () {
    if (!S.open) return;
    S.open = false; clearPaint(); S.matches = []; S.ranges = [];
    const b = bar(); if (b) b.hidden = true;
    X.editor.restore();
    if (S.saved) X.editor.setSel(S.saved);
    S.saved = null;
  };
  X.events.on('content-change', () => { if (S.open) searchSoon(); });
  X.events.on('doc-close', () => { if (S.open) { S.open = false; clearPaint(); const b = bar(); if (b) b.hidden = true; } });
  X.events.on('doc-open', () => { if (S.open) { S.open = false; clearPaint(); const b = bar(); if (b) b.hidden = true; } });
  X.print.before(() => { clearPaint(); });
  X.print.after(() => { if (S.open) paint(); });

  const reg = (id, labelKey, label, run) => X.commands.register(id, { labelKey, label, icon: 'search', group: 'Writing', groupKey: 'edx.writing.group', readonlyOk: true, when: () => !!X.editor.current(), run });
  reg('writing.find', 'edx.writing.cmd.find', 'Find', () => F.open(false));
  reg('writing.replace', 'edx.writing.cmd.replace', 'Find and replace', () => F.open(true));
  reg('writing.find-next', 'edx.writing.cmd.fnext', 'Find next', () => { if (!S.open) { if (!F.open(false)) return; } else go(1); });
  reg('writing.find-prev', 'edx.writing.cmd.fprev', 'Find previous', () => { if (!S.open) { if (!F.open(false)) return; } else go(-1); });
  WR.shortcuts.find = X.shortcuts.add('mod-f', 'writing.find');
  WR.shortcuts.replace = X.shortcuts.add('mod-h', 'writing.replace');
  WR.shortcuts.next = X.shortcuts.add('f3', 'writing.find-next');
  WR.shortcuts.prev = X.shortcuts.add('shift-f3', 'writing.find-prev');
  X.toolbar.add({ id: 'writing.find', group: 'writing', icon: 'search', labelKey: 'edx.writing.cmd.find', label: 'Find', kbd: 'mod-f', order: 0, readonlyOk: true, run: () => X.commands.run('writing.find'), isActive: () => S.open });
})();
