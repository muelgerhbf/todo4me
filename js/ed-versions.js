/* Todo4Me — editor module "versions": version history, comparison, recovery and crash drafts.
 *
 *   - Automatic versions (doc-saved: >= 10 min since the last one and a meaningful change; doc-close; before-bulk-change) with a
 *     retention policy (24 h all, hourly for 7 days, daily for 90 days, max 200), manual named versions that are never pruned.
 *   - Right panel "versions-history" (Ctrl+Shift+H): grouped list, read-only preview, restore (undoable), restore as copy,
 *     rename, delete, compare with the current document or with another version.
 *   - Crash recovery: an emergency draft of unsaved changes (kv store, throttled) and a banner on the next open.
 * Uses only the module API (T4.edx); pure logic lives in js/ed-versions-lib.js. Meta/kv keys: 'versions.*'. */
(function () {
  'use strict';
  const edx = T4.edx, L = T4.edVersionsLib;
  const t = (k, f, p) => edx.t('edx.versions.' + k, f, p);
  const esc = edx.util.esc, icon = edx.util.icon;
  const V = () => edx.db.versions, K = () => edx.db.kv;
  const PANEL = 'versions-history';
  const log = (...a) => console.error('[Todo4Me versions]', ...a);

  const api = T4.edVersions = {
    /** Injectable clock (tests fake time): () → epoch ms. */
    clock: () => Date.now(),
    config: { intervalMs: 10 * 60 * 1000, minChars: 20, draftMs: 2000 },
    _states: new Map(),
  };

  /* ====================== small helpers ====================== */
  let queue = Promise.resolve();
  /** All version writes run one after the other (a save, a close and a restore never interleave). */
  function enq(fn) {
    const p = queue.then(fn);
    queue = p.catch((e) => { log(e); });
    return p;
  }
  const isoNow = () => new Date(api.clock()).toISOString();
  const hasText = (html) => L.blocksOf(html).some((b) => b.text || b.tag === 'widget' || b.tag === 'hr');
  const fmtBytes = (n) => {
    const f = (x, d) => T4.i18n.fmtNumber(x, { maximumFractionDigits: d, minimumFractionDigits: d });
    if (n < 1024) return f(n, 0) + ' B';
    if (n < 1048576) return f(n / 1024, n < 10240 ? 1 : 0) + ' KB';
    return f(n / 1048576, 1) + ' MB';
  };
  const timeOf = (iso) => T4.i18n.fmtTime(new Date(iso));
  function dayLabel(iso) {
    const d = new Date(iso), now = new Date(api.clock());
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return t('today', 'Today');
    if (diff === 1) return t('yesterday', 'Yesterday');
    return T4.i18n.fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
  const curDoc = () => { try { return edx.editor.current(); } catch (e) { return null; } };

  /* ====================== labels (names of versions) ====================== */
  // Names can contain any characters, the version record's `reason` cannot: they live in the kv store, one entry per document.
  const labelKey = (docId) => 'versions.labels.' + docId;
  const labelCache = new Map();
  async function labelsOf(docId) {
    if (!labelCache.has(docId)) labelCache.set(docId, (await K().get(labelKey(docId))) || {});
    return labelCache.get(docId);
  }
  async function setLabel(docId, verId, name) {
    const m = Object.assign({}, await labelsOf(docId));
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (name) m[verId] = name; else delete m[verId];
    labelCache.set(docId, m);
    if (Object.keys(m).length) await K().set(labelKey(docId), m); else await K().remove(labelKey(docId));
  }
  const MANUAL = (rec, labels) => rec.reason === 'manual' || !!(labels && labels[rec.id]);

  /* ====================== per-document state ====================== */
  const sizeCache = new Map(); // version id → html length (immutable)
  async function initState(id) {
    const list = await V().list(id);
    const s = { id, any: list.length > 0, lastAt: list[0] ? Date.parse(list[0].createdAt) : 0, lastId: list[0] ? list[0].id : null, lastHtml: null, baseline: null, edited: false, stored: null, storedAt: null };
    const d = await edx.docs.get(id);
    if (d) {
      s.stored = d.html; s.storedAt = d.meta.updatedAt;
      if (!s.any && hasText(d.html)) s.baseline = { html: d.html, at: Date.parse(d.meta.updatedAt) || api.clock(), title: d.meta.title };
    }
    api._states.set(id, s);
    return s;
  }
  const stateOf = async (id) => api._states.get(id) || initState(id);

  /** Store a version, prune by the retention policy. Returns the record. */
  async function addVersion(docId, html, reason, o) {
    o = o || {};
    const s = await stateOf(docId);
    const w = T4.edcore.statsOf(html).words;
    const now = api.clock();
    const at = Math.min(o.at || now, now);
    const rec = await V().add({ docId, html, title: o.title == null ? '' : o.title, words: w, reason, createdAt: new Date(at).toISOString() });
    if (o.label) await setLabel(docId, rec.id, o.label);
    sizeCache.set(rec.id, html.length);
    if (at >= s.lastAt) { s.lastAt = at; s.lastId = rec.id; s.lastHtml = html; }
    s.any = true;
    await prune(docId);
    refreshPanelSoon();
    return rec;
  }
  async function prune(docId) {
    const list = await V().list(docId);
    const labels = await labelsOf(docId);
    const plan = L.planRetention(list, api.clock(), { protect: (r) => MANUAL(r, labels) });
    for (const id of plan.remove) { await V().remove(id); sizeCache.delete(id); }
    return plan.remove.length;
  }
  async function lastHtmlOf(s) {
    if (s.lastHtml == null && s.lastId) { const r = await V().get(s.lastId); s.lastHtml = r ? r.html : null; if (!r) { await reloadState(s.id); } }
    return s.lastHtml;
  }
  async function reloadState(id) {
    api._states.delete(id);
    return initState(id);
  }

  /* ====================== automatic versions ====================== */
  edx.events.on('doc-open', (e) => { enq(() => initState(e.id)).then(() => checkDraft(e.id)).catch(log); });
  edx.events.on('doc-saved', (e) => {
    const id = e.id, html = e.html, meta = e.meta;
    enq(async () => {
      const s = await stateOf(id);
      s.edited = true; s.stored = html;
      if (!s.any && s.baseline) { // the document as it was when opened: the very first version, so the original is never lost
        const b = s.baseline; s.baseline = null;
        if (b.html !== html) await addVersion(id, b.html, 'auto', { title: b.title, at: b.at });
      }
      if (api.clock() - s.lastAt < api.config.intervalMs) return;
      const last = await lastHtmlOf(s);
      if (last != null) {
        if (last === html) return;
        const c = L.changeSize(last, html);
        if (c.chars < api.config.minChars && !c.structure) return;
      } else if (L.blocksOf(html).map((b) => b.text).join('').length < api.config.minChars) return;
      await addVersion(id, html, 'auto', { title: meta && meta.title });
    });
    draftSaved(id, html);
  });
  edx.events.on('doc-close', (e) => {
    const id = e.id;
    draftClosed(id);
    enq(async () => {
      const s = api._states.get(id);
      if (!s || !s.edited) return;
      s.edited = false;
      const d = await edx.docs.get(id);
      if (!d || d.meta.deletedAt) return;
      const last = await lastHtmlOf(s);
      if (last === d.html || (last == null && !hasText(d.html))) return;
      await addVersion(id, d.html, 'close', { title: d.meta.title });
    });
  });
  // Optional hook for destructive operations of other modules (replace all, import over a document): they emit 'before-bulk-change'.
  edx.events.on('before-bulk-change', () => { api.snapshot('bulk'); });

  /** Store the current state as a version now (reason: auto | close | bulk | restore | recover | manual). Resolves the record or null. */
  api.idle = () => queue;
  api.prune = prune;
  api.snapshot = function (reason, label) {
    const cur = curDoc();
    if (!cur) return Promise.resolve(null);
    const html = edx.editor.snapshot().html; // taken synchronously, before whatever follows changes the document
    return enq(async () => {
      const s = await stateOf(cur.id);
      if (reason !== 'manual' && reason !== 'restore' && reason !== 'recover') {
        const last = await lastHtmlOf(s);
        if (last === html) return null;
      }
      return addVersion(cur.id, html, reason || 'auto', { title: cur.meta.title, label });
    });
  };

  /* ====================== restore, copy, rename, delete ====================== */
  async function restoreVersion(id) {
    const cur = curDoc();
    if (!cur) return false;
    if (edx.editor.readonly()) { edx.editor.toast(t('readonly', 'This document is in the trash. Restore it first.'), 'info'); return false; }
    const rec = await V().get(id);
    if (!rec || rec.docId !== cur.id) return false;
    await edx.editor.flush();
    await api.snapshot('restore');
    edx.editor.setHtml(rec.html);
    edx.editor.closeModal(true);
    edx.editor.toast(t('restored', 'Version from {when} restored.', { when: T4.util.fmtDateTime(rec.createdAt) }), 'success', 9000, { label: t('undo', 'Undo'), fn: () => { try { T4.edcore.undo(); } catch (e) { log(e); } } });
    refreshPanelSoon();
    return true;
  }
  async function restoreAsCopy(id) {
    const rec = await V().get(id);
    if (!rec) return null;
    const base = rec.title || (curDoc() && curDoc().meta.title) || t('untitled', 'Untitled document');
    edx.editor.closeModal(true);
    const meta = await edx.editor.newDocument({ title: (base + ' (' + t('versionOf', 'version of {when}', { when: T4.util.fmtDateTime(rec.createdAt) }) + ')').slice(0, 200), html: rec.html });
    if (meta) edx.editor.toast(t('copied', 'Opened a copy of the version as a new document.'), 'success');
    return meta;
  }
  async function renameVersion(id) {
    const cur = curDoc();
    const rec = await V().get(id);
    if (!cur || !rec) return;
    const labels = await labelsOf(rec.docId);
    const name = await promptName({ title: t('renameTitle', 'Name this version'), value: labels[id] || '', ok: t('rename', 'Rename') });
    if (name == null) return;
    await enq(() => setLabel(rec.docId, id, name));
    refreshPanelSoon();
  }
  async function deleteVersion(id) {
    const rec = await V().get(id);
    if (!rec) return;
    const yes = await edx.editor.confirm({ title: t('deleteTitle', 'Delete this version?'), message: t('deleteMsg', 'The version from {when} is removed for good. The document itself stays as it is.', { when: T4.util.fmtDateTime(rec.createdAt) }), confirmText: t('delete', 'Delete'), danger: true });
    if (!yes) return;
    await enq(async () => {
      await V().remove(id); sizeCache.delete(id);
      await setLabel(rec.docId, id, '');
      await reloadState(rec.docId);
    });
    refreshPanelSoon();
  }
  api.restore = restoreVersion; api.restoreAsCopy = restoreAsCopy; api.rename = renameVersion; api.remove = deleteVersion;
  api.setLabel = (docId, verId, name) => enq(() => setLabel(docId, verId, name));

  /** Small modal with one text field → Promise<string | null>. */
  function promptName(o) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; edx.editor.closeModal(true); resolve(v); };
      edx.editor.openModal({
        title: o.title,
        body: '<label class="field"><span class="field__label">' + esc(t('nameLabel', 'Name (optional)')) + '</span><input type="text" class="input ed-vh-name" maxlength="80" autofocus autocomplete="off" value="' + esc(o.value || '') + '" placeholder="' + esc(t('namePlaceholder', 'e.g. Draft for review')) + '"></label>',
        footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(t('cancel', 'Cancel')) + '</button><button type="button" class="btn btn--primary" data-vh-ok>' + esc(o.ok) + '</button>',
        size: 'sm',
        onMount(m) {
          const input = m.querySelector('.ed-vh-name');
          m.querySelector('[data-vh-ok]').addEventListener('click', () => finish(input.value));
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value); } });
          input.select();
        },
        onClose() { finish(null); },
      });
    });
  }
  async function saveManual() {
    const cur = curDoc();
    if (!cur || edx.editor.readonly()) return null;
    const name = await promptName({ title: t('saveTitle', 'Save version'), ok: t('save', 'Save') });
    if (name == null) return null;
    await edx.editor.flush();
    const rec = await api.snapshot('manual', name);
    edx.editor.toast(t('saved', 'Version saved.'), 'success');
    return rec;
  }
  api.saveManual = saveManual;

  /* ====================== preview ====================== */
  /** Read-only rendering of stored HTML on a white "paper" (sanitized like every load, widgets and images included). */
  async function paper(html) {
    await T4.edw.ensureLibs();
    const box = document.createElement('div');
    box.className = 'ed-vh-paper t4-doc';
    box.setAttribute('contenteditable', 'false');
    box.appendChild(T4.edSanitize.sanitize(html));
    T4.edw.hydrate(box);
    return box;
  }
  async function labelFor(rec) {
    const labels = await labelsOf(rec.docId);
    return labels[rec.id] || kindLabel(rec);
  }
  const kindLabel = (rec) => ({ manual: t('kindManual', 'Saved version'), restore: t('kindRestore', 'Before restore'), recover: t('kindRecover', 'Before recovery'), bulk: t('kindBulk', 'Before a bulk change'), close: t('kindClose', 'On closing'), auto: t('kindAuto', 'Automatic version') }[rec.reason] || t('kindAuto', 'Automatic version'));

  async function openPreview(id) {
    const rec = await V().get(id);
    if (!rec) return;
    const label = await labelFor(rec);
    const cur = curDoc();
    const canRestore = !!cur && cur.id === rec.docId && !edx.editor.readonly();
    edx.editor.openModal({
      title: label + ' · ' + T4.util.fmtDateTime(rec.createdAt),
      body: '<div class="ed-vh-pv-meta muted small">' + esc(t('words', '{n} words', { n: rec.words })) + ' · ' + esc(fmtBytes(rec.html.length)) + ' · ' + esc(t('readOnly', 'Read-only preview')) + '</div><div class="ed-vh-pv" tabindex="0" aria-label="' + esc(t('previewLabel', 'Preview of the version')) + '"><p class="muted">' + esc(t('loading', 'Loading…')) + '</p></div>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(t('close', 'Close')) + '</button>' +
        '<button type="button" class="btn" data-vh-do="compare">' + icon('search') + esc(t('compareCurrent', 'Compare with current')) + '</button>' +
        '<button type="button" class="btn" data-vh-do="copy">' + icon('copy') + esc(t('restoreCopy', 'Restore as copy')) + '</button>' +
        (canRestore ? '<button type="button" class="btn btn--primary" data-vh-do="restore">' + icon('reset') + esc(t('restore', 'Restore')) + '</button>' : ''),
      size: 'lg',
      onMount(m) {
        m.classList.add('ed-vh-modal');
        const host = m.querySelector('.ed-vh-pv');
        paper(rec.html).then((p) => { host.innerHTML = ''; host.appendChild(p); }).catch((e) => { log(e); host.textContent = t('previewFailed', 'This version could not be shown.'); });
        m.querySelectorAll('[data-vh-do]').forEach((b) => b.addEventListener('click', () => {
          const act = b.dataset.vhDo;
          if (act === 'restore') restoreVersion(id);
          else if (act === 'copy') restoreAsCopy(id);
          else if (act === 'compare') openCompare(id, 'current');
        }));
      },
    });
  }
  api.preview = openPreview;

  /* ====================== compare ====================== */
  /** A and B are version ids or 'current' (the live document) or { label, html, at } objects. Older first. */
  async function resolveSide(x) {
    if (x === 'current') return { label: t('currentDoc', 'Current document'), html: edx.editor.snapshot().html, current: true };
    if (typeof x === 'string') {
      const r = await V().get(x);
      if (!r) return null;
      return { label: (await labelFor(r)) + ' · ' + T4.util.fmtDateTime(r.createdAt), html: r.html, at: Date.parse(r.createdAt), id: r.id };
    }
    return x;
  }
  async function openCompare(a, b, extra) {
    let A = await resolveSide(a), B = await resolveSide(b);
    if (!A || !B) return;
    if (!A.current && !B.current && A.at && B.at && A.at > B.at) [A, B] = [B, A];
    const t0 = performance.now();
    const diff = L.diffDocs(A.html, B.html);
    const ms = Math.round(performance.now() - t0);
    const s = diff.stats;
    const mode0 = (await K().get('versions.prefs') || {}).mode === 'inline' ? 'inline' : 'side';
    const summary = !s.changes ? t('noDiff', 'No differences in the text.') : t('summary', '{n} changed blocks: {ins} added, {del} removed ({words1} words added, {words2} words removed)', { n: s.changes, ins: s.added, del: s.removed, words1: s.insWords, words2: s.delWords });
    edx.editor.openModal({
      title: t('compareTitle', 'Compare versions'),
      body: '<div class="ed-vh-cmp" data-mode="' + mode0 + '">' +
        '<div class="ed-vh-cmp__bar" role="toolbar" aria-label="' + esc(t('compareTools', 'Comparison options')) + '">' +
          '<div class="seg" role="radiogroup" aria-label="' + esc(t('viewMode', 'View')) + '"><button type="button" class="seg__btn" role="radio" data-vh-mode="side">' + esc(t('sideBySide', 'Side by side')) + '</button><button type="button" class="seg__btn" role="radio" data-vh-mode="inline">' + esc(t('inline', 'Inline')) + '</button></div>' +
          '<label class="ed-vh-check"><input type="checkbox" data-vh-only> ' + esc(t('onlyChanges', 'Only changes')) + '</label>' +
          '<span class="ed-vh-cmp__nav"><button type="button" class="btn btn--sm" data-vh-nav="-1" aria-label="' + esc(t('prevChange', 'Previous change')) + '" title="' + esc(t('prevChange', 'Previous change')) + ' (Shift+F3)">' + icon('chevron-left') + '</button><span class="ed-vh-cmp__pos" aria-live="polite"></span><button type="button" class="btn btn--sm" data-vh-nav="1" aria-label="' + esc(t('nextChange', 'Next change')) + '" title="' + esc(t('nextChange', 'Next change')) + ' (F3)">' + icon('chevron-right') + '</button></span>' +
        '</div>' +
        '<p class="ed-vh-cmp__sum" role="status">' + esc(summary) + '</p>' +
        '<div class="ed-vh-cmp__heads"><span>' + esc(A.label) + '</span><span>' + esc(B.label) + '</span></div>' +
        '<div class="ed-vh-cmp__body" tabindex="0" aria-label="' + esc(t('compareBody', 'Differences')) + '"></div>' +
        '<p class="muted small">' + esc(t('textOnly', 'The comparison covers text, headings, lists, tables and the type of images and objects; formatting such as bold is not compared.')) + '</p>' +
      '</div>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(t('close', 'Close')) + '</button>' +
        (extra && extra.buttons ? extra.buttons.map((x, i) => '<button type="button" class="btn ' + (x.primary ? 'btn--primary' : '') + '" data-vh-x="' + i + '">' + esc(x.label) + '</button>').join('') : '') +
        (B.current && A.id && !edx.editor.readonly() ? '<button type="button" class="btn btn--primary" data-vh-x="restore">' + icon('reset') + esc(t('restoreThis', 'Restore this version')) + '</button>' : ''),
      size: 'lg',
      onMount(m) {
        m.classList.add('ed-vh-modal', 'ed-vh-modal--wide');
        const root = m.querySelector('.ed-vh-cmp'), body = m.querySelector('.ed-vh-cmp__body'), pos = m.querySelector('.ed-vh-cmp__pos');
        root.dataset.ms = String(ms);
        let idx = -1;
        const render = () => {
          const mode = root.dataset.mode, only = m.querySelector('[data-vh-only]').checked;
          body.innerHTML = renderRows(diff.rows, mode, only);
          m.querySelectorAll('[data-vh-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vhMode === mode)));
          root.querySelector('.ed-vh-cmp__heads').hidden = mode !== 'side';
          idx = -1; updatePos();
        };
        const chg = () => body.querySelectorAll('.ed-vh-chg');
        const updatePos = () => { const n = chg().length; pos.textContent = n ? (idx >= 0 ? (idx + 1) + ' / ' + n : '– / ' + n) : '0'; };
        const go = (d) => {
          const list = chg();
          if (!list.length) return;
          if (idx >= 0 && list[idx]) list[idx].classList.remove('is-cur');
          idx = idx < 0 ? (d > 0 ? 0 : list.length - 1) : (idx + d + list.length) % list.length;
          const el = list[idx];
          el.classList.add('is-cur');
          el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          updatePos();
        };
        m.querySelectorAll('[data-vh-nav]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.vhNav)));
        m.querySelectorAll('[data-vh-mode]').forEach((b) => b.addEventListener('click', () => { root.dataset.mode = b.dataset.vhMode; K().set('versions.prefs', { mode: b.dataset.vhMode }).catch(() => {}); render(); }));
        m.querySelector('[data-vh-only]').addEventListener('change', render);
        m.addEventListener('keydown', (e) => { if (e.key === 'F3') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
        m.querySelectorAll('[data-vh-x]').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.vhX === 'restore') restoreVersion(A.id);
          else extra.buttons[+b.dataset.vhX].run();
        }));
        render();
      },
    });
    return { diff, ms };
  }
  api.compare = openCompare;

  function opsHtml(ops, side) {
    return ops.map((o) => {
      if (o.t === 'eq') return esc(o.s);
      if (o.t === 'del') return side === 'new' ? '' : '<del class="ed-vh-del">' + esc(o.s) + '</del>';
      return side === 'old' ? '' : '<ins class="ed-vh-ins">' + esc(o.s) + '</ins>';
    }).join('');
  }
  const blk = (b, inner, extra) => b.tag === 'hr' ? '<div class="ed-vh-b ed-vh-b--hr' + (extra || '') + '"><hr></div>'
    : '<div class="ed-vh-b ed-vh-b--' + esc(b.tag) + (b.tag === 'widget' ? ' ed-vh-b--w' : '') + (extra || '') + '">' + inner + '</div>';
  function renderRows(rows, mode, only) {
    const out = [];
    const keep = new Array(rows.length).fill(!only);
    if (only) rows.forEach((r, i) => { if (r.kind !== 'same') for (let k = Math.max(0, i - 1); k <= Math.min(rows.length - 1, i + 1); k++) keep[k] = true; });
    let skipped = 0;
    const flushSkip = () => { if (skipped) out.push('<div class="ed-vh-gap">' + esc(t('unchanged', '{n} unchanged blocks', { n: skipped })) + '</div>'); skipped = 0; };
    rows.forEach((r, i) => {
      if (!keep[i]) { skipped++; return; }
      flushSkip();
      const tagNote = r.kind === 'mod' && r.a.tag !== r.b.tag ? ' ed-vh-b--retag' : '';
      if (mode === 'side') {
        const left = r.a ? blk(r.a, r.kind === 'mod' ? opsHtml(r.ops, 'old') : r.kind === 'del' ? '<del class="ed-vh-del">' + esc(r.a.text) + '</del>' : esc(r.a.text), tagNote) : '';
        const right = r.b ? blk(r.b, r.kind === 'mod' ? opsHtml(r.ops, 'new') : r.kind === 'add' ? '<ins class="ed-vh-ins">' + esc(r.b.text) + '</ins>' : esc(r.b.text), tagNote) : '';
        out.push('<div class="ed-vh-row ed-vh-row--2 is-' + r.kind + (r.kind !== 'same' ? ' ed-vh-chg' : '') + '"><div class="ed-vh-cell">' + left + '</div><div class="ed-vh-cell">' + right + '</div></div>');
      } else {
        let inner, b = r.b || r.a;
        if (r.kind === 'mod') inner = opsHtml(r.ops, 'both');
        else if (r.kind === 'add') inner = '<ins class="ed-vh-ins">' + esc(b.text) + '</ins>';
        else if (r.kind === 'del') inner = '<del class="ed-vh-del">' + esc(b.text) + '</del>';
        else inner = esc(b.text);
        out.push('<div class="ed-vh-row is-' + r.kind + (r.kind !== 'same' ? ' ed-vh-chg' : '') + '">' + blk(b, inner, tagNote) + '</div>');
      }
    });
    flushSkip();
    return out.join('');
  }

  /* ====================== history panel ====================== */
  const P = { host: null, docId: null, sel: null, pick: null, list: [], seq: 0 };

  edx.panels.register({
    id: PANEL, side: 'right', titleKey: 'edx.versions.title', title: 'History', icon: 'clock', order: 40,
    render(host) {
      P.host = host;
      host.innerHTML = '<div class="ed-vh" role="region" aria-label="' + esc(t('panelLabel', 'Version history')) + '">' +
        '<div class="ed-vh-head"><button type="button" class="btn btn--sm btn--primary" data-vh="save">' + icon('plus') + esc(t('saveBtn', 'Save version…')) + '</button><span class="ed-vh-storage muted small" aria-live="polite"></span></div>' +
        '<div class="ed-vh-note small" hidden></div>' +
        '<div class="ed-vh-list" role="list"></div></div>';
      host.addEventListener('click', onPanelClick);
      refreshPanel();
    },
    onOpen() { refreshPanel(); },
    onDocChange(doc) { const id = doc ? doc.id : null; if (id !== P.docId) { P.docId = id; P.sel = null; P.pick = null; refreshPanel(); } },
  });

  const refreshPanelSoon = edx.util.debounce(() => refreshPanel(), 150);

  async function refreshPanel() {
    const host = P.host;
    if (!host || !host.isConnected) return;
    const cur = curDoc();
    const seq = ++P.seq;
    const listEl = host.querySelector('.ed-vh-list');
    if (!cur) { listEl.innerHTML = ''; return; }
    P.docId = cur.id;
    const [list, labels] = await Promise.all([V().list(cur.id), labelsOf(cur.id)]);
    if (seq !== P.seq || !host.isConnected) return;
    P.list = list;
    if (P.sel && !list.some((r) => r.id === P.sel)) P.sel = null;
    const ro = edx.editor.readonly();
    const note = host.querySelector('.ed-vh-note');
    if (P.pick) { note.hidden = false; note.innerHTML = esc(t('pickNote', 'Choose the second version to compare with.')) + ' <button type="button" class="btn btn--sm btn--ghost" data-vh="pick-cancel">' + esc(t('cancel', 'Cancel')) + '</button>'; }
    else note.hidden = true;
    host.querySelector('[data-vh="save"]').disabled = ro;
    if (!list.length) { listEl.innerHTML = '<p class="ed-vh-empty muted">' + esc(t('empty', 'No versions yet. Versions are saved automatically while you work, or save one yourself.')) + '</p>'; setStorage(host, list); return; }
    let html = '', day = '';
    list.forEach((r) => {
      const dk = dayKey(r.createdAt);
      if (dk !== day) { day = dk; html += '<h3 class="ed-vh-day">' + esc(dayLabel(r.createdAt)) + '</h3>'; }
      const manual = MANUAL(r, labels);
      const name = labels[r.id];
      const sel = P.sel === r.id;
      const size = sizeCache.has(r.id) ? fmtBytes(sizeCache.get(r.id)) : '…';
      html += '<div class="ed-vh-item' + (sel ? ' is-sel' : '') + (P.pick === r.id ? ' is-pick' : '') + '" role="listitem" data-id="' + esc(r.id) + '">' +
        '<button type="button" class="ed-vh-main" data-vh="select" data-id="' + esc(r.id) + '" aria-expanded="' + sel + '" title="' + esc(T4.util.fmtDateTime(r.createdAt)) + '">' +
          '<span class="ed-vh-time">' + esc(timeOf(r.createdAt)) + '</span>' +
          '<span class="ed-vh-lbl">' + esc(name || kindLabel(r)) + '</span>' +
          '<span class="ed-vh-badge ed-vh-badge--' + (manual ? 'manual' : 'auto') + '">' + esc(manual ? t('manual', 'Manual') : t('auto', 'Auto')) + '</span>' +
          '<span class="ed-vh-sub muted small">' + esc(t('words', '{n} words', { n: r.words })) + ' · <span class="ed-vh-size" data-size="' + esc(r.id) + '">' + esc(size) + '</span></span>' +
        '</button>' +
        (sel ? '<div class="ed-vh-actions" role="group" aria-label="' + esc(t('actions', 'Version actions')) + '">' +
          act('preview', 'search', t('preview', 'Preview'), r.id) + act('compare-cur', 'search', t('compareCurrentShort', 'Compare with current'), r.id) + act('compare-with', 'search', t('compareWith', 'Compare with…'), r.id) +
          (ro ? '' : act('restore', 'reset', t('restore', 'Restore'), r.id, true)) + act('copy', 'copy', t('restoreCopy', 'Restore as copy'), r.id) +
          act('rename', 'edit', t('rename', 'Rename'), r.id) + act('delete', 'trash', t('delete', 'Delete'), r.id) + '</div>' : '') +
      '</div>';
    });
    listEl.innerHTML = html;
    setStorage(host, list);
    fillSizes(host, list, seq);
  }
  const act = (a, ic, label, id, primary) => '<button type="button" class="btn btn--sm' + (primary ? ' btn--primary' : '') + '" data-vh="' + a + '" data-id="' + esc(id) + '">' + icon(ic) + '<span>' + esc(label) + '</span></button>';
  function setStorage(host, list) {
    const total = list.reduce((s, r) => s + (sizeCache.get(r.id) || 0), 0);
    const known = list.every((r) => sizeCache.has(r.id));
    host.querySelector('.ed-vh-storage').textContent = list.length ? t(list.length === 1 ? 'count1' : 'countN', list.length === 1 ? '1 version' : '{n} versions', { n: list.length }) + ' · ' + (known ? '' : '≥ ') + fmtBytes(total) : '';
  }
  /** Version sizes are measured in the background (html is not part of the list); cached because versions never change. */
  async function fillSizes(host, list, seq) {
    for (const r of list) {
      if (seq !== P.seq || !host.isConnected) return;
      if (sizeCache.has(r.id)) continue;
      const full = await V().get(r.id);
      if (!full) continue;
      sizeCache.set(r.id, full.html.length);
      const cell = host.querySelector('[data-size="' + r.id + '"]');
      if (cell) cell.textContent = fmtBytes(full.html.length);
      await new Promise((res) => setTimeout(res, 0));
    }
    if (seq === P.seq && host.isConnected) { setStorage(host, list); host.dataset.sizes = 'done'; }
  }
  api.refreshPanel = refreshPanel;

  function onPanelClick(e) {
    const b = e.target.closest('[data-vh]');
    if (!b) return;
    const a = b.dataset.vh, id = b.dataset.id;
    if (a === 'save') { saveManual(); return; }
    if (a === 'pick-cancel') { P.pick = null; refreshPanel(); return; }
    if (a === 'select') {
      if (P.pick && P.pick !== id) { const first = P.pick; P.pick = null; refreshPanel(); openCompare(first, id); return; }
      P.sel = P.sel === id ? null : id; refreshPanel(); return;
    }
    if (a === 'preview') openPreview(id);
    else if (a === 'compare-cur') openCompare(id, 'current');
    else if (a === 'compare-with') { P.pick = id; refreshPanel(); }
    else if (a === 'restore') restoreVersion(id);
    else if (a === 'copy') restoreAsCopy(id);
    else if (a === 'rename') renameVersion(id);
    else if (a === 'delete') deleteVersion(id);
  }

  /* ====================== commands, shortcuts, menus ====================== */
  const hasDoc = () => !!curDoc();
  edx.commands.register('versions.save', { labelKey: 'edx.versions.saveBtn', label: 'Save version…', icon: 'clock', group: 'Versions', order: 10, when: () => hasDoc() && !edx.editor.readonly(), run: () => { saveManual(); } });
  edx.commands.register('versions.history', { labelKey: 'edx.versions.panelLabel', label: 'Version history', icon: 'clock', group: 'Versions', order: 11, readonlyOk: true, when: hasDoc, run: () => { edx.panels.toggle(PANEL); } });
  edx.commands.register('versions.compare-last', { labelKey: 'edx.versions.compareLast', label: 'Compare with the last version', icon: 'search', group: 'Versions', order: 12, readonlyOk: true, when: hasDoc,
    async run() {
      const cur = curDoc();
      const list = await V().list(cur.id);
      if (!list.length) { edx.editor.toast(t('noVersions', 'There is no version to compare with yet.'), 'info'); return; }
      openCompare(list[0].id, 'current');
    } });
  edx.shortcuts.add('mod-shift-h', 'versions.history');
  edx.shortcuts.add('mod-alt-s', 'versions.save'); // refused by the registry (Ctrl+Alt+<letter> is AltGr on many layouts): then there is no shortcut, only menu / palette / button
  edx.menus.add('file', { labelKey: 'edx.versions.saveBtn', label: 'Save version…', icon: 'clock', order: 40, run: () => edx.commands.run('versions.save'), when: (c) => !!c.doc && !c.readonly });
  edx.menus.add('file', { labelKey: 'edx.versions.panelLabel', label: 'Version history', icon: 'clock', order: 41, run: () => edx.commands.run('versions.history'), when: (c) => !!c.doc });
  edx.toolbar.add({ id: 'versions.history', group: 'versions', icon: 'clock', labelKey: 'edx.versions.panelLabel', label: 'Version history', kbd: 'mod-shift-h', order: 1, readonlyOk: true,
    run: () => { edx.commands.run('versions.history'); }, isActive: () => edx.panels.active('right') === PANEL });

  /* ====================== crash recovery (emergency drafts) ====================== */
  // While the user types, an emergency draft of the unsaved editor state is written to the kv store at most every `draftMs`.
  // A successful save clears it. If the app dies before that, the next open of the document offers to recover it.
  const draftKey = (id) => 'versions.draft.' + id;
  const D = api.drafts = { timer: null, recovering: null };
  edx.events.on('content-change', () => {
    if (D.timer) return;
    const cur = curDoc();
    if (!cur || edx.editor.readonly()) return;
    D.timer = setTimeout(writeDraft, api.config.draftMs);
  });
  async function writeDraft() {
    D.timer = null;
    const cur = curDoc();
    if (!cur || edx.editor.readonly() || D.recovering === cur.id) return; // never overwrite a draft the user has not decided about
    try {
      const snap = edx.editor.snapshot();
      const s = api._states.get(cur.id);
      if (s && s.stored === snap.html) await K().remove(draftKey(cur.id));
      else await K().set(draftKey(cur.id), { html: snap.html, at: new Date().toISOString(), title: cur.meta.title || '' });
    } catch (e) { log(e); }
  }
  api.writeDraft = writeDraft;
  function draftSaved(id, html) {
    const s = api._states.get(id);
    if (s) s.stored = html;
    if (!D.timer && D.recovering !== id) K().remove(draftKey(id)).catch(log);
  }
  function draftClosed(id) {
    if (D.timer) { clearTimeout(D.timer); D.timer = null; }
    if (D.recovering === id) { D.recovering = null; return; } // keep it: the user has not decided
    K().remove(draftKey(id)).catch(log);
  }
  function hideBanner() { edx.editor.clearBanner('versions.draft'); }
  async function checkDraft(id) {
    hideBanner();
    const cur = curDoc();
    if (!cur || cur.id !== id || edx.editor.readonly()) return;
    const dr = await K().get(draftKey(id));
    if (!dr) { if (D.recovering === id) D.recovering = null; return; }
    const s = await stateOf(id);
    const newer = Date.parse(dr.at) > (Date.parse(s.storedAt) || 0);
    if (typeof dr.html !== 'string' || !newer || dr.html === s.stored) { await K().remove(draftKey(id)); if (D.recovering === id) D.recovering = null; return; }
    D.recovering = id;
    edx.editor.banner('versions.draft', t('draftFound', 'Unsaved changes from {when} were found after the app closed unexpectedly.', { when: T4.util.fmtDateTime(dr.at) }), {
      icon: 'alert', role: 'alert',
      actions: [
        { id: 'recover', label: t('recover', 'Recover'), primary: true, run: () => bannerAction('recover') },
        { id: 'compare', label: t('compare', 'Compare'), run: () => bannerAction('compare') },
        { id: 'discard', label: t('discard', 'Discard'), ghost: true, run: () => bannerAction('discard') },
      ] });
  }
  async function bannerAction(a) {
    const cur = curDoc();
    if (!cur) return;
    const dr = await K().get(draftKey(cur.id));
    if (!dr) { hideBanner(); return; }
    if (a === 'compare') {
      openCompare({ label: t('savedState', 'Saved document'), html: edx.editor.snapshot().html }, { label: t('draftState', 'Unsaved changes') + ' · ' + T4.util.fmtDateTime(dr.at), html: dr.html },
        { buttons: [{ label: t('recover', 'Recover'), primary: true, run: () => { edx.editor.closeModal(true); bannerAction('recover'); } }, { label: t('discard', 'Discard'), run: () => { edx.editor.closeModal(true); bannerAction('discard'); } }] });
      return;
    }
    D.recovering = null;
    if (a === 'recover') {
      await edx.editor.flush();
      await api.snapshot('recover');
      edx.editor.setHtml(dr.html);
      edx.editor.toast(t('recovered', 'Unsaved changes recovered.'), 'success', 8000, { label: t('undo', 'Undo'), fn: () => { try { T4.edcore.undo(); } catch (e) { log(e); } } });
    }
    await K().remove(draftKey(cur.id));
    hideBanner();
  }
  api.bannerAction = bannerAction;

  /* ====================== housekeeping ====================== */
  // Versions are deleted by the document store together with their document; the small kv entries (names, drafts) are cleaned here.
  edx.events.on('docs-changed', async (e) => {
    try {
      const alive = new Set((e.docs || []).map((d) => d.id));
      if (!alive.size && !(e.docs || []).length) { const all = await edx.docs.list(); all.forEach((d) => alive.add(d.id)); }
      for (const k of await K().keys('versions.')) {
        const m = /^versions\.(?:labels|draft)\.([\w-]+)$/.exec(k);
        if (m && !alive.has(m[1])) { await K().remove(k); labelCache.delete(m[1]); api._states.delete(m[1]); }
      }
    } catch (err) { log(err); }
  }, { debounce: 3000 });
  edx.events.on('shell-built', () => { P.host = null; });
})();
