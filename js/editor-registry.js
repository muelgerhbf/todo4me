/* Todo4Me — editor extension registry (T4.edx).
 *
 * The contract between the editor core and feature modules. Modules never edit core files: they register
 * widgets, commands, shortcuts, menus, panels, importers, … here. Full reference: docs/EDITOR-EXTENSIONS.md.
 *
 * Load order: this file is loaded BEFORE js/editor-sanitize.js (it only needs T4.util and T4.i18n), so every
 * other editor file and every module can rely on T4.edx. Modules load after js/editor.js, at their anchor in
 * index.html. The core files read the registries lazily (at use time), so registering at any time works;
 * registering before the editor page is first shown is the normal case.
 *
 * Security: the sanitizer (editor-sanitize.js) stays the only boundary for document HTML. Everything that can
 * influence document HTML (sanitizer.allow, widgets, importers) is validated here, per element and per
 * attribute; unknown things are still dropped. */
T4.edx = (function () {
  'use strict';
  const U = T4.util;
  const { esc, icon } = U;

  const edx = { api: 1, problems: [] };
  const problem = (msg) => { edx.problems.push(msg); };
  const isFn = (f) => typeof f === 'function';
  const ID_RE = /^[a-z][a-z0-9_.:-]{1,63}$/i;
  function checkId(kind, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new TypeError('edx.' + kind + ': invalid id ' + JSON.stringify(id));
  }
  /** Resolve a spec's text: labelKey (+ English fallback in label) | label function | label string. */
  function text(spec, field) {
    field = field || 'label';
    if (!spec) return '';
    const key = spec[field + 'Key'];
    const v = spec[field];
    if (key) return t(key, isFn(v) ? v() : v);
    return String((isFn(v) ? v() : v) == null ? '' : isFn(v) ? v() : v);
  }
  const sortList = (a) => a.sort((x, y) => ((x.order == null ? 1000 : x.order) - (y.order == null ? 1000 : y.order)) || (x._seq - y._seq));

  /* ---------- change watchers (core re-renders the affected UI when something registers later) ---------- */
  const watchers = {};
  edx._watch = (kind, fn) => { (watchers[kind] = watchers[kind] || []).push(fn); };
  function changed(kind) {
    (watchers[kind] || []).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }

  /** Ordered registry of specs keyed by id. */
  function makeList(kind) {
    const map = new Map();
    let seq = 0;
    const api = {
      add(spec) {
        if (!spec || typeof spec !== 'object') throw new TypeError('edx.' + kind + ': spec object required');
        checkId(kind, spec.id);
        if (map.has(spec.id)) throw new Error('edx.' + kind + ': "' + spec.id + '" is already registered');
        map.set(spec.id, Object.assign({}, spec, { _seq: seq++ }));
        changed(kind);
        return () => api.remove(spec.id);
      },
      remove(id) { const had = map.delete(id); if (had) changed(kind); return had; },
      get: (id) => map.get(id) || null,
      has: (id) => map.has(id),
      list: () => sortList(Array.from(map.values())),
    };
    return api;
  }

  /* ====================== i18n ====================== */
  /** t(key, fallback, params): translation of key (active language → English), else the fallback text. */
  function t(key, fallback, params) {
    if (T4.i18n.has(key)) return T4.i18n.t(key, params);
    const s = fallback == null ? String(key) : String(fallback);
    return params ? s.replace(/\{(\w+)\}/g, (m, n) => (params[n] != null ? params[n] : m)) : s;
  }
  const i18nModules = {};
  edx.t = t;
  edx.i18n = {
    /** add('edx.knowledge.', { en: {…}, de: {…}, tr: {…}, es: {…} }) — keys must start with the prefix; all four languages should define the same keys. */
    add(prefix, dicts) {
      if (!/^edx\.[a-z0-9]+\.$/.test(prefix)) throw new TypeError('edx.i18n.add: prefix must look like "edx.<module>."');
      const langs = ['en', 'de', 'tr', 'es'];
      const keys = new Set();
      langs.forEach((l) => Object.keys(dicts[l] || {}).forEach((k) => keys.add(k)));
      keys.forEach((k) => { if (k.indexOf(prefix) !== 0) throw new Error('edx.i18n.add: key "' + k + '" does not start with ' + prefix); });
      langs.forEach((l) => { if (dicts[l]) T4.i18n.add(l, dicts[l]); });
      i18nModules[prefix] = { dicts, keys: Array.from(keys) };
    },
    /** Keys that are missing in some language: { prefix: { lang: [keys] } } (empty object = complete). Used by tests. */
    missing() {
      const out = {};
      Object.keys(i18nModules).forEach((p) => {
        ['en', 'de', 'tr', 'es'].forEach((l) => {
          const have = i18nModules[p].dicts[l] || {};
          const miss = i18nModules[p].keys.filter((k) => !(k in have));
          if (miss.length) { out[p] = out[p] || {}; out[p][l] = miss; }
        });
      });
      return out;
    },
  };

  /* ====================== small utilities ====================== */
  edx.util = { esc, icon, uid: U.uid, debounce: U.debounce };
  edx.text = text;

  /** edx.icons.add(name, shapes): register an icon for U.icon(name). `shapes` = SVG shape markup for a 24×24 stroke icon
   *  (path, circle, rect, line, polyline, polygon, ellipse, g only; attributes validated). */
  const ICON_ELEMENTS = { path: ['d'], circle: ['cx', 'cy', 'r'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'], ellipse: ['cx', 'cy', 'rx', 'ry'], g: [] };
  const ICON_VALUE = /^[\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]*$/;
  edx.icons = {
    has: (name) => !!document.getElementById('i-' + name),
    add(name, shapes) {
      if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) throw new TypeError('edx.icons.add: invalid name');
      if (edx.icons.has(name)) return false;
      const sprite = document.querySelector('body > svg');
      if (!sprite) return false;
      const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + T4.edSanitize.neutralizeHandlers(String(shapes)) + '</svg>', 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('edx.icons.add: invalid SVG');
      const sym = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
      sym.setAttribute('id', 'i-' + name);
      sym.setAttribute('viewBox', '0 0 24 24');
      (function copy(from, to) {
        Array.from(from.children).forEach((c) => {
          const tag = c.localName;
          if (!ICON_ELEMENTS[tag]) return;
          const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
          ICON_ELEMENTS[tag].forEach((a) => { const v = c.getAttribute(a); if (v != null && ICON_VALUE.test(v)) n.setAttribute(a, v); });
          to.appendChild(n);
          copy(c, n);
        });
      })(doc.documentElement, sym);
      sprite.appendChild(sym);
      return true;
    },
  };

  /** Allow-list HTML for small decorations (doc-list badges): span/b/i/em/strong/small/kbd/mark/br/svg+use; class/title/aria-* only. */
  const SAFE_TAGS = new Set(['span', 'b', 'i', 'em', 'strong', 'small', 'kbd', 'mark', 'br', 'svg', 'use']);
  function safeHTML(html) {
    // on* attributes are renamed first: the parser would report them as CSP violations even though nothing runs
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + T4.edSanitize.neutralizeHandlers(String(html || '')), 'text/html');
    const out = document.createElement('div');
    (function walk(src, dst) {
      Array.from(src.childNodes).forEach((n) => {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tag = n.localName;
        if (!SAFE_TAGS.has(tag)) { if (!/^(script|style|template|iframe|object|embed)$/.test(tag)) walk(n, dst); return; }
        const el = tag === 'svg' || tag === 'use' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
        const cls = n.getAttribute('class');
        if (cls && /^[\w -]{1,120}$/.test(cls) && !/\bt4-w\b/.test(cls)) el.setAttribute('class', cls);
        ['title', 'aria-label'].forEach((a) => { const v = n.getAttribute(a); if (v) el.setAttribute(a, v.slice(0, 200)); });
        if (n.getAttribute('aria-hidden') === 'true') el.setAttribute('aria-hidden', 'true');
        if (tag === 'use') { const h = n.getAttribute('href'); if (h && /^#i-[\w-]+$/.test(h)) el.setAttribute('href', h); else return; }
        dst.appendChild(el);
        walk(n, el);
      });
    })(doc.body, out);
    return out.innerHTML;
  }
  edx.safeHTML = safeHTML;

  /* ====================== Events ====================== */
  const handlers = new Map();
  const EVENT_RE = /^[a-z][a-z0-9:-]{1,40}$/;
  /** on(name, fn, { debounce: ms }) → off(). Core events: doc-open, doc-close, doc-saved, content-change, selection-change,
   *  before-export, after-export, docs-changed, doc-meta, shell-built. Modules emit their own as '<module>:<name>'. */
  function on(name, fn, opts) {
    if (!EVENT_RE.test(name) || !isFn(fn)) throw new TypeError('edx.events.on: bad arguments');
    let call = fn;
    if (opts && opts.debounce > 0) call = U.debounce(fn, opts.debounce);
    const entry = { fn, call };
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(entry);
    return () => off(name, fn);
  }
  function off(name, fn) {
    const set = handlers.get(name);
    if (!set) return;
    set.forEach((e) => { if (e.fn === fn) set.delete(e); });
  }
  function emit(name, data) {
    const set = handlers.get(name);
    if (!set || !set.size) return; // cheap when nobody listens (content-change fires on every keystroke)
    set.forEach((e) => { try { e.call(data); } catch (err) { console.error('[Todo4Me editor] listener for "' + name + '" failed', err); } });
  }
  edx.events = { on, off, emit, once(name, fn) { const o = on(name, (d) => { o(); fn(d); }); return o; } };

  /* ====================== Sanitizer rules ====================== */
  // Everything below only ADDS narrowly validated rules; the sanitizer still drops whatever is not covered.
  const san = { tags: new Map(), attrs: new Map(), styles: new Map(), match: new Map() };
  const SAFE_INLINE = new Set(['TIME', 'DATA', 'BDI', 'BDO', 'RUBY', 'RT', 'RP', 'WBR', 'OUTPUT']);
  const SAFE_BLOCK = new Set(['SUMMARY', 'ADDRESS', 'DT', 'DD', 'HGROUP']);
  const SAFE_CONTAINER = new Set(['DETAILS', 'ASIDE', 'SECTION', 'ARTICLE', 'DIV', 'DL', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIELDSET']);
  const ATTR_PLAIN = new Set(['class', 'id', 'title', 'lang', 'dir', 'colspan', 'rowspan', 'start', 'open', 'aria-label', 'role', 'datetime', 'value']);
  const ATTR_DATA = /^data-x-[a-z0-9]+(-[a-z0-9]+){0,4}$/;
  const CLASS_TOKEN = /^[a-z_][\w-]{0,60}$/i;
  const CLASS_DENY = /^(t4-w|t4-w--inline|t4-doc|t4-table|ed-ui|ed-menu|ed-ctx|is-selected|is-on|cw-.*|iw-.*|dw-.*)$/;
  const CSS_BAD = /url\s*\(|expression|@import|[{}<>\\;]|\/\*|javascript:|behavior|-moz-binding/i;

  function runValidator(v, value, el) {
    if (v instanceof RegExp) { v.lastIndex = 0; return v.test(value) ? value : null; }
    const r = v(value, el);
    return typeof r === 'string' ? r : r === true ? value : null;
  }
  /** Final, non-negotiable checks applied to whatever a registered validator accepted. */
  function guardAttr(attr, value) {
    if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) return null;
    if (attr === 'class') {
      const toks = value.split(/\s+/).filter(Boolean);
      if (!toks.length || toks.length > 12 || toks.some((x) => !CLASS_TOKEN.test(x) || CLASS_DENY.test(x))) return null;
      return toks.join(' ');
    }
    if (attr === 'id') {
      // DOM clobbering: an id/name becomes window[...] / document[...]; never allow names that exist already.
      if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(value) || value in Object.prototype || value in document || value in window || value.indexOf('__') === 0) return null;
      return value;
    }
    if (attr === 'role' && !/^[a-z]{3,30}$/.test(value)) return null;
    if (attr === 'dir' && !/^(ltr|rtl|auto)$/.test(value)) return null;
    if (attr === 'lang' && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(value)) return null;
    if (/^(colspan|rowspan|start)$/.test(attr) && !/^\d{1,5}$/.test(value)) return null;
    if (attr === 'open') return '';
    return value;
  }
  function parseTag(tag) {
    const T = String(tag || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9]*$/.test(T)) throw new TypeError('edx.sanitizer: invalid tag ' + tag);
    return T;
  }

  const sanitizer = {
    /** allow({ tags: ['TIME'] | { DETAILS: 'container' }, attrs: { TAG: { attr: RegExp | fn(value, el) } }, styles: { TAG: { prop: fn(value) } } })
     *  → undo(). Tags: only from a fixed safe list; attributes: class, id, title, lang, dir, … and data-x-*; styles: per tag. */
    allow(rules) {
      rules = rules || {};
      const undo = [];
      const tags = rules.tags;
      const tagEntries = Array.isArray(tags) ? tags.map((x) => [x, 'inline']) : tags ? Object.entries(tags) : [];
      tagEntries.forEach(([tag, kind]) => {
        const T = parseTag(tag);
        if (kind === 'container') { sanitizer.blockContainer(T); return; }
        if (kind === 'block' ? !SAFE_BLOCK.has(T) : !SAFE_INLINE.has(T)) throw new Error('edx.sanitizer.allow: tag ' + T + ' cannot be registered as ' + kind);
        if (!san.tags.has(T)) { san.tags.set(T, kind === 'block' ? 'block' : 'inline'); undo.push(() => san.tags.delete(T)); }
      });
      Object.entries(rules.attrs || {}).forEach(([tag, map]) => {
        const T = parseTag(tag);
        Object.entries(map || {}).forEach(([attrRaw, validator]) => {
          const attr = String(attrRaw).toLowerCase();
          if (!ATTR_PLAIN.has(attr) && !ATTR_DATA.test(attr)) throw new Error('edx.sanitizer.allow: attribute "' + attr + '" cannot be registered (allowed: ' + Array.from(ATTR_PLAIN).join(', ') + ', data-x-*)');
          if (!(validator instanceof RegExp) && !isFn(validator)) throw new TypeError('edx.sanitizer.allow: attribute "' + attr + '" needs a RegExp or function validator');
          if (!san.attrs.has(T)) san.attrs.set(T, new Map());
          san.attrs.get(T).set(attr, validator);
          undo.push(() => { const m = san.attrs.get(T); if (m) { m.delete(attr); if (!m.size) san.attrs.delete(T); } });
        });
      });
      Object.entries(rules.styles || {}).forEach(([tag, map]) => {
        const T = parseTag(tag);
        Object.entries(map || {}).forEach(([prop, fn]) => {
          if (!/^[a-z]+(-[a-z]+){0,3}$/.test(prop) || !isFn(fn)) throw new TypeError('edx.sanitizer.allow: bad style rule ' + prop);
          const wrapped = (v) => { const r = fn(v); return typeof r === 'string' && r.length < 200 && !CSS_BAD.test(r) ? r : null; };
          if (!san.styles.has(T)) san.styles.set(T, {});
          san.styles.get(T)[prop] = wrapped;
          undo.push(() => { const o = san.styles.get(T); if (o) { delete o[prop]; if (!Object.keys(o).length) san.styles.delete(T); } });
        });
      });
      if (rules.widgets) throw new Error('edx.sanitizer.allow: widgets are allowed by edx.widgets.register, not here');
      return () => undo.forEach((f) => f());
    },
    /** blockContainer('DETAILS', { match(el) → bool }): a block element that holds blocks (like blockquote). Use match for generic tags (DIV, SECTION)
     *  so ordinary pasted divs keep being flattened. Attributes still need allow({ attrs }). */
    blockContainer(tag, opts) {
      const T = parseTag(tag);
      if (!SAFE_CONTAINER.has(T)) throw new Error('edx.sanitizer.blockContainer: tag ' + T + ' is not allowed as a container');
      san.tags.set(T, 'container');
      if (opts && isFn(opts.match)) san.match.set(T, opts.match); else san.match.delete(T);
      return () => { san.tags.delete(T); san.match.delete(T); };
    },
    // --- queried by editor-sanitize.js / editor-core.js ---
    tagKind(tag) { return san.tags.get(tag) || null; },
    isContainer(el) {
      if (!el || el.nodeType !== 1 || san.tags.get(el.tagName) !== 'container') return false;
      const m = san.match.get(el.tagName);
      try { return m ? !!m(el) : true; } catch (e) { return false; }
    },
    containerSelector() { const l = []; san.tags.forEach((k, tag) => { if (k === 'container') l.push(tag.toLowerCase()); }); return l.join(','); },
    blockSelector() { const l = []; san.tags.forEach((k, tag) => { if (k === 'block') l.push(tag.toLowerCase()); }); return l.join(','); },
    hasRules() { return san.tags.size > 0 || san.attrs.size > 0 || san.styles.size > 0; },
    styleRules(tag) { return san.styles.get(tag) || null; },
    /** Copy registered attributes of `src` to `dst` (both elements of type `tag`). */
    applyAttrs(src, dst, tag) {
      const rules = san.attrs.get(tag);
      if (!rules) return;
      rules.forEach((validator, attr) => {
        if (!src.hasAttribute(attr)) return;
        let v;
        try { v = runValidator(validator, src.getAttribute(attr), src); } catch (e) { v = null; }
        v = v == null ? null : guardAttr(attr, v);
        if (v != null) dst.setAttribute(attr, v);
      });
    },
    hasAttrRules(tag) { return san.attrs.has(tag); },
  };
  edx.sanitizer = sanitizer;

  /* ====================== Widgets ====================== */
  const widgets = new Map();
  const BUILTIN_WIDGETS = ['img', 'draw', 'chart', 'math', 'code', 'pagebreak'];
  const WIDGET_RE = /^[a-z][a-z0-9-]{1,30}$/;
  edx.widgets = {
    /** register(type, { inline, validate(props)→props|null, render(el, props), textOf(props, el)→string, toMarkdown(props, ctx)→string,
     *  ctxBar: { items: [..] | fn(el, props)→[..], html(el, props)→string, onAction(action, info) }, edit(el, props), insert(opts), defaults, css }) */
    register(type, def) {
      if (!WIDGET_RE.test(type) || BUILTIN_WIDGETS.includes(type)) throw new TypeError('edx.widgets.register: invalid or reserved type "' + type + '"');
      if (widgets.has(type)) throw new Error('edx.widgets.register: "' + type + '" is already registered');
      if (!def || !isFn(def.validate) || !isFn(def.render)) throw new TypeError('edx.widgets.register: validate() and render() are required');
      const d = Object.assign({ inline: false }, def, { type });
      if (d.css) {
        const style = document.createElement('style');
        style.setAttribute('data-edx-widget', type);
        style.textContent = String(d.css).replace(/<\/style/gi, '');
        document.head.appendChild(style);
        d._style = style;
      }
      widgets.set(type, d);
      changed('widgets');
      return () => edx.widgets.remove(type);
    },
    remove(type) { const d = widgets.get(type); if (!d) return false; if (d._style) d._style.remove(); widgets.delete(type); changed('widgets'); return true; },
    has: (type) => widgets.has(type),
    get: (type) => widgets.get(type) || null,
    list: () => Array.from(widgets.keys()),
    isInline: (type) => !!(widgets.get(type) && widgets.get(type).inline),
    /** Validated props (plain JSON object) or null. Never throws. */
    validate(type, props) {
      const d = widgets.get(type);
      if (!d) return null;
      try {
        const v = d.validate(props);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
        const json = JSON.stringify(v);
        if (json.length > 2000000) return null;
        return JSON.parse(json);
      } catch (e) { problem('widget ' + type + ' validate: ' + e.message); return null; }
    },
    render(type, el, props) {
      const d = widgets.get(type);
      if (!d) return false;
      el.textContent = '';
      try { d.render(el, props); } catch (e) { problem('widget ' + type + ' render: ' + e.message); el.innerHTML = '<span class="w-missing">Unsupported element</span>'; }
      return true;
    },
    textOf(type, props, el) {
      const d = widgets.get(type);
      if (!d || !isFn(d.textOf)) return '';
      try { return String(d.textOf(props, el) || ''); } catch (e) { return ''; }
    },
    toMarkdown(type, props, ctx) {
      const d = widgets.get(type);
      if (!d || !isFn(d.toMarkdown)) return '';
      try { return Promise.resolve(d.toMarkdown(props, ctx || {})).then((s) => String(s || ''), () => ''); } catch (e) { return Promise.resolve(''); }
    },
    /** Context bar of a widget element → { html, action(name, info) } or null. */
    ctxBar(type) {
      const d = widgets.get(type);
      return d && d.ctxBar ? d.ctxBar : null;
    },
    edit(el) {
      const d = widgets.get(el.getAttribute('data-w'));
      if (!d || !isFn(d.edit)) return false;
      d.edit(el, T4.edw.getProps(el));
      return true;
    },
    /** Insert a new widget at the caret (block, or inline when the definition says so). */
    insert(type, opts) {
      const d = widgets.get(type);
      if (!d) throw new Error('edx.widgets.insert: unknown type ' + type);
      opts = opts || {};
      if (isFn(d.insert)) return d.insert(opts);
      const el = T4.edw.create(type, opts.props || d.defaults || {}, d.inline);
      if (!el) return null;
      return d.inline ? T4.edcore.insertInlineWidget(el) : T4.edcore.insertBlock(el, { select: true });
    },
  };

  /* ====================== Shortcuts & commands ====================== */
  const KEY_NAMES = { escape: 'esc', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', ' ': 'space', spacebar: 'space', delete: 'del', del: 'del', comma: ',', period: '.', plus: '+', minus: '-', slash: '/', backslash: '\\', return: 'enter', pgup: 'pageup', pgdn: 'pagedown' };
  /** 'Ctrl+Shift+H' | 'mod-shift-h' → 'mod-shift-h' (order: mod, alt, shift, key). null if not understood. */
  function normalizeCombo(combo) {
    let s = String(combo || '').trim().toLowerCase();
    if (!s) return null;
    const mods = { mod: false, alt: false, shift: false };
    for (;;) {
      const m = /^(mod|ctrl|control|cmd|command|meta|alt|option|shift)[-+]/.exec(s);
      if (!m || s.length === m[0].length) break;
      if (/^(mod|ctrl|control|cmd|command|meta)$/.test(m[1])) mods.mod = true; else if (/^(alt|option)$/.test(m[1])) mods.alt = true; else mods.shift = true;
      s = s.slice(m[0].length);
    }
    let key = KEY_NAMES[s] || s;
    if (!/^([a-z0-9]|f([1-9]|1[0-2])|esc|up|down|left|right|space|tab|enter|backspace|del|home|end|pageup|pagedown|[,.+\-/\\[\]=;'`])$/.test(key)) return null;
    return (mods.mod ? 'mod-' : '') + (mods.alt ? 'alt-' : '') + (mods.shift ? 'shift-' : '') + key;
  }
  function comboOfEvent(e) {
    let key;
    const code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(code)) key = code.slice(5);
    else {
      key = String(e.key || '').toLowerCase();
      key = KEY_NAMES[key] || key;
    }
    return ((e.ctrlKey || e.metaKey) ? 'mod-' : '') + (e.altKey ? 'alt-' : '') + (e.shiftKey ? 'shift-' : '') + key;
  }
  const RESERVED = {
    editor: ['mod-z', 'mod-shift-z', 'mod-y', 'mod-b', 'mod-i', 'mod-u', 'mod-shift-x', 'mod-shift-7', 'mod-shift-8', 'mod-shift-l', 'mod-e', 'mod-shift-e', 'mod-shift-r', 'mod-shift-j',
      'mod-\\', 'mod-.', 'mod-,', 'mod-enter', 'mod-]', 'mod-[', 'mod-alt-0', 'mod-alt-1', 'mod-alt-2', 'mod-alt-3', 'mod-alt-4', 'mod-alt-5', 'mod-alt-6',
      'mod-k', 'mod-m', 'mod-s', 'mod-p', 'mod-c', 'mod-x', 'mod-v', 'mod-a', 'mod-shift-v', 'tab', 'shift-tab', 'enter', 'shift-enter', 'esc', 'backspace', 'del', 'space',
      'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown', 'shift-f10', 'mod-d'].map(normalizeCombo),
    // Menu accelerators of the desktop app (electron/main.js) and browser/OS keys that cannot be intercepted reliably.
    app: ['mod-n', 'mod-shift-n', 'mod-alt-n', 'mod-shift-space', 'mod-1', 'mod-2', 'mod-3', 'mod-4', 'mod-5', 'mod-6', 'mod-7', 'mod-8', 'mod-9', 'mod-0', 'mod-shift-d',
      'mod-+', 'mod-=', 'mod--', 'mod-r', 'mod-shift-r', 'mod-shift-i', 'mod-q', 'mod-w', 'mod-t', 'mod-tab', 'f5', 'f11', 'f12', 'alt-f4', 'alt-left', 'alt-right', 'alt-home'].map(normalizeCombo),
  };
  const bindings = new Map(); // combo → command id
  function isReserved(norm) { return RESERVED.editor.includes(norm) || RESERVED.app.includes(norm); }
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  function comboLabel(norm) {
    if (!norm) return '';
    return norm.split('-').map((p, i, a) => {
      if (p === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (p === 'alt') return isMac ? '⌥' : 'Alt';
      if (p === 'shift') return isMac ? '⇧' : 'Shift';
      if (i === a.length - 1) return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
      return p;
    }).join(isMac ? '' : '+');
  }
  const cmdMap = new Map();
  let cmdSeq = 0;

  edx.shortcuts = {
    normalize: normalizeCombo,
    label: comboLabel,
    reserved: () => ({ editor: RESERVED.editor.slice(), app: RESERVED.app.slice() }),
    /** add('mod-shift-h', 'my.command') → true | false (invalid, reserved, or already taken). */
    add(combo, commandId) {
      const norm = normalizeCombo(combo);
      if (!norm) { problem('shortcut not understood: ' + combo); return false; }
      const parts = norm.split('-');
      const key = parts[parts.length - 1];
      const hasMod = parts.includes('mod') || parts.includes('alt');
      if (!hasMod && !/^f\d+$/.test(key)) { problem('shortcut needs Ctrl/Alt (or be an F key): ' + combo); return false; }
      if (isReserved(norm)) { problem('shortcut is reserved: ' + combo); return false; }
      if (bindings.has(norm) && bindings.get(norm) !== commandId) { problem('shortcut already used by ' + bindings.get(norm) + ': ' + combo); return false; }
      bindings.set(norm, commandId);
      return true;
    },
    remove(combo) { return bindings.delete(normalizeCombo(combo)); },
    list: () => Array.from(bindings.entries()).map(([combo, command]) => ({ combo, command, label: comboLabel(combo) })),
    /** Display label of the first shortcut bound to a command ('' if none). */
    labelFor(commandId) { for (const [c, id] of bindings) if (id === commandId) return comboLabel(c); return ''; },
    /** Called by the core for keydown events. Returns true when a registered command handled (and consumed) the key. */
    dispatch(e) {
      if (!bindings.size || e.isComposing || e.defaultPrevented) return false;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && !e.altKey && !/^F\d+$/.test(e.key)) return false;
      if (e.getModifierState && e.getModifierState('AltGraph')) return false; // AltGr produces characters on many layouts
      const id = bindings.get(comboOfEvent(e));
      if (!id) return false;
      const c = cmdMap.get(id);
      if (!c) return false;
      if (!commandEnabled(c, true)) return false;
      e.preventDefault();
      e.stopPropagation();
      runCommand(c, { source: 'shortcut', event: e });
      return true;
    },
  };

  function commandEnabled(c, forShortcut) {
    try {
      if (c.when && !c.when()) return false;
      const cur = edx.editor.current();
      if (forShortcut && !cur && !c.global) return false;
      if (cur && edx.editor.readonly() && !c.readonlyOk) return false;
      return true;
    } catch (e) { return false; }
  }
  function runCommand(c, extra) {
    const ctx = Object.assign({ editor: edx.editor, edx, args: undefined, source: 'api' }, extra);
    try {
      const r = c.run(ctx);
      if (r && isFn(r.then)) return r.catch((e) => { console.error('[Todo4Me editor] command ' + c.id + ' failed', e); });
      return r;
    } catch (e) { console.error('[Todo4Me editor] command ' + c.id + ' failed', e); return undefined; }
  }
  edx.commands = {
    /** register(id, { run(ctx), label | labelKey, icon, kbd, group, order, when(), readonlyOk, global }) → unregister() */
    register(id, def) {
      checkId('commands', id);
      if (!def || !isFn(def.run)) throw new TypeError('edx.commands.register: run() required');
      if (cmdMap.has(id)) throw new Error('edx.commands.register: "' + id + '" is already registered');
      cmdMap.set(id, Object.assign({}, def, { id, _seq: cmdSeq++ }));
      changed('commands');
      return () => edx.commands.remove(id);
    },
    remove(id) { for (const [c, cid] of Array.from(bindings)) if (cid === id) bindings.delete(c); const had = cmdMap.delete(id); if (had) changed('commands'); return had; },
    has: (id) => cmdMap.has(id),
    /** run(id, args) → result of the command (maybe a Promise), or false when unknown or disabled right now. */
    run(id, args) {
      const c = cmdMap.get(id);
      if (!c || !commandEnabled(c, false)) return false;
      return runCommand(c, { args, source: 'api' });
    },
    /** All commands for a palette: [{ id, label, icon, kbd, group, enabled }] ordered by group, order, registration. */
    list() {
      return sortList(Array.from(cmdMap.values())).map((c) => ({
        id: c.id, label: text(c), icon: c.icon || '', kbd: edx.shortcuts.labelFor(c.id) || (c.kbd ? String(c.kbd) : ''), group: c.group ? text(c, 'group') : '', enabled: commandEnabled(c, false),
      }));
    },
    label(id) { const c = cmdMap.get(id); return c ? text(c) : ''; },
    _enabled: (id) => !!cmdMap.get(id) && commandEnabled(cmdMap.get(id), false),
  };

  /* ====================== Slash menu, toolbar, panels, doc-list views ====================== */
  const slashList = makeList('slash');
  let slashRanker = null;
  const slashPickers = [];
  edx.slash = {
    /** add({ id, label | labelKey, keywords, icon, run(ctx), group, order }) → remove() */
    add(spec) {
      if (!spec || !isFn(spec.run)) throw new TypeError('edx.slash.add: run() required');
      return slashList.add(spec);
    },
    remove: slashList.remove,
    get: slashList.get,
    list: slashList.list,
    /** setRanker(fn(items, query) → items) — filters and orders the slash menu. `items` = [{ id, label, keywords, icon, group, builtin }] (built-in and
     *  registered entries; `query` is the text after "/", lower case, may be empty); return a subset/reordering of the SAME objects. One ranker at a time
     *  (returns the previous one). Without a ranker: plain substring match on label + keywords, in registration order. */
    setRanker(fn) { const prev = slashRanker; slashRanker = isFn(fn) ? fn : null; return prev; },
    ranker: () => slashRanker,
    /** onPick(fn(id)) → off(): called with the entry id ('builtin.<slug>' or the registered id) after an entry was chosen (e.g. for "recently used"). */
    onPick(fn) { slashPickers.push(fn); return () => { const i = slashPickers.indexOf(fn); if (i >= 0) slashPickers.splice(i, 1); }; },
    picked(id) { slashPickers.slice().forEach((f) => { try { f(id); } catch (e) { console.error(e); } }); },
  };

  const toolbarList = makeList('toolbar');
  edx.toolbar = {
    /** add({ id, group, icon, label | labelKey, kbd, run(ctx), isActive(), order, readonlyOk }) — rendered in the reserved toolbar group. */
    add(spec) {
      if (!spec || !isFn(spec.run) || !spec.icon) throw new TypeError('edx.toolbar.add: icon and run() required');
      return toolbarList.add(spec);
    },
    remove: toolbarList.remove,
    get: toolbarList.get,
    has: toolbarList.has,
    list: toolbarList.list,
  };

  const panelList = makeList('panels');
  let panelImpl = null;
  edx.panels = {
    /** register({ id, side: 'left'|'right', title | titleKey, icon, order, render(host, api), onDocChange(doc), onOpen(), onClose() }) */
    register(spec) {
      if (!spec || !isFn(spec.render) || !['left', 'right'].includes(spec.side)) throw new TypeError("edx.panels.register: side 'left'|'right' and render() required");
      return panelList.add(Object.assign({ label: spec.title, labelKey: spec.titleKey }, spec));
    },
    remove: panelList.remove,
    get: panelList.get,
    has: panelList.has,
    list: (side) => panelList.list().filter((p) => !side || p.side === side),
    open: (id) => (panelImpl ? panelImpl.open(id) : false),
    close: (side) => (panelImpl ? panelImpl.close(side) : false),
    toggle: (id) => (panelImpl ? panelImpl.toggle(id) : false),
    /** Id of the open panel on that side ('right' default) or null. */
    active: (side) => (panelImpl ? panelImpl.active(side || 'right') : null),
    isRendered: (id) => (panelImpl ? panelImpl.rendered(id) : false),
    _bind: (impl) => { panelImpl = impl; },
  };

  const views = makeList('docviews');
  const decorators = [];
  const docFilters = [];
  edx.docList = {
    /** registerView({ id, label | labelKey, icon, order, filter(meta) → bool, sort(a, b), empty }) — an extra list next to All / Pinned / Trash. */
    registerView(spec) {
      if (!spec || !isFn(spec.filter)) throw new TypeError('edx.docList.registerView: filter(meta) required');
      if (['all', 'pinned', 'trash'].includes(spec.id)) throw new Error('edx.docList.registerView: reserved id');
      return views.add(spec);
    },
    removeView: views.remove,
    views: views.list,
    getView: views.get,
    /** filter(fn(meta, { view, q }) → bool, { empty: 'text' }) → remove(). Hides documents from the list (e.g. archived ones) unless fn returns true.
     *  `empty` is shown when the filter hid everything that otherwise matched. Not applied to the trash view unless the filter asks for it (it receives view). */
    filter(fn, opts) {
      if (!isFn(fn)) throw new TypeError('edx.docList.filter: function required');
      const rec = { fn, empty: opts && opts.empty, emptyKey: opts && opts.emptyKey };
      docFilters.push(rec);
      changed('docviews');
      return () => { const i = docFilters.indexOf(rec); if (i >= 0) { docFilters.splice(i, 1); changed('docviews'); } };
    },
    passes(meta, ctx) {
      for (let i = 0; i < docFilters.length; i++) { try { if (!docFilters[i].fn(meta, ctx)) return false; } catch (e) { /* a broken filter must not hide documents */ } }
      return true;
    },
    hasFilters: () => docFilters.length > 0,
    filterNote() { const r = docFilters.find((f) => f.empty); return r ? text(r, 'empty') : ''; },
    /** decorate(fn(meta) → html) — badges shown after a document's title in the list. HTML is reduced to span/b/i/…/svg+use with class/title only. */
    decorate(fn) {
      if (!isFn(fn)) throw new TypeError('edx.docList.decorate: function required');
      decorators.push(fn);
      changed('docviews');
      return () => { const i = decorators.indexOf(fn); if (i >= 0) { decorators.splice(i, 1); changed('docviews'); } };
    },
    badges(meta) {
      if (!decorators.length) return '';
      let out = '';
      decorators.forEach((fn) => { try { out += safeHTML(fn(meta) || ''); } catch (e) { /* a broken decorator must not break the list */ } });
      return out;
    },
  };

  /* ====================== Menus ====================== */
  const MENU_WHERE = ['file', 'insert', 'more', 'doc', 'context'];
  const menuEntries = { file: [], insert: [], more: [], doc: [], context: [] };
  let menuSeq = 0;
  edx.menus = {
    /** add('file'|'insert'|'more'|'doc'|'context', itemSpec | (ctx) => itemSpec[]) → remove().
     *  Item: { label | labelKey, icon, kbd, run(ctx), checked, disabled, danger, order, when(ctx), items: [subitems] } | { sep: true } | { heading } */
    add(where, entry) {
      if (!MENU_WHERE.includes(where)) throw new TypeError('edx.menus.add: unknown menu ' + where);
      if (!isFn(entry) && (!entry || typeof entry !== 'object')) throw new TypeError('edx.menus.add: item spec or function required');
      const rec = { entry, _seq: menuSeq++, order: isFn(entry) ? 1000 : entry.order };
      menuEntries[where].push(rec);
      return () => { const i = menuEntries[where].indexOf(rec); if (i >= 0) menuEntries[where].splice(i, 1); };
    },
    /** Registered items of a menu, resolved for the given context (labels are plain strings, run() bound to ctx). */
    items(where, ctx) {
      const out = [];
      sortList(menuEntries[where].slice()).forEach((rec) => {
        let list;
        try { list = isFn(rec.entry) ? rec.entry(ctx) : rec.entry; } catch (e) { console.error('[Todo4Me editor] menu provider failed', e); return; }
        (Array.isArray(list) ? list : [list]).filter(Boolean).forEach((spec) => {
          const r = resolveMenuItem(spec, ctx);
          if (r) out.push(r);
        });
      });
      return out;
    },
    has: (where) => menuEntries[where].length > 0,
  };
  function resolveMenuItem(spec, ctx) {
    if (spec.when && !spec.when(ctx)) return null;
    if (spec.sep) return { sep: true };
    if (spec.heading) return { heading: text(spec, 'heading') };
    if (spec.html != null) return { html: spec.html, mount: spec.mount };
    const r = { label: text(spec), icon: spec.icon, kbd: spec.kbd ? String(spec.kbd) : '', checked: isFn(spec.checked) ? spec.checked(ctx) : spec.checked, danger: spec.danger, disabled: isFn(spec.disabled) ? spec.disabled(ctx) : spec.disabled };
    if (spec.items) {
      r.items = (isFn(spec.items) ? spec.items(ctx) : spec.items).map((s) => resolveMenuItem(s, ctx)).filter(Boolean);
      if (!r.items.length) return null;
    } else r.run = () => { if (isFn(spec.run)) return spec.run(ctx); return undefined; };
    return r;
  }

  /* ====================== Document meta ====================== */
  const metaFields = new Map();
  const META_RE = /^[a-z][a-z0-9]{1,11}_[a-zA-Z][a-zA-Z0-9]{0,30}$/;
  const clonePlain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  edx.meta = {
    /** extend({ knowledge_tags: { default: [], clean(v) → v, dup: 'copy' | 'reset' } }) — field names are '<module>_<name>'. */
    extend(fields) {
      Object.entries(fields || {}).forEach(([name, spec]) => {
        if (!META_RE.test(name)) throw new TypeError('edx.meta.extend: field "' + name + '" must be named <module>_<name>');
        if (!spec || !isFn(spec.clean) || !('default' in spec)) throw new TypeError('edx.meta.extend: "' + name + '" needs default and clean()');
        if (metaFields.has(name)) throw new Error('edx.meta.extend: "' + name + '" is already registered');
        metaFields.set(name, { default: clonePlain(spec.default), clean: spec.clean, dup: spec.dup === 'reset' ? 'reset' : 'copy' });
      });
    },
    fields: () => Array.from(metaFields.keys()),
    has: (name) => metaFields.has(name),
    /** Used by docstore.cleanMeta: copy the registered fields of `m` into `out` (cleaned, defaults filled in). */
    applyTo(m, out) {
      metaFields.forEach((spec, name) => {
        let v;
        try { v = spec.clean(m[name] === undefined ? clonePlain(spec.default) : m[name]); } catch (e) { v = undefined; }
        if (v === undefined) v = clonePlain(spec.default);
        try { out[name] = clonePlain(v); } catch (e) { out[name] = clonePlain(spec.default); }
      });
    },
    /** Field values to reset when a document is duplicated. */
    resetOnDuplicate(out) { metaFields.forEach((spec, name) => { if (spec.dup === 'reset') out[name] = clonePlain(spec.default); }); },
    pick(patch) { const o = {}; metaFields.forEach((s, name) => { if (patch && name in patch) o[name] = patch[name]; }); return o; },
  };

  /* ====================== Import / export ====================== */
  const exporters = makeList('exporters');
  const importers = [];
  const BUILTIN_IMPORT_EXTS = ['md', 'markdown', 'txt', 'html', 'htm', 'json'];
  edx.exporters = {
    /** register({ id, label | labelKey, ext, mime, icon, run(doc: { id, meta, html }) → Promise<Blob | string | ArrayBuffer | Uint8Array | { handled: true } | undefined> }) */
    register(spec) {
      if (!spec || !isFn(spec.run) || !/^[a-z0-9]{1,8}$/.test(spec.ext || '')) throw new TypeError('edx.exporters.register: run() and ext required');
      return exporters.add(spec);
    },
    remove: exporters.remove,
    get: exporters.get,
    list: exporters.list,
    /** Export a stored document with a registered exporter (flushes pending edits first, shows a toast). */
    export: (id, docId) => edx.editor.exportWith(id, docId),
  };
  edx.importers = {
    /** register({ id, exts: ['docx'], accept: '.docx,application/…', run(file) → Promise<{ title, html, meta?, report? }> }) → remove() */
    register(spec) {
      if (!spec || !isFn(spec.run) || !Array.isArray(spec.exts) || !spec.exts.length) throw new TypeError('edx.importers.register: exts and run() required');
      checkId('importers', spec.id);
      const exts = spec.exts.map((x) => String(x).toLowerCase().replace(/^\./, ''));
      if (exts.some((x) => !/^[a-z0-9]{1,8}$/.test(x) || BUILTIN_IMPORT_EXTS.includes(x))) throw new Error('edx.importers.register: invalid or built-in extension');
      if (importers.some((i) => i.id === spec.id)) throw new Error('edx.importers.register: "' + spec.id + '" is already registered');
      const rec = Object.assign({}, spec, { exts });
      importers.push(rec);
      changed('importers');
      return () => { const i = importers.indexOf(rec); if (i >= 0) { importers.splice(i, 1); changed('importers'); } };
    },
    remove(id) { const i = importers.findIndex((x) => x.id === id); if (i >= 0) { importers.splice(i, 1); changed('importers'); } return i >= 0; },
    list: () => importers.slice(),
    forFile(file) {
      const m = /\.([A-Za-z0-9]+)$/.exec((file && file.name) || '');
      const ext = m ? m[1].toLowerCase() : '';
      return importers.find((i) => i.exts.includes(ext)) || null;
    },
    /** Extra values for the file input's accept attribute. */
    accept() { return importers.map((i) => i.accept || i.exts.map((x) => '.' + x).join(',')).join(','); },
  };
  /** download(data, filename, mime): save a Blob / string / ArrayBuffer / typed array. Works in the browser and in the desktop app
   *  (the desktop save dialog is chosen by file extension: md, json, docx, html, txt; other extensions get an "all files" filter). */
  edx.download = function (data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const safe = String(filename || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 150) || 'document';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return safe;
  };
  /** report(title, items): dialog for conversion notes. items: string | { level: 'info'|'warn'|'error', text } | { heading }. Resolves when closed. */
  edx.report = function (title, items) {
    items = (items || []).map((it) => (typeof it === 'string' ? { level: 'warn', text: it } : it)).filter(Boolean);
    if (!items.length) return Promise.resolve(false);
    const ic = { info: 'check', warn: 'alert', error: 'x' };
    const body = '<ul class="ed-report">' + items.map((it) => (it.heading
      ? '<li class="ed-report__heading">' + esc(it.heading) + '</li>'
      : '<li class="ed-report__item ed-report__item--' + (ic[it.level] ? it.level : 'warn') + '">' + icon(ic[it.level] || 'alert') + '<span>' + esc(it.text) + '</span></li>')).join('') + '</ul>';
    return new Promise((resolve) => {
      T4.ui.openModal({
        title, size: 'sm', body,
        footer: '<button type="button" class="btn btn--primary" data-action="modal-close">' + esc(T4.i18n.t('c.close')) + '</button>',
        onClose: () => resolve(true),
      });
    });
  };

  /* ====================== Search ====================== */
  const providers = [];
  edx.search = {
    /** register({ id, order, query(q, ctx) → [{ id, score?, snippet? }] | Promise }) — extra matches (OR) next to the built-in title/text search.
     *  `snippet` is plain text (it is escaped when shown). */
    register(p) {
      if (!p || !isFn(p.query)) throw new TypeError('edx.search.register: query(q) required');
      checkId('search', p.id);
      if (providers.some((x) => x.id === p.id)) throw new Error('edx.search.register: "' + p.id + '" is already registered');
      providers.push(p);
      changed('search');
      return () => edx.search.remove(p.id);
    },
    remove(id) { const i = providers.findIndex((x) => x.id === id); if (i >= 0) { providers.splice(i, 1); changed('search'); } return i >= 0; },
    list: () => providers.slice(),
    /** All results of all providers (built-in first), merged by document id: Promise<[{ id, score, snippet, provider }]>. */
    async query(q, ctx) {
      q = String(q || '').trim();
      if (!q) return [];
      const merged = new Map();
      for (const p of providers) {
        let res = [];
        try { res = await p.query(q, ctx || {}); } catch (e) { console.error('[Todo4Me editor] search provider ' + p.id + ' failed', e); }
        (res || []).forEach((r) => {
          if (!r || typeof r.id !== 'string') return;
          const cur = merged.get(r.id);
          if (!cur) merged.set(r.id, { id: r.id, score: r.score || 0, snippet: r.snippet || '', provider: p.id });
          else { cur.score = Math.max(cur.score, r.score || 0); if (!cur.snippet && r.snippet) cur.snippet = r.snippet; }
        });
      }
      return Array.from(merged.values()).sort((a, b) => b.score - a.score);
    },
  };

  /* ====================== Print ====================== */
  const printCss = [], printBefore = [], printAfter = [];
  const removeFrom = (list, fn) => () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  edx.print = {
    /** addCSS(fn(meta) → css) — appended to the generated print stylesheet (only while exporting). */
    addCSS(fn) { printCss.push(fn); return removeFrom(printCss, fn); },
    /** before(fn({ meta, root })) / after(fn(...)): run around PDF export (awaited); use to expand collapsed content, then restore it. */
    before(fn) { printBefore.push(fn); return removeFrom(printBefore, fn); },
    after(fn) { printAfter.push(fn); return removeFrom(printAfter, fn); },
    css(meta) {
      return printCss.map((fn) => { try { return String(fn(meta) || '').replace(/<\/style/gi, ''); } catch (e) { return ''; } }).join('\n');
    },
    async runBefore(ctx) { for (const fn of printBefore.slice()) { try { await fn(ctx); } catch (e) { console.error(e); } } },
    async runAfter(ctx) { for (const fn of printAfter.slice()) { try { await fn(ctx); } catch (e) { console.error(e); } } },
  };
  // Page setup (edx.page.extend) is intentionally not provided: stored page settings are a fixed, validated set
  // (docstore.cleanPage). Modules keep per-document layout options in their own meta fields (edx.meta.extend) and
  // contribute print CSS with edx.print.addCSS.

  /* ====================== Editor facade, docs, database ====================== */
  const editorImpl = {};
  const editor = { t };
  ['current', 'root', 'readonly', 'run', 'insertBlock', 'insertInlineWidget', 'insertHTML', 'insertText', 'getSel', 'setSel', 'rememberSelection', 'restore', 'selectedText',
    'textOf', 'snapshot', 'setHtml', 'openDoc', 'newDocument', 'flush', 'toast', 'openMenu', 'closeMenu', 'openModal', 'closeModal', 'confirm', 'scrollToBlock', 'headings',
    'exportWith', 'ready', 'cachedDocs', 'banner', 'clearBanner'].forEach((name) => {
    editor[name] = function () {
      if (!isFn(editorImpl[name])) throw new Error('edx.editor.' + name + ' is not available yet (the editor has not loaded)');
      return editorImpl[name].apply(null, arguments);
    };
  });
  edx.editor = editor;
  edx._bindEditor = (impl) => Object.assign(editorImpl, impl);

  edx.docs = {
    /** Fresh list of all document metas (including trashed). */
    list: () => T4.docstore.list(),
    /** { meta, html } or null. */
    get: (id) => T4.docstore.get(id),
    /** Metadata-only update through docstore (validated by cleanMeta, so registered meta fields work); does not count as an edit. Emits 'doc-meta'. */
    updateMeta: (id, patch) => editorImpl.updateMeta ? editorImpl.updateMeta(id, patch) : T4.docstore.touch(id, patch),
  };
  edx.db = {
    get versions() { return T4.docstore.versions; },
    get kv() { return T4.docstore.kv; },
  };

  return edx;
})();
