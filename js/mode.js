/* Todo4Me — UI modes ("Simple" / "Advanced").
 * A mode only decides which parts of the interface are offered; it never deletes or changes data, and every page stays
 * reachable by route / keyboard shortcut / desktop menu in both modes.
 *
 * Contract:
 *   settings.uiMode = 'simple' | 'advanced'  (persisted in the settings store; missing value = 'advanced')
 *   document.body has the class mode-simple or mode-advanced
 *   T4.mode.get() / T4.mode.set(mode) / T4.mode.home()
 *   document event 't4:modechange' ({ detail: { mode } }) after every change (also cross-tab / import)
 *
 * Test hook: a harness may define window.__T4_FIRST_RUN_MODE = 'simple' | 'advanced' before the app loads. On a first run
 * the app then uses that mode (in memory only) and skips the first-run chooser. Normal users never set it. */
T4.mode = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;
  const tt = (k, p) => T4.i18n.t(k, p);
  const MODES = ['simple', 'advanced'];

  let last = null; // mode last announced via t4:modechange

  const get = () => (store.settings && store.settings.uiMode === 'simple' ? 'simple' : 'advanced');
  /** Start page: the Dashboard is an Advanced page, Simple starts on Today. */
  const home = () => (get() === 'simple' ? 'today' : 'dashboard');

  /** Bring the body class in line with the stored mode; announce a change (set(), import, other tab). */
  function sync() {
    const m = get();
    const cl = document.body.classList;
    cl.toggle('mode-simple', m === 'simple');
    cl.toggle('mode-advanced', m === 'advanced');
    const changed = last !== null && last !== m;
    last = m; // before dispatching: listeners may re-render, which calls sync() again
    if (changed) document.dispatchEvent(new CustomEvent('t4:modechange', { detail: { mode: m } }));
  }

  /** Persist and apply a mode (the store notification re-renders the current view and the navigation).
   *  opts.persist: write even if the mode is unchanged (first-run choice). */
  function set(m, opts) {
    if (MODES.indexOf(m) < 0) return false;
    if (m === get() && !(opts && opts.persist)) return true;
    store.updateSettings({ uiMode: m });
    sync();
    return true;
  }

  /** Run once before the first render. firstRun = no stored data yet. Returns true if the chooser must be shown. */
  function init(firstRun) {
    const forced = window.__T4_FIRST_RUN_MODE;
    let chooser = false;
    if (firstRun) {
      if (MODES.indexOf(forced) >= 0) store.settings.uiMode = forced; // in memory; stored with the first change
      else { store.settings.uiMode = 'simple'; chooser = true; }       // shown behind the chooser; dismissing keeps it
    }
    sync();
    store.subscribe(sync);
    return chooser;
  }

  /* ---------- Mode cards (first-run chooser and Settings) ---------- */
  function cards(current, action) {
    const card = (m) => {
      const on = m === current;
      return '<button type="button" class="mode-card' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-action="' + action + '" data-value="' + m + '" data-id="' + m + '">' +
        '<span class="mode-card__head">' + icon(m === 'simple' ? 'sun' : 'dashboard') + '<span class="mode-card__name">' + esc(tt('mode.' + m)) + '</span>' +
        (m === 'simple' && action === 'mode-pick' ? '<span class="mode-card__tag">' + esc(tt('mode.recommended')) + '</span>' : '') +
        '<span class="mode-card__check">' + icon('check') + '</span></span>' +
        '<span class="mode-card__desc">' + esc(tt('mode.' + m + '.desc')) + '</span></button>';
    };
    return '<div class="mode-cards" role="radiogroup" data-rg="uimode" aria-label="' + esc(tt('mode.label')) + '">' + MODES.map(card).join('') + '</div>';
  }

  /* ---------- Actions ---------- */
  ui.on('set-mode', (el) => {
    set(el.dataset.value);
    ui.toast(tt('mode.on.' + get()), 'success', 2400);
  });

  // "More features? → Advanced" in the Simple sidebar, with a way back.
  ui.on('mode-advanced', () => {
    set('advanced');
    ui.toast(tt('mode.on.advanced'), 'success', 6000, { label: tt('c.undo'), fn: () => set('simple') });
  });

  /* ---------- First-run chooser ---------- */
  function chooser(done) {
    let picked = 'simple', settled = false;
    const finish = (m) => {
      if (settled) return;
      settled = true;
      set(m, { persist: true });
      if (done) done(m);
    };
    ui.on('mode-pick', (el) => {
      picked = el.dataset.value;
      Array.from(document.querySelectorAll('#modal .mode-card')).forEach((c) => {
        const on = c === el;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-checked', String(on));
        c.tabIndex = on ? 0 : -1;
      });
    });
    ui.openModal({
      title: tt('mode.chooser.title'),
      size: 'lg',
      body: '<p class="muted">' + esc(tt('mode.chooser.sub')) + '</p>' + cards(picked, 'mode-pick') +
        '<p class="muted small mode-note">' + icon('check') + esc(tt('mode.chooser.note')) + '</p>',
      footer: '<button type="button" class="btn btn--primary" id="mode-continue">' + esc(tt('mode.chooser.continue')) + '</button>',
      onMount(m) {
        m.querySelector('#mode-continue').addEventListener('click', () => { ui.closeModal(true); finish(picked); });
        const first = m.querySelector('.mode-card.is-on');
        if (first) first.focus();
      },
      onClose() { finish('simple'); }, // Esc / close button / click outside
    });
  }

  return { MODES, get, set, home, init, cards, chooser, sync };
})();
