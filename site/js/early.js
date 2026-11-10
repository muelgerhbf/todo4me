/* Runs before first paint: apply the saved (or system) theme and language to <html> to avoid a flash. */
(function () {
  var root = document.documentElement;
  var theme = null, lang = null;
  try { theme = localStorage.getItem('todo4me.site.theme'); lang = localStorage.getItem('todo4me.site.lang'); } catch (e) { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  if (lang !== 'en' && lang !== 'de') {
    lang = /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
  }
  root.setAttribute('lang', lang);
})();
