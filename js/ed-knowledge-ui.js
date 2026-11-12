/* Todo4Me — knowledge layer, part 2: properties strip, backlinks panel, folder/tag library, doc-list views, menus. */
(function () {
  'use strict';
  const X = T4.edx, U = T4.util, DS = T4.docstore;
  const K = T4.edKnowledge;
  const { esc, icon, t, title } = Object.assign({}, K, { title: K.title });
  const $ = (s, r) => (r || document).querySelector(s);
  const PREF = 'todo4me.knowledge.ui';
  const pref = (() => { try { return Object.assign({ open: false, tab: 'folders', expanded: [] }, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) { return { open: false, tab: 'folders', expanded: [] }; } })();
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify({ open: pref.open, tab: pref.tab, expanded: pref.expanded.slice(0, 200) })); } catch (e) { /* ignore */ } };
  const cur = () => { try { return X.editor.current(); } catch (e) { return null; } };
  const ro = () => { try { return X.editor.readonly(); } catch (e) { return false; } };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRe = (ttl) => new RegExp('(?<![\\p{L}\\p{N}_])' + escRe(ttl) + '(?![\\p{L}\\p{N}_])', 'iu');
  const meaningful = (m) => m && m.title && m.title.trim().length >= 2;

  /* ---------- small dialogs ---------- */
  /** promptText({ title, label, value, ok }) → Promise<string|null> */
  function promptText(o) {
    return new Promise((resolve) => {
      let done = false;
      X.editor.openModal({
        title: o.title, size: 'sm',
        body: '<form id="ed-kn-form" class="form"><div class="field"><label for="ed-kn-in">' + esc(o.label) + '</label><input id="ed-kn-in" type="text" maxlength="' + (o.max || 60) + '" value="' + esc(o.value || '') + '" autocomplete="off" autofocus></div></form>',
        footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(T4.i18n.t('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="ed-kn-form">' + esc(o.ok || T4.i18n.t('c.confirm')) + '</button>',
        onMount(m) {
          const inp = m.querySelector('#ed-kn-in'); inp.focus(); inp.select();
          m.querySelector('#ed-kn-form').addEventListener('submit', (e) => { e.preventDefault(); done = true; const v = inp.value.trim(); X.editor.closeModal(true); resolve(v || null); });
        },
        onClose() { if (!done) resolve(null); },
      });
    });
  }
  K.promptText = promptText;
  const toastErr = (m) => X.editor.toast(m, 'error');

  /* ---------- suggestion dropdown (tags, folder) ---------- */
  let sug = null;
  function closeSug() { if (sug) { sug.el.remove(); sug = null; } }
  function showSug(input, items, pick) {
    if (!items.length) { closeSug(); return; }
    if (!sug) {
      const el = document.createElement('div');
      el.className = 'ed-menu ed-kn-sug'; el.setAttribute('role', 'listbox');
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-ki]'); if (b && sug) { const it = sug.items[+b.dataset.ki]; const p = sug.pick; closeSug(); p(it); } });
      document.body.appendChild(el);
      sug = { el, i: 0 };
    }
    Object.assign(sug, { input, items, pick, touched: false });
    sug.i = 0;
    paintSug();
  }
  function paintSug() {
    sug.el.innerHTML = sug.items.map((it, i) => '<button type="button" class="ed-menu__item' + (i === sug.i ? ' is-active' : '') + '" role="option" aria-selected="' + (i === sug.i) + '" data-ki="' + i + '"><span class="ed-menu__label">' + esc(it) + '</span></button>').join('');
    const r = sug.input.getBoundingClientRect();
    sug.el.style.left = r.left + 'px'; sug.el.style.top = r.bottom + 2 + 'px'; sug.el.style.minWidth = Math.max(160, r.width) + 'px';
  }
  function sugKey(e) {
    if (!sug) return false;
    if (e.key === 'ArrowDown') { sug.i = (sug.i + 1) % sug.items.length; paintSug(); }
    else if (e.key === 'ArrowUp') { sug.i = (sug.i - 1 + sug.items.length) % sug.items.length; paintSug(); }
    else if (e.key === 'Escape') closeSug();
    else if ((e.key === 'Enter' || e.key === 'Tab') && sug.i >= 0 && sug.items[sug.i] != null && sug.touched) { const it = sug.items[sug.i], p = sug.pick; closeSug(); p(it); }
    else return false;
    if (sug) sug.touched = e.key === 'ArrowDown' || e.key === 'ArrowUp' ? true : sug.touched;
    e.preventDefault(); e.stopPropagation();
    return true;
  }

  /* ====================== Properties strip ====================== */
  const strip = () => document.getElementById('ed-kn-strip');
  async function commit(patch) {
    const c = cur();
    if (!c || ro()) return;
    try { await X.docs.updateMeta(c.id, patch); await K.reload(); } catch (e) { toastErr(e.message); }
  }
  K.commit = commit;
  function chipHTML(tag, canDel) {
    return '<span class="ed-kn-chip"><span class="ed-kn-chip__t">#' + esc(tag) + '</span>' + (canDel ? '<button type="button" class="ed-kn-chip__x" data-kn-act="tagdel" data-tag="' + esc(tag) + '" aria-label="' + esc(t('removeTag', 'Remove tag {tag}', { tag })) + '">' + icon('x') + '</button>' : '') + '</span>';
  }
  function renderStrip() {
    const s = strip();
    if (!s) return;
    const c = cur();
    if (!c) { s.hidden = true; return; }
    s.hidden = false;
    const m = c.meta, locked = ro();
    const tags = m.kn_tags || [], props = m.kn_props || {}, folder = m.kn_folder || '';
    const a = document.activeElement;
    const focusKey = a && s.contains(a) && a.dataset.kn ? a.dataset.kn + (a.dataset.i || '') : '';
    const caret = focusKey && a.selectionStart != null ? a.selectionStart : null;
    const daily = props.daily && U.isDateStr(props.daily) ? props.daily : '';
    const propKeys = Object.keys(props);
    let h = '<div class="ed-kn-strip__row">' +
      '<button type="button" class="ed-kn-toggle" data-kn-act="toggle" aria-expanded="' + pref.open + '" aria-controls="ed-kn-body" title="' + esc(t('propsTip', 'Tags, folder and properties')) + '">' + icon('chevron-right', 'ed-kn-toggle__ic') + '<span>' + esc(t('properties', 'Properties')) + '</span></button>' +
      '<span class="ed-kn-sum">' +
        (folder ? '<span class="ed-kn-pill" title="' + esc(t('folder', 'Folder')) + '">' + icon('folder') + esc(folder) + '</span>' : '') +
        tags.slice(0, 6).map((x) => chipHTML(x, false)).join('') + (tags.length > 6 ? '<span class="ed-kn-pill">+' + (tags.length - 6) + '</span>' : '') +
        (m.kn_archived ? '<span class="ed-kn-pill ed-kn-pill--warn">' + icon('archive') + esc(t('archived', 'Archived')) + '</span>' : '') +
        (!folder && !tags.length && !m.kn_archived ? '<span class="muted small">' + esc(t('noMeta', 'No tags or folder yet')) + '</span>' : '') +
      '</span>' +
      (daily ? '<span class="ed-kn-daily" role="group" aria-label="' + esc(t('dailyNav', 'Daily notes')) + '"><button type="button" class="icon-btn icon-btn--sm" data-kn-act="prevday" title="' + esc(t('prevDay', 'Previous day')) + '" aria-label="' + esc(t('prevDay', 'Previous day')) + '">' + icon('chevron-left') + '</button><button type="button" class="icon-btn icon-btn--sm" data-kn-act="today" title="' + esc(t('cmdDaily', 'Today’s note')) + '" aria-label="' + esc(t('cmdDaily', 'Today’s note')) + '">' + icon('calendar') + '</button><button type="button" class="icon-btn icon-btn--sm" data-kn-act="nextday" title="' + esc(t('nextDay', 'Next day')) + '" aria-label="' + esc(t('nextDay', 'Next day')) + '">' + icon('chevron-right') + '</button></span>' : '') +
      '</div>';
    if (pref.open) {
      const dis = locked ? ' disabled' : '';
      h += '<div class="ed-kn-body" id="ed-kn-body">' +
        '<div class="ed-kn-field"><label for="ed-kn-folder">' + esc(t('folder', 'Folder')) + '</label><input type="text" id="ed-kn-folder" data-kn="folder" maxlength="240" autocomplete="off" placeholder="' + esc(t('folderPh', 'e.g. Projects/Alpha — empty = no folder')) + '" value="' + esc(folder) + '"' + dis + '></div>' +
        '<div class="ed-kn-field"><label for="ed-kn-tag">' + esc(t('tags', 'Tags')) + '</label><div class="ed-kn-tags">' + tags.map((x) => chipHTML(x, !locked)).join('') + '<input type="text" id="ed-kn-tag" data-kn="tag" maxlength="40" autocomplete="off" placeholder="' + esc(t('tagPh', 'Add tag…')) + '"' + dis + '></div></div>' +
        '<div class="ed-kn-field ed-kn-field--props"><span class="ed-kn-lbl" id="ed-kn-props-l">' + esc(t('customProps', 'Properties')) + '</span><div class="ed-kn-props" role="group" aria-labelledby="ed-kn-props-l">' +
        propKeys.map((k, i) => '<div class="ed-kn-prop"><input type="text" data-kn="pk" data-i="' + i + '" aria-label="' + esc(t('propKey', 'Property name')) + '" value="' + esc(k) + '" maxlength="40"' + (locked || k === 'daily' ? ' disabled' : '') + '><input type="text" data-kn="pv" data-i="' + i + '" aria-label="' + esc(t('propValue', 'Value')) + '" value="' + esc(props[k]) + '" maxlength="500"' + dis + '>' +
          (locked || k === 'daily' ? '' : '<button type="button" class="icon-btn icon-btn--sm" data-kn-act="propdel" data-i="' + i + '" aria-label="' + esc(t('removeProp', 'Remove property {key}', { key: k })) + '">' + icon('x') + '</button>') + '</div>').join('') +
        (propKeys.length < 30 ? '<div class="ed-kn-prop ed-kn-prop--new"><input type="text" data-kn="pk" data-i="new" aria-label="' + esc(t('propKey', 'Property name')) + '" placeholder="' + esc(t('propKey', 'Property name')) + '" maxlength="40"' + dis + '><input type="text" data-kn="pv" data-i="new" aria-label="' + esc(t('propValue', 'Value')) + '" placeholder="' + esc(t('propValue', 'Value')) + '" maxlength="500"' + dis + '></div>' : '') +
        '</div></div>' +
        '<div class="ed-kn-actions">' +
          '<button type="button" class="btn btn--sm btn--ghost" data-kn-act="archive"' + dis + '>' + icon('archive') + esc(m.kn_archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive')) + '</button>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-kn-act="backlinks">' + icon('link') + esc(t('panelBacklinks', 'Links')) + '</button>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-kn-act="graph">' + icon('graph') + esc(t('cmdGraph', 'Knowledge graph')) + '</button>' +
        '</div></div>';
    }
    s.classList.toggle('is-open', pref.open);
    s.innerHTML = h;
    if (focusKey) {
      const f = Array.from(s.querySelectorAll('[data-kn]')).find((x) => x.dataset.kn + (x.dataset.i || '') === focusKey);
      if (f) { f.focus(); if (caret != null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
    }
  }
  K.renderStrip = renderStrip;
  const renderStripSoon = U.debounce(renderStrip, 60);

  function collectProps(s) {
    const o = {};
    const keys = Array.from(s.querySelectorAll('[data-kn="pk"]')), vals = Array.from(s.querySelectorAll('[data-kn="pv"]'));
    const oldProps = (cur() && cur().meta.kn_props) || {};
    keys.forEach((k, i) => {
      const key = k.value.trim();
      if (k.dataset.i === 'new' && !key) return;
      const real = k.disabled ? Object.keys(oldProps)[+k.dataset.i] : key;
      if (real) o[real] = vals[i].value;
    });
    return o;
  }
  function addTags(raw) {
    const c = cur();
    if (!c) return;
    const parts = String(raw).split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    commit({ kn_tags: K.cleanTags((c.meta.kn_tags || []).concat(parts)) });
  }
  function bindStrip(s) {
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kn-act]');
      if (!b || !s.contains(b)) return;
      const act = b.dataset.knAct, c = cur();
      if (!c) return;
      if (act === 'toggle') { pref.open = !pref.open; savePref(); renderStrip(); }
      else if (act === 'tagdel') commit({ kn_tags: (c.meta.kn_tags || []).filter((x) => x !== b.dataset.tag) });
      else if (act === 'propdel') { const keys = Object.keys(c.meta.kn_props || {}); const o = Object.assign({}, c.meta.kn_props); delete o[keys[+b.dataset.i]]; commit({ kn_props: o }); }
      else if (act === 'archive') K.setArchived(c.id, !c.meta.kn_archived).then(() => X.editor.toast(c.meta.kn_archived ? t('archivedToast', 'Document archived') : t('unarchivedToast', 'Document restored from archive'), 'success', 2000));
      else if (act === 'backlinks') X.panels.open('knowledge-backlinks');
      else if (act === 'graph') K.openGraph();
      else if (act === 'prevday' || act === 'nextday' || act === 'today') {
        const d = c.meta.kn_props && c.meta.kn_props.daily;
        K.openDaily(act === 'today' ? U.today() : U.addDays(d, act === 'prevday' ? -1 : 1));
      }
    });
    s.addEventListener('keydown', (e) => {
      const el = e.target;
      if (el.dataset && (el.dataset.kn === 'tag' || el.dataset.kn === 'folder') && sugKey(e)) return;
      if (e.key === 'Escape' && el.closest && el.closest('.ed-kn-body')) { if (sug) { closeSug(); e.stopPropagation(); return; } X.editor.restore(); return; }
      if (el.dataset && el.dataset.kn === 'tag') {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); const v = el.value; el.value = ''; closeSug(); addTags(v); }
        else if (e.key === 'Backspace' && !el.value) { const c = cur(); if (c && (c.meta.kn_tags || []).length) commit({ kn_tags: c.meta.kn_tags.slice(0, -1) }); }
      } else if (el.dataset && (el.dataset.kn === 'folder' || el.dataset.kn === 'pk' || el.dataset.kn === 'pv') && e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
    s.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.kn === 'tag') {
        const q = K.normTag(el.value), have = (cur() && cur().meta.kn_tags) || [];
        const items = K.allTags().map((x) => x[0]).filter((x) => !have.includes(x) && (!q || x.includes(q))).slice(0, 8);
        showSug(el, q || items.length ? items : [], (v) => { el.value = ''; addTags(v); });
      } else if (el.dataset.kn === 'folder') {
        const q = K.fold(el.value).trim();
        showSug(el, K.folderPaths().filter((p) => K.fold(p).includes(q) && p !== el.value).slice(0, 8), (v) => { el.value = v; if (cur()) K.moveDoc(cur().id, v); });
      }
    });
    s.addEventListener('focusin', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.kn === 'tag') el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    s.addEventListener('focusout', () => setTimeout(() => { if (sug && !(strip() && strip().contains(document.activeElement))) closeSug(); }, 120));
    s.addEventListener('change', (e) => {
      const el = e.target, c = cur();
      if (!c || !el.dataset.kn) return;
      if (el.dataset.kn === 'folder') { closeSug(); const nf = K.normFolder(el.value); if (nf !== (c.meta.kn_folder || '')) K.moveDoc(c.id, nf); else el.value = nf; }
      else if (el.dataset.kn === 'tag') { const v = el.value; el.value = ''; if (v.trim()) addTags(v); }
      else if (el.dataset.kn === 'pk' || el.dataset.kn === 'pv') commit({ kn_props: collectProps(s) });
    });
  }
  X.events.on('shell-built', ({ root }) => {
    closeSug();
    const old = root.querySelector('#ed-kn-strip');
    if (old) old.remove();
    const sc = root.querySelector('#ed-scroll');
    if (!sc) return;
    const s = document.createElement('div');
    s.id = 'ed-kn-strip'; s.className = 'ed-kn-strip'; s.setAttribute('role', 'region'); s.setAttribute('aria-label', t('properties', 'Properties')); s.hidden = true;
    sc.parentNode.insertBefore(s, sc);
    bindStrip(s);
    renderStrip();
    setupListHooks(root);
  });
  ['doc-open', 'doc-close', 'doc-meta'].forEach((ev) => X.events.on(ev, renderStripSoon));
  X.events.on('docs-changed', () => { const s = strip(); if (s && !(s.contains(document.activeElement) && document.activeElement.matches('input'))) renderStripSoon(); });
  X.commands.register('knowledge.properties', {
    labelKey: 'edx.knowledge.cmdProps', label: 'Tags, folder and properties', icon: 'tag', group: 'Knowledge', order: 15,
    run() { pref.open = true; savePref(); renderStrip(); const f = $('#ed-kn-tag'); if (f) f.focus(); },
  });
  X.commands.register('knowledge.archive', {
    labelKey: 'edx.knowledge.cmdArchive', label: 'Archive / unarchive document', icon: 'archive', group: 'Knowledge', order: 16,
    run() { const c = cur(); if (c) return K.setArchived(c.id, !c.meta.kn_archived); return undefined; },
  });

  /* ====================== Backlinks panel ====================== */
  const bl = { host: null, seq: 0, cache: new Map() };
  async function snippetFor(srcId, targetId, updatedAt) {
    const key = srcId + '>' + targetId + '@' + updatedAt;
    if (bl.cache.has(key)) return bl.cache.get(key);
    let res = [];
    try {
      const d = await DS.get(srcId);
      if (d) {
        const doc = new DOMParser().parseFromString('<!doctype html><body>' + d.html, 'text/html');
        doc.querySelectorAll('[data-w="wikilink"]').forEach((w) => {
          let p = {}; try { p = JSON.parse(w.getAttribute('data-p') || '{}'); } catch (e) { /* ignore */ }
          if (p.d !== targetId || res.length >= 3) return;
          const block = w.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote') || w.parentElement;
          const clone = block.cloneNode(true);
          clone.querySelectorAll('[data-w="wikilink"]').forEach((c) => {
            let q = {}; try { q = JSON.parse(c.getAttribute('data-p') || '{}'); } catch (e) { /* ignore */ }
            const nm = (K.byId.get(q.d) && title(K.byId.get(q.d))) || q.t || '';
            c.textContent = q.d === targetId ? '' + nm + '' : nm;
          });
          const txt = clone.textContent.replace(/\s+/g, ' ');
          const a = txt.indexOf(''), b = txt.indexOf('');
          if (a < 0) return;
          res.push({ before: (a > 55 ? '…' : '') + txt.slice(Math.max(0, a - 55), a), mark: txt.slice(a + 1, b), after: txt.slice(b + 1, b + 70) });
        });
      }
    } catch (e) { res = []; }
    bl.cache.set(key, res);
    if (bl.cache.size > 400) bl.cache.delete(bl.cache.keys().next().value);
    return res;
  }
  function unlinkedFor(c) {
    const m = K.byId.get(c.id) || c.meta;
    if (!meaningful(m)) return null;
    const re = mentionRe(m.title.trim());
    const linked = new Set(K.inbound.get(c.id) || []);
    const out = [];
    for (const d of K.docs) {
      if (d.deletedAt || d.kn_archived || d.id === c.id || linked.has(d.id) || !d.text) continue;
      const text = d.text.replace(/\s+/g, ' ').replace(/\[\[[^\]]*\]\]/g, (x) => ' '.repeat(x.length));
      const i = text.search(re);
      if (i < 0) continue;
      const len = m.title.trim().length;
      out.push({ d, before: (i > 50 ? '…' : '') + text.slice(Math.max(0, i - 50), i), mark: text.slice(i, i + len), after: text.slice(i + len, i + len + 70) });
      if (out.length >= 40) break;
    }
    return out;
  }
  const snipHTML = (s) => '<span class="ed-kn-snip">' + esc(s.before) + '<mark>' + esc(s.mark) + '</mark>' + esc(s.after) + '</span>';
  async function refreshBacklinks() {
    const host = bl.host;
    if (!host || !host.isConnected) return;
    const seq = ++bl.seq;
    const c = cur();
    if (!c) { host.innerHTML = '<p class="muted small">' + esc(t('noDocOpen', 'Open a document to see its links.')) + '</p>'; return; }
    const ids = (K.inbound.get(c.id) || []).map((id) => K.byId.get(id)).filter((d) => d && !d.deletedAt).slice(0, 40);
    const linked = [];
    for (const d of ids) linked.push({ d, snips: await snippetFor(d.id, c.id, d.updatedAt) });
    if (seq !== bl.seq) return;
    const unl = unlinkedFor(c);
    const root = X.editor.root();
    const out = [];
    if (root) root.querySelectorAll('.t4-w[data-w="wikilink"]').forEach((w) => { try { const p = JSON.parse(w.getAttribute('data-p')); if (!out.some((o) => o.p.d === p.d)) out.push({ p, r: K.resolve(p) }); } catch (e) { /* ignore */ } });
    const sec = (id, label, n, body) => '<section class="ed-kn-sec" aria-labelledby="ed-kn-h-' + id + '"><h3 class="ed-kn-sec__h" id="ed-kn-h-' + id + '">' + esc(label) + ' <span class="count">' + n + '</span></h3>' + body + '</section>';
    let h = sec('linked', t('linkedMentions', 'Linked mentions'), linked.length, linked.length ? '<ul class="ed-kn-list" data-kn-list="linked">' + linked.map(({ d, snips }) =>
      '<li class="ed-kn-item"><button type="button" class="ed-kn-item__open" data-kn-open="' + esc(d.id) + '" data-kn-back="' + esc(c.id) + '"><span class="ed-kn-item__t">' + icon('doc') + esc(title(d)) + '</span>' + snips.map(snipHTML).join('') + '</button></li>').join('') + '</ul>'
      : '<p class="muted small">' + esc(t('noLinked', 'No document links here yet. Type [[ in another document to link to this one.')) + '</p>');
    h += sec('unlinked', t('unlinkedMentions', 'Unlinked mentions'), unl ? unl.length : 0, unl === null ? '<p class="muted small">' + esc(t('needTitle', 'Give this document a title (2+ characters) to find unlinked mentions.')) + '</p>'
      : unl.length ? '<ul class="ed-kn-list" data-kn-list="unlinked">' + unl.map((u) =>
        '<li class="ed-kn-item"><button type="button" class="ed-kn-item__open" data-kn-open="' + esc(u.d.id) + '"><span class="ed-kn-item__t">' + icon('doc') + esc(title(u.d)) + '</span>' + snipHTML(u) + '</button><button type="button" class="btn btn--sm ed-kn-item__act" data-kn-link="' + esc(u.d.id) + '" aria-label="' + esc(t('linkIn', 'Link this mention in {title}', { title: title(u.d) })) + '">' + icon('link') + esc(t('linkAction', 'Link')) + '</button></li>').join('') + '</ul>'
        : '<p class="muted small">' + esc(t('noUnlinked', 'No other document mentions this title.')) + '</p>');
    h += sec('outgoing', t('outgoing', 'Outgoing links'), out.length, out.length ? '<ul class="ed-kn-list" data-kn-list="outgoing">' + out.map(({ p, r }) =>
      '<li class="ed-kn-item"><button type="button" class="ed-kn-item__open' + (r.missing ? ' is-missing' : '') + '" ' + (r.ok ? 'data-kn-open="' + esc(p.d) + '"' : 'data-kn-create="' + esc(p.d) + '" data-kn-title="' + esc(r.title) + '"') + '><span class="ed-kn-item__t">' + icon(r.ok ? 'link' : 'plus') + esc(r.title) + '</span>' + (r.missing ? '<span class="muted small">' + esc(t('missingCreate', 'Does not exist — click to create')) + '</span>' : '') + '</button></li>').join('') + '</ul>'
      : '<p class="muted small">' + esc(t('noOutgoing', 'This document links to no other document.')) + '</p>');
    host.innerHTML = h;
  }
  const refreshBacklinksSoon = U.debounce(() => { if (X.panels.active('right') === 'knowledge-backlinks') refreshBacklinks(); }, 200);
  X.events.on('knowledge:index', refreshBacklinksSoon);
  X.events.on('doc-saved', refreshBacklinksSoon);

  async function linkMention(srcId, target) {
    const d = await DS.get(srcId);
    if (!d || d.meta.deletedAt) return false;
    const c = cur();
    if (c && c.id === srcId) return false; // never rewrite the document that is open in the editor
    const ttl = title(target);
    const re = mentionRe(ttl);
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + d.html, 'text/html');
    const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node = null, m = null;
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.parentElement && n.parentElement.closest('.t4-w, pre, code, a')) continue;
      const mm = re.exec(n.nodeValue);
      if (mm) { node = n; m = mm; break; }
    }
    if (!node) return false;
    const wl = doc.createElement('span');
    wl.className = 't4-w t4-w--inline'; wl.setAttribute('data-w', 'wikilink'); wl.setAttribute('data-p', JSON.stringify({ d: target.id, t: ttl }));
    const after = node.splitText(m.index);
    after.nodeValue = after.nodeValue.slice(m[0].length);
    node.parentNode.insertBefore(wl, after);
    const html = T4.edSanitize.sanitizeToString(doc.body.innerHTML);
    const st = T4.edcore.statsOf(html);
    await DS.save(srcId, { html, text: st.text, words: st.words }, { kn_links: Array.from(new Set((d.meta.kn_links || []).concat(target.id))) });
    await K.reload();
    return true;
  }
  K.linkMention = linkMention;

  function openFrom(id, backTo) {
    return X.editor.openDoc(id).then((okk) => {
      if (okk && backTo) setTimeout(() => {
        const root = X.editor.root();
        const w = root && Array.from(root.querySelectorAll('.t4-w[data-w="wikilink"]')).find((x) => { try { return JSON.parse(x.getAttribute('data-p')).d === backTo; } catch (e) { return false; } });
        if (w) X.editor.scrollToBlock(w, { flash: true });
      }, 150);
      return okk;
    });
  }
  function hostClicks(host) {
    host.addEventListener('click', async (e) => {
      const lk = e.target.closest('[data-kn-link]');
      if (lk) {
        const c = cur(); if (!c) return;
        lk.disabled = true;
        const okk = await linkMention(lk.dataset.knLink, K.byId.get(c.id) || c.meta);
        X.editor.toast(okk ? t('linked', 'Mention linked') : t('linkFailed', 'Could not link this mention'), okk ? 'success' : 'error', 2000);
        refreshBacklinks();
        return;
      }
      const cr = e.target.closest('[data-kn-create]');
      if (cr) {
        const c = cur(); const root = X.editor.root();
        const w = root && Array.from(root.querySelectorAll('.t4-w[data-w="wikilink"]')).find((x) => { try { return JSON.parse(x.getAttribute('data-p')).d === cr.dataset.knCreate; } catch (er) { return false; } });
        if (w) K.openLinkWidget(w);
        return;
      }
      const op = e.target.closest('[data-kn-open]');
      if (op) openFrom(op.dataset.knOpen, op.dataset.knBack);
    });
  }
  X.panels.register({
    id: 'knowledge-backlinks', side: 'right', titleKey: 'edx.knowledge.panelBacklinks', title: 'Links', icon: 'link', order: 20,
    render(host) { host.classList.add('ed-kn-panel'); bl.host = host; hostClicks(host); refreshBacklinks(); },
    onDocChange() { if (X.panels.active('right') === 'knowledge-backlinks') refreshBacklinks(); },
    onOpen() { refreshBacklinks(); },
  });

  /* ====================== Library panel (folders, tags) ====================== */
  const lib = { host: null, tags: new Set(), drag: null };
  const expanded = () => new Set(pref.expanded);
  function docRow(d) {
    return '<button type="button" class="ed-kn-row ed-kn-doc' + (cur() && cur().id === d.id ? ' is-active' : '') + '" data-kn-open="' + esc(d.id) + '" draggable="true" data-kn-drag="doc:' + esc(d.id) + '">' + icon('doc') + '<span class="ed-kn-row__t">' + esc(title(d)) + '</span></button>';
  }
  function treeHTML() {
    const paths = K.folderPaths();
    const kids = new Map([['', []]]);
    paths.forEach((p) => { const par = K.parentOf(p); if (!kids.has(par)) kids.set(par, []); kids.get(par).push(p); });
    const docsBy = new Map();
    K.live().filter((d) => !d.kn_archived).sort((a, b) => title(a).localeCompare(title(b))).forEach((d) => { const f = d.kn_folder || ''; if (!docsBy.has(f)) docsBy.set(f, []); docsBy.get(f).push(d); });
    const ex = expanded();
    const count = (p) => K.live().filter((d) => !d.kn_archived && d.kn_folder && (d.kn_folder === p || d.kn_folder.indexOf(p + '/') === 0)).length;
    const node = (p, depth) => {
      const open = ex.has(p);
      const sub = open ? (kids.get(p) || []).map((c) => node(c, depth + 1)).join('') + (docsBy.get(p) || []).map(docRow).join('') : '';
      return '<li role="treeitem" aria-expanded="' + open + '" aria-level="' + (depth + 1) + '" class="ed-kn-node">' +
        '<div class="ed-kn-row ed-kn-folder" data-kn-folder="' + esc(p) + '" draggable="true" data-kn-drag="folder:' + esc(p) + '">' +
        '<button type="button" class="ed-kn-row__chev" data-kn-act="ftoggle" data-path="' + esc(p) + '" aria-label="' + esc((open ? t('collapse', 'Collapse') : t('expand', 'Expand')) + ' ' + K.baseName(p)) + '">' + icon(open ? 'chevron-down' : 'chevron-right') + '</button>' +
        '<button type="button" class="ed-kn-row__name" data-kn-act="ftoggle" data-path="' + esc(p) + '">' + icon('folder') + '<span class="ed-kn-row__t">' + esc(K.baseName(p)) + '</span><span class="count">' + count(p) + '</span></button>' +
        '<button type="button" class="icon-btn icon-btn--sm ed-kn-row__more" data-kn-act="fmenu" data-path="' + esc(p) + '" aria-haspopup="menu" aria-label="' + esc(t('folderActions', 'Actions for folder {name}', { name: K.baseName(p) })) + '">' + icon('more') + '</button></div>' +
        (open ? '<ul role="group" class="ed-kn-sub">' + sub + '</ul>' : '') + '</li>';
    };
    const root = (docsBy.get('') || []);
    return '<ul role="tree" class="ed-kn-tree" aria-label="' + esc(t('folders', 'Folders')) + '">' + (kids.get('') || []).map((p) => node(p, 0)).join('') + '</ul>' +
      '<div class="ed-kn-row ed-kn-unfiled" data-kn-folder="" role="heading" aria-level="3">' + icon('inbox') + '<span class="ed-kn-row__t">' + esc(t('noFolder', 'No folder')) + '</span><span class="count">' + root.length + '</span></div>' +
      '<div class="ed-kn-rootdocs">' + root.map(docRow).join('') + '</div>' +
      (!paths.length && !root.length ? '<p class="muted small">' + esc(t('noFolders', 'No folders yet. Use “New folder”, or set a folder in a document’s properties.')) + '</p>' : '');
  }
  function tagsHTML() {
    const all = K.allTags();
    if (!all.length) return '<p class="muted small">' + esc(t('noTags', 'No tags yet. Add tags in the properties of a document.')) + '</p>';
    const sel = Array.from(lib.tags).filter((x) => all.some((a) => a[0] === x));
    const docs = sel.length ? K.live().filter((d) => !d.kn_archived && sel.every((x) => (d.kn_tags || []).includes(x))).sort((a, b) => title(a).localeCompare(title(b))) : [];
    return '<div class="ed-kn-cloud" role="group" aria-label="' + esc(t('tags', 'Tags')) + '">' + all.map(([tg, n]) => '<button type="button" class="ed-kn-chip ed-kn-chip--btn' + (lib.tags.has(tg) ? ' is-on' : '') + '" data-kn-act="tagsel" data-tag="' + esc(tg) + '" aria-pressed="' + lib.tags.has(tg) + '">#' + esc(tg) + ' <span class="count">' + n + '</span></button>').join('') + '</div>' +
      (sel.length ? '<h3 class="ed-kn-sec__h">' + esc(t('taggedDocs', 'Documents')) + ' <span class="count">' + docs.length + '</span></h3><div class="ed-kn-rootdocs">' + docs.map(docRow).join('') + '</div>' : '<p class="muted small">' + esc(t('pickTag', 'Select one or more tags to list matching documents.')) + '</p>');
  }
  function renderLibrary() {
    const host = lib.host;
    if (!host || !host.isConnected) return;
    host.innerHTML =
      '<div class="ed-kn-libhead"><div class="seg seg--sm" role="radiogroup" aria-label="' + esc(t('libraryView', 'Library view')) + '">' +
        ['folders', 'tags'].map((k) => '<button type="button" class="seg__btn" role="radio" aria-checked="' + (pref.tab === k) + '" data-kn-act="libtab" data-tab="' + k + '">' + icon(k === 'folders' ? 'folder' : 'tag') + esc(k === 'folders' ? t('folders', 'Folders') : t('tags', 'Tags')) + '</button>').join('') + '</div>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-kn-act="newfolder" title="' + esc(t('newFolder', 'New folder')) + '" aria-label="' + esc(t('newFolder', 'New folder')) + '">' + icon('plus') + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-kn-act="graph" title="' + esc(t('cmdGraph', 'Knowledge graph')) + '" aria-label="' + esc(t('cmdGraph', 'Knowledge graph')) + '">' + icon('graph') + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-kn-act="daily" title="' + esc(t('cmdDaily', 'Today’s note')) + '" aria-label="' + esc(t('cmdDaily', 'Today’s note')) + '">' + icon('calendar') + '</button></div>' +
      '<div class="ed-kn-libbody">' + (pref.tab === 'tags' ? tagsHTML() : treeHTML()) + '</div>';
  }
  const renderLibrarySoon = U.debounce(renderLibrary, 80);
  X.events.on('knowledge:index', renderLibrarySoon);
  X.events.on('doc-open', renderLibrarySoon);


  async function newFolderIn(parent) {
    const name = await promptText({ title: t('newFolder', 'New folder'), label: t('folderName', 'Folder name'), ok: t('create', 'Create') });
    if (!name) return null;
    const clean = name.replace(/[/\\]/g, ' ').trim();
    const path = K.normFolder((parent ? parent + '/' : '') + clean);
    if (!path || path.split('/').length > 8) { toastErr(t('tooDeep', 'Folders can be nested up to 8 levels.')); return null; }
    await K.createFolder(path);
    if (parent && !pref.expanded.includes(parent)) pref.expanded.push(parent);
    savePref();
    await K.reload();
    return path;
  }
  K.newFolderIn = newFolderIn;
  function folderTargets(exclude) {
    return K.folderPaths().filter((p) => !exclude || !(p === exclude || p.indexOf(exclude + '/') === 0));
  }
  function folderMenu(btn, path) {
    const targets = folderTargets(path).slice(0, 40);
    X.editor.openMenu(btn, [
      { label: t('newSubfolder', 'New subfolder…'), icon: 'plus', run: () => newFolderIn(path) },
      { label: t('rename', 'Rename…'), icon: 'edit', run: async () => { const n = await promptText({ title: t('rename', 'Rename…'), label: t('folderName', 'Folder name'), value: K.baseName(path), ok: t('rename', 'Rename…') }); if (n) { const d = await K.renameFolder(path, n); if (d && pref.expanded.includes(path)) { pref.expanded = pref.expanded.map((x) => (x === path || x.indexOf(path + '/') === 0 ? d + x.slice(path.length) : x)); savePref(); renderLibrary(); } } } },
      { label: t('moveTo', 'Move to'), icon: 'folder', items: [{ label: t('topLevel', 'Top level'), disabled: !K.parentOf(path), run: () => moveFolderTo(path, '') }].concat(targets.map((p) => ({ label: p, disabled: K.parentOf(path) === p, run: () => moveFolderTo(path, p) }))) },
      { sep: true },
      { label: t('deleteFolder', 'Delete folder'), icon: 'trash', danger: true, run: async () => { if (await X.editor.confirm({ title: t('deleteFolder', 'Delete folder'), message: t('deleteFolderMsg', 'The folder “{name}” is removed. Its documents move up one level; no document is deleted.', { name: K.baseName(path) }), confirmText: t('deleteFolder', 'Delete folder'), danger: true })) await K.deleteFolder(path); } },
    ]);
  }
  async function moveFolderTo(path, parent) {
    const r = await K.moveFolder(path, parent);
    if (r === false) toastErr(t('cannotMove', 'This folder cannot be moved there.'));
    else if (parent && !pref.expanded.includes(parent)) { pref.expanded.push(parent); savePref(); renderLibrary(); }
  }
  function onDrop(e) {
    const row = e.target.closest('[data-kn-folder]');
    if (!row || !lib.drag) return;
    e.preventDefault();
    row.classList.remove('is-drop');
    const target = row.dataset.knFolder, d = lib.drag;
    lib.drag = null;
    if (d.type === 'doc') K.moveDoc(d.id, target);
    else if (d.type === 'folder') moveFolderTo(d.id, target);
  }
  X.panels.register({
    id: 'knowledge-library', side: 'left', titleKey: 'edx.knowledge.panelLibrary', title: 'Library', icon: 'folder', order: 20,
    render(host) {
      host.classList.add('ed-kn-panel', 'ed-kn-lib');
      lib.host = host;
      host.addEventListener('click', (e) => {
        const op = e.target.closest('[data-kn-open]');
        if (op) { location.hash = '#/editor?doc=' + encodeURIComponent(op.dataset.knOpen); return; }
        const b = e.target.closest('[data-kn-act]');
        if (!b) return;
        const act = b.dataset.knAct;
        if (act === 'ftoggle') { const p = b.dataset.path; const i = pref.expanded.indexOf(p); if (i >= 0) pref.expanded.splice(i, 1); else pref.expanded.push(p); savePref(); renderLibrary(); const nb = host.querySelector('[data-kn-act="ftoggle"][data-path="' + CSS.escape(p) + '"].ed-kn-row__name'); if (nb) nb.focus(); }
        else if (act === 'libtab') { pref.tab = b.dataset.tab; savePref(); renderLibrary(); }
        else if (act === 'newfolder') newFolderIn('');
        else if (act === 'fmenu') folderMenu(b, b.dataset.path);
        else if (act === 'tagsel') { const tg = b.dataset.tag; if (lib.tags.has(tg)) lib.tags.delete(tg); else lib.tags.add(tg); renderLibrary(); const nb = host.querySelector('[data-kn-act="tagsel"][data-tag="' + CSS.escape(tg) + '"]'); if (nb) nb.focus(); }
        else if (act === 'graph') K.openGraph();
        else if (act === 'daily') K.openDaily();
      });
      host.addEventListener('dragstart', (e) => {
        const r = e.target.closest && e.target.closest('[data-kn-drag]');
        if (!r) return;
        const [type, ...rest] = r.dataset.knDrag.split(':');
        lib.drag = { type, id: rest.join(':') };
        try { e.dataTransfer.setData('text/plain', r.dataset.knDrag); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ignore */ }
      });
      host.addEventListener('dragend', () => { lib.drag = null; host.querySelectorAll('.is-drop').forEach((x) => x.classList.remove('is-drop')); });
      host.addEventListener('dragover', (e) => { const row = e.target.closest('[data-kn-folder]'); if (row && lib.drag) { e.preventDefault(); host.querySelectorAll('.is-drop').forEach((x) => x !== row && x.classList.remove('is-drop')); row.classList.add('is-drop'); } });
      host.addEventListener('dragleave', (e) => { const row = e.target.closest('[data-kn-folder]'); if (row && !row.contains(e.relatedTarget)) row.classList.remove('is-drop'); });
      host.addEventListener('drop', onDrop);
      renderLibrary();
    },
    onOpen() { K.reload().then(renderLibrary); },
    onDocChange() { renderLibrarySoon(); },
  });

  /* ====================== Doc-list views, badges, archive filter, search help ====================== */
  const DAY = 86400000;
  X.docList.registerView({
    id: 'knowledge.recent', labelKey: 'edx.knowledge.viewRecent', label: 'Recent', icon: 'clock', order: 10,
    filter: (m) => !m.kn_archived && m.openedAt && Date.now() - Date.parse(m.openedAt) < 30 * DAY,
    sort: (a, b) => String(b.openedAt).localeCompare(String(a.openedAt)),
    empty: 'No recently opened documents.',
  });
  X.docList.registerView({
    id: 'knowledge.archive', labelKey: 'edx.knowledge.viewArchive', label: 'Archive', icon: 'archive', order: 11,
    filter: (m) => !!m.kn_archived,
    sort: (a, b) => String(b.kn_archived).localeCompare(String(a.kn_archived)),
    empty: 'No archived documents. Archive a document from its “…” menu.',
  });
  X.docList.decorate((m) => {
    let h = '';
    if (m.kn_folder) h += '<span class="ed-kn-badge" title="' + esc(t('folder', 'Folder') + ': ' + m.kn_folder) + '">' + icon('folder') + '</span>';
    if ((m.kn_tags || []).length) h += '<span class="ed-kn-badge" title="' + esc((m.kn_tags || []).map((x) => '#' + x).join(' ')) + '">' + icon('tag') + (m.kn_tags.length > 1 ? '<small>' + m.kn_tags.length + '</small>' : '') + '</span>';
    if (m.kn_archived) h += '<span class="ed-kn-badge" title="' + esc(t('archived', 'Archived')) + '">' + icon('archive') + '</span>';
    return h;
  });

  // Archived documents stay out of the list unless the Archive view, the trash or an is:archived search is active.
  X.docList.filter((m, c) => !m.kn_archived || /(^|\s)is:archived(\s|$)/i.test(c.q || '') || c.view === 'knowledge.archive' || c.view === 'trash',
    { emptyKey: 'edx.knowledge.onlyArchived', empty: 'Only archived documents match. Open the Archive view or search with is:archived.' });
  function searchHelp(btn) {
    const row = (code, txt) => '<div class="ed-kn-help__r"><code>' + esc(code) + '</code><span>' + esc(txt) + '</span></div>';
    X.editor.openMenu(btn, [
      { heading: t('searchSyntax', 'Search filters') },
      { html: '<div class="ed-kn-help">' + row('tag:project', t('hTag', 'documents with this tag')) + row('folder:Work', t('hFolder', 'documents in this folder (and below)')) + row('is:archived', t('hArchived', 'include archived documents')) + row('links:"Title"', t('hLinks', 'documents that link to this title')) + '<p class="muted small">' + esc(t('hCombine', 'Combine filters with words: tag:work budget')) + '</p></div>' },
    ]);
  }
  function setupListHooks(root) {
    const s = root.querySelector('#ed-search');
    if (s) {
      s.title = t('searchSyntaxTip', 'Filters: tag:x  folder:x  is:archived  links:"Title"');
      const label = s.closest('label');
      if (label && !label.querySelector('.ed-kn-searchhelp')) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ed-kn-searchhelp'; b.textContent = '?';
        b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-label', t('searchSyntax', 'Search filters')); b.title = t('searchSyntax', 'Search filters');
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); searchHelp(b); });
        label.appendChild(b);
      }
    }
  }

  /* ====================== Menus ====================== */
  function moveItems(id) {
    const m = K.byId.get(id);
    const here = m ? m.kn_folder || '' : '';
    return [{ label: t('noFolder', 'No folder'), checked: !here, run: () => K.moveDoc(id, '') }]
      .concat(K.folderPaths().slice(0, 40).map((p) => ({ label: p, checked: here === p, run: () => K.moveDoc(id, p) })))
      .concat([{ sep: true }, { label: t('newFolder', 'New folder') + '…', icon: 'plus', run: async () => { const p = await newFolderIn(''); if (p) K.moveDoc(id, p); } }]);
  }
  K.tagsDialog = async function (id) {
    const m = K.byId.get(id);
    if (!m) return;
    const v = await promptText({ title: t('tags', 'Tags'), label: t('tagsComma', 'Tags, separated by commas'), value: (m.kn_tags || []).join(', '), ok: T4.i18n.t('c.save'), max: 600 });
    if (v === null) return;
    await K.updateMeta(id, { kn_tags: K.cleanTags(v.split(/[,;]+/)) });
    await K.reload();
  };
  X.menus.add('doc', (ctx) => {
    const id = ctx.docId, m = K.byId.get(id) || ctx.docMeta;
    if (!id || (m && m.deletedAt)) return [];
    return [
      { sep: true },
      { label: t('moveToFolder', 'Move to folder'), icon: 'folder', items: () => moveItems(id) },
      { label: t('tagsDots', 'Tags…'), icon: 'tag', run: () => K.tagsDialog(id) },
      { label: m && m.kn_archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive'), icon: 'archive', run: () => K.setArchived(id, !(m && m.kn_archived)) },
    ];
  });
  X.menus.add('file', (ctx) => (ctx.doc && !ctx.readonly ? [
    { labelKey: 'edx.knowledge.cmdProps', label: 'Tags, folder and properties', icon: 'tag', order: 42, run: () => X.commands.run('knowledge.properties') },
    { labelKey: 'edx.knowledge.cmdBacklinks', label: 'Backlinks panel', icon: 'link', kbd: X.shortcuts.labelFor('knowledge.backlinks'), order: 43, run: () => X.commands.run('knowledge.backlinks') },
  ] : []));
})();
