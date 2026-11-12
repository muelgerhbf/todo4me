/* Todo4Me — knowledge layer, part 1: data model, wiki links, link index, daily notes, search filters.
 * Module "knowledge" (meta prefix kn_). Contract: docs/EDITOR-EXTENSIONS.md.
 *   kn_tags: string[] | kn_folder: 'a/b' | kn_props: {key: value} | kn_archived: ISO|null | kn_links: docId[] (derived on doc-saved)
 *   widget "wikilink" (inline) {d: docId, t: title at link time}
 * Parts 2 and 3: js/ed-knowledge-ui.js (properties strip, backlinks, library, menus), js/ed-knowledge-graph.js. */
(function () {
  'use strict';
  const X = T4.edx, U = T4.util, DS = T4.docstore;
  const esc = U.esc, icon = U.icon;
  const K = (T4.edKnowledge = { loaded: false, docs: [], byId: new Map(), inbound: new Map(), folderStore: [] });
  const t = (key, fb, p) => X.t('edx.knowledge.' + key, fb, p);
  K.t = t;
  K.esc = esc;
  K.icon = icon;
  const ID_RE = /^[\w-]{1,80}$/;

  /* ---------- icons ---------- */
  X.icons.add('folder', '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
  X.icons.add('archive', '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>');
  X.icons.add('graph', '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/><line x1="8" y1="7" x2="16" y2="8"/><line x1="7" y1="8" x2="11" y2="16"/><line x1="17" y1="10" x2="13" y2="16"/>');

  /* ---------- meta fields ---------- */
  const normTag = (s) => {
    s = String(s == null ? '' : s).trim().replace(/^#+/, '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* keep */ }
    return s.replace(/\s+/g, '-').replace(/[^a-z0-9_\-/]/g, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 40);
  };
  const cleanTags = (v) => {
    const out = [];
    (Array.isArray(v) ? v : []).forEach((x) => { if (typeof x !== 'string') return; const n = normTag(x); if (n && !out.includes(n)) out.push(n); });
    return out.slice(0, 30);
  };
  const normFolder = (s) => String(s == null ? '' : s).split('/').map((x) => x.replace(/[\u0000-\u001f\\]/g, '').trim().slice(0, 60)).filter(Boolean).slice(0, 8).join('/');
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  const cleanProps = (v) => {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    let n = 0;
    Object.keys(v).forEach((k0) => {
      const k = String(k0).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
      if (!k || BAD_KEYS.includes(k) || n >= 30 || typeof v[k0] === 'object') return;
      out[k] = String(v[k0] == null ? '' : v[k0]).replace(/[\u0000-\u001f]/g, ' ').slice(0, 500);
      n++;
    });
    return out;
  };
  K.normTag = normTag; K.normFolder = normFolder; K.cleanTags = cleanTags; K.cleanProps = cleanProps;
  X.meta.extend({
    kn_tags: { default: [], clean: cleanTags, dup: 'copy' },
    kn_folder: { default: '', clean: normFolder, dup: 'copy' },
    kn_props: { default: {}, clean: cleanProps, dup: 'copy' },
    kn_archived: { default: null, clean: (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null), dup: 'reset' },
    kn_links: { default: [], clean: (v) => Array.from(new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && ID_RE.test(x)))).slice(0, 1000), dup: 'copy' },
  });

  /* ---------- document cache & link index ---------- */
  const title = (m) => (m && m.title && m.title.trim()) || t('untitled', 'Untitled document');
  K.title = title;
  K.live = () => K.docs.filter((d) => !d.deletedAt);
  K.setDocs = function (list) {
    K.docs = list.slice();
    K.byId = new Map(K.docs.map((d) => [d.id, d]));
    K.inbound = new Map();
    K.docs.forEach((d) => {
      if (d.deletedAt) return;
      (d.kn_links || []).forEach((tg) => { if (tg === d.id) return; if (!K.inbound.has(tg)) K.inbound.set(tg, []); K.inbound.get(tg).push(d.id); });
    });
    K.loaded = true;
    refreshLinks();
    X.events.emit('knowledge:index', {});
    scheduleIndexBuild();
  };
  K.reload = async function () { K.setDocs(await DS.list()); await K.loadFolders(); return K.docs; };
  X.events.on('docs-changed', (e) => K.setDocs(e.docs || []));
  K.allTags = function () {
    const m = new Map();
    K.live().forEach((d) => (d.kn_tags || []).forEach((x) => m.set(x, (m.get(x) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  /* ---------- folders (documents carry the path; empty folders live in the kv store) ---------- */
  const FKEY = 'knowledge.folders';
  K.loadFolders = async function () {
    try { const v = await X.db.kv.get(FKEY); K.folderStore = Array.isArray(v) ? v.map(normFolder).filter(Boolean) : []; } catch (e) { K.folderStore = []; }
    X.events.emit('knowledge:index', {});
  };
  K.saveFolders = async function () {
    K.folderStore = Array.from(new Set(K.folderStore.map(normFolder).filter(Boolean)));
    try { await X.db.kv.set(FKEY, K.folderStore); } catch (e) { /* memory only */ }
  };
  const ancestors = (p) => { const parts = p.split('/'); const out = []; for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/')); return out; };
  K.folderPaths = function () {
    const set = new Set();
    K.folderStore.forEach((p) => ancestors(p).forEach((a) => set.add(a)));
    K.live().forEach((d) => { if (d.kn_folder) ancestors(d.kn_folder).forEach((a) => set.add(a)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  };
  K.createFolder = async function (path) {
    path = normFolder(path);
    if (!path) return null;
    if (!K.folderStore.includes(path)) K.folderStore.push(path);
    await K.saveFolders();
    X.events.emit('knowledge:index', {});
    return path;
  };
  const inFolder = (f, path) => f === path || f.indexOf(path + '/') === 0;
  /** Move/rename a folder subtree: mapFn(oldPath) → new path ('' = root) for every affected path. */
  async function remapFolders(path, mapFn, dropSelf) {
    const affected = K.docs.filter((d) => d.kn_folder && inFolder(d.kn_folder, path));
    for (const d of affected) {
      const nf = normFolder(mapFn(d.kn_folder));
      await touchMeta(d.id, { kn_folder: nf });
    }
    K.folderStore = K.folderStore.filter((p) => !(dropSelf && p === path)).map((p) => (inFolder(p, path) ? mapFn(p) : p)).filter(Boolean);
    await K.saveFolders();
    await K.reload();
  }
  const depthOf = (p) => (p ? p.split('/').length : 0);
  const maxDepthUnder = (path) => Math.max(depthOf(path), ...K.folderPaths().filter((p) => inFolder(p, path)).map(depthOf));
  K.baseName = (p) => p.split('/').pop();
  K.parentOf = (p) => p.split('/').slice(0, -1).join('/');
  K.moveFolder = async function (path, newParent) {
    newParent = normFolder(newParent);
    if (newParent && inFolder(newParent, path)) return false;
    const base = K.baseName(path);
    const dest = newParent ? newParent + '/' + base : base;
    if (dest === path) return false;
    if (depthOf(newParent) + (maxDepthUnder(path) - depthOf(path) + 1) > 8) return false;
    await remapFolders(path, (p) => dest + p.slice(path.length));
    return dest;
  };
  K.renameFolder = async function (path, name) {
    name = String(name || '').replace(/[/\\]/g, ' ').trim().slice(0, 60);
    if (!name) return false;
    const dest = K.parentOf(path) ? K.parentOf(path) + '/' + name : name;
    if (dest === path) return false;
    await remapFolders(path, (p) => dest + p.slice(path.length));
    return dest;
  };
  K.deleteFolder = async function (path) {
    const parent = K.parentOf(path);
    await remapFolders(path, (p) => (p === path ? parent : (parent ? parent + '/' : '') + p.slice(path.length + 1)), true);
    return true;
  };
  /** Metadata update: through the facade for the open document (keeps the editor in sync), docstore otherwise. */
  async function touchMeta(id, patch) {
    const cur = X.editor.current();
    if (cur && cur.id === id) return X.docs.updateMeta(id, patch);
    return DS.touch(id, patch);
  }
  K.updateMeta = touchMeta;
  /** A folder a document leaves stays in the tree (as an empty folder) until the user deletes it. */
  K.keepFolder = async (path) => { path = normFolder(path); if (path && !K.folderStore.includes(path)) { K.folderStore.push(path); await K.saveFolders(); } };
  K.moveDoc = async (id, folder) => {
    const old = K.byId.get(id);
    if (old && old.kn_folder) await K.keepFolder(old.kn_folder);
    const m = await touchMeta(id, { kn_folder: normFolder(folder) });
    await K.reload();
    return m;
  };
  K.setArchived = async (id, on) => { const m = await touchMeta(id, { kn_archived: on ? new Date().toISOString() : null }); await K.reload(); return m; };

  /* ---------- fuzzy matching ---------- */
  const fold = (s) => { s = String(s || '').toLowerCase(); try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* keep */ } return s; };
  K.fold = fold;
  function score(q, text) {
    if (!q) return 1;
    const s = fold(text);
    if (s === q) return 100;
    if (s.startsWith(q)) return 80;
    if (new RegExp('(^|[\\s/_-])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s)) return 65;
    if (s.includes(q)) return 50;
    let i = 0, gaps = 0, last = -1;
    for (const ch of q) {
      const j = s.indexOf(ch, i);
      if (j < 0) return 0;
      if (last >= 0 && j > last + 1) gaps++;
      last = j; i = j + 1;
    }
    return Math.max(5, 30 - gaps * 3);
  }
  K.matchDocs = function (query, opts) {
    opts = opts || {};
    const q = fold(query).trim();
    const cur = X.editor.current();
    const res = [];
    K.docs.forEach((d) => {
      if (d.deletedAt || (cur && d.id === cur.id && !opts.self)) return;
      const sc = score(q, title(d));
      if (!sc) return;
      res.push({ doc: d, score: sc - (d.kn_archived ? 15 : 0) });
    });
    res.sort((a, b) => (b.score - a.score) || String(b.doc.openedAt || b.doc.updatedAt).localeCompare(String(a.doc.openedAt || a.doc.updatedAt)));
    return res.slice(0, opts.limit || 8).map((r) => r.doc);
  };
  K.findByTitle = function (text) {
    const q = fold(text).trim();
    if (!q) return null;
    const c = K.live().filter((d) => fold(title(d)).trim() === q);
    c.sort((a, b) => (!!a.kn_archived - !!b.kn_archived) || b.updatedAt.localeCompare(a.updatedAt));
    return c[0] || null;
  };

  /* ---------- wikilink widget ---------- */
  function resolve(p) {
    const m = K.byId.get(p.d);
    const ok = m && !m.deletedAt;
    return { meta: m || null, ok: !!ok, trashed: !!(m && m.deletedAt), missing: K.loaded && !ok, title: ok ? title(m) : p.t || t('untitled', 'Untitled document') };
  }
  K.resolve = resolve;
  function wikiRoot() { return X.editor.root(); }
  function refreshLinks() {
    let root = null;
    try { root = wikiRoot(); } catch (e) { return; }
    if (!root || !K.loaded) return;
    root.querySelectorAll('.t4-w[data-w="wikilink"]').forEach((w) => { try { T4.edw.render(w); } catch (e) { /* ignore */ } });
  }
  K.refreshLinks = refreshLinks;

  async function openTarget(el, p) {
    const r = resolve(p);
    if (r.ok) { await X.editor.openDoc(p.d); return; }
    const actions = [{ label: t('createNamed', 'Create “{title}”', { title: r.title }), fn: () => createFromMissing(el, p) }];
    if (r.trashed) actions.unshift({ label: t('restore', 'Restore'), fn: async () => { await DS.restore(p.d); await K.reload(); X.editor.openDoc(p.d); } });
    X.editor.toast(r.trashed ? t('inTrash', '“{title}” is in the trash.', { title: r.title }) : t('deleted', '“{title}” does not exist anymore.', { title: r.title }), 'info', 7000, actions);
  }
  async function createFromMissing(el, p) {
    const m = await K.createDoc(p.t || t('untitled', 'Untitled document'));
    if (!m) return;
    if (el && el.isConnected && !X.editor.readonly()) X.editor.run(() => T4.edw.setProps(el, { d: m.id, t: m.title }));
    await X.editor.flush();
    X.editor.openDoc(m.id);
  }
  K.createDoc = async function (name) {
    try {
      const m = await DS.create({ title: String(name || '').trim().slice(0, 200), html: '<p><br></p>', text: '', words: 0 });
      K.byId.set(m.id, m); K.docs.push(m);
      return m;
    } catch (e) { X.editor.toast(e.message, 'error'); return null; }
  };
  K.openLinkWidget = (w) => { try { return openTarget(w, JSON.parse(w.getAttribute('data-p') || '{}')); } catch (e) { return null; } };

  X.widgets.register('wikilink', {
    inline: true,
    validate(p) {
      if (!p || typeof p.d !== 'string' || !ID_RE.test(p.d)) return null;
      return { d: p.d, t: String(p.t == null ? '' : p.t).replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) };
    },
    render(el, p) {
      const r = resolve(p);
      const a = document.createElement('span');
      a.className = 'ed-kn-link' + (r.missing ? ' ed-kn-link--missing' : '');
      a.setAttribute('role', 'link');
      a.setAttribute('aria-label', r.title + (r.missing ? ' (' + t('missing', 'missing') + ')' : ''));
      a.title = r.missing ? t('missingTip', '“{title}” does not exist. Select the link and use Create.', { title: r.title }) : r.title + ' — ' + t('openTip', 'Ctrl+click to open');
      a.innerHTML = icon('link') + '<span class="ed-kn-link__t"></span>';
      a.lastChild.textContent = r.title;
      el.appendChild(a);
    },
    textOf(p) { return '[[' + resolve(p).title + ']]'; },
    toMarkdown(p) { return '[[' + resolve(p).title + ']]'; },
    edit(el, p) { openTarget(el, p); },
    ctxBar: {
      labelKey: 'edx.knowledge.linkBar', label: 'Link to document',
      items(el, p) {
        const r = resolve(p);
        const items = [{ action: r.missing ? 'create' : 'open', icon: r.missing ? 'plus' : 'external', labelKey: r.missing ? 'edx.knowledge.createNamedShort' : 'edx.knowledge.open', label: r.missing ? 'Create document' : 'Open document' }];
        items.push({ action: 'plain', icon: 'unlink', labelKey: 'edx.knowledge.plain', label: 'Replace with plain text' }, { sep: true }, { builtin: 'delete', icon: 'trash', label: t('delete', 'Delete') });
        return items;
      },
      onAction(action, info) {
        const p = info.props;
        if (action === 'open') openTarget(info.el, p);
        else if (action === 'create') createFromMissing(info.el, p);
        else if (action === 'plain') {
          const w = info.el, txt = resolve(p).title;
          X.editor.run(() => { const n = document.createTextNode(txt); w.replaceWith(n); const r = document.createRange(); r.setStartAfter(n); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        }
      },
    },
  });
  K.makeLink = (doc) => T4.edw.create('wikilink', { d: doc.id, t: title(doc) }, true);

  /* ---------- [[ autocomplete ---------- */
  let ac = null;
  function closeAc() { if (ac) { ac.el.remove(); ac = null; } }
  K.closeAc = closeAc;
  function acItems(query) {
    const items = K.matchDocs(query, { limit: 8 }).map((d) => ({ doc: d }));
    const q = query.trim();
    if (q && !K.findByTitle(q)) items.push({ create: true, text: q });
    return items;
  }
  function paintAc() {
    const m = ac.el;
    m.innerHTML = ac.items.map((it, i) => {
      const lbl = it.create ? t('createNamed', 'Create “{title}”', { title: it.text }) : title(it.doc);
      const sub = it.create ? '' : (it.doc.kn_folder ? '<span class="ed-kn-ac__sub">' + esc(it.doc.kn_folder) + '</span>' : '');
      return '<button type="button" class="ed-menu__item' + (i === ac.i ? ' is-active' : '') + '" role="option" id="ed-kn-ac-' + i + '" aria-selected="' + (i === ac.i) + '" data-ki="' + i + '"><span class="ed-menu__icon">' + icon(it.create ? 'plus' : 'link') + '</span><span class="ed-menu__label">' + esc(lbl) + '</span>' + sub + '</button>';
    }).join('') || '<div class="ed-menu__heading">' + esc(t('noDocs', 'No documents')) + '</div>';
    const r = ac.rect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    const below = innerHeight - r.bottom - 12;
    m.style.top = (below < m.offsetHeight + 8 && r.top > below ? r.top - m.offsetHeight - 6 : r.bottom + 6) + 'px';
    const act = m.querySelector('.is-active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function caretRect(node, off) {
    const rg = document.createRange();
    rg.setStart(node, off); rg.collapse(true);
    let r = rg.getBoundingClientRect();
    if (!r.height) r = (node.parentElement || node).getBoundingClientRect();
    return r;
  }
  function openAc(node, start, end, query) {
    const items = acItems(query);
    if (!ac) {
      const el = document.createElement('div');
      el.className = 'ed-menu ed-kn-ac';
      el.setAttribute('role', 'listbox');
      el.setAttribute('aria-label', t('acLabel', 'Link to document'));
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-ki]'); if (b && ac) accept(ac.items[+b.dataset.ki]); });
      document.body.appendChild(el);
      ac = { el, i: 0 };
    }
    Object.assign(ac, { node, start, end, query, items, rect: () => caretRect(node, Math.min(end, node.nodeValue.length)) });
    ac.i = Math.min(ac.i, Math.max(0, items.length - 1));
    paintAc();
  }
  async function accept(item) {
    const a = ac;
    closeAc();
    if (!item || !a) return;
    let target = item.doc;
    if (item.create) target = await K.createDoc(item.text);
    if (!target) return;
    const node = a.node;
    if (!node.isConnected || node.nodeValue.slice(a.start, a.start + 2) !== '[[') return;
    const r = document.createRange();
    r.setStart(node, a.start);
    r.setEnd(node, Math.min(node.nodeValue.length, a.end));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    X.editor.insertInlineWidget(K.makeLink(target));
  }
  /** Look at the text before the caret: `[[query` opens the picker, `[[Exact Title]]` converts straight away. */
  function checkAc(fromInput) {
    let root;
    try { root = wikiRoot(); } catch (e) { return; }
    const sel = getSelection();
    if (!root || X.editor.readonly() || !sel.rangeCount || !sel.isCollapsed) { closeAc(); return; }
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3 || !root.contains(node) || (node.parentElement && node.parentElement.closest('pre, code, .t4-w'))) { closeAc(); return; }
    const off = sel.anchorOffset;
    const before = node.nodeValue.slice(0, off);
    if (fromInput) {
      const done = /\[\[([^[\]\n]{1,200})\]\]$/.exec(before);
      if (done) {
        const target = K.findByTitle(done[1]);
        if (target) {
          closeAc();
          const r = document.createRange(); r.setStart(node, off - done[0].length); r.setEnd(node, off);
          sel.removeAllRanges(); sel.addRange(r);
          X.editor.insertInlineWidget(K.makeLink(target));
          return;
        }
      }
    }
    const m = /\[\[([^[\]\n]{0,80})$/.exec(before);
    if (!m) { closeAc(); return; }
    if (!fromInput && !ac) return;
    openAc(node, off - m[0].length, off, m[1]);
  }
  K.triggerAc = () => checkAc(false) || (ac ? 0 : 0);
  K.acOpen = () => !!ac;

  /** Convert literal [[Title]] text (after a paste) into wikilinks when a document with exactly that title exists. */
  function convertTextLinks(root) {
    const list = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.indexOf('[[') >= 0 && !(n.parentElement && n.parentElement.closest('pre, code, .t4-w')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    while (w.nextNode()) list.push(w.currentNode);
    const jobs = [];
    list.forEach((n) => {
      const re = /\[\[([^[\]\n]{1,200})\]\]/g; let m; const hits = [];
      while ((m = re.exec(n.nodeValue))) { const tg = K.findByTitle(m[1]); if (tg) hits.push({ i: m.index, len: m[0].length, tg }); }
      if (hits.length) jobs.push({ n, hits });
    });
    if (!jobs.length) return 0;
    X.editor.run(() => {
      jobs.forEach(({ n, hits }) => {
        const frag = document.createDocumentFragment();
        let pos = 0;
        hits.forEach((h) => {
          if (h.i > pos) frag.appendChild(document.createTextNode(n.nodeValue.slice(pos, h.i)));
          const el = K.makeLink(h.tg);
          frag.appendChild(el);
          pos = h.i + h.len;
        });
        if (pos < n.nodeValue.length) frag.appendChild(document.createTextNode(n.nodeValue.slice(pos)));
        n.replaceWith(frag);
      });
      T4.edw.hydrate(root);
    }, { keepFocus: true });
    return jobs.length;
  }
  K.convertTextLinks = convertTextLinks;

  X.events.on('shell-built', ({ root }) => {
    closeAc();
    const doc = root.querySelector('#ed-doc');
    if (!doc) return;
    doc.addEventListener('input', (e) => { if (!e.isComposing) checkAc(true); });
    root.addEventListener('keydown', (e) => {
      if (!ac || e.isComposing) return;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'ArrowDown') { stop(); ac.i = (ac.i + 1) % Math.max(1, ac.items.length); paintAc(); }
      else if (e.key === 'ArrowUp') { stop(); ac.i = (ac.i - 1 + ac.items.length) % Math.max(1, ac.items.length); paintAc(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { if (ac.items.length) { stop(); accept(ac.items[ac.i]); } else closeAc(); }
      else if (e.key === 'Escape') { stop(); closeAc(); }
    }, true);
    root.addEventListener('click', (e) => {
      const w = e.target.closest && e.target.closest('.t4-w[data-w="wikilink"]');
      if (!w || !doc.contains(w)) return;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); K.openLinkWidget(w); }
    }, true);
    doc.addEventListener('paste', () => { setTimeout(() => { try { if (!X.editor.readonly()) convertTextLinks(doc); } catch (err) { console.error(err); } }, 120); });
    doc.addEventListener('blur', () => setTimeout(() => { if (ac && !(document.activeElement && ac.el.contains(document.activeElement))) closeAc(); }, 150));
    if (!K.loaded) X.editor.ready().then(() => { if (!K.loaded) K.setDocs(X.editor.cachedDocs()); K.loadFolders(); });
  });
  X.events.on('selection-change', () => { if (ac) checkAc(false); });
  X.events.on('doc-open', () => { closeAc(); refreshLinks(); });

  /* ---------- kn_links: derived from the wikilinks when a document is saved ---------- */
  function linksOfHtml(html) {
    if (html.indexOf('data-w="wikilink"') < 0) return [];
    const d = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    const out = [];
    d.querySelectorAll('[data-w="wikilink"]').forEach((w) => {
      try { const p = JSON.parse(w.getAttribute('data-p') || '{}'); if (typeof p.d === 'string' && ID_RE.test(p.d) && !out.includes(p.d)) out.push(p.d); } catch (e) { /* ignore */ }
    });
    return out;
  }
  K.linksOfHtml = linksOfHtml;
  X.events.on('doc-saved', async ({ id, meta, html }) => {
    const links = linksOfHtml(html || '').filter((x) => x !== id);
    const old = (meta && meta.kn_links) || [];
    if (links.length === old.length && links.every((x) => old.includes(x))) return;
    try { await DS.touch(id, { kn_links: links }); } catch (e) { /* ignore */ }
  });
  // One-time (per session) background index for documents that carry [[…]] in their text but no kn_links (imports, older bundles).
  const checked = new Set();
  let buildTimer = 0;
  function scheduleIndexBuild() {
    if (buildTimer) return;
    const todo = () => K.docs.filter((d) => !d.deletedAt && !(d.kn_links || []).length && d.text && d.text.indexOf('[[') >= 0 && !checked.has(d.id));
    if (!todo().length) return;
    buildTimer = setTimeout(async function step() {
      const batch = todo().slice(0, 5);
      if (!batch.length) { buildTimer = 0; return; }
      for (const d of batch) {
        checked.add(d.id);
        try { const full = await DS.get(d.id); const l = full ? linksOfHtml(full.html).filter((x) => x !== d.id) : []; if (l.length) await DS.touch(d.id, { kn_links: l }); } catch (e) { /* ignore */ }
      }
      buildTimer = setTimeout(step, 40);
    }, 300);
  }

  /* ---------- daily notes ---------- */
  const dailyBusy = {};
  K.dailyLabel = (date) => U.fmt(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  function dailyHtml(date) {
    return '<h1>' + esc(K.dailyLabel(date)) + '</h1><h2>' + esc(t('dailyPlan', 'Plan')) + '</h2><ul><li><br></li></ul><h2>' + esc(t('dailyNotes', 'Notes')) + '</h2><p><br></p><h2>' + esc(t('dailyDone', 'Done and thoughts')) + '</h2><p><br></p>';
  }
  K.openDaily = function (date) {
    date = date && U.isDateStr(date) ? date : U.today();
    if (dailyBusy[date]) return dailyBusy[date];
    const p = (async () => {
      await X.editor.ready();
      const all = await DS.list();
      const daily = all.filter((d) => !d.deletedAt && d.kn_props && d.kn_props.daily);
      const found = daily.filter((d) => d.kn_props.daily === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (found) { await X.editor.openDoc(found.id); return found; }
      const prev = daily.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const folder = prev && prev.kn_folder ? prev.kn_folder : t('dailyFolder', 'Daily notes');
      const meta = await X.editor.newDocument({ title: K.dailyLabel(date), html: dailyHtml(date), meta: { kn_folder: folder, kn_props: { daily: date }, kn_tags: ['daily'] } });
      return meta;
    })();
    dailyBusy[date] = p;
    const done = () => { delete dailyBusy[date]; };
    p.then(done, done);
    return p;
  };

  /* ---------- search filters: tag:x folder:x is:archived links:Title ---------- */
  K.parseQuery = function (q) {
    const f = { tags: [], folders: [], archived: false, links: [], rest: [] };
    const re = /(tag|folder|links|is):("([^"]*)"|\S+)|("([^"]*)")|(\S+)/gi;
    let m;
    while ((m = re.exec(q))) {
      if (m[1]) {
        const key = m[1].toLowerCase(), val = (m[3] != null ? m[3] : m[2]).trim();
        if (key === 'tag') { const n = normTag(val); if (n) f.tags.push(n); }
        else if (key === 'folder') { if (val) f.folders.push(fold(val)); }
        else if (key === 'links') { if (val) f.links.push(fold(val)); }
        else if (key === 'is' && /^archived$/i.test(val)) f.archived = true;
        else f.rest.push(m[0]);
      } else f.rest.push(m[5] != null ? m[5] : m[6]);
    }
    f.any = !!(f.tags.length || f.folders.length || f.links.length || f.archived);
    return f;
  };
  X.search.register({
    id: 'knowledge.filters', order: 10,
    query(q) {
      const f = K.parseQuery(q);
      if (!f.any) return [];
      const rest = f.rest.map(fold).join(' ').trim();
      const out = [];
      K.live().forEach((d) => {
        if (!f.archived && d.kn_archived) return;
        if (f.archived && !d.kn_archived) return;
        if (f.tags.some((x) => !(d.kn_tags || []).some((tg) => tg === x || tg.indexOf(x + '/') === 0))) return;
        const folder = fold(d.kn_folder || '');
        if (f.folders.some((x) => !(folder === x || folder.indexOf(x + '/') === 0 || folder.split('/').includes(x)))) return;
        if (f.links.length) {
          const outT = (d.kn_links || []).map((id) => fold(title(K.byId.get(id))));
          if (f.links.some((x) => !outT.some((tt) => tt === x || tt.includes(x)))) return;
        }
        if (rest && !(fold(title(d)) + ' ' + fold(d.text)).includes(rest)) return;
        out.push({ id: d.id, score: 8, snippet: (d.kn_folder ? d.kn_folder + ' · ' : '') + (d.kn_tags || []).map((x) => '#' + x).join(' ') });
      });
      return out;
    },
  });

  /* ---------- commands, shortcuts, slash, menus ---------- */
  X.commands.register('knowledge.link', {
    labelKey: 'edx.knowledge.cmdLink', label: 'Link to document', icon: 'link', group: 'Knowledge', order: 10,
    run() { X.editor.restore(); X.editor.insertText('[['); checkAc(true); },
  });
  X.commands.register('knowledge.backlinks', {
    labelKey: 'edx.knowledge.cmdBacklinks', label: 'Backlinks panel', icon: 'link', group: 'Knowledge', order: 20, readonlyOk: true,
    run() { X.panels.toggle('knowledge-backlinks'); },
  });
  X.commands.register('knowledge.daily', {
    labelKey: 'edx.knowledge.cmdDaily', label: 'Today’s note', icon: 'calendar', group: 'Knowledge', order: 30, global: true, readonlyOk: true,
    run() { return K.openDaily(); },
  });
  X.commands.register('knowledge.graph', {
    labelKey: 'edx.knowledge.cmdGraph', label: 'Knowledge graph', icon: 'graph', group: 'Knowledge', order: 40, global: true, readonlyOk: true,
    run() { return K.openGraph && K.openGraph(); },
  });
  X.commands.register('knowledge.library', {
    labelKey: 'edx.knowledge.cmdLibrary', label: 'Folders and tags', icon: 'folder', group: 'Knowledge', order: 50, global: true, readonlyOk: true,
    run() { X.panels.toggle('knowledge-library'); },
  });
  X.shortcuts.add('mod-shift-b', 'knowledge.backlinks');
  X.shortcuts.add('mod-alt-d', 'knowledge.daily');
  X.slash.add({ id: 'knowledge.link', labelKey: 'edx.knowledge.cmdLink', label: 'Link to document', keywords: ['wiki', 'link', 'page', 'reference', '[['], icon: 'link', group: 'Knowledge', order: 10, run() { X.commands.run('knowledge.link'); } });
  X.slash.add({ id: 'knowledge.daily', labelKey: 'edx.knowledge.cmdDaily', label: 'Today’s note', keywords: ['daily', 'journal', 'today'], icon: 'calendar', group: 'Knowledge', order: 11, run() { K.openDaily(); } });
  X.menus.add('insert', { labelKey: 'edx.knowledge.cmdLink', label: 'Link to document', icon: 'link', order: 40, run() { X.commands.run('knowledge.link'); } });
  X.menus.add('file', (ctx) => [
    { labelKey: 'edx.knowledge.cmdDaily', label: 'Today’s note', icon: 'calendar', kbd: X.shortcuts.labelFor('knowledge.daily'), order: 40, run() { K.openDaily(); } },
    { labelKey: 'edx.knowledge.cmdGraph', label: 'Knowledge graph', icon: 'graph', order: 41, run() { K.openGraph && K.openGraph(); } },
  ]);
})();
