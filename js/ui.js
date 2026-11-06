/* Todo4Me — UI primitives: modal dialog, confirm dialog, toasts, action registry. */
T4.ui = (function () {
  'use strict';
  const U = T4.util;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);

  /* ---------------- Action registry (event delegation) ---------------- */
  const actions = {};
  function on(name, fn) { actions[name] = fn; }
  function run(name, el, ev) {
    const fn = actions[name];
    if (fn) { fn(el, ev); return true; }
    console.warn('[Todo4Me] unknown action', name);
    return false;
  }

  /* ---------------- Modal ---------------- */
  const modal = document.getElementById('modal');
  let modalOnClose = null;
  let modalReturnFocus = null;
  let modalRefresh = null;

  /** Re-render the body of a "live" modal (one opened with a refresh() fn) after data changes. */
  function refreshModal() {
    if (!modal.open || !modalRefresh) return;
    const bodyEl = modal.querySelector('.modal__body');
    const active = document.activeElement;
    const key = active && active.dataset ? active.dataset.action + '|' + (active.dataset.id || '') : null;
    bodyEl.innerHTML = modalRefresh();
    if (key) {
      const again = Array.from(bodyEl.querySelectorAll('[data-action]')).find((e) => e.dataset.action + '|' + (e.dataset.id || '') === key);
      if (again) again.focus();
    }
  }

  /**
   * openModal({ title, body, footer, size, onMount(el), onClose() })
   * body/footer are HTML strings. Footer buttons with data-action="modal-close" close it.
   */
  function openModal(opts) {
    if (modal.open) closeModal(true);
    modalReturnFocus = document.activeElement;
    modal.className = 'modal' + (opts.size ? ' modal--' + opts.size : '');
    modal.innerHTML =
      '<div class="modal__header">' +
        '<h2 class="modal__title" id="modal-title">' + esc(opts.title) + '</h2>' +
        '<button type="button" class="icon-btn" data-action="modal-close" aria-label="' + esc(tt('c.close')) + '">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="modal__body">' + opts.body + '</div>' +
      (opts.footer ? '<div class="modal__footer">' + opts.footer + '</div>' : '');
    modalOnClose = opts.onClose || null;
    modalRefresh = opts.refresh || null;
    modal.showModal();
    if (opts.onMount) opts.onMount(modal);
    const auto = modal.querySelector('[autofocus]') || modal.querySelector('input, textarea, select, button:not([data-action="modal-close"])');
    if (auto) auto.focus();
    return modal;
  }

  function closeModal(silent) {
    if (!modal.open) return;
    modal.close();
    modal.innerHTML = '';
    const cb = modalOnClose;
    modalOnClose = null;
    modalRefresh = null;
    if (cb && !silent) cb();
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  }

  modal.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
  on('modal-close', () => closeModal());

  /* ---------------- Confirm ---------------- */
  const confirmEl = document.getElementById('confirm');
  /** confirm({ title, message, confirmText, danger }) → Promise<boolean> */
  function confirm(opts) {
    return new Promise((resolve) => {
      confirmEl.innerHTML =
        '<div class="modal__header"><h2 class="modal__title" id="confirm-title">' +
          (opts.danger ? icon('alert', 'text-danger') + ' ' : '') + esc(opts.title || tt('c.areYouSure')) + '</h2></div>' +
        '<div class="modal__body"><p class="muted">' + esc(opts.message || '') + '</p></div>' +
        '<div class="modal__footer">' +
          '<button type="button" class="btn btn--ghost" data-confirm="no">' + esc(opts.cancelText || tt('c.cancel')) + '</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" data-confirm="yes">' + esc(opts.confirmText || tt('c.confirm')) + '</button>' +
        '</div>';
      const prevFocus = document.activeElement;
      const done = (val) => {
        confirmEl.removeEventListener('click', onClick);
        confirmEl.removeEventListener('cancel', onCancel);
        if (confirmEl.open) confirmEl.close();
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
        resolve(val);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-confirm]');
        if (b) { e.stopPropagation(); done(b.dataset.confirm === 'yes'); }
      };
      const onCancel = (e) => { e.preventDefault(); done(false); };
      confirmEl.addEventListener('click', onClick);
      confirmEl.addEventListener('cancel', onCancel);
      confirmEl.showModal();
      confirmEl.querySelector(opts.danger ? '[data-confirm="no"]' : '[data-confirm="yes"]').focus();
    });
  }

  /* ---------------- Toasts ---------------- */
  const toastsEl = document.getElementById('toasts');
  /** toast(message, type = 'success'|'info'|'error'|'reminder', ms, action = { label, fn } or [{ label, fn }, …])
   *  Returns the toast element. */
  function toast(message, type, ms, action) {
    type = type || 'success';
    const actionsList = Array.isArray(action) ? action.filter(Boolean) : action ? [action] : [];
    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    const ic = type === 'error' ? 'alert' : type === 'reminder' ? 'bell' : type === 'info' ? 'sparkle' : 'check';
    el.innerHTML = icon(ic) + '<span class="toast__msg">' + esc(message) + '</span>' +
      actionsList.map((a, i) => '<button type="button" class="toast__action" data-i="' + i + '">' + esc(a.label) + '</button>').join('') +
      '<button type="button" class="toast__close" aria-label="' + esc(tt('c.dismiss')) + '">' + icon('x') + '</button>';
    const remove = () => {
      if (!el.isConnected) return;
      el.classList.add('toast--out');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    Array.from(el.querySelectorAll('.toast__action')).forEach((b) => b.addEventListener('click', () => { actionsList[Number(b.dataset.i)].fn(); remove(); }));
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
    setTimeout(remove, ms || (actionsList.length ? 6000 : 3200));
    return el;
  }

  /* ---------------- Small render helpers ---------------- */
  function emptyState(iconName, title, text, actionHtml) {
    return '<div class="empty">' +
      '<div class="empty__icon">' + icon(iconName) + '</div>' +
      '<p class="empty__title">' + esc(title) + '</p>' +
      (text ? '<p class="empty__text">' + esc(text) + '</p>' : '') +
      (actionHtml || '') +
      '</div>';
  }

  function progressRing(pct, size, label) {
    const r = (size - 8) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct)));
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="' + esc(label || tt('ui.percentComplete', { pct: Math.round(pct * 100) })) + '">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
        '<circle class="ring__track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '"/>' +
        '<circle class="ring__bar" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/>' +
      '</svg><span class="ring__label">' + Math.round(pct * 100) + '%</span></div>';
  }

  function progressBar(pct, label) {
    return '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct * 100) + '"' +
      (label ? ' aria-label="' + esc(label) + '"' : '') + '><span style="width:' + (Math.max(0, Math.min(1, pct)) * 100).toFixed(1) + '%"></span></div>';
  }

  return { on, run, openModal, closeModal, refreshModal, confirm, toast, emptyState, progressRing, progressBar, get modalOpen() { return modal.open; } };
})();
