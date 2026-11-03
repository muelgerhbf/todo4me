/* Todo4Me — Markdown import/export for editor documents.
 *
 * Export writes Obsidian-compatible Markdown: GitHub tables, ```code fences```,
 * $inline$ / $$block$$ formulas, ==highlights==, ~~strikethrough~~. Things Markdown
 * cannot express (colors, fonts, alignment) are dropped; images, charts and
 * drawings are embedded as data-URL images so the file stays self-contained.
 * The native format remains the HTML document (lossless); Markdown is for exchange. */
T4.edmd = (function () {
  'use strict';
  const U = T4.util;
  const { esc } = U;

  /* ====================== HTML → Markdown ====================== */
  const mdEscape = (s) => s.replace(/([\\`*_[\]<>|$]|==|~~)/g, '\\$1');
  const props = (el) => { try { return JSON.parse(el.getAttribute('data-p') || '{}'); } catch (e) { return {}; } };
  const isBold = (el) => /^(B|STRONG)$/.test(el.tagName) || /font-weight:\s*(bold|[6-9]00)/.test(el.getAttribute('style') || '');
  const isItalic = (el) => /^(I|EM)$/.test(el.tagName) || /font-style:\s*italic/.test(el.getAttribute('style') || '');

  function inline(node, ctx) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += mdEscape(n.nodeValue.replace(/\s+/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { out += ctx.table ? '<br>' : '  \n'; return; }
      if (n.classList.contains('t4-w') && n.getAttribute('data-w') === 'math') { out += '$' + (props(n).tex || '') + '$'; return; }
      if (t === 'CODE') { const c = n.textContent; const fence = c.includes('`') ? '``' : '`'; out += fence + c + fence; return; }
      if (t === 'A') { out += '[' + inline(n, ctx) + '](' + (n.getAttribute('href') || '').replace(/\)/g, '%29') + ')'; return; }
      let inner = inline(n, ctx);
      if (!inner.trim()) { out += inner; return; }
      // keep surrounding whitespace outside the markers (**x** not ** x**)
      const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
      inner = inner.trim();
      const style = n.getAttribute('style') || '';
      if (isBold(n)) inner = '**' + inner + '**';
      if (isItalic(n)) inner = '*' + inner + '*';
      if (t === 'S' || /line-through/.test(style)) inner = '~~' + inner + '~~';
      if (t === 'MARK' || (t === 'SPAN' && /background-color/.test(style))) inner = '==' + inner + '==';
      if (t === 'U' || (t === 'SPAN' && /underline/.test(style))) inner = '<u>' + inner + '</u>';
      if (t === 'SUB') inner = '<sub>' + inner + '</sub>';
      if (t === 'SUP') inner = '<sup>' + inner + '</sup>';
      out += lead + inner + trail;
    });
    return out;
  }

  async function block(el, ctx, depth) {
    const t = el.tagName;
    if (el.classList && el.classList.contains('t4-w')) {
      const p = props(el);
      switch (el.getAttribute('data-w')) {
        case 'code': {
          const code = (el.querySelector('pre') || el).textContent;
          const lang = p.lang === 'markup' ? 'html' : p.lang || '';
          const fence = code.includes('```') ? '~~~~' : '```';
          return fence + lang + '\n' + code + '\n' + fence;
        }
        case 'math': return '$$\n' + (p.tex || '') + '\n$$';
        case 'pagebreak': return '<!-- pagebreak -->';
        case 'img': {
          const url = ctx.images ? await T4.docstore.assetDataURL(p.a) : null;
          return url ? '![' + mdEscape(p.alt || p.cap || 'image') + '](' + url + ')' + (p.cap ? '\n*' + mdEscape(p.cap) + '*' : '') : '';
        }
        case 'chart': case 'draw': {
          const v = T4.edw.validate(el.getAttribute('data-w'), p);
          if (!v) return '';
          const svg = el.getAttribute('data-w') === 'chart' ? T4.edw.chartSVG(v)
            : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + T4.edw.DRAW_W + ' ' + v.h + '">' + v.shapes.map(T4.edw.shapeSVG).join('') + '</svg>';
          return '![' + (el.getAttribute('data-w') === 'chart' ? mdEscape(v.title || 'Chart') : 'Drawing') + '](data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))) + ')';
        }
      }
      return '';
    }
    if (/^H[1-6]$/.test(t)) return '#'.repeat(+t[1]) + ' ' + inline(el, ctx).trim();
    if (t === 'P') return inline(el, ctx).trim();
    if (t === 'HR') return '---';
    if (t === 'BLOCKQUOTE') {
      const hasBlocks = Array.from(el.children).some((c) => /^(P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE)$/.test(c.tagName));
      const inner = hasBlocks ? (await blocks(el, ctx, depth)) : inline(el, ctx).trim();
      return inner.split('\n').map((l) => '> ' + l).join('\n');
    }
    if (t === 'UL' || t === 'OL') {
      const lines = [];
      let i = parseInt(el.getAttribute('start'), 10) || 1;
      for (const li of Array.from(el.children)) {
        if (li.tagName !== 'LI') { if (/^(UL|OL)$/.test(li.tagName)) lines.push(await block(li, ctx, depth + 1)); continue; }
        const marker = t === 'OL' ? (i++) + '. ' : '- ';
        const pad = '  '.repeat(depth);
        const textPart = document.createElement('div');
        const nested = [];
        li.childNodes.forEach((c) => { if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) nested.push(c); else textPart.appendChild(c.cloneNode(true)); });
        lines.push(pad + marker + inline(textPart, ctx).trim());
        for (const n of nested) lines.push(await block(n, ctx, depth + 1));
      }
      return lines.join('\n');
    }
    if (t === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => inline(c, Object.assign({}, ctx, { table: true })).trim().replace(/\n/g, ' ')));
      if (!rows.length) return '';
      const cols = Math.max(...rows.map((r) => r.length));
      const line = (r) => '| ' + Array.from({ length: cols }, (_, i) => r[i] || '').join(' | ') + ' |';
      return [line(rows[0]), '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |'].concat(rows.slice(1).map(line)).join('\n');
    }
    return inline(el, ctx).trim();
  }

  async function blocks(root, ctx, depth) {
    const out = [];
    for (const c of Array.from(root.childNodes)) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) out.push(mdEscape(c.nodeValue.trim())); continue; }
      if (c.nodeType !== 1) continue;
      const md = await block(c, ctx, depth || 0);
      if (md !== '') out.push(md);
    }
    return out.join('\n\n');
  }

  /** html: stored (canonical) document HTML. Resolves to a Markdown string. */
  async function toMarkdown(html, opts) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const title = opts && opts.title ? '# ' + opts.title + '\n\n' : '';
    return title + (await blocks(root, { images: !(opts && opts.images === false) })).replace(/\n{3,}/g, '\n\n') + '\n';
  }

  /* ====================== Markdown → HTML ====================== */
  const mathSpan = (tex) => '<span class="t4-w" data-w="math" data-p="' + esc(JSON.stringify({ tex })) + '"></span>';

  function inlineMd(src) {
    const keep = [];
    const stash = (html) => { keep.push(html); return '\u0000' + (keep.length - 1) + '\u0000'; };
    let s = src;
    // escapes first
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!|$=~<>])/g, (m, c) => stash(esc(c)));
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, f, code) => stash('<code>' + esc(code.trim()) + '</code>'));
    s = s.replace(/\$([^\s$](?:[^$]*[^\s$])?)\$/g, (m, tex) => stash(mathSpan(tex)));
    s = s.replace(/!\[([^\]]*)\]\((data:image\/[\w+.-]+;base64,[A-Za-z0-9+/=]+)\)/g, (m, alt, url) => stash('<img alt="' + esc(alt) + '" src="' + url + '">'));
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt) => (alt ? '[' + alt + ']' : ''));
    s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (m, url) => stash('<a href="' + esc(url) + '">' + esc(url) + '</a>'));
    s = s.replace(/<br\s*\/?>/gi, () => stash('<br>'));
    s = s.replace(/<(\/?)(u|sub|sup|mark|s|b|i|em|strong)>/gi, (m, slash, tag) => stash('<' + slash + tag.toLowerCase() + '>'));
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, text, url) => {
      const href = T4.edSanitize.safeHref(url.replace(/&amp;/g, '&'));
      return href ? '<a href="' + esc(href) + '">' + text + '</a>' : text;
    });
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a);
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
    s = s.replace(/\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, '<em>$1</em>');
    s = s.replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
    s = s.replace(/ {2,}\n/g, '<br>').replace(/\n/g, ' ');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
  }

  function fromMarkdown(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
    // YAML front matter (Obsidian) is metadata, not content.
    if (lines[0] === '---') { const end = lines.indexOf('---', 1); if (end > 0) lines.splice(0, end + 1); }
    return parseBlocks(lines);
  }

  const reList = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  function parseBlocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#-]*)/))) {
        const fence = m[1];
        const body = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
        i++;
        const lang = { html: 'markup', xml: 'markup', js: 'javascript', py: 'python', sh: 'bash', shell: 'bash' }[m[2].toLowerCase()] || m[2].toLowerCase();
        out.push('<figure class="t4-w" data-w="code" data-p="' + esc(JSON.stringify({ lang })) + '"><pre><code>' + esc(body.join('\n')) + '</code></pre></figure>');
        continue;
      }
      if (line.trim().startsWith('$$')) {
        const first = line.trim().slice(2);
        const body = [];
        if (first.endsWith('$$') && first.length > 2) { body.push(first.slice(0, -2)); i++; }
        else {
          if (first) body.push(first);
          i++;
          while (i < lines.length && !lines[i].trim().endsWith('$$')) body.push(lines[i++]);
          if (i < lines.length) { const last = lines[i].trim().slice(0, -2); if (last) body.push(last); i++; }
        }
        out.push('<figure class="t4-w" data-w="math" data-p="' + esc(JSON.stringify({ tex: body.join('\n').trim() })) + '"></figure>');
        continue;
      }
      if (/^\s*<!--\s*pagebreak\s*-->\s*$/i.test(line)) { out.push('<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>'); i++; continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push('<h' + m[1].length + '>' + inlineMd(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        // Obsidian callouts: > [!note] Title
        if (body[0] && /^\[![\w-]+\]/.test(body[0])) body[0] = '**' + body[0].replace(/^\[!([\w-]+)\][-+]?\s*/, (mm, k) => k.charAt(0).toUpperCase() + k.slice(1) + ': ') + '**';
        out.push('<blockquote>' + parseBlocks(body) + '</blockquote>');
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const split = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
        const aligns = split(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
        const head = split(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(split(lines[i++]));
        const cell = (tag, c, k) => '<' + tag + (aligns[k] ? ' style="text-align: ' + aligns[k] + '"' : '') + '>' + (inlineMd(c) || '<br>') + '</' + tag + '>';
        out.push('<table><thead><tr>' + head.map((c, k) => cell('th', c, k)).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + head.map((_, k) => cell('td', r[k] || '', k)).join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      if (reList.test(line)) {
        const items = [];
        while (i < lines.length && (reList.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          const lm = lines[i].match(reList);
          if (lm) items.push({ indent: lm[1].replace(/\t/g, '    ').length, ordered: /\d/.test(lm[2]), start: parseInt(lm[2], 10), text: lm[3] });
          else items[items.length - 1].text += ' ' + lines[i].trim();
          i++;
        }
        out.push(buildList(items, 0, items.length));
        continue;
      }
      // paragraph
      const body = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*(`{3,}|~{3,})|\s*\$\$)/.test(lines[i]) && !(reList.test(lines[i]) && body.length === 0) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])) {
        body.push(lines[i++]);
      }
      if (!body.length) { body.push(lines[i++]); }
      out.push('<p>' + inlineMd(body.join('\n')) + '</p>');
    }
    return out.join('');
  }

  function buildList(items, from, to) {
    if (from >= to) return '';
    const base = items[from].indent;
    const ordered = items[from].ordered;
    let html = ordered ? '<ol' + (items[from].start > 1 ? ' start="' + items[from].start + '"' : '') + '>' : '<ul>';
    let i = from;
    while (i < to) {
      const it = items[i];
      let j = i + 1;
      while (j < to && items[j].indent > base) j++;
      const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      const text = task ? (task[1] === ' ' ? '☐ ' : '☑ ') + task[2] : it.text;
      html += '<li>' + inlineMd(text) + buildList(items, i + 1, j) + '</li>';
      i = j;
    }
    return html + (ordered ? '</ol>' : '</ul>');
  }

  return { toMarkdown, fromMarkdown, inlineMd };
})();
