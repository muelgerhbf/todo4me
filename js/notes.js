/* Todo4Me — Weekly notes: ideas, reminders and plans grouped by week. */
T4.notes = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;

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
        '<h3 class="note-card__title"><button type="button" class="link-plain" data-action="edit-note" data-id="' + n.id + '">' + esc(n.title || 'Untitled note') + '</button></h3>' +
        '<button type="button" class="icon-btn icon-btn--sm' + (n.pinned ? ' is-on' : '') + '" data-action="pin-note" data-id="' + n.id + '" aria-pressed="' + n.pinned + '" aria-label="' + (n.pinned ? 'Unpin' : 'Pin') + ' note" title="' + (n.pinned ? 'Unpin' : 'Pin as important') + '">' + icon('pin') + '</button>' +
      '</div>' +
      (n.body ? '<div class="note-card__body">' + U.escMultiline(n.body) + '</div>' : '') +
      '<div class="note-card__foot">' +
        '<span class="note-card__tags">' + n.tags.map((g) => '<button type="button" class="chip chip--tag" data-action="note-tag" data-tag="' + esc(g) + '">#' + esc(g) + '</button>').join('') + '</span>' +
        '<span class="note-card__actions">' +
          '<button type="button" class="icon-btn icon-btn--sm" data-action="edit-note" data-id="' + n.id + '" aria-label="Edit note" title="Edit">' + icon('edit') + '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete-note" data-id="' + n.id + '" aria-label="Delete note" title="Delete">' + icon('trash') + '</button>' +
        '</span>' +
      '</div></article>';
  }

  /* ---------- Editor ---------- */
  function openEditor(note, defaults) {
    const n = note || Object.assign({ title: '', body: '', tags: [], pinned: false, weekOf: store.weekStartOf(U.today()) }, defaults || {});
    const weekLabel = (d) => 'Week of ' + U.weekRangeLabel(store.weekStartOf(d));
    ui.openModal({
      title: note ? 'Edit note' : 'New weekly note',
      body: '<form id="note-form" class="form" novalidate>' +
        '<div class="field"><label for="nf-title">Title</label><input id="nf-title" name="title" type="text" maxlength="300" value="' + esc(n.title) + '" placeholder="e.g. Ideas for the product launch" autofocus></div>' +
        '<div class="field"><label for="nf-body">Note</label><textarea id="nf-body" name="body" rows="8" placeholder="Thoughts, ideas, reminders…">' + esc(n.body) + '</textarea>' +
          '<p class="field__error" id="nf-err" hidden>Please add a title or some text.</p></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label for="nf-week">Week</label><input id="nf-week" name="weekOf" type="date" value="' + esc(n.weekOf) + '" required>' +
            '<p class="field__help" id="nf-week-label">' + esc(weekLabel(n.weekOf)) + '</p></div>' +
          '<div class="field"><label for="nf-tags">Tags <span class="muted">(comma separated)</span></label><input id="nf-tags" name="tags" type="text" value="' + esc(n.tags.join(', ')) + '" placeholder="e.g. ideas, meeting"></div>' +
        '</div>' +
        '<label class="checkbox"><input type="checkbox" name="pinned"' + (n.pinned ? ' checked' : '') + '><span>' + icon('pin') + 'Pin as important</span></label>' +
        (note ? '<p class="meta-line">Created ' + esc(U.fmtDateTime(n.createdAt)) + ' · Updated ' + esc(U.fmtDateTime(n.updatedAt)) + '</p>' : '') +
        '</form>',
      footer: (note ? '<button type="button" class="btn btn--ghost btn--danger-text mr-auto" id="nf-delete">' + icon('trash') + 'Delete</button>' : '') +
        '<button type="button" class="btn btn--ghost" data-action="modal-close">Cancel</button>' +
        '<button type="submit" class="btn btn--primary" form="note-form">' + (note ? 'Save changes' : 'Add note') + ' <kbd>Ctrl ↵</kbd></button>',
      size: 'lg',
      onMount(m) {
        const form = m.querySelector('#note-form');
        const week = m.querySelector('#nf-week');
        week.addEventListener('change', () => {
          m.querySelector('#nf-week-label').textContent = U.isDateStr(week.value) ? weekLabel(week.value) : 'Pick any day in the week';
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
          ui.toast(note ? 'Note updated' : 'Note added to ' + (fields.weekOf === store.weekStartOf(U.today()) ? 'this week' : 'week of ' + U.fmt(fields.weekOf, { month: 'short', day: 'numeric' })));
        });
        const del = m.querySelector('#nf-delete');
        if (del) del.addEventListener('click', () => confirmDelete(note.id, true));
      },
    });
  }

  async function confirmDelete(id, fromModal) {
    const n = store.getNote(id);
    if (!n) return;
    const ok = await ui.confirm({ title: 'Delete note?', message: '"' + (n.title || 'Untitled note') + '" will be permanently deleted.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    if (fromModal) ui.closeModal(true);
    const snapshot = Object.assign({}, n);
    store.deleteNote(id);
    ui.toast('Note deleted', 'success', 6000, { label: 'Undo', fn: () => { store.addNote(snapshot); ui.toast('Note restored'); } });
  }

  ui.on('new-note', (el) => openEditor(null, el && el.dataset.week ? { weekOf: el.dataset.week } : null));
  ui.on('edit-note', (el) => { const n = store.getNote(el.dataset.id); if (n) openEditor(n); });
  ui.on('delete-note', (el) => confirmDelete(el.dataset.id));
  ui.on('pin-note', (el) => {
    const n = store.getNote(el.dataset.id);
    if (!n) return;
    store.updateNote(n.id, { pinned: !n.pinned });
    ui.toast(n.pinned ? 'Note unpinned' : 'Note pinned', 'info');
  });
  ui.on('note-tag', (el) => {
    filters.tag = filters.tag === el.dataset.tag ? '' : el.dataset.tag;
    if (location.hash.indexOf('#/notes') !== 0) location.hash = '#/notes'; else T4.app.render();
  });
  ui.on('submit:quick-note', (form) => {
    const title = form.querySelector('[name="title"]').value.trim();
    const body = form.querySelector('[name="body"]').value;
    if (!title && !body.trim()) { ui.toast('Write a title or some text first.', 'error'); form.querySelector('[name="title"]').focus(); return; }
    store.addNote({ title, body, weekOf: store.weekStartOf(U.today()) });
    ui.toast('Note added to this week');
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
    if (!keys.length) return ui.emptyState('search', 'No matching notes', 'Try another search, tag or filter.', '<button type="button" class="btn btn--sm" data-action="clear-note-filters">Clear filters</button>');
    return keys.map((k) => {
      const list = sortNotes(groups[k]);
      const label = k === thisWeek ? 'This week' : k === U.addDays(thisWeek, -7) ? 'Last week' : k === U.addDays(thisWeek, 7) ? 'Next week' : 'Week of ' + U.fmt(k, { month: 'short', day: 'numeric' });
      return '<section class="section week-group"><div class="section__head"><h2 class="section__title">' + esc(label) +
        ' <span class="muted fw-normal small">' + esc(U.weekRangeLabel(k)) + '</span> <span class="count">' + list.length + '</span></h2>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="new-note" data-week="' + k + '">' + icon('plus') + 'Add</button></div>' +
        (list.length ? '<div class="notes-grid">' + list.map(card).join('') + '</div>'
          : '<p class="muted small">Nothing noted this week yet. Capture an idea or reminder above.</p>') +
        '</section>';
    }).join('');
  }

  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';

  T4.views.notes = {
    title: 'Weekly Notes',
    render() {
      const tags = Array.from(new Set(store.data.notes.flatMap((n) => n.tags))).sort();
      if (filters.tag && !tags.includes(filters.tag)) filters.tag = '';
      return '<header class="page-head"><div><h1 class="page-title">Weekly Notes</h1><p class="page-sub">Thoughts, ideas and reminders — organized by week. Not everything needs to be a task.</p></div>' +
          '<div class="page-actions"><button type="button" class="btn btn--primary" data-action="new-note">' + icon('plus') + 'New note</button></div></header>' +
        '<form class="card quick-note" id="quick-note" data-form="quick-note">' +
          '<input type="text" name="title" maxlength="300" placeholder="Note title" aria-label="Note title" autocomplete="off">' +
          '<textarea name="body" rows="2" placeholder="Write a thought, idea or reminder for this week…" aria-label="Note text"></textarea>' +
          '<div class="quick-note__foot"><span class="muted small">Saved to this week · ' + esc(U.weekRangeLabel(store.weekStartOf(U.today()))) + '</span><button type="submit" class="btn btn--primary btn--sm">Add note</button></div>' +
        '</form>' +
        '<section class="toolbar" aria-label="Search notes">' +
          '<label class="search">' + icon('search') + '<span class="sr-only">Search notes</span><input type="search" data-input="note-filter" data-key="q" value="' + esc(filters.q) + '" placeholder="Search notes…  ( / )"></label>' +
          '<div class="filters">' +
            '<select data-change="note-filter" data-key="scope" aria-label="Show">' + opt('all', 'All weeks', filters.scope) + opt('this', 'This week', filters.scope) + opt('pinned', 'Pinned only', filters.scope) + '</select>' +
            (tags.length ? '<select data-change="note-filter" data-key="tag" aria-label="Filter by tag">' + opt('', 'Any tag', filters.tag) + tags.map((g) => opt(g, '#' + g, filters.tag)).join('') + '</select>' : '') +
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
