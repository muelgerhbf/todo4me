/* Todo4Me — editor widgets: images, drawings (shapes), charts, formulas, code blocks, page breaks.
 *
 * A widget is stored as <figure|span class="t4-w" data-w="type" data-p="{json props}">.
 * In the editor it is "hydrated": its inside is rendered from the props (SVG, KaTeX,
 * highlighted code). Saving strips the rendering again (see T4.editor serialize),
 * so the stored document only contains the editable source data. */
T4.edw = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui;
  const { esc, icon } = U;
  // English text as dictionary key part ('ed.<text>'), falls back to the text itself (see editor.js).
  const E = (s, p) => {
    const k = 'ed.' + s;
    if (T4.i18n.has(k)) return T4.i18n.t(k, p);
    return p ? String(s).replace(/\{(\w+)\}/g, (m, n) => (p[n] != null ? p[n] : m)) : s;
  };

  /* ====================== Lazy-loaded libraries ====================== */
  let libsPromise = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadCSS(href) {
    return new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = res; l.onerror = res;
      document.head.appendChild(l);
    });
  }
  /** KaTeX + Prism are only loaded when the editor is opened (keeps app start-up unchanged). */
  function ensureLibs() {
    if (!libsPromise) {
      libsPromise = Promise.all([
        window.katex ? null : loadScript('vendor/katex/katex.min.js'),
        loadCSS('vendor/katex/katex.min.css'),
        window.Prism && window.Prism.highlight ? null : loadScript('vendor/prism/prism.js'),
      ]).then(() => true, (e) => { console.warn('[Todo4Me]', e.message); libsPromise = null; return false; });
    }
    return libsPromise;
  }

  let changeHandler = () => {};
  const changed = (el, opts) => changeHandler(el, opts || {});

  /* ====================== Props ====================== */
  function getProps(el) {
    try { return JSON.parse(el.getAttribute('data-p') || '{}') || {}; } catch (e) { return {}; }
  }
  function setProps(el, p) {
    const v = validate(el.getAttribute('data-w'), p);
    if (!v) return;
    el.setAttribute('data-p', JSON.stringify(v));
    render(el);
  }

  const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : d; };
  const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : v === 'none' ? 'none' : d);
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);

  const CODE_LANGS = [['', 'Plain text'], ['javascript', 'JavaScript'], ['python', 'Python'], ['markup', 'HTML'], ['css', 'CSS'], ['json', 'JSON'],
    ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'], ['csharp', 'C#'], ['sql', 'SQL'], ['bash', 'Bash']];
  const LANG_ALIASES = { cs: 'csharp', 'c#': 'csharp', dotnet: 'csharp', js: 'javascript', html: 'markup', xml: 'markup', svg: 'markup', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', 'c++': 'cpp', cc: 'cpp', h: 'c', ts: 'javascript', typescript: 'javascript', jsx: 'javascript' };
  const SHAPES = [['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['ellipse', 'Circle'], ['tri', 'Triangle'], ['diamond', 'Diamond'], ['line', 'Line'], ['arrow', 'Arrow']];
  const CHART_TYPES = [['bar', 'Bar chart'], ['line', 'Line chart'], ['pie', 'Pie chart']];
  const PALETTE = ['#4f6bed', '#e5603c', '#2f9e55', '#d6409f', '#c98a12', '#0e7c86', '#8e4ec6', '#5f6b7a'];
  const DRAW_W = 640;

  function validate(type, p) {
    p = p && typeof p === 'object' ? p : {};
    switch (type) {
      case 'img':
        if (typeof p.a !== 'string' || !/^img_\w{1,60}$/.test(p.a)) return null;
        return { a: p.a, w: num(p.w, 5, 100, 100), al: oneOf(p.al, ['center', 'left', 'right', 'float-left', 'float-right'], 'center'), cap: str(p.cap, 300), alt: str(p.alt, 300) };
      case 'math':
        return { tex: str(p.tex, 5000) };
      case 'code': {
        const l = String(p.lang || '').toLowerCase();
        const lang = LANG_ALIASES[l] || l;
        return { lang: CODE_LANGS.some((c) => c[0] === lang) ? lang : '' };
      }
      case 'pagebreak':
        return {};
      case 'chart': {
        const labels = (Array.isArray(p.labels) ? p.labels : []).slice(0, 40).map((l) => str(l, 60));
        const series = (Array.isArray(p.series) ? p.series : []).slice(0, 8).map((s, i) => ({
          name: str(s && s.name, 60),
          color: color(s && s.color, PALETTE[i % PALETTE.length]),
          values: labels.map((_, j) => { const v = Number(s && Array.isArray(s.values) ? s.values[j] : 0); return Number.isFinite(v) ? Math.max(-1e12, Math.min(1e12, v)) : 0; }),
        }));
        if (!labels.length || !series.length) return null;
        return { type: oneOf(p.type, ['bar', 'line', 'pie'], 'bar'), title: str(p.title, 120), labels, series, w: num(p.w, 20, 100, 100), legend: p.legend !== false };
      }
      case 'draw': {
        const h = num(p.h, 60, 1600, 240);
        const shapes = (Array.isArray(p.shapes) ? p.shapes : []).slice(0, 200).map((s) => {
          if (!s || typeof s !== 'object') return null;
          const t = oneOf(s.t, SHAPES.map((x) => x[0]), null);
          if (!t) return null;
          const lineLike = t === 'line' || t === 'arrow';
          return {
            id: typeof s.id === 'string' && /^\w{1,40}$/.test(s.id) ? s.id : U.uid('s'),
            t,
            x: num(s.x, -DRAW_W, DRAW_W * 2, 40), y: num(s.y, -h, h * 2, 40),
            w: num(s.w, lineLike ? -DRAW_W * 2 : 4, DRAW_W * 2, 120), h: num(s.h, lineLike ? -3200 : 4, 3200, 80),
            fill: color(s.fill, lineLike ? 'none' : '#dbe4ff'),
            stroke: color(s.stroke, '#4f6bed'),
            sw: num(s.sw, 0, 20, 2),
            text: str(s.text, 300),
            tc: color(s.tc, '#1f2330'),
            fs: num(s.fs, 8, 72, 16),
          };
        }).filter(Boolean);
        return { h, shapes, al: oneOf(p.al, ['center', 'left', 'right'], 'center') };
      }
      default:
        return null;
    }
  }

  /** Create a new (not yet hydrated) widget element. */
  function create(type, props, inline) {
    const v = validate(type, props);
    if (!v) return null;
    const el = document.createElement(inline ? 'span' : 'figure');
    el.className = 't4-w';
    el.setAttribute('data-w', type);
    el.setAttribute('data-p', JSON.stringify(v));
    if (type === 'code') { el.innerHTML = '<pre><code></code></pre>'; el.querySelector('code').textContent = props.code || ''; }
    return el;
  }

  /* ====================== Rendering ====================== */
  function hydrate(root) {
    const list = root.matches && root.matches('.t4-w') ? [root] : Array.from(root.querySelectorAll('.t4-w'));
    list.forEach((el) => { if (!el._t4) render(el); });
  }

  function render(el) {
    const type = el.getAttribute('data-w');
    const p = validate(type, getProps(el));
    el.setAttribute('contenteditable', 'false');
    el._t4 = true;
    if (!p) { el.innerHTML = '<span class="w-missing">Unsupported element</span>'; return; }
    el.classList.toggle('t4-w--inline', el.tagName === 'SPAN');
    switch (type) {
      case 'img': return renderImage(el, p);
      case 'math': return renderMath(el, p);
      case 'code': return renderCode(el, p);
      case 'chart': return renderChart(el, p);
      case 'draw': return renderDrawing(el, p);
      case 'pagebreak': el.innerHTML = '<span class="w-pb ed-ui" aria-hidden="true">Page break</span>'; return;
    }
  }

  /* ---------- Math ---------- */
  function texToHTML(tex, display) {
    if (!tex.trim()) return '<span class="w-math-empty">' + (display ? 'Empty formula — double-click to edit' : '∅') + '</span>';
    if (window.katex) {
      try {
        return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml', maxSize: 50, maxExpand: 500 });
      } catch (e) { /* fall through */ }
    }
    return '<code>' + esc(tex) + '</code>';
  }
  function renderMath(el, p) {
    const display = el.tagName !== 'SPAN';
    el.innerHTML = texToHTML(p.tex, display);
    el.title = 'Formula — double-click to edit';
  }

  /* ---------- Code ---------- */
  function highlight(code, lang) {
    if (lang && window.Prism && Prism.languages[lang]) {
      try { return Prism.highlight(code, Prism.languages[lang], lang); } catch (e) { /* plain */ }
    }
    return esc(code);
  }
  function renderCode(el, p) {
    const existing = el.querySelector('textarea');
    const code = existing ? existing.value : (el.querySelector('pre') ? el.querySelector('pre').textContent : '');
    el.innerHTML =
      '<div class="cw-head ed-ui">' +
        '<select class="cw-lang" aria-label="' + esc(E('Programming language')) + '">' + CODE_LANGS.map(([v, l]) => '<option value="' + v + '"' + (v === p.lang ? ' selected' : '') + '>' + esc(E(l)) + '</option>').join('') + '</select>' +
        '<button type="button" class="cw-copy" title="' + esc(E('Copy code')) + '">' + icon('copy') + '<span>' + esc(E('Copy')) + '</span></button>' +
      '</div>' +
      '<div class="cw-body"><pre class="cw-hl" aria-hidden="true"><code class="language-' + esc(p.lang || 'none') + '"></code></pre>' +
      '<textarea class="cw-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="' + esc(E('Code')) + '"></textarea></div>' +
      '<span class="cw-label" aria-hidden="true">' + esc(E((CODE_LANGS.find((c) => c[0] === p.lang) || CODE_LANGS[0])[1])) + '</span>';
    const ta = el.querySelector('textarea');
    ta.value = code;
    paintCode(el);
  }
  function paintCode(el) {
    const ta = el.querySelector('textarea');
    const p = getProps(el);
    // Trailing newline needs an extra char so the overlay keeps the same height.
    el.querySelector('.cw-hl code').innerHTML = highlight(ta.value, p.lang) + (ta.value.endsWith('\n') || !ta.value ? ' ' : '');
    ta.style.height = '0px';
    ta.style.height = Math.max(24, ta.scrollHeight) + 'px';
  }

  /* ---------- Images ---------- */
  function renderImage(el, p) {
    el.innerHTML = '<div class="iw-box" style="width:' + p.w + '%"><img alt="' + esc(p.alt || p.cap) + '" draggable="false">' +
      '<span class="iw-handle ed-ui" title="Drag to resize" aria-hidden="true"></span></div>' +
      (p.cap ? '<div class="iw-cap">' + esc(p.cap) + '</div>' : '');
    el.setAttribute('data-al', p.al);
    const img = el.querySelector('img');
    const url = T4.docstore.cachedAssetURL(p.a);
    if (url) img.src = url;
    else {
      T4.docstore.assetURL(p.a).then((u) => {
        if (u) img.src = u;
        else el.querySelector('.iw-box').outerHTML = '<div class="w-missing">' + icon('alert') + 'Image not found</div>';
      });
    }
  }

  /** Downscale / re-encode large images so documents stay fast. Resolves to a Blob. */
  function prepareImage(blob) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(blob.type)) { reject(new Error('Only PNG, JPEG, GIF, WebP and BMP images are supported.')); return; }
      if (blob.size > 40 * 1024 * 1024) { reject(new Error('This image is too large (max. 40 MB).')); return; }
      if (blob.type === 'image/gif' || blob.size < 600 * 1024) { resolve(blob); return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const MAX = 2000;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob((out) => resolve(out && out.size < blob.size ? out : blob), type, 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be read.')); };
      img.src = url;
    });
  }

  /* ---------- Charts (SVG) ---------- */
  function niceTicks(min, max, count) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = (count * step0) / span;
    const step = step0 * (err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e9) / 1e9);
    return out;
  }
  const fmtNum = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

  function chartSVG(p) {
    const W = 640, H = 360;
    const top = p.title ? 44 : 18;
    const showLegend = p.legend && (p.type === 'pie' || p.series.length > 1);
    let out = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(p.title || 'Chart') + '" xmlns="http://www.w3.org/2000/svg">';
    out += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';
    if (p.title) out += '<text x="' + W / 2 + '" y="28" text-anchor="middle" font-size="17" font-weight="700" fill="#1f2330">' + esc(p.title) + '</text>';

    if (p.type === 'pie') {
      const vals = p.series[0].values.map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0);
      const cx = showLegend ? 220 : W / 2, cy = top + (H - top - 16) / 2, r = Math.min(130, (H - top - 30) / 2);
      if (!total) out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#eef0f4"/><text x="' + cx + '" y="' + cy + '" text-anchor="middle" fill="#74747f" font-size="14">No data</text>';
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        if (!v || !total) return;
        const a1 = a0 + (v / total) * Math.PI * 2;
        const col = PALETTE[i % PALETTE.length];
        if (v === total) out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + col + '"/>';
        else {
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          out += '<path d="M' + cx + ' ' + cy + ' L' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="2"/>';
        }
        const mid = (a0 + a1) / 2, pct = v / total;
        if (pct >= 0.05) out += '<text x="' + (cx + r * 0.62 * Math.cos(mid)).toFixed(1) + '" y="' + (cy + r * 0.62 * Math.sin(mid)).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#fff">' + Math.round(pct * 100) + '%</text>';
        a0 = a1;
      });
      if (showLegend) {
        p.labels.forEach((l, i) => {
          const y = top + 20 + i * 24;
          if (y > H - 10) return;
          out += '<rect x="400" y="' + (y - 10) + '" width="14" height="14" rx="3" fill="' + PALETTE[i % PALETTE.length] + '"/>' +
            '<text x="422" y="' + (y + 1) + '" dominant-baseline="middle" font-size="13" fill="#2b2f3a">' + esc(l) + ' (' + fmtNum(vals[i]) + ')</text>';
        });
      }
      return out + '</svg>';
    }

    // Bar / line
    const all = p.series.flatMap((s) => s.values);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 5);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const left = 56, right = 16, bottom = showLegend ? 64 : 40;
    const pw = W - left - right, ph = H - top - bottom;
    const y = (v) => top + ph - ((v - lo) / (hi - lo || 1)) * ph;
    ticks.forEach((t) => {
      out += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="' + (t === 0 ? '#9aa0ab' : '#e3e5ea') + '" stroke-width="1"/>' +
        '<text x="' + (left - 8) + '" y="' + y(t).toFixed(1) + '" text-anchor="end" dominant-baseline="middle" font-size="12" fill="#6b7080">' + fmtNum(t) + '</text>';
    });
    const n = p.labels.length;
    const band = pw / n;
    p.labels.forEach((l, i) => {
      out += '<text x="' + (left + band * (i + 0.5)).toFixed(1) + '" y="' + (top + ph + 18) + '" text-anchor="middle" font-size="12" fill="#4a4f5c">' + esc(l.length > 14 && n > 6 ? l.slice(0, 12) + '…' : l) + '</text>';
    });
    if (p.type === 'bar') {
      const k = p.series.length;
      const bw = Math.max(2, (band * 0.72) / k);
      p.series.forEach((s, si) => s.values.forEach((v, i) => {
        const x = left + band * i + band * 0.14 + bw * si;
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        out += '<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' + Math.max(0, y1 - y0).toFixed(1) + '" rx="2" fill="' + s.color + '"/>';
      }));
    } else {
      p.series.forEach((s) => {
        const pts = s.values.map((v, i) => (left + band * (i + 0.5)).toFixed(1) + ',' + y(v).toFixed(1));
        out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
        pts.forEach((pt) => { const [cx, cy] = pt.split(','); out += '<circle cx="' + cx + '" cy="' + cy + '" r="3.5" fill="#fff" stroke="' + s.color + '" stroke-width="2"/>'; });
      });
    }
    if (showLegend) {
      let lx = left;
      p.series.forEach((s, i) => {
        const name = s.name || 'Series ' + (i + 1);
        out += '<rect x="' + lx + '" y="' + (H - 26) + '" width="14" height="14" rx="3" fill="' + s.color + '"/><text x="' + (lx + 20) + '" y="' + (H - 18) + '" dominant-baseline="middle" font-size="13" fill="#2b2f3a">' + esc(name) + '</text>';
        lx += 34 + name.length * 7.2;
      });
    }
    return out + '</svg>';
  }
  function renderChart(el, p) {
    el.innerHTML = '<div class="chw-box" style="width:' + p.w + '%">' + chartSVG(p) + '</div>';
    el.title = 'Chart — double-click to edit the data';
  }

  /* ---------- Drawings (shapes) ---------- */
  function shapeSVG(s) {
    const st = ' stroke="' + (s.sw ? s.stroke : 'none') + '" stroke-width="' + s.sw + '"';
    const fill = ' fill="' + (s.fill || 'none') + '"';
    const base = ' data-sid="' + s.id + '" class="dw-shape"';
    let g = '';
    switch (s.t) {
      case 'rect': g = '<rect' + base + ' x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '"' + fill + st + '/>'; break;
      case 'round': g = '<rect' + base + ' x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="' + Math.min(s.w, s.h) * 0.2 + '"' + fill + st + '/>'; break;
      case 'ellipse': g = '<ellipse' + base + ' cx="' + (s.x + s.w / 2) + '" cy="' + (s.y + s.h / 2) + '" rx="' + s.w / 2 + '" ry="' + s.h / 2 + '"' + fill + st + '/>'; break;
      case 'tri': g = '<polygon' + base + ' points="' + (s.x + s.w / 2) + ',' + s.y + ' ' + (s.x + s.w) + ',' + (s.y + s.h) + ' ' + s.x + ',' + (s.y + s.h) + '"' + fill + st + ' stroke-linejoin="round"/>'; break;
      case 'diamond': g = '<polygon' + base + ' points="' + (s.x + s.w / 2) + ',' + s.y + ' ' + (s.x + s.w) + ',' + (s.y + s.h / 2) + ' ' + (s.x + s.w / 2) + ',' + (s.y + s.h) + ' ' + s.x + ',' + (s.y + s.h / 2) + '"' + fill + st + ' stroke-linejoin="round"/>'; break;
      case 'line':
      case 'arrow': {
        const x2 = s.x + s.w, y2 = s.y + s.h;
        const sw = Math.max(1, s.sw);
        g = '<g' + base + '><line x1="' + s.x + '" y1="' + s.y + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + s.stroke + '" stroke-width="' + sw + '" stroke-linecap="round"/>' +
          '<line class="dw-hit" x1="' + s.x + '" y1="' + s.y + '" x2="' + x2 + '" y2="' + y2 + '" stroke="transparent" stroke-width="' + (sw + 12) + '"/>';
        if (s.t === 'arrow') {
          const a = Math.atan2(s.h, s.w), len = 10 + sw * 2.5, spread = 0.45;
          const p1 = [x2 - len * Math.cos(a - spread), y2 - len * Math.sin(a - spread)];
          const p2 = [x2 - len * Math.cos(a + spread), y2 - len * Math.sin(a + spread)];
          g += '<polygon points="' + x2 + ',' + y2 + ' ' + p1.map((v) => v.toFixed(1)).join(',') + ' ' + p2.map((v) => v.toFixed(1)).join(',') + '" fill="' + s.stroke + '"/>';
        }
        return g + '</g>';
      }
    }
    if (s.text) {
      const lines = s.text.split('\n');
      const lh = s.fs * 1.25;
      const cy = s.y + s.h / 2 - ((lines.length - 1) * lh) / 2 + (s.t === 'tri' ? s.h * 0.17 : 0);
      g += '<text class="dw-text" x="' + (s.x + s.w / 2) + '" text-anchor="middle" font-size="' + s.fs + '" fill="' + s.tc + '">' +
        lines.map((l, i) => '<tspan x="' + (s.x + s.w / 2) + '" y="' + (cy + i * lh).toFixed(1) + '" dominant-baseline="central">' + esc(l) + '</tspan>').join('') + '</text>';
    }
    return g;
  }
  function renderDrawing(el, p) {
    const sel = el._sel && p.shapes.some((s) => s.id === el._sel) ? el._sel : null;
    el._sel = sel;
    el.setAttribute('data-al', p.al);
    el.innerHTML = '<div class="dw-box"><svg class="dw-svg" viewBox="0 0 ' + DRAW_W + ' ' + p.h + '" xmlns="http://www.w3.org/2000/svg">' +
      p.shapes.map(shapeSVG).join('') + (sel ? handlesSVG(p.shapes.find((s) => s.id === sel)) : '') + '</svg>' +
      '<span class="dw-resize ed-ui" title="Drag to change the drawing height" aria-hidden="true"></span>' +
      (p.shapes.length ? '' : '<span class="dw-empty ed-ui">Empty drawing — add shapes from the toolbar</span>') + '</div>';
  }
  function handlesSVG(s) {
    if (!s) return '';
    const hs = 9;
    const h = (x, y, k) => '<rect class="dw-h ed-ui" data-h="' + k + '" x="' + (x - hs / 2) + '" y="' + (y - hs / 2) + '" width="' + hs + '" height="' + hs + '" rx="2"/>';
    if (s.t === 'line' || s.t === 'arrow') return '<g class="ed-ui">' + h(s.x, s.y, 'p1') + h(s.x + s.w, s.y + s.h, 'p2') + '</g>';
    return '<g class="ed-ui"><rect class="dw-sel" x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '"/>' +
      h(s.x, s.y, 'nw') + h(s.x + s.w, s.y, 'ne') + h(s.x, s.y + s.h, 'sw') + h(s.x + s.w, s.y + s.h, 'se') +
      h(s.x + s.w / 2, s.y, 'n') + h(s.x + s.w / 2, s.y + s.h, 's') + h(s.x, s.y + s.h / 2, 'w') + h(s.x + s.w, s.y + s.h / 2, 'e') + '</g>';
  }

  function drawingPoint(el, e) {
    const svg = el.querySelector('.dw-svg');
    const r = svg.getBoundingClientRect();
    const p = getProps(el);
    return { x: (e.clientX - r.left) * (DRAW_W / r.width), y: (e.clientY - r.top) * (p.h / r.height) };
  }
  function selectShape(el, id) {
    el._sel = id || null;
    render(el);
  }
  function selectedShape(el) {
    const p = getProps(el);
    return el._sel ? p.shapes.find((s) => s.id === el._sel) || null : null;
  }
  function updateShapes(el, fn, opts) {
    const p = getProps(el);
    fn(p);
    setProps(el, p);
    changed(el, opts);
  }
  function addShape(el, kind) {
    const p = getProps(el);
    const lineLike = kind === 'line' || kind === 'arrow';
    const n = p.shapes.length;
    const s = lineLike
      ? { id: U.uid('s'), t: kind, x: 200 + n * 12, y: p.h / 2 - 20 + n * 8, w: 220, h: 40, stroke: '#3b4252', sw: 3, fill: 'none' }
      : { id: U.uid('s'), t: kind, x: DRAW_W / 2 - 70 + n * 14, y: Math.max(10, p.h / 2 - 50 + n * 10), w: kind === 'ellipse' ? 110 : 140, h: kind === 'ellipse' ? 110 : 100, fill: PALETTE_FILLS[n % PALETTE_FILLS.length], stroke: PALETTE[n % PALETTE.length], sw: 2 };
    p.shapes.push(s);
    el._sel = s.id;
    setProps(el, p);
    changed(el);
  }
  const PALETTE_FILLS = ['#dbe4ff', '#ffe3d6', '#d9f2e1', '#fbdcef', '#fbefd2', '#d4f1f2', '#eadcf8', '#e6e8ec'];

  /** Pointer interaction inside a drawing. Returns true if the event was handled. */
  function drawingPointerDown(el, e) {
    const target = e.target;
    if (target.closest('.dw-resize')) {
      const start = e.clientY, p0 = getProps(el);
      const box = el.querySelector('.dw-svg').getBoundingClientRect();
      const ratio = p0.h / box.height;
      dragLoop(e, (ev) => {
        const p = getProps(el);
        p.h = Math.max(60, Math.min(1600, Math.round(p0.h + (ev.clientY - start) * ratio)));
        setProps(el, p);
      }, () => changed(el));
      return true;
    }
    const handle = target.closest('.dw-h');
    const shapeEl = target.closest('[data-sid]');
    if (handle && el._sel) {
      const kind = handle.getAttribute('data-h');
      const s0 = Object.assign({}, selectedShape(el));
      const p0pt = drawingPoint(el, e);
      dragLoop(e, (ev) => {
        const pt = drawingPoint(el, ev);
        const dx = pt.x - p0pt.x, dy = pt.y - p0pt.y;
        const p = getProps(el);
        const s = p.shapes.find((x) => x.id === s0.id);
        if (!s) return;
        if (kind === 'p1') { s.x = s0.x + dx; s.y = s0.y + dy; s.w = s0.w - dx; s.h = s0.h - dy; }
        else if (kind === 'p2') { s.w = s0.w + dx; s.h = s0.h + dy; }
        else {
          let { x, y, w, h } = s0;
          if (kind.includes('w')) { x = s0.x + dx; w = s0.w - dx; }
          if (kind.includes('e')) { w = s0.w + dx; }
          if (kind.includes('n')) { y = s0.y + dy; h = s0.h - dy; }
          if (kind.includes('s')) { h = s0.h + dy; }
          if (ev.shiftKey && kind.length === 2) { const m = Math.max(w, h); if (kind.includes('w')) x -= m - w; if (kind.includes('n')) y -= m - h; w = h = m; }
          if (w < 8) { if (kind.includes('w')) x -= 8 - w; w = 8; }
          if (h < 8) { if (kind.includes('n')) y -= 8 - h; h = 8; }
          Object.assign(s, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
        }
        setProps(el, p);
      }, () => changed(el));
      return true;
    }
    if (shapeEl) {
      const id = shapeEl.getAttribute('data-sid');
      if (el._sel !== id) selectShape(el, id);
      const s0 = Object.assign({}, selectedShape(el));
      const p0pt = drawingPoint(el, e);
      let moved = false;
      dragLoop(e, (ev) => {
        const pt = drawingPoint(el, ev);
        const dx = Math.round(pt.x - p0pt.x), dy = Math.round(pt.y - p0pt.y);
        if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        moved = true;
        const p = getProps(el);
        const s = p.shapes.find((x) => x.id === id);
        if (!s) return;
        s.x = s0.x + dx; s.y = s0.y + dy;
        setProps(el, p);
      }, () => { if (moved) changed(el); else changed(el, { selectionOnly: true }); });
      return true;
    }
    if (el._sel) { selectShape(el, null); changed(el, { selectionOnly: true }); }
    return false;
  }
  function dragLoop(e, onMove, onEnd) {
    e.preventDefault();
    const move = (ev) => onMove(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Toolbar actions for a drawing / its selected shape. */
  function drawingAction(el, action, value) {
    const id = el._sel;
    switch (action) {
      case 'add': addShape(el, value); return;
      case 'fill': case 'stroke': case 'tc':
        if (!id) return;
        updateShapes(el, (p) => { const s = p.shapes.find((x) => x.id === id); if (s) s[action] = value; });
        return;
      case 'sw': case 'fs':
        if (!id) return;
        updateShapes(el, (p) => { const s = p.shapes.find((x) => x.id === id); if (s) s[action] = Number(value); });
        return;
      case 'text': {
        const s = selectedShape(el);
        if (!s || s.t === 'line' || s.t === 'arrow') return;
        textDialog(E('Text in shape'), s.text, (text) => updateShapes(el, (p) => { const x = p.shapes.find((y) => y.id === id); if (x) x.text = text; }), true);
        return;
      }
      case 'duplicate': {
        const s = selectedShape(el);
        if (!s) return;
        const copy = Object.assign({}, s, { id: U.uid('s'), x: s.x + 20, y: s.y + 20 });
        el._sel = copy.id;
        updateShapes(el, (p) => p.shapes.push(copy));
        return;
      }
      case 'delete-shape':
        if (!id) return;
        el._sel = null;
        updateShapes(el, (p) => { p.shapes = p.shapes.filter((x) => x.id !== id); });
        return;
      case 'front': case 'back':
        if (!id) return;
        updateShapes(el, (p) => {
          const i = p.shapes.findIndex((x) => x.id === id);
          const [s] = p.shapes.splice(i, 1);
          if (action === 'front') p.shapes.push(s); else p.shapes.unshift(s);
        });
        return;
      case 'align':
        updateShapes(el, (p) => { p.al = value; });
        return;
    }
  }
  /** Keyboard inside a selected drawing. Returns true if handled. */
  function drawingKey(el, e) {
    const s = selectedShape(el);
    if (!s) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { drawingAction(el, 'delete-shape'); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { drawingAction(el, 'duplicate'); return true; }
    if (e.key === 'Enter') { drawingAction(el, 'text'); return true; }
    if (e.key === 'Escape') { selectShape(el, null); changed(el, { selectionOnly: true }); return true; }
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      updateShapes(el, (p) => { const x = p.shapes.find((y) => y.id === s.id); if (x) { x.x += d[0]; x.y += d[1]; } }, { coalesce: 'nudge' });
      return true;
    }
    return false;
  }

  /* ====================== Dialogs ====================== */
  function textDialog(title, value, onSave, multiline) {
    ui.openModal({
      title,
      size: 'sm',
      body: '<form id="wtext-form" class="form"><div class="field">' +
        (multiline ? '<textarea id="wtext" rows="3">' + esc(value) + '</textarea>' : '<input id="wtext" type="text" value="' + esc(value) + '">') +
        '</div></form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(T4.i18n.t('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="wtext-form">' + esc(E('Save')) + '</button>',
      onMount(m) {
        const f = m.querySelector('#wtext-form');
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); } });
        f.addEventListener('submit', (e) => { e.preventDefault(); const v = m.querySelector('#wtext').value; ui.closeModal(true); onSave(v); });
      },
    });
  }

  const MATH_GROUPS = [
    ['Structures', [['\\frac{a}{b}', 'Fraction'], ['\\sqrt{x}', 'Square root'], ['\\sqrt[n]{x}', 'n-th root'], ['x^{2}', 'Power'], ['x_{i}', 'Index'], ['x_{i}^{2}', 'Index & power'],
      ['\\sum_{i=1}^{n} x_i', 'Sum'], ['\\prod_{i=1}^{n} x_i', 'Product'], ['\\int_{a}^{b} f(x)\\,dx', 'Integral'], ['\\iint_{D} f\\,dA', 'Double integral'], ['\\oint_C', 'Contour integral'],
      ['\\lim_{x \\to \\infty} f(x)', 'Limit'], ['\\frac{d}{dx}', 'Derivative'], ['\\frac{\\partial f}{\\partial x}', 'Partial derivative'], ['\\binom{n}{k}', 'Binomial'],
      ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'Matrix'], ['\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}', 'Cases'], ['\\vec{v}', 'Vector'], ['\\overline{x}', 'Overline'], ['\\left( x \\right)', 'Brackets']]],
    ['Greek', [['\\alpha'], ['\\beta'], ['\\gamma'], ['\\delta'], ['\\epsilon'], ['\\zeta'], ['\\eta'], ['\\theta'], ['\\lambda'], ['\\mu'], ['\\pi'], ['\\rho'], ['\\sigma'], ['\\tau'], ['\\phi'], ['\\chi'], ['\\psi'], ['\\omega'],
      ['\\Gamma'], ['\\Delta'], ['\\Theta'], ['\\Lambda'], ['\\Pi'], ['\\Sigma'], ['\\Phi'], ['\\Psi'], ['\\Omega']]],
    ['Symbols', [['\\pm'], ['\\times'], ['\\div'], ['\\cdot'], ['\\le'], ['\\ge'], ['\\ne'], ['\\approx'], ['\\equiv'], ['\\propto'], ['\\infty'], ['\\to'], ['\\Rightarrow'], ['\\Leftrightarrow'],
      ['\\in'], ['\\notin'], ['\\subset'], ['\\subseteq'], ['\\cup'], ['\\cap'], ['\\emptyset'], ['\\forall'], ['\\exists'], ['\\partial'], ['\\nabla'], ['\\degree'], ['\\angle'], ['\\mathbb{R}'], ['\\mathbb{N}'], ['\\ldots']]],
  ];

  /** Formula editor. onSave(tex, display) */
  function mathDialog(opts) {
    let display = !!opts.display;
    ui.openModal({
      title: E(opts.tex ? 'Edit formula' : 'Insert formula'),
      size: 'lg',
      body: '<form id="math-form" class="form math-dlg">' +
        '<div class="math-dlg__palette">' + MATH_GROUPS.map(([name, items]) =>
          '<div class="math-dlg__group"><span class="label">' + esc(E(name)) + '</span><div class="math-dlg__btns">' + items.map(([tex, label]) =>
            '<button type="button" class="math-btn" data-tex="' + esc(tex) + '" title="' + esc(label ? E(label) : tex) + '">' + texToHTML(tex, false) + '</button>').join('') + '</div></div>').join('') +
        '</div>' +
        '<div class="field"><label for="math-src">LaTeX</label><textarea id="math-src" rows="3" spellcheck="false" class="mono" placeholder="e.g. E = mc^2   or   \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}">' + esc(opts.tex || '') + '</textarea>' +
        '<p class="field__help">' + esc(E('Use LaTeX syntax. Click a symbol above to insert it at the cursor.')) + '</p></div>' +
        '<div class="field"><span class="label">' + esc(E('Preview')) + '</span><div class="math-dlg__preview" id="math-preview" aria-live="polite"></div></div>' +
        '<div class="seg" role="radiogroup" aria-label="' + esc(E('Display')) + '"><button type="button" class="seg__btn" role="radio" data-display="0">' + esc(E('Inline (in the text line)')) + '</button><button type="button" class="seg__btn" role="radio" data-display="1">' + esc(E('Block (own line, centered)')) + '</button></div>' +
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(T4.i18n.t('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="math-form">' + esc(E(opts.tex ? 'Save formula' : 'Insert formula')) + ' <kbd>Ctrl ↵</kbd></button>',
      onMount(m) {
        const src = m.querySelector('#math-src');
        const prev = m.querySelector('#math-preview');
        const segs = m.querySelectorAll('[data-display]');
        const paint = () => {
          prev.innerHTML = texToHTML(src.value, display);
          segs.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.display === (display ? '1' : '0'))));
        };
        const deb = U.debounce(paint, 120);
        src.addEventListener('input', deb);
        segs.forEach((b) => b.addEventListener('click', () => { display = b.dataset.display === '1'; paint(); }));
        m.querySelector('.math-dlg__palette').addEventListener('click', (e) => {
          const b = e.target.closest('.math-btn');
          if (!b) return;
          const t = b.dataset.tex;
          const s = src.selectionStart, en = src.selectionEnd;
          const needsSpace = /\\[a-zA-Z]+$/.test(t) && /^[a-zA-Z]/.test(src.value.slice(en));
          src.setRangeText(t + (needsSpace ? ' ' : ''), s, en, 'end');
          src.focus();
          paint();
        });
        const form = m.querySelector('#math-form');
        form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const tex = src.value.trim();
          if (!tex) { src.focus(); return; }
          ui.closeModal(true);
          opts.onSave(tex, display);
        });
        paint();
        src.focus();
        src.setSelectionRange(src.value.length, src.value.length);
      },
    });
  }

  /** Chart data editor. onSave(props) */
  function chartDialog(opts) {
    const p = JSON.parse(JSON.stringify(opts.props));
    ui.openModal({
      title: E(opts.isNew ? 'Insert chart' : 'Edit chart'),
      size: 'lg',
      body: '<form id="chart-form" class="form chart-dlg">' +
        '<div class="chart-dlg__top">' +
          '<div class="seg" role="radiogroup" aria-label="' + esc(E('Chart type')) + '">' + CHART_TYPES.map(([v, l]) => '<button type="button" class="seg__btn" role="radio" data-ctype="' + v + '">' + esc(E(l)) + '</button>').join('') + '</div>' +
          '<label class="checkbox"><input type="checkbox" id="chart-legend"' + (p.legend ? ' checked' : '') + '><span>' + esc(E('Legend')) + '</span></label>' +
        '</div>' +
        '<div class="field"><label for="chart-title">' + esc(T4.i18n.t('tk.fTitle')) + '</label><input id="chart-title" type="text" maxlength="120" value="' + esc(p.title) + '" placeholder="' + esc(E('Optional')) + '"></div>' +
        '<div class="chart-dlg__grid" id="chart-grid"></div>' +
        '<div class="btn-row"><button type="button" class="btn btn--sm" id="chart-add-row">' + icon('plus') + esc(E('Row')) + '</button><button type="button" class="btn btn--sm" id="chart-add-series">' + icon('plus') + esc(E('Series')) + '</button>' +
          '<span class="muted small" id="chart-hint"></span></div>' +
        '<div class="chart-dlg__preview" id="chart-preview"></div>' +
        '</form>',
      footer: '<button type="button" class="btn btn--ghost" data-action="modal-close">' + esc(T4.i18n.t('c.cancel')) + '</button><button type="submit" class="btn btn--primary" form="chart-form">' + esc(E(opts.isNew ? 'Insert chart' : 'Save chart')) + '</button>',
      onMount(m) {
        const grid = m.querySelector('#chart-grid');
        const preview = m.querySelector('#chart-preview');
        const paintPreview = () => {
          const v = validate('chart', p);
          preview.innerHTML = v ? chartSVG(v) : '';
          m.querySelectorAll('[data-ctype]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ctype === p.type)));
          m.querySelector('#chart-hint').textContent = p.type === 'pie' ? E('Pie charts use the first series only.') : '';
        };
        const paintGrid = () => {
          grid.innerHTML = '<table class="chart-table"><thead><tr><th>' + esc(E('Label')) + '</th>' + p.series.map((s, si) =>
            '<th><div class="chart-table__series"><input type="color" value="' + esc(s.color) + '" data-scolor="' + si + '" aria-label="' + esc(E('Series color')) + '">' +
            '<input type="text" value="' + esc(s.name) + '" data-sname="' + si + '" placeholder="' + esc(E('Series') + ' ' + (si + 1)) + '" aria-label="' + esc(E('Series name')) + '">' +
            (p.series.length > 1 ? '<button type="button" class="icon-btn icon-btn--sm" data-del-series="' + si + '" aria-label="' + esc(E('Remove series')) + '">' + icon('x') + '</button>' : '') + '</div></th>').join('') + '<th></th></tr></thead><tbody>' +
            p.labels.map((l, i) => '<tr><td><input type="text" value="' + esc(l) + '" data-label="' + i + '" aria-label="' + esc(E('Label {n}', { n: i + 1 })) + '"></td>' +
              p.series.map((s, si) => '<td><input type="number" step="any" value="' + s.values[i] + '" data-val="' + si + ':' + i + '" aria-label="' + esc(E('Value')) + '"></td>').join('') +
              '<td>' + (p.labels.length > 1 ? '<button type="button" class="icon-btn icon-btn--sm" data-del-row="' + i + '" aria-label="' + esc(E('Remove row')) + '">' + icon('x') + '</button>' : '') + '</td></tr>').join('') +
            '</tbody></table>';
        };
        grid.addEventListener('input', (e) => {
          const t = e.target;
          if (t.dataset.label != null) p.labels[+t.dataset.label] = t.value;
          else if (t.dataset.sname != null) p.series[+t.dataset.sname].name = t.value;
          else if (t.dataset.scolor != null) p.series[+t.dataset.scolor].color = t.value;
          else if (t.dataset.val) { const [si, i] = t.dataset.val.split(':').map(Number); p.series[si].values[i] = t.value === '' ? 0 : Number(t.value); }
          paintPreview();
        });
        grid.addEventListener('click', (e) => {
          const r = e.target.closest('[data-del-row]'), s = e.target.closest('[data-del-series]');
          if (r) { const i = +r.dataset.delRow; p.labels.splice(i, 1); p.series.forEach((x) => x.values.splice(i, 1)); }
          else if (s) p.series.splice(+s.dataset.delSeries, 1);
          else return;
          paintGrid(); paintPreview();
        });
        m.querySelector('#chart-add-row').addEventListener('click', () => {
          if (p.labels.length >= 40) return;
          p.labels.push('Item ' + (p.labels.length + 1)); p.series.forEach((x) => x.values.push(0));
          paintGrid(); paintPreview();
          const inputs = grid.querySelectorAll('[data-label]'); inputs[inputs.length - 1].select();
        });
        m.querySelector('#chart-add-series').addEventListener('click', () => {
          if (p.series.length >= 8) return;
          p.series.push({ name: 'Series ' + (p.series.length + 1), color: PALETTE[p.series.length % PALETTE.length], values: p.labels.map(() => 0) });
          paintGrid(); paintPreview();
        });
        m.querySelectorAll('[data-ctype]').forEach((b) => b.addEventListener('click', () => { p.type = b.dataset.ctype; paintPreview(); }));
        m.querySelector('#chart-title').addEventListener('input', (e) => { p.title = e.target.value; paintPreview(); });
        m.querySelector('#chart-legend').addEventListener('change', (e) => { p.legend = e.target.checked; paintPreview(); });
        m.querySelector('#chart-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = validate('chart', p);
          if (!v) { ui.toast(E('A chart needs at least one row and one series.'), 'error'); return; }
          ui.closeModal(true);
          opts.onSave(v);
        });
        paintGrid(); paintPreview();
      },
    });
  }

  const defaultChart = (type) => ({
    type: type || 'bar', title: 'Quarterly results', legend: true, w: 100,
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: type === 'pie'
      ? [{ name: 'Share', color: PALETTE[0], values: [35, 25, 22, 18] }]
      : [{ name: 'Revenue', color: PALETTE[0], values: [12, 19, 15, 24] }, { name: 'Costs', color: PALETTE[1], values: [9, 11, 10, 14] }],
  });

  return {
    ensureLibs, validate, create, hydrate, render, getProps, setProps, paintCode, highlight, texToHTML, chartSVG, shapeSVG,
    prepareImage, mathDialog, chartDialog, textDialog, defaultChart,
    drawing: { pointerDown: drawingPointerDown, action: drawingAction, key: drawingKey, select: selectShape, selected: selectedShape, add: addShape },
    set onChange(fn) { changeHandler = fn; },
    CODE_LANGS, SHAPES, CHART_TYPES, PALETTE, DRAW_W,
  };
})();
