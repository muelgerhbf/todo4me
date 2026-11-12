/* Todo4Me — HTML, plain text and RTF export (T4.edio.html / txt / rtf). */
(function () {
  'use strict';
  const edio = (window.T4.edio = window.T4.edio || {});
  const C = edio.common;
  const { he, t } = C;
  const X = () => window.T4.edx;

  const TOKEN_CSS = '.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#6a7385;font-style:italic}.token.punctuation{color:#4a4f5c}.token.keyword,.token.atrule,.token.boolean,.token.important{color:#7c3aed}' +
    '.token.string,.token.attr-value,.token.char,.token.regex,.token.template-string{color:#0b7a43}.token.number,.token.constant,.token.symbol{color:#c2410c}.token.function,.token.class-name,.token.builtin{color:#1d4ed8}' +
    '.token.tag,.token.selector,.token.property,.token.attr-name,.token.variable{color:#b4235a}.token.operator,.token.entity,.token.url{color:#4a4f5c}';
  const DOC_CSS = 'html{background:#eef0f5}body{margin:0;font-family:Calibri,Carlito,"Segoe UI",sans-serif;font-size:11pt;line-height:1.15;color:#1f2330}' +
    '.t4-page{box-sizing:border-box;background:#fff;margin:24px auto;max-width:var(--w);padding:var(--m);box-shadow:0 2px 14px rgba(20,25,50,.18);overflow-wrap:break-word}' +
    '.t4-page p{margin:0 0 8pt}.t4-page h1,.t4-page h2,.t4-page h3,.t4-page h4,.t4-page h5,.t4-page h6{margin:16pt 0 6pt;line-height:1.2;font-weight:700;color:#1a1d29;break-after:avoid}' +
    '.t4-page h1{font-size:22pt;margin-top:0}.t4-page h2{font-size:16pt;color:#2b3a8c}.t4-page h3{font-size:13pt;color:#2b3a8c}.t4-page h4{font-size:12pt}.t4-page h5{font-size:11pt}.t4-page h6{font-size:11pt;font-style:italic;font-weight:600;color:#4a4f5c}' +
    '.t4-page a{color:#2453c8;text-underline-offset:2px}.t4-page ul,.t4-page ol{margin:0 0 8pt;padding-left:24pt}.t4-page li{margin:2pt 0}.t4-page li>p{margin:0}.t4-page ul ul{list-style-type:circle}' +
    '.t4-page blockquote{margin:10pt 0;padding:4pt 0 4pt 14pt;border-left:3pt solid #c5cbe0;color:#4a4f5c;font-style:italic}.t4-page hr{border:0;border-top:1px solid #c9ccd4;margin:14pt 0}' +
    '.t4-page code{font-family:"Fira Code",Consolas,monospace;font-size:.9em;background:#f1f3f7;color:#b4235a;border-radius:3px;padding:.05em .3em}.t4-page mark{background:#fff176;color:inherit}' +
    '.t4-page table{width:100%;border-collapse:collapse;margin:8pt 0 12pt}.t4-page th,.t4-page td{border:1px solid #c9ccd4;padding:4pt 7pt;vertical-align:top;text-align:left}.t4-page th{background:#f1f3f7}.t4-page tr{break-inside:avoid}' +
    'pre.t4-code{background:#f6f7fa;border:1px solid #e1e4ec;border-radius:4px;padding:8pt 10pt;overflow:auto;margin:0 0 10pt;font-size:10pt}pre.t4-code code{background:none;color:#1f2330;padding:0;font-size:inherit}' +
    'figure.t4-img,figure.t4-svg{margin:8pt 0}figure.t4-img img{max-width:100%;height:auto;display:block}figure.t4-svg svg{max-width:100%;height:auto;display:block}figure[data-al="center"]>.t4-box{margin:0 auto}figure[data-al="right"]>.t4-box{margin-left:auto}figure[data-al="float-left"]{float:left;margin:4pt 12pt 8pt 0}figure[data-al="float-right"]{float:right;margin:4pt 0 8pt 12pt}' +
    'figcaption{font-size:9pt;color:#4a4f5c;font-style:italic;margin-top:3pt;text-align:center}.t4-math-block{text-align:center;margin:8pt 0;font-size:12pt}.t4-pagebreak{break-after:page;height:0}' +
    '.t4-wikilink{color:#2453c8}ul.t4-check{list-style:none;padding-left:4pt}ul.t4-check li::before{content:"\\2610  "}ul.t4-check li[data-x-check="1"]::before{content:"\\2611  "}' +
    '.t4-callout{font-style:normal;color:#1f2330;border-left:4px solid #4f6bed;background:#eef1ff;padding:6pt 12pt;border-radius:3px}.t4-callout--tip{border-color:#2f9e55;background:#eaf7ef}.t4-callout--info{border-color:#0e7c86;background:#e6f5f6}.t4-callout--warning{border-color:#c98a12;background:#fff6e0}.t4-callout--danger{border-color:#d14343;background:#fdecec}' +
    '.t4-toc{margin:0 0 12pt}.t4-toc ol{list-style:none;padding-left:0;margin:0}.t4-toc li{margin:2pt 0}.t4-notes{margin-top:18pt;border-top:1px solid #c9ccd4;font-size:10pt}.t4-notes h2{font-size:12pt;margin:8pt 0 4pt}' +
    '@media print{html{background:#fff}.t4-page{box-shadow:none;margin:0;padding:0;max-width:none}}';

  function pageCss(meta, page) {
    const pg = meta.page || {};
    const [mt, mr, mb, ml] = page.margins;
    const box = 'font:9pt Calibri,Carlito,sans-serif;color:#6b7080';
    const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]+/g, ' ') + '"';
    const sl = C.hfSlots(pg, meta);
    const num = pg.numberFormat === 'plain' ? ['counter(page)'] : pg.numberFormat === 'slash' ? ['counter(page)', '" / "', 'counter(pages)']
      : C.pageOfText().split(/(\{a\}|\{b\})/).filter(Boolean).map((s) => (s === '{a}' ? 'counter(page)' : s === '{b}' ? 'counter(pages)' : q(s)));
    const at = { tl: '@top-left', tc: '@top-center', tr: '@top-right', bl: '@bottom-left', bc: '@bottom-center', br: '@bottom-right' };
    const content = (k, withNum) => { const parts = sl[k] ? [q(sl[k])] : []; if (withNum && sl.numBox === k) { if (parts.length) parts.push('" · "'); parts.push(...num); } return parts.length ? parts.join(' ') : null; };
    let css = '@page{size:' + page.w + 'mm ' + page.h + 'mm;margin:' + mt + 'mm ' + mr + 'mm ' + mb + 'mm ' + ml + 'mm;';
    Object.keys(at).forEach((k) => { const c = content(k, true); if (c) css += at[k] + '{content:' + c + ';' + box + '}'; });
    css += '}';
    if (pg.firstPageHeader === false) {
      let first = '';
      Object.keys(at).forEach((k) => { if (k[0] === 't') { if (content(k, true)) first += at[k] + '{content:none}'; } else if (sl.numBox === k) first += at[k] + '{content:' + (content(k, false) || 'none') + '}'; });
      if (first) css += '@page :first{' + first + '}';
    }
    return css;
  }

  /* ====================== HTML ====================== */
  async function exportHtml(doc) {
    const rep = C.createReport();
    const body = C.parseBody(doc.html);
    const d = body.ownerDocument;
    const meta = doc.meta || {};
    const page = C.geometry(meta.page);
    await C.ensureLibs();
    const titles = await C.wikiTitles(body);
    const tpl = d.createElement('template');
    const fromHtml = (h) => { tpl.innerHTML = h; return tpl.content.cloneNode(true); };
    let hasMath = false;
    const heads = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    heads.forEach((h, i) => { if (!h.id) h.id = 'h-' + (i + 1); });
    const notes = [];
    for (const w of Array.from(body.querySelectorAll('.t4-w'))) {
      const type = C.wtype(w), p = C.props(w);
      let repl = null;
      if (type === 'img') {
        let url = null;
        try { url = await window.T4.docstore.assetDataURL(p.a); } catch (e) { url = null; }
        if (url) repl = fromHtml('<figure class="t4-img" data-al="' + he(p.al || 'center') + '"><div class="t4-box" style="width:' + (+p.w || 100) + '%"><img src="' + he(url) + '" alt="' + he(p.alt || p.cap || '') + '"></div>' + (p.cap ? '<figcaption>' + he(p.cap) + '</figcaption>' : '') + '</figure>');
        else { rep.note('img', 'warn', t('r.image', 'An image could not be read and was replaced by its description.')); repl = fromHtml('<p><em>[' + he(p.alt || p.cap || 'image') + ']</em></p>'); }
      } else if (type === 'chart' || type === 'draw') {
        const sv = C.widgetSVG(type, p);
        if (sv) repl = fromHtml('<figure class="t4-svg" data-al="' + he(p.al || 'center') + '"><div class="t4-box" style="width:' + sv.widthPct + '%">' + sv.svg.replace(/ data-sid="[^"]*"/g, '') + '</div></figure>');
      } else if (type === 'math') {
        const ml = C.texMathML(p.tex, w.tagName !== 'SPAN');
        if (ml) { hasMath = true; repl = fromHtml(w.tagName === 'SPAN' ? ml : '<div class="t4-math-block">' + ml + '</div>'); }
        else { rep.note('math', 'warn', t('r.mathsrc', 'A formula was exported as LaTeX source text.')); repl = fromHtml('<code>' + he(p.tex || '') + '</code>'); }
      } else if (type === 'code') {
        const code = (w.querySelector('pre') || w).textContent;
        let h = he(code);
        try { if (p.lang && window.Prism && window.Prism.languages[p.lang]) h = window.T4.edw.highlight(code, p.lang); } catch (e) { /* plain */ }
        repl = fromHtml('<pre class="t4-code"><code>' + h + '</code></pre>');
      } else if (type === 'pagebreak') repl = fromHtml('<div class="t4-pagebreak"></div>');
      else if (type === 'toc') {
        const lv = Math.max(1, Math.min(6, +p.levels || 3));
        repl = fromHtml('<nav class="t4-toc">' + (p.title ? '<p><strong>' + he(p.title) + '</strong></p>' : '') + '<ol>' + heads.filter((h) => +h.tagName[1] <= lv && !w.contains(h)).map((h) => '<li style="margin-left:' + (+h.tagName[1] - 1) * 14 + 'pt"><a href="#' + he(h.id) + '">' + he(h.textContent.trim()) + '</a></li>').join('') + '</ol></nav>');
      } else if (type === 'wikilink') repl = d.createTextNode(C.wikiText(w, titles));
      else if (type === 'footnote') {
        notes.push(String(p.text || ''));
        repl = fromHtml('<sup><a id="fnref-' + notes.length + '" href="#fn-' + notes.length + '">' + notes.length + '</a></sup>');
      } else {
        const tx = X().widgets.has(type) ? X().widgets.textOf(type, p, w) : '';
        rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented and was exported as plain text.', { name: type }));
        repl = w.tagName === 'SPAN' ? d.createTextNode(tx) : fromHtml('<p>' + he(tx) + '</p>');
      }
      if (repl) w.replaceWith(repl); else w.remove();
    }
    body.querySelectorAll('[data-p],[data-w]').forEach((e) => { e.removeAttribute('data-p'); e.removeAttribute('data-w'); });
    let inner = body.innerHTML;
    if (notes.length) inner += '<section class="t4-notes"><h2>' + he(t('notes', 'Notes')) + '</h2><ol>' + notes.map((n, i) => '<li id="fn-' + (i + 1) + '">' + he(n) + ' <a href="#fnref-' + (i + 1) + '">↩</a></li>').join('') + '</ol></section>';
    const title = (meta.title && meta.title.trim()) || t('untitled', 'Untitled document');
    const contentMm = page.w - page.margins[1] - page.margins[3];
    const html = '<!doctype html>\n<html lang="' + he(C.langOf()) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Todo4Me">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><title>' + he(title) + '</title><style>' + DOC_CSS + TOKEN_CSS + pageCss(meta, page) + '</style></head>' +
      '<body><main class="t4-page" style="--w:' + page.w + 'mm;--m:' + page.margins.map((m) => m + 'mm').join(' ') + '"><h1 class="t4-title">' + he(title) + '</h1>' + inner + '</main></body></html>\n';
    void hasMath; void contentMm;
    return { blob: new Blob([html], { type: 'text/html' }), report: rep.list() };
  }

  /* ====================== TXT ====================== */
  async function exportTxt(doc) {
    const rep = C.createReport();
    const body = C.parseBody(doc.html);
    const meta = doc.meta || {};
    await C.ensureLibs();
    const titles = await C.wikiTitles(body);
    const notes = [];
    const norm = (s) => s.replace(/[ \t]+/g, ' ');
    function inl(node) {
      let out = '';
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { out += C.collapse(n.nodeValue); return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'BR') { out += '\n'; return; }
        if (C.isWidget(n)) {
          const type = C.wtype(n), p = C.props(n);
          if (type === 'wikilink') out += C.wikiText(n, titles);
          else if (type === 'math') out += p.tex || '';
          else if (type === 'footnote') { notes.push(String(p.text || '')); out += '[' + notes.length + ']'; }
          else if (X().widgets.has(type)) { rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented and was exported as plain text.', { name: type })); out += X().widgets.textOf(type, p, n); }
          return;
        }
        out += inl(n);
      });
      return out;
    }
    const lines = [];
    const blank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };
    function listOut(el, depth) {
      const ordered = el.tagName === 'OL', check = el.classList.contains('t4-check');
      let n = parseInt(el.getAttribute('start'), 10) || 1;
      Array.from(el.children).forEach((li) => {
        if (li.tagName === 'UL' || li.tagName === 'OL') { listOut(li, depth + 1); return; }
        if (li.tagName !== 'LI') return;
        const textPart = document.createElement('div');
        const nested = [];
        li.childNodes.forEach((c) => { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c); else textPart.appendChild(c.cloneNode(true)); });
        const marker = check ? (li.getAttribute('data-x-check') === '1' ? '[x] ' : '[ ] ') : ordered ? (n++) + '. ' : '- ';
        const txt = inl(textPart).trim().split('\n');
        lines.push('  '.repeat(depth) + marker + txt[0]);
        txt.slice(1).forEach((l) => lines.push('  '.repeat(depth) + ' '.repeat(marker.length) + l));
        nested.forEach((c) => listOut(c, depth + 1));
      });
    }
    function blocks(parent, prefix) {
      const start = lines.length;
      const flushLoose = (nodes) => { if (!nodes.length) return; const h = document.createElement('div'); nodes.forEach((x) => h.appendChild(x.cloneNode(true))); const s = inl(h).trim(); if (s) { blank(); s.split('\n').forEach((l) => lines.push(l)); } };
      let loose = [];
      Array.from(parent.childNodes).forEach((c) => {
        if (c.nodeType === 3 || (c.nodeType === 1 && (/^(B|STRONG|I|EM|U|S|MARK|SUB|SUP|CODE|A|SPAN|BR)$/.test(c.tagName) || (C.isWidget(c) && c.tagName === 'SPAN')))) { loose.push(c); return; }
        if (c.nodeType !== 1) return;
        flushLoose(loose); loose = [];
        const tag = c.tagName;
        if (C.isWidget(c)) {
          const type = C.wtype(c), p = C.props(c);
          blank();
          if (type === 'code') (c.querySelector('pre') || c).textContent.replace(/\n$/, '').split('\n').forEach((l) => lines.push('    ' + l));
          else if (type === 'math') lines.push('    ' + (p.tex || ''));
          else if (type === 'img') { rep.note('img', 'info', t('r.txtimg', 'Images and drawings are replaced by a short description in plain text.')); lines.push('[' + t('image', 'Image') + ': ' + (p.alt || p.cap || '') + ']'); if (p.cap && p.alt) lines.push(p.cap); }
          else if (type === 'chart' || type === 'draw') {
            rep.note('img', 'info', t('r.txtimg', 'Images and drawings are replaced by a short description in plain text.'));
            if (type === 'chart') { lines.push('[' + t('chart', 'Chart') + (p.title ? ': ' + p.title : '') + ']'); (p.labels || []).forEach((lb, i) => lines.push('  ' + lb + ': ' + (p.series || []).map((s) => s.values && s.values[i]).join(', '))); }
            else lines.push('[' + t('drawing', 'Drawing') + ']');
          } else if (type === 'pagebreak') lines.push('----------');
          else if (type === 'toc') {
            const lv = Math.max(1, Math.min(6, +p.levels || 3));
            if (p.title) lines.push(p.title);
            Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => +h.tagName[1] <= lv).forEach((h) => lines.push('  '.repeat(+h.tagName[1] - 1) + h.textContent.trim()));
          } else if (X().widgets.has(type)) { rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented and was exported as plain text.', { name: type })); lines.push(X().widgets.textOf(type, p, c)); }
          return;
        }
        if (/^H[1-6]$/.test(tag)) {
          const s = inl(c).replace(/\n/g, ' ').trim();
          blank(); lines.push(s);
          const lv = +tag[1];
          if (lv <= 3) lines.push((lv === 1 ? '=' : lv === 2 ? '-' : '~').repeat(Math.max(3, Math.min(80, s.length))));
          return;
        }
        if (tag === 'UL' || tag === 'OL') { blank(); listOut(c, 0); return; }
        if (tag === 'HR') { blank(); lines.push('-----'); return; }
        if (tag === 'BLOCKQUOTE') {
          blank();
          const mark = lines.length;
          blocks(c, '> ');
          for (let i = mark; i < lines.length; i++) lines[i] = '> ' + lines[i];
          return;
        }
        if (tag === 'TABLE') {
          const rows = Array.from(c.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((td) => inl(td).replace(/\n/g, ' ').trim()));
          const nc = Math.max(0, ...rows.map((r) => r.length));
          const w = Array.from({ length: nc }, (_, i) => Math.min(40, Math.max(1, ...rows.map((r) => (r[i] || '').length))));
          blank();
          rows.forEach((r, ri) => {
            lines.push(Array.from({ length: nc }, (_, i) => (r[i] || '').padEnd(w[i])).join(' | ').replace(/\s+$/, ''));
            if (ri === 0 && (c.querySelector('th'))) lines.push(w.map((x) => '-'.repeat(x)).join('-+-'));
          });
          return;
        }
        if (tag === 'P' || tag === 'SUMMARY') { const s = inl(c).trim(); blank(); if (s) s.split('\n').forEach((l) => lines.push(norm(l))); else lines.push(''); return; }
        if (c.children.length && Array.from(c.children).some((k) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE)$/.test(k.tagName) || C.isWidget(k))) { blocks(c, prefix); return; }
        const s = inl(c).trim(); if (s) { blank(); lines.push(s); }
      });
      flushLoose(loose);
      return lines.length - start;
    }
    const title = (meta.title && meta.title.trim()) || '';
    if (title) { lines.push(title, '='.repeat(Math.max(3, Math.min(80, title.length))), ''); }
    blocks(body, '');
    if (notes.length) { blank(); lines.push(t('notes', 'Notes')); lines.push('-'.repeat(5)); notes.forEach((n, i) => lines.push('[' + (i + 1) + '] ' + n)); }
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
    return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), report: rep.list() };
  }

  /* ====================== RTF ====================== */
  const rtfEsc = (s) => String(s).replace(/[\\{}]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\line ').replace(/\t/g, '\\tab ')
    .replace(/[^\x20-\x7e]/g, (ch) => { const c = ch.charCodeAt(0); return '\\u' + (c > 32767 ? c - 65536 : c) + '?'; });
  async function exportRtf(doc) {
    const rep = C.createReport();
    const body = C.parseBody(doc.html);
    const meta = doc.meta || {};
    await C.ensureLibs();
    const titles = await C.wikiTitles(body);
    const page = C.geometry(meta.page);
    const colors = ['#000000'];
    const col = (hex) => { let i = colors.indexOf('#' + hex); if (i < 0) { colors.push('#' + hex); i = colors.length - 1; } return i; };
    const notes = [];
    let out = '';
    function inl(node, f) {
      let s = '';
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { s += rtfEsc(C.collapse(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tg = n.tagName;
        if (tg === 'BR') { s += '\\line '; return; }
        if (C.isWidget(n)) {
          const type = C.wtype(n), p = C.props(n);
          if (type === 'wikilink') s += rtfEsc(C.wikiText(n, titles));
          else if (type === 'math') { rep.note('math', 'info', t('r.mathsrc', 'A formula was exported as LaTeX source text.')); s += rtfEsc('$' + (p.tex || '') + '$'); }
          else if (type === 'footnote') { notes.push(String(p.text || '')); s += '{\\super ' + notes.length + '}'; }
          else { rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented and was exported as plain text.', { name: type })); s += rtfEsc(X().widgets.has(type) ? X().widgets.textOf(type, p, n) : ''); }
          return;
        }
        let pre = '', post = '';
        if (tg === 'B' || tg === 'STRONG') { pre += '\\b '; post = '\\b0 ' + post; }
        if (tg === 'I' || tg === 'EM') { pre += '\\i '; post = '\\i0 ' + post; }
        if (tg === 'U') { pre += '\\ul '; post = '\\ulnone ' + post; }
        if (tg === 'S') { pre += '\\strike '; post = '\\strike0 ' + post; }
        if (tg === 'SUB') { pre += '\\sub '; post = '\\nosupersub ' + post; }
        if (tg === 'SUP') { pre += '\\super '; post = '\\nosupersub ' + post; }
        if (tg === 'CODE') { pre += '\\f1 '; post = '\\f0 ' + post; }
        if (tg === 'MARK') { pre += '\\highlight' + col('FFF176') + ' '; post = '\\highlight0 ' + post; }
        const c = C.cssColor(n.style && n.style.color);
        if (c) { pre += '\\cf' + col(c) + ' '; post = '\\cf0 ' + post; }
        let inner = inl(n, f);
        if (tg === 'A' && /^https?:/i.test(n.getAttribute('href') || '')) inner += rtfEsc(' (' + n.getAttribute('href') + ')');
        s += '{' + pre + inner + '}';
      });
      return s;
    }
    const P = (inner, o) => { o = o || {}; return '\\pard' + (o.jc ? '\\q' + o.jc : '') + (o.li ? '\\li' + o.li : '') + (o.fi ? '\\fi' + o.fi : '') + '\\sa' + (o.sa == null ? 160 : o.sa) + ' ' + inner + '\\par\n'; };
    const SZ = { 1: 44, 2: 32, 3: 26, 4: 24, 5: 22, 6: 22 };
    function listOut(el, depth) {
      const ordered = el.tagName === 'OL', check = el.classList.contains('t4-check');
      let n = parseInt(el.getAttribute('start'), 10) || 1;
      let s = '';
      Array.from(el.children).forEach((li) => {
        if (li.tagName === 'UL' || li.tagName === 'OL') { s += listOut(li, depth + 1); return; }
        if (li.tagName !== 'LI') return;
        const tp = document.createElement('div'); const nested = [];
        li.childNodes.forEach((c) => { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c); else tp.appendChild(c.cloneNode(true)); });
        const mk = check ? (li.getAttribute('data-x-check') === '1' ? '\\u9745? ' : '\\u9744? ') : ordered ? (n++) + '.\\tab ' : '\\u8226?\\tab ';
        s += P(mk + inl(tp, {}), { li: 720 * (depth + 1), fi: check ? 0 : -360, sa: 40 });
        nested.forEach((c) => { s += listOut(c, depth + 1); });
      });
      return s;
    }
    function blocks(parent, o) {
      let s = '';
      let loose = [];
      const flush = () => { if (!loose.length) return; const h = document.createElement('div'); loose.forEach((x) => h.appendChild(x.cloneNode(true))); if (h.textContent.trim()) s += P(inl(h, {}), o); loose = []; };
      Array.from(parent.childNodes).forEach((c) => {
        if (c.nodeType === 3 || (c.nodeType === 1 && (/^(B|STRONG|I|EM|U|S|MARK|SUB|SUP|CODE|A|SPAN|BR)$/.test(c.tagName) || (C.isWidget(c) && c.tagName === 'SPAN')))) { loose.push(c); return; }
        if (c.nodeType !== 1) return;
        flush();
        const tag = c.tagName;
        if (C.isWidget(c)) {
          const type = C.wtype(c), p = C.props(c);
          if (type === 'code') (c.querySelector('pre') || c).textContent.replace(/\n$/, '').split('\n').forEach((l) => { s += P('{\\f1\\fs20 ' + rtfEsc(l) + '}', { sa: 0, li: 120 }); });
          else if (type === 'math') { rep.note('math', 'info', t('r.mathsrc', 'A formula was exported as LaTeX source text.')); s += P('{\\f1 ' + rtfEsc(p.tex || '') + '}', { jc: 'c' }); }
          else if (type === 'pagebreak') s += '\\page\n';
          else if (type === 'img' || type === 'chart' || type === 'draw') { rep.note('img', 'warn', t('r.rtfimg', 'RTF export does not contain images; they are replaced by a short description.')); s += P('{\\i [' + rtfEsc(p.alt || p.cap || p.title || type) + ']}', {}); }
          else if (type === 'toc') { const lv = Math.max(1, Math.min(6, +p.levels || 3)); Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => +h.tagName[1] <= lv).forEach((h) => { s += P(rtfEsc(h.textContent.trim()), { li: (+h.tagName[1] - 1) * 360, sa: 40 }); }); }
          else { rep.note('w:' + type, 'warn', t('r.widget', 'The element “{name}” cannot be represented and was exported as plain text.', { name: type })); s += P(rtfEsc(X().widgets.has(type) ? X().widgets.textOf(type, p, c) : ''), {}); }
          return;
        }
        if (/^H[1-6]$/.test(tag)) { s += '\\pard\\keepn\\sb240\\sa120 {\\b\\fs' + SZ[+tag[1]] + ' ' + inl(c, {}) + '}\\par\n'; return; }
        if (tag === 'UL' || tag === 'OL') { s += listOut(c, 0); return; }
        if (tag === 'HR') { s += '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n'; return; }
        if (tag === 'BLOCKQUOTE') { s += blocks(c, { li: 360, jc: '' }); return; }
        if (tag === 'TABLE') {
          const rows = Array.from(c.querySelectorAll('tr'));
          const nc = Math.max(1, ...rows.map((r) => r.children.length));
          const cw = Math.floor((page.w - page.margins[1] - page.margins[3]) * 56.6929 / nc);
          rows.forEach((tr) => {
            let r = '\\trowd\\trgaph108';
            for (let i = 0; i < nc; i++) r += '\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx' + cw * (i + 1);
            Array.from(tr.children).forEach((td) => { r += '\\pard\\intbl ' + (td.tagName === 'TH' ? '{\\b ' : '{') + inl(td, {}) + '}\\cell'; });
            for (let i = tr.children.length; i < nc; i++) r += '\\pard\\intbl \\cell';
            s += r + '\\row\n';
          });
          s += P('', { sa: 0 });
          return;
        }
        if (c.children.length && Array.from(c.children).some((k) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE)$/.test(k.tagName) || C.isWidget(k))) { s += blocks(c, o); return; }
        const jc = { center: 'c', right: 'r', justify: 'j' }[c.style && c.style.textAlign] || '';
        s += P(inl(c, {}), Object.assign({}, o, jc ? { jc } : {}));
      });
      flush();
      return s;
    }
    if (meta.title && meta.title.trim()) out += '\\pard\\sa240 {\\b\\fs52 ' + rtfEsc(meta.title.trim()) + '}\\par\n';
    out += blocks(body, {});
    if (notes.length) { out += P('{\\b ' + rtfEsc(t('notes', 'Notes')) + '}', {}); notes.forEach((n, i) => { out += P(rtfEsc('[' + (i + 1) + '] ' + n), { sa: 40 }); }); }
    const w = C.mmToTw(page.w), h = C.mmToTw(page.h), m = page.margins.map(C.mmToTw);
    const head = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}{\\colortbl;' +
      colors.slice(1).map((hx) => { const v = parseInt(hx.slice(1), 16); return '\\red' + (v >> 16 & 255) + '\\green' + (v >> 8 & 255) + '\\blue' + (v & 255) + ';'; }).join('') + '}' +
      '{\\info{\\title ' + rtfEsc(meta.title || '') + '}}\\paperw' + (page.landscape ? h : w).toString() + '\\paperh' + (page.landscape ? w : h) + (page.landscape ? '\\landscape' : '') + '\\margt' + m[0] + '\\margr' + m[1] + '\\margb' + m[2] + '\\margl' + m[3] + '\\fs22\n';
    // landscape: paperw/paperh already hold the rotated geometry (page.w/h are swapped by geometry())
    const fixed = head.replace(/\\paperw\d+\\paperh\d+/, '\\paperw' + w + '\\paperh' + h);
    return { blob: new Blob([fixed + out + '}'], { type: 'application/rtf' }), report: rep.list() };
  }

  edio.html = { exportHtml, exportTxt, exportRtf };
})();
