/* Todo4Me live demo: banner (copy of the app only; the original index.html is untouched).
 * - translates the banner (en/de, follows the app's language)
 * - "Load sample data" runs the app's own sample-data action
 * - ?lang=de|en (from the website) selects the app language on the first visit, if the user has not chosen one yet
 * Makes no network requests. */
(function () {
  'use strict';
  var TEXT = {
    en: { badge: 'Demo', text: 'Your data stays in this browser.', sample: 'Load sample data', back: 'Back to website' },
    de: { badge: 'Demo', text: 'Deine Daten bleiben in diesem Browser.', sample: 'Beispieldaten laden', back: 'Zurück zur Website' }
  };
  var root = document.documentElement;
  var bar = document.getElementById('t4demo');
  if (!bar) return;

  function lang() { return String(root.getAttribute('lang') || 'en').slice(0, 2) === 'de' ? 'de' : 'en'; }
  function render() {
    var d = TEXT[lang()];
    var nodes = bar.querySelectorAll('[data-t]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = d[nodes[i].getAttribute('data-t')];
    bar.setAttribute('aria-label', d.badge);
  }
  render();
  try { new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ['lang'] }); } catch (e) { /* ignore */ }

  document.getElementById('t4demo-sample').addEventListener('click', function () {
    if (window.T4 && T4.ui && T4.ui.run) T4.ui.run('load-sample', null);
  });

  // Language hand-over from the website. Runs on DOMContentLoaded, i.e. after the app's own init (its listener was registered first).
  document.addEventListener('DOMContentLoaded', function () {
    var m = /[?&]lang=(en|de)(?:&|$)/.exec(location.search);
    if (m && window.T4 && T4.i18n && T4.store && T4.store.settings) {
      var cur = T4.store.settings.language;
      if ((!cur || cur === 'auto') && T4.i18n.language() !== m[1]) {
        var toasts = document.getElementById('toasts');
        var hadToast = toasts && toasts.children.length > 0;
        T4.i18n.setLanguage(m[1]);
        if (hadToast && T4.ui && T4.ui.toast) { // the welcome toast was rendered in the old language: show it again
          toasts.textContent = '';
          T4.ui.toast(T4.i18n.t('app.welcome'), 'info', 9000, { label: T4.i18n.t('nav.settings'), fn: function () { location.hash = '#/settings'; } });
        }
      }
    }
  });
})();
