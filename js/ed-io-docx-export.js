/* Todo4Me — DOCX export (T4.edio.docx.export). Writes OOXML by hand: styles, numbering, tables, images, footnotes, header/footer, equations (OMML).
 * Anything that cannot be represented is approximated and listed in the conversion report. */
(function () {
  'use strict';
  const edio = (window.T4.edio = window.T4.edio || {});
  const C = edio.common;
  const { xe, t } = C;
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const TW = 15; // twips per CSS px

  const FONT_OUT = { 'Fira Code': 'Consolas' };
  const HL_YELLOW = 'yellow';

  /* ---------- run + paragraph builders ---------- */
  function rPr(f) {
    let s = '';
    if (f.rStyle) s += '<w:rStyle w:val="' + f.rStyle + '"/>';
    if (f.font) { const n = xe(FONT_OUT[f.font] || f.font); s += '<w:rFonts w:ascii="' + n + '" w:hAnsi="' + n + '" w:cs="' + n + '" w:eastAsia="' + n + '"/>'; }
    if (f.b) s += '<w:b/><w:bCs/>';
    if (f.i) s += '<w:i/><w:iCs/>';
    if (f.s) s += '<w:strike/>';
    if (f.color) s += '<w:color w:val="' + f.color + '"/>';
    if (f.sz) s += '<w:sz w:val="' + f.sz + '"/><w:szCs w:val="' + f.sz + '"/>';
    if (f.hl) s += '<w:highlight w:val="' + HL_YELLOW + '"/>';
    if (f.u) s += '<w:u w:val="single"/>';
    if (f.shd) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + f.shd + '"/>';
    if (f.sup) s += '<w:vertAlign w:val="superscript"/>'; else if (f.sub) s += '<w:vertAlign w:val="subscript"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }
  function run(text, f) {
    text = String(text);
    if (!text) return '';
    const pr = rPr(f || {});
    return text.split('\t').map((part, i) => (i ? '<w:r>' + pr + '<w:tab/></w:r>' : '') + (part ? '<w:r>' + pr + '<w:t xml:space="preserve">' + xe(part) + '</w:t></w:r>' : '')).join('');
  }
  const brRun = '<w:r><w:br/></w:r>';
  const border = (side, color, sz, space) => '<w:' + side + ' w:val="single" w:sz="' + sz + '" w:space="' + space + '" w:color="' + color + '"/>';
  /** o: style, keepNext, pageBreakBefore, numId, ilvl, box {color, fill}, quote, bottomRule, shd, tabs, before, after, line, left, hanging, firstLine, jc */
  function para(runs, o) {
    o = o || {};
    let s = '';
    if (o.style) s += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) s += '<w:keepNext/>';
    if (o.pageBreakBefore) s += '<w:pageBreakBefore/>';
    if (o.numId != null) s += '<w:numPr><w:ilvl w:val="' + (o.ilvl || 0) + '"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
    if (o.box) s += '<w:pBdr>' + border('top', o.box.color, 6, 4) + border('left', o.box.color, 18, 6) + border('bottom', o.box.color, 6, 4) + border('right', o.box.color, 6, 6) + '</w:pBdr>';
    else if (o.quote) s += '<w:pBdr>' + border('left', 'C5CBE0', 18, 8) + '</w:pBdr>';
    else if (o.bottomRule) s += '<w:pBdr>' + border('bottom', 'C9CCD4', 6, 1) + '</w:pBdr>';
    const fill = o.box ? o.box.fill : o.shd;
    if (fill) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>';
    if (o.tabs) s += '<w:tabs>' + o.tabs + '</w:tabs>';
    if (o.before != null || o.after != null || o.line != null) {
      s += '<w:spacing' + (o.before != null ? ' w:before="' + o.before + '"' : '') + (o.after != null ? ' w:after="' + o.after + '"' : '') + (o.line != null ? ' w:line="' + o.line + '" w:lineRule="auto"' : '') + '/>';
    }
    if (o.left || o.hanging || o.firstLine || o.right) {
      s += '<w:ind' + (o.left ? ' w:left="' + Math.max(0, Math.round(o.left)) + '"' : '') + (o.right ? ' w:right="' + Math.round(o.right) + '"' : '') + (o.hanging ? ' w:hanging="' + Math.round(o.hanging) + '"' : o.firstLine ? ' w:firstLine="' + Math.round(o.firstLine) + '"' : '') + '/>';
    }
    if (o.jc) s += '<w:jc w:val="' + o.jc + '"/>';
    return '<w:p>' + (s ? '<w:pPr>' + s + '</w:pPr>' : '') + (runs || '') + '</w:p>';
  }
  const JC = { left: 'left', start: 'left', right: 'right', end: 'right', center: 'center', justify: 'both' };

  /** Formatting from an element's inline style (sanitized subset). */
  function styleFmt(el, f) {
    const st = el.style;
    if (!st || !st.length) return f;
    const o = Object.assign({}, f);
    const col = C.cssColor(st.color);
    if (col) o.color = col;
    const bg = C.cssColor(st.backgroundColor);
    if (bg) { o.shd = bg; o.hl = false; }
    if (st.fontFamily) { const c = window.T4.edSanitize.canonicalFont(st.fontFamily); if (c) o.font = c; }
    if (st.fontSize) { const m = /^([\d.]+)(pt|px)$/.exec(st.fontSize); if (m) o.sz = Math.max(2, Math.min(400, Math.round(parseFloat(m[1]) * (m[2] === 'px' ? 0.75 : 1) * 2))); }
    if (/^(bold|[6-9]00)$/.test(st.fontWeight)) o.b = true;
    if (st.fontStyle === 'italic') o.i = true;
    const td = st.textDecorationLine || st.textDecoration || '';
    if (/underline/.test(td)) o.u = true;
    if (/line-through/.test(td)) o.s = true;
    if (st.verticalAlign === 'super') o.sup = true; else if (st.verticalAlign === 'sub') o.sub = true;
    return o;
  }
  const pxTw = (v) => { const m = /^(-?[\d.]+)px$/.exec(v || ''); return m ? parseFloat(m[1]) * TW : null; };

  /* ====================== exporter ====================== */
  async function exportDocx(doc) {
    const rep = C.createReport();
    const zipW = edio.zip.createWriter();
    const body = C.parseBody(doc.html);
    const meta = doc.meta || {};
    const page = C.geometry(meta.page);
    if (!page.known) rep.note('page', 'warn', t('r.page', 'The page setup uses a size or margins Word export does not know; A4 with normal margins was used for the unknown part.'));
    const pageWtw = C.mmToTw(page.w), pageHtw = C.mmToTw(page.h);
    const mar = page.margins.map(C.mmToTw);
    const CW = pageWtw - mar[1] - mar[3];
    const CH = pageHtw - mar[0] - mar[2];
    await C.ensureLibs();
    const titles = await C.wikiTitles(body);

    const S = { rels: [], media: new Map(), mediaFiles: [], docPr: 0, bm: 0, notes: [], nums: [], abstracts: new Map(), bullets: new Map(), hasMath: false };
    let relN = 0;
    const addRel = (type, target, external) => { const id = 'rId' + (++relN); S.rels.push({ id, type, target, external }); return id; };
    const stylesRel = addRel('styles', 'styles.xml');
    const numRel = addRel('numbering', 'numbering.xml');
    const setRel = addRel('settings', 'settings.xml');
    void stylesRel; void numRel; void setRel;

    /* heading bookmarks */
    const headings = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const hbm = new Map();
    headings.forEach((h, i) => hbm.set(h, '_t4h' + i));
    const bmName = (id) => 'bm_' + String(id).replace(/\W/g, '_').slice(0, 36);

    /* ---------- numbering ---------- */
    const BULLETS = { disc: '•', circle: '◦', square: '▪' };
    const FMT = { decimal: 'decimal', 'lower-alpha': 'lowerLetter', 'lower-latin': 'lowerLetter', 'upper-alpha': 'upperLetter', 'upper-latin': 'upperLetter', 'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman' };
    const CYCLE = ['decimal', 'lowerLetter', 'lowerRoman'];
    function abstractFor(key, bullet, fmt0) {
      if (S.abstracts.has(key)) return S.abstracts.get(key).id;
      const id = S.abstracts.size + 1;
      let lv = '';
      for (let i = 0; i < 9; i++) {
        const left = 720 * (i + 1);
        if (bullet) {
          const ch = i === 0 ? bullet : ['◦', '▪'][(i - 1) % 2];
          lv += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + ch + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + left + '" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/></w:rPr></w:lvl>';
        } else {
          const fmt = i === 0 ? fmt0 : CYCLE[i % 3];
          lv += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="%' + (i + 1) + '."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + left + '" w:hanging="360"/></w:pPr></w:lvl>';
        }
      }
      S.abstracts.set(key, { id, xml: '<w:abstractNum w:abstractNumId="' + id + '"><w:multiLevelType w:val="hybridMultilevel"/>' + lv + '</w:abstractNum>' });
      return id;
    }
    function bulletNum(type) {
      const ch = BULLETS[type] || BULLETS.disc;
      if (S.bullets.has(ch)) return S.bullets.get(ch);
      const numId = S.nums.length + 1;
      S.nums.push({ numId, abs: abstractFor('b' + ch, ch), start: null });
      S.bullets.set(ch, numId);
      return numId;
    }
    function orderedNum(type, start, lvl) {
      const fmt = FMT[type] || 'decimal';
      const numId = S.nums.length + 1;
      S.nums.push({ numId, abs: abstractFor('o' + fmt, null, fmt), start, lvl });
      return numId;
    }

    /* ---------- images ---------- */
    async function imageXml(info, wTw, alt, name) {
      let rid = S.media.get(info.key);
      if (!rid) {
        const file = 'media/image' + (S.mediaFiles.length + 1) + '.' + info.ext;
        S.mediaFiles.push({ file, bytes: info.bytes });
        rid = addRel('image', file);
        S.media.set(info.key, rid);
      }
      let cx = wTw * 635, cy = Math.round(cx * info.h / info.w);
      const maxCy = (CH - 400) * 635;
      if (cy > maxCy) { cx = Math.round(cx * maxCy / cy); cy = maxCy; }
      cx = Math.round(cx);
      const id = ++S.docPr;
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="' + xe(name || 'Picture ' + id) + '" descr="' + xe(alt || '') + '"/>' +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + xe(name || 'Picture ' + id) + '" descr="' + xe(alt || '') + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    async function imageBlock(info, pct, alt, cap, jc, ctx, name) {
      const avail = CW - ctx.left;
      let wTw = Math.round(avail * Math.max(5, Math.min(100, pct)) / 100);
      wTw = Math.min(wTw, Math.round(info.w * TW)); // never enlarge beyond the natural size at 96 dpi
      wTw = Math.max(wTw, 600);
      let out = para(await imageXml(info, wTw, alt, name), { jc, keepNext: !!cap, left: ctx.left, after: cap ? 60 : undefined });
      if (cap) out += para(run(cap, {}), { style: 'Caption', jc, left: ctx.left });
      return out;
    }

    /* ---------- inline ---------- */
    function hyperlink(href, inner) {
      if (href.startsWith('#')) {
        const id = href.slice(1);
        return '<w:hyperlink w:anchor="' + bmName(id) + '" w:history="1">' + inner + '</w:hyperlink>';
      }
      if (!/^(https?:|mailto:)/i.test(href)) return inner;
      const rid = addRel('hyperlink', href, true);
      return '<w:hyperlink r:id="' + rid + '" w:history="1">' + inner + '</w:hyperlink>';
    }
    function inlineWidget(n, f) {
      const type = C.wtype(n), p = C.props(n);
      if (type === 'wikilink') return run(C.wikiText(n, titles), f);
      if (type === 'math') {
        const ml = C.texMathML(p.tex, false);
        const om = ml && edio.omml.mathmlToOmml(ml);
        if (om) { S.hasMath = true; return '<m:oMath>' + om + '</m:oMath>'; }
        rep.note('math', 'warn', t('r.math', 'A formula could not be converted to a Word equation and was exported as LaTeX text.'));
        return run('$' + (p.tex || '') + '$', Object.assign({}, f, { font: 'Fira Code' }));
      }
      if (type === 'footnote') {
        const id = S.notes.length + 1;
        S.notes.push({ id, text: String(p.text || '') });
        return '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="' + id + '"/></w:r>';
      }
      const tx = window.T4.edx.widgets.has(type) ? window.T4.edx.widgets.textOf(type, p, n) : '';
      rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented in Word and was exported as plain text.', { name: type }));
      return run(tx || '', f);
    }
    function inline(node, f, ctx) {
      let out = '';
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { out += run(C.collapse(n.nodeValue), f); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (tag === 'BR') { out += brRun; return; }
        if (C.isWidget(n)) { out += inlineWidget(n, f); return; }
        let g = f;
        if (tag === 'B' || tag === 'STRONG') g = Object.assign({}, g, { b: true });
        else if (tag === 'I' || tag === 'EM') g = Object.assign({}, g, { i: true });
        else if (tag === 'U') g = Object.assign({}, g, { u: true });
        else if (tag === 'S') g = Object.assign({}, g, { s: true });
        else if (tag === 'SUB') g = Object.assign({}, g, { sub: true });
        else if (tag === 'SUP') g = Object.assign({}, g, { sup: true });
        else if (tag === 'MARK') g = Object.assign({}, g, { hl: true });
        else if (tag === 'CODE') g = Object.assign({}, g, { rStyle: 'CodeChar' });
        g = styleFmt(n, g);
        if (tag === 'MARK' && g.shd) g.hl = false;
        if (tag === 'A') {
          const href = n.getAttribute('href') || '';
          out += hyperlink(href, inline(n, Object.assign({}, g, { rStyle: 'Hyperlink' }), ctx));
          return;
        }
        let inner = inline(n, g, ctx);
        const id = n.getAttribute && n.getAttribute('id');
        if (id) inner = bookmark(bmName(id), inner);
        out += inner;
      });
      return out;
    }
    function bookmark(name, inner) {
      const id = ++S.bm;
      return '<w:bookmarkStart w:id="' + id + '" w:name="' + xe(name) + '"/>' + inner + '<w:bookmarkEnd w:id="' + id + '"/>';
    }

    /* ---------- paragraph options from block style ---------- */
    function blockOpts(el, ctx) {
      const st = el.style || {};
      const o = { left: ctx.left || 0 };
      let f = {};
      if (st.length) {
        if (JC[st.textAlign]) o.jc = JC[st.textAlign];
        const lh = parseFloat(st.lineHeight);
        if (lh && Math.abs(lh - 1.15) > 0.02) o.line = Math.round(lh * 240);
        const mt = pxTw(st.marginTop), mb = pxTw(st.marginBottom);
        if (mt != null) o.before = Math.round(mt);
        if (mb != null) o.after = Math.round(mb);
        const ml = pxTw(st.marginLeft) || pxTw(st.paddingLeft);
        if (ml) o.left += ml;
        const ti = pxTw(st.textIndent);
        if (ti) { if (ti > 0) o.firstLine = ti; else o.hanging = -ti; }
        const bg = C.cssColor(st.backgroundColor);
        if (bg) o.shd = bg;
        const col = C.cssColor(st.color);
        if (col) f.color = col;
        if (st.fontFamily) { const c = window.T4.edSanitize.canonicalFont(st.fontFamily); if (c) f.font = c; }
        if (st.fontSize) f = styleFmt({ style: { length: 1, fontSize: st.fontSize } }, f);
      }
      if (ctx.box) o.box = ctx.box; else if (ctx.quote) o.quote = true;
      if (ctx.quote || ctx.box) o.left += 240;
      if (ctx.cell) { o.before = o.before != null ? o.before : 40; o.after = o.after != null ? o.after : 40; }
      return { o, f };
    }

    /* ---------- blocks ---------- */
    const hasBlockChild = (el) => Array.from(el.children).some((c) => /^(P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|HR|DIV|PRE|FIGURE)$/.test(c.tagName) || C.isWidget(c) && c.tagName === 'FIGURE');
    async function blocks(parent, ctx) {
      let out = '';
      let loose = [];
      const flush = () => {
        if (!loose.length) return;
        const holder = document.createElement('div');
        loose.forEach((n) => holder.appendChild(n.cloneNode(true)));
        const txt = holder.textContent.trim();
        if (txt || holder.querySelector('.t4-w')) { const b = blockOpts(holder, ctx); out += para(inline(holder, b.f, ctx), b.o); }
        loose = [];
      };
      for (const c of Array.from(parent.childNodes)) {
        if (c.nodeType === 3) { loose.push(c); continue; }
        if (c.nodeType !== 1) continue;
        if (C.isWidget(c) && c.tagName === 'SPAN') { loose.push(c); continue; }
        if (/^(B|STRONG|I|EM|U|S|MARK|SUB|SUP|CODE|A|SPAN|BR)$/.test(c.tagName)) { loose.push(c); continue; }
        flush();
        out += await block(c, ctx);
      }
      flush();
      return out;
    }
    async function block(el, ctx) {
      const tag = el.tagName;
      if (C.isWidget(el)) return blockWidget(el, ctx);
      if (/^H[1-6]$/.test(tag)) {
        const b = blockOpts(el, ctx);
        let runs = inline(el, b.f, ctx);
        const names = [hbm.get(el)];
        if (el.id) names.push(bmName(el.id));
        names.forEach((nm) => { if (nm) runs = bookmark(nm, runs); });
        return para(runs, Object.assign(b.o, { style: 'Heading' + tag[1] }));
      }
      if (tag === 'P') {
        const b = blockOpts(el, ctx);
        if (ctx.quote && !ctx.box) b.o.style = 'Quote';
        let runs = inline(el, b.f, ctx);
        if (el.id) runs = bookmark(bmName(el.id), runs);
        return para(runs, b.o);
      }
      if (tag === 'UL' || tag === 'OL') return list(el, ctx, 0);
      if (tag === 'HR') return para('', { bottomRule: true, after: 120, left: ctx.left });
      if (tag === 'BLOCKQUOTE') {
        const kind = C.calloutKind(el);
        if (kind) {
          const [color, fill] = C.CALLOUT_COLORS[kind];
          return blocks(el, Object.assign({}, ctx, { box: { color, fill } }));
        }
        return blocks(el, Object.assign({}, ctx, { quote: true }));
      }
      if (tag === 'TABLE') return table(el, ctx);
      if (tag === 'PRE') return codeBlock(el.textContent, ctx);
      if (tag === 'SUMMARY') { const b = blockOpts(el, ctx); return para(inline(el, Object.assign({}, b.f, { b: true }), ctx), b.o); }
      if (/^(DIV|DETAILS|SECTION|ARTICLE|ASIDE|FIGURE|NAV|HEADER|FOOTER|MAIN|FIELDSET|DL|DT|DD|ADDRESS|LI)$/.test(tag)) {
        return hasBlockChild(el) || el.querySelector('.t4-w') ? blocks(el, ctx) : (() => { const b = blockOpts(el, ctx); return para(inline(el, b.f, ctx), b.o); })();
      }
      const b = blockOpts(el, ctx);
      return para(inline(el, b.f, ctx), b.o);
    }
    function codeBlock(text, ctx) {
      const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
      return lines.map((ln, i) => para(run(ln, {}), { style: 'Code', left: ctx.left, after: i === lines.length - 1 ? 160 : 0 })).join('');
    }

    async function blockWidget(el, ctx) {
      const type = C.wtype(el), p = C.props(el);
      const jcOf = (al) => (al === 'left' || al === 'float-left' ? 'left' : al === 'right' || al === 'float-right' ? 'right' : 'center');
      if (type === 'img') {
        let info = null;
        try { info = await C.loadAsset(p.a); } catch (e) { info = null; }
        if (!info) { rep.note('img', 'warn', t('r.image', 'An image could not be read and was replaced by its description.')); return para(run('[' + (p.alt || p.cap || 'image') + ']', { i: true }), { left: ctx.left }); }
        info.key = p.a;
        if (/^float-/.test(p.al || '')) rep.note('float', 'info', t('r.float', 'Images with text wrapping are placed as ordinary block images.'));
        return imageBlock(info, p.w || 100, p.alt || p.cap, p.cap, jcOf(p.al), ctx, p.alt);
      }
      if (type === 'chart' || type === 'draw') {
        const sv = C.widgetSVG(type, p);
        if (!sv) return '';
        try {
          const bytes = await C.svgToPng(sv.svg, sv.w, sv.h, 2);
          const info = { bytes, ext: 'png', w: sv.w * 2, h: sv.h * 2, key: 'svg' + S.mediaFiles.length + ':' + type };
          info.w = sv.w; info.h = sv.h; // display ratio; natural width = css px
          return imageBlock(info, sv.widthPct, sv.title, '', jcOf(p.al), ctx, sv.title);
        } catch (e) {
          rep.note('svg', 'warn', t('r.chart', 'A chart or drawing could not be rendered as an image and was left out.'));
          return para(run('[' + sv.title + ']', { i: true }), { left: ctx.left });
        }
      }
      if (type === 'math') {
        const ml = C.texMathML(p.tex, true);
        const om = ml && edio.omml.mathmlToOmml(ml);
        if (om) { S.hasMath = true; return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara><m:oMath>' + om + '</m:oMath></m:oMathPara></w:p>'; }
        rep.note('math', 'warn', t('r.math', 'A formula could not be converted to a Word equation and was exported as LaTeX text.'));
        return para(run(p.tex || '', { font: 'Fira Code' }), { style: 'Code', jc: 'center' });
      }
      if (type === 'code') {
        rep.note('code', 'info', t('r.code', 'Code blocks are exported as monospace text without syntax colours.'));
        return codeBlock((el.querySelector('pre') || el).textContent, ctx);
      }
      if (type === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (type === 'toc') {
        rep.note('toc', 'info', t('r.toc', 'The table of contents is a static list; it does not update in Word.'));
        const lv = Math.max(1, Math.min(6, +p.levels || 3));
        let out = p.title ? para(run(p.title, { b: true, sz: 28 }), { keepNext: true, left: ctx.left }) : '';
        const hs = headings.filter((h) => +h.tagName[1] <= lv);
        if (!hs.length) out += para(run('—', {}), { left: ctx.left });
        hs.forEach((h) => {
          const txt = h.textContent.replace(/\s+/g, ' ').trim();
          out += para('<w:hyperlink w:anchor="' + hbm.get(h) + '" w:history="1">' + run(txt, { rStyle: 'Hyperlink' }) + '</w:hyperlink>', { left: (ctx.left || 0) + (+h.tagName[1] - 1) * 360, after: 40 });
        });
        return out;
      }
      // Other registered widgets: text fallback + report.
      const tx = window.T4.edx.widgets.has(type) ? window.T4.edx.widgets.textOf(type, p, el) : '';
      rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented in Word and was exported as plain text.', { name: type }));
      return tx ? tx.split('\n').map((l) => para(run(l, {}), { left: ctx.left })).join('') : '';
    }

    /* ---------- lists ---------- */
    async function list(el, ctx, depth) {
      const ordered = el.tagName === 'OL';
      const check = el.classList.contains('t4-check');
      const lt = el.style && el.style.listStyleType;
      const lvl = Math.min(8, depth);
      let numId = null;
      if (!check) numId = ordered ? orderedNum(lt, parseInt(el.getAttribute('start'), 10) || 1, lvl) : bulletNum(lt);
      let out = '';
      for (const li of Array.from(el.children)) {
        if (li.tagName === 'UL' || li.tagName === 'OL') { out += await list(li, ctx, depth + 1); continue; }
        if (li.tagName !== 'LI') continue;
        let first = true;
        let loose = [];
        const prefix = () => (check ? run(li.getAttribute('data-x-check') === '1' ? '☑ ' : '☐ ', {}) : '');
        const emit = (nodes) => {
          const holder = document.createElement('div');
          nodes.forEach((n) => holder.appendChild(n.cloneNode(true)));
          if (!holder.textContent.trim() && !holder.querySelector('.t4-w') && !first) return '';
          const b = blockOpts(li, Object.assign({}, ctx, { left: 0 }));
          const o = { style: 'ListParagraph', jc: b.o.jc, line: b.o.line, shd: b.o.shd, before: 40, after: 40 };
          if (ctx.box) o.box = ctx.box;
          let s;
          if (check) { o.left = (ctx.left || 0) + 360 * (lvl + 1) + 360; o.hanging = 360; }
          else if (first) { o.numId = numId; o.ilvl = lvl; o.left = (ctx.left || 0) + 720 * (lvl + 1); o.hanging = 360; }
          else { o.left = (ctx.left || 0) + 720 * (lvl + 1); }
          s = para((first ? prefix() : '') + inline(holder, b.f, ctx), o);
          first = false;
          return s;
        };
        const flush = () => { if (loose.length) { out += emit(loose); loose = []; } };
        for (const c of Array.from(li.childNodes)) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) { flush(); if (first) out += emit([]); first = false; out += await list(c, ctx, depth + 1); continue; }
          if (c.nodeType === 1 && (/^(P|H[1-6]|BLOCKQUOTE|TABLE|PRE)$/.test(c.tagName) || (C.isWidget(c) && c.tagName === 'FIGURE'))) {
            flush();
            if (c.tagName === 'P') { out += emit(Array.from(c.childNodes)); continue; }
            out += await block(c, Object.assign({}, ctx, { left: (ctx.left || 0) + 720 * (lvl + 1) }));
            first = false;
            continue;
          }
          loose.push(c);
        }
        flush();
        if (first) out += emit([]);
      }
      return out;
    }

    /* ---------- tables ---------- */
    async function table(el, ctx) {
      const trs = Array.from(el.querySelectorAll('tr'));
      if (!trs.length) return '';
      const occ = [];
      const cells = [];
      trs.forEach((tr, r) => {
        occ[r] = occ[r] || [];
        let c = 0;
        Array.from(tr.children).forEach((td) => {
          while (occ[r][c]) c++;
          const cs = Math.max(1, Math.min(50, parseInt(td.getAttribute('colspan'), 10) || 1));
          const rs = Math.max(1, Math.min(200, parseInt(td.getAttribute('rowspan'), 10) || 1));
          const cell = { td, r, c, cs, rs, th: td.tagName === 'TH' };
          cells.push(cell);
          for (let y = 0; y < rs && r + y < trs.length; y++) { occ[r + y] = occ[r + y] || []; for (let x = 0; x < cs; x++) occ[r + y][c + x] = cell; }
          c += cs;
        });
      });
      const ncols = Math.max(1, ...occ.map((o) => o.length));
      // column weights from text length
      const wts = new Array(ncols).fill(6);
      cells.forEach((cl) => { if (cl.cs === 1) wts[cl.c] = Math.max(wts[cl.c], Math.min(40, cl.td.textContent.trim().length + 2)); });
      const tot = wts.reduce((a, b) => a + b, 0);
      const avail = CW - (ctx.left || 0);
      const cols = wts.map((w) => Math.max(500, Math.round(avail * w / tot)));
      const scale = avail / cols.reduce((a, b) => a + b, 0);
      const colW = cols.map((w) => Math.floor(w * scale));
      const headerRows = new Set();
      trs.forEach((tr, r) => { if ((tr.parentNode.tagName === 'THEAD') || (r === 0 && Array.from(tr.children).length && Array.from(tr.children).every((c) => c.tagName === 'TH'))) headerRows.add(r); });
      let out = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + colW.reduce((a, b) => a + b, 0) + '" w:type="dxa"/>' + (ctx.left ? '<w:tblInd w:w="' + ctx.left + '" w:type="dxa"/>' : '') + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>' + colW.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
      for (let r = 0; r < trs.length; r++) {
        out += '<w:tr>' + (headerRows.has(r) ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>');
        let c = 0;
        while (c < ncols) {
          const cl = occ[r] && occ[r][c];
          if (!cl) { out += '<w:tc><w:tcPr><w:tcW w:w="' + colW[c] + '" w:type="dxa"/></w:tcPr><w:p/></w:tc>'; c++; continue; }
          const width = colW.slice(cl.c, cl.c + cl.cs).reduce((a, b) => a + b, 0);
          const start = cl.r === r;
          let tcPr = '<w:tcW w:w="' + width + '" w:type="dxa"/>' + (cl.cs > 1 ? '<w:gridSpan w:val="' + cl.cs + '"/>' : '') + (cl.rs > 1 ? (start ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '');
          const bg = C.cssColor(cl.td.style && cl.td.style.backgroundColor) || (cl.th ? 'F1F3F7' : null);
          if (bg) tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="' + bg + '"/>';
          const va = cl.td.style && cl.td.style.verticalAlign;
          if (va === 'middle' || va === 'bottom') tcPr += '<w:vAlign w:val="' + (va === 'middle' ? 'center' : 'bottom') + '"/>';
          let inner = '';
          if (start) {
            const cctx = Object.assign({}, ctx, { left: 0, cell: true });
            const f = {};
            if (cl.th) f.b = true;
            const col = C.cssColor(cl.td.style && cl.td.style.color);
            if (col) f.color = col;
            const jc = JC[cl.td.style && cl.td.style.textAlign];
            if (hasBlockChild(cl.td) || cl.td.querySelector('figure.t4-w')) inner = await blocks(cl.td, cctx);
            else inner = para(inline(cl.td, f, cctx), { jc, before: 40, after: 40 });
          }
          out += '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>' + (inner || '<w:p/>') + '</w:tc>';
          c += cl.cs;
        }
        out += '</w:tr>';
      }
      return out + '</w:tbl>' + para('', { after: 0, line: 120 });
    }

    /* ====================== assemble ====================== */
    const ctx0 = { left: 0 };
    let bodyXml = '';
    if (meta.title && meta.title.trim()) bodyXml += para(run(meta.title.trim(), {}), { style: 'Title' });
    bodyXml += await blocks(body, ctx0);
    if (!bodyXml) bodyXml = '<w:p/>';

    /* footnotes */
    let footnotesXml = '';
    if (S.notes.length) {
      footnotesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '">' +
        '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>' +
        '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
        S.notes.map((n) => '<w:footnote w:id="' + n.id + '"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' +
          n.text.split('\n').map((l, i) => (i ? brRun : '') + run((i ? '' : ' ') + l, {})).join('') + '</w:p></w:footnote>').join('') + '</w:footnotes>';
      addRel('footnotes', 'footnotes.xml');
    }

    /* header / footer: six boxes (left/centre/right, top and bottom) joined by tab stops; the page number sits in its box */
    const pg = meta.page || {};
    const slots = C.hfSlots(pg, meta);
    const pn = slots.numBox;
    const hasHF = !!(slots.tl || slots.tc || slots.tr || slots.bl || slots.bc || slots.br || pn);
    const parts = [];
    let sect = '';
    if (hasHF) {
      const small = { sz: 18, color: '6B7080' };
      const fieldRun = (instr) => '<w:fldSimple w:instr=" ' + instr + ' "><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6B7080"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>';
      const numRuns = () => {
        const fmt = pg.numberFormat || 'page-of';
        if (fmt === 'plain') return fieldRun('PAGE');
        if (fmt === 'slash') return fieldRun('PAGE') + run(' / ', small) + fieldRun('NUMPAGES');
        return C.pageOfText().split(/(\{a\}|\{b\})/).filter(Boolean).map((x) => (x === '{a}' ? fieldRun('PAGE') : x === '{b}' ? fieldRun('NUMPAGES') : run(x, small))).join('');
      };
      const tabs = '<w:tab w:val="center" w:pos="' + Math.round(CW / 2) + '"/><w:tab w:val="right" w:pos="' + CW + '"/>';
      const tabRun = '<w:r><w:tab/></w:r>';
      const box = (k, withNum) => run(slots[k], small) + (withNum && pn === k ? (slots[k] ? run(' · ', small) : '') + numRuns() : '');
      const line = (ks, withNum) => box(ks[0], withNum) + tabRun + box(ks[1], withNum) + tabRun + box(ks[2], withNum);
      const used = (ks, withNum) => ks.some((k) => slots[k] || (withNum && pn === k));
      const hdrXml = (inner, kind) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:' + kind + ' xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '">' + (inner ? para(inner, { style: kind === 'hdr' ? 'Header' : 'Footer', tabs }) : '<w:p/>') + '</w:' + kind + '>';
      let refs = '';
      const addPart = (kind, type, inner) => {
        const n = parts.length + 1;
        const file = (kind === 'hdr' ? 'header' : 'footer') + n + '.xml';
        parts.push({ file, xml: hdrXml(inner, kind), kind });
        const rid = addRel(kind === 'hdr' ? 'header' : 'footer', file);
        refs += '<w:' + (kind === 'hdr' ? 'headerReference' : 'footerReference') + ' w:type="' + type + '" r:id="' + rid + '"/>';
      };
      const H = ['tl', 'tc', 'tr'], F = ['bl', 'bc', 'br'];
      addPart('hdr', 'default', used(H, true) ? line(H, true) : '');
      addPart('ftr', 'default', used(F, true) ? line(F, true) : '');
      if (pg.firstPageHeader === false) { addPart('hdr', 'first', ''); addPart('ftr', 'first', used(F, false) ? line(F, false) : ''); }
      sect = refs;
    }
    const hd = Math.max(300, Math.min(mar[0], mar[2]) / 2 | 0);
    const sectPr = '<w:sectPr>' + sect + '<w:pgSz w:w="' + pageWtw + '" w:h="' + pageHtw + '"' + (page.landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + mar[0] + '" w:right="' + mar[1] + '" w:bottom="' + mar[2] + '" w:left="' + mar[3] + '" w:header="' + hd + '" w:footer="' + hd + '" w:gutter="0"/>' + (pg.firstPageHeader === false && hasHF ? '<w:titlePg/>' : '') + '</w:sectPr>';

    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' + (pg.bg ? '<w:background w:color="' + String(pg.bg).replace('#', '').toUpperCase() + '"/>' : '') + '<w:body>' + bodyXml + sectPr + '</w:body></w:document>';

    /* numbering */
    const numXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="' + W_NS + '">' + Array.from(S.abstracts.values()).map((a) => a.xml).join('') +
      S.nums.map((n) => '<w:num w:numId="' + n.numId + '"><w:abstractNumId w:val="' + n.abs + '"/>' + (n.start != null ? '<w:lvlOverride w:ilvl="' + (n.lvl || 0) + '"><w:startOverride w:val="' + n.start + '"/></w:lvlOverride>' : '') + '</w:num>').join('') + '</w:numbering>';

    const settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="' + W_NS + '"><w:zoom w:percent="100"/>' + (pg.bg ? '<w:displayBackgroundShape/>' : '') + '<w:defaultTabStop w:val="720"/>' +
      (S.notes.length ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : '') +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

    const ctypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      (S.notes.length ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : '') +
      parts.map((p) => '<Override PartName="/word/' + p.file + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + (p.kind === 'hdr' ? 'header' : 'footer') + '+xml"/>').join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xe(meta.title || '') + '</dc:title><dc:creator>Todo4Me</dc:creator><dc:language>' + xe(C.langOf()) + '</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
    const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Todo4Me</Application></Properties>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      S.rels.map((r) => '<Relationship Id="' + r.id + '" Type="' + REL + r.type + '" Target="' + xe(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>').join('') + '</Relationships>';

    await zipW.add('[Content_Types].xml', ctypes);
    await zipW.add('_rels/.rels', rootRels);
    await zipW.add('docProps/core.xml', core);
    await zipW.add('docProps/app.xml', app);
    await zipW.add('word/document.xml', docXml);
    await zipW.add('word/styles.xml', edio.docxStyles());
    await zipW.add('word/numbering.xml', numXml);
    await zipW.add('word/settings.xml', settingsXml);
    if (footnotesXml) await zipW.add('word/footnotes.xml', footnotesXml);
    for (const p of parts) await zipW.add('word/' + p.file, p.xml);
    await zipW.add('word/_rels/document.xml.rels', docRels);
    for (const m of S.mediaFiles) await zipW.add('word/' + m.file, m.bytes, { store: true });
    const bytes = await zipW.finish();
    return { blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), report: rep.list() };
  }

  edio.docx = Object.assign(edio.docx || {}, { exportDocx });
})();
