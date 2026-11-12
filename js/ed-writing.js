/* Todo4Me — editor module "writing": statistics + writing goal, outline panel, table of contents widget, focus / typewriter / full-screen modes.
 * Find & replace lives in js/ed-writing-find.js. Contract: docs/EDITOR-EXTENSIONS.md. Meta field: wr_goal. Widget: toc {levels, title?, numbered?}. */
(function () {
  'use strict';
  const X = T4.edx;
  const esc = X.util.esc, icon = X.util.icon;
  const t = (k, fb, p) => X.t('edx.writing.' + k, fb, p);
  const W = () => T4.edw;
  const root = () => { try { return X.editor.root(); } catch (e) { return null; } };
  const cur = () => { try { return X.editor.current(); } catch (e) { return null; } };

  /* ---------- preferences (localStorage, try/catch) ---------- */
  const PKEY = 'todo4me.editor.writing';
  const prefs = { dim: false, typewriter: false, outlineMax: 6, find: { case: false, word: false, regex: false } };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { /* ignore */ }
  prefs.find = Object.assign({ case: false, word: false, regex: false }, prefs.find || {});
  const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  const WR = (T4.edWriting = { prefs, savePrefs, t, state: { focus: false } });

  /* ---------- meta ---------- */
  X.meta.extend({ wr_goal: { default: null, dup: 'copy', clean: (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(1000000, Math.round(v)) : null) } });

  /* ====================== Statistics ====================== */
  const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
  const SURR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  const hasLetter = /[\p{L}\p{N}]/u;
  function statsOf(text) {
    const words = (text.match(WORD_RE) || []).length;
    let withSp = 0, noSp = 0, paras = 0, sentences = 0;
    text.split('\n').forEach((ln) => {
      const s = ln.replace(/​/g, '').trim();
      if (!s) return;
      paras++;
      withSp += s.length - (s.match(SURR) || []).length;
      noSp += s.replace(/\s/g, '').length - (s.replace(/\s/g, '').match(SURR) || []).length;
      sentences += s.split(/[.!?…]+(?:\s+|$)/).filter((x) => hasLetter.test(x)).length;
    });
    return { words, chars: withSp, charsNoSpaces: noSp, paragraphs: paras, sentences, reading: words / 238, speaking: words / 130 };
  }
  WR.statsOf = statsOf;
  function fmtMinutes(m) {
    if (m < 1) return t('time.lt1', '< 1 min');
    const r = Math.round(m);
    return r >= 60 ? t('time.hm', '{h} h {m} min', { h: Math.floor(r / 60), m: r % 60 }) : t('time.m', '{m} min', { m: r });
  }
  const nf = (n) => { try { return T4.i18n.fmtNumber(n); } catch (e) { return String(n); } };

  /* Readability: language guess by common words; Flesch (EN) / Amstad (DE). Other languages: no score. */
  const STOP = {
    en: 'the and of to a in is that it for with as was on are be this by have not or from at but they you he she we an'.split(' '),
    de: 'der die das und ist nicht ein eine ich zu mit den von sie auf für dem im es auch sich wir als bei nach aus wie oder aber'.split(' '),
    es: 'el la de que y en los las un una es por con para se del al no su más'.split(' '),
    tr: 've bir bu için ile de da çok ne gibi daha olarak ama ben sen o var yok'.split(' '),
  };
  function guessLang(words) {
    if (words.length < 30) return null;
    const sc = {};
    Object.keys(STOP).forEach((l) => { const set = new Set(STOP[l]); sc[l] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0) / words.length; });
    const arr = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    return arr[0][1] >= 0.1 && arr[0][1] >= arr[1][1] * 1.3 ? arr[0][0] : null;
  }
  function sylEn(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }
  const sylDe = (w) => { const m = w.toLowerCase().match(/[aeiouäöüy]+/g); return Math.max(1, m ? m.length : 1); };
  function readability(text) {
    const words = (text.toLowerCase().match(/[\p{L}][\p{L}'’\-]*/gu) || []);
    const lang = guessLang(words);
    if (lang !== 'en' && lang !== 'de') return null;
    const sentences = Math.max(1, statsOf(text).sentences);
    const syl = words.reduce((n, w) => n + (lang === 'en' ? sylEn(w) : sylDe(w)), 0);
    const asl = words.length / sentences, asw = syl / words.length;
    const raw = lang === 'en' ? 206.835 - 1.015 * asl - 84.6 * asw : 180 - asl - 58.5 * asw;
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const band = score >= 90 ? 'veryeasy' : score >= 80 ? 'easy' : score >= 70 ? 'fairlyeasy' : score >= 60 ? 'plain' : score >= 50 ? 'fairlyhard' : score >= 30 ? 'hard' : 'veryhard';
    return { lang, score, band };
  }
  WR.readability = readability;

  const goalOf = () => { const c = cur(); return c && c.meta && c.meta.wr_goal ? c.meta.wr_goal : null; };
  const base = {}; // words at document open (session delta)
  let last = null; // last document stats
  let selStats = null;
  const panelHosts = { stats: new Set(), outline: new Set() };

  function computeStats() {
    const c = cur(); if (!c || !root()) { last = null; return; }
    const text = X.editor.textOf();
    last = Object.assign(statsOf(text), { text, read: null });
    if (!(c.id in base)) base[c.id] = last.words;
  }
  const computeSoon = X.util.debounce(() => { computeStats(); renderStatus(); fillStats(); }, 300);
  WR.refreshStats = () => { computeStats(); renderStatus(); fillStats(); return last; };
  WR.getStats = () => last;

  /* ---------- status bar ---------- */
  const RING = 2 * Math.PI * 8;
  function ringHTML() {
    return '<svg class="ed-wr-ring" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle class="ed-wr-ring__bg" cx="10" cy="10" r="8"/>' +
      '<circle class="ed-wr-ring__fg" cx="10" cy="10" r="8" transform="rotate(-90 10 10)" stroke-dasharray="' + RING.toFixed(2) + '" stroke-dashoffset="' + RING.toFixed(2) + '"/></svg>';
  }
  function injectStatus(shellRoot) {
    const bar = shellRoot.querySelector('.ed-statusbar'); if (!bar || bar.querySelector('.ed-wr-sb')) return;
    const sb = document.createElement('span');
    sb.className = 'ed-wr-sb ed-ui';
    sb.innerHTML = '<span class="ed-wr-sb__sel" hidden></span><span class="ed-wr-sb__time muted"></span>' +
      '<button type="button" class="ed-wr-goalbtn" data-wr="goal">' + ringHTML() + '<span class="ed-wr-goalbtn__txt"></span></button>';
    const anchor = shellRoot.querySelector('#ed-pagesinfo');
    if (anchor) anchor.after(sb); else bar.prepend(sb);
    sb.querySelector('.ed-wr-goalbtn').addEventListener('click', () => X.panels.open('writing-stats'));
    renderStatus();
  }
  function renderStatus() {
    const sb = document.querySelector('.ed-wr-sb'); if (!sb) return;
    const time = sb.querySelector('.ed-wr-sb__time'), selEl = sb.querySelector('.ed-wr-sb__sel'), btn = sb.querySelector('.ed-wr-goalbtn');
    time.textContent = last ? t('sb.read', '{time} read', { time: fmtMinutes(last.reading) }) : '';
    if (selStats && selStats.words) { selEl.hidden = false; selEl.textContent = t('sb.sel', '{w} words, {c} characters selected', { w: nf(selStats.words), c: nf(selStats.chars) }); } else { selEl.hidden = true; selEl.textContent = ''; }
    const goal = goalOf(), words = last ? last.words : 0;
    const fg = sb.querySelector('.ed-wr-ring__fg'), txt = sb.querySelector('.ed-wr-goalbtn__txt');
    const p = goal ? Math.min(1, words / goal) : 0;
    fg.setAttribute('stroke-dashoffset', (RING * (1 - p)).toFixed(2));
    btn.classList.toggle('is-done', !!goal && words >= goal);
    btn.dataset.progress = goal ? String(Math.round(p * 100)) : '';
    txt.textContent = goal ? nf(words) + ' / ' + nf(goal) : t('goal.set', 'Goal');
    const label = goal ? t('goal.label', 'Writing goal: {w} of {g} words', { w: nf(words), g: nf(goal) }) : t('goal.none', 'Set a writing goal');
    btn.title = label; btn.setAttribute('aria-label', label);
  }
  function selectionStats() {
    let s = '';
    try { s = X.editor.selectedText(); } catch (e) { /* ignore */ }
    selStats = s && s.trim() ? { words: (s.match(WORD_RE) || []).length, chars: s.length } : null;
    renderStatus(); fillStats();
  }

  /* ---------- statistics panel ---------- */
  function renderStatsPanel(host) {
    host.classList.add('ed-wr-panel');
    host.innerHTML =
      '<h3 class="ed-wr-h">' + esc(t('stats.doc', 'Document')) + '</h3><dl class="ed-wr-dl" data-wr="doc"></dl>' +
      '<div data-wr="selwrap" hidden><h3 class="ed-wr-h">' + esc(t('stats.sel', 'Selection')) + '</h3><dl class="ed-wr-dl" data-wr="sel"></dl></div>' +
      '<h3 class="ed-wr-h">' + esc(t('goal.title', 'Writing goal')) + '</h3>' +
      '<div class="ed-wr-goal"><label class="ed-wr-goal__lab" for="ed-wr-goal-in">' + esc(t('goal.words', 'Goal in words')) + '</label>' +
      '<div class="ed-wr-goal__row"><input type="number" min="0" max="1000000" step="50" id="ed-wr-goal-in" class="ed-wr-input" placeholder="0" data-wr="goal-in">' +
      '<button type="button" class="btn btn--sm" data-wr="goal-clear">' + esc(t('goal.clear', 'Clear')) + '</button></div>' +
      '<div class="ed-wr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" data-wr="goal-bar"><span></span></div>' +
      '<p class="ed-wr-note" data-wr="goal-txt"></p><p class="ed-wr-note" data-wr="session"></p></div>' +
      '<div data-wr="readwrap" hidden><h3 class="ed-wr-h">' + esc(t('read.title', 'Readability')) + '</h3><p class="ed-wr-read" data-wr="read"></p>' +
      '<p class="ed-wr-note" data-wr="read-note"></p></div>';
    const inp = host.querySelector('[data-wr="goal-in"]');
    const commit = () => {
      const c = cur(); if (!c || X.editor.readonly()) return;
      const v = Math.round(Number(inp.value));
      const goal = Number.isFinite(v) && v > 0 ? Math.min(1000000, v) : null;
      if (goal === (c.meta.wr_goal || null)) return;
      X.docs.updateMeta(c.id, { wr_goal: goal }).then(() => { renderStatus(); fillStats(); }).catch(() => {});
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    host.querySelector('[data-wr="goal-clear"]').addEventListener('click', () => { inp.value = ''; commit(); });
    panelHosts.stats.add(host);
    computeStats(); fillStats();
  }
  function dl(rows) { return rows.map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join(''); }
  function fillStats() {
    panelHosts.stats.forEach((host) => {
      if (!host.isConnected) { panelHosts.stats.delete(host); return; }
      const q = (k) => host.querySelector('[data-wr="' + k + '"]');
      if (!last) { q('doc').innerHTML = ''; return; }
      q('doc').innerHTML = dl([
        [t('stats.words', 'Words'), nf(last.words)], [t('stats.chars', 'Characters (with spaces)'), nf(last.chars)], [t('stats.charsNo', 'Characters (without spaces)'), nf(last.charsNoSpaces)],
        [t('stats.paras', 'Paragraphs'), nf(last.paragraphs)], [t('stats.sentences', 'Sentences'), nf(last.sentences)],
        [t('stats.reading', 'Reading time'), fmtMinutes(last.reading)], [t('stats.speaking', 'Speaking time'), fmtMinutes(last.speaking)],
      ]);
      q('selwrap').hidden = !selStats;
      if (selStats) q('sel').innerHTML = dl([[t('stats.words', 'Words'), nf(selStats.words)], [t('stats.chars', 'Characters (with spaces)'), nf(selStats.chars)]]);
      const goal = goalOf(), inp = q('goal-in');
      if (document.activeElement !== inp) inp.value = goal || '';
      inp.disabled = X.editor.readonly();
      const pct = goal ? Math.min(100, Math.round((last.words / goal) * 100)) : 0;
      q('goal-bar').hidden = !goal; q('goal-bar').setAttribute('aria-valuenow', String(pct)); q('goal-bar').querySelector('span').style.width = pct + '%';
      q('goal-txt').textContent = goal ? t('goal.progress', '{w} of {g} words ({p}%)', { w: nf(last.words), g: nf(goal), p: pct }) : t('goal.hint', 'Set a word goal to see your progress in the status bar.');
      const c = cur(), d = last.words - (c && c.id in base ? base[c.id] : last.words);
      q('session').textContent = t('goal.session', 'This session: {d} words', { d: (d > 0 ? '+' : d < 0 ? '−' : '') + nf(Math.abs(d)) });
      const r = readability(last.text);
      q('readwrap').hidden = !r;
      if (r) {
        q('read').textContent = r.score + ' / 100 · ' + t('read.' + r.band, r.band);
        q('read-note').textContent = r.lang === 'en' ? t('read.flesch', 'Flesch reading ease (English). Higher is easier. An estimate.') : t('read.amstad', 'Amstad readability (German). Higher is easier. An estimate.');
      }
    });
  }
  X.panels.register({
    id: 'writing-stats', side: 'right', titleKey: 'edx.writing.stats.title', title: 'Statistics', icon: 'progress', order: 21,
    render: renderStatsPanel,
    onDocChange() { computeStats(); renderStatus(); fillStats(); },
    onOpen() { computeStats(); fillStats(); },
  });

  /* ====================== Outline panel ====================== */
  const collapsed = new Set();
  let pendingFocus = null, activeIdx = -1;
  const isH = (n) => n && n.nodeType === 1 && /^H[1-6]$/.test(n.tagName);
  function outlineItems() {
    const seen = {};
    return X.editor.headings().map((h) => { const k = h.level + '|' + h.text; seen[k] = (seen[k] || 0) + 1; return Object.assign({ key: k + '#' + seen[k] }, h); });
  }
  function renderOutlinePanel(host) {
    host.classList.add('ed-wr-panel');
    host.innerHTML = '<div class="ed-wr-ol__tools"><label class="ed-wr-ol__lab" for="ed-wr-ol-max">' + esc(t('ol.levels', 'Show levels')) + '</label>' +
      '<select id="ed-wr-ol-max" class="ed-wr-input" data-wr="max">' + [6, 1, 2, 3, 4, 5].map((n) => '<option value="' + n + '">' + esc(n === 6 ? t('ol.all', 'All levels') : t('ol.upto', 'Up to level {n}', { n })) + '</option>').join('') + '</select></div>' +
      '<ul class="ed-wr-ol" data-wr="list" aria-label="' + esc(t('ol.title', 'Outline')) + '"></ul><p class="ed-wr-note" data-wr="empty" hidden>' + esc(t('ol.empty', 'No headings yet. Use the paragraph style menu to add headings.')) + '</p>';
    const sel = host.querySelector('[data-wr="max"]');
    sel.value = String(prefs.outlineMax || 6);
    sel.addEventListener('change', () => { prefs.outlineMax = +sel.value; savePrefs(); fillOutline(); });
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const li = b.closest('[data-i]'); const i = +li.dataset.i; const items = outlineItems(); const it = items[i]; if (!it) return;
      const act = b.dataset.act;
      if (act === 'go') { goToHeading(it.el); }
      else if (act === 'fold') { if (collapsed.has(it.key)) collapsed.delete(it.key); else collapsed.add(it.key); fillOutline(); }
      else if (act === 'up' || act === 'down') { pendingFocus = { el: it.el, act }; if (!moveSection(it.el, act === 'up' ? -1 : 1)) { pendingFocus = null; X.editor.toast(t('ol.cantmove', 'This section cannot move further.'), 'info'); } }
    });
    panelHosts.outline.add(host);
    fillOutline();
  }
  function goToHeading(el) {
    const r = root(); if (!el || !el.isConnected || !r) return false;
    X.editor.scrollToBlock(el, { block: 'start', caret: true });
    try { r.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return true;
  }
  WR.goToHeading = goToHeading;
  function fillOutline() {
    panelHosts.outline.forEach((host) => {
      if (!host.isConnected) { panelHosts.outline.delete(host); return; }
      const items = outlineItems(), list = host.querySelector('[data-wr="list"]'), max = prefs.outlineMax || 6;
      host.querySelector('[data-wr="empty"]').hidden = items.length > 0;
      const ro = X.editor.readonly();
      let skipLevel = null, html = '';
      const minLevel = items.length ? Math.min.apply(null, items.map((x) => x.level)) : 1;
      items.forEach((it, i) => {
        if (skipLevel !== null && it.level > skipLevel) return;
        skipLevel = null;
        const next = items[i + 1], has = !!next && next.level > it.level, isC = collapsed.has(it.key);
        if (has && isC) skipLevel = it.level;
        if (it.level > max) return;
        const txt = it.text || t('ol.emptyHeading', '(empty heading)');
        html += '<li class="ed-wr-ol__item" data-i="' + i + '" data-level="' + it.level + '" style="--d:' + (it.level - minLevel) + '">' +
          (has && it.level < max ? '<button type="button" class="ed-wr-ol__fold" data-act="fold" aria-expanded="' + !isC + '" aria-label="' + esc(isC ? t('ol.expand', 'Expand') : t('ol.collapse', 'Collapse')) + '">' + icon(isC ? 'chevron-right' : 'chevron-down') + '</button>' : '<span class="ed-wr-ol__fold"></span>') +
          '<button type="button" class="ed-wr-ol__go" data-act="go" title="' + esc(txt) + '"><span class="ed-wr-ol__lv">H' + it.level + '</span><span class="ed-wr-ol__txt">' + esc(txt) + '</span></button>' +
          (ro ? '' : '<span class="ed-wr-ol__mv"><button type="button" data-act="up" aria-label="' + esc(t('ol.up', 'Move section up')) + '" title="' + esc(t('ol.up', 'Move section up')) + '">' + icon('chevron-down') + '</button>' +
            '<button type="button" data-act="down" aria-label="' + esc(t('ol.down', 'Move section down')) + '" title="' + esc(t('ol.down', 'Move section down')) + '">' + icon('chevron-down') + '</button></span>') +
          '</li>';
      });
      list.innerHTML = html;
      if (pendingFocus) {
        const idx = items.findIndex((x) => x.el === pendingFocus.el);
        const b = idx >= 0 && list.querySelector('[data-i="' + idx + '"] [data-act="' + pendingFocus.act + '"]');
        if (b) b.focus();
        pendingFocus = null;
      }
      markActive();
    });
  }
  function markActive() {
    const sc = document.getElementById('ed-scroll'); if (!sc) return;
    const items = X.editor.headings(); const top = sc.getBoundingClientRect().top + 90;
    let a = -1;
    for (let i = 0; i < items.length; i++) { if (items[i].el.getBoundingClientRect().top <= top) a = i; else break; }
    if (a < 0 && items.length) a = 0;
    activeIdx = a;
    panelHosts.outline.forEach((host) => {
      if (!host.isConnected) return;
      host.querySelectorAll('.ed-wr-ol__item').forEach((li) => {
        const on = +li.dataset.i === a; li.classList.toggle('is-active', on);
        const g = li.querySelector('.ed-wr-ol__go'); if (on) g.setAttribute('aria-current', 'location'); else g.removeAttribute('aria-current');
      });
    });
  }
  WR.activeHeading = () => activeIdx;
  let raf = 0;
  const onScroll = () => { if (raf || !panelHosts.outline.size) return; raf = requestAnimationFrame(() => { raf = 0; markActive(); }); };

  function sectionNodes(h) {
    const L = +h.tagName[1], nodes = [h]; let n = h.nextElementSibling;
    while (n && !(isH(n) && +n.tagName[1] <= L)) { nodes.push(n); n = n.nextElementSibling; }
    return { nodes, next: n };
  }
  /** Move the section starting at heading h (heading + following blocks up to the next heading of the same or a higher level) past its sibling section. */
  function moveSection(h, dir) {
    const r = root(); if (!r || !h || h.parentNode !== r || X.editor.readonly()) return false;
    const L = +h.tagName[1];
    if (dir < 0) {
      let p = h.previousElementSibling;
      while (p && !(isH(p) && +p.tagName[1] <= L)) p = p.previousElementSibling;
      if (!p || +p.tagName[1] !== L) return false;
      X.editor.run(() => { sectionNodes(h).nodes.forEach((n) => r.insertBefore(n, p)); }, { keepFocus: true });
    } else {
      const { nodes, next } = sectionNodes(h);
      if (!next || +next.tagName[1] !== L) return false;
      const ref = sectionNodes(next).next;
      X.editor.run(() => { nodes.forEach((n) => r.insertBefore(n, ref)); }, { keepFocus: true });
    }
    X.editor.scrollToBlock(h, { block: 'nearest' });
    return true;
  }
  WR.moveSection = moveSection;

  X.panels.register({
    id: 'writing-outline', side: 'right', titleKey: 'edx.writing.ol.title', title: 'Outline', icon: 'list', order: 20,
    render: renderOutlinePanel,
    onDocChange() { fillOutline(); },
    onOpen() { fillOutline(); },
  });
  const outlineOpen = () => X.panels.active('right') === 'writing-outline';
  const outlineSoon = X.util.debounce(() => { if (outlineOpen()) fillOutline(); }, 250);
  WR.refreshOutline = fillOutline;

  /* ====================== Table of contents widget ====================== */
  function tocHeads(levels) {
    const r = root(); if (!r) return [];
    return Array.from(r.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => !h.closest('.t4-w')).map((h, index) => ({ level: +h.tagName[1], text: (h.textContent || '').replace(/​/g, '').trim(), el: h, index })).filter((h) => h.level <= levels);
  }
  function numbering(heads) {
    const min = heads.length ? Math.min.apply(null, heads.map((h) => h.level)) : 1, cnt = [], out = [];
    let prev = 0;
    heads.forEach((h) => {
      let d = Math.min(h.level - min, prev + 1); prev = d;
      cnt[d] = (cnt[d] || 0) + 1; cnt.length = d + 1;
      out.push({ depth: d, num: cnt.map((c) => c || 1).join('.') });
    });
    return out;
  }
  WR.numbering = numbering;
  const tocSig = (p, heads) => p.levels + '|' + (p.numbered ? 1 : 0) + '|' + (p.title === undefined ? '' : 'T' + p.title) + '|' + heads.map((h) => h.level + h.text).join('\n');
  X.widgets.register('toc', {
    inline: false,
    defaults: { levels: 3 },
    validate(p) {
      p = p || {};
      const lv = Math.round(Number(p.levels));
      const out = { levels: Number.isFinite(lv) ? Math.min(6, Math.max(1, lv)) : 3 };
      if (typeof p.title === 'string') out.title = p.title.replace(/[\u0000-\u001f]/g, '').slice(0, 120);
      if (p.numbered === true) out.numbered = true;
      return out;
    },
    render(el, p) {
      const heads = tocHeads(p.levels), nums = p.numbered ? numbering(heads) : null;
      const title = p.title === undefined ? t('toc.title', 'Table of contents') : p.title;
      const box = document.createElement('div');
      box.className = 't4-wr-toc'; box.setAttribute('role', 'navigation'); box.setAttribute('aria-label', title || t('toc.title', 'Table of contents'));
      if (title) { const h = document.createElement('div'); h.className = 't4-wr-toc__title'; h.textContent = title; box.appendChild(h); }
      if (!heads.length) {
        const e = document.createElement('p'); e.className = 't4-wr-toc__empty'; e.textContent = t('toc.empty', 'Add headings and they will appear here.'); box.appendChild(e);
      } else {
        const ul = document.createElement('ul'); ul.className = 't4-wr-toc__list';
        heads.forEach((h, i) => {
          const li = document.createElement('li'); li.className = 't4-wr-toc__item t4-wr-toc__d' + (nums ? nums[i].depth : h.level - 1);
          const b = document.createElement('button'); b.type = 'button'; b.className = 'cw-input t4-wr-toc__link'; b.setAttribute('data-hidx', String(h.index));
          if (nums) { const s = document.createElement('span'); s.className = 't4-wr-toc__num'; s.textContent = nums[i].num; b.appendChild(s); }
          const tx = document.createElement('span'); tx.className = 't4-wr-toc__txt'; tx.textContent = h.text || t('ol.emptyHeading', '(empty heading)'); b.appendChild(tx);
          li.appendChild(b); ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      el.appendChild(box);
      el._wrSig = tocSig(p, heads);
    },
    textOf: () => '',
    async toMarkdown(p) {
      const heads = tocHeads(p.levels), nums = p.numbered ? numbering(heads) : null;
      const min = heads.length ? Math.min.apply(null, heads.map((h) => h.level)) : 1;
      const title = p.title === undefined ? t('toc.title', 'Table of contents') : p.title;
      return (title ? '**' + title + '**\n\n' : '') + heads.map((h, i) => '  '.repeat(nums ? nums[i].depth : h.level - min) + '- ' + (nums ? nums[i].num + ' ' : '') + h.text).join('\n');
    },
    ctxBar: {
      label: 'Table of contents', labelKey: 'edx.writing.toc.title',
      items: (el, p) => [
        { action: 'lv-', icon: 'minus', label: t('toc.fewer', 'Fewer levels') }, { hint: t('toc.levels', 'Levels 1 to {n}', { n: p.levels }) }, { action: 'lv+', icon: 'plus', label: t('toc.more', 'More levels') },
        { sep: true }, { action: 'num', icon: 'list-ol', label: t('toc.numbered', 'Numbered'), on: !!p.numbered }, { action: 'edit', icon: 'edit', label: t('toc.edit', 'Edit table of contents') },
        { sep: true }, { builtin: 'delete', icon: 'trash', label: t('toc.delete', 'Delete table of contents') },
      ],
      onAction(a, { props, setProps, edit }) {
        if (a === 'lv-') setProps({ levels: Math.max(1, props.levels - 1) });
        else if (a === 'lv+') setProps({ levels: Math.min(6, props.levels + 1) });
        else if (a === 'num') setProps({ numbered: !props.numbered });
        else if (a === 'edit') edit();
      },
    },
    edit(el, p) {
      const body = '<div class="ed-wr-form"><label>' + esc(t('toc.f.title', 'Title (empty = none)')) + '<input type="text" class="ed-wr-input" maxlength="120" data-f="title"></label>' +
        '<label>' + esc(t('toc.f.levels', 'Heading levels')) + '<select class="ed-wr-input" data-f="levels">' + [1, 2, 3, 4, 5, 6].map((n) => '<option value="' + n + '">' + esc(t('toc.levels', 'Levels 1 to {n}', { n })) + '</option>').join('') + '</select></label>' +
        '<label class="ed-wr-check"><input type="checkbox" data-f="numbered"> ' + esc(t('toc.f.numbered', 'Number the entries')) + '</label></div>';
      X.editor.openModal({
        title: t('toc.edit', 'Edit table of contents'), size: 'sm', body,
        footer: '<button type="button" class="btn" data-action="modal-close">' + esc(T4.i18n.t('c.close')) + '</button><button type="button" class="btn btn--primary" data-f="save">' + esc(t('toc.save', 'Apply')) + '</button>',
        onMount(m) {
          m.querySelector('[data-f="title"]').value = p.title === undefined ? t('toc.title', 'Table of contents') : p.title;
          m.querySelector('[data-f="levels"]').value = String(p.levels);
          m.querySelector('[data-f="numbered"]').checked = !!p.numbered;
          m.querySelector('[data-f="save"]').addEventListener('click', () => {
            const np = { levels: +m.querySelector('[data-f="levels"]').value, title: m.querySelector('[data-f="title"]').value, numbered: m.querySelector('[data-f="numbered"]').checked };
            X.editor.closeModal(true);
            X.editor.run(() => W().setProps(el, np), { keepFocus: true });
          });
        },
      });
    },
  });
  /** Re-render table of contents widgets whose heading list changed (live update). */
  function updateTocs() {
    const r = root(); if (!r) return;
    r.querySelectorAll('.t4-w[data-w="toc"]').forEach((w) => {
      const p = X.widgets.validate('toc', W().getProps(w)); if (!p) return;
      if (w._wrSig !== tocSig(p, tocHeads(p.levels))) W().render(w);
    });
  }
  WR.updateTocs = updateTocs;
  const tocSoon = X.util.debounce(updateTocs, 200);
  X.slash.add({ id: 'writing.toc', labelKey: 'edx.writing.toc.title', label: 'Table of contents', keywords: ['toc', 'contents', 'inhaltsverzeichnis', 'outline', 'index'], icon: 'list', order: 40, run: () => insertToc() });
  X.menus.add('insert', { labelKey: 'edx.writing.toc.title', label: 'Table of contents', icon: 'list', order: 40, run: () => insertToc() });
  function insertToc() { return X.widgets.insert('toc', { props: { levels: 3 } }); }
  WR.insertToc = insertToc;
  // Print: a plain list (no page numbers are possible with browser printing); links look like text.
  X.print.addCSS(() => '.t4-wr-toc__link { color: inherit !important; text-decoration: none !important; } .t4-wr-toc__empty { display: none !important; } .ed-wr-dim .ed-doc > * { opacity: 1 !important; }');

  /* click on a TOC entry: jump to the heading */
  function onDocClick(e) {
    const b = e.target.closest && e.target.closest('.t4-wr-toc__link'); if (!b) return;
    e.preventDefault();
    const hs = X.editor.headings(), h = hs[+b.getAttribute('data-hidx')];
    if (h) goToHeading(h.el);
  }

  /* ====================== Focus, typewriter, dim, full screen ====================== */
  let shellEl = null;
  const body = document.body;
  function applyModes() {
    if (!shellEl) return;
    shellEl.classList.toggle('ed-wr-focus', WR.state.focus);
    shellEl.classList.toggle('ed-wr-dim', prefs.dim);
    shellEl.classList.toggle('ed-wr-typewriter', prefs.typewriter);
    body.classList.toggle('ed-wr-focus-on', WR.state.focus);
    if (WR.state.focus) { const bar = shellEl.querySelector('.ed-bar'), tb = shellEl.querySelector('.ed-toolbar'); shellEl.style.setProperty('--ed-wr-bar-h', (bar ? bar.offsetHeight : 52) + 'px'); shellEl.style.setProperty('--ed-wr-tb-h', (tb ? tb.offsetHeight : 40) + 'px'); }
    markBlock();
    const chip = shellEl.querySelector('.ed-wr-chip');
    if (chip) {
      chip.hidden = !WR.state.focus;
      chip.querySelector('[data-wr="dim"]').setAttribute('aria-pressed', String(prefs.dim));
      chip.querySelector('[data-wr="tw"]').setAttribute('aria-pressed', String(prefs.typewriter));
    }
  }
  function setFocus(on) { WR.state.focus = !!on; applyModes(); if (on) { const r = root(); if (r) r.focus({ preventScroll: true }); } }
  function toggleDim() { prefs.dim = !prefs.dim; savePrefs(); applyModes(); }
  function toggleTypewriter() { prefs.typewriter = !prefs.typewriter; savePrefs(); applyModes(); if (prefs.typewriter) centerCaret(true); }
  function fullscreenOn() { return !!document.fullscreenElement; }
  async function toggleFullscreen() {
    try {
      if (fullscreenOn()) await document.exitFullscreen();
      else await (shellEl || document.documentElement).requestFullscreen();
    } catch (e) {
      // The desktop app may deny the Fullscreen API: fall back to the distraction-free layout.
      setFocus(true);
      X.editor.toast(t('fs.denied', 'Full screen is not available here, so focus mode was switched on instead. In the desktop app use View > Toggle full screen.'), 'info', 6000);
    }
  }
  Object.assign(WR, { setFocus, toggleDim, toggleTypewriter, toggleFullscreen, markBlock, centerCaret });

  function markBlock() {
    const r = root(); if (!r) return;
    r.querySelectorAll('.is-wr-active').forEach((n) => n.classList.remove('is-wr-active'));
    if (!prefs.dim) return;
    const s = window.getSelection(); if (!s.rangeCount || !r.contains(s.anchorNode)) return;
    let n = s.anchorNode; while (n && n.parentNode !== r) n = n.parentNode;
    if (n && n.nodeType === 1) n.classList.add('is-wr-active');
  }
  let lastKey = 0;
  function centerCaret(force) {
    if (!prefs.typewriter) return;
    const r = root(), sc = document.getElementById('ed-scroll'); if (!r || !sc) return;
    if (!force && Date.now() - lastKey > 400) return; // only when the user types or moves the caret with the keyboard
    const s = window.getSelection(); if (!s.rangeCount || !r.contains(s.anchorNode) || !s.isCollapsed) return;
    const rg = s.getRangeAt(0); let rect = rg.getBoundingClientRect();
    if (!rect.height) { const n = rg.startContainer.nodeType === 1 ? rg.startContainer : rg.startContainer.parentElement; if (n) rect = n.getBoundingClientRect(); }
    if (!rect.height) return;
    const sr = sc.getBoundingClientRect(), delta = rect.top + rect.height / 2 - (sr.top + sr.height / 2);
    if (Math.abs(delta) > 2) sc.scrollTop += delta;
  }
  function onKeyTrack() { lastKey = Date.now(); }
  function onEscape(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (WR.find && WR.find.isOpen()) { e.preventDefault(); e.stopPropagation(); WR.find.close(); return; }
    if (!WR.state.focus || document.querySelector('dialog[open], .ed-menu')) return;
    e.preventDefault(); e.stopPropagation(); setFocus(false);
  }

  function injectChrome(shellRoot) {
    shellEl = shellRoot;
    const work = shellRoot.querySelector('.ed-work');
    if (work && !work.querySelector('.ed-wr-hot')) {
      const hot = document.createElement('div'); hot.className = 'ed-wr-hot ed-ui'; hot.setAttribute('aria-hidden', 'true'); work.prepend(hot);
      const chip = document.createElement('div'); chip.className = 'ed-wr-chip ed-ui'; chip.hidden = true; chip.setAttribute('role', 'toolbar'); chip.setAttribute('aria-label', t('focus.title', 'Focus mode'));
      chip.innerHTML = '<button type="button" data-wr="dim" aria-pressed="false" title="' + esc(t('focus.dim', 'Dim other paragraphs')) + '">' + esc(t('focus.dim.short', 'Dim')) + '</button>' +
        '<button type="button" data-wr="tw" aria-pressed="false" title="' + esc(t('focus.tw', 'Typewriter mode')) + '">' + esc(t('focus.tw.short', 'Typewriter')) + '</button>' +
        '<button type="button" data-wr="fs" title="' + esc(t('focus.fs', 'Full screen')) + '">' + esc(t('focus.fs.short', 'Full screen')) + '</button>' +
        '<button type="button" data-wr="exit" title="' + esc(t('focus.exit', 'Leave focus mode (Esc)')) + '">' + icon('x') + '</button>';
      chip.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-wr]'); if (!b) return;
        ({ dim: toggleDim, tw: toggleTypewriter, fs: toggleFullscreen, exit: () => setFocus(false) })[b.dataset.wr]();
      });
      work.appendChild(chip);
    }
    const doc = shellRoot.querySelector('#ed-doc'), sc = shellRoot.querySelector('#ed-scroll');
    if (doc) { doc.addEventListener('click', onDocClick); doc.addEventListener('keydown', onKeyTrack, true); doc.addEventListener('beforeinput', onKeyTrack, true); }
    if (sc) sc.addEventListener('scroll', onScroll, { passive: true });
    shellRoot.addEventListener('keydown', onEscape, true);
    injectStatus(shellRoot);
    applyModes();
    if (WR.find && WR.find.inject) WR.find.inject(shellRoot);
  }
  X.events.on('shell-built', ({ root: r }) => injectChrome(r));
  document.addEventListener('fullscreenchange', () => { if (shellEl) shellEl.classList.toggle('ed-wr-fullscreen', fullscreenOn()); });
  window.addEventListener('hashchange', () => { if (WR.state.focus && !/^#\/editor/.test(location.hash)) setFocus(false); });

  X.events.on('selection-change', () => { selectionStats(); markBlock(); centerCaret(); });
  X.events.on('content-change', () => { computeSoon(); outlineSoon(); tocSoon(); });
  X.events.on('doc-open', ({ id }) => {
    Object.keys(base).forEach((k) => delete base[k]);
    selStats = null; collapsed.clear();
    setTimeout(() => { computeStats(); base[id] = last ? last.words : 0; renderStatus(); fillStats(); fillOutline(); updateTocs(); markBlock(); }, 0);
  });
  X.events.on('doc-close', () => { last = null; selStats = null; renderStatus(); });
  X.events.on('doc-meta', () => { renderStatus(); fillStats(); });

  /* ====================== Commands, shortcuts, menus, toolbar ====================== */
  const hasDoc = () => !!cur();
  const cmd = (id, labelKey, label, iconName, run, extra) => X.commands.register(id, Object.assign({ labelKey, label, icon: iconName, group: 'Writing', groupKey: 'edx.writing.group', readonlyOk: true, when: hasDoc, run }, extra || {}));
  cmd('writing.outline', 'edx.writing.cmd.outline', 'Show outline', 'list', () => X.panels.toggle('writing-outline'));
  cmd('writing.stats', 'edx.writing.cmd.stats', 'Show statistics and writing goal', 'progress', () => X.panels.toggle('writing-stats'));
  cmd('writing.focus', 'edx.writing.cmd.focus', 'Focus mode (distraction-free)', 'target', () => setFocus(!WR.state.focus));
  cmd('writing.typewriter', 'edx.writing.cmd.typewriter', 'Typewriter mode', 'type', toggleTypewriter);
  cmd('writing.dim', 'edx.writing.cmd.dim', 'Dim other paragraphs', 'sun', toggleDim);
  cmd('writing.fullscreen', 'edx.writing.cmd.fullscreen', 'Full screen', 'panel', toggleFullscreen);
  cmd('writing.toc', 'edx.writing.cmd.toc', 'Insert table of contents', 'list', insertToc, { readonlyOk: false });
  const step = (d) => () => {
    const hs = X.editor.headings(); if (!hs.length) return;
    markActive();
    const s = window.getSelection(), r = root();
    let pos = activeIdx;
    if (s.rangeCount && r && r.contains(s.anchorNode)) { pos = -1; hs.forEach((h, i) => { if (h.el.compareDocumentPosition(s.anchorNode) & Node.DOCUMENT_POSITION_FOLLOWING || h.el.contains(s.anchorNode)) pos = i; }); }
    const n = Math.max(0, Math.min(hs.length - 1, pos + d)); goToHeading(hs[n].el);
  };
  cmd('writing.heading-prev', 'edx.writing.cmd.hprev', 'Go to previous heading', 'chevron-left', step(-1));
  cmd('writing.heading-next', 'edx.writing.cmd.hnext', 'Go to next heading', 'chevron-right', step(1));
  // Ctrl+Shift+Up/Down are the browser's "extend selection by paragraph": not bound (see report). The commands stay available in the palette.
  WR.shortcuts = { outline: X.shortcuts.add('mod-shift-o', 'writing.outline'), focus: X.shortcuts.add('mod-shift-f', 'writing.focus') };

  X.menus.add('file', (ctx) => ctx.doc ? [
    { sep: true },
    { labelKey: 'edx.writing.cmd.outline', label: 'Show outline', icon: 'list', kbd: 'Ctrl+Shift+O', run: () => X.commands.run('writing.outline') },
    { labelKey: 'edx.writing.cmd.stats', label: 'Statistics and writing goal', icon: 'progress', run: () => X.commands.run('writing.stats') },
    { labelKey: 'edx.writing.cmd.focus', label: 'Focus mode', icon: 'target', kbd: 'Ctrl+Shift+F', checked: () => WR.state.focus, run: () => X.commands.run('writing.focus') },
    { labelKey: 'edx.writing.cmd.typewriter', label: 'Typewriter mode', icon: 'type', checked: () => prefs.typewriter, run: () => X.commands.run('writing.typewriter') },
    { labelKey: 'edx.writing.cmd.dim', label: 'Dim other paragraphs', icon: 'sun', checked: () => prefs.dim, run: () => X.commands.run('writing.dim') },
    { labelKey: 'edx.writing.cmd.fullscreen', label: 'Full screen', icon: 'panel', run: () => X.commands.run('writing.fullscreen') },
  ] : []);
  X.toolbar.add({ id: 'writing.outline', group: 'writing', icon: 'list', labelKey: 'edx.writing.cmd.outline', label: 'Show outline', kbd: 'mod-shift-o', order: 1, readonlyOk: true, run: () => X.commands.run('writing.outline'), isActive: () => X.panels.active('right') === 'writing-outline' });
  X.toolbar.add({ id: 'writing.focus', group: 'writing', icon: 'target', labelKey: 'edx.writing.cmd.focus', label: 'Focus mode', kbd: 'mod-shift-f', order: 3, readonlyOk: true, run: () => X.commands.run('writing.focus'), isActive: () => WR.state.focus });
})();
