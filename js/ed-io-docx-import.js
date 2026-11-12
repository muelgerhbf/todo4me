/* Todo4Me — DOCX import (T4.edio.docx.importDocx). Reads document.xml, styles, numbering, footnotes, headers/footers and media,
 * produces HTML for the editor (it is sanitized by the core afterwards) plus a conversion report. Nothing is executed or fetched. */
(function () {
  'use strict';
  const edio = (window.T4.edio = window.T4.edio || {});
  const C = edio.common;
  const { he, t } = C;
  const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  };
  const MAX_IMAGES = 400;

  const kids = (el) => (el ? Array.from(el.children) : []);
  const lname = (el) => el.localName;
  const first = (el, name) => kids(el).find((c) => lname(c) === name) || null;
  const A = (el, name, ns) => (el ? el.getAttributeNS(ns || NS.w, name) : null);
  const onOff = (el) => { if (!el) return undefined; const v = A(el, 'val'); return !(v === '0' || v === 'false' || v === 'off'); };
  const esc = he;

  function parseXml(text, what) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(t('e.xml', 'The file is damaged (invalid XML in {part}).', { part: what }));
    return doc.documentElement;
  }
  function resolvePath(base, target) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
    const parts = (target.startsWith('/') ? target.slice(1) : base + target).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }
  async function readRels(zip, path) {
    const out = new Map();
    if (!zip.has(path)) return out;
    const root = parseXml(await zip.text(path), path);
    kids(root).forEach((r) => out.set(r.getAttribute('Id'), { type: (r.getAttribute('Type') || '').split('/').pop(), target: r.getAttribute('Target') || '', external: r.getAttribute('TargetMode') === 'External' }));
    return out;
  }

  /* ---------- run properties ---------- */
  const HL = { yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000' };
  function parseRPr(rp) {
    const o = {};
    if (!rp) return o;
    kids(rp).forEach((c) => {
      switch (lname(c)) {
        case 'b': o.b = onOff(c); break;
        case 'i': o.i = onOff(c); break;
        case 'u': o.u = (A(c, 'val') || 'single') !== 'none'; break;
        case 'strike': case 'dstrike': o.s = onOff(c); break;
        case 'vertAlign': { const v = A(c, 'val'); o.sup = v === 'superscript'; o.sub = v === 'subscript'; break; }
        case 'color': { const v = A(c, 'val'); if (v && /^[0-9a-f]{6}$/i.test(v)) o.color = v.toUpperCase(); else if (v === 'auto') o.color = null; break; }
        case 'highlight': { const v = A(c, 'val'); o.hl = v && v !== 'none' ? (HL[v] || null) : null; break; }
        case 'shd': { const f = A(c, 'fill'); if (f && /^[0-9a-f]{6}$/i.test(f)) o.shd = f.toUpperCase(); break; }
        case 'sz': { const v = parseInt(A(c, 'val'), 10); if (v) o.sz = v; break; }
        case 'rFonts': o.font = A(c, 'ascii') || A(c, 'hAnsi') || A(c, 'cs') || A(c, 'eastAsia') || undefined; break;
        case 'vanish': o.hidden = onOff(c); break;
        default: break;
      }
    });
    return o;
  }
  const merge = (...list) => { const o = {}; list.forEach((l) => { if (l) Object.keys(l).forEach((k) => { if (l[k] !== undefined) o[k] = l[k]; }); }); return o; };

  /* ---------- the converter ---------- */
  async function importDocx(file) {
    const rep = C.createReport();
    const zip = await edio.zip.readZip(file);
    if (!zip.has('[Content_Types].xml') && !zip.has('word/document.xml')) throw new Error(t('e.notdocx', 'This is not a Word (.docx) document.'));
    // main part via the package relationships
    let mainPath = 'word/document.xml';
    try {
      const rr = await readRels(zip, '_rels/.rels');
      for (const r of rr.values()) if (r.type === 'officeDocument' && !r.external) mainPath = resolvePath('', r.target) || mainPath;
    } catch (e) { /* default */ }
    if (!zip.has(mainPath)) throw new Error(t('e.notdocx', 'This is not a Word (.docx) document.'));
    const dir = mainPath.replace(/[^/]*$/, '');
    const root = parseXml(await zip.text(mainPath), mainPath);
    const bodyEl = first(root, 'body');
    if (!bodyEl) throw new Error(t('e.notdocx', 'This is not a Word (.docx) document.'));
    const rels = await readRels(zip, dir + '_rels/' + mainPath.slice(dir.length) + '.rels');

    /* styles */
    const styles = new Map();
    let defRPr = {}, defSz = 22;
    if (zip.has(dir + 'styles.xml')) {
      const sr = parseXml(await zip.text(dir + 'styles.xml'), 'styles.xml');
      const dd = first(sr, 'docDefaults');
      if (dd && first(dd, 'rPrDefault')) defRPr = parseRPr(first(first(dd, 'rPrDefault'), 'rPr'));
      kids(sr).filter((s) => lname(s) === 'style').forEach((s) => {
        const ppr = first(s, 'pPr');
        const num = ppr && first(ppr, 'numPr');
        styles.set(A(s, 'styleId'), {
          type: A(s, 'type'),
          name: (A(first(s, 'name'), 'val') || '').toLowerCase(),
          basedOn: A(first(s, 'basedOn'), 'val'),
          outline: ppr && first(ppr, 'outlineLvl') ? parseInt(A(first(ppr, 'outlineLvl'), 'val'), 10) : null,
          numId: num && first(num, 'numId') ? A(first(num, 'numId'), 'val') : null,
          ilvl: num && first(num, 'ilvl') ? parseInt(A(first(num, 'ilvl'), 'val'), 10) : null,
          jc: ppr && first(ppr, 'jc') ? A(first(ppr, 'jc'), 'val') : null,
          rpr: parseRPr(first(s, 'rPr')),
        });
      });
    }
    const normalSz = styles.get('Normal') && styles.get('Normal').rpr.sz;
    defSz = normalSz || defRPr.sz || 22;
    const defFont = window.T4.edSanitize.canonicalFont((styles.get('Normal') && styles.get('Normal').rpr.font) || defRPr.font) || 'Calibri';
    const chain = (id) => { const out = []; let s = styles.get(id), n = 0; while (s && n++ < 12) { out.push(s); s = s.basedOn ? styles.get(s.basedOn) : null; } return out; };
    const HEAD_RE = /^(heading|überschrift|titre|título|encabezado|başlık|rubrik|kop|intestazione|nagłówek|заголовок)\s*([1-9])$/i;
    function styleKind(id) {
      let outline = null, name = '', num = null, jc = null;
      for (const s of chain(id)) {
        if (!name) name = s.name;
        const m = HEAD_RE.exec(s.name);
        if (m) return { kind: 'h', level: Math.min(6, +m[2]), name: s.name, num: null };
        if (outline == null && s.outline != null && s.outline >= 0 && s.outline <= 8) outline = s.outline;
        if (!num && s.numId) num = { numId: s.numId, ilvl: s.ilvl || 0 };
        if (!jc && s.jc) jc = s.jc;
      }
      if (/^(title|titel|titre|título|başlık)$/.test(name)) return { kind: 'title', name, num };
      if (outline != null) return { kind: 'h', level: Math.min(6, outline + 1), name, num: null };
      if (/^(code|source code|html preformatted|preformatted text|plain text|quellcode|code block)/.test(name)) return { kind: 'code', name, num };
      if (/^(quote|intense quote|block text|zitat|intensives zitat|citation)/.test(name)) return { kind: 'quote', name, num };
      if (/^(caption|beschriftung|légende)/.test(name)) return { kind: 'caption', name, num };
      return { kind: 'p', name, num, jc };
    }
    const styleRPr = (id) => chain(id).reverse().reduce((acc, s) => merge(acc, s.rpr), {});

    /* numbering */
    const abstracts = new Map(), nums = new Map();
    if (zip.has(dir + 'numbering.xml')) {
      const nr = parseXml(await zip.text(dir + 'numbering.xml'), 'numbering.xml');
      kids(nr).forEach((n) => {
        if (lname(n) === 'abstractNum') {
          const lv = new Map();
          kids(n).filter((l) => lname(l) === 'lvl').forEach((l) => lv.set(parseInt(A(l, 'ilvl'), 10), { fmt: A(first(l, 'numFmt'), 'val') || 'decimal', start: parseInt(A(first(l, 'start'), 'val'), 10) || 1, text: A(first(l, 'lvlText'), 'val') || '' }));
          abstracts.set(A(n, 'abstractNumId'), lv);
        } else if (lname(n) === 'num') {
          const ov = new Map();
          kids(n).filter((o) => lname(o) === 'lvlOverride').forEach((o) => { const so = first(o, 'startOverride'); if (so) ov.set(parseInt(A(o, 'ilvl'), 10), parseInt(A(so, 'val'), 10)); });
          nums.set(A(n, 'numId'), { abs: A(first(n, 'abstractNumId'), 'val'), ov });
        }
      });
    }
    const LIST_TYPE = { decimal: '', lowerLetter: 'lower-alpha', upperLetter: 'upper-alpha', lowerRoman: 'lower-roman', upperRoman: 'upper-roman' };
    function listInfo(numId, ilvl) {
      const n = nums.get(numId);
      if (!n) return numId === '0' ? null : { ordered: false, type: '', start: 1, numId };
      const lv = (abstracts.get(n.abs) || new Map()).get(ilvl) || { fmt: 'decimal', start: 1 };
      if (lv.fmt === 'none') return null;
      const ordered = lv.fmt !== 'bullet';
      return { ordered, type: ordered ? (LIST_TYPE[lv.fmt] != null ? LIST_TYPE[lv.fmt] : '') : '', start: n.ov.has(ilvl) ? n.ov.get(ilvl) : lv.start, numId };
    }

    /* footnotes / endnotes */
    const notes = { foot: new Map(), end: new Map() };
    for (const [kind, file] of [['foot', 'footnotes.xml'], ['end', 'endnotes.xml']]) {
      if (!zip.has(dir + file)) continue;
      const fr = parseXml(await zip.text(dir + file), file);
      kids(fr).forEach((n) => {
        const typ = A(n, 'type');
        if (typ && typ !== 'normal') return;
        const txt = [];
        Array.from(n.getElementsByTagNameNS(NS.w, 'p')).forEach((p) => {
          const s = Array.from(p.getElementsByTagNameNS(NS.w, 't')).map((x) => x.textContent).join('');
          if (s.trim()) txt.push(s.trim());
        });
        notes[kind].set(A(n, 'id'), txt.join(' '));
      });
    }
    const footnoteWidget = window.T4.edx.widgets.has('footnote');
    const tocWidget = window.T4.edx.widgets.has('toc');
    const endnotes = [];

    /* sanitizer capabilities of this app (other modules may have registered more) */
    const canCheck = C.sanitizerKeeps('<ul class="t4-check"><li data-x-check="1">x</li></ul>', 'data-x-check');
    const canCallout = C.sanitizerKeeps('<blockquote class="t4-callout t4-callout--note"><p>x</p></blockquote>', 't4-callout');
    const canIds = C.sanitizerKeeps('<h1 id="zz1">x</h1>', 'id="zz1"');

    /* page geometry (for image widths) */
    let pageMeta = null;
    const sectPrs = Array.from(bodyEl.getElementsByTagNameNS(NS.w, 'sectPr'));
    const lastSect = first(bodyEl, 'sectPr') || sectPrs[sectPrs.length - 1] || null;
    let contentPx = 602;
    if (lastSect) {
      const sz = first(lastSect, 'pgSz'), mg = first(lastSect, 'pgMar');
      if (sz && mg) {
        const mm = (v) => (parseInt(v, 10) || 0) / 56.6929;
        let w = mm(A(sz, 'w')), h = mm(A(sz, 'h'));
        const land = A(sz, 'orient') === 'landscape' || w > h;
        if (land && w < h) { const x = w; w = h; h = x; }
        if (!land && w > h) { const x = w; w = h; h = x; }
        const m4 = ['top', 'right', 'bottom', 'left'].map((k) => mm(A(mg, k)));
        contentPx = Math.max(200, (w - m4[1] - m4[3]) * 3.7795);
        const DS = window.T4.docstore;
        const SZ = DS.PAGE_SIZES || C.SIZES, MG = DS.PAGE_MARGINS || C.MARGINS;
        const hit = Object.entries(SZ).find(([, d]) => Math.abs(d[0] - Math.min(w, h)) < 1.5 && Math.abs(d[1] - Math.max(w, h)) < 1.5);
        const mhit = Object.entries(MG).find(([, d]) => d.every((x, i) => Math.abs(x - m4[i]) < 1.5));
        pageMeta = { orientation: land ? 'landscape' : 'portrait' };
        if (hit) pageMeta.size = hit[0];
        else if (DS.cleanPage({ size: 'Custom' }).size === 'Custom' && Math.min(w, h) >= 50 && Math.max(w, h) <= 1000) { pageMeta.size = 'Custom'; pageMeta.customW = Math.round(Math.min(w, h) * 10) / 10; pageMeta.customH = Math.round(Math.max(w, h) * 10) / 10; }
        else rep.note('psize', 'warn', t('r.psize', 'The page size of the document is not one of the supported sizes; the default page size was kept.'));
        if (mhit) pageMeta.margins = mhit[0];
        else if (DS.cleanPage({ margins: 'custom' }).margins === 'custom') { pageMeta.margins = 'custom'; pageMeta.marginsMm = { t: Math.round(m4[0] * 10) / 10, r: Math.round(m4[1] * 10) / 10, b: Math.round(m4[2] * 10) / 10, l: Math.round(m4[3] * 10) / 10 }; }
        else rep.note('pmargin', 'warn', t('r.pmargin', 'The page margins do not match a supported setting; the default margins were kept.'));
        const bgEl = first(root, 'background');
        const bgc = bgEl && A(bgEl, 'color');
        if (bgc && /^[0-9a-f]{6}$/i.test(bgc) && DS.cleanPage({ bg: '#' + bgc }).bg) pageMeta.bg = '#' + bgc.toLowerCase();
      }
    }
    if (sectPrs.length > 1) rep.note('sections', 'info', t('r.sections', 'The document has several sections; only the page setup of the last one was used.'));

    /* ---------- state ---------- */
    const env = { fld: [], tocDepth: 0, images: new Map(), imgCount: 0, ins: 0, del: 0, bookmarks: new Set(), title: '', titleDone: false, headingIds: new Map() };
    const hlinkRel = (rid) => rels.get(rid);

    /* ---------- images ---------- */
    async function makeImage(blip, extentEl, docPr) {
      const rid = A(blip, 'embed', NS.r), link = A(blip, 'link', NS.r);
      if (!rid) {
        if (link) rep.note('extimg', 'warn', t('r.extimg', 'An image that is linked to an external location was not imported (no network access).'));
        return null;
      }
      const rel = rels.get(rid);
      if (!rel || rel.external) { rep.note('extimg', 'warn', t('r.extimg', 'An image that is linked to an external location was not imported (no network access).')); return null; }
      const path = resolvePath(dir, rel.target);
      if (!path || !zip.has(path)) { rep.note('noimg', 'warn', t('r.noimg', 'An image file is missing in the document and was left out.')); return null; }
      const ext = (path.split('.').pop() || '').toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext];
      if (!mime) { rep.note('fmt:' + ext, 'warn', t('r.imgfmt', 'Images in the format “{ext}” are not supported and were left out.', { ext })); return null; }
      if (env.imgCount >= MAX_IMAGES) { rep.note('imglimit', 'warn', t('r.imglimit', 'Only the first {n} images were imported.', { n: MAX_IMAGES })); return null; }
      let id = env.images.get(path);
      if (!id) {
        try {
          const bytes = await zip.read(path);
          const blob = await window.T4.edw.prepareImage(new Blob([bytes], { type: mime }));
          id = await window.T4.docstore.putAsset(blob);
          env.images.set(path, id);
          env.imgCount++;
        } catch (e) { rep.note('badimg', 'warn', t('r.badimg', 'An image could not be read and was left out.')); return null; }
      }
      let wpx = null;
      if (extentEl) { const cx = parseInt(extentEl.getAttribute('cx'), 10); if (cx > 0) wpx = cx / 9525; }
      const pct = wpx ? Math.max(5, Math.min(100, Math.round(wpx / contentPx * 100))) : 100;
      const alt = docPr ? (docPr.getAttribute('descr') || docPr.getAttribute('title') || '') : '';
      return { a: id, w: pct, al: 'center', alt: alt.slice(0, 300), cap: '' };
    }

    /* ---------- inline content ---------- */
    const mathSpan = (tex) => '<span class="t4-w" data-w="math" data-p="' + esc(JSON.stringify({ tex })) + '"></span>';
    function renderPieces(pieces) {
      let out = '';
      let i = 0;
      while (i < pieces.length) {
        const p = pieces[i];
        if (p.raw != null) { out += p.raw; i++; continue; }
        let j = i, txt = '';
        while (j < pieces.length && pieces[j].raw == null && pieces[j].key === p.key) { txt += pieces[j].text; j++; }
        out += wrapFmt(p.fmt, txt);
        i = j;
      }
      return out;
    }
    function wrapFmt(f, txt) {
      if (!txt) return '';
      let html = txt;
      const style = [];
      if (f.color && f.color !== '000000') style.push('color: #' + f.color);
      const bg = f.shd || (f.hl && f.hl !== 'FFFF00' ? f.hl : null);
      if (bg) style.push('background-color: #' + bg);
      if (!f.code && f.font) { const c = window.T4.edSanitize.canonicalFont(f.font); if (c && c !== defFont && c !== 'Fira Code') style.push('font-family: ' + window.T4.edSanitize.FONT_STACK[c]); }
      if (f.sz && f.sz !== defSz && f.sz >= 8 && f.sz <= 200) style.push('font-size: ' + f.sz / 2 + 'pt');
      if (style.length) html = '<span style="' + esc(style.join('; ')) + '">' + html + '</span>';
      if (f.code) html = '<code>' + html + '</code>';
      if (f.sup) html = '<sup>' + html + '</sup>'; else if (f.sub) html = '<sub>' + html + '</sub>';
      if (f.s) html = '<s>' + html + '</s>';
      if (f.u) html = '<u>' + html + '</u>';
      if (f.i) html = '<em>' + html + '</em>';
      if (f.b) html = '<strong>' + html + '</strong>';
      if (f.hl === 'FFFF00' && !f.shd) html = '<mark>' + html + '</mark>';
      return html;
    }
    const fmtKey = (f) => JSON.stringify(f, Object.keys(f).sort());
    function normFmt(f, para) {
      const o = Object.assign({}, f);
      const mono = o.font && window.T4.edSanitize.canonicalFont(o.font) === 'Fira Code';
      if (mono && !para.heading) { o.code = true; }
      if (!o.b) delete o.b; if (!o.i) delete o.i; if (!o.u) delete o.u; if (!o.s) delete o.s; if (!o.sup) delete o.sup; if (!o.sub) delete o.sub;
      ['color', 'hl', 'shd', 'sz', 'font'].forEach((k) => { if (o[k] == null) delete o[k]; });
      if (o.code) delete o.font;
      if (para.heading) { delete o.b; delete o.sz; delete o.font; }
      delete o.hidden;
      return o;
    }
    const fieldTop = () => env.fld[env.fld.length - 1];

    async function inlineChildren(parent, para, pieces, baseFmt) {
      for (const c of kids(parent)) {
        const n = lname(c);
        switch (n) {
          case 'r': await runPiece(c, para, pieces, baseFmt); break;
          case 'hyperlink': {
            const rid = A(c, 'id', NS.r), anchor = A(c, 'anchor');
            const sub = [];
            await inlineChildren(c, para, sub, baseFmt);
            const inner = renderPieces(sub);
            let href = null;
            if (rid) {
              const rel = hlinkRel(rid);
              if (rel && rel.external) {
                href = window.T4.edSanitize.safeHref(rel.target);
                if (!href || !/^(https?:|mailto:)/i.test(href)) { rep.note('badlink', 'warn', t('r.badlink', 'A link with an unsafe or unsupported address was converted to plain text.')); href = null; }
              }
            } else if (anchor) {
              if (canIds && /^[\w-]{1,200}$/.test(anchor)) href = '#' + anchor;
              else rep.note('anchor', 'info', t('r.anchor', 'Links inside the document were converted to plain text.'));
            }
            pieces.push({ raw: href ? '<a href="' + esc(href) + '">' + inner + '</a>' : inner });
            break;
          }
          case 'ins': case 'moveTo': env.ins++; await inlineChildren(c, para, pieces, baseFmt); break;
          case 'del': case 'moveFrom': env.del++; break;
          case 'fldSimple': {
            const instr = (A(c, 'instr') || '').trim();
            if (/^(PAGE|NUMPAGES|SECTIONPAGES)\b/i.test(instr)) break;
            const hm = /^HYPERLINK\s+"([^"]+)"/i.exec(instr);
            const sub = [];
            await inlineChildren(c, para, sub, baseFmt);
            const inner = renderPieces(sub);
            const href = hm ? window.T4.edSanitize.safeHref(hm[1]) : null;
            pieces.push({ raw: href && /^(https?:|mailto:)/i.test(href) ? '<a href="' + esc(href) + '">' + inner + '</a>' : inner });
            break;
          }
          case 'sdt': { const sc = first(c, 'sdtContent'); if (sc) await inlineChildren(sc, para, pieces, baseFmt); break; }
          case 'smartTag': case 'customXml': await inlineChildren(c, para, pieces, baseFmt); break;
          case 'oMath': { const tex = edio.omml.ommlToTex(c); if (tex) { pieces.push({ raw: mathSpan(tex) }); para.math = (para.math || 0) + 1; } break; }
          case 'oMathPara': { kids(c).filter((x) => lname(x) === 'oMath').forEach((om) => { const tex = edio.omml.ommlToTex(om); if (tex) { pieces.push({ raw: mathSpan(tex) }); para.math = (para.math || 0) + 1; } }); para.mathPara = true; break; }
          case 'bookmarkStart': { const nm = A(c, 'name'); if (nm && !nm.startsWith('_')) para.bookmarks.push(nm); break; }
          case 'commentRangeStart': case 'commentRangeEnd': case 'proofErr': case 'permStart': case 'permEnd': break;
          default: break;
        }
      }
    }
    function textOfDeep(el) {
      return Array.from(el.getElementsByTagNameNS(NS.w, 'p')).map((p) => Array.from(p.getElementsByTagNameNS(NS.w, 't')).map((x) => x.textContent).join('')).filter((s) => s.trim()).join('\n');
    }
    async function runPiece(r, para, pieces, baseFmt) {
      const rpr = first(r, 'rPr');
      const rs = rpr && first(rpr, 'rStyle');
      const rsId = rs ? A(rs, 'val') : null;
      const charStyle = rsId ? styles.get(rsId) : null;
      if (charStyle && /^(code char|source code|html code|verbatim char|code|quellcode)/.test(charStyle.name)) baseFmt = Object.assign({}, baseFmt, { font: 'Consolas' });
      const fmt = normFmt(merge(baseFmt, rsId ? styleRPr(rsId) : null, parseRPr(rpr)), para);
      if ((rpr && first(rpr, 'vanish')) && onOff(first(rpr, 'vanish'))) return;
      const key = fmtKey(fmt);
      const push = (text) => { if (text) pieces.push({ key, fmt, text: esc(text) }); };
      for (const c of kids(r)) {
        switch (lname(c)) {
          case 't': { const f = fieldTop(); if (!f || f.phase === 'result') push(c.textContent); break; }
          case 'tab': push(' '); break;
          case 'noBreakHyphen': push('-'); break;
          case 'sym': { const ch = parseInt(A(c, 'char'), 16); if (ch) push(String.fromCharCode(ch)); break; }
          case 'br': {
            const typ = A(c, 'type');
            if (typ === 'page') pieces.push({ raw: '\u0001PB\u0001' });
            else if (typ !== 'column') pieces.push({ raw: '<br>' });
            break;
          }
          case 'fldChar': {
            const typ = A(c, 'fldCharType');
            if (typ === 'begin') { env.fld.push({ phase: 'instr', instr: '', outer: pieces.slice() }); }
            else if (typ === 'separate') { const f = fieldTop(); if (f) { f.phase = 'result'; f.start = pieces.length; } }
            else if (typ === 'end') {
              const f = env.fld.pop();
              if (f) {
                const instr = f.instr.trim();
                const resPieces = pieces.splice(f.start != null ? f.start : pieces.length);
                const inner = renderPieces(resPieces);
                const hm = /^HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(instr);
                if (/^(PAGE|NUMPAGES|SECTIONPAGES)\b/i.test(instr)) { /* page numbers of the body are not content */ }
                else if (hm) {
                  const isLocal = /\\l/i.test(instr);
                  const href = isLocal ? (canIds ? '#' + hm[1] : null) : window.T4.edSanitize.safeHref(hm[1]);
                  if (href && (isLocal || /^(https?:|mailto:)/i.test(href))) pieces.push({ raw: '<a href="' + esc(href) + '">' + inner + '</a>' });
                  else { rep.note('badlink', 'warn', t('r.badlink', 'A link with an unsafe or unsupported address was converted to plain text.')); pieces.push({ raw: inner }); }
                } else pieces.push({ raw: inner });
              }
            }
            break;
          }
          case 'instrText': { const f = fieldTop(); if (f && f.phase === 'instr') f.instr += c.textContent; break; }
          case 'footnoteReference': case 'endnoteReference': {
            const kind = lname(c) === 'footnoteReference' ? 'foot' : 'end';
            const txt = notes[kind].get(A(c, 'id')) || '';
            if (footnoteWidget) pieces.push({ raw: '<span class="t4-w" data-w="footnote" data-p="' + esc(JSON.stringify({ text: txt.slice(0, 1000) })) + '"></span>' });
            else {
              endnotes.push(txt);
              pieces.push({ raw: '<sup>[' + endnotes.length + ']</sup>' });
              rep.note('notes', 'info', t('r.notes', 'Footnotes were converted to a numbered list of notes at the end of the document.'));
            }
            break;
          }
          case 'drawing': case 'pict': case 'AlternateContent': case 'object': await drawing(c, para, pieces); break;
          default: break;
        }
      }
    }
    async function drawing(c, para, pieces) {
      let node = c;
      if (lname(c) === 'AlternateContent') node = kids(c).find((x) => lname(x) === 'Choice') || kids(c).find((x) => lname(x) === 'Fallback') || c;
      const tx = Array.from(node.getElementsByTagNameNS('*', 'txbxContent'))[0];
      if (tx) {
        const txt = textOfDeep(tx);
        rep.note('txbx', 'warn', t('r.txbx', 'Text boxes are not supported; their text was inserted as ordinary paragraphs.'));
        if (txt) para.extraText.push(txt);
        return;
      }
      const blips = Array.from(node.getElementsByTagNameNS(NS.a, 'blip'));
      if (blips.length) {
        const extent = Array.from(node.getElementsByTagNameNS(NS.wp, 'extent'))[0] || null;
        const dpr = Array.from(node.getElementsByTagNameNS(NS.wp, 'docPr'))[0] || null;
        const img = await makeImage(blips[0], extent, dpr);
        if (img) para.images.push(img);
        return;
      }
      // VML picture
      const imagedata = Array.from(node.getElementsByTagNameNS('*', 'imagedata'))[0];
      if (imagedata) {
        const rid = imagedata.getAttributeNS(NS.r, 'id');
        if (rid) {
          const fake = { getAttributeNS: (ns, nm) => (nm === 'embed' ? rid : null) };
          const img = await makeImage(fake, null, null);
          if (img) para.images.push(img);
          return;
        }
      }
      const what = node.getElementsByTagNameNS('*', 'chart').length ? 'chart' : node.getElementsByTagNameNS('*', 'relIds').length ? 'SmartArt' : lname(c) === 'object' ? 'OLE' : 'drawing';
      rep.note('x:' + what, 'warn', t('r.unsupported', 'A {what} object is not supported and was left out.', { what }));
    }

    /* ---------- paragraphs ---------- */
    const lastItem = (items) => items[items.length - 1];
    const CHECK_RE = /^(☐|☑|☒)\s/;
    async function handleParagraph(p, items) {
      // TOC handling (skip the generated list when the toc widget exists)
      const fcs = Array.from(p.getElementsByTagNameNS(NS.w, 'fldChar')).map((x) => A(x, 'fldCharType'));
      const instrs = Array.from(p.getElementsByTagNameNS(NS.w, 'instrText')).map((x) => x.textContent).join(' ');
      if (env.tocDepth > 0 || (tocWidget && /^\s*TOC\b/.test(instrs) && fcs.includes('begin'))) {
        if (env.tocDepth === 0) items.push({ t: 'html', html: '<figure class="t4-w" data-w="toc" data-p="' + esc(JSON.stringify({ levels: 3 })) + '"></figure>' });
        fcs.forEach((x) => { if (x === 'begin') env.tocDepth++; else if (x === 'end') env.tocDepth = Math.max(0, env.tocDepth - 1); });
        return;
      }
      const ppr = first(p, 'pPr');
      const sid = ppr && first(ppr, 'pStyle') ? A(first(ppr, 'pStyle'), 'val') : null;
      const sk = styleKind(sid);
      const para = { heading: sk.kind === 'h' || sk.kind === 'title', images: [], extraText: [], bookmarks: [], math: 0 };
      const baseFmt = (sk.kind === 'h' || sk.kind === 'title') ? {} : styleRPr(sid);
      const pieces = [];
      await inlineChildren(p, para, pieces, baseFmt);
      let html = renderPieces(pieces);
      const jcRaw = ppr && first(ppr, 'jc') ? A(first(ppr, 'jc'), 'val') : sk.jc;
      const jc = { left: 'left', start: 'left', right: 'right', end: 'right', center: 'center', both: 'justify', distribute: 'justify' }[jcRaw] || '';
      const ind = ppr && first(ppr, 'ind');
      const spc = ppr && first(ppr, 'spacing');
      const styleParts = [];
      if (jc && jc !== 'left') styleParts.push('text-align: ' + jc);
      let indLeft = 0;
      if (ind) {
        indLeft = parseInt(A(ind, 'left') || A(ind, 'start'), 10) || 0;
        const fl = parseInt(A(ind, 'firstLine'), 10) || 0, hg = parseInt(A(ind, 'hanging'), 10) || 0;
        if (fl) styleParts.push('text-indent: ' + Math.min(200, Math.round(fl / 15)) + 'px');
        else if (hg) styleParts.push('text-indent: -' + Math.min(200, Math.round(hg / 15)) + 'px');
      }
      if (spc) {
        const b = A(spc, 'before'), a = A(spc, 'after'), l = A(spc, 'line');
        if (b != null && b !== '' && +b > 0) styleParts.push('margin-top: ' + Math.min(120, Math.round(b / 15)) + 'px');
        if (a != null && a !== '' && a !== '160' && +a >= 0) styleParts.push('margin-bottom: ' + Math.min(120, Math.round(a / 15)) + 'px');
        if (l && (A(spc, 'lineRule') || 'auto') === 'auto') { const v = Math.round(+l / 240 * 100) / 100; if (v >= 0.8 && v <= 4 && Math.abs(v - 1.15) > 0.02) styleParts.push('line-height: ' + v); }
      }
      const shdEl = ppr && first(ppr, 'shd');
      const shd = shdEl && /^[0-9a-f]{6}$/i.test(A(shdEl, 'fill') || '') ? A(shdEl, 'fill').toUpperCase() : null;
      const pbdr = ppr && first(ppr, 'pBdr');
      if (shd && !(pbdr && Object.entries(C.CALLOUT_COLORS).some(([, v]) => v[1] === shd))) styleParts.push('background-color: #' + shd);
      if (indLeft && sk.kind === 'p' && !(ppr && first(ppr, 'numPr')) && indLeft > 100 && !(CHECK_RE.test(htmlText(html)))) styleParts.push('margin-left: ' + Math.min(400, Math.round(indLeft / 15)) + 'px');
      const styleAttr = styleParts.length ? ' style="' + esc(styleParts.join('; ')) + '"' : '';
      // the empty spacer paragraph written after a table by the exporter (and by Word when two tables meet)
      const prevIt = lastItem(items);
      if (prevIt && prevIt.t === 'html' && prevIt.html.startsWith('<table') && !htmlText(html).trim() && !html.includes('t4-w') && (!spc || (parseInt(A(spc, 'line'), 10) || 240) <= 200)) return;
      const brk = !!(ppr && first(ppr, 'pageBreakBefore'));

      const parts = html.split('\u0001PB\u0001');
      const plain = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (brk) items.push({ t: 'html', html: '<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>' });

      // caption for the previous image
      if (sk.kind === 'caption' && lastItem(items) && lastItem(items).t === 'img' && plain(html)) { lastItem(items).props.cap = htmlText(html).slice(0, 300); return; }

      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        if (pi > 0) items.push({ t: 'html', html: '<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>' });
        const empty = !plain(part) && !/<(br|span class="t4-w")/.test(part);
        if (pi > 0 && empty) continue;
        if (para.images.length && empty && pi === parts.length - 1) continue; // paragraph that only holds pictures
        if (empty && pi === 0 && para.images.length) continue;
        if (para.mathPara && para.math === 1 && !plain(part.replace(/<span class="t4-w"[^>]*><\/span>/g, ''))) {
          const m = /data-p="([^"]*)"/.exec(part);
          if (m) { items.push({ t: 'html', html: '<figure class="t4-w" data-w="math" data-p="' + m[1] + '"></figure>' }); continue; }
        }
        const listNum = ppr && first(ppr, 'numPr');
        let numId = listNum && first(listNum, 'numId') ? A(first(listNum, 'numId'), 'val') : null;
        let ilvl = listNum && first(listNum, 'ilvl') ? parseInt(A(first(listNum, 'ilvl'), 'val'), 10) || 0 : null;
        if (numId == null && sk.num) { numId = sk.num.numId; ilvl = sk.num.ilvl; }
        if (ilvl == null) ilvl = 0;
        // headings
        if (sk.kind === 'title' && !env.titleDone) { env.titleDone = true; env.title = htmlText(part).trim().slice(0, 200); continue; }
        if (sk.kind === 'h' || sk.kind === 'title') {
          const lv = sk.kind === 'title' ? 1 : sk.level;
          if (!plain(part)) continue;
          let idAttr = '';
          if (canIds && para.bookmarks.length) idAttr = ' id="' + esc(para.bookmarks[0].replace(/[^\w-]/g, '_')) + '"';
          items.push({ t: 'html', html: '<h' + lv + idAttr + styleAttr + '>' + part + '</h' + lv + '>' });
          continue;
        }
        const info = numId != null && numId !== '0' ? listInfo(numId, ilvl) : null;
        if (info) { items.push({ t: 'li', info, ilvl, html: part, check: CHECK_RE.test(htmlText(part)) && canCheck }); continue; }
        // pseudo checklist items written by the exporter (no numbering, "☐ text")
        if (CHECK_RE.test(htmlText(part)) && canCheck && sid && styles.get(sid) && styles.get(sid).name === 'list paragraph') {
          items.push({ t: 'li', info: { ordered: false, type: '', start: 1, numId: 'check' }, ilvl: Math.max(0, Math.round((indLeft - 720) / 360)), html: part, check: true });
          continue;
        }
        if (sk.kind === 'code') { items.push({ t: 'code', text: htmlText(part.replace(/<br>/g, '\n')) }); continue; }
        if (pbdr && shd && canCallout) {
          const kind = Object.entries(C.CALLOUT_COLORS).find(([, v]) => v[1] === shd);
          if (kind) { items.push({ t: 'callout', kind: kind[0], html: '<p>' + part + '</p>' }); continue; }
        }
        if (sk.kind === 'quote' || (pbdr && first(pbdr, 'left') && !first(pbdr, 'top') && indLeft)) { items.push({ t: 'quote', html: '<p' + styleAttr + '>' + part + '</p>' }); continue; }
        if (pbdr && first(pbdr, 'bottom') && empty) { items.push({ t: 'html', html: '<hr>' }); continue; }
        items.push({ t: 'html', html: '<p' + styleAttr + '>' + (part || '<br>') + '</p>' });
      }
      para.images.forEach((im) => {
        im.al = jc === 'left' || jc === 'right' ? jc : 'center';
        items.push({ t: 'img', props: im });
      });
      para.extraText.forEach((txt) => txt.split('\n').forEach((l) => items.push({ t: 'html', html: '<p>' + esc(l) + '</p>' })));
    }
    function htmlText(html) { const d = document.createElement('template'); d.innerHTML = html; return d.content.textContent; }

    /* ---------- tables ---------- */
    async function handleTable(tbl, items) {
      const rows = kids(tbl).filter((r) => lname(r) === 'tr');
      if (!rows.length) return;
      const grid = []; // per row: [{cell, col, span, vm}]
      const rowCells = rows.map((tr) => {
        const cells = [];
        let col = 0;
        kids(tr).forEach((tc) => {
          if (lname(tc) === 'sdt') { const sc = first(tc, 'sdtContent'); kids(sc).forEach((x) => { if (lname(x) === 'tc') add(x); }); return; }
          if (lname(tc) === 'tc') add(tc);
        });
        function add(tc) {
          const pr = first(tc, 'tcPr');
          const span = pr && first(pr, 'gridSpan') ? parseInt(A(first(pr, 'gridSpan'), 'val'), 10) || 1 : 1;
          const vm = pr && first(pr, 'vMerge') ? (A(first(pr, 'vMerge'), 'val') === 'restart' ? 'restart' : 'cont') : null;
          cells.push({ tc, pr, col, span: Math.min(span, 50), vm, rowspan: 1 });
          col += span;
        }
        return cells;
      });
      grid.push(...rowCells);
      // vMerge -> rowspan
      rowCells.forEach((cells, r) => {
        cells.forEach((c) => {
          if (c.vm !== 'cont') return;
          for (let y = r - 1; y >= 0; y--) {
            const o = rowCells[y].find((x) => x.col === c.col);
            if (o && o.vm !== 'cont') { o.rowspan++; break; }
            if (!o) break;
          }
        });
      });
      let thead = '', tbody = '';
      let hasImg = false;
      for (let r = 0; r < rowCells.length; r++) {
        const tr = rows[r];
        const trPr = first(tr, 'trPr');
        const isHead = r === 0 && !!(trPr && first(trPr, 'tblHeader'));
        let tds = '';
        for (const c of rowCells[r]) {
          if (c.vm === 'cont') continue;
          const sub = [];
          for (const ch of kids(c.tc)) { if (lname(ch) === 'p') await handleParagraph(ch, sub); else if (lname(ch) === 'tbl') await handleTable(ch, sub); }
          if (sub.some((x) => x.t === 'img')) hasImg = true;
          let inner = renderItems(sub.filter((x) => x.t !== 'img'));
          let tdStyle = '';
          const m = /^<p( style="([^"]*)")?>((?:(?!<p[ >]).)*)<\/p>$/s.exec(inner);
          if (m) { inner = m[3]; if (m[2]) tdStyle = m[2].split(';').map((s) => s.trim()).filter((s) => /^text-align/.test(s)).join('; '); }
          const shdEl = c.pr && first(c.pr, 'shd');
          const fill = shdEl && /^[0-9a-f]{6}$/i.test(A(shdEl, 'fill') || '') ? A(shdEl, 'fill').toUpperCase() : null;
          const va = c.pr && first(c.pr, 'vAlign') ? A(first(c.pr, 'vAlign'), 'val') : null;
          const st = [tdStyle, fill && fill !== 'F1F3F7' || (fill && !isHead) ? 'background-color: #' + fill : '', va === 'center' ? 'vertical-align: middle' : va === 'bottom' ? 'vertical-align: bottom' : ''].filter(Boolean).join('; ');
          tds += '<' + (isHead ? 'th' : 'td') + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (c.rowspan > 1 ? ' rowspan="' + c.rowspan + '"' : '') + (st ? ' style="' + esc(st) + '"' : '') + '>' + (inner || '<br>') + '</' + (isHead ? 'th' : 'td') + '>';
        }
        if (isHead) thead += '<tr>' + tds + '</tr>'; else tbody += '<tr>' + tds + '</tr>';
      }
      if (hasImg) rep.note('tblimg', 'warn', t('r.tblimg', 'Images inside table cells are not supported and were left out.'));
      items.push({ t: 'html', html: '<table>' + (thead ? '<thead>' + thead + '</thead>' : '') + '<tbody>' + tbody + '</tbody></table>' });
    }

    /* ---------- items -> HTML ---------- */
    function renderList(lis) {
      const root = { kids: [] };
      const stack = [];
      const open = (parentItem, li) => {
        const list = { ordered: li.info.ordered, type: li.info.type, start: li.info.start, check: li.check, numId: li.info.numId, items: [], ilvl: li.ilvl };
        if (parentItem) parentItem.children.push(list); else root.kids.push(list);
        stack.push(list);
        return list;
      };
      lis.forEach((li) => {
        while (stack.length && stack[stack.length - 1].ilvl > li.ilvl) stack.pop();
        let top = stack[stack.length - 1];
        if (top && top.ilvl === li.ilvl && (top.ordered !== li.info.ordered || (top.numId !== li.info.numId && li.info.ordered) || top.check !== li.check)) { stack.pop(); top = stack[stack.length - 1]; }
        if (!top || top.ilvl < li.ilvl) {
          const parent = top ? top.items[top.items.length - 1] || (top.items.push({ html: '', children: [] }), top.items[top.items.length - 1]) : null;
          top = open(parent, li);
        }
        top.items.push({ html: li.html, check: li.check, children: [] });
      });
      const ser = (list) => {
        const tag = list.ordered ? 'ol' : 'ul';
        const attrs = (list.ordered && list.start > 1 ? ' start="' + list.start + '"' : '') + (list.ordered && list.type ? ' style="list-style-type: ' + list.type + '"' : '') + (list.check ? ' class="t4-check"' : '');
        return '<' + tag + attrs + '>' + list.items.map((it) => {
          let h = it.html;
          if (list.check) { const checked = /^\s*(☑|☒)/.test(htmlText(h)); h = h.replace(/(☐|☑|☒)\s?/, ''); return '<li data-x-check="' + (checked ? '1' : '0') + '">' + h + it.children.map(ser).join('') + '</li>'; }
          return '<li>' + h + it.children.map(ser).join('') + '</li>';
        }).join('') + '</' + tag + '>';
      };
      return root.kids.map(ser).join('');
    }
    function renderItems(items) {
      let out = '';
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.t === 'html') out += it.html;
        else if (it.t === 'img') out += '<figure class="t4-w" data-w="img" data-p="' + esc(JSON.stringify(it.props)) + '"></figure>';
        else if (it.t === 'li') { const run = [it]; while (items[i + 1] && items[i + 1].t === 'li') run.push(items[++i]); out += renderList(run); }
        else if (it.t === 'code') { const lines = [it.text]; while (items[i + 1] && items[i + 1].t === 'code') lines.push(items[++i].text); out += '<figure class="t4-w" data-w="code" data-p="{&quot;lang&quot;:&quot;&quot;}"><pre><code>' + esc(lines.join('\n')) + '</code></pre></figure>'; }
        else if (it.t === 'quote') { let h = it.html; while (items[i + 1] && items[i + 1].t === 'quote') h += items[++i].html; out += '<blockquote>' + h + '</blockquote>'; }
        else if (it.t === 'callout') { let h = it.html; while (items[i + 1] && items[i + 1].t === 'callout' && items[i + 1].kind === it.kind) h += items[++i].html; out += '<blockquote class="t4-callout t4-callout--' + it.kind + '">' + h + '</blockquote>'; }
      }
      return out;
    }

    /* ---------- walk the body ---------- */
    const items = [];
    async function walk(container) {
      for (const c of kids(container)) {
        const n = lname(c);
        if (n === 'p') await handleParagraph(c, items);
        else if (n === 'tbl') await handleTable(c, items);
        else if (n === 'sdt') { const sc = first(c, 'sdtContent'); if (sc) await walk(sc); }
        else if (n === 'customXml' || n === 'smartTag') await walk(c);
      }
    }
    await walk(bodyEl);
    let html = renderItems(items);
    if (endnotes.length) html += '<hr>' + endnotes.map((s, i) => '<p>[' + (i + 1) + '] ' + esc(s) + '</p>').join('');
    if (!html) html = '<p><br></p>';

    /* ---------- header / footer -> page setup ---------- */
    const meta = {};
    if (pageMeta) meta.page = pageMeta;
    if (lastSect) {
      const hf = { header: null, footer: null };
      for (const ref of kids(lastSect)) {
        const nm = lname(ref);
        if ((nm !== 'headerReference' && nm !== 'footerReference') || A(ref, 'type') !== 'default') continue;
        const rel = rels.get(A(ref, 'id', NS.r));
        const path = rel && !rel.external ? resolvePath(dir, rel.target) : null;
        if (!path || !zip.has(path)) continue;
        try { hf[nm === 'headerReference' ? 'header' : 'footer'] = parseXml(await zip.text(path), path); } catch (e) { /* ignore */ }
      }
      const readHF = (rootEl, isHeader) => {
        if (!rootEl) return;
        if (rootEl.getElementsByTagNameNS(NS.w, 'tbl').length || rootEl.getElementsByTagNameNS(NS.w, 'drawing').length) { rep.note('hfcomplex', 'warn', t('r.hfcomplex', 'The header or footer contains tables or pictures and was not imported.')); return; }
        const paras = Array.from(rootEl.getElementsByTagNameNS(NS.w, 'p'));
        const slot = { l: '', c: '', r: '' };
        let numAt = null, pageOf = false;
        paras.forEach((p) => {
          const pr = first(p, 'pPr');
          const jcv = pr && first(pr, 'jc') ? A(first(pr, 'jc'), 'val') : '';
          const segs = [{ text: '', field: false }];
          let skip = 0;
          const cur = () => segs[segs.length - 1];
          const walkRuns = (el) => kids(el).forEach((r) => {
            const nn = lname(r);
            if (nn === 'fldSimple') { const ins = A(r, 'instr') || ''; if (/\bPAGE\b|NUMPAGES/i.test(ins)) { cur().field = true; if (/NUMPAGES/i.test(ins)) pageOf = true; } else cur().text += r.textContent; return; }
            if (nn === 'r') {
              kids(r).forEach((x) => {
                const k = lname(x);
                if (k === 'fldChar') { const ty = A(x, 'fldCharType'); if (ty === 'begin') { skip++; cur().field = true; } else if (ty === 'end') skip = Math.max(0, skip - 1); }
                else if (k === 'instrText') { if (/NUMPAGES/i.test(x.textContent)) pageOf = true; }
                else if (k === 't' && !skip) cur().text += x.textContent;
                else if (k === 'tab') segs.push({ text: '', field: false });
              });
            } else if (nn === 'hyperlink' || nn === 'ins' || nn === 'sdt' || nn === 'sdtContent') walkRuns(r);
          });
          walkRuns(p);
          let keys;
          if (segs.length >= 3) keys = ['l', 'c', 'r'];
          else if (segs.length === 2) keys = ['l', 'r'];
          else keys = [jcv === 'center' ? 'c' : jcv === 'right' || jcv === 'end' ? 'r' : 'l'];
          segs.forEach((sg, i) => {
            const k = keys[Math.min(i, keys.length - 1)];
            let tx = sg.text;
            if (sg.field) { numAt = numAt || k; tx = tx.replace(/\b(page|seite|sayfa|página|pagina|of|von|de|\/)\b/gi, ''); }
            tx = tx.replace(/^[\s·]+|[\s·]+$/g, '').replace(/\s+/g, ' ');
            if (tx) slot[k] += (slot[k] ? ' ' : '') + tx;
          });
        });
        meta.page = meta.page || {};
        const P = meta.page;
        if (isHeader) { if (slot.l) P.headerL = slot.l.slice(0, 200); if (slot.c) P.header = slot.c.slice(0, 200); if (slot.r) P.headerR = slot.r.slice(0, 200); }
        else { if (slot.l) P.footer = slot.l.slice(0, 200); if (slot.c) P.footerC = slot.c.slice(0, 200); if (slot.r) P.footerR = slot.r.slice(0, 200); }
        if (numAt) {
          P.pageNumbers = isHeader ? 'top-right' : (numAt === 'r' ? 'bottom-right' : 'bottom-center');
          P.numberFormat = pageOf ? 'page-of' : 'plain';
        }
      };
      readHF(hf.header, true); readHF(hf.footer, false);
      if (lastSect && first(lastSect, 'titlePg')) { meta.page = meta.page || {}; meta.page.firstPageHeader = false; }
      if (meta.page) {
        meta.page = window.T4.docstore.cleanPage(Object.assign({}, window.T4.docstore.PAGE_DEFAULTS, pageMeta || {}, meta.page, !meta.page.pageNumbers ? { pageNumbers: 'none' } : {}));
      }
    }

    /* ---------- title + report ---------- */
    let title = env.title;
    if (!title && zip.has('docProps/core.xml')) {
      try { const cr = parseXml(await zip.text('docProps/core.xml'), 'core.xml'); const tt = Array.from(cr.getElementsByTagNameNS('*', 'title'))[0]; if (tt && tt.textContent.trim()) title = tt.textContent.trim().slice(0, 200); } catch (e) { /* ignore */ }
    }
    if (zip.has(dir + 'comments.xml')) {
      let n = 0;
      try { n = parseXml(await zip.text(dir + 'comments.xml'), 'comments.xml').children.length; } catch (e) { n = 1; }
      if (n) rep.note('comments', 'warn', t('r.comments', '{n} comments were not imported.', { n }));
    }
    if (env.del || env.ins) rep.note('track', 'info', t('r.track', 'Tracked changes: insertions were accepted ({ins}), deletions were ignored ({del}).', { ins: env.ins, del: env.del }));
    if (zip.names().some((n) => /vbaProject\.bin$/i.test(n))) rep.note('macro', 'warn', t('r.macro', 'Macros in the document were ignored.'));
    if (zip.names().some((n) => /\/embeddings\//i.test(n))) rep.note('embed', 'warn', t('r.embed', 'Embedded objects were not imported.'));
    return { title, html, meta, report: rep.list() };
  }

  edio.docx = Object.assign(edio.docx || {}, { importDocx });
})();
