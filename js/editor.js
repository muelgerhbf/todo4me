/* Todo4Me — Editor page: document management + word-processor UI.
 *
 * Route: #/editor (start page) and #/editor?doc=<id> (open document).
 * The editor's DOM is created once and re-attached whenever the app re-renders,
 * so typing, selection and undo history survive data changes elsewhere in the app.
 * Content editing lives in editor-core.js, widgets in editor-widgets.js,
 * storage in docstore.js. */
T4.editor = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, DS = T4.docstore, W = T4.edw, core = T4.edcore, SAN = T4.edSanitize;
  const { esc, icon } = U;
  // Editor texts use the English text as key part: E('Bold (Ctrl+B)') → dictionary key 'ed.Bold (Ctrl+B)'; falls back to the text itself.
  const E = (s, p) => {
    const k = 'ed.' + s;
    if (T4.i18n.has(k)) return T4.i18n.t(k, p);
    return p ? String(s).replace(/\{(\w+)\}/g, (m, n) => (p[n] != null ? p[n] : m)) : s;
  };
  const tt = (k, p) => T4.i18n.t(k, p);
  const desktop = window.todo4meDesktop && window.todo4meDesktop.isDesktop ? window.todo4meDesktop : null;

  const UI_KEY = 'todo4me.editor.ui';
  const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  const ZOOMS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
  const SW_MAX = 20; // shape outline / line width, as allowed by the drawing widget
  const STYLES = [['p', 'Normal text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['blockquote', 'Quote']];
  const TEXT_COLORS = ['#1f2330', '#4a4f5c', '#7a7f8c', '#b0b4bd', '#ffffff', '#c62828', '#e5603c', '#c98a12', '#2f9e55', '#0e7c86', '#2f6fed', '#4f46e5', '#8e4ec6', '#d6409f', '#795548'];
  const MARKERS = [['#fff176', 'Yellow'], ['#b9f6ca', 'Green'], ['#80deea', 'Cyan'], ['#ffcdd2', 'Pink'], ['#ffd8a8', 'Orange'], ['#e1bee7', 'Purple'], ['#e0e0e0', 'Gray']];
  const PAGE_SIZES = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210], Legal: [215.9, 355.6] };
  const MARGINS = { normal: [25.4, 25.4, 25.4, 25.4], narrow: [12.7, 12.7, 12.7, 12.7], moderate: [25.4, 19.05, 25.4, 19.05], wide: [25.4, 50.8, 25.4, 50.8] };

  /* ====================== State ====================== */
  const st = {
    ready: false,
    docs: [],
    q: '',
    view: 'all', // all | pinned | trash
    cur: null,   // { id, meta }
    dirty: false,
    readonly: false,
    prefs: loadPrefs(),
    usage: null,
  };
  function loadPrefs() {
    try { return Object.assign({ zoom: 100, side: true }, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { return { zoom: 100, side: true }; }
  }
  function savePrefs() { try { localStorage.setItem(UI_KEY, JSON.stringify(st.prefs)); } catch (e) { /* convenience only */ } }

  const docTitle = (m) => {
    if (!m) return '';
    if (m.title && m.title.trim()) return m.title.trim();
    const first = (m.text || '').split('\n').map((l) => l.trim()).find(Boolean);
    return first ? first.slice(0, 60) : E('Untitled document');
  };
  const fileName = (t) => (t || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'document';
  function relTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), diff = (Date.now() - d) / 1000;
    if (diff < 50) return E('just now');
    if (diff < 3600) return E('{n} min ago', { n: Math.round(diff / 60) });
    const day = U.toDateStr(d), t = U.today();
    const time = new Intl.DateTimeFormat(T4.i18n.locale(), { hour: 'numeric', minute: '2-digit' }).format(d);
    if (day === t) return E('Today {time}', { time });
    if (day === U.addDays(t, -1)) return E('Yesterday {time}', { time });
    return U.fmt(day, day.slice(0, 4) === t.slice(0, 4) ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ====================== Shell (created once) ====================== */
  let shell = null, el = {};
  const tb = (cmd, ic, label, extra) => '<button type="button" class="tb-btn" data-cmd="' + cmd + '" title="' + esc(label) + '" aria-label="' + esc(label.replace(/ \(.*\)$/, '')) + '"' + (extra || '') + '>' + icon(ic) + '</button>';
  const dd = (cmd, label, title, cls) => '<button type="button" class="tb-dd ' + (cls || '') + '" data-cmd="' + cmd + '" title="' + esc(title) + '" aria-haspopup="menu" aria-label="' + esc(title) + '"><span class="tb-dd__label">' + esc(label) + '</span>' + icon('chevron-down') + '</button>';

  function buildShell() {
    shell = document.createElement('div');
    shell.className = 'ed' + (st.prefs.side ? '' : ' side-hidden');
    shell.id = 'ed';
    shell.innerHTML =
      '<aside class="ed-side" id="ed-side" aria-label="' + esc(E('Documents')) + '">' +
        '<div class="ed-side__head"><h2 class="ed-side__title">' + esc(E('Documents')) + '</h2>' +
          '<button type="button" class="btn btn--primary btn--sm" data-cmd="new-doc" title="' + esc(E('New document (Ctrl+Alt+N)')) + '">' + icon('plus') + esc(E('New')) + '</button></div>' +
        '<label class="search ed-side__search">' + icon('search') + '<span class="sr-only">' + esc(E('Search documents')) + '</span><input type="search" id="ed-search" placeholder="' + esc(E('Search documents…')) + '" autocomplete="off"></label>' +
        '<div class="seg seg--sm ed-side__views" role="radiogroup" aria-label="' + esc(E('Show')) + '">' +
          '<button type="button" class="seg__btn" role="radio" data-view="all">' + esc(E('All')) + '</button><button type="button" class="seg__btn" role="radio" data-view="pinned">' + icon('pin') + esc(E('Pinned')) + '</button><button type="button" class="seg__btn" role="radio" data-view="trash">' + icon('trash') + esc(E('Trash')) + '</button></div>' +
        '<div class="ed-list" id="ed-list" role="list"></div>' +
        '<p class="ed-side__note muted small" id="ed-side-note"></p>' +
      '</aside>' +
      '<div class="ed-scrim" data-cmd="toggle-side" aria-hidden="true"></div>' +
      '<section class="ed-main">' +
        '<div class="ed-home" id="ed-home"></div>' +
        '<div class="ed-work" id="ed-work" hidden>' +
          '<header class="ed-bar">' +
            '<button type="button" class="icon-btn" data-cmd="toggle-side" title="' + esc(E('Show/hide document list')) + '" aria-label="' + esc(E('Show or hide document list')) + '">' + icon('panel') + '</button>' +
            '<input type="text" class="ed-title" id="ed-title" maxlength="200" placeholder="' + esc(E('Untitled document')) + '" aria-label="' + esc(E('Document title')) + '" autocomplete="off" spellcheck="false">' +
            '<span class="ed-status" id="ed-status" aria-live="polite"></span>' +
            '<div class="ed-bar__menus">' +
              '<button type="button" class="btn btn--ghost btn--sm" data-cmd="menu-file" aria-haspopup="menu">' + esc(E('File')) + '</button>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-cmd="menu-insert" aria-haspopup="menu">' + esc(E('Insert')) + '</button>' +
            '</div>' +
            '<button type="button" class="btn btn--primary btn--sm ed-bar__pdf" data-cmd="export-pdf" title="' + esc(E('Export as PDF (Ctrl+P)')) + '">' + icon('pdf') + '<span>' + esc(E('Export PDF')) + '</span></button>' +
          '</header>' +
          '<div class="ed-banner" id="ed-banner" hidden></div>' +
          '<div class="ed-toolbar" id="ed-toolbar" role="toolbar" aria-label="' + esc(E('Formatting')) + '">' +
            '<div class="tb-group">' + tb('undo', 'undo', E('Undo (Ctrl+Z)')) + tb('redo', 'redo', E('Redo (Ctrl+Y)')) + '</div>' +
            '<div class="tb-group">' + dd('style', E('Normal text'), E('Paragraph style'), 'tb-dd--style') + dd('font', 'Calibri', E('Font'), 'tb-dd--font') + dd('size', '11', E('Font size'), 'tb-dd--size') + '</div>' +
            '<div class="tb-group">' + tb('bold', 'bold', E('Bold (Ctrl+B)')) + tb('italic', 'italic', E('Italic (Ctrl+I)')) + tb('underline', 'underline', E('Underline (Ctrl+U)')) + tb('strike', 'strike', E('Strikethrough (Ctrl+Shift+X)')) + '</div>' +
            '<div class="tb-group">' +
              '<button type="button" class="tb-btn tb-color" data-cmd="color" title="' + esc(E('Text color')) + '" aria-label="' + esc(E('Text color')) + '" aria-haspopup="menu">' + icon('color') + '<span class="tb-color__bar" id="ed-color-bar"></span></button>' +
              '<button type="button" class="tb-btn tb-color" data-cmd="highlight" title="' + esc(E('Highlight / background color')) + '" aria-label="' + esc(E('Highlight and background color')) + '" aria-haspopup="menu">' + icon('highlight') + '<span class="tb-color__bar" id="ed-mark-bar" style="background:#fff176"></span></button>' +
            '</div>' +
            '<div class="tb-group">' + tb('align-left', 'align-left', E('Align left (Ctrl+Shift+L)')) + tb('align-center', 'align-center', E('Center (Ctrl+Shift+E)')) + tb('align-right', 'align-right', E('Align right (Ctrl+Shift+R)')) + tb('align-justify', 'align-justify', E('Justify (Ctrl+Shift+J)')) + '</div>' +
            '<div class="tb-group">' + tb('ul', 'list-ul', E('Bulleted list (Ctrl+Shift+8)')) + tb('ol', 'list-ol', E('Numbered list (Ctrl+Shift+7)')) + tb('outdent', 'outdent', E('Decrease indent (Shift+Tab)')) + tb('indent', 'indent', E('Increase indent (Tab)')) +
              '<button type="button" class="tb-btn" data-cmd="spacing" title="' + esc(E('Line & paragraph spacing')) + '" aria-label="' + esc(E('Line and paragraph spacing')) + '" aria-haspopup="menu">' + icon('spacing') + '</button></div>' +
            '<div class="tb-group">' + tb('link', 'link', E('Link (Ctrl+K)')) +
              '<button type="button" class="tb-btn" data-cmd="table" title="' + esc(E('Insert table')) + '" aria-label="' + esc(E('Insert table')) + '" aria-haspopup="menu">' + icon('table') + '</button>' +
              tb('image', 'image', E('Insert image')) +
              '<button type="button" class="tb-btn" data-cmd="shapes" title="' + esc(E('Insert shape')) + '" aria-label="' + esc(E('Insert shape')) + '" aria-haspopup="menu">' + icon('shapes') + '</button>' +
              '<button type="button" class="tb-btn" data-cmd="charts" title="' + esc(E('Insert chart')) + '" aria-label="' + esc(E('Insert chart')) + '" aria-haspopup="menu">' + icon('chart') + '</button>' +
              tb('formula', 'sigma', E('Formula (Ctrl+M)')) + tb('code', 'code', E('Code block')) + '</div>' +
            '<div class="tb-group">' + '<button type="button" class="tb-btn" data-cmd="more" title="' + esc(E('More formatting')) + '" aria-label="' + esc(E('More formatting')) + '" aria-haspopup="menu">' + icon('more') + '</button>' + '</div>' +
          '</div>' +
          '<div class="ed-scroll" id="ed-scroll">' +
            '<div class="ed-ctx" id="ed-ctx" role="toolbar" aria-label="' + esc(E('Element options')) + '" hidden></div>' +
            '<div class="ed-page" id="ed-page">' +
              '<div class="ed-hf ed-hf--head" id="ed-hf-head" aria-hidden="true"></div>' +
              '<div class="ed-doc t4-doc" id="ed-doc" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="' + esc(E('Document text')) + '" data-placeholder="' + esc(E('Start writing… Type / for elements, # for headings, - for lists.')) + '"></div>' +
              '<div class="ed-hf ed-hf--foot" id="ed-hf-foot" aria-hidden="true"></div>' +
            '</div>' +
          '</div>' +
          '<footer class="ed-statusbar"><span id="ed-count"></span><span id="ed-pagesinfo" class="muted"></span><span class="ed-statusbar__sp"></span>' +
            '<span class="ed-zoom"><button type="button" class="icon-btn icon-btn--sm" data-cmd="zoom-out" aria-label="' + esc(E('Zoom out')) + '">' + icon('minus') + '</button>' +
            '<button type="button" class="ed-zoom__val" data-cmd="zoom-reset" id="ed-zoom" title="' + esc(E('Reset zoom')) + '">100%</button>' +
            '<button type="button" class="icon-btn icon-btn--sm" data-cmd="zoom-in" aria-label="' + esc(E('Zoom in')) + '">' + icon('plus') + '</button></span></footer>' +
        '</div>' +
      '</section>' +
      '<input type="file" id="ed-file-image" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" multiple hidden>' +
      '<input type="file" id="ed-file-import" accept=".md,.markdown,.txt,.html,.htm,.json,text/markdown,text/plain,text/html,application/json" multiple hidden>';

    ['side', 'list', 'home', 'work', 'title', 'status', 'banner', 'toolbar', 'scroll', 'ctx', 'page', 'doc', 'count', 'pagesinfo', 'zoom', 'search', 'side-note', 'hf-head', 'hf-foot', 'color-bar', 'mark-bar', 'file-image', 'file-import']
      .forEach((k) => { el[k.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = shell.querySelector('#ed-' + k); });

    core.init(el.doc, {
      change: onDocChange,
      selection: onSelection,
      input: onDocInput,
      keydown: onDocKeyDown,
      toast: (m, t) => ui.toast(m, t || 'info'),
      shortcut: onShortcut,
    });

    // Keep the editor selection when clicking toolbar/menu buttons.
    shell.addEventListener('mousedown', (e) => {
      const b = e.target.closest('.ed-toolbar button, .ed-ctx button, .ed-bar__menus button, .ed-bar__pdf');
      if (b) e.preventDefault();
    });
    shell.addEventListener('click', onShellClick);
    el.search.addEventListener('input', U.debounce(() => { st.q = el.search.value; renderList(); }, 120));
    el.title.addEventListener('input', () => { if (st.cur && !st.readonly) { markDirty(); document.title = docTitle({ title: el.title.value, text: st.cur.meta.text }) + ' · Todo4Me'; } });
    el.title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); core.restore(); } });
    el.fileImage.addEventListener('change', () => {
      const files = Array.from(el.fileImage.files || []);
      el.fileImage.value = '';
      if (files.length) core.insertImages(files);
    });
    el.fileImport.addEventListener('change', () => {
      const files = Array.from(el.fileImport.files || []);
      el.fileImport.value = '';
      importFiles(files);
    });
    el.scroll.addEventListener('scroll', () => { positionCtx(); st.scrollTop = el.scroll.scrollTop; }, { passive: true });
    el.scroll.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', U.debounce(positionCtx, 100));
    // Remember whether the editor had focus when the app re-renders (detaches the shell).
    shell.addEventListener('focusin', () => { shell._hadFocus = true; });
    shell.addEventListener('focusout', (e) => { if (shell.isConnected && !(e.relatedTarget && shell.contains(e.relatedTarget))) shell._hadFocus = false; });
    applyZoom();
  }

  // The editor's DOM is built once with the texts of the language at that time: after a language change
  // save, throw it away and let the next render rebuild it (the open document is opened again).
  T4.i18n.onChange(() => {
    if (!shell) return;
    if (st.cur && st.dirty && !st.readonly) doSave();
    closeMenu(); closeSlash(); hideCtx();
    shell.remove();
    shell = null; el = {}; st.cur = null; st.dirty = false;
  });

  /* ====================== View integration ====================== */
  T4.views.editor = {
    get title() { return tt('nav.editor'); },
    bodyClass: 'is-editor',
    render() { return '<div class="ed-host" id="ed-host"></div>'; },
    mount(main) {
      if (!shell) buildShell();
      const host = main.querySelector('#ed-host');
      const refocus = shell._hadFocus && !shell.isConnected;
      host.appendChild(shell);
      if (st.scrollTop) el.scroll.scrollTop = st.scrollTop;
      const params = T4.app.route.params;
      boot().then(() => {
        if (params.doc) {
          if (!st.cur || st.cur.id !== params.doc) openDoc(params.doc);
          else if (refocus) core.restore();
        } else if (st.cur) closeDoc();
        else showHome();
        if (st.cur && params.doc === st.cur.id) document.title = docTitle(st.cur.meta) + ' · Todo4Me';
      });
      renderSideViews();
    },
    leave() {
      closeMenu();
      hideCtx();
      flush();
    },
  };

  let booting = null;
  function boot() {
    if (!booting) {
      booting = DS.open().then(async (res) => {
        st.ready = true;
        if (!res.ok) el.sideNote.textContent = E('Documents cannot be stored in this browser mode — export them to keep them.');
        DS.subscribe(U.debounce(refreshDocs, 60));
        await refreshDocs();
        DS.purgeTrash().catch(() => {});
        setTimeout(() => DS.collectGarbage().catch(() => {}), 15000);
      });
    }
    return booting;
  }
  async function refreshDocs() {
    st.docs = await DS.list();
    renderList();
    if (!st.cur && el.home && !el.home.hidden) renderHome();
  }

  /* ====================== Document list ====================== */
  function filteredDocs() {
    const q = st.q.trim().toLowerCase();
    let list = st.docs.filter((d) => (st.view === 'trash' ? d.deletedAt : !d.deletedAt));
    if (st.view === 'pinned') list = list.filter((d) => d.pinned);
    if (q) list = list.filter((d) => docTitle(d).toLowerCase().includes(q) || d.text.toLowerCase().includes(q));
    return list.sort((a, b) => (st.view === 'trash' ? (b.deletedAt || '').localeCompare(a.deletedAt || '') : (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
  }
  function snippet(d) {
    const q = st.q.trim().toLowerCase();
    const text = d.text.replace(/\s+/g, ' ');
    if (q) {
      const i = text.toLowerCase().indexOf(q);
      if (i >= 0) {
        const from = Math.max(0, i - 30);
        return (from ? '…' : '') + esc(text.slice(from, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, i + q.length + 60));
      }
    }
    const t = docTitle(d);
    return esc(text.startsWith(t) ? text.slice(t.length).trim().slice(0, 90) : text.slice(0, 90));
  }
  function renderList() {
    if (!shell) return;
    const list = filteredDocs();
    const active = st.cur && st.cur.id;
    if (!list.length) {
      el.list.innerHTML = '<p class="ed-list__empty muted small">' + esc(st.q ? E('No documents match “{q}”.', { q: st.q }) : st.view === 'trash' ? E('Trash is empty. Deleted documents stay here for {n} days.', { n: DS.TRASH_DAYS }) : st.view === 'pinned' ? E('No pinned documents.') : E('No documents yet.')) + '</p>' +
        (st.view === 'trash' || st.q ? '' : '<button type="button" class="btn btn--sm" data-cmd="new-doc">' + icon('plus') + esc(E('New document')) + '</button>');
    } else {
      el.list.innerHTML = list.map((d) =>
        '<div class="ed-item' + (d.id === active ? ' is-active' : '') + '" role="listitem">' +
          '<button type="button" class="ed-item__open" data-open="' + d.id + '"' + (d.id === active ? ' aria-current="true"' : '') + '>' +
            '<span class="ed-item__title">' + (d.pinned ? icon('pin', 'ed-item__pin') : '') + esc(docTitle(d)) + '</span>' +
            '<span class="ed-item__meta">' + esc(st.view === 'trash' ? E('Deleted {time}', { time: relTime(d.deletedAt) }) : relTime(d.updatedAt)) + (d.words ? ' · ' + esc(tt('ed.words', { count: d.words })) : '') + '</span>' +
            (snippet(d) ? '<span class="ed-item__snip">' + snippet(d) + '</span>' : '') +
          '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm ed-item__more" data-more="' + d.id + '" aria-label="' + esc(E('Actions for {title}', { title: docTitle(d) })) + '" aria-haspopup="menu">' + icon('more') + '</button>' +
        '</div>').join('');
    }
    renderSideViews();
  }
  function renderSideViews() {
    if (!shell) return;
    shell.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === st.view)));
  }

  /* ====================== Start page ====================== */
  const TEMPLATES = [
    { id: 'blank', title: 'Blank document', desc: 'Start from an empty page', icon: 'doc' },
    { id: 'meeting', title: 'Meeting notes', desc: 'Agenda, notes, decisions and action items', icon: 'list' },
    { id: 'report', title: 'Report', desc: 'Title, summary, sections, table and chart', icon: 'chart' },
    { id: 'tour', title: 'Feature tour', desc: 'See everything the editor can do', icon: 'sparkle' },
  ];
  function showHome() {
    el.work.hidden = true;
    el.home.hidden = false;
    renderHome();
    document.title = tt('nav.editor') + ' · Todo4Me';
  }
  function renderHome() {
    const recent = st.docs.filter((d) => !d.deletedAt).sort((a, b) => (b.openedAt || b.updatedAt).localeCompare(a.openedAt || a.updatedAt)).slice(0, 8);
    el.home.innerHTML =
      '<header class="page-head"><div><h1 class="page-title">' + esc(tt('nav.editor')) + '</h1><p class="page-sub">' + esc(E('Write documents with formatting, tables, images, shapes, charts, formulas and code — and export them as PDF.')) + '</p></div>' +
        '<div class="page-actions"><button type="button" class="btn" data-cmd="import">' + icon('upload') + esc(E('Import…')) + '</button>' +
        '<button type="button" class="btn btn--primary" data-cmd="new-doc">' + icon('plus') + esc(E('New document')) + '</button></div></header>' +
      '<section class="section"><div class="section__head"><h2 class="section__title">' + esc(E('Start with')) + '</h2></div><div class="ed-templates">' +
        TEMPLATES.map((t) => '<button type="button" class="ed-tpl" data-template="' + t.id + '"><span class="ed-tpl__icon">' + icon(t.icon) + '</span><span class="ed-tpl__title">' + esc(E(t.title)) + '</span><span class="ed-tpl__desc">' + esc(E(t.desc)) + '</span></button>').join('') +
      '</div></section>' +
      '<section class="section"><div class="section__head"><h2 class="section__title">' + esc(E('Recent documents')) + ' <span class="count">' + recent.length + '</span></h2></div>' +
        (recent.length ? '<div class="ed-recent">' + recent.map((d) =>
          '<button type="button" class="ed-card" data-open="' + d.id + '"><span class="ed-card__sheet"><span class="ed-card__title">' + esc(docTitle(d)) + '</span><span class="ed-card__text">' + esc(d.text.slice(0, 220)) + '</span></span>' +
          '<span class="ed-card__meta">' + (d.pinned ? icon('pin') : '') + esc(relTime(d.openedAt || d.updatedAt)) + '</span></button>').join('') + '</div>'
          : ui.emptyState('doc', E('No documents yet'), E('Create your first document or import a Markdown, HTML or Todo4Me file.'))) +
      '</section>';
  }

  /* ====================== Open / close / save ====================== */
  let openSeq = 0;
  async function openDoc(id) {
    const seq = ++openSeq;
    await flush();
    await W.ensureLibs();
    const d = await DS.get(id);
    if (seq !== openSeq) return;
    if (!d) { ui.toast(E('This document does not exist anymore.'), 'error'); location.hash = '#/editor'; return; }
    st.cur = { id, meta: d.meta };
    st.dirty = false;
    el.home.hidden = true;
    el.work.hidden = false;
    el.title.value = d.meta.title;
    core.load(d.html);
    core.histReset();
    setReadonly(!!d.meta.deletedAt);
    applyPage();
    setStatus('saved');
    const s0 = core.snapshot();
    updateCounts(s0.words, s0.chars);
    el.scroll.scrollTop = 0;
    st.scrollTop = 0;
    hideCtx();
    renderList();
    updateToolbar();
    document.title = docTitle(d.meta) + ' · Todo4Me';
    if (!st.readonly) {
      DS.touch(id, { openedAt: new Date().toISOString() }).catch(() => {});
      if (!d.meta.title && !d.meta.text) el.title.focus();
      else { el.doc.focus({ preventScroll: true }); const s = window.getSelection(); const r = document.createRange(); r.selectNodeContents(el.doc.firstElementChild || el.doc); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
    }
    if (window.matchMedia('(max-width: 900px)').matches) setSide(false);
  }
  async function closeDoc() {
    await flush();
    st.cur = null;
    core.clearWidget();
    hideCtx();
    showHome();
    renderList();
  }
  function setReadonly(on) {
    st.readonly = on;
    el.doc.setAttribute('contenteditable', on ? 'false' : 'true');
    el.title.readOnly = on;
    el.toolbar.classList.toggle('is-disabled', on);
    el.banner.hidden = !on;
    el.banner.innerHTML = on ? icon('trash') + '<span>' + esc(E('This document is in the trash. Restore it to edit.')) + '</span><button type="button" class="btn btn--sm" data-cmd="restore-current">' + icon('reset') + esc(E('Restore')) + '</button>' : '';
  }

  const saver = { timer: null, running: null, again: false, fails: 0 };
  function markDirty() {
    if (!st.cur || st.readonly) return;
    st.dirty = true;
    setStatus('dirty');
    clearTimeout(saver.timer);
    saver.timer = setTimeout(doSave, 700);
  }
  function doSave() {
    clearTimeout(saver.timer);
    saver.timer = null;
    if (!st.cur || !st.dirty || st.readonly) return Promise.resolve();
    if (saver.running) { saver.again = true; return saver.running; }
    const id = st.cur.id;
    st.dirty = false;
    setStatus('saving');
    const snap = core.snapshot();
    saver.running = DS.save(id, snap, { title: el.title.value.trim(), page: st.cur.meta.page })
      .then((meta) => {
        saver.fails = 0;
        if (st.cur && st.cur.id === id) st.cur.meta = meta;
        upsertDoc(meta);
        setStatus(st.dirty ? 'dirty' : 'saved');
        updateCounts(snap.words, snap.chars);
      })
      .catch((err) => {
        console.error('[Todo4Me] document save failed', err);
        st.dirty = true;
        saver.fails++;
        setStatus('error');
        if (saver.fails === 1) ui.toast(E(err && err.name === 'QuotaExceededError' ? 'The document could not be saved (storage is full). Retrying… Export it if this persists.' : 'The document could not be saved (storage error). Retrying… Export it if this persists.'), 'error', 8000);
        saver.timer = setTimeout(doSave, 4000);
      })
      .finally(() => {
        saver.running = null;
        if (saver.again) { saver.again = false; if (st.dirty) doSave(); }
      });
    return saver.running;
  }
  /** Save everything now (used before switching documents, leaving, closing the app, exporting). */
  async function flush() {
    clearTimeout(saver.timer);
    for (let i = 0; i < 6 && st.cur && (st.dirty || saver.running); i++) {
      if (saver.running) await saver.running.catch(() => {});
      else await doSave();
    }
  }
  function upsertDoc(meta) {
    const i = st.docs.findIndex((d) => d.id === meta.id);
    if (i >= 0) st.docs[i] = meta; else st.docs.push(meta);
    renderListSoon();
  }
  const renderListSoon = U.debounce(renderList, 300);

  function setStatus(s) {
    if (!el.status) return;
    el.status.className = 'ed-status ed-status--' + s;
    el.status.innerHTML = s === 'saved' ? icon('check') + E('Saved') : s === 'saving' ? E('Saving…') : s === 'dirty' ? E('Editing…') : icon('alert') + E('Not saved — retrying');
    el.status.title = s === 'saved' && st.cur ? E('Saved {when} on this computer', { when: U.fmtDateTime(st.cur.meta.updatedAt) }) : '';
  }
  function updateCounts(words, chars) {
    el.count.textContent = tt('ed.words', { count: words || 0 }) + (chars != null ? ' · ' + tt('ed.chars', { count: chars }) : '');
    const page = el.page;
    requestAnimationFrame(() => {
      if (!st.cur) return;
      const [, ph] = pageDims(st.cur.meta.page);
      const m = pageMargins(st.cur.meta.page);
      const contentH = (ph - m[0] - m[2]) * 3.7795;
      const pages = Math.max(1, Math.ceil(el.doc.scrollHeight / contentH));
      el.pagesinfo.textContent = tt('ed.pages', { count: pages }) + ' · ' + st.cur.meta.page.size;
      page.style.setProperty('--pages', pages);
    });
  }

  /* ====================== Editor callbacks ====================== */
  function onDocChange(info) {
    markDirty();
    if (info && info.history) updateCountsSoon();
    updateUndo();
  }
  const updateCountsSoon = U.debounce(() => { if (st.cur) { const s = core.snapshot(); updateCounts(s.words, s.chars); } }, 400);
  let selRaf = 0;
  function onSelection() {
    if (selRaf) return;
    selRaf = requestAnimationFrame(() => { selRaf = 0; updateToolbar(); updateCtx(); });
  }
  function updateUndo() {
    if (!shell) return;
    const u = shell.querySelector('[data-cmd="undo"]'), r = shell.querySelector('[data-cmd="redo"]');
    if (u) u.disabled = !core.canUndo();
    if (r) r.disabled = !core.canRedo();
  }
  function updateToolbar() {
    if (!shell || !st.cur) return;
    // With an element (image, chart, …) selected, text formatting states don't apply.
    const s = core.selectedWidget ? { inDoc: false } : core.state();
    const on = (cmd, v) => { const b = el.toolbar.querySelector('[data-cmd="' + cmd + '"]'); if (b) { b.classList.toggle('is-on', !!v); b.setAttribute('aria-pressed', String(!!v)); } };
    on('bold', s.bold); on('italic', s.italic); on('underline', s.underline); on('strike', s.strike);
    on('ul', s.ul); on('ol', s.ol);
    ['left', 'center', 'right', 'justify'].forEach((a) => on('align-' + a, s.inDoc && s.align === a));
    if (s.inDoc) {
      el.toolbar.querySelector('[data-cmd="style"] .tb-dd__label').textContent = E((STYLES.find((x) => x[0] === s.block) || STYLES[0])[1]);
      el.toolbar.querySelector('[data-cmd="font"] .tb-dd__label').textContent = s.font;
      el.toolbar.querySelector('[data-cmd="size"] .tb-dd__label').textContent = String(s.size);
    }
    updateUndo();
  }

  /* ====================== Commands ====================== */
  function cmd(name, btn) {
    if (st.readonly && !/^(toggle-side|new-doc|import|zoom|menu-file|export-pdf|restore-current)/.test(name)) return;
    switch (name) {
      case 'undo': core.undo(); break;
      case 'redo': core.redo(); break;
      case 'bold': core.exec('bold'); break;
      case 'italic': core.exec('italic'); break;
      case 'underline': core.exec('underline'); break;
      case 'strike': core.exec('strikeThrough'); break;
      case 'align-left': core.exec('justifyLeft'); break;
      case 'align-center': core.exec('justifyCenter'); break;
      case 'align-right': core.exec('justifyRight'); break;
      case 'align-justify': core.exec('justifyFull'); break;
      case 'ul': core.exec('insertUnorderedList'); break;
      case 'ol': core.exec('insertOrderedList'); break;
      case 'indent': core.indent(1); break;
      case 'outdent': core.indent(-1); break;
      case 'link': linkDialog(); break;
      case 'image': el.fileImage.click(); break;
      case 'formula': formulaDialog(); break;
      case 'code': insertCode(); break;
      case 'style': styleMenu(btn); break;
      case 'font': fontMenu(btn); break;
      case 'size': sizeMenu(btn); break;
      case 'color': colorMenu(btn); break;
      case 'highlight': highlightMenu(btn); break;
      case 'spacing': spacingMenu(btn); break;
      case 'table': tableMenu(btn); break;
      case 'shapes': shapesMenu(btn); break;
      case 'charts': chartsMenu(btn); break;
      case 'more': moreMenu(btn); break;
      case 'menu-file': fileMenu(btn); break;
      case 'menu-insert': insertMenu(btn); break;
      case 'export-pdf': exportPDF(); break;
      case 'new-doc': newDocument(); break;
      case 'import': el.fileImport.click(); break;
      case 'toggle-side': setSide(!shell.classList.contains('side-open') && (shell.classList.contains('side-hidden') || window.matchMedia('(max-width: 900px)').matches)); break;
      case 'zoom-in': setZoom(1); break;
      case 'zoom-out': setZoom(-1); break;
      case 'zoom-reset': st.prefs.zoom = 100; applyZoom(); break;
      case 'restore-current': if (st.cur) DS.restore(st.cur.id).then(() => openDoc(st.cur.id)); break;
    }
  }
  function onShellClick(e) {
    const view = e.target.closest('[data-view]');
    if (view) { st.view = view.dataset.view; renderList(); return; }
    const open = e.target.closest('[data-open]');
    if (open) { location.hash = '#/editor?doc=' + encodeURIComponent(open.dataset.open); return; }
    const more = e.target.closest('[data-more]');
    if (more) { docMenu(more, more.dataset.more); return; }
    const tpl = e.target.closest('[data-template]');
    if (tpl) { newDocument(tpl.dataset.template); return; }
    const b = e.target.closest('[data-cmd]');
    if (b && !b.disabled && shell.contains(b) && !b.closest('.ed-ctx')) cmd(b.dataset.cmd, b);
  }
  function setSide(show) {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile) { shell.classList.toggle('side-open', show); return; }
    shell.classList.remove('side-open');
    shell.classList.toggle('side-hidden', !show);
    st.prefs.side = show;
    savePrefs();
    positionCtx();
  }
  /** One zoom step in or out. The point at (x, y) — the mouse, or the middle of the view — stays where it is. */
  function setZoom(dir, x, y) {
    let i = ZOOMS.indexOf(st.prefs.zoom);
    if (i < 0) i = ZOOMS.indexOf(100);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
    if (next === st.prefs.zoom) return;
    const sc = el.scroll, sr = sc.getBoundingClientRect();
    if (x == null) { x = sr.left + sc.clientWidth / 2; y = sr.top + sc.clientHeight / 2; }
    const a = el.page.getBoundingClientRect();
    const fx = a.width ? (x - a.left) / a.width : 0.5, fy = a.height ? (y - a.top) / a.height : 0;
    st.prefs.zoom = next;
    applyZoom();
    const b = el.page.getBoundingClientRect();
    sc.scrollLeft += b.left + fx * b.width - x;
    sc.scrollTop += b.top + fy * b.height - y;
  }
  // Ctrl + mouse wheel (and touchpad pinch, which arrives as Ctrl + wheel) zooms the page.
  let wheelAcc = 0, wheelAt = 0;
  function onWheel(e) {
    if (!e.ctrlKey || !st.cur || el.page.hidden) return;
    e.preventDefault();
    if (e.timeStamp - wheelAt > 300) wheelAcc = 0;
    wheelAt = e.timeStamp;
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    setZoom(dir, e.clientX, e.clientY);
  }
  function applyZoom() {
    if (!el.page) return;
    el.page.style.zoom = st.prefs.zoom / 100;
    el.zoom.textContent = st.prefs.zoom + '%';
    savePrefs();
    positionCtx();
  }

  async function newDocument(template) {
    await boot();
    const t = template && template !== 'blank' ? templateContent(template) : { title: '', html: '<p><br></p>' };
    try {
      const meta = await DS.create(Object.assign({ title: t.title, html: t.html }, core.statsOf(t.html)));
      st.docs.push(meta);
      st.view = 'all';
      st.q = '';
      if (el.search) el.search.value = '';
      location.hash = '#/editor?doc=' + meta.id;
    } catch (e) {
      ui.toast(E('Could not create the document: {msg}', { msg: e.message }), 'error');
    }
  }

  /* ====================== Menus ====================== */
  let menu = null;
  function closeMenu() {
    if (!menu) return;
    menu.el.remove();
    if (menu.anchor) menu.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', menu.outside, true);
    window.removeEventListener('blur', closeMenu);
    menu = null;
  }
  /** items: [{ label, icon, kbd, run, checked, disabled, danger, style } | { sep: true } | { heading } | { html, mount(menuEl) }] */
  function openMenu(anchor, items, opts) {
    const same = menu && menu.anchor === anchor;
    closeMenu();
    if (same) return null;
    opts = opts || {};
    const m = document.createElement('div');
    m.className = 'ed-menu' + (opts.cls ? ' ' + opts.cls : '');
    m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it, i) => {
      if (it.sep) return '<div class="ed-menu__sep" role="separator"></div>';
      if (it.heading) return '<div class="ed-menu__heading">' + esc(it.heading) + '</div>';
      if (it.html != null) return '<div class="ed-menu__custom">' + it.html + '</div>';
      return '<button type="button" class="ed-menu__item' + (it.danger ? ' is-danger' : '') + (it.checked ? ' is-checked' : '') + '" role="menuitem" data-mi="' + i + '"' + (it.disabled ? ' disabled' : '') + (it.style ? ' style="' + esc(it.style) + '"' : '') + '>' +
        '<span class="ed-menu__icon">' + (it.checked ? icon('check') : it.icon ? icon(it.icon) : '') + '</span><span class="ed-menu__label">' + esc(it.label) + '</span>' + (it.kbd ? '<kbd>' + esc(it.kbd) + '</kbd>' : '') + '</button>';
    }).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - mw - 8);
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8 && r.top - mh - 4 > 8) top = r.top - mh - 4;
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = Math.max(8, Math.min(top, window.innerHeight - mh - 8)) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    m.addEventListener('mousedown', (e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault(); });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mi]');
      if (!b || b.disabled) return;
      const it = items[+b.dataset.mi];
      closeMenu();
      it.run();
    });
    m.addEventListener('keydown', (e) => {
      const btns = Array.from(m.querySelectorAll('[data-mi]:not([disabled]), .ed-menu__custom button'));
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (btns[i + 1] || btns[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (btns[i - 1] || btns[btns.length - 1]).focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus ? core.restore() : null; }
      else if (e.key === 'Tab') closeMenu();
    });
    const outside = (e) => { if (!m.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenu(); };
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('blur', closeMenu);
    menu = { el: m, anchor, outside };
    items.forEach((it) => { if (it.mount) it.mount(m); });
    if (opts.focusFirst) { const f = m.querySelector('[data-mi]'); if (f) f.focus(); }
    return m;
  }

  function styleMenu(btn) {
    const cur = core.state().block;
    openMenu(btn, STYLES.map(([tag, label]) => ({ label: E(label), checked: cur === tag, style: 'font-size:' + ({ h1: 20, h2: 17, h3: 15, h4: 14, h5: 13, h6: 13 }[tag] || 14) + 'px;' + (tag[0] === 'h' ? 'font-weight:700;' : '') + (tag === 'blockquote' ? 'font-style:italic;' : ''), run: () => core.setBlockType(tag) })), { cls: 'ed-menu--styles' });
  }
  function fontMenu(btn) {
    const cur = core.state().font;
    openMenu(btn, SAN.FONTS.map((f) => ({ label: f, checked: cur === f, style: 'font-family:' + SAN.FONT_STACK[f], run: () => core.setFont(f) })));
  }
  function sizeMenu(btn) {
    const cur = core.state().size;
    openMenu(btn, FONT_SIZES.map((s) => ({ label: String(s), checked: cur === s, run: () => core.setFontSize(s) })), { cls: 'ed-menu--narrow' });
  }
  function swatches(colors, attr) {
    return '<div class="ed-swatches">' + colors.map((c) => {
      const [val, name] = Array.isArray(c) ? c : [c, c];
      return '<button type="button" class="ed-swatch" ' + attr + '="' + val + '" title="' + esc(E(name)) + '" aria-label="' + esc(E(name)) + '" style="--sw:' + val + '"></button>';
    }).join('') + '</div>';
  }
  function colorPicker(title, colors, onPick, noneLabel) {
    return [
      { heading: title },
      { html: swatches(colors, 'data-color'), mount: (m) => m.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { closeMenu(); onPick(b.dataset.color); })) },
      { html: '<label class="ed-custom-color">' + icon('edit') + '<span>' + esc(E('Custom…')) + '</span><input type="color" value="#2f6fed"></label>', mount: (m) => { const inp = m.querySelector('.ed-custom-color input'); inp.addEventListener('change', () => { closeMenu(); onPick(inp.value); }); } },
      { label: noneLabel, icon: 'x', run: () => onPick(null) },
    ];
  }
  function colorMenu(btn) {
    openMenu(btn, colorPicker(E('Text color'), TEXT_COLORS, (c) => { core.restore(); core.setColor(c); if (c) el.colorBar.style.background = c; }, E('Automatic (default)')));
  }
  function highlightMenu(btn) {
    openMenu(btn, colorPicker(E('Highlight'), MARKERS, (c) => { core.restore(); core.setHighlight(c); if (c) el.markBar.style.background = c; }, E('No highlight'))
      .concat([{ sep: true }, { label: E('Paragraph background…'), icon: 'droplet', run: () => paragraphDialog('shading') }]));
  }
  function spacingMenu(btn) {
    const cur = core.state().lineHeight;
    openMenu(btn, [{ heading: E('Line spacing') }].concat(['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => ({ label: v === '1' ? E('Single (1.0)') : v === '2' ? E('Double (2.0)') : v, checked: cur === v || (!cur && v === '1.15'), run: () => core.setBlockStyle('lineHeight', v === '1.15' ? '' : v) })))
      .concat([{ sep: true },
        { label: E('Add space before paragraph'), icon: 'plus', run: () => core.setBlockStyle('marginTop', '12pt') },
        { label: E('Remove space after paragraph'), icon: 'minus', run: () => core.setBlockStyle('marginBottom', '0px') },
        { label: E('Reset paragraph spacing'), icon: 'reset', run: () => { core.setBlockStyle('marginTop', ''); core.setBlockStyle('marginBottom', ''); } },
        { sep: true },
        { label: E('Paragraph settings…'), icon: 'settings', run: () => paragraphDialog() }]));
  }
  function tableMenu(btn) {
    const R = 8, C = 10;
    let cells = '';
    for (let r = 1; r <= R; r++) for (let c = 1; c <= C; c++) cells += '<button type="button" class="ed-grid__cell" data-r="' + r + '" data-c="' + c + '" aria-label="' + r + ' × ' + c + '"></button>';
    openMenu(btn, [
      { heading: E('Insert table') },
      {
        html: '<div class="ed-grid" style="--cols:' + C + '">' + cells + '</div><div class="ed-grid__label muted small">3 × 3</div>',
        mount: (m) => {
          const label = m.querySelector('.ed-grid__label');
          const paint = (r, c) => { m.querySelectorAll('.ed-grid__cell').forEach((x) => x.classList.toggle('is-on', +x.dataset.r <= r && +x.dataset.c <= c)); label.textContent = r + ' × ' + c + (r > 1 ? ' ' + E('(first row = header)') : ''); };
          m.querySelector('.ed-grid').addEventListener('mouseover', (e) => { const x = e.target.closest('.ed-grid__cell'); if (x) paint(+x.dataset.r, +x.dataset.c); });
          m.querySelector('.ed-grid').addEventListener('click', (e) => { const x = e.target.closest('.ed-grid__cell'); if (!x) return; closeMenu(); core.restore(); core.insertTable(+x.dataset.r, +x.dataset.c, true); });
          paint(3, 3);
        },
      },
      { label: E('Custom size…'), icon: 'table', run: tableDialog },
    ]);
  }
  function shapesMenu(btn) {
    openMenu(btn, [{ heading: E('Insert shape') }, {
      html: '<div class="ed-shapes">' + W.SHAPES.map(([k, l]) => '<button type="button" class="ed-shape-btn" data-shape="' + k + '" title="' + esc(E(l)) + '">' + icon(shapeIcon(k)) + '<span>' + esc(E(l)) + '</span></button>').join('') + '</div>',
      mount: (m) => m.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => { closeMenu(); insertShape(b.dataset.shape); })),
    }, { sep: true }, { label: E('Empty drawing canvas'), icon: 'shapes', run: () => insertDrawing([]) }]);
  }
  const shapeIcon = (k) => ({ rect: 'rect', round: 'round-rect', ellipse: 'circle', tri: 'triangle', diamond: 'diamond', line: 'line', arrow: 'arrow-shape' }[k] || 'shapes');
  function chartsMenu(btn) {
    openMenu(btn, [{ heading: E('Insert chart') }].concat(W.CHART_TYPES.map(([t, l]) => ({ label: E(l), icon: t === 'pie' ? 'pie' : t === 'line' ? 'line-chart' : 'chart', run: () => insertChart(t) }))));
  }
  function moreMenu(btn) {
    const s = core.state();
    openMenu(btn, [
      { label: E('Superscript'), icon: 'superscript', kbd: 'Ctrl+.', checked: s.sup, run: () => core.exec('superscript') },
      { label: E('Subscript'), icon: 'subscript', kbd: 'Ctrl+,', checked: s.sub, run: () => core.exec('subscript') },
      { label: E('Inline code'), icon: 'code', run: () => core.wrapInline('code') },
      { sep: true },
      { label: E('Quote'), icon: 'quote', run: () => core.setBlockType('blockquote') },
      { label: E('Horizontal line'), icon: 'minus', run: () => core.insertBlock(document.createElement('hr')) },
      { label: E('Page break'), icon: 'pagebreak', kbd: 'Ctrl+Enter', run: insertPageBreak },
      { sep: true },
      { label: E('Clear formatting'), icon: 'eraser', kbd: 'Ctrl+\\', run: () => core.clearFormatting() },
    ]);
  }
  function insertMenu(btn) {
    openMenu(btn, [
      { label: E('Image…'), icon: 'image', run: () => el.fileImage.click() },
      { label: E('Table…'), icon: 'table', run: tableDialog },
      { label: E('Link…'), icon: 'link', kbd: 'Ctrl+K', run: linkDialog },
      { sep: true },
      { label: E('Formula…'), icon: 'sigma', kbd: 'Ctrl+M', run: () => formulaDialog() },
      { label: E('Code block'), icon: 'code', run: insertCode },
      { sep: true },
      { heading: E('Shapes') },
      { html: '<div class="ed-shapes ed-shapes--row">' + W.SHAPES.map(([k, l]) => '<button type="button" class="ed-shape-btn" data-shape="' + k + '" title="' + esc(E(l)) + '" aria-label="' + esc(E(l)) + '">' + icon(shapeIcon(k)) + '</button>').join('') + '</div>',
        mount: (m) => m.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => { closeMenu(); insertShape(b.dataset.shape); })) },
      { heading: E('Charts') },
    ].concat(W.CHART_TYPES.map(([t, l]) => ({ label: E(l), icon: t === 'pie' ? 'pie' : t === 'line' ? 'line-chart' : 'chart', run: () => insertChart(t) })), [
      { sep: true },
      { label: E('Horizontal line'), icon: 'minus', run: () => core.insertBlock(document.createElement('hr')) },
      { label: E('Page break'), icon: 'pagebreak', kbd: 'Ctrl+Enter', run: insertPageBreak },
    ]));
  }
  function fileMenu(btn) {
    const ro = st.readonly;
    openMenu(btn, [
      { label: E('New document'), icon: 'file-plus', kbd: 'Ctrl+Alt+N', run: () => newDocument() },
      { label: E('Duplicate'), icon: 'copy', disabled: ro, run: () => duplicateDoc(st.cur.id) },
      { label: E('Rename'), icon: 'edit', disabled: ro, run: () => { el.title.focus(); el.title.select(); } },
      { label: st.cur.meta.pinned ? E('Unpin') : E('Pin to top'), icon: 'pin', disabled: ro, run: () => togglePin(st.cur.id) },
      { sep: true },
      { label: E('Page setup…'), icon: 'page', disabled: ro, run: pageDialog },
      { label: E('Export as PDF…'), icon: 'pdf', kbd: 'Ctrl+P', run: exportPDF },
      { label: E('Export as Markdown (.md)'), icon: 'markdown', run: () => exportMarkdown(st.cur.id) },
      { label: E('Export as Todo4Me document (.json)'), icon: 'download', run: () => exportJSON([st.cur.id]) },
      { label: E('Import…'), icon: 'upload', run: () => el.fileImport.click() },
      { sep: true },
      { label: E('Close document'), icon: 'x', run: () => { location.hash = '#/editor'; } },
      { label: E('Move to trash'), icon: 'trash', danger: true, disabled: ro, run: () => trashDoc(st.cur.id) },
    ]);
  }
  function docMenu(btn, id) {
    const d = st.docs.find((x) => x.id === id);
    if (!d) return;
    if (d.deletedAt) {
      openMenu(btn, [
        { label: E('Restore'), icon: 'reset', run: () => DS.restore(id).then(() => ui.toast(E('Document restored'))) },
        { label: E('Open (read-only)'), icon: 'doc', run: () => { location.hash = '#/editor?doc=' + id; } },
        { sep: true },
        { label: E('Delete permanently…'), icon: 'trash', danger: true, run: () => destroyDoc(id) },
      ]);
      return;
    }
    openMenu(btn, [
      { label: E('Open'), icon: 'doc', run: () => { location.hash = '#/editor?doc=' + id; } },
      { label: E('Rename…'), icon: 'edit', run: () => renameDialog(id) },
      { label: E('Duplicate'), icon: 'copy', run: () => duplicateDoc(id) },
      { label: d.pinned ? E('Unpin') : E('Pin to top'), icon: 'pin', run: () => togglePin(id) },
      { sep: true },
      { label: E('Export as PDF…'), icon: 'pdf', run: () => exportPDFOf(id) },
      { label: E('Export as Markdown'), icon: 'markdown', run: () => exportMarkdown(id) },
      { label: E('Export as Todo4Me document'), icon: 'download', run: () => exportJSON([id]) },
      { sep: true },
      { label: E('Move to trash'), icon: 'trash', danger: true, run: () => trashDoc(id) },
    ]);
  }

  /* ====================== Document actions ====================== */
  async function duplicateDoc(id) {
    if (st.cur && st.cur.id === id) await flush();
    const m = await DS.duplicate(id);
    if (m) { ui.toast(E('Document duplicated')); location.hash = '#/editor?doc=' + m.id; }
  }
  async function togglePin(id) {
    if (st.cur && st.cur.id === id) await flush();
    const d = st.docs.find((x) => x.id === id);
    const m = await DS.touch(id, { pinned: !d.pinned });
    if (st.cur && st.cur.id === id && m) st.cur.meta = m;
    ui.toast(m && m.pinned ? E('Pinned to the top') : 'Unpinned', 'info');
  }
  async function trashDoc(id) {
    const d = st.docs.find((x) => x.id === id);
    const ok = await ui.confirm({ title: E('Move document to trash?'), message: E('“{title}” will be moved to the trash. You can restore it there for {n} days.', { title: docTitle(d), n: DS.TRASH_DAYS }), confirmText: E('Move to trash'), danger: true });
    if (!ok) return;
    if (st.cur && st.cur.id === id) { await flush(); st.cur = null; location.hash = '#/editor'; }
    await DS.trash(id);
    ui.toast(E('Moved to trash'), 'success', 6000, { label: tt('c.undo'), fn: () => DS.restore(id).then(() => ui.toast(E('Document restored'))) });
  }
  async function destroyDoc(id) {
    const d = st.docs.find((x) => x.id === id);
    const ok = await ui.confirm({ title: E('Delete permanently?'), message: E('“{title}” will be deleted for good. This cannot be undone.', { title: docTitle(d) }), confirmText: E('Delete permanently'), danger: true });
    if (!ok) return;
    if (st.cur && st.cur.id === id) { st.cur = null; location.hash = '#/editor'; }
    await DS.destroy(id);
    ui.toast(E('Document deleted'));
  }
  function renameDialog(id) {
    const d = st.docs.find((x) => x.id === id);
    W.textDialog(E('Rename document'), d.title || docTitle(d), async (v) => {
      if (st.cur && st.cur.id === id) { el.title.value = v.trim(); markDirty(); await flush(); }
      else await DS.touch(id, { title: v.trim().slice(0, 200) });
      ui.toast(E('Document renamed'));
    });
  }

  /* ====================== Insert helpers ====================== */
  function insertCode() {
    const w = W.create('code', { lang: 'javascript', code: '' });
    core.insertBlock(w);
    const ta = w.querySelector('textarea');
    if (ta) { ta.focus(); core.selectWidget(w, { noRange: true }); }
  }
  function insertPageBreak() { core.insertBlock(W.create('pagebreak', {})); }
  function insertShape(kind) {
    const sel = core.selectedWidget;
    if (sel && sel.getAttribute('data-w') === 'draw') { W.drawing.add(sel, kind); return; }
    insertDrawing([kind]);
  }
  function insertDrawing(kinds) {
    const w = W.create('draw', { h: 240, shapes: [] });
    core.insertBlock(w, { select: true });
    kinds.forEach((k) => W.drawing.add(w, k));
    core.selectWidget(w);
  }
  function insertChart(type) {
    W.chartDialog({ props: W.defaultChart(type), isNew: true, onSave: (p) => { core.restore(); core.insertBlock(W.create('chart', p), { select: true }); } });
  }
  function formulaDialog(existing, forceDisplay) {
    const sel = core.rememberSelection();
    const b = core.currentBlock();
    const display = existing ? existing.tagName !== 'SPAN' : forceDisplay != null ? forceDisplay : !b || !b.textContent.replace(/\u200B/g, '').trim();
    W.mathDialog({
      tex: existing ? W.getProps(existing).tex : '',
      display,
      onSave: (tex, disp) => {
        core.restore();
        if (sel && !existing) core.setSel(sel);
        if (existing && existing.isConnected) {
          const wasDisplay = existing.tagName !== 'SPAN';
          if (wasDisplay === disp) { core.run(() => W.setProps(existing, { tex }), { keepFocus: true }); core.selectWidget(existing); }
          else core.replaceWidget(existing, W.create('math', { tex }, !disp));
          return;
        }
        const w = W.create('math', { tex }, !disp);
        if (disp) core.insertBlock(w); else core.insertInlineWidget(w);
      },
    });
  }
  function editWidget(w) {
    switch (w.getAttribute('data-w')) {
      case 'math': formulaDialog(w); break;
      case 'chart': W.chartDialog({ props: W.getProps(w), onSave: (p) => { core.run(() => W.setProps(w, p), { keepFocus: true }); core.selectWidget(w); } }); break;
      case 'img': captionDialog(w); break;
      case 'code': { const ta = w.querySelector('textarea'); if (ta) ta.focus(); break; }
    }
  }

  /* ====================== Dialogs ====================== */
  function linkDialog(existing) {
    const s = core.state();
    const a = existing || s.link;
    const r = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null;
    const selText = a ? a.textContent : r && el.doc.contains(r.commonAncestorContainer) ? r.toString() : '';
    const sel = core.rememberSelection();
    ui.openModal({
      title: a ? E('Edit link') : E('Insert link'),
      size: 'sm',
      body: '<form id="link-form" class="form">' +
        '<div class="field"><label for="lk-text">' + esc(E('Text')) + '</label><input id="lk-text" type="text" value="' + esc(selText) + '" placeholder="' + esc(E('Text to display')) + '"></div>' +
        '<div class="field"><label for="lk-url">' + esc(E('Address')) + '</label><input id="lk-url" type="text" value="' + esc(a ? a.getAttribute('href') : '') + '" placeholder="' + esc(E('https://example.com or mailto:name@example.com')) + '" autofocus></div>' +
        '</form>',
      footer: (a ? '<button type="button" class="btn btn--ghost btn--danger-text mr-auto" id="lk-remove">' + icon('unlink') + esc(E('Remove link')) + '</button>' : '') +
        '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="link-form">' + esc(a ? E('Save') : E('Insert')) + '</button>',
      onMount(m) {
        const url = m.querySelector('#lk-url');
        url.focus();
        m.querySelector('#link-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const text = m.querySelector('#lk-text').value;
          let href = url.value.trim();
          if (href && !/^(https?:|mailto:|#)/i.test(href)) href = (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href) ? 'mailto:' : 'https://') + href;
          ui.closeModal(true);
          core.restore();
          if (sel) core.setSel(sel);
          core.setLink(href, text === selText && !a ? '' : text, a);
        });
        const rm = m.querySelector('#lk-remove');
        if (rm) rm.addEventListener('click', () => { ui.closeModal(true); core.removeLink(a); });
      },
    });
  }
  function tableDialog() {
    const sel = core.rememberSelection();
    ui.openModal({
      title: E('Insert table'),
      size: 'sm',
      body: '<form id="tbl-form" class="form"><div class="grid-2">' +
        '<div class="field"><label for="tbl-r">' + esc(E('Rows')) + '</label><input id="tbl-r" type="number" min="1" max="100" value="4"></div>' +
        '<div class="field"><label for="tbl-c">' + esc(E('Columns')) + '</label><input id="tbl-c" type="number" min="1" max="20" value="3"></div></div>' +
        '<label class="checkbox"><input type="checkbox" id="tbl-h" checked><span>' + esc(E('First row is a header row')) + '</span></label></form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="tbl-form">' + esc(E('Insert table')) + '</button>',
      onMount(m) {
        m.querySelector('#tbl-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const r = Math.max(1, Math.min(100, +m.querySelector('#tbl-r').value || 1));
          const c = Math.max(1, Math.min(20, +m.querySelector('#tbl-c').value || 1));
          ui.closeModal(true);
          core.restore();
          if (sel) core.setSel(sel);
          core.insertTable(r, c, m.querySelector('#tbl-h').checked);
        });
      },
    });
  }
  function captionDialog(w) {
    const p = W.getProps(w);
    ui.openModal({
      title: E('Image details'),
      size: 'sm',
      body: '<form id="img-form" class="form">' +
        '<div class="field"><label for="img-cap">' + esc(E('Caption')) + ' <span class="muted">' + esc(E('(shown below the image)')) + '</span></label><input id="img-cap" type="text" maxlength="300" value="' + esc(p.cap) + '"></div>' +
        '<div class="field"><label for="img-alt">' + esc(E('Alternative text')) + ' <span class="muted">' + esc(E('(for screen readers)')) + '</span></label><input id="img-alt" type="text" maxlength="300" value="' + esc(p.alt) + '"></div></form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="img-form">' + esc(E('Save')) + '</button>',
      onMount(m) {
        m.querySelector('#img-form').addEventListener('submit', (e) => {
          e.preventDefault();
          p.cap = m.querySelector('#img-cap').value;
          p.alt = m.querySelector('#img-alt').value;
          ui.closeModal(true);
          core.run(() => W.setProps(w, p), { keepFocus: true });
          core.selectWidget(w);
        });
      },
    });
  }
  function paragraphDialog(focus) {
    const blocks = core.selectedBlocks();
    if (!blocks.length) { ui.toast(E('Place the cursor in a paragraph first.'), 'info'); return; }
    const b = blocks[0];
    const sel = core.rememberSelection();
    const px = (v) => (parseFloat(v) || 0);
    const toPt = (v) => Math.round(px(v) * 0.75 * 10) / 10;
    const cs = getComputedStyle(b);
    const bg = b.style.backgroundColor ? rgbToHex(b.style.backgroundColor) : '#ffffff';
    ui.openModal({
      title: E('Paragraph'),
      size: 'sm',
      body: '<form id="para-form" class="form">' +
        '<div class="grid-2"><div class="field"><label for="pa-lh">' + esc(E('Line spacing')) + '</label><select id="pa-lh">' + ['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => '<option value="' + v + '"' + ((b.style.lineHeight || '1.15') === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="pa-al">' + esc(E('Alignment')) + '</label><select id="pa-al">' + ['left', 'center', 'right', 'justify'].map((v) => '<option value="' + v + '"' + ((b.style.textAlign || 'left') === v ? ' selected' : '') + '>' + esc(E(v.charAt(0).toUpperCase() + v.slice(1))) + '</option>').join('') + '</select></div></div>' +
        '<div class="grid-2"><div class="field"><label for="pa-sb">' + esc(E('Space before (pt)')) + '</label><input id="pa-sb" type="number" min="0" max="90" step="1" value="' + toPt(b.style.marginTop || cs.marginTop) + '"></div>' +
        '<div class="field"><label for="pa-sa">' + esc(E('Space after (pt)')) + '</label><input id="pa-sa" type="number" min="0" max="90" step="1" value="' + toPt(b.style.marginBottom || cs.marginBottom) + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label for="pa-in">' + esc(E('Left indent (cm)')) + '</label><input id="pa-in" type="number" min="0" max="10" step="0.25" value="' + (Math.round(px(b.style.marginLeft) / 37.8 * 100) / 100) + '"></div>' +
        '<div class="field"><label for="pa-fi">' + esc(E('First line (cm)')) + '</label><input id="pa-fi" type="number" min="-5" max="5" step="0.25" value="' + (Math.round(px(b.style.textIndent) / 37.8 * 100) / 100) + '"></div></div>' +
        '<div class="field"><span class="label">' + esc(E('Background shading')) + '</span><div class="input-row"><label class="checkbox"><input type="checkbox" id="pa-bgon"' + (b.style.backgroundColor ? ' checked' : '') + '><span>' + esc(E('Shade paragraph')) + '</span></label><input type="color" id="pa-bg" value="' + bg + '" aria-label="' + esc(E('Shading color')) + '"></div></div>' +
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="para-form">' + esc(E('Apply')) + '</button>',
      onMount(m) {
        if (focus === 'shading') { m.querySelector('#pa-bgon').checked = true; if (!b.style.backgroundColor) m.querySelector('#pa-bg').value = '#f1f3f7'; }
        m.querySelector('#pa-bg').addEventListener('input', () => { m.querySelector('#pa-bgon').checked = true; });
        m.querySelector('#para-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = (id) => m.querySelector(id).value;
          ui.closeModal(true);
          core.restore();
          if (sel) core.setSel(sel);
          core.run(() => core.selectedBlocks().forEach((x) => {
            x.style.lineHeight = v('#pa-lh') === '1.15' ? '' : v('#pa-lh');
            x.style.textAlign = v('#pa-al') === 'left' ? '' : v('#pa-al');
            x.style.marginTop = v('#pa-sb') !== '' ? (+v('#pa-sb')) + 'pt' : '';
            x.style.marginBottom = v('#pa-sa') !== '' ? (+v('#pa-sa')) + 'pt' : '';
            x.style.marginLeft = +v('#pa-in') ? (+v('#pa-in')) + 'cm' : '';
            x.style.textIndent = +v('#pa-fi') ? (+v('#pa-fi')) + 'cm' : '';
            x.style.backgroundColor = m.querySelector('#pa-bgon').checked ? v('#pa-bg') : '';
            if (!x.getAttribute('style')) x.removeAttribute('style');
          }));
        });
      },
    });
  }
  function rgbToHex(c) {
    const m = String(c).match(/\d+/g);
    return m && m.length >= 3 ? '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#ffffff';
  }

  /* ====================== Page setup ====================== */
  function pageDims(p) {
    const [w, h] = PAGE_SIZES[p.size] || PAGE_SIZES.A4;
    return p.orientation === 'landscape' ? [h, w] : [w, h];
  }
  const pageMargins = (p) => MARGINS[p.margins] || MARGINS.normal;
  function fillTokens(s, meta) {
    return String(s || '').replace(/\{title\}/gi, docTitle(meta)).replace(/\{date\}/gi, new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()));
  }
  function applyPage() {
    if (!st.cur) return;
    const p = st.cur.meta.page;
    const [w, h] = pageDims(p);
    const m = pageMargins(p);
    const s = el.page.style;
    s.setProperty('--page-w', w + 'mm');
    s.setProperty('--page-h', h + 'mm');
    s.setProperty('--m-t', m[0] + 'mm'); s.setProperty('--m-r', m[1] + 'mm'); s.setProperty('--m-b', m[2] + 'mm'); s.setProperty('--m-l', m[3] + 'mm');
    el.hfHead.textContent = fillTokens(p.header, st.cur.meta) + (p.pageNumbers === 'top-right' ? '' : '');
    el.hfHead.dataset.num = p.pageNumbers === 'top-right' ? numberSample(p) : '';
    el.hfFoot.textContent = fillTokens(p.footer, st.cur.meta);
    el.hfFoot.dataset.num = p.pageNumbers.startsWith('bottom') ? numberSample(p) : '';
    el.hfFoot.dataset.pos = p.pageNumbers;
  }
  const numberSample = (p) => (p.numberFormat === 'plain' ? '1' : p.numberFormat === 'slash' ? '1 / N' : E('Page 1 of N'));
  function pageDialog() {
    const p = Object.assign({}, st.cur.meta.page);
    const opt = (v, l, cur) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>';
    ui.openModal({
      title: E('Page setup'),
      body: '<form id="page-form" class="form">' +
        '<div class="grid-3"><div class="field"><label for="pg-size">' + esc(E('Paper size')) + '</label><select id="pg-size">' + Object.keys(PAGE_SIZES).map((k) => opt(k, k, p.size)).join('') + '</select></div>' +
        '<div class="field"><label for="pg-or">' + esc(E('Orientation')) + '</label><select id="pg-or">' + opt('portrait', esc(E('Portrait')), p.orientation) + opt('landscape', esc(E('Landscape')), p.orientation) + '</select></div>' +
        '<div class="field"><label for="pg-m">' + esc(E('Margins')) + '</label><select id="pg-m">' + opt('normal', esc(E('Normal (2.54 cm)')), p.margins) + opt('narrow', esc(E('Narrow (1.27 cm)')), p.margins) + opt('moderate', esc(E('Moderate')), p.margins) + opt('wide', esc(E('Wide')), p.margins) + '</select></div></div>' +
        '<div class="field"><label for="pg-h">' + esc(E('Header')) + '</label><input id="pg-h" type="text" maxlength="200" value="' + esc(p.header) + '" placeholder="' + esc(E('e.g. {title}')) + '"></div>' +
        '<div class="field"><label for="pg-f">' + esc(E('Footer')) + '</label><input id="pg-f" type="text" maxlength="200" value="' + esc(p.footer) + '" placeholder="' + esc(E('e.g. Confidential · {date}')) + '">' +
          '<p class="field__help">' + E('Placeholders: <code>{title}</code> document title, <code>{date}</code> export date.') + '</p></div>' + // dictionary HTML, no values
        '<div class="grid-2"><div class="field"><label for="pg-n">' + esc(E('Page numbers')) + '</label><select id="pg-n">' + opt('none', esc(E('None')), p.pageNumbers) + opt('bottom-center', esc(E('Bottom, centered')), p.pageNumbers) + opt('bottom-right', esc(E('Bottom right')), p.pageNumbers) + opt('top-right', esc(E('Top right')), p.pageNumbers) + '</select></div>' +
        '<div class="field"><label for="pg-nf">' + esc(E('Format')) + '</label><select id="pg-nf">' + opt('page-of', esc(E('Page 1 of 3')), p.numberFormat) + opt('slash', '1 / 3', p.numberFormat) + opt('plain', '1', p.numberFormat) + '</select></div></div>' +
        '<label class="checkbox"><input type="checkbox" id="pg-first"' + (p.firstPageHeader ? '' : ' checked') + '><span>' + esc(E('No header and page number on the first page')) + '</span></label>' +
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="page-form">' + esc(E('Apply')) + '</button>',
      onMount(m) {
        m.querySelector('#page-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = (id) => m.querySelector(id).value;
          st.cur.meta.page = DS.cleanPage({ size: v('#pg-size'), orientation: v('#pg-or'), margins: v('#pg-m'), header: v('#pg-h'), footer: v('#pg-f'), pageNumbers: v('#pg-n'), numberFormat: v('#pg-nf'), firstPageHeader: !m.querySelector('#pg-first').checked });
          ui.closeModal(true);
          applyPage();
          markDirty();
          updateCountsSoon();
          ui.toast(E('Page setup updated'), 'success', 1800);
        });
      },
    });
  }

  /* ====================== Context toolbar (widgets, tables, links) ====================== */
  let ctxTarget = null;
  function hideCtx() { if (el.ctx) { el.ctx.hidden = true; ctxTarget = null; } }
  const cb = (action, ic, label, extra) => '<button type="button" class="ctx-btn" data-ctx="' + action + '"' + (extra || '') + ' title="' + esc(label) + '">' + (ic ? icon(ic) : '') + '<span>' + esc(label) + '</span></button>';
  const cbi = (action, ic, label, on) => '<button type="button" class="ctx-btn ctx-btn--icon' + (on ? ' is-on' : '') + '" data-ctx="' + action + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon(ic) + '</button>';
  const sep = '<span class="ctx-sep"></span>';
  function updateCtx() {
    if (!st.cur || st.readonly || !el.ctx) { hideCtx(); return; }
    const w = core.selectedWidget;
    let html = '', target = null;
    if (w && w.isConnected) {
      target = w;
      const p = W.getProps(w);
      switch (w.getAttribute('data-w')) {
        case 'img':
          html = '<span class="ctx-label">' + esc(E('Image')) + '</span>' + [25, 50, 75, 100].map((n) => '<button type="button" class="ctx-btn ctx-btn--chip' + (Math.round(p.w) === n ? ' is-on' : '') + '" data-ctx="img-w" data-v="' + n + '">' + n + '%</button>').join('') + sep +
            cbi('img-al:left', 'align-left', E('Align left'), p.al === 'left') + cbi('img-al:center', 'align-center', E('Center'), p.al === 'center') + cbi('img-al:right', 'align-right', E('Align right'), p.al === 'right') +
            cbi('img-al:float-left', 'wrap-left', E('Wrap text (image left)'), p.al === 'float-left') + cbi('img-al:float-right', 'wrap-right', E('Wrap text (image right)'), p.al === 'float-right') + sep +
            cb('img-cap', 'type', E('Caption')) + cbi('img-replace', 'image', E('Replace image')) + cbi('delete', 'trash', E('Delete image'));
          break;
        case 'draw': {
          const s = W.drawing.selected(w);
          html = '<span class="ctx-label">' + esc(E('Drawing')) + '</span>' + cb('draw-add', 'plus', E('Shape'), ' aria-haspopup="menu"');
          if (s) {
            const line = s.t === 'line' || s.t === 'arrow';
            html += sep + (line ? '' : '<button type="button" class="ctx-btn ctx-btn--color" data-ctx="draw-fill" title="' + esc(E('Fill color')) + '"><span class="ctx-swatch" style="background:' + (s.fill === 'none' ? 'transparent' : s.fill) + '"></span><span>' + esc(E('Fill')) + '</span></button>') +
              '<button type="button" class="ctx-btn ctx-btn--color" data-ctx="draw-stroke" title="' + (line ? E('Line color') : E('Outline color')) + '"><span class="ctx-swatch ctx-swatch--ring" style="border-color:' + s.stroke + '"></span><span>' + (line ? E('Color') : E('Outline')) + '</span></button>' +
              '<span class="ctx-range" title="' + (line ? E('Line width') : E('Outline width')) + '">' +
                '<button type="button" class="ctx-btn ctx-btn--icon" data-ctx="draw-sw:-1" aria-label="' + esc(E('Thinner')) + '"' + (s.sw <= (line ? 1 : 0) ? ' disabled' : '') + '>' + icon('minus') + '</button>' +
                '<input type="range" min="' + (line ? 1 : 0) + '" max="' + SW_MAX + '" step="1" value="' + s.sw + '" data-ctx-input="draw-sw" aria-label="' + (line ? E('Line width') : E('Outline width')) + '">' +
                '<span class="ctx-range__val">' + s.sw + ' px</span>' +
                '<button type="button" class="ctx-btn ctx-btn--icon" data-ctx="draw-sw:1" aria-label="' + esc(E('Thicker')) + '"' + (s.sw >= SW_MAX ? ' disabled' : '') + '>' + icon('plus') + '</button></span>' +
              (line ? '' : cb('draw-text', 'type', E('Text')) + '<button type="button" class="ctx-btn ctx-btn--color" data-ctx="draw-tc" title="' + esc(E('Text color')) + '"><span class="ctx-swatch" style="background:' + s.tc + '"></span></button>') + sep +
              cbi('draw-front', 'bring-front', E('Bring to front')) + cbi('draw-back', 'send-back', E('Send to back')) + cbi('draw-dup', 'copy', E('Duplicate (Ctrl+D)')) + cbi('draw-del', 'trash', E('Delete shape (Del)'));
          } else {
            html += sep + cbi('draw-al:left', 'align-left', E('Align drawing left'), p.al === 'left') + cbi('draw-al:center', 'align-center', E('Center drawing'), p.al === 'center') + cbi('draw-al:right', 'align-right', E('Align drawing right'), p.al === 'right') +
              sep + '<span class="ctx-hint">' + esc(E('Click a shape to edit it · drag to move')) + '</span>' + cbi('delete', 'trash', E('Delete drawing'));
          }
          break;
        }
        case 'chart':
          html = '<span class="ctx-label">' + esc(E('Chart')) + '</span>' + cb('edit', 'edit', E('Edit data')) + sep +
            W.CHART_TYPES.map(([t, l]) => cbi('chart-type:' + t, t === 'pie' ? 'pie' : t === 'line' ? 'line-chart' : 'chart', E(l), p.type === t)).join('') + sep +
            [50, 75, 100].map((n) => '<button type="button" class="ctx-btn ctx-btn--chip' + (p.w === n ? ' is-on' : '') + '" data-ctx="chart-w" data-v="' + n + '">' + n + '%</button>').join('') + sep + cbi('delete', 'trash', E('Delete chart'));
          break;
        case 'math':
          html = '<span class="ctx-label">' + esc(E('Formula')) + '</span>' + cb('edit', 'sigma', E('Edit formula')) + cb('math-toggle', w.tagName === 'SPAN' ? 'align-center' : 'type', w.tagName === 'SPAN' ? E('Make block') : E('Make inline')) + cbi('delete', 'trash', E('Delete formula'));
          break;
        case 'code':
          html = '<span class="ctx-label">' + esc(E('Code block')) + '</span><span class="ctx-hint">' + esc(E('Esc or Ctrl+Enter to leave the block')) + '</span>' + cbi('delete', 'trash', E('Delete code block'));
          break;
        case 'pagebreak':
          html = '<span class="ctx-label">' + esc(E('Page break')) + '</span>' + cbi('delete', 'trash', E('Remove page break'));
          break;
      }
    } else {
      const s = core.state();
      if (s.link) {
        target = s.link;
        const href = s.link.getAttribute('href') || '';
        html = icon('link') + '<span class="ctx-url" title="' + esc(href) + '">' + esc(href.length > 46 ? href.slice(0, 44) + '…' : href) + '</span>' + cbi('link-open', 'external', E('Open link (Ctrl+Click)')) + cbi('link-edit', 'edit', E('Edit link')) + cbi('link-remove', 'unlink', E('Remove link'));
      } else if (s.cell) {
        target = s.cell.closest('table');
        html = '<span class="ctx-label">' + esc(E('Table')) + '</span>' + cb('tbl:row-above', 'plus', E('Row above')) + cb('tbl:row-below', 'plus', E('Row below')) + cb('tbl:col-left', 'plus', E('Column left')) + cb('tbl:col-right', 'plus', E('Column right')) + sep +
          cb('tbl:del-row', 'minus', E('Row')) + cb('tbl:del-col', 'minus', E('Column')) + sep +
          cbi('tbl:header', 'heading', E('Toggle header row'), !!target.querySelector('thead')) + '<button type="button" class="ctx-btn ctx-btn--icon" data-ctx="tbl-bg" title="' + esc(E('Cell color')) + '" aria-label="' + esc(E('Cell color')) + '">' + icon('droplet') + '</button>' + cbi('tbl:delete', 'trash', E('Delete table'));
      }
    }
    if (!target) { hideCtx(); return; }
    // Rebuilding the bar while a slider is dragged or focused would cut the drag short.
    const sliding = ctxTarget === target && el.ctx.contains(document.activeElement) && document.activeElement.type === 'range';
    if (!sliding && (ctxTarget !== target || el.ctx.innerHTML !== html)) {
      el.ctx.innerHTML = html;
      ctxTarget = target;
      bindCtx();
    }
    el.ctx.hidden = false;
    positionCtx();
  }
  function positionCtx() {
    if (!ctxTarget || !el.ctx || el.ctx.hidden || !ctxTarget.isConnected) return;
    const sr = el.scroll.getBoundingClientRect();
    const tr = ctxTarget.getBoundingClientRect();
    const h = el.ctx.offsetHeight, w = el.ctx.offsetWidth;
    let top = tr.top - sr.top + el.scroll.scrollTop - h - 8;
    if (tr.top - sr.top - h - 8 < 4) top = tr.bottom - sr.top + el.scroll.scrollTop + 8;
    let left = tr.left - sr.left + el.scroll.scrollLeft + Math.min(tr.width, 600) / 2 - w / 2;
    left = Math.max(8 + el.scroll.scrollLeft, Math.min(left, el.scroll.scrollLeft + el.scroll.clientWidth - w - 8));
    el.ctx.style.top = Math.round(top) + 'px';
    el.ctx.style.left = Math.round(left) + 'px';
  }
  function bindCtx() {
    el.ctx.onmousedown = (e) => { if (!e.target.closest('input')) e.preventDefault(); };
    el.ctx.onclick = (e) => {
      const b = e.target.closest('[data-ctx]');
      if (b) ctxAction(b.dataset.ctx, b);
    };
    el.ctx.oninput = (e) => {
      const i = e.target.closest('[data-ctx-input]');
      if (!i) return;
      if (i.dataset.ctxInput === 'draw-sw') {
        i.nextElementSibling.textContent = i.value + ' px';
        const w = core.selectedWidget;
        if (w) { W.drawing.action(w, 'sw', i.value); }
      }
    };
    el.ctx.onchange = () => core.restore();
  }
  function ctxAction(action, btn) {
    const w = core.selectedWidget;
    const [name, val] = action.split(':');
    const p = w ? W.getProps(w) : null;
    const setP = (patch) => { core.run(() => W.setProps(w, Object.assign(p, patch)), { keepFocus: true }); core.selectWidget(w); };
    switch (name) {
      case 'delete': if (w) core.removeWidget(w); break;
      case 'edit': if (w) editWidget(w); break;
      case 'img-w': setP({ w: +btn.dataset.v }); break;
      case 'img-al': setP({ al: val }); break;
      case 'img-cap': captionDialog(w); break;
      case 'img-replace': replaceImage(w); break;
      case 'chart-type': setP({ type: val }); break;
      case 'chart-w': setP({ w: +btn.dataset.v }); break;
      case 'math-toggle': core.replaceWidget(w, W.create('math', { tex: p.tex }, w.tagName !== 'SPAN')); break;
      case 'draw-add':
        openMenu(btn, W.SHAPES.map(([k, l]) => ({ label: E(l), icon: shapeIcon(k), run: () => W.drawing.add(w, k) })));
        break;
      case 'draw-fill': case 'draw-stroke': case 'draw-tc': {
        const key = name.slice(5) === 'fill' ? 'fill' : name.slice(5) === 'stroke' ? 'stroke' : 'tc';
        const colors = key === 'fill' ? W.PALETTE.concat(['#dbe4ff', '#ffe3d6', '#d9f2e1', '#fbefd2', '#ffffff', '#1f2330']) : TEXT_COLORS;
        openMenu(btn, colorPicker(key === 'fill' ? E('Fill') : key === 'stroke' ? E('Outline') : E('Text color'), colors, (c) => W.drawing.action(w, key, c || (key === 'fill' ? 'none' : '#1f2330')), key === 'fill' ? E('No fill') : E('Default')));
        break;
      }
      case 'draw-sw': {
        const s = W.drawing.selected(w);
        if (s) W.drawing.action(w, 'sw', Math.max(0, Math.min(SW_MAX, s.sw + Number(val))));
        break;
      }
      case 'draw-text': W.drawing.action(w, 'text'); break;
      case 'draw-front': W.drawing.action(w, 'front'); break;
      case 'draw-back': W.drawing.action(w, 'back'); break;
      case 'draw-dup': W.drawing.action(w, 'duplicate'); break;
      case 'draw-del': W.drawing.action(w, 'delete-shape'); break;
      case 'draw-al': W.drawing.action(w, 'align', val); break;
      case 'link-open': openLink(core.state().link); break;
      case 'link-edit': linkDialog(core.state().link); break;
      case 'link-remove': core.removeLink(core.state().link); break;
      case 'tbl': core.tableOp(val); break;
      case 'tbl-bg': openMenu(btn, colorPicker(E('Cell color'), ['#f1f3f7', '#dbe4ff', '#d9f2e1', '#fbefd2', '#ffe3d6', '#fbdcef', '#eadcf8', '#e6e8ec', '#fff176', '#b9f6ca'], (c) => { core.restore(); core.tableOp('cell-bg', c); }, E('No color'))); break;
    }
  }
  function replaceImage(w) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const blob = await W.prepareImage(f);
        const id = await DS.putAsset(blob);
        const p = W.getProps(w); p.a = id;
        core.run(() => W.setProps(w, p), { keepFocus: true });
        core.selectWidget(w);
      } catch (e) { ui.toast(e.message, 'error'); }
    });
    input.click();
  }
  function openLink(a) {
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener');
  }

  /* ====================== Slash menu ("/" at the start of an empty line) ====================== */
  const SLASH = [
    ['Text', 'paragraph normal', 'doc', () => core.setBlockType('p')],
    ['Heading 1', 'h1 title', 'heading', () => core.setBlockType('h1')],
    ['Heading 2', 'h2', 'heading', () => core.setBlockType('h2')],
    ['Heading 3', 'h3', 'heading', () => core.setBlockType('h3')],
    ['Bulleted list', 'ul bullet', 'list-ul', () => core.exec('insertUnorderedList')],
    ['Numbered list', 'ol numbered', 'list-ol', () => core.exec('insertOrderedList')],
    ['Quote', 'blockquote citation', 'quote', () => core.setBlockType('blockquote')],
    ['Table', 'grid', 'table', () => core.insertTable(3, 3, true)],
    ['Image', 'picture photo', 'image', () => el.fileImage.click()],
    ['Code block', 'snippet program', 'code', insertCode],
    ['Formula', 'math latex equation', 'sigma', () => formulaDialog(null, true)],
    ['Bar chart', 'diagram graph', 'chart', () => insertChart('bar')],
    ['Line chart', 'diagram graph', 'line-chart', () => insertChart('line')],
    ['Pie chart', 'diagram graph', 'pie', () => insertChart('pie')],
    ['Rectangle', 'shape box', 'rect', () => insertShape('rect')],
    ['Circle', 'shape ellipse', 'circle', () => insertShape('ellipse')],
    ['Arrow', 'shape', 'arrow-shape', () => insertShape('arrow')],
    ['Divider', 'hr horizontal line', 'minus', () => core.insertBlock(document.createElement('hr'))],
    ['Page break', 'new page', 'pagebreak', insertPageBreak],
    ['Link', 'url', 'link', () => linkDialog()],
  ];
  let slash = null;
  function onDocInput(e) {
    if (slash) { updateSlash(); return; }
    if (e.inputType === 'insertText' && e.data === '/') {
      const info = core.textBeforeCaretInBlock();
      if (info && info.block.tagName === 'P' && info.text === '/' && info.block.textContent.replace(/\u200B/g, '') === '/') openSlash(info.block);
    }
  }
  function openSlash(block) {
    const m = document.createElement('div');
    m.className = 'ed-menu ed-slash';
    m.setAttribute('role', 'listbox');
    document.body.appendChild(m);
    slash = { block, el: m, items: SLASH, i: 0 };
    m.addEventListener('mousedown', (e) => e.preventDefault());
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-si]'); if (b) runSlash(+b.dataset.si); });
    paintSlash();
  }
  function updateSlash() {
    const b = slash.block;
    const t = b.isConnected ? b.textContent.replace(/\u200B/g, '') : '';
    const cur = core.currentBlock();
    if (!t.startsWith('/') || cur !== b || t.length > 24) { closeSlash(); return; }
    const q = t.slice(1).toLowerCase();
    slash.items = SLASH.filter(([label, kw]) => !q || (E(label) + ' ' + label + ' ' + kw).toLowerCase().includes(q));
    slash.i = 0;
    if (!slash.items.length) { closeSlash(); return; }
    paintSlash();
  }
  function paintSlash() {
    const m = slash.el;
    m.innerHTML = '<div class="ed-menu__heading">' + esc(E('Insert')) + '</div>' + slash.items.map(([label, , ic], i) =>
      '<button type="button" class="ed-menu__item' + (i === slash.i ? ' is-active' : '') + '" data-si="' + i + '" role="option" aria-selected="' + (i === slash.i) + '"><span class="ed-menu__icon">' + icon(ic) + '</span><span class="ed-menu__label">' + esc(E(label)) + '</span></button>').join('');
    const s = window.getSelection();
    const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : slash.block.getBoundingClientRect();
    const rect = r.height ? r : slash.block.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 14, above = rect.top - 14;
    const up = below < 220 && above > below;
    m.style.maxHeight = Math.max(140, Math.min(420, up ? above : below)) + 'px';
    const h = m.offsetHeight;
    m.style.left = Math.min(rect.left, window.innerWidth - m.offsetWidth - 8) + 'px';
    m.style.top = (up ? rect.top - h - 6 : rect.bottom + 6) + 'px';
    const act = m.querySelector('.is-active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function closeSlash() { if (slash) { slash.el.remove(); slash = null; } }
  function runSlash(i) {
    const item = slash.items[i];
    const b = slash.block;
    closeSlash();
    if (!item || !b.isConnected) return;
    core.run(() => {
      b.innerHTML = '<br>';
      const r = document.createRange(); r.setStart(b, 0); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    item[3]();
  }
  function onDocKeyDown(e) {
    if (!slash) return false;
    if (e.key === 'ArrowDown') { slash.i = (slash.i + 1) % slash.items.length; paintSlash(); return true; }
    if (e.key === 'ArrowUp') { slash.i = (slash.i - 1 + slash.items.length) % slash.items.length; paintSlash(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { runSlash(slash.i); return true; }
    if (e.key === 'Escape') { closeSlash(); return true; }
    return false;
  }

  function onShortcut(name, arg) {
    switch (name) {
      case 'edit-widget': editWidget(arg); return true;
      case 'open-link': openLink(arg); return true;
      case 'pagebreak': insertPageBreak(); return true;
      case 'formula-block': formulaDialog(null, true); return true;
      case 'mod-k': linkDialog(); return true;
      case 'mod-m': formulaDialog(); return true;
      case 'mod-s': flush().then(() => ui.toast(E('Saved'), 'success', 1500)); return true;
      case 'mod-p': exportPDF(); return true;
    }
    return false;
  }

  /* ====================== Export / import ====================== */
  function waitForImages() {
    const imgs = Array.from(el.doc.querySelectorAll('img')).filter((i) => !i.complete);
    return Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 5000); })));
  }
  function cssString(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]+/g, ' ') + '"'; }
  /** @page rules: paper size, margins, header/footer and page numbers (CSS paged media margin boxes). */
  function printCSS(meta) {
    const p = meta.page;
    const [w, h] = pageDims(p);
    const m = pageMargins(p);
    // Header, footer and page numbers sit halfway into the margin, where the editor page shows them.
    const box = 'font-family: Calibri, Carlito, "Segoe UI", sans-serif; font-size: 9pt; color: #6b7080; vertical-align: middle;';
    const cssPageOf = () => E('Page {a} of {b}').split(/(\{a\}|\{b\})/).filter(Boolean).map((part) => (part === '{a}' ? 'counter(page)' : part === '{b}' ? 'counter(pages)' : cssString(part))).join(' ');
    const num = p.numberFormat === 'plain' ? 'counter(page)' : p.numberFormat === 'slash' ? 'counter(page) " / " counter(pages)' : cssPageOf();
    // White paper: the margins must not show the app's (or the window's) background color.
    let css = 'html, body.print-doc { background: #fff !important; } @page { size: ' + w + 'mm ' + h + 'mm; margin: ' + m[0] + 'mm ' + m[1] + 'mm ' + m[2] + 'mm ' + m[3] + 'mm; background: #fff;';
    if (p.header) css += ' @top-center { content: ' + cssString(fillTokens(p.header, meta)) + '; ' + box + ' }';
    if (p.footer) css += ' @bottom-left { content: ' + cssString(fillTokens(p.footer, meta)) + '; ' + box + ' }';
    if (p.pageNumbers !== 'none') {
      const pos = { 'bottom-center': '@bottom-center', 'bottom-right': '@bottom-right', 'top-right': '@top-right' }[p.pageNumbers];
      css += ' ' + pos + ' { content: ' + num + '; ' + box + ' }';
    }
    css += ' }';
    if (!p.firstPageHeader) css += ' @page :first { @top-center { content: none; } @top-right { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }';
    return css;
  }
  let exporting = false;
  async function exportPDF() {
    if (!st.cur) { ui.toast(E('Open a document to export it as PDF.'), 'info'); return; }
    if (exporting) return;
    exporting = true;
    await flush();
    const title = docTitle(st.cur.meta);
    core.clearWidget();
    closeMenu();
    closeSlash();
    hideCtx();
    // No text cursor or selection highlight in the PDF; put them back afterwards.
    const hadFocus = el.doc.contains(document.activeElement);
    core.rememberSelection();
    window.getSelection().removeAllRanges();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const style = document.createElement('style');
    style.id = 'ed-print-css';
    style.textContent = printCSS(st.cur.meta);
    document.head.appendChild(style);
    document.body.classList.add('print-doc');
    const prevTitle = document.title;
    document.title = title;
    try {
      await document.fonts.ready;
      await waitForImages();
      if (desktop && desktop.exportPDF) {
        setStatus('saving');
        el.status.textContent = E('Creating PDF…');
        const res = await desktop.exportPDF({ filename: fileName(title) + '.pdf' });
        if (res && res.ok) {
          ui.toast(E('PDF saved: {name}', { name: res.path.split(/[\\/]/).pop() }), 'success', 9000, { label: E('Open'), fn: () => desktop.openPath(res.path) });
        } else if (res && !res.canceled) ui.toast(E('PDF export failed: {reason}', { reason: res.error || E('unknown error') }), 'error', 9000);
      } else {
        window.print();
      }
    } catch (e) {
      ui.toast(E('PDF export failed: {reason}', { reason: e.message }), 'error', 9000);
    } finally {
      style.remove();
      document.body.classList.remove('print-doc');
      document.title = prevTitle;
      setStatus(st.dirty ? 'dirty' : 'saved');
      exporting = false;
      if (hadFocus) core.restore();
    }
  }
  async function exportPDFOf(id) {
    if (!st.cur || st.cur.id !== id) {
      location.hash = '#/editor?doc=' + id;
      await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < 60 && !(st.cur && st.cur.id === id); i++) await new Promise((r) => setTimeout(r, 50));
    }
    exportPDF();
  }
  async function exportMarkdown(id) {
    if (st.cur && st.cur.id === id) await flush();
    const d = await DS.get(id);
    if (!d) return;
    const md = await T4.edmd.toMarkdown(d.html, { title: d.meta.title });
    U.download(fileName(docTitle(d.meta)) + '.md', md, 'text/markdown');
    ui.toast(E('Markdown file exported'));
  }
  async function exportJSON(ids) {
    if (st.cur && ids && ids.includes(st.cur.id)) await flush();
    const bundle = await DS.exportBundle(ids);
    const name = ids && ids.length === 1 ? fileName(docTitle(bundle.documents[0])) + '.todo4me-doc.json' : 'todo4me-documents-' + U.today() + '.json';
    U.download(name, JSON.stringify(bundle), 'application/json');
    ui.toast(ids && ids.length === 1 ? E('Document exported') : tt('ed.docsExported', { count: bundle.documents.length }));
  }
  async function importFiles(files) {
    await boot();
    let created = 0, last = null;
    for (const f of files) {
      try {
        if (f.size > 200 * 1024 * 1024) throw new Error(E('file is too large'));
        const text = await f.text();
        const base = f.name.replace(/\.(md|markdown|txt|html?|json|todo4me-doc\.json)$/i, '').replace(/\.todo4me-doc$/i, '');
        if (/\.json$/i.test(f.name)) {
          const n = await DS.importBundle(DS.parseBundle(text));
          created += n;
        } else {
          const isHtml = /\.html?$/i.test(f.name) || /^\s*<(!doctype|html|body|p|div|h\d)\b/i.test(text);
          let html = isHtml ? text : T4.edmd.fromMarkdown(text);
          let title = base;
          // A leading "# Title" becomes the document title.
          const m = !isHtml && text.match(/^\s*#\s+(.+)\n/);
          if (m) { title = m[1].trim(); html = T4.edmd.fromMarkdown(text.replace(/^\s*#\s+.+\n/, '')); }
          const clean = await sanitizeWithImages(html);
          const meta = await DS.create(Object.assign({ title, html: clean }, core.statsOf(clean)));
          created++;
          last = meta.id;
        }
      } catch (e) {
        ui.toast(E('Could not import {name}: {reason}', { name: f.name, reason: e.message }), 'error', 8000);
      }
    }
    if (created) {
      await refreshDocs();
      ui.toast(tt('ed.docsImported', { count: created }));
      if (last && files.length === 1) location.hash = '#/editor?doc=' + last;
    }
  }
  /** Sanitize imported HTML; embedded data-URL images become stored image assets. */
  async function sanitizeWithImages(html) {
    const pending = [];
    const frag = SAN.sanitize(html, { onImage: (url, alt) => { const ph = document.createElement('figure'); ph.className = 't4-w'; ph.setAttribute('data-w', 'img'); pending.push({ ph, url, alt }); return ph; } });
    for (const p of pending) {
      try {
        const id = await DS.putAsset(await W.prepareImage(await DS.dataURLToBlob(p.url)));
        p.ph.setAttribute('data-p', JSON.stringify({ a: id, w: 100, al: 'center', alt: p.alt }));
      } catch (e) { p.ph.remove(); }
    }
    const d = document.createElement('div');
    d.appendChild(frag);
    return d.innerHTML;
  }

  /* ====================== Templates ====================== */
  function templateContent(id) {
    const wHTML = (type, props, inline) => W.create(type, props, inline).outerHTML;
    const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date());
    if (id === 'meeting') {
      return { title: 'Meeting notes', html:
        '<p><strong>Date:</strong> ' + esc(today) + '<br><strong>Participants:</strong> </p>' +
        '<h2>Agenda</h2><ol><li>Status update</li><li>Open questions</li><li>Next steps</li></ol>' +
        '<h2>Notes</h2><p><br></p>' +
        '<h2>Decisions</h2><ul><li><br></li></ul>' +
        '<h2>Action items</h2><table class="t4-table"><thead><tr><th>Task</th><th>Owner</th><th>Due</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>' };
    }
    if (id === 'report') {
      return { title: 'Report', html:
        '<h1>Report title</h1><p style="color: #7a7f8c">' + esc(today) + '</p>' +
        '<h2>Summary</h2><p>Write a short summary of the key findings here.</p>' +
        '<h2>Results</h2><p>Describe the results. The chart and table below can be edited — double-click the chart to change its data.</p>' +
        wHTML('chart', W.defaultChart('bar')) +
        '<table class="t4-table"><thead><tr><th>Quarter</th><th>Revenue</th><th>Costs</th></tr></thead><tbody><tr><td>Q1</td><td>12</td><td>9</td></tr><tr><td>Q2</td><td>19</td><td>11</td></tr><tr><td>Q3</td><td>15</td><td>10</td></tr><tr><td>Q4</td><td>24</td><td>14</td></tr></tbody></table>' +
        '<h2>Next steps</h2><ul><li>First recommendation</li><li>Second recommendation</li></ul>' };
    }
    // Feature tour
    return { title: 'Feature tour', html:
      '<h1>Welcome to the Todo4Me editor</h1>' +
      '<p>This document shows what the editor can do. Everything here is editable — try it out, then delete this document or keep it as a reference.</p>' +
      '<h2>Text formatting</h2>' +
      '<p>Make text <strong>bold</strong>, <em>italic</em>, <u>underlined</u> or <s>struck through</s>, <span style="background-color: #fff176">highlight it</span>, change its <span style="color: #2f6fed">color</span>, ' +
        '<span style="font-family: ' + esc(SAN.FONT_STACK.Georgia) + '">font</span> or <span style="font-size: 14pt">size</span>. Use x<sup>2</sup> and H<sub>2</sub>O for super- and subscript.</p>' +
      '<p style="text-align: center">Paragraphs can be centered, aligned right or justified.</p>' +
      '<blockquote><p>“Quotes stand out from the rest of the text.”</p></blockquote>' +
      '<h2>Lists</h2><ul><li>Bulleted lists</li><li>with several items<ul><li>and nested levels (Tab / Shift+Tab)</li></ul></li></ul><ol><li>Numbered lists</li><li>count automatically</li></ol>' +
      '<h2>Markdown shortcuts</h2><p>Type <code># </code> for a heading, <code>- </code> for a list, <code>&gt; </code> for a quote, <code>**bold**</code>, <code>*italic*</code>, <code>`code`</code> or <code>```</code> + Enter for a code block. Type <code>/</code> on an empty line to insert any element.</p>' +
      '<h2>Formulas</h2><p>Inline formulas like ' + wHTML('math', { tex: 'E = mc^2' }, true) + ' sit in the text. Block formulas get their own line:</p>' +
      wHTML('math', { tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\qquad \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} \\qquad \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}' }) +
      '<h2>Code</h2>' +
      wHTML('code', { lang: 'javascript', code: '// Code blocks use Fira Code and syntax highlighting\nfunction greet(name) {\n  const message = `Hello, ${name}!`;\n  return message.length > 0 ? message : null;\n}' }) +
      '<h2>Tables</h2><table class="t4-table"><thead><tr><th>Feature</th><th>Shortcut</th></tr></thead><tbody><tr><td>Bold</td><td>Ctrl+B</td></tr><tr><td>Link</td><td>Ctrl+K</td></tr><tr><td>Formula</td><td>Ctrl+M</td></tr><tr><td>Page break</td><td>Ctrl+Enter</td></tr></tbody></table>' +
      '<h2>Charts</h2>' + wHTML('chart', Object.assign(W.defaultChart('line'), { title: 'Weekly progress' })) +
      '<h2>Shapes</h2><p>Click a shape to select it, drag to move, use the handles to resize.</p>' +
      wHTML('draw', { h: 200, shapes: [
        { id: 's1', t: 'round', x: 30, y: 50, w: 150, h: 90, fill: '#dbe4ff', stroke: '#4f6bed', sw: 2, text: 'Idea' },
        { id: 's2', t: 'arrow', x: 190, y: 95, w: 90, h: 0, stroke: '#3b4252', sw: 3 },
        { id: 's3', t: 'diamond', x: 290, y: 30, w: 140, h: 130, fill: '#fbefd2', stroke: '#c98a12', sw: 2, text: 'Decide' },
        { id: 's4', t: 'arrow', x: 440, y: 95, w: 70, h: 0, stroke: '#3b4252', sw: 3 },
        { id: 's5', t: 'ellipse', x: 520, y: 50, w: 90, h: 90, fill: '#d9f2e1', stroke: '#2f9e55', sw: 2, text: 'Done' },
      ] }) +
      '<h2>Export</h2><p>Use <strong>Export PDF</strong> at the top right. Page size, margins, header, footer and page numbers are set in <strong>File → Page setup</strong>.</p>' };
  }

  /* ====================== Settings card ====================== */
  const baseSettings = T4.views.settings.render;
  T4.views.settings.render = function () {
    const html = baseSettings.apply(this, arguments);
    const card = '<section class="card settings__section"><h2 class="card__title">' + esc(E('Documents (Editor)')) + '</h2>' +
      '<p class="muted small" id="docs-usage">' + esc(E(desktop ? 'Documents are stored separately from your tasks and notes, in this computer’s app data.' : 'Documents are stored separately from your tasks and notes, in this browser’s IndexedDB.')) + '</p>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn" data-action="docs-export">' + icon('download') + esc(E('Export all documents')) + '</button>' +
        '<button type="button" class="btn" data-action="docs-import">' + icon('upload') + esc(E('Import documents')) + '</button>' +
        '<a class="btn btn--ghost" href="#/editor">' + icon('doc') + esc(E('Open editor')) + '</a>' +
      '</div></section>';
    const i = html.lastIndexOf('</div>');
    setTimeout(fillUsage, 0);
    return i === -1 ? html + card : html.slice(0, i) + card + html.slice(i);
  };
  function fillUsage() {
    DS.usage().then((u) => {
      const elU = document.getElementById('docs-usage');
      if (!elU) return;
      elU.textContent = tt('ed.usageDocs', { count: u.docs }) + (u.trashed ? ' ' + E('(+{n} in trash)', { n: u.trashed }) : '') + ', ' + tt('ed.usageImages', { count: u.images }) + ' (' + T4.i18n.fmtNumber(u.imageBytes / 1048576, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' MB). ' +
        E(desktop ? 'Stored separately from your tasks and notes on this computer, with a daily backup file.' : 'Stored separately from your tasks and notes in this browser — export them regularly.');
    }).catch(() => {});
  }
  ui.on('docs-export', () => boot().then(() => exportJSON(null)));
  ui.on('docs-import', () => { if (!shell) buildShell(); el.fileImport.click(); });
  ui.on('new-document', () => newDocument());
  ui.on('export-pdf', () => { if (T4.app.route.name === 'editor' && st.cur) exportPDF(); else ui.toast(E('Open a document in the Editor to export it as PDF.'), 'info'); });

  // Browser tab: make sure nothing typed in the last second is lost when the tab closes.
  window.addEventListener('pagehide', () => { if (st.dirty) doSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  if (!desktop) {
    window.addEventListener('beforeunload', (e) => { if (st.dirty || saver.running) { doSave(); e.preventDefault(); e.returnValue = ''; } });
  }

  return {
    flush, newDocument, exportPDF, openDoc, boot,
    get current() { return st.cur; },
    get isDirty() { return st.dirty; },
    get hasFocus() { return !!(shell && shell.contains(document.activeElement)); },
    _printCSS: printCSS,
  };
})();
