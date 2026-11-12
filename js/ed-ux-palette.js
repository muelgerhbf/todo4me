/* Todo4Me editor module "ux": command palette (Ctrl+Shift+P) and keyboard shortcuts dialog (Ctrl+/). */
(function () {
  'use strict';
  const X = T4.edx, UX = T4.edux;
  const { t, esc, icon, fmtKey } = UX;
  const RECENT_KEY = 'todo4me.ux.recent';
  const P = { el: null, input: null, list: null, live: null, items: [], i: 0, all: [], prevFocus: null };

  const recent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 12) : []; } catch (e) { return []; } };
  function remember(id) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([id].concat(recent().filter((x) => x !== id)).slice(0, 12))); } catch (e) { /* private mode */ }
  }

  /** Fuzzy score of query tokens in text: substring beats subsequence; -1 = no match. */
  function score(q, text) {
    text = text.toLowerCase();
    let total = 0;
    for (const tok of q.split(/\s+/).filter(Boolean)) {
      const i = text.indexOf(tok);
      if (i >= 0) { total += 100 - Math.min(i, 50) + (i === 0 || /[^a-z0-9]/.test(text[i - 1]) ? 30 : 0); continue; }
      let pos = 0, last = -2, s = 0;
      for (const ch of tok) {
        const j = text.indexOf(ch, pos);
        if (j < 0) return -1;
        s += j === last + 1 ? 8 : 2;
        if (j === 0 || /[^a-z0-9]/.test(text[j - 1])) s += 5;
        last = j; pos = j + 1;
      }
      total += s;
    }
    return total;
  }

  function collect() {
    const cur = X.editor.current();
    const out = X.commands.list().filter((c) => c.enabled && c.label).map((c) => ({ id: c.id, kind: 'cmd', label: c.label, group: c.group, kbd: c.kbd, icon: c.icon || 'sparkle' }));
    let docs = [];
    try { docs = X.editor.cachedDocs(); } catch (e) { docs = []; }
    docs.filter((d) => !d.deletedAt && !(cur && cur.id === d.id)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).forEach((d) => {
      const title = d.title || (d.text ? String(d.text).slice(0, 40) : '') || t('untitled', 'Untitled');
      out.push({ id: 'doc:' + d.id, kind: 'doc', docId: d.id, label: t('palette.open', 'Open document: {title}', { title }), match: title + ' ' + t('palette.docs', 'Documents'), group: t('palette.docs', 'Documents'), icon: 'doc', kbd: '' });
    });
    return out;
  }
  function filter(q) {
    const rec = recent();
    q = q.trim().toLowerCase();
    if (!q) {
      const byId = new Map(P.all.map((e) => [e.id, e]));
      const head = rec.map((id) => byId.get(id)).filter(Boolean).map((e) => Object.assign({}, e, { section: t('palette.recent', 'Recent') }));
      const seen = new Set(head.map((e) => e.id));
      let docs = 0;
      const rest = P.all.filter((e) => !seen.has(e.id)).filter((e) => e.kind !== 'doc' || ++docs <= 8).map((e) => Object.assign({}, e, { section: e.group }));
      return head.concat(rest);
    }
    return P.all.map((e) => {
      let s = score(q, e.match || e.label);
      if (s < 0) { const g = score(q, (e.match || e.label) + ' ' + (e.group || '')); s = g < 0 ? -1 : g - 40; }
      if (s >= 0) { const r = rec.indexOf(e.id); if (r >= 0) s += 60 - r * 4; }
      return { e, s };
    }).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.e);
  }

  function paint() {
    const q = P.input.value;
    P.items = filter(q);
    if (P.i >= P.items.length) P.i = 0;
    let last = null;
    P.list.innerHTML = P.items.map((e, i) => {
      const head = !q.trim() && e.section && e.section !== last ? '<div class="ed-ux-pal__head" role="presentation">' + esc(e.section) + '</div>' : '';
      last = e.section;
      return head + '<div class="ed-ux-pal__opt' + (i === P.i ? ' is-active' : '') + '" role="option" id="ed-ux-pal-o' + i + '" data-i="' + i + '" aria-selected="' + (i === P.i) + '">' +
        '<span class="ed-ux-pal__ic">' + icon(e.icon) + '</span><span class="ed-ux-pal__lb">' + esc(e.label) + '</span>' +
        (q.trim() && e.group ? '<span class="ed-ux-pal__grp">' + esc(e.group) + '</span>' : '') + (e.kbd ? '<kbd>' + esc(e.kbd) + '</kbd>' : '') + '</div>';
    }).join('') || '<div class="ed-ux-pal__empty" role="presentation">' + esc(t('palette.none', 'No matching command')) + '</div>';
    activate(P.i, false);
    P.live.textContent = P.items.length ? t('palette.count', '{n} results', { n: P.items.length }) : t('palette.none', 'No matching command');
  }
  function activate(i, scroll) {
    P.i = i;
    P.list.querySelectorAll('.ed-ux-pal__opt').forEach((o) => { const on = +o.dataset.i === i; o.classList.toggle('is-active', on); o.setAttribute('aria-selected', String(on)); if (on && scroll !== false) o.scrollIntoView({ block: 'nearest' }); });
    const o = P.list.querySelector('.is-active');
    if (o) P.input.setAttribute('aria-activedescendant', o.id); else P.input.removeAttribute('aria-activedescendant');
  }
  function close(restore) {
    if (!P.el) return;
    P.el.remove();
    P.el = null;
    window.removeEventListener('hashchange', onHash);
    if (restore !== false) {
      if (UX.hasDoc() && UX.rootEl()) X.editor.restore();
      else if (P.prevFocus && document.contains(P.prevFocus)) P.prevFocus.focus();
    }
  }
  const onHash = () => close(false);
  function runItem(i) {
    const e = P.items[i];
    if (!e) return;
    close();
    remember(e.id);
    setTimeout(() => { if (e.kind === 'doc') X.editor.openDoc(e.docId); else X.commands.run(e.id); }, 0);
  }
  function open() {
    if (P.el) { close(); return; }
    UX.hideFloat();
    X.editor.closeMenu();
    P.prevFocus = document.activeElement;
    P.all = collect();
    const el = document.createElement('div');
    el.className = 'ed-ui ed-ux-pal';
    el.innerHTML = '<div class="ed-ux-pal__box" role="dialog" aria-modal="true" aria-label="' + esc(t('palette', 'Command palette')) + '">' +
      '<input class="ed-ux-pal__input" type="text" role="combobox" aria-expanded="true" aria-controls="ed-ux-pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="' + esc(t('palette.ph', 'Type a command or document…')) + '" aria-label="' + esc(t('palette', 'Command palette')) + '">' +
      '<div class="ed-ux-pal__list" id="ed-ux-pal-list" role="listbox" aria-label="' + esc(t('palette', 'Command palette')) + '"></div>' +
      '<div class="ed-ux-pal__foot">' + esc(t('palette.hint', '↑↓ select · Enter run · Esc close')) + '</div>' +
      '<div class="sr-only" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(el);
    P.el = el; P.input = el.querySelector('input'); P.list = el.querySelector('.ed-ux-pal__list'); P.live = el.querySelector('[role="status"]'); P.i = 0;
    el.addEventListener('mousedown', (e) => { if (e.target === el) { e.preventDefault(); close(); } else if (!e.target.closest('input')) e.preventDefault(); });
    P.list.addEventListener('click', (e) => { const o = e.target.closest('.ed-ux-pal__opt'); if (o) runItem(+o.dataset.i); });
    P.list.addEventListener('mousemove', (e) => { const o = e.target.closest('.ed-ux-pal__opt'); if (o && +o.dataset.i !== P.i) activate(+o.dataset.i, false); });
    P.input.addEventListener('input', () => { P.i = 0; paint(); });
    P.input.addEventListener('keydown', (e) => {
      const n = P.items.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (n) activate((P.i + 1) % n); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) activate((P.i - 1 + n) % n); }
      else if (e.key === 'PageDown') { e.preventDefault(); if (n) activate(Math.min(n - 1, P.i + 6)); }
      else if (e.key === 'PageUp') { e.preventDefault(); if (n) activate(Math.max(0, P.i - 6)); }
      else if (e.key === 'Enter') { e.preventDefault(); runItem(P.i); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') e.preventDefault();
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); close(); }
    });
    window.addEventListener('hashchange', onHash);
    paint();
    P.input.focus();
    try { X.editor.ready().then(() => { if (P.el) { P.all = collect(); paint(); } }); } catch (e) { /* editor not booted */ }
  }

  /* ====================== Keyboard shortcuts dialog ====================== */
  const BUILTIN = [
    ['sc.text', [['c.bold', 'Ctrl+B'], ['c.italic', 'Ctrl+I'], ['c.underline', 'Ctrl+U'], ['c.strike', 'Ctrl+Shift+X'], ['c.link', 'Ctrl+K'], ['sc.sup', 'Ctrl+.'], ['sc.sub', 'Ctrl+,'], ['c.clear', 'Ctrl+\\'],
      ['sc.alignl', 'Ctrl+Shift+L'], ['sc.alignc', 'Ctrl+E'], ['sc.alignr', 'Ctrl+Shift+R'], ['sc.alignj', 'Ctrl+Shift+J']]],
    ['sc.blocks', [['sc.heading', 'Alt+0 … Alt+6'], ['c.ul', 'Ctrl+Shift+8'], ['c.ol', 'Ctrl+Shift+7'], ['sc.indent', 'Tab'], ['sc.outdent', 'Shift+Tab'], ['sc.pagebreak', 'Ctrl+Enter'], ['sc.formula', 'Ctrl+M'], ['sc.slash', '/']]],
    ['sc.edit', [['c.undo', 'Ctrl+Z'], ['c.redo', 'Ctrl+Y'], ['sc.cut', 'Ctrl+X'], ['sc.copy', 'Ctrl+C'], ['sc.paste', 'Ctrl+V'], ['sc.pastep', 'Ctrl+Shift+V'], ['sc.all', 'Ctrl+A'], ['sc.ctxmenu', 'Shift+F10']]],
    ['sc.app', [['c.new', 'Ctrl+Alt+N'], ['sc.save', 'Ctrl+S'], ['sc.print', 'Ctrl+P'], ['sc.zoom', 'Ctrl + / Ctrl −']]],
  ];
  function shortcutsDialog() {
    if (P.el) close(false);
    const groups = BUILTIN.map(([g, rows]) => ({ title: t(g), rows: rows.map(([k, c]) => [t(k), c]) }));
    const byGroup = new Map();
    const cmds = new Map(X.commands.list().map((c) => [c.id, c]));
    X.shortcuts.list().forEach((s) => {
      const c = cmds.get(s.command);
      if (!c) return;
      const g = c.group || t('sc.more', 'More');
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push([c.label, s.label]);
    });
    byGroup.forEach((rows, g) => groups.push({ title: g, rows }));
    const body = '<div class="ed-ux-sc">' + groups.map((g) => '<section class="ed-ux-sc__g"><h3>' + esc(g.title) + '</h3><ul>' +
      g.rows.map(([l, k]) => '<li><span>' + esc(l) + '</span><kbd>' + esc(fmtKey(k)) + '</kbd></li>').join('') + '</ul></section>').join('') + '</div>';
    T4.ui.openModal({ title: t('sc.title', 'Keyboard shortcuts'), body, size: 'lg' });
  }

  UX.cmd('palette', { labelKey: 'edx.ux.palette', icon: 'ux-command', order: 0, global: true, readonlyOk: true, run: open });
  X.shortcuts.add('mod-shift-p', 'ux.palette');
  UX.cmd('shortcuts', { icon: 'ux-keyboard', order: 80, global: true, readonlyOk: true, run: shortcutsDialog });
  X.shortcuts.add('mod-/', 'ux.shortcuts');
  UX.palette = { open, close, score, filter: (q) => { P.all = collect(); return filter(q); }, isOpen: () => !!P.el };

  // Ctrl+Shift+P also works when the focus is not inside the editor shell (e.g. right after opening a document).
  document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'KeyP') return;
  if (!UX.hasDoc() || (e.target.closest && e.target.closest('dialog')) || UX.palette.isOpen()) return;
  e.preventDefault();
  UX.palette.open();
});
})();
