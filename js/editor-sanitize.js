/* Todo4Me — document HTML sanitizer for the editor.
 *
 * Every piece of HTML that enters a document (loading from storage, paste, import,
 * undo snapshots) passes through sanitize(). It keeps an explicit allowlist of tags,
 * attributes and CSS properties and drops everything else, so documents can never
 * carry scripts, remote resources or layout-breaking markup.
 *
 * Document format (see README "Documents"):
 *  - block elements: p, h1–h6, blockquote, ul/ol/li, table, hr
 *  - inline formatting: b/strong, i/em, u, s, mark, sub, sup, code, a, span[style]
 *  - widgets: <figure|span class="t4-w" data-w="type" data-p="{json}">; their
 *    rendered content is rebuilt from data-p, never trusted from the HTML. */
T4.edSanitize = (function () {
  'use strict';

  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR']);
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'MARK', 'SUB', 'SUP', 'CODE', 'A', 'SPAN', 'BR']);
  const RENAME = { STRIKE: 'S', DEL: 'S', INS: 'U', FONT: 'SPAN', TT: 'CODE', KBD: 'CODE', SAMP: 'CODE', VAR: 'I', CITE: 'I', DFN: 'I', BIG: 'SPAN', SMALL: 'SPAN', ABBR: 'SPAN', Q: 'SPAN' };
  // Dropped together with their content.
  const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'LINK', 'META', 'TITLE',
    'HEAD', 'NOSCRIPT', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'OPTION',
    'FORM', 'DIALOG', 'MAP', 'AREA', 'BASE', 'COLGROUP', 'COL', 'CAPTION', 'FIGCAPTION', 'XML']);
  const WIDGETS = ['img', 'draw', 'chart', 'math', 'code', 'pagebreak'];

  const FONTS = ['Calibri', 'Fira Code', 'Arial', 'Georgia', 'Times New Roman', 'Verdana'];
  const FONT_STACK = {
    Calibri: 'Calibri, Carlito, "Segoe UI", sans-serif',
    'Fira Code': '"Fira Code", Consolas, monospace',
    Arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
    Georgia: 'Georgia, "Times New Roman", serif',
    'Times New Roman': '"Times New Roman", "Liberation Serif", Times, serif',
    Verdana: 'Verdana, "DejaVu Sans", sans-serif',
  };
  /** Map any font-family value to one of the supported fonts (or null). */
  function canonicalFont(v) {
    const first = String(v || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (!first) return null;
    const hit = FONTS.find((f) => f.toLowerCase() === first);
    if (hit) return hit;
    if (/^carlito$/.test(first)) return 'Calibri';
    if (/mono|consol|courier|cascadia|fira/.test(first)) return 'Fira Code';
    if (/times|cambria|serif/.test(first) && !/sans/.test(first)) return 'Times New Roman';
    if (/helvetica|arial|liberation sans/.test(first)) return 'Arial';
    return null;
  }

  const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;
  const LENGTH = /^-?\d{1,4}(\.\d{1,3})?(px|pt|em|rem|%|cm|mm|in)?$/i;
  const ALIGN = ['left', 'right', 'center', 'justify', 'start', 'end'];
  const LIST_TYPES = ['disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'lower-latin', 'upper-latin'];

  function toPx(v) {
    const m = String(v).trim().match(/^(-?[\d.]+)(px|pt|em|rem|cm|mm|in)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const u = (m[2] || 'px').toLowerCase();
    return u === 'pt' ? n * 4 / 3 : u === 'em' || u === 'rem' ? n * 16 : u === 'cm' ? n * 37.8 : u === 'mm' ? n * 3.78 : u === 'in' ? n * 96 : n;
  }
  const clampLen = (v, min, max) => {
    const px = toPx(v);
    if (px == null) return null;
    return Math.round(Math.max(min, Math.min(max, px)) * 100) / 100 + 'px';
  };

  /* CSS properties allowed per element kind, each with a value filter (returns the clean value or null). */
  const STYLE_RULES = {
    'color': (v) => (COLOR.test(v) && !/^(inherit|initial|unset|windowtext)$/i.test(v) ? v : null),
    'background-color': (v) => (COLOR.test(v) && !/^(inherit|initial|unset|transparent|window)$/i.test(v) ? v : null),
    'font-family': (v) => { const f = canonicalFont(v); return f ? FONT_STACK[f] : null; },
    'font-size': (v) => {
      if (LENGTH.test(v)) { const px = toPx(v); return px && px >= 6 && px <= 200 ? Math.round(px * 0.75 * 2) / 2 + 'pt' : null; }
      const kw = { 'x-small': '7.5pt', small: '10pt', medium: '12pt', large: '13.5pt', 'x-large': '18pt', 'xx-large': '24pt', 'xxx-large': '36pt' }[v];
      return kw || null;
    },
    'font-weight': (v) => (/^(bold|bolder|[6-9]00)$/.test(v) ? 'bold' : /^(normal|[1-4]00)$/.test(v) ? 'normal' : null),
    'font-style': (v) => (v === 'italic' || v === 'normal' ? v : null),
    'text-decoration-line': (v) => (/^(underline|line-through|none)( (underline|line-through))?$/.test(v) ? v : null),
    'text-decoration': (v) => { const m = v.match(/(underline|line-through)/g); return m ? Array.from(new Set(m)).join(' ') : null; },
    'vertical-align': (v) => (v === 'super' || v === 'sub' ? v : null),
  };
  const BLOCK_STYLE_RULES = {
    'text-align': (v) => (ALIGN.includes(v) ? v.replace('start', 'left').replace('end', 'right') : null),
    'line-height': (v) => { const n = parseFloat(v); if (/^[\d.]+$/.test(v) && n >= 0.8 && n <= 4) return String(n); if (/%$/.test(v) && n >= 80 && n <= 400) return String(n / 100); return null; },
    'margin-top': (v) => clampLen(v, 0, 120),
    'margin-bottom': (v) => clampLen(v, 0, 120),
    'margin-left': (v) => clampLen(v, 0, 400),
    'padding-left': (v) => clampLen(v, 0, 400),
    'text-indent': (v) => clampLen(v, -200, 200),
    'background-color': STYLE_RULES['background-color'],
    'color': STYLE_RULES.color,
    'font-family': STYLE_RULES['font-family'],
    'font-size': STYLE_RULES['font-size'],
  };
  const LIST_STYLE_RULES = Object.assign({}, BLOCK_STYLE_RULES, {
    'list-style-type': (v) => (LIST_TYPES.includes(v) ? v : null),
  });
  const CELL_STYLE_RULES = {
    'background-color': STYLE_RULES['background-color'],
    'text-align': BLOCK_STYLE_RULES['text-align'],
    'vertical-align': (v) => (['top', 'middle', 'bottom'].includes(v) ? v : null),
    'color': STYLE_RULES.color,
  };

  function cleanStyle(src, rules) {
    if (!src || !src.style || !src.style.length) return '';
    const out = [];
    for (let i = 0; i < src.style.length; i++) {
      const prop = src.style[i];
      const rule = rules[prop];
      if (!rule) continue;
      const val = rule(src.style.getPropertyValue(prop).trim());
      if (val != null && !out.some((o) => o[0] === prop)) out.push([prop, val]);
    }
    return out.map((o) => o[0] + ': ' + o[1]).join('; ');
  }

  function safeHref(href) {
    href = String(href || '').trim();
    if (!href) return null;
    if (/^(https?:|mailto:)/i.test(href)) return href.slice(0, 2000);
    if (/^#[\w-]{0,200}$/.test(href)) return href;
    if (/^www\./i.test(href)) return 'https://' + href.slice(0, 2000);
    return null;
  }

  // Rules registered by feature modules (js/editor-registry.js). Looked up at use time; the registry is loaded before this file.
  const X = () => T4.edx;
  const SX = () => (T4.edx && T4.edx.sanitizer.hasRules() ? T4.edx.sanitizer : null);

  /* ---------- Widget validation is delegated to the widget module (if loaded). ---------- */
  function validWidget(el) {
    const type = el.getAttribute('data-w');
    if (!WIDGETS.includes(type) && !(X() && X().widgets.has(type))) return null;
    let props = {};
    try { props = JSON.parse(el.getAttribute('data-p') || '{}'); } catch (e) { return null; }
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    const reg = X() && !WIDGETS.includes(type);
    const v = reg ? T4.edx.widgets.validate(type, props) : T4.edw && T4.edw.validate ? T4.edw.validate(type, props) : props;
    return v ? { type, props: v } : null;
  }

  function buildWidget(doc, src, w) {
    const inline = (w.type === 'math' && src.tagName === 'SPAN') || (!WIDGETS.includes(w.type) && X().widgets.isInline(w.type));
    const el = doc.createElement(inline ? 'span' : 'figure');
    el.className = 't4-w';
    el.setAttribute('data-w', w.type);
    el.setAttribute('data-p', JSON.stringify(w.props));
    if (w.type === 'code') {
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');
      const srcCode = src.querySelector('textarea') || src.querySelector('pre');
      code.textContent = srcCode ? (srcCode.tagName === 'TEXTAREA' ? srcCode.value : srcCode.textContent) : '';
      pre.appendChild(code);
      el.appendChild(pre);
    }
    return el;
  }

  /* ---------- Main walk ---------- */
  function cleanChildren(src, dst, doc, ctx) {
    Array.from(src.childNodes).forEach((n) => cleanNode(n, dst, doc, ctx));
  }

  function cleanNode(n, dst, doc, ctx) {
    if (n.nodeType === 3) { dst.appendChild(doc.createTextNode(n.nodeValue)); return; }
    if (n.nodeType !== 1) return; // comments, processing instructions…
    let tag = n.tagName.toUpperCase();
    if (DROP.has(tag)) return;
    // Word/Office artefacts like <o:p>
    if (tag.indexOf(':') !== -1) { cleanChildren(n, dst, doc, ctx); return; }

    if ((tag === 'FIGURE' || tag === 'SPAN' || tag === 'DIV') && n.classList && n.classList.contains('t4-w')) {
      const w = validWidget(n);
      if (w) dst.appendChild(buildWidget(doc, n, w));
      return;
    }
    if (tag === 'IMG') {
      // Images are only kept as widgets; pasted <img> with a data: URL is handed to the caller.
      const src = n.getAttribute('src') || '';
      if (ctx.onImage && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src)) {
        const ph = ctx.onImage(src, n.getAttribute('alt') || '');
        if (ph) dst.appendChild(ph);
      }
      return;
    }
    if (tag === 'PRE') {
      // Plain <pre> (e.g. pasted code) becomes a code widget.
      const lang = (n.querySelector('code') && (n.querySelector('code').className.match(/language-([\w+#-]+)/) || [])[1]) || '';
      const props = T4.edw && T4.edw.validate ? T4.edw.validate('code', { lang }) : { lang };
      const el = doc.createElement('figure');
      el.className = 't4-w';
      el.setAttribute('data-w', 'code');
      el.setAttribute('data-p', JSON.stringify(props || { lang: '' }));
      el.innerHTML = '<pre><code></code></pre>';
      el.querySelector('code').textContent = n.textContent.replace(/\n$/, '');
      dst.appendChild(el);
      return;
    }
    const rs = SX();
    let rk = rs ? rs.tagKind(tag) : null;
    if (rk === 'container' && !rs.isContainer(n)) rk = null;
    if (!rk && (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE' || tag === 'NAV' || tag === 'BODY' || tag === 'HTML' || tag === 'CENTER' || tag === 'ADDRESS' || tag === 'DETAILS' || tag === 'SUMMARY' || tag === 'FIGURE' || tag === 'DL' || tag === 'DT' || tag === 'DD')) {
      // Containers: keep block children; wrap loose inline content in paragraphs.
      const hasBlock = Array.from(n.children).some((c) => BLOCKS.has(c.tagName) || /^(DIV|PRE|FIGURE|SECTION|ARTICLE)$/.test(c.tagName) || (c.classList && c.classList.contains('t4-w')));
      if (hasBlock || ctx.inline) { cleanChildren(n, dst, doc, ctx); return; }
      tag = 'P';
      if (tag === 'P' && dst.nodeType === 1 && /^(P|H[1-6]|LI|TD|TH)$/.test(dst.tagName)) { cleanChildren(n, dst, doc, ctx); return; }
    }
    if (RENAME[tag]) tag = RENAME[tag];
    if (rk && (BLOCKS.has(tag) || INLINE.has(tag))) rk = null; // built-in tags keep their built-in handling
    if (!BLOCKS.has(tag) && !INLINE.has(tag) && !rk) { cleanChildren(n, dst, doc, ctx); return; }

    const el = doc.createElement(tag);
    let style = '';
    if (rk === 'inline') style = cleanStyle(n, STYLE_RULES);
    else if (rk === 'block') style = cleanStyle(n, BLOCK_STYLE_RULES);
    else if (rk === 'container') style = '';
    else if (tag === 'SPAN' || tag === 'MARK' || tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM' || tag === 'U' || tag === 'S' || tag === 'A' || tag === 'CODE') {
      style = cleanStyle(n, STYLE_RULES);
      if (n.tagName === 'FONT') {
        const parts = [];
        const c = n.getAttribute('color'); if (c && COLOR.test(c)) parts.push('color: ' + c);
        const f = canonicalFont(n.getAttribute('face')); if (f) parts.push('font-family: ' + FONT_STACK[f]);
        const s = { 1: '7.5pt', 2: '10pt', 3: '12pt', 4: '13.5pt', 5: '18pt', 6: '24pt', 7: '36pt' }[n.getAttribute('size')]; if (s) parts.push('font-size: ' + s);
        style = [style].concat(parts).filter(Boolean).join('; ');
      }
    } else if (tag === 'UL' || tag === 'OL') {
      style = cleanStyle(n, LIST_STYLE_RULES);
    } else if (tag === 'TD' || tag === 'TH') {
      style = cleanStyle(n, CELL_STYLE_RULES);
    } else if (BLOCKS.has(tag) && tag !== 'HR' && tag !== 'TABLE' && tag !== 'TBODY' && tag !== 'THEAD' && tag !== 'TR') {
      style = cleanStyle(n, BLOCK_STYLE_RULES);
    }
    if (rs) {
      const extra = rs.styleRules(tag);
      if (extra) {
        const more = cleanStyle(n, extra);
        style = [style, more].filter(Boolean).join('; ');
      }
    }
    if (style) el.setAttribute('style', style);
    if (rs && rs.hasAttrRules(tag)) rs.applyAttrs(n, el, tag);

    if (tag === 'A') {
      const href = safeHref(n.getAttribute('href'));
      if (!href) { cleanChildren(n, dst, doc, ctx); return; }
      el.setAttribute('href', href);
      const title = n.getAttribute('title');
      if (title) el.setAttribute('title', title.slice(0, 300));
    }
    if (tag === 'OL') {
      const start = parseInt(n.getAttribute('start'), 10);
      if (start > 1 && start < 100000) el.setAttribute('start', String(start));
    }
    if (tag === 'TD' || tag === 'TH') {
      ['colspan', 'rowspan'].forEach((a) => {
        const v = parseInt(n.getAttribute(a), 10);
        if (v > 1 && v <= 50) el.setAttribute(a, String(v));
      });
    }
    if (tag === 'TABLE') el.className = 't4-table';
    if (tag === 'HR') { dst.appendChild(el); return; }
    if (tag === 'BR') { dst.appendChild(el); return; }

    const childCtx = (tag === 'P' || /^H[1-6]$/.test(tag) || rk === 'inline' || rk === 'block') ? Object.assign({}, ctx, { inline: true }) : ctx;
    cleanChildren(n, el, doc, childCtx);
    // Drop formatting wrappers that ended up empty (but keep empty paragraphs/cells).
    if ((INLINE.has(tag) || rk === 'inline') && tag !== 'BR' && !el.childNodes.length) return;
    if (tag === 'SPAN' && !el.attributes.length) { while (el.firstChild) dst.appendChild(el.firstChild); return; }
    dst.appendChild(el);
  }

  /* ---------- Structural normalization ---------- */
  const isBlockNode = (n) => n.nodeType === 1 && (BLOCKS.has(n.tagName) || (n.tagName === 'FIGURE' && n.classList.contains('t4-w')) || (!!SX() && (SX().isContainer(n) || SX().tagKind(n.tagName) === 'block')));

  function normalize(root, doc) {
    // 1) block widgets and blocks must not sit inside paragraphs/headings
    root.querySelectorAll('p figure.t4-w, h1 figure.t4-w, h2 figure.t4-w, h3 figure.t4-w, h4 figure.t4-w, h5 figure.t4-w, h6 figure.t4-w, li figure.t4-w, td figure.t4-w, th figure.t4-w').forEach((f) => {
      let host = f.parentNode;
      while (host.parentNode !== root && host.parentNode) host = host.parentNode;
      host.parentNode.insertBefore(f, host.nextSibling);
    });
    // 2) lists contain only <li>
    root.querySelectorAll('ul, ol').forEach((list) => {
      Array.from(list.childNodes).forEach((c) => {
        if (c.nodeType === 1 && (c.tagName === 'LI' || c.tagName === 'UL' || c.tagName === 'OL')) return;
        if (c.nodeType === 3 && !c.nodeValue.trim()) { c.remove(); return; }
        const li = doc.createElement('li');
        list.insertBefore(li, c);
        li.appendChild(c);
      });
    });
    // 3) tables: rows inside tbody/thead, cells inside rows
    root.querySelectorAll('table').forEach((t) => {
      Array.from(t.childNodes).forEach((c) => {
        if (c.nodeType === 1 && (c.tagName === 'TBODY' || c.tagName === 'THEAD')) return;
        if (c.nodeType === 1 && c.tagName === 'TR') {
          let body = t.querySelector(':scope > tbody');
          if (!body) { body = doc.createElement('tbody'); t.appendChild(body); }
          body.appendChild(c);
        } else c.remove();
      });
      t.querySelectorAll('tbody, thead').forEach((sec) => {
        Array.from(sec.childNodes).forEach((c) => { if (!(c.nodeType === 1 && c.tagName === 'TR')) c.remove(); });
      });
      t.querySelectorAll('tr').forEach((tr) => {
        Array.from(tr.childNodes).forEach((c) => { if (!(c.nodeType === 1 && (c.tagName === 'TD' || c.tagName === 'TH'))) c.remove(); });
        if (!tr.children.length) tr.remove();
      });
      t.querySelectorAll('td:empty, th:empty').forEach((c) => c.appendChild(doc.createElement('br')));
      if (!t.querySelector('tr')) t.remove();
    });
    // 4) top level: wrap loose inline nodes into paragraphs
    let para = null;
    Array.from(root.childNodes).forEach((c) => {
      if (isBlockNode(c)) { para = null; return; }
      if (c.nodeType === 3 && !c.nodeValue.trim() && !para) { c.remove(); return; }
      if (c.nodeType === 1 && (c.tagName === 'LI')) { const ul = doc.createElement('ul'); root.insertBefore(ul, c); ul.appendChild(c); para = null; return; }
      if (c.nodeType === 1 && /^(TR|TD|TH|TBODY|THEAD)$/.test(c.tagName)) { c.remove(); return; }
      if (!para) { para = doc.createElement('p'); root.insertBefore(para, c); }
      para.appendChild(c);
    });
    // 4b) registered block containers hold blocks: loose inline content is wrapped, an empty one gets a paragraph
    const rs = SX();
    const csel = rs ? rs.containerSelector() : '';
    if (csel) {
      Array.from(root.querySelectorAll(csel)).reverse().forEach((c) => {
        if (!rs.isContainer(c)) return;
        let p2 = null;
        Array.from(c.childNodes).forEach((k) => {
          if (isBlockNode(k) || (k.nodeType === 1 && k.tagName === 'SUMMARY')) { p2 = null; return; }
          if (k.nodeType === 3 && !k.nodeValue.trim() && !p2) { k.remove(); return; }
          if (!p2) { p2 = doc.createElement('p'); c.insertBefore(p2, k); }
          p2.appendChild(k);
        });
        if (!Array.from(c.children).some((k) => k.tagName !== 'SUMMARY' && isBlockNode(k))) { const p3 = doc.createElement('p'); p3.appendChild(doc.createElement('br')); c.appendChild(p3); }
      });
    }
    // 5) empty paragraphs/headings need a <br> to stay editable
    const bsel = rs ? rs.blockSelector() : '';
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote' + (bsel ? ', ' + bsel : '')).forEach((b) => {
      if (!b.childNodes.length) b.appendChild(doc.createElement('br'));
    });
    if (!root.childNodes.length) root.appendChild(doc.createElement('p')).appendChild(doc.createElement('br'));
  }

  /** Rename inline event-handler attributes (onclick=…) before parsing. They are dropped anyway, but
   *  the parser would already report them as CSP violations. Quoted attribute values are never touched. */
  function neutralizeHandlers(html) {
    if (!/\son[a-z]+\s*=/i.test(html)) return html;
    return html.replace(/<[a-zA-Z][^<>]*>/g, (tag) => {
      let out = '', q = null;
      for (let i = 0; i < tag.length; i++) {
        const ch = tag[i];
        if (q) { if (ch === q) q = null; out += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
        out += ch;
        if (/\s/.test(ch) && /^on[a-z]+\s*=/i.test(tag.slice(i + 1, i + 40))) out += 'data-blocked-';
      }
      return out;
    });
  }

  /**
   * sanitize(html, { onImage(dataUrl, alt) → Node|null, inline }) → DocumentFragment (in the current document)
   * Always returns a well-formed fragment; never throws for string input.
   */
  function sanitize(html, ctx) {
    ctx = ctx || {};
    const parsed = new DOMParser().parseFromString('<!doctype html><body>' + neutralizeHandlers(String(html || '')), 'text/html');
    const holder = document.createElement('div');
    cleanChildren(parsed.body, holder, document, ctx);
    if (!ctx.inline) normalize(holder, document);
    const frag = document.createDocumentFragment();
    while (holder.firstChild) frag.appendChild(holder.firstChild);
    return frag;
  }

  function sanitizeToString(html, ctx) {
    const d = document.createElement('div');
    d.appendChild(sanitize(html, ctx));
    return d.innerHTML;
  }

  return { sanitize, sanitizeToString, neutralizeHandlers, safeHref, canonicalFont, FONTS, FONT_STACK, WIDGETS };
})();
