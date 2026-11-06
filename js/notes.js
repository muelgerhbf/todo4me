/* Todo4Me — Weekly notes: ideas, reminders and plans grouped by week. */
T4.notes = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);

  const filters = { q: '', tag: '', scope: 'all' };

  const sortNotes = (list) => list.slice().sort((a, b) => (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  function notesForWeek(ws) {
    return sortNotes(store.data.notes.filter((n) => store.weekStartOf(n.weekOf) === ws));
  }

  function matches(n) {
    if (filters.tag && !n.tags.includes(filters.tag)) return false;
    if (!filters.q) return true;
    const q = filters.q.toLowerCase().replace(/^#/, '');
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((g) => g.includes(q));
  }

  function card(n) {
    return '<article class="note-card' + (n.pinned ? ' is-pinned' : '') + '">' +
      '<div class="note-card__head">' +
        '<h3 class="note-card__title"><button type="button" class="link-plain" data-action="edit-note" data-id="' + n.id + '">' + esc(n.title || tt('nt.untitled')) + '</button></h3>' +
        '<button type="button" class="icon-btn icon-btn--sm' + (n.pinned ? ' is-on' : '') + '" data-action="pin-note" data-id="' + n.id + '" aria-pressed="' + n.pinned + '" aria-label="' + esc(tt(n.pinned ? 'nt.unpin' : 'nt.pin')) + '" title="' + esc(tt(n.pinned ? 'nt.unpinTip' : 'nt.pinTip')) + '">' + icon('pin') + '</button>' +
      '</div>' +
      (n.body ? '<div class="note-card__body">' + U.escMultiline(n.body) + '</div>' : '') +
      '<div class="note-card__foot">' +
        '<span class="note-card__tags">' + n.tags.map((g) => '<button type="button" class="chip chip--tag" data-action="note-tag" data-tag="' + esc(g) + '">#' + esc(g) + '</button>').join('') + '</span>' +
        '<span class="note-card__actions">' +
          '<button type="button" class="icon-btn icon-btn--sm" data-action="edit-note" data-id="' + n.id + '" aria-label="' + esc(tt('nt.edit')) + '" title="' + esc(tt('c.edit')) + '">' + icon('edit') + '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-note" data-id="' + n.id + '" aria-label="' + esc(tt('nt.delete')) + '" title="' + esc(tt('c.delete')) + '">' + icon('trash') + '</button>' +
        '</span>' +
      '</div></article>';
  }

  /* ---------- Editor ---------- */
  function openEditor(note, defaults) {
    const n = note || Object.assign({ title: '', body: '', tags: [], pinned: false, weekOf: store.weekStartOf(U.today()) }, defaults || {});
    const weekLabel = (d) => tt('nt.weekOf', { date: U.weekRangeLabel(store.weekStartOf(d)) });
    ui.openModal({
      title: tt(note ? 'nt.edit' : 'nt.newTitle'),
      body: '<form id="note-form" class="form" novalidate>' +
        '<div class="field"><label for="nf-title">' + esc(tt('nt.fTitle')) + '</label><input id="nf-title" name="title" type="text" maxlength="300" value="' + esc(n.title) + '" placeholder="' + esc(tt('nt.fTitlePh')) + '" autofocus></div>' +
        '<div class="field"><label for="nf-body">' + esc(tt('nt.fNote')) + '</label><textarea id="nf-body" name="body" rows="8" placeholder="' + esc(tt('nt.fNotePh')) + '">' + esc(n.body) + '</textarea>' +
          '<p class="field__error" id="nf-err" hidden>' + esc(tt('nt.err')) + '</p></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label for="nf-week">' + esc(tt('nt.fWeek')) + '</label><input id="nf-week" name="weekOf" type="date" value="' + esc(n.weekOf) + '" required>' +
            '<p class="field__help" id="nf-week-label">' + esc(weekLabel(n.weekOf)) + '</p></div>' +
          '<div class="field"><label for="nf-tags">' + esc(tt('tk.fTags')) + ' <span class="muted">' + esc(tt('tk.commaSeparated')) + '</span></label><input id="nf-tags" name="tags" type="text" value="' + esc(n.tags.join(', ')) + '" placeholder="' + esc(tt('nt.fTagsPh')) + '"></div>' +
        '</div>' +
        '<label class="checkbox"><input type="checkbox" name="pinned"' + (n.pinned ? ' checked' : '') + '><span>' + icon('pin') + esc(tt('nt.pinImportant')) + '</span></label>' +
        (note ? '<p class="meta-line">' + esc(tt('nt.meta', { created: U.fmtDateTime(n.createdAt), updated: U.fmtDateTime(n.updatedAt) })) + '</p>' : '') +
        '</form>',
      footer: (note ? '<button type="button" class="btn btn--ghost btn--danger-text mr-auto" id="nf-delete">' + icon('trash') + esc(tt('c.delete')) + '</button>' : '') +
        '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(tt('c.cancel')) + '</button>' +
        '<button type="submit" class="btn btn--primary" form="note-form">' + esc(tt(note ? 'tk.saveChanges' : 'nt.add')) + ' <kbd>Ctrl ↵</kbd></button>',
      size: 'lg',
      onMount(m) {
        const form = m.querySelector('#note-form');
        const week = m.querySelector('#nf-week');
        week.addEventListener('change', () => {
          m.querySelector('#nf-week-label').textContent = U.isDateStr(week.value) ? weekLabel(week.value) : tt('nt.pickDay');
        });
        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const fields = {
            title: String(fd.get('title') || '').trim(),
            body: String(fd.get('body') || ''),
            weekOf: U.isDateStr(fd.get('weekOf')) ? store.weekStartOf(fd.get('weekOf')) : store.weekStartOf(U.today()),
            tags: U.parseTags(fd.get('tags')),
            pinned: fd.get('pinned') === 'on',
          };
          if (!fields.title && !fields.body.trim()) {
            m.querySelector('#nf-err').hidden = false;
            m.querySelector('#nf-title').focus();
            return;
          }
          if (note) store.updateNote(note.id, fields); else store.addNote(fields);
          ui.closeModal(true);
          ui.toast(note ? tt('nt.updated') : fields.weekOf === store.weekStartOf(U.today()) ? tt('nt.addedThisWeek') : tt('nt.addedWeek', { date: U.fmt(fields.weekOf, { month: 'short', day: 'numeric' }) }));
        });
        const del = m.querySelector('#nf-delete');
        if (del) del.addEventListener('click', () => confirmDelete(note.id, true));
      },
    });
  }

  async function confirmDelete(id, fromModal) {
    const n = store.getNote(id);
    if (!n) return;
    const ok = await ui.confirm({ title: tt('nt.deleteTitle'), message: tt('tk.deleteMsg', { title: n.title || tt('nt.untitled') }), confirmText: tt('c.delete'), danger: true });
    if (!ok) return;
    if (fromModal) ui.closeModal(true);
    const snapshot = Object.assign({}, n);
    store.deleteNote(id);
    ui.toast(tt('nt.deleted'), 'success', 6000, { label: tt('c.undo'), fn: () => { store.addNote(snapshot); ui.toast(tt('nt.restored')); } });
  }

  ui.on('new-note', (el) => openEditor(null, el && el.dataset.week ? { weekOf: el.dataset.week } : null));
  ui.on('edit-note', (el) => { const n = store.getNote(el.dataset.id); if (n) openEditor(n); });
  ui.on('delete-note', (el) => confirmDelete(el.dataset.id));
  ui.on('pin-note', (el) => {
    const n = store.getNote(el.dataset.id);
    if (!n) return;
    store.updateNote(n.id, { pinned: !n.pinned });
    ui.toast(tt(n.pinned ? 'nt.unpinned' : 'nt.pinned'), 'info');
  });
  ui.on('note-tag', (el) => {
    filters.tag = filters.tag === el.dataset.tag ? '' : el.dataset.tag;
    if (location.hash.indexOf('#/notes') !== 0) location.hash = '#/notes'; else T4.app.render();
  });
  ui.on('submit:quick-note', (form) => {
    const title = form.querySelector('[name="title"]').value.trim();
    const body = form.querySelector('[name="body"]').value;
    if (!title && !body.trim()) { ui.toast(tt('nt.writeFirst'), 'error'); form.querySelector('[name="title"]').focus(); return; }
    store.addNote({ title, body, weekOf: store.weekStartOf(U.today()) });
    ui.toast(tt('nt.addedThisWeek'));
    requestAnimationFrame(() => { const t = document.querySelector('#quick-note [name="title"]'); if (t) t.focus(); });
  });

  /* ---------- View ---------- */
  function renderResults() {
    const thisWeek = store.weekStartOf(U.today());
    const notes = store.data.notes.filter(matches).filter((n) => filters.scope !== 'this' || store.weekStartOf(n.weekOf) === thisWeek)
      .filter((n) => filters.scope !== 'pinned' || n.pinned);
    const groups = {};
    notes.forEach((n) => { const k = store.weekStartOf(n.weekOf); (groups[k] = groups[k] || []).push(n); });
    const filtering = filters.q || filters.tag || filters.scope !== 'all';
    if (!filtering && !groups[thisWeek]) groups[thisWeek] = [];
    const keys = Object.keys(groups).sort().reverse();
    if (!keys.length) return ui.emptyState('search', tt('nt.noMatch'), tt('nt.noMatchText'), '<button type="button" class="btn btn--sm" data-action="clear-note-filters">' + esc(tt('tk.clearFilters')) + '</button>');
    return keys.map((k) => {
      const list = sortNotes(groups[k]);
      const label = k === thisWeek ? tt('nt.thisWeek') : k === U.addDays(thisWeek, -7) ? tt('nt.lastWeek') : k === U.addDays(thisWeek, 7) ? tt('nt.nextWeek') : tt('nt.weekOf', { date: U.fmt(k, { month: 'short', day: 'numeric' }) });
      return '<section class="section week-group"><div class="section__head"><h2 class="section__title">' + esc(label) +
        ' <span class="muted fw-normal small">' + esc(U.weekRangeLabel(k)) + '</span> <span class="count">' + list.length + '</span></h2>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="new-note" data-week="' + k + '">' + icon('plus') + esc(tt('c.add')) + '</button></div>' +
        (list.length ? '<div class="notes-grid">' + list.map(card).join('') + '</div>'
          : '<p class="muted small">' + esc(tt('nt.emptyWeek')) + '</p>') +
        '</section>';
    }).join('');
  }

  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';

  T4.views.notes = {
    get title() { return tt('nav.notes'); },
    render() {
      const tags = Array.from(new Set(store.data.notes.flatMap((n) => n.tags))).sort();
      if (filters.tag && !tags.includes(filters.tag)) filters.tag = '';
      return '<header class="page-head"><div><h1 class="page-title">' + esc(tt('nav.notes')) + '</h1><p class="page-sub">' + esc(tt('nt.sub')) + '</p></div>' +
          '<div class="page-actions"><button type="button" class="btn btn--primary" data-action="new-note">' + icon('plus') + esc(tt('nt.newNote')) + '</button></div></header>' +
        '<form class="card quick-note" id="quick-note" data-form="quick-note">' +
          '<input type="text" name="title" maxlength="300" placeholder="' + esc(tt('nt.noteTitle')) + '" aria-label="' + esc(tt('nt.noteTitle')) + '" autocomplete="off">' +
          '<textarea name="body" rows="2" placeholder="' + esc(tt('nt.quickPh')) + '" aria-label="' + esc(tt('nt.noteText')) + '"></textarea>' +
          '<div class="quick-note__foot"><span class="muted small">' + esc(tt('nt.savedTo', { range: U.weekRangeLabel(store.weekStartOf(U.today())) })) + '</span><button type="submit" class="btn btn--primary btn--sm">' + esc(tt('nt.add')) + '</button></div>' +
        '</form>' +
        '<section class="toolbar" aria-label="' + esc(tt('nt.searchNotes')) + '">' +
          '<label class="search">' + icon('search') + '<span class="sr-only">' + esc(tt('nt.searchNotes')) + '</span><input type="search" data-input="note-filter" data-key="q" value="' + esc(filters.q) + '" placeholder="' + esc(tt('nt.searchPh')) + '"></label>' +
          '<div class="filters">' +
            '<select data-change="note-filter" data-key="scope" aria-label="' + esc(tt('nt.show')) + '">' + opt('all', tt('nt.allWeeks'), filters.scope) + opt('this', tt('nt.thisWeek'), filters.scope) + opt('pinned', tt('nt.pinnedOnly'), filters.scope) + '</select>' +
            (tags.length ? '<select data-change="note-filter" data-key="tag" aria-label="' + esc(tt('tk.filterTag')) + '">' + opt('', tt('tk.fAnyTag'), filters.tag) + tags.map((g) => opt(g, '#' + g, filters.tag)).join('') + '</select>' : '') +
          '</div></section>' +
        '<div id="note-results" aria-live="polite">' + renderResults() + '</div>';
    },
  };
  const refresh = () => { const el = document.getElementById('note-results'); if (el) el.innerHTML = renderResults(); };
  const debounced = U.debounce(refresh, 120);
  ui.on('input:note-filter', (el) => { filters[el.dataset.key] = el.value; debounced(); });
  ui.on('change:note-filter', (el) => { filters[el.dataset.key] = el.value; refresh(); });
  ui.on('clear-note-filters', () => { Object.assign(filters, { q: '', tag: '', scope: 'all' }); T4.app.render(); });

  return { card, notesForWeek, openEditor };
})();
