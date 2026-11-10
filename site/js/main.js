/* Todo4Me website: language, theme, OS detection, release lookup, copy buttons, lightbox. No dependencies. */
(function () {
  'use strict';
  var REPO = 'muelgerhbf/todo4me';
  var RELEASES_LATEST = 'https://github.com/' + REPO + '/releases/latest';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var CACHE_KEY = 'todo4me.site.release';
  var CACHE_MS = 30 * 60 * 1000;
  var root = document.documentElement;
  var DICT = window.SITE_I18N || {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function store(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* storage blocked */ } }

  /* ---------- i18n ---------- */
  var lang = root.getAttribute('lang') === 'de' ? 'de' : 'en';
  var state = { os: 'other', release: null, loaded: false };

  function t(key, params) {
    var s = (DICT[lang] && DICT[lang][key]);
    if (s === undefined) s = DICT.en && DICT.en[key];
    if (s === undefined) return key;
    return params ? s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : m; }) : s;
  }

  function applyLanguage() {
    root.setAttribute('lang', lang);
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    ['alt', 'aria-label', 'title'].forEach(function (a) {
      $$('[data-i18n-' + a + ']').forEach(function (el) { el.setAttribute(a, t(el.getAttribute('data-i18n-' + a))); });
    });
    $$('.shot[data-cap]').forEach(function (b) { b.setAttribute('aria-label', t('shots.open', { name: t(b.getAttribute('data-cap')) })); });
    document.title = t('meta.title');
    var md = $('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta.description'));
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $$('[data-demo-link]').forEach(function (a) { a.setAttribute('href', 'app/?lang=' + lang); });
    renderOsState();
    renderVersion();
  }

  function setLanguage(next) {
    if (next !== 'en' && next !== 'de') return;
    lang = next;
    store('todo4me.site.lang', next);
    applyLanguage();
  }

  /* ---------- Theme ---------- */
  function setTheme(next) {
    root.setAttribute('data-theme', next);
    store('todo4me.site.theme', next);
    var meta = $$('meta[name="theme-color"]');
    meta.forEach(function (m) { m.removeAttribute('media'); });
    if (meta[0]) meta[0].setAttribute('content', next === 'dark' ? '#0E0E12' : '#ffffff');
    if (meta[1]) meta[1].remove();
  }

  /* ---------- OS detection ---------- */
  function detectOS() {
    var ua = navigator.userAgent || '';
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || '';
    if (/android|iphone|ipad|ipod|cros|mobile/i.test(ua) || /android|ios|chrome os/i.test(plat)) return 'other';
    if (/windows/i.test(plat) || (!plat && /windows/i.test(ua))) return 'windows';
    if (/linux/i.test(plat) || (!plat && /linux|x11/i.test(ua))) return 'linux';
    if (/windows/i.test(ua)) return 'windows';
    return 'other';
  }

  function renderOsState() {
    var cta = $('#hero-cta');
    var label = $('#hero-cta-label');
    var meta = $('#hero-meta');
    var v = state.release && state.release.version;
    var os = state.os;
    var target = cta;
    target.setAttribute('href', RELEASES_LATEST);
    if (os === 'windows') {
      label.textContent = t('hero.cta.windows');
      var setup = state.release && state.release.assets.setup;
      target.setAttribute('href', setup ? setup.url : RELEASES_LATEST);
    } else if (os === 'linux') {
      label.textContent = t('hero.cta.linux');
      target.setAttribute('href', '#dl-linux');
    } else {
      label.textContent = t('hero.cta.other');
      target.setAttribute('href', '#download');
    }
    meta.textContent = os === 'other' ? t('hero.meta.other') : (v ? t('hero.meta.version', { v: v }) : t('hero.meta.noversion'));

    $('#dl-other-os').hidden = os !== 'other';
    ['windows', 'linux'].forEach(function (name) {
      var card = $('#dl-' + name);
      var on = os === name;
      card.classList.toggle('is-recommended', on);
      $('.badge', card).hidden = !on;
    });
  }

  /* ---------- Release lookup ---------- */
  var PATTERNS = {
    setup: /^Todo4Me-Setup-.+\.exe$/i,
    portable: /-portable\.exe$/i,
    deb: /-amd64\.deb$/i,
    rpm: /-x86_64\.rpm$/i,
    appimage: /\.AppImage$/i,
    tar: /-x64\.tar\.gz$/i
  };
  var COMMANDS = {
    deb: function (f) { return 'sudo apt install ./' + f; },
    rpm: function (f) { return 'sudo dnf install ./' + f; },
    appimage: function (f) { return 'chmod +x ' + f + ' && ./' + f; },
    tar: function (f) { return 'tar xzf ' + f; }
  };
  var FALLBACK_FILE = { deb: 'Todo4Me-*-amd64.deb', rpm: 'Todo4Me-*-x86_64.rpm', appimage: 'Todo4Me-*.AppImage', tar: 'Todo4Me-*-x64.tar.gz' };

  function parseRelease(json) {
    if (!json || !Array.isArray(json.assets)) return null;
    var out = { version: String(json.tag_name || '').replace(/^v/i, ''), assets: {} };
    json.assets.forEach(function (a) {
      if (!a || typeof a.name !== 'string' || typeof a.browser_download_url !== 'string') return;
      if (a.browser_download_url.indexOf('https://github.com/') !== 0) return; // only trust GitHub download URLs
      Object.keys(PATTERNS).forEach(function (key) {
        if (!out.assets[key] && PATTERNS[key].test(a.name)) out.assets[key] = { name: a.name, url: a.browser_download_url, size: a.size || 0 };
      });
    });
    return out.version || Object.keys(out.assets).length ? out : null;
  }

  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.time < CACHE_MS && c.release && c.release.assets) return c.release;
    } catch (e) { /* ignore */ }
    return null;
  }

  function loadRelease() {
    var cached = readCache();
    if (cached) { state.release = cached; state.loaded = true; renderDownloads(); return; }
    if (!window.fetch) { state.loaded = true; renderDownloads(); return; }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined, cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) // 403/429 = rate limit, 404 = no release
      .then(function (json) {
        var rel = parseRelease(json);
        if (rel) {
          state.release = rel;
          store(CACHE_KEY, JSON.stringify({ time: Date.now(), release: rel }));
        }
      })
      .catch(function () { /* keep the fallback links to /releases/latest */ })
      .then(function () { if (timer) clearTimeout(timer); state.loaded = true; renderDownloads(); });
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    return Math.round(bytes / 1048576) + ' MB';
  }

  function renderVersion() {
    var el = $('#dl-version');
    var v = state.release && state.release.version;
    el.setAttribute('data-i18n', v ? 'dl.version' : 'dl.version.unknown');
    el.textContent = v ? t('dl.version', { v: v }) : t('dl.version.unknown');
  }

  function renderDownloads() {
    var assets = (state.release && state.release.assets) || {};
    $$('a[data-asset]').forEach(function (a) {
      var info = assets[a.getAttribute('data-asset')];
      a.setAttribute('href', info ? info.url : RELEASES_LATEST);
      var size = $('.size', a);
      if (size) size.textContent = info ? fmtSize(info.size) : '';
    });
    $$('[data-filename]').forEach(function (el) {
      var info = assets[el.getAttribute('data-filename')];
      if (info) el.textContent = info.name;
    });
    $$('code[data-cmd]').forEach(function (el) {
      var key = el.getAttribute('data-cmd');
      var info = assets[key];
      el.textContent = COMMANDS[key](info ? info.name : FALLBACK_FILE[key]);
    });
    renderOsState();
    renderVersion();
  }

  /* ---------- Copy buttons ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }

  function initCopy() {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = $('code', btn.parentNode);
        copyText(code.textContent).then(function () {
          var label = $('span', btn);
          label.textContent = t('dl.copied');
          setTimeout(function () { label.textContent = t('dl.copy'); }, 1800);
        }).catch(function () { /* clipboard blocked: user can still select the text */ });
      });
    });
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    var dlg = $('#lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    var img = $('#lb-img'), cap = $('#lb-cap');
    var shots = $$('#gallery .shot');
    var index = 0;
    var opener = null;

    function visibleImg(btn) {
      var imgs = $$('img', btn);
      for (var i = 0; i < imgs.length; i++) if (imgs[i].offsetParent !== null) return imgs[i];
      return imgs[0];
    }
    function show(i) {
      index = (i + shots.length) % shots.length;
      var src = visibleImg(shots[index]);
      img.src = src.getAttribute('src');
      img.alt = src.getAttribute('alt') || '';
      cap.textContent = t(shots[index].getAttribute('data-cap'));
    }
    shots.forEach(function (b, i) {
      b.addEventListener('click', function () { opener = b; show(i); dlg.showModal(); });
    });
    $('#lb-close').addEventListener('click', function () { dlg.close(); });
    $('#lb-prev').addEventListener('click', function () { show(index - 1); });
    $('#lb-next').addEventListener('click', function () { show(index + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.tagName === 'FIGURE') dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { show(index - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { show(index + 1); e.preventDefault(); }
    });
    dlg.addEventListener('close', function () { img.removeAttribute('src'); if (opener) opener.focus(); });
  }

  /* ---------- Header: mobile menu, language, theme ---------- */
  function initHeader() {
    var nav = $('#nav'), btn = $('#menu-btn');
    function setMenu(open) { nav.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); btn.focus(); } });

    $$('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang')); }); });
    $('#theme-toggle').addEventListener('click', function () { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
  }

  /* ---------- Init ---------- */
  state.os = detectOS();
  initHeader();
  initCopy();
  initLightbox();
  applyLanguage();
  loadRelease();
})();
