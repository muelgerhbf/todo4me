/* Todo4Me — shared helpers of the import/export module (T4.edio.common): XML/HTML helpers, page geometry, conversion report,
 * image + SVG rasterising, KaTeX MathML, wikilink titles. No document is modified here. */
(function () {
  'use strict';
  const edio = (window.T4.edio = window.T4.edio || {});
  const X = () => window.T4.edx;
  const t = (key, fb, params) => X().t('edx.io.' + key, fb, params);

  /* ---------- XML / text ---------- */
  // eslint-disable-next-line no-control-regex
  const BAD_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
  const xe = (s) => String(s == null ? '' : s).replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const he = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Parse stored document HTML into an inert body element (no resources are loaded, no scripts run). */
  function parseBody(html) {
    return new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html').body;
  }
  function props(el) {
    try { const p = JSON.parse(el.getAttribute('data-p') || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; }
  }
  const isWidget = (n) => n && n.nodeType === 1 && n.classList.contains('t4-w');
  const wtype = (n) => n.getAttribute('data-w');

  /* ---------- colours ---------- */
  let cctx = null;
  function cssColor(v) {
    v = String(v || '').trim().toLowerCase();
    if (!v || v === 'transparent' || v === 'inherit' || v === 'none') return null;
    let m = /^#([0-9a-f]{3})$/.exec(v);
    if (m) return m[1].split('').map((c) => c + c).join('').toUpperCase();
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
    if (m) return m[1].toUpperCase();
    m = /^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?/.exec(v);
    if (m) return [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(+x))).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (/^[a-z]{3,20}$/.test(v)) {
      try {
        if (!cctx) cctx = document.createElement('canvas').getContext('2d');
        cctx.fillStyle = '#010203'; cctx.fillStyle = v;
        const r = cctx.fillStyle;
        if (/^#[0-9a-f]{6}$/i.test(r) && !(r.toLowerCase() === '#010203' && v !== 'black')) return r.slice(1).toUpperCase();
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  /* ---------- page geometry ---------- */
  const SIZES = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210], Legal: [215.9, 355.6], A3: [297, 420], B5: [176, 250], Executive: [184.15, 266.7], Tabloid: [279.4, 431.8] };
  const MARGINS = { normal: [25.4, 25.4, 25.4, 25.4], narrow: [12.7, 12.7, 12.7, 12.7], moderate: [25.4, 19.05, 25.4, 19.05], wide: [25.4, 50.8, 25.4, 50.8] };
  /** Page setup object → { w, h, landscape, margins: [t, r, b, l] (mm), known }. Uses the document store's geometry (sizes incl. Custom, custom margins). */
  function geometry(page) {
    page = page && typeof page === 'object' ? page : {};
    const DS = window.T4.docstore;
    if (DS && typeof DS.pageGeometry === 'function') {
      try {
        const g = DS.pageGeometry(page);
        const m = g.margins;
        return { w: g.widthMm, h: g.heightMm, landscape: g.widthMm > g.heightMm, margins: [m.t, m.r, m.b, m.l], known: true };
      } catch (e) { /* fall back */ }
    }
    let known = true;
    let size = SIZES[page.size];
    if (!size) { if (page.size && page.size !== 'custom') known = false; size = SIZES.A4; }
    let [w, h] = size;
    const landscape = page.orientation === 'landscape';
    if (landscape) { const x = w; w = h; h = x; }
    let m = MARGINS[page.margins];
    if (!m) { if (page.margins) known = false; m = MARGINS.normal; }
    return { w, h, landscape, margins: m.slice(), known };
  }
  /** The six header/footer boxes with {title}/{date} filled in, and where the page number goes. */
  function hfSlots(page, meta) {
    const p = page || {};
    const f = (s) => fillTokens(s, meta);
    return { tl: f(p.headerL), tc: f(p.header), tr: f(p.headerR), bl: f(p.footer), bc: f(p.footerC), br: f(p.footerR), numBox: { 'bottom-center': 'bc', 'bottom-right': 'br', 'top-right': 'tr' }[p.pageNumbers] || null };
  }
  const mmToTw = (mm) => Math.round(mm * 56.6929);
  function fillTokens(s, meta) {
    return String(s || '').replace(/\{title\}/gi, (meta && meta.title && meta.title.trim()) || t('untitled', 'Untitled document'))
      .replace(/\{date\}/gi, new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()));
  }
  const pageOfText = () => X().t('ed.Page {a} of {b}', 'Page {a} of {b}');

  /* ---------- conversion report ---------- */
  function createReport() {
    const items = new Map();
    return {
      /** note(key, level, text) — the same key is reported once with a counter. */
      note(key, level, text) {
        const it = items.get(key);
        if (it) it.n++; else items.set(key, { level, text, n: 1 });
      },
      list() { return Array.from(items.values()).map((i) => ({ level: i.level, text: i.n > 1 ? i.text + ' (×' + i.n + ')' : i.text })); },
      get size() { return items.size; },
    };
  }

  /* ---------- libraries / widgets ---------- */
  async function ensureLibs() { try { return await window.T4.edw.ensureLibs(); } catch (e) { return false; } }
  function texMathML(tex, display) {
    if (!window.katex) return null;
    try { return window.katex.renderToString(String(tex || ''), { displayMode: !!display, output: 'mathml', throwOnError: false, strict: 'ignore', trust: false, maxSize: 50, maxExpand: 500 }); } catch (e) { return null; }
  }
  /** SVG markup + intrinsic size for chart / draw widgets. */
  function widgetSVG(type, p) {
    const W = window.T4.edw;
    const v = W.validate(type, p);
    if (!v) return null;
    if (type === 'chart') return { svg: W.chartSVG(v), w: 640, h: 360, widthPct: v.w, title: v.title || t('chart', 'Chart') };
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W.DRAW_W + ' ' + v.h + '">' + v.shapes.map(W.shapeSVG).join('') + '</svg>', w: W.DRAW_W, h: v.h, widthPct: 100, title: t('drawing', 'Drawing') };
  }

  /* ---------- images ---------- */
  function b64bytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function dims(bytes, ext) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    try {
      if (ext === 'png' && bytes.length > 24) return { w: v.getUint32(16), h: v.getUint32(20) };
      if (ext === 'gif' && bytes.length > 10) return { w: v.getUint16(6, true), h: v.getUint16(8, true) };
      if (ext === 'jpeg') {
        let p = 2;
        while (p + 9 < bytes.length) {
          if (bytes[p] !== 0xff) { p++; continue; }
          const m = bytes[p + 1];
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: v.getUint16(p + 5), w: v.getUint16(p + 7) };
          p += 2 + v.getUint16(p + 2);
        }
      }
    } catch (e) { /* fall through */ }
    return null;
  }
  async function canvasToPng(drawFn, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    await drawFn(ctx, c);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) throw new Error('canvas export failed');
    return new Uint8Array(await blob.arrayBuffer());
  }
  /** Stored asset → { bytes, ext: png|jpeg|gif, w, h } (WebP/BMP are re-encoded as PNG) or null. */
  async function loadAsset(id) {
    const url = await window.T4.docstore.assetDataURL(id);
    const m = url && /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(url);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    let bytes = b64bytes(m[2]);
    let ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : mime === 'image/gif' ? 'gif' : null;
    let d = ext ? dims(bytes, ext) : null;
    if (!ext || !d) {
      const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
      d = { w: bmp.width, h: bmp.height };
      if (!ext) {
        bytes = await canvasToPng((ctx) => ctx.drawImage(bmp, 0, 0), bmp.width, bmp.height);
        ext = 'png';
      }
      if (bmp.close) bmp.close();
    }
    return { bytes, ext, w: d.w, h: d.h };
  }
  /** SVG markup → PNG bytes (scale × the intrinsic size). */
  async function svgToPng(svg, w, h, scale) {
    scale = scale || 2;
    const sized = svg.replace('<svg ', '<svg width="' + w + '" height="' + h + '" ');
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(sized)));
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG could not be rendered')); });
    return canvasToPng((ctx) => ctx.drawImage(img, 0, 0, w * scale, h * scale), w * scale, h * scale);
  }

  /* ---------- wikilinks: current titles ---------- */
  async function wikiTitles(root) {
    const ids = new Set();
    root.querySelectorAll('span.t4-w[data-w="wikilink"]').forEach((n) => { const p = props(n); if (p.d) ids.add(p.d); });
    const map = new Map();
    if (!ids.size) return map;
    try {
      const docs = await X().docs.list();
      docs.forEach((d) => { if (ids.has(d.id) && !d.deletedAt) map.set(d.id, (d.title && d.title.trim()) || t('untitled', 'Untitled document')); });
    } catch (e) { /* titles fall back to the stored text */ }
    return map;
  }
  const wikiText = (el, map) => { const p = props(el); return map.get(p.d) || String(p.t || ''); };

  /* ---------- misc ---------- */
  const collapse = (s) => String(s).replace(/[ \t\r\n\f]+/g, ' ');
  const langOf = () => { try { return window.T4.i18n.language() || 'en'; } catch (e) { return 'en'; } };
  const CALLOUT_KINDS = ['note', 'tip', 'info', 'warning', 'danger'];
  const calloutKind = (el) => { for (const k of CALLOUT_KINDS) if (el.classList.contains('t4-callout--' + k)) return k; return el.classList.contains('t4-callout') ? 'note' : null; };
  const CALLOUT_COLORS = { note: ['4F6BED', 'EEF1FF'], tip: ['2F9E55', 'EAF7EF'], info: ['0E7C86', 'E6F5F6'], warning: ['C98A12', 'FFF6E0'], danger: ['D14343', 'FDECEC'] };
  const sanitizerKeeps = (html, needle) => { try { return window.T4.edSanitize.sanitizeToString(html).indexOf(needle) >= 0; } catch (e) { return false; } };

  edio.common = {
    t, xe, he, parseBody, props, isWidget, wtype, cssColor, geometry, hfSlots, mmToTw, fillTokens, pageOfText, createReport, ensureLibs, texMathML,
    widgetSVG, loadAsset, svgToPng, canvasToPng, b64bytes, bytesToB64, dims, wikiTitles, wikiText, collapse, langOf, calloutKind, CALLOUT_COLORS, CALLOUT_KINDS,
    sanitizerKeeps, SIZES, MARGINS,
  };
})();
